import type { SessionSnapshot } from '@/application/session-snapshot';
import type { MapReader } from '@/domain/map/map-model';
import { numberAt } from '@/domain/systems/readouts';
import { bindingMissing, bindingOk, valueOf } from '@/features/panels/systems/availability';

/** The session snapshot as the map domain reads it (F-12's three answers). */
export function mapReader(snapshot: SessionSnapshot): MapReader {
  return {
    has: (name) => bindingOk(snapshot, name),
    missing: (name) => bindingMissing(snapshot, name),
    number: (name) => numberAt(valueOf(snapshot, name), 0),
  };
}
