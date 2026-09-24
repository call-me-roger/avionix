import { snapshotDataRefNames } from '@/application/compatibility';
import {
  MVP_COMMAND_HEADING_UP,
  MVP_DATAREFS,
  MVP_DATAREF_NAMES,
  OPTIONAL_DATAREF_NAMES,
} from '@/application/mvp-bindings';
import type { PairingTokenStore } from '@/application/pairing-token-store';
import {
  type FailureRef,
  type LastOperation,
  type SessionSnapshot,
  type StepStatus,
  initialDiagnostics,
  initialSnapshot,
} from '@/application/session-snapshot';
import { Store } from '@/application/store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import {
  type XPlaneConnectionConfig,
  createConnectionConfig,
} from '@/domain/connection/connection-config';
import { type ConnectionState, transition } from '@/domain/connection/connection-state';
import type { ConnectorInfo } from '@/domain/connector/connector-info';
import { AvionixError, toAvionixError } from '@/domain/errors/avionix-error';
import type { ConnectStep } from '@/domain/health/failure-explanation';
import { type ApiVersion, negotiateApiVersion } from '@/domain/simulator/api-version';
import type { SimulatorClient, SocketCloseInfo } from '@/domain/simulator/simulator-client';
import type { CommandDescriptor, DataRefDescriptor, DataRefUpdate } from '@/domain/simulator/types';
import type { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import { type AuthProvider, noAuth } from '@/infrastructure/xplane/auth';
import { probeCapabilities } from '@/infrastructure/xplane/capabilities';
import type { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import {
  createCommandRepository,
  createDataRefRepository,
} from '@/infrastructure/xplane/resolution-cache';
import {
  DEFAULT_RECONNECT_POLICY,
  type ReconnectPolicy,
  computeBackoffDelayMs,
} from '@/utils/backoff';

/** Samples kept for the round-trip median in `SessionHealth.roundTripMs`. */
export const ROUND_TRIP_WINDOW = 5;

/** Flat retry interval used while X-Plane is up but has no flight loaded. */
export const READINESS_RETRY_MS = 5000;

export interface Scheduler {
  schedule(callback: () => void, delayMs: number): () => void;
}

export const realScheduler: Scheduler = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

export interface SimulatorSessionDeps {
  createHttpTransport: (config: XPlaneConnectionConfig, auth: AuthProvider) => HttpTransport;
  createClient: (
    config: XPlaneConnectionConfig,
    apiVersion: ApiVersion,
    http: HttpTransport,
    auth: AuthProvider,
  ) => SimulatorClient;
  createConnectorClient: (http: HttpTransport) => ConnectorClient;
  tokenStore: PairingTokenStore;
  scheduler?: Scheduler;
  reconnectPolicy?: ReconnectPolicy;
  random?: () => number;
  logger?: Logger;
  now?: () => number;
}

type FlowMode = 'initial' | 'reconnect';

/**
 * `'ok'`: setup finished and the session is live. `'held'`: parked on `holdForReadiness`,
 * an open socket with a retry armed, not a failure. `'failed'`: everything else, including a
 * stale generation with nothing left to do — always paired with an `isCurrent()` check before
 * a caller derives anything from it, exactly as every generation guard in this file already is.
 */
type FlowResult = 'ok' | 'held' | 'failed';

/** A connect flow parked in `pairing`, waiting for `pair(code)` to resume it. */
interface PendingPairing {
  generation: number;
  config: XPlaneConnectionConfig;
  /** Unauthenticated: `/avionix/pair` is what produces a token, so it cannot need one. */
  connectorHttp: HttpTransport;
}

interface ActiveConnection {
  generation: number;
  config: XPlaneConnectionConfig;
  client: SimulatorClient;
  dataRefsById: Map<number, DataRefDescriptor>;
  dataRefsByName: Map<string, DataRefDescriptor>;
  headingUp: CommandDescriptor;
  unsubscribe: () => void;
}

export class SimulatorSession {
  readonly store: Store<SessionSnapshot>;
  private readonly scheduler: Scheduler;
  private readonly policy: ReconnectPolicy;
  private readonly random: () => number;
  private readonly logger: Logger;
  private readonly now: () => number;
  private generation = 0;
  private active: ActiveConnection | null = null;
  private cancelReconnect: (() => void) | null = null;
  private cancelReadiness: (() => void) | null = null;
  /**
   * The socket a readiness hold is sitting on, while the hold is armed (timer not yet fired).
   * Nothing else holds a reference to this client during that window — `this.active` is still
   * null, since resolution never finished — so `cancelReadinessRetry()` is the only place left
   * that can close it. Cleared (without closing) the moment the timer fires: the retry's own
   * `completeSessionSetup` call then owns the socket the same way any other attempt does.
   */
  private readinessHold: { client: SimulatorClient; unsubscribeClose: () => void } | null = null;
  private token: string | null = null;
  private pendingPairing: PendingPairing | null = null;
  private pairInFlight = false;
  /** Serializes the token store writes so a late clear cannot undo a later pairing. */
  private tokenWrites: Promise<void> = Promise.resolve();
  private roundTrips: number[] = [];

  constructor(private readonly deps: SimulatorSessionDeps) {
    this.policy = deps.reconnectPolicy ?? DEFAULT_RECONNECT_POLICY;
    this.store = new Store(initialSnapshot(GENERIC_PROFILE, this.policy.maxAttempts));
    this.scheduler = deps.scheduler ?? realScheduler;
    this.random = deps.random ?? Math.random;
    this.logger = deps.logger ?? silentLogger;
    this.now = deps.now ?? Date.now;
  }

  async connect(host: string, port: string | number): Promise<void> {
    this.teardown();
    // A fresh connect (possibly to a different host) must not let samples from whatever was
    // measured before contaminate this session's median. An automatic reconnect to the same
    // host never calls connect(), so its samples are deliberately left alone.
    this.roundTrips = [];
    const generation = this.nextGeneration();
    // Any previous state first returns to disconnected, then to connecting; both edges are in the table.
    this.store.setState((prev) => ({
      ...initialSnapshot(GENERIC_PROFILE, this.policy.maxAttempts),
      state: transition(this.settled(prev.state), 'connect'),
    }));
    this.pendingPairing = null;
    this.pairInFlight = false;
    this.token = null;
    let config: XPlaneConnectionConfig;
    try {
      config = createConnectionConfig(host, port);
    } catch (error) {
      this.markFailure(
        toAvionixError(error, { code: 'INVALID_HOST', message: 'Invalid connection settings' }),
        'initial',
        'connector',
      );
      return;
    }
    this.store.setState((prev) => ({ ...prev, config }));
    // Behind the write queue: a clear that is still on its way to storage must not be read
    // back as a live token. Assigned only after the guard below, so a read for a connect that
    // a later connect or a disconnect has superseded never reaches the live session.
    // The write chain never rejects, so this only waits; a storage whose setItem never settles
    // would hold every later connect here (not reachable with AsyncStorage or localStorage).
    await this.tokenWrites;
    const storedToken = await this.deps.tokenStore.get(config.host, config.port);
    if (!this.isCurrent(generation)) {
      return;
    }
    this.token = storedToken;
    await this.runConnectFlow(generation, config, 'initial');
  }

  /**
   * Keeps the last known diagnostics, connector and health facts (F-02 R11): a disconnected
   * session should still show the user what happened and why, not blank out. Telemetry is
   * cleared because those values are genuinely gone the moment the link drops.
   */
  disconnect(): void {
    this.teardown();
    this.nextGeneration();
    this.pendingPairing = null;
    this.pairInFlight = false;
    // The stored token is kept: only the connector revokes it.
    this.token = null;
    // The buffer that fed the departing session's median must not survive to poison whatever
    // is connected to next.
    this.roundTrips = [];
    const endedAt = this.now();
    this.store.setState((prev) => ({
      ...prev,
      state: this.settled(prev.state),
      telemetry: {},
      reconnectAttempt: 0,
      health: {
        ...prev.health,
        nextRetryAt: null,
        readinessRetryAt: null,
        lastEndedAt: endedAt,
        lastEndReason: this.endReasonForDisconnect(prev),
      },
    }));
  }

  /**
   * `markFailure` already recorded `{code, step}` in `lastEndReason` when the live session
   * failed; disconnecting from that same failure (e.g. pressing Disconnect from `error`) must
   * not throw the step away and fall back to the generic no-step advice. Only overwrite with a
   * step-less reason when the code has actually changed — a disconnect from a state that never
   * matched `prev.error` (or has none) — so the specific explanation survives.
   */
  private endReasonForDisconnect(prev: SessionSnapshot): FailureRef | null {
    if (prev.error === null) {
      return prev.health.lastEndReason;
    }
    if (prev.health.lastEndReason?.code === prev.error.code) {
      return prev.health.lastEndReason;
    }
    return { code: prev.error.code, step: null };
  }

  /**
   * Exchanges the six-digit code for a token and resumes the connect flow that parked in
   * `pairing`. Rejects with INTERNAL when the session is not pairing or another pair call is
   * already in flight; every other failure lands in `snapshot.error` and leaves the session
   * in `pairing` so the user can try another code.
   */
  async pair(code: string): Promise<void> {
    const pending = this.pendingPairing;
    if (pending === null || this.pairInFlight || this.store.getSnapshot().state !== 'pairing') {
      throw new AvionixError({
        code: 'INTERNAL',
        message: 'pair() is only available while the session is waiting for a pairing code',
      });
    }
    this.pairInFlight = true;
    const { generation, config, connectorHttp } = pending;
    try {
      const token = await this.deps.createConnectorClient(connectorHttp).pair(code);
      if (!this.isCurrent(generation)) {
        return;
      }
      this.token = token;
      await this.queueTokenWrite(() => this.deps.tokenStore.set(config.host, config.port, token));
      if (!this.isCurrent(generation)) {
        return;
      }
      this.pendingPairing = null;
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'pair'),
        diagnostics: { ...prev.diagnostics, connector: 'paired' },
        error: null,
      }));
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return;
      }
      const avionixError = toAvionixError(error, {
        code: 'UNKNOWN',
        message: 'Pairing failed',
      });
      this.logger.warn('pairing rejected', { code: avionixError.code });
      this.store.setState((prev) => ({ ...prev, error: avionixError }));
      return;
    } finally {
      this.pairInFlight = false;
    }
    // A fresh transport: the rest of the flow is authenticated with the token just issued.
    await this.runSimulatorFlow(
      generation,
      config,
      this.deps.createHttpTransport(config, () => this.token),
      'initial',
    );
  }

  async writeHeading(value: number): Promise<void> {
    if (!Number.isFinite(value) || value < 0 || value > 360) {
      this.recordOperation({
        kind: 'write',
        ok: false,
        message: 'Heading must be between 0 and 360',
        failure: null,
      });
      return;
    }
    const active = this.requireActive('write');
    if (active === null) {
      return;
    }
    const heading = active.dataRefsByName.get(MVP_DATAREFS.heading);
    if (heading === undefined) {
      this.recordOperation({
        kind: 'write',
        ok: false,
        message: 'Heading dataref is not resolved',
        failure: null,
      });
      return;
    }
    try {
      await this.timed(active.generation, () => active.client.setDataRefValue(heading.id, value));
      this.recordOperation({
        kind: 'write',
        ok: true,
        message: `Wrote heading ${value}`,
        failure: null,
      });
    } catch (error) {
      const avionixError = toAvionixError(error, { code: 'WRITE_FAILED', message: 'Write failed' });
      // `message` keeps the raw AvionixError text for the logger only; the UI renders the
      // failure through FailureNotice(code, step), never this string (F-02 R9).
      this.recordOperation({
        kind: 'write',
        ok: false,
        message: avionixError.message,
        failure: { code: avionixError.code, step: 'operation' },
      });
      // Writes go over authenticated HTTP, so this is a place the connector can disown us.
      this.returnToPairingIfUnauthorized(avionixError);
    }
  }

  async activateHeadingUp(): Promise<void> {
    const active = this.requireActive('command');
    if (active === null) {
      return;
    }
    try {
      await this.timed(active.generation, () =>
        active.client.activateCommand(active.headingUp.id, 0),
      );
      this.recordOperation({
        kind: 'command',
        ok: true,
        message: `Activated ${MVP_COMMAND_HEADING_UP}`,
        failure: null,
      });
    } catch (error) {
      const avionixError = toAvionixError(error, {
        code: 'COMMAND_FAILED',
        message: 'Command failed',
      });
      this.recordOperation({
        kind: 'command',
        ok: false,
        message: avionixError.message,
        failure: { code: avionixError.code, step: 'operation' },
      });
      this.returnToPairingIfUnauthorized(avionixError);
    }
  }

  // ---- internals ----------------------------------------------------------

  private nextGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  /**
   * Runs token store writes one after another in the order they were requested. Without this,
   * a `clear` from an UNAUTHORIZED could still be in flight when a later `pair` stores its
   * fresh token and would then wipe it. The returned promise never rejects, so a caller may
   * `void` it; a failing write is logged and the queue carries on.
   */
  private queueTokenWrite(write: () => Promise<void>): Promise<void> {
    const next = this.tokenWrites.then(write, write).catch((error: unknown) => {
      this.logger.debug('token store write failed', { message: String(error) });
    });
    this.tokenWrites = next;
    return next;
  }

  /** Returns `disconnected`, applying the `disconnect` edge when the state is not already there. */
  private settled(state: ConnectionState): ConnectionState {
    return state === 'disconnected' ? state : transition(state, 'disconnect');
  }

  private teardown(): void {
    this.cancelReadinessRetry();
    if (this.cancelReconnect !== null) {
      this.cancelReconnect();
      this.cancelReconnect = null;
    }
    const active = this.active;
    this.active = null;
    if (active !== null) {
      active.unsubscribe();
      active.client.disconnectWebSocket();
    }
  }

  private requireActive(kind: LastOperation['kind']): ActiveConnection | null {
    const active = this.active;
    if (active === null || this.store.getSnapshot().state !== 'connected') {
      this.recordOperation({
        kind,
        ok: false,
        message: 'Avionix is not connected to X-Plane',
        failure: null,
      });
      return null;
    }
    return active;
  }

  private recordOperation(operation: Omit<LastOperation, 'at'>): void {
    this.store.setState((prev) => ({ ...prev, lastOperation: { ...operation, at: this.now() } }));
  }

  /**
   * Times a request the app was going to make anyway; keeps the median of the last few.
   * `generation` is the one this request belongs to, so a sample from a flow the session has
   * already moved on from is discarded instead of making a dead connection look responsive.
   */
  private async timed<T>(generation: number, run: () => Promise<T>): Promise<T> {
    const startedAt = this.now();
    const result = await run();
    this.recordRoundTrip(generation, this.now() - startedAt);
    return result;
  }

  private recordRoundTrip(generation: number, elapsedMs: number): void {
    if (!this.isCurrent(generation)) {
      return;
    }
    this.roundTrips = [...this.roundTrips, Math.max(0, elapsedMs)].slice(-ROUND_TRIP_WINDOW);
    const sorted = [...this.roundTrips].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? null;
    const at = this.now();
    this.store.setState((prev) => ({
      ...prev,
      health: { ...prev.health, roundTripMs: median, roundTripAt: at },
    }));
  }

  private setStep(
    update: (diagnostics: SessionSnapshot['diagnostics']) => SessionSnapshot['diagnostics'],
  ): void {
    this.store.setState((prev) => ({ ...prev, diagnostics: update(prev.diagnostics) }));
  }

  private setDataRefStep(name: string, status: StepStatus): void {
    this.setStep((d) => ({ ...d, dataRefs: { ...d.dataRefs, [name]: status } }));
  }

  /**
   * Records a failure. In `initial` mode the state machine takes the `failed` edge
   * (connecting → error, connected → error). In `reconnect` mode the state stays
   * `reconnecting`; `runReconnectAttempt` decides whether to retry or exhaust. `step`
   * names where in the flow it failed, so the explanation shown to the user can be specific.
   */
  private markFailure(error: AvionixError, mode: FlowMode, step: ConnectStep | null = null): void {
    if (this.returnToPairingIfUnauthorized(error)) {
      return;
    }
    this.logger.warn('session failure', { code: error.code, message: error.message, mode });
    const endedAt = this.now();
    this.store.setState((prev) => ({
      ...prev,
      state: mode === 'initial' ? transition(prev.state, 'failed') : prev.state,
      error,
      health: {
        ...prev.health,
        lastEndedAt: endedAt,
        lastEndReason: { code: error.code, step },
      },
    }));
  }

  /**
   * Sends the session back to `pairing` when an authenticated request was rejected, and
   * reports whether it did. Only the three states that carry the `pairingRequired` edge are
   * eligible: a session that is already `pairing`, `disconnected` or in `error` has nothing
   * live to interrupt. A target that is not a known connector is not eligible either — there
   * is no code to enter, so the failure belongs in `error` where the user can see it.
   */
  private returnToPairingIfUnauthorized(error: AvionixError): boolean {
    const { state, connector } = this.store.getSnapshot();
    if (
      error.code !== 'UNAUTHORIZED' ||
      connector === null ||
      (state !== 'connecting' && state !== 'reconnecting' && state !== 'connected')
    ) {
      return false;
    }
    this.handleUnauthorized(error);
    return true;
  }

  /**
   * The connector no longer accepts the token we hold (it was restarted with its token file
   * deleted, or the token expired). Forget it, stop retrying — a retry would fail the same
   * way — and park in `pairing` so the user can enter a fresh code. `snapshot.connector` is
   * kept so the UI can still name the connector.
   */
  private handleUnauthorized(error: AvionixError): void {
    const idleStep: StepStatus = 'idle';
    this.logger.warn('the connector rejected this device, pairing again');
    this.teardown();
    const generation = this.nextGeneration();
    const config = this.store.getSnapshot().config;
    this.token = null;
    this.pendingPairing =
      config === null
        ? null
        : {
            generation,
            config,
            connectorHttp: this.deps.createHttpTransport(config, noAuth),
          };
    if (config !== null) {
      // Queued rather than awaited so the transition below stays synchronous; the queue is
      // what guarantees a pair() that follows writes its token after this clear, not before.
      void this.queueTokenWrite(() => this.deps.tokenStore.clear(config.host, config.port));
    }
    this.store.setState((prev) => ({
      ...prev,
      state: transition(prev.state, 'pairingRequired'),
      // What the connector told us over HTTP still holds; everything the revoked session had
      // running does not, so nothing reads as connected next to a pairing prompt.
      diagnostics: {
        ...prev.diagnostics,
        connector: 'pairing',
        websocket: 'idle',
        command: 'idle',
        subscription: 'idle',
        dataRefs: Object.fromEntries(
          Object.keys(prev.diagnostics.dataRefs).map((name) => [name, idleStep]),
        ),
      },
      reconnectAttempt: 0,
      error,
    }));
  }

  private async runConnectFlow(
    generation: number,
    config: XPlaneConnectionConfig,
    mode: FlowMode,
  ): Promise<FlowResult> {
    // Only the initial connect probes: a reconnect reuses the verdict already in the snapshot,
    // and a connector that has forgotten this device surfaces as UNAUTHORIZED instead. The
    // probe runs unauthenticated — until it answers we do not know whether the host is the
    // connector the token belongs to, and a token must never be offered to a stranger.
    if (mode === 'initial') {
      const probeHttp = this.deps.createHttpTransport(config, noAuth);
      if (!(await this.runConnectorProbe(generation, config, probeHttp))) {
        return 'failed';
      }
    }
    return this.runSimulatorFlow(
      generation,
      config,
      this.deps.createHttpTransport(config, () => this.token),
      mode,
    );
  }

  /**
   * Returns true when the flow may continue. Returns false when the session parked in
   * `pairing` or when the probe itself failed (an unreachable or blocked host).
   */
  private async runConnectorProbe(
    generation: number,
    config: XPlaneConnectionConfig,
    probeHttp: HttpTransport,
  ): Promise<boolean> {
    this.setStep((d) => ({ ...d, connector: 'pending' }));
    let info: ConnectorInfo | null;
    try {
      info = await this.deps.createConnectorClient(probeHttp).getInfo();
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return false;
      }
      // The probe is the session's first HTTP request, so its failure is the same news as a
      // failed capabilities call: the target could not be reached or refused us.
      this.setStep((d) => ({
        ...d,
        connector: 'idle',
        http: 'failed',
        capabilities: 'failed',
      }));
      this.markFailure(
        toAvionixError(error, { code: 'NETWORK_ERROR', message: 'Connector probe failed' }),
        'initial',
        'connector',
      );
      return false;
    }
    if (!this.isCurrent(generation)) {
      return false;
    }
    if (info === null) {
      // Plain X-Plane: forget any token stored for this host:port, in memory and in storage.
      // X-Plane would ignore the header, but the WebSocket URL would carry the token in its
      // `?token=` query, where it reaches logs and proxies for nothing.
      this.token = null;
      void this.queueTokenWrite(() => this.deps.tokenStore.clear(config.host, config.port));
      this.setStep((d) => ({ ...d, connector: 'direct' }));
      return true;
    }
    const connectorInfo = info;
    this.store.setState((prev) => ({ ...prev, connector: connectorInfo }));
    if (connectorInfo.pairingRequired && this.token === null) {
      this.pendingPairing = { generation, config, connectorHttp: probeHttp };
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'pairingRequired'),
        diagnostics: { ...prev.diagnostics, connector: 'pairing' },
        error: null,
      }));
      this.logger.info('connector requires pairing', { name: connectorInfo.name });
      return false;
    }
    this.setStep((d) => ({ ...d, connector: 'paired' }));
    return true;
  }

  /**
   * Capabilities → version → WebSocket → resolution → subscription. Returns true on success.
   * In `initial` mode the state becomes `connected` as soon as the socket is open (later steps
   * are visible in diagnostics). In `reconnect` mode it becomes `connected` only when the whole
   * flow has succeeded.
   */
  private async runSimulatorFlow(
    generation: number,
    config: XPlaneConnectionConfig,
    http: HttpTransport,
    mode: FlowMode,
  ): Promise<FlowResult> {
    this.setStep((d) => ({ ...d, http: 'pending', capabilities: 'pending' }));
    let apiVersion: ApiVersion;
    try {
      const capabilities = await this.timed(generation, () => probeCapabilities(http));
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
      apiVersion = negotiateApiVersion(capabilities);
      this.store.setState((prev) => ({
        ...prev,
        capabilities,
        apiVersion,
        diagnostics: { ...prev.diagnostics, http: 'ok', capabilities: 'ok' },
      }));
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
      const avionixError = toAvionixError(error, {
        code: 'UNKNOWN',
        message: 'Capabilities check failed',
      });
      const httpStatus: StepStatus = avionixError.code === 'UNSUPPORTED_API' ? 'ok' : 'failed';
      this.setStep((d) => ({ ...d, http: httpStatus, capabilities: 'failed' }));
      this.markFailure(avionixError, mode, 'capabilities');
      return 'failed';
    }

    const client = this.deps.createClient(config, apiVersion, http, () => this.token);
    this.setStep((d) => ({ ...d, websocket: 'pending' }));
    let unsubscribeClose: () => void;
    try {
      await client.connectWebSocket();
      if (!this.isCurrent(generation)) {
        client.disconnectWebSocket();
        return 'failed';
      }
      this.setStep((d) => ({ ...d, websocket: 'ok' }));
      // Registered as soon as the socket is open so a loss during DataRef/command
      // resolution (below) is still observed and can drive a reconnect instead of
      // being missed until the next explicit socket interaction.
      unsubscribeClose = client.onSocketClosed((info) => {
        if (this.isCurrent(generation)) {
          this.handleSocketClosed(info);
        }
      });
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
      this.setStep((d) => ({ ...d, websocket: 'failed' }));
      this.markFailure(
        toAvionixError(error, { code: 'WEBSOCKET_ERROR', message: 'WebSocket connection failed' }),
        mode,
        'websocket',
      );
      return 'failed';
    }

    if (mode === 'initial') {
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'connected'),
        error: null,
      }));
    }

    return this.completeSessionSetup(generation, config, client, unsubscribeClose, mode);
  }

  /**
   * Everything that happens on an already-open socket: resolve names, attach the update
   * listener, subscribe. Separate from runSimulatorFlow so it can be retried on the same
   * socket when X-Plane has no flight loaded yet.
   */
  private async completeSessionSetup(
    generation: number,
    config: XPlaneConnectionConfig,
    client: SimulatorClient,
    unsubscribeClose: () => void,
    mode: FlowMode,
  ): Promise<FlowResult> {
    const dataRefs = createDataRefRepository(client);
    const commands = createCommandRepository(client);
    const dataRefsById = new Map<number, DataRefDescriptor>();
    const dataRefsByName = new Map<string, DataRefDescriptor>();
    for (const name of MVP_DATAREF_NAMES) {
      this.setDataRefStep(name, 'pending');
    }
    let headingUp: CommandDescriptor;
    try {
      const resolved = await Promise.all(
        MVP_DATAREF_NAMES.map(async (name) => {
          try {
            const descriptor = await dataRefs.resolve(name);
            if (this.isCurrent(generation)) {
              this.setDataRefStep(name, 'ok');
            }
            return descriptor;
          } catch (error) {
            if (this.isCurrent(generation)) {
              this.setDataRefStep(name, 'failed');
            }
            throw error;
          }
        }),
      );
      if (!this.isCurrent(generation)) {
        unsubscribeClose();
        client.disconnectWebSocket();
        return 'failed';
      }
      for (const descriptor of resolved) {
        dataRefsById.set(descriptor.id, descriptor);
        dataRefsByName.set(descriptor.name, descriptor);
      }
      this.setStep((d) => ({ ...d, command: 'pending' }));
      headingUp = await commands.resolve(MVP_COMMAND_HEADING_UP);
      if (!this.isCurrent(generation)) {
        unsubscribeClose();
        client.disconnectWebSocket();
        return 'failed';
      }
      this.setStep((d) => ({ ...d, command: 'ok' }));
    } catch (error) {
      if (!this.isCurrent(generation)) {
        unsubscribeClose();
        client.disconnectWebSocket();
        return 'failed';
      }
      // command only reaches 'pending' once the DataRefs resolved; a DataRef failure
      // rejects Promise.all before the command lookup ever runs, so command stays 'idle'.
      this.setStep((d) => ({ ...d, command: d.command === 'pending' ? 'failed' : d.command }));
      const resolutionError = toAvionixError(error, {
        code: 'DATAREF_NOT_FOUND',
        message: 'Resolution failed',
      });
      const explained = await this.explainLookupMiss(client, resolutionError);
      if (!this.isCurrent(generation)) {
        unsubscribeClose();
        client.disconnectWebSocket();
        return 'failed';
      }
      if (explained.code === 'SIMULATOR_NOT_READY') {
        this.holdForReadiness(generation, config, client, unsubscribeClose, mode, explained);
        return 'held';
      }
      unsubscribeClose();
      client.disconnectWebSocket();
      this.markFailure(explained, mode, 'resolution');
      return 'failed';
    }

    // Optional names must never fail the connect: a miss is recorded and left out of the
    // subscription instead of throwing. Guarded throughout: `dataRefs.resolve` yields, and a
    // disconnect() or fresh connect() landing here must not write diagnostics for a
    // superseded generation.
    const optional: DataRefDescriptor[] = [];
    for (const name of OPTIONAL_DATAREF_NAMES) {
      if (!this.isCurrent(generation)) {
        break;
      }
      this.setDataRefStep(name, 'pending');
      try {
        const descriptor = await dataRefs.resolve(name);
        if (this.isCurrent(generation)) {
          optional.push(descriptor);
          this.setDataRefStep(name, 'ok');
        }
      } catch {
        if (this.isCurrent(generation)) {
          this.setDataRefStep(name, 'failed');
        }
        this.logger.debug('optional dataref missing', { name });
      }
    }
    for (const descriptor of optional) {
      dataRefsById.set(descriptor.id, descriptor);
      dataRefsByName.set(descriptor.name, descriptor);
    }
    // Required resolution and the optional loop above both yield; a disconnect() or fresh
    // connect() landing anywhere in that stretch must not install this.active for a
    // generation that is no longer live, or its socket would never be torn down.
    if (!this.isCurrent(generation)) {
      unsubscribeClose();
      client.disconnectWebSocket();
      return 'failed';
    }

    const unsubscribeUpdates = client.onDataRefUpdate((updates) => {
      if (this.isCurrent(generation)) {
        this.applyUpdates(dataRefsById, updates);
      }
    });
    this.active = {
      generation,
      config,
      client,
      dataRefsById,
      dataRefsByName,
      headingUp,
      unsubscribe: () => {
        unsubscribeUpdates();
        unsubscribeClose();
      },
    };

    this.setStep((d) => ({ ...d, subscription: 'pending' }));
    try {
      await this.timed(generation, () =>
        client.subscribeDataRefs([...dataRefsById.keys()].map((id) => ({ id }))),
      );
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
      this.setStep((d) => ({ ...d, subscription: 'ok' }));
      this.store.setState((prev) => ({
        ...prev,
        // A readiness hold during a reconnect already took reconnecting → connected, so this
        // retry's success finds the state already `connected`; only take the edge when it
        // has not been taken yet, or a repeat 'connected' event would be illegal.
        state:
          mode === 'reconnect' && prev.state !== 'connected'
            ? transition(prev.state, 'connected')
            : prev.state,
        reconnectAttempt: 0,
        error: null,
        health: {
          ...prev.health,
          flightLoaded: true,
          lastConnectedAt: this.now(),
          readinessRetryAt: null,
          // A session that reconnected did not end: clear whatever failure a prior attempt
          // stamped here, or a healthy disconnect later would report that stale reason.
          lastEndReason: null,
        },
      }));
      this.logger.info('session connected', {
        host: config.host,
        port: config.port,
        apiVersion: this.store.getSnapshot().apiVersion,
        mode,
      });
      return 'ok';
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
      this.setStep((d) => ({ ...d, subscription: 'failed' }));
      this.teardown();
      this.markFailure(
        toAvionixError(error, { code: 'SUBSCRIPTION_FAILED', message: 'Subscription failed' }),
        mode,
        'subscription',
      );
      return 'failed';
    }
  }

  /**
   * X-Plane is up and the socket is open, but no flight is loaded, so no DataRef exists to
   * resolve. The link is genuinely healthy: stay connected, say what is happening, and retry
   * resolution on a flat interval until the pilot starts a flight. This is not the reconnect
   * backoff, which governs a socket that is actually gone, and it has no attempt budget.
   */
  private holdForReadiness(
    generation: number,
    config: XPlaneConnectionConfig,
    client: SimulatorClient,
    unsubscribeClose: () => void,
    mode: FlowMode,
    error: AvionixError,
  ): void {
    const at = this.now() + READINESS_RETRY_MS;
    this.store.setState((prev) => ({
      ...prev,
      // The socket is open, so a reconnect that lands on the main menu is connected too.
      state: prev.state === 'reconnecting' ? transition(prev.state, 'connected') : prev.state,
      error,
      reconnectAttempt: 0,
      health: { ...prev.health, flightLoaded: false, readinessRetryAt: at, nextRetryAt: null },
    }));
    this.readinessHold = { client, unsubscribeClose };
    this.cancelReadiness = this.scheduler.schedule(() => {
      this.cancelReadiness = null;
      // The retry is starting now: it owns the socket from here the same way any other
      // completeSessionSetup call does, via its own isCurrent() guards. Not "cancelled" —
      // cancelReadinessRetry() must not also close it once it is running.
      this.readinessHold = null;
      if (!this.isCurrent(generation)) {
        unsubscribeClose();
        client.disconnectWebSocket();
        return;
      }
      this.completeSessionSetup(generation, config, client, unsubscribeClose, mode)
        .then((result) => {
          if (result !== 'failed' || mode !== 'reconnect' || !this.isCurrent(generation)) {
            return;
          }
          // completeSessionSetup() already ran markFailure(), but in `reconnect` mode that
          // leaves state at prev.state — 'connected', because the hold took that edge
          // earlier — instead of arming a new backoff. Without this, a genuine failure here
          // (not another SIMULATOR_NOT_READY) would report a healthy connection over a
          // socket completeSessionSetup has already closed. Recover exactly as a real socket
          // loss would: back to `reconnecting`, backoff restarted at attempt 1.
          this.store.setState((prev) => ({
            ...prev,
            state: transition(prev.state, 'socketLost'),
            diagnostics: { ...prev.diagnostics, websocket: 'failed', subscription: 'idle' },
          }));
          this.scheduleReconnect(generation, 1);
        })
        .catch((thrown: unknown) => {
          // transition() throws AvionixError on an illegal edge; this timer has no other
          // caller to receive it, so a bug here must not become an unhandled rejection.
          this.logger.warn('readiness retry failed unexpectedly', { message: String(thrown) });
        });
    }, READINESS_RETRY_MS);
  }

  /**
   * Cancels a pending readiness retry, closing the socket it was holding open if the hold was
   * still armed. `teardown()` and `handleSocketClosed()` both call this: while a hold is armed,
   * `this.active` is null (resolution never finished), so this is the only place left that can
   * close that socket. Idempotent — safe to call when nothing is armed, and safe to call twice
   * for the same close (e.g. `handleSocketClosed` firing synchronously from the
   * `disconnectWebSocket()` call below, after `unsubscribeClose()` has already run).
   */
  private cancelReadinessRetry(): void {
    if (this.cancelReadiness !== null) {
      this.cancelReadiness();
      this.cancelReadiness = null;
    }
    if (this.readinessHold !== null) {
      const { client, unsubscribeClose } = this.readinessHold;
      this.readinessHold = null;
      unsubscribeClose();
      client.disconnectWebSocket();
    }
    this.store.setState((prev) =>
      prev.health.readinessRetryAt === null
        ? prev
        : { ...prev, health: { ...prev.health, readinessRetryAt: null } },
    );
  }

  /**
   * A name lookup miss usually means X-Plane has not registered any DataRefs yet
   * (main menu, flight still loading). Turn that case into SIMULATOR_NOT_READY so the
   * user is told to load a flight instead of chasing a "missing" DataRef.
   */
  private async explainLookupMiss(
    client: SimulatorClient,
    error: AvionixError,
  ): Promise<AvionixError> {
    if (error.code !== 'DATAREF_NOT_FOUND' && error.code !== 'COMMAND_NOT_FOUND') {
      return error;
    }
    let count: number;
    try {
      count = await client.getDataRefCount();
    } catch (countError) {
      this.logger.debug('dataref count check failed', { message: String(countError) });
      return error;
    }
    if (count > 0) {
      return error;
    }
    return new AvionixError({
      code: 'SIMULATOR_NOT_READY',
      message:
        'X-Plane has no DataRefs registered yet (count is 0). Load a flight in X-Plane, ' +
        'then connect again.',
      retryable: true,
      cause: error,
    });
  }

  private applyUpdates(
    dataRefsById: Map<number, DataRefDescriptor>,
    updates: DataRefUpdate[],
  ): void {
    this.store.setState((prev) => {
      const telemetry = { ...prev.telemetry };
      let health = prev.health;
      let changed = false;
      for (const update of updates) {
        const descriptor = dataRefsById.get(update.id);
        if (descriptor === undefined) {
          continue;
        }
        telemetry[descriptor.name] = { value: update.value, receivedAt: update.receivedAt };
        changed = true;
        // Only a *changed* value counts as a heartbeat: a paused simulator that re-sends
        // the same number must not read as live.
        if (
          descriptor.name === MVP_DATAREFS.heartbeat &&
          typeof update.value === 'number' &&
          update.value !== health.lastHeartbeatValue
        ) {
          health = {
            ...health,
            lastHeartbeatValue: update.value,
            lastHeartbeatAt: update.receivedAt,
          };
        }
      }
      return changed ? { ...prev, telemetry, health } : prev;
    });
  }

  private handleSocketClosed(info: SocketCloseInfo): void {
    this.cancelReadinessRetry();
    if (info.initiatedByClient || this.store.getSnapshot().state !== 'connected') {
      return;
    }
    this.logger.warn('socket lost', { code: info.code, reason: info.reason });
    const active = this.active;
    this.active = null;
    active?.unsubscribe();
    // Bump the generation before touching state: this supersedes the connect flow that was
    // still in flight (e.g. awaiting subscribeDataRefs) so its eventual rejection sees
    // isCurrent() = false and bails out instead of running markFailure() against the
    // `reconnecting` state it now finds itself in.
    const next = this.nextGeneration();
    this.store.setState((prev) => ({
      ...prev,
      state: transition(prev.state, 'socketLost'),
      diagnostics: { ...prev.diagnostics, websocket: 'failed', subscription: 'idle' },
    }));
    this.scheduleReconnect(next, 1);
  }

  private scheduleReconnect(previousGeneration: number, attempt: number): void {
    const config = this.store.getSnapshot().config;
    if (config === null) {
      return;
    }
    const delayMs = computeBackoffDelayMs(attempt, this.policy, this.random);
    this.store.setState((prev) => ({
      ...prev,
      reconnectAttempt: attempt,
      health: { ...prev.health, nextRetryAt: this.now() + delayMs },
    }));
    this.logger.info('scheduling reconnect', { attempt, delayMs });
    this.cancelReconnect = this.scheduler.schedule(() => {
      this.cancelReconnect = null;
      if (!this.isCurrent(previousGeneration)) {
        return;
      }
      const generation = this.nextGeneration();
      this.store.setState((prev) => ({
        ...prev,
        diagnostics: {
          ...initialDiagnostics(snapshotDataRefNames(GENERIC_PROFILE)),
          connector: prev.connector === null ? 'direct' : 'paired',
        },
        telemetry: {},
      }));
      void this.runReconnectAttempt(generation, config, attempt);
    }, delayMs);
  }

  private async runReconnectAttempt(
    generation: number,
    config: XPlaneConnectionConfig,
    attempt: number,
  ): Promise<void> {
    const result = await this.runConnectFlow(generation, config, 'reconnect');
    // 'held' means completeSessionSetup() parked in the readiness hold: the reconnecting →
    // connected edge already ran there, so this is not a failure to retry.
    if (result !== 'failed' || !this.isCurrent(generation)) {
      return;
    }
    if (attempt >= this.policy.maxAttempts) {
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'retryExhausted'),
        error:
          prev.error ??
          new AvionixError({
            code: 'WEBSOCKET_ERROR',
            message: 'Reconnect attempts exhausted',
            retryable: true,
          }),
      }));
      return;
    }
    this.scheduleReconnect(generation, attempt + 1);
  }
}
