export type BindingKind = 'dataref' | 'command';

export interface BindingSpec {
  kind: BindingKind;
  name: string;
  /** false: the feature still works without it, with less. */
  required: boolean;
  /** The feature writes to it, so a read-only resolution is a miss (R9). */
  write?: boolean;
  /** What it does, in the pilot's words. Printed beside the name when it is missing (R7). */
  purpose: string;
}

export interface FeatureSpec {
  id: string;
  label: string;
  bindings: readonly BindingSpec[];
}

export type MatchRule = { kind: 'generic' } | { kind: 'icao'; codes: readonly string[] };

export interface AircraftProfile {
  id: string;
  name: string;
  version: string;
  match: MatchRule;
  /** DataRef carrying the add-on's own version string, when it publishes one (R12). */
  addOnVersionDataRef?: string;
  /** Add-on versions this profile was written against (R12). */
  testedWith?: readonly string[];
  features: readonly FeatureSpec[];
}

export interface ProfileCatalog {
  generic: AircraftProfile;
  named: readonly AircraftProfile[];
}

/**
 * Every distinct name the profile declares, in declaration order — the probe list. Only `kind`,
 * `name` and `write` matter here: whether a miss costs a feature is decided per feature by
 * `deriveFeatureAvailability`, so a name two features declare differently is probed once, for the
 * stricter of the two.
 */
export function profileBindings(profile: AircraftProfile): readonly BindingSpec[] {
  const byName = new Map<string, BindingSpec>();
  for (const feature of profile.features) {
    for (const binding of feature.bindings) {
      const seen = byName.get(binding.name);
      if (seen === undefined) {
        byName.set(binding.name, binding);
      } else if (binding.write === true && seen.write !== true) {
        byName.set(binding.name, { ...seen, write: true });
      }
    }
  }
  return [...byName.values()];
}

export function findFeature(profile: AircraftProfile, featureId: string): FeatureSpec | null {
  return profile.features.find((feature) => feature.id === featureId) ?? null;
}

/** The DataRef a feature writes to, for a control that has to know which name backs it. */
export function writeBindingOf(profile: AircraftProfile, featureId: string): BindingSpec | null {
  const feature = findFeature(profile, featureId);
  return (
    feature?.bindings.find((binding) => binding.kind === 'dataref' && binding.write === true) ??
    null
  );
}

export function commandBindingOf(profile: AircraftProfile, featureId: string): BindingSpec | null {
  const feature = findFeature(profile, featureId);
  return feature?.bindings.find((binding) => binding.kind === 'command') ?? null;
}
