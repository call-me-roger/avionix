import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';

export const PRESENTATIONS = ['pfd', 'sixPack'] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

export interface PresentationPreferences {
  /** The last choice made, for an aircraft with no key or no stored choice (R3). */
  last: Presentation;
  /** The pilot's choice per aircraft key; it always wins over the engine-type default. */
  byAircraft: Readonly<Record<string, Presentation>>;
}

/** The PFD first: its digits read best on a phone. */
export const DEFAULT_PRESENTATION_PREFERENCES: PresentationPreferences = {
  last: 'pfd',
  byAircraft: {},
};

/** The ICAO type, else the description; a tail number alone names an airframe, not a type. */
export function aircraftKey(identity: AircraftIdentity): string | null {
  return identity.icaoType ?? identity.description ?? null;
}

/**
 * `sim/aircraft/prop/acf_en_type[0]`. Jets and rockets get the PFD; pistons, electrics and
 * turboprops the six-pack (the default King Air and Baron fly steam gauges). Unlisted codes have
 * no default.
 */
export function engineDefault(engineType: number | null): Presentation | null {
  switch (engineType) {
    case 5:
    case 6:
    case 7:
      return 'pfd';
    case 0:
    case 1:
    case 3:
    case 9:
    case 10:
      return 'sixPack';
    default:
      return null;
  }
}

export function resolvePresentation(
  prefs: PresentationPreferences,
  key: string | null,
  engineType: number | null,
): Presentation {
  const stored = key === null ? undefined : prefs.byAircraft[key];
  return stored ?? engineDefault(engineType) ?? prefs.last;
}

/** Returns `prefs` itself when nothing changes, so a no-op choice writes nothing. */
export function choosePresentation(
  prefs: PresentationPreferences,
  key: string | null,
  presentation: Presentation,
): PresentationPreferences {
  const storedMatches = key === null || prefs.byAircraft[key] === presentation;
  if (prefs.last === presentation && storedMatches) {
    return prefs;
  }
  return {
    last: presentation,
    byAircraft: key === null ? prefs.byAircraft : { ...prefs.byAircraft, [key]: presentation },
  };
}
