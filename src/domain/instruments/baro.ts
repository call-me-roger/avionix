import type { PressureUnit } from '@/domain/units/units';

/** Hectopascals per inch of mercury (at 0 °C, the altimetry convention). */
export const HPA_PER_INHG = 33.8639;

/** Standard pressure. STD writes this to the one verified barometer DataRef (spec: "Standard pressure"). */
export const STD_INHG = 29.92;

const STD_TOLERANCE_INHG = 0.005;
// Floating-point slack, so 29.925 and 29.915 count as standard.
const EPSILON = 1e-9;

/** The Kollsman window's span, the same in both units. */
export const BARO_RANGE: Record<PressureUnit, { min: number; max: number }> = {
  inHg: { min: 28, max: 31.5 },
  hPa: { min: 948, max: 1067 },
};

export function isStandard(inHg: number): boolean {
  return Math.abs(inHg - STD_INHG) <= STD_TOLERANCE_INHG + EPSILON;
}

export function toInHg(value: number, unit: PressureUnit): number {
  return unit === 'inHg' ? value : value / HPA_PER_INHG;
}

/** The setting as the pilot reads it: hundredths of an inch, or whole hectopascals. */
export function baroValue(inHg: number, unit: PressureUnit): number {
  return unit === 'inHg' ? Math.round(inHg * 100) / 100 : Math.round(inHg * HPA_PER_INHG);
}

/** The number alone, for the altimeter's Kollsman window. */
export function baroShort(inHg: number, unit: PressureUnit): string {
  return unit === 'inHg' ? baroValue(inHg, unit).toFixed(2) : String(baroValue(inHg, unit));
}

export function formatBaro(inHg: number, unit: PressureUnit): string {
  return `${baroShort(inHg, unit)} ${unit}${isStandard(inHg) ? ' STD' : ''}`;
}

export function baroWords(inHg: number, unit: PressureUnit): string {
  const words =
    unit === 'inHg' ? `${baroShort(inHg, unit)} inches` : `${baroShort(inHg, unit)} hectopascals`;
  return isStandard(inHg) ? `${words}, standard` : words;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * One −/+ press, from the read-back setting (never a typed or previous value). In hectopascals the
 * current value is first rounded to a whole hectopascal, so repeated presses land on whole ones.
 * Returns inches of mercury, the DataRef's unit.
 */
export function baroStep(currentInHg: number, unit: PressureUnit, direction: 1 | -1): number {
  const range = BARO_RANGE[unit];
  if (unit === 'inHg') {
    const next = Math.round(currentInHg * 100) + direction;
    return clamp(next / 100, range.min, range.max);
  }
  const next = clamp(Math.round(currentInHg * HPA_PER_INHG) + direction, range.min, range.max);
  return next / HPA_PER_INHG;
}
