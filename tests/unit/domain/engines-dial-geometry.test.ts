import { arcPath, dialHeight, dialPoint } from '@/features/panels/engines/dial-geometry';

describe('dial geometry', () => {
  it('runs 240° clockwise from lower left (150°) through the top to lower right (30°)', () => {
    const start = dialPoint(50, 50, 40, 0);
    expect(start.x).toBeCloseTo(15.36, 2);
    expect(start.y).toBeCloseTo(70, 6);
    const top = dialPoint(50, 50, 40, 0.5);
    expect(top.x).toBeCloseTo(50, 6);
    expect(top.y).toBeCloseTo(10, 6);
    const end = dialPoint(50, 50, 40, 1);
    expect(end.x).toBeCloseTo(84.64, 2);
    expect(end.y).toBeCloseTo(70, 6);
  });

  it('draws an SVG arc, flagging the large arc past 180°', () => {
    expect(arcPath(50, 50, 40, 0, 1)).toBe('M 15.36 70 A 40 40 0 1 1 84.64 70');
    expect(arcPath(50, 50, 40, 0, 0.5)).toBe('M 15.36 70 A 40 40 0 0 1 50 10');
  });

  it('is three quarters as tall as it is wide', () => {
    expect(dialHeight(180)).toBe(135);
    expect(dialHeight(81)).toBe(61);
  });
});
