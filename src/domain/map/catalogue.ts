/** F-13: the moving map's names, ranges and orientations. Verified against the 12.4.3 database. */
export const FEATURE_MOVING_MAP = 'moving-map';

export const MAP_DATAREFS = {
  latitude: 'sim/flightmodel/position/latitude',
  longitude: 'sim/flightmodel/position/longitude',
  /** Metres MSL: the GPS altitude, never the barometric one. */
  elevation: 'sim/flightmodel/position/elevation',
  trueHeading: 'sim/flightmodel/position/true_psi',
  /** "The heading the aircraft actually flies": the true track. */
  trueTrack: 'sim/flightmodel/position/hpath',
} as const;

/** In the pilot's distance unit (spec ruling 5). */
export const MAP_RANGES = [2, 5, 10, 20, 40, 80, 160] as const;
export type MapRange = (typeof MAP_RANGES)[number];
export const DEFAULT_MAP_RANGE: MapRange = 10;

export type MapOrientation = 'north' | 'track';
export const DEFAULT_MAP_ORIENTATION: MapOrientation = 'north';
