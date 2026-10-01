import {
  normalizeDegrees,
  roundAltitude,
  roundVerticalSpeed,
  standardRateFraction,
} from '@/domain/instruments/geometry';

/**
 * One instrument's state, in precedence order (spec: "Values and states"). Both presentations
 * build their accessible labels here, so switching loses a screen-reader user nothing (R3).
 */
export type InstrumentStatus = 'unavailable' | 'noValue' | 'live' | 'notLive';

export function instrumentStatus(
  missing: boolean,
  hasValue: boolean,
  current: boolean,
): InstrumentStatus {
  if (missing) {
    return 'unavailable';
  }
  if (!hasValue) {
    return 'noValue';
  }
  return current ? 'live' : 'notLive';
}

export function withStatus(name: string, status: InstrumentStatus, describe: () => string): string {
  switch (status) {
    case 'unavailable':
      return `${name}: not available on this aircraft`;
    case 'noValue':
      return `${name}: no value`;
    case 'live':
      return describe();
    case 'notLive':
      return `${describe()}, not live`;
  }
}

export function groupThousands(value: number): string {
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return value < 0 ? `-${digits}` : digits;
}

const MACH_SHOWN_FROM = 0.4;
const RADIO_ALTITUDE_SHOWN_TO_FT = 2500;

export function machShown(mach: number | null): mach is number {
  return mach !== null && mach >= MACH_SHOWN_FROM;
}

export function radioAltitudeShown(feet: number | null): feet is number {
  return feet !== null && feet >= 0 && feet <= RADIO_ALTITUDE_SHOWN_TO_FT;
}

const degrees = (n: number): string => (n === 1 ? '1 degree' : `${n} degrees`);

export function describeAirspeed(knots: number, mach: number | null): string {
  const speed = `Airspeed ${groupThousands(Math.round(knots))} knots`;
  return machShown(mach) ? `${speed}, Mach ${mach.toFixed(2)}` : speed;
}

export function describeAttitude(pitch: number, roll: number): string {
  const p = Math.round(pitch);
  const r = Math.round(roll);
  const pitchWords =
    p === 0 ? 'pitch level' : `pitch ${degrees(Math.abs(p))} ${p > 0 ? 'up' : 'down'}`;
  const bankWords =
    r === 0 ? 'wings level' : `bank ${degrees(Math.abs(r))} ${r > 0 ? 'right' : 'left'}`;
  return `Attitude: ${pitchWords}, ${bankWords}`;
}

export function describeAltitude(
  feet: number,
  baroWords: string | null,
  radioAltitude: number | null,
): string {
  const parts = [`Altitude ${groupThousands(roundAltitude(feet))} feet`];
  if (baroWords !== null) {
    parts.push(`altimeter ${baroWords}`);
  }
  if (radioAltitudeShown(radioAltitude)) {
    parts.push(`radio altitude ${groupThousands(Math.round(radioAltitude))} feet`);
  }
  return parts.join(', ');
}

export function describeVerticalSpeed(fpm: number): string {
  const rounded = roundVerticalSpeed(fpm);
  if (rounded === 0) {
    return 'Vertical speed level';
  }
  const direction = rounded > 0 ? 'climbing' : 'descending';
  return `Vertical speed ${direction} ${groupThousands(Math.abs(rounded))} feet per minute`;
}

export function describeHeading(heading: number): string {
  const whole = Math.round(normalizeDegrees(heading)) % 360;
  return `Heading ${whole === 0 ? 360 : whole} degrees`;
}

/** Either part may be absent (its DataRef missing or not yet received); never both. */
export function describeTurn(deflection: number | null, slip: number | null): string {
  const parts: string[] = [];
  if (deflection !== null) {
    const fraction = standardRateFraction(deflection);
    const tenths = Math.round(Math.abs(fraction) * 10) / 10;
    parts.push(
      tenths === 0
        ? 'no turn'
        : `rate ${tenths.toFixed(1)} standard rate ${fraction > 0 ? 'right' : 'left'}`,
    );
  }
  if (slip !== null) {
    const ball = Math.round(slip);
    parts.push(
      ball === 0
        ? 'ball centred'
        : `ball ${degrees(Math.abs(ball))} ${ball > 0 ? 'right' : 'left'}`,
    );
  }
  return `Turn: ${parts.join(', ')}`;
}
