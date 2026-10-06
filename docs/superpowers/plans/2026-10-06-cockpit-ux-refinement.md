# R-01 Cockpit Look and Feel Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Avionix's avionics surfaces look and behave like real cockpit hardware: cockpit fonts and colours, lit mode keys, an FMA, PFD target bugs and haptics. App chrome becomes modern and native, and no existing behaviour regresses.

**Architecture:** First the new theme tokens (an avionics palette, B612 fonts, a `numeric()` helper) and two guarded platform adapters (fonts, haptics). On top of those sit hardware primitives (`AvionicsUnit`, `DisplayWindow`, a restyled `ControlButton` and `Keypad`) and an app-chrome `ActionButton`. Pure domain modules hold the new logic: FMA columns, box and disconnect state machines, bug placement and connection steps. Each panel is then restyled on the primitives, without changing its behaviour.

**Tech Stack:**
- Expo SDK 57, React Native 0.86, React 19, TypeScript strict, react-native-svg 15.
- New: `expo-font` (direct dependency; it already ships inside `expo`), `@expo-google-fonts/b612`, `@expo-google-fonts/b612-mono`, `expo-haptics`.
- Jest with the projects node, expo and web; RNTL 14 (`render`, `rerender` and `fireEvent` are awaited).

**Spec:** `docs/superpowers/specs/2026-10-06-cockpit-ux-refinement-design.md`

## Global Constraints

- **Gate** (run before every commit): `npm run typecheck`, `npm run lint`, `npm run format:check` and `npx jest` must all pass.
- **Commit trailer:** every commit message ends with this exact line:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Never launch** Xcode, Android Studio, simulators, emulators, `expo start` or EAS builds. Device checks are the user's job and go in the smoke-test doc.
- **Never render, log or serialise** any of these on any screen: a bearer token, pairing code value, URL, HTTP status, exception text, DataRef id or name, or protocol payload.
- **Every displayed state comes from X-Plane** (spec U1). A press never makes a key show engaged, armed or selected.
- **Colour is never the only cue** (U2).
- **Targets:** every pressable is at least 48 dp in both directions (U3). Keypad keys stay at `KEY_HEIGHT` 56.
- **Night palette:**
  - Every night colour (`colors`, `instrument`, `avionics`) has relative luminance of 0.30 or less.
  - Listed text pairs reach 4.5:1 (U4).
- **Degraded environments:** the app must render with fonts not loaded, fonts failing and no haptics module. Adapters never throw and never log (U5).
- **Accessibility labels** of existing controls stay word for word (U7). Only the visible "● " and "○ " prefixes go.
- **Reduced motion** stops flashing (U8).
- **Libraries:** zod v4 only for any new schema. Use path alias `@/` for imports.
- **Style:** follow the surrounding code. Use the `makeStyles(theme)` + `useThemedStyles` pattern, `as const` on literal style values, and comment density like the neighbouring files.

## Review Focus

1. **Fonts not loaded on first render, or never loaded.** Text must render in the system font with no warning. Test: render `ThemeProvider` with `fontsLoaded={false}` and assert that `theme.typography.fonts` is `{}` and `numeric()` returns `fontFamily: undefined` (Task 1).
2. **An FMA value that changes only its reference** (VS 500 → VS 600) must not re-box. Test in `fma.test.ts` (Task 7).
3. **A link drop with AP on, then a reconnect with AP off,** must not raise the disconnect annunciation. Test in `fma.test.ts` and in the panel UI test (Task 7).
4. **A heading bug across the 360/0 wrap:** current 355° with bug 005° sits +10°, not −350°. Test in `bugs.test.ts` (Task 9).
5. **Haptics when the preference is off, or with no native module,** fire nothing and throw nothing. Tests in Task 2.

---

### Task 1: Design tokens, fonts and the `numeric()` helper

**Files:**
- Modify: `package.json` (via `npx expo install expo-font @expo-google-fonts/b612 @expo-google-fonts/b612-mono`)
- Modify: `src/theme/tokens.ts`
- Create: `src/theme/fonts.ts`
- Create: `src/theme/typography.ts`
- Create: `src/platform/fonts.ts`
- Modify: `src/theme/theme-context.tsx`
- Modify: `src/app/AvionixApp.tsx`
- Test: `tests/unit/theme/tokens.test.ts`
- Test: `tests/ui/theme.test.tsx`
- Test: `tests/unit/theme/fonts.test.ts`

**Interfaces:**
- Produces: `Theme.avionics: AvionicsColors`, `ThemeColors.caution`, `InstrumentColors.selected | bug`, `Theme.typography.{fonts, displaySize, legendSize, captionSize}`, `numeric(theme, bold?)`, `avionicsText(theme, bold?)`, `ThemeProvider` prop `fontsLoaded?: boolean`, `withAvionicsFonts(theme)`, `loadAvionicsFonts(): Promise<boolean>`.

- [ ] **Step 1: Install the fonts.** Run `npx expo install expo-font @expo-google-fonts/b612 @expo-google-fonts/b612-mono`. Confirm `package.json` lists all three and that `npm ls expo-font` shows the version `expo` expects.

- [ ] **Step 2: Write the failing token tests.** Add these to `tests/unit/theme/tokens.test.ts`, reusing its `relativeLuminance` and `contrastRatio` helpers:

```ts
  it('defines the same avionics keys in every mode with hex values', () => {
    const keys = Object.keys(lightTheme.avionics).sort();
    for (const theme of ALL_THEMES) {
      expect(Object.keys(theme.avionics).sort()).toEqual(keys);
      for (const value of Object.values(theme.avionics)) {
        expect(value).toMatch(HEX);
      }
    }
  });

  it('keeps every avionics colour dark at night', () => {
    for (const [key, value] of Object.entries(nightTheme.avionics)) {
      expect({ key, luminance: relativeLuminance(value) <= 0.3 }).toEqual({ key, luminance: true });
    }
  });

  it('meets 4.5:1 for avionics text on glass and keys in every mode', () => {
    for (const theme of ALL_THEMES) {
      const a = theme.avionics;
      const pairs: Array<[string, string]> = [
        [a.legend, a.glass],
        [a.engaged, a.glass],
        [a.armed, a.glass],
        [a.selected, a.glass],
        [a.caution, a.glass],
        [a.warning, a.glass],
        [a.legend, a.keyFace],
        [theme.instrument.selected, theme.instrument.tape],
        [theme.colors.caution, theme.colors.surface],
        [theme.colors.caution, theme.colors.background],
      ];
      for (const [foreground, background] of pairs) {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(a.legendDim, a.keyFace)).toBeGreaterThanOrEqual(3);
      // Notices printed inside a unit (BodyText on a bezel) must stay readable.
      for (const foreground of [a.legend, a.legendDim, a.warning, a.engaged]) {
        expect(contrastRatio(foreground, a.bezel)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps engaged, selected, caution and warning distinct in every mode', () => {
    for (const theme of ALL_THEMES) {
      const { engaged, selected, caution, warning } = theme.avionics;
      expect(new Set([engaged, selected, caution, warning]).size).toBe(4);
    }
  });

  it('shares one avionics palette between light and dark, as a real panel is dark in daylight', () => {
    expect(darkTheme.avionics).toBe(lightTheme.avionics);
  });
```

  Update the existing test "shares spacing, radius, typography and touch scales across modes": it should still use `toEqual(lightTheme.typography)`, which now includes `fonts: {}`. Run `npx jest tests/unit/theme/tokens.test.ts`. Expected: FAIL (`avionics` is undefined).

- [ ] **Step 3: Add the tokens.** In `src/theme/tokens.ts`:

```ts
/**
 * R-01: the avionics hardware palette (bezels, glass, key caps, annunciator lights), in the meanings
 * of AC 25-11B and the Garmin guides: green engaged or active, white armed, cyan selected or being
 * tuned, amber caution, red warning. Light and dark share it, as a real panel is dark in daylight.
 */
export interface AvionicsColors {
  bezel: string;
  bezelEdge: string;
  glass: string;
  glassEdge: string;
  keyFace: string;
  keyFacePressed: string;
  legend: string;
  legendDim: string;
  engaged: string;
  armed: string;
  selected: string;
  caution: string;
  warning: string;
  lightOff: string;
}

export interface FontFamilies {
  avionics?: string;
  avionicsBold?: string;
  mono?: string;
  monoBold?: string;
}
```

  Extend `Theme`:
  - add `avionics: AvionicsColors`;
  - change `typography` to `{ headingSize: number; titleSize: number; bodySize: number; displaySize: number; legendSize: number; captionSize: number; fonts: FontFamilies }`.

  Set `typography` to `{ headingSize: 24, titleSize: 16, bodySize: 14, displaySize: 28, legendSize: 15, captionSize: 12, fonts: {} }`. Make it one shared object and do not freeze it with `as const` (`fonts` must be assignable).

  Add `caution` to `ThemeColors`: light `#8a5d00`, dark `#d29922`, night `#a07a2a`.

  Add to `InstrumentColors`:
  - `selected`: day `#2fd0f0`, night `#3f8f9a`;
  - `bug`: day `#ff8a1f`, night `#a0601e`.

  Day avionics, shared by `lightTheme` and `darkTheme` (the same object reference):
  `bezel #1d2126`, `bezelEdge #3a4048`, `glass #05080b`, `glassEdge #2b3138`, `keyFace #2c3138`, `keyFacePressed #181b20`, `legend #e8eaed`, `legendDim #8b949e`, `engaged #36d35a`, `armed #e8eaed`, `selected #2fd0f0`, `caution #ffb300`, `warning #ff4a3d`, `lightOff #3a4048`.

  Night avionics:
  `bezel #0c0a08`, `bezelEdge #2a2117`, `glass #000000`, `glassEdge #2a2117`, `keyFace #14100b`, `keyFacePressed #060504`, `legend #a88a60`, `legendDim #917752`, `engaged #4f9a3a`, `armed #a88a60`, `selected #3f8f9a`, `caution #b07a1e`, `warning #d0584a`, `lightOff #241c13`.

  Run the tests. Expected: PASS. If a listed pair misses its ratio, adjust only that hex and keep the hue family. Record any change in the report.

- [ ] **Step 4: Fonts module and typography helpers.** Create `src/theme/fonts.ts`:

```ts
import { B612_400Regular, B612_700Bold } from '@expo-google-fonts/b612';
import { B612Mono_400Regular, B612Mono_700Bold } from '@expo-google-fonts/b612-mono';

import type { FontFamilies } from '@/theme/tokens';

/**
 * B612 and B612 Mono: the open (OFL) fonts from Airbus's cockpit-display legibility research,
 * used for every avionics legend and live number (R-01). The keys are the family names.
 */
export const AVIONICS_FONT_ASSETS = {
  B612_400Regular,
  B612_700Bold,
  B612Mono_400Regular,
  B612Mono_700Bold,
};

export const AVIONICS_FAMILIES: Required<FontFamilies> = {
  avionics: 'B612_400Regular',
  avionicsBold: 'B612_700Bold',
  mono: 'B612Mono_400Regular',
  monoBold: 'B612Mono_700Bold',
};
```

  Create `src/theme/typography.ts`:

```ts
import type { TextStyle } from 'react-native';

import { AVIONICS_FAMILIES } from '@/theme/fonts';
import type { Theme } from '@/theme/tokens';

/** Every live number: tabular digits so a changing value never jitters, in B612 Mono once loaded. */
export function numeric(theme: Theme, bold = false): TextStyle {
  const { fonts } = theme.typography;
  return { fontFamily: bold ? fonts.monoBold : fonts.mono, fontVariant: ['tabular-nums'] };
}

/** Avionics legends and annunciations: B612 once loaded, the system font until then. */
export function avionicsText(theme: Theme, bold = false): TextStyle {
  const { fonts } = theme.typography;
  return { fontFamily: bold ? fonts.avionicsBold : fonts.avionics };
}

/** The same theme with the B612 families named; only once they have loaded (never a warning). */
export function withAvionicsFonts(theme: Theme): Theme {
  return { ...theme, typography: { ...theme.typography, fonts: AVIONICS_FAMILIES } };
}
```

  Create `src/platform/fonts.ts`:

```ts
import { AVIONICS_FONT_ASSETS } from '@/theme/fonts';

/**
 * Loads the avionics fonts. Never throws and never logs: a build or a platform without the font
 * loader keeps the system font (R-01 U5).
 */
export async function loadAvionicsFonts(): Promise<boolean> {
  try {
    // Required lazily: an old development build without the native loader must not fail at import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Font = require('expo-font') as typeof import('expo-font');
    await Font.loadAsync(AVIONICS_FONT_ASSETS);
    return true;
  } catch {
    return false;
  }
}
```

  If lint rejects the disable comment's rule name, use whichever rule the project's ESLint config actually reports, and note it.

- [ ] **Step 5: Wire up the provider and app.**
  - `ThemeProvider` gets `fontsLoaded?: boolean` (default `false`). The theme memo becomes:

    ```ts
    const base = themeForMode(resolveThemeMode(preference, systemScheme));
    return fontsLoaded ? withAvionicsFonts(base) : base;
    ```

    Add `fontsLoaded` to the dependency list.
  - `AvionixApp` holds `const [fontsLoaded, setFontsLoaded] = useState(false)`. An effect calls `loadAvionicsFonts().then((ok) => { if (!cancelled) setFontsLoaded(ok); })` with a cancel guard. It passes `fontsLoaded` to `ThemeProvider` and never blocks rendering.

- [ ] **Step 6: Tests for the fonts.**
  - In `tests/ui/theme.test.tsx`, add a Probe child that renders `JSON.stringify(theme.typography.fonts)`:
    - Without `fontsLoaded` it is `{}`, and `numeric(theme).fontFamily` is `undefined`.
    - With `fontsLoaded` it names `B612Mono_400Regular`.
  - Create `tests/unit/theme/fonts.test.ts` with three cases:
    1. `loadAvionicsFonts()` resolves `true` when `expo-font`'s `loadAsync` resolves (`jest.mock('expo-font', () => ({ loadAsync: jest.fn().mockResolvedValue(undefined) }))`).
    2. It resolves `false` and does not throw when `loadAsync` rejects.
    3. It resolves `false` when `require('expo-font')` throws (`jest.doMock('expo-font', () => { throw new Error('missing'); })` plus `jest.isolateModules`).
  - If importing `.ttf` assets fails under Jest, check `jest.config`'s asset handling (jest-expo maps assets). Fix it there, not by mocking the font packages away. Note the outcome in the report.

- [ ] **Step 7: Gate and commit.** Run the full gate, then:

```bash
git add -A && git commit -m "feat(theme): avionics palette, B612 fonts and the numeric() helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Haptics adapter and preference

**Files:**
- Modify: `package.json` (via `npx expo install expo-haptics`)
- Create: `src/platform/haptics.ts`
- Create: `src/platform/haptics.web.ts`
- Create: `src/features/haptics/haptics-preference.ts`
- Create: `src/features/haptics/HapticsProvider.tsx`
- Create: `src/features/haptics/HapticsToggle.tsx`
- Modify: `src/features/shell/AppShell.tsx` (wrap in `HapticsProvider`)
- Modify: `src/features/shell/SetupScreen.tsx` (add the toggle under Display)
- Test: `tests/unit/platform/haptics.test.ts`
- Test: `tests/ui/haptics.test.tsx`

**Interfaces:**
- Produces:
  - `haptics: { press(): void; failure(): void }` from `@/platform/haptics`;
  - `useHaptics(): { press(): void; failure(): void }` from `@/features/haptics/HapticsProvider`. It works without a provider; enabled is the default.
  - `HapticsProvider({ storage, children })`;
  - `useHapticsPreference(): { enabled, setEnabled }`;
  - `HAPTICS_STORAGE_KEY = 'avionix.haptics'`.

- [ ] **Step 1: Install haptics.** Run `npx expo install expo-haptics` and confirm `package.json`.

- [ ] **Step 2: Failing adapter tests** (`tests/unit/platform/haptics.test.ts`):
  1. With `jest.doMock('expo-haptics', () => ({ impactAsync: jest.fn().mockResolvedValue(undefined), notificationAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Error: 'error' } }))`:
     - `press()` calls `impactAsync('light')`;
     - `failure()` calls `notificationAsync('error')`.
  2. With `impactAsync` rejecting, `press()` neither throws nor produces an unhandled rejection. Await a microtask flush.
  3. With `jest.doMock('expo-haptics', () => { throw new Error('no native module'); })`, `press()` and `failure()` are silent no-ops.

  Load the module inside `jest.isolateModules` per case. Expected: FAIL (the module does not exist).

- [ ] **Step 3: Write the adapter.** `src/platform/haptics.ts`:

```ts
type HapticsModule = typeof import('expo-haptics');

let loaded: HapticsModule | null | undefined;

/** Required lazily and once: a development build without the native module just has no haptics. */
function haptic(): HapticsModule | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('expo-haptics') as HapticsModule;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

function fire(run: (module: HapticsModule) => Promise<void>): void {
  const module = haptic();
  if (module === null) {
    return;
  }
  try {
    run(module).catch(() => undefined);
  } catch {
    // A missing native method throws synchronously on some builds; haptics are never load-bearing.
  }
}

/** R-01: a light tick on every key, an error buzz when X-Plane refuses. Never throws, never logs. */
export const haptics = {
  press(): void {
    fire((module) => module.impactAsync(module.ImpactFeedbackStyle.Light));
  },
  failure(): void {
    fire((module) => module.notificationAsync(module.NotificationFeedbackType.Error));
  },
};
```

  `src/platform/haptics.web.ts` exports the same `haptics` object with empty methods and a one-line comment explaining that the web has no haptics.

- [ ] **Step 4: Preference and provider.**
  - `haptics-preference.ts` mirrors `src/theme/theme-preference.ts`:
    - stored value: zod schema `z.object({ enabled: z.boolean() })`;
    - `loadHapticsPreference(storage): Promise<boolean>` (default `true`, and `true` on any error or invalid JSON);
    - `saveHapticsPreference(storage, enabled)` swallows errors.
  - `HapticsProvider` loads the preference the way `ThemeProvider` does, with the same `touched` ref guard. It provides `{ enabled, setEnabled }`.
  - `useHaptics()` reads the context:
    - with no provider, enabled is `true`;
    - it returns `{ press, failure }`, which call `haptics.press()` or `haptics.failure()` only when enabled;
    - memoise it on `enabled`.
  - `HapticsToggle` is a `RadioChips` with the options On and Off; the accessibility labels are `Haptic feedback On` and `Haptic feedback Off`.
  - Wrap `AppShell`'s returned tree inside `UnitsProvider` with `<HapticsProvider storage={settingsStorage}>`.
  - In `SetupScreen`'s Display section, under `ThemeToggle`, add `<BodyText muted>Haptic feedback</BodyText><HapticsToggle />`.

- [ ] **Step 5: Provider UI test** (`tests/ui/haptics.test.tsx`). Use `jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }))`.
  1. The default is On: a probe calling `useHaptics().press()` calls the mock.
  2. Pressing `Haptic feedback Off` persists `{"enabled":false}` under `avionix.haptics`, and a later `press()` does not call the mock.
  3. A stored `{"enabled":false}` loads as Off.
  4. `useHaptics()` outside the provider still fires.

- [ ] **Step 6: Gate and commit:** `feat(haptics): guarded haptics adapter with an on/off preference` plus the trailer.

---

### Task 3: Hardware primitives (AvionicsUnit, DisplayWindow, key-style ControlButton, Keypad)

**Files:**
- Create: `src/features/panels/primitives/AvionicsUnit.tsx`
- Create: `src/features/panels/primitives/DisplayWindow.tsx`
- Create: `src/features/panels/primitives/LightBar.tsx`
- Create: `src/theme/surface-context.tsx`
- Modify: `src/theme/primitives.tsx` (`BodyText` reads the bezel context)
- Modify: `src/features/panels/primitives/ControlButton.tsx`
- Modify: `src/features/panels/primitives/Keypad.tsx`
- Modify: `src/features/panels/primitives/useReadBack.ts`
- Modify: `src/features/panels/autopilot/ModeButtons.tsx` (`○` prefix → `annunciation`)
- Modify: `src/features/panels/autopilot/EngageRow.tsx` (`selected` → `annunciation`)
- Test: `tests/ui/panel-primitives.test.tsx`
- Test: `tests/ui/autopilot-panel.test.tsx`
- Test: `tests/ui/read-back.test.tsx`

**Interfaces:**
- Consumes: `Theme.avionics`, `numeric`, `avionicsText` (Task 1); `useHaptics` (Task 2).
- Produces:
  - `AvionicsUnit({ label?, testID?, style?, children })`.
  - `DisplayWindow({ text, role: 'active' | 'standby' | 'selected' | 'plain', size?: 'large' | 'small', caption?, stale?, tuning?, tone?: 'warning', testID? })`. `tone="warning"` overrides the role colour with `avionics.warning`; it is used for an emergency squawk.
  - `LightBar({ state: 'engaged' | 'armed' | 'off' })`, rendered with `testID={`light-bar-${state}`}`.
  - `ControlButton` gains `annunciation?: 'engaged' | 'armed' | 'off'`, `children?: React.ReactNode` and `style?: StyleProp<ViewStyle>`. `style` applies to its outer wrap `View`, so a key can take `flex: 1` in a row. `selected` remains: `selected === true` with no `annunciation` draws `engaged`, and `selected === false` draws `off`.

- [ ] **Step 1: Failing primitive tests** in `tests/ui/panel-primitives.test.tsx`. Follow the file's existing harness for rendering inside a `PanelContext`.
  1. `ControlButton` with `annunciation="engaged"` renders `light-bar-engaged` inside the button. `armed` renders `light-bar-armed`, `off` renders `light-bar-off`, and with no prop and no `selected` there is no light bar.
  2. `selected` maps to the bars: `selected` true gives `light-bar-engaged` and `selected={false}` gives `light-bar-off`. The visible text is the plain label: change the existing assertion at line 392 from `'● ALT'` to `'ALT'` plus `light-bar-engaged`.
  3. With children (`<Text>118.000</Text>`), the children render, the label text does not, and the accessible name is `accessibilityLabel ?? label`.
  4. A press calls `useHaptics().press` once and then `onPress`. Mock `@/platform/haptics` as in Task 2. A disabled button fires neither.
  5. Confirm still works: the first press shows `Tap again: <label>` and fires haptics; the second press calls `onPress`.
  6. A `Keypad` digit press fires `press` and `onDigit`.
  7. `DisplayWindow`:
     - role `active` uses `avionics.engaged` as its text colour; read it with `toHaveStyle`;
     - `selected` uses `avionics.selected`;
     - `stale` uses `avionics.legendDim`;
     - `tuning` renders `testID="display-window-tuning"`;
     - `tone="warning"` uses `avionics.warning`.
  8. Read-back: when a watch settles `notAdopted`, `useHaptics().failure` fires exactly once, across later re-renders. Add this to `tests/ui/read-back.test.tsx` using its existing harness.

- [ ] **Step 1b: Bezel surface for text.** Create `src/theme/surface-context.tsx`, which exports `OnBezelContext` (a React context, default `false`) and `useOnBezel()`. `BodyText` in `src/theme/primitives.tsx` reads it. On a bezel it uses avionics colours:
  - plain: `avionics.legend`;
  - muted: `avionics.legendDim`;
  - danger: `avionics.warning`;
  - success: `avionics.engaged`.

  Off a bezel it behaves exactly as today. `AvionicsUnit` wraps its children in `<OnBezelContext.Provider value>`. Tests:
  - `BodyText tone="danger"` inside an `AvionicsUnit` has the colour `avionics.warning`;
  - outside one, the colour is `colors.danger`;
  - muted inside one uses `legendDim`.

  This one change makes every notice, availability reason, read-back sentence and `FailureNotice` (built on `BodyText`) readable inside units in every theme. Do not restyle those call sites one by one.

- [ ] **Step 2: Implement `LightBar`, `AvionicsUnit` and `DisplayWindow`** per spec section 2.
  - **`LightBar`** is a `View`, 3 dp tall, with `alignSelf: 'stretch'`, `marginHorizontal: 8` and `borderRadius: 1.5`:
    - engaged: `backgroundColor: avionics.engaged`;
    - armed: `borderWidth: 1.5, borderColor: avionics.armed, backgroundColor: 'transparent'`;
    - off: `backgroundColor: avionics.lightOff`.

    It is hidden from accessibility, because the button's label already carries the state.
  - **`AvionicsUnit`** has the `bezel` background, a 1 dp `bezelEdge` border, `borderRadius: 12`, `padding: 12` and `gap: theme.spacing.sm`. Its optional label is a `Text` with `avionicsText(theme, true)`, `fontSize: captionSize`, `color: legendDim` and `letterSpacing: 1`, with `accessibilityRole="header"`.
  - **`DisplayWindow`** has the `glass` background, a 1 dp `glassEdge` border, `borderRadius: 6`, `paddingHorizontal: 10`, `paddingVertical: 6` and `alignItems: 'flex-end'`, so digits align right like an LCD.
    - The caption sits above the value, aligned to the start.
    - The text uses `numeric(theme, true)` at `displaySize` for large and `titleSize` for small.
    - `tuning` adds an absolutely positioned 2 dp `selected` border inset by 2, with `pointerEvents="none"` and `testID="display-window-tuning"`.
    - It sets `accessible={false}`: the pressable or summary around it speaks.

- [ ] **Step 3: Restyle `ControlButton`.** Keep all logic. Replace the styles with the key style from spec section 2:
  - The face is `keyFace` with a 1 dp `bezelEdge` border, `borderRadius: 6`, `minHeight`/`minWidth` of `touch.minTarget`, `paddingHorizontal: theme.spacing.md`, `paddingTop: 6`, `paddingBottom: 8` and `gap: 6`. Items are centred.
  - Use `Pressable`'s `style={({ pressed }) => [...]}`: while pressed, the face is `keyFacePressed` with `transform: [{ translateY: 1 }]`.
  - Disabled: a transparent face and the legend in `legendDim`.
  - Armed confirm: `borderWidth: 2, borderColor: avionics.caution`.
  - The legend uses `avionicsText(theme, true)`, `fontSize: legendSize` and `color: legend`.
  - Render `<LightBar>` above the legend when an annunciation applies.
  - Drop the `● ` prefix logic. `shown` is `Tap again: <label>` when armed, otherwise `label`.
  - When `children` are given and not armed, render them in place of the legend `Text`; when armed, render the `Tap again` legend so the confirm stays readable.
  - `onPress` calls `press()` from `useHaptics()` first, then the existing logic.
  - Notices under the key (`availability.reason`, `OperationNotice`) keep `BodyText`.

- [ ] **Step 4: Restyle `Keypad`.** Keys get the key face, the pressed style and haptics `press()`. Labels use `numeric(theme, true)` at `displaySize` (the legends ⌫, Clear and ± use the same). Height stays at `KEY_HEIGHT`.

- [ ] **Step 5: Haptic failure in `useReadBack`.** Count the failures settled: when a settle produces a non-null message, increment a `failures` number held in the same state update (store it alongside `watches` as `{ watches, failures }`). Add `useEffect(() => { if (failures > 0) failure(); }, [failures, failure])`, where `failure` comes from `useHaptics()`. The effect fires once per new failure and never on mount with zero.

- [ ] **Step 6: Mode and engage call sites.**
  - In `ModeButtons`, pass `label={spec.label}` (no `○`) and `annunciation={state}`, where `state` is `'engaged' | 'armed' | 'off'`. Keep `selected={state === 'engaged'}` for `accessibilityState`.
  - In `EngageRow`, pass `annunciation={button.selected ? 'engaged' : 'off'}`.
  - Update `tests/ui/autopilot-panel.test.tsx` lines 103, 105, 165 and 202:
    - `'● HDG'` → assert `'HDG'` plus `light-bar-engaged` within that button;
    - `'○ NAV'` → `light-bar-armed`.

    Use `within(screen.getByLabelText('HDG mode, engaged'))`. The exact labels are in the existing test file.

- [ ] **Step 7: Gate and commit:** `feat(panels): hardware key primitives with annunciator light bars and haptics` plus the trailer.

---

### Task 4: App chrome: ActionButton, compact status bar, switcher icons

**Files:**
- Create: `src/theme/ActionButton.tsx`
- Create: `src/features/shell/PanelIcon.tsx`
- Modify: `src/features/health/LinkStatusBar.tsx`
- Modify: `src/features/shell/PanelSwitcher.tsx`
- Modify: `src/features/shell/AppShell.tsx` (status bar wrap padding only if needed)
- Modify: `src/features/connection/ConnectionForm.tsx`
- Modify: `src/features/health/DiagnosticsScreen.tsx`
- Modify: `src/features/aircraft/CompatibilityScreen.tsx`
- Modify: `src/features/aircraft/AircraftSummary.tsx`
- Modify: `src/features/connection/DiscoveredConnectors.tsx` (only if it uses a native `Button`)
- Test: `tests/ui/link-status-bar.test.tsx`
- Test: `tests/ui/app-shell.test.tsx`
- Test: a new `tests/ui/action-button.test.tsx`
- Test: existing screen tests (mechanical fixes only)

**Interfaces:**
- Consumes: `colors.caution`, `numeric` (Task 1).
- Produces:
  - `ActionButton({ title, onPress, variant?: 'primary' | 'secondary' | 'destructive', disabled?, busy?, accessibilityLabel?, testID? })`. The accessible name is `accessibilityLabel ?? title` with role `button`, as React Native's `Button` provides, so `getByRole('button', { name })` and `getByText(title)` keep working.
  - `PanelIcon({ id, color, size? })`.
  - `statusLamp(state, live): 'live' | 'notLive' | 'down'`, exported from `LinkStatusBar.tsx`.

- [ ] **Step 1: Failing tests.**
  - `action-button.test.tsx`:
    - the primary variant renders the title, and its role `button` has the title as its name;
    - `disabled` sets `accessibilityState.disabled` and does not call `onPress`;
    - `busy` sets `accessibilityState.busy`, shows an `ActivityIndicator` and does not call `onPress`;
    - the destructive variant draws its text in `colors.danger`.
  - `link-status-bar.test.tsx`, added:
    - `statusLamp`: `connected` + live → `live`; `connected` + not live → `notLive`; `connecting`, `pairing` and `reconnecting` → `notLive`; `disconnected` and `error` → `down`.
    - The bar renders `testID="status-lamp-live"`, `-notLive` or `-down`.
    - The visible text is `Connected · Live` when live. For reconnecting it is `Reconnecting · attempt 2 of 5`, from `snapshot.reconnectAttempt` and `health.reconnectBudget`.
    - The age text is shown only when not live.
    - The accessibility label is unchanged from today's sentence.
  - Adjust existing assertions that looked for the separate `Live` or `Not live` text nodes to the new combined line. Keep every accessibility-label assertion as it is.

- [ ] **Step 2: Implement `ActionButton`.** Use `Pressable` with:
  - a 48 dp minimum height and width, `borderRadius: 10` and `paddingHorizontal: theme.spacing.lg`;
  - pressed opacity 0.75;
  - primary: filled with `colors.primary`, text in `colors.onPrimary` and bold;
  - secondary: a 1 dp `colors.border` outline, text in `colors.text`;
  - destructive: a 1 dp `colors.danger` outline, text in `colors.danger`;
  - disabled: opacity 0.45, with the label staying the same colour so it remains readable;
  - busy: an `ActivityIndicator` in the text colour before the title.

- [ ] **Step 3: Replace native `Button`s** in ConnectionForm (Connect: primary, Disconnect: destructive, Pair: primary, Cancel: secondary), DiagnosticsScreen, CompatibilityScreen, AircraftSummary and DiscoveredConnectors, if any. Keep titles and accessibility labels identical. Row layout: `flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm`.

- [ ] **Step 4: Compact `LinkStatusBar`.** Make it a single row, with `minHeight: touch.minTarget`, `paddingVertical: theme.spacing.sm`, `borderBottomWidth: StyleSheet.hairlineWidth`, `borderColor: colors.border` and `backgroundColor: colors.surface`. Remove the card radius and border.
  - **Lamp:** a 12 dp view with `testID={`status-lamp-${lamp}`}`:
    - live: a filled circle in `colors.success`;
    - notLive: a 2 dp ring in `colors.caution`;
    - down: a `Text` "✕" in `colors.danger`, bold, size 14.
  - **Text:**
    - reconnecting: `Reconnecting · attempt N of M`;
    - connected: `${LINK_LABEL.connected} · ${health.live ? 'Live' : ACTIVITY_LABEL[health.activity]}`;
    - otherwise: `LINK_LABEL[state]`.
  - **Right:** when not live, `updated ${age}` in muted `numeric()`, where `age` comes from `formatAge`. Check `formatAge`'s output shape and phrase it so it reads naturally; if it already says "ago", do not add another.
  - **Accessibility:** keep the label exactly as it is today.
  - In `AppShell`'s `status-bar-wrap`, remove the left and right padding that the card needed if the bar now spans the full width. Keep the safe-area insets as padding inside the bar instead, and make sure `marginBottom` is gone.

- [ ] **Step 5: Switcher icons.**
  - `PanelIcon` draws 22 dp SVGs with `react-native-svg` and `stroke={color}`, `strokeWidth` 2 and no fill except where noted:
    - `instruments`: a circle with a horizontal line through the centre and the lower half filled at 0.35 opacity;
    - `radios`: three concentric arcs above a dot;
    - `autopilot`: a rounded rectangle with the SVG text "AP" at size 9, bold;
    - `flight-data`: three horizontal lines;
    - `setup`: a gear (an 8-tooth polygon around a circle);
    - any other id: a small dot.
  - In `PanelSwitcher`, each item is a column in portrait (icon over a label at `captionSize` + 1) and a row in landscape.
  - **Selected item:** a 3 dp `primary` indicator on the content-facing edge (top in the portrait bar, right in the landscape rail), with the icon and label in `primary` and the label bold. Remove the full `primary` fill.
  - **Unselected:** `colors.textMuted`.
  - Keep `testID`, role, label and `accessibilityState` as they are.

- [ ] **Step 6: Gate and commit:** `feat(shell): compact status lamp, switcher icons and native-feeling action buttons` plus the trailer.

---

### Task 5: Setup: connection steps and pairing-code boxes

**Files:**
- Create: `src/domain/connection/connection-steps.ts`
- Create: `src/features/connection/ConnectionSteps.tsx`
- Create: `src/features/connection/PairingCodeBoxes.tsx`
- Modify: `src/features/connection/ConnectionForm.tsx`
- Modify: `src/features/shell/SetupScreen.tsx`
- Test: `tests/unit/domain/connection-steps.test.ts`
- Test: `tests/ui/setup-screen.test.tsx`

**Interfaces:**
- Consumes: `ConnectionState`, `LINK_LABEL` (LinkStatusBar), `ActionButton` (Task 4) and `numeric` (Task 1).
- Produces: `connectionSteps(state, live, hasHost): ConnectionStep[]` and `stepsLabel(steps, detail): string`.

- [ ] **Step 1: Failing domain tests.** Create `tests/unit/domain/connection-steps.test.ts` covering every state:

```ts
import { connectionSteps, stepsLabel } from '@/domain/connection/connection-steps';

const states = (s: ReturnType<typeof connectionSteps>) => s.map((step) => step.state);

describe('connectionSteps', () => {
  it('starts at Find with no saved address', () => {
    expect(states(connectionSteps('disconnected', false, false))).toEqual(['current', 'todo', 'todo', 'todo']);
  });
  it('starts at Connect when an address is known', () => {
    expect(states(connectionSteps('disconnected', false, true))).toEqual(['done', 'current', 'todo', 'todo']);
  });
  it('treats a failed attempt like a stop at Connect', () => {
    expect(states(connectionSteps('error', false, true))).toEqual(['done', 'current', 'todo', 'todo']);
  });
  it('is at Connect while connecting or reconnecting', () => {
    for (const state of ['connecting', 'reconnecting'] as const) {
      expect(states(connectionSteps(state, false, true))).toEqual(['done', 'current', 'todo', 'todo']);
    }
  });
  it('is at Pair while pairing', () => {
    expect(states(connectionSteps('pairing', false, true))).toEqual(['done', 'done', 'current', 'todo']);
  });
  it('is at Live while connected but not live', () => {
    expect(states(connectionSteps('connected', false, true))).toEqual(['done', 'done', 'done', 'current']);
  });
  it('is all done when connected and live', () => {
    expect(states(connectionSteps('connected', true, true))).toEqual(['done', 'done', 'done', 'done']);
  });
  it('names the labels in order', () => {
    expect(connectionSteps('disconnected', false, false).map((s) => s.label)).toEqual(['Find', 'Connect', 'Pair', 'Live']);
  });
  it('speaks the current step', () => {
    expect(stepsLabel(connectionSteps('pairing', false, true), 'Waiting for the pairing code')).toBe(
      'Step 3 of 4, Pair: Waiting for the pairing code',
    );
    expect(stepsLabel(connectionSteps('connected', true, true), 'Connected')).toBe('All steps done: Connected');
  });
});
```

- [ ] **Step 2: Implement.**

```ts
import type { ConnectionState } from '@/domain/connection/connection-state';

export type StepState = 'done' | 'current' | 'todo';

export interface ConnectionStep {
  key: 'find' | 'connect' | 'pair' | 'live';
  label: string;
  state: StepState;
}

const STEPS = [
  { key: 'find', label: 'Find' },
  { key: 'connect', label: 'Connect' },
  { key: 'pair', label: 'Pair' },
  { key: 'live', label: 'Live' },
] as const;

/** Where the pilot is on the way to live values (R-01 Setup); 4 means every step is done. */
function currentIndex(state: ConnectionState, live: boolean, hasHost: boolean): number {
  switch (state) {
    case 'disconnected':
    case 'error':
      return hasHost ? 1 : 0;
    case 'connecting':
    case 'reconnecting':
      return 1;
    case 'pairing':
      return 2;
    case 'connected':
      return live ? 4 : 3;
  }
}

export function connectionSteps(
  state: ConnectionState,
  live: boolean,
  hasHost: boolean,
): ConnectionStep[] {
  const current = currentIndex(state, live, hasHost);
  return STEPS.map((step, index) => ({
    ...step,
    state: index < current ? 'done' : index === current ? 'current' : 'todo',
  }));
}

export function stepsLabel(steps: readonly ConnectionStep[], detail: string): string {
  const index = steps.findIndex((step) => step.state === 'current');
  if (index === -1) {
    return `All steps done: ${detail}`;
  }
  return `Step ${index + 1} of ${steps.length}, ${steps[index].label}: ${detail}`;
}
```

- [ ] **Step 3: UI.**
  - **`ConnectionSteps`** is a row of four items with connector lines between them. Each item is a glyph over a label:
    - ✓ done, in `colors.success`;
    - ● current, in `colors.primary`;
    - ○ to come, in `colors.textMuted`.

    The row is one accessible element whose label comes from `stepsLabel(steps, LINK_LABEL[state])`, with `testID="connection-steps"`.
  - **`ConnectionForm`** gets a `live: boolean` prop. It renders `ConnectionSteps` at the top of its Section, using `hasHost = props.host.trim() !== ''`.
  - **`PairingCodeBoxes({ code, length })`** draws `length` boxes in a row:
    - each 44 × 56, with a 1 dp `colors.border` border and `borderRadius: 8`;
    - the digit in `numeric(theme, true)` at `displaySize`;
    - the next empty box has a 2 dp `colors.primary` border.

    In `PairingFields`, place the boxes in a container with the existing `ThemedTextInput` absolutely filling it. The input keeps `testID="pairing-code"`, its accessibility label and all its props, plus `style={{ opacity: 0.02, color: 'transparent' }}`. Do not use opacity 0: some Android versions then refuse focus. `caretHidden` is set.
  - **SetupScreen order:** heading → Diagnostics (when shown) → ConnectionForm (with `live={snapshot.health.live}`) → DiscoveredConnectors → AircraftSummary → Compatibility (when open) → Display → Units → Panels.
  - **Address subtitle:** above the host field, add the subtitle `BodyText` "Or enter the address of the X-Plane PC". Keep the existing "X-Plane host (IP or hostname on your LAN)" text so the existing tests find it.

- [ ] **Step 4: UI tests** in `tests/ui/setup-screen.test.tsx`:
  - the steps label reads `Step 1 of 4, Find: Not connected` on a fresh screen with no host;
  - typing digits into `pairing-code` fills the boxes, read through text `1`, `2`, …;
  - existing pairing tests keep passing unchanged.

- [ ] **Step 5: Gate and commit:** `feat(setup): connection steps and pairing-code boxes` plus the trailer.

---

### Task 6: Radios and transponder as avionics units

**Files:**
- Modify: `src/features/panels/radios/RadioRow.tsx`
- Modify: `src/features/panels/radios/TransponderSection.tsx`
- Modify: `src/features/panels/radios/RadiosPanel.tsx` (wrap the sections; spacing)
- Modify: `src/features/panels/radios/EntryPad.tsx` (the "New" box uses `DisplayWindow` with role `selected`)
- Test: `tests/ui/radios-panel.test.tsx`
- Test: `tests/ui/radios-transponder.test.tsx`
- Test: `tests/ui/radios-entry.test.tsx`

**Interfaces:**
- Consumes: `AvionicsUnit`, `DisplayWindow`, `ControlButton` with `children`, `annunciation` and `selected` (Task 3).

- [ ] **Step 1: Failing tests.**
  - **Radios:**
    - The active value is a `DisplayWindow` with `testID={`radio-active-${key}`}`, coloured `avionics.engaged`.
    - The standby is inside the button labelled `Enter <label> standby` and has `display-window-tuning`.
    - The unit header text is the radio label (for example `COM1`).
    - The details line (ident, DME, CRS) is coloured `avionics.selected`.
  - **Transponder:**
    - The code window has `testID="xpdr-code"`.
    - The selected mode key shows `light-bar-engaged` and the others show `light-bar-off`.
    - With code 7700, the window text is `avionics.warning` and the caption contains `EMERG`.
    - While X-Plane reports identing, the text `IDENT` shows in `avionics.engaged`.
  - Existing tests that find by accessibility label or by visible frequency or code text keep working. Fix any that relied on the old row structure.

- [ ] **Step 2: RadioRow.**
  - The outer element is an `AvionicsUnit` with `label={radio.label}` and `testID={`radio-row-${radio.key}`}`.
  - The first line is a row with `alignItems: 'center'`:
    - a summary `View` (accessible, with today's label) containing `DisplayWindow role="active" caption="ACT"`, `stale={!link.valuesCurrent}` and `flex: 1`;
    - the swap `ControlButton` (legend `⇄`);
    - the standby `ControlButton` with children `DisplayWindow role="standby" caption="STBY" tuning stale={...}` and `flex: 1`.
  - Use `onLayout` to measure the row width. Below 360 dp, stack it vertically: active, swap, standby.
  - "not live" stays as `BodyText` under the row.
  - The details use mono `numeric()` at `titleSize`, coloured `avionics.selected`.
  - Notices are unchanged and stay as `BodyText`. Inside the unit, Task 3's bezel context gives them avionics colours (danger becomes `avionics.warning`). Add one assertion that a radio's read-back message has the colour `avionics.warning`.

- [ ] **Step 3: TransponderSection** becomes an `AvionicsUnit` labelled `XPDR`.
  - The code `ControlButton` (label and accessibility as today) has children `DisplayWindow size="large" role="plain"`.
    - Caption: `${modeText}` normally, or `${modeText} · EMERG` with `tone="warning"` when `isEmergencySquawk(code)`.
    - `testID="xpdr-code"`.
  - The `IDENT` annunciation is a small `Text` in `avionics.engaged`, using the avionics bold font, inside the unit next to the window, shown while identing.
  - The mode keys pass `selected` as today, so the light bars appear through Task 3's mapping.
  - "IDENT sent" keeps its wording in `avionics.legend`.

- [ ] **Step 4: EntryPad.** The "New" box becomes `DisplayWindow role="selected" caption="NEW"`. Its `testID` and accessibility stay the same: keep any existing `testID` on the wrapper.

- [ ] **Step 5: Gate** (the touch-target guard must pass) **and commit:** `feat(radios): radio and transponder units with active, standby and tuning windows` plus the trailer.

---

### Task 7: FMA domain, component and AP-disconnect annunciation

**Files:**
- Modify: `src/domain/autopilot/modes.ts` (export `LATERAL`, `VERTICAL`, `ARMABLE`; no behaviour change)
- Create: `src/domain/autopilot/fma.ts`
- Create: `src/features/panels/autopilot/useFma.ts`
- Create: `src/features/panels/autopilot/Fma.tsx`
- Create: `src/hooks/useReducedMotion.ts`
- Modify: `src/features/panels/autopilot/AutopilotPanel.tsx` (replace `Annunciator` with `Fma`)
- Delete: `src/features/panels/autopilot/Annunciator.tsx`
- Test: `tests/unit/domain/autopilot/fma.test.ts`
- Test: `tests/ui/autopilot-panel.test.tsx`

**Interfaces:**
- Consumes: `ModeStatuses`, `modeState`, `autothrottleWord`, `autothrottleArmed`, `annunciationText` and `formatMach` (selectors.ts); `useHaptics` (Task 2); `avionics` tokens (Task 1).
- Produces:
  - `fmaColumns(input: FmaInput): FmaColumns`, `nextBoxState`, `isBoxed`, `nextDisconnect`, `disconnectShowing`, `FMA_BOX_MS`, `AP_DISCONNECT_MS`, `EMPTY_BOX_STATE` and `EMPTY_DISCONNECT`.
  - `useFma(): { columns, boxed(slot), disconnected, acknowledge, hasValue }`.
  - `<Fma compact? />`, used by Task 9's `PfdView`.

- [ ] **Step 1: Failing domain tests** (`tests/unit/domain/autopilot/fma.test.ts`). Build `ModeStatuses` with every key `null`, then override.
  1. `fmaColumns` with `hdg: 2`, `nav: 1`, `alt: 2`, `gs: 1`, autothrottle 1, ap true and fd true gives:
     - `lateral { active: 'HDG', armed: ['NAV'] }`;
     - `vertical { active: 'ALT', reference: null, armed: ['GS'] }`;
     - `autothrottle { active: 'SPD', armed: false }`;
     - `ap: true`, `fd: true`.
  2. With `vs: 2` and `vsFpm: -512`: `vertical.active` is `'VS'` and `reference` is `'−500FPM'` (U+2212, rounded to 100). With `+480` the reference is `'500FPM'`. With `vsFpm: null` the reference is `null`.
  3. With `flc: 2`: speed 120.4 in knots gives the reference `'120KT'`; speed 0.784 with `speedIsMach` gives `'M.78'`.
  4. Autothrottle 0 (armed only) gives `autothrottle { active: null, armed: true }`; −1 or null gives `{ active: null, armed: false }`.
  5. The precedence for both axes is unchanged from `annunciationText`. Example: `apr: 2` with `nav: 2` → `APR`; `gs: 2` with `alt: 2` → `GS`.
  6. Lateral armed contains only `NAV` and `APR`, in that order; vertical armed contains only `ALT` and `GS`.
  7. `nextBoxState`:
     - first call from `EMPTY_BOX_STATE` → nothing boxed;
     - a later change of `lateral.active` from `HDG` to `NAV` at t → `isBoxed(state, 'lateral', t + 9_999)` is true and `isBoxed(state, 'lateral', t + 10_000)` is false;
     - a change only of `vertical.reference` → no box;
     - a slot going to null → not boxed;
     - `ap` false → true → boxed `ap`.
  8. `nextDisconnect`:
     - ap true then false while current → `disconnectShowing(state, t)` is true, true at t + 4_999 and false at t + 5_000;
     - ap true, then a sample with `valuesCurrent: false`, then ap false while current → never showing;
     - ap null (no data) → not showing;
     - `acknowledge` (`{ ...state, since: null }`) clears it.

  Run: `npx jest tests/unit/domain/autopilot/fma.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement `fma.ts`.**

```ts
import { formatMach } from '@/domain/autopilot/selectors';
import {
  ARMABLE,
  LATERAL,
  type ModeStatuses,
  VERTICAL,
  autothrottleArmed,
  autothrottleWord,
  modeState,
} from '@/domain/autopilot/modes';

/** A new active mode is boxed this long, as Boeing's FMA does (R-01). */
export const FMA_BOX_MS = 10_000;
/** An autopilot disconnect is annunciated this long, as Garmin's normal disconnect is. */
export const AP_DISCONNECT_MS = 5_000;

const MINUS = '−';
const LATERAL_ARMABLE = new Set(['nav', 'apr']);

export interface FmaInput {
  statuses: ModeStatuses;
  autothrottle: number | null;
  ap: boolean;
  fd: boolean;
  vsFpm: number | null;
  speed: number | null;
  speedIsMach: boolean;
}

export interface FmaColumns {
  autothrottle: { active: string | null; armed: boolean };
  lateral: { active: string | null; armed: readonly string[] };
  vertical: { active: string | null; reference: string | null; armed: readonly string[] };
  ap: boolean;
  fd: boolean;
}

function engaged(axis: typeof LATERAL, statuses: ModeStatuses): string | null {
  return axis.find(([key]) => modeState(statuses[key]) === 'engaged')?.[1] ?? null;
}

function verticalReference(active: string | null, input: FmaInput): string | null {
  if (active === 'VS' && input.vsFpm !== null) {
    const hundreds = Math.round(input.vsFpm / 100) * 100;
    return `${hundreds < 0 ? MINUS : ''}${Math.abs(hundreds)}FPM`;
  }
  if (active === 'FLC' && input.speed !== null) {
    return input.speedIsMach ? `M${formatMach(input.speed)}` : `${Math.round(input.speed)}KT`;
  }
  return null;
}

/** The G1000-style status bar: autothrottle, lateral, AP/FD and vertical, engaged over armed. */
export function fmaColumns(input: FmaInput): FmaColumns {
  const { statuses } = input;
  const armed = ARMABLE.filter(([key]) => modeState(statuses[key]) === 'armed');
  const lateralActive = engaged(LATERAL, statuses);
  const verticalActive = engaged(VERTICAL, statuses);
  return {
    autothrottle: {
      active: autothrottleWord(input.autothrottle),
      armed: autothrottleArmed(input.autothrottle) && autothrottleWord(input.autothrottle) === null,
    },
    lateral: {
      active: lateralActive,
      armed: armed.filter(([key]) => LATERAL_ARMABLE.has(key)).map(([, label]) => label),
    },
    vertical: {
      active: verticalActive,
      reference: verticalReference(verticalActive, input),
      armed: armed.filter(([key]) => !LATERAL_ARMABLE.has(key)).map(([, label]) => label),
    },
    ap: input.ap,
    fd: input.fd,
  };
}

export type FmaSlot = 'autothrottle' | 'lateral' | 'vertical' | 'ap';
const SLOTS: readonly FmaSlot[] = ['autothrottle', 'lateral', 'vertical', 'ap'];

export interface BoxState {
  /** The active mode per slot last seen; null before the first sample, so nothing starts boxed. */
  seen: Readonly<Record<FmaSlot, string | null>> | null;
  changedAt: Readonly<Partial<Record<FmaSlot, number>>>;
}

export const EMPTY_BOX_STATE: BoxState = { seen: null, changedAt: {} };

/** The mode word only: a new VS target is not a new mode, so it never re-boxes. */
function slotValues(columns: FmaColumns): Record<FmaSlot, string | null> {
  return {
    autothrottle: columns.autothrottle.active,
    lateral: columns.lateral.active,
    vertical: columns.vertical.active,
    ap: columns.ap ? 'AP' : null,
  };
}

export function nextBoxState(prev: BoxState, columns: FmaColumns, now: number): BoxState {
  const values = slotValues(columns);
  if (prev.seen === null) {
    return { seen: values, changedAt: {} };
  }
  let changedAt: Partial<Record<FmaSlot, number>> | null = null;
  for (const slot of SLOTS) {
    if (values[slot] === prev.seen[slot]) {
      continue;
    }
    changedAt ??= { ...prev.changedAt };
    if (values[slot] === null) {
      delete changedAt[slot];
    } else {
      changedAt[slot] = now;
    }
  }
  return changedAt === null ? prev : { seen: values, changedAt };
}

export function isBoxed(state: BoxState, slot: FmaSlot, now: number): boolean {
  const at = state.changedAt[slot];
  return at !== undefined && now - at < FMA_BOX_MS;
}

export interface DisconnectState {
  /** AP as last seen with current values; null after a link loss, so a gap never counts. */
  lastAp: boolean | null;
  since: number | null;
}

export const EMPTY_DISCONNECT: DisconnectState = { lastAp: null, since: null };

export function nextDisconnect(
  prev: DisconnectState,
  ap: boolean | null,
  valuesCurrent: boolean,
  now: number,
): DisconnectState {
  if (!valuesCurrent || ap === null) {
    return prev.lastAp === null && prev.since === null ? prev : EMPTY_DISCONNECT;
  }
  if (prev.lastAp === true && !ap) {
    return { lastAp: false, since: now };
  }
  if (prev.lastAp === ap) {
    return prev;
  }
  return { lastAp: ap, since: ap ? null : prev.since };
}

export function disconnectShowing(state: DisconnectState, now: number): boolean {
  return state.since !== null && now - state.since < AP_DISCONNECT_MS;
}
```

  In `modes.ts`, change `const LATERAL`, `const VERTICAL` and `const ARMABLE` to `export const`. Nothing else changes. Run the tests. Expected: PASS.

- [ ] **Step 3: `useReducedMotion`** (`src/hooks/useReducedMotion.ts`):
  - It reads `AccessibilityInfo.isReduceMotionEnabled()` once, with a cancel guard and errors treated as `false`.
  - It subscribes to `AccessibilityInfo.addEventListener('reduceMotionChanged', set)` and removes the listener on unmount.
  - It returns a boolean, defaulting to `false`.

- [ ] **Step 4: `useFma`** (`src/features/panels/autopilot/useFma.ts`). It reads everything the old `Annunciator` read, plus:
  - `ap` from `D.autopilotServos === 1`, or `null` when it has no value;
  - `fd` from `D.flightDirectorBars === 1`;
  - `vsFpm` from `D.verticalSpeedDial`;
  - `speed` from `D.airspeedDial`;
  - `speedIsMach` from `D.airspeedIsMach === 1`.

  Check `GENERIC_DATAREFS` for the exact key names of the dial DataRefs and use whatever the file defines. Read through `autopilotNumber(snapshot, name)`.

  It holds `boxState` and `disconnect` in state and updates them with React's adjust-while-rendering pattern, as `useReadBack` does:
  - compute `nextBoxBase = link.valuesCurrent ? nextBoxState(boxState, columns, now) : EMPTY_BOX_STATE`;
  - compute `nextDisc = nextDisconnect(disconnect, apOrNull, link.valuesCurrent, now)`;
  - call `setState` only when the result is not the same reference.

  It fires `useHaptics().failure()` in a `useEffect` keyed on `disconnect.since`, when `since` becomes a number.

  It returns:
  - `columns`;
  - `boxed: (slot) => isBoxed(boxState, slot, now)`;
  - `disconnected: disconnectShowing(disconnect, now)`;
  - `acknowledge: () => setDisconnect((d) => ({ ...d, since: null }))`;
  - `text`: `annunciationText(...)`, unchanged, for the accessibility label;
  - `hasValue`.

- [ ] **Step 5: The `Fma` component.**
  - **Container:** a glass container (`avionics.glass` with a 1 dp `glassEdge` border, `borderRadius: 6`) with `testID="autopilot-fma"`, `flexDirection: 'row'` and four columns separated by 1 dp `glassEdge` lines.
  - **Columns, in order:**
    1. A/T: the active word as `A/T ${word}` in `engaged`, or `A/T` in `armed` on row 2 when armed only.
    2. Lateral: the active mode in `engaged` on row 1 and the armed list joined by two spaces in `armed` on row 2.
    3. Status: `AP` and `FD` in `engaged` when on; while `disconnected`, `AP` in `caution`, flashing.
    4. Vertical: `${active} ${reference}` in `engaged`, or the bare active mode when there is no reference, with armed in `armed` on row 2.
  - **Text:** each cell uses `avionicsText(theme, true)` at `legendSize`, with `minHeight` 20 per row.
  - **Missing:** when a column has nothing, show `—` in `legendDim`, or nothing on row 2.
  - **Boxed slot:** a `View` around the row-1 text with a 1.5 dp `engaged` border, `borderRadius: 2` and `paddingHorizontal: 3`, with `testID={`fma-box-${slot}`}`.
  - **Flash:** use an `Animated.Value` loop that toggles opacity between 1 and 0.15 every 250 ms while `disconnected` and not reduced motion. Stop the loop on cleanup. Under reduced motion, keep opacity 1. The test reads `testID="fma-ap-disconnect"`.
  - **Press:** the whole FMA is a `Pressable` (≥ 48 dp tall) with role `text`. While `disconnected`, tapping it calls `acknowledge`.
  - **Accessibility:** `accessibilityLabel={`Autopilot modes: ${text}${disconnected ? ', autopilot disconnected' : ''}${notLive ? ', not live' : ''}`}`. When `disconnected`, add `accessibilityHint="Tap to acknowledge"`.
  - **Not live:** `BodyText muted` "not live" outside the glass, as the old Annunciator did. When not live, all text is `legendDim`.
  - **Compact:** the `compact` prop (used on the PFD) uses `captionSize` text and no outside "not live" text, because the PFD fades as a whole.

- [ ] **Step 6: Panel and UI tests.**
  - In `AutopilotPanel`, replace `<Annunciator />` with `<Fma />` and delete `Annunciator.tsx`.
  - Update every test reference to `autopilot-annunciator` to `autopilot-fma`. Keep the accessibility-label assertions unchanged.
  - Add these tests in `tests/ui/autopilot-panel.test.tsx`, using the file's `rerender` helper with new telemetry and an advancing `now`:
    1. Render with HDG engaged; nothing is boxed. Rerender with NAV engaged → `fma-box-lateral` is present. Rerender at +10 s → it is gone.
    2. AP 1 → 0 while connected → `fma-ap-disconnect` is shown, the label ends with ", autopilot disconnected" and the haptics `failure` mock was called once. Press the FMA → it is gone.
    3. AP 1, then a not-current snapshot (`activity: 'stalled'`), then current with AP 0 → no `fma-ap-disconnect`.
    4. With `AccessibilityInfo.isReduceMotionEnabled` mocked to resolve `true` (`jest.spyOn`), the disconnect shows with opacity 1. Assert that `Animated.loop` was not started by spying on it, or check the style opacity. Pick whichever is deterministic.
    5. VS 500 → 600 with VS engaged → no `fma-box-vertical`.

- [ ] **Step 7: Gate and commit:** `feat(autopilot): FMA with new-mode boxes and an AP-disconnect annunciation` plus the trailer.

---

### Task 8: Autopilot controller and selector units

**Files:**
- Modify: `src/features/panels/autopilot/AutopilotPanel.tsx`
- Modify: `src/features/panels/autopilot/EngageRow.tsx`
- Modify: `src/features/panels/autopilot/ModeButtons.tsx`
- Modify: `src/features/panels/autopilot/SelectorRow.tsx`
- Modify: `src/features/panels/autopilot/SelectorPad.tsx` (only for the "New" window, as in Task 6)
- Test: `tests/ui/autopilot-panel.test.tsx`
- Test: `tests/ui/autopilot-selectors.test.tsx`
- Test: `tests/ui/touch-target-guard.test.tsx` (must pass; add a wide-layout case if the guard has none for the autopilot)

**Interfaces:**
- Consumes: Tasks 3 and 7. `TWO_COLUMN_MIN_WIDTH` (720) from `src/domain/panels/device-layout.ts`.

- [ ] **Step 1: Failing tests.**
  - The controller unit header `AUTOPILOT` and the selectors unit header `SELECTORS` exist.
  - **Phone layout** (width 390): the key rows are `[AP, FD, A/T ARM, A/T]`, `[HDG, NAV, APR]` and `[ALT, VS, FLC]`. Assert by `testID`s `ap-row-engage`, `ap-row-lateral` and `ap-row-vertical`, each containing its keys' labels.
  - **Wide layout** (width 1024): one container, `ap-controller-wide`, holds the three groups in the order lateral, engage, vertical.
  - The selector value is a `DisplayWindow` inside the button `Enter heading` (the existing label), coloured `avionics.selected` and captioned `HDG`. Airspeed captions read `IAS` in knots and `MACH` in Mach.
  - The unit switch key's legend is `IAS⇄M`, and its accessibility label stays `Use Mach` or `Use knots`.
  - Every existing behaviour test passes unchanged.

- [ ] **Step 2: Layout.**
  - `AutopilotPanel` measures its content width with `onLayout`; until it is measured, use `useWindowDimensions().width`, as `InstrumentsPanel` does.
  - The `Fma` sits on top, then `<AvionicsUnit label="AUTOPILOT">` containing the keys.
  - `EngageRow` and `ModeButtons` gain a `layout: 'phone' | 'wide'` prop or are composed by the panel. Choose the smallest change that gives the testIDs above.
  - **Phone:** each row is `flexDirection: 'row'` with `gap: touch.spacing`, and each key has `flex: 1`, through the `style` prop from Task 3.
  - **Wide:** three groups in one row, each group a row of keys, with groups separated by `theme.spacing.lg`.
  - Read-back messages and notices stay below the keys.
  - The plugin-override notice stays above the controller.

- [ ] **Step 3: Selector rows**, inside `<AvionicsUnit label="SELECTORS">`. Each row is:
  - the caption and value `DisplayWindow` inside the existing enter `ControlButton` (children), with `flex: 1`;
  - then a stepper group of four keys, each `minWidth: touch.minTarget` (legends from `stepLabel` as today);
  - the unit switch key for airspeed (legend `IAS⇄M`, accessibility label as today).

  The keypad entry renders under its row as today. On phones the stepper group wraps under the value.

- [ ] **Step 4: Gate and commit:** `feat(autopilot): GMC-style controller and selector windows` plus the trailer.

---

### Task 9: PFD targets, FMA on the PFD, six-pack heading bug, instrument fonts

**Files:**
- Create: `src/domain/instruments/bugs.ts`
- Create: `src/features/panels/instruments/useAutopilotTargets.ts`
- Modify: `src/features/panels/instruments/InstrumentsPanel.tsx` (descriptor features)
- Modify: `src/features/panels/instruments/pfd/PfdView.tsx`
- Modify: `src/features/panels/instruments/pfd/AltitudeTape.tsx`
- Modify: `src/features/panels/instruments/pfd/SpeedTape.tsx`
- Modify: `src/features/panels/instruments/pfd/HeadingTape.tsx`
- Modify: `src/features/panels/instruments/pfd/VsiScale.tsx`
- Modify: `src/features/panels/instruments/six-pack/HeadingIndicator.tsx`
- Modify: `src/features/panels/instruments/six-pack/SixPackView.tsx` (pass the bug)
- Modify: `src/features/panels/instruments/svg-parts.tsx` (fontFamily on `DigitalWindow`)
- Test: `tests/unit/domain/instruments/bugs.test.ts`
- Test: `tests/ui/instruments-pfd.test.tsx`
- Test: `tests/ui/instruments-six-pack.test.tsx`
- Test: `tests/integration/flight-instruments.test.ts` (the demand includes the autopilot DataRefs)

**Interfaces:**
- Consumes: `Fma compact` (Task 7) and `instrument.selected` / `instrument.bug` (Task 1).
- Produces:
  - `tapeBug(target, current, unitsPerValue, halfSpan): { offset, parked }`;
  - `headingDelta(target, current)`;
  - `useAutopilotTargets(): { altitude: number | null; heading: number | null; speed: { value: number; mach: boolean } | null; verticalSpeed: number | null; fmaShown: boolean }`.

- [ ] **Step 1: Failing domain tests** (`bugs.test.ts`):

```ts
import { headingDelta, tapeBug } from '@/domain/instruments/bugs';

describe('tapeBug', () => {
  it('places an on-scale target by its distance from the current value', () => {
    expect(tapeBug(5_200, 5_000, 0.3, 120)).toEqual({ offset: 60, parked: false });
    expect(tapeBug(4_800, 5_000, 0.3, 120)).toEqual({ offset: -60, parked: false });
  });
  it('is on scale exactly at the edge', () => {
    expect(tapeBug(5_400, 5_000, 0.3, 120)).toEqual({ offset: 120, parked: false });
  });
  it('parks just beyond the edge', () => {
    expect(tapeBug(5_401, 5_000, 0.3, 120)).toEqual({ offset: 120, parked: true });
    expect(tapeBug(-2_000, 5_000, 0.3, 120)).toEqual({ offset: -120, parked: true });
  });
  it('handles a negative vertical speed', () => {
    expect(tapeBug(-500, 0, 0.096, 96)).toEqual({ offset: -48, parked: false });
  });
});

describe('headingDelta', () => {
  it('takes the short way across north', () => {
    expect(headingDelta(5, 355)).toBe(10);
    expect(headingDelta(355, 5)).toBe(-10);
  });
  it('gives 180 for the opposite heading', () => {
    expect(headingDelta(180, 0)).toBe(180);
  });
  it('treats 360 as 0', () => {
    expect(headingDelta(360, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Implement `bugs.ts`.**

```ts
/** A target on a linear scale, in view units from the centre line; parked at the edge beyond it. */
export function tapeBug(
  target: number,
  current: number,
  unitsPerValue: number,
  halfSpan: number,
): { offset: number; parked: boolean } {
  const raw = (target - current) * unitsPerValue;
  if (raw > halfSpan) {
    return { offset: halfSpan, parked: true };
  }
  if (raw < -halfSpan) {
    return { offset: -halfSpan, parked: true };
  }
  return { offset: raw, parked: false };
}

/** The signed short way from the current heading to the target, in −180 < d ≤ 180. */
export function headingDelta(target: number, current: number): number {
  const delta = ((((target - current) % 360) + 540) % 360) - 180;
  return delta === -180 ? 180 : delta;
}
```

  The `-0` result: if `headingDelta(360, 0)` yields `-0`, normalise it with `+ 0` so `toBe(0)` passes.

- [ ] **Step 3: Data.**
  - `INSTRUMENTS_PANEL.features` adds: `FEATURE_AUTOPILOT`, `FEATURE_FLIGHT_DIRECTOR`, `FEATURE_AUTOTHROTTLE`, `FEATURE_HEADING_CONTROL`, `FEATURE_ALTITUDE_SELECT`, `FEATURE_VERTICAL_SPEED_SELECT`, `FEATURE_AIRSPEED_SELECT` and the six `ap-mode-*` features. Use the exported constants in `generic.ts`; check their exact names.
  - `useAutopilotTargets` reads through `autopilotNumber`, returns `null` for missing bindings or no flight, and sets:
    - `speed` only while FLC is engaged (`speedStatus` reads 2) or the autothrottle is engaged (`autothrottleEngaged`);
    - `verticalSpeed` only while VS is engaged;
    - `fmaShown` true when any of the autopilot features' bindings is not `missing`.
  - Update the integration test that asserts the instruments demand so it includes these DataRefs.

- [ ] **Step 4: Drawing**, all in `ink.selected` and faded by the existing face opacity rules (the tapes are `InstrumentFace` children). The PFD boxes use `NOT_LIVE_OPACITY` like the existing boxes.
  - **AltitudeTape:** new prop `selected: number | null`.
    - A cyan box across the top of the tape: `Rect` at y 0, height 20, fill `ink.face`, a 1.5 stroke in `ink.selected`, and the text `groupThousands(Math.round(selected))` at size 13 in cyan.
    - The bug at `y = CY - tapeBug(selected, feet, PX, 120 - 20).offset`: a cyan notched shape (a `Polygon` 0,−6 6,−6 6,6 0,6 3,0, mirrored onto the tape's left edge). When `feet` is null, draw the box only.
    - Its spoken addition is `, selected ${groupThousands(...)} feet`. Extend `describeAltitude` or append in the tape label; keep the existing label words first.
  - **SpeedTape:** new prop `selected: { value: number; mach: boolean } | null`.
    - The box at the top: `Math.round(value)` in knots, or `M${formatMach(value)}`.
    - The bug only in knots.
    - Spoken: `, selected ${n} knots` or `, selected Mach ${formatMach}`.
  - **HeadingTape:** new prop `bug: number | null`.
    - The bug at `x = CX + tapeBug(headingDelta(bug, degrees), 0, PX, 100).offset`: a cyan notch at the tape's bottom edge.
    - Spoken: `, heading bug ${String(normalised).padStart(3, '0')}`.
  - **PfdView:**
    - Render `<Fma compact />` above the first row when `targets.fmaShown`, with width equal to the PFD width.
    - In the turn-rate row's left 60-unit slot, render the `HDG ${padded}°` box (cyan text in `numeric(theme, true)` at `14 * k`, glass background) with `testID="pfd-heading-bug"`, when `targets.heading !== null`.
  - **VsiScale:** new prop `bug: number | null`. A cyan triangle at `CY - vsiScaleOffset(bug, HALF)`, drawn only when non-null.
  - **HeadingIndicator** (six-pack): new prop `bug: number | null`. An orange (`ink.bug`) notch on the card ring at the bug's bearing, rotated with the card: inside the rotating `G`, at angle `bug`. The heading label adds `, heading bug ${padded}`.
  - **Fonts:** every `SvgText` in `pfd/*` and `six-pack/*`, and `DigitalWindow`, gets `fontFamily={theme.typography.fonts.monoBold}` for numbers, or `fonts.avionicsBold` for letters such as N, E, S and W. When the font is undefined, pass nothing: `{...(family ? { fontFamily: family } : {})}`.

- [ ] **Step 5: UI tests.**
  - The PFD renders `autopilot-fma` when autopilot bindings resolve, and does not when they are all missing.
  - The altitude tape's label contains `selected 8,000 feet` when the dial reads 8000.
  - `pfd-heading-bug` shows `HDG 270°`.
  - The speed box is shown only with FLC 2 or A/T 1.
  - The VSI bug is shown only with VS 2.
  - The six-pack heading label contains `heading bug 270`.
  - Everything is hidden with no flight.

- [ ] **Step 6: Gate and commit:** `feat(instruments): autopilot targets and FMA on the PFD, DG heading bug, cockpit fonts` plus the trailer.

---

### Task 10: Flight data and readouts in cockpit typography

**Files:**
- Modify: `src/features/panels/flight-data/rowStyles.ts`
- Modify: `src/features/panels/flight-data/FlightDataStrip.tsx`
- Modify: `src/features/panels/flight-data/FlightValue.tsx`
- Modify: `src/features/panels/flight-data/DestinationBlock.tsx`
- Modify: `src/features/panels/primitives/Readout.tsx`
- Modify: `src/features/panels/instruments/BaroControls.tsx` (the value text only)
- Test: the existing flight-data tests (they must pass); add one style assertion

**Interfaces:**
- Consumes: `numeric` and `typography.captionSize` (Task 1).

- [ ] **Step 1: Failing test.** In `tests/ui/flight-data-strip.test.tsx`, a strip value `Text` has `fontVariant: ['tabular-nums']` and a field label has `fontSize: 12`.
- [ ] **Step 2: Implement.**
  - Labels: `captionSize`, uppercase through the label string (the label constants may already be short; apply `textTransform: 'uppercase'`), `letterSpacing: 0.5` and muted colour.
  - Values: `numeric(theme, true)`.
  - The `Readout` value and the BaroControls setting value: `numeric(theme, true)`.
  - No other change.
- [ ] **Step 3: Gate and commit:** `feat(flight-data): cockpit typography for live values` plus the trailer.

---

### Task 11: Documentation and smoke-test rows

**Files:**
- Modify: `docs/testing/xplane-smoke-test.md` (rows after the last one, today 94)
- Modify: `docs/architecture.md` (theme, platform adapters, the FMA domain)
- Modify: `docs/xplane.md` (the Instruments panel now subscribes to the autopilot DataRefs and why)
- Modify: `README.md` (feature bullets: cockpit look, haptics, FMA, PFD targets; note the new development build for haptics)
- Modify: `docs/development.md` (if it lists native modules or build steps: add `expo-haptics` and the rebuild note)

- [ ] **Step 1: Smoke rows.** Add numbered rows in the file's existing format:
  1. B612 fonts render on iOS and Android (legends, frequencies, PFD numbers).
  2. Haptics: a tick on a key press after installing the new development build, and an error buzz when a change is refused (for example, setting a frequency X-Plane rejects). With "Haptic feedback Off", nothing.
  3. An old development build without haptics: the app works and is silent.
  4. Radio units: ACT green, STBY with a cyan frame, ⇄ swaps, details in cyan.
  5. Transponder: the mode light bar follows X-Plane; 7700 shows EMERG in red.
  6. Mode keys: the light bar is filled when engaged, hollow when armed (arm NAV with a VOR tuned) and unlit when off.
  7. FMA: engaging HDG then NAV boxes the new lateral mode for about 10 s.
  8. AP disconnect from X-Plane's yoke button: "AP" flashes amber for 5 s, there is an error buzz and a tap acknowledges. With iOS Reduce Motion on, it is steady.
  9. PFD: the selected altitude box and bug move with X-Plane's ALT knob; the heading bug and HDG box follow the HDG knob; the speed box shows with FLC; the VS bug shows with VS.
  10. Six-pack DG: the orange bug follows the HDG knob.
  11. Status bar: a green dot when live; an amber ring while reconnecting (pause X-Plane's network or stop the connector); a red ✕ when disconnected; the age shows only when not live.
  12. Setup: the steps advance Find → Connect → Pair → Live; the pairing boxes fill as you type.
  13. Night theme: nothing glows; every new element is dim amber, green or cyan.
- [ ] **Step 2: Other docs.** Write each change as plain, short sentences in the existing tone.
- [ ] **Step 3: Gate and commit:** `docs(ux): R-01 architecture, X-Plane notes, README and smoke-test rows` plus the trailer.
