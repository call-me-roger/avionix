import { groupedWhole } from '@/domain/units/numbers';
import { type DistanceUnit, UNIT_LABEL } from '@/domain/units/units';

const FEET_PER_METRE = 1 / 0.3048;

/** Whole degrees and minutes to hundredths, carried so 59.995′ never reads 60.00′. */
function parts(value: number): { degrees: number; minutes: string } {
  const hundredths = Math.round(Math.abs(value) * 6000);
  return {
    degrees: Math.floor(hundredths / 6000),
    minutes: ((hundredths % 6000) / 100).toFixed(2).padStart(5, '0'),
  };
}

function hemisphere(value: number, positive: string, negative: string): string {
  return value < 0 ? negative : positive;
}

export function formatPosition(lat: number, lon: number): string {
  const a = parts(lat);
  const b = parts(lon);
  return (
    `${hemisphere(lat, 'N', 'S')}${String(a.degrees).padStart(2, '0')}°${a.minutes}′ ` +
    `${hemisphere(lon, 'E', 'W')}${String(b.degrees).padStart(3, '0')}°${b.minutes}′`
  );
}

export function spokenPosition(lat: number, lon: number): string {
  const a = parts(lat);
  const b = parts(lon);
  return `${hemisphere(lat, 'N', 'S')} ${a.degrees} ${a.minutes}, ${hemisphere(lon, 'E', 'W')} ${b.degrees} ${b.minutes}`;
}

export function formatGpsAltitude(metres: number): string {
  return `${groupedWhole(metres * FEET_PER_METRE)} ft`;
}

export function rangeLabel(range: number, unit: DistanceUnit): string {
  return `${range} ${UNIT_LABEL.distance[unit]}`;
}

/** The unit as a screen reader should say it: "nm" could be read as nanometres. */
export const SPOKEN_UNIT: Record<DistanceUnit, string> = { nm: 'nautical mile', km: 'kilometre' };

export function spokenRange(range: number, unit: DistanceUnit): string {
  return `${range} ${SPOKEN_UNIT[unit]}${range === 1 ? '' : 's'}`;
}
