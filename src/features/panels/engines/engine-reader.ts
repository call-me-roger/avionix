import type { SessionSnapshot } from '@/application/session-snapshot';
import type { EngineReader, EnginesModel } from '@/domain/engines/engine-page';
import { numberAt } from '@/domain/systems/readouts';
import { bindingOk, valueOf } from '@/features/panels/systems/availability';

/**
 * The session snapshot as the engines domain reads it: resolution from F-03, numbers from
 * telemetry. A name with no binding result yet (before or right after connect) is neither `has`
 * nor `missing`. These bindings are never written, so `readOnly` cannot occur.
 */
export function engineReader(snapshot: SessionSnapshot): EngineReader {
  return {
    has: (name) => bindingOk(snapshot, name),
    missing: (name) => snapshot.compatibility.bindings[name]?.status === 'missing',
    arrived: (name) => {
      const value = valueOf(snapshot, name);
      return value !== undefined && !(Array.isArray(value) && value.length === 0);
    },
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
