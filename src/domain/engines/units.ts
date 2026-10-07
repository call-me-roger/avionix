import type { GaugeId, GaugeSpec } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { type TemperatureUnit, type UnitPreferences, convertFuel } from '@/domain/units/units';

/** Exact: 1 N·m = 0.737562 ft-lb (to six figures). */
export const NM_TO_FT_LB = 0.737562;
export const RAD_S_TO_RPM = 60 / (2 * Math.PI);
const SECONDS_PER_HOUR = 3600;

export const MINUS = '−';

/**
 * A raw value in the unit the aircraft's markings use and the panel computes in: torque in ft-lb
 * (Laminar's TRQ markings are ft-lb), fuel flow in kg per hour; everything else as X-Plane reports
 * it, temperatures still in their source unit.
 */
export function instrumentValue(id: GaugeId, raw: number): number {
  if (id === 'trq') {
    return raw * NM_TO_FT_LB;
  }
  if (id === 'ff') {
    return raw * SECONDS_PER_HOUR;
  }
  return raw;
}

/** A Laminar redline in rad/s as rev/min; null when missing or not positive. */
export function redlineRpm(radPerSecond: number | null): number | null {
  return radPerSecond === null || radPerSecond <= 0 ? null : radPerSecond * RAD_S_TO_RPM;
}

/**
 * The unit a temperature arrives in (spec §4.4). `unknown`: the aircraft does not publish the
 * flag (the probe found it missing), so the value is shown as reported. `pending`: the flag has
 * not been checked yet, or resolved but its value has not arrived. Null for a gauge that is not a
 * temperature.
 */
export type TemperatureSource = 'C' | 'F' | 'unknown' | 'pending';

export function temperatureSource(
  spec: GaugeSpec,
  reader: Pick<EngineReader, 'has' | 'missing' | 'number'>,
): TemperatureSource | null {
  if (spec.temperature === null) {
    return null;
  }
  if (spec.temperature.kind === 'celsius') {
    return 'C';
  }
  if (reader.missing(spec.temperature.name)) {
    return 'unknown';
  }
  if (!reader.has(spec.temperature.name)) {
    return 'pending';
  }
  const flag = reader.number(spec.temperature.name);
  if (flag === null) {
    return 'pending';
  }
  return flag >= 0.5 ? 'C' : 'F';
}

export function convertTemperatureFrom(
  value: number,
  from: 'C' | 'F',
  to: TemperatureUnit,
): number {
  if (from === to) {
    return value;
  }
  return from === 'C' ? (value * 9) / 5 + 32 : ((value - 32) * 5) / 9;
}

/** A difference of temperatures (ΔPEAK): scaled, never offset. */
export function convertTemperatureDelta(
  delta: number,
  from: 'C' | 'F',
  to: TemperatureUnit,
): number {
  if (from === to) {
    return delta;
  }
  return from === 'C' ? (delta * 9) / 5 : (delta * 5) / 9;
}

/** Rounded to whole, thousands grouped without Intl (its availability differs between Hermes builds). */
export function groupedWhole(value: number): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `${MINUS}${digits}` : digits;
}

/** Whole, with U+2212 for negatives and no sign for zero. */
export function signedWhole(value: number): string {
  return groupedWhole(value === 0 ? 0 : value);
}

/** `digits` decimals, U+2212 for negatives (and no sign when it rounds to zero). */
export function fixed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}

function displayTemperature(
  value: number,
  units: UnitPreferences,
  source: TemperatureSource | null,
): number | null {
  if (source === 'pending') {
    return null;
  }
  if (source === 'C' || source === 'F') {
    return convertTemperatureFrom(value, source, units.temperature);
  }
  return value;
}

/** Spec §4.3. `value` is the instrument value (`instrumentValue`). `—` while a unit is pending. */
export function formatGauge(
  id: GaugeId,
  value: number,
  units: UnitPreferences,
  source: TemperatureSource | null,
): string {
  switch (id) {
    case 'rpm':
    case 'prop':
    case 'trq':
      return groupedWhole(Math.round(value / 10) * 10);
    case 'map':
    case 'n1':
    case 'n2':
      return fixed(value, 1);
    case 'epr':
      return fixed(value, 2);
    case 'egt':
    case 'cht':
    case 'itt':
    case 'oilT': {
      const shown = displayTemperature(value, units, source);
      return shown === null ? '—' : signedWhole(shown);
    }
    case 'ff': {
      const perHour = convertFuel(value, units.fuel);
      // Decided on the value as one decimal would show it, so 99.96 reads "100", never "100.0".
      return Math.round(perHour * 10) / 10 < 100 ? fixed(perHour, 1) : groupedWhole(perHour);
    }
    case 'oilP':
      return signedWhole(value);
  }
}

export interface UnitLabel {
  /** Once per row, after the legend: `EGT °F`. Empty when the legend says it all. */
  label: string;
  spoken: string;
}

const NO_UNIT: UnitLabel = { label: '', spoken: '' };

export function gaugeUnit(
  id: GaugeId,
  units: UnitPreferences,
  source: TemperatureSource | null,
): UnitLabel {
  switch (id) {
    case 'rpm':
    case 'prop':
    case 'epr':
      return NO_UNIT;
    case 'map':
      return { label: 'IN', spoken: 'inches' };
    case 'trq':
      return { label: 'FT-LB', spoken: 'foot-pounds' };
    case 'n1':
    case 'n2':
      return { label: '%', spoken: 'percent' };
    case 'ff':
      return units.fuel === 'kg'
        ? { label: 'KG/H', spoken: 'kilograms per hour' }
        : { label: 'LB/H', spoken: 'pounds per hour' };
    case 'oilP':
      return { label: 'PSI', spoken: 'psi' };
    case 'egt':
    case 'cht':
    case 'itt':
    case 'oilT':
      if (source === 'unknown') {
        return { label: '°', spoken: 'degrees, unit unknown' };
      }
      return units.temperature === 'C'
        ? { label: '°C', spoken: 'degrees Celsius' }
        : { label: '°F', spoken: 'degrees Fahrenheit' };
  }
}
