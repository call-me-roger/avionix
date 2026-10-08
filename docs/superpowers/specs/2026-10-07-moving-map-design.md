# F-13 Moving map — design

Status: approved for planning (2026-10-07, autonomous session: decisions driven by competitor
research and pilot sentiment, recorded below as rulings).

Roadmap entry: `docs/roadmap/features/F-13-moving-map.md`. Research:
`docs/roadmap/research/moving-map.md` (new, written with this spec) and
`docs/roadmap/research/efb-moving-map.md`.

## 1. Goal

Answer "where am I": a Map panel that puts the ownship on an outline map at the simulated
position, turned to its track, with range rings, a track-up or north-up choice, and the runways
around it. It works with no internet on the device, because a sim LAN is often isolated.

## 2. What the research says

- **A moving map is the most common feature in the competitor set** (12 of 28 products), so its
  absence is conspicuous. Simmers judge a companion map against real EFBs and Little Navmap; AviTab
  is called thin ("isn't close to what is on LittleNavMap").
- **Track-up is asked for by name.** AviTab issue #56: "If flying south with a North-Up map, left on
  the screen is right in the real world"; ForeFlight, Garmin Pilot and SkyDemon offer track-up as
  standard.
- **Needing the internet for a local flight is a complaint**, not a feature (Navigraph Simlink).
  The sim LAN is often isolated.
- **Silent staleness is the failure to avoid**: ForeFlight users saw the approach minutes after
  landing. A visible link state earns credit.
- **Base map options** (research §1):
  - OpenStreetMap's own tile server forbids distributed-app and offline use.
  - OpenFreeMap needs no key but is a donation-run instance with no SLA.
  - MapLibre Native is native-only (no web build), needs the New Architecture and a new dev build.
  - react-native-maps needs a Google API key on Android and has no working web build.
  - **Natural Earth** (outlines) and **OurAirports** (runway ends) are public domain and can ship
    inside the app; 1:50m outlines plus every runway measure about 1.4 MB (research §4).

## 3. X-Plane names (verified)

All verified against the live 12.4.3 DataRef database (`CURRENT`, readable):

| Purpose | Name | Type, units |
|---|---|---|
| Latitude | `sim/flightmodel/position/latitude` | double, degrees |
| Longitude | `sim/flightmodel/position/longitude` | double, degrees |
| GPS altitude | `sim/flightmodel/position/elevation` | double, metres MSL |
| True heading | `sim/flightmodel/position/true_psi` | float, degrees true |
| True track | `sim/flightmodel/position/hpath` | float, degrees true ("the heading the aircraft actually flies", hpath + beta = psi) |
| Magnetic track (readout) | `sim/cockpit2/gauges/indicators/ground_track_mag_pilot` | float, degrees magnetic (already in `flight-data`) |
| Ground speed | `sim/cockpit2/gauges/indicators/ground_speed_kt` | float, knots (already in `flight-data`) |

The map is drawn in true north, so the symbol and track-up rotation use the true values; the
readout shows the magnetic track F-11 shows, from the same DataRef, so the strip and the map can
never disagree. `magnetic_variation` is not needed (no sign convention to get wrong). Nothing is
written and no command is activated (R12).

## 4. Design

### 4.1 Placement

A new **Map** panel (id `map`, title `Map`, every device and orientation, `fillsFrame`), placed in
the switcher after Navigation. It is a whole-screen page, the one a second device suits best. The
flight data strip stays docked above it as on every other panel.

### 4.2 Base map (bundled, offline)

- **Outlines:** Natural Earth 1:50m land, lakes and land borders, simplified (0.005°) and quantised
  to 0.001°. Land is a filled shape over a water background; lakes are water; borders are thin
  dashed lines. No coastline stroke: the land/water edge is the coastline.
- **Runways:** every open OurAirports runway with both ends located (about 14,900), drawn from its
  two surveyed ends as a line whose width follows the runway's width (at least 2 px), quantised to
  0.00001° (about 1 m). An airport's identifier (ICAO code, else GPS code, else OurAirports ident)
  is drawn beside its runways.
- **Density by range:**

  | Range | Runways drawn | Identifiers |
  |---|---|---|
  | ≤ 20 | all | all drawn airports |
  | 40, 80 | longest runway at the airport ≥ 3,000 ft | airports with a runway ≥ 5,000 ft |
  | 160 | ≥ 6,000 ft | none |

- **Tiles:** both datasets are cut at build time into 5° cells (polygons clipped per cell, so fills
  stay correct; airports by reference point, each runway in its airport's cell) and committed as JSON under
  `assets/map/` (outside Prettier and the TypeScript program, loaded on first use). `scripts/build-map-data.mjs` regenerates them from the public sources
  and stamps the source dates into the files.
- **Credit line** under the map: "Outlines: Natural Earth. Runways: OurAirports. Not for
  navigation." Neither source requires attribution; it is said because the data is a snapshot.
- Nothing is fetched from the internet, so no base-map failure state exists (R8 holds by
  construction).

### 4.3 Projection and drawing

- Local equirectangular projection in nautical miles around an **anchor**:
  `x = Δlon · 60 · cos(lat_anchor)`, `y = −Δlat · 60`, with Δlon wrapped to [−180, 180] so the
  antimeridian works. Accurate for the ranges offered except at very high latitude, which is
  stated as a known limitation.
- Paths are built in anchor coordinates only when the anchor changes. The anchor moves when the
  map centre has drifted more than a quarter of the range from it, or when the range or the data
  density changes. Every telemetry tick only changes one SVG group transform: translate to the
  screen anchor, rotate, scale, and offset by the centre's position relative to the anchor. A tick
  never rebuilds a path.
- Only cells within `1.5 × range` of the anchor (plus the re-anchor margin) are drawn.
- **No smoothing** (the project rule): the symbol is drawn exactly where the last value put it,
  never interpolated or extrapolated.

### 4.4 Ownship, orientation and range

- **Ownship symbol:** an aircraft outline at the screen anchor.
- **Direction:**
  - The direction is the true track, while ground speed is at least 5 kt (hysteresis: back to
    heading below 3 kt). Otherwise it is the true heading, because track is noise when standing
    still.
  - With neither value known, the symbol is a circle and track-up is unavailable; the map shows
    north-up and says "Track not available."
- **Orientation**, `RadioChips` "North up" / "Track up", remembered:
  - In north-up the map is fixed and the symbol turns. The symbol sits at the centre.
  - In track-up the map turns so the direction points up and the symbol stays upright. The symbol
    sits at 70% of the map's height, so more is shown ahead, as EFBs do.
- **Range:** − and + buttons with the current range between them, remembered. The ranges are 2,
  5, 10, 20, 40, 80 and 160, in the pilot's distance unit (nm or km, from the shared units
  setting). The default is 10.
  - The outer ring's radius is the range. It is 0.9 of the shorter of: half the map's width, and
    the distance from the symbol to the map's top edge (in north-up, half the height).
  - A second ring is drawn at half the range. Both rings are labelled ("10 NM", "5 NM").
  - A north arrow is shown in track-up.
- **Pan:** dragging the map moves its centre to a geographic point and stops auto-centring. A
  **Centre** button appears and restores it. Auto-centring also returns 30 s after the last touch.
  The symbol is drawn at its true place relative to the panned centre. No pinch zoom: the range
  buttons are the zoom.

### 4.5 Readout

A row under the map, built from `Readout`, so it is muted and marked "not live" by the panel rules:

- position, in degrees and decimal minutes (`N47°27.12′ W122°18.53′`);
- GPS altitude in feet (`elevation`, metres to feet; never the barometric altitude, so it is
  labelled "GPS alt");
- ground speed and magnetic track, formatted exactly as F-11 formats them.

### 4.6 Link states (R5, R6)

Freshness is the link's, as everywhere else (architecture, Flight data).

- **Live:** the symbol is solid.
- **Not live:**
  - the last position stays;
  - the symbol is drawn hollow in the stale colour with a "LAST KNOWN" tag;
  - the panel frame's one notice gives the age ("X-Plane stopped sending data. Last update
    14 s ago.").
  - The map never blanks and never moves the symbol.
- **No flight loaded:** no symbol; the frame says so.
- **Waiting for the position** (for example the first ticks after switching to the panel): no
  symbol, and the map says "Waiting for position."

### 4.7 Availability (three answers)

New profile feature `moving-map`, "Moving map":

- `latitude` and `longitude` are required.
- `elevation`, `true_psi` and `hpath` are optional.
- `ground_track_mag_pilot` and `ground_speed_kt` are reused from `flight-data` (on the reuse list,
  like the marker lamps).

Only a **definitive** miss produces a sentence, as for audio and systems:

- latitude or longitude missing: "The moving map isn't available on the Cessna 172: X-Plane doesn't
  report its position." With no position there is nothing to centre on, so the map area shows only
  that sentence: no outlines, no rings, no symbol;
- an optional value missing: only its readout field or the direction falls back, as in §4.4.

Unchecked names draw nothing and say nothing.

### 4.8 Accessibility

The map is one accessible image with a sentence: "Map, track up, 10 nautical mile range, position
N 47 27.12, W 122 18.53, true track 087." The stale state adds "last known position". Controls are
standard 48 dp buttons and chips. The map's colours are theme tokens with a night variant (no
colour brighter than a relative luminance of 0.30).

### 4.9 Persistence

`avionix.map`: `{ orientation: 'north' | 'track', range: number }`, zod-validated, best effort:
an unreadable value falls back to north-up and 10, as the other preferences do.

## 5. Profile

`generic` 1.10.0 gains `moving-map` (§4.7). Nothing is written.

## 6. Mock X-Plane

DataRefs from id 1600:

- latitude 47.4490, longitude −122.3093 (Seattle–Tacoma), elevation 132 m;
- true heading 180, true track 181.

The existing ground speed and track serve the readout.

## 7. Testing

- **Unit:**
  - projection: the antimeridian, high latitude, round trip;
  - the anchor rule;
  - cell selection by range;
  - the density table;
  - the direction source with hysteresis;
  - ring geometry;
  - coordinate formatting;
  - the decoder for the committed data;
  - the data files' shape and source stamp;
  - the profile shape (1.10.0, reuse list, nothing written);
  - the preference load and save.
- **UI:**
  - the symbol is placed and rotated in both orientations;
  - the orientation and range controls persist;
  - the rings are labelled in nm and km;
  - pan and centre;
  - stale hollow symbol and tag;
  - waiting, no flight, position missing, optional values missing;
  - the readout matches the strip;
  - the accessible sentence;
  - touch targets and the error-text guard.
- **Integration against the mock:**
  - position, track and readout arrive and render;
  - a moved position moves the symbol;
  - a missing latitude gives the one sentence.

Device rows in `docs/testing/xplane-smoke-test.md`: a circuit at a known airfield (the symbol over
the runway on touchdown, track within a degree); track-up on a turn; rings against the HSI's DME;
stale on Wi-Fi off; frame rate while panning on a phone; the antimeridian (Fiji, Kamchatka).

## 8. Out of scope

- Route and legs: F-31.
- Traffic: F-40.
- Navaids, airspace, procedures, frequencies, charts and airport search: F-34.
- Terrain and weather.
- Online tiles.
- 1:10m outlines.
- Pinch zoom.
- Any write or command.

## 9. Rulings

1. **Bundled Natural Earth 1:50m plus OurAirports runways, drawn with react-native-svg**, not
   online tiles or a native map library: offline, no key, no licence risk, works on the web, and
   needs no new dev build.
   - Cost: outlines are generalised and can be off by kilometres at short range. Runways are exact,
     and they are what matters near the ground.
   - Upgrade path: 1:10m tiles as a downloaded asset.
2. **Runways and airport identifiers are drawn now**, though the roadmap put airports in F-34.
   - Why: a map with nothing inland fails the "thin map" test pilots apply.
   - Cost: some navdata-like content arrives early. Frequencies, navaids and procedures stay in
     F-34.
3. **Track-up rotates by true track above 5 kt and true heading below 3 kt.** Cost: none.
4. **Track-up puts the symbol at 70% of the height.** Cost: less is shown behind.
5. **The range follows the distance unit setting** (nm or km), not always nm, so no two screens
   disagree. Cost: none.
6. **No pinch zoom.** Cost: one more tap per range change.
7. **Auto-centre returns 30 s after the last touch.** Cost: a pilot studying a panned area must
   touch it again.
8. **Readout altitude is GPS altitude, labelled as such.** Cost: it differs from the altimeter by
   the baro error, which the label explains.
9. **No per-aircraft default range.** Cost: a jet pilot taps + twice once; the choice is
   remembered.
10. **F-05 demo mode is deferred** (user decision, 2026-10-07). Stage 3 order: F-13, F-40, F-31,
    F-25, F-06.
