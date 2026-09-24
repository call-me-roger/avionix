import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import type { AircraftProfile, MatchRule, ProfileCatalog } from '@/domain/aircraft/profile';

export type SelectionReason = 'matched' | 'fallback';

export interface ProfileSelection {
  profile: AircraftProfile;
  reason: SelectionReason;
}

function matches(rule: MatchRule, identity: AircraftIdentity): boolean {
  // The generic profile is the catalog's fallback, never a candidate: reaching it through a match
  // would report "matched automatically" for an aircraft nothing recognised.
  if (rule.kind === 'generic' || identity.icaoType === null) {
    return false;
  }
  const code = identity.icaoType.toUpperCase();
  return rule.codes.some((candidate) => candidate.toUpperCase() === code);
}

/**
 * Deterministic by construction (R3): among the profiles whose rule fits, the lowest id wins, so
 * two profiles claiming the same aircraft always resolve the same way rather than by whichever
 * order the catalog happens to list them in.
 */
export function selectProfile(
  catalog: ProfileCatalog,
  identity: AircraftIdentity,
): ProfileSelection {
  const candidates = catalog.named
    .filter((profile) => matches(profile.match, identity))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const matched = candidates[0];
  return matched === undefined
    ? { profile: catalog.generic, reason: 'fallback' }
    : { profile: matched, reason: 'matched' };
}
