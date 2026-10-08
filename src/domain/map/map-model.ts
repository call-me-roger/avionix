import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { MAP_DATAREFS as M } from '@/domain/map/catalogue';
import type { LatLon } from '@/domain/map/map-data';

/** F-12's three answers per name: resolved, definitively missing, or not checked yet. */
export interface MapReader {
  has(name: string): boolean;
  missing(name: string): boolean;
  number(name: string): number | null;
}

export type MapStatus = 'unchecked' | 'unavailable' | 'waiting' | 'ready';

export interface MapModel {
  status: MapStatus;
  position: LatLon | null;
  elevationM: number | null;
  trueHeading: number | null;
  trueTrack: number | null;
  groundSpeedKt: number | null;
  magneticTrack: number | null;
  /** Both true track and true heading definitively missing, not merely pending or unchecked. */
  directionMissing: boolean;
}

const NOTHING: Omit<MapModel, 'status'> = {
  position: null,
  elevationM: null,
  trueHeading: null,
  trueTrack: null,
  groundSpeedKt: null,
  magneticTrack: null,
  directionMissing: false,
};

/** Spec §4.7: only a definitive miss of the position makes the map unavailable. */
export function mapModel(reader: MapReader): MapModel {
  const required = [M.latitude, M.longitude];
  if (required.some((name) => reader.missing(name))) {
    return { status: 'unavailable', ...NOTHING };
  }
  if (!required.every((name) => reader.has(name))) {
    return { status: 'unchecked', ...NOTHING };
  }
  const lat = reader.number(M.latitude);
  const lon = reader.number(M.longitude);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { status: 'waiting', ...NOTHING };
  }
  const optional = (name: string) => (reader.has(name) ? reader.number(name) : null);
  return {
    status: 'ready',
    position: { lat, lon },
    elevationM: optional(M.elevation),
    trueHeading: optional(M.trueHeading),
    trueTrack: optional(M.trueTrack),
    groundSpeedKt: optional(D.groundSpeed),
    magneticTrack: optional(D.groundTrack),
    directionMissing: reader.missing(M.trueTrack) && reader.missing(M.trueHeading),
  };
}
