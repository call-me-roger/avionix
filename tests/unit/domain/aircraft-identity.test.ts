import {
  type AircraftIdentity,
  UNIDENTIFIED,
  identityLabel,
  isIdentified,
  sameAircraft,
} from '@/domain/aircraft/aircraft-identity';
import {
  IDENTITY_DATAREFS,
  IDENTITY_DATAREF_NAMES,
  identityFieldFor,
} from '@/domain/aircraft/identity-datarefs';

const cessna: AircraftIdentity = {
  icaoType: 'C172',
  description: 'Cessna 172 SP',
  tailNumber: 'N172SP',
  addOnVersion: null,
};

describe('AircraftIdentity', () => {
  it('reports nothing identified for the empty identity', () => {
    expect(isIdentified(UNIDENTIFIED)).toBe(false);
    expect(identityLabel(UNIDENTIFIED)).toBeNull();
  });

  it('counts any of the three identification fields as identified', () => {
    expect(isIdentified({ ...UNIDENTIFIED, tailNumber: 'N172SP' })).toBe(true);
  });

  it('does not count an add-on version alone as an identification', () => {
    expect(isIdentified({ ...UNIDENTIFIED, addOnVersion: '4.2' })).toBe(false);
  });

  it('labels the aircraft with its description, type code and tail number', () => {
    expect(identityLabel(cessna)).toBe('Cessna 172 SP (C172) · N172SP');
  });

  it('falls back to whichever fields X-Plane did report', () => {
    expect(identityLabel({ ...UNIDENTIFIED, icaoType: 'B738' })).toBe('B738');
    expect(identityLabel({ ...UNIDENTIFIED, tailNumber: 'N738AV' })).toBe('N738AV');
    expect(identityLabel({ ...UNIDENTIFIED, description: 'Zibo 737' })).toBe('Zibo 737');
  });

  it('treats any difference as a different aircraft, the add-on version included', () => {
    expect(sameAircraft(cessna, { ...cessna })).toBe(true);
    expect(sameAircraft(cessna, { ...cessna, tailNumber: 'N999XX' })).toBe(false);
    expect(sameAircraft(cessna, { ...cessna, addOnVersion: '4.2' })).toBe(false);
  });
});

describe('identity datarefs', () => {
  it('names the three community-convention datarefs', () => {
    expect(IDENTITY_DATAREFS.icaoType).toBe('sim/aircraft/view/acf_ICAO');
    expect(IDENTITY_DATAREFS.description).toBe('sim/aircraft/view/acf_descrip');
    expect(IDENTITY_DATAREFS.tailNumber).toBe('sim/aircraft/view/acf_tailnum');
    expect(IDENTITY_DATAREF_NAMES).toHaveLength(3);
  });

  it('maps a name back to the field it fills', () => {
    expect(identityFieldFor(IDENTITY_DATAREFS.description)).toBe('description');
    expect(identityFieldFor('sim/time/paused')).toBeNull();
  });
});
