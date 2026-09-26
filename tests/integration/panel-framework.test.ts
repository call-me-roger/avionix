import { featureStatus } from '@/application/compatibility';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { IDENTITY_DATAREF_NAMES } from '@/domain/aircraft/identity-datarefs';
import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
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

const ALWAYS = [...IDENTITY_DATAREF_NAMES, GENERIC_DATAREFS.heartbeat, GENERIC_DATAREFS.paused];
const sorted = (names: string[]) => [...names].sort();

describe('the panel framework against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('moves the subscription with the visible panel, by the delta only', async () => {
    const session = createSession();
    session.setDemand([FEATURE_FLIGHT_TELEMETRY, FEATURE_HEADING_CONTROL]);
    await session.connect(server.host, server.port);
    expect(server.subscribedDataRefNames()).toEqual(
      sorted([...ALWAYS, GENERIC_DATAREFS.airspeed, GENERIC_DATAREFS.headingBug]),
    );
    await until(
      () => session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed] !== undefined,
    );

    session.setDemand([FEATURE_HEADING_CONTROL]);
    await until(() => !server.subscribedDataRefNames().includes(GENERIC_DATAREFS.airspeed));
    expect(server.subscribedDataRefNames()).toEqual(
      sorted([...ALWAYS, GENERIC_DATAREFS.headingBug]),
    );
    expect(session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed]).toBeUndefined();
    expect(session.store.getSnapshot().telemetry[GENERIC_DATAREFS.headingBug]).toBeDefined();

    session.setDemand([FEATURE_FLIGHT_TELEMETRY]);
    // The first update after a subscribe carries the value, so it returns within one cycle.
    await until(
      () => session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed] !== undefined,
    );
    session.disconnect();
  });

  it('reports a rejected write against its control and keeps the simulator’s value', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const heading = () => session.store.getSnapshot().telemetry[GENERIC_DATAREFS.headingBug]?.value;
    await until(() => heading() !== undefined);
    const before = heading();
    server.rejectWritesWith = 'dataref_is_readonly';

    await session.write(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, 123);

    const outcome = session.store.getSnapshot().operations[GENERIC_DATAREFS.headingBug];
    expect(outcome).toMatchObject({ status: 'failed', refusal: null });
    expect(outcome?.failure?.step).toBe('operation');
    expect(heading()).toBe(before);
    expect(session.store.getSnapshot().state).toBe('connected');
    session.disconnect();
  });

  it('makes only the control whose name is missing unavailable', async () => {
    server.removeDataRef(GENERIC_DATAREFS.headingBug);
    const session = createSession();
    await session.connect(server.host, server.port);
    const snapshot = () => session.store.getSnapshot();
    expect(featureStatus(snapshot().compatibility, FEATURE_HEADING_CONTROL)).toBe('unavailable');
    expect(featureStatus(snapshot().compatibility, FEATURE_FLIGHT_TELEMETRY)).toBe('available');

    await session.write(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, 90);
    await session.activate(FEATURE_HEADING_CONTROL, GENERIC_COMMANDS.headingUp);
    expect(snapshot().operations[GENERIC_DATAREFS.headingBug]?.refusal).toBe('unavailable');
    expect(snapshot().operations[GENERIC_COMMANDS.headingUp]?.refusal).toBe('unavailable');
    expect(server.writes).toEqual([]);
    await until(() => snapshot().telemetry[GENERIC_DATAREFS.airspeed] !== undefined);
    session.disconnect();
  });

  it('keeps the last known values, marked by the link state, after the link drops', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    await until(
      () => session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed] !== undefined,
    );
    session.disconnect();
    expect(session.store.getSnapshot().state).toBe('disconnected');
    expect(session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed]).toBeDefined();
  });
});
