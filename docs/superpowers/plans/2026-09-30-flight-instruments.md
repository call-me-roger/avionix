# Primary Flight Instruments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Instruments panel showing the six primary flight instruments as a PFD or a six-pack, drawn on the device from X-Plane's DataRefs, with an altimeter setting in inHg or hPa.

**Architecture:** Pure geometry, labels, baro and presentation logic live in `src/domain/instruments/`; a single hook reads every value once per render and hands primitives to `React.memo` instruments drawn with `react-native-svg`. The presentation choice is persisted per aircraft type by a provider mounted in `AppShell`, mirroring `UnitsProvider`. The only write is the altimeter setting, through the existing `ControlButton`/`ValueEntry` primitives.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict (`noUncheckedIndexedAccess`), zod v4, react-native-svg (Expo-pinned), Jest 29 via jest-expo (projects `node`, `expo`, `web`), @testing-library/react-native 14 (`render`, `fireEvent`, `unmount` are awaited; `toHaveTextContent` is exact by default).

**Spec:** `docs/superpowers/specs/2026-09-30-flight-instruments-design.md`

## Global Constraints

- Gate before every commit: `npm run typecheck && npm run lint && npm run format:check && npm test` — all green.
- Never launch Xcode, Android Studio, simulators, emulators, `expo start`, or EAS builds. The user verifies on devices.
- Never render, log or serialise a bearer token or a pairing code; no URL, HTTP status, exception text or protocol payload on any screen.
- No DataRef id or raw protocol text on the Instruments panel (R10). Failures only through `FailureNotice`.
- The panel writes only `sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot` and activates no command (R12).
- Never smooth, interpolate, extrapolate or animate a value; draw each value as received (R2, R7).
- Values are never zeroed and never replaced by a default; a missing DataRef marks only its instrument (R9).
- Freshness is the link's (`usePanel().link.valuesCurrent`), never a sample's `receivedAt`.
- zod v4. Path alias `@/` → `src/`.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` exactly.
- Match the surrounding code: doc comments explain *why*, in the same density as neighbouring files; no new comment noise.
- Every touch target keeps the 48 dp minimum (`theme.touch.minTarget`).
- Night palette: every instrument colour has relative luminance ≤ 0.30.

## Review Focus

1. Heading across north (355° → 005°): tapes, card labels and the accessible label must wrap, never show 360 ticks twice or a gap — pinned in Task 3 (`headingTicks` at 358) and Task 4 (`describeHeading(0)` → 360).
2. Values outside the drawable range (negative IAS on the ground, altitude below sea level, VSI beyond ±2,000, pitch beyond ±90): pointers peg, digits show the true number — pinned in Task 3 (clamp tests) and Task 6 (the digital text for 2,500 fpm).
3. Rapid −/+ presses on the altimeter while a write is pending: every baro control is disabled until the read-back arrives, so presses cannot stack on a stale value — pinned in Task 8.
4. The aircraft changes mid-session (a new ICAO type with its own stored choice or a different engine type): the presentation re-resolves without a restart — pinned in Task 9.
5. A non-numeric or non-finite sample for a float DataRef (NaN, a string): the instrument shows "no value", never NaN text or a pointer at 0 — pinned in Task 6.

---

### Task 1: react-native-svg and instrument colours

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install react-native-svg`)
- Modify: `src/theme/tokens.ts`
- Modify: `tests/unit/theme/tokens.test.ts`
- Create: `tests/ui/svg-smoke.test.tsx`
- Create: `tests/web/svg-smoke.web.test.tsx`

**Interfaces:**
- Produces: `Theme.instrument: InstrumentColors` with keys `face, tape, sky, ground, horizon, marking, pointer, arcWhite, arcGreen, arcYellow, arcRed, flag, flagText` (all hex strings). Instruments read it with `useTheme().instrument`.

- [ ] **Step 1: Install the dependency**

Run: `npx expo install react-native-svg`
Expected: `package.json` gains `"react-native-svg"` at the version Expo SDK 57 pins; `package-lock.json` updated. Do not run `expo start` or any build. `jest.config.js` already lists `react-native-svg` in `transformIgnorePatterns`; do not change it unless a test in Step 3 proves it necessary.

- [ ] **Step 2: Write the failing tests**

`tests/ui/svg-smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

describe('react-native-svg on native', () => {
  it('renders a drawing inside an accessible view', async () => {
    await render(
      <View accessible accessibilityLabel="drawing">
        <Svg width={100} height={100} viewBox="0 0 200 200">
          <Circle cx={100} cy={100} r={90} fill="#000000" />
        </Svg>
      </View>,
    );
    expect(screen.getByLabelText('drawing')).toBeTruthy();
  });
});
```

`tests/web/svg-smoke.web.test.tsx` (mirror how `tests/web/app-shell.web.test.tsx` renders with react-dom; read it first and use the same render helper and assertions style):

```tsx
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Svg, { Circle } from 'react-native-svg';

describe('react-native-svg on the web', () => {
  it('renders an svg element', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Svg width={100} height={100} viewBox="0 0 200 200">
          <Circle cx={100} cy={100} r={90} fill="#000000" />
        </Svg>,
      );
    });
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('circle')).not.toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });
});
```

Add to `tests/unit/theme/tokens.test.ts`, inside the existing `describe`, next to the night-palette test:

```ts
  it('keeps every instrument colour dark at night', () => {
    for (const [key, value] of Object.entries(nightTheme.instrument)) {
      expect({ key, luminance: relativeLuminance(value) <= 0.3 }).toEqual({
        key,
        luminance: true,
      });
    }
  });

  it('draws instruments on a dark face in every theme, as a real panel does', () => {
    for (const theme of [lightTheme, darkTheme, nightTheme]) {
      expect(contrastRatio(theme.instrument.marking, theme.instrument.face)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(theme.instrument.flagText, theme.instrument.flag)).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('keeps the failure flag apart from the yellow and green arcs', () => {
    for (const theme of [lightTheme, darkTheme, nightTheme]) {
      const { flag, arcYellow, arcGreen } = theme.instrument;
      expect(new Set([flag, arcYellow, arcGreen]).size).toBe(3);
    }
  });
```

(Import `lightTheme`/`darkTheme` if the file does not already.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest tests/unit/theme/tokens.test.ts tests/ui/svg-smoke.test.tsx tests/web/svg-smoke.web.test.tsx`
Expected: the tokens tests FAIL (`instrument` undefined); the svg smoke tests PASS (or fail only on a transform problem — fix that in `jest.config.js` minimally if so).

- [ ] **Step 4: Add the colours**

In `src/theme/tokens.ts` add, above `Theme`:

```ts
/**
 * F-10 instruments. A real panel's instruments are dark in daylight too, so light and dark share
 * one set; night keeps every colour at relative luminance 0.30 or less, like the rest of its
 * palette. A stale instrument is drawn through `flag` (the red-X failure flag pilots know).
 */
export interface InstrumentColors {
  face: string;
  tape: string;
  sky: string;
  ground: string;
  horizon: string;
  marking: string;
  pointer: string;
  arcWhite: string;
  arcGreen: string;
  arcYellow: string;
  arcRed: string;
  flag: string;
  flagText: string;
}
```

Add `instrument: InstrumentColors;` to `Theme` (after `colors`). Then:

```ts
const dayInstrument: InstrumentColors = {
  face: '#000000',
  tape: '#2b2f36',
  sky: '#2f7fd1',
  ground: '#8a5a2b',
  horizon: '#ffffff',
  marking: '#ffffff',
  pointer: '#ffd200',
  arcWhite: '#ffffff',
  arcGreen: '#2fbf4a',
  arcYellow: '#f2c200',
  arcRed: '#e5322d',
  flag: '#e5322d',
  flagText: '#ffffff',
};
```

`lightTheme` and `darkTheme` get `instrument: dayInstrument`. `nightTheme` gets:

```ts
  instrument: {
    face: '#000000',
    tape: '#14100b',
    sky: '#1d3a5c',
    ground: '#3e2a17',
    horizon: '#a88a60',
    marking: '#a88a60',
    pointer: '#a8862a',
    arcWhite: '#8a7a64',
    arcGreen: '#4f7a35',
    arcYellow: '#a08a2a',
    arcRed: '#b0473b',
    flag: '#d0584a',
    flagText: '#000000',
  },
```

If a contrast assertion fails for a night pair, adjust only the night value, keeping luminance ≤ 0.30, and note the change in your report.

- [ ] **Step 5: Run the tests, then the gate**

Run: `npx jest tests/unit/theme tests/ui/svg-smoke.test.tsx tests/web/svg-smoke.web.test.tsx` → PASS.
Run the full gate. Any test that builds a `Theme` literal must gain `instrument`; fix those by spreading an existing theme, not by duplicating colours.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/theme/tokens.ts tests/unit/theme/tokens.test.ts tests/ui/svg-smoke.test.tsx tests/web/svg-smoke.web.test.tsx
git commit -m "feat(instruments): add react-native-svg and instrument colours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pressure unit and altimeter-setting domain

**Files:**
- Modify: `src/domain/units/units.ts`
- Modify: `src/application/unit-preferences.ts`
- Modify: `src/features/units/UnitsSection.tsx`
- Create: `src/domain/instruments/baro.ts`
- Test: `tests/unit/domain/units.test.ts`, `tests/unit/application/unit-preferences.test.ts`, `tests/ui/units.test.tsx`, create `tests/unit/domain/instruments/baro.test.ts`

**Interfaces:**
- Produces (units): `PRESSURE_UNITS = ['inHg', 'hPa'] as const`, `type PressureUnit`, `UnitPreferences.pressure`, `DEFAULT_UNITS.pressure === 'inHg'`, `UNIT_LABEL.pressure`.
- Produces (`@/domain/instruments/baro`): `HPA_PER_INHG`, `STD_INHG`, `BARO_RANGE`, `isStandard(inHg)`, `toInHg(value, unit)`, `baroValue(inHg, unit)`, `baroShort(inHg, unit)`, `formatBaro(inHg, unit)`, `baroWords(inHg, unit)`, `baroStep(currentInHg, unit, direction)`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/instruments/baro.test.ts`:

```ts
import {
  BARO_RANGE,
  HPA_PER_INHG,
  STD_INHG,
  baroShort,
  baroStep,
  baroValue,
  baroWords,
  formatBaro,
  isStandard,
  toInHg,
} from '@/domain/instruments/baro';

describe('altimeter setting', () => {
  it('recognises standard pressure within half a hundredth', () => {
    expect(isStandard(STD_INHG)).toBe(true);
    expect(isStandard(29.925)).toBe(true);
    expect(isStandard(29.915)).toBe(true);
    expect(isStandard(29.93)).toBe(false);
    expect(isStandard(29.91)).toBe(false);
  });

  it('converts hectopascals to inches and back', () => {
    expect(toInHg(29.92, 'inHg')).toBe(29.92);
    expect(toInHg(1013, 'hPa')).toBeCloseTo(1013 / HPA_PER_INHG, 6);
    expect(baroValue(29.92, 'hPa')).toBe(1013);
    expect(baroValue(29.9234, 'inHg')).toBe(29.92);
  });

  it('formats the reading in the chosen unit, marking standard', () => {
    expect(formatBaro(29.92, 'inHg')).toBe('29.92 inHg STD');
    expect(formatBaro(30.12, 'inHg')).toBe('30.12 inHg');
    expect(formatBaro(29.92, 'hPa')).toBe('1013 hPa STD');
    expect(formatBaro(1020 / HPA_PER_INHG, 'hPa')).toBe('1020 hPa');
    expect(baroShort(30.12, 'inHg')).toBe('30.12');
    expect(baroShort(1020 / HPA_PER_INHG, 'hPa')).toBe('1020');
  });

  it('words the reading for a screen reader', () => {
    expect(baroWords(30.12, 'inHg')).toBe('30.12 inches');
    expect(baroWords(29.92, 'inHg')).toBe('29.92 inches, standard');
    expect(baroWords(1020 / HPA_PER_INHG, 'hPa')).toBe('1020 hectopascals');
  });

  it('steps a hundredth of an inch from the read-back value', () => {
    expect(baroStep(29.92, 'inHg', 1)).toBe(29.93);
    expect(baroStep(29.92, 'inHg', -1)).toBe(29.91);
    // A read-back that is not on a hundredth steps from the nearest one.
    expect(baroStep(29.9234, 'inHg', 1)).toBe(29.93);
  });

  it('steps a whole hectopascal, landing on whole hectopascals', () => {
    const next = baroStep(29.92, 'hPa', 1);
    expect(next).toBeCloseTo(1014 / HPA_PER_INHG, 6);
    expect(baroValue(next, 'hPa')).toBe(1014);
    expect(baroValue(baroStep(next, 'hPa', -1), 'hPa')).toBe(1013);
  });

  it('never steps outside the range', () => {
    expect(baroStep(BARO_RANGE.inHg.max, 'inHg', 1)).toBe(BARO_RANGE.inHg.max);
    expect(baroStep(BARO_RANGE.inHg.min, 'inHg', -1)).toBe(BARO_RANGE.inHg.min);
    expect(baroValue(baroStep(BARO_RANGE.hPa.max / HPA_PER_INHG, 'hPa', 1), 'hPa')).toBe(
      BARO_RANGE.hPa.max,
    );
  });

  it('keeps the two ranges equivalent', () => {
    expect(Math.round(BARO_RANGE.inHg.min * HPA_PER_INHG)).toBe(BARO_RANGE.hPa.min);
    expect(Math.round(BARO_RANGE.inHg.max * HPA_PER_INHG)).toBe(BARO_RANGE.hPa.max);
  });
});
```

In `tests/unit/domain/units.test.ts` add:

```ts
  it('defaults pressure to inches of mercury and labels both units', () => {
    expect(DEFAULT_UNITS.pressure).toBe('inHg');
    expect(UNIT_LABEL.pressure).toEqual({ inHg: 'inHg', hPa: 'hPa' });
  });
```

In `tests/unit/application/unit-preferences.test.ts` add:

```ts
  it('keeps the other units when a stored value predates pressure', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      UNITS_STORAGE_KEY,
      JSON.stringify({ fuel: 'lb', temperature: 'F', distance: 'km' }),
    );
    await expect(loadUnitPreferences(storage)).resolves.toEqual({
      fuel: 'lb',
      temperature: 'F',
      distance: 'km',
      pressure: 'inHg',
    });
  });

  it('round-trips hectopascals', async () => {
    const storage = createMemorySettingsStorage();
    await saveUnitPreferences(storage, { ...DEFAULT_UNITS, pressure: 'hPa' });
    await expect(loadUnitPreferences(storage)).resolves.toEqual({
      ...DEFAULT_UNITS,
      pressure: 'hPa',
    });
  });
```

In `tests/ui/units.test.tsx` add a test, in the file's existing style, that the Units section shows a "Pressure unit" radio group, that pressing the chip labelled "Pressure in hectopascals" selects it (`accessibilityState.checked`), and that the stored `avionix.units` JSON then has `pressure: 'hPa'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain/instruments/baro.test.ts tests/unit/domain/units.test.ts tests/unit/application/unit-preferences.test.ts tests/ui/units.test.tsx`
Expected: FAIL (module not found; `pressure` undefined).

- [ ] **Step 3: Implement the pressure unit**

`src/domain/units/units.ts` — add beside the other unit lists and extend the interface, default and labels:

```ts
export const PRESSURE_UNITS = ['inHg', 'hPa'] as const;
export type PressureUnit = (typeof PRESSURE_UNITS)[number];
```

```ts
export interface UnitPreferences {
  fuel: FuelUnit;
  temperature: TemperatureUnit;
  distance: DistanceUnit;
  pressure: PressureUnit;
}

export const DEFAULT_UNITS: UnitPreferences = {
  fuel: 'kg',
  temperature: 'C',
  distance: 'nm',
  pressure: 'inHg',
};
```

```ts
  pressure: { inHg: 'inHg', hPa: 'hPa' } as Record<PressureUnit, string>,
```

Update the module doc comment's first sentence to mention the altimeter setting (F-10) reads the pressure unit.

`src/application/unit-preferences.ts` — add to `storedSchema`:

```ts
  pressure: z.enum([...PRESSURE_UNITS]).catch(DEFAULT_UNITS.pressure),
```

`src/features/units/UnitsSection.tsx` — add after Distance:

```tsx
const PRESSURE: { value: PressureUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'inHg', label: 'inHg', accessibilityLabel: 'Pressure in inches of mercury' },
  { value: 'hPa', label: 'hPa', accessibilityLabel: 'Pressure in hectopascals' },
];
```

```tsx
      <BodyText>Altimeter setting</BodyText>
      <RadioChips
        options={PRESSURE}
        selected={units.pressure}
        onSelect={(value) => setUnit('pressure', value)}
        accessibilityLabel="Pressure unit"
      />
```

- [ ] **Step 4: Implement `baro.ts`**

```ts
import type { PressureUnit } from '@/domain/units/units';

/** Hectopascals per inch of mercury (at 0 °C, the altimetry convention). */
export const HPA_PER_INHG = 33.8639;

/** Standard pressure. STD writes this to the one verified barometer DataRef (spec: "Standard pressure"). */
export const STD_INHG = 29.92;

const STD_TOLERANCE_INHG = 0.005;
// Floating-point slack, so 29.925 and 29.915 count as standard.
const EPSILON = 1e-9;

/** The Kollsman window's span, the same in both units. */
export const BARO_RANGE: Record<PressureUnit, { min: number; max: number }> = {
  inHg: { min: 28, max: 31.5 },
  hPa: { min: 948, max: 1067 },
};

export function isStandard(inHg: number): boolean {
  return Math.abs(inHg - STD_INHG) <= STD_TOLERANCE_INHG + EPSILON;
}

export function toInHg(value: number, unit: PressureUnit): number {
  return unit === 'inHg' ? value : value / HPA_PER_INHG;
}

/** The setting as the pilot reads it: hundredths of an inch, or whole hectopascals. */
export function baroValue(inHg: number, unit: PressureUnit): number {
  return unit === 'inHg' ? Math.round(inHg * 100) / 100 : Math.round(inHg * HPA_PER_INHG);
}

/** The number alone, for the altimeter's Kollsman window. */
export function baroShort(inHg: number, unit: PressureUnit): string {
  return unit === 'inHg' ? baroValue(inHg, unit).toFixed(2) : String(baroValue(inHg, unit));
}

export function formatBaro(inHg: number, unit: PressureUnit): string {
  return `${baroShort(inHg, unit)} ${unit}${isStandard(inHg) ? ' STD' : ''}`;
}

export function baroWords(inHg: number, unit: PressureUnit): string {
  const words =
    unit === 'inHg' ? `${baroShort(inHg, unit)} inches` : `${baroShort(inHg, unit)} hectopascals`;
  return isStandard(inHg) ? `${words}, standard` : words;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * One −/+ press, from the read-back setting (never a typed or previous value). In hectopascals the
 * current value is first rounded to a whole hectopascal, so repeated presses land on whole ones.
 * Returns inches of mercury, the DataRef's unit.
 */
export function baroStep(currentInHg: number, unit: PressureUnit, direction: 1 | -1): number {
  const range = BARO_RANGE[unit];
  if (unit === 'inHg') {
    const next = Math.round(currentInHg * 100) + direction;
    return clamp(next / 100, range.min, range.max);
  }
  const next = clamp(Math.round(currentInHg * HPA_PER_INHG) + direction, range.min, range.max);
  return next / HPA_PER_INHG;
}
```

- [ ] **Step 5: Run the tests, then the gate**

Run the Step 2 command → PASS. Run the full gate; update any existing test that asserts the exact `DEFAULT_UNITS` object or the stored units JSON to include `pressure: 'inHg'`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/units/units.ts src/application/unit-preferences.ts src/features/units/UnitsSection.tsx src/domain/instruments/baro.ts tests
git commit -m "feat(instruments): pressure unit and altimeter-setting domain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Instrument geometry and speed markings

**Files:**
- Create: `src/domain/instruments/geometry.ts`
- Create: `src/domain/instruments/speed-markings.ts`
- Test: `tests/unit/domain/instruments/geometry.test.ts`, `tests/unit/domain/instruments/speed-markings.test.ts`

**Interfaces:**
- Produces (`geometry.ts`): `clamp`, `normalizeDegrees`, `polar`, `arcPath`, `scaleTicks`, `airspeedDialMax`, `airspeedAngle`, `AIRSPEED_SWEEP_DEG`, `altimeterHands`, `roundAltitude`, `vsiAngle`, `vsiScaleOffset`, `vsiHundreds`, `roundVerticalSpeed`, `VSI_LIMIT_FPM`, `headingCardRotation`, `headingText`, `attitudeTransform`, `pitchLadder`, `BANK_MARKS`, `STANDARD_RATE_DEFLECTION_DEG`, `turnDeflection`, `standardRateFraction`, `slipOffset`, `tapeTicks`, `headingTicks`, `headingTickLabel`, `PFD_VIEW`, `pfdWidth`, `sixPackLayout`, and types `Point`, `ScaleTick`, `TapeTick`, `LadderMark`.
- Produces (`speed-markings.ts`): `SpeedInputs`, `SpeedMarkings`, `SpeedBand`, `speedMarkings(inputs)`, `speedBands(markings)`.

Angles are degrees **clockwise from 12 o'clock** everywhere; SVG y grows downwards.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/instruments/geometry.test.ts`:

```ts
import {
  AIRSPEED_SWEEP_DEG,
  PFD_VIEW,
  STANDARD_RATE_DEFLECTION_DEG,
  airspeedAngle,
  airspeedDialMax,
  altimeterHands,
  arcPath,
  attitudeTransform,
  clamp,
  headingCardRotation,
  headingText,
  headingTickLabel,
  headingTicks,
  normalizeDegrees,
  pfdWidth,
  pitchLadder,
  polar,
  roundAltitude,
  roundVerticalSpeed,
  scaleTicks,
  sixPackLayout,
  slipOffset,
  standardRateFraction,
  tapeTicks,
  turnDeflection,
  vsiAngle,
  vsiHundreds,
  vsiScaleOffset,
} from '@/domain/instruments/geometry';

describe('instrument geometry', () => {
  it('clamps and normalises', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-10)).toBe(350);
    expect(Object.is(normalizeDegrees(-360), 0)).toBe(true);
  });

  it('places points clockwise from twelve o’clock', () => {
    const top = polar(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const right = polar(100, 100, 50, 90);
    expect(right.x).toBeCloseTo(150);
    expect(right.y).toBeCloseTo(100);
  });

  it('draws arcs with the large-arc flag only past half a turn', () => {
    expect(arcPath(100, 100, 50, 0, 90)).toBe('M 100.00 50.00 A 50 50 0 0 1 150.00 100.00');
    expect(arcPath(100, 100, 50, 0, 270)).toContain(' 0 1 1 ');
  });

  it('lists scale ticks with majors on the major step', () => {
    const ticks = scaleTicks(0, 40, 10, 20);
    expect(ticks).toEqual([
      { value: 0, major: true },
      { value: 10, major: false },
      { value: 20, major: true },
      { value: 30, major: false },
      { value: 40, major: true },
    ]);
  });

  it('scales the airspeed dial from Vne, or 200 kt without it', () => {
    expect(airspeedDialMax(null)).toBe(200);
    expect(airspeedDialMax(163)).toBe(180);
    // 200 × 1.1 is 220 exactly, not the next step up.
    expect(airspeedDialMax(200)).toBe(220);
    expect(airspeedDialMax(340)).toBe(380);
  });

  it('pegs the airspeed needle at both stops', () => {
    expect(airspeedAngle(0, 200)).toBe(0);
    expect(airspeedAngle(100, 200)).toBe(AIRSPEED_SWEEP_DEG / 2);
    expect(airspeedAngle(250, 200)).toBe(AIRSPEED_SWEEP_DEG);
    expect(airspeedAngle(-5, 200)).toBe(0);
  });

  it('turns the altimeter hands once per 1,000 and 10,000 ft', () => {
    expect(altimeterHands(0)).toEqual({ hundredsDeg: 0, thousandsDeg: 0 });
    expect(altimeterHands(4500)).toEqual({ hundredsDeg: 180, thousandsDeg: 162 });
    expect(altimeterHands(-250).hundredsDeg).toBe(270);
    expect(roundAltitude(4524)).toBe(4520);
    expect(roundAltitude(-1206)).toBe(-1210);
  });

  it('points the VSI left at zero and pegs beyond 2,000 ft/min', () => {
    expect(vsiAngle(0)).toBe(-90);
    expect(vsiAngle(2000)).toBe(80);
    expect(vsiAngle(2500)).toBe(80);
    expect(vsiAngle(-2000)).toBe(-260);
    expect(vsiScaleOffset(1000, 110)).toBe(55);
    expect(vsiScaleOffset(-3000, 110)).toBe(-110);
    expect(vsiHundreds(1240)).toBe('+12');
    expect(vsiHundreds(-560)).toBe('-6');
    expect(vsiHundreds(40)).toBe('');
    expect(roundVerticalSpeed(2504)).toBe(2500);
  });

  it('rotates the heading card against the heading and names it in three digits', () => {
    expect(headingCardRotation(90)).toBe(-90);
    expect(headingCardRotation(-10)).toBe(-350);
    expect(headingText(5)).toBe('005');
    expect(headingText(359.6)).toBe('360');
    expect(headingText(0)).toBe('360');
    expect(headingText(270.2)).toBe('270');
  });

  it('moves the horizon down for pitch up and rotates it against the bank', () => {
    expect(attitudeTransform(10, 20, 4)).toEqual({ rotateDeg: -20, translateY: 40 });
    expect(attitudeTransform(120, 0, 1).translateY).toBe(90);
    expect(attitudeTransform(-120, 0, 1).translateY).toBe(-90);
  });

  it('lists ladder marks near the current pitch, never at the horizon', () => {
    const marks = pitchLadder(0, 20);
    expect(marks.map((mark) => mark.deg)).toEqual([
      -25, -20, -15, -10, -5, 5, 10, 15, 20, 25,
    ]);
    expect(marks.find((mark) => mark.deg === 10)?.major).toBe(true);
    expect(marks.find((mark) => mark.deg === 5)?.major).toBe(false);
    expect(pitchLadder(85, 20).every((mark) => mark.deg <= 90)).toBe(true);
  });

  it('deflects the turn symbol up to ±45° and expresses turn as standard rate', () => {
    expect(STANDARD_RATE_DEFLECTION_DEG).toBe(20);
    expect(turnDeflection(60)).toBe(45);
    expect(turnDeflection(-60)).toBe(-45);
    expect(standardRateFraction(20)).toBe(1);
    expect(standardRateFraction(-10)).toBe(-0.5);
  });

  it('offsets the ball up to the end of its tube', () => {
    expect(slipOffset(5, 30)).toBe(15);
    expect(slipOffset(20, 30)).toBe(30);
    expect(slipOffset(-20, 30)).toBe(-30);
  });

  it('lists tape ticks around the value, above a floor', () => {
    const ticks = tapeTicks(15, 20, 10, 20, 0);
    expect(ticks).toEqual([
      { value: 0, offset: -15, labelled: true },
      { value: 10, offset: -5, labelled: false },
      { value: 20, offset: 5, labelled: true },
      { value: 30, offset: 15, labelled: false },
    ]);
    expect(tapeTicks(-300, 200, 100, 200).map((tick) => tick.value)).toEqual([
      -500, -400, -300, -200, -100,
    ]);
  });

  it('wraps the heading tape across north', () => {
    const ticks = headingTicks(358, 10);
    expect(ticks.map((tick) => tick.value)).toEqual([350, 355, 0, 5]);
    expect(ticks.map((tick) => tick.offset)).toEqual([-8, -3, 2, 7]);
    expect(headingTickLabel(0)).toBe('N');
    expect(headingTickLabel(90)).toBe('E');
    expect(headingTickLabel(120)).toBe('12');
    expect(headingTickLabel(30)).toBe('3');
  });

  it('sizes the PFD to the width, or to 70% of the window height', () => {
    expect(PFD_VIEW).toEqual({ width: 360, height: 300 });
    expect(pfdWidth(340, 2000)).toBe(340);
    expect(pfdWidth(1000, 400)).toBeCloseTo(336);
    expect(pfdWidth(-10, 400)).toBe(0);
  });

  it('lays the six-pack out 2 × 3 in portrait and 3 × 2 in landscape', () => {
    expect(sixPackLayout(400, 2000, false, 8)).toEqual({ columns: 2, size: 196 });
    expect(sixPackLayout(2000, 400, true, 8)).toEqual({ columns: 3, size: 136 });
  });
});
```

`tests/unit/domain/instruments/speed-markings.test.ts`:

```ts
import { speedBands, speedMarkings } from '@/domain/instruments/speed-markings';

const C172 = { vso: 40, vs: 48, vfe: 85, vno: 129, vne: 163 };

describe('speed markings', () => {
  it('accepts a plausible set', () => {
    expect(speedMarkings(C172)).toEqual(C172);
  });

  it('rejects a set with a gap, a zero, a NaN or the wrong order', () => {
    expect(speedMarkings({ ...C172, vne: null })).toBeNull();
    expect(speedMarkings({ ...C172, vso: 0 })).toBeNull();
    expect(speedMarkings({ ...C172, vno: Number.NaN })).toBeNull();
    expect(speedMarkings({ ...C172, vno: 170 })).toBeNull();
    expect(speedMarkings({ ...C172, vs: 30 })).toBeNull();
    expect(speedMarkings({ ...C172, vfe: 39 })).toBeNull();
    expect(speedMarkings({ ...C172, vfe: 170 })).toBeNull();
  });

  it('draws white, green and yellow bands', () => {
    expect(speedBands(C172)).toEqual([
      { from: 40, to: 85, color: 'white' },
      { from: 48, to: 129, color: 'green' },
      { from: 129, to: 163, color: 'yellow' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain/instruments`
Expected: FAIL (modules not found) for the two new files; baro tests still pass.

- [ ] **Step 3: Implement `geometry.ts`**

```ts
/**
 * F-10's drawing maths, free of React and SVG so every limit is unit-tested. Angles are degrees
 * clockwise from twelve o'clock; y grows downwards, as in SVG. Nothing here smooths or predicts a
 * value: each function maps the one sample it is given (spec: "No smoothing").
 */

export interface Point {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** [0, 360), with −0 folded to 0. */
export function normalizeDegrees(deg: number): number {
  const turned = ((deg % 360) + 360) % 360;
  return turned === 0 ? 0 : turned;
}

export function polar(cx: number, cy: number, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

const fixed = (n: number): string => n.toFixed(2);

export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const start = polar(cx, cy, r, fromDeg);
  const end = polar(cx, cy, r, toDeg);
  const sweep = toDeg - fromDeg;
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  const clockwise = sweep >= 0 ? 1 : 0;
  return `M ${fixed(start.x)} ${fixed(start.y)} A ${r} ${r} 0 ${large} ${clockwise} ${fixed(end.x)} ${fixed(end.y)}`;
}

export interface ScaleTick {
  value: number;
  major: boolean;
}

/** Counted in steps rather than summed, so no floating-point drift reaches the last tick. */
export function scaleTicks(min: number, max: number, minor: number, major: number): ScaleTick[] {
  const count = Math.round((max - min) / minor);
  const ticks: ScaleTick[] = [];
  for (let i = 0; i <= count; i += 1) {
    const value = min + i * minor;
    ticks.push({ value, major: value % major === 0 });
  }
  return ticks;
}

// ── Airspeed ────────────────────────────────────────────────────────────────

export const AIRSPEED_SWEEP_DEG = 320;
const DEFAULT_AIRSPEED_DIAL_MAX = 200;

/** The next multiple of 20 kt at or above Vne + 10%; 200 kt when the aircraft publishes no Vne. */
export function airspeedDialMax(vne: number | null): number {
  if (vne === null) {
    return DEFAULT_AIRSPEED_DIAL_MAX;
  }
  // × 11 / 10 rather than × 1.1: 200 × 1.1 is 220.00000000000003, which would round up to 240.
  return Math.max(20, Math.ceil((vne * 11) / 10 / 20) * 20);
}

/** A needle beyond either stop pegs there; the digital window shows the true value. */
export function airspeedAngle(knots: number, dialMax: number): number {
  return (clamp(knots, 0, dialMax) / dialMax) * AIRSPEED_SWEEP_DEG;
}

// ── Altitude ────────────────────────────────────────────────────────────────

export function altimeterHands(feet: number): { hundredsDeg: number; thousandsDeg: number } {
  return {
    hundredsDeg: normalizeDegrees((feet / 1000) * 360),
    thousandsDeg: normalizeDegrees((feet / 10000) * 360),
  };
}

/** Digital altitude to the nearest 10 ft, as the accessible label reads it. */
export function roundAltitude(feet: number): number {
  const rounded = Math.round(feet / 10) * 10;
  return rounded === 0 ? 0 : rounded;
}

// ── Vertical speed ──────────────────────────────────────────────────────────

export const VSI_LIMIT_FPM = 2000;
const VSI_DIAL_SWEEP_DEG = 170;

/** Zero at nine o'clock; climb turns the needle up (clockwise), descent down. */
export function vsiAngle(fpm: number): number {
  return -90 + (clamp(fpm, -VSI_LIMIT_FPM, VSI_LIMIT_FPM) / VSI_LIMIT_FPM) * VSI_DIAL_SWEEP_DEG;
}

/** The PFD scale's pointer offset above the centre line, pegged at ±2,000 ft/min. */
export function vsiScaleOffset(fpm: number, halfHeight: number): number {
  return (clamp(fpm, -VSI_LIMIT_FPM, VSI_LIMIT_FPM) / VSI_LIMIT_FPM) * halfHeight;
}

/** Hundreds of ft/min with a sign, blank under 100 ft/min (the PFD's narrow scale). */
export function vsiHundreds(fpm: number): string {
  const hundreds = Math.round(fpm / 100);
  if (hundreds === 0) {
    return '';
  }
  return hundreds > 0 ? `+${hundreds}` : `-${Math.abs(hundreds)}`;
}

export function roundVerticalSpeed(fpm: number): number {
  const rounded = Math.round(fpm / 10) * 10;
  return rounded === 0 ? 0 : rounded;
}

// ── Heading ─────────────────────────────────────────────────────────────────

export function headingCardRotation(heading: number): number {
  const rotation = -normalizeDegrees(heading);
  return rotation === 0 ? 0 : rotation;
}

/** Three digits, and north as 360 as pilots say it. */
export function headingText(heading: number): string {
  const whole = Math.round(normalizeDegrees(heading)) % 360;
  return whole === 0 ? '360' : String(whole).padStart(3, '0');
}

// ── Attitude ────────────────────────────────────────────────────────────────

export const BANK_MARKS: readonly number[] = [10, 20, 30, 45, 60];

/**
 * Rotate by −roll about the centre, then move the horizon down by pitch (pitch up shows more sky).
 * Pitch is drawn to ±90°; roll is unrestricted.
 */
export function attitudeTransform(
  pitch: number,
  roll: number,
  pxPerDeg: number,
): { rotateDeg: number; translateY: number } {
  const rotateDeg = roll === 0 ? 0 : -roll;
  return { rotateDeg, translateY: clamp(pitch, -90, 90) * pxPerDeg };
}

export interface LadderMark {
  deg: number;
  major: boolean;
}

/** Every 5° from −90 to 90 within the visible window (plus one step), never the horizon itself. */
export function pitchLadder(pitch: number, windowDeg: number): LadderMark[] {
  const centre = clamp(pitch, -90, 90);
  const marks: LadderMark[] = [];
  for (let deg = -90; deg <= 90; deg += 5) {
    if (deg !== 0 && Math.abs(deg - centre) <= windowDeg + 5) {
      marks.push({ deg, major: deg % 10 === 0 });
    }
  }
  return marks;
}

// ── Turn and slip ───────────────────────────────────────────────────────────

/**
 * The deflection X-Plane reports for a standard-rate (3°/s) turn. Undocumented: an assumption
 * checked on the device (spec: "Open questions"). If X-Plane disagrees, only this changes.
 */
export const STANDARD_RATE_DEFLECTION_DEG = 20;
const TURN_LIMIT_DEG = 45;
const SLIP_LIMIT_DEG = 10;

export function turnDeflection(deflection: number): number {
  return clamp(deflection, -TURN_LIMIT_DEG, TURN_LIMIT_DEG);
}

export function standardRateFraction(deflection: number): number {
  return deflection / STANDARD_RATE_DEFLECTION_DEG;
}

/** Positive slip puts the ball right (assumed; checked on the device). */
export function slipOffset(slipDeg: number, halfTravel: number): number {
  return (clamp(slipDeg, -SLIP_LIMIT_DEG, SLIP_LIMIT_DEG) / SLIP_LIMIT_DEG) * halfTravel;
}

// ── Tapes ───────────────────────────────────────────────────────────────────

export interface TapeTick {
  value: number;
  /** value − current, in the tape's units; the component multiplies by its scale. */
  offset: number;
  labelled: boolean;
}

export function tapeTicks(
  value: number,
  halfWindow: number,
  minorStep: number,
  labelStep: number,
  floor = Number.NEGATIVE_INFINITY,
): TapeTick[] {
  const first = Math.ceil((value - halfWindow) / minorStep);
  const last = Math.floor((value + halfWindow) / minorStep);
  const ticks: TapeTick[] = [];
  for (let step = first; step <= last; step += 1) {
    const tickValue = step * minorStep === 0 ? 0 : step * minorStep;
    if (tickValue < floor) {
      continue;
    }
    ticks.push({ value: tickValue, offset: tickValue - value, labelled: tickValue % labelStep === 0 });
  }
  return ticks;
}

/** The heading tape: ticks every 5°, wrapped into [0, 360) while their offsets stay continuous. */
export function headingTicks(heading: number, halfWindow: number): TapeTick[] {
  const current = normalizeDegrees(heading);
  return tapeTicks(current, halfWindow, 5, 10).map((tick) => ({
    ...tick,
    value: normalizeDegrees(tick.value),
  }));
}

const CARDINALS: Readonly<Record<number, string>> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

/** Compass-card style: N, E, S, W, else tens of degrees ("3" is 030, "12" is 120). */
export function headingTickLabel(value: number): string {
  const deg = normalizeDegrees(value);
  return CARDINALS[deg] ?? String(Math.round(deg / 10));
}

// ── Layout ──────────────────────────────────────────────────────────────────

export const PFD_VIEW = { width: 360, height: 300 } as const;
/** Instruments take at most this share of the window height, keeping the altimeter controls near. */
const HEIGHT_SHARE = 0.7;

export function pfdWidth(contentWidth: number, windowHeight: number): number {
  const byHeight = ((windowHeight * HEIGHT_SHARE) * PFD_VIEW.width) / PFD_VIEW.height;
  return Math.max(0, Math.min(contentWidth, byHeight));
}

/** Portrait 2 × 3, landscape the classic 3 × 2. */
export function sixPackLayout(
  contentWidth: number,
  windowHeight: number,
  landscape: boolean,
  gap: number,
): { columns: number; size: number } {
  const columns = landscape ? 3 : 2;
  const rows = landscape ? 2 : 3;
  const byWidth = (contentWidth - gap * (columns - 1)) / columns;
  const byHeight = (windowHeight * HEIGHT_SHARE - gap * (rows - 1)) / rows;
  return { columns, size: Math.max(0, Math.floor(Math.min(byWidth, byHeight))) };
}
```

Check the `sixPackLayout` expectations against this formula before relying on them: portrait `(400 − 8) / 2 = 196`, `(1400 − 16) / 3 = 461.3` → 196; landscape `(2000 − 16) / 3 = 661.3`, `(280 − 8) / 2 = 136` → 136. If the test and the formula disagree, fix the **test arithmetic**, not the formula, and say so in your report.

- [ ] **Step 4: Implement `speed-markings.ts`**

```ts
/** The aircraft's V-speeds in knots indicated, as X-Plane's `acf_V*` DataRefs publish them. */
export interface SpeedInputs {
  vso: number | null;
  vs: number | null;
  vfe: number | null;
  vno: number | null;
  vne: number | null;
}

export interface SpeedMarkings {
  vso: number;
  vs: number;
  vfe: number;
  vno: number;
  vne: number;
}

export type BandColor = 'white' | 'green' | 'yellow';

export interface SpeedBand {
  from: number;
  to: number;
  color: BandColor;
}

const finite = (value: number | null): value is number =>
  value !== null && Number.isFinite(value);

/**
 * Markings only from a plausible set: an author who left these at 0, or published them out of
 * order, gets no arcs at all rather than false ones.
 */
export function speedMarkings(inputs: SpeedInputs): SpeedMarkings | null {
  const { vso, vs, vfe, vno, vne } = inputs;
  if (!finite(vso) || !finite(vs) || !finite(vfe) || !finite(vno) || !finite(vne)) {
    return null;
  }
  if (!(vso > 0 && vso <= vs && vs < vno && vno < vne)) {
    return null;
  }
  if (!(vso < vfe && vfe <= vne)) {
    return null;
  }
  return { vso, vs, vfe, vno, vne };
}

/** The red line at Vne is drawn by the instrument from `markings.vne`. */
export function speedBands(markings: SpeedMarkings): SpeedBand[] {
  return [
    { from: markings.vso, to: markings.vfe, color: 'white' },
    { from: markings.vs, to: markings.vno, color: 'green' },
    { from: markings.vno, to: markings.vne, color: 'yellow' },
  ];
}
```

- [ ] **Step 5: Run the tests, then the gate**

Run: `npx jest tests/unit/domain/instruments` → PASS. Run the full gate.

- [ ] **Step 6: Commit**

```bash
git add src/domain/instruments tests/unit/domain/instruments
git commit -m "feat(instruments): drawing geometry and speed markings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Presentation, accessible labels and presentation storage

**Files:**
- Create: `src/domain/instruments/presentation.ts`
- Create: `src/domain/instruments/labels.ts`
- Create: `src/application/instrument-preferences.ts`
- Test: `tests/unit/domain/instruments/presentation.test.ts`, `tests/unit/domain/instruments/labels.test.ts`, `tests/unit/application/instrument-preferences.test.ts`

**Interfaces:**
- Consumes: `AircraftIdentity` from `@/domain/aircraft/aircraft-identity`; `roundAltitude`, `roundVerticalSpeed`, `normalizeDegrees`, `standardRateFraction` from Task 3.
- Produces (`presentation.ts`): `PRESENTATIONS`, `type Presentation = 'pfd' | 'sixPack'`, `PresentationPreferences { last; byAircraft }`, `DEFAULT_PRESENTATION_PREFERENCES`, `aircraftKey(identity)`, `engineDefault(engineType)`, `resolvePresentation(prefs, key, engineType)`, `choosePresentation(prefs, key, presentation)`.
- Produces (`labels.ts`): `type InstrumentStatus = 'unavailable' | 'noValue' | 'live' | 'notLive'`, `instrumentStatus(missing, hasValue, current)`, `withStatus(name, status, describe)`, `machShown`, `radioAltitudeShown`, `groupThousands`, `describeAirspeed`, `describeAttitude`, `describeAltitude`, `describeVerticalSpeed`, `describeHeading`, `describeTurn`.
- Produces (`instrument-preferences.ts`): `INSTRUMENTS_STORAGE_KEY = 'avionix.instruments'`, `loadInstrumentPreferences(storage)`, `saveInstrumentPreferences(storage, prefs)`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/instruments/presentation.test.ts`:

```ts
import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  aircraftKey,
  choosePresentation,
  engineDefault,
  resolvePresentation,
} from '@/domain/instruments/presentation';

const C172 = { ...UNIDENTIFIED, icaoType: 'C172', description: 'Cessna 172 SP' };

describe('instrument presentation', () => {
  it('keys an aircraft by ICAO type, else description, else not at all', () => {
    expect(aircraftKey(C172)).toBe('C172');
    expect(aircraftKey({ ...UNIDENTIFIED, description: 'Homebuilt' })).toBe('Homebuilt');
    expect(aircraftKey(UNIDENTIFIED)).toBeNull();
    expect(aircraftKey({ ...UNIDENTIFIED, tailNumber: 'N172SP' })).toBeNull();
  });

  it('defaults jets and rockets to the PFD, pistons, electrics and turboprops to the six-pack', () => {
    for (const code of [5, 6, 7]) {
      expect(engineDefault(code)).toBe('pfd');
    }
    for (const code of [0, 1, 3, 9, 10]) {
      expect(engineDefault(code)).toBe('sixPack');
    }
    expect(engineDefault(2)).toBeNull();
    expect(engineDefault(null)).toBeNull();
  });

  it('starts on the PFD', () => {
    expect(DEFAULT_PRESENTATION_PREFERENCES).toEqual({ last: 'pfd', byAircraft: {} });
    expect(resolvePresentation(DEFAULT_PRESENTATION_PREFERENCES, null, null)).toBe('pfd');
  });

  it('prefers the stored choice, then the engine default, then the last choice', () => {
    const prefs = { last: 'pfd' as const, byAircraft: { C172: 'pfd' as const } };
    expect(resolvePresentation(prefs, 'C172', 0)).toBe('pfd');
    expect(resolvePresentation(prefs, 'BE58', 0)).toBe('sixPack');
    expect(resolvePresentation(prefs, 'BE58', 2)).toBe('pfd');
    expect(resolvePresentation({ ...prefs, last: 'sixPack' }, null, null)).toBe('sixPack');
  });

  it('remembers a choice per aircraft and as the last choice', () => {
    const next = choosePresentation(DEFAULT_PRESENTATION_PREFERENCES, 'C172', 'sixPack');
    expect(next).toEqual({ last: 'sixPack', byAircraft: { C172: 'sixPack' } });
    expect(choosePresentation(next, null, 'pfd')).toEqual({
      last: 'pfd',
      byAircraft: { C172: 'sixPack' },
    });
  });

  it('returns the same object when nothing changes', () => {
    const prefs = { last: 'sixPack' as const, byAircraft: { C172: 'sixPack' as const } };
    expect(choosePresentation(prefs, 'C172', 'sixPack')).toBe(prefs);
    expect(choosePresentation(prefs, null, 'sixPack')).toBe(prefs);
  });
});
```

`tests/unit/domain/instruments/labels.test.ts`:

```ts
import {
  describeAirspeed,
  describeAltitude,
  describeAttitude,
  describeHeading,
  describeTurn,
  describeVerticalSpeed,
  groupThousands,
  instrumentStatus,
  machShown,
  radioAltitudeShown,
  withStatus,
} from '@/domain/instruments/labels';

describe('instrument labels', () => {
  it('orders the states: unavailable, no value, live, not live', () => {
    expect(instrumentStatus(true, true, true)).toBe('unavailable');
    expect(instrumentStatus(false, false, true)).toBe('noValue');
    expect(instrumentStatus(false, true, true)).toBe('live');
    expect(instrumentStatus(false, true, false)).toBe('notLive');
  });

  it('words each state, describing only when there is a value', () => {
    const describe = jest.fn(() => 'Airspeed 112 knots');
    expect(withStatus('Airspeed', 'unavailable', describe)).toBe(
      'Airspeed: not available on this aircraft',
    );
    expect(withStatus('Airspeed', 'noValue', describe)).toBe('Airspeed: no value');
    expect(describe).not.toHaveBeenCalled();
    expect(withStatus('Airspeed', 'live', describe)).toBe('Airspeed 112 knots');
    expect(withStatus('Airspeed', 'notLive', describe)).toBe('Airspeed 112 knots, not live');
  });

  it('groups thousands', () => {
    expect(groupThousands(4520)).toBe('4,520');
    expect(groupThousands(-12340)).toBe('-12,340');
    expect(groupThousands(999)).toBe('999');
  });

  it('shows Mach from 0.40 and radio altitude up to 2,500 ft', () => {
    expect(machShown(0.39)).toBe(false);
    expect(machShown(0.4)).toBe(true);
    expect(machShown(null)).toBe(false);
    expect(radioAltitudeShown(2500)).toBe(true);
    expect(radioAltitudeShown(2501)).toBe(false);
    expect(radioAltitudeShown(-1)).toBe(false);
    expect(radioAltitudeShown(null)).toBe(false);
  });

  it('describes airspeed, with Mach when shown', () => {
    expect(describeAirspeed(112.4, null)).toBe('Airspeed 112 knots');
    expect(describeAirspeed(280, 0.782)).toBe('Airspeed 280 knots, Mach 0.78');
    expect(describeAirspeed(120, 0.2)).toBe('Airspeed 120 knots');
  });

  it('describes attitude in words, level when it rounds to zero', () => {
    expect(describeAttitude(3.2, 15.4)).toBe(
      'Attitude: pitch 3 degrees up, bank 15 degrees right',
    );
    expect(describeAttitude(-1, -30)).toBe('Attitude: pitch 1 degree down, bank 30 degrees left');
    expect(describeAttitude(0.3, -0.2)).toBe('Attitude: pitch level, wings level');
  });

  it('describes altitude with the altimeter and radio altitude when given', () => {
    expect(describeAltitude(4524, null, null)).toBe('Altitude 4,520 feet');
    expect(describeAltitude(4524, '29.92 inches, standard', null)).toBe(
      'Altitude 4,520 feet, altimeter 29.92 inches, standard',
    );
    expect(describeAltitude(820, null, 812.6)).toBe(
      'Altitude 820 feet, radio altitude 813 feet',
    );
    expect(describeAltitude(8000, null, 7990)).toBe('Altitude 8,000 feet');
  });

  it('describes vertical speed', () => {
    expect(describeVerticalSpeed(503)).toBe('Vertical speed climbing 500 feet per minute');
    expect(describeVerticalSpeed(-1204)).toBe(
      'Vertical speed descending 1,200 feet per minute',
    );
    expect(describeVerticalSpeed(3)).toBe('Vertical speed level');
  });

  it('describes heading, north as 360', () => {
    expect(describeHeading(270.2)).toBe('Heading 270 degrees');
    expect(describeHeading(0)).toBe('Heading 360 degrees');
    expect(describeHeading(359.7)).toBe('Heading 360 degrees');
    expect(describeHeading(5)).toBe('Heading 5 degrees');
  });

  it('describes turn as a fraction of standard rate and the ball in degrees', () => {
    expect(describeTurn(24, 2.2)).toBe(
      'Turn: rate 1.2 standard rate right, ball 2 degrees right',
    );
    expect(describeTurn(-10, -1)).toBe('Turn: rate 0.5 standard rate left, ball 1 degree left');
    expect(describeTurn(0.4, 0.2)).toBe('Turn: no turn, ball centred');
    expect(describeTurn(null, 3)).toBe('Turn: ball 3 degrees right');
    expect(describeTurn(20, null)).toBe('Turn: rate 1.0 standard rate right');
  });
});
```

`tests/unit/application/instrument-preferences.test.ts`:

```ts
import {
  INSTRUMENTS_STORAGE_KEY,
  loadInstrumentPreferences,
  saveInstrumentPreferences,
} from '@/application/instrument-preferences';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { DEFAULT_PRESENTATION_PREFERENCES } from '@/domain/instruments/presentation';

describe('instrument preferences', () => {
  it('defaults when nothing is stored', async () => {
    await expect(loadInstrumentPreferences(createMemorySettingsStorage())).resolves.toEqual(
      DEFAULT_PRESENTATION_PREFERENCES,
    );
  });

  it('round-trips', async () => {
    const storage = createMemorySettingsStorage();
    const prefs = { last: 'sixPack' as const, byAircraft: { C172: 'sixPack' as const } };
    await saveInstrumentPreferences(storage, prefs);
    expect(await storage.getItem(INSTRUMENTS_STORAGE_KEY)).toBe(JSON.stringify(prefs));
    await expect(loadInstrumentPreferences(storage)).resolves.toEqual(prefs);
  });

  it('defaults on corrupt JSON', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(INSTRUMENTS_STORAGE_KEY, '{not json');
    await expect(loadInstrumentPreferences(storage)).resolves.toEqual(
      DEFAULT_PRESENTATION_PREFERENCES,
    );
  });

  it('keeps every good field and every good aircraft', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      INSTRUMENTS_STORAGE_KEY,
      JSON.stringify({ last: 'hud', byAircraft: { C172: 'sixPack', B738: 'hud', A320: 3 } }),
    );
    await expect(loadInstrumentPreferences(storage)).resolves.toEqual({
      last: 'pfd',
      byAircraft: { C172: 'sixPack' },
    });
  });

  it('drops a byAircraft that is not an object', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      INSTRUMENTS_STORAGE_KEY,
      JSON.stringify({ last: 'sixPack', byAircraft: ['C172'] }),
    );
    await expect(loadInstrumentPreferences(storage)).resolves.toEqual({
      last: 'sixPack',
      byAircraft: {},
    });
  });

  it('never throws when storage fails', async () => {
    const failing = {
      getItem: jest.fn(async () => {
        throw new Error('disk');
      }),
      setItem: jest.fn(async () => {
        throw new Error('disk');
      }),
      removeItem: jest.fn(async () => undefined),
    };
    await expect(loadInstrumentPreferences(failing)).resolves.toEqual(
      DEFAULT_PRESENTATION_PREFERENCES,
    );
    await expect(
      saveInstrumentPreferences(failing, DEFAULT_PRESENTATION_PREFERENCES),
    ).resolves.toBeUndefined();
  });
});
```

(If `SettingsStorage` has a different method set, shape `failing` to match it — read `src/application/settings-store.ts`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain/instruments/presentation.test.ts tests/unit/domain/instruments/labels.test.ts tests/unit/application/instrument-preferences.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `presentation.ts`**

```ts
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';

export const PRESENTATIONS = ['pfd', 'sixPack'] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

export interface PresentationPreferences {
  /** The last choice made, for an aircraft with no key or no stored choice (R3). */
  last: Presentation;
  /** The pilot's choice per aircraft key; it always wins over the engine-type default. */
  byAircraft: Readonly<Record<string, Presentation>>;
}

/** The PFD first: its digits read best on a phone. */
export const DEFAULT_PRESENTATION_PREFERENCES: PresentationPreferences = {
  last: 'pfd',
  byAircraft: {},
};

/** The ICAO type, else the description; a tail number alone names an airframe, not a type. */
export function aircraftKey(identity: AircraftIdentity): string | null {
  return identity.icaoType ?? identity.description ?? null;
}

/**
 * `sim/aircraft/prop/acf_en_type[0]`. Jets and rockets get the PFD; pistons, electrics and
 * turboprops the six-pack (the default King Air and Baron fly steam gauges). Unlisted codes have
 * no default.
 */
export function engineDefault(engineType: number | null): Presentation | null {
  switch (engineType) {
    case 5:
    case 6:
    case 7:
      return 'pfd';
    case 0:
    case 1:
    case 3:
    case 9:
    case 10:
      return 'sixPack';
    default:
      return null;
  }
}

export function resolvePresentation(
  prefs: PresentationPreferences,
  key: string | null,
  engineType: number | null,
): Presentation {
  const stored = key === null ? undefined : prefs.byAircraft[key];
  return stored ?? engineDefault(engineType) ?? prefs.last;
}

/** Returns `prefs` itself when nothing changes, so a no-op choice writes nothing. */
export function choosePresentation(
  prefs: PresentationPreferences,
  key: string | null,
  presentation: Presentation,
): PresentationPreferences {
  const storedMatches = key === null || prefs.byAircraft[key] === presentation;
  if (prefs.last === presentation && storedMatches) {
    return prefs;
  }
  return {
    last: presentation,
    byAircraft: key === null ? prefs.byAircraft : { ...prefs.byAircraft, [key]: presentation },
  };
}
```

- [ ] **Step 4: Implement `labels.ts`**

```ts
import {
  normalizeDegrees,
  roundAltitude,
  roundVerticalSpeed,
  standardRateFraction,
} from '@/domain/instruments/geometry';

/**
 * One instrument's state, in precedence order (spec: "Values and states"). Both presentations
 * build their accessible labels here, so switching loses a screen-reader user nothing (R3).
 */
export type InstrumentStatus = 'unavailable' | 'noValue' | 'live' | 'notLive';

export function instrumentStatus(
  missing: boolean,
  hasValue: boolean,
  current: boolean,
): InstrumentStatus {
  if (missing) {
    return 'unavailable';
  }
  if (!hasValue) {
    return 'noValue';
  }
  return current ? 'live' : 'notLive';
}

export function withStatus(
  name: string,
  status: InstrumentStatus,
  describe: () => string,
): string {
  switch (status) {
    case 'unavailable':
      return `${name}: not available on this aircraft`;
    case 'noValue':
      return `${name}: no value`;
    case 'live':
      return describe();
    case 'notLive':
      return `${describe()}, not live`;
  }
}

export function groupThousands(value: number): string {
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return value < 0 ? `-${digits}` : digits;
}

const MACH_SHOWN_FROM = 0.4;
const RADIO_ALTITUDE_SHOWN_TO_FT = 2500;

export function machShown(mach: number | null): mach is number {
  return mach !== null && mach >= MACH_SHOWN_FROM;
}

export function radioAltitudeShown(feet: number | null): feet is number {
  return feet !== null && feet >= 0 && feet <= RADIO_ALTITUDE_SHOWN_TO_FT;
}

const degrees = (n: number): string => (n === 1 ? '1 degree' : `${n} degrees`);

export function describeAirspeed(knots: number, mach: number | null): string {
  const speed = `Airspeed ${groupThousands(Math.round(knots))} knots`;
  return machShown(mach) ? `${speed}, Mach ${mach.toFixed(2)}` : speed;
}

export function describeAttitude(pitch: number, roll: number): string {
  const p = Math.round(pitch);
  const r = Math.round(roll);
  const pitchWords = p === 0 ? 'pitch level' : `pitch ${degrees(Math.abs(p))} ${p > 0 ? 'up' : 'down'}`;
  const bankWords = r === 0 ? 'wings level' : `bank ${degrees(Math.abs(r))} ${r > 0 ? 'right' : 'left'}`;
  return `Attitude: ${pitchWords}, ${bankWords}`;
}

export function describeAltitude(
  feet: number,
  baroWords: string | null,
  radioAltitude: number | null,
): string {
  const parts = [`Altitude ${groupThousands(roundAltitude(feet))} feet`];
  if (baroWords !== null) {
    parts.push(`altimeter ${baroWords}`);
  }
  if (radioAltitudeShown(radioAltitude)) {
    parts.push(`radio altitude ${groupThousands(Math.round(radioAltitude))} feet`);
  }
  return parts.join(', ');
}

export function describeVerticalSpeed(fpm: number): string {
  const rounded = roundVerticalSpeed(fpm);
  if (rounded === 0) {
    return 'Vertical speed level';
  }
  const direction = rounded > 0 ? 'climbing' : 'descending';
  return `Vertical speed ${direction} ${groupThousands(Math.abs(rounded))} feet per minute`;
}

export function describeHeading(heading: number): string {
  const whole = Math.round(normalizeDegrees(heading)) % 360;
  return `Heading ${whole === 0 ? 360 : whole} degrees`;
}

/** Either part may be absent (its DataRef missing or not yet received); never both. */
export function describeTurn(deflection: number | null, slip: number | null): string {
  const parts: string[] = [];
  if (deflection !== null) {
    const fraction = standardRateFraction(deflection);
    const tenths = Math.round(Math.abs(fraction) * 10) / 10;
    parts.push(
      tenths === 0
        ? 'no turn'
        : `rate ${tenths.toFixed(1)} standard rate ${fraction > 0 ? 'right' : 'left'}`,
    );
  }
  if (slip !== null) {
    const ball = Math.round(slip);
    parts.push(
      ball === 0 ? 'ball centred' : `ball ${degrees(Math.abs(ball))} ${ball > 0 ? 'right' : 'left'}`,
    );
  }
  return `Turn: ${parts.join(', ')}`;
}
```

- [ ] **Step 5: Implement `instrument-preferences.ts`**

```ts
import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  PRESENTATIONS,
  type Presentation,
  type PresentationPreferences,
} from '@/domain/instruments/presentation';

export const INSTRUMENTS_STORAGE_KEY = 'avionix.instruments';

const presentation = z.enum([...PRESENTATIONS]);

/** Per field, and per aircraft: one bad entry never costs the others (as `avionix.units`). */
const storedSchema = z.object({
  last: presentation.catch(DEFAULT_PRESENTATION_PREFERENCES.last),
  byAircraft: z.record(z.string(), z.unknown()).catch({}),
});

export async function loadInstrumentPreferences(
  storage: SettingsStorage,
): Promise<PresentationPreferences> {
  try {
    const raw = await storage.getItem(INSTRUMENTS_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_PRESENTATION_PREFERENCES;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return DEFAULT_PRESENTATION_PREFERENCES;
    }
    const byAircraft: Record<string, Presentation> = {};
    for (const [key, value] of Object.entries(parsed.data.byAircraft)) {
      const choice = presentation.safeParse(value);
      if (choice.success) {
        byAircraft[key] = choice.data;
      }
    }
    return { last: parsed.data.last, byAircraft };
  } catch {
    return DEFAULT_PRESENTATION_PREFERENCES;
  }
}

export async function saveInstrumentPreferences(
  storage: SettingsStorage,
  prefs: PresentationPreferences,
): Promise<void> {
  try {
    await storage.setItem(INSTRUMENTS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Best effort, like the unit preferences: a failed save must never break the panel.
  }
}
```

If zod v4's `z.record` accepts an array (so the "not an object" test fails), add `.refine((value) => !Array.isArray(value))` before `.catch({})`.

- [ ] **Step 6: Run the tests, then the gate**

Run the Step 2 command → PASS. Run the full gate.

- [ ] **Step 7: Commit**

```bash
git add src/domain/instruments src/application/instrument-preferences.ts tests/unit
git commit -m "feat(instruments): presentation choice, accessible labels and their storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Profile 1.2.0 and the mock server

**Files:**
- Modify: `src/domain/aircraft/profiles/generic.ts`
- Modify: `tests/mock-xplane/mock-xplane-server.ts`
- Modify (as the gate requires): `tests/unit/domain/aircraft-profile.test.ts` (or wherever the profile's version and feature list are asserted), `tests/unit/application/simulator-session.test.ts`, `tests/integration/aircraft-compatibility.test.ts`, `tests/integration/mock-xplane-server.test.ts`, any test that counts features or mock DataRefs

**Interfaces:**
- Produces: `GENERIC_DATAREFS` gains `mach`, `altitude`, `verticalSpeed`, `heading`, `pitch`, `roll`, `turnRate`, `slip`, `radioAltitude`, `engineType`, `vso`, `vs`, `vfe`, `vno`, `vne`, `barometer`; `FEATURE_FLIGHT_INSTRUMENTS = 'flight-instruments'`; `FEATURE_ALTIMETER_SETTING = 'altimeter-setting'`; `GENERIC_PROFILE.version === '1.2.0'`. (`airspeed` already exists and is reused.)

- [ ] **Step 1: Write the failing tests**

In the profile test file (find it with `grep -rln "GENERIC_PROFILE" tests/unit`), add:

```ts
  it('declares the flight instruments, every one optional, and the altimeter setting', () => {
    expect(GENERIC_PROFILE.version).toBe('1.2.0');
    const instruments = findFeature(GENERIC_PROFILE, FEATURE_FLIGHT_INSTRUMENTS);
    expect(instruments?.label).toBe('Flight instruments');
    expect(instruments?.bindings.map((binding) => binding.name)).toEqual([
      GENERIC_DATAREFS.airspeed,
      GENERIC_DATAREFS.mach,
      GENERIC_DATAREFS.altitude,
      GENERIC_DATAREFS.verticalSpeed,
      GENERIC_DATAREFS.heading,
      GENERIC_DATAREFS.pitch,
      GENERIC_DATAREFS.roll,
      GENERIC_DATAREFS.turnRate,
      GENERIC_DATAREFS.slip,
      GENERIC_DATAREFS.radioAltitude,
      GENERIC_DATAREFS.engineType,
      GENERIC_DATAREFS.vso,
      GENERIC_DATAREFS.vs,
      GENERIC_DATAREFS.vfe,
      GENERIC_DATAREFS.vno,
      GENERIC_DATAREFS.vne,
    ]);
    expect(instruments?.bindings.every((binding) => !binding.required && !binding.write)).toBe(
      true,
    );
    const baro = findFeature(GENERIC_PROFILE, FEATURE_ALTIMETER_SETTING);
    expect(baro?.bindings).toEqual([
      expect.objectContaining({
        kind: 'dataref',
        name: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
        required: true,
        write: true,
      }),
    ]);
  });
```

In `tests/integration/aircraft-compatibility.test.ts`, extend the "every feature available" test's expectations so `flight-instruments` and `altimeter-setting` are `available` against the default mock server, and add:

```ts
  it('marks the altimeter setting unavailable, and only it, when its DataRef is read-only', async () => {
    // Start the mock with the barometer DataRef `writable: false` (copy the file's existing
    // pattern for overriding DEFAULT_MOCK_DATAREFS), connect, then:
    // expect feature 'altimeter-setting' status 'unavailable' with its missing entry status 'readOnly',
    // and 'flight-instruments' still 'available'.
  });
```

Write that test fully, in the file's existing style, following the comments above; do not leave the comments as the body.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain tests/integration/aircraft-compatibility.test.ts`
Expected: FAIL (`FEATURE_FLIGHT_INSTRUMENTS` undefined, version `1.1.0`).

- [ ] **Step 3: Extend the profile**

In `GENERIC_DATAREFS` add:

```ts
  mach: 'sim/cockpit2/gauges/indicators/mach_pilot',
  altitude: 'sim/cockpit2/gauges/indicators/altitude_ft_pilot',
  verticalSpeed: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot',
  heading: 'sim/cockpit2/gauges/indicators/heading_AHARS_deg_mag_pilot',
  pitch: 'sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot',
  roll: 'sim/cockpit2/gauges/indicators/roll_AHARS_deg_pilot',
  turnRate: 'sim/cockpit2/gauges/indicators/turn_rate_roll_deg_pilot',
  slip: 'sim/cockpit2/gauges/indicators/slip_deg',
  radioAltitude: 'sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot',
  engineType: 'sim/aircraft/prop/acf_en_type',
  vso: 'sim/aircraft/view/acf_Vso',
  vs: 'sim/aircraft/view/acf_Vs',
  vfe: 'sim/aircraft/view/acf_Vfe',
  vno: 'sim/aircraft/view/acf_Vno',
  vne: 'sim/aircraft/view/acf_Vne',
  barometer: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
```

Add the constants:

```ts
export const FEATURE_FLIGHT_INSTRUMENTS = 'flight-instruments';
export const FEATURE_ALTIMETER_SETTING = 'altimeter-setting';
```

Set `version: '1.2.0'` and append the two features after `gps-destination`:

```ts
    {
      id: FEATURE_FLIGHT_INSTRUMENTS,
      label: 'Flight instruments',
      bindings: [
        { kind: 'dataref', name: GENERIC_DATAREFS.airspeed, required: false, purpose: 'Airspeed indicator' },
        { kind: 'dataref', name: GENERIC_DATAREFS.mach, required: false, purpose: 'Mach number' },
        { kind: 'dataref', name: GENERIC_DATAREFS.altitude, required: false, purpose: 'Altimeter' },
        { kind: 'dataref', name: GENERIC_DATAREFS.verticalSpeed, required: false, purpose: 'Vertical speed indicator' },
        { kind: 'dataref', name: GENERIC_DATAREFS.heading, required: false, purpose: 'Heading indicator' },
        { kind: 'dataref', name: GENERIC_DATAREFS.pitch, required: false, purpose: 'Attitude indicator (pitch)' },
        { kind: 'dataref', name: GENERIC_DATAREFS.roll, required: false, purpose: 'Attitude indicator (bank)' },
        { kind: 'dataref', name: GENERIC_DATAREFS.turnRate, required: false, purpose: 'Turn rate' },
        { kind: 'dataref', name: GENERIC_DATAREFS.slip, required: false, purpose: 'Slip and skid ball' },
        { kind: 'dataref', name: GENERIC_DATAREFS.radioAltitude, required: false, purpose: 'Radio altitude' },
        { kind: 'dataref', name: GENERIC_DATAREFS.engineType, required: false, purpose: 'Engine type, which picks the default presentation' },
        { kind: 'dataref', name: GENERIC_DATAREFS.vso, required: false, purpose: 'Stall speed, landing configuration' },
        { kind: 'dataref', name: GENERIC_DATAREFS.vs, required: false, purpose: 'Stall speed, clean' },
        { kind: 'dataref', name: GENERIC_DATAREFS.vfe, required: false, purpose: 'Maximum flap extended speed' },
        { kind: 'dataref', name: GENERIC_DATAREFS.vno, required: false, purpose: 'Maximum structural cruising speed' },
        { kind: 'dataref', name: GENERIC_DATAREFS.vne, required: false, purpose: 'Never-exceed speed' },
      ],
    },
    {
      id: FEATURE_ALTIMETER_SETTING,
      label: 'Altimeter setting',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.barometer,
          required: true,
          write: true,
          purpose: 'Altimeter setting, written when you change it',
        },
      ],
    },
```

(Prettier will re-wrap the one-line bindings; run `npm run format` on the file.) Extend the profile's doc comment by one sentence: the instruments (F-10) bind only optional names so a miss costs one instrument; the altimeter setting's one binding is required and written, so a read-only resolution disables only its controls (R5).

- [ ] **Step 4: Extend the mock server**

Append to `DEFAULT_MOCK_DATAREFS` (after id 1022), values describing a C172 in a gentle climbing right turn:

```ts
  { id: 1023, name: 'sim/cockpit2/gauges/indicators/mach_pilot', valueType: 'float', value: 0.18 },
  { id: 1024, name: 'sim/cockpit2/gauges/indicators/altitude_ft_pilot', valueType: 'float', value: 4520 },
  { id: 1025, name: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot', valueType: 'float', value: 500 },
  { id: 1026, name: 'sim/cockpit2/gauges/indicators/heading_AHARS_deg_mag_pilot', valueType: 'float', value: 270 },
  { id: 1027, name: 'sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot', valueType: 'float', value: 3 },
  { id: 1028, name: 'sim/cockpit2/gauges/indicators/roll_AHARS_deg_pilot', valueType: 'float', value: 15 },
  { id: 1029, name: 'sim/cockpit2/gauges/indicators/turn_rate_roll_deg_pilot', valueType: 'float', value: 20 },
  { id: 1030, name: 'sim/cockpit2/gauges/indicators/slip_deg', valueType: 'float', value: 0 },
  { id: 1031, name: 'sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot', valueType: 'float', value: 850 },
  { id: 1032, name: 'sim/aircraft/prop/acf_en_type', valueType: 'int_array', value: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 1033, name: 'sim/aircraft/view/acf_Vso', valueType: 'float', value: 40 },
  { id: 1034, name: 'sim/aircraft/view/acf_Vs', valueType: 'float', value: 48 },
  { id: 1035, name: 'sim/aircraft/view/acf_Vfe', valueType: 'float', value: 85 },
  { id: 1036, name: 'sim/aircraft/view/acf_Vno', valueType: 'float', value: 129 },
  { id: 1037, name: 'sim/aircraft/view/acf_Vne', valueType: 'float', value: 163 },
  {
    id: 1038,
    name: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
    valueType: 'float',
    value: 29.92,
    writable: true,
  },
```

- [ ] **Step 5: Run the tests, then the gate**

Run the Step 2 command → PASS. Run the full gate and fix the fallout **only in tests**: profile version strings, feature counts, mock DataRef counts, and `simulator-session.test.ts`'s fake DataRefs. For the session test, follow the existing `FLIGHT_DATA_FAKE_DATAREFS` pattern (a scoped list merged only into the "every feature available" test): add `INSTRUMENT_FAKE_DATAREFS` with the 17 names (the barometer writable) and merge it there too. A test that now sees `altimeter-setting` unavailable because its fake lacks the barometer should get the scoped list merged, not a weakened assertion.

- [ ] **Step 6: Commit**

```bash
git add src/domain/aircraft/profiles/generic.ts tests
git commit -m "feat(instruments): profile 1.2.0 with flight instruments and the altimeter setting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Instrument face, values hook and the six-pack

**Files:**
- Create: `src/features/panels/instruments/useInstrumentValues.ts`
- Create: `src/features/panels/instruments/InstrumentFace.tsx`
- Create: `src/features/panels/instruments/svg-parts.tsx`
- Create: `src/features/panels/instruments/AttitudeScene.tsx`
- Create: `src/features/panels/instruments/six-pack/AirspeedDial.tsx`, `AttitudeIndicator.tsx`, `AltimeterDial.tsx`, `TurnCoordinator.tsx`, `HeadingIndicator.tsx`, `VsiDial.tsx`, `SixPackView.tsx`
- Test: `tests/ui/instruments-six-pack.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 (`useTheme().instrument`, geometry, labels, baro, speed markings, `GENERIC_DATAREFS`), `usePanel()` from `@/features/panels/primitives/PanelContext`, `useUnits()` from `@/features/units/UnitsProvider`.
- Produces:
  - `useInstrumentValues(): InstrumentValues` (shape below), `firstNumber(value: DataRefValue | undefined): number | null`.
  - `InstrumentFace` props `{ testID, label, status, width, height, viewBox: { width; height }, scale: ReactNode, children?: ReactNode }`.
  - `DigitalWindow` props `{ x, y, width, text, fontSize? }` (SVG, centred on `x`).
  - `AttitudeScene` props `{ pitch, roll, slip: number | null, cx, cy, pxPerDeg, windowDeg, bankRadius, clip: { kind: 'circle'; r: number } | { kind: 'rect'; width: number; height: number } }`.
  - `SixPackView` props `{ contentWidth: number; windowHeight: number; landscape: boolean }`.
  - testIDs: `instrument-airspeed`, `instrument-attitude`, `instrument-altitude`, `instrument-turn`, `instrument-heading`, `instrument-vertical-speed`, `six-pack`.

`InstrumentValues`:

```ts
export interface InstrumentValues {
  airspeed: { status: InstrumentStatus; knots: number | null; mach: number | null };
  attitude: { status: InstrumentStatus; pitch: number | null; roll: number | null };
  altitude: {
    status: InstrumentStatus;
    feet: number | null;
    radioAltitude: number | null;
    baroShort: string | null;
    baroText: string | null;
    baroWords: string | null;
  };
  verticalSpeed: { status: InstrumentStatus; fpm: number | null };
  heading: { status: InstrumentStatus; degrees: number | null };
  turn: { status: InstrumentStatus; rate: number | null; slip: number | null };
  markings: SpeedMarkings | null;
}
```

- [ ] **Step 1: Write the failing test**

`tests/ui/instruments-six-pack.test.tsx`. Build snapshots exactly as `tests/ui/flight-data-panel.test.tsx` does (copy its `NOW`, `base`, `telemetry()`, `live()`, `withMissing()` helpers). Render inside `ThemeProvider` → `UnitsProvider` → `PanelScope`:

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { SixPackView } from '@/features/panels/instruments/six-pack/SixPackView';
import { instrumentRenders } from '@/features/panels/instruments/svg-parts';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

const VALUES: Record<string, number | number[]> = {
  [D.airspeed]: 112.4,
  [D.mach]: 0.18,
  [D.altitude]: 4524,
  [D.verticalSpeed]: 503,
  [D.heading]: 270.2,
  [D.pitch]: 3.2,
  [D.roll]: 15.4,
  [D.turnRate]: 24,
  [D.slip]: 2.2,
  [D.radioAltitude]: 3000,
  [D.engineType]: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [D.vso]: 40,
  [D.vs]: 48,
  [D.vfe]: 85,
  [D.vno]: 129,
  [D.vne]: 163,
  [D.barometer]: 29.92,
};

function telemetry(values: Record<string, number | number[] | string>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: telemetry(VALUES),
    ...overrides,
  };
}

function withMissing(snapshot: SessionSnapshot, ...names: string[]): SessionSnapshot {
  const bindings = { ...snapshot.compatibility.bindings };
  for (const name of names) {
    bindings[name] = { name, kind: 'dataref', status: 'missing' };
  }
  return { ...snapshot, compatibility: { ...snapshot.compatibility, bindings } };
}

const actions = { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };

function tree(snapshot: SessionSnapshot, storage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="dark">
      <UnitsProvider storage={storage}>
        <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
          <SixPackView contentWidth={400} windowHeight={900} landscape={false} />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
}

describe('six-pack', () => {
  it('names every instrument and its value', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();
    expect(screen.getByLabelText('Attitude: pitch 3 degrees up, bank 15 degrees right')).toBeTruthy();
    expect(
      screen.getByLabelText('Altitude 4,520 feet, altimeter 29.92 inches, standard'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Turn: rate 1.2 standard rate right, ball 2 degrees right')).toBeTruthy();
    expect(screen.getByLabelText('Heading 270 degrees')).toBeTruthy();
    expect(screen.getByLabelText('Vertical speed climbing 500 feet per minute')).toBeTruthy();
  });

  it('marks only the instrument whose DataRef is missing', async () => {
    await render(tree(withMissing(live(), D.pitch)));
    expect(screen.getByLabelText('Attitude: not available on this aircraft')).toBeTruthy();
    expect(screen.getByText('Not available on this aircraft')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();
    expect(screen.getByLabelText('Heading 270 degrees')).toBeTruthy();
  });

  it('keeps the last values with a NOT LIVE flag on every instrument when the link drops', async () => {
    await render(tree(live({ state: 'reconnecting' })));
    expect(screen.getByLabelText('Airspeed 112 knots, not live')).toBeTruthy();
    expect(
      screen.getByLabelText('Attitude: pitch 3 degrees up, bank 15 degrees right, not live'),
    ).toBeTruthy();
    expect(screen.getAllByText('NOT LIVE')).toHaveLength(6);
  });

  it('shows no values with no flight loaded', async () => {
    await render(
      tree(live({ health: { ...base.health, activity: 'noFlight', live: false, lastHeartbeatAt: NOW } })),
    );
    expect(screen.getByLabelText('Airspeed: no value')).toBeTruthy();
    expect(screen.getByLabelText('Attitude: no value')).toBeTruthy();
    expect(screen.queryAllByText('NOT LIVE')).toHaveLength(0);
  });

  it('treats a non-numeric or non-finite sample as no value', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        telemetry: { ...snapshot.telemetry, ...telemetry({ [D.airspeed]: Number.NaN, [D.heading]: 'x' }) },
      }),
    );
    expect(screen.getByLabelText('Airspeed: no value')).toBeTruthy();
    expect(screen.getByLabelText('Heading: no value')).toBeTruthy();
  });

  it('keeps the turn coordinator for the ball when turn rate is missing', async () => {
    await render(tree(withMissing(live(), D.turnRate)));
    expect(screen.getByLabelText('Turn: ball 2 degrees right')).toBeTruthy();
  });

  it('describes a vertical speed beyond the dial by its true value', async () => {
    const snapshot = live();
    await render(
      tree({ ...snapshot, telemetry: { ...snapshot.telemetry, ...telemetry({ [D.verticalSpeed]: 2500 }) } }),
    );
    expect(screen.getByLabelText('Vertical speed climbing 2,500 feet per minute')).toBeTruthy();
  });

  it('re-renders only the altimeter when only the altitude changes', async () => {
    const storage = createMemorySettingsStorage();
    const first = live();
    const view = await render(tree(first, storage));
    for (const key of Object.keys(instrumentRenders)) {
      instrumentRenders[key] = 0;
    }
    await view.rerender(
      tree(
        { ...first, telemetry: { ...first.telemetry, ...telemetry({ [D.altitude]: 4600 }) } },
        storage,
      ),
    );
    expect(
      screen.getByLabelText('Altitude 4,600 feet, altimeter 29.92 inches, standard'),
    ).toBeTruthy();
    expect(instrumentRenders['instrument-altitude']).toBe(1);
    expect(instrumentRenders['instrument-airspeed'] ?? 0).toBe(0);
    expect(instrumentRenders['instrument-attitude'] ?? 0).toBe(0);
  });
});
```

`instrumentRenders` is a test hook exported from `svg-parts.tsx` (Step 4): `InstrumentFace` increments `instrumentRenders[testID]` on each render.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/ui/instruments-six-pack.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the values hook**

`src/features/panels/instruments/useInstrumentValues.ts`:

```ts
import { useMemo } from 'react';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { baroShort, baroWords, formatBaro } from '@/domain/instruments/baro';
import { type InstrumentStatus, instrumentStatus } from '@/domain/instruments/labels';
import { type SpeedMarkings, speedMarkings } from '@/domain/instruments/speed-markings';
import type { DataRefValue } from '@/domain/simulator/types';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useUnits } from '@/features/units/UnitsProvider';

export interface InstrumentValues {
  // (the interface exactly as in this task's Interfaces block)
}

/** A finite number, or the first element of a numeric array; anything else is no value. */
export function firstNumber(value: DataRefValue | undefined): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

/**
 * Every instrument value, read once per render and reduced to primitives, so each `React.memo`
 * instrument re-renders only when its own numbers change (spec: "Performance"). No flight loaded
 * means no values at all (R8); freshness is the link's, never a sample's (spec: "Values and states").
 */
export function useInstrumentValues(): InstrumentValues {
  const { snapshot, link } = usePanel();
  const { units } = useUnits();
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const missing = (name: string) => snapshot.compatibility.bindings[name]?.status === 'missing';
  const read = (name: string) =>
    noFlight || missing(name) ? null : firstNumber(snapshot.telemetry[name]?.value);
  const current = link.valuesCurrent;
  const status = (names: readonly string[], values: readonly (number | null)[]) =>
    instrumentStatus(
      names.some(missing),
      values.every((value) => value !== null),
      current,
    );

  const knots = read(D.airspeed);
  const pitch = read(D.pitch);
  const roll = read(D.roll);
  const feet = read(D.altitude);
  const fpm = read(D.verticalSpeed);
  const degrees = read(D.heading);
  const rate = read(D.turnRate);
  const slip = read(D.slip);
  const baro = read(D.barometer);
  const unit = units.pressure;

  const vso = read(D.vso);
  const vs = read(D.vs);
  const vfe = read(D.vfe);
  const vno = read(D.vno);
  const vne = read(D.vne);
  const markings = useMemo<SpeedMarkings | null>(
    () => speedMarkings({ vso, vs, vfe, vno, vne }),
    [vso, vs, vfe, vno, vne],
  );

  // Turn and slip share a face: it is unavailable only when both are missing, and shows whichever
  // part has a value.
  const turnMissing = missing(D.turnRate) && missing(D.slip);
  const turnStatus: InstrumentStatus = instrumentStatus(
    turnMissing,
    rate !== null || slip !== null,
    current,
  );

  return {
    airspeed: { status: status([D.airspeed], [knots]), knots, mach: read(D.mach) },
    attitude: { status: status([D.pitch, D.roll], [pitch, roll]), pitch, roll },
    altitude: {
      status: status([D.altitude], [feet]),
      feet,
      radioAltitude: read(D.radioAltitude),
      baroShort: baro === null ? null : baroShort(baro, unit),
      baroText: baro === null ? null : formatBaro(baro, unit),
      baroWords: baro === null ? null : baroWords(baro, unit),
    },
    verticalSpeed: { status: status([D.verticalSpeed], [fpm]), fpm },
    heading: { status: status([D.heading], [degrees]), degrees },
    turn: { status: turnStatus, rate, slip },
    markings,
  };
}
```

Write the `InstrumentValues` interface in full (from the Interfaces block) — do not leave the comment.

- [ ] **Step 4: Implement the face and shared SVG parts**

`src/features/panels/instruments/svg-parts.tsx`:

```tsx
import React from 'react';
import { Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme/theme-context';

/** Test hook: how many times each instrument face rendered (the memoisation test reads it). */
export const instrumentRenders: Record<string, number> = {};

/** A boxed number, centred on `x`, baseline-centred on `y`. */
export function DigitalWindow({
  x,
  y,
  width,
  text,
  fontSize = 18,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize?: number;
}) {
  const ink = useTheme().instrument;
  const height = fontSize + 8;
  return (
    <>
      <Rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        fill={ink.face}
        stroke={ink.marking}
        strokeWidth={1.5}
        rx={3}
      />
      <SvgText
        x={x}
        y={y + fontSize * 0.35}
        fontSize={fontSize}
        fontWeight="bold"
        fill={ink.marking}
        textAnchor="middle"
      >
        {text}
      </SvgText>
    </>
  );
}
```

`src/features/panels/instruments/InstrumentFace.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { G, Line } from 'react-native-svg';

import type { InstrumentStatus } from '@/domain/instruments/labels';
import { instrumentRenders } from '@/features/panels/instruments/svg-parts';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** How much a stale instrument's pointers and digits fade behind the red X. */
const NOT_LIVE_OPACITY = 0.4;

const makeStyles = (theme: Theme) => ({
  overlay: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing.xs,
  },
  flag: {
    backgroundColor: theme.instrument.flag,
    color: theme.instrument.flagText,
    fontSize: theme.typography.bodySize,
    fontWeight: 'bold' as const,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    overflow: 'hidden' as const,
  },
  note: {
    color: theme.instrument.marking,
    fontSize: theme.typography.bodySize,
    textAlign: 'center' as const,
  },
});

interface Props {
  testID: string;
  label: string;
  status: InstrumentStatus;
  width: number;
  height: number;
  viewBox: { width: number; height: number };
  /** Drawn in every state: the face and its fixed scale. */
  scale: React.ReactNode;
  /** Drawn only with a value: pointers, tapes, digits (R8, R9 — never a default in their place). */
  children?: React.ReactNode;
}

/**
 * Every instrument's frame: one accessible element carrying its value in words, and the four
 * states of the spec's table. Not live keeps the last pointers, faded, under a red X with a
 * NOT LIVE flag — the failure flag pilots know, so a frozen instrument is never mistaken for a
 * working one (R6, R7).
 */
export function InstrumentFace({ testID, label, status, width, height, viewBox, scale, children }: Props) {
  instrumentRenders[testID] = (instrumentRenders[testID] ?? 0) + 1;
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const hasValue = status === 'live' || status === 'notLive';
  const stroke = viewBox.width / 40;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width, height }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}>
        {scale}
        {hasValue ? <G opacity={status === 'notLive' ? NOT_LIVE_OPACITY : 1}>{children}</G> : null}
        {status === 'notLive' ? (
          <G>
            <Line x1={0} y1={0} x2={viewBox.width} y2={viewBox.height} stroke={theme.instrument.flag} strokeWidth={stroke} />
            <Line x1={viewBox.width} y1={0} x2={0} y2={viewBox.height} stroke={theme.instrument.flag} strokeWidth={stroke} />
          </G>
        ) : null}
      </Svg>
      {status === 'notLive' ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.flag}>NOT LIVE</Text>
        </View>
      ) : null}
      {status === 'unavailable' ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.note}>Not available on this aircraft</Text>
        </View>
      ) : null}
      {status === 'noValue' ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.note}>—</Text>
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: Implement the attitude scene**

`src/features/panels/instruments/AttitudeScene.tsx`:

```tsx
import React, { useId } from 'react';
import { Circle, ClipPath, Defs, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import {
  BANK_MARKS,
  attitudeTransform,
  pitchLadder,
  polar,
  slipOffset,
} from '@/domain/instruments/geometry';
import { useTheme } from '@/theme/theme-context';

type Clip = { kind: 'circle'; r: number } | { kind: 'rect'; width: number; height: number };

interface Props {
  pitch: number;
  roll: number;
  /** The PFD draws slip under the roll pointer; the six-pack leaves it to the turn coordinator. */
  slip: number | null;
  cx: number;
  cy: number;
  pxPerDeg: number;
  windowDeg: number;
  bankRadius: number;
  clip: Clip;
}

const BIG = 2000;

/**
 * Sky, ground and the pitch ladder move together: translated by pitch, then rotated by −roll about
 * the centre. The bank scale and aircraft symbol stay fixed; the roll pointer rotates with the sky.
 */
export function AttitudeScene({ pitch, roll, slip, cx, cy, pxPerDeg, windowDeg, bankRadius, clip }: Props) {
  const ink = useTheme().instrument;
  const clipId = `attitude${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { rotateDeg, translateY } = attitudeTransform(pitch, roll, pxPerDeg);
  const bank = BANK_MARKS.flatMap((deg) => [deg, -deg]);
  return (
    <>
      <Defs>
        <ClipPath id={clipId}>
          {clip.kind === 'circle' ? (
            <Circle cx={cx} cy={cy} r={clip.r} />
          ) : (
            <Rect x={0} y={0} width={clip.width} height={clip.height} />
          )}
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <G transform={`rotate(${rotateDeg} ${cx} ${cy}) translate(0 ${translateY})`}>
          <Rect x={cx - BIG} y={cy - BIG} width={BIG * 2} height={BIG} fill={ink.sky} />
          <Rect x={cx - BIG} y={cy} width={BIG * 2} height={BIG} fill={ink.ground} />
          <Line x1={cx - BIG} y1={cy} x2={cx + BIG} y2={cy} stroke={ink.horizon} strokeWidth={2} />
          {pitchLadder(pitch, windowDeg).map((mark) => {
            const y = cy - mark.deg * pxPerDeg;
            const half = mark.major ? 30 : 15;
            return (
              <G key={mark.deg}>
                <Line x1={cx - half} y1={y} x2={cx + half} y2={y} stroke={ink.marking} strokeWidth={2} />
                {mark.major ? (
                  <>
                    <SvgText x={cx - half - 4} y={y + 5} fontSize={14} fill={ink.marking} textAnchor="end">
                      {String(Math.abs(mark.deg))}
                    </SvgText>
                    <SvgText x={cx + half + 4} y={y + 5} fontSize={14} fill={ink.marking} textAnchor="start">
                      {String(Math.abs(mark.deg))}
                    </SvgText>
                  </>
                ) : null}
              </G>
            );
          })}
        </G>
        {bank.map((deg) => {
          const outer = polar(cx, cy, bankRadius, deg);
          const inner = polar(cx, cy, bankRadius - (Math.abs(deg) % 30 === 0 ? 12 : 7), deg);
          return (
            <Line key={deg} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={ink.marking} strokeWidth={2} />
          );
        })}
        <Polygon
          points={`${cx},${cy - bankRadius} ${cx - 6},${cy - bankRadius - 9} ${cx + 6},${cy - bankRadius - 9}`}
          fill={ink.marking}
        />
        <G transform={`rotate(${rotateDeg} ${cx} ${cy})`}>
          <Polygon
            points={`${cx},${cy - bankRadius + 2} ${cx - 7},${cy - bankRadius + 14} ${cx + 7},${cy - bankRadius + 14}`}
            fill={ink.pointer}
          />
          {slip === null ? null : (
            <Rect
              x={cx - 8 + slipOffset(slip, 8)}
              y={cy - bankRadius + 16}
              width={16}
              height={5}
              fill={ink.pointer}
            />
          )}
        </G>
        <Line x1={cx - 50} y1={cy} x2={cx - 16} y2={cy} stroke={ink.pointer} strokeWidth={5} strokeLinecap="round" />
        <Line x1={cx + 16} y1={cy} x2={cx + 50} y2={cy} stroke={ink.pointer} strokeWidth={5} strokeLinecap="round" />
        <Circle cx={cx} cy={cy} r={3.5} fill={ink.pointer} />
      </G>
    </>
  );
}
```

- [ ] **Step 6: Implement the six gauges**

All six gauges use `const VB = { width: 200, height: 200 }` and centre `C = 100`, are wrapped in `React.memo`, take only primitives (plus the memoised `markings`), and compute their label with `withStatus(<name>, status, () => describe…(…))`. Guard every `describe` call's arguments with the values already checked by status (use `?? 0` only inside the `describe` closure, which `withStatus` never calls without a value).

`six-pack/AirspeedDial.tsx`:

```tsx
import React from 'react';
import { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import {
  airspeedAngle,
  airspeedDialMax,
  arcPath,
  polar,
  scaleTicks,
} from '@/domain/instruments/geometry';
import { type InstrumentStatus, describeAirspeed, machShown, withStatus } from '@/domain/instruments/labels';
import { type SpeedMarkings, speedBands } from '@/domain/instruments/speed-markings';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { DigitalWindow } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 200 };
const C = 100;
const ARC_COLOR = { white: 'arcWhite', green: 'arcGreen', yellow: 'arcYellow' } as const;

export const AirspeedDial = React.memo(function AirspeedDial({
  size,
  status,
  knots,
  mach,
  markings,
}: {
  size: number;
  status: InstrumentStatus;
  knots: number | null;
  mach: number | null;
  markings: SpeedMarkings | null;
}) {
  const ink = useTheme().instrument;
  const max = airspeedDialMax(markings?.vne ?? null);
  const angle = (value: number) => airspeedAngle(value, max);
  const ticks = scaleTicks(0, max, 10, max <= 200 ? 20 : 40);
  const label = withStatus('Airspeed', status, () => describeAirspeed(knots ?? 0, mach));
  const redOuter = markings === null ? null : polar(C, C, 94, angle(markings.vne));
  const redInner = markings === null ? null : polar(C, C, 74, angle(markings.vne));
  const scale = (
    <>
      <Circle cx={C} cy={C} r={98} fill={ink.face} />
      {markings === null
        ? null
        : speedBands(markings).map((band) => (
            <Path
              key={band.color}
              d={arcPath(C, C, band.color === 'white' ? 78 : 86, angle(band.from), angle(band.to))}
              stroke={ink[ARC_COLOR[band.color]]}
              strokeWidth={6}
              fill="none"
            />
          ))}
      {redOuter === null || redInner === null ? null : (
        <Line x1={redInner.x} y1={redInner.y} x2={redOuter.x} y2={redOuter.y} stroke={ink.arcRed} strokeWidth={4} />
      )}
      {ticks.map((tick) => {
        const outer = polar(C, C, 94, angle(tick.value));
        const inner = polar(C, C, tick.major ? 82 : 88, angle(tick.value));
        return (
          <Line key={tick.value} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={ink.marking} strokeWidth={tick.major ? 2.5 : 1.5} />
        );
      })}
      {ticks
        .filter((tick) => tick.major)
        .map((tick) => {
          const at = polar(C, C, 66, angle(tick.value));
          return (
            <SvgText key={`label${tick.value}`} x={at.x} y={at.y + 5} fontSize={14} fill={ink.marking} textAnchor="middle">
              {String(tick.value)}
            </SvgText>
          );
        })}
      <SvgText x={C} y={78} fontSize={14} fill={ink.marking} textAnchor="middle">
        KNOTS
      </SvgText>
    </>
  );
  return (
    <InstrumentFace testID="instrument-airspeed" label={label} status={status} width={size} height={size} viewBox={VB} scale={scale}>
      {knots === null ? null : (
        <>
          <G transform={`rotate(${angle(knots)} ${C} ${C})`}>
            <Line x1={C} y1={C + 14} x2={C} y2={14} stroke={ink.marking} strokeWidth={4} strokeLinecap="round" />
          </G>
          <Circle cx={C} cy={C} r={6} fill={ink.marking} />
          <DigitalWindow x={C} y={136} width={64} text={String(Math.round(knots))} />
          {machShown(mach) ? (
            <SvgText x={C} y={168} fontSize={14} fill={ink.marking} textAnchor="middle">
              {`M ${mach.toFixed(2)}`}
            </SvgText>
          ) : null}
        </>
      )}
    </InstrumentFace>
  );
});
```

`six-pack/AttitudeIndicator.tsx` — `React.memo`, props `{ size, status, pitch: number | null, roll: number | null }`; label `withStatus('Attitude', status, () => describeAttitude(pitch ?? 0, roll ?? 0))`; testID `instrument-attitude`; scale `<Circle cx={100} cy={100} r={98} fill={ink.face} />`; children, only when both are non-null:

```tsx
<AttitudeScene pitch={pitch} roll={roll} slip={null} cx={100} cy={100} pxPerDeg={4.5} windowDeg={20} bankRadius={88} clip={{ kind: 'circle', r: 96 }} />
```

`six-pack/AltimeterDial.tsx` — `React.memo`, props `{ size, status, feet: number | null, baroShort: string | null, baroWords: string | null, radioAltitude: number | null }`; testID `instrument-altitude`; label `withStatus('Altitude', status, () => describeAltitude(feet ?? 0, baroWords, radioAltitude))`. Scale: face circle r 98; `scaleTicks(0, 1000, 20, 100)` without the 1000 duplicate (filter `tick.value < 1000`), each tick at angle `tick.value * 0.36`, majors 12 long, minors 6; labels `0`–`9` at radius 70 for majors (`String(tick.value / 100)`). Children when `feet !== null`, using `altimeterHands(feet)`:

```tsx
<G transform={`rotate(${hands.thousandsDeg} 100 100)`}>
  <Line x1={100} y1={110} x2={100} y2={48} stroke={ink.marking} strokeWidth={8} strokeLinecap="round" />
</G>
<G transform={`rotate(${hands.hundredsDeg} 100 100)`}>
  <Line x1={100} y1={112} x2={100} y2={14} stroke={ink.marking} strokeWidth={3.5} strokeLinecap="round" />
</G>
<Circle cx={100} cy={100} r={6} fill={ink.marking} />
<DigitalWindow x={100} y={136} width={84} text={groupThousands(roundAltitude(feet))} />
{baroShort === null ? null : <DigitalWindow x={100} y={166} width={64} text={baroShort} fontSize={14} />}
{radioAltitudeShown(radioAltitude) ? (
  <SvgText x={100} y={62} fontSize={14} fill={ink.marking} textAnchor="middle">{`RA ${Math.round(radioAltitude)}`}</SvgText>
) : null}
```

`six-pack/VsiDial.tsx` — `React.memo`, props `{ size, status, fpm: number | null }`; testID `instrument-vertical-speed`; label `withStatus('Vertical speed', status, () => describeVerticalSpeed(fpm ?? 0))`. Scale: face; ticks for `scaleTicks(-2000, 2000, 100, 500)` at `vsiAngle(tick.value)` (majors 12, minors 6); labels at the majors of 0, ±500, ±1000, ±1500, ±2000 as `0`, `.5`, `1`, `1.5`, `2` (absolute thousands; write a tiny local `thousands(value)` helper) at radius 68; `UP` at (70, 64) and `DN` at (70, 146), fontSize 14. Children when `fpm !== null`: needle `rotate(${vsiAngle(fpm)} 100 100)` from (100, 112) to (100, 16), hub, and `DigitalWindow x={140} y={100} width={64} text={groupThousands(roundVerticalSpeed(fpm))}` with fontSize 14.

`six-pack/HeadingIndicator.tsx` — `React.memo`, props `{ size, status, degrees: number | null }`; testID `instrument-heading`; label `withStatus('Heading', status, () => describeHeading(degrees ?? 0))`. Scale: face. Children when `degrees !== null`:

```tsx
<G transform={`rotate(${headingCardRotation(degrees)} 100 100)`}>
  {scaleTicks(0, 355, 5, 10).map((tick) => {
    const outer = polar(100, 100, 94, tick.value);
    const inner = polar(100, 100, tick.major ? 82 : 88, tick.value);
    return <Line key={tick.value} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={ink.marking} strokeWidth={tick.major ? 2.5 : 1.5} />;
  })}
  {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
    <SvgText key={deg} x={100} y={36} fontSize={16} fontWeight="bold" fill={ink.marking} textAnchor="middle" transform={`rotate(${deg} 100 100)`}>
      {headingTickLabel(deg)}
    </SvgText>
  ))}
</G>
<Polygon points="100,4 94,16 106,16" fill={ink.pointer} />
<Line x1={100} y1={78} x2={100} y2={122} stroke={ink.pointer} strokeWidth={4} />
<Line x1={80} y1={94} x2={120} y2={94} stroke={ink.pointer} strokeWidth={4} />
<DigitalWindow x={100} y={150} width={56} text={headingText(degrees)} fontSize={16} />
```

`six-pack/TurnCoordinator.tsx` — `React.memo`, props `{ size, status, rate: number | null, slip: number | null }`; testID `instrument-turn`; label `withStatus('Turn', status, () => describeTurn(rate, slip))`. Scale: face; level marks at 90° and 270° and standard-rate marks at `90 + STANDARD_RATE_DEFLECTION_DEG` and `270 - STANDARD_RATE_DEFLECTION_DEG` (lines from radius 94 to 80, strokeWidth 3); `L` and `R` (fontSize 14) just inside the standard-rate marks; `2 MIN` at (100, 190) fontSize 12 is **not** allowed (below the 14 minimum) — use fontSize 14 at (100, 188); the ball tube `Rect x={62} y={138} width={76} height={22} rx={11} stroke={ink.marking} strokeWidth={2} fill="none"` and centre lines at x 89 and 111. Children:

```tsx
{rate === null ? null : (
  <G transform={`rotate(${turnDeflection(rate)} 100 100)`}>
    <Line x1={30} y1={100} x2={170} y2={100} stroke={ink.marking} strokeWidth={5} strokeLinecap="round" />
    <Circle cx={100} cy={100} r={10} fill={ink.marking} />
    <Line x1={100} y1={90} x2={100} y2={76} stroke={ink.marking} strokeWidth={4} />
  </G>
)}
{slip === null ? null : <Circle cx={100 + slipOffset(slip, 27)} cy={149} r={9} fill={ink.marking} />}
```

- [ ] **Step 7: Implement `SixPackView`**

```tsx
import React from 'react';
import { View } from 'react-native';

import { sixPackLayout } from '@/domain/instruments/geometry';
import { AirspeedDial } from '@/features/panels/instruments/six-pack/AirspeedDial';
import { AltimeterDial } from '@/features/panels/instruments/six-pack/AltimeterDial';
import { AttitudeIndicator } from '@/features/panels/instruments/six-pack/AttitudeIndicator';
import { HeadingIndicator } from '@/features/panels/instruments/six-pack/HeadingIndicator';
import { TurnCoordinator } from '@/features/panels/instruments/six-pack/TurnCoordinator';
import { VsiDial } from '@/features/panels/instruments/six-pack/VsiDial';
import { useInstrumentValues } from '@/features/panels/instruments/useInstrumentValues';
import { useTheme } from '@/theme/theme-context';

/**
 * The classic T in landscape (airspeed, attitude, altimeter / turn, heading, vertical speed). In
 * portrait's two columns the pairs stay related: speed beside attitude, the two vertical
 * instruments together, the two lateral ones together.
 */
export function SixPackView({
  contentWidth,
  windowHeight,
  landscape,
}: {
  contentWidth: number;
  windowHeight: number;
  landscape: boolean;
}) {
  const gap = useTheme().spacing.sm;
  const { size } = sixPackLayout(contentWidth, windowHeight, landscape, gap);
  const v = useInstrumentValues();
  const airspeed = <AirspeedDial key="airspeed" size={size} {...v.airspeed} markings={v.markings} />;
  const attitude = <AttitudeIndicator key="attitude" size={size} {...v.attitude} />;
  const altitude = (
    <AltimeterDial
      key="altitude"
      size={size}
      status={v.altitude.status}
      feet={v.altitude.feet}
      baroShort={v.altitude.baroShort}
      baroWords={v.altitude.baroWords}
      radioAltitude={v.altitude.radioAltitude}
    />
  );
  const turn = <TurnCoordinator key="turn" size={size} {...v.turn} />;
  const heading = <HeadingIndicator key="heading" size={size} {...v.heading} />;
  const verticalSpeed = <VsiDial key="vertical-speed" size={size} {...v.verticalSpeed} />;
  const order = landscape
    ? [airspeed, attitude, altitude, turn, heading, verticalSpeed]
    : [airspeed, attitude, altitude, verticalSpeed, turn, heading];
  return (
    <View
      testID="six-pack"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap, justifyContent: 'center' }}
    >
      {order}
    </View>
  );
}
```

- [ ] **Step 8: Run the test, then the gate**

Run: `npx jest tests/ui/instruments-six-pack.test.tsx` → PASS. Then the full gate.

- [ ] **Step 9: Commit**

```bash
git add src/features/panels/instruments tests/ui/instruments-six-pack.test.tsx
git commit -m "feat(instruments): instrument face, values hook and the six-pack

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The PFD

**Files:**
- Create: `src/features/panels/instruments/pfd/SpeedTape.tsx`, `AttitudeDisplay.tsx`, `AltitudeTape.tsx`, `VsiScale.tsx`, `HeadingTape.tsx`, `TurnRateScale.tsx`, `PfdView.tsx`
- Test: `tests/ui/instruments-pfd.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`useInstrumentValues`, `InstrumentFace`, `DigitalWindow`, `AttitudeScene`), Task 3 geometry, Task 4 labels.
- Produces: `PfdView` props `{ width: number }`; testIDs `pfd` plus the same six `instrument-*` testIDs as the six-pack (exactly one of each is on screen, since only one presentation renders at a time).

Layout in `viewBox` units (`scale = width / 360`): row 1 (height 240): speed tape 60, attitude 200, altitude tape 60, VSI scale 40. Row 2 (height 40): Mach box 60, heading tape 200, altimeter-setting box 100. Row 3 (height 20): 60 spacer, turn-rate scale 200.

- [ ] **Step 1: Write the failing test**

`tests/ui/instruments-pfd.test.tsx`: copy the helpers from `tests/ui/instruments-six-pack.test.tsx` (VALUES, `telemetry`, `live`, `withMissing`, `tree`) but render `<PfdView width={360} />`. Tests:

```tsx
describe('PFD', () => {
  it('names every instrument exactly as the six-pack does', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();
    expect(screen.getByLabelText('Attitude: pitch 3 degrees up, bank 15 degrees right')).toBeTruthy();
    expect(
      screen.getByLabelText('Altitude 4,520 feet, altimeter 29.92 inches, standard'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Turn: rate 1.2 standard rate right, ball 2 degrees right')).toBeTruthy();
    expect(screen.getByLabelText('Heading 270 degrees')).toBeTruthy();
    expect(screen.getByLabelText('Vertical speed climbing 500 feet per minute')).toBeTruthy();
  });

  it('shows the altimeter setting below the altitude tape in the chosen unit', async () => {
    await render(tree(live()));
    expect(screen.getByText('29.92 inHg STD')).toBeTruthy();
  });

  it('shows Mach from 0.40 only', async () => {
    const snapshot = live();
    await render(tree(snapshot));
    expect(screen.queryByText(/^M /)).toBeNull();
    await render(
      tree({ ...snapshot, telemetry: { ...snapshot.telemetry, ...telemetry({ [D.mach]: 0.782, [D.airspeed]: 280 }) } }),
    );
    expect(screen.getByText('M .782')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed 280 knots, Mach 0.78')).toBeTruthy();
  });

  it('adds radio altitude to the label at or below 2,500 ft', async () => {
    const snapshot = live();
    await render(
      tree({ ...snapshot, telemetry: { ...snapshot.telemetry, ...telemetry({ [D.radioAltitude]: 812.6, [D.altitude]: 820 }) } }),
    );
    expect(
      screen.getByLabelText('Altitude 820 feet, altimeter 29.92 inches, standard, radio altitude 813 feet'),
    ).toBeTruthy();
  });

  it('flags every instrument NOT LIVE when the link drops, keeping values', async () => {
    await render(tree(live({ state: 'reconnecting' })));
    expect(screen.getAllByText('NOT LIVE')).toHaveLength(6);
    expect(screen.getByLabelText('Heading 270 degrees, not live')).toBeTruthy();
  });

  it('marks only the missing instrument unavailable', async () => {
    await render(tree(withMissing(live(), D.verticalSpeed)));
    expect(screen.getByLabelText('Vertical speed: not available on this aircraft')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();
  });
});
```

The Mach box text is `M .782`-style: Mach to three decimals without the leading zero, as airliner PFDs show it (`M .78` would lose a digit the pilot reads). Implement `machText(mach)` locally in `PfdView.tsx` as `` `M ${mach.toFixed(3).replace(/^0/, '')}` ``.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/ui/instruments-pfd.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement the tapes**

`pfd/SpeedTape.tsx` — `React.memo`, props `{ width, height, status, knots: number | null, mach: number | null, markings: SpeedMarkings | null }`; `VB = { width: 60, height: 240 }`, centre `CY = 120`, `PX = 3` per knot (window ±40 kt); testID `instrument-airspeed`; label as the six-pack's. Scale: `<Rect x={0} y={0} width={60} height={240} fill={ink.tape} />`. Children when `knots !== null`:

```tsx
const y = (value: number) => CY - (value - knots) * PX;
const bandY = (from: number, to: number) => {
  const top = clamp(y(to), 0, VB.height);
  const bottom = clamp(y(from), 0, VB.height);
  return { top, height: Math.max(0, bottom - top) };
};
// …
{markings === null ? null : (
  <>
    {speedBands(markings).map((band) => {
      const { top, height } = bandY(band.from, band.to);
      return <Rect key={band.color} x={band.color === 'white' ? 50 : 54} y={top} width={band.color === 'white' ? 4 : 6} height={height} fill={ink[ARC_COLOR[band.color]]} />;
    })}
    {(() => {
      const { top, height } = bandY(markings.vne, markings.vne + 1000);
      return <Rect x={54} y={top} width={6} height={height} fill={ink.arcRed} />;
    })()}
  </>
)}
{tapeTicks(knots, 40, 10, 20, 0).map((tick) => (
  <G key={tick.value}>
    <Line x1={tick.labelled ? 42 : 48} y1={y(tick.value)} x2={60} y2={y(tick.value)} stroke={ink.marking} strokeWidth={2} />
    {tick.labelled ? (
      <SvgText x={38} y={y(tick.value) + 5} fontSize={14} fill={ink.marking} textAnchor="end">{String(tick.value)}</SvgText>
    ) : null}
  </G>
))}
<Rect x={0} y={CY - 14} width={50} height={28} fill={ink.face} stroke={ink.marking} strokeWidth={1.5} />
<SvgText x={46} y={CY + 7} fontSize={18} fontWeight="bold" fill={ink.marking} textAnchor="end">{String(Math.round(knots))}</SvgText>
```

(`ARC_COLOR` as in `AirspeedDial`; export it from `svg-parts.tsx` and import it in both, rather than duplicating.)

`pfd/AltitudeTape.tsx` — `React.memo`, props `{ width, height, status, feet, baroWords, radioAltitude }`; `VB = { width: 60, height: 240 }`, `CY = 120`, `PX = 0.3` per foot (window ±400 ft); testID `instrument-altitude`; label as the altimeter's. Scale: tape rect. Children when `feet !== null`: `tapeTicks(feet, 400, 100, 200)` lines from x 0 to 8 (labelled to 12), labels at x 14 (`textAnchor="start"`, fontSize 14, `groupThousands(tick.value)`); readout box `Rect x={1} y={CY - 14} width={59} height={28}` and text `groupThousands(roundAltitude(feet))` at x 57 `textAnchor="end"` fontSize 16 bold.

`pfd/VsiScale.tsx` — `React.memo`, props `{ width, height, status, fpm }`; `VB = { width: 40, height: 240 }`, `CY = 120`, `HALF = 110`; testID `instrument-vertical-speed`; label as the VSI's. Scale: tape rect; marks at 0 (x 28→40) and at `vsiScaleOffset(±500, HALF)`, `±1000`, `±2000` (x 32→40); labels `1` and `2` at `±1000` and `±2000` (x 22, `textAnchor="end"`, fontSize 14). Children when `fpm !== null`: `<Line x1={40} y1={CY} x2={10} y2={CY - vsiScaleOffset(fpm, HALF)} stroke={ink.marking} strokeWidth={3} />` and, when `vsiHundreds(fpm) !== ''`, `SvgText` at x 20 `textAnchor="middle"` fontSize 14 at y 16 (climbing) or 234 (descending).

`pfd/HeadingTape.tsx` — `React.memo`, props `{ width, height, status, degrees }`; `VB = { width: 200, height: 40 }`, `CX = 100`, `PX = 100 / 30`; testID `instrument-heading`; label as the heading indicator's. Scale: tape rect. Children when `degrees !== null`: `headingTicks(degrees, 30)` lines at `x = CX + tick.offset * PX` from y 40 to 32 (labelled) or 36; labels at y 30 (fontSize 14, `headingTickLabel(tick.value)`) for labelled ticks; lubber `Polygon points="100,32 95,40 105,40"` in `ink.pointer`; readout `DigitalWindow x={CX} y={10} width={48} text={headingText(degrees)} fontSize={14}`.

`pfd/TurnRateScale.tsx` — `React.memo`, props `{ width, height, status, rate, slip }`; `VB = { width: 200, height: 20 }`, `CX = 100`, `PX_PER_DEG = 2`; testID `instrument-turn`; label `withStatus('Turn', status, () => describeTurn(rate, slip))`. Scale: tape rect, centre mark at x 100 and standard-rate marks at `CX ± STANDARD_RATE_DEFLECTION_DEG * PX_PER_DEG` (y 2→18, strokeWidth 2). Children when `rate !== null`: `Rect` from `CX` to `CX + turnDeflection(rate) * PX_PER_DEG` (use `x = Math.min(...)`, `width = Math.abs(...)`), y 7, height 6, `ink.pointer`. (The ball on the PFD is the slip trapezoid under the roll pointer, drawn by the attitude.)

`pfd/AttitudeDisplay.tsx` — `React.memo`, props `{ width, height, status, pitch, roll, slip, radioAltitude }`; `VB = { width: 200, height: 240 }`; testID `instrument-attitude`; label as the attitude indicator's. Scale: `<Rect x={0} y={0} width={200} height={240} fill={ink.face} />`. Children when pitch and roll are non-null:

```tsx
<AttitudeScene pitch={pitch} roll={roll} slip={slip} cx={100} cy={120} pxPerDeg={4.8} windowDeg={25} bankRadius={92} clip={{ kind: 'rect', width: 200, height: 240 }} />
{radioAltitudeShown(radioAltitude) ? (
  <DigitalWindow x={100} y={222} width={60} text={String(Math.round(radioAltitude))} fontSize={14} />
) : null}
```

- [ ] **Step 4: Implement `PfdView`**

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import { PFD_VIEW } from '@/domain/instruments/geometry';
import { machShown } from '@/domain/instruments/labels';
import { AltitudeTape } from '@/features/panels/instruments/pfd/AltitudeTape';
import { AttitudeDisplay } from '@/features/panels/instruments/pfd/AttitudeDisplay';
import { HeadingTape } from '@/features/panels/instruments/pfd/HeadingTape';
import { SpeedTape } from '@/features/panels/instruments/pfd/SpeedTape';
import { TurnRateScale } from '@/features/panels/instruments/pfd/TurnRateScale';
import { VsiScale } from '@/features/panels/instruments/pfd/VsiScale';
import { useInstrumentValues } from '@/features/panels/instruments/useInstrumentValues';
import { useTheme } from '@/theme/theme-context';

const machText = (mach: number): string => `M ${mach.toFixed(3).replace(/^0/, '')}`;

/**
 * Speed left, attitude centre, altitude and vertical speed right, heading and turn rate below — each
 * region its own instrument, so each keeps its own label and its own NOT LIVE flag. The Mach and
 * altimeter-setting boxes are read aloud as part of the airspeed and altitude labels.
 */
export function PfdView({ width }: { width: number }) {
  const ink = useTheme().instrument;
  const v = useInstrumentValues();
  const k = width / PFD_VIEW.width;
  const box = (boxWidth: number) => ({
    width: boxWidth * k,
    height: 40 * k,
    backgroundColor: ink.face,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  });
  const boxText = { color: ink.marking, fontSize: 14 * k, fontWeight: 'bold' as const };
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
  return (
    <View testID="pfd" style={{ width, backgroundColor: ink.face }}>
      <View style={{ flexDirection: 'row' }}>
        <SpeedTape width={60 * k} height={240 * k} {...v.airspeed} markings={v.markings} />
        <AttitudeDisplay
          width={200 * k}
          height={240 * k}
          {...v.attitude}
          slip={v.turn.slip}
          radioAltitude={v.altitude.radioAltitude}
        />
        <AltitudeTape
          width={60 * k}
          height={240 * k}
          status={v.altitude.status}
          feet={v.altitude.feet}
          baroWords={v.altitude.baroWords}
          radioAltitude={v.altitude.radioAltitude}
        />
        <VsiScale width={40 * k} height={240 * k} {...v.verticalSpeed} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={box(60)} {...hidden}>
          {machShown(v.airspeed.mach) ? <Text style={boxText}>{machText(v.airspeed.mach)}</Text> : null}
        </View>
        <HeadingTape width={200 * k} height={40 * k} {...v.heading} />
        <View style={box(100)} {...hidden}>
          <Text style={boxText}>{v.altitude.baroText ?? '—'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingLeft: 60 * k }}>
        <TurnRateScale width={200 * k} height={20 * k} {...v.turn} />
      </View>
    </View>
  );
}
```

Note: the altitude and attitude spread props must match the components' prop names exactly; if `AttitudeDisplay`'s `{...v.attitude}` includes only `status, pitch, roll`, that is correct. `SpeedTape` receives `status, knots, mach` from `v.airspeed`.

- [ ] **Step 5: Run the test, then the gate**

Run: `npx jest tests/ui/instruments-pfd.test.tsx tests/ui/instruments-six-pack.test.tsx` → PASS. Full gate.

- [ ] **Step 6: Commit**

```bash
git add src/features/panels/instruments tests/ui/instruments-pfd.test.tsx
git commit -m "feat(instruments): the PFD presentation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Altimeter-setting controls

**Files:**
- Modify: `src/features/panels/primitives/ControlButton.tsx` (add `quiet`)
- Create: `src/features/panels/instruments/BaroControls.tsx`
- Test: `tests/ui/baro-controls.test.tsx`; extend `tests/ui/panel-primitives.test.tsx` for `quiet`

**Interfaces:**
- Consumes: `usePanel()`, `useUnits()`, `useInstrumentValues` is **not** used here (the controls need the raw inHg); Task 2 baro functions; `FEATURE_ALTIMETER_SETTING`, `GENERIC_DATAREFS.barometer`; `firstNumber` from Task 6.
- Produces: `ControlButton` prop `quiet?: boolean` — hides its availability reason and its outcome, for a control whose sibling on the same target already shows them. `BaroControls` (no props).

- [ ] **Step 1: Write the failing tests**

In `tests/ui/panel-primitives.test.tsx`, following its existing helpers, add a test: a `ControlButton` with `quiet` for an unavailable feature renders no reason text and, with a failed outcome in `snapshot.operations[target]`, no failure text; the same button without `quiet` shows both (that half likely exists already — reuse it).

`tests/ui/baro-controls.test.tsx` (helpers copied from the six-pack test; render `ThemeProvider` → `UnitsProvider` → `PanelFrame title="Instruments"` → `<BaroControls />`, with `actions.write` a `jest.fn`):

```tsx
describe('altimeter setting controls', () => {
  it('shows the read-back setting', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Altimeter setting: 29.92 inHg STD')).toBeTruthy();
  });

  it('steps by a hundredth of an inch from the read-back value', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Increase altimeter setting'));
    expect(actions.write).toHaveBeenLastCalledWith('altimeter-setting', D.barometer, 29.93);
    await fireEvent.press(screen.getByLabelText('Decrease altimeter setting'));
    expect(actions.write).toHaveBeenLastCalledWith('altimeter-setting', D.barometer, 29.91);
  });

  it('sets standard pressure in one press', async () => {
    const snapshot = live();
    await render(tree({ ...snapshot, telemetry: { ...snapshot.telemetry, ...telemetry({ [D.barometer]: 30.12 }) } }));
    await fireEvent.press(screen.getByLabelText('Set standard pressure'));
    expect(actions.write).toHaveBeenLastCalledWith('altimeter-setting', D.barometer, 29.92);
  });

  it('works in hectopascals, writing inches', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem('avionix.units', JSON.stringify({ pressure: 'hPa' }));
    await render(tree(live(), storage));
    expect(await screen.findByLabelText('Altimeter setting: 1013 hPa STD')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Increase altimeter setting'));
    const sent = (actions.write.mock.calls.at(-1) as unknown[])[2] as number;
    expect(Math.round(sent * HPA_PER_INHG)).toBe(1014);
    await fireEvent.changeText(screen.getByLabelText('Altimeter setting'), '1009');
    await fireEvent.press(screen.getByLabelText('Set Altimeter setting'));
    expect((actions.write.mock.calls.at(-1) as unknown[])[2]).toBeCloseTo(1009 / HPA_PER_INHG, 6);
  });

  it('refuses a typed value out of range, in the pilot’s words', async () => {
    await render(tree(live()));
    await fireEvent.changeText(screen.getByLabelText('Altimeter setting'), '35');
    expect(screen.getByText('Enter a number from 28 to 31.5.')).toBeTruthy();
  });

  it('disables every control while a write is pending, so presses cannot stack', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        operations: { [D.barometer]: { status: 'pending', failure: null, refusal: null, at: NOW } },
      }),
    );
    for (const name of ['Increase altimeter setting', 'Decrease altimeter setting', 'Set standard pressure']) {
      expect(screen.getByLabelText(name)).toBeDisabled();
    }
  });

  it('disables only the altimeter controls, with one sentence, when the DataRef is read-only', async () => {
    // Build a snapshot whose compatibility marks feature 'altimeter-setting' unavailable with the
    // barometer's missing entry status 'readOnly' (copy the shape from a test that already builds
    // an unavailable feature, e.g. tests/ui/panels.test.tsx or panel-primitives.test.tsx).
    // Expect: all three buttons and Set disabled; the text
    // 'Altimeter setting is not available on this aircraft: Altimeter setting, written when you change it.'
    // appears exactly once (getAllByText(...).length === 1); the reading is still shown.
  });

  it('disables the steps with no reading yet', async () => {
    const snapshot = live();
    const { [D.barometer]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }));
    expect(screen.getByLabelText('Increase altimeter setting')).toBeDisabled();
    expect(screen.getByLabelText('Altimeter setting: no value')).toBeTruthy();
  });
});
```

Write the read-only test fully, following its comments; do not leave the comments as its body. Match `OperationOutcome`'s real shape from `src/application/session-snapshot.ts` in the pending test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/ui/baro-controls.test.tsx tests/ui/panel-primitives.test.tsx` → FAIL.

- [ ] **Step 3: Add `quiet` to `ControlButton`**

Add to `Props`:

```ts
  /**
   * For a control whose sibling on the same target already shows the availability reason and the
   * outcome: without it, one read-only DataRef would print the same sentence under every button.
   */
  quiet?: boolean;
```

Render the reason only when `availability.reason !== null && props.quiet !== true`, and `<Outcome>` only when `props.quiet !== true`.

- [ ] **Step 4: Implement `BaroControls`**

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import {
  FEATURE_ALTIMETER_SETTING,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { BARO_RANGE, STD_INHG, baroStep, formatBaro, toInHg } from '@/domain/instruments/baro';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { ValueEntry } from '@/features/panels/primitives/ValueEntry';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs },
  reading: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
    fontVariant: ['tabular-nums' as const],
  },
  stale: { color: theme.colors.textMuted },
  steps: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.touch.spacing },
});

/**
 * The panel's only write (R4, R12). Every control sends from the read-back setting, never a typed
 * or previous one, and all four share one target: while a write is pending all four are disabled,
 * so presses cannot stack on a stale value. A read-only DataRef disables them with one sentence,
 * printed once by the Set button (R5).
 */
export function BaroControls() {
  const styles = useThemedStyles(makeStyles);
  const { snapshot, link, write } = usePanel();
  const { units } = useUnits();
  const unit = units.pressure;
  const missing = snapshot.compatibility.bindings[D.barometer]?.status === 'missing';
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const inHg = noFlight ? null : firstNumber(snapshot.telemetry[D.barometer]?.value);
  const send = (value: number) => void write(FEATURE_ALTIMETER_SETTING, D.barometer, value);
  const reading = missing
    ? 'not available on this aircraft'
    : inHg === null
      ? 'no value'
      : formatBaro(inHg, unit);
  const range = BARO_RANGE[unit];
  return (
    <View style={styles.wrap}>
      <View
        style={styles.reading}
        accessible
        accessibilityLabel={`Altimeter setting: ${reading}${link.valuesCurrent || inHg === null ? '' : ', not live'}`}
      >
        <BodyText>Altimeter setting</BodyText>
        <Text style={[styles.value, link.valuesCurrent ? null : styles.stale]}>
          {inHg === null ? '—' : formatBaro(inHg, unit)}
        </Text>
      </View>
      <View style={styles.steps}>
        <ControlButton
          label="−"
          accessibilityLabel="Decrease altimeter setting"
          featureId={FEATURE_ALTIMETER_SETTING}
          target={D.barometer}
          invalid={inHg === null}
          quiet
          onPress={() => inHg !== null && send(baroStep(inHg, unit, -1))}
        />
        <ControlButton
          label="+"
          accessibilityLabel="Increase altimeter setting"
          featureId={FEATURE_ALTIMETER_SETTING}
          target={D.barometer}
          invalid={inHg === null}
          quiet
          onPress={() => inHg !== null && send(baroStep(inHg, unit, 1))}
        />
        <ControlButton
          label="STD"
          accessibilityLabel="Set standard pressure"
          featureId={FEATURE_ALTIMETER_SETTING}
          target={D.barometer}
          quiet
          onPress={() => send(STD_INHG)}
        />
      </View>
      <ValueEntry
        label="Altimeter setting"
        unit={unit}
        featureId={FEATURE_ALTIMETER_SETTING}
        target={D.barometer}
        min={range.min}
        max={range.max}
        onSubmit={(value) => send(toInHg(value, unit))}
      />
    </View>
  );
}
```

`ValueEntry`'s label renders as `Altimeter setting (inHg)` and its input's accessible name is `Altimeter setting`; its Set button is `Set Altimeter setting`. `ValueEntry` accepts `PLAIN_DECIMAL` and the range; `28.00`–`31.50` and `948`–`1067` are both plain decimals. If `ValueEntry`'s range message formats `31.5` differently from the test, fix the test to the real message.

- [ ] **Step 5: Run the tests, then the gate**

Run the Step 2 command → PASS. Full gate (the touch-target guard must still pass).

- [ ] **Step 6: Commit**

```bash
git add src/features/panels/primitives/ControlButton.tsx src/features/panels/instruments/BaroControls.tsx tests/ui
git commit -m "feat(instruments): altimeter setting in inHg or hPa, with STD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Instruments panel, its presentation memory, and wiring

**Files:**
- Create: `src/features/panels/instruments/InstrumentPreferencesProvider.tsx`
- Create: `src/features/panels/instruments/InstrumentsPanel.tsx`
- Modify: `src/features/panels/registry.ts` (first in `PANELS`)
- Modify: `src/features/shell/AppShell.tsx` (mount the provider inside `UnitsProvider`)
- Modify: `tests/ui/error-text-guard.test.tsx`, `tests/ui/touch-target-guard.test.tsx`, `tests/ui/panels.test.tsx`, `tests/ui/app-shell.test.tsx`, `tests/web/app-shell.web.test.tsx`, `tests/ui/use-panel-layout.test.tsx` (as the gate requires)
- Create: `tests/ui/instruments-panel.test.tsx`, `tests/integration/flight-instruments.test.ts`

**Interfaces:**
- Consumes: everything above; `PanelDescriptor`, `EVERYWHERE`; `RadioChips`.
- Produces: `INSTRUMENTS_PANEL` (id `instruments`, title `Instruments`, features `[FEATURE_FLIGHT_INSTRUMENTS, FEATURE_ALTIMETER_SETTING]`, supports `EVERYWHERE`), `InstrumentsPanel`, `InstrumentPreferencesProvider({ storage, children })`, `useInstrumentPreferences()`, `usePresentation(identity, engineType): { presentation; choose(p) }`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/instruments-panel.test.tsx` (helpers from the six-pack test; render `ThemeProvider` → `UnitsProvider` → `InstrumentPreferencesProvider` → `PanelFrame title="Instruments"` → `<InstrumentsPanel />`; `identity` lives at `snapshot.compatibility.identity`):

```tsx
function withIdentity(snapshot: SessionSnapshot, icaoType: string | null): SessionSnapshot {
  return {
    ...snapshot,
    compatibility: {
      ...snapshot.compatibility,
      identity: { ...snapshot.compatibility.identity, icaoType },
    },
  };
}

describe('Instruments panel', () => {
  it('opens a piston single on the six-pack by default', async () => {
    await render(tree(withIdentity(live(), 'C172')));
    expect(screen.getByTestId('six-pack')).toBeTruthy();
    expect(screen.getByLabelText('Six-pack gauges')).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
  });

  it('opens a jet on the PFD by default', async () => {
    const snapshot = withIdentity(live(), 'B738');
    await render(tree({ ...snapshot, telemetry: { ...snapshot.telemetry, ...telemetry({ [D.engineType]: [7, 7] }) } }));
    expect(screen.getByTestId('pfd')).toBeTruthy();
  });

  it('remembers the choice per aircraft type', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(tree(withIdentity(live(), 'C172'), storage));
    await fireEvent.press(screen.getByLabelText('Primary flight display'));
    expect(screen.getByTestId('pfd')).toBeTruthy();
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem('avionix.instruments')) ?? '{}')).toEqual({
        last: 'pfd',
        byAircraft: { C172: 'pfd' },
      }),
    );
    // A different piston single still gets its engine default…
    await view.rerender(tree(withIdentity(live(), 'BE58'), storage));
    expect(screen.getByTestId('six-pack')).toBeTruthy();
    // …and the C172 comes back to the PFD, without a restart.
    await view.rerender(tree(withIdentity(live(), 'C172'), storage));
    expect(screen.getByTestId('pfd')).toBeTruthy();
  });

  it('restores the stored choice after a restart', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem('avionix.instruments', JSON.stringify({ last: 'pfd', byAircraft: { C172: 'pfd' } }));
    await render(tree(withIdentity(live(), 'C172'), storage));
    expect(await screen.findByTestId('pfd')).toBeTruthy();
  });

  it('uses the last choice for an unidentified aircraft with no engine type', async () => {
    const snapshot = withIdentity(live(), null);
    const { [D.engineType]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }));
    expect(screen.getByTestId('pfd')).toBeTruthy();
  });

  it('shows the altimeter controls under the instruments', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Set standard pressure')).toBeTruthy();
  });
});
```

`tests/integration/flight-instruments.test.ts` — copy the setup of `tests/integration/flight-data.test.ts` (mock server, session, connect, wait helpers). Tests:
1. Against the default mock, after connecting with demand for `flight-instruments` and `altimeter-setting`, the telemetry holds the mock's values for `altitude`, `pitch`, `roll`, `heading`, `verticalSpeed`, `turnRate`, `slip` and `engineType` (an array starting with 1), and both features are `available`.
2. `session.write('altimeter-setting', GENERIC_DATAREFS.barometer, 30.12)` → the telemetry for the barometer becomes 30.12 (the read-back, via the mock's echo), and no command was activated.
3. With the barometer `writable: false` in the mock, `altimeter-setting` is `unavailable` and a write is refused (`snapshot.operations[barometer].refusal === 'unavailable'`), while `flight-instruments` stays `available`.
4. With `sim/cockpit2/gauges/indicators/vvi_fpm_pilot` removed from the mock, its binding is `missing`, `flight-instruments` is `partial`, and the other instrument values still arrive.

Also extend the existing guard and shell tests:
- `tests/ui/error-text-guard.test.tsx`: wrap panel renders in `InstrumentPreferencesProvider` (permanently, as F-11 did for `UnitsProvider`); the Instruments panel must pass the guard in every state the file already exercises.
- `tests/ui/touch-target-guard.test.tsx`: include the Instruments panel.
- `tests/ui/app-shell.test.tsx` and `tests/web/app-shell.web.test.tsx`: a fresh install opens on Instruments (first in the switcher); any test that assumed Flight data opens first now selects it explicitly. The web test must render the PFD (assert `getByTestId('pfd')` or the attitude label) — this is the react-native-svg-on-web check.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/ui/instruments-panel.test.tsx tests/integration/flight-instruments.test.ts` → FAIL.

- [ ] **Step 3: Implement the provider**

`src/features/panels/instruments/InstrumentPreferencesProvider.tsx`, mirroring `UnitsProvider` exactly (touched ref, load in effect with cancellation, save from the updater):

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  loadInstrumentPreferences,
  saveInstrumentPreferences,
} from '@/application/instrument-preferences';
import type { SettingsStorage } from '@/application/settings-store';
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  type Presentation,
  type PresentationPreferences,
  aircraftKey,
  choosePresentation,
  resolvePresentation,
} from '@/domain/instruments/presentation';

interface InstrumentPreferencesValue {
  preferences: PresentationPreferences;
  choose: (key: string | null, presentation: Presentation) => void;
  ready: boolean;
}

const InstrumentPreferencesContext = createContext<InstrumentPreferencesValue | null>(null);

/**
 * The presentation choice (R3), per aircraft type. Same load rule as the units and the panel
 * layout: a real choice made before the stored value arrives wins over it.
 */
export function InstrumentPreferencesProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState<PresentationPreferences>(
    DEFAULT_PRESENTATION_PREFERENCES,
  );
  const [ready, setReady] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadInstrumentPreferences(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      setPreferences((prev) => (touched.current ? prev : stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const choose = useCallback(
    (key: string | null, presentation: Presentation) => {
      setPreferences((prev) => {
        const next = choosePresentation(prev, key, presentation);
        if (next === prev) {
          return prev;
        }
        touched.current = true;
        void saveInstrumentPreferences(storage, next);
        return next;
      });
    },
    [storage],
  );

  const value = useMemo(() => ({ preferences, choose, ready }), [preferences, choose, ready]);
  return (
    <InstrumentPreferencesContext.Provider value={value}>{children}</InstrumentPreferencesContext.Provider>
  );
}

export function useInstrumentPreferences(): InstrumentPreferencesValue {
  const value = useContext(InstrumentPreferencesContext);
  if (value === null) {
    throw new Error('useInstrumentPreferences must be used inside InstrumentPreferencesProvider');
  }
  return value;
}

/** Re-resolved on every render, so an aircraft or engine-type change applies without a restart. */
export function usePresentation(
  identity: AircraftIdentity,
  engineType: number | null,
): { presentation: Presentation; choose: (presentation: Presentation) => void } {
  const { preferences, choose } = useInstrumentPreferences();
  const key = aircraftKey(identity);
  return {
    presentation: resolvePresentation(preferences, key, engineType),
    choose: (presentation) => choose(key, presentation),
  };
}
```

- [ ] **Step 4: Implement the panel**

`src/features/panels/instruments/InstrumentsPanel.tsx`:

```tsx
import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import {
  FEATURE_ALTIMETER_SETTING,
  FEATURE_FLIGHT_INSTRUMENTS,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { pfdWidth } from '@/domain/instruments/geometry';
import type { Presentation } from '@/domain/instruments/presentation';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { BaroControls } from '@/features/panels/instruments/BaroControls';
import { usePresentation } from '@/features/panels/instruments/InstrumentPreferencesProvider';
import { PfdView } from '@/features/panels/instruments/pfd/PfdView';
import { SixPackView } from '@/features/panels/instruments/six-pack/SixPackView';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { RadioChips, type RadioChipOption } from '@/theme/RadioChips';
import { useTheme } from '@/theme/theme-context';

export const INSTRUMENTS_PANEL: PanelDescriptor = {
  id: 'instruments',
  title: 'Instruments',
  features: [FEATURE_FLIGHT_INSTRUMENTS, FEATURE_ALTIMETER_SETTING],
  supports: EVERYWHERE,
};

const PRESENTATION_OPTIONS: readonly RadioChipOption<Presentation>[] = [
  { value: 'pfd', label: 'PFD', accessibilityLabel: 'Primary flight display' },
  { value: 'sixPack', label: 'Six-pack', accessibilityLabel: 'Six-pack gauges' },
];

/**
 * F-10. Read-only except the altimeter setting (R12). One tap switches presentation — never a
 * swipe, which competitors' users report flipping by accident.
 */
export function InstrumentsPanel() {
  const theme = useTheme();
  const { snapshot } = usePanel();
  const window = useWindowDimensions();
  // Until the first layout pass, assume the frame's padding; tests never run a layout pass.
  const [measured, setMeasured] = useState<number | null>(null);
  const contentWidth = measured ?? window.width - theme.spacing.lg * 2;
  const engineType = firstNumber(snapshot.telemetry[D.engineType]?.value);
  const { presentation, choose } = usePresentation(snapshot.compatibility.identity, engineType);
  return (
    <>
      <RadioChips
        options={PRESENTATION_OPTIONS}
        selected={presentation}
        onSelect={choose}
        accessibilityLabel="Instrument presentation"
      />
      <View
        style={{ alignItems: 'center' }}
        onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      >
        {presentation === 'pfd' ? (
          <PfdView width={pfdWidth(contentWidth, window.height)} />
        ) : (
          <SixPackView
            contentWidth={contentWidth}
            windowHeight={window.height}
            landscape={window.width > window.height}
          />
        )}
      </View>
      <BaroControls />
    </>
  );
}
```

Note: when the snapshot is `noFlight`, `firstNumber(...)` still reads a stale engine type if one is cached; that is intended (the presentation must not flip when a flight is unloaded).

- [ ] **Step 5: Register and mount**

`registry.ts`: import `INSTRUMENTS_PANEL, InstrumentsPanel` and put `{ descriptor: INSTRUMENTS_PANEL, Component: InstrumentsPanel }` **first** in `PANELS`.

`AppShell.tsx`: inside `<UnitsProvider storage={settingsStorage}>`, wrap the existing children in `<InstrumentPreferencesProvider storage={settingsStorage}>`.

- [ ] **Step 6: Run the tests, then the gate**

Run: `npx jest tests/ui/instruments-panel.test.tsx tests/integration/flight-instruments.test.ts` → PASS. Run the full gate and fix the shell/guard tests listed under Files (only the tests; the panel order is intended).

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(instruments): the Instruments panel, first in the switcher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Documentation and device checks

**Files:**
- Modify: `docs/xplane.md`, `docs/architecture.md`, `README.md`, `docs/testing/xplane-smoke-test.md`, `docs/roadmap/features/F-10-primary-flight-instruments.md` (Status only)

- [ ] **Step 1: `docs/xplane.md`**

Add an "Instruments (F-10)" table in the style of the Flight data table: the 16 `flight-instruments` names and the barometer, with type, unit and source ("Verified against `DataRefs.txt`" for every one; `acf_Vs` "unit not stated; treated as knots indicated like its siblings"). State: STD writes 29.92 to the barometer DataRef; `barometer_setting_is_std_pilot` is not in `DataRefs.txt` and is not used; the standard-rate deflection (20°) and the slip sign are unverified pending device rows.

- [ ] **Step 2: `docs/architecture.md`**

Add an "Instruments" section after "Flight data": domain modules in `src/domain/instruments/` (geometry, labels, baro, presentation, speed markings), `useInstrumentValues` reducing the snapshot to primitives for memoised SVG instruments, `InstrumentFace`'s four states, `avionix.instruments` and `InstrumentPreferencesProvider` in `AppShell`, the `pressure` unit, `ControlButton`'s `quiet`, and "no smoothing" as a rule.

- [ ] **Step 3: `README.md`**

Add the Instruments panel to the feature list (PFD or six-pack, remembered per aircraft; altimeter in inHg or hPa with STD).

- [ ] **Step 4: Smoke test rows**

Append rows 63–72 to `docs/testing/xplane-smoke-test.md` in the file's table format:

| # | Step | Expected |
|---|---|---|
| 63 | Rebuild the development build (react-native-svg is a new native module), open the app fresh | It opens on Instruments; the PFD or six-pack draws, nothing blank |
| 64 | Default C172, engine running on the ground | Six-pack by default; airspeed 0 with white/green/yellow arcs and a red line; altimeter matches X-Plane's own to the foot; heading matches |
| 65 | Fly a level standard-rate turn using X-Plane's own turn coordinator | Ours puts the wing on the standard-rate mark (checks the 20° assumption); label says about "rate 1.0 standard rate" |
| 66 | Apply rudder in level flight | The ball moves the same way as X-Plane's ball (checks the slip sign), on the six-pack and under the PFD's roll pointer |
| 67 | Roll to 30° bank and pitch 10° up | Both presentations show the same bank and pitch as X-Plane's attitude indicator |
| 68 | Switch to PFD, then load the default 737, then the C172 again | 737 opens on PFD; C172 comes back on the PFD you chose; restart the app: still PFD for the C172 |
| 69 | Tap +, −, STD, and type 30.12 then Set, in inHg; switch Units → hPa and repeat with 1009 | X-Plane's altimeter follows each; our reading shows the read-back; STD shows "29.92 inHg STD" / "1013 hPa STD" |
| 70 | Stop X-Plane's network (or quit X-Plane) mid-flight | Every instrument keeps its last values under a red X with NOT LIVE; the panel says why and how long ago |
| 71 | Return to the main menu (no flight) | No values on any instrument; the panel says no flight is loaded |
| 72 | 737 above FL250 and on short final | Mach appears from 0.40; radio altitude appears below 2,500 ft on both presentations |

(Add a blank result column matching the file's existing columns.)

- [ ] **Step 5: Roadmap status**

In `docs/roadmap/features/F-10-primary-flight-instruments.md` set `Status` to `Delivered (Stage 1)` — use the exact wording `F-11-flight-data-strip.md` uses for its delivered status.

- [ ] **Step 6: Gate and commit**

Run the full gate (Prettier checks Markdown).

```bash
git add docs README.md
git commit -m "docs(instruments): DataRefs, architecture, README and device checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
