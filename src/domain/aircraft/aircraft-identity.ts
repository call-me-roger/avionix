/**
 * What the simulator says about the loaded aircraft. Every field is null until X-Plane answers,
 * and stays null when it has no answer: identification degrades, it never fails a connect (R2).
 */
export interface AircraftIdentity {
  icaoType: string | null;
  description: string | null;
  tailNumber: string | null;
  /** The add-on's own version, when the profile names a DataRef carrying one (R12). */
  addOnVersion: string | null;
}

export const UNIDENTIFIED: AircraftIdentity = {
  icaoType: null,
  description: null,
  tailNumber: null,
  addOnVersion: null,
};

/** True when X-Plane named the aircraft at all. The add-on version alone identifies nothing. */
export function isIdentified(identity: AircraftIdentity): boolean {
  return (
    identity.icaoType !== null || identity.description !== null || identity.tailNumber !== null
  );
}

/** One line naming the aircraft, or null when X-Plane reported nothing about it. */
export function identityLabel(identity: AircraftIdentity): string | null {
  const parts: string[] = [];
  if (identity.description !== null) {
    parts.push(
      identity.icaoType === null
        ? identity.description
        : `${identity.description} (${identity.icaoType})`,
    );
  } else if (identity.icaoType !== null) {
    parts.push(identity.icaoType);
  }
  if (identity.tailNumber !== null) {
    parts.push(identity.tailNumber);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}
