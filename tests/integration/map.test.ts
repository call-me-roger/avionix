import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { FEATURE_MOVING_MAP, MAP_DATAREFS } from '@/domain/map/catalogue';
import { mapModel } from '@/domain/map/map-model';
import { mapReader } from '@/features/panels/map/map-reader';
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

describe('the moving map against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  const model = (session: SimulatorSession) => mapModel(mapReader(session.store.getSnapshot()));

  it('delivers position, GPS altitude, true heading and true track', async () => {
    const session = createSession();
    session.setDemand([FEATURE_MOVING_MAP]);
    await session.connect(server.host, server.port);
    await until(
      () =>
        model(session).status === 'ready' &&
        model(session).trueTrack !== null &&
        model(session).elevationM !== null,
    );
    expect(model(session)).toMatchObject({
      position: { lat: 47.449, lon: -122.3093 },
      elevationM: 132,
      trueHeading: 180,
      trueTrack: 181,
    });
    session.disconnect();
  });

  it('follows a moved position', async () => {
    const session = createSession();
    session.setDemand([FEATURE_MOVING_MAP]);
    await session.connect(server.host, server.port);
    await until(() => model(session).status === 'ready');
    server.setDataRefValue(MAP_DATAREFS.latitude, 47.5);
    server.setDataRefValue(MAP_DATAREFS.longitude, -122.2);
    await until(
      () => model(session).position?.lat === 47.5 && model(session).position?.lon === -122.2,
    );
    session.disconnect();
  });

  it('is unavailable, and says why, when latitude is missing', async () => {
    server.removeDataRef(MAP_DATAREFS.latitude);
    const session = createSession();
    session.setDemand([FEATURE_MOVING_MAP]);
    await session.connect(server.host, server.port);
    await until(() => model(session).status === 'unavailable');
    session.disconnect();
  });
});
