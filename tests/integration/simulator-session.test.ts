import { MVP_DATAREFS } from '@/application/mvp-bindings';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
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

function createSession(): SimulatorSession {
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
    tokenStore: createPairingTokenStore(createMemorySettingsStorage()),
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

describe('SimulatorSession against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('connects end to end, streams telemetry, writes and commands, then disconnects', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const snap = () => session.store.getSnapshot();
    expect(snap().state).toBe('connected');
    expect(snap().apiVersion).toBe('v3');
    expect(snap().capabilities?.simulatorVersion).toBe('12.4.0');

    await until(() => snap().telemetry[MVP_DATAREFS.heartbeat]?.value === 12.5);
    server.setDataRefValue('sim/time/total_running_time_sec', 20);
    await until(() => snap().telemetry[MVP_DATAREFS.heartbeat]?.value === 20);

    await session.writeHeading(123);
    expect(snap().lastOperation).toMatchObject({ kind: 'write', ok: true });
    await until(() => snap().telemetry[MVP_DATAREFS.heading]?.value === 123);

    await session.activateHeadingUp();
    expect(snap().lastOperation).toMatchObject({ kind: 'command', ok: true });
    await until(() => snap().telemetry[MVP_DATAREFS.heading]?.value === 124);

    session.disconnect();
    expect(snap().state).toBe('disconnected');
    await until(() => server.connectionCount === 0);
  });

  it('reports INCOMING_TRAFFIC_DISABLED when X-Plane blocks incoming traffic', async () => {
    server.incomingTrafficDisabled = true;
    const session = createSession();
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().state).toBe('error');
    expect(session.store.getSnapshot().error?.code).toBe('INCOMING_TRAFFIC_DISABLED');
  });

  it('reports SIMULATOR_NOT_READY when X-Plane exposes no datarefs (main menu)', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({ dataRefs: [] });
    const session = createSession();
    await session.connect(server.host, server.port);
    const snap = session.store.getSnapshot();
    expect(snap.state).toBe('error');
    expect(snap.error?.code).toBe('SIMULATOR_NOT_READY');
    expect(snap.diagnostics.dataRefs[MVP_DATAREFS.heartbeat]).toBe('failed');
  });

  it('reports UNSUPPORTED_API for a v1-only simulator', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({ apiVersions: ['v1'], xplaneVersion: '12.1.1' });
    const session = createSession();
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().error?.code).toBe('UNSUPPORTED_API');
  });

  it('reconnects after the server drops the socket', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const snap = () => session.store.getSnapshot();
    server.terminateAllSockets();
    await until(() => snap().state === 'reconnecting');
    await until(() => snap().state === 'connected');
    await until(() => snap().telemetry[MVP_DATAREFS.heartbeat] !== undefined);
    session.disconnect();
  });

  it('two sessions connect independently and one acting does not disturb the other', async () => {
    const a = createSession();
    const b = createSession();
    await Promise.all([a.connect(server.host, server.port), b.connect(server.host, server.port)]);
    expect(server.connectionCount).toBe(2);
    await until(() => a.store.getSnapshot().telemetry[MVP_DATAREFS.heading] !== undefined);
    await until(() => b.store.getSnapshot().telemetry[MVP_DATAREFS.heading] !== undefined);
    await a.writeHeading(45);
    await until(() => b.store.getSnapshot().telemetry[MVP_DATAREFS.heading]?.value === 45);
    expect(b.store.getSnapshot().state).toBe('connected');
    a.disconnect();
    await until(() => server.connectionCount === 1);
    expect(b.store.getSnapshot().state).toBe('connected');
    b.disconnect();
  });
});
