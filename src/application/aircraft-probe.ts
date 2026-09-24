import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import type { BindingResult, BindingResults } from '@/domain/aircraft/availability';
import {
  IDENTITY_DATAREFS,
  IDENTITY_FIELDS,
  type IdentityField,
} from '@/domain/aircraft/identity-datarefs';
import type { BindingSpec } from '@/domain/aircraft/profile';
import { decodeDataRefString } from '@/domain/simulator/dataref-string';
import type { SimulatorClient } from '@/domain/simulator/simulator-client';
import type { CommandDescriptor, DataRefDescriptor } from '@/domain/simulator/types';
import { mapWithConcurrency } from '@/utils/concurrency';

/** Six at a time keeps a 60-name profile under a second on a LAN without flooding a phone's link. */
export const PROBE_CONCURRENCY = 6;

export type ProbeClient = Pick<SimulatorClient, 'findDataRef' | 'findCommand' | 'getDataRefValue'>;

export interface IdentificationResult {
  identity: AircraftIdentity;
  results: BindingResults;
  /** The resolved identification DataRefs, so the session can subscribe to them (R8). */
  dataRefs: DataRefDescriptor[];
}

/**
 * Reads a `data`-typed DataRef as text. A lookup miss is a recorded result; a transport failure is
 * left to throw, because a broken link must not be reported as a missing name.
 */
async function readText(
  client: ProbeClient,
  name: string,
): Promise<{ text: string | null; dataRef: DataRefDescriptor | null; result: BindingResult }> {
  const dataRef = await client.findDataRef(name);
  if (dataRef === null) {
    return { text: null, dataRef: null, result: { name, kind: 'dataref', status: 'missing' } };
  }
  const value = await client.getDataRefValue(dataRef.id);
  return {
    text: decodeDataRefString(value, dataRef.valueType),
    dataRef,
    // The name resolved: a DataRef holding an empty string is present, just silent.
    result: { name, kind: 'dataref', status: 'ok' },
  };
}

/** Phase 2 of the connect pipeline: who is flying. Never fails a connect (R1, R2). */
export async function identifyAircraft(
  client: ProbeClient,
  concurrency: number = PROBE_CONCURRENCY,
): Promise<IdentificationResult> {
  const reads = await mapWithConcurrency(IDENTITY_FIELDS, concurrency, (field: IdentityField) =>
    readText(client, IDENTITY_DATAREFS[field]).then((read) => ({ field, read })),
  );
  const identity: AircraftIdentity = { ...UNIDENTIFIED };
  const results: BindingResults = {};
  const dataRefs: DataRefDescriptor[] = [];
  for (const { field, read } of reads) {
    identity[field] = read.text;
    results[IDENTITY_DATAREFS[field]] = read.result;
    if (read.dataRef !== null) {
      dataRefs.push(read.dataRef);
    }
  }
  return { identity, results, dataRefs };
}

export interface AddOnVersionResult {
  version: string | null;
  result: BindingResult;
  dataRef: DataRefDescriptor | null;
}

/** The add-on's own version, when the selected profile names a DataRef carrying one (R12). */
export async function readAddOnVersion(
  client: ProbeClient,
  name: string,
): Promise<AddOnVersionResult> {
  const read = await readText(client, name);
  return { version: read.text, result: read.result, dataRef: read.dataRef };
}

export interface ProbeResult {
  results: BindingResults;
  dataRefs: DataRefDescriptor[];
  commands: Map<string, CommandDescriptor>;
  /** False when this X-Plane reported `is_writable` on no descriptor at all (pre-12.4.3). */
  writabilityReported: boolean;
}

/** Phase 4 of the connect pipeline: which of the profile's names this aircraft actually has. */
export async function probeBindings(
  client: ProbeClient,
  bindings: readonly BindingSpec[],
  concurrency: number = PROBE_CONCURRENCY,
): Promise<ProbeResult> {
  const probes = await mapWithConcurrency(bindings, concurrency, async (binding) => {
    if (binding.kind === 'command') {
      const command = await client.findCommand(binding.name);
      return { binding, command, dataRef: null };
    }
    const dataRef = await client.findDataRef(binding.name);
    return { binding, command: null, dataRef };
  });

  const results: BindingResults = {};
  const dataRefs: DataRefDescriptor[] = [];
  const commands = new Map<string, CommandDescriptor>();
  let writabilityReported = false;
  for (const { binding, command, dataRef } of probes) {
    if (binding.kind === 'command') {
      results[binding.name] = {
        name: binding.name,
        kind: 'command',
        status: command === null ? 'missing' : 'ok',
      };
      if (command !== null) {
        commands.set(command.name, command);
      }
      continue;
    }
    if (dataRef === null) {
      results[binding.name] = { name: binding.name, kind: 'dataref', status: 'missing' };
      continue;
    }
    if (dataRef.isWritable !== undefined) {
      writabilityReported = true;
    }
    // Only an explicit `false` disables a control: an X-Plane that declines to answer must not
    // cost the pilot a control that works (spec decision 5).
    const readOnly = binding.write === true && dataRef.isWritable === false;
    results[binding.name] = {
      name: binding.name,
      kind: 'dataref',
      status: readOnly ? 'readOnly' : 'ok',
    };
    // A locked name is still a name this aircraft has, so its descriptor is collected and
    // subscribed like any other; only the binding's own status records that it cannot be written.
    dataRefs.push(dataRef);
  }
  return { results, dataRefs, commands, writabilityReported };
}
