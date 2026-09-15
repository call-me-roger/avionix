import fs from 'node:fs';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { startBridge } from '../../scripts/avionix-bridge';
import { createNullAdvertiser } from '../../scripts/avionix-connector-mdns';
import type { Advertiser } from '../../scripts/avionix-connector-mdns';
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
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onError);
      const address = server.address();
      if (!isAddressInfo(address)) throw new Error('server has no address after listen');
      resolve(address.port);
    });
  });
}

type MessageReader = (predicate: (msg: unknown) => boolean, timeoutMs?: number) => Promise<unknown>;

/**
 * Buffers every parsed frame as soon as it arrives and lets waiters scan that buffer first,
 * consuming each entry at most once, before parking a predicate. This avoids a race where a
 * `message` event fires synchronously (Node can dispatch several frames from one TCP read
 * back-to-back) before the next `next()`-style listener has been attached, which would
 * otherwise drop the frame and hang the waiting promise forever. Mirrors
 * `tests/integration/mock-xplane-server.test.ts`'s `createMessageReader`.
 */
function createMessageReader(socket: WebSocket): MessageReader {
  const buffer: unknown[] = [];
  const waiters: { predicate: (m: unknown) => boolean; resolve: (m: unknown) => void }[] = [];
  socket.addEventListener('message', (event: MessageEvent) => {
    const parsed: unknown = JSON.parse(String(event.data));
    const index = waiters.findIndex((w) => w.predicate(parsed));
    if (index >= 0) {
      const [w] = waiters.splice(index, 1);
      w?.resolve(parsed);
      return;
    }
    buffer.push(parsed);
  });
  return function next(predicate: (m: unknown) => boolean, timeoutMs = 2000): Promise<unknown> {
    const i = buffer.findIndex(predicate);
    if (i >= 0) {
      const [m] = buffer.splice(i, 1);
      return Promise.resolve(m);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const k = waiters.findIndex((w) => w.resolve === wrapped);
        if (k >= 0) {
          waiters.splice(k, 1);
        }
        reject(new Error(`next: timed out waiting for a matching message within ${timeoutMs}ms`));
      }, timeoutMs);
      const wrapped = (m: unknown): void => {
        clearTimeout(timer);
        resolve(m);
      };
      waiters.push({ predicate, resolve: wrapped });
    });
  };
}

function openSocket(
  url: string,
  timeoutMs = 2000,
): Promise<{ socket: WebSocket; next: MessageReader }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      reject(new Error(`openSocket: timed out connecting to ${url} within ${timeoutMs}ms`));
    }, timeoutMs);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      // Attached before resolving, so no frame the server sends immediately after
      // connecting can be dispatched before a reader exists to buffer it.
      const next = createMessageReader(socket);
      resolve({ socket, next });
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`openSocket: socket error while opening ${url}`));
    });
  });
}

/** Races `promise` against a `ms`-timeout, always clearing the timer so it never lingers. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
  return new Promise((resolve, reject) => {
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
    // Swallow post-listen server errors (listenAndGetPort's own listener already
    // handles a failure during listen(), and is removed once that succeeds).
    server.on('error', () => undefined);
    listenAndGetPort(server)
      .then((port) => {
        resolve({
          port,
          close: () =>
            new Promise((done) => {
              for (const socket of sockets) socket.destroy();
              server.close(() => done());
            }),
        });
      })
      .catch(reject);
  });
}

/** A raw TCP "X-Plane" that records the request line + headers of each request it gets. */
function startRecordingUpstream(): Promise<{
  port: number;
  requests: string[];
  close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const requests: string[] = [];
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => undefined);
      let buffered = '';
      socket.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('utf8');
        const headerEnd = buffered.indexOf('\r\n\r\n');
        if (headerEnd >= 0) {
          requests.push(buffered.slice(0, headerEnd));
          // end() (not write()) so a raw byte-piping caller (the WebSocket relay path,
          // which never parses HTTP) also observes the connection actually close.
          socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}');
        }
      });
    });
    server.on('error', () => undefined);
    listenAndGetPort(server)
      .then((port) => {
        resolve({
          port,
          requests,
          close: () =>
            new Promise((done) => {
              for (const socket of sockets) socket.destroy();
              server.close(() => done());
            }),
        });
      })
      .catch(reject);
  });
}

/** Builds a minimal but fully-typed IPv4 network interface entry for computeUrls tests. */
function ipv4(address: string, internal: boolean): os.NetworkInterfaceInfoIPv4 {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  };
}

describe('Avionix bridge', () => {
  let xplane: MockXPlaneServer;
  let bridge: Awaited<ReturnType<typeof startBridge>>;
  let staticDir: string;
  let base: string;
  let outsideDir: string | undefined;

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
      open: true,
      advertiser: createNullAdvertiser(),
      log: () => undefined,
    });
    base = `http://127.0.0.1:${bridge.port}`;
  });

  afterEach(async () => {
    await bridge.close();
    await xplane.stop();
    fs.rmSync(staticDir, { recursive: true, force: true });
    if (outsideDir !== undefined) {
      fs.rmSync(outsideDir, { recursive: true, force: true });
      outsideDir = undefined;
    }
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

  it('falls back to index.html for a symlinked file that escapes the static dir', async () => {
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-outside-'));
    const secretFile = path.join(outsideDir, 'secret.txt');
    fs.writeFileSync(secretFile, 'TOP-SECRET');
    fs.symlinkSync(secretFile, path.join(staticDir, 'link.txt'));

    const response = await fetch(`${base}/link.txt`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('Avionix');
    expect(body).not.toContain('TOP-SECRET');
  });

  it('falls back to index.html for a symlinked directory that escapes the static dir', async () => {
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-outside-'));
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'TOP-SECRET');
    fs.symlinkSync(outsideDir, path.join(staticDir, 'outdir'));

    const response = await fetch(`${base}/outdir/secret.txt`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('Avionix');
    expect(body).not.toContain('TOP-SECRET');
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
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');

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
    let broken: Awaited<ReturnType<typeof startBrokenChunkedUpstream>> | undefined;
    let brokenBridge: Awaited<ReturnType<typeof startBridge>> | undefined;
    try {
      broken = await startBrokenChunkedUpstream();
      brokenBridge = await startBridge({
        port: 0,
        host: '127.0.0.1',
        xplaneHost: '127.0.0.1',
        xplanePort: broken.port,
        staticDir,
        open: true,
        advertiser: createNullAdvertiser(),
        log: () => undefined,
      });
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
      await brokenBridge?.close();
      await broken?.close();
    }
  });

  it('relays WebSocket connections to X-Plane and closes upstream with the client', async () => {
    const { socket, next } = await openSocket(`ws://127.0.0.1:${bridge.port}/api/v3`);
    await until(() => xplane.connectionCount === 1);
    const result = next((m) => hasType(m, 'result'));
    socket.send(
      JSON.stringify({
        req_id: 1,
        type: 'dataref_subscribe_values',
        params: { datarefs: [{ id: 1001 }] },
      }),
    );
    expect(await result).toEqual({ req_id: 1, type: 'result', success: true });
    const update = await next((m) => hasType(m, 'dataref_update_values'));
    expect(update).toEqual({ type: 'dataref_update_values', data: { '1001': 12.5 } });
    socket.close();
    await until(() => xplane.connectionCount === 0);
  });

  it('I1: closes relayed sockets when the bridge is closed without the client closing first', async () => {
    const { socket, next } = await openSocket(`ws://127.0.0.1:${bridge.port}/api/v3`);
    await until(() => xplane.connectionCount === 1);
    const result = next((m) => hasType(m, 'result'));
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

    await withTimeout(bridge.close(), 1000, 'bridge.close()');
    await withTimeout(clientClosed, 1000, 'client socket close after bridge.close()');

    // close() must be idempotent so afterEach's own bridge.close() is a no-op here.
    await expect(bridge.close()).resolves.toBeUndefined();
  });

  it('I2: destroys the upstream connection when the client aborts the request', async () => {
    let stuck: net.Server | undefined;
    let stuckBridge: Awaited<ReturnType<typeof startBridge>> | undefined;
    try {
      stuck = net.createServer((socket) => {
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
      stuckBridge = await startBridge({
        port: 0,
        host: '127.0.0.1',
        xplaneHost: '127.0.0.1',
        xplanePort: stuckPort,
        staticDir,
        open: true,
        advertiser: createNullAdvertiser(),
        log: () => undefined,
      });
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
      await stuckBridge?.close();
      if (stuck) await new Promise<void>((done) => stuck?.close(() => done()));
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

describe('Avionix connector (pairing, tokens, discovery)', () => {
  let xplane: MockXPlaneServer;
  let bridge: Awaited<ReturnType<typeof startBridge>>;
  let staticDir: string;
  let dataDir: string;
  let base: string;
  let published: { name: string; port: number; txt: Record<string, string> }[];
  let stopped: number;

  function fakeAdvertiser(): Advertiser {
    return (spec) => {
      published.push(spec);
      return {
        stop: async () => {
          stopped += 1;
        },
      };
    };
  }

  beforeEach(async () => {
    published = [];
    stopped = 0;
    xplane = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-web-'));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-data-'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Avionix</title>');
    bridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      code: '123456',
      name: 'Test Connector',
      advertiser: fakeAdvertiser(),
      log: () => undefined,
    });
    base = `http://127.0.0.1:${bridge.port}`;
  });

  afterEach(async () => {
    await bridge.close();
    await xplane.stop();
    fs.rmSync(staticDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('exposes public info and advertises itself', async () => {
    const info = await fetch(`${base}/avionix/info`);
    expect(info.status).toBe(200);
    expect(await info.json()).toEqual({
      name: 'Test Connector',
      version: expect.any(String),
      pairingRequired: true,
      xplane: { host: xplane.host, port: xplane.port, reachable: true },
    });
    expect(bridge.pairingRequired).toBe(true);
    expect(bridge.pairingCode).toBe('123456');
    expect(published).toEqual([
      { name: 'Test Connector', port: bridge.port, txt: { v: '1', pairing: '1' } },
    ]);
  });

  it('protects /api until paired, then accepts the bearer token', async () => {
    const denied = await fetch(`${base}/api/capabilities`, {
      headers: { Origin: 'http://tablet.local' },
    });
    expect(denied.status).toBe(401);
    expect(denied.headers.get('access-control-allow-origin')).toBe('*');
    expect(await denied.json()).toMatchObject({ error_code: 'unauthorized' });

    const wrong = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000' }),
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ error_code: 'pairing_invalid_code' });

    const paired = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });
    expect(paired.status).toBe(200);
    const { token } = (await paired.json()) as { token: string };
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const allowed = await fetch(`${base}/api/capabilities`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ 'x-plane': { version: '12.4.0' } });

    const bad = await fetch(`${base}/api/capabilities`, {
      headers: { Authorization: 'Bearer nope' },
    });
    expect(bad.status).toBe(401);
  });

  it('rate-limits pairing after five wrong attempts', async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await fetch(`${base}/avionix/pair`, {
        method: 'POST',
        body: JSON.stringify({ code: '111111' }),
      });
      expect(r.status).toBe(401);
    }
    const limited = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error_code: 'pairing_rate_limited' });
  });

  it('rejects a malformed pairing body', async () => {
    const r = await fetch(`${base}/avionix/pair`, { method: 'POST', body: '{nope' });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error_code: 'invalid_body' });
  });

  it('requires a token on WebSocket upgrades and strips it before relaying', async () => {
    const paired = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
    const { token } = (await paired.json()) as { token: string };

    const denied = await rawHttp(
      bridge.port,
      [
        'GET /api/v3 HTTP/1.1',
        `Host: 127.0.0.1:${bridge.port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'),
    );
    expect(denied).toContain(' 401 ');
    expect(xplane.connectionCount).toBe(0);

    const { socket, next } = await openSocket(
      `ws://127.0.0.1:${bridge.port}/api/v3?token=${token}`,
    );
    await until(() => xplane.connectionCount === 1);
    socket.send(
      JSON.stringify({
        req_id: 1,
        type: 'dataref_subscribe_values',
        params: { datarefs: [{ id: 1001 }] },
      }),
    );
    expect(await next((m) => hasType(m, 'result'))).toEqual({
      req_id: 1,
      type: 'result',
      success: true,
    });
    socket.close();
    await until(() => xplane.connectionCount === 0);
  });

  it('keeps tokens across restarts', async () => {
    const paired = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
    const { token } = (await paired.json()) as { token: string };
    await bridge.close();
    bridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      code: '654321',
      advertiser: fakeAdvertiser(),
      log: () => undefined,
    });
    base = `http://127.0.0.1:${bridge.port}`;
    const allowed = await fetch(`${base}/api/capabilities`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(allowed.status).toBe(200);
  });

  it('serves a public status page without the code and reports reachability', async () => {
    const page = await fetch(`${base}/avionix`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    expect(html).toContain('Test Connector');
    expect(html).toContain('Pairing: required');
    expect(html).not.toContain('123456');
  });

  it('stops the advertisement on close', async () => {
    await bridge.close();
    expect(stopped).toBe(1);
    bridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      open: true,
      advertiser: fakeAdvertiser(),
      log: () => undefined,
    });
  });

  it('open mode disables pairing and advertises pairing=0', async () => {
    await bridge.close();
    published = [];
    bridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      open: true,
      advertiser: fakeAdvertiser(),
      log: () => undefined,
    });
    base = `http://127.0.0.1:${bridge.port}`;
    expect(bridge.pairingRequired).toBe(false);
    expect(bridge.pairingCode).toBeNull();
    expect((await (await fetch(`${base}/avionix/info`)).json()).pairingRequired).toBe(false);
    expect((await fetch(`${base}/api/capabilities`)).status).toBe(200);
    expect(published[0]?.txt).toEqual({ v: '1', pairing: '0' });
  });

  it('reports X-Plane as unreachable in info when it is down', async () => {
    await xplane.stop();
    const info = (await (await fetch(`${base}/avionix/info`)).json()) as {
      xplane: { reachable: boolean };
    };
    expect(info.xplane.reachable).toBe(false);
    xplane = await MockXPlaneServer.start();
  });

  it('C1: rejects a non-string pairing code instead of crashing the process', async () => {
    const bad = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: { toString: 1 } }),
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error_code: 'invalid_body' });

    // The process (and this bridge) must still be alive and answering afterwards.
    const info = await fetch(`${base}/avionix/info`);
    expect(info.status).toBe(200);
  });

  it('answers 413 for an oversized pairing body, then keeps serving', async () => {
    const big = 'a'.repeat(200 * 1024);
    const res = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: big }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error_code: 'payload_too_large' });

    const info = await fetch(`${base}/avionix/info`);
    expect(info.status).toBe(200);
  });

  it('routes /avionix/info by pathname, ignoring a query string', async () => {
    const info = await fetch(`${base}/avionix/info?x=1`);
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ pairingRequired: true });
  });

  it('answers 405 with Allow for the wrong method on /avionix/info', async () => {
    const res = await fetch(`${base}/avionix/info`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('answers 405 with Allow for the wrong method on /avionix/pair', async () => {
    const res = await fetch(`${base}/avionix/pair`, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('answers OPTIONS on /api without a token', async () => {
    const res = await fetch(`${base}/api/capabilities`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });

  it('F1: never logs the token, on WebSocket connect or an upstream HTTP error', async () => {
    const paired = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
    const { token } = (await paired.json()) as { token: string };

    const logs: string[] = [];
    await bridge.close();
    bridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      code: '123456',
      advertiser: fakeAdvertiser(),
      log: (line) => logs.push(line),
    });
    base = `http://127.0.0.1:${bridge.port}`;

    const { socket } = await openSocket(`ws://127.0.0.1:${bridge.port}/api/v3?token=${token}`);
    await until(() => xplane.connectionCount === 1);
    socket.close();
    await until(() => xplane.connectionCount === 0);

    // Force the "upstream error" HTTP log line (a query token plus a dead upstream).
    await xplane.stop();
    const res = await fetch(`${base}/api/capabilities?token=${token}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(502);
    xplane = await MockXPlaneServer.start();

    expect(logs.some((line) => line.includes(token))).toBe(false);
  });

  it('I3: strips the token and the Authorization header before proxying HTTP to X-Plane', async () => {
    const paired = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
    const { token } = (await paired.json()) as { token: string };

    let upstream: Awaited<ReturnType<typeof startRecordingUpstream>> | undefined;
    let recordingBridge: Awaited<ReturnType<typeof startBridge>> | undefined;
    try {
      upstream = await startRecordingUpstream();
      recordingBridge = await startBridge({
        port: 0,
        host: '127.0.0.1',
        xplaneHost: '127.0.0.1',
        xplanePort: upstream.port,
        staticDir,
        dataDir,
        advertiser: fakeAdvertiser(),
        log: () => undefined,
      });
      const recordingBase = `http://127.0.0.1:${recordingBridge.port}`;
      await fetch(`${recordingBase}/api/capabilities?token=${token}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await until(() => (upstream?.requests.length ?? 0) === 1);
      const request = upstream.requests[0];
      if (request === undefined) throw new Error('expected a recorded upstream request');
      expect(request).toContain('GET /api/capabilities HTTP/1.1');
      expect(request.toLowerCase()).not.toContain('authorization:');
      expect(request).not.toContain(token);
    } finally {
      await recordingBridge?.close();
      await upstream?.close();
    }
  });

  it('I4: honours an injected version in info and on the status page', async () => {
    await bridge.close();
    bridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      code: '123456',
      version: '9.9.9',
      advertiser: fakeAdvertiser(),
      log: () => undefined,
    });
    base = `http://127.0.0.1:${bridge.port}`;

    const info = (await (await fetch(`${base}/avionix/info`)).json()) as { version: string };
    expect(info.version).toBe('9.9.9');
    const page = await (await fetch(`${base}/avionix`)).text();
    expect(page).toContain('9.9.9');
  });

  it('F4: never forwards the Authorization header upstream on a WebSocket upgrade', async () => {
    const paired = await fetch(`${base}/avionix/pair`, {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
    const { token } = (await paired.json()) as { token: string };

    let upstream: Awaited<ReturnType<typeof startRecordingUpstream>> | undefined;
    let upgradeBridge: Awaited<ReturnType<typeof startBridge>> | undefined;
    try {
      upstream = await startRecordingUpstream();
      upgradeBridge = await startBridge({
        port: 0,
        host: '127.0.0.1',
        xplaneHost: '127.0.0.1',
        xplanePort: upstream.port,
        staticDir,
        dataDir,
        advertiser: fakeAdvertiser(),
        log: () => undefined,
      });
      await rawHttp(
        upgradeBridge.port,
        [
          `GET /api/v3?token=${token} HTTP/1.1`,
          `Host: 127.0.0.1:${upgradeBridge.port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Authorization: Bearer ${token}`,
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n'),
      );
      await until(() => (upstream?.requests.length ?? 0) === 1);
      const request = upstream.requests[0];
      if (request === undefined) throw new Error('expected a recorded upstream request');
      expect(request.toLowerCase()).not.toContain('authorization:');
      expect(request).not.toContain(token);
    } finally {
      await upgradeBridge?.close();
      await upstream?.close();
    }
  });

  it('F9: caches the upstream reachability result for a couple of seconds', async () => {
    const first = (await (await fetch(`${base}/avionix/info`)).json()) as {
      xplane: { reachable: boolean };
    };
    expect(first.xplane.reachable).toBe(true);
    await xplane.stop();
    // Immediately after, still within the cache window: reports the stale (reachable) value.
    const second = (await (await fetch(`${base}/avionix/info`)).json()) as {
      xplane: { reachable: boolean };
    };
    expect(second.xplane.reachable).toBe(true);
    xplane = await MockXPlaneServer.start();
  });

  it('F9: close() aborts an in-flight /avionix/info upstream probe instead of leaving it open', async () => {
    let hung: net.Server | undefined;
    let hungBridge: Awaited<ReturnType<typeof startBridge>> | undefined;
    try {
      const activeSockets = new Set<net.Socket>();
      hung = net.createServer((socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
        socket.on('error', () => undefined);
        socket.resume(); // never respond
      });
      hung.on('error', () => undefined);
      const hungPort = await listenAndGetPort(hung);
      hungBridge = await startBridge({
        port: 0,
        host: '127.0.0.1',
        xplaneHost: '127.0.0.1',
        xplanePort: hungPort,
        staticDir,
        dataDir,
        open: true,
        advertiser: fakeAdvertiser(),
        log: () => undefined,
      });
      const hungBase = `http://127.0.0.1:${hungBridge.port}`;

      fetch(`${hungBase}/avionix/info`).catch(() => undefined);
      await until(() => activeSockets.size === 1);

      const closed = hungBridge.close();
      hungBridge = undefined;
      await closed;
      // The probe's own outbound socket must be torn down promptly by close(), well
      // inside the request's 1s natural timeout, proving close() actively aborts it.
      await until(() => activeSockets.size === 0, 300);
    } finally {
      await hungBridge?.close();
      if (hung) await new Promise<void>((done) => hung?.close(() => done()));
    }
  });

  it('F10: answers OPTIONS on /avionix/info and /avionix/pair with 204', async () => {
    const info = await fetch(`${base}/avionix/info`, { method: 'OPTIONS' });
    expect(info.status).toBe(204);
    expect(info.headers.get('access-control-allow-origin')).toBe('*');

    const pair = await fetch(`${base}/avionix/pair`, { method: 'OPTIONS' });
    expect(pair.status).toBe(204);
    expect(pair.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('F11: answers 404 JSON for an unknown /avionix/* path instead of the SPA shell', async () => {
    const res = await fetch(`${base}/avionix/pairr`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('--no-mdns without an advertiser publishes nothing and still closes cleanly', async () => {
    await bridge.close();
    bridge = await startBridge({
      port: 0,
      host: '0.0.0.0',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      open: true,
      mdns: false,
      networkInterfaces: () => ({ eth0: [ipv4('10.0.0.5', false)] }),
      log: () => undefined,
    });
    base = `http://127.0.0.1:${bridge.port}`;
    expect(bridge.urls).toEqual([`http://10.0.0.5:${bridge.port}`]);
    await expect(bridge.close()).resolves.toBeUndefined();
    bridge = await startBridge({
      port: 0,
      host: '127.0.0.1',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      open: true,
      advertiser: fakeAdvertiser(),
      log: () => undefined,
    });
  });

  it('computeUrls lists a URL per non-internal IPv4 interface', async () => {
    await bridge.close();
    bridge = await startBridge({
      port: 0,
      host: '0.0.0.0',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      open: true,
      advertiser: fakeAdvertiser(),
      networkInterfaces: () => ({
        eth0: [ipv4('10.0.0.5', false)],
        eth1: [ipv4('192.168.1.10', false)],
      }),
      log: () => undefined,
    });
    expect(bridge.urls).toEqual([
      `http://10.0.0.5:${bridge.port}`,
      `http://192.168.1.10:${bridge.port}`,
    ]);
  });

  it('computeUrls falls back to localhost when only loopback interfaces exist', async () => {
    await bridge.close();
    bridge = await startBridge({
      port: 0,
      host: '0.0.0.0',
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
      open: true,
      advertiser: fakeAdvertiser(),
      networkInterfaces: () => ({ lo: [ipv4('127.0.0.1', true)] }),
      log: () => undefined,
    });
    expect(bridge.urls).toEqual([`http://localhost:${bridge.port}`]);
  });
});
