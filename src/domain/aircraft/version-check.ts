import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import type { AircraftProfile } from '@/domain/aircraft/profile';

function formatList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? '';
  }
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1] ?? ''}`;
}

/**
 * A sentence when the aircraft reports an add-on version the profile was not written for,
 * otherwise null (R12). It is a warning and never an error: the profile stays selected and every
 * name that still resolves still works. The generic profile declares neither a version DataRef nor
 * tested versions, so the generic case is null by construction.
 */
export function versionWarning(
  profile: AircraftProfile,
  identity: AircraftIdentity,
): string | null {
  const tested = profile.testedWith ?? [];
  const reported = identity.addOnVersion;
  if (tested.length === 0 || reported === null || tested.includes(reported)) {
    return null;
  }
  return `This profile was written for ${formatList(tested)}. The aircraft reports ${reported}, so some controls may have moved.`;
}
