import { MICS, MONITORS, TRANSMIT } from '@/domain/audio/catalogue';
import { GAUGES } from '@/domain/engines/catalogue';
import {
  BATTERY,
  DIMMERS,
  ENGINES,
  EXTERIOR_LIGHTS,
  FLAPS,
  FUEL_SELECTOR,
  GEAR,
  TAKEOFF_TRIM,
  TRIMS,
  generatorSwitch,
  magnetoPositions,
  starterCommand,
} from '@/domain/systems/controls';
import {
  DEFAULT_MOCK_COMMANDS,
  DEFAULT_MOCK_DATAREFS,
  MockXPlaneServer,
} from '../mock-xplane/mock-xplane-server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type MessageReader = (predicate: (msg: unknown) => boolean, timeoutMs?: number) => Promise<unknown>;

/**
 * Buffers every parsed frame as soon as it arrives and lets waiters scan that buffer first,
 * consuming each entry at most once, before parking a predicate. This avoids a race where a
 * `message` event fires synchronously (Node can dispatch several frames from one TCP read
 * back-to-back) before the next `waitForMessage`-style listener has been attached, which would
 * otherwise drop the frame and hang the waiting promise forever.
 */
function createMessageReader(socket: WebSocket): MessageReader {
  const buffer: unknown[] = [];
  const waiters: { predicate: (m: unknown) => boolean; resolve: (m: unknown) => void }[] = [];
  socket.addEventListener('message', (event: MessageEvent) => {
    const parsed: unknown = JSON.parse(String(event.data));
    const index = waiters.findIndex((w) => w.predicate(parsed));
    if (index >= 0) {
      const [w] = waiters.splice(index, 1);
      w?.resolve(parsed);
      return;
    }
    buffer.push(parsed);
  });
  return function next(predicate: (m: unknown) => boolean, timeoutMs = 2000): Promise<unknown> {
    const i = buffer.findIndex(predicate);
    if (i >= 0) {
      const [m] = buffer.splice(i, 1);
      return Promise.resolve(m);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const k = waiters.findIndex((w) => w.resolve === wrapped);
        if (k >= 0) {
          waiters.splice(k, 1);
        }
        reject(new Error('never received a matching message'));
      }, timeoutMs);
      const wrapped = (m: unknown): void => {
        clearTimeout(timer);
        resolve(m);
      };
      waiters.push({ predicate, resolve: wrapped });
    });
  };
}

function openSocket(url: string): Promise<{ socket: WebSocket; next: MessageReader }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      // Attached before resolving `open`, so no frame the server sends immediately after
      // connecting can be dispatched before a reader exists to buffer it.
      const next = createMessageReader(socket);
      resolve({ socket, next });
    });
    socket.addEventListener('error', () => reject(new Error('socket error')));
  });
}

describe('MockXPlaneServer', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('serves capabilities, datarefs, values and commands over REST', async () => {
    const base = `http://${server.host}:${server.port}`;
    const caps = await (await fetch(`${base}/api/capabilities`)).json();
    expect(caps).toEqual({
      api: { versions: ['v1', 'v2', 'v3'] },
      'x-plane': { version: '12.4.0' },
    });

    const list = await (
      await fetch(`${base}/api/v3/datarefs?filter[name]=sim/time/total_running_time_sec`)
    ).json();
    expect(list).toEqual({
      data: [
        {
          id: 1001,
          name: 'sim/time/total_running_time_sec',
          value_type: 'float',
          // The mock emulates X-Plane 12.4.3 and newer, which reports is_writable.
          is_writable: false,
        },
      ],
    });

    const missing = await fetch(`${base}/api/v3/datarefs?filter[name]=sim/nope`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error_code: 'invalid_dataref_name' });

    const value = await (await fetch(`${base}/api/v3/datarefs/1003/value`)).json();
    expect(value).toEqual({ data: 270 });

    const patch = await fetch(`${base}/api/v3/datarefs/1003/value`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 90 }),
    });
    expect(patch.status).toBe(200);
    expect(server.writes).toEqual([{ id: 1003, value: 90 }]);

    const readonly = await fetch(`${base}/api/v3/datarefs/1001/value`, {
      method: 'PATCH',
      body: JSON.stringify({ data: 1 }),
    });
    expect(readonly.status).toBe(403);
    expect(await readonly.json()).toMatchObject({ error_code: 'dataref_is_readonly' });

    const activate = await fetch(`${base}/api/v3/command/2001/activate`, {
      method: 'POST',
      body: JSON.stringify({ duration: 0 }),
    });
    expect(activate.status).toBe(200);
    expect(server.activations).toEqual([{ id: 2001, duration: 0 }]);
    expect(
      server.getDataRefByName('sim/cockpit2/autopilot/heading_dial_deg_mag_pilot')?.value,
    ).toBe(91);
  });

  it('returns a plain 403 everywhere when incoming traffic is disabled', async () => {
    server.incomingTrafficDisabled = true;
    const response = await fetch(`http://${server.host}:${server.port}/api/capabilities`);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
  });

  it('streams subscribed values with delta semantics over WebSocket', async () => {
    const { socket, next } = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
    const result = next((m) => (m as { type?: string }).type === 'result');
    socket.send(
      JSON.stringify({
        req_id: 1,
        type: 'dataref_subscribe_values',
        params: { datarefs: [{ id: 1001 }, { id: 1003 }] },
      }),
    );
    expect(await result).toEqual({ req_id: 1, type: 'result', success: true });

    const first = await next((m) => (m as { type?: string }).type === 'dataref_update_values');
    expect(first).toEqual({ type: 'dataref_update_values', data: { '1001': 12.5, '1003': 270 } });

    server.setDataRefValue('sim/time/total_running_time_sec', 13);
    const second = await next((m) => (m as { type?: string }).type === 'dataref_update_values');
    expect(second).toEqual({ type: 'dataref_update_values', data: { '1001': 13 } });

    const unknown = next((m) => (m as { req_id?: number }).req_id === 2);
    socket.send(JSON.stringify({ req_id: 2, type: 'bogus', params: {} }));
    expect(await unknown).toMatchObject({ success: false, error_code: 'unknown_type' });

    socket.close();
  });

  it('reports each malformed dataref_set_values item as its own failure', async () => {
    const { socket, next } = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
    const isReq3 = (m: unknown): boolean => isRecord(m) && m.req_id === 3;

    const invalidId = next(
      (m) => isReq3(m) && (m as { error_code?: string }).error_code === 'invalid_dataref_id',
    );
    const insufficientData = next(
      (m) => isReq3(m) && (m as { error_code?: string }).error_code === 'insufficient_data',
    );

    socket.send(
      JSON.stringify({
        req_id: 3,
        type: 'dataref_set_values',
        params: {
          datarefs: [{ id: 1003, value: 45 }, { value: 1 }, { id: 1001, value: null }],
        },
      }),
    );

    const [first, second] = await Promise.all([invalidId, insufficientData]);
    expect(first).toMatchObject({ req_id: 3, success: false, error_code: 'invalid_dataref_id' });
    expect(second).toMatchObject({ req_id: 3, success: false, error_code: 'insufficient_data' });

    await expect(
      next((m) => isReq3(m) && (m as { success?: boolean }).success === true, 50),
    ).rejects.toThrow('never received a matching message');

    expect(server.writes).toContainEqual({ id: 1003, value: 45 });

    socket.close();
  });

  it('serves connector info, pairs with the code and guards /api and the upgrade', async () => {
    const connectorServer = await MockXPlaneServer.start({
      connector: { name: 'Sim PC', pairingRequired: true, code: '123456' },
    });
    const base = `http://${connectorServer.host}:${connectorServer.port}`;
    try {
      const info = await fetch(`${base}/avionix/info`);
      expect(info.status).toBe(200);
      expect(await info.json()).toEqual({
        name: 'Sim PC',
        version: '1.0.0-mock',
        pairingRequired: true,
        xplane: { host: connectorServer.host, port: connectorServer.port, reachable: true },
      });

      expect((await fetch(`${base}/api/capabilities`)).status).toBe(401);

      const wrong = await fetch(`${base}/avionix/pair`, {
        method: 'POST',
        body: JSON.stringify({ code: '000000' }),
      });
      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toMatchObject({ error_code: 'pairing_invalid_code' });

      const paired = await fetch(`${base}/avionix/pair`, {
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
      });
      expect(paired.status).toBe(200);
      const body: unknown = await paired.json();
      const token = isRecord(body) && typeof body.token === 'string' ? body.token : '';
      expect(token).toBe('mock-token-1');
      expect(connectorServer.issuedTokens).toEqual(['mock-token-1']);

      const allowed = await fetch(`${base}/api/capabilities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(allowed.status).toBe(200);

      connectorServer.setRejectAllTokens(true);
      const revoked = await fetch(`${base}/api/capabilities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(revoked.status).toBe(401);
      expect(await revoked.json()).toMatchObject({ error_code: 'unauthorized' });
    } finally {
      await connectorServer.stop();
    }
  });

  it('refuses a WebSocket upgrade without a token and accepts one with it', async () => {
    const connectorServer = await MockXPlaneServer.start({
      connector: { name: 'Sim PC', pairingRequired: true, code: '123456' },
    });
    const base = `http://${connectorServer.host}:${connectorServer.port}`;
    try {
      const paired = await fetch(`${base}/avionix/pair`, {
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
      });
      const body: unknown = await paired.json();
      const token = isRecord(body) && typeof body.token === 'string' ? body.token : '';

      const denied = new WebSocket(`ws://${connectorServer.host}:${connectorServer.port}/api/v3`);
      await new Promise<void>((resolve) => {
        denied.addEventListener('close', () => resolve());
        denied.addEventListener('error', () => resolve());
      });
      expect(connectorServer.connectionCount).toBe(0);

      const opened = new WebSocket(
        `ws://${connectorServer.host}:${connectorServer.port}/api/v3?token=${token}`,
      );
      await new Promise<void>((resolve, reject) => {
        opened.addEventListener('open', () => resolve());
        opened.addEventListener('error', () => reject(new Error('upgrade was refused')));
      });
      expect(connectorServer.connectionCount).toBe(1);
      opened.close();
    } finally {
      await connectorServer.stop();
    }
  });

  it('answers /avionix/info with 404 when no connector option is given', async () => {
    const plain = await MockXPlaneServer.start();
    try {
      expect((await fetch(`http://${plain.host}:${plain.port}/avionix/info`)).status).toBe(404);
    } finally {
      await plain.stop();
    }
  });
});

async function activate(server: MockXPlaneServer, id: number): Promise<void> {
  await fetch(`http://${server.host}:${server.port}/api/v3/command/${id}/activate`, {
    method: 'POST',
    body: JSON.stringify({ duration: 0 }),
  });
}

async function writeValue(server: MockXPlaneServer, name: string, value: number): Promise<void> {
  const id = server.getDataRefByName(name)?.id;
  await fetch(`http://${server.host}:${server.port}/api/v3/datarefs/${id}/value`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: value }),
  });
}

describe('command holds in the mock', () => {
  it('tracks a leased hold until it lapses, an open hold until released or the socket closes, and still activates a zero-duration press', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const { socket, next } = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
      const leased = server.commandIdByName('sim/autopilot/heading_up');
      const open = server.commandIdByName('sim/radios/com1_standy_flip');

      // A zero-duration press still activates, exactly as before F-24.
      const press = next((m) => isRecord(m) && m.req_id === 1);
      socket.send(
        JSON.stringify({
          req_id: 1,
          type: 'command_set_is_active',
          params: { commands: [{ id: leased, is_active: true, duration: 0 }] },
        }),
      );
      await press;
      expect(server.activations).toEqual([{ id: leased, duration: 0 }]);
      expect(server.heldCommandNames()).toEqual([]);

      // A leased hold shows at once and lapses on its own after the lease.
      const leasedResult = next((m) => isRecord(m) && m.req_id === 2);
      socket.send(
        JSON.stringify({
          req_id: 2,
          type: 'command_set_is_active',
          params: { commands: [{ id: leased, is_active: true, duration: 0.2 }] },
        }),
      );
      await leasedResult;
      expect(server.heldCommandNames()).toEqual(['sim/autopilot/heading_up']);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(server.heldCommandNames()).toEqual([]);

      // An open hold (no duration) stays held until explicitly released.
      const openResult = next((m) => isRecord(m) && m.req_id === 3);
      socket.send(
        JSON.stringify({
          req_id: 3,
          type: 'command_set_is_active',
          params: { commands: [{ id: open, is_active: true }] },
        }),
      );
      await openResult;
      expect(server.heldCommandNames()).toEqual(['sim/radios/com1_standy_flip']);
      const releaseResult = next((m) => isRecord(m) && m.req_id === 4);
      socket.send(
        JSON.stringify({
          req_id: 4,
          type: 'command_set_is_active',
          params: { commands: [{ id: open, is_active: false }] },
        }),
      );
      await releaseResult;
      expect(server.heldCommandNames()).toEqual([]);

      // An open hold is also cleared when the socket that pressed it closes.
      const reopenResult = next((m) => isRecord(m) && m.req_id === 5);
      socket.send(
        JSON.stringify({
          req_id: 5,
          type: 'command_set_is_active',
          params: { commands: [{ id: open, is_active: true }] },
        }),
      );
      await reopenResult;
      expect(server.heldCommandNames()).toEqual(['sim/radios/com1_standy_flip']);
      socket.close();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.heldCommandNames()).toEqual([]);
      expect(server.holdMessages).toEqual([
        { id: leased, isActive: true, duration: 0.2 },
        { id: open, isActive: true, duration: null },
        { id: open, isActive: false, duration: null },
        { id: open, isActive: true, duration: null },
      ]);
    } finally {
      await server.stop();
    }
  });
});

describe('radios and transponder in the mock', () => {
  it('swaps a radio’s active and standby on its flip command', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const flip = server.commandIdByName('sim/radios/com1_standy_flip');
      await activate(server, flip);
      expect(
        server.getDataRefByName('sim/cockpit2/radios/actuators/com1_frequency_hz_833')?.value,
      ).toBe(118_005);
      expect(
        server.getDataRefByName('sim/cockpit2/radios/actuators/com1_standby_frequency_hz_833')
          ?.value,
      ).toBe(121_500);
    } finally {
      await server.stop();
    }
  });

  it('idents on the IDENT command', async () => {
    const server = await MockXPlaneServer.start();
    try {
      await activate(server, server.commandIdByName('sim/transponder/transponder_ident'));
      expect(server.getDataRefByName('sim/cockpit2/radios/indicators/transponder_id')?.value).toBe(
        1,
      );
    } finally {
      await server.stop();
    }
  });

  it('accepts and ignores a write to a name it was told to ignore', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const name = 'sim/cockpit2/radios/actuators/transponder_code';
      server.ignoreWritesTo(name);
      await writeValue(server, name, 4521);
      expect(server.getDataRefByName(name)?.value).toBe(1200);
      expect(server.writes.length).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it('forgets a removed command', async () => {
    const server = await MockXPlaneServer.start();
    server.removeCommand('sim/radios/nav2_standy_flip');
    expect(() => server.commandIdByName('sim/radios/nav2_standy_flip')).toThrow();
    await server.stop();
  });
});

describe('F-30 navigation in the mock', () => {
  it('wraps a written HSI course into [0, 360)', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const name = 'sim/cockpit2/radios/actuators/hsi_obs_deg_mag_pilot';
      await writeValue(server, name, 370);
      expect(server.getDataRefByName(name)?.value).toBe(10);
      await writeValue(server, name, -10);
      expect(server.getDataRefByName(name)?.value).toBe(350);
      await writeValue(server, name, 360);
      expect(server.getDataRefByName(name)?.value).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it('clamps a written HSI source to 0–3', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const name = 'sim/cockpit2/radios/actuators/HSI_source_select_pilot';
      await writeValue(server, name, 7);
      expect(server.getDataRefByName(name)?.value).toBe(3);
      await writeValue(server, name, -2);
      expect(server.getDataRefByName(name)?.value).toBe(0);
      await writeValue(server, name, 2);
      expect(server.getDataRefByName(name)?.value).toBe(2);
    } finally {
      await server.stop();
    }
  });

  it('sets the course to NAV1 bearing and clears hdef on the direct-to command', async () => {
    const server = await MockXPlaneServer.start();
    try {
      server.setDataRefValue('sim/cockpit2/radios/indicators/nav1_bearing_deg_mag', 123.7);
      server.setDataRefValue('sim/cockpit2/radios/indicators/hsi_hdef_dots_pilot', 1.5);
      await activate(server, server.commandIdByName('sim/radios/obs_HSI_direct'));
      expect(
        server.getDataRefByName('sim/cockpit2/radios/actuators/hsi_obs_deg_mag_pilot')?.value,
      ).toBe(124);
      expect(
        server.getDataRefByName('sim/cockpit2/radios/indicators/hsi_hdef_dots_pilot')?.value,
      ).toBe(0);
    } finally {
      await server.stop();
    }
  });
});

/** Decodes a CDU text line as X-Plane sends it: base64 → UTF-8, trailing NULs stripped. */
function cduLineText(server: MockXPlaneServer, name: string): string {
  const value = server.getDataRefByName(name)?.value;
  return typeof value === 'string'
    ? Buffer.from(value, 'base64').toString('utf8').replace(/\0+$/, '')
    : '';
}

describe('F-32 toy FMS CDU in the mock', () => {
  it('types into the scratchpad, LSK 1L moves it to the origin and lights EXEC, EXEC clears it', async () => {
    const server = await MockXPlaneServer.start();
    try {
      await activate(server, server.commandIdByName('sim/FMS/key_K'));
      await activate(server, server.commandIdByName('sim/FMS/key_L'));
      await activate(server, server.commandIdByName('sim/FMS/key_A'));
      await activate(server, server.commandIdByName('sim/FMS/key_X'));
      expect(cduLineText(server, 'sim/cockpit2/radios/indicators/fms_cdu1_text_line13')).toBe(
        'KLAX',
      );

      await activate(server, server.commandIdByName('sim/FMS/ls_1l'));
      expect(cduLineText(server, 'sim/cockpit2/radios/indicators/fms_cdu1_text_line2')).toBe(
        'KLAX',
      );
      expect(cduLineText(server, 'sim/cockpit2/radios/indicators/fms_cdu1_text_line13')).toBe('');
      expect(
        server.getDataRefByName('sim/cockpit2/radios/indicators/fms_exec_light_pilot')?.value,
      ).toBe(1);

      await activate(server, server.commandIdByName('sim/FMS/exec'));
      expect(
        server.getDataRefByName('sim/cockpit2/radios/indicators/fms_exec_light_pilot')?.value,
      ).toBe(0);

      await activate(server, server.commandIdByName('sim/FMS2/key_A'));
      expect(cduLineText(server, 'sim/cockpit2/radios/indicators/fms_cdu2_text_line13')).toBe('A');
      expect(cduLineText(server, 'sim/cockpit2/radios/indicators/fms_cdu1_text_line13')).toBe('');
    } finally {
      await server.stop();
    }
  });
});

function arrayValue(server: MockXPlaneServer, name: string): number[] {
  const value = server.getDataRefByName(name)?.value;
  return Array.isArray(value) ? value : [];
}

describe('F-24 systems in the toy aircraft', () => {
  it('registers the systems names at the ids after the CDU (35 DataRefs from 1161, 83 commands from 2164)', () => {
    const refs = DEFAULT_MOCK_DATAREFS.filter((ref) => ref.id >= 1161 && ref.id < 1300);
    expect(refs).toHaveLength(35);
    expect(Math.min(...refs.map((ref) => ref.id))).toBe(1161);

    const commands = DEFAULT_MOCK_COMMANDS.filter(
      (command) => command.id >= 2164 && command.id < 2300,
    );
    expect(commands).toHaveLength(83);
    expect(Math.min(...commands.map((command) => command.id))).toBe(2164);
  });

  it('marks every systems DataRef writable except starter_hit', () => {
    for (const ref of DEFAULT_MOCK_DATAREFS) {
      if (ref.id < 1161 || ref.id >= 1300) {
        continue;
      }
      if (ref.name === ENGINES.starter) {
        expect(ref.writable).not.toBe(true);
      } else {
        expect(ref.writable).toBe(true);
      }
    }
  });

  it('sets a scalar and an array switch state from its on/off command', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const beacon = EXTERIOR_LIGHTS[0]!;
      await activate(server, server.commandIdByName(beacon.on));
      expect(server.getDataRefByName(beacon.state)?.value).toBe(1);
      await activate(server, server.commandIdByName(beacon.off));
      expect(server.getDataRefByName(beacon.state)?.value).toBe(0);

      await activate(server, server.commandIdByName(BATTERY.off));
      expect(arrayValue(server, BATTERY.state)[0]).toBe(0);
      await activate(server, server.commandIdByName(BATTERY.on));
      expect(arrayValue(server, BATTERY.state)[0]).toBe(1);

      const generator2 = generatorSwitch(2);
      await activate(server, server.commandIdByName(generator2.off));
      expect(arrayValue(server, generator2.state)).toEqual([1, 0, 1, 1, 0, 0, 0, 0]);
    } finally {
      await server.stop();
    }
  });

  it('steps a dimmer up and down, clamped to 0..1', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const panel = DIMMERS[0]!;
      await activate(server, server.commandIdByName(panel.down));
      expect(arrayValue(server, panel.state)[0]).toBeCloseTo(0.7, 5);

      server.setDataRefValue(panel.state, [0, 0, 0, 0]);
      await activate(server, server.commandIdByName(panel.down));
      expect(arrayValue(server, panel.state)[0]).toBe(0);

      server.setDataRefValue(panel.state, [1, 0, 0, 0]);
      await activate(server, server.commandIdByName(panel.up));
      expect(arrayValue(server, panel.state)[0]).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it('moves the gear handle at once, and refuses GEAR UP while onGround is true', async () => {
    const server = await MockXPlaneServer.start();
    try {
      await activate(server, server.commandIdByName(GEAR.up));
      expect(server.getDataRefByName(GEAR.handle)?.value).toBe(0);
      await activate(server, server.commandIdByName(GEAR.down));
      expect(server.getDataRefByName(GEAR.handle)?.value).toBe(1);

      server.onGround = true;
      await activate(server, server.commandIdByName(GEAR.up));
      expect(server.getDataRefByName(GEAR.handle)?.value).toBe(1);

      server.onGround = false;
      await activate(server, server.commandIdByName(GEAR.up));
      expect(server.getDataRefByName(GEAR.handle)?.value).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it('moves the flap handle by one detent, clamped at the ends', async () => {
    const server = await MockXPlaneServer.start();
    try {
      await activate(server, server.commandIdByName(FLAPS.down));
      expect(server.getDataRefByName(FLAPS.handle)?.value).toBeCloseTo(0.25, 5);
      await activate(server, server.commandIdByName(FLAPS.up));
      expect(server.getDataRefByName(FLAPS.handle)?.value).toBeCloseTo(0, 5);
      await activate(server, server.commandIdByName(FLAPS.up));
      expect(server.getDataRefByName(FLAPS.handle)?.value).toBe(0);

      server.setDataRefValue(FLAPS.handle, 1);
      await activate(server, server.commandIdByName(FLAPS.down));
      expect(server.getDataRefByName(FLAPS.handle)?.value).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it('sets the fuel selector and a magneto position', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const left = FUEL_SELECTOR.positions.find((position) => position.key === 'left')!;
      await activate(server, server.commandIdByName(left.command));
      expect(server.getDataRefByName(FUEL_SELECTOR.state)?.value).toBe(left.value);

      const leftMagneto = magnetoPositions(1).find((position) => position.key === 'left')!;
      await activate(server, server.commandIdByName(leftMagneto.command));
      expect(arrayValue(server, ENGINES.key)[0]).toBe(leftMagneto.value);
    } finally {
      await server.stop();
    }
  });

  it('sets takeoff trim and centres roll and yaw trim', async () => {
    const server = await MockXPlaneServer.start();
    try {
      server.setDataRefValue(TAKEOFF_TRIM, 0.3);
      await activate(server, server.commandIdByName(TRIMS[0]!.set.command));
      expect(server.getDataRefByName(TRIMS[0]!.position)?.value).toBe(0.3);

      server.setDataRefValue(TRIMS[1]!.position, 0.5);
      await activate(server, server.commandIdByName(TRIMS[1]!.set.command));
      expect(server.getDataRefByName(TRIMS[1]!.position)?.value).toBe(0);

      server.setDataRefValue(TRIMS[2]!.position, -0.4);
      await activate(server, server.commandIdByName(TRIMS[2]!.set.command));
      expect(server.getDataRefByName(TRIMS[2]!.position)?.value).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it('tick() moves gear deployment and flap position toward their handles over time', async () => {
    const server = await MockXPlaneServer.start();
    try {
      server.setDataRefValue(GEAR.deployment, [0.1, 0.1, 0.1, 0.4, 0, 0, 0, 0, 0, 0]);
      await activate(server, server.commandIdByName(GEAR.up));
      await new Promise((resolve) => setTimeout(resolve, 400));
      const deployment = arrayValue(server, GEAR.deployment);
      expect(deployment[0]).toBe(0);
      expect(deployment[1]).toBe(0);
      expect(deployment[2]).toBe(0);
      expect(deployment[3]).toBe(0.4); // entries past 2 are untouched

      server.setDataRefValue(FLAPS.handle, 0.1);
      server.setDataRefValue(FLAPS.position, 0);
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(server.getDataRefByName(FLAPS.position)?.value).toBeCloseTo(0.1, 5);
    } finally {
      await server.stop();
    }
  });

  it('moves a held trim command over time and stops when released', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const { socket, next } = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
      const id = server.commandIdByName(TRIMS[0]!.increase.command);
      const pressed = next((m) => isRecord(m) && m.req_id === 1);
      socket.send(
        JSON.stringify({
          req_id: 1,
          type: 'command_set_is_active',
          params: { commands: [{ id, is_active: true, duration: 0.5 }] },
        }),
      );
      await pressed;
      await new Promise((resolve) => setTimeout(resolve, 300));
      const moved = server.getDataRefByName(TRIMS[0]!.position)?.value as number;
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(0.2);

      const released = next((m) => isRecord(m) && m.req_id === 2);
      socket.send(
        JSON.stringify({
          req_id: 2,
          type: 'command_set_is_active',
          params: { commands: [{ id, is_active: false }] },
        }),
      );
      await released;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const after = server.getDataRefByName(TRIMS[0]!.position)?.value as number;
      expect(Math.abs(after - moved)).toBeLessThan(0.03);
      socket.close();
    } finally {
      await server.stop();
    }
  });

  it('cranks a held starter and starts the engine after 2 s, reverting on release', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const { socket, next } = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
      const id = server.commandIdByName(starterCommand(1));
      let reqId = 1;
      const send = async (isActive: boolean): Promise<void> => {
        const thisReq = reqId;
        reqId += 1;
        const reply = next((m) => isRecord(m) && m.req_id === thisReq);
        socket.send(
          JSON.stringify({
            req_id: thisReq,
            type: 'command_set_is_active',
            params: { commands: [{ id, is_active: isActive, duration: 0.5 }] },
          }),
        );
        await reply;
      };

      await send(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(arrayValue(server, ENGINES.key)[0]).toBe(4);
      expect(arrayValue(server, ENGINES.starter)[0]).toBe(1);
      expect(arrayValue(server, ENGINES.running)[0]).toBe(0);

      for (let elapsed = 100; elapsed < 2300; elapsed += 200) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await send(true);
      }
      expect(arrayValue(server, ENGINES.running)[0]).toBe(1);

      const release = next((m) => isRecord(m) && m.req_id === reqId);
      socket.send(
        JSON.stringify({
          req_id: reqId,
          type: 'command_set_is_active',
          params: { commands: [{ id, is_active: false }] },
        }),
      );
      await release;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(arrayValue(server, ENGINES.starter)[0]).toBe(0);
      expect(arrayValue(server, ENGINES.key)[0]).toBe(3);
      socket.close();
    } finally {
      await server.stop();
    }
  }, 10_000);

  it('cranks but never starts an engine with the magnetos off, and restores the key', async () => {
    const server = await MockXPlaneServer.start();
    try {
      server.setDataRefValue(ENGINES.key, new Array<number>(16).fill(0));
      const { socket, next } = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
      const id = server.commandIdByName(starterCommand(1));
      let reqId = 1;
      const send = async (isActive: boolean): Promise<void> => {
        const thisReq = reqId;
        reqId += 1;
        const reply = next((m) => isRecord(m) && m.req_id === thisReq);
        socket.send(
          JSON.stringify({
            req_id: thisReq,
            type: 'command_set_is_active',
            params: {
              commands: [
                isActive ? { id, is_active: true, duration: 0.5 } : { id, is_active: false },
              ],
            },
          }),
        );
        await reply;
      };

      await send(true);
      for (let elapsed = 0; elapsed < 2500; elapsed += 200) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await send(true);
      }
      expect(arrayValue(server, ENGINES.key)[0]).toBe(4);
      expect(arrayValue(server, ENGINES.starter)[0]).toBe(1);
      expect(arrayValue(server, ENGINES.running)[0]).toBe(0);

      await send(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(arrayValue(server, ENGINES.starter)[0]).toBe(0);
      expect(arrayValue(server, ENGINES.key)[0]).toBe(0);
      expect(arrayValue(server, ENGINES.running)[0]).toBe(0);
      socket.close();
    } finally {
      await server.stop();
    }
  }, 10_000);

  it('does nothing for an ignored command, press or hold, while still recording it', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const beacon = EXTERIOR_LIGHTS[0]!;
      server.ignoreCommand(beacon.on);
      const beaconId = server.commandIdByName(beacon.on);
      await activate(server, beaconId);
      expect(server.getDataRefByName(beacon.state)?.value).toBe(0);
      expect(server.activations).toEqual([{ id: beaconId, duration: 0 }]);

      const trimUp = TRIMS[0]!.increase.command;
      server.ignoreCommand(trimUp);
      const { socket, next } = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
      const id = server.commandIdByName(trimUp);
      const pressed = next((m) => isRecord(m) && m.req_id === 1);
      socket.send(
        JSON.stringify({
          req_id: 1,
          type: 'command_set_is_active',
          params: { commands: [{ id, is_active: true, duration: 0.5 }] },
        }),
      );
      await pressed;
      expect(server.heldCommandNames()).toEqual([trimUp]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(server.getDataRefByName(TRIMS[0]!.position)?.value).toBe(0);
      socket.close();
    } finally {
      await server.stop();
    }
  });
});

describe('F-12 engines in the toy aircraft', () => {
  it('registers the engines names at the ids from 1300, well clear of the systems range', () => {
    const refs = DEFAULT_MOCK_DATAREFS.filter((ref) => ref.id >= 1300 && ref.id < 1500);
    expect(refs).toHaveLength(91);
    expect(Math.min(...refs.map((ref) => ref.id))).toBe(1300);
  });

  it('keeps an indicator set from outside until that engine starts or stops', async () => {
    const server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    const ticks = (count: number) => new Promise((resolve) => setTimeout(resolve, 10 * count + 20));
    try {
      const egt = GAUGES.egt.name;
      const set = [1500, ...arrayValue(server, egt).slice(1)];
      server.setDataRefValue(egt, set);
      await ticks(2);
      expect(arrayValue(server, egt)).toEqual(set);

      server.setDataRefValue(ENGINES.running, [1, ...new Array<number>(15).fill(0)]);
      await ticks(2);
      expect(arrayValue(server, egt)[0]).not.toBe(1500);
      expect(arrayValue(server, egt)[0]).toBeGreaterThan(0);
      expect(arrayValue(server, egt)[1]).toBe(set[1]);
    } finally {
      await server.stop();
    }
  });
});

describe('F-23 audio in the toy aircraft', () => {
  it('registers the audio names at the ids from 1500, well clear of the engines range', () => {
    const refs = DEFAULT_MOCK_DATAREFS.filter((ref) => ref.id >= 1500);
    expect(refs).toHaveLength(9);
    expect(Math.min(...refs.map((ref) => ref.id))).toBe(1500);

    const commands = DEFAULT_MOCK_COMMANDS.filter((command) => command.id >= 2300);
    expect(commands).toHaveLength(16);
    expect(Math.min(...commands.map((command) => command.id))).toBe(2300);
  });

  it('starts with the toy aircraft transmitting and listening on COM1', () => {
    const selection = DEFAULT_MOCK_DATAREFS.find((ref) => ref.name === TRANSMIT.selection);
    expect(selection?.value).toBe(MICS[0]!.value);
    const com1 = DEFAULT_MOCK_DATAREFS.find((ref) => ref.name === MONITORS[0]!.state);
    expect(com1?.value).toBe(1);
    const nav1 = DEFAULT_MOCK_DATAREFS.find((ref) => ref.name === MONITORS[2]!.state);
    expect(nav1?.value).toBe(0);
  });
});
