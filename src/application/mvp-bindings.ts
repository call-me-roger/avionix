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

export const MVP_DATAREF_NAMES: readonly string[] = Object.values(MVP_DATAREFS);

export const MVP_COMMAND_HEADING_UP = 'sim/autopilot/heading_up';
