import type { AircraftProfile, BindingKind, FeatureSpec } from '@/domain/aircraft/profile';

export type BindingStatus = 'ok' | 'missing' | 'readOnly';

export interface BindingResult {
  name: string;
  kind: BindingKind;
  status: BindingStatus;
}

/** Probe results by DataRef or command name. `undefined` means the name was never probed. */
export type BindingResults = Record<string, BindingResult | undefined>;

export type FeatureStatus = 'available' | 'partial' | 'unavailable' | 'unknown';

export interface MissingBinding {
  name: string;
  kind: BindingKind;
  purpose: string;
  status: 'missing' | 'readOnly';
}

export interface FeatureAvailability {
  id: string;
  label: string;
  status: FeatureStatus;
  missing: readonly MissingBinding[];
}

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  available: 'available',
  partial: 'partly available',
  unavailable: 'not available on this aircraft',
  unknown: 'not checked yet',
};

export const BINDING_MISS_LABEL: Record<'missing' | 'readOnly', string> = {
  missing: 'not present on this aircraft',
  readOnly: 'read-only on this aircraft',
};

/**
 * R6, in order: a required miss costs the feature, anything unprobed leaves it unknown, an optional
 * miss degrades it. A feature is never reported healthy on incomplete evidence. readOnly (R9) only
 * counts as a miss for bindings declared write: true.
 */
export function deriveFeatureAvailability(
  feature: FeatureSpec,
  results: BindingResults,
): FeatureAvailability {
  const missing: MissingBinding[] = [];
  let requiredMiss = false;
  let optionalMiss = false;
  let unprobed = false;

  for (const binding of feature.bindings) {
    const result = results[binding.name];
    if (result === undefined) {
      unprobed = true;
      continue;
    }
    if (result.status === 'ok') {
      continue;
    }
    // readOnly only counts as a miss if the binding writes to the name (R9)
    if (result.status === 'readOnly' && !binding.write) {
      continue;
    }
    missing.push({
      name: binding.name,
      kind: binding.kind,
      purpose: binding.purpose,
      status: result.status,
    });
    if (binding.required) {
      requiredMiss = true;
    } else {
      optionalMiss = true;
    }
  }

  // R6 ordering: required miss → unavailable, then unknown, then optional miss → partial, else available
  const status: FeatureStatus = requiredMiss
    ? 'unavailable'
    : unprobed
      ? 'unknown'
      : optionalMiss
        ? 'partial'
        : 'available';
  // unknown status never reports missing bindings, even if unprobed ones were confirmed
  const finalMissing = status === 'unknown' ? [] : missing;
  return { id: feature.id, label: feature.label, status, missing: finalMissing };
}

export function deriveAvailability(
  profile: AircraftProfile,
  results: BindingResults,
): FeatureAvailability[] {
  return profile.features.map((feature) => deriveFeatureAvailability(feature, results));
}

function plural(count: number): string {
  return count === 1 ? 'feature' : 'features';
}

/** The one-line verdict on the aircraft summary row. Worst news first. */
export function summariseAvailability(features: readonly FeatureAvailability[]): string {
  if (features.length === 0) {
    return 'No features to check';
  }
  const count = (status: FeatureStatus): number =>
    features.filter((feature) => feature.status === status).length;
  const unavailable = count('unavailable');
  const partial = count('partial');
  const unknown = count('unknown');
  const parts: string[] = [];
  if (unavailable > 0) {
    parts.push(`${unavailable} ${plural(unavailable)} not available`);
  }
  if (partial > 0) {
    parts.push(`${partial} ${parts.length === 0 ? `${plural(partial)} ` : ''}partly available`);
  }
  if (unknown > 0) {
    parts.push(`${unknown} ${parts.length === 0 ? `${plural(unknown)} ` : ''}not checked yet`);
  }
  return parts.length === 0 ? 'All features available' : parts.join(', ');
}
