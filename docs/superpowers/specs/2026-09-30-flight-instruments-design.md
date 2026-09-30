# Primary flight instruments — design

Feature: `F-10` (roadmap Stage 1, sub-project 5). Spec date: 2026-09-30.
Source: [docs/roadmap/features/F-10-primary-flight-instruments.md](../../roadmap/features/F-10-primary-flight-instruments.md).
Builds on: F-02 (connection health), F-03 (aircraft compatibility, profiles), F-04 (panel
framework), F-11 (flight data strip, units module, [spec](2026-09-28-flight-data-strip-design.md)).

## Goal

An **Instruments** panel that shows the six primary flight instruments — airspeed, attitude,
altitude, vertical speed, heading, turn and slip — drawn on the device from the simulator's values,
in two presentations of the same values:

- a **PFD**: attitude in the middle, speed tape left, altitude tape and vertical speed right,
  heading tape and turn-rate scale below, slip indicator under the roll pointer;
- a **six-pack**: six round gauges in the classic T (airspeed, attitude, altimeter / turn
  coordinator, heading indicator, vertical speed).

The pilot switches between them in one tap; the choice is remembered per aircraft type. The only
thing the panel writes is the altimeter setting (R4, R12): −/+ steps, a typed value, and STD.

## Why this now

- It is the most common feature in the category (7 of 12 panel products) and the first thing a
  cockpit companion is expected to do (roadmap F-10, `research/competitors.md`).
- Competitors each miss something customers name: Simionic's altimeter is **inches only** and that
  complaint persists in a 3.5-star rating; Air Manager's streamed-image gauges lagged 30 s after an
  X-Plane update while its DataRef-driven gauges did not; an Air Manager reviewer wanted "bigger
  versions of the instruments that I can easily see"; XpRemotePanel is praised for solving "the core
  problems really well" and criticised only for rigid layouts and accidental swipes.
- Avionix answers each: hPa and inHg both, drawn natively from DataRefs (never streamed images),
  instruments sized to the screen with a digital value on every gauge, and a one-tap presentation
  toggle with no swipe navigation.
- It proves the panel framework against the fastest-changing values the simulator sends.

## Scope

**In.** A `flight-instruments` profile feature (all bindings optional) and an `altimeter-setting`
feature (one required write binding) in the generic profile, profile version 1.2.0. The Instruments
panel with both presentations, drawn with `react-native-svg`. The per-aircraft presentation memory
with an engine-type default. Speed arcs and tape bands from the aircraft's V-speeds when X-Plane
publishes plausible ones. Mach and radio altitude where they resolve. Altimeter setting in inHg or
hPa — a new `pressure` unit in F-11's shared units module. Stale, missing, no-flight and
disconnected states. Mock server, tests, docs and device checks.

**Out.** Course deviation and bearing pointers (F-30), flight director and autopilot bugs (F-20),
ground speed, TAS, wind and temperature (F-11), engines (F-12), aircraft-specific PFDs (F-52),
synthetic vision, terrain, traffic, failures. Altitude in metres. Smoothing, interpolating or
extrapolating any value (see Decisions). Copilot-side instruments.

## Profile features

The generic profile goes to **1.2.0** and gains two features. Every indicator is optional, so a
missing name costs its own instrument and never the other five (R9).

| Feature | Label | Bindings |
|---|---|---|
| `flight-instruments` | Flight instruments | all `required: false`, read-only: `sim/cockpit2/gauges/indicators/airspeed_kts_pilot`, `…/mach_pilot`, `…/altitude_ft_pilot`, `…/vvi_fpm_pilot`, `…/heading_AHARS_deg_mag_pilot`, `…/pitch_AHARS_deg_pilot`, `…/roll_AHARS_deg_pilot`, `…/turn_rate_roll_deg_pilot`, `…/slip_deg`, `…/radio_altimeter_height_ft_pilot`, `sim/aircraft/prop/acf_en_type`, `sim/aircraft/view/acf_Vso`, `…/acf_Vs`, `…/acf_Vfe`, `…/acf_Vno`, `…/acf_Vne` |
| `altimeter-setting` | Altimeter setting | `sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot`, `required: true`, `write: true` |

All names were checked against Laminar's `DataRefs.txt` (the copy Laminar publishes in the
XPlane2Blender repository). Units: airspeed and V-speeds knots (V-speeds "kias"), altitude feet,
VVI ft/min, heading degrees magnetic, pitch degrees up, roll degrees right, turn rate "degrees
deflection" of a roll-augmented turn indicator, slip "degrees of ball deflection from centred",
barometer inches Hg, engine type `int[16]` enum (0 recip carb, 1 recip injected, 3 electric,
5 single-spool jet, 6 rocket, 7 multi-spool jet, 9 free turboprop, 10 fixed turboprop).

Airspeed is already `flight-telemetry`'s required binding; `profileBindings` dedups names, so it is
probed once. `acf_Vs` and `acf_Mmo` have no unit line in the file; `acf_Mmo` is not used.

**Standard pressure.** The roadmap named `…/barometer_setting_is_std_pilot`; it is **not** in the
file and no Laminar source confirms it. STD therefore writes 29.92 to the verified barometer
DataRef, which is what `sim/instruments/barometer_2992` does. There is no separate "STD mode"
flag: the display says STD when the read-back setting is 29.92 (within ±0.005 inHg).

## Values and states

A hook `useInstrumentReading(name)` returns
`{ value: number | null, missing: boolean, current: boolean }`:

- `missing` — the binding's probe status is `missing` (F-03).
- `value` — the telemetry number; `null` before the first value, when the sample is not a finite
  number, or when the link reports `noFlight` (R8: with no flight loaded the page shows no values).
- `current` — `link.valuesCurrent`: freshness follows the link, exactly as F-11 ruled. Streaming is
  changed-values-only, so a value that holds still is not re-sent and has no age of its own; one
  age per panel (the panel notice: "Reconnecting. Showing values from 12 s ago.") is the honest
  form of R6's per-value age.

The attitude indicator needs pitch **and** roll; if either is missing, attitude is unavailable. The
turn instrument needs turn rate and slip; if one is missing the other still shows. Engine type is
read as an array (index 0); V-speeds as numbers.

Each instrument renders exactly one of these states, in this precedence:

| State | Condition | Rendering |
|---|---|---|
| Unavailable | a DataRef it needs is `missing` | empty face, "Not available on this aircraft" |
| No value | `value === null` | empty face (no pointer, no tape numbers), digital "—" |
| Live | `current` | pointer and digits in normal colours |
| Not live | `!current` | last pointer and digits kept (never zeroed, never animated), drawn in muted colours, a red X across the whole face, and a "NOT LIVE" flag |

"Not live" is the real-avionics red-X failure flag: a frozen attitude indicator cannot be mistaken
for a working one (R6, R7). The panel notice from `PanelFrame` gives the reason and the age.
Paused counts as live (F-04 rule); the strip docked above the panel shows PAUSED/REPLAY (F-11).

## Presentation choice (R3)

`Presentation = 'pfd' | 'sixPack'`. Stored under **`avionix.instruments`** as
`{ last: Presentation, byAircraft: Record<string, Presentation> }`, zod-parsed with a per-field
`.catch` (as `avionix.units`).

- **Aircraft key**: `identity.icaoType`, else `identity.description`, else none. An aircraft
  with no key uses `last`.
- **Choosing** writes both `byAircraft[key]` (when there is a key) and `last`.
- **Showing**: `byAircraft[key]` if present; otherwise the **engine-type default** when engine type
  has a value: jets (5, 7) and rockets (6) → PFD; piston (0, 1), electric (3) and turboprop (9, 10)
  → six-pack; any other code → `last`. With no engine type yet → `last`.
- `last` defaults to `pfd` on first launch: its digits read best on a phone.

The default is re-evaluated when the aircraft or its engine type changes; a stored per-aircraft
choice always wins. The toggle is a `RadioChips` row ("PFD", "Six-pack") at the top of the panel.

## Drawing

`react-native-svg` (added with `npx expo install react-native-svg`, the version Expo SDK 57 pins).
It renders on iOS, Android and the web from the same code; every instrument is vector-drawn in a
fixed `viewBox` and scaled, so there are no images, bitmaps or streamed frames anywhere (R2).

All geometry lives in pure, tested domain functions in `src/domain/instruments/`; components only
place what those functions return.

- **Airspeed dial** (six-pack): 0 to `airspeedDialMax(vne)` over 320° of arc; max is the next
  multiple of 20 at or above `vne × 1.1` when V-speeds are valid, else 200. A value above max pegs
  at the stop; the digital window shows the true number. Arcs: white Vso–Vfe, green Vs–Vno, yellow
  Vno–Vne, red radial at Vne.
- **Speed markings** are used only when all five are finite and `0 < Vso ≤ Vs < Vno < Vne` and
  `Vso < Vfe ≤ Vne`; otherwise there are no arcs and no bands (an aircraft author who left them at 0
  gets no false arcs).
- **Attitude**: sky/ground/horizon and a pitch ladder (lines every 5°, labelled every 10°, visible
  window ±20° on the six-pack and ±25° on the PFD) translated by pitch and rotated by −roll about the
  centre; a fixed aircraft symbol; a bank scale with marks at 10, 20, 30, 45 and 60° and a roll
  pointer. Pitch is drawn to ±90°; roll is unrestricted.
- **Altimeter dial**: 100-ft hand (1,000 ft per turn) and 1,000-ft hand (10,000 ft per turn), a
  digital altitude window, and the Kollsman window showing the setting in the chosen unit.
- **VSI dial**: ±2,000 ft/min over ±170°; beyond pegs, digital shows the true value.
- **Heading indicator**: compass card rotated by −heading, lubber line, digital heading.
- **Turn coordinator**: aircraft symbol rotated by the turn-rate deflection clamped to ±45°,
  standard-rate index marks at `STANDARD_RATE_DEFLECTION_DEG` (20°); an inclinometer ball offset by
  `slip_deg` (clamped to ±10°, full tube at ±10°, positive = ball right).
- **PFD tapes**: speed tape (window ±40 kt, ticks every 10 labelled every 20, V-speed colour bands on
  its edge), altitude tape (window ±400 ft, ticks every 100 labelled every 200), VSI scale beside it
  (±2,000 ft/min), and a heading tape (window ±30°, ticks every 5 labelled every 10 with N/E/S/W).
  Each tape has a boxed current-value readout. Below the speed tape: Mach when resolved and ≥ 0.40.
  Below the altitude tape: the altimeter setting. At the bottom of the attitude: radio altitude when
  resolved and 0 ≤ RA ≤ 2,500 ft. Under the heading tape: the turn-rate scale with the same
  standard-rate marks as the turn coordinator. The slip indicator is a trapezoid under the roll
  pointer, offset by `slip_deg`.
- **Six-pack extras**: Mach (≥ 0.40) under the airspeed digits; radio altitude (≤ 2,500 ft) under
  the altimeter digits. Both presentations therefore show the same values (R3).

The turn-rate deflection for a standard-rate turn and the sign of `slip_deg` are not documented;
20° and "positive = right" are assumptions, both named constants, both checked on the device
(smoke rows). If X-Plane disagrees, one constant changes.

**No smoothing.** Each received value is drawn as received, at the Web API's rate (up to ~10 Hz);
Avionix never interpolates between samples or extrapolates beyond the last one, so a needle can
never keep moving on a dead link (R2, R7).

**Performance.** Each instrument is a `React.memo` component whose props are primitives (numbers,
booleans), so a snapshot that changes only the altitude re-renders only the altimeter or altitude
tape. No per-frame timers or animations.

## Sizing and layout

The panel uses `PanelFrame` (title "Instruments") and supports every device class in both
orientations. The instrument block is sized from the frame's measured width and the window height:

- **PFD**: `viewBox` 360 × 300; width = min(content width, window height × 0.7 × 360/300).
- **Six-pack**: portrait 2 columns × 3 rows, landscape 3 × 2 (the classic layout). Gauge size =
  min(content width / columns, window height × 0.7 / rows) − gap; `viewBox` 200 × 200 per gauge.
- The altimeter controls follow the instruments; on a phone they are one short scroll below.
- Smallest text in any instrument is 14 units in its `viewBox`; at a 320 dp phone width the PFD
  therefore keeps text at 12.4 dp or more and each digital window at 16 units or more.

## Altimeter setting (R4, R5)

`pressure: 'inHg' | 'hPa'` joins F-11's `UnitPreferences` (default `inHg`), stored in the existing
`avionix.units` with the same per-field `.catch`, so saved preferences without it keep their other
fields. The Units section in Setup gains "Pressure: inHg | hPa".

Domain (`src/domain/instruments/baro.ts`): `HPA_PER_INHG = 33.8639`; `STD_INHG = 29.92`;
`isStandard(inHg)` within ±0.005; `formatBaro(inHg, unit)` → `29.92 inHg` / `1013 hPa` (+ ` STD`
when standard); step 0.01 inHg or 1 hPa; valid range 28.00–31.50 inHg ⇔ 948–1067 hPa; `toInHg`.

`BaroControls` below the instruments:

- the reading, from telemetry (the read-back value, never the typed one);
- "−" and "+" (`ControlButton`s) writing `current ± step` converted to inHg, where `current` is the
  read-back setting; a step in hPa rounds the current value to whole hPa first so repeated presses
  land on whole hectopascals;
- "STD" writing 29.92;
- a `ValueEntry` in the chosen unit with the range above.

All go through `usePanel().write('altimeter-setting', BARO, value)`. `ControlButton` already
disables while an operation on that target is pending, disables on a not-live link, and prints the
availability reason: a baro DataRef that resolves read-only makes the feature `unavailable`
("Altimeter setting is not available on this aircraft: Altimeter setting, written when you set it.")
and every baro control is disabled with that sentence (R5); the instruments are unaffected. The
reading is shown whenever it resolves.

## The panel

`src/features/panels/instruments/InstrumentsPanel.tsx`:

```ts
export const INSTRUMENTS_PANEL: PanelDescriptor = {
  id: 'instruments',
  title: 'Instruments',
  features: [FEATURE_FLIGHT_INSTRUMENTS, FEATURE_ALTIMETER_SETTING],
  supports: EVERYWHERE,
};
```

It is **first** in `PANELS` (instruments, flight-data, heading), so a new install opens on it; an
existing install keeps its stored `last`, and the new panel id starts visible (F-04 rule).

Accessibility: each instrument is one accessible element whose label carries its value in words —
"Airspeed 112 knots", "Attitude: pitch 3 degrees up, bank 15 degrees right", "Altitude 4,520
feet, altimeter 29.92 inches", "Vertical speed climbing 500 feet per minute", "Heading 270
degrees", "Turn: rate 1.2 standard rate right, ball 2 degrees right" (turn given as a fraction of
standard rate, one decimal) — plus ", not live" when stale, or "<name>: not available on this
aircraft", or "<name>: no value". Labels are identical in both presentations (the same builder), so
a screen-reader user loses nothing by switching.

## File plan

| Path | Responsibility |
|---|---|
| `src/domain/instruments/geometry.ts` | dial angles, hands, tape windows and ticks, attitude transform, turn and slip offsets |
| `src/domain/instruments/speed-markings.ts` | V-speed validation → arcs/bands or null |
| `src/domain/instruments/baro.ts` | pressure conversion, format, STD, range, step |
| `src/domain/instruments/presentation.ts` | `Presentation`, aircraft key, engine-type default, resolution |
| `src/domain/instruments/labels.ts` | accessible labels for each instrument |
| `src/application/instrument-preferences.ts` | load/save `avionix.instruments` |
| `src/domain/units/units.ts` (+ `unit-preferences.ts`, `UnitsSection.tsx`) | `pressure` unit |
| `src/domain/aircraft/profiles/generic.ts` | 1.2.0, two features, names |
| `src/features/panels/instruments/` | `InstrumentsPanel`, `useInstrumentReading`, `usePresentation`, `InstrumentFace` (states, red X, accessibility wrapper), `pfd/*`, `six-pack/*`, `BaroControls` |
| `src/theme/tokens.ts` | `instrument` colour group per theme (sky, ground, marking, pointer, face, arcs, flag) |
| `src/features/panels/registry.ts` | register first |
| `tests/mock-xplane/mock-xplane-server.ts` | the 17 new names (ids from 1023), baro writable |

## Theme

Each theme gains `colors.instrument`: `sky`, `ground`, `horizon`, `marking`, `pointer`, `face`,
`arcWhite`, `arcGreen`, `arcYellow`, `arcRed`, `flag`, `muted`. Light and dark use conventional
avionics colours (blue sky, brown ground, white markings, black faces — instruments are dark in
every theme, as in a real panel). Night keeps every one at relative luminance ≤ 0.30 like the rest
of the night palette (the existing token test is extended to the new group), and `flag` stays
distinguishable from `arcRed`'s neighbours.

## Testing

- **Domain unit tests**: every geometry function at range ends, beyond them, and at negative
  values; heading wrap (359→0); tape tick generation around 0 and negatives; speed-marking validation
  (zeros, inverted order, NaN); baro conversions, rounding to whole hPa, STD tolerance, range ends;
  presentation resolution (stored beats default, each engine code, no key, unknown code); labels.
- **Application**: `avionix.instruments` load/save with corrupt JSON, a bad field, missing fields;
  `pressure` added to units with old stored values.
- **UI** (`@testing-library/react-native`): both presentations render every instrument's label from
  a snapshot; the toggle switches and persists per aircraft; unavailable instrument says so while
  the others show values; not-live shows the red X flag and keeps values; no flight shows no values;
  baro −/+/STD/typed write the right inHg values (hPa and inHg), read-only baro disables with the
  sentence; memoisation: an unrelated telemetry change does not re-render an instrument (render
  counter).
- **Error-text guard and touch-target guard** extended to the panel.
- **Integration** (mock server): values flow to both presentations; baro write changes the read-back
  shown; a read-only baro disables only the controls; removing one DataRef marks one instrument.
- **Web**: the web app-shell test renders the panel (react-native-svg on react-native-web).

## Requirement coverage

| Req | Where |
|---|---|
| R1 | `useInstrumentReading`, each instrument |
| R2 | subscription only; `react-native-svg`; no smoothing |
| R3 | `presentation.ts`, `instrument-preferences.ts`, toggle, shared labels |
| R4 | `BaroControls`, read-back reading, STD = 29.92 |
| R5 | `altimeter-setting` required write binding → `ControlButton` reason |
| R6 | link freshness, red X + NOT LIVE, panel notice age |
| R7 | not-live state keeps last values, no animation |
| R8 | `noFlight` → no values; the panel notice says so |
| R9 | optional bindings, per-instrument unavailable |
| R10 | only fixed copy; `FailureNotice` for write failures; error-text guard |
| R11 | nothing new touches tokens; no logging added |
| R12 | the only write is the baro; no commands |

## Decisions and rationale

1. **react-native-svg, not Views.** Arcs, tick rings and clipped attitude spheres need vector
   paths; the research recommends native SVG/canvas drawing; it is Expo-supported and renders on the
   web. Cost: a native module, so the development build must be rebuilt before device checks.
2. **No smoothing.** A needle that moves between samples can move after the link died; honesty beats
   polish, and 10 Hz is what competitors ship. Revisit only with a design that stops the instant a
   sample is late.
3. **Freshness = the link**, as F-11, because per-value age is not observable with change-only
   streaming.
4. **Red X for stale**, the failure flag pilots already know.
5. **STD writes 29.92** to the verified DataRef; the unverified `…is_std_pilot` is not used.
6. **Presentation per ICAO type with an engine-type default**: jets PFD, pistons and turboprops
   six-pack (the default King Air and Baron have steam gauges). The pilot's choice always wins.
7. **Digital value on every six-pack gauge**: legibility is the top customer ask, and it is what a
   screen reader reads anyway.
8. **Instruments first in the switcher**: it is the page pilots expect first; existing installs keep
   their `last`.
9. **`pressure` in the shared units module**, so F-13/F-14 and any later baro display agree.
10. **The same values in both presentations**, including Mach, radio altitude, turn and slip (R3).

## Deliberately not done

Altitude or speed bugs and selected-altitude (F-20); metric altitude; a copilot side; a trend
vector on the speed tape (it would be extrapolation); an STD mode flag; a manual default override
beyond the toggle.

## Open questions (device checks)

- The turn-rate deflection of a standard-rate turn (assumed 20°) and the sign of `slip_deg`
  (assumed positive = ball right).
- Whether `barometer_setting_in_hg_pilot` accepts writes on the default fleet without an override
  (Laminar marks it writable; the smoke test confirms read-back).
- Whether `acf_V*` are populated with plausible values on the default C172, Baron and 737; if not,
  those aircraft simply show no arcs.
