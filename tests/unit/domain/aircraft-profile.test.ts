import { CDU_KEYS, cduCommand, cduExecLight, cduStyleLine, cduTextLine } from '@/domain/cdu/keys';
import {
  type AircraftProfile,
  commandBindingOf,
  findFeature,
  profileBindings,
  writeBindingOf,
} from '@/domain/aircraft/profile';
import { BUNDLED_PROFILES } from '@/domain/aircraft/profiles/catalog';
import {
  FEATURE_ALTIMETER_SETTING,
  FEATURE_AIRSPEED_SELECT,
  FEATURE_ALTITUDE_SELECT,
  FEATURE_AUTOPILOT,
  FEATURE_AUTOTHROTTLE,
  FEATURE_COM1,
  FEATURE_COM2,
  FEATURE_CONNECTION_HEALTH,
  FEATURE_FLIGHT_DATA,
  FEATURE_FLIGHT_DIRECTOR,
  FEATURE_FLIGHT_INSTRUMENTS,
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_GPS_DESTINATION,
  FEATURE_HEADING_CONTROL,
  FEATURE_MODE_ALT,
  FEATURE_MODE_APR,
  FEATURE_MODE_FLC,
  FEATURE_MODE_HDG,
  FEATURE_MODE_NAV,
  FEATURE_MODE_VS,
  FEATURE_NAV1,
  FEATURE_NAV2,
  FEATURE_NAV_AIDS,
  FEATURE_NAV_COURSE,
  FEATURE_NAV_DEVIATION,
  FEATURE_NAV_GLIDESLOPE,
  FEATURE_NAV_SOURCE,
  FEATURE_TRANSPONDER_CODE,
  FEATURE_TRANSPONDER_IDENT,
  FEATURE_TRANSPONDER_MODE,
  FEATURE_VERTICAL_SPEED_SELECT,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
  cduKeysFeatureId,
  cduScreenFeatureId,
} from '@/domain/aircraft/profiles/generic';
import {
  ANTI_ICE,
  AVIONICS_MASTER,
  BATTERY,
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
  PARKING_BRAKE,
  SYSTEMS_FEATURES,
  magnetoPositions,
  starterCommand,
} from '@/domain/systems/controls';

const shared: AircraftProfile = {
  id: 'test.shared',
  name: 'Shared names',
  version: '1.0.0',
  match: { kind: 'icao', codes: ['B738'] },
  features: [
    {
      id: 'reader',
      label: 'Reader',
      bindings: [{ kind: 'dataref', name: 'a/b', required: true, purpose: 'Reads it' }],
    },
    {
      id: 'writer',
      label: 'Writer',
      bindings: [
        { kind: 'dataref', name: 'a/b', required: true, write: true, purpose: 'Writes it' },
      ],
    },
  ],
};

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

describe('profileBindings', () => {
  it('probes a name shared by two features once', () => {
    expect(profileBindings(shared)).toHaveLength(1);
  });

  it('keeps the write requirement when any feature writes to the name', () => {
    expect(profileBindings(shared)[0]?.write).toBe(true);
  });

  /** The names one `cdu{n}-screen` feature declares, in declaration order. */
  function cduScreenNames(unit: 1 | 2): string[] {
    const lines = Array.from({ length: 16 }, (_, line) => line);
    return [
      ...lines.map((line) => cduTextLine(unit, line)),
      ...lines.map((line) => cduStyleLine(unit, line)),
    ];
  }

  /** The names one `cdu{n}-keys` feature declares, in declaration order. */
  function cduKeysNames(unit: 1 | 2): string[] {
    return [cduExecLight(unit), ...CDU_KEYS.map((entry) => cduCommand(unit, entry.id))];
  }

  it('lists every distinct name of the generic profile', () => {
    const names = profileBindings(GENERIC_PROFILE).map((binding) => binding.name);
    expect(names).toEqual([
      GENERIC_DATAREFS.heartbeat,
      GENERIC_DATAREFS.paused,
      GENERIC_DATAREFS.airspeed,
      GENERIC_DATAREFS.headingBug,
      GENERIC_COMMANDS.headingUp,
      GENERIC_DATAREFS.groundSpeed,
      GENERIC_DATAREFS.trueAirspeed,
      GENERIC_DATAREFS.groundTrack,
      GENERIC_DATAREFS.windSpeed,
      GENERIC_DATAREFS.windDirection,
      GENERIC_DATAREFS.outsideAirTemp,
      GENERIC_DATAREFS.totalAirTemp,
      GENERIC_DATAREFS.fuelTotal,
      GENERIC_DATAREFS.zuluTime,
      GENERIC_DATAREFS.localTime,
      GENERIC_DATAREFS.inReplay,
      GENERIC_DATAREFS.gpsDistance,
      GENERIC_DATAREFS.gpsTimeToGo,
      GENERIC_DATAREFS.gpsDestinationId,
      GENERIC_DATAREFS.mach,
      GENERIC_DATAREFS.altitude,
      GENERIC_DATAREFS.verticalSpeed,
      GENERIC_DATAREFS.heading,
      GENERIC_DATAREFS.pitch,
      GENERIC_DATAREFS.roll,
      GENERIC_DATAREFS.turnRate,
      GENERIC_DATAREFS.slip,
      GENERIC_DATAREFS.radioAltitude,
      GENERIC_DATAREFS.engineType,
      GENERIC_DATAREFS.vso,
      GENERIC_DATAREFS.vs,
      GENERIC_DATAREFS.vfe,
      GENERIC_DATAREFS.vno,
      GENERIC_DATAREFS.vne,
      GENERIC_DATAREFS.barometer,
      GENERIC_DATAREFS.com1Active,
      GENERIC_DATAREFS.com1Standby,
      GENERIC_COMMANDS.com1Flip,
      GENERIC_DATAREFS.com2Active,
      GENERIC_DATAREFS.com2Standby,
      GENERIC_COMMANDS.com2Flip,
      GENERIC_DATAREFS.nav1Active,
      GENERIC_DATAREFS.nav1Standby,
      GENERIC_COMMANDS.nav1Flip,
      GENERIC_DATAREFS.nav1Id,
      GENERIC_DATAREFS.nav1HasDme,
      GENERIC_DATAREFS.nav1Dme,
      GENERIC_DATAREFS.nav1Course,
      GENERIC_DATAREFS.nav2Active,
      GENERIC_DATAREFS.nav2Standby,
      GENERIC_COMMANDS.nav2Flip,
      GENERIC_DATAREFS.nav2Id,
      GENERIC_DATAREFS.nav2HasDme,
      GENERIC_DATAREFS.nav2Dme,
      GENERIC_DATAREFS.nav2Course,
      GENERIC_DATAREFS.transponderCode,
      GENERIC_DATAREFS.atcAssignedCode,
      GENERIC_DATAREFS.transponderMode,
      GENERIC_COMMANDS.transponderIdent,
      GENERIC_DATAREFS.transponderIdenting,
      GENERIC_DATAREFS.autopilotServos,
      GENERIC_COMMANDS.autopilotEngage,
      GENERIC_COMMANDS.autopilotDisconnect,
      GENERIC_DATAREFS.autopilotOverride,
      GENERIC_DATAREFS.rollStatus,
      GENERIC_DATAREFS.pitchStatus,
      GENERIC_DATAREFS.flightDirectorBars,
      GENERIC_COMMANDS.flightDirectorOn,
      GENERIC_COMMANDS.flightDirectorOff,
      GENERIC_DATAREFS.autothrottle,
      GENERIC_COMMANDS.autothrottleOn,
      GENERIC_COMMANDS.autothrottleOff,
      GENERIC_COMMANDS.autothrottleArm,
      GENERIC_COMMANDS.autothrottleDisarm,
      GENERIC_DATAREFS.altitudeDial,
      GENERIC_DATAREFS.verticalSpeedDial,
      GENERIC_DATAREFS.airspeedDial,
      GENERIC_DATAREFS.airspeedIsMach,
      GENERIC_COMMANDS.knotsMachToggle,
      GENERIC_DATAREFS.headingStatus,
      GENERIC_COMMANDS.modeHeading,
      GENERIC_DATAREFS.navStatus,
      GENERIC_COMMANDS.modeNav,
      GENERIC_DATAREFS.approachStatus,
      GENERIC_COMMANDS.modeApproach,
      GENERIC_DATAREFS.glideslopeStatus,
      GENERIC_DATAREFS.altitudeStatus,
      GENERIC_COMMANDS.modeAltitude,
      GENERIC_DATAREFS.verticalSpeedStatus,
      GENERIC_COMMANDS.modeVerticalSpeed,
      GENERIC_DATAREFS.speedStatus,
      GENERIC_COMMANDS.modeLevelChange,
      GENERIC_DATAREFS.hsiHdef,
      GENERIC_DATAREFS.hsiFromTo,
      GENERIC_DATAREFS.hsiHorizontal,
      GENERIC_DATAREFS.hsiVdef,
      GENERIC_DATAREFS.hsiVertical,
      GENERIC_DATAREFS.hsiGsFlag,
      GENERIC_DATAREFS.hsiSource,
      GENERIC_DATAREFS.hsiCourse,
      GENERIC_COMMANDS.hsiDirect,
      GENERIC_DATAREFS.nav1Bearing,
      GENERIC_DATAREFS.nav2Bearing,
      GENERIC_DATAREFS.nav1Signal,
      GENERIC_DATAREFS.nav2Signal,
      GENERIC_DATAREFS.hsiHasDme,
      GENERIC_DATAREFS.hsiDmeDistance,
      GENERIC_DATAREFS.hsiDmeSpeed,
      GENERIC_DATAREFS.hsiDmeTime,
      GENERIC_DATAREFS.outerMarker,
      GENERIC_DATAREFS.middleMarker,
      GENERIC_DATAREFS.innerMarker,
      ...cduScreenNames(1),
      ...cduKeysNames(1),
      ...cduScreenNames(2),
      ...cduKeysNames(2),
      ...systemsNames(),
    ]);
  });
});

describe('feature lookup', () => {
  it('finds a declared feature and answers null for one the profile does not have', () => {
    expect(findFeature(GENERIC_PROFILE, FEATURE_FLIGHT_TELEMETRY)?.label).toBe('Live telemetry');
    expect(findFeature(GENERIC_PROFILE, 'autopilot')).toBeNull();
  });

  it('finds the dataref a feature writes to, and its command', () => {
    expect(writeBindingOf(GENERIC_PROFILE, FEATURE_HEADING_CONTROL)?.name).toBe(
      GENERIC_DATAREFS.headingBug,
    );
    expect(commandBindingOf(GENERIC_PROFILE, FEATURE_HEADING_CONTROL)?.name).toBe(
      GENERIC_COMMANDS.headingUp,
    );
    expect(writeBindingOf(GENERIC_PROFILE, FEATURE_CONNECTION_HEALTH)).toBeNull();
  });
});

describe('the generic profile', () => {
  it('is the catalog fallback and matches generically', () => {
    expect(BUNDLED_PROFILES.generic).toBe(GENERIC_PROFILE);
    expect(GENERIC_PROFILE.match).toEqual({ kind: 'generic' });
    expect(GENERIC_PROFILE.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares the Stage 1 features, then the F-30, F-32 and F-24 features', () => {
    expect(GENERIC_PROFILE.features.map((feature) => feature.id)).toEqual([
      FEATURE_CONNECTION_HEALTH,
      FEATURE_FLIGHT_TELEMETRY,
      FEATURE_HEADING_CONTROL,
      FEATURE_FLIGHT_DATA,
      FEATURE_GPS_DESTINATION,
      FEATURE_FLIGHT_INSTRUMENTS,
      FEATURE_ALTIMETER_SETTING,
      FEATURE_COM1,
      FEATURE_COM2,
      FEATURE_NAV1,
      FEATURE_NAV2,
      FEATURE_TRANSPONDER_CODE,
      FEATURE_TRANSPONDER_MODE,
      FEATURE_TRANSPONDER_IDENT,
      FEATURE_AUTOPILOT,
      FEATURE_FLIGHT_DIRECTOR,
      FEATURE_AUTOTHROTTLE,
      FEATURE_ALTITUDE_SELECT,
      FEATURE_VERTICAL_SPEED_SELECT,
      FEATURE_AIRSPEED_SELECT,
      FEATURE_MODE_HDG,
      FEATURE_MODE_NAV,
      FEATURE_MODE_APR,
      FEATURE_MODE_ALT,
      FEATURE_MODE_VS,
      FEATURE_MODE_FLC,
      FEATURE_NAV_DEVIATION,
      FEATURE_NAV_GLIDESLOPE,
      FEATURE_NAV_SOURCE,
      FEATURE_NAV_COURSE,
      FEATURE_NAV_AIDS,
      cduScreenFeatureId(1),
      cduKeysFeatureId(1),
      cduScreenFeatureId(2),
      cduKeysFeatureId(2),
      ...SYSTEMS_FEATURES,
    ]);
  });

  it('binds connection health to the simulator clock and the pause flag', () => {
    const health = findFeature(GENERIC_PROFILE, FEATURE_CONNECTION_HEALTH);
    expect(health?.bindings.map((binding) => [binding.name, binding.required])).toEqual([
      [GENERIC_DATAREFS.heartbeat, true],
      [GENERIC_DATAREFS.paused, false],
    ]);
  });

  it('gives every binding a purpose, because the view prints it when the name is missing', () => {
    for (const binding of profileBindings(GENERIC_PROFILE)) {
      expect(binding.purpose.length).toBeGreaterThan(0);
    }
  });

  it('ships no named profiles yet; Stage 4 adds the first one', () => {
    expect(BUNDLED_PROFILES.named).toEqual([]);
  });

  it('makes every flight data and destination binding optional and read-only', () => {
    for (const featureId of [FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION]) {
      const feature = findFeature(GENERIC_PROFILE, featureId);
      expect(feature).not.toBeNull();
      for (const binding of feature?.bindings ?? []) {
        expect({ name: binding.name, required: binding.required, write: binding.write }).toEqual({
          name: binding.name,
          required: false,
          write: undefined,
        });
        expect(binding.kind).toBe('dataref');
      }
    }
  });

  it('names every DataRef once across the whole profile, except airspeed and engine type, which another feature deliberately reuses', () => {
    const names = GENERIC_PROFILE.features.flatMap((feature) =>
      feature.bindings.map((binding) => binding.name),
    );
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([GENERIC_DATAREFS.airspeed, GENERIC_DATAREFS.engineType]);
  });

  it('bumps the profile version for the new bindings', () => {
    expect(GENERIC_PROFILE.version).toBe('1.7.0');
  });

  it('declares the flight instruments, every one optional, and the altimeter setting', () => {
    expect(GENERIC_PROFILE.version).toBe('1.7.0');
    const instruments = findFeature(GENERIC_PROFILE, FEATURE_FLIGHT_INSTRUMENTS);
    expect(instruments?.label).toBe('Flight instruments');
    expect(instruments?.bindings.map((binding) => binding.name)).toEqual([
      GENERIC_DATAREFS.airspeed,
      GENERIC_DATAREFS.mach,
      GENERIC_DATAREFS.altitude,
      GENERIC_DATAREFS.verticalSpeed,
      GENERIC_DATAREFS.heading,
      GENERIC_DATAREFS.pitch,
      GENERIC_DATAREFS.roll,
      GENERIC_DATAREFS.turnRate,
      GENERIC_DATAREFS.slip,
      GENERIC_DATAREFS.radioAltitude,
      GENERIC_DATAREFS.engineType,
      GENERIC_DATAREFS.vso,
      GENERIC_DATAREFS.vs,
      GENERIC_DATAREFS.vfe,
      GENERIC_DATAREFS.vno,
      GENERIC_DATAREFS.vne,
    ]);
    expect(instruments?.bindings.every((binding) => !binding.required && !binding.write)).toBe(
      true,
    );
    const baro = findFeature(GENERIC_PROFILE, FEATURE_ALTIMETER_SETTING);
    expect(baro?.bindings).toEqual([
      expect.objectContaining({
        kind: 'dataref',
        name: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
        required: true,
        write: true,
      }),
    ]);
  });

  it('declares one feature per radio, each with its standby written and its swap command', () => {
    const radios = [
      [
        FEATURE_COM1,
        'COM1',
        GENERIC_DATAREFS.com1Active,
        GENERIC_DATAREFS.com1Standby,
        GENERIC_COMMANDS.com1Flip,
      ],
      [
        FEATURE_COM2,
        'COM2',
        GENERIC_DATAREFS.com2Active,
        GENERIC_DATAREFS.com2Standby,
        GENERIC_COMMANDS.com2Flip,
      ],
      [
        FEATURE_NAV1,
        'NAV1',
        GENERIC_DATAREFS.nav1Active,
        GENERIC_DATAREFS.nav1Standby,
        GENERIC_COMMANDS.nav1Flip,
      ],
      [
        FEATURE_NAV2,
        'NAV2',
        GENERIC_DATAREFS.nav2Active,
        GENERIC_DATAREFS.nav2Standby,
        GENERIC_COMMANDS.nav2Flip,
      ],
    ] as const;
    for (const [id, label, active, standby, flip] of radios) {
      const feature = findFeature(GENERIC_PROFILE, id);
      expect(feature?.label).toBe(label);
      const required = feature?.bindings.filter((binding) => binding.required);
      expect(
        required?.map((binding) => [binding.kind, binding.name, binding.write === true]),
      ).toEqual([
        ['dataref', active, false],
        ['dataref', standby, true],
        ['command', flip, false],
      ]);
    }
    expect(
      findFeature(GENERIC_PROFILE, FEATURE_NAV1)
        ?.bindings.filter((binding) => !binding.required)
        .map((binding) => binding.name),
    ).toEqual([
      GENERIC_DATAREFS.nav1Id,
      GENERIC_DATAREFS.nav1HasDme,
      GENERIC_DATAREFS.nav1Dme,
      GENERIC_DATAREFS.nav1Course,
    ]);
    expect(findFeature(GENERIC_PROFILE, FEATURE_COM1)?.bindings).toHaveLength(3);
  });

  it('declares the transponder as three features, the assigned code optional', () => {
    expect(
      findFeature(GENERIC_PROFILE, FEATURE_TRANSPONDER_CODE)?.bindings.map((binding) => [
        binding.name,
        binding.required,
        binding.write === true,
      ]),
    ).toEqual([
      [GENERIC_DATAREFS.transponderCode, true, true],
      [GENERIC_DATAREFS.atcAssignedCode, false, false],
    ]);
    expect(
      findFeature(GENERIC_PROFILE, FEATURE_TRANSPONDER_MODE)?.bindings.map((binding) => [
        binding.name,
        binding.required,
        binding.write === true,
      ]),
    ).toEqual([[GENERIC_DATAREFS.transponderMode, true, true]]);
    expect(
      findFeature(GENERIC_PROFILE, FEATURE_TRANSPONDER_IDENT)?.bindings.map((binding) => [
        binding.kind,
        binding.name,
        binding.required,
      ]),
    ).toEqual([
      ['command', GENERIC_COMMANDS.transponderIdent, true],
      ['dataref', GENERIC_DATAREFS.transponderIdenting, false],
    ]);
  });

  it('uses Laminar’s spelling of the swap commands', () => {
    expect(GENERIC_COMMANDS.com1Flip).toBe('sim/radios/com1_standy_flip');
    expect(GENERIC_COMMANDS.nav2Flip).toBe('sim/radios/nav2_standy_flip');
    expect(GENERIC_COMMANDS.transponderIdent).toBe('sim/transponder/transponder_ident');
  });
});

describe('the generic profile’s autopilot (F-20)', () => {
  const bindingsOf = (id: string) =>
    findFeature(GENERIC_PROFILE, id)?.bindings.map((binding) => [
      binding.kind,
      binding.name,
      binding.required,
      binding.write === true,
    ]);

  it('engages and disconnects by separate commands, and reads the override optionally', () => {
    expect(bindingsOf(FEATURE_AUTOPILOT)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/servos_on', true, false],
      ['command', 'sim/autopilot/servos_on', true, false],
      ['command', 'sim/autopilot/servos_off_any', true, false],
      ['dataref', 'sim/operation/override/override_autopilot', false, false],
      ['dataref', 'sim/cockpit2/autopilot/roll_status', false, false],
      ['dataref', 'sim/cockpit2/autopilot/pitch_status', false, false],
    ]);
  });

  it('writes each selector, and reads the knots/Mach flag', () => {
    expect(bindingsOf(FEATURE_ALTITUDE_SELECT)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/altitude_dial_ft', true, true],
    ]);
    expect(bindingsOf(FEATURE_VERTICAL_SPEED_SELECT)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/vvi_dial_fpm', true, true],
    ]);
    expect(bindingsOf(FEATURE_AIRSPEED_SELECT)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/airspeed_dial_kts_mach', true, true],
      ['dataref', 'sim/cockpit2/autopilot/airspeed_is_mach', true, false],
      ['command', 'sim/autopilot/knots_mach_toggle', false, false],
    ]);
  });

  it('gives each mode its status and its command, and the approach an optional glideslope', () => {
    expect(bindingsOf(FEATURE_MODE_APR)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/approach_status', true, false],
      ['command', 'sim/autopilot/approach', true, false],
      ['dataref', 'sim/cockpit2/autopilot/glideslope_status', false, false],
    ]);
    expect(bindingsOf(FEATURE_MODE_FLC)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/speed_status', true, false],
      ['command', 'sim/autopilot/level_change', true, false],
    ]);
  });

  it('never declares a write to the override or the autopilot_state bit field', () => {
    const written = GENERIC_PROFILE.features.flatMap((feature) =>
      feature.bindings.filter((binding) => binding.write === true).map((binding) => binding.name),
    );
    expect(written).not.toContain('sim/operation/override/override_autopilot');
    expect(written).not.toContain('sim/cockpit/autopilot/autopilot_state');
  });
});

describe('the generic profile’s navigation features (F-30)', () => {
  const bindingsOf = (id: string) =>
    findFeature(GENERIC_PROFILE, id)?.bindings.map((binding) => [
      binding.kind,
      binding.name,
      binding.required,
      binding.write === true,
    ]);

  it('requires every lateral deviation binding', () => {
    expect(bindingsOf(FEATURE_NAV_DEVIATION)).toEqual([
      ['dataref', GENERIC_DATAREFS.hsiHdef, true, false],
      ['dataref', GENERIC_DATAREFS.hsiFromTo, true, false],
      ['dataref', GENERIC_DATAREFS.hsiHorizontal, true, false],
    ]);
  });

  it('requires every glideslope binding', () => {
    expect(bindingsOf(FEATURE_NAV_GLIDESLOPE)).toEqual([
      ['dataref', GENERIC_DATAREFS.hsiVdef, true, false],
      ['dataref', GENERIC_DATAREFS.hsiVertical, true, false],
      ['dataref', GENERIC_DATAREFS.hsiGsFlag, true, false],
    ]);
  });

  it('binds nav-source to the HSI source, written when you choose one', () => {
    expect(bindingsOf(FEATURE_NAV_SOURCE)).toEqual([
      ['dataref', GENERIC_DATAREFS.hsiSource, true, true],
    ]);
  });

  it('binds nav-course to a required, written course and an optional direct-to command', () => {
    expect(bindingsOf(FEATURE_NAV_COURSE)).toEqual([
      ['dataref', GENERIC_DATAREFS.hsiCourse, true, true],
      ['command', GENERIC_COMMANDS.hsiDirect, false, false],
    ]);
  });

  it('makes every nav-aids binding optional, so a missing name drops only its cue', () => {
    const aids = findFeature(GENERIC_PROFILE, FEATURE_NAV_AIDS);
    expect(aids?.bindings.length).toBeGreaterThan(0);
    for (const binding of aids?.bindings ?? []) {
      expect(binding.required).toBe(false);
    }
    expect(aids?.bindings.map((binding) => binding.name)).toEqual([
      GENERIC_DATAREFS.nav1Bearing,
      GENERIC_DATAREFS.nav2Bearing,
      GENERIC_DATAREFS.nav1Signal,
      GENERIC_DATAREFS.nav2Signal,
      GENERIC_DATAREFS.hsiHasDme,
      GENERIC_DATAREFS.hsiDmeDistance,
      GENERIC_DATAREFS.hsiDmeSpeed,
      GENERIC_DATAREFS.hsiDmeTime,
      GENERIC_DATAREFS.outerMarker,
      GENERIC_DATAREFS.middleMarker,
      GENERIC_DATAREFS.innerMarker,
    ]);
  });
});

describe('CDU features (F-32)', () => {
  it('bumps the profile version for the CDU bindings', () => {
    expect(GENERIC_PROFILE.version).toBe('1.7.0');
  });

  it.each([1, 2] as const)(
    'declares cdu%i-screen with 32 bindings, text required and style optional',
    (unit) => {
      const feature = findFeature(GENERIC_PROFILE, cduScreenFeatureId(unit));
      expect(feature?.label).toBe(`CDU ${unit} screen`);
      const lines = Array.from({ length: 16 }, (_, line) => line);
      expect(
        feature?.bindings.map((binding) => [binding.kind, binding.name, binding.required]),
      ).toEqual([
        ...lines.map((line) => ['dataref', cduTextLine(unit, line), true]),
        ...lines.map((line) => ['dataref', cduStyleLine(unit, line), false]),
      ]);
      expect(feature?.bindings).toHaveLength(32);
      expect(feature?.bindings.every((binding) => binding.write === undefined)).toBe(true);
    },
  );

  it.each([1, 2] as const)(
    'declares cdu%i-keys with 71 bindings: the EXEC light and every CDU key',
    (unit) => {
      const feature = findFeature(GENERIC_PROFILE, cduKeysFeatureId(unit));
      expect(feature?.label).toBe(`CDU ${unit} keys`);
      expect(
        feature?.bindings.map((binding) => [binding.kind, binding.name, binding.required]),
      ).toEqual([
        ['dataref', cduExecLight(unit), false],
        ...CDU_KEYS.map((entry) => ['command', cduCommand(unit, entry.id), false]),
      ]);
      expect(feature?.bindings).toHaveLength(71);
    },
  );

  it('names cduScreenFeatureId and cduKeysFeatureId by unit', () => {
    expect(cduScreenFeatureId(2)).toBe('cdu2-screen');
    expect(cduKeysFeatureId(1)).toBe('cdu1-keys');
  });
});

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
    expect(
      bindings(FEATURE_LIGHTS_EXTERIOR).map((binding) => [binding.kind, binding.name]),
    ).toEqual(
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
