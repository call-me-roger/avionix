# Aircraft identification and compatibility — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avionix identifies the loaded aircraft, selects a versioned profile of DataRef and
command names, probes every declared name at connect, and shows per feature whether it is
available, partly available or unavailable — naming what is missing.

**Architecture:** A four-phase pipeline replaces the hardcoded MVP resolution inside
`SimulatorSession`: readiness gate (`datarefs/count`), identify (three `data`-typed DataRefs),
select (deterministic profile match), probe (bounded-concurrency name resolution). A binding miss
degrades the owning feature instead of failing the connect. The identification DataRefs are also
subscribed, so a change in them is the aircraft-changed event the Web API does not provide.

**Tech Stack:** TypeScript strict, Expo SDK 57 / React Native 0.86 / React 19, zod 4,
Jest 29 + jest-expo (three projects: `node` for `tests/{unit,contract,integration}/**/*.test.ts`,
`expo` for `tests/ui/**/*.test.tsx`, `web` for `tests/web/**/*.web.test.tsx`),
`@testing-library/react-native` 14.

**Spec:** [docs/superpowers/specs/2026-09-23-aircraft-compatibility-design.md](../specs/2026-09-23-aircraft-compatibility-design.md)

## Global Constraints

- Never render, log or serialise a bearer token or a pairing code. No URL, HTTP status, exception
  text or protocol payload may appear on any screen or in the shareable summary.
- `AvionixError.message`, `.cause` and `.httpStatus` are for the logger only. The only route from a
  failure to a screen is `explainFailure(code, step)` in
  `src/domain/health/failure-explanation.ts`. DataRef and command *names* are not error text:
  naming a missing one is required by R7.
- `src/domain` and `src/application` never import React or React Native.
- Dependencies point downwards only: domain → nothing, infrastructure → domain,
  application → domain + infrastructure, UI → application, platform → infrastructure.
- Numeric DataRef and command ids are session-scoped: resolved by name on every connect, never
  persisted.
- Minimum X-Plane 12.1.4 (Web API v2). `DataRefDescriptor.isWritable` exists only on 12.4.3+ and is
  optional everywhere.
- TypeScript strict with `noUncheckedIndexedAccess`: every index read is `T | undefined`.
- The gate for every task is `npm run typecheck && npm run lint && npm run format:check && npm test`.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Never launch Xcode, Android Studio, a simulator, an emulator, `expo start` or an EAS build. The
  user performs all device verification.
- A `jest.mock` factory may only close over variables whose names begin with `mock`.
- `render` from `@testing-library/react-native` 14 is async — always `await` it.

## File Structure

| Path | Responsibility |
|---|---|
| `src/domain/simulator/dataref-string.ts` | Create. Decode a `data`-typed DataRef value: base64 → bytes → UTF-8 → cut at the first NUL |
| `src/domain/aircraft/aircraft-identity.ts` | Create. `AircraftIdentity`, `UNIDENTIFIED`, `isIdentified`, `identityLabel`, `sameAircraft` |
| `src/domain/aircraft/identity-datarefs.ts` | Create. The three identification DataRef names and the field they map to |
| `src/domain/aircraft/profile.ts` | Create. `BindingSpec`, `FeatureSpec`, `MatchRule`, `AircraftProfile`, `profileBindings`, `findFeature`, `writeBindingOf`, `commandBindingOf` |
| `src/domain/aircraft/profiles/generic.ts` | Create. The generic Laminar-default profile, its names and feature-id constants |
| `src/domain/aircraft/profiles/catalog.ts` | Create. `BUNDLED_PROFILES` |
| `src/domain/aircraft/profile-selection.ts` | Create. `ProfileCatalog`, `SelectionReason`, `selectProfile` |
| `src/domain/aircraft/availability.ts` | Create. `BindingStatus`, `BindingResult`, `FeatureStatus`, `MissingBinding`, `FeatureAvailability`, `deriveFeatureAvailability`, `deriveAvailability`, `summariseAvailability`, labels |
| `src/domain/aircraft/version-check.ts` | Create. `versionWarning` |
| `src/domain/health/simulator-activity.ts` | Modify. `ActivityInput` gains `heartbeatAvailable` |
| `src/utils/concurrency.ts` | Create. `mapWithConcurrency` |
| `src/application/compatibility.ts` | Create. `CompatibilitySnapshot`, `initialCompatibility`, `featureOf`, `featureStatus`, `bindingFeatureLabels` |
| `src/application/aircraft-probe.ts` | Create. `identifyAircraft`, `readAddOnVersion`, `probeBindings`, `PROBE_CONCURRENCY` |
| `src/application/session-snapshot.ts` | Modify. `compatibility` on the snapshot; `initialSnapshot(profile, reconnectBudget)` |
| `src/application/simulator-session.ts` | Modify. The pipeline, change detection, `recheckCompatibility`, subscription delta |
| `src/application/health-monitor.ts` | Modify. Feed `heartbeatAvailable`; read the paused name from the generic profile |
| `src/application/diagnostics-summary.ts` | Modify. The Aircraft block; `bindingFeatureLabels` in place of `BINDING_FEATURE` |
| `src/application/mvp-bindings.ts` | **Delete.** Replaced by the generic profile |
| `src/app/services-context.tsx` | Modify. `SessionApi` gains `recheckCompatibility` |
| `src/hooks/useSimulatorSession.ts` | Modify. Expose `recheckCompatibility` |
| `src/features/aircraft/AircraftSummary.tsx` | Create. The main-screen row |
| `src/features/aircraft/CompatibilityScreen.tsx` | Create. The full compatibility view |
| `src/features/mvp/ControlPanel.tsx` | Modify. Gate on `heading-control` availability |
| `src/features/mvp/TelemetryPanel.tsx` | Modify. Profile-driven rows, availability gating |
| `src/features/mvp/MvpScreen.tsx` | Modify. Mount the summary and the compatibility view |
| `tests/mock-xplane/mock-xplane-server.ts` | Modify. Emit `is_writable`, ship the identification DataRefs, add/remove a DataRef at runtime |
| `docs/architecture.md`, `docs/xplane.md`, `docs/testing/xplane-smoke-test.md` | Modify. Document the layer, the names and the device checks |

---

### Task 1: Decode `data`-typed DataRef values, and the aircraft identity type

X-Plane sends string DataRefs base64-encoded and NUL-padded. Nothing in the codebase decodes them
yet. This task adds the decoder and the identity value object that consumes it. Both are pure
domain code with no dependencies beyond `src/domain/simulator/types`.

**Files:**

- Create: `src/domain/simulator/dataref-string.ts`
- Create: `src/domain/aircraft/aircraft-identity.ts`
- Create: `src/domain/aircraft/identity-datarefs.ts`
- Test: `tests/unit/domain/dataref-string.test.ts`
- Test: `tests/unit/domain/aircraft-identity.test.ts`

**Interfaces:**

- Consumes: `DataRefValue`, `DataRefValueType` from `@/domain/simulator/types`.
- Produces:
  - `decodeDataRefString(value: DataRefValue, valueType: DataRefValueType): string | null`
  - `interface AircraftIdentity { icaoType: string | null; description: string | null; tailNumber: string | null; addOnVersion: string | null }`
  - `const UNIDENTIFIED: AircraftIdentity`
  - `isIdentified(identity: AircraftIdentity): boolean`
  - `identityLabel(identity: AircraftIdentity): string | null`
  - `sameAircraft(a: AircraftIdentity, b: AircraftIdentity): boolean`
  - `const IDENTITY_DATAREFS: { readonly icaoType: string; readonly description: string; readonly tailNumber: string }`
  - `const IDENTITY_DATAREF_NAMES: readonly string[]`
  - `type IdentityField = 'icaoType' | 'description' | 'tailNumber'`
  - `identityFieldFor(name: string): IdentityField | null`

- [ ] **Step 1: Write the failing decoder test**

`tests/unit/domain/dataref-string.test.ts`:

```ts
import { decodeDataRefString } from '@/domain/simulator/dataref-string';

describe('decodeDataRefString', () => {
  it('decodes base64 text', () => {
    expect(decodeDataRefString('Q2Vzc25hIDE3MiBTUA==', 'data')).toBe('Cessna 172 SP');
  });

  it('cuts the string at the first NUL, which X-Plane pads with', () => {
    expect(decodeDataRefString('TjE3MlNQAAAAAA==', 'data')).toBe('N172SP');
  });

  it('decodes multi-byte UTF-8', () => {
    expect(decodeDataRefString('w4Q=', 'data')).toBe('Ä');
  });

  it('returns null for a value that decodes to nothing', () => {
    expect(decodeDataRefString('', 'data')).toBeNull();
    expect(decodeDataRefString('AAAA', 'data')).toBeNull();
  });

  it('returns null when the payload is not base64', () => {
    expect(decodeDataRefString('not base64!', 'data')).toBeNull();
  });

  it('returns null for every non-data value type, so a number is never read as text', () => {
    expect(decodeDataRefString('Q2Vzc25h', 'float')).toBeNull();
    expect(decodeDataRefString(12.5, 'data')).toBeNull();
    expect(decodeDataRefString([1, 2], 'float_array')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/domain/dataref-string.test.ts`
Expected: FAIL — cannot find module `@/domain/simulator/dataref-string`.

- [ ] **Step 3: Write the decoder**

`src/domain/simulator/dataref-string.ts`:

```ts
import type { DataRefValue, DataRefValueType } from '@/domain/simulator/types';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes standard base64 without depending on `atob`, `Buffer` or `TextDecoder`: the app runs on
 * Hermes, on Node and in a browser, and only this file would have had to care which globals each
 * one provides.
 */
function decodeBase64(text: string): Uint8Array | null {
  const body = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(body)) {
    return null;
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of body) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** Decodes UTF-8, substituting U+FFFD for a malformed sequence rather than throwing. */
function decodeUtf8(bytes: Uint8Array): string {
  let text = '';
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes[index] ?? 0;
    let codePoint: number;
    let continuations: number;
    if (lead < 0x80) {
      codePoint = lead;
      continuations = 0;
    } else if ((lead & 0xe0) === 0xc0) {
      codePoint = lead & 0x1f;
      continuations = 1;
    } else if ((lead & 0xf0) === 0xe0) {
      codePoint = lead & 0x0f;
      continuations = 2;
    } else if ((lead & 0xf8) === 0xf0) {
      codePoint = lead & 0x07;
      continuations = 3;
    } else {
      text += '�';
      index += 1;
      continue;
    }
    if (index + continuations >= bytes.length) {
      return `${text}�`;
    }
    let valid = true;
    for (let offset = 1; offset <= continuations; offset += 1) {
      const next = bytes[index + offset] ?? 0;
      if ((next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (!valid || codePoint > 0x10ffff) {
      text += '�';
      index += 1;
      continue;
    }
    text += String.fromCodePoint(codePoint);
    index += continuations + 1;
  }
  return text;
}

/**
 * Reads a `data`-typed DataRef as text. X-Plane base64-encodes these and pads them with NUL to the
 * DataRef's declared length. Decoding is driven by the descriptor's `valueType`, never guessed
 * from the shape of the value: a float that happens to arrive as a string must not be read as
 * text. Returns null when there is nothing to show, so callers treat "absent" and "empty" alike.
 */
export function decodeDataRefString(
  value: DataRefValue,
  valueType: DataRefValueType,
): string | null {
  if (valueType !== 'data' || typeof value !== 'string') {
    return null;
  }
  const bytes = decodeBase64(value);
  if (bytes === null) {
    return null;
  }
  const end = bytes.indexOf(0);
  const text = decodeUtf8(end === -1 ? bytes : bytes.subarray(0, end)).trim();
  return text === '' ? null : text;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest tests/unit/domain/dataref-string.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing identity test**

`tests/unit/domain/aircraft-identity.test.ts`:

```ts
import {
  type AircraftIdentity,
  UNIDENTIFIED,
  identityLabel,
  isIdentified,
  sameAircraft,
} from '@/domain/aircraft/aircraft-identity';
import {
  IDENTITY_DATAREFS,
  IDENTITY_DATAREF_NAMES,
  identityFieldFor,
} from '@/domain/aircraft/identity-datarefs';

const cessna: AircraftIdentity = {
  icaoType: 'C172',
  description: 'Cessna 172 SP',
  tailNumber: 'N172SP',
  addOnVersion: null,
};

describe('AircraftIdentity', () => {
  it('reports nothing identified for the empty identity', () => {
    expect(isIdentified(UNIDENTIFIED)).toBe(false);
    expect(identityLabel(UNIDENTIFIED)).toBeNull();
  });

  it('counts any of the three identification fields as identified', () => {
    expect(isIdentified({ ...UNIDENTIFIED, tailNumber: 'N172SP' })).toBe(true);
  });

  it('does not count an add-on version alone as an identification', () => {
    expect(isIdentified({ ...UNIDENTIFIED, addOnVersion: '4.2' })).toBe(false);
  });

  it('labels the aircraft with its description, type code and tail number', () => {
    expect(identityLabel(cessna)).toBe('Cessna 172 SP (C172) · N172SP');
  });

  it('falls back to whichever fields X-Plane did report', () => {
    expect(identityLabel({ ...UNIDENTIFIED, icaoType: 'B738' })).toBe('B738');
    expect(identityLabel({ ...UNIDENTIFIED, tailNumber: 'N738AV' })).toBe('N738AV');
    expect(identityLabel({ ...UNIDENTIFIED, description: 'Zibo 737' })).toBe('Zibo 737');
  });

  it('treats any difference as a different aircraft, the add-on version included', () => {
    expect(sameAircraft(cessna, { ...cessna })).toBe(true);
    expect(sameAircraft(cessna, { ...cessna, tailNumber: 'N999XX' })).toBe(false);
    expect(sameAircraft(cessna, { ...cessna, addOnVersion: '4.2' })).toBe(false);
  });
});

describe('identity datarefs', () => {
  it('names the three community-convention datarefs', () => {
    expect(IDENTITY_DATAREFS.icaoType).toBe('sim/aircraft/view/acf_ICAO');
    expect(IDENTITY_DATAREFS.description).toBe('sim/aircraft/view/acf_descrip');
    expect(IDENTITY_DATAREFS.tailNumber).toBe('sim/aircraft/view/acf_tailnum');
    expect(IDENTITY_DATAREF_NAMES).toHaveLength(3);
  });

  it('maps a name back to the field it fills', () => {
    expect(identityFieldFor(IDENTITY_DATAREFS.description)).toBe('description');
    expect(identityFieldFor('sim/time/paused')).toBeNull();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx jest tests/unit/domain/aircraft-identity.test.ts`
Expected: FAIL — cannot find module `@/domain/aircraft/aircraft-identity`.

- [ ] **Step 7: Write the identity module**

`src/domain/aircraft/aircraft-identity.ts`:

```ts
/**
 * What the simulator says about the loaded aircraft. Every field is null until X-Plane answers,
 * and stays null when it has no answer: identification degrades, it never fails a connect (R2).
 */
export interface AircraftIdentity {
  icaoType: string | null;
  description: string | null;
  tailNumber: string | null;
  /** The add-on's own version, when the profile names a DataRef carrying one (R12). */
  addOnVersion: string | null;
}

export const UNIDENTIFIED: AircraftIdentity = {
  icaoType: null,
  description: null,
  tailNumber: null,
  addOnVersion: null,
};

/** True when X-Plane named the aircraft at all. The add-on version alone identifies nothing. */
export function isIdentified(identity: AircraftIdentity): boolean {
  return (
    identity.icaoType !== null || identity.description !== null || identity.tailNumber !== null
  );
}

/** One line naming the aircraft, or null when X-Plane reported nothing about it. */
export function identityLabel(identity: AircraftIdentity): string | null {
  const parts: string[] = [];
  if (identity.description !== null) {
    parts.push(
      identity.icaoType === null
        ? identity.description
        : `${identity.description} (${identity.icaoType})`,
    );
  } else if (identity.icaoType !== null) {
    parts.push(identity.icaoType);
  }
  if (identity.tailNumber !== null) {
    parts.push(identity.tailNumber);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * Whether two identifications describe the same aircraft *with the same bindings*. The add-on
 * version counts: a reloaded add-on can move the very names a profile depends on, which is the
 * breakage this feature exists to catch.
 */
export function sameAircraft(a: AircraftIdentity, b: AircraftIdentity): boolean {
  return (
    a.icaoType === b.icaoType &&
    a.description === b.description &&
    a.tailNumber === b.tailNumber &&
    a.addOnVersion === b.addOnVersion
  );
}
```

`src/domain/aircraft/identity-datarefs.ts`:

```ts
/**
 * The three `data`-typed DataRefs Avionix identifies an aircraft from. All three are community
 * convention, not confirmed against a Laminar-authored document, so all three are optional
 * everywhere — exactly as F-02 treats `sim/time/paused`.
 */
export const IDENTITY_DATAREFS = {
  icaoType: 'sim/aircraft/view/acf_ICAO',
  description: 'sim/aircraft/view/acf_descrip',
  tailNumber: 'sim/aircraft/view/acf_tailnum',
} as const;

export type IdentityField = keyof typeof IDENTITY_DATAREFS;

export const IDENTITY_FIELDS: readonly IdentityField[] = ['icaoType', 'description', 'tailNumber'];

export const IDENTITY_DATAREF_NAMES: readonly string[] = IDENTITY_FIELDS.map(
  (field) => IDENTITY_DATAREFS[field],
);

/** Which identity field a DataRef name fills, or null when the name is not one of the three. */
export function identityFieldFor(name: string): IdentityField | null {
  return IDENTITY_FIELDS.find((field) => IDENTITY_DATAREFS[field] === name) ?? null;
}
```

- [ ] **Step 8: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: everything passes; the two new suites are collected by the `node` project.

- [ ] **Step 9: Commit**

```bash
git add src/domain/simulator/dataref-string.ts src/domain/aircraft tests/unit/domain/dataref-string.test.ts tests/unit/domain/aircraft-identity.test.ts
git commit -m "$(cat <<'MSG'
feat(aircraft): decode data-typed datarefs and model the aircraft identity

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: Profile types, the generic profile and the bundled catalog

A profile is the single registry of the DataRef and command names a feature needs. This task
defines the shape and ships the one profile Stage 1 needs: the Laminar-default generic profile,
holding exactly the names `src/application/mvp-bindings.ts` holds today. That file is **not**
deleted here — Task 7 deletes it once the session reads the profile instead.

**Files:**

- Create: `src/domain/aircraft/profile.ts`
- Create: `src/domain/aircraft/profiles/generic.ts`
- Create: `src/domain/aircraft/profiles/catalog.ts`
- Test: `tests/unit/domain/aircraft-profile.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `type BindingKind = 'dataref' | 'command'`
  - `interface BindingSpec { kind: BindingKind; name: string; required: boolean; write?: boolean; purpose: string }`
  - `interface FeatureSpec { id: string; label: string; bindings: readonly BindingSpec[] }`
  - `type MatchRule = { kind: 'generic' } | { kind: 'icao'; codes: readonly string[] }`
  - `interface AircraftProfile { id: string; name: string; version: string; match: MatchRule; addOnVersionDataRef?: string; testedWith?: readonly string[]; features: readonly FeatureSpec[] }`
  - `profileBindings(profile: AircraftProfile): readonly BindingSpec[]`
  - `findFeature(profile: AircraftProfile, featureId: string): FeatureSpec | null`
  - `writeBindingOf(profile: AircraftProfile, featureId: string): BindingSpec | null`
  - `commandBindingOf(profile: AircraftProfile, featureId: string): BindingSpec | null`
  - `GENERIC_DATAREFS` (`heartbeat`, `paused`, `airspeed`, `headingBug`), `GENERIC_COMMANDS` (`headingUp`)
  - `FEATURE_CONNECTION_HEALTH`, `FEATURE_FLIGHT_TELEMETRY`, `FEATURE_HEADING_CONTROL` (string constants)
  - `GENERIC_PROFILE: AircraftProfile`
  - `interface ProfileCatalog { generic: AircraftProfile; named: readonly AircraftProfile[] }` (declared here, used by Task 3)
  - `BUNDLED_PROFILES: ProfileCatalog`

- [ ] **Step 1: Write the failing test**

`tests/unit/domain/aircraft-profile.test.ts`:

```ts
import {
  type AircraftProfile,
  commandBindingOf,
  findFeature,
  profileBindings,
  writeBindingOf,
} from '@/domain/aircraft/profile';
import { BUNDLED_PROFILES } from '@/domain/aircraft/profiles/catalog';
import {
  FEATURE_CONNECTION_HEALTH,
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';

const shared: AircraftProfile = {
  id: 'test.shared',
  name: 'Shared names',
  version: '1.0.0',
  match: { kind: 'icao', codes: ['B738'] },
  features: [
    {
      id: 'reader',
      label: 'Reader',
      bindings: [{ kind: 'dataref', name: 'a/b', required: true, purpose: 'Reads it' }],
    },
    {
      id: 'writer',
      label: 'Writer',
      bindings: [
        { kind: 'dataref', name: 'a/b', required: true, write: true, purpose: 'Writes it' },
      ],
    },
  ],
};

describe('profileBindings', () => {
  it('probes a name shared by two features once', () => {
    expect(profileBindings(shared)).toHaveLength(1);
  });

  it('keeps the write requirement when any feature writes to the name', () => {
    expect(profileBindings(shared)[0]?.write).toBe(true);
  });

  it('lists every distinct name of the generic profile', () => {
    const names = profileBindings(GENERIC_PROFILE).map((binding) => binding.name);
    expect(names).toEqual([
      GENERIC_DATAREFS.heartbeat,
      GENERIC_DATAREFS.paused,
      GENERIC_DATAREFS.airspeed,
      GENERIC_DATAREFS.headingBug,
      GENERIC_COMMANDS.headingUp,
    ]);
  });
});

describe('feature lookup', () => {
  it('finds a declared feature and answers null for one the profile does not have', () => {
    expect(findFeature(GENERIC_PROFILE, FEATURE_FLIGHT_TELEMETRY)?.label).toBe('Live telemetry');
    expect(findFeature(GENERIC_PROFILE, 'autopilot')).toBeNull();
  });

  it('finds the dataref a feature writes to, and its command', () => {
    expect(writeBindingOf(GENERIC_PROFILE, FEATURE_HEADING_CONTROL)?.name).toBe(
      GENERIC_DATAREFS.headingBug,
    );
    expect(commandBindingOf(GENERIC_PROFILE, FEATURE_HEADING_CONTROL)?.name).toBe(
      GENERIC_COMMANDS.headingUp,
    );
    expect(writeBindingOf(GENERIC_PROFILE, FEATURE_CONNECTION_HEALTH)).toBeNull();
  });
});

describe('the generic profile', () => {
  it('is the catalog fallback and matches generically', () => {
    expect(BUNDLED_PROFILES.generic).toBe(GENERIC_PROFILE);
    expect(GENERIC_PROFILE.match).toEqual({ kind: 'generic' });
    expect(GENERIC_PROFILE.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares the three Stage 1 features', () => {
    expect(GENERIC_PROFILE.features.map((feature) => feature.id)).toEqual([
      FEATURE_CONNECTION_HEALTH,
      FEATURE_FLIGHT_TELEMETRY,
      FEATURE_HEADING_CONTROL,
    ]);
  });

  it('binds connection health to the simulator clock and the pause flag', () => {
    const health = findFeature(GENERIC_PROFILE, FEATURE_CONNECTION_HEALTH);
    expect(health?.bindings.map((binding) => [binding.name, binding.required])).toEqual([
      [GENERIC_DATAREFS.heartbeat, true],
      [GENERIC_DATAREFS.paused, false],
    ]);
  });

  it('gives every binding a purpose, because the view prints it when the name is missing', () => {
    for (const binding of profileBindings(GENERIC_PROFILE)) {
      expect(binding.purpose.length).toBeGreaterThan(0);
    }
  });

  it('ships no named profiles yet; Stage 4 adds the first one', () => {
    expect(BUNDLED_PROFILES.named).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts`
Expected: FAIL — cannot find module `@/domain/aircraft/profile`.

- [ ] **Step 3: Write the profile types**

`src/domain/aircraft/profile.ts`:

```ts
export type BindingKind = 'dataref' | 'command';

export interface BindingSpec {
  kind: BindingKind;
  name: string;
  /** false: the feature still works without it, with less. */
  required: boolean;
  /** The feature writes to it, so a read-only resolution is a miss (R9). */
  write?: boolean;
  /** What it does, in the pilot's words. Printed beside the name when it is missing (R7). */
  purpose: string;
}

export interface FeatureSpec {
  id: string;
  label: string;
  bindings: readonly BindingSpec[];
}

export type MatchRule = { kind: 'generic' } | { kind: 'icao'; codes: readonly string[] };

export interface AircraftProfile {
  id: string;
  name: string;
  version: string;
  match: MatchRule;
  /** DataRef carrying the add-on's own version string, when it publishes one (R12). */
  addOnVersionDataRef?: string;
  /** Add-on versions this profile was written against (R12). */
  testedWith?: readonly string[];
  features: readonly FeatureSpec[];
}

export interface ProfileCatalog {
  generic: AircraftProfile;
  named: readonly AircraftProfile[];
}

/**
 * Every distinct name the profile declares, in declaration order — the probe list. Only `kind`,
 * `name` and `write` matter here: whether a miss costs a feature is decided per feature by
 * `deriveFeatureAvailability`, so a name two features declare differently is probed once, for the
 * stricter of the two.
 */
export function profileBindings(profile: AircraftProfile): readonly BindingSpec[] {
  const byName = new Map<string, BindingSpec>();
  for (const feature of profile.features) {
    for (const binding of feature.bindings) {
      const seen = byName.get(binding.name);
      if (seen === undefined) {
        byName.set(binding.name, binding);
      } else if (binding.write === true && seen.write !== true) {
        byName.set(binding.name, { ...seen, write: true });
      }
    }
  }
  return [...byName.values()];
}

export function findFeature(profile: AircraftProfile, featureId: string): FeatureSpec | null {
  return profile.features.find((feature) => feature.id === featureId) ?? null;
}

/** The DataRef a feature writes to, for a control that has to know which name backs it. */
export function writeBindingOf(profile: AircraftProfile, featureId: string): BindingSpec | null {
  const feature = findFeature(profile, featureId);
  return (
    feature?.bindings.find((binding) => binding.kind === 'dataref' && binding.write === true) ??
    null
  );
}

export function commandBindingOf(profile: AircraftProfile, featureId: string): BindingSpec | null {
  const feature = findFeature(profile, featureId);
  return feature?.bindings.find((binding) => binding.kind === 'command') ?? null;
}
```

- [ ] **Step 4: Write the generic profile**

`src/domain/aircraft/profiles/generic.ts`:

```ts
import type { AircraftProfile } from '@/domain/aircraft/profile';

/**
 * Laminar names, verified against Laminar Research's `DataRefs.txt` and `Commands.txt`
 * (see docs/xplane.md). `sim/time/paused` is the one community-sourced name here, which is why
 * its binding is optional.
 */
export const GENERIC_DATAREFS = {
  heartbeat: 'sim/time/total_running_time_sec',
  paused: 'sim/time/paused',
  airspeed: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
  headingBug: 'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
} as const;

export const GENERIC_COMMANDS = {
  headingUp: 'sim/autopilot/heading_up',
} as const;

export const FEATURE_CONNECTION_HEALTH = 'connection-health';
export const FEATURE_FLIGHT_TELEMETRY = 'flight-telemetry';
export const FEATURE_HEADING_CONTROL = 'heading-control';

/**
 * The fallback for every aircraft, and the only profile Avionix ships today. Add-ons that reuse
 * Laminar names inherit it; one that renames a control needs a profile of its own (Stage 4).
 *
 * Connection health binds to `sim/time/*`, which is simulator-global: no aircraft can rename it,
 * which is why `HealthMonitor` may read those two names directly instead of through the profile.
 */
export const GENERIC_PROFILE: AircraftProfile = {
  id: 'avionix.generic',
  name: 'Generic X-Plane aircraft',
  version: '1.0.0',
  match: { kind: 'generic' },
  features: [
    {
      id: FEATURE_CONNECTION_HEALTH,
      label: 'Connection health',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.heartbeat,
          required: true,
          purpose: 'Simulator clock, which tells live data from frozen data',
        },
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.paused,
          required: false,
          purpose: 'Pause flag, which tells a paused simulator from a stopped one',
        },
      ],
    },
    {
      id: FEATURE_FLIGHT_TELEMETRY,
      label: 'Live telemetry',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.airspeed,
          required: true,
          purpose: 'Indicated airspeed',
        },
      ],
    },
    {
      id: FEATURE_HEADING_CONTROL,
      label: 'Heading control',
      bindings: [
        {
          kind: 'dataref',
          name: GENERIC_DATAREFS.headingBug,
          required: true,
          write: true,
          purpose: 'Heading bug, written when you set a heading',
        },
        {
          kind: 'command',
          name: GENERIC_COMMANDS.headingUp,
          required: true,
          purpose: 'Heading up control',
        },
      ],
    },
  ],
};
```

`src/domain/aircraft/profiles/catalog.ts`:

```ts
import type { ProfileCatalog } from '@/domain/aircraft/profile';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';

/**
 * Every profile that ships with the app. `named` is empty until Stage 4 adds the first
 * aircraft-specific profile; the selection logic is already written for it.
 */
export const BUNDLED_PROFILES: ProfileCatalog = {
  generic: GENERIC_PROFILE,
  named: [],
};
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest tests/unit/domain/aircraft-profile.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: everything passes.

- [ ] **Step 7: Commit**

```bash
git add src/domain/aircraft tests/unit/domain/aircraft-profile.test.ts
git commit -m "$(cat <<'MSG'
feat(aircraft): add profile types and the generic Laminar profile

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Deterministic profile selection and the add-on version warning

**Files:**

- Create: `src/domain/aircraft/profile-selection.ts`
- Create: `src/domain/aircraft/version-check.ts`
- Test: `tests/unit/domain/profile-selection.test.ts`

**Interfaces:**

- Consumes: `AircraftProfile`, `ProfileCatalog`, `MatchRule` from `@/domain/aircraft/profile`;
  `AircraftIdentity`, `UNIDENTIFIED` from `@/domain/aircraft/aircraft-identity`;
  `GENERIC_PROFILE` from `@/domain/aircraft/profiles/generic`.
- Produces:
  - `type SelectionReason = 'matched' | 'fallback'`
  - `interface ProfileSelection { profile: AircraftProfile; reason: SelectionReason }`
  - `selectProfile(catalog: ProfileCatalog, identity: AircraftIdentity): ProfileSelection`
  - `versionWarning(profile: AircraftProfile, identity: AircraftIdentity): string | null`

- [ ] **Step 1: Write the failing test**

`tests/unit/domain/profile-selection.test.ts`:

```ts
import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import type { AircraftProfile, ProfileCatalog } from '@/domain/aircraft/profile';
import { selectProfile } from '@/domain/aircraft/profile-selection';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { versionWarning } from '@/domain/aircraft/version-check';

function named(id: string, codes: readonly string[]): AircraftProfile {
  return {
    id,
    name: `Profile ${id}`,
    version: '1.0.0',
    match: { kind: 'icao', codes },
    features: [],
  };
}

const zibo = named('vendor.zibo', ['B738']);
const other = named('avionix.b738', ['b738']);
const catalog: ProfileCatalog = { generic: GENERIC_PROFILE, named: [zibo, other] };

describe('selectProfile', () => {
  it('falls back to the generic profile when nothing was identified', () => {
    expect(selectProfile(catalog, UNIDENTIFIED)).toEqual({
      profile: GENERIC_PROFILE,
      reason: 'fallback',
    });
  });

  it('falls back when no named profile claims the type code', () => {
    const selection = selectProfile(catalog, { ...UNIDENTIFIED, icaoType: 'C172' });
    expect(selection).toEqual({ profile: GENERIC_PROFILE, reason: 'fallback' });
  });

  it('matches a named profile on the type code, ignoring case', () => {
    const selection = selectProfile(
      { generic: GENERIC_PROFILE, named: [zibo] },
      { ...UNIDENTIFIED, icaoType: 'b738' },
    );
    expect(selection).toEqual({ profile: zibo, reason: 'matched' });
  });

  it('resolves two claimants by profile id, not by array order', () => {
    const forwards = selectProfile(catalog, { ...UNIDENTIFIED, icaoType: 'B738' });
    const backwards = selectProfile(
      { generic: GENERIC_PROFILE, named: [other, zibo] },
      { ...UNIDENTIFIED, icaoType: 'B738' },
    );
    expect(forwards.profile.id).toBe('avionix.b738');
    expect(backwards.profile.id).toBe('avionix.b738');
  });

  it('never selects the generic profile as a match', () => {
    const selection = selectProfile(
      { generic: GENERIC_PROFILE, named: [] },
      { ...UNIDENTIFIED, icaoType: 'B738' },
    );
    expect(selection.reason).toBe('fallback');
  });
});

describe('versionWarning', () => {
  const tested: AircraftProfile = { ...zibo, testedWith: ['4.2', '4.3'] };

  it('says nothing when the profile declares no tested versions', () => {
    expect(versionWarning(zibo, { ...UNIDENTIFIED, addOnVersion: '9.9' })).toBeNull();
  });

  it('says nothing when the aircraft reported no add-on version', () => {
    expect(versionWarning(tested, UNIDENTIFIED)).toBeNull();
  });

  it('says nothing when the reported version is one it was tested against', () => {
    expect(versionWarning(tested, { ...UNIDENTIFIED, addOnVersion: '4.3' })).toBeNull();
  });

  it('warns, naming both sides, when the version is outside what it was written for', () => {
    expect(versionWarning(tested, { ...UNIDENTIFIED, addOnVersion: '4.4' })).toBe(
      'This profile was written for 4.2 and 4.3. The aircraft reports 4.4, so some controls may have moved.',
    );
  });

  it('lists three or more tested versions readably', () => {
    const three = { ...tested, testedWith: ['4.1', '4.2', '4.3'] };
    expect(versionWarning(three, { ...UNIDENTIFIED, addOnVersion: '4.4' })).toContain(
      '4.1, 4.2 and 4.3',
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/domain/profile-selection.test.ts`
Expected: FAIL — cannot find module `@/domain/aircraft/profile-selection`.

- [ ] **Step 3: Write the selection module**

`src/domain/aircraft/profile-selection.ts`:

```ts
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import type { AircraftProfile, MatchRule, ProfileCatalog } from '@/domain/aircraft/profile';

export type SelectionReason = 'matched' | 'fallback';

export interface ProfileSelection {
  profile: AircraftProfile;
  reason: SelectionReason;
}

function matches(rule: MatchRule, identity: AircraftIdentity): boolean {
  // The generic profile is the catalog's fallback, never a candidate: reaching it through a match
  // would report "matched automatically" for an aircraft nothing recognised.
  if (rule.kind === 'generic' || identity.icaoType === null) {
    return false;
  }
  const code = identity.icaoType.toUpperCase();
  return rule.codes.some((candidate) => candidate.toUpperCase() === code);
}

/**
 * Deterministic by construction (R3): among the profiles whose rule fits, the lowest id wins, so
 * two profiles claiming the same aircraft always resolve the same way rather than by whichever
 * order the catalog happens to list them in.
 */
export function selectProfile(
  catalog: ProfileCatalog,
  identity: AircraftIdentity,
): ProfileSelection {
  const candidates = catalog.named
    .filter((profile) => matches(profile.match, identity))
    .sort((a, b) => a.id.localeCompare(b.id));
  const matched = candidates[0];
  return matched === undefined
    ? { profile: catalog.generic, reason: 'fallback' }
    : { profile: matched, reason: 'matched' };
}
```

- [ ] **Step 4: Write the version check**

`src/domain/aircraft/version-check.ts`:

```ts
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import type { AircraftProfile } from '@/domain/aircraft/profile';

function formatList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? '';
  }
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1] ?? ''}`;
}

/**
 * A sentence when the aircraft reports an add-on version the profile was not written for,
 * otherwise null (R12). It is a warning and never an error: the profile stays selected and every
 * name that still resolves still works. The generic profile declares neither a version DataRef nor
 * tested versions, so the generic case is null by construction.
 */
export function versionWarning(
  profile: AircraftProfile,
  identity: AircraftIdentity,
): string | null {
  const tested = profile.testedWith ?? [];
  const reported = identity.addOnVersion;
  if (tested.length === 0 || reported === null || tested.includes(reported)) {
    return null;
  }
  return `This profile was written for ${formatList(tested)}. The aircraft reports ${reported}, so some controls may have moved.`;
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest tests/unit/domain/profile-selection.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

- [ ] **Step 7: Commit**

```bash
git add src/domain/aircraft tests/unit/domain/profile-selection.test.ts
git commit -m "$(cat <<'MSG'
feat(aircraft): select a profile deterministically and warn on a version gap

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: Per-feature availability

The rule, in order (R6): any **required** binding missing or read-only makes the feature
`unavailable`; otherwise any **optional** binding missing makes it `partial`; otherwise
`available`. A feature with any binding that was never probed is `unknown` — a partially probed
feature must not read as healthy.

**Files:**

- Create: `src/domain/aircraft/availability.ts`
- Test: `tests/unit/domain/availability.test.ts`

**Interfaces:**

- Consumes: `AircraftProfile`, `BindingKind`, `FeatureSpec` from `@/domain/aircraft/profile`.
- Produces:
  - `type BindingStatus = 'ok' | 'missing' | 'readOnly'`
  - `interface BindingResult { name: string; kind: BindingKind; status: BindingStatus }`
  - `type BindingResults = Record<string, BindingResult | undefined>`
  - `type FeatureStatus = 'available' | 'partial' | 'unavailable' | 'unknown'`
  - `interface MissingBinding { name: string; kind: BindingKind; purpose: string; status: 'missing' | 'readOnly' }`
  - `interface FeatureAvailability { id: string; label: string; status: FeatureStatus; missing: readonly MissingBinding[] }`
  - `FEATURE_STATUS_LABEL: Record<FeatureStatus, string>`
  - `BINDING_MISS_LABEL: Record<'missing' | 'readOnly', string>`
  - `deriveFeatureAvailability(feature: FeatureSpec, results: BindingResults): FeatureAvailability`
  - `deriveAvailability(profile: AircraftProfile, results: BindingResults): FeatureAvailability[]`
  - `summariseAvailability(features: readonly FeatureAvailability[]): string`

- [ ] **Step 1: Write the failing test**

`tests/unit/domain/availability.test.ts`:

```ts
import {
  type BindingResults,
  FEATURE_STATUS_LABEL,
  deriveAvailability,
  deriveFeatureAvailability,
  summariseAvailability,
} from '@/domain/aircraft/availability';
import type { FeatureSpec } from '@/domain/aircraft/profile';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';

const feature: FeatureSpec = {
  id: 'radios',
  label: 'Radios',
  bindings: [
    { kind: 'dataref', name: 'com1', required: true, write: true, purpose: 'COM1 frequency' },
    { kind: 'dataref', name: 'com2', required: false, purpose: 'COM2 frequency' },
    { kind: 'command', name: 'swap', required: true, purpose: 'Standby swap' },
  ],
};

function results(entries: Record<string, 'ok' | 'missing' | 'readOnly'>): BindingResults {
  const out: BindingResults = {};
  for (const [name, status] of Object.entries(entries)) {
    out[name] = { name, kind: name === 'swap' ? 'command' : 'dataref', status };
  }
  return out;
}

describe('deriveFeatureAvailability', () => {
  it('is available when every binding resolved', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'ok', com2: 'ok', swap: 'ok' }),
    );
    expect(derived).toEqual({ id: 'radios', label: 'Radios', status: 'available', missing: [] });
  });

  it('is partly available when only an optional binding is missing, and names it', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'ok', com2: 'missing', swap: 'ok' }),
    );
    expect(derived.status).toBe('partial');
    expect(derived.missing).toEqual([
      { name: 'com2', kind: 'dataref', purpose: 'COM2 frequency', status: 'missing' },
    ]);
  });

  it('is unavailable when a required binding is missing', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'ok', com2: 'ok', swap: 'missing' }),
    );
    expect(derived.status).toBe('unavailable');
    expect(derived.missing.map((item) => item.name)).toEqual(['swap']);
  });

  it('is unavailable when a required binding it writes to is read-only', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'readOnly', com2: 'ok', swap: 'ok' }),
    );
    expect(derived.status).toBe('unavailable');
    expect(derived.missing[0]?.status).toBe('readOnly');
  });

  it('lists every miss, not only the first', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'missing', com2: 'missing', swap: 'missing' }),
    );
    expect(derived.missing).toHaveLength(3);
  });

  it('is unknown when any binding was never probed', () => {
    expect(deriveFeatureAvailability(feature, {}).status).toBe('unknown');
    expect(deriveFeatureAvailability(feature, results({ com1: 'ok' })).status).toBe('unknown');
  });

  it('is available when the feature declares no bindings at all', () => {
    expect(
      deriveFeatureAvailability({ id: 'empty', label: 'Empty', bindings: [] }, {}).status,
    ).toBe('available');
  });
});

describe('deriveAvailability', () => {
  it('derives one entry per profile feature, in declaration order', () => {
    const derived = deriveAvailability(GENERIC_PROFILE, {});
    expect(derived.map((item) => item.id)).toEqual(
      GENERIC_PROFILE.features.map((item) => item.id),
    );
  });
});

describe('summariseAvailability', () => {
  const entry = (id: string, status: 'available' | 'partial' | 'unavailable' | 'unknown') => ({
    id,
    label: id,
    status,
    missing: [],
  });

  it('says so when everything is available', () => {
    expect(summariseAvailability([entry('a', 'available'), entry('b', 'available')])).toBe(
      'All features available',
    );
  });

  it('counts what is degraded, worst first', () => {
    expect(
      summariseAvailability([
        entry('a', 'available'),
        entry('b', 'partial'),
        entry('c', 'unavailable'),
        entry('d', 'unavailable'),
      ]),
    ).toBe('2 features not available, 1 partly available');
  });

  it('counts what has not been checked', () => {
    expect(summariseAvailability([entry('a', 'unknown')])).toBe('1 feature not checked yet');
  });

  it('says nothing was checked when the profile has no features', () => {
    expect(summariseAvailability([])).toBe('No features to check');
  });
});

describe('FEATURE_STATUS_LABEL', () => {
  it('gives every status words the pilot reads', () => {
    expect(FEATURE_STATUS_LABEL).toEqual({
      available: 'available',
      partial: 'partly available',
      unavailable: 'not available on this aircraft',
      unknown: 'not checked yet',
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/domain/availability.test.ts`
Expected: FAIL — cannot find module `@/domain/aircraft/availability`.

- [ ] **Step 3: Write the module**

`src/domain/aircraft/availability.ts`:

```ts
import type { AircraftProfile, BindingKind, FeatureSpec } from '@/domain/aircraft/profile';

export type BindingStatus = 'ok' | 'missing' | 'readOnly';

export interface BindingResult {
  name: string;
  kind: BindingKind;
  status: BindingStatus;
}

/** Probe results by DataRef or command name. `undefined` means the name was never probed. */
export type BindingResults = Record<string, BindingResult | undefined>;

export type FeatureStatus = 'available' | 'partial' | 'unavailable' | 'unknown';

export interface MissingBinding {
  name: string;
  kind: BindingKind;
  purpose: string;
  status: 'missing' | 'readOnly';
}

export interface FeatureAvailability {
  id: string;
  label: string;
  status: FeatureStatus;
  missing: readonly MissingBinding[];
}

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  available: 'available',
  partial: 'partly available',
  unavailable: 'not available on this aircraft',
  unknown: 'not checked yet',
};

export const BINDING_MISS_LABEL: Record<'missing' | 'readOnly', string> = {
  missing: 'not present on this aircraft',
  readOnly: 'read-only on this aircraft',
};

/**
 * R6, in order: a required miss costs the feature, an optional miss degrades it, anything
 * unprobed leaves it unknown. A feature is never reported healthy on incomplete evidence.
 */
export function deriveFeatureAvailability(
  feature: FeatureSpec,
  results: BindingResults,
): FeatureAvailability {
  const missing: MissingBinding[] = [];
  let requiredMiss = false;
  let optionalMiss = false;
  for (const binding of feature.bindings) {
    const result = results[binding.name];
    if (result === undefined) {
      return { id: feature.id, label: feature.label, status: 'unknown', missing: [] };
    }
    if (result.status === 'ok') {
      continue;
    }
    missing.push({
      name: binding.name,
      kind: binding.kind,
      purpose: binding.purpose,
      status: result.status,
    });
    if (binding.required) {
      requiredMiss = true;
    } else {
      optionalMiss = true;
    }
  }
  const status: FeatureStatus = requiredMiss
    ? 'unavailable'
    : optionalMiss
      ? 'partial'
      : 'available';
  return { id: feature.id, label: feature.label, status, missing };
}

export function deriveAvailability(
  profile: AircraftProfile,
  results: BindingResults,
): FeatureAvailability[] {
  return profile.features.map((feature) => deriveFeatureAvailability(feature, results));
}

function plural(count: number): string {
  return count === 1 ? 'feature' : 'features';
}

/** The one-line verdict on the aircraft summary row. Worst news first. */
export function summariseAvailability(features: readonly FeatureAvailability[]): string {
  if (features.length === 0) {
    return 'No features to check';
  }
  const count = (status: FeatureStatus): number =>
    features.filter((feature) => feature.status === status).length;
  const unavailable = count('unavailable');
  const partial = count('partial');
  const unknown = count('unknown');
  const parts: string[] = [];
  if (unavailable > 0) {
    parts.push(`${unavailable} ${plural(unavailable)} not available`);
  }
  if (partial > 0) {
    parts.push(`${partial} ${parts.length === 0 ? `${plural(partial)} ` : ''}partly available`);
  }
  if (unknown > 0) {
    parts.push(`${unknown} ${parts.length === 0 ? `${plural(unknown)} ` : ''}not checked yet`);
  }
  return parts.length === 0 ? 'All features available' : parts.join(', ');
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest tests/unit/domain/availability.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/domain/aircraft/availability.ts tests/unit/domain/availability.test.ts
git commit -m "$(cat <<'MSG'
feat(aircraft): derive per-feature availability from probe results

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Bounded-concurrency probing

Resolution today is one `Promise.all` over four names. A profile declares many more — a Stage 4
737 profile will declare dozens — so the probe runs with a fixed number of requests in flight
rather than all at once.

**Files:**

- Create: `src/utils/concurrency.ts`
- Create: `src/application/aircraft-probe.ts`
- Test: `tests/unit/utils/concurrency.test.ts`
- Test: `tests/unit/application/aircraft-probe.test.ts`

**Interfaces:**

- Consumes: `decodeDataRefString`; `AircraftIdentity`, `UNIDENTIFIED`; `IDENTITY_DATAREFS`,
  `IDENTITY_FIELDS`, `IdentityField`; `BindingSpec`; `BindingResult`, `BindingResults`;
  `DataRefDescriptor`, `CommandDescriptor` from `@/domain/simulator/types`; `SimulatorClient`.
- Produces:
  - `mapWithConcurrency<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]>`
  - `PROBE_CONCURRENCY = 6`
  - `type ProbeClient = Pick<SimulatorClient, 'findDataRef' | 'findCommand' | 'getDataRefValue'>`
  - `interface IdentificationResult { identity: AircraftIdentity; results: BindingResults; dataRefs: DataRefDescriptor[] }`
  - `identifyAircraft(client: ProbeClient, concurrency?: number): Promise<IdentificationResult>`
  - `interface AddOnVersionResult { version: string | null; result: BindingResult; dataRef: DataRefDescriptor | null }`
  - `readAddOnVersion(client: ProbeClient, name: string): Promise<AddOnVersionResult>`
  - `interface ProbeResult { results: BindingResults; dataRefs: DataRefDescriptor[]; commands: Map<string, CommandDescriptor>; writabilityReported: boolean; allMissing: boolean }`
  - `probeBindings(client: ProbeClient, bindings: readonly BindingSpec[], concurrency?: number): Promise<ProbeResult>`

- [ ] **Step 1: Write the failing concurrency test**

`tests/unit/utils/concurrency.test.ts`:

```ts
import { mapWithConcurrency } from '@/utils/concurrency';

describe('mapWithConcurrency', () => {
  it('keeps results in input order', async () => {
    const delays = [30, 10, 20];
    const results = await mapWithConcurrency(delays, 3, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it('never runs more than the limit at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([...Array(20).keys()], 4, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return value;
    });
    expect(peak).toBe(4);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 10, async (value) => value * 2)).toEqual([2, 4]);
  });

  it('rejects with the first failure instead of hiding it', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (value) => {
        if (value === 2) {
          throw new Error('boom');
        }
        return value;
      }),
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/utils/concurrency.test.ts`
Expected: FAIL — cannot find module `@/utils/concurrency`.

- [ ] **Step 3: Write the helper**

`src/utils/concurrency.ts`:

```ts
/**
 * Runs `run` over `items` with at most `limit` calls in flight, preserving input order in the
 * result. A profile can declare dozens of names; firing every lookup at once would bury a phone's
 * connection to a PC on the other side of a home router.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      if (item === undefined) {
        return;
      }
      results[index] = await run(item);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest tests/unit/utils/concurrency.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing probe test**

`tests/unit/application/aircraft-probe.test.ts`:

```ts
import {
  PROBE_CONCURRENCY,
  type ProbeClient,
  identifyAircraft,
  probeBindings,
  readAddOnVersion,
} from '@/application/aircraft-probe';
import { IDENTITY_DATAREFS } from '@/domain/aircraft/identity-datarefs';
import type { BindingSpec } from '@/domain/aircraft/profile';
import type { CommandDescriptor, DataRefDescriptor } from '@/domain/simulator/types';

interface FakeOptions {
  dataRefs?: Record<string, DataRefDescriptor>;
  values?: Record<number, string>;
  commands?: Record<string, CommandDescriptor>;
}

function fakeClient(options: FakeOptions = {}): ProbeClient & { inFlightPeak: number } {
  const dataRefs = options.dataRefs ?? {};
  const values = options.values ?? {};
  const commands = options.commands ?? {};
  let inFlight = 0;
  const client = {
    inFlightPeak: 0,
    async findDataRef(name: string) {
      inFlight += 1;
      client.inFlightPeak = Math.max(client.inFlightPeak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return dataRefs[name] ?? null;
    },
    async findCommand(name: string) {
      return commands[name] ?? null;
    },
    async getDataRefValue(id: number) {
      return values[id] ?? '';
    },
  };
  return client;
}

const text = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

describe('identifyAircraft', () => {
  it('reads and decodes the three identification datarefs', async () => {
    const client = fakeClient({
      dataRefs: {
        [IDENTITY_DATAREFS.icaoType]: {
          id: 1,
          name: IDENTITY_DATAREFS.icaoType,
          valueType: 'data',
        },
        [IDENTITY_DATAREFS.description]: {
          id: 2,
          name: IDENTITY_DATAREFS.description,
          valueType: 'data',
        },
        [IDENTITY_DATAREFS.tailNumber]: {
          id: 3,
          name: IDENTITY_DATAREFS.tailNumber,
          valueType: 'data',
        },
      },
      values: { 1: text('C172'), 2: text('Cessna 172 SP'), 3: text('N172SP') },
    });
    const { identity, results, dataRefs } = await identifyAircraft(client);
    expect(identity).toEqual({
      icaoType: 'C172',
      description: 'Cessna 172 SP',
      tailNumber: 'N172SP',
      addOnVersion: null,
    });
    expect(results[IDENTITY_DATAREFS.icaoType]?.status).toBe('ok');
    expect(dataRefs.map((descriptor) => descriptor.id)).toEqual([1, 2, 3]);
  });

  it('records a miss and keeps going, because identification never fails a connect', async () => {
    const client = fakeClient({
      dataRefs: {
        [IDENTITY_DATAREFS.tailNumber]: {
          id: 3,
          name: IDENTITY_DATAREFS.tailNumber,
          valueType: 'data',
        },
      },
      values: { 3: text('N172SP') },
    });
    const { identity, results, dataRefs } = await identifyAircraft(client);
    expect(identity.icaoType).toBeNull();
    expect(identity.tailNumber).toBe('N172SP');
    expect(results[IDENTITY_DATAREFS.icaoType]?.status).toBe('missing');
    expect(dataRefs).toHaveLength(1);
  });

  it('leaves a field null when the dataref resolves but holds nothing', async () => {
    const client = fakeClient({
      dataRefs: {
        [IDENTITY_DATAREFS.icaoType]: {
          id: 1,
          name: IDENTITY_DATAREFS.icaoType,
          valueType: 'data',
        },
      },
      values: { 1: '' },
    });
    const { identity, results } = await identifyAircraft(client);
    expect(identity.icaoType).toBeNull();
    // The name is there, so the binding resolved: only the aircraft has nothing to say.
    expect(results[IDENTITY_DATAREFS.icaoType]?.status).toBe('ok');
  });
});

describe('readAddOnVersion', () => {
  it('decodes the version when the dataref is there', async () => {
    const client = fakeClient({
      dataRefs: { 'b738/version': { id: 7, name: 'b738/version', valueType: 'data' } },
      values: { 7: text('4.4') },
    });
    const outcome = await readAddOnVersion(client, 'b738/version');
    expect(outcome.version).toBe('4.4');
    expect(outcome.result.status).toBe('ok');
    expect(outcome.dataRef?.id).toBe(7);
  });

  it('records a miss without a version', async () => {
    const outcome = await readAddOnVersion(fakeClient(), 'b738/version');
    expect(outcome.version).toBeNull();
    expect(outcome.result.status).toBe('missing');
    expect(outcome.dataRef).toBeNull();
  });
});

describe('probeBindings', () => {
  const bindings: readonly BindingSpec[] = [
    { kind: 'dataref', name: 'present', required: true, purpose: 'Present' },
    { kind: 'dataref', name: 'absent', required: true, purpose: 'Absent' },
    { kind: 'dataref', name: 'locked', required: true, write: true, purpose: 'Locked' },
    { kind: 'dataref', name: 'unreported', required: true, write: true, purpose: 'Unreported' },
    { kind: 'command', name: 'cmd', required: true, purpose: 'Command' },
  ];

  const client = () =>
    fakeClient({
      dataRefs: {
        present: { id: 1, name: 'present', valueType: 'float', isWritable: true },
        locked: { id: 2, name: 'locked', valueType: 'float', isWritable: false },
        unreported: { id: 3, name: 'unreported', valueType: 'float' },
      },
      commands: { cmd: { id: 9, name: 'cmd', description: 'Command' } },
    });

  it('records ok, missing and read-only per name without throwing', async () => {
    const probe = await probeBindings(client(), bindings);
    expect(probe.results.present?.status).toBe('ok');
    expect(probe.results.absent?.status).toBe('missing');
    expect(probe.results.locked?.status).toBe('readOnly');
    expect(probe.results.cmd).toEqual({ name: 'cmd', kind: 'command', status: 'ok' });
  });

  it('treats an unreported isWritable as writable', async () => {
    const probe = await probeBindings(client(), bindings);
    expect(probe.results.unreported?.status).toBe('ok');
    expect(probe.writabilityReported).toBe(true);
  });

  it('reports writability unreported when no descriptor carried the flag', async () => {
    const probe = await probeBindings(
      fakeClient({ dataRefs: { present: { id: 1, name: 'present', valueType: 'float' } } }),
      [bindings[0] as BindingSpec],
    );
    expect(probe.writabilityReported).toBe(false);
  });

  it('ignores isWritable false on a binding the app only reads', async () => {
    const probe = await probeBindings(
      fakeClient({
        dataRefs: { locked: { id: 2, name: 'locked', valueType: 'float', isWritable: false } },
      }),
      [{ kind: 'dataref', name: 'locked', required: true, purpose: 'Read only' }],
    );
    expect(probe.results.locked?.status).toBe('ok');
  });

  it('collects the resolved descriptors for the subscription', async () => {
    const probe = await probeBindings(client(), bindings);
    expect(probe.dataRefs.map((descriptor) => descriptor.name)).toEqual([
      'present',
      'locked',
      'unreported',
    ]);
    expect(probe.commands.get('cmd')?.id).toBe(9);
  });

  it('flags the case where nothing at all resolved', async () => {
    const probe = await probeBindings(fakeClient(), bindings);
    expect(probe.allMissing).toBe(true);
    expect((await probeBindings(client(), bindings)).allMissing).toBe(false);
    expect((await probeBindings(fakeClient(), [])).allMissing).toBe(false);
  });

  it('keeps at most `concurrency` lookups in flight', async () => {
    const many: BindingSpec[] = Array.from({ length: 20 }, (_, index) => ({
      kind: 'dataref',
      name: `n${index}`,
      required: true,
      purpose: 'Bulk',
    }));
    const probeClient = fakeClient();
    await probeBindings(probeClient, many, 3);
    expect(probeClient.inFlightPeak).toBe(3);
    expect(PROBE_CONCURRENCY).toBe(6);
  });

  it('lets a transport failure through, so a broken link is not read as a missing name', async () => {
    const failing: ProbeClient = {
      findDataRef: async () => {
        throw new Error('network down');
      },
      findCommand: async () => null,
      getDataRefValue: async () => 0,
    };
    await expect(probeBindings(failing, bindings)).rejects.toThrow('network down');
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx jest tests/unit/application/aircraft-probe.test.ts`
Expected: FAIL — cannot find module `@/application/aircraft-probe`.

- [ ] **Step 7: Write the probe**

`src/application/aircraft-probe.ts`:

```ts
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import type { BindingResult, BindingResults } from '@/domain/aircraft/availability';
import {
  IDENTITY_DATAREFS,
  IDENTITY_FIELDS,
  type IdentityField,
} from '@/domain/aircraft/identity-datarefs';
import type { BindingSpec } from '@/domain/aircraft/profile';
import { decodeDataRefString } from '@/domain/simulator/dataref-string';
import type { SimulatorClient } from '@/domain/simulator/simulator-client';
import type { CommandDescriptor, DataRefDescriptor } from '@/domain/simulator/types';
import { mapWithConcurrency } from '@/utils/concurrency';

/** Six at a time keeps a 60-name profile under a second on a LAN without flooding a phone's link. */
export const PROBE_CONCURRENCY = 6;

export type ProbeClient = Pick<
  SimulatorClient,
  'findDataRef' | 'findCommand' | 'getDataRefValue'
>;

export interface IdentificationResult {
  identity: AircraftIdentity;
  results: BindingResults;
  /** The resolved identification DataRefs, so the session can subscribe to them (R8). */
  dataRefs: DataRefDescriptor[];
}

/**
 * Reads a `data`-typed DataRef as text. A lookup miss is a recorded result; a transport failure is
 * left to throw, because a broken link must not be reported as a missing name.
 */
async function readText(
  client: ProbeClient,
  name: string,
): Promise<{ text: string | null; dataRef: DataRefDescriptor | null; result: BindingResult }> {
  const dataRef = await client.findDataRef(name);
  if (dataRef === null) {
    return { text: null, dataRef: null, result: { name, kind: 'dataref', status: 'missing' } };
  }
  const value = await client.getDataRefValue(dataRef.id);
  return {
    text: decodeDataRefString(value, dataRef.valueType),
    dataRef,
    // The name resolved: a DataRef holding an empty string is present, just silent.
    result: { name, kind: 'dataref', status: 'ok' },
  };
}

/** Phase 2 of the connect pipeline: who is flying. Never fails a connect (R1, R2). */
export async function identifyAircraft(
  client: ProbeClient,
  concurrency: number = PROBE_CONCURRENCY,
): Promise<IdentificationResult> {
  const reads = await mapWithConcurrency(IDENTITY_FIELDS, concurrency, (field: IdentityField) =>
    readText(client, IDENTITY_DATAREFS[field]).then((read) => ({ field, read })),
  );
  const identity: AircraftIdentity = { ...UNIDENTIFIED };
  const results: BindingResults = {};
  const dataRefs: DataRefDescriptor[] = [];
  for (const { field, read } of reads) {
    identity[field] = read.text;
    results[IDENTITY_DATAREFS[field]] = read.result;
    if (read.dataRef !== null) {
      dataRefs.push(read.dataRef);
    }
  }
  return { identity, results, dataRefs };
}

export interface AddOnVersionResult {
  version: string | null;
  result: BindingResult;
  dataRef: DataRefDescriptor | null;
}

/** The add-on's own version, when the selected profile names a DataRef carrying one (R12). */
export async function readAddOnVersion(
  client: ProbeClient,
  name: string,
): Promise<AddOnVersionResult> {
  const read = await readText(client, name);
  return { version: read.text, result: read.result, dataRef: read.dataRef };
}

export interface ProbeResult {
  results: BindingResults;
  dataRefs: DataRefDescriptor[];
  commands: Map<string, CommandDescriptor>;
  /** False when this X-Plane reported `is_writable` on no descriptor at all (pre-12.4.3). */
  writabilityReported: boolean;
  /** True when the profile declared names and not one of them resolved. */
  allMissing: boolean;
}

/** Phase 4 of the connect pipeline: which of the profile's names this aircraft actually has. */
export async function probeBindings(
  client: ProbeClient,
  bindings: readonly BindingSpec[],
  concurrency: number = PROBE_CONCURRENCY,
): Promise<ProbeResult> {
  const probes = await mapWithConcurrency(bindings, concurrency, async (binding) => {
    if (binding.kind === 'command') {
      const command = await client.findCommand(binding.name);
      return { binding, command, dataRef: null };
    }
    const dataRef = await client.findDataRef(binding.name);
    return { binding, command: null, dataRef };
  });

  const results: BindingResults = {};
  const dataRefs: DataRefDescriptor[] = [];
  const commands = new Map<string, CommandDescriptor>();
  let writabilityReported = false;
  let resolved = 0;
  for (const { binding, command, dataRef } of probes) {
    if (binding.kind === 'command') {
      results[binding.name] = {
        name: binding.name,
        kind: 'command',
        status: command === null ? 'missing' : 'ok',
      };
      if (command !== null) {
        commands.set(command.name, command);
        resolved += 1;
      }
      continue;
    }
    if (dataRef === null) {
      results[binding.name] = { name: binding.name, kind: 'dataref', status: 'missing' };
      continue;
    }
    if (dataRef.isWritable !== undefined) {
      writabilityReported = true;
    }
    // Only an explicit `false` disables a control: an X-Plane that declines to answer must not
    // cost the pilot a control that works (spec decision 5).
    const readOnly = binding.write === true && dataRef.isWritable === false;
    results[binding.name] = {
      name: binding.name,
      kind: 'dataref',
      status: readOnly ? 'readOnly' : 'ok',
    };
    dataRefs.push(dataRef);
    if (!readOnly) {
      resolved += 1;
    }
  }
  return {
    results,
    dataRefs,
    commands,
    writabilityReported,
    allMissing: bindings.length > 0 && resolved === 0,
  };
}
```

- [ ] **Step 8: Run the test and watch it pass**

Run: `npx jest tests/unit/application/aircraft-probe.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 9: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

- [ ] **Step 10: Commit**

```bash
git add src/utils/concurrency.ts src/application/aircraft-probe.ts tests/unit/utils/concurrency.test.ts tests/unit/application/aircraft-probe.test.ts
git commit -m "$(cat <<'MSG'
feat(aircraft): identify the aircraft and probe a profile's bindings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: The compatibility snapshot

The snapshot the UI reads. `checkedAt` is a fact; "not current" is derived in presentation from
the link state, following F-02's facts-versus-derivation split rather than storing a flag that
goes stale the moment the link drops.

**Files:**

- Create: `src/application/compatibility.ts`
- Modify: `src/application/session-snapshot.ts`
- Test: `tests/unit/application/compatibility.test.ts`
- Test: `tests/unit/application/session-snapshot.test.ts` (rewrite the `bindings` describe block)

**Interfaces:**

- Consumes: `AircraftIdentity`, `UNIDENTIFIED`; `AircraftProfile`, `profileBindings`;
  `FeatureAvailability`, `FeatureStatus`, `BindingResults`; `SelectionReason`;
  `IDENTITY_DATAREF_NAMES`; `GENERIC_PROFILE`.
- Produces:
  - `interface CompatibilitySnapshot` (fields below)
  - `initialCompatibility(profile: AircraftProfile): CompatibilitySnapshot`
  - `featureOf(compatibility: CompatibilitySnapshot, featureId: string): FeatureAvailability | null`
  - `featureStatus(compatibility: CompatibilitySnapshot, featureId: string): FeatureStatus`
  - `IDENTIFICATION_LABEL = 'Aircraft identification'`
  - `bindingFeatureLabels(profile: AircraftProfile): Record<string, string>`
  - `snapshotDataRefNames(profile: AircraftProfile): string[]`
  - `CompatibilitySnapshot.bindingLabels: Record<string, string>`
  - `SessionSnapshot.compatibility: CompatibilitySnapshot`
  - `initialSnapshot(profile: AircraftProfile, reconnectBudget?: number): SessionSnapshot`

- [ ] **Step 1: Write the failing test**

`tests/unit/application/compatibility.test.ts`:

```ts
import {
  IDENTIFICATION_LABEL,
  bindingFeatureLabels,
  featureOf,
  featureStatus,
  initialCompatibility,
  snapshotDataRefNames,
} from '@/application/compatibility';
import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import { IDENTITY_DATAREFS } from '@/domain/aircraft/identity-datarefs';
import {
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';

describe('initialCompatibility', () => {
  const initial = initialCompatibility(GENERIC_PROFILE);

  it('starts unidentified, on the given profile, with nothing checked', () => {
    expect(initial.identity).toEqual(UNIDENTIFIED);
    expect(initial.identified).toBe(false);
    expect(initial.profileId).toBe(GENERIC_PROFILE.id);
    expect(initial.profileName).toBe(GENERIC_PROFILE.name);
    expect(initial.profileVersion).toBe(GENERIC_PROFILE.version);
    expect(initial.selection).toBe('fallback');
    expect(initial.checkedAt).toBeNull();
    expect(initial.bindings).toEqual({});
    expect(initial.bindingLabels[GENERIC_DATAREFS.airspeed]).toBe('Live telemetry');
    expect(initial.versionWarning).toBeNull();
    expect(initial.writabilityReported).toBe(false);
    expect(initial.testedWith).toEqual([]);
  });

  it('lists every feature of the profile as not checked yet', () => {
    expect(initial.features.map((feature) => feature.status)).toEqual(
      GENERIC_PROFILE.features.map(() => 'unknown'),
    );
  });
});

describe('feature lookup', () => {
  const initial = initialCompatibility(GENERIC_PROFILE);

  it('finds a feature the profile declares', () => {
    expect(featureOf(initial, FEATURE_HEADING_CONTROL)?.label).toBe('Heading control');
    expect(featureStatus(initial, FEATURE_HEADING_CONTROL)).toBe('unknown');
  });

  it('answers unknown for a feature this profile does not declare at all', () => {
    expect(featureOf(initial, 'autopilot')).toBeNull();
    expect(featureStatus(initial, 'autopilot')).toBe('unknown');
  });
});

describe('bindingFeatureLabels', () => {
  const labels = bindingFeatureLabels(GENERIC_PROFILE);

  it('names the feature behind every profile binding', () => {
    expect(labels[GENERIC_DATAREFS.airspeed]).toBe('Live telemetry');
    expect(labels[GENERIC_COMMANDS.headingUp]).toBe('Heading control');
  });

  it('names identification for the three identity datarefs', () => {
    expect(labels[IDENTITY_DATAREFS.tailNumber]).toBe(IDENTIFICATION_LABEL);
  });
});

describe('snapshotDataRefNames', () => {
  it('covers identification and every dataref the profile declares, commands excluded', () => {
    const names = snapshotDataRefNames(GENERIC_PROFILE);
    expect(names).toContain(IDENTITY_DATAREFS.icaoType);
    expect(names).toContain(GENERIC_DATAREFS.heartbeat);
    expect(names).not.toContain(GENERIC_COMMANDS.headingUp);
    expect(new Set(names).size).toBe(names.length);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/application/compatibility.test.ts`
Expected: FAIL — cannot find module `@/application/compatibility`.

- [ ] **Step 3: Write the module**

`src/application/compatibility.ts`:

```ts
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import { UNIDENTIFIED } from '@/domain/aircraft/aircraft-identity';
import type {
  BindingResults,
  FeatureAvailability,
  FeatureStatus,
} from '@/domain/aircraft/availability';
import { IDENTITY_DATAREF_NAMES } from '@/domain/aircraft/identity-datarefs';
import type { AircraftProfile } from '@/domain/aircraft/profile';
import type { SelectionReason } from '@/domain/aircraft/profile-selection';

export const IDENTIFICATION_LABEL = 'Aircraft identification';

/** What the app knows about the aircraft and how much of the profile it actually has. */
export interface CompatibilitySnapshot {
  identity: AircraftIdentity;
  /** False when X-Plane named no aircraft at all; the view then explains the fallback (R2). */
  identified: boolean;
  profileId: string;
  profileName: string;
  profileVersion: string;
  selection: SelectionReason;
  testedWith: readonly string[];
  versionWarning: string | null;
  features: readonly FeatureAvailability[];
  /** Per-name probe outcomes, identification DataRefs included. */
  bindings: BindingResults;
  /**
   * Which feature each bound name serves. Stored rather than derived, because the shareable
   * summary and the diagnostics screen see the snapshot, never the profile object.
   */
  bindingLabels: Record<string, string>;
  writabilityReported: boolean;
  /**
   * Wall clock of the last completed probe. "Not current" is not stored: it is derived in the
   * view from the link state, so it can never disagree with the link (R11).
   */
  checkedAt: number | null;
}

export function initialCompatibility(profile: AircraftProfile): CompatibilitySnapshot {
  return {
    identity: UNIDENTIFIED,
    identified: false,
    profileId: profile.id,
    profileName: profile.name,
    profileVersion: profile.version,
    selection: 'fallback',
    testedWith: profile.testedWith ?? [],
    versionWarning: null,
    features: profile.features.map((feature) => ({
      id: feature.id,
      label: feature.label,
      status: 'unknown' as const,
      missing: [],
    })),
    bindings: {},
    bindingLabels: bindingFeatureLabels(profile),
    writabilityReported: false,
    checkedAt: null,
  };
}

export function featureOf(
  compatibility: CompatibilitySnapshot,
  featureId: string,
): FeatureAvailability | null {
  return compatibility.features.find((feature) => feature.id === featureId) ?? null;
}

/**
 * `unknown` for a feature the selected profile does not declare, so a surface written against the
 * generic profile degrades against a future profile that omits it instead of crashing.
 */
export function featureStatus(
  compatibility: CompatibilitySnapshot,
  featureId: string,
): FeatureStatus {
  return featureOf(compatibility, featureId)?.status ?? 'unknown';
}

/** Which feature each name serves, so diagnostics can say what a missing name costs (F-02 R8). */
export function bindingFeatureLabels(profile: AircraftProfile): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const name of IDENTITY_DATAREF_NAMES) {
    labels[name] = IDENTIFICATION_LABEL;
  }
  for (const feature of profile.features) {
    for (const binding of feature.bindings) {
      labels[binding.name] ??= feature.label;
    }
  }
  return labels;
}

/** Every DataRef name the snapshot tracks a step for: identification plus the profile's own. */
export function snapshotDataRefNames(profile: AircraftProfile): string[] {
  const names = new Set<string>(IDENTITY_DATAREF_NAMES);
  for (const feature of profile.features) {
    for (const binding of feature.bindings) {
      if (binding.kind === 'dataref') {
        names.add(binding.name);
      }
    }
  }
  return [...names];
}
```

- [ ] **Step 4: Add `compatibility` to the session snapshot**

In `src/application/session-snapshot.ts`, add the imports and the field. Replace the
`initialSnapshot` function; `initialDiagnostics` is unchanged.

```ts
import {
  type CompatibilitySnapshot,
  initialCompatibility,
  snapshotDataRefNames,
} from '@/application/compatibility';
import type { AircraftProfile } from '@/domain/aircraft/profile';
```

Add to `SessionSnapshot`, after `health`:

```ts
  compatibility: CompatibilitySnapshot;
```

Replace `initialSnapshot`:

```ts
/**
 * A fresh snapshot for a session about to connect with `profile` selected. The profile decides
 * which DataRef names the diagnostics track, so the steps the screen shows always match the
 * names the session is about to resolve.
 */
export function initialSnapshot(profile: AircraftProfile, reconnectBudget = 5): SessionSnapshot {
  return {
    state: 'disconnected',
    config: null,
    connector: null,
    capabilities: null,
    apiVersion: null,
    diagnostics: initialDiagnostics(snapshotDataRefNames(profile)),
    telemetry: {},
    lastOperation: null,
    error: null,
    reconnectAttempt: 0,
    health: initialHealth(reconnectBudget),
    compatibility: initialCompatibility(profile),
  };
}
```

- [ ] **Step 5: Rewrite the snapshot test's binding expectations**

In `tests/unit/application/session-snapshot.test.ts`, replace the `@/application/mvp-bindings`
import and the whole `describe('bindings', ...)` block, and update `describe('initialSnapshot')`:

```ts
import { snapshotDataRefNames } from '@/application/compatibility';
import { initialHealth, initialSnapshot } from '@/application/session-snapshot';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
```

```ts
describe('initialSnapshot', () => {
  it('carries health and a diagnostics entry for every dataref the profile declares', () => {
    const snapshot = initialSnapshot(GENERIC_PROFILE, 5);
    expect(snapshot.health.reconnectBudget).toBe(5);
    expect(Object.keys(snapshot.diagnostics.dataRefs).sort()).toEqual(
      snapshotDataRefNames(GENERIC_PROFILE).sort(),
    );
  });

  it('starts on the given profile with nothing identified or checked', () => {
    const snapshot = initialSnapshot(GENERIC_PROFILE);
    expect(snapshot.compatibility.profileId).toBe(GENERIC_PROFILE.id);
    expect(snapshot.compatibility.checkedAt).toBeNull();
  });
});
```

(The `describe('bindings', ...)` block is deleted: `tests/unit/domain/aircraft-profile.test.ts`
now covers what it asserted.)

- [ ] **Step 6: Make the repository compile again**

`initialSnapshot`'s signature changed, so every caller breaks. There are 22 of them, and all take
the same edit: pass `GENERIC_PROFILE` where a name list was passed.

```bash
grep -rln 'initialSnapshot(' src tests | xargs sed -i ''   -e 's/initialSnapshot(ALL_DATAREF_NAMES/initialSnapshot(GENERIC_PROFILE/g'   -e 's/initialSnapshot(MVP_DATAREF_NAMES/initialSnapshot(GENERIC_PROFILE/g'
npm run typecheck
```

Then add `import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';` to each file
`tsc` names, and drop the `@/application/mvp-bindings` import wherever nothing else needs it.

In `src/application/simulator-session.ts` three call sites also change, leaving every other
behaviour alone — Task 8 rewrites the pipeline properly:

- In the constructor: `this.store = new Store(initialSnapshot(GENERIC_PROFILE, this.policy.maxAttempts));`
- In `connect()`: `...initialSnapshot(GENERIC_PROFILE, this.policy.maxAttempts),`
- In `scheduleReconnect()`: `...initialDiagnostics(snapshotDataRefNames(GENERIC_PROFILE)),`

with `import { snapshotDataRefNames } from '@/application/compatibility';` added. Keep the
existing `ALL_DATAREF_NAMES` import (the resolution loop still uses it) and the rest of the file
untouched.

- [ ] **Step 7: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: everything passes. `snapshotDataRefNames(GENERIC_PROFILE)` is a superset of
`ALL_DATAREF_NAMES` (it adds the three identification names), so the existing session tests, which
assert on specific names rather than on the whole key set, still pass.

- [ ] **Step 8: Commit**

```bash
git add src/application tests/unit/application
git commit -m "$(cat <<'MSG'
feat(aircraft): put the compatibility result on the session snapshot

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Point the codebase at the generic profile

Mechanical and behaviour-preserving: every name now comes from the profile. `mvp-bindings.ts`
shrinks to the three name lists `SimulatorSession`'s resolution loop still needs — derived from
the profile, so no name is written twice — and Task 8 deletes it when that loop goes.

There are about 140 references across 20 files. Do the bulk with `sed`, then let `tsc` find the
imports.

**Files:**

- Modify: `src/application/mvp-bindings.ts` (shrink)
- Modify: `src/application/health-monitor.ts`, `src/application/diagnostics-summary.ts`,
  `src/application/simulator-session.ts` (imports only)
- Modify: `src/features/mvp/TelemetryPanel.tsx`, `src/features/health/DiagnosticsScreen.tsx`
- Modify: every test importing `@/application/mvp-bindings` (14 files)

**Interfaces:**

- Consumes: `GENERIC_DATAREFS`, `GENERIC_COMMANDS`, `GENERIC_PROFILE`; `bindingFeatureLabels`;
  `CompatibilitySnapshot.bindingLabels`.
- Produces: `MVP_DATAREF_NAMES`, `OPTIONAL_DATAREF_NAMES`, `ALL_DATAREF_NAMES` keep their names and
  values; `MVP_DATAREFS`, `OPTIONAL_DATAREFS`, `MVP_COMMAND_HEADING_UP` and `BINDING_FEATURE` are
  gone.

- [ ] **Step 1: Rewrite `src/application/mvp-bindings.ts`**

```ts
import { GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';

/**
 * The three lists `SimulatorSession`'s current resolution loop still needs, derived from the
 * generic profile so no name is written twice. The next task replaces that loop with a
 * profile-driven probe and deletes this file.
 */
export const MVP_DATAREF_NAMES: readonly string[] = [
  GENERIC_DATAREFS.heartbeat,
  GENERIC_DATAREFS.airspeed,
  GENERIC_DATAREFS.headingBug,
];

export const OPTIONAL_DATAREF_NAMES: readonly string[] = [GENERIC_DATAREFS.paused];

export const ALL_DATAREF_NAMES: readonly string[] = [
  ...MVP_DATAREF_NAMES,
  ...OPTIONAL_DATAREF_NAMES,
];
```

- [ ] **Step 2: Rename the symbols everywhere**

```bash
FILES=$(grep -rl 'MVP_DATAREFS\|OPTIONAL_DATAREFS\|MVP_COMMAND_HEADING_UP\|BINDING_FEATURE' src tests)
sed -i '' \
  -e 's/MVP_DATAREFS\.heading\b/GENERIC_DATAREFS.headingBug/g' \
  -e 's/MVP_DATAREFS\./GENERIC_DATAREFS./g' \
  -e 's/OPTIONAL_DATAREFS\.paused/GENERIC_DATAREFS.paused/g' \
  -e 's/MVP_COMMAND_HEADING_UP/GENERIC_COMMANDS.headingUp/g' \
  $FILES
npm run typecheck
```

`tsc` now lists every file whose imports are wrong. Fix each import by hand:

- Anything using `GENERIC_DATAREFS` or `GENERIC_COMMANDS` imports them from
  `@/domain/aircraft/profiles/generic`.
- A file that imported *only* those symbols drops its `@/application/mvp-bindings` import.
- `sed` also rewrote the import specifiers themselves (`import { MVP_DATAREFS }` became
  `import { GENERIC_DATAREFS }`); move those names to the new import line rather than leaving two.
- `'sim/time/paused'` appears as a string literal in
  `tests/unit/application/simulator-session.test.ts` and in
  `tests/ui/diagnostics-screen.test.tsx`; leave those literals alone.

- [ ] **Step 3: Replace `BINDING_FEATURE` in `src/application/diagnostics-summary.ts`**

The summary sees a snapshot, never a profile object, so it reads the labels the snapshot carries:

```ts
  for (const [name, status] of Object.entries(diagnostics.dataRefs)) {
    const feature = snapshot.compatibility.bindingLabels[name] ?? 'unknown feature';
    lines.push(`  Value ${name} (${feature}): ${stepLabel(status)}`);
  }
  const commandName = GENERIC_COMMANDS.headingUp;
  const commandFeature = snapshot.compatibility.bindingLabels[commandName] ?? 'unknown feature';
  lines.push(`  Control: ${commandName} (${commandFeature}): ${stepLabel(diagnostics.command)}`);
```

with `import { GENERIC_COMMANDS } from '@/domain/aircraft/profiles/generic';` and the
`@/application/mvp-bindings` import removed.

- [ ] **Step 4: Replace `BINDING_FEATURE` in `src/features/health/DiagnosticsScreen.tsx`**

Same substitution: wherever the screen reads `BINDING_FEATURE[name]`, read
`snapshot.compatibility.bindingLabels[name] ?? 'unknown feature'`, and take the command name from
`GENERIC_COMMANDS.headingUp`.

- [ ] **Step 5: Fix the tests that assert on `BINDING_FEATURE`**

`tests/unit/application/diagnostics-summary.test.ts` and `tests/ui/diagnostics-screen.test.tsx`
build snapshots by hand. Where they previously imported `BINDING_FEATURE`, they now rely on the
snapshot's own `bindingLabels`, which `initialSnapshot(GENERIC_PROFILE)` already fills. Replace any
`BINDING_FEATURE[name]` in an expectation with the literal feature label the generic profile
declares (`'Connection health'`, `'Live telemetry'`, `'Heading control'`) — a test that looks the
expected string up through the same map as the code under test asserts nothing.

- [ ] **Step 6: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: everything passes with no behaviour change. If a test now fails, the rename changed
meaning somewhere — fix the rename, not the test.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'MSG'
refactor(aircraft): read every dataref name from the generic profile

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: The connect pipeline

`completeSessionSetup` becomes readiness gate → identify → select → probe. A binding miss no longer
fails a connect: the link stays up and the feature it serves is reported unavailable. This is the
task where the behaviour visibly changes, so several existing tests change with it.

**Files:**

- Modify: `src/application/simulator-session.ts`
- Delete: `src/application/mvp-bindings.ts`
- Modify: `tests/mock-xplane/mock-xplane-server.ts`
- Modify: `tests/unit/application/simulator-session.test.ts`
- Modify: `tests/integration/simulator-session.test.ts`, `tests/integration/xplane-client.test.ts`
- Test: `tests/integration/aircraft-compatibility.test.ts` (new)

**Interfaces:**

- Consumes: `identifyAircraft`, `readAddOnVersion`, `probeBindings`; `selectProfile`,
  `BUNDLED_PROFILES`; `profileBindings`, `writeBindingOf`, `commandBindingOf`;
  `deriveAvailability`; `versionWarning`; `isIdentified`; `featureStatus`,
  `bindingFeatureLabels`, `snapshotDataRefNames`, `initialCompatibility`;
  `FEATURE_HEADING_CONTROL`.
- Produces:
  - `SimulatorSession` keeps `connect`, `disconnect`, `pair`, `writeHeading`,
    `activateHeadingUp`, `store`.
  - `MockXPlaneServer` gains `addDataRef(dataRef: MockDataRef)`, `removeDataRef(name: string)`,
    and the `reportWritability?: boolean` option (default true).
  - Task 9 consumes the private `resolveBindings` and `ActiveConnection`.

- [ ] **Step 1: Teach the mock server about identification and write capability**

In `tests/mock-xplane/mock-xplane-server.ts`:

Replace the `acf_tailnum` entry in `DEFAULT_MOCK_DATAREFS` and add the two others, so the mock
flies a Cessna by default (values are base64: `C172`, `Cessna 172 SP`, `N172SP`):

```ts
  { id: 1005, name: 'sim/aircraft/view/acf_tailnum', valueType: 'data', value: 'TjE3MlNQ' },
  { id: 1006, name: 'sim/aircraft/view/acf_ICAO', valueType: 'data', value: 'QzE3Mg==' },
  {
    id: 1007,
    name: 'sim/aircraft/view/acf_descrip',
    valueType: 'data',
    value: 'Q2Vzc25hIDE3MiBTUA==',
  },
```

Add the option and the field:

```ts
export interface MockXPlaneOptions {
  // ... existing fields ...
  /** X-Plane 12.4.3 and newer report `is_writable`; set false to act like an older sim. */
  reportWritability?: boolean;
}
```

```ts
  private readonly reportWritability: boolean;
```

in the constructor: `this.reportWritability = options.reportWritability ?? true;`

In `handleVersioned`, the `/datarefs` branch maps the descriptor with the flag:

```ts
      this.json(res, 200, {
        data: selected.map((d) => ({
          id: d.id,
          name: d.name,
          value_type: d.valueType,
          ...(this.reportWritability ? { is_writable: d.writable === true } : {}),
        })),
      });
```

Add two runtime mutators next to `setDataRefValue`:

```ts
  /** Simulates a name that this aircraft does not have. */
  removeDataRef(name: string): void {
    const dataRef = this.getDataRefByName(name);
    if (dataRef === undefined) {
      throw new Error(`mock dataref ${name} not defined`);
    }
    this.dataRefs.delete(dataRef.id);
    for (const subs of this.subscriptions.values()) {
      subs.delete(dataRef.id);
    }
  }

  addDataRef(dataRef: MockDataRef): void {
    this.dataRefs.set(dataRef.id, { ...dataRef });
  }
```

- [ ] **Step 2: Fix the one client test that pinned the old tail number**

`tests/integration/xplane-client.test.ts` asserts `getDataRefValue(1005)` resolves to
`'TklsNzc='`. Change the expectation to `'TjE3MlNQ'`.

- [ ] **Step 3: Teach `FakeClient` about identification and writability**

In `tests/unit/application/simulator-session.test.ts`, replace the `findDataRef`,
`findCommand` and `getDataRefValue` members of `FakeClient` with a table-driven version, and add
the table above the class:

```ts
interface FakeDataRef {
  id: number;
  valueType: DataRefValueType;
  value?: DataRefValue;
  isWritable?: boolean;
}

const base64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

const DEFAULT_FAKE_DATAREFS: Record<string, FakeDataRef> = {
  [GENERIC_DATAREFS.heartbeat]: { id: 1, valueType: 'float' },
  [GENERIC_DATAREFS.airspeed]: { id: 2, valueType: 'float' },
  [GENERIC_DATAREFS.headingBug]: { id: 3, valueType: 'float', isWritable: true },
  [GENERIC_DATAREFS.paused]: { id: 4, valueType: 'float' },
  [IDENTITY_DATAREFS.icaoType]: { id: 5, valueType: 'data', value: base64('C172') },
  [IDENTITY_DATAREFS.description]: { id: 6, valueType: 'data', value: base64('Cessna 172 SP') },
  [IDENTITY_DATAREFS.tailNumber]: { id: 7, valueType: 'data', value: base64('N172SP') },
};
```

Inside `FakeClient`:

```ts
  dataRefs: Record<string, FakeDataRef> = { ...DEFAULT_FAKE_DATAREFS };

  findDataRef = jest.fn(async (name: string) => {
    if (name === this.missingDataRef) {
      return null;
    }
    const entry = this.dataRefs[name];
    if (entry === undefined) {
      return null;
    }
    const descriptor: DataRefDescriptor = { id: entry.id, name, valueType: entry.valueType };
    return entry.isWritable === undefined
      ? descriptor
      : { ...descriptor, isWritable: entry.isWritable };
  });

  findCommand = jest.fn(async (name: string) =>
    name === GENERIC_COMMANDS.headingUp && name !== this.missingCommand
      ? { id: 9, name, description: 'up' }
      : null,
  );

  getDataRefValue = jest.fn(async (id: number) => {
    const entry = Object.values(this.dataRefs).find((item) => item.id === id);
    return entry?.value ?? 0;
  });

  missingCommand: string | null = null;
```

with `import type { DataRefDescriptor, DataRefValue, DataRefValueType } from '@/domain/simulator/types';`
and `import { IDENTITY_DATAREFS } from '@/domain/aircraft/identity-datarefs';` added.

`dataRefCount` stays; the pipeline now reads it before probing.

- [ ] **Step 4: Rewrite the session's resolution into the pipeline**

In `src/application/simulator-session.ts`:

Replace the `@/application/mvp-bindings` import with:

```ts
import {
  type ProbeClient,
  identifyAircraft,
  probeBindings,
  readAddOnVersion,
} from '@/application/aircraft-probe';
import {
  type CompatibilitySnapshot,
  bindingFeatureLabels,
  featureStatus,
  snapshotDataRefNames,
} from '@/application/compatibility';
import { isIdentified } from '@/domain/aircraft/aircraft-identity';
import type { BindingResults } from '@/domain/aircraft/availability';
import { deriveAvailability } from '@/domain/aircraft/availability';
import type { AircraftProfile } from '@/domain/aircraft/profile';
import { commandBindingOf, profileBindings, writeBindingOf } from '@/domain/aircraft/profile';
import { selectProfile } from '@/domain/aircraft/profile-selection';
import { BUNDLED_PROFILES } from '@/domain/aircraft/profiles/catalog';
import { versionWarning } from '@/domain/aircraft/version-check';
```

and add `FEATURE_HEADING_CONTROL` to the `@/domain/aircraft/profiles/generic` import the previous
task left in place (`GENERIC_DATAREFS` is still used by `applyUpdates`).

Add the module-level helper next to `READINESS_RETRY_MS`:

```ts
/** X-Plane is up but has no flight loaded, so no DataRef exists to resolve yet. */
function simulatorNotReady(): AvionixError {
  return new AvionixError({
    code: 'SIMULATOR_NOT_READY',
    message:
      'X-Plane has no DataRefs registered yet (count is 0). Load a flight in X-Plane, ' +
      'then connect again.',
    retryable: true,
  });
}
```

Replace the `ActiveConnection` interface and add `SessionBindings`:

```ts
/** Everything one pass of the pipeline produced, before any of it reaches the store. */
interface SessionBindings {
  profile: AircraftProfile;
  compatibility: CompatibilitySnapshot;
  dataRefSteps: Record<string, StepStatus>;
  commandStep: StepStatus;
  dataRefsById: Map<number, DataRefDescriptor>;
  dataRefsByName: Map<string, DataRefDescriptor>;
  commandsByName: Map<string, CommandDescriptor>;
  /** The profile declared names and not one of them resolved. */
  allMissing: boolean;
}

interface ActiveConnection {
  generation: number;
  config: XPlaneConnectionConfig;
  client: SimulatorClient;
  profile: AircraftProfile;
  dataRefsById: Map<number, DataRefDescriptor>;
  dataRefsByName: Map<string, DataRefDescriptor>;
  commandsByName: Map<string, CommandDescriptor>;
  subscribedIds: Set<number>;
  unsubscribe: () => void;
}
```

Add a field beside `private active`:

```ts
  /** The profile the session is working from; the generic one until a probe says otherwise. */
  private profile: AircraftProfile = BUNDLED_PROFILES.generic;
```

In `connect()`, reset it before the snapshot is rebuilt, since the next aircraft may be anything:

```ts
    this.profile = BUNDLED_PROFILES.generic;
```

and the two `initialSnapshot(ALL_DATAREF_NAMES, ...)` calls become
`initialSnapshot(this.profile, this.policy.maxAttempts)` (the constructor's becomes
`initialSnapshot(BUNDLED_PROFILES.generic, this.policy.maxAttempts)`).

In `scheduleReconnect()`, the diagnostics reset becomes:

```ts
        diagnostics: {
          ...initialDiagnostics(snapshotDataRefNames(this.profile)),
          connector: prev.connector === null ? 'direct' : 'paired',
        },
```

- [ ] **Step 5: Write `resolveBindings`**

Add this private method (it does no store writes, so a superseded generation simply discards it):

```ts
  /**
   * Phases 2 to 4: who is flying, which profile fits, and which of its names this aircraft has.
   * Pure with respect to the session — nothing here touches the store, so the caller decides
   * whether the result is still wanted.
   */
  private async resolveBindings(client: ProbeClient): Promise<SessionBindings> {
    const identification = await identifyAircraft(client);
    const selection = selectProfile(BUNDLED_PROFILES, identification.identity);
    const profile = selection.profile;
    let identity = identification.identity;
    const results: BindingResults = { ...identification.results };
    const dataRefs = [...identification.dataRefs];

    const versionName = profile.addOnVersionDataRef;
    if (versionName !== undefined) {
      const read = await readAddOnVersion(client, versionName);
      identity = { ...identity, addOnVersion: read.version };
      results[versionName] = read.result;
      if (read.dataRef !== null) {
        dataRefs.push(read.dataRef);
      }
    }

    const bindings = profileBindings(profile);
    const probe = await probeBindings(client, bindings);
    for (const [name, result] of Object.entries(probe.results)) {
      results[name] = result;
    }
    dataRefs.push(...probe.dataRefs);

    const dataRefsById = new Map<number, DataRefDescriptor>();
    const dataRefsByName = new Map<string, DataRefDescriptor>();
    for (const descriptor of dataRefs) {
      dataRefsById.set(descriptor.id, descriptor);
      dataRefsByName.set(descriptor.name, descriptor);
    }

    const dataRefSteps: Record<string, StepStatus> = {};
    for (const name of snapshotDataRefNames(profile)) {
      const result = results[name];
      dataRefSteps[name] = result === undefined ? 'idle' : result.status === 'ok' ? 'ok' : 'failed';
    }
    const commandBindings = bindings.filter((binding) => binding.kind === 'command');
    const commandStep: StepStatus =
      commandBindings.length === 0
        ? 'idle'
        : commandBindings.every((binding) => results[binding.name]?.status === 'ok')
          ? 'ok'
          : 'failed';

    return {
      profile,
      compatibility: {
        identity,
        identified: isIdentified(identity),
        profileId: profile.id,
        profileName: profile.name,
        profileVersion: profile.version,
        selection: selection.reason,
        testedWith: profile.testedWith ?? [],
        versionWarning: versionWarning(profile, identity),
        features: deriveAvailability(profile, results),
        bindings: results,
        bindingLabels: bindingFeatureLabels(profile),
        writabilityReported: probe.writabilityReported,
        checkedAt: this.now(),
      },
      dataRefSteps,
      commandStep,
      dataRefsById,
      dataRefsByName,
      commandsByName: probe.commands,
      allMissing: probe.allMissing,
    };
  }
```

- [ ] **Step 6: Rewrite `completeSessionSetup`**

Replace the whole method. `holdForReadiness` and everything after it stay as they are.

```ts
  /**
   * Everything that happens on an already-open socket: check the simulator is ready, work out
   * which aircraft is loaded and which of the profile's names it has, then subscribe. Separate
   * from runSimulatorFlow so it can be retried on the same socket when X-Plane has no flight
   * loaded yet.
   *
   * A name that does not resolve costs its feature, never the connection (R5, R6): failing the
   * link would hide every feature that does work.
   */
  private async completeSessionSetup(
    generation: number,
    config: XPlaneConnectionConfig,
    client: SimulatorClient,
    unsubscribeClose: () => void,
    mode: FlowMode,
  ): Promise<FlowResult> {
    const abandon = (): FlowResult => {
      unsubscribeClose();
      client.disconnectWebSocket();
      return 'failed';
    };

    // Phase 1. One count request answers "is a flight loaded" before any name is tried, so the
    // main menu costs one request instead of a failed lookup per binding.
    let count: number;
    try {
      count = await this.timed(generation, () => client.getDataRefCount());
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return abandon();
      }
      unsubscribeClose();
      client.disconnectWebSocket();
      this.markFailure(
        toAvionixError(error, {
          code: 'NETWORK_ERROR',
          message: 'X-Plane did not answer the DataRef count',
        }),
        mode,
        'resolution',
      );
      return 'failed';
    }
    if (!this.isCurrent(generation)) {
      return abandon();
    }
    if (count === 0) {
      this.holdForReadiness(generation, config, client, unsubscribeClose, mode, simulatorNotReady());
      return 'held';
    }

    // Phases 2 to 4.
    for (const name of Object.keys(this.store.getSnapshot().diagnostics.dataRefs)) {
      this.setDataRefStep(name, 'pending');
    }
    this.setStep((d) => ({ ...d, command: 'pending' }));
    let bindings: SessionBindings;
    try {
      bindings = await this.resolveBindings(client);
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return abandon();
      }
      unsubscribeClose();
      client.disconnectWebSocket();
      this.markFailure(
        toAvionixError(error, { code: 'DATAREF_NOT_FOUND', message: 'Resolution failed' }),
        mode,
        'resolution',
      );
      return 'failed';
    }
    if (!this.isCurrent(generation)) {
      return abandon();
    }

    // The flight can be unloaded while the probe runs. Nothing resolving is either that, or a
    // profile that does not fit this aircraft; only the count tells the two apart.
    if (bindings.allMissing) {
      let recount = count;
      try {
        recount = await client.getDataRefCount();
      } catch (error) {
        // A failed re-check must not invent a readiness hold: keep the count we already had.
        this.logger.debug('dataref count re-check failed', { message: String(error) });
      }
      if (!this.isCurrent(generation)) {
        return abandon();
      }
      if (recount === 0) {
        this.holdForReadiness(
          generation,
          config,
          client,
          unsubscribeClose,
          mode,
          simulatorNotReady(),
        );
        return 'held';
      }
    }

    const unsubscribeUpdates = client.onDataRefUpdate((updates) => {
      this.applyUpdates(generation, updates);
    });
    const active: ActiveConnection = {
      generation,
      config,
      client,
      profile: bindings.profile,
      dataRefsById: bindings.dataRefsById,
      dataRefsByName: bindings.dataRefsByName,
      commandsByName: bindings.commandsByName,
      subscribedIds: new Set<number>(),
      unsubscribe: () => {
        unsubscribeUpdates();
        unsubscribeClose();
      },
    };
    this.active = active;
    this.profile = bindings.profile;
    this.applyBindings(bindings);

    this.setStep((d) => ({ ...d, subscription: 'pending' }));
    const ids = [...bindings.dataRefsById.keys()];
    try {
      await this.timed(generation, () =>
        client.subscribeDataRefs(ids.map((id) => ({ id }))),
      );
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
      active.subscribedIds = new Set(ids);
      this.setStep((d) => ({ ...d, subscription: 'ok' }));
      this.store.setState((prev) => ({
        ...prev,
        // A readiness hold during a reconnect already took reconnecting → connected, so this
        // retry's success finds the state already `connected`; only take the edge when it
        // has not been taken yet, or a repeat 'connected' event would be illegal.
        state:
          mode === 'reconnect' && prev.state !== 'connected'
            ? transition(prev.state, 'connected')
            : prev.state,
        reconnectAttempt: 0,
        error: null,
        health: {
          ...prev.health,
          flightLoaded: true,
          lastConnectedAt: this.now(),
          readinessRetryAt: null,
          // A session that reconnected did not end: clear whatever failure a prior attempt
          // stamped here, or a healthy disconnect later would report that stale reason.
          lastEndReason: null,
        },
      }));
      this.logger.info('session connected', {
        host: config.host,
        port: config.port,
        apiVersion: this.store.getSnapshot().apiVersion,
        mode,
      });
      return 'ok';
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
      this.setStep((d) => ({ ...d, subscription: 'failed' }));
      this.teardown();
      this.markFailure(
        toAvionixError(error, { code: 'SUBSCRIPTION_FAILED', message: 'Subscription failed' }),
        mode,
        'subscription',
      );
      return 'failed';
    }
  }

  /** Publishes one pipeline pass. The only place a compatibility result reaches the store. */
  private applyBindings(bindings: SessionBindings): void {
    this.store.setState((prev) => ({
      ...prev,
      compatibility: bindings.compatibility,
      diagnostics: {
        ...prev.diagnostics,
        dataRefs: bindings.dataRefSteps,
        command: bindings.commandStep,
      },
    }));
  }
```

- [ ] **Step 7: Delete `explainLookupMiss`**

The readiness gate answers the same question before any lookup is tried, so the method and its
call site are gone. Delete the whole `explainLookupMiss` method.

- [ ] **Step 8: Make the two controls profile-driven and availability-gated**

Replace the body of `writeHeading` between the range check and the `try`:

```ts
    const active = this.requireActive('write');
    if (active === null) {
      return;
    }
    const binding = writeBindingOf(active.profile, FEATURE_HEADING_CONTROL);
    const heading = binding === null ? undefined : active.dataRefsByName.get(binding.name);
    if (
      heading === undefined ||
      featureStatus(this.store.getSnapshot().compatibility, FEATURE_HEADING_CONTROL) !== 'available'
    ) {
      // R6: a control whose binding is missing or read-only is inert, and says why in the
      // pilot's words rather than naming a DataRef the message has no room to explain.
      this.recordOperation({
        kind: 'write',
        ok: false,
        message: 'Heading control is not available on this aircraft',
        failure: null,
      });
      return;
    }
```

and in `activateHeadingUp`:

```ts
    const active = this.requireActive('command');
    if (active === null) {
      return;
    }
    const binding = commandBindingOf(active.profile, FEATURE_HEADING_CONTROL);
    const command = binding === null ? undefined : active.commandsByName.get(binding.name);
    if (
      command === undefined ||
      featureStatus(this.store.getSnapshot().compatibility, FEATURE_HEADING_CONTROL) !== 'available'
    ) {
      this.recordOperation({
        kind: 'command',
        ok: false,
        message: 'Heading control is not available on this aircraft',
        failure: null,
      });
      return;
    }
```

with the `try` body becoming
`await this.timed(active.generation, () => active.client.activateCommand(command.id, 0));`
and the success message `` `Activated ${command.name}` ``.

- [ ] **Step 9: Make `applyUpdates` read the active connection**

The descriptor map changes when the aircraft changes, so the listener must not close over the map
it was created with:

```ts
  private applyUpdates(generation: number, updates: DataRefUpdate[]): void {
    const active = this.active;
    if (active === null || !this.isCurrent(generation) || active.generation !== generation) {
      return;
    }
    const dataRefsById = active.dataRefsById;
    this.store.setState((prev) => {
      // ... body unchanged, using `dataRefsById` and GENERIC_DATAREFS.heartbeat ...
    });
  }
```

- [ ] **Step 10: Delete `src/application/mvp-bindings.ts`**

```bash
git rm src/application/mvp-bindings.ts
npm run typecheck
```

Any remaining importer is a test; point it at
`snapshotDataRefNames(GENERIC_PROFILE)` (for `ALL_DATAREF_NAMES`) or at the explicit names.

- [ ] **Step 11: Migrate the tests whose behaviour genuinely changed**

In `tests/unit/application/simulator-session.test.ts`:

- The first connect test's subscription expectation grows the three identification ids:
  `expect(clients[0]?.subscribed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);`
- `'marks a missing dataref failed and reports DATAREF_NOT_FOUND'` is replaced, because a missing
  name no longer fails a connect:

```ts
  it('stays connected when a dataref is missing and reports the feature unavailable', async () => {
    const client = new FakeClient();
    client.missingDataRef = GENERIC_DATAREFS.airspeed;
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('connected');
    expect(snapshot().error).toBeNull();
    expect(snapshot().diagnostics.dataRefs[GENERIC_DATAREFS.airspeed]).toBe('failed');
    expect(snapshot().diagnostics.dataRefs[GENERIC_DATAREFS.heartbeat]).toBe('ok');
    expect(featureStatus(snapshot().compatibility, FEATURE_FLIGHT_TELEMETRY)).toBe('unavailable');
    expect(featureStatus(snapshot().compatibility, FEATURE_HEADING_CONTROL)).toBe('available');
  });
```

- `'reports SIMULATOR_NOT_READY when a dataref is missing and X-Plane has no datarefs, holding the
  link open'` keeps its name and every assertion except the DataRef step: nothing is probed at a
  zero count, so the step is `'idle'`, not `'failed'`. Drop the `client.missingDataRef` line — the
  count alone decides now.
- `'keeps DATAREF_NOT_FOUND when the count check itself fails'` is replaced, because the count is
  now the first request of the pipeline:

```ts
  it('fails the connect when the readiness check itself fails', async () => {
    const client = new FakeClient();
    client.getDataRefCount.mockRejectedValueOnce(new Error('network'));
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('NETWORK_ERROR');
  });
```

- Any test asserting `diagnostics.command === 'idle'` after a DataRef miss now expects `'ok'`: the
  command is probed regardless, because a missing DataRef no longer short-circuits the flow.

Run `npx jest tests/unit/application/simulator-session.test.ts` and fix what the failures name;
every remaining change is of this kind.

- [ ] **Step 12: Add the compatibility behaviour tests**

```ts
  it('identifies the aircraft and selects the generic profile', async () => {
    const { session, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    const { compatibility } = snapshot();
    expect(compatibility.identity).toEqual({
      icaoType: 'C172',
      description: 'Cessna 172 SP',
      tailNumber: 'N172SP',
      addOnVersion: null,
    });
    expect(compatibility.identified).toBe(true);
    expect(compatibility.profileId).toBe('avionix.generic');
    expect(compatibility.selection).toBe('fallback');
    expect(compatibility.checkedAt).not.toBeNull();
    expect(compatibility.features.every((feature) => feature.status === 'available')).toBe(true);
  });

  it('connects and falls back when X-Plane reports no aircraft at all', async () => {
    const client = new FakeClient();
    for (const name of IDENTITY_DATAREF_NAMES) {
      delete client.dataRefs[name];
    }
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('connected');
    expect(snapshot().compatibility.identified).toBe(false);
    expect(snapshot().compatibility.profileId).toBe('avionix.generic');
  });

  it('marks a control unavailable when its dataref is read-only, and refuses to write', async () => {
    const client = new FakeClient();
    client.dataRefs = {
      ...client.dataRefs,
      [GENERIC_DATAREFS.headingBug]: { id: 3, valueType: 'float', isWritable: false },
    };
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(featureStatus(snapshot().compatibility, FEATURE_HEADING_CONTROL)).toBe('unavailable');
    await session.writeHeading(180);
    expect(client.writes).toEqual([]);
    expect(snapshot().lastOperation).toMatchObject({
      ok: false,
      message: 'Heading control is not available on this aircraft',
      failure: null,
    });
  });

  it('keeps the compatibility result after a disconnect, so the view can mark it not current', async () => {
    const { session, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    const checkedAt = snapshot().compatibility.checkedAt;
    session.disconnect();
    expect(snapshot().state).toBe('disconnected');
    expect(snapshot().compatibility.checkedAt).toBe(checkedAt);
    expect(snapshot().compatibility.identity.tailNumber).toBe('N172SP');
  });

  it('probes nothing at all when X-Plane has no flight loaded', async () => {
    const client = new FakeClient();
    client.dataRefCount = 0;
    const { session } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(client.findDataRef).not.toHaveBeenCalled();
    expect(client.findCommand).not.toHaveBeenCalled();
  });
```

- [ ] **Step 13: Add the end-to-end compatibility test**

`tests/integration/aircraft-compatibility.test.ts` — the same `createSession` and `until` helpers
as `tests/integration/simulator-session.test.ts` (copy them; they are six lines each and the two
files are read independently):

```ts
import { featureStatus } from '@/application/compatibility';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_DATAREFS,
} from '@/domain/aircraft/profiles/generic';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

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
  });
}

describe('aircraft compatibility against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('identifies the aircraft and reports every feature available', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const { compatibility, state } = session.store.getSnapshot();
    expect(state).toBe('connected');
    expect(compatibility.identity.description).toBe('Cessna 172 SP');
    expect(compatibility.identity.icaoType).toBe('C172');
    expect(compatibility.identity.tailNumber).toBe('N172SP');
    expect(compatibility.features.map((feature) => feature.status)).toEqual([
      'available',
      'available',
      'available',
    ]);
    session.disconnect();
  });

  it('connects with a required name missing and reports only that feature unavailable', async () => {
    server.removeDataRef(GENERIC_DATAREFS.airspeed);
    const session = createSession();
    await session.connect(server.host, server.port);
    const snapshot = session.store.getSnapshot();
    expect(snapshot.state).toBe('connected');
    expect(featureStatus(snapshot.compatibility, FEATURE_FLIGHT_TELEMETRY)).toBe('unavailable');
    expect(featureStatus(snapshot.compatibility, FEATURE_HEADING_CONTROL)).toBe('available');
    const missing = snapshot.compatibility.features.find(
      (feature) => feature.id === FEATURE_FLIGHT_TELEMETRY,
    );
    expect(missing?.missing[0]).toMatchObject({
      name: GENERIC_DATAREFS.airspeed,
      status: 'missing',
    });
    session.disconnect();
  });

  it('reports writability unavailable on a simulator that does not publish the flag', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({ updateIntervalMs: 10, reportWritability: false });
    const session = createSession();
    await session.connect(server.host, server.port);
    const snapshot = session.store.getSnapshot();
    expect(snapshot.compatibility.writabilityReported).toBe(false);
    // An X-Plane that declines to answer must not cost the pilot a control that works.
    expect(featureStatus(snapshot.compatibility, FEATURE_HEADING_CONTROL)).toBe('available');
    session.disconnect();
  });

  it('marks heading control unavailable when the heading dataref is read-only', async () => {
    server.removeDataRef(GENERIC_DATAREFS.headingBug);
    server.addDataRef({
      id: 1003,
      name: GENERIC_DATAREFS.headingBug,
      valueType: 'float',
      value: 270,
    });
    const session = createSession();
    await session.connect(server.host, server.port);
    expect(
      featureStatus(session.store.getSnapshot().compatibility, FEATURE_HEADING_CONTROL),
    ).toBe('unavailable');
    session.disconnect();
  });
});
```

- [ ] **Step 14: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(aircraft): probe a profile at connect instead of a fixed dataref list

A missing name now degrades the feature that needed it; the link stays up.
Readiness is gated on the dataref count before any name is tried.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: Aircraft change, re-check and the subscription delta

The identification DataRefs are already subscribed, so a new aircraft announces itself as an
ordinary update. Re-running the pipeline on the open connection is the whole mechanism (R8); the
manual "Check again" is the same call, and the recovery path after an add-on update.

**Files:**

- Modify: `src/application/simulator-session.ts`
- Modify: `tests/unit/application/simulator-session.test.ts`
- Modify: `tests/integration/aircraft-compatibility.test.ts`

**Interfaces:**

- Consumes: `resolveBindings`, `applyBindings`, `ActiveConnection` (Task 8); `identityFieldFor`;
  `decodeDataRefString`; `TelemetrySample`.
- Produces:
  - `RECHECK_DEBOUNCE_MS = 250` (exported)
  - `SimulatorSession.recheckCompatibility(): Promise<void>` — public, consumed by Task 12.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/application/simulator-session.test.ts`, first let `FakeClient` record what it was
asked to unsubscribe:

```ts
  unsubscribed: number[] = [];

  unsubscribeDataRefs = jest.fn(async (subs: Array<{ id: number }> | 'all') => {
    if (subs !== 'all') {
      this.unsubscribed.push(...subs.map((sub) => sub.id));
    }
  });
```

Then add the describe block:

```ts
describe('aircraft changes', () => {
  const identityUpdate = (value: string) => [
    { id: 7, value: base64(value), receivedAt: 1234 },
  ];

  const without = (
    dataRefs: Record<string, FakeDataRef>,
    name: string,
  ): Record<string, FakeDataRef> => {
    const copy = { ...dataRefs };
    delete copy[name];
    return copy;
  };

  const renameTail = (
    dataRefs: Record<string, FakeDataRef>,
    tail: string,
  ): Record<string, FakeDataRef> => ({
    ...dataRefs,
    [IDENTITY_DATAREFS.tailNumber]: { id: 7, valueType: 'data', value: base64(tail) },
  });

  it('re-identifies and re-probes without leaving connected', async () => {
    const client = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().compatibility.identity.tailNumber).toBe('N172SP');

    client.dataRefs = renameTail(client.dataRefs, 'N999XX');
    client.emitUpdates(identityUpdate('N999XX'));
    await flush();
    await scheduler.runNext();

    expect(snapshot().state).toBe('connected');
    expect(snapshot().compatibility.identity.tailNumber).toBe('N999XX');
    expect(snapshot().compatibility.checkedAt).not.toBeNull();
  });

  it('debounces a burst of identification updates into one re-check', async () => {
    const client = new FakeClient();
    const { session, scheduler } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    const before = client.findCommand.mock.calls.length;

    client.emitUpdates(identityUpdate('N999XX'));
    client.emitUpdates(identityUpdate('N888XX'));
    client.emitUpdates(identityUpdate('N777XX'));
    await flush();
    expect(scheduler.queue.filter((entry) => !entry.cancelled)).toHaveLength(1);
    await scheduler.runNext();
    expect(client.findCommand.mock.calls.length).toBe(before + 1);
  });

  it('ignores an update that repeats the identification already on record', async () => {
    const client = new FakeClient();
    const { session, scheduler } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    client.emitUpdates(identityUpdate('N172SP'));
    await flush();
    expect(scheduler.queue.filter((entry) => !entry.cancelled)).toHaveLength(0);
  });

  it('subscribes what appeared and unsubscribes what went away', async () => {
    const client = new FakeClient();
    // The first aircraft has no airspeed dataref, so id 2 is never subscribed.
    client.missingDataRef = GENERIC_DATAREFS.airspeed;
    const { session, scheduler } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    client.subscribed.length = 0;

    // The next one has airspeed but no heading bug.
    client.missingDataRef = null;
    client.dataRefs = renameTail(without(client.dataRefs, GENERIC_DATAREFS.headingBug), 'N999XX');
    client.emitUpdates(identityUpdate('N999XX'));
    await flush();
    await scheduler.runNext();

    expect(client.subscribed).toEqual([2]);
    expect(client.unsubscribed).toEqual([3]);
  });

  it('drops telemetry for a name the new aircraft does not have', async () => {
    const client = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    client.emitUpdates([{ id: 2, value: 120, receivedAt: 1234 }]);
    expect(snapshot().telemetry[GENERIC_DATAREFS.airspeed]?.value).toBe(120);

    client.dataRefs = renameTail(without(client.dataRefs, GENERIC_DATAREFS.airspeed), 'N999XX');
    client.emitUpdates(identityUpdate('N999XX'));
    await flush();
    await scheduler.runNext();

    expect(snapshot().telemetry[GENERIC_DATAREFS.airspeed]).toBeUndefined();
  });

  it('keeps the last good result when a re-check fails', async () => {
    const client = new FakeClient();
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    client.findDataRef.mockRejectedValueOnce(new Error('network down'));
    await session.recheckCompatibility();
    expect(snapshot().state).toBe('connected');
    expect(snapshot().compatibility.identity.tailNumber).toBe('N172SP');
  });

  it('re-checks on demand and does nothing when the session is not connected', async () => {
    const client = new FakeClient();
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    client.dataRefs = renameTail(client.dataRefs, 'N999XX');
    await session.recheckCompatibility();
    expect(snapshot().compatibility.identity.tailNumber).toBe('N999XX');

    session.disconnect();
    const callsBefore = client.findDataRef.mock.calls.length;
    await session.recheckCompatibility();
    expect(client.findDataRef.mock.calls.length).toBe(callsBefore);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/application/simulator-session.test.ts -t 'aircraft changes'`
Expected: FAIL — `session.recheckCompatibility is not a function`, and no timer is scheduled.

- [ ] **Step 3: Add the debounce constant and the fields**

In `src/application/simulator-session.ts`, next to `READINESS_RETRY_MS`:

```ts
/**
 * A new aircraft can change all three identification values, which arrive as separate updates.
 * Waiting a moment turns that burst into one pass of the pipeline.
 */
export const RECHECK_DEBOUNCE_MS = 250;
```

Beside `private readinessHold`:

```ts
  private cancelRecheck: (() => void) | null = null;
  private recheckInFlight = false;
```

In `teardown()`, before the reconnect cancellation:

```ts
    if (this.cancelRecheck !== null) {
      this.cancelRecheck();
      this.cancelRecheck = null;
    }
```

- [ ] **Step 4: Detect the change in `applyUpdates`**

```ts
  private applyUpdates(generation: number, updates: DataRefUpdate[]): void {
    const active = this.active;
    if (active === null || !this.isCurrent(generation) || active.generation !== generation) {
      return;
    }
    const dataRefsById = active.dataRefsById;
    // The Web API publishes no "aircraft changed" event. The identification DataRefs are
    // subscribed like any other, so a new aircraft announces itself here (R8).
    const known = this.store.getSnapshot().compatibility.identity;
    let identityChanged = false;
    for (const update of updates) {
      const descriptor = dataRefsById.get(update.id);
      if (descriptor === undefined) {
        continue;
      }
      const field = identityFieldFor(descriptor.name);
      if (field !== null && decodeDataRefString(update.value, descriptor.valueType) !== known[field]) {
        identityChanged = true;
      }
    }

    this.store.setState((prev) => {
      // ... existing body, unchanged ...
    });

    if (identityChanged) {
      this.scheduleRecheck(generation);
    }
  }
```

with `import { identityFieldFor } from '@/domain/aircraft/identity-datarefs';` and
`import { decodeDataRefString } from '@/domain/simulator/dataref-string';`.

- [ ] **Step 5: Add the re-check**

```ts
  /**
   * Re-runs identification and probing on the open connection: the recovery path after an add-on
   * update mid-session, and the guaranteed path on a simulator that does not stream the
   * identification values. A no-op unless the session is connected.
   */
  async recheckCompatibility(): Promise<void> {
    const active = this.active;
    if (active === null || this.store.getSnapshot().state !== 'connected') {
      return;
    }
    if (this.cancelRecheck !== null) {
      this.cancelRecheck();
      this.cancelRecheck = null;
    }
    await this.runRecheck(active.generation);
  }

  private scheduleRecheck(generation: number): void {
    if (this.cancelRecheck !== null) {
      this.cancelRecheck();
    }
    this.cancelRecheck = this.scheduler.schedule(() => {
      this.cancelRecheck = null;
      if (!this.isCurrent(generation)) {
        return;
      }
      void this.runRecheck(generation);
    }, RECHECK_DEBOUNCE_MS);
  }

  /**
   * One pipeline pass on a live connection. `active` is compared by identity at every resume
   * point: a disconnect, a socket loss or a fresh connect replaces it, and a result computed for
   * the connection that went away must not be installed on the one that replaced it.
   */
  private async runRecheck(generation: number): Promise<void> {
    const active = this.active;
    if (active === null || active.generation !== generation || this.recheckInFlight) {
      return;
    }
    this.recheckInFlight = true;
    try {
      const bindings = await this.resolveBindings(active.client);
      if (this.active !== active || !this.isCurrent(generation)) {
        return;
      }
      const nextIds = new Set(bindings.dataRefsById.keys());
      const added = [...nextIds].filter((id) => !active.subscribedIds.has(id));
      const removed = [...active.subscribedIds].filter((id) => !nextIds.has(id));
      // A delta, not a re-subscribe: unsubscribing everything would blank the telemetry for a
      // frame on an aircraft change that usually keeps most of its names.
      if (removed.length > 0) {
        await active.client.unsubscribeDataRefs(removed.map((id) => ({ id })));
      }
      if (added.length > 0) {
        await active.client.subscribeDataRefs(added.map((id) => ({ id })));
      }
      if (this.active !== active || !this.isCurrent(generation)) {
        return;
      }
      active.profile = bindings.profile;
      active.dataRefsById = bindings.dataRefsById;
      active.dataRefsByName = bindings.dataRefsByName;
      active.commandsByName = bindings.commandsByName;
      active.subscribedIds = nextIds;
      this.profile = bindings.profile;
      this.applyBindings(bindings);
    } catch (error) {
      // The link is still up: keep the last good result rather than blanking the panel because
      // one re-check could not finish.
      this.logger.warn('compatibility re-check failed', { message: String(error) });
    } finally {
      this.recheckInFlight = false;
    }
  }
```

- [ ] **Step 6: Prune telemetry inside `applyBindings`**

A value for a name the aircraft no longer has is gone, not merely old. Replace `applyBindings`:

```ts
  /** Publishes one pipeline pass. The only place a compatibility result reaches the store. */
  private applyBindings(bindings: SessionBindings): void {
    this.store.setState((prev) => {
      const telemetry: Record<string, TelemetrySample | undefined> = {};
      for (const [name, sample] of Object.entries(prev.telemetry)) {
        if (bindings.dataRefsByName.has(name)) {
          telemetry[name] = sample;
        }
      }
      return {
        ...prev,
        telemetry,
        compatibility: bindings.compatibility,
        diagnostics: {
          ...prev.diagnostics,
          dataRefs: bindings.dataRefSteps,
          command: bindings.commandStep,
        },
      };
    });
  }
```

with `TelemetrySample` added to the type import from `@/application/session-snapshot`.

- [ ] **Step 7: Run the unit tests**

Run: `npx jest tests/unit/application/simulator-session.test.ts`
Expected: PASS, the new describe block included.

- [ ] **Step 8: Add the end-to-end aircraft change**

In `tests/integration/aircraft-compatibility.test.ts`, with the `until` helper:

```ts
async function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
```

```ts
  it('re-identifies over the live stream when the aircraft changes, without reconnecting', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const snap = () => session.store.getSnapshot();
    expect(snap().compatibility.identity.tailNumber).toBe('N172SP');
    const states: string[] = [];
    session.store.subscribe(() => states.push(snap().state));

    // A new aircraft: X-Plane streams the identification datarefs like any other value.
    server.setDataRefValue('sim/aircraft/view/acf_tailnum', 'TjczOEFW');
    server.setDataRefValue('sim/aircraft/view/acf_ICAO', 'QjczOA==');
    server.setDataRefValue('sim/aircraft/view/acf_descrip', 'Qm9laW5nIDczNy04MDA=');

    await until(() => snap().compatibility.identity.tailNumber === 'N738AV');
    expect(snap().compatibility.identity.icaoType).toBe('B738');
    expect(snap().compatibility.identity.description).toBe('Boeing 737-800');
    expect(snap().state).toBe('connected');
    expect(new Set(states)).toEqual(new Set(['connected']));
    session.disconnect();
  });

  it('picks up a name that appears only after a re-check', async () => {
    server.removeDataRef(GENERIC_DATAREFS.airspeed);
    const session = createSession();
    await session.connect(server.host, server.port);
    expect(featureStatus(session.store.getSnapshot().compatibility, FEATURE_FLIGHT_TELEMETRY)).toBe(
      'unavailable',
    );

    server.addDataRef({
      id: 1002,
      name: GENERIC_DATAREFS.airspeed,
      valueType: 'float',
      value: 0,
    });
    await session.recheckCompatibility();
    expect(featureStatus(session.store.getSnapshot().compatibility, FEATURE_FLIGHT_TELEMETRY)).toBe(
      'available',
    );
    session.disconnect();
  });
```

- [ ] **Step 9: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(aircraft): re-identify and re-probe when the aircraft changes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: Activity without a heartbeat, and the Aircraft block in the shared summary

Two small consumers of the compatibility result. `deriveActivity` currently answers
"paused or not running" when no heartbeat arrives — true when the DataRef exists and is frozen,
but a guess when the aircraft has no such DataRef at all. And the shareable summary gains the
compatibility statement complaint #11 asks for.

**Files:**

- Modify: `src/domain/health/simulator-activity.ts`
- Modify: `src/domain/aircraft/profile-selection.ts` (add `SELECTION_LABEL`)
- Modify: `src/application/health-monitor.ts`
- Modify: `src/application/diagnostics-summary.ts`
- Test: `tests/unit/domain/health.test.ts`, `tests/unit/application/health-monitor.test.ts`,
  `tests/unit/application/diagnostics-summary.test.ts`

**Interfaces:**

- Consumes: `CompatibilitySnapshot`; `FEATURE_STATUS_LABEL`, `BINDING_MISS_LABEL`;
  `identityLabel`; `GENERIC_DATAREFS`.
- Produces:
  - `ActivityInput` gains `heartbeatAvailable: boolean`
  - `SELECTION_LABEL: Record<SelectionReason, string>`

- [ ] **Step 1: Write the failing activity test**

Add to `tests/unit/domain/health.test.ts` (and add `heartbeatAvailable: true` to every existing
`deriveActivity` input in that file — `tsc` names them all):

```ts
  it('is unknown when the aircraft has no heartbeat dataref to judge by', () => {
    expect(
      deriveActivity({
        linkState: 'connected',
        heartbeatAvailable: false,
        heartbeatAdvancing: false,
        paused: null,
        flightLoaded: true,
      }),
    ).toBe('unknown');
  });

  it('still reports no flight loaded before it worries about the heartbeat', () => {
    expect(
      deriveActivity({
        linkState: 'connected',
        heartbeatAvailable: false,
        heartbeatAdvancing: false,
        paused: null,
        flightLoaded: false,
      }),
    ).toBe('noFlight');
  });
```

- [ ] **Step 2: Add the input**

In `src/domain/health/simulator-activity.ts`, add to `ActivityInput`:

```ts
  /** Whether the profile's heartbeat DataRef resolved on this aircraft at all. */
  heartbeatAvailable: boolean;
```

and in `deriveActivity`, between the `flightLoaded` check and the `heartbeatAdvancing` check:

```ts
  // No heartbeat DataRef means no evidence either way. "Paused or not running" would be a
  // guess dressed as a reading.
  if (!input.heartbeatAvailable) {
    return 'unknown';
  }
```

- [ ] **Step 3: Feed it from the monitor**

In `src/application/health-monitor.ts`, inside `refresh`'s reducer:

```ts
      const heartbeatAvailable =
        prev.compatibility.bindings[GENERIC_DATAREFS.heartbeat]?.status === 'ok';
      const activity = deriveActivity({
        linkState: prev.state,
        heartbeatAvailable,
        heartbeatAdvancing,
        paused: readPaused(prev),
        flightLoaded: prev.health.flightLoaded,
      });
```

- [ ] **Step 4: Cover it in the monitor test**

Add to `tests/unit/application/health-monitor.test.ts`:

```ts
  it('reports the simulator state unknown when the heartbeat dataref is not on this aircraft', () => {
    const store = new Store(initialSnapshot(GENERIC_PROFILE));
    store.setState((prev) => ({
      ...prev,
      state: 'connected',
      health: { ...prev.health, flightLoaded: true, lastHeartbeatAt: null },
    }));
    new HealthMonitor({ store, now: () => 10_000 }).refresh();
    expect(store.getSnapshot().health.activity).toBe('unknown');
  });
```

(the other tests in this file set `compatibility.bindings` when they need a heartbeat; add
`bindings: { [GENERIC_DATAREFS.heartbeat]: { name: GENERIC_DATAREFS.heartbeat, kind: 'dataref', status: 'ok' } }`
to the compatibility of any snapshot whose expectation depends on a live heartbeat — `tsc` will
not catch these, the failing assertions will.)

- [ ] **Step 5: Add `SELECTION_LABEL`**

In `src/domain/aircraft/profile-selection.ts`:

```ts
/** Why this profile is in use, in the pilot's words. Shared by the view and the summary. */
export const SELECTION_LABEL: Record<SelectionReason, string> = {
  matched: 'matched to this aircraft',
  fallback: 'generic fallback',
};
```

- [ ] **Step 6: Write the failing summary test**

Add to `tests/unit/application/diagnostics-summary.test.ts`:

```ts
  it('states the aircraft, the profile and what each feature can do', () => {
    const snapshot = initialSnapshot(GENERIC_PROFILE);
    const withAircraft: SessionSnapshot = {
      ...snapshot,
      compatibility: {
        ...snapshot.compatibility,
        identity: {
          icaoType: 'C172',
          description: 'Cessna 172 SP',
          tailNumber: 'N172SP',
          addOnVersion: null,
        },
        identified: true,
        checkedAt: 9_000,
        features: [
          { id: 'connection-health', label: 'Connection health', status: 'available', missing: [] },
          {
            id: 'flight-telemetry',
            label: 'Live telemetry',
            status: 'unavailable',
            missing: [
              {
                name: GENERIC_DATAREFS.airspeed,
                kind: 'dataref',
                purpose: 'Indicated airspeed',
                status: 'missing',
              },
            ],
          },
        ],
      },
    };
    const text = formatDiagnosticsSummary(withAircraft, 10_000);
    expect(text).toContain('Aircraft: Cessna 172 SP (C172) · N172SP');
    expect(text).toContain('Profile: Generic X-Plane aircraft 1.0.0 (generic fallback)');
    expect(text).toContain('Connection health: available');
    expect(text).toContain('Live telemetry: not available on this aircraft');
    expect(text).toContain(
      `Indicated airspeed — ${GENERIC_DATAREFS.airspeed} — not present on this aircraft`,
    );
  });

  it('says when X-Plane did not report the aircraft', () => {
    const text = formatDiagnosticsSummary(initialSnapshot(GENERIC_PROFILE), 10_000);
    expect(text).toContain('Aircraft: not reported by X-Plane');
    expect(text).toContain('Checked: not yet');
  });
```

- [ ] **Step 7: Write the Aircraft block**

In `src/application/diagnostics-summary.ts`, after the `API:` line and its blank line, before
`Steps`:

```ts
  const { compatibility } = snapshot;
  lines.push('Aircraft');
  lines.push(`  Aircraft: ${identityLabel(compatibility.identity) ?? 'not reported by X-Plane'}`);
  lines.push(
    `  Profile: ${compatibility.profileName} ${compatibility.profileVersion} (${SELECTION_LABEL[compatibility.selection]})`,
  );
  if (compatibility.identity.addOnVersion !== null) {
    lines.push(`  Add-on version: ${compatibility.identity.addOnVersion}`);
  }
  if (compatibility.versionWarning !== null) {
    lines.push(`  Warning: ${compatibility.versionWarning}`);
  }
  lines.push(
    `  Checked: ${
      compatibility.checkedAt === null
        ? 'not yet'
        : formatAge(ageMs(compatibility.checkedAt, now))
    }`,
  );
  for (const feature of compatibility.features) {
    lines.push(`  ${feature.label}: ${FEATURE_STATUS_LABEL[feature.status]}`);
    for (const miss of feature.missing) {
      lines.push(`    ${miss.purpose} — ${miss.name} — ${BINDING_MISS_LABEL[miss.status]}`);
    }
  }
  if (!compatibility.writabilityReported) {
    lines.push('  This X-Plane version does not report which values can be written.');
  }
  lines.push('');
```

- [ ] **Step 8: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: passes. The shareable-summary guard in
`tests/unit/application/diagnostics-summary.test.ts` still holds: every new line is built from
profile metadata and label tables, never from `AvionixError.message`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(aircraft): report the aircraft and its compatibility in the shared summary

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 11: The aircraft summary and the compatibility view

Two screens. The summary is a row the pilot reads at a glance; the view is where the missing names
are named (R7) and where "Check again" lives (R8). Both mark the result not current when the link
is down (R11).

**Files:**

- Create: `src/features/aircraft/AircraftSummary.tsx`
- Create: `src/features/aircraft/CompatibilityScreen.tsx`
- Test: `tests/ui/aircraft-summary.test.tsx`
- Test: `tests/ui/compatibility-screen.test.tsx`

**Interfaces:**

- Consumes: `SessionSnapshot`; `identityLabel`; `summariseAvailability`, `FEATURE_STATUS_LABEL`,
  `BINDING_MISS_LABEL`, `FeatureAvailability`, `FeatureStatus`; `SELECTION_LABEL`; `ageMs`,
  `formatAge`; the theme primitives.
- Produces:
  - `AircraftSummary({ snapshot, now, onOpenCompatibility })`
  - `UNIDENTIFIED_LABEL` (exported from `AircraftSummary.tsx`, reused by the view and by tests)
  - `CompatibilityScreen({ snapshot, now, onRecheck })`

- [ ] **Step 1: Write the failing summary test**

`tests/ui/aircraft-summary.test.tsx`:

```ts
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { AircraftSummary, UNIDENTIFIED_LABEL } from '@/features/aircraft/AircraftSummary';
import { ThemeProvider } from '@/theme/theme-context';

const base = initialSnapshot(GENERIC_PROFILE, 5);

const identified: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: {
    icaoType: 'C172',
    description: 'Cessna 172 SP',
    tailNumber: 'N172SP',
    addOnVersion: null,
  },
  identified: true,
  checkedAt: 9_000,
  features: [
    { id: 'connection-health', label: 'Connection health', status: 'available', missing: [] },
    { id: 'flight-telemetry', label: 'Live telemetry', status: 'available', missing: [] },
    { id: 'heading-control', label: 'Heading control', status: 'available', missing: [] },
  ],
};

async function renderSummary(patch: Partial<SessionSnapshot>, onOpen = jest.fn()) {
  const snapshot: SessionSnapshot = { ...base, ...patch };
  await render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <AircraftSummary snapshot={snapshot} now={10_000} onOpenCompatibility={onOpen} />
    </ThemeProvider>,
  );
  return onOpen;
}

describe('AircraftSummary', () => {
  it('names the aircraft, the profile and the verdict', async () => {
    await renderSummary({ state: 'connected', compatibility: identified });
    expect(screen.getByText('Cessna 172 SP (C172) · N172SP')).toBeTruthy();
    expect(screen.getByText('Generic X-Plane aircraft 1.0.0 · generic fallback')).toBeTruthy();
    expect(screen.getByText('All features available')).toBeTruthy();
  });

  it('says so when X-Plane reported no aircraft', async () => {
    await renderSummary({
      state: 'connected',
      compatibility: { ...base.compatibility, checkedAt: 9_000 },
    });
    expect(screen.getByText(UNIDENTIFIED_LABEL)).toBeTruthy();
  });

  it('counts what is degraded', async () => {
    await renderSummary({
      state: 'connected',
      compatibility: {
        ...identified,
        features: [
          { id: 'connection-health', label: 'Connection health', status: 'available', missing: [] },
          { id: 'flight-telemetry', label: 'Live telemetry', status: 'unavailable', missing: [] },
        ],
      },
    });
    expect(screen.getByText('1 feature not available')).toBeTruthy();
  });

  it('marks the result not current once the link is down', async () => {
    await renderSummary({ state: 'disconnected', compatibility: identified });
    expect(screen.getByText('Checked 1 s ago — not current')).toBeTruthy();
  });

  it('says nothing has been checked before the first connect', async () => {
    await renderSummary({ state: 'disconnected' });
    expect(screen.getByText('Not checked yet')).toBeTruthy();
  });

  it('opens the compatibility view', async () => {
    const onOpen = await renderSummary({ state: 'connected', compatibility: identified });
    fireEvent.press(screen.getByText('Compatibility details'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('never renders a dataref name in the summary row', async () => {
    await renderSummary({ state: 'connected', compatibility: identified });
    expect(screen.queryByText(new RegExp(GENERIC_DATAREFS.airspeed))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/ui/aircraft-summary.test.tsx`
Expected: FAIL — cannot find module `@/features/aircraft/AircraftSummary`.

- [ ] **Step 3: Write the summary**

`src/features/aircraft/AircraftSummary.tsx`:

```tsx
import React from 'react';
import { Button } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { identityLabel } from '@/domain/aircraft/aircraft-identity';
import { type FeatureAvailability, summariseAvailability } from '@/domain/aircraft/availability';
import { SELECTION_LABEL } from '@/domain/aircraft/profile-selection';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useTheme } from '@/theme/theme-context';

export const UNIDENTIFIED_LABEL = 'X-Plane did not report which aircraft is loaded';

function verdictTone(features: readonly FeatureAvailability[]): 'danger' | 'success' | undefined {
  if (features.some((feature) => feature.status === 'unavailable')) {
    return 'danger';
  }
  return features.every((feature) => feature.status === 'available') ? 'success' : undefined;
}

/**
 * What the pilot reads at a glance: which aircraft, which profile, and whether anything is
 * missing. The detail — and every DataRef name — lives one tap away in the compatibility view.
 */
export function AircraftSummary({
  snapshot,
  now,
  onOpenCompatibility,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onOpenCompatibility: () => void;
}) {
  const theme = useTheme();
  const { compatibility, state } = snapshot;
  const checked = compatibility.checkedAt !== null;
  const aircraft = identityLabel(compatibility.identity) ?? UNIDENTIFIED_LABEL;
  const profile = `${compatibility.profileName} ${compatibility.profileVersion} · ${SELECTION_LABEL[compatibility.selection]}`;
  const verdict = checked ? summariseAvailability(compatibility.features) : 'Not checked yet';
  // Derived, never stored: a result is current exactly while the link that produced it is up.
  const currency =
    state === 'connected' || !checked
      ? null
      : `Checked ${formatAge(ageMs(compatibility.checkedAt, now))} — not current`;

  return (
    <Section
      testID="aircraft-summary"
      accessibilityLabel={`Aircraft: ${aircraft}. Profile ${profile}. ${verdict}.${
        currency === null ? '' : ` ${currency}.`
      }`}
    >
      <SectionTitle>Aircraft</SectionTitle>
      <BodyText>{aircraft}</BodyText>
      <BodyText muted>{profile}</BodyText>
      <BodyText tone={checked ? verdictTone(compatibility.features) : undefined}>{verdict}</BodyText>
      {currency === null ? null : <BodyText muted>{currency}</BodyText>}
      <Button
        title="Compatibility details"
        onPress={onOpenCompatibility}
        color={theme.colors.primary}
      />
    </Section>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest tests/ui/aircraft-summary.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing view test**

`tests/ui/compatibility-screen.test.tsx`:

```ts
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { UNIDENTIFIED_LABEL } from '@/features/aircraft/AircraftSummary';
import { CompatibilityScreen } from '@/features/aircraft/CompatibilityScreen';
import { ThemeProvider } from '@/theme/theme-context';

const base = initialSnapshot(GENERIC_PROFILE, 5);

const degraded: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: {
    icaoType: 'B738',
    description: 'Boeing 737-800',
    tailNumber: 'N738AV',
    addOnVersion: '4.4',
  },
  identified: true,
  checkedAt: 9_000,
  writabilityReported: true,
  versionWarning: 'This profile was written for 4.2 and 4.3. The aircraft reports 4.4, so some controls may have moved.',
  features: [
    { id: 'connection-health', label: 'Connection health', status: 'available', missing: [] },
    {
      id: 'heading-control',
      label: 'Heading control',
      status: 'unavailable',
      missing: [
        {
          name: GENERIC_DATAREFS.headingBug,
          kind: 'dataref',
          purpose: 'Heading bug, written when you set a heading',
          status: 'readOnly',
        },
      ],
    },
  ],
};

async function renderScreen(patch: Partial<SessionSnapshot>, onRecheck = jest.fn()) {
  const snapshot: SessionSnapshot = { ...base, ...patch };
  await render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <CompatibilityScreen snapshot={snapshot} now={10_000} onRecheck={onRecheck} />
    </ThemeProvider>,
  );
  return onRecheck;
}

describe('CompatibilityScreen', () => {
  it('names the aircraft, its add-on version and the profile', async () => {
    await renderScreen({ state: 'connected', compatibility: degraded });
    expect(screen.getByText('Boeing 737-800 (B738) · N738AV')).toBeTruthy();
    expect(screen.getByText('Add-on version 4.4')).toBeTruthy();
    expect(
      screen.getByText('Profile: Generic X-Plane aircraft 1.0.0 (generic fallback)'),
    ).toBeTruthy();
  });

  it('shows the version warning', async () => {
    await renderScreen({ state: 'connected', compatibility: degraded });
    expect(screen.getByText(/some controls may have moved/)).toBeTruthy();
  });

  it('names every missing binding with its purpose and why it cannot be used', async () => {
    await renderScreen({ state: 'connected', compatibility: degraded });
    expect(screen.getByText('Heading control')).toBeTruthy();
    expect(screen.getByText('not available on this aircraft')).toBeTruthy();
    expect(
      screen.getByText(
        `Heading bug, written when you set a heading — ${GENERIC_DATAREFS.headingBug} — read-only on this aircraft`,
      ),
    ).toBeTruthy();
  });

  it('explains the fallback when nothing was identified', async () => {
    await renderScreen({
      state: 'connected',
      compatibility: { ...base.compatibility, checkedAt: 9_000 },
    });
    expect(screen.getByText(UNIDENTIFIED_LABEL)).toBeTruthy();
    expect(screen.getByText('Avionix is using the generic profile.')).toBeTruthy();
  });

  it('warns when this X-Plane does not report write capability', async () => {
    await renderScreen({
      state: 'connected',
      compatibility: { ...degraded, writabilityReported: false },
    });
    expect(screen.getByText(/does not report which values can be written/)).toBeTruthy();
  });

  it('marks the result not current and disables the re-check when disconnected', async () => {
    const onRecheck = await renderScreen({ state: 'disconnected', compatibility: degraded });
    expect(screen.getByText('Last checked 1 s ago. Not current.')).toBeTruthy();
    fireEvent.press(screen.getByText('Check again'));
    expect(onRecheck).not.toHaveBeenCalled();
  });

  it('re-checks on demand while connected', async () => {
    const onRecheck = await renderScreen({ state: 'connected', compatibility: degraded });
    fireEvent.press(screen.getByText('Check again'));
    expect(onRecheck).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx jest tests/ui/compatibility-screen.test.tsx`
Expected: FAIL — cannot find module `@/features/aircraft/CompatibilityScreen`.

- [ ] **Step 7: Write the view**

`src/features/aircraft/CompatibilityScreen.tsx`:

```tsx
import React from 'react';
import { Button, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { identityLabel } from '@/domain/aircraft/aircraft-identity';
import {
  BINDING_MISS_LABEL,
  FEATURE_STATUS_LABEL,
  type FeatureAvailability,
  type FeatureStatus,
} from '@/domain/aircraft/availability';
import { SELECTION_LABEL } from '@/domain/aircraft/profile-selection';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { UNIDENTIFIED_LABEL } from '@/features/aircraft/AircraftSummary';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

function statusTone(status: FeatureStatus): 'danger' | 'success' | undefined {
  if (status === 'available') {
    return 'success';
  }
  return status === 'unavailable' ? 'danger' : undefined;
}

const makeStyles = (theme: Theme) => ({
  feature: { marginTop: theme.spacing.sm },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
});

function FeatureRow({ feature }: { feature: FeatureAvailability }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.feature}>
      <View style={styles.row}>
        <BodyText>{feature.label}</BodyText>
        <BodyText tone={statusTone(feature.status)}>
          {FEATURE_STATUS_LABEL[feature.status]}
        </BodyText>
      </View>
      {feature.missing.map((miss) => (
        <BodyText
          key={miss.name}
          muted
        >{`${miss.purpose} — ${miss.name} — ${BINDING_MISS_LABEL[miss.status]}`}</BodyText>
      ))}
    </View>
  );
}

/**
 * Where a pilot finds out what this aircraft can and cannot do, and why. Naming the DataRef is
 * the point (R7): it is what turns "the autopilot button does nothing" into a bug report. No
 * failure text is composed here — nothing on this screen comes from an `AvionixError`.
 */
export function CompatibilityScreen({
  snapshot,
  now,
  onRecheck,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onRecheck: () => void;
}) {
  const theme = useTheme();
  const { compatibility, state } = snapshot;
  const connected = state === 'connected';
  const checked = compatibility.checkedAt !== null;

  return (
    <Section testID="compatibility-screen">
      <SectionTitle>Aircraft compatibility</SectionTitle>
      {connected ? null : (
        <BodyText muted>
          {checked
            ? `Last checked ${formatAge(ageMs(compatibility.checkedAt, now))}. Not current.`
            : 'Not checked yet. Connect to X-Plane to check this aircraft.'}
        </BodyText>
      )}
      <BodyText>{identityLabel(compatibility.identity) ?? UNIDENTIFIED_LABEL}</BodyText>
      {compatibility.identified ? null : (
        <BodyText muted>Avionix is using the generic profile.</BodyText>
      )}
      {compatibility.identity.addOnVersion === null ? null : (
        <BodyText muted>{`Add-on version ${compatibility.identity.addOnVersion}`}</BodyText>
      )}
      <BodyText muted>
        {`Profile: ${compatibility.profileName} ${compatibility.profileVersion} (${SELECTION_LABEL[compatibility.selection]})`}
      </BodyText>
      {compatibility.testedWith.length === 0 ? null : (
        <BodyText muted>{`Tested with ${compatibility.testedWith.join(', ')}`}</BodyText>
      )}
      {compatibility.versionWarning === null ? null : (
        <BodyText tone="danger">{compatibility.versionWarning}</BodyText>
      )}
      {compatibility.features.map((feature) => (
        <FeatureRow key={feature.id} feature={feature} />
      ))}
      {compatibility.writabilityReported ? null : (
        <BodyText muted>
          This X-Plane version does not report which values can be written, so a control may still
          be refused.
        </BodyText>
      )}
      <Button
        title="Check again"
        onPress={onRecheck}
        disabled={!connected}
        color={theme.colors.primary}
      />
    </Section>
  );
}
```

- [ ] **Step 8: Run the test and watch it pass**

Run: `npx jest tests/ui/compatibility-screen.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 9: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

- [ ] **Step 10: Commit**

```bash
git add src/features/aircraft tests/ui/aircraft-summary.test.tsx tests/ui/compatibility-screen.test.tsx
git commit -m "$(cat <<'MSG'
feat(aircraft): show the aircraft summary and the compatibility view

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 12: Gate the controls, wire the screens

A feature the aircraft cannot support must not be offered as if it worked (R6). The heading
buttons go inert with a reason, a telemetry row whose binding is missing says so instead of
showing a dash, and the two new screens reach the app.

**Files:**

- Modify: `src/features/mvp/ControlPanel.tsx`, `src/features/mvp/TelemetryPanel.tsx`,
  `src/features/mvp/MvpScreen.tsx`
- Modify: `src/hooks/useSimulatorSession.ts`, `src/app/services-context.tsx`
- Modify: `tests/ui/error-text-guard.test.tsx`, `tests/ui/mvp-screen.test.tsx`

**Interfaces:**

- Consumes: `SimulatorSession.recheckCompatibility`; `featureOf`, `featureStatus`;
  `FEATURE_FLIGHT_TELEMETRY`, `FEATURE_HEADING_CONTROL`, `GENERIC_DATAREFS`;
  `AircraftSummary`, `CompatibilityScreen`.
- Produces:
  - `ControlPanel` gains `feature: FeatureAvailability | null`
  - `TelemetryPanel` reads `snapshot.compatibility.bindings`
  - `useSimulatorSession()` returns `recheckCompatibility`

- [ ] **Step 1: Expose the re-check through the app's seams**

In `src/app/services-context.tsx`:

```ts
export type SessionApi = Pick<
  SimulatorSession,
  | 'store'
  | 'connect'
  | 'disconnect'
  | 'pair'
  | 'writeHeading'
  | 'activateHeadingUp'
  | 'recheckCompatibility'
>;
```

In `src/hooks/useSimulatorSession.ts`, add beside the other callbacks:

```ts
  const recheckCompatibility = useCallback(() => session.recheckCompatibility(), [session]);
```

and return it.

- [ ] **Step 2: Write the failing control-panel test**

Add to `tests/ui/mvp-screen.test.tsx` — the file already renders the whole screen against a fake
session; follow its existing helpers:

```ts
  it('disables the heading controls and says why when the aircraft cannot support them', async () => {
    await renderScreen({
      state: 'connected',
      compatibility: {
        ...base.compatibility,
        checkedAt: 9_000,
        features: [
          {
            id: 'heading-control',
            label: 'Heading control',
            status: 'unavailable',
            missing: [
              {
                name: GENERIC_DATAREFS.headingBug,
                kind: 'dataref',
                purpose: 'Heading bug, written when you set a heading',
                status: 'missing',
              },
            ],
          },
        ],
      },
    });
    expect(
      screen.getByText('Heading control is not available on this aircraft: Heading bug, written when you set a heading'),
    ).toBeTruthy();
    fireEvent.press(screen.getByText('Heading up'));
    expect(activateHeadingUp).not.toHaveBeenCalled();
  });

  it('says a telemetry value is not on this aircraft rather than showing a dash', async () => {
    await renderScreen({
      state: 'connected',
      compatibility: {
        ...base.compatibility,
        checkedAt: 9_000,
        bindings: {
          [GENERIC_DATAREFS.airspeed]: {
            name: GENERIC_DATAREFS.airspeed,
            kind: 'dataref',
            status: 'missing',
          },
        },
      },
    });
    expect(screen.getByText('not available on this aircraft')).toBeTruthy();
  });

  it('opens the compatibility view from the aircraft summary', async () => {
    await renderScreen({ state: 'connected' });
    fireEvent.press(screen.getByText('Compatibility details'));
    expect(screen.getByText('Aircraft compatibility')).toBeTruthy();
  });
```

Adapt the names (`renderScreen`, `base`, `activateHeadingUp`) to whatever that file already calls
its helpers; add the imports it needs.

- [ ] **Step 3: Gate `ControlPanel`**

```tsx
interface Props {
  enabled: boolean;
  feature: FeatureAvailability | null;
  lastOperation: LastOperation | null;
  onWriteHeading: (value: number) => void;
  onHeadingUp: () => void;
}
```

Inside the component, above `canWrite`:

```tsx
  const available = props.feature?.status === 'available';
  const usable = props.enabled && available;
  const reason =
    available || props.feature === null
      ? null
      : `Heading control is not available on this aircraft: ${props.feature.missing
          .map((miss) => miss.purpose)
          .join(', ')}`;
```

`canWrite` becomes `usable && heading.trim() !== '' && Number.isFinite(parsed)`, the "Heading up"
button's `disabled` becomes `!usable`, and the reason renders under the buttons:

```tsx
      {reason === null ? null : <BodyText muted>{reason}</BodyText>}
```

The purpose text comes from the profile, never from an error — the guard test in Step 6 keeps it
that way.

- [ ] **Step 4: Gate `TelemetryPanel`**

Replace the row render so a row whose binding did not resolve says so:

```tsx
export function TelemetryPanel({ snapshot, now }: { snapshot: SessionSnapshot; now: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Section>
      <SectionTitle>Live telemetry</SectionTitle>
      {ROWS.map((row) => {
        const binding = snapshot.compatibility.bindings[row.name];
        const sample = snapshot.telemetry[row.name];
        if (binding !== undefined && binding.status !== 'ok') {
          // A dash reads as "no data yet"; this value is not coming at all (R6).
          return (
            <View key={row.name} style={styles.row}>
              <BodyText>{row.label}</BodyText>
              <BodyText muted>not available on this aircraft</BodyText>
            </View>
          );
        }
        const age =
          sample === undefined
            ? ''
            : ` (${Math.max(0, Math.round((now - sample.receivedAt) / 1000))}s ago)`;
        return (
          <View key={row.name} style={styles.row}>
            <BodyText>{row.label}</BodyText>
            <BodyText style={styles.value}>{formatValue(sample)}</BodyText>
            <BodyText muted>{age}</BodyText>
          </View>
        );
      })}
    </Section>
  );
}
```

- [ ] **Step 5: Mount the two screens in `MvpScreen`**

Add the state and the callback beside `showDiagnostics`:

```tsx
  const [showCompatibility, setShowCompatibility] = useState(false);
  const onToggleCompatibility = useCallback(() => setShowCompatibility((open) => !open), []);
  const onRecheck = useCallback(() => void recheckCompatibility(), [recheckCompatibility]);
```

with `recheckCompatibility` destructured from `useSimulatorSession()`. Render the summary above
the telemetry panel, the view under it when open, and pass the feature to the control panel:

```tsx
        <AircraftSummary
          snapshot={snapshot}
          now={now}
          onOpenCompatibility={onToggleCompatibility}
        />
        {showCompatibility ? (
          <CompatibilityScreen snapshot={snapshot} now={now} onRecheck={onRecheck} />
        ) : null}
        <TelemetryPanel snapshot={snapshot} now={now} />
        <ControlPanel
          enabled={snapshot.state === 'connected'}
          feature={featureOf(snapshot.compatibility, FEATURE_HEADING_CONTROL)}
          lastOperation={snapshot.lastOperation}
          onWriteHeading={(value) => void writeHeading(value)}
          onHeadingUp={() => void activateHeadingUp()}
        />
```

- [ ] **Step 6: Extend the raw-text guard to the new screens**

In `tests/ui/error-text-guard.test.tsx`, render both new components inside the same tree, and give
`ControlPanel` its new prop:

```tsx
        <ControlPanel
          enabled
          feature={null}
          lastOperation={lastOperationFor(code)}
          onWriteHeading={jest.fn()}
          onHeadingUp={jest.fn()}
        />
        <AircraftSummary snapshot={snapshotFor(code)} now={10_000} onOpenCompatibility={jest.fn()} />
        <CompatibilityScreen snapshot={snapshotFor(code)} now={10_000} onRecheck={jest.fn()} />
```

Neither new screen reads `snapshot.error`, which is exactly what this test proves: there is no
path from an `AvionixError` to either of them.

- [ ] **Step 7: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: passes, including `tests/web/mvp-screen.web.test.tsx`, which renders the same screen
through `react-native-web`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(aircraft): make controls inert when the aircraft cannot support them

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 13: Documentation

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/xplane.md`
- Modify: `docs/testing/xplane-smoke-test.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Record the layer in `docs/architecture.md`**

In the layer table, extend the Domain row's contents with
`aircraft profiles, identification and availability`.

Replace steps 7 and 8 of the data-flow block with:

```
      7. GET /api/v3/datarefs/count                (readiness gate; 0 → hold, no probing)
      8. identify the aircraft, select a profile, probe every name it declares
      9. dataref_subscribe_values                  (WebSocket; identification DataRefs included)
     10. dataref_update_values → DataRefUpdate[] → snapshot.telemetry
```

(and renumber `state = connected` accordingly: it stays at step 6.)

Add this section after "Connection state machine":

```markdown
## Aircraft compatibility

A **profile** is the single registry of the DataRef and command names a feature needs
(`src/domain/aircraft/profile.ts`). It is named, versioned, and declares one `BindingSpec` per
name: what the binding is for, whether the feature is useless without it, and whether the app
writes to it. `GENERIC_PROFILE` covers Laminar names and is the fallback for every aircraft; the
catalog's `named` list is empty until an aircraft-specific profile arrives in Stage 4.

Every connect runs four phases inside `SimulatorSession`:

1. `GET /api/v3/datarefs/count`. Zero means no flight is loaded: hold for readiness and probe
   nothing.
2. Identify: read `acf_ICAO`, `acf_descrip` and `acf_tailnum`, which are `data`-typed DataRefs
   carrying base64 text. All three are optional.
3. Select: `selectProfile` matches the ICAO code against the catalog, lowest profile id first, and
   falls back to the generic profile.
4. Probe: resolve every name the profile declares, six lookups at a time, recording `ok`,
   `missing` or `readOnly` per name.

A name that does not resolve costs its **feature**, never the connection: `deriveFeatureAvailability`
turns the per-name results into `available` / `partial` / `unavailable`, and a surface whose feature
is not `available` renders inert with the reason. The connect still fails on transport, capabilities,
WebSocket and subscription errors.

The identification DataRefs are subscribed like any other value, so a new aircraft arrives as an
ordinary update; the session debounces that for 250 ms and re-runs phases 2 to 4 on the open
connection, reconciling the subscription as a delta. `recheckCompatibility()` is the same pass on
demand, behind the "Check again" button.

`isWritable` is reported only by X-Plane 12.4.3 and newer. An explicit `false` on a binding the app
writes to makes the feature unavailable; an absent flag is treated as writable, and the view says
write capability was not reported.
```

- [ ] **Step 2: Record the names in `docs/xplane.md`**

Add after the "MVP DataRefs and command" table:

```markdown
## Aircraft identification

| Role | Name | Type | Source |
|---|---|---|---|
| ICAO type code | `sim/aircraft/view/acf_ICAO` | data (base64 text) | Community convention, not confirmed in a Laminar-authored document |
| Description | `sim/aircraft/view/acf_descrip` | data (base64 text) | Community convention |
| Tail number | `sim/aircraft/view/acf_tailnum` | data (base64 text) | Community convention |

All three are optional: Avionix records a miss, falls back to the generic profile, and says so in
the compatibility view. A `data` value is base64, padded with NUL to the DataRef's declared length;
`decodeDataRefString` decodes it and cuts at the first NUL, driven by the descriptor's
`value_type` rather than by the shape of the value.

The `/api/v3/aircraft` REST resource is listed in Laminar's API index but its payload shape was
never confirmed, so Avionix does not use it.
```

- [ ] **Step 3: Add the device checks**

Append to the table in `docs/testing/xplane-smoke-test.md`:

```markdown
| 34 | Load the default Cessna 172 and connect | The Aircraft panel names it ("Cessna 172 SP (C172) · N172SP"), the profile reads "Generic X-Plane aircraft 1.0.0 · generic fallback", and the verdict is "All features available" | |
| 35 | Connect with a default airliner instead | Identified the same way; all features available | |
| 36 | While connected, load a different aircraft in X-Plane | The Aircraft panel names the new one within a few seconds; the status bar never leaves "Connected" | |
| 37 | Open "Compatibility details" while connected and press "Check again" | Every feature is listed with a status; the check completes and the link stays connected | |
| 38 | Disconnect, then open "Compatibility details" | It says "Last checked … Not current." and "Check again" is disabled | |
| 39 | Connect while X-Plane sits at the main menu, then open the Aircraft panel | "Not checked yet"; starting a flight fills it in without reconnecting | |
| 40 | Share the diagnostics summary with an aircraft loaded | The Aircraft block names the aircraft, the profile and every feature's status, with no URL, token or raw error | |
| 41 | If X-Plane is older than 12.4.3, or an add-on aircraft lacks the Laminar heading-bug DataRef | Older sim: the compatibility view notes write capability is not reported and the control stays usable. Missing name: the heading buttons are disabled and name what is missing | |
```

- [ ] **Step 4: Check the formatting**

Run: `npm run format:check`

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "$(cat <<'MSG'
docs: describe the aircraft compatibility layer and its device checks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Requirement coverage

| Req | Task |
|---|---|
| R1 identify on every connect | 5, 8 |
| R2 fallback, never blocks | 3, 5, 8, 11 |
| R3 deterministic selection, visible | 3, 8, 10, 11 |
| R4 session override | **deferred** — see below |
| R5 resolve every declared name, no failed connect | 5, 8 |
| R6 available / partial / unavailable, inert controls | 4, 8, 12 |
| R7 missing names in plain text | 4, 10, 11 |
| R8 re-identify on aircraft change, no reconnect | 9, 12 |
| R9 non-writable marks the control unavailable | 4, 5, 8 |
| R10 no flight loaded | 8 |
| R11 last known result when disconnected | 6, 11 |
| R12 versioned profiles, mismatch is a warning | 2, 3, 5, 10, 11 |
| R13 no raw protocol text, nothing about tokens | 11, 12 |

## What this plan deliberately does not do

- **The manual profile override (R4).** Only one profile ships, so a picker would offer one row
  and the override would be unreachable code. It lands with the second profile, in Stage 4.
- **Per-readout staleness inside a panel.** F-04's half of the same requirement.
- **Any aircraft-specific mapping content.** Stage 4 owns Zibo; this plan ships the mechanism and
  the generic profile.
- **Profile downloads or updates out of band.** Profiles ship with the app.
- **A `GET /api/v3/aircraft` client.** Its payload shape is unverified; the DataRef path uses
  transport, schemas and error mapping that already exist.
