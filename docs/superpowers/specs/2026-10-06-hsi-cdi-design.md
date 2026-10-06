# F-30: HSI, CDI and navigation indicators

| Field | Value |
|---|---|
| Roadmap | `docs/roadmap/features/F-30-hsi-cdi-indicators.md` (Stage 2, first sub-project) |
| Status | Design under the session's standing autonomy (no approval gate) |
| Depends on | F-10 instruments, F-21 radios, F-20 autopilot, R-01 cockpit design language |

## Why first in Stage 2

Stage 2 order:

1. F-30 HSI/CDI
2. F-32 FMS CDU
3. F-24 systems controls
4. F-12 engine monitoring
5. F-23 audio panel
6. F-05 demo mode

F-30 goes first for three reasons:

- **It makes Stage 1 usable for real.** F-21 tunes the NAV radios and F-20 arms NAV and APR. Without a deviation display, a pilot still has to lean into the simulator to fly the radial or the ILS.
- **It is what competitors charge for.** XpRemotePanel sells exactly "NAV stack, CDI, HSI" as its paid Navigation Pack. Simionic's G1000 is marked down for navigation gaps, not looks (`ux-competitors.md`, F-30 evidence).
- **It is the core of instrument training.** Course, deviation, TO/FROM, glideslope and marker beacons are what a CFI teaches on an approach. The R-01 research is clear that pilots judge an app by whether these behave like the real box (`ux-avionics-conventions.md` §5).

F-32 follows because it is the most requested remote panel. Demo mode goes last so that it can demonstrate every panel.

## Verified names

Every name below is checked against Laminar's `DataRefs.txt` and `Commands.txt` for X-Plane 12. These replace the roadmap file's "unverified" rows.

| Purpose | Name | Type | Writable |
|---|---|---|---|
| HSI source | `sim/cockpit2/radios/actuators/HSI_source_select_pilot` | int enum: 0 NAV1, 1 NAV2, 2 GPS1, 3 GPS2 | yes |
| HSI course (OBS of the selected source) | `sim/cockpit2/radios/actuators/hsi_obs_deg_mag_pilot` | float, °M | yes |
| Lateral deviation | `sim/cockpit2/radios/indicators/hsi_hdef_dots_pilot` | float, dots | no |
| Vertical deviation | `sim/cockpit2/radios/indicators/hsi_vdef_dots_pilot` | float, dots | no |
| TO/FROM | `sim/cockpit2/radios/indicators/hsi_flag_from_to_pilot` | int: 0 flag, 1 to, 2 from | no |
| Horizontal signal | `sim/cockpit2/radios/indicators/hsi_display_horizontal_pilot` | int boolean | no |
| Vertical signal | `sim/cockpit2/radios/indicators/hsi_display_vertical_pilot` | int boolean | no |
| Glideslope flag (EFIS) | `sim/cockpit2/radios/indicators/hsi_flag_glideslope_pilot` | int boolean: shows when a GS is expected but not received | no |
| DME present | `sim/cockpit2/radios/indicators/hsi_has_dme_pilot` | int boolean | no |
| DME distance, speed, time | `sim/cockpit2/radios/indicators/hsi_dme_distance_nm_pilot`, `hsi_dme_speed_kts_pilot`, `hsi_dme_time_min_pilot` | float: nm, kt, min | no |
| Bearing to NAV1 / NAV2 | `sim/cockpit2/radios/indicators/nav1_bearing_deg_mag`, `nav2_bearing_deg_mag` | float, °M | no |
| NAV1 / NAV2 signal | `sim/cockpit2/radios/indicators/nav1_display_horizontal`, `nav2_display_horizontal` | int boolean | no |
| Marker lights | `sim/cockpit2/radios/indicators/outer_marker_lit`, `middle_marker_lit`, `inner_marker_lit` | int boolean (flashes as X-Plane flashes it) | no |
| Course direct-to (centre the CDI) | `sim/radios/obs_HSI_direct` | command | — |
| NAV1 / NAV2 identifier (already in profile) | `sim/cockpit2/radios/indicators/nav1_nav_id`, `nav2_nav_id` | string | no |

The navaid identifier shown is the identifier of the active source: NAV1 or NAV2 from the existing profile names, and nothing for GPS.

**Unsettled.** `DataRefs.txt` does not say that `hsi_obs_deg_mag_pilot` follows the source. Every other `hsi_*` name reads "the pilot's HSI-selected navaid", and the `sim/radios/obs_HSI_up` / `down` / `direct` commands treat the HSI OBS as one control. So Avionix reads and writes the HSI course through `hsi_obs_deg_mag_pilot`. Device rows confirm that it follows the source and that writing it moves the CDI. If it does not, the fallback is to write `nav1_obs_deg_mag_pilot` or `nav2_obs_deg_mag_pilot` by source; that is a one-function change in the course spec.

## Scope

**In scope:**

- A new **Navigation** panel: a Garmin-style HSI, plus a NAV control unit with source keys, course window, steppers, keypad and CTR.
- A **CDI and glideslope on the PFD**: deviation scales on the attitude display, plus a marker beacon annunciation.
- A profile bump to **1.5.0** with five features, the mock server, docs and smoke rows.

**Out of scope, with reasons:**

- ADF bearing pointers. Avionix has no ADF tuning, and X-Plane publishes no ADF signal flag; R7 forbids a pointer without a validity source.
- Copilot side. Pilot side only, as in F-20.
- GPS2 as a selectable source. It is shown read-only if X-Plane reports it.
- Map and route drawing (F-13, F-31).
- Aircraft-specific HSIs (F-50..F-57).
- A knob or drag gesture (R-01 research).

## Design

### 1. Domain: `src/domain/navigation/`

`hsi.ts` holds pure functions with unit tests:

**Deviation display**

- `DEV_SCALE_DOTS = 2`: the scale draws two dots each side, as Garmin CDIs do.
- `DEV_PEG_DOTS = 2.5`: the needle stops at 2.5 dots.
- `deviationDots(raw: number | null): { dots: number; pegged: boolean } | null` clamps to ±2.5. `null` stays `null`.

**Validity**

- `lateralValid(fromTo, horizontal)` is true only when TO/FROM is 1 or 2 and the horizontal signal is 1 (R3).
- `glideslopeState(vertical, gsFlag)` returns one of three states (R4):
  - `'valid'` when the vertical signal is 1 and the flag is 0;
  - `'flagged'` when the flag is 1, meaning a GS is expected but not received;
  - `'none'` otherwise, meaning no GS is expected, as on a VOR.

**Words and sources**

- `toFromWord(value)` returns `'TO'`, `'FROM'` or `null` (flag).
- `NAV_SOURCES` lists the three sources:
  - `{ value: 0, label: 'NAV1', kind: 'nav' }`
  - `{ value: 1, label: 'NAV2', kind: 'nav' }`
  - `{ value: 2, label: 'GPS', kind: 'gps' }`
- `sourceLabel(value)` returns `'GPS2'` for 3 and `null` for an unknown value.

**Bearing pointers**

- `bearingPointer(bearing, signal)` gives the angle only when the signal is 1 and the bearing is finite (R7).
- A pointer without a signal is hidden, never drawn at 0°.

**Distance and markers**

- `dmeText(hasDme, distanceNm, unit)` returns `null` unless `hasDme` is 1 (R8). It uses the existing distance-unit conversion and one decimal, like F-21's `dmeText`; that helper moves here and F-21 imports it.
- `dmeTimeText(minutes)` returns `'12 MIN'` and is shown only with the distance.
- `markerLit(outer, middle, inner)` returns `'outer' | 'middle' | 'inner' | null`.

**Course entry**

Course entry and steps reuse the autopilot's `heading` selector kind unchanged:

- `formatSelector('heading', …)` gives `270°` and shows north as `360°`;
- `stepSelector` steps ±1 and ±10 with the wrap;
- `parseSelectorEntry` accepts 0–360, where 360 sends 0;
- `selectorMatches('heading', …)` handles the wrap tolerance.

No new format or step code is needed.

### 2. Colours: Garmin's source convention

`theme.instrument` gains two tokens, and both must pass the R-01 guards (night luminance ≤ 0.30, and 4.5:1 on `instrument.face`):

| Token | Day | Night |
|---|---|---|
| `navNeedle` (NAV source, green) | `#36d35a` | `#4f9a3a` |
| `gpsNeedle` (GPS source, magenta) | `#e040c0` | `#9a3a86` |

The course pointer, the CDI bar and the source annunciation are drawn green for NAV1 and NAV2, and magenta for GPS, as on a G1000. The source is also spelled out in text, so colour is never the only cue (U2).

Other elements reuse existing tokens:

- bearing pointers: `instrument.selected` (cyan);
- heading bug: `instrument.selected`, already set by R-01;
- marker beacons: the conventional colours, outer `selected` (blue/cyan), middle `avionics.caution` (amber), inner `avionics.legend` (white), each with its letter **O**, **M** or **I**.

### 3. The HSI instrument

`src/features/panels/navigation/Hsi.tsx` is an `InstrumentFace` with a viewBox of 240 × 240, so it gets the existing not-live fade and red X.

**Card and heading**

- A rotating compass card turns by `heading` (the same AHARS heading the PFD uses).
- Ticks every 5°, labels every 30° (N, 3, 6, E, …), as on the existing directional gyro.
- A fixed lubber line and an aircraft symbol sit in the centre.
- The heading bug (from the AP heading dial) shows when the binding resolves.

**Course and deviation**

- A course pointer arrow is drawn at the course, in the source colour.
- The CDI bar moves across a two-dot scale (dots at ±1 and ±2) by `deviationDots`.
- When `lateralValid` is false, the CDI bar is hidden and a red **NAV** flag (text on `instrument.flag`) shows on the scale (R3). The needle is never drawn centred.
- The TO/FROM triangle sits on the course line, pointing to or from; it is hidden when flagged.

**Glideslope**

A vertical scale sits on the right edge, with dots at ±1 and ±2:

- `valid`: a diamond (the GS pointer) at `deviationDots(vdef)`. The scale is drawn in the source colour; on an ILS the source is always NAV.
- `flagged`: the scale shows a red **GS** flag and no diamond.
- `none`: no scale at all.

**Bearing pointers**

- BRG1 (NAV1) is a single-line cyan arrow; BRG2 (NAV2) is a double-line cyan arrow, as the G1000 tells them apart.
- Each shows only when `bearingPointer` returns an angle.

**Corner text**, set in `numeric()` and avionics fonts:

- top left: the source label in the source colour (`NAV1`, `NAV2`, `GPS`), with the navaid identifier under it;
- top right: `CRS 270°` in the source colour;
- bottom left: the DME distance (`12.4 NM`), with the time under it;
- bottom right: `TO` or `FROM` in words.

**Marker beacon**

A small box at the top centre shows **O**, **M** or **I**, filled in the marker colour while lit and hidden otherwise.

**Accessibility**

- The accessible label is one sentence, for example: "HSI, NAV1, IKSO, course 270, 1.2 dots right, TO, glideslope 0.5 dots down, DME 12.4 nautical miles".
- Invalid parts read "no NAV signal" and "glideslope flagged".
- Deviation words describe where the needle sits: "1.2 dots right", "glideslope 0.5 dots up". X-Plane's deflection value is drawn as given (positive = needle right or diamond up), never inverted by Avionix; a device row confirms the sense. The dots value is spoken, so the unit is unambiguous (R2).

**Geometry**

Geometry helpers are pure, tested functions in `src/domain/navigation/hsi-geometry.ts`:

- `deviationOffset(dots, pxPerDot)`;
- `courseRotation(course, heading)`, which is `course − heading` wrapped to ±180;
- `bearingRotation(bearing, heading)`.

### 4. NAV control unit

An `AvionicsUnit` labelled **NAV** sits under the HSI.

**Source keys**

- The keys are **NAV1**, **NAV2** and **GPS**. Each writes `HSI_source_select_pilot` with read-back.
- Each key has a light bar: engaged when it is the selected source, off otherwise.
- A source of 3 (GPS2) shows as a caption `SRC GPS2` with no key lit.
- If the binding is read-only or missing, the keys are disabled and the reason is shown (R6).

**Course window**

- A `DisplayWindow` with role `selected`, caption `CRS` and the value from `hsi_obs_deg_mag_pilot`.
- It is pressable, and opens the keypad with digits 0–9 and Set, Cancel and Clear.
- It reuses `parseSelectorEntry('heading')` and the existing `SelectorPad` layout, through a small `useCourseEntry` hook modelled on `useSelectorEntry`.
- Out-of-range values are refused with the existing sentence.

**Steppers**

- Four keys, −10, −1, +1 and +10, with one write each.
- The base is `readBack.pendingExpected` or the current value, so quick taps add up, exactly as the autopilot heading does.

**CTR**

- A **CTR** key activates `sim/radios/obs_HSI_direct`, which sets the course to the bearing to the station. This matches the G1000's "push CRS to centre".
- It carries no read-back: if the course is already centred, nothing changes, which is not a failure. Its `OperationNotice` reports a refused command.
- It is disabled while the lateral signal is invalid, since there is no station to centre on.

**Read-back**

Read-back sentences:

- `X-Plane did not take course 270°. The course still shows 265°.`
- `X-Plane did not switch the HSI to GPS.`

### 5. Navigation panel

- **Descriptor:**
  - `id: 'navigation'`, `title: 'Navigation'`;
  - `supports: EVERYWHERE`;
  - `features`: the five new features, plus `FEATURE_FLIGHT_INSTRUMENTS` for the heading and `FEATURE_HEADING_CONTROL` for the heading bug.
- **Switcher position:** fourth, after Autopilot and before Flight data. It gets a new `PanelIcon` id, `navigation`: a compass rose with a course arrow.
- **Phone layout:** the HSI goes full width, capped by height the same way `pfdWidth` caps the PFD (0.6 of the window height in portrait), with the NAV unit below it.
- **Wide layout (≥ 720 dp):** the HSI on the left and the NAV unit on the right.
- **No flight:** every indicator shows its no-value state, as F-10's do.

### 6. PFD additions (`src/features/panels/instruments/pfd/`)

**Lateral deviation scale**, under the centre of the attitude display:

- two dots each side, with a diamond in the source colour;
- shown only while `lateralValid`;
- hidden otherwise, with no flag, so the PFD stays uncluttered when no navaid is tuned.

**Glideslope scale**, at the right edge of the attitude display:

- two dots each side, with a diamond;
- shown only when `glideslopeState` is `valid`;
- when it is `flagged`, a small red **GS** flag shows instead.

**Marker box**, at the top right of the attitude display:

- **O**, **M** or **I** in the marker colour while lit.

**Data and accessibility**

- These read the same `hsi_*` names, through the new features added to `INSTRUMENTS_PANEL.features`. A missing feature drops only its cue.
- The PFD's accessible attitude label adds ", localizer 1.2 dots right, glideslope 0.5 dots down", but only while each is shown.

### 7. Profile 1.5.0 (`generic.ts`)

The five new features are:

| Feature id | Bindings | Required |
|---|---|---|
| `nav-deviation` | hsi_hdef, hsi_flag_from_to, hsi_display_horizontal | all required |
| `nav-glideslope` | hsi_vdef, hsi_display_vertical, hsi_flag_glideslope | all required |
| `nav-source` | HSI_source_select_pilot | required |
| `nav-course` | hsi_obs_deg_mag_pilot (required); `sim/radios/obs_HSI_direct` (optional; CTR is disabled without it) | |
| `nav-aids` | nav1/nav2 bearing and display_horizontal; hsi_has_dme, the DME distance, speed and time; the three marker lights | none required; each missing name drops only its cue |

The diagnostics probe is unchanged.

### 8. Mock X-Plane

- Add every new DataRef with plausible values: NAV1 source, course 270, hdef 0.8, TO, horizontal 1, no glideslope, DME 12.4 nm.
- The source write takes values 0–3.
- The course write wraps.
- `obs_HSI_direct` sets the course to `nav1_bearing_deg_mag`, rounded.

## Requirements

- **U1.** Every displayed state comes from X-Plane. No needle, flag or source key reflects a press.
- **U2.** Colour is never the only cue:
  - the source is in words;
  - flags are words on red;
  - markers carry letters;
  - BRG1 and BRG2 differ by line shape.
- **U3.** Targets are 48 dp or larger. The touch-target guard covers the Navigation panel, with the keypad open too.
- **U4.** Night luminance is 0.30 or less, and the new tokens reach 4.5:1 on the instrument face.
- **U5.** Hidden or invalid is never drawn as centred or 0° (R3, R4, R7).
- **U6.** Not live means the face fades and keys are disabled. Nothing is queued on reconnect (R10).
- **U7.** No raw protocol text appears, and nothing is logged (R12).

## Testing

**Unit tests:**

- `hsi.ts`: every validity case, the peg at 2.5, the words, the sources including GPS2 and unknown values, DME null cases and the marker priority (inner over middle over outer when two are lit).
- `hsi-geometry.ts`: rotations across 360/0, and deviation offsets.
- The profile features.

**UI tests:**

- The HSI's states: valid, NAV flag, GS valid, GS flagged, GS none, BRG pointers by signal, DME by flag, marker letters, and source colours by source.
- The PFD scales by state.
- The NAV unit:
  - source write and read-back;
  - course stepper sums;
  - keypad set and refusal;
  - CTR disabled without a signal;
  - disabled with a reason when a binding is missing.
- The touch-target guard and the error-text guard.

**Integration:** against the mock, with a source switch, a course step and CTR.

**Smoke rows:**

- an ILS approach: LOC and GS needles, flags clearing on capture, markers;
- a VOR radial: TO/FROM flipping at station passage;
- GPS source turns the display magenta;
- `hsi_obs_deg_mag_pilot` follows the source and writing it moves the CDI;
- the deviation sign: right of course draws the needle right;
- the full-scale dot count matches the aircraft's own HSI;
- a back-course localizer (sign).

## Risks

- **Whether `hsi_obs_deg_mag_pilot` follows the source.** The device row decides. The fallback is a one-function change.
- **The dot scale.** X-Plane documents "dots" without a full-scale value. Avionix draws two dots each side and pegs at 2.5. If a device check shows the default HSI uses a different full scale, change the constants.
- **Back course.** The sign convention on a localizer back course is unverified, so the device row records it. Avionix draws X-Plane's value as given and never inverts it on its own.
