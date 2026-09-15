# Avionix Connector Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Avionix bridge into the Avionix Connector: a public info endpoint, pairing with a one-time code that yields a bearer token, token enforcement on every relayed X-Plane request and WebSocket, mDNS advertisement, and a console/status page that tells the customer what to open.

**Architecture:** The bridge (`scripts/avionix-bridge.js`) keeps its static server and relay. A new CommonJS module `scripts/avionix-connector-auth.js` owns the pairing code, token issuance, rate limiting and token persistence (a JSON file in the user's data directory). A new module `scripts/avionix-connector-mdns.js` wraps the `bonjour-service` advertiser behind a tiny interface so tests inject a fake. The bridge gains public `/avionix/*` routes (`info`, `pair`, status page) and checks a bearer token (header, or `?token=` on WebSocket upgrades) before relaying `/api/*` unless started with `--open`. The app side (next plan) consumes exactly these endpoints.

**Tech Stack:** Node 22 built-ins (`http`, `net`, `fs`, `crypto`, `os`), `bonjour-service` (the connector's only dependency; not imported by app code), Jest `node` project with the in-process mock X-Plane and raw sockets.

**Spec:** Design approved in chat on 2026-09-15: pairing on by default (`--open` disables, `--code` fixes the code for tests), 6-digit code rotating per run, tokens persisted across restarts, `POST /avionix/pair` → token, `Authorization: Bearer` on HTTP and `?token=` on WebSocket, 401 `unauthorized`, 429 after five bad attempts per minute, mDNS `_avionix._tcp` with TXT `v=1`, `pairing=1|0`, console output with one URL per LAN interface and the pairing code, public `/avionix` status page without the code. Out of scope: binary packaging, QR codes, tray UI, HTTPS, an X-Plane plugin.

## Global Constraints

- The bridge and its modules are CommonJS JavaScript under `scripts/`, typed for tests through sibling `.d.ts` files; the only npm dependency they may use is `bonjour-service` (add it to `dependencies`; nothing under `src/` may import it).
- No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` without a stated reason, no `as T` casts in TypeScript files. Prettier: singleQuote, trailingComma all, printWidth 100. Lint and test output warning-free; every server and socket opened in a test is closed in `afterEach`/`finally`; no bare sleeps (poll with the existing `until`/`withTimeout` helpers).
- Public routes: `GET /avionix/info`, `POST /avionix/pair`, `GET /avionix` (status page), static files. Protected: everything under `/api` (HTTP and WebSocket upgrades) when pairing is on. `OPTIONS` stays public and `Access-Control-Allow-Headers` becomes `Content-Type, Accept, Authorization`.
- Error payloads keep the X-Plane shape `{ "error_code", "error_message" }`: `unauthorized` (401), `pairing_invalid_code` (401), `pairing_rate_limited` (429), `invalid_body` (400).
- Pairing code: exactly six digits, `crypto.randomInt`; tokens: 32 random bytes hex; token file `<dataDir>/connector-tokens.json` with `dataDir` defaulting to `~/.avionix` and overridable with `--data-dir` (tests use a temp dir). Codes are never written to disk or served on the status page.
- mDNS: service type `avionix` (i.e. `_avionix._tcp`), instance name `Avionix Connector (<hostname>)` unless `--name` is given, TXT `{ v: '1', pairing: '1' | '0' }`; `--no-mdns` disables it; advertisement failures are logged, never fatal.
- Quality gate before each commit: `npm run typecheck && npm run lint && npm run format:check && npm test`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Map

| Path | Responsibility |
|---|---|
| `scripts/avionix-connector-auth.js` (+ `.d.ts`) | `ConnectorAuth`: code, tokens, rate limit, persistence; `extractToken(req)` |
| `scripts/avionix-connector-mdns.js` (+ `.d.ts`) | `createBonjourAdvertiser()` wrapping `bonjour-service`; `Advertiser` interface |
| `scripts/avionix-bridge.js` (+ `.d.ts`) | routes `/avionix/*`, token enforcement, flags `--open --code --name --no-mdns --data-dir`, console output, status page |
| `tests/unit/bridge/connector-auth.test.ts` | auth unit tests |
| `tests/integration/avionix-bridge.test.ts` | existing tests updated to pass a token or `open: true`; new connector tests |
| `docs/connector.md` | protocol reference for the app and third parties |
| `docs/web.md`, `README.md`, `docs/testing/xplane-smoke-test.md` | connector wording, pairing step |

---

### Task 1: Connector auth module (code, tokens, rate limit, persistence)

**Files:**
- Create: `scripts/avionix-connector-auth.js`, `scripts/avionix-connector-auth.d.ts`
- Test: `tests/unit/bridge/connector-auth.test.ts`

**Interfaces:**
- Produces: `class ConnectorAuth { constructor(options?: { dataDir?: string; code?: string; open?: boolean; now?: () => number; random?: () => string; maxAttempts?: number; windowMs?: number }); readonly open: boolean; readonly code: string; get pairingRequired(): boolean; pair(code: string, clientKey: string): { ok: true; token: string } | { ok: false; reason: 'invalid_code' | 'rate_limited' }; isAuthorized(token: string | null | undefined): boolean; tokenCount(): number }`; `generatePairingCode(): string`; `extractToken(req: { headers: Record<string, string | string[] | undefined>; url?: string }): string | null`; `stripTokenQuery(url: string): string`.

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/bridge/connector-auth.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ConnectorAuth,
  extractToken,
  generatePairingCode,
  stripTokenQuery,
} from '../../../scripts/avionix-connector-auth';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-auth-'));
}

describe('generatePairingCode', () => {
  it('returns six digits', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(generatePairingCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('ConnectorAuth', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = tempDir();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('requires pairing by default and accepts the fixed code once per token', () => {
    const auth = new ConnectorAuth({ dataDir, code: '123456' });
    expect(auth.pairingRequired).toBe(true);
    expect(auth.isAuthorized(null)).toBe(false);
    const result = auth.pair('123456', 'client-a');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(auth.isAuthorized(result.token)).toBe(true);
    expect(auth.isAuthorized('deadbeef')).toBe(false);
    expect(auth.tokenCount()).toBe(1);
  });

  it('rejects a wrong code and rate-limits after five attempts within a minute', () => {
    let now = 1_000_000;
    const auth = new ConnectorAuth({ dataDir, code: '123456', now: () => now });
    for (let i = 0; i < 5; i += 1) {
      expect(auth.pair('000000', 'client-a')).toEqual({ ok: false, reason: 'invalid_code' });
    }
    expect(auth.pair('123456', 'client-a')).toEqual({ ok: false, reason: 'rate_limited' });
    expect(auth.pair('123456', 'client-b').ok).toBe(true);
    now += 61_000;
    expect(auth.pair('123456', 'client-a').ok).toBe(true);
  });

  it('persists tokens to the data dir and reloads them', () => {
    const first = new ConnectorAuth({ dataDir, code: '123456' });
    const paired = first.pair('123456', 'x');
    if (!paired.ok) throw new Error('pairing failed');
    expect(fs.existsSync(path.join(dataDir, 'connector-tokens.json'))).toBe(true);
    const second = new ConnectorAuth({ dataDir, code: '999999' });
    expect(second.isAuthorized(paired.token)).toBe(true);
    expect(fs.readFileSync(path.join(dataDir, 'connector-tokens.json'), 'utf8')).not.toContain('123456');
  });

  it('survives a corrupt token file', () => {
    fs.writeFileSync(path.join(dataDir, 'connector-tokens.json'), '{not json');
    const auth = new ConnectorAuth({ dataDir, code: '123456' });
    expect(auth.tokenCount()).toBe(0);
    expect(auth.pair('123456', 'x').ok).toBe(true);
  });

  it('open mode authorizes everything and never issues tokens', () => {
    const auth = new ConnectorAuth({ dataDir, open: true });
    expect(auth.pairingRequired).toBe(false);
    expect(auth.isAuthorized(null)).toBe(true);
    expect(auth.pair('anything', 'x')).toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('generates a code when none is given', () => {
    const auth = new ConnectorAuth({ dataDir });
    expect(auth.code).toMatch(/^\d{6}$/);
  });
});

describe('extractToken / stripTokenQuery', () => {
  it('reads a bearer header', () => {
    expect(extractToken({ headers: { authorization: 'Bearer abc123' } })).toBe('abc123');
    expect(extractToken({ headers: { authorization: 'Basic abc' } })).toBeNull();
    expect(extractToken({ headers: {} })).toBeNull();
  });

  it('reads a token query parameter and strips it', () => {
    expect(extractToken({ headers: {}, url: '/api/v3?token=xyz' })).toBe('xyz');
    expect(stripTokenQuery('/api/v3?token=xyz')).toBe('/api/v3');
    expect(stripTokenQuery('/api/v3?a=1&token=xyz&b=2')).toBe('/api/v3?a=1&b=2');
    expect(stripTokenQuery('/api/v3')).toBe('/api/v3');
  });

  it('prefers the header over the query', () => {
    expect(extractToken({ headers: { authorization: 'Bearer h' }, url: '/x?token=q' })).toBe('h');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/bridge/connector-auth.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `scripts/avionix-connector-auth.js`**

```js
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TOKEN_FILE = 'connector-tokens.json';

function defaultDataDir() {
  return path.join(os.homedir(), '.avionix');
}

function generatePairingCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

class ConnectorAuth {
  constructor(options = {}) {
    this.dataDir = options.dataDir || defaultDataDir();
    this.open = options.open === true;
    this.code = options.code || generatePairingCode();
    this.now = options.now || Date.now;
    this.random = options.random || generateToken;
    this.maxAttempts = options.maxAttempts || 5;
    this.windowMs = options.windowMs || 60000;
    this.attempts = new Map(); // clientKey -> number[] (timestamps)
    this.tokens = new Set(this.load());
  }

  get pairingRequired() {
    return !this.open;
  }

  tokenCount() {
    return this.tokens.size;
  }

  isAuthorized(token) {
    if (this.open) return true;
    return typeof token === 'string' && this.tokens.has(token);
  }

  pair(code, clientKey) {
    if (this.open) return { ok: false, reason: 'invalid_code' };
    const now = this.now();
    const recent = (this.attempts.get(clientKey) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.maxAttempts) {
      this.attempts.set(clientKey, recent);
      return { ok: false, reason: 'rate_limited' };
    }
    if (typeof code !== 'string' || code !== this.code) {
      recent.push(now);
      this.attempts.set(clientKey, recent);
      return { ok: false, reason: 'invalid_code' };
    }
    this.attempts.delete(clientKey);
    const token = this.random();
    this.tokens.add(token);
    this.save();
    return { ok: true, token };
  }

  load() {
    try {
      const raw = fs.readFileSync(path.join(this.dataDir, TOKEN_FILE), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tokens)) {
        return parsed.tokens.filter((t) => typeof t === 'string');
      }
    } catch {
      // missing or corrupt file: start with no tokens
    }
    return [];
  }

  save() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(
        path.join(this.dataDir, TOKEN_FILE),
        JSON.stringify({ tokens: [...this.tokens] }, null, 2),
        { mode: 0o600 },
      );
    } catch (error) {
      // best effort; tokens still work for this run
      process.stderr.write(`[avionix-connector] could not save tokens: ${error.message}\n`);
    }
  }
}

function extractToken(req) {
  const header = req.headers && req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value === 'string') {
    const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
    if (match) return match[1];
    return null;
  }
  if (typeof req.url === 'string') {
    const query = req.url.split('?')[1];
    if (query) {
      const params = new URLSearchParams(query);
      const token = params.get('token');
      if (token) return token;
    }
  }
  return null;
}

function stripTokenQuery(url) {
  const [pathname, query] = url.split('?');
  if (!query) return url;
  const params = new URLSearchParams(query);
  params.delete('token');
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

module.exports = { ConnectorAuth, generatePairingCode, extractToken, stripTokenQuery, TOKEN_FILE };
```

`scripts/avionix-connector-auth.d.ts`:

```ts
export interface ConnectorAuthOptions {
  dataDir?: string;
  code?: string;
  open?: boolean;
  now?: () => number;
  random?: () => string;
  maxAttempts?: number;
  windowMs?: number;
}

export type PairResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'invalid_code' | 'rate_limited' };

export class ConnectorAuth {
  constructor(options?: ConnectorAuthOptions);
  readonly open: boolean;
  readonly code: string;
  readonly dataDir: string;
  get pairingRequired(): boolean;
  tokenCount(): number;
  isAuthorized(token: string | null | undefined): boolean;
  pair(code: string, clientKey: string): PairResult;
}

export function generatePairingCode(): string;
export function extractToken(req: {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
}): string | null;
export function stripTokenQuery(url: string): string;
export const TOKEN_FILE: string;
```

- [ ] **Step 4: Run, gate, commit**

```bash
npx jest tests/unit/bridge/connector-auth.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add scripts/avionix-connector-auth.js scripts/avionix-connector-auth.d.ts tests/unit/bridge/connector-auth.test.ts
git commit -m "feat(connector): add pairing codes, bearer tokens, rate limiting and token persistence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: mDNS advertiser module and the `bonjour-service` dependency

**Files:**
- Create: `scripts/avionix-connector-mdns.js`, `scripts/avionix-connector-mdns.d.ts`
- Modify: `package.json` (`bonjour-service` in `dependencies`)
- Test: `tests/unit/bridge/connector-mdns.test.ts`

**Interfaces:**
- Produces: `interface AdvertiserSpec { name: string; port: number; txt: Record<string, string> }`; `interface Advertisement { stop(): Promise<void> }`; `type Advertiser = (spec: AdvertiserSpec) => Advertisement`; `createBonjourAdvertiser(): Advertiser` (lazy `require('bonjour-service')`); `createNullAdvertiser(): Advertiser`; `SERVICE_TYPE = 'avionix'`.

- [ ] **Step 1: Install and test**

```bash
npm install bonjour-service@^1.4.4
```

`tests/unit/bridge/connector-mdns.test.ts` (does not touch the network: it injects a fake `bonjour-service` factory):

```ts
import { SERVICE_TYPE, createBonjourAdvertiser, createNullAdvertiser } from '../../../scripts/avionix-connector-mdns';

describe('connector mDNS advertiser', () => {
  it('publishes an _avionix._tcp service with the given name, port and txt, and stops it', async () => {
    const published: unknown[] = [];
    let stopped = 0;
    let destroyed = 0;
    const fakeBonjour = {
      publish(options: unknown) {
        published.push(options);
        return { stop: (cb: () => void) => { stopped += 1; cb(); } };
      },
      destroy() {
        destroyed += 1;
      },
    };
    const advertise = createBonjourAdvertiser(() => fakeBonjour);
    const ad = advertise({ name: 'Avionix Connector (pc)', port: 8080, txt: { v: '1', pairing: '1' } });
    expect(published).toEqual([
      { name: 'Avionix Connector (pc)', type: SERVICE_TYPE, port: 8080, txt: { v: '1', pairing: '1' } },
    ]);
    await ad.stop();
    expect(stopped).toBe(1);
    expect(destroyed).toBe(1);
  });

  it('the null advertiser does nothing', async () => {
    const ad = createNullAdvertiser()({ name: 'x', port: 1, txt: {} });
    await expect(ad.stop()).resolves.toBeUndefined();
  });

  it('SERVICE_TYPE is avionix', () => {
    expect(SERVICE_TYPE).toBe('avionix');
  });
});
```

- [ ] **Step 2: Implement `scripts/avionix-connector-mdns.js`**

```js
'use strict';

const SERVICE_TYPE = 'avionix';

function defaultBonjourFactory() {
  // Loaded lazily so the bridge still starts (with --no-mdns) if the package is missing.
  const { Bonjour } = require('bonjour-service');
  return new Bonjour();
}

function createBonjourAdvertiser(factory = defaultBonjourFactory) {
  return function advertise(spec) {
    const instance = factory();
    const service = instance.publish({
      name: spec.name,
      type: SERVICE_TYPE,
      port: spec.port,
      txt: spec.txt,
    });
    return {
      stop() {
        return new Promise((resolve) => {
          service.stop(() => {
            instance.destroy();
            resolve();
          });
        });
      },
    };
  };
}

function createNullAdvertiser() {
  return function advertise() {
    return { stop: () => Promise.resolve() };
  };
}

module.exports = { SERVICE_TYPE, createBonjourAdvertiser, createNullAdvertiser };
```

`scripts/avionix-connector-mdns.d.ts`:

```ts
export interface AdvertiserSpec {
  name: string;
  port: number;
  txt: Record<string, string>;
}
export interface Advertisement {
  stop(): Promise<void>;
}
export type Advertiser = (spec: AdvertiserSpec) => Advertisement;
export interface BonjourLike {
  publish(options: { name: string; type: string; port: number; txt: Record<string, string> }): {
    stop(callback: () => void): void;
  };
  destroy(): void;
}
export const SERVICE_TYPE: 'avionix';
export function createBonjourAdvertiser(factory?: () => BonjourLike): Advertiser;
export function createNullAdvertiser(): Advertiser;
```

- [ ] **Step 3: Run, gate, commit**

```bash
npx jest tests/unit/bridge/connector-mdns.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add package.json package-lock.json scripts/avionix-connector-mdns.js scripts/avionix-connector-mdns.d.ts tests/unit/bridge/connector-mdns.test.ts
git commit -m "feat(connector): add the mDNS advertiser behind an injectable interface

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Bridge integration: /avionix routes, token enforcement, flags, console and status page

**Files:**
- Modify: `scripts/avionix-bridge.js`, `scripts/avionix-bridge.d.ts`
- Test: `tests/integration/avionix-bridge.test.ts` (existing tests updated to `open: true` or a paired token; new connector describe block)

**Interfaces:**
- Consumes: `ConnectorAuth`, `extractToken`, `stripTokenQuery`; `createBonjourAdvertiser`, `createNullAdvertiser`, `SERVICE_TYPE`.
- Produces: `startBridge(options)` gains `open?: boolean`, `code?: string`, `dataDir?: string`, `name?: string`, `mdns?: boolean`, `advertiser?: Advertiser`, `version?: string`; `BridgeHandle` gains `pairingCode: string | null`, `pairingRequired: boolean`, `urls: string[]`; `parseArgs` understands `--open`, `--code <6 digits>`, `--name <text>`, `--no-mdns`, `--data-dir <path>`; `DEFAULTS` gains `open: false`, `mdns: true`, `name: ''` (empty = auto), `dataDir: ''` (empty = `~/.avionix`).
- HTTP behaviour: `GET /avionix/info` → 200 `{ name, version, pairingRequired, xplane: { host, port, reachable } }` (reachable = a 1 s `GET /api/capabilities` upstream succeeded); `POST /avionix/pair` JSON `{ code }` → 200 `{ token }`, 401 `pairing_invalid_code`, 429 `pairing_rate_limited`, 400 `invalid_body`; `GET /avionix` → HTML status page; `/api/*` without a valid token → 401 `unauthorized` (JSON, CORS headers) unless `open`; WebSocket upgrade without a valid `?token=` → `HTTP/1.1 401 Unauthorized` and close; with a valid token the `token` query is stripped before forwarding.

- [ ] **Step 1: Update existing tests and add the connector tests**

In `tests/integration/avionix-bridge.test.ts`, in the existing `describe('Avionix bridge', ...)` `beforeEach`, pass `open: true` and `advertiser: createNullAdvertiser()` to `startBridge` so the relay tests keep their current expectations (import `createNullAdvertiser` from `../../scripts/avionix-connector-mdns`). Then add a new describe block:

```ts
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
    expect(published).toEqual([{ name: 'Test Connector', port: bridge.port, txt: { v: '1', pairing: '1' } }]);
  });

  it('protects /api until paired, then accepts the bearer token', async () => {
    const denied = await fetch(`${base}/api/capabilities`, { headers: { Origin: 'http://tablet.local' } });
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

    const allowed = await fetch(`${base}/api/capabilities`, { headers: { Authorization: `Bearer ${token}` } });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ 'x-plane': { version: '12.4.0' } });

    const bad = await fetch(`${base}/api/capabilities`, { headers: { Authorization: 'Bearer nope' } });
    expect(bad.status).toBe(401);
  });

  it('rate-limits pairing after five wrong attempts', async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await fetch(`${base}/avionix/pair`, { method: 'POST', body: JSON.stringify({ code: '111111' }) });
      expect(r.status).toBe(401);
    }
    const limited = await fetch(`${base}/avionix/pair`, { method: 'POST', body: JSON.stringify({ code: '123456' }) });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error_code: 'pairing_rate_limited' });
  });

  it('rejects a malformed pairing body', async () => {
    const r = await fetch(`${base}/avionix/pair`, { method: 'POST', body: '{nope' });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error_code: 'invalid_body' });
  });

  it('requires a token on WebSocket upgrades and strips it before relaying', async () => {
    const paired = await fetch(`${base}/avionix/pair`, { method: 'POST', body: JSON.stringify({ code: '123456' }) });
    const { token } = (await paired.json()) as { token: string };

    const denied = await rawHttp(bridge.port, [
      'GET /api/v3 HTTP/1.1',
      `Host: 127.0.0.1:${bridge.port}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n'));
    expect(denied).toContain(' 401 ');
    expect(xplane.connectionCount).toBe(0);

    const { socket, next } = await openSocket(`ws://127.0.0.1:${bridge.port}/api/v3?token=${token}`);
    await until(() => xplane.connectionCount === 1);
    socket.send(JSON.stringify({ req_id: 1, type: 'dataref_subscribe_values', params: { datarefs: [{ id: 1001 }] } }));
    expect(await next((m) => hasType(m, 'result'))).toEqual({ req_id: 1, type: 'result', success: true });
    socket.close();
    await until(() => xplane.connectionCount === 0);
  });

  it('keeps tokens across restarts', async () => {
    const paired = await fetch(`${base}/avionix/pair`, { method: 'POST', body: JSON.stringify({ code: '123456' }) });
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
    const allowed = await fetch(`${base}/api/capabilities`, { headers: { Authorization: `Bearer ${token}` } });
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
    bridge = await startBridge({ port: 0, host: '127.0.0.1', xplaneHost: xplane.host, xplanePort: xplane.port, staticDir, dataDir, open: true, advertiser: fakeAdvertiser(), log: () => undefined });
  });

  it('open mode disables pairing and advertises pairing=0', async () => {
    await bridge.close();
    published = [];
    bridge = await startBridge({ port: 0, host: '127.0.0.1', xplaneHost: xplane.host, xplanePort: xplane.port, staticDir, dataDir, open: true, advertiser: fakeAdvertiser(), log: () => undefined });
    base = `http://127.0.0.1:${bridge.port}`;
    expect(bridge.pairingRequired).toBe(false);
    expect(bridge.pairingCode).toBeNull();
    expect((await (await fetch(`${base}/avionix/info`)).json()).pairingRequired).toBe(false);
    expect((await fetch(`${base}/api/capabilities`)).status).toBe(200);
    expect(published[0]?.txt).toEqual({ v: '1', pairing: '0' });
  });

  it('reports X-Plane as unreachable in info when it is down', async () => {
    await xplane.stop();
    const info = (await (await fetch(`${base}/avionix/info`)).json()) as { xplane: { reachable: boolean } };
    expect(info.xplane.reachable).toBe(false);
    xplane = await MockXPlaneServer.start();
  });
});
```

Add unit cases to `tests/unit/bridge/parse-args.test.ts`: `--open` → `open: true`; `--code 123456` → `code: '123456'`; `--code 12` throws `--code must be six digits`; `--name "My PC"` → `name: 'My PC'`; `--no-mdns` → `mdns: false`; `--data-dir /tmp/x` → `dataDir: '/tmp/x'`; defaults include `open: false, mdns: true, name: '', dataDir: '', code: ''`.

- [ ] **Step 2: Implement in `scripts/avionix-bridge.js`**

Changes, in order:

1. Requires: `const { ConnectorAuth, extractToken, stripTokenQuery } = require('./avionix-connector-auth');` and `const { createBonjourAdvertiser, createNullAdvertiser } = require('./avionix-connector-mdns');` and `const os = require('node:os');`. Read the version once: `const VERSION = (() => { try { return require('../package.json').version; } catch { return '0.0.0'; } })();`.
2. `DEFAULTS` gains `open: false, code: '', name: '', mdns: true, dataDir: ''`; `parseArgs` handles `--open` (no value), `--code <v>` (must match `/^\d{6}$/`), `--name <v>`, `--no-mdns`, `--data-dir <v>`; `usage()` lists them.
3. `CORS_HEADERS['access-control-allow-headers'] = 'Content-Type, Accept, Authorization'`.
4. `startBridge` builds `const auth = new ConnectorAuth({ dataDir: options.dataDir || undefined, code: options.code || undefined, open: options.open })` and `const name = options.name || \`Avionix Connector (${os.hostname()})\``.
5. Request routing (before the `/api` check): `if (url === '/avionix/info') → info`; `if (url === '/avionix/pair' && method === 'POST') → pair`; `if (url === '/avionix' || url === '/avionix/') → status page`. Then for `/api` paths: `if (req.method !== 'OPTIONS' && !auth.isAuthorized(extractToken(req))) → sendJson(res, 401, { error_code: 'unauthorized', error_message: 'Pair this device with the Avionix Connector first.' })`.
6. `info` handler: `checkUpstream()` does an `http.get` to `/api/capabilities` with a 1000 ms timeout and resolves `true` on any HTTP response, `false` on error/timeout; respond `{ name, version: VERSION, pairingRequired: auth.pairingRequired, xplane: { host, port, reachable } }` via `sendJson`.
7. `pair` handler: read the body (reuse the existing body-reading pattern from `proxyHttp`, or a small `readBody(req)` helper with a 64 KB cap), `JSON.parse` in try/catch → 400 `invalid_body`; `auth.pair(String(body.code ?? ''), req.socket.remoteAddress || 'unknown')`; map `invalid_code` → 401 `pairing_invalid_code` "Wrong pairing code", `rate_limited` → 429 `pairing_rate_limited` "Too many attempts, wait a minute"; success → 200 `{ token }`.
8. Status page: `text/html` with the connector name, version, `Pairing: required` or `Pairing: open`, the X-Plane target, and the list of URLs (`urls`), never the code.
9. `relayUpgrade`: before connecting upstream, `if (!auth.isAuthorized(extractToken(req))) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }`; when rebuilding the request line use `stripTokenQuery(req.url)`.
10. `urls`: from `os.networkInterfaces()`, IPv4, non-internal addresses when host is `0.0.0.0`, else the bound host; `http://<ip>:<port>`.
11. Advertising: `const advertise = options.advertiser || (options.mdns === false ? createNullAdvertiser() : createBonjourAdvertiser())`; after listen, `advertisement = advertise({ name, port, txt: { v: '1', pairing: auth.pairingRequired ? '1' : '0' } })` inside try/catch (log on failure); `close()` awaits `advertisement.stop()` (catch and log).
12. Console (via `log`): the listening line as today, then one `open http://<ip>:<port>` line per URL, then `Pairing code: <code>` or `Pairing disabled (--open)`, then the LAN-exposure warning only in open mode.
13. Return handle fields `pairingCode: auth.pairingRequired ? auth.code : null`, `pairingRequired: auth.pairingRequired`, `urls`.

Update `scripts/avionix-bridge.d.ts` accordingly (new options and handle fields; `Advertiser` imported from `./avionix-connector-mdns`).

- [ ] **Step 3: Run, gate, commit**

```bash
for i in 1 2 3; do npx jest tests/integration/avionix-bridge.test.ts 2>&1 | grep -E '^Tests:|failed to exit'; done
node scripts/avionix-bridge.js --help
npm run typecheck && npm run lint && npm run format:check && npm test
git add scripts tests/integration/avionix-bridge.test.ts tests/unit/bridge/parse-args.test.ts
git commit -m "feat(connector): public info, pairing endpoint, token enforcement, mDNS and status page in the bridge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Documentation

**Files:**
- Create: `docs/connector.md`
- Modify: `docs/web.md`, `README.md`, `docs/testing/xplane-smoke-test.md`

- [ ] **Step 1: `docs/connector.md`**

```markdown
# Avionix Connector protocol

The Avionix Connector is the bridge (`npm run bridge`) running on the X-Plane PC. Besides serving
the web app and relaying the X-Plane Web API, it exposes a small protocol that lets Avionix devices
find it and pair with it.

## Discovery

The connector advertises `_avionix._tcp` over mDNS with TXT records `v=1` and `pairing=1|0`.
Disable with `--no-mdns`; name the instance with `--name "Sim PC"` (default `Avionix Connector (<hostname>)`).

## Endpoints

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /avionix/info` | none | `{ name, version, pairingRequired, xplane: { host, port, reachable } }` |
| `POST /avionix/pair` body `{ "code": "123456" }` | none | `200 { token }`; `401 pairing_invalid_code`; `429 pairing_rate_limited` (five wrong attempts per minute per client); `400 invalid_body` |
| `GET /avionix` | none | human-readable status page (never shows the code) |
| `/api/*` | bearer token | relayed to X-Plane; `401 unauthorized` without a valid token |
| `ws://…/api/vN?token=<token>` | token query | relayed WebSocket; the `token` parameter is removed before forwarding |

Send the token as `Authorization: Bearer <token>` on HTTP requests. Browsers cannot set headers on
WebSockets, so the upgrade carries `?token=`.

## Pairing

On start the connector prints a six-digit code (rotates each run; `--code 123456` fixes it for
tests). A device sends it once to `/avionix/pair` and stores the returned token. Tokens are saved
in `~/.avionix/connector-tokens.json` (`--data-dir` overrides) so paired devices survive restarts.
Delete that file to revoke every device. `--open` disables pairing entirely (trusted networks only).

## Flags

`--port 8080`, `--host 0.0.0.0`, `--xplane 127.0.0.1:8086`, `--static dist/web`, `--open`,
`--code 123456`, `--name "Sim PC"`, `--no-mdns`, `--data-dir ~/.avionix`, `--help`.
```

- [ ] **Step 2: Other docs**

`docs/web.md`: rename the "Build and serve" intro to mention the connector, add "On first use the app asks for the pairing code printed by the connector" and link to `docs/connector.md`. `README.md`: in Getting started, replace the bridge sentence with "Run the Avionix Connector on the X-Plane PC (`npm run bridge`), then pair the app with the code it prints; see `docs/connector.md`". Smoke test: setup step 3 mentions the pairing code; step 16 adds "enter the pairing code when asked".

- [ ] **Step 3: Gate and commit**

```bash
npm run format:check && npm test
git add docs README.md
git commit -m "docs: describe the Avionix Connector protocol, pairing and discovery

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan self-review notes

- Design coverage: info → T3; pairing code/token/rate limit/persistence → T1 + T3; token enforcement HTTP + WebSocket → T3; mDNS → T2 + T3; console + status page → T3; flags → T3; docs → T4. Out of scope untouched.
- Type consistency: `ConnectorAuth` API used identically in T1 tests and T3; `Advertiser`/`AdvertiserSpec` shape used by the fake in T3 tests matches T2; `startBridge` new options/handle fields listed once in T3 and used by its tests; `hasType`, `openSocket`, `rawHttp`, `until` already exist in the integration test file.
- Existing relay tests keep passing because their fixture switches to `open: true` with a null advertiser.
