import {
  IDENTIFICATION_LABEL,
  bindingFeatureLabels,
  featureOf,
  featureStatus,
  initialCompatibility,
  snapshotDataRefNames,
} from '@/application/compatibility';
import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import { IDENTITY_DATAREFS } from '@/domain/aircraft/identity-datarefs';
import {
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';

describe('initialCompatibility', () => {
  const initial = initialCompatibility(GENERIC_PROFILE);

  it('starts unidentified, on the given profile, with nothing checked', () => {
    expect(initial.identity).toEqual(UNIDENTIFIED);
    expect(initial.identified).toBe(false);
    expect(initial.profileId).toBe(GENERIC_PROFILE.id);
    expect(initial.profileName).toBe(GENERIC_PROFILE.name);
    expect(initial.profileVersion).toBe(GENERIC_PROFILE.version);
    expect(initial.selection).toBe('fallback');
    expect(initial.checkedAt).toBeNull();
    expect(initial.bindings).toEqual({});
    expect(initial.bindingLabels[GENERIC_DATAREFS.airspeed]).toBe('Live telemetry');
    expect(initial.versionWarning).toBeNull();
    expect(initial.writabilityReported).toBe(false);
    expect(initial.testedWith).toEqual([]);
  });

  it('lists every feature of the profile as not checked yet', () => {
    expect(initial.features.map((feature) => feature.status)).toEqual(
      GENERIC_PROFILE.features.map(() => 'unknown'),
    );
  });
});

describe('feature lookup', () => {
  const initial = initialCompatibility(GENERIC_PROFILE);

  it('finds a feature the profile declares', () => {
    expect(featureOf(initial, FEATURE_HEADING_CONTROL)?.label).toBe('Heading control');
    expect(featureStatus(initial, FEATURE_HEADING_CONTROL)).toBe('unknown');
  });

  it('answers unknown for a feature this profile does not declare at all', () => {
    expect(featureOf(initial, 'autopilot')).toBeNull();
    expect(featureStatus(initial, 'autopilot')).toBe('unknown');
  });
});

describe('bindingFeatureLabels', () => {
  const labels = bindingFeatureLabels(GENERIC_PROFILE);

  it('names the feature behind every profile binding', () => {
    expect(labels[GENERIC_DATAREFS.airspeed]).toBe('Live telemetry');
    expect(labels[GENERIC_COMMANDS.headingUp]).toBe('Heading control');
  });

  it('names identification for the three identity datarefs', () => {
    expect(labels[IDENTITY_DATAREFS.tailNumber]).toBe(IDENTIFICATION_LABEL);
  });
});

describe('snapshotDataRefNames', () => {
  it('covers identification and every dataref the profile declares, commands excluded', () => {
    const names = snapshotDataRefNames(GENERIC_PROFILE);
    expect(names).toContain(IDENTITY_DATAREFS.icaoType);
    expect(names).toContain(GENERIC_DATAREFS.heartbeat);
    expect(names).not.toContain(GENERIC_COMMANDS.headingUp);
    expect(new Set(names).size).toBe(names.length);
  });
});
