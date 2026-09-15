#!/usr/bin/env node
/* Avionix bridge: serves the exported web app and relays the X-Plane Web API to the LAN.
   Node built-ins only. Run on the X-Plane PC: `node scripts/avionix-bridge.js --port 8080`. */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const DEFAULTS = {
  port: 8080,
  host: '0.0.0.0',
  xplaneHost: '127.0.0.1',
  xplanePort: 8086,
  staticDir: 'dist/web',
};

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
    if (arg === '--port') {
      options.port = Number(value);
      i += 1;
      continue;
    }
    if (arg === '--host') {
      options.host = String(value);
      i += 1;
      continue;
    }
    if (arg === '--static') {
      options.staticDir = String(value);
      i += 1;
      continue;
    }
    if (arg === '--xplane') {
      const [h, p] = String(value).split(':');
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
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
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

function proxyHttp(options, req, res, log) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  const headers = { ...req.headers, host: `${options.xplaneHost}:${options.xplanePort}` };
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
      log(
        `listening on http://${options.host}:${port}, serving ${path.resolve(options.staticDir)}, relaying /api to ${options.xplaneHost}:${options.xplanePort}`,
      );
      resolve({
        port,
        host: options.host,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
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
