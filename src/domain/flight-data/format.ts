import {
  type DistanceUnit,
  type FuelUnit,
  type TemperatureUnit,
  UNIT_LABEL,
  convertDistance,
  convertFuel,
  convertTemperature,
} from '@/domain/units/units';

/** A true minus sign: a hyphen is easy to miss on a small screen. */
export const MINUS = '−';

/** Rounds and drops the sign of a negative zero, so -0.4 reads "0", never "-0". */
function whole(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

function signed(value: number): string {
  const rounded = whole(value);
  return rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : String(rounded);
}

/** Thousands separators without Intl, whose availability differs between Hermes builds. */
function grouped(value: number): string {
  const rounded = whole(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `${MINUS}${digits}` : digits;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatSpeed(kt: number): string {
  return `${whole(kt)} kt`;
}

/** Three digits, 360 for north, as on a heading or course indicator. */
export function formatHeading(degrees: number): string {
  const normalised = ((whole(degrees) % 360) + 360) % 360;
  return `${String(normalised === 0 ? 360 : normalised).padStart(3, '0')}°`;
}

export const CALM_BELOW_KT = 1;

/** Wind is given as the direction it blows from, the meteorological convention. */
export function formatWind(fromDegrees: number, kt: number): string {
  return kt < CALM_BELOW_KT ? 'Calm' : `${formatHeading(fromDegrees)} / ${whole(kt)} kt`;
}

export function formatTemperature(celsius: number, unit: TemperatureUnit): string {
  return `${signed(convertTemperature(celsius, unit))} ${UNIT_LABEL.temperature[unit]}`;
}

export function formatFuel(kg: number, unit: FuelUnit): string {
  return `${grouped(convertFuel(kg, unit))} ${UNIT_LABEL.fuel[unit]}`;
}

/** Seconds since midnight (X-Plane's clock DataRefs) → HH:MM:SS. */
export function formatClock(secondsSinceMidnight: number): string {
  const total = ((Math.floor(secondsSinceMidnight) % 86400) + 86400) % 86400;
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
}

export function formatDistance(nm: number, unit: DistanceUnit): string {
  const value = convertDistance(nm, unit);
  const text = Math.abs(value) < 10 ? value.toFixed(1) : String(whole(value));
  return `${text} ${UNIT_LABEL.distance[unit]}`;
}

export const MAX_TIME_TO_GO_MIN = 99 * 60 + 59;

export function formatTimeToGo(minutes: number): string {
  if (minutes > MAX_TIME_TO_GO_MIN) {
    return 'more than 99 h';
  }
  const total = Math.max(0, whole(minutes));
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}
