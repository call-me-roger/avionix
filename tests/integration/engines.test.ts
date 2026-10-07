import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { ENGINE_CONFIG, ENGINES_FEATURES, GAUGES } from '@/domain/engines/catalogue';
import { enginesPage } from '@/domain/engines/engine-page';
import { fuelPage } from '@/domain/engines/fuel';
import { ENGINES } from '@/domain/systems/controls';
import { DEFAULT_UNITS } from '@/domain/units/units';
import { engineReader } from '@/features/panels/engines/engine-reader';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import type { ReconnectPolicy } from '@/utils/backoff';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

const FAST_RECONNECT: ReconnectPolicy = {
  maxAttempts: 5,
  baseDelayMs: 20,
  factor: 1,
  maxDelayMs: 50,
  jitterRatio: 0,
};

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
    logger: silentLogger,
    reconnectPolicy: FAST_RECONNECT,
  });
}

async function until(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('the Engines panel against the mock X-Plane (the toy engine)', () => {
  let server: MockXPlaneServer;
  let stopped: boolean;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    stopped = false;
  });

  afterEach(async () => {
    if (!stopped) {
      await server.stop();
    }
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(ENGINES_FEATURES);
    await session.connect(server.host, server.port);
    return session;
  }

  const model = (session: SimulatorSession) =>
    enginesPage(engineReader(session.store.getSnapshot()), DEFAULT_UNITS);

  it('draws the stopped engine, then its running values once it runs', async () => {
    const session = await connected();
    await until(() => model(session).columns[0]?.dial?.text === '0');
    expect(model(session).rows.map((row) => row.id)).toEqual([
      'map',
      'ff',
      'egt',
      'cht',
      'oilP',
      'oilT',
    ]);
    server.setDataRefValue(ENGINES.running, [1, ...new Array<number>(15).fill(0)]);
    await until(() => model(session).columns[0]?.dial?.text === '2,300');
    // 1,350 °F (the mock's EGT flag is 0) is 732 °C.
    expect(model(session).columns[0]?.cells.egt?.text).toBe('732');
    const fuel = fuelPage(engineReader(session.store.getSnapshot()), DEFAULT_UNITS, 1);
    expect(fuel.tanks?.map((tank) => tank.name)).toEqual(['LEFT', 'RIGHT']);
    expect(fuel.total?.text).toBe('1,235');
    session.disconnect();
  });

  it('marks only the gauges whose DataRef the aircraft lacks', async () => {
    server.removeDataRef(GAUGES.cht.name);
    const session = await connected();
    await until(() => model(session).status === 'ready');
    expect(model(session).missing).toEqual(['CHT']);
    expect(model(session).rows.map((row) => row.id)).not.toContain('cht');
    session.disconnect();
  });

  it('says the engines cannot be identified without the count', async () => {
    server.removeDataRef(ENGINE_CONFIG.count);
    const session = await connected();
    await until(() => session.store.getSnapshot().state === 'connected');
    expect(model(session).status).toBe('unidentified');
    session.disconnect();
  });

  it('keeps the last values, never zeroed, when the simulator goes away (R5)', async () => {
    const session = await connected();
    server.setDataRefValue(ENGINES.running, [1, ...new Array<number>(15).fill(0)]);
    await until(() => model(session).columns[0]?.dial?.text === '2,300');
    await server.stop();
    stopped = true;
    await until(() => session.store.getSnapshot().state !== 'connected');
    expect(model(session).columns[0]?.dial?.text).toBe('2,300');
    session.disconnect();
  });
});
