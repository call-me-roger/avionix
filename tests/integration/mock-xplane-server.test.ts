import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function waitForMessage(socket: WebSocket, predicate: (msg: unknown) => boolean): Promise<unknown> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent): void => {
      const parsed: unknown = JSON.parse(String(event.data));
      if (predicate(parsed)) {
        socket.removeEventListener('message', handler);
        resolve(parsed);
      }
    };
    socket.addEventListener('message', handler);
  });
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => resolve(socket));
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
      data: [{ id: 1001, name: 'sim/time/total_running_time_sec', value_type: 'float' }],
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
    const socket = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
    const result = waitForMessage(socket, (m) => (m as { type?: string }).type === 'result');
    socket.send(
      JSON.stringify({
        req_id: 1,
        type: 'dataref_subscribe_values',
        params: { datarefs: [{ id: 1001 }, { id: 1003 }] },
      }),
    );
    expect(await result).toEqual({ req_id: 1, type: 'result', success: true });

    const first = await waitForMessage(
      socket,
      (m) => (m as { type?: string }).type === 'dataref_update_values',
    );
    expect(first).toEqual({ type: 'dataref_update_values', data: { '1001': 12.5, '1003': 270 } });

    server.setDataRefValue('sim/time/total_running_time_sec', 13);
    const second = await waitForMessage(
      socket,
      (m) => (m as { type?: string }).type === 'dataref_update_values',
    );
    expect(second).toEqual({ type: 'dataref_update_values', data: { '1001': 13 } });

    const unknown = waitForMessage(socket, (m) => (m as { req_id?: number }).req_id === 2);
    socket.send(JSON.stringify({ req_id: 2, type: 'bogus', params: {} }));
    expect(await unknown).toMatchObject({ success: false, error_code: 'unknown_type' });

    socket.close();
  });

  it('reports each malformed dataref_set_values item as its own failure', async () => {
    const socket = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
    const isReq3 = (m: unknown): boolean => isRecord(m) && m.req_id === 3;

    const invalidId = waitForMessage(
      socket,
      (m) => isReq3(m) && (m as { error_code?: string }).error_code === 'invalid_dataref_id',
    );
    const insufficientData = waitForMessage(
      socket,
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

    let sawSuccess = false;
    const watchForSuccess = (event: MessageEvent): void => {
      const parsed: unknown = JSON.parse(String(event.data));
      if (isReq3(parsed) && (parsed as { success?: boolean }).success === true) {
        sawSuccess = true;
      }
    };
    socket.addEventListener('message', watchForSuccess);
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.removeEventListener('message', watchForSuccess);

    expect(sawSuccess).toBe(false);
    expect(server.writes).toContainEqual({ id: 1003, value: 45 });

    socket.close();
  });
});
