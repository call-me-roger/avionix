import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  aircraftKey,
  choosePresentation,
  engineDefault,
  resolvePresentation,
} from '@/domain/instruments/presentation';

const C172 = { ...UNIDENTIFIED, icaoType: 'C172', description: 'Cessna 172 SP' };

describe('instrument presentation', () => {
  it('keys an aircraft by ICAO type, else description, else not at all', () => {
    expect(aircraftKey(C172)).toBe('C172');
    expect(aircraftKey({ ...UNIDENTIFIED, description: 'Homebuilt' })).toBe('Homebuilt');
    expect(aircraftKey(UNIDENTIFIED)).toBeNull();
    expect(aircraftKey({ ...UNIDENTIFIED, tailNumber: 'N172SP' })).toBeNull();
  });

  it('defaults jets and rockets to the PFD, pistons, electrics and turboprops to the six-pack', () => {
    for (const code of [5, 6, 7]) {
      expect(engineDefault(code)).toBe('pfd');
    }
    for (const code of [0, 1, 3, 9, 10]) {
      expect(engineDefault(code)).toBe('sixPack');
    }
    expect(engineDefault(2)).toBeNull();
    expect(engineDefault(null)).toBeNull();
  });

  it('starts on the PFD', () => {
    expect(DEFAULT_PRESENTATION_PREFERENCES).toEqual({ last: 'pfd', byAircraft: {} });
    expect(resolvePresentation(DEFAULT_PRESENTATION_PREFERENCES, null, null)).toBe('pfd');
  });

  it('prefers the stored choice, then the engine default, then the last choice', () => {
    const prefs = { last: 'pfd' as const, byAircraft: { C172: 'pfd' as const } };
    expect(resolvePresentation(prefs, 'C172', 0)).toBe('pfd');
    expect(resolvePresentation(prefs, 'BE58', 0)).toBe('sixPack');
    expect(resolvePresentation(prefs, 'BE58', 2)).toBe('pfd');
    expect(resolvePresentation({ ...prefs, last: 'sixPack' }, null, null)).toBe('sixPack');
  });

  it('remembers a choice per aircraft and as the last choice', () => {
    const next = choosePresentation(DEFAULT_PRESENTATION_PREFERENCES, 'C172', 'sixPack');
    expect(next).toEqual({ last: 'sixPack', byAircraft: { C172: 'sixPack' } });
    expect(choosePresentation(next, null, 'pfd')).toEqual({
      last: 'pfd',
      byAircraft: { C172: 'sixPack' },
    });
  });

  it('returns the same object when nothing changes', () => {
    const prefs = { last: 'sixPack' as const, byAircraft: { C172: 'sixPack' as const } };
    expect(choosePresentation(prefs, 'C172', 'sixPack')).toBe(prefs);
    expect(choosePresentation(prefs, null, 'sixPack')).toBe(prefs);
  });
});
