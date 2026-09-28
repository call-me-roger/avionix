/**
 * The one place unit conversions live (F-11 R2). The moving map (F-13) and the flight recorder
 * (F-14) read the same preference and convert through these functions, so no two screens can
 * disagree about a number. Fuel is mass only: litres and gallons need a density the Web API does
 * not provide.
 */
export const FUEL_UNITS = ['kg', 'lb'] as const;
export const TEMPERATURE_UNITS = ['C', 'F'] as const;
export const DISTANCE_UNITS = ['nm', 'km'] as const;

export type FuelUnit = (typeof FUEL_UNITS)[number];
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export interface UnitPreferences {
  fuel: FuelUnit;
  temperature: TemperatureUnit;
  distance: DistanceUnit;
}

export const DEFAULT_UNITS: UnitPreferences = { fuel: 'kg', temperature: 'C', distance: 'nm' };

/** Exact by definition (international avoirdupois pound). */
export const KG_PER_LB = 0.45359237;
/** Exact by definition (international nautical mile). */
export const KM_PER_NM = 1.852;

export function convertFuel(kg: number, unit: FuelUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function convertTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === 'C' ? celsius : (celsius * 9) / 5 + 32;
}

export function convertDistance(nm: number, unit: DistanceUnit): number {
  return unit === 'nm' ? nm : nm * KM_PER_NM;
}

export const UNIT_LABEL = {
  fuel: { kg: 'kg', lb: 'lb' } as Record<FuelUnit, string>,
  temperature: { C: '°C', F: '°F' } as Record<TemperatureUnit, string>,
  distance: { nm: 'nm', km: 'km' } as Record<DistanceUnit, string>,
};
