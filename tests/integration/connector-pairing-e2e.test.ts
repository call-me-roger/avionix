import { type ChildProcessByStdio, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';

import { MVP_DATAREFS } from '@/application/mvp-bindings';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

const BRIDGE = path.resolve(__dirname, '../../scripts/avionix-bridge.js');
const PAIRING_CODE = '246810';

async function until(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Starts the real connector and resolves with its child process and the port it bound. */
function startConnector(options: {
  xplaneHost: string;
  xplanePort: number;
  staticDir: string;
  dataDir: string;
}): Promise<{ child: ChildProcessByStdio<null, Readable, Readable>; port: number }> {
  const child = spawn(
    process.execPath,
    [
      BRIDGE,
      '--port',
      '0',
      '--host',
      '127.0.0.1',
      '--xplane',
      `${options.xplaneHost}:${options.xplanePort}`,
      '--static',
      options.staticDir,
      '--code',
      PAIRING_CODE,
      '--data-dir',
      options.dataDir,
      '--no-mdns',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`connector did not report a port in time. stderr: ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      const match = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]) });
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`connector exited early with code ${String(code)}: ${stderr}`));
    });
  });
}

function stopConnector(child: ChildProcessByStdio<null, Readable, Readable>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 2000).unref();
  });
}

function createSession(storage: SettingsStorage): SimulatorSession {
  return new SimulatorSession({
    createHttpTransport: (config, auth) =>
      new HttpTransport({
        origin: `http://${config.host}:${config.port}`,
        auth,
        logger: silentLogger,
        defaultTimeoutMs: 4000,
      }),
    createClient: (config, apiVersion, http, auth) =>
      new XPlaneClient({
        config,
        apiVersion,
        http,
        auth,
        logger: silentLogger,
        requestTimeoutMs: 4000,
        connectTimeoutMs: 4000,
      }),
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore: createPairingTokenStore(storage),
    logger: silentLogger,
  });
}

describe('pairing through the real Avionix Connector', () => {
  let xplane: MockXPlaneServer;
  let child: ChildProcessByStdio<null, Readable, Readable>;
  let bridgePort: number;
  let staticDir: string;
  let dataDir: string;

  beforeEach(async () => {
    xplane = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-e2e-web-'));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-e2e-data-'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Avionix</title>');
    const started = await startConnector({
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
    });
    child = started.child;
    bridgePort = started.port;
  });

  afterEach(async () => {
    await stopConnector(child);
    await xplane.stop();
    fs.rmSync(staticDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('pairs with the printed code, reads a DataRef and stores a reusable token', async () => {
    const storage = createMemorySettingsStorage();
    const session = createSession(storage);
    const snap = () => session.store.getSnapshot();

    await session.connect('127.0.0.1', bridgePort);
    expect(snap().state).toBe('pairing');
    expect(snap().connector?.pairingRequired).toBe(true);
    expect(snap().connector?.xplane.port).toBe(xplane.port);

    await session.pair('000000');
    expect(snap().state).toBe('pairing');
    expect(snap().error?.code).toBe('PAIRING_FAILED');

    await session.pair(PAIRING_CODE);
    expect(snap().state).toBe('connected');
    expect(snap().diagnostics.connector).toBe('paired');
    expect(snap().error).toBeNull();

    xplane.setDataRefValue('sim/time/total_running_time_sec', 42);
    await until(() => snap().telemetry[MVP_DATAREFS.heartbeat]?.value === 42);

    await expect(createPairingTokenStore(storage).get('127.0.0.1', bridgePort)).resolves.toEqual(
      expect.any(String),
    );
    expect(fs.existsSync(path.join(dataDir, 'connector-tokens.json'))).toBe(true);

    session.disconnect();
    await until(() => xplane.connectionCount === 0);

    // A second session on the same storage reuses the token and never pairs again.
    const second = createSession(storage);
    await second.connect('127.0.0.1', bridgePort);
    expect(second.store.getSnapshot().state).toBe('connected');
    second.disconnect();
  });
});
