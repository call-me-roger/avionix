export interface ModePosition {
  value: number;
  label: string;
  /** What a screen reader says: "Transponder standby". */
  spoken: string;
}

/** The positions the panel offers; the Mode S and TCAS values belong to F-40. */
export const MODE_POSITIONS: readonly ModePosition[] = [
  { value: 0, label: 'OFF', spoken: 'off' },
  { value: 1, label: 'STBY', spoken: 'standby' },
  { value: 2, label: 'ON', spoken: 'on' },
  { value: 3, label: 'ALT', spoken: 'altitude' },
];

/** Laminar's `transponder_mode` enum. */
const REPORTED: Readonly<Record<number, string>> = {
  0: 'OFF',
  1: 'STBY',
  2: 'ON',
  3: 'ALT',
  4: 'TEST',
  5: 'GND',
  6: 'TA ONLY',
  7: 'TA/RA',
};

export function modeLabel(value: number | null): string | null {
  if (value === null || !Number.isInteger(value)) {
    return null;
  }
  return REPORTED[value] ?? null;
}
