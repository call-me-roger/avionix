import {
  MVP_COMMAND_HEADING_UP,
  MVP_DATAREFS,
  MVP_DATAREF_NAMES,
} from '@/application/mvp-bindings';
import type { PairingTokenStore } from '@/application/pairing-token-store';
import {
  type LastOperation,
  type SessionSnapshot,
  type StepStatus,
  initialDiagnostics,
  initialSnapshot,
} from '@/application/session-snapshot';
import { Store } from '@/application/store';
import {
  type XPlaneConnectionConfig,
  createConnectionConfig,
} from '@/domain/connection/connection-config';
import { type ConnectionState, transition } from '@/domain/connection/connection-state';
import type { ConnectorInfo } from '@/domain/connector/connector-info';
import { AvionixError, toAvionixError } from '@/domain/errors/avionix-error';
import { type ApiVersion, negotiateApiVersion } from '@/domain/simulator/api-version';
import type { SimulatorClient, SocketCloseInfo } from '@/domain/simulator/simulator-client';
import type { CommandDescriptor, DataRefDescriptor, DataRefUpdate } from '@/domain/simulator/types';
import type { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import type { AuthProvider } from '@/infrastructure/xplane/auth';
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

/** A connect flow parked in `pairing`, waiting for `pair(code)` to resume it. */
interface PendingPairing {
  generation: number;
  config: XPlaneConnectionConfig;
  http: HttpTransport;
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
  private token: string | null = null;
  private pendingPairing: PendingPairing | null = null;
  private pairInFlight = false;
  /** Serializes the token store writes so a late clear cannot undo a later pairing. */
  private tokenWrites: Promise<void> = Promise.resolve();

  constructor(private readonly deps: SimulatorSessionDeps) {
    this.store = new Store(initialSnapshot(MVP_DATAREF_NAMES));
    this.scheduler = deps.scheduler ?? realScheduler;
    this.policy = deps.reconnectPolicy ?? DEFAULT_RECONNECT_POLICY;
    this.random = deps.random ?? Math.random;
    this.logger = deps.logger ?? silentLogger;
    this.now = deps.now ?? Date.now;
  }

  async connect(host: string, port: string | number): Promise<void> {
    this.teardown();
    const generation = this.nextGeneration();
    // Any previous state first returns to disconnected, then to connecting; both edges are in the table.
    this.store.setState((prev) => ({
      ...initialSnapshot(MVP_DATAREF_NAMES),
      state: transition(this.settled(prev.state), 'connect'),
    }));
    this.pendingPairing = null;
    this.token = null;
    let config: XPlaneConnectionConfig;
    try {
      config = createConnectionConfig(host, port);
    } catch (error) {
      this.markFailure(
        toAvionixError(error, { code: 'INVALID_HOST', message: 'Invalid connection settings' }),
        'initial',
      );
      return;
    }
    this.store.setState((prev) => ({ ...prev, config }));
    // Assigned only after the guard: a read for a connect that a later connect or a
    // disconnect has superseded must never publish its token into the live session.
    const storedToken = await this.deps.tokenStore.get(config.host, config.port);
    if (!this.isCurrent(generation)) {
      return;
    }
    this.token = storedToken;
    await this.runConnectFlow(generation, config, 'initial');
  }

  disconnect(): void {
    this.teardown();
    this.nextGeneration();
    this.pendingPairing = null;
    // The stored token is kept: only the connector revokes it.
    this.token = null;
    this.store.setState((prev) => ({
      ...prev,
      state: this.settled(prev.state),
      connector: null,
      diagnostics: initialDiagnostics(MVP_DATAREF_NAMES),
      telemetry: {},
      reconnectAttempt: 0,
      error: null,
    }));
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
    const { generation, config, http } = pending;
    try {
      const token = await this.deps.createConnectorClient(http).pair(code);
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
    await this.runSimulatorFlow(generation, config, http, 'initial');
  }

  async writeHeading(value: number): Promise<void> {
    if (!Number.isFinite(value) || value < 0 || value > 360) {
      this.recordOperation({
        kind: 'write',
        ok: false,
        message: 'Heading must be between 0 and 360',
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
      });
      return;
    }
    try {
      await active.client.setDataRefValue(heading.id, value);
      this.recordOperation({ kind: 'write', ok: true, message: `Wrote heading ${value}` });
    } catch (error) {
      const avionixError = toAvionixError(error, { code: 'WRITE_FAILED', message: 'Write failed' });
      this.recordOperation({ kind: 'write', ok: false, message: avionixError.message });
    }
  }

  async activateHeadingUp(): Promise<void> {
    const active = this.requireActive('command');
    if (active === null) {
      return;
    }
    try {
      await active.client.activateCommand(active.headingUp.id, 0);
      this.recordOperation({
        kind: 'command',
        ok: true,
        message: `Activated ${MVP_COMMAND_HEADING_UP}`,
      });
    } catch (error) {
      const avionixError = toAvionixError(error, {
        code: 'COMMAND_FAILED',
        message: 'Command failed',
      });
      this.recordOperation({ kind: 'command', ok: false, message: avionixError.message });
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
      this.recordOperation({ kind, ok: false, message: 'Avionix is not connected to X-Plane' });
      return null;
    }
    return active;
  }

  private recordOperation(operation: Omit<LastOperation, 'at'>): void {
    this.store.setState((prev) => ({ ...prev, lastOperation: { ...operation, at: this.now() } }));
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
   * `reconnecting`; `runReconnectAttempt` decides whether to retry or exhaust.
   */
  private markFailure(error: AvionixError, mode: FlowMode): void {
    const state = this.store.getSnapshot().state;
    if (error.code === 'UNAUTHORIZED' && (state === 'connecting' || state === 'reconnecting')) {
      this.handleUnauthorized(error);
      return;
    }
    this.logger.warn('session failure', { code: error.code, message: error.message, mode });
    this.store.setState((prev) => ({
      ...prev,
      state: mode === 'initial' ? transition(prev.state, 'failed') : prev.state,
      error,
    }));
  }

  /**
   * The connector no longer accepts the token we hold (it was restarted with its token file
   * deleted, or the token expired). Forget it, stop retrying — a retry would fail the same
   * way — and park in `pairing` so the user can enter a fresh code. `snapshot.connector` is
   * kept so the UI can still name the connector.
   */
  private handleUnauthorized(error: AvionixError): void {
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
            http: this.deps.createHttpTransport(config, () => this.token),
          };
    if (config !== null) {
      // Queued rather than awaited so the transition below stays synchronous; the queue is
      // what guarantees a pair() that follows writes its token after this clear, not before.
      void this.queueTokenWrite(() => this.deps.tokenStore.clear(config.host, config.port));
    }
    this.store.setState((prev) => ({
      ...prev,
      state: transition(prev.state, 'pairingRequired'),
      diagnostics: { ...prev.diagnostics, connector: 'pairing' },
      reconnectAttempt: 0,
      error,
    }));
  }

  private async runConnectFlow(
    generation: number,
    config: XPlaneConnectionConfig,
    mode: FlowMode,
  ): Promise<boolean> {
    const http = this.deps.createHttpTransport(config, () => this.token);
    // Only the initial connect probes: a reconnect reuses the verdict already in the snapshot,
    // and a connector that has forgotten this device surfaces as UNAUTHORIZED instead.
    if (mode === 'initial' && !(await this.runConnectorProbe(generation, config, http))) {
      return false;
    }
    return this.runSimulatorFlow(generation, config, http, mode);
  }

  /**
   * Returns true when the flow may continue. Returns false when the session parked in
   * `pairing` or when the probe itself failed (an unreachable or blocked host).
   */
  private async runConnectorProbe(
    generation: number,
    config: XPlaneConnectionConfig,
    http: HttpTransport,
  ): Promise<boolean> {
    this.setStep((d) => ({ ...d, connector: 'pending' }));
    let info: ConnectorInfo | null;
    try {
      info = await this.deps.createConnectorClient(http).getInfo();
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
      );
      return false;
    }
    if (!this.isCurrent(generation)) {
      return false;
    }
    if (info === null) {
      // Plain X-Plane: forget any token stored for this host:port so it is never sent on.
      // X-Plane would ignore the header, but the WebSocket URL would carry the token in its
      // `?token=` query, where it reaches logs and proxies for nothing.
      this.token = null;
      this.setStep((d) => ({ ...d, connector: 'direct' }));
      return true;
    }
    const connectorInfo = info;
    this.store.setState((prev) => ({ ...prev, connector: connectorInfo }));
    if (connectorInfo.pairingRequired && this.token === null) {
      this.pendingPairing = { generation, config, http };
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
  ): Promise<boolean> {
    this.setStep((d) => ({ ...d, http: 'pending', capabilities: 'pending' }));
    let apiVersion: ApiVersion;
    try {
      const capabilities = await probeCapabilities(http);
      if (!this.isCurrent(generation)) {
        return false;
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
        return false;
      }
      const avionixError = toAvionixError(error, {
        code: 'UNKNOWN',
        message: 'Capabilities check failed',
      });
      const httpStatus: StepStatus = avionixError.code === 'UNSUPPORTED_API' ? 'ok' : 'failed';
      this.setStep((d) => ({ ...d, http: httpStatus, capabilities: 'failed' }));
      this.markFailure(avionixError, mode);
      return false;
    }

    const client = this.deps.createClient(config, apiVersion, http, () => this.token);
    this.setStep((d) => ({ ...d, websocket: 'pending' }));
    let unsubscribeClose: () => void;
    try {
      await client.connectWebSocket();
      if (!this.isCurrent(generation)) {
        client.disconnectWebSocket();
        return false;
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
        return false;
      }
      this.setStep((d) => ({ ...d, websocket: 'failed' }));
      this.markFailure(
        toAvionixError(error, { code: 'WEBSOCKET_ERROR', message: 'WebSocket connection failed' }),
        mode,
      );
      return false;
    }

    if (mode === 'initial') {
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'connected'),
        error: null,
      }));
    }

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
      for (const descriptor of resolved) {
        dataRefsById.set(descriptor.id, descriptor);
        dataRefsByName.set(descriptor.name, descriptor);
      }
      this.setStep((d) => ({ ...d, command: 'pending' }));
      headingUp = await commands.resolve(MVP_COMMAND_HEADING_UP);
      if (!this.isCurrent(generation)) {
        unsubscribeClose();
        client.disconnectWebSocket();
        return false;
      }
      this.setStep((d) => ({ ...d, command: 'ok' }));
    } catch (error) {
      unsubscribeClose();
      client.disconnectWebSocket();
      if (!this.isCurrent(generation)) {
        return false;
      }
      // command only reaches 'pending' once the DataRefs resolved; a DataRef failure
      // rejects Promise.all before the command lookup ever runs, so command stays 'idle'.
      this.setStep((d) => ({ ...d, command: d.command === 'pending' ? 'failed' : d.command }));
      const resolutionError = toAvionixError(error, {
        code: 'DATAREF_NOT_FOUND',
        message: 'Resolution failed',
      });
      this.markFailure(await this.explainLookupMiss(client, resolutionError), mode);
      return false;
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
      await client.subscribeDataRefs([...dataRefsById.keys()].map((id) => ({ id })));
      if (!this.isCurrent(generation)) {
        return false;
      }
      this.setStep((d) => ({ ...d, subscription: 'ok' }));
      this.store.setState((prev) => ({
        ...prev,
        state: mode === 'reconnect' ? transition(prev.state, 'connected') : prev.state,
        reconnectAttempt: 0,
        error: null,
      }));
      this.logger.info('session connected', {
        host: config.host,
        port: config.port,
        apiVersion,
        mode,
      });
      return true;
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return false;
      }
      this.setStep((d) => ({ ...d, subscription: 'failed' }));
      this.teardown();
      this.markFailure(
        toAvionixError(error, { code: 'SUBSCRIPTION_FAILED', message: 'Subscription failed' }),
        mode,
      );
      return false;
    }
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
      let changed = false;
      for (const update of updates) {
        const descriptor = dataRefsById.get(update.id);
        if (descriptor === undefined) {
          continue;
        }
        telemetry[descriptor.name] = { value: update.value, receivedAt: update.receivedAt };
        changed = true;
      }
      return changed ? { ...prev, telemetry } : prev;
    });
  }

  private handleSocketClosed(info: SocketCloseInfo): void {
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
    this.store.setState((prev) => ({ ...prev, reconnectAttempt: attempt }));
    const delayMs = computeBackoffDelayMs(attempt, this.policy, this.random);
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
          ...initialDiagnostics(MVP_DATAREF_NAMES),
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
    const ok = await this.runConnectFlow(generation, config, 'reconnect');
    if (ok || !this.isCurrent(generation)) {
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
