/**
 * DataRefs and command used by the connectivity MVP. Names verified against
 * Laminar Research's DataRefs.txt / Commands.txt; see docs/xplane.md.
 * Numeric ids are resolved at runtime for every session and never stored.
 */
export const MVP_DATAREFS = {
  heartbeat: 'sim/time/total_running_time_sec',
  airspeed: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
  heading: 'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
} as const;

/**
 * Names that must not be able to fail a connect. `sim/time/paused` is community-sourced and
 * unverified against DataRefs.txt: without it the app reports "paused or not running" instead
 * of distinguishing the two, which is a worse message, not a broken feature.
 */
export const OPTIONAL_DATAREFS = {
  paused: 'sim/time/paused',
} as const;

export const MVP_DATAREF_NAMES: readonly string[] = Object.values(MVP_DATAREFS);
export const OPTIONAL_DATAREF_NAMES: readonly string[] = Object.values(OPTIONAL_DATAREFS);
export const ALL_DATAREF_NAMES: readonly string[] = [
  ...MVP_DATAREF_NAMES,
  ...OPTIONAL_DATAREF_NAMES,
];

export const MVP_COMMAND_HEADING_UP = 'sim/autopilot/heading_up';

/**
 * Which feature needs each binding, so diagnostics can name what a missing name costs
 * (F-02 R8). F-03 replaces this with per-aircraft profile metadata.
 */
export const BINDING_FEATURE: Record<string, string> = {
  [MVP_DATAREFS.heartbeat]: 'Connection health',
  [MVP_DATAREFS.airspeed]: 'Live telemetry',
  [MVP_DATAREFS.heading]: 'Heading control',
  [OPTIONAL_DATAREFS.paused]: 'Connection health',
  [MVP_COMMAND_HEADING_UP]: 'Heading control',
};
