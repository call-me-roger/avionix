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
  /** X-Plane 12.4.3 and newer report `is_writable`; set false to act like an older sim. */
  reportWritability?: boolean;
}

export const DEFAULT_MOCK_DATAREFS: MockDataRef[] = [
  { id: 1001, name: 'sim/time/total_running_time_sec', valueType: 'float', value: 12.5 },
  { id: 1008, name: 'sim/time/paused', valueType: 'float', value: 0 },
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
  { id: 1005, name: 'sim/aircraft/view/acf_tailnum', valueType: 'data', value: 'TjE3MlNQ' },
  { id: 1006, name: 'sim/aircraft/view/acf_ICAO', valueType: 'data', value: 'QzE3Mg==' },
  {
    id: 1007,
    name: 'sim/aircraft/view/acf_descrip',
    valueType: 'data',
    value: 'Q2Vzc25hIDE3MiBTUA==',
  },
  {
    id: 1009,
    name: 'sim/cockpit2/gauges/indicators/ground_speed_kt',
    valueType: 'float',
    value: 142.4,
  },
  {
    id: 1010,
    name: 'sim/cockpit2/gauges/indicators/true_airspeed_kts_pilot',
    valueType: 'float',
    value: 150.2,
  },
  {
    id: 1011,
    name: 'sim/cockpit2/gauges/indicators/ground_track_mag_pilot',
    valueType: 'float',
    value: 87.2,
  },
  {
    id: 1012,
    name: 'sim/cockpit2/gauges/indicators/wind_speed_kts',
    valueType: 'float',
    value: 12.4,
  },
  {
    id: 1013,
    name: 'sim/cockpit2/gauges/indicators/wind_heading_deg_mag',
    valueType: 'float',
    value: 270,
  },
  {
    id: 1014,
    name: 'sim/cockpit2/temperature/outside_air_temp_degc',
    valueType: 'float',
    value: -12.3,
  },
  { id: 1015, name: 'sim/cockpit2/gauges/indicators/TAT_pilot', valueType: 'float', value: -9 },
  { id: 1016, name: 'sim/flightmodel/weight/m_fuel_total', valueType: 'float', value: 1234.5 },
  { id: 1017, name: 'sim/time/zulu_time_sec', valueType: 'float', value: 50709 },
  { id: 1018, name: 'sim/time/local_time_sec', valueType: 'float', value: 32709 },
  { id: 1019, name: 'sim/time/is_in_replay', valueType: 'int', value: 0 },
  {
    id: 1020,
    name: 'sim/cockpit2/radios/indicators/gps_dme_distance_nm',
    valueType: 'float',
    value: 126.4,
  },
  {
    id: 1021,
    name: 'sim/cockpit2/radios/indicators/gps_dme_time_min',
    valueType: 'float',
    value: 53.2,
  },
  // "KSEA" NUL-padded, base64, as X-Plane sends a byte-array DataRef.
  {
    id: 1022,
    name: 'sim/cockpit2/radios/indicators/gps_nav_id',
    valueType: 'data',
    value: 'S1NFQQAAAAA=',
  },
  // A C172 in a gentle climbing right turn.
  { id: 1023, name: 'sim/cockpit2/gauges/indicators/mach_pilot', valueType: 'float', value: 0.18 },
  {
    id: 1024,
    name: 'sim/cockpit2/gauges/indicators/altitude_ft_pilot',
    valueType: 'float',
    value: 4520,
  },
  {
    id: 1025,
    name: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot',
    valueType: 'float',
    value: 500,
  },
  {
    id: 1026,
    name: 'sim/cockpit2/gauges/indicators/heading_AHARS_deg_mag_pilot',
    valueType: 'float',
    value: 270,
  },
  {
    id: 1027,
    name: 'sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot',
    valueType: 'float',
    value: 3,
  },
  {
    id: 1028,
    name: 'sim/cockpit2/gauges/indicators/roll_AHARS_deg_pilot',
    valueType: 'float',
    value: 15,
  },
  {
    id: 1029,
    name: 'sim/cockpit2/gauges/indicators/turn_rate_roll_deg_pilot',
    valueType: 'float',
    value: 20,
  },
  { id: 1030, name: 'sim/cockpit2/gauges/indicators/slip_deg', valueType: 'float', value: 0 },
  {
    id: 1031,
    name: 'sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot',
    valueType: 'float',
    value: 850,
  },
  {
    id: 1032,
    name: 'sim/aircraft/prop/acf_en_type',
    valueType: 'int_array',
    value: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  { id: 1033, name: 'sim/aircraft/view/acf_Vso', valueType: 'float', value: 40 },
  { id: 1034, name: 'sim/aircraft/view/acf_Vs', valueType: 'float', value: 48 },
  { id: 1035, name: 'sim/aircraft/view/acf_Vfe', valueType: 'float', value: 85 },
  { id: 1036, name: 'sim/aircraft/view/acf_Vno', valueType: 'float', value: 129 },
  { id: 1037, name: 'sim/aircraft/view/acf_Vne', valueType: 'float', value: 163 },
  {
    id: 1038,
    name: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
    valueType: 'float',
    value: 29.92,
    writable: true,
  },
  {
    id: 1039,
    name: 'sim/cockpit2/radios/actuators/com1_frequency_hz_833',
    valueType: 'int',
    value: 121_500,
    writable: true,
  },
  {
    id: 1040,
    name: 'sim/cockpit2/radios/actuators/com1_standby_frequency_hz_833',
    valueType: 'int',
    value: 118_005,
    writable: true,
  },
  {
    id: 1041,
    name: 'sim/cockpit2/radios/actuators/com2_frequency_hz_833',
    valueType: 'int',
    value: 118_000,
    writable: true,
  },
  {
    id: 1042,
    name: 'sim/cockpit2/radios/actuators/com2_standby_frequency_hz_833',
    valueType: 'int',
    value: 124_850,
    writable: true,
  },
  {
    id: 1043,
    name: 'sim/cockpit2/radios/actuators/nav1_frequency_hz',
    valueType: 'int',
    value: 11_030,
    writable: true,
  },
  {
    id: 1044,
    name: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_hz',
    valueType: 'int',
    value: 10_850,
    writable: true,
  },
  {
    id: 1045,
    name: 'sim/cockpit2/radios/actuators/nav2_frequency_hz',
    valueType: 'int',
    value: 11_390,
    writable: true,
  },
  {
    id: 1046,
    name: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_hz',
    valueType: 'int',
    value: 11_720,
    writable: true,
  },
  {
    id: 1047,
    name: 'sim/cockpit2/radios/actuators/nav1_course_deg_mag_pilot',
    valueType: 'float',
    value: 247,
    writable: true,
  },
  {
    id: 1048,
    name: 'sim/cockpit2/radios/actuators/nav2_course_deg_mag_pilot',
    valueType: 'float',
    value: 90,
    writable: true,
  },
  // "IBOS" and an empty identifier, NUL-padded and base64-encoded as X-Plane sends `data` values.
  {
    id: 1049,
    name: 'sim/cockpit2/radios/indicators/nav1_nav_id',
    valueType: 'data',
    value: 'SUJPUwAAAAA=',
  },
  {
    id: 1050,
    name: 'sim/cockpit2/radios/indicators/nav2_nav_id',
    valueType: 'data',
    value: 'AAAAAAAAAAA=',
  },
  { id: 1051, name: 'sim/cockpit2/radios/indicators/nav1_has_dme', valueType: 'int', value: 1 },
  { id: 1052, name: 'sim/cockpit2/radios/indicators/nav2_has_dme', valueType: 'int', value: 0 },
  {
    id: 1053,
    name: 'sim/cockpit2/radios/indicators/nav1_dme_distance_nm',
    valueType: 'float',
    value: 12.4,
  },
  {
    id: 1054,
    name: 'sim/cockpit2/radios/indicators/nav2_dme_distance_nm',
    valueType: 'float',
    value: 0,
  },
  {
    id: 1055,
    name: 'sim/cockpit2/radios/actuators/transponder_code',
    valueType: 'int',
    value: 1200,
    writable: true,
  },
  {
    id: 1056,
    name: 'sim/cockpit2/radios/actuators/transponder_mode',
    valueType: 'int',
    value: 1,
    writable: true,
  },
  { id: 1057, name: 'sim/cockpit2/radios/indicators/transponder_id', valueType: 'int', value: 0 },
  { id: 1058, name: 'sim/atc/transponder_assigned', valueType: 'int', value: 4521 },
  { id: 1059, name: 'sim/cockpit2/autopilot/servos_on', valueType: 'int', value: 0 },
  {
    id: 1060,
    name: 'sim/operation/override/override_autopilot',
    valueType: 'int',
    value: 0,
    writable: true,
  },
  { id: 1061, name: 'sim/cockpit2/autopilot/roll_status', valueType: 'int', value: 0 },
  { id: 1062, name: 'sim/cockpit2/autopilot/pitch_status', valueType: 'int', value: 0 },
  {
    id: 1063,
    name: 'sim/cockpit2/autopilot/flight_director_command_bars_pilot',
    valueType: 'int',
    value: 0,
    writable: true,
  },
  {
    id: 1064,
    name: 'sim/cockpit2/autopilot/autothrottle_enabled',
    valueType: 'int',
    value: 0,
    writable: true,
  },
  {
    id: 1065,
    name: 'sim/cockpit2/autopilot/altitude_dial_ft',
    valueType: 'float',
    value: 5000,
    writable: true,
  },
  {
    id: 1066,
    name: 'sim/cockpit2/autopilot/vvi_dial_fpm',
    valueType: 'float',
    value: 0,
    writable: true,
  },
  {
    id: 1067,
    name: 'sim/cockpit2/autopilot/airspeed_dial_kts_mach',
    valueType: 'float',
    value: 120,
    writable: true,
  },
  {
    id: 1068,
    name: 'sim/cockpit2/autopilot/airspeed_is_mach',
    valueType: 'int',
    value: 0,
    writable: true,
  },
  { id: 1069, name: 'sim/cockpit2/autopilot/heading_status', valueType: 'int', value: 0 },
  { id: 1070, name: 'sim/cockpit2/autopilot/nav_status', valueType: 'int', value: 0 },
  { id: 1071, name: 'sim/cockpit2/autopilot/approach_status', valueType: 'int', value: 0 },
  { id: 1072, name: 'sim/cockpit2/autopilot/glideslope_status', valueType: 'int', value: 0 },
  { id: 1073, name: 'sim/cockpit2/autopilot/altitude_hold_status', valueType: 'int', value: 0 },
  { id: 1074, name: 'sim/cockpit2/autopilot/vvi_status', valueType: 'int', value: 0 },
  { id: 1075, name: 'sim/cockpit2/autopilot/speed_status', valueType: 'int', value: 0 },
];

export const DEFAULT_MOCK_COMMANDS: MockCommand[] = [
  { id: 2001, name: 'sim/autopilot/heading_up', description: 'Autopilot heading up.' },
  { id: 2002, name: 'sim/operation/pause_toggle', description: 'Pause the simulation.' },
  { id: 2003, name: 'sim/radios/com1_standy_flip', description: 'COM 1 flip standby.' },
  { id: 2004, name: 'sim/radios/com2_standy_flip', description: 'COM 2 flip standby.' },
  { id: 2005, name: 'sim/radios/nav1_standy_flip', description: 'NAV 1 flip standby.' },
  { id: 2006, name: 'sim/radios/nav2_standy_flip', description: 'NAV 2 flip standby.' },
  { id: 2007, name: 'sim/transponder/transponder_ident', description: 'Transponder ID.' },
  { id: 2008, name: 'sim/autopilot/servos_on', description: 'Servos on.' },
  { id: 2009, name: 'sim/autopilot/servos_off_any', description: 'Disco servos, any side.' },
  { id: 2010, name: 'sim/autopilot/fdir_command_bars_on', description: 'FD bars on.' },
  { id: 2011, name: 'sim/autopilot/fdir_command_bars_off', description: 'FD bars off.' },
  { id: 2012, name: 'sim/autopilot/autothrottle_on', description: 'A/T speed on.' },
  { id: 2013, name: 'sim/autopilot/autothrottle_off', description: 'A/T off, armed.' },
  { id: 2014, name: 'sim/autopilot/autothrottle_arm', description: 'A/T arm.' },
  { id: 2015, name: 'sim/autopilot/autothrottle_hard_off', description: 'A/T off, disarmed.' },
  { id: 2016, name: 'sim/autopilot/knots_mach_toggle', description: 'Knots/Mach toggle.' },
  { id: 2017, name: 'sim/autopilot/heading', description: 'Heading select.' },
  { id: 2018, name: 'sim/autopilot/NAV', description: 'VOR/LOC arm.' },
  { id: 2019, name: 'sim/autopilot/approach', description: 'Approach.' },
  { id: 2020, name: 'sim/autopilot/altitude_hold', description: 'Altitude hold.' },
  { id: 2021, name: 'sim/autopilot/vertical_speed', description: 'Vertical speed.' },
  { id: 2022, name: 'sim/autopilot/level_change', description: 'Level change.' },
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
  /** When set, every DataRef write is refused with this X-Plane error code (HTTP 400). */
  rejectWritesWith: string | null = null;
  /** Tokens handed out by `/avionix/pair`, in issue order. */
  readonly issuedTokens: string[] = [];

  private readonly ignoredWrites = new Set<string>();

  private readonly apiVersions: string[];
  private readonly xplaneVersion: string;
  private readonly capabilitiesMode: 'ok' | 'not_found';
  private readonly connector: MockConnectorOptions | undefined;
  private readonly reportWritability: boolean;
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
    this.reportWritability = options.reportWritability ?? true;
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

  /** Every DataRef name some socket is subscribed to right now, sorted. */
  subscribedDataRefNames(): string[] {
    const names = new Set<string>();
    for (const subs of this.subscriptions.values()) {
      for (const id of subs.keys()) {
        const dataRef = this.dataRefs.get(id);
        if (dataRef !== undefined) {
          names.add(dataRef.name);
        }
      }
    }
    return [...names].sort();
  }

  setDataRefValue(name: string, value: DataRefValue): void {
    const dataRef = this.getDataRefByName(name);
    if (dataRef === undefined) {
      throw new Error(`mock dataref ${name} not defined`);
    }
    dataRef.value = value;
  }

  /** Simulates a name that this aircraft does not have. */
  removeDataRef(name: string): void {
    const dataRef = this.getDataRefByName(name);
    if (dataRef === undefined) {
      throw new Error(`mock dataref ${name} not defined`);
    }
    this.dataRefs.delete(dataRef.id);
    for (const subs of this.subscriptions.values()) {
      subs.delete(dataRef.id);
    }
  }

  addDataRef(dataRef: MockDataRef): void {
    this.dataRefs.set(dataRef.id, { ...dataRef });
  }

  /** Simulates an add-on that accepts a write to `name` and then ignores it (F-21 R4). */
  ignoreWritesTo(name: string): void {
    this.ignoredWrites.add(name);
  }

  /** Simulates a command this aircraft does not have. */
  removeCommand(name: string): void {
    this.commands.delete(this.commandIdByName(name));
  }

  commandIdByName(name: string): number {
    const command = [...this.commands.values()].find((candidate) => candidate.name === name);
    if (command === undefined) {
      throw new Error(`mock command ${name} not defined`);
    }
    return command.id;
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
        data: selected.map((d) => ({
          id: d.id,
          name: d.name,
          value_type: d.valueType,
          ...(this.reportWritability ? { is_writable: d.writable === true } : {}),
        })),
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
        if (this.rejectWritesWith !== null) {
          this.fail(400, this.rejectWritesWith, 'The dataref cannot be written');
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
    if (this.ignoredWrites.has(dataRef.name)) {
      return;
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
    const flip = /^sim\/radios\/(com|nav)([12])_standy_flip$/.exec(command?.name ?? '');
    if (flip !== null) {
      const [, kind, unit] = flip;
      const suffix = kind === 'com' ? '_833' : '';
      const active = this.getDataRefByName(
        `sim/cockpit2/radios/actuators/${kind}${unit}_frequency_hz${suffix}`,
      );
      const standby = this.getDataRefByName(
        `sim/cockpit2/radios/actuators/${kind}${unit}_standby_frequency_hz${suffix}`,
      );
      if (active !== undefined && standby !== undefined) {
        [active.value, standby.value] = [standby.value, active.value];
      }
    }
    if (command?.name === 'sim/transponder/transponder_ident') {
      const identing = this.getDataRefByName('sim/cockpit2/radios/indicators/transponder_id');
      if (identing !== undefined) {
        identing.value = 1;
      }
    }
    const set = (name: string, value: number) => {
      const dataRef = this.getDataRefByName(name);
      if (dataRef !== undefined) {
        dataRef.value = value;
      }
    };
    const read = (name: string): number => {
      const value = this.getDataRefByName(name)?.value;
      return typeof value === 'number' ? value : 0;
    };
    const AP = 'sim/cockpit2/autopilot/';
    // The mock's autopilot: idempotent pairs set their state; modes toggle, and the vertical
    // modes exclude each other as X-Plane's do.
    const vertical = [`${AP}altitude_hold_status`, `${AP}vvi_status`, `${AP}speed_status`];
    const toggle = (status: string, on: number) => {
      const next = read(status) === 0 ? on : 0;
      if (vertical.includes(status) && next !== 0) {
        vertical.forEach((other) => set(other, 0));
      }
      set(status, next);
    };
    switch (command?.name) {
      case 'sim/autopilot/servos_on':
        set(`${AP}servos_on`, 1);
        break;
      case 'sim/autopilot/servos_off_any':
        set(`${AP}servos_on`, 0);
        break;
      case 'sim/autopilot/fdir_command_bars_on':
        set(`${AP}flight_director_command_bars_pilot`, 1);
        break;
      case 'sim/autopilot/fdir_command_bars_off':
        set(`${AP}flight_director_command_bars_pilot`, 0);
        break;
      case 'sim/autopilot/autothrottle_on':
        set(`${AP}autothrottle_enabled`, 1);
        break;
      case 'sim/autopilot/autothrottle_off':
        set(`${AP}autothrottle_enabled`, 0);
        break;
      case 'sim/autopilot/autothrottle_arm':
        if (read(`${AP}autothrottle_enabled`) < 0) {
          set(`${AP}autothrottle_enabled`, 0);
        }
        break;
      case 'sim/autopilot/autothrottle_hard_off':
        set(`${AP}autothrottle_enabled`, -1);
        break;
      case 'sim/autopilot/knots_mach_toggle': {
        const isMach = read(`${AP}airspeed_is_mach`) === 1;
        const speed = read(`${AP}airspeed_dial_kts_mach`);
        // A rough conversion is enough for a mock: X-Plane converts at the current altitude.
        set(
          `${AP}airspeed_dial_kts_mach`,
          isMach ? Math.round(speed * 600) : Math.round((speed / 600) * 100) / 100,
        );
        set(`${AP}airspeed_is_mach`, isMach ? 0 : 1);
        break;
      }
      case 'sim/autopilot/heading':
        toggle(`${AP}heading_status`, 2);
        break;
      case 'sim/autopilot/NAV':
        toggle(`${AP}nav_status`, 1);
        break;
      case 'sim/autopilot/approach':
        toggle(`${AP}approach_status`, 1);
        break;
      case 'sim/autopilot/altitude_hold':
        toggle(`${AP}altitude_hold_status`, 2);
        break;
      case 'sim/autopilot/vertical_speed':
        toggle(`${AP}vvi_status`, 2);
        break;
      case 'sim/autopilot/level_change':
        toggle(`${AP}speed_status`, 2);
        break;
      default:
        break;
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
