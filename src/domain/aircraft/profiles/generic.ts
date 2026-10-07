import type { AircraftProfile, BindingSpec, FeatureSpec } from '@/domain/aircraft/profile';
import {
  CDU_KEYS,
  CDU_LINE_COUNT,
  cduCommand,
  cduExecLight,
  cduStyleLine,
  cduTextLine,
  type CduUnit,
} from '@/domain/cdu/keys';
import {
  ELECTRICAL,
  ENGINE_CONFIG,
  FEATURE_ELECTRICAL_MONITOR,
  FEATURE_ENGINE_GAUGES,
  FEATURE_ENGINE_MARKINGS,
  FEATURE_FUEL_QUANTITY,
  FUEL,
  GAUGES,
  GAUGE_IDS,
  MARKING_COLOURS,
  MARKING_EDGES,
  MARKING_KEYS,
  MARKING_LABELS,
  markingName,
} from '@/domain/engines/catalogue';
import {
  ANTI_ICE,
  AVIONICS_MASTER,
  BATTERY,
  DIMMERS,
  ENGINES,
  ENGINE_NUMBERS,
  EXTERIOR_LIGHTS,
  FEATURE_ANTI_ICE,
  FEATURE_ELECTRICAL,
  FEATURE_ENGINE_START,
  FEATURE_FLAPS,
  FEATURE_FUEL,
  FEATURE_GEAR,
  FEATURE_LIGHTS_EXTERIOR,
  FEATURE_LIGHTS_INTERIOR,
  FEATURE_PARKING_BRAKE,
  FEATURE_TRIM,
  FLAPS,
  FUEL_SELECTOR,
  GEAR,
  PARKING_BRAKE,
  TAKEOFF_TRIM,
  TRIMS,
  type SwitchSpec,
  fuelPumpSwitch,
  generatorSwitch,
  magnetoPositions,
  starterCommand,
} from '@/domain/systems/controls';

/**
 * Laminar names, verified against Laminar Research's `DataRefs.txt` and `Commands.txt`
 * (see docs/xplane.md). `sim/time/paused` is the one community-sourced name here, which is why
 * its binding is optional.
 */
export const GENERIC_DATAREFS = {
  heartbeat: 'sim/time/total_running_time_sec',
  paused: 'sim/time/paused',
  airspeed: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
  headingBug: 'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
  groundSpeed: 'sim/cockpit2/gauges/indicators/ground_speed_kt',
  trueAirspeed: 'sim/cockpit2/gauges/indicators/true_airspeed_kts_pilot',
  groundTrack: 'sim/cockpit2/gauges/indicators/ground_track_mag_pilot',
  windSpeed: 'sim/cockpit2/gauges/indicators/wind_speed_kts',
  windDirection: 'sim/cockpit2/gauges/indicators/wind_heading_deg_mag',
  outsideAirTemp: 'sim/cockpit2/temperature/outside_air_temp_degc',
  totalAirTemp: 'sim/cockpit2/gauges/indicators/TAT_pilot',
  fuelTotal: 'sim/flightmodel/weight/m_fuel_total',
  zuluTime: 'sim/time/zulu_time_sec',
  localTime: 'sim/time/local_time_sec',
  inReplay: 'sim/time/is_in_replay',
  gpsDistance: 'sim/cockpit2/radios/indicators/gps_dme_distance_nm',
  gpsTimeToGo: 'sim/cockpit2/radios/indicators/gps_dme_time_min',
  gpsDestinationId: 'sim/cockpit2/radios/indicators/gps_nav_id',
  mach: 'sim/cockpit2/gauges/indicators/mach_pilot',
  altitude: 'sim/cockpit2/gauges/indicators/altitude_ft_pilot',
  verticalSpeed: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot',
  heading: 'sim/cockpit2/gauges/indicators/heading_AHARS_deg_mag_pilot',
  pitch: 'sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot',
  roll: 'sim/cockpit2/gauges/indicators/roll_AHARS_deg_pilot',
  turnRate: 'sim/cockpit2/gauges/indicators/turn_rate_roll_deg_pilot',
  slip: 'sim/cockpit2/gauges/indicators/slip_deg',
  radioAltitude: 'sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot',
  engineType: 'sim/aircraft/prop/acf_en_type',
  vso: 'sim/aircraft/view/acf_Vso',
  vs: 'sim/aircraft/view/acf_Vs',
  vfe: 'sim/aircraft/view/acf_Vfe',
  vno: 'sim/aircraft/view/acf_Vno',
  vne: 'sim/aircraft/view/acf_Vne',
  barometer: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
  com1Active: 'sim/cockpit2/radios/actuators/com1_frequency_hz_833',
  com1Standby: 'sim/cockpit2/radios/actuators/com1_standby_frequency_hz_833',
  com2Active: 'sim/cockpit2/radios/actuators/com2_frequency_hz_833',
  com2Standby: 'sim/cockpit2/radios/actuators/com2_standby_frequency_hz_833',
  nav1Active: 'sim/cockpit2/radios/actuators/nav1_frequency_hz',
  nav1Standby: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_hz',
  nav2Active: 'sim/cockpit2/radios/actuators/nav2_frequency_hz',
  nav2Standby: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_hz',
  nav1Course: 'sim/cockpit2/radios/actuators/nav1_course_deg_mag_pilot',
  nav2Course: 'sim/cockpit2/radios/actuators/nav2_course_deg_mag_pilot',
  nav1Id: 'sim/cockpit2/radios/indicators/nav1_nav_id',
  nav2Id: 'sim/cockpit2/radios/indicators/nav2_nav_id',
  nav1HasDme: 'sim/cockpit2/radios/indicators/nav1_has_dme',
  nav2HasDme: 'sim/cockpit2/radios/indicators/nav2_has_dme',
  nav1Dme: 'sim/cockpit2/radios/indicators/nav1_dme_distance_nm',
  nav2Dme: 'sim/cockpit2/radios/indicators/nav2_dme_distance_nm',
  transponderCode: 'sim/cockpit2/radios/actuators/transponder_code',
  transponderMode: 'sim/cockpit2/radios/actuators/transponder_mode',
  transponderIdenting: 'sim/cockpit2/radios/indicators/transponder_id',
  atcAssignedCode: 'sim/atc/transponder_assigned',
  autopilotServos: 'sim/cockpit2/autopilot/servos_on',
  autopilotOverride: 'sim/operation/override/override_autopilot',
  rollStatus: 'sim/cockpit2/autopilot/roll_status',
  pitchStatus: 'sim/cockpit2/autopilot/pitch_status',
  flightDirectorBars: 'sim/cockpit2/autopilot/flight_director_command_bars_pilot',
  autothrottle: 'sim/cockpit2/autopilot/autothrottle_enabled',
  altitudeDial: 'sim/cockpit2/autopilot/altitude_dial_ft',
  verticalSpeedDial: 'sim/cockpit2/autopilot/vvi_dial_fpm',
  airspeedDial: 'sim/cockpit2/autopilot/airspeed_dial_kts_mach',
  airspeedIsMach: 'sim/cockpit2/autopilot/airspeed_is_mach',
  headingStatus: 'sim/cockpit2/autopilot/heading_status',
  navStatus: 'sim/cockpit2/autopilot/nav_status',
  approachStatus: 'sim/cockpit2/autopilot/approach_status',
  glideslopeStatus: 'sim/cockpit2/autopilot/glideslope_status',
  altitudeStatus: 'sim/cockpit2/autopilot/altitude_hold_status',
  verticalSpeedStatus: 'sim/cockpit2/autopilot/vvi_status',
  speedStatus: 'sim/cockpit2/autopilot/speed_status',
  hsiSource: 'sim/cockpit2/radios/actuators/HSI_source_select_pilot',
  hsiCourse: 'sim/cockpit2/radios/actuators/hsi_obs_deg_mag_pilot',
  hsiHdef: 'sim/cockpit2/radios/indicators/hsi_hdef_dots_pilot',
  hsiVdef: 'sim/cockpit2/radios/indicators/hsi_vdef_dots_pilot',
  hsiFromTo: 'sim/cockpit2/radios/indicators/hsi_flag_from_to_pilot',
  hsiHorizontal: 'sim/cockpit2/radios/indicators/hsi_display_horizontal_pilot',
  hsiVertical: 'sim/cockpit2/radios/indicators/hsi_display_vertical_pilot',
  hsiGsFlag: 'sim/cockpit2/radios/indicators/hsi_flag_glideslope_pilot',
  hsiHasDme: 'sim/cockpit2/radios/indicators/hsi_has_dme_pilot',
  hsiDmeDistance: 'sim/cockpit2/radios/indicators/hsi_dme_distance_nm_pilot',
  hsiDmeSpeed: 'sim/cockpit2/radios/indicators/hsi_dme_speed_kts_pilot',
  hsiDmeTime: 'sim/cockpit2/radios/indicators/hsi_dme_time_min_pilot',
  nav1Bearing: 'sim/cockpit2/radios/indicators/nav1_bearing_deg_mag',
  nav2Bearing: 'sim/cockpit2/radios/indicators/nav2_bearing_deg_mag',
  nav1Signal: 'sim/cockpit2/radios/indicators/nav1_display_horizontal',
  nav2Signal: 'sim/cockpit2/radios/indicators/nav2_display_horizontal',
  outerMarker: 'sim/cockpit2/radios/indicators/outer_marker_lit',
  middleMarker: 'sim/cockpit2/radios/indicators/middle_marker_lit',
  innerMarker: 'sim/cockpit2/radios/indicators/inner_marker_lit',
} as const;

export const GENERIC_COMMANDS = {
  headingUp: 'sim/autopilot/heading_up',
  com1Flip: 'sim/radios/com1_standy_flip',
  com2Flip: 'sim/radios/com2_standy_flip',
  nav1Flip: 'sim/radios/nav1_standy_flip',
  nav2Flip: 'sim/radios/nav2_standy_flip',
  transponderIdent: 'sim/transponder/transponder_ident',
  autopilotEngage: 'sim/autopilot/servos_on',
  autopilotDisconnect: 'sim/autopilot/servos_off_any',
  flightDirectorOn: 'sim/autopilot/fdir_command_bars_on',
  flightDirectorOff: 'sim/autopilot/fdir_command_bars_off',
  autothrottleOn: 'sim/autopilot/autothrottle_on',
  autothrottleOff: 'sim/autopilot/autothrottle_off',
  autothrottleArm: 'sim/autopilot/autothrottle_arm',
  autothrottleDisarm: 'sim/autopilot/autothrottle_hard_off',
  knotsMachToggle: 'sim/autopilot/knots_mach_toggle',
  modeHeading: 'sim/autopilot/heading',
  modeNav: 'sim/autopilot/NAV',
  modeApproach: 'sim/autopilot/approach',
  modeAltitude: 'sim/autopilot/altitude_hold',
  modeVerticalSpeed: 'sim/autopilot/vertical_speed',
  modeLevelChange: 'sim/autopilot/level_change',
  hsiDirect: 'sim/radios/obs_HSI_direct',
} as const;

export const FEATURE_CONNECTION_HEALTH = 'connection-health';
export const FEATURE_FLIGHT_TELEMETRY = 'flight-telemetry';
export const FEATURE_HEADING_CONTROL = 'heading-control';
export const FEATURE_FLIGHT_DATA = 'flight-data';
export const FEATURE_GPS_DESTINATION = 'gps-destination';
export const FEATURE_FLIGHT_INSTRUMENTS = 'flight-instruments';
export const FEATURE_ALTIMETER_SETTING = 'altimeter-setting';
export const FEATURE_COM1 = 'com1';
export const FEATURE_COM2 = 'com2';
export const FEATURE_NAV1 = 'nav1';
export const FEATURE_NAV2 = 'nav2';
export const FEATURE_TRANSPONDER_CODE = 'transponder-code';
export const FEATURE_TRANSPONDER_MODE = 'transponder-mode';
export const FEATURE_TRANSPONDER_IDENT = 'transponder-ident';
export const FEATURE_AUTOPILOT = 'autopilot-engage';
export const FEATURE_FLIGHT_DIRECTOR = 'flight-director';
export const FEATURE_AUTOTHROTTLE = 'autothrottle';
export const FEATURE_ALTITUDE_SELECT = 'altitude-select';
export const FEATURE_VERTICAL_SPEED_SELECT = 'vertical-speed-select';
export const FEATURE_AIRSPEED_SELECT = 'airspeed-select';
export const FEATURE_MODE_HDG = 'ap-mode-hdg';
export const FEATURE_MODE_NAV = 'ap-mode-nav';
export const FEATURE_MODE_APR = 'ap-mode-apr';
export const FEATURE_MODE_ALT = 'ap-mode-alt';
export const FEATURE_MODE_VS = 'ap-mode-vs';
export const FEATURE_MODE_FLC = 'ap-mode-flc';
export const FEATURE_NAV_DEVIATION = 'nav-deviation';
export const FEATURE_NAV_GLIDESLOPE = 'nav-glideslope';
export const FEATURE_NAV_SOURCE = 'nav-source';
export const FEATURE_NAV_COURSE = 'nav-course';
export const FEATURE_NAV_AIDS = 'nav-aids';

export const FEATURE_CDU1_SCREEN = 'cdu1-screen';
export const FEATURE_CDU1_KEYS = 'cdu1-keys';
export const FEATURE_CDU2_SCREEN = 'cdu2-screen';
export const FEATURE_CDU2_KEYS = 'cdu2-keys';

export function cduScreenFeatureId(unit: CduUnit): string {
  return unit === 1 ? FEATURE_CDU1_SCREEN : FEATURE_CDU2_SCREEN;
}

export function cduKeysFeatureId(unit: CduUnit): string {
  return unit === 1 ? FEATURE_CDU1_KEYS : FEATURE_CDU2_KEYS;
}

const CDU_LINES = Array.from({ length: CDU_LINE_COUNT }, (_, line) => line);

/** `cdu{n}-screen`: the 16 text lines (required) and 16 style lines (optional) for one unit. */
function cduScreenFeature(unit: CduUnit): FeatureSpec {
  return {
    id: cduScreenFeatureId(unit),
    label: `CDU ${unit} screen`,
    bindings: [
      ...CDU_LINES.map((line) => ({
        kind: 'dataref' as const,
        name: cduTextLine(unit, line),
        required: true,
        purpose: `CDU ${unit} screen, line ${line + 1}`,
      })),
      ...CDU_LINES.map((line) => ({
        kind: 'dataref' as const,
        name: cduStyleLine(unit, line),
        required: false,
        purpose: `CDU ${unit} colours and fonts, line ${line + 1}`,
      })),
    ],
  };
}

/** `cdu{n}-keys`: the EXEC light and every one of the 70 key commands for one unit, all optional. */
function cduKeysFeature(unit: CduUnit): FeatureSpec {
  return {
    id: cduKeysFeatureId(unit),
    label: `CDU ${unit} keys`,
    bindings: [
      {
        kind: 'dataref',
        name: cduExecLight(unit),
        required: false,
        purpose: `CDU ${unit} EXEC light`,
      },
      ...CDU_KEYS.map((entry) => ({
        kind: 'command' as const,
        name: cduCommand(unit, entry.id),
        required: false,
        purpose: `CDU ${unit} ${entry.name} key`,
      })),
    ],
  };
}

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

/** F-12's four read-only features (spec §4.1): every binding an optional DataRef, none written. */
const ENGINES_FEATURE_SPECS: readonly FeatureSpec[] = [
  {
    id: FEATURE_ENGINE_GAUGES,
    label: 'Engine gauges',
    bindings: [
      dataRef(ENGINE_CONFIG.count, 'Engine count'),
      dataRef(ENGINE_CONFIG.type, 'Engine type'),
      ...GAUGE_IDS.map((id) => dataRef(GAUGES[id].name, `${capitalise(GAUGES[id].spoken)} gauge`)),
      dataRef(ENGINE_CONFIG.egtIsCelsius, 'EGT unit'),
      dataRef(ENGINE_CONFIG.ittIsCelsius, 'ITT unit'),
      dataRef(ENGINE_CONFIG.oilTempIsCelsius, 'Oil temperature unit'),
      dataRef(ENGINE_CONFIG.engineRedline, 'Engine redline'),
      dataRef(ENGINE_CONFIG.propRedline, 'Propeller redline'),
    ],
  },
  {
    id: FEATURE_ENGINE_MARKINGS,
    label: 'Gauge markings',
    bindings: MARKING_KEYS.flatMap((key) =>
      MARKING_COLOURS.flatMap((colour) =>
        MARKING_EDGES.map((edge) =>
          dataRef(
            markingName(colour, edge, key),
            `${MARKING_LABELS[key]} ${colour} band, ${edge === 'lo' ? 'low' : 'high'} edge`,
          ),
        ),
      ),
    ),
  },
  {
    id: FEATURE_FUEL_QUANTITY,
    label: 'Fuel quantity',
    bindings: [
      dataRef(FUEL.perTank, 'Fuel in each tank'),
      dataRef(FUEL.total, 'Total fuel'),
      dataRef(FUEL.ratio, 'Which fuel tanks are used'),
      dataRef(FUEL.count, 'Fuel tank count'),
      dataRef(FUEL.capacity, 'Fuel capacity'),
      dataRef(FUEL.side, 'Fuel tank positions'),
      dataRef(FUEL.used, 'Fuel used'),
    ],
  },
  {
    id: FEATURE_ELECTRICAL_MONITOR,
    label: 'Electrical readings',
    bindings: [
      dataRef(ELECTRICAL.busCount, 'Bus count'),
      dataRef(ELECTRICAL.batteryCount, 'Battery count'),
      dataRef(ELECTRICAL.busVolts, 'Bus voltage'),
      dataRef(ELECTRICAL.busAmps, 'Bus load'),
      dataRef(ELECTRICAL.batteryVolts, 'Battery voltage'),
      dataRef(ELECTRICAL.batteryAmps, 'Battery current'),
      dataRef(ELECTRICAL.generatorAmps, 'Generator current'),
    ],
  },
];

const D = GENERIC_DATAREFS;
const C = GENERIC_COMMANDS;

/** Keeps the four radio features (COM1, COM2, NAV1, NAV2) identical in shape. */
function radioFeature(
  id: string,
  label: string,
  active: string,
  standby: string,
  flip: string,
  extras: readonly BindingSpec[] = [],
): FeatureSpec {
  return {
    id,
    label,
    bindings: [
      { kind: 'dataref', name: active, required: true, purpose: `${label} active frequency` },
      {
        kind: 'dataref',
        name: standby,
        required: true,
        write: true,
        purpose: `${label} standby frequency, written when you set one`,
      },
      { kind: 'command', name: flip, required: true, purpose: `${label} swap` },
      ...extras,
    ],
  };
}

function navExtras(label: string, id: string, hasDme: string, dme: string, course: string) {
  return [
    { kind: 'dataref', name: id, required: false, purpose: `${label} station identifier` },
    { kind: 'dataref', name: hasDme, required: false, purpose: `${label} DME signal` },
    { kind: 'dataref', name: dme, required: false, purpose: `${label} DME distance` },
    { kind: 'dataref', name: course, required: false, purpose: `${label} selected course` },
  ] as const satisfies readonly BindingSpec[];
}

/** Keeps the six mode features identical in shape: X-Plane's status, then its own command. */
function modeFeature(
  id: string,
  label: string,
  status: string,
  command: string,
  extras: readonly BindingSpec[] = [],
): FeatureSpec {
  return {
    id,
    label,
    bindings: [
      { kind: 'dataref', name: status, required: true, purpose: `${label} state` },
      { kind: 'command', name: command, required: true, purpose: `${label} button` },
      ...extras,
    ],
  };
}

/**
 * The fallback for every aircraft, and the only profile Avionix ships today. Add-ons that reuse
 * Laminar names inherit it; one that renames a control needs a profile of its own (Stage 4).
 *
 * Connection health binds to `sim/time/*`, which is simulator-global: no aircraft can rename it,
 * which is why `HealthMonitor` may read those two names directly instead of through the profile.
 * Flight data and the GPS destination (F-11) bind only optional names: several are
 * community-sourced, and a miss must cost one field, never the strip. The flight instruments
 * (F-10) bind only optional names too, so a miss costs one instrument; the altimeter setting's
 * one binding is required and written, so a read-only resolution disables only its controls (R5).
 * The radios and transponder controls (F-21, F-22) are one feature each, so a name an aircraft
 * lacks costs only that radio or control, and the assigned code is optional because it exists
 * only from X-Plane 12.4.4. The autopilot (F-20) is one feature per control as well; mode and
 * engagement state come only from X-Plane's own status DataRefs, and the plugin override is read,
 * never written. The five navigation features (F-30) split the HSI by what a miss should cost:
 * the lateral and vertical deviation needles are each one feature with every binding required,
 * because a half-drawn needle is worse than a hidden one; the source and course are their own
 * features so a miss disables only the NAV unit's write, not the needles; course direct-to
 * (`obs_HSI_direct`) is optional because CTR is simply disabled without it (no fallback write
 * exists); and `nav-aids` bundles everything advisory — bearings, signal flags, DME and markers —
 * with no binding required, so a miss drops only that one cue. The four CDU features (F-32) split
 * each unit into its screen and its keys: every screen text line is required (a missing one means
 * the aircraft does not publish that unit's CDU at all), every style line and every key is
 * optional, so a missing key just disables that one key instead of the whole unit. The ten systems
 * features (F-24) bind every name optionally, so a missing name costs only the control it backs
 * (each control checks its own bindings, spec §4.1); the parking brake's one written DataRef is
 * required. The four engine features (F-12) are read-only and bind every name optionally, so a
 * missing name costs only the gauges it feeds.
 */
export const GENERIC_PROFILE: AircraftProfile = {
  id: 'avionix.generic',
  name: 'Generic X-Plane aircraft',
  version: '1.8.0',
  match: { kind: 'generic' },
  features: [
    {
      id: FEATURE_CONNECTION_HEALTH,
      label: 'Connection health',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.heartbeat,
          required: true,
          purpose: 'Simulator clock, which tells live data from frozen data',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.paused,
          required: false,
          purpose: 'Pause flag, which tells a paused simulator from a stopped one',
        },
      ],
    },
    {
      id: FEATURE_FLIGHT_TELEMETRY,
      label: 'Live telemetry',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.airspeed,
          required: true,
          purpose: 'Indicated airspeed',
        },
      ],
    },
    {
      id: FEATURE_HEADING_CONTROL,
      label: 'Heading control',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.headingBug,
          required: true,
          write: true,
          purpose: 'Heading bug, written when you set a heading',
        },
        {
          kind: 'command',
          name: GENERIC_COMMANDS.headingUp,
          required: true,
          purpose: 'Heading up control',
        },
      ],
    },
    {
      id: FEATURE_FLIGHT_DATA,
      label: 'Flight data',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.groundSpeed,
          required: false,
          purpose: 'Ground speed',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.trueAirspeed,
          required: false,
          purpose: 'True airspeed',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.groundTrack,
          required: false,
          purpose: 'Ground track',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.windSpeed,
          required: false,
          purpose: 'Wind speed',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.windDirection,
          required: false,
          purpose: 'Wind direction',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.outsideAirTemp,
          required: false,
          purpose: 'Outside air temperature',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.totalAirTemp,
          required: false,
          purpose: 'Total air temperature (X-Plane 12.3 and newer)',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.fuelTotal,
          required: false,
          purpose: 'Fuel remaining',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.zuluTime,
          required: false,
          purpose: 'Simulator zulu time',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.localTime,
          required: false,
          purpose: 'Simulator local time',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.inReplay,
          required: false,
          purpose: 'Replay flag',
        },
      ],
    },
    {
      id: FEATURE_GPS_DESTINATION,
      label: 'GPS destination',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.gpsDistance,
          required: false,
          purpose: 'Distance to the GPS destination',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.gpsTimeToGo,
          required: false,
          purpose: 'Time to the GPS destination',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.gpsDestinationId,
          required: false,
          purpose: 'GPS destination identifier',
        },
      ],
    },
    {
      id: FEATURE_FLIGHT_INSTRUMENTS,
      label: 'Flight instruments',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.airspeed,
          required: false,
          purpose: 'Airspeed indicator',
        },
        { kind: 'dataref', name: GENERIC_DATAREFS.mach, required: false, purpose: 'Mach number' },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.altitude,
          required: false,
          purpose: 'Altimeter',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.verticalSpeed,
          required: false,
          purpose: 'Vertical speed indicator',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.heading,
          required: false,
          purpose: 'Heading indicator',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.pitch,
          required: false,
          purpose: 'Attitude indicator (pitch)',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.roll,
          required: false,
          purpose: 'Attitude indicator (bank)',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.turnRate,
          required: false,
          purpose: 'Turn rate',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.slip,
          required: false,
          purpose: 'Slip and skid ball',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.radioAltitude,
          required: false,
          purpose: 'Radio altitude',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.engineType,
          required: false,
          purpose: 'Engine type, which picks the default presentation',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.vso,
          required: false,
          purpose: 'Stall speed, landing configuration',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.vs,
          required: false,
          purpose: 'Stall speed, clean',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.vfe,
          required: false,
          purpose: 'Maximum flap extended speed',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.vno,
          required: false,
          purpose: 'Maximum structural cruising speed',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.vne,
          required: false,
          purpose: 'Never-exceed speed',
        },
      ],
    },
    {
      id: FEATURE_ALTIMETER_SETTING,
      label: 'Altimeter setting',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.barometer,
          required: true,
          write: true,
          purpose: 'Altimeter setting, written when you change it',
        },
      ],
    },
    radioFeature(FEATURE_COM1, 'COM1', D.com1Active, D.com1Standby, C.com1Flip),
    radioFeature(FEATURE_COM2, 'COM2', D.com2Active, D.com2Standby, C.com2Flip),
    radioFeature(
      FEATURE_NAV1,
      'NAV1',
      D.nav1Active,
      D.nav1Standby,
      C.nav1Flip,
      navExtras('NAV1', D.nav1Id, D.nav1HasDme, D.nav1Dme, D.nav1Course),
    ),
    radioFeature(
      FEATURE_NAV2,
      'NAV2',
      D.nav2Active,
      D.nav2Standby,
      C.nav2Flip,
      navExtras('NAV2', D.nav2Id, D.nav2HasDme, D.nav2Dme, D.nav2Course),
    ),
    {
      id: FEATURE_TRANSPONDER_CODE,
      label: 'Transponder code',
      bindings: [
        {
          kind: 'dataref',
          name: D.transponderCode,
          required: true,
          write: true,
          purpose: 'Squawk code, written when you set one',
        },
        {
          kind: 'dataref',
          name: D.atcAssignedCode,
          required: false,
          purpose: 'Code assigned by X-Plane ATC (X-Plane 12.4.4 and newer)',
        },
      ],
    },
    {
      id: FEATURE_TRANSPONDER_MODE,
      label: 'Transponder mode',
      bindings: [
        {
          kind: 'dataref',
          name: D.transponderMode,
          required: true,
          write: true,
          purpose: 'Transponder mode, written when you select one',
        },
      ],
    },
    {
      id: FEATURE_TRANSPONDER_IDENT,
      label: 'Transponder IDENT',
      bindings: [
        { kind: 'command', name: C.transponderIdent, required: true, purpose: 'IDENT' },
        {
          kind: 'dataref',
          name: D.transponderIdenting,
          required: false,
          purpose: 'Whether the transponder is identing now',
        },
      ],
    },
    {
      id: FEATURE_AUTOPILOT,
      label: 'Autopilot',
      bindings: [
        { kind: 'dataref', name: D.autopilotServos, required: true, purpose: 'Autopilot engaged' },
        { kind: 'command', name: C.autopilotEngage, required: true, purpose: 'Autopilot engage' },
        {
          kind: 'command',
          name: C.autopilotDisconnect,
          required: true,
          purpose: 'Autopilot disconnect',
        },
        {
          kind: 'dataref',
          name: D.autopilotOverride,
          required: false,
          purpose: 'Whether another program is flying the autopilot',
        },
        { kind: 'dataref', name: D.rollStatus, required: false, purpose: 'Roll hold state' },
        { kind: 'dataref', name: D.pitchStatus, required: false, purpose: 'Pitch hold state' },
      ],
    },
    {
      id: FEATURE_FLIGHT_DIRECTOR,
      label: 'Flight director',
      bindings: [
        {
          kind: 'dataref',
          name: D.flightDirectorBars,
          required: true,
          purpose: 'Flight director on or off',
        },
        {
          kind: 'command',
          name: C.flightDirectorOn,
          required: true,
          purpose: 'Flight director on',
        },
        {
          kind: 'command',
          name: C.flightDirectorOff,
          required: true,
          purpose: 'Flight director off',
        },
      ],
    },
    {
      id: FEATURE_AUTOTHROTTLE,
      label: 'Autothrottle',
      bindings: [
        { kind: 'dataref', name: D.autothrottle, required: true, purpose: 'Autothrottle state' },
        { kind: 'command', name: C.autothrottleOn, required: true, purpose: 'Autothrottle engage' },
        {
          kind: 'command',
          name: C.autothrottleOff,
          required: true,
          purpose: 'Autothrottle disengage',
        },
        { kind: 'command', name: C.autothrottleArm, required: true, purpose: 'Autothrottle arm' },
        {
          kind: 'command',
          name: C.autothrottleDisarm,
          required: true,
          purpose: 'Autothrottle disarm',
        },
      ],
    },
    {
      id: FEATURE_ALTITUDE_SELECT,
      label: 'Altitude selector',
      bindings: [
        {
          kind: 'dataref',
          name: D.altitudeDial,
          required: true,
          write: true,
          purpose: 'Selected altitude, written when you set one',
        },
      ],
    },
    {
      id: FEATURE_VERTICAL_SPEED_SELECT,
      label: 'Vertical speed selector',
      bindings: [
        {
          kind: 'dataref',
          name: D.verticalSpeedDial,
          required: true,
          write: true,
          purpose: 'Selected vertical speed, written when you set one',
        },
      ],
    },
    {
      id: FEATURE_AIRSPEED_SELECT,
      label: 'Airspeed selector',
      bindings: [
        {
          kind: 'dataref',
          name: D.airspeedDial,
          required: true,
          write: true,
          purpose: 'Selected airspeed, written when you set one',
        },
        {
          kind: 'dataref',
          name: D.airspeedIsMach,
          required: true,
          purpose: 'Whether the selected airspeed is in knots or Mach',
        },
        {
          kind: 'command',
          name: C.knotsMachToggle,
          required: false,
          purpose: 'Knots and Mach switch',
        },
      ],
    },
    modeFeature(FEATURE_MODE_HDG, 'HDG mode', D.headingStatus, C.modeHeading),
    modeFeature(FEATURE_MODE_NAV, 'NAV mode', D.navStatus, C.modeNav),
    modeFeature(FEATURE_MODE_APR, 'APR mode', D.approachStatus, C.modeApproach, [
      { kind: 'dataref', name: D.glideslopeStatus, required: false, purpose: 'Glideslope state' },
    ]),
    modeFeature(FEATURE_MODE_ALT, 'ALT mode', D.altitudeStatus, C.modeAltitude),
    modeFeature(FEATURE_MODE_VS, 'VS mode', D.verticalSpeedStatus, C.modeVerticalSpeed),
    modeFeature(FEATURE_MODE_FLC, 'FLC mode', D.speedStatus, C.modeLevelChange),
    {
      id: FEATURE_NAV_DEVIATION,
      label: 'Course deviation',
      bindings: [
        { kind: 'dataref', name: D.hsiHdef, required: true, purpose: 'Course deviation' },
        { kind: 'dataref', name: D.hsiFromTo, required: true, purpose: 'To/from flag' },
        {
          kind: 'dataref',
          name: D.hsiHorizontal,
          required: true,
          purpose: 'Course signal valid',
        },
      ],
    },
    {
      id: FEATURE_NAV_GLIDESLOPE,
      label: 'Glideslope',
      bindings: [
        { kind: 'dataref', name: D.hsiVdef, required: true, purpose: 'Glideslope deviation' },
        {
          kind: 'dataref',
          name: D.hsiVertical,
          required: true,
          purpose: 'Glideslope signal valid',
        },
        { kind: 'dataref', name: D.hsiGsFlag, required: true, purpose: 'Glideslope flag' },
      ],
    },
    {
      id: FEATURE_NAV_SOURCE,
      label: 'HSI source',
      bindings: [
        {
          kind: 'dataref',
          name: D.hsiSource,
          required: true,
          write: true,
          purpose: 'HSI source, written when you choose one',
        },
      ],
    },
    {
      id: FEATURE_NAV_COURSE,
      label: 'HSI course',
      bindings: [
        {
          kind: 'dataref',
          name: D.hsiCourse,
          required: true,
          write: true,
          purpose: 'HSI course, written when you set one',
        },
        {
          kind: 'command',
          name: C.hsiDirect,
          required: false,
          purpose: 'Course direct-to (CTR)',
        },
      ],
    },
    {
      id: FEATURE_NAV_AIDS,
      label: 'Navigation aids',
      bindings: [
        { kind: 'dataref', name: D.nav1Bearing, required: false, purpose: 'NAV1 bearing' },
        { kind: 'dataref', name: D.nav2Bearing, required: false, purpose: 'NAV2 bearing' },
        { kind: 'dataref', name: D.nav1Signal, required: false, purpose: 'NAV1 signal valid' },
        { kind: 'dataref', name: D.nav2Signal, required: false, purpose: 'NAV2 signal valid' },
        { kind: 'dataref', name: D.hsiHasDme, required: false, purpose: 'DME signal' },
        { kind: 'dataref', name: D.hsiDmeDistance, required: false, purpose: 'DME distance' },
        { kind: 'dataref', name: D.hsiDmeSpeed, required: false, purpose: 'DME ground speed' },
        { kind: 'dataref', name: D.hsiDmeTime, required: false, purpose: 'DME time to station' },
        {
          kind: 'dataref',
          name: D.outerMarker,
          required: false,
          purpose: 'Marker beacons (outer)',
        },
        {
          kind: 'dataref',
          name: D.middleMarker,
          required: false,
          purpose: 'Marker beacons (middle)',
        },
        {
          kind: 'dataref',
          name: D.innerMarker,
          required: false,
          purpose: 'Marker beacons (inner)',
        },
      ],
    },
    cduScreenFeature(1),
    cduKeysFeature(1),
    cduScreenFeature(2),
    cduKeysFeature(2),
    ...SYSTEMS_FEATURE_SPECS,
    ...ENGINES_FEATURE_SPECS,
  ],
};
