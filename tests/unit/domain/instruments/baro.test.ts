import {
  BARO_RANGE,
  HPA_PER_INHG,
  STD_INHG,
  baroShort,
  baroStep,
  baroValue,
  baroWords,
  formatBaro,
  isStandard,
  toInHg,
} from '@/domain/instruments/baro';

describe('altimeter setting', () => {
  it('recognises standard pressure within half a hundredth', () => {
    expect(isStandard(STD_INHG)).toBe(true);
    expect(isStandard(29.925)).toBe(true);
    expect(isStandard(29.915)).toBe(true);
    expect(isStandard(29.93)).toBe(false);
    expect(isStandard(29.91)).toBe(false);
  });

  it('converts hectopascals to inches and back', () => {
    expect(toInHg(29.92, 'inHg')).toBe(29.92);
    expect(toInHg(1013, 'hPa')).toBeCloseTo(1013 / HPA_PER_INHG, 6);
    expect(baroValue(29.92, 'hPa')).toBe(1013);
    expect(baroValue(29.9234, 'inHg')).toBe(29.92);
  });

  it('formats the reading in the chosen unit, marking standard', () => {
    expect(formatBaro(29.92, 'inHg')).toBe('29.92 inHg STD');
    expect(formatBaro(30.12, 'inHg')).toBe('30.12 inHg');
    expect(formatBaro(29.92, 'hPa')).toBe('1013 hPa STD');
    expect(formatBaro(1020 / HPA_PER_INHG, 'hPa')).toBe('1020 hPa');
    expect(baroShort(30.12, 'inHg')).toBe('30.12');
    expect(baroShort(1020 / HPA_PER_INHG, 'hPa')).toBe('1020');
  });

  it('words the reading for a screen reader', () => {
    expect(baroWords(30.12, 'inHg')).toBe('30.12 inches');
    expect(baroWords(29.92, 'inHg')).toBe('29.92 inches, standard');
    expect(baroWords(1020 / HPA_PER_INHG, 'hPa')).toBe('1020 hectopascals');
  });

  it('steps a hundredth of an inch from the read-back value', () => {
    expect(baroStep(29.92, 'inHg', 1)).toBe(29.93);
    expect(baroStep(29.92, 'inHg', -1)).toBe(29.91);
    // A read-back that is not on a hundredth steps from the nearest one.
    expect(baroStep(29.9234, 'inHg', 1)).toBe(29.93);
  });

  it('steps a whole hectopascal, landing on whole hectopascals', () => {
    const next = baroStep(29.92, 'hPa', 1);
    expect(next).toBeCloseTo(1014 / HPA_PER_INHG, 6);
    expect(baroValue(next, 'hPa')).toBe(1014);
    expect(baroValue(baroStep(next, 'hPa', -1), 'hPa')).toBe(1013);
  });

  it('never steps outside the range', () => {
    expect(baroStep(BARO_RANGE.inHg.max, 'inHg', 1)).toBe(BARO_RANGE.inHg.max);
    expect(baroStep(BARO_RANGE.inHg.min, 'inHg', -1)).toBe(BARO_RANGE.inHg.min);
    expect(baroValue(baroStep(BARO_RANGE.hPa.max / HPA_PER_INHG, 'hPa', 1), 'hPa')).toBe(
      BARO_RANGE.hPa.max,
    );
  });

  it('keeps the two ranges equivalent', () => {
    expect(Math.round(BARO_RANGE.inHg.min * HPA_PER_INHG)).toBe(BARO_RANGE.hPa.min);
    expect(Math.round(BARO_RANGE.inHg.max * HPA_PER_INHG)).toBe(BARO_RANGE.hPa.max);
  });
});
