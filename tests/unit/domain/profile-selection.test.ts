import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import type { AircraftProfile, ProfileCatalog } from '@/domain/aircraft/profile';
import { selectProfile } from '@/domain/aircraft/profile-selection';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { versionWarning } from '@/domain/aircraft/version-check';

function named(id: string, codes: readonly string[]): AircraftProfile {
  return {
    id,
    name: `Profile ${id}`,
    version: '1.0.0',
    match: { kind: 'icao', codes },
    features: [],
  };
}

const zibo = named('vendor.zibo', ['B738']);
const other = named('avionix.b738', ['b738']);
const catalog: ProfileCatalog = { generic: GENERIC_PROFILE, named: [zibo, other] };

describe('selectProfile', () => {
  it('falls back to the generic profile when nothing was identified', () => {
    expect(selectProfile(catalog, UNIDENTIFIED)).toEqual({
      profile: GENERIC_PROFILE,
      reason: 'fallback',
    });
  });

  it('falls back when no named profile claims the type code', () => {
    const selection = selectProfile(catalog, { ...UNIDENTIFIED, icaoType: 'C172' });
    expect(selection).toEqual({ profile: GENERIC_PROFILE, reason: 'fallback' });
  });

  it('matches a named profile on the type code, ignoring case', () => {
    const selection = selectProfile(
      { generic: GENERIC_PROFILE, named: [zibo] },
      { ...UNIDENTIFIED, icaoType: 'b738' },
    );
    expect(selection).toEqual({ profile: zibo, reason: 'matched' });
  });

  it('resolves two claimants by profile id, not by array order', () => {
    const forwards = selectProfile(catalog, { ...UNIDENTIFIED, icaoType: 'B738' });
    const backwards = selectProfile(
      { generic: GENERIC_PROFILE, named: [other, zibo] },
      { ...UNIDENTIFIED, icaoType: 'B738' },
    );
    expect(forwards.profile.id).toBe('avionix.b738');
    expect(backwards.profile.id).toBe('avionix.b738');
  });

  it('never selects the generic profile as a match', () => {
    const selection = selectProfile(
      { generic: GENERIC_PROFILE, named: [] },
      { ...UNIDENTIFIED, icaoType: 'B738' },
    );
    expect(selection.reason).toBe('fallback');
  });
});

describe('versionWarning', () => {
  const tested: AircraftProfile = { ...zibo, testedWith: ['4.2', '4.3'] };

  it('says nothing when the profile declares no tested versions', () => {
    expect(versionWarning(zibo, { ...UNIDENTIFIED, addOnVersion: '9.9' })).toBeNull();
  });

  it('says nothing when the aircraft reported no add-on version', () => {
    expect(versionWarning(tested, UNIDENTIFIED)).toBeNull();
  });

  it('says nothing when the reported version is one it was tested against', () => {
    expect(versionWarning(tested, { ...UNIDENTIFIED, addOnVersion: '4.3' })).toBeNull();
  });

  it('warns, naming both sides, when the version is outside what it was written for', () => {
    expect(versionWarning(tested, { ...UNIDENTIFIED, addOnVersion: '4.4' })).toBe(
      'This profile was written for 4.2 and 4.3. The aircraft reports 4.4, so some controls may have moved.',
    );
  });

  it('lists three or more tested versions readably', () => {
    const three = { ...tested, testedWith: ['4.1', '4.2', '4.3'] };
    expect(versionWarning(three, { ...UNIDENTIFIED, addOnVersion: '4.4' })).toContain(
      '4.1, 4.2 and 4.3',
    );
  });
});
