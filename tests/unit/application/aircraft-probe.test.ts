import {
  PROBE_CONCURRENCY,
  type ProbeClient,
  identifyAircraft,
  probeBindings,
  readAddOnVersion,
} from '@/application/aircraft-probe';
import { IDENTITY_DATAREFS } from '@/domain/aircraft/identity-datarefs';
import type { BindingSpec } from '@/domain/aircraft/profile';
import type { CommandDescriptor, DataRefDescriptor } from '@/domain/simulator/types';

interface FakeOptions {
  dataRefs?: Record<string, DataRefDescriptor>;
  values?: Record<number, string>;
  commands?: Record<string, CommandDescriptor>;
}

function fakeClient(options: FakeOptions = {}): ProbeClient & { inFlightPeak: number } {
  const dataRefs = options.dataRefs ?? {};
  const values = options.values ?? {};
  const commands = options.commands ?? {};
  let inFlight = 0;
  const client = {
    inFlightPeak: 0,
    async findDataRef(name: string) {
      inFlight += 1;
      client.inFlightPeak = Math.max(client.inFlightPeak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return dataRefs[name] ?? null;
    },
    async findCommand(name: string) {
      return commands[name] ?? null;
    },
    async getDataRefValue(id: number) {
      return values[id] ?? '';
    },
  };
  return client;
}

const text = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

describe('identifyAircraft', () => {
  it('reads and decodes the three identification datarefs', async () => {
    const client = fakeClient({
      dataRefs: {
        [IDENTITY_DATAREFS.icaoType]: {
          id: 1,
          name: IDENTITY_DATAREFS.icaoType,
          valueType: 'data',
        },
        [IDENTITY_DATAREFS.description]: {
          id: 2,
          name: IDENTITY_DATAREFS.description,
          valueType: 'data',
        },
        [IDENTITY_DATAREFS.tailNumber]: {
          id: 3,
          name: IDENTITY_DATAREFS.tailNumber,
          valueType: 'data',
        },
      },
      values: { 1: text('C172'), 2: text('Cessna 172 SP'), 3: text('N172SP') },
    });
    const { identity, results, dataRefs } = await identifyAircraft(client);
    expect(identity).toEqual({
      icaoType: 'C172',
      description: 'Cessna 172 SP',
      tailNumber: 'N172SP',
      addOnVersion: null,
    });
    expect(results[IDENTITY_DATAREFS.icaoType]?.status).toBe('ok');
    expect(dataRefs.map((descriptor) => descriptor.id)).toEqual([1, 2, 3]);
  });

  it('records a miss and keeps going, because identification never fails a connect', async () => {
    const client = fakeClient({
      dataRefs: {
        [IDENTITY_DATAREFS.tailNumber]: {
          id: 3,
          name: IDENTITY_DATAREFS.tailNumber,
          valueType: 'data',
        },
      },
      values: { 3: text('N172SP') },
    });
    const { identity, results, dataRefs } = await identifyAircraft(client);
    expect(identity.icaoType).toBeNull();
    expect(identity.tailNumber).toBe('N172SP');
    expect(results[IDENTITY_DATAREFS.icaoType]?.status).toBe('missing');
    expect(dataRefs).toHaveLength(1);
  });

  it('leaves a field null when the dataref resolves but holds nothing', async () => {
    const client = fakeClient({
      dataRefs: {
        [IDENTITY_DATAREFS.icaoType]: {
          id: 1,
          name: IDENTITY_DATAREFS.icaoType,
          valueType: 'data',
        },
      },
      values: { 1: '' },
    });
    const { identity, results } = await identifyAircraft(client);
    expect(identity.icaoType).toBeNull();
    // The name is there, so the binding resolved: only the aircraft has nothing to say.
    expect(results[IDENTITY_DATAREFS.icaoType]?.status).toBe('ok');
  });
});

describe('readAddOnVersion', () => {
  it('decodes the version when the dataref is there', async () => {
    const client = fakeClient({
      dataRefs: { 'b738/version': { id: 7, name: 'b738/version', valueType: 'data' } },
      values: { 7: text('4.4') },
    });
    const outcome = await readAddOnVersion(client, 'b738/version');
    expect(outcome.version).toBe('4.4');
    expect(outcome.result.status).toBe('ok');
    expect(outcome.dataRef?.id).toBe(7);
  });

  it('records a miss without a version', async () => {
    const outcome = await readAddOnVersion(fakeClient(), 'b738/version');
    expect(outcome.version).toBeNull();
    expect(outcome.result.status).toBe('missing');
    expect(outcome.dataRef).toBeNull();
  });
});

describe('probeBindings', () => {
  const bindings: readonly BindingSpec[] = [
    { kind: 'dataref', name: 'present', required: true, purpose: 'Present' },
    { kind: 'dataref', name: 'absent', required: true, purpose: 'Absent' },
    { kind: 'dataref', name: 'locked', required: true, write: true, purpose: 'Locked' },
    { kind: 'dataref', name: 'unreported', required: true, write: true, purpose: 'Unreported' },
    { kind: 'command', name: 'cmd', required: true, purpose: 'Command' },
  ];

  const client = () =>
    fakeClient({
      dataRefs: {
        present: { id: 1, name: 'present', valueType: 'float', isWritable: true },
        locked: { id: 2, name: 'locked', valueType: 'float', isWritable: false },
        unreported: { id: 3, name: 'unreported', valueType: 'float' },
      },
      commands: { cmd: { id: 9, name: 'cmd', description: 'Command' } },
    });

  it('records ok, missing and read-only per name without throwing', async () => {
    const probe = await probeBindings(client(), bindings);
    expect(probe.results.present?.status).toBe('ok');
    expect(probe.results.absent?.status).toBe('missing');
    expect(probe.results.locked?.status).toBe('readOnly');
    expect(probe.results.cmd).toEqual({ name: 'cmd', kind: 'command', status: 'ok' });
  });

  it('treats an unreported isWritable as writable', async () => {
    const probe = await probeBindings(client(), bindings);
    expect(probe.results.unreported?.status).toBe('ok');
    expect(probe.writabilityReported).toBe(true);
  });

  it('reports writability unreported when no descriptor carried the flag', async () => {
    const probe = await probeBindings(
      fakeClient({ dataRefs: { present: { id: 1, name: 'present', valueType: 'float' } } }),
      [bindings[0] as BindingSpec],
    );
    expect(probe.writabilityReported).toBe(false);
  });

  it('ignores isWritable false on a binding the app only reads', async () => {
    const probe = await probeBindings(
      fakeClient({
        dataRefs: { locked: { id: 2, name: 'locked', valueType: 'float', isWritable: false } },
      }),
      [{ kind: 'dataref', name: 'locked', required: true, purpose: 'Read only' }],
    );
    expect(probe.results.locked?.status).toBe('ok');
  });

  it('collects the resolved descriptors for the subscription', async () => {
    const probe = await probeBindings(client(), bindings);
    expect(probe.dataRefs.map((descriptor) => descriptor.name)).toEqual([
      'present',
      'locked',
      'unreported',
    ]);
    expect(probe.commands.get('cmd')?.id).toBe(9);
  });

  it('flags the case where nothing at all resolved', async () => {
    const probe = await probeBindings(fakeClient(), bindings);
    expect(probe.allMissing).toBe(true);
    expect((await probeBindings(client(), bindings)).allMissing).toBe(false);
    expect((await probeBindings(fakeClient(), [])).allMissing).toBe(false);
  });

  it('keeps at most `concurrency` lookups in flight', async () => {
    const many: BindingSpec[] = Array.from({ length: 20 }, (_, index) => ({
      kind: 'dataref',
      name: `n${index}`,
      required: true,
      purpose: 'Bulk',
    }));
    const probeClient = fakeClient();
    await probeBindings(probeClient, many, 3);
    expect(probeClient.inFlightPeak).toBe(3);
    expect(PROBE_CONCURRENCY).toBe(6);
  });

  it('lets a transport failure through, so a broken link is not read as a missing name', async () => {
    const failing: ProbeClient = {
      findDataRef: async () => {
        throw new Error('network down');
      },
      findCommand: async () => null,
      getDataRefValue: async () => 0,
    };
    await expect(probeBindings(failing, bindings)).rejects.toThrow('network down');
  });

  it('does not count a resolved-but-locked binding as missing', async () => {
    const lockedOnly: readonly BindingSpec[] = [
      { kind: 'dataref', name: 'locked', required: true, write: true, purpose: 'Locked' },
      { kind: 'dataref', name: 'locked2', required: true, write: true, purpose: 'Locked 2' },
    ];
    const probe = await probeBindings(
      fakeClient({
        dataRefs: {
          locked: { id: 2, name: 'locked', valueType: 'float', isWritable: false },
          locked2: { id: 4, name: 'locked2', valueType: 'float', isWritable: false },
        },
      }),
      lockedOnly,
    );
    expect(probe.results.locked?.status).toBe('readOnly');
    expect(probe.results.locked2?.status).toBe('readOnly');
    expect(probe.allMissing).toBe(false);
  });
});
