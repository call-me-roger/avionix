# Web Target and Avionix Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Avionix run in a browser as a deployable static web app, served from the X-Plane PC by a zero-dependency bridge that also relays the X-Plane Web API (HTTP and WebSocket) to the LAN.

**Architecture:** The React Native app gains the web platform through `react-native-web` with no app-code branching except a one-file platform default for the connection form. A Node script `scripts/avionix-bridge.js` (built-ins only) serves the exported `dist/web` and proxies `/api/*` (including WebSocket upgrades) to X-Plane on `127.0.0.1:8086`, answering CORS preflight itself. Browser and API share one origin, which sidesteps X-Plane's localhost-only binding, its 403 on `OPTIONS`, and mixed-content rules.

**Tech Stack:** Expo SDK 57 web (`react-native-web ~0.21`, `react-dom 19.2.3`, `@expo/metro-runtime`), Metro web export (`output: single`), Node 22 `http`/`net`/`fs`/`path` for the bridge, Jest `node` project for bridge tests, a `jest-expo/web` project (jsdom + react-dom `createRoot`, no Testing Library) for web rendering tests.

**Spec:** Design approved in chat on 2026-09-14/15 (no written spec): scope "deployable static web app"; approach A (bridge script in the repo); evidence from X-Plane 12.4.3: binds to `127.0.0.1` only, sends `Access-Control-Allow-Origin: *` but answers `OPTIONS` with 403, DataRef count is 0 at the main menu (handled by PR #3). Out of scope: PWA/service worker, HTTPS, authentication, running the bridge as a service, hosting beyond the bridge.

## Global Constraints

- Only these new dependencies, installed with `npx expo install` so they are SDK-pinned: `react-native-web`, `react-dom`, `@expo/metro-runtime`. The bridge uses Node built-ins only.
- No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` without a stated reason, no `as T` casts bypassing validation. Prettier: singleQuote, trailingComma all, printWidth 100. Lint and test output warning-free.
- The UI still never builds URLs or protocol messages. The bridge is path-preserving: the app talks to `http://<bridge-host>:<bridge-port>/api/...` exactly as it talks to X-Plane.
- Alias `@/` → `src/`. Jest projects: `node` (tests/unit, tests/contract, tests/integration), `expo` (tests/ui), and the new `web` (tests/web) using `jest-expo/web`.
- `app.json` keeps `userInterfaceStyle: automatic`; web output is `single` (one `index.html`).
- Bridge defaults: listen `0.0.0.0:8080`, X-Plane `127.0.0.1:8086`, static dir `dist/web`; flags `--port`, `--host`, `--xplane` (`host:port`), `--static`; `--help` prints usage. It adds `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Accept` and answers `OPTIONS` with 204 locally.
- Quality gate before each commit: `npm run typecheck && npm run lint && npm run format:check && npm test`; Task 1 and Task 4 also run `npm run build:validate` (now including web).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Map

| Path | Responsibility |
|---|---|
| `package.json`, `app.json`, `jest.config.js` | web deps, web output config, scripts (`web`, `build:web`, `bridge`), `build:validate` with web, `web` Jest project |
| `tests/web/mvp-screen.web.test.tsx` | renders the screen under react-native-web |
| `scripts/avionix-bridge.js` (+ `scripts/avionix-bridge.d.ts`) | static server + `/api` proxy + WebSocket relay + CORS; exports `startBridge`, runs as CLI |
| `tests/integration/avionix-bridge.test.ts` | bridge against the mock X-Plane |
| `src/platform/default-connection.ts` | platform default host/port (web: page origin) |
| `src/hooks/useConnectionSettings.ts` | applies the platform default when nothing is stored |
| `tests/ui/use-connection-settings.test.tsx`, `tests/web/use-connection-settings.web.test.tsx` | native vs web defaults |
| `docs/web.md`, `README.md`, `docs/development.md`, `docs/testing/xplane-smoke-test.md`, `docs/architecture.md` | docs |

---

### Task 1: Web platform dependencies, config, scripts and a web rendering test

**Files:**
- Modify: `package.json`, `app.json`, `jest.config.js`, `.gitignore` (ensure `dist/`)
- Test: `tests/web/mvp-screen.web.test.tsx`

**Interfaces:**
- Produces: scripts `web` (`expo start --web`), `build:web` (`expo export --platform web --output-dir dist/web`), `build:validate` (`expo export --platform ios --platform android --platform web --output-dir dist`); Jest project `web` with `preset: 'jest-expo/web'`, `testMatch: ['<rootDir>/tests/web/**/*.web.test.tsx']`, same `moduleNameMapper` and `transformIgnorePatterns` as the `expo` project.

- [ ] **Step 1: Install the SDK-pinned web packages**

```bash
npx expo install react-native-web react-dom @expo/metro-runtime
grep -n "react-native-web\|react-dom\|metro-runtime" package.json
```

Expected: `react-native-web ~0.21.x`, `react-dom 19.2.3`, `@expo/metro-runtime ~57.x` under `dependencies`.

- [ ] **Step 2: Scripts and app config**

In `package.json` add/replace:

```json
"web": "expo start --web",
"build:web": "expo export --platform web --output-dir dist/web",
"bridge": "node scripts/avionix-bridge.js",
"build:validate": "expo export --platform ios --platform android --platform web --output-dir dist"
```

In `app.json` replace the `web` object with:

```json
"web": {
  "favicon": "./assets/favicon.png",
  "bundler": "metro",
  "output": "single"
}
```

- [ ] **Step 3: Add the `web` Jest project**

In `jest.config.js` add a third project (reuse the `transformIgnorePatterns` string from the `expo` project):

```js
{
  displayName: 'web',
  preset: 'jest-expo/web',
  testMatch: ['<rootDir>/tests/web/**/*.web.test.tsx'],
  moduleNameMapper,
  transformIgnorePatterns: [/* same as expo */],
},
```

- [ ] **Step 4: Write the web rendering test**

`tests/web/mvp-screen.web.test.tsx` (react-dom in jsdom; @testing-library/react-native cannot render react-native-web output):

```tsx
import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { MvpScreen } from '@/features/mvp/MvpScreen';
import { ThemeProvider } from '@/theme/theme-context';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function services(): AppServices {
  return {
    settingsStorage: createMemorySettingsStorage(),
    session: {
      store: new Store(initialSnapshot(MVP_DATAREF_NAMES)),
      connect: async () => undefined,
      disconnect: () => undefined,
      writeHeading: async () => undefined,
      activateHeadingUp: async () => undefined,
    },
  };
}

describe('MvpScreen on react-native-web', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders the screen and the theme toggle as DOM', async () => {
    const s = services();
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <MvpScreen />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Avionix');
    expect(text).toContain('Status: disconnected');
    expect(container.querySelector('[aria-label="Theme Dark"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="mvp-screen"]')).not.toBeNull();
  });
});
```

Run: `npx jest --selectProjects web`
Expected: PASS. If a querySelector assertion fails, inspect `container.innerHTML` and use the attribute react-native-web actually emits; keep the text assertions. If `jest-expo/web` cannot resolve `react-dom`/`react-native-web` or fails in the preset itself, record the exact error in the report and stop; do not patch node_modules.

- [ ] **Step 5: Export for web and run the gate**

```bash
npm run build:web && ls dist/web && test -f dist/web/index.html && echo WEB_EXPORT_OK
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:validate
```

Expected: `dist/web/index.html` plus `_expo/static/js/web/*.js`; the full export lists ios, android and web bundles.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json jest.config.js tests/web
git commit -m "feat(web): add the web platform, export scripts and a react-native-web rendering test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Avionix bridge (static server + X-Plane relay) with integration tests

**Files:**
- Create: `scripts/avionix-bridge.js`, `scripts/avionix-bridge.d.ts`
- Test: `tests/integration/avionix-bridge.test.ts`

**Interfaces:**
- Produces (from `scripts/avionix-bridge.js`): `startBridge(options: { port?: number; host?: string; xplaneHost?: string; xplanePort?: number; staticDir?: string; log?: (line: string) => void }): Promise<{ port: number; host: string; close(): Promise<void> }>`; `parseArgs(argv: string[]): BridgeOptions | 'help'`; CLI entry when run directly.

- [ ] **Step 1: Write the failing integration test**

`tests/integration/avionix-bridge.test.ts`:

```ts
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
    const caps = await fetch(`${base}/api/capabilities`, { headers: { Origin: 'http://tablet.local' } });
    expect(caps.status).toBe(200);
    expect(caps.headers.get('access-control-allow-origin')).toBe('*');
    expect(await caps.json()).toEqual({ api: { versions: ['v1', 'v2', 'v3'] }, 'x-plane': { version: '12.4.0' } });

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
    socket.send(JSON.stringify({ req_id: 1, type: 'dataref_subscribe_values', params: { datarefs: [{ id: 1001 }] } }));
    expect(await result).toEqual({ req_id: 1, type: 'result', success: true });
    const update = await nextMessage(socket, (m) => (m as { type?: string }).type === 'dataref_update_values');
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
```

Run: `npx jest tests/integration/avionix-bridge.test.ts`
Expected: FAIL, cannot find module `../../scripts/avionix-bridge`.

- [ ] **Step 2: Implement `scripts/avionix-bridge.js`**

```js
#!/usr/bin/env node
/* Avionix bridge: serves the exported web app and relays the X-Plane Web API to the LAN.
   Node built-ins only. Run on the X-Plane PC: `node scripts/avionix-bridge.js --port 8080`. */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const DEFAULTS = { port: 8080, host: '0.0.0.0', xplaneHost: '127.0.0.1', xplanePort: 8086, staticDir: 'dist/web' };

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Accept',
  'access-control-max-age': '600',
};

function usage() {
  return [
    'Usage: node scripts/avionix-bridge.js [--port 8080] [--host 0.0.0.0] [--xplane 127.0.0.1:8086] [--static dist/web]',
    '',
    'Serves the exported Avionix web app and relays /api/* (HTTP and WebSocket) to X-Plane.',
    'Run it on the computer where X-Plane runs; X-Plane only accepts local connections.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--help' || arg === '-h') return 'help';
    if (arg === '--port') { options.port = Number(value); i += 1; continue; }
    if (arg === '--host') { options.host = String(value); i += 1; continue; }
    if (arg === '--static') { options.staticDir = String(value); i += 1; continue; }
    if (arg === '--xplane') {
      const [h, p] = String(value).split(':');
      options.xplaneHost = h || DEFAULTS.xplaneHost;
      options.xplanePort = p ? Number(p) : DEFAULTS.xplanePort;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error('--port must be 0..65535');
  if (!Number.isInteger(options.xplanePort) || options.xplanePort < 1 || options.xplanePort > 65535) throw new Error('--xplane port must be 1..65535');
  return options;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function resolveStatic(staticDir, urlPath) {
  const root = path.resolve(staticDir);
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = path.resolve(root, `.${decoded}`);
  if (!candidate.startsWith(root + path.sep) && candidate !== root) return path.join(root, 'index.html');
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) return candidate;
    if (stat.isDirectory()) {
      const index = path.join(candidate, 'index.html');
      if (fs.existsSync(index)) return index;
    }
  } catch {
    // fall through to the SPA fallback
  }
  return path.join(root, 'index.html');
}

function serveStatic(options, req, res) {
  const file = resolveStatic(options.staticDir, req.url || '/');
  fs.readFile(file, (error, data) => {
    if (error) {
      sendJson(res, 404, {
        error_code: 'bridge_static_missing',
        error_message: `No web build at ${path.resolve(options.staticDir)}. Run "npm run build:web" first.`,
      });
      return;
    }
    const type = CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(data);
  });
}

function proxyHttp(options, req, res, log) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  const headers = { ...req.headers, host: `${options.xplaneHost}:${options.xplanePort}` };
  delete headers.origin;
  const upstream = http.request(
    { host: options.xplaneHost, port: options.xplanePort, method: req.method, path: req.url, headers },
    (upstreamRes) => {
      const responseHeaders = { ...upstreamRes.headers, ...CORS_HEADERS };
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    log(`upstream error ${req.method} ${req.url}: ${error.message}`);
    sendJson(res, 502, {
      error_code: 'bridge_upstream_unreachable',
      error_message: `X-Plane at ${options.xplaneHost}:${options.xplanePort} is unreachable: ${error.message}`,
    });
  });
  req.pipe(upstream);
}

function relayUpgrade(options, req, socket, head, log) {
  const upstream = net.connect(options.xplanePort, options.xplaneHost);
  upstream.on('connect', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i];
      const value = name.toLowerCase() === 'host' ? `${options.xplaneHost}:${options.xplanePort}` : req.rawHeaders[i + 1];
      lines.push(`${name}: ${value}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head && head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', (error) => {
    log(`websocket upstream error: ${error.message}`);
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
  upstream.on('close', () => socket.destroy());
}

function startBridge(overrides = {}) {
  const options = { ...DEFAULTS, ...overrides };
  const log = options.log || ((line) => console.log(`[avionix-bridge] ${line}`));
  const server = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/api')) {
      proxyHttp(options, req, res, log);
    } else {
      serveStatic(options, req, res);
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if ((req.url || '').startsWith('/api')) {
      log(`websocket ${req.socket.remoteAddress} -> ${req.url}`);
      relayUpgrade(options, req, socket, head, log);
    } else {
      socket.destroy();
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      log(`listening on http://${options.host}:${port}, serving ${path.resolve(options.staticDir)}, relaying /api to ${options.xplaneHost}:${options.xplanePort}`);
      resolve({
        port,
        host: options.host,
        close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }),
      });
    });
  });
}

module.exports = { startBridge, parseArgs, usage, DEFAULTS };

if (require.main === module) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (options === 'help') {
    console.log(usage());
    process.exit(0);
  }
  startBridge(options).catch((error) => {
    console.error(`[avionix-bridge] failed to start: ${error.message}`);
    process.exit(1);
  });
}
```

`scripts/avionix-bridge.d.ts`:

```ts
export interface BridgeOptions {
  port?: number;
  host?: string;
  xplaneHost?: string;
  xplanePort?: number;
  staticDir?: string;
  log?: (line: string) => void;
}

export interface BridgeHandle {
  port: number;
  host: string;
  close(): Promise<void>;
}

export function startBridge(options?: BridgeOptions): Promise<BridgeHandle>;
export function parseArgs(argv: string[]): Required<Omit<BridgeOptions, 'log'>> | 'help';
export function usage(): string;
export const DEFAULTS: Required<Omit<BridgeOptions, 'log'>>;
```

Notes for the executor: `server.closeAllConnections()` exists in Node 18.2+. If ESLint's `expo` config complains about `require`/`module`/`process` in `scripts/`, add an override block in `eslint.config.js` for `scripts/**/*.js` setting `languageOptions: { globals: require('globals').node }` (the `globals` package is a dependency of `eslint-config-expo`), or `sourceType: 'commonjs'`; do not disable rules. If `tsc` type-checks the JS file through the test import and complains, ensure `scripts/avionix-bridge.d.ts` sits next to it (TypeScript prefers the `.d.ts`) and add `"scripts/**/*.d.ts"` to `tsconfig.json` `include`.

- [ ] **Step 3: Add a unit test for `parseArgs`**

`tests/unit/bridge/parse-args.test.ts`:

```ts
import { DEFAULTS, parseArgs } from '../../../scripts/avionix-bridge';

describe('avionix-bridge parseArgs', () => {
  it('returns defaults with no arguments', () => {
    expect(parseArgs([])).toEqual(DEFAULTS);
  });

  it('parses every flag', () => {
    expect(parseArgs(['--port', '9000', '--host', '192.168.1.5', '--xplane', '127.0.0.1:8090', '--static', 'out'])).toEqual({
      port: 9000,
      host: '192.168.1.5',
      xplaneHost: '127.0.0.1',
      xplanePort: 8090,
      staticDir: 'out',
    });
  });

  it('returns help and rejects unknown flags and bad ports', () => {
    expect(parseArgs(['--help'])).toBe('help');
    expect(() => parseArgs(['--bogus'])).toThrow('Unknown argument');
    expect(() => parseArgs(['--port', '70000'])).toThrow('--port');
  });
});
```

- [ ] **Step 4: Run, gate, commit**

```bash
npx jest tests/integration/avionix-bridge.test.ts tests/unit/bridge
node scripts/avionix-bridge.js --help
npm run typecheck && npm run lint && npm run format:check && npm test
git add scripts tests/integration/avionix-bridge.test.ts tests/unit/bridge eslint.config.js tsconfig.json
git commit -m "feat(bridge): add the Avionix bridge that serves the web app and relays the X-Plane API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Only add `eslint.config.js`/`tsconfig.json` if they changed.)

---

### Task 3: Web default connection (page origin) in the settings hook

**Files:**
- Create: `src/platform/default-connection.ts`
- Modify: `src/hooks/useConnectionSettings.ts`
- Test: `tests/ui/use-connection-settings.test.tsx` (one new test), `tests/web/use-connection-settings.web.test.tsx`

**Interfaces:**
- Produces: `platformDefaultConnection(): ConnectionSettings | null` — on web with a `window.location` whose hostname is non-empty returns `{ host: location.hostname, port: Number(location.port) || (location.protocol === 'https:' ? 443 : 80) }`; otherwise `null`. `useConnectionSettings` uses it only when the loaded settings equal `DEFAULT_CONNECTION_SETTINGS` (nothing stored).

- [ ] **Step 1: Tests**

Append to `tests/ui/use-connection-settings.test.tsx`:

```tsx
  it('keeps the empty default host on native when nothing is stored', async () => {
    const { result } = await renderHook(() => useConnectionSettings(), { wrapper: wrapperFor(services()) });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.host).toBe('');
    expect(result.current.port).toBe('8086');
  });
```

`tests/web/use-connection-settings.web.test.tsx` (the `web` project renders with react-dom in jsdom; @testing-library/react-native cannot render react-native-web output):

```tsx
import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { Text } from 'react-native';

import { MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage, saveConnectionSettings } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { platformDefaultConnection } from '@/platform/default-connection';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function services(storage = createMemorySettingsStorage()): AppServices {
  return {
    settingsStorage: storage,
    session: {
      store: new Store(initialSnapshot(MVP_DATAREF_NAMES)),
      connect: async () => undefined,
      disconnect: () => undefined,
      writeHeading: async () => undefined,
      activateHeadingUp: async () => undefined,
    },
  };
}

function Probe() {
  const settings = useConnectionSettings();
  return (
    <Text testID="probe">
      {settings.ready ? 'ready' : 'loading'}|{settings.host}|{settings.port}
    </Text>
  );
}

async function renderProbe(s: AppServices): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ServicesProvider services={s}>
        <Probe />
      </ServicesProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { container, root };
}

async function cleanup(handle: { container: HTMLDivElement; root: Root }): Promise<void> {
  await act(async () => {
    handle.root.unmount();
  });
  handle.container.remove();
}

describe('connection defaults on web', () => {
  it('derives the default from the page origin', () => {
    // jsdom serves the test page from http://localhost/
    expect(platformDefaultConnection()).toEqual({ host: 'localhost', port: 80 });
  });

  it('prefills the form from the page origin when nothing is stored', async () => {
    const handle = await renderProbe(services());
    expect(handle.container.textContent).toBe('ready|localhost|80');
    await cleanup(handle);
  });

  it('prefers stored settings over the page origin', async () => {
    const storage = createMemorySettingsStorage();
    await saveConnectionSettings(storage, { host: '10.0.0.5', port: 8087 });
    const handle = await renderProbe(services(storage));
    expect(handle.container.textContent).toBe('ready|10.0.0.5|8087');
    await cleanup(handle);
  });
});
```

- [ ] **Step 2: Implement**

`src/platform/default-connection.ts`:

```ts
import { Platform } from 'react-native';

import type { ConnectionSettings } from '@/application/settings-store';

/**
 * On the web the app is normally served by the Avionix bridge on the X-Plane PC, so the
 * page's own origin is the right default target. Native platforms have no sensible default.
 */
export function platformDefaultConnection(): ConnectionSettings | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) {
    return null;
  }
  const { hostname, port, protocol } = window.location;
  if (hostname.length === 0) {
    return null;
  }
  const parsedPort = Number(port);
  return {
    host: hostname,
    port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : protocol === 'https:' ? 443 : 80,
  };
}
```

In `src/hooks/useConnectionSettings.ts`, import `platformDefaultConnection` and `DEFAULT_CONNECTION_SETTINGS`, and in the load effect replace the two `setHost`/`setPort` calls with:

```ts
      const isUnset =
        settings.host === DEFAULT_CONNECTION_SETTINGS.host &&
        settings.port === DEFAULT_CONNECTION_SETTINGS.port;
      const effective = isUnset ? (platformDefaultConnection() ?? settings) : settings;
      setHost(effective.host);
      setPort(String(effective.port));
```

- [ ] **Step 3: Run, gate, commit**

```bash
npx jest --selectProjects expo web
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/platform src/hooks/useConnectionSettings.ts tests/ui/use-connection-settings.test.tsx tests/web/use-connection-settings.web.test.tsx
git commit -m "feat(web): default the connection form to the page origin on the web

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Documentation and final verification

**Files:**
- Create: `docs/web.md`
- Modify: `README.md`, `docs/development.md`, `docs/architecture.md`, `docs/testing/xplane-smoke-test.md`

- [ ] **Step 1: `docs/web.md`**

```markdown
# Web target and the Avionix bridge

Avionix runs in a browser through `react-native-web`. The recommended deployment is on the
computer that runs X-Plane, because X-Plane's web server only accepts connections from the same
machine and answers CORS preflight requests with 403. The Avionix bridge solves both: it serves the
exported web app and relays `/api/*` (HTTP and WebSocket) to X-Plane from the same origin.

## Build and serve

```bash
npm run build:web             # exports to dist/web
npm run bridge                # node scripts/avionix-bridge.js, listens on 0.0.0.0:8080
```

Then open `http://<x-plane-pc-ip>:8080` from any device on the LAN. The connection form is
prefilled with the page's own host and port; press Connect.

Flags: `--port 8080`, `--host 0.0.0.0` (bind address; use the PC's LAN IP to restrict),
`--xplane 127.0.0.1:8086` (X-Plane or another relay), `--static dist/web`, `--help`.

Native apps can use the bridge too: enter the PC's IP and the bridge port instead of 8086.

## Development

`npm run web` starts the Metro dev server for the browser. Because that page is served from a
different origin than X-Plane, connect through the bridge (start it with `--static dist/web` or any
directory; only `/api` matters for development) and enter its host and port in the form.

## Constraints

- Plain `http` only: a page served over `https` cannot open `http://` or `ws://` connections.
- The bridge exposes X-Plane's unauthenticated API to everyone on the network it binds to. Use it
  on trusted networks only and stop it when not needed.
- No PWA, no offline support, no HTTPS termination.
```

- [ ] **Step 2: README, development, architecture, smoke test**

README: add `web`, `build:web`, `bridge` to the Commands table; add a "Web" paragraph under Getting started pointing to `docs/web.md`; in Stack mention `react-native-web`; in limitations replace the relay sentence with a pointer to the bridge.

`docs/development.md`: after the Networking table add a row `| Browser (web build) | the bridge's host and port (prefilled) |` and a sentence that `npm run web` needs the bridge for API access.

`docs/architecture.md`: add a "Web and the bridge" section: the app is platform-neutral; `src/platform/default-connection.ts` is the only web-specific code; the bridge is infrastructure outside the app (a Node script), path-preserving, and is the "local bridge" the MVP design anticipated.

`docs/testing/xplane-smoke-test.md`: setup step 3 now says to run either `xplane-proxy` or the Avionix bridge (`npm run bridge`) on the X-Plane PC; add procedure step 16: "Open `http://<pc-ip>:8080` in a tablet browser; Connect; steps 2, 4 and 5 behave the same as on the phone".

- [ ] **Step 3: Final verification and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:validate
git add docs README.md
git commit -m "docs: web target, Avionix bridge and updated smoke test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan self-review notes

- Design coverage: web deps/config/scripts/CI → Task 1; bridge with static, proxy, WebSocket relay, CORS, flags, tests → Task 2; page-origin default → Task 3; docs incl. security notes and smoke test → Task 4. Out-of-scope items untouched.
- Type consistency: `startBridge`/`parseArgs`/`DEFAULTS` names match between the JS module, the `.d.ts` and both tests; `platformDefaultConnection` name matches hook and tests; `BridgeHandle.port/close` used by the integration test.
- Risk flags for the executor: `jest-expo/web` preset availability (Task 1 Step 4), CommonJS globals under `expo lint` for `scripts/` (Task 2), and `tsc` picking up the JS module (Task 2). Each has a stated fallback that does not involve suppressions.
