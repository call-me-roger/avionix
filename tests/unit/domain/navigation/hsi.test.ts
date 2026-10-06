import {
  DEV_PEG_DOTS,
  bearingPointer,
  deviationDots,
  dmeText,
  dmeTimeText,
  formatDme,
  glideslopeState,
  lateralValid,
  markerLit,
  sourceKind,
  sourceLabel,
  toFromWord,
} from '@/domain/navigation/hsi';

describe('deviationDots', () => {
  it('passes an on-scale value through', () => {
    expect(deviationDots(1.2)).toEqual({ dots: 1.2, pegged: false });
    expect(deviationDots(-0.4)).toEqual({ dots: -0.4, pegged: false });
  });
  it('pegs beyond 2.5 dots each side', () => {
    expect(deviationDots(4)).toEqual({ dots: DEV_PEG_DOTS, pegged: true });
    expect(deviationDots(-9)).toEqual({ dots: -DEV_PEG_DOTS, pegged: true });
  });
  it('is exactly on the peg without pegging', () => {
    expect(deviationDots(2.5)).toEqual({ dots: 2.5, pegged: false });
  });
  it('has no value without a reading', () => {
    expect(deviationDots(null)).toBeNull();
    expect(deviationDots(Number.NaN)).toBeNull();
  });
});

describe('lateralValid', () => {
  it('needs TO or FROM and a horizontal signal', () => {
    expect(lateralValid(1, 1)).toBe(true);
    expect(lateralValid(2, 1)).toBe(true);
  });
  it('is invalid on the flag, without a signal, or without values', () => {
    expect(lateralValid(0, 1)).toBe(false);
    expect(lateralValid(1, 0)).toBe(false);
    expect(lateralValid(null, 1)).toBe(false);
    expect(lateralValid(1, null)).toBe(false);
  });
});

describe('glideslopeState', () => {
  it('is valid with a vertical signal and no flag', () => {
    expect(glideslopeState(1, 0)).toBe('valid');
    expect(glideslopeState(1, null)).toBe('valid');
  });
  it('is flagged when a glideslope is expected but not received', () => {
    expect(glideslopeState(0, 1)).toBe('flagged');
    expect(glideslopeState(1, 1)).toBe('flagged');
  });
  it('is none on a VOR or without values', () => {
    expect(glideslopeState(0, 0)).toBe('none');
    expect(glideslopeState(null, null)).toBe('none');
  });
});

describe('words and sources', () => {
  it('names TO and FROM, and nothing on the flag', () => {
    expect(toFromWord(1)).toBe('TO');
    expect(toFromWord(2)).toBe('FROM');
    expect(toFromWord(0)).toBeNull();
    expect(toFromWord(null)).toBeNull();
  });
  it('names the four sources and nothing else', () => {
    expect([0, 1, 2, 3].map(sourceLabel)).toEqual(['NAV1', 'NAV2', 'GPS', 'GPS2']);
    expect(sourceLabel(7)).toBeNull();
    expect(sourceLabel(null)).toBeNull();
  });
  it('splits radio and GPS sources', () => {
    expect([0, 1, 2, 3].map(sourceKind)).toEqual(['nav', 'nav', 'gps', 'gps']);
    expect(sourceKind(null)).toBeNull();
  });
});

describe('bearingPointer', () => {
  it('points only with a signal', () => {
    expect(bearingPointer(268, 1)).toBe(268);
    expect(bearingPointer(268, 0)).toBeNull();
    expect(bearingPointer(null, 1)).toBeNull();
  });
  it('normalises into 0–360', () => {
    expect(bearingPointer(-90, 1)).toBe(270);
    expect(bearingPointer(360, 1)).toBe(0);
  });
});

describe('DME', () => {
  it('formats tenths in the chosen unit', () => {
    expect(formatDme(12.44, 'nm')).toBe('12.4 nm');
  });
  it('shows only while the DME flag is set', () => {
    expect(dmeText(1, 12.4, 'nm')).toBe('12.4 nm');
    expect(dmeText(0, 12.4, 'nm')).toBeNull();
    expect(dmeText(1, null, 'nm')).toBeNull();
    expect(dmeText(1, -1, 'nm')).toBeNull();
  });
  it('rounds the time to whole minutes', () => {
    expect(dmeTimeText(6.6)).toBe('7 MIN');
    expect(dmeTimeText(null)).toBeNull();
    expect(dmeTimeText(-1)).toBeNull();
  });
});

describe('markerLit', () => {
  it('prefers inner over middle over outer', () => {
    expect(markerLit(1, 1, 1)).toBe('inner');
    expect(markerLit(1, 1, 0)).toBe('middle');
    expect(markerLit(1, 0, 0)).toBe('outer');
    expect(markerLit(0, 0, 0)).toBeNull();
    expect(markerLit(null, null, null)).toBeNull();
  });
});
