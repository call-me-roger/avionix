# F-24 Aircraft Systems Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Systems panel (lights, gear, flaps, trim, parking brake, anti-ice, electrical, fuel, magnetos and starter) where every control shows X-Plane's own state, momentary presses are confirmed by read-back, and trim and the starter are held through a renewed lease that can never run away.

**Architecture:**
- **Domain** (`src/domain/systems/`): the catalogue of names (`controls.ts`), pure readouts (`readouts.ts`) and sentences (`messages.ts`). `src/domain/panels/hold-lease.ts` is the generic lease on a held command (injected timers).
- **Profile 1.7.0** adds ten features built from the catalogue, every binding optional except the parking brake's.
- **Transport and session:** `SimulatorClient.setCommandActive` sends `command_set_is_active` over the WebSocket; `SimulatorSession.holdCommand(featureId, name, phase)` presses, renews and releases, refusing a renewal from an older connection; `PanelActions.hold` carries it to panels.
- **Primitives:** `ControlButton` gains a `hold` prop (press-in starts, press-out ends, a screen-reader activation nudges, `confirm` arms first); `useHoldControl` owns one lease per hold key and its messages.
- **Panel** (`src/features/panels/systems/`): sections built from the catalogue; phone pages (ENGINE, LIGHTS, FLIGHT, ICE, remembered under `avionix.systems`); two columns at ≥ 720 dp.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict, Jest with RNTL 14 (`render`, `rerender` and `fireEvent` are awaited), zod v4.

**Spec:** `docs/superpowers/specs/2026-10-06-systems-controls-design.md`

## Global Constraints

- Gate before every commit: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npx jest`, all passing.
- Every commit message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never launch Xcode, Android Studio, simulators, emulators, `expo start` or EAS builds.
- Never render, log or serialise a token, pairing code, URL, HTTP status, exception text, DataRef or command id or name, or protocol payload on any screen or message (R10). Failures reach the screen only through `FailureNotice` / `OperationNotice`.
- Lint runs eslint-plugin-react-hooks v7: no ref reads or writes during render (`react-hooks/refs`), no `Date.now()` during render (`react-hooks/purity`), no effect whose body only calls `setState` (`react-hooks/set-state-in-effect`). Adjusting state during render from props (as `ControlButton` resets `armed`) is allowed; refs are read and written only in effects and handlers.
- **S1** Every lamp, position and readout comes from `snapshot.telemetry`; nothing shows a pressed state X-Plane did not report.
- **S2** Switches send explicit `_on` / `_off` commands chosen from the current state, never a toggle.
- **S3** A control whose state DataRef did not resolve is not drawn; one whose state resolved but a command did not is drawn disabled; its unit names both in one line.
- **S4** A held command is only ever sent with a 0.5 s lease, renewed every 200 ms, released explicitly, capped (trim 10 s, starter 30 s), and never renewed on a newer connection.
- **S5** Every pressable is at least 48 dp both ways (`theme.touch.minTarget`).
- **R-01 design language:** `AvionicsUnit`, `ControlButton` (`annunciation`, `selected`, `confirm`, `compact`, `style`), `LightBar`, `avionicsText()`, `numeric()`; build no new look beyond what this plan names.
- `@/` imports; `makeStyles(theme)` with `useThemedStyles`; zod v4 for the new preference schema.

## Review Focus

1. **A finger lifts while the press is still in flight** (release before `press` resolves): the release is still sent and the lease ends; nothing renews afterwards. Test in Task 3.
2. **The link drops and comes back within the lease** (socket closed, reconnected 300 ms later) while the key is still physically held: no renewal reaches the new connection, and the panel says the trim was released. Tests in Task 4 (session) and Task 5 (hook).
3. **A tap shorter than 250 ms, and a screen reader's double-tap** (only `onPress`, no press-in): both send exactly one press and one release 250 ms apart. Tests in Task 3 and Task 5.
4. **A switch tapped twice before X-Plane answers:** the second tap is ignored (the key is disabled while its read-back waits), so one `_on` is sent, not `_on` then `_off`. Test in Task 6.
5. **An aircraft with more than four engines, or none reported:** columns for engines 1–4 with "Engines 5 and up aren't shown.", or one column when the count is missing or 0. Test in Task 2 and Task 6.

---

### Task 1: Systems catalogue and profile 1.7.0

**Files:**
- Create: `src/domain/systems/controls.ts`
- Modify: `src/domain/aircraft/profiles/generic.ts`
- Modify: every test pinning `'1.6.0'` (`grep -rln "1\.6\.0" tests src`), and the command-count assertion in `tests/unit/application/simulator-session.test.ts` (`before + 162` → `before + 245`: 83 new commands)
- Test: `tests/unit/domain/systems-controls.test.ts`, `tests/unit/domain/aircraft-profile.test.ts`

**Interfaces produced** (exact; later tasks import these):

```ts
// src/domain/systems/controls.ts
export const FEATURE_LIGHTS_EXTERIOR = 'lights-exterior';
export const FEATURE_LIGHTS_INTERIOR = 'lights-interior';
export const FEATURE_GEAR = 'gear';
export const FEATURE_FLAPS = 'flaps';
export const FEATURE_TRIM = 'trim';
export const FEATURE_PARKING_BRAKE = 'parking-brake';
export const FEATURE_ANTI_ICE = 'anti-ice';
export const FEATURE_ELECTRICAL = 'electrical';
export const FEATURE_FUEL = 'fuel';
export const FEATURE_ENGINE_START = 'engine-start';
export const SYSTEMS_FEATURES: readonly string[]; // the ten, in the order above
export const MAX_ENGINES = 4;
export const ENGINE_NUMBERS: readonly number[]; // [1, 2, 3, 4]

export interface SwitchSpec {
  key: string; legend: string; name: string; featureId: string;
  state: string; index: number; on: string; off: string; confirmOff?: boolean;
}
export const EXTERIOR_LIGHTS: readonly SwitchSpec[];
export const ANTI_ICE: readonly SwitchSpec[];
export const BATTERY: SwitchSpec;
export const AVIONICS_MASTER: SwitchSpec;
export function generatorSwitch(engine: number): SwitchSpec;
export function fuelPumpSwitch(engine: number): SwitchSpec;

export interface DimmerSpec {
  key: string; legend: string; name: string; featureId: string;
  state: string; index: number; down: string; up: string;
}
export const DIMMERS: readonly DimmerSpec[];

export const GEAR: { featureId; handle; deployment; retractable; up; down };
export const FLAPS: { featureId; handle; position; detents; up; down };
export const PARKING_BRAKE: { featureId; ratio };

export type TrimAxis = 'pitch' | 'roll' | 'yaw';
export interface TrimAction { command: string; legend: string; name: string }
export interface TrimSpec {
  axis: TrimAxis; label: string; name: string; position: string;
  decrease: TrimAction; increase: TrimAction;
  set: TrimAction & { sentence: string };
}
export const TRIMS: readonly TrimSpec[];
export const TAKEOFF_TRIM: string;

export interface SelectorPosition {
  key: string; legend: string; name: string; value: number; command: string; confirm: boolean;
}
export const FUEL_SELECTOR: {
  featureId: string; state: string; hasSelector: string; hasBoth: string;
  positions: readonly SelectorPosition[];
};
export const ENGINES: { featureId; count; type; key; starter; running };
export function magnetoPositions(engine: number): readonly SelectorPosition[];
export function starterCommand(engine: number): string;
```

- [ ] **Step 1: Write the failing catalogue test**

Create `tests/unit/domain/systems-controls.test.ts`:

```ts
import {
  ANTI_ICE,
  AVIONICS_MASTER,
  BATTERY,
  DIMMERS,
  ENGINES,
  ENGINE_NUMBERS,
  EXTERIOR_LIGHTS,
  FEATURE_ENGINE_START,
  FLAPS,
  FUEL_SELECTOR,
  GEAR,
  MAX_ENGINES,
  PARKING_BRAKE,
  SYSTEMS_FEATURES,
  TAKEOFF_TRIM,
  TRIMS,
  fuelPumpSwitch,
  generatorSwitch,
  magnetoPositions,
  starterCommand,
} from '@/domain/systems/controls';

describe('the systems catalogue (spec §3)', () => {
  it('names the five exterior lights in the Honeycomb Alpha order, with explicit on/off commands', () => {
    expect(EXTERIOR_LIGHTS.map((light) => [light.legend, light.state, light.on, light.off])).toEqual([
      ['BCN', 'sim/cockpit2/switches/beacon_on', 'sim/lights/beacon_lights_on', 'sim/lights/beacon_lights_off'],
      ['LAND', 'sim/cockpit2/switches/landing_lights_on', 'sim/lights/landing_lights_on', 'sim/lights/landing_lights_off'],
      ['TAXI', 'sim/cockpit2/switches/taxi_light_on', 'sim/lights/taxi_lights_on', 'sim/lights/taxi_lights_off'],
      ['NAV', 'sim/cockpit2/switches/navigation_lights_on', 'sim/lights/nav_lights_on', 'sim/lights/nav_lights_off'],
      ['STROBE', 'sim/cockpit2/switches/strobe_lights_on', 'sim/lights/strobe_lights_on', 'sim/lights/strobe_lights_off'],
    ]);
  });

  it('names six anti-ice switches, spelling the wing-heat DataRef as Laminar does', () => {
    expect(ANTI_ICE.map((spec) => [spec.legend, spec.state, spec.on, spec.off])).toEqual([
      ['PITOT HEAT', 'sim/cockpit2/ice/ice_pitot_heat_on_pilot', 'sim/ice/pitot_heat0_on', 'sim/ice/pitot_heat0_off'],
      ['WINDOW HEAT', 'sim/cockpit2/ice/ice_window_heat_on', 'sim/ice/window_heat_on', 'sim/ice/window_heat_off'],
      ['PROP HEAT', 'sim/cockpit2/ice/ice_prop_heat_on', 'sim/ice/prop_heat_on', 'sim/ice/prop_heat_off'],
      ['ENG ANTI-ICE', 'sim/cockpit2/ice/ice_inlet_heat_on', 'sim/ice/inlet_heat_on', 'sim/ice/inlet_heat_off'],
      ['WING HEAT', 'sim/cockpit2/ice/ice_surfce_heat_on', 'sim/ice/wing_heat_on', 'sim/ice/wing_heat_off'],
      ['WING BOOTS', 'sim/cockpit2/ice/ice_surface_boot_on', 'sim/ice/wing_boot_on', 'sim/ice/wing_boot_off'],
    ]);
  });

  it('confirms only the battery going off among the electrical switches', () => {
    expect(BATTERY.confirmOff).toBe(true);
    expect(AVIONICS_MASTER.confirmOff).toBeUndefined();
    expect([BATTERY.state, BATTERY.on, BATTERY.off]).toEqual([
      'sim/cockpit2/electrical/battery_on',
      'sim/electrical/battery_1_on',
      'sim/electrical/battery_1_off',
    ]);
    expect([AVIONICS_MASTER.state, AVIONICS_MASTER.on, AVIONICS_MASTER.off]).toEqual([
      'sim/cockpit2/switches/avionics_power_on',
      'sim/systems/avionics_on',
      'sim/systems/avionics_off',
    ]);
  });

  it('builds per-engine switches with 1-based commands and 0-based array indexes', () => {
    expect(generatorSwitch(2)).toMatchObject({
      key: 'generator2',
      state: 'sim/cockpit2/electrical/generator_on',
      index: 1,
      on: 'sim/electrical/generator_2_on',
      off: 'sim/electrical/generator_2_off',
    });
    expect(fuelPumpSwitch(3)).toMatchObject({
      key: 'fuelPump3',
      state: 'sim/cockpit2/engine/actuators/fuel_pump_on',
      index: 2,
      on: 'sim/fuel/fuel_pump_3_on',
      off: 'sim/fuel/fuel_pump_3_off',
    });
    expect(starterCommand(4)).toBe('sim/starters/engage_starter_4');
    expect(ENGINE_NUMBERS).toEqual([1, 2, 3, 4]);
    expect(MAX_ENGINES).toBe(4);
  });

  it('orders the magnetos as on the key switch, every change confirmed', () => {
    expect(magnetoPositions(1).map((p) => [p.legend, p.value, p.command, p.confirm])).toEqual([
      ['OFF', 0, 'sim/magnetos/magnetos_off_1', true],
      ['R', 2, 'sim/magnetos/magnetos_right_1', true],
      ['L', 1, 'sim/magnetos/magnetos_left_1', true],
      ['BOTH', 3, 'sim/magnetos/magnetos_both_1', true],
    ]);
  });

  it('confirms only OFF on the fuel selector', () => {
    expect(FUEL_SELECTOR.positions.map((p) => [p.legend, p.value, p.command, p.confirm])).toEqual([
      ['OFF', 0, 'sim/fuel/fuel_selector_none', true],
      ['LEFT', 1, 'sim/fuel/fuel_selector_lft', false],
      ['BOTH', 4, 'sim/fuel/fuel_selector_all', false],
      ['RIGHT', 3, 'sim/fuel/fuel_selector_rgt', false],
    ]);
  });

  it('names gear, flaps, the parking brake, trim, dimmers and engines', () => {
    expect(GEAR).toMatchObject({
      handle: 'sim/cockpit2/controls/gear_handle_down',
      deployment: 'sim/flightmodel2/gear/deploy_ratio',
      retractable: 'sim/aircraft/gear/acf_gear_retract',
      up: 'sim/flight_controls/landing_gear_up',
      down: 'sim/flight_controls/landing_gear_down',
    });
    expect(FLAPS).toMatchObject({
      handle: 'sim/cockpit2/controls/flap_handle_request_ratio',
      position: 'sim/cockpit2/controls/flap_system_deploy_ratio',
      detents: 'sim/aircraft/controls/acf_flap_detents',
      up: 'sim/flight_controls/flaps_up',
      down: 'sim/flight_controls/flaps_down',
    });
    expect(PARKING_BRAKE.ratio).toBe('sim/cockpit2/controls/parking_brake_ratio');
    expect(TRIMS.map((trim) => [trim.axis, trim.position, trim.decrease.command, trim.increase.command, trim.set.command])).toEqual([
      ['pitch', 'sim/flightmodel/controls/elv_trim', 'sim/flight_controls/pitch_trim_down', 'sim/flight_controls/pitch_trim_up', 'sim/flight_controls/pitch_trim_takeoff'],
      ['roll', 'sim/flightmodel/controls/ail_trim', 'sim/flight_controls/aileron_trim_left', 'sim/flight_controls/aileron_trim_right', 'sim/flight_controls/aileron_trim_center'],
      ['yaw', 'sim/flightmodel/controls/rud_trim', 'sim/flight_controls/rudder_trim_left', 'sim/flight_controls/rudder_trim_right', 'sim/flight_controls/rudder_trim_center'],
    ]);
    expect(TAKEOFF_TRIM).toBe('sim/aircraft/controls/acf_takeoff_trim');
    expect(DIMMERS.map((dimmer) => [dimmer.legend, dimmer.state, dimmer.down, dimmer.up])).toEqual([
      ['PANEL', 'sim/cockpit2/switches/panel_brightness_ratio', 'sim/instruments/panel_bright_down', 'sim/instruments/panel_bright_up'],
      ['INSTR', 'sim/cockpit2/switches/instrument_brightness_ratio', 'sim/instruments/instrument_bright_down', 'sim/instruments/instrument_bright_up'],
    ]);
    expect(ENGINES).toEqual({
      featureId: FEATURE_ENGINE_START,
      count: 'sim/aircraft/engine/acf_num_engines',
      type: 'sim/aircraft/prop/acf_en_type',
      key: 'sim/cockpit2/engine/actuators/ignition_key',
      starter: 'sim/cockpit2/engine/actuators/starter_hit',
      running: 'sim/flightmodel/engine/ENGN_running',
    });
    expect(SYSTEMS_FEATURES).toEqual([
      'lights-exterior',
      'lights-interior',
      'gear',
      'flaps',
      'trim',
      'parking-brake',
      'anti-ice',
      'electrical',
      'fuel',
      'engine-start',
    ]);
  });

  it('gives every switch a unique key', () => {
    const keys = [
      ...EXTERIOR_LIGHTS,
      ...ANTI_ICE,
      BATTERY,
      AVIONICS_MASTER,
      ...ENGINE_NUMBERS.map(generatorSwitch),
      ...ENGINE_NUMBERS.map(fuelPumpSwitch),
    ].map((spec) => spec.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

(Prettier will re-wrap the long array literals; run `npx prettier --write` on the file.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest tests/unit/domain/systems-controls.test.ts`
Expected: FAIL, cannot find module `@/domain/systems/controls`.

- [ ] **Step 3: Write the catalogue**

Create `src/domain/systems/controls.ts`:

```ts
/**
 * F-24's catalogue: every systems control, the DataRef that reports its state and the commands it
 * sends. Every name is Laminar's, verified against `DataRefs.txt` and `Commands.txt` (spec §3). The
 * profile builds its features from this file and the panel draws from it, so a name lives in one
 * place only.
 */

export const FEATURE_LIGHTS_EXTERIOR = 'lights-exterior';
export const FEATURE_LIGHTS_INTERIOR = 'lights-interior';
export const FEATURE_GEAR = 'gear';
export const FEATURE_FLAPS = 'flaps';
export const FEATURE_TRIM = 'trim';
export const FEATURE_PARKING_BRAKE = 'parking-brake';
export const FEATURE_ANTI_ICE = 'anti-ice';
export const FEATURE_ELECTRICAL = 'electrical';
export const FEATURE_FUEL = 'fuel';
export const FEATURE_ENGINE_START = 'engine-start';

/** The Systems panel's features, in profile order. */
export const SYSTEMS_FEATURES: readonly string[] = [
  FEATURE_LIGHTS_EXTERIOR,
  FEATURE_LIGHTS_INTERIOR,
  FEATURE_GEAR,
  FEATURE_FLAPS,
  FEATURE_TRIM,
  FEATURE_PARKING_BRAKE,
  FEATURE_ANTI_ICE,
  FEATURE_ELECTRICAL,
  FEATURE_FUEL,
  FEATURE_ENGINE_START,
];

/** Engines the panel draws a column for (spec §4.6); Laminar's commands exist for eight. */
export const MAX_ENGINES = 4;

/** 1-based, as Laminar's command names are. DataRef arrays are 0-based: engine n is index n − 1. */
export const ENGINE_NUMBERS: readonly number[] = Array.from(
  { length: MAX_ENGINES },
  (_, index) => index + 1,
);

/** A two-position switch: X-Plane's state (element `index` of `state`) and explicit commands (S2). */
export interface SwitchSpec {
  /** Unique across the panel; read-back keys and test ids derive from it. */
  key: string;
  legend: string;
  /** In the pilot's words, lower case, for sentences and screen readers ("beacon"). */
  name: string;
  featureId: string;
  state: string;
  index: number;
  on: string;
  off: string;
  /** Turning it off takes a second tap: it would stop the electrics in flight (spec §4.4). */
  confirmOff?: boolean;
}

function lightSwitch(
  key: string,
  legend: string,
  name: string,
  state: string,
  stem: string,
): SwitchSpec {
  return {
    key,
    legend,
    name,
    featureId: FEATURE_LIGHTS_EXTERIOR,
    state: `sim/cockpit2/switches/${state}`,
    index: 0,
    on: `sim/lights/${stem}_on`,
    off: `sim/lights/${stem}_off`,
  };
}

/** In the Honeycomb Alpha's order: the switch row simmers already know. */
export const EXTERIOR_LIGHTS: readonly SwitchSpec[] = [
  lightSwitch('beacon', 'BCN', 'beacon', 'beacon_on', 'beacon_lights'),
  lightSwitch('landing', 'LAND', 'landing lights', 'landing_lights_on', 'landing_lights'),
  lightSwitch('taxi', 'TAXI', 'taxi light', 'taxi_light_on', 'taxi_lights'),
  lightSwitch('nav', 'NAV', 'navigation lights', 'navigation_lights_on', 'nav_lights'),
  lightSwitch('strobe', 'STROBE', 'strobe lights', 'strobe_lights_on', 'strobe_lights'),
];

function iceSwitch(
  key: string,
  legend: string,
  name: string,
  state: string,
  stem: string,
): SwitchSpec {
  return {
    key,
    legend,
    name,
    featureId: FEATURE_ANTI_ICE,
    state: `sim/cockpit2/ice/${state}`,
    index: 0,
    on: `sim/ice/${stem}_on`,
    off: `sim/ice/${stem}_off`,
  };
}

export const ANTI_ICE: readonly SwitchSpec[] = [
  iceSwitch('pitot', 'PITOT HEAT', 'pitot heat', 'ice_pitot_heat_on_pilot', 'pitot_heat0'),
  iceSwitch('window', 'WINDOW HEAT', 'window heat', 'ice_window_heat_on', 'window_heat'),
  iceSwitch('prop', 'PROP HEAT', 'prop heat', 'ice_prop_heat_on', 'prop_heat'),
  iceSwitch('inlet', 'ENG ANTI-ICE', 'engine anti-ice', 'ice_inlet_heat_on', 'inlet_heat'),
  // Laminar spells this DataRef `surfce`.
  iceSwitch('wingHeat', 'WING HEAT', 'wing heat', 'ice_surfce_heat_on', 'wing_heat'),
  iceSwitch('boots', 'WING BOOTS', 'wing boots', 'ice_surface_boot_on', 'wing_boot'),
];

export const BATTERY: SwitchSpec = {
  key: 'battery',
  legend: 'BATT',
  name: 'battery',
  featureId: FEATURE_ELECTRICAL,
  state: 'sim/cockpit2/electrical/battery_on',
  index: 0,
  on: 'sim/electrical/battery_1_on',
  off: 'sim/electrical/battery_1_off',
  confirmOff: true,
};

export const AVIONICS_MASTER: SwitchSpec = {
  key: 'avionics',
  legend: 'AVIONICS',
  name: 'avionics master',
  featureId: FEATURE_ELECTRICAL,
  state: 'sim/cockpit2/switches/avionics_power_on',
  index: 0,
  on: 'sim/systems/avionics_on',
  off: 'sim/systems/avionics_off',
};

export function generatorSwitch(engine: number): SwitchSpec {
  return {
    key: `generator${engine}`,
    legend: 'GEN',
    name: `generator ${engine}`,
    featureId: FEATURE_ELECTRICAL,
    state: 'sim/cockpit2/electrical/generator_on',
    index: engine - 1,
    on: `sim/electrical/generator_${engine}_on`,
    off: `sim/electrical/generator_${engine}_off`,
  };
}

export function fuelPumpSwitch(engine: number): SwitchSpec {
  return {
    key: `fuelPump${engine}`,
    legend: 'FUEL PUMP',
    name: `fuel pump ${engine}`,
    featureId: FEATURE_FUEL,
    state: 'sim/cockpit2/engine/actuators/fuel_pump_on',
    index: engine - 1,
    on: `sim/fuel/fuel_pump_${engine}_on`,
    off: `sim/fuel/fuel_pump_${engine}_off`,
  };
}

/** A brightness rheostat, stepped by X-Plane's own "a bit" commands. */
export interface DimmerSpec {
  key: string;
  legend: string;
  name: string;
  featureId: string;
  state: string;
  index: number;
  down: string;
  up: string;
}

export const DIMMERS: readonly DimmerSpec[] = [
  {
    key: 'panelLights',
    legend: 'PANEL',
    name: 'panel lights',
    featureId: FEATURE_LIGHTS_INTERIOR,
    state: 'sim/cockpit2/switches/panel_brightness_ratio',
    index: 0,
    down: 'sim/instruments/panel_bright_down',
    up: 'sim/instruments/panel_bright_up',
  },
  {
    key: 'instrumentLights',
    legend: 'INSTR',
    name: 'instrument lights',
    featureId: FEATURE_LIGHTS_INTERIOR,
    state: 'sim/cockpit2/switches/instrument_brightness_ratio',
    index: 0,
    down: 'sim/instruments/instrument_bright_down',
    up: 'sim/instruments/instrument_bright_up',
  },
];

export const GEAR = {
  featureId: FEATURE_GEAR,
  /** int: 0 up, 1 down. */
  handle: 'sim/cockpit2/controls/gear_handle_down',
  /** float[10]: 0 up, 1 down; entries 0–2 drive the three lamps. */
  deployment: 'sim/flightmodel2/gear/deploy_ratio',
  /** int: 0 means fixed gear. */
  retractable: 'sim/aircraft/gear/acf_gear_retract',
  up: 'sim/flight_controls/landing_gear_up',
  down: 'sim/flight_controls/landing_gear_down',
} as const;

export const FLAPS = {
  featureId: FEATURE_FLAPS,
  /** float 0..1: where the handle is. */
  handle: 'sim/cockpit2/controls/flap_handle_request_ratio',
  /** float 0..1: where the flaps actually are. */
  position: 'sim/cockpit2/controls/flap_system_deploy_ratio',
  /** int: the handle's detents below UP. */
  detents: 'sim/aircraft/controls/acf_flap_detents',
  /** One notch each. */
  up: 'sim/flight_controls/flaps_up',
  down: 'sim/flight_controls/flaps_down',
} as const;

export const PARKING_BRAKE = {
  featureId: FEATURE_PARKING_BRAKE,
  /** float 0..1, written: X-Plane has only a toggle command for it. */
  ratio: 'sim/cockpit2/controls/parking_brake_ratio',
} as const;

export type TrimAxis = 'pitch' | 'roll' | 'yaw';

export interface TrimAction {
  command: string;
  legend: string;
  /** In the pilot's words ("nose up", "left", "takeoff trim"). */
  name: string;
}

export interface TrimSpec {
  axis: TrimAxis;
  /** The unit's label. */
  label: string;
  /** In the pilot's words ("pitch trim"). */
  name: string;
  /** float −1..1 over the aircraft's trim range: −1 nose down or left. */
  position: string;
  /** Held: moves toward −1. */
  decrease: TrimAction;
  /** Held: moves toward +1. */
  increase: TrimAction;
  /** One press sets a fixed position; `sentence` completes "The Cessna 172 didn't …". */
  set: TrimAction & { sentence: string };
}

export const TRIMS: readonly TrimSpec[] = [
  {
    axis: 'pitch',
    label: 'PITCH TRIM',
    name: 'pitch trim',
    position: 'sim/flightmodel/controls/elv_trim',
    decrease: { command: 'sim/flight_controls/pitch_trim_down', legend: 'NOSE DN', name: 'nose down' },
    increase: { command: 'sim/flight_controls/pitch_trim_up', legend: 'NOSE UP', name: 'nose up' },
    set: {
      command: 'sim/flight_controls/pitch_trim_takeoff',
      legend: 'T/O',
      name: 'takeoff trim',
      sentence: 'set takeoff trim',
    },
  },
  {
    axis: 'roll',
    label: 'ROLL TRIM',
    name: 'roll trim',
    position: 'sim/flightmodel/controls/ail_trim',
    decrease: { command: 'sim/flight_controls/aileron_trim_left', legend: 'L', name: 'left' },
    increase: { command: 'sim/flight_controls/aileron_trim_right', legend: 'R', name: 'right' },
    set: {
      command: 'sim/flight_controls/aileron_trim_center',
      legend: 'CTR',
      name: 'centre',
      sentence: 'centre the roll trim',
    },
  },
  {
    axis: 'yaw',
    label: 'RUDDER TRIM',
    name: 'rudder trim',
    position: 'sim/flightmodel/controls/rud_trim',
    decrease: { command: 'sim/flight_controls/rudder_trim_left', legend: 'L', name: 'left' },
    increase: { command: 'sim/flight_controls/rudder_trim_right', legend: 'R', name: 'right' },
    set: {
      command: 'sim/flight_controls/rudder_trim_center',
      legend: 'CTR',
      name: 'centre',
      sentence: 'centre the rudder trim',
    },
  },
];

/** Where takeoff trim sits on the pitch scale: the same −1..1 scale as `elv_trim`. */
export const TAKEOFF_TRIM = 'sim/aircraft/controls/acf_takeoff_trim';

/** One position of a rotary selector, set by its own command. */
export interface SelectorPosition {
  key: string;
  legend: string;
  name: string;
  /** The state DataRef's value in this position. */
  value: number;
  command: string;
  /** Selecting it takes a second tap (spec §4.4). */
  confirm: boolean;
}

const FUEL_POSITIONS: readonly SelectorPosition[] = [
  { key: 'off', legend: 'OFF', name: 'off', value: 0, command: 'sim/fuel/fuel_selector_none', confirm: true },
  { key: 'left', legend: 'LEFT', name: 'left', value: 1, command: 'sim/fuel/fuel_selector_lft', confirm: false },
  { key: 'both', legend: 'BOTH', name: 'both', value: 4, command: 'sim/fuel/fuel_selector_all', confirm: false },
  { key: 'right', legend: 'RIGHT', name: 'right', value: 3, command: 'sim/fuel/fuel_selector_rgt', confirm: false },
];

export const FUEL_SELECTOR = {
  featureId: FEATURE_FUEL,
  /** int: 0 none, 1 left, 2 centre, 3 right, 4 all. */
  state: 'sim/cockpit2/fuel/fuel_tank_selector',
  /** int: 0 means the aircraft has no fuel selector. */
  hasSelector: 'sim/aircraft/overflow/acf_has_fuel_any',
  /** int: 0 means the selector has no BOTH (all tanks) position. */
  hasBoth: 'sim/aircraft/overflow/acf_has_fuel_all',
  positions: FUEL_POSITIONS,
} as const;

export const ENGINES = {
  featureId: FEATURE_ENGINE_START,
  /** int */
  count: 'sim/aircraft/engine/acf_num_engines',
  /** int[16]: 0 and 1 are piston engines (the instruments bind this name too). */
  type: 'sim/aircraft/prop/acf_en_type',
  /** int[16]: 0 off, 1 left, 2 right, 3 both, 4 starting. */
  key: 'sim/cockpit2/engine/actuators/ignition_key',
  /** int[16], read-only: the starter motor is engaged. */
  starter: 'sim/cockpit2/engine/actuators/starter_hit',
  /** int[16]: the engine is running. */
  running: 'sim/flightmodel/engine/ENGN_running',
} as const;

/** The key switch's magneto positions in their order on the switch. Every change is confirmed (R6). */
export function magnetoPositions(engine: number): readonly SelectorPosition[] {
  return [
    { key: 'off', legend: 'OFF', name: 'off', value: 0, command: `sim/magnetos/magnetos_off_${engine}`, confirm: true },
    { key: 'right', legend: 'R', name: 'right', value: 2, command: `sim/magnetos/magnetos_right_${engine}`, confirm: true },
    { key: 'left', legend: 'L', name: 'left', value: 1, command: `sim/magnetos/magnetos_left_${engine}`, confirm: true },
    { key: 'both', legend: 'BOTH', name: 'both', value: 3, command: `sim/magnetos/magnetos_both_${engine}`, confirm: true },
  ];
}

/** Held while cranking (spec §4.3). */
export function starterCommand(engine: number): string {
  return `sim/starters/engage_starter_${engine}`;
}
```

- [ ] **Step 4: Run the catalogue test**

Run: `npx jest tests/unit/domain/systems-controls.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the ten features to the profile (TDD)**

In `tests/unit/domain/aircraft-profile.test.ts`:
1. Add `import { ... } from '@/domain/systems/controls';` for the catalogue and feature ids.
2. Add a helper beside `cduKeysNames`:

```ts
  /** Every name the ten F-24 features declare, in declaration order, each once. */
  function systemsNames(): string[] {
    return [
      ...new Set(
        SYSTEMS_FEATURES.flatMap(
          (id) => findFeature(GENERIC_PROFILE, id)?.bindings.map((binding) => binding.name) ?? [],
        ),
      ),
    ].filter((name) => name !== GENERIC_DATAREFS.engineType);
  }
```
3. Append `...systemsNames()` to the end of the expected list in "lists every distinct name of the generic profile".
4. Append the ten ids (`...SYSTEMS_FEATURES`) to the expected feature order, and rename that test "declares the Stage 1 features, then the F-30, F-32 and F-24 features".
5. Replace every `'1.6.0'` with `'1.7.0'`.
6. Add a `describe('the F-24 systems features (profile 1.7.0)', …)` block:

```ts
describe('the F-24 systems features (profile 1.7.0)', () => {
  function bindings(id: string) {
    return findFeature(GENERIC_PROFILE, id)?.bindings ?? [];
  }

  it('declares 119 bindings over the ten features, 118 of them new names', () => {
    expect(SYSTEMS_FEATURES.reduce((sum, id) => sum + bindings(id).length, 0)).toBe(119);
    expect(systemsNames()).toHaveLength(118);
  });

  it('makes every binding optional except the parking brake, which is a required write', () => {
    for (const id of SYSTEMS_FEATURES) {
      for (const binding of bindings(id)) {
        expect({ id, name: binding.name, required: binding.required }).toEqual({
          id,
          name: binding.name,
          required: id === FEATURE_PARKING_BRAKE,
        });
      }
    }
    expect(bindings(FEATURE_PARKING_BRAKE)).toEqual([
      {
        kind: 'dataref',
        name: PARKING_BRAKE.ratio,
        required: true,
        write: true,
        purpose: 'Parking brake, written when you set or release it',
      },
    ]);
  });

  it('declares a shared per-engine DataRef once per feature', () => {
    for (const id of SYSTEMS_FEATURES) {
      const names = bindings(id).map((binding) => binding.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('binds each switch state, then its on and off commands', () => {
    expect(bindings(FEATURE_LIGHTS_EXTERIOR).map((binding) => [binding.kind, binding.name])).toEqual(
      EXTERIOR_LIGHTS.flatMap((light) => [
        ['dataref', light.state],
        ['command', light.on],
        ['command', light.off],
      ]),
    );
  });

  it('gives the engine start feature the count, type, key, starter and running state, then four engines of commands', () => {
    expect(bindings(FEATURE_ENGINE_START).map((binding) => binding.name)).toEqual([
      ENGINES.count,
      ENGINES.type,
      ENGINES.key,
      ENGINES.starter,
      ENGINES.running,
      ...ENGINE_NUMBERS.flatMap((engine) => [
        ...magnetoPositions(engine).map((position) => position.command),
        starterCommand(engine),
      ]),
    ]);
  });
});
```

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts` → FAIL (features missing, version 1.6.0).

Then in `src/domain/aircraft/profiles/generic.ts`:
- import the catalogue from `@/domain/systems/controls`;
- set `version: '1.7.0'`;
- add the builders below after `cduKeysFeature`;
- append the ten features to `features` (after `cduKeysFeature(2)`), in `SYSTEMS_FEATURES` order;
- extend the profile doc comment with one sentence: "The ten systems features (F-24) bind every name optionally, so a missing name costs only the control it backs (each control checks its own bindings, spec §4.1); the parking brake's one written DataRef is required."

```ts
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dataRef(name: string, purpose: string, write = false): BindingSpec {
  return write
    ? { kind: 'dataref', name, required: false, write: true, purpose }
    : { kind: 'dataref', name, required: false, purpose };
}

function command(name: string, purpose: string): BindingSpec {
  return { kind: 'command', name, required: false, purpose };
}

/** Per-engine controls share one array DataRef: keep each name once, its first purpose. */
function uniqueByName(bindings: readonly BindingSpec[]): BindingSpec[] {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    if (seen.has(binding.name)) {
      return false;
    }
    seen.add(binding.name);
    return true;
  });
}

function switchBindings(spec: SwitchSpec, statePurpose = `${capitalise(spec.name)} switch`) {
  return [
    dataRef(spec.state, statePurpose),
    command(spec.on, `${capitalise(spec.name)} on`),
    command(spec.off, `${capitalise(spec.name)} off`),
  ];
}

const SYSTEMS_FEATURE_SPECS: readonly FeatureSpec[] = [
  {
    id: FEATURE_LIGHTS_EXTERIOR,
    label: 'Exterior lights',
    bindings: EXTERIOR_LIGHTS.flatMap((light) => switchBindings(light)),
  },
  {
    id: FEATURE_LIGHTS_INTERIOR,
    label: 'Interior lights',
    bindings: DIMMERS.flatMap((dimmer) => [
      dataRef(dimmer.state, `${capitalise(dimmer.name)} brightness`),
      command(dimmer.down, `${capitalise(dimmer.name)} dimmer`),
      command(dimmer.up, `${capitalise(dimmer.name)} brighter`),
    ]),
  },
  {
    id: FEATURE_GEAR,
    label: 'Landing gear',
    bindings: [
      dataRef(GEAR.handle, 'Gear handle'),
      dataRef(GEAR.deployment, 'Gear position lights'),
      dataRef(GEAR.retractable, 'Whether the gear retracts'),
      command(GEAR.up, 'Gear up'),
      command(GEAR.down, 'Gear down'),
    ],
  },
  {
    id: FEATURE_FLAPS,
    label: 'Flaps',
    bindings: [
      dataRef(FLAPS.handle, 'Flap handle'),
      dataRef(FLAPS.position, 'Flap position'),
      dataRef(FLAPS.detents, 'Flap detents'),
      command(FLAPS.up, 'Flaps up one notch'),
      command(FLAPS.down, 'Flaps down one notch'),
    ],
  },
  {
    id: FEATURE_TRIM,
    label: 'Trim',
    bindings: [
      ...TRIMS.flatMap((trim) => [
        dataRef(trim.position, `${capitalise(trim.name)} position`),
        command(trim.decrease.command, `${capitalise(trim.name)} ${trim.decrease.name}`),
        command(trim.increase.command, `${capitalise(trim.name)} ${trim.increase.name}`),
        command(trim.set.command, capitalise(trim.set.sentence)),
      ]),
      dataRef(TAKEOFF_TRIM, 'Takeoff trim mark'),
    ],
  },
  {
    id: FEATURE_PARKING_BRAKE,
    label: 'Parking brake',
    bindings: [
      {
        kind: 'dataref',
        name: PARKING_BRAKE.ratio,
        required: true,
        write: true,
        purpose: 'Parking brake, written when you set or release it',
      },
    ],
  },
  {
    id: FEATURE_ANTI_ICE,
    label: 'Anti-ice',
    bindings: ANTI_ICE.flatMap((spec) => switchBindings(spec)),
  },
  {
    id: FEATURE_ELECTRICAL,
    label: 'Electrical',
    bindings: uniqueByName([
      ...switchBindings(BATTERY),
      ...switchBindings(AVIONICS_MASTER),
      ...ENGINE_NUMBERS.flatMap((engine) =>
        switchBindings(generatorSwitch(engine), 'Generator switches'),
      ),
    ]),
  },
  {
    id: FEATURE_FUEL,
    label: 'Fuel',
    bindings: uniqueByName([
      dataRef(FUEL_SELECTOR.state, 'Fuel selector'),
      dataRef(FUEL_SELECTOR.hasSelector, 'Whether the aircraft has a fuel selector'),
      dataRef(FUEL_SELECTOR.hasBoth, 'Whether the fuel selector has BOTH'),
      ...FUEL_SELECTOR.positions.map((position) =>
        command(position.command, `Fuel selector ${position.name}`),
      ),
      ...ENGINE_NUMBERS.flatMap((engine) =>
        switchBindings(fuelPumpSwitch(engine), 'Fuel pump switches'),
      ),
    ]),
  },
  {
    id: FEATURE_ENGINE_START,
    label: 'Engine start',
    bindings: [
      dataRef(ENGINES.count, 'Number of engines'),
      dataRef(ENGINES.type, 'Engine types'),
      dataRef(ENGINES.key, 'Magneto and key positions'),
      dataRef(ENGINES.starter, 'Starter engaged lights'),
      dataRef(ENGINES.running, 'Engine running lights'),
      ...ENGINE_NUMBERS.flatMap((engine) => [
        ...magnetoPositions(engine).map((position) =>
          command(position.command, `Magnetos ${engine} ${position.name}`),
        ),
        command(starterCommand(engine), `Starter ${engine}`),
      ]),
    ],
  },
];
```

Append `...SYSTEMS_FEATURE_SPECS` at the end of `GENERIC_PROFILE.features`. `ENGINES.type` is the same string as `GENERIC_DATAREFS.engineType`; `profileBindings` already dedupes it.

- [ ] **Step 6: Fix the version and command-count pins, then run the gate**

- `grep -rln "1\.6\.0" tests src` → replace `1.6.0` with `1.7.0` in each (compatibility screen, aircraft summary, diagnostics summary, aircraft-profile tests).
- `tests/unit/application/simulator-session.test.ts`: the re-check test counts `before + 162` commands; it becomes `before + 245`, and its comment gains "and the 83 systems commands added in 1.7.0".
- Run the full gate. Fix only what these changes broke.

- [ ] **Step 7: Commit**

```bash
git add src/domain/systems/controls.ts src/domain/aircraft/profiles/generic.ts tests
git commit -m "feat(systems): catalogue of verified names and profile 1.7.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Readouts and sentences

**Files:**
- Create: `src/domain/systems/readouts.ts`, `src/domain/systems/messages.ts`
- Test: `tests/unit/domain/systems-readouts.test.ts`, `tests/unit/domain/systems-messages.test.ts`

**Interfaces:**
- Consumes: `MAX_ENGINES`, `TrimAxis` from Task 1.
- Produces (exact):

```ts
// readouts.ts
export function numberAt(value: DataRefValue | undefined, index: number): number | null;
export function switchOn(value: DataRefValue | undefined, index: number): boolean | null;
export type GearLamp = 'down' | 'transit' | 'up';
export function gearLamps(deployment: DataRefValue | undefined): readonly GearLamp[] | null;
export function gearSummary(lamps: readonly GearLamp[] | null, handleDown: boolean | null): string;
export interface FlapReadout { label: string; spoken: string; moving: boolean; atUp: boolean; atFull: boolean }
export function flapReadout(handle: number | null, position: number | null, detents: number | null): FlapReadout | null;
export function flapsMoved(direction: 'up' | 'down', before: number, after: number | null): boolean;
export interface TrimReadout { percent: number; text: string; spoken: string }
export function trimReadout(axis: TrimAxis, name: string, value: number | null): TrimReadout | null;
export function trimAtLimit(value: number | null, direction: -1 | 1): boolean;
export const TRIM_TARGET_TOLERANCE = 0.01;
export function brightnessPercent(value: number | null): number | null;
export interface EngineColumn { engine: number; piston: boolean }
export function engineColumns(count: number | null, types: DataRefValue | undefined): { columns: EngineColumn[]; hidden: number };

// messages.ts
export function switchNotTaken(aircraft: string | null, name: string, wantedOn: boolean, nowOn: boolean | null): string;
export function gearNotTaken(aircraft: string | null, wantDown: boolean): string;
export function flapsNotTaken(aircraft: string | null, direction: 'up' | 'down'): string;
export function selectorNotTaken(aircraft: string | null, what: string, position: string): string;
export function dimmerNotTaken(aircraft: string | null, name: string): string;
export function parkingBrakeNotTaken(aircraft: string | null, set: boolean): string;
export function trimSetNotTaken(aircraft: string | null, sentence: string): string;
export function holdNoResponse(aircraft: string | null, phrase: string): string;
export function holdCapped(name: string, seconds: number, again: string): string;
export function holdLinkLost(name: string): string;
export function holdBackgrounded(name: string): string;
export function missingControls(aircraft: string | null, legends: readonly string[]): string;
export function unitUnavailable(unit: string, aircraft: string | null): string;
export const ENGINES_NOT_SHOWN: string;
```

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/systems-readouts.test.ts`:

```ts
import {
  brightnessPercent,
  engineColumns,
  flapReadout,
  flapsMoved,
  gearLamps,
  gearSummary,
  numberAt,
  switchOn,
  trimAtLimit,
  trimReadout,
} from '@/domain/systems/readouts';

describe('numberAt and switchOn', () => {
  it('reads a scalar at index 0 and an array at any index', () => {
    expect(numberAt(1, 0)).toBe(1);
    expect(numberAt(1, 1)).toBeNull();
    expect(numberAt([0, 1, 0], 1)).toBe(1);
    expect(numberAt([0], 3)).toBeNull();
    expect(numberAt('text', 0)).toBeNull();
    expect(numberAt(undefined, 0)).toBeNull();
    expect(numberAt(Number.NaN, 0)).toBeNull();
  });

  it('reads a switch as on above one half, unknown when there is no number', () => {
    expect(switchOn(1, 0)).toBe(true);
    expect(switchOn(0, 0)).toBe(false);
    expect(switchOn(0.75, 0)).toBe(true);
    expect(switchOn([0, 1], 1)).toBe(true);
    expect(switchOn(undefined, 0)).toBeNull();
  });
});

describe('gear lamps', () => {
  it('reads entries 0 to 2: down at 0.99 and above, up at 0.01 and below, transit between', () => {
    expect(gearLamps([1, 1, 1, 0, 0, 0, 0, 0, 0, 0])).toEqual(['down', 'down', 'down']);
    expect(gearLamps([0, 0.5, 0.995, 0, 0, 0, 0, 0, 0, 0])).toEqual(['up', 'transit', 'down']);
    expect(gearLamps([0.005, 0, 0])).toEqual(['up', 'up', 'up']);
  });

  it('gives no lamps without three numbers', () => {
    expect(gearLamps(undefined)).toBeNull();
    expect(gearLamps([1, 1])).toBeNull();
    expect(gearLamps(1)).toBeNull();
  });

  it('speaks three green, up, in transit with the green count, or the handle alone', () => {
    expect(gearSummary(['down', 'down', 'down'], true)).toBe('Gear down, three green');
    expect(gearSummary(['up', 'up', 'up'], false)).toBe('Gear up');
    expect(gearSummary(['down', 'transit', 'down'], true)).toBe('Gear in transit, two green');
    expect(gearSummary(['down', 'transit', 'transit'], true)).toBe('Gear in transit, one green');
    expect(gearSummary(['transit', 'transit', 'up'], false)).toBe('Gear in transit');
    expect(gearSummary(null, true)).toBe('Gear handle down');
    expect(gearSummary(null, false)).toBe('Gear handle up');
    expect(gearSummary(null, null)).toBe('Gear position unknown');
  });
});

describe('flap readout', () => {
  it('names the detent from the handle when the detent count is known', () => {
    expect(flapReadout(0, 0, 3)).toEqual({ label: 'UP', spoken: 'Flaps up', moving: false, atUp: true, atFull: false });
    expect(flapReadout(2 / 3, 2 / 3, 3)?.label).toBe('2 of 3');
    expect(flapReadout(2 / 3, 2 / 3, 3)?.spoken).toBe('Flaps 2 of 3');
    expect(flapReadout(1, 1, 3)).toEqual({ label: 'FULL', spoken: 'Flaps full', moving: false, atUp: false, atFull: true });
  });

  it('falls back to a percentage without a usable detent count', () => {
    expect(flapReadout(0.4, 0.4, null)?.label).toBe('40 %');
    expect(flapReadout(0.4, 0.4, 0)?.spoken).toBe('Flaps 40 percent');
    expect(flapReadout(0.4, 0.4, 2.5)?.label).toBe('40 %');
    expect(flapReadout(0, 0, null)?.label).toBe('UP');
  });

  it('says MOVING while the flaps lag the handle by more than 0.02', () => {
    const moving = flapReadout(2 / 3, 0.3, 3);
    expect(moving?.moving).toBe(true);
    expect(moving?.spoken).toBe('Flaps 2 of 3, moving');
    expect(flapReadout(2 / 3, 0.66, 3)?.moving).toBe(false);
    expect(flapReadout(2 / 3, null, 3)?.moving).toBe(false);
  });

  it('has no readout without a handle', () => {
    expect(flapReadout(null, 0.5, 3)).toBeNull();
  });

  it('counts a handle change in the pressed direction only', () => {
    expect(flapsMoved('down', 1 / 3, 2 / 3)).toBe(true);
    expect(flapsMoved('down', 1 / 3, 1 / 3)).toBe(false);
    expect(flapsMoved('up', 1 / 3, 0)).toBe(true);
    expect(flapsMoved('up', 1 / 3, 2 / 3)).toBe(false);
    expect(flapsMoved('up', 1 / 3, null)).toBe(false);
  });
});

describe('trim readout', () => {
  it('reads percent of the range with the direction in pilot words', () => {
    expect(trimReadout('pitch', 'pitch trim', 0.12)).toEqual({
      percent: 12,
      text: '12 % nose up',
      spoken: 'Pitch trim, 12 percent nose up',
    });
    expect(trimReadout('pitch', 'pitch trim', -0.5)?.text).toBe('50 % nose down');
    expect(trimReadout('roll', 'roll trim', -0.034)?.text).toBe('3 % left');
    expect(trimReadout('yaw', 'rudder trim', 0.2)?.spoken).toBe('Rudder trim, 20 percent right');
  });

  it('calls anything under 1 % centred', () => {
    expect(trimReadout('roll', 'roll trim', 0.004)).toEqual({
      percent: 0,
      text: 'centred',
      spoken: 'Roll trim centred',
    });
  });

  it('has no readout without a value', () => {
    expect(trimReadout('pitch', 'pitch trim', null)).toBeNull();
  });

  it('knows the end a hold drives toward', () => {
    expect(trimAtLimit(0.99, 1)).toBe(true);
    expect(trimAtLimit(0.99, -1)).toBe(false);
    expect(trimAtLimit(-1, -1)).toBe(true);
    expect(trimAtLimit(null, 1)).toBe(false);
  });
});

describe('brightness and engines', () => {
  it('rounds brightness to a percent', () => {
    expect(brightnessPercent(0.456)).toBe(46);
    expect(brightnessPercent(null)).toBeNull();
  });

  it('draws engines 1 to the count, at most four, one when the count is unusable', () => {
    expect(engineColumns(2, [1, 0, 4])).toEqual({
      columns: [
        { engine: 1, piston: true },
        { engine: 2, piston: true },
      ],
      hidden: 0,
    });
    expect(engineColumns(6, [5, 5, 5, 5, 5, 5]).columns.map((column) => column.engine)).toEqual([1, 2, 3, 4]);
    expect(engineColumns(6, undefined).hidden).toBe(2);
    expect(engineColumns(null, undefined)).toEqual({ columns: [{ engine: 1, piston: false }], hidden: 0 });
    expect(engineColumns(0, [0]).columns).toEqual([{ engine: 1, piston: true }]);
    expect(engineColumns(1, [2]).columns).toEqual([{ engine: 1, piston: false }]);
  });
});
```

`tests/unit/domain/systems-messages.test.ts`:

```ts
import {
  ENGINES_NOT_SHOWN,
  dimmerNotTaken,
  flapsNotTaken,
  gearNotTaken,
  holdBackgrounded,
  holdCapped,
  holdLinkLost,
  holdNoResponse,
  missingControls,
  parkingBrakeNotTaken,
  selectorNotTaken,
  switchNotTaken,
  trimSetNotTaken,
  unitUnavailable,
} from '@/domain/systems/messages';

describe('systems sentences', () => {
  it('names the aircraft, or says "this aircraft"', () => {
    expect(switchNotTaken('Cessna 172', 'beacon', true, false)).toBe(
      "The Cessna 172 didn't turn the beacon on. It's still off.",
    );
    expect(switchNotTaken(null, 'beacon', false, null)).toBe("This aircraft didn't turn the beacon off.");
  });

  it('explains gear held down on the ground', () => {
    expect(gearNotTaken('Baron 58', false)).toBe(
      "The Baron 58 didn't move the gear handle up. X-Plane keeps the gear down while the aircraft is on the ground.",
    );
    expect(gearNotTaken('Baron 58', true)).toBe("The Baron 58 didn't move the gear handle down.");
  });

  it('covers flaps, selectors, dimmers, the parking brake and set trim', () => {
    expect(flapsNotTaken('Cessna 172', 'down')).toBe("The Cessna 172 didn't move the flaps down.");
    expect(selectorNotTaken('Cessna 172', 'fuel selector', 'left')).toBe(
      "The Cessna 172 didn't set the fuel selector to left.",
    );
    expect(dimmerNotTaken(null, 'panel lights')).toBe("This aircraft didn't change the panel lights.");
    expect(parkingBrakeNotTaken('Cessna 172', false)).toBe("The Cessna 172 didn't release the parking brake.");
    expect(trimSetNotTaken('Cessna 172', 'set takeoff trim')).toBe("The Cessna 172 didn't set takeoff trim.");
  });

  it('words every way a hold can end badly', () => {
    expect(holdNoResponse('Cessna 172', 'move the pitch trim')).toBe("The Cessna 172 didn't move the pitch trim.");
    expect(holdCapped('pitch trim', 10, 'Press again to keep trimming.')).toBe(
      'Pitch trim stopped after 10 seconds. Press again to keep trimming.',
    );
    expect(holdLinkLost('pitch trim')).toBe('Pitch trim released: the connection to X-Plane dropped.');
    expect(holdBackgrounded('starter 1')).toBe('Starter 1 released: Avionix left the foreground.');
  });

  it('lists missing controls and unavailable units', () => {
    expect(missingControls('Cessna 172', ['STROBE', 'TAXI'])).toBe('Not available on the Cessna 172: STROBE, TAXI.');
    expect(missingControls(null, ['GEN'])).toBe('Not available on this aircraft: GEN.');
    expect(unitUnavailable('Anti-ice', 'Cessna 172')).toBe("Anti-ice isn't available on the Cessna 172.");
    expect(ENGINES_NOT_SHOWN).toBe("Engines 5 and up aren't shown.");
  });
});
```

Run both: FAIL (modules missing).

- [ ] **Step 2: Implement `readouts.ts`**

```ts
import type { DataRefValue } from '@/domain/simulator/types';
import { MAX_ENGINES, type TrimAxis } from '@/domain/systems/controls';

/** Element `index` of an array value, or the scalar itself at index 0, when it is a finite number. */
export function numberAt(value: DataRefValue | undefined, index: number): number | null {
  const candidate = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

/** On above one half: switches are 0/1 ints, the parking brake a 0..1 ratio. Null when unknown. */
export function switchOn(value: DataRefValue | undefined, index: number): boolean | null {
  const reading = numberAt(value, index);
  return reading === null ? null : reading > 0.5;
}

export type GearLamp = 'down' | 'transit' | 'up';

const GEAR_LAMPS = 3;
const DOWN_AT = 0.99;
const UP_AT = 0.01;

/** The three lamps from `deploy_ratio` entries 0–2 (spec §4.6); null unless all three are numbers. */
export function gearLamps(deployment: DataRefValue | undefined): readonly GearLamp[] | null {
  if (!Array.isArray(deployment)) {
    return null;
  }
  const lamps: GearLamp[] = [];
  for (let index = 0; index < GEAR_LAMPS; index += 1) {
    const ratio = numberAt(deployment, index);
    if (ratio === null) {
      return null;
    }
    lamps.push(ratio >= DOWN_AT ? 'down' : ratio <= UP_AT ? 'up' : 'transit');
  }
  return lamps;
}

const COUNT_WORDS = ['no', 'one', 'two', 'three'];

/** What a screen reader hears for the gear unit. */
export function gearSummary(lamps: readonly GearLamp[] | null, handleDown: boolean | null): string {
  if (lamps === null) {
    return handleDown === null ? 'Gear position unknown' : `Gear handle ${handleDown ? 'down' : 'up'}`;
  }
  const green = lamps.filter((lamp) => lamp === 'down').length;
  if (green === lamps.length) {
    return `Gear down, ${COUNT_WORDS[green] ?? green} green`;
  }
  if (lamps.every((lamp) => lamp === 'up')) {
    return 'Gear up';
  }
  return green === 0 ? 'Gear in transit' : `Gear in transit, ${COUNT_WORDS[green] ?? green} green`;
}

export interface FlapReadout {
  /** In the window: "UP", "2 of 3", "FULL" or "40 %". */
  label: string;
  spoken: string;
  /** The flaps lag the handle. */
  moving: boolean;
  atUp: boolean;
  atFull: boolean;
}

const FLAP_END = 0.005;
const FLAP_LAG = 0.02;
const MAX_DETENTS = 20;

/** The handle's detent (handle × detents, rounded), or a percentage without a usable count. */
export function flapReadout(
  handle: number | null,
  position: number | null,
  detents: number | null,
): FlapReadout | null {
  if (handle === null) {
    return null;
  }
  const atUp = handle <= FLAP_END;
  const atFull = handle >= 1 - FLAP_END;
  const usableDetents =
    detents !== null && Number.isInteger(detents) && detents >= 1 && detents <= MAX_DETENTS
      ? detents
      : null;
  let label: string;
  let spoken: string;
  if (usableDetents !== null) {
    const notch = Math.round(handle * usableDetents);
    label = notch === 0 ? 'UP' : notch === usableDetents ? 'FULL' : `${notch} of ${usableDetents}`;
    spoken = notch === 0 ? 'Flaps up' : notch === usableDetents ? 'Flaps full' : `Flaps ${label}`;
  } else {
    const percent = Math.round(handle * 100);
    label = atUp ? 'UP' : atFull ? 'FULL' : `${percent} %`;
    spoken = atUp ? 'Flaps up' : atFull ? 'Flaps full' : `Flaps ${percent} percent`;
  }
  const moving = position !== null && Math.abs(position - handle) > FLAP_LAG;
  return { label, spoken: moving ? `${spoken}, moving` : spoken, moving, atUp, atFull };
}

const HANDLE_STEP = 0.001;

/** Read-back for a flap notch: the handle moved in the pressed direction. */
export function flapsMoved(direction: 'up' | 'down', before: number, after: number | null): boolean {
  if (after === null) {
    return false;
  }
  return direction === 'down' ? after > before + HANDLE_STEP : after < before - HANDLE_STEP;
}

export interface TrimReadout {
  percent: number;
  text: string;
  spoken: string;
}

const DIRECTION_WORDS: Record<TrimAxis, { negative: string; positive: string }> = {
  pitch: { negative: 'nose down', positive: 'nose up' },
  roll: { negative: 'left', positive: 'right' },
  yaw: { negative: 'left', positive: 'right' },
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Percent of the trim range, with the direction in the pilot's words; under 1 % is centred. */
export function trimReadout(axis: TrimAxis, name: string, value: number | null): TrimReadout | null {
  if (value === null) {
    return null;
  }
  const percent = Math.round(Math.abs(value) * 100);
  if (percent < 1) {
    return { percent: 0, text: 'centred', spoken: `${capitalise(name)} centred` };
  }
  const words = DIRECTION_WORDS[axis];
  const direction = value > 0 ? words.positive : words.negative;
  return {
    percent,
    text: `${percent} % ${direction}`,
    spoken: `${capitalise(name)}, ${percent} percent ${direction}`,
  };
}

const TRIM_LIMIT = 0.98;

/** Trim already at the end a hold drives toward: not moving is then not a failure. */
export function trimAtLimit(value: number | null, direction: -1 | 1): boolean {
  return value !== null && value * direction >= TRIM_LIMIT;
}

/** A set command (T/O, CTR) counts as done within this of its target. */
export const TRIM_TARGET_TOLERANCE = 0.01;

export function brightnessPercent(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
}

export interface EngineColumn {
  /** 1-based. */
  engine: number;
  /** `acf_en_type` 0 or 1: the only engines with magnetos. Unknown type is not piston. */
  piston: boolean;
}

/**
 * Engines 1..min(count, MAX_ENGINES) (spec §4.6). A missing, fractional or non-positive count
 * draws one column; `hidden` is how many engines past MAX_ENGINES are not drawn.
 */
export function engineColumns(
  count: number | null,
  types: DataRefValue | undefined,
): { columns: EngineColumn[]; hidden: number } {
  const engines = count !== null && Number.isInteger(count) && count >= 1 ? count : 1;
  const drawn = Math.min(engines, MAX_ENGINES);
  const columns: EngineColumn[] = [];
  for (let engine = 1; engine <= drawn; engine += 1) {
    const type = numberAt(types, engine - 1);
    columns.push({ engine, piston: type === 0 || type === 1 });
  }
  return { columns, hidden: engines - drawn };
}
```

- [ ] **Step 3: Implement `messages.ts`**

```ts
/**
 * Every sentence the Systems panel shows (R10): plain words, the aircraft named when known, never a
 * name, id or code. `aircraft` is X-Plane's description of the loaded aircraft, or null.
 */

function subject(aircraft: string | null): string {
  return aircraft === null ? 'This aircraft' : `The ${aircraft}`;
}

function object(aircraft: string | null): string {
  return aircraft === null ? 'this aircraft' : `the ${aircraft}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function switchNotTaken(
  aircraft: string | null,
  name: string,
  wantedOn: boolean,
  nowOn: boolean | null,
): string {
  const first = `${subject(aircraft)} didn't turn the ${name} ${wantedOn ? 'on' : 'off'}.`;
  return nowOn === null ? first : `${first} It's still ${nowOn ? 'on' : 'off'}.`;
}

export function gearNotTaken(aircraft: string | null, wantDown: boolean): string {
  const first = `${subject(aircraft)} didn't move the gear handle ${wantDown ? 'down' : 'up'}.`;
  return wantDown
    ? first
    : `${first} X-Plane keeps the gear down while the aircraft is on the ground.`;
}

export function flapsNotTaken(aircraft: string | null, direction: 'up' | 'down'): string {
  return `${subject(aircraft)} didn't move the flaps ${direction}.`;
}

export function selectorNotTaken(aircraft: string | null, what: string, position: string): string {
  return `${subject(aircraft)} didn't set the ${what} to ${position}.`;
}

export function dimmerNotTaken(aircraft: string | null, name: string): string {
  return `${subject(aircraft)} didn't change the ${name}.`;
}

export function parkingBrakeNotTaken(aircraft: string | null, set: boolean): string {
  return `${subject(aircraft)} didn't ${set ? 'set' : 'release'} the parking brake.`;
}

export function trimSetNotTaken(aircraft: string | null, sentence: string): string {
  return `${subject(aircraft)} didn't ${sentence}.`;
}

/** A hold of at least a second that X-Plane never acted on ("move the pitch trim", "engage starter 1"). */
export function holdNoResponse(aircraft: string | null, phrase: string): string {
  return `${subject(aircraft)} didn't ${phrase}.`;
}

export function holdCapped(name: string, seconds: number, again: string): string {
  return `${capitalise(name)} stopped after ${seconds} seconds. ${again}`;
}

export function holdLinkLost(name: string): string {
  return `${capitalise(name)} released: the connection to X-Plane dropped.`;
}

export function holdBackgrounded(name: string): string {
  return `${capitalise(name)} released: Avionix left the foreground.`;
}

/** One line per unit naming every control that is not drawn or is disabled (S3). */
export function missingControls(aircraft: string | null, legends: readonly string[]): string {
  return `Not available on ${object(aircraft)}: ${legends.join(', ')}.`;
}

export function unitUnavailable(unit: string, aircraft: string | null): string {
  return `${unit} isn't available on ${object(aircraft)}.`;
}

export const ENGINES_NOT_SHOWN = "Engines 5 and up aren't shown.";
```

- [ ] **Step 4: Run the tests and the gate**

Run: `npx jest tests/unit/domain/systems-readouts.test.ts tests/unit/domain/systems-messages.test.ts` → PASS. Then the full gate.

- [ ] **Step 5: Commit**

```bash
git add src/domain/systems tests/unit/domain/systems-readouts.test.ts tests/unit/domain/systems-messages.test.ts
git commit -m "feat(systems): readouts and plain-language sentences

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: HoldLease

**Files:**
- Create: `src/domain/panels/hold-lease.ts`
- Test: `tests/unit/domain/hold-lease.test.ts`

**Interfaces produced:**

```ts
export const HOLD_LEASE_SEC = 0.5;
export const HOLD_RENEW_MS = 200;
export const HOLD_MIN_MS = 250;
export const TRIM_HOLD_CAP_MS = 10_000;
export const STARTER_HOLD_CAP_MS = 30_000;
/** A hold at least this long that moved nothing is reported (spec §4.3). */
export const RESPONSE_CHECK_MS = 1000;
export type HoldPhase = 'press' | 'renew' | 'release';
export type HoldEnd = 'released' | 'capped' | 'cancelled' | 'failed' | 'refused';
export interface HoldTimers { now(): number; setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }
export const realHoldTimers: HoldTimers;
export interface HoldLeaseOptions {
  send: (phase: HoldPhase) => Promise<ActivationResult>;
  capMs: number;
  onEnd: (end: HoldEnd, heldMs: number) => void;
  timers?: HoldTimers;
}
export class HoldLease {
  constructor(options: HoldLeaseOptions);
  get held(): boolean;
  press(): void;
  release(): void;
  cancel(): void;
}
```

- [ ] **Step 1: Write the failing test**

```ts
import type { ActivationResult } from '@/domain/panels/activation';
import {
  HOLD_MIN_MS,
  HOLD_RENEW_MS,
  type HoldEnd,
  HoldLease,
  type HoldPhase,
  type HoldTimers,
} from '@/domain/panels/hold-lease';

/** Manual clock: `advance` fires due timers in time order. */
function fakeTimers(): HoldTimers & { advance: (ms: number) => Promise<void>; pending: () => number } {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    setTimeout: (callback, ms) => {
      nextId += 1;
      timers.set(nextId, { at: now + ms, callback });
      return nextId;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
    pending: () => timers.size,
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) {
          break;
        }
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = end;
    },
  };
}

function setup(results: Partial<Record<HoldPhase, ActivationResult>> = {}, capMs = 10_000) {
  const timers = fakeTimers();
  const sent: HoldPhase[] = [];
  const ends: Array<[HoldEnd, number]> = [];
  const lease = new HoldLease({
    send: async (phase) => {
      sent.push(phase);
      return results[phase] ?? 'ok';
    },
    capMs,
    onEnd: (end, heldMs) => ends.push([end, heldMs]),
    timers,
  });
  return { lease, timers, sent, ends };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('HoldLease (spec §4.3)', () => {
  it('presses, renews every 200 ms while held, and releases at once on let go', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.press();
    expect(lease.held).toBe(true);
    await timers.advance(HOLD_RENEW_MS * 3);
    expect(sent).toEqual(['press', 'renew', 'renew', 'renew']);
    lease.release();
    await flush();
    expect(sent.at(-1)).toBe('release');
    expect(ends).toEqual([['released', 600]]);
    expect(lease.held).toBe(false);
    expect(timers.pending()).toBe(0);
  });

  it('holds a tap for the 250 ms minimum before releasing', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.press();
    await timers.advance(50);
    lease.release();
    expect(sent).toEqual(['press']);
    await timers.advance(HOLD_MIN_MS);
    expect(sent).toEqual(['press', 'renew', 'release']);
    expect(ends).toEqual([['released', HOLD_MIN_MS]]);
  });

  it('releases even when the finger lifts before the press is answered', async () => {
    const timers = fakeTimers();
    const sent: HoldPhase[] = [];
    let answerPress: (result: ActivationResult) => void = () => undefined;
    const ends: HoldEnd[] = [];
    const lease = new HoldLease({
      send: (phase) => {
        sent.push(phase);
        return phase === 'press'
          ? new Promise<ActivationResult>((resolve) => {
              answerPress = resolve;
            })
          : Promise.resolve('ok');
      },
      capMs: 10_000,
      onEnd: (end) => ends.push(end),
      timers,
    });
    lease.press();
    await timers.advance(HOLD_MIN_MS);
    lease.release();
    expect(sent.at(-1)).toBe('release');
    answerPress('ok');
    await timers.advance(1000);
    expect(sent.filter((phase) => phase === 'renew')).toHaveLength(1);
    expect(ends).toEqual(['released']);
  });

  it('ends at the cap with a release', async () => {
    const { lease, timers, sent, ends } = setup({}, 1000);
    lease.press();
    await timers.advance(1000);
    expect(sent.at(-1)).toBe('release');
    expect(ends).toEqual([['capped', 1000]]);
    expect(lease.held).toBe(false);
    await timers.advance(1000);
    expect(sent.at(-1)).toBe('release');
  });

  it('ends on a failed or refused press or renewal, still sending a release', async () => {
    const failedPress = setup({ press: 'failed' });
    failedPress.lease.press();
    await flush();
    expect(failedPress.ends).toEqual([['failed', 0]]);
    expect(failedPress.sent).toEqual(['press', 'release']);

    const refusedRenew = setup({ renew: 'refused' });
    refusedRenew.lease.press();
    await refusedRenew.timers.advance(HOLD_RENEW_MS);
    expect(refusedRenew.ends).toEqual([['refused', HOLD_RENEW_MS]]);
    expect(refusedRenew.sent).toEqual(['press', 'renew', 'release']);
    await refusedRenew.timers.advance(1000);
    expect(refusedRenew.sent).toHaveLength(3);
  });

  it('cancels at once, without waiting for the minimum', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.press();
    await timers.advance(10);
    lease.cancel();
    expect(sent).toEqual(['press', 'release']);
    expect(ends).toEqual([['cancelled', 10]]);
    expect(timers.pending()).toBe(0);
  });

  it('ignores a second press while held and a release or cancel while idle', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.release();
    lease.cancel();
    lease.press();
    lease.press();
    await flush();
    expect(sent).toEqual(['press']);
    lease.release();
    lease.release();
    await timers.advance(HOLD_MIN_MS);
    expect(sent.filter((phase) => phase === 'release')).toHaveLength(1);
    expect(ends).toHaveLength(1);
  });

  it('treats a send that throws as failed', async () => {
    const timers = fakeTimers();
    const ends: HoldEnd[] = [];
    const lease = new HoldLease({
      send: async (phase) => {
        if (phase === 'press') {
          throw new Error('boom');
        }
        return 'ok';
      },
      capMs: 10_000,
      onEnd: (end) => ends.push(end),
      timers,
    });
    lease.press();
    await flush();
    expect(ends).toEqual(['failed']);
  });
});
```

Run: FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
import type { ActivationResult } from '@/domain/panels/activation';

/** Seconds X-Plane keeps a held command active after the last renewal (spec §4.3, S4). */
export const HOLD_LEASE_SEC = 0.5;
/** Renewal period: well inside the lease, so one slow frame never lets a held command lapse. */
export const HOLD_RENEW_MS = 200;
/** The shortest hold: a tap, or a screen reader's activation, moves by this much. */
export const HOLD_MIN_MS = 250;
export const TRIM_HOLD_CAP_MS = 10_000;
export const STARTER_HOLD_CAP_MS = 30_000;
/** A hold at least this long that moved nothing is reported (spec §4.3). */
export const RESPONSE_CHECK_MS = 1000;

export type HoldPhase = 'press' | 'renew' | 'release';

/** Why a hold ended: let go, the cap, cancelled by the panel, or a press or renewal not taken. */
export type HoldEnd = 'released' | 'capped' | 'cancelled' | 'failed' | 'refused';

export interface HoldTimers {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realHoldTimers: HoldTimers = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface HoldLeaseOptions {
  /** Never expected to reject; a rejection counts as `failed`. */
  send: (phase: HoldPhase) => Promise<ActivationResult>;
  capMs: number;
  onEnd: (end: HoldEnd, heldMs: number) => void;
  timers?: HoldTimers;
}

/**
 * One hold control's lease on a held X-Plane command (R4, R5, S4). `press` sends the command with
 * a 0.5 s lease and renews it every 200 ms; `release` ends it (after HOLD_MIN_MS at the earliest,
 * so a tap is a fixed nudge); `cancel` ends it now. Every end sends a release, best effort: if the
 * link is gone the lease lapses in X-Plane by itself within 0.5 s, which is the safety this class
 * exists for. A late answer from an earlier hold never touches a later one (`generation`).
 */
export class HoldLease {
  private holding = false;
  private generation = 0;
  private startedAt = 0;
  private renewTimer: unknown = null;
  private capTimer: unknown = null;
  private releaseTimer: unknown = null;
  private readonly timers: HoldTimers;

  constructor(private readonly options: HoldLeaseOptions) {
    this.timers = options.timers ?? realHoldTimers;
  }

  get held(): boolean {
    return this.holding;
  }

  press(): void {
    if (this.holding) {
      return;
    }
    this.holding = true;
    this.generation += 1;
    const generation = this.generation;
    this.startedAt = this.timers.now();
    this.capTimer = this.timers.setTimeout(() => this.finish('capped'), this.options.capMs);
    this.renewTimer = this.timers.setTimeout(() => this.renew(generation), HOLD_RENEW_MS);
    void this.sendFor(generation, 'press');
  }

  release(): void {
    if (!this.holding || this.releaseTimer !== null) {
      return;
    }
    const remaining = HOLD_MIN_MS - (this.timers.now() - this.startedAt);
    if (remaining > 0) {
      this.releaseTimer = this.timers.setTimeout(() => {
        this.releaseTimer = null;
        this.finish('released');
      }, remaining);
      return;
    }
    this.finish('released');
  }

  cancel(): void {
    this.finish('cancelled');
  }

  private renew(generation: number): void {
    if (!this.holding || generation !== this.generation) {
      return;
    }
    this.renewTimer = this.timers.setTimeout(() => this.renew(generation), HOLD_RENEW_MS);
    void this.sendFor(generation, 'renew');
  }

  private async sendFor(generation: number, phase: 'press' | 'renew'): Promise<void> {
    let result: ActivationResult;
    try {
      result = await this.options.send(phase);
    } catch {
      result = 'failed';
    }
    if (result !== 'ok' && this.holding && generation === this.generation) {
      this.finish(result);
    }
  }

  private finish(end: HoldEnd): void {
    if (!this.holding) {
      return;
    }
    this.holding = false;
    for (const timer of [this.renewTimer, this.capTimer, this.releaseTimer]) {
      if (timer !== null) {
        this.timers.clearTimeout(timer);
      }
    }
    this.renewTimer = null;
    this.capTimer = null;
    this.releaseTimer = null;
    const heldMs = this.timers.now() - this.startedAt;
    void this.options.send('release').catch(() => undefined);
    this.options.onEnd(end, heldMs);
  }
}
```

- [ ] **Step 3: Run test and gate; commit**

```bash
git add src/domain/panels/hold-lease.ts tests/unit/domain/hold-lease.test.ts
git commit -m "feat(panels): HoldLease, a renewed short lease on a held command

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Holding a command end to end (client, session, panel actions, mock)

**Files:**
- Modify: `src/domain/simulator/simulator-client.ts`, `src/infrastructure/xplane/xplane-client.ts`
- Modify: `src/application/simulator-session.ts`, `src/app/services-context.tsx`
- Modify: `src/hooks/useSimulatorSession.ts`, `src/features/panels/primitives/PanelContext.tsx`, `src/features/panels/primitives/PanelFrame.tsx`, `src/features/shell/AppShell.tsx`
- Modify: `tests/mock-xplane/mock-xplane-server.ts` (holds only; the toy aircraft is Task 8)
- Modify: every test fake of `SessionApi` (`grep -rln "recheckCompatibility: jest.fn" tests`): add `holdCommand: jest.fn(async () => 'ok' as const)`; `FakeClient` in `tests/unit/application/simulator-session.test.ts`: add `setCommandActive = jest.fn(async () => undefined)`
- Test: `tests/unit/application/simulator-session.test.ts` (new describe), `tests/integration/xplane-client.test.ts` (new case), `tests/integration/mock-xplane-server.test.ts` (new case), `tests/ui/panel-primitives.test.tsx` (PanelScope default hold)

**Interfaces:**
- Consumes: `HoldPhase`, `HOLD_LEASE_SEC` (Task 3), `ActivationResult`.
- Produces:

```ts
// SimulatorClient
setCommandActive(id: number, active: boolean, durationSeconds?: number): Promise<void>;
// SimulatorSession
holdCommand(featureId: string, name: string, phase: HoldPhase, leaseSec?: number): Promise<ActivationResult>;
// SessionApi gains 'holdCommand'
// PanelContext.tsx
export interface PanelActions {
  write: …; activate: …;
  hold: (featureId: string, name: string, phase: HoldPhase) => Promise<ActivationResult>;
}
/** What a PanelScope or PanelFrame is given: without `hold`, every hold is refused. */
export type PanelScopeActions = Omit<PanelActions, 'hold'> & Partial<Pick<PanelActions, 'hold'>>;
export const REFUSE_HOLD: PanelActions['hold'];
// PanelContextValue extends PanelActions (so `hold` is always present for consumers)
// MockXPlaneServer
readonly holdMessages: Array<{ id: number; isActive: boolean; duration: number | null }>;
heldCommandNames(): string[]; // commands whose hold is active now (lease not lapsed)
```

- [ ] **Step 1: Client (TDD)**

In `tests/integration/xplane-client.test.ts` add, beside the existing WebSocket command cases:

```ts
  it('holds a command with a lease and releases it over the WebSocket', async () => {
    // (use the file's existing client/server setup helpers)
    await client.connectWebSocket();
    const command = await client.findCommand('sim/autopilot/heading_up');
    await client.setCommandActive(command!.id, true, 0.5);
    await client.setCommandActive(command!.id, false);
    expect(server.holdMessages).toEqual([
      { id: command!.id, isActive: true, duration: 0.5 },
      { id: command!.id, isActive: false, duration: null },
    ]);
  });
```

Port (`simulator-client.ts`), after `activateCommand`:

```ts
  /**
   * Holds (`active`) or releases a command over the WebSocket (`command_set_is_active`). With
   * `durationSeconds`, X-Plane releases it by itself after that long: the lease a held control
   * renews (spec F-24 §4.3). X-Plane also releases every hold of a socket that closes.
   */
  setCommandActive(id: number, active: boolean, durationSeconds?: number): Promise<void>;
```

`XPlaneClient`, after `activateCommand`:

```ts
  async setCommandActive(id: number, active: boolean, durationSeconds?: number): Promise<void> {
    const command: Record<string, unknown> = { id, is_active: active };
    if (active && durationSeconds !== undefined) {
      command.duration = durationSeconds;
    }
    try {
      await this.requireSocket().send('command_set_is_active', { commands: [command] });
    } catch (error) {
      throw wrap(error, 'COMMAND_FAILED', `Holding command ${id} failed`);
    }
  }
```

(`requireSocket()` throws synchronously; inside the `try` it is wrapped like `subscribeDataRefs`.)

Mock (`mock-xplane-server.ts`): replace the `command_set_is_active` case body with:

```ts
      case 'command_set_is_active': {
        const list = Array.isArray(params.commands) ? params.commands : [];
        for (const item of list) {
          if (!isRecord(item) || typeof item.id !== 'number') {
            continue;
          }
          if (!this.commands.has(item.id)) {
            reply({
              success: false,
              error_code: 'invalid_command_id',
              error_message: `Command ${item.id} doesn't exist`,
            });
            return;
          }
          const duration = typeof item.duration === 'number' ? item.duration : null;
          const isActive = item.is_active === true;
          if (isActive && duration === 0) {
            // Press and release: a momentary activation, as before F-24.
            this.activations.push({ id: item.id, duration: 0 });
            this.applyCommand(item.id);
            continue;
          }
          this.holdMessages.push({ id: item.id, isActive, duration });
          this.setHeld(ws, item.id, isActive ? duration : null, isActive);
        }
        reply({ success: true });
        return;
      }
```

and add to the class:

```ts
  /** Every hold message (`command_set_is_active` other than a zero-duration press), in order. */
  readonly holdMessages: Array<{ id: number; isActive: boolean; duration: number | null }> = [];

  /** Active holds per socket: command id → when its lease lapses (null: held until released). */
  private readonly holds = new Map<WsSocket, Map<number, number | null>>();

  private setHeld(ws: WsSocket, id: number, durationSec: number | null, active: boolean): void {
    let held = this.holds.get(ws);
    if (held === undefined) {
      held = new Map();
      this.holds.set(ws, held);
    }
    if (!active) {
      held.delete(id);
      return;
    }
    held.set(id, durationSec === null ? null : Date.now() + durationSec * 1000);
  }

  /** Names of the commands held right now, leases checked against the clock. */
  heldCommandNames(): string[] {
    const now = Date.now();
    const names = new Set<string>();
    for (const held of this.holds.values()) {
      for (const [id, until] of held) {
        if (until === null || until > now) {
          const name = this.commands.get(id)?.name;
          if (name !== undefined) {
            names.add(name);
          }
        }
      }
    }
    return [...names].sort();
  }
```

`ws` must be in scope in the message handler (it is the socket the message came from; follow how `reply` is built). In the existing `ws.on('close', …)` handler add `this.holds.delete(ws);` — X-Plane clears a closed socket's holds. Add a mock test in `tests/integration/mock-xplane-server.test.ts`: a hold with duration 0.2 shows in `heldCommandNames()` at once and not after 300 ms; an open hold is cleared by `{is_active: false}` and by closing the socket; a zero-duration `command_set_is_active` still lands in `activations`.

- [ ] **Step 2: Session (TDD)**

In `tests/unit/application/simulator-session.test.ts` add `setCommandActive = jest.fn(async (_id: number, _active: boolean, _duration?: number) => undefined);` to `FakeClient` and a describe block using the file's existing connect helpers (the activate tests show how a connected session with a resolved command is set up; use a command of `FEATURE_TRIM`, e.g. `TRIMS[0].increase.command`, and make the fake resolve it):

```ts
describe('holding a command (F-24 §4.3)', () => {
  it('presses with a lease, renews and releases on the same connection', async () => {
    // connected session, trim command resolved
    expect(await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'press')).toBe('ok');
    expect(await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'renew')).toBe('ok');
    expect(await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'release')).toBe('ok');
    expect(client.setCommandActive.mock.calls).toEqual([
      [COMMAND_ID, true, 0.5],
      [COMMAND_ID, true, 0.5],
      [COMMAND_ID, false, undefined],
    ]);
  });

  it('records the press once and never a renewal, so a held key does not churn the store', async () => {
    const listener = jest.fn();
    session.store.subscribe(listener);
    await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'press');
    const afterPress = listener.mock.calls.length;
    await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'renew');
    await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'renew');
    await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'release');
    expect(listener.mock.calls.length).toBe(afterPress);
    expect(session.store.getSnapshot().operations[PITCH_UP]?.status).toBe('ok');
  });

  it('refuses a renewal or release without a press on this connection', async () => {
    expect(await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'renew')).toBe('refused');
    expect(await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'release')).toBe('refused');
    expect(client.setCommandActive).not.toHaveBeenCalled();
  });

  it('refuses a renewal after the socket dropped and the session reconnected (R5)', async () => {
    await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'press');
    // drop the socket (the file's close helper), let the scheduler reconnect on a second client
    expect(await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'renew')).toBe('refused');
    expect(secondClient.setCommandActive).not.toHaveBeenCalled();
  });

  it('refuses a press like activate: not connected, unresolved or unusable', async () => {
    // not connected → 'refused' with refusal 'notConnected'; unresolved name → 'unavailable'
  });

  it('records a failed press or renewal and forgets the hold', async () => {
    client.setCommandActive.mockRejectedValueOnce(new Error('socket gone'));
    expect(await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'press')).toBe('failed');
    expect(session.store.getSnapshot().operations[PITCH_UP]?.failure?.code).toBe('COMMAND_FAILED');
    expect(await session.holdCommand(FEATURE_TRIM, PITCH_UP, 'renew')).toBe('refused');
  });
});
```

Fill the two placeholder bodies with the same setup the file's `activate` refusal tests use; every case must assert something.

Implementation in `SimulatorSession` (import `HOLD_LEASE_SEC`, `HoldPhase` from `@/domain/panels/hold-lease`):

```ts
  /** Command name → the connection generation its hold was pressed on (F-24 §4.3). */
  private readonly holds = new Map<string, number>();

  /**
   * Presses, renews or releases a held command binding of `featureId` (F-24 §4.3). `press` and
   * `renew` keep it active for `leaseSec`; X-Plane lets it lapse by itself after that, which is
   * what stops trim if this phone goes silent. Never rejects. A press is refused and recorded as
   * `activate`'s is, and its success is recorded once; a renewal or release records only a
   * failure, because a held key renews five times a second and the store must not churn the
   * panel at that rate. A renewal or release belongs to the connection its press was made on:
   * after a reconnect it is refused (R5: a hold never resumes).
   */
  async holdCommand(
    featureId: string,
    name: string,
    phase: HoldPhase,
    leaseSec = HOLD_LEASE_SEC,
  ): Promise<ActivationResult> {
    const epoch = this.operationsEpoch;
    if (phase !== 'press') {
      const active = this.active;
      const pressedOn = this.holds.get(name);
      if (phase === 'release') {
        this.holds.delete(name);
      }
      const command = active?.commandsByName.get(name);
      if (
        active === null ||
        command === undefined ||
        pressedOn !== active.generation ||
        this.store.getSnapshot().state !== 'connected'
      ) {
        return 'refused';
      }
      try {
        await (phase === 'renew'
          ? active.client.setCommandActive(command.id, true, leaseSec)
          : active.client.setCommandActive(command.id, false));
        return 'ok';
      } catch (error) {
        this.holds.delete(name);
        if (phase === 'renew') {
          this.recordFailure(
            epoch,
            name,
            toAvionixError(error, { code: 'COMMAND_FAILED', message: 'Command failed' }),
          );
        }
        return 'failed';
      }
    }
    const active = this.connectedOrRefuse(epoch, name);
    if (active === null) {
      return 'refused';
    }
    const binding = findFeature(active.profile, featureId)?.bindings.find(
      (candidate) => candidate.kind === 'command' && candidate.name === name,
    );
    const command = binding === undefined ? undefined : active.commandsByName.get(name);
    const resolvedOk = this.store.getSnapshot().compatibility.bindings[name]?.status === 'ok';
    if (command === undefined || !resolvedOk || !this.featureUsable(featureId)) {
      this.refuse(epoch, name, 'unavailable');
      return 'refused';
    }
    this.holds.set(name, active.generation);
    try {
      await this.timed(active.generation, () =>
        active.client.setCommandActive(command.id, true, leaseSec),
      );
      this.recordOutcome(epoch, name, { status: 'ok', failure: null, refusal: null });
      return 'ok';
    } catch (error) {
      this.holds.delete(name);
      this.recordFailure(
        epoch,
        name,
        toAvionixError(error, { code: 'COMMAND_FAILED', message: 'Command failed' }),
      );
      return 'failed';
    }
  }
```

Add `'holdCommand'` to `SessionApi` in `services-context.tsx`, and `holdCommand: jest.fn(async () => 'ok' as const)` to every session fake (`grep -rln "recheckCompatibility: jest.fn" tests`).

- [ ] **Step 3: Panel actions**

`PanelContext.tsx`:

```ts
import type { HoldPhase } from '@/domain/panels/hold-lease';

export interface PanelActions {
  write: (featureId: string, name: string, value: DataRefValue) => Promise<void>;
  activate: (featureId: string, name: string, durationSec?: number) => Promise<ActivationResult>;
  /** Presses, renews or releases a held command (F-24 §4.3); see `SimulatorSession.holdCommand`. */
  hold: (featureId: string, name: string, phase: HoldPhase) => Promise<ActivationResult>;
}

/**
 * What a PanelScope or PanelFrame is given. `hold` may be left out (the flight data strip, and
 * panels that never hold a command); every hold is then refused.
 */
export type PanelScopeActions = Omit<PanelActions, 'hold'> & Partial<Pick<PanelActions, 'hold'>>;

export const REFUSE_HOLD: PanelActions['hold'] = async () => 'refused';
```

`PanelFrame.tsx`: `PanelScope` and `PanelFrame` take `actions: PanelScopeActions`; the context value adds `hold: actions.hold ?? REFUSE_HOLD` (and `actions.hold` in the memo's dependencies). `useSimulatorSession` adds:

```ts
  const hold = useCallback(
    (featureId: string, name: string, phase: HoldPhase) =>
      session.holdCommand(featureId, name, phase),
    [session],
  );
```

and returns it; `AppShell` builds `{ write, activate, hold }`. In `tests/ui/panel-primitives.test.tsx` add a case: a component inside `PanelScope` given only `write`/`activate` calls `usePanel().hold(…)` and gets `'refused'`; given a `hold` mock, the mock is called with the arguments.

- [ ] **Step 4: Gate and commit**

```bash
git add -A src tests
git commit -m "feat(session): hold a command with a renewed lease over the WebSocket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hold keys — `ControlButton.hold` and `useHoldControl`

**Files:**
- Modify: `src/features/panels/primitives/ControlButton.tsx`
- Create: `src/features/panels/primitives/useHoldControl.ts`
- Test: `tests/ui/panel-primitives.test.tsx` (ControlButton hold cases), `tests/ui/hold-control.test.tsx` (new)

**Interfaces:**
- Consumes: `HoldLease`, `HoldEnd`, `RESPONSE_CHECK_MS` (Task 3); `PanelActions.hold` (Task 4); `useAppForeground` (`src/hooks/useAppForeground.ts`); `holdLinkLost`, `holdBackgrounded` (Task 2).
- Produces:

```ts
// ControlButton props
hold?: {
  onStart: () => void;
  onEnd: () => void;
  /** Legend while armed (with `confirm`), e.g. 'HOLD TO START'. Default: "Tap again: <label>". */
  armedLegend?: string;
};

// useHoldControl.ts
export interface HoldControlOptions {
  featureId: string;
  command: string;
  capMs: number;
  /** Lower case, for sentences: "pitch trim", "starter 1". */
  name: string;
  /** The value that should move while held (trim position, starter lamp); null when unknown. */
  value: number | null;
  /** Shown when the cap ends a hold. */
  cappedMessage: string;
  /** Shown when a hold of RESPONSE_CHECK_MS or more moved nothing. */
  noResponseMessage: string;
  /** Not moving is no failure here (trim already at the end it was driven toward). */
  atLimit?: (value: number | null) => boolean;
}
export interface HoldControl {
  start: () => void;
  end: () => void;
  held: boolean;
  message: string | null;
}
export function useHoldControl(options: HoldControlOptions): HoldControl;
```

- [ ] **Step 1: ControlButton hold (TDD)**

Tests to add in `tests/ui/panel-primitives.test.tsx` (inside the file's PanelScope harness, controls enabled):
1. `fireEvent(key, 'pressIn')` calls `onStart` once; `fireEvent(key, 'pressOut')` calls `onEnd` once; the following `fireEvent.press(key)` calls neither again.
2. `fireEvent.press(key)` alone (a screen reader's activation: no press-in) calls `onStart` then `onEnd`, once each.
3. With `confirm`: `pressIn`/`pressOut` on an unarmed key call nothing; `press` arms it (the legend reads `HOLD TO START` when `armedLegend` is given); then `pressIn` calls `onStart`, `pressOut` calls `onEnd`, and the following `press` disarms (legend back to `START`).
4. A disabled hold key (controls off) calls nothing on `pressIn`.

Implementation inside `ControlButton` (refs are touched only in handlers):

```ts
  // Whether this press started a hold: `onPress` follows `onPressOut`, and must not nudge again.
  const holdStarted = useRef(false);

  const onPressIn = () => {
    if (props.hold === undefined || !enabled) {
      return;
    }
    if (props.confirm === true && !armed) {
      return;
    }
    holdStarted.current = true;
    haptics.press();
    props.hold.onStart();
  };
  const onPressOut = () => {
    if (props.hold !== undefined && holdStarted.current) {
      props.hold.onEnd();
    }
  };
  const onPress = () => {
    if (props.hold !== undefined) {
      if (holdStarted.current) {
        // The hold already ran from press-in to press-out.
        holdStarted.current = false;
        setArmed(false);
        return;
      }
      haptics.press();
      if (props.confirm === true && !armed) {
        setArmed(true);
        return;
      }
      // A screen reader's activation fires only onPress: a nudge (HoldLease's minimum hold).
      setArmed(false);
      props.hold.onStart();
      props.hold.onEnd();
      return;
    }
    // …the existing body, unchanged…
  };
```

Pass `onPressIn` / `onPressOut` to the `Pressable`. The armed legend: `const shown = armed ? (props.hold?.armedLegend ?? \`Tap again: ${props.label}\`) : props.label;`. Document the prop as in the interface above.

- [ ] **Step 2: useHoldControl (TDD)**

`tests/ui/hold-control.test.tsx` renders a probe component in `PanelScope` with a `hold` mock and fake timers (`jest.useFakeTimers()`); the probe renders a `ControlButton` with `hold={{ onStart: control.start, onEnd: control.end }}` and prints `control.message`. Cases (each asserting the `hold` mock's calls as `[featureId, command, phase]`):
1. press-in, 600 ms, press-out → `press`, then `renew` ×3, then `release`.
2. Controls disable mid-hold (re-render the scope with a stale snapshot) → a `release` is sent, the message reads `Pitch trim released: the connection to X-Plane dropped.`, and no `renew` follows after re-enabling (re-render live; advance 1 s).
3. App goes to the background mid-hold (mock `AppState.currentState = 'background'` and emit `change`) → `release`, message `Pitch trim released: Avionix left the foreground.`.
4. The cap (pass `capMs: 1000`) → `release` and the capped message.
5. A 1.2 s hold with `value` unchanged → the no-response message; with `value` changing during the hold → none; with `atLimit` returning true → none; a 500 ms hold → none.
6. A new press clears the previous message.
7. Unmount mid-hold → `release` sent, no state update warnings.

Implementation:

```ts
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { type HoldEnd, HoldLease, RESPONSE_CHECK_MS } from '@/domain/panels/hold-lease';
import { holdBackgrounded, holdLinkLost } from '@/domain/systems/messages';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useAppForeground } from '@/hooks/useAppForeground';

// (the HoldControlOptions / HoldControl interfaces above)

/**
 * One hold key's lease (F-24 §4.3, R4, R5). A lease exists only while controls are enabled and
 * the app is in the foreground; a fresh one replaces it when the command or either condition
 * changes, and the old one is cancelled (release sent), which also covers unmount. The message
 * for a hold the panel ended (link lost, backgrounded) is set while rendering, from the same
 * props that end it, so it can never be missed; the lease's own end (cap, no response) sets it
 * from `onEnd`. Refs are read and written only in effects and handlers.
 */
export function useHoldControl(options: HoldControlOptions): HoldControl {
  const { hold, link } = usePanel();
  const foreground = useAppForeground();
  const [held, setHeld] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const holdRef = useRef(hold);
  const optionsRef = useRef(options);
  const leaseRef = useRef<{ tag: string; lease: HoldLease } | null>(null);
  const valueRef = useRef(options.value);
  const startValueRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    if (leaseRef.current?.lease.held === true && options.value !== startValueRef.current) {
      movedRef.current = true;
    }
    valueRef.current = options.value;
  }, [options.value]);

  const active = link.controlsEnabled && foreground;
  if (held && !active) {
    setHeld(false);
    setMessage(link.controlsEnabled ? holdBackgrounded(options.name) : holdLinkLost(options.name));
  }

  const { featureId, command, capMs } = options;
  const tag = `${featureId}|${command}`;
  useLayoutEffect(() => {
    if (!active) {
      return undefined;
    }
    const lease = new HoldLease({
      send: (phase) => holdRef.current(featureId, command, phase),
      capMs,
      onEnd: (end: HoldEnd, heldMs: number) => {
        setHeld(false);
        const current = optionsRef.current;
        if (end === 'capped') {
          setMessage(current.cappedMessage);
          return;
        }
        if (end === 'released' && heldMs >= RESPONSE_CHECK_MS && startValueRef.current !== null) {
          const moved = movedRef.current || (current.atLimit?.(valueRef.current) ?? false);
          if (!moved) {
            setMessage(current.noResponseMessage);
          }
        }
      },
    });
    leaseRef.current = { tag: `${featureId}|${command}`, lease };
    return () => {
      lease.cancel();
      if (leaseRef.current?.lease === lease) {
        leaseRef.current = null;
      }
    };
  }, [featureId, command, capMs, active]);

  const start = useCallback(() => {
    const built = leaseRef.current;
    if (built === null || built.tag !== tag || !active || built.lease.held) {
      return;
    }
    startValueRef.current = valueRef.current;
    movedRef.current = false;
    setMessage(null);
    setHeld(true);
    built.lease.press();
  }, [tag, active]);

  const end = useCallback(() => {
    leaseRef.current?.lease.release();
  }, []);

  return { start, end, held, message };
}
```

If `react-hooks` flags the dependency-less `optionsRef` effect, give it `[options]`; if it flags the render-time `setHeld`/`setMessage`, restructure to the same "adjust state while rendering" shape `ControlButton` uses for `armed` (guarded by the condition so it cannot loop). Do not move either into an effect body.

- [ ] **Step 3: Gate and commit**

```bash
git add src/features/panels/primitives tests/ui/panel-primitives.test.tsx tests/ui/hold-control.test.tsx
git commit -m "feat(panels): hold keys — ControlButton.hold and useHoldControl

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Systems units

**Files:**
- Create in `src/features/panels/systems/`: `availability.ts`, `SwitchKey.tsx`, `SwitchGroup.tsx`, `SelectorKeys.tsx`, `DimmerRow.tsx`, `GearUnit.tsx`, `FlapsUnit.tsx`, `TrimUnit.tsx`, `ParkingBrakeKey.tsx`, `EngineColumn.tsx`, `sections.tsx` (exports `EngineSection`, `LightsSection`, `FlightSection`, `IceSection`)
- Test: `tests/ui/systems-units.test.tsx`, `tests/helpers/systems.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 5; `useReadBack` / `ReadBack` (`src/features/panels/primitives/useReadBack.ts`); `ControlButton`, `AvionicsUnit`, `LightBar`, `BodyText`.
- Produces:

```ts
// availability.ts
export function bindingOk(snapshot: SessionSnapshot, name: string): boolean; // status === 'ok'
export interface Presence { shown: boolean; enabled: boolean }
/** S3: drawn when the state resolved; enabled when every command (or the write) resolved too. */
export function presence(snapshot: SessionSnapshot, state: string, actions: readonly string[]): Presence;
export function aircraftName(snapshot: SessionSnapshot): string | null; // identity.description ?? identity.icaoType ?? null
export function valueOf(snapshot: SessionSnapshot, name: string): DataRefValue | undefined;

// sections.tsx — each takes { readBack: ReadBack } and renders one or more AvionicsUnits
export function EngineSection(props: { readBack: ReadBack }): React.JSX.Element; // ELECTRICAL, FUEL, ENGINE n…
export function LightsSection(props: { readBack: ReadBack }): React.JSX.Element; // EXTERIOR LIGHTS, INTERIOR LIGHTS
export function FlightSection(props: { readBack: ReadBack }): React.JSX.Element; // FLAPS, TRIM, GEAR, BRAKES
export function IceSection(props: { readBack: ReadBack }): React.JSX.Element;    // ANTI-ICE
```

**Behaviour, unit by unit** (every sentence comes from `messages.ts`; every read-back uses `readBack.watch` with the key named here; every read-back failure renders as `<BodyText tone="danger">` under its unit):

- **SwitchKey** (`spec: SwitchSpec`): `on = switchOn(value, spec.index)`. `ControlButton` with `label={spec.legend}`, `accessibilityLabel` `"Beacon, on"` / `"Beacon, off"` / `"Beacon, unknown"`, `annunciation={on === true ? 'engaged' : 'off'}`, `featureId={spec.featureId}`, `target` = the command it would send (`on ? spec.off : spec.on`), `confirm={spec.confirmOff === true && on === true}`, `invalid` when not enabled, when `on === null`, or while `readBack.pendingExpected(spec.key) !== null` (S2, Review Focus 4). Press: `activate(featureId, target)` then `watch({ key: spec.key, name: spec.state, operation: target, expected: on ? 0 : 1, matches: (v) => switchOn(v, spec.index) === !on, failure: (v) => switchNotTaken(aircraft, spec.name, !on, switchOn(v, spec.index)) })`. Not drawn when `!presence.shown`. testID `switch-${spec.key}`.
- **SwitchGroup** (`label`, `specs`): an `AvionicsUnit` with that label; the drawn SwitchKeys in a wrapping row (three per row on a phone: `flexBasis: '30%'`, `flexGrow: 1`); one `missingControls(aircraft, legends)` line (`BodyText muted`) listing every spec not drawn or not enabled; when none is drawn, only `unitUnavailable(<Label in sentence case>, aircraft)`; the read-back messages of its keys.
- **SelectorKeys** (`label`, `what` (sentence noun, e.g. `'fuel selector'`, `'magnetos 1'`), `featureId`, `state`, `index`, `positions`, `keyPrefix`): a row of `ControlButton`s, `selected` when `numberAt(value, index) === position.value`, `confirm={position.confirm}`, `accessibilityLabel` `"Fuel selector LEFT"` / `"Magnetos 1 BOTH"`, `target={position.command}`, `invalid` when that position's command did not resolve, the state did not resolve, or the selector's watch is pending. Press: `activate` + `watch({ key: keyPrefix, name: state, operation: command, expected: position.value, matches: (v) => numberAt(v, index) === position.value, failure: () => selectorNotTaken(aircraft, what, position.name) })`.
- **DimmerRow** (`spec: DimmerSpec`): the legend, a readout `"46 %"` (or `"—"`), and two keys `▼` / `▲` (`accessibilityLabel` `"Panel lights dimmer"` / `"Panel lights brighter"`), `▼` invalid at 0, `▲` at 1. Read-back key `spec.key`, matches any change from the value at the press, failure `dimmerNotTaken`.
- **GearUnit**: `AvionicsUnit label="GEAR"`. Not drawn content when the handle did not resolve (the unit shows `unitUnavailable('Landing gear', aircraft)`). When `retractable` reads 0: only `Fixed landing gear`. Otherwise three lamps (testID `gear-lamp-${i}-${lamp}`: `down` a filled `theme.avionics.engaged` square, `transit` a 2 dp `theme.avionics.warning` outline, `up` filled `theme.avionics.lightOff`; each lamp at least 20 dp, not pressable), the group wrapped in a `View` with `accessible` and `accessibilityLabel={gearSummary(lamps, handleDown)}`; then `GEAR UP` and `GEAR DOWN` keys, `selected` on the handle's position, both `confirm`, targets `GEAR.up`/`GEAR.down`. Press: watch `{ key: 'gear', name: GEAR.handle, operation: command, expected: down ? 1 : 0, failure: () => gearNotTaken(aircraft, down) }`. Lamps are omitted when `gearLamps` is null.
- **FlapsUnit**: `AvionicsUnit label="FLAPS"`; a readout window (`DisplayWindow` or the R-01 glass style used by the radios) showing `readout.label` and, when moving, a second line `MOVING` in `theme.avionics.caution`; `accessibilityLabel={readout.spoken}`. Keys `▲` (`accessibilityLabel "Flaps up one notch"`, invalid `atUp`) and `▼` (`"Flaps down one notch"`, invalid `atFull`). Press: watch `{ key: 'flaps', name: FLAPS.handle, operation, expected: handle, matches: (v) => flapsMoved(direction, handle, numberAt(v, 0)), failure: () => flapsNotTaken(aircraft, direction) }`.
- **TrimUnit** (`spec: TrimSpec`): a scale (a 6 dp track spanning the unit, a pointer at `(value + 1) / 2` of its width, a centre tick, and for pitch a takeoff mark at `(takeoff + 1) / 2` when `TAKEOFF_TRIM` resolved; end labels `NOSE DN`/`NOSE UP` or `L`/`R`), the readout text, and three keys in this order: decrease (hold), set, increase (hold). Each hold key: `useHoldControl({ featureId: FEATURE_TRIM, command, capMs: TRIM_HOLD_CAP_MS, name: spec.name, value, cappedMessage: holdCapped(spec.name, 10, 'Press again to keep trimming.'), noResponseMessage: holdNoResponse(aircraft, \`move the ${spec.name}\`), atLimit: (v) => trimAtLimit(v, direction) })`, `ControlButton` with `hold={{ onStart, onEnd }}`, `accessibilityLabel "Pitch trim nose up"`, `target` = its command. Set key: momentary, target = takeoff value (pitch, when known) or 0; no watch when already within `TRIM_TARGET_TOLERANCE`; otherwise watch `{ key: \`trim-${axis}-set\`, …, matches: (v) => moved toward the target or within tolerance, failure: () => trimSetNotTaken(aircraft, spec.set.sentence) }`; when the pitch target is unknown, any change counts. The unit prints the hold messages and the set message.
- **ParkingBrakeKey**: `ControlButton label="PARK BRAKE"`, `annunciation` engaged when set (`switchOn(ratio, 0)`), `accessibilityLabel` `"Parking brake, set"` / `"released"`, `featureId=FEATURE_PARKING_BRAKE`, `target=PARKING_BRAKE.ratio`. Press: `write(FEATURE_PARKING_BRAKE, ratio, set ? 0 : 1)` + watch `{ key: 'parkingBrake', name: ratio, operation: ratio, expected, matches: (v) => switchOn(v, 0) === !set, failure: () => parkingBrakeNotTaken(aircraft, !set) }`. Drawn when the ratio's binding status is `ok` or `readOnly`; enabled only when `ok`.
- **EngineColumn** (`column: EngineColumn`, `single: boolean`): `AvionicsUnit label={single ? 'ENGINE' : \`ENGINE ${n}\`}`: `SwitchKey generatorSwitch(n)`, `SwitchKey fuelPumpSwitch(n)`, `SelectorKeys` for `magnetoPositions(n)` (only when `column.piston`; `what` = `magnetos ${n}`, keyPrefix `magnetos${n}`), a START key: `ControlButton label="START"` with `confirm`, `hold={{ onStart, onEnd, armedLegend: 'HOLD TO START' }}`, `annunciation` engaged while `starter_hit[n−1]` is 1, `accessibilityLabel` `"Starter ${n}, engaged"`/`"Starter ${n}"`, from `useHoldControl({ featureId: FEATURE_ENGINE_START, command: starterCommand(n), capMs: STARTER_HOLD_CAP_MS, name: \`starter ${n}\`, value: starter lamp, cappedMessage: holdCapped(\`starter ${n}\`, 30, 'Press START again to keep cranking.'), noResponseMessage: holdNoResponse(aircraft, \`engage starter ${n}\`) })`; and a RUN lamp row (a `LightBar` `engaged` when `ENGN_running[n−1]` is 1, else `off`, beside the text `RUN`, inside an `accessible` View labelled `"Engine ${n} running"` / `"not running"`). The START key is never in the same row as a confirm-only key (spec §4.7): put it on its own row.
- **EngineSection**: `ELECTRICAL` (`SwitchGroup` of `BATTERY`, `AVIONICS_MASTER`), `FUEL` (the selector, hidden when `acf_has_fuel_any` reads 0; `BOTH` omitted when `acf_has_fuel_all` reads 0), then one `EngineColumn` per `engineColumns(count, types).columns` (side by side when two fit, else stacked), then `ENGINES_NOT_SHOWN` when `hidden > 0`.
- **LightsSection**: `SwitchGroup label="EXTERIOR LIGHTS"` over `EXTERIOR_LIGHTS`; `AvionicsUnit label="INTERIOR LIGHTS"` with the two `DimmerRow`s.
- **FlightSection**: `FlapsUnit`, `AvionicsUnit label="TRIM"` with the three `TrimUnit`s, `GearUnit`, `AvionicsUnit label="BRAKES"` with `ParkingBrakeKey`.
- **IceSection**: `SwitchGroup label="ANTI-ICE"` over `ANTI_ICE`.

- [ ] **Step 1: Test helper**

`tests/helpers/systems.ts` exports:

```ts
/** Every systems binding resolved ('ok'), unless overridden, derived through the real deriver. */
export function systemsCompatibility(
  base: SessionSnapshot['compatibility'],
  overrides?: Partial<Record<string, 'ok' | 'missing' | 'readOnly'>>,
): SessionSnapshot['compatibility'];
/** A one-engine piston aircraft, gear down, flaps up, trim centred, every switch off. */
export const SYSTEMS_VALUES: Record<string, DataRefValue>;
export function systemsTelemetry(values: Record<string, DataRefValue>, receivedAt: number): SessionSnapshot['telemetry'];
```

Build `systemsCompatibility` from `profileBindings` restricted to the `SYSTEMS_FEATURES` features of `GENERIC_PROFILE`, then `deriveAvailability(GENERIC_PROFILE, bindings)` (as `tests/ui/navigation-panel.test.tsx` does). `SYSTEMS_VALUES` sets: lights/anti-ice/electrical states 0; dimmers `[0.5, 0, 0, 0]` / an array of 32 with `0.5` first; `GEAR.handle` 1, `GEAR.deployment` `[1, 1, 1, 0, 0, 0, 0, 0, 0, 0]`, `GEAR.retractable` 1; flaps handle 0, position 0, detents 3; trims 0, takeoff trim 0.1; parking brake 1; fuel selector 4, `hasSelector` 1, `hasBoth` 1; `ENGINES.count` 1, `ENGINES.type` 16 × `1`, key 16 × with `3` first, starter and running 16 × `0`, fuel pumps 16 × `0`, generators 8 × `0`, battery 8 × `0`.

- [ ] **Step 2: Unit tests (write first, then the components)**

`tests/ui/systems-units.test.tsx` renders each section inside `ThemeProvider` → `PanelScope` (with `write`, `activate`, `hold` mocks) and a probe that owns `useReadBack()` and passes it down. Cases (each asserts the mock calls and the visible text or labels):

1. **Switch press sends `_on` from off, `_off` from on** (S2), watches, and a second tap before X-Plane answers sends nothing (Review Focus 4).
2. **Read-back failure** after 3 s (advance the scope's `now` by re-rendering with `now + 3000`) shows `"The Cessna 172 didn't turn the beacon on. It's still off."` (identity description `Cessna 172`).
3. **S3**: beacon state `missing` → no `switch-beacon` and the line `Not available on the Cessna 172: BCN.`; beacon `_on` missing only → the key is drawn, disabled, and named in the same line; every exterior light state missing → `Exterior lights isn't available on the Cessna 172.`
4. **Battery off takes two taps**: one tap shows `Tap again: BATT` and sends nothing; the second sends `battery_1_off`.
5. **Gear**: three green lamps and the label `Gear down, three green`; GEAR UP takes two taps then `activate(FEATURE_GEAR, landing_gear_up)`; read-back failure sentence includes the ground explanation; `retractable` 0 shows `Fixed landing gear` and no gear keys.
6. **Flaps**: `UP` readout, `▲` disabled; `▼` sends `flaps_down`; handle `2/3`, position `0.3` shows `2 of 3` and `MOVING`; `FULL` disables `▼`.
7. **Trim hold**: `pressIn` on `Pitch trim nose up` calls `hold(FEATURE_TRIM, pitch_trim_up, 'press')`; `pressOut` after 300 ms calls `'release'`; the readout `12 % nose up` for `elv_trim` 0.12; T/O sends `pitch_trim_takeoff`, and no watch when already at the takeoff value.
8. **Starter**: `START` needs a tap to arm (`HOLD TO START`), then `pressIn` calls `hold(FEATURE_ENGINE_START, engage_starter_1, 'press')`; the START bar is engaged while `starter_hit[0]` is 1; RUN lamp label.
9. **Magnetos**: `BOTH` selected for key value 3; `L` takes two taps then `magnetos_left_1`; magnetos absent for a turbine (`acf_en_type` 2).
10. **Fuel selector**: OFF takes two taps; LEFT one; `BOTH` hidden when `hasBoth` reads 0; the selector hidden when `hasSelector` reads 0.
11. **Engines**: count 2 → `ENGINE 1` and `ENGINE 2` units; count 6 → four units and `Engines 5 and up aren't shown.`; count missing → one unit labelled `ENGINE` (Review Focus 5).
12. **Parking brake** write `0` when set, read-back `"The Cessna 172 didn't release the parking brake."`; `readOnly` → drawn, disabled.
13. **Dimmers**: `50 %`; `▲` sends `panel_bright_up`.
14. **Stale**: with values not current, every key is disabled and every `LightBar` is dim (`light-bar-engaged` still present for an on switch).

Implement the components until all pass. Keep each component in its own file under 200 lines; shared styles go in the file that uses them.

- [ ] **Step 3: Gate and commit**

```bash
git add src/features/panels/systems tests/ui/systems-units.test.tsx tests/helpers/systems.ts
git commit -m "feat(systems): switch, selector, gear, flaps, trim, brake and engine units

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Systems panel

**Files:**
- Create: `src/features/panels/systems/systems.ts` (descriptor, pages), `src/features/panels/systems/systems-preference.ts`, `src/features/panels/systems/SystemsPreferenceProvider.tsx`, `src/features/panels/systems/SystemsPanel.tsx`
- Modify: `src/features/panels/registry.ts`, `src/features/shell/PanelIcon.tsx`, `src/features/shell/AppShell.tsx`
- Modify: tests pinning the panel order (`tests/ui/panels.test.tsx`, `tests/ui/app-shell.test.tsx`, and any other `grep -rln "'navigation',\s*$" tests` hit), `tests/ui/touch-target-guard.test.tsx`, `tests/ui/error-text-guard.test.tsx`
- Test: `tests/ui/systems-panel.test.tsx`, `tests/unit/application/systems-preference.test.ts`

**Interfaces produced:**

```ts
// systems.ts
export const SYSTEMS_PANEL: PanelDescriptor; // id 'systems', title 'Systems', features SYSTEMS_FEATURES, supports EVERYWHERE
export type SystemsPage = 'engine' | 'lights' | 'flight' | 'ice';
export const SYSTEMS_PAGES: readonly { id: SystemsPage; legend: string }[]; // ENGINE, LIGHTS, FLIGHT, ICE
export const DEFAULT_SYSTEMS_PAGE: SystemsPage; // 'flight'
export const WIDE_MIN_WIDTH = 720;
// systems-preference.ts
export const SYSTEMS_STORAGE_KEY = 'avionix.systems';
export function loadSystemsPage(storage: SettingsStorage): Promise<SystemsPage>;
export function saveSystemsPage(storage: SettingsStorage, page: SystemsPage): Promise<void>;
// SystemsPreferenceProvider.tsx
export function SystemsPreferenceProvider(props: { storage: SettingsStorage; children: React.ReactNode }): React.JSX.Element;
export function useSystemsPage(): [SystemsPage, (page: SystemsPage) => void];
```

- [ ] **Step 1: Preference (TDD)** — mirror `src/features/panels/cdu/cdu-preference.ts` and its test exactly: zod schema `z.object({ page: z.enum(['engine', 'lights', 'flight', 'ice']) })`, unreadable or missing → `'flight'`, save is best effort. `SystemsPreferenceProvider` mirrors `CduPreferenceProvider` without the screen memory (a change made before the stored value loads wins). Mount it in `AppShell` next to `CduPreferenceProvider`.

- [ ] **Step 2: Panel (TDD)** — `tests/ui/systems-panel.test.tsx` (harness as `tests/ui/navigation-panel.test.tsx`, plus the preference provider; set the window with `Dimensions.set` as the CDU tests do):
1. Descriptor: id, title, the ten features, `EVERYWHERE`.
2. Phone (390 × 844): page keys `ENGINE`, `LIGHTS`, `FLIGHT`, `ICE` with role `tab`, FLIGHT selected on first use; tapping `LIGHTS` shows the `EXTERIOR LIGHTS` unit and hides `FLAPS`; the choice is saved under `avionix.systems` and restored on a fresh render.
3. Wide (820 × 1180): no page keys; `systems-wide-left` holds ENGINE and LIGHTS units, `systems-wide-right` FLIGHT and ICE.
4. A read-back failure survives switching page and back (the panel owns the one `useReadBack`).
5. A trim hold is released when the page changes mid-hold (the unit unmounts).

`SystemsPanel`: owns `useReadBack()`; reads `useWindowDimensions().width` (wide at ≥ `WIDE_MIN_WIDTH`); phone renders a row of page keys (a `Pressable` per page with `accessibilityRole="tab"`, `accessibilityState={{ selected }}`, `minHeight`/`minWidth` `theme.touch.minTarget`, the R-01 key face from `ControlButton`'s styles: `theme.avionics.keyFace`, `bezelEdge` border, `legend` text, a `LightBar` `engaged`/`off` for the selected page), then the selected section; wide renders two `flex: 1` columns in a row. testIDs: `panel-systems` is set by the frame; `systems-page-${id}` for page keys.

- [ ] **Step 3: Registry, icon, guards**

- `registry.ts`: insert `{ descriptor: SYSTEMS_PANEL, Component: SystemsPanel }` after Navigation (order: instruments, radios, autopilot, navigation, systems, cdu, flight-data); update every order assertion.
- `PanelIcon.tsx`: a `systems` case — three vertical toggle switches (a rounded `Rect` slot each with a `Circle` knob, two up and one down), stroke `color`, in the existing 24-unit view box.
- `touch-target-guard.test.tsx`: the generic sweep already covers the new id (it has `tab` page keys on phones and the switcher on every layout). Add a describe like the live-CDU one: every layout, `systemsTelemetry(SYSTEMS_VALUES, NOW)` and `systemsCompatibility(...)`, phone portrait visits all four pages, every target ≥ 48 dp, and at least 30 targets on the wide layout.
- `error-text-guard.test.tsx`: include the Systems panel with a failed write and a failed command outcome in whatever list of panels it sweeps.

- [ ] **Step 4: Gate and commit**

```bash
git add -A src tests
git commit -m "feat(systems): Systems panel with phone pages and a tablet layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Mock toy aircraft, integration test and docs

**Files:**
- Modify: `tests/mock-xplane/mock-xplane-server.ts`, `tests/integration/mock-xplane-server.test.ts` (counts)
- Create: `tests/integration/systems.test.ts`
- Modify: `docs/xplane.md`, `docs/architecture.md`, `README.md`, `docs/roadmap/features/F-24-aircraft-systems-controls.md`, `docs/roadmap/ROADMAP.md`, `docs/testing/xplane-smoke-test.md`

- [ ] **Step 1: Toy aircraft in the mock**

- Add the 35 new DataRefs (ids from 1200, in catalogue order, the values of `SYSTEMS_VALUES` from Task 6 except `acf_en_type`, which already exists) and the 83 new commands (ids from 2200). Use the catalogue (`@/domain/systems/controls`) to build them, as `cduDataRefs`/`cduCommands` do. Writable: everything except `starter_hit`.
- `ignoreCommand(name: string): void` beside `ignoreWritesTo`: `applyCommand` and holds do nothing for an ignored command (the activation is still recorded).
- In `applyCommand`: each `SwitchSpec` `on`/`off` sets its state element to 1/0; dimmers step ±0.1 clamped to 0..1; `landing_gear_up/down` set the handle at once (`up` is refused, handle unchanged, while a public `onGround` flag is true; default false); `flaps_up/down` move the handle by `1 / detents`, clamped; fuel selector commands set the selector; magneto commands set `ignition_key[n−1]`; `pitch_trim_takeoff` sets `elv_trim` to the takeoff value; the centre commands set roll/yaw trim to 0.
- A `tick()` called from the update interval before `pushUpdates`, using real elapsed time: gear deployment entries 0–2 move toward the handle at 0.5 per second; flap position toward the handle at 0.5 per second; for every held command (lease not lapsed): trim commands move their trim at 0.1 per second toward their end, clamped to −1..1; a held starter sets `ignition_key[n−1]` to 4 and `starter_hit[n−1]` to 1, and after 2 s of cranking with the selector not 0 sets `ENGN_running[n−1]` to 1; when a starter hold ends, `starter_hit` returns to 0 and `ignition_key` to 3. Expired leases are removed in `tick`.
- Update the counts in `tests/integration/mock-xplane-server.test.ts`.

- [ ] **Step 2: Integration test** (`tests/integration/systems.test.ts`, harness copied from `tests/integration/cdu.test.ts`, demand `SYSTEMS_FEATURES`):
1. Beacon on: `activate(FEATURE_LIGHTS_EXTERIOR, beacon_lights_on)` → telemetry beacon becomes 1.
2. Gear up: `landing_gear_up` → handle 0, then deployment entries reach 0 within 3 s.
3. Trim hold: `holdCommand(FEATURE_TRIM, pitch_trim_up, 'press')`, renew every 200 ms for 1 s, release → `elv_trim` rose by roughly 0.1 (between 0.05 and 0.15) and stays still for the next 500 ms.
4. Lease safety: press and never renew → `elv_trim` stops rising within 700 ms (the lease lapsed) and `server.heldCommandNames()` is empty.
5. Socket drop mid-hold: press, then close the server side of the socket → the hold is gone from `heldCommandNames()`, `elv_trim` is still, and after the session reconnects a `renew` returns `'refused'`.
6. Starter: hold `engage_starter_1` with renewals for 2.5 s → `ENGN_running[0]` becomes 1; after release `starter_hit[0]` is 0.
7. Ignored command: `server.ignoreCommand(beacon on)`, activate → beacon stays 0 (the panel's read-back then reports it; covered in UI tests).

- [ ] **Step 3: Docs**

- `docs/xplane.md`: a "Systems controls (F-24)" section with the spec §3 tables (names verified against Laminar's files), the hold message format and lease rule, and the probe size (118 names).
- `docs/architecture.md`: the systems domain, `HoldLease`, `holdCommand` (generation check, no store churn), `PanelActions.hold` / `PanelScopeActions`, `ControlButton.hold`, `useHoldControl`, the Systems panel and `avionix.systems`; profile 1.7.0.
- `README.md`: the Systems panel in the feature list.
- Roadmap F-24 file: Status `Done`, a link to the spec, and the mapping table replaced by "Verified names: see `docs/xplane.md`"; `ROADMAP.md` row status; record that electrical controls were added and flap detent writes left out.
- `docs/testing/xplane-smoke-test.md`: rows 143–161:

| # | Check | Expected |
|---|---|---|
| 143 | Connect to X-Plane with a flight loaded and time it against row 124 | Connecting takes at most about a second longer than before F-24 (118 more names are checked) |
| 144 | Default Cessna 172: each exterior light key, then flip the same switch in the cockpit | The light changes in X-Plane; a switch flipped in the cockpit updates the key's bar within a moment |
| 145 | A retractable default aircraft (Baron 58 or King Air), in flight: GEAR UP (two taps), then GEAR DOWN | Lamps go red in transit and out when up; three green when down; the spoken label matches |
| 146 | Same aircraft on the ground: GEAR UP | The handle stays down and the sentence explains X-Plane keeps the gear down on the ground |
| 147 | Cessna 172: flaps ▼ to full, then ▲ to up | The readout steps UP, 1 of 3, 2 of 3, FULL matching the cockpit flap indicator; MOVING shows while they travel |
| 148 | Hold NOSE UP for 3 s, then release | Trim moves smoothly (no stutter) in the nose-up direction and stops within about 0.3 s of release; the readout follows |
| 149 | Tap NOSE DN; with VoiceOver or TalkBack, double-tap NOSE DN | Each moves the trim by one small step |
| 150 | Start a trim hold, then turn on airplane mode (or pull Wi-Fi) on the phone | Trim stops in X-Plane within about half a second; the panel says trim was released; turning Wi-Fi back on does not resume it |
| 151 | Hold NOSE UP for more than 10 s | Trim stops at 10 s with "Pitch trim stopped after 10 seconds…" |
| 152 | T/O, then roll and rudder CTR | Pitch trim goes to the takeoff mark; roll and rudder trim centre |
| 153 | Cessna 172 cold and dark: BATT, fuel selector BOTH, magnetos BOTH (two taps), START armed then held | The engine cranks while held and starts; release stops cranking; the RUN lamp lights |
| 154 | A turbine default aircraft (King Air C90 or 737): hold START | Record what `engage_starter` does on each; magnetos are not shown |
| 155 | Fuel selector OFF, LEFT, RIGHT on the 172; an aircraft without BOTH | OFF needs two taps; positions match the cockpit; BOTH is hidden where the aircraft has none |
| 156 | A twin: GEN 1 and GEN 2, FUEL PUMP 1 and 2; BATT off | Each matches its cockpit switch; BATT off needs two taps |
| 157 | PITOT HEAT and each anti-ice switch, on the 172 and on an aircraft with the system | The switch follows; note any switch that turns on without the aircraft having the system |
| 158 | PARK BRAKE set and release, on ground | Matches the cockpit; the brake holds the aircraft |
| 159 | At night: PANEL and INSTR ▼/▲ | Cockpit lighting changes; the percentage follows |
| 160 | Background the app during a trim hold | Trim stops; the panel says Avionix left the foreground |
| 161 | Phone: the four pages; tablet: two columns; web build: a trim hold through the connector | Pages remembered after relaunch; every key reachable; the web hold behaves like row 148 |

- [ ] **Step 4: Gate and commit**

```bash
git add -A tests docs README.md
git commit -m "feat(systems): toy aircraft in the mock, integration test and docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
