import {
  MARKING_COLOURS,
  type GaugeId,
  type MarkingColour,
  type MarkingKey,
  markingName,
} from '@/domain/engines/catalogue';

/** One of the aircraft's own coloured arcs, in the gauge's instrument unit. */
export interface Band {
  colour: MarkingColour;
  from: number;
  to: number;
}

export interface Scale {
  min: number;
  max: number;
  /** RPM and PROP without markings: the redline, drawn as a red tick. */
  redline: number | null;
}

/** The colour a value is drawn in (spec §4.5). `redline`: above it, with no red band to say so. */
export type Tone = 'normal' | 'yellow' | 'red' | 'redline';

/** The scale runs a tenth of its span past the highest edge (a division, so 2700 → 2970 exactly). */
const HEADROOM_DIVISOR = 10;
const PERCENT_MAX = 110;

/** The aircraft's used bands for one gauge: Plane Maker leaves unused ones at 0, so a band counts
 * only when its high edge is above its low edge. */
export function bandsFor(key: MarkingKey | null, read: (name: string) => number | null): Band[] {
  if (key === null) {
    return [];
  }
  const bands: Band[] = [];
  for (const colour of MARKING_COLOURS) {
    const from = read(markingName(colour, 'lo', key));
    const to = read(markingName(colour, 'hi', key));
    if (from !== null && to !== null && to > from) {
      bands.push({ colour, from, to });
    }
  }
  return bands;
}

/** Spec §4.5: from the bands when there are any; else RPM/PROP to 110 % of the redline and N1/N2
 * to 110 %; otherwise the gauge is a number with no bar. */
export function scaleFor(
  id: GaugeId,
  bands: readonly Band[],
  redline: number | null,
): Scale | null {
  if (bands.length > 0) {
    const min = Math.min(...bands.map((band) => band.from));
    const max = Math.max(...bands.map((band) => band.to));
    return { min, max: max + (max - min) / HEADROOM_DIVISOR, redline: null };
  }
  if ((id === 'rpm' || id === 'prop') && redline !== null) {
    return { min: 0, max: redline + redline / HEADROOM_DIVISOR, redline };
  }
  if (id === 'n1' || id === 'n2') {
    return { min: 0, max: PERCENT_MAX, redline: null };
  }
  return null;
}

function inBand(value: number, band: Band): boolean {
  return value >= band.from && value <= band.to;
}

/** Red wins over yellow where bands touch; above a bare redline is red too. */
export function toneOf(value: number, bands: readonly Band[], redline: number | null): Tone {
  if (bands.some((band) => band.colour === 'red' && inBand(value, band))) {
    return 'red';
  }
  if (redline !== null && value > redline) {
    return 'redline';
  }
  if (bands.some((band) => band.colour === 'yellow' && inBand(value, band))) {
    return 'yellow';
  }
  return 'normal';
}

/** Where `value` sits on `scale`, 0 at `min` and 1 at `max`, clamped. */
export function scaleFraction(value: number, scale: Scale): number {
  const span = scale.max - scale.min;
  if (span <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - scale.min) / span));
}
