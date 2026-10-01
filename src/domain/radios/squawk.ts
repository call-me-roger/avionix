/**
 * Squawk codes are four octal digits. X-Plane stores them as the decimal number with those digits
 * (`transponder_code`, "0000-7777"), so 7000 is 7000 and 0400 is 400.
 */
export const SQUAWK_LENGTH = 4;

const OCTAL_CODE = /^[0-7]{4}$/;

export function isSquawk(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 7777 &&
    OCTAL_CODE.test(String(value).padStart(SQUAWK_LENGTH, '0'))
  );
}

export function formatSquawk(value: number): string {
  return String(Math.round(value)).padStart(SQUAWK_LENGTH, '0');
}

const MEANINGS: Readonly<Record<number, string>> = {
  7500: 'unlawful interference',
  7600: 'radio failure',
  7700: 'emergency',
};

export function squawkMeaning(code: number): string | null {
  return MEANINGS[code] ?? null;
}

/** Network clients (VATSIM, IVAO) publish this code, so setting one takes a second tap. */
export function isEmergencySquawk(code: number): boolean {
  return squawkMeaning(code) !== null;
}
