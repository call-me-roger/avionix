import type { AircraftProfile } from '@/domain/aircraft/profile';

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
} as const;

export const GENERIC_COMMANDS = {
  headingUp: 'sim/autopilot/heading_up',
} as const;

export const FEATURE_CONNECTION_HEALTH = 'connection-health';
export const FEATURE_FLIGHT_TELEMETRY = 'flight-telemetry';
export const FEATURE_HEADING_CONTROL = 'heading-control';
export const FEATURE_FLIGHT_DATA = 'flight-data';
export const FEATURE_GPS_DESTINATION = 'gps-destination';
export const FEATURE_FLIGHT_INSTRUMENTS = 'flight-instruments';
export const FEATURE_ALTIMETER_SETTING = 'altimeter-setting';

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
 */
export const GENERIC_PROFILE: AircraftProfile = {
  id: 'avionix.generic',
  name: 'Generic X-Plane aircraft',
  version: '1.2.0',
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
  ],
};
