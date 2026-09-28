import { IDENTITY_DATAREF_NAMES } from '@/domain/aircraft/identity-datarefs';
import type { AircraftProfile } from '@/domain/aircraft/profile';
import { FEATURE_CONNECTION_HEALTH } from '@/domain/aircraft/profiles/generic';
import type { DataRefDescriptor } from '@/domain/simulator/types';

/**
 * Which resolved DataRefs the socket should carry (F-04 R12). `demand` is the visible panel's
 * feature ids, or null before any panel has said, which keeps today's behaviour of streaming
 * everything. Identification and connection health are always wanted: the first announces an
 * aircraft change (F-03), the second is how the app knows the values are live (F-02).
 */
export function wantedDataRefIds(
  profile: AircraftProfile,
  dataRefsById: ReadonlyMap<number, DataRefDescriptor>,
  demand: readonly string[] | null,
): Set<number> {
  if (demand === null) {
    return new Set(dataRefsById.keys());
  }
  const names = new Set<string>(IDENTITY_DATAREF_NAMES);
  for (const feature of profile.features) {
    if (feature.id !== FEATURE_CONNECTION_HEALTH && !demand.includes(feature.id)) {
      continue;
    }
    for (const binding of feature.bindings) {
      if (binding.kind === 'dataref') {
        names.add(binding.name);
      }
    }
  }
  const ids = new Set<number>();
  for (const [id, descriptor] of dataRefsById) {
    if (names.has(descriptor.name)) {
      ids.add(id);
    }
  }
  return ids;
}
