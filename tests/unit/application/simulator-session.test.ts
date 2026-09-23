import { MVP_COMMAND_HEADING_UP, MVP_DATAREFS } from '@/application/mvp-bindings';
import type { PairingTokenStore } from '@/application/pairing-token-store';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  type Scheduler,
  SimulatorSession,
  type SimulatorSessionDeps,
} from '@/application/simulator-session';
import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError } from '@/domain/errors/avionix-error';
import type { SimulatorClient, SocketCloseInfo } from '@/domain/simulator/simulator-client';
import type { DataRefUpdate, SimulatorCapabilities } from '@/domain/simulator/types';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import type {
  SocketCloseEvent,
  SocketMessageEvent,
  WebSocketLike,
} from '@/infrastructure/xplane/websocket/websocket-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';

const caps: SimulatorCapabilities = {
  simulatorVersion: '12.4.0',
  supportedApiVersions: ['v1', 'v2', 'v3'],
  rawApiVersions: ['v1', 'v2', 'v3'],
};

class FakeClient implements SimulatorClient {
  updateListeners = new Set<(updates: DataRefUpdate[]) => void>();
  closeListeners = new Set<(info: SocketCloseInfo) => void>();
  subscribed: number[] = [];
  writes: Array<{ id: number; value: unknown }> = [];
  activations: number[] = [];
  connectError: AvionixError | null = null;
  subscribeError: AvionixError | null = null;
  missingDataRef: string | null = null;
  socketOpen = false;

  findDataRef = jest.fn(async (name: string) => {
    if (name === this.missingDataRef) {
      return null;
    }
    const ids: Record<string, number> = {
      [MVP_DATAREFS.heartbeat]: 1,
      [MVP_DATAREFS.airspeed]: 2,
      [MVP_DATAREFS.heading]: 3,
      ['sim/time/paused']: 4,
    };
    const id = ids[name];
    return id === undefined ? null : { id, name, valueType: 'float' as const };
  });

  findCommand = jest.fn(async (name: string) =>
    name === MVP_COMMAND_HEADING_UP ? { id: 9, name, description: 'up' } : null,
  );

  getDataRefValue = jest.fn(async () => 0);

  dataRefCount = 3;

  getDataRefCount = jest.fn(async () => this.dataRefCount);

  setDataRefValue = jest.fn(async (id: number, value: unknown) => {
    this.writes.push({ id, value });
  });

  activateCommand = jest.fn(async (id: number) => {
    this.activations.push(id);
  });

  connectWebSocket = jest.fn(async () => {
    if (this.connectError !== null) {
      throw this.connectError;
    }
    this.socketOpen = true;
  });

  subscribeDataRefs = jest.fn(async (subs: Array<{ id: number }>) => {
    if (this.subscribeError !== null) {
      throw this.subscribeError;
    }
    this.subscribed.push(...subs.map((s) => s.id));
  });

  unsubscribeDataRefs = jest.fn(async () => undefined);

  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void) {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  onSocketClosed(listener: (info: SocketCloseInfo) => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  disconnectWebSocket = jest.fn(() => {
    if (!this.socketOpen) {
      return;
    }
    this.socketOpen = false;
    this.emitClose({ code: 1000, reason: '', wasClean: true, initiatedByClient: true });
  });

  emitUpdates(updates: DataRefUpdate[]): void {
    for (const listener of this.updateListeners) {
      listener(updates);
    }
  }

  emitClose(info: SocketCloseInfo): void {
    for (const listener of this.closeListeners) {
      listener(info);
    }
  }
}

/** Opens as soon as it is created, which is all the connector-token tests need from it. */
class FakeSocket implements WebSocketLike {
  readyState = 1;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: SocketCloseEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: SocketMessageEvent) => void) | null = null;
  send(): void {}
  close(): void {
    this.onclose?.({ code: 1000, reason: '', wasClean: true });
  }
}

class ManualScheduler implements Scheduler {
  queue: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];
  schedule(callback: () => void, delayMs: number): () => void {
    const entry = { callback, delayMs, cancelled: false };
    this.queue.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }
  async runNext(): Promise<void> {
    const entry = this.queue.shift();
    if (entry !== undefined && !entry.cancelled) {
      entry.callback();
    }
    await flush();
  }
}

// Drains the microtask queue. The connect flow awaits the token store and the connector
// probe before the simulator flow starts, so this needs enough turns to reach the
// subscription step.
async function flush(): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    await Promise.resolve();
  }
}

interface Route {
  status: number;
  body: string;
}

/**
 * Wraps a real token store so a `get` or a `clear` can be held open, which is how the tests
 * below reproduce a storage read or write that lands after the session has moved on.
 */
class ControllableTokenStore implements PairingTokenStore {
  readonly pendingGets: Array<() => void> = [];
  readonly pendingClears: Array<() => void> = [];
  deferGet = false;
  deferClear = false;

  constructor(private readonly inner: PairingTokenStore) {}

  async get(host: string, port: number): Promise<string | null> {
    if (this.deferGet) {
      await new Promise<void>((resolve) => this.pendingGets.push(resolve));
    }
    return this.inner.get(host, port);
  }

  set(host: string, port: number, token: string): Promise<void> {
    return this.inner.set(host, port, token);
  }

  async clear(host: string, port: number): Promise<void> {
    if (this.deferClear) {
      await new Promise<void>((resolve) => this.pendingClears.push(resolve));
    }
    return this.inner.clear(host, port);
  }
}

function setup(
  options: {
    capsError?: AvionixError;
    clients?: FakeClient[];
    routes?: Record<string, Route | Route[]>;
    tokenStore?: PairingTokenStore;
    createClient?: SimulatorSessionDeps['createClient'];
    holdPaths?: string[];
    now?: () => number;
  } = {},
) {
  const clients = options.clients ?? [new FakeClient()];
  let clientIndex = 0;
  const scheduler = new ManualScheduler();
  const capsError = options.capsError;
  const routes = options.routes ?? {};
  const requestedPaths: string[] = [];
  const storage = createMemorySettingsStorage();
  const tokenStore = options.tokenStore ?? createPairingTokenStore(storage);
  const sentTokens: (string | undefined)[] = [];
  const holdPaths = options.holdPaths ?? [];
  // Requests to a held path park here until the test calls release(path).
  const held = new Map<string, Array<() => void>>();
  const release = (path: string): void => {
    held.get(path)?.shift()?.();
  };
  const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
    const path = url.slice(url.indexOf('/', 'http://'.length));
    requestedPaths.push(path);
    sentTokens.push(init.headers.Authorization);
    if (holdPaths.includes(path)) {
      await new Promise<void>((resolve) => {
        const queue = held.get(path) ?? [];
        queue.push(resolve);
        held.set(path, queue);
      });
    }
    const route = routes[path];
    const next = Array.isArray(route) ? route.shift() : route;
    if (next !== undefined) {
      return {
        status: next.status,
        ok: next.status >= 200 && next.status < 300,
        text: async () => next.body,
      };
    }
    if (path === '/avionix/info') {
      // No connector: the probe must fall through to the plain X-Plane flow.
      return { status: 404, ok: false, text: async () => 'Not Found' };
    }
    if (capsError !== undefined) {
      throw capsError;
    }
    return {
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          api: { versions: caps.rawApiVersions },
          'x-plane': { version: caps.simulatorVersion },
        }),
    };
  };
  const session = new SimulatorSession({
    createHttpTransport: (config: XPlaneConnectionConfig, auth) =>
      new HttpTransport({
        origin: `http://${config.host}:${config.port}`,
        fetchImpl,
        auth,
        logger: silentLogger,
      }),
    createClient:
      options.createClient ??
      (() => {
        const client = clients[Math.min(clientIndex, clients.length - 1)];
        clientIndex += 1;
        if (client === undefined) {
          throw new Error('no fake client');
        }
        return client;
      }),
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore,
    scheduler,
    random: () => 0.5,
    logger: silentLogger,
    now: options.now ?? (() => 1234),
  });
  return {
    session,
    scheduler,
    clients,
    storage,
    tokenStore,
    requestedPaths,
    sentTokens,
    release,
    snapshot: () => session.store.getSnapshot(),
  };
}

describe('SimulatorSession connect flow', () => {
  it('goes disconnected → connecting → connected, resolves MVP datarefs and subscribes', async () => {
    const { session, clients, snapshot } = setup();
    const states: string[] = [];
    session.store.subscribe(() => states.push(snapshot().state));
    await session.connect('192.168.1.100', '8086');
    expect(states).toContain('connecting');
    expect(snapshot()).toMatchObject({
      state: 'connected',
      apiVersion: 'v3',
      capabilities: caps,
      config: { host: '192.168.1.100', port: 8086 },
      error: null,
      diagnostics: {
        http: 'ok',
        capabilities: 'ok',
        websocket: 'ok',
        command: 'ok',
        subscription: 'ok',
        dataRefs: {
          [MVP_DATAREFS.heartbeat]: 'ok',
          [MVP_DATAREFS.airspeed]: 'ok',
          [MVP_DATAREFS.heading]: 'ok',
          // The optional dataref resolves too by default and is subscribed alongside the
          // required ones (id 4 below).
          'sim/time/paused': 'ok',
        },
      },
    });
    expect(clients[0]?.subscribed.sort()).toEqual([1, 2, 3, 4]);
  });

  it('rejects an invalid host without touching the network', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('http://bad', '8086');
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('INVALID_HOST');
    expect(clients[0]?.connectWebSocket).not.toHaveBeenCalled();
  });

  it('rejects an invalid port', async () => {
    const { session, snapshot } = setup();
    await session.connect('192.168.1.100', '99999');
    expect(snapshot().error?.code).toBe('INVALID_PORT');
  });

  it('marks http failed when capabilities cannot be fetched', async () => {
    const { session, snapshot } = setup({
      capsError: new AvionixError({ code: 'NETWORK_ERROR', message: 'down' }),
    });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('NETWORK_ERROR');
    expect(snapshot().diagnostics.http).toBe('failed');
    expect(snapshot().diagnostics.capabilities).toBe('failed');
  });

  it('marks websocket failed when the socket cannot open', async () => {
    const client = new FakeClient();
    client.connectError = new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'refused' });
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('WEBSOCKET_ERROR');
    expect(snapshot().diagnostics.websocket).toBe('failed');
  });

  it('marks a missing dataref failed and reports DATAREF_NOT_FOUND', async () => {
    const client = new FakeClient();
    client.missingDataRef = MVP_DATAREFS.airspeed;
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('DATAREF_NOT_FOUND');
    expect(snapshot().diagnostics.dataRefs[MVP_DATAREFS.airspeed]).toBe('failed');
    expect(snapshot().diagnostics.dataRefs[MVP_DATAREFS.heartbeat]).toBe('ok');
    expect(snapshot().diagnostics.command).toBe('idle');
  });

  it('reports SIMULATOR_NOT_READY when a dataref is missing and X-Plane has no datarefs, holding the link open', async () => {
    const client = new FakeClient();
    client.missingDataRef = MVP_DATAREFS.heartbeat;
    client.dataRefCount = 0;
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    // Task 5: SIMULATOR_NOT_READY no longer fails the connect. The socket is genuinely
    // healthy, so the session stays connected and retries resolution instead.
    expect(snapshot().state).toBe('connected');
    expect(snapshot().error?.code).toBe('SIMULATOR_NOT_READY');
    expect(snapshot().error?.message).toContain('Load a flight');
    expect(snapshot().error?.retryable).toBe(true);
    expect(snapshot().diagnostics.dataRefs[MVP_DATAREFS.heartbeat]).toBe('failed');
    expect(snapshot().health.readinessRetryAt).not.toBeNull();
    expect(client.socketOpen).toBe(true);
  });

  it('keeps DATAREF_NOT_FOUND when the count check itself fails', async () => {
    const client = new FakeClient();
    client.missingDataRef = MVP_DATAREFS.heartbeat;
    client.getDataRefCount.mockRejectedValueOnce(new Error('network'));
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().error?.code).toBe('DATAREF_NOT_FOUND');
  });

  it('marks subscription failed', async () => {
    const client = new FakeClient();
    client.subscribeError = new AvionixError({ code: 'SUBSCRIPTION_FAILED', message: 'no' });
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().diagnostics.subscription).toBe('failed');
  });

  it('updates telemetry keyed by dataref name', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.emitUpdates([
      { id: 1, value: 42.5, receivedAt: 5 },
      { id: 3, value: 270, receivedAt: 5 },
      { id: 777, value: 1, receivedAt: 5 },
    ]);
    expect(snapshot().telemetry).toEqual({
      [MVP_DATAREFS.heartbeat]: { value: 42.5, receivedAt: 5 },
      [MVP_DATAREFS.heading]: { value: 270, receivedAt: 5 },
    });
  });

  it('disconnect closes the socket, clears telemetry and returns to disconnected', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.emitUpdates([{ id: 1, value: 1, receivedAt: 1 }]);
    session.disconnect();
    expect(clients[0]?.disconnectWebSocket).toHaveBeenCalled();
    expect(snapshot().state).toBe('disconnected');
    expect(snapshot().telemetry).toEqual({});
    expect(snapshot().reconnectAttempt).toBe(0);
  });

  it('a second connect after error works', async () => {
    const client = new FakeClient();
    client.connectError = new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'refused' });
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    client.connectError = null;
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('connected');
  });
});

describe('SimulatorSession operations', () => {
  it('writes the heading and records success', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.writeHeading(95);
    expect(clients[0]?.writes).toEqual([{ id: 3, value: 95 }]);
    expect(snapshot().lastOperation).toEqual({
      kind: 'write',
      ok: true,
      message: 'Wrote heading 95',
      at: 1234,
    });
  });

  it('rejects headings outside 0..360 without calling the client', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.writeHeading(400);
    expect(clients[0]?.writes).toEqual([]);
    expect(snapshot().lastOperation?.ok).toBe(false);
  });

  it('records a failed write', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.setDataRefValue.mockRejectedValueOnce(
      new AvionixError({
        code: 'WRITE_FAILED',
        message: 'read only',
        simulatorErrorCode: 'dataref_is_readonly',
      }),
    );
    await session.writeHeading(10);
    expect(snapshot().lastOperation).toMatchObject({
      kind: 'write',
      ok: false,
      message: expect.stringContaining('read only'),
    });
    expect(snapshot().state).toBe('connected');
  });

  it('activates the heading-up command', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.activateHeadingUp();
    expect(clients[0]?.activations).toEqual([9]);
    expect(snapshot().lastOperation).toMatchObject({ kind: 'command', ok: true });
  });

  it('refuses operations while not connected', async () => {
    const { session, snapshot } = setup();
    await session.writeHeading(10);
    expect(snapshot().lastOperation).toMatchObject({
      ok: false,
      message: expect.stringContaining('not connected'),
    });
  });
});

describe('SimulatorSession reconnect', () => {
  it('moves to reconnecting on unexpected close, backs off and reconnects', async () => {
    const first = new FakeClient();
    const second = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [first, second] });
    await session.connect('192.168.1.100', 8086);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    expect(snapshot().state).toBe('reconnecting');
    expect(snapshot().reconnectAttempt).toBe(1);
    expect(scheduler.queue[0]?.delayMs).toBe(1000);
    await scheduler.runNext();
    expect(snapshot().state).toBe('connected');
    expect(snapshot().reconnectAttempt).toBe(0);
    expect(second.subscribed.sort()).toEqual([1, 2, 3, 4]);
  });

  it('gives up after maxAttempts with retryExhausted → error', async () => {
    const first = new FakeClient();
    const failing = new FakeClient();
    failing.connectError = new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'refused' });
    const { session, scheduler, snapshot } = setup({ clients: [first, failing] });
    await session.connect('192.168.1.100', 8086);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    const delays: number[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(snapshot().state).toBe('reconnecting');
      expect(snapshot().reconnectAttempt).toBe(attempt);
      delays.push(scheduler.queue[0]?.delayMs ?? -1);
      await scheduler.runNext();
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('WEBSOCKET_ERROR');
  });

  it('explicit disconnect during reconnecting cancels the timer', async () => {
    const first = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [first, new FakeClient()] });
    await session.connect('192.168.1.100', 8086);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    session.disconnect();
    expect(snapshot().state).toBe('disconnected');
    expect(scheduler.queue[0]?.cancelled).toBe(true);
    await scheduler.runNext();
    expect(snapshot().state).toBe('disconnected');
  });

  it('ignores a close initiated by the client', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.emitClose({ code: 1000, reason: '', wasClean: true, initiatedByClient: true });
    expect(snapshot().state).toBe('connected');
  });

  it('socket loss while the initial subscription is pending starts a reconnect instead of failing', async () => {
    const client = new FakeClient();
    let rejectSubscribe!: (e: Error) => void;
    client.subscribeDataRefs = jest.fn(
      (_subs: Array<{ id: number }>) =>
        new Promise<void>((_, reject) => {
          rejectSubscribe = reject;
        }),
    );
    const second = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [client, second] });

    const connecting = session.connect('192.168.1.100', 8086);
    await flush();

    client.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    rejectSubscribe(new AvionixError({ code: 'CANCELLED', message: 'closed' }));
    await expect(connecting).resolves.toBeUndefined();

    expect(snapshot().state).toBe('reconnecting');
    expect(snapshot().reconnectAttempt).toBe(1);
    expect(scheduler.queue.length).toBe(1);
    expect(scheduler.queue[0]?.cancelled).toBe(false);

    await scheduler.runNext();
    expect(snapshot().state).toBe('connected');
  });

  it('socket loss while dataref resolution is pending starts a reconnect', async () => {
    const client = new FakeClient();
    // findDataRef is called once per MVP DataRef name (all issued synchronously by
    // Promise.all before any microtask runs), so each call gets its own controllable
    // promise; releasing all of them together simulates resolution finally settling.
    const resolvers: Array<() => void> = [];
    client.findDataRef = jest.fn(
      (name: string) =>
        new Promise((resolve) => {
          const id = resolvers.length + 1;
          resolvers.push(() => resolve({ id, name, valueType: 'float' as const }));
        }),
    );
    const releaseDataRefs = (): void => {
      for (const resolve of resolvers) {
        resolve();
      }
    };
    const second = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [client, second] });

    const connecting = session.connect('192.168.1.100', 8086);
    await flush();

    client.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    releaseDataRefs();
    await connecting;

    expect(snapshot().state).toBe('reconnecting');
    expect(snapshot().reconnectAttempt).toBe(1);
    expect(scheduler.queue.filter((entry) => !entry.cancelled).length).toBe(1);
    expect(client.disconnectWebSocket).toHaveBeenCalled();

    await scheduler.runNext();
    expect(snapshot().state).toBe('connected');
  });
});

const CONNECTOR_INFO = JSON.stringify({
  name: 'Sim PC',
  version: '0.1.0',
  pairingRequired: true,
  xplane: { host: '127.0.0.1', port: 8086, reachable: true },
});

const OPEN_CONNECTOR_INFO = JSON.stringify({
  name: 'Sim PC',
  version: '0.1.0',
  pairingRequired: false,
  xplane: { host: '127.0.0.1', port: 8086, reachable: true },
});

describe('SimulatorSession pairing', () => {
  it('stops in pairing when a connector needs a code and no token is stored', async () => {
    const { session, snapshot } = setup({
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error).toBeNull();
    expect(snapshot().connector).toEqual({
      name: 'Sim PC',
      version: '0.1.0',
      pairingRequired: true,
      xplane: { host: '127.0.0.1', port: 8086, reachable: true },
    });
    expect(snapshot().diagnostics.connector).toBe('pairing');
    expect(snapshot().diagnostics.capabilities).toBe('idle');
  });

  it('pair stores the token, resumes the connect flow and sends the bearer header', async () => {
    const { session, snapshot, tokenStore, sentTokens } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/avionix/pair': { status: 200, body: '{"token":"tok-xyz"}' },
      },
    });
    await session.connect('192.168.1.100', 8080);
    await session.pair('123456');
    expect(snapshot().state).toBe('connected');
    expect(snapshot().diagnostics.connector).toBe('paired');
    expect(snapshot().error).toBeNull();
    await expect(tokenStore.get('192.168.1.100', 8080)).resolves.toBe('tok-xyz');
    expect(sentTokens).toContain('Bearer tok-xyz');
  });

  it('a wrong code keeps the session in pairing and reports PAIRING_FAILED', async () => {
    const { session, snapshot } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/avionix/pair': [
          {
            status: 401,
            body: '{"error_code":"pairing_invalid_code","error_message":"Wrong pairing code"}',
          },
          { status: 200, body: '{"token":"tok-ok"}' },
        ],
      },
    });
    await session.connect('192.168.1.100', 8080);
    await session.pair('000000');
    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error?.code).toBe('PAIRING_FAILED');
    await session.pair('123456');
    expect(snapshot().state).toBe('connected');
    expect(snapshot().error).toBeNull();
  });

  it('rejects pair outside the pairing state with INTERNAL', async () => {
    const { session } = setup();
    await expect(session.pair('123456')).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('rejects a concurrent pair call with INTERNAL', async () => {
    const { session } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/avionix/pair': { status: 200, body: '{"token":"tok-xyz"}' },
      },
    });
    await session.connect('192.168.1.100', 8080);
    const first = session.pair('123456');
    await expect(session.pair('123456')).rejects.toMatchObject({ code: 'INTERNAL' });
    await first;
  });

  it('skips pairing when the stored token is reused', async () => {
    const { session, snapshot, tokenStore, requestedPaths } = setup({
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });
    await tokenStore.set('192.168.1.100', 8080, 'tok-stored');
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('connected');
    expect(snapshot().diagnostics.connector).toBe('paired');
    expect(requestedPaths).not.toContain('/avionix/pair');
  });

  it('connects straight through a connector that does not require pairing', async () => {
    const { session, snapshot } = setup({
      routes: { '/avionix/info': { status: 200, body: OPEN_CONNECTOR_INFO } },
    });
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('connected');
    expect(snapshot().diagnostics.connector).toBe('paired');
    expect(snapshot().connector?.pairingRequired).toBe(false);
  });

  it('marks the connector step direct when the target is plain X-Plane', async () => {
    const { session, snapshot } = setup();
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('connected');
    expect(snapshot().diagnostics.connector).toBe('direct');
    expect(snapshot().connector).toBeNull();
  });

  it('clears the token and returns to pairing when the connector rejects it', async () => {
    const { session, snapshot, tokenStore } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/api/capabilities': {
          status: 401,
          body: '{"error_code":"unauthorized","error_message":"Pair again"}',
        },
      },
    });
    await tokenStore.set('192.168.1.100', 8080, 'tok-stale');
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error?.code).toBe('UNAUTHORIZED');
    expect(snapshot().connector?.name).toBe('Sim PC');
    await expect(tokenStore.get('192.168.1.100', 8080)).resolves.toBeNull();
  });

  it('disconnect from pairing returns to disconnected and keeps the last known connector', async () => {
    const { session, snapshot, tokenStore } = setup({
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    session.disconnect();
    expect(snapshot().state).toBe('disconnected');
    // disconnect() deliberately stops clearing diagnostics and connector (F-02 R11): the last
    // known state survives so the user can still see what happened and why.
    expect(snapshot().connector).toEqual({
      name: 'Sim PC',
      version: '0.1.0',
      pairingRequired: true,
      xplane: { host: '127.0.0.1', port: 8086, reachable: true },
    });
    expect(snapshot().diagnostics.connector).toBe('pairing');
    // The stored token (none here) is deliberately kept across a disconnect.
    await expect(tokenStore.get('192.168.1.100', 8080)).resolves.toBeNull();
    await expect(session.pair('123456')).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('SimulatorSession token lifetime', () => {
  /**
   * Walks a token read that resolves only after the session has moved on: the live connect
   * reads its own (absent) token first and parks on the held probe, then the superseded read
   * lands. The late value must never reach the live session, so the capabilities request that
   * follows the probe must carry no Authorization header.
   */
  async function raceLateTokenRead(supersede: (session: SimulatorSession) => void) {
    const inner = createPairingTokenStore(createMemorySettingsStorage());
    await inner.set('192.168.1.100', 8080, 'tok-stale');
    const store = new ControllableTokenStore(inner);
    const fixture = setup({ tokenStore: store, holdPaths: ['/avionix/info'] });
    store.deferGet = true;
    const first = fixture.session.connect('192.168.1.100', 8080);
    supersede(fixture.session);
    const second = fixture.session.connect('192.168.1.101', 8080);
    await flush();
    expect(store.pendingGets.length).toBe(2);
    store.pendingGets[1]?.();
    await flush();
    store.pendingGets[0]?.();
    await flush();
    fixture.release('/avionix/info');
    await flush();
    await Promise.all([first, second]);
    return fixture;
  }

  it('drops a token read belonging to a connect that a later connect superseded', async () => {
    const { snapshot, requestedPaths, sentTokens } = await raceLateTokenRead(() => undefined);
    const capsIndex = requestedPaths.indexOf('/api/capabilities');
    expect(capsIndex).toBeGreaterThan(-1);
    expect(sentTokens[capsIndex]).toBeUndefined();
    expect(sentTokens).not.toContain('Bearer tok-stale');
    expect(snapshot().state).toBe('connected');
  });

  it('drops a token read that lands after a disconnect', async () => {
    const { snapshot, requestedPaths, sentTokens } = await raceLateTokenRead((session) => {
      session.disconnect();
    });
    const capsIndex = requestedPaths.indexOf('/api/capabilities');
    expect(capsIndex).toBeGreaterThan(-1);
    expect(sentTokens[capsIndex]).toBeUndefined();
    expect(snapshot().state).toBe('connected');
  });

  it('keeps the token from a later pairing when an earlier clear resolves late', async () => {
    const inner = createPairingTokenStore(createMemorySettingsStorage());
    await inner.set('192.168.1.100', 8080, 'tok-stale');
    const store = new ControllableTokenStore(inner);
    const { session, snapshot } = setup({
      tokenStore: store,
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/api/capabilities': [
          {
            status: 401,
            body: '{"error_code":"unauthorized","error_message":"Pair again"}',
          },
        ],
        '/avionix/pair': { status: 200, body: '{"token":"tok-fresh"}' },
      },
    });
    store.deferClear = true;
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    await flush();
    expect(store.pendingClears.length).toBe(1);

    const pairing = session.pair('123456');
    await flush();
    // The clear only reaches the storage now, after the fresh token was handed to the store.
    store.pendingClears[0]?.();
    await pairing;

    expect(snapshot().state).toBe('connected');
    await expect(inner.get('192.168.1.100', 8080)).resolves.toBe('tok-fresh');
  });
});

describe('SimulatorSession on a plain X-Plane host', () => {
  it('forgets a stored connector token once the probe says the target is X-Plane', async () => {
    const inner = createPairingTokenStore(createMemorySettingsStorage());
    await inner.set('192.168.1.100', 8080, 'tok-stale');
    const socketUrls: string[] = [];
    const socket = new FakeSocket();
    const { session, snapshot, requestedPaths, sentTokens } = setup({
      tokenStore: inner,
      createClient: (config, apiVersion, http, auth) =>
        new XPlaneClient({
          config,
          apiVersion,
          http,
          auth,
          createSocket: (url: string) => {
            socketUrls.push(url);
            queueMicrotask(() => socket.onopen?.({}));
            return socket;
          },
          logger: silentLogger,
        }),
    });

    await session.connect('192.168.1.100', 8080);

    expect(snapshot().diagnostics.connector).toBe('direct');
    // The probe runs unauthenticated: until it answers we do not know who is listening.
    expect(sentTokens[requestedPaths.indexOf('/avionix/info')]).toBeUndefined();
    // Everything after the verdict is unauthenticated too, the socket URL included.
    expect(sentTokens[requestedPaths.indexOf('/api/capabilities')]).toBeUndefined();
    expect(socketUrls).toEqual(['ws://192.168.1.100:8080/api/v3']);
    // And the stale token is dropped from storage, not just from memory.
    await expect(inner.get('192.168.1.100', 8080)).resolves.toBeNull();
  });

  it('keeps the probe unauthenticated but authenticates everything after it', async () => {
    const inner = createPairingTokenStore(createMemorySettingsStorage());
    await inner.set('192.168.1.100', 8080, 'tok-stored');
    const { session, snapshot, requestedPaths, sentTokens } = setup({
      tokenStore: inner,
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });

    await session.connect('192.168.1.100', 8080);

    expect(snapshot().state).toBe('connected');
    expect(sentTokens[requestedPaths.indexOf('/avionix/info')]).toBeUndefined();
    expect(sentTokens[requestedPaths.indexOf('/api/capabilities')]).toBe('Bearer tok-stored');
  });
});

describe('SimulatorSession when the token dies mid-session', () => {
  async function connectedToConnector(client: FakeClient) {
    const inner = createPairingTokenStore(createMemorySettingsStorage());
    await inner.set('192.168.1.100', 8080, 'tok-live');
    const fixture = setup({
      tokenStore: inner,
      clients: [client],
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });
    return { ...fixture, inner };
  }

  const unauthorized = () =>
    new AvionixError({ code: 'UNAUTHORIZED', message: 'Pair this device again' });

  it('returns to pairing when dataref resolution is rejected after connecting', async () => {
    const client = new FakeClient();
    client.findDataRef = jest.fn(async (_name: string) => {
      throw unauthorized();
    });
    const { session, snapshot, inner } = await connectedToConnector(client);

    await session.connect('192.168.1.100', 8080);

    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error?.code).toBe('UNAUTHORIZED');
    expect(snapshot().connector?.name).toBe('Sim PC');
    await expect(inner.get('192.168.1.100', 8080)).resolves.toBeNull();
  });

  it('returns to pairing when a heading write is rejected', async () => {
    const client = new FakeClient();
    client.setDataRefValue = jest.fn(async (_id: number, _value: unknown) => {
      throw unauthorized();
    });
    const { session, snapshot, inner } = await connectedToConnector(client);
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('connected');

    await session.writeHeading(180);

    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error?.code).toBe('UNAUTHORIZED');
    expect(snapshot().lastOperation).toMatchObject({ kind: 'write', ok: false });
    await expect(inner.get('192.168.1.100', 8080)).resolves.toBeNull();
  });

  it('clears the live diagnostics so nothing still reads as connected', async () => {
    const client = new FakeClient();
    client.setDataRefValue = jest.fn(async (_id: number, _value: unknown) => {
      throw unauthorized();
    });
    const { session, snapshot } = await connectedToConnector(client);
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().diagnostics.websocket).toBe('ok');

    await session.writeHeading(180);

    expect(snapshot().state).toBe('pairing');
    expect(snapshot().diagnostics).toMatchObject({
      connector: 'pairing',
      // What the connector already told us stays; what the revoked session had does not.
      http: 'ok',
      capabilities: 'ok',
      websocket: 'idle',
      command: 'idle',
      subscription: 'idle',
    });
    expect(Object.values(snapshot().diagnostics.dataRefs)).toEqual([
      'idle',
      'idle',
      'idle',
      'idle',
    ]);
  });

  it('returns to pairing when a command activation is rejected', async () => {
    const client = new FakeClient();
    client.activateCommand = jest.fn(async (_id: number) => {
      throw unauthorized();
    });
    const { session, snapshot, inner } = await connectedToConnector(client);
    await session.connect('192.168.1.100', 8080);

    await session.activateHeadingUp();

    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error?.code).toBe('UNAUTHORIZED');
    expect(snapshot().lastOperation).toMatchObject({ kind: 'command', ok: false });
    await expect(inner.get('192.168.1.100', 8080)).resolves.toBeNull();
  });
});

describe('SimulatorSession pairing edge cases', () => {
  it('fails with UNAUTHORIZED instead of pairing when the target is not a connector', async () => {
    const { session, snapshot } = setup({
      routes: {
        '/api/capabilities': {
          status: 401,
          body: '{"error_code":"unauthorized","error_message":"No"}',
        },
      },
    });

    await session.connect('192.168.1.100', 8080);

    // Nothing here can be paired with, so parking in `pairing` would strand the user.
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('UNAUTHORIZED');
    expect(snapshot().connector).toBeNull();
  });

  it('accepts a new pair call while one from a cancelled session is still in flight', async () => {
    const { session, snapshot, release } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/avionix/pair': { status: 200, body: '{"token":"tok-xyz"}' },
      },
      holdPaths: ['/avionix/pair'],
    });
    await session.connect('192.168.1.100', 8080);
    const abandoned = session.pair('123456');
    await flush();

    session.disconnect();
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    const retried = session.pair('123456');
    await flush();
    release('/avionix/pair');
    release('/avionix/pair');
    await Promise.all([abandoned, retried]);

    expect(snapshot().state).toBe('connected');
  });

  it('waits for a queued token clear before reading the stored token', async () => {
    const inner = createPairingTokenStore(createMemorySettingsStorage());
    await inner.set('192.168.1.100', 8080, 'tok-stale');
    const store = new ControllableTokenStore(inner);
    const { session, snapshot } = setup({
      tokenStore: store,
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/api/capabilities': [
          { status: 401, body: '{"error_code":"unauthorized","error_message":"Pair again"}' },
        ],
      },
    });
    store.deferClear = true;
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    await flush();
    expect(store.pendingClears.length).toBe(1);

    // The user presses Connect again while the clear is still on its way to storage.
    const reconnecting = session.connect('192.168.1.100', 8080);
    await flush();
    store.pendingClears[0]?.();
    await reconnecting;

    // The revoked token must not come back from storage and skip the pairing prompt.
    expect(snapshot().state).toBe('pairing');
  });

  it('ignores a resolution that completes after the session was torn down', async () => {
    const client = new FakeClient();
    const gates: Array<() => void> = [];
    client.findDataRef = jest.fn(async (name: string) => {
      await new Promise<void>((resolve) => gates.push(resolve));
      return { id: 1, name, valueType: 'float' as const };
    });
    const { session, snapshot } = setup({ clients: [client] });

    const connecting = session.connect('192.168.1.100', 8080);
    await flush();
    expect(gates.length).toBe(3);
    session.disconnect();
    for (const gate of gates) {
      gate();
    }
    await connecting;

    expect(snapshot().state).toBe('disconnected');
    expect(snapshot().diagnostics.command).toBe('idle');
    // disconnect() no longer resets diagnostics (F-02 R11): the step was 'pending' the
    // moment disconnect() ran, and the late resolve is ignored rather than overwriting it.
    expect(snapshot().diagnostics.dataRefs[MVP_DATAREFS.heartbeat]).toBe('pending');
  });
});

/** A controllable clock, so the health-fact tests can drive freshness and round trips precisely. */
class ManualClock {
  private value = 1234;
  get = (): number => this.value;
  set(value: number): void {
    this.value = value;
  }
}

/** Drives a connection through to completion with the existing setup()/flush() pattern. */
async function connectedSession(
  options: { missingOptional?: boolean } = {},
): Promise<{ session: SimulatorSession; client: FakeClient; now: ManualClock }> {
  const client = new FakeClient();
  if (options.missingOptional) {
    client.missingDataRef = 'sim/time/paused';
  }
  const now = new ManualClock();
  const { session } = setup({ clients: [client], now: now.get });
  await session.connect('192.168.1.10', '8086');
  await flush();
  return { session, client, now };
}

function emitUpdate(client: FakeClient, update: DataRefUpdate): void {
  for (const listener of client.updateListeners) {
    listener([update]);
  }
}

describe('health facts', () => {
  it('records a heartbeat advance, and ignores a repeat of the same value', async () => {
    const { session, client, now } = await connectedSession();

    now.set(1000);
    emitUpdate(client, { id: 1, value: 10, receivedAt: 1000 });
    expect(session.store.getSnapshot().health.lastHeartbeatAt).toBe(1000);
    expect(session.store.getSnapshot().health.lastHeartbeatValue).toBe(10);

    now.set(3000);
    emitUpdate(client, { id: 1, value: 10, receivedAt: 3000 });
    expect(session.store.getSnapshot().health.lastHeartbeatAt).toBe(1000);

    now.set(4000);
    emitUpdate(client, { id: 1, value: 11, receivedAt: 4000 });
    expect(session.store.getSnapshot().health.lastHeartbeatAt).toBe(4000);
  });

  it('marks the flight as loaded and stamps the connection time on success', async () => {
    const { session } = await connectedSession();
    const { health } = session.store.getSnapshot();
    expect(health.flightLoaded).toBe(true);
    expect(health.lastConnectedAt).not.toBeNull();
  });

  it('measures a round trip from requests it already makes', async () => {
    // A clock frozen during connect would make every sample 0, so this could pass even if
    // recordRoundTrip never ran. Advance it inside subscribeDataRefs (the last timed() call
    // in the connect flow) so the elapsed value asserted below can only come from an actual
    // measurement.
    const client = new FakeClient();
    const now = new ManualClock();
    const startedAt = now.get();
    client.subscribeDataRefs = jest.fn(async (subs: Array<{ id: number }>) => {
      now.set(now.get() + 42);
      client.subscribed.push(...subs.map((s) => s.id));
    });
    const { session } = setup({ clients: [client], now: now.get });

    await session.connect('192.168.1.10', '8086');

    const { health } = session.store.getSnapshot();
    expect(health.roundTripMs).toBe(42);
    expect(health.roundTripAt).toBe(startedAt + 42);
  });

  it('exposes the reconnect budget alongside the attempt', async () => {
    const { session } = await connectedSession();
    expect(session.store.getSnapshot().health.reconnectBudget).toBe(5);
  });

  it('resolves an optional dataref without letting it fail the connect', async () => {
    const { session, client } = await connectedSession({ missingOptional: true });
    const snapshot = session.store.getSnapshot();
    expect(snapshot.state).toBe('connected');
    expect(snapshot.diagnostics.dataRefs['sim/time/paused']).toBe('failed');
    expect(client.subscribed).not.toContain(4);
  });

  it('closes the socket and installs nothing when disconnect() lands during optional resolution', async () => {
    const client = new FakeClient();
    const resolveRequired = client.findDataRef;
    let releaseOptional!: () => void;
    client.findDataRef = jest.fn(async (name: string) => {
      if (name === 'sim/time/paused') {
        await new Promise<void>((resolve) => {
          releaseOptional = resolve;
        });
      }
      return resolveRequired(name);
    });
    const { session, snapshot } = setup({ clients: [client] });

    const connecting = session.connect('192.168.1.10', '8086');
    await flush();
    // The websocket is open and required resolution has finished; only the optional
    // dataref's lookup is still pending.
    expect(client.socketOpen).toBe(true);

    session.disconnect();
    releaseOptional();
    await connecting;

    // The socket opened for the superseded generation must be closed, not left dangling
    // with no ActiveConnection ever holding a reference to it.
    expect(client.socketOpen).toBe(false);
    expect(snapshot().state).toBe('disconnected');

    await session.writeHeading(10);
    expect(snapshot().lastOperation).toMatchObject({
      ok: false,
      message: expect.stringContaining('not connected'),
    });
  });

  it('keeps the last known state and the end reason after disconnect', async () => {
    const { session } = await connectedSession();
    session.disconnect();
    const snapshot = session.store.getSnapshot();
    expect(snapshot.state).toBe('disconnected');
    expect(snapshot.health.lastConnectedAt).not.toBeNull();
    expect(snapshot.health.lastEndedAt).not.toBeNull();
    expect(snapshot.diagnostics.websocket).toBe('ok');
  });
});

describe('no flight loaded', () => {
  it('keeps the link open and retries instead of failing the connect', async () => {
    const client = new FakeClient();
    client.dataRefCount = 0;
    client.missingDataRef = MVP_DATAREFS.airspeed;
    const { session, scheduler, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.10', '8086');
    await flush();

    const held = snapshot();
    expect(held.state).toBe('connected');
    expect(held.health.flightLoaded).toBe(false);
    expect(held.health.readinessRetryAt).not.toBeNull();
    expect(held.error?.code).toBe('SIMULATOR_NOT_READY');
    expect(client.socketOpen).toBe(true);

    client.dataRefCount = 3;
    client.missingDataRef = null;
    await scheduler.runNext();

    const ready = snapshot();
    expect(ready.state).toBe('connected');
    expect(ready.health.flightLoaded).toBe(true);
    expect(ready.health.readinessRetryAt).toBeNull();
    expect(ready.error).toBeNull();
    expect(client.connectWebSocket).toHaveBeenCalledTimes(1);
  });

  it('still fails the connect when a name is genuinely missing and a flight is loaded', async () => {
    const client = new FakeClient();
    client.dataRefCount = 3;
    client.missingDataRef = MVP_DATAREFS.airspeed;
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.10', '8086');

    expect(snapshot().state).toBe('error');
    expect(snapshot().health.readinessRetryAt).toBeNull();
  });

  it('cancels the readiness retry on disconnect', async () => {
    const client = new FakeClient();
    client.dataRefCount = 0;
    client.missingDataRef = MVP_DATAREFS.airspeed;
    const { session, scheduler, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.10', '8086');
    await flush();

    session.disconnect();
    expect(scheduler.queue.filter((entry) => !entry.cancelled).length).toBe(0);
    expect(snapshot().health.readinessRetryAt).toBeNull();
  });

  it('completes a readiness retry that started during a reconnect without illegal transition', async () => {
    const first = new FakeClient();
    const second = new FakeClient();
    second.dataRefCount = 0;
    second.missingDataRef = MVP_DATAREFS.airspeed;
    const { session, scheduler, snapshot } = setup({ clients: [first, second] });
    await session.connect('192.168.1.100', 8086);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    await scheduler.runNext();
    expect(snapshot().state).toBe('connected');
    expect(snapshot().health.flightLoaded).toBe(false);

    second.dataRefCount = 3;
    second.missingDataRef = null;
    await scheduler.runNext();

    const ready = snapshot();
    expect(ready.state).toBe('connected');
    expect(ready.health.flightLoaded).toBe(true);
    expect(ready.error).toBeNull();
  });

  it('holds for readiness during a reconnect and takes the reconnecting to connected edge', async () => {
    const first = new FakeClient();
    const second = new FakeClient();
    second.dataRefCount = 0;
    second.missingDataRef = MVP_DATAREFS.airspeed;
    const { session, scheduler, snapshot } = setup({ clients: [first, second] });
    await session.connect('192.168.1.100', 8086);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    expect(snapshot().state).toBe('reconnecting');

    await scheduler.runNext();

    expect(snapshot().state).toBe('connected');
    expect(snapshot().health.flightLoaded).toBe(false);
    expect(snapshot().health.readinessRetryAt).not.toBeNull();
    expect(snapshot().reconnectAttempt).toBe(0);
  });
});
