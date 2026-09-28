# Flight Data Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show ground speed, TAS, track, wind, temperatures, fuel, simulator clocks, paused/replay
and the GPS destination as a Flight data panel and as a compact strip docked on every other panel,
in persisted units shared with future features.

**Architecture:** Two all-optional profile features (`flight-data`, `gps-destination`) feed
ordinary telemetry through F-04's demand. Pure domain modules convert units, format values, pick
the simulator badge and decide the destination state. A `UnitsProvider` holds the persisted unit
choice. `PanelScope` (split out of `PanelFrame`) lets the strip, which lives in the shell outside
any panel, read the same snapshot and link status. `basic-data` retires, migrating to
`flight-data`.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict
(`noUncheckedIndexedAccess`), zod 4, Jest 29 via jest-expo (projects `node`, `expo`, `web`),
@testing-library/react-native 14.

**Spec:** `docs/superpowers/specs/2026-09-28-flight-data-strip-design.md`

## Global Constraints

- Gate after every task: `npm run typecheck && npm run lint && npm run format:check && npm test` all pass.
- Never launch Xcode, Android Studio, simulators, emulators, `expo start` or EAS builds. Device checks are the user's.
- Never render, log or serialise a bearer token or a pairing code. No URL, HTTP status, exception text or protocol payload on any screen.
- Commit messages end with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- zod v4 (`import { z } from 'zod'`). Path alias `@/` → `src/`.
- `src/domain` and `src/application` never import React or React Native.
- Lint rule `react-hooks/set-state-in-effect` and the React Compiler rules are active.
- The strip and the panel are read-only: no `write` or `activate` call anywhere in F-11 code (R11).
- Every new profile binding is `required: false` and has no `write`.
- Units: fuel `kg` | `lb` (1 lb = 0.45359237 kg), temperature `C` | `F` (°F = °C × 9/5 + 32), distance `nm` | `km` (1 nm = 1.852 km); defaults kg, C, nm; storage key `avionix.units`. Speeds stay in knots.
- The minus sign in formatted temperatures is U+2212 (`−`).
- Freshness is the link's (F-02 heartbeat via `panelLinkStatus`), never a value's own `receivedAt`.
- Touch rules from F-04 hold: every pressable is at least 48 dp in both directions.
- Retired panel id `basic-data` migrates to `flight-data`.

## Review Focus

1. A value that arrived once and never changed (fuel in cruise, a steady OAT) must still read as live while the link is live — pinned in Task 6, "a steady value is not marked stale".
2. A default GPS with no destination entered must say "No destination set in the GPS.", never `0 nm` — pinned in Task 2 and Task 6.
3. A layout saved by F-04 (no `strip` key, `last: 'basic-data'`) must open on Flight data with the strip shown — pinned in Task 4.
4. Negative and near-zero temperatures must render `−12 °C` and `0 °C`, never `-0` — pinned in Task 2.
5. A REPLAY or PAUSED badge must not linger after the link drops — pinned in Task 2 (`simulatorBadge` with a non-connected state) and Task 6.

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/units/units.ts` | unit types, lists, defaults, conversions, labels |
| `src/application/unit-preferences.ts` | load/save `avionix.units` |
| `src/domain/flight-data/format.ts` | every value → text |
| `src/domain/flight-data/sim-state.ts` | `simulatorBadge` |
| `src/domain/flight-data/destination.ts` | `destinationView` |
| `src/domain/aircraft/profiles/generic.ts` | two new features and their names |
| `src/application/panel-layout.ts`, `src/hooks/usePanelLayout.ts` | `strip` flag, retired ids |
| `src/theme/RadioChips.tsx` | shared radio chip row (ThemeToggle and Units) |
| `src/features/units/UnitsProvider.tsx`, `UnitsSection.tsx` | unit context and Setup section |
| `src/features/panels/primitives/PanelFrame.tsx` | gains `PanelScope` |
| `src/features/panels/flight-data/*` | `useFlightValue`, `FlightValue`, `SimBadge`, `DestinationBlock`, `FlightDataPanel`, `FlightDataStrip` |
| `src/features/panels/registry.ts` | Flight data replaces Basic data |
| `src/features/shell/{AppShell,PanelChooser,SetupScreen}.tsx` | provider, strip, demand, toggles |

---

### Task 1: Units and their persisted preference

**Files:**
- Create: `src/domain/units/units.ts`, `src/application/unit-preferences.ts`
- Test: `tests/unit/domain/units.test.ts`, `tests/unit/application/unit-preferences.test.ts`

**Interfaces:**
- Produces: `FuelUnit`, `TemperatureUnit`, `DistanceUnit`, `FUEL_UNITS`, `TEMPERATURE_UNITS`, `DISTANCE_UNITS`, `UnitPreferences { fuel; temperature; distance }`, `DEFAULT_UNITS`, `convertFuel(kg, unit)`, `convertTemperature(c, unit)`, `convertDistance(nm, unit)`, `UNIT_LABEL`; `UNITS_STORAGE_KEY = 'avionix.units'`, `loadUnitPreferences(storage): Promise<UnitPreferences>`, `saveUnitPreferences(storage, prefs): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/units.test.ts`:

```ts
import {
  DEFAULT_UNITS,
  DISTANCE_UNITS,
  FUEL_UNITS,
  TEMPERATURE_UNITS,
  UNIT_LABEL,
  convertDistance,
  convertFuel,
  convertTemperature,
} from '@/domain/units/units';

describe('units', () => {
  it('defaults to kilograms, Celsius and nautical miles', () => {
    expect(DEFAULT_UNITS).toEqual({ fuel: 'kg', temperature: 'C', distance: 'nm' });
    expect(FUEL_UNITS).toEqual(['kg', 'lb']);
    expect(TEMPERATURE_UNITS).toEqual(['C', 'F']);
    expect(DISTANCE_UNITS).toEqual(['nm', 'km']);
  });

  it('converts fuel mass exactly', () => {
    expect(convertFuel(100, 'kg')).toBe(100);
    expect(convertFuel(0.45359237, 'lb')).toBeCloseTo(1, 10);
    expect(convertFuel(1000, 'lb')).toBeCloseTo(2204.62262, 4);
  });

  it('converts temperature', () => {
    expect(convertTemperature(-40, 'F')).toBeCloseTo(-40, 10);
    expect(convertTemperature(0, 'F')).toBe(32);
    expect(convertTemperature(100, 'F')).toBe(212);
    expect(convertTemperature(-12.3, 'C')).toBe(-12.3);
  });

  it('converts distance', () => {
    expect(convertDistance(1, 'km')).toBe(1.852);
    expect(convertDistance(126.4, 'nm')).toBe(126.4);
  });

  it('labels every unit', () => {
    expect(UNIT_LABEL.fuel).toEqual({ kg: 'kg', lb: 'lb' });
    expect(UNIT_LABEL.temperature).toEqual({ C: '°C', F: '°F' });
    expect(UNIT_LABEL.distance).toEqual({ nm: 'nm', km: 'km' });
  });
});
```

`tests/unit/application/unit-preferences.test.ts`:

```ts
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  UNITS_STORAGE_KEY,
  loadUnitPreferences,
  saveUnitPreferences,
} from '@/application/unit-preferences';
import { DEFAULT_UNITS } from '@/domain/units/units';

describe('unit preferences', () => {
  it('defaults when nothing is stored', async () => {
    await expect(loadUnitPreferences(createMemorySettingsStorage())).resolves.toEqual(
      DEFAULT_UNITS,
    );
  });

  it('round-trips under the documented key', async () => {
    const storage = createMemorySettingsStorage();
    await saveUnitPreferences(storage, { fuel: 'lb', temperature: 'F', distance: 'km' });
    expect(JSON.parse((await storage.getItem(UNITS_STORAGE_KEY)) ?? 'null')).toEqual({
      fuel: 'lb',
      temperature: 'F',
      distance: 'km',
    });
    await expect(loadUnitPreferences(storage)).resolves.toEqual({
      fuel: 'lb',
      temperature: 'F',
      distance: 'km',
    });
  });

  it('falls back one field at a time, keeping the valid ones', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      UNITS_STORAGE_KEY,
      JSON.stringify({ fuel: 'lb', temperature: 'kelvin' }),
    );
    await expect(loadUnitPreferences(storage)).resolves.toEqual({
      fuel: 'lb',
      temperature: 'C',
      distance: 'nm',
    });
  });

  it.each([
    ['corrupt JSON', '{nope'],
    ['a wrong shape', JSON.stringify(['lb'])],
  ])('defaults for %s', async (_label, raw) => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(UNITS_STORAGE_KEY, raw);
    await expect(loadUnitPreferences(storage)).resolves.toEqual(DEFAULT_UNITS);
  });

  it('swallows storage failures', async () => {
    const broken = {
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => {
        throw new Error('disk');
      },
    };
    await expect(loadUnitPreferences(broken)).resolves.toEqual(DEFAULT_UNITS);
    await expect(saveUnitPreferences(broken, DEFAULT_UNITS)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain/units.test.ts tests/unit/application/unit-preferences.test.ts`
Expected: FAIL ("Cannot find module '@/domain/units/units'").

- [ ] **Step 3: Implement**

`src/domain/units/units.ts`:

```ts
/**
 * The one place unit conversions live (F-11 R2). The moving map (F-13) and the flight recorder
 * (F-14) read the same preference and convert through these functions, so no two screens can
 * disagree about a number. Fuel is mass only: litres and gallons need a density the Web API does
 * not provide.
 */
export const FUEL_UNITS = ['kg', 'lb'] as const;
export const TEMPERATURE_UNITS = ['C', 'F'] as const;
export const DISTANCE_UNITS = ['nm', 'km'] as const;

export type FuelUnit = (typeof FUEL_UNITS)[number];
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export interface UnitPreferences {
  fuel: FuelUnit;
  temperature: TemperatureUnit;
  distance: DistanceUnit;
}

export const DEFAULT_UNITS: UnitPreferences = { fuel: 'kg', temperature: 'C', distance: 'nm' };

/** Exact by definition (international avoirdupois pound). */
export const KG_PER_LB = 0.45359237;
/** Exact by definition (international nautical mile). */
export const KM_PER_NM = 1.852;

export function convertFuel(kg: number, unit: FuelUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function convertTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === 'C' ? celsius : (celsius * 9) / 5 + 32;
}

export function convertDistance(nm: number, unit: DistanceUnit): number {
  return unit === 'nm' ? nm : nm * KM_PER_NM;
}

export const UNIT_LABEL = {
  fuel: { kg: 'kg', lb: 'lb' } as Record<FuelUnit, string>,
  temperature: { C: '°C', F: '°F' } as Record<TemperatureUnit, string>,
  distance: { nm: 'nm', km: 'km' } as Record<DistanceUnit, string>,
};
```

`src/application/unit-preferences.ts`:

```ts
import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_UNITS,
  DISTANCE_UNITS,
  FUEL_UNITS,
  TEMPERATURE_UNITS,
  type UnitPreferences,
} from '@/domain/units/units';

export const UNITS_STORAGE_KEY = 'avionix.units';

/** Each field falls back on its own, so one bad value does not reset the others. */
const storedSchema = z.object({
  fuel: z.enum([...FUEL_UNITS]).catch(DEFAULT_UNITS.fuel),
  temperature: z.enum([...TEMPERATURE_UNITS]).catch(DEFAULT_UNITS.temperature),
  distance: z.enum([...DISTANCE_UNITS]).catch(DEFAULT_UNITS.distance),
});

export async function loadUnitPreferences(storage: SettingsStorage): Promise<UnitPreferences> {
  try {
    const raw = await storage.getItem(UNITS_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_UNITS;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_UNITS;
  } catch {
    return DEFAULT_UNITS;
  }
}

export async function saveUnitPreferences(
  storage: SettingsStorage,
  preferences: UnitPreferences,
): Promise<void> {
  try {
    await storage.setItem(UNITS_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Best effort, like the theme preference: a failed save must never break the UI.
  }
}
```

If zod's `.catch` on a field does not apply to a *missing* key in this zod version, make each
field `.optional()` before `.catch(...)` is not needed — verify with the "falls back one field at a
time" test and adjust only the schema.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/domain/units.test.ts tests/unit/application/unit-preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

Run the gate.

```bash
git add src/domain/units src/application/unit-preferences.ts tests/unit/domain/units.test.ts tests/unit/application/unit-preferences.test.ts
git commit -m "feat(units): add shared unit conversions and the persisted unit preference

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Formatting, the simulator badge and the destination decision

**Files:**
- Create: `src/domain/flight-data/format.ts`, `src/domain/flight-data/sim-state.ts`, `src/domain/flight-data/destination.ts`
- Test: `tests/unit/domain/flight-data.test.ts`

**Interfaces:**
- Consumes: Task 1 units; `decodeDataRefString` (`@/domain/simulator/dataref-string`); `ConnectionState`; `SimulatorActivity`; `BindingStatus`; `DataRefValue`.
- Produces:
  - `formatSpeed(kt)`, `formatHeading(deg)`, `formatWind(fromDeg, kt)`, `CALM_BELOW_KT = 1`, `formatTemperature(c, unit)`, `formatFuel(kg, unit)`, `formatClock(secondsSinceMidnight)`, `formatDistance(nm, unit)`, `formatTimeToGo(minutes)`, `MINUS = '−'`.
  - `type SimBadge = 'paused' | 'replay'`; `simulatorBadge(state: ConnectionState, activity: SimulatorActivity, inReplay: DataRefValue | undefined): SimBadge | null`; `SIM_BADGE_LABEL`.
  - `type DestinationView = { kind: 'unavailable' } | { kind: 'waiting' } | { kind: 'notSet' } | { kind: 'shown'; id: string; distanceNm: number; timeMin: number | null }`; `destinationView(input: { idStatus: BindingStatus | undefined; distanceStatus: BindingStatus | undefined; idValue: DataRefValue | undefined; distanceValue: DataRefValue | undefined; timeValue: DataRefValue | undefined }): DestinationView`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/flight-data.test.ts`:

```ts
import { destinationView } from '@/domain/flight-data/destination';
import {
  MINUS,
  formatClock,
  formatDistance,
  formatFuel,
  formatHeading,
  formatSpeed,
  formatTemperature,
  formatTimeToGo,
  formatWind,
} from '@/domain/flight-data/format';
import { SIM_BADGE_LABEL, simulatorBadge } from '@/domain/flight-data/sim-state';

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('formatting', () => {
  it('rounds speeds to whole knots', () => {
    expect(formatSpeed(142.4)).toBe('142 kt');
    expect(formatSpeed(142.5)).toBe('143 kt');
    expect(formatSpeed(-0.2)).toBe('0 kt');
  });

  it('shows headings as three digits, 360 for north', () => {
    expect(formatHeading(87.2)).toBe('087°');
    expect(formatHeading(0)).toBe('360°');
    expect(formatHeading(359.6)).toBe('360°');
    expect(formatHeading(-5)).toBe('355°');
  });

  it('shows wind as direction and speed, calm below 1 kt', () => {
    expect(formatWind(270, 12.4)).toBe('270° / 12 kt');
    expect(formatWind(90, 0.9)).toBe('Calm');
  });

  it('shows temperatures with a true minus sign and no negative zero', () => {
    expect(MINUS).toBe('−');
    expect(formatTemperature(-12.3, 'C')).toBe('−12 °C');
    expect(formatTemperature(-0.4, 'C')).toBe('0 °C');
    expect(formatTemperature(10, 'F')).toBe('50 °F');
    expect(formatTemperature(-40, 'F')).toBe('−40 °F');
  });

  it('shows fuel in whole units with thousands grouping', () => {
    expect(formatFuel(1234.5, 'kg')).toBe('1,235 kg');
    expect(formatFuel(1000, 'lb')).toBe('2,205 lb');
    expect(formatFuel(0, 'kg')).toBe('0 kg');
  });

  it('shows simulator clocks as HH:MM:SS', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(50709.8)).toBe('14:05:09');
    expect(formatClock(86399)).toBe('23:59:59');
    expect(formatClock(86400)).toBe('00:00:00');
  });

  it('shows distance with one decimal below 10 and whole above', () => {
    expect(formatDistance(8.44, 'nm')).toBe('8.4 nm');
    expect(formatDistance(126.4, 'nm')).toBe('126 nm');
    expect(formatDistance(10, 'km')).toBe('19 km');
  });

  it('shows time to go as h:mm, capped', () => {
    expect(formatTimeToGo(65.2)).toBe('1:05');
    expect(formatTimeToGo(0)).toBe('0:00');
    expect(formatTimeToGo(99 * 60 + 59)).toBe('99:59');
    expect(formatTimeToGo(6000)).toBe('more than 99 h');
  });
});

describe('simulatorBadge', () => {
  it('says replay, even when the replay is paused', () => {
    expect(simulatorBadge('connected', 'paused', 1)).toBe('replay');
    expect(simulatorBadge('connected', 'running', 1)).toBe('replay');
  });

  it('says paused when paused and not in replay', () => {
    expect(simulatorBadge('connected', 'paused', 0)).toBe('paused');
    expect(simulatorBadge('connected', 'paused', undefined)).toBe('paused');
  });

  it('says nothing while running', () => {
    expect(simulatorBadge('connected', 'running', 0)).toBeNull();
  });

  it.each(['disconnected', 'reconnecting', 'error', 'connecting', 'pairing'] as const)(
    'says nothing when %s, even with a remembered replay flag',
    (state) => {
      expect(simulatorBadge(state, 'unknown', 1)).toBeNull();
    },
  );

  it('labels both badges', () => {
    expect(SIM_BADGE_LABEL).toEqual({ paused: 'PAUSED', replay: 'REPLAY' });
  });
});

describe('destinationView', () => {
  const resolved = { idStatus: 'ok' as const, distanceStatus: 'ok' as const };

  it('is unavailable when the GPS names did not resolve', () => {
    expect(
      destinationView({
        idStatus: 'missing',
        distanceStatus: 'ok',
        idValue: undefined,
        distanceValue: 3,
        timeValue: 2,
      }),
    ).toEqual({ kind: 'unavailable' });
    expect(
      destinationView({
        idStatus: 'ok',
        distanceStatus: 'missing',
        idValue: base64('KSEA'),
        distanceValue: undefined,
        timeValue: undefined,
      }),
    ).toEqual({ kind: 'unavailable' });
  });

  it('waits for the first values instead of claiming there is no destination', () => {
    expect(
      destinationView({
        ...resolved,
        idValue: undefined,
        distanceValue: undefined,
        timeValue: undefined,
      }),
    ).toEqual({ kind: 'waiting' });
  });

  it('says no destination is set when the identifier is empty, never a zero distance', () => {
    expect(
      destinationView({
        ...resolved,
        idValue: base64('\0\0\0\0'),
        distanceValue: 0,
        timeValue: 0,
      }),
    ).toEqual({ kind: 'notSet' });
  });

  it('shows a destination with its decoded identifier', () => {
    expect(
      destinationView({
        ...resolved,
        idValue: base64('KSEA\0\0\0\0'),
        distanceValue: 126.4,
        timeValue: 53.2,
      }),
    ).toEqual({ kind: 'shown', id: 'KSEA', distanceNm: 126.4, timeMin: 53.2 });
  });

  it('shows a destination without a time when the time DataRef is absent', () => {
    expect(
      destinationView({ ...resolved, idValue: base64('KSEA'), distanceValue: 12, timeValue: undefined }),
    ).toEqual({ kind: 'shown', id: 'KSEA', distanceNm: 12, timeMin: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain/flight-data.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

`src/domain/flight-data/format.ts`:

```ts
import {
  type DistanceUnit,
  type FuelUnit,
  type TemperatureUnit,
  UNIT_LABEL,
  convertDistance,
  convertFuel,
  convertTemperature,
} from '@/domain/units/units';

/** A true minus sign: a hyphen is easy to miss on a small screen. */
export const MINUS = '−';

/** Rounds and drops the sign of a negative zero, so -0.4 reads "0", never "-0". */
function whole(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

function signed(value: number): string {
  const rounded = whole(value);
  return rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : String(rounded);
}

/** Thousands separators without Intl, whose availability differs between Hermes builds. */
function grouped(value: number): string {
  const rounded = whole(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `${MINUS}${digits}` : digits;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatSpeed(kt: number): string {
  return `${whole(kt)} kt`;
}

/** Three digits, 360 for north, as on a heading or course indicator. */
export function formatHeading(degrees: number): string {
  const normalised = ((whole(degrees) % 360) + 360) % 360;
  return `${String(normalised === 0 ? 360 : normalised).padStart(3, '0')}°`;
}

export const CALM_BELOW_KT = 1;

/** Wind is given as the direction it blows from, the meteorological convention. */
export function formatWind(fromDegrees: number, kt: number): string {
  return kt < CALM_BELOW_KT ? 'Calm' : `${formatHeading(fromDegrees)} / ${whole(kt)} kt`;
}

export function formatTemperature(celsius: number, unit: TemperatureUnit): string {
  return `${signed(convertTemperature(celsius, unit))} ${UNIT_LABEL.temperature[unit]}`;
}

export function formatFuel(kg: number, unit: FuelUnit): string {
  return `${grouped(convertFuel(kg, unit))} ${UNIT_LABEL.fuel[unit]}`;
}

/** Seconds since midnight (X-Plane's clock DataRefs) → HH:MM:SS. */
export function formatClock(secondsSinceMidnight: number): string {
  const total = ((Math.floor(secondsSinceMidnight) % 86400) + 86400) % 86400;
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
}

export function formatDistance(nm: number, unit: DistanceUnit): string {
  const value = convertDistance(nm, unit);
  const text = Math.abs(value) < 10 ? value.toFixed(1) : String(whole(value));
  return `${text} ${UNIT_LABEL.distance[unit]}`;
}

export const MAX_TIME_TO_GO_MIN = 99 * 60 + 59;

export function formatTimeToGo(minutes: number): string {
  if (minutes > MAX_TIME_TO_GO_MIN) {
    return 'more than 99 h';
  }
  const total = Math.max(0, whole(minutes));
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}
```

`src/domain/flight-data/sim-state.ts`:

```ts
import type { ConnectionState } from '@/domain/connection/connection-state';
import type { SimulatorActivity } from '@/domain/health/simulator-activity';
import type { DataRefValue } from '@/domain/simulator/types';

export type SimBadge = 'paused' | 'replay';

export const SIM_BADGE_LABEL: Record<SimBadge, string> = { paused: 'PAUSED', replay: 'REPLAY' };

/**
 * F-11 R3. Replay beats paused: a replay is often paused too, and "replay" is what explains the
 * numbers. Only a live link can say either — a remembered replay flag after a drop is not news.
 */
export function simulatorBadge(
  state: ConnectionState,
  activity: SimulatorActivity,
  inReplay: DataRefValue | undefined,
): SimBadge | null {
  if (state !== 'connected') {
    return null;
  }
  if (typeof inReplay === 'number' && inReplay >= 0.5) {
    return 'replay';
  }
  return activity === 'paused' ? 'paused' : null;
}
```

`src/domain/flight-data/destination.ts`:

```ts
import type { BindingStatus } from '@/domain/aircraft/availability';
import { decodeDataRefString } from '@/domain/simulator/dataref-string';
import type { DataRefValue } from '@/domain/simulator/types';

export type DestinationView =
  | { kind: 'unavailable' }
  | { kind: 'waiting' }
  | { kind: 'notSet' }
  | { kind: 'shown'; id: string; distanceNm: number; timeMin: number | null };

export interface DestinationInput {
  idStatus: BindingStatus | undefined;
  distanceStatus: BindingStatus | undefined;
  idValue: DataRefValue | undefined;
  distanceValue: DataRefValue | undefined;
  timeValue: DataRefValue | undefined;
}

/**
 * F-11 R8: a destination is shown only when the aircraft populates the default GPS and one is set;
 * otherwise the reason is given in words, and a blank or zero distance is never shown. The
 * identifier is a `data` DataRef, so it arrives base64-encoded and NUL-padded.
 */
export function destinationView(input: DestinationInput): DestinationView {
  if (input.idStatus === 'missing' || input.distanceStatus === 'missing') {
    return { kind: 'unavailable' };
  }
  if (input.idValue === undefined || typeof input.distanceValue !== 'number') {
    return { kind: 'waiting' };
  }
  const id = decodeDataRefString(input.idValue, 'data');
  if (id === null) {
    return { kind: 'notSet' };
  }
  return {
    kind: 'shown',
    id,
    distanceNm: input.distanceValue,
    timeMin: typeof input.timeValue === 'number' ? input.timeValue : null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/domain/flight-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
git add src/domain/flight-data tests/unit/domain/flight-data.test.ts
git commit -m "feat(flight-data): format values, pick the simulator badge and decide the destination

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The two profile features, and the mock server's values

**Files:**
- Modify: `src/domain/aircraft/profiles/generic.ts`, `tests/mock-xplane/mock-xplane-server.ts`
- Test: `tests/unit/domain/aircraft-profile.test.ts`, plus every existing test that asserts the generic profile's feature list, binding list, version or per-feature statuses

**Interfaces:**
- Produces: `GENERIC_DATAREFS` gains `groundSpeed`, `trueAirspeed`, `groundTrack`, `windSpeed`, `windDirection`, `outsideAirTemp`, `totalAirTemp`, `fuelTotal`, `zuluTime`, `localTime`, `inReplay`, `gpsDistance`, `gpsTimeToGo`, `gpsDestinationId`; `FEATURE_FLIGHT_DATA = 'flight-data'`, `FEATURE_GPS_DESTINATION = 'gps-destination'`; `GENERIC_PROFILE.version = '1.1.0'`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/domain/aircraft-profile.test.ts`, import `FEATURE_FLIGHT_DATA` and
`FEATURE_GPS_DESTINATION`, then:

1. Extend `'lists every distinct name of the generic profile'` to expect, after
   `GENERIC_COMMANDS.headingUp`, in this order: `groundSpeed`, `trueAirspeed`, `groundTrack`,
   `windSpeed`, `windDirection`, `outsideAirTemp`, `totalAirTemp`, `fuelTotal`, `zuluTime`,
   `localTime`, `inReplay`, `gpsDistance`, `gpsTimeToGo`, `gpsDestinationId` (all from
   `GENERIC_DATAREFS`).
2. Rename `'declares the three Stage 1 features'` to `'declares the Stage 1 features'` and append
   `FEATURE_FLIGHT_DATA` and `FEATURE_GPS_DESTINATION` to its expected list.
3. Add:

```ts
  it('makes every flight data and destination binding optional and read-only', () => {
    for (const featureId of [FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION]) {
      const feature = findFeature(GENERIC_PROFILE, featureId);
      expect(feature).not.toBeNull();
      for (const binding of feature?.bindings ?? []) {
        expect({ name: binding.name, required: binding.required, write: binding.write }).toEqual({
          name: binding.name,
          required: false,
          write: undefined,
        });
        expect(binding.kind).toBe('dataref');
      }
    }
  });

  it('names every DataRef once across the whole profile', () => {
    const names = GENERIC_PROFILE.features.flatMap((feature) =>
      feature.bindings.map((binding) => binding.name),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('bumps the profile version for the new bindings', () => {
    expect(GENERIC_PROFILE.version).toBe('1.1.0');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the profile**

In `src/domain/aircraft/profiles/generic.ts`, extend `GENERIC_DATAREFS` (keep the existing keys
first):

```ts
  groundSpeed: 'sim/cockpit2/gauges/indicators/ground_speed_kt',
  trueAirspeed: 'sim/cockpit2/gauges/indicators/true_airspeed_kts_pilot',
  groundTrack: 'sim/cockpit2/gauges/indicators/ground_track_mag_pilot',
  windSpeed: 'sim/cockpit2/gauges/indicators/wind_speed_kts',
  windDirection: 'sim/cockpit2/gauges/indicators/wind_heading_deg_mag',
  outsideAirTemp: 'sim/cockpit2/temperature/outside_air_temp_degc',
  totalAirTemp: 'sim/cockpit2/gauges/indicators/TAT_pilot',
  fuelTotal: 'sim/flightmodel/weight/m_fuel_total',
  zuluTime: 'sim/time/zulu_time_sec',
  localTime: 'sim/time/local_time_sec',
  inReplay: 'sim/time/is_in_replay',
  gpsDistance: 'sim/cockpit2/radios/indicators/gps_dme_distance_nm',
  gpsTimeToGo: 'sim/cockpit2/radios/indicators/gps_dme_time_min',
  gpsDestinationId: 'sim/cockpit2/radios/indicators/gps_nav_id',
```

add the two feature ids next to the others:

```ts
export const FEATURE_FLIGHT_DATA = 'flight-data';
export const FEATURE_GPS_DESTINATION = 'gps-destination';
```

update the profile doc comment's second paragraph with one sentence: "Flight data and the GPS
destination (F-11) bind only optional names: several are community-sourced, and a miss must cost
one field, never the strip.", set `version: '1.1.0'`, and append two features to `features`:

```ts
    {
      id: FEATURE_FLIGHT_DATA,
      label: 'Flight data',
      bindings: [
        { kind: 'dataref', name: GENERIC_DATAREFS.groundSpeed, required: false, purpose: 'Ground speed' },
        { kind: 'dataref', name: GENERIC_DATAREFS.trueAirspeed, required: false, purpose: 'True airspeed' },
        { kind: 'dataref', name: GENERIC_DATAREFS.groundTrack, required: false, purpose: 'Ground track' },
        { kind: 'dataref', name: GENERIC_DATAREFS.windSpeed, required: false, purpose: 'Wind speed' },
        { kind: 'dataref', name: GENERIC_DATAREFS.windDirection, required: false, purpose: 'Wind direction' },
        { kind: 'dataref', name: GENERIC_DATAREFS.outsideAirTemp, required: false, purpose: 'Outside air temperature' },
        { kind: 'dataref', name: GENERIC_DATAREFS.totalAirTemp, required: false, purpose: 'Total air temperature (X-Plane 12.3 and newer)' },
        { kind: 'dataref', name: GENERIC_DATAREFS.fuelTotal, required: false, purpose: 'Fuel remaining' },
        { kind: 'dataref', name: GENERIC_DATAREFS.zuluTime, required: false, purpose: 'Simulator zulu time' },
        { kind: 'dataref', name: GENERIC_DATAREFS.localTime, required: false, purpose: 'Simulator local time' },
        { kind: 'dataref', name: GENERIC_DATAREFS.inReplay, required: false, purpose: 'Replay flag' },
      ],
    },
    {
      id: FEATURE_GPS_DESTINATION,
      label: 'GPS destination',
      bindings: [
        { kind: 'dataref', name: GENERIC_DATAREFS.gpsDistance, required: false, purpose: 'Distance to the GPS destination' },
        { kind: 'dataref', name: GENERIC_DATAREFS.gpsTimeToGo, required: false, purpose: 'Time to the GPS destination' },
        { kind: 'dataref', name: GENERIC_DATAREFS.gpsDestinationId, required: false, purpose: 'GPS destination identifier' },
      ],
    },
```

(Prettier will wrap these lines.)

- [ ] **Step 4: Give the mock X-Plane every new name**

In `tests/mock-xplane/mock-xplane-server.ts`, append to `DEFAULT_MOCK_DATAREFS`:

```ts
  { id: 1009, name: 'sim/cockpit2/gauges/indicators/ground_speed_kt', valueType: 'float', value: 142.4 },
  { id: 1010, name: 'sim/cockpit2/gauges/indicators/true_airspeed_kts_pilot', valueType: 'float', value: 150.2 },
  { id: 1011, name: 'sim/cockpit2/gauges/indicators/ground_track_mag_pilot', valueType: 'float', value: 87.2 },
  { id: 1012, name: 'sim/cockpit2/gauges/indicators/wind_speed_kts', valueType: 'float', value: 12.4 },
  { id: 1013, name: 'sim/cockpit2/gauges/indicators/wind_heading_deg_mag', valueType: 'float', value: 270 },
  { id: 1014, name: 'sim/cockpit2/temperature/outside_air_temp_degc', valueType: 'float', value: -12.3 },
  { id: 1015, name: 'sim/cockpit2/gauges/indicators/TAT_pilot', valueType: 'float', value: -9 },
  { id: 1016, name: 'sim/flightmodel/weight/m_fuel_total', valueType: 'float', value: 1234.5 },
  { id: 1017, name: 'sim/time/zulu_time_sec', valueType: 'float', value: 50709 },
  { id: 1018, name: 'sim/time/local_time_sec', valueType: 'float', value: 32709 },
  { id: 1019, name: 'sim/time/is_in_replay', valueType: 'int', value: 0 },
  { id: 1020, name: 'sim/cockpit2/radios/indicators/gps_dme_distance_nm', valueType: 'float', value: 126.4 },
  { id: 1021, name: 'sim/cockpit2/radios/indicators/gps_dme_time_min', valueType: 'float', value: 53.2 },
  // "KSEA" NUL-padded, base64, as X-Plane sends a byte-array DataRef.
  { id: 1022, name: 'sim/cockpit2/radios/indicators/gps_nav_id', valueType: 'data', value: 'S1NFQQAAAAA=' },
```

- [ ] **Step 5: Bring every dependent test in line**

Run `npm test`. Tests that encode the old profile will fail. Update only literals that describe the
profile's content, never an assertion's intent. Expected places (search `tests/` for
`features.map`, `'1.0.0'`, `Stage 1 features`, `toHaveLength(3)` near compatibility):
- `tests/integration/aircraft-compatibility.test.ts` "reports every feature available": five
  `'available'` entries now that the mock serves every name.
- Any compatibility, diagnostics-summary or screen test that lists features or the profile version.
- `tests/unit/application/simulator-session.test.ts`: the fake client does not serve the new names;
  if a test compares the whole feature list or all diagnostics steps with `toEqual`, add the new
  names' expected `'failed'`/`'partial'` values rather than serving them from the fake, unless the
  test's intent is "every feature available" — then add them to `DEFAULT_FAKE_DATAREFS` with ids
  from 20 upward.
List every test you changed and why in the report.

- [ ] **Step 6: Gate and commit**

```bash
git add -A src tests
git commit -m "feat(aircraft): add the flight data and GPS destination features to the generic profile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The strip setting and the retired Basic data id

**Files:**
- Modify: `src/application/panel-layout.ts`, `src/hooks/usePanelLayout.ts`
- Test: `tests/unit/application/panel-layout.test.ts`, `tests/ui/use-panel-layout.test.tsx`

**Interfaces:**
- Produces: `PanelLayout { hidden: readonly string[]; last: string; strip: boolean }`; `DEFAULT_PANEL_LAYOUT = { hidden: [], last: 'setup', strip: true }`; `RETIRED_PANEL_IDS: Readonly<Record<string, string>> = { 'basic-data': 'flight-data' }`; `setStripShown(layout: PanelLayout, shown: boolean): PanelLayout` (same object when unchanged); `usePanelLayout` also returns `setStrip(shown: boolean)`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/application/panel-layout.test.ts`:
1. Change `KNOWN` to `['flight-data', 'heading']` and every `'basic-data'` in the file to
   `'flight-data'` (it is now a retired id).
2. Add `strip: true` to every expected layout object (`toEqual({ hidden, last })` becomes
   `toEqual({ hidden, last, strip: true })`), and to the literal layouts passed in.
3. Add:

```ts
describe('the strip setting and retired ids', () => {
  it('shows the strip by default, including for a layout saved before the setting existed', async () => {
    expect(DEFAULT_PANEL_LAYOUT.strip).toBe(true);
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: [], last: 'heading' }),
    );
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: [],
      last: 'heading',
      strip: true,
    });
  });

  it('reopens a pilot who last had Basic data on Flight data', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: ['basic-data'], last: 'basic-data' }),
    );
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: ['flight-data'],
      last: 'flight-data',
      strip: true,
    });
    expect(RETIRED_PANEL_IDS).toEqual({ 'basic-data': 'flight-data' });
  });

  it('round-trips the strip setting', async () => {
    const storage = createMemorySettingsStorage();
    await savePanelLayout(storage, { hidden: [], last: 'heading', strip: false });
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: [],
      last: 'heading',
      strip: false,
    });
  });

  it('turns the strip on and off, returning the same layout when nothing changes', () => {
    const layout = { hidden: [], last: SETUP_ROUTE, strip: true };
    expect(setStripShown(layout, true)).toBe(layout);
    expect(setStripShown(layout, false)).toEqual({ ...layout, strip: false });
  });
});
```

(importing `RETIRED_PANEL_IDS` and `setStripShown`).

In `tests/ui/use-panel-layout.test.tsx`, change `KNOWN` and ids the same way, include `strip` in
the probe's text (`${layout.strip ? 'strip' : 'nostrip'}` appended), add a pressable
`hide strip` calling `setStrip(false)`, and a test that pressing it saves `strip: false`.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/application/panel-layout.test.ts tests/ui/use-panel-layout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/application/panel-layout.ts`:

```ts
export interface PanelLayout {
  hidden: readonly string[];
  last: string;
  /** The flight data strip (F-11) docked under the status bar on every other panel. */
  strip: boolean;
}

export const DEFAULT_PANEL_LAYOUT: PanelLayout = { hidden: [], last: SETUP_ROUTE, strip: true };

/**
 * Panels that were replaced, and what replaced them. A stored `last` or `hidden` entry for a
 * retired id is rewritten before unknown ids are dropped, so a pilot is not thrown back to Setup
 * because a placeholder panel was retired.
 */
export const RETIRED_PANEL_IDS: Readonly<Record<string, string>> = { 'basic-data': 'flight-data' };

const storedSchema = z.object({
  hidden: z.array(z.string()),
  last: z.string(),
  strip: z.boolean().optional(),
});

function successor(id: string): string {
  return RETIRED_PANEL_IDS[id] ?? id;
}
```

`normaliseLayout` maps through `successor` first:

```ts
export function normaliseLayout(layout: PanelLayout, knownIds: readonly string[]): PanelLayout {
  const hidden = [
    ...new Set(layout.hidden.map(successor).filter((id) => knownIds.includes(id))),
  ];
  const mappedLast = successor(layout.last);
  const last =
    mappedLast === SETUP_ROUTE || knownIds.includes(mappedLast) ? mappedLast : SETUP_ROUTE;
  // A layout that hides everything (only reachable by editing storage) would leave a switcher
  // with Setup alone; show everything again instead.
  return { hidden: hidden.length >= knownIds.length ? [] : hidden, last, strip: layout.strip };
}

export function setStripShown(layout: PanelLayout, shown: boolean): PanelLayout {
  return layout.strip === shown ? layout : { ...layout, strip: shown };
}
```

In `loadPanelLayout`, normalise `{ ...parsed.data, strip: parsed.data.strip ?? true }`; in
`savePanelLayout`, write `{ hidden, last, strip }`.

In `src/hooks/usePanelLayout.ts`, import `setStripShown` and add

```ts
  const setStrip = useCallback(
    (shown: boolean) => update((prev) => setStripShown(prev, shown)),
    [update],
  );
```

returning `{ layout, ready, setLast, setHidden, setStrip }`.

- [ ] **Step 4: Run the tests, gate, commit**

Run the two files, then the gate (other tests constructing a `PanelLayout` literal need
`strip: true` added — do that and list them).

```bash
git add -A src tests
git commit -m "feat(panels): persist the flight data strip setting and migrate the retired Basic data id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shared radio chips, the unit context and the Units section

**Files:**
- Create: `src/theme/RadioChips.tsx`, `src/features/units/UnitsProvider.tsx`, `src/features/units/UnitsSection.tsx`
- Modify: `src/theme/ThemeToggle.tsx` (use `RadioChips`)
- Test: `tests/ui/units.test.tsx` (and `tests/ui/theme.test.tsx` must keep passing unchanged)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `RadioChips<T extends string>(props: { options: readonly { value: T; label: string; accessibilityLabel: string }[]; selected: T; onSelect(value: T): void; accessibilityLabel?: string })` — a `radiogroup` of `radio` chips, each ≥ 48 dp, the selected one `checked` and `selected`.
  - `UnitsProvider({ storage, children })`; `useUnits(): { units: UnitPreferences; setUnit<K extends keyof UnitPreferences>(kind: K, value: UnitPreferences[K]): void; ready: boolean }` (throws outside the provider).
  - `UnitsSection()` — Setup section titled "Units" with three `RadioChips` groups.

- [ ] **Step 1: Write the failing tests**

`tests/ui/units.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import { UNITS_STORAGE_KEY } from '@/application/unit-preferences';
import { UnitsProvider, useUnits } from '@/features/units/UnitsProvider';
import { UnitsSection } from '@/features/units/UnitsSection';
import { ThemeProvider } from '@/theme/theme-context';

function Probe() {
  const { units, ready } = useUnits();
  return <Text testID="units">{`${ready ? 'ready' : 'loading'} ${units.fuel} ${units.temperature} ${units.distance}`}</Text>;
}

function tree(storage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <UnitsSection />
        <Probe />
      </UnitsProvider>
    </ThemeProvider>
  );
}

describe('units', () => {
  it('starts on the defaults', async () => {
    await render(tree());
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('ready kg C nm'));
    expect(screen.getByRole('radio', { name: 'Fuel in kilograms' })).toBeChecked();
  });

  it('changes a unit and keeps it across a restart', async () => {
    const storage = createMemorySettingsStorage();
    const first = await render(tree(storage));
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('ready'));
    await fireEvent.press(screen.getByRole('radio', { name: 'Fuel in pounds' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Temperature in Fahrenheit' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Distance in kilometres' }));
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem(UNITS_STORAGE_KEY)) ?? 'null')).toEqual({
        fuel: 'lb',
        temperature: 'F',
        distance: 'km',
      }),
    );
    await first.unmount();
    await render(tree(storage));
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('ready lb F km'));
  });

  it('a choice made before the stored units load is not overwritten', async () => {
    let release: (value: string | null) => void = () => undefined;
    const storage = {
      getItem: (key: string) =>
        key === UNITS_STORAGE_KEY
          ? new Promise<string | null>((resolve) => (release = resolve))
          : Promise.resolve(null),
      setItem: jest.fn(async () => undefined),
    };
    await render(tree(storage));
    await fireEvent.press(screen.getByRole('radio', { name: 'Fuel in pounds' }));
    release(JSON.stringify({ fuel: 'kg', temperature: 'F', distance: 'km' }));
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('ready lb C nm'));
  });

  it('meets the touch rules on every chip', async () => {
    await render(tree());
    for (const chip of screen.getAllByRole('radio')) {
      const style = StyleSheet.flatten(chip.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });

  it('useUnits throws outside the provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(render(<Probe />)).rejects.toThrow('useUnits must be used inside UnitsProvider');
    } finally {
      spy.mockRestore();
    }
  });
});
```

(If `render` in this library version throws synchronously rather than rejecting, adapt the last
test to `expect(() => render(<Probe />)).toThrow(...)` as `tests/ui/theme.test.tsx` does for
`useTheme`, and say so.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/ui/units.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/theme/RadioChips.tsx` — move `ThemeToggle`'s styles here:

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.touch.spacing,
    marginBottom: theme.spacing.lg,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { color: theme.colors.text, fontSize: theme.typography.bodySize },
  chipTextSelected: { color: theme.colors.onPrimary, fontWeight: 'bold' as const },
});

export interface RadioChipOption<T extends string> {
  value: T;
  label: string;
  accessibilityLabel: string;
}

/** A single-choice row of chips, each a full-size touch target (F-04 R4). */
export function RadioChips<T extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
}: {
  options: readonly RadioChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ checked: isSelected, selected: isSelected }}
            onPress={() => onSelect(option.value)}
            style={[styles.chip, isSelected ? styles.chipSelected : null]}
          >
            <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

`src/theme/ThemeToggle.tsx` becomes:

```tsx
import React from 'react';

import { RadioChips } from '@/theme/RadioChips';
import { useThemePreference } from '@/theme/theme-context';
import { THEME_PREFERENCES, type ThemePreference } from '@/theme/theme-preference';

const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  'auto-night': 'System (night)',
  light: 'Light',
  dark: 'Dark',
  night: 'Night',
};

const OPTIONS = THEME_PREFERENCES.map((value) => ({
  value,
  label: LABELS[value],
  accessibilityLabel: `Theme ${LABELS[value]}`,
}));

export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();
  return <RadioChips options={OPTIONS} selected={preference} onSelect={setPreference} />;
}
```

`src/features/units/UnitsProvider.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { SettingsStorage } from '@/application/settings-store';
import { loadUnitPreferences, saveUnitPreferences } from '@/application/unit-preferences';
import { DEFAULT_UNITS, type UnitPreferences } from '@/domain/units/units';

interface UnitsContextValue {
  units: UnitPreferences;
  setUnit: <K extends keyof UnitPreferences>(kind: K, value: UnitPreferences[K]) => void;
  ready: boolean;
}

const UnitsContext = createContext<UnitsContextValue | null>(null);

/**
 * The unit choice every numeric view reads (F-11 R2; F-13 and F-14 later). Same load rule as the
 * panel layout: a real change made before the stored value arrives wins over it.
 */
export function UnitsProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [units, setUnits] = useState<UnitPreferences>(DEFAULT_UNITS);
  const [ready, setReady] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadUnitPreferences(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      setUnits((prev) => (touched.current ? prev : stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setUnit = useCallback(
    <K extends keyof UnitPreferences>(kind: K, value: UnitPreferences[K]) => {
      setUnits((prev) => {
        if (prev[kind] === value) {
          return prev;
        }
        touched.current = true;
        const next = { ...prev, [kind]: value };
        void saveUnitPreferences(storage, next);
        return next;
      });
    },
    [storage],
  );

  const value = useMemo(() => ({ units, setUnit, ready }), [units, setUnit, ready]);
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  const value = useContext(UnitsContext);
  if (value === null) {
    throw new Error('useUnits must be used inside UnitsProvider');
  }
  return value;
}
```

`src/features/units/UnitsSection.tsx`:

```tsx
import React from 'react';

import type { DistanceUnit, FuelUnit, TemperatureUnit } from '@/domain/units/units';
import { useUnits } from '@/features/units/UnitsProvider';
import { RadioChips } from '@/theme/RadioChips';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';

const FUEL: { value: FuelUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'kg', label: 'kg', accessibilityLabel: 'Fuel in kilograms' },
  { value: 'lb', label: 'lb', accessibilityLabel: 'Fuel in pounds' },
];
const TEMPERATURE: { value: TemperatureUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'C', label: '°C', accessibilityLabel: 'Temperature in Celsius' },
  { value: 'F', label: '°F', accessibilityLabel: 'Temperature in Fahrenheit' },
];
const DISTANCE: { value: DistanceUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'nm', label: 'nm', accessibilityLabel: 'Distance in nautical miles' },
  { value: 'km', label: 'km', accessibilityLabel: 'Distance in kilometres' },
];

/** Speeds stay in knots and directions in degrees, as on every pilot-facing instrument. */
export function UnitsSection() {
  const { units, setUnit } = useUnits();
  return (
    <Section>
      <SectionTitle>Units</SectionTitle>
      <BodyText>Fuel</BodyText>
      <RadioChips options={FUEL} selected={units.fuel} onSelect={(value) => setUnit('fuel', value)} accessibilityLabel="Fuel unit" />
      <BodyText>Temperature</BodyText>
      <RadioChips options={TEMPERATURE} selected={units.temperature} onSelect={(value) => setUnit('temperature', value)} accessibilityLabel="Temperature unit" />
      <BodyText>Distance</BodyText>
      <RadioChips options={DISTANCE} selected={units.distance} onSelect={(value) => setUnit('distance', value)} accessibilityLabel="Distance unit" />
    </Section>
  );
}
```

- [ ] **Step 4: Run, gate, commit**

Run: `npx jest tests/ui/units.test.tsx tests/ui/theme.test.tsx` (theme tests unchanged and
passing), then the gate.

```bash
git add src/theme src/features/units tests/ui/units.test.tsx
git commit -m "feat(units): add the unit context, the Units section and shared radio chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Flight data panel replaces Basic data

**Files:**
- Modify: `src/features/panels/primitives/PanelFrame.tsx` (split out `PanelScope`), `src/features/panels/registry.ts`
- Create: `src/features/panels/flight-data/useFlightValue.ts`, `FlightValue.tsx`, `SimBadge.tsx`, `DestinationBlock.tsx`, `FlightDataPanel.tsx`
- Delete: `src/features/panels/basic-data/BasicDataPanel.tsx`
- Test: `tests/ui/flight-data-panel.test.tsx`; migrate `tests/ui/panels.test.tsx` (Basic data tests go; registry expectations change) and every test that names `basic-data` / `Basic data` (`tests/ui/app-shell.test.tsx`, `tests/ui/setup-screen.test.tsx`, `tests/web/app-shell.web.test.tsx`, the touch guard uses `PANEL_IDS` and needs no change)

**Interfaces:**
- Consumes: Tasks 2, 3, 5; `usePanel`, `PanelContext`, `panelLinkStatus`.
- Produces:
  - `PanelScope({ snapshot, now, actions, children })` in `PanelFrame.tsx` — provides the panel context without chrome; `PanelFrame` renders it.
  - `useFlightValue(names: readonly string[], format: (values: readonly number[]) => string): { text: string; missing: boolean; current: boolean }` — `missing` when any name's binding is `missing`; `text` `'—'` when any value is not a number yet or when connected with `activity === 'noFlight'`; `current` = `link.valuesCurrent`.
  - `FlightValue({ label, names, format })`; `SimBadge()`; `DestinationBlock()`; `FLIGHT_DATA_PANEL: PanelDescriptor` (`id: 'flight-data'`, `title: 'Flight data'`, features `[FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION]`, `EVERYWHERE`); `FlightDataPanel()`.
  - `PANELS` = `[flight-data, heading]`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/flight-data-panel.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { FlightDataPanel } from '@/features/panels/flight-data/FlightDataPanel';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider, useUnits } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

const VALUES: Record<string, number | string> = {
  [D.groundSpeed]: 142.4,
  [D.trueAirspeed]: 150.2,
  [D.groundTrack]: 87.2,
  [D.windSpeed]: 12.4,
  [D.windDirection]: 270,
  [D.outsideAirTemp]: -12.3,
  [D.totalAirTemp]: -9,
  [D.fuelTotal]: 1234.5,
  [D.zuluTime]: 50709,
  [D.localTime]: 32709,
  [D.inReplay]: 0,
  [D.gpsDistance]: 126.4,
  [D.gpsTimeToGo]: 53.2,
  [D.gpsDestinationId]: base64('KSEA\0\0\0\0'),
};

function telemetry(values: Record<string, number | string>, receivedAt = NOW) {
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

function PoundsButton() {
  const { setUnit } = useUnits();
  return (
    <Pressable accessibilityRole="button" onPress={() => setUnit('fuel', 'lb')}>
      <Text>use pounds</Text>
    </Pressable>
  );
}

const actions = { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };

async function renderPanel(snapshot: SessionSnapshot) {
  const storage = createMemorySettingsStorage();
  return render(
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PoundsButton />
        <PanelFrame title="Flight data" snapshot={snapshot} now={NOW} actions={actions}>
          <FlightDataPanel />
        </PanelFrame>
      </UnitsProvider>
    </ThemeProvider>,
  );
}

describe('Flight data panel', () => {
  it('shows every field, formatted', async () => {
    await renderPanel(live());
    expect(screen.getByLabelText('Ground speed: 142 kt')).toBeTruthy();
    expect(screen.getByLabelText('True airspeed: 150 kt')).toBeTruthy();
    expect(screen.getByLabelText('Track (magnetic): 087°')).toBeTruthy();
    expect(screen.getByLabelText('Wind (from): 270° / 12 kt')).toBeTruthy();
    expect(screen.getByLabelText('Outside air temp: −12 °C')).toBeTruthy();
    expect(screen.getByLabelText('Total air temp: −9 °C')).toBeTruthy();
    expect(screen.getByLabelText('Fuel remaining: 1,235 kg')).toBeTruthy();
    expect(screen.getByLabelText('Sim zulu: 14:05:09')).toBeTruthy();
    expect(screen.getByLabelText('Sim local: 09:05:09')).toBeTruthy();
    expect(screen.getByLabelText('GPS destination: KSEA, 126 nm, 0:53')).toBeTruthy();
  });

  it('applies a unit change everywhere at once', async () => {
    await renderPanel(live());
    await fireEvent.press(screen.getByText('use pounds'));
    await waitFor(() => expect(screen.getByLabelText('Fuel remaining: 2,722 lb')).toBeTruthy());
  });

  it('a steady value is not marked stale while the link is live', async () => {
    // Fuel arrived long ago and never changed; X-Plane only resends values that change.
    await renderPanel(live({ telemetry: telemetry(VALUES, NOW - 600_000) }));
    expect(screen.getByLabelText('Fuel remaining: 1,235 kg')).toBeTruthy();
    expect(screen.queryByText('not live')).toBeNull();
  });

  it('shows PAUSED without marking values stale', async () => {
    await renderPanel(live({ health: { ...live().health, activity: 'paused', live: false } }));
    expect(screen.getByLabelText('X-Plane is paused')).toBeTruthy();
    expect(screen.queryByText('not live')).toBeNull();
  });

  it('shows REPLAY', async () => {
    await renderPanel(live({ telemetry: telemetry({ ...VALUES, [D.inReplay]: 1 }) }));
    expect(screen.getByLabelText('X-Plane is in replay')).toBeTruthy();
  });

  it('keeps the last values, muted and not live, after the link drops, with no badge', async () => {
    await renderPanel({
      ...live({ telemetry: telemetry({ ...VALUES, [D.inReplay]: 1 }) }),
      state: 'disconnected',
      health: { ...base.health, activity: 'unknown', lastHeartbeatAt: NOW - 5000 },
    });
    expect(screen.getByLabelText('Ground speed: 142 kt, not live')).toBeTruthy();
    expect(screen.queryByLabelText('X-Plane is in replay')).toBeNull();
  });

  it('shows no values when no flight is loaded', async () => {
    await renderPanel(live({ health: { ...live().health, activity: 'noFlight', live: false } }));
    expect(screen.getByText('No flight loaded in X-Plane.')).toBeTruthy();
    expect(screen.getByLabelText('Ground speed: —, not live')).toBeTruthy();
  });

  it('marks only the field whose DataRef is missing', async () => {
    await renderPanel(withMissing(live(), D.totalAirTemp));
    expect(screen.getByLabelText('Total air temp: not available on this aircraft')).toBeTruthy();
    expect(screen.getByLabelText('Outside air temp: −12 °C')).toBeTruthy();
  });

  it('says the aircraft has no GPS destination when the GPS names are missing', async () => {
    await renderPanel(withMissing(live(), D.gpsDistance, D.gpsTimeToGo, D.gpsDestinationId));
    expect(screen.getByText('No destination available on this aircraft.')).toBeTruthy();
    expect(screen.queryByText(/ nm/)).toBeNull();
  });

  it('says no destination is set, never a zero distance', async () => {
    await renderPanel(
      live({
        telemetry: telemetry({ ...VALUES, [D.gpsDestinationId]: base64('\0\0\0\0'), [D.gpsDistance]: 0 }),
      }),
    );
    expect(screen.getByText('No destination set in the GPS.')).toBeTruthy();
    expect(screen.queryByText(/0\.0 nm/)).toBeNull();
  });

  it('writes nothing', async () => {
    await renderPanel(live());
    await act(async () => undefined);
    expect(actions.write).not.toHaveBeenCalled();
    expect(actions.activate).not.toHaveBeenCalled();
  });
});
```

In `tests/ui/panels.test.tsx`: delete the `describe('Basic data panel', ...)` block and its
imports; change the registry test to expect `['flight-data', 'heading']`.

In the shell and web tests: replace the `Basic data` tab with `Flight data`, `basic-data` with
`flight-data`, and the `setDemand` expectation for that panel with
`[FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION]`. The rotation test's seeded route and the
`hidden` switch test change the same way (`'Show Flight data in the switcher'`). Any test that
renders a panel inside the shell now needs a `UnitsProvider` — Task 7 mounts it inside `AppShell`,
so until then add `<UnitsProvider storage={...}>` around `AppShell` in those test trees only if a
test fails for that reason, and remove it again in Task 7.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/ui/flight-data-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`PanelFrame.tsx` — extract the provider:

```tsx
/** The panel context without chrome: for read-only views that live outside a panel (the strip). */
export function PanelScope({
  snapshot,
  now,
  actions,
  children,
}: {
  snapshot: SessionSnapshot;
  now: number;
  actions: PanelActions;
  children: React.ReactNode;
}) {
  const { valuesCurrent, controlsEnabled, notice } = panelLinkStatus({
    state: snapshot.state,
    activity: snapshot.health.activity,
    lastHeartbeatAt: snapshot.health.lastHeartbeatAt,
    now,
  });
  const value = useMemo<PanelContextValue>(
    () => ({
      snapshot,
      now,
      link: { valuesCurrent, controlsEnabled, notice },
      write: actions.write,
      activate: actions.activate,
    }),
    [snapshot, now, valuesCurrent, controlsEnabled, notice, actions.write, actions.activate],
  );
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}
```

and `PanelFrame` renders `<PanelScope ...><ScrollView>…</ScrollView></PanelScope>`, reading the
notice through a small inner component (`PanelNotice`) that calls `usePanel()`, so the link status
is computed once.

`src/features/panels/flight-data/useFlightValue.ts`:

```ts
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface FlightValueState {
  text: string;
  /** A DataRef this value needs did not resolve on this aircraft (F-11 R7). */
  missing: boolean;
  /** The link's freshness, never the value's own receipt time (spec: "Freshness"). */
  current: boolean;
}

export function useFlightValue(
  names: readonly string[],
  format: (values: readonly number[]) => string,
): FlightValueState {
  const { snapshot, link } = usePanel();
  const missing = names.some((name) => snapshot.compatibility.bindings[name]?.status === 'missing');
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const values = names.map((name) => snapshot.telemetry[name]?.value);
  const numbers = values.filter((value): value is number => typeof value === 'number');
  const text = noFlight || numbers.length !== names.length ? '—' : format(numbers);
  return { text, missing, current: link.valuesCurrent };
}
```

`FlightValue.tsx` — the same row shape as `Readout` (label, bold value, muted "not live"), with
`accessibilityLabel` `${label}: ${text}` plus `, not live` when not current, and
`${label}: not available on this aircraft` when missing (reuse `Readout`'s styles by copying its
`makeStyles`; do not import Readout's private styles).

`SimBadge.tsx`:

```tsx
export function SimBadge() {
  const { snapshot } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const badge = simulatorBadge(
    snapshot.state,
    snapshot.health.activity,
    snapshot.telemetry[GENERIC_DATAREFS.inReplay]?.value,
  );
  if (badge === null) {
    return null;
  }
  return (
    <View
      style={styles.badge}
      accessible
      accessibilityRole="text"
      accessibilityLabel={badge === 'paused' ? 'X-Plane is paused' : 'X-Plane is in replay'}
    >
      <Text style={styles.text}>{SIM_BADGE_LABEL[badge]}</Text>
    </View>
  );
}
```

with a bordered `danger`-coloured pill style.

`DestinationBlock.tsx`: reads `usePanel()` and `useUnits()`, calls `destinationView` with the three
GPS names' binding statuses and telemetry values, and renders:
- `shown` → a row labelled "GPS destination" whose `accessibilityLabel` is
  `GPS destination: ${id}, ${formatDistance(distanceNm, units.distance)}${timeMin === null ? '' : `, ${formatTimeToGo(timeMin)}`}` (plus `, not live` when not current), and the text in the row;
- `unavailable` → `BodyText muted` "No destination available on this aircraft.";
- `notSet` → "No destination set in the GPS.";
- `waiting` → the row with "—".

`FlightDataPanel.tsx`:

```tsx
export const FLIGHT_DATA_PANEL: PanelDescriptor = {
  id: 'flight-data',
  title: 'Flight data',
  features: [FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION],
  supports: EVERYWHERE,
};

const one = (format: (value: number) => string) => (values: readonly number[]) =>
  format(values[0] ?? 0);

/** F-11: the numbers no instrument shows. Read-only (R11): nothing here writes or activates. */
export function FlightDataPanel() {
  const { units } = useUnits();
  return (
    <>
      <SimBadge />
      <FlightValue label="Ground speed" names={[D.groundSpeed]} format={one(formatSpeed)} />
      <FlightValue label="True airspeed" names={[D.trueAirspeed]} format={one(formatSpeed)} />
      <FlightValue label="Track (magnetic)" names={[D.groundTrack]} format={one(formatHeading)} />
      <FlightValue
        label="Wind (from)"
        names={[D.windDirection, D.windSpeed]}
        format={([direction = 0, speed = 0]) => formatWind(direction, speed)}
      />
      <FlightValue label="Outside air temp" names={[D.outsideAirTemp]} format={one((c) => formatTemperature(c, units.temperature))} />
      <FlightValue label="Total air temp" names={[D.totalAirTemp]} format={one((c) => formatTemperature(c, units.temperature))} />
      <FlightValue label="Fuel remaining" names={[D.fuelTotal]} format={one((kg) => formatFuel(kg, units.fuel))} />
      <FlightValue label="Sim zulu" names={[D.zuluTime]} format={one(formatClock)} />
      <FlightValue label="Sim local" names={[D.localTime]} format={one(formatClock)} />
      <DestinationBlock />
    </>
  );
}
```

`registry.ts`: import `FLIGHT_DATA_PANEL`/`FlightDataPanel` in place of Basic data, first in
`PANELS`. Delete `src/features/panels/basic-data/`.

- [ ] **Step 4: Run, gate, commit**

Run: `npx jest tests/ui` then the gate. The error-text and touch guards pick up the new panel
through the registry automatically; they must pass unchanged.

```bash
git add -A src tests
git commit -m "feat(flight-data): add the Flight data panel and retire Basic data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The docked strip and the shell wiring

**Files:**
- Create: `src/features/panels/flight-data/FlightDataStrip.tsx`
- Modify: `src/features/shell/AppShell.tsx`, `src/features/shell/PanelChooser.tsx`, `src/features/shell/SetupScreen.tsx`
- Test: `tests/ui/flight-data-strip.test.tsx`, `tests/ui/app-shell.test.tsx` (new cases), `tests/ui/touch-target-guard.test.tsx` (must pass unchanged)

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces: `FlightDataStrip({ snapshot, now, onOpen }: { snapshot: SessionSnapshot; now: number; onOpen: (() => void) | null })` — `testID="flight-data-strip"`; pressable (`accessibilityRole="button"`, ≥ 48 dp) when `onOpen` is not null, a plain view otherwise; four cells: ground speed, wind, fuel, sim zulu (the latter with a trailing `Z`), plus `SimBadge`.

**Behaviour:**
- `AppShell` wraps everything below `ServicesProvider` access in `<UnitsProvider storage={settingsStorage}>`.
- The strip renders inside the status-bar wrap, under `LinkStatusBar`, when: the layout is ready, `layout.strip` is true, the route is a panel other than `flight-data`, and that panel fits.
- `onOpen` is `() => setLast('flight-data')` when the Flight data panel is among the shown panels, else `null`.
- Demand = the active fitting panel's features ∪ (`strip visible` ? `[FEATURE_FLIGHT_DATA]` : `[]`), de-duplicated and sorted into the existing string key.
- `PanelChooser` gains, after the panel list, a switch "Show the flight data strip on every panel" (`accessibilityRole="switch"`, checked = `layout.strip`, ≥ 48 dp) calling `onSetStrip(!layout.strip)`; `SetupScreen` passes `stripShown`/`onSetStrip` through and renders `<UnitsSection />` after the Display section.
- The strip passes no-op actions to `PanelScope`: `{ write: async () => undefined, activate: async () => undefined }` defined at module level.

- [ ] **Step 1: Write the failing tests**

`tests/ui/flight-data-strip.test.tsx` — render `FlightDataStrip` in `ThemeProvider` +
`UnitsProvider` with the Task 6 `live()` fixture (copy the helpers), and assert:
- the accessible name is `Flight data: ground speed 142 kt, wind 270° / 12 kt, fuel 1,235 kg, sim zulu 14:05:09Z. Open flight data.` and pressing it calls `onOpen`;
- with `onOpen={null}` there is no `button` role;
- disconnected: the name contains `not live`;
- paused: the badge `X-Plane is paused` is rendered;
- a missing fuel DataRef renders `n/a` for fuel only;
- its flattened style has `minHeight` ≥ 48 and `minWidth` ≥ 48.

In `tests/ui/app-shell.test.tsx` add:

```tsx
  it('docks the strip on other panels, not on Setup or on Flight data itself', async () => {
    const { services } = makeServices(liveSnapshot(), await seeded('heading'));
    await render(tree(services));
    await screen.findByTestId('panel-heading');
    expect(screen.getByTestId('flight-data-strip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('flight-data-strip'));
    expect(screen.getByTestId('panel-flight-data')).toBeTruthy();
    expect(screen.queryByTestId('flight-data-strip')).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: 'Setup' }));
    expect(screen.queryByTestId('flight-data-strip')).toBeNull();
  });

  it('asks for the flight data DataRefs only while the strip is visible', async () => {
    const { services, session } = makeServices({}, await seeded('heading'));
    await render(tree(services));
    await screen.findByTestId('panel-heading');
    await waitFor(() =>
      expect(session.setDemand).toHaveBeenLastCalledWith([
        FEATURE_FLIGHT_DATA,
        FEATURE_HEADING_CONTROL,
      ]),
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Setup' }));
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Show the flight data strip on every panel' }),
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Heading' }));
    expect(screen.queryByTestId('flight-data-strip')).toBeNull();
    expect(session.setDemand).toHaveBeenLastCalledWith([FEATURE_HEADING_CONTROL]);
  });
```

(the demand array is sorted, so check the sort order of the ids you pass and adjust the literal
order to match `sort()`; import `FEATURE_FLIGHT_DATA`).

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/ui/flight-data-strip.test.tsx tests/ui/app-shell.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`FlightDataStrip.tsx`: a `PanelScope` around a row of four `StripCell`s (each uses
`useFlightValue`; `missing` → `n/a`) and `SimBadge`. Build the accessible name from the four cells'
texts: `Flight data: ground speed ${a}, wind ${b}, fuel ${c}, sim zulu ${d}Z${current ? '' : ', not live'}. Open flight data.` (drop the last sentence when `onOpen` is null). Use a `Pressable`
with `minHeight: theme.touch.minTarget`, `minWidth: theme.touch.minTarget` when pressable, a
`View` with the same size otherwise. Keep cells compact: label in `textMuted` at body size, value
bold at title size, `flex: 1` each so four fit a phone width.

`AppShell.tsx`: apply the Behaviour list. Compute:

```ts
const flightDataShown = shown.some((panel) => panel.descriptor.id === FLIGHT_DATA_PANEL.id);
const stripVisible =
  ready && layout.strip && active !== null && fit === 'fits' &&
  active.descriptor.id !== FLIGHT_DATA_PANEL.id;
const demanded = [
  ...(active !== null && fit === 'fits' ? active.descriptor.features : []),
  ...(stripVisible ? [FEATURE_FLIGHT_DATA] : []),
];
const demandKey = [...new Set(demanded)].sort().join('\n');
```

and render the strip under `LinkStatusBar` inside the status-bar wrap.

- [ ] **Step 4: Run, gate, commit**

Run `npx jest tests/ui tests/web`, then the gate. Remove any temporary `UnitsProvider` a Task 6
test tree added around `AppShell`.

```bash
git add -A src tests
git commit -m "feat(flight-data): dock the flight data strip on every panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end check and documentation

**Files:**
- Create: `tests/integration/flight-data.test.ts`
- Modify: `docs/xplane.md`, `docs/architecture.md`, `README.md`, `docs/testing/xplane-smoke-test.md`

- [ ] **Step 1: Integration test**

`tests/integration/flight-data.test.ts` (copy `createSession` and `until` from
`tests/integration/aircraft-compatibility.test.ts`):

```ts
import { destinationView } from '@/domain/flight-data/destination';
import {
  FEATURE_FLIGHT_DATA,
  FEATURE_GPS_DESTINATION,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';

describe('flight data against the mock X-Plane', () => {
  let server: MockXPlaneServer;
  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });
  afterEach(async () => {
    await server.stop();
  });

  const destinationOf = (session: SimulatorSession) => {
    const { compatibility, telemetry } = session.store.getSnapshot();
    return destinationView({
      idStatus: compatibility.bindings[D.gpsDestinationId]?.status,
      distanceStatus: compatibility.bindings[D.gpsDistance]?.status,
      idValue: telemetry[D.gpsDestinationId]?.value,
      distanceValue: telemetry[D.gpsDistance]?.value,
      timeValue: telemetry[D.gpsTimeToGo]?.value,
    });
  };

  it('tracks every field and decodes the GPS identifier', async () => {
    const session = createSession();
    session.setDemand([FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION]);
    await session.connect(server.host, server.port);
    const value = (name: string) => session.store.getSnapshot().telemetry[name]?.value;
    await until(() => value(D.groundSpeed) === 142.4 && value(D.gpsDestinationId) !== undefined);
    server.setDataRefValue(D.groundSpeed, 150);
    server.setDataRefValue(D.fuelTotal, 1200);
    await until(() => value(D.groundSpeed) === 150 && value(D.fuelTotal) === 1200);
    expect(destinationOf(session)).toEqual({
      kind: 'shown',
      id: 'KSEA',
      distanceNm: 126.4,
      timeMin: 53.2,
    });
    session.disconnect();
  });

  it('reports no destination available when the aircraft lacks the GPS names', async () => {
    server.removeDataRef(D.gpsDistance);
    server.removeDataRef(D.gpsTimeToGo);
    server.removeDataRef(D.gpsDestinationId);
    const session = createSession();
    session.setDemand([FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION]);
    await session.connect(server.host, server.port);
    expect(destinationOf(session)).toEqual({ kind: 'unavailable' });
    await until(() => session.store.getSnapshot().telemetry[D.groundSpeed] !== undefined);
    session.disconnect();
  });
});
```

Run it three times in a row; it must pass every time.

- [ ] **Step 2: Documentation**

- `docs/xplane.md`: add a "Flight data (F-11)" table of the 14 names with type, units and source,
  marking `gps_dme_distance_nm`, `gps_dme_time_min`, `gps_nav_id` and `sim/time/paused` as
  community-sourced and unverified, `TAT_pilot` as X-Plane 12.3+, `m_fuel_total` as always kg, and
  wind direction as "from" pending the device check.
- `docs/architecture.md`: a "Flight data" section after "Panels": the two features, link-level
  freshness and why (delta-only streaming), the badge rule, units as the shared module, the strip
  in the shell and its demand, the retired-id migration. Update the Panels section's mention of
  Basic data.
- `README.md`: replace Basic data with Flight data and the strip; mention the Units section.
- `docs/testing/xplane-smoke-test.md`: rows 55 onwards, same format:

| # | Check | Expected |
|---|---|---|
| 55 | Cessna 172 in flight, open Flight data | Ground speed, TAS, track and wind match X-Plane's own readouts (Data Output or the map) |
| 56 | Compare Fuel remaining with X-Plane's Weight & Balance page, in kg, then switch Units → Fuel to lb | Same total; the lb figure is the kg figure × 2.2046 |
| 57 | Set a wind from 270 at 15 kt in X-Plane's weather | Wind (from) reads `270° / 15 kt`, not `090°` |
| 58 | Load the default Cessna with a GPS Direct-To (e.g. KSEA) | GPS destination shows the identifier, a distance and a time; clear the Direct-To → "No destination set in the GPS." |
| 59 | Load an add-on with its own FMS (e.g. Zibo 737) | "No destination available on this aircraft."; the other fields keep working |
| 60 | Pause X-Plane, then start a replay | PAUSED badge with values bright, then REPLAY |
| 61 | On Heading, on a phone in portrait and landscape | The strip shows four values on one row under the status bar; tapping it opens Flight data |
| 62 | Setup → Panels, turn the strip off | It disappears from every panel and stays off after a restart |

- [ ] **Step 3: Gate and commit**

```bash
git add tests/integration/flight-data.test.ts docs README.md
git commit -m "docs: describe flight data, its DataRefs and device checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Requirement coverage

| Req | Task(s) |
|---|---|
| R1 current values at the stream rate | 3 (features, mock), 7 (demand), 8 (integration) |
| R2 units, persistence, shared, sim-time labels | 1, 2, 5, 6 |
| R3 paused and replay distinct from stale | 2 (`simulatorBadge`), 6 |
| R4 age and stale mark | 6 ("a steady value is not marked stale"; link-level freshness) |
| R5 disconnected keeps last values, never zeroed | 6 |
| R6 no flight → says so, no values | 6 |
| R7 missing name costs only its field | 3 (all optional), 6, 7 (`n/a`) |
| R8 destination only when populated | 2, 6, 8 |
| R9, R10 no raw errors, no tokens | read-only views; F-04 guards over the registry (6) |
| R11 writes nothing | 6 ("writes nothing"), 7 (no-op actions) |
