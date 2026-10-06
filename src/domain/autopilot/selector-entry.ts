import {
  SELECTOR_LIMITS,
  type SelectorKind,
  formatSelector,
  normaliseHeading,
} from '@/domain/autopilot/selectors';

/** Typed digits and, for vertical speed only, a sign. */
export interface SelectorDraft {
  digits: string;
  negative: boolean;
}

export const EMPTY_SELECTOR_DRAFT: SelectorDraft = { digits: '', negative: false };

/** The digit keys of every selector keypad, in keypad order. */
export const SELECTOR_DIGITS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

const MAX_DIGITS: Readonly<Record<SelectorKind, number>> = {
  heading: 3,
  altitude: 5,
  verticalSpeed: 4,
  knots: 3,
  mach: 2,
};
const MIN_DIGITS: Readonly<Record<SelectorKind, number>> = {
  heading: 1,
  altitude: 1,
  verticalSpeed: 1,
  knots: 2,
  mach: 2,
};
/** The largest typed number (Mach in hundredths) any draft of this kind may reach. */
const MAX_TYPED: Readonly<Record<SelectorKind, number>> = {
  heading: 360,
  altitude: SELECTOR_LIMITS.altitude.max,
  verticalSpeed: SELECTOR_LIMITS.verticalSpeed.max,
  knots: SELECTOR_LIMITS.knots.max,
  mach: Math.round(SELECTOR_LIMITS.mach.max * 100),
};

export const SELECTOR_RANGE_MESSAGE: Readonly<Record<SelectorKind, string>> = {
  heading: 'Heading runs from 0 to 360.',
  altitude: 'Altitude runs from 0 to 50,000 ft.',
  verticalSpeed: 'Vertical speed runs from −9,900 to +9,900 fpm.',
  knots: 'Airspeed runs from 40 to 500 kt.',
  mach: 'Mach runs from .10 to .99.',
};

export type ParsedSelector =
  | { status: 'incomplete' }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; value: number; text: string };

export function hasSign(kind: SelectorKind): boolean {
  return kind === 'verticalSpeed';
}

export function pushSelectorDigit(
  kind: SelectorKind,
  draft: SelectorDraft,
  digit: number,
): SelectorDraft {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
    return draft;
  }
  if (draft.digits.length >= MAX_DIGITS[kind]) {
    return draft;
  }
  return { ...draft, digits: `${draft.digits}${digit}` };
}

export function deleteSelectorDigit(draft: SelectorDraft): SelectorDraft {
  return { ...draft, digits: draft.digits.slice(0, -1) };
}

export function toggleSelectorSign(kind: SelectorKind, draft: SelectorDraft): SelectorDraft {
  return hasSign(kind) ? { ...draft, negative: !draft.negative } : draft;
}

/** The draft as typed, with its unit: "5000 ft", "−1500 fpm", "M .7_". Empty → "". */
export function selectorDraftText(kind: SelectorKind, draft: SelectorDraft): string {
  if (draft.digits === '') {
    return '';
  }
  switch (kind) {
    case 'heading':
      return `${draft.digits}°`;
    case 'altitude':
      return `${draft.digits} ft`;
    case 'verticalSpeed':
      return `${draft.negative ? '−' : ''}${draft.digits} fpm`;
    case 'knots':
      return `${draft.digits} kt`;
    case 'mach':
      return `M .${draft.digits.padEnd(MAX_DIGITS.mach, '_')}`;
  }
}

/** What Set would send, or why it cannot. Never snapped to a nearby value (spec: no snapping). */
export function parseSelectorEntry(kind: SelectorKind, draft: SelectorDraft): ParsedSelector {
  if (!/^\d+$/.test(draft.digits) || draft.digits.length < MIN_DIGITS[kind]) {
    return { status: 'incomplete' };
  }
  const typed = Number(draft.digits);
  const invalid = { status: 'invalid' as const, message: SELECTOR_RANGE_MESSAGE[kind] };
  switch (kind) {
    case 'heading': {
      if (typed > 360) {
        return invalid;
      }
      const value = normaliseHeading(typed);
      return { status: 'valid', value, text: formatSelector(kind, value) };
    }
    case 'verticalSpeed': {
      const value = draft.negative && typed !== 0 ? -typed : typed;
      return Math.abs(value) > SELECTOR_LIMITS.verticalSpeed.max
        ? invalid
        : { status: 'valid', value, text: formatSelector(kind, value) };
    }
    case 'mach': {
      const value = typed / 100;
      const { min, max } = SELECTOR_LIMITS.mach;
      return value < min - 1e-9 || value > max + 1e-9
        ? invalid
        : { status: 'valid', value, text: formatSelector(kind, value) };
    }
    case 'altitude':
    case 'knots': {
      const { min, max } = SELECTOR_LIMITS[kind];
      return typed < min || typed > max
        ? invalid
        : { status: 'valid', value: typed, text: formatSelector(kind, typed) };
    }
  }
}

/**
 * Whether an invalid draft says why yet: only once more digits can no longer bring it into range
 * (full length, or already above the maximum), so the message never flashes mid-typing.
 */
export function explainSelector(
  kind: SelectorKind,
  draft: SelectorDraft,
  parsed: ParsedSelector,
): boolean {
  if (parsed.status !== 'invalid') {
    return false;
  }
  return draft.digits.length >= MAX_DIGITS[kind] || Number(draft.digits) > MAX_TYPED[kind];
}
