import {
  COM_BAND_MESSAGE,
  NAV_BAND_MESSAGE,
  comRejection,
  formatCom,
  formatNav,
  navRejection,
} from '@/domain/radios/channels';
import { formatSquawk, isSquawk, squawkMeaning } from '@/domain/radios/squawk';

export type EntryKind = 'com' | 'nav' | 'squawk';

export const MAX_DIGITS: Readonly<Record<EntryKind, number>> = { com: 6, nav: 5, squawk: 4 };
const MIN_DIGITS: Readonly<Record<EntryKind, number>> = { com: 3, nav: 3, squawk: 4 };
/** Frequencies are typed without a point; it is implied after the MHz digits. */
const MHZ_DIGITS = 3;
const DIGITS_ONLY = /^\d*$/;

export type ParsedEntry =
  | { status: 'incomplete'; message: string | null }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; value: number; text: string; note: string | null };

/** A squawk keypad offers 0–7 only, like a real control head: 8 and 9 cannot be entered. */
export function keyAccepted(kind: EntryKind, digit: number): boolean {
  return Number.isInteger(digit) && digit >= 0 && digit <= (kind === 'squawk' ? 7 : 9);
}

/** The digit keys in keypad order: 1–9 (or 1–7), then 0. */
export function entryDigits(kind: EntryKind): number[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].filter((digit) => keyAccepted(kind, digit));
}

export function pushDigit(kind: EntryKind, draft: string, digit: number): string {
  if (!keyAccepted(kind, digit) || draft.length >= MAX_DIGITS[kind]) {
    return draft;
  }
  return `${draft}${digit}`;
}

export function deleteDigit(draft: string): string {
  return draft.slice(0, -1);
}

/** The draft as the pilot reads it: "121.5__", "110.3_", "70__". */
export function entryText(kind: EntryKind, draft: string): string {
  const padded = draft.padEnd(MAX_DIGITS[kind], '_');
  return kind === 'squawk' ? padded : `${padded.slice(0, MHZ_DIGITS)}.${padded.slice(MHZ_DIGITS)}`;
}

/**
 * The draft as typed, with the point once a digit past it exists — never a blank-padded value and
 * never a trailing point ("1215" → "121.5", "12" → "12", not "12."). Used only for the
 * accessibility label; the visual box always shows the blanks via `entryText`.
 */
export function typedValue(kind: EntryKind, draft: string): string {
  if (kind === 'squawk' || draft.length <= MHZ_DIGITS) {
    return draft;
  }
  return `${draft.slice(0, MHZ_DIGITS)}.${draft.slice(MHZ_DIGITS)}`;
}

/**
 * What Set would send, or why it cannot. A short frequency is padded with zeros ("1215" is
 * 121.500, as a pilot reads it aloud); an invalid one is explained, never snapped.
 */
export function parseEntry(kind: EntryKind, draft: string): ParsedEntry {
  if (!DIGITS_ONLY.test(draft) || draft.length < MIN_DIGITS[kind]) {
    return {
      status: 'incomplete',
      message: kind === 'squawk' && draft.length > 0 ? 'Enter four digits.' : null,
    };
  }
  const value = Number(draft.padEnd(MAX_DIGITS[kind], '0'));
  switch (kind) {
    case 'com': {
      const rejection = comRejection(value);
      return rejection === null
        ? { status: 'valid', value, text: formatCom(value), note: null }
        : { status: 'invalid', message: rejection };
    }
    case 'nav': {
      const rejection = navRejection(value);
      return rejection === null
        ? { status: 'valid', value, text: formatNav(value), note: null }
        : { status: 'invalid', message: rejection };
    }
    case 'squawk': {
      if (!isSquawk(value)) {
        return { status: 'invalid', message: 'Squawk codes use the digits 0 to 7.' };
      }
      const text = formatSquawk(value);
      const meaning = squawkMeaning(value);
      return {
        status: 'valid',
        value,
        text,
        note: meaning === null ? null : `${text} — ${meaning}`,
      };
    }
  }
}

/**
 * Whether an invalid draft's message should show yet. A short COM/NAV draft is padded with zeros to
 * parse (so "11802" parses as 118.020, an invalid ending), but more digits could still complete it
 * into a valid channel (118.025) — so the "not a channel" rejection waits for the full length. The
 * band message is different: once the first three (MHz) digits already place the value outside
 * COM/NAV limits, no later digit can rescue it, so it shows as soon as that is known (C3, T3).
 */
export function shouldExplain(kind: EntryKind, draft: string, parsed: ParsedEntry): boolean {
  if (parsed.status !== 'invalid') {
    return false;
  }
  if (kind === 'squawk' || draft.length >= MAX_DIGITS[kind]) {
    return true;
  }
  const bandMessage = kind === 'com' ? COM_BAND_MESSAGE : NAV_BAND_MESSAGE;
  return parsed.message === bandMessage;
}
