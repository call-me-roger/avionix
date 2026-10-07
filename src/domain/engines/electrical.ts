import { ELECTRICAL, MAX_BATTERIES, MAX_BUSES } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { fixed, signedWhole } from '@/domain/engines/units';
import { MAX_ENGINES } from '@/domain/systems/controls';

export interface PowerRow {
  key: string;
  label: string;
  /** Null when this group has no voltage DataRef (generators never do). */
  volts: string | null;
  amps: string | null;
  spoken: string;
}

export interface ElectricalModel {
  buses: readonly PowerRow[];
  batteries: readonly PowerRow[];
  generators: readonly PowerRow[];
  /** Groups not drawn because the probe found their DataRefs missing: BUS, BATT, GEN. */
  missing: readonly string[];
}

const NO_VALUE = '—';

/** Spec §4.8: the count when it resolves (capped), else the first entry only. */
function countOf(reader: EngineReader, name: string, max: number): number {
  if (!reader.has(name)) {
    return 1;
  }
  const count = reader.number(name);
  return count !== null && Number.isInteger(count) && count >= 0 ? Math.min(count, max) : 1;
}

function powerRows(
  reader: EngineReader,
  group: { legend: string; key: string; spoken: string },
  count: number,
  volts: string | null,
  amps: string,
  missing: string[],
): PowerRow[] {
  const hasVolts = volts !== null && reader.has(volts);
  const hasAmps = reader.has(amps);
  if (!hasVolts && !hasAmps) {
    // Named as unavailable only once the probe found every one of its DataRefs missing; while one
    // is not checked yet, the group is simply not drawn.
    if ((volts === null || reader.missing(volts)) && reader.missing(amps)) {
      missing.push(group.legend);
    }
    return [];
  }
  return Array.from({ length: count }, (_, index) => {
    const parts: string[] = [`${group.spoken} ${index + 1}`];
    let voltsText: string | null = null;
    if (hasVolts && volts !== null) {
      const value = reader.number(volts, index);
      voltsText = value === null ? NO_VALUE : fixed(value, 1);
      parts.push(value === null ? 'no voltage reading' : `${voltsText} volts`);
    }
    let ampsText: string | null = null;
    if (hasAmps) {
      const value = reader.number(amps, index);
      ampsText = value === null ? NO_VALUE : signedWhole(value);
      const rounded = value === null ? 0 : Math.round(value);
      parts.push(
        value === null
          ? 'no current reading'
          : `${rounded < 0 ? 'minus ' : ''}${Math.abs(rounded)} amps`,
      );
    }
    return {
      key: `${group.key}-${index + 1}`,
      label: `${group.legend} ${index + 1}`,
      volts: voltsText,
      amps: ampsText,
      spoken: parts.join(', '),
    };
  });
}

/** The ELEC page (spec §4.8). `engines`: the drawn engine count, 0 for a glider, null if unknown. */
export function electricalPage(reader: EngineReader, engines: number | null): ElectricalModel {
  const missing: string[] = [];
  const buses = powerRows(
    reader,
    { legend: 'BUS', key: 'bus', spoken: 'Bus' },
    countOf(reader, ELECTRICAL.busCount, MAX_BUSES),
    ELECTRICAL.busVolts,
    ELECTRICAL.busAmps,
    missing,
  );
  const batteries = powerRows(
    reader,
    { legend: 'BATT', key: 'batt', spoken: 'Battery' },
    countOf(reader, ELECTRICAL.batteryCount, MAX_BATTERIES),
    ELECTRICAL.batteryVolts,
    ELECTRICAL.batteryAmps,
    missing,
  );
  const generators = powerRows(
    reader,
    { legend: 'GEN', key: 'gen', spoken: 'Generator' },
    engines === null ? 1 : Math.min(engines, MAX_ENGINES),
    null,
    ELECTRICAL.generatorAmps,
    missing,
  );
  return { buses, batteries, generators, missing };
}
