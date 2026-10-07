import { formatFuel } from '@/domain/flight-data/format';
import { fixed, groupedWhole, signedWhole, whole } from '@/domain/units/numbers';

describe('shared number formatters (F-11, F-12)', () => {
  it('rounds to whole and never shows a negative zero', () => {
    expect(whole(-0.4)).toBe(0);
    expect(Object.is(whole(-0.4), -0)).toBe(false);
    expect(signedWhole(-0.4)).toBe('0');
    expect(groupedWhole(-0.4)).toBe('0');
  });

  it('uses U+2212 for negatives, grouping thousands only when asked', () => {
    expect(signedWhole(-1320.4)).toBe('−1320');
    expect(groupedWhole(-1320.4)).toBe('−1,320');
    expect(groupedWhole(1234567)).toBe('1,234,567');
    expect(fixed(-4.25, 1)).toBe('−4.3');
    expect(fixed(-0.04, 1)).toBe('0.0');
  });

  it('is what the flight-data strip formats fuel with', () => {
    expect(formatFuel(1234.6, 'kg')).toBe(`${groupedWhole(1234.6)} kg`);
  });
});
