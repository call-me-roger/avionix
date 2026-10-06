import { cardAngle, deviationOffset } from '@/domain/navigation/hsi-geometry';

describe('cardAngle', () => {
  it('is zero when the target matches the heading', () => {
    expect(cardAngle(270, 270)).toBe(0);
  });
  it('takes the short way across the 0/360 wrap', () => {
    expect(cardAngle(5, 355)).toBe(10);
  });
  it('is 180 at the reciprocal', () => {
    expect(cardAngle(180, 0)).toBe(180);
    expect(cardAngle(90, 270)).toBe(180);
  });
});

describe('deviationOffset', () => {
  it('scales dots by pixels per dot', () => {
    expect(deviationOffset(-1.5, 20)).toBe(-30);
  });
});
