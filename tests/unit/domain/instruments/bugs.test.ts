import { headingDelta, tapeBug } from '@/domain/instruments/bugs';

describe('tapeBug', () => {
  it('places an on-scale target by its distance from the current value', () => {
    expect(tapeBug(5_200, 5_000, 0.3, 120)).toEqual({ offset: 60, parked: false });
    expect(tapeBug(4_800, 5_000, 0.3, 120)).toEqual({ offset: -60, parked: false });
  });
  it('is on scale exactly at the edge', () => {
    expect(tapeBug(5_400, 5_000, 0.3, 120)).toEqual({ offset: 120, parked: false });
  });
  it('parks just beyond the edge', () => {
    expect(tapeBug(5_401, 5_000, 0.3, 120)).toEqual({ offset: 120, parked: true });
    expect(tapeBug(-2_000, 5_000, 0.3, 120)).toEqual({ offset: -120, parked: true });
  });
  it('handles a negative vertical speed', () => {
    expect(tapeBug(-500, 0, 0.096, 96)).toEqual({ offset: -48, parked: false });
  });
});

describe('headingDelta', () => {
  it('takes the short way across north', () => {
    expect(headingDelta(5, 355)).toBe(10);
    expect(headingDelta(355, 5)).toBe(-10);
  });
  it('gives 180 for the opposite heading', () => {
    expect(headingDelta(180, 0)).toBe(180);
  });
  it('treats 360 as 0', () => {
    expect(headingDelta(360, 0)).toBe(0);
  });
});
