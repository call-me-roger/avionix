# F-13 Moving Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Map panel that draws the ownship on a bundled outline map, with runways and airport
identifiers, track-up/north-up, range rings and a readout. It works with no internet.

**Architecture:**
- **Data:** a build script turns Natural Earth 1:50m outlines and OurAirports runways into two
  JSON files cut into 5° cells (`assets/map/`). They are required lazily on first use and decoded
  per cell by a pure domain module.
- **Domain logic:** pure functions in `src/domain/map/` decide everything: projection, direction,
  density, view geometry, the model and formatting.
- **Rendering:** the panel draws with `react-native-svg`. A telemetry tick only changes one group
  transform; paths are rebuilt only when the anchor moves.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict, react-native-svg 15,
zod v4, Jest (node, expo projects), RNTL 14.

**Spec:** `docs/superpowers/specs/2026-10-07-moving-map-design.md`

## Global Constraints

- **Gate:** `npm run typecheck && npm run lint && npm run format:check && npx jest` must pass,
  with no new warnings.
- **Hard rules:**
  - Never launch Xcode, Android Studio, simulators, emulators, `expo start` or EAS builds.
  - Never render, log or serialise a token, pairing code, URL, HTTP status, exception text, DataRef
    or command name or id, or protocol payload in UI or logs.
  - The map writes no DataRef and activates no command (R12).
- **Commits:** commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Profile:** `generic` becomes **1.10.0**. The new feature id is `moving-map`, labelled "Moving
  map".
- **Ranges:** `[2, 5, 10, 20, 40, 80, 160]` in the pilot's distance unit (`nm` | `km`); the
  default is 10 and the default orientation north-up.
- **Direction:** true track at or above 5 kt, back to true heading below 3 kt (hysteresis).
- **Track-up:** the symbol sits at 70% of the map height. The ring radius is 0.9 × min(half width,
  distance from the symbol to the top edge); in north-up the second term is half the height.
- **Auto-centre** returns 30 s after the last touch.
- **Credit line, verbatim:** "Outlines: Natural Earth. Runways: OurAirports. Not for navigation."
- **No smoothing:** a value is drawn exactly as received, never interpolated or extrapolated.
- **RNTL 14:**
  - `render`, `rerender` and `fireEvent` are awaited;
  - hidden elements need `{ includeHiddenElements: true }`;
  - lint applies the react-hooks v7 rules, so no ref reads during render. Derived state uses the
    "adjust state during render" pattern.

## Review Focus

1. **The antimeridian.** Flying across 180° (Fiji, Kamchatka), the outlines and the symbol must
   stay continuous, with no map-wide line and no jump. Pinned in Task 1 (`cellsAround`) and Task 2
   (`project` wraps Δlon).
2. **A position that arrives before the layout is measured, or with zero size.** The map must not
   divide by zero or produce NaN transforms. Pinned in Task 3 (`mapView` with width or height 0).
3. **Range or unit changed while panned.** The panned centre is kept and the rings relabel. Pinned
   in Task 5.
4. **Lat/lon of exactly 0,0 or out of range** (a garbage frame during a flight load). Out of range
   must count as "waiting" and never place the symbol off the planet. Pinned in Task 2
   (`mapModel`).
5. **The stale link while panned.** The hollow symbol and "LAST KNOWN" still show at the symbol's
   panned screen position. Pinned in Task 4.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/build-map-data.mjs` | Download (optional), simplify, clip into 5° cells, quantise and write the two JSON files |
| `assets/map/basemap.json`, `assets/map/runways.json` | Generated, committed data (Prettier already ignores `assets/`) |
| `src/domain/map/map-data.ts` | Data file types, cell maths, decoding, a caching `MapData` |
| `src/infrastructure/map/bundled-map-data.ts` | Lazily `require`s the two JSON files once |
| `src/domain/map/catalogue.ts` | Feature id, DataRef names, ranges, orientation type |
| `src/domain/map/projection.ts` | Equirectangular plane around an anchor, great-circle distance |
| `src/domain/map/direction.ts` | Track/heading choice with hysteresis |
| `src/domain/map/density.ts` | What each range draws |
| `src/domain/map/map-format.ts` | Position, altitude and range text, spoken position |
| `src/domain/map/map-model.ts` | `MapReader` → model (three answers) |
| `src/domain/map/messages.ts` | Sentences |
| `src/domain/map/view.ts` | Screen geometry: anchor point, rotation, scale, re-anchor rule, transforms |
| `src/features/panels/map/map-preference.ts` | `avionix.map` load and save |
| `src/features/panels/map/MapPreferenceProvider.tsx` | Context and the `useMapPreference()` hook |
| `src/features/panels/map/map-reader.ts` | Snapshot → `MapReader` |
| `src/features/panels/map/MapPanel.tsx` | Descriptor, layout, states, controls |
| `src/features/panels/map/MapCanvas.tsx` | The SVG: layers, rings, ownship, labels |
| `src/features/panels/map/map-layers.ts` | Cells → SVG path strings and label lists (pure, memoised by the canvas) |
| `src/features/panels/map/MapReadout.tsx` | Readout row |
| `src/features/panels/map/useMapPan.ts` | Pan responder state and auto-centre |

---

### Task 1: Map data pipeline and decoder

**Files:**
- Create: `scripts/build-map-data.mjs`
- Create (generated): `assets/map/basemap.json`, `assets/map/runways.json`
- Create: `src/domain/map/map-data.ts`
- Create: `src/infrastructure/map/bundled-map-data.ts`
- Test: `tests/unit/domain/map-data.test.ts`

**Interfaces:**
- Produces:
  - `CELL_DEG = 5`
  - `interface LatLon { lat: number; lon: number }`
  - `wrapLongitude(lon: number): number`, mapping to [−180, 180)
  - `cellOf(point: LatLon): { row: number; col: number }`
  - `cellKey(row: number, col: number): string`
  - `cellsAround(centre: LatLon, radiusNm: number): string[]`
  - `interface Airport { ident: string; position: LatLon; longestFt: number }`
  - `interface Runway { airport: number; ends: readonly [LatLon, LatLon]; widthFt: number }`
  - `interface MapCell { land: LatLon[][]; lakes: LatLon[][]; borders: LatLon[][]; airports: Airport[]; runways: Runway[] }`
  - `interface MapData { cell(key: string): MapCell; sources: { outlines: string; runways: string } }`
  - `createMapData(basemap: BasemapFile, runways: RunwayFile): MapData`
  - `bundledMapData(): MapData`
  - `decodeLine(encoded: readonly number[], quantum: number): LatLon[]`

- [ ] **Step 1: Write the build script**

`scripts/build-map-data.mjs`:

```js
#!/usr/bin/env node
// Regenerates assets/map/basemap.json and assets/map/runways.json (F-13 spec §4.2).
//   node scripts/build-map-data.mjs <source-dir> [--download]
// <source-dir> holds ne_50m_land.geojson, ne_50m_lakes.geojson,
// ne_50m_admin_0_boundary_lines_land.geojson, airports.csv and runways.csv; --download fetches
// them first. Both sources are public domain (docs/roadmap/research/moving-map.md).
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
    const ends = [r.le_latitude_deg, r.le_longitude_deg, r.he_latitude_deg, r.he_longitude_deg].map(num);
    if (airport === undefined || ends.some((value) => value === null)) continue;
    const [lat1, lon1, lat2, lon2] = ends;
    const lengthFt =
      num(r.length_ft) ??
      Math.hypot((lat2 - lat1) * 60, (lon2 - lon1) * 60 * Math.cos((lat1 * Math.PI) / 180)) * 6076;
    airport.runways.push({ lat1, lon1, lat2, lon2, widthFt: num(r.width_ft) ?? DEFAULT_WIDTH_FT, lengthFt });
  }
  const cells = {};
  const q = (value) => Math.round(value / RUNWAY_QUANTUM);
  const sorted = [...airports.values()]
    .filter((airport) => airport.runways.length > 0)
    .sort((a, b) => a.ident.localeCompare(b.ident));
  for (const airport of sorted) {
    const row = Math.floor(airport.lat / CELL_DEG);
    const col = Math.floor((((airport.lon + 180) % 360) + 360) % 360 / CELL_DEG) - 36;
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
  return Object.fromEntries(Object.keys(cells).sort().map((key) => [key, cells[key]]));
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
```

- [ ] **Step 2: Generate the data**

Run: `node scripts/build-map-data.mjs "$TMPDIR/avionix-map-src" --download`

Expected:
- `assets/map/basemap.json` is about 0.6–0.8 MB and `assets/map/runways.json` about 0.5–0.9 MB.
- Check with `ls -la assets/map`. If either is over 1.5 MB, stop and report: the encoding is wrong.

Then confirm lint does not choke on the script: `npx eslint scripts/build-map-data.mjs`.
- If the expo config flags Node globals or top-level await, add
  `/* eslint-env node */`-style fixes the config needs. Do **not** add a blanket disable.
- If the config cannot lint `.mjs`, add `'scripts/*.mjs'` to the `ignores` array in
  `eslint.config.js` and say so in the report.

- [ ] **Step 3: Write the failing tests**

`tests/unit/domain/map-data.test.ts`:

```ts
import {
  type BasemapFile,
  CELL_DEG,
  type RunwayFile,
  cellKey,
  cellOf,
  cellsAround,
  createMapData,
  decodeLine,
  wrapLongitude,
} from '@/domain/map/map-data';
import { bundledMapData } from '@/infrastructure/map/bundled-map-data';

const basemap: BasemapFile = {
  source: 'test outlines',
  quantum: 0.001,
  cellDeg: 5,
  cells: {
    '9:-25': { land: [[47000, -123000, 1000, 0, 0, 1000]], lakes: [], borders: [[47500, -122500, 10, 10]] },
  },
};
const runways: RunwayFile = {
  source: 'test runways',
  quantum: 0.00001,
  cellDeg: 5,
  cells: {
    '9:-25': {
      airports: [['KSEA', 4744900, -12230930, 11901]],
      runways: [[0, 4746400, -12230800, -3000, 0, 150]],
    },
  },
};

describe('cell maths', () => {
  it('wraps longitude into [-180, 180)', () => {
    expect(wrapLongitude(180)).toBe(-180);
    expect(wrapLongitude(-181)).toBe(179);
    expect(wrapLongitude(540)).toBe(-180);
    expect(wrapLongitude(12.5)).toBe(12.5);
  });

  it('puts a point in its 5° cell', () => {
    expect(CELL_DEG).toBe(5);
    expect(cellOf({ lat: 47.449, lon: -122.309 })).toEqual({ row: 9, col: -25 });
    expect(cellOf({ lat: -0.1, lon: 179.99 })).toEqual({ row: -1, col: 35 });
    expect(cellOf({ lat: 90, lon: 0 })).toEqual({ row: 17, col: 0 });
    expect(cellKey(9, -25)).toBe('9:-25');
  });

  it('selects the cells within a radius', () => {
    const keys = cellsAround({ lat: 47.449, lon: -122.309 }, 10);
    expect(keys).toContain('9:-25');
    expect(keys).toHaveLength(1);
  });

  it('wraps across the antimeridian', () => {
    const keys = cellsAround({ lat: -17.75, lon: 179.9 }, 60);
    expect(keys).toContain('-4:35');
    expect(keys).toContain('-4:-36');
  });

  it('takes every column near a pole', () => {
    const keys = cellsAround({ lat: 88, lon: 0 }, 200);
    expect(keys.filter((key) => key.startsWith('17:'))).toHaveLength(72);
  });
});

describe('decoding', () => {
  it('turns delta-encoded quantised pairs into points', () => {
    expect(decodeLine([47000, -123000, 1000, 0, 0, 1000], 0.001)).toEqual([
      { lat: 47, lon: -123 },
      { lat: 48, lon: -123 },
      { lat: 48, lon: -122 },
    ]);
  });

  it('decodes a cell once and caches it', () => {
    const data = createMapData(basemap, runways);
    const cell = data.cell('9:-25');
    expect(cell).toBe(data.cell('9:-25'));
    expect(cell.land).toHaveLength(1);
    expect(cell.borders[0]).toEqual([
      { lat: 47.5, lon: -122.5 },
      { lat: 47.51, lon: -122.49 },
    ]);
    expect(cell.airports).toEqual([
      { ident: 'KSEA', position: { lat: 47.449, lon: -122.3093 }, longestFt: 11901 },
    ]);
    expect(cell.runways[0]!.ends[1].lat).toBeCloseTo(47.434, 6);
    expect(cell.runways[0]!.widthFt).toBe(150);
    expect(data.sources).toEqual({ outlines: 'test outlines', runways: 'test runways' });
  });

  it('gives an empty cell for open ocean', () => {
    const data = createMapData(basemap, runways);
    expect(data.cell('0:0')).toEqual({ land: [], lakes: [], borders: [], airports: [], runways: [] });
  });
});

describe('the committed snapshot', () => {
  const data = bundledMapData();

  it('stamps its sources', () => {
    expect(data.sources.outlines).toMatch(/^Natural Earth 1:50m .*fetched \d{4}-\d{2}-\d{2}$/);
    expect(data.sources.runways).toMatch(/^OurAirports .*fetched \d{4}-\d{2}-\d{2}$/);
  });

  it('has Seattle–Tacoma with its runways and land around it', () => {
    const cell = data.cell('9:-25');
    const ksea = cell.airports.findIndex((airport) => airport.ident === 'KSEA');
    expect(ksea).toBeGreaterThanOrEqual(0);
    expect(cell.runways.filter((runway) => runway.airport === ksea).length).toBeGreaterThanOrEqual(3);
    expect(cell.land.length).toBeGreaterThan(0);
  });

  it('has Heathrow', () => {
    const { row, col } = cellOf({ lat: 51.47, lon: -0.4543 });
    expect(data.cell(cellKey(row, col)).airports.some((airport) => airport.ident === 'EGLL')).toBe(true);
  });

  it('clips every outline to its own cell', () => {
    for (const key of ['9:-25', '10:-1', '-7:30']) {
      const [row, col] = key.split(':').map(Number) as [number, number];
      const cell = data.cell(key);
      for (const ring of [...cell.land, ...cell.lakes, ...cell.borders]) {
        for (const point of ring) {
          expect(point.lat).toBeGreaterThanOrEqual(row * 5 - 0.001);
          expect(point.lat).toBeLessThanOrEqual((row + 1) * 5 + 0.001);
          expect(point.lon).toBeGreaterThanOrEqual(col * 5 - 0.001);
          expect(point.lon).toBeLessThanOrEqual((col + 1) * 5 + 0.001);
        }
      }
    }
  });
});
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `npx jest tests/unit/domain/map-data.test.ts`

Expected: FAIL, because the module `@/domain/map/map-data` can't be found.

- [ ] **Step 5: Implement the decoder**

`src/domain/map/map-data.ts`:

```ts
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
```

Note: the test expects `cellOf({ lat: 90, lon: 0 }).row === 17`; the clamp provides it.

`src/infrastructure/map/bundled-map-data.ts`:

```ts
import { type BasemapFile, type MapData, type RunwayFile, createMapData } from '@/domain/map/map-data';

let loaded: MapData | null = null;

/**
 * The committed snapshot (`assets/map/`), required on first use so it costs nothing until the
 * Map panel is opened, and kept out of the TypeScript program (a 1 MB literal type is slow).
 */
export function bundledMapData(): MapData {
  if (loaded === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const basemap = require('../../../assets/map/basemap.json') as BasemapFile;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const runways = require('../../../assets/map/runways.json') as RunwayFile;
    loaded = createMapData(basemap, runways);
  }
  return loaded;
}
```

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `npx jest tests/unit/domain/map-data.test.ts`, then `npm run typecheck && npm run lint && npm run format:check`.

Expected: PASS. If "has Heathrow" or the KSEA test fails, inspect the generated data: the
ident fallback or the cell column formula in the script is wrong.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-map-data.mjs assets/map src/domain/map/map-data.ts src/infrastructure/map/bundled-map-data.ts tests/unit/domain/map-data.test.ts eslint.config.js
git commit -m "feat(map): bundled outline and runway snapshot, cut into 5° cells

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Map domain, profile 1.10.0 and mock DataRefs

**Files:**
- Create: `src/domain/map/catalogue.ts`, `projection.ts`, `direction.ts`, `density.ts`, `map-format.ts`, `map-model.ts`, `messages.ts`
- Modify: `src/domain/aircraft/profiles/generic.ts` (version, feature, doc comment)
- Modify: `tests/mock-xplane/mock-xplane-server.ts` (add `mapDataRefs(1600)`)
- Modify version and count tests:
  - `tests/ui/compatibility-screen.test.tsx:66`
  - `tests/ui/aircraft-summary.test.tsx:43`
  - `tests/unit/application/diagnostics-summary.test.ts:134`
  - `tests/unit/domain/audio-catalogue.test.ts:106`
  - `tests/unit/domain/aircraft-profile.test.ts` (lines 403–416, 420, 665)
  - `tests/integration/xplane-client.test.ts:139-143`
- Test: `tests/unit/domain/map-domain.test.ts`

**Interfaces:**
- Consumes: `LatLon`, `wrapLongitude` (Task 1).
- Produces:
  - `FEATURE_MOVING_MAP = 'moving-map'`
  - `MAP_DATAREFS { latitude, longitude, elevation, trueHeading, trueTrack }`
  - `MAP_RANGES`, `type MapRange`, `DEFAULT_MAP_RANGE = 10`
  - `type MapOrientation = 'north' | 'track'`, `DEFAULT_MAP_ORIENTATION = 'north'`
  - `interface PlanePoint { x: number; y: number }`
  - `project(anchor: LatLon, point: LatLon): PlanePoint`
  - `unproject(anchor: LatLon, point: PlanePoint): LatLon`
  - `distanceNm(a: LatLon, b: LatLon): number`
  - `rangeInNm(range: number, unit: DistanceUnit): number`
  - `interface Direction { source: 'track' | 'heading' | 'none'; degrees: number | null }`
  - `chooseDirection(input: DirectionInput, wasTrack: boolean): Direction`
  - `interface Density { minAirportFt: number; minLabelFt: number | null }`
  - `densityFor(rangeIndex: number): Density`
  - `formatPosition(lat, lon): string`, `spokenPosition(lat, lon): string`
  - `formatGpsAltitude(metres): string`, `rangeLabel(range, unit): string`
  - `interface MapReader { has(name): boolean; missing(name): boolean; number(name): number | null }`
  - `type MapStatus = 'unchecked' | 'unavailable' | 'waiting' | 'ready'`
  - `interface MapModel { status; position: LatLon | null; elevationM; trueTrack; trueHeading; groundSpeedKt; magneticTrack }`, each optional value `number | null`
  - `mapModel(reader: MapReader): MapModel`
  - `mapUnavailable(aircraft: string | null): string`, `WAITING_FOR_POSITION`, `TRACK_NOT_AVAILABLE`, `MAP_CREDIT`, `LAST_KNOWN`

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/map-domain.test.ts`:

```ts
import { findFeature } from '@/domain/aircraft/profile';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import {
  DEFAULT_MAP_ORIENTATION,
  DEFAULT_MAP_RANGE,
  FEATURE_MOVING_MAP,
  MAP_DATAREFS as M,
  MAP_RANGES,
} from '@/domain/map/catalogue';
import { densityFor } from '@/domain/map/density';
import { chooseDirection } from '@/domain/map/direction';
import { formatGpsAltitude, formatPosition, rangeLabel, spokenPosition } from '@/domain/map/map-format';
import { type MapReader, mapModel } from '@/domain/map/map-model';
import { MAP_CREDIT, mapUnavailable } from '@/domain/map/messages';
import { distanceNm, project, rangeInNm, unproject } from '@/domain/map/projection';

describe('catalogue and profile 1.10.0', () => {
  it('declares the moving map: position required, the rest optional, nothing written', () => {
    expect(GENERIC_PROFILE.version).toBe('1.10.0');
    const feature = findFeature(GENERIC_PROFILE, FEATURE_MOVING_MAP);
    expect(feature?.label).toBe('Moving map');
    expect(feature?.bindings.map((binding) => [binding.name, binding.required])).toEqual([
      [M.latitude, true],
      [M.longitude, true],
      [M.elevation, false],
      [M.trueHeading, false],
      [M.trueTrack, false],
      [D.groundTrack, false],
      [D.groundSpeed, false],
    ]);
    expect(feature?.bindings.every((binding) => binding.kind === 'dataref' && !binding.write)).toBe(true);
  });

  it('offers the ranges and defaults of the spec', () => {
    expect(MAP_RANGES).toEqual([2, 5, 10, 20, 40, 80, 160]);
    expect(DEFAULT_MAP_RANGE).toBe(10);
    expect(DEFAULT_MAP_ORIENTATION).toBe('north');
  });
});

describe('projection', () => {
  const sea = { lat: 47.449, lon: -122.309 };

  it('is nautical miles east and south of the anchor', () => {
    const p = project(sea, { lat: 48.449, lon: -122.309 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(-60, 6);
    const q = project(sea, { lat: 47.449, lon: -121.309 });
    expect(q.x).toBeCloseTo(60 * Math.cos((47.449 * Math.PI) / 180), 6);
  });

  it('wraps across the antimeridian', () => {
    const p = project({ lat: -17, lon: 179.9 }, { lat: -17, lon: -179.9 });
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(12);
  });

  it('round-trips', () => {
    const point = { lat: 47.6, lon: -122.1 };
    const back = unproject(sea, project(sea, point));
    expect(back.lat).toBeCloseTo(point.lat, 9);
    expect(back.lon).toBeCloseTo(point.lon, 9);
  });

  it('measures great-circle distance', () => {
    expect(distanceNm(sea, { lat: 48.449, lon: -122.309 })).toBeCloseTo(60, 0);
    expect(distanceNm(sea, sea)).toBe(0);
  });

  it('converts a range to nautical miles', () => {
    expect(rangeInNm(10, 'nm')).toBe(10);
    expect(rangeInNm(10, 'km')).toBeCloseTo(5.3996, 3);
  });
});

describe('direction', () => {
  const both = { trueTrack: 90, trueHeading: 80 };

  it('uses track from 5 kt and keeps it down to 3 kt', () => {
    expect(chooseDirection({ ...both, groundSpeedKt: 5 }, false)).toEqual({ source: 'track', degrees: 90 });
    expect(chooseDirection({ ...both, groundSpeedKt: 4 }, false)).toEqual({ source: 'heading', degrees: 80 });
    expect(chooseDirection({ ...both, groundSpeedKt: 4 }, true)).toEqual({ source: 'track', degrees: 90 });
    expect(chooseDirection({ ...both, groundSpeedKt: 2.9 }, true)).toEqual({ source: 'heading', degrees: 80 });
  });

  it('falls back to whichever value exists', () => {
    expect(chooseDirection({ trueTrack: null, trueHeading: 80, groundSpeedKt: 120 }, true)).toEqual({
      source: 'heading',
      degrees: 80,
    });
    expect(chooseDirection({ trueTrack: 90, trueHeading: null, groundSpeedKt: 0 }, false)).toEqual({
      source: 'track',
      degrees: 90,
    });
    expect(chooseDirection({ trueTrack: null, trueHeading: null, groundSpeedKt: 120 }, false)).toEqual({
      source: 'none',
      degrees: null,
    });
  });

  it('prefers heading when the speed is unknown', () => {
    expect(chooseDirection({ ...both, groundSpeedKt: null }, true)).toEqual({ source: 'heading', degrees: 80 });
  });
});

describe('density', () => {
  it('thins runways and labels as the range grows', () => {
    expect(densityFor(3)).toEqual({ minAirportFt: 0, minLabelFt: 0 });
    expect(densityFor(4)).toEqual({ minAirportFt: 3000, minLabelFt: 5000 });
    expect(densityFor(5)).toEqual({ minAirportFt: 3000, minLabelFt: 5000 });
    expect(densityFor(6)).toEqual({ minAirportFt: 6000, minLabelFt: null });
  });
});

describe('formatting', () => {
  it('writes degrees and decimal minutes', () => {
    expect(formatPosition(47.452, -122.30883)).toBe('N47°27.12′ W122°18.53′');
    expect(formatPosition(-33.9461, 8.5)).toBe('S33°56.77′ E008°30.00′');
    expect(formatPosition(10.99999999, 0)).toBe('N11°00.00′ E000°00.00′');
  });

  it('speaks the position plainly', () => {
    expect(spokenPosition(47.452, -122.30883)).toBe('N 47 27.12, W 122 18.53');
  });

  it('gives GPS altitude in feet', () => {
    expect(formatGpsAltitude(132)).toBe('433 ft');
    expect(formatGpsAltitude(3048)).toBe('10,000 ft');
  });

  it('labels a range in the pilot’s unit', () => {
    expect(rangeLabel(10, 'nm')).toBe('10 nm');
    expect(rangeLabel(5, 'km')).toBe('5 km');
  });
});

function reader(
  values: Record<string, number>,
  statuses: Partial<Record<string, 'ok' | 'missing' | 'unchecked'>> = {},
): MapReader {
  const status = (name: string) => statuses[name] ?? 'ok';
  return {
    has: (name) => status(name) === 'ok',
    missing: (name) => status(name) === 'missing',
    number: (name) => values[name] ?? null,
  };
}

describe('mapModel', () => {
  const full = {
    [M.latitude]: 47.449,
    [M.longitude]: -122.309,
    [M.elevation]: 132,
    [M.trueHeading]: 180,
    [M.trueTrack]: 181,
    [D.groundSpeed]: 140,
    [D.groundTrack]: 165,
  };

  it('is ready with every value', () => {
    expect(mapModel(reader(full))).toEqual({
      status: 'ready',
      position: { lat: 47.449, lon: -122.309 },
      elevationM: 132,
      trueHeading: 180,
      trueTrack: 181,
      groundSpeedKt: 140,
      magneticTrack: 165,
    });
  });

  it('is unavailable only when latitude or longitude is definitively missing', () => {
    expect(mapModel(reader(full, { [M.longitude]: 'missing' })).status).toBe('unavailable');
    expect(mapModel(reader(full, { [M.latitude]: 'unchecked' })).status).toBe('unchecked');
  });

  it('waits for a position that has not arrived or is off the planet', () => {
    const noLat = Object.fromEntries(Object.entries(full).filter(([name]) => name !== M.latitude));
    expect(mapModel(reader(noLat)).status).toBe('waiting');
    expect(mapModel(reader({ ...full, [M.latitude]: 91 })).status).toBe('waiting');
    expect(mapModel(reader({ ...full, [M.longitude]: -180.5 })).status).toBe('waiting');
    expect(mapModel(reader({ ...full, [M.latitude]: 0, [M.longitude]: 0 })).status).toBe('ready');
  });

  it('drops an optional value that is missing or unchecked', () => {
    const model = mapModel(reader(full, { [M.trueTrack]: 'missing', [M.elevation]: 'unchecked' }));
    expect(model.trueTrack).toBeNull();
    expect(model.elevationM).toBeNull();
    expect(model.trueHeading).toBe(180);
  });
});

describe('messages', () => {
  it('names the aircraft', () => {
    expect(mapUnavailable('Cessna 172')).toBe(
      "The moving map isn't available on the Cessna 172: X-Plane doesn't report its position.",
    );
    expect(mapUnavailable(null)).toBe(
      "The moving map isn't available on this aircraft: X-Plane doesn't report its position.",
    );
    expect(MAP_CREDIT).toBe('Outlines: Natural Earth. Runways: OurAirports. Not for navigation.');
  });
});
```

`findFeature` lives in `@/domain/aircraft/profile` and `groupedWhole` in `@/domain/units/numbers`
(it groups with commas).

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx jest tests/unit/domain/map-domain.test.ts`

Expected: FAIL, because the map modules don't exist.

- [ ] **Step 3: Implement the domain modules**

`src/domain/map/catalogue.ts`:

```ts
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
```

`src/domain/map/projection.ts`:

```ts
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
  return {
    x: wrapLongitude(point.lon - anchor.lon) * NM_PER_DEG * Math.cos(anchor.lat * RAD),
    y: -(point.lat - anchor.lat) * NM_PER_DEG,
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
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rangeInNm(range: number, unit: DistanceUnit): number {
  return unit === 'nm' ? range : range / KM_PER_NM;
}
```

`src/domain/map/direction.ts`:

```ts
/** Spec §4.4 and ruling 3: track while moving, heading while standing, with hysteresis. */
export const TRACK_FROM_KT = 5;
export const HEADING_BELOW_KT = 3;

export interface DirectionInput {
  trueTrack: number | null;
  trueHeading: number | null;
  groundSpeedKt: number | null;
}

export interface Direction {
  source: 'track' | 'heading' | 'none';
  degrees: number | null;
}

export function chooseDirection(input: DirectionInput, wasTrack: boolean): Direction {
  const { trueTrack, trueHeading, groundSpeedKt: speed } = input;
  const wantsTrack =
    speed !== null && (speed >= TRACK_FROM_KT || (wasTrack && speed >= HEADING_BELOW_KT));
  if (wantsTrack && trueTrack !== null) {
    return { source: 'track', degrees: trueTrack };
  }
  if (trueHeading !== null) {
    return { source: 'heading', degrees: trueHeading };
  }
  if (trueTrack !== null) {
    return { source: 'track', degrees: trueTrack };
  }
  return { source: 'none', degrees: null };
}
```

`src/domain/map/density.ts`:

```ts
/** Spec §4.2's table, by index into MAP_RANGES so it reads the same in nm and km. */
export interface Density {
  /** An airport's runways are drawn when its longest runway is at least this long. */
  minAirportFt: number;
  /** Its identifier too when at least this long; null draws no identifiers. */
  minLabelFt: number | null;
}

export function densityFor(rangeIndex: number): Density {
  if (rangeIndex <= 3) {
    return { minAirportFt: 0, minLabelFt: 0 };
  }
  if (rangeIndex <= 5) {
    return { minAirportFt: 3000, minLabelFt: 5000 };
  }
  return { minAirportFt: 6000, minLabelFt: null };
}
```

`src/domain/map/map-format.ts`:

```ts
import { groupedWhole } from '@/domain/units/numbers';
import { type DistanceUnit, UNIT_LABEL } from '@/domain/units/units';

const FEET_PER_METRE = 1 / 0.3048;

/** Whole degrees and minutes to hundredths, carried so 59.995′ never reads 60.00′. */
function parts(value: number): { degrees: number; minutes: string } {
  const hundredths = Math.round(Math.abs(value) * 6000);
  return {
    degrees: Math.floor(hundredths / 6000),
    minutes: ((hundredths % 6000) / 100).toFixed(2).padStart(5, '0'),
  };
}

function hemisphere(value: number, positive: string, negative: string): string {
  return value < 0 ? negative : positive;
}

export function formatPosition(lat: number, lon: number): string {
  const a = parts(lat);
  const b = parts(lon);
  return (
    `${hemisphere(lat, 'N', 'S')}${String(a.degrees).padStart(2, '0')}°${a.minutes}′ ` +
    `${hemisphere(lon, 'E', 'W')}${String(b.degrees).padStart(3, '0')}°${b.minutes}′`
  );
}

export function spokenPosition(lat: number, lon: number): string {
  const a = parts(lat);
  const b = parts(lon);
  return `${hemisphere(lat, 'N', 'S')} ${a.degrees} ${a.minutes}, ${hemisphere(lon, 'E', 'W')} ${b.degrees} ${b.minutes}`;
}

export function formatGpsAltitude(metres: number): string {
  return `${groupedWhole(metres * FEET_PER_METRE)} ft`;
}

export function rangeLabel(range: number, unit: DistanceUnit): string {
  return `${range} ${UNIT_LABEL.distance[unit]}`;
}
```

`src/domain/map/map-model.ts`:

```ts
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
}

const NOTHING: Omit<MapModel, 'status'> = {
  position: null,
  elevationM: null,
  trueHeading: null,
  trueTrack: null,
  groundSpeedKt: null,
  magneticTrack: null,
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
  };
}
```

`src/domain/map/messages.ts`:

```ts
/** F-13's sentences (spec §4.6, §4.7). Plain words only: no names, ids or codes (R10). */
export function mapUnavailable(aircraft: string | null): string {
  return `The moving map isn't available on ${aircraft === null ? 'this aircraft' : `the ${aircraft}`}: X-Plane doesn't report its position.`;
}

export const WAITING_FOR_POSITION = 'Waiting for position.';
export const TRACK_NOT_AVAILABLE = 'Track not available.';
export const LAST_KNOWN = 'LAST KNOWN';
export const MAP_CREDIT = 'Outlines: Natural Earth. Runways: OurAirports. Not for navigation.';
```

If the audio messages write "the Cessna 172" differently, for example without "the" when the
description already starts with a type, follow `src/domain/audio/messages.ts` and change both the
code and the test to match.

- [ ] **Step 4: Add the profile feature**

In `src/domain/aircraft/profiles/generic.ts`:

1. Import `FEATURE_MOVING_MAP, MAP_DATAREFS` from `@/domain/map/catalogue`.
2. Add after `AUDIO_FEATURE_SPECS`:

```ts
/** F-13: read only; position required, everything else optional; track and speed shared with flight-data. */
const MAP_FEATURE_SPECS: readonly FeatureSpec[] = [
  {
    id: FEATURE_MOVING_MAP,
    label: 'Moving map',
    bindings: [
      { kind: 'dataref', name: MAP_DATAREFS.latitude, required: true, purpose: 'Latitude' },
      { kind: 'dataref', name: MAP_DATAREFS.longitude, required: true, purpose: 'Longitude' },
      dataRef(MAP_DATAREFS.elevation, 'GPS altitude'),
      dataRef(MAP_DATAREFS.trueHeading, 'True heading'),
      dataRef(MAP_DATAREFS.trueTrack, 'True track'),
      dataRef(GENERIC_DATAREFS.groundTrack, 'Magnetic track'),
      dataRef(GENERIC_DATAREFS.groundSpeed, 'Ground speed'),
    ],
  },
];
```

3. Append `...MAP_FEATURE_SPECS,` after `...AUDIO_FEATURE_SPECS,` and set `version: '1.10.0'`.
4. Append this sentence to the `GENERIC_PROFILE` doc comment: "The moving map (F-13) requires only
   latitude and longitude; its other five names are optional, and the magnetic track and ground
   speed are the same DataRefs `flight-data` binds."

- [ ] **Step 5: Add the mock DataRefs and update the version and count tests**

In `tests/mock-xplane/mock-xplane-server.ts`, add a function beside `audioDataRefs`:

```ts
/** F-13: Seattle–Tacoma, pointing south (spec §6). */
function mapDataRefs(startId: number): MockDataRef[] {
  return [
    { id: startId, name: 'sim/flightmodel/position/latitude', valueType: 'double', value: 47.449 },
    { id: startId + 1, name: 'sim/flightmodel/position/longitude', valueType: 'double', value: -122.3093 },
    { id: startId + 2, name: 'sim/flightmodel/position/elevation', valueType: 'double', value: 132 },
    { id: startId + 3, name: 'sim/flightmodel/position/true_psi', valueType: 'float', value: 180 },
    { id: startId + 4, name: 'sim/flightmodel/position/hpath', valueType: 'float', value: 181 },
  ];
}
```

Then append to `DEFAULT_MOCK_DATAREFS`, after `...audioDataRefs(1500),`:

```ts
  // F-13: the moving map's position, GPS altitude, true heading and true track.
  ...mapDataRefs(1600),
```

If `MockDataRef['valueType']` does not allow `'double'`, widen it to the `DataRefValueType`
union from `@/domain/simulator/types`.

Version and count updates:

- Replace `1.9.0` with `1.10.0` in:
  - `tests/ui/compatibility-screen.test.tsx:66`;
  - `tests/ui/aircraft-summary.test.tsx:43`;
  - `tests/unit/application/diagnostics-summary.test.ts:134`;
  - `tests/unit/domain/audio-catalogue.test.ts:106` (keep its `describe` title);
  - `tests/unit/domain/aircraft-profile.test.ts` (the three `toBe('1.9.0')` assertions).
- In the duplicates test of `aircraft-profile.test.ts`, append
  `GENERIC_DATAREFS.groundTrack, GENERIC_DATAREFS.groundSpeed,` after `innerMarker`.
- In `tests/integration/xplane-client.test.ts`:
  - change the count from `295` to `300`;
  - extend the comment: "…, the 9 audio DataRefs added in 1.9.0, and the 5 moving-map DataRefs
    added in 1.10.0."

- [ ] **Step 6: Run the tests and make sure they pass**

Run:
- `npx jest tests/unit/domain/map-domain.test.ts tests/unit/domain tests/unit/application tests/integration/xplane-client.test.ts tests/ui/compatibility-screen.test.tsx tests/ui/aircraft-summary.test.tsx`
- then the full gate.

Expected: PASS. A session test that counts DataRef probes may need its number raised by 5. Update
it only if the failure is exactly that count, and extend its comment the same way.

- [ ] **Step 7: Commit**

```bash
git add src/domain/map src/domain/aircraft/profiles/generic.ts tests
git commit -m "feat(map): moving-map domain, profile 1.10.0 and mock position

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: View geometry and the remembered map settings

**Files:**
- Create: `src/domain/map/view.ts`
- Create: `src/features/panels/map/map-preference.ts`
- Create: `src/features/panels/map/MapPreferenceProvider.tsx`
- Modify: `src/features/shell/AppShell.tsx` (mount the provider inside `EnginesPreferenceProvider`)
- Test: `tests/unit/domain/map-view.test.ts`, `tests/unit/application/map-preference.test.ts`

**Interfaces:**
- Consumes: `PlanePoint`, `distanceNm` (Task 2); `LatLon` (Task 1); `MapOrientation`,
  `MapRange`, `MAP_RANGES`, `DEFAULT_MAP_RANGE`, `DEFAULT_MAP_ORIENTATION` (Task 2).
- Produces:
  - `interface MapView { anchorX; anchorY; rotation; pxPerNm; ringRadiusPx; visibleRadiusNm; trackUp: boolean }`
  - `mapView(input: { width: number; height: number; orientation: MapOrientation; rangeNm: number; direction: number | null }): MapView | null`, null for a zero-size map
  - `toScreen(view: MapView, offset: PlanePoint): { x: number; y: number }`, where `offset` is the point's plane position minus the centre's
  - `screenDeltaToPlane(view: MapView, dx: number, dy: number): PlanePoint`
  - `groupTransform(view: MapView, centre: PlanePoint): string`
  - `needsReanchor(anchor: LatLon | null, centre: LatLon, rangeNm: number): boolean`
  - `MAP_STORAGE_KEY = 'avionix.map'`
  - `interface MapPreference { orientation: MapOrientation; range: MapRange }`
  - `loadMapPreference(storage): Promise<MapPreference>`
  - `saveMapPreference(storage, preference): Promise<void>`
  - `MapPreferenceProvider({ storage, children })`
  - `useMapPreference(): [MapPreference, (next: MapPreference) => void]`, which falls back to local state without a provider

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/map-view.test.ts`:

```ts
import { groupTransform, mapView, needsReanchor, screenDeltaToPlane, toScreen } from '@/domain/map/view';

describe('mapView', () => {
  it('centres north-up and fits the ring to the shorter half', () => {
    const view = mapView({ width: 400, height: 600, orientation: 'north', rangeNm: 10, direction: 90 })!;
    expect(view).toMatchObject({ anchorX: 200, anchorY: 300, rotation: 0, trackUp: false });
    expect(view.ringRadiusPx).toBeCloseTo(180);
    expect(view.pxPerNm).toBeCloseTo(18);
    expect(view.visibleRadiusNm).toBeCloseTo(Math.hypot(200, 300) / 18);
  });

  it('puts the symbol at 70% in track-up and turns the map', () => {
    const view = mapView({ width: 400, height: 600, orientation: 'track', rangeNm: 10, direction: 90 })!;
    expect(view).toMatchObject({ anchorX: 200, anchorY: 420, rotation: -90, trackUp: true });
    expect(view.ringRadiusPx).toBeCloseTo(180);
  });

  it('falls back to north-up when there is no direction', () => {
    const view = mapView({ width: 400, height: 600, orientation: 'track', rangeNm: 10, direction: null })!;
    expect(view).toMatchObject({ anchorY: 300, rotation: 0, trackUp: false });
  });

  it('is null for a map with no size yet', () => {
    expect(mapView({ width: 0, height: 600, orientation: 'north', rangeNm: 10, direction: 0 })).toBeNull();
    expect(mapView({ width: 400, height: 0, orientation: 'north', rangeNm: 10, direction: 0 })).toBeNull();
  });
});

describe('screen transforms', () => {
  const view = mapView({ width: 400, height: 600, orientation: 'track', rangeNm: 10, direction: 90 })!;

  it('rotates a point east of the symbol to straight ahead in track-up east', () => {
    const p = toScreen(view, { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(420 - 180);
  });

  it('inverts a drag', () => {
    const plane = screenDeltaToPlane(view, 0, -180);
    expect(plane.x).toBeCloseTo(10);
    expect(plane.y).toBeCloseTo(0);
  });

  it('writes one SVG transform', () => {
    expect(groupTransform(view, { x: 1, y: 2 })).toBe('translate(200 420) rotate(-90) scale(18) translate(-1 -2)');
  });
});

describe('needsReanchor', () => {
  const sea = { lat: 47.449, lon: -122.309 };
  it('moves the anchor past a quarter of the range', () => {
    expect(needsReanchor(null, sea, 10)).toBe(true);
    expect(needsReanchor(sea, { lat: 47.48, lon: -122.309 }, 10)).toBe(false);
    expect(needsReanchor(sea, { lat: 47.5, lon: -122.309 }, 10)).toBe(true);
  });
});
```

`tests/unit/application/map-preference.test.ts`:

```ts
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  MAP_STORAGE_KEY,
  loadMapPreference,
  saveMapPreference,
} from '@/features/panels/map/map-preference';

describe('map preference', () => {
  it('defaults to north-up and 10', async () => {
    await expect(loadMapPreference(createMemorySettingsStorage())).resolves.toEqual({
      orientation: 'north',
      range: 10,
    });
  });

  it('round-trips', async () => {
    const storage = createMemorySettingsStorage();
    await saveMapPreference(storage, { orientation: 'track', range: 40 });
    await expect(loadMapPreference(storage)).resolves.toEqual({ orientation: 'track', range: 40 });
  });

  it('falls back field by field on a bad value', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(MAP_STORAGE_KEY, JSON.stringify({ orientation: 'track', range: 7 }));
    await expect(loadMapPreference(storage)).resolves.toEqual({ orientation: 'track', range: 10 });
    await storage.setItem(MAP_STORAGE_KEY, '{not json');
    await expect(loadMapPreference(storage)).resolves.toEqual({ orientation: 'north', range: 10 });
  });
});
```

If `tests/unit/application` only holds application-layer files, put this test at
`tests/unit/features/map-preference.test.ts` instead. It is a node test with no React; check
`tests/unit` for an existing features folder and follow the repo's habit.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx jest tests/unit/domain/map-view.test.ts tests/unit/application/map-preference.test.ts`

Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Implement**

`src/domain/map/view.ts`:

```ts
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
  const corner = Math.max(
    Math.hypot(anchorX, anchorY),
    Math.hypot(anchorX, height - anchorY),
  );
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
```

Check: with rotation −90, the plane point (10, 0), which is east, maps to x = 200 + (10·0 − 0)·18 = 200 and y = 420 + (10·(−1))·18 = 240. That matches the test (east is up when the track is 090).

Also check that `n(-0)` prints `0`, not `-0`. `Number((-0).toFixed(4))` is `-0`, and template interpolation of `-0` prints `0`, so the test string holds.

`src/features/panels/map/map-preference.ts`:

```ts
import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_MAP_ORIENTATION,
  DEFAULT_MAP_RANGE,
  MAP_RANGES,
  type MapOrientation,
  type MapRange,
} from '@/domain/map/catalogue';

export const MAP_STORAGE_KEY = 'avionix.map';

export interface MapPreference {
  orientation: MapOrientation;
  range: MapRange;
}

export const DEFAULT_MAP_PREFERENCE: MapPreference = {
  orientation: DEFAULT_MAP_ORIENTATION,
  range: DEFAULT_MAP_RANGE,
};

const orientationSchema = z.enum(['north', 'track']);
const rangeSchema = z
  .number()
  .refine((value): value is MapRange => (MAP_RANGES as readonly number[]).includes(value));

/** Spec §4.9. Best effort, field by field: anything unreadable is the default. */
export async function loadMapPreference(storage: SettingsStorage): Promise<MapPreference> {
  try {
    const raw = await storage.getItem(MAP_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_MAP_PREFERENCE;
    }
    const stored: unknown = JSON.parse(raw);
    const record = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
    const orientation = orientationSchema.safeParse(record.orientation);
    const range = rangeSchema.safeParse(record.range);
    return {
      orientation: orientation.success ? orientation.data : DEFAULT_MAP_ORIENTATION,
      range: range.success ? (range.data as MapRange) : DEFAULT_MAP_RANGE,
    };
  } catch {
    return DEFAULT_MAP_PREFERENCE;
  }
}

export async function saveMapPreference(
  storage: SettingsStorage,
  preference: MapPreference,
): Promise<void> {
  try {
    await storage.setItem(MAP_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
```

`src/features/panels/map/MapPreferenceProvider.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { SettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_MAP_PREFERENCE,
  type MapPreference,
  loadMapPreference,
  saveMapPreference,
} from '@/features/panels/map/map-preference';

type MapPreferenceValue = [MapPreference, (next: MapPreference) => void];

const MapPreferenceContext = createContext<MapPreferenceValue | null>(null);

/** The remembered orientation and range. A change made before the stored value loads wins. */
export function MapPreferenceProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] = useState<MapPreference>(DEFAULT_MAP_PREFERENCE);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadMapPreference(storage).then((stored) => {
      if (!cancelled && !touched.current) {
        setPreferenceState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPreference = useCallback(
    (next: MapPreference) => {
      touched.current = true;
      setPreferenceState(next);
      void saveMapPreference(storage, next);
    },
    [storage],
  );

  const value = useMemo<MapPreferenceValue>(() => [preference, setPreference], [preference, setPreference]);
  return <MapPreferenceContext.Provider value={value}>{children}</MapPreferenceContext.Provider>;
}

/** The remembered settings and their setter; without a provider (the guards), local state. */
export function useMapPreference(): MapPreferenceValue {
  const value = useContext(MapPreferenceContext);
  const [local, setLocal] = useState<MapPreference>(DEFAULT_MAP_PREFERENCE);
  return value ?? [local, setLocal];
}
```

In `AppShell.tsx`:
- wrap the children of `EnginesPreferenceProvider` in
  `<MapPreferenceProvider storage={settingsStorage}>…</MapPreferenceProvider>`;
- import it;
- keep the indentation Prettier produces.

- [ ] **Step 4: Run the tests and make sure they pass**

Run:
- `npx jest tests/unit/domain/map-view.test.ts tests/unit/application/map-preference.test.ts tests/ui/app-shell.test.tsx`
- then `npm run typecheck && npm run lint && npm run format:check`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/map/view.ts src/features/panels/map src/features/shell/AppShell.tsx tests/unit
git commit -m "feat(map): view geometry and the remembered orientation and range

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Map panel — drawing the map, the symbol and the readout

**Files:**
- Create:
  - `src/features/panels/map/map-reader.ts`;
  - `src/features/panels/map/map-layers.ts`;
  - `src/features/panels/map/MapCanvas.tsx`;
  - `src/features/panels/map/MapReadout.tsx`;
  - `src/features/panels/map/MapPanel.tsx`.
- Modify:
  - `src/features/panels/registry.ts` (Map after Navigation);
  - `src/features/shell/PanelIcon.tsx` (a `map` glyph);
  - `src/theme/tokens.ts` (`map: MapColors` in every theme);
  - `tests/ui/panels.test.tsx` (order and the `fillsFrame` list);
  - `tests/unit/theme/tokens.test.ts` (map keys and night luminance).
- Test: `tests/helpers/map.tsx`, `tests/ui/map-panel.test.tsx`, `tests/unit/features/map-layers.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `bundledMapData`, `cellsAround`, `MapCell`, `LatLon`.
  - Task 2: `mapModel`, `chooseDirection`, `densityFor`, the formatters and messages, `project`, `rangeInNm`.
  - Task 3: `mapView`, `toScreen`, `groupTransform`, `needsReanchor`, `useMapPreference`.
- Produces:
  - `MAP_PANEL: PanelDescriptor`, with id `map`, title `Map`, `features: [FEATURE_MOVING_MAP]`, `supports: EVERYWHERE` and `fillsFrame: true`;
  - `MapPanel`;
  - `mapReader(snapshot): MapReader`;
  - `buildLayers(cells: readonly MapCell[], cellKeys: readonly string[], anchor: LatLon, density: Density, pxPerNm: number): MapLayers`;
  - `MapCanvas` props `{ width; height; view: MapView; layers: MapLayers; centre: PlanePoint; ownship: PlanePoint; direction: Direction; live: boolean; outerLabel: string; innerLabel: string }`;
  - test ids: `map-canvas`, `map-ownship`, `map-ownship-stale`, `map-ring-outer`, `map-ring-inner`, `map-north-arrow`, `map-message`, `map-credit`;
  - `MapColors`.

Task 5 adds the controls and pan; this task renders a fixed, centred map.

- [ ] **Step 1: Add the theme tokens**

In `src/theme/tokens.ts`:

```ts
/** F-13 moving map. Light and dark share one dark map, like the instruments; night stays ≤ 0.30. */
export interface MapColors {
  water: string;
  land: string;
  border: string;
  runway: string;
  label: string;
  ring: string;
  ownship: string;
  stale: string;
}

const dayMap: MapColors = {
  water: '#0b2a45',
  land: '#2b2f26',
  border: '#8a8f99',
  runway: '#e6edf3',
  label: '#c9d1d9',
  ring: '#7fb2e0',
  ownship: '#ffd200',
  stale: '#9aa4b2',
};

const nightMap: MapColors = {
  water: '#06121e',
  land: '#141209',
  border: '#4a3e2c',
  runway: '#a88a60',
  label: '#917752',
  ring: '#4f6e88',
  ownship: '#a8862a',
  stale: '#6a5a44',
};
```

Add `map: MapColors` to `Theme`, `map: dayMap` to `lightTheme` and `darkTheme`, and `map: nightMap`
to `nightTheme`.

In `tests/unit/theme/tokens.test.ts`, add tests in the same style as the cdu and instrument ones:

```ts
  it('defines the same map keys in every mode with hex values', () => {
    const keys = Object.keys(lightTheme.map).sort();
    for (const theme of [lightTheme, darkTheme, nightTheme]) {
      expect(Object.keys(theme.map).sort()).toEqual(keys);
      for (const value of Object.values(theme.map)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('keeps every map colour dark at night and the symbol legible on land and water', () => {
    for (const value of Object.values(nightTheme.map)) {
      expect(relativeLuminance(value)).toBeLessThanOrEqual(0.3);
    }
    for (const theme of [lightTheme, nightTheme]) {
      expect(contrastRatio(theme.map.ownship, theme.map.land)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.map.ownship, theme.map.water)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.map.label, theme.map.land)).toBeGreaterThanOrEqual(4.5);
    }
  });
```

Use whatever luminance and contrast helper names the file already imports (read its first 34
lines). If a night value fails, darken it within its hue until it passes; the label pair must stay
at or above 4.5.

- [ ] **Step 2: Write the test helper and failing UI tests**

`tests/helpers/map.tsx` (shared by both map UI tests and the guards):

```tsx
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { type BindingResults, deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { FEATURE_MOVING_MAP, MAP_DATAREFS as M } from '@/domain/map/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';
import { MapPanel } from '@/features/panels/map/MapPanel';
import { MapPreferenceProvider } from '@/features/panels/map/MapPreferenceProvider';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

type Status = 'ok' | 'missing' | 'unchecked';

export const MAP_NOW = 1_000_000;

/** Every moving-map binding resolved unless overridden ('unchecked' leaves no result). */
export function mapCompatibility(
  base: SessionSnapshot['compatibility'],
  overrides: Partial<Record<string, Status>> = {},
): SessionSnapshot['compatibility'] {
  const bindings: BindingResults = { ...base.bindings };
  const feature = GENERIC_PROFILE.features.find((candidate) => candidate.id === FEATURE_MOVING_MAP)!;
  for (const binding of feature.bindings) {
    const status = overrides[binding.name] ?? 'ok';
    if (status === 'unchecked') {
      delete bindings[binding.name];
    } else {
      bindings[binding.name] = { name: binding.name, kind: binding.kind, status };
    }
  }
  const derived = deriveAvailability(GENERIC_PROFILE, bindings);
  return {
    ...base,
    bindings,
    features: base.features.map((candidate) =>
      candidate.id === FEATURE_MOVING_MAP
        ? (derived.find((next) => next.id === candidate.id) ?? candidate)
        : candidate,
    ),
  };
}

/** Over Seattle–Tacoma, 140 kt, true track 090, true heading 085, magnetic track 075. */
export const MAP_VALUES: Record<string, DataRefValue> = {
  [M.latitude]: 47.449,
  [M.longitude]: -122.3093,
  [M.elevation]: 132,
  [M.trueHeading]: 85,
  [M.trueTrack]: 90,
  [D.groundSpeed]: 140,
  [D.groundTrack]: 75,
};

export function mapTelemetry(
  values: Record<string, DataRefValue>,
  receivedAt: number,
): SessionSnapshot['telemetry'] {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

const base = initialSnapshot(GENERIC_PROFILE, 5);
const identified: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
  identified: true,
};

export function mapSnapshot({
  values = {},
  absent = [],
  bindings = {},
  stale = false,
  noFlight = false,
}: {
  values?: Record<string, DataRefValue>;
  /** Resolved names whose value has not arrived (dropped telemetry on a panel switch). */
  absent?: readonly string[];
  bindings?: Partial<Record<string, Status>>;
  stale?: boolean;
  noFlight?: boolean;
} = {}): SessionSnapshot {
  return {
    ...base,
    state: stale ? 'reconnecting' : 'connected',
    health: {
      ...base.health,
      activity: noFlight ? 'noFlight' : 'running',
      live: true,
      lastHeartbeatAt: MAP_NOW,
    },
    telemetry: mapTelemetry(
      Object.fromEntries(
        Object.entries({ ...MAP_VALUES, ...values }).filter(([name]) => !absent.includes(name)),
      ),
      MAP_NOW,
    ),
    compatibility: mapCompatibility(identified, bindings),
  };
}

const actions: PanelScopeActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

/** The Map panel as AppShell mounts it, with real (memory) persistence. */
export function mapTree(
  snap: SessionSnapshot,
  { storage = createMemorySettingsStorage(), now = MAP_NOW }: { storage?: SettingsStorage; now?: number } = {},
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <MapPreferenceProvider storage={storage}>
          <PanelFrame title="Map" snapshot={snap} now={now} actions={actions} fillsFrame>
            <MapPanel />
          </PanelFrame>
        </MapPreferenceProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}

/** The symbol's screen x, read from its `translate(x y)`: pan moves it, nothing else does. */
export function symbolX(transform: string): number {
  const match = /translate\(([-\d.e]+)/.exec(transform);
  return match === null ? Number.NaN : Number(match[1]);
}
```

If `PanelScopeActions`' `activate` type rejects `'ok' as const`, copy the typed `jest.fn` lines
from `tests/ui/radios-audio.test.tsx`. A file under `tests/helpers` may use `jest` globals; the
other helpers do not, so check that `tsc` accepts it. It does, because `types: ["jest"]` is
global.

`tests/ui/map-panel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { MAP_DATAREFS as M } from '@/domain/map/catalogue';

import { mapSnapshot, mapTree as tree } from '../helpers/map';

const HIDDEN = { includeHiddenElements: true };
const has = (text: string) => screen.getAllByText(text, HIDDEN).length > 0;

const rotationOf = (testID: string) =>
  String(screen.getByTestId(testID, HIDDEN).props.transform ?? '');

describe('Map panel', () => {
  it('draws the symbol at the centre, turned to the true track, in north-up', async () => {
    await render(tree(mapSnapshot()));
    expect(screen.getByTestId('map-ownship', HIDDEN)).toBeTruthy();
    expect(rotationOf('map-ownship')).toContain('rotate(90)');
    expect(screen.getByTestId('map-ring-outer', HIDDEN)).toBeTruthy();
    expect(has('10 nm')).toBe(true);
    expect(has('5 nm')).toBe(true);
    expect(screen.queryByTestId('map-north-arrow', HIDDEN)).toBeNull();
  });

  it('points along the heading when standing still', async () => {
    await render(tree(mapSnapshot({ values: { [D.groundSpeed]: 0 } })));
    expect(rotationOf('map-ownship')).toContain('rotate(85)');
  });

  it('draws a circle and says so when neither track nor heading exists', async () => {
    await render(
      tree(mapSnapshot({ bindings: { [M.trueTrack]: 'missing', [M.trueHeading]: 'missing' } })),
    );
    expect(screen.getByTestId('map-ownship-circle', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Track not available.')).toBeTruthy();
  });

  it('shows the readout as the strip formats it', async () => {
    await render(tree(mapSnapshot()));
    expect(screen.getByLabelText('Position: N47°26.94′ W122°18.56′')).toBeTruthy();
    expect(screen.getByLabelText('GPS alt: 433 ft')).toBeTruthy();
    expect(screen.getByLabelText('Ground speed: 140 kt')).toBeTruthy();
    expect(screen.getByLabelText('Track (magnetic): 075°')).toBeTruthy();
  });

  it('labels the rings in kilometres when the pilot uses km', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      'avionix.units',
      JSON.stringify({ fuel: 'kg', temperature: 'C', distance: 'km', pressure: 'hPa' }),
    );
    await render(tree(mapSnapshot(), { storage }));
    expect((await screen.findAllByText('10 km', HIDDEN)).length).toBeGreaterThan(0);
  });

  it('keeps the last position hollow and tagged when not live', async () => {
    await render(tree(mapSnapshot({ stale: true })));
    expect(screen.getByTestId('map-ownship-stale', HIDDEN)).toBeTruthy();
    expect(screen.getByText('LAST KNOWN', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('panel-notice')).toBeTruthy();
  });

  it('waits without a symbol while the position has not arrived', async () => {
    await render(tree(mapSnapshot({ absent: [M.latitude] })));
    expect(screen.queryByTestId('map-ownship', HIDDEN)).toBeNull();
    expect(screen.getByText('Waiting for position.')).toBeTruthy();
  });

  it('draws nothing and says nothing while the names are unchecked', async () => {
    await render(tree(mapSnapshot({ bindings: { [M.latitude]: 'unchecked' } })));
    expect(screen.queryByTestId('map-canvas', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('map-message')).toBeNull();
  });

  it('is one sentence when the aircraft has no position', async () => {
    await render(tree(mapSnapshot({ bindings: { [M.latitude]: 'missing' } })));
    expect(
      screen.getByText(
        "The moving map isn't available on the Cessna 172: X-Plane doesn't report its position.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('map-canvas', HIDDEN)).toBeNull();
  });

  it('shows no symbol with no flight loaded', async () => {
    await render(tree(mapSnapshot({ noFlight: true })));
    expect(screen.queryByTestId('map-ownship', HIDDEN)).toBeNull();
  });

  it('draws the runways around Seattle–Tacoma and their identifier', async () => {
    await render(tree(mapSnapshot()));
    expect(screen.getByText('KSEA', HIDDEN)).toBeTruthy();
    expect(screen.getAllByTestId('map-runway', HIDDEN).length).toBeGreaterThanOrEqual(3);
  });

  it('describes the map in one sentence and credits its sources', async () => {
    await render(tree(mapSnapshot()));
    expect(
      screen.getByLabelText(
        'Map, north up, 10 nautical mile range, position N 47 26.94, W 122 18.56, track 090',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Outlines: Natural Earth. Runways: OurAirports. Not for navigation.'),
    ).toBeTruthy();
  });
});
```

Notes for the implementer:
- `PanelFrame` takes `fillsFrame` directly; `AppShell` passes the descriptor's value.
- A range text shows twice, in the controls (Task 5) and on the ring, so range assertions use
  `getAllByText` (`has`).
- The readout labels use `FlightValue`'s accessible label, `${label}: ${text}`.
- 47.449° is N47°26.94′ and −122.3093° is W122°18.56′.
- The spoken track in the sentence is the **true** direction the map uses (090, from
  `formatHeading` without the degree sign): the symbol turns by it. The magnetic track appears only
  in the readout.
- `KSEA` will be on screen at the default range 10, where every identifier is drawn.

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx jest tests/ui/map-panel.test.tsx tests/unit/theme/tokens.test.ts`

Expected: FAIL, because `MapPanel` doesn't exist. The tokens tests pass once Step 1 is in.

- [ ] **Step 4: Implement the reader and layers**

`src/features/panels/map/map-reader.ts`:

```ts
import type { SessionSnapshot } from '@/application/session-snapshot';
import type { MapReader } from '@/domain/map/map-model';
import { numberAt } from '@/domain/systems/readouts';
import { bindingMissing, bindingOk, valueOf } from '@/features/panels/systems/availability';

/** The session snapshot as the map domain reads it (F-12's three answers). */
export function mapReader(snapshot: SessionSnapshot): MapReader {
  return {
    has: (name) => bindingOk(snapshot, name),
    missing: (name) => bindingMissing(snapshot, name),
    number: (name) => numberAt(valueOf(snapshot, name), 0),
  };
}
```

`src/features/panels/map/map-layers.ts`:

```ts
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
          labels.push({ key: `${cellKeys[c]}/${a}`, ident: airport.ident, at: project(anchor, airport.position) });
        }
      });
    }
  });
  // Nearest first, so a dense area keeps the identifiers closest to the aircraft.
  labels.sort((a, b) => Math.hypot(a.at.x, a.at.y) - Math.hypot(b.at.x, b.at.y));
  labels.length = Math.min(labels.length, MAX_LABELS);
  return {
    land: path(cells.flatMap((cell) => cell.land), anchor, true),
    lakes: path(cells.flatMap((cell) => cell.lakes), anchor, true),
    borders: path(cells.flatMap((cell) => cell.borders), anchor, false),
    runways,
    labels,
  };
}
```

Labels are sorted by distance from the anchor before the cap, so the nearest airports always get
their identifier. Add a unit test at `tests/unit/features/map-layers.test.ts` (a node test; the
module has no React):
- build a fake cell with 70 airports at increasing distance;
- check that 60 labels come back and that the farthest ten are absent;
- check that a runway at an airport shorter than `minAirportFt` is skipped;
- check that a 50 ft wide runway at `pxPerNm = 10` gets width `0.2` (the 2 px minimum).

- [ ] **Step 5: Implement the canvas, readout and panel**

`src/features/panels/map/MapCanvas.tsx`:

```tsx
import React, { memo, useMemo } from 'react';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import type { Direction } from '@/domain/map/direction';
import type { MapLayers } from '@/features/panels/map/map-layers';
import { type MapView, groupTransform, toScreen } from '@/domain/map/view';
import type { PlanePoint } from '@/domain/map/projection';
import { LAST_KNOWN } from '@/domain/map/messages';
import { useTheme } from '@/theme/theme-context';

/** An aircraft seen from above, nose up, 24 units long, centred on its middle. */
const AIRCRAFT = '0,-12 2,-4 11,1 11,3 2,1 2,8 5,10 5,12 0,11 -5,12 -5,10 -2,8 -2,1 -11,3 -11,1 -2,-4';

/** Static layers: they change only with the anchor, the density or the scale. */
const BaseLayers = memo(function BaseLayers({ layers, pxPerNm }: { layers: MapLayers; pxPerNm: number }) {
  const { map } = useTheme();
  return (
    <>
      <Path d={layers.land} fill={map.land} fillRule="evenodd" />
      <Path d={layers.lakes} fill={map.water} fillRule="evenodd" />
      <Path
        d={layers.borders}
        stroke={map.border}
        strokeWidth={1 / pxPerNm}
        strokeDasharray={`${4 / pxPerNm} ${3 / pxPerNm}`}
        fill="none"
      />
      {layers.runways.map((runway) => (
        <Line
          key={runway.key}
          testID="map-runway"
          x1={runway.from.x}
          y1={runway.from.y}
          x2={runway.to.x}
          y2={runway.to.y}
          stroke={map.runway}
          strokeWidth={runway.width}
          strokeLinecap="butt"
        />
      ))}
    </>
  );
});

export interface MapCanvasProps {
  width: number;
  height: number;
  view: MapView;
  layers: MapLayers;
  /** The map centre in anchor-plane NM. */
  centre: PlanePoint;
  /** The ownship in anchor-plane NM. */
  ownship: PlanePoint;
  direction: Direction;
  live: boolean;
  outerLabel: string;
  innerLabel: string;
}

export function MapCanvas({
  width,
  height,
  view,
  layers,
  centre,
  ownship,
  direction,
  live,
  outerLabel,
  innerLabel,
}: MapCanvasProps) {
  const { map } = useTheme();
  const own = toScreen(view, { x: ownship.x - centre.x, y: ownship.y - centre.y });
  const symbolAngle = direction.degrees === null ? 0 : direction.degrees + view.rotation;
  const labels = useMemo(
    () =>
      layers.labels.map((label) => ({
        ...label,
        screen: toScreen(view, { x: label.at.x - centre.x, y: label.at.y - centre.y }),
      })),
    [layers.labels, view, centre],
  );
  const ink = live ? map.ownship : map.stale;
  return (
    <Svg testID="map-canvas" width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={map.water} />
      <G transform={groupTransform(view, centre)}>
        <BaseLayers layers={layers} pxPerNm={view.pxPerNm} />
      </G>
      {labels.map((label) => (
        <SvgText
          key={label.key}
          x={label.screen.x + 6}
          y={label.screen.y - 6}
          fill={map.label}
          fontSize={12}
        >
          {label.ident}
        </SvgText>
      ))}
      <Circle
        testID="map-ring-outer"
        cx={own.x}
        cy={own.y}
        r={view.ringRadiusPx}
        stroke={map.ring}
        strokeWidth={1}
        fill="none"
      />
      <Circle
        testID="map-ring-inner"
        cx={own.x}
        cy={own.y}
        r={view.ringRadiusPx / 2}
        stroke={map.ring}
        strokeWidth={1}
        strokeDasharray="4 4"
        fill="none"
      />
      <SvgText x={own.x + view.ringRadiusPx * 0.71 + 4} y={own.y - view.ringRadiusPx * 0.71} fill={map.ring} fontSize={12}>
        {outerLabel}
      </SvgText>
      <SvgText x={own.x + view.ringRadiusPx * 0.355 + 4} y={own.y - view.ringRadiusPx * 0.355} fill={map.ring} fontSize={12}>
        {innerLabel}
      </SvgText>
      {view.trackUp ? (
        <G testID="map-north-arrow" transform={`translate(24 24) rotate(${view.rotation})`}>
          <Polygon points="0,-12 5,4 0,1 -5,4" fill={map.label} />
          <SvgText x={0} y={18} fill={map.label} fontSize={11} textAnchor="middle">
            N
          </SvgText>
        </G>
      ) : null}
      {direction.degrees === null ? (
        <Circle
          testID="map-ownship-circle"
          cx={own.x}
          cy={own.y}
          r={7}
          stroke={ink}
          strokeWidth={2}
          fill={live ? ink : 'none'}
        />
      ) : (
        <G testID="map-ownship" transform={`translate(${own.x} ${own.y}) rotate(${symbolAngle})`}>
          <Polygon points={AIRCRAFT} fill={live ? ink : 'none'} stroke={ink} strokeWidth={1.5} />
        </G>
      )}
      {live ? null : (
        <G testID="map-ownship-stale">
          <SvgText x={own.x} y={own.y + 26} fill={map.stale} fontSize={11} textAnchor="middle">
            {LAST_KNOWN}
          </SvgText>
        </G>
      )}
    </Svg>
  );
}
```

`map-ownship` exists whenever a direction is known and a symbol is drawn. `map-ownship-stale`
wraps the "LAST KNOWN" tag and exists only when not live; the symbol itself turns hollow.

The rotation test reads `props.transform` on the `map-ownship` element. Check how
react-native-svg's `G` exposes `transform` under jest (`jest-expo`'s svg mock keeps props). If it
does not keep the string, assert on a `rotation` prop you pass yourself through a `testID`-tagged
wrapper. Keep the test's meaning: the symbol turns by the true track.

`src/features/panels/map/MapReadout.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { formatHeading, formatSpeed } from '@/domain/flight-data/format';
import { MAP_DATAREFS as M } from '@/domain/map/catalogue';
import { formatGpsAltitude, formatPosition } from '@/domain/map/map-format';
import { FlightValue } from '@/features/panels/flight-data/FlightValue';
import { one } from '@/features/panels/flight-data/useFlightValue';

/** Spec §4.5: the strip's own formatting, so the map and the strip never disagree. */
export function MapReadout() {
  return (
    <View testID="map-readout">
      <FlightValue
        label="Position"
        names={[M.latitude, M.longitude]}
        format={([lat = 0, lon = 0]) => formatPosition(lat, lon)}
      />
      <FlightValue label="GPS alt" names={[M.elevation]} format={one(formatGpsAltitude)} />
      <FlightValue label="Ground speed" names={[D.groundSpeed]} format={one(formatSpeed)} />
      <FlightValue label="Track (magnetic)" names={[D.groundTrack]} format={one(formatHeading)} />
    </View>
  );
}
```

`src/features/panels/map/MapPanel.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { FEATURE_MOVING_MAP, MAP_RANGES } from '@/domain/map/catalogue';
import { densityFor } from '@/domain/map/density';
import { type Direction, chooseDirection } from '@/domain/map/direction';
import { type LatLon, cellsAround } from '@/domain/map/map-data';
import { rangeLabel, spokenPosition } from '@/domain/map/map-format';
import { type MapModel, mapModel } from '@/domain/map/map-model';
import {
  MAP_CREDIT,
  TRACK_NOT_AVAILABLE,
  WAITING_FOR_POSITION,
  mapUnavailable,
} from '@/domain/map/messages';
import { project, rangeInNm } from '@/domain/map/projection';
import { mapView, needsReanchor } from '@/domain/map/view';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { headingText } from '@/domain/instruments/geometry';
import { bundledMapData } from '@/infrastructure/map/bundled-map-data';
import { MapCanvas } from '@/features/panels/map/MapCanvas';
import { buildLayers } from '@/features/panels/map/map-layers';
import { mapReader } from '@/features/panels/map/map-reader';
import { MapReadout } from '@/features/panels/map/MapReadout';
import { useMapPreference } from '@/features/panels/map/MapPreferenceProvider';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { aircraftName } from '@/features/panels/systems/availability';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useTheme } from '@/theme/theme-context';

export const MAP_PANEL: PanelDescriptor = {
  id: 'map',
  title: 'Map',
  features: [FEATURE_MOVING_MAP],
  supports: EVERYWHERE,
  fillsFrame: true,
};

/** F-13. Read only (R12): nothing here writes or activates. */
export function MapPanel() {
  const { snapshot } = usePanel();
  const model = mapModel(mapReader(snapshot));
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  if (model.status === 'unchecked') {
    return null;
  }
  if (model.status === 'unavailable') {
    return <BodyText testID="map-message">{mapUnavailable(aircraftName(snapshot))}</BodyText>;
  }
  return <MapContent model={noFlight ? { ...model, status: 'waiting', position: null } : model} noFlight={noFlight} />;
}
```

Add a `MapContent` component in the same file. It does the following, in this order:

1. **Measure the map area.** It is a `View` with `flex: 1`, and `onLayout` stores
   `{ width, height }`. Until then, the fallback is
   `{ width: window.width - theme.spacing.lg * 2, height: Math.round(window.height * 0.5) }`,
   because tests never lay out.
2. **Track-up memory.** `const [wasTrack, setWasTrack] = useState(false)`. Compute
   `direction = chooseDirection({ trueTrack, trueHeading, groundSpeedKt }, wasTrack)`, and if
   `(direction.source === 'track') !== wasTrack`, call `setWasTrack(direction.source === 'track')`
   during render (the adjust-state-during-render pattern).
3. **Range in NM.** `const [preference] = useMapPreference()`;
   `rangeNm = rangeInNm(preference.range, units.distance)`;
   `rangeIndex = MAP_RANGES.indexOf(preference.range)`.
4. **The view.** `view = mapView({ width, height, orientation: preference.orientation, rangeNm, direction: direction.degrees })`.
5. **Anchor state.** `const [anchor, setAnchor] = useState<{ at: LatLon; rangeNm: number; rangeIndex: number; pxPerNm: number } | null>(null)`.
   - `centre` is `model.position`, or the last centre while waiting (Task 5 adds pan).
   - When the position exists and any of these holds, call
     `setAnchor({ at: centre, rangeNm, rangeIndex, pxPerNm: view.pxPerNm })` during render:
     - `needsReanchor(anchor?.at ?? null, centre, rangeNm)`;
     - `anchor.rangeNm !== rangeNm`;
     - `anchor.rangeIndex !== rangeIndex`;
     - `Math.abs(anchor.pxPerNm - view.pxPerNm) / view.pxPerNm > 0.01`.
6. **Layers.** `useMemo` over `[anchor]`:
   - `keys = cellsAround(anchor.at, view.visibleRadiusNm + anchor.rangeNm / 4)`;
   - `cells = keys.map((key) => bundledMapData().cell(key))`;
   - `buildLayers(cells, keys, anchor.at, densityFor(anchor.rangeIndex), anchor.pxPerNm)`.

   The visible radius comes from the view at the time the anchor was set, so store
   `visibleRadiusNm` in the anchor state too.
7. **Render.**
   - No position (waiting or no flight): the measured `View` holds only
     `<BodyText testID="map-message">Waiting for position.</BodyText>`, except with no flight
     (the frame says it).
   - With a position and a view: `<MapCanvas …/>` with
     - `centre = project(anchor.at, centre)` and `ownship = project(anchor.at, model.position)`;
     - `live = link.valuesCurrent`;
     - `outerLabel = rangeLabel(preference.range, units.distance)`;
     - `innerLabel = rangeLabel(preference.range / 2, units.distance)`.
   - The half range is never fractional except for 5 (2.5): `rangeLabel` prints `2.5 nm`. That is
     fine.
   - Wrap the `MapCanvas` in a `View` with `accessible`, `accessibilityRole="image"`, and
     `accessibilityLabel={describeMap(...)}` where:

```ts
function describeMap(orientation: 'north' | 'track', range: number, unitWord: string, model: MapModel, direction: Direction, live: boolean): string {
  const parts = [`Map, ${orientation === 'track' && direction.degrees !== null ? 'track up' : 'north up'}`, `${range} ${unitWord} range`];
  if (model.position !== null) {
    parts.push(`position ${spokenPosition(model.position.lat, model.position.lon)}`);
  }
  if (direction.degrees !== null) {
    parts.push(`${direction.source} ${headingText(direction.degrees)}`);
  }
  if (!live) {
    parts.push('last known position');
  }
  return parts.join(', ');
}
```

   - `unitWord` is `'nautical mile'` for nm and `'kilometre'` for km. `headingText`
     (`src/domain/instruments/geometry.ts`) returns the three-digit form without a degree sign,
     and 360 for north.
   - In the test, the direction is the true **track** (140 kt ≥ 5), so the sentence ends
     `track 090`.
8. **Under the map:**
   - `TRACK_NOT_AVAILABLE` (as `BodyText muted`) when `direction.source === 'none'`;
   - then `<MapReadout />`;
   - then `<BodyText muted testID="map-credit">{MAP_CREDIT}</BodyText>`.

Registry: import `MAP_PANEL, MapPanel` and insert `{ descriptor: MAP_PANEL, Component: MapPanel }`
after Navigation.

PanelIcon: add a `case 'map':` glyph. Draw a folded map: a `Polygon` outline
`points="3,6 9,4 15,6 21,4 21,18 15,20 9,18 3,20"` stroked, with two `Line`s at x = 9 and x = 15
for the folds, stroke width 2 and no fill, in the style of the other glyphs.

`tests/ui/panels.test.tsx`:
- insert `'map'` after `'navigation'` in the order test;
- change the `fillsFrame` expectation to `['map', 'cdu']`.

- [ ] **Step 6: Run the tests and make sure they pass**

Run:
- `npx jest tests/ui/map-panel.test.tsx tests/ui/panels.test.tsx tests/unit/theme/tokens.test.ts tests/unit/features`
- then the full gate.

Expected: PASS. If `touch-target-guard` or `error-text-guard` now fails because the map panel
renders in their sweep with no map values, leave it for Task 6 only if the failure is a missing
expectation. A crash must be fixed here.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(map): the Map panel: outlines, runways, rings, ownship and readout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Map controls: orientation, range, pan and centre

**Files:**
- Create: `src/features/panels/map/useMapPan.ts`
- Create: `src/features/panels/map/MapControls.tsx`
- Modify: `src/features/panels/map/MapPanel.tsx`
- Test: `tests/ui/map-controls.test.tsx`

**Interfaces:**
- Consumes:
  - Task 3: `useMapPreference`, `MapPreference`, `screenDeltaToPlane`, `mapView`.
  - Task 2: `unproject`, `project`, `MAP_RANGES`.
- Produces:
  - `useMapPan(input: { now: number; view: MapView | null; anchor: LatLon | null; ownship: LatLon | null }): { centre: LatLon | null; panned: boolean; recentre: () => void; handlers: ResponderHandlers }`;
  - test ids `map-touch`, `map-range-down`, `map-range-up`, `map-centre`.
  - The orientation chips' accessible names are "North up" and "Track up".

- [ ] **Step 1: Write the failing tests**

`tests/ui/map-controls.test.tsx` reuses the snapshot builder. Export `mapSnapshot` and `tree` from
a shared spot: move them into `tests/helpers/map.ts` (with a `now` parameter on `tree`), and import
them in both UI test files.

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import { MAP_STORAGE_KEY } from '@/features/panels/map/map-preference';

import { MAP_NOW as NOW, mapSnapshot, mapTree, symbolX } from '../helpers/map';

const HIDDEN = { includeHiddenElements: true };
const transformOf = (testID: string) => String(screen.getByTestId(testID, HIDDEN).props.transform ?? '');
const has = (text: string) => screen.getAllByText(text, HIDDEN).length > 0;

async function drag(dx: number) {
  const touch = screen.getByTestId('map-touch');
  await fireEvent(touch, 'responderGrant', { nativeEvent: { pageX: 100, pageY: 100 } });
  await fireEvent(touch, 'responderMove', { nativeEvent: { pageX: 100 + dx, pageY: 100 } });
  await fireEvent(touch, 'responderRelease', { nativeEvent: { pageX: 100 + dx, pageY: 100 } });
}

describe('map controls', () => {
  it('switches to track-up: the map turns, the symbol stands upright, the north arrow shows', async () => {
    const storage = createMemorySettingsStorage();
    await render(mapTree(mapSnapshot(), { storage }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Track up' }));
    expect(transformOf('map-ownship')).toContain('rotate(0)');
    expect(screen.getByTestId('map-north-arrow', HIDDEN)).toBeTruthy();
    expect(JSON.parse((await storage.getItem(MAP_STORAGE_KEY))!)).toEqual({ orientation: 'track', range: 10 });
  });

  it('steps the range and stops at the ends', async () => {
    const storage = createMemorySettingsStorage();
    await render(mapTree(mapSnapshot(), { storage }));
    await fireEvent.press(screen.getByTestId('map-range-up'));
    expect(has('20 nm')).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      await fireEvent.press(screen.getByTestId('map-range-down'));
    }
    expect(has('2 nm')).toBe(true);
    expect(screen.getByTestId('map-range-down').props.accessibilityState).toMatchObject({ disabled: true });
    expect(JSON.parse((await storage.getItem(MAP_STORAGE_KEY))!)).toEqual({ orientation: 'north', range: 2 });
  });

  it('restores the remembered settings', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(MAP_STORAGE_KEY, JSON.stringify({ orientation: 'track', range: 40 }));
    await render(mapTree(mapSnapshot(), { storage }));
    expect((await screen.findAllByText('40 nm', HIDDEN)).length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: 'Track up' }).props.accessibilityState).toMatchObject({ checked: true });
  });

  it('pans with a drag, offers Centre, and centres again on Centre', async () => {
    await render(mapTree(mapSnapshot()));
    const before = symbolX(transformOf('map-ownship'));
    await drag(60);
    // The map follows the finger, so the symbol moves 60 px right with it (north-up).
    expect(symbolX(transformOf('map-ownship'))).toBeCloseTo(before + 60, 3);
    await fireEvent.press(screen.getByRole('button', { name: 'Centre' }));
    expect(screen.queryByRole('button', { name: 'Centre' })).toBeNull();
    expect(symbolX(transformOf('map-ownship'))).toBeCloseTo(before, 3);
  });

  it('ignores a tap that does not move', async () => {
    await render(mapTree(mapSnapshot()));
    await drag(2);
    expect(screen.queryByRole('button', { name: 'Centre' })).toBeNull();
  });

  it('centres again by itself 30 s after the last touch', async () => {
    const storage = createMemorySettingsStorage();
    const { rerender } = await render(mapTree(mapSnapshot(), { storage, now: NOW }));
    await drag(60);
    await rerender(mapTree(mapSnapshot(), { storage, now: NOW + 29_000 }));
    expect(screen.getByRole('button', { name: 'Centre' })).toBeTruthy();
    await rerender(mapTree(mapSnapshot(), { storage, now: NOW + 30_000 }));
    expect(screen.queryByRole('button', { name: 'Centre' })).toBeNull();
  });

  it('keeps the panned centre when the range changes', async () => {
    await render(mapTree(mapSnapshot()));
    await drag(60);
    await fireEvent.press(screen.getByTestId('map-range-up'));
    expect(screen.getByRole('button', { name: 'Centre' })).toBeTruthy();
    expect(has('20 nm')).toBe(true);
  });

  it('keeps every control usable when the link is not live', async () => {
    await render(mapTree(mapSnapshot({ stale: true })));
    await fireEvent.press(screen.getByTestId('map-range-up'));
    expect(has('20 nm')).toBe(true);
  });
});
```

The symbol's x comes from its own `translate(x y)`. If `props.transform` is not a string under
the jest svg mock, put the symbol's screen position on a wrapping `G` as plain `x`/`y` props, with
`testID="map-ownship"`, and read those instead. Keep the test's meaning: the drag moves the
symbol by the finger's distance.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx jest tests/ui/map-controls.test.tsx`

Expected: FAIL, because there are no radios or range buttons.

- [ ] **Step 3: Implement**

`src/features/panels/map/useMapPan.ts`:

```ts
import { useCallback, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

import type { LatLon } from '@/domain/map/map-data';
import { project, unproject } from '@/domain/map/projection';
import { type MapView, screenDeltaToPlane } from '@/domain/map/view';

/** Spec §4.4 and ruling 7. */
export const AUTO_CENTRE_MS = 30_000;
/** Below this many pixels a touch is a tap, not a drag. */
const DRAG_SLOP_PX = 6;

interface Drag {
  startX: number;
  startY: number;
  /** The centre and anchor when the finger went down: the drag is measured from them. */
  from: LatLon;
  anchor: LatLon;
  moved: boolean;
}

export interface ResponderHandlers {
  onStartShouldSetResponder: () => boolean;
  onResponderGrant: (event: GestureResponderEvent) => void;
  onResponderMove: (event: GestureResponderEvent) => void;
  onResponderRelease: () => void;
  onResponderTerminate: () => void;
}

export function useMapPan({
  now,
  view,
  anchor,
  ownship,
}: {
  now: number;
  view: MapView | null;
  anchor: LatLon | null;
  ownship: LatLon | null;
}) {
  const [panCentre, setPanCentre] = useState<LatLon | null>(null);
  const [lastTouchAt, setLastTouchAt] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Auto-centre: adjusted during render on the panel's own 1 s clock (no timer of our own).
  if (panCentre !== null && drag === null && lastTouchAt !== null && now - lastTouchAt >= AUTO_CENTRE_MS) {
    setPanCentre(null);
    setLastTouchAt(null);
  }

  const recentre = useCallback(() => {
    setPanCentre(null);
    setLastTouchAt(null);
  }, []);

  const handlers: ResponderHandlers = {
    onStartShouldSetResponder: () => view !== null && ownship !== null,
    onResponderGrant: (event) => {
      const from = panCentre ?? ownship;
      if (from === null || anchor === null) {
        return;
      }
      setDrag({
        startX: event.nativeEvent.pageX,
        startY: event.nativeEvent.pageY,
        from,
        anchor,
        moved: false,
      });
    },
    onResponderMove: (event) => {
      if (drag === null || view === null) {
        return;
      }
      const dx = event.nativeEvent.pageX - drag.startX;
      const dy = event.nativeEvent.pageY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) {
        return;
      }
      const delta = screenDeltaToPlane(view, dx, dy);
      const start = project(drag.anchor, drag.from);
      setPanCentre(unproject(drag.anchor, { x: start.x - delta.x, y: start.y - delta.y }));
      setLastTouchAt(now);
      if (!drag.moved) {
        setDrag({ ...drag, moved: true });
      }
    },
    onResponderRelease: () => {
      if (drag?.moved) {
        setLastTouchAt(now);
      }
      setDrag(null);
    },
    onResponderTerminate: () => setDrag(null),
  };

  return { centre: panCentre ?? ownship, panned: panCentre !== null, recentre, handlers };
}
```

The `now` from `usePanel()` ticks once a second, so a touch stamps the panel clock's time. The
30 s rule therefore holds to within a second, which is acceptable.

`src/features/panels/map/MapControls.tsx`:

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { MAP_RANGES, type MapOrientation, type MapRange } from '@/domain/map/catalogue';
import { rangeLabel } from '@/domain/map/map-format';
import type { DistanceUnit } from '@/domain/units/units';
import { ActionButton } from '@/theme/ActionButton';
import { RadioChips, type RadioChipOption } from '@/theme/RadioChips';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const ORIENTATION_OPTIONS: readonly RadioChipOption<MapOrientation>[] = [
  { value: 'north', label: 'North up', accessibilityLabel: 'North up' },
  { value: 'track', label: 'Track up', accessibilityLabel: 'Track up' },
];

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: theme.touch.spacing },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing.sm },
  step: {
    minWidth: theme.touch.minTarget,
    minHeight: theme.touch.minTarget,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepDisabled: { opacity: 0.45 },
  stepText: { color: theme.colors.text, fontSize: theme.typography.titleSize, fontWeight: 'bold' as const },
  range: { color: theme.colors.text, fontSize: theme.typography.bodySize, minWidth: 56, textAlign: 'center' as const },
});

/** Local view controls: they never touch the simulator, so they work on a dead link too. */
export function MapControls({
  orientation,
  range,
  unit,
  trackAvailable,
  panned,
  onOrientation,
  onRange,
  onCentre,
}: {
  orientation: MapOrientation;
  range: MapRange;
  unit: DistanceUnit;
  trackAvailable: boolean;
  panned: boolean;
  onOrientation: (next: MapOrientation) => void;
  onRange: (next: MapRange) => void;
  onCentre: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const index = MAP_RANGES.indexOf(range);
  const step = (by: -1 | 1) => {
    const next = MAP_RANGES[index + by];
    if (next !== undefined) {
      onRange(next);
    }
  };
  const label = rangeLabel(range, unit);
  return (
    <View style={styles.row}>
      <RadioChips
        options={ORIENTATION_OPTIONS}
        selected={trackAvailable ? orientation : 'north'}
        onSelect={onOrientation}
        accessibilityLabel="Map orientation"
      />
      <View style={styles.stepper}>
        <Pressable
          testID="map-range-down"
          accessibilityRole="button"
          accessibilityLabel={`Zoom in, range ${label}`}
          accessibilityState={{ disabled: index <= 0 }}
          disabled={index <= 0}
          onPress={() => step(-1)}
          style={[styles.step, index <= 0 ? styles.stepDisabled : null]}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.range}>{label}</Text>
        <Pressable
          testID="map-range-up"
          accessibilityRole="button"
          accessibilityLabel={`Zoom out, range ${label}`}
          accessibilityState={{ disabled: index >= MAP_RANGES.length - 1 }}
          disabled={index >= MAP_RANGES.length - 1}
          onPress={() => step(1)}
          style={[styles.step, index >= MAP_RANGES.length - 1 ? styles.stepDisabled : null]}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
      {panned ? <ActionButton title="Centre" variant="secondary" onPress={onCentre} /> : null}
    </View>
  );
}
```

`RadioChips` adds `marginBottom: theme.spacing.lg` to its row. If that misaligns the controls row,
pass the chips through a `View` with `marginBottom: -theme.spacing.lg`. Do not change
`RadioChips`; other screens use it.

In `MapPanel.tsx`'s `MapContent`:
- `const [preference, setPreference] = useMapPreference()` and `const { now } = usePanel()`.
- `const pan = useMapPan({ now, view, anchor: anchor?.at ?? null, ownship: model.position })`.
  - The map centre is `pan.centre`.
  - The anchor rule (Task 4) now uses `pan.centre` instead of `model.position`.
- Wrap the `MapCanvas` in `<View testID="map-touch" {...pan.handlers}>`.
- Render `MapControls` above the map area, with:
  - `trackAvailable={direction.degrees !== null}`;
  - `onOrientation={(orientation) => setPreference({ ...preference, orientation })}`;
  - `onRange={(range) => setPreference({ ...preference, range })}`;
  - `onCentre={pan.recentre}`.
- The `MapCanvas` `ownship` prop is `project(anchor.at, model.position)`, and its `centre` prop is
  `project(anchor.at, pan.centre)`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx jest tests/ui/map-controls.test.tsx tests/ui/map-panel.test.tsx`, then the full gate.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(map): orientation, range, pan and centre, remembered across launches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End to end, guards and documentation

**Files:**
- Test: `tests/integration/map.test.ts`
- Modify: `tests/ui/touch-target-guard.test.tsx`, `tests/ui/error-text-guard.test.tsx` (feed map values from `tests/helpers/map.tsx` so the controls render)
- Modify docs:
  - `docs/xplane.md` (a Moving map section with the names table);
  - `docs/architecture.md` (a `## Moving map` section after Radios and transponder);
  - `README.md` (a feature bullet);
  - `docs/roadmap/features/F-13-moving-map.md` (Status: Done, plus a link to the spec);
  - `docs/roadmap/ROADMAP.md` (the F-13 row links the spec; F-05 is deferred; a Stage 3 build order line);
  - `docs/testing/xplane-smoke-test.md` (rows 183–190).

**Interfaces:**
- Consumes: everything above; `MockXPlaneServer.setDataRefValue(name, value)` and `removeDataRef(name)`.

- [ ] **Step 1: Write the integration test**

`tests/integration/map.test.ts` builds the session exactly as `tests/integration/audio.test.ts`
does (copy `createSession`, `FAST_RECONNECT` and `until`), then:

```ts
describe('the moving map against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  const model = (session: SimulatorSession) => mapModel(mapReader(session.store.getSnapshot()));

  it('delivers position, GPS altitude, true heading and true track', async () => {
    const session = createSession();
    session.setDemand([FEATURE_MOVING_MAP]);
    await session.connect(server.host, server.port);
    await until(() => model(session).status === 'ready' && model(session).trueTrack !== null);
    expect(model(session)).toMatchObject({
      position: { lat: 47.449, lon: -122.3093 },
      elevationM: 132,
      trueHeading: 180,
      trueTrack: 181,
    });
    session.disconnect();
  });

  it('follows a moved position', async () => {
    const session = createSession();
    session.setDemand([FEATURE_MOVING_MAP]);
    await session.connect(server.host, server.port);
    await until(() => model(session).status === 'ready');
    server.setDataRefValue(MAP_DATAREFS.latitude, 47.5);
    server.setDataRefValue(MAP_DATAREFS.longitude, -122.2);
    await until(() => model(session).position?.lat === 47.5 && model(session).position?.lon === -122.2);
    session.disconnect();
  });

  it('is unavailable, and says why, when latitude is missing', async () => {
    server.removeDataRef(MAP_DATAREFS.latitude);
    const session = createSession();
    session.setDemand([FEATURE_MOVING_MAP]);
    await session.connect(server.host, server.port);
    await until(() => model(session).status === 'unavailable');
    session.disconnect();
  });
});
```

Imports:
- `mapModel` from `@/domain/map/map-model`;
- `mapReader` from `@/features/panels/map/map-reader`;
- `FEATURE_MOVING_MAP` and `MAP_DATAREFS` from `@/domain/map/catalogue`;
- the rest as in the audio test.

Run: `npx jest tests/integration/map.test.ts`

Expected: PASS. If "delivers" races on `elevationM`, wait on it in `until` too, as the audio test
does for its first value.

- [ ] **Step 2: Extend the guards**

Read both guard files.
- Wherever they build telemetry and compatibility for a panel sweep (they import the audio and
  systems helpers), merge in `MAP_VALUES`, `mapCompatibility` and `mapTelemetry` from
  `tests/helpers/map.tsx` in the same way.
- The map's range buttons, chips and Centre then render and fall under the 48 dp sweep.
- The error-text guard proves that no DataRef name, id or code appears in the map's text.

Run: `npx jest tests/ui/touch-target-guard.test.tsx tests/ui/error-text-guard.test.tsx`

Expected: PASS. A failure on the range buttons means their style lost `minWidth` or `minHeight`;
fix the style, not the guard.

- [ ] **Step 3: Write the docs**

`docs/xplane.md`: add a `## Moving map (F-13)` section with the spec §3 table (name, type, units,
"Verified against the 12.4.3 DataRef database"), plus:
- one line saying `hpath` is the true track (hpath + beta = psi);
- one line on why `magnetic_variation` is not used.

`docs/architecture.md`: add `## Moving map` after the Radios and transponder section. In 2–4
paragraphs, cover:
- the bundled snapshot (`assets/map`, the build script, cells, quantisation, lazy `require` outside
  the TypeScript program);
- the anchor-plane projection with one group transform per tick, and re-anchoring at a quarter
  range;
- the three-answer model;
- direction with hysteresis;
- the panel-clock auto-centre;
- local controls that work on a dead link.

`README.md`: add a bullet in the features list, in the same voice as its neighbours: "**Moving
map**: the aircraft on a built-in outline map with runways and airport identifiers, north-up or
track-up, range rings, works without internet."

`docs/roadmap/features/F-13-moving-map.md`: change `Status | Proposed` to `Status | Done`, and add
under Summary a line "Delivered by `docs/superpowers/specs/2026-10-07-moving-map-design.md`."

`docs/roadmap/ROADMAP.md`:
- the F-13 row's file cell links the spec, as the F-23 row does;
- the F-05 row gets "Deferred (2026-10-07, user decision)" in its "Why now" cell;
- under the Stage 3 table, add: "Build order (decided 2026-10-07): F-13, F-40, F-31, F-25, F-06.
  F-05 demo mode is deferred until after Stage 3."

`docs/testing/xplane-smoke-test.md`: add rows 183–190 under a `F-13 Moving map` heading. Copy the
column layout of rows 173–182 exactly:
- **183:** circuit at a known airfield; the symbol is over the runway on touchdown;
- **184:** track-up through a 360° turn; the map turns smoothly at 10 Hz steps and the symbol stays
  upright;
- **185:** the outer ring against the NAV DME over a VOR (the ring distance agrees within 0.5 nm at
  10 nm);
- **186:** Wi-Fi off; the symbol turns hollow with LAST KNOWN, and the frame gives the age;
- **187:** pan, wait 30 s, auto-centre;
- **188:** frame rate while panning at 40 nm on a phone (no stutter worse than the 10 Hz telemetry);
- **189:** the antimeridian, a flight Fiji to Tonga or across the Kamchatka coast, with no
  map-wide line;
- **190:** taxi below 3 kt; the symbol follows the heading, not a jittering track.

- [ ] **Step 4: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npx jest 2>&1 | tail -8`

Expected: everything passes, with no warnings.

- [ ] **Step 5: Commit**

```bash
git add tests docs README.md
git commit -m "test(map): end to end against the mock, guards and F-13 docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
