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
    decrease: {
      command: 'sim/flight_controls/pitch_trim_down',
      legend: 'NOSE DN',
      name: 'nose down',
    },
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
  {
    key: 'off',
    legend: 'OFF',
    name: 'off',
    value: 0,
    command: 'sim/fuel/fuel_selector_none',
    confirm: true,
  },
  {
    key: 'left',
    legend: 'LEFT',
    name: 'left',
    value: 1,
    command: 'sim/fuel/fuel_selector_lft',
    confirm: false,
  },
  {
    key: 'both',
    legend: 'BOTH',
    name: 'both',
    value: 4,
    command: 'sim/fuel/fuel_selector_all',
    confirm: false,
  },
  {
    key: 'right',
    legend: 'RIGHT',
    name: 'right',
    value: 3,
    command: 'sim/fuel/fuel_selector_rgt',
    confirm: false,
  },
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
    {
      key: 'off',
      legend: 'OFF',
      name: 'off',
      value: 0,
      command: `sim/magnetos/magnetos_off_${engine}`,
      confirm: true,
    },
    {
      key: 'right',
      legend: 'R',
      name: 'right',
      value: 2,
      command: `sim/magnetos/magnetos_right_${engine}`,
      confirm: true,
    },
    {
      key: 'left',
      legend: 'L',
      name: 'left',
      value: 1,
      command: `sim/magnetos/magnetos_left_${engine}`,
      confirm: true,
    },
    {
      key: 'both',
      legend: 'BOTH',
      name: 'both',
      value: 3,
      command: `sim/magnetos/magnetos_both_${engine}`,
      confirm: true,
    },
  ];
}

/** Held while cranking (spec §4.3). */
export function starterCommand(engine: number): string {
  return `sim/starters/engage_starter_${engine}`;
}
