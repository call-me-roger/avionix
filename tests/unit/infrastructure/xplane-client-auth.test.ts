import { createLogger, createMemorySink, silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import type {
  SocketCloseEvent,
  SocketMessageEvent,
  WebSocketLike,
} from '@/infrastructure/xplane/websocket/websocket-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';

class FakeSocket implements WebSocketLike {
  readyState = 1;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: SocketCloseEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: SocketMessageEvent) => void) | null = null;
  send(): void {}
  close(): void {
    this.onclose?.({ code: 1000, reason: '', wasClean: true });
  }
}

function clientWith(auth: () => string | null) {
  const urls: string[] = [];
  const sink = createMemorySink();
  const socket = new FakeSocket();
  const client = new XPlaneClient({
    config: { host: 'pc.local', port: 8080 },
    apiVersion: 'v3',
    http: new HttpTransport({ origin: 'http://pc.local:8080' }),
    auth,
    createSocket: (url: string) => {
      urls.push(url);
      queueMicrotask(() => socket.onopen?.({}));
      return socket;
    },
    logger: createLogger('websocket', { sink, minLevel: 'debug' }),
  });
  return { client, urls, sink, socket };
}

function clientAnswering(status: number, body: string) {
  return new XPlaneClient({
    config: { host: 'pc.local', port: 8080 },
    apiVersion: 'v3',
    http: new HttpTransport({
      origin: 'http://pc.local:8080',
      fetchImpl: async () => ({ status, ok: false, text: async () => body }),
    }),
    auth: () => 'stale-token',
    logger: silentLogger,
  });
}

function rejectingClient() {
  return new XPlaneClient({
    config: { host: 'pc.local', port: 8080 },
    apiVersion: 'v3',
    http: new HttpTransport({
      origin: 'http://pc.local:8080',
      fetchImpl: async () => ({
        status: 401,
        ok: false,
        text: async () => '{"error_code":"unauthorized","error_message":"Pair again"}',
      }),
    }),
    auth: () => 'stale-token',
    logger: silentLogger,
  });
}

describe('XPlaneClient when the connector rejects the token', () => {
  // The session re-pairs on UNAUTHORIZED, so the code must survive the per-operation wrapping
  // that otherwise turns every failure into WRITE_FAILED or COMMAND_FAILED.
  it('keeps UNAUTHORIZED on a rejected write', async () => {
    await expect(rejectingClient().setDataRefValue(1, 5)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('keeps UNAUTHORIZED on a rejected command', async () => {
    await expect(rejectingClient().activateCommand(9)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  // The status is what tells a reader whether a write failed on auth, on the DataRef or on
  // the simulator, so the per-operation wrapping must carry it across.
  it('carries the HTTP status into the wrapped operation error', async () => {
    const body = '{"error_code":"not_found","error_message":"No such dataref"}';
    await expect(clientAnswering(404, body).setDataRefValue(1, 5)).rejects.toMatchObject({
      code: 'WRITE_FAILED',
      httpStatus: 404,
    });
    await expect(clientAnswering(404, body).activateCommand(9)).rejects.toMatchObject({
      code: 'COMMAND_FAILED',
      httpStatus: 404,
    });
  });
});

describe('XPlaneClient WebSocket authentication', () => {
  it('builds the plain URL when no token is available', async () => {
    const { client, urls } = clientWith(() => null);
    await client.connectWebSocket();
    expect(urls).toEqual(['ws://pc.local:8080/api/v3']);
    client.disconnectWebSocket();
  });

  it('appends an URL-encoded token query read at connect time', async () => {
    let token: string | null = null;
    const { client, urls, socket } = clientWith(() => token);
    token = 'a+b/c';
    await client.connectWebSocket();
    expect(urls).toEqual(['ws://pc.local:8080/api/v3?token=a%2Bb%2Fc']);
    socket.close();
  });

  it('never writes the token into the log', async () => {
    const { client, sink, socket } = clientWith(() => 'super-secret');
    await client.connectWebSocket();
    socket.close();
    const logged = JSON.stringify(sink.entries);
    expect(logged).not.toContain('super-secret');
    expect(logged).not.toContain('token=');
    expect(logged).toContain('ws://pc.local:8080/api/v3');
  });
});
