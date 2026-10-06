import {
  COM_BAND_MESSAGE,
  NAV_BAND_MESSAGE,
  comRejection,
  formatCom,
  formatNav,
  isComChannel,
  isEightThirtyThreeOnly,
  isNavFrequency,
  navRejection,
  nearestComChannels,
} from '@/domain/radios/channels';

describe('COM channels', () => {
  const valid = [0, 5, 10, 15, 25, 30, 35, 40, 50, 55, 60, 65, 75, 80, 85, 90];
  it.each(Array.from({ length: 20 }, (_, i) => i * 5))(
    'ending %i is valid only when listed',
    (end) => {
      expect(isComChannel(121_400 + end)).toBe(valid.includes(end));
    },
  );

  it('rejects endings that are not multiples of 5', () => {
    expect(isComChannel(121_401)).toBe(false);
    expect(isComChannel(121_412.5)).toBe(false);
  });

  it('holds the band ends', () => {
    expect(isComChannel(117_995)).toBe(false);
    expect(isComChannel(118_000)).toBe(true);
    expect(isComChannel(136_990)).toBe(true);
    expect(isComChannel(136_995)).toBe(false);
    expect(isComChannel(137_000)).toBe(false);
  });

  it('tells 8.33-only channels from 25 kHz ones', () => {
    expect(isEightThirtyThreeOnly(118_005)).toBe(true);
    expect(isEightThirtyThreeOnly(118_025)).toBe(false);
    expect(isEightThirtyThreeOnly(118_020)).toBe(false);
  });

  it('formats three decimals', () => {
    expect(formatCom(121_500)).toBe('121.500');
    expect(formatCom(118_005)).toBe('118.005');
    expect(formatCom(136_990)).toBe('136.990');
  });

  it('finds the channels either side, inside the band', () => {
    expect(nearestComChannels(118_020)).toEqual([118_015, 118_025]);
    expect(nearestComChannels(118_001)).toEqual([118_000, 118_005]);
    expect(nearestComChannels(136_985)).toEqual([136_980, 136_990]);
  });

  it("explains a rejection in the pilot's words", () => {
    expect(comRejection(118_025)).toBeNull();
    expect(comRejection(118_020)).toBe(
      '118.020 is not a COM channel. Nearest: 118.015 or 118.025.',
    );
    expect(comRejection(117_995)).toBe(COM_BAND_MESSAGE);
    expect(comRejection(200_000)).toBe(COM_BAND_MESSAGE);
    expect(comRejection(Number.NaN)).toBe(COM_BAND_MESSAGE);
    expect(COM_BAND_MESSAGE).toBe('COM channels run from 118.000 to 136.990.');
  });
});

describe('NAV frequencies', () => {
  it('accepts 0.05 steps from 108.00 to 117.95', () => {
    expect(isNavFrequency(10_800)).toBe(true);
    expect(isNavFrequency(11_030)).toBe(true);
    expect(isNavFrequency(11_795)).toBe(true);
    expect(isNavFrequency(11_800)).toBe(false);
    expect(isNavFrequency(10_795)).toBe(false);
    expect(isNavFrequency(11_032)).toBe(false);
  });

  it('formats two decimals', () => {
    expect(formatNav(11_030)).toBe('110.30');
    expect(formatNav(10_800)).toBe('108.00');
  });

  it('explains a rejection', () => {
    expect(navRejection(11_030)).toBeNull();
    expect(navRejection(11_032)).toBe(NAV_BAND_MESSAGE);
    expect(navRejection(12_000)).toBe(NAV_BAND_MESSAGE);
    expect(NAV_BAND_MESSAGE).toBe('NAV frequencies run from 108.00 to 117.95 in 0.05 steps.');
  });
});
