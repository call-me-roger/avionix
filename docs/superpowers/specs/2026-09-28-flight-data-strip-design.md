# Flight data strip — design

Feature: `F-11` (roadmap Stage 1, sub-project 4). Spec date: 2026-09-28.
Source: [docs/roadmap/features/F-11-flight-data-strip.md](../../roadmap/features/F-11-flight-data-strip.md).
Builds on: F-02 (connection health), F-03 (aircraft compatibility, profiles), F-04 (panel
framework, [spec](2026-09-26-panel-framework-design.md)).

## Goal

The numbers a pilot keeps checking but no instrument on the panel shows — ground speed, true
airspeed, ground track, wind, outside air temperature, fuel remaining, simulator zulu and local
time, paused and replay — shown two ways from one source:

- a **Flight data panel** in the switcher, with every field, the GPS destination, and room to read
  it from a phone propped beside a tablet;
- a **compact strip** docked under the link status bar on every panel, so ground speed, wind, fuel
  and zulu time are at a glance while the pilot works the heading panel, and later the autopilot or
  radios.

The strip is read-only (R11): it writes no DataRef and activates no command.

## Why this now

- No mobile competitor ships this as a named readout. Laminar's own iPad app offers only a raw
  DataRef console; EFBs carry position and attitude, never fuel or simulator time
  (`research/competitors.md`, the F-11 feature file).
- Complaint #2 is silent stale data: ForeFlight users "land and be on the ground for sometimes up to
  5 minutes" before the map catches up. A strip that says "paused", "replay" or "not live" in words
  is the answer; ForeFlight's own praised fix is a visible link readout.
- It is the common value source for the moving map (F-13) and the flight recorder (F-14). Units are
  settled here once, in a shared module, so those features cannot disagree with it.
- It retires the interim "Basic data" panel F-04 shipped as a placeholder.

## Scope

**In.** A `flight-data` profile feature and a `gps-destination` profile feature in the generic
profile. Unit preferences (fuel kg/lb, temperature °C/°F, distance nm/km) persisted and shared. The
Flight data panel; the docked strip with a Setup toggle; paused and replay indicators; simulator
clock formatting; the destination block with its honest absent states; the base64 `gps_nav_id`
decoding; retiring `basic-data` with a migration of stored layouts to `flight-data`; the mock
server, tests, docs and device checks.

**Out.** Indicated airspeed, altitude, attitude, heading, vertical speed (F-10). Per-tank fuel, fuel
flow, engines (F-12). The route and next waypoint (F-31). Fuel volume units: litres and gallons
need an aircraft-specific density, which the Web API does not provide — only mass units ship.
Extrapolating or smoothing any value. Writing anything.

## Architecture

### Profile features (F-03's registry)

Two features join `GENERIC_PROFILE`, every binding optional, so a missing name costs its own field
and never the feature's other fields (R7):

| Feature | Label | Bindings (all `required: false`, read-only) |
|---|---|---|
| `flight-data` | Flight data | `sim/cockpit2/gauges/indicators/ground_speed_kt`, `…/true_airspeed_kts_pilot`, `…/ground_track_mag_pilot`, `…/wind_speed_kts`, `…/wind_heading_deg_mag`, `sim/cockpit2/temperature/outside_air_temp_degc`, `sim/cockpit2/gauges/indicators/TAT_pilot`, `sim/flightmodel/weight/m_fuel_total`, `sim/time/zulu_time_sec`, `sim/time/local_time_sec`, `sim/time/is_in_replay` |
| `gps-destination` | GPS destination | `sim/cockpit2/radios/indicators/gps_dme_distance_nm`, `…/gps_dme_time_min`, `…/gps_nav_id` |

The pause flag is already `connection-health`'s `sim/time/paused`, always subscribed; F-02's
`activity === 'paused'` is the paused signal, so the strip and the status bar can never disagree.

Names follow the feature file, which verified most against Laminar's list and marks the GPS three
and the pause flag as community-sourced. Every name is optional, so a wrong one degrades to
"not available on this aircraft" for that field instead of breaking the strip; the device checks
confirm them.

`GENERIC_DATAREFS` gains the new names under descriptive keys; `FEATURE_FLIGHT_DATA` and
`FEATURE_GPS_DESTINATION` are exported next to the existing feature ids.

### Freshness: one age per panel, not per value

X-Plane streams only values that **changed** (delta-only after the first update). A steady fuel
reading or a constant OAT therefore arrives once and never again; its `receivedAt` says when it
last *changed*, not whether it is still true. Marking each value stale by its own `receivedAt`
would call a perfectly current fuel figure "stale" after two seconds of cruise.

So a subscribed value's age is the link's age: F-02's heartbeat freshness, which F-04's
`panelLinkStatus` already turns into "live" or "not live" plus one notice. R4 ("each value shows
its age and is marked stale past a threshold") is met at that level: every value is marked "not
live" when the heartbeat is older than F-02's 2000 ms threshold, and the notice states the age. A
value that has not arrived yet shows "—". This is the same reasoning F-02 recorded for keying
freshness to the heartbeat, and it is the only honest reading of a delta stream.

### States the strip distinguishes (R3, R5, R6)

| Condition | Shown |
|---|---|
| Connected, running | Values, no badge |
| Connected, paused (`activity === 'paused'`) | Values, **PAUSED** badge; not marked stale |
| Connected, in replay (`is_in_replay` = 1) | Values, **REPLAY** badge |
| Connected, no flight loaded (`activity === 'noFlight'`) | No values: "No flight loaded in X-Plane." |
| Stalled, reconnecting, disconnected, error | Last values, muted and "not live"; the panel notice (F-04) says why and how old |

Paused and disconnected are therefore distinct: paused keeps values bright with a badge; a lost
link mutes them. Values are never zeroed and never extrapolated (R5): after a drop the strip shows
exactly the last values the session kept (F-04 keeps telemetry across a dropped link).

`simulatorBadge(activity, inReplay)` in `src/domain/flight-data/sim-state.ts` returns
`'paused' | 'replay' | null`; replay wins over paused, because a replay is usually paused as well
and "replay" is the more useful word.

### Units (R2) — shared with F-13 and F-14

`src/domain/units/units.ts` is the single conversion and formatting module:

- `FuelUnit = 'kg' | 'lb'`, `TemperatureUnit = 'C' | 'F'`, `DistanceUnit = 'nm' | 'km'`.
- `convertFuel(kg, unit)`, `convertTemperature(c, unit)`, `convertDistance(nm, unit)` with the
  exact factors (1 kg = 2.20462262 lb; °F = °C × 9/5 + 32; 1 nm = 1.852 km).
- Speeds stay in knots and directions in degrees, which is what every pilot-facing instrument uses;
  the feature asks for choices only for fuel, temperature and distance.

`src/application/unit-preferences.ts` persists `{ fuel, temperature, distance }` under
`avionix.units` (zod-validated, defaults kg, °C, nm, best-effort saves, unknown values fall back
per field) — the same load/save contract as the theme preference. A `UnitsProvider` (React
context, like `ThemeProvider`) exposes `useUnits()` and `setUnit(kind, value)`, so the panel, the
strip, and later F-13/F-14 read one preference. `AppShell` mounts the provider around its body
(it already reads `settingsStorage` from the services context), so nothing above the shell changes. Setup gains a **Units** section: three rows of
radio chips, each at least 48 dp.

### Formatting (`src/domain/flight-data/format.ts`)

Pure, unit-tested, and the only place values become text:

| Field | Format |
|---|---|
| Ground speed, TAS | whole knots: `142 kt` |
| Ground track | three digits, magnetic: `087°` (360 for 0, as on a heading) |
| Wind | `270° / 12 kt`; below 1 kt → `Calm` |
| OAT, TAT | whole degrees with sign: `−12 °C`, `10 °F` |
| Fuel | whole units with grouping: `1,234 kg` |
| Zulu / local | `HH:MM:SS` from seconds since midnight, labelled "Sim zulu" and "Sim local" so they are never mistaken for the device clock (R2) |
| Distance | one decimal below 10, whole above: `8.4 nm`, `126 nm` |
| Time to destination | `h:mm` (`1:05`); above 99:59 → `more than 99 h` |

Wind direction is labelled "Wind (from)", the meteorological convention X-Plane's instruments use;
the device check confirms it.

### Destination (R8)

The destination block renders only when **all** hold: the `gps-destination` feature is not
`unavailable`, `gps_nav_id` decodes to a non-empty identifier (`decodeDataRefString(value,
'data')`, F-03's decoder), and the distance DataRef has a value. Otherwise it says, in words:

- "No destination available on this aircraft." — the GPS names did not resolve (Zibo and other
  add-ons with their own FMS);
- "No destination set in the GPS." — the names resolved but the identifier is empty.

It never shows a blank or a zero distance. The identifier is shown as the simulator gives it;
Avionix has no navdata to expand it (the feature's open question, answered by honesty). The field
is labelled "GPS destination", not "next waypoint", because the DataRefs describe the active GPS
destination (the feature's other open question).

### The Flight data panel

`src/features/panels/flight-data/FlightDataPanel.tsx`, descriptor
`{ id: 'flight-data', title: 'Flight data', features: ['flight-data', 'gps-destination'], supports:
EVERYWHERE }`, first in the registry. It uses F-04's `Readout` pattern — the value from telemetry
only, "not available on this aircraft" for a missing name, muted "not live" when the link is not —
through a small `FlightValue` row that takes a formatted string instead of `Readout`'s raw
formatting, so units and formats apply. The badge sits under the panel title.

### The docked strip

`src/features/panels/flight-data/FlightDataStrip.tsx`: one row of four compact values — ground
speed, wind, fuel, sim zulu — plus the badge, rendered by `AppShell` between the status bar and the
content on every **panel** route when the strip is enabled (not on Setup, which has no demand and
where the pilot is configuring). The whole strip is one pressable (≥ 48 dp tall) that opens the
Flight data panel.

It is shown on phones too: four short values fit a phone's width in either orientation. The Setup
toggle "Show the flight data strip on every panel" turns it off; the setting joins the panel layout
(`avionix.panels` gains `strip: boolean`, default `true`, old stored layouts parse with the
default). On the Flight data panel itself the strip is hidden: it would repeat the panel.

**Demand.** The shell's `setDemand` call becomes the union of the active panel's features and,
when the strip is visible, `flight-data`. The strip therefore costs its DataRefs only while shown.

### Retiring `basic-data`

The Basic data panel and its test go. `normaliseLayout` learns a small map of retired panel ids,
`{ 'basic-data': 'flight-data' }`: a stored `last` or `hidden` entry for a retired id is rewritten to
its successor before unknown ids are dropped, so a pilot who last had Basic data open reopens on
Flight data rather than being thrown back to Setup.

## Session and snapshot

No session change. The new DataRefs are ordinary profile bindings: F-03 resolves them, F-04's
demand subscribes them while a view reads them, telemetry holds their values. `gps_nav_id` is a
`data` DataRef; its base64 value is decoded at display time from the telemetry sample.

## Surfaces

- Flight data panel (switcher, first).
- The docked strip on every other panel.
- Setup: **Units** section; the strip toggle under **Panels**.
- Diagnostics and compatibility gain the two features automatically (F-03 lists every feature).

## File plan

| Area | Files |
|---|---|
| Domain | `src/domain/units/units.ts`; `src/domain/flight-data/format.ts`, `sim-state.ts`, `destination.ts`; `src/domain/aircraft/profiles/generic.ts` (two features, names) |
| Application | `src/application/unit-preferences.ts`; `src/application/panel-layout.ts` (`strip`, retired ids) |
| UI | `src/features/units/UnitsProvider.tsx`, `UnitsSection.tsx`; `src/features/panels/flight-data/{FlightDataPanel,FlightDataStrip,FlightValue,SimBadge}.tsx`; `src/features/panels/registry.ts`; `src/features/shell/{AppShell,PanelChooser,SetupScreen}.tsx`; `src/app/AvionixApp.tsx` (provider) |
| Deleted | `src/features/panels/basic-data/BasicDataPanel.tsx` |
| Test support | `tests/mock-xplane/mock-xplane-server.ts` default DataRefs for every new name |
| Docs | `docs/xplane.md` (new names and their verification status), `docs/architecture.md`, `README.md`, `docs/testing/xplane-smoke-test.md` |

## Testing

- **Unit:** every conversion and formatter row above, including negatives, zero, rounding
  boundaries, 00:00:00 and 23:59:59, `Calm`, `more than 99 h`; `simulatorBadge`; destination
  decision (all four outcomes, base64 decoding with NUL padding); unit preferences load/save
  (corrupt JSON, one bad field falls back alone); layout `strip` default for an old stored layout
  and the `basic-data` → `flight-data` migration; the generic profile's new features are all
  optional and every name is unique across the profile.
- **UI:** the panel shows every field formatted in the chosen units and switches when a unit
  changes; paused shows the badge and does not mark values not live; replay badge; no flight shows
  the words and no values; disconnected keeps last values muted; a missing name marks only its
  field; the destination block's three states; the strip shows on panels, hides on Setup and on the
  Flight data panel, opens the panel when pressed, and disappears when turned off; the shell's
  demand includes `flight-data` only while the strip is visible; the touch and error-text guards
  cover the new panel automatically through the registry.
- **Integration (mock X-Plane):** every field tracks the server; the GPS DataRefs removed →
  "No destination available on this aircraft" while the rest works; a base64 `gps_nav_id` decodes.
- **Device (user):** new smoke rows — values agree with X-Plane's own readouts, fuel matches the
  weight and balance page after conversion, wind direction is "from", GPS destination on the
  default 172 with a direct-to, paused and replay badges, the strip on a phone in both orientations.

## Requirement coverage

| Req | Where |
|---|---|
| R1 current values at the stream rate | profile features + F-04 demand; telemetry |
| R2 units labelled, persisted, shared; sim times labelled | `units.ts`, `unit-preferences.ts`, `format.ts` |
| R3 paused and replay distinct from stale | `simulatorBadge`; paused is live in `panelLinkStatus` |
| R4 age and stale mark | link-level freshness (decision 2) |
| R5 disconnected keeps last values, never zeroed or extrapolated | F-04 telemetry retention; muted "not live" |
| R6 no flight → says so, no values | state table |
| R7 missing name costs only its field | every binding optional; per-field "not available" |
| R8 destination only when populated | destination decision |
| R9, R10 no raw errors, no tokens | read-only; no failure path; F-04 guards |
| R11 writes nothing | no `write`/`activate` call in either view |

## Decisions and rationale

1. **A panel and a docked strip, from one source.** The feature asks for a strip "beside any other
   panel" and a phone-as-second-screen use; one view cannot be both. Both read the same telemetry
   through the same formatters, so they cannot disagree.
2. **Freshness at the link, not per value.** Delta-only streaming makes per-value `receivedAt` a
   change time, not a freshness time (see above).
3. **Mass units only for fuel.** Volume needs a density the API does not give; a guessed density
   would be a number that looks precise and is not.
4. **Every new binding optional.** Several names are community-sourced; an optional miss degrades
   one field, a required one would blank the whole strip.
5. **Replay beats paused in the badge.**
6. **Speeds in knots only.** Every airspeed instrument and ATC use knots; the feature scopes unit
   choice to fuel, temperature and distance.
7. **The strip is on by default, off on Setup and on the Flight data panel itself.**
8. **Retired ids migrate.** A pilot's last panel is not lost because a placeholder was replaced.

## Deliberately not done

- Next-waypoint distance and ETA (F-31), and any navdata expansion of the identifier.
- A configurable strip (choosing which four values): F-06 custom controls.
- Litres and gallons.
- Per-value timestamps on screen.

## Open questions

None blocking. The feature file's five are answered by decisions 1–3 and the Destination section;
the wind "from" convention and the unverified names are confirmed by the device checks, and each
name's failure mode is a single "not available on this aircraft" field.
