import type { Density } from '@/domain/map/density';
import { type LatLon, type MapCell, wrapLongitude } from '@/domain/map/map-data';
import { type PlanePoint, project, projectOffset } from '@/domain/map/projection';

const FEET_PER_NM = 6076.12;
/** A runway is never thinner than this on screen (spec §4.2). */
const MIN_RUNWAY_PX = 2;
/** Identifiers drawn at most: a dense area at 20 nm must stay readable. */
export const MAX_LABELS = 60;

export interface RunwayLine {
  key: string;
  from: PlanePoint;
  to: PlanePoint;
  /** In plane NM, already widened to the on-screen minimum. */
  width: number;
}

export interface AirportLabel {
  key: string;
  ident: string;
  at: PlanePoint;
}

export interface MapLayers {
  land: string;
  lakes: string;
  borders: string;
  runways: RunwayLine[];
  labels: AirportLabel[];
}

function n(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Each ring stays continuous: a point's longitude offset follows on from the previous point's, so
 * a ring straddling anchor.lon ± 180° (every column is drawn near a pole) never jumps across the
 * map. The data is already split at ±180°, so only that far seam needs it.
 */
function path(rings: readonly LatLon[][], anchor: LatLon, close: boolean): string {
  let d = '';
  for (const ring of rings) {
    let dLon = 0;
    ring.forEach((point, i) => {
      dLon =
        i === 0
          ? wrapLongitude(point.lon - anchor.lon)
          : dLon + wrapLongitude(point.lon - ring[i - 1]!.lon);
      const p = projectOffset(anchor, point.lat, dLon);
      d += `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`;
    });
    if (close && ring.length > 0) {
      d += 'Z';
    }
  }
  return d;
}

/** How near the segment from `a` to `b` comes to the anchor (the plane's origin), in NM. */
function nearestNm(a: PlanePoint, b: PlanePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length2));
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

/**
 * Cells → path strings in anchor-plane NM, built only when the anchor or density changes. Runways
 * and identifiers farther than `reachNm` from the anchor are left out: the reach cells hold far
 * more of them than the view can show.
 */
export function buildLayers(
  cells: readonly MapCell[],
  cellKeys: readonly string[],
  anchor: LatLon,
  density: Density,
  pxPerNm: number,
  reachNm: number,
): MapLayers {
  const runways: RunwayLine[] = [];
  const labels: AirportLabel[] = [];
  const minWidth = MIN_RUNWAY_PX / pxPerNm;
  cells.forEach((cell, c) => {
    cell.runways.forEach((runway, r) => {
      const airport = cell.airports[runway.airport];
      if (airport === undefined || airport.longestFt < density.minAirportFt) {
        return;
      }
      const from = project(anchor, runway.ends[0]);
      const to = project(anchor, runway.ends[1]);
      if (nearestNm(from, to) > reachNm) {
        return;
      }
      runways.push({
        key: `${cellKeys[c]}/${r}`,
        from,
        to,
        width: Math.max(minWidth, runway.widthFt / FEET_PER_NM),
      });
    });
    if (density.minLabelFt !== null) {
      const minLabelFt = density.minLabelFt;
      cell.airports.forEach((airport, a) => {
        const at = project(anchor, airport.position);
        if (airport.longestFt >= minLabelFt && Math.hypot(at.x, at.y) <= reachNm) {
          labels.push({ key: `${cellKeys[c]}/${a}`, ident: airport.ident, at });
        }
      });
    }
  });
  // Nearest first, so a dense area keeps the identifiers closest to the aircraft.
  labels.sort((a, b) => Math.hypot(a.at.x, a.at.y) - Math.hypot(b.at.x, b.at.y));
  labels.length = Math.min(labels.length, MAX_LABELS);
  return {
    land: path(
      cells.flatMap((cell) => cell.land),
      anchor,
      true,
    ),
    lakes: path(
      cells.flatMap((cell) => cell.lakes),
      anchor,
      true,
    ),
    borders: path(
      cells.flatMap((cell) => cell.borders),
      anchor,
      false,
    ),
    runways,
    labels,
  };
}
