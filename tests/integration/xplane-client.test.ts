import { isAvionixError } from '@/domain/errors/avionix-error';
import type { DataRefUpdate } from '@/domain/simulator/types';
import { silentLogger } from '@/infrastructure/logging/logger';
import { probeCapabilities } from '@/infrastructure/xplane/capabilities';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import type { WebSocketLike } from '@/infrastructure/xplane/websocket/websocket-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return isAvionixError(error) ? error.code : `not avionix: ${String(error)}`;
  }
}

async function waitForCondition(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function fakeSocket(): WebSocketLike & { close: jest.Mock } {
  return {
    readyState: 0,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send: () => undefined,
    close: jest.fn(),
  };
}

describe('probeCapabilities', () => {
  it('returns capabilities from the unversioned endpoint', async () => {
    const server = await MockXPlaneServer.start({
      apiVersions: ['v1', 'v2'],
      xplaneVersion: '12.1.4',
    });
    try {
      const http = new HttpTransport({
        origin: `http://${server.host}:${server.port}`,
        logger: silentLogger,
      });
      await expect(probeCapabilities(http)).resolves.toEqual({
        simulatorVersion: '12.1.4',
        supportedApiVersions: ['v1', 'v2'],
        rawApiVersions: ['v1', 'v2'],
      });
    } finally {
      await server.stop();
    }
  });

  it('maps a 404 (X-Plane older than 12.1.4) to UNSUPPORTED_API', async () => {
    const server = await MockXPlaneServer.start({ capabilitiesMode: 'not_found' });
    try {
      const http = new HttpTransport({
        origin: `http://${server.host}:${server.port}`,
        logger: silentLogger,
      });
      try {
        await probeCapabilities(http);
        throw new Error('expected rejection');
      } catch (error) {
        expect(isAvionixError(error) && error.code).toBe('UNSUPPORTED_API');
        expect(isAvionixError(error) && error.message).toContain('12.1.4');
      }
    } finally {
      await server.stop();
    }
  });

  it('maps a plain 403 to INCOMING_TRAFFIC_DISABLED', async () => {
    const server = await MockXPlaneServer.start();
    server.incomingTrafficDisabled = true;
    try {
      const http = new HttpTransport({
        origin: `http://${server.host}:${server.port}`,
        logger: silentLogger,
      });
      await expect(codeOf(probeCapabilities(http))).resolves.toBe('INCOMING_TRAFFIC_DISABLED');
    } finally {
      await server.stop();
    }
  });
});

describe.each(['v2', 'v3'] as const)('XPlaneClient over %s', (apiVersion) => {
  let server: MockXPlaneServer;
  let client: XPlaneClient;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    const config = { host: server.host, port: server.port };
    client = new XPlaneClient({
      config,
      apiVersion,
      http: new HttpTransport({
        origin: `http://${server.host}:${server.port}`,
        logger: silentLogger,
      }),
      logger: silentLogger,
      requestTimeoutMs: 2000,
      connectTimeoutMs: 2000,
    });
  });

  afterEach(async () => {
    client.disconnectWebSocket();
    await server.stop();
  });

  it('resolves datarefs and commands by name, returning null for unknown names', async () => {
    await expect(client.findDataRef('sim/time/total_running_time_sec')).resolves.toEqual({
      id: 1001,
      name: 'sim/time/total_running_time_sec',
      valueType: 'float',
    });
    await expect(client.findDataRef('sim/does/not/exist')).resolves.toBeNull();
    await expect(client.findCommand('sim/autopilot/heading_up')).resolves.toEqual({
      id: 2001,
      name: 'sim/autopilot/heading_up',
      description: 'Autopilot heading up.',
    });
    await expect(client.findCommand('sim/nope')).resolves.toBeNull();
  });

  it('reads scalar, array, indexed and data values', async () => {
    await expect(client.getDataRefValue(1003)).resolves.toBe(270);
    await expect(client.getDataRefValue(1004)).resolves.toEqual([10, 20, 30]);
    await expect(client.getDataRefValue(1004, 1)).resolves.toBe(20);
    await expect(client.getDataRefValue(1005)).resolves.toBe('TklsNzc=');
    await expect(codeOf(client.getDataRefValue(999999))).resolves.toBe('DATAREF_NOT_FOUND');
  });

  it('writes values and maps write failures to WRITE_FAILED with the underlying code', async () => {
    await client.setDataRefValue(1003, 180);
    expect(server.writes).toEqual([{ id: 1003, value: 180 }]);
    try {
      await client.setDataRefValue(1001, 5);
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('WRITE_FAILED');
      expect(isAvionixError(error) && error.simulatorErrorCode).toBe('dataref_is_readonly');
    }
  });

  it('activates commands with a duration and maps failures to COMMAND_FAILED', async () => {
    await client.activateCommand(2001);
    await client.activateCommand(2001, 0.5);
    expect(server.activations).toEqual([
      { id: 2001, duration: 0 },
      { id: 2001, duration: 0.5 },
    ]);
    try {
      await client.activateCommand(4242);
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('COMMAND_FAILED');
      expect(isAvionixError(error) && error.simulatorErrorCode).toBe('invalid_command_id');
    }
  });

  it('subscribes over WebSocket and emits updates, then unsubscribes and disconnects', async () => {
    await client.connectWebSocket();
    const received: DataRefUpdate[][] = [];
    client.onDataRefUpdate((updates) => received.push(updates));
    await client.subscribeDataRefs([{ id: 1001 }, { id: 1003 }]);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(received[0]).toEqual([
      { id: 1001, value: 12.5, receivedAt: expect.any(Number) },
      { id: 1003, value: 270, receivedAt: expect.any(Number) },
    ]);
    server.setDataRefValue('sim/time/total_running_time_sec', 99);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(received.at(-1)).toEqual([{ id: 1001, value: 99, receivedAt: expect.any(Number) }]);
    await client.unsubscribeDataRefs('all');
    const closed = new Promise((resolve) => client.onSocketClosed(resolve));
    client.disconnectWebSocket();
    await expect(closed).resolves.toMatchObject({ initiatedByClient: true });
  });

  it('maps subscription failures to SUBSCRIPTION_FAILED', async () => {
    await client.connectWebSocket();
    try {
      await client.subscribeDataRefs([{ id: 31337 }]);
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('SUBSCRIPTION_FAILED');
      expect(isAvionixError(error) && error.simulatorErrorCode).toBe('invalid_dataref_id');
    }
  });

  it('shares one outcome between concurrent connectWebSocket calls', async () => {
    const first = client.connectWebSocket();
    const second = client.connectWebSocket();
    await Promise.all([first, second]);
    await waitForCondition(() => server.connectionCount === 1);
    expect(server.connectionCount).toBe(1);
    client.disconnectWebSocket();
  });

  it('rejects concurrent connect attempts with TIMEOUT and starts a fresh attempt afterwards', async () => {
    jest.useFakeTimers();
    try {
      let callCount = 0;
      const failingClient = new XPlaneClient({
        config: { host: server.host, port: server.port },
        apiVersion,
        http: new HttpTransport({
          origin: `http://${server.host}:${server.port}`,
          logger: silentLogger,
        }),
        logger: silentLogger,
        connectTimeoutMs: 50,
        createSocket: () => {
          callCount += 1;
          return fakeSocket();
        },
      });

      const firstConnect = codeOf(failingClient.connectWebSocket());
      const secondConnect = codeOf(failingClient.connectWebSocket());
      await jest.advanceTimersByTimeAsync(51);
      await expect(firstConnect).resolves.toBe('TIMEOUT');
      await expect(secondConnect).resolves.toBe('TIMEOUT');
      expect(callCount).toBe(1);

      const thirdConnect = codeOf(failingClient.connectWebSocket());
      expect(callCount).toBe(2);
      await jest.advanceTimersByTimeAsync(51);
      await expect(thirdConnect).resolves.toBe('TIMEOUT');

      failingClient.disconnectWebSocket();
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses versioned paths', async () => {
    await client.findDataRef('sim/time/total_running_time_sec');
    const other = await MockXPlaneServer.start({ apiVersions: ['v1'] });
    try {
      const v1Only = new XPlaneClient({
        config: { host: other.host, port: other.port },
        apiVersion,
        http: new HttpTransport({
          origin: `http://${other.host}:${other.port}`,
          logger: silentLogger,
        }),
        logger: silentLogger,
      });
      await expect(codeOf(v1Only.findDataRef('sim/time/total_running_time_sec'))).resolves.toBe(
        'HTTP_ERROR',
      );
    } finally {
      await other.stop();
    }
  });
});
