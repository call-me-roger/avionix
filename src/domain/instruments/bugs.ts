/**
 * Where an autopilot target sits on a PFD scale (spec section 7). Pure, so the parking edges, the
 * 360/0 wrap and a descent are tested without drawing anything.
 */

/** A target on a linear scale, in view units from the centre line; parked at the edge beyond it. */
export function tapeBug(
  target: number,
  current: number,
  unitsPerValue: number,
  halfSpan: number,
): { offset: number; parked: boolean } {
  const raw = (target - current) * unitsPerValue;
  if (raw > halfSpan) {
    return { offset: halfSpan, parked: true };
  }
  if (raw < -halfSpan) {
    return { offset: -halfSpan, parked: true };
  }
  return { offset: raw, parked: false };
}

/** The signed short way from the current heading to the target, in −180 < d ≤ 180. */
export function headingDelta(target: number, current: number): number {
  const delta = ((((target - current) % 360) + 540) % 360) - 180;
  // −180 is the same bearing as 180. The + 540 keeps the remainder positive, so no −0 reaches here.
  return delta === -180 ? 180 : delta;
}
