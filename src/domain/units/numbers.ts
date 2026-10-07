/**
 * The one set of number formatters every panel shares (F-11's, reused by F-12), so a number shown
 * in two places, such as total fuel on the strip and on the Engines panel, can never drift.
 */

/** A true minus sign: a hyphen is easy to miss on a small screen. */
export const MINUS = '−';

/** Rounds and drops the sign of a negative zero, so -0.4 reads "0", never "-0". */
export function whole(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

/** Whole, U+2212 for negatives and no sign for zero, without grouping: "−5", "1320". */
export function signedWhole(value: number): string {
  const rounded = whole(value);
  return rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : String(rounded);
}

/** Whole, thousands grouped without Intl (its availability differs between Hermes builds), U+2212
 * for negatives and no sign for zero: "1,320", "−4". */
export function groupedWhole(value: number): string {
  const rounded = whole(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `${MINUS}${digits}` : digits;
}

/** `digits` decimals, U+2212 for negatives (and no sign when it rounds to zero). */
export function fixed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}
