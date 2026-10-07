# F-32 CDU Remote for the Default X-Plane FMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CDU panel that mirrors X-Plane's default FMS screen (24 × 14–16 cells with colour, font size, reverse video, underline and flashing) and sends CDU key presses in order through one queue, for CDU 1 or CDU 2.

**Architecture:**
- **Domain** (`src/domain/cdu/`): pure modules for the names and key catalogue, screen decoding, the serial key queue, messages and the web key map.
- **Profile 1.6.0** adds four features (`cdu1-screen`, `cdu1-keys`, `cdu2-screen`, `cdu2-keys`).
- **Panel** (`src/features/panels/cdu/`): `useCduScreen` decodes telemetry into rows and a screen state; `CduScreen` draws fixed-width cells in memoised rows; `useCduKeys` owns the queue, messages and the slow-link annunciator; `CduPanel` lays out the bezel, line-select keys and key blocks with R-01 primitives.
- **Framework touches:** `PanelActions.activate` resolves to an `ActivationResult`; `ControlButton` gains `repeatable`; `LightBar` gains a `lit` state; the theme gains a `cdu` palette.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict, Jest with RNTL 14 (`render`, `rerender` and `fireEvent` are awaited), zod v4.

**Spec:** `docs/superpowers/specs/2026-10-06-default-fms-cdu-design.md`

## Global Constraints

- Gate before every commit: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npx jest`, all passing.
- Every commit message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never launch Xcode, Android Studio, simulators, emulators, `expo start` or EAS builds.
- Never render, log or serialise a token, pairing code, URL, HTTP status, exception text, DataRef or command id or name, or protocol payload on any screen or message (R12).
- **C1** The screen shows only what X-Plane sent. No key press changes a cell locally (no echo).
- **C2** One press is one activation, in press order. Presses are never coalesced; a held key never repeats.
- **C3** Every pressable is at least 48 dp both ways (`theme.touch.minTarget`).
- **C4** Every night colour has relative luminance ≤ 0.30; every `cdu` colour reaches 4.5:1 on `cdu.glass` in every theme.
- **C5** When values are not current, the screen dims to 50 % with a `NOT LIVE` tag and every key is disabled; the queue is emptied, nothing is sent on reconnect.
- **R-01 design language:** `AvionicsUnit`, `ControlButton` (with `annunciation`, `selected`, `children`, `style`), `avionicsText()`, `numeric()`, `typography.fonts.mono`; build no new look beyond what this plan names.
- `@/` imports; `makeStyles(theme)` with `useThemedStyles`; zod v4 for the new preference schema.

## Review Focus

1. **The same key twice, quickly** (`LL`, `77`): two activations are sent. A key whose previous press is still in flight stays pressable (`repeatable`). Tests in Task 3 (ControlButton) and Task 6 (panel).
2. **A multi-byte glyph** (`°`, `☐`) keeps every later character in its column, and the style byte for cell `i` applies to the `i`-th glyph, not the `i`-th byte. Test in Task 2.
3. **Aircraft change** from a live default 737 to an aircraft whose CDU is blank shows the No FMS state, never the 737's last screen. Test in Task 5.
4. **The link drops with keys queued:** the queue empties, nothing is sent later, no failure message names the dropped keys. Test in Task 4.
5. **A style line shorter than 24 bytes, missing or undecodable:** the remaining cells are large white; nothing throws. Test in Task 2.

---

### Task 1: CDU names, key catalogue, profile 1.6.0 and the mock toy FMS

**Files:**
- Create: `src/domain/cdu/keys.ts`
- Modify: `src/domain/aircraft/profiles/generic.ts`
- Modify: `tests/mock-xplane/mock-xplane-server.ts`
- Modify: every test pinning `'1.5.0'` (`grep -rln "1\.5\.0" tests src`)
- Test: `tests/unit/domain/cdu-keys.test.ts`, `tests/unit/domain/aircraft-profile.test.ts`, `tests/integration/mock-xplane-server.test.ts`

**Interfaces produced:**

```ts
// src/domain/cdu/keys.ts
export type CduUnit = 1 | 2;
export interface CduKey {
  /** The command suffix after `sim/FMS/` or `sim/FMS2/`. */
  id: string;
  /** Printed on the key; `\n` breaks a two-word legend. Empty for line-select keys. */
  legend: string;
  /** Short name used in messages: "K", "EXEC", "DEP ARR", "LSK 1L". */
  name: string;
  /** Screen-reader label. */
  spoken: string;
}
export const LSK_LEFT: readonly CduKey[];   // ls_1l..ls_6l
export const LSK_RIGHT: readonly CduKey[];  // ls_1r..ls_6r
export const FUNCTION_ROWS: readonly (readonly CduKey[])[]; // 5, 6, 5 keys
export const ALPHA_ROWS: readonly (readonly CduKey[])[];    // 6 rows of 5
export const NUMERIC_ROWS: readonly (readonly CduKey[])[];  // 4 rows of 3
export const CDU_KEYS: readonly CduKey[];   // all 70, each id once
export function cduKey(id: string): CduKey | undefined;
export function cduCommand(unit: CduUnit, id: string): string;
export function cduTextLine(unit: CduUnit, line: number): string;
export function cduStyleLine(unit: CduUnit, line: number): string;
export function cduExecLight(unit: CduUnit): string;
export const CDU_LINE_COUNT = 16;
```

New profile exports in `generic.ts`: `FEATURE_CDU1_SCREEN = 'cdu1-screen'`, `FEATURE_CDU1_KEYS = 'cdu1-keys'`, `FEATURE_CDU2_SCREEN = 'cdu2-screen'`, `FEATURE_CDU2_KEYS = 'cdu2-keys'`, and `cduScreenFeatureId(unit: CduUnit): string`, `cduKeysFeatureId(unit: CduUnit): string`.

- [ ] **Step 1: Write the failing key-catalogue test** `tests/unit/domain/cdu-keys.test.ts`:

```ts
import {
  ALPHA_ROWS,
  CDU_KEYS,
  FUNCTION_ROWS,
  LSK_LEFT,
  LSK_RIGHT,
  NUMERIC_ROWS,
  cduCommand,
  cduExecLight,
  cduKey,
  cduStyleLine,
  cduTextLine,
} from '@/domain/cdu/keys';

// Laminar's Commands.txt, sim/FMS/ section, minus CDU_popup and CDU_popout.
const LAMINAR_IDS = [
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`ls_${n}l`, `ls_${n}r`]),
  'index', 'fpln', 'clb', 'crz', 'des', 'dir_intc', 'legs', 'dep_arr', 'hold', 'prog', 'exec',
  'fix', 'navrad', 'prev', 'next',
  ...'0123456789'.split('').map((d) => `key_${d}`),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `key_${l}`),
  'key_period', 'key_minus', 'key_slash', 'key_back', 'key_space', 'key_delete', 'key_clear',
];

describe('CDU key catalogue', () => {
  it('has exactly the 70 Laminar key commands, each once', () => {
    const ids = CDU_KEYS.map((key) => key.id);
    expect(new Set(ids).size).toBe(70);
    expect([...ids].sort()).toEqual([...LAMINAR_IDS].sort());
  });

  it('lays the keys out like a Boeing CDU', () => {
    expect(LSK_LEFT.map((k) => k.name)).toEqual(['LSK 1L', 'LSK 2L', 'LSK 3L', 'LSK 4L', 'LSK 5L', 'LSK 6L']);
    expect(LSK_RIGHT.map((k) => k.id)).toEqual(['ls_1r', 'ls_2r', 'ls_3r', 'ls_4r', 'ls_5r', 'ls_6r']);
    expect(FUNCTION_ROWS.map((row) => row.map((k) => k.name))).toEqual([
      ['INDEX', 'FPLN', 'CLB', 'CRZ', 'DES'],
      ['DIR INTC', 'LEGS', 'DEP ARR', 'HOLD', 'PROG', 'EXEC'],
      ['NAV RAD', 'FIX', 'PREV PAGE', 'NEXT PAGE', 'BACK'],
    ]);
    expect(ALPHA_ROWS.map((row) => row.map((k) => k.legend))).toEqual([
      ['A', 'B', 'C', 'D', 'E'],
      ['F', 'G', 'H', 'I', 'J'],
      ['K', 'L', 'M', 'N', 'O'],
      ['P', 'Q', 'R', 'S', 'T'],
      ['U', 'V', 'W', 'X', 'Y'],
      ['Z', 'SP', 'DEL', '/', 'CLR'],
    ]);
    expect(NUMERIC_ROWS.map((row) => row.map((k) => k.legend))).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['.', '0', '+/−'],
    ]);
    expect(cduKey('key_minus')?.name).toBe('+/−');
    expect(cduKey('dep_arr')?.legend).toBe('DEP\nARR');
    expect(cduKey('ls_3l')?.spoken).toBe('Line select left 3');
  });

  it('builds the verified X-Plane names', () => {
    expect(cduCommand(1, 'exec')).toBe('sim/FMS/exec');
    expect(cduCommand(2, 'key_A')).toBe('sim/FMS2/key_A');
    expect(cduTextLine(1, 0)).toBe('sim/cockpit2/radios/indicators/fms_cdu1_text_line0');
    expect(cduStyleLine(2, 15)).toBe('sim/cockpit2/radios/indicators/fms_cdu2_style_line15');
    expect(cduExecLight(1)).toBe('sim/cockpit2/radios/indicators/fms_exec_light_pilot');
    expect(cduExecLight(2)).toBe('sim/cockpit2/radios/indicators/fms_exec_light_copilot');
  });
});
```

- [ ] **Step 2: Run it:** `npx jest tests/unit/domain/cdu-keys.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/domain/cdu/keys.ts`:**

```ts
/**
 * The default X-Plane FMS's CDU (F-32): its DataRef and command names, verified against
 * Laminar's DataRefs.txt and Commands.txt, and its keys in a Boeing-style arrangement.
 */
export type CduUnit = 1 | 2;

export interface CduKey {
  /** The command suffix after `sim/FMS/` or `sim/FMS2/`. */
  id: string;
  /** Printed on the key; `\n` breaks a two-word legend. Empty for line-select keys. */
  legend: string;
  /** Short name used in messages: "K", "EXEC", "DEP ARR", "LSK 1L". */
  name: string;
  /** Screen-reader label. */
  spoken: string;
}

export const CDU_LINE_COUNT = 16;

const INDICATORS = 'sim/cockpit2/radios/indicators';

function key(id: string, legend: string, spoken: string, name = legend.replace('\n', ' ')): CduKey {
  return { id, legend, name, spoken };
}

function lineSelect(side: 'l' | 'r'): CduKey[] {
  const word = side === 'l' ? 'left' : 'right';
  return [1, 2, 3, 4, 5, 6].map((row) =>
    key(`ls_${row}${side}`, '', `Line select ${word} ${row}`, `LSK ${row}${side.toUpperCase()}`),
  );
}

export const LSK_LEFT: readonly CduKey[] = lineSelect('l');
export const LSK_RIGHT: readonly CduKey[] = lineSelect('r');

export const FUNCTION_ROWS: readonly (readonly CduKey[])[] = [
  [
    key('index', 'INDEX', 'Index'),
    key('fpln', 'FPLN', 'Flight plan'),
    key('clb', 'CLB', 'Climb'),
    key('crz', 'CRZ', 'Cruise'),
    key('des', 'DES', 'Descent'),
  ],
  [
    key('dir_intc', 'DIR\nINTC', 'Direct intercept'),
    key('legs', 'LEGS', 'Legs'),
    key('dep_arr', 'DEP\nARR', 'Departure arrival'),
    key('hold', 'HOLD', 'Hold'),
    key('prog', 'PROG', 'Progress'),
    key('exec', 'EXEC', 'Execute'),
  ],
  [
    key('navrad', 'NAV\nRAD', 'Nav radio'),
    key('fix', 'FIX', 'Fix'),
    key('prev', 'PREV\nPAGE', 'Previous page'),
    key('next', 'NEXT\nPAGE', 'Next page'),
    key('key_back', 'BACK', 'Back'),
  ],
];

const letter = (l: string) => key(`key_${l}`, l, l);

export const ALPHA_ROWS: readonly (readonly CduKey[])[] = [
  ...['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', 'UVWXY'].map((row) => row.split('').map(letter)),
  [
    letter('Z'),
    key('key_space', 'SP', 'Space'),
    key('key_delete', 'DEL', 'Delete'),
    key('key_slash', '/', 'Slash'),
    key('key_clear', 'CLR', 'Clear'),
  ],
];

const digit = (d: string) => key(`key_${d}`, d, d);

export const NUMERIC_ROWS: readonly (readonly CduKey[])[] = [
  ['1', '2', '3'].map(digit),
  ['4', '5', '6'].map(digit),
  ['7', '8', '9'].map(digit),
  [key('key_period', '.', 'Point'), digit('0'), key('key_minus', '+/−', 'Plus minus')],
];

export const CDU_KEYS: readonly CduKey[] = [
  ...LSK_LEFT,
  ...LSK_RIGHT,
  ...FUNCTION_ROWS.flat(),
  ...ALPHA_ROWS.flat(),
  ...NUMERIC_ROWS.flat(),
];

const BY_ID = new Map(CDU_KEYS.map((entry) => [entry.id, entry]));

export function cduKey(id: string): CduKey | undefined {
  return BY_ID.get(id);
}

export function cduCommand(unit: CduUnit, id: string): string {
  return `sim/${unit === 1 ? 'FMS' : 'FMS2'}/${id}`;
}

export function cduTextLine(unit: CduUnit, line: number): string {
  return `${INDICATORS}/fms_cdu${unit}_text_line${line}`;
}

export function cduStyleLine(unit: CduUnit, line: number): string {
  return `${INDICATORS}/fms_cdu${unit}_style_line${line}`;
}

export function cduExecLight(unit: CduUnit): string {
  return `${INDICATORS}/fms_exec_light_${unit === 1 ? 'pilot' : 'copilot'}`;
}
```

- [ ] **Step 4: Run the test:** PASS.

- [ ] **Step 5: Failing profile tests.** In `tests/unit/domain/aircraft-profile.test.ts` add a `describe('CDU features (F-32)')`:
  - the version is `'1.6.0'`;
  - for unit 1 and 2, `cdu{n}-screen` has 32 bindings: the 16 `cduTextLine(n, k)` with `required: true` and the 16 `cduStyleLine(n, k)` with `required: false`, all `kind: 'dataref'`, none `write`;
  - `cdu{n}-keys` has 71 bindings: `cduExecLight(n)` (`dataref`, `required: false`) and the 70 `cduCommand(n, key.id)` for every `CDU_KEYS` entry (`command`, `required: false`);
  - labels are `CDU 1 screen`, `CDU 1 keys`, `CDU 2 screen`, `CDU 2 keys`;
  - `cduScreenFeatureId(2)` is `'cdu2-screen'` and `cduKeysFeatureId(1)` is `'cdu1-keys'`.

- [ ] **Step 6: Implement in `generic.ts`** (bump `version` to `'1.6.0'`; update every test pinning `1.5.0`):

```ts
import { CDU_KEYS, CDU_LINE_COUNT, cduCommand, cduExecLight, cduStyleLine, cduTextLine, type CduUnit } from '@/domain/cdu/keys';

export const FEATURE_CDU1_SCREEN = 'cdu1-screen';
export const FEATURE_CDU1_KEYS = 'cdu1-keys';
export const FEATURE_CDU2_SCREEN = 'cdu2-screen';
export const FEATURE_CDU2_KEYS = 'cdu2-keys';

export function cduScreenFeatureId(unit: CduUnit): string {
  return unit === 1 ? FEATURE_CDU1_SCREEN : FEATURE_CDU2_SCREEN;
}

export function cduKeysFeatureId(unit: CduUnit): string {
  return unit === 1 ? FEATURE_CDU1_KEYS : FEATURE_CDU2_KEYS;
}

const LINES = Array.from({ length: CDU_LINE_COUNT }, (_, line) => line);

function cduScreenFeature(unit: CduUnit): FeatureSpec {
  return {
    id: cduScreenFeatureId(unit),
    label: `CDU ${unit} screen`,
    bindings: [
      ...LINES.map((line) => ({
        kind: 'dataref' as const,
        name: cduTextLine(unit, line),
        required: true,
        purpose: `CDU ${unit} screen, line ${line + 1}`,
      })),
      ...LINES.map((line) => ({
        kind: 'dataref' as const,
        name: cduStyleLine(unit, line),
        required: false,
        purpose: `CDU ${unit} colours and fonts, line ${line + 1}`,
      })),
    ],
  };
}

function cduKeysFeature(unit: CduUnit): FeatureSpec {
  return {
    id: cduKeysFeatureId(unit),
    label: `CDU ${unit} keys`,
    bindings: [
      { kind: 'dataref', name: cduExecLight(unit), required: false, purpose: `CDU ${unit} EXEC light` },
      ...CDU_KEYS.map((entry) => ({
        kind: 'command' as const,
        name: cduCommand(unit, entry.id),
        required: false,
        purpose: `CDU ${unit} ${entry.name} key`,
      })),
    ],
  };
}
```

Append `cduScreenFeature(1), cduKeysFeature(1), cduScreenFeature(2), cduKeysFeature(2)` to `GENERIC_PROFILE.features`. Import `FeatureSpec` from `@/domain/aircraft/profile` if the file does not already.

- [ ] **Step 7: Mock toy FMS.** In `tests/mock-xplane/mock-xplane-server.ts`:
  - Add 66 DataRefs with the next free ids after the highest existing one (1094): for unit 1 and 2, the 16 text lines (`valueType: 'data'`) and 16 style lines (`valueType: 'data'`), then the two EXEC lights (`valueType: 'int'`, value 0). Generate them with a loop rather than 66 literals.
  - Add 140 commands with the next free ids after 2023: `cduCommand(unit, key.id)` for every `CDU_KEYS` entry, description `CDU <unit> <name> key.` Generate them with a loop. Import from `@/domain/cdu/keys` (the mock already imports app modules; if it does not, copy the id list into the mock with a comment naming the source).
  - Encoding helpers (Node `Buffer` is fine in the mock):

```ts
/** A CDU text line as X-Plane sends it: UTF-8, NUL-padded to the DataRef's 96 bytes, base64. */
function cduText(text: string): string {
  const bytes = Buffer.alloc(96);
  Buffer.from(text, 'utf8').copy(bytes, 0, 0, 96);
  return bytes.toString('base64');
}

/** One style byte per glyph (24), base64. */
function cduStyle(styles: readonly number[]): string {
  const bytes = Buffer.alloc(24);
  styles.slice(0, 24).forEach((value, index) => bytes.writeUInt8(value & 0xff, index));
  return bytes.toString('base64');
}

const LARGE = 0x80;
const WHITE = 7;
const CYAN = 1;
const AMBER = 6;
```

  - Toy screen state, per unit: `title` (`'        TOY FMS'` for unit 1, `'       TOY FMS 2'` for unit 2), `origin` (initially `'☐☐☐☐'`), `scratchpad` (`''`). Render into the DataRefs with a `renderCdu(unit)` method:
    - line 0: title, style `LARGE | WHITE` for every cell;
    - line 1: `' ORIGIN'`, style `WHITE` (small) for every cell;
    - line 2: the origin, style `LARGE | AMBER` while it is boxes, `LARGE | WHITE` once entered;
    - line 13: the scratchpad, style `LARGE | CYAN`;
    - every other line: `''`, style all 0.
  - In `applyCommand`, handle `^sim/(FMS|FMS2)/(.+)$` (unit 1 for `FMS`, 2 for `FMS2`):
    - `key_[A-Z0-9]` appends the character; `key_period` `.`, `key_minus` `-`, `key_slash` `/`, `key_space` space; the scratchpad never exceeds 24 characters;
    - `key_clear` empties the scratchpad; `key_back` removes its last character; `key_delete` sets it to `DELETE`;
    - `ls_1l` moves a non-empty scratchpad into `origin`, empties the scratchpad and sets the unit's EXEC light to 1;
    - `exec` sets the unit's EXEC light to 0;
    - then `renderCdu(unit)`.
  - In `tests/integration/mock-xplane-server.test.ts`, add: activating `sim/FMS/key_K`, `key_L`, `key_A`, `key_X` then reading `fms_cdu1_text_line13` decodes (base64 → UTF-8, NULs stripped) to `KLAX`; `ls_1l` moves it to line 2 and sets `fms_exec_light_pilot` to 1; `exec` sets it to 0; `sim/FMS2/key_A` changes only CDU 2's line 13.

- [ ] **Step 8: Gate and commit:** `feat(cdu): verified CDU names, key catalogue, profile 1.6.0 and a toy FMS in the mock`.

---

### Task 2: Screen decoding

**Files:**
- Modify: `src/domain/simulator/dataref-string.ts` (export `decodeDataRefBytes` and `decodeUtf8Bytes`)
- Create: `src/domain/cdu/screen.ts`
- Create: `tests/helpers/cdu.ts` (the `text()` and `style()` base64 builders below, exported, for Tasks 2, 5 and 6)
- Test: `tests/unit/domain/cdu-screen.test.ts`, `tests/unit/domain/dataref-string.test.ts` (add cases)

**Interfaces produced:**

```ts
// dataref-string.ts
export function decodeDataRefBytes(value: DataRefValue | undefined): Uint8Array | null;
export function decodeUtf8Bytes(bytes: Uint8Array): string; // the existing decodeUtf8, exported

// src/domain/cdu/screen.ts
export const CDU_COLUMNS = 24;
export const CDU_BASE_ROWS = 14;
export const SCRATCHPAD_ROW = 13;
export const DEFAULT_STYLE = 0x87;
export type CduColour = 'white' | 'cyan' | 'red' | 'yellow' | 'green' | 'magenta' | 'amber';
export interface CduCellStyle { colour: CduColour; large: boolean; reverse: boolean; flash: boolean; underline: boolean }
export interface CduCell extends CduCellStyle { char: string }
export function decodeStyleByte(byte: number): CduCellStyle;
export function decodeTextLine(value: DataRefValue | undefined): string[] | null;
export function decodeStyleLine(value: DataRefValue | undefined): number[];
export function cduCells(text: readonly string[], style: readonly number[]): CduCell[];
export function isBlankLine(text: readonly string[]): boolean;
export function spokenLine(text: readonly string[]): string;
```

- [ ] **Step 1: Failing tests** `tests/unit/domain/cdu-screen.test.ts`. Build inputs with Node's `Buffer`. Put `text` and `style` in `tests/helpers/cdu.ts` and import them (shown inline here for reading):

```ts
import {
  CDU_COLUMNS,
  DEFAULT_STYLE,
  cduCells,
  decodeStyleByte,
  decodeStyleLine,
  decodeTextLine,
  isBlankLine,
  spokenLine,
} from '@/domain/cdu/screen';

const text = (s: string, size = 96) => {
  const bytes = Buffer.alloc(size);
  Buffer.from(s, 'utf8').copy(bytes);
  return bytes.toString('base64');
};
const style = (bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('decodeTextLine', () => {
  it('decodes UTF-8, drops trailing NULs and pads to 24 cells', () => {
    const cells = decodeTextLine(text(' ORIGIN'));
    expect(cells).toHaveLength(CDU_COLUMNS);
    expect(cells?.join('')).toBe(' ORIGIN'.padEnd(24, ' '));
  });

  it('keeps one cell per glyph for multi-byte characters', () => {
    const cells = decodeTextLine(text('☐☐☐☐ 270°/15'));
    expect(cells?.slice(0, 12)).toEqual(['☐', '☐', '☐', '☐', ' ', '2', '7', '0', '°', '/', '1', '5']);
  });

  it('cuts at 24 cells and turns interior NULs into spaces', () => {
    expect(decodeTextLine(text('ABCDEFGHIJKLMNOPQRSTUVWXYZ'))?.join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWX');
    const withNul = Buffer.from([0x41, 0x00, 0x42]).toString('base64');
    expect(decodeTextLine(withNul)?.slice(0, 3)).toEqual(['A', ' ', 'B']);
  });

  it('returns null for a missing or undecodable value, never raw base64', () => {
    expect(decodeTextLine(undefined)).toBeNull();
    expect(decodeTextLine(42)).toBeNull();
    expect(decodeTextLine('not base64!')).toBeNull();
  });

  it('reads an empty line as 24 spaces', () => {
    expect(decodeTextLine(text(''))?.join('')).toBe(' '.repeat(24));
  });
});

describe('style decoding', () => {
  it('decodes the bits Laminar documents', () => {
    expect(decodeStyleByte(0x80 | 0x40 | 0x20 | 0x10 | 4)).toEqual({
      colour: 'green', large: true, reverse: true, flash: true, underline: true,
    });
    expect(decodeStyleByte(1).colour).toBe('cyan');
    expect(decodeStyleByte(2).colour).toBe('red');
    expect(decodeStyleByte(3).colour).toBe('yellow');
    expect(decodeStyleByte(5).colour).toBe('magenta');
    expect(decodeStyleByte(6).colour).toBe('amber');
    expect(decodeStyleByte(7)).toEqual({ colour: 'white', large: false, reverse: false, flash: false, underline: false });
  });

  it('renders black and unknown colours as white, and black reverse video as plain text', () => {
    expect(decodeStyleByte(0x80).colour).toBe('white');
    expect(decodeStyleByte(0x40).reverse).toBe(false);
    expect(decodeStyleByte(0x0b).colour).toBe('white');
    expect(decodeStyleByte(0x4b).reverse).toBe(true);
  });

  it('pads a short style line and defaults a missing one to large white', () => {
    expect(decodeStyleLine(style([1, 2]))).toEqual([1, 2, ...Array(22).fill(DEFAULT_STYLE)]);
    expect(decodeStyleLine(undefined)).toEqual(Array(24).fill(DEFAULT_STYLE));
    expect(decodeStyleLine('***')).toEqual(Array(24).fill(DEFAULT_STYLE));
  });

  it('keeps a style byte of 0 (it is not a terminator)', () => {
    expect(decodeStyleLine(style([0x81, 0, 0x84]))).toEqual([0x81, 0, 0x84, ...Array(21).fill(DEFAULT_STYLE)]);
  });
});

describe('cells, blank lines and speech', () => {
  it('applies style i to glyph i', () => {
    const cells = cduCells(decodeTextLine(text('°A')) ?? [], [0x81, 0x84]);
    expect(cells[0]).toMatchObject({ char: '°', colour: 'cyan', large: true });
    expect(cells[1]).toMatchObject({ char: 'A', colour: 'green', large: true });
  });

  it('knows a blank line', () => {
    expect(isBlankLine(Array(24).fill(' '))).toBe(true);
    expect(isBlankLine(decodeTextLine(text('  X')) ?? [])).toBe(false);
  });

  it('speaks boxes, arrows and degrees in words', () => {
    expect(spokenLine(decodeTextLine(text('☐☐☐☐  270°')) ?? [])).toBe('box box box box 270 degrees');
    expect(spokenLine(decodeTextLine(text('<INDEX   ←→')) ?? [])).toBe('<INDEX left arrow right arrow');
  });
});
```

  In `tests/unit/domain/dataref-string.test.ts` add: `decodeDataRefBytes` returns the bytes of a base64 string including interior zeros, returns `Uint8Array.from([1, 2])` for `[1, 2]`, masks array values to 0–255, and returns `null` for a number, `undefined` and invalid base64.

- [ ] **Step 2: Run:** FAIL.

- [ ] **Step 3: Implement.** In `dataref-string.ts`, rename the private `decodeUtf8` to an exported `decodeUtf8Bytes` (keep its body; update the existing caller) and add:

```ts
/**
 * The raw bytes of a byte-array DataRef (F-32). Unlike `decodeDataRefString`, a zero byte does not
 * end the value: the CDU's style bytes use 0 as an ordinary value.
 */
export function decodeDataRefBytes(value: DataRefValue | undefined): Uint8Array | null {
  if (typeof value === 'string') {
    return decodeBase64(value);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value, (byte) => byte & 0xff);
  }
  return null;
}
```

  `src/domain/cdu/screen.ts`:

```ts
import { decodeDataRefBytes, decodeUtf8Bytes } from '@/domain/simulator/dataref-string';
import type { DataRefValue } from '@/domain/simulator/types';

/** The default FMS screen (F-32 spec §4.2–4.3): 24 columns, rows 0–13 plus two spare lines. */
export const CDU_COLUMNS = 24;
export const CDU_BASE_ROWS = 14;
export const SCRATCHPAD_ROW = 13;
/** Large white: what a cell without a readable style byte is drawn as. */
export const DEFAULT_STYLE = 0x87;

export type CduColour = 'white' | 'cyan' | 'red' | 'yellow' | 'green' | 'magenta' | 'amber';

export interface CduCellStyle {
  colour: CduColour;
  large: boolean;
  reverse: boolean;
  flash: boolean;
  underline: boolean;
}

export interface CduCell extends CduCellStyle {
  char: string;
}

// Laminar: 0 black, 1 cyan, 2 red, 3 yellow, 4 green, 5 magenta, 6 amber, 7 white.
const COLOURS: readonly (CduColour | null)[] = [null, 'cyan', 'red', 'yellow', 'green', 'magenta', 'amber', 'white'];

/**
 * Bit 7 large, 6 reverse video, 5 flashing, 4 underscore, 0–3 colour. Black and unknown colours
 * draw white: black glyphs on the black glass would be invisible. Black reverse video is plain text.
 */
export function decodeStyleByte(byte: number): CduCellStyle {
  const index = byte & 0x0f;
  const colour = COLOURS[index] ?? 'white';
  return {
    colour,
    large: (byte & 0x80) !== 0,
    reverse: (byte & 0x40) !== 0 && index !== 0,
    flash: (byte & 0x20) !== 0,
    underline: (byte & 0x10) !== 0,
  };
}

/** 24 cells of text, one glyph each, or null when the value is missing or undecodable. */
export function decodeTextLine(value: DataRefValue | undefined): string[] | null {
  const bytes = decodeDataRefBytes(value);
  if (bytes === null) {
    return null;
  }
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end -= 1;
  }
  const glyphs = Array.from(decodeUtf8Bytes(bytes.subarray(0, end)).replace(/\u0000/g, ' '));
  const cells = glyphs.slice(0, CDU_COLUMNS);
  while (cells.length < CDU_COLUMNS) {
    cells.push(' ');
  }
  return cells;
}

/** 24 style bytes; anything missing reads as DEFAULT_STYLE. */
export function decodeStyleLine(value: DataRefValue | undefined): number[] {
  const bytes = decodeDataRefBytes(value) ?? new Uint8Array(0);
  return Array.from({ length: CDU_COLUMNS }, (_, index) => bytes[index] ?? DEFAULT_STYLE);
}

export function cduCells(text: readonly string[], style: readonly number[]): CduCell[] {
  return Array.from({ length: CDU_COLUMNS }, (_, index) => ({
    char: text[index] ?? ' ',
    ...decodeStyleByte(style[index] ?? DEFAULT_STYLE),
  }));
}

export function isBlankLine(text: readonly string[]): boolean {
  return text.every((char) => char.trim() === '');
}

const SPOKEN_GLYPHS: Record<string, string> = {
  '☐': ' box ',
  '←': ' left arrow ',
  '→': ' right arrow ',
  '↑': ' up arrow ',
  '↓': ' down arrow ',
  '°': ' degrees ',
  'Δ': ' delta ',
  '⬡': ' hexagon ',
  '◀': ' left ',
  '▶': ' right ',
};

/** The line as a screen reader should say it: glyphs in words, spaces collapsed. */
export function spokenLine(text: readonly string[]): string {
  return text
    .map((char) => SPOKEN_GLYPHS[char] ?? char)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Run:** PASS.
- [ ] **Step 5: Gate and commit:** `feat(cdu): decode the CDU screen's text and style bytes`.

---

### Task 3: Framework touches — activation results, repeatable keys, the lit light bar, the CDU palette

**Files:**
- Create: `src/domain/panels/activation.ts` (`ActivationResult`; the domain never imports `@/application`, and Task 4's domain queue needs the type)
- Modify: `src/application/simulator-session.ts` (`activate` returns `ActivationResult`)
- Modify: `src/features/panels/primitives/PanelContext.tsx` (`PanelActions.activate` type)
- Modify: `src/features/panels/primitives/ControlButton.tsx` (`repeatable` prop)
- Modify: `src/features/panels/primitives/LightBar.tsx` (`lit` state)
- Modify: `src/theme/tokens.ts` (`CduColors`, `Theme.cdu`)
- Modify: every test double of `activate` (`grep -rn "activate: jest.fn\|activate: async" tests`) to resolve `'ok' as const`
- Test: `tests/unit/application/simulator-session*.test.ts` (find the file covering `activate` with `grep -rln "activate(" tests/unit tests/integration`), `tests/ui/panel-primitives.test.tsx`, `tests/unit/theme/tokens.test.ts`

**Interfaces produced:**

```ts
// src/domain/panels/activation.ts
/** How a command activation ended: sent and acknowledged, sent and failed, or never sent. */
export type ActivationResult = 'ok' | 'failed' | 'refused';

// PanelContext.tsx
activate: (featureId: string, name: string, durationSec?: number) => Promise<ActivationResult>;

// ControlButton
/** Presses queue in the panel (CDU keys): the target's pending outcome does not disable the key. */
repeatable?: boolean;

// LightBar
export type LightBarState = 'engaged' | 'armed' | 'lit' | 'off';

// tokens.ts
export interface CduColors {
  glass: string; screenEdge: string;
  white: string; cyan: string; red: string; yellow: string; green: string; magenta: string; amber: string;
}
// Theme gains `cdu: CduColors`
```

- [ ] **Step 1: Failing tests.**
  - Session: `activate` resolves `'refused'` when not connected and when the binding is missing; `'ok'` after a successful activation; `'failed'` when the client's `activateCommand` rejects. It still never rejects, and the recorded outcomes are unchanged.
  - `panel-primitives.test.tsx`:
    - a `ControlButton` whose target outcome is `pending` is disabled (existing behaviour) but, with `repeatable`, stays enabled and calls `onPress` on a second press;
    - `annunciation="lit"` renders `light-bar-lit`; with a stale link (`valuesCurrent: false`) the lit bar takes the dimmed style the engaged one takes (assert the same way the existing engaged-dim test does).
  - `tokens.test.ts`:
    - every theme's `cdu` colour (`white`, `cyan`, `red`, `yellow`, `green`, `magenta`, `amber`) reaches ≥ 4.5:1 against that theme's `cdu.glass`;
    - every `nightTheme.cdu` value has relative luminance ≤ 0.30.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement.**
  - `activate`: return `'refused'` where it calls `this.refuse(...)`, `'ok'` after the success `recordOutcome`, `'failed'` in the `catch`. Keep the doc comment and add: "Resolves to how it ended so a caller that sequences presses (the CDU queue) need not read the store."
  - `PanelActions.activate` gets the new return type. AppShell already passes the session method; check that it type-checks. Update every test double to `jest.fn(async () => 'ok' as const)` (or `async () => 'ok' as const`).
  - `ControlButton`: `const pending = outcome?.status === 'pending' && props.repeatable !== true;` and document the prop as in the interface block.
  - `LightBar`: add `lit: { backgroundColor: theme.avionics.legend }` and `litDim: { backgroundColor: theme.avionics.legendDim }`; the dimmed map gains `lit: styles.litDim`. Doc: "`lit` is a plain lamp (the CDU's EXEC light): filled in the legend white, not a mode colour."
  - `tokens.ts`: add `CduColors`, and these palettes (values checked: day ≥ 5.4:1 on `#05080b`; night 4.7–7.0:1 on `#000000`, all ≤ 0.30):

```ts
/** F-32: the default FMS screen's eight colours on its glass. Shared by light and dark. */
const dayCdu: CduColors = {
  glass: '#05080b',
  screenEdge: '#2b3138',
  white: '#f2f2f2',
  cyan: '#40d0ff',
  red: '#ff4d4d',
  yellow: '#ffe14d',
  green: '#36d35a',
  magenta: '#e040c0',
  amber: '#ffb000',
};

/** Night CDU: every colour between relative luminance 0.175 (4.5:1 on black) and 0.30. */
const nightCdu: CduColors = {
  glass: '#000000',
  screenEdge: '#2a2117',
  white: '#9a9488',
  cyan: '#5e9aa8',
  red: '#d8483e',
  yellow: '#a0924e',
  green: '#5a9a48',
  magenta: '#b8579f',
  amber: '#b58440',
};
```

  `lightTheme.cdu = dayCdu`, `darkTheme.cdu = dayCdu`, `nightTheme.cdu = nightCdu`. If another test builds a `Theme` literal, add `cdu` there too.
- [ ] **Step 4: Run:** PASS.
- [ ] **Step 5: Gate and commit:** `feat(panels): activation results, repeatable keys, a lit lamp and the CDU palette`.

---

### Task 4: The key queue, messages and the web key map

**Files:**
- Create: `src/domain/cdu/key-queue.ts`
- Create: `src/domain/cdu/messages.ts`
- Create: `src/domain/cdu/hardware-keys.ts`
- Create: `src/features/panels/cdu/useCduKeys.ts`
- Test: `tests/unit/domain/cdu-key-queue.test.ts`, `tests/unit/domain/cdu-messages.test.ts`, `tests/ui/cdu-keys-hook.test.tsx`

**Interfaces:**
- **Consumes:** `ActivationResult` (Task 3), `cduKey`, `cduCommand`, `CduUnit` (Task 1), `cduKeysFeatureId` (Task 1), `usePanel`.
- **Produces:**

```ts
// key-queue.ts
export const CDU_QUEUE_LIMIT = 24;
export const SLOW_KEY_MS = 500;
export type CduQueueEvent =
  | { kind: 'sent'; key: string; elapsedMs: number }
  | { kind: 'failed'; key: string; result: 'failed' | 'refused'; dropped: number }
  | { kind: 'full' };
export class CduKeyQueue {
  constructor(send: (key: string) => Promise<ActivationResult>, now: () => number, onEvent: (event: CduQueueEvent) => void);
  press(key: string): boolean;
  clear(): void;
  get size(): number;
}

// messages.ts
export const QUEUE_FULL_MESSAGE = 'Too many keys waiting. Let the screen catch up.';
export function keyFailedMessage(name: string, result: 'failed' | 'refused', dropped: number): string;
export function missingKeysMessage(count: number): string | null;

// hardware-keys.ts
export interface HardwareKeyEvent { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }
export function hardwareKeyToCdu(event: HardwareKeyEvent): string | null;

// useCduKeys.ts
export const MESSAGE_MS = 8000;
export const SLOW_SHOWN_MS = 5000;
export function useCduKeys(unit: CduUnit): { press: (keyId: string) => void; message: string | null; slow: boolean };
```

- [ ] **Step 1: Failing queue tests** `tests/unit/domain/cdu-key-queue.test.ts`:

```ts
import { CDU_QUEUE_LIMIT, CduKeyQueue, type CduQueueEvent } from '@/domain/cdu/key-queue';
import type { ActivationResult } from '@/domain/panels/activation';

function deferred() {
  let resolve!: (result: ActivationResult) => void;
  const promise = new Promise<ActivationResult>((r) => (resolve = r));
  return { promise, resolve };
}

function harness() {
  const sent: string[] = [];
  const pending: ReturnType<typeof deferred>[] = [];
  const events: CduQueueEvent[] = [];
  let clock = 0;
  const queue = new CduKeyQueue(
    (key) => {
      sent.push(key);
      const d = deferred();
      pending.push(d);
      return d.promise;
    },
    () => clock,
    (event) => events.push(event),
  );
  const settle = async (result: ActivationResult, after = 10) => {
    clock += after;
    pending.shift()?.resolve(result);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { queue, sent, events, settle };
}

describe('CduKeyQueue', () => {
  it('sends one key at a time, in press order, each once', async () => {
    const h = harness();
    ['key_K', 'key_L', 'key_A', 'key_X'].forEach((key) => h.queue.press(key));
    expect(h.sent).toEqual(['key_K']);
    await h.settle('ok');
    expect(h.sent).toEqual(['key_K', 'key_L']);
    await h.settle('ok');
    await h.settle('ok');
    await h.settle('ok');
    expect(h.sent).toEqual(['key_K', 'key_L', 'key_A', 'key_X']);
    expect(h.queue.size).toBe(0);
  });

  it('sends the same key twice when pressed twice', async () => {
    const h = harness();
    h.queue.press('key_L');
    h.queue.press('key_L');
    await h.settle('ok');
    await h.settle('ok');
    expect(h.sent).toEqual(['key_L', 'key_L']);
  });

  it('reports how long each key took', async () => {
    const h = harness();
    h.queue.press('exec');
    await h.settle('ok', 640);
    expect(h.events).toEqual([{ kind: 'sent', key: 'exec', elapsedMs: 640 }]);
  });

  it('drops the keys behind a failed one and says how many', async () => {
    const h = harness();
    ['key_K', 'key_L', 'key_A', 'key_X'].forEach((key) => h.queue.press(key));
    await h.settle('failed');
    expect(h.sent).toEqual(['key_K']);
    expect(h.events).toEqual([{ kind: 'failed', key: 'key_K', result: 'failed', dropped: 3 }]);
    expect(h.queue.size).toBe(0);
  });

  it('refuses a press beyond the limit', () => {
    const h = harness();
    for (let i = 0; i < CDU_QUEUE_LIMIT; i += 1) {
      expect(h.queue.press('key_A')).toBe(true);
    }
    expect(h.queue.press('key_B')).toBe(false);
    expect(h.events).toEqual([{ kind: 'full' }]);
  });

  it('clear() drops waiting keys and silences the key in flight', async () => {
    const h = harness();
    ['key_K', 'key_L'].forEach((key) => h.queue.press(key));
    h.queue.clear();
    await h.settle('failed');
    expect(h.sent).toEqual(['key_K']);
    expect(h.events).toEqual([]);
    h.queue.press('key_Z');
    expect(h.sent).toEqual(['key_K', 'key_Z']);
  });
});
```

  `tests/unit/domain/cdu-messages.test.ts`:
  - `keyFailedMessage('K', 'failed', 3)` → `X-Plane didn't take the K key. The 3 keys after it weren't sent.`
  - `keyFailedMessage('EXEC', 'failed', 0)` → `X-Plane didn't take the EXEC key.`
  - `keyFailedMessage('LSK 1L', 'refused', 1)` → `The LSK 1L key wasn't sent. The key after it wasn't sent either.`
  - `keyFailedMessage('A', 'failed', 1)` → `X-Plane didn't take the A key. The key after it wasn't sent.`
  - `missingKeysMessage(0)` → `null`; `(1)` → `1 key isn't available on this aircraft.`; `(4)` → `4 keys aren't available on this aircraft.`
  - `hardwareKeyToCdu`: `a` and `A` → `key_A`; `7` → `key_7`; `.` → `key_period`; `-` → `key_minus`; `/` → `key_slash`; ` ` → `key_space`; `Delete` → `key_delete`; `Backspace` → `key_back`; `Escape` → `key_clear`; `PageUp` → `prev`; `PageDown` → `next`; `Enter` → `null`; `Tab` → `null`; `a` with `ctrlKey`, `altKey` or `metaKey` → `null`.

- [ ] **Step 2: Run:** FAIL.

- [ ] **Step 3: Implement the domain modules.**

```ts
// src/domain/cdu/key-queue.ts
import type { ActivationResult } from '@/domain/panels/activation';

/** One scratchpad line of keys may wait; more means the link cannot keep up (spec §4.5). */
export const CDU_QUEUE_LIMIT = 24;
/** An answer slower than this lights the SLOW annunciator (R6). */
export const SLOW_KEY_MS = 500;

export type CduQueueEvent =
  | { kind: 'sent'; key: string; elapsedMs: number }
  | { kind: 'failed'; key: string; result: 'failed' | 'refused'; dropped: number }
  | { kind: 'full' };

/**
 * Sends CDU key presses one at a time, in order (C2): "KLAX" typed quickly must never arrive as
 * "KLXA", which parallel requests could do. A failure drops the keys behind it — sending them would
 * enter a different string than the pilot typed.
 */
export class CduKeyQueue {
  private waiting: string[] = [];
  private running = false;
  private generation = 0;

  constructor(
    private readonly send: (key: string) => Promise<ActivationResult>,
    private readonly now: () => number,
    private readonly onEvent: (event: CduQueueEvent) => void,
  ) {}

  get size(): number {
    return this.waiting.length + (this.running ? 1 : 0);
  }

  press(key: string): boolean {
    if (this.size >= CDU_QUEUE_LIMIT) {
      this.onEvent({ kind: 'full' });
      return false;
    }
    this.waiting.push(key);
    if (!this.running) {
      void this.pump();
    }
    return true;
  }

  /** Link loss or a unit switch: forget what waits, and ignore the answer to what is in flight. */
  clear(): void {
    this.generation += 1;
    this.waiting = [];
    this.running = false;
  }

  private async pump(): Promise<void> {
    const generation = this.generation;
    this.running = true;
    while (this.waiting.length > 0 && generation === this.generation) {
      const key = this.waiting.shift() as string;
      const started = this.now();
      const result = await this.send(key);
      if (generation !== this.generation) {
        return;
      }
      if (result !== 'ok') {
        const dropped = this.waiting.length;
        this.waiting = [];
        this.onEvent({ kind: 'failed', key, result, dropped });
        break;
      }
      this.onEvent({ kind: 'sent', key, elapsedMs: this.now() - started });
    }
    if (generation === this.generation) {
      this.running = false;
    }
  }
}
```

  Note on `clear()` then `press()`: `clear` sets `running = false` so the next press starts a new pump under the new generation while the old one's await is ignored — the test "clear() drops waiting keys and silences the key in flight" pins this.

```ts
// src/domain/cdu/messages.ts
export const QUEUE_FULL_MESSAGE = 'Too many keys waiting. Let the screen catch up.';

export function keyFailedMessage(name: string, result: 'failed' | 'refused', dropped: number): string {
  const first = result === 'failed' ? `X-Plane didn't take the ${name} key.` : `The ${name} key wasn't sent.`;
  if (dropped === 0) {
    return first;
  }
  const either = result === 'refused' ? ' either' : '';
  const rest =
    dropped === 1 ? `The key after it wasn't sent${either}.` : `The ${dropped} keys after it weren't sent${either}.`;
  return `${first} ${rest}`;
}

export function missingKeysMessage(count: number): string | null {
  if (count === 0) {
    return null;
  }
  return count === 1
    ? "1 key isn't available on this aircraft."
    : `${count} keys aren't available on this aircraft.`;
}
```

```ts
// src/domain/cdu/hardware-keys.ts
export interface HardwareKeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const NAMED: Record<string, string> = {
  '.': 'key_period',
  '-': 'key_minus',
  '/': 'key_slash',
  ' ': 'key_space',
  Delete: 'key_delete',
  Backspace: 'key_back',
  Escape: 'key_clear',
  PageUp: 'prev',
  PageDown: 'next',
};

/**
 * A physical keyboard key as a CDU key id (web build, spec §4.8). Enter is deliberately unmapped:
 * EXEC commits a route change and stays a tap. Shortcuts (Ctrl, Alt, Meta) belong to the browser.
 */
export function hardwareKeyToCdu(event: HardwareKeyEvent): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }
  if (/^[a-zA-Z0-9]$/.test(event.key)) {
    return `key_${event.key.toUpperCase()}`;
  }
  return NAMED[event.key] ?? null;
}
```

- [ ] **Step 4: Failing hook tests** `tests/ui/cdu-keys-hook.test.tsx`. Render a probe component inside the `PanelFrame` harness the other panel tests use (copy the snapshot builder from `tests/ui/navigation-controls.test.tsx`, giving it the generic profile's compatibility with every CDU binding `ok`). Use jest fake timers. The probe renders `message` and `slow` as text and exposes `press` through buttons or a ref.
  - Pressing `key_K`, `key_L` calls `actions.activate('cdu1-keys', 'sim/FMS/key_K')` then, after the first resolves, `('cdu1-keys', 'sim/FMS/key_L')`.
  - With unit 2, the feature is `cdu2-keys` and the names start `sim/FMS2/`.
  - An activation resolving `'failed'` with two keys behind it shows `X-Plane didn't take the K key. The 2 keys after it weren't sent.`; the message disappears after `MESSAGE_MS`, and also disappears on the next `'ok'` answer.
  - An answer taking longer than `SLOW_KEY_MS` (advance fake time before resolving) makes `slow` true; it turns false `SLOW_SHOWN_MS` after the last slow answer.
  - The 25th press while the first is unanswered shows `QUEUE_FULL_MESSAGE`.
  - Re-rendering with `link.controlsEnabled` false empties the queue: a later answer to the in-flight key produces no message and nothing more is sent (Review Focus 4).
  - Re-rendering with a different `unit` empties the queue.

- [ ] **Step 5: Implement `useCduKeys`.**
  - Keep one `CduKeyQueue` in a ref, created once. Its `send` reads the latest `unit` and `activate` from refs: `send = (id) => activateRef.current(cduKeysFeatureId(unitRef.current), cduCommand(unitRef.current, id))`.
  - Events: `sent` clears the message, and when `elapsedMs > SLOW_KEY_MS` sets `slowUntil = now + SLOW_SHOWN_MS`; `failed` sets `keyFailedMessage(cduKey(key)?.name ?? key, result, dropped)`; `full` sets `QUEUE_FULL_MESSAGE`. A message expires after `MESSAGE_MS` (a timeout, cleared on change and on unmount).
  - `slow` is true while `Date.now() < slowUntil`; schedule a re-render at `slowUntil` with a timeout.
  - `useEffect` on `unit` and on `link.controlsEnabled`: when the unit changes or controls become disabled, `queue.clear()` and clear the message.
  - Unmount clears the queue.
  - `press(id)` calls `queue.press(id)`.

- [ ] **Step 6: Run:** PASS.
- [ ] **Step 7: Gate and commit:** `feat(cdu): an ordered key queue with plain messages and a slow-link lamp`.

---

### Task 5: The CDU screen

**Files:**
- Create: `src/features/panels/cdu/useCduScreen.ts`
- Create: `src/features/panels/cdu/CduScreen.tsx`
- Create: `src/features/panels/cdu/cdu-geometry.ts`
- Test: `tests/ui/cdu-screen.test.tsx`, `tests/unit/domain/cdu-geometry.test.ts`

**Interfaces:**
- **Consumes:** Task 1 names and feature ids; Task 2 decoding; `theme.cdu` (Task 3); `usePanel`; `useReducedMotion` from `@/hooks/useReducedMotion`; `typography.fonts.mono` (B612 Mono) through `numeric(theme)`.
- **Produces:**

```ts
// cdu-geometry.ts
export const LSK_COLUMN = 48;       // theme.touch.minTarget
export const MIN_ROW_HEIGHT = 24;   // two rows per 48 dp LSK
export const MONO_ADVANCE = 0.6;    // B612 Mono advance width per em (1229/2048)
export const MAX_CELL_WIDTH = 22;
export const SMALL_SCALE = 0.8;
export interface CduGeometry { cellWidth: number; fontSize: number; smallFontSize: number; rowHeight: number }
export function cduGeometry(glassWidth: number): CduGeometry;
export function lskRows(lsk: number): [number, number]; // LSK k (1–6) spans rows 2k−1 and 2k

// useCduScreen.ts
export type CduScreenState = 'unavailable' | 'waiting' | 'noFms' | 'live';
export interface CduScreenValues {
  state: CduScreenState;
  /** One entry per drawn row (14, or 16 once rows 14–15 have been used): text and style as strings. */
  rows: { text: string; style: string }[];
  execLit: boolean;
  aircraftName: string;
  stale: boolean;
}
export function useCduScreen(unit: CduUnit): CduScreenValues;

// CduScreen.tsx
export function CduScreen(props: { rows: CduScreenValues['rows']; geometry: CduGeometry; stale: boolean; testID?: string }): JSX.Element;
```

`text` is the 24 decoded glyphs joined (`cells.join('')`); `style` is the 24 style bytes as a string of `String.fromCharCode(byte)` — both primitives, so `React.memo` compares rows by value (R4).

- [ ] **Step 1: Failing geometry tests:**
  - `cduGeometry(312)`: `cellWidth` is `13`, `fontSize` ≈ `21.7` (`cellWidth / MONO_ADVANCE`, one decimal), `smallFontSize` = `fontSize * 0.8` (one decimal), `rowHeight` = `Math.max(24, Math.round(fontSize * 1.15))` = `25`.
  - A narrow glass (`cduGeometry(200)`): `cellWidth` 8.3 (floor to one decimal), `rowHeight` 24.
  - A huge glass (`cduGeometry(1000)`): `cellWidth` capped at `MAX_CELL_WIDTH`.
  - `lskRows(1)` is `[1, 2]`, `lskRows(6)` is `[11, 12]`.

- [ ] **Step 2: Implement `cdu-geometry.ts`** with `cellWidth = Math.min(MAX_CELL_WIDTH, Math.floor((glassWidth / 24) * 10) / 10)`, `fontSize = round1(cellWidth / MONO_ADVANCE)`, `smallFontSize = round1(fontSize * SMALL_SCALE)`, `rowHeight = Math.max(MIN_ROW_HEIGHT, Math.round(fontSize * 1.15))`, where `round1(x) = Math.round(x * 10) / 10`.

- [ ] **Step 3: Failing UI tests** `tests/ui/cdu-screen.test.tsx`. Render `CduScreenProbe` (a test component calling `useCduScreen(unit)` and rendering `CduScreen` with `cduGeometry(312)`, plus `state`, `execLit` and `aircraftName` as text) in the panel harness. Feed telemetry with `text()` and `style()` from `tests/helpers/cdu.ts` (Task 2). Cases:
  1. **Waiting:** connected with only 10 of 16 text lines present → `state` `waiting`.
  2. **Live:** all 16 lines with line 0 `'        TOY FMS'` → `state` `live`; `cdu-row-0` exists, and its accessibility label is `TOY FMS`; 14 rows drawn (`cdu-row-13` exists, `cdu-row-14` does not); `cdu-row-1` (blank) is hidden from accessibility.
  3. **Scratchpad speech:** line 13 `KLAX` → the label of `cdu-row-13` is `Scratchpad, KLAX`; blank → `Scratchpad empty`.
  4. **Styles:** line 2 `☐☐☐☐` with style `[0x86 ×4]` → `cdu-cell-2-0` text `☐`, colour `theme.cdu.amber`; a reverse cell (`0xc4`) has background `theme.cdu.green` and glyph colour `theme.cdu.glass`; a small cell (`0x07`) has `fontSize` `smallFontSize`; an underlined cell (`0x97`) renders `cdu-underline-<row>-<col>`; a colour-0 cell renders `theme.cdu.white`.
  5. **Missing style line** (style DataRef absent from telemetry): the row draws large white (Review Focus 5).
  6. **Flashing:** a `0xa7` cell's glyph has opacity 1, then 0 after 500 ms of fake time, then 1 again; under Reduce Motion (mock `useReducedMotion` to return true) it stays 1. With no flashing cell on screen no interval runs (`jest.getTimerCount()` is 0 after render).
  7. **Rows 14–15:** line 14 non-blank → 16 rows drawn; set line 14 blank again → still 16 rows (sticky for the session).
  8. **Row memo (R4):** wrap `CduRow` render counting — export a `__cduRowRenders` counter object from `CduScreen.tsx` incremented in the row component's body (the module comment says it exists for this test); change only line 13's value and re-render → only one row render added.
  9. **No FMS:** all 16 lines blank from the first sample → `state` `noFms`, `aircraftName` from the identity description (`Boeing 737-800`), else ICAO type, else `This aircraft`.
  10. **Live then blank:** live, then every line blank → still `live` (a powered-down CDU).
  11. **Aircraft change (Review Focus 3):** live with identity A; then identity B (different description) with all lines blank → `noFms`.
  12. **Unavailable:** compatibility marks `cdu1-screen` `unavailable` → `state` `unavailable`.
  13. **Stale:** `valuesCurrent` false → `stale` true and the screen root has opacity 0.5.
  14. **EXEC light:** `fms_exec_light_pilot` 1 → `execLit` true; unit 2 reads `fms_exec_light_copilot`.
  15. **Unit 2** reads `fms_cdu2_*` lines only.

- [ ] **Step 4: Implement `useCduScreen`.**
  - Read `snapshot.telemetry[cduTextLine(unit, k)]?.value` and the style line for k = 0..15 with `decodeTextLine` and `decodeStyleLine`.
  - `state`:
    - `unavailable` when `featureOf(snapshot.compatibility, cduScreenFeatureId(unit))` (from `@/application/compatibility`) is `null` or its `status` is `'unavailable'` (a required text line missing). `'partial'` (style lines missing) is not unavailable;
    - `waiting` when any text line of the unit decodes to `null`;
    - otherwise `live` if text has been seen since identification, else `noFms`.
  - "Seen since identification": a ref holding `{ key, seen, extraRows }` where `key` is `` `${unit}|${identity.description}|${identity.icaoType}|${identity.tailNumber}` ``; when the key changes, reset `seen` and `extraRows` to false. `seen` becomes true when any of the 16 lines is non-blank; `extraRows` becomes true when line 14 or 15 is non-blank. Update the ref during render only through a pure derivation (compute the next value from the current one and assign before returning; the assignment is idempotent for the same inputs).
  - `rows`: lines 0–13, plus 14–15 when `extraRows`. Each `{ text: cells.join(''), style: String.fromCharCode(...styleBytes) }`. A `null` text line in the waiting state draws as 24 spaces.
  - `execLit`: `firstNumber(telemetry[cduExecLight(unit)]?.value) ?? 0` is non-zero. `firstNumber` lives in `src/features/panels/instruments/useInstrumentValues.ts`; import it.
  - `aircraftName`: `identity.description ?? identity.icaoType ?? 'This aircraft'`.
  - `stale`: `!link.valuesCurrent`.

- [ ] **Step 5: Implement `CduScreen`.**
  - Root `View` (`testID` default `cdu-screen`) with `backgroundColor: theme.cdu.glass`, a 1 dp `theme.cdu.screenEdge` border, `opacity: stale ? 0.5 : 1`.
  - `CduRow = React.memo(function CduRow({ index, text, style, geometry }))`: splits `Array.from(text)` and the style string's char codes, builds `cduCells`, renders a row `View` (`testID` `cdu-row-<index>`, height `geometry.rowHeight`, `flexDirection: 'row'`). Accessibility: blank rows get `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`; others are `accessible` with `accessibilityLabel` = `spokenLine(cells)`, and row `SCRATCHPAD_ROW` reads `Scratchpad, <spoken>` or `Scratchpad empty` (the scratchpad row is never hidden).
  - Each cell: a `View` of width `geometry.cellWidth`, height `geometry.rowHeight`, centred content, `testID` `cdu-cell-<row>-<col>`; background `theme.cdu[colour]` when `reverse`; a `Text` with `numeric(theme)` font, `fontSize` large or small, `color` `reverse ? theme.cdu.glass : theme.cdu[colour]`, `includeFontPadding: false`; underline as an absolutely positioned 1.5 dp `View` at the cell bottom (`testID` `cdu-underline-<row>-<col>`) in the glyph colour. Spaces render no `Text`.
  - Flashing: `CduBlinkContext` provides `on: boolean`. `CduScreen` runs one `setInterval(500)` toggling `on` only while some row's style string has a byte with bit 5 set and Reduce Motion is off; a cell with `flash` renders a `FlashGlyph` child that reads the context (so only flashing cells re-render) and sets `opacity: on ? 1 : 0`.
  - Export `__cduRowRenders = { count: 0 }` and increment it in `CduRow`'s body; comment that it exists only so the R4 test can count row renders.

- [ ] **Step 6: Run:** PASS.
- [ ] **Step 7: Gate and commit:** `feat(cdu): mirror the CDU screen in fixed cells with colours, fonts and flashing`.

---

### Task 6: The CDU panel

**Files:**
- Create: `src/features/panels/cdu/cdu-preference.ts`
- Create: `src/features/panels/cdu/CduPreferenceProvider.tsx`
- Create: `src/features/panels/cdu/CduKeyboard.tsx`
- Create: `src/features/panels/cdu/CduPanel.tsx`
- Modify: `src/features/panels/registry.ts` (insert `CDU_PANEL` after Navigation, before Flight data)
- Modify: `src/features/shell/PanelIcon.tsx` (`case 'cdu'`)
- Modify: `src/features/shell/AppShell.tsx` (wrap with `CduPreferenceProvider storage={settingsStorage}` beside `InstrumentPreferencesProvider`)
- Modify: `tests/ui/panels.test.tsx` (registry order), `tests/ui/touch-target-guard.test.tsx` (a live-CDU snapshot case), any test pinning the panel count or order (`grep -rn "'navigation', 'flight-data'" tests`)
- Test: `tests/ui/cdu-panel.test.tsx`, `tests/unit/application/cdu-preference.test.ts`

**Interfaces:**
- **Consumes:** everything above; `AvionicsUnit`, `ControlButton`, `useWindowDimensions`, the two-column breakpoint the Navigation panel uses (`TWO_COLUMN_MIN_WIDTH`, 720).
- **Produces:**

```ts
// cdu-preference.ts
export const CDU_STORAGE_KEY = 'avionix.cdu';
export function loadCduPreference(storage: SettingsStorage): Promise<CduUnit>;   // default 1
export function saveCduPreference(storage: SettingsStorage, unit: CduUnit): Promise<void>;

// CduPreferenceProvider.tsx
export function CduPreferenceProvider(props: { storage: SettingsStorage; children: React.ReactNode }): JSX.Element;
export function useCduUnit(): [CduUnit, (unit: CduUnit) => void]; // outside a provider: local state, default 1

// CduPanel.tsx
export const CDU_PANEL: PanelDescriptor; // id 'cdu', title 'CDU', features the four CDU features, supports EVERYWHERE
export function CduPanel(): JSX.Element;
```

**Behaviour (spec §4.4–4.7, §4.9):**

- **Header row** inside the `AvionicsUnit` (label `CDU`): `CDU 1` and `CDU 2` keys (`ControlButton`, `selected` on the shown unit, `featureId` `cduScreenFeatureId(n)`, `target` `cdu-select-<n>`, `quiet`); then, right-aligned, an amber `SLOW` annunciator while `slow` (`accessibilityLabel` `Link slow`) and an amber `NOT LIVE` tag while stale.
- **Shown unit:** the preference, unless that unit's screen feature is unavailable and the other is not, in which case the other is shown without saving.
- **Glass row:** left LSK column, `CduScreen`, right LSK column. LSK `k` is a `ControlButton` (`featureId` `cduKeysFeatureId(unit)`, `target` the command name, `quiet`, `repeatable`, `accessibilityLabel` the key's `spoken`, children a 16 × 3 dp bar in `avionics.legend`) whose height is `2 * rowHeight` and whose top is `rowHeight * (2k − 1)` from the glass top (rows 1–12); wrap each column in a `View` of the glass's height with absolutely positioned keys.
- **Message line** under the glass: the hook's `message` in `BodyText`, `accessibilityLiveRegion="polite"`, `testID` `cdu-message`; under it, when any key's command is `missing`, `missingKeysMessage(count)` (`testID` `cdu-missing`).
- **Keys** (`CduKeyboard`): function rows, then the numeric and alpha blocks. Every key: `ControlButton` with `label` its legend, `accessibilityLabel` its spoken name (plus `, not available on this aircraft` when missing), `featureId` `cduKeysFeatureId(unit)`, `target` `cduCommand(unit, id)`, `quiet`, `repeatable`, `invalid` when `snapshot.compatibility.bindings[target]?.status === 'missing'`, `onPress` `() => press(id)`, `style={{ flex: 1 }}` in its row. EXEC gets `annunciation={execLit ? 'lit' : 'off'}` and `accessibilityLabel` `EXEC, light on` while lit.
- **States:**
  - `unavailable`: the bezel with `This X-Plane doesn't publish the CDU <n> screen.` and no keys.
  - `waiting`: glass with `Waiting for the CDU screen…` centred in small `theme.cdu.white` text, keys rendered but disabled (`invalid`).
  - `noFms`: no glass, no keys: `<aircraftName> isn't showing anything on X-Plane's built-in CDU.` and `Add-on FMSs such as Zibo's or ToLiss's aren't supported yet. If the aircraft is powered down, the CDU appears when it powers up.` (testID `cdu-no-fms`). The CDU 1 / CDU 2 keys stay.
  - `live`: as above. Stale disables keys through `ControlButton`'s link gate.
- **Layout:**
  - Narrow (window width < 720): the unit (header, glass row, message line) is pinned; a `ScrollView` below holds the keys (`testID` `cdu-keys-scroll`). Function rows first; then the numeric and alpha blocks side by side when the content width ≥ `8 * 48 + 7 * gap + 2 * padding` (compute from the theme), else alpha above numeric.
  - Wide (≥ 720): two columns (`cdu-wide-left` with the unit, `cdu-wide-right` with a `ScrollView` of keys); numeric and alpha side by side.
  - Glass width: the unit's inner width minus `2 * (LSK_COLUMN + gap)`; `cduGeometry(glassWidth)` gives the rest.
- **Descriptor and registry:** `CDU_PANEL` appended after `NAVIGATION_PANEL` in `PANELS`. `PanelIcon` `cdu`: a rounded screen rectangle above three short rows of small squares, in the same stroke style as the other icons.

- [ ] **Step 1: Failing tests.**
  - `cdu-preference.test.ts`: default 1; saves and loads 2; malformed JSON and `{ unit: 3 }` load 1; a throwing storage loads 1 and saving does not throw.
  - `cdu-panel.test.tsx` (panel harness, every CDU binding `ok`, the toy screen in telemetry):
    1. Pressing `K`, `L`, `A`, `X` calls `activate` with `sim/FMS/key_K` … `key_X` in order (resolve each before the next is expected).
    2. Pressing `L` twice while the first is unresolved still sends two (`repeatable`, Review Focus 1).
    3. LSK 1L sends `sim/FMS/ls_1l`; its accessibility label is `Line select left 1`; its top offset is `rowHeight` and its height `2 * rowHeight` (read the style).
    4. EXEC shows `light-bar-lit` with `fms_exec_light_pilot` 1 and `light-bar-off` with 0; its label reads `EXEC, light on` when lit.
    5. With `sim/FMS/key_Q` missing, `Q` is disabled, labelled `Q, not available on this aircraft`, and `cdu-missing` reads `1 key isn't available on this aircraft.`; `W` still sends.
    6. Stale (`valuesCurrent` false): every key disabled; `NOT LIVE` shown.
    7. A failed activation shows its message in `cdu-message`; no per-key notice text appears anywhere.
    8. `CDU 2` switches: keys send `sim/FMS2/...`, the screen reads `fms_cdu2_*`, and the preference saves 2. With the provider loading 2, the panel starts on CDU 2.
    9. `cdu2-screen` unavailable: `CDU 2` key disabled; a saved 2 shows CDU 1.
    10. No FMS: `cdu-no-fms` names the aircraft; no `K` key rendered.
    11. Unavailable and waiting states per the behaviour list.
    12. Narrow width (390): `cdu-keys-scroll` exists, the screen is outside it. Wide width (1024): `cdu-wide-left` and `cdu-wide-right` exist.
  - `panels.test.tsx`: `PANEL_IDS` equals `['instruments', 'radios', 'autopilot', 'navigation', 'cdu', 'flight-data']`.
  - `touch-target-guard.test.tsx`: add a case rendering the CDU panel with live toy telemetry in every device layout the guard sweeps, so the keys (not just the waiting state) are measured.
- [ ] **Step 2: Implement** per the behaviour list. The preference follows `src/features/haptics/haptics-preference.ts` exactly (zod `z.object({ unit: z.union([z.literal(1), z.literal(2)]) })`, best-effort, no logging). The provider follows `HapticsProvider`: load once on mount, save on change.
- [ ] **Step 3: Run:** PASS.
- [ ] **Step 4: Gate and commit:** `feat(cdu): CDU panel with line-select keys, EXEC light and CDU 1/2`.

---

### Task 7: Physical keyboard on the web, integration test and docs

**Files:**
- Create: `src/platform/hardware-keys.ts` (native no-op), `src/platform/hardware-keys.web.ts`
- Modify: `src/features/panels/cdu/CduPanel.tsx` (subscribe while mounted)
- Create: `tests/integration/cdu.test.ts`
- Create: `tests/web/cdu-hardware-keys.web.test.tsx` (the `web` Jest project matches `tests/web/**/*.web.test.tsx`)
- Create: `tests/unit/platform/hardware-keys.test.ts` (the native no-op)
- Modify: `docs/xplane.md`, `docs/architecture.md`, `README.md`, `docs/roadmap/features/F-32-default-fms-cdu.md`, `docs/roadmap/ROADMAP.md`, `docs/testing/xplane-smoke-test.md`

**Interfaces:**

```ts
// src/platform/hardware-keys.ts and .web.ts
import type { HardwareKeyEvent } from '@/domain/cdu/hardware-keys';
/** Calls `handler` for each physical key press; return true to consume it. Returns an unsubscribe. */
export function subscribeHardwareKeys(handler: (event: HardwareKeyEvent) => boolean): () => void;
```

- [ ] **Step 1: Failing tests.**
  - Web: with the CDU panel mounted, dispatching `keydown` `k` on `window` sends `sim/FMS/key_K`; `PageDown` sends `sim/FMS/next`; `Enter` sends nothing; `k` with `metaKey` sends nothing; a `keydown` while an `<input>` has focus sends nothing; a consumed key calls `preventDefault`; unmounting removes the listener (a later `keydown` sends nothing).
  - Native module: `subscribeHardwareKeys(() => true)` returns a function and never calls the handler.
  - Integration (`tests/integration/cdu.test.ts`, following `tests/integration/navigation.test.ts`): connect the real session to the mock; select the CDU demand; activate `K`, `L`, `A`, `X` through `session.activate('cdu1-keys', …)` in order (awaiting each); wait for line 13 to decode to `KLAX`; activate `ls_1l`; wait for line 2 `KLAX` and `fms_exec_light_pilot` 1; activate `exec`; wait for the light to read 0.
- [ ] **Step 2: Implement.**
  - `hardware-keys.web.ts`: add a `keydown` listener on `window`; skip when `document.activeElement` is an `input`, `textarea`, `select` or `isContentEditable`; call the handler with `{ key, ctrlKey, altKey, metaKey }`; when it returns true, `preventDefault()`. Return a function removing the listener. Guard `typeof window === 'undefined'`.
  - `hardware-keys.ts`: `return () => undefined;`, with a comment that iOS and Android expose no hardware-key API without a native module (spec §4.8).
  - `CduPanel`: `useEffect(() => subscribeHardwareKeys((event) => { const id = hardwareKeyToCdu(event); if (id === null || keyMissing(id) || !keysEnabled) return false; press(id); return true; }), [...])` — read `keysEnabled` and the missing set from refs so the subscription is made once.
- [ ] **Step 3: Docs.**
  - `docs/xplane.md`: a "CDU (F-32)" section: the text, style and EXEC-light DataRefs with types, the 70-command key list per unit, "Verified against `DataRefs.txt` / `Commands.txt`", and the decoding rules (UTF-8 per glyph, style per glyph, black/unknown → white, missing style → large white).
  - `docs/architecture.md`: the CDU panel, the key queue (why serial), `ActivationResult`, the screen states.
  - `README.md`: add the CDU panel to the panel list.
  - Roadmap file: Status `Done`, every `(unverified)` mark removed with the names corrected per spec §3 (PERF, MENU, DATA, OVFY dropped; CLB, CRZ, DES, BACK added); open questions 1, 3 and 4 answered (verified; no local echo; decoding rules), 2 and 5 pointing at the smoke rows.
  - `ROADMAP.md`: F-32's row links the spec.
  - Smoke rows 124 onward in `docs/testing/xplane-smoke-test.md`, one per check:
    - connect with the default 737 and time the connection against a build from main (the probe grew by 206 names);
    - the CDU screen against the in-sim popup: title, labels small, data large, colours, `☐` boxes, the scratchpad on the last row;
    - type an origin and destination, LSK them, EXEC: identical to the in-sim CDU, EXEC light on then off;
    - `BACK`: record what it does; `+/−`: record what it types;
    - rows 14–15: whether any page uses them;
    - CDU 2 on the default 737 / A330: populated or blank;
    - type 12 characters as fast as possible: all arrive in order; note when `SLOW` appears;
    - drop Wi-Fi: `NOT LIVE` within 2 s, keys disabled, nothing typed after reconnect;
    - load an add-on aircraft (Zibo) or the Cessna 172: the No FMS sentence names it;
    - web build with a physical keyboard: letters, PageUp/PageDown, Escape; Enter does nothing;
    - night theme: every CDU colour readable and distinct.
- [ ] **Step 4: Gate and commit:** `feat(cdu): physical keyboard on the web, integration test and docs`.
