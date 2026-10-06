# Autopilot Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Autopilot panel (F-20) that engages AP/FD/A/T, shows and toggles six modes as
off/armed/engaged, and sets heading, altitude, vertical speed and airspeed (knots or Mach) with
steppers or the keypad, every change checked against what X-Plane reports.

**Architecture:** Pure domain modules in `src/domain/autopilot/` (selectors, typed entry, modes);
profile 1.4.0 adds one feature per control; the panel in `src/features/panels/autopilot/` reuses
F-21's read-back (`useReadBack`, gaining a `matches` predicate and `pendingExpected`) and keypad
(moved to the panel primitives). The interim Heading panel is retired into it.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict, zod v4, Jest
(jest-expo projects node/expo/web), React Native Testing Library 14 (`render`, `rerender`,
`fireEvent` are awaited).

**Spec:** `docs/superpowers/specs/2026-10-06-autopilot-panel-design.md`

## Global Constraints

- Never render, log or serialise a bearer token or pairing code; no URL, HTTP status, exception
  text, DataRef id/name or protocol payload on any screen. Failures appear only through
  `FailureNotice` / `OperationNotice`; every other sentence is fixed copy from the spec.
- Nothing new is logged.
- Never write `sim/operation/override/override_autopilot` or `sim/cockpit/autopilot/autopilot_state`.
- Every pressable is a `ControlButton` (or a keypad key / Cancel with `minHeight`/`minWidth` ≥ 48).
- No `setState` inside effects (lint rule); reset state while rendering, as `useRadioEntry` does.
- The display only ever shows X-Plane's values (R3); drafts appear only in the dashed `New` box.
- Minus signs in visible values and step labels are U+2212 `−`.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gate before each commit: `npm run typecheck`, `npm run lint`,
  `npm run format:check`, and the task's tests (`npx jest <paths>`).
- Do not run Xcode, Android Studio, simulators, emulators, `expo start` or EAS.

## Review Focus

1. **Quick repeated stepper taps** — three taps of +100 before X-Plane reports back must send
   5,100, 5,200, 5,300, not 5,100 three times (Task 5 test "adds up quick taps").
2. **A selector reading outside its limits** (dial 0 kt on a cold aircraft, 60,000 ft) — a step
   back toward the range lands on the limit; a step further out is disabled (Task 2 tests
   "steps back into range from outside").
3. **Knots/Mach switching while the airspeed keypad is open** — the draft is dropped instead of a
   knots draft being sent as Mach (Task 5 test "drops an airspeed draft when the unit flips").
4. **Heading 360/0** — typing 360 sends 0, and a read-back of 359.9 or 0.2 for 0 counts as
   adopted (Task 2 tests for `selectorMatches` wrap, Task 5 "typed 360 sends 0").
5. **The plugin override while an entry is open** — Set and every stepper disabled, the notice
   shown (Task 5 test "override disables the keypad's Set").

---

### Task 1: Shared primitives — read-back predicate, pending value, generic keypad, shared width

**Files:**
- Modify: `src/domain/panels/read-back.ts`
- Modify: `src/features/panels/primitives/useReadBack.ts`
- Create: `src/features/panels/primitives/Keypad.tsx` (moved from `src/features/panels/radios/Keypad.tsx`, then delete the old file)
- Modify: `src/features/panels/radios/EntryPad.tsx` (import the moved keypad, pass `digits`)
- Modify: `src/domain/panels/device-layout.ts` (add `TWO_COLUMN_MIN_WIDTH`)
- Modify: `src/features/panels/radios/RadiosPanel.tsx` (import the constant; keep re-exporting it)
- Modify: every test importing `@/features/panels/radios/Keypad` (`grep -rn "radios/Keypad" src tests`)
- Test: `tests/unit/domain/read-back.test.ts`, `tests/ui/read-back.test.tsx`

**Interfaces:**
- Produces:
  - `ReadBackInput.matches?: (value: DataRefValue | undefined) => boolean`
  - `ReadBackRequest.matches?: (value: DataRefValue | undefined) => boolean`
  - `ReadBack.pendingExpected(key: string): number | null`
  - `Keypad({ digits: readonly number[]; onDigit; onErase; onClear; onSign?: () => void })`, `KEY_HEIGHT` from `@/features/panels/primitives/Keypad`
  - `TWO_COLUMN_MIN_WIDTH = 720` from `@/domain/panels/device-layout`

- [ ] **Step 1: Write the failing domain test** — append to `tests/unit/domain/read-back.test.ts`
  (reuse the file's existing imports and add the cases inside a new `describe`):

```ts
describe('readBackVerdict with a predicate', () => {
  const ok = { status: 'ok' as const, at: 1000 };
  it('lets a predicate decide adoption instead of half-unit equality', () => {
    const near = (value: unknown) => typeof value === 'number' && Math.abs(value - 0.78) < 0.005;
    expect(
      readBackVerdict({
        current: 0.781,
        expected: 0.78,
        matches: near,
        operation: ok,
        startedAt: 900,
        valuesCurrent: true,
        now: 1500,
      }),
    ).toBe('adopted');
    // Without the predicate 0.5 would read as 0.78 (within half a unit); with it, it does not.
    expect(
      readBackVerdict({
        current: 0.5,
        expected: 0.78,
        matches: near,
        operation: ok,
        startedAt: 900,
        valuesCurrent: true,
        now: 4100,
      }),
    ).toBe('notAdopted');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/domain/read-back.test.ts`
Expected: FAIL — TypeScript error, `matches` does not exist on `ReadBackInput`.

- [ ] **Step 3: Implement the predicate** in `src/domain/panels/read-back.ts`: add the field to
  `ReadBackInput` directly under `expected`, and use it in `readBackVerdict`:

```ts
  /**
   * Decides adoption instead of `readsAs(current, expected)`: for values where half a unit is the
   * whole range (Mach), that wrap (a heading of 0 read back as 359.9), or a change of state.
   */
  matches?: (value: DataRefValue | undefined) => boolean;
```

```ts
  const adopted =
    input.matches === undefined
      ? readsAs(input.current, input.expected)
      : input.matches(input.current);
  if (adopted) {
    return 'adopted';
  }
```

(replacing the existing `if (readsAs(input.current, input.expected)) { return 'adopted'; }`).

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest tests/unit/domain/read-back.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing hook test** — append to `tests/ui/read-back.test.tsx` a case
  that renders a probe component inside `PanelFrame` (follow the file's existing harness: it
  already renders a component that calls `useReadBack()`; extend that probe or add one) and checks
  `pendingExpected`:

```tsx
function PendingProbe() {
  const readBack = useReadBack();
  return (
    <>
      <Text testID="pending">{String(readBack.pendingExpected('alt'))}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="watch"
        onPress={() =>
          readBack.watch({
            key: 'alt',
            name: D.altitude,
            operation: D.altitude,
            expected: 5100,
            failure: () => 'not taken',
          })
        }
      />
    </>
  );
}

it('reports the value a waiting watch expects, and null once settled', async () => {
  const view = await render(probeTree(PendingProbe, liveWith({ [D.altitude]: 5000 })));
  expect(screen.getByTestId('pending').props.children).toBe('null');
  await fireEvent.press(screen.getByLabelText('watch'));
  expect(screen.getByTestId('pending').props.children).toBe('5100');
  const ok = { [D.altitude]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
  await view.rerender(
    probeTree(PendingProbe, liveWith({ [D.altitude]: 5100 }, { operations: ok }), NOW + 100),
  );
  expect(screen.getByTestId('pending').props.children).toBe('null');
});
```

`probeTree(Component, snapshot, now = NOW)` and `liveWith(values, overrides = {})` are helpers:
if the file does not already have equivalents, add them at the top of the file — `liveWith`
returns a connected, running snapshot (as `live()` in `tests/ui/radios-panel.test.tsx`) whose
telemetry is `values` received at `NOW`, and `probeTree` wraps the component in
`ThemeProvider` + `PanelFrame` exactly as that file's `tree()` does. `D.altitude` is any DataRef
name; the hook does not care which.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx jest tests/ui/read-back.test.tsx`
Expected: FAIL — `pendingExpected is not a function`.

- [ ] **Step 7: Implement in `useReadBack.ts`** — add `matches?` to `ReadBackRequest` (same doc
  comment as the domain field), pass `matches: watch.request.matches` into `readBackVerdict`, and
  add `pendingExpected` to the `ReadBack` interface and the returned object:

```ts
  /** The value a still-waiting watch expects: what the panel last sent and X-Plane has not shown. */
  pendingExpected: (key: string) => number | null;
```

```ts
    pendingExpected: (key) => {
      // `settled` holds this render's verdicts before React applies them.
      const watch = (settled ?? watches)[key];
      return watch?.kind === 'watching' ? watch.request.expected : null;
    },
```

- [ ] **Step 8: Move the keypad.** Create `src/features/panels/primitives/Keypad.tsx` from the
  radios file with these changes (styles and `KEY_HEIGHT` unchanged):

```tsx
interface Props {
  /** The digit keys in keypad order; the last is shown between Delete and Clear. */
  digits: readonly number[];
  onDigit: (digit: number) => void;
  onErase: () => void;
  onClear: () => void;
  /** A sign key (vertical speed): shown after Clear when given. */
  onSign?: () => void;
}

/** Digits in phone order, then delete, the last digit (0) and clear; a sign key when asked for. */
export function Keypad({ digits, onDigit, onErase, onClear, onSign }: Props) {
  const styles = useThemedStyles(makeStyles);
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
      {onSign === undefined ? null : key('±', 'Change sign', onSign)}
    </View>
  );
}
```

  In `EntryPad.tsx` import it from `@/features/panels/primitives/Keypad` and render
  `<Keypad digits={entryDigits(target.kind)} onDigit={entry.digit} onErase={entry.erase} onClear={entry.clear} />`
  (import `entryDigits` from `@/domain/radios/entry`). Delete `src/features/panels/radios/Keypad.tsx`
  and update every import of it.

- [ ] **Step 9: Share the two-column width.** In `src/domain/panels/device-layout.ts` add:

```ts
/**
 * Below this content width a panel stacks its sections; at or above it (tablets, landscape
 * phones) it lays them out in two columns. Shared by Radios and Autopilot.
 */
export const TWO_COLUMN_MIN_WIDTH = 720;
```

  In `RadiosPanel.tsx` replace the local constant and its comment with
  `import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';` and
  `export { TWO_COLUMN_MIN_WIDTH };` so existing imports keep working.

- [ ] **Step 10: Run the affected suites**

Run: `npx jest tests/unit/domain/read-back.test.ts tests/ui/read-back.test.tsx tests/ui/radios-entry.test.tsx tests/ui/radios-panel.test.tsx tests/ui/radios-transponder.test.tsx tests/ui/touch-target-guard.test.tsx`
Expected: PASS

- [ ] **Step 11: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check
git add -A src tests
git commit -m "refactor(panels): read-back predicate and pending value, shared keypad and width

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Autopilot domain — selectors, typed entry, modes

**Files:**
- Create: `src/domain/autopilot/selectors.ts`
- Create: `src/domain/autopilot/selector-entry.ts`
- Create: `src/domain/autopilot/modes.ts`
- Test: `tests/unit/domain/autopilot/selectors.test.ts`, `tests/unit/domain/autopilot/selector-entry.test.ts`, `tests/unit/domain/autopilot/modes.test.ts`

**Interfaces:**
- Produces (exact names used by Tasks 4–5):
  - `type SelectorKind = 'heading' | 'altitude' | 'verticalSpeed' | 'knots' | 'mach'`
  - `SELECTOR_STEPS: Record<SelectorKind, readonly [number, number]>` (small, large)
  - `formatSelector(kind, value: number): string`, `formatMach(value: number): string`
  - `stepSelector(kind, base: number, delta: number): number | null`
  - `stepLabel(kind, delta: number): string`, `stepSpoken(label: string, kind, delta: number): string`
  - `selectorMatches(kind, expected: number): (value: DataRefValue | undefined) => boolean`
  - `selectorNotTaken(kind, value: number, current: number | null): string`
  - `interface SelectorDraft { digits: string; negative: boolean }`, `EMPTY_SELECTOR_DRAFT`
  - `SELECTOR_DIGITS: readonly number[]`, `hasSign(kind): boolean`
  - `pushSelectorDigit(kind, draft, digit): SelectorDraft`, `deleteSelectorDigit(draft)`, `toggleSelectorSign(kind, draft)`
  - `selectorDraftText(kind, draft): string`
  - `type ParsedSelector = { status: 'incomplete' } | { status: 'invalid'; message: string } | { status: 'valid'; value: number; text: string }`
  - `parseSelectorEntry(kind, draft): ParsedSelector`, `explainSelector(kind, draft, parsed): boolean`
  - `type ModeState = 'off' | 'armed' | 'engaged'`, `modeState(value: number | null): ModeState`
  - `interface ModeStatuses { hdg; nav; apr; alt; vs; flc; gs; rol; pit: number | null }`
  - `annunciationText(statuses: ModeStatuses, autothrottle: number | null): string`
  - `autothrottleWord(value: number | null): string | null`, `autothrottleArmed(value)`, `autothrottleEngaged(value)`
  - `modeNotTaken(label: string, wasOff: boolean, needsSource: boolean): string`

- [ ] **Step 1: Write the failing selector tests** — `tests/unit/domain/autopilot/selectors.test.ts`:

```ts
import {
  formatSelector,
  selectorMatches,
  selectorNotTaken,
  stepLabel,
  stepSelector,
  stepSpoken,
} from '@/domain/autopilot/selectors';

describe('formatSelector', () => {
  it('shows headings as three digits, with 360 for north', () => {
    expect(formatSelector('heading', 270)).toBe('270°');
    expect(formatSelector('heading', 5)).toBe('005°');
    expect(formatSelector('heading', 0)).toBe('360°');
    expect(formatSelector('heading', 359.6)).toBe('360°');
    expect(formatSelector('heading', -10)).toBe('350°');
  });
  it('groups thousands for altitude and vertical speed, with a sign on climbs and descents', () => {
    expect(formatSelector('altitude', 5000)).toBe('5,000 ft');
    expect(formatSelector('altitude', 12500.4)).toBe('12,500 ft');
    expect(formatSelector('verticalSpeed', 1500)).toBe('+1,500 fpm');
    expect(formatSelector('verticalSpeed', -800)).toBe('−800 fpm');
    expect(formatSelector('verticalSpeed', 0.3)).toBe('0 fpm');
  });
  it('shows knots whole and Mach as hundredths without a leading zero', () => {
    expect(formatSelector('knots', 249.6)).toBe('250 kt');
    expect(formatSelector('mach', 0.78)).toBe('M .78');
    expect(formatSelector('mach', 0.8)).toBe('M .80');
  });
});

describe('stepSelector', () => {
  it('adds to the rounded heading and wraps', () => {
    expect(stepSelector('heading', 355, 10)).toBe(5);
    expect(stepSelector('heading', 3, -10)).toBe(353);
    expect(stepSelector('heading', 269.6, 1)).toBe(271);
  });
  it('moves altitude and vertical speed to the 100-ft grid in the direction of travel first', () => {
    expect(stepSelector('altitude', 4550, 100)).toBe(4600);
    expect(stepSelector('altitude', 4550, -100)).toBe(4500);
    expect(stepSelector('altitude', 4500, 1000)).toBe(5500);
    expect(stepSelector('verticalSpeed', -850, 100)).toBe(-800);
    expect(stepSelector('verticalSpeed', -850, -100)).toBe(-900);
  });
  it('steps airspeed from the rounded knot or hundredth of Mach', () => {
    expect(stepSelector('knots', 119.7, 10)).toBe(130);
    expect(stepSelector('mach', 0.785, 0.01)).toBe(0.8);
    expect(stepSelector('mach', 0.78, -0.05)).toBe(0.73);
  });
  it('refuses a step past a limit', () => {
    expect(stepSelector('altitude', 50000, 100)).toBeNull();
    expect(stepSelector('altitude', 49950, 1000)).toBeNull();
    expect(stepSelector('altitude', 49950, 100)).toBe(50000);
    expect(stepSelector('verticalSpeed', 9900, 100)).toBeNull();
    expect(stepSelector('knots', 40, -1)).toBeNull();
    expect(stepSelector('mach', 0.99, 0.01)).toBeNull();
  });
  it('steps back into range from outside, landing on the limit', () => {
    expect(stepSelector('knots', 0, 1)).toBe(40);
    expect(stepSelector('knots', 0, -1)).toBeNull();
    expect(stepSelector('altitude', 60000, -100)).toBe(50000);
    expect(stepSelector('altitude', 60000, 100)).toBeNull();
  });
});

describe('step labels', () => {
  it('labels steps with a sign, Mach as hundredths', () => {
    expect(stepLabel('altitude', -1000)).toBe('−1000');
    expect(stepLabel('heading', 1)).toBe('+1');
    expect(stepLabel('mach', -0.05)).toBe('−.05');
  });
  it('speaks steps in words', () => {
    expect(stepSpoken('Altitude', 'altitude', 100)).toBe('Altitude plus 100 feet');
    expect(stepSpoken('Heading', 'heading', -1)).toBe('Heading minus 1 degree');
    expect(stepSpoken('Heading', 'heading', 10)).toBe('Heading plus 10 degrees');
    expect(stepSpoken('Vertical speed', 'verticalSpeed', 500)).toBe(
      'Vertical speed plus 500 feet per minute',
    );
    expect(stepSpoken('Airspeed', 'knots', 1)).toBe('Airspeed plus 1 knot');
    expect(stepSpoken('Airspeed', 'mach', 0.01)).toBe('Airspeed plus .01 Mach');
  });
});

describe('selectorMatches', () => {
  it('treats headings 0 and 360 as the same, within half a degree', () => {
    expect(selectorMatches('heading', 0)(359.8)).toBe(true);
    expect(selectorMatches('heading', 0)(0.2)).toBe(true);
    expect(selectorMatches('heading', 0)(1)).toBe(false);
  });
  it('compares Mach to the hundredth', () => {
    expect(selectorMatches('mach', 0.78)(0.7801)).toBe(true);
    expect(selectorMatches('mach', 0.78)(0.79)).toBe(false);
  });
  it('compares the others to the unit, and rejects non-numbers', () => {
    expect(selectorMatches('altitude', 5000)(5000.3)).toBe(true);
    expect(selectorMatches('altitude', 5000)(5100)).toBe(false);
    expect(selectorMatches('altitude', 5000)(undefined)).toBe(false);
    expect(selectorMatches('altitude', 5000)([5000])).toBe(true);
  });
});

describe('selectorNotTaken', () => {
  it('names what was sent and what X-Plane shows', () => {
    expect(selectorNotTaken('altitude', 5100, 5000)).toBe(
      'X-Plane did not take altitude 5,100 ft. The selector still shows 5,000 ft.',
    );
    expect(selectorNotTaken('mach', 0.82, 0.78)).toBe(
      'X-Plane did not take Mach .82. The selector still shows M .78.',
    );
    expect(selectorNotTaken('heading', 90, null)).toBe('X-Plane did not take heading 090°.');
    expect(selectorNotTaken('verticalSpeed', -1500, 0)).toBe(
      'X-Plane did not take vertical speed −1,500 fpm. The selector still shows 0 fpm.',
    );
    expect(selectorNotTaken('knots', 250, 120)).toBe(
      'X-Plane did not take airspeed 250 kt. The selector still shows 120 kt.',
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/domain/autopilot/selectors.test.ts`
Expected: FAIL — cannot find module `@/domain/autopilot/selectors`.

- [ ] **Step 3: Implement `src/domain/autopilot/selectors.ts`**

```ts
import type { DataRefValue } from '@/domain/simulator/types';

/** The airspeed selector is `knots` or `mach` depending on X-Plane's flag. */
export type SelectorKind = 'heading' | 'altitude' | 'verticalSpeed' | 'knots' | 'mach';

type Limited = Exclude<SelectorKind, 'heading'>;

/** Inclusive limits; the heading wraps instead. */
export const SELECTOR_LIMITS: Readonly<Record<Limited, { min: number; max: number }>> = {
  altitude: { min: 0, max: 50_000 },
  verticalSpeed: { min: -9_900, max: 9_900 },
  knots: { min: 40, max: 500 },
  mach: { min: 0.1, max: 0.99 },
};

/** The small and the large step of each selector's steppers. */
export const SELECTOR_STEPS: Readonly<Record<SelectorKind, readonly [number, number]>> = {
  heading: [1, 10],
  altitude: [100, 1000],
  verticalSpeed: [100, 500],
  knots: [1, 10],
  mach: [0.01, 0.05],
};

/** Altitude preselectors and vertical speed wheels move in hundreds of feet. */
const GRID_FT = 100;
const MINUS = '−';

function grouped(value: number): string {
  return String(Math.abs(Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 0–359, whole degrees. */
export function normaliseHeading(degrees: number): number {
  const whole = Math.round(degrees) % 360;
  return whole < 0 ? whole + 360 : whole;
}

/** ".78": Mach as pilots read it, to the hundredth, no leading zero. */
export function formatMach(value: number): string {
  const hundredths = Math.round(value * 100);
  return hundredths >= 100
    ? (hundredths / 100).toFixed(2)
    : `.${String(hundredths).padStart(2, '0')}`;
}

export function formatSelector(kind: SelectorKind, value: number): string {
  switch (kind) {
    case 'heading': {
      const heading = normaliseHeading(value);
      return `${String(heading === 0 ? 360 : heading).padStart(3, '0')}°`;
    }
    case 'altitude':
      return `${Math.round(value) < 0 ? MINUS : ''}${grouped(value)} ft`;
    case 'verticalSpeed': {
      const rounded = Math.round(value);
      if (rounded === 0) {
        return '0 fpm';
      }
      return `${rounded > 0 ? '+' : MINUS}${grouped(rounded)} fpm`;
    }
    case 'knots':
      return `${Math.round(value)} kt`;
    case 'mach':
      return `M ${formatMach(value)}`;
  }
}

/**
 * A step back toward the range lands on the limit; a step further outside, or past a limit from
 * inside, is refused (null) so the stepper is disabled.
 */
function limited(kind: Limited, value: number, delta: number): number | null {
  const { min, max } = SELECTOR_LIMITS[kind];
  const epsilon = 1e-9;
  if (value > max + epsilon) {
    return delta < 0 ? max : null;
  }
  if (value < min - epsilon) {
    return delta > 0 ? min : null;
  }
  return value;
}

/** The value one stepper press sends from `base`, or null when it may not step that way. */
export function stepSelector(kind: SelectorKind, base: number, delta: number): number | null {
  switch (kind) {
    case 'heading':
      return normaliseHeading(Math.round(base) + delta);
    case 'altitude':
    case 'verticalSpeed': {
      const onGrid =
        delta > 0 ? Math.floor(base / GRID_FT) * GRID_FT : Math.ceil(base / GRID_FT) * GRID_FT;
      return limited(kind, onGrid + delta, delta);
    }
    case 'knots':
      return limited(kind, Math.round(base) + delta, delta);
    case 'mach':
      return limited(kind, (Math.round(base * 100) + Math.round(delta * 100)) / 100, delta);
  }
}

export function stepLabel(kind: SelectorKind, delta: number): string {
  const sign = delta < 0 ? MINUS : '+';
  const amount = Math.abs(delta);
  return kind === 'mach' ? `${sign}${formatMach(amount)}` : `${sign}${amount}`;
}

const UNIT_WORDS: Readonly<Record<SelectorKind, readonly [string, string]>> = {
  heading: ['degree', 'degrees'],
  altitude: ['foot', 'feet'],
  verticalSpeed: ['foot per minute', 'feet per minute'],
  knots: ['knot', 'knots'],
  mach: ['Mach', 'Mach'],
};

/** "Altitude plus 100 feet": a stepper's accessibility label. */
export function stepSpoken(label: string, kind: SelectorKind, delta: number): string {
  const direction = delta < 0 ? 'minus' : 'plus';
  const amount = Math.abs(delta);
  const [one, many] = UNIT_WORDS[kind];
  const amountText = kind === 'mach' ? formatMach(amount) : String(amount);
  return `${label} ${direction} ${amountText} ${amount === 1 ? one : many}`;
}

function numberOf(value: DataRefValue | undefined): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

/** Whether X-Plane's value reads as `expected` for this selector (the read-back predicate). */
export function selectorMatches(
  kind: SelectorKind,
  expected: number,
): (value: DataRefValue | undefined) => boolean {
  return (value) => {
    const current = numberOf(value);
    if (current === null) {
      return false;
    }
    if (kind === 'heading') {
      const difference = Math.abs(((current - expected) % 360) + 360) % 360;
      return Math.min(difference, 360 - difference) < 0.5;
    }
    return Math.abs(current - expected) < (kind === 'mach' ? 0.005 : 0.5);
  };
}

const PHRASE: Readonly<Record<SelectorKind, string>> = {
  heading: 'heading',
  altitude: 'altitude',
  verticalSpeed: 'vertical speed',
  knots: 'airspeed',
  mach: 'Mach',
};

/** R4's sentence when X-Plane did not adopt a selector value. */
export function selectorNotTaken(kind: SelectorKind, value: number, current: number | null): string {
  const sent = kind === 'mach' ? formatMach(value) : formatSelector(kind, value);
  const still =
    current === null ? '' : ` The selector still shows ${formatSelector(kind, current)}.`;
  return `X-Plane did not take ${PHRASE[kind]} ${sent}.${still}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/unit/domain/autopilot/selectors.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing entry tests** — `tests/unit/domain/autopilot/selector-entry.test.ts`:

```ts
import {
  EMPTY_SELECTOR_DRAFT,
  type SelectorDraft,
  deleteSelectorDigit,
  explainSelector,
  hasSign,
  parseSelectorEntry,
  pushSelectorDigit,
  selectorDraftText,
  toggleSelectorSign,
} from '@/domain/autopilot/selector-entry';
import type { SelectorKind } from '@/domain/autopilot/selectors';

function typed(kind: SelectorKind, digits: string, negative = false): SelectorDraft {
  let draft: SelectorDraft = EMPTY_SELECTOR_DRAFT;
  for (const digit of digits) {
    draft = pushSelectorDigit(kind, draft, Number(digit));
  }
  return negative ? toggleSelectorSign(kind, draft) : draft;
}

describe('the selector draft', () => {
  it('stops at each kind’s length', () => {
    expect(typed('heading', '2705').digits).toBe('270');
    expect(typed('altitude', '123456').digits).toBe('12345');
    expect(typed('verticalSpeed', '12345').digits).toBe('1234');
    expect(typed('knots', '2500').digits).toBe('250');
    expect(typed('mach', '785').digits).toBe('78');
  });
  it('deletes the last digit', () => {
    expect(deleteSelectorDigit(typed('altitude', '500')).digits).toBe('50');
  });
  it('has a sign only for vertical speed', () => {
    expect(hasSign('verticalSpeed')).toBe(true);
    expect(hasSign('altitude')).toBe(false);
    expect(toggleSelectorSign('altitude', typed('altitude', '5')).negative).toBe(false);
    expect(toggleSelectorSign('verticalSpeed', typed('verticalSpeed', '5')).negative).toBe(true);
  });
  it('reads as typed, with the unit', () => {
    expect(selectorDraftText('heading', typed('heading', '27'))).toBe('27°');
    expect(selectorDraftText('altitude', typed('altitude', '5000'))).toBe('5000 ft');
    expect(selectorDraftText('verticalSpeed', typed('verticalSpeed', '1500', true))).toBe(
      '−1500 fpm',
    );
    expect(selectorDraftText('knots', typed('knots', '25'))).toBe('25 kt');
    expect(selectorDraftText('mach', typed('mach', '7'))).toBe('M .7_');
    expect(selectorDraftText('altitude', EMPTY_SELECTOR_DRAFT)).toBe('');
  });
});

describe('parseSelectorEntry', () => {
  it('sends a typed 360 as 0', () => {
    expect(parseSelectorEntry('heading', typed('heading', '360'))).toEqual({
      status: 'valid',
      value: 0,
      text: '360°',
    });
    expect(parseSelectorEntry('heading', typed('heading', '5'))).toEqual({
      status: 'valid',
      value: 5,
      text: '005°',
    });
  });
  it('accepts any whole altitude in range', () => {
    expect(parseSelectorEntry('altitude', typed('altitude', '4550'))).toEqual({
      status: 'valid',
      value: 4550,
      text: '4,550 ft',
    });
    expect(parseSelectorEntry('altitude', typed('altitude', '60000'))).toEqual({
      status: 'invalid',
      message: 'Altitude runs from 0 to 50,000 ft.',
    });
  });
  it('applies the vertical speed sign, and never sends minus zero', () => {
    expect(parseSelectorEntry('verticalSpeed', typed('verticalSpeed', '1500', true))).toEqual({
      status: 'valid',
      value: -1500,
      text: '−1,500 fpm',
    });
    const zero = parseSelectorEntry('verticalSpeed', typed('verticalSpeed', '0', true));
    expect(zero.status === 'valid' && Object.is(zero.value, 0)).toBe(true);
    expect(parseSelectorEntry('verticalSpeed', typed('verticalSpeed', '9950'))).toEqual({
      status: 'invalid',
      message: 'Vertical speed runs from −9,900 to +9,900 fpm.',
    });
  });
  it('needs two digits for knots and Mach', () => {
    expect(parseSelectorEntry('knots', typed('knots', '2'))).toEqual({ status: 'incomplete' });
    expect(parseSelectorEntry('mach', typed('mach', '8'))).toEqual({ status: 'incomplete' });
    expect(parseSelectorEntry('mach', typed('mach', '82'))).toEqual({
      status: 'valid',
      value: 0.82,
      text: 'M .82',
    });
    expect(parseSelectorEntry('mach', typed('mach', '05'))).toEqual({
      status: 'invalid',
      message: 'Mach runs from .10 to .99.',
    });
    expect(parseSelectorEntry('knots', typed('knots', '30'))).toEqual({
      status: 'invalid',
      message: 'Airspeed runs from 40 to 500 kt.',
    });
  });
  it('is incomplete when empty', () => {
    expect(parseSelectorEntry('altitude', EMPTY_SELECTOR_DRAFT)).toEqual({ status: 'incomplete' });
  });
});

describe('explainSelector', () => {
  const explain = (kind: SelectorKind, digits: string) => {
    const draft = typed(kind, digits);
    return explainSelector(kind, draft, parseSelectorEntry(kind, draft));
  };
  it('waits while more digits could still bring the value into range', () => {
    expect(explain('knots', '30')).toBe(false);
    expect(explain('knots', '300')).toBe(false);
  });
  it('explains at full length, or once the value is already above the maximum', () => {
    expect(explain('knots', '600')).toBe(true);
    expect(explain('heading', '400')).toBe(true);
    expect(explain('mach', '05')).toBe(true);
    expect(explain('altitude', '60000')).toBe(true);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx jest tests/unit/domain/autopilot/selector-entry.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 7: Implement `src/domain/autopilot/selector-entry.ts`**

```ts
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
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx jest tests/unit/domain/autopilot/selector-entry.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing mode tests** — `tests/unit/domain/autopilot/modes.test.ts`:

```ts
import {
  type ModeStatuses,
  annunciationText,
  autothrottleArmed,
  autothrottleEngaged,
  autothrottleWord,
  modeNotTaken,
  modeState,
} from '@/domain/autopilot/modes';

const OFF: ModeStatuses = {
  hdg: 0,
  nav: 0,
  apr: 0,
  alt: 0,
  vs: 0,
  flc: 0,
  gs: 0,
  rol: 0,
  pit: 0,
};

describe('modeState', () => {
  it('reads X-Plane’s 0 off, 1 armed, 2 captured', () => {
    expect(modeState(0)).toBe('off');
    expect(modeState(1)).toBe('armed');
    expect(modeState(2)).toBe('engaged');
    expect(modeState(3)).toBe('engaged');
    expect(modeState(null)).toBe('off');
    expect(modeState(-1)).toBe('off');
  });
});

describe('annunciationText', () => {
  it('names the engaged lateral and vertical modes, then the armed ones', () => {
    expect(annunciationText({ ...OFF, hdg: 2, nav: 1, alt: 2 }, 0)).toBe('HDG · ALT · Armed NAV');
  });
  it('gives the approach precedence over heading, and glideslope over altitude', () => {
    expect(annunciationText({ ...OFF, hdg: 2, apr: 2, alt: 2, gs: 2 }, null)).toBe('APR · GS');
  });
  it('lists every armed mode in order, and the autothrottle mode when active', () => {
    expect(annunciationText({ ...OFF, rol: 2, pit: 2, nav: 1, apr: 1, alt: 1, gs: 1 }, 1)).toBe(
      'ROL · PIT · Armed NAV, APR, ALT, GS · A/T SPD',
    );
  });
  it('says so when nothing is engaged', () => {
    expect(annunciationText(OFF, 0)).toBe('No modes engaged');
    expect(annunciationText(OFF, null)).toBe('No modes engaged');
  });
  it('shows a vertical mode alone', () => {
    expect(annunciationText({ ...OFF, vs: 2 }, null)).toBe('VS');
    expect(annunciationText({ ...OFF, flc: 2 }, 2)).toBe('FLC · A/T N1');
  });
});

describe('autothrottle', () => {
  it('words each active mode, nothing for off or armed', () => {
    expect(autothrottleWord(-1)).toBeNull();
    expect(autothrottleWord(0)).toBeNull();
    expect(autothrottleWord(1)).toBe('SPD');
    expect(autothrottleWord(2)).toBe('N1');
    expect(autothrottleWord(3)).toBe('RETARD');
    expect(autothrottleWord(4)).toBe('ON');
    expect(autothrottleWord(null)).toBeNull();
  });
  it('is armed from 0 and engaged from 1', () => {
    expect(autothrottleArmed(-1)).toBe(false);
    expect(autothrottleArmed(0)).toBe(true);
    expect(autothrottleArmed(null)).toBe(false);
    expect(autothrottleEngaged(0)).toBe(false);
    expect(autothrottleEngaged(2)).toBe(true);
  });
});

describe('modeNotTaken', () => {
  it('says what did not happen, with a next step for navigation modes', () => {
    expect(modeNotTaken('HDG', true, false)).toBe('X-Plane did not engage HDG.');
    expect(modeNotTaken('NAV', true, true)).toBe(
      'X-Plane did not engage NAV. Check the navigation source.',
    );
    expect(modeNotTaken('APR', false, true)).toBe('X-Plane did not turn APR off.');
  });
});
```

- [ ] **Step 10: Run to verify failure**

Run: `npx jest tests/unit/domain/autopilot/modes.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 11: Implement `src/domain/autopilot/modes.ts`**

```ts
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
const LATERAL: readonly (readonly [StatusKey, string])[] = [
  ['apr', 'APR'],
  ['nav', 'NAV'],
  ['hdg', 'HDG'],
  ['rol', 'ROL'],
];
const VERTICAL: readonly (readonly [StatusKey, string])[] = [
  ['gs', 'GS'],
  ['alt', 'ALT'],
  ['flc', 'FLC'],
  ['vs', 'VS'],
  ['pit', 'PIT'],
];
const ARMABLE: readonly (readonly [StatusKey, string])[] = [
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
```

- [ ] **Step 12: Run all three to verify they pass**

Run: `npx jest tests/unit/domain/autopilot`
Expected: PASS

- [ ] **Step 13: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check
git add src/domain/autopilot tests/unit/domain/autopilot
git commit -m "feat(autopilot): selector, typed entry and mode domain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Profile 1.4.0, mock X-Plane and the integration test

**Files:**
- Modify: `src/domain/aircraft/profiles/generic.ts`
- Modify: `tests/mock-xplane/mock-xplane-server.ts`
- Modify: `tests/unit/domain/aircraft-profile.test.ts` (version `1.4.0`; feature assertions)
- Modify: any other test asserting the profile version or the feature list
  (`grep -rn "1\.3\.0\|features.length\|toHaveLength" tests | grep -i -E "profile|feature"`)
- Modify: `docs/xplane.md` (autopilot names, as the radios section lists its names)
- Create: `tests/integration/autopilot.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces, in `@/domain/aircraft/profiles/generic` (exact keys used by Tasks 4–5):
  - `GENERIC_DATAREFS` adds: `autopilotServos`, `autopilotOverride`, `rollStatus`, `pitchStatus`,
    `flightDirectorBars`, `autothrottle`, `altitudeDial`, `verticalSpeedDial`, `airspeedDial`,
    `airspeedIsMach`, `headingStatus`, `navStatus`, `approachStatus`, `glideslopeStatus`,
    `altitudeStatus`, `verticalSpeedStatus`, `speedStatus`.
  - `GENERIC_COMMANDS` adds: `autopilotEngage`, `autopilotDisconnect`, `flightDirectorOn`,
    `flightDirectorOff`, `autothrottleOn`, `autothrottleOff`, `autothrottleArm`,
    `autothrottleDisarm`, `knotsMachToggle`, `modeHeading`, `modeNav`, `modeApproach`,
    `modeAltitude`, `modeVerticalSpeed`, `modeLevelChange`.
  - Feature ids: `FEATURE_AUTOPILOT = 'autopilot-engage'`, `FEATURE_FLIGHT_DIRECTOR =
    'flight-director'`, `FEATURE_AUTOTHROTTLE = 'autothrottle'`, `FEATURE_ALTITUDE_SELECT =
    'altitude-select'`, `FEATURE_VERTICAL_SPEED_SELECT = 'vertical-speed-select'`,
    `FEATURE_AIRSPEED_SELECT = 'airspeed-select'`, `FEATURE_MODE_HDG = 'ap-mode-hdg'`,
    `FEATURE_MODE_NAV = 'ap-mode-nav'`, `FEATURE_MODE_APR = 'ap-mode-apr'`, `FEATURE_MODE_ALT =
    'ap-mode-alt'`, `FEATURE_MODE_VS = 'ap-mode-vs'`, `FEATURE_MODE_FLC = 'ap-mode-flc'`.
  - `FEATURE_HEADING_CONTROL` is unchanged.

- [ ] **Step 1: Write the failing profile test** — in `tests/unit/domain/aircraft-profile.test.ts`
  change both `'1.3.0'` expectations to `'1.4.0'` and add (import the new constants):

```ts
describe('the generic profile’s autopilot (F-20)', () => {
  const bindingsOf = (id: string) =>
    findFeature(GENERIC_PROFILE, id)?.bindings.map((binding) => [
      binding.kind,
      binding.name,
      binding.required,
      binding.write === true,
    ]);

  it('engages and disconnects by separate commands, and reads the override optionally', () => {
    expect(bindingsOf(FEATURE_AUTOPILOT)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/servos_on', true, false],
      ['command', 'sim/autopilot/servos_on', true, false],
      ['command', 'sim/autopilot/servos_off_any', true, false],
      ['dataref', 'sim/operation/override/override_autopilot', false, false],
      ['dataref', 'sim/cockpit2/autopilot/roll_status', false, false],
      ['dataref', 'sim/cockpit2/autopilot/pitch_status', false, false],
    ]);
  });

  it('writes each selector, and reads the knots/Mach flag', () => {
    expect(bindingsOf(FEATURE_ALTITUDE_SELECT)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/altitude_dial_ft', true, true],
    ]);
    expect(bindingsOf(FEATURE_VERTICAL_SPEED_SELECT)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/vvi_dial_fpm', true, true],
    ]);
    expect(bindingsOf(FEATURE_AIRSPEED_SELECT)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/airspeed_dial_kts_mach', true, true],
      ['dataref', 'sim/cockpit2/autopilot/airspeed_is_mach', true, false],
      ['command', 'sim/autopilot/knots_mach_toggle', false, false],
    ]);
  });

  it('gives each mode its status and its command, and the approach an optional glideslope', () => {
    expect(bindingsOf(FEATURE_MODE_APR)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/approach_status', true, false],
      ['command', 'sim/autopilot/approach', true, false],
      ['dataref', 'sim/cockpit2/autopilot/glideslope_status', false, false],
    ]);
    expect(bindingsOf(FEATURE_MODE_FLC)).toEqual([
      ['dataref', 'sim/cockpit2/autopilot/speed_status', true, false],
      ['command', 'sim/autopilot/level_change', true, false],
    ]);
  });

  it('never declares a write to the override or the autopilot_state bit field', () => {
    const written = GENERIC_PROFILE.features.flatMap((feature) =>
      feature.bindings.filter((binding) => binding.write === true).map((binding) => binding.name),
    );
    expect(written).not.toContain('sim/operation/override/override_autopilot');
    expect(written).not.toContain('sim/cockpit/autopilot/autopilot_state');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts`
Expected: FAIL — missing exports / version `1.3.0`.

- [ ] **Step 3: Implement the profile.** In `generic.ts` add to `GENERIC_DATAREFS`:

```ts
  autopilotServos: 'sim/cockpit2/autopilot/servos_on',
  autopilotOverride: 'sim/operation/override/override_autopilot',
  rollStatus: 'sim/cockpit2/autopilot/roll_status',
  pitchStatus: 'sim/cockpit2/autopilot/pitch_status',
  flightDirectorBars: 'sim/cockpit2/autopilot/flight_director_command_bars_pilot',
  autothrottle: 'sim/cockpit2/autopilot/autothrottle_enabled',
  altitudeDial: 'sim/cockpit2/autopilot/altitude_dial_ft',
  verticalSpeedDial: 'sim/cockpit2/autopilot/vvi_dial_fpm',
  airspeedDial: 'sim/cockpit2/autopilot/airspeed_dial_kts_mach',
  airspeedIsMach: 'sim/cockpit2/autopilot/airspeed_is_mach',
  headingStatus: 'sim/cockpit2/autopilot/heading_status',
  navStatus: 'sim/cockpit2/autopilot/nav_status',
  approachStatus: 'sim/cockpit2/autopilot/approach_status',
  glideslopeStatus: 'sim/cockpit2/autopilot/glideslope_status',
  altitudeStatus: 'sim/cockpit2/autopilot/altitude_hold_status',
  verticalSpeedStatus: 'sim/cockpit2/autopilot/vvi_status',
  speedStatus: 'sim/cockpit2/autopilot/speed_status',
```

  to `GENERIC_COMMANDS`:

```ts
  autopilotEngage: 'sim/autopilot/servos_on',
  autopilotDisconnect: 'sim/autopilot/servos_off_any',
  flightDirectorOn: 'sim/autopilot/fdir_command_bars_on',
  flightDirectorOff: 'sim/autopilot/fdir_command_bars_off',
  autothrottleOn: 'sim/autopilot/autothrottle_on',
  autothrottleOff: 'sim/autopilot/autothrottle_off',
  autothrottleArm: 'sim/autopilot/autothrottle_arm',
  autothrottleDisarm: 'sim/autopilot/autothrottle_hard_off',
  knotsMachToggle: 'sim/autopilot/knots_mach_toggle',
  modeHeading: 'sim/autopilot/heading',
  modeNav: 'sim/autopilot/NAV',
  modeApproach: 'sim/autopilot/approach',
  modeAltitude: 'sim/autopilot/altitude_hold',
  modeVerticalSpeed: 'sim/autopilot/vertical_speed',
  modeLevelChange: 'sim/autopilot/level_change',
```

  the twelve feature-id constants listed under Interfaces, and a helper beside `radioFeature`:

```ts
/** Keeps the six mode features identical in shape: X-Plane's status, then its own command. */
function modeFeature(
  id: string,
  label: string,
  status: string,
  command: string,
  extras: readonly BindingSpec[] = [],
): FeatureSpec {
  return {
    id,
    label,
    bindings: [
      { kind: 'dataref', name: status, required: true, purpose: `${label} state` },
      { kind: 'command', name: command, required: true, purpose: `${label} button` },
      ...extras,
    ],
  };
}
```

  Then append these features to `GENERIC_PROFILE.features`, set `version: '1.4.0'`, and extend
  the profile's doc comment with: "The autopilot (F-20) is one feature per control as well; mode
  and engagement state come only from X-Plane's own status DataRefs, and the plugin override is
  read, never written."

```ts
    {
      id: FEATURE_AUTOPILOT,
      label: 'Autopilot',
      bindings: [
        { kind: 'dataref', name: D.autopilotServos, required: true, purpose: 'Autopilot engaged' },
        { kind: 'command', name: C.autopilotEngage, required: true, purpose: 'Autopilot engage' },
        {
          kind: 'command',
          name: C.autopilotDisconnect,
          required: true,
          purpose: 'Autopilot disconnect',
        },
        {
          kind: 'dataref',
          name: D.autopilotOverride,
          required: false,
          purpose: 'Whether another program is flying the autopilot',
        },
        { kind: 'dataref', name: D.rollStatus, required: false, purpose: 'Roll hold state' },
        { kind: 'dataref', name: D.pitchStatus, required: false, purpose: 'Pitch hold state' },
      ],
    },
    {
      id: FEATURE_FLIGHT_DIRECTOR,
      label: 'Flight director',
      bindings: [
        {
          kind: 'dataref',
          name: D.flightDirectorBars,
          required: true,
          purpose: 'Flight director on or off',
        },
        { kind: 'command', name: C.flightDirectorOn, required: true, purpose: 'Flight director on' },
        {
          kind: 'command',
          name: C.flightDirectorOff,
          required: true,
          purpose: 'Flight director off',
        },
      ],
    },
    {
      id: FEATURE_AUTOTHROTTLE,
      label: 'Autothrottle',
      bindings: [
        { kind: 'dataref', name: D.autothrottle, required: true, purpose: 'Autothrottle state' },
        { kind: 'command', name: C.autothrottleOn, required: true, purpose: 'Autothrottle engage' },
        {
          kind: 'command',
          name: C.autothrottleOff,
          required: true,
          purpose: 'Autothrottle disengage',
        },
        { kind: 'command', name: C.autothrottleArm, required: true, purpose: 'Autothrottle arm' },
        {
          kind: 'command',
          name: C.autothrottleDisarm,
          required: true,
          purpose: 'Autothrottle disarm',
        },
      ],
    },
    {
      id: FEATURE_ALTITUDE_SELECT,
      label: 'Altitude selector',
      bindings: [
        {
          kind: 'dataref',
          name: D.altitudeDial,
          required: true,
          write: true,
          purpose: 'Selected altitude, written when you set one',
        },
      ],
    },
    {
      id: FEATURE_VERTICAL_SPEED_SELECT,
      label: 'Vertical speed selector',
      bindings: [
        {
          kind: 'dataref',
          name: D.verticalSpeedDial,
          required: true,
          write: true,
          purpose: 'Selected vertical speed, written when you set one',
        },
      ],
    },
    {
      id: FEATURE_AIRSPEED_SELECT,
      label: 'Airspeed selector',
      bindings: [
        {
          kind: 'dataref',
          name: D.airspeedDial,
          required: true,
          write: true,
          purpose: 'Selected airspeed, written when you set one',
        },
        {
          kind: 'dataref',
          name: D.airspeedIsMach,
          required: true,
          purpose: 'Whether the selected airspeed is in knots or Mach',
        },
        {
          kind: 'command',
          name: C.knotsMachToggle,
          required: false,
          purpose: 'Knots and Mach switch',
        },
      ],
    },
    modeFeature(FEATURE_MODE_HDG, 'HDG mode', D.headingStatus, C.modeHeading),
    modeFeature(FEATURE_MODE_NAV, 'NAV mode', D.navStatus, C.modeNav),
    modeFeature(FEATURE_MODE_APR, 'APR mode', D.approachStatus, C.modeApproach, [
      { kind: 'dataref', name: D.glideslopeStatus, required: false, purpose: 'Glideslope state' },
    ]),
    modeFeature(FEATURE_MODE_ALT, 'ALT mode', D.altitudeStatus, C.modeAltitude),
    modeFeature(FEATURE_MODE_VS, 'VS mode', D.verticalSpeedStatus, C.modeVerticalSpeed),
    modeFeature(FEATURE_MODE_FLC, 'FLC mode', D.speedStatus, C.modeLevelChange),
```

  (`D` and `C` are the file's existing aliases; declare the feature constants above them.)

- [ ] **Step 4: Run the profile test and the suites that count features or bindings**

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts tests/unit/application tests/ui/compatibility-screen.test.tsx tests/ui/aircraft-summary.test.tsx`
Expected: the profile test PASSES. Any other failure must be an assertion on the version or on
a count/list of features or bindings: update those expectations to include the new features (do
not change behaviour). Re-run until PASS.

- [ ] **Step 5: Extend the mock X-Plane.** In `tests/mock-xplane/mock-xplane-server.ts` append to
  the default DataRefs (ids continue after 1058) and commands (after 2007):

```ts
  { id: 1059, name: 'sim/cockpit2/autopilot/servos_on', valueType: 'int', value: 0 },
  {
    id: 1060,
    name: 'sim/operation/override/override_autopilot',
    valueType: 'int',
    value: 0,
    writable: true,
  },
  { id: 1061, name: 'sim/cockpit2/autopilot/roll_status', valueType: 'int', value: 0 },
  { id: 1062, name: 'sim/cockpit2/autopilot/pitch_status', valueType: 'int', value: 0 },
  {
    id: 1063,
    name: 'sim/cockpit2/autopilot/flight_director_command_bars_pilot',
    valueType: 'int',
    value: 0,
    writable: true,
  },
  {
    id: 1064,
    name: 'sim/cockpit2/autopilot/autothrottle_enabled',
    valueType: 'int',
    value: 0,
    writable: true,
  },
  {
    id: 1065,
    name: 'sim/cockpit2/autopilot/altitude_dial_ft',
    valueType: 'float',
    value: 5000,
    writable: true,
  },
  {
    id: 1066,
    name: 'sim/cockpit2/autopilot/vvi_dial_fpm',
    valueType: 'float',
    value: 0,
    writable: true,
  },
  {
    id: 1067,
    name: 'sim/cockpit2/autopilot/airspeed_dial_kts_mach',
    valueType: 'float',
    value: 120,
    writable: true,
  },
  {
    id: 1068,
    name: 'sim/cockpit2/autopilot/airspeed_is_mach',
    valueType: 'int',
    value: 0,
    writable: true,
  },
  { id: 1069, name: 'sim/cockpit2/autopilot/heading_status', valueType: 'int', value: 0 },
  { id: 1070, name: 'sim/cockpit2/autopilot/nav_status', valueType: 'int', value: 0 },
  { id: 1071, name: 'sim/cockpit2/autopilot/approach_status', valueType: 'int', value: 0 },
  { id: 1072, name: 'sim/cockpit2/autopilot/glideslope_status', valueType: 'int', value: 0 },
  { id: 1073, name: 'sim/cockpit2/autopilot/altitude_hold_status', valueType: 'int', value: 0 },
  { id: 1074, name: 'sim/cockpit2/autopilot/vvi_status', valueType: 'int', value: 0 },
  { id: 1075, name: 'sim/cockpit2/autopilot/speed_status', valueType: 'int', value: 0 },
```

```ts
  { id: 2008, name: 'sim/autopilot/servos_on', description: 'Servos on.' },
  { id: 2009, name: 'sim/autopilot/servos_off_any', description: 'Disco servos, any side.' },
  { id: 2010, name: 'sim/autopilot/fdir_command_bars_on', description: 'FD bars on.' },
  { id: 2011, name: 'sim/autopilot/fdir_command_bars_off', description: 'FD bars off.' },
  { id: 2012, name: 'sim/autopilot/autothrottle_on', description: 'A/T speed on.' },
  { id: 2013, name: 'sim/autopilot/autothrottle_off', description: 'A/T off, armed.' },
  { id: 2014, name: 'sim/autopilot/autothrottle_arm', description: 'A/T arm.' },
  { id: 2015, name: 'sim/autopilot/autothrottle_hard_off', description: 'A/T off, disarmed.' },
  { id: 2016, name: 'sim/autopilot/knots_mach_toggle', description: 'Knots/Mach toggle.' },
  { id: 2017, name: 'sim/autopilot/heading', description: 'Heading select.' },
  { id: 2018, name: 'sim/autopilot/NAV', description: 'VOR/LOC arm.' },
  { id: 2019, name: 'sim/autopilot/approach', description: 'Approach.' },
  { id: 2020, name: 'sim/autopilot/altitude_hold', description: 'Altitude hold.' },
  { id: 2021, name: 'sim/autopilot/vertical_speed', description: 'Vertical speed.' },
  { id: 2022, name: 'sim/autopilot/level_change', description: 'Level change.' },
```

  If the default list does not already contain `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot`
  as a writable float, it does (the `heading_up` behaviour reads it) — do not add it twice.
  In `applyCommand` add, after the transponder IDENT branch (`set` is a local helper):

```ts
    const set = (name: string, value: number) => {
      const dataRef = this.getDataRefByName(name);
      if (dataRef !== undefined) {
        dataRef.value = value;
      }
    };
    const read = (name: string): number => {
      const value = this.getDataRefByName(name)?.value;
      return typeof value === 'number' ? value : 0;
    };
    const AP = 'sim/cockpit2/autopilot/';
    // The mock's autopilot: idempotent pairs set their state; modes toggle, and the vertical
    // modes exclude each other as X-Plane's do.
    const vertical = [`${AP}altitude_hold_status`, `${AP}vvi_status`, `${AP}speed_status`];
    const toggle = (status: string, on: number) => {
      const next = read(status) === 0 ? on : 0;
      if (vertical.includes(status) && next !== 0) {
        vertical.forEach((other) => set(other, 0));
      }
      set(status, next);
    };
    switch (command?.name) {
      case 'sim/autopilot/servos_on':
        set(`${AP}servos_on`, 1);
        break;
      case 'sim/autopilot/servos_off_any':
        set(`${AP}servos_on`, 0);
        break;
      case 'sim/autopilot/fdir_command_bars_on':
        set(`${AP}flight_director_command_bars_pilot`, 1);
        break;
      case 'sim/autopilot/fdir_command_bars_off':
        set(`${AP}flight_director_command_bars_pilot`, 0);
        break;
      case 'sim/autopilot/autothrottle_on':
        set(`${AP}autothrottle_enabled`, 1);
        break;
      case 'sim/autopilot/autothrottle_off':
        set(`${AP}autothrottle_enabled`, 0);
        break;
      case 'sim/autopilot/autothrottle_arm':
        if (read(`${AP}autothrottle_enabled`) < 0) {
          set(`${AP}autothrottle_enabled`, 0);
        }
        break;
      case 'sim/autopilot/autothrottle_hard_off':
        set(`${AP}autothrottle_enabled`, -1);
        break;
      case 'sim/autopilot/knots_mach_toggle': {
        const isMach = read(`${AP}airspeed_is_mach`) === 1;
        const speed = read(`${AP}airspeed_dial_kts_mach`);
        // A rough conversion is enough for a mock: X-Plane converts at the current altitude.
        set(`${AP}airspeed_dial_kts_mach`, isMach ? Math.round(speed * 600) : Math.round((speed / 600) * 100) / 100);
        set(`${AP}airspeed_is_mach`, isMach ? 0 : 1);
        break;
      }
      case 'sim/autopilot/heading':
        toggle(`${AP}heading_status`, 2);
        break;
      case 'sim/autopilot/NAV':
        toggle(`${AP}nav_status`, 1);
        break;
      case 'sim/autopilot/approach':
        toggle(`${AP}approach_status`, 1);
        break;
      case 'sim/autopilot/altitude_hold':
        toggle(`${AP}altitude_hold_status`, 2);
        break;
      case 'sim/autopilot/vertical_speed':
        toggle(`${AP}vvi_status`, 2);
        break;
      case 'sim/autopilot/level_change':
        toggle(`${AP}speed_status`, 2);
        break;
      default:
        break;
    }
```

  (Let Prettier format the long `set(...)` line.)

- [ ] **Step 6: Write the integration test** — `tests/integration/autopilot.test.ts`. Copy the
  imports, `createSession`, `until`, the `beforeEach`/`afterEach` and `valueOf` from
  `tests/integration/radios-transponder.test.ts` unchanged, import `AUTOPILOT_PANEL` from
  `@/features/panels/autopilot/autopilot` **only after Task 4 exists** — for now declare the demand
  inline:

```ts
const AUTOPILOT_FEATURES = [
  FEATURE_AUTOPILOT,
  FEATURE_FLIGHT_DIRECTOR,
  FEATURE_AUTOTHROTTLE,
  FEATURE_HEADING_CONTROL,
  FEATURE_ALTITUDE_SELECT,
  FEATURE_VERTICAL_SPEED_SELECT,
  FEATURE_AIRSPEED_SELECT,
  FEATURE_MODE_HDG,
  FEATURE_MODE_NAV,
  FEATURE_MODE_APR,
  FEATURE_MODE_ALT,
  FEATURE_MODE_VS,
  FEATURE_MODE_FLC,
];

describe('the autopilot against the mock X-Plane', () => {
  // server lifecycle and helpers as in radios-transponder.test.ts
  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(AUTOPILOT_FEATURES);
    await session.connect(server.host, server.port);
    return session;
  }

  it('reports every autopilot feature available on the generic aircraft', async () => {
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    for (const id of AUTOPILOT_FEATURES) {
      expect(featureStatus(compatibility, id)).toBe('available');
    }
    session.disconnect();
  });

  it('engages the autopilot and HDG, and disconnects, reading each state back', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.autopilotServos) === 0);
    await session.activate(FEATURE_AUTOPILOT, C.autopilotEngage);
    await until(() => valueOf(session, D.autopilotServos) === 1);
    await session.activate(FEATURE_MODE_HDG, C.modeHeading);
    await until(() => valueOf(session, D.headingStatus) === 2);
    await session.activate(FEATURE_AUTOPILOT, C.autopilotDisconnect);
    await until(() => valueOf(session, D.autopilotServos) === 0);
    session.disconnect();
  });

  it('writes the selectors and switches the airspeed to Mach', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.altitudeDial) === 5000);
    await session.write(FEATURE_ALTITUDE_SELECT, D.altitudeDial, 12000);
    await session.write(FEATURE_VERTICAL_SPEED_SELECT, D.verticalSpeedDial, -800);
    await until(() => valueOf(session, D.altitudeDial) === 12000);
    await until(() => valueOf(session, D.verticalSpeedDial) === -800);
    await session.activate(FEATURE_AIRSPEED_SELECT, C.knotsMachToggle);
    await until(() => valueOf(session, D.airspeedIsMach) === 1);
    session.disconnect();
  });

  it('arms, engages and disarms the autothrottle with idempotent commands', async () => {
    const session = await connected();
    await until(() => valueOf(session, D.autothrottle) === 0);
    await session.activate(FEATURE_AUTOTHROTTLE, C.autothrottleOn);
    await until(() => valueOf(session, D.autothrottle) === 1);
    await session.activate(FEATURE_AUTOTHROTTLE, C.autothrottleDisarm);
    await until(() => valueOf(session, D.autothrottle) === -1);
    await session.activate(FEATURE_AUTOTHROTTLE, C.autothrottleArm);
    await until(() => valueOf(session, D.autothrottle) === 0);
    session.disconnect();
  });

  it('leaves the rest usable when the approach command is missing', async () => {
    server.removeCommand(C.modeApproach);
    const session = await connected();
    const { compatibility } = session.store.getSnapshot();
    expect(featureStatus(compatibility, FEATURE_MODE_APR)).toBe('unavailable');
    expect(featureStatus(compatibility, FEATURE_MODE_NAV)).toBe('available');
    expect(featureStatus(compatibility, FEATURE_AUTOPILOT)).toBe('available');
    await session.activate(FEATURE_MODE_APR, C.modeApproach);
    expect(session.store.getSnapshot().operations[C.modeApproach]?.refusal).toBe('unavailable');
    session.disconnect();
  });

  it('streams the override flag without ever writing it', async () => {
    server.setDataRefValue(D.autopilotOverride, 1);
    const session = await connected();
    await until(() => valueOf(session, D.autopilotOverride) === 1);
    expect(session.store.getSnapshot().operations[D.autopilotOverride]).toBeUndefined();
    session.disconnect();
  });
});
```

  (In Task 4, replace `AUTOPILOT_FEATURES` with `AUTOPILOT_PANEL.features`.)

- [ ] **Step 7: Run the integration and the existing mock-based suites**

Run: `npx jest tests/integration tests/contract`
Expected: PASS

- [ ] **Step 8: Document the names.** In `docs/xplane.md`, after the radios section, add an
  "Autopilot (F-20)" section with the spec's Verified names table (names, types, writable,
  which are commands), the note that mode state comes from `*_status` DataRefs (0 off, 1 armed,
  2 captured) rather than `autopilot_state`, that engagement uses commands (Laminar's
  recommendation), and that the override is read and never written.

- [ ] **Step 9: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check
npx jest tests/unit tests/integration
git add -A src tests docs/xplane.md
git commit -m "feat(autopilot): profile 1.4.0 with one feature per autopilot control; mock autopilot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Autopilot panel — annunciator, engage row, modes; Heading retired

**Files:**
- Create: `src/features/panels/autopilot/autopilot.ts`
- Create: `src/features/panels/autopilot/AutopilotPanel.tsx`
- Create: `src/features/panels/autopilot/Annunciator.tsx`
- Create: `src/features/panels/autopilot/EngageRow.tsx`
- Create: `src/features/panels/autopilot/ModeButtons.tsx`
- Modify: `src/features/panels/registry.ts` (Autopilot third; remove Heading)
- Modify: `src/application/panel-layout.ts` (`RETIRED_PANEL_IDS` adds `heading: 'autopilot'`)
- Delete: `src/features/panels/heading/HeadingPanel.tsx`
- Modify: tests that reference `HEADING_PANEL`, `HeadingPanel` or the `heading` panel id
  (`grep -rn "HEADING_PANEL\|HeadingPanel\|'heading'" tests src`) — point them at Autopilot or
  another panel; keep their intent.
- Modify: `tests/integration/autopilot.test.ts` (use `AUTOPILOT_PANEL.features`)
- Test: `tests/ui/autopilot-panel.test.tsx`, `tests/unit/application/panel-layout.test.ts`

**Interfaces:**
- Consumes: Task 2's `modeState`, `annunciationText`, `autothrottleArmed`, `autothrottleEngaged`,
  `modeNotTaken`, `type ModeStatuses`; Task 3's names and feature ids; Task 1's `matches`.
- Produces:
  - `AUTOPILOT_PANEL: PanelDescriptor` (`id: 'autopilot'`, `title: 'Autopilot'`)
  - `type SelectorId = 'heading' | 'altitude' | 'verticalSpeed' | 'speed'`
  - `interface SelectorSpec { id: SelectorId; label: string; featureId: string; name: string }`, `SELECTORS`
  - `selectorKind(id: SelectorId, isMach: boolean): SelectorKind`
  - `interface ModeSpec { key: string; label: string; featureId: string; status: string; command: string; needsSource: boolean }`, `MODES`
  - `autopilotNumber(snapshot: SessionSnapshot, name: string): number | null`
  - `OVERRIDE_NOTICE: string`
  - `AutopilotPanel` renders `testID="autopilot-columns"` (as Radios' `radios-columns`), and
    exposes a `selectors` slot that Task 5 fills (in this task, the right column renders nothing).

- [ ] **Step 1: Write `autopilot.ts`** (pure data and helpers, no React):

```ts
import type { SessionSnapshot } from '@/application/session-snapshot';
import type { SelectorKind } from '@/domain/autopilot/selectors';
import {
  FEATURE_AIRSPEED_SELECT,
  FEATURE_ALTITUDE_SELECT,
  FEATURE_AUTOPILOT,
  FEATURE_AUTOTHROTTLE,
  FEATURE_FLIGHT_DIRECTOR,
  FEATURE_HEADING_CONTROL,
  FEATURE_MODE_ALT,
  FEATURE_MODE_APR,
  FEATURE_MODE_FLC,
  FEATURE_MODE_HDG,
  FEATURE_MODE_NAV,
  FEATURE_MODE_VS,
  FEATURE_VERTICAL_SPEED_SELECT,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';

export const AUTOPILOT_PANEL: PanelDescriptor = {
  id: 'autopilot',
  title: 'Autopilot',
  features: [
    FEATURE_AUTOPILOT,
    FEATURE_FLIGHT_DIRECTOR,
    FEATURE_AUTOTHROTTLE,
    FEATURE_MODE_HDG,
    FEATURE_MODE_NAV,
    FEATURE_MODE_APR,
    FEATURE_MODE_ALT,
    FEATURE_MODE_VS,
    FEATURE_MODE_FLC,
    FEATURE_HEADING_CONTROL,
    FEATURE_ALTITUDE_SELECT,
    FEATURE_VERTICAL_SPEED_SELECT,
    FEATURE_AIRSPEED_SELECT,
  ],
  supports: EVERYWHERE,
};

/** R10: shown, and every control disabled, while a plugin owns X-Plane's autopilot. */
export const OVERRIDE_NOTICE =
  "Another program is flying X-Plane's autopilot. These controls are off until it hands control back.";

export type SelectorId = 'heading' | 'altitude' | 'verticalSpeed' | 'speed';

export interface SelectorSpec {
  id: SelectorId;
  label: string;
  featureId: string;
  /** The DataRef the selector shows and writes. */
  name: string;
}

export const SELECTORS: readonly SelectorSpec[] = [
  { id: 'heading', label: 'Heading', featureId: FEATURE_HEADING_CONTROL, name: D.headingBug },
  { id: 'altitude', label: 'Altitude', featureId: FEATURE_ALTITUDE_SELECT, name: D.altitudeDial },
  {
    id: 'verticalSpeed',
    label: 'Vertical speed',
    featureId: FEATURE_VERTICAL_SPEED_SELECT,
    name: D.verticalSpeedDial,
  },
  { id: 'speed', label: 'Airspeed', featureId: FEATURE_AIRSPEED_SELECT, name: D.airspeedDial },
];

/** The airspeed selector's kind follows X-Plane's knots/Mach flag. */
export function selectorKind(id: SelectorId, isMach: boolean): SelectorKind {
  if (id === 'speed') {
    return isMach ? 'mach' : 'knots';
  }
  return id;
}

export interface ModeSpec {
  key: string;
  label: string;
  featureId: string;
  status: string;
  command: string;
  /** NAV and APR need a navigation source; their "did not engage" says where to look. */
  needsSource: boolean;
}

export const MODES: readonly ModeSpec[] = [
  { key: 'hdg', label: 'HDG', featureId: FEATURE_MODE_HDG, status: D.headingStatus, command: C.modeHeading, needsSource: false },
  { key: 'nav', label: 'NAV', featureId: FEATURE_MODE_NAV, status: D.navStatus, command: C.modeNav, needsSource: true },
  { key: 'apr', label: 'APR', featureId: FEATURE_MODE_APR, status: D.approachStatus, command: C.modeApproach, needsSource: true },
  { key: 'alt', label: 'ALT', featureId: FEATURE_MODE_ALT, status: D.altitudeStatus, command: C.modeAltitude, needsSource: false },
  { key: 'vs', label: 'VS', featureId: FEATURE_MODE_VS, status: D.verticalSpeedStatus, command: C.modeVerticalSpeed, needsSource: false },
  { key: 'flc', label: 'FLC', featureId: FEATURE_MODE_FLC, status: D.speedStatus, command: C.modeLevelChange, needsSource: false },
];

/** A number from the stream; none while no flight is loaded (the values would be meaningless). */
export function autopilotNumber(snapshot: SessionSnapshot, name: string): number | null {
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  return noFlight ? null : firstNumber(snapshot.telemetry[name]?.value);
}
```

  (Prettier will reflow `MODES` one property per line.)

- [ ] **Step 2: Write the failing UI test** — `tests/ui/autopilot-panel.test.tsx`. Use the same
  harness as `tests/ui/radios-panel.test.tsx` (copy its imports, `NOW`, `base`, `telemetry`,
  `live`, `actions`, `tree` — rendering `<AutopilotPanel />` in a `PanelFrame` titled
  `Autopilot`), with these values and cases:

```tsx
const VALUES = {
  [D.autopilotServos]: 0,
  [D.autopilotOverride]: 0,
  [D.flightDirectorBars]: 0,
  [D.autothrottle]: 0,
  [D.headingStatus]: 2,
  [D.navStatus]: 1,
  [D.approachStatus]: 0,
  [D.glideslopeStatus]: 0,
  [D.altitudeStatus]: 2,
  [D.verticalSpeedStatus]: 0,
  [D.speedStatus]: 0,
  [D.rollStatus]: 0,
  [D.pitchStatus]: 0,
  [D.headingBug]: 270,
  [D.altitudeDial]: 5000,
  [D.verticalSpeedDial]: 0,
  [D.airspeedDial]: 120,
  [D.airspeedIsMach]: 0,
};

const ok = (name: string) => ({
  [name]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
});

beforeEach(() => {
  (actions.activate as jest.Mock).mockClear();
  (actions.write as jest.Mock).mockClear();
});

describe('Autopilot panel', () => {
  it('reads the modes like an annunciator', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Autopilot modes: HDG · ALT · Armed NAV')).toBeTruthy();
  });

  it('marks each mode engaged, armed or off, in shape and in words', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('HDG mode, engaged')).toBeTruthy();
    expect(screen.getByText('● HDG')).toBeTruthy();
    expect(screen.getByLabelText('NAV mode, armed')).toBeTruthy();
    expect(screen.getByText('○ NAV')).toBeTruthy();
    expect(screen.getByLabelText('APR mode, off')).toBeTruthy();
  });

  it('sends a mode’s own command', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('APR mode, off'));
    expect(actions.activate).toHaveBeenCalledWith('ap-mode-apr', C.modeApproach);
  });

  it('says when X-Plane did not engage a navigation mode, with where to look', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('APR mode, off'));
    await view.rerender(tree(live({ operations: ok(C.modeApproach) }), NOW + 4000));
    expect(screen.getByText('X-Plane did not engage APR. Check the navigation source.')).toBeTruthy();
  });

  it('says nothing when the mode changed', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('HDG mode, engaged'));
    await view.rerender(
      tree(
        live({ operations: ok(C.modeHeading), telemetry: telemetry({ ...VALUES, [D.headingStatus]: 0 }) }),
        NOW + 4000,
      ),
    );
    expect(screen.queryByText(/did not/)).toBeNull();
  });

  it('engages the autopilot when off and disconnects it when engaged, by separate commands', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Engage autopilot'));
    expect(actions.activate).toHaveBeenLastCalledWith('autopilot-engage', C.autopilotEngage);
    await view.rerender(tree(live({ telemetry: telemetry({ ...VALUES, [D.autopilotServos]: 1 }) })));
    expect(screen.getByText('● AP')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Disconnect autopilot'));
    expect(actions.activate).toHaveBeenLastCalledWith('autopilot-engage', C.autopilotDisconnect);
  });

  it('disconnects with one tap, never a confirmation', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.autopilotServos]: 1 }) })));
    await fireEvent.press(screen.getByLabelText('Disconnect autopilot'));
    expect(actions.activate).toHaveBeenCalledTimes(1);
  });

  it('says when X-Plane did not disconnect, and what to do', async () => {
    const engaged = telemetry({ ...VALUES, [D.autopilotServos]: 1 });
    const view = await render(tree(live({ telemetry: engaged })));
    await fireEvent.press(screen.getByLabelText('Disconnect autopilot'));
    await view.rerender(
      tree(live({ telemetry: engaged, operations: ok(C.autopilotDisconnect) }), NOW + 4000),
    );
    expect(
      screen.getByText('X-Plane did not disconnect the autopilot. Disconnect it in X-Plane.'),
    ).toBeTruthy();
  });

  it('turns the flight director on and off with its own commands', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Turn flight director on'));
    expect(actions.activate).toHaveBeenLastCalledWith('flight-director', C.flightDirectorOn);
    await view.rerender(tree(live({ telemetry: telemetry({ ...VALUES, [D.flightDirectorBars]: 1 }) })));
    await fireEvent.press(screen.getByLabelText('Turn flight director off'));
    expect(actions.activate).toHaveBeenLastCalledWith('flight-director', C.flightDirectorOff);
  });

  it('arms, engages and disarms the autothrottle', async () => {
    // autothrottle_enabled 0: armed, not engaged.
    const view = await render(tree(live()));
    expect(screen.getByText('● A/T ARM')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Engage autothrottle'));
    expect(actions.activate).toHaveBeenLastCalledWith('autothrottle', C.autothrottleOn);
    await fireEvent.press(screen.getByLabelText('Disarm autothrottle'));
    expect(actions.activate).toHaveBeenLastCalledWith('autothrottle', C.autothrottleDisarm);
    await view.rerender(tree(live({ telemetry: telemetry({ ...VALUES, [D.autothrottle]: -1 }) })));
    await fireEvent.press(screen.getByLabelText('Arm autothrottle'));
    expect(actions.activate).toHaveBeenLastCalledWith('autothrottle', C.autothrottleArm);
  });

  it('suggests the aircraft may have no autothrottle when it does not engage', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Engage autothrottle'));
    await view.rerender(tree(live({ operations: ok(C.autothrottleOn) }), NOW + 4000));
    expect(
      screen.getByText('X-Plane did not engage the autothrottle. This aircraft may not have one.'),
    ).toBeTruthy();
  });

  it('disables every control and says why while another program flies the autopilot', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.autopilotOverride]: 1 }) })));
    expect(
      screen.getByText(
        "Another program is flying X-Plane's autopilot. These controls are off until it hands control back.",
      ),
    ).toBeTruthy();
    for (const label of ['Engage autopilot', 'Turn flight director on', 'HDG mode, engaged']) {
      expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    }
  });

  it('keeps the other modes working when APR is missing, and says why', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          features: snapshot.compatibility.features.map((feature) =>
            feature.id === 'ap-mode-apr'
              ? {
                  ...feature,
                  status: 'unavailable' as const,
                  missing: [
                    {
                      name: C.modeApproach,
                      kind: 'command' as const,
                      purpose: 'APR mode button',
                      status: 'missing' as const,
                    },
                  ],
                }
              : feature,
          ),
        },
      }),
    );
    expect(screen.getByLabelText('APR mode, off').props.accessibilityState.disabled).toBe(true);
    expect(
      screen.getByText('APR mode is not available on this aircraft: APR mode button.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('HDG mode, engaged').props.accessibilityState.disabled).toBe(false);
  });

  it('shows no modes and no engagement while no flight is loaded', async () => {
    await render(
      tree(live({ health: { ...base.health, activity: 'noFlight', live: true, lastHeartbeatAt: NOW } })),
    );
    expect(screen.getByLabelText('Autopilot modes: No modes engaged')).toBeTruthy();
    expect(screen.getByLabelText('HDG mode, off')).toBeTruthy();
  });

  it('marks the annunciator not live when X-Plane stops sending', async () => {
    // Freshness is the session's activity, not the clock: a stalled simulator is not current.
    await render(
      tree(live({ health: { ...base.health, activity: 'stalled', live: false, lastHeartbeatAt: NOW } })),
    );
    expect(screen.getByLabelText('Autopilot modes: HDG · ALT · Armed NAV, not live')).toBeTruthy();
  });
});
```

  If the `missing` entry's exact shape differs from the radios test (check
  `tests/ui/radios-panel.test.tsx` "keeps the other radios working when NAV2 is missing"), match
  that file. Note "no flight" is itself not current (`panelLinkStatus`), which is why the
  annunciator only says "not live" when it has a value to qualify — as the transponder does.

- [ ] **Step 3: Run to verify failure**

Run: `npx jest tests/ui/autopilot-panel.test.tsx`
Expected: FAIL — cannot find module `@/features/panels/autopilot/AutopilotPanel`.

- [ ] **Step 4: Implement `Annunciator.tsx`**

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { type ModeStatuses, annunciationText } from '@/domain/autopilot/modes';
import { autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  stale: { color: theme.colors.textMuted },
});

/** One line like a flight-mode annunciator, only from X-Plane's status DataRefs (R2, R5). */
export function Annunciator() {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const read = (name: string) => autopilotNumber(snapshot, name);
  const statuses: ModeStatuses = {
    hdg: read(D.headingStatus),
    nav: read(D.navStatus),
    apr: read(D.approachStatus),
    alt: read(D.altitudeStatus),
    vs: read(D.verticalSpeedStatus),
    flc: read(D.speedStatus),
    gs: read(D.glideslopeStatus),
    rol: read(D.rollStatus),
    pit: read(D.pitchStatus),
  };
  const autothrottle = read(D.autothrottle);
  const text = annunciationText(statuses, autothrottle);
  // "not live" qualifies a value; with no flight there is none, and the panel notice explains.
  const hasValue =
    autothrottle !== null || Object.values(statuses).some((value) => value !== null);
  const notLive = !link.valuesCurrent && hasValue;
  return (
    <View
      testID="autopilot-annunciator"
      style={styles.wrap}
      accessible
      accessibilityLabel={`Autopilot modes: ${text}${notLive ? ', not live' : ''}`}
    >
      <Text style={[styles.text, link.valuesCurrent ? null : styles.stale]}>{text}</Text>
      {notLive ? <BodyText muted>not live</BodyText> : null}
    </View>
  );
}
```

- [ ] **Step 5: Implement `EngageRow.tsx`**

```tsx
import React from 'react';
import { View } from 'react-native';

import {
  FEATURE_AUTOPILOT,
  FEATURE_AUTOTHROTTLE,
  FEATURE_FLIGHT_DIRECTOR,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { autothrottleArmed, autothrottleEngaged } from '@/domain/autopilot/modes';
import type { DataRefValue } from '@/domain/simulator/types';
import { autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
});

const KEYS = ['ap', 'fd', 'at-arm', 'at'] as const;

interface Press {
  featureId: string;
  command: string;
  key: (typeof KEYS)[number];
  name: string;
  expected: number;
  matches?: (value: DataRefValue | undefined) => boolean;
  sentence: string;
}

/**
 * AP, FD, A/T ARM and A/T. Every press sends the command for the state it asks for, never a
 * toggle, so a stale display can never flip the wrong way; the disconnect is one tap.
 */
export function EngageRow({ readBack, blocked }: { readBack: ReadBack; blocked: boolean }) {
  const { snapshot, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const read = (name: string) => autopilotNumber(snapshot, name);
  const apOn = read(D.autopilotServos) === 1;
  const fdOn = read(D.flightDirectorBars) === 1;
  const autothrottle = read(D.autothrottle);
  const armed = autothrottleArmed(autothrottle);
  const engaged = autothrottleEngaged(autothrottle);

  const press = (spec: Press) => {
    void activate(spec.featureId, spec.command);
    readBack.watch({
      key: spec.key,
      name: spec.name,
      operation: spec.command,
      expected: spec.expected,
      matches: spec.matches,
      failure: () => spec.sentence,
    });
  };
  const atValue = (value: DataRefValue | undefined) => firstNumber(value);

  const buttons = [
    {
      label: 'AP',
      accessibilityLabel: apOn ? 'Disconnect autopilot' : 'Engage autopilot',
      featureId: FEATURE_AUTOPILOT,
      selected: apOn,
      spec: {
        featureId: FEATURE_AUTOPILOT,
        command: apOn ? C.autopilotDisconnect : C.autopilotEngage,
        key: 'ap',
        name: D.autopilotServos,
        expected: apOn ? 0 : 1,
        sentence: apOn
          ? 'X-Plane did not disconnect the autopilot. Disconnect it in X-Plane.'
          : 'X-Plane did not engage the autopilot. Check that it has power.',
      },
    },
    {
      label: 'FD',
      accessibilityLabel: fdOn ? 'Turn flight director off' : 'Turn flight director on',
      featureId: FEATURE_FLIGHT_DIRECTOR,
      selected: fdOn,
      spec: {
        featureId: FEATURE_FLIGHT_DIRECTOR,
        command: fdOn ? C.flightDirectorOff : C.flightDirectorOn,
        key: 'fd',
        name: D.flightDirectorBars,
        expected: fdOn ? 0 : 1,
        sentence: `X-Plane did not turn the flight director ${fdOn ? 'off' : 'on'}.`,
      },
    },
    {
      label: 'A/T ARM',
      accessibilityLabel: armed ? 'Disarm autothrottle' : 'Arm autothrottle',
      featureId: FEATURE_AUTOTHROTTLE,
      selected: armed,
      spec: {
        featureId: FEATURE_AUTOTHROTTLE,
        command: armed ? C.autothrottleDisarm : C.autothrottleArm,
        key: 'at-arm',
        name: D.autothrottle,
        expected: armed ? -1 : 0,
        matches: armed
          ? (value: DataRefValue | undefined) => (atValue(value) ?? 0) < 0
          : (value: DataRefValue | undefined) => (atValue(value) ?? -1) >= 0,
        sentence: armed
          ? 'X-Plane did not disarm the autothrottle.'
          : 'X-Plane did not arm the autothrottle. This aircraft may not have one.',
      },
    },
    {
      label: 'A/T',
      accessibilityLabel: engaged ? 'Disengage autothrottle' : 'Engage autothrottle',
      featureId: FEATURE_AUTOTHROTTLE,
      selected: engaged,
      quiet: true,
      spec: {
        featureId: FEATURE_AUTOTHROTTLE,
        command: engaged ? C.autothrottleOff : C.autothrottleOn,
        key: 'at',
        name: D.autothrottle,
        expected: engaged ? 0 : 1,
        matches: engaged
          ? (value: DataRefValue | undefined) => (atValue(value) ?? 1) < 1
          : (value: DataRefValue | undefined) => (atValue(value) ?? 0) >= 1,
        sentence: engaged
          ? 'X-Plane did not disengage the autothrottle.'
          : 'X-Plane did not engage the autothrottle. This aircraft may not have one.',
      },
    },
  ] as const satisfies readonly {
    label: string;
    accessibilityLabel: string;
    featureId: string;
    selected: boolean;
    quiet?: boolean;
    spec: Press;
  }[];

  return (
    <View>
      <View style={styles.row}>
        {buttons.map((button) => (
          <ControlButton
            key={button.label}
            label={button.label}
            accessibilityLabel={button.accessibilityLabel}
            featureId={button.featureId}
            target={button.spec.command}
            selected={button.selected}
            quiet={'quiet' in button}
            invalid={blocked}
            onPress={() => press(button.spec)}
          />
        ))}
      </View>
      {/* A/T shares its feature with A/T ARM, which prints the reason; its outcome is its own. */}
      <OperationNotice target={engaged ? C.autothrottleOff : C.autothrottleOn} />
      {KEYS.map((key) => {
        const message = readBack.messageFor(key);
        return message === null ? null : (
          <BodyText key={key} tone="danger">
            {message}
          </BodyText>
        );
      })}
    </View>
  );
}
```

  If `as const satisfies` with the arrow functions fights TypeScript, drop `as const` and type the
  array as `{ …; quiet?: boolean; spec: Press }[]` (then pass `quiet={button.quiet === true}`);
  the behaviour must not change. A/T is `quiet` because it shares its feature with A/T ARM, which
  already prints the unavailable reason once; A/T's own failure is printed by the
  `OperationNotice` under the row.

- [ ] **Step 6: Implement `ModeButtons.tsx`**

```tsx
import React from 'react';
import { View } from 'react-native';

import { modeNotTaken, modeState } from '@/domain/autopilot/modes';
import { MODES, type ModeSpec, autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
});

/** Lateral modes on the first row, vertical on the second, as on most autopilot heads. */
const ROWS: readonly (readonly string[])[] = [
  ['hdg', 'nav', 'apr'],
  ['alt', 'vs', 'flc'],
];

/**
 * Each mode's state comes only from X-Plane's status (R5): ● engaged, ○ armed, plain off — told
 * apart by shape and in the spoken label, never by colour alone (R2). A press sends X-Plane's own
 * command for the mode; adoption is any change from the state shown at the press.
 */
export function ModeButtons({ readBack, blocked }: { readBack: ReadBack; blocked: boolean }) {
  const { snapshot, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);

  const button = (spec: ModeSpec) => {
    const state = modeState(autopilotNumber(snapshot, spec.status));
    return (
      <ControlButton
        key={spec.key}
        label={state === 'armed' ? `○ ${spec.label}` : spec.label}
        accessibilityLabel={`${spec.label} mode, ${state}`}
        featureId={spec.featureId}
        target={spec.command}
        selected={state === 'engaged'}
        invalid={blocked}
        onPress={() => {
          void activate(spec.featureId, spec.command);
          readBack.watch({
            key: `mode-${spec.key}`,
            name: spec.status,
            operation: spec.command,
            expected: state === 'off' ? 1 : 0,
            matches: (value) => modeState(firstNumber(value)) !== state,
            failure: () => modeNotTaken(spec.label, state === 'off', spec.needsSource),
          });
        }}
      />
    );
  };

  return (
    <View>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((key) => {
            const spec = MODES.find((mode) => mode.key === key);
            return spec === undefined ? null : button(spec);
          })}
        </View>
      ))}
      {MODES.map((spec) => {
        const message = readBack.messageFor(`mode-${spec.key}`);
        return message === null ? null : (
          <BodyText key={spec.key} tone="danger">
            {message}
          </BodyText>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 7: Implement `AutopilotPanel.tsx`**

```tsx
import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { Annunciator } from '@/features/panels/autopilot/Annunciator';
import { OVERRIDE_NOTICE, autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { EngageRow } from '@/features/panels/autopilot/EngageRow';
import { ModeButtons } from '@/features/panels/autopilot/ModeButtons';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useTheme } from '@/theme/theme-context';

export { AUTOPILOT_PANEL } from '@/features/panels/autopilot/autopilot';

/**
 * F-20. Keyed by the aircraft, so a change of aircraft drops every draft and read-back sentence
 * instead of carrying them onto an autopilot they were never meant for.
 */
export function AutopilotPanel() {
  const { snapshot } = usePanel();
  const { icaoType, description, tailNumber } = snapshot.compatibility.identity;
  return <AutopilotContent key={`${icaoType}|${description}|${tailNumber}`} />;
}

function AutopilotContent() {
  const theme = useTheme();
  const { snapshot } = usePanel();
  const readBack = useReadBack();
  const window = useWindowDimensions();
  // Until the first layout pass, assume the frame's padding; tests never run a layout pass.
  const [measured, setMeasured] = useState<number | null>(null);
  const contentWidth = measured ?? window.width - theme.spacing.lg * 2;
  const wide = contentWidth >= TWO_COLUMN_MIN_WIDTH;
  // R10: never written, only obeyed. A missing binding reads as no override.
  const blocked = autopilotNumber(snapshot, D.autopilotOverride) === 1;
  return (
    <View
      testID="autopilot-columns"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={{
        flexDirection: wide ? 'row' : 'column',
        gap: theme.touch.spacing,
        alignItems: 'flex-start',
      }}
    >
      <View style={[{ gap: theme.touch.spacing }, wide ? { flex: 1 } : { alignSelf: 'stretch' }]}>
        <Annunciator />
        {blocked ? <BodyText tone="danger">{OVERRIDE_NOTICE}</BodyText> : null}
        <EngageRow readBack={readBack} blocked={blocked} />
        <ModeButtons readBack={readBack} blocked={blocked} />
      </View>
      {/* Task 5 renders the selector rows here. */}
      <View style={wide ? { flex: 1 } : { alignSelf: 'stretch' }} />
    </View>
  );
}
```

- [ ] **Step 8: Register and retire.** In `registry.ts` import
  `{ AUTOPILOT_PANEL, AutopilotPanel }` from `@/features/panels/autopilot/AutopilotPanel`, put
  `{ descriptor: AUTOPILOT_PANEL, Component: AutopilotPanel }` third (after Radios), and remove
  the Heading entry and import. In `panel-layout.ts`:

```ts
export const RETIRED_PANEL_IDS: Readonly<Record<string, string>> = {
  'basic-data': 'flight-data',
  heading: 'autopilot',
};
```

  and update that constant's comment to mention both retirements. Delete
  `src/features/panels/heading/HeadingPanel.tsx`. Add to `tests/unit/application/panel-layout.test.ts`:

```ts
it('moves a pilot who last used the retired Heading panel to Autopilot', () => {
  expect(normaliseLayout({ hidden: [], last: 'heading', strip: true }, PANEL_IDS).last).toBe(
    'autopilot',
  );
});

it('drops a hidden Heading panel instead of hiding Autopilot', () => {
  expect(normaliseLayout({ hidden: ['heading'], last: 'setup', strip: true }, PANEL_IDS).hidden).toEqual([]);
});
```

  (import `PANEL_IDS` from `@/features/panels/registry` if the file does not already use a known
  id list; otherwise use the file's list with `'autopilot'` in it.)

- [ ] **Step 9: Fix the tests that knew the Heading panel.** Run
  `grep -rn "HEADING_PANEL\|HeadingPanel\|heading/HeadingPanel" tests src` and
  `npx jest tests/ui tests/unit/application tests/unit/domain/panels.test.ts`. For each failure:
  where a test used the Heading panel as "a panel with a control", use the Autopilot panel and an
  autopilot control (e.g. `Engage autopilot`); where it asserted the switcher order, the order is
  Instruments, Radios, Autopilot, Flight data; where it exercised `heading-control` through the
  session or diagnostics, leave it (the feature still exists). Never delete a test's assertion
  without replacing it with the equivalent one for the Autopilot panel.

- [ ] **Step 10: Point the integration test at the descriptor** — in
  `tests/integration/autopilot.test.ts` replace `AUTOPILOT_FEATURES` with
  `AUTOPILOT_PANEL.features` (import from `@/features/panels/autopilot/autopilot`).

- [ ] **Step 11: Run**

Run: `npx jest tests/ui tests/unit tests/integration/autopilot.test.ts`
Expected: PASS

- [ ] **Step 12: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check
git add -A src tests
git commit -m "feat(autopilot): Autopilot panel with annunciator, engage row and modes; retire Heading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Selectors — rows, steppers, keypad entry

**Files:**
- Create: `src/features/panels/autopilot/useSelectorEntry.ts`
- Create: `src/features/panels/autopilot/SelectorPad.tsx`
- Create: `src/features/panels/autopilot/SelectorRow.tsx`
- Modify: `src/features/panels/autopilot/AutopilotPanel.tsx` (render the rows in the right column)
- Modify: `tests/ui/touch-target-guard.test.tsx` (an Autopilot case with the keypad open)
- Test: `tests/ui/autopilot-selectors.test.tsx`

**Interfaces:**
- Consumes: Task 1 `Keypad`, `ReadBack.pendingExpected`, `matches`; Task 2 selector and entry
  functions; Task 4 `SELECTORS`, `SelectorSpec`, `SelectorId`, `selectorKind`, `autopilotNumber`.
- Produces: `useSelectorEntry(): SelectorEntry`, `SelectorRow`, `SelectorPad`.

- [ ] **Step 1: Write the failing UI test** — `tests/ui/autopilot-selectors.test.tsx`, with the
  same harness and `VALUES` as `tests/ui/autopilot-panel.test.tsx` (copy them):

```tsx
const type = async (keys: string) => {
  for (const key of keys) {
    await fireEvent.press(screen.getByLabelText(key));
  }
};

describe('autopilot selectors', () => {
  it('shows each selector as X-Plane reports it', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Heading selector: 270°')).toBeTruthy();
    expect(screen.getByLabelText('Altitude selector: 5,000 ft')).toBeTruthy();
    expect(screen.getByLabelText('Vertical speed selector: 0 fpm')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed selector: 120 kt')).toBeTruthy();
  });

  it('sends one write per stepper press', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Altitude plus 100 feet'));
    expect(actions.write).toHaveBeenCalledTimes(1);
    expect(actions.write).toHaveBeenCalledWith('altitude-select', D.altitudeDial, 5100);
  });

  it('adds up quick taps on top of the value it last sent', async () => {
    await render(tree(live()));
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.press(screen.getByLabelText('Altitude plus 100 feet'));
    }
    expect((actions.write as jest.Mock).mock.calls.map((call) => call[2])).toEqual([
      5100, 5200, 5300,
    ]);
  });

  it('wraps the heading', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.headingBug]: 355 }) })));
    await fireEvent.press(screen.getByLabelText('Heading plus 10 degrees'));
    expect(actions.write).toHaveBeenCalledWith('heading-control', D.headingBug, 5);
  });

  it('disables a stepper that would pass a limit, and all of them with no value', async () => {
    const view = await render(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.altitudeDial]: 50000 }) })),
    );
    expect(
      screen.getByLabelText('Altitude plus 100 feet').props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByLabelText('Altitude minus 100 feet').props.accessibilityState.disabled,
    ).toBe(false);
    const { [D.altitudeDial]: _omitted, ...rest } = VALUES;
    await view.rerender(tree(live({ telemetry: telemetry(rest) })));
    expect(screen.getByLabelText('Altitude selector: —')).toBeTruthy();
    expect(
      screen.getByLabelText('Altitude minus 100 feet').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('says when X-Plane did not take a selector value', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Altitude plus 100 feet'));
    await view.rerender(tree(live({ operations: ok(D.altitudeDial) }), NOW + 4000));
    expect(
      screen.getByText('X-Plane did not take altitude 5,100 ft. The selector still shows 5,000 ft.'),
    ).toBeTruthy();
  });

  it('writes a typed altitude only on Set, and shows it only in the New box', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    await type('12000');
    expect(actions.write).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Altitude selector: 5,000 ft')).toBeTruthy();
    expect(screen.getByText('Sets 12,000 ft')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Set altitude'));
    expect(actions.write).toHaveBeenCalledWith('altitude-select', D.altitudeDial, 12000);
  });

  it('explains an out-of-range altitude and keeps Set disabled', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    await type('60000');
    expect(screen.getByText('Altitude runs from 0 to 50,000 ft.')).toBeTruthy();
    expect(screen.getByLabelText('Set altitude').props.accessibilityState.disabled).toBe(true);
  });

  it('types a descent with the sign key', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter vertical speed'));
    await type('1500');
    await fireEvent.press(screen.getByLabelText('Change sign'));
    await fireEvent.press(screen.getByLabelText('Set vertical speed'));
    expect(actions.write).toHaveBeenCalledWith('vertical-speed-select', D.verticalSpeedDial, -1500);
  });

  it('offers no sign key outside vertical speed', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    expect(screen.queryByLabelText('Change sign')).toBeNull();
  });

  it('sends a typed 360 as 0', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter heading'));
    await type('360');
    await fireEvent.press(screen.getByLabelText('Set heading'));
    expect(actions.write).toHaveBeenCalledWith('heading-control', D.headingBug, 0);
  });

  it('shows and types Mach when X-Plane’s selector is in Mach', async () => {
    const mach = telemetry({ ...VALUES, [D.airspeedIsMach]: 1, [D.airspeedDial]: 0.78 });
    await render(tree(live({ telemetry: mach })));
    expect(screen.getByLabelText('Airspeed selector: M .78')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Airspeed plus .01 Mach'));
    expect(actions.write).toHaveBeenLastCalledWith('airspeed-select', D.airspeedDial, 0.79);
    await fireEvent.press(screen.getByLabelText('Enter airspeed'));
    await type('82');
    await fireEvent.press(screen.getByLabelText('Set airspeed'));
    expect(actions.write).toHaveBeenLastCalledWith('airspeed-select', D.airspeedDial, 0.82);
  });

  it('switches between knots and Mach with X-Plane’s own command', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Use Mach'));
    expect(actions.activate).toHaveBeenCalledWith('airspeed-select', C.knotsMachToggle);
  });

  it('hides the knots/Mach button when the aircraft lacks the command', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          bindings: {
            ...snapshot.compatibility.bindings,
            [C.knotsMachToggle]: { name: C.knotsMachToggle, kind: 'command', status: 'missing' },
          },
        },
      }),
    );
    expect(screen.queryByLabelText('Use Mach')).toBeNull();
  });

  it('drops an airspeed draft when the unit flips', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter airspeed'));
    await type('25');
    const mach = telemetry({ ...VALUES, [D.airspeedIsMach]: 1, [D.airspeedDial]: 0.4 });
    await view.rerender(tree(live({ telemetry: mach })));
    expect(screen.queryByLabelText('Set airspeed')).toBeNull();
  });

  it('drops the draft when the link drops, and sends nothing', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    await type('8000');
    await view.rerender(tree(live({ state: 'disconnected' })));
    expect(screen.queryByLabelText('Set altitude')).toBeNull();
    await view.rerender(tree(live()));
    expect(screen.queryByLabelText('Set altitude')).toBeNull();
    expect(actions.write).not.toHaveBeenCalled();
  });

  it('override disables the keypad’s Set and every stepper', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    await type('8000');
    await view.rerender(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.autopilotOverride]: 1 }) })),
    );
    expect(screen.getByLabelText('Set altitude').props.accessibilityState.disabled).toBe(true);
    expect(
      screen.getByLabelText('Altitude plus 100 feet').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('opens the keypad under the selector being edited on a phone', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    const row = screen.getByTestId('selector-row-altitude');
    expect(within(row).getByLabelText('Set altitude')).toBeTruthy();
  });
});
```

  `ok(name)` is the helper from `tests/ui/autopilot-panel.test.tsx` (copy it). If `live({ state:
  'disconnected' })` does not disable controls in this harness, use the snapshot the radios entry
  test uses for "drops the draft when the link drops" (`tests/ui/radios-entry.test.tsx`).

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/ui/autopilot-selectors.test.tsx`
Expected: FAIL — selector rows not rendered (`Unable to find … Heading selector: 270°`).

- [ ] **Step 3: Implement `useSelectorEntry.ts`**

```ts
import { useState } from 'react';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import {
  EMPTY_SELECTOR_DRAFT,
  type SelectorDraft,
  deleteSelectorDigit,
  pushSelectorDigit,
  toggleSelectorSign,
} from '@/domain/autopilot/selector-entry';
import type { SelectorKind } from '@/domain/autopilot/selectors';
import {
  SELECTORS,
  type SelectorId,
  type SelectorSpec,
  autopilotNumber,
  selectorKind,
} from '@/features/panels/autopilot/autopilot';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface SelectorEntry {
  target: { spec: SelectorSpec; kind: SelectorKind } | null;
  draft: SelectorDraft;
  open: (id: SelectorId) => void;
  digit: (value: number) => void;
  erase: () => void;
  clear: () => void;
  sign: () => void;
  cancel: () => void;
  /** Set was pressed: close once X-Plane accepts the write, keep the draft if it fails. */
  sent: () => void;
}

interface State {
  id: SelectorId | null;
  kind: SelectorKind | null;
  draft: SelectorDraft;
  sentAt: number | null;
}

const CLOSED: State = { id: null, kind: null, draft: EMPTY_SELECTOR_DRAFT, sentAt: null };

/**
 * The staged selector entry, on F-21's rules: one at a time, dropped — never kept — when controls
 * go inert (R7), and dropped when X-Plane switches the airspeed between knots and Mach, so a
 * knots draft can never be sent as Mach. Resets adjust state while rendering (no effects).
 */
export function useSelectorEntry(): SelectorEntry {
  const { snapshot, link, now } = usePanel();
  const [state, setState] = useState<State>(CLOSED);
  const isMach = autopilotNumber(snapshot, D.airspeedIsMach) === 1;
  const spec = state.id === null ? null : (SELECTORS.find((s) => s.id === state.id) ?? null);
  const kind = spec === null ? null : selectorKind(spec.id, isMach);

  if (spec !== null && (!link.controlsEnabled || kind !== state.kind)) {
    setState(CLOSED);
  } else if (spec !== null && state.sentAt !== null) {
    const outcome = snapshot.operations[spec.name];
    if (outcome?.status === 'ok' && outcome.at >= state.sentAt) {
      setState(CLOSED);
    }
  }

  const edit = (next: (draft: SelectorDraft) => SelectorDraft) =>
    setState((previous) => ({ ...previous, draft: next(previous.draft), sentAt: null }));
  return {
    target: spec === null || kind === null ? null : { spec, kind },
    draft: state.draft,
    open: (id) => {
      const opened = SELECTORS.find((s) => s.id === id);
      if (opened !== undefined) {
        setState({ id, kind: selectorKind(id, isMach), draft: EMPTY_SELECTOR_DRAFT, sentAt: null });
      }
    },
    digit: (value) => {
      if (kind !== null) {
        edit((draft) => pushSelectorDigit(kind, draft, value));
      }
    },
    erase: () => edit(deleteSelectorDigit),
    clear: () => edit(() => EMPTY_SELECTOR_DRAFT),
    sign: () => {
      if (kind !== null) {
        edit((draft) => toggleSelectorSign(kind, draft));
      }
    },
    cancel: () => setState(CLOSED),
    sent: () => setState((previous) => ({ ...previous, sentAt: now })),
  };
}
```

- [ ] **Step 4: Implement `SelectorPad.tsx`** — the dashed `New` box, styled exactly like
  `src/features/panels/radios/EntryPad.tsx` (copy its `makeStyles`):

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  SELECTOR_DIGITS,
  explainSelector,
  hasSign,
  parseSelectorEntry,
  selectorDraftText,
} from '@/domain/autopilot/selector-entry';
import { selectorMatches, selectorNotTaken } from '@/domain/autopilot/selectors';
import type { SelectorEntry } from '@/features/panels/autopilot/useSelectorEntry';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { Keypad } from '@/features/panels/primitives/Keypad';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';

// makeStyles: copied from EntryPad.tsx (wrap, title, display, draft, actions, cancel, cancelLabel).

/**
 * A typed selector value, staged in the dashed box under "New" so it is never read as X-Plane's
 * (R3). Set is the only path to a write; an out-of-range draft says why once more digits cannot
 * help, and keeps Set disabled. No snapping.
 */
export function SelectorPad({
  entry,
  readBack,
  blocked,
}: {
  entry: SelectorEntry;
  readBack: ReadBack;
  blocked: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { write } = usePanel();
  const target = entry.target;
  if (target === null) {
    return null;
  }
  const { spec, kind } = target;
  const parsed = parseSelectorEntry(kind, entry.draft);
  const shown = selectorDraftText(kind, entry.draft);
  const title = `${spec.label} selector`;
  const lower = spec.label.toLowerCase();
  const send = () => {
    if (parsed.status !== 'valid') {
      return;
    }
    const value = parsed.value;
    void write(spec.featureId, spec.name, value);
    readBack.watch({
      key: spec.id,
      name: spec.name,
      operation: spec.name,
      expected: value,
      matches: selectorMatches(kind, value),
      failure: (current) => selectorNotTaken(kind, value, firstNumber(current)),
    });
    entry.sent();
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View
        style={styles.display}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={shown === '' ? `${title}, nothing typed yet` : `${title}, new value ${shown}`}
      >
        <BodyText>New</BodyText>
        <Text style={styles.draft}>{shown === '' ? '—' : shown}</Text>
      </View>
      {parsed.status === 'valid' ? <BodyText muted>{`Sets ${parsed.text}`}</BodyText> : null}
      {parsed.status === 'invalid' && explainSelector(kind, entry.draft, parsed) ? (
        <BodyText tone="danger">{parsed.message}</BodyText>
      ) : null}
      <Keypad
        digits={SELECTOR_DIGITS}
        onDigit={entry.digit}
        onErase={entry.erase}
        onClear={entry.clear}
        onSign={hasSign(kind) ? entry.sign : undefined}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel entry"
          onPress={entry.cancel}
          style={styles.cancel}
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
        <ControlButton
          label="Set"
          accessibilityLabel={`Set ${lower}`}
          featureId={spec.featureId}
          target={spec.name}
          invalid={blocked || parsed.status !== 'valid'}
          onPress={send}
        />
      </View>
    </View>
  );
}
```

  To avoid copying `makeStyles`, you may instead export `entryPadStyles` from `EntryPad.tsx` and
  import it here; either is acceptable, but not both.

- [ ] **Step 5: Implement `SelectorRow.tsx`**

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import {
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import {
  SELECTOR_STEPS,
  formatSelector,
  selectorMatches,
  selectorNotTaken,
  stepLabel,
  stepSelector,
  stepSpoken,
} from '@/domain/autopilot/selectors';
import { controlAvailability } from '@/domain/panels/control-availability';
import {
  type SelectorSpec,
  autopilotNumber,
  selectorKind,
} from '@/features/panels/autopilot/autopilot';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs, paddingVertical: theme.spacing.sm },
  head: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  summary: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
    flexGrow: 1,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  steppers: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
});

/**
 * One selector: X-Plane's value (the button that opens the keypad), four steppers, and for the
 * airspeed X-Plane's knots/Mach switch. Each stepper press is one write (R3), computed from the
 * value the panel last sent while X-Plane has not shown it yet, so quick taps add up.
 */
export function SelectorRow({
  spec,
  readBack,
  blocked,
  onEnter,
  entry = null,
}: {
  spec: SelectorSpec;
  readBack: ReadBack;
  blocked: boolean;
  onEnter: () => void;
  /** The keypad, rendered under this row while this selector is being typed. */
  entry?: React.ReactNode;
}) {
  const { snapshot, link, write, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const isMach = autopilotNumber(snapshot, D.airspeedIsMach) === 1;
  const kind = selectorKind(spec.id, isMach);
  const current = autopilotNumber(snapshot, spec.name);
  const text = current === null ? '—' : formatSelector(kind, current);
  const availability = controlAvailability(featureOf(snapshot.compatibility, spec.featureId));
  const base = readBack.pendingExpected(spec.id) ?? current;
  const [small, large] = SELECTOR_STEPS[kind];
  const notLive = !link.valuesCurrent && current !== null;
  const showUnitSwitch =
    spec.id === 'speed' && snapshot.compatibility.bindings[C.knotsMachToggle]?.status !== 'missing';

  const send = (value: number) => {
    void write(spec.featureId, spec.name, value);
    readBack.watch({
      key: spec.id,
      name: spec.name,
      operation: spec.name,
      expected: value,
      matches: selectorMatches(kind, value),
      failure: (reported) => selectorNotTaken(kind, value, firstNumber(reported)),
    });
  };
  const switchUnit = () => {
    void activate(spec.featureId, C.knotsMachToggle);
    readBack.watch({
      key: 'speed-unit',
      name: D.airspeedIsMach,
      operation: C.knotsMachToggle,
      expected: isMach ? 0 : 1,
      failure: () =>
        `X-Plane did not switch the airspeed selector to ${isMach ? 'knots' : 'Mach'}.`,
    });
  };
  const message = readBack.messageFor(spec.id);
  const unitMessage = spec.id === 'speed' ? readBack.messageFor('speed-unit') : null;

  return (
    <View style={styles.wrap} testID={`selector-row-${spec.id}`}>
      <View style={styles.head}>
        <View
          style={styles.summary}
          accessible
          accessibilityLabel={`${spec.label} selector: ${text}${notLive ? ', not live' : ''}`}
        >
          <Text style={styles.name}>{spec.label}</Text>
          {notLive ? <BodyText muted>not live</BodyText> : null}
        </View>
        <ControlButton
          label={text}
          accessibilityLabel={`Enter ${spec.label.toLowerCase()}`}
          featureId={spec.featureId}
          target={spec.name}
          quiet
          invalid={blocked}
          onPress={onEnter}
        />
        {showUnitSwitch ? (
          <ControlButton
            label={isMach ? 'Use knots' : 'Use Mach'}
            featureId={spec.featureId}
            target={C.knotsMachToggle}
            quiet
            invalid={blocked}
            onPress={switchUnit}
          />
        ) : null}
      </View>
      {entry}
      <View style={styles.steppers}>
        {[-large, -small, small, large].map((delta) => {
          const next = base === null ? null : stepSelector(kind, base, delta);
          return (
            <ControlButton
              key={delta}
              label={stepLabel(kind, delta)}
              accessibilityLabel={stepSpoken(spec.label, kind, delta)}
              featureId={spec.featureId}
              target={spec.name}
              quiet
              invalid={blocked || next === null}
              onPress={() => {
                if (next !== null) {
                  send(next);
                }
              }}
            />
          );
        })}
      </View>
      {availability.reason === null ? null : <BodyText muted>{availability.reason}</BodyText>}
      <OperationNotice target={spec.name} />
      {spec.id === 'speed' ? <OperationNotice target={C.knotsMachToggle} /> : null}
      {message === null ? null : <BodyText tone="danger">{message}</BodyText>}
      {unitMessage === null ? null : <BodyText tone="danger">{unitMessage}</BodyText>}
    </View>
  );
}
```

  Note: the value button stays visible while the selector's write is pending, but disabled, as
  every `ControlButton` on that target is; the steppers share the target, so a press cannot be
  sent twice before X-Plane answers. The stepper's `stepSpoken` uses the capitalised label
  ("Altitude plus 100 feet") — matching the tests.

- [ ] **Step 6: Wire the rows into `AutopilotPanel.tsx`** — add
  `const entry = useSelectorEntry();` and replace the empty right-hand `<View />` with:

```tsx
      <View style={wide ? { flex: 1 } : { alignSelf: 'stretch' }}>
        {SELECTORS.map((spec) => (
          <SelectorRow
            key={spec.id}
            spec={spec}
            readBack={readBack}
            blocked={blocked}
            onEnter={() => entry.open(spec.id)}
            entry={
              entry.target?.spec.id === spec.id ? (
                <SelectorPad entry={entry} readBack={readBack} blocked={blocked} />
              ) : null
            }
          />
        ))}
      </View>
```

  (The keypad opens under its own row in both layouts; import `SELECTORS`, `SelectorRow`,
  `SelectorPad`, `useSelectorEntry`.) Remove the "Task 5 renders…" comment.

- [ ] **Step 7: Run to verify it passes**

Run: `npx jest tests/ui/autopilot-selectors.test.tsx tests/ui/autopilot-panel.test.tsx`
Expected: PASS

- [ ] **Step 8: Touch targets with the keypad open** — in `tests/ui/touch-target-guard.test.tsx`
  add a case beside the Radios one:

```tsx
describe('touch targets on the Autopilot panel with an entry open', () => {
  it('every control, including the keypad and the steppers, is at least 48 dp', async () => {
    mockLayout = { deviceClass: 'phone', orientation: 'portrait' };
    const { services } = makeServices(liveSnapshot(), await seeded('autopilot'));
    await render(tree(services));
    await screen.findByTestId('panel-autopilot');
    await fireEvent.press(screen.getByLabelText('Enter vertical speed'));
    const targets = PANEL_ROLES.flatMap((role) => screen.queryAllByRole(role));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const style = StyleSheet.flatten(target.props.style) ?? {};
      const label = String(target.props.accessibilityLabel ?? target.props.testID ?? 'unlabelled');
      expect({ label, minHeight: Number(style.minHeight ?? style.height ?? 0) >= 48 }).toEqual({
        label,
        minHeight: true,
      });
      expect({ label, minWidth: Number(style.minWidth ?? style.width ?? 0) >= 48 }).toEqual({
        label,
        minWidth: true,
      });
    }
  });
});
```

  If `liveSnapshot()` in that file gives no autopilot telemetry, the selectors show `—` and the
  buttons still render (disabled); the guard checks size, not state, so that is fine.

- [ ] **Step 9: Run the guards and the whole UI project**

Run: `npx jest tests/ui`
Expected: PASS (the error-text guard iterates every registered panel, so it covers Autopilot).

- [ ] **Step 10: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check
git add -A src tests
git commit -m "feat(autopilot): heading, altitude, vertical speed and airspeed selectors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Documentation and roadmap

**Files:**
- Modify: `docs/architecture.md` (an "Autopilot" section after "Radios and transponder")
- Modify: `README.md` (the panels bullet: Heading → Autopilot)
- Modify: `docs/testing/xplane-smoke-test.md` (rows 83–94)
- Modify: `docs/roadmap/features/F-20-autopilot-panel.md` (Status `Done`, a spec reference)

- [ ] **Step 1: `docs/architecture.md`** — add a section "Autopilot" describing, in the file's
  existing style: `src/features/panels/autopilot/` (the panel, its `SelectorSpec`/`ModeSpec`
  tables in `autopilot.ts`, `Annunciator`, `EngageRow`, `ModeButtons`, `SelectorRow`,
  `SelectorPad`, `useSelectorEntry`); `src/domain/autopilot/` (pure selectors, entry and modes);
  that state comes only from `*_status` DataRefs and `servos_on`/bars/`autothrottle_enabled`;
  that engagement is by idempotent command pairs where X-Plane has them and X-Plane's toggles for
  modes; that steppers build on `useReadBack().pendingExpected`; the override (read, never
  written, disables every control); the shared `Keypad` primitive and `TWO_COLUMN_MIN_WIDTH`;
  and the retired `heading` id mapping to `autopilot`. Remove or update any sentence describing
  the Heading panel as current.

- [ ] **Step 2: `README.md`** — in the panels bullet replace "and Heading (write the autopilot
  heading bug, activate `sim/autopilot/heading_up`)" with: "and Autopilot (AP, FD and
  autothrottle engagement; HDG, NAV, APR, ALT, VS and FLC shown off, armed or engaged; heading,
  altitude, vertical speed and airspeed in knots or Mach set with steppers or the keypad, each
  change checked against what X-Plane reports)", keeping the sentence grammatical, and mention
  the panel order Instruments, Radios, Autopilot, Flight data where the README lists it.

- [ ] **Step 3: Smoke-test rows** — append after row 82, same table format:

```markdown
| 83 | C172 (GFC 700 or KAP 140), avionics on: open Autopilot | Annunciator reads "No modes engaged"; selectors match the aircraft's heading bug and altitude preselect | |
| 84 | Tap AP, then HDG | X-Plane's autopilot engages in HDG; the panel shows ● AP and ● HDG only after X-Plane does | |
| 85 | Tap AP again | The autopilot disconnects with one tap | |
| 86 | Altitude +1000 three times quickly | The preselect rises 3,000 ft, not 1,000 | |
| 87 | Turn the heading bug with the mouse in X-Plane | The panel's heading follows within a second | |
| 88 | Enter altitude 8500, Set; enter vertical speed 700 with ±, Set | Both reach X-Plane; VS shows −700 fpm | |
| 89 | Tune NAV1 to an ILS, tap APR | APR shows ○ (armed) then ● as it captures; GS arms and captures in the annunciator | |
| 90 | Tap APR with nothing tuned | "X-Plane did not engage APR. Check the navigation source." after about 3 s | |
| 91 | Airliner with autothrottle (default 737 or A330): A/T ARM off, then A/T | Note whether A/T engages from disarmed or needs ARM first | |
| 92 | C172: tap A/T | "… This aircraft may not have one." appears; note what `autothrottle_enabled` reports | |
| 93 | Airliner: Use Mach, then Mach +.01 | Selector shows M .xx and steps by .01 | |
| 94 | Smallest phone, portrait and landscape; a tablet in landscape | Steppers wrap without clipping; the keypad opens under the selector being typed | |
```

- [ ] **Step 4: Roadmap** — in `docs/roadmap/features/F-20-autopilot-panel.md` set
  `| Status | Done |` and add a references entry in the form F-21 uses for its spec link:
  `N. Design spec: docs/superpowers/specs/2026-10-06-autopilot-panel-design.md` (N = next number).
  Also replace the table rows marked "not identified; verify in `DataRefs.txt`" with the verified
  names from the spec.

- [ ] **Step 5: Gate and commit**

```bash
npm run format:check && npx jest
git add docs README.md
git commit -m "docs(autopilot): architecture, README, smoke-test rows, F-20 done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
