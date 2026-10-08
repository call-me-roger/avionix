import type { Density } from '@/domain/map/density';
import type { LatLon, MapCell } from '@/domain/map/map-data';
import { type PlanePoint, project } from '@/domain/map/projection';

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

function path(rings: readonly LatLon[][], anchor: LatLon, close: boolean): string {
  let d = '';
  for (const ring of rings) {
    ring.forEach((point, i) => {
      const p = project(anchor, point);
      d += `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`;
    });
    if (close && ring.length > 0) {
      d += 'Z';
    }
  }
  return d;
}

/** Cells → path strings in anchor-plane NM, built only when the anchor or density changes. */
export function buildLayers(
  cells: readonly MapCell[],
  cellKeys: readonly string[],
  anchor: LatLon,
  density: Density,
  pxPerNm: number,
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
      runways.push({
        key: `${cellKeys[c]}/${r}`,
        from: project(anchor, runway.ends[0]),
        to: project(anchor, runway.ends[1]),
        width: Math.max(minWidth, runway.widthFt / FEET_PER_NM),
      });
    });
    if (density.minLabelFt !== null) {
      const minLabelFt = density.minLabelFt;
      cell.airports.forEach((airport, a) => {
        if (airport.longestFt >= minLabelFt) {
          labels.push({
            key: `${cellKeys[c]}/${a}`,
            ident: airport.ident,
            at: project(anchor, airport.position),
          });
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
