import type { SessionSnapshot } from '@/application/session-snapshot';
import { type BindingResults, deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { DataRefValue } from '@/domain/simulator/types';
import {
  ANTI_ICE,
  AVIONICS_MASTER,
  BATTERY,
  DIMMERS,
  ENGINES,
  EXTERIOR_LIGHTS,
  FLAPS,
  FUEL_SELECTOR,
  GEAR,
  PARKING_BRAKE,
  SYSTEMS_FEATURES,
  TAKEOFF_TRIM,
  TRIMS,
  fuelPumpSwitch,
  generatorSwitch,
} from '@/domain/systems/controls';

type Status = 'ok' | 'missing' | 'readOnly';

/** Every systems binding resolved ('ok'), unless overridden, derived through the real deriver. */
export function systemsCompatibility(
  base: SessionSnapshot['compatibility'],
  overrides: Partial<Record<string, Status>> = {},
): SessionSnapshot['compatibility'] {
  const bindings: BindingResults = {};
  for (const feature of GENERIC_PROFILE.features) {
    if (!SYSTEMS_FEATURES.includes(feature.id)) {
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

const zeros = (length: number): number[] => new Array<number>(length).fill(0);
const ones = (length: number): number[] => new Array<number>(length).fill(1);

function firstThen(first: number, rest: number, length: number): number[] {
  return [first, ...new Array<number>(length - 1).fill(rest)];
}

/** A one-engine piston aircraft, gear down, flaps up, trim centred, every switch off. */
export const SYSTEMS_VALUES: Record<string, DataRefValue> = {
  ...Object.fromEntries([...EXTERIOR_LIGHTS, ...ANTI_ICE].map((spec) => [spec.state, 0])),
  [AVIONICS_MASTER.state]: 0,
  [BATTERY.state]: zeros(8),
  [generatorSwitch(1).state]: zeros(8),
  [fuelPumpSwitch(1).state]: zeros(16),
  [DIMMERS[0]!.state]: [0.5, 0, 0, 0],
  [DIMMERS[1]!.state]: firstThen(0.5, 0, 32),
  [GEAR.handle]: 1,
  [GEAR.deployment]: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  [GEAR.retractable]: 1,
  [FLAPS.handle]: 0,
  [FLAPS.position]: 0,
  [FLAPS.detents]: 3,
  ...Object.fromEntries(TRIMS.map((trim) => [trim.position, 0])),
  [TAKEOFF_TRIM]: 0.1,
  [PARKING_BRAKE.ratio]: 1,
  [FUEL_SELECTOR.state]: 4,
  [FUEL_SELECTOR.hasSelector]: 1,
  [FUEL_SELECTOR.hasBoth]: 1,
  [ENGINES.count]: 1,
  [ENGINES.type]: ones(16),
  [ENGINES.key]: firstThen(3, 0, 16),
  [ENGINES.starter]: zeros(16),
  [ENGINES.running]: zeros(16),
};

export function systemsTelemetry(
  values: Record<string, DataRefValue>,
  receivedAt: number,
): SessionSnapshot['telemetry'] {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}
