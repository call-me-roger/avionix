import type { FeatureAvailability } from '@/domain/aircraft/availability';

export interface ControlAvailability {
  usable: boolean;
  /** Why the control is inert, in the pilot's words; null when it is usable. */
  reason: string | null;
}

export const NO_FEATURE_REASON = 'This control is not available on this aircraft.';

/**
 * R8. `available` and `partial` act, matching the session's `featureUsable`: `partial` exists
 * precisely for a feature missing only an optional binding. `unknown` must not borrow
 * `unavailable`'s wording — it has `missing: []`, so that copy would claim a lack it cannot name.
 */
export function controlAvailability(feature: FeatureAvailability | null): ControlAvailability {
  if (feature === null) {
    return { usable: false, reason: NO_FEATURE_REASON };
  }
  switch (feature.status) {
    case 'available':
    case 'partial':
      return { usable: true, reason: null };
    case 'unknown':
      return { usable: false, reason: `${feature.label} has not been checked yet.` };
    case 'unavailable':
      return {
        usable: false,
        reason: `${feature.label} is not available on this aircraft: ${feature.missing
          .map((miss) => miss.purpose)
          .join(', ')}.`,
      };
  }
}
