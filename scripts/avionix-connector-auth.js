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
