import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import type {
  BindingResults,
  FeatureAvailability,
  FeatureStatus,
} from '@/domain/aircraft/availability';
import { IDENTITY_DATAREF_NAMES } from '@/domain/aircraft/identity-datarefs';
import type { AircraftProfile } from '@/domain/aircraft/profile';
import type { SelectionReason } from '@/domain/aircraft/profile-selection';

export const IDENTIFICATION_LABEL = 'Aircraft identification';

/** What the app knows about the aircraft and how much of the profile it actually has. */
export interface CompatibilitySnapshot {
  identity: AircraftIdentity;
  /** False when X-Plane named no aircraft at all; the view then explains the fallback (R2). */
  identified: boolean;
  profileId: string;
  profileName: string;
  profileVersion: string;
  selection: SelectionReason;
  testedWith: readonly string[];
  versionWarning: string | null;
  features: readonly FeatureAvailability[];
  /** Per-name probe outcomes, identification DataRefs included. */
  bindings: BindingResults;
  /**
   * Which feature each bound name serves. Stored rather than derived, because the shareable
   * summary and the diagnostics screen see the snapshot, never the profile object.
   */
  bindingLabels: Record<string, string>;
  writabilityReported: boolean;
  /**
   * Wall clock of the last completed probe. "Not current" is not stored: it is derived in the
   * view from the link state, so it can never disagree with the link (R11).
   */
  checkedAt: number | null;
}

export function initialCompatibility(profile: AircraftProfile): CompatibilitySnapshot {
  return {
    identity: UNIDENTIFIED,
    identified: false,
    profileId: profile.id,
    profileName: profile.name,
    profileVersion: profile.version,
    selection: 'fallback',
    testedWith: profile.testedWith ?? [],
    versionWarning: null,
    features: profile.features.map((feature) => ({
      id: feature.id,
      label: feature.label,
      status: 'unknown' as const,
      missing: [],
    })),
    bindings: {},
    bindingLabels: bindingFeatureLabels(profile),
    writabilityReported: false,
    checkedAt: null,
  };
}

export function featureOf(
  compatibility: CompatibilitySnapshot,
  featureId: string,
): FeatureAvailability | null {
  return compatibility.features.find((feature) => feature.id === featureId) ?? null;
}

/**
 * `unknown` for a feature the selected profile does not declare, so a surface written against the
 * generic profile degrades against a future profile that omits it instead of crashing.
 */
export function featureStatus(
  compatibility: CompatibilitySnapshot,
  featureId: string,
): FeatureStatus {
  return featureOf(compatibility, featureId)?.status ?? 'unknown';
}

/** Which feature each name serves, so diagnostics can say what a missing name costs (F-02 R8). */
export function bindingFeatureLabels(profile: AircraftProfile): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const name of IDENTITY_DATAREF_NAMES) {
    labels[name] = IDENTIFICATION_LABEL;
  }
  for (const feature of profile.features) {
    for (const binding of feature.bindings) {
      labels[binding.name] ??= feature.label;
    }
  }
  return labels;
}

/** Every DataRef name the snapshot tracks a step for: identification plus the profile's own. */
export function snapshotDataRefNames(profile: AircraftProfile): string[] {
  const names = new Set<string>(IDENTITY_DATAREF_NAMES);
  for (const feature of profile.features) {
    for (const binding of feature.bindings) {
      if (binding.kind === 'dataref') {
        names.add(binding.name);
      }
    }
  }
  return [...names];
}
