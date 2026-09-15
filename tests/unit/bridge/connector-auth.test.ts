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

  it('bounds the attempts map and prunes expired entries', () => {
    let now = 1_000_000;
    const auth = new ConnectorAuth({ dataDir, code: '123456', now: () => now });
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
});

describe('extractToken / stripTokenQuery', () => {
  it('reads a bearer header', () => {
    expect(extractToken({ headers: { authorization: 'Bearer abc123' } })).toBe('abc123');
    expect(extractToken({ headers: { authorization: 'Basic abc' } })).toBeNull();
    expect(extractToken({ headers: {} })).toBeNull();
  });

  it('falls through to query token when Authorization header is invalid', () => {
    expect(extractToken({ headers: { authorization: 'Basic abc' }, url: '/x?token=q' })).toBe('q');
    expect(extractToken({ headers: { authorization: 'Bearer' }, url: '/x?token=q' })).toBe('q');
  });

  it('reads a token query parameter and strips it', () => {
    expect(extractToken({ headers: {}, url: '/api/v3?token=xyz' })).toBe('xyz');
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

  it('prefers the header over the query', () => {
    expect(extractToken({ headers: { authorization: 'Bearer h' }, url: '/x?token=q' })).toBe('h');
  });
});
