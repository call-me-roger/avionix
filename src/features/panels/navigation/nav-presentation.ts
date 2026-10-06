import { type Marker, sourceKind, sourceLabel } from '@/domain/navigation/hsi';
import type { Theme } from '@/theme/tokens';

/**
 * How the HSI and the PFD's navigation cues present what `useNavValues` reads: colours, letters
 * and words. One place, so the two faces never name or colour the same needle differently.
 */

export const MARKER_LETTER: Record<Marker, string> = { outer: 'O', middle: 'M', inner: 'I' };

export function markerColour(marker: Marker, theme: Theme): string {
  switch (marker) {
    case 'outer':
      return theme.instrument.selected;
    case 'middle':
      return theme.avionics.caution;
    case 'inner':
      return theme.avionics.legend;
  }
}

/**
 * Garmin's convention: NAV guidance green, GPS magenta. A source X-Plane reports that Avionix does
 * not know claims neither colour, so a needle is never labelled by a colour it may not have.
 */
export function needleColour(source: number | null, theme: Theme): string {
  const kind = sourceKind(source);
  if (kind === 'nav') {
    return theme.instrument.navNeedle;
  }
  return kind === 'gps' ? theme.instrument.gpsNeedle : theme.instrument.marking;
}

/** Where a needle sits, in words (R2): the dots are spoken, so the unit is never in doubt. */
export function deviationWords(
  deviation: { dots: number; pegged: boolean },
  positive: string,
  negative: string,
): string {
  const side = deviation.dots > 0 ? positive : negative;
  if (deviation.pegged) {
    return `full scale ${side}`;
  }
  const tenths = Math.round(Math.abs(deviation.dots) * 10) / 10;
  return tenths === 0 ? 'centred' : `${tenths.toFixed(1)} dots ${side}`;
}

/**
 * The lateral guidance named by its source, "NAV1 course", so a VOR radial or a GPS course is never
 * called a localizer. A source Avionix does not know is just "course".
 */
export function lateralName(source: number | null): string {
  const label = sourceLabel(source);
  return label === null ? 'course' : `${label} course`;
}

/**
 * A GPS vertical path is a glidepath, flagged GP; a radio one is a glideslope, flagged GS. A source
 * Avionix does not know keeps X-Plane's own word for it, glideslope.
 */
export function verticalName(source: number | null): {
  word: 'glideslope' | 'glidepath';
  flag: 'GS' | 'GP';
} {
  return sourceKind(source) === 'gps'
    ? { word: 'glidepath', flag: 'GP' }
    : { word: 'glideslope', flag: 'GS' };
}
