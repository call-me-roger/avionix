import { headingDelta } from '@/domain/instruments/bugs';

/** Card-relative angle of a course or bearing, the short way: −180 < a ≤ 180. */
export function cardAngle(target: number, heading: number): number {
  return headingDelta(target, heading);
}

export function deviationOffset(dots: number, pxPerDot: number): number {
  return dots * pxPerDot;
}
