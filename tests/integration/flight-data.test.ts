import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  FEATURE_FLIGHT_DATA,
  FEATURE_GPS_DESTINATION,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { destinationView } from '@/domain/flight-data/destination';
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

describe('flight data against the mock X-Plane', () => {
  let server: MockXPlaneServer;
  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });
  afterEach(async () => {
    await server.stop();
  });

  const destinationOf = (session: SimulatorSession) => {
    const { compatibility, telemetry } = session.store.getSnapshot();
    return destinationView({
      idStatus: compatibility.bindings[D.gpsDestinationId]?.status,
      distanceStatus: compatibility.bindings[D.gpsDistance]?.status,
      idValue: telemetry[D.gpsDestinationId]?.value,
      distanceValue: telemetry[D.gpsDistance]?.value,
      timeValue: telemetry[D.gpsTimeToGo]?.value,
    });
  };

  it('tracks every field and decodes the GPS identifier', async () => {
    const session = createSession();
    session.setDemand([FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION]);
    await session.connect(server.host, server.port);
    const value = (name: string) => session.store.getSnapshot().telemetry[name]?.value;
    await until(() => value(D.groundSpeed) === 142.4 && value(D.gpsDestinationId) !== undefined);
    server.setDataRefValue(D.groundSpeed, 150);
    server.setDataRefValue(D.fuelTotal, 1200);
    await until(() => value(D.groundSpeed) === 150 && value(D.fuelTotal) === 1200);
    expect(destinationOf(session)).toEqual({
      kind: 'shown',
      id: 'KSEA',
      distanceNm: 126.4,
      timeMin: 53.2,
    });
    session.disconnect();
  });

  it('reports no destination available when the aircraft lacks the GPS names', async () => {
    server.removeDataRef(D.gpsDistance);
    server.removeDataRef(D.gpsTimeToGo);
    server.removeDataRef(D.gpsDestinationId);
    const session = createSession();
    session.setDemand([FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION]);
    await session.connect(server.host, server.port);
    // Compatibility resolves asynchronously after connect settles, so the GPS bindings may still
    // be unprobed on the first snapshot. destinationView reads 'unavailable' off the binding
    // status directly (both GPS bindings are optional, so the feature itself only ever degrades
    // to 'partial', never 'unavailable' — deriveFeatureAvailability reserves 'unavailable' for a
    // required miss). Wait for the binding probe to actually land rather than weakening the
    // assertion.
    await until(
      () =>
        session.store.getSnapshot().compatibility.bindings[D.gpsDestinationId]?.status ===
        'missing',
    );
    expect(destinationOf(session)).toEqual({ kind: 'unavailable' });
    await until(() => session.store.getSnapshot().telemetry[D.groundSpeed] !== undefined);
    session.disconnect();
  });
});
