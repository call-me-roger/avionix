export type ModeState = 'off' | 'armed' | 'engaged';

/** X-Plane's `*_status` DataRefs: 0 off, 1 armed, 2 captured (R2, R5). */
export function modeState(value: number | null): ModeState {
  if (value === null) {
    return 'off';
  }
  if (value >= 2) {
    return 'engaged';
  }
  return value >= 1 ? 'armed' : 'off';
}

/** Every status the annunciator reads, null where X-Plane reported none. */
export interface ModeStatuses {
  hdg: number | null;
  nav: number | null;
  apr: number | null;
  alt: number | null;
  vs: number | null;
  flc: number | null;
  gs: number | null;
  rol: number | null;
  pit: number | null;
}

type StatusKey = keyof ModeStatuses;

/** Precedence: the first engaged one is the axis's active mode. */
export const LATERAL: readonly (readonly [StatusKey, string])[] = [
  ['apr', 'APR'],
  ['nav', 'NAV'],
  ['hdg', 'HDG'],
  ['rol', 'ROL'],
];
export const VERTICAL: readonly (readonly [StatusKey, string])[] = [
  ['gs', 'GS'],
  ['alt', 'ALT'],
  ['flc', 'FLC'],
  ['vs', 'VS'],
  ['pit', 'PIT'],
];
export const ARMABLE: readonly (readonly [StatusKey, string])[] = [
  ['nav', 'NAV'],
  ['apr', 'APR'],
  ['alt', 'ALT'],
  ['gs', 'GS'],
];

export function autothrottleWord(value: number | null): string | null {
  if (value === null || value < 1) {
    return null;
  }
  if (value === 1) {
    return 'SPD';
  }
  if (value === 2) {
    return 'N1';
  }
  return value === 3 ? 'RETARD' : 'ON';
}

/** `autothrottle_enabled`: −1 is hard off, 0 armed (servos declutched), 1 and up active. */
export function autothrottleArmed(value: number | null): boolean {
  return value !== null && value >= 0;
}

export function autothrottleEngaged(value: number | null): boolean {
  return value !== null && value >= 1;
}

/** One line, read like a flight-mode annunciator: "HDG · ALT · Armed NAV, GS · A/T SPD". */
export function annunciationText(statuses: ModeStatuses, autothrottle: number | null): string {
  const engaged = (axis: typeof LATERAL) =>
    axis.find(([key]) => modeState(statuses[key]) === 'engaged')?.[1] ?? null;
  const armed = ARMABLE.filter(([key]) => modeState(statuses[key]) === 'armed').map(
    ([, label]) => label,
  );
  const word = autothrottleWord(autothrottle);
  const parts = [
    engaged(LATERAL),
    engaged(VERTICAL),
    armed.length === 0 ? null : `Armed ${armed.join(', ')}`,
    word === null ? null : `A/T ${word}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? 'No modes engaged' : parts.join(' · ');
}

/** R4's sentence when a mode press did not change X-Plane's state. */
export function modeNotTaken(label: string, wasOff: boolean, needsSource: boolean): string {
  if (!wasOff) {
    return `X-Plane did not turn ${label} off.`;
  }
  return `X-Plane did not engage ${label}.${needsSource ? ' Check the navigation source.' : ''}`;
}
