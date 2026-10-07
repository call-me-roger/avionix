import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

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
