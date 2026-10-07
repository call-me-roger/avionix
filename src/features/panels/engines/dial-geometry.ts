/**
 * The engine dial's arc (spec §4.10): 240° clockwise from lower left, through the top, to lower
 * right, the shape of the G1000's and the CGR-30's tach. SVG angles: 0° points right and y grows
 * downwards, so 150° is lower left and 30° (390°) lower right.
 */
export const DIAL_START_DEG = 150;
export const DIAL_SWEEP_DEG = 240;

export interface Point {
  x: number;
  y: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function dialPoint(cx: number, cy: number, r: number, fraction: number): Point {
  const radians = ((DIAL_START_DEG + DIAL_SWEEP_DEG * fraction) * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

/** An SVG path along the dial from `from` to `to` (fractions of the sweep). */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const start = dialPoint(cx, cy, r, from);
  const end = dialPoint(cx, cy, r, to);
  const large = DIAL_SWEEP_DEG * (to - from) > 180 ? 1 : 0;
  return `M ${round(start.x)} ${round(start.y)} A ${r} ${r} 0 ${large} 1 ${round(end.x)} ${round(end.y)}`;
}

/** The arc ends 30° below the centre, so the dial needs three quarters of its width. */
export function dialHeight(size: number): number {
  return Math.round(size * 0.75);
}
