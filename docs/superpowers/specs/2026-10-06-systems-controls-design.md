# F-24: Aircraft systems controls — design

- Roadmap entry: `docs/roadmap/features/F-24-aircraft-systems-controls.md`
- Research: `docs/roadmap/research/systems-controls.md` (new, competitor and customer findings),
  `docs/roadmap/research/xplane-web-api.md`, `docs/roadmap/research/panel-builders.md`,
  `docs/roadmap/research/ux-avionics-conventions.md`
- Depends on: F-03 (compatibility), F-04 (panel framework), R-01 (cockpit design language)
- Minimum simulator: X-Plane 12.1.4 (unchanged)

## 1. Goal

A pilot opens a **Systems** panel and runs a whole flight from the tablet, from master switch to
shutdown: battery, avionics and generators; fuel selector and pumps; magnetos and starter;
exterior and interior lights; flaps, trim, landing gear and parking brake; pitot heat and the
anti-ice switches. Every control shows X-Plane's own state, never the last tap, and uses
Laminar's default commands, so it works on any aircraft that uses them.

Success is the roadmap's acceptance list:
- a control whose state DataRef is missing is not offered, while the rest works;
- gear up moves the reported gear, and an aircraft that ignores the command produces a plain
  "the aircraft did not respond";
- holding trim moves it continuously and stops within one update of release;
- a dropped link during a trim hold leaves the trim stationary and the panel says it was released;
- a disconnect marks every state stale and disables every control.

## 2. What competitors and pilots taught us

| Finding | Source | What we do |
|---|---|---|
| State sync is the top complaint: controls driven by the last press drift out of step with the simulator (MobiFlight's ON-OFF-ON problem); the plugins that work subscribe to live state | MobiFlight forum, xp_streamdeck, PilotsDeck, Touch Portal plugin | Every lamp and position comes from a subscribed DataRef; presses use explicit on/off commands, never toggles, so a double tap cannot invert a switch |
| The starter is spring-loaded: xp_streamdeck models it as "hold on last position" with begin/end commands because a plain toggle leaves the starter engaged | xp_streamdeck | START is a hold control: it cranks only while held and stops on release |
| Trim: a short press is a fine step, a hold is continuous; a release must stop it at once | xp_streamdeck rotary action | A tap nudges trim for a quarter second; a hold trims until release, with an explicit release message |
| The Bravo's flap lever is criticised for having no position marking | x-plained Bravo review | The flap readout names the detent ("2 of 3", UP, FULL) and shows when the flaps are still moving |
| Gear LEDs (green down-and-locked, red in transit) are what switch-panel owners expect | Logitech switch panel, Honeycomb Bravo | Three gear lamps from X-Plane's gear deployment, drawn by shape and colour and spoken as "three green" |
| Air Manager is criticised for window sprawl; XP-FlightDeck ships ready-made pages by category | HeliSimmer, XP-FlightDeck | Phone: four pages in flow order (ENGINE, LIGHTS, FLIGHT, ICE). Tablet: everything on one screen |
| Logitech's switch panel lacks backlighting; night legibility is a named gap | MyPilotStore reviews | The R-01 night palette applies; lamps meet the night luminance cap |
| Accidental magneto and starter activation (Honeycomb Alpha) | flightsimtimes, AVSIM | Gear, magnetos, the fuel selector's OFF and battery OFF take a second tap; START must be armed before it can be held |

## 3. Verified X-Plane names

Every name below was checked against Laminar's `DataRefs.txt` and `Commands.txt`, the files the
F-30 and F-32 names were checked against. None is community-sourced.

**Lights**

| Control | State (int 0/1 unless noted) | On / off commands |
|---|---|---|
| Beacon | `sim/cockpit2/switches/beacon_on` | `sim/lights/beacon_lights_on` / `_off` |
| Nav | `sim/cockpit2/switches/navigation_lights_on` | `sim/lights/nav_lights_on` / `_off` |
| Strobe | `sim/cockpit2/switches/strobe_lights_on` | `sim/lights/strobe_lights_on` / `_off` |
| Taxi | `sim/cockpit2/switches/taxi_light_on` | `sim/lights/taxi_lights_on` / `_off` |
| Landing | `sim/cockpit2/switches/landing_lights_on` | `sim/lights/landing_lights_on` / `_off` |
| Panel (flood) | `sim/cockpit2/switches/panel_brightness_ratio` float[4], index 0 | `sim/instruments/panel_bright_down` / `_up` |
| Instruments | `sim/cockpit2/switches/instrument_brightness_ratio` float[32], index 0 | `sim/instruments/instrument_bright_down` / `_up` |

**Gear, flaps, brakes**

| Purpose | Name | Type |
|---|---|---|
| Gear handle | `sim/cockpit2/controls/gear_handle_down` | int, 0 up, 1 down |
| Gear position | `sim/flightmodel2/gear/deploy_ratio` | float[10], 0 up, 1 down; entries 0–2 drive the lamps |
| Retractable gear | `sim/aircraft/gear/acf_gear_retract` | int, 0 fixed |
| Gear commands | `sim/flight_controls/landing_gear_up`, `sim/flight_controls/landing_gear_down` | commands |
| Flap handle | `sim/cockpit2/controls/flap_handle_request_ratio` | float 0..1 |
| Flap position | `sim/cockpit2/controls/flap_system_deploy_ratio` | float 0..1 |
| Flap detents | `sim/aircraft/controls/acf_flap_detents` | int |
| Flap commands | `sim/flight_controls/flaps_up`, `sim/flight_controls/flaps_down` | one notch each |
| Parking brake | `sim/cockpit2/controls/parking_brake_ratio` | float 0..1, writable |

**Trim**

| Axis | Position (float −1..1, normalised to the trim range) | Hold commands | Set commands |
|---|---|---|---|
| Pitch | `sim/flightmodel/controls/elv_trim` (−1 nose down, 1 nose up) | `sim/flight_controls/pitch_trim_down` / `_up` | `sim/flight_controls/pitch_trim_takeoff` |
| Roll | `sim/flightmodel/controls/ail_trim` (−1 left) | `sim/flight_controls/aileron_trim_left` / `_right` | `sim/flight_controls/aileron_trim_center` |
| Yaw | `sim/flightmodel/controls/rud_trim` (−1 left) | `sim/flight_controls/rudder_trim_left` / `_right` | `sim/flight_controls/rudder_trim_center` |
| Takeoff mark | `sim/aircraft/controls/acf_takeoff_trim` | float −1..1, same scale as `elv_trim` | — |

**Anti-ice** (state int 0/1; commands `sim/ice/<x>_on` / `_off`)

| Control | State | Command stem |
|---|---|---|
| Pitot heat | `sim/cockpit2/ice/ice_pitot_heat_on_pilot` | `pitot_heat0` |
| Window heat | `sim/cockpit2/ice/ice_window_heat_on` | `window_heat` |
| Prop heat | `sim/cockpit2/ice/ice_prop_heat_on` | `prop_heat` |
| Engine inlet | `sim/cockpit2/ice/ice_inlet_heat_on` | `inlet_heat` |
| Wing heat | `sim/cockpit2/ice/ice_surfce_heat_on` (Laminar's spelling) | `wing_heat` |
| Wing boots | `sim/cockpit2/ice/ice_surface_boot_on` | `wing_boot` |

**Electrical, fuel, engines** (engine `n` = 1..4; arrays are zero-based)

| Purpose | State | Commands |
|---|---|---|
| Battery | `sim/cockpit2/electrical/battery_on` int[8], index 0 | `sim/electrical/battery_1_on` / `_off` |
| Avionics master | `sim/cockpit2/switches/avionics_power_on` | `sim/systems/avionics_on` / `_off` |
| Generator n | `sim/cockpit2/electrical/generator_on` int[8] | `sim/electrical/generator_n_on` / `_off` |
| Fuel selector | `sim/cockpit2/fuel/fuel_tank_selector` int (0 none, 1 left, 2 centre, 3 right, 4 all) | `sim/fuel/fuel_selector_none` / `_lft` / `_all` / `_rgt` |
| Selector present | `sim/aircraft/overflow/acf_has_fuel_any`, `acf_has_fuel_all` | int 0/1 |
| Fuel pump n | `sim/cockpit2/engine/actuators/fuel_pump_on` int[16] | `sim/fuel/fuel_pump_n_on` / `_off` |
| Magnetos n | `sim/cockpit2/engine/actuators/ignition_key` int[16] (0 off, 1 left, 2 right, 3 both, 4 starting) | `sim/magnetos/magnetos_off_n` / `_right_n` / `_left_n` / `_both_n` |
| Starter n | `sim/cockpit2/engine/actuators/starter_hit` int[16] (read-only) | `sim/starters/engage_starter_n` (held) |
| Engine running | `sim/flightmodel/engine/ENGN_running` int[16] | — |
| Engine count, type | `sim/aircraft/engine/acf_num_engines` int; `sim/aircraft/prop/acf_en_type` int[16] (0, 1 piston) | — |

Total: 118 new names (35 DataRefs, 83 commands; `acf_en_type` is already bound by the
instruments), probed at connect like every other binding.

**Command activation.** Momentary presses keep using REST `activate`. Holds use the WebSocket
message `command_set_is_active` (`{"commands": [{"id", "is_active", "duration"?}]}`, API v2),
which the MVP spec records and the mock already accepts.

## 4. Requirements

### 4.1 Profile (R1, R7)

Profile 1.7.0 adds ten features, every binding optional, so a missing name costs only the control
it backs (the CDU keys' rule):

| Feature id | Label | Bindings |
|---|---|---|
| `lights-exterior` | Exterior lights | 5 states + 10 commands |
| `lights-interior` | Interior lights | 2 states + 4 commands |
| `gear` | Landing gear | handle, deployment, retractable flag, up, down |
| `flaps` | Flaps | handle, position, detents, up, down |
| `trim` | Trim | 3 positions, 6 hold commands, takeoff and two centre commands, takeoff mark |
| `parking-brake` | Parking brake | the ratio, `write: true` |
| `anti-ice` | Anti-ice | 6 states + 12 commands |
| `electrical` | Electrical | battery, avionics, generators: 3 states + 12 commands |
| `fuel` | Fuel | selector, its two flags, 4 selector commands; pump state + 8 commands |
| `engine-start` | Engine start | count, type, key, starter, running; 16 magneto and 4 starter commands |

Availability is decided per **control**, from its own bindings' resolution
(`compatibility.bindings[name].status === 'ok'`):

- its state DataRef did not resolve: the control is **not drawn** (R1: no state, no control);
- its state resolved but a command it sends did not: it is drawn **disabled**, still showing the
  state;
- either way its section prints one line naming them: "Not available on the Cessna 172: STROBE,
  TAXI.";
- a section with no control drawn shows only "{Section} isn't available on the {aircraft}.";
- the parking brake's ratio resolving read-only makes it unavailable the same way (R7).

### 4.2 Momentary controls (R2, R3)

- **Explicit commands, never toggles.** A switch that reads off sends its `_on` command; one that
  reads on sends `_off`. A second tap before X-Plane answers is ignored (the key shows pending).
- **Read-back.** Every press opens a watch through `useReadBack` (3 s from X-Plane accepting the
  command). Adopted: nothing to say. Not adopted: one sentence under the control, naming the
  aircraft and the state X-Plane still reports, for example "The Cessna 172 didn't turn the
  beacon on. It's still off."
- **Flaps** step one notch per press (`flaps_up` / `flaps_down`); adopted is any handle change
  in the pressed direction. ▲ is disabled at UP, ▼ at full.
- **Gear** sends `landing_gear_up` / `_down`; adopted is the handle reading the new position. Its
  failure sentence adds the likely reason: "X-Plane keeps the gear down while the aircraft is on
  the ground."
- **Parking brake** writes 1 (set) or 0 (release) to `parking_brake_ratio`: X-Plane has no
  separate set and release commands, only a toggle, and a write is idempotent.
- **Selectors** (fuel selector, magnetos) send the command for the chosen position; adopted is
  the state reading that position.
- **Dimmers** (panel, instruments) step with `_down` / `_up`; adopted is any change.
- **Set commands** (T/O trim, centre): adopted is the trim moving toward the target, or already
  there; no watch is opened when the trim already reads the target.

### 4.3 Hold controls (R4, R5)

Trim (six keys) and the starters are hold controls. While a hold control is held, the panel keeps
the command active through a **lease**:

- On press, `command_set_is_active {is_active: true, duration: 0.5}`. Every 200 ms while held, the
  same message renews it. On release, `{is_active: false}` stops it at once.
- **Safety:** a lease ends by itself 0.5 s after the last renewal. If the phone loses Wi-Fi
  without closing the socket (the connector relays raw TCP, so neither it nor X-Plane notices for
  minutes), the trim stops within 0.5 s anyway. X-Plane also clears every hold of a socket that
  closes.
- **Bounded:** a single hold ends after 10 s (trim) or 30 s (starter), with "Pitch trim stopped
  after 10 seconds. Press again to keep trimming."
- **Tap = nudge:** a press shorter than 250 ms is held for 250 ms, so a tap (and a screen-reader
  double-tap, which fires only `onPress`) moves trim by a fixed small step.
- **Link loss (R5):** when the panel's controls disable mid-hold (link dropped, values stale,
  aircraft re-check), the hold ends, renewals stop, and the panel says "Pitch trim released: the
  connection to X-Plane dropped." Renewals carry the connection they started on; the session
  refuses a renewal on a newer connection, so a hold never resumes after a reconnect.
- **Background:** the app leaving the foreground, or the panel unmounting, ends the hold.
- **No response:** if a hold lasted at least 1 s and the trim value did not move (and is not at
  the end it was driven toward), the key says "The {aircraft} didn't move pitch trim."
- A failed or refused renewal ends the hold; its failure shows through the existing notice.

### 4.4 Deliberate actions (R6)

- **Gear** UP and DOWN take a second tap within 3 s (the existing `confirm` on ControlButton: the
  legend reads "Tap again: GEAR UP").
- **Magnetos**: every position change takes a second tap.
- **Fuel selector OFF** and **battery OFF** take a second tap: either stops an engine or the
  electrics in flight.
- **Starter**: START is armed by a tap ("Hold to start", 3 s), then cranks only while held.

### 4.5 Stale and disconnected (R8, R9, R10)

The panel frame already disables controls and shows the stale notice with the last update time
when values are not current; lamps dim (LightBar `dim`). Nothing is queued or replayed. Names are
re-resolved on every connect by the existing probe. Every sentence is plain language with no
codes, ids, hosts or tokens; failures go through `FailureNotice`.

### 4.6 Controls and readouts

- **Switch keys** (lights, anti-ice, electrical, pumps, parking brake): an R-01 hardware key with
  a light bar: filled when X-Plane reports on, unlit when off. Spoken "Beacon, on".
- **Gear**: a lever key pair (GEAR UP / GEAR DOWN, the current one selected) and three lamps:
  green filled = down and locked (≥ 0.99), red outlined = in transit, unlit = up (≤ 0.01). Spoken
  "Gear down, three green", "Gear in transit", "Gear up". Fixed gear: no lever, "Fixed landing
  gear". Missing deployment: the lever alone.
- **Flaps**: readout "UP", "2 of 3" or "FULL" (handle × detents, rounded) with "MOVING" while the
  position differs from the handle by more than 0.02; a percentage when the detent count is
  missing or 0.
- **Trim**: per axis a horizontal scale (pitch: NOSE DN … NOSE UP with the takeoff mark; roll and
  yaw: L … R) with a pointer, and a readout "12 % nose up", "centred" within 1 %.
- **Fuel selector**: OFF / LEFT / BOTH / RIGHT segment keys. BOTH is shown only when
  `acf_has_fuel_all` is not 0; the selector is hidden when `acf_has_fuel_any` is 0.
- **Engines**: one column per engine (1..min(count, 4); count missing = 1; above 4 shows
  "Engines 5 and up aren't shown"): GEN, FUEL PUMP, the magneto segment keys OFF / R / L / BOTH
  (piston engines only, by `acf_en_type`), START with a lamp while the starter is engaged, and a
  RUN lamp from `ENGN_running`.
- **Dimmers**: PANEL and INSTR, each ▼ / ▲ with a percentage readout.

### 4.7 Layout

- **Phone (< 720 dp wide)**: a row of page keys at the top: **ENGINE** (electrical, fuel, engine
  start), **LIGHTS**, **FLIGHT** (flaps, trim, gear, parking brake), **ICE**. The page scrolls
  beneath. The last page is remembered per device (`avionix.systems`); FLIGHT on first use.
- **Wide (≥ 720 dp)**: no page keys; two columns, ENGINE and LIGHTS on the left, FLIGHT and ICE
  on the right, scrolling together.
- Every key meets the 48 dp target; the touch-target guard sweeps the panel. Hold keys are never
  placed next to a confirm key in the same row.

### 4.8 Panel

- Descriptor id `systems`, title "Systems", the ten features, `supports: EVERYWHERE`.
- Registered fifth: Instruments, Radios, Autopilot, Navigation, **Systems**, CDU, Flight data.
- `PanelIcon` gains a `systems` glyph: three toggle switches.

## 5. Framework changes

- `SimulatorClient.setCommandActive(id, active, durationSeconds?)` over the WebSocket.
- `SimulatorSession` gains hold support (`holdCommand`): refusals as `activate`, the connection
  generation checked on every renewal, failures recorded against the binding, successes not
  recorded (four renewals a second must not churn the store).
- `PanelActions.hold` beside `write` and `activate`; `useSimulatorSession` and `PanelFrame` pass
  it through.
- `ControlButton` gains hold support (press-in / press-out callbacks, a held look, the armed
  first tap for START) so every rule (availability, link, haptics, notices) still lives in one
  primitive.
- A pure `HoldLease` in `src/domain/panels/hold-lease.ts` (injected clock and timers, like the CDU
  queue) and a `useHoldControl` hook.

## 6. Mock X-Plane

The mock gains the 118 names with a toy aircraft:
- light, anti-ice, electrical, pump and magneto commands set their states;
- gear and flap commands move the handle at once and the deployment over about 2 s;
- holds move trim at 0.1 per second while active, honour leases and `is_active: false`, and
  record every hold message;
- the starter sets `starter_hit` and key position 4 while held, and the engine runs after 2 s of
  cranking with magnetos on and the selector not OFF;
- an `ignoreCommands` option lets a test make the aircraft ignore a command.

## 7. Testing

- Unit: `HoldLease` (lease and renew timing, release, nudge, cap, cancel reasons, refused and
  failed renewals), the systems domain (switch state, gear lamps, flap detents, trim readouts,
  selector positions, engine columns, sentences), the profile (names match section 3).
- Session: `holdCommand` refusals, generation check, failure recording, no store churn on success.
- UI: each section, missing-name lines, read-back sentences, confirm and armed flows, hold keys
  (press, release, nudge, cap, link loss, background), pages and their persistence, wide layout,
  accessibility labels, stale dimming.
- Integration against the mock: beacon on, gear up with three lamps going out, a trim hold that
  moves and stops on release, a dropped socket mid-hold leaving trim still, a starter hold that
  starts the engine.
- Guards: the touch-target sweep, registry order, the error-text guard over the new notices.
- Device rows: hold smoothness and stop latency, Wi-Fi pulled mid-hold, gear lamps on a
  retractable default aircraft, flap detent labels, trim sign, the starter on piston and turbine
  aircraft, magnetos, fuel selector positions, anti-ice switches on aircraft without the system,
  and connect time with the larger probe.

## 8. Out of scope

- Engine gauges and limits (F-12), failures (F-25), checklists (F-55), the 737 overhead (F-53).
- Mixture, throttle, propeller, cowl flaps, autobrakes, spoilers and the remaining anti-ice
  systems (TKS, tail, static and AOA heat).
- Detent-by-detent flap selection by writing the handle ratio (commands keep add-ons working).
- Engines 5 to 8.

## 9. Decisions

1. Explicit on/off commands over toggles: a toggle sent twice cancels itself and cannot be
   verified against a target.
2. A short renewed lease instead of an open hold: the connector cannot detect a silent phone, and
   a runaway trim is the failure pilots fear most.
3. Every new binding optional and availability decided per control: one missing light must not
   take the lights section with it.
4. Flaps by notch commands, not handle writes: add-ons hook the commands.
5. Parking brake by write: X-Plane offers only a toggle command.
6. Electrical controls are added beyond the roadmap list: the panel is meant to run a flight from
   start to shutdown, and every switch panel simmers buy starts with the master switch.
7. Phone pages in flow order rather than one long scroll; tablets see everything.
8. Systems is placed before the CDU: every aircraft has these controls, only airliners have the
   CDU.
