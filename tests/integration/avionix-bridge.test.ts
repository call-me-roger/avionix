import fs from 'node:fs';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { startBridge } from '../../scripts/avionix-bridge';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasType(value: unknown, type: string): boolean {
  return isRecord(value) && value.type === type;
}

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
  return value !== null && typeof value === 'object';
}

function listenAndGetPort(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!isAddressInfo(address)) throw new Error('server has no address after listen');
      resolve(address.port);
    });
  });
}

function openSocket(url: string, timeoutMs = 2000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      reject(new Error(`openSocket: timed out connecting to ${url} within ${timeoutMs}ms`));
    }, timeoutMs);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`openSocket: socket error while opening ${url}`));
    });
  });
}

function nextMessage(
  socket: WebSocket,
  predicate: (m: unknown) => boolean,
  timeoutMs = 2000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', handler);
      reject(
        new Error(`nextMessage: timed out waiting for a matching message within ${timeoutMs}ms`),
      );
    }, timeoutMs);
    const handler = (event: { data: unknown }): void => {
      const parsed: unknown = JSON.parse(String(event.data));
      if (predicate(parsed)) {
        clearTimeout(timer);
        socket.removeEventListener('message', handler);
        resolve(parsed);
      }
    };
    socket.addEventListener('message', handler);
  });
}

async function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Opens a raw TCP connection, writes requestText, and collects bytes until the peer closes. */
function rawHttp(port: number, requestText: string, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(`rawHttp: timed out waiting for a response to ${JSON.stringify(requestText)}`),
      );
    }, timeoutMs);
    socket.on('connect', () => socket.write(requestText));
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** A raw TCP "X-Plane" that sends valid chunked headers then a malformed chunk. */
function startBrokenChunkedUpstream(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => undefined);
      // Stay in flowing mode so this socket notices the bridge destroying its
      // side of the connection once the malformed chunk trips the parser,
      // instead of sitting paused (and undetected-closed) until GC.
      socket.resume();
      socket.once('data', () => {
        socket.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n');
        socket.write('not-a-valid-chunk-size\r\n');
      });
    });
    server.on('error', () => undefined);
    listenAndGetPort(server).then((port) => {
      resolve({
        port,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

describe('Avionix bridge', () => {
  let xplane: MockXPlaneServer;
  let bridge: Awaited<ReturnType<typeof startBridge>>;
  let staticDir: string;
  let base: string;

  beforeEach(async () => {
    xplane = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-web-'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Avionix</title>');
    fs.mkdirSync(path.join(staticDir, '_expo'));
    fs.writeFileSync(path.join(staticDir, '_expo', 'app.js'), 'console.log(1)');
    bridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      log: () => undefined,
    });
    base = `http://127.0.0.1:${bridge.port}`;
  });

  afterEach(async () => {
    await bridge.close();
    await xplane.stop();
    fs.rmSync(staticDir, { recursive: true, force: true });
  });

  it('serves the static site with an index.html fallback and content types', async () => {
    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toContain('Avionix');
    const js = await fetch(`${base}/_expo/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    const fallback = await fetch(`${base}/some/client/route`);
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toContain('Avionix');
    const notApi = await fetch(`${base}/apifoo`);
    expect(notApi.status).toBe(200);
    expect(await notApi.text()).toContain('Avionix');
  });

  it('falls back to index.html for path traversal, over both a literal and a percent-encoded payload', async () => {
    const literal = await rawHttp(
      bridge.port,
      `GET /../package.json HTTP/1.1\r\nHost: 127.0.0.1:${bridge.port}\r\nConnection: close\r\n\r\n`,
    );
    expect(literal).toContain(' 200 ');
    expect(literal).toContain('Avionix');
    expect(literal).not.toContain('"name": "avionix"');

    const encoded = await rawHttp(
      bridge.port,
      `GET /%2e%2e%2f%2e%2e%2fpackage.json HTTP/1.1\r\nHost: 127.0.0.1:${bridge.port}\r\nConnection: close\r\n\r\n`,
    );
    expect(encoded).toContain(' 200 ');
    expect(encoded).toContain('Avionix');
    expect(encoded).not.toContain('"name": "avionix"');
  });

  it('C1: falls back to index.html for a malformed percent-escape instead of crashing', async () => {
    const response = await rawHttp(
      bridge.port,
      `GET /%ZZ HTTP/1.1\r\nHost: 127.0.0.1:${bridge.port}\r\nConnection: close\r\n\r\n`,
    );
    expect(response).toContain(' 200 ');
    expect(response).toContain('Avionix');

    // The process must still be alive and serving.
    const followUp = await fetch(`${base}/`);
    expect(followUp.status).toBe(200);
  });

  it('proxies REST calls to X-Plane and adds CORS headers', async () => {
    const caps = await fetch(`${base}/api/capabilities`, {
      headers: { Origin: 'http://tablet.local' },
    });
    expect(caps.status).toBe(200);
    expect(caps.headers.get('access-control-allow-origin')).toBe('*');
    expect(await caps.json()).toEqual({
      api: { versions: ['v1', 'v2', 'v3'] },
      'x-plane': { version: '12.4.0' },
    });

    const preflight = await fetch(`${base}/api/v3/datarefs/1003/value`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://tablet.local', 'Access-Control-Request-Method': 'PATCH' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Content-Type');

    const patch = await fetch(`${base}/api/v3/datarefs/1003/value`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ data: 90 }),
    });
    expect(patch.status).toBe(200);
    expect(xplane.writes).toEqual([{ id: 1003, value: 90 }]);

    const missing = await fetch(`${base}/api/v3/datarefs?filter[name]=sim/nope`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error_code: 'invalid_dataref_name' });
  });

  it('C2: destroys the client response instead of crashing when the upstream errors after headers are sent', async () => {
    const broken = await startBrokenChunkedUpstream();
    const brokenBridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: '127.0.0.1',
      xplanePort: broken.port,
      staticDir,
      log: () => undefined,
    });
    try {
      const brokenBase = `http://127.0.0.1:${brokenBridge.port}`;
      let bodyFailed = false;
      try {
        const response = await fetch(`${brokenBase}/api/v3/datarefs/1001/value`);
        await response.text();
      } catch {
        bodyFailed = true;
      }
      expect(bodyFailed).toBe(true);

      // The bridge process/handle must still be alive afterwards.
      const followUp = await fetch(`${brokenBase}/`);
      expect(followUp.status).toBe(200);
    } finally {
      await brokenBridge.close();
      await broken.close();
    }
  });

  it('relays WebSocket connections to X-Plane and closes upstream with the client', async () => {
    const socket = await openSocket(`ws://127.0.0.1:${bridge.port}/api/v3`);
    await until(() => xplane.connectionCount === 1);
    const result = nextMessage(socket, (m) => hasType(m, 'result'));
    socket.send(
      JSON.stringify({
        req_id: 1,
        type: 'dataref_subscribe_values',
        params: { datarefs: [{ id: 1001 }] },
      }),
    );
    expect(await result).toEqual({ req_id: 1, type: 'result', success: true });
    const update = await nextMessage(socket, (m) => hasType(m, 'dataref_update_values'));
    expect(update).toEqual({ type: 'dataref_update_values', data: { '1001': 12.5 } });
    socket.close();
    await until(() => xplane.connectionCount === 0);
  });

  it('I1: closes relayed sockets when the bridge is closed without the client closing first', async () => {
    const socket = await openSocket(`ws://127.0.0.1:${bridge.port}/api/v3`);
    await until(() => xplane.connectionCount === 1);
    const result = nextMessage(socket, (m) => hasType(m, 'result'));
    socket.send(
      JSON.stringify({
        req_id: 1,
        type: 'dataref_subscribe_values',
        params: { datarefs: [{ id: 1001 }] },
      }),
    );
    await result;

    const clientClosed = new Promise<void>((resolve) => {
      socket.addEventListener('close', () => resolve());
    });

    const closeTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('bridge.close() did not resolve within 1s')), 1000);
    });
    await Promise.race([bridge.close(), closeTimeout]);

    const clientCloseTimeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('client socket did not close within 1s of bridge.close()')),
        1000,
      );
    });
    await Promise.race([clientClosed, clientCloseTimeout]);

    // close() must be idempotent so afterEach's own bridge.close() is a no-op here.
    await expect(bridge.close()).resolves.toBeUndefined();
  });

  it('I2: destroys the upstream connection when the client aborts the request', async () => {
    const stuck = net.createServer((socket) => {
      socket.on('error', () => undefined);
      // Never respond: simulate an X-Plane that hangs. Resume so a paused,
      // never-read socket still notices the peer's FIN/RST once we destroy it.
      socket.resume();
    });
    stuck.on('error', () => undefined);
    const activeSockets = new Set<net.Socket>();
    stuck.on('connection', (socket) => {
      activeSockets.add(socket);
      socket.on('close', () => activeSockets.delete(socket));
    });
    const stuckPort = await listenAndGetPort(stuck);
    const stuckBridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: '127.0.0.1',
      xplanePort: stuckPort,
      staticDir,
      log: () => undefined,
    });
    try {
      const stuckBase = `http://127.0.0.1:${stuckBridge.port}`;
      const controller = new AbortController();
      const pending = fetch(`${stuckBase}/api/v3/datarefs/1001/value`, {
        signal: controller.signal,
      }).catch(() => undefined);

      await until(() => activeSockets.size === 1);
      setTimeout(() => controller.abort(), 50);
      await until(() => activeSockets.size === 0, 1000);
      await pending;
    } finally {
      await stuckBridge.close();
      await new Promise<void>((done) => stuck.close(() => done()));
    }
  });

  it('answers 502 when X-Plane is down', async () => {
    await xplane.stop();
    const response = await fetch(`${base}/api/capabilities`);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error_code: 'bridge_upstream_unreachable' });
    xplane = await MockXPlaneServer.start();
  });
});
