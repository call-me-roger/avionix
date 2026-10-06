/**
 * F-10's drawing maths, free of React and SVG so every limit is unit-tested. Angles are degrees
 * clockwise from twelve o'clock; y grows downwards, as in SVG. Nothing here smooths or predicts a
 * value: each function maps the one sample it is given (spec: "No smoothing").
 */

export interface Point {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** [0, 360), with −0 folded to 0. */
export function normalizeDegrees(deg: number): number {
  const turned = ((deg % 360) + 360) % 360;
  return turned === 0 ? 0 : turned;
}

export function polar(cx: number, cy: number, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

const fixed = (n: number): string => n.toFixed(2);

export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const start = polar(cx, cy, r, fromDeg);
  const end = polar(cx, cy, r, toDeg);
  const sweep = toDeg - fromDeg;
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  const clockwise = sweep >= 0 ? 1 : 0;
  return `M ${fixed(start.x)} ${fixed(start.y)} A ${r} ${r} 0 ${large} ${clockwise} ${fixed(end.x)} ${fixed(end.y)}`;
}

export interface ScaleTick {
  value: number;
  major: boolean;
}

/** Counted in steps rather than summed, so no floating-point drift reaches the last tick. */
export function scaleTicks(min: number, max: number, minor: number, major: number): ScaleTick[] {
  const count = Math.round((max - min) / minor);
  const ticks: ScaleTick[] = [];
  for (let i = 0; i <= count; i += 1) {
    const value = min + i * minor;
    ticks.push({ value, major: value % major === 0 });
  }
  return ticks;
}

// ── Airspeed ────────────────────────────────────────────────────────────────

export const AIRSPEED_SWEEP_DEG = 320;
const DEFAULT_AIRSPEED_DIAL_MAX = 200;

/** The next multiple of 20 kt at or above Vne + 10%; 200 kt when the aircraft publishes no Vne. */
export function airspeedDialMax(vne: number | null): number {
  if (vne === null) {
    return DEFAULT_AIRSPEED_DIAL_MAX;
  }
  // × 11 / 10 rather than × 1.1: 200 × 1.1 is 220.00000000000003, which would round up to 240.
  return Math.max(20, Math.ceil((vne * 11) / 10 / 20) * 20);
}

/** A needle beyond either stop pegs there; the digital window shows the true value. */
export function airspeedAngle(knots: number, dialMax: number): number {
  return (clamp(knots, 0, dialMax) / dialMax) * AIRSPEED_SWEEP_DEG;
}

// ── Altitude ────────────────────────────────────────────────────────────────

export function altimeterHands(feet: number): { hundredsDeg: number; thousandsDeg: number } {
  return {
    hundredsDeg: normalizeDegrees((feet / 1000) * 360),
    thousandsDeg: normalizeDegrees((feet / 10000) * 360),
  };
}

/** Digital altitude to the nearest 10 ft, as the accessible label reads it. */
export function roundAltitude(feet: number): number {
  const rounded = Math.round(feet / 10) * 10;
  return rounded === 0 ? 0 : rounded;
}

// ── Vertical speed ──────────────────────────────────────────────────────────

export const VSI_LIMIT_FPM = 2000;
const VSI_DIAL_SWEEP_DEG = 170;

/** Zero at nine o'clock; climb turns the needle up (clockwise), descent down. */
export function vsiAngle(fpm: number): number {
  return -90 + (clamp(fpm, -VSI_LIMIT_FPM, VSI_LIMIT_FPM) / VSI_LIMIT_FPM) * VSI_DIAL_SWEEP_DEG;
}

/** The PFD scale's pointer offset above the centre line, pegged at ±2,000 ft/min. */
export function vsiScaleOffset(fpm: number, halfHeight: number): number {
  return (clamp(fpm, -VSI_LIMIT_FPM, VSI_LIMIT_FPM) / VSI_LIMIT_FPM) * halfHeight;
}

/** Hundreds of ft/min with a sign, blank under 100 ft/min (the PFD's narrow scale). */
export function vsiHundreds(fpm: number): string {
  const hundreds = Math.round(fpm / 100);
  if (hundreds === 0) {
    return '';
  }
  return hundreds > 0 ? `+${hundreds}` : `-${Math.abs(hundreds)}`;
}

export function roundVerticalSpeed(fpm: number): number {
  const rounded = Math.round(fpm / 10) * 10;
  return rounded === 0 ? 0 : rounded;
}

// ── Heading ─────────────────────────────────────────────────────────────────

export function headingCardRotation(heading: number): number {
  const rotation = -normalizeDegrees(heading);
  return rotation === 0 ? 0 : rotation;
}

/** Three digits, and north as 360 as pilots say it. */
export function headingText(heading: number): string {
  const whole = Math.round(normalizeDegrees(heading)) % 360;
  return whole === 0 ? '360' : String(whole).padStart(3, '0');
}

// ── Attitude ────────────────────────────────────────────────────────────────

export const BANK_MARKS: readonly number[] = [10, 20, 30, 45, 60];

/**
 * Rotate by −roll about the centre, then move the horizon down by pitch (pitch up shows more sky).
 * Pitch is drawn to ±90°; roll is unrestricted.
 */
export function attitudeTransform(
  pitch: number,
  roll: number,
  pxPerDeg: number,
): { rotateDeg: number; translateY: number } {
  const rotateDeg = roll === 0 ? 0 : -roll;
  return { rotateDeg, translateY: clamp(pitch, -90, 90) * pxPerDeg };
}

export interface LadderMark {
  deg: number;
  major: boolean;
}

/** Every 5° from −90 to 90 within the visible window (plus one step), never the horizon itself. */
export function pitchLadder(pitch: number, windowDeg: number): LadderMark[] {
  const centre = clamp(pitch, -90, 90);
  const marks: LadderMark[] = [];
  for (let deg = -90; deg <= 90; deg += 5) {
    if (deg !== 0 && Math.abs(deg - centre) <= windowDeg + 5) {
      marks.push({ deg, major: deg % 10 === 0 });
    }
  }
  return marks;
}

// ── Turn and slip ───────────────────────────────────────────────────────────

/**
 * The deflection X-Plane reports for a standard-rate (3°/s) turn. Undocumented: an assumption
 * checked on the device (spec: "Open questions"). If X-Plane disagrees, only this changes.
 */
export const STANDARD_RATE_DEFLECTION_DEG = 20;
const TURN_LIMIT_DEG = 45;
const SLIP_LIMIT_DEG = 10;

export function turnDeflection(deflection: number): number {
  return clamp(deflection, -TURN_LIMIT_DEG, TURN_LIMIT_DEG);
}

export function standardRateFraction(deflection: number): number {
  return deflection / STANDARD_RATE_DEFLECTION_DEG;
}

/** Positive slip puts the ball right (assumed; checked on the device). */
export function slipOffset(slipDeg: number, halfTravel: number): number {
  return (clamp(slipDeg, -SLIP_LIMIT_DEG, SLIP_LIMIT_DEG) / SLIP_LIMIT_DEG) * halfTravel;
}

// ── Tapes ───────────────────────────────────────────────────────────────────

export interface TapeTick {
  value: number;
  /** value − current, in the tape's units; the component multiplies by its scale. */
  offset: number;
  labelled: boolean;
}

export function tapeTicks(
  value: number,
  halfWindow: number,
  minorStep: number,
  labelStep: number,
  floor = Number.NEGATIVE_INFINITY,
): TapeTick[] {
  const first = Math.ceil((value - halfWindow) / minorStep);
  const last = Math.floor((value + halfWindow) / minorStep);
  const ticks: TapeTick[] = [];
  for (let step = first; step <= last; step += 1) {
    const tickValue = step * minorStep === 0 ? 0 : step * minorStep;
    if (tickValue < floor) {
      continue;
    }
    ticks.push({
      value: tickValue,
      offset: tickValue - value,
      labelled: tickValue % labelStep === 0,
    });
  }
  return ticks;
}

/** The heading tape: ticks every 5°, wrapped into [0, 360) while their offsets stay continuous. */
export function headingTicks(heading: number, halfWindow: number): TapeTick[] {
  const current = normalizeDegrees(heading);
  return tapeTicks(current, halfWindow, 5, 10).map((tick) => ({
    ...tick,
    value: normalizeDegrees(tick.value),
  }));
}

const CARDINALS: Readonly<Record<number, string>> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

/** Compass-card style: N, E, S, W, else tens of degrees ("3" is 030, "12" is 120). */
export function headingTickLabel(value: number): string {
  const deg = normalizeDegrees(value);
  return CARDINALS[deg] ?? String(Math.round(deg / 10));
}

// ── Layout ──────────────────────────────────────────────────────────────────

export const PFD_VIEW = { width: 360, height: 300 } as const;
/** Instruments take at most this share of the window height, keeping the altimeter controls near. */
const HEIGHT_SHARE = 0.7;

/**
 * `reservedHeight` (dp) is drawn above the PFD within the same height share, such as the FMA, so
 * the two together still leave the altimeter controls near.
 */
export function pfdWidth(contentWidth: number, windowHeight: number, reservedHeight = 0): number {
  const byHeight =
    ((windowHeight * HEIGHT_SHARE - reservedHeight) * PFD_VIEW.width) / PFD_VIEW.height;
  return Math.max(0, Math.min(contentWidth, byHeight));
}

/** Portrait 2 × 3, landscape the classic 3 × 2. */
export function sixPackLayout(
  contentWidth: number,
  windowHeight: number,
  landscape: boolean,
  gap: number,
): { columns: number; size: number } {
  const columns = landscape ? 3 : 2;
  const rows = landscape ? 2 : 3;
  const byWidth = (contentWidth - gap * (columns - 1)) / columns;
  const byHeight = (windowHeight * HEIGHT_SHARE - gap * (rows - 1)) / rows;
  return { columns, size: Math.max(0, Math.floor(Math.min(byWidth, byHeight))) };
}
