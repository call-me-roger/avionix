import { featureStatus } from '@/application/compatibility';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  FEATURE_COM1,
  FEATURE_COM2,
  FEATURE_NAV1,
  FEATURE_NAV2,
  FEATURE_TRANSPONDER_CODE,
  FEATURE_TRANSPONDER_IDENT,
  FEATURE_TRANSPONDER_MODE,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { RADIOS_PANEL } from '@/features/panels/radios/radios';
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

describe('radios and transponder against the mock X-Plane', () => {
  let server: MockXPlaneServer;
  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });
  afterEach(async () => {
    await server.stop();
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand([...RADIOS_PANEL.features]);
    await session.connect(server.host, server.port);
    return session;
  }

  const valueOf = (session: SimulatorSession, name: string) =>
    session.store.getSnapshot().telemetry[name]?.value;

  it('streams the radios and reports every feature available', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.com1Active) !== undefined);
    await until(() => valueOf(session, D.transponderCode) !== undefined);
    expect(valueOf(session, D.com1Active)).toBe(121_500);
    expect(valueOf(session, D.nav1Standby)).toBe(10_850);
    const { compatibility } = session.store.getSnapshot();
    for (const id of RADIOS_PANEL.features) {
      expect(featureStatus(compatibility, id)).toBe('available');
    }
    session.disconnect();
  });

  it('writes a COM standby channel and swaps it in', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.com1Standby) === 118_005);
    await session.write(FEATURE_COM1, D.com1Standby, 122_800);
    await until(() => valueOf(session, D.com1Standby) === 122_800);
    await session.activate(FEATURE_COM1, C.com1Flip);
    await until(() => valueOf(session, D.com1Active) === 122_800);
    expect(valueOf(session, D.com1Standby)).toBe(121_500);
    session.disconnect();
  });

  it('sets the squawk and the mode, and idents', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.transponderCode) === 1200);
    await session.write(FEATURE_TRANSPONDER_CODE, D.transponderCode, 4521);
    await session.write(FEATURE_TRANSPONDER_MODE, D.transponderMode, 3);
    await session.activate(FEATURE_TRANSPONDER_IDENT, C.transponderIdent);
    await until(() => valueOf(session, D.transponderCode) === 4521);
    await until(() => valueOf(session, D.transponderMode) === 3);
    await until(() => valueOf(session, D.transponderIdenting) === 1);
    session.disconnect();
  });

  it('accepts a write the aircraft ignores, which only the read-back can catch', async () => {
    server.ignoreWritesTo(D.transponderCode);
    const session = await connected();
    await until(() => valueOf(session, D.transponderCode) === 1200);
    await session.write(FEATURE_TRANSPONDER_CODE, D.transponderCode, 4521);
    expect(session.store.getSnapshot().operations[D.transponderCode]?.status).toBe('ok');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(valueOf(session, D.transponderCode)).toBe(1200);
    session.disconnect();
  });

  it('leaves the other radios usable when NAV2’s swap command is missing', async () => {
    server.removeCommand(C.nav2Flip);
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    expect(featureStatus(compatibility, FEATURE_NAV2)).toBe('unavailable');
    for (const id of [FEATURE_COM1, FEATURE_COM2, FEATURE_NAV1]) {
      expect(featureStatus(compatibility, id)).toBe('available');
    }
    await session.activate(FEATURE_NAV2, C.nav2Flip);
    expect(session.store.getSnapshot().operations[C.nav2Flip]?.refusal).toBe('unavailable');
    session.disconnect();
  });

  it('treats a simulator without the assigned code as partial, never as unavailable', async () => {
    server.removeDataRef(D.atcAssignedCode);
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    expect(featureStatus(compatibility, FEATURE_TRANSPONDER_CODE)).toBe('partial');
    await session.write(FEATURE_TRANSPONDER_CODE, D.transponderCode, 7000);
    await until(() => valueOf(session, D.transponderCode) === 7000);
    session.disconnect();
  });
});
