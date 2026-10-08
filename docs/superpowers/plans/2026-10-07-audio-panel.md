# F-23 Audio Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GA audio panel (MIC selection, receiver monitoring, marker audio and lamps) as an AUDIO unit at the top of the Radios panel, plus a MIC lamp on the transmitting COM row, driven by X-Plane's `sim/audio_panel/*` commands and read back from its DataRefs.

**Architecture:** A pure catalogue (`src/domain/audio/catalogue.ts`) holds every name; profile 1.9.0 builds three optional, command-only features from it. A pure model (`audioModel`) turns an `AudioReader` (resolved / definitively missing / number) into keys, lamps and lines. The Radios panel draws the model (`AudioUnit`) and its COM rows read the transmit COM from the same model. Systems' availability helpers gain `bindingMissing`, and Systems stops printing "not available" for names that are merely unchecked.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript strict, zod v4, Jest (projects: node `tests/unit|contract|integration`, expo `tests/ui`, web `tests/web`), React Native Testing Library 14 (render, rerender and fireEvent are awaited).

**Spec:** `docs/superpowers/specs/2026-10-07-audio-panel-design.md`

## Global Constraints

- Minimum simulator X-Plane 12.1.4. Bundle id `pro.avionix.app`. No new native module and no new dependency.
- Every new binding is `required: false`; no new binding has `write` (the audio panel only activates commands).
- Never render, log or serialise a token, pairing code, URL, HTTP status, exception text, DataRef or command name or id, or protocol payload. Every sentence is plain language and names the aircraft when known ("the Cessna 172", else "this aircraft").
- Every pressable meets 48 dp (`theme.touch.minTarget`) in both dimensions; keys are `ControlButton`s.
- Lint uses react-hooks v7: no refs read during render, no `Date.now()` in render, no `setState` that only mirrors props inside an effect, no mutation of props or hook results.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (this line overrides any other attribution guidance).
- The full gate is `npm run typecheck && npm run lint && npm run format:check && npx jest`; every task ends green on it.
- Never launch Xcode, Android Studio, a simulator or emulator, `expo start` or an EAS build.

## Review Focus

1. **Names not checked yet** (right after connect: no binding result): the AUDIO unit shows its label only, no "Not available" line, no "isn't available" sentence; Systems likewise prints neither. Pinned in Task 1 (model), Task 2 (Systems), Task 3 (unit).
2. **A transmit selection X-Plane reports as something other than 6 or 7** (0, 9, a fraction): neither MIC key is selected, no COM row shows MIC, no "not heard" line. Pinned in Task 1 and Task 3.
3. **Pressing the already selected MIC key** would make X-Plane mute the other COM: the key is inert. Pinned in Task 3.
4. **Auto-listen on the transmitting COM**: its monitor key is lit, inert and spoken "heard while transmitting"; the other COM's key stays a normal key. Pinned in Task 1 and Task 3.
5. **Stale values** (reconnecting): light bars dim, lamps hide, keys inert, last state kept. Pinned in Task 3.

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/domain/audio/catalogue.ts` | Feature ids, names, key specs, `comForSelection` | 1 |
| `src/domain/audio/audio-model.ts` | `AudioReader`, `audioModel` | 1 |
| `src/domain/audio/messages.ts` | Every audio sentence | 1 |
| `src/domain/aircraft/profiles/generic.ts` | Three features, version 1.9.0 | 1 |
| `src/features/panels/systems/availability.ts` | `bindingMissing`, `presence().missing` | 2 |
| Systems units (`SwitchGroup`, `EngineColumn`, `SelectorKeys`, `sections`, `FlapsUnit`, `GearUnit`) | Only definitive misses produce sentences | 2 |
| `src/features/panels/radios/audio-reader.ts` | Snapshot → `AudioReader`, `transmittingCom` | 3 |
| `src/features/panels/radios/AudioUnit.tsx` | The AUDIO unit | 3 |
| `src/features/panels/radios/RadiosPanel.tsx`, `RadioRow.tsx`, `radios.ts` | Placement, MIC lamp, descriptor features | 3 |
| `tests/helpers/audio.ts` | Values, compatibility, telemetry | 3 |
| `tests/mock-xplane/mock-xplane-server.ts` | Audio DataRefs (1500+) and commands (2300+) from Task 1; behaviour | 1, 4 |
| Docs: `docs/xplane.md`, `docs/architecture.md`, `README.md`, roadmap F-23 + ROADMAP row, smoke rows 173–181 | | 4 |

---

### Task 1: Catalogue, model, messages and profile 1.9.0

**Files:**
- Create: `src/domain/audio/catalogue.ts`, `src/domain/audio/audio-model.ts`, `src/domain/audio/messages.ts`
- Modify: `src/domain/aircraft/profiles/generic.ts` (import, `AUDIO_FEATURE_SPECS`, header comment, `version`, `features`)
- Modify: every test asserting `'1.8.0'` (find with `grep -rn "1\.8\.0" tests`), and the reuse list in `tests/unit/domain/aircraft-profile.test.ts` ("names every DataRef once…")
- Test: `tests/unit/domain/audio-catalogue.test.ts`, `tests/unit/domain/audio-model.test.ts` (new)

**Interfaces:**
- Consumes: `Marker` from `@/domain/navigation/hsi`; `unitUnavailable` from `@/domain/systems/messages`.
- Produces (later tasks import exactly these):
  - `FEATURE_AUDIO_TRANSMIT`, `FEATURE_AUDIO_MONITOR`, `FEATURE_AUDIO_MARKER`, `AUDIO_FEATURES`
  - `TRANSMIT { selection, autoListen }`, `MICS: readonly MicSpec[]`, `MONITORS: readonly MonitorSpec[]`, `MARKER_LAMPS`, `AUDIO_STATE_NAMES`, `ComNumber`, `comForSelection(value)`
  - `AudioReader`, `AudioModel`, `MicKey`, `MonitorKey`, `Listening`, `audioModel(reader)`
  - `audioUnavailable(aircraft)`, `notHeard(com)`, `micNotTaken(aircraft, com)`, `listenNotTaken(aircraft, name, wantedOn)`

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/audio-catalogue.test.ts`:

```ts
import { findFeature } from '@/domain/aircraft/profile';
import { GENERIC_DATAREFS, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import {
  AUDIO_FEATURES,
  AUDIO_STATE_NAMES,
  FEATURE_AUDIO_MARKER,
  FEATURE_AUDIO_MONITOR,
  FEATURE_AUDIO_TRANSMIT,
  MARKER_LAMPS,
  MICS,
  MONITORS,
  TRANSMIT,
  comForSelection,
} from '@/domain/audio/catalogue';

describe('the audio catalogue', () => {
  it('uses Laminar’s names (spec §3)', () => {
    expect(TRANSMIT).toEqual({
      selection: 'sim/cockpit2/radios/actuators/audio_com_selection',
      autoListen: 'sim/cockpit2/radios/actuators/audio_selection_com_auto',
    });
    expect(MICS.map((mic) => [mic.legend, mic.value, mic.command])).toEqual([
      ['COM1 MIC', 6, 'sim/audio_panel/transmit_audio_com1'],
      ['COM2 MIC', 7, 'sim/audio_panel/transmit_audio_com2'],
    ]);
    expect(MONITORS.map((m) => [m.legend, m.state, m.on, m.off])).toEqual([
      ['COM1', 'sim/cockpit2/radios/actuators/audio_selection_com1', 'sim/audio_panel/monitor_audio_com1_on', 'sim/audio_panel/monitor_audio_com1_off'],
      ['COM2', 'sim/cockpit2/radios/actuators/audio_selection_com2', 'sim/audio_panel/monitor_audio_com2_on', 'sim/audio_panel/monitor_audio_com2_off'],
      ['NAV1', 'sim/cockpit2/radios/actuators/audio_selection_nav1', 'sim/audio_panel/monitor_audio_nav1_on', 'sim/audio_panel/monitor_audio_nav1_off'],
      ['NAV2', 'sim/cockpit2/radios/actuators/audio_selection_nav2', 'sim/audio_panel/monitor_audio_nav2_on', 'sim/audio_panel/monitor_audio_nav2_off'],
      ['ADF', 'sim/cockpit2/radios/actuators/audio_selection_adf1', 'sim/audio_panel/monitor_audio_adf1_on', 'sim/audio_panel/monitor_audio_adf1_off'],
      ['DME', 'sim/cockpit2/radios/actuators/audio_dme_enabled', 'sim/audio_panel/monitor_audio_dme_on', 'sim/audio_panel/monitor_audio_dme_off'],
      ['MKR', 'sim/cockpit2/radios/actuators/audio_marker_enabled', 'sim/audio_panel/monitor_audio_mkr_on', 'sim/audio_panel/monitor_audio_mkr_off'],
    ]);
    expect(MONITORS.map((m) => m.com)).toEqual([1, 2, undefined, undefined, undefined, undefined, undefined]);
    expect(MONITORS.map((m) => m.featureId)).toEqual([
      ...new Array(6).fill(FEATURE_AUDIO_MONITOR),
      FEATURE_AUDIO_MARKER,
    ]);
    expect(AUDIO_STATE_NAMES).toEqual([TRANSMIT.selection, ...MONITORS.map((m) => m.state)]);
  });

  it('shares the marker lamps with nav-aids', () => {
    expect(MARKER_LAMPS.map((lamp) => lamp.state)).toEqual([
      GENERIC_DATAREFS.outerMarker,
      GENERIC_DATAREFS.middleMarker,
      GENERIC_DATAREFS.innerMarker,
    ]);
    expect(MARKER_LAMPS.map((lamp) => lamp.marker)).toEqual(['outer', 'middle', 'inner']);
  });

  it('maps 6 and 7 to COM1 and COM2, anything else to none', () => {
    expect(comForSelection(6)).toBe(1);
    expect(comForSelection(7)).toBe(2);
    for (const other of [0, 9, 6.5, -6, NaN, null]) {
      expect(comForSelection(other)).toBeNull();
    }
  });
});

describe('profile 1.9.0', () => {
  it('declares the three audio features, every binding optional and none written', () => {
    expect(GENERIC_PROFILE.version).toBe('1.9.0');
    expect(AUDIO_FEATURES).toEqual([FEATURE_AUDIO_TRANSMIT, FEATURE_AUDIO_MONITOR, FEATURE_AUDIO_MARKER]);
    for (const id of AUDIO_FEATURES) {
      const feature = findFeature(GENERIC_PROFILE, id);
      expect(feature).toBeDefined();
      for (const binding of feature!.bindings) {
        expect(binding.required).toBe(false);
        expect(binding.write).toBeUndefined();
        expect(binding.purpose).not.toMatch(/sim\/|_/);
      }
    }
    const names = (id: string) => findFeature(GENERIC_PROFILE, id)!.bindings.map((b) => b.name);
    expect(names(FEATURE_AUDIO_TRANSMIT)).toEqual([
      TRANSMIT.selection,
      TRANSMIT.autoListen,
      ...MICS.map((mic) => mic.command),
    ]);
    expect(names(FEATURE_AUDIO_MONITOR)).toEqual(
      MONITORS.slice(0, 6).flatMap((m) => [m.state, m.on, m.off]),
    );
    expect(names(FEATURE_AUDIO_MARKER)).toEqual([
      MONITORS[6]!.state,
      MONITORS[6]!.on,
      MONITORS[6]!.off,
      ...MARKER_LAMPS.map((lamp) => lamp.state),
    ]);
  });
});
```

(`findFeature` returns `FeatureSpec | null`. Let Prettier wrap the long arrays.)

`tests/unit/domain/audio-model.test.ts`:

```ts
import { type AudioReader, audioModel } from '@/domain/audio/audio-model';
import { AUDIO_STATE_NAMES, MARKER_LAMPS, MICS, MONITORS, TRANSMIT } from '@/domain/audio/catalogue';
import {
  audioUnavailable,
  listenNotTaken,
  micNotTaken,
  notHeard,
} from '@/domain/audio/messages';

type Answer = 'ok' | 'missing' | 'unchecked';

const ALL_NAMES = [
  TRANSMIT.selection,
  TRANSMIT.autoListen,
  ...MICS.map((mic) => mic.command),
  ...MONITORS.flatMap((m) => [m.state, m.on, m.off]),
  ...MARKER_LAMPS.map((lamp) => lamp.state),
];

const BASE: Record<string, number> = {
  [TRANSMIT.selection]: 6,
  [TRANSMIT.autoListen]: 0,
  ...Object.fromEntries(MONITORS.map((m) => [m.state, 0])),
  ...Object.fromEntries(MARKER_LAMPS.map((lamp) => [lamp.state, 0])),
};

function reader(
  values: Record<string, number | null> = {},
  answers: Record<string, Answer> = {},
): AudioReader {
  const merged: Record<string, number | null> = { ...BASE, ...values };
  const answer = (name: string): Answer => answers[name] ?? 'ok';
  return {
    has: (name) => answer(name) === 'ok',
    missing: (name) => answer(name) === 'missing',
    number: (name) => (answer(name) === 'ok' ? (merged[name] ?? null) : null),
  };
}

const every = (answer: Answer, names: readonly string[] = ALL_NAMES) =>
  Object.fromEntries(names.map((name) => [name, answer]));

const listening = (model: ReturnType<typeof audioModel>) =>
  Object.fromEntries(model.monitors.map((key) => [key.spec.legend, key.listening]));

describe('audioModel', () => {
  it('reads the MIC selection and every listen flag', () => {
    const model = audioModel(reader({ [MONITORS[0]!.state]: 1, [MONITORS[6]!.state]: 1 }));
    expect(model.status).toBe('ready');
    expect(model.transmitting).toBe(1);
    expect(model.mics.map((mic) => [mic.spec.legend, mic.selected, mic.enabled])).toEqual([
      ['COM1 MIC', true, true],
      ['COM2 MIC', false, true],
    ]);
    expect(listening(model)).toEqual({
      COM1: 'on',
      COM2: 'off',
      NAV1: 'off',
      NAV2: 'off',
      ADF: 'off',
      DME: 'off',
      MKR: 'on',
    });
    expect(model.notHeard).toBeNull();
    expect(model.missing).toEqual([]);
    expect(model.lamps).toEqual({ outer: false, middle: false, inner: false });
  });

  it('selects no MIC for a selection other than 6 or 7', () => {
    for (const value of [0, 9, 6.4, null]) {
      const model = audioModel(reader({ [TRANSMIT.selection]: value }));
      expect(model.transmitting).toBeNull();
      expect(model.mics.every((mic) => !mic.selected)).toBe(true);
      expect(model.notHeard).toBeNull();
    }
  });

  it('hears the transmitting COM through auto-listen, whatever its own flag says', () => {
    const model = audioModel(reader({ [TRANSMIT.selection]: 7, [TRANSMIT.autoListen]: 1 }));
    expect(listening(model)).toMatchObject({ COM1: 'off', COM2: 'auto' });
    expect(model.notHeard).toBeNull();
  });

  it('says when the transmitting COM is not heard', () => {
    const model = audioModel(reader({ [TRANSMIT.selection]: 6 }));
    expect(model.notHeard).toBe(1);
  });

  it('does not claim "not heard" when the COM’s flag is unknown or missing', () => {
    expect(audioModel(reader({ [MONITORS[0]!.state]: null })).notHeard).toBeNull();
    expect(audioModel(reader({}, { [MONITORS[0]!.state]: 'missing' })).notHeard).toBeNull();
  });

  it('treats a missing auto-listen flag as off', () => {
    const model = audioModel(reader({}, { [TRANSMIT.autoListen]: 'missing' }));
    expect(listening(model).COM1).toBe('off');
    expect(model.missing).toEqual([]);
  });

  it('lists definitive misses only, MIC keys first', () => {
    const model = audioModel(
      reader({}, {
        [MICS[1]!.command]: 'missing',
        [MONITORS[5]!.state]: 'missing',
        [MONITORS[6]!.off]: 'missing',
        [MONITORS[4]!.state]: 'unchecked',
      }),
    );
    expect(model.missing).toEqual(['COM2 MIC', 'DME', 'MKR']);
    expect(model.mics.map((mic) => mic.enabled)).toEqual([true, false]);
    expect(model.monitors.map((key) => key.spec.legend)).toEqual([
      'COM1',
      'COM2',
      'NAV1',
      'NAV2',
      'MKR',
    ]);
    expect(model.monitors.find((key) => key.spec.legend === 'MKR')!.enabled).toBe(false);
  });

  it('lists both MIC keys when the selection itself is missing, and draws none', () => {
    const model = audioModel(reader({}, { [TRANSMIT.selection]: 'missing' }));
    expect(model.mics).toEqual([]);
    expect(model.missing).toEqual(['COM1 MIC', 'COM2 MIC']);
    expect(model.transmitting).toBeNull();
  });

  it('waits, saying nothing, while names are unchecked', () => {
    const model = audioModel(reader({}, every('unchecked')));
    expect(model.status).toBe('waiting');
    expect(model.missing).toEqual([]);
    expect(model.lamps).toBeNull();
  });

  it('keeps waiting when some names are missing and the rest unchecked', () => {
    const answers = { ...every('unchecked'), [TRANSMIT.selection]: 'missing' as const };
    expect(audioModel(reader({}, answers)).status).toBe('waiting');
  });

  it('is unavailable only when every state name is definitively missing', () => {
    const model = audioModel(reader({}, every('missing', AUDIO_STATE_NAMES)));
    expect(model.status).toBe('unavailable');
    expect(model.missing).toEqual([]);
  });

  it('shows the lamps only when all three resolved', () => {
    expect(audioModel(reader({ [MARKER_LAMPS[1]!.state]: 1 })).lamps).toEqual({
      outer: false,
      middle: true,
      inner: false,
    });
    expect(audioModel(reader({}, { [MARKER_LAMPS[2]!.state]: 'missing' })).lamps).toBeNull();
  });
});

describe('audio sentences', () => {
  it('reads as plain words naming the aircraft', () => {
    expect(audioUnavailable('Cessna 172')).toBe("The audio panel isn't available on the Cessna 172.");
    expect(audioUnavailable(null)).toBe("The audio panel isn't available on this aircraft.");
    expect(notHeard(1)).toBe("You transmit on COM1 but aren't listening to it.");
    expect(micNotTaken('Cessna 172', 2)).toBe("The Cessna 172 didn't switch the microphone to COM2.");
    expect(micNotTaken(null, 1)).toBe("This aircraft didn't switch the microphone to COM1.");
    expect(listenNotTaken('Cessna 172', 'COM2', true)).toBe(
      "The Cessna 172 didn't start listening to COM2.",
    );
    expect(listenNotTaken(null, 'the marker beacons', false)).toBe(
      "This aircraft didn't stop listening to the marker beacons.",
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/domain/audio-catalogue.test.ts tests/unit/domain/audio-model.test.ts`
Expected: FAIL — cannot find module `@/domain/audio/catalogue`.

- [ ] **Step 3: Write the catalogue**

`src/domain/audio/catalogue.ts`:

```ts
import type { Marker } from '@/domain/navigation/hsi';

/**
 * F-23's catalogue: X-Plane's generic (pilot-side) audio panel. Every name is Laminar's, verified
 * against `DataRefs.txt`, `Commands.txt` and the live 12.4.3 DataRef database (spec §3). The
 * profile builds its features from this file and the Radios panel draws from it, so a name lives
 * in one place only.
 */

export const FEATURE_AUDIO_TRANSMIT = 'audio-transmit';
export const FEATURE_AUDIO_MONITOR = 'audio-monitor';
export const FEATURE_AUDIO_MARKER = 'audio-marker';

/** The audio features, in profile order. */
export const AUDIO_FEATURES: readonly string[] = [
  FEATURE_AUDIO_TRANSMIT,
  FEATURE_AUDIO_MONITOR,
  FEATURE_AUDIO_MARKER,
];

const ACTUATORS = 'sim/cockpit2/radios/actuators/';
const PANEL = 'sim/audio_panel/';

export type ComNumber = 1 | 2;

export const TRANSMIT = {
  /** 6 = COM1, 7 = COM2; Laminar: "0 is never a valid value". */
  selection: `${ACTUATORS}audio_com_selection`,
  /** 1: the transmitting COM is heard whatever its own listen flag says. */
  autoListen: `${ACTUATORS}audio_selection_com_auto`,
} as const;

/** A MIC key: the standard transmit command, which also makes X-Plane select that COM's listener. */
export interface MicSpec {
  key: 'mic1' | 'mic2';
  com: ComNumber;
  legend: string;
  /** `TRANSMIT.selection`'s value once X-Plane has adopted it. */
  value: number;
  command: string;
}

export const MICS: readonly MicSpec[] = [
  { key: 'mic1', com: 1, legend: 'COM1 MIC', value: 6, command: `${PANEL}transmit_audio_com1` },
  { key: 'mic2', com: 2, legend: 'COM2 MIC', value: 7, command: `${PANEL}transmit_audio_com2` },
];

/** A monitor key: one listen flag and its explicit on/off commands (never the toggles). */
export interface MonitorSpec {
  /** Unique across the panel; read-back keys and test ids derive from it. */
  key: string;
  legend: string;
  /** In the pilot's words, for sentences and screen readers ("COM1", "the ADF"). */
  name: string;
  featureId: string;
  state: string;
  on: string;
  off: string;
  /** Set on the two COM receivers: auto-listen applies to them only. */
  com?: ComNumber;
}

function monitor(
  key: string,
  legend: string,
  name: string,
  state: string,
  stem: string,
  featureId = FEATURE_AUDIO_MONITOR,
  com?: ComNumber,
): MonitorSpec {
  return {
    key,
    legend,
    name,
    featureId,
    state: `${ACTUATORS}${state}`,
    on: `${PANEL}monitor_audio_${stem}_on`,
    off: `${PANEL}monitor_audio_${stem}_off`,
    ...(com === undefined ? {} : { com }),
  };
}

/** In the GMA 340's order. DME is the dedicated DME receiver, which `monitor_audio_dme` predates. */
export const MONITORS: readonly MonitorSpec[] = [
  monitor('com1', 'COM1', 'COM1', 'audio_selection_com1', 'com1', FEATURE_AUDIO_MONITOR, 1),
  monitor('com2', 'COM2', 'COM2', 'audio_selection_com2', 'com2', FEATURE_AUDIO_MONITOR, 2),
  monitor('nav1', 'NAV1', 'NAV1', 'audio_selection_nav1', 'nav1'),
  monitor('nav2', 'NAV2', 'NAV2', 'audio_selection_nav2', 'nav2'),
  monitor('adf', 'ADF', 'the ADF', 'audio_selection_adf1', 'adf1'),
  monitor('dme', 'DME', 'the DME', 'audio_dme_enabled', 'dme'),
  monitor('mkr', 'MKR', 'the marker beacons', 'audio_marker_enabled', 'mkr', FEATURE_AUDIO_MARKER),
];

/** The O/M/I lamps: the same DataRefs `nav-aids` reads for the HSI and PFD. */
export const MARKER_LAMPS: readonly { marker: Marker; state: string }[] = [
  { marker: 'outer', state: 'sim/cockpit2/radios/indicators/outer_marker_lit' },
  { marker: 'middle', state: 'sim/cockpit2/radios/indicators/middle_marker_lit' },
  { marker: 'inner', state: 'sim/cockpit2/radios/indicators/inner_marker_lit' },
];

/** Every name that draws a key: when all are definitively missing, the panel has no audio (R6). */
export const AUDIO_STATE_NAMES: readonly string[] = [
  TRANSMIT.selection,
  ...MONITORS.map((spec) => spec.state),
];

/** 6 → COM1, 7 → COM2; anything else is no COM at all. */
export function comForSelection(value: number | null): ComNumber | null {
  if (value === 6) {
    return 1;
  }
  return value === 7 ? 2 : null;
}
```

- [ ] **Step 4: Write the model and the messages**

`src/domain/audio/audio-model.ts`:

```ts
import {
  AUDIO_STATE_NAMES,
  type ComNumber,
  MARKER_LAMPS,
  MICS,
  MONITORS,
  type MicSpec,
  type MonitorSpec,
  TRANSMIT,
  comForSelection,
} from '@/domain/audio/catalogue';
import type { Marker } from '@/domain/navigation/hsi';

/**
 * The session as the audio domain reads it. F-12's three answers: a name is resolved (`has`),
 * definitively absent (`missing`), or neither yet (unchecked, right after connect). Only `missing`
 * ever produces a sentence.
 */
export interface AudioReader {
  has: (name: string) => boolean;
  missing: (name: string) => boolean;
  number: (name: string) => number | null;
}

export interface MicKey {
  spec: MicSpec;
  enabled: boolean;
  selected: boolean;
}

/** `auto`: heard because it is the transmitting COM and X-Plane's auto-listen is on (spec §4.3). */
export type Listening = 'on' | 'off' | 'auto' | 'unknown';

export interface MonitorKey {
  spec: MonitorSpec;
  enabled: boolean;
  listening: Listening;
}

export interface AudioModel {
  /** `waiting`: nothing drawable yet and not everything known missing; say nothing. */
  status: 'waiting' | 'unavailable' | 'ready';
  transmitting: ComNumber | null;
  /** Empty when the transmit selection did not resolve. */
  mics: readonly MicKey[];
  /** The receivers whose flag resolved, in catalogue order. */
  monitors: readonly MonitorKey[];
  /** Null unless all three lamps resolved. */
  lamps: Record<Marker, boolean> | null;
  /** The transmitting COM when it is known not to be heard (spec §4.4). */
  notHeard: ComNumber | null;
  /** Legends of keys whose state or a command is definitively missing: MIC keys first. */
  missing: readonly string[];
}

const UNAVAILABLE: AudioModel = {
  status: 'unavailable',
  transmitting: null,
  mics: [],
  monitors: [],
  lamps: null,
  notHeard: null,
  missing: [],
};

export function audioModel(read: AudioReader): AudioModel {
  if (AUDIO_STATE_NAMES.every((name) => read.missing(name))) {
    return UNAVAILABLE;
  }
  const selectionShown = read.has(TRANSMIT.selection);
  const transmitting = selectionShown ? comForSelection(read.number(TRANSMIT.selection)) : null;
  const auto = read.has(TRANSMIT.autoListen) && read.number(TRANSMIT.autoListen) === 1;

  const mics = selectionShown
    ? MICS.map((spec) => ({
        spec,
        enabled: read.has(spec.command),
        selected: transmitting === spec.com,
      }))
    : [];

  const listening = (spec: MonitorSpec): Listening => {
    if (spec.com !== undefined && auto && transmitting === spec.com) {
      return 'auto';
    }
    const value = read.number(spec.state);
    if (value === null || !Number.isFinite(value)) {
      return 'unknown';
    }
    return value >= 0.5 ? 'on' : 'off';
  };
  const monitors = MONITORS.filter((spec) => read.has(spec.state)).map((spec) => ({
    spec,
    enabled: read.has(spec.on) && read.has(spec.off),
    listening: listening(spec),
  }));

  const transmitKey = monitors.find(
    (key) => transmitting !== null && key.spec.com === transmitting,
  );
  const missing = [
    ...MICS.filter(
      (spec) => read.missing(TRANSMIT.selection) || read.missing(spec.command),
    ).map((spec) => spec.legend),
    ...MONITORS.filter((spec) =>
      [spec.state, spec.on, spec.off].some((name) => read.missing(name)),
    ).map((spec) => spec.legend),
  ];
  const lamps = MARKER_LAMPS.every((lamp) => read.has(lamp.state))
    ? (Object.fromEntries(
        MARKER_LAMPS.map((lamp) => [lamp.marker, read.number(lamp.state) === 1]),
      ) as Record<Marker, boolean>)
    : null;

  return {
    status: mics.length === 0 && monitors.length === 0 ? 'waiting' : 'ready',
    transmitting,
    mics,
    monitors,
    lamps,
    notHeard: transmitKey?.listening === 'off' ? transmitting : null,
    missing,
  };
}
```

`src/domain/audio/messages.ts`:

```ts
import type { ComNumber } from '@/domain/audio/catalogue';
import { unitUnavailable } from '@/domain/systems/messages';

/**
 * Every sentence the audio unit shows (R9): plain words, the aircraft named when known, never a
 * name, id or code. `aircraft` is X-Plane's description of the loaded aircraft, or null.
 */

function subject(aircraft: string | null): string {
  return aircraft === null ? 'This aircraft' : `The ${aircraft}`;
}

/** R6: every audio name is definitively missing. */
export function audioUnavailable(aircraft: string | null): string {
  return unitUnavailable('The audio panel', aircraft);
}

export function notHeard(com: ComNumber): string {
  return `You transmit on COM${com} but aren't listening to it.`;
}

export function micNotTaken(aircraft: string | null, com: ComNumber): string {
  return `${subject(aircraft)} didn't switch the microphone to COM${com}.`;
}

export function listenNotTaken(aircraft: string | null, name: string, wantedOn: boolean): string {
  return `${subject(aircraft)} didn't ${wantedOn ? 'start' : 'stop'} listening to ${name}.`;
}
```

- [ ] **Step 5: Add the profile features**

In `src/domain/aircraft/profiles/generic.ts`: import from `@/domain/audio/catalogue` (`FEATURE_AUDIO_*`, `MARKER_LAMPS`, `MICS`, `MONITORS`, `TRANSMIT`, type `MonitorSpec`); set `version: '1.9.0'`; add after `ENGINES_FEATURE_SPECS`:

```ts
function listenBindings(spec: MonitorSpec): BindingSpec[] {
  return [
    dataRef(spec.state, `Listening to ${spec.name}`),
    command(spec.on, `Start listening to ${spec.name}`),
    command(spec.off, `Stop listening to ${spec.name}`),
  ];
}

/** F-23: commands only, read back on the flags; the lamps are deliberately shared with nav-aids. */
const AUDIO_FEATURE_SPECS: readonly FeatureSpec[] = [
  {
    id: FEATURE_AUDIO_TRANSMIT,
    label: 'Microphone selection',
    bindings: [
      dataRef(TRANSMIT.selection, 'Microphone (transmit) selection'),
      dataRef(TRANSMIT.autoListen, 'Listening follows the microphone'),
      ...MICS.map((mic) => command(mic.command, `Transmit on COM${mic.com}`)),
    ],
  },
  {
    id: FEATURE_AUDIO_MONITOR,
    label: 'Audio monitoring',
    bindings: MONITORS.filter((spec) => spec.featureId === FEATURE_AUDIO_MONITOR).flatMap(
      listenBindings,
    ),
  },
  {
    id: FEATURE_AUDIO_MARKER,
    label: 'Marker audio',
    bindings: [
      ...MONITORS.filter((spec) => spec.featureId === FEATURE_AUDIO_MARKER).flatMap(listenBindings),
      ...MARKER_LAMPS.map((lamp) => dataRef(lamp.state, `Marker lamp (${lamp.marker})`)),
    ],
  },
];
```

and append `...AUDIO_FEATURE_SPECS` after `...ENGINES_FEATURE_SPECS` in `features`. Extend the header comment that lists the profile's features with one sentence on the three audio features.

- [ ] **Step 6: Update the existing profile tests**

Replace `'1.8.0'` with `'1.9.0'` in every test `grep -rn "1\.8\.0" tests` finds. In `tests/unit/domain/aircraft-profile.test.ts`, the reuse list gains the three lamps at its end:

```ts
      GENERIC_DATAREFS.fuelTotal,
      GENERIC_DATAREFS.outerMarker,
      GENERIC_DATAREFS.middleMarker,
      GENERIC_DATAREFS.innerMarker,
    ]);
```

- [ ] **Step 7: Run the gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: PASS (run `npx prettier --write` on the new files first if `format:check` fails).

- [ ] **Step 8: Commit**

```bash
git add src/domain/audio src/domain/aircraft/profiles/generic.ts tests
git commit -m "feat(audio): catalogue, model and profile 1.9.0 for the audio panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Systems says "not available" only for definitive misses

F-12 follow-up (spec §5). Today every Systems unit treats an unchecked name (no binding result yet, right after connect) as absent, so for a moment it prints "Not available on the Cessna 172: …" and "Flaps isn't available on …". After this task, a name is listed or makes a unit "not available" only when its binding status is `missing` or `readOnly`; a unit with nothing drawn and nothing definitively missing renders nothing.

**Files:**
- Modify: `src/features/panels/systems/availability.ts`, `SwitchGroup.tsx`, `EngineColumn.tsx`, `SelectorKeys.tsx`, `sections.tsx`, `FlapsUnit.tsx`, `GearUnit.tsx`
- Test: `tests/ui/systems-unchecked.test.tsx` (new)

**Interfaces:**
- Produces: `bindingMissing(snapshot, name): boolean`; `Presence` gains `missing: boolean`. Task 3's audio reader uses `bindingMissing`.

- [ ] **Step 1: Write the failing test**

`tests/ui/systems-unchecked.test.tsx` — copy the imports, `snapshot()` harness, `actions`, `Harness` and `tree` from `tests/ui/systems-units.test.tsx` (lines 1–125), then:

```tsx
const NOT_AVAILABLE = /not available|isn't available/i;

/** Every systems binding result removed: the state right after connect. */
function unchecked(names?: readonly string[]): SessionSnapshot {
  const snap = snapshot();
  const bindings = { ...snap.compatibility.bindings };
  for (const name of names ?? Object.keys(bindings)) {
    delete bindings[name];
  }
  return { ...snap, compatibility: { ...snap.compatibility, bindings } };
}

describe.each([
  ['ENGINE', EngineSection],
  ['LIGHTS', LightsSection],
  ['FLIGHT', FlightSection],
  ['ICE', IceSection],
])('the %s page while names are being checked', (_page, section) => {
  it('prints no "not available" sentence', async () => {
    await render(tree(section, unchecked()));
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it('still prints them once the names are known to be missing', async () => {
    const snap = snapshot();
    const missing = Object.fromEntries(
      Object.keys(snap.compatibility.bindings).map((name) => [name, 'missing' as const]),
    );
    await render(tree(section, snapshot({ bindings: missing })));
    expect(screen.queryAllByText(NOT_AVAILABLE).length).toBeGreaterThan(0);
  });
});

describe('a unit with one command unchecked', () => {
  it('draws its keys and does not list the unchecked command', async () => {
    await render(tree(FlightSection, unchecked([FLAPS.down, GEAR.up])));
    expect(screen.getByLabelText('Flaps up one notch')).toBeTruthy();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it('lists a command once it is known to be missing', async () => {
    await render(tree(FlightSection, snapshot({ bindings: { [FLAPS.down]: 'missing' } })));
    expect(screen.getByText('Not available on the Cessna 172: FLAPS DOWN.')).toBeTruthy();
  });
});

it('lists a light whose state is missing while another light is unchecked', async () => {
  const snap = snapshot({ bindings: { [EXTERIOR_LIGHTS[0]!.state]: 'missing' } });
  const bindings = { ...snap.compatibility.bindings };
  delete bindings[EXTERIOR_LIGHTS[1]!.state];
  await render(
    tree(LightsSection, { ...snap, compatibility: { ...snap.compatibility, bindings } }),
  );
  expect(screen.getByText('Not available on the Cessna 172: BCN.')).toBeTruthy();
});
```

(Keep only the imports these tests use, so lint passes.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/ui/systems-unchecked.test.tsx`
Expected: FAIL — the "while names are being checked" cases find "… isn't available on the Cessna 172." text.

- [ ] **Step 3: Add the helpers**

In `src/features/panels/systems/availability.ts`:

```ts
/**
 * Definitively absent on this aircraft (missing, or read-only where the feature writes). A name
 * with no binding result yet — right after connect — is neither this nor `bindingOk`, and must
 * never produce a "not available" sentence (F-12's rule, spec §5).
 */
export function bindingMissing(snapshot: SessionSnapshot, name: string): boolean {
  const status = snapshot.compatibility.bindings[name]?.status;
  return status === 'missing' || status === 'readOnly';
}

export interface Presence {
  shown: boolean;
  enabled: boolean;
  /** The state or an action is definitively absent: the unit's S3 line names this control. */
  missing: boolean;
}

/** S3: drawn when the state resolved; enabled when every command (or the write) resolved too. */
export function presence(
  snapshot: SessionSnapshot,
  state: string,
  actions: readonly string[],
): Presence {
  const shown = bindingOk(snapshot, state);
  return {
    shown,
    enabled: shown && actions.every((name) => bindingOk(snapshot, name)),
    missing: [state, ...actions].some((name) => bindingMissing(snapshot, name)),
  };
}
```

- [ ] **Step 4: Apply the rule at every site**

Each "missing" list switches from `!bindingOk(x)` to `bindingMissing(x)`; each unit sentence needs its gating name(s) definitively missing, and otherwise the unit renders `null`.

`SwitchGroup.tsx` (`SwitchGroup`):

```tsx
  const drawn = states.filter((state) => state.shown);
  if (drawn.length === 0) {
    return specs.every((spec) => bindingMissing(snapshot, spec.state)) ? (
      <AvionicsUnit label={label}>
        <BodyText muted>{unitUnavailable(sentenceCase(label), aircraftName(snapshot))}</BodyText>
      </AvionicsUnit>
    ) : null;
  }
  const missing = states.filter((state) => state.missing).map((state) => state.spec.legend);
```

`SelectorKeys.tsx` (`selectorMissing`):

```ts
export function selectorMissing(
  snapshot: SessionSnapshot,
  state: string,
  positions: readonly SelectorPosition[],
): SelectorPosition[] {
  if (bindingMissing(snapshot, state)) {
    return [...positions];
  }
  return positions.filter((position) => bindingMissing(snapshot, position.command));
}
```

`EngineColumn.tsx` (the `missing` array):

```ts
  const missing = [
    ...[generator, pump]
      .filter((spec) => presence(snapshot, spec.state, [spec.on, spec.off]).missing)
      .map((spec) => spec.legend),
    ...(column.piston && selectorMissing(snapshot, ENGINES.key, magnetos).length > 0
      ? ['MAGNETOS']
      : []),
    ...(starter.missing ? ['START'] : []),
    ...(bindingMissing(snapshot, ENGINES.running) ? ['RUN'] : []),
  ];
```

`FlapsUnit.tsx`:

```tsx
  if (!bindingOk(snapshot, FLAPS.handle)) {
    return bindingMissing(snapshot, FLAPS.handle) ? (
      <AvionicsUnit label="FLAPS">
        <BodyText muted>{unitUnavailable('Flaps', aircraft)}</BodyText>
      </AvionicsUnit>
    ) : null;
  }
  …
  const missing = [
    ...(bindingMissing(snapshot, FLAPS.up) ? ['FLAPS UP'] : []),
    ...(bindingMissing(snapshot, FLAPS.down) ? ['FLAPS DOWN'] : []),
  ];
```

`GearUnit.tsx`: the same two changes with `GEAR.handle` / 'Landing gear' and `GEAR.up` / `GEAR.down` ('GEAR UP', 'GEAR DOWN').

`sections.tsx`:
- `FuelUnit`: `if (!bindingOk(snapshot, FUEL_SELECTOR.state)) { return bindingMissing(snapshot, FUEL_SELECTOR.state) ? (<AvionicsUnit …unitUnavailable('Fuel selector', …)/>) : null; }`
- `LightsSection`: `missing` uses `[spec.state, spec.down, spec.up].some((name) => bindingMissing(snapshot, name))`; when `drawn.length === 0`, render the INTERIOR LIGHTS unit with its sentence only if `DIMMERS.every((spec) => bindingMissing(snapshot, spec.state))`, else render no INTERIOR LIGHTS unit at all.
- `FlightSection`: `trimMissing` uses `bindingMissing(snapshot, spec.position) || [spec.decrease, spec.increase, spec.set].some((action) => bindingMissing(snapshot, action.command))`; the TRIM unit's sentence only if `TRIMS.every((spec) => bindingMissing(snapshot, spec.position))`, else no TRIM unit while `trims.length === 0`. The BRAKES unit: when `!parkingBrakeShown(snapshot)`, show the sentence only if `bindingMissing(snapshot, PARKING_BRAKE.ratio)`, else render no BRAKES unit. (`parkingBrakeShown` already counts `readOnly` as shown, so this branch is reached only for `missing` or unchecked.)

Import `bindingMissing` (and `PARKING_BRAKE` in `sections.tsx` if not yet imported) where used; drop imports that become unused.

- [ ] **Step 5: Run the Systems tests**

Run: `npx jest tests/ui/systems-unchecked.test.tsx tests/ui/systems-units.test.tsx tests/ui/systems-panel.test.tsx tests/integration/systems.test.ts`
Expected: PASS. If an existing test expected a sentence for an unchecked name, it was asserting the bug: change its fixture to mark the name `'missing'`, and say so in the report.

- [ ] **Step 6: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`

```bash
git add src/features/panels/systems tests
git commit -m "fix(systems): say not available only for names known to be missing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The AUDIO unit on Radios, and the MIC lamp on the COM rows

**Files:**
- Create: `src/features/panels/radios/audio-reader.ts`, `src/features/panels/radios/AudioUnit.tsx`, `tests/helpers/audio.ts`, `tests/ui/radios-audio.test.tsx`
- Modify: `src/features/panels/radios/radios.ts` (descriptor features), `RadiosPanel.tsx` (unit first in the stack), `RadioRow.tsx` (MIC lamp)
- Modify: `tests/ui/touch-target-guard.test.tsx` (Radios case draws the audio keys), `tests/ui/error-text-guard.test.tsx` (Radios drawn with audio bindings)

**Interfaces:**
- Consumes: Task 1's catalogue, model and messages; Task 2's `bindingMissing`; `bindingOk`, `valueOf`, `aircraftName` from `@/features/panels/systems/availability`; `numberAt` from `@/domain/systems/readouts`; `UnitLines` from `@/features/panels/systems/SwitchGroup`; `markerColour`, `MARKER_LETTER` from `@/features/panels/navigation/nav-presentation`.
- Produces: `audioReader(snapshot)`, `transmittingCom(snapshot)`, `AudioUnit`; helpers `AUDIO_VALUES`, `audioCompatibility(base, overrides)`, `audioTelemetry(values, receivedAt)` (Task 4 does not need them).

- [ ] **Step 1: Write the test helper**

`tests/helpers/audio.ts`:

```ts
import type { SessionSnapshot } from '@/application/session-snapshot';
import { type BindingResults, deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { AUDIO_FEATURES, MARKER_LAMPS, MONITORS, TRANSMIT } from '@/domain/audio/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';

type Status = 'ok' | 'missing' | 'readOnly' | 'unchecked';

/**
 * Every audio binding resolved ('ok') unless overridden ('unchecked' leaves no result at all),
 * merged into `base`: the other features keep their bindings and statuses.
 */
export function audioCompatibility(
  base: SessionSnapshot['compatibility'],
  overrides: Partial<Record<string, Status>> = {},
): SessionSnapshot['compatibility'] {
  const bindings: BindingResults = { ...base.bindings };
  for (const feature of GENERIC_PROFILE.features) {
    if (!AUDIO_FEATURES.includes(feature.id)) {
      continue;
    }
    for (const binding of feature.bindings) {
      const status = overrides[binding.name] ?? 'ok';
      if (status === 'unchecked') {
        delete bindings[binding.name];
      } else {
        bindings[binding.name] = { name: binding.name, kind: binding.kind, status };
      }
    }
  }
  const derived = deriveAvailability(GENERIC_PROFILE, bindings);
  return {
    ...base,
    bindings,
    features: base.features.map((feature) =>
      AUDIO_FEATURES.includes(feature.id)
        ? (derived.find((candidate) => candidate.id === feature.id) ?? feature)
        : feature,
    ),
  };
}

/** COM1 MIC, auto-listen off, listening to COM1 and the marker beacons, no lamp lit. */
export const AUDIO_VALUES: Record<string, DataRefValue> = {
  [TRANSMIT.selection]: 6,
  [TRANSMIT.autoListen]: 0,
  ...Object.fromEntries(MONITORS.map((spec) => [spec.state, 0])),
  [MONITORS[0]!.state]: 1,
  [MONITORS[6]!.state]: 1,
  ...Object.fromEntries(MARKER_LAMPS.map((lamp) => [lamp.state, 0])),
};

export function audioTelemetry(
  values: Record<string, DataRefValue>,
  receivedAt: number,
): SessionSnapshot['telemetry'] {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}
```

(Check `deriveAvailability`'s return type with `grep -n "export function deriveAvailability" -A5 src/domain/aircraft/availability.ts`; if it returns something other than an array of features with `id`, adapt the lookup.)

- [ ] **Step 2: Write the failing UI tests**

`tests/ui/radios-audio.test.tsx`. Harness: the `PanelScope` + `useReadBack` pattern from `tests/ui/systems-units.test.tsx` (lines 1–125) rendering `<AudioUnit readBack={readBack} />`, with this `snapshot()`:

```tsx
const NOW = 1_000_000;
const HIDDEN = { includeHiddenElements: true };
const base = initialSnapshot(GENERIC_PROFILE, 5);
const identified: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
  identified: true,
};

type Status = 'ok' | 'missing' | 'readOnly' | 'unchecked';

function snapshot({
  values = {},
  bindings = {},
  operations = {},
  stale = false,
  noFlight = false,
}: {
  values?: Record<string, DataRefValue>;
  bindings?: Partial<Record<string, Status>>;
  operations?: Record<string, OperationOutcome>;
  stale?: boolean;
  noFlight?: boolean;
} = {}): SessionSnapshot {
  return {
    ...base,
    state: stale ? 'reconnecting' : 'connected',
    health: {
      ...base.health,
      activity: noFlight ? 'noFlight' : 'running',
      live: true,
      lastHeartbeatAt: NOW,
    },
    telemetry: audioTelemetry({ ...AUDIO_VALUES, ...values }, NOW),
    compatibility: audioCompatibility(identified, bindings),
    operations,
  };
}

const accepted = (name: string): Record<string, OperationOutcome> => ({
  [name]: { status: 'ok', failure: null, refusal: null, at: NOW },
});
```

Tests (each `await render(tree(snapshot(...)))`; `button(name)` = `screen.getByRole('button', { name })`):

```tsx
const [MIC1, MIC2] = MICS as [MicSpec, MicSpec];
const monitorBy = (legend: string) => MONITORS.find((spec) => spec.legend === legend)!;
const barOf = (name: string) =>
  within(button(name)).getByTestId(/^light-bar-/, HIDDEN).props.testID as string;

describe('the AUDIO unit', () => {
  it('draws the MIC row and the seven monitor keys with X-Plane’s state', async () => {
    await render(tree(snapshot()));
    expect(barOf('Transmit on COM1, selected')).toBe('light-bar-engaged');
    expect(barOf('Transmit on COM2')).toBe('light-bar-off');
    expect(barOf('Listen to COM1, on')).toBe('light-bar-lit');
    expect(barOf('Listen to COM2, off')).toBe('light-bar-off');
    for (const name of [
      'Listen to NAV1, off',
      'Listen to NAV2, off',
      'Listen to the ADF, off',
      'Listen to the DME, off',
      'Listen to the marker beacons, on',
    ]) {
      expect(button(name)).toBeTruthy();
    }
  });

  it('sends the other COM’s transmit command and waits for X-Plane', async () => {
    const { rerender } = await render(tree(snapshot()));
    await fireEvent.press(button('Transmit on COM2'));
    expect(activate).toHaveBeenCalledWith(FEATURE_AUDIO_TRANSMIT, MIC2.command);
    await rerender(tree(snapshot({ operations: accepted(MIC2.command) })));
    expect(button('Transmit on COM2')).toBeDisabled();
    await rerender(
      tree(snapshot({ values: { [TRANSMIT.selection]: 7 }, operations: accepted(MIC2.command) })),
    );
    expect(barOf('Transmit on COM2, selected')).toBe('light-bar-engaged');
    expect(barOf('Transmit on COM1')).toBe('light-bar-off');
  });

  it('keeps the selected MIC key inert', async () => {
    await render(tree(snapshot()));
    expect(button('Transmit on COM1, selected')).toBeDisabled();
  });

  it('sends _on for a receiver that is off and _off for one that is on', async () => {
    await render(tree(snapshot()));
    await fireEvent.press(button('Listen to COM2, off'));
    expect(activate).toHaveBeenLastCalledWith(FEATURE_AUDIO_MONITOR, monitorBy('COM2').on);
    await fireEvent.press(button('Listen to the marker beacons, on'));
    expect(activate).toHaveBeenLastCalledWith(FEATURE_AUDIO_MARKER, monitorBy('MKR').off);
  });

  it('says so when X-Plane does not adopt a change', async () => {
    const { rerender } = await render(tree(snapshot()));
    await fireEvent.press(button('Listen to COM2, off'));
    await rerender(tree(snapshot({ operations: accepted(monitorBy('COM2').on) })));
    await advance(3_100);
    await rerender(tree(snapshot({ operations: accepted(monitorBy('COM2').on) }), NOW + 3_100));
    expect(screen.getByText("The Cessna 172 didn't start listening to COM2.")).toBeTruthy();
  });

  it('draws the transmitting COM lit and inert under auto-listen', async () => {
    await render(tree(snapshot({ values: { [TRANSMIT.autoListen]: 1, [MONITORS[0]!.state]: 0 } })));
    const key = button('Listen to COM1, heard while transmitting');
    expect(key).toBeDisabled();
    expect(barOf('Listen to COM1, heard while transmitting')).toBe('light-bar-lit');
    expect(button('Listen to COM2, off')).not.toBeDisabled();
  });

  it('says when the transmitting COM is not heard', async () => {
    await render(tree(snapshot({ values: { [MONITORS[0]!.state]: 0 } })));
    expect(screen.getByText("You transmit on COM1 but aren't listening to it.")).toBeTruthy();
  });

  it('selects no MIC for a selection X-Plane reports as neither COM', async () => {
    await render(tree(snapshot({ values: { [TRANSMIT.selection]: 9 } })));
    expect(button('Transmit on COM1')).toBeTruthy();
    expect(button('Transmit on COM2')).toBeTruthy();
    expect(screen.queryByText(/aren't listening/)).toBeNull();
  });

  it('lists a definitively missing key and keeps the rest working', async () => {
    await render(tree(snapshot({ bindings: { [monitorBy('MKR').state]: 'missing' } })));
    expect(screen.queryByRole('button', { name: /marker beacons/ })).toBeNull();
    expect(screen.getByText('Not available on the Cessna 172: MKR.')).toBeTruthy();
    expect(button('Listen to COM2, off')).not.toBeDisabled();
  });

  it('shows the label only while names are unchecked', async () => {
    const unchecked = Object.fromEntries(
      [TRANSMIT.selection, TRANSMIT.autoListen, ...MONITORS.flatMap((m) => [m.state, m.on, m.off]),
        ...MICS.map((m) => m.command)].map((name) => [name, 'unchecked' as const]),
    );
    await render(tree(snapshot({ bindings: unchecked })));
    expect(screen.getByText('AUDIO')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/available/)).toBeNull();
  });

  it('says the audio panel is not available when no state name resolves', async () => {
    const missing = Object.fromEntries(AUDIO_STATE_NAMES.map((name) => [name, 'missing' as const]));
    await render(tree(snapshot({ bindings: missing })));
    expect(screen.getByText("The audio panel isn't available on the Cessna 172.")).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('lights the marker lamp X-Plane reports and speaks it', async () => {
    await render(tree(snapshot({ values: { [MARKER_LAMPS[1]!.state]: 1 } })));
    expect(screen.getByLabelText('Marker beacon: middle')).toBeTruthy();
  });

  it('dims the bars, hides the lamps and keeps the keys inert when values are stale', async () => {
    await render(tree(snapshot({ stale: true, values: { [MARKER_LAMPS[0]!.state]: 1 } })));
    expect(button('Listen to COM2, off')).toBeDisabled();
    expect(screen.queryByLabelText(/Marker beacon/)).toBeNull();
    expect(barOf('Transmit on COM1, selected')).toBe('light-bar-engaged');
  });

  it('draws nothing but its label with no flight loaded', async () => {
    await render(tree(snapshot({ noFlight: true })));
    expect(screen.getByText('AUDIO')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
```

Plus, in the same file, a `describe('the Radios panel')` block rendering the full panel (the `tree` from `tests/ui/radios-panel.test.tsx`: `ThemeProvider` + `UnitsProvider` + `PanelFrame` + `<RadiosPanel />`, with `snapshot()` above plus the radio frequency values from that file's `VALUES`):

```tsx
  it('puts AUDIO above COM1', async () => {
    await render(panelTree(snapshot({ values: RADIO_VALUES })));
    const units = screen.getAllByRole('header').map((node) => node.props.children);
    expect(units.indexOf('AUDIO')).toBeLessThan(units.indexOf('COM1'));
  });

  it('shows MIC on the transmitting COM row only, and speaks it', async () => {
    await render(panelTree(snapshot({ values: { ...RADIO_VALUES, [TRANSMIT.selection]: 7 } })));
    expect(within(screen.getByTestId('radio-row-com2')).getByText('MIC')).toBeTruthy();
    expect(within(screen.getByTestId('radio-row-com1')).queryByText('MIC')).toBeNull();
    expect(screen.getByLabelText(/^COM2, transmitting: active/)).toBeTruthy();
  });

  it('shows no MIC on either row for an unknown selection', async () => {
    await render(panelTree(snapshot({ values: { ...RADIO_VALUES, [TRANSMIT.selection]: 0 } })));
    expect(screen.queryByText('MIC')).toBeNull();
  });
```

(Confirm the header text access pattern against `AvionicsUnit`: the label `Text` has `accessibilityRole="header"`. Adjust `.props.children` if the label is nested.)

- [ ] **Step 3: Run them to verify they fail**

Run: `npx jest tests/ui/radios-audio.test.tsx`
Expected: FAIL — cannot find module `AudioUnit`.

- [ ] **Step 4: Write the reader**

`src/features/panels/radios/audio-reader.ts`:

```ts
import type { SessionSnapshot } from '@/application/session-snapshot';
import { type AudioReader, audioModel } from '@/domain/audio/audio-model';
import type { ComNumber } from '@/domain/audio/catalogue';
import { numberAt } from '@/domain/systems/readouts';
import { bindingMissing, bindingOk, valueOf } from '@/features/panels/systems/availability';

/** The session snapshot as the audio domain reads it (F-12's three answers). */
export function audioReader(snapshot: SessionSnapshot): AudioReader {
  return {
    has: (name) => bindingOk(snapshot, name),
    missing: (name) => bindingMissing(snapshot, name),
    number: (name) => numberAt(valueOf(snapshot, name), 0),
  };
}

/** The COM X-Plane reports the pilot transmits on, for the COM rows' MIC lamp; null when unknown. */
export function transmittingCom(snapshot: SessionSnapshot): ComNumber | null {
  return audioModel(audioReader(snapshot)).transmitting;
}
```

- [ ] **Step 5: Write the unit**

`src/features/panels/radios/AudioUnit.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import { type MicKey, type MonitorKey, audioModel } from '@/domain/audio/audio-model';
import {
  FEATURE_AUDIO_TRANSMIT,
  MARKER_LAMPS,
  TRANSMIT,
} from '@/domain/audio/catalogue';
import {
  audioUnavailable,
  listenNotTaken,
  micNotTaken,
  notHeard,
} from '@/domain/audio/messages';
import { MARKER_LETTER, markerColour } from '@/features/panels/navigation/nav-presentation';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { audioReader } from '@/features/panels/radios/audio-reader';
import { aircraftName } from '@/features/panels/systems/availability';
import { UnitLines } from '@/features/panels/systems/SwitchGroup';
import { BodyText } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const MIC_READ_BACK = 'mic';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.touch.spacing },
  mic: { flexGrow: 1, flexBasis: '40%' as const },
  // Four to a row on a phone (COM1 COM2 NAV1 NAV2 / ADF DME MKR).
  monitor: { flexGrow: 1, flexBasis: '22%' as const },
  lamps: { flexDirection: 'row' as const, gap: 4, marginLeft: 'auto' as const },
  lamp: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    width: 18,
    textAlign: 'center' as const,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: theme.avionics.lightOff,
    color: theme.avionics.legendDim,
    overflow: 'hidden' as const,
  },
});

const SPOKEN = { on: 'on', off: 'off', auto: 'heard while transmitting', unknown: 'unknown' };

/**
 * F-23: the GA audio panel at the top of the radio stack (spec §4). MIC keys are exclusive and lit
 * green; monitor keys are independent and lit white, so talking and listening never look alike.
 * Every press sends an explicit command and is read back on the state X-Plane reports.
 */
export function AudioUnit({ readBack }: { readBack: ReadBack }) {
  const { snapshot, link, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const aircraft = aircraftName(snapshot);
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const model = audioModel(audioReader(snapshot));

  if (model.status === 'unavailable') {
    return (
      <AvionicsUnit label="AUDIO" testID="audio-unit">
        <BodyText muted>{audioUnavailable(aircraft)}</BodyText>
      </AvionicsUnit>
    );
  }
  if (model.status === 'waiting' || noFlight) {
    return <AvionicsUnit label="AUDIO" testID="audio-unit">{null}</AvionicsUnit>;
  }

  const lit = model.lamps === null ? [] : MARKER_LAMPS.filter((lamp) => model.lamps![lamp.marker]);
  const lamps =
    model.lamps === null || !link.valuesCurrent ? null : (
      <View
        style={styles.lamps}
        accessible
        accessibilityLabel={
          lit.length === 0
            ? 'Marker beacon: none'
            : `Marker beacon: ${lit.map((lamp) => lamp.marker).join(', ')}`
        }
      >
        {MARKER_LAMPS.map((lamp) => {
          const on = model.lamps![lamp.marker];
          const colour = markerColour(lamp.marker, theme);
          return (
            <Text
              key={lamp.marker}
              style={[
                styles.lamp,
                on ? { backgroundColor: colour, borderColor: colour, color: theme.avionics.bezel } : null,
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {MARKER_LETTER[lamp.marker]}
            </Text>
          );
        })}
      </View>
    );

  const micKey = (mic: MicKey) => (
    <ControlButton
      key={mic.spec.key}
      label={mic.spec.legend}
      accessibilityLabel={`Transmit on COM${mic.spec.com}${mic.selected ? ', selected' : ''}`}
      annunciation={mic.selected ? 'engaged' : 'off'}
      featureId={FEATURE_AUDIO_TRANSMIT}
      target={mic.spec.command}
      compact
      style={styles.mic}
      // The selected MIC is inert: X-Plane would re-select its listener and mute the other COM.
      invalid={!mic.enabled || mic.selected || readBack.pendingExpected(MIC_READ_BACK) !== null}
      onPress={() => {
        void activate(FEATURE_AUDIO_TRANSMIT, mic.spec.command);
        readBack.watch({
          key: MIC_READ_BACK,
          name: TRANSMIT.selection,
          operation: mic.spec.command,
          expected: mic.spec.value,
          failure: () => micNotTaken(aircraft, mic.spec.com),
        });
      }}
    />
  );

  const monitorKey = (key: MonitorKey) => {
    const on = key.listening === 'on';
    const target = on ? key.spec.off : key.spec.on;
    return (
      <ControlButton
        key={key.spec.key}
        label={key.spec.legend}
        accessibilityLabel={`Listen to ${key.spec.name}, ${SPOKEN[key.listening]}`}
        annunciation={key.listening === 'on' || key.listening === 'auto' ? 'lit' : 'off'}
        featureId={key.spec.featureId}
        target={target}
        compact
        style={styles.monitor}
        invalid={
          !key.enabled ||
          key.listening === 'auto' ||
          key.listening === 'unknown' ||
          readBack.pendingExpected(key.spec.key) !== null
        }
        onPress={() => {
          void activate(key.spec.featureId, target);
          readBack.watch({
            key: key.spec.key,
            name: key.spec.state,
            operation: target,
            expected: on ? 0 : 1,
            failure: () => listenNotTaken(aircraft, key.spec.name, !on),
          });
        }}
      />
    );
  };

  return (
    <AvionicsUnit label="AUDIO" labelAccessory={lamps} testID="audio-unit">
      {model.mics.length === 0 ? null : <View style={styles.row}>{model.mics.map(micKey)}</View>}
      {model.monitors.length === 0 ? null : (
        <View style={styles.row}>{model.monitors.map(monitorKey)}</View>
      )}
      <UnitLines
        missing={model.missing}
        readBack={readBack}
        keys={[MIC_READ_BACK, ...model.monitors.map((key) => key.spec.key)]}
        notes={[model.notHeard === null ? null : notHeard(model.notHeard)]}
      />
    </AvionicsUnit>
  );
}
```

Notes for the implementer:
- `UnitLines` prints its `missing` line with `missingControls(aircraftName(snapshot), …)`, which is the sentence the tests expect.
- If `AvionicsUnit`'s `children` type rejects `null`, pass `<></>` instead.
- `readsAs` (the default read-back match) accepts within 0.5, so `expected: 6` and `expected: 1` need no `matches`.
- If the lamp `Text` styles break lint's inline-style rule, move the lit style into `makeStyles` as a function of the colour, as `GaugeBar` does.

- [ ] **Step 6: Place it on Radios and add the MIC lamp**

`radios.ts`: import `AUDIO_FEATURES` from `@/domain/audio/catalogue` and append `...AUDIO_FEATURES` to `RADIOS_PANEL.features`.

`RadiosPanel.tsx`: import `AudioUnit` and render `<AudioUnit readBack={readBack} />` as the first child of the stack `View`, before `RADIOS.map(…)`.

`RadioRow.tsx`:

```tsx
import { transmittingCom } from '@/features/panels/radios/audio-reader';
…
// in makeStyles:
  mic: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.engaged,
    letterSpacing: 1,
  },
  micStale: { color: theme.avionics.legendDim },
…
// in RadioRow, after `noFlight`:
  // The G1000 draws the transmitting COM in green; this stack names it (spec §4.6).
  const transmitting =
    radio.kind === 'com' && !noFlight && transmittingCom(snapshot) === Number(radio.key.slice(3));
  const micLamp = transmitting ? (
    <Text
      style={[styles.mic, link.valuesCurrent ? null : styles.micStale]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      MIC
    </Text>
  ) : null;
```

Pass `labelAccessory={micLamp}` to the row's `AvionicsUnit`, and change the summary label to `` `${radio.label}${transmitting ? ', transmitting' : ''}: active ${text(active)}, standby ${text(standby)}${notLive ? ', not live' : ''}` ``. Import `avionicsText` from `@/theme/typography`.

- [ ] **Step 7: Cover Radios in the guards**

`tests/ui/touch-target-guard.test.tsx`, Radios case: build the services from `{ ...liveSnapshot(), compatibility: audioCompatibility(liveSnapshot().compatibility), telemetry: audioTelemetry(AUDIO_VALUES, NOW) }` (use the file's own `NOW`, or the heartbeat time the snapshot already uses) and assert `screen.getByLabelText('Listen to COM2, off')` exists before collecting targets, so the AUDIO keys are measured.

`tests/ui/error-text-guard.test.tsx`: in the `PANELS.map` snapshot, add a `radios` branch beside `systems` and `engines`: telemetry `audioTelemetry(AUDIO_VALUES, 9_000)` and compatibility `audioCompatibility(snapshotFor(code).compatibility)`. After the existing Engines assertion add `expect(screen.getByLabelText('Listen to COM2, off')).toBeTruthy();` with a one-line comment saying Radios' AUDIO unit is covered live.

- [ ] **Step 8: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`
Expected: PASS, no act() warnings in `tests/ui/radios-audio.test.tsx`.

```bash
git add src/features/panels/radios tests
git commit -m "feat(audio): AUDIO unit on the Radios panel and MIC lamp on the COM rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mock audio panel, integration tests and docs

**Files:**
- Modify: `tests/mock-xplane/mock-xplane-server.ts` (command behaviour; the names are already there from Task 1)
- Create: `tests/integration/audio.test.ts`
- Modify: `docs/xplane.md`, `docs/architecture.md`, `README.md`, `docs/roadmap/features/F-23-audio-panel.md`, `docs/roadmap/ROADMAP.md`, `docs/testing/xplane-smoke-test.md`

**Interfaces:**
- Consumes: Task 1's catalogue and model; Task 3's `audioReader`.

- [ ] **Step 1: Write the failing integration test**

`tests/integration/audio.test.ts` — copy `FAST_RECONNECT`, `createSession()` and `until()` from `tests/integration/engines.test.ts` (lines 1–58, imports adjusted), then:

```ts
describe('the audio panel against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  async function connected(): Promise<SimulatorSession> {
    const session = createSession();
    session.setDemand(AUDIO_FEATURES);
    await session.connect(server.host, server.port);
    await until(() => audioModel(audioReader(session.store.getSnapshot())).status === 'ready');
    return session;
  }

  const model = (session: SimulatorSession) => audioModel(audioReader(session.store.getSnapshot()));
  const heard = (session: SimulatorSession) =>
    Object.fromEntries(model(session).monitors.map((key) => [key.spec.legend, key.listening]));

  it('keeps transmit exclusive and reads the simulator’s resulting state', async () => {
    const session = await connected();
    expect(model(session).transmitting).toBe(1);
    expect(await session.activate(FEATURE_AUDIO_TRANSMIT, MICS[1]!.command)).toBe('ok');
    await until(() => model(session).transmitting === 2);
    expect(model(session).mics.map((mic) => mic.selected)).toEqual([false, true]);
    // As X-Plane does: the new MIC's COM is heard and the other COM muted.
    await until(() => heard(session).COM2 === 'auto' || heard(session).COM2 === 'on');
    expect(heard(session).COM1).toBe('off');
    session.disconnect();
  });

  it('turns a receiver on and off independently', async () => {
    const session = await connected();
    const nav1 = MONITORS.find((spec) => spec.key === 'nav1')!;
    expect(await session.activate(FEATURE_AUDIO_MONITOR, nav1.on)).toBe('ok');
    await until(() => heard(session).NAV1 === 'on');
    expect(await session.activate(FEATURE_AUDIO_MONITOR, nav1.off)).toBe('ok');
    await until(() => heard(session).NAV1 === 'off');
    session.disconnect();
  });

  it('leaves transmit and receive working when the marker flag is missing', async () => {
    server.removeDataRef(MONITORS.find((spec) => spec.key === 'mkr')!.state);
    const session = await connected();
    expect(model(session).missing).toEqual(['MKR']);
    expect(model(session).mics).toHaveLength(2);
    expect(await session.activate(FEATURE_AUDIO_TRANSMIT, MICS[1]!.command)).toBe('ok');
    await until(() => model(session).transmitting === 2);
    session.disconnect();
  });

  it('is one sentence when no audio name resolves', async () => {
    for (const name of AUDIO_STATE_NAMES) {
      server.removeDataRef(name);
    }
    const session = createSession();
    session.setDemand(AUDIO_FEATURES);
    await session.connect(server.host, server.port);
    await until(() => audioModel(audioReader(session.store.getSnapshot())).status === 'unavailable');
    session.disconnect();
  });
});
```

(Use the real teardown names in `engines.test.ts` — `disconnect()` or whatever it calls — and import `AUDIO_FEATURES`, `AUDIO_STATE_NAMES`, `FEATURE_AUDIO_MONITOR`, `FEATURE_AUDIO_TRANSMIT`, `MICS`, `MONITORS` from the catalogue, `audioModel`, `audioReader`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/integration/audio.test.ts`
Expected: FAIL — the model never becomes `ready` (the mock has no audio names).

- [ ] **Step 3: Add the mock's audio behaviour**

Task 1 already added the audio DataRefs (`audioDataRefs(1500)`: COM1 MIC, auto-listen on, COM1 heard) and commands (`audioCommands(2300)`) to `tests/mock-xplane/mock-xplane-server.ts`; do not add them again. Add only the behaviour, beside `applySystemsCommand`:

```ts
  /** As X-Plane: a MIC command selects that COM, hears it and mutes the other COM. */
  private applyAudioCommand(name: string): boolean {
    for (const mic of MICS) {
      if (name === mic.command) {
        this.setScalar(TRANSMIT.selection, mic.value);
        for (const spec of MONITORS.filter((candidate) => candidate.com !== undefined)) {
          this.setScalar(spec.state, spec.com === mic.com ? 1 : 0);
        }
        return true;
      }
    }
    for (const spec of MONITORS) {
      if (name === spec.on || name === spec.off) {
        this.setScalar(spec.state, name === spec.on ? 1 : 0);
        return true;
      }
    }
    return false;
  }
```

and call it where `applySystemsCommand` is called: `if (command !== undefined && (this.applySystemsCommand(command.name) || this.applyAudioCommand(command.name))) { return; }`. Confirm `setScalar` sets a scalar DataRef's value (it is used for `GEAR.handle`); the marker lamps already exist in the mock (ids 1092–1094).

- [ ] **Step 4: Run the integration tests**

Run: `npx jest tests/integration/audio.test.ts tests/integration/mock-xplane-server.test.ts tests/integration/radios-transponder.test.ts`
Expected: PASS. If a mock test counts the default DataRefs or commands, update the count and say so in the report.

- [ ] **Step 5: Docs**

- `docs/xplane.md`: a new "Audio panel (F-23)" section with the two tables from spec §3 (DataRefs, commands), "Verified against `DataRefs.txt`, `Commands.txt` and the live 12.4.3 database", and the note that a MIC command also selects that COM's listener and mutes the other COM (documented by a plugin author; verified on device in row 175).
- `docs/architecture.md`: in the panels section, a short F-23 paragraph — the AUDIO unit on Radios, `src/domain/audio/` (catalogue, `audioModel` over an `AudioReader` with F-12's three answers), `transmittingCom` feeding the COM rows' MIC lamp, and `bindingMissing` as the Systems/Audio rule that only definitive misses produce sentences.
- `README.md`: add the audio panel to the feature list beside the radios.
- `docs/roadmap/features/F-23-audio-panel.md`: Status `Done` with a link to the spec; replace the "exact name not identified" rows of the mapping table with the verified names; answer the open questions (transmit is one enumerated DataRef; volume deferred; COM3 not modelled).
- `docs/roadmap/ROADMAP.md`: mark F-23 done in the same style as F-12's row.
- `docs/testing/xplane-smoke-test.md`: rows 173–181, after row 172, in the table's four-column format (`| # | Step | Expected | Pass? |`, the last cell empty):

| # | Step | Expected |
|---|---|---|
| 173 | C172: open Radios; compare AUDIO with the cockpit audio panel | MIC and monitor keys match the cockpit's lit keys; the transmitting COM row shows MIC |
| 174 | Press COM2 MIC | Within a second COM2 MIC is green, the COM2 row shows MIC, and the cockpit panel shows COM2 selected |
| 175 | After 174, note COM1's monitor key | Records X-Plane's behaviour: COM1 listening goes off (expected) or stays; if it stays, update `docs/xplane.md` |
| 176 | Tune ATIS on COM2 while on COM1 MIC; press COM2 (monitor) | ATIS becomes audible in X-Plane; COM2's key lights white |
| 177 | Press a monitor key in the cockpit | The app's key follows within about 200 ms |
| 178 | Press DME and ADF | Each lights and the cockpit's matching key follows; DME's read-back succeeds (settles that `audio_dme_enabled` is the DME key's state) |
| 179 | Fly an ILS with MKR on; then off | Lamps O/M/I light on the AUDIO unit over each marker; the tone stops with MKR off |
| 180 | With X-Plane ATC active, turn the transmitting COM's monitor off | The "aren't listening" line shows and ATC is no longer heard; turn it back on |
| 181 | Pull Wi-Fi, then reconnect | Keys go inert and bars dim; after reconnect the panel shows X-Plane's state, nothing replayed |

- [ ] **Step 6: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npx jest`

```bash
git add tests docs README.md
git commit -m "test(audio): mock audio panel, integration tests and docs for F-23

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
