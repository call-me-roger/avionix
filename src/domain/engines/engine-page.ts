import { ENGINE_CONFIG, GAUGES, type GaugeId } from '@/domain/engines/catalogue';
import {
  type EngineKind,
  GAUGE_SETS,
  engineKind,
  gaugeLegend,
  gaugeSpoken,
} from '@/domain/engines/gauge-sets';
import {
  type Band,
  type Scale,
  type Tone,
  bandsFor,
  scaleFor,
  toneOf,
} from '@/domain/engines/markings';
import {
  type TemperatureSource,
  formatGauge,
  gaugeUnit,
  instrumentValue,
  redlineRpm,
  temperatureSource,
} from '@/domain/engines/units';
import { MAX_ENGINES } from '@/domain/systems/controls';
import type { UnitPreferences } from '@/domain/units/units';

/** What the page needs from the session: which names resolved, and their finite numbers. */
export interface EngineReader {
  has(name: string): boolean;
  /** Element `index` of an array value (the scalar itself at 0), when it is a finite number. */
  number(name: string, index?: number): number | null;
}

export interface GaugeReading {
  engine: number;
  id: GaugeId;
  legend: string;
  /** In the instrument unit (`instrumentValue`); null when no finite number has arrived. */
  value: number | null;
  /** Temperatures: the unit `value` is in. Null for other gauges. */
  source: TemperatureSource | null;
  text: string;
  scale: Scale | null;
  bands: readonly Band[];
  tone: Tone;
  spoken: string;
}

export interface EngineColumn {
  engine: number;
  kind: EngineKind;
  dial: GaugeReading | null;
  cells: Partial<Record<GaugeId, GaugeReading>>;
}

export interface GaugeRow {
  id: GaugeId;
  /** Legend and unit, once per row: `EGT °F`. */
  label: string;
}

/**
 * `unidentified`: the count or type DataRef did not resolve, or the count is not a whole number.
 * `waiting`: the count resolved but has not arrived. `none`: a count of 0 (a glider).
 */
export type EnginesStatus = 'unidentified' | 'waiting' | 'none' | 'ready';

export interface EnginesModel {
  status: EnginesStatus;
  columns: readonly EngineColumn[];
  rows: readonly GaugeRow[];
  /** Engines beyond the fourth. */
  hidden: number;
  /** Legends of gauges not drawn because their DataRef did not resolve (R6). */
  missing: readonly string[];
  /** Drawn temperature gauges whose unit the aircraft does not publish (spec §4.4). */
  unknownUnits: readonly GaugeId[];
  /** Engine numbers whose type has no gauge set. */
  unsupported: readonly number[];
}

const EMPTY = { columns: [], rows: [], hidden: 0, missing: [], unknownUnits: [], unsupported: [] };

const TONE_WORDS: Record<Tone, string> = {
  normal: '',
  yellow: ', in the yellow band',
  red: ', in the red band',
  redline: ', above the redline',
};

function redlineFor(id: GaugeId, reader: EngineReader): number | null {
  if (id === 'rpm') {
    return redlineRpm(reader.number(ENGINE_CONFIG.engineRedline));
  }
  if (id === 'prop') {
    return redlineRpm(reader.number(ENGINE_CONFIG.propRedline));
  }
  return null;
}

function reading(
  engine: number,
  id: GaugeId,
  kind: EngineKind,
  reader: EngineReader,
  units: UnitPreferences,
): GaugeReading {
  const spec = GAUGES[id];
  const source = temperatureSource(
    spec,
    (name) => reader.has(name),
    (name) => reader.number(name),
  );
  const raw = reader.number(spec.name, engine - 1);
  const value = raw === null ? null : instrumentValue(id, raw);
  const bands = bandsFor(spec.marking, (name) => reader.number(name));
  const scale = scaleFor(id, bands, redlineFor(id, reader));
  const tone = value === null ? 'normal' : toneOf(value, bands, scale?.redline ?? null);
  const text = value === null ? '—' : formatGauge(id, value, units, source);
  const unit = gaugeUnit(id, units, source);
  const name = `Engine ${engine} ${gaugeSpoken(id, kind)}`;
  const spoken =
    text === '—'
      ? `${name}, no value`
      : `${name} ${text}${unit.spoken === '' ? '' : ` ${unit.spoken}`}${TONE_WORDS[tone]}`;
  return {
    engine,
    id,
    legend: gaugeLegend(id, kind),
    value,
    source,
    text,
    scale,
    bands,
    tone,
    spoken,
  };
}

/** The ENGINES page (spec §4.2–§4.5): one column per drawn engine, one row per gauge. */
export function enginesPage(reader: EngineReader, units: UnitPreferences): EnginesModel {
  if (!reader.has(ENGINE_CONFIG.count) || !reader.has(ENGINE_CONFIG.type)) {
    return { status: 'unidentified', ...EMPTY };
  }
  const count = reader.number(ENGINE_CONFIG.count);
  if (count === null) {
    return { status: 'waiting', ...EMPTY };
  }
  if (!Number.isInteger(count) || count < 0) {
    return { status: 'unidentified', ...EMPTY };
  }
  if (count === 0) {
    return { status: 'none', ...EMPTY };
  }

  const drawn = Math.min(count, MAX_ENGINES);
  const columns: EngineColumn[] = [];
  const rows: GaugeRow[] = [];
  const missing: string[] = [];
  const unknownUnits: GaugeId[] = [];
  const unsupported: number[] = [];
  const note = (list: string[], legend: string) => {
    if (!list.includes(legend)) {
      list.push(legend);
    }
  };

  for (let engine = 1; engine <= drawn; engine += 1) {
    const kind = engineKind(reader.number(ENGINE_CONFIG.type, engine - 1));
    if (kind === 'unsupported') {
      unsupported.push(engine);
    }
    const set = GAUGE_SETS[kind];
    const present = (id: GaugeId): boolean => {
      if (reader.has(GAUGES[id].name)) {
        return true;
      }
      note(missing, gaugeLegend(id, kind));
      return false;
    };
    const dial =
      set.dial !== null && present(set.dial)
        ? reading(engine, set.dial, kind, reader, units)
        : null;
    const cells: Partial<Record<GaugeId, GaugeReading>> = {};
    for (const id of set.rows) {
      if (!present(id)) {
        continue;
      }
      const cell = reading(engine, id, kind, reader, units);
      cells[id] = cell;
      if (!rows.some((row) => row.id === id)) {
        const unit = gaugeUnit(id, units, cell.source);
        rows.push({ id, label: `${cell.legend} ${unit.label}`.trim() });
      }
    }
    for (const gauge of [dial, ...Object.values(cells)]) {
      if (gauge?.source === 'unknown' && !unknownUnits.includes(gauge.id)) {
        unknownUnits.push(gauge.id);
      }
    }
    columns.push({ engine, kind, dial, cells });
  }

  return {
    status: 'ready',
    columns,
    rows,
    hidden: count - drawn,
    missing,
    unknownUnits,
    unsupported,
  };
}
