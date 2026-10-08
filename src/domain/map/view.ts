import type { MapOrientation } from '@/domain/map/catalogue';
import type { LatLon } from '@/domain/map/map-data';
import { type PlanePoint, distanceNm } from '@/domain/map/projection';

/** Spec §4.4: the symbol's height in track-up, and the ring's share of the space it fits. */
export const TRACK_UP_ANCHOR = 0.7;
export const RING_FIT = 0.9;
const RAD = Math.PI / 180;

export interface MapView {
  /** Where the map's centre (the symbol, unless panned) sits on screen. */
  anchorX: number;
  anchorY: number;
  /** Degrees the map is turned, clockwise positive (SVG); −direction in track-up. */
  rotation: number;
  pxPerNm: number;
  ringRadiusPx: number;
  /** From the anchor to the farthest corner, in NM: how far the drawn cells must reach. */
  visibleRadiusNm: number;
  trackUp: boolean;
}

export function mapView(input: {
  width: number;
  height: number;
  orientation: MapOrientation;
  rangeNm: number;
  direction: number | null;
}): MapView | null {
  const { width, height, rangeNm, direction } = input;
  if (width <= 0 || height <= 0 || rangeNm <= 0) {
    return null;
  }
  const trackUp = input.orientation === 'track' && direction !== null;
  const anchorX = width / 2;
  const anchorY = trackUp ? height * TRACK_UP_ANCHOR : height / 2;
  const ringRadiusPx = RING_FIT * Math.min(width / 2, anchorY);
  const pxPerNm = ringRadiusPx / rangeNm;
  const corner = Math.max(Math.hypot(anchorX, anchorY), Math.hypot(anchorX, height - anchorY));
  return {
    anchorX,
    anchorY,
    rotation: trackUp && direction !== null ? -direction : 0,
    pxPerNm,
    ringRadiusPx,
    visibleRadiusNm: corner / pxPerNm,
    trackUp,
  };
}

export function toScreen(view: MapView, offset: PlanePoint): { x: number; y: number } {
  const cos = Math.cos(view.rotation * RAD);
  const sin = Math.sin(view.rotation * RAD);
  return {
    x: view.anchorX + (offset.x * cos - offset.y * sin) * view.pxPerNm,
    y: view.anchorY + (offset.x * sin + offset.y * cos) * view.pxPerNm,
  };
}

export function screenDeltaToPlane(view: MapView, dx: number, dy: number): PlanePoint {
  const cos = Math.cos(-view.rotation * RAD);
  const sin = Math.sin(-view.rotation * RAD);
  return {
    x: (dx * cos - dy * sin) / view.pxPerNm,
    y: (dx * sin + dy * cos) / view.pxPerNm,
  };
}

/** The one transform a tick changes: everything inside is in anchor-plane NM. */
export function groupTransform(view: MapView, centre: PlanePoint): string {
  const n = (value: number) => Number(value.toFixed(4));
  return `translate(${n(view.anchorX)} ${n(view.anchorY)}) rotate(${n(view.rotation)}) scale(${n(view.pxPerNm)}) translate(${n(-centre.x)} ${n(-centre.y)})`;
}

/** Spec §4.3: paths are rebuilt only once the centre drifts a quarter range from the anchor. */
export function needsReanchor(anchor: LatLon | null, centre: LatLon, rangeNm: number): boolean {
  return anchor === null || distanceNm(anchor, centre) > rangeNm / 4;
}
