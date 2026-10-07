import {
  ENGINES_NOT_SHOWN,
  engineUnsupported,
  enginesUnidentified,
  gaugesMissing,
  noEngines,
  tanksUnavailable,
  unitsUnknown,
} from '@/domain/engines/messages';

describe('engine sentences', () => {
  it('name the aircraft when known', () => {
    expect(enginesUnidentified('Cessna 172')).toBe(
      "The engines on the Cessna 172 couldn't be identified.",
    );
    expect(enginesUnidentified(null)).toBe("The engines on this aircraft couldn't be identified.");
    expect(noEngines('ASK 21')).toBe('The ASK 21 has no engines.');
    expect(noEngines(null)).toBe('This aircraft has no engines.');
    expect(gaugesMissing('Cessna 172', ['EPR', 'N2'])).toBe(
      'Not available on the Cessna 172: EPR, N2.',
    );
    expect(tanksUnavailable(null)).toBe("Fuel tanks aren't available on this aircraft.");
  });

  it('say which engine type is unsupported, and the fifth-engine line', () => {
    expect(engineUnsupported(2)).toBe("Engine 2's type isn't supported.");
    expect(ENGINES_NOT_SHOWN).toBe("Engines 5 and up aren't shown.");
  });

  it('list temperatures with an unknown unit', () => {
    expect(unitsUnknown('Cessna 172', ['EGT'])).toBe(
      "The Cessna 172 doesn't say which unit its EGT uses; shown as reported.",
    );
    expect(unitsUnknown(null, ['EGT', 'ITT', 'oil temperature'])).toBe(
      "This aircraft doesn't say which units its EGT, ITT and oil temperature use; shown as reported.",
    );
  });
});
