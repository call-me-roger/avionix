import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startBridge } from '../../scripts/avionix-bridge';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => resolve(socket));
    socket.addEventListener('error', () => reject(new Error('socket error')));
  });
}

function nextMessage(socket: WebSocket, predicate: (m: unknown) => boolean): Promise<unknown> {
  return new Promise((resolve) => {
    const handler = (event: { data: unknown }): void => {
      const parsed: unknown = JSON.parse(String(event.data));
      if (predicate(parsed)) {
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
    const traversal = await fetch(`${base}/../package.json`);
    expect(traversal.status).toBe(200);
    expect(await traversal.text()).toContain('Avionix');
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

  it('relays WebSocket connections to X-Plane and closes upstream with the client', async () => {
    const socket = await openSocket(`ws://127.0.0.1:${bridge.port}/api/v3`);
    await until(() => xplane.connectionCount === 1);
    const result = nextMessage(socket, (m) => (m as { type?: string }).type === 'result');
    socket.send(
      JSON.stringify({
        req_id: 1,
        type: 'dataref_subscribe_values',
        params: { datarefs: [{ id: 1001 }] },
      }),
    );
    expect(await result).toEqual({ req_id: 1, type: 'result', success: true });
    const update = await nextMessage(
      socket,
      (m) => (m as { type?: string }).type === 'dataref_update_values',
    );
    expect(update).toEqual({ type: 'dataref_update_values', data: { '1001': 12.5 } });
    socket.close();
    await until(() => xplane.connectionCount === 0);
  });

  it('answers 502 when X-Plane is down', async () => {
    await xplane.stop();
    const response = await fetch(`${base}/api/capabilities`);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error_code: 'bridge_upstream_unreachable' });
    xplane = await MockXPlaneServer.start();
  });
});
