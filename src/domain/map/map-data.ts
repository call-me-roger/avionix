/**
 * The bundled outline and runway snapshot (F-13 spec §4.2): two files cut into 5° cells by
 * `scripts/build-map-data.mjs`, decoded here one cell at a time, on demand, and cached.
 */
export const CELL_DEG = 5;
const ROWS = { min: -18, max: 17 } as const;
const COLUMNS = 360 / CELL_DEG;
const NM_PER_DEG = 60;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Airport {
  /** ICAO code, else GPS code, else OurAirports' own identifier. */
  ident: string;
  position: LatLon;
  longestFt: number;
}

export interface Runway {
  /** Index into the same cell's `airports`. */
  airport: number;
  ends: readonly [LatLon, LatLon];
  widthFt: number;
}

export interface MapCell {
  land: LatLon[][];
  lakes: LatLon[][];
  borders: LatLon[][];
  airports: Airport[];
  runways: Runway[];
}

/** `[lat0, lon0, dLat, dLon, ...]` in multiples of `quantum`. */
type Encoded = number[];

export interface BasemapFile {
  source: string;
  quantum: number;
  cellDeg: number;
  cells: Record<string, { land: Encoded[]; lakes: Encoded[]; borders: Encoded[] }>;
}

export interface RunwayFile {
  source: string;
  quantum: number;
  cellDeg: number;
  cells: Record<
    string,
    {
      /** `[ident, lat, lon, longestFt]`, lat and lon in multiples of `quantum`. */
      airports: [string, number, number, number][];
      /** `[airportIndex, lat1, lon1, dLat, dLon, widthFt]`. */
      runways: [number, number, number, number, number, number][];
    }
  >;
}

export interface MapData {
  cell(key: string): MapCell;
  sources: { outlines: string; runways: string };
}

export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function cellOf(point: LatLon): { row: number; col: number } {
  const row = Math.min(ROWS.max, Math.max(ROWS.min, Math.floor(point.lat / CELL_DEG)));
  return { row, col: Math.floor(wrapLongitude(point.lon) / CELL_DEG) };
}

/** Every cell a circle of `radiusNm` around `centre` touches, across the antimeridian. */
export function cellsAround(centre: LatLon, radiusNm: number): string[] {
  const dLat = radiusNm / NM_PER_DEG;
  const south = Math.max(-90, centre.lat - dLat);
  const north = Math.min(90, centre.lat + dLat);
  const widest = Math.max(Math.abs(south), Math.abs(north));
  const cos = Math.cos((widest * Math.PI) / 180);
  const dLon = cos < 0.01 ? 180 : dLat / cos;
  const firstRow = cellOf({ lat: south, lon: 0 }).row;
  const lastRow = cellOf({ lat: north, lon: 0 }).row;
  const columns: number[] = [];
  if (dLon >= 180) {
    for (let col = -COLUMNS / 2; col < COLUMNS / 2; col += 1) {
      columns.push(col);
    }
  } else {
    const first = Math.floor((centre.lon - dLon) / CELL_DEG);
    const last = Math.floor((centre.lon + dLon) / CELL_DEG);
    for (let col = first; col <= last; col += 1) {
      const wrapped = ((((col + COLUMNS / 2) % COLUMNS) + COLUMNS) % COLUMNS) - COLUMNS / 2;
      if (!columns.includes(wrapped)) {
        columns.push(wrapped);
      }
    }
  }
  const keys: string[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (const col of columns) {
      keys.push(cellKey(row, col));
    }
  }
  return keys;
}

export function decodeLine(encoded: readonly number[], quantum: number): LatLon[] {
  const points: LatLon[] = [];
  let lat = 0;
  let lon = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    lat += encoded[i]!;
    lon += encoded[i + 1]!;
    points.push({ lat: round(lat * quantum), lon: round(lon * quantum) });
  }
  return points;
}

/** Quantised integers times a decimal quantum: trim the binary noise (0.1 + 0.2). */
function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

const EMPTY: MapCell = Object.freeze({
  land: [],
  lakes: [],
  borders: [],
  airports: [],
  runways: [],
}) as MapCell;

export function createMapData(basemap: BasemapFile, runways: RunwayFile): MapData {
  const cache = new Map<string, MapCell>();
  return {
    sources: { outlines: basemap.source, runways: runways.source },
    cell(key) {
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const outlines = basemap.cells[key];
      const fields = runways.cells[key];
      if (outlines === undefined && fields === undefined) {
        return EMPTY;
      }
      const q = runways.quantum;
      const decoded: MapCell = {
        land: (outlines?.land ?? []).map((ring) => decodeLine(ring, basemap.quantum)),
        lakes: (outlines?.lakes ?? []).map((ring) => decodeLine(ring, basemap.quantum)),
        borders: (outlines?.borders ?? []).map((line) => decodeLine(line, basemap.quantum)),
        airports: (fields?.airports ?? []).map(([ident, lat, lon, longestFt]) => ({
          ident,
          position: { lat: round(lat * q), lon: round(lon * q) },
          longestFt,
        })),
        runways: (fields?.runways ?? []).map(([airport, lat, lon, dLat, dLon, widthFt]) => ({
          airport,
          ends: [
            { lat: round(lat * q), lon: round(lon * q) },
            { lat: round((lat + dLat) * q), lon: round((lon + dLon) * q) },
          ] as const,
          widthFt,
        })),
      };
      cache.set(key, decoded);
      return decoded;
    },
  };
}
