import {
  MVP_COMMAND_HEADING_UP,
  MVP_DATAREFS,
  MVP_DATAREF_NAMES,
} from '@/application/mvp-bindings';
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
import { AvionixError, toAvionixError } from '@/domain/errors/avionix-error';
import { type ApiVersion, negotiateApiVersion } from '@/domain/simulator/api-version';
import type { SimulatorClient, SocketCloseInfo } from '@/domain/simulator/simulator-client';
import type { CommandDescriptor, DataRefDescriptor, DataRefUpdate } from '@/domain/simulator/types';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
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
  createHttpTransport: (config: XPlaneConnectionConfig) => HttpTransport;
  createClient: (
    config: XPlaneConnectionConfig,
    apiVersion: ApiVersion,
    http: HttpTransport,
  ) => SimulatorClient;
  scheduler?: Scheduler;
  reconnectPolicy?: ReconnectPolicy;
  random?: () => number;
  logger?: Logger;
  now?: () => number;
}

type FlowMode = 'initial' | 'reconnect';

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
    await this.runConnectFlow(generation, config, 'initial');
  }

  disconnect(): void {
    this.teardown();
    this.nextGeneration();
    this.store.setState((prev) => ({
      ...prev,
      state: this.settled(prev.state),
      diagnostics: initialDiagnostics(MVP_DATAREF_NAMES),
      telemetry: {},
      reconnectAttempt: 0,
      error: null,
    }));
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
    this.logger.warn('session failure', { code: error.code, message: error.message, mode });
    this.store.setState((prev) => ({
      ...prev,
      state: mode === 'initial' ? transition(prev.state, 'failed') : prev.state,
      error,
    }));
  }

  /**
   * Runs the full connect flow: capabilities → version → WebSocket → resolution → subscription.
   * Returns true on success. In `initial` mode the state becomes `connected` as soon as the
   * socket is open (later steps are visible in diagnostics). In `reconnect` mode the state
   * becomes `connected` only when the whole flow has succeeded.
   */
  private async runConnectFlow(
    generation: number,
    config: XPlaneConnectionConfig,
    mode: FlowMode,
  ): Promise<boolean> {
    const http = this.deps.createHttpTransport(config);

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

    const client = this.deps.createClient(config, apiVersion, http);
    this.setStep((d) => ({ ...d, websocket: 'pending' }));
    try {
      await client.connectWebSocket();
      if (!this.isCurrent(generation)) {
        client.disconnectWebSocket();
        return false;
      }
      this.setStep((d) => ({ ...d, websocket: 'ok' }));
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
    this.setStep((d) => ({ ...d, command: 'pending' }));
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
      headingUp = await commands.resolve(MVP_COMMAND_HEADING_UP);
      if (!this.isCurrent(generation)) {
        client.disconnectWebSocket();
        return false;
      }
      this.setStep((d) => ({ ...d, command: 'ok' }));
    } catch (error) {
      client.disconnectWebSocket();
      if (!this.isCurrent(generation)) {
        return false;
      }
      this.setStep((d) => ({ ...d, command: d.command === 'ok' ? 'ok' : 'failed' }));
      this.markFailure(
        toAvionixError(error, { code: 'DATAREF_NOT_FOUND', message: 'Resolution failed' }),
        mode,
      );
      return false;
    }

    const unsubscribeUpdates = client.onDataRefUpdate((updates) => {
      if (this.isCurrent(generation)) {
        this.applyUpdates(dataRefsById, updates);
      }
    });
    const unsubscribeClose = client.onSocketClosed((info) => {
      if (this.isCurrent(generation)) {
        this.handleSocketClosed(generation, info);
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

  private handleSocketClosed(generation: number, info: SocketCloseInfo): void {
    if (info.initiatedByClient || this.store.getSnapshot().state !== 'connected') {
      return;
    }
    this.logger.warn('socket lost', { code: info.code, reason: info.reason });
    const active = this.active;
    this.active = null;
    active?.unsubscribe();
    this.store.setState((prev) => ({
      ...prev,
      state: transition(prev.state, 'socketLost'),
      diagnostics: { ...prev.diagnostics, websocket: 'failed', subscription: 'idle' },
    }));
    this.scheduleReconnect(generation, 1);
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
        diagnostics: initialDiagnostics(MVP_DATAREF_NAMES),
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
