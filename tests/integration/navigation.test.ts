import { featureStatus } from '@/application/compatibility';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  FEATURE_NAV1,
  FEATURE_NAV2,
  FEATURE_NAV_AIDS,
  FEATURE_NAV_COURSE,
  FEATURE_NAV_DEVIATION,
  FEATURE_NAV_GLIDESLOPE,
  FEATURE_NAV_SOURCE,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

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
  });
}

/** Polls until the live stream has driven the session where the test expects it. */
async function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * The navigation features of the Navigation panel's demand. `NAVIGATION_PANEL` itself lives in a
 * React Native module this node project cannot load; tests/ui/navigation-panel.test.tsx pins its
 * full set of nine. This is seven of them: it leaves out FEATURE_FLIGHT_INSTRUMENTS and
 * FEATURE_HEADING_CONTROL, which these tests do not exercise.
 */
const NAVIGATION_DEMAND = [
  FEATURE_NAV_DEVIATION,
  FEATURE_NAV_GLIDESLOPE,
  FEATURE_NAV_SOURCE,
  FEATURE_NAV_COURSE,
  FEATURE_NAV_AIDS,
  FEATURE_NAV1,
  FEATURE_NAV2,
];

describe('the Navigation panel against the mock X-Plane', () => {
  let server: MockXPlaneServer;
  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });
  afterEach(async () => {
    await server.stop();
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(NAVIGATION_DEMAND);
    await session.connect(server.host, server.port);
    return session;
  }

  const valueOf = (session: SimulatorSession, name: string) =>
    session.store.getSnapshot().telemetry[name]?.value;

  it('connects and streams the HSI source, course and deviation from the mock', async () => {
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    for (const id of NAVIGATION_DEMAND) {
      expect(featureStatus(compatibility, id)).toBe('available');
    }
    await until(() => valueOf(session, D.hsiSource) === 0);
    await until(() => valueOf(session, D.hsiCourse) === 270);
    await until(() => valueOf(session, D.hsiHdef) === 0.8);
    session.disconnect();
  });

  it('writes the HSI source to NAV2 and reads it back', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.hsiSource) === 0);
    await session.write(FEATURE_NAV_SOURCE, D.hsiSource, 1);
    await until(() => valueOf(session, D.hsiSource) === 1);
    session.disconnect();
  });

  it('steps the course from 270 to 271 and reads it back', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.hsiCourse) === 270);
    await session.write(FEATURE_NAV_COURSE, D.hsiCourse, 271);
    await until(() => valueOf(session, D.hsiCourse) === 271);
    session.disconnect();
  });

  it('centres the course on the station with CTR (obs_HSI_direct)', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.hsiCourse) === 270);
    await session.activate(FEATURE_NAV_COURSE, C.hsiDirect);
    await until(() => valueOf(session, D.hsiCourse) === 268);
    await until(() => valueOf(session, D.hsiHdef) === 0);
    session.disconnect();
  });

  it('leaves the HSI working when the HSI source dataref is missing', async () => {
    server.removeDataRef(D.hsiSource);
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    expect(featureStatus(compatibility, FEATURE_NAV_SOURCE)).toBe('unavailable');
    expect(featureStatus(compatibility, FEATURE_NAV_DEVIATION)).toBe('available');
    expect(featureStatus(compatibility, FEATURE_NAV_GLIDESLOPE)).toBe('available');
    expect(featureStatus(compatibility, FEATURE_NAV_COURSE)).toBe('available');
    await until(() => valueOf(session, D.hsiHdef) === 0.8);
    session.disconnect();
  });
});
