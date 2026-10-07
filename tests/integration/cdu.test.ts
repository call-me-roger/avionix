import { featureStatus } from '@/application/compatibility';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  FEATURE_CDU1_KEYS,
  FEATURE_CDU1_SCREEN,
  FEATURE_CDU2_KEYS,
  FEATURE_CDU2_SCREEN,
} from '@/domain/aircraft/profiles/generic';
import { type CduUnit, cduCommand, cduExecLight, cduTextLine } from '@/domain/cdu/keys';
import { decodeTextLine } from '@/domain/cdu/screen';
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

const CDU_DEMAND = [FEATURE_CDU1_SCREEN, FEATURE_CDU1_KEYS, FEATURE_CDU2_SCREEN, FEATURE_CDU2_KEYS];

describe('the CDU panel against the mock X-Plane (the toy FMS)', () => {
  let server: MockXPlaneServer;
  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });
  afterEach(async () => {
    await server.stop();
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(CDU_DEMAND);
    await session.connect(server.host, server.port);
    return session;
  }

  /** One of `unit`'s 24-column text lines, decoded and trimmed, as the mock renders it. */
  function lineText(session: SimulatorSession, unit: CduUnit, line: number): string {
    const value = session.store.getSnapshot().telemetry[cduTextLine(unit, line)]?.value;
    return (decodeTextLine(value) ?? []).join('').trim();
  }

  function execLight(session: SimulatorSession, unit: CduUnit): number | undefined {
    const value = session.store.getSnapshot().telemetry[cduExecLight(unit)]?.value;
    return typeof value === 'number' ? value : undefined;
  }

  it('types KLAX, line-selects it into the origin and runs EXEC through the real key queue', async () => {
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    for (const id of CDU_DEMAND) {
      expect(featureStatus(compatibility, id)).toBe('available');
    }

    for (const letter of ['K', 'L', 'A', 'X']) {
      const result = await session.activate(FEATURE_CDU1_KEYS, cduCommand(1, `key_${letter}`));
      expect(result).toBe('ok');
    }
    await until(() => lineText(session, 1, 13) === 'KLAX');

    const lineSelect = await session.activate(FEATURE_CDU1_KEYS, cduCommand(1, 'ls_1l'));
    expect(lineSelect).toBe('ok');
    await until(() => lineText(session, 1, 2) === 'KLAX');
    await until(() => execLight(session, 1) === 1);

    const exec = await session.activate(FEATURE_CDU1_KEYS, cduCommand(1, 'exec'));
    expect(exec).toBe('ok');
    await until(() => execLight(session, 1) === 0);

    session.disconnect();
  });
});
