# COM/NAV Radios and Transponder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Radios panel with COM1, COM2, NAV1, NAV2 and the transponder, set from a large on-screen keypad through a staged entry, validated before anything is written, and checked against what X-Plane reports afterwards.

**Architecture:** Pure channel, squawk, mode, entry and read-back logic lives in `src/domain/radios/` and `src/domain/panels/read-back.ts`. The panel (`src/features/panels/radios/`) reads telemetry through `usePanel()`, writes through the existing `ControlButton`, and keeps two pieces of local state: the staged entry (`useRadioEntry`) and the read-back watches (`useReadBack`, a reusable primitive). Profile 1.3.0 declares one feature per radio and per transponder control, so a missing name costs only its own control.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict (`noUncheckedIndexedAccess`), Jest 29 via jest-expo (projects `node`, `expo`, `web`), @testing-library/react-native 14 (`render`, `rerender`, `fireEvent` are awaited; hidden elements need `includeHiddenElements`).

**Spec:** `docs/superpowers/specs/2026-09-30-radios-transponder-design.md`

## Global Constraints

- Gate before every commit: `npm run typecheck && npm run lint && npm run format:check && npm test` — all green.
- Never launch Xcode, Android Studio, simulators, emulators, `expo start`, or EAS builds. The user verifies on devices.
- Never render, log or serialise a bearer token or a pairing code; no URL, HTTP status, exception text, DataRef id or name, or protocol payload on any screen. Failures only through `FailureNotice` (via `ControlButton` / `OperationNotice`).
- Nothing new is logged.
- The panel shows only X-Plane's values. A typed value appears only in the entry display, never in a radio row or the transponder line.
- Nothing is written until the pilot presses Set (or a mode, swap, IDENT or "Squawk NNNN" button). Nothing is queued or replayed on reconnect.
- Invalid entries are rejected with the spec's exact sentences; values are never snapped.
- COM values are whole kHz (`COM_UNITS_PER_MHZ = 1000`); NAV values are 10 kHz units (`NAV_UNITS_PER_MHZ = 100`).
- Freshness is the link's (`usePanel().link.valuesCurrent`); controls follow `link.controlsEnabled` through `ControlButton`.
- Every touch target is at least 48 dp (`theme.touch.minTarget`); keypad keys are 56 dp tall.
- Colours only from theme tokens (day and night); no new tokens.
- Path alias `@/` → `src/`. Domain code imports nothing from `src/application` or `src/features`.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` exactly.
- Match the surrounding code: doc comments explain *why*, at the density of neighbouring files.

## Review Focus

1. **The aircraft changes while an entry is open.** Expected: the draft and every read-back sentence disappear (the panel content is keyed by identity). Test in Task 6.
2. **A value X-Plane later changes in the simulator after the panel's write was adopted.** Expected: no late "did not take" sentence (watches settle once). Test in Task 4.
3. **Set pressed twice quickly.** Expected: one write; Set is disabled while the write is pending. Test in Task 6.
4. **The simulator reports a squawk that is not a valid code (8000, −1) or a frequency of 0.** Expected: shown as `—`, nothing crashes, and the assigned-code line stays absent for an invalid assigned code. Tests in Tasks 5 and 7.
5. **The link drops while a read-back watch is waiting.** Expected: no verdict, no sentence; the panel notice explains. Test in Task 4.

---

## File structure

| File | Responsibility |
|---|---|
| `src/domain/radios/channels.ts` | COM/NAV units, validation, formatting, nearest channels, rejection sentences |
| `src/domain/radios/squawk.ts` | Squawk validity, formatting, emergency meanings |
| `src/domain/radios/transponder-mode.ts` | The four selectable positions and every reported mode's label |
| `src/domain/radios/entry.ts` | Digit entry per kind: push/delete, display text, parse to a verdict |
| `src/domain/panels/read-back.ts` | The read-back verdict (reused by F-20 later) |
| `src/domain/aircraft/profiles/generic.ts` | Profile 1.3.0: names and seven features |
| `src/features/panels/primitives/ControlButton.tsx` | `selected`; `OperationNotice` exported |
| `src/features/panels/primitives/useReadBack.ts` | Watches, settled once, sentences per key |
| `src/features/panels/radios/radios.ts` | Static config: the four radios, entry targets, panel descriptor |
| `src/features/panels/radios/RadioRow.tsx` | One radio: values, swap, standby entry button, sentences |
| `src/features/panels/radios/Keypad.tsx` | The key grid |
| `src/features/panels/radios/EntryPad.tsx` | Entry display, keypad, Cancel, Set |
| `src/features/panels/radios/useRadioEntry.ts` | Target + draft + close/drop rules |
| `src/features/panels/radios/TransponderSection.tsx` | Code, mode, IDENT, assigned code |
| `src/features/panels/radios/RadiosPanel.tsx` | Layout, keyed content, wiring |
| `src/features/panels/registry.ts` | Radios second |
| `tests/mock-xplane/mock-xplane-server.ts` | New DataRefs and commands, flip/ident behaviour, `ignoreWritesTo`, `removeCommand` |

---

### Task 1: Channels, squawk codes and transponder modes

**Files:**
- Create: `src/domain/radios/channels.ts`, `src/domain/radios/squawk.ts`, `src/domain/radios/transponder-mode.ts`
- Test: `tests/unit/domain/radios/channels.test.ts`, `tests/unit/domain/radios/squawk.test.ts`, `tests/unit/domain/radios/transponder-mode.test.ts`

**Interfaces:**
- Produces: `COM_UNITS_PER_MHZ`, `NAV_UNITS_PER_MHZ`, `COM_MIN`, `COM_MAX`, `NAV_MIN`, `NAV_MAX`, `NAV_STEP`, `COM_BAND_MESSAGE`, `NAV_BAND_MESSAGE`, `isComChannel(v: number): boolean`, `isEightThirtyThreeOnly(v: number): boolean`, `isNavFrequency(v: number): boolean`, `formatCom(v: number): string`, `formatNav(v: number): string`, `nearestComChannels(v: number): number[]`, `comRejection(v: number): string | null`, `navRejection(v: number): string | null`; `isSquawk(v: number): boolean`, `formatSquawk(v: number): string`, `squawkMeaning(code: number): string | null`, `isEmergencySquawk(code: number): boolean`; `ModePosition`, `MODE_POSITIONS`, `modeLabel(v: number | null): string | null`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/radios/channels.test.ts`:

```ts
import {
  COM_BAND_MESSAGE,
  NAV_BAND_MESSAGE,
  comRejection,
  formatCom,
  formatNav,
  isComChannel,
  isEightThirtyThreeOnly,
  isNavFrequency,
  navRejection,
  nearestComChannels,
} from '@/domain/radios/channels';

describe('COM channels', () => {
  const valid = [0, 5, 10, 15, 25, 30, 35, 40, 50, 55, 60, 65, 75, 80, 85, 90];
  it.each(Array.from({ length: 20 }, (_, i) => i * 5))('ending %i is valid only when listed', (end) => {
    expect(isComChannel(121_400 + end)).toBe(valid.includes(end));
  });

  it('rejects endings that are not multiples of 5', () => {
    expect(isComChannel(121_401)).toBe(false);
    expect(isComChannel(121_412.5)).toBe(false);
  });

  it('holds the band ends', () => {
    expect(isComChannel(117_995)).toBe(false);
    expect(isComChannel(118_000)).toBe(true);
    expect(isComChannel(136_990)).toBe(true);
    expect(isComChannel(136_995)).toBe(false);
    expect(isComChannel(137_000)).toBe(false);
  });

  it('tells 8.33-only channels from 25 kHz ones', () => {
    expect(isEightThirtyThreeOnly(118_005)).toBe(true);
    expect(isEightThirtyThreeOnly(118_025)).toBe(false);
    expect(isEightThirtyThreeOnly(118_020)).toBe(false);
  });

  it('formats three decimals', () => {
    expect(formatCom(121_500)).toBe('121.500');
    expect(formatCom(118_005)).toBe('118.005');
    expect(formatCom(136_990)).toBe('136.990');
  });

  it('finds the channels either side, inside the band', () => {
    expect(nearestComChannels(118_020)).toEqual([118_015, 118_025]);
    expect(nearestComChannels(118_001)).toEqual([118_000, 118_005]);
    expect(nearestComChannels(136_985)).toEqual([136_980, 136_990]);
  });

  it('explains a rejection in the pilot’s words', () => {
    expect(comRejection(118_025)).toBeNull();
    expect(comRejection(118_020)).toBe('118.020 is not a COM channel. Nearest: 118.015 or 118.025.');
    expect(comRejection(117_995)).toBe(COM_BAND_MESSAGE);
    expect(comRejection(200_000)).toBe(COM_BAND_MESSAGE);
    expect(comRejection(Number.NaN)).toBe(COM_BAND_MESSAGE);
    expect(COM_BAND_MESSAGE).toBe('COM channels run from 118.000 to 136.990.');
  });
});

describe('NAV frequencies', () => {
  it('accepts 0.05 steps from 108.00 to 117.95', () => {
    expect(isNavFrequency(10_800)).toBe(true);
    expect(isNavFrequency(11_030)).toBe(true);
    expect(isNavFrequency(11_795)).toBe(true);
    expect(isNavFrequency(11_800)).toBe(false);
    expect(isNavFrequency(10_795)).toBe(false);
    expect(isNavFrequency(11_032)).toBe(false);
  });

  it('formats two decimals', () => {
    expect(formatNav(11_030)).toBe('110.30');
    expect(formatNav(10_800)).toBe('108.00');
  });

  it('explains a rejection', () => {
    expect(navRejection(11_030)).toBeNull();
    expect(navRejection(11_032)).toBe(NAV_BAND_MESSAGE);
    expect(navRejection(12_000)).toBe(NAV_BAND_MESSAGE);
    expect(NAV_BAND_MESSAGE).toBe('NAV frequencies run from 108.00 to 117.95 in 0.05 steps.');
  });
});
```

`tests/unit/domain/radios/squawk.test.ts`:

```ts
import {
  formatSquawk,
  isEmergencySquawk,
  isSquawk,
  squawkMeaning,
} from '@/domain/radios/squawk';

describe('squawk codes', () => {
  it('accepts four octal digits only', () => {
    expect(isSquawk(7000)).toBe(true);
    expect(isSquawk(0)).toBe(true);
    expect(isSquawk(7777)).toBe(true);
    expect(isSquawk(7800)).toBe(false);
    expect(isSquawk(1238)).toBe(false);
    expect(isSquawk(10_000)).toBe(false);
    expect(isSquawk(-1)).toBe(false);
    expect(isSquawk(12.5)).toBe(false);
  });

  it('keeps leading zeros', () => {
    expect(formatSquawk(400)).toBe('0400');
    expect(formatSquawk(0)).toBe('0000');
    expect(formatSquawk(7000)).toBe('7000');
  });

  it('names the three emergency codes and nothing else', () => {
    expect(squawkMeaning(7500)).toBe('unlawful interference');
    expect(squawkMeaning(7600)).toBe('radio failure');
    expect(squawkMeaning(7700)).toBe('emergency');
    expect(squawkMeaning(7000)).toBeNull();
    expect(isEmergencySquawk(7700)).toBe(true);
    expect(isEmergencySquawk(1200)).toBe(false);
  });
});
```

`tests/unit/domain/radios/transponder-mode.test.ts`:

```ts
import { MODE_POSITIONS, modeLabel } from '@/domain/radios/transponder-mode';

describe('transponder modes', () => {
  it('offers the four positions in panel order', () => {
    expect(MODE_POSITIONS.map((position) => [position.value, position.label])).toEqual([
      [0, 'OFF'],
      [1, 'STBY'],
      [2, 'ON'],
      [3, 'ALT'],
    ]);
  });

  it('labels every reported mode, and nothing it does not know', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(modeLabel)).toEqual([
      'OFF',
      'STBY',
      'ON',
      'ALT',
      'TEST',
      'GND',
      'TA ONLY',
      'TA/RA',
    ]);
    expect(modeLabel(8)).toBeNull();
    expect(modeLabel(-1)).toBeNull();
    expect(modeLabel(2.5)).toBeNull();
    expect(modeLabel(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain/radios`
Expected: FAIL, cannot find module `@/domain/radios/channels` (and the other two).

- [ ] **Step 3: Implement**

`src/domain/radios/channels.ts`:

```ts
/**
 * COM channels and NAV frequencies as X-Plane stores them. The COM `_833` DataRefs hold a channel
 * number, which for 8.33 kHz channels is not the physical frequency (Laminar, "8.33 kHz radios");
 * Avionix reads it as whole kHz — 121.500 is 121500, channel 118.005 is 118005 — an assumption the
 * device check confirms, kept in this one constant. NAV DataRefs hold 10 kHz units: 110.30 is 11030.
 */
export const COM_UNITS_PER_MHZ = 1000;
export const NAV_UNITS_PER_MHZ = 100;

export const COM_MIN = 118_000;
export const COM_MAX = 136_990;
export const NAV_MIN = 10_800;
export const NAV_MAX = 11_795;
/** 0.05 MHz in NAV units. */
export const NAV_STEP = 5;

export const COM_BAND_MESSAGE = 'COM channels run from 118.000 to 136.990.';
export const NAV_BAND_MESSAGE = 'NAV frequencies run from 108.00 to 117.95 in 0.05 steps.';

/** Valid endings within every 100 kHz: 00/25/50/75 are 25 kHz channels, the rest 8.33 channels. */
const COM_ENDINGS: ReadonlySet<number> = new Set([
  0, 5, 10, 15, 25, 30, 35, 40, 50, 55, 60, 65, 75, 80, 85, 90,
]);
const TWENTY_FIVE_KHZ_ENDINGS: ReadonlySet<number> = new Set([0, 25, 50, 75]);

export function isComChannel(value: number): boolean {
  return (
    Number.isInteger(value) && value >= COM_MIN && value <= COM_MAX && COM_ENDINGS.has(value % 100)
  );
}

/** A channel a 25 kHz-only radio cannot tune; the read-back hint names that possibility. */
export function isEightThirtyThreeOnly(value: number): boolean {
  return isComChannel(value) && !TWENTY_FIVE_KHZ_ENDINGS.has(value % 100);
}

export function isNavFrequency(value: number): boolean {
  return (
    Number.isInteger(value) && value >= NAV_MIN && value <= NAV_MAX && value % NAV_STEP === 0
  );
}

function formatUnits(value: number, perMhz: number, decimals: number): string {
  const whole = Math.round(value);
  const mhz = Math.floor(whole / perMhz);
  return `${mhz}.${String(whole - mhz * perMhz).padStart(decimals, '0')}`;
}

export function formatCom(value: number): string {
  return formatUnits(value, COM_UNITS_PER_MHZ, 3);
}

export function formatNav(value: number): string {
  return formatUnits(value, NAV_UNITS_PER_MHZ, 2);
}

/** The valid channel below and the one above `value`, each only if it is inside the band. */
export function nearestComChannels(value: number): number[] {
  const nearest: number[] = [];
  for (let below = Math.ceil(value) - 1; below >= COM_MIN; below -= 1) {
    if (isComChannel(below)) {
      nearest.push(below);
      break;
    }
  }
  for (let above = Math.floor(value) + 1; above <= COM_MAX; above += 1) {
    if (isComChannel(above)) {
      nearest.push(above);
      break;
    }
  }
  return nearest;
}

/** Why `value` cannot be sent, or null. Never a snapped value: the pilot picks the channel. */
export function comRejection(value: number): string | null {
  if (isComChannel(value)) {
    return null;
  }
  if (!Number.isFinite(value) || value < COM_MIN || value > COM_MAX) {
    return COM_BAND_MESSAGE;
  }
  const nearest = nearestComChannels(value).map(formatCom).join(' or ');
  return `${formatCom(value)} is not a COM channel. Nearest: ${nearest}.`;
}

export function navRejection(value: number): string | null {
  return isNavFrequency(value) ? null : NAV_BAND_MESSAGE;
}
```

`src/domain/radios/squawk.ts`:

```ts
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
```

`src/domain/radios/transponder-mode.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/domain/radios`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/domain/radios tests/unit/domain/radios
git commit -m "feat(radios): COM channels, NAV frequencies, squawk codes and transponder modes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The digit entry and the read-back verdict

**Files:**
- Create: `src/domain/radios/entry.ts`, `src/domain/panels/read-back.ts`
- Test: `tests/unit/domain/radios/entry.test.ts`, `tests/unit/domain/read-back.test.ts`

**Interfaces:**
- Consumes (Task 1): `comRejection`, `navRejection`, `formatCom`, `formatNav`, `formatSquawk`, `squawkMeaning`.
- Produces: `EntryKind = 'com' | 'nav' | 'squawk'`; `MAX_DIGITS: Record<EntryKind, number>`; `keyAccepted(kind, digit): boolean`; `entryDigits(kind): number[]`; `pushDigit(kind, draft, digit): string`; `deleteDigit(draft): string`; `entryText(kind, draft): string`; `ParsedEntry`; `parseEntry(kind, draft): ParsedEntry`. `READ_BACK_MS = 3000`; `ReadBackVerdict`; `ReadBackInput`; `readsAs(value, expected): boolean`; `readBackVerdict(input): ReadBackVerdict`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/radios/entry.test.ts`:

```ts
import {
  deleteDigit,
  entryDigits,
  entryText,
  keyAccepted,
  parseEntry,
  pushDigit,
} from '@/domain/radios/entry';

describe('digit entry', () => {
  it('stops at the kind’s length', () => {
    let draft = '';
    for (const digit of [1, 2, 1, 5, 0, 0, 5]) {
      draft = pushDigit('com', draft, digit);
    }
    expect(draft).toBe('121500');
    expect(pushDigit('nav', '11030', 5)).toBe('11030');
    expect(pushDigit('squawk', '7000', 1)).toBe('7000');
  });

  it('never takes 8 or 9 for a squawk', () => {
    expect(keyAccepted('squawk', 8)).toBe(false);
    expect(keyAccepted('squawk', 9)).toBe(false);
    expect(keyAccepted('squawk', 7)).toBe(true);
    expect(pushDigit('squawk', '7', 8)).toBe('7');
    expect(entryDigits('squawk')).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
    expect(entryDigits('com')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  });

  it('deletes one digit', () => {
    expect(deleteDigit('1215')).toBe('121');
    expect(deleteDigit('')).toBe('');
  });

  it('shows the implied decimal point and the digits still to come', () => {
    expect(entryText('com', '1215')).toBe('121.5__');
    expect(entryText('com', '')).toBe('___.___');
    expect(entryText('nav', '1103')).toBe('110.3_');
    expect(entryText('squawk', '70')).toBe('70__');
  });
});

describe('parsing an entry', () => {
  it('says nothing until three digits for a frequency', () => {
    expect(parseEntry('com', '12')).toEqual({ status: 'incomplete', message: null });
    expect(parseEntry('nav', '')).toEqual({ status: 'incomplete', message: null });
  });

  it('pads a short frequency with zeros', () => {
    expect(parseEntry('com', '121')).toEqual({
      status: 'valid',
      value: 121_000,
      text: '121.000',
      note: null,
    });
    expect(parseEntry('com', '1215')).toMatchObject({ status: 'valid', value: 121_500 });
    expect(parseEntry('com', '118005')).toMatchObject({ status: 'valid', value: 118_005 });
    expect(parseEntry('nav', '1103')).toMatchObject({ status: 'valid', value: 11_030, text: '110.30' });
  });

  it('rejects with the channel rule, never snapping', () => {
    expect(parseEntry('com', '11802')).toEqual({
      status: 'invalid',
      message: '118.020 is not a COM channel. Nearest: 118.015 or 118.025.',
    });
    expect(parseEntry('com', '2')).toEqual({ status: 'incomplete', message: null });
    expect(parseEntry('com', '200')).toEqual({
      status: 'invalid',
      message: 'COM channels run from 118.000 to 136.990.',
    });
    expect(parseEntry('nav', '11032')).toEqual({
      status: 'invalid',
      message: 'NAV frequencies run from 108.00 to 117.95 in 0.05 steps.',
    });
  });

  it('asks for four squawk digits once one is typed', () => {
    expect(parseEntry('squawk', '')).toEqual({ status: 'incomplete', message: null });
    expect(parseEntry('squawk', '70')).toEqual({
      status: 'incomplete',
      message: 'Enter four digits.',
    });
  });

  it('accepts a squawk and names an emergency code', () => {
    expect(parseEntry('squawk', '0400')).toEqual({
      status: 'valid',
      value: 400,
      text: '0400',
      note: null,
    });
    expect(parseEntry('squawk', '7700')).toEqual({
      status: 'valid',
      value: 7700,
      text: '7700',
      note: '7700 — emergency',
    });
  });

  it('refuses a draft that did not come from the keypad', () => {
    expect(parseEntry('squawk', '7800')).toEqual({
      status: 'invalid',
      message: 'Squawk codes use the digits 0 to 7.',
    });
    expect(parseEntry('com', '12a500')).toEqual({ status: 'incomplete', message: null });
  });
});
```

`tests/unit/domain/read-back.test.ts`:

```ts
import { READ_BACK_MS, readBackVerdict, readsAs } from '@/domain/panels/read-back';

const base = {
  current: 121_500 as number | undefined,
  expected: 118_005,
  operation: { status: 'ok' as const, at: 1_000 },
  startedAt: 900,
  valuesCurrent: true,
  now: 1_000,
};

describe('read-back verdict', () => {
  it('is adopted as soon as the value reads as expected', () => {
    expect(readBackVerdict({ ...base, current: 118_005 })).toBe('adopted');
  });

  it('waits while the write is pending or not yet recorded', () => {
    expect(readBackVerdict({ ...base, operation: undefined })).toBe('waiting');
    expect(readBackVerdict({ ...base, operation: { status: 'pending', at: 950 } })).toBe('waiting');
  });

  it('ignores an outcome from an earlier press', () => {
    expect(readBackVerdict({ ...base, operation: { status: 'ok', at: 800 }, now: 10_000 })).toBe(
      'waiting',
    );
  });

  it('counts the window from the moment X-Plane accepted the write', () => {
    expect(readBackVerdict({ ...base, now: 1_000 + READ_BACK_MS - 1 })).toBe('waiting');
    expect(readBackVerdict({ ...base, now: 1_000 + READ_BACK_MS })).toBe('notAdopted');
  });

  it('gives no verdict for a failed or refused operation, whose own failure is shown', () => {
    expect(readBackVerdict({ ...base, operation: { status: 'failed', at: 1_000 }, now: 9_000 })).toBe(
      'abandoned',
    );
  });

  it('gives no verdict once the link is not current', () => {
    expect(readBackVerdict({ ...base, valuesCurrent: false, now: 9_000 })).toBe('abandoned');
    expect(readBackVerdict({ ...base, valuesCurrent: false, operation: undefined })).toBe(
      'abandoned',
    );
  });

  it('reads whole-number values, first array element included', () => {
    expect(readsAs(3, 3)).toBe(true);
    expect(readsAs(3.2, 3)).toBe(true);
    expect(readsAs(3.6, 3)).toBe(false);
    expect(readsAs([3, 0], 3)).toBe(true);
    expect(readsAs('AAAA', 3)).toBe(false);
    expect(readsAs(undefined, 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain/radios/entry.test.ts tests/unit/domain/read-back.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/domain/radios/entry.ts`:

```ts
import { comRejection, formatCom, formatNav, navRejection } from '@/domain/radios/channels';
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
      return { status: 'valid', value, text, note: meaning === null ? null : `${text} — ${meaning}` };
    }
  }
}
```

`src/domain/panels/read-back.ts`:

```ts
import type { DataRefValue } from '@/domain/simulator/types';

/** How long X-Plane has to show a written value: 30 samples at the documented 10 Hz. */
export const READ_BACK_MS = 3000;

export type ReadBackVerdict = 'waiting' | 'adopted' | 'notAdopted' | 'abandoned';

export interface ReadBackInput {
  current: DataRefValue | undefined;
  expected: number;
  /** The session's outcome for the binding that should cause the change (structurally typed). */
  operation: { status: 'pending' | 'ok' | 'failed'; at: number } | undefined;
  /** When the pilot pressed; an outcome recorded before this belongs to an earlier press. */
  startedAt: number;
  valuesCurrent: boolean;
  now: number;
}

/** Whole-number values (channels, codes, modes): within half a unit reads as the same value. */
export function readsAs(value: DataRefValue | undefined, expected: number): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'number' && Math.abs(candidate - expected) < 0.5;
}

/**
 * Did X-Plane adopt what the panel sent (F-21 R4, F-22 R4)? Some add-ons accept a write and ignore
 * it. A failed or refused operation already shows its own failure, and a dropped link already has
 * the panel notice, so both give no verdict. The window counts from the moment X-Plane accepted
 * the write, not from the press, so a slow request never eats into it.
 */
export function readBackVerdict(input: ReadBackInput): ReadBackVerdict {
  const operation = input.operation;
  if (operation === undefined || operation.at < input.startedAt || operation.status === 'pending') {
    return input.valuesCurrent ? 'waiting' : 'abandoned';
  }
  if (operation.status === 'failed') {
    return 'abandoned';
  }
  if (readsAs(input.current, input.expected)) {
    return 'adopted';
  }
  if (!input.valuesCurrent) {
    return 'abandoned';
  }
  return input.now - operation.at >= READ_BACK_MS ? 'notAdopted' : 'waiting';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/domain/radios tests/unit/domain/read-back.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/domain/radios/entry.ts src/domain/panels/read-back.ts tests/unit/domain/radios/entry.test.ts tests/unit/domain/read-back.test.ts
git commit -m "feat(radios): staged digit entry and the read-back verdict

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Profile 1.3.0 and the mock X-Plane

**Files:**
- Modify: `src/domain/aircraft/profiles/generic.ts`
- Modify: `tests/mock-xplane/mock-xplane-server.ts`
- Modify: `tests/unit/domain/aircraft-profile.test.ts`, `tests/ui/compatibility-screen.test.tsx:66`, `tests/ui/aircraft-summary.test.tsx:43`, `tests/unit/application/diagnostics-summary.test.ts:134` (version string `1.2.0` → `1.3.0`)
- Modify: `docs/xplane.md` (verified names and features)
- Test: `tests/unit/domain/aircraft-profile.test.ts`, `tests/integration/mock-xplane-server.test.ts`

**Interfaces:**
- Produces in `generic.ts`:
  - `GENERIC_DATAREFS` adds: `com1Active`, `com1Standby`, `com2Active`, `com2Standby`, `nav1Active`, `nav1Standby`, `nav2Active`, `nav2Standby`, `nav1Course`, `nav2Course`, `nav1Id`, `nav2Id`, `nav1HasDme`, `nav2HasDme`, `nav1Dme`, `nav2Dme`, `transponderCode`, `transponderMode`, `transponderIdenting`, `atcAssignedCode`.
  - `GENERIC_COMMANDS` adds: `com1Flip`, `com2Flip`, `nav1Flip`, `nav2Flip`, `transponderIdent`.
  - Feature ids: `FEATURE_COM1 = 'com1'`, `FEATURE_COM2 = 'com2'`, `FEATURE_NAV1 = 'nav1'`, `FEATURE_NAV2 = 'nav2'`, `FEATURE_TRANSPONDER_CODE = 'transponder-code'`, `FEATURE_TRANSPONDER_MODE = 'transponder-mode'`, `FEATURE_TRANSPONDER_IDENT = 'transponder-ident'`.
- Produces in the mock: DataRef ids 1039–1058, command ids 2003–2007; `ignoreWritesTo(name: string): void`; `removeCommand(name: string): void`.

- [ ] **Step 1: Write the failing profile tests**

Change both `expect(GENERIC_PROFILE.version).toBe('1.2.0')` lines in `tests/unit/domain/aircraft-profile.test.ts` to `'1.3.0'`, and the three UI/application tests named above from `1.2.0` to `1.3.0`. Add to the generic-profile `describe` in `aircraft-profile.test.ts` (import the new constants from `@/domain/aircraft/profiles/generic`):

```ts
  it('declares one feature per radio, each with its standby written and its swap command', () => {
    const radios = [
      [FEATURE_COM1, 'COM1', GENERIC_DATAREFS.com1Active, GENERIC_DATAREFS.com1Standby, GENERIC_COMMANDS.com1Flip],
      [FEATURE_COM2, 'COM2', GENERIC_DATAREFS.com2Active, GENERIC_DATAREFS.com2Standby, GENERIC_COMMANDS.com2Flip],
      [FEATURE_NAV1, 'NAV1', GENERIC_DATAREFS.nav1Active, GENERIC_DATAREFS.nav1Standby, GENERIC_COMMANDS.nav1Flip],
      [FEATURE_NAV2, 'NAV2', GENERIC_DATAREFS.nav2Active, GENERIC_DATAREFS.nav2Standby, GENERIC_COMMANDS.nav2Flip],
    ] as const;
    for (const [id, label, active, standby, flip] of radios) {
      const feature = findFeature(GENERIC_PROFILE, id);
      expect(feature?.label).toBe(label);
      const required = feature?.bindings.filter((binding) => binding.required);
      expect(required?.map((binding) => [binding.kind, binding.name, binding.write === true])).toEqual([
        ['dataref', active, false],
        ['dataref', standby, true],
        ['command', flip, false],
      ]);
    }
    expect(
      findFeature(GENERIC_PROFILE, FEATURE_NAV1)
        ?.bindings.filter((binding) => !binding.required)
        .map((binding) => binding.name),
    ).toEqual([
      GENERIC_DATAREFS.nav1Id,
      GENERIC_DATAREFS.nav1HasDme,
      GENERIC_DATAREFS.nav1Dme,
      GENERIC_DATAREFS.nav1Course,
    ]);
    expect(findFeature(GENERIC_PROFILE, FEATURE_COM1)?.bindings).toHaveLength(3);
  });

  it('declares the transponder as three features, the assigned code optional', () => {
    expect(
      findFeature(GENERIC_PROFILE, FEATURE_TRANSPONDER_CODE)?.bindings.map((binding) => [
        binding.name,
        binding.required,
        binding.write === true,
      ]),
    ).toEqual([
      [GENERIC_DATAREFS.transponderCode, true, true],
      [GENERIC_DATAREFS.atcAssignedCode, false, false],
    ]);
    expect(
      findFeature(GENERIC_PROFILE, FEATURE_TRANSPONDER_MODE)?.bindings.map((binding) => [
        binding.name,
        binding.required,
        binding.write === true,
      ]),
    ).toEqual([[GENERIC_DATAREFS.transponderMode, true, true]]);
    expect(
      findFeature(GENERIC_PROFILE, FEATURE_TRANSPONDER_IDENT)?.bindings.map((binding) => [
        binding.kind,
        binding.name,
        binding.required,
      ]),
    ).toEqual([
      ['command', GENERIC_COMMANDS.transponderIdent, true],
      ['dataref', GENERIC_DATAREFS.transponderIdenting, false],
    ]);
  });

  it('uses Laminar’s spelling of the swap commands', () => {
    expect(GENERIC_COMMANDS.com1Flip).toBe('sim/radios/com1_standy_flip');
    expect(GENERIC_COMMANDS.nav2Flip).toBe('sim/radios/nav2_standy_flip');
    expect(GENERIC_COMMANDS.transponderIdent).toBe('sim/transponder/transponder_ident');
  });
```

The existing test "names every DataRef once across the whole profile, except airspeed" must still pass unchanged: no new name is declared twice.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts`
Expected: FAIL (constants undefined, version 1.2.0).

- [ ] **Step 3: Implement the profile**

In `src/domain/aircraft/profiles/generic.ts`, add to `GENERIC_DATAREFS` (after `barometer`):

```ts
  com1Active: 'sim/cockpit2/radios/actuators/com1_frequency_hz_833',
  com1Standby: 'sim/cockpit2/radios/actuators/com1_standby_frequency_hz_833',
  com2Active: 'sim/cockpit2/radios/actuators/com2_frequency_hz_833',
  com2Standby: 'sim/cockpit2/radios/actuators/com2_standby_frequency_hz_833',
  nav1Active: 'sim/cockpit2/radios/actuators/nav1_frequency_hz',
  nav1Standby: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_hz',
  nav2Active: 'sim/cockpit2/radios/actuators/nav2_frequency_hz',
  nav2Standby: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_hz',
  nav1Course: 'sim/cockpit2/radios/actuators/nav1_course_deg_mag_pilot',
  nav2Course: 'sim/cockpit2/radios/actuators/nav2_course_deg_mag_pilot',
  nav1Id: 'sim/cockpit2/radios/indicators/nav1_nav_id',
  nav2Id: 'sim/cockpit2/radios/indicators/nav2_nav_id',
  nav1HasDme: 'sim/cockpit2/radios/indicators/nav1_has_dme',
  nav2HasDme: 'sim/cockpit2/radios/indicators/nav2_has_dme',
  nav1Dme: 'sim/cockpit2/radios/indicators/nav1_dme_distance_nm',
  nav2Dme: 'sim/cockpit2/radios/indicators/nav2_dme_distance_nm',
  transponderCode: 'sim/cockpit2/radios/actuators/transponder_code',
  transponderMode: 'sim/cockpit2/radios/actuators/transponder_mode',
  transponderIdenting: 'sim/cockpit2/radios/indicators/transponder_id',
  atcAssignedCode: 'sim/atc/transponder_assigned',
```

To `GENERIC_COMMANDS`:

```ts
  com1Flip: 'sim/radios/com1_standy_flip',
  com2Flip: 'sim/radios/com2_standy_flip',
  nav1Flip: 'sim/radios/nav1_standy_flip',
  nav2Flip: 'sim/radios/nav2_standy_flip',
  transponderIdent: 'sim/transponder/transponder_ident',
```

Feature ids, after `FEATURE_ALTIMETER_SETTING`:

```ts
export const FEATURE_COM1 = 'com1';
export const FEATURE_COM2 = 'com2';
export const FEATURE_NAV1 = 'nav1';
export const FEATURE_NAV2 = 'nav2';
export const FEATURE_TRANSPONDER_CODE = 'transponder-code';
export const FEATURE_TRANSPONDER_MODE = 'transponder-mode';
export const FEATURE_TRANSPONDER_IDENT = 'transponder-ident';
```

Two helpers above `GENERIC_PROFILE` keep the four radio features identical in shape:

```ts
function radioFeature(
  id: string,
  label: string,
  active: string,
  standby: string,
  flip: string,
  extras: readonly BindingSpec[] = [],
): FeatureSpec {
  return {
    id,
    label,
    bindings: [
      { kind: 'dataref', name: active, required: true, purpose: `${label} active frequency` },
      {
        kind: 'dataref',
        name: standby,
        required: true,
        write: true,
        purpose: `${label} standby frequency, written when you set one`,
      },
      { kind: 'command', name: flip, required: true, purpose: `${label} swap` },
      ...extras,
    ],
  };
}

function navExtras(label: string, id: string, hasDme: string, dme: string, course: string) {
  return [
    { kind: 'dataref', name: id, required: false, purpose: `${label} station identifier` },
    { kind: 'dataref', name: hasDme, required: false, purpose: `${label} DME signal` },
    { kind: 'dataref', name: dme, required: false, purpose: `${label} DME distance` },
    { kind: 'dataref', name: course, required: false, purpose: `${label} selected course` },
  ] as const satisfies readonly BindingSpec[];
}
```

Import `BindingSpec` and `FeatureSpec` types from `@/domain/aircraft/profile` alongside `AircraftProfile`. Set `version: '1.3.0'` and append to `features` (after the altimeter setting):

```ts
    radioFeature(FEATURE_COM1, 'COM1', D.com1Active, D.com1Standby, C.com1Flip),
    radioFeature(FEATURE_COM2, 'COM2', D.com2Active, D.com2Standby, C.com2Flip),
    radioFeature(
      FEATURE_NAV1,
      'NAV1',
      D.nav1Active,
      D.nav1Standby,
      C.nav1Flip,
      navExtras('NAV1', D.nav1Id, D.nav1HasDme, D.nav1Dme, D.nav1Course),
    ),
    radioFeature(
      FEATURE_NAV2,
      'NAV2',
      D.nav2Active,
      D.nav2Standby,
      C.nav2Flip,
      navExtras('NAV2', D.nav2Id, D.nav2HasDme, D.nav2Dme, D.nav2Course),
    ),
    {
      id: FEATURE_TRANSPONDER_CODE,
      label: 'Transponder code',
      bindings: [
        {
          kind: 'dataref',
          name: D.transponderCode,
          required: true,
          write: true,
          purpose: 'Squawk code, written when you set one',
        },
        {
          kind: 'dataref',
          name: D.atcAssignedCode,
          required: false,
          purpose: 'Code assigned by X-Plane ATC (X-Plane 12.4.4 and newer)',
        },
      ],
    },
    {
      id: FEATURE_TRANSPONDER_MODE,
      label: 'Transponder mode',
      bindings: [
        {
          kind: 'dataref',
          name: D.transponderMode,
          required: true,
          write: true,
          purpose: 'Transponder mode, written when you select one',
        },
      ],
    },
    {
      id: FEATURE_TRANSPONDER_IDENT,
      label: 'Transponder IDENT',
      bindings: [
        { kind: 'command', name: C.transponderIdent, required: true, purpose: 'IDENT' },
        {
          kind: 'dataref',
          name: D.transponderIdenting,
          required: false,
          purpose: 'Whether the transponder is identing now',
        },
      ],
    },
```

where `const D = GENERIC_DATAREFS;` and `const C = GENERIC_COMMANDS;` are declared just above the helpers. Extend the profile's doc comment with one sentence: the radios and transponder controls (F-21, F-22) are one feature each, so a name an aircraft lacks costs only that radio or control, and the assigned code is optional because it exists only from X-Plane 12.4.4.

- [ ] **Step 4: Run the profile tests**

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts tests/ui/compatibility-screen.test.tsx tests/ui/aircraft-summary.test.tsx tests/unit/application/diagnostics-summary.test.ts`
Expected: PASS. If a compatibility or availability test counts features or lists feature ids exhaustively, extend its expectation with the seven new ids in declaration order (do not weaken it).

- [ ] **Step 5: Write the failing mock tests**

Add to `tests/integration/mock-xplane-server.test.ts` (use the file's existing helpers for HTTP calls; if it has none for activation and writes, use `fetch` against `http://${server.host}:${server.port}/api/v3/...` the way its other tests do):

```ts
describe('radios and transponder in the mock', () => {
  it('swaps a radio’s active and standby on its flip command', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const flip = server.commandIdByName('sim/radios/com1_standy_flip');
      await activate(server, flip);
      expect(server.getDataRefByName('sim/cockpit2/radios/actuators/com1_frequency_hz_833')?.value).toBe(118_005);
      expect(server.getDataRefByName('sim/cockpit2/radios/actuators/com1_standby_frequency_hz_833')?.value).toBe(121_500);
    } finally {
      await server.stop();
    }
  });

  it('idents on the IDENT command', async () => {
    const server = await MockXPlaneServer.start();
    try {
      await activate(server, server.commandIdByName('sim/transponder/transponder_ident'));
      expect(server.getDataRefByName('sim/cockpit2/radios/indicators/transponder_id')?.value).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it('accepts and ignores a write to a name it was told to ignore', async () => {
    const server = await MockXPlaneServer.start();
    try {
      const name = 'sim/cockpit2/radios/actuators/transponder_code';
      server.ignoreWritesTo(name);
      await writeValue(server, name, 4521);
      expect(server.getDataRefByName(name)?.value).toBe(1200);
      expect(server.writes.length).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it('forgets a removed command', async () => {
    const server = await MockXPlaneServer.start();
    server.removeCommand('sim/radios/nav2_standy_flip');
    expect(() => server.commandIdByName('sim/radios/nav2_standy_flip')).toThrow();
    await server.stop();
  });
});
```

`activate(server, id)` and `writeValue(server, name, value)` are small local helpers in the test file that POST to `/api/v3/command/{id}/activate` with `{ duration: 0 }` and PATCH `/api/v3/datarefs/{id}/value` with `{ data: value }` (mirror the request shapes the existing mock tests already use for heading writes and activations; read them first).

- [ ] **Step 6: Implement the mock**

In `tests/mock-xplane/mock-xplane-server.ts`, append to `DEFAULT_MOCK_DATAREFS`:

```ts
  { id: 1039, name: 'sim/cockpit2/radios/actuators/com1_frequency_hz_833', valueType: 'int', value: 121_500, writable: true },
  { id: 1040, name: 'sim/cockpit2/radios/actuators/com1_standby_frequency_hz_833', valueType: 'int', value: 118_005, writable: true },
  { id: 1041, name: 'sim/cockpit2/radios/actuators/com2_frequency_hz_833', valueType: 'int', value: 118_000, writable: true },
  { id: 1042, name: 'sim/cockpit2/radios/actuators/com2_standby_frequency_hz_833', valueType: 'int', value: 124_850, writable: true },
  { id: 1043, name: 'sim/cockpit2/radios/actuators/nav1_frequency_hz', valueType: 'int', value: 11_030, writable: true },
  { id: 1044, name: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_hz', valueType: 'int', value: 10_850, writable: true },
  { id: 1045, name: 'sim/cockpit2/radios/actuators/nav2_frequency_hz', valueType: 'int', value: 11_390, writable: true },
  { id: 1046, name: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_hz', valueType: 'int', value: 11_720, writable: true },
  { id: 1047, name: 'sim/cockpit2/radios/actuators/nav1_course_deg_mag_pilot', valueType: 'float', value: 247, writable: true },
  { id: 1048, name: 'sim/cockpit2/radios/actuators/nav2_course_deg_mag_pilot', valueType: 'float', value: 90, writable: true },
  // "IBOS" and an empty identifier, NUL-padded and base64-encoded as X-Plane sends `data` values.
  { id: 1049, name: 'sim/cockpit2/radios/indicators/nav1_nav_id', valueType: 'data', value: 'SUJPUwAAAAA=' },
  { id: 1050, name: 'sim/cockpit2/radios/indicators/nav2_nav_id', valueType: 'data', value: 'AAAAAAAAAAA=' },
  { id: 1051, name: 'sim/cockpit2/radios/indicators/nav1_has_dme', valueType: 'int', value: 1 },
  { id: 1052, name: 'sim/cockpit2/radios/indicators/nav2_has_dme', valueType: 'int', value: 0 },
  { id: 1053, name: 'sim/cockpit2/radios/indicators/nav1_dme_distance_nm', valueType: 'float', value: 12.4 },
  { id: 1054, name: 'sim/cockpit2/radios/indicators/nav2_dme_distance_nm', valueType: 'float', value: 0 },
  { id: 1055, name: 'sim/cockpit2/radios/actuators/transponder_code', valueType: 'int', value: 1200, writable: true },
  { id: 1056, name: 'sim/cockpit2/radios/actuators/transponder_mode', valueType: 'int', value: 1, writable: true },
  { id: 1057, name: 'sim/cockpit2/radios/indicators/transponder_id', valueType: 'int', value: 0 },
  { id: 1058, name: 'sim/atc/transponder_assigned', valueType: 'int', value: 4521 },
```

(Prettier will reflow these; keep the values.) Append to `DEFAULT_MOCK_COMMANDS`:

```ts
  { id: 2003, name: 'sim/radios/com1_standy_flip', description: 'COM 1 flip standby.' },
  { id: 2004, name: 'sim/radios/com2_standy_flip', description: 'COM 2 flip standby.' },
  { id: 2005, name: 'sim/radios/nav1_standy_flip', description: 'NAV 1 flip standby.' },
  { id: 2006, name: 'sim/radios/nav2_standy_flip', description: 'NAV 2 flip standby.' },
  { id: 2007, name: 'sim/transponder/transponder_ident', description: 'Transponder ID.' },
```

Add a private field `private readonly ignoredWrites = new Set<string>();` and public methods:

```ts
  /** Simulates an add-on that accepts a write to `name` and then ignores it (F-21 R4). */
  ignoreWritesTo(name: string): void {
    this.ignoredWrites.add(name);
  }

  /** Simulates a command this aircraft does not have. */
  removeCommand(name: string): void {
    this.commands.delete(this.commandIdByName(name));
  }

  commandIdByName(name: string): number {
    const command = [...this.commands.values()].find((candidate) => candidate.name === name);
    if (command === undefined) {
      throw new Error(`mock command ${name} not defined`);
    }
    return command.id;
  }
```

In `writeValue`, after the read-only check: `if (this.ignoredWrites.has(dataRef.name)) { return; }` (the write is still recorded wherever the server already records writes, and still answers 200).

In `applyCommand`, add:

```ts
    const flip = /^sim\/radios\/(com|nav)([12])_standy_flip$/.exec(command?.name ?? '');
    if (flip !== null) {
      const [, kind, unit] = flip;
      const suffix = kind === 'com' ? '_833' : '';
      const active = this.getDataRefByName(`sim/cockpit2/radios/actuators/${kind}${unit}_frequency_hz${suffix}`);
      const standby = this.getDataRefByName(
        `sim/cockpit2/radios/actuators/${kind}${unit}_standby_frequency_hz${suffix}`,
      );
      if (active !== undefined && standby !== undefined) {
        [active.value, standby.value] = [standby.value, active.value];
      }
    }
    if (command?.name === 'sim/transponder/transponder_ident') {
      const identing = this.getDataRefByName('sim/cockpit2/radios/indicators/transponder_id');
      if (identing !== undefined) {
        identing.value = 1;
      }
    }
```

If the changed values are only pushed to subscribers on change detection, confirm that a swap is streamed (the existing `pushUpdates` sends current values on its timer; read it to be sure).

- [ ] **Step 7: Update `docs/xplane.md`**

Add a "Radios and transponder (F-21, F-22)" subsection beside the F-10 one: a table of every new DataRef and command with type, units, writable, and the verification source (Laminar `DataRefs.txt`/`Commands.txt`; `sim/atc/transponder_assigned` from the 12.4.4 release notes), the `_833` whole-kHz assumption, Laminar's `standy` spelling, and one paragraph on the seven features in `GENERIC_PROFILE` 1.3.0. Update the existing "1.2.0" mention to say 1.2.0 added F-10's features and 1.3.0 adds these.

- [ ] **Step 8: Run and commit**

Run: `npx jest tests/integration/mock-xplane-server.test.ts tests/unit/domain/aircraft-profile.test.ts`, then the gate.

```bash
git add -A src/domain/aircraft/profiles/generic.ts tests docs/xplane.md
git commit -m "feat(radios): profile 1.3.0 with the radios and transponder, and the mock to match

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `ControlButton` selection, `OperationNotice`, and `useReadBack`

**Files:**
- Modify: `src/features/panels/primitives/ControlButton.tsx`
- Create: `src/features/panels/primitives/useReadBack.ts`
- Test: `tests/ui/panel-primitives.test.tsx` (extend), `tests/ui/read-back.test.tsx` (create)

**Interfaces:**
- Consumes (Task 2): `readBackVerdict`, `ReadBackVerdict`.
- Produces:
  - `ControlButton` prop `selected?: boolean` — sets `accessibilityState.selected` and prefixes the visible label with `● `.
  - `export function OperationNotice({ target }: { target: string }): React.ReactElement | null` — the failure or refusal for `target`, exactly what a non-quiet `ControlButton` prints.
  - `export interface ReadBackRequest { key: string; name: string; operation: string; expected: number; failure: (current: DataRefValue | undefined) => string }`
  - `export interface ReadBack { watch(request: ReadBackRequest): void; messageFor(key: string): string | null }`
  - `export function useReadBack(): ReadBack` (must be called inside `PanelFrame`/`PanelScope`).

- [ ] **Step 1: Write the failing tests**

In `tests/ui/panel-primitives.test.tsx`, following the file's existing harness (a `PanelFrame` around the control with a live snapshot):

```ts
  it('marks a selected control for sight and for screen readers', async () => {
    await render(
      frame(
        live(),
        <ControlButton label="ALT" featureId={FEATURE_HEADING_CONTROL} target={D.headingBug} selected onPress={() => undefined} />,
      ),
    );
    const button = screen.getByRole('button', { name: 'ALT' });
    expect(button.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('● ALT')).toBeTruthy();
  });

  it('prints a quiet control’s failure once through OperationNotice', async () => {
    const snapshot = live({
      operations: {
        [D.headingBug]: { status: 'failed', failure: null, refusal: 'notConnected', at: NOW },
      },
    });
    await render(
      frame(
        snapshot,
        <>
          <ControlButton label="A" featureId={FEATURE_HEADING_CONTROL} target={D.headingBug} quiet onPress={() => undefined} />
          <OperationNotice target={D.headingBug} />
        </>,
      ),
    );
    expect(screen.getAllByText('Not sent: Avionix is not connected to X-Plane.')).toHaveLength(1);
  });
```

(Use the helper names the file already has; if it names them differently, adapt the two tests to them rather than adding a second harness.)

`tests/ui/read-back.test.tsx` — a harness component that calls `useReadBack()`, exposes `watch` through a button, and prints `messageFor('com1')`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_COMMANDS as C, GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { READ_BACK_MS } from '@/domain/panels/read-back';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const actions: PanelActions = { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };

function snapshot(active: number, overrides: Partial<SessionSnapshot> = {}, heartbeatAt = NOW): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: heartbeatAt },
    telemetry: { [D.com1Active]: { value: active, receivedAt: NOW } },
    ...overrides,
  };
}

function Harness() {
  const readBack = useReadBack();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="watch"
        onPress={() =>
          readBack.watch({
            key: 'com1',
            name: D.com1Active,
            operation: C.com1Flip,
            expected: 118_005,
            failure: () => 'X-Plane did not swap COM1.',
          })
        }
      />
      <Text>{readBack.messageFor('com1') ?? 'no message'}</Text>
    </>
  );
}

function tree(s: SessionSnapshot, now: number) {
  return (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelFrame title="Radios" snapshot={s} now={now} actions={actions}>
        <Harness />
      </PanelFrame>
    </ThemeProvider>
  );
}

const ok = (at: number) => ({ [C.com1Flip]: { status: 'ok' as const, failure: null, refusal: null, at } });

describe('useReadBack', () => {
  it('says nothing when X-Plane adopts the value', async () => {
    const view = await render(tree(snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    await view.rerender(tree(snapshot(118_005, { operations: ok(NOW) }), NOW + 500));
    await view.rerender(tree(snapshot(118_005, { operations: ok(NOW) }), NOW + READ_BACK_MS + 1000));
    expect(screen.getByText('no message')).toBeTruthy();
  });

  it('says so when the value has not changed after the window', async () => {
    const view = await render(tree(snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    await view.rerender(tree(snapshot(121_500, { operations: ok(NOW) }), NOW + 1000));
    expect(screen.getByText('no message')).toBeTruthy();
    await view.rerender(tree(snapshot(121_500, { operations: ok(NOW) }), NOW + READ_BACK_MS));
    expect(screen.getByText('X-Plane did not swap COM1.')).toBeTruthy();
  });

  it('never gives a late sentence once adopted, even if the pilot then changes it in X-Plane', async () => {
    const view = await render(tree(snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    await view.rerender(tree(snapshot(118_005, { operations: ok(NOW) }), NOW + 500));
    await view.rerender(tree(snapshot(122_800, { operations: ok(NOW) }), NOW + READ_BACK_MS + 1000));
    expect(screen.getByText('no message')).toBeTruthy();
  });

  it('gives no verdict when the link drops during the window', async () => {
    const view = await render(tree(snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    const dropped = snapshot(121_500, { operations: ok(NOW), state: 'reconnecting' });
    await view.rerender(tree(dropped, NOW + READ_BACK_MS + 1000));
    await view.rerender(tree(snapshot(121_500, { operations: ok(NOW) }, NOW + 9000), NOW + 9000));
    expect(screen.getByText('no message')).toBeTruthy();
  });

  it('clears the old sentence when the same key is watched again', async () => {
    const view = await render(tree(snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    await view.rerender(tree(snapshot(121_500, { operations: ok(NOW) }), NOW + READ_BACK_MS));
    expect(screen.getByText('X-Plane did not swap COM1.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('watch'));
    expect(screen.getByText('no message')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/ui/read-back.test.tsx tests/ui/panel-primitives.test.tsx`
Expected: FAIL (module missing; `selected` and `OperationNotice` absent).

- [ ] **Step 3: Implement**

In `ControlButton.tsx`:
- Add to `Props`: `/** One of a set of positions (a transponder mode): marked for sight and for screen readers. */ selected?: boolean;`
- `const shown = armed ? \`Tap again: ${props.label}\` : props.selected === true ? \`● ${props.label}\` : props.label;` and keep `accessibleName` as now (the plain label, not the marked one) so screen readers hear "ALT, selected" from `accessibilityState`.
- `accessibilityState={{ disabled: !enabled, busy: pending, selected: props.selected === true }}`.
- Replace the private `Outcome({ outcome })` with an exported `OperationNotice({ target }: { target: string })` that reads `usePanel().snapshot.operations[target]` and renders exactly what `Outcome` rendered; the button uses `{props.quiet === true ? null : <OperationNotice target={props.target} />}`. Doc comment: "Failures reach the screen only through FailureNotice (R11); refusals in fixed words. Exported so a row of quiet controls can print their target's outcome once."

`src/features/panels/primitives/useReadBack.ts`:

```ts
import { useState } from 'react';

import { readBackVerdict } from '@/domain/panels/read-back';
import type { DataRefValue } from '@/domain/simulator/types';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface ReadBackRequest {
  /** Where the sentence is shown (a radio, the squawk, the mode). A new watch replaces the old. */
  key: string;
  /** The DataRef expected to change. */
  name: string;
  /** The binding whose operation outcome counts: the DataRef written, or the command activated. */
  operation: string;
  expected: number;
  /** The sentence when X-Plane did not take it, given the value it reports instead. */
  failure: (current: DataRefValue | undefined) => string;
}

export interface ReadBack {
  watch: (request: ReadBackRequest) => void;
  messageFor: (key: string) => string | null;
}

type Watch =
  | { kind: 'watching'; request: ReadBackRequest; startedAt: number }
  | { kind: 'settled'; message: string | null };

/**
 * Checks that X-Plane adopted what a control sent (F-21 R4, F-22 R4). Each watch settles exactly
 * once: a value the pilot later changes in the simulator must not produce a late "did not take".
 * Evaluated during render, which the panel clock drives every second, so no timer of its own; the
 * state is settled with React's adjust-while-rendering pattern (effects may not set state here).
 */
export function useReadBack(): ReadBack {
  const { snapshot, link, now } = usePanel();
  const [watches, setWatches] = useState<Readonly<Record<string, Watch>>>({});

  let settled: Record<string, Watch> | null = null;
  for (const [key, watch] of Object.entries(watches)) {
    if (watch.kind !== 'watching') {
      continue;
    }
    const current = snapshot.telemetry[watch.request.name]?.value;
    const verdict = readBackVerdict({
      current,
      expected: watch.request.expected,
      operation: snapshot.operations[watch.request.operation],
      startedAt: watch.startedAt,
      valuesCurrent: link.valuesCurrent,
      now,
    });
    if (verdict === 'waiting') {
      continue;
    }
    settled ??= { ...watches };
    settled[key] = {
      kind: 'settled',
      message: verdict === 'notAdopted' ? watch.request.failure(current) : null,
    };
  }
  if (settled !== null) {
    setWatches(settled);
  }

  return {
    watch: (request) =>
      setWatches((previous) => ({
        ...previous,
        [request.key]: { kind: 'watching', request, startedAt: now },
      })),
    messageFor: (key) => {
      const watch = watches[key];
      return watch?.kind === 'settled' ? watch.message : null;
    },
  };
}
```

If the repo's React lint rules reject the render-time `setWatches`, follow `ControlButton`'s `armed` reset, which is the accepted precedent; do not move it into an effect.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/ui/read-back.test.tsx tests/ui/panel-primitives.test.tsx tests/ui/error-text-guard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
git add src/features/panels/primitives tests/ui/read-back.test.tsx tests/ui/panel-primitives.test.tsx
git commit -m "feat(panels): selected controls, a shared operation notice and read-back watches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Radios panel with its four radio rows

**Files:**
- Create: `src/features/panels/radios/radios.ts`, `src/features/panels/radios/RadioRow.tsx`, `src/features/panels/radios/RadiosPanel.tsx`
- Modify: `src/features/panels/registry.ts`, `tests/ui/panels.test.tsx:58`
- Test: `tests/ui/radios-panel.test.tsx` (create)

**Interfaces:**
- Consumes: Task 1 formatters; Task 3 names and feature ids; Task 4 `ControlButton` (`quiet`), `OperationNotice`, `useReadBack`, `ReadBack`; `firstNumber` from `@/features/panels/instruments/useInstrumentValues`; `decodeDataRefString` from `@/domain/simulator/dataref-string`; `formatDistance` from `@/domain/flight-data/format`; `useUnits` from `@/features/units/UnitsProvider`; `controlAvailability`, `featureOf`.
- Produces:
  - `RadioKey = 'com1' | 'com2' | 'nav1' | 'nav2'`; `RadioSpec { key; label; kind: 'com' | 'nav'; featureId; active; standby; flip; navId?; hasDme?; dme?; course? }`; `RADIOS: readonly RadioSpec[]`; `formatFrequency(kind: 'com' | 'nav', value: number): string`; `RADIOS_PANEL: PanelDescriptor`.
  - `RadioRow({ radio, readBack, onEnterStandby }: { radio: RadioSpec; readBack: ReadBack; onEnterStandby: () => void })`.
  - `RadiosPanel()` — Task 6 adds the entry, Task 7 the transponder.

- [ ] **Step 1: Write the failing tests**

`tests/ui/radios-panel.test.tsx`, with the same harness shape as `tests/ui/baro-controls.test.tsx` (ThemeProvider → UnitsProvider → PanelFrame title "Radios" → `<RadiosPanel />`), a `live()` snapshot whose telemetry holds:

```ts
const VALUES = {
  [D.com1Active]: 121_500,
  [D.com1Standby]: 118_005,
  [D.com2Active]: 118_000,
  [D.com2Standby]: 124_850,
  [D.nav1Active]: 11_030,
  [D.nav1Standby]: 10_850,
  [D.nav2Active]: 11_390,
  [D.nav2Standby]: 11_720,
  [D.nav1Id]: 'SUJPUwAAAAA=',
  [D.nav1HasDme]: 1,
  [D.nav1Dme]: 12.4,
  [D.nav1Course]: 247,
  [D.transponderCode]: 7000,
  [D.transponderMode]: 3,
};
```

and every feature `available`. Tests:

```ts
it('shows each radio’s active and standby as X-Plane reports them', async () => {
  await render(tree(live()));
  expect(screen.getByLabelText('COM1: active 121.500, standby 118.005')).toBeTruthy();
  expect(screen.getByLabelText('COM2: active 118.000, standby 124.850')).toBeTruthy();
  expect(screen.getByLabelText('NAV1: active 110.30, standby 108.50')).toBeTruthy();
  expect(screen.getByLabelText('NAV2: active 113.90, standby 117.20')).toBeTruthy();
});

it('shows the NAV identifier, DME and course only when present', async () => {
  await render(tree(live()));
  expect(screen.getByText('IBOS · 12.4 nm · CRS 247°')).toBeTruthy();
  // NAV2 has no identifier, no DME and no course in this snapshot: no details line.
  expect(screen.queryByText(/CRS 090°/)).toBeNull();
});

it('hides DME distance while there is no DME signal', async () => {
  await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.nav1HasDme]: 0 }) })));
  expect(screen.getByText('IBOS · CRS 247°')).toBeTruthy();
});

it('swaps with the radio’s own command', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Swap NAV1 active and standby'));
  expect(actions.activate).toHaveBeenCalledWith('nav1', C.nav1Flip);
});

it('says when X-Plane did not swap', async () => {
  const view = await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Swap COM1 active and standby'));
  const ok = { [C.com1Flip]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
  await view.rerender(tree(live({ operations: ok }), NOW + 4000));
  expect(screen.getByText('X-Plane did not swap COM1.')).toBeTruthy();
});

it('keeps the other radios working when NAV2 is missing, and says why once', async () => {
  const snapshot = live();
  await render(
    tree({
      ...snapshot,
      compatibility: {
        ...snapshot.compatibility,
        features: snapshot.compatibility.features.map((feature) =>
          feature.id === 'nav2'
            ? { ...feature, status: 'unavailable' as const, missing: [{ name: D.nav2Standby, purpose: 'NAV2 standby frequency, written when you set one' }] }
            : feature,
        ),
      },
    }),
  );
  expect(screen.getAllByText('NAV2 is not available on this aircraft: NAV2 standby frequency, written when you set one.')).toHaveLength(1);
  expect(screen.getByLabelText('Swap NAV2 active and standby').props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByLabelText('Swap NAV1 active and standby').props.accessibilityState).toMatchObject({ disabled: false });
  expect(screen.getByLabelText('Enter COM1 standby').props.accessibilityState).toMatchObject({ disabled: false });
});

it('marks values not live and disables every control while the link is down', async () => {
  await render(tree(live({ state: 'reconnecting' })));
  expect(screen.getByLabelText('COM1: active 121.500, standby 118.005, not live')).toBeTruthy();
  expect(screen.getByLabelText('Swap COM1 active and standby').props.accessibilityState).toMatchObject({ disabled: true });
});

it('shows no values with no flight loaded', async () => {
  const snapshot = live();
  await render(tree({ ...snapshot, health: { ...snapshot.health, activity: 'noFlight' } }));
  expect(screen.getByLabelText('COM1: active —, standby —')).toBeTruthy();
});

it('shows a dash for a value that is not a number', async () => {
  await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.com1Active]: 'AAAA' }) })));
  expect(screen.getByLabelText('COM1: active —, standby 118.005')).toBeTruthy();
});
```

The `missing` element type is whatever `FeatureAvailability['missing']` holds; read `src/domain/aircraft/availability.ts` and build it with that shape (it carries at least `purpose`). In `tests/ui/panels.test.tsx` change the order expectation to `['instruments', 'radios', 'flight-data', 'heading']`.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/ui/radios-panel.test.tsx tests/ui/panels.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/features/panels/radios/radios.ts`:

```ts
import {
  FEATURE_COM1,
  FEATURE_COM2,
  FEATURE_NAV1,
  FEATURE_NAV2,
  FEATURE_TRANSPONDER_CODE,
  FEATURE_TRANSPONDER_IDENT,
  FEATURE_TRANSPONDER_MODE,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { formatCom, formatNav } from '@/domain/radios/channels';

export type RadioKey = 'com1' | 'com2' | 'nav1' | 'nav2';

export interface RadioSpec {
  key: RadioKey;
  label: string;
  kind: 'com' | 'nav';
  featureId: string;
  active: string;
  standby: string;
  flip: string;
  navId?: string;
  hasDme?: string;
  dme?: string;
  course?: string;
}

export const RADIOS: readonly RadioSpec[] = [
  { key: 'com1', label: 'COM1', kind: 'com', featureId: FEATURE_COM1, active: D.com1Active, standby: D.com1Standby, flip: C.com1Flip },
  { key: 'com2', label: 'COM2', kind: 'com', featureId: FEATURE_COM2, active: D.com2Active, standby: D.com2Standby, flip: C.com2Flip },
  {
    key: 'nav1', label: 'NAV1', kind: 'nav', featureId: FEATURE_NAV1, active: D.nav1Active, standby: D.nav1Standby, flip: C.nav1Flip,
    navId: D.nav1Id, hasDme: D.nav1HasDme, dme: D.nav1Dme, course: D.nav1Course,
  },
  {
    key: 'nav2', label: 'NAV2', kind: 'nav', featureId: FEATURE_NAV2, active: D.nav2Active, standby: D.nav2Standby, flip: C.nav2Flip,
    navId: D.nav2Id, hasDme: D.nav2HasDme, dme: D.nav2Dme, course: D.nav2Course,
  },
];

export function formatFrequency(kind: 'com' | 'nav', value: number): string {
  return kind === 'com' ? formatCom(value) : formatNav(value);
}

export const RADIOS_PANEL: PanelDescriptor = {
  id: 'radios',
  title: 'Radios',
  features: [
    FEATURE_COM1,
    FEATURE_COM2,
    FEATURE_NAV1,
    FEATURE_NAV2,
    FEATURE_TRANSPONDER_CODE,
    FEATURE_TRANSPONDER_MODE,
    FEATURE_TRANSPONDER_IDENT,
  ],
  supports: EVERYWHERE,
};
```

`src/features/panels/radios/RadioRow.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import { formatDistance } from '@/domain/flight-data/format';
import { controlAvailability } from '@/domain/panels/control-availability';
import { decodeDataRefString } from '@/domain/simulator/dataref-string';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { type RadioSpec, formatFrequency } from '@/features/panels/radios/radios';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  summary: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: theme.spacing.sm, flexGrow: 1 },
  name: { color: theme.colors.text, fontSize: theme.typography.titleSize, fontWeight: 'bold' as const, minWidth: 56 },
  active: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    fontVariant: ['tabular-nums' as const],
  },
  stale: { color: theme.colors.textMuted },
});

function courseText(course: number): string {
  const whole = ((Math.round(course) % 360) + 360) % 360;
  return `CRS ${String(whole === 0 ? 360 : whole).padStart(3, '0')}°`;
}

/**
 * One radio (F-21): X-Plane's active and standby values, a swap, and the standby as the button that
 * opens the keypad. Its controls are quiet, so the feature's reason and the swap's failure are
 * printed once, under the row, instead of under each button (C5).
 */
export function RadioRow({
  radio,
  readBack,
  onEnterStandby,
}: {
  radio: RadioSpec;
  readBack: ReadBack;
  onEnterStandby: () => void;
}) {
  const { snapshot, link, activate } = usePanel();
  const { units } = useUnits();
  const styles = useThemedStyles(makeStyles);
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const read = (name: string | undefined) =>
    noFlight || name === undefined ? null : firstNumber(snapshot.telemetry[name]?.value);
  const active = read(radio.active);
  const standby = read(radio.standby);
  const text = (value: number | null) => (value === null ? '—' : formatFrequency(radio.kind, value));
  const notLive = !link.valuesCurrent && (active !== null || standby !== null);

  const details: string[] = [];
  if (!noFlight && radio.navId !== undefined) {
    const id = snapshot.telemetry[radio.navId]?.value;
    const decoded = id === undefined ? null : decodeDataRefString(id, 'data');
    if (decoded !== null) {
      details.push(decoded);
    }
  }
  const dme = read(radio.dme);
  if (read(radio.hasDme) === 1 && dme !== null) {
    details.push(formatDistance(dme, units.distance));
  }
  const course = read(radio.course);
  if (course !== null) {
    details.push(courseText(course));
  }

  const availability = controlAvailability(featureOf(snapshot.compatibility, radio.featureId));
  const message = readBack.messageFor(radio.key);
  const swap = () => {
    void activate(radio.featureId, radio.flip);
    if (standby !== null) {
      readBack.watch({
        key: radio.key,
        name: radio.active,
        operation: radio.flip,
        expected: standby,
        failure: () => `X-Plane did not swap ${radio.label}.`,
      });
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View
          style={styles.summary}
          accessible
          accessibilityLabel={`${radio.label}: active ${text(active)}, standby ${text(standby)}${notLive ? ', not live' : ''}`}
        >
          <Text style={styles.name}>{radio.label}</Text>
          <Text style={[styles.active, link.valuesCurrent ? null : styles.stale]}>{text(active)}</Text>
          {notLive ? <BodyText muted>not live</BodyText> : null}
        </View>
        <ControlButton
          label="⇄"
          accessibilityLabel={`Swap ${radio.label} active and standby`}
          featureId={radio.featureId}
          target={radio.flip}
          quiet
          onPress={swap}
        />
        <ControlButton
          label={text(standby)}
          accessibilityLabel={`Enter ${radio.label} standby`}
          featureId={radio.featureId}
          target={radio.standby}
          quiet
          onPress={onEnterStandby}
        />
      </View>
      {details.length === 0 ? null : <BodyText muted>{details.join(' · ')}</BodyText>}
      {availability.reason === null ? null : <BodyText muted>{availability.reason}</BodyText>}
      <OperationNotice target={radio.flip} />
      {message === null ? null : <BodyText tone="danger">{message}</BodyText>}
    </View>
  );
}
```

`src/features/panels/radios/RadiosPanel.tsx` (Task 6 replaces `onEnterStandby` and adds the entry; Task 7 adds the transponder):

```tsx
import React from 'react';

import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { RadioRow } from '@/features/panels/radios/RadioRow';
import { RADIOS } from '@/features/panels/radios/radios';

export { RADIOS_PANEL } from '@/features/panels/radios/radios';

/**
 * F-21/F-22. Keyed by the aircraft, so a change of aircraft drops every draft and read-back
 * sentence instead of carrying them onto radios they were never meant for.
 */
export function RadiosPanel() {
  const { snapshot } = usePanel();
  const { icaoType, description, tailNumber } = snapshot.compatibility.identity;
  return <RadiosContent key={`${icaoType}|${description}|${tailNumber}`} />;
}

function RadiosContent() {
  const readBack = useReadBack();
  return (
    <>
      {RADIOS.map((radio) => (
        <RadioRow key={radio.key} radio={radio} readBack={readBack} onEnterStandby={() => undefined} />
      ))}
    </>
  );
}
```

`registry.ts`: import `RADIOS_PANEL, RadiosPanel` from `@/features/panels/radios/RadiosPanel` and insert `{ descriptor: RADIOS_PANEL, Component: RadiosPanel }` second.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/ui/radios-panel.test.tsx tests/ui/panels.test.tsx tests/ui/error-text-guard.test.tsx tests/ui/touch-target-guard.test.tsx tests/ui/app-shell.test.tsx`
Expected: PASS. The guards iterate `PANELS`, so the Radios panel is covered from here on; if a guard fails, fix the panel, not the guard. If an app-shell test asserts the switcher's entries, extend it with Radios in second place.

- [ ] **Step 5: Gate and commit**

```bash
git add src/features/panels tests/ui
git commit -m "feat(radios): the Radios panel with COM1, COM2, NAV1 and NAV2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The keypad and the staged entry

**Files:**
- Create: `src/features/panels/radios/Keypad.tsx`, `src/features/panels/radios/EntryPad.tsx`, `src/features/panels/radios/useRadioEntry.ts`
- Modify: `src/features/panels/radios/radios.ts` (entry targets), `src/features/panels/radios/RadiosPanel.tsx`
- Test: `tests/ui/radios-entry.test.tsx` (create)

**Interfaces:**
- Consumes: Task 2 entry functions; Task 1 `isEightThirtyThreeOnly`, `isEmergencySquawk`, `formatSquawk`; Task 4 `ReadBack`; Task 5 `RADIOS`, `formatFrequency`.
- Produces:
  - In `radios.ts`: `EntryTargetId = RadioKey | 'squawk'`; `EntryTarget { id: EntryTargetId; title: string; kind: EntryKind; featureId: string; name: string; readBackKey: string }`; `entryTarget(id: EntryTargetId): EntryTarget` (radios: title `"COM1 standby"`, kind from the radio, name = standby, readBackKey = radio key; squawk: title `"Squawk code"`, kind `'squawk'`, feature `FEATURE_TRANSPONDER_CODE`, name `D.transponderCode`, readBackKey `'squawk'`).
  - `useRadioEntry(): RadioEntry` with `RadioEntry { target: EntryTarget | null; draft: string; open(id): void; digit(n: number): void; erase(): void; clear(): void; cancel(): void; sent(): void }`.
  - `EntryPad({ entry, readBack }: { entry: RadioEntry; readBack: ReadBack })`.
  - `Keypad({ kind, onDigit, onErase, onClear })`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/radios-entry.test.tsx`, same harness and `VALUES` as Task 5's test (copy them; tests do not import each other):

```ts
it('stages an entry without writing, and shows it apart from X-Plane’s value', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  for (const key of ['1', '1', '8', '0', '0', '5']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  expect(actions.write).not.toHaveBeenCalled();
  expect(screen.getByText('New')).toBeTruthy();
  expect(screen.getByText('118.005')).toBeTruthy();
  expect(screen.getByLabelText('COM1: active 121.500, standby 118.005')).toBeTruthy();
});

it('sends the staged channel with Set', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  for (const key of ['1', '2', '2', '8']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
  expect(actions.write).toHaveBeenCalledWith('com1', D.com1Standby, 122_800);
});

it('rejects 118.020 with the nearest channels and keeps Set disabled', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  for (const key of ['1', '1', '8', '0', '2']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  expect(screen.getByText('118.020 is not a COM channel. Nearest: 118.015 or 118.025.')).toBeTruthy();
  expect(screen.getByLabelText('Set COM1 standby').props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
  expect(actions.write).not.toHaveBeenCalled();
});

it('enters NAV frequencies with two decimals', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter NAV1 standby'));
  for (const key of ['1', '1', '3', '9']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  await fireEvent.press(screen.getByLabelText('Set NAV1 standby'));
  expect(actions.write).toHaveBeenCalledWith('nav1', D.nav1Standby, 11_390);
});

it('deletes, clears and cancels', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM2 standby'));
  await fireEvent.press(screen.getByLabelText('1'));
  await fireEvent.press(screen.getByLabelText('2'));
  await fireEvent.press(screen.getByLabelText('Delete'));
  expect(screen.getByText('1__.___')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Clear'));
  expect(screen.getByText('___.___')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Cancel entry'));
  expect(screen.queryByLabelText('Set COM2 standby')).toBeNull();
});

it('switching target starts a fresh draft', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  await fireEvent.press(screen.getByLabelText('1'));
  await fireEvent.press(screen.getByLabelText('Enter NAV2 standby'));
  expect(screen.getByText('___.__')).toBeTruthy();
  expect(screen.getByText('NAV2 standby')).toBeTruthy();
});

it('closes after X-Plane accepts the write, and keeps the draft after a failure', async () => {
  const view = await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  for (const key of ['1', '2', '2', '8']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
  const failed = { [D.com1Standby]: { status: 'failed' as const, failure: null, refusal: 'notConnected' as const, at: NOW } };
  await view.rerender(tree(live({ operations: failed })));
  expect(screen.getByText('122.800')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
  const ok = { [D.com1Standby]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
  await view.rerender(tree(live({ operations: ok })));
  expect(screen.queryByLabelText('Set COM1 standby')).toBeNull();
});

it('disables Set while the write is pending, so a double tap writes once', async () => {
  const view = await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  for (const key of ['1', '2', '2', '8']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
  const pending = { [D.com1Standby]: { status: 'pending' as const, failure: null, refusal: null, at: NOW } };
  await view.rerender(tree(live({ operations: pending })));
  await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
  expect(actions.write).toHaveBeenCalledTimes(1);
});

it('drops the draft when the link goes down, and does not bring it back', async () => {
  const view = await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  await fireEvent.press(screen.getByLabelText('1'));
  await view.rerender(tree(live({ state: 'reconnecting' })));
  expect(screen.queryByLabelText('Set COM1 standby')).toBeNull();
  await view.rerender(tree(live()));
  expect(screen.queryByLabelText('Set COM1 standby')).toBeNull();
  expect(actions.write).not.toHaveBeenCalled();
});

it('drops the draft when the aircraft changes', async () => {
  const view = await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  await fireEvent.press(screen.getByLabelText('1'));
  const snapshot = live();
  await view.rerender(
    tree({
      ...snapshot,
      compatibility: { ...snapshot.compatibility, identity: { ...snapshot.compatibility.identity, icaoType: 'B738' } },
    }),
  );
  expect(screen.queryByLabelText('Set COM1 standby')).toBeNull();
});

it('says when X-Plane did not take the channel, with the 25 kHz hint for an 8.33-only channel', async () => {
  const view = await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  for (const key of ['1', '3', '2', '0', '0', '5']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
  const ok = { [D.com1Standby]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
  await view.rerender(tree(live({ operations: ok }), NOW + 4000));
  expect(
    screen.getByText(
      'X-Plane did not take 132.005. COM1 standby is still 118.005. This aircraft’s radio may tune 25 kHz channels only.',
    ),
  ).toBeTruthy();
});

it('keeps every keypad key at least 56 dp tall', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
  for (const label of ['1', '0', 'Delete', 'Clear']) {
    const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(56);
  }
});
```

`tree(snapshot, now = NOW)` passes `now` to `PanelFrame`. Import `StyleSheet` from `react-native`.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/ui/radios-entry.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `radios.ts`:

```ts
import type { EntryKind } from '@/domain/radios/entry';

export type EntryTargetId = RadioKey | 'squawk';

export interface EntryTarget {
  id: EntryTargetId;
  title: string;
  kind: EntryKind;
  featureId: string;
  /** The DataRef Set writes. */
  name: string;
  readBackKey: string;
}

export function entryTarget(id: EntryTargetId): EntryTarget {
  if (id === 'squawk') {
    return { id, title: 'Squawk code', kind: 'squawk', featureId: FEATURE_TRANSPONDER_CODE, name: D.transponderCode, readBackKey: 'squawk' };
  }
  const radio = RADIOS.find((candidate) => candidate.key === id);
  if (radio === undefined) {
    throw new Error('unknown radio');
  }
  return { id, title: `${radio.label} standby`, kind: radio.kind, featureId: radio.featureId, name: radio.standby, readBackKey: radio.key };
}
```

`src/features/panels/radios/useRadioEntry.ts`:

```ts
import { useState } from 'react';

import { deleteDigit, pushDigit } from '@/domain/radios/entry';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { type EntryTarget, type EntryTargetId, entryTarget } from '@/features/panels/radios/radios';

export interface RadioEntry {
  target: EntryTarget | null;
  draft: string;
  open: (id: EntryTargetId) => void;
  digit: (value: number) => void;
  erase: () => void;
  clear: () => void;
  cancel: () => void;
  /** Set was pressed: close once X-Plane accepts the write, keep the draft if it fails. */
  sent: () => void;
}

interface State {
  id: EntryTargetId | null;
  draft: string;
  sentAt: number | null;
}

const CLOSED: State = { id: null, draft: '', sentAt: null };

/**
 * The staged entry (F-21 C2, F-22 T2). One target at a time. The draft is dropped — never kept for
 * later — when controls go inert, so a reconnect can never be followed by sending a stale intent
 * with one tap (C6, T8). Both resets adjust state while rendering, React's documented pattern for
 * deriving state from props; effects may not set state in this repo.
 */
export function useRadioEntry(): RadioEntry {
  const { snapshot, link, now } = usePanel();
  const [state, setState] = useState<State>(CLOSED);
  const target = state.id === null ? null : entryTarget(state.id);

  if (target !== null && !link.controlsEnabled) {
    setState(CLOSED);
  } else if (target !== null && state.sentAt !== null) {
    const outcome = snapshot.operations[target.name];
    if (outcome?.status === 'ok' && outcome.at >= state.sentAt) {
      setState(CLOSED);
    }
  }

  const edit = (next: (draft: string) => string) =>
    setState((previous) => ({ ...previous, draft: next(previous.draft), sentAt: null }));
  return {
    target,
    draft: state.draft,
    open: (id) => setState({ id, draft: '', sentAt: null }),
    digit: (value) => {
      if (target !== null) {
        edit((draft) => pushDigit(target.kind, draft, value));
      }
    },
    erase: () => edit(deleteDigit),
    clear: () => edit(() => ''),
    cancel: () => setState(CLOSED),
    sent: () => setState((previous) => ({ ...previous, sentAt: now })),
  };
}
```

`src/features/panels/radios/Keypad.tsx`:

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { type EntryKind, entryDigits } from '@/domain/radios/entry';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** Taller than the 48 dp minimum: the radio-stack complaint in the research is keys too small to hit. */
export const KEY_HEIGHT = 56;

const makeStyles = (theme: Theme) => ({
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
  key: {
    flexBasis: '30%' as const,
    flexGrow: 1,
    minHeight: KEY_HEIGHT,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  label: { color: theme.colors.text, fontSize: theme.typography.headingSize, fontWeight: 'bold' as const },
});

interface Props {
  kind: EntryKind;
  onDigit: (digit: number) => void;
  onErase: () => void;
  onClear: () => void;
}

/** Digits in phone order, then delete, 0 and clear. A squawk keypad has no 8 or 9 at all. */
export function Keypad({ kind, onDigit, onErase, onClear }: Props) {
  const styles = useThemedStyles(makeStyles);
  const digits = entryDigits(kind);
  const zero = digits[digits.length - 1];
  const key = (label: string, accessibilityLabel: string, onPress: () => void) => (
    <Pressable
      key={accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.key}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.grid}>
      {digits.slice(0, -1).map((digit) => key(String(digit), String(digit), () => onDigit(digit)))}
      {key('⌫', 'Delete', onErase)}
      {zero === undefined ? null : key(String(zero), String(zero), () => onDigit(zero))}
      {key('Clear', 'Clear', onClear)}
    </View>
  );
}
```

`src/features/panels/radios/EntryPad.tsx`:

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { isEightThirtyThreeOnly } from '@/domain/radios/channels';
import { entryText, parseEntry } from '@/domain/radios/entry';
import { formatSquawk, isEmergencySquawk } from '@/domain/radios/squawk';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { Keypad } from '@/features/panels/radios/Keypad';
import { type EntryTarget, formatFrequency } from '@/features/panels/radios/radios';
import type { RadioEntry } from '@/features/panels/radios/useRadioEntry';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
    maxWidth: 420,
    width: '100%' as const,
  },
  title: { color: theme.colors.text, fontSize: theme.typography.titleSize, fontWeight: 'bold' as const },
  display: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: theme.spacing.sm },
  draft: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    fontVariant: ['tabular-nums' as const],
  },
  actions: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: theme.touch.spacing },
  cancel: { minHeight: theme.touch.minTarget, minWidth: theme.touch.minTarget, justifyContent: 'center' as const, paddingHorizontal: theme.spacing.lg },
  cancelLabel: { color: theme.colors.primary, fontSize: theme.typography.titleSize },
});

function notTakenSentence(target: EntryTarget, value: number, text: string, current: number | null) {
  if (target.kind === 'squawk') {
    return `X-Plane did not take squawk ${text}.`;
  }
  const still =
    current === null ? '' : ` ${target.title} is still ${formatFrequency(target.kind, current)}.`;
  const hint =
    target.kind === 'com' && isEightThirtyThreeOnly(value)
      ? ' This aircraft’s radio may tune 25 kHz channels only.'
      : '';
  return `X-Plane did not take ${text}.${still}${hint}`;
}

/**
 * The staged value lives only here, in a dashed box under the word "New", so it can never be read
 * as X-Plane's value (C2, T2). Set is the only path to a write; an invalid draft explains itself
 * and keeps Set disabled (C3, T3). An emergency squawk takes a second tap.
 */
export function EntryPad({ entry, readBack }: { entry: RadioEntry; readBack: ReadBack }) {
  const styles = useThemedStyles(makeStyles);
  const { write } = usePanel();
  const target = entry.target;
  if (target === null) {
    return null;
  }
  const parsed = parseEntry(target.kind, entry.draft);
  const shown = parsed.status === 'valid' ? parsed.text : entryText(target.kind, entry.draft);
  const send = () => {
    if (parsed.status !== 'valid') {
      return;
    }
    const { value, text } = parsed;
    void write(target.featureId, target.name, value);
    readBack.watch({
      key: target.readBackKey,
      name: target.name,
      operation: target.name,
      expected: value,
      failure: (current) => notTakenSentence(target, value, text, firstNumber(current)),
    });
    entry.sent();
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{target.title}</Text>
      <View
        style={styles.display}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${target.title}, new value ${shown.replace(/_/g, '')}`}
      >
        <BodyText>New</BodyText>
        <Text style={styles.draft}>{shown}</Text>
      </View>
      {parsed.status === 'valid' && parsed.note !== null ? <BodyText tone="danger">{parsed.note}</BodyText> : null}
      {parsed.status !== 'valid' && parsed.message !== null ? <BodyText tone="danger">{parsed.message}</BodyText> : null}
      <Keypad kind={target.kind} onDigit={entry.digit} onErase={entry.erase} onClear={entry.clear} />
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel entry" onPress={entry.cancel} style={styles.cancel}>
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
        <ControlButton
          label="Set"
          accessibilityLabel={`Set ${target.title}`}
          featureId={target.featureId}
          target={target.name}
          invalid={parsed.status !== 'valid'}
          confirm={parsed.status === 'valid' && target.kind === 'squawk' && isEmergencySquawk(parsed.value)}
          onPress={send}
        />
      </View>
    </View>
  );
}
```

Remove the unused `formatSquawk` import if typecheck/lint flags it. In `RadiosPanel.tsx`, `RadiosContent` becomes:

```tsx
function RadiosContent() {
  const readBack = useReadBack();
  const entry = useRadioEntry();
  return (
    <>
      {RADIOS.map((radio) => (
        <RadioRow key={radio.key} radio={radio} readBack={readBack} onEnterStandby={() => entry.open(radio.key)} />
      ))}
      <EntryPad entry={entry} readBack={readBack} />
    </>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/ui/radios-entry.test.tsx tests/ui/radios-panel.test.tsx tests/ui/touch-target-guard.test.tsx tests/ui/error-text-guard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
git add src/features/panels/radios tests/ui/radios-entry.test.tsx
git commit -m "feat(radios): keypad entry staged until Set, validated, and checked against X-Plane

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The transponder

**Files:**
- Create: `src/features/panels/radios/TransponderSection.tsx`
- Modify: `src/features/panels/radios/RadiosPanel.tsx`
- Test: `tests/ui/radios-transponder.test.tsx` (create)

**Interfaces:**
- Consumes: Task 1 `MODE_POSITIONS`, `modeLabel`, `isSquawk`, `formatSquawk`, `isEmergencySquawk`; Task 4 `ControlButton` (`selected`, `quiet`, `confirm`), `OperationNotice`, `ReadBack`; Task 6 `RadioEntry` (`open('squawk')`).
- Produces: `TransponderSection({ readBack, onEnterCode }: { readBack: ReadBack; onEnterCode: () => void })`; `IDENT_SENT_MS = 5000`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/radios-transponder.test.tsx`, same harness and `VALUES` (plus `[D.atcAssignedCode]: 4521`, `[D.transponderIdenting]: 0`):

```ts
it('shows the code and mode X-Plane reports', async () => {
  await render(tree(live()));
  expect(screen.getByLabelText('Transponder: squawk 7000, mode ALT')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Transponder altitude' }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('button', { name: 'Transponder standby' }).props.accessibilityState).toMatchObject({ selected: false });
});

it('writes the selected mode and checks it', async () => {
  const view = await render(tree(live()));
  await fireEvent.press(screen.getByRole('button', { name: 'Transponder standby' }));
  expect(actions.write).toHaveBeenCalledWith('transponder-mode', D.transponderMode, 1);
  const ok = { [D.transponderMode]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
  await view.rerender(tree(live({ operations: ok }), NOW + 4000));
  expect(screen.getByText('X-Plane did not change the transponder to STBY.')).toBeTruthy();
});

it('names a reported mode the panel does not offer, with no position selected', async () => {
  await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderMode]: 7 }) })));
  expect(screen.getByLabelText('Transponder: squawk 7000, mode TA/RA')).toBeTruthy();
  for (const name of ['off', 'standby', 'on', 'altitude']) {
    expect(screen.getByRole('button', { name: `Transponder ${name}` }).props.accessibilityState).toMatchObject({ selected: false });
  }
});

it('shows a dash for a code that is not a squawk', async () => {
  await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderCode]: 8000 }) })));
  expect(screen.getByLabelText('Transponder: squawk —, mode ALT')).toBeTruthy();
});

it('enters a code on a 0–7 keypad and sends it', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter squawk code'));
  expect(screen.queryByLabelText('8')).toBeNull();
  expect(screen.queryByLabelText('9')).toBeNull();
  for (const key of ['0', '4', '0', '0']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  await fireEvent.press(screen.getByLabelText('Set Squawk code'));
  expect(actions.write).toHaveBeenCalledWith('transponder-code', D.transponderCode, 400);
});

it('asks for four digits', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter squawk code'));
  await fireEvent.press(screen.getByLabelText('7'));
  expect(screen.getByText('Enter four digits.')).toBeTruthy();
  expect(screen.getByLabelText('Set Squawk code').props.accessibilityState).toMatchObject({ disabled: true });
});

it('needs a second tap for an emergency code, and names it', async () => {
  await render(tree(live()));
  await fireEvent.press(screen.getByLabelText('Enter squawk code'));
  for (const key of ['7', '7', '0', '0']) {
    await fireEvent.press(screen.getByLabelText(key));
  }
  expect(screen.getByText('7700 — emergency')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Set Squawk code'));
  expect(actions.write).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Tap again: Set'));
  expect(actions.write).toHaveBeenCalledWith('transponder-code', D.transponderCode, 7700);
});

it('IDENT activates the command and says it was sent, and Identing follows X-Plane', async () => {
  const view = await render(tree(live()));
  await fireEvent.press(screen.getByRole('button', { name: 'IDENT' }));
  expect(actions.activate).toHaveBeenCalledWith('transponder-ident', C.transponderIdent);
  const ok = { [C.transponderIdent]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
  await view.rerender(tree(live({ operations: ok }), NOW + 1000));
  expect(screen.getByText('IDENT sent')).toBeTruthy();
  expect(screen.queryByText('Identing')).toBeNull();
  await view.rerender(tree(live({ operations: ok }), NOW + 6000));
  expect(screen.queryByText('IDENT sent')).toBeNull();
  await view.rerender(tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderIdenting]: 1 }) })));
  expect(screen.getByText('Identing')).toBeTruthy();
});

it('shows the ATC-assigned code, and offers to squawk it when it differs', async () => {
  await render(tree(live()));
  expect(screen.getByText('ATC assigned 4521 — not set')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Squawk 4521' }));
  expect(actions.write).toHaveBeenCalledWith('transponder-code', D.transponderCode, 4521);
});

it('confirms a matching assigned code', async () => {
  await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderCode]: 4521 }) })));
  expect(screen.getByText('ATC assigned 4521 ✓')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Squawk 4521' })).toBeNull();
});

it('leaves the comparison out, silently, when there is no assigned code', async () => {
  const withoutAssigned = { ...VALUES };
  delete withoutAssigned[D.atcAssignedCode];
  for (const values of [withoutAssigned, { ...VALUES, [D.atcAssignedCode]: 0 }, { ...VALUES, [D.atcAssignedCode]: 9999 }]) {
    const view = await render(tree(live({ telemetry: telemetry(values) })));
    expect(screen.queryByText(/ATC assigned/)).toBeNull();
    await view.unmount();
  }
});
```

(Remove the `ATC assigned` binding by deleting it from the telemetry; with the binding `missing` in `compatibility.bindings` the result must be the same — add that as a fourth case if `compatibility.bindings` is easy to set in the harness.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/ui/radios-transponder.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/features/panels/radios/TransponderSection.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import {
  FEATURE_TRANSPONDER_CODE,
  FEATURE_TRANSPONDER_IDENT,
  FEATURE_TRANSPONDER_MODE,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { controlAvailability } from '@/domain/panels/control-availability';
import { formatSquawk, isEmergencySquawk, isSquawk } from '@/domain/radios/squawk';
import { MODE_POSITIONS, modeLabel } from '@/domain/radios/transponder-mode';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** How long "IDENT sent" stays: the panel's own claim, kept short of a real ident's ~18 s. */
export const IDENT_SENT_MS = 5000;

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs, paddingVertical: theme.spacing.sm },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: theme.spacing.sm },
  summary: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: theme.spacing.sm, flexGrow: 1 },
  name: { color: theme.colors.text, fontSize: theme.typography.titleSize, fontWeight: 'bold' as const },
  mode: { color: theme.colors.text, fontSize: theme.typography.titleSize, fontVariant: ['tabular-nums' as const] },
  stale: { color: theme.colors.textMuted },
});

/**
 * F-22. The code button opens the 0–7 keypad; the four mode positions write `transponder_mode`;
 * IDENT is a command. "Identing" is shown only while X-Plane reports it (T5), and the ATC-assigned
 * comparison is simply absent when X-Plane has no such value (T7).
 */
export function TransponderSection({ readBack, onEnterCode }: { readBack: ReadBack; onEnterCode: () => void }) {
  const { snapshot, link, now, write, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const read = (name: string) => (noFlight ? null : firstNumber(snapshot.telemetry[name]?.value));
  const rawCode = read(D.transponderCode);
  const code = rawCode !== null && isSquawk(rawCode) ? rawCode : null;
  const mode = read(D.transponderMode);
  const identing = read(D.transponderIdenting) === 1;
  const rawAssigned = read(D.atcAssignedCode);
  const assigned = rawAssigned !== null && rawAssigned > 0 && isSquawk(rawAssigned) ? rawAssigned : null;
  const codeText = code === null ? '—' : formatSquawk(code);
  const modeText = modeLabel(mode) ?? '—';
  const notLive = !link.valuesCurrent && (code !== null || mode !== null);

  const identOutcome = snapshot.operations[C.transponderIdent];
  const identSent = identOutcome?.status === 'ok' && now - identOutcome.at < IDENT_SENT_MS;

  const codeAvailability = controlAvailability(featureOf(snapshot.compatibility, FEATURE_TRANSPONDER_CODE));
  const modeAvailability = controlAvailability(featureOf(snapshot.compatibility, FEATURE_TRANSPONDER_MODE));

  const squawk = (value: number) => {
    void write(FEATURE_TRANSPONDER_CODE, D.transponderCode, value);
    readBack.watch({
      key: 'squawk',
      name: D.transponderCode,
      operation: D.transponderCode,
      expected: value,
      failure: () => `X-Plane did not take squawk ${formatSquawk(value)}.`,
    });
  };
  const select = (value: number, label: string) => {
    void write(FEATURE_TRANSPONDER_MODE, D.transponderMode, value);
    readBack.watch({
      key: 'mode',
      name: D.transponderMode,
      operation: D.transponderMode,
      expected: value,
      failure: () => `X-Plane did not change the transponder to ${label}.`,
    });
  };
  const squawkMessage = readBack.messageFor('squawk');
  const modeMessage = readBack.messageFor('mode');

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View
          style={styles.summary}
          accessible
          accessibilityLabel={`Transponder: squawk ${codeText}, mode ${modeText}${identing ? ', identing' : ''}${notLive ? ', not live' : ''}`}
        >
          <Text style={styles.name}>Transponder</Text>
          <Text style={[styles.mode, link.valuesCurrent ? null : styles.stale]}>{modeText}</Text>
          {identing ? <BodyText tone="success">Identing</BodyText> : null}
          {notLive ? <BodyText muted>not live</BodyText> : null}
        </View>
        <ControlButton
          label={codeText}
          accessibilityLabel="Enter squawk code"
          featureId={FEATURE_TRANSPONDER_CODE}
          target={D.transponderCode}
          quiet
          onPress={onEnterCode}
        />
      </View>
      {codeAvailability.reason === null ? null : <BodyText muted>{codeAvailability.reason}</BodyText>}
      <OperationNotice target={D.transponderCode} />
      {squawkMessage === null ? null : <BodyText tone="danger">{squawkMessage}</BodyText>}
      {assigned === null ? null : assigned === code ? (
        <BodyText>{`ATC assigned ${formatSquawk(assigned)} ✓`}</BodyText>
      ) : (
        <View style={styles.row}>
          <BodyText tone="danger">{`ATC assigned ${formatSquawk(assigned)} — not set`}</BodyText>
          <ControlButton
            label={`Squawk ${formatSquawk(assigned)}`}
            featureId={FEATURE_TRANSPONDER_CODE}
            target={D.transponderCode}
            quiet
            confirm={isEmergencySquawk(assigned)}
            onPress={() => squawk(assigned)}
          />
        </View>
      )}
      <View style={styles.row}>
        {MODE_POSITIONS.map((position) => (
          <ControlButton
            key={position.value}
            label={position.label}
            accessibilityLabel={`Transponder ${position.spoken}`}
            featureId={FEATURE_TRANSPONDER_MODE}
            target={D.transponderMode}
            quiet
            selected={mode === position.value}
            onPress={() => select(position.value, position.label)}
          />
        ))}
      </View>
      {modeAvailability.reason === null ? null : <BodyText muted>{modeAvailability.reason}</BodyText>}
      <OperationNotice target={D.transponderMode} />
      {modeMessage === null ? null : <BodyText tone="danger">{modeMessage}</BodyText>}
      <View style={styles.row}>
        <ControlButton
          label="IDENT"
          featureId={FEATURE_TRANSPONDER_IDENT}
          target={C.transponderIdent}
          onPress={() => void activate(FEATURE_TRANSPONDER_IDENT, C.transponderIdent)}
        />
        {identSent ? <BodyText>IDENT sent</BodyText> : null}
      </View>
    </View>
  );
}
```

In `RadiosContent`, after the radio rows: `<TransponderSection readBack={readBack} onEnterCode={() => entry.open('squawk')} />`, then the `EntryPad`.

The emergency confirm test presses `'Tap again: Set'` — `ControlButton`'s armed state changes the accessible name to `Tap again: Set` (see `ControlButton`); keep that.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/ui/radios-transponder.test.tsx tests/ui/radios-panel.test.tsx tests/ui/radios-entry.test.tsx tests/ui/touch-target-guard.test.tsx tests/ui/error-text-guard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
git add src/features/panels/radios tests/ui/radios-transponder.test.tsx
git commit -m "feat(radios): the transponder — code, mode, IDENT and the ATC-assigned code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Two-column layout and the mock integration

**Files:**
- Modify: `src/features/panels/radios/RadiosPanel.tsx`
- Create: `tests/integration/radios-transponder.test.ts`
- Test: `tests/ui/radios-panel.test.tsx` (extend)

**Interfaces:**
- Produces: `TWO_COLUMN_MIN_WIDTH = 720` exported from `RadiosPanel.tsx`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/radios-panel.test.tsx`:

```ts
it('puts the entry beside the stack on a wide screen, and under it on a narrow one', async () => {
  // Mock useWindowDimensions the way tests/ui/instruments-panel.test.tsx does, once at 1024 × 768
  // and once at 390 × 844; open an entry; assert the testID "radios-columns" style.
  // Wide: flexDirection 'row'. Narrow: flexDirection 'column'.
});
```

Write this test fully in the style of the instruments-panel test's window mocking (read it first); the assertion is `StyleSheet.flatten(screen.getByTestId('radios-columns').props.style).flexDirection`.

`tests/integration/radios-transponder.test.ts` — copy the `createSession` and `until` helpers from `tests/integration/flight-instruments.test.ts`, demand all seven features, then:

```ts
it('streams the radios and reports every feature available', async () => {
  const session = await connected();
  await until(() => valueOf(session, D.com1Active) !== undefined);
  await until(() => valueOf(session, D.transponderCode) !== undefined);
  expect(valueOf(session, D.com1Active)).toBe(121_500);
  expect(valueOf(session, D.nav1Standby)).toBe(10_850);
  const { compatibility } = session.store.getSnapshot();
  for (const id of RADIOS_PANEL.features) {
    expect(featureStatus(compatibility, id)).toBe('available');
  }
  session.disconnect();
});

it('writes a COM standby channel and swaps it in', async () => {
  const session = await connected();
  await until(() => valueOf(session, D.com1Standby) === 118_005);
  await session.write(FEATURE_COM1, D.com1Standby, 122_800);
  await until(() => valueOf(session, D.com1Standby) === 122_800);
  await session.activate(FEATURE_COM1, C.com1Flip);
  await until(() => valueOf(session, D.com1Active) === 122_800);
  expect(valueOf(session, D.com1Standby)).toBe(121_500);
  session.disconnect();
});

it('sets the squawk and the mode, and idents', async () => {
  const session = await connected();
  await until(() => valueOf(session, D.transponderCode) === 1200);
  await session.write(FEATURE_TRANSPONDER_CODE, D.transponderCode, 4521);
  await session.write(FEATURE_TRANSPONDER_MODE, D.transponderMode, 3);
  await session.activate(FEATURE_TRANSPONDER_IDENT, C.transponderIdent);
  await until(() => valueOf(session, D.transponderCode) === 4521);
  await until(() => valueOf(session, D.transponderMode) === 3);
  await until(() => valueOf(session, D.transponderIdenting) === 1);
  session.disconnect();
});

it('accepts a write the aircraft ignores, which only the read-back can catch', async () => {
  server.ignoreWritesTo(D.transponderCode);
  const session = await connected();
  await until(() => valueOf(session, D.transponderCode) === 1200);
  await session.write(FEATURE_TRANSPONDER_CODE, D.transponderCode, 4521);
  expect(session.store.getSnapshot().operations[D.transponderCode]?.status).toBe('ok');
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(valueOf(session, D.transponderCode)).toBe(1200);
  session.disconnect();
});

it('leaves the other radios usable when NAV2’s swap command is missing', async () => {
  server.removeCommand(C.nav2Flip);
  const session = await connected();
  const { compatibility } = session.store.getSnapshot();
  expect(featureStatus(compatibility, FEATURE_NAV2)).toBe('unavailable');
  for (const id of [FEATURE_COM1, FEATURE_COM2, FEATURE_NAV1]) {
    expect(featureStatus(compatibility, id)).toBe('available');
  }
  await session.activate(FEATURE_NAV2, C.nav2Flip);
  expect(session.store.getSnapshot().operations[C.nav2Flip]?.refusal).toBe('unavailable');
  session.disconnect();
});

it('treats a simulator without the assigned code as partial, never as unavailable', async () => {
  server.removeDataRef(D.atcAssignedCode);
  const session = await connected();
  const { compatibility } = session.store.getSnapshot();
  expect(featureStatus(compatibility, FEATURE_TRANSPONDER_CODE)).toBe('partial');
  await session.write(FEATURE_TRANSPONDER_CODE, D.transponderCode, 7000);
  await until(() => valueOf(session, D.transponderCode) === 7000);
  session.disconnect();
});
```

- [ ] **Step 2: Run to verify the layout test fails** (the integration tests should already pass against Tasks 3–7; if one fails, the bug is real — fix it in the owning code).

Run: `npx jest tests/ui/radios-panel.test.tsx tests/integration/radios-transponder.test.ts`

- [ ] **Step 3: Implement the layout**

In `RadiosContent`, measure the content width like `InstrumentsPanel` (`useWindowDimensions`, `onLayout`, fallback `window.width - theme.spacing.lg * 2`) and render:

```tsx
<View
  testID="radios-columns"
  onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
  style={{ flexDirection: wide ? 'row' : 'column', gap: theme.touch.spacing, alignItems: 'flex-start' }}
>
  <View style={wide ? { flex: 1 } : { alignSelf: 'stretch' }}>
    {/* radio rows + TransponderSection */}
  </View>
  {entry.target === null ? null : (
    <View style={wide ? { flex: 1 } : { alignSelf: 'stretch' }}>
      <EntryPad entry={entry} readBack={readBack} />
    </View>
  )}
</View>
```

with `const wide = contentWidth >= TWO_COLUMN_MIN_WIDTH;` and a doc comment on the constant: tablets and landscape phones keep the keypad beside the stack, so a pilot sees the radio they are tuning while typing.

- [ ] **Step 4: Run, gate and commit**

Run: `npx jest tests/ui/radios-panel.test.tsx tests/integration/radios-transponder.test.ts`, then the full gate.

```bash
git add src/features/panels/radios tests
git commit -m "feat(radios): keypad beside the stack on wide screens; integration against the mock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Documentation and device checks

**Files:**
- Modify: `docs/architecture.md`, `README.md`, `docs/testing/xplane-smoke-test.md`, `docs/roadmap/features/F-21-com-nav-radios.md`, `docs/roadmap/features/F-22-transponder.md`

- [ ] **Step 1: Architecture and README**

`docs/architecture.md`: in the panels section, add the Radios panel (`src/features/panels/radios/`), the domain modules `src/domain/radios/` and `src/domain/panels/read-back.ts`, the `useReadBack` primitive (watches settle once; the window counts from `OperationOutcome.at`), the staged-entry rule (draft only in the entry pad, dropped when controls disable, panel content keyed by aircraft identity), and the per-radio features. `README.md`: add Radios to the feature list in one line, in the existing style.

- [ ] **Step 2: Device-check rows**

Append rows 73–82 to the table in `docs/testing/xplane-smoke-test.md`, in its existing column format (step | expected | result):

| # | Step | Expected |
|---|---|---|
| 73 | C172: open Radios | COM1/COM2/NAV1/NAV2 match the aircraft's radios; transponder code and mode match |
| 74 | Enter COM1 standby 118.005 on the keypad, Set | The aircraft's COM1 standby shows 118.005 (confirms the whole-kHz assumption for `_833`) |
| 75 | Enter 118.020 | The panel refuses it with the nearest channels; nothing changes in X-Plane |
| 76 | Swap COM1, then change COM1 with the mouse in X-Plane | The swap shows on both; the mouse change appears on the panel within a second |
| 77 | NAV1 to a nearby VOR with DME | Identifier, DME distance and course appear under NAV1 |
| 78 | Squawk 4521, then ALT, then IDENT | Code and mode change in X-Plane; "IDENT sent", then "Identing" for as long as X-Plane idents (note the duration) |
| 79 | Enter 7700 | The panel names it "emergency" and needs a second tap |
| 80 | X-Plane 12.4.4+: request a clearance from X-Plane ATC | "ATC assigned NNNN" appears; it shows "— not set" until the code matches; note what the DataRef reports before any assignment |
| 81 | Disconnect the network with an entry open | The entry disappears; values are muted "not live"; reconnecting sends nothing |
| 82 | Smallest phone, portrait and landscape; a tablet in landscape | Rows fit without clipping; the keypad keys are easy to hit; on the tablet the keypad sits beside the stack |

- [ ] **Step 3: Roadmap status**

In F-21 and F-22, set `Status` to `Done` and add the spec link (`[spec](../../superpowers/specs/2026-09-30-radios-transponder-design.md)`) in the same way F-10's file does — read `docs/roadmap/features/F-10-primary-flight-instruments.md` first and copy its form exactly.

- [ ] **Step 4: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add docs README.md
git commit -m "docs(radios): architecture, README, device checks and roadmap status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage:** verified names → Task 3; profile features → Task 3; channels → Task 1; squawk → Tasks 1, 7; modes → Tasks 1, 7; staged entry → Task 6; read-back → Tasks 2, 4, 5, 6, 7; IDENT → Task 7; assigned code → Tasks 3, 7, 8; panel layout and order → Tasks 5, 8; states (not live, no flight, missing) → Tasks 5, 7; accessibility labels → Tasks 5–7; guards → Task 5 on; mock → Task 3; docs → Tasks 3, 9.
- **Placeholders:** Task 8 Step 1's layout test is described against the instruments test's mocking pattern, which the implementer must read; its assertion is exact.
- **Type consistency:** `ReadBackRequest` fields (`key`, `name`, `operation`, `expected`, `failure`) are used identically in Tasks 4–7; `EntryTarget.readBackKey` feeds `key`; `RadioEntry.open` takes `EntryTargetId`.
- **Spec deltas, ruled here:** `adoption.ts` became `src/domain/panels/read-back.ts` and `useReadBack` lives in primitives because F-20 will reuse both; the spec's file plan is updated to match in Task 9's architecture doc.
