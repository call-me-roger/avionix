import { type DistanceUnit, UNIT_LABEL, convertDistance } from '@/domain/units/units';

/** The scale is drawn two dots each side, as Garmin CDIs are; the needle stops at 2.5. */
export const DEV_SCALE_DOTS = 2;
export const DEV_PEG_DOTS = 2.5;

export function deviationDots(raw: number | null): { dots: number; pegged: boolean } | null {
  if (raw === null || !Number.isFinite(raw)) {
    return null;
  }
  if (raw > DEV_PEG_DOTS) {
    return { dots: DEV_PEG_DOTS, pegged: true };
  }
  if (raw < -DEV_PEG_DOTS) {
    return { dots: -DEV_PEG_DOTS, pegged: true };
  }
  return { dots: raw, pegged: false };
}

/** R3: a CDI means something only with TO or FROM and a horizontal signal; never a centred needle. */
export function lateralValid(fromTo: number | null, horizontal: number | null): boolean {
  return (fromTo === 1 || fromTo === 2) && horizontal === 1;
}

export type GlideslopeState = 'valid' | 'flagged' | 'none';

/**
 * R4: X-Plane's EFIS flag shows when a glideslope is expected but not received. Valid needs the
 * flag received and clear, so a flag that has not arrived yet can never let a diamond through.
 */
export function glideslopeState(vertical: number | null, gsFlag: number | null): GlideslopeState {
  if (gsFlag === 1) {
    return 'flagged';
  }
  return vertical === 1 && gsFlag === 0 ? 'valid' : 'none';
}

export function toFromWord(value: number | null): 'TO' | 'FROM' | null {
  if (value === 1) {
    return 'TO';
  }
  return value === 2 ? 'FROM' : null;
}

/** `HSI_source_select_pilot`: 0 NAV1, 1 NAV2, 2 GPS1, 3 GPS2. */
export const NAV_SOURCES = [
  { value: 0, label: 'NAV1' },
  { value: 1, label: 'NAV2' },
  { value: 2, label: 'GPS' },
] as const;

const SOURCE_LABELS = ['NAV1', 'NAV2', 'GPS', 'GPS2'] as const;

export function sourceLabel(value: number | null): string | null {
  return value === null ? null : (SOURCE_LABELS[value] ?? null);
}

/** Garmin's convention: radio guidance is green, GPS guidance magenta. */
export function sourceKind(value: number | null): 'nav' | 'gps' | null {
  if (value === 0 || value === 1) {
    return 'nav';
  }
  return value === 2 || value === 3 ? 'gps' : null;
}

/** R7: a pointer without a signal is hidden, never drawn at 0°. */
export function bearingPointer(bearing: number | null, signal: number | null): number | null {
  if (signal !== 1 || bearing === null || !Number.isFinite(bearing)) {
    return null;
  }
  return (((bearing % 360) + 360) % 360) + 0;
}

/** A DME arc is flown by tenths at any range, so this always shows one decimal. */
export function formatDme(nm: number, unit: DistanceUnit): string {
  return `${convertDistance(nm, unit).toFixed(1)} ${UNIT_LABEL.distance[unit]}`;
}

function dmeShown(hasDme: number | null, distanceNm: number | null): distanceNm is number {
  return hasDme === 1 && distanceNm !== null && Number.isFinite(distanceNm) && distanceNm >= 0;
}

/** R8: distance only while X-Plane says a DME signal is present. */
export function dmeText(
  hasDme: number | null,
  distanceNm: number | null,
  unit: DistanceUnit,
): string | null {
  return dmeShown(hasDme, distanceNm) ? formatDme(distanceNm, unit) : null;
}

const DISTANCE_WORDS: Record<DistanceUnit, string> = {
  nm: 'nautical miles',
  km: 'kilometres',
};

/** The same distance as `dmeText`, its unit spoken in full for the accessible label. */
export function dmeWords(
  hasDme: number | null,
  distanceNm: number | null,
  unit: DistanceUnit,
): string | null {
  if (!dmeShown(hasDme, distanceNm)) {
    return null;
  }
  return `${convertDistance(distanceNm, unit).toFixed(1)} ${DISTANCE_WORDS[unit]}`;
}

export function dmeTimeText(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
    return null;
  }
  return `${Math.round(minutes)} MIN`;
}

export type Marker = 'outer' | 'middle' | 'inner';

export function markerLit(
  outer: number | null,
  middle: number | null,
  inner: number | null,
): Marker | null {
  if (inner === 1) {
    return 'inner';
  }
  if (middle === 1) {
    return 'middle';
  }
  return outer === 1 ? 'outer' : null;
}
