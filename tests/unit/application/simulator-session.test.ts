import { MVP_COMMAND_HEADING_UP, MVP_DATAREFS } from '@/application/mvp-bindings';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { type Scheduler, SimulatorSession } from '@/application/simulator-session';
import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError } from '@/domain/errors/avionix-error';
import type { SimulatorClient, SocketCloseInfo } from '@/domain/simulator/simulator-client';
import type { DataRefUpdate, SimulatorCapabilities } from '@/domain/simulator/types';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';

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

function setup(
  options: {
    capsError?: AvionixError;
    clients?: FakeClient[];
    routes?: Record<string, Route | Route[]>;
  } = {},
) {
  const clients = options.clients ?? [new FakeClient()];
  let clientIndex = 0;
  const scheduler = new ManualScheduler();
  const capsError = options.capsError;
  const routes = options.routes ?? {};
  const requestedPaths: string[] = [];
  const storage = createMemorySettingsStorage();
  const tokenStore = createPairingTokenStore(storage);
  const sentTokens: (string | undefined)[] = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
    const path = url.slice(url.indexOf('/', 'http://'.length));
    requestedPaths.push(path);
    sentTokens.push(init.headers.Authorization);
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
    createClient: () => {
      const client = clients[Math.min(clientIndex, clients.length - 1)];
      clientIndex += 1;
      if (client === undefined) {
        throw new Error('no fake client');
      }
      return client;
    },
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore,
    scheduler,
    random: () => 0.5,
    logger: silentLogger,
    now: () => 1234,
  });
  return {
    session,
    scheduler,
    clients,
    storage,
    tokenStore,
    requestedPaths,
    sentTokens,
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
        },
      },
    });
    expect(clients[0]?.subscribed.sort()).toEqual([1, 2, 3]);
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

  it('reports SIMULATOR_NOT_READY when a dataref is missing and X-Plane has no datarefs', async () => {
    const client = new FakeClient();
    client.missingDataRef = MVP_DATAREFS.heartbeat;
    client.dataRefCount = 0;
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('SIMULATOR_NOT_READY');
    expect(snapshot().error?.message).toContain('Load a flight');
    expect(snapshot().error?.retryable).toBe(true);
    expect(snapshot().diagnostics.dataRefs[MVP_DATAREFS.heartbeat]).toBe('failed');
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
    expect(second.subscribed.sort()).toEqual([1, 2, 3]);
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

  it('disconnect from pairing returns to disconnected and clears the connector', async () => {
    const { session, snapshot, tokenStore } = setup({
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    session.disconnect();
    expect(snapshot().state).toBe('disconnected');
    expect(snapshot().connector).toBeNull();
    expect(snapshot().diagnostics.connector).toBe('idle');
    // The stored token (none here) is deliberately kept across a disconnect.
    await expect(tokenStore.get('192.168.1.100', 8080)).resolves.toBeNull();
    await expect(session.pair('123456')).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
