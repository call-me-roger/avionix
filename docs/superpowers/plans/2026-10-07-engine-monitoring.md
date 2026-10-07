# F-12 Engine Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only **Engines** panel: per-engine dials and gauge bars that follow the engine type and carry the aircraft's own colour bands, lean assist, fuel per tank with a totalizer, and the electrical buses and batteries.

**Architecture:** A pure catalogue (`src/domain/engines/catalogue.ts`) holds every name; the profile (1.8.0) builds four optional, read-only features from it. Pure domain functions turn an `EngineReader` (which names resolved, and their numbers) into page models (`enginesPage`, `fuelPage`, `electricalPage`). The panel (`src/features/panels/engines/`) only draws the models. Lean-assist peaks live in an in-memory external store held by the panel's preference provider.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict, react-native-svg, zod v4, Jest (projects: node `tests/unit|contract|integration`, expo `tests/ui`, web `tests/web`), React Native Testing Library 14 (render, rerender and fireEvent are awaited).

**Spec:** `docs/superpowers/specs/2026-10-07-engine-monitoring-design.md`

## Global Constraints

- Minimum simulator X-Plane 12.1.4. Bundle id `pro.avionix.app`. No new native module and no new dependency.
- The panel writes no DataRef, activates no command and starts no hold (R9). Every new binding is a DataRef, `required: false`, without `write`.
- Never render, log or serialise a token, pairing code, URL, HTTP status, exception text, DataRef or command name or id, or protocol payload. Every sentence is plain language and names the aircraft when known ("the Cessna 172", else "this aircraft").
- Numbers use B612 Mono (`numeric(theme)` or `avionicsText(theme)`); negative numbers use U+2212 (`−`), never a hyphen.
- Every pressable meets 48 dp (`theme.touch.minTarget`) in both dimensions.
- Lint uses react-hooks v7: no refs read during render, no `Date.now()` in render, no `setState` that only mirrors props inside an effect, no mutation of props or hook results. Calling an external store's method in an effect is fine.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The full gate is `npm run typecheck && npm run lint && npm run format:check && npx jest`; every task ends green on it.
- Never launch Xcode, Android Studio, a simulator or emulator, `expo start` or an EAS build.

## Review Focus

1. **A glider** (`acf_num_engines` = 0): the ENGINES page says "The Cessna… has no engines." with no dials, no table, no LEAN key, and FUEL and ELEC still work (no generator rows). Pinned in Task 2 and Task 6.
2. **A type array shorter than the count, or a non-numeric type entry**: that engine is "unsupported" with its sentence; the other engines draw normally. Pinned in Task 2.
3. **Non-finite values** (NaN, Infinity) in any array: shown as `—`, never as `NaN`, and give no pointer. Pinned in Task 2 and Task 3.
4. **An aircraft change while LEAN is on**: the old aircraft's peaks are not shown against the new aircraft's EGT. Pinned in Task 5.
5. **Fuel unit pounds**: tanks, total, flow and used all switch together, and TOTAL shows the same number the F-11 flight-data strip shows for the same kilograms. Pinned in Task 3.

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/domain/engines/catalogue.ts` | Feature ids, every name, gauge specs | 1 |
| `src/domain/aircraft/profiles/generic.ts` | Four F-12 features, version 1.8.0 | 1 |
| `src/domain/engines/gauge-sets.ts` | Engine kind from `acf_en_type`, gauge set per kind, legends | 2 |
| `src/domain/engines/markings.ts` | Bands, scale, tone | 2 |
| `src/domain/engines/units.ts` | Instrument values, temperature source, formats, unit labels | 2 |
| `src/domain/engines/engine-page.ts` | `EngineReader`, `enginesPage` model | 2 |
| `src/domain/engines/messages.ts` | Every sentence | 2 |
| `src/domain/engines/fuel.ts` | Tanks, names, totalizer, endurance | 3 |
| `src/domain/engines/electrical.ts` | Bus, battery and generator rows | 3 |
| `src/domain/engines/lean.ts` | Peaks and ΔPEAK | 3 |
| `src/features/panels/engines/dial-geometry.ts` | Arc maths | 4 |
| `src/features/panels/engines/tone.ts` | Tone → colour | 4 |
| `src/features/panels/engines/GaugeBar.tsx` | Horizontal bar with bands, pointer, redline, peak | 4 |
| `src/features/panels/engines/GaugeDial.tsx` | Arc dial with bands and needle | 4 |
| `src/features/panels/engines/engines.ts` | Descriptor, pages, wide threshold | 5 |
| `src/features/panels/engines/engines-preference.ts` | Stored page (`avionix.engines`) | 5 |
| `src/features/panels/engines/lean-store.ts` | In-memory lean store | 5 |
| `src/features/panels/engines/EnginesPreferenceProvider.tsx` | Page and lean contexts | 5 |
| `src/features/panels/engines/engine-reader.ts` | Snapshot → `EngineReader` | 5 |
| `src/features/panels/engines/EngineTable.tsx` | Dial row, gauge table, ΔPEAK row | 5 |
| `src/features/panels/engines/EnginesSection.tsx` | ENGINES page | 5 |
| `src/features/panels/engines/FuelSection.tsx` | FUEL page | 6 |
| `src/features/panels/engines/ElectricalSection.tsx` | ELEC page | 6 |
| `src/features/panels/engines/EnginesPanel.tsx` | Pages and wide layout | 7 |
| `src/features/panels/registry.ts`, `src/features/shell/PanelIcon.tsx`, `src/features/shell/AppShell.tsx` | Registration, glyph, provider | 7 |
| `tests/helpers/engines.ts` | C172 values, compatibility, telemetry | 5 |
| `tests/mock-xplane/mock-xplane-server.ts` | 91 names, toy engine | 8 |
| Docs: `docs/xplane.md`, `docs/architecture.md`, `README.md`, roadmap, smoke rows 162–172 | | 8 |

---

### Task 1: Catalogue and profile 1.8.0

**Files:**
- Create: `src/domain/engines/catalogue.ts`
- Modify: `src/domain/aircraft/profiles/generic.ts` (imports, a new `ENGINES_FEATURE_SPECS`, the header comment, `version`, the `features` array)
- Modify: `tests/unit/domain/aircraft-profile.test.ts`, `tests/ui/compatibility-screen.test.tsx:66`, `tests/ui/aircraft-summary.test.tsx:43`, `tests/unit/application/diagnostics-summary.test.ts:134` (the version string)
- Test: `tests/unit/domain/engines-catalogue.test.ts` (new)

**Interfaces:**
- Consumes: `ENGINES` from `@/domain/systems/controls` (`ENGINES.count` = `sim/aircraft/engine/acf_num_engines`, `ENGINES.type` = `sim/aircraft/prop/acf_en_type`).
- Produces (later tasks import exactly these):
  - `FEATURE_ENGINE_GAUGES = 'engine-gauges'`, `FEATURE_ENGINE_MARKINGS = 'engine-markings'`, `FEATURE_FUEL_QUANTITY = 'fuel-quantity'`, `FEATURE_ELECTRICAL_MONITOR = 'electrical-monitor'`, `ENGINES_FEATURES: readonly string[]`
  - `ENGINE_CONFIG` `{ count, type, egtIsCelsius, ittIsCelsius, oilTempIsCelsius, engineRedline, propRedline }`
  - `GAUGE_IDS`, `type GaugeId = 'rpm'|'prop'|'n1'|'n2'|'map'|'trq'|'epr'|'egt'|'cht'|'itt'|'ff'|'oilP'|'oilT'`
  - `MARKING_KEYS`, `type MarkingKey`, `MARKING_COLOURS`, `type MarkingColour = 'green'|'yellow'|'red'`, `MARKING_EDGES`, `markingName(colour, edge, key): string`, `MARKING_NAMES: readonly string[]`
  - `type TemperatureSourceSpec = { kind: 'flag'; name: string } | { kind: 'celsius' }`
  - `interface GaugeSpec { id; name; legend; spoken; marking: MarkingKey | null; temperature: TemperatureSourceSpec | null }`, `GAUGES: Record<GaugeId, GaugeSpec>`
  - `FUEL` `{ perTank, total, ratio, count, capacity, side, used }`, `TANK_SLOTS = 9`
  - `ELECTRICAL` `{ busCount, batteryCount, busVolts, busAmps, batteryVolts, batteryAmps, generatorAmps }`, `MAX_BUSES = 6`, `MAX_BATTERIES = 8`

- [ ] **Step 1: Write the failing catalogue test**

Create `tests/unit/domain/engines-catalogue.test.ts`:

```ts
import {
  ELECTRICAL,
  ENGINE_CONFIG,
  ENGINES_FEATURES,
  FUEL,
  GAUGES,
  GAUGE_IDS,
  MARKING_NAMES,
  markingName,
} from '@/domain/engines/catalogue';
import { GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';
import { ENGINES } from '@/domain/systems/controls';

describe('the F-12 catalogue', () => {
  it('lists the four features in profile order', () => {
    expect(ENGINES_FEATURES).toEqual([
      'engine-gauges',
      'engine-markings',
      'fuel-quantity',
      'electrical-monitor',
    ]);
  });

  it('names the thirteen engine indicators by Laminar name (spec §3)', () => {
    expect(GAUGE_IDS.map((id) => GAUGES[id].name)).toEqual([
      'sim/cockpit2/engine/indicators/engine_speed_rpm',
      'sim/cockpit2/engine/indicators/prop_speed_rpm',
      'sim/cockpit2/engine/indicators/N1_percent',
      'sim/cockpit2/engine/indicators/N2_percent',
      'sim/cockpit2/engine/indicators/MPR_in_hg',
      'sim/cockpit2/engine/indicators/torque_n_mtr',
      'sim/cockpit2/engine/indicators/EPR_ratio',
      'sim/cockpit2/engine/indicators/EGT_deg_cel',
      'sim/cockpit2/engine/indicators/CHT_deg_cel',
      'sim/cockpit2/engine/indicators/ITT_deg_cel',
      'sim/cockpit2/engine/indicators/fuel_flow_kg_sec',
      'sim/cockpit2/engine/indicators/oil_pressure_psi',
      'sim/cockpit2/engine/indicators/oil_temperature_deg_C',
    ]);
  });

  it('reuses F-24 engine count and type, and F-11 fuel total', () => {
    expect(ENGINE_CONFIG.count).toBe(ENGINES.count);
    expect(ENGINE_CONFIG.type).toBe(ENGINES.type);
    expect(FUEL.total).toBe(GENERIC_DATAREFS.fuelTotal);
  });

  it('reads EGT, ITT and oil temperature units from flags, and CHT as Celsius', () => {
    expect(GAUGES.egt.temperature).toEqual({ kind: 'flag', name: 'sim/aircraft/engine/acf_EGT_is_C' });
    expect(GAUGES.itt.temperature).toEqual({ kind: 'flag', name: 'sim/aircraft/engine/acf_ITT_is_C' });
    expect(GAUGES.oilT.temperature).toEqual({
      kind: 'flag',
      name: 'sim/aircraft/engine/acf_oilT_is_C',
    });
    expect(GAUGES.cht.temperature).toEqual({ kind: 'celsius' });
    expect(GAUGES.rpm.temperature).toBeNull();
  });

  it('builds the 60 marking names, ten instruments by three colours by two edges', () => {
    expect(MARKING_NAMES).toHaveLength(60);
    expect(new Set(MARKING_NAMES).size).toBe(60);
    expect(markingName('yellow', 'hi', 'TRQ')).toBe('sim/aircraft/limits/yellow_hi_TRQ');
    expect(MARKING_NAMES[0]).toBe('sim/aircraft/limits/green_lo_MP');
    expect(MARKING_NAMES[59]).toBe('sim/aircraft/limits/red_hi_oilP');
  });

  it('marks RPM, PROP and FF as having no aircraft markings', () => {
    expect(GAUGES.rpm.marking).toBeNull();
    expect(GAUGES.prop.marking).toBeNull();
    expect(GAUGES.ff.marking).toBeNull();
    expect(GAUGES.map.marking).toBe('MP');
    expect(GAUGES.oilT.marking).toBe('oilT');
  });

  it('names the fuel and electrical DataRefs (spec §3)', () => {
    expect(Object.values(FUEL)).toEqual([
      'sim/flightmodel/weight/m_fuel',
      'sim/flightmodel/weight/m_fuel_total',
      'sim/aircraft/overflow/acf_tank_rat',
      'sim/aircraft/overflow/acf_num_tanks',
      'sim/aircraft/weight/acf_m_fuel_tot',
      'sim/aircraft/overflow/acf_tank_X',
      'sim/cockpit2/fuel/fuel_totalizer_sum_kg',
    ]);
    expect(Object.values(ELECTRICAL)).toEqual([
      'sim/aircraft/electrical/num_buses',
      'sim/aircraft/electrical/num_batteries',
      'sim/cockpit2/electrical/bus_volts',
      'sim/cockpit2/electrical/bus_load_amps',
      'sim/cockpit2/electrical/battery_voltage_indicated_volts',
      'sim/cockpit2/electrical/battery_amps',
      'sim/cockpit2/electrical/generator_amps',
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/domain/engines-catalogue.test.ts`
Expected: FAIL, "Cannot find module '@/domain/engines/catalogue'".

- [ ] **Step 3: Write the catalogue**

Create `src/domain/engines/catalogue.ts`:

```ts
import { ENGINES } from '@/domain/systems/controls';

/**
 * F-12's catalogue: every name the Engines panel reads (spec §3). Each is Laminar's, verified
 * against `DataRefs.txt`, and the three `_deg_cel` temperatures (12.0.8 and newer) against
 * Laminar's live DataRef database. The profile builds its features from this file and the panel
 * reads from it, so a name lives in one place only. Every name is a DataRef the panel only reads
 * (R9).
 */

export const FEATURE_ENGINE_GAUGES = 'engine-gauges';
export const FEATURE_ENGINE_MARKINGS = 'engine-markings';
export const FEATURE_FUEL_QUANTITY = 'fuel-quantity';
export const FEATURE_ELECTRICAL_MONITOR = 'electrical-monitor';

/** The Engines panel's features, in profile order. */
export const ENGINES_FEATURES: readonly string[] = [
  FEATURE_ENGINE_GAUGES,
  FEATURE_ENGINE_MARKINGS,
  FEATURE_FUEL_QUANTITY,
  FEATURE_ELECTRICAL_MONITOR,
];

export const ENGINE_CONFIG = {
  /** int; F-24 binds it too. */
  count: ENGINES.count,
  /** int[16]; the instruments and F-24 bind it too. */
  type: ENGINES.type,
  /** int: 1 when `EGT_deg_cel` reads in Celsius, 0 when in Fahrenheit. */
  egtIsCelsius: 'sim/aircraft/engine/acf_EGT_is_C',
  ittIsCelsius: 'sim/aircraft/engine/acf_ITT_is_C',
  oilTempIsCelsius: 'sim/aircraft/engine/acf_oilT_is_C',
  /** float, rad/s. */
  engineRedline: 'sim/aircraft/engine/acf_RSC_redline_eng',
  /** float, rad/s. */
  propRedline: 'sim/aircraft/controls/acf_RSC_redline_prp',
} as const;

export const GAUGE_IDS = [
  'rpm',
  'prop',
  'n1',
  'n2',
  'map',
  'trq',
  'epr',
  'egt',
  'cht',
  'itt',
  'ff',
  'oilP',
  'oilT',
] as const;
export type GaugeId = (typeof GAUGE_IDS)[number];

/** The `<x>` of `sim/aircraft/limits/{green,yellow,red}_{lo,hi}_<x>`, in Laminar's spelling. */
export const MARKING_KEYS = [
  'MP',
  'TRQ',
  'N1',
  'N2',
  'EPR',
  'ITT',
  'EGT',
  'CHT',
  'oilT',
  'oilP',
] as const;
export type MarkingKey = (typeof MARKING_KEYS)[number];

export const MARKING_COLOURS = ['green', 'yellow', 'red'] as const;
export type MarkingColour = (typeof MARKING_COLOURS)[number];

export const MARKING_EDGES = ['lo', 'hi'] as const;
export type MarkingEdge = (typeof MARKING_EDGES)[number];

export function markingName(colour: MarkingColour, edge: MarkingEdge, key: MarkingKey): string {
  return `sim/aircraft/limits/${colour}_${edge}_${key}`;
}

/** All 60, by instrument, then colour, then edge. */
export const MARKING_NAMES: readonly string[] = MARKING_KEYS.flatMap((key) =>
  MARKING_COLOURS.flatMap((colour) => MARKING_EDGES.map((edge) => markingName(colour, edge, key))),
);

/** Where a temperature's unit comes from: a flag DataRef (1 = Celsius), or always Celsius. */
export type TemperatureSourceSpec = { kind: 'flag'; name: string } | { kind: 'celsius' };

export interface GaugeSpec {
  id: GaugeId;
  /** float[16]: engine n reads index n − 1. */
  name: string;
  /** Engraved on the row, capitals. */
  legend: string;
  /** For sentences and screen readers. */
  spoken: string;
  marking: MarkingKey | null;
  temperature: TemperatureSourceSpec | null;
}

const indicator = (suffix: string): string => `sim/cockpit2/engine/indicators/${suffix}`;

function gauge(
  id: GaugeId,
  suffix: string,
  legend: string,
  spoken: string,
  marking: MarkingKey | null,
  temperature: TemperatureSourceSpec | null = null,
): GaugeSpec {
  return { id, name: indicator(suffix), legend, spoken, marking, temperature };
}

export const GAUGES: Record<GaugeId, GaugeSpec> = {
  rpm: gauge('rpm', 'engine_speed_rpm', 'RPM', 'RPM', null),
  prop: gauge('prop', 'prop_speed_rpm', 'PROP', 'propeller RPM', null),
  n1: gauge('n1', 'N1_percent', 'N1', 'N1', 'N1'),
  n2: gauge('n2', 'N2_percent', 'N2', 'N2', 'N2'),
  map: gauge('map', 'MPR_in_hg', 'MAP', 'manifold pressure', 'MP'),
  trq: gauge('trq', 'torque_n_mtr', 'TRQ', 'torque', 'TRQ'),
  epr: gauge('epr', 'EPR_ratio', 'EPR', 'EPR', 'EPR'),
  egt: gauge('egt', 'EGT_deg_cel', 'EGT', 'EGT', 'EGT', {
    kind: 'flag',
    name: ENGINE_CONFIG.egtIsCelsius,
  }),
  cht: gauge('cht', 'CHT_deg_cel', 'CHT', 'CHT', 'CHT', { kind: 'celsius' }),
  itt: gauge('itt', 'ITT_deg_cel', 'ITT', 'ITT', 'ITT', {
    kind: 'flag',
    name: ENGINE_CONFIG.ittIsCelsius,
  }),
  ff: gauge('ff', 'fuel_flow_kg_sec', 'FF', 'fuel flow', null),
  oilP: gauge('oilP', 'oil_pressure_psi', 'OIL P', 'oil pressure', 'oilP'),
  oilT: gauge('oilT', 'oil_temperature_deg_C', 'OIL T', 'oil temperature', 'oilT', {
    kind: 'flag',
    name: ENGINE_CONFIG.oilTempIsCelsius,
  }),
};

export const FUEL = {
  /** float[9], kg; sums to `total`. */
  perTank: 'sim/flightmodel/weight/m_fuel',
  /** float, kg: F-11's fuel total (`GENERIC_DATAREFS.fuelTotal`). */
  total: 'sim/flightmodel/weight/m_fuel_total',
  /** float[9]: the share of the capacity in each slot; 0 means the slot is unused. */
  ratio: 'sim/aircraft/overflow/acf_tank_rat',
  /** int. */
  count: 'sim/aircraft/overflow/acf_num_tanks',
  /** float, lb ("appears to be", Laminar): the whole aircraft's capacity. */
  capacity: 'sim/aircraft/weight/acf_m_fuel_tot',
  /** float[9]: lateral position, negative to the left. */
  side: 'sim/aircraft/overflow/acf_tank_X',
  /** float, kg. */
  used: 'sim/cockpit2/fuel/fuel_totalizer_sum_kg',
} as const;

/** Every aircraft has nine tank slots (Laminar). */
export const TANK_SLOTS = 9;

export const ELECTRICAL = {
  /** int. */
  busCount: 'sim/aircraft/electrical/num_buses',
  /** int. */
  batteryCount: 'sim/aircraft/electrical/num_batteries',
  /** float[6], volts. */
  busVolts: 'sim/cockpit2/electrical/bus_volts',
  /** float[6], amps. */
  busAmps: 'sim/cockpit2/electrical/bus_load_amps',
  /** float[8], volts. */
  batteryVolts: 'sim/cockpit2/electrical/battery_voltage_indicated_volts',
  /** float[8], amps; negative while discharging. */
  batteryAmps: 'sim/cockpit2/electrical/battery_amps',
  /** float[8], amps; one per engine. */
  generatorAmps: 'sim/cockpit2/electrical/generator_amps',
} as const;

export const MAX_BUSES = 6;
export const MAX_BATTERIES = 8;
```

- [ ] **Step 4: Run the catalogue test to verify it passes**

Run: `npx jest tests/unit/domain/engines-catalogue.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing profile tests**

In `tests/unit/domain/aircraft-profile.test.ts`:

1. Add to the imports:

```ts
import {
  ELECTRICAL,
  ENGINE_CONFIG,
  ENGINES_FEATURES,
  FEATURE_ELECTRICAL_MONITOR,
  FEATURE_ENGINE_GAUGES,
  FEATURE_ENGINE_MARKINGS,
  FEATURE_FUEL_QUANTITY,
  FUEL,
  GAUGES,
  GAUGE_IDS,
  MARKING_NAMES,
} from '@/domain/engines/catalogue';
```

2. Next to `systemsNames()`, add:

```ts
/** F-12's names, each once, without the three earlier features already bind. */
function enginesNames(): string[] {
  const reused = new Set<string>([
    GENERIC_DATAREFS.engineType,
    GENERIC_DATAREFS.fuelTotal,
    ENGINE_CONFIG.count,
  ]);
  return [
    ...new Set(
      ENGINES_FEATURES.flatMap(
        (id) => findFeature(GENERIC_PROFILE, id)?.bindings.map((binding) => binding.name) ?? [],
      ),
    ),
  ].filter((name) => !reused.has(name));
}
```

3. In the test that lists every name (it ends `...systemsNames(),`), append `...enginesNames(),` after `...systemsNames(),`.

4. Replace every `expect(GENERIC_PROFILE.version).toBe('1.7.0');` (three places) with `expect(GENERIC_PROFILE.version).toBe('1.8.0');`.

5. Replace the duplicate-names test with:

```ts
  it('names every DataRef once across the whole profile, except the ones a later feature deliberately reuses', () => {
    const names = GENERIC_PROFILE.features.flatMap((feature) =>
      feature.bindings.map((binding) => binding.name),
    );
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([
      GENERIC_DATAREFS.airspeed,
      GENERIC_DATAREFS.engineType,
      ENGINE_CONFIG.count,
      GENERIC_DATAREFS.engineType,
      GENERIC_DATAREFS.fuelTotal,
    ]);
  });
```

6. At the end of the file add:

```ts
describe('the F-12 engine features (profile 1.8.0)', () => {
  function bindings(id: string) {
    return findFeature(GENERIC_PROFILE, id)?.bindings ?? [];
  }

  it('declares 94 bindings over the four features, 91 of them new names', () => {
    expect(ENGINES_FEATURES.map((id) => bindings(id).length)).toEqual([20, 60, 7, 7]);
    expect(enginesNames()).toHaveLength(91);
  });

  it('makes every binding an optional, read-only DataRef (R9)', () => {
    for (const id of ENGINES_FEATURES) {
      for (const binding of bindings(id)) {
        expect({ id, name: binding.name, kind: binding.kind, required: binding.required }).toEqual(
          { id, name: binding.name, kind: 'dataref', required: false },
        );
        expect(binding.write).toBeUndefined();
      }
    }
  });

  it('labels the four features', () => {
    expect(ENGINES_FEATURES.map((id) => findFeature(GENERIC_PROFILE, id)?.label)).toEqual([
      'Engine gauges',
      'Gauge markings',
      'Fuel quantity',
      'Electrical readings',
    ]);
  });

  it('gives the engine gauges the count, type, thirteen indicators, three unit flags and two redlines', () => {
    expect(bindings(FEATURE_ENGINE_GAUGES).map((binding) => binding.name)).toEqual([
      ENGINE_CONFIG.count,
      ENGINE_CONFIG.type,
      ...GAUGE_IDS.map((id) => GAUGES[id].name),
      ENGINE_CONFIG.egtIsCelsius,
      ENGINE_CONFIG.ittIsCelsius,
      ENGINE_CONFIG.oilTempIsCelsius,
      ENGINE_CONFIG.engineRedline,
      ENGINE_CONFIG.propRedline,
    ]);
    expect(bindings(FEATURE_ENGINE_GAUGES)[2]?.purpose).toBe('RPM gauge');
    expect(bindings(FEATURE_ENGINE_GAUGES)[3]?.purpose).toBe('Propeller RPM gauge');
  });

  it('gives the markings feature the 60 marking names, and fuel and electrical their seven each', () => {
    expect(bindings(FEATURE_ENGINE_MARKINGS).map((binding) => binding.name)).toEqual(MARKING_NAMES);
    expect(bindings(FEATURE_ENGINE_MARKINGS)[0]?.purpose).toBe('MP green band, low edge');
    expect(bindings(FEATURE_FUEL_QUANTITY).map((binding) => binding.name)).toEqual(
      Object.values(FUEL),
    );
    expect(bindings(FEATURE_ELECTRICAL_MONITOR).map((binding) => binding.name)).toEqual(
      Object.values(ELECTRICAL),
    );
  });
});
```

In `tests/ui/compatibility-screen.test.tsx:66`, `tests/ui/aircraft-summary.test.tsx:43` and `tests/unit/application/diagnostics-summary.test.ts:134`, change the expected `1.7.0` to `1.8.0`.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts tests/ui/compatibility-screen.test.tsx tests/ui/aircraft-summary.test.tsx tests/unit/application/diagnostics-summary.test.ts`
Expected: FAIL (version `1.7.0`, no `engine-gauges` feature).

- [ ] **Step 7: Add the four features to the profile**

In `src/domain/aircraft/profiles/generic.ts`:

1. Add the import:

```ts
import {
  ELECTRICAL,
  ENGINE_CONFIG,
  FEATURE_ELECTRICAL_MONITOR,
  FEATURE_ENGINE_GAUGES,
  FEATURE_ENGINE_MARKINGS,
  FEATURE_FUEL_QUANTITY,
  FUEL,
  GAUGES,
  GAUGE_IDS,
  MARKING_COLOURS,
  MARKING_EDGES,
  MARKING_KEYS,
  markingName,
} from '@/domain/engines/catalogue';
```

2. After `SYSTEMS_FEATURE_SPECS`, add:

```ts
/** F-12's four read-only features (spec §4.1): every binding an optional DataRef, none written. */
const ENGINES_FEATURE_SPECS: readonly FeatureSpec[] = [
  {
    id: FEATURE_ENGINE_GAUGES,
    label: 'Engine gauges',
    bindings: [
      dataRef(ENGINE_CONFIG.count, 'Engine count'),
      dataRef(ENGINE_CONFIG.type, 'Engine type'),
      ...GAUGE_IDS.map((id) => dataRef(GAUGES[id].name, `${capitalise(GAUGES[id].spoken)} gauge`)),
      dataRef(ENGINE_CONFIG.egtIsCelsius, 'EGT unit'),
      dataRef(ENGINE_CONFIG.ittIsCelsius, 'ITT unit'),
      dataRef(ENGINE_CONFIG.oilTempIsCelsius, 'Oil temperature unit'),
      dataRef(ENGINE_CONFIG.engineRedline, 'Engine redline'),
      dataRef(ENGINE_CONFIG.propRedline, 'Propeller redline'),
    ],
  },
  {
    id: FEATURE_ENGINE_MARKINGS,
    label: 'Gauge markings',
    bindings: MARKING_KEYS.flatMap((key) =>
      MARKING_COLOURS.flatMap((colour) =>
        MARKING_EDGES.map((edge) =>
          dataRef(
            markingName(colour, edge, key),
            `${key} ${colour} band, ${edge === 'lo' ? 'low' : 'high'} edge`,
          ),
        ),
      ),
    ),
  },
  {
    id: FEATURE_FUEL_QUANTITY,
    label: 'Fuel quantity',
    bindings: [
      dataRef(FUEL.perTank, 'Fuel in each tank'),
      dataRef(FUEL.total, 'Total fuel'),
      dataRef(FUEL.ratio, 'Which fuel tanks are used'),
      dataRef(FUEL.count, 'Fuel tank count'),
      dataRef(FUEL.capacity, 'Fuel capacity'),
      dataRef(FUEL.side, 'Fuel tank positions'),
      dataRef(FUEL.used, 'Fuel used'),
    ],
  },
  {
    id: FEATURE_ELECTRICAL_MONITOR,
    label: 'Electrical readings',
    bindings: [
      dataRef(ELECTRICAL.busCount, 'Bus count'),
      dataRef(ELECTRICAL.batteryCount, 'Battery count'),
      dataRef(ELECTRICAL.busVolts, 'Bus voltage'),
      dataRef(ELECTRICAL.busAmps, 'Bus load'),
      dataRef(ELECTRICAL.batteryVolts, 'Battery voltage'),
      dataRef(ELECTRICAL.batteryAmps, 'Battery current'),
      dataRef(ELECTRICAL.generatorAmps, 'Generator current'),
    ],
  },
];
```

3. In the header comment above `GENERIC_PROFILE`, after the sentence about the systems features, add: "The four engine features (F-12) are read-only and bind every name optionally, so a missing name costs only the gauges it feeds."

4. Change `version: '1.7.0'` to `version: '1.8.0'`, and after `...SYSTEMS_FEATURE_SPECS,` add `...ENGINES_FEATURE_SPECS,`.

- [ ] **Step 8: Run the tests to verify they pass, then the gate**

Run: `npx jest tests/unit/domain tests/ui/compatibility-screen.test.tsx tests/ui/aircraft-summary.test.tsx tests/unit/application/diagnostics-summary.test.ts`
Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: all green. If a test elsewhere pins `1.7.0` or a total binding or probe count, update its expectation by the new 91 DataRefs and say so in the report.

- [ ] **Step 9: Commit**

```bash
git add src/domain/engines/catalogue.ts src/domain/aircraft/profiles/generic.ts tests/unit/domain/engines-catalogue.test.ts tests/unit/domain/aircraft-profile.test.ts tests/ui/compatibility-screen.test.tsx tests/ui/aircraft-summary.test.tsx tests/unit/application/diagnostics-summary.test.ts
git commit -m "feat(engines): catalogue and four read-only profile features (1.8.0)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Engine gauges domain — gauge sets, markings, units, the ENGINES page model, sentences

**Files:**
- Create: `src/domain/engines/gauge-sets.ts`, `src/domain/engines/markings.ts`, `src/domain/engines/units.ts`, `src/domain/engines/engine-page.ts`, `src/domain/engines/messages.ts`
- Test: `tests/unit/domain/engines-gauges.test.ts`, `tests/unit/domain/engines-page.test.ts`, `tests/unit/domain/engines-messages.test.ts`

**Interfaces:**
- Consumes (Task 1): `GAUGES`, `GaugeId`, `MarkingKey`, `MARKING_COLOURS`, `MarkingColour`, `markingName`, `ENGINE_CONFIG`. Also `MAX_ENGINES` (4) from `@/domain/systems/controls`; `UnitPreferences`, `convertFuel`, `TemperatureUnit` from `@/domain/units/units`; `missingControls`, `ENGINES_NOT_SHOWN` from `@/domain/systems/messages`.
- Produces:
  - `gauge-sets.ts`: `type EngineKind = 'piston'|'turboprop'|'jet'|'singleSpoolJet'|'electric'|'unsupported'`; `engineKind(type: number | null): EngineKind`; `interface GaugeSet { dial: GaugeId | null; rows: readonly GaugeId[] }`; `GAUGE_SETS: Record<EngineKind, GaugeSet>`; `gaugeLegend(id, kind): string`; `gaugeSpoken(id, kind): string`.
  - `markings.ts`: `interface Band { colour: MarkingColour; from: number; to: number }`; `interface Scale { min: number; max: number; redline: number | null }`; `type Tone = 'normal'|'yellow'|'red'|'redline'`; `bandsFor(key: MarkingKey | null, read: (name: string) => number | null): Band[]`; `scaleFor(id: GaugeId, bands: readonly Band[], redline: number | null): Scale | null`; `toneOf(value: number, bands: readonly Band[], redline: number | null): Tone`; `scaleFraction(value: number, scale: Scale): number`.
  - `units.ts`: `NM_TO_FT_LB`, `RAD_S_TO_RPM`; `instrumentValue(id, raw): number`; `redlineRpm(radPerSecond: number | null): number | null`; `type TemperatureSource = 'C'|'F'|'unknown'|'pending'`; `temperatureSource(spec, has, read): TemperatureSource | null`; `convertTemperatureFrom(value, from: 'C'|'F', to: TemperatureUnit): number`; `convertTemperatureDelta(delta, from: 'C'|'F', to: TemperatureUnit): number`; `interface UnitLabel { label: string; spoken: string }`; `gaugeUnit(id, units, source): UnitLabel`; `formatGauge(id, value, units, source): string`; `groupedWhole(value): string`; `signedWhole(value): string`; `fixed(value, digits): string`; `MINUS`.
  - `engine-page.ts`: `interface EngineReader { has(name: string): boolean; number(name: string, index?: number): number | null }`; `interface GaugeReading { engine; id; legend; value: number | null; source: TemperatureSource | null; text; scale: Scale | null; bands: readonly Band[]; tone: Tone; spoken }`; `interface EngineColumn { engine: number; kind: EngineKind; dial: GaugeReading | null; cells: Partial<Record<GaugeId, GaugeReading>> }`; `interface GaugeRow { id: GaugeId; label: string }`; `type EnginesStatus = 'unidentified'|'waiting'|'none'|'ready'`; `interface EnginesModel { status; columns; rows; hidden; missing: readonly string[]; unknownUnits: readonly GaugeId[]; unsupported: readonly number[] }`; `enginesPage(reader: EngineReader, units: UnitPreferences): EnginesModel`.
  - `messages.ts`: `gaugesMissing(aircraft, legends)`, `ENGINES_NOT_SHOWN`, `enginesUnidentified(aircraft)`, `noEngines(aircraft)`, `engineUnsupported(engine)`, `unitsUnknown(aircraft, names)`, `tanksUnavailable(aircraft)`.

Rules from the spec this task implements: §4.2 gauge sets (dial + rows per kind, NG on turboprops, engine 1's row order then others'), §4.3 formats, §4.4 temperature units, §4.5 markings, scale and tone, R6 missing names.

- [ ] **Step 1: Write the failing gauge-set, markings and units tests**

Create `tests/unit/domain/engines-gauges.test.ts`:

```ts
import { GAUGES } from '@/domain/engines/catalogue';
import { GAUGE_SETS, engineKind, gaugeLegend, gaugeSpoken } from '@/domain/engines/gauge-sets';
import { bandsFor, scaleFor, scaleFraction, toneOf } from '@/domain/engines/markings';
import {
  convertTemperatureDelta,
  convertTemperatureFrom,
  formatGauge,
  gaugeUnit,
  instrumentValue,
  redlineRpm,
  temperatureSource,
} from '@/domain/engines/units';
import { DEFAULT_UNITS } from '@/domain/units/units';

const LB = { ...DEFAULT_UNITS, fuel: 'lb' as const, temperature: 'F' as const };

describe('engine kinds and gauge sets (spec §4.2)', () => {
  it.each([
    [0, 'piston'],
    [1, 'piston'],
    [3, 'electric'],
    [5, 'singleSpoolJet'],
    [6, 'unsupported'],
    [7, 'jet'],
    [9, 'turboprop'],
    [10, 'turboprop'],
    [2, 'unsupported'],
    [null, 'unsupported'],
  ])('acf_en_type %p is %s', (type, kind) => {
    expect(engineKind(type)).toBe(kind);
  });

  it('gives each kind its dial and rows', () => {
    expect(GAUGE_SETS.piston).toEqual({
      dial: 'rpm',
      rows: ['map', 'ff', 'egt', 'cht', 'oilP', 'oilT'],
    });
    expect(GAUGE_SETS.turboprop).toEqual({
      dial: 'trq',
      rows: ['itt', 'prop', 'n1', 'ff', 'oilP', 'oilT'],
    });
    expect(GAUGE_SETS.jet).toEqual({ dial: 'n1', rows: ['egt', 'n2', 'ff', 'oilP', 'oilT', 'epr'] });
    expect(GAUGE_SETS.singleSpoolJet).toEqual({
      dial: 'n1',
      rows: ['egt', 'ff', 'oilP', 'oilT', 'epr'],
    });
    expect(GAUGE_SETS.electric).toEqual({ dial: 'rpm', rows: ['trq'] });
    expect(GAUGE_SETS.unsupported).toEqual({ dial: null, rows: [] });
  });

  it('calls N1 NG on a turboprop only', () => {
    expect(gaugeLegend('n1', 'turboprop')).toBe('NG');
    expect(gaugeLegend('n1', 'jet')).toBe('N1');
    expect(gaugeSpoken('n1', 'turboprop')).toBe('NG');
    expect(gaugeSpoken('oilP', 'piston')).toBe('oil pressure');
  });
});

describe('markings (spec §4.5)', () => {
  const values: Record<string, number> = {
    'sim/aircraft/limits/green_lo_EGT': 1200,
    'sim/aircraft/limits/green_hi_EGT': 1500,
    'sim/aircraft/limits/yellow_lo_EGT': 1500,
    'sim/aircraft/limits/yellow_hi_EGT': 1600,
    'sim/aircraft/limits/red_lo_EGT': 0,
    'sim/aircraft/limits/red_hi_EGT': 0,
  };
  const read = (name: string): number | null => values[name] ?? null;

  it('uses a band only when its high edge is above its low edge', () => {
    expect(bandsFor('EGT', read)).toEqual([
      { colour: 'green', from: 1200, to: 1500 },
      { colour: 'yellow', from: 1500, to: 1600 },
    ]);
    expect(bandsFor(null, read)).toEqual([]);
    expect(bandsFor('CHT', read)).toEqual([]);
  });

  it('scales from the lowest to the highest edge, widened 10 % at the top', () => {
    const bands = bandsFor('EGT', read);
    expect(scaleFor('egt', bands, null)).toEqual({ min: 1200, max: 1640, redline: null });
  });

  it('scales RPM and PROP without markings to 110 % of the redline, N1 and N2 to 110 %', () => {
    expect(scaleFor('rpm', [], 2700)).toEqual({ min: 0, max: 2970, redline: 2700 });
    expect(scaleFor('prop', [], null)).toBeNull();
    expect(scaleFor('n2', [], null)).toEqual({ min: 0, max: 110, redline: null });
    expect(scaleFor('oilT', [], null)).toBeNull();
  });

  it('takes the colour of the band the value is in: red over yellow, redline over normal', () => {
    const bands = [
      { colour: 'green' as const, from: 0, to: 100 },
      { colour: 'yellow' as const, from: 100, to: 120 },
      { colour: 'red' as const, from: 120, to: 140 },
    ];
    expect(toneOf(50, bands, null)).toBe('normal');
    expect(toneOf(110, bands, null)).toBe('yellow');
    expect(toneOf(120, bands, null)).toBe('red');
    expect(toneOf(2750, [], 2700)).toBe('redline');
    expect(toneOf(2700, [], 2700)).toBe('normal');
  });

  it('places a value on the scale, clamped to 0..1', () => {
    const scale = { min: 0, max: 200, redline: null };
    expect(scaleFraction(50, scale)).toBe(0.25);
    expect(scaleFraction(-10, scale)).toBe(0);
    expect(scaleFraction(500, scale)).toBe(1);
  });
});

describe('units and formats (spec §4.3, §4.4)', () => {
  it('turns torque into ft-lb and fuel flow into kg per hour; the rest as reported', () => {
    expect(instrumentValue('trq', 1000)).toBeCloseTo(737.562, 3);
    expect(instrumentValue('ff', 0.01)).toBeCloseTo(36, 6);
    expect(instrumentValue('egt', 1320)).toBe(1320);
  });

  it('turns a redline in rad/s into rev/min; nothing for a missing or zero redline', () => {
    expect(redlineRpm(282.743)).toBeCloseTo(2700, 0);
    expect(redlineRpm(0)).toBeNull();
    expect(redlineRpm(null)).toBeNull();
  });

  it('reads the temperature source from the flag, CHT as Celsius, unknown without the flag', () => {
    const has = (name: string) => name !== 'sim/aircraft/engine/acf_ITT_is_C';
    const flags: Record<string, number> = {
      'sim/aircraft/engine/acf_EGT_is_C': 0,
      'sim/aircraft/engine/acf_oilT_is_C': 1,
    };
    const read = (name: string) => flags[name] ?? null;
    expect(temperatureSource(GAUGES.egt, has, read)).toBe('F');
    expect(temperatureSource(GAUGES.oilT, has, read)).toBe('C');
    expect(temperatureSource(GAUGES.cht, has, read)).toBe('C');
    expect(temperatureSource(GAUGES.itt, has, read)).toBe('unknown');
    expect(temperatureSource(GAUGES.rpm, has, read)).toBeNull();
    // Resolved but no value yet: pending, not unknown, so no sentence flashes at connect.
    expect(temperatureSource(GAUGES.egt, () => true, () => null)).toBe('pending');
  });

  it('converts temperatures and temperature differences', () => {
    expect(convertTemperatureFrom(100, 'C', 'F')).toBe(212);
    expect(convertTemperatureFrom(212, 'F', 'C')).toBe(100);
    expect(convertTemperatureFrom(70, 'F', 'F')).toBe(70);
    expect(convertTemperatureDelta(-10, 'C', 'F')).toBe(-18);
    expect(convertTemperatureDelta(-18, 'F', 'C')).toBe(-10);
  });

  it('formats each gauge (spec §4.3)', () => {
    expect(formatGauge('rpm', 2347, DEFAULT_UNITS, null)).toBe('2,350');
    expect(formatGauge('map', 24.63, DEFAULT_UNITS, null)).toBe('24.6');
    expect(formatGauge('trq', 1236, DEFAULT_UNITS, null)).toBe('1,240');
    expect(formatGauge('n1', 87.44, DEFAULT_UNITS, null)).toBe('87.4');
    expect(formatGauge('epr', 1.417, DEFAULT_UNITS, null)).toBe('1.42');
    expect(formatGauge('egt', 1320.4, LB, 'F')).toBe('1,320');
    expect(formatGauge('egt', 100, LB, 'C')).toBe('212');
    expect(formatGauge('oilT', -5, DEFAULT_UNITS, 'C')).toBe('−5');
    expect(formatGauge('egt', 700, LB, 'unknown')).toBe('700');
    expect(formatGauge('egt', 700, LB, 'pending')).toBe('—');
    expect(formatGauge('ff', 36, DEFAULT_UNITS, null)).toBe('36.0');
    expect(formatGauge('ff', 36, LB, null)).toBe('79.4');
    expect(formatGauge('ff', 1200, DEFAULT_UNITS, null)).toBe('1,200');
    expect(formatGauge('oilP', 61.6, DEFAULT_UNITS, null)).toBe('62');
  });

  it('labels each gauge unit once per row, and speaks it', () => {
    expect(gaugeUnit('rpm', DEFAULT_UNITS, null)).toEqual({ label: '', spoken: '' });
    expect(gaugeUnit('map', DEFAULT_UNITS, null)).toEqual({ label: 'IN', spoken: 'inches' });
    expect(gaugeUnit('trq', DEFAULT_UNITS, null)).toEqual({
      label: 'FT-LB',
      spoken: 'foot-pounds',
    });
    expect(gaugeUnit('n1', DEFAULT_UNITS, null)).toEqual({ label: '%', spoken: 'percent' });
    expect(gaugeUnit('ff', LB, null)).toEqual({ label: 'LB/H', spoken: 'pounds per hour' });
    expect(gaugeUnit('ff', DEFAULT_UNITS, null)).toEqual({
      label: 'KG/H',
      spoken: 'kilograms per hour',
    });
    expect(gaugeUnit('oilP', DEFAULT_UNITS, null)).toEqual({ label: 'PSI', spoken: 'psi' });
    expect(gaugeUnit('egt', LB, 'C')).toEqual({ label: '°F', spoken: 'degrees Fahrenheit' });
    expect(gaugeUnit('cht', DEFAULT_UNITS, 'C')).toEqual({
      label: '°C',
      spoken: 'degrees Celsius',
    });
    expect(gaugeUnit('egt', LB, 'unknown')).toEqual({
      label: '°',
      spoken: 'degrees, unit unknown',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/domain/engines-gauges.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `gauge-sets.ts`, `markings.ts` and `units.ts`**

Create `src/domain/engines/gauge-sets.ts`:

```ts
import { GAUGES, type GaugeId } from '@/domain/engines/catalogue';

/**
 * Laminar's `acf_en_type`: 0 carburetted and 1 injected piston, 3 electric, 5 single-spool jet,
 * 6 rocket, 7 multi-spool jet, 9 free and 10 fixed turboprop. Anything else (rocket included, and
 * a missing entry) has no gauge set (spec §4.2).
 */
export type EngineKind =
  | 'piston'
  | 'turboprop'
  | 'jet'
  | 'singleSpoolJet'
  | 'electric'
  | 'unsupported';

export function engineKind(type: number | null): EngineKind {
  switch (type) {
    case 0:
    case 1:
      return 'piston';
    case 3:
      return 'electric';
    case 5:
      return 'singleSpoolJet';
    case 7:
      return 'jet';
    case 9:
    case 10:
      return 'turboprop';
    default:
      return 'unsupported';
  }
}

export interface GaugeSet {
  /** The primary gauge, drawn as a dial. */
  dial: GaugeId | null;
  /** The table rows, in order. */
  rows: readonly GaugeId[];
}

/** Spec §4.2. Electric engines have no fuel flow or oil: those rows would only ever read zero. */
export const GAUGE_SETS: Record<EngineKind, GaugeSet> = {
  piston: { dial: 'rpm', rows: ['map', 'ff', 'egt', 'cht', 'oilP', 'oilT'] },
  turboprop: { dial: 'trq', rows: ['itt', 'prop', 'n1', 'ff', 'oilP', 'oilT'] },
  jet: { dial: 'n1', rows: ['egt', 'n2', 'ff', 'oilP', 'oilT', 'epr'] },
  singleSpoolJet: { dial: 'n1', rows: ['egt', 'ff', 'oilP', 'oilT', 'epr'] },
  electric: { dial: 'rpm', rows: ['trq'] },
  unsupported: { dial: null, rows: [] },
};

/** A turboprop's N1 is its gas generator speed, NG on the PT6 gauges this mirrors. */
export function gaugeLegend(id: GaugeId, kind: EngineKind): string {
  return id === 'n1' && kind === 'turboprop' ? 'NG' : GAUGES[id].legend;
}

export function gaugeSpoken(id: GaugeId, kind: EngineKind): string {
  return id === 'n1' && kind === 'turboprop' ? 'NG' : GAUGES[id].spoken;
}
```

Create `src/domain/engines/markings.ts`:

```ts
import {
  MARKING_COLOURS,
  type GaugeId,
  type MarkingColour,
  type MarkingKey,
  markingName,
} from '@/domain/engines/catalogue';

/** One of the aircraft's own coloured arcs, in the gauge's instrument unit. */
export interface Band {
  colour: MarkingColour;
  from: number;
  to: number;
}

export interface Scale {
  min: number;
  max: number;
  /** RPM and PROP without markings: the redline, drawn as a red tick. */
  redline: number | null;
}

/** The colour a value is drawn in (spec §4.5). `redline`: above it, with no red band to say so. */
export type Tone = 'normal' | 'yellow' | 'red' | 'redline';

/** The scale runs a tenth of its span past the highest edge (a division, so 2700 → 2970 exactly). */
const HEADROOM_DIVISOR = 10;
const PERCENT_MAX = 110;

/** The aircraft's used bands for one gauge: Plane Maker leaves unused ones at 0, so a band counts
 * only when its high edge is above its low edge. */
export function bandsFor(
  key: MarkingKey | null,
  read: (name: string) => number | null,
): Band[] {
  if (key === null) {
    return [];
  }
  const bands: Band[] = [];
  for (const colour of MARKING_COLOURS) {
    const from = read(markingName(colour, 'lo', key));
    const to = read(markingName(colour, 'hi', key));
    if (from !== null && to !== null && to > from) {
      bands.push({ colour, from, to });
    }
  }
  return bands;
}

/** Spec §4.5: from the bands when there are any; else RPM/PROP to 110 % of the redline and N1/N2
 * to 110 %; otherwise the gauge is a number with no bar. */
export function scaleFor(id: GaugeId, bands: readonly Band[], redline: number | null): Scale | null {
  if (bands.length > 0) {
    const min = Math.min(...bands.map((band) => band.from));
    const max = Math.max(...bands.map((band) => band.to));
    return { min, max: max + (max - min) / HEADROOM_DIVISOR, redline: null };
  }
  if ((id === 'rpm' || id === 'prop') && redline !== null) {
    return { min: 0, max: redline + redline / HEADROOM_DIVISOR, redline };
  }
  if (id === 'n1' || id === 'n2') {
    return { min: 0, max: PERCENT_MAX, redline: null };
  }
  return null;
}

function inBand(value: number, band: Band): boolean {
  return value >= band.from && value <= band.to;
}

/** Red wins over yellow where bands touch; above a bare redline is red too. */
export function toneOf(value: number, bands: readonly Band[], redline: number | null): Tone {
  if (bands.some((band) => band.colour === 'red' && inBand(value, band))) {
    return 'red';
  }
  if (redline !== null && value > redline) {
    return 'redline';
  }
  if (bands.some((band) => band.colour === 'yellow' && inBand(value, band))) {
    return 'yellow';
  }
  return 'normal';
}

/** Where `value` sits on `scale`, 0 at `min` and 1 at `max`, clamped. */
export function scaleFraction(value: number, scale: Scale): number {
  const span = scale.max - scale.min;
  if (span <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - scale.min) / span));
}
```

Create `src/domain/engines/units.ts`:

```ts
import type { GaugeId, GaugeSpec } from '@/domain/engines/catalogue';
import { type TemperatureUnit, type UnitPreferences, convertFuel } from '@/domain/units/units';

/** Exact: 1 N·m = 0.737562 ft-lb (to six figures). */
export const NM_TO_FT_LB = 0.737562;
export const RAD_S_TO_RPM = 60 / (2 * Math.PI);
const SECONDS_PER_HOUR = 3600;

export const MINUS = '−';

/**
 * A raw value in the unit the aircraft's markings use and the panel computes in: torque in ft-lb
 * (Laminar's TRQ markings are ft-lb), fuel flow in kg per hour; everything else as X-Plane reports
 * it, temperatures still in their source unit.
 */
export function instrumentValue(id: GaugeId, raw: number): number {
  if (id === 'trq') {
    return raw * NM_TO_FT_LB;
  }
  if (id === 'ff') {
    return raw * SECONDS_PER_HOUR;
  }
  return raw;
}

/** A Laminar redline in rad/s as rev/min; null when missing or not positive. */
export function redlineRpm(radPerSecond: number | null): number | null {
  return radPerSecond === null || radPerSecond <= 0 ? null : radPerSecond * RAD_S_TO_RPM;
}

/**
 * The unit a temperature arrives in (spec §4.4). `unknown`: the aircraft does not publish the
 * flag, so the value is shown as reported. `pending`: the flag resolved but its value has not
 * arrived yet. Null for a gauge that is not a temperature.
 */
export type TemperatureSource = 'C' | 'F' | 'unknown' | 'pending';

export function temperatureSource(
  spec: GaugeSpec,
  has: (name: string) => boolean,
  read: (name: string) => number | null,
): TemperatureSource | null {
  if (spec.temperature === null) {
    return null;
  }
  if (spec.temperature.kind === 'celsius') {
    return 'C';
  }
  if (!has(spec.temperature.name)) {
    return 'unknown';
  }
  const flag = read(spec.temperature.name);
  if (flag === null) {
    return 'pending';
  }
  return flag >= 0.5 ? 'C' : 'F';
}

export function convertTemperatureFrom(
  value: number,
  from: 'C' | 'F',
  to: TemperatureUnit,
): number {
  if (from === to) {
    return value;
  }
  return from === 'C' ? (value * 9) / 5 + 32 : ((value - 32) * 5) / 9;
}

/** A difference of temperatures (ΔPEAK): scaled, never offset. */
export function convertTemperatureDelta(
  delta: number,
  from: 'C' | 'F',
  to: TemperatureUnit,
): number {
  if (from === to) {
    return delta;
  }
  return from === 'C' ? (delta * 9) / 5 : (delta * 5) / 9;
}

/** Rounded to whole, thousands grouped without Intl (its availability differs between Hermes builds). */
export function groupedWhole(value: number): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `${MINUS}${digits}` : digits;
}

/** Whole, with U+2212 for negatives and no sign for zero. */
export function signedWhole(value: number): string {
  return groupedWhole(value === 0 ? 0 : value);
}

/** `digits` decimals, U+2212 for negatives (and no sign when it rounds to zero). */
export function fixed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}

function displayTemperature(
  value: number,
  units: UnitPreferences,
  source: TemperatureSource | null,
): number | null {
  if (source === 'pending') {
    return null;
  }
  if (source === 'C' || source === 'F') {
    return convertTemperatureFrom(value, source, units.temperature);
  }
  return value;
}

/** Spec §4.3. `value` is the instrument value (`instrumentValue`). `—` while a unit is pending. */
export function formatGauge(
  id: GaugeId,
  value: number,
  units: UnitPreferences,
  source: TemperatureSource | null,
): string {
  switch (id) {
    case 'rpm':
    case 'prop':
    case 'trq':
      return groupedWhole(Math.round(value / 10) * 10);
    case 'map':
    case 'n1':
    case 'n2':
      return fixed(value, 1);
    case 'epr':
      return fixed(value, 2);
    case 'egt':
    case 'cht':
    case 'itt':
    case 'oilT': {
      const shown = displayTemperature(value, units, source);
      return shown === null ? '—' : signedWhole(shown);
    }
    case 'ff': {
      const perHour = convertFuel(value, units.fuel);
      return perHour < 100 ? fixed(perHour, 1) : groupedWhole(perHour);
    }
    case 'oilP':
      return signedWhole(value);
  }
}

export interface UnitLabel {
  /** Once per row, after the legend: `EGT °F`. Empty when the legend says it all. */
  label: string;
  spoken: string;
}

const NO_UNIT: UnitLabel = { label: '', spoken: '' };

export function gaugeUnit(
  id: GaugeId,
  units: UnitPreferences,
  source: TemperatureSource | null,
): UnitLabel {
  switch (id) {
    case 'rpm':
    case 'prop':
    case 'epr':
      return NO_UNIT;
    case 'map':
      return { label: 'IN', spoken: 'inches' };
    case 'trq':
      return { label: 'FT-LB', spoken: 'foot-pounds' };
    case 'n1':
    case 'n2':
      return { label: '%', spoken: 'percent' };
    case 'ff':
      return units.fuel === 'kg'
        ? { label: 'KG/H', spoken: 'kilograms per hour' }
        : { label: 'LB/H', spoken: 'pounds per hour' };
    case 'oilP':
      return { label: 'PSI', spoken: 'psi' };
    case 'egt':
    case 'cht':
    case 'itt':
    case 'oilT':
      if (source === 'unknown') {
        return { label: '°', spoken: 'degrees, unit unknown' };
      }
      return units.temperature === 'C'
        ? { label: '°C', spoken: 'degrees Celsius' }
        : { label: '°F', spoken: 'degrees Fahrenheit' };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest tests/unit/domain/engines-gauges.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page-model and message tests**

Create `tests/unit/domain/engines-page.test.ts`:

```ts
import { ENGINE_CONFIG, GAUGES, markingName } from '@/domain/engines/catalogue';
import { type EngineReader, enginesPage } from '@/domain/engines/engine-page';
import { DEFAULT_UNITS } from '@/domain/units/units';

type Values = Record<string, number | number[]>;

/** A reader over plain values: a name resolves when it has a value, unless listed as missing. */
function reader(values: Values, missing: readonly string[] = []): EngineReader {
  return {
    has: (name) => !missing.includes(name) && name in values,
    number: (name, index = 0) => {
      const value = values[name];
      const candidate = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;
      return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
    },
  };
}

const sixteen = (...first: number[]): number[] => [
  ...first,
  ...new Array<number>(16 - first.length).fill(0),
];

/** A C172-like piston single: EGT in °F, oil temperature in °C, an EGT green band. */
const PISTON: Values = {
  [ENGINE_CONFIG.count]: 1,
  [ENGINE_CONFIG.type]: sixteen(1),
  [ENGINE_CONFIG.egtIsCelsius]: 0,
  [ENGINE_CONFIG.ittIsCelsius]: 1,
  [ENGINE_CONFIG.oilTempIsCelsius]: 1,
  [ENGINE_CONFIG.engineRedline]: 282.743,
  [ENGINE_CONFIG.propRedline]: 282.743,
  [GAUGES.rpm.name]: sixteen(2347),
  [GAUGES.map.name]: sixteen(24.6),
  [GAUGES.ff.name]: sixteen(0.0105),
  [GAUGES.egt.name]: sixteen(1320),
  [GAUGES.cht.name]: sixteen(180),
  [GAUGES.oilP.name]: sixteen(62),
  [GAUGES.oilT.name]: sixteen(82),
  [GAUGES.n1.name]: sixteen(0),
  [GAUGES.n2.name]: sixteen(0),
  [GAUGES.prop.name]: sixteen(2347),
  [GAUGES.trq.name]: sixteen(0),
  [GAUGES.epr.name]: sixteen(0),
  [GAUGES.itt.name]: sixteen(0),
  [markingName('green', 'lo', 'EGT')]: 1200,
  [markingName('green', 'hi', 'EGT')]: 1500,
};

describe('enginesPage (spec §4.2–§4.5)', () => {
  it('draws a piston single: an RPM dial and the six piston rows with units', () => {
    const model = enginesPage(reader(PISTON), DEFAULT_UNITS);
    expect(model.status).toBe('ready');
    expect(model.columns).toHaveLength(1);
    expect(model.columns[0]?.kind).toBe('piston');
    expect(model.columns[0]?.dial?.id).toBe('rpm');
    expect(model.columns[0]?.dial?.text).toBe('2,350');
    expect(model.columns[0]?.dial?.scale?.redline).toBeCloseTo(2700, 0);
    expect(model.rows).toEqual([
      { id: 'map', label: 'MAP IN' },
      { id: 'ff', label: 'FF KG/H' },
      { id: 'egt', label: 'EGT °C' },
      { id: 'cht', label: 'CHT °C' },
      { id: 'oilP', label: 'OIL P PSI' },
      { id: 'oilT', label: 'OIL T °C' },
    ]);
    expect(model.hidden).toBe(0);
    expect(model.missing).toEqual([]);
  });

  it('converts EGT from the aircraft unit (°F) to the pilot unit and keeps bands in the source unit', () => {
    const model = enginesPage(reader(PISTON), DEFAULT_UNITS);
    const egt = model.columns[0]?.cells.egt;
    expect(egt?.source).toBe('F');
    expect(egt?.value).toBe(1320);
    expect(egt?.text).toBe('716');
    expect(egt?.bands).toEqual([{ colour: 'green', from: 1200, to: 1500 }]);
    expect(egt?.tone).toBe('normal');
    expect(egt?.spoken).toBe('Engine 1 EGT 716 degrees Celsius');
  });

  it('speaks a value in a band by its colour, and a missing value as no value', () => {
    const hot = enginesPage(
      reader({
        ...PISTON,
        [markingName('red', 'lo', 'EGT')]: 1300,
        [markingName('red', 'hi', 'EGT')]: 1700,
      }),
      { ...DEFAULT_UNITS, temperature: 'F' },
    );
    expect(hot.columns[0]?.cells.egt?.tone).toBe('red');
    expect(hot.columns[0]?.cells.egt?.spoken).toBe(
      'Engine 1 EGT 1,320 degrees Fahrenheit, in the red band',
    );
    const empty = enginesPage(reader({ ...PISTON, [GAUGES.cht.name]: [] }), DEFAULT_UNITS);
    expect(empty.columns[0]?.cells.cht?.text).toBe('—');
    expect(empty.columns[0]?.cells.cht?.spoken).toBe('Engine 1 CHT, no value');
  });

  it('says above the redline for an RPM past it', () => {
    const model = enginesPage(reader({ ...PISTON, [GAUGES.rpm.name]: sixteen(2800) }), DEFAULT_UNITS);
    expect(model.columns[0]?.dial?.tone).toBe('redline');
    expect(model.columns[0]?.dial?.spoken).toBe('Engine 1 RPM 2,800, above the redline');
  });

  it('draws a turboprop twin with a TRQ dial and NG', () => {
    const model = enginesPage(
      reader({ ...PISTON, [ENGINE_CONFIG.count]: 2, [ENGINE_CONFIG.type]: sixteen(9, 9) }),
      DEFAULT_UNITS,
    );
    expect(model.columns.map((column) => column.dial?.id)).toEqual(['trq', 'trq']);
    expect(model.rows.map((row) => row.label)).toEqual([
      'ITT °C',
      'PROP',
      'NG %',
      'FF KG/H',
      'OIL P PSI',
      'OIL T °C',
    ]);
  });

  it('draws four jets, and says engines 5 and up are not shown', () => {
    const model = enginesPage(
      reader({ ...PISTON, [ENGINE_CONFIG.count]: 6, [ENGINE_CONFIG.type]: sixteen(7, 7, 7, 7, 7, 7) }),
      DEFAULT_UNITS,
    );
    expect(model.columns).toHaveLength(4);
    expect(model.hidden).toBe(2);
    expect(model.rows.map((row) => row.id)).toEqual(['egt', 'n2', 'ff', 'oilP', 'oilT', 'epr']);
  });

  it('lists mixed engines with engine 1 rows first, then the others, empty where unused', () => {
    const model = enginesPage(
      reader({ ...PISTON, [ENGINE_CONFIG.count]: 2, [ENGINE_CONFIG.type]: sixteen(1, 5) }),
      DEFAULT_UNITS,
    );
    expect(model.rows.map((row) => row.id)).toEqual([
      'map',
      'ff',
      'egt',
      'cht',
      'oilP',
      'oilT',
      'epr',
    ]);
    expect(model.columns[1]?.cells.map).toBeUndefined();
    expect(model.columns[1]?.cells.epr?.legend).toBe('EPR');
  });

  it('marks a missing gauge DataRef unavailable and draws the rest (R6)', () => {
    const model = enginesPage(reader(PISTON, [GAUGES.cht.name, GAUGES.rpm.name]), DEFAULT_UNITS);
    expect(model.missing).toEqual(['RPM', 'CHT']);
    expect(model.columns[0]?.dial).toBeNull();
    expect(model.rows.map((row) => row.id)).not.toContain('cht');
    expect(model.rows).toHaveLength(5);
  });

  it('is unidentified without the count or the type, waiting before the count arrives', () => {
    expect(enginesPage(reader(PISTON, [ENGINE_CONFIG.count]), DEFAULT_UNITS).status).toBe(
      'unidentified',
    );
    expect(enginesPage(reader(PISTON, [ENGINE_CONFIG.type]), DEFAULT_UNITS).status).toBe(
      'unidentified',
    );
    expect(
      enginesPage(reader({ ...PISTON, [ENGINE_CONFIG.count]: Number.NaN }), DEFAULT_UNITS).status,
    ).toBe('waiting');
    expect(
      enginesPage(reader({ ...PISTON, [ENGINE_CONFIG.count]: 1.5 }), DEFAULT_UNITS).status,
    ).toBe('unidentified');
  });

  it('says a glider has no engines (Review Focus 1)', () => {
    const model = enginesPage(reader({ ...PISTON, [ENGINE_CONFIG.count]: 0 }), DEFAULT_UNITS);
    expect(model.status).toBe('none');
    expect(model.columns).toEqual([]);
  });

  it('marks an engine whose type is short or garbage unsupported, and draws the others (Review Focus 2)', () => {
    const model = enginesPage(
      reader({ ...PISTON, [ENGINE_CONFIG.count]: 3, [ENGINE_CONFIG.type]: [1, 6] }),
      DEFAULT_UNITS,
    );
    expect(model.unsupported).toEqual([2, 3]);
    expect(model.columns[0]?.dial?.id).toBe('rpm');
    expect(model.columns[1]?.dial).toBeNull();
    expect(model.columns[1]?.cells).toEqual({});
  });

  it('shows a non-finite value as a dash with no pointer (Review Focus 3)', () => {
    const model = enginesPage(
      reader({ ...PISTON, [GAUGES.oilP.name]: sixteen(Number.POSITIVE_INFINITY) }),
      DEFAULT_UNITS,
    );
    expect(model.columns[0]?.cells.oilP?.text).toBe('—');
    expect(model.columns[0]?.cells.oilP?.value).toBeNull();
  });

  it('lists temperatures whose unit the aircraft does not publish, labelled with a bare degree', () => {
    const model = enginesPage(reader(PISTON, [ENGINE_CONFIG.egtIsCelsius]), DEFAULT_UNITS);
    expect(model.unknownUnits).toEqual(['egt']);
    expect(model.rows.find((row) => row.id === 'egt')?.label).toBe('EGT °');
    expect(model.columns[0]?.cells.egt?.text).toBe('1,320');
  });
});
```

Create `tests/unit/domain/engines-messages.test.ts`:

```ts
import {
  ENGINES_NOT_SHOWN,
  engineUnsupported,
  enginesUnidentified,
  gaugesMissing,
  noEngines,
  tanksUnavailable,
  unitsUnknown,
} from '@/domain/engines/messages';

describe('engine sentences', () => {
  it('name the aircraft when known', () => {
    expect(enginesUnidentified('Cessna 172')).toBe(
      "The engines on the Cessna 172 couldn't be identified.",
    );
    expect(enginesUnidentified(null)).toBe("The engines on this aircraft couldn't be identified.");
    expect(noEngines('ASK 21')).toBe('The ASK 21 has no engines.');
    expect(noEngines(null)).toBe('This aircraft has no engines.');
    expect(gaugesMissing('Cessna 172', ['EPR', 'N2'])).toBe('Not available on the Cessna 172: EPR, N2.');
    expect(tanksUnavailable(null)).toBe("Fuel tanks aren't available on this aircraft.");
  });

  it('say which engine type is unsupported, and the fifth-engine line', () => {
    expect(engineUnsupported(2)).toBe("Engine 2's type isn't supported.");
    expect(ENGINES_NOT_SHOWN).toBe("Engines 5 and up aren't shown.");
  });

  it('list temperatures with an unknown unit', () => {
    expect(unitsUnknown('Cessna 172', ['EGT'])).toBe(
      "The Cessna 172 doesn't say which unit its EGT uses; shown as reported.",
    );
    expect(unitsUnknown(null, ['EGT', 'ITT', 'oil temperature'])).toBe(
      "This aircraft doesn't say which units its EGT, ITT and oil temperature use; shown as reported.",
    );
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx jest tests/unit/domain/engines-page.test.ts tests/unit/domain/engines-messages.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 7: Write `engine-page.ts` and `messages.ts`**

Create `src/domain/engines/engine-page.ts`:

```ts
import { ENGINE_CONFIG, GAUGES, type GaugeId } from '@/domain/engines/catalogue';
import {
  type EngineKind,
  GAUGE_SETS,
  engineKind,
  gaugeLegend,
  gaugeSpoken,
} from '@/domain/engines/gauge-sets';
import { type Band, type Scale, type Tone, bandsFor, scaleFor, toneOf } from '@/domain/engines/markings';
import {
  type TemperatureSource,
  formatGauge,
  gaugeUnit,
  instrumentValue,
  redlineRpm,
  temperatureSource,
} from '@/domain/engines/units';
import { MAX_ENGINES } from '@/domain/systems/controls';
import type { UnitPreferences } from '@/domain/units/units';

/** What the page needs from the session: which names resolved, and their finite numbers. */
export interface EngineReader {
  has(name: string): boolean;
  /** Element `index` of an array value (the scalar itself at 0), when it is a finite number. */
  number(name: string, index?: number): number | null;
}

export interface GaugeReading {
  engine: number;
  id: GaugeId;
  legend: string;
  /** In the instrument unit (`instrumentValue`); null when no finite number has arrived. */
  value: number | null;
  /** Temperatures: the unit `value` is in. Null for other gauges. */
  source: TemperatureSource | null;
  text: string;
  scale: Scale | null;
  bands: readonly Band[];
  tone: Tone;
  spoken: string;
}

export interface EngineColumn {
  engine: number;
  kind: EngineKind;
  dial: GaugeReading | null;
  cells: Partial<Record<GaugeId, GaugeReading>>;
}

export interface GaugeRow {
  id: GaugeId;
  /** Legend and unit, once per row: `EGT °F`. */
  label: string;
}

/**
 * `unidentified`: the count or type DataRef did not resolve, or the count is not a whole number.
 * `waiting`: the count resolved but has not arrived. `none`: a count of 0 (a glider).
 */
export type EnginesStatus = 'unidentified' | 'waiting' | 'none' | 'ready';

export interface EnginesModel {
  status: EnginesStatus;
  columns: readonly EngineColumn[];
  rows: readonly GaugeRow[];
  /** Engines beyond the fourth. */
  hidden: number;
  /** Legends of gauges not drawn because their DataRef did not resolve (R6). */
  missing: readonly string[];
  /** Drawn temperature gauges whose unit the aircraft does not publish (spec §4.4). */
  unknownUnits: readonly GaugeId[];
  /** Engine numbers whose type has no gauge set. */
  unsupported: readonly number[];
}

const EMPTY = { columns: [], rows: [], hidden: 0, missing: [], unknownUnits: [], unsupported: [] };

const TONE_WORDS: Record<Tone, string> = {
  normal: '',
  yellow: ', in the yellow band',
  red: ', in the red band',
  redline: ', above the redline',
};

function redlineFor(id: GaugeId, reader: EngineReader): number | null {
  if (id === 'rpm') {
    return redlineRpm(reader.number(ENGINE_CONFIG.engineRedline));
  }
  if (id === 'prop') {
    return redlineRpm(reader.number(ENGINE_CONFIG.propRedline));
  }
  return null;
}

function reading(
  engine: number,
  id: GaugeId,
  kind: EngineKind,
  reader: EngineReader,
  units: UnitPreferences,
): GaugeReading {
  const spec = GAUGES[id];
  const source = temperatureSource(spec, (name) => reader.has(name), (name) => reader.number(name));
  const raw = reader.number(spec.name, engine - 1);
  const value = raw === null ? null : instrumentValue(id, raw);
  const bands = bandsFor(spec.marking, (name) => reader.number(name));
  const scale = scaleFor(id, bands, redlineFor(id, reader));
  const tone = value === null ? 'normal' : toneOf(value, bands, scale?.redline ?? null);
  const text = value === null ? '—' : formatGauge(id, value, units, source);
  const unit = gaugeUnit(id, units, source);
  const name = `Engine ${engine} ${gaugeSpoken(id, kind)}`;
  const spoken =
    text === '—'
      ? `${name}, no value`
      : `${name} ${text}${unit.spoken === '' ? '' : ` ${unit.spoken}`}${TONE_WORDS[tone]}`;
  return {
    engine,
    id,
    legend: gaugeLegend(id, kind),
    value,
    source,
    text,
    scale,
    bands,
    tone,
    spoken,
  };
}

/** The ENGINES page (spec §4.2–§4.5): one column per drawn engine, one row per gauge. */
export function enginesPage(reader: EngineReader, units: UnitPreferences): EnginesModel {
  if (!reader.has(ENGINE_CONFIG.count) || !reader.has(ENGINE_CONFIG.type)) {
    return { status: 'unidentified', ...EMPTY };
  }
  const count = reader.number(ENGINE_CONFIG.count);
  if (count === null) {
    return { status: 'waiting', ...EMPTY };
  }
  if (!Number.isInteger(count) || count < 0) {
    return { status: 'unidentified', ...EMPTY };
  }
  if (count === 0) {
    return { status: 'none', ...EMPTY };
  }

  const drawn = Math.min(count, MAX_ENGINES);
  const columns: EngineColumn[] = [];
  const rows: GaugeRow[] = [];
  const missing: string[] = [];
  const unknownUnits: GaugeId[] = [];
  const unsupported: number[] = [];
  const note = (list: string[], legend: string) => {
    if (!list.includes(legend)) {
      list.push(legend);
    }
  };

  for (let engine = 1; engine <= drawn; engine += 1) {
    const kind = engineKind(reader.number(ENGINE_CONFIG.type, engine - 1));
    if (kind === 'unsupported') {
      unsupported.push(engine);
    }
    const set = GAUGE_SETS[kind];
    const present = (id: GaugeId): boolean => {
      if (reader.has(GAUGES[id].name)) {
        return true;
      }
      note(missing, gaugeLegend(id, kind));
      return false;
    };
    const dial =
      set.dial !== null && present(set.dial) ? reading(engine, set.dial, kind, reader, units) : null;
    const cells: Partial<Record<GaugeId, GaugeReading>> = {};
    for (const id of set.rows) {
      if (!present(id)) {
        continue;
      }
      const cell = reading(engine, id, kind, reader, units);
      cells[id] = cell;
      if (!rows.some((row) => row.id === id)) {
        const unit = gaugeUnit(id, units, cell.source);
        rows.push({ id, label: `${cell.legend} ${unit.label}`.trim() });
      }
    }
    for (const gauge of [dial, ...Object.values(cells)]) {
      if (gauge?.source === 'unknown' && !unknownUnits.includes(gauge.id)) {
        unknownUnits.push(gauge.id);
      }
    }
    columns.push({ engine, kind, dial, cells });
  }

  return {
    status: 'ready',
    columns,
    rows,
    hidden: count - drawn,
    missing,
    unknownUnits,
    unsupported,
  };
}
```

Note the expected `missing` order in the test: `['RPM', 'CHT']` (the dial is checked before the rows).

Create `src/domain/engines/messages.ts`:

```ts
/**
 * Every sentence the Engines panel shows (R7): plain words, the aircraft named when known, never a
 * name, id or code. `aircraft` is X-Plane's description of the loaded aircraft, or null.
 */
export { ENGINES_NOT_SHOWN, missingControls as gaugesMissing } from '@/domain/systems/messages';

function subject(aircraft: string | null): string {
  return aircraft === null ? 'This aircraft' : `The ${aircraft}`;
}

function object(aircraft: string | null): string {
  return aircraft === null ? 'this aircraft' : `the ${aircraft}`;
}

function listed(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function enginesUnidentified(aircraft: string | null): string {
  return `The engines on ${object(aircraft)} couldn't be identified.`;
}

export function noEngines(aircraft: string | null): string {
  return `${subject(aircraft)} has no engines.`;
}

export function engineUnsupported(engine: number): string {
  return `Engine ${engine}'s type isn't supported.`;
}

/** `names` are the gauges' spoken names: "EGT", "ITT", "oil temperature". */
export function unitsUnknown(aircraft: string | null, names: readonly string[]): string {
  const plural = names.length > 1;
  return `${subject(aircraft)} doesn't say which unit${plural ? 's' : ''} its ${listed(names)} ${
    plural ? 'use' : 'uses'
  }; shown as reported.`;
}

export function tanksUnavailable(aircraft: string | null): string {
  return `Fuel tanks aren't available on ${object(aircraft)}.`;
}
```

- [ ] **Step 8: Run them to verify they pass, then the gate**

Run: `npx jest tests/unit/domain/engines-page.test.ts tests/unit/domain/engines-messages.test.ts tests/unit/domain/engines-gauges.test.ts`
Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/domain/engines tests/unit/domain/engines-gauges.test.ts tests/unit/domain/engines-page.test.ts tests/unit/domain/engines-messages.test.ts
git commit -m "feat(engines): gauge sets, markings, units and the engines page model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 3: Fuel, electrical and lean-assist domain

**Files:**
- Create: `src/domain/engines/fuel.ts`, `src/domain/engines/electrical.ts`, `src/domain/engines/lean.ts`
- Test: `tests/unit/domain/engines-fuel.test.ts`, `tests/unit/domain/engines-electrical.test.ts`, `tests/unit/domain/engines-lean.test.ts`

**Interfaces:**
- Consumes (Tasks 1–2): `FUEL`, `TANK_SLOTS`, `ELECTRICAL`, `MAX_BUSES`, `MAX_BATTERIES`, `GAUGES` (catalogue); `EngineReader`, `EngineColumn`, `EnginesModel`, `GaugeReading` (engine-page); `groupedWhole`, `signedWhole`, `fixed`, `formatGauge`, `convertTemperatureDelta` (units). `KG_PER_LB`, `convertFuel`, `UnitPreferences` from `@/domain/units/units`; `MAX_ENGINES` from `@/domain/systems/controls`.
- Produces:
  - `fuel.ts`: `interface Readout { text: string; spoken: string }`; `interface TankReading { slot: number; name: string; text: string; fraction: number | null; spoken: string }`; `interface FuelModel { tanks: readonly TankReading[] | null; unit: 'KG' | 'LB'; flowUnit: 'KG/H' | 'LB/H'; total: Readout | null; flow: Readout; used: Readout | null; endurance: Readout; missing: readonly string[] }`; `usedSlots(reader): number[] | null`; `tankNames(slots, reader): string[]`; `fuelPage(reader, units, engines: number | null): FuelModel`; `ENDURANCE_MIN_FLOW_KG_H = 1`.
  - `electrical.ts`: `interface PowerRow { key: string; label: string; volts: string | null; amps: string | null; spoken: string }`; `interface ElectricalModel { buses: readonly PowerRow[]; batteries: readonly PowerRow[]; generators: readonly PowerRow[]; missing: readonly string[] }`; `electricalPage(reader, engines: number | null): ElectricalModel`.
  - `lean.ts`: `type Peaks = Readonly<Record<number, number>>`; `interface EgtSample { engine: number; value: number | null }`; `egtSamples(model: EnginesModel): EgtSample[]`; `advancePeaks(peaks: Peaks, samples: readonly EgtSample[]): Peaks` (returns the same object when nothing rose); `leanAvailable(model: EnginesModel): boolean`; `interface LeanDelta { text: string; spoken: string }`; `leanDelta(egt: GaugeReading, peak: number | undefined, units: UnitPreferences): LeanDelta`.

`engines` (the drawn engine count) comes from the ENGINES model: `model.status === 'ready' ? model.columns.length : model.status === 'none' ? 0 : null`. Tasks 6 and 7 compute it exactly so.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/domain/engines-fuel.test.ts`:

```ts
import { FUEL, GAUGES } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { fuelPage, tankNames, usedSlots } from '@/domain/engines/fuel';
import { formatFuel } from '@/domain/flight-data/format';
import { DEFAULT_UNITS } from '@/domain/units/units';

type Values = Record<string, number | number[]>;

function reader(values: Values, missing: readonly string[] = []): EngineReader {
  return {
    has: (name) => !missing.includes(name) && name in values,
    number: (name, index = 0) => {
      const value = values[name];
      const candidate = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;
      return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
    },
  };
}

const nine = (...first: number[]): number[] => [
  ...first,
  ...new Array<number>(9 - first.length).fill(0),
];

/** Two wing tanks of 42 kg, each half of a 370 lb (167.8 kg) capacity; one engine at 37.8 kg/h. */
const C172: Values = {
  [FUEL.perTank]: nine(42, 42),
  [FUEL.total]: 84,
  [FUEL.ratio]: nine(0.5, 0.5),
  [FUEL.count]: 9,
  [FUEL.capacity]: 370,
  [FUEL.side]: nine(-10, 10),
  [FUEL.used]: 12,
  [GAUGES.ff.name]: [0.0105, 0, 0, 0],
};

describe('fuel tanks (spec §4.7)', () => {
  it('uses the slots with a ratio above 0, below the slot count', () => {
    expect(usedSlots(reader(C172))).toEqual([0, 1]);
    expect(usedSlots(reader({ ...C172, [FUEL.ratio]: nine(0.3, 0, 0.4, 0.3) }))).toEqual([0, 2, 3]);
    expect(usedSlots(reader({ ...C172, [FUEL.count]: 1 }))).toEqual([0]);
  });

  it('falls back to the slot count without ratios, and to nothing without both', () => {
    expect(usedSlots(reader({ ...C172, [FUEL.count]: 3 }, [FUEL.ratio]))).toEqual([0, 1, 2]);
    expect(usedSlots(reader(C172, [FUEL.ratio, FUEL.count]))).toBeNull();
  });

  it('names tanks by side, numbering a shared side, and by number without positions', () => {
    expect(tankNames([0, 1], reader(C172))).toEqual(['LEFT', 'RIGHT']);
    expect(
      tankNames([0, 1, 2, 3], reader({ ...C172, [FUEL.side]: nine(-10, -4, 0, 10) })),
    ).toEqual(['LEFT 1', 'LEFT 2', 'CENTER', 'RIGHT']);
    expect(tankNames([0, 1], reader(C172, [FUEL.side]))).toEqual(['TANK 1', 'TANK 2']);
  });

  it('shows each tank with its share of its capacity', () => {
    const model = fuelPage(reader(C172), DEFAULT_UNITS, 1);
    expect(model.unit).toBe('KG');
    expect(model.tanks?.map((tank) => [tank.name, tank.text])).toEqual([
      ['LEFT', '42'],
      ['RIGHT', '42'],
    ]);
    expect(model.tanks?.[0]?.fraction).toBeCloseTo(42 / (370 * 0.45359237 * 0.5), 6);
    expect(model.tanks?.[0]?.spoken).toBe('Left tank, 42 kilograms');
    expect(fuelPage(reader(C172, [FUEL.capacity]), DEFAULT_UNITS, 1).tanks?.[0]?.fraction).toBeNull();
  });

  it('has no tank list without per-tank fuel or slots', () => {
    expect(fuelPage(reader(C172, [FUEL.perTank]), DEFAULT_UNITS, 1).tanks).toBeNull();
    expect(fuelPage(reader(C172, [FUEL.ratio, FUEL.count]), DEFAULT_UNITS, 1).tanks).toBeNull();
  });
});

describe('fuel totalizer (spec §4.7)', () => {
  it('shows total, flow, used and endurance', () => {
    const model = fuelPage(reader(C172), DEFAULT_UNITS, 1);
    expect(model.total).toEqual({ text: '84', spoken: 'Total fuel 84 kilograms' });
    expect(model.flow).toEqual({ text: '37.8', spoken: 'Fuel flow 37.8 kilograms per hour' });
    expect(model.flowUnit).toBe('KG/H');
    expect(model.used).toEqual({ text: '12', spoken: 'Fuel used 12 kilograms' });
    // 84 kg at 37.8 kg/h is 2 h 13 min (133.3 minutes, rounded down).
    expect(model.endurance).toEqual({ text: '2:13', spoken: 'Endurance 2 hours 13 minutes' });
    expect(model.missing).toEqual([]);
  });

  it('shows no endurance at 1 kg/h or less, or without engines', () => {
    const idle = fuelPage(reader({ ...C172, [GAUGES.ff.name]: [0, 0, 0, 0] }), DEFAULT_UNITS, 1);
    expect(idle.endurance).toEqual({ text: '—', spoken: 'Endurance, not available' });
    expect(idle.flow.text).toBe('0.0');
    const glider = fuelPage(reader(C172), DEFAULT_UNITS, 0);
    expect(glider.flow).toEqual({ text: '—', spoken: 'Fuel flow, no value' });
    expect(fuelPage(reader(C172), DEFAULT_UNITS, null).endurance.text).toBe('—');
  });

  it('switches every fuel number to pounds together, and TOTAL agrees with the F-11 strip (Review Focus 5)', () => {
    const model = fuelPage(reader(C172), { ...DEFAULT_UNITS, fuel: 'lb' }, 1);
    expect(model.unit).toBe('LB');
    expect(model.flowUnit).toBe('LB/H');
    expect(model.tanks?.[0]?.text).toBe('93');
    expect(model.total?.text).toBe('185');
    expect(formatFuel(84, 'lb')).toBe(`${model.total?.text} lb`);
    expect(model.used?.spoken).toBe('Fuel used 26 pounds');
    expect(model.flow.text).toBe('83.3');
  });

  it('lists TOTAL and USED as unavailable when their DataRefs are missing', () => {
    const model = fuelPage(reader(C172, [FUEL.total, FUEL.used]), DEFAULT_UNITS, 1);
    expect(model.total).toBeNull();
    expect(model.used).toBeNull();
    expect(model.missing).toEqual(['TOTAL', 'USED']);
    expect(model.endurance.text).toBe('—');
  });

  it('shows a non-finite tank as a dash with no bar (Review Focus 3)', () => {
    const model = fuelPage(
      reader({ ...C172, [FUEL.perTank]: nine(Number.NaN, 42) }),
      DEFAULT_UNITS,
      1,
    );
    expect(model.tanks?.[0]?.text).toBe('—');
    expect(model.tanks?.[0]?.fraction).toBeNull();
    expect(model.tanks?.[0]?.spoken).toBe('Left tank, no value');
  });
});
```

Create `tests/unit/domain/engines-electrical.test.ts`:

```ts
import { ELECTRICAL } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { electricalPage } from '@/domain/engines/electrical';

type Values = Record<string, number | number[]>;

function reader(values: Values, missing: readonly string[] = []): EngineReader {
  return {
    has: (name) => !missing.includes(name) && name in values,
    number: (name, index = 0) => {
      const value = values[name];
      const candidate = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;
      return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
    },
  };
}

const VALUES: Values = {
  [ELECTRICAL.busCount]: 2,
  [ELECTRICAL.batteryCount]: 1,
  [ELECTRICAL.busVolts]: [28.14, 27.9, 0, 0, 0, 0],
  [ELECTRICAL.busAmps]: [12.4, 3, 0, 0, 0, 0],
  [ELECTRICAL.batteryVolts]: [24.3, 0, 0, 0, 0, 0, 0, 0],
  [ELECTRICAL.batteryAmps]: [-4.2, 0, 0, 0, 0, 0, 0, 0],
  [ELECTRICAL.generatorAmps]: [30, 28, 0, 0, 0, 0, 0, 0],
};

describe('electrical rows (spec §4.8)', () => {
  it('draws the buses, batteries and one generator per engine', () => {
    const model = electricalPage(reader(VALUES), 2);
    expect(model.buses).toEqual([
      { key: 'bus-1', label: 'BUS 1', volts: '28.1', amps: '12', spoken: 'Bus 1, 28.1 volts, 12 amps' },
      { key: 'bus-2', label: 'BUS 2', volts: '27.9', amps: '3', spoken: 'Bus 2, 27.9 volts, 3 amps' },
    ]);
    expect(model.batteries).toEqual([
      {
        key: 'batt-1',
        label: 'BATT 1',
        volts: '24.3',
        amps: '−4',
        spoken: 'Battery 1, 24.3 volts, minus 4 amps',
      },
    ]);
    expect(model.generators.map((row) => [row.label, row.volts, row.amps, row.spoken])).toEqual([
      ['GEN 1', null, '30', 'Generator 1, 30 amps'],
      ['GEN 2', null, '28', 'Generator 2, 28 amps'],
    ]);
    expect(model.missing).toEqual([]);
  });

  it('shows the first entry only without a count, and none for a count of 0', () => {
    const model = electricalPage(reader(VALUES, [ELECTRICAL.busCount]), 1);
    expect(model.buses).toHaveLength(1);
    expect(electricalPage(reader({ ...VALUES, [ELECTRICAL.batteryCount]: 0 }), 1).batteries).toEqual(
      [],
    );
  });

  it('has no generator rows on a glider, and one when the engine count is unknown', () => {
    expect(electricalPage(reader(VALUES), 0).generators).toEqual([]);
    expect(electricalPage(reader(VALUES), null).generators).toHaveLength(1);
  });

  it('drops a column whose DataRef is missing, and a group with neither', () => {
    const noVolts = electricalPage(reader(VALUES, [ELECTRICAL.busVolts]), 1);
    expect(noVolts.buses[0]).toEqual({
      key: 'bus-1',
      label: 'BUS 1',
      volts: null,
      amps: '12',
      spoken: 'Bus 1, 12 amps',
    });
    const noBattery = electricalPage(
      reader(VALUES, [ELECTRICAL.batteryVolts, ELECTRICAL.batteryAmps, ELECTRICAL.generatorAmps]),
      1,
    );
    expect(noBattery.batteries).toEqual([]);
    expect(noBattery.generators).toEqual([]);
    expect(noBattery.missing).toEqual(['BATT', 'GEN']);
  });

  it('shows a reading that has not arrived as a dash', () => {
    const model = electricalPage(reader({ ...VALUES, [ELECTRICAL.busVolts]: [] }), 1);
    expect(model.buses[0]?.volts).toBe('—');
    expect(model.buses[0]?.spoken).toBe('Bus 1, no voltage reading, 12 amps');
  });
});
```

Create `tests/unit/domain/engines-lean.test.ts`:

```ts
import type { EnginesModel, GaugeReading } from '@/domain/engines/engine-page';
import { advancePeaks, egtSamples, leanAvailable, leanDelta } from '@/domain/engines/lean';
import { DEFAULT_UNITS } from '@/domain/units/units';

function egt(engine: number, value: number | null, source: GaugeReading['source'] = 'F'): GaugeReading {
  return {
    engine,
    id: 'egt',
    legend: 'EGT',
    value,
    source,
    text: value === null ? '—' : String(value),
    scale: null,
    bands: [],
    tone: 'normal',
    spoken: '',
  };
}

function model(columns: EnginesModel['columns']): EnginesModel {
  return { status: 'ready', columns, rows: [], hidden: 0, missing: [], unknownUnits: [], unsupported: [] };
}

describe('lean assist (spec §4.6)', () => {
  it('samples EGT from piston engines only', () => {
    const twin = model([
      { engine: 1, kind: 'piston', dial: null, cells: { egt: egt(1, 1300) } },
      { engine: 2, kind: 'jet', dial: null, cells: { egt: egt(2, 900) } },
    ]);
    expect(egtSamples(twin)).toEqual([{ engine: 1, value: 1300 }]);
    expect(leanAvailable(twin)).toBe(true);
    expect(leanAvailable(model([{ engine: 1, kind: 'piston', dial: null, cells: {} }]))).toBe(false);
    expect(leanAvailable({ ...twin, status: 'waiting' })).toBe(false);
  });

  it('keeps the highest EGT per engine, returning the same object when nothing rose', () => {
    const first = advancePeaks({}, [
      { engine: 1, value: 1300 },
      { engine: 2, value: null },
    ]);
    expect(first).toEqual({ 1: 1300 });
    const second = advancePeaks(first, [{ engine: 1, value: 1350 }]);
    expect(second).toEqual({ 1: 1350 });
    expect(advancePeaks(second, [{ engine: 1, value: 1320 }])).toBe(second);
  });

  it('shows the difference from peak in the pilot unit', () => {
    expect(leanDelta(egt(1, 1325), 1350, { ...DEFAULT_UNITS, temperature: 'F' })).toEqual({
      text: '−25',
      spoken: 'Engine 1 25 degrees below peak EGT',
    });
    // 25 °F of difference is 13.9 °C.
    expect(leanDelta(egt(1, 1325), 1350, DEFAULT_UNITS).text).toBe('−14');
    expect(leanDelta(egt(1, 1350), 1350, DEFAULT_UNITS)).toEqual({
      text: '0',
      spoken: 'Engine 1 at peak EGT',
    });
    expect(leanDelta(egt(1, 700, 'unknown'), 710, DEFAULT_UNITS).text).toBe('−10');
  });

  it('shows a dash before a peak or a value exists', () => {
    expect(leanDelta(egt(1, 1300), undefined, DEFAULT_UNITS)).toEqual({
      text: '—',
      spoken: 'Engine 1, no peak EGT yet',
    });
    expect(leanDelta(egt(1, null), 1300, DEFAULT_UNITS).text).toBe('—');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/domain/engines-fuel.test.ts tests/unit/domain/engines-electrical.test.ts tests/unit/domain/engines-lean.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `fuel.ts`**

Create `src/domain/engines/fuel.ts`:

```ts
import { FUEL, GAUGES, TANK_SLOTS } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { formatGauge, groupedWhole } from '@/domain/engines/units';
import { KG_PER_LB, type UnitPreferences, convertFuel } from '@/domain/units/units';

export interface Readout {
  text: string;
  spoken: string;
}

export interface TankReading {
  slot: number;
  name: string;
  text: string;
  /** Quantity over the tank's capacity, 0..1; null without a capacity or a value. */
  fraction: number | null;
  spoken: string;
}

export interface FuelModel {
  /** Null when the aircraft publishes no per-tank fuel, or neither tank ratios nor a tank count. */
  tanks: readonly TankReading[] | null;
  unit: 'KG' | 'LB';
  flowUnit: 'KG/H' | 'LB/H';
  /** Null when the total DataRef did not resolve. */
  total: Readout | null;
  flow: Readout;
  /** Null when the totalizer DataRef did not resolve. */
  used: Readout | null;
  endurance: Readout;
  /** Legends of totalizer rows not drawn. */
  missing: readonly string[];
}

/** Below this flow, endurance is not shown: an idle or stopped engine would give days. */
export const ENDURANCE_MIN_FLOW_KG_H = 1;
const SIDE_THRESHOLD = 0.5;
const NO_VALUE = '—';

function slotLimit(reader: EngineReader): number | null {
  if (!reader.has(FUEL.count)) {
    return null;
  }
  const count = reader.number(FUEL.count);
  return count !== null && Number.isInteger(count) && count >= 0
    ? Math.min(count, TANK_SLOTS)
    : null;
}

/** Spec §4.7: slots with a ratio above 0 (below the slot count when it resolves); without ratios,
 * every slot below the count; without both, unknown. */
export function usedSlots(reader: EngineReader): number[] | null {
  const limit = slotLimit(reader);
  if (reader.has(FUEL.ratio)) {
    const slots: number[] = [];
    for (let slot = 0; slot < (limit ?? TANK_SLOTS); slot += 1) {
      const ratio = reader.number(FUEL.ratio, slot);
      if (ratio !== null && ratio > 0) {
        slots.push(slot);
      }
    }
    return slots;
  }
  return limit === null ? null : Array.from({ length: limit }, (_, slot) => slot);
}

type Side = 'LEFT' | 'CENTER' | 'RIGHT';

/** By side from the lateral position, numbered when two share one; TANK n without positions. */
export function tankNames(slots: readonly number[], reader: EngineReader): string[] {
  const sides = slots.map((slot): Side | null => {
    if (!reader.has(FUEL.side)) {
      return null;
    }
    const x = reader.number(FUEL.side, slot);
    if (x === null) {
      return null;
    }
    return x < -SIDE_THRESHOLD ? 'LEFT' : x > SIDE_THRESHOLD ? 'RIGHT' : 'CENTER';
  });
  if (sides.some((side) => side === null)) {
    return slots.map((_, index) => `TANK ${index + 1}`);
  }
  const totals = new Map<Side, number>();
  for (const side of sides as Side[]) {
    totals.set(side, (totals.get(side) ?? 0) + 1);
  }
  const seen = new Map<Side, number>();
  return (sides as Side[]).map((side) => {
    if (totals.get(side) === 1) {
      return side;
    }
    const ordinal = (seen.get(side) ?? 0) + 1;
    seen.set(side, ordinal);
    return `${side} ${ordinal}`;
  });
}

/** "LEFT" → "Left tank", "LEFT 2" → "Left tank 2", "TANK 1" → "Tank 1". */
function spokenTank(name: string): string {
  const words = name.charAt(0) + name.slice(1).toLowerCase();
  return name.startsWith('TANK') ? words : words.replace(/^(\w+)/, '$1 tank');
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The FUEL page (spec §4.7). `engines`: the drawn engine count, 0 for a glider, null if unknown. */
export function fuelPage(
  reader: EngineReader,
  units: UnitPreferences,
  engines: number | null,
): FuelModel {
  const kg = units.fuel === 'kg';
  const unitWord = kg ? 'kilograms' : 'pounds';
  const amount = (value: number): string => groupedWhole(convertFuel(value, units.fuel));
  const missing: string[] = [];

  let tanks: TankReading[] | null = null;
  const slots = usedSlots(reader);
  if (slots !== null && reader.has(FUEL.perTank)) {
    const names = tankNames(slots, reader);
    const capacityLb = reader.has(FUEL.capacity) ? reader.number(FUEL.capacity) : null;
    tanks = slots.map((slot, index) => {
      const name = names[index] ?? `TANK ${index + 1}`;
      const quantity = reader.number(FUEL.perTank, slot);
      const ratio = reader.has(FUEL.ratio) ? reader.number(FUEL.ratio, slot) : null;
      const capacityKg =
        capacityLb !== null && capacityLb > 0 && ratio !== null && ratio > 0
          ? capacityLb * KG_PER_LB * ratio
          : null;
      const fraction =
        quantity !== null && capacityKg !== null
          ? Math.min(1, Math.max(0, quantity / capacityKg))
          : null;
      const text = quantity === null ? NO_VALUE : amount(quantity);
      return {
        slot,
        name,
        text,
        fraction,
        spoken: `${spokenTank(name)}, ${quantity === null ? 'no value' : `${text} ${unitWord}`}`,
      };
    });
  }

  let total: Readout | null = null;
  let totalKg: number | null = null;
  if (reader.has(FUEL.total)) {
    totalKg = reader.number(FUEL.total);
    total =
      totalKg === null
        ? { text: NO_VALUE, spoken: 'Total fuel, no value' }
        : { text: amount(totalKg), spoken: `Total fuel ${amount(totalKg)} ${unitWord}` };
  } else {
    missing.push('TOTAL');
  }

  let flowKgH: number | null = null;
  if (engines !== null && engines > 0 && reader.has(GAUGES.ff.name)) {
    const flows: number[] = [];
    for (let engine = 1; engine <= engines; engine += 1) {
      const flow = reader.number(GAUGES.ff.name, engine - 1);
      if (flow !== null) {
        flows.push(flow);
      }
    }
    flowKgH = flows.length === 0 ? null : flows.reduce((sum, flow) => sum + flow, 0) * 3600;
  }
  const flowText = flowKgH === null ? NO_VALUE : formatGauge('ff', flowKgH, units, null);
  const flow: Readout =
    flowKgH === null
      ? { text: NO_VALUE, spoken: 'Fuel flow, no value' }
      : { text: flowText, spoken: `Fuel flow ${flowText} ${unitWord} per hour` };

  let used: Readout | null = null;
  if (reader.has(FUEL.used)) {
    const usedKg = reader.number(FUEL.used);
    used =
      usedKg === null
        ? { text: NO_VALUE, spoken: 'Fuel used, no value' }
        : { text: amount(usedKg), spoken: `Fuel used ${amount(usedKg)} ${unitWord}` };
  } else {
    missing.push('USED');
  }

  let endurance: Readout = { text: NO_VALUE, spoken: 'Endurance, not available' };
  if (totalKg !== null && flowKgH !== null && flowKgH > ENDURANCE_MIN_FLOW_KG_H) {
    const minutes = Math.floor((totalKg / flowKgH) * 60);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    endurance = {
      text: `${hours}:${String(rest).padStart(2, '0')}`,
      spoken: `Endurance ${plural(hours, 'hour')} ${plural(rest, 'minute')}`,
    };
  }

  return {
    tanks,
    unit: kg ? 'KG' : 'LB',
    flowUnit: kg ? 'KG/H' : 'LB/H',
    total,
    flow,
    used,
    endurance,
    missing,
  };
}
```

- [ ] **Step 4: Write `electrical.ts`**

Create `src/domain/engines/electrical.ts`:

```ts
import { ELECTRICAL, MAX_BATTERIES, MAX_BUSES } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { fixed, signedWhole } from '@/domain/engines/units';
import { MAX_ENGINES } from '@/domain/systems/controls';

export interface PowerRow {
  key: string;
  label: string;
  /** Null when this group has no voltage DataRef (generators never do). */
  volts: string | null;
  amps: string | null;
  spoken: string;
}

export interface ElectricalModel {
  buses: readonly PowerRow[];
  batteries: readonly PowerRow[];
  generators: readonly PowerRow[];
  /** Groups not drawn because neither of their DataRefs resolved: BUS, BATT, GEN. */
  missing: readonly string[];
}

const NO_VALUE = '—';

/** Spec §4.8: the count when it resolves (capped), else the first entry only. */
function countOf(reader: EngineReader, name: string, max: number): number {
  if (!reader.has(name)) {
    return 1;
  }
  const count = reader.number(name);
  return count !== null && Number.isInteger(count) && count >= 0 ? Math.min(count, max) : 1;
}

function powerRows(
  reader: EngineReader,
  group: { legend: string; key: string; spoken: string },
  count: number,
  volts: string | null,
  amps: string,
  missing: string[],
): PowerRow[] {
  const hasVolts = volts !== null && reader.has(volts);
  const hasAmps = reader.has(amps);
  if (!hasVolts && !hasAmps) {
    missing.push(group.legend);
    return [];
  }
  return Array.from({ length: count }, (_, index) => {
    const parts: string[] = [`${group.spoken} ${index + 1}`];
    let voltsText: string | null = null;
    if (hasVolts && volts !== null) {
      const value = reader.number(volts, index);
      voltsText = value === null ? NO_VALUE : fixed(value, 1);
      parts.push(value === null ? 'no voltage reading' : `${voltsText} volts`);
    }
    let ampsText: string | null = null;
    if (hasAmps) {
      const value = reader.number(amps, index);
      ampsText = value === null ? NO_VALUE : signedWhole(value);
      const rounded = value === null ? 0 : Math.round(value);
      parts.push(
        value === null
          ? 'no current reading'
          : `${rounded < 0 ? 'minus ' : ''}${Math.abs(rounded)} amps`,
      );
    }
    return {
      key: `${group.key}-${index + 1}`,
      label: `${group.legend} ${index + 1}`,
      volts: voltsText,
      amps: ampsText,
      spoken: parts.join(', '),
    };
  });
}

/** The ELEC page (spec §4.8). `engines`: the drawn engine count, 0 for a glider, null if unknown. */
export function electricalPage(reader: EngineReader, engines: number | null): ElectricalModel {
  const missing: string[] = [];
  const buses = powerRows(
    reader,
    { legend: 'BUS', key: 'bus', spoken: 'Bus' },
    countOf(reader, ELECTRICAL.busCount, MAX_BUSES),
    ELECTRICAL.busVolts,
    ELECTRICAL.busAmps,
    missing,
  );
  const batteries = powerRows(
    reader,
    { legend: 'BATT', key: 'batt', spoken: 'Battery' },
    countOf(reader, ELECTRICAL.batteryCount, MAX_BATTERIES),
    ELECTRICAL.batteryVolts,
    ELECTRICAL.batteryAmps,
    missing,
  );
  const generators = powerRows(
    reader,
    { legend: 'GEN', key: 'gen', spoken: 'Generator' },
    engines === null ? 1 : Math.min(engines, MAX_ENGINES),
    null,
    ELECTRICAL.generatorAmps,
    missing,
  );
  return { buses, batteries, generators, missing };
}
```

Note: in the "no battery" test, generators are missing too, and on a glider `generators` is `[]` without listing GEN as missing (its DataRef resolved; there is simply no engine).

- [ ] **Step 5: Write `lean.ts`**

Create `src/domain/engines/lean.ts`:

```ts
import type { EnginesModel, GaugeReading } from '@/domain/engines/engine-page';
import { convertTemperatureDelta, signedWhole } from '@/domain/engines/units';
import type { UnitPreferences } from '@/domain/units/units';

/** Engine number → the highest EGT seen since LEAN went on, in the EGT's source unit. */
export type Peaks = Readonly<Record<number, number>>;

export interface EgtSample {
  engine: number;
  value: number | null;
}

/** The piston engines' EGT (spec §4.6: lean assist is piston only). */
export function egtSamples(model: EnginesModel): EgtSample[] {
  return model.columns
    .filter((column) => column.kind === 'piston' && column.cells.egt !== undefined)
    .map((column) => ({ engine: column.engine, value: column.cells.egt?.value ?? null }));
}

/** The LEAN key is shown when at least one piston engine has an EGT gauge. */
export function leanAvailable(model: EnginesModel): boolean {
  return model.status === 'ready' && egtSamples(model).length > 0;
}

/** Raises each engine's peak to its current EGT; the same object when nothing rose. */
export function advancePeaks(peaks: Peaks, samples: readonly EgtSample[]): Peaks {
  let next: Record<number, number> | null = null;
  for (const { engine, value } of samples) {
    const peak = peaks[engine];
    if (value !== null && (peak === undefined || value > peak)) {
      next = next ?? { ...peaks };
      next[engine] = value;
    }
  }
  return next ?? peaks;
}

export interface LeanDelta {
  text: string;
  spoken: string;
}

/** ΔPEAK: the current EGT minus the peak, in the pilot's unit (as reported when unknown). */
export function leanDelta(
  egt: GaugeReading,
  peak: number | undefined,
  units: UnitPreferences,
): LeanDelta {
  if (egt.value === null || peak === undefined || egt.source === 'pending') {
    return { text: '—', spoken: `Engine ${egt.engine}, no peak EGT yet` };
  }
  const raw = egt.value - peak;
  const delta =
    egt.source === 'C' || egt.source === 'F'
      ? convertTemperatureDelta(raw, egt.source, units.temperature)
      : raw;
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return { text: '0', spoken: `Engine ${egt.engine} at peak EGT` };
  }
  return {
    text: signedWhole(rounded),
    spoken: `Engine ${egt.engine} ${Math.abs(rounded)} degrees ${rounded < 0 ? 'below' : 'above'} peak EGT`,
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass, then the gate**

Run: `npx jest tests/unit/domain/engines-fuel.test.ts tests/unit/domain/engines-electrical.test.ts tests/unit/domain/engines-lean.test.ts`
Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/domain/engines/fuel.ts src/domain/engines/electrical.ts src/domain/engines/lean.ts tests/unit/domain/engines-fuel.test.ts tests/unit/domain/engines-electrical.test.ts tests/unit/domain/engines-lean.test.ts
git commit -m "feat(engines): fuel totalizer, electrical rows and lean-assist peaks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 4: The gauge bar and the dial

**Files:**
- Create: `src/features/panels/engines/dial-geometry.ts`, `src/features/panels/engines/tone.ts`, `src/features/panels/engines/GaugeBar.tsx`, `src/features/panels/engines/GaugeDial.tsx`
- Test: `tests/unit/domain/engines-dial-geometry.test.ts`, `tests/ui/engines-gauges.test.tsx`

**Interfaces:**
- Consumes (Tasks 1–2): `Band`, `Scale`, `Tone`, `scaleFraction` (markings); `GaugeReading` (engine-page); `MarkingColour` (catalogue). Theme: `useTheme`, `useThemedStyles` from `@/theme/theme-context`, `Theme` from `@/theme/tokens`, `avionicsText` from `@/theme/typography`.
- Produces:
  - `dial-geometry.ts`: `DIAL_START_DEG = 150`, `DIAL_SWEEP_DEG = 240`, `interface Point { x: number; y: number }`, `dialPoint(cx, cy, r, fraction): Point`, `arcPath(cx, cy, r, from, to): string`, `dialHeight(size: number): number`.
  - `tone.ts`: `toneColour(theme, tone, stale): string`, `bandColour(theme, colour, stale): string`.
  - `GaugeBar` props `{ scale: Scale; bands: readonly Band[]; value: number | null; tone: Tone; stale: boolean; peak?: number | null }`. testIDs `gauge-bar`, `gauge-band-{colour}`, `gauge-redline`, `gauge-peak`, `gauge-pointer`. Hidden from accessibility (the cell that holds it speaks).
  - `GaugeDial` props `{ reading: GaugeReading; size: number; stale: boolean }`. One accessible element labelled `reading.spoken`, testID `dial-{engine}`; inner testIDs `dial-band-{colour}`, `dial-redline`, `dial-needle`, `dial-value-{engine}`.

Colours (spec §4.5, R-01 palette): bands green `avionics.engaged`, yellow `avionics.caution`, red `avionics.warning`; pointer, needle and number `avionics.legend` (normal), `caution` (yellow), `warning` (red, redline); everything `legendDim` when stale. The track is `avionics.lightOff`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/domain/engines-dial-geometry.test.ts`:

```ts
import { arcPath, dialHeight, dialPoint } from '@/features/panels/engines/dial-geometry';

describe('dial geometry', () => {
  it('runs 240° clockwise from lower left (150°) through the top to lower right (30°)', () => {
    const start = dialPoint(50, 50, 40, 0);
    expect(start.x).toBeCloseTo(15.36, 2);
    expect(start.y).toBeCloseTo(70, 6);
    const top = dialPoint(50, 50, 40, 0.5);
    expect(top.x).toBeCloseTo(50, 6);
    expect(top.y).toBeCloseTo(10, 6);
    const end = dialPoint(50, 50, 40, 1);
    expect(end.x).toBeCloseTo(84.64, 2);
    expect(end.y).toBeCloseTo(70, 6);
  });

  it('draws an SVG arc, flagging the large arc past 180°', () => {
    expect(arcPath(50, 50, 40, 0, 1)).toBe('M 15.36 70 A 40 40 0 1 1 84.64 70');
    expect(arcPath(50, 50, 40, 0, 0.5)).toBe('M 15.36 70 A 40 40 0 0 1 50 10');
  });

  it('is three quarters as tall as it is wide', () => {
    expect(dialHeight(180)).toBe(135);
    expect(dialHeight(81)).toBe(61);
  });
});
```

Create `tests/ui/engines-gauges.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import type { GaugeReading } from '@/domain/engines/engine-page';
import { GaugeBar } from '@/features/panels/engines/GaugeBar';
import { GaugeDial } from '@/features/panels/engines/GaugeDial';
import { ThemeProvider } from '@/theme/theme-context';

const LEGEND = '#e8eaed';
const DIM = '#8b949e';
const CAUTION = '#ffb300';
const WARNING = '#ff4a3d';
const GREEN = '#36d35a';

function themed(node: React.ReactElement) {
  return (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      {node}
    </ThemeProvider>
  );
}

const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

const SCALE = { min: 0, max: 200, redline: null };

describe('GaugeBar', () => {
  it('draws each band from its edges and the pointer at the value, in the tone colour', async () => {
    await render(
      themed(
        <GaugeBar
          scale={SCALE}
          bands={[
            { colour: 'green', from: 50, to: 150 },
            { colour: 'yellow', from: 150, to: 180 },
          ]}
          value={160}
          tone="yellow"
          stale={false}
        />,
      ),
    );
    expect(style('gauge-band-green')).toMatchObject({
      left: '25%',
      width: '50%',
      backgroundColor: GREEN,
    });
    expect(style('gauge-band-yellow')).toMatchObject({ left: '75%', width: '15%' });
    expect(style('gauge-pointer')).toMatchObject({ left: '80%', backgroundColor: CAUTION });
    expect(screen.queryByTestId('gauge-redline')).toBeNull();
    expect(screen.queryByTestId('gauge-peak')).toBeNull();
  });

  it('draws the redline and the lean peak as ticks, and no pointer without a value', async () => {
    await render(
      themed(
        <GaugeBar
          scale={{ min: 0, max: 2970, redline: 2700 }}
          bands={[]}
          value={null}
          tone="normal"
          stale={false}
          peak={1485}
        />,
      ),
    );
    expect(style('gauge-redline')).toMatchObject({ left: '90.9%', backgroundColor: WARNING });
    expect(style('gauge-peak')).toMatchObject({ left: '50%', backgroundColor: LEGEND });
    expect(screen.queryByTestId('gauge-pointer')).toBeNull();
  });

  it('dims everything when the values are not current', async () => {
    await render(
      themed(
        <GaugeBar
          scale={SCALE}
          bands={[{ colour: 'red', from: 180, to: 200 }]}
          value={190}
          tone="red"
          stale
        />,
      ),
    );
    expect(style('gauge-pointer').backgroundColor).toBe(DIM);
    expect(style('gauge-band-red').backgroundColor).toBe(DIM);
  });
});

const RPM: GaugeReading = {
  engine: 1,
  id: 'rpm',
  legend: 'RPM',
  value: 2350,
  source: null,
  text: '2,350',
  scale: { min: 0, max: 2970, redline: 2700 },
  bands: [],
  tone: 'normal',
  spoken: 'Engine 1 RPM 2,350',
};

describe('GaugeDial', () => {
  it('is one element spoken as the reading, with its number, legend, needle and redline', async () => {
    await render(themed(<GaugeDial reading={RPM} size={180} stale={false} />));
    expect(screen.getByLabelText('Engine 1 RPM 2,350')).toBeTruthy();
    expect(screen.getByTestId('dial-value-1').props.children).toBe('2,350');
    expect(screen.getByText('RPM')).toBeTruthy();
    expect(screen.getByTestId('dial-needle')).toBeTruthy();
    expect(screen.getByTestId('dial-redline')).toBeTruthy();
  });

  it('draws the bands and colours the number by tone', async () => {
    await render(
      themed(
        <GaugeDial
          reading={{
            ...RPM,
            id: 'trq',
            legend: 'TRQ',
            value: 1900,
            text: '1,900',
            scale: { min: 0, max: 2200, redline: null },
            bands: [
              { colour: 'green', from: 0, to: 1800 },
              { colour: 'red', from: 1800, to: 2000 },
            ],
            tone: 'red',
          }}
          size={120}
          stale={false}
        />,
      ),
    );
    expect(screen.getByTestId('dial-band-green')).toBeTruthy();
    expect(screen.getByTestId('dial-band-red')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('dial-value-1').props.style).color).toBe(WARNING);
  });

  it('draws only the number on a gauge with no scale', async () => {
    await render(
      themed(
        <GaugeDial
          reading={{ ...RPM, id: 'trq', legend: 'TRQ', scale: null, text: '900' }}
          size={120}
          stale
        />,
      ),
    );
    expect(screen.queryByTestId('dial-needle')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('dial-value-1').props.style).color).toBe(DIM);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/domain/engines-dial-geometry.test.ts tests/ui/engines-gauges.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `dial-geometry.ts` and `tone.ts`**

Create `src/features/panels/engines/dial-geometry.ts`:

```ts
/**
 * The engine dial's arc (spec §4.10): 240° clockwise from lower left, through the top, to lower
 * right, the shape of the G1000's and the CGR-30's tach. SVG angles: 0° points right and y grows
 * downwards, so 150° is lower left and 30° (390°) lower right.
 */
export const DIAL_START_DEG = 150;
export const DIAL_SWEEP_DEG = 240;

export interface Point {
  x: number;
  y: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function dialPoint(cx: number, cy: number, r: number, fraction: number): Point {
  const radians = ((DIAL_START_DEG + DIAL_SWEEP_DEG * fraction) * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

/** An SVG path along the dial from `from` to `to` (fractions of the sweep). */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const start = dialPoint(cx, cy, r, from);
  const end = dialPoint(cx, cy, r, to);
  const large = DIAL_SWEEP_DEG * (to - from) > 180 ? 1 : 0;
  return `M ${round(start.x)} ${round(start.y)} A ${r} ${r} 0 ${large} 1 ${round(end.x)} ${round(end.y)}`;
}

/** The arc ends 30° below the centre, so the dial needs three quarters of its width. */
export function dialHeight(size: number): number {
  return Math.round(size * 0.75);
}
```

Create `src/features/panels/engines/tone.ts`:

```ts
import type { MarkingColour } from '@/domain/engines/catalogue';
import type { Tone } from '@/domain/engines/markings';
import type { Theme } from '@/theme/tokens';

/** A pointer's, needle's or number's colour (spec §4.5): white in the normal range, as the G1000. */
export function toneColour(theme: Theme, tone: Tone, stale: boolean): string {
  if (stale) {
    return theme.avionics.legendDim;
  }
  switch (tone) {
    case 'yellow':
      return theme.avionics.caution;
    case 'red':
    case 'redline':
      return theme.avionics.warning;
    case 'normal':
      return theme.avionics.legend;
  }
}

export function bandColour(theme: Theme, colour: MarkingColour, stale: boolean): string {
  if (stale) {
    return theme.avionics.legendDim;
  }
  switch (colour) {
    case 'green':
      return theme.avionics.engaged;
    case 'yellow':
      return theme.avionics.caution;
    case 'red':
      return theme.avionics.warning;
  }
}
```

- [ ] **Step 4: Write `GaugeBar.tsx`**

Create `src/features/panels/engines/GaugeBar.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';

import { type Band, type Scale, type Tone, scaleFraction } from '@/domain/engines/markings';
import { bandColour, toneColour } from '@/features/panels/engines/tone';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const TRACK = 6;
const FRAME = 14;

const makeStyles = (theme: Theme) => ({
  frame: { height: FRAME, justifyContent: 'center' as const },
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: theme.avionics.lightOff,
    overflow: 'hidden' as const,
  },
  band: { position: 'absolute' as const, top: 0, bottom: 0 },
  tick: { position: 'absolute' as const, top: 0, width: 2, height: FRAME, marginLeft: -1 },
  pointer: {
    position: 'absolute' as const,
    top: 0,
    width: 4,
    height: FRAME,
    marginLeft: -2,
    borderRadius: 1,
  },
});

/** A fraction as a style percentage, to one decimal: 0.909 → '90.9%'. */
function percent(fraction: number): `${number}%` {
  return `${Math.round(fraction * 1000) / 10}%`;
}

/**
 * One gauge as a horizontal bar (spec §4.5): the aircraft's bands on a dark track, the redline and
 * the lean-assist peak as ticks, the pointer at the value in its tone. Hidden from accessibility:
 * the cell that holds it speaks the reading.
 */
export function GaugeBar({
  scale,
  bands,
  value,
  tone,
  stale,
  peak = null,
}: {
  scale: Scale;
  bands: readonly Band[];
  value: number | null;
  tone: Tone;
  stale: boolean;
  peak?: number | null;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      testID="gauge-bar"
      style={styles.frame}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.track}>
        {bands.map((band) => {
          const from = scaleFraction(band.from, scale);
          const to = scaleFraction(band.to, scale);
          return (
            <View
              key={band.colour}
              testID={`gauge-band-${band.colour}`}
              style={[
                styles.band,
                {
                  left: percent(from),
                  width: percent(to - from),
                  backgroundColor: bandColour(theme, band.colour, stale),
                },
              ]}
            />
          );
        })}
      </View>
      {scale.redline === null ? null : (
        <View
          testID="gauge-redline"
          style={[
            styles.tick,
            {
              left: percent(scaleFraction(scale.redline, scale)),
              backgroundColor: bandColour(theme, 'red', stale),
            },
          ]}
        />
      )}
      {peak === null ? null : (
        <View
          testID="gauge-peak"
          style={[
            styles.tick,
            {
              left: percent(scaleFraction(peak, scale)),
              backgroundColor: toneColour(theme, 'normal', stale),
            },
          ]}
        />
      )}
      {value === null ? null : (
        <View
          testID="gauge-pointer"
          style={[
            styles.pointer,
            {
              left: percent(scaleFraction(value, scale)),
              backgroundColor: toneColour(theme, tone, stale),
            },
          ]}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 5: Write `GaugeDial.tsx`**

Create `src/features/panels/engines/GaugeDial.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import type { GaugeReading } from '@/domain/engines/engine-page';
import { scaleFraction } from '@/domain/engines/markings';
import { arcPath, dialHeight, dialPoint } from '@/features/panels/engines/dial-geometry';
import { bandColour, toneColour } from '@/features/panels/engines/tone';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  root: { alignItems: 'center' as const },
  value: {
    ...avionicsText(theme, true),
    position: 'absolute' as const,
    left: 0,
    right: 0,
    textAlign: 'center' as const,
  },
  legend: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
    letterSpacing: 1,
  },
});

/**
 * An engine's primary gauge as an arc dial (spec §4.10): the aircraft's bands, a redline tick
 * where there is one, the needle and the number in the reading's tone. Pilots miss "glancing at a
 * needle out of the corner of my eye" on all-digital monitors (research §1). One accessible
 * element, spoken as the reading.
 */
export function GaugeDial({
  reading,
  size,
  stale,
}: {
  reading: GaugeReading;
  size: number;
  stale: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const stroke = Math.max(4, Math.round(size / 18));
  const centre = size / 2;
  const radius = centre - stroke;
  const height = dialHeight(size);
  const { scale } = reading;
  const at = (value: number): number => (scale === null ? 0 : scaleFraction(value, scale));
  const colour = toneColour(theme, reading.tone, stale);
  const fontSize = Math.min(28, Math.max(14, Math.round(size * 0.16)));
  const needle =
    scale !== null && reading.value !== null
      ? dialPoint(centre, centre, radius - stroke, at(reading.value))
      : null;
  const redline = scale?.redline ?? null;

  return (
    <View
      testID={`dial-${reading.engine}`}
      accessible
      accessibilityLabel={reading.spoken}
      style={[styles.root, { width: size }]}
    >
      <View style={{ width: size, height }}>
        <Svg width={size} height={height}>
          <Path
            d={arcPath(centre, centre, radius, 0, 1)}
            stroke={theme.avionics.lightOff}
            strokeWidth={stroke}
            fill="none"
          />
          {scale === null
            ? null
            : reading.bands.map((band) => (
                <Path
                  key={band.colour}
                  testID={`dial-band-${band.colour}`}
                  d={arcPath(centre, centre, radius, at(band.from), at(band.to))}
                  stroke={bandColour(theme, band.colour, stale)}
                  strokeWidth={stroke}
                  fill="none"
                />
              ))}
          {redline === null ? null : (
            <Line
              testID="dial-redline"
              x1={dialPoint(centre, centre, radius - stroke, at(redline)).x}
              y1={dialPoint(centre, centre, radius - stroke, at(redline)).y}
              x2={dialPoint(centre, centre, radius + stroke / 2, at(redline)).x}
              y2={dialPoint(centre, centre, radius + stroke / 2, at(redline)).y}
              stroke={bandColour(theme, 'red', stale)}
              strokeWidth={3}
            />
          )}
          {needle === null ? null : (
            <Line
              testID="dial-needle"
              x1={centre}
              y1={centre}
              x2={needle.x}
              y2={needle.y}
              stroke={colour}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
        </Svg>
        <Text
          testID={`dial-value-${reading.engine}`}
          style={[styles.value, { top: centre + stroke, fontSize, color: colour }]}
        >
          {reading.text}
        </Text>
      </View>
      <Text style={styles.legend}>{reading.legend}</Text>
    </View>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass, then the gate**

Run: `npx jest tests/unit/domain/engines-dial-geometry.test.ts tests/ui/engines-gauges.test.tsx`
Expected: PASS. (If `react-native-svg` host components drop `testID` in Jest, wrap the band paths and the needle in `G` elements carrying the testID instead and say so in the report; the instruments' tests are the precedent to follow.)
Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/features/panels/engines tests/unit/domain/engines-dial-geometry.test.ts tests/ui/engines-gauges.test.tsx
git commit -m "feat(engines): gauge bar and arc dial with the aircraft's bands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The ENGINES page, its preference provider and lean store

**Files:**
- Create: `src/features/panels/engines/engines.ts`, `src/features/panels/engines/engines-preference.ts`, `src/features/panels/engines/lean-store.ts`, `src/features/panels/engines/EnginesPreferenceProvider.tsx`, `src/features/panels/engines/engine-reader.ts`, `src/features/panels/engines/useEnginesModel.ts`, `src/features/panels/engines/EngineTable.tsx`, `src/features/panels/engines/EnginesSection.tsx`, `tests/helpers/engines.ts`
- Test: `tests/unit/application/engines-preference.test.ts`, `tests/unit/application/lean-store.test.ts`, `tests/ui/engines-section.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 (catalogue, `enginesPage`, `EnginesModel`, `EngineReader`, messages, `egtSamples`, `leanAvailable`, `advancePeaks`, `leanDelta`, `Peaks`, `GaugeBar`, `GaugeDial`, `toneColour`). Existing: `usePanel` (`@/features/panels/primitives/PanelContext`), `useUnits` (`@/features/units/UnitsProvider`), `AvionicsUnit` and `AVIONICS_UNIT_PADDING` (`@/features/panels/primitives/AvionicsUnit`), `LightBar`, `BodyText` (`@/theme/primitives`), `bindingOk`, `valueOf`, `aircraftName` (`@/features/panels/systems/availability`), `numberAt` (`@/domain/systems/readouts`), `aircraftKey` (`@/domain/instruments/presentation`), `TWO_COLUMN_MIN_WIDTH` (`@/domain/panels/device-layout`), `EVERYWHERE`, `PanelDescriptor` (`@/domain/panels/panel`), `SettingsStorage` (`@/application/settings-store`).
- Produces:
  - `engines.ts`: `ENGINES_PANEL: PanelDescriptor` (id `engines`, title `Engines`, `ENGINES_FEATURES`, `EVERYWHERE`); `type EnginesPage = 'engines' | 'fuel' | 'elec'`; `ENGINES_PAGES: readonly { id: EnginesPage; legend: string }[]` (ENGINES, FUEL, ELEC); `DEFAULT_ENGINES_PAGE = 'engines'`; `WIDE_MIN_WIDTH`; `MAX_DIAL_SIZE = 180`.
  - `engines-preference.ts`: `ENGINES_STORAGE_KEY = 'avionix.engines'`, `loadEnginesPage(storage)`, `saveEnginesPage(storage, page)`.
  - `lean-store.ts`: `interface LeanState { on: boolean; aircraft: string | null; peaks: Peaks }`, `LEAN_OFF`, `class LeanStore { subscribe; getSnapshot; toggle(aircraft); advance(aircraft, samples) }`.
  - `EnginesPreferenceProvider.tsx`: `EnginesPreferenceProvider({ storage, children })`, `useEnginesPage(): [EnginesPage, (page) => void]`, `useLean(): [LeanState, LeanStore]`.
  - `engine-reader.ts`: `engineReader(snapshot): EngineReader`, `drawnEngines(model): number | null`.
  - `useEnginesModel.ts`: `useEnginesModel(): { reader: EngineReader; model: EnginesModel }`.
  - `EngineTable` props `{ model: EnginesModel; peaks: Peaks | null; stale: boolean; width: number }`; testIDs `engine-dials`, `engine-row-{id}`, `engine-row-lean`, `engine-cell-{id}-{engine}`.
  - `EnginesSection` (no props); testIDs `engines-section`, `engines-lean` (the LEAN key: role `switch`, label `Lean assist`).
  - `tests/helpers/engines.ts`: `enginesCompatibility(base, overrides?)`, `C172_VALUES`, `withEngines(values, count, types)`, `enginesTelemetry(values, receivedAt)`.

- [ ] **Step 1: Write the test helper**

Create `tests/helpers/engines.ts`:

```ts
import type { SessionSnapshot } from '@/application/session-snapshot';
import { type BindingResults, deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import {
  ELECTRICAL,
  ENGINE_CONFIG,
  ENGINES_FEATURES,
  FUEL,
  GAUGES,
  MARKING_NAMES,
  markingName,
} from '@/domain/engines/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';

import { systemsTelemetry } from './systems';

type Status = 'ok' | 'missing' | 'readOnly';

/** Every engines binding resolved ('ok'), unless overridden, derived through the real deriver. */
export function enginesCompatibility(
  base: SessionSnapshot['compatibility'],
  overrides: Partial<Record<string, Status>> = {},
): SessionSnapshot['compatibility'] {
  const bindings: BindingResults = { ...base.bindings };
  for (const feature of GENERIC_PROFILE.features) {
    if (!ENGINES_FEATURES.includes(feature.id)) {
      continue;
    }
    for (const binding of feature.bindings) {
      bindings[binding.name] = {
        name: binding.name,
        kind: binding.kind,
        status: overrides[binding.name] ?? 'ok',
      };
    }
  }
  return { ...base, bindings, features: deriveAvailability(GENERIC_PROFILE, bindings) };
}

const padded = (length: number, ...first: number[]): number[] => [
  ...first,
  ...new Array<number>(length - first.length).fill(0),
];

/**
 * A Cessna 172-like piston single: EGT in °F (its flag 0), ITT and oil temperature in °C, a
 * 2,700 rpm redline, the C172's EGT, CHT, oil pressure and oil temperature bands, two 42 kg wing
 * tanks, one bus and one battery.
 */
export const C172_VALUES: Record<string, DataRefValue> = {
  ...Object.fromEntries(MARKING_NAMES.map((name) => [name, 0])),
  [ENGINE_CONFIG.count]: 1,
  [ENGINE_CONFIG.type]: padded(16, 1),
  [ENGINE_CONFIG.egtIsCelsius]: 0,
  [ENGINE_CONFIG.ittIsCelsius]: 1,
  [ENGINE_CONFIG.oilTempIsCelsius]: 1,
  [ENGINE_CONFIG.engineRedline]: 282.743,
  [ENGINE_CONFIG.propRedline]: 282.743,
  [GAUGES.rpm.name]: padded(16, 2350),
  [GAUGES.prop.name]: padded(16, 2350),
  [GAUGES.n1.name]: padded(16, 0),
  [GAUGES.n2.name]: padded(16, 0),
  [GAUGES.map.name]: padded(16, 24.6),
  [GAUGES.trq.name]: padded(16, 0),
  [GAUGES.epr.name]: padded(16, 0),
  [GAUGES.egt.name]: padded(16, 1320),
  [GAUGES.cht.name]: padded(16, 180),
  [GAUGES.itt.name]: padded(16, 0),
  [GAUGES.ff.name]: padded(16, 0.0105),
  [GAUGES.oilP.name]: padded(16, 62),
  [GAUGES.oilT.name]: padded(16, 82),
  [markingName('green', 'lo', 'EGT')]: 1200,
  [markingName('green', 'hi', 'EGT')]: 1500,
  [markingName('green', 'lo', 'CHT')]: 65,
  [markingName('green', 'hi', 'CHT')]: 230,
  [markingName('red', 'lo', 'CHT')]: 238,
  [markingName('red', 'hi', 'CHT')]: 260,
  [markingName('green', 'lo', 'oilP')]: 50,
  [markingName('green', 'hi', 'oilP')]: 90,
  [markingName('red', 'lo', 'oilP')]: 0,
  [markingName('red', 'hi', 'oilP')]: 20,
  [markingName('green', 'lo', 'oilT')]: 38,
  [markingName('green', 'hi', 'oilT')]: 118,
  [FUEL.perTank]: padded(9, 42, 42),
  [FUEL.total]: 84,
  [FUEL.ratio]: padded(9, 0.5, 0.5),
  [FUEL.count]: 9,
  [FUEL.capacity]: 370,
  [FUEL.side]: padded(9, -10, 10),
  [FUEL.used]: 12,
  [ELECTRICAL.busCount]: 1,
  [ELECTRICAL.batteryCount]: 1,
  [ELECTRICAL.busVolts]: padded(6, 28.1),
  [ELECTRICAL.busAmps]: padded(6, 12),
  [ELECTRICAL.batteryVolts]: padded(8, 24.3),
  [ELECTRICAL.batteryAmps]: padded(8, -4),
  [ELECTRICAL.generatorAmps]: padded(8, 30),
};

/** The same aircraft with `count` engines of the given types (one entry per engine). */
export function withEngines(
  values: Record<string, DataRefValue>,
  count: number,
  types: readonly number[],
): Record<string, DataRefValue> {
  const perEngine = (name: string, value: number) => [name, padded(16, ...types.map(() => value))];
  return {
    ...values,
    [ENGINE_CONFIG.count]: count,
    [ENGINE_CONFIG.type]: padded(16, ...types),
    ...Object.fromEntries([
      perEngine(GAUGES.rpm.name, 2350),
      perEngine(GAUGES.egt.name, 1320),
      perEngine(GAUGES.ff.name, 0.0105),
      perEngine(GAUGES.n1.name, 85),
      perEngine(GAUGES.trq.name, 1500),
    ]),
  };
}

export const enginesTelemetry = systemsTelemetry;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/application/engines-preference.test.ts`:

```ts
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  ENGINES_STORAGE_KEY,
  loadEnginesPage,
  saveEnginesPage,
} from '@/features/panels/engines/engines-preference';

describe('the remembered Engines page (spec §4.10)', () => {
  it('starts on ENGINES and remembers a choice', async () => {
    const storage = createMemorySettingsStorage();
    expect(await loadEnginesPage(storage)).toBe('engines');
    await saveEnginesPage(storage, 'fuel');
    expect(await storage.getItem(ENGINES_STORAGE_KEY)).toBe('{"page":"fuel"}');
    expect(await loadEnginesPage(storage)).toBe('fuel');
  });

  it('falls back to ENGINES on anything unreadable', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(ENGINES_STORAGE_KEY, '{"page":"cabin"}');
    expect(await loadEnginesPage(storage)).toBe('engines');
    await storage.setItem(ENGINES_STORAGE_KEY, 'not json');
    expect(await loadEnginesPage(storage)).toBe('engines');
  });
});
```

Create `tests/unit/application/lean-store.test.ts`:

```ts
import { LEAN_OFF, LeanStore } from '@/features/panels/engines/lean-store';

describe('LeanStore (spec §4.6)', () => {
  it('turns on for an aircraft with no peaks, and off clearing them', () => {
    const store = new LeanStore();
    expect(store.getSnapshot()).toBe(LEAN_OFF);
    store.toggle('C172');
    expect(store.getSnapshot()).toEqual({ on: true, aircraft: 'C172', peaks: {} });
    store.advance('C172', [{ engine: 1, value: 1320 }]);
    store.toggle('C172');
    expect(store.getSnapshot()).toBe(LEAN_OFF);
  });

  it('raises peaks while on, ignores samples while off, and notifies only on a change', () => {
    const store = new LeanStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.advance('C172', [{ engine: 1, value: 1320 }]);
    expect(listener).not.toHaveBeenCalled();
    store.toggle('C172');
    store.advance('C172', [{ engine: 1, value: 1320 }]);
    store.advance('C172', [{ engine: 1, value: 1300 }]);
    expect(store.getSnapshot().peaks).toEqual({ 1: 1320 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('starts fresh for a different aircraft (Review Focus 4)', () => {
    const store = new LeanStore();
    store.toggle('C172');
    store.advance('C172', [{ engine: 1, value: 1350 }]);
    store.advance('PA28', [{ engine: 1, value: 1300 }]);
    expect(store.getSnapshot()).toEqual({ on: true, aircraft: 'PA28', peaks: { 1: 1300 } });
  });

  it('stops notifying an unsubscribed listener', () => {
    const store = new LeanStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.toggle(null);
    expect(listener).not.toHaveBeenCalled();
  });
});
```

Create `tests/ui/engines-section.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { ENGINE_CONFIG, GAUGES } from '@/domain/engines/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';
import { EnginesPreferenceProvider } from '@/features/panels/engines/EnginesPreferenceProvider';
import { EnginesSection } from '@/features/panels/engines/EnginesSection';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

import { C172_VALUES, enginesCompatibility, enginesTelemetry, withEngines } from '../helpers/engines';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const WARNING = '#ff4a3d';
const DIM = '#8b949e';

function snapshot(
  values: Record<string, DataRefValue> = C172_VALUES,
  missing: readonly string[] = [],
  identity: { description: string; icaoType: string } = {
    description: 'Cessna 172',
    icaoType: 'C172',
  },
  heartbeatAt = NOW,
): SessionSnapshot {
  const compatibility = enginesCompatibility(
    base.compatibility,
    Object.fromEntries(missing.map((name) => [name, 'missing' as const])),
  );
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: heartbeatAt },
    telemetry: enginesTelemetry(values, NOW),
    compatibility: {
      ...compatibility,
      identity: { ...base.compatibility.identity, ...identity },
      identified: true,
    },
  };
}

const actions: PanelScopeActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

function tree(snap: SessionSnapshot, storage: SettingsStorage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <EnginesPreferenceProvider storage={storage}>
          <PanelScope snapshot={snap} now={NOW} actions={actions}>
            <EnginesSection />
          </PanelScope>
        </EnginesPreferenceProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const cellText = (id: string, engine = 1): unknown =>
  within(screen.getByTestId(`engine-cell-${id}-${engine}`)).getAllByText(/./)[0]?.props.children;

describe('the ENGINES page (spec §4.2–§4.6)', () => {
  it('draws a C172: an RPM dial and the piston rows with their units', async () => {
    await render(tree(snapshot()));
    expect(screen.getByLabelText('Engine 1 RPM 2,350')).toBeTruthy();
    for (const label of ['MAP IN', 'FF KG/H', 'EGT °C', 'CHT °C', 'OIL P PSI', 'OIL T °C']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(cellText('egt')).toBe('716');
    expect(screen.getByLabelText('Engine 1 EGT 716 degrees Celsius')).toBeTruthy();
    expect(screen.queryByTestId('engine-row-epr')).toBeNull();
  });

  it('draws a turboprop twin: two TRQ dials and an NG row', async () => {
    await render(tree(snapshot(withEngines(C172_VALUES, 2, [9, 9]))));
    expect(within(screen.getByTestId('engine-dials')).getAllByText('TRQ')).toHaveLength(2);
    expect(screen.getByText('NG %')).toBeTruthy();
    expect(screen.getByTestId('engine-cell-itt-2')).toBeTruthy();
  });

  it('says engines 5 and up are not shown, and names an unsupported type', async () => {
    await render(tree(snapshot(withEngines(C172_VALUES, 6, [7, 7, 7, 6, 7, 7]))));
    expect(screen.getByText("Engines 5 and up aren't shown.")).toBeTruthy();
    expect(screen.getByText("Engine 4's type isn't supported.")).toBeTruthy();
  });

  it('names the gauges the aircraft does not publish, and draws the rest (R6)', async () => {
    await render(tree(snapshot(C172_VALUES, [GAUGES.cht.name])));
    expect(screen.getByText('Not available on the Cessna 172: CHT.')).toBeTruthy();
    expect(screen.queryByTestId('engine-row-cht')).toBeNull();
    expect(screen.getByTestId('engine-row-egt')).toBeTruthy();
  });

  it('says the engines could not be identified without the count, and nothing else', async () => {
    await render(tree(snapshot(C172_VALUES, [ENGINE_CONFIG.count])));
    expect(screen.getByText("The engines on the Cessna 172 couldn't be identified.")).toBeTruthy();
    expect(screen.queryByTestId('engine-dials')).toBeNull();
    expect(screen.queryByLabelText('Lean assist')).toBeNull();
  });

  it('says a glider has no engines (Review Focus 1)', async () => {
    await render(tree(snapshot({ ...C172_VALUES, [ENGINE_CONFIG.count]: 0 })));
    expect(screen.getByText('The Cessna 172 has no engines.')).toBeTruthy();
    expect(screen.queryByLabelText('Lean assist')).toBeNull();
  });

  it('says when the aircraft does not publish a temperature unit', async () => {
    await render(tree(snapshot(C172_VALUES, [ENGINE_CONFIG.egtIsCelsius])));
    expect(
      screen.getByText("The Cessna 172 doesn't say which unit its EGT uses; shown as reported."),
    ).toBeTruthy();
    expect(screen.getByText('EGT °')).toBeTruthy();
  });

  it('colours a value in a red band, and dims every value when not current', async () => {
    const hot = { ...C172_VALUES, [GAUGES.cht.name]: [250, ...new Array<number>(15).fill(0)] };
    const view = await render(tree(snapshot(hot)));
    const chtText = within(screen.getByTestId('engine-cell-cht-1')).getByText('250');
    expect(StyleSheet.flatten(chtText.props.style).color).toBe(WARNING);
    await view.rerender(tree(snapshot(hot, [], undefined, NOW - 10_000)));
    const dimmed = within(screen.getByTestId('engine-cell-cht-1')).getByText('250');
    expect(StyleSheet.flatten(dimmed.props.style).color).toBe(DIM);
  });

  it('speaks an unused cell on a mixed twin', async () => {
    await render(tree(snapshot(withEngines(C172_VALUES, 2, [1, 5]))));
    expect(screen.getByLabelText('manifold pressure, not used on engine 2')).toBeTruthy();
  });
});

describe('lean assist (spec §4.6)', () => {
  it('marks the peak and shows ΔPEAK while on, and clears it when off', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(tree(snapshot(), storage));
    const key = screen.getByLabelText('Lean assist');
    expect(key.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(key);
    expect(screen.getByLabelText('Lean assist').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByText('ΔPEAK °C')).toBeTruthy();
    expect(screen.getByLabelText('Engine 1 at peak EGT')).toBeTruthy();
    expect(within(screen.getByTestId('engine-cell-egt-1')).getByTestId('gauge-peak')).toBeTruthy();

    // 20 °F below the 1,320 °F peak is 11 °C below it.
    const leaner = { ...C172_VALUES, [GAUGES.egt.name]: [1300, ...new Array<number>(15).fill(0)] };
    await view.rerender(tree(snapshot(leaner), storage));
    expect(screen.getByLabelText('Engine 1 11 degrees below peak EGT')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Lean assist'));
    expect(screen.queryByTestId('engine-row-lean')).toBeNull();
  });

  it('does not show one aircraft’s peak against another’s EGT (Review Focus 4)', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(tree(snapshot(), storage));
    await fireEvent.press(screen.getByLabelText('Lean assist'));
    const other = { ...C172_VALUES, [GAUGES.egt.name]: [1300, ...new Array<number>(15).fill(0)] };
    await view.rerender(
      tree(snapshot(other, [], { description: 'Piper Archer', icaoType: 'P28A' }), storage),
    );
    expect(screen.getByLabelText('Engine 1 at peak EGT')).toBeTruthy();
    expect(screen.queryByLabelText(/below peak EGT/)).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx jest tests/unit/application/engines-preference.test.ts tests/unit/application/lean-store.test.ts tests/ui/engines-section.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write the descriptor, the preference and the lean store**

Create `src/features/panels/engines/engines.ts`:

```ts
import { ENGINES_FEATURES } from '@/domain/engines/catalogue';
import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';

/** Descriptor id `engines`, the four read-only features, every device and orientation (§4.11). */
export const ENGINES_PANEL: PanelDescriptor = {
  id: 'engines',
  title: 'Engines',
  features: ENGINES_FEATURES,
  supports: EVERYWHERE,
};

export type EnginesPage = 'engines' | 'fuel' | 'elec';

/** The phone's page keys, in order (spec §4.10). */
export const ENGINES_PAGES: readonly { id: EnginesPage; legend: string }[] = [
  { id: 'engines', legend: 'ENGINES' },
  { id: 'fuel', legend: 'FUEL' },
  { id: 'elec', legend: 'ELEC' },
];

export const DEFAULT_ENGINES_PAGE: EnginesPage = 'engines';

/** Spec §4.10's wide layout threshold: the breakpoint Systems, the CDU and Navigation use. */
export const WIDE_MIN_WIDTH = TWO_COLUMN_MIN_WIDTH;

/** A dial never grows past this, however few engines share the row. */
export const MAX_DIAL_SIZE = 180;
```

Create `src/features/panels/engines/engines-preference.ts`:

```ts
import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import { DEFAULT_ENGINES_PAGE, type EnginesPage } from '@/features/panels/engines/engines';

export const ENGINES_STORAGE_KEY = 'avionix.engines';

const storedSchema = z.object({ page: z.enum(['engines', 'fuel', 'elec']) });

/** Which page the panel shows on this device (spec §4.10). Best effort: anything unreadable is ENGINES. */
export async function loadEnginesPage(storage: SettingsStorage): Promise<EnginesPage> {
  try {
    const raw = await storage.getItem(ENGINES_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_ENGINES_PAGE;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.page : DEFAULT_ENGINES_PAGE;
  } catch {
    return DEFAULT_ENGINES_PAGE;
  }
}

export async function saveEnginesPage(storage: SettingsStorage, page: EnginesPage): Promise<void> {
  try {
    await storage.setItem(ENGINES_STORAGE_KEY, JSON.stringify({ page }));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
```

Create `src/features/panels/engines/lean-store.ts`:

```ts
import { type EgtSample, type Peaks, advancePeaks } from '@/domain/engines/lean';

export interface LeanState {
  on: boolean;
  /** The aircraft the peaks belong to (`aircraftKey`), so another aircraft starts fresh. */
  aircraft: string | null;
  peaks: Peaks;
}

export const LEAN_OFF: LeanState = { on: false, aircraft: null, peaks: {} };

/**
 * Lean assist's state for the session (spec §4.6): in memory, never persisted, held by the panel's
 * provider so a panel switch keeps the peaks. An external store rather than React state: the
 * section advances it from an effect as EGT arrives, which is how a component feeds a value from
 * outside React (`useSyncExternalStore`) without setting state in an effect.
 */
export class LeanStore {
  private state: LeanState = LEAN_OFF;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): LeanState => this.state;

  toggle(aircraft: string | null): void {
    this.set(this.state.on ? LEAN_OFF : { on: true, aircraft, peaks: {} });
  }

  advance(aircraft: string | null, samples: readonly EgtSample[]): void {
    if (!this.state.on) {
      return;
    }
    const sameAircraft = aircraft === this.state.aircraft;
    const peaks = advancePeaks(sameAircraft ? this.state.peaks : {}, samples);
    if (sameAircraft && peaks === this.state.peaks) {
      return;
    }
    this.set({ on: true, aircraft, peaks });
  }

  private set(next: LeanState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
```

Create `src/features/panels/engines/EnginesPreferenceProvider.tsx`:

```tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { SettingsStorage } from '@/application/settings-store';
import { DEFAULT_ENGINES_PAGE, type EnginesPage } from '@/features/panels/engines/engines';
import { loadEnginesPage, saveEnginesPage } from '@/features/panels/engines/engines-preference';
import { type LeanState, LeanStore } from '@/features/panels/engines/lean-store';

type EnginesPageValue = [EnginesPage, (page: EnginesPage) => void];

const EnginesPageContext = createContext<EnginesPageValue | null>(null);
const LeanStoreContext = createContext<LeanStore | null>(null);

/**
 * The remembered Engines page (spec §4.10) and the session's lean-assist store (§4.6). Same load
 * rule as the Systems page: a real change made before the stored value arrives wins over it.
 */
export function EnginesPreferenceProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [page, setPageState] = useState<EnginesPage>(DEFAULT_ENGINES_PAGE);
  const [leanStore] = useState(() => new LeanStore());
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadEnginesPage(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      if (!touched.current) {
        setPageState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPage = useCallback(
    (next: EnginesPage) => {
      touched.current = true;
      setPageState(next);
      void saveEnginesPage(storage, next);
    },
    [storage],
  );

  const value = useMemo<EnginesPageValue>(() => [page, setPage], [page, setPage]);

  return (
    <EnginesPageContext.Provider value={value}>
      <LeanStoreContext.Provider value={leanStore}>{children}</LeanStoreContext.Provider>
    </EnginesPageContext.Provider>
  );
}

/** The remembered page and its setter; without a provider (the guards), local state on ENGINES. */
export function useEnginesPage(): EnginesPageValue {
  const value = useContext(EnginesPageContext);
  const [local, setLocal] = useState<EnginesPage>(DEFAULT_ENGINES_PAGE);
  return value ?? [local, setLocal];
}

/** Lean assist's state and its store; without a provider, a store local to the caller. */
export function useLean(): [LeanState, LeanStore] {
  const shared = useContext(LeanStoreContext);
  const [local] = useState(() => new LeanStore());
  const store = shared ?? local;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return [state, store];
}
```

- [ ] **Step 5: Write the reader, the model hook, the table and the section**

Create `src/features/panels/engines/engine-reader.ts`:

```ts
import type { SessionSnapshot } from '@/application/session-snapshot';
import type { EngineReader, EnginesModel } from '@/domain/engines/engine-page';
import { numberAt } from '@/domain/systems/readouts';
import { bindingOk, valueOf } from '@/features/panels/systems/availability';

/** The session snapshot as the engines domain reads it: resolution from F-03, numbers from telemetry. */
export function engineReader(snapshot: SessionSnapshot): EngineReader {
  return {
    has: (name) => bindingOk(snapshot, name),
    number: (name, index = 0) => numberAt(valueOf(snapshot, name), index),
  };
}

/** The engines FUEL and ELEC count: the drawn columns, 0 for a glider, null while unknown. */
export function drawnEngines(model: EnginesModel): number | null {
  if (model.status === 'ready') {
    return model.columns.length;
  }
  return model.status === 'none' ? 0 : null;
}
```

Create `src/features/panels/engines/useEnginesModel.ts`:

```ts
import { useMemo } from 'react';

import { type EngineReader, type EnginesModel, enginesPage } from '@/domain/engines/engine-page';
import { engineReader } from '@/features/panels/engines/engine-reader';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useUnits } from '@/features/units/UnitsProvider';

/** The ENGINES model for the panel's snapshot and the pilot's units, rebuilt when either changes. */
export function useEnginesModel(): { reader: EngineReader; model: EnginesModel } {
  const { snapshot } = usePanel();
  const { units } = useUnits();
  return useMemo(() => {
    const reader = engineReader(snapshot);
    return { reader, model: enginesPage(reader, units) };
  }, [snapshot, units]);
}
```

Create `src/features/panels/engines/EngineTable.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import { GAUGES, type GaugeId } from '@/domain/engines/catalogue';
import type { EnginesModel, GaugeReading } from '@/domain/engines/engine-page';
import { type Peaks, leanDelta } from '@/domain/engines/lean';
import { MAX_DIAL_SIZE } from '@/features/panels/engines/engines';
import { GaugeBar } from '@/features/panels/engines/GaugeBar';
import { GaugeDial } from '@/features/panels/engines/GaugeDial';
import { toneColour } from '@/features/panels/engines/tone';
import { useUnits } from '@/features/units/UnitsProvider';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

const GAP = 8;
const LABEL_WIDTH = 72;
const MIN_DIAL = 64;

const makeStyles = (theme: Theme) => ({
  root: { gap: GAP },
  dials: { flexDirection: 'row' as const, justifyContent: 'space-around' as const, gap: GAP },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: GAP },
  label: {
    ...avionicsText(theme, true),
    width: LABEL_WIDTH,
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
    letterSpacing: 0.5,
  },
  cell: { flex: 1, gap: 2 },
  value: { ...numeric(theme, true), fontSize: 18 },
});

function GaugeCell({
  reading,
  id,
  engine,
  stale,
  peak,
}: {
  reading: GaugeReading | undefined;
  id: GaugeId;
  engine: number;
  stale: boolean;
  peak: number | null;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (reading === undefined) {
    return (
      <View
        style={styles.cell}
        accessible
        accessibilityLabel={`${GAUGES[id].spoken}, not used on engine ${engine}`}
      />
    );
  }
  return (
    <View
      testID={`engine-cell-${id}-${engine}`}
      style={styles.cell}
      accessible
      accessibilityLabel={reading.spoken}
    >
      <Text style={[styles.value, { color: toneColour(theme, reading.tone, stale) }]}>
        {reading.text}
      </Text>
      {reading.scale === null ? null : (
        <GaugeBar
          scale={reading.scale}
          bands={reading.bands}
          value={reading.value}
          tone={reading.tone}
          stale={stale}
          peak={peak}
        />
      )}
    </View>
  );
}

/** ΔPEAK under EGT while lean assist is on (spec §4.6). */
function LeanRow({
  model,
  peaks,
  unitLabel,
  stale,
}: {
  model: EnginesModel;
  peaks: Peaks;
  unitLabel: string;
  stale: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { units } = useUnits();
  return (
    <View testID="engine-row-lean" style={styles.row}>
      <Text style={styles.label}>{`ΔPEAK ${unitLabel}`.trim()}</Text>
      {model.columns.map((column) => {
        const egt = column.cells.egt;
        if (column.kind !== 'piston' || egt === undefined) {
          return <View key={column.engine} style={styles.cell} />;
        }
        const delta = leanDelta(egt, peaks[column.engine], units);
        return (
          <View key={column.engine} style={styles.cell} accessible accessibilityLabel={delta.spoken}>
            <Text style={[styles.value, { color: toneColour(theme, 'normal', stale) }]}>
              {delta.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The ENGINES page's body (spec §4.10): a row of dials, one per engine, sized to share `width`
 * (at most 180 dp), then one row per gauge with its legend and unit once and a cell per engine.
 * `peaks` is non-null while lean assist is on.
 */
export function EngineTable({
  model,
  peaks,
  stale,
  width,
}: {
  model: EnginesModel;
  peaks: Peaks | null;
  stale: boolean;
  width: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const count = Math.max(1, model.columns.length);
  const dialSize = Math.max(
    MIN_DIAL,
    Math.min(MAX_DIAL_SIZE, Math.floor((width - GAP * (count - 1)) / count)),
  );
  const dials = model.columns.some((column) => column.dial !== null);
  return (
    <View style={styles.root}>
      {dials ? (
        <View testID="engine-dials" style={styles.dials}>
          {model.columns.map((column) =>
            column.dial === null ? (
              <View key={column.engine} style={{ width: dialSize }} />
            ) : (
              <GaugeDial key={column.engine} reading={column.dial} size={dialSize} stale={stale} />
            ),
          )}
        </View>
      ) : null}
      {model.rows.map((row) => (
        <React.Fragment key={row.id}>
          <View testID={`engine-row-${row.id}`} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            {model.columns.map((column) => (
              <GaugeCell
                key={column.engine}
                reading={column.cells[row.id]}
                id={row.id}
                engine={column.engine}
                stale={stale}
                peak={row.id === 'egt' && peaks !== null ? (peaks[column.engine] ?? null) : null}
              />
            ))}
          </View>
          {row.id === 'egt' && peaks !== null ? (
            <LeanRow
              model={model}
              peaks={peaks}
              unitLabel={row.label.slice('EGT'.length)}
              stale={stale}
            />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}
```

Create `src/features/panels/engines/EnginesSection.tsx`:

```tsx
import React, { useEffect } from 'react';
import { Pressable, Text, useWindowDimensions } from 'react-native';

import { GAUGES } from '@/domain/engines/catalogue';
import { egtSamples, leanAvailable } from '@/domain/engines/lean';
import {
  ENGINES_NOT_SHOWN,
  engineUnsupported,
  enginesUnidentified,
  gaugesMissing,
  noEngines,
  unitsUnknown,
} from '@/domain/engines/messages';
import { aircraftKey } from '@/domain/instruments/presentation';
import { EngineTable } from '@/features/panels/engines/EngineTable';
import { useLean } from '@/features/panels/engines/EnginesPreferenceProvider';
import { useEnginesModel } from '@/features/panels/engines/useEnginesModel';
import { AVIONICS_UNIT_PADDING, AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { LightBar } from '@/features/panels/primitives/LightBar';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { aircraftName } from '@/features/panels/systems/availability';
import { BodyText } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  key: {
    backgroundColor: theme.avionics.keyFace,
    borderWidth: 1,
    borderColor: theme.avionics.bezelEdge,
    borderRadius: 6,
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 6,
    marginLeft: 'auto' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  legend: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.legendSize,
    color: theme.avionics.legend,
  },
});

/** LEAN (spec §4.6): a local display mode, so a plain key, not a ControlButton; it writes nothing. */
function LeanKey({ on, onPress }: { on: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="engines-lean"
      accessibilityRole="switch"
      accessibilityLabel="Lean assist"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={styles.key}
    >
      <LightBar state={on ? 'engaged' : 'off'} />
      <Text style={styles.legend}>LEAN</Text>
    </Pressable>
  );
}

/**
 * The ENGINES page (spec §4.2–§4.6): the dials and the gauge table, or the one sentence that says
 * why there are none, then the lines naming what the aircraft does not publish. While lean assist
 * is on, each piston engine's peak EGT advances from an effect as values arrive; the peaks belong
 * to one aircraft, and another aircraft's EGT is never compared with them (Review Focus 4).
 */
export function EnginesSection() {
  const theme = useTheme();
  const window = useWindowDimensions();
  const { snapshot, link } = usePanel();
  const { model } = useEnginesModel();
  const [lean, store] = useLean();
  const aircraft = aircraftKey(snapshot.compatibility.identity);
  const available = leanAvailable(model);

  useEffect(() => {
    if (lean.on) {
      store.advance(aircraft, egtSamples(model));
    }
  }, [lean.on, store, aircraft, model]);

  const peaks = lean.on && available ? (lean.aircraft === aircraft ? lean.peaks : {}) : null;
  const name = aircraftName(snapshot);
  const width = window.width - 2 * theme.spacing.lg - 2 * AVIONICS_UNIT_PADDING;

  return (
    <AvionicsUnit
      testID="engines-section"
      label="ENGINES"
      labelAccessory={
        available ? <LeanKey on={lean.on} onPress={() => store.toggle(aircraft)} /> : undefined
      }
    >
      {model.status === 'unidentified' ? <BodyText>{enginesUnidentified(name)}</BodyText> : null}
      {model.status === 'none' ? <BodyText>{noEngines(name)}</BodyText> : null}
      {model.status === 'ready' ? (
        <EngineTable model={model} peaks={peaks} stale={!link.valuesCurrent} width={width} />
      ) : null}
      {model.unsupported.map((engine) => (
        <BodyText key={engine} muted>
          {engineUnsupported(engine)}
        </BodyText>
      ))}
      {model.hidden > 0 ? <BodyText muted>{ENGINES_NOT_SHOWN}</BodyText> : null}
      {model.missing.length > 0 ? (
        <BodyText muted>{gaugesMissing(name, model.missing)}</BodyText>
      ) : null}
      {model.unknownUnits.length > 0 ? (
        <BodyText muted>
          {unitsUnknown(
            name,
            model.unknownUnits.map((id) => GAUGES[id].spoken),
          )}
        </BodyText>
      ) : null}
    </AvionicsUnit>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass, then the gate**

Run: `npx jest tests/unit/application/engines-preference.test.ts tests/unit/application/lean-store.test.ts tests/ui/engines-section.test.tsx`
Expected: PASS. In the lean tests the peak is set by the effect after the press, so the `ΔPEAK` assertions follow an awaited `fireEvent`; if the effect's store update lands after the assertion in this RNTL version, wrap the assertion in `await waitFor(...)` and say so in the report.
Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/features/panels/engines tests/helpers/engines.ts tests/unit/application/engines-preference.test.ts tests/unit/application/lean-store.test.ts tests/ui/engines-section.test.tsx
git commit -m "feat(engines): ENGINES page with dials, gauge table and lean assist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 6: The FUEL and ELEC pages

**Files:**
- Create: `src/features/panels/engines/FuelSection.tsx`, `src/features/panels/engines/ElectricalSection.tsx`
- Test: `tests/ui/engines-fuel-electrical.test.tsx`

**Interfaces:**
- Consumes: `fuelPage`, `FuelModel` (Task 3), `electricalPage`, `PowerRow` (Task 3), `gaugesMissing`, `tanksUnavailable` (Task 2), `useEnginesModel`, `drawnEngines` (Task 5), `GaugeBar` (Task 4), `Scale` (Task 2); existing `usePanel`, `useUnits`, `AvionicsUnit`, `aircraftName`, `BodyText`.
- Produces: `FuelSection` and `ElectricalSection` (no props). testIDs: `fuel-section`, `fuel-tank-{slot}`, `fuel-total`, `fuel-flow`, `fuel-used`, `fuel-endurance`; `electrical-section`, `elec-{row.key}` (`elec-bus-1`, `elec-batt-1`, `elec-gen-1`). Every row is one accessible element spoken as its model's `spoken`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/engines-fuel-electrical.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { UNITS_STORAGE_KEY } from '@/application/unit-preferences';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { ENGINE_CONFIG, FUEL } from '@/domain/engines/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';
import { DEFAULT_UNITS } from '@/domain/units/units';
import { ElectricalSection } from '@/features/panels/engines/ElectricalSection';
import { FuelSection } from '@/features/panels/engines/FuelSection';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

import { C172_VALUES, enginesCompatibility, enginesTelemetry } from '../helpers/engines';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const DIM = '#8b949e';

function snapshot(
  values: Record<string, DataRefValue> = C172_VALUES,
  missing: readonly string[] = [],
  heartbeatAt = NOW,
): SessionSnapshot {
  const compatibility = enginesCompatibility(
    base.compatibility,
    Object.fromEntries(missing.map((name) => [name, 'missing' as const])),
  );
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: heartbeatAt },
    telemetry: enginesTelemetry(values, NOW),
    compatibility: {
      ...compatibility,
      identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
      identified: true,
    },
  };
}

const actions: PanelScopeActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

function tree(snap: SessionSnapshot, storage: SettingsStorage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PanelScope snapshot={snap} now={NOW} actions={actions}>
          <FuelSection />
          <ElectricalSection />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const rowTexts = (testID: string): unknown[] =>
  within(screen.getByTestId(testID))
    .getAllByText(/./)
    .map((text) => text.props.children);

describe('the FUEL page (spec §4.7)', () => {
  it('lists the used tanks by side, then the totalizer', async () => {
    await render(tree(snapshot()));
    expect(screen.getByText('FUEL KG')).toBeTruthy();
    expect(rowTexts('fuel-tank-0')).toEqual(['LEFT', '42']);
    expect(rowTexts('fuel-tank-1')).toEqual(['RIGHT', '42']);
    expect(screen.queryByTestId('fuel-tank-2')).toBeNull();
    expect(within(screen.getByTestId('fuel-tank-0')).getByTestId('gauge-pointer')).toBeTruthy();
    expect(screen.getByLabelText('Left tank, 42 kilograms')).toBeTruthy();
    expect(rowTexts('fuel-total')).toEqual(['TOTAL', '84']);
    expect(rowTexts('fuel-flow')).toEqual(['FLOW KG/H', '37.8']);
    expect(rowTexts('fuel-used')).toEqual(['USED', '12']);
    expect(rowTexts('fuel-endurance')).toEqual(['ENDURANCE', '2:13']);
    expect(screen.getByLabelText('Endurance 2 hours 13 minutes')).toBeTruthy();
  });

  it('switches to pounds with the pilot unit', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(UNITS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_UNITS, fuel: 'lb' }));
    await render(tree(snapshot(), storage));
    expect(await screen.findByText('FUEL LB')).toBeTruthy();
    expect(rowTexts('fuel-total')).toEqual(['TOTAL', '185']);
    expect(rowTexts('fuel-flow')).toEqual(['FLOW LB/H', '83.3']);
  });

  it('says when tanks are not available, and names totalizer rows that are not', async () => {
    await render(tree(snapshot(C172_VALUES, [FUEL.perTank, FUEL.used])));
    expect(screen.getByText("Fuel tanks aren't available on the Cessna 172.")).toBeTruthy();
    expect(screen.getByText('Not available on the Cessna 172: USED.')).toBeTruthy();
    expect(screen.queryByTestId('fuel-used')).toBeNull();
  });

  it('mutes the numbers when the values are not current', async () => {
    await render(tree(snapshot(C172_VALUES, [], NOW - 10_000)));
    const total = within(screen.getByTestId('fuel-total')).getByText('84');
    expect(StyleSheet.flatten(total.props.style).color).toBe(DIM);
  });
});

describe('the ELEC page (spec §4.8)', () => {
  it('lists the bus, the battery and one generator per engine', async () => {
    await render(tree(snapshot()));
    expect(rowTexts('elec-bus-1')).toEqual(['BUS 1', '28.1 V', '12 A']);
    expect(rowTexts('elec-batt-1')).toEqual(['BATT 1', '24.3 V', '−4 A']);
    expect(rowTexts('elec-gen-1')).toEqual(['GEN 1', '30 A']);
    expect(screen.getByLabelText('Battery 1, 24.3 volts, minus 4 amps')).toBeTruthy();
  });

  it('has no generator on a glider (Review Focus 1)', async () => {
    await render(tree(snapshot({ ...C172_VALUES, [ENGINE_CONFIG.count]: 0 })));
    expect(screen.queryByTestId('elec-gen-1')).toBeNull();
    expect(screen.getByTestId('elec-bus-1')).toBeTruthy();
    expect(rowTexts('fuel-flow')).toEqual(['FLOW KG/H', '—']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/ui/engines-fuel-electrical.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the two sections**

Create `src/features/panels/engines/FuelSection.tsx`:

```tsx
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { fuelPage } from '@/domain/engines/fuel';
import type { Scale } from '@/domain/engines/markings';
import { gaugesMissing, tanksUnavailable } from '@/domain/engines/messages';
import { drawnEngines } from '@/features/panels/engines/engine-reader';
import { GaugeBar } from '@/features/panels/engines/GaugeBar';
import { useEnginesModel } from '@/features/panels/engines/useEnginesModel';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { aircraftName } from '@/features/panels/systems/availability';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

/** A tank's level as a bar: its quantity over its capacity. */
const LEVEL: Scale = { min: 0, max: 1, redline: null };

export const makeReadoutStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    minHeight: 28,
  },
  label: {
    ...avionicsText(theme, true),
    width: 96,
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
    letterSpacing: 0.5,
  },
  value: {
    ...numeric(theme, true),
    minWidth: 72,
    fontSize: 18,
    textAlign: 'right' as const,
    color: theme.avionics.legend,
  },
  stale: { color: theme.avionics.legendDim },
  bar: { flex: 1 },
  divider: { height: 1, backgroundColor: theme.avionics.bezelEdge },
});

function FuelRow({
  testID,
  label,
  text,
  spoken,
  stale,
  fraction = null,
}: {
  testID: string;
  label: string;
  text: string;
  spoken: string;
  stale: boolean;
  fraction?: number | null;
}) {
  const styles = useThemedStyles(makeReadoutStyles);
  return (
    <View testID={testID} style={styles.row} accessible accessibilityLabel={spoken}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, stale ? styles.stale : null]}>{text}</Text>
      <View style={styles.bar}>
        {fraction === null ? null : (
          <GaugeBar scale={LEVEL} bands={[]} value={fraction} tone="normal" stale={stale} />
        )}
      </View>
    </View>
  );
}

/** The FUEL page (spec §4.7): each used tank with its level, then the totalizer. */
export function FuelSection() {
  const styles = useThemedStyles(makeReadoutStyles);
  const { snapshot, link } = usePanel();
  const { units } = useUnits();
  const { reader, model } = useEnginesModel();
  const fuel = useMemo(
    () => fuelPage(reader, units, drawnEngines(model)),
    [reader, units, model],
  );
  const stale = !link.valuesCurrent;
  const name = aircraftName(snapshot);
  return (
    <AvionicsUnit testID="fuel-section" label={`FUEL ${fuel.unit}`}>
      {fuel.tanks === null ? (
        <BodyText muted>{tanksUnavailable(name)}</BodyText>
      ) : (
        fuel.tanks.map((tank) => (
          <FuelRow
            key={tank.slot}
            testID={`fuel-tank-${tank.slot}`}
            label={tank.name}
            text={tank.text}
            spoken={tank.spoken}
            fraction={tank.fraction}
            stale={stale}
          />
        ))
      )}
      <View style={styles.divider} />
      {fuel.total === null ? null : (
        <FuelRow
          testID="fuel-total"
          label="TOTAL"
          text={fuel.total.text}
          spoken={fuel.total.spoken}
          stale={stale}
        />
      )}
      <FuelRow
        testID="fuel-flow"
        label={`FLOW ${fuel.flowUnit}`}
        text={fuel.flow.text}
        spoken={fuel.flow.spoken}
        stale={stale}
      />
      {fuel.used === null ? null : (
        <FuelRow
          testID="fuel-used"
          label="USED"
          text={fuel.used.text}
          spoken={fuel.used.spoken}
          stale={stale}
        />
      )}
      <FuelRow
        testID="fuel-endurance"
        label="ENDURANCE"
        text={fuel.endurance.text}
        spoken={fuel.endurance.spoken}
        stale={stale}
      />
      {fuel.missing.length > 0 ? <BodyText muted>{gaugesMissing(name, fuel.missing)}</BodyText> : null}
    </AvionicsUnit>
  );
}
```

Create `src/features/panels/engines/ElectricalSection.tsx`:

```tsx
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { type PowerRow, electricalPage } from '@/domain/engines/electrical';
import { gaugesMissing } from '@/domain/engines/messages';
import { drawnEngines } from '@/features/panels/engines/engine-reader';
import { makeReadoutStyles } from '@/features/panels/engines/FuelSection';
import { useEnginesModel } from '@/features/panels/engines/useEnginesModel';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { aircraftName } from '@/features/panels/systems/availability';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';

function PowerRowView({ row, stale }: { row: PowerRow; stale: boolean }) {
  const styles = useThemedStyles(makeReadoutStyles);
  const value = [styles.value, stale ? styles.stale : null];
  return (
    <View
      testID={`elec-${row.key}`}
      style={styles.row}
      accessible
      accessibilityLabel={row.spoken}
    >
      <Text style={styles.label}>{row.label}</Text>
      {row.volts === null ? null : <Text style={value}>{`${row.volts} V`}</Text>}
      {row.amps === null ? null : <Text style={value}>{`${row.amps} A`}</Text>}
    </View>
  );
}

/** The ELEC page (spec §4.8): buses, batteries and generators, by index, without bands. */
export function ElectricalSection() {
  const { snapshot, link } = usePanel();
  const { reader, model } = useEnginesModel();
  const electrical = useMemo(
    () => electricalPage(reader, drawnEngines(model)),
    [reader, model],
  );
  const stale = !link.valuesCurrent;
  const rows = [...electrical.buses, ...electrical.batteries, ...electrical.generators];
  return (
    <AvionicsUnit testID="electrical-section" label="ELECTRICAL">
      {rows.map((row) => (
        <PowerRowView key={row.key} row={row} stale={stale} />
      ))}
      {electrical.missing.length > 0 ? (
        <BodyText muted>{gaugesMissing(aircraftName(snapshot), electrical.missing)}</BodyText>
      ) : null}
    </AvionicsUnit>
  );
}
```

- [ ] **Step 4: Run it to verify it passes, then the gate**

Run: `npx jest tests/ui/engines-fuel-electrical.test.tsx`
Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/features/panels/engines/FuelSection.tsx src/features/panels/engines/ElectricalSection.tsx tests/ui/engines-fuel-electrical.test.tsx
git commit -m "feat(engines): FUEL page with tanks and totalizer, ELEC page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Engines panel, its registration and the guards

**Files:**
- Create: `src/features/panels/engines/EnginesPanel.tsx`
- Modify: `src/features/panels/registry.ts` (Engines after Systems), `src/features/shell/PanelIcon.tsx` (an `engines` glyph), `src/features/shell/AppShell.tsx` (mount `EnginesPreferenceProvider` inside `SystemsPreferenceProvider`)
- Modify: `tests/ui/panels.test.tsx` (registry order), `tests/ui/app-shell.test.tsx` (any list of switcher titles: insert `Engines` after `Systems`), `tests/ui/touch-target-guard.test.tsx` (an Engines sweep), `tests/ui/error-text-guard.test.tsx` (Engines' own telemetry)
- Test: `tests/ui/engines-panel.test.tsx` (new)

**Interfaces:**
- Consumes: Tasks 5–6 (`EnginesSection`, `FuelSection`, `ElectricalSection`, `useEnginesPage`, `EnginesPreferenceProvider`, `ENGINES_PANEL`, `ENGINES_PAGES`, `EnginesPage`, `WIDE_MIN_WIDTH`, `ENGINES_STORAGE_KEY`), `tests/helpers/engines.ts`.
- Produces: `EnginesPanel` (no props). testIDs `engines-page-{id}` (role `tab`), `engines-wide`. `ENGINES_PANEL` re-exported from `EnginesPanel.tsx`.

- [ ] **Step 1: Write the failing panel test**

Create `tests/ui/engines-panel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { ENGINES_FEATURES } from '@/domain/engines/catalogue';
import { EVERYWHERE } from '@/domain/panels/panel';
import { ENGINES_PAGES, ENGINES_PANEL } from '@/features/panels/engines/engines';
import { ENGINES_STORAGE_KEY } from '@/features/panels/engines/engines-preference';
import { EnginesPanel } from '@/features/panels/engines/EnginesPanel';
import { EnginesPreferenceProvider } from '@/features/panels/engines/EnginesPreferenceProvider';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

import { C172_VALUES, enginesCompatibility, enginesTelemetry, withEngines } from '../helpers/engines';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: enginesTelemetry(withEngines(C172_VALUES, 2, [1, 1]), NOW),
    compatibility: {
      ...enginesCompatibility(base.compatibility),
      identity: { ...base.compatibility.identity, description: 'Baron', icaoType: 'BE58' },
      identified: true,
    },
    ...overrides,
  };
}

const write = jest.fn(async () => undefined);
const activate = jest.fn(async () => 'ok' as const);
const hold = jest.fn(async () => 'ok' as const);
const actions: PanelScopeActions = { write, activate, hold };

function tree(snap: SessionSnapshot, storage: SettingsStorage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <EnginesPreferenceProvider storage={storage}>
          <PanelScope snapshot={snap} now={NOW} actions={actions}>
            <EnginesPanel />
          </PanelScope>
        </EnginesPreferenceProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}

function setWindow(width: number, height: number) {
  Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 } });
}

const original = Dimensions.get('window');
beforeEach(() => {
  jest.clearAllMocks();
  setWindow(390, 844);
});
afterAll(() => Dimensions.set({ window: original }));

describe('Engines panel descriptor (spec §4.11)', () => {
  it('declares id engines, title Engines, the four features, everywhere', () => {
    expect(ENGINES_PANEL.id).toBe('engines');
    expect(ENGINES_PANEL.title).toBe('Engines');
    expect(ENGINES_PANEL.supports).toEqual(EVERYWHERE);
    expect(ENGINES_PANEL.features).toEqual(ENGINES_FEATURES);
  });
});

describe('Engines pages on a phone (spec §4.10)', () => {
  it('starts on ENGINES with three page keys', async () => {
    await render(tree(snapshot()));
    expect(ENGINES_PAGES.map((page) => page.legend)).toEqual(['ENGINES', 'FUEL', 'ELEC']);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByTestId('engines-section')).toBeTruthy();
    expect(screen.queryByTestId('fuel-section')).toBeNull();
  });

  it('switches page and remembers it', async () => {
    const storage = createMemorySettingsStorage();
    await render(tree(snapshot(), storage));
    await fireEvent.press(screen.getByTestId('engines-page-fuel'));
    expect(screen.getByTestId('fuel-section')).toBeTruthy();
    await waitFor(async () =>
      expect(await storage.getItem(ENGINES_STORAGE_KEY)).toBe('{"page":"fuel"}'),
    );
    await fireEvent.press(screen.getByTestId('engines-page-elec'));
    expect(screen.getByTestId('electrical-section')).toBeTruthy();
  });

  it('opens on the stored page', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(ENGINES_STORAGE_KEY, '{"page":"elec"}');
    await render(tree(snapshot(), storage));
    expect(await screen.findByTestId('electrical-section')).toBeTruthy();
  });
});

describe('Engines on a wide window (spec §4.10)', () => {
  it('shows all three sections and no page keys', async () => {
    setWindow(1024, 768);
    await render(tree(snapshot()));
    expect(screen.getByTestId('engines-wide')).toBeTruthy();
    expect(screen.getByTestId('engines-section')).toBeTruthy();
    expect(screen.getByTestId('fuel-section')).toBeTruthy();
    expect(screen.getByTestId('electrical-section')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('Engines with no flight loaded (R5)', () => {
  it('draws no values', async () => {
    await render(
      tree(snapshot({ health: { ...base.health, activity: 'noFlight', lastHeartbeatAt: NOW } })),
    );
    expect(screen.queryByTestId('engines-section')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('Engines is read-only (R9)', () => {
  it('writes, activates and holds nothing, whatever is pressed on any page', async () => {
    setWindow(390, 844);
    await render(tree(snapshot()));
    for (const page of ENGINES_PAGES) {
      await fireEvent.press(screen.getByTestId(`engines-page-${page.id}`));
      for (const role of ['button', 'switch', 'tab'] as const) {
        for (const target of screen.queryAllByRole(role)) {
          await fireEvent.press(target);
        }
      }
    }
    expect(write).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
  });
});
```

In `tests/ui/panels.test.tsx`, change the expected `PANEL_IDS` to:

```ts
    expect(PANEL_IDS).toEqual([
      'instruments',
      'radios',
      'autopilot',
      'navigation',
      'systems',
      'engines',
      'cdu',
      'flight-data',
    ]);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/ui/engines-panel.test.tsx tests/ui/panels.test.tsx`
Expected: FAIL (`EnginesPanel` missing; registry order).

- [ ] **Step 3: Write the panel**

Create `src/features/panels/engines/EnginesPanel.tsx`:

```tsx
import React from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { ElectricalSection } from '@/features/panels/engines/ElectricalSection';
import {
  ENGINES_PAGES,
  type EnginesPage,
  WIDE_MIN_WIDTH,
} from '@/features/panels/engines/engines';
import { EnginesSection } from '@/features/panels/engines/EnginesSection';
import { useEnginesPage } from '@/features/panels/engines/EnginesPreferenceProvider';
import { FuelSection } from '@/features/panels/engines/FuelSection';
import { LightBar } from '@/features/panels/primitives/LightBar';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

export { ENGINES_PANEL } from '@/features/panels/engines/engines';

const SECTIONS: Record<EnginesPage, React.ComponentType> = {
  engines: EnginesSection,
  fuel: FuelSection,
  elec: ElectricalSection,
};

const makeStyles = (theme: Theme) => ({
  root: { gap: theme.touch.spacing },
  pageRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  pageKey: {
    flex: 1,
    backgroundColor: theme.avionics.keyFace,
    borderWidth: 1,
    borderColor: theme.avionics.bezelEdge,
    borderRadius: 6,
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  legend: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.legendSize,
    color: theme.avionics.legend,
  },
  wideRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  wideColumn: { flex: 1, gap: theme.touch.spacing },
});

function EnginesPageKey({
  page,
  selected,
  onPress,
}: {
  page: (typeof ENGINES_PAGES)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID={`engines-page-${page.id}`}
      accessibilityRole="tab"
      accessibilityLabel={page.legend}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.pageKey}
    >
      <LightBar state={selected ? 'engaged' : 'off'} />
      <Text style={styles.legend}>{page.legend}</Text>
    </Pressable>
  );
}

/**
 * F-12's Engines panel (spec §4.10–§4.11): read-only. A phone shows one page at a time behind
 * ENGINES, FUEL and ELEC keys (remembered under `avionix.engines`, ENGINES on first use); a
 * window 720 dp or wider shows ENGINES across the top and FUEL and ELEC side by side below. With
 * no flight loaded it draws nothing: the frame's notice says why (R5).
 */
export function EnginesPanel() {
  const styles = useThemedStyles(makeStyles);
  const window = useWindowDimensions();
  const { snapshot } = usePanel();
  const [page, setPage] = useEnginesPage();

  if (snapshot.state === 'connected' && snapshot.health.activity === 'noFlight') {
    return null;
  }

  if (window.width >= WIDE_MIN_WIDTH) {
    return (
      <View testID="engines-wide" style={styles.root}>
        <EnginesSection />
        <View style={styles.wideRow}>
          <View style={styles.wideColumn}>
            <FuelSection />
          </View>
          <View style={styles.wideColumn}>
            <ElectricalSection />
          </View>
        </View>
      </View>
    );
  }

  const Section = SECTIONS[page];
  return (
    <View style={styles.root}>
      <View style={styles.pageRow}>
        {ENGINES_PAGES.map((candidate) => (
          <EnginesPageKey
            key={candidate.id}
            page={candidate}
            selected={candidate.id === page}
            onPress={() => setPage(candidate.id)}
          />
        ))}
      </View>
      <Section />
    </View>
  );
}
```

- [ ] **Step 4: Register it, give it a glyph, mount its provider**

In `src/features/panels/registry.ts`, import `{ ENGINES_PANEL, EnginesPanel } from '@/features/panels/engines/EnginesPanel'` and insert `{ descriptor: ENGINES_PANEL, Component: EnginesPanel },` directly after the Systems entry.

In `src/features/shell/PanelIcon.tsx`, add before `case 'cdu':`:

```tsx
    case 'engines':
      return (
        <>
          {/* A dial: a 240° arc around a hub, its needle pointing up and right. */}
          <Path
            d="M5.07 16 A8 8 0 1 1 18.93 16"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <Line x1={12} y1={12} x2={16.5} y2={7.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
        </>
      );
```

In `src/features/shell/AppShell.tsx`, import `EnginesPreferenceProvider` from `@/features/panels/engines/EnginesPreferenceProvider` and wrap the `<View testID="app-shell" …>` element in `<EnginesPreferenceProvider storage={settingsStorage}>…</EnginesPreferenceProvider>` directly inside `<SystemsPreferenceProvider>`.

If `tests/ui/app-shell.test.tsx` (around line 127) lists the switcher's titles, insert `'Engines'` after `'Systems'`. Run the shell and setup tests and update any other list of panel ids or titles the same way.

- [ ] **Step 5: Extend the guards**

In `tests/ui/touch-target-guard.test.tsx`, import `{ C172_VALUES, enginesCompatibility, enginesTelemetry, withEngines } from '../helpers/engines'` and add after the Navigation describe:

```tsx
/**
 * The sweep above renders Engines with no telemetry, so its LEAN key never appears. This case
 * gives it a piston twin, on a phone (page keys and LEAN) and a wide window (LEAN, no page keys).
 */
describe('touch targets on the Engines panel with a piston twin', () => {
  it.each([
    ['phone', { deviceClass: 'phone', orientation: 'portrait' } as DeviceLayout, 390, 844],
    ['tablet', { deviceClass: 'tablet', orientation: 'landscape' } as DeviceLayout, 1024, 768],
  ])('every control on a %s, including LEAN, is at least 48 dp', async (_name, layout, width, height) => {
    mockLayout = layout;
    const original = Dimensions.get('window');
    Dimensions.set({ window: { width, height, scale: 1, fontScale: 1 } });
    try {
      const live = liveSnapshot();
      const { services } = makeServices(
        {
          ...live,
          telemetry: enginesTelemetry(withEngines(C172_VALUES, 2, [1, 1]), NOW),
          compatibility: enginesCompatibility(live.compatibility),
        },
        await seeded('engines'),
      );
      await render(tree(services));
      await screen.findByTestId('panel-engines');
      expect(screen.getByLabelText('Lean assist')).toBeTruthy();
      const targets = panelTargets();
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const style = StyleSheet.flatten(target.props.style) ?? {};
        const label = String(
          target.props.accessibilityLabel ?? target.props.testID ?? 'unlabelled',
        );
        expect({ label, minHeight: Number(style.minHeight ?? style.height ?? 0) >= 48 }).toEqual({
          label,
          minHeight: true,
        });
        expect({ label, minWidth: Number(style.minWidth ?? style.width ?? 0) >= 48 }).toEqual({
          label,
          minWidth: true,
        });
      }
    } finally {
      Dimensions.set({ window: original });
    }
  });
});
```

In `tests/ui/error-text-guard.test.tsx`, import `{ C172_VALUES, enginesCompatibility, enginesTelemetry } from '../helpers/engines'`. In the `PANELS.map` callback, add `const engines = descriptor.id === 'engines';` beside `systems`, and make the snapshot's `telemetry` and `compatibility`:

```tsx
                    telemetry: systems
                      ? systemsTelemetry(SYSTEMS_VALUES, 9_000)
                      : engines
                        ? enginesTelemetry(C172_VALUES, 9_000)
                        : // The CDU's live glass and keys, not its waiting state: a screen on both units.
                          { ...toyScreenTelemetry(1, 9_000), ...toyScreenTelemetry(2, 9_000) },
                    ...(systems
                      ? { compatibility: systemsCompatibility(snapshotFor(code).compatibility) }
                      : engines
                        ? { compatibility: enginesCompatibility(snapshotFor(code).compatibility) }
                        : null),
```

and after the Systems assertions add:

```tsx
    // Engines is covered live too: its dial is drawn from its own telemetry, so the sentences
    // checked below include the ones it would print.
    expect(screen.getByLabelText('Engine 1 RPM 2,350')).toBeTruthy();
```

(The guard's window is Jest's default 750 dp, so Engines renders its wide layout with all three sections.)

- [ ] **Step 6: Run the tests to verify they pass, then the gate**

Run: `npx jest tests/ui/engines-panel.test.tsx tests/ui/panels.test.tsx tests/ui/touch-target-guard.test.tsx tests/ui/error-text-guard.test.tsx tests/ui/app-shell.test.tsx`
Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/features/panels/engines/EnginesPanel.tsx src/features/panels/registry.ts src/features/shell/PanelIcon.tsx src/features/shell/AppShell.tsx tests/ui
git commit -m "feat(engines): Engines panel sixth in the switcher, read-only and guarded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The toy engine in the mock, the integration test and the docs

**Files:**
- Modify: `tests/mock-xplane/mock-xplane-server.ts` (an `engineDataRefs(startId)` block appended to `DEFAULT_MOCK_DATAREFS` at id 1201, a toy engine in `tick()`)
- Modify: `tests/integration/xplane-client.test.ts` (the DataRef count: 195 → 286), and any mock test that counts DataRefs
- Create: `tests/integration/engines.test.ts`
- Modify: `docs/xplane.md`, `docs/architecture.md`, `README.md`, `docs/roadmap/features/F-12-engine-systems-monitoring.md`, `docs/roadmap/ROADMAP.md`, `docs/testing/xplane-smoke-test.md`

**Interfaces:**
- Consumes: the catalogue (Task 1), `enginesPage` (Task 2), `fuelPage` (Task 3), `engineReader` (Task 5); in the mock, the existing `padded(values, length)`, `getDataRefByName`, `ENGINES.running`, `MockDataRef`, `DataRefValueType`.
- Produces: 91 mock DataRefs, ids 1201–1291; a toy engine whose 13 indicators follow `ENGN_running` on every tick.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/engines.test.ts`:

```ts
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { ENGINE_CONFIG, ENGINES_FEATURES, GAUGES } from '@/domain/engines/catalogue';
import { enginesPage } from '@/domain/engines/engine-page';
import { fuelPage } from '@/domain/engines/fuel';
import { ENGINES } from '@/domain/systems/controls';
import { DEFAULT_UNITS } from '@/domain/units/units';
import { engineReader } from '@/features/panels/engines/engine-reader';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import type { ReconnectPolicy } from '@/utils/backoff';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

const FAST_RECONNECT: ReconnectPolicy = {
  maxAttempts: 5,
  baseDelayMs: 20,
  factor: 1,
  maxDelayMs: 50,
  jitterRatio: 0,
};

function createSession(): SimulatorSession {
  return new SimulatorSession({
    createHttpTransport: (config, auth) =>
      new HttpTransport({
        origin: `http://${config.host}:${config.port}`,
        auth,
        logger: silentLogger,
        defaultTimeoutMs: 2000,
      }),
    createClient: (config, apiVersion, http, auth) =>
      new XPlaneClient({
        config,
        apiVersion,
        http,
        auth,
        logger: silentLogger,
        requestTimeoutMs: 2000,
        connectTimeoutMs: 2000,
      }),
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore: createPairingTokenStore(createMemorySettingsStorage()),
    logger: silentLogger,
    reconnectPolicy: FAST_RECONNECT,
  });
}

async function until(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('the Engines panel against the mock X-Plane (the toy engine)', () => {
  let server: MockXPlaneServer;
  let stopped: boolean;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    stopped = false;
  });

  afterEach(async () => {
    if (!stopped) {
      await server.stop();
    }
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(ENGINES_FEATURES);
    await session.connect(server.host, server.port);
    return session;
  }

  const model = (session: SimulatorSession) =>
    enginesPage(engineReader(session.store.getSnapshot()), DEFAULT_UNITS);

  it('draws the stopped engine, then its running values once it runs', async () => {
    const session = await connected();
    await until(() => model(session).columns[0]?.dial?.text === '0');
    expect(model(session).rows.map((row) => row.id)).toEqual([
      'map',
      'ff',
      'egt',
      'cht',
      'oilP',
      'oilT',
    ]);
    server.setDataRefValue(ENGINES.running, [1, ...new Array<number>(15).fill(0)]);
    await until(() => model(session).columns[0]?.dial?.text === '2,300');
    // 1,350 °F (the mock's EGT flag is 0) is 732 °C.
    expect(model(session).columns[0]?.cells.egt?.text).toBe('732');
    const fuel = fuelPage(engineReader(session.store.getSnapshot()), DEFAULT_UNITS, 1);
    expect(fuel.tanks?.map((tank) => tank.name)).toEqual(['LEFT', 'RIGHT']);
    expect(fuel.total?.text).toBe('1,235');
    session.disconnect();
  });

  it('marks only the gauges whose DataRef the aircraft lacks', async () => {
    server.removeDataRef(GAUGES.cht.name);
    const session = await connected();
    await until(() => model(session).status === 'ready');
    expect(model(session).missing).toEqual(['CHT']);
    expect(model(session).rows.map((row) => row.id)).not.toContain('cht');
    session.disconnect();
  });

  it('says the engines cannot be identified without the count', async () => {
    server.removeDataRef(ENGINE_CONFIG.count);
    const session = await connected();
    await until(() => session.store.getSnapshot().state === 'connected');
    expect(model(session).status).toBe('unidentified');
    session.disconnect();
  });

  it('keeps the last values, never zeroed, when the simulator goes away (R5)', async () => {
    const session = await connected();
    server.setDataRefValue(ENGINES.running, [1, ...new Array<number>(15).fill(0)]);
    await until(() => model(session).columns[0]?.dial?.text === '2,300');
    await server.stop();
    stopped = true;
    await until(() => session.store.getSnapshot().state !== 'connected');
    expect(model(session).columns[0]?.dial?.text).toBe('2,300');
    session.disconnect();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/integration/engines.test.ts`
Expected: FAIL (the mock has no engine indicators: the count resolves, every gauge is missing).

- [ ] **Step 3: Give the mock the 91 names and a toy engine**

In `tests/mock-xplane/mock-xplane-server.ts`:

1. Import from `@/domain/engines/catalogue`: `ELECTRICAL`, `ENGINE_CONFIG`, `FUEL`, `GAUGES`, `GAUGE_IDS`, `type GaugeId`, `MARKING_NAMES`, `markingName`. (`ENGINES` and `MAX_ENGINES` come from `@/domain/systems/controls`; add `MAX_ENGINES` to that import if it is not there.)

2. After `systemsCommands`, add:

```ts
/** F-12's toy engine: a C172 stopped (cold, ambient manifold pressure) and running at cruise. */
const TOY_ENGINE_STOPPED: Record<GaugeId, number> = {
  rpm: 0,
  prop: 0,
  n1: 0,
  n2: 0,
  map: 29.9,
  trq: 0,
  epr: 1,
  egt: 60,
  cht: 15,
  itt: 15,
  ff: 0,
  oilP: 0,
  oilT: 15,
};

const TOY_ENGINE_RUNNING: Record<GaugeId, number> = {
  ...TOY_ENGINE_STOPPED,
  rpm: 2300,
  prop: 2300,
  map: 22,
  egt: 1350,
  cht: 180,
  ff: 0.0105,
  oilP: 62,
  oilT: 82,
};

/** The C172's own markings; every other marking reads 0 (unused), as Plane Maker leaves it. */
const TOY_MARKINGS: Record<string, number> = {
  [markingName('green', 'lo', 'EGT')]: 1200,
  [markingName('green', 'hi', 'EGT')]: 1500,
  [markingName('green', 'lo', 'CHT')]: 65,
  [markingName('green', 'hi', 'CHT')]: 230,
  [markingName('red', 'lo', 'CHT')]: 238,
  [markingName('red', 'hi', 'CHT')]: 260,
  [markingName('green', 'lo', 'oilP')]: 50,
  [markingName('green', 'hi', 'oilP')]: 90,
  [markingName('red', 'lo', 'oilP')]: 0,
  [markingName('red', 'hi', 'oilP')]: 20,
  [markingName('green', 'lo', 'oilT')]: 38,
  [markingName('green', 'hi', 'oilT')]: 118,
};

/**
 * F-12's 91 engine, fuel and electrical DataRefs (spec §3). Laminar's array lengths: 16 engines,
 * 9 tank slots, 6 buses, 8 batteries and generators. EGT reads in °F (its flag 0), ITT and oil
 * temperature in °C. Two wing tanks of nine hold the mock's 1,234.5 kg fuel total. All read-only:
 * the panel never writes, and the tick drives the indicators.
 */
function engineDataRefs(startId: number): MockDataRef[] {
  const refs: MockDataRef[] = [];
  let nextId = startId;
  const push = (name: string, valueType: DataRefValueType, value: DataRefValue) =>
    refs.push({ id: nextId++, name, valueType, value });

  for (const id of GAUGE_IDS) {
    push(GAUGES[id].name, 'float_array', padded([TOY_ENGINE_STOPPED[id]], 16));
  }
  push(ENGINE_CONFIG.egtIsCelsius, 'int', 0);
  push(ENGINE_CONFIG.ittIsCelsius, 'int', 1);
  push(ENGINE_CONFIG.oilTempIsCelsius, 'int', 1);
  push(ENGINE_CONFIG.engineRedline, 'float', 282.743);
  push(ENGINE_CONFIG.propRedline, 'float', 282.743);
  for (const name of MARKING_NAMES) {
    push(name, 'float', TOY_MARKINGS[name] ?? 0);
  }
  push(FUEL.perTank, 'float_array', padded([617.25, 617.25], 9));
  push(FUEL.ratio, 'float_array', padded([0.5, 0.5], 9));
  push(FUEL.count, 'int', 9);
  push(FUEL.capacity, 'float', 3000);
  push(FUEL.side, 'float_array', padded([-11, 11], 9));
  push(FUEL.used, 'float', 0);
  push(ELECTRICAL.busCount, 'int', 1);
  push(ELECTRICAL.batteryCount, 'int', 1);
  push(ELECTRICAL.busVolts, 'float_array', padded([24], 6));
  push(ELECTRICAL.busAmps, 'float_array', padded([2], 6));
  push(ELECTRICAL.batteryVolts, 'float_array', padded([24], 8));
  push(ELECTRICAL.batteryAmps, 'float_array', padded([-2], 8));
  push(ELECTRICAL.generatorAmps, 'float_array', padded([0], 8));
  return refs;
}
```

(`padded` pads with zeros, so the stopped values sit at engine 1 only until the first tick writes every engine; the tick below makes that moot.)

3. In `DEFAULT_MOCK_DATAREFS`, after `...systemsDataRefs(1161),` add:

```ts
  // F-12: the engine, fuel and electrical readings, ids after the systems catalogue's.
  ...engineDataRefs(1201),
```

4. At the end of `tick()`, add (and extend the method's doc comment with one sentence: "The F-12 toy engine's thirteen indicators read running or stopped values per engine from `ENGN_running`."):

```ts
    const running = this.getDataRefByName(ENGINES.running)?.value;
    if (Array.isArray(running)) {
      for (const id of GAUGE_IDS) {
        const ref = this.getDataRefByName(GAUGES[id].name);
        if (ref === undefined || !Array.isArray(ref.value)) {
          continue;
        }
        ref.value = ref.value.map((value, index) =>
          index < MAX_ENGINES
            ? running[index] === 1
              ? TOY_ENGINE_RUNNING[id]
              : TOY_ENGINE_STOPPED[id]
            : value,
        );
      }
    }
```

5. In `tests/integration/xplane-client.test.ts`, update the count test:

```ts
  it('reports the dataref count', async () => {
    // 94 pre-F-32 DataRefs, the CDU's 66 (32 screen cells per unit, two EXEC lights), the 35
    // systems DataRefs added in 1.7.0, and the 91 engine, fuel and electrical DataRefs in 1.8.0.
    await expect(client.getDataRefCount()).resolves.toBe(286);
  });
```

If `tests/integration/mock-xplane-server.test.ts` counts or lists DataRefs, update it by the same 91 and say so in the report.

- [ ] **Step 4: Run the integration tests to verify they pass**

Run: `npx jest tests/integration`
Expected: PASS. If the last test finds the session cleared its telemetry on a dropped link, stop and report it (R5 requires the last values to stay; do not change the session in this task).

- [ ] **Step 5: Write the docs**

1. `docs/xplane.md`: after the Systems (F-24) section, add an "Engines (F-12)" section in the same style. It needs: a sentence that every name was verified against Laminar's `DataRefs.txt`, and the three `_deg_cel` names (12.0.8+) against Laminar's live DataRef database because the `DataRefs.txt` copy predates them; one table each for the engine indicators (with units and the unit flag for EGT, ITT and oil temperature; CHT always °C), engine configuration (count, type, three flags, two redlines in rad/s), the 60 markings (the name pattern, the ten instruments, TRQ in ft-lb, temperatures in the value's unit pending device row 165), fuel (with "`m_fuel` sums to F-11's `m_fuel_total`; `acf_m_fuel_tot` is lb, the whole aircraft") and electrical. End with: "Unsettled until the device rows: the marking units for temperatures (165), the unit flags (166), the tank side threshold (167)."

2. `docs/architecture.md`: after the F-24 section, add an "Engines panel (F-12)" section: the catalogue (`src/domain/engines/catalogue.ts`) and profile 1.8.0's four read-only features; the domain models (`enginesPage`, `fuelPage`, `electricalPage`) built from an `EngineReader` so the panel only draws; units (instrument values, temperature source from the flags, conversion to the pilot's unit); markings (bands from the aircraft, scale, tone; no alerting); lean assist (`LeanStore`, an external store in `EnginesPreferenceProvider`, advanced from an effect, keyed by aircraft); the layout (phone pages `avionix.engines`, wide at 720 dp); freshness from the link as F-11; Engines sixth in the switcher.

3. `README.md`: in the paragraph listing the panels (it mentions Systems around line 25), add Engines after Systems: "Engines (each engine's dial and gauges for its type with the aircraft's own colour bands, lean assist, fuel per tank with flow, used and endurance, buses and batteries; read-only)".

4. `docs/roadmap/features/F-12-engine-systems-monitoring.md`: set Status to `Done`, and under the Summary add a line "Delivered: design in `../../superpowers/specs/2026-10-07-engine-monitoring-design.md`, research in `../research/engine-monitoring.md`." In "Risks and open questions", append to the temperature-units bullet: "Resolved: `acf_EGT_is_C`, `acf_ITT_is_C` and `acf_oilT_is_C` say which unit is in use (spec §4.4)."

5. `docs/roadmap/ROADMAP.md`: in the F-12 row, replace the link to the feature file with `[spec](../superpowers/specs/2026-10-07-engine-monitoring-design.md)`, as the F-24 row does.

6. `docs/testing/xplane-smoke-test.md`: append rows 162 to 172 to the numbered table (after row 161), in its columns (number, steps, expected, result left blank):

| # | Steps | Expected |
|---|---|---|
| 162 | Cessna 172: start the engine and do a run-up at 1,800 rpm; compare Engines with the G1000 | RPM, MAP, FF, EGT, CHT, oil pressure and oil temperature match the G1000 |
| 163 | A default turboprop: start an engine, watching Engines | TRQ, ITT, NG and PROP match the cockpit; ITT peaks then falls; TRQ is in ft-lb |
| 164 | A default airliner: start an engine | N1, EGT, N2 and FF match its engine display; EPR shows a plausible ratio |
| 165 | Cessna 172: compare the EGT, CHT and oil bands on Engines with the G1000's | The bands sit where the G1000 draws them (confirms the marking units) |
| 166 | Cessna 172: Settings → temperature °F, then °C | EGT matches the cockpit in both; no "doesn't say which unit" line on default aircraft |
| 167 | Cessna 172: FUEL page | Two tanks named LEFT and RIGHT; full tanks read about 100 %; TOTAL equals the flight-data strip |
| 168 | Cessna 172 in cruise: FUEL page | ENDURANCE roughly matches the G1000's fuel calculation; FLOW matches the cockpit's fuel flow |
| 169 | Cessna 172 in cruise: LEAN on, lean the mixture through peak EGT | The peak tick stays at the highest EGT; ΔPEAK reads 0 at peak and negative past it; LEAN off clears it |
| 170 | Cessna 172: ELEC page with the battery switch on, then off | Bus volts and battery amps match the G1000's electrical page; battery amps go negative with the alternator off |
| 171 | Connect with a flight loaded and time it against rows 124 and 143 | Connecting takes at most about a second longer than before F-12 (91 more names are checked) |
| 172 | Phone: the three pages; tablet: a twin in the wide layout | Pages switch and are remembered; on the tablet both engines' dials sit side by side, FUEL and ELEC below |

- [ ] **Step 6: Run the gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add tests/mock-xplane/mock-xplane-server.ts tests/integration docs README.md
git commit -m "feat(engines): toy engine in the mock, integration test and docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
