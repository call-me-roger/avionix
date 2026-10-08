#!/usr/bin/env node
// Regenerates assets/map/basemap.json and assets/map/runways.json (F-13 spec §4.2).
//   node scripts/build-map-data.mjs <source-dir> [--download]
// <source-dir> holds ne_50m_land.geojson, ne_50m_lakes.geojson,
// ne_50m_admin_0_boundary_lines_land.geojson, airports.csv and runways.csv; --download fetches
// them first. Both sources are public domain (docs/roadmap/research/moving-map.md).
// Natural Earth's geometry is already split at ±180°, so each ring is clipped to its cells as
// is, with no antimeridian handling here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CELL_DEG = 5;
const OUTLINE_QUANTUM = 0.001;
const OUTLINE_TOLERANCE = 0.005;
const RUNWAY_QUANTUM = 0.00001;
const DEFAULT_WIDTH_FT = 75;
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const OA = 'https://davidmegginson.github.io/ourairports-data';
const SOURCES = {
  'ne_50m_land.geojson': `${NE}/ne_50m_land.geojson`,
  'ne_50m_lakes.geojson': `${NE}/ne_50m_lakes.geojson`,
  'ne_50m_admin_0_boundary_lines_land.geojson': `${NE}/ne_50m_admin_0_boundary_lines_land.geojson`,
  'airports.csv': `${OA}/airports.csv`,
  'runways.csv': `${OA}/runways.csv`,
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [sourceDir, flag] = process.argv.slice(2);
if (!sourceDir) {
  console.error('usage: node scripts/build-map-data.mjs <source-dir> [--download]');
  process.exit(1);
}
if (flag === '--download') {
  mkdirSync(sourceDir, { recursive: true });
  for (const [file, url] of Object.entries(SOURCES)) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`download failed: ${file}`);
    }
    writeFileSync(join(sourceDir, file), Buffer.from(await response.arrayBuffer()));
  }
}
const today = new Date().toISOString().slice(0, 10);

/** Every ring or line of a GeoJSON file as [lon, lat] arrays. */
function geometries(file) {
  const json = JSON.parse(readFileSync(join(sourceDir, file), 'utf8'));
  const out = [];
  for (const feature of json.features) {
    const { type, coordinates } = feature.geometry;
    if (type === 'Polygon') out.push(...coordinates);
    else if (type === 'MultiPolygon') coordinates.forEach((polygon) => out.push(...polygon));
    else if (type === 'LineString') out.push(coordinates);
    else if (type === 'MultiLineString') out.push(...coordinates);
  }
  return out;
}

/** Douglas–Peucker; a closed ring (first point = last) measures from the first point. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let max = 0;
    let index = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      const d =
        length < 1e-12
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (max > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Sutherland–Hodgman against an axis-aligned box: fills stay correct when a ring is cut. */
function clipPolygon(ring, box) {
  const edges = [
    (p) => p[0] >= box.west,
    (p) => p[0] <= box.east,
    (p) => p[1] >= box.south,
    (p) => p[1] <= box.north,
  ];
  const cut = [
    (a, b) => at(a, b, (box.west - a[0]) / (b[0] - a[0])),
    (a, b) => at(a, b, (box.east - a[0]) / (b[0] - a[0])),
    (a, b) => at(a, b, (box.south - a[1]) / (b[1] - a[1])),
    (a, b) => at(a, b, (box.north - a[1]) / (b[1] - a[1])),
  ];
  let output = ring;
  for (let e = 0; e < 4 && output.length > 0; e += 1) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const inCurrent = edges[e](current);
      const inPrevious = edges[e](previous);
      if (inCurrent) {
        if (!inPrevious) output.push(cut[e](previous, current));
        output.push(current);
      } else if (inPrevious) {
        output.push(cut[e](previous, current));
      }
    }
  }
  return output;
}

function at(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Liang–Barsky per segment, joining consecutive inside pieces into polylines. */
function clipLine(line, box) {
  const pieces = [];
  let current = [];
  for (let i = 0; i + 1 < line.length; i += 1) {
    const segment = clipSegment(line[i], line[i + 1], box);
    if (segment === null) {
      if (current.length > 1) pieces.push(current);
      current = [];
      continue;
    }
    const [p, q] = segment;
    const last = current[current.length - 1];
    if (last === undefined || last[0] !== p[0] || last[1] !== p[1]) {
      if (current.length > 1) pieces.push(current);
      current = [p];
    }
    current.push(q);
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

function clipSegment(a, b, box) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const checks = [
    [-dx, a[0] - box.west],
    [dx, box.east - a[0]],
    [-dy, a[1] - box.south],
    [dy, box.north - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [at(a, b, t0), at(a, b, t1)];
}

function cellBox(row, col) {
  return {
    south: row * CELL_DEG,
    north: (row + 1) * CELL_DEG,
    west: col * CELL_DEG,
    east: (col + 1) * CELL_DEG,
  };
}

function cellsOverlapping(points) {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const [lon, lat] of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lon);
    east = Math.max(east, lon);
  }
  const cells = [];
  const lastRow = Math.min(17, Math.floor(north / CELL_DEG));
  const lastCol = Math.min(35, Math.floor(east / CELL_DEG));
  for (let row = Math.max(-18, Math.floor(south / CELL_DEG)); row <= lastRow; row += 1) {
    for (let col = Math.max(-36, Math.floor(west / CELL_DEG)); col <= lastCol; col += 1) {
      cells.push([row, col]);
    }
  }
  return cells;
}

/** [lon, lat] points → [lat0, lon0, dLat, dLon, ...] quantised, repeated points dropped. */
function encode(points, quantum) {
  const out = [];
  let previousLat = 0;
  let previousLon = 0;
  let count = 0;
  for (const [lon, lat] of points) {
    const qLat = Math.round(lat / quantum);
    const qLon = Math.round(lon / quantum);
    if (count > 0 && qLat === previousLat && qLon === previousLon) continue;
    out.push(count === 0 ? qLat : qLat - previousLat, count === 0 ? qLon : qLon - previousLon);
    previousLat = qLat;
    previousLon = qLon;
    count += 1;
  }
  return { out, count };
}

function outlineLayer(file, polygon, cells, layer) {
  for (const raw of geometries(file)) {
    const simplified = simplify(raw, OUTLINE_TOLERANCE);
    for (const [row, col] of cellsOverlapping(simplified)) {
      const box = cellBox(row, col);
      const parts = polygon ? [clipPolygon(simplified, box)] : clipLine(simplified, box);
      for (const part of parts) {
        const { out, count } = encode(part, OUTLINE_QUANTUM);
        if (count < (polygon ? 3 : 2)) continue;
        const key = `${row}:${col}`;
        cells[key] ??= { land: [], lakes: [], borders: [] };
        cells[key][layer].push(out);
      }
    }
  }
}

function parseCsv(file) {
  const text = readFileSync(join(sourceDir, file), 'utf8');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((name, i) => [name, values[i] ?? ''])));
}

function num(text) {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

function buildRunways() {
  const airports = new Map();
  for (const a of parseCsv('airports.csv')) {
    if (a.type === 'closed' || a.type === 'heliport' || a.type === 'seaplane_base') continue;
    const lat = num(a.latitude_deg);
    const lon = num(a.longitude_deg);
    if (lat === null || lon === null) continue;
    airports.set(a.id, { ident: a.icao_code || a.gps_code || a.ident, lat, lon, runways: [] });
  }
  for (const r of parseCsv('runways.csv')) {
    if (r.closed === '1' || /wat/i.test(r.surface)) continue;
    const airport = airports.get(r.airport_ref);
    const ends = [r.le_latitude_deg, r.le_longitude_deg, r.he_latitude_deg, r.he_longitude_deg].map(
      num,
    );
    if (airport === undefined || ends.some((value) => value === null)) continue;
    const [lat1, lon1, lat2, lon2] = ends;
    const lengthFt =
      num(r.length_ft) ??
      Math.hypot((lat2 - lat1) * 60, (lon2 - lon1) * 60 * Math.cos((lat1 * Math.PI) / 180)) * 6076;
    airport.runways.push({
      lat1,
      lon1,
      lat2,
      lon2,
      widthFt: num(r.width_ft) ?? DEFAULT_WIDTH_FT,
      lengthFt,
    });
  }
  const cells = {};
  const q = (value) => Math.round(value / RUNWAY_QUANTUM);
  const sorted = [...airports.values()]
    .filter((airport) => airport.runways.length > 0)
    .sort((a, b) => a.ident.localeCompare(b.ident));
  for (const airport of sorted) {
    const row = Math.floor(airport.lat / CELL_DEG);
    const col = Math.floor(((((airport.lon + 180) % 360) + 360) % 360) / CELL_DEG) - 36;
    const key = `${row}:${col}`;
    cells[key] ??= { airports: [], runways: [] };
    const cell = cells[key];
    const index = cell.airports.length;
    const longest = Math.round(Math.max(...airport.runways.map((runway) => runway.lengthFt)));
    cell.airports.push([airport.ident, q(airport.lat), q(airport.lon), longest]);
    for (const runway of airport.runways) {
      cell.runways.push([
        index,
        q(runway.lat1),
        q(runway.lon1),
        q(runway.lat2) - q(runway.lat1),
        q(runway.lon2) - q(runway.lon1),
        Math.round(runway.widthFt),
      ]);
    }
  }
  return cells;
}

function sortedCells(cells) {
  return Object.fromEntries(
    Object.keys(cells)
      .sort()
      .map((key) => [key, cells[key]]),
  );
}

const outlines = {};
outlineLayer('ne_50m_land.geojson', true, outlines, 'land');
outlineLayer('ne_50m_lakes.geojson', true, outlines, 'lakes');
outlineLayer('ne_50m_admin_0_boundary_lines_land.geojson', false, outlines, 'borders');

mkdirSync(join(root, 'assets/map'), { recursive: true });
writeFileSync(
  join(root, 'assets/map/basemap.json'),
  JSON.stringify({
    source: `Natural Earth 1:50m land, lakes and land borders, fetched ${today}`,
    quantum: OUTLINE_QUANTUM,
    cellDeg: CELL_DEG,
    cells: sortedCells(outlines),
  }),
);
writeFileSync(
  join(root, 'assets/map/runways.json'),
  JSON.stringify({
    source: `OurAirports airports and runways, fetched ${today}`,
    quantum: RUNWAY_QUANTUM,
    cellDeg: CELL_DEG,
    cells: sortedCells(buildRunways()),
  }),
);
