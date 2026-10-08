import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { audioModel } from '@/domain/audio/audio-model';
import {
  AUDIO_FEATURES,
  AUDIO_STATE_NAMES,
  FEATURE_AUDIO_MONITOR,
  FEATURE_AUDIO_TRANSMIT,
  MICS,
  MONITORS,
} from '@/domain/audio/catalogue';
import { audioReader } from '@/features/panels/radios/audio-reader';
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

describe('the audio panel against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(AUDIO_FEATURES);
    await session.connect(server.host, server.port);
    await until(() => audioModel(audioReader(session.store.getSnapshot())).status === 'ready');
    return session;
  }

  const model = (session: SimulatorSession) => audioModel(audioReader(session.store.getSnapshot()));
  const heard = (session: SimulatorSession) =>
    Object.fromEntries(model(session).monitors.map((key) => [key.spec.legend, key.listening]));

  it('keeps transmit exclusive and reads the simulator’s resulting state', async () => {
    const session = await connected();
    // `status: 'ready'` only means the names resolved; the first subscribed value can still be
    // in flight, same race `radios-transponder.test.ts` waits out before its first assertion.
    await until(() => model(session).transmitting === 1);
    expect(await session.activate(FEATURE_AUDIO_TRANSMIT, MICS[1]!.command)).toBe('ok');
    await until(() => model(session).transmitting === 2);
    expect(model(session).mics.map((mic) => mic.selected)).toEqual([false, true]);
    // As X-Plane does: the new MIC's COM is heard and the other COM muted.
    await until(() => heard(session).COM2 === 'auto' || heard(session).COM2 === 'on');
    expect(heard(session).COM1).toBe('off');
    session.disconnect();
  });

  it('turns a receiver on and off independently', async () => {
    const session = await connected();
    const nav1 = MONITORS.find((spec) => spec.key === 'nav1')!;
    expect(await session.activate(FEATURE_AUDIO_MONITOR, nav1.on)).toBe('ok');
    await until(() => heard(session).NAV1 === 'on');
    expect(await session.activate(FEATURE_AUDIO_MONITOR, nav1.off)).toBe('ok');
    await until(() => heard(session).NAV1 === 'off');
    session.disconnect();
  });

  it('leaves transmit and receive working when the marker flag is missing', async () => {
    server.removeDataRef(MONITORS.find((spec) => spec.key === 'mkr')!.state);
    const session = await connected();
    expect(model(session).missing).toEqual(['MKR']);
    expect(model(session).mics).toHaveLength(2);
    expect(await session.activate(FEATURE_AUDIO_TRANSMIT, MICS[1]!.command)).toBe('ok');
    await until(() => model(session).transmitting === 2);
    session.disconnect();
  });

  it('is one sentence when no audio name resolves', async () => {
    for (const name of AUDIO_STATE_NAMES) {
      server.removeDataRef(name);
    }
    const session = createSession();
    session.setDemand(AUDIO_FEATURES);
    await session.connect(server.host, server.port);
    await until(
      () => audioModel(audioReader(session.store.getSnapshot())).status === 'unavailable',
    );
    session.disconnect();
  });
});
