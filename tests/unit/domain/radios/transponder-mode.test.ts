import { MODE_POSITIONS, modeLabel } from '@/domain/radios/transponder-mode';

describe('transponder modes', () => {
  it('offers the four positions in panel order', () => {
    expect(MODE_POSITIONS.map((position) => [position.value, position.label])).toEqual([
      [0, 'OFF'],
      [1, 'STBY'],
      [2, 'ON'],
      [3, 'ALT'],
    ]);
  });

  it('labels every reported mode, and nothing it does not know', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(modeLabel)).toEqual([
      'OFF',
      'STBY',
      'ON',
      'ALT',
      'TEST',
      'GND',
      'TA ONLY',
      'TA/RA',
    ]);
    expect(modeLabel(8)).toBeNull();
    expect(modeLabel(-1)).toBeNull();
    expect(modeLabel(2.5)).toBeNull();
    expect(modeLabel(null)).toBeNull();
  });
});
