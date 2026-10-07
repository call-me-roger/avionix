import type { SessionSnapshot } from '@/application/session-snapshot';
import { type BindingResults, deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import {
  ELECTRICAL,
  ENGINE_CONFIG,
  ENGINES_FEATURES,
  FUEL,
  GAUGES,
  MARKING_NAMES,
  markingName,
} from '@/domain/engines/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';

import { systemsTelemetry } from './systems';

type Status = 'ok' | 'missing' | 'readOnly';

/** Every engines binding resolved ('ok'), unless overridden, derived through the real deriver. */
export function enginesCompatibility(
  base: SessionSnapshot['compatibility'],
  overrides: Partial<Record<string, Status>> = {},
): SessionSnapshot['compatibility'] {
  const bindings: BindingResults = { ...base.bindings };
  for (const feature of GENERIC_PROFILE.features) {
    if (!ENGINES_FEATURES.includes(feature.id)) {
      continue;
    }
    for (const binding of feature.bindings) {
      bindings[binding.name] = {
        name: binding.name,
        kind: binding.kind,
        status: overrides[binding.name] ?? 'ok',
      };
    }
  }
  return { ...base, bindings, features: deriveAvailability(GENERIC_PROFILE, bindings) };
}

const padded = (length: number, ...first: number[]): number[] => [
  ...first,
  ...new Array<number>(length - first.length).fill(0),
];

/**
 * A Cessna 172-like piston single: EGT in °F (its flag 0), ITT and oil temperature in °C, a
 * 2,700 rpm redline, the C172's EGT, CHT, oil pressure and oil temperature bands, two 42 kg wing
 * tanks, one bus and one battery.
 */
export const C172_VALUES: Record<string, DataRefValue> = {
  ...Object.fromEntries(MARKING_NAMES.map((name) => [name, 0])),
  [ENGINE_CONFIG.count]: 1,
  [ENGINE_CONFIG.type]: padded(16, 1),
  [ENGINE_CONFIG.egtIsCelsius]: 0,
  [ENGINE_CONFIG.ittIsCelsius]: 1,
  [ENGINE_CONFIG.oilTempIsCelsius]: 1,
  [ENGINE_CONFIG.engineRedline]: 282.743,
  [ENGINE_CONFIG.propRedline]: 282.743,
  [GAUGES.rpm.name]: padded(16, 2350),
  [GAUGES.prop.name]: padded(16, 2350),
  [GAUGES.n1.name]: padded(16, 0),
  [GAUGES.n2.name]: padded(16, 0),
  [GAUGES.map.name]: padded(16, 24.6),
  [GAUGES.trq.name]: padded(16, 0),
  [GAUGES.epr.name]: padded(16, 0),
  [GAUGES.egt.name]: padded(16, 1320),
  [GAUGES.cht.name]: padded(16, 180),
  [GAUGES.itt.name]: padded(16, 0),
  [GAUGES.ff.name]: padded(16, 0.0105),
  [GAUGES.oilP.name]: padded(16, 62),
  [GAUGES.oilT.name]: padded(16, 82),
  [markingName('green', 'lo', 'EGT')]: 1200,
  [markingName('green', 'hi', 'EGT')]: 1500,
  [markingName('green', 'lo', 'CHT')]: 65,
  [markingName('green', 'hi', 'CHT')]: 230,
  [markingName('red', 'lo', 'CHT')]: 238,
  [markingName('red', 'hi', 'CHT')]: 260,
  [markingName('green', 'lo', 'oilP')]: 50,
  [markingName('green', 'hi', 'oilP')]: 90,
  [markingName('red', 'lo', 'oilP')]: 0,
  [markingName('red', 'hi', 'oilP')]: 20,
  [markingName('green', 'lo', 'oilT')]: 38,
  [markingName('green', 'hi', 'oilT')]: 118,
  [FUEL.perTank]: padded(9, 42, 42),
  [FUEL.total]: 84,
  [FUEL.ratio]: padded(9, 0.5, 0.5),
  [FUEL.count]: 9,
  [FUEL.capacity]: 370,
  [FUEL.side]: padded(9, -10, 10),
  [FUEL.used]: 12,
  [ELECTRICAL.busCount]: 1,
  [ELECTRICAL.batteryCount]: 1,
  [ELECTRICAL.busVolts]: padded(6, 28.1),
  [ELECTRICAL.busAmps]: padded(6, 12),
  [ELECTRICAL.batteryVolts]: padded(8, 24.3),
  [ELECTRICAL.batteryAmps]: padded(8, -4),
  [ELECTRICAL.generatorAmps]: padded(8, 30),
};

/** The same aircraft with `count` engines of the given types (one entry per engine). */
export function withEngines(
  values: Record<string, DataRefValue>,
  count: number,
  types: readonly number[],
): Record<string, DataRefValue> {
  const perEngine = (name: string, value: number) => [name, padded(16, ...types.map(() => value))];
  return {
    ...values,
    [ENGINE_CONFIG.count]: count,
    [ENGINE_CONFIG.type]: padded(16, ...types),
    ...Object.fromEntries([
      perEngine(GAUGES.rpm.name, 2350),
      perEngine(GAUGES.egt.name, 1320),
      perEngine(GAUGES.ff.name, 0.0105),
      perEngine(GAUGES.n1.name, 85),
      perEngine(GAUGES.trq.name, 1500),
    ]),
  };
}

export const enginesTelemetry = systemsTelemetry;
