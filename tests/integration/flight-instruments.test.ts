import { featureStatus } from '@/application/compatibility';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  FEATURE_ALTIMETER_SETTING,
  FEATURE_FLIGHT_INSTRUMENTS,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { AUTOPILOT_PANEL } from '@/features/panels/autopilot/autopilot';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { DEFAULT_MOCK_DATAREFS, MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

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
 * The instruments panel's demand. `INSTRUMENTS_PANEL` itself lives in a React Native module this
 * node project cannot load; tests/ui/instruments-panel.test.tsx pins it to this same set.
 */
const INSTRUMENTS_DEMAND = [
  FEATURE_FLIGHT_INSTRUMENTS,
  FEATURE_ALTIMETER_SETTING,
  ...AUTOPILOT_PANEL.features,
];

describe('flight instruments against the mock X-Plane', () => {
  let server: MockXPlaneServer;
  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });
  afterEach(async () => {
    await server.stop();
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(INSTRUMENTS_DEMAND);
    await session.connect(server.host, server.port);
    return session;
  }

  const valueOf = (session: SimulatorSession, name: string) =>
    session.store.getSnapshot().telemetry[name]?.value;

  it('streams every instrument value and reports both features available', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.altitude) !== undefined);
    await until(() => valueOf(session, D.engineType) !== undefined);
    expect(valueOf(session, D.altitude)).toBe(4520);
    expect(valueOf(session, D.pitch)).toBe(3);
    expect(valueOf(session, D.roll)).toBe(15);
    expect(valueOf(session, D.heading)).toBe(270);
    expect(valueOf(session, D.verticalSpeed)).toBe(500);
    expect(valueOf(session, D.turnRate)).toBe(20);
    expect(valueOf(session, D.slip)).toBe(0);
    const engineType = valueOf(session, D.engineType);
    expect(Array.isArray(engineType) && engineType[0]).toBe(1);
    const { compatibility } = session.store.getSnapshot();
    expect(featureStatus(compatibility, FEATURE_FLIGHT_INSTRUMENTS)).toBe('available');
    expect(featureStatus(compatibility, FEATURE_ALTIMETER_SETTING)).toBe('available');
    session.disconnect();
  });

  it('streams the autopilot targets and modes the PFD draws', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.altitudeDial) !== undefined);
    await until(() => valueOf(session, D.speedStatus) !== undefined);
    expect(valueOf(session, D.altitudeDial)).toBe(5000);
    expect(valueOf(session, D.headingBug)).toBe(270);
    expect(valueOf(session, D.airspeedDial)).toBe(120);
    expect(valueOf(session, D.airspeedIsMach)).toBe(0);
    expect(valueOf(session, D.verticalSpeedDial)).toBe(0);
    for (const name of [
      D.autopilotServos,
      D.flightDirectorBars,
      D.autothrottle,
      D.headingStatus,
      D.navStatus,
      D.approachStatus,
      D.altitudeStatus,
      D.verticalSpeedStatus,
      D.speedStatus,
    ]) {
      await until(() => valueOf(session, name) !== undefined);
    }
    const { compatibility } = session.store.getSnapshot();
    for (const id of AUTOPILOT_PANEL.features) {
      expect(featureStatus(compatibility, id)).toBe('available');
    }
    session.disconnect();
  });

  it('writes the altimeter setting and reads it back from the simulator', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.barometer) === 29.92);
    await session.write(FEATURE_ALTIMETER_SETTING, D.barometer, 30.12);
    // The panel never shows the written value: it waits for X-Plane to stream it back (R10).
    await until(() => valueOf(session, D.barometer) === 30.12);
    expect(session.store.getSnapshot().operations[D.barometer]?.status).toBe('ok');
    expect(server.activations).toEqual([]);
    session.disconnect();
  });

  it('refuses the altimeter setting on a read-only DataRef and keeps the instruments', async () => {
    const barometer = DEFAULT_MOCK_DATAREFS.find((dataRef) => dataRef.name === D.barometer);
    if (barometer === undefined) {
      throw new Error('mock dataref not defined');
    }
    server.removeDataRef(D.barometer);
    server.addDataRef({ ...barometer, writable: false });
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    expect(featureStatus(compatibility, FEATURE_ALTIMETER_SETTING)).toBe('unavailable');
    expect(featureStatus(compatibility, FEATURE_FLIGHT_INSTRUMENTS)).toBe('available');
    await session.write(FEATURE_ALTIMETER_SETTING, D.barometer, 30.12);
    expect(session.store.getSnapshot().operations[D.barometer]?.refusal).toBe('unavailable');
    expect(server.writes).toEqual([]);
    session.disconnect();
  });

  it('degrades to partial when one instrument is missing, and keeps the others', async () => {
    server.removeDataRef('sim/cockpit2/gauges/indicators/vvi_fpm_pilot');
    const session = await connected();
    await until(
      () =>
        session.store.getSnapshot().compatibility.bindings[D.verticalSpeed]?.status === 'missing',
    );
    expect(
      featureStatus(session.store.getSnapshot().compatibility, FEATURE_FLIGHT_INSTRUMENTS),
    ).toBe('partial');
    await until(() => valueOf(session, D.altitude) !== undefined);
    expect(valueOf(session, D.altitude)).toBe(4520);
    expect(valueOf(session, D.pitch)).toBe(3);
    expect(valueOf(session, D.roll)).toBe(15);
    expect(valueOf(session, D.heading)).toBe(270);
    expect(valueOf(session, D.verticalSpeed)).toBeUndefined();
    session.disconnect();
  });
});
