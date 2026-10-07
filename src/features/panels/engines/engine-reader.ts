import type { SessionSnapshot } from '@/application/session-snapshot';
import type { EngineReader, EnginesModel } from '@/domain/engines/engine-page';
import { numberAt } from '@/domain/systems/readouts';
import { bindingOk, valueOf } from '@/features/panels/systems/availability';

/** The session snapshot as the engines domain reads it: resolution from F-03, numbers from telemetry. */
export function engineReader(snapshot: SessionSnapshot): EngineReader {
  return {
    has: (name) => bindingOk(snapshot, name),
    number: (name, index = 0) => numberAt(valueOf(snapshot, name), index),
  };
}

/** The engines FUEL and ELEC count: the drawn columns, 0 for a glider, null while unknown. */
export function drawnEngines(model: EnginesModel): number | null {
  if (model.status === 'ready') {
    return model.columns.length;
  }
  return model.status === 'none' ? 0 : null;
}
