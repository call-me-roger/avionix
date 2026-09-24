import { featureStatus } from '@/application/compatibility';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
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

describe('aircraft compatibility against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('identifies the aircraft and reports every feature available', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const { compatibility, state } = session.store.getSnapshot();
    expect(state).toBe('connected');
    expect(compatibility.identity.description).toBe('Cessna 172 SP');
    expect(compatibility.identity.icaoType).toBe('C172');
    expect(compatibility.identity.tailNumber).toBe('N172SP');
    expect(compatibility.features.map((feature) => feature.status)).toEqual([
      'available',
      'available',
      'available',
    ]);
    session.disconnect();
  });

  it('connects with a required name missing and reports only that feature unavailable', async () => {
    server.removeDataRef(GENERIC_DATAREFS.airspeed);
    const session = createSession();
    await session.connect(server.host, server.port);
    const snapshot = session.store.getSnapshot();
    expect(snapshot.state).toBe('connected');
    expect(featureStatus(snapshot.compatibility, FEATURE_FLIGHT_TELEMETRY)).toBe('unavailable');
    expect(featureStatus(snapshot.compatibility, FEATURE_HEADING_CONTROL)).toBe('available');
    const missing = snapshot.compatibility.features.find(
      (feature) => feature.id === FEATURE_FLIGHT_TELEMETRY,
    );
    expect(missing?.missing[0]).toMatchObject({
      name: GENERIC_DATAREFS.airspeed,
      status: 'missing',
    });
    session.disconnect();
  });

  it('reports writability unavailable on a simulator that does not publish the flag', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({ updateIntervalMs: 10, reportWritability: false });
    const session = createSession();
    await session.connect(server.host, server.port);
    const snapshot = session.store.getSnapshot();
    expect(snapshot.compatibility.writabilityReported).toBe(false);
    // An X-Plane that declines to answer must not cost the pilot a control that works.
    expect(featureStatus(snapshot.compatibility, FEATURE_HEADING_CONTROL)).toBe('available');
    session.disconnect();
  });

  it('marks heading control unavailable when the heading dataref is read-only', async () => {
    server.removeDataRef(GENERIC_DATAREFS.headingBug);
    server.addDataRef({
      id: 1003,
      name: GENERIC_DATAREFS.headingBug,
      valueType: 'float',
      value: 270,
    });
    const session = createSession();
    await session.connect(server.host, server.port);
    expect(featureStatus(session.store.getSnapshot().compatibility, FEATURE_HEADING_CONTROL)).toBe(
      'unavailable',
    );
    session.disconnect();
  });
});
