#!/usr/bin/env node
/* Avionix bridge: serves the exported web app and relays the X-Plane Web API to the LAN.
   Node built-ins only. Run on the X-Plane PC: `node scripts/avionix-bridge.js --port 8080`. */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const { ConnectorAuth, extractToken, stripTokenQuery } = require('./avionix-connector-auth');
const { createBonjourAdvertiser, createNullAdvertiser } = require('./avionix-connector-mdns');

const VERSION = (() => {
  try {
    return require('../package.json').version;
  } catch {
    return '0.0.0';
  }
})();

const DEFAULTS = Object.freeze({
  port: 8080,
  host: '0.0.0.0',
  xplaneHost: '127.0.0.1',
  xplanePort: 8086,
  staticDir: 'dist/web',
  open: false,
  code: '',
  name: '',
  mdns: true,
  dataDir: '',
});

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
  'access-control-allow-headers': 'Content-Type, Accept, Authorization',
  'access-control-max-age': '600',
};

// Headers that only make sense on a single hop; forwarding them lets the two
// connections' framing fight each other (Node recomputes them for us).
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'upgrade',
  'proxy-connection',
];

function stripHopByHop(headers) {
  const copy = { ...headers };
  for (const name of HOP_BY_HOP_HEADERS) delete copy[name];
  return copy;
}

function isApiPath(url) {
  return url === '/api' || url.startsWith('/api/');
}

function usage() {
  return [
    'Usage: node scripts/avionix-bridge.js [--port 8080] [--host 0.0.0.0] [--xplane 127.0.0.1:8086] [--static dist/web]',
    '                                       [--open] [--code 123456] [--name "My PC"] [--no-mdns] [--data-dir <path>]',
    '',
    'Serves the exported Avionix web app and relays /api/* (HTTP and WebSocket) to X-Plane.',
    'Run it on the computer where X-Plane runs; X-Plane only accepts local connections.',
    '',
    'Devices must pair with a 6-digit code before /api is reachable, unless --open is set.',
    '  --open          disable pairing; every device on the network can use /api unauthenticated',
    '  --code <digits> use a fixed 6-digit pairing code instead of a random one',
    '  --name <text>   name advertised for this connector (defaults to the hostname)',
    '  --no-mdns       do not advertise the connector over mDNS/Bonjour',
    '  --data-dir <path>  where paired tokens are stored (defaults to ~/.avionix)',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--help' || arg === '-h') return 'help';
    if (arg === '--port') {
      if (value === undefined) throw new Error('--port requires a value');
      options.port = Number(value);
      i += 1;
      continue;
    }
    if (arg === '--host') {
      if (value === undefined) throw new Error('--host requires a value');
      options.host = value;
      i += 1;
      continue;
    }
    if (arg === '--static') {
      if (value === undefined) throw new Error('--static requires a value');
      options.staticDir = value;
      i += 1;
      continue;
    }
    if (arg === '--xplane') {
      if (value === undefined) throw new Error('--xplane requires a value');
      const [h, p] = value.split(':');
      options.xplaneHost = h || DEFAULTS.xplaneHost;
      options.xplanePort = p ? Number(p) : DEFAULTS.xplanePort;
      i += 1;
      continue;
    }
    if (arg === '--open') {
      options.open = true;
      continue;
    }
    if (arg === '--code') {
      if (value === undefined) throw new Error('--code requires a value');
      if (!/^\d{6}$/.test(value)) throw new Error('--code must be six digits');
      options.code = value;
      i += 1;
      continue;
    }
    if (arg === '--name') {
      if (value === undefined) throw new Error('--name requires a value');
      options.name = value;
      i += 1;
      continue;
    }
    if (arg === '--no-mdns') {
      options.mdns = false;
      continue;
    }
    if (arg === '--data-dir') {
      if (value === undefined) throw new Error('--data-dir requires a value');
      options.dataDir = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535)
    throw new Error('--port must be 0..65535');
  if (!Number.isInteger(options.xplanePort) || options.xplanePort < 1 || options.xplanePort > 65535)
    throw new Error('--xplane port must be 1..65535');
  return options;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

const MAX_PAIR_BODY_BYTES = 64 * 1024;

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function checkUpstream(options) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: options.xplaneHost,
        port: options.xplanePort,
        path: '/api/capabilities',
        timeout: 1000,
      },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function handleInfo(options, auth, name, res) {
  const reachable = await checkUpstream(options);
  sendJson(res, 200, {
    name,
    version: VERSION,
    pairingRequired: auth.pairingRequired,
    xplane: { host: options.xplaneHost, port: options.xplanePort, reachable },
  });
}

async function handlePair(req, res, auth) {
  let raw;
  try {
    raw = await readBody(req, MAX_PAIR_BODY_BYTES);
  } catch {
    sendJson(res, 400, {
      error_code: 'invalid_body',
      error_message: 'Could not read the request body.',
    });
    return;
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error_code: 'invalid_body', error_message: 'Body must be JSON.' });
    return;
  }
  const clientKey = req.socket.remoteAddress || 'unknown';
  const result = auth.pair(String((body && body.code) ?? ''), clientKey);
  if (result.ok) {
    sendJson(res, 200, { token: result.token });
    return;
  }
  if (result.reason === 'rate_limited') {
    sendJson(res, 429, {
      error_code: 'pairing_rate_limited',
      error_message: 'Too many attempts, wait a minute',
    });
    return;
  }
  sendJson(res, 401, { error_code: 'pairing_invalid_code', error_message: 'Wrong pairing code' });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderStatusPage(options, auth, name, urls) {
  const pairingLine = auth.pairingRequired ? 'Pairing: required' : 'Pairing: open';
  const urlItems = urls.map((url) => `<li>${escapeHtml(url)}</li>`).join('');
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Avionix Connector</title></head><body>',
    `<h1>${escapeHtml(name)}</h1>`,
    `<p>Avionix Connector ${escapeHtml(VERSION)}</p>`,
    `<p>${escapeHtml(pairingLine)}</p>`,
    `<p>X-Plane target: ${escapeHtml(`${options.xplaneHost}:${options.xplanePort}`)}</p>`,
    `<ul>${urlItems}</ul>`,
    '</body></html>',
  ].join('\n');
}

function computeUrls(host, port) {
  if (host !== '0.0.0.0') return [`http://${host}:${port}`];
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return urls;
}

function resolveStatic(staticDir, urlPath) {
  const root = path.resolve(staticDir);
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    // Malformed percent-escape (e.g. "/%ZZ"): fall back to the SPA shell.
    return path.join(root, 'index.html');
  }
  const candidate = path.resolve(root, `.${decoded}`);
  if (!candidate.startsWith(root + path.sep) && candidate !== root)
    return path.join(root, 'index.html');
  try {
    const stat = fs.statSync(candidate);
    let resolved;
    if (stat.isFile()) {
      resolved = candidate;
    } else if (stat.isDirectory()) {
      const index = path.join(candidate, 'index.html');
      if (fs.existsSync(index)) resolved = index;
    }
    if (resolved !== undefined) {
      const realRoot = fs.realpathSync(root);
      const realResolved = fs.realpathSync(resolved);
      if (realResolved === realRoot || realResolved.startsWith(realRoot + path.sep)) {
        return resolved;
      }
    }
  } catch {
    // fall through to the SPA fallback (also covers a dangling symlink)
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

function proxyHttp(options, req, res, log, pendingUpstreamRequests) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  const headers = stripHopByHop({
    ...req.headers,
    host: `${options.xplaneHost}:${options.xplanePort}`,
  });
  delete headers.origin;
  const upstream = http.request(
    {
      host: options.xplaneHost,
      port: options.xplanePort,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      const responseHeaders = { ...stripHopByHop(upstreamRes.headers), ...CORS_HEADERS };
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.on('error', (error) => {
        log(`upstream response error ${req.method} ${req.url}: ${error.message}`);
        if (!res.writableEnded) res.destroy();
      });
      upstreamRes.pipe(res);
    },
  );
  pendingUpstreamRequests.add(upstream);
  const forgetUpstream = () => pendingUpstreamRequests.delete(upstream);
  upstream.on('close', forgetUpstream);
  upstream.on('error', (error) => {
    log(`upstream error ${req.method} ${req.url}: ${error.message}`);
    if (res.headersSent || res.writableEnded) {
      // A response is already underway; we cannot send a fresh JSON error
      // without crashing on "headers already sent", so just tear it down.
      res.destroy();
      return;
    }
    sendJson(res, 502, {
      error_code: 'bridge_upstream_unreachable',
      error_message: `X-Plane at ${options.xplaneHost}:${options.xplanePort} is unreachable: ${error.message}`,
    });
  });
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });
  req.pipe(upstream);
}

function relayUpgrade(options, req, socket, head, log, relays, auth) {
  if (!auth.isAuthorized(extractToken(req))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const upstream = net.connect(options.xplanePort, options.xplaneHost);
  const entry = { socket, upstream };
  relays.add(entry);
  const forget = () => relays.delete(entry);
  let handshaken = false;
  upstream.once('data', () => {
    handshaken = true;
  });

  upstream.on('connect', () => {
    upstream.setNoDelay(true);
    const lines = [`${req.method} ${stripTokenQuery(req.url)} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const headerName = req.rawHeaders[i];
      const value =
        headerName.toLowerCase() === 'host'
          ? `${options.xplaneHost}:${options.xplanePort}`
          : req.rawHeaders[i + 1];
      lines.push(`${headerName}: ${value}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head && head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', (error) => {
    log(`websocket upstream error: ${error.message}`);
    if (handshaken) {
      socket.destroy();
      upstream.destroy();
      return;
    }
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });
  // Let a close frame flush both ways before tearing the sockets down hard.
  upstream.on('end', () => socket.end());
  socket.on('end', () => upstream.end());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => {
    upstream.destroy();
    forget();
  });
  upstream.on('close', () => {
    socket.destroy();
    forget();
  });
}

function startBridge(overrides = {}) {
  const options = { ...DEFAULTS, ...overrides };
  const log = options.log || ((line) => console.log(`[avionix-bridge] ${line}`));
  const relays = new Set();
  const pendingUpstreamRequests = new Set();
  const auth = new ConnectorAuth({
    dataDir: options.dataDir || undefined,
    code: options.code || undefined,
    open: options.open,
  });
  const name = options.name || `Avionix Connector (${os.hostname()})`;
  const advertise =
    options.advertiser ||
    (options.mdns === false ? createNullAdvertiser() : createBonjourAdvertiser(undefined, log));
  let urls = [];

  const server = http.createServer((req, res) => {
    const url = req.url || '';
    if (url === '/avionix/info') {
      handleInfo(options, auth, name, res);
      return;
    }
    if (url === '/avionix/pair' && req.method === 'POST') {
      handlePair(req, res, auth);
      return;
    }
    if (url === '/avionix' || url === '/avionix/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderStatusPage(options, auth, name, urls));
      return;
    }
    if (isApiPath(url)) {
      if (req.method !== 'OPTIONS' && !auth.isAuthorized(extractToken(req))) {
        sendJson(res, 401, {
          error_code: 'unauthorized',
          error_message: 'Pair this device with the Avionix Connector first.',
        });
        return;
      }
      proxyHttp(options, req, res, log, pendingUpstreamRequests);
    } else {
      serveStatic(options, req, res);
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (isApiPath(req.url || '')) {
      log(`websocket ${req.socket.remoteAddress} -> ${req.url}`);
      relayUpgrade(options, req, socket, head, log, relays, auth);
    } else {
      socket.destroy();
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      urls = computeUrls(options.host, port);
      log(
        `listening on http://${options.host}:${port}, serving ${path.resolve(options.staticDir)}, relaying /api to ${options.xplaneHost}:${options.xplanePort}`,
      );
      for (const url of urls) {
        log(`open ${url}`);
      }
      log(auth.pairingRequired ? `Pairing code: ${auth.code}` : 'Pairing disabled (--open)');
      if (options.host === '0.0.0.0' && options.open) {
        log(
          "This exposes X-Plane's unauthenticated API to every device on the networks this computer is on; use --host <LAN IP> to restrict.",
        );
      }
      let advertisement = null;
      try {
        advertisement = advertise({
          name,
          port,
          txt: { v: '1', pairing: auth.pairingRequired ? '1' : '0' },
        });
      } catch (error) {
        log(`mDNS advertise error: ${error instanceof Error ? error.message : String(error)}`);
      }
      let closePromise = null;
      resolve({
        port,
        host: options.host,
        pairingCode: auth.pairingRequired ? auth.code : null,
        pairingRequired: auth.pairingRequired,
        urls,
        close: () => {
          if (closePromise) return closePromise;
          closePromise = (async () => {
            for (const entry of relays) {
              entry.socket.destroy();
              entry.upstream.destroy();
            }
            relays.clear();
            for (const upstreamRequest of pendingUpstreamRequests) {
              upstreamRequest.destroy();
            }
            pendingUpstreamRequests.clear();
            server.closeAllConnections();
            await new Promise((done) => server.close(() => done()));
            if (advertisement) {
              try {
                await advertisement.stop();
              } catch (error) {
                log(`mDNS stop error: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
          })();
          return closePromise;
        },
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
