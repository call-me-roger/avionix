import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  ENGINES,
  EXTERIOR_LIGHTS,
  FEATURE_ENGINE_START,
  FEATURE_GEAR,
  FEATURE_LIGHTS_EXTERIOR,
  FEATURE_TRIM,
  GEAR,
  SYSTEMS_FEATURES,
  TRIMS,
  starterCommand,
} from '@/domain/systems/controls';
import type { DataRefValue } from '@/domain/simulator/types';
import type { ReconnectPolicy } from '@/utils/backoff';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

/** A fast reconnect schedule, so the socket-drop test does not wait out the real 1 s backoff. */
const FAST_RECONNECT: ReconnectPolicy = {
  maxAttempts: 5,
  baseDelayMs: 20,
  factor: 1,
  maxDelayMs: 50,
  jitterRatio: 0,
};

function createSession(reconnectPolicy?: ReconnectPolicy): SimulatorSession {
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
    ...(reconnectPolicy === undefined ? {} : { reconnectPolicy }),
  });
}

/** Polls until the live stream has driven the session where the test expects it. */
async function until(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('the Systems panel against the mock X-Plane (the toy aircraft)', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  async function connected(reconnectPolicy?: ReconnectPolicy): Promise<SimulatorSession> {
    const session = createSession(reconnectPolicy);
    session.setDemand(SYSTEMS_FEATURES);
    await session.connect(server.host, server.port);
    return session;
  }

  function telemetry(session: SimulatorSession, name: string): DataRefValue | undefined {
    return session.store.getSnapshot().telemetry[name]?.value;
  }

  function trimPosition(session: SimulatorSession): number {
    const value = telemetry(session, TRIMS[0]!.position);
    return typeof value === 'number' ? value : Number.NaN;
  }

  function engineRunning(session: SimulatorSession): number | undefined {
    const value = telemetry(session, ENGINES.running);
    return Array.isArray(value) ? value[0] : undefined;
  }

  function starterHit(session: SimulatorSession): number | undefined {
    const value = telemetry(session, ENGINES.starter);
    return Array.isArray(value) ? value[0] : undefined;
  }

  it('turns the beacon on', async () => {
    const session = await connected();
    const beacon = EXTERIOR_LIGHTS[0]!;
    expect(await session.activate(FEATURE_LIGHTS_EXTERIOR, beacon.on)).toBe('ok');
    await until(() => telemetry(session, beacon.state) === 1);
    session.disconnect();
  });

  it('raises the gear: the handle drops at once and the deployment lamps follow within 3 s', async () => {
    const session = await connected();
    expect(await session.activate(FEATURE_GEAR, GEAR.up)).toBe('ok');
    await until(() => telemetry(session, GEAR.handle) === 0);
    await until(() => {
      const value = telemetry(session, GEAR.deployment);
      return Array.isArray(value) && value[0] === 0 && value[1] === 0 && value[2] === 0;
    }, 3000);
    session.disconnect();
  });

  it('moves pitch trim about 0.1 over a 1 s hold, then stays put after release', async () => {
    const session = await connected();
    const name = TRIMS[0]!.increase.command;
    expect(await session.holdCommand(FEATURE_TRIM, name, 'press')).toBe('ok');
    // Renew every 200 ms for about 1 s, as a held key does.
    for (let i = 0; i < 5; i += 1) {
      await sleep(200);
      expect(await session.holdCommand(FEATURE_TRIM, name, 'renew')).toBe('ok');
    }
    expect(await session.holdCommand(FEATURE_TRIM, name, 'release')).toBe('ok');

    const afterHold = trimPosition(session);
    expect(afterHold).toBeGreaterThanOrEqual(0.05);
    expect(afterHold).toBeLessThanOrEqual(0.15);

    await sleep(500);
    expect(Math.abs(trimPosition(session) - afterHold)).toBeLessThan(0.03);
    session.disconnect();
  });

  it('lets an unrenewed hold lapse: trim stops within 700 ms and the lease is gone', async () => {
    const session = await connected();
    const name = TRIMS[0]!.increase.command;
    expect(await session.holdCommand(FEATURE_TRIM, name, 'press')).toBe('ok');

    await until(() => server.heldCommandNames().length === 0, 700);
    const afterLapse = trimPosition(session);
    await sleep(300);
    expect(Math.abs(trimPosition(session) - afterLapse)).toBeLessThan(0.03);
    expect(server.heldCommandNames()).toEqual([]);
    session.disconnect();
  });

  it('drops a hold when the server socket closes, and refuses a renewal after the session reconnects', async () => {
    const session = await connected(FAST_RECONNECT);
    const name = TRIMS[0]!.increase.command;
    expect(await session.holdCommand(FEATURE_TRIM, name, 'press')).toBe('ok');

    server.terminateAllSockets();
    await until(() => server.heldCommandNames().length === 0);

    // The mock clears the hold the instant its socket closes, so trim is already stationary.
    // Telemetry can briefly go unresolved while the session reconnects and resubscribes, so read
    // it only once the session is back to 'connected' with a fresh value in hand.
    await until(
      () =>
        session.store.getSnapshot().state === 'connected' && Number.isFinite(trimPosition(session)),
    );
    const settled = trimPosition(session);
    await sleep(300);
    expect(Math.abs(trimPosition(session) - settled)).toBeLessThan(0.03);

    expect(await session.holdCommand(FEATURE_TRIM, name, 'renew')).toBe('refused');
    session.disconnect();
  });

  it('cranks the starter for 2.5 s to start the engine, and clears starter_hit on release', async () => {
    const session = await connected();
    const name = starterCommand(1);
    expect(await session.holdCommand(FEATURE_ENGINE_START, name, 'press')).toBe('ok');
    for (let elapsed = 0; elapsed < 2500; elapsed += 200) {
      await sleep(200);
      await session.holdCommand(FEATURE_ENGINE_START, name, 'renew');
    }
    await until(() => engineRunning(session) === 1);

    expect(await session.holdCommand(FEATURE_ENGINE_START, name, 'release')).toBe('ok');
    await until(() => starterHit(session) === 0);
    session.disconnect();
  }, 15_000);

  it('leaves the beacon off when the aircraft ignores the command, though the press itself succeeds', async () => {
    const session = await connected();
    const beacon = EXTERIOR_LIGHTS[0]!;
    server.ignoreCommand(beacon.on);
    expect(await session.activate(FEATURE_LIGHTS_EXTERIOR, beacon.on)).toBe('ok');
    await sleep(300);
    expect(telemetry(session, beacon.state)).toBe(0);
    session.disconnect();
  });
});
