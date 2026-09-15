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

/** Constant-time code comparison; a length mismatch is just "not equal", never a throw. */
function codesMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Groups a client key for rate-limiting purposes: IPv4 (and IPv4-mapped IPv6, defensively;
 * the bridge already normalizes that away before calling in) pass through unchanged, but a
 * bare IPv6 address is reduced to its first four hextets (its /64) so an attacker can't dodge
 * the per-client budget by cycling through addresses in the same /64.
 */
function attemptsKeyFor(clientKey) {
  if (typeof clientKey !== 'string' || !clientKey.includes(':')) return clientKey;
  if (clientKey.startsWith('::ffff:')) return clientKey.slice('::ffff:'.length);
  const hextets = expandIpv6(clientKey).slice(0, 4);
  return `${hextets.join(':')}/64`;
}

/**
 * Expands a possibly zero-compressed IPv6 address (`fe80::1`) into its eight hextets so the
 * /64 prefix can be sliced positionally. Addresses without `::` are split as-is.
 */
function expandIpv6(address) {
  const zone = address.indexOf('%');
  const bare = zone === -1 ? address : address.slice(0, zone);
  if (!bare.includes('::')) return bare.split(':');
  const [head, tail] = bare.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = Math.max(0, 8 - left.length - right.length);
  return [...left, ...new Array(missing).fill('0'), ...right];
}

class ConnectorAuth {
  constructor(options = {}) {
    this.dataDir = options.dataDir ?? defaultDataDir();
    this.open = options.open === true;
    this.code = options.code && options.code.length > 0 ? options.code : generatePairingCode();
    this.now = options.now ?? Date.now;
    this.random = options.random ?? generateToken;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.windowMs = options.windowMs ?? 60000;
    this.maxGlobalAttempts = options.maxGlobalAttempts ?? 20;
    this.maxAttemptClients = options.maxAttemptClients ?? 1000;
    this.attempts = new Map(); // clientKey -> number[] (timestamps)
    this.globalAttempts = []; // timestamps of every wrong guess, across all clients
    this.tokens = new Set(this.load());
  }

  get pairingRequired() {
    return !this.open;
  }

  tokenCount() {
    return this.tokens.size;
  }

  attemptTrackedClients() {
    return this.attempts.size;
  }

  isAuthorized(token) {
    if (this.open) return true;
    return typeof token === 'string' && this.tokens.has(token);
  }

  pair(code, clientKey) {
    if (this.open) return { ok: false, reason: 'invalid_code' };
    const key = attemptsKeyFor(clientKey);
    this.pruneAttempts();
    const now = this.now();

    this.globalAttempts = this.globalAttempts.filter((t) => now - t < this.windowMs);
    if (this.globalAttempts.length >= this.maxGlobalAttempts) {
      return { ok: false, reason: 'too_many_attempts' };
    }

    const recent = (this.attempts.get(key) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.maxAttempts) {
      this.attempts.set(key, recent);
      return { ok: false, reason: 'rate_limited' };
    }
    if (typeof code !== 'string' || !codesMatch(code, this.code)) {
      recent.push(now);
      this.attempts.set(key, recent.slice(-this.maxAttempts));
      this.globalAttempts.push(now);
      this.enforceAttemptsCap();
      return { ok: false, reason: 'invalid_code' };
    }
    this.attempts.delete(key);
    const token = this.random();
    this.tokens.add(token);
    this.save();
    return { ok: true, token };
  }

  pruneAttempts() {
    const now = this.now();
    for (const [key, timestamps] of this.attempts.entries()) {
      const recent = timestamps.filter((t) => now - t < this.windowMs);
      if (recent.length === 0) {
        this.attempts.delete(key);
      } else {
        this.attempts.set(key, recent);
      }
    }
  }

  /** Bounds memory under a distributed-guessing flood: oldest client entries go first. */
  enforceAttemptsCap() {
    while (this.attempts.size > this.maxAttemptClients) {
      const oldestKey = this.attempts.keys().next().value;
      this.attempts.delete(oldestKey);
    }
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
    const file = path.join(this.dataDir, TOKEN_FILE);
    const tmpFile = `${file}.tmp`;
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      // Write to a temp file and rename over the target so a reader (or a crash mid-write)
      // never observes a half-written token file.
      fs.writeFileSync(tmpFile, JSON.stringify({ tokens: [...this.tokens] }, null, 2), {
        mode: 0o600,
      });
      fs.renameSync(tmpFile, file);
      // `mode` on writeFileSync/mkdirSync only applies when the file/dir is created; tighten
      // permissions explicitly in case either pre-existed with looser ones.
      try {
        fs.chmodSync(file, 0o600);
      } catch {
        // e.g. some platforms (Windows) don't support POSIX chmod bits; best effort.
      }
      try {
        fs.chmodSync(this.dataDir, 0o700);
      } catch {
        // same
      }
    } catch (error) {
      // best effort; tokens still work for this run
      process.stderr.write(`[avionix-connector] could not save tokens: ${error.message}\n`);
    }
  }
}

function isUpgradeRequest(req) {
  const header = req.headers && req.headers.upgrade;
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.toLowerCase() === 'websocket';
}

function extractToken(req) {
  const header = req.headers && req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value === 'string') {
    const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
    if (match) return match[1];
  }
  // Browsers cannot set headers on a WebSocket handshake, so only the upgrade path may
  // fall back to a `?token=` query parameter; plain HTTP must use the Authorization header.
  if (isUpgradeRequest(req) && typeof req.url === 'string') {
    const query = req.url.split('?')[1];
    if (query) {
      const params = new URLSearchParams(query);
      const token = params.get('token');
      if (token) return token;
    }
  }
  return null;
}

/** Decodes a query segment's key (up to the first "="); a malformed escape is left as-is. */
function decodeSegmentKey(rawKey) {
  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
}

function stripTokenQuery(url) {
  const [pathname, query] = url.split('?');
  if (!query) return url;
  const segments = query.split('&');
  const remaining = segments.filter((seg) => {
    const eq = seg.indexOf('=');
    const rawKey = eq === -1 ? seg : seg.slice(0, eq);
    return decodeSegmentKey(rawKey) !== 'token';
  });
  return remaining.length > 0 ? `${pathname}?${remaining.join('&')}` : pathname;
}

module.exports = { ConnectorAuth, generatePairingCode, extractToken, stripTokenQuery, TOKEN_FILE };
