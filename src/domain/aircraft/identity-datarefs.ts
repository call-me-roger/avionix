/**
 * The three `data`-typed DataRefs Avionix identifies an aircraft from. All three are community
 * convention, not confirmed against a Laminar-authored document, so all three are optional
 * everywhere — exactly as F-02 treats `sim/time/paused`.
 */
export const IDENTITY_DATAREFS = {
  icaoType: 'sim/aircraft/view/acf_ICAO',
  description: 'sim/aircraft/view/acf_descrip',
  tailNumber: 'sim/aircraft/view/acf_tailnum',
} as const;

export type IdentityField = keyof typeof IDENTITY_DATAREFS;

export const IDENTITY_FIELDS: readonly IdentityField[] = ['icaoType', 'description', 'tailNumber'];

export const IDENTITY_DATAREF_NAMES: readonly string[] = IDENTITY_FIELDS.map(
  (field) => IDENTITY_DATAREFS[field],
);

/** Which identity field a DataRef name fills, or null when the name is not one of the three. */
export function identityFieldFor(name: string): IdentityField | null {
  return IDENTITY_FIELDS.find((field) => IDENTITY_DATAREFS[field] === name) ?? null;
}
