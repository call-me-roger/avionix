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
  FEATURE_CONNECTION_HEALTH,
  FEATURE_FLIGHT_DATA,
  FEATURE_FLIGHT_INSTRUMENTS,
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_GPS_DESTINATION,
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';

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

describe('profileBindings', () => {
  it('probes a name shared by two features once', () => {
    expect(profileBindings(shared)).toHaveLength(1);
  });

  it('keeps the write requirement when any feature writes to the name', () => {
    expect(profileBindings(shared)[0]?.write).toBe(true);
  });

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

  it('declares the Stage 1 features', () => {
    expect(GENERIC_PROFILE.features.map((feature) => feature.id)).toEqual([
      FEATURE_CONNECTION_HEALTH,
      FEATURE_FLIGHT_TELEMETRY,
      FEATURE_HEADING_CONTROL,
      FEATURE_FLIGHT_DATA,
      FEATURE_GPS_DESTINATION,
      FEATURE_FLIGHT_INSTRUMENTS,
      FEATURE_ALTIMETER_SETTING,
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

  it('names every DataRef once across the whole profile, except airspeed, which flight instruments deliberately reuses', () => {
    const names = GENERIC_PROFILE.features.flatMap((feature) =>
      feature.bindings.map((binding) => binding.name),
    );
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([GENERIC_DATAREFS.airspeed]);
  });

  it('bumps the profile version for the new bindings', () => {
    expect(GENERIC_PROFILE.version).toBe('1.2.0');
  });

  it('declares the flight instruments, every one optional, and the altimeter setting', () => {
    expect(GENERIC_PROFILE.version).toBe('1.2.0');
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
});
