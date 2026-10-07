import type { DataRefValue } from '@/domain/simulator/types';
import { MAX_ENGINES, type TrimAxis } from '@/domain/systems/controls';

/** Element `index` of an array value, or the scalar itself at index 0, when it is a finite number. */
export function numberAt(value: DataRefValue | undefined, index: number): number | null {
  const candidate = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

/** On above one half: switches are 0/1 ints, the parking brake a 0..1 ratio. Null when unknown. */
export function switchOn(value: DataRefValue | undefined, index: number): boolean | null {
  const reading = numberAt(value, index);
  return reading === null ? null : reading > 0.5;
}

export type GearLamp = 'down' | 'transit' | 'up';

const GEAR_LAMPS = 3;
const DOWN_AT = 0.99;
const UP_AT = 0.01;

/** The three lamps from `deploy_ratio` entries 0–2 (spec §4.6); null unless all three are numbers. */
export function gearLamps(deployment: DataRefValue | undefined): readonly GearLamp[] | null {
  if (!Array.isArray(deployment)) {
    return null;
  }
  const lamps: GearLamp[] = [];
  for (let index = 0; index < GEAR_LAMPS; index += 1) {
    const ratio = numberAt(deployment, index);
    if (ratio === null) {
      return null;
    }
    lamps.push(ratio >= DOWN_AT ? 'down' : ratio <= UP_AT ? 'up' : 'transit');
  }
  return lamps;
}

const COUNT_WORDS = ['no', 'one', 'two', 'three'];

/** What a screen reader hears for the gear unit. */
export function gearSummary(lamps: readonly GearLamp[] | null, handleDown: boolean | null): string {
  if (lamps === null) {
    return handleDown === null
      ? 'Gear position unknown'
      : `Gear handle ${handleDown ? 'down' : 'up'}`;
  }
  const green = lamps.filter((lamp) => lamp === 'down').length;
  if (green === lamps.length) {
    return `Gear down, ${COUNT_WORDS[green] ?? green} green`;
  }
  if (lamps.every((lamp) => lamp === 'up')) {
    return 'Gear up';
  }
  return green === 0 ? 'Gear in transit' : `Gear in transit, ${COUNT_WORDS[green] ?? green} green`;
}

export interface FlapReadout {
  /** In the window: "UP", "2 of 3", "FULL" or "40 %". */
  label: string;
  spoken: string;
  /** The flaps lag the handle. */
  moving: boolean;
  atUp: boolean;
  atFull: boolean;
}

const FLAP_END = 0.005;
const FLAP_LAG = 0.02;
const MAX_DETENTS = 20;

/** The handle's detent (handle × detents, rounded), or a percentage without a usable count. */
export function flapReadout(
  handle: number | null,
  position: number | null,
  detents: number | null,
): FlapReadout | null {
  if (handle === null) {
    return null;
  }
  const atUp = handle <= FLAP_END;
  const atFull = handle >= 1 - FLAP_END;
  const usableDetents =
    detents !== null && Number.isInteger(detents) && detents >= 1 && detents <= MAX_DETENTS
      ? detents
      : null;
  let label: string;
  let spoken: string;
  if (usableDetents !== null) {
    const notch = Math.round(handle * usableDetents);
    label = notch === 0 ? 'UP' : notch === usableDetents ? 'FULL' : `${notch} of ${usableDetents}`;
    spoken = notch === 0 ? 'Flaps up' : notch === usableDetents ? 'Flaps full' : `Flaps ${label}`;
  } else {
    const percent = Math.round(handle * 100);
    label = atUp ? 'UP' : atFull ? 'FULL' : `${percent} %`;
    spoken = atUp ? 'Flaps up' : atFull ? 'Flaps full' : `Flaps ${percent} percent`;
  }
  const moving = position !== null && Math.abs(position - handle) > FLAP_LAG;
  return { label, spoken: moving ? `${spoken}, moving` : spoken, moving, atUp, atFull };
}

const HANDLE_STEP = 0.001;

/** Read-back for a flap notch: the handle moved in the pressed direction. */
export function flapsMoved(
  direction: 'up' | 'down',
  before: number,
  after: number | null,
): boolean {
  if (after === null) {
    return false;
  }
  return direction === 'down' ? after > before + HANDLE_STEP : after < before - HANDLE_STEP;
}

export interface TrimReadout {
  percent: number;
  text: string;
  spoken: string;
}

const DIRECTION_WORDS: Record<TrimAxis, { negative: string; positive: string }> = {
  pitch: { negative: 'nose down', positive: 'nose up' },
  roll: { negative: 'left', positive: 'right' },
  yaw: { negative: 'left', positive: 'right' },
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Percent of the trim range, with the direction in the pilot's words; under 1 % is centred. */
export function trimReadout(
  axis: TrimAxis,
  name: string,
  value: number | null,
): TrimReadout | null {
  if (value === null) {
    return null;
  }
  const percent = Math.round(Math.abs(value) * 100);
  if (percent < 1) {
    return { percent: 0, text: 'centred', spoken: `${capitalise(name)} centred` };
  }
  const words = DIRECTION_WORDS[axis];
  const direction = value > 0 ? words.positive : words.negative;
  return {
    percent,
    text: `${percent} % ${direction}`,
    spoken: `${capitalise(name)}, ${percent} percent ${direction}`,
  };
}

const TRIM_LIMIT = 0.98;

/** Trim already at the end a hold drives toward: not moving is then not a failure. */
export function trimAtLimit(value: number | null, direction: -1 | 1): boolean {
  return value !== null && value * direction >= TRIM_LIMIT;
}

/** A set command (T/O, CTR) counts as done within this of its target. */
export const TRIM_TARGET_TOLERANCE = 0.01;

export function brightnessPercent(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
}

export interface EngineColumn {
  /** 1-based. */
  engine: number;
  /** `acf_en_type` 0 or 1: the only engines with magnetos. Unknown type is not piston. */
  piston: boolean;
}

/**
 * Engines 1..min(count, MAX_ENGINES) (spec §4.6). A missing, fractional or non-positive count
 * draws one column; `hidden` is how many engines past MAX_ENGINES are not drawn.
 */
export function engineColumns(
  count: number | null,
  types: DataRefValue | undefined,
): { columns: EngineColumn[]; hidden: number } {
  const engines = count !== null && Number.isInteger(count) && count >= 1 ? count : 1;
  const drawn = Math.min(engines, MAX_ENGINES);
  const columns: EngineColumn[] = [];
  for (let engine = 1; engine <= drawn; engine += 1) {
    const type = numberAt(types, engine - 1);
    columns.push({ engine, piston: type === 0 || type === 1 });
  }
  return { columns, hidden: engines - drawn };
}
