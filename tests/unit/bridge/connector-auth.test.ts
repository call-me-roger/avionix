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
    expect(fs.readFileSync(path.join(dataDir, 'connector-tokens.json'), 'utf8')).not.toContain(
      '123456',
    );
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

  it('treats empty string code as unset and generates one', () => {
    const auth = new ConnectorAuth({ dataDir, code: '' });
    expect(auth.code).toMatch(/^\d{6}$/);
  });

  it('prunes attempt entries once their window expires, regardless of client count', () => {
    let now = 1_000_000;
    // A large global budget isolates this test from F5's cross-client cap: it is purely
    // about per-client pruning, at a client count the global cap would otherwise trip.
    const auth = new ConnectorAuth({
      dataDir,
      code: '123456',
      now: () => now,
      maxGlobalAttempts: 1000,
    });
    // Fail once from 200 different client keys
    for (let i = 0; i < 200; i += 1) {
      auth.pair('000000', `client-${i}`);
    }
    expect(auth.attemptTrackedClients()).toBe(200);
    // Advance past the window
    now += 61_000;
    // Call pair once more from a new key (triggers pruning)
    auth.pair('000000', 'client-new');
    // Should prune expired entries, leaving only the new one
    expect(auth.attemptTrackedClients()).toBe(1);
  });

  it('F6: evicts the oldest attempt entries once the map exceeds its cap', () => {
    const now = 1_000_000;
    const auth = new ConnectorAuth({
      dataDir,
      code: '123456',
      now: () => now,
      maxAttemptClients: 3,
    });
    auth.pair('000000', 'client-0');
    auth.pair('000000', 'client-1');
    auth.pair('000000', 'client-2');
    expect(auth.attemptTrackedClients()).toBe(3);

    // Nothing has expired (the clock never moved), yet the cap must still hold.
    auth.pair('000000', 'client-3');
    expect(auth.attemptTrackedClients()).toBe(3);

    // The oldest entry (client-0) was evicted, so it gets a fresh budget: a correct
    // code now succeeds immediately instead of being rate-limited.
    expect(auth.pair('123456', 'client-0').ok).toBe(true);
  });

  it('F5: caps pairing attempts globally across all clients', () => {
    const now = 1_000_000;
    const auth = new ConnectorAuth({ dataDir, code: '123456', now: () => now });
    const reasons: (string | undefined)[] = [];
    for (let client = 0; client < 6; client += 1) {
      for (let guess = 0; guess < 4; guess += 1) {
        const result = auth.pair('000000', `client-${client}`);
        reasons.push(result.ok ? undefined : result.reason);
      }
    }
    expect(reasons.filter((r) => r === 'invalid_code')).toHaveLength(20);
    expect(reasons.filter((r) => r === 'too_many_attempts')).toHaveLength(4);
    // Even the correct code is refused while the global window is blown.
    expect(auth.pair('123456', 'client-0')).toEqual({ ok: false, reason: 'too_many_attempts' });
  });

  it('F5: groups IPv6 clients in the same /64 under one attempts budget', () => {
    const now = 1_000_000;
    const auth = new ConnectorAuth({ dataDir, code: '123456', now: () => now });
    const a = '2001:db8:1234:5678:aaaa:bbbb:cccc:0001';
    const b = '2001:db8:1234:5678:eeee:ffff:0000:0002';
    for (let i = 0; i < 3; i += 1) auth.pair('000000', a);
    for (let i = 0; i < 2; i += 1) auth.pair('000000', b);
    // 5 combined wrong guesses (the default per-client cap) from two addresses in the
    // same /64: both are now rate-limited, even the one with the correct code.
    expect(auth.pair('000000', a)).toEqual({ ok: false, reason: 'rate_limited' });
    expect(auth.pair('123456', b)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('F5: treats zero-compressed IPv6 addresses in the same /64 as one client', () => {
    const now = 1_000_000;
    const auth = new ConnectorAuth({ dataDir, code: '123456', now: () => now });
    const a = 'fe80::1111:2222:3333:4444';
    const b = 'fe80::5555:6666:7777:8888';
    const c = '2001:db8::1';
    for (let i = 0; i < 3; i += 1) auth.pair('000000', a);
    for (let i = 0; i < 2; i += 1) auth.pair('000000', b);
    expect(auth.pair('123456', b)).toEqual({ ok: false, reason: 'rate_limited' });
    // A different /64 still has its own budget.
    expect(auth.pair('000000', c)).toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('F8: compares the pairing code safely, without throwing on a length mismatch', () => {
    const auth = new ConnectorAuth({ dataDir, code: '123456' });
    expect(auth.pair('12345', 'x')).toEqual({ ok: false, reason: 'invalid_code' });
    expect(auth.pair('1234567', 'x')).toEqual({ ok: false, reason: 'invalid_code' });
    expect(auth.pair('123456', 'x').ok).toBe(true);
  });

  it('F7: tightens permissions on a pre-existing token file and data dir', () => {
    if (process.platform === 'win32') return; // POSIX chmod semantics don't apply
    fs.chmodSync(dataDir, 0o755);
    const file = path.join(dataDir, 'connector-tokens.json');
    fs.writeFileSync(file, JSON.stringify({ tokens: [] }));
    fs.chmodSync(file, 0o644);

    const auth = new ConnectorAuth({ dataDir, code: '123456' });
    expect(auth.pair('123456', 'x').ok).toBe(true);

    expect(fs.statSync(dataDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe('extractToken / stripTokenQuery', () => {
  const upgrade = { upgrade: 'websocket' };

  it('reads a bearer header', () => {
    expect(extractToken({ headers: { authorization: 'Bearer abc123' } })).toBe('abc123');
    expect(extractToken({ headers: { authorization: 'Basic abc' } })).toBeNull();
    expect(extractToken({ headers: {} })).toBeNull();
  });

  it('F3: falls through to the query token on a WebSocket upgrade when Authorization is invalid', () => {
    expect(
      extractToken({ headers: { authorization: 'Basic abc', ...upgrade }, url: '/x?token=q' }),
    ).toBe('q');
    expect(
      extractToken({ headers: { authorization: 'Bearer', ...upgrade }, url: '/x?token=q' }),
    ).toBe('q');
  });

  it('F3: ignores the query token on a plain HTTP request (no Upgrade: websocket header)', () => {
    expect(extractToken({ headers: {}, url: '/api/v3?token=xyz' })).toBeNull();
    expect(
      extractToken({ headers: { upgrade: 'not-a-websocket' }, url: '/api/v3?token=xyz' }),
    ).toBeNull();
  });

  it('reads a token query parameter on a WebSocket upgrade and strips it', () => {
    expect(extractToken({ headers: upgrade, url: '/api/v3?token=xyz' })).toBe('xyz');
    expect(stripTokenQuery('/api/v3?token=xyz')).toBe('/api/v3');
    expect(stripTokenQuery('/api/v3?a=1&token=xyz&b=2')).toBe('/api/v3?a=1&b=2');
    expect(stripTokenQuery('/api/v3')).toBe('/api/v3');
  });

  it('preserves bytes exactly when stripping token', () => {
    expect(stripTokenQuery('/api/v3/datarefs?filter[name]=a%2Fb&token=x')).toBe(
      '/api/v3/datarefs?filter[name]=a%2Fb',
    );
    expect(stripTokenQuery('/api?q=hello%20world&token=x&z=1')).toBe('/api?q=hello%20world&z=1');
    expect(stripTokenQuery('/api?token=x')).toBe('/api');
    expect(stripTokenQuery('/api?tokenx=1')).toBe('/api?tokenx=1');
  });

  it('F2: decodes a percent-encoded key before matching "token" when stripping', () => {
    expect(stripTokenQuery('/api?%74oken=abc&filter[name]=a%2Fb')).toBe('/api?filter[name]=a%2Fb');
  });

  it('F2: treats an undecodable key as a literal instead of throwing', () => {
    expect(stripTokenQuery('/api?%zz=1&token=abc')).toBe('/api?%zz=1');
  });

  it('F2: the query form extractToken accepts is exactly what stripTokenQuery removes', () => {
    // A percent-encoded "token" key authenticates (extractToken decodes via URLSearchParams)
    // and must also be stripped before forwarding (stripTokenQuery must decode too).
    expect(extractToken({ headers: upgrade, url: '/x?%74oken=abc' })).toBe('abc');
    expect(stripTokenQuery('/x?%74oken=abc')).toBe('/x');
  });

  it('prefers the header over the query', () => {
    expect(
      extractToken({ headers: { authorization: 'Bearer h', ...upgrade }, url: '/x?token=q' }),
    ).toBe('h');
  });
});
