import { isAvionixError } from '@/domain/errors/avionix-error';
import type { DataRefUpdate } from '@/domain/simulator/types';
import type { SocketCloseInfo } from '@/domain/simulator/simulator-client';
import { createLogger, createMemorySink } from '@/infrastructure/logging/logger';
import { WebSocketTransport } from '@/infrastructure/xplane/websocket/websocket-transport';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return isAvionixError(error) ? error.code : `not avionix: ${String(error)}`;
  }
}

function waitFor<T>(
  register: (resolve: (value: T) => void) => () => void,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('timed out waiting'));
    }, timeoutMs);
    const unsubscribe = register((value) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    });
  });
}

describe('WebSocketTransport', () => {
  let server: MockXPlaneServer;
  const sink = createMemorySink();
  const logger = createLogger('websocket', { sink, minLevel: 'debug' });

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    sink.entries.length = 0;
  });

  afterEach(async () => {
    await server.stop();
  });

  function transport(
    overrides: Partial<{ url: string; requestTimeoutMs: number; connectTimeoutMs: number }> = {},
  ) {
    return new WebSocketTransport({
      url: overrides.url ?? `ws://${server.host}:${server.port}/api/v3`,
      logger,
      requestTimeoutMs: overrides.requestTimeoutMs ?? 2000,
      connectTimeoutMs: overrides.connectTimeoutMs ?? 2000,
    });
  }

  it('connects, subscribes and receives typed updates, then closes cleanly', async () => {
    const ws = transport();
    await ws.connect();
    expect(ws.isOpen).toBe(true);

    const firstUpdate = waitFor<DataRefUpdate[]>((resolve) => ws.onDataRefUpdate(resolve));
    await ws.send('dataref_subscribe_values', { datarefs: [{ id: 1001 }] });
    const updates = await firstUpdate;
    expect(updates).toEqual([{ id: 1001, value: 12.5, receivedAt: expect.any(Number) }]);

    const closed = waitFor<SocketCloseInfo>((resolve) => ws.onClose(resolve));
    ws.close();
    expect(await closed).toMatchObject({ initiatedByClient: true });
    expect(ws.isOpen).toBe(false);
  });

  it('rejects connect when the server refuses the path', async () => {
    const ws = transport({ url: `ws://${server.host}:${server.port}/api/v9` });
    await expect(codeOf(ws.connect())).resolves.toBe('WEBSOCKET_ERROR');
  });

  it('rejects connect with TIMEOUT when nothing answers', async () => {
    const ws = transport({ url: 'ws://192.0.2.1:8086/api/v3', connectTimeoutMs: 100 });
    await expect(codeOf(ws.connect())).resolves.toBe('TIMEOUT');
  });

  it('surfaces simulator errors for a failed request', async () => {
    const ws = transport();
    await ws.connect();
    await expect(
      codeOf(ws.send('dataref_subscribe_values', { datarefs: [{ id: 42 }] })),
    ).resolves.toBe('DATAREF_NOT_FOUND');
    ws.close();
  });

  it('correlates concurrent requests', async () => {
    const ws = transport();
    await ws.connect();
    const results = await Promise.all([
      codeOf(ws.send('dataref_subscribe_values', { datarefs: [{ id: 1001 }] })),
      codeOf(ws.send('bogus_type' as never, {})),
      codeOf(ws.send('dataref_unsubscribe_values', { datarefs: 'all' })),
    ]);
    expect(results).toEqual(['resolved', 'SIMULATOR_ERROR', 'resolved']);
    ws.close();
  });

  it('ignores malformed and unknown messages without crashing', async () => {
    const ws = transport();
    await ws.connect();
    server.sendRawToAll('{not json');
    server.sendRawToAll(JSON.stringify({ type: 'future_message', data: 1 }));
    server.sendRawToAll(JSON.stringify({ type: 'dataref_update_values', data: { '1': null } }));
    server.sendRawToAll(JSON.stringify({ req_id: 77, type: 'result', success: true }));
    await ws.send('dataref_unsubscribe_values', { datarefs: 'all' });
    expect(ws.isOpen).toBe(true);
    expect(sink.entries.filter((e) => e.level === 'warn').length).toBeGreaterThanOrEqual(3);
    ws.close();
  });

  it('rejects pending requests with CANCELLED when the server drops the socket', async () => {
    const ws = transport({ requestTimeoutMs: 5000 });
    await ws.connect();
    const closed = waitFor<SocketCloseInfo>((resolve) => ws.onClose(resolve));
    server.pauseReplies = true;
    const pending = codeOf(ws.send('dataref_subscribe_values', { datarefs: [{ id: 1001 }] }));
    server.terminateAllSockets();
    expect(await closed).toMatchObject({ initiatedByClient: false });
    await expect(pending).resolves.toBe('CANCELLED');
  });

  it('rejects send when not connected', async () => {
    const ws = transport();
    await expect(codeOf(ws.send('dataref_unsubscribe_values', { datarefs: 'all' }))).resolves.toBe(
      'WEBSOCKET_ERROR',
    );
  });

  it('close is idempotent and does not emit onClose twice', async () => {
    const ws = transport();
    await ws.connect();
    let closes = 0;
    ws.onClose(() => {
      closes += 1;
    });
    ws.close();
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closes).toBe(1);
  });
});
