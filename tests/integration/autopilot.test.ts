import { featureStatus } from '@/application/compatibility';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  FEATURE_AIRSPEED_SELECT,
  FEATURE_ALTITUDE_SELECT,
  FEATURE_AUTOPILOT,
  FEATURE_AUTOTHROTTLE,
  FEATURE_FLIGHT_DIRECTOR,
  FEATURE_HEADING_CONTROL,
  FEATURE_MODE_ALT,
  FEATURE_MODE_APR,
  FEATURE_MODE_FLC,
  FEATURE_MODE_HDG,
  FEATURE_MODE_NAV,
  FEATURE_MODE_VS,
  FEATURE_VERTICAL_SPEED_SELECT,
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

// Task 4 replaces this inline list with `AUTOPILOT_PANEL.features` once the panel descriptor
// exists in `@/features/panels/autopilot/autopilot`.
const AUTOPILOT_FEATURES = [
  FEATURE_AUTOPILOT,
  FEATURE_FLIGHT_DIRECTOR,
  FEATURE_AUTOTHROTTLE,
  FEATURE_HEADING_CONTROL,
  FEATURE_ALTITUDE_SELECT,
  FEATURE_VERTICAL_SPEED_SELECT,
  FEATURE_AIRSPEED_SELECT,
  FEATURE_MODE_HDG,
  FEATURE_MODE_NAV,
  FEATURE_MODE_APR,
  FEATURE_MODE_ALT,
  FEATURE_MODE_VS,
  FEATURE_MODE_FLC,
];

describe('the autopilot against the mock X-Plane', () => {
  let server: MockXPlaneServer;
  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });
  afterEach(async () => {
    await server.stop();
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(AUTOPILOT_FEATURES);
    await session.connect(server.host, server.port);
    return session;
  }

  const valueOf = (session: SimulatorSession, name: string) =>
    session.store.getSnapshot().telemetry[name]?.value;

  it('reports every autopilot feature available on the generic aircraft', async () => {
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    for (const id of AUTOPILOT_FEATURES) {
      expect(featureStatus(compatibility, id)).toBe('available');
    }
    session.disconnect();
  });

  it('engages the autopilot and HDG, and disconnects, reading each state back', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.autopilotServos) === 0);
    await session.activate(FEATURE_AUTOPILOT, C.autopilotEngage);
    await until(() => valueOf(session, D.autopilotServos) === 1);
    await session.activate(FEATURE_MODE_HDG, C.modeHeading);
    await until(() => valueOf(session, D.headingStatus) === 2);
    await session.activate(FEATURE_AUTOPILOT, C.autopilotDisconnect);
    await until(() => valueOf(session, D.autopilotServos) === 0);
    session.disconnect();
  });

  it('writes the selectors and switches the airspeed to Mach', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.altitudeDial) === 5000);
    await session.write(FEATURE_ALTITUDE_SELECT, D.altitudeDial, 12000);
    await session.write(FEATURE_VERTICAL_SPEED_SELECT, D.verticalSpeedDial, -800);
    await until(() => valueOf(session, D.altitudeDial) === 12000);
    await until(() => valueOf(session, D.verticalSpeedDial) === -800);
    await session.activate(FEATURE_AIRSPEED_SELECT, C.knotsMachToggle);
    await until(() => valueOf(session, D.airspeedIsMach) === 1);
    session.disconnect();
  });

  it('arms, engages and disarms the autothrottle with idempotent commands', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.autothrottle) === 0);
    await session.activate(FEATURE_AUTOTHROTTLE, C.autothrottleOn);
    await until(() => valueOf(session, D.autothrottle) === 1);
    await session.activate(FEATURE_AUTOTHROTTLE, C.autothrottleDisarm);
    await until(() => valueOf(session, D.autothrottle) === -1);
    await session.activate(FEATURE_AUTOTHROTTLE, C.autothrottleArm);
    await until(() => valueOf(session, D.autothrottle) === 0);
    session.disconnect();
  });

  it('leaves the rest usable when the approach command is missing', async () => {
    server.removeCommand(C.modeApproach);
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    expect(featureStatus(compatibility, FEATURE_MODE_APR)).toBe('unavailable');
    expect(featureStatus(compatibility, FEATURE_MODE_NAV)).toBe('available');
    expect(featureStatus(compatibility, FEATURE_AUTOPILOT)).toBe('available');
    await session.activate(FEATURE_MODE_APR, C.modeApproach);
    expect(session.store.getSnapshot().operations[C.modeApproach]?.refusal).toBe('unavailable');
    session.disconnect();
  });

  it('streams the override flag without ever writing it', async () => {
    server.setDataRefValue(D.autopilotOverride, 1);
    const session = await connected();
    await until(() => valueOf(session, D.autopilotOverride) === 1);
    expect(session.store.getSnapshot().operations[D.autopilotOverride]).toBeUndefined();
    session.disconnect();
  });
});
