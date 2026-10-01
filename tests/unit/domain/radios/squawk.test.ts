import { formatSquawk, isEmergencySquawk, isSquawk, squawkMeaning } from '@/domain/radios/squawk';

describe('squawk codes', () => {
  it('accepts four octal digits only', () => {
    expect(isSquawk(7000)).toBe(true);
    expect(isSquawk(0)).toBe(true);
    expect(isSquawk(7777)).toBe(true);
    expect(isSquawk(7800)).toBe(false);
    expect(isSquawk(1238)).toBe(false);
    expect(isSquawk(10_000)).toBe(false);
    expect(isSquawk(-1)).toBe(false);
    expect(isSquawk(12.5)).toBe(false);
  });

  it('keeps leading zeros', () => {
    expect(formatSquawk(400)).toBe('0400');
    expect(formatSquawk(0)).toBe('0000');
    expect(formatSquawk(7000)).toBe('7000');
  });

  it('names the three emergency codes and nothing else', () => {
    expect(squawkMeaning(7500)).toBe('unlawful interference');
    expect(squawkMeaning(7600)).toBe('radio failure');
    expect(squawkMeaning(7700)).toBe('emergency');
    expect(squawkMeaning(7000)).toBeNull();
    expect(isEmergencySquawk(7700)).toBe(true);
    expect(isEmergencySquawk(1200)).toBe(false);
  });
});
