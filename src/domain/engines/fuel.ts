import { FUEL, GAUGES, TANK_SLOTS } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { formatGauge, groupedWhole } from '@/domain/engines/units';
import { KG_PER_LB, type UnitPreferences, convertFuel } from '@/domain/units/units';

export interface Readout {
  text: string;
  spoken: string;
}

export interface TankReading {
  slot: number;
  name: string;
  text: string;
  /** Quantity over the tank's capacity, 0..1; null without a capacity or a value. */
  fraction: number | null;
  spoken: string;
}

export interface FuelModel {
  /** Null when the aircraft publishes no per-tank fuel, or neither tank ratios nor a tank count.
   * Empty while that is not known yet (`tanksPending`). */
  tanks: readonly TankReading[] | null;
  /** The tank DataRefs have not been checked yet, or the slot count has not arrived: no tank rows
   * and no sentence. */
  tanksPending: boolean;
  unit: 'KG' | 'LB';
  flowUnit: 'KG/H' | 'LB/H';
  /** Null when the total DataRef did not resolve, or has not been checked yet. */
  total: Readout | null;
  flow: Readout;
  /** Null when the totalizer DataRef did not resolve, or has not been checked yet. */
  used: Readout | null;
  endurance: Readout;
  /** Legends of totalizer rows not drawn because their DataRef did not resolve. */
  missing: readonly string[];
}

/** Below this flow, endurance is not shown: an idle or stopped engine would give days. */
export const ENDURANCE_MIN_FLOW_KG_H = 1;
/** A tank holding more than this share of its computed capacity means the capacity is wrong. */
export const CAPACITY_TOLERANCE = 1.05;
const SIDE_THRESHOLD = 0.5;
const NO_VALUE = '—';

function validCount(count: number | null): number | null {
  return count !== null && Number.isInteger(count) && count >= 0
    ? Math.min(count, TANK_SLOTS)
    : null;
}

/**
 * Spec §4.7: slots with a ratio above 0 (below the slot count when it resolves); without ratios,
 * every slot below the count; without both, unknown (null). `pending` while the ratios have not
 * been checked yet, or, without ratios, while the count has not been checked or has not arrived.
 */
export function usedSlots(reader: EngineReader): number[] | null | 'pending' {
  if (reader.has(FUEL.ratio)) {
    const limit = reader.has(FUEL.count) ? validCount(reader.number(FUEL.count)) : null;
    const slots: number[] = [];
    for (let slot = 0; slot < (limit ?? TANK_SLOTS); slot += 1) {
      const ratio = reader.number(FUEL.ratio, slot);
      if (ratio !== null && ratio > 0) {
        slots.push(slot);
      }
    }
    return slots;
  }
  if (!reader.missing(FUEL.ratio)) {
    return 'pending';
  }
  if (reader.missing(FUEL.count)) {
    return null;
  }
  const count = reader.has(FUEL.count) ? reader.number(FUEL.count) : null;
  if (count === null) {
    return 'pending';
  }
  const limit = validCount(count);
  return limit === null ? null : Array.from({ length: limit }, (_, slot) => slot);
}

type Side = 'LEFT' | 'CENTER' | 'RIGHT';

/** By side from the lateral position, numbered when two share one; TANK n without positions. */
export function tankNames(slots: readonly number[], reader: EngineReader): string[] {
  const sides = slots.map((slot): Side | null => {
    if (!reader.has(FUEL.side)) {
      return null;
    }
    const x = reader.number(FUEL.side, slot);
    if (x === null) {
      return null;
    }
    return x < -SIDE_THRESHOLD ? 'LEFT' : x > SIDE_THRESHOLD ? 'RIGHT' : 'CENTER';
  });
  if (sides.some((side) => side === null)) {
    return slots.map((_, index) => `TANK ${index + 1}`);
  }
  const totals = new Map<Side, number>();
  for (const side of sides as Side[]) {
    totals.set(side, (totals.get(side) ?? 0) + 1);
  }
  const seen = new Map<Side, number>();
  return (sides as Side[]).map((side) => {
    if (totals.get(side) === 1) {
      return side;
    }
    const ordinal = (seen.get(side) ?? 0) + 1;
    seen.set(side, ordinal);
    return `${side} ${ordinal}`;
  });
}

/** "LEFT" → "Left tank", "LEFT 2" → "Left tank 2", "TANK 1" → "Tank 1". */
function spokenTank(name: string): string {
  const words = name.charAt(0) + name.slice(1).toLowerCase();
  return name.startsWith('TANK') ? words : words.replace(/^(\w+)/, '$1 tank');
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The FUEL page (spec §4.7). `engines`: the drawn engine count, 0 for a glider, null if unknown. */
export function fuelPage(
  reader: EngineReader,
  units: UnitPreferences,
  engines: number | null,
): FuelModel {
  const kg = units.fuel === 'kg';
  const unitWord = kg ? 'kilograms' : 'pounds';
  const amount = (value: number): string => groupedWhole(convertFuel(value, units.fuel));
  const missing: string[] = [];

  let tanks: TankReading[] | null = null;
  let tanksPending = false;
  const slots = usedSlots(reader);
  if (reader.missing(FUEL.perTank) || slots === null) {
    tanks = null;
  } else if (!reader.has(FUEL.perTank) || slots === 'pending') {
    tanks = [];
    tanksPending = true;
  } else {
    const names = tankNames(slots, reader);
    const capacityLb = reader.has(FUEL.capacity) ? reader.number(FUEL.capacity) : null;
    tanks = slots.map((slot, index) => {
      const name = names[index] ?? `TANK ${index + 1}`;
      const quantity = reader.number(FUEL.perTank, slot);
      const ratio = reader.has(FUEL.ratio) ? reader.number(FUEL.ratio, slot) : null;
      const capacityKg =
        capacityLb !== null && capacityLb > 0 && ratio !== null && ratio > 0
          ? capacityLb * KG_PER_LB * ratio
          : null;
      // The capacity's unit is unsettled (lb per Laminar, but other `acf_m_*` weights read as
      // kg): a tank well over its computed capacity means the capacity is wrong, so no bar
      // rather than a full one.
      const share = quantity !== null && capacityKg !== null ? quantity / capacityKg : null;
      const fraction =
        share === null || share > CAPACITY_TOLERANCE ? null : Math.min(1, Math.max(0, share));
      const text = quantity === null ? NO_VALUE : amount(quantity);
      return {
        slot,
        name,
        text,
        fraction,
        spoken: `${spokenTank(name)}, ${quantity === null ? 'no value' : `${text} ${unitWord}`}`,
      };
    });
  }

  let total: Readout | null = null;
  let totalKg: number | null = null;
  if (reader.has(FUEL.total)) {
    totalKg = reader.number(FUEL.total);
    total =
      totalKg === null
        ? { text: NO_VALUE, spoken: 'Total fuel, no value' }
        : { text: amount(totalKg), spoken: `Total fuel ${amount(totalKg)} ${unitWord}` };
  } else if (reader.missing(FUEL.total)) {
    missing.push('TOTAL');
  }

  let flowKgH: number | null = null;
  if (engines !== null && engines > 0 && reader.has(GAUGES.ff.name)) {
    const flows: number[] = [];
    for (let engine = 1; engine <= engines; engine += 1) {
      const flow = reader.number(GAUGES.ff.name, engine - 1);
      if (flow !== null) {
        flows.push(flow);
      }
    }
    flowKgH = flows.length === 0 ? null : flows.reduce((sum, flow) => sum + flow, 0) * 3600;
  }
  const flowText = flowKgH === null ? NO_VALUE : formatGauge('ff', flowKgH, units, null);
  const flow: Readout =
    flowKgH === null
      ? { text: NO_VALUE, spoken: 'Fuel flow, no value' }
      : { text: flowText, spoken: `Fuel flow ${flowText} ${unitWord} per hour` };

  let used: Readout | null = null;
  if (reader.has(FUEL.used)) {
    const usedKg = reader.number(FUEL.used);
    used =
      usedKg === null
        ? { text: NO_VALUE, spoken: 'Fuel used, no value' }
        : { text: amount(usedKg), spoken: `Fuel used ${amount(usedKg)} ${unitWord}` };
  } else if (reader.missing(FUEL.used)) {
    missing.push('USED');
  }

  let endurance: Readout = { text: NO_VALUE, spoken: 'Endurance, not available' };
  if (totalKg !== null && flowKgH !== null && flowKgH > ENDURANCE_MIN_FLOW_KG_H) {
    const minutes = Math.floor((totalKg / flowKgH) * 60);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    endurance = {
      text: `${hours}:${String(rest).padStart(2, '0')}`,
      spoken: `Endurance ${plural(hours, 'hour')} ${plural(rest, 'minute')}`,
    };
  }

  return {
    tanks,
    tanksPending,
    unit: kg ? 'KG' : 'LB',
    flowUnit: kg ? 'KG/H' : 'LB/H',
    total,
    flow,
    used,
    endurance,
    missing,
  };
}
