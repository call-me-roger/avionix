import { MVP_DATAREFS } from '@/application/mvp-bindings';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

async function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createSession(storage: SettingsStorage): SimulatorSession {
  return new SimulatorSession({
    createHttpTransport: (config, auth) =>
      new HttpTransport({
        origin: `http://${config.host}:${config.port}`,
        auth,
        logger: silentLogger,
        defaultTimeoutMs: 2000,
      }),
    createClient: (config, apiVersion, http, auth) =>
      new XPlaneClient({
        config,
        apiVersion,
        http,
        auth,
        logger: silentLogger,
        requestTimeoutMs: 2000,
        connectTimeoutMs: 2000,
      }),
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore: createPairingTokenStore(storage),
    reconnectPolicy: {
      maxAttempts: 3,
      baseDelayMs: 20,
      factor: 2,
      maxDelayMs: 100,
      jitterRatio: 0,
    },
    logger: silentLogger,
  });
}

describe('SimulatorSession pairing against the mock connector', () => {
  let server: MockXPlaneServer;
  let storage: SettingsStorage;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({
      updateIntervalMs: 10,
      connector: { name: 'Sim PC', pairingRequired: true, code: '123456' },
    });
    storage = createMemorySettingsStorage();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('pairs on the first connect and reconnects without pairing afterwards', async () => {
    const first = createSession(storage);
    await first.connect(server.host, server.port);
    expect(first.store.getSnapshot().state).toBe('pairing');
    expect(first.store.getSnapshot().connector?.name).toBe('Sim PC');

    await first.pair('123456');
    expect(first.store.getSnapshot().state).toBe('connected');
    expect(first.store.getSnapshot().diagnostics.connector).toBe('paired');
    expect(server.issuedTokens).toEqual(['mock-token-1']);
    await until(() => first.store.getSnapshot().telemetry[MVP_DATAREFS.heartbeat] !== undefined);
    first.disconnect();
    await until(() => server.connectionCount === 0);

    const second = createSession(storage);
    await second.connect(server.host, server.port);
    expect(second.store.getSnapshot().state).toBe('connected');
    expect(server.issuedTokens).toEqual(['mock-token-1']);
    second.disconnect();
  });

  it('keeps pairing after a wrong code and connects with the right one', async () => {
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    await session.pair('000000');
    expect(session.store.getSnapshot().state).toBe('pairing');
    expect(session.store.getSnapshot().error?.code).toBe('PAIRING_FAILED');
    await session.pair('123456');
    expect(session.store.getSnapshot().state).toBe('connected');
    expect(session.store.getSnapshot().error).toBeNull();
    session.disconnect();
  });

  it('returns to pairing and forgets the token when the connector rejects it', async () => {
    const tokenStore = createPairingTokenStore(storage);
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    await session.pair('123456');
    expect(session.store.getSnapshot().state).toBe('connected');

    server.setRejectAllTokens(true);
    server.terminateAllSockets();

    await until(() => session.store.getSnapshot().state === 'pairing', 5000);
    expect(session.store.getSnapshot().error?.code).toBe('UNAUTHORIZED');
    expect(session.store.getSnapshot().connector?.name).toBe('Sim PC');
    await expect(tokenStore.get(server.host, server.port)).resolves.toBeNull();

    const attemptsAfter = server.issuedTokens.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(session.store.getSnapshot().state).toBe('pairing');
    expect(server.connectionCount).toBe(0);
    expect(server.issuedTokens.length).toBe(attemptsAfter);
    session.disconnect();
  });

  it('disconnect from pairing returns to disconnected', async () => {
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().state).toBe('pairing');
    session.disconnect();
    expect(session.store.getSnapshot().state).toBe('disconnected');
    expect(session.store.getSnapshot().connector).toBeNull();
  });

  it('connects straight through a connector with pairing disabled', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({
      updateIntervalMs: 10,
      connector: { name: 'Open PC', pairingRequired: false, code: '123456' },
    });
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().state).toBe('connected');
    expect(session.store.getSnapshot().diagnostics.connector).toBe('paired');
    expect(session.store.getSnapshot().connector?.name).toBe('Open PC');
    session.disconnect();
  });

  it('connects to plain X-Plane with the connector step direct', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().state).toBe('connected');
    expect(session.store.getSnapshot().diagnostics.connector).toBe('direct');
    expect(session.store.getSnapshot().connector).toBeNull();
    session.disconnect();
  });
});
