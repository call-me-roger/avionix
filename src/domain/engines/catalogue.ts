import { ENGINES } from '@/domain/systems/controls';

/**
 * F-12's catalogue: every name the Engines panel reads (spec §3). Each is Laminar's, verified
 * against `DataRefs.txt`, and the three `_deg_cel` temperatures (12.0.8 and newer) against
 * Laminar's live DataRef database. The profile builds its features from this file and the panel
 * reads from it, so a name lives in one place only. Every name is a DataRef the panel only reads
 * (R9).
 */

export const FEATURE_ENGINE_GAUGES = 'engine-gauges';
export const FEATURE_ENGINE_MARKINGS = 'engine-markings';
export const FEATURE_FUEL_QUANTITY = 'fuel-quantity';
export const FEATURE_ELECTRICAL_MONITOR = 'electrical-monitor';

/** The Engines panel's features, in profile order. */
export const ENGINES_FEATURES: readonly string[] = [
  FEATURE_ENGINE_GAUGES,
  FEATURE_ENGINE_MARKINGS,
  FEATURE_FUEL_QUANTITY,
  FEATURE_ELECTRICAL_MONITOR,
];

export const ENGINE_CONFIG = {
  /** int; F-24 binds it too. */
  count: ENGINES.count,
  /** int[16]; the instruments and F-24 bind it too. */
  type: ENGINES.type,
  /** int: 1 when `EGT_deg_cel` reads in Celsius, 0 when in Fahrenheit. */
  egtIsCelsius: 'sim/aircraft/engine/acf_EGT_is_C',
  ittIsCelsius: 'sim/aircraft/engine/acf_ITT_is_C',
  oilTempIsCelsius: 'sim/aircraft/engine/acf_oilT_is_C',
  /** float, rad/s. */
  engineRedline: 'sim/aircraft/engine/acf_RSC_redline_eng',
  /** float, rad/s. */
  propRedline: 'sim/aircraft/controls/acf_RSC_redline_prp',
} as const;

export const GAUGE_IDS = [
  'rpm',
  'prop',
  'n1',
  'n2',
  'map',
  'trq',
  'epr',
  'egt',
  'cht',
  'itt',
  'ff',
  'oilP',
  'oilT',
] as const;
export type GaugeId = (typeof GAUGE_IDS)[number];

/** The `<x>` of `sim/aircraft/limits/{green,yellow,red}_{lo,hi}_<x>`, in Laminar's spelling. */
export const MARKING_KEYS = [
  'MP',
  'TRQ',
  'N1',
  'N2',
  'EPR',
  'ITT',
  'EGT',
  'CHT',
  'oilT',
  'oilP',
] as const;
export type MarkingKey = (typeof MARKING_KEYS)[number];

export const MARKING_COLOURS = ['green', 'yellow', 'red'] as const;
export type MarkingColour = (typeof MARKING_COLOURS)[number];

export const MARKING_EDGES = ['lo', 'hi'] as const;
export type MarkingEdge = (typeof MARKING_EDGES)[number];

export function markingName(colour: MarkingColour, edge: MarkingEdge, key: MarkingKey): string {
  return `sim/aircraft/limits/${colour}_${edge}_${key}`;
}

/** All 60, by instrument, then colour, then edge. */
export const MARKING_NAMES: readonly string[] = MARKING_KEYS.flatMap((key) =>
  MARKING_COLOURS.flatMap((colour) => MARKING_EDGES.map((edge) => markingName(colour, edge, key))),
);

/** Where a temperature's unit comes from: a flag DataRef (1 = Celsius), or always Celsius. */
export type TemperatureSourceSpec = { kind: 'flag'; name: string } | { kind: 'celsius' };

export interface GaugeSpec {
  id: GaugeId;
  /** float[16]: engine n reads index n − 1. */
  name: string;
  /** Engraved on the row, capitals. */
  legend: string;
  /** For sentences and screen readers. */
  spoken: string;
  marking: MarkingKey | null;
  temperature: TemperatureSourceSpec | null;
}

const indicator = (suffix: string): string => `sim/cockpit2/engine/indicators/${suffix}`;

function gauge(
  id: GaugeId,
  suffix: string,
  legend: string,
  spoken: string,
  marking: MarkingKey | null,
  temperature: TemperatureSourceSpec | null = null,
): GaugeSpec {
  return { id, name: indicator(suffix), legend, spoken, marking, temperature };
}

export const GAUGES: Record<GaugeId, GaugeSpec> = {
  rpm: gauge('rpm', 'engine_speed_rpm', 'RPM', 'RPM', null),
  prop: gauge('prop', 'prop_speed_rpm', 'PROP', 'propeller RPM', null),
  n1: gauge('n1', 'N1_percent', 'N1', 'N1', 'N1'),
  n2: gauge('n2', 'N2_percent', 'N2', 'N2', 'N2'),
  map: gauge('map', 'MPR_in_hg', 'MAP', 'manifold pressure', 'MP'),
  trq: gauge('trq', 'torque_n_mtr', 'TRQ', 'torque', 'TRQ'),
  epr: gauge('epr', 'EPR_ratio', 'EPR', 'EPR', 'EPR'),
  egt: gauge('egt', 'EGT_deg_cel', 'EGT', 'EGT', 'EGT', {
    kind: 'flag',
    name: ENGINE_CONFIG.egtIsCelsius,
  }),
  cht: gauge('cht', 'CHT_deg_cel', 'CHT', 'CHT', 'CHT', { kind: 'celsius' }),
  itt: gauge('itt', 'ITT_deg_cel', 'ITT', 'ITT', 'ITT', {
    kind: 'flag',
    name: ENGINE_CONFIG.ittIsCelsius,
  }),
  ff: gauge('ff', 'fuel_flow_kg_sec', 'FF', 'fuel flow', null),
  oilP: gauge('oilP', 'oil_pressure_psi', 'OIL P', 'oil pressure', 'oilP'),
  oilT: gauge('oilT', 'oil_temperature_deg_C', 'OIL T', 'oil temperature', 'oilT', {
    kind: 'flag',
    name: ENGINE_CONFIG.oilTempIsCelsius,
  }),
};

export const FUEL = {
  /** float[9], kg; sums to `total`. */
  perTank: 'sim/flightmodel/weight/m_fuel',
  /** float, kg: F-11's fuel total (`GENERIC_DATAREFS.fuelTotal`). */
  total: 'sim/flightmodel/weight/m_fuel_total',
  /** float[9]: the share of the capacity in each slot; 0 means the slot is unused. */
  ratio: 'sim/aircraft/overflow/acf_tank_rat',
  /** int. */
  count: 'sim/aircraft/overflow/acf_num_tanks',
  /** float, lb ("appears to be", Laminar): the whole aircraft's capacity. */
  capacity: 'sim/aircraft/weight/acf_m_fuel_tot',
  /** float[9]: lateral position, negative to the left. */
  side: 'sim/aircraft/overflow/acf_tank_X',
  /** float, kg. */
  used: 'sim/cockpit2/fuel/fuel_totalizer_sum_kg',
} as const;

/** Every aircraft has nine tank slots (Laminar). */
export const TANK_SLOTS = 9;

export const ELECTRICAL = {
  /** int. */
  busCount: 'sim/aircraft/electrical/num_buses',
  /** int. */
  batteryCount: 'sim/aircraft/electrical/num_batteries',
  /** float[6], volts. */
  busVolts: 'sim/cockpit2/electrical/bus_volts',
  /** float[6], amps. */
  busAmps: 'sim/cockpit2/electrical/bus_load_amps',
  /** float[8], volts. */
  batteryVolts: 'sim/cockpit2/electrical/battery_voltage_indicated_volts',
  /** float[8], amps; negative while discharging. */
  batteryAmps: 'sim/cockpit2/electrical/battery_amps',
  /** float[8], amps; one per engine. */
  generatorAmps: 'sim/cockpit2/electrical/generator_amps',
} as const;

export const MAX_BUSES = 6;
export const MAX_BATTERIES = 8;
