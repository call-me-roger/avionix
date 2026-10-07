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
    expect(
      EXTERIOR_LIGHTS.map((light) => [light.legend, light.state, light.on, light.off]),
    ).toEqual([
      [
        'BCN',
        'sim/cockpit2/switches/beacon_on',
        'sim/lights/beacon_lights_on',
        'sim/lights/beacon_lights_off',
      ],
      [
        'LAND',
        'sim/cockpit2/switches/landing_lights_on',
        'sim/lights/landing_lights_on',
        'sim/lights/landing_lights_off',
      ],
      [
        'TAXI',
        'sim/cockpit2/switches/taxi_light_on',
        'sim/lights/taxi_lights_on',
        'sim/lights/taxi_lights_off',
      ],
      [
        'NAV',
        'sim/cockpit2/switches/navigation_lights_on',
        'sim/lights/nav_lights_on',
        'sim/lights/nav_lights_off',
      ],
      [
        'STROBE',
        'sim/cockpit2/switches/strobe_lights_on',
        'sim/lights/strobe_lights_on',
        'sim/lights/strobe_lights_off',
      ],
    ]);
  });

  it('names six anti-ice switches, spelling the wing-heat DataRef as Laminar does', () => {
    expect(ANTI_ICE.map((spec) => [spec.legend, spec.state, spec.on, spec.off])).toEqual([
      [
        'PITOT HEAT',
        'sim/cockpit2/ice/ice_pitot_heat_on_pilot',
        'sim/ice/pitot_heat0_on',
        'sim/ice/pitot_heat0_off',
      ],
      [
        'WINDOW HEAT',
        'sim/cockpit2/ice/ice_window_heat_on',
        'sim/ice/window_heat_on',
        'sim/ice/window_heat_off',
      ],
      [
        'PROP HEAT',
        'sim/cockpit2/ice/ice_prop_heat_on',
        'sim/ice/prop_heat_on',
        'sim/ice/prop_heat_off',
      ],
      [
        'ENG ANTI-ICE',
        'sim/cockpit2/ice/ice_inlet_heat_on',
        'sim/ice/inlet_heat_on',
        'sim/ice/inlet_heat_off',
      ],
      [
        'WING HEAT',
        'sim/cockpit2/ice/ice_surfce_heat_on',
        'sim/ice/wing_heat_on',
        'sim/ice/wing_heat_off',
      ],
      [
        'WING BOOTS',
        'sim/cockpit2/ice/ice_surface_boot_on',
        'sim/ice/wing_boot_on',
        'sim/ice/wing_boot_off',
      ],
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
    expect(
      TRIMS.map((trim) => [
        trim.axis,
        trim.position,
        trim.decrease.command,
        trim.increase.command,
        trim.set.command,
      ]),
    ).toEqual([
      [
        'pitch',
        'sim/flightmodel/controls/elv_trim',
        'sim/flight_controls/pitch_trim_down',
        'sim/flight_controls/pitch_trim_up',
        'sim/flight_controls/pitch_trim_takeoff',
      ],
      [
        'roll',
        'sim/flightmodel/controls/ail_trim',
        'sim/flight_controls/aileron_trim_left',
        'sim/flight_controls/aileron_trim_right',
        'sim/flight_controls/aileron_trim_center',
      ],
      [
        'yaw',
        'sim/flightmodel/controls/rud_trim',
        'sim/flight_controls/rudder_trim_left',
        'sim/flight_controls/rudder_trim_right',
        'sim/flight_controls/rudder_trim_center',
      ],
    ]);
    expect(TAKEOFF_TRIM).toBe('sim/aircraft/controls/acf_takeoff_trim');
    expect(DIMMERS.map((dimmer) => [dimmer.legend, dimmer.state, dimmer.down, dimmer.up])).toEqual([
      [
        'PANEL',
        'sim/cockpit2/switches/panel_brightness_ratio',
        'sim/instruments/panel_bright_down',
        'sim/instruments/panel_bright_up',
      ],
      [
        'INSTR',
        'sim/cockpit2/switches/instrument_brightness_ratio',
        'sim/instruments/instrument_bright_down',
        'sim/instruments/instrument_bright_up',
      ],
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
