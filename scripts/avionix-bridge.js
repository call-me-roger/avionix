#!/usr/bin/env node
/* Avionix bridge: serves the exported web app and relays the X-Plane Web API to the LAN.
   Node built-ins only. Run on the X-Plane PC: `node scripts/avionix-bridge.js --port 8080`. */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  port: 8080,
  host: '0.0.0.0',
  xplaneHost: '127.0.0.1',
  xplanePort: 8086,
  staticDir: 'dist/web',
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
  'access-control-allow-headers': 'Content-Type, Accept',
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

function relayUpgrade(options, req, socket, head, log, relays) {
  const upstream = net.connect(options.xplanePort, options.xplaneHost);
  const entry = { socket, upstream };
  relays.add(entry);
  const forget = () => relays.delete(entry);

  upstream.on('connect', () => {
    upstream.setNoDelay(true);
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i];
      const value =
        name.toLowerCase() === 'host'
          ? `${options.xplaneHost}:${options.xplanePort}`
          : req.rawHeaders[i + 1];
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
  const server = http.createServer((req, res) => {
    if (isApiPath(req.url || '')) {
      proxyHttp(options, req, res, log, pendingUpstreamRequests);
    } else {
      serveStatic(options, req, res);
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (isApiPath(req.url || '')) {
      log(`websocket ${req.socket.remoteAddress} -> ${req.url}`);
      relayUpgrade(options, req, socket, head, log, relays);
    } else {
      socket.destroy();
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      log(
        `listening on http://${options.host}:${port}, serving ${path.resolve(options.staticDir)}, relaying /api to ${options.xplaneHost}:${options.xplanePort}`,
      );
      let closePromise = null;
      resolve({
        port,
        host: options.host,
        close: () => {
          if (closePromise) return closePromise;
          closePromise = new Promise((done) => {
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
            server.close(() => done());
          });
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
