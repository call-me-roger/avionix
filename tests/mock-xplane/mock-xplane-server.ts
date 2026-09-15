import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { WebSocket as WsSocket, WebSocketServer } from 'ws';

import type { DataRefValue, DataRefValueType } from '@/domain/simulator/types';

export interface MockDataRef {
  id: number;
  name: string;
  valueType: DataRefValueType;
  value: DataRefValue;
  writable?: boolean;
}

export interface MockCommand {
  id: number;
  name: string;
  description: string;
}

export interface MockConnectorOptions {
  name: string;
  pairingRequired: boolean;
  code: string;
  rejectAllTokens?: boolean;
}

export interface MockXPlaneOptions {
  apiVersions?: string[];
  xplaneVersion?: string;
  capabilitiesMode?: 'ok' | 'not_found';
  dataRefs?: MockDataRef[];
  commands?: MockCommand[];
  updateIntervalMs?: number;
  connector?: MockConnectorOptions;
}

export const DEFAULT_MOCK_DATAREFS: MockDataRef[] = [
  { id: 1001, name: 'sim/time/total_running_time_sec', valueType: 'float', value: 12.5 },
  {
    id: 1002,
    name: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
    valueType: 'float',
    value: 0,
  },
  {
    id: 1003,
    name: 'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
    valueType: 'float',
    value: 270,
    writable: true,
  },
  {
    id: 1004,
    name: 'sim/flightmodel/weight/m_fuel',
    valueType: 'float_array',
    value: [10, 20, 30],
  },
  { id: 1005, name: 'sim/aircraft/view/acf_tailnum', valueType: 'data', value: 'TklsNzc=' },
];

export const DEFAULT_MOCK_COMMANDS: MockCommand[] = [
  { id: 2001, name: 'sim/autopilot/heading_up', description: 'Autopilot heading up.' },
  { id: 2002, name: 'sim/operation/pause_toggle', description: 'Pause the simulation.' },
];

interface JsonError {
  status: number;
  error_code: string;
  error_message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonError(value: unknown): value is JsonError {
  return (
    isRecord(value) &&
    typeof value.status === 'number' &&
    typeof value.error_code === 'string' &&
    typeof value.error_message === 'string'
  );
}

function isDataRefValue(value: unknown): value is DataRefValue {
  return (
    typeof value === 'number' ||
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'number'))
  );
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export class MockXPlaneServer {
  readonly writes: Array<{ id: number; value: DataRefValue; index?: number }> = [];
  readonly activations: Array<{ id: number; duration: number }> = [];
  readonly receivedMessages: unknown[] = [];
  incomingTrafficDisabled = false;
  /** When true, WebSocket requests are recorded but never answered (for cancellation tests). */
  pauseReplies = false;
  /** Tokens handed out by `/avionix/pair`, in issue order. */
  readonly issuedTokens: string[] = [];

  private readonly apiVersions: string[];
  private readonly xplaneVersion: string;
  private readonly capabilitiesMode: 'ok' | 'not_found';
  private readonly connector: MockConnectorOptions | undefined;
  private rejectAllTokens: boolean;
  private readonly dataRefs: Map<number, MockDataRef>;
  private readonly commands: Map<number, MockCommand>;
  private readonly sockets = new Set<WsSocket>();
  private readonly subscriptions = new Map<WsSocket, Map<number, string>>();
  private readonly timer: NodeJS.Timeout;

  private constructor(
    private readonly server: http.Server,
    private readonly wss: WebSocketServer,
    options: MockXPlaneOptions,
  ) {
    this.apiVersions = options.apiVersions ?? ['v1', 'v2', 'v3'];
    this.xplaneVersion = options.xplaneVersion ?? '12.4.0';
    this.capabilitiesMode = options.capabilitiesMode ?? 'ok';
    this.dataRefs = new Map(
      (options.dataRefs ?? DEFAULT_MOCK_DATAREFS).map((d) => [d.id, { ...d }]),
    );
    this.commands = new Map((options.commands ?? DEFAULT_MOCK_COMMANDS).map((c) => [c.id, c]));
    this.connector = options.connector;
    this.rejectAllTokens = options.connector?.rejectAllTokens ?? false;
    this.timer = setInterval(() => this.pushUpdates(), options.updateIntervalMs ?? 20);
    this.timer.unref();
  }

  static start(options: MockXPlaneOptions = {}): Promise<MockXPlaneServer> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      const wss = new WebSocketServer({ noServer: true });
      const instance = new MockXPlaneServer(server, wss, options);
      server.on('request', (req, res) => {
        instance.handleHttp(req, res).catch((error: unknown) => {
          res.writeHead(500).end(String(error));
        });
      });
      server.on('upgrade', (req, socket, head) => instance.handleUpgrade(req, socket, head));
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(instance));
    });
  }

  get host(): string {
    return '127.0.0.1';
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  get connectionCount(): number {
    return this.sockets.size;
  }

  getDataRefByName(name: string): MockDataRef | undefined {
    return [...this.dataRefs.values()].find((d) => d.name === name);
  }

  setDataRefValue(name: string, value: DataRefValue): void {
    const dataRef = this.getDataRefByName(name);
    if (dataRef === undefined) {
      throw new Error(`mock dataref ${name} not defined`);
    }
    dataRef.value = value;
  }

  /** Simulates a connector that has forgotten every paired device (token file deleted). */
  setRejectAllTokens(value: boolean): void {
    this.rejectAllTokens = value;
  }

  sendRawToAll(text: string): void {
    for (const socket of this.sockets) {
      socket.send(text);
    }
  }

  closeAllSockets(code = 1001): void {
    for (const socket of this.sockets) {
      socket.close(code, 'mock close');
    }
  }

  terminateAllSockets(): void {
    for (const socket of this.sockets) {
      socket.terminate();
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.terminateAllSockets();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // ---- HTTP -------------------------------------------------------------

  private bearerToken(req: http.IncomingMessage): string | null {
    const header = req.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value !== 'string') {
      return null;
    }
    const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
    return match?.[1] ?? null;
  }

  private tokenAccepted(token: string | null): boolean {
    if (this.connector === undefined || !this.connector.pairingRequired) {
      return true;
    }
    if (this.rejectAllTokens) {
      return false;
    }
    return token !== null && this.issuedTokens.includes(token);
  }

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    if (this.incomingTrafficDisabled) {
      res.writeHead(403).end();
      return;
    }
    const connector = this.connector;
    if (connector !== undefined) {
      if (url.pathname === '/avionix/info') {
        if (method !== 'GET') {
          res.writeHead(405).end();
          return;
        }
        this.json(res, 200, {
          name: connector.name,
          version: '1.0.0-mock',
          pairingRequired: connector.pairingRequired,
          xplane: { host: this.host, port: this.port, reachable: true },
        });
        return;
      }
      if (url.pathname === '/avionix/pair') {
        if (method !== 'POST') {
          res.writeHead(405).end();
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(await readBody(req));
        } catch {
          this.json(res, 400, {
            error_code: 'invalid_body',
            error_message: 'Body must be JSON.',
          });
          return;
        }
        if (!isRecord(parsed) || typeof parsed.code !== 'string') {
          this.json(res, 400, {
            error_code: 'invalid_body',
            error_message: 'Body must include a code string.',
          });
          return;
        }
        if (parsed.code !== connector.code) {
          this.json(res, 401, {
            error_code: 'pairing_invalid_code',
            error_message: 'Wrong pairing code',
          });
          return;
        }
        const token = `mock-token-${this.issuedTokens.length + 1}`;
        this.issuedTokens.push(token);
        this.json(res, 200, { token });
        return;
      }
      if (url.pathname.startsWith('/api') && !this.tokenAccepted(this.bearerToken(req))) {
        this.json(res, 401, {
          error_code: 'unauthorized',
          error_message: 'Pair this device with the Avionix Connector first.',
        });
        return;
      }
    }
    try {
      if (url.pathname === '/api/capabilities' && method === 'GET') {
        if (this.capabilitiesMode === 'not_found') {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
          return;
        }
        this.json(res, 200, {
          api: { versions: this.apiVersions },
          'x-plane': { version: this.xplaneVersion },
        });
        return;
      }
      const versioned = /^\/api\/(v\d)(\/.*)$/.exec(url.pathname);
      if (versioned === null) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
        return;
      }
      const [, version, rest] = versioned;
      if (version === undefined || rest === undefined || !this.apiVersions.includes(version)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
        return;
      }
      await this.handleVersioned(method, rest, url, req, res);
    } catch (error) {
      if (isJsonError(error)) {
        this.json(res, error.status, {
          error_code: error.error_code,
          error_message: error.error_message,
        });
        return;
      }
      throw error;
    }
  }

  private async handleVersioned(
    method: string,
    path: string,
    url: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (path === '/datarefs' && method === 'GET') {
      const names = url.searchParams.getAll('filter[name]');
      const all = [...this.dataRefs.values()];
      const selected = names.length === 0 ? all : all.filter((d) => names.includes(d.name));
      const missing = names.find((name) => !all.some((d) => d.name === name));
      if (missing !== undefined) {
        this.fail(404, 'invalid_dataref_name', `Dataref ${missing} doesn't exist`);
      }
      this.json(res, 200, {
        data: selected.map((d) => ({ id: d.id, name: d.name, value_type: d.valueType })),
      });
      return;
    }
    if (path === '/datarefs/count' && method === 'GET') {
      this.json(res, 200, { data: this.dataRefs.size });
      return;
    }
    const valueMatch = /^\/datarefs\/(\d+)\/value$/.exec(path);
    if (valueMatch !== null) {
      const id = Number(valueMatch[1]);
      const dataRef = this.dataRefs.get(id);
      if (dataRef === undefined) {
        this.fail(404, 'invalid_dataref_id', `Dataref ${id} doesn't exist`);
      }
      const indexParam = url.searchParams.get('index');
      const index = indexParam === null ? undefined : Number(indexParam);
      if (method === 'GET') {
        this.json(res, 200, { data: this.readValue(dataRef, index) });
        return;
      }
      if (method === 'PATCH') {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          this.fail(400, 'invalid_body', 'The request body is not valid JSON');
        }
        if (!isRecord(parsed) || !isDataRefValue(parsed.data)) {
          this.fail(400, 'invalid_body', 'The request body is not valid JSON');
        }
        this.writeValue(dataRef, parsed.data, index);
        this.writes.push(
          index === undefined ? { id, value: parsed.data } : { id, value: parsed.data, index },
        );
        res.writeHead(200).end();
        return;
      }
    }
    if (path === '/commands' && method === 'GET') {
      const names = url.searchParams.getAll('filter[name]');
      const all = [...this.commands.values()];
      const selected = names.length === 0 ? all : all.filter((c) => names.includes(c.name));
      const missing = names.find((name) => !all.some((c) => c.name === name));
      if (missing !== undefined) {
        this.fail(404, 'invalid_command_name', `Command ${missing} doesn't exist`);
      }
      this.json(res, 200, { data: selected });
      return;
    }
    if (path === '/commands/count' && method === 'GET') {
      this.json(res, 200, { data: this.commands.size });
      return;
    }
    const activateMatch = /^\/command\/(\d+)\/activate$/.exec(path);
    if (activateMatch !== null && method === 'POST') {
      const id = Number(activateMatch[1]);
      if (!this.commands.has(id)) {
        this.fail(404, 'invalid_command_id', `Command ${id} doesn't exist`);
      }
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        this.fail(400, 'invalid_body', 'The request body is not valid JSON');
      }
      if (!isRecord(parsed) || !('duration' in parsed)) {
        this.fail(400, 'duration_missing', 'Missing duration parameter');
      }
      const duration = parsed.duration;
      if (typeof duration !== 'number' || duration < 0 || duration > 10) {
        this.fail(400, 'duration_out_of_range', 'Duration is out of valid range.');
      }
      this.activations.push({ id, duration });
      this.applyCommand(id);
      res.writeHead(200).end();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
  }

  private readValue(dataRef: MockDataRef, index: number | undefined): DataRefValue {
    if (index === undefined) {
      return dataRef.value;
    }
    if (!Array.isArray(dataRef.value)) {
      this.fail(400, 'not_an_array', 'An index was provided but the dataref is not an array');
    }
    const item = dataRef.value[index];
    if (item === undefined) {
      this.fail(400, 'index_out_of_range', 'Dataref array index out of range');
    }
    return item;
  }

  private writeValue(dataRef: MockDataRef, value: DataRefValue, index: number | undefined): void {
    if (dataRef.writable !== true) {
      this.fail(403, 'dataref_is_readonly', 'Attempted to write to a read-only dataref');
    }
    if (index !== undefined) {
      if (!Array.isArray(dataRef.value)) {
        this.fail(400, 'not_an_array', 'An index was provided but the dataref is not an array');
      }
      if (typeof value !== 'number' || dataRef.value[index] === undefined) {
        this.fail(400, 'index_out_of_range', 'Dataref array index out of range');
      }
      dataRef.value = dataRef.value.map((item, i) => (i === index ? value : item));
      return;
    }
    if (Array.isArray(dataRef.value) !== Array.isArray(value)) {
      this.fail(400, 'incompatible_data', 'Provided data does not match the dataref shape');
    }
    dataRef.value = value;
  }

  private applyCommand(id: number): void {
    const command = this.commands.get(id);
    if (command?.name === 'sim/autopilot/heading_up') {
      const heading = this.getDataRefByName('sim/cockpit2/autopilot/heading_dial_deg_mag_pilot');
      if (heading !== undefined && typeof heading.value === 'number') {
        heading.value = (heading.value + 1) % 360;
      }
    }
  }

  private json(res: http.ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
  }

  private fail(status: number, error_code: string, error_message: string): never {
    const error: JsonError = { status, error_code, error_message };
    throw error;
  }

  // ---- WebSocket --------------------------------------------------------

  private handleUpgrade(
    req: http.IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (this.connector !== undefined && !this.tokenAccepted(url.searchParams.get('token'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const match = /^\/api\/(v\d)$/.exec(url.pathname);
    const version = match?.[1];
    if (
      this.incomingTrafficDisabled ||
      version === undefined ||
      !this.apiVersions.includes(version)
    ) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.attach(ws));
  }

  private attach(ws: WsSocket): void {
    this.sockets.add(ws);
    this.subscriptions.set(ws, new Map());
    ws.on('message', (raw) => this.handleMessage(ws, raw.toString()));
    ws.on('close', () => {
      this.sockets.delete(ws);
      this.subscriptions.delete(ws);
    });
  }

  private handleMessage(ws: WsSocket, text: string): void {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    this.receivedMessages.push(message);
    if (this.pauseReplies) {
      return;
    }
    if (
      !isRecord(message) ||
      typeof message.req_id !== 'number' ||
      typeof message.type !== 'string'
    ) {
      return;
    }
    const reqId = message.req_id;
    const params = isRecord(message.params) ? message.params : {};
    const reply = (payload: Record<string, unknown>): void => {
      ws.send(JSON.stringify({ req_id: reqId, type: 'result', ...payload }));
    };
    let subs = this.subscriptions.get(ws);
    if (subs === undefined) {
      subs = new Map<number, string>();
      this.subscriptions.set(ws, subs);
    }

    switch (message.type) {
      case 'dataref_subscribe_values': {
        const list = Array.isArray(params.datarefs) ? params.datarefs : [];
        for (const item of list) {
          const id = isRecord(item) && typeof item.id === 'number' ? item.id : Number.NaN;
          if (!this.dataRefs.has(id)) {
            reply({
              success: false,
              error_code: 'invalid_dataref_id',
              error_message: `Dataref ${id} doesn't exist`,
            });
            return;
          }
        }
        for (const item of list) {
          if (isRecord(item) && typeof item.id === 'number') {
            subs.set(item.id, '');
          }
        }
        reply({ success: true });
        return;
      }
      case 'dataref_unsubscribe_values': {
        if (params.datarefs === 'all') {
          subs.clear();
        } else if (Array.isArray(params.datarefs)) {
          for (const item of params.datarefs) {
            if (isRecord(item) && typeof item.id === 'number') {
              subs.delete(item.id);
            }
          }
        }
        reply({ success: true });
        return;
      }
      case 'dataref_set_values': {
        const list = Array.isArray(params.datarefs) ? params.datarefs : [];
        let failures = 0;
        for (const item of list) {
          if (!isRecord(item) || typeof item.id !== 'number') {
            failures += 1;
            reply({
              success: false,
              error_code: 'invalid_dataref_id',
              error_message: 'Dataref id is missing or not a number',
            });
            continue;
          }
          if (!isDataRefValue(item.value)) {
            failures += 1;
            reply({
              success: false,
              error_code: 'insufficient_data',
              error_message: `Provided data for dataref ${item.id} is not valid`,
            });
            continue;
          }
          const dataRef = this.dataRefs.get(item.id);
          if (dataRef === undefined) {
            failures += 1;
            reply({
              success: false,
              error_code: 'invalid_dataref_id',
              error_message: `Dataref ${item.id} doesn't exist`,
            });
            continue;
          }
          dataRef.value = item.value;
          this.writes.push({ id: item.id, value: item.value });
        }
        if (failures === 0) {
          reply({ success: true });
        }
        return;
      }
      case 'command_subscribe_is_active':
      case 'command_unsubscribe_is_active':
        reply({ success: true });
        return;
      case 'command_set_is_active': {
        const list = Array.isArray(params.commands) ? params.commands : [];
        for (const item of list) {
          if (isRecord(item) && typeof item.id === 'number') {
            if (!this.commands.has(item.id)) {
              reply({
                success: false,
                error_code: 'invalid_command_id',
                error_message: `Command ${item.id} doesn't exist`,
              });
              return;
            }
            if (item.is_active === true) {
              this.activations.push({
                id: item.id,
                duration: typeof item.duration === 'number' ? item.duration : -1,
              });
              this.applyCommand(item.id);
            }
          }
        }
        reply({ success: true });
        return;
      }
      default:
        reply({
          success: false,
          error_code: 'unknown_type',
          error_message: `Unknown type ${message.type}`,
        });
    }
  }

  private pushUpdates(): void {
    for (const [ws, subs] of this.subscriptions) {
      if (ws.readyState !== WsSocket.OPEN) {
        continue;
      }
      const data: Record<string, DataRefValue> = {};
      for (const [id, lastSent] of subs) {
        const dataRef = this.dataRefs.get(id);
        if (dataRef === undefined) {
          continue;
        }
        const serialized = JSON.stringify(dataRef.value);
        if (serialized !== lastSent) {
          data[String(id)] = dataRef.value;
          subs.set(id, serialized);
        }
      }
      if (Object.keys(data).length > 0) {
        ws.send(JSON.stringify({ type: 'dataref_update_values', data }));
      }
    }
  }
}
