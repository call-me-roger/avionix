import { type LatLon, wrapLongitude } from '@/domain/map/map-data';
import { type DistanceUnit, KM_PER_NM } from '@/domain/units/units';

const NM_PER_DEG = 60;
const EARTH_RADIUS_NM = 3440.065;
const RAD = Math.PI / 180;

/** Nautical miles from the anchor: x east, y south (screen down). */
export interface PlanePoint {
  x: number;
  y: number;
}

/** Local equirectangular (spec §4.3), Δlon wrapped so the antimeridian is seamless. */
export function project(anchor: LatLon, point: LatLon): PlanePoint {
  return projectOffset(anchor, point.lat, wrapLongitude(point.lon - anchor.lon));
}

/** As `project`, for a longitude offset from the anchor the caller has already chosen. */
export function projectOffset(anchor: LatLon, lat: number, dLon: number): PlanePoint {
  return {
    x: dLon * NM_PER_DEG * Math.cos(anchor.lat * RAD),
    y: -(lat - anchor.lat) * NM_PER_DEG,
  };
}

export function unproject(anchor: LatLon, point: PlanePoint): LatLon {
  const cos = Math.max(1e-6, Math.cos(anchor.lat * RAD));
  return {
    lat: Math.max(-90, Math.min(90, anchor.lat - point.y / NM_PER_DEG)),
    lon: wrapLongitude(anchor.lon + point.x / (NM_PER_DEG * cos)),
  };
}

export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = wrapLongitude(b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rangeInNm(range: number, unit: DistanceUnit): number {
  return unit === 'nm' ? range : range / KM_PER_NM;
}
