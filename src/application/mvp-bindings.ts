import { GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';

/**
 * The three lists `SimulatorSession`'s current resolution loop still needs, derived from the
 * generic profile so no name is written twice. The next task replaces that loop with a
 * profile-driven probe and deletes this file.
 */
export const MVP_DATAREF_NAMES: readonly string[] = [
  GENERIC_DATAREFS.heartbeat,
  GENERIC_DATAREFS.airspeed,
  GENERIC_DATAREFS.headingBug,
];

export const OPTIONAL_DATAREF_NAMES: readonly string[] = [GENERIC_DATAREFS.paused];

export const ALL_DATAREF_NAMES: readonly string[] = [
  ...MVP_DATAREF_NAMES,
  ...OPTIONAL_DATAREF_NAMES,
];
