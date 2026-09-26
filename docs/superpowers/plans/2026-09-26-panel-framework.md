# Panel Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Avionix's single scrolling MVP screen into a shell of switchable panels that share
one set of rules for liveness, availability, touch size, confirmation, error reporting,
subscriptions, keep-awake and night presentation.

**Architecture:** Pure rules live in `src/domain/panels` (device layout, panel fit, link status,
control availability, keep-awake policy). The session gains generic `write`/`activate`
operations with outcomes keyed by binding name, and a `setDemand` that reconciles the WebSocket
subscription against the visible panel's features. The UI gets panel primitives
(`PanelFrame`, `Readout`, `ControlButton`, `ValueEntry`), a registry of two interim panels, and an
`AppShell` with a pinned status bar, a switcher and a Setup screen that replaces `MvpScreen`.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript (strict,
`noUncheckedIndexedAccess`), zod 4, Jest 29 via jest-expo (projects `node`, `expo`, `web`),
@testing-library/react-native 14, `expo-keep-awake` ~57.0.2.

**Spec:** `docs/superpowers/specs/2026-09-26-panel-framework-design.md`

## Global Constraints

- Gate after every task: `npm run typecheck && npm run lint && npm run format:check && npm test` all pass.
- Never launch Xcode, Android Studio, simulators, emulators, `expo start` or EAS builds. Device checks are the user's.
- Never render, log or serialise a bearer token or a pairing code. No URL, HTTP status, exception text or protocol payload may appear on any screen; failures reach the screen only through `FailureNotice(code, step)`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- zod v4 (`import { z } from 'zod'`). Path alias `@/` → `src/`.
- `src/domain` and `src/application` never import React or React Native.
- The repo's lint rule `react-hooks/set-state-in-effect` forbids synchronous `setState` in an effect body; set state from a promise callback or a timer instead.
- Touch rules: `touch.minTarget = 48`, `touch.spacing = 8` (dp), identical on phone and tablet.
- A tablet is a window whose shortest side is ≥ 600 dp; landscape is width > height.
- Keep-awake tag: `avionix-panel`. Layout storage key: `avionix.panels`. Theme key stays `avionix.theme`.
- Confirmation window: 3000 ms. Armed label: `Tap again: {label}`.
- Theme preferences, in order: `system`, `auto-night`, `light`, `dark`, `night`; labels System, System (night), Light, Dark, Night.
- Night palette: background `#000000`; no colour with WCAG relative luminance above 0.30; the existing AA pairs (≥ 4.5:1) hold.
- Panels never display a value they wrote; displayed values come from `snapshot.telemetry` only.
- Reserved route id: `setup`. Panel ids are never reused.

## Review Focus

1. A pilot flicking between panels while the app is still connecting or reconnecting: the socket must end on exactly the last panel's subscription set (pinned in Task 4, "a demand change during the initial subscribe").
2. A write still in flight when the pilot disconnects and connects to a different simulator: its late result must not appear against the new session's control (pinned in Task 3, "a result from before the last connect is dropped").
3. A stored layout that is corrupt, from an older release, or names a panel that no longer exists: the app opens on a sensible route instead of crashing or showing nothing (pinned in Task 5).
4. A browser that refuses the wake lock (`NotAllowedError`), or a platform where keep-awake throws: nothing crashes and nothing reaches the screen (pinned in Task 6).
5. Rotating the device while a heading is half-typed or a confirm button is armed: both survive (pinned in Task 9, "rotation keeps a half-typed entry", and Task 7 for the armed state across re-render).

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/panels/panel.ts` | `DeviceClass`, `Orientation`, `PanelDescriptor`, `EVERYWHERE` |
| `src/domain/panels/device-layout.ts` | `deviceLayout(width, height)`, `panelFit(descriptor, layout)` |
| `src/domain/panels/panel-link.ts` | `panelLinkStatus(input)` — the R7 table |
| `src/domain/panels/control-availability.ts` | `controlAvailability(feature)` — the R8 reason |
| `src/domain/panels/keep-awake-policy.ts` | `shouldHoldScreenAwake(input)` |
| `src/application/subscription-demand.ts` | `wantedDataRefIds(profile, dataRefsById, demand)` |
| `src/application/panel-layout.ts` | persisted `{ hidden, last }`, route resolution, toggling |
| `src/application/session-snapshot.ts` | `OperationOutcome`, `operations` replaces `lastOperation` |
| `src/application/simulator-session.ts` | `write`, `activate`, `setDemand`, subscription sync, telemetry retention |
| `src/platform/keep-awake.ts` | wrapper over `expo-keep-awake` that never throws |
| `src/theme/tokens.ts` | `nightTheme`, `touch` |
| `src/theme/theme-preference.ts` | five preferences |
| `src/hooks/useDeviceLayout.ts`, `usePanelLayout.ts`, `useScreenKeepAwake.ts` | UI adapters |
| `src/features/panels/primitives/*` | `PanelFrame` + `usePanel`, `Readout`, `ControlButton`, `ValueEntry` |
| `src/features/panels/basic-data/BasicDataPanel.tsx`, `heading/HeadingPanel.tsx`, `registry.ts` | the two interim panels and their registry |
| `src/features/shell/*` | `AppShell`, `PanelSwitcher`, `SetupScreen`, `PanelChooser` |
| deleted: `src/features/mvp/*` | replaced by the shell and panels |

---

### Task 1: Panel rules in the domain

**Files:**
- Create: `src/domain/panels/panel.ts`, `src/domain/panels/device-layout.ts`, `src/domain/panels/panel-link.ts`, `src/domain/panels/control-availability.ts`, `src/domain/panels/keep-awake-policy.ts`
- Test: `tests/unit/domain/panels.test.ts`

**Interfaces:**
- Consumes: `ConnectionState` (`@/domain/connection/connection-state`), `SimulatorActivity` (`@/domain/health/simulator-activity`), `ageMs`, `formatAge` (`@/domain/health/freshness`), `FeatureAvailability` (`@/domain/aircraft/availability`).
- Produces:
  - `type DeviceClass = 'phone' | 'tablet'`; `type Orientation = 'portrait' | 'landscape'`; `ORIENTATIONS`; `interface PanelDescriptor { id: string; title: string; features: readonly string[]; supports: Readonly<Record<DeviceClass, readonly Orientation[]>> }`; `EVERYWHERE`.
  - `interface DeviceLayout { deviceClass: DeviceClass; orientation: Orientation }`; `deviceLayout(width: number, height: number): DeviceLayout`; `TABLET_MIN_SHORT_SIDE_DP = 600`; `type PanelFit = 'fits' | 'rotate' | 'unsupported'`; `panelFit(descriptor: Pick<PanelDescriptor, 'supports'>, layout: DeviceLayout): PanelFit`.
  - `interface PanelLinkStatus { valuesCurrent: boolean; controlsEnabled: boolean; notice: string | null }`; `panelLinkStatus(input: { state: ConnectionState; activity: SimulatorActivity; lastHeartbeatAt: number | null; now: number }): PanelLinkStatus`.
  - `interface ControlAvailability { usable: boolean; reason: string | null }`; `controlAvailability(feature: FeatureAvailability | null): ControlAvailability`; `NO_FEATURE_REASON`.
  - `shouldHoldScreenAwake(input: { foreground: boolean; linkState: ConnectionState; onPanel: boolean }): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/domain/panels.test.ts`:

```ts
import type { FeatureAvailability } from '@/domain/aircraft/availability';
import { CONNECTION_STATES, type ConnectionState } from '@/domain/connection/connection-state';
import {
  NO_FEATURE_REASON,
  controlAvailability,
} from '@/domain/panels/control-availability';
import { deviceLayout, panelFit } from '@/domain/panels/device-layout';
import { shouldHoldScreenAwake } from '@/domain/panels/keep-awake-policy';
import { EVERYWHERE } from '@/domain/panels/panel';
import { panelLinkStatus } from '@/domain/panels/panel-link';

describe('deviceLayout', () => {
  it('classifies by the shortest side, so a phone stays a phone in landscape', () => {
    expect(deviceLayout(390, 844)).toEqual({ deviceClass: 'phone', orientation: 'portrait' });
    expect(deviceLayout(844, 390)).toEqual({ deviceClass: 'phone', orientation: 'landscape' });
    expect(deviceLayout(820, 1180)).toEqual({ deviceClass: 'tablet', orientation: 'portrait' });
    expect(deviceLayout(1180, 820)).toEqual({ deviceClass: 'tablet', orientation: 'landscape' });
  });

  it('puts the 600 dp boundary in the tablet class', () => {
    expect(deviceLayout(599, 900).deviceClass).toBe('phone');
    expect(deviceLayout(600, 900).deviceClass).toBe('tablet');
  });

  it('treats a square window as portrait', () => {
    expect(deviceLayout(700, 700).orientation).toBe('portrait');
  });
});

describe('panelFit', () => {
  const tabletLandscapeOnly = { supports: { phone: [], tablet: ['landscape' as const] } };

  it('fits everywhere a panel declares', () => {
    expect(panelFit({ supports: EVERYWHERE }, deviceLayout(390, 844))).toBe('fits');
    expect(panelFit(tabletLandscapeOnly, deviceLayout(1180, 820))).toBe('fits');
  });

  it('asks for a rotation when only the orientation is wrong', () => {
    expect(panelFit(tabletLandscapeOnly, deviceLayout(820, 1180))).toBe('rotate');
  });

  it('is unsupported on a device class the panel does not declare', () => {
    expect(panelFit(tabletLandscapeOnly, deviceLayout(390, 844))).toBe('unsupported');
    expect(panelFit(tabletLandscapeOnly, deviceLayout(844, 390))).toBe('unsupported');
  });
});

describe('panelLinkStatus', () => {
  const now = 100_000;

  it('treats a running simulator as live, with no notice', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'running', lastHeartbeatAt: now, now }),
    ).toEqual({ valuesCurrent: true, controlsEnabled: true, notice: null });
  });

  it('treats a paused simulator as current: pilots set up the aircraft while paused', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'paused', lastHeartbeatAt: 1, now }),
    ).toEqual({ valuesCurrent: true, controlsEnabled: true, notice: null });
  });

  it('says no flight is loaded', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'noFlight', lastHeartbeatAt: null, now }),
    ).toEqual({
      valuesCurrent: false,
      controlsEnabled: false,
      notice: 'No flight loaded in X-Plane.',
    });
  });

  it.each(['stalled', 'pausedOrStalled'] as const)(
    'says X-Plane stopped sending data when %s, with the age',
    (activity) => {
      expect(
        panelLinkStatus({ state: 'connected', activity, lastHeartbeatAt: now - 12_000, now }),
      ).toEqual({
        valuesCurrent: false,
        controlsEnabled: false,
        notice: 'X-Plane stopped sending data. Last update 12 s ago.',
      });
    },
  );

  it('drops the age when there has never been an update', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'stalled', lastHeartbeatAt: null, now })
        .notice,
    ).toBe('X-Plane stopped sending data.');
  });

  it('waits for the first values right after connecting', () => {
    expect(
      panelLinkStatus({ state: 'connected', activity: 'unknown', lastHeartbeatAt: null, now }),
    ).toEqual({
      valuesCurrent: false,
      controlsEnabled: false,
      notice: 'Waiting for the first values from X-Plane.',
    });
  });

  it('shows how old the values are while reconnecting', () => {
    expect(
      panelLinkStatus({
        state: 'reconnecting',
        activity: 'unknown',
        lastHeartbeatAt: now - 3_000,
        now,
      }),
    ).toEqual({
      valuesCurrent: false,
      controlsEnabled: false,
      notice: 'Reconnecting. Showing values from 3 s ago.',
    });
    expect(
      panelLinkStatus({ state: 'reconnecting', activity: 'unknown', lastHeartbeatAt: null, now })
        .notice,
    ).toBe('Reconnecting.');
  });

  it.each(['disconnected', 'error', 'connecting', 'pairing'] as const)(
    'shows the last known values when %s',
    (state) => {
      expect(
        panelLinkStatus({ state, activity: 'unknown', lastHeartbeatAt: now - 5_000, now }),
      ).toEqual({
        valuesCurrent: false,
        controlsEnabled: false,
        notice: 'Not connected. Showing the last known values.',
      });
    },
  );
});

describe('controlAvailability', () => {
  const feature = (
    status: FeatureAvailability['status'],
    missing: FeatureAvailability['missing'] = [],
  ): FeatureAvailability => ({ id: 'heading-control', label: 'Heading control', status, missing });

  it('lets available and partial features act', () => {
    expect(controlAvailability(feature('available'))).toEqual({ usable: true, reason: null });
    expect(controlAvailability(feature('partial'))).toEqual({ usable: true, reason: null });
  });

  it('says an unknown feature has not been checked, never that it is missing', () => {
    expect(controlAvailability(feature('unknown'))).toEqual({
      usable: false,
      reason: 'Heading control has not been checked yet.',
    });
  });

  it('names what an unavailable feature is missing, in the pilot’s words', () => {
    expect(
      controlAvailability(
        feature('unavailable', [
          { name: 'a', kind: 'dataref', purpose: 'Heading bug', status: 'missing' },
          { name: 'b', kind: 'command', purpose: 'Heading up control', status: 'missing' },
        ]),
      ),
    ).toEqual({
      usable: false,
      reason: 'Heading control is not available on this aircraft: Heading bug, Heading up control.',
    });
  });

  it('refuses a control whose feature the profile does not declare', () => {
    expect(controlAvailability(null)).toEqual({ usable: false, reason: NO_FEATURE_REASON });
  });
});

describe('shouldHoldScreenAwake', () => {
  const holding: ConnectionState[] = ['connected', 'reconnecting'];

  it.each(CONNECTION_STATES)('holds only while connected or reconnecting (%s)', (linkState) => {
    expect(shouldHoldScreenAwake({ foreground: true, linkState, onPanel: true })).toBe(
      holding.includes(linkState),
    );
  });

  it('releases in the background and on Setup', () => {
    expect(
      shouldHoldScreenAwake({ foreground: false, linkState: 'connected', onPanel: true }),
    ).toBe(false);
    expect(
      shouldHoldScreenAwake({ foreground: true, linkState: 'connected', onPanel: false }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/domain/panels.test.ts`
Expected: FAIL with "Cannot find module '@/domain/panels/control-availability'".

- [ ] **Step 3: Implement the five modules**

`src/domain/panels/panel.ts`:

```ts
export type DeviceClass = 'phone' | 'tablet';
export type Orientation = 'portrait' | 'landscape';

export const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];

/**
 * What the framework needs to know about a panel, without its component: the domain stays free of
 * React, and the application layer can reason about panels (subscriptions, persistence) too.
 */
export interface PanelDescriptor {
  /** Stable and persisted, so never reused for a different panel. `setup` is reserved. */
  id: string;
  title: string;
  /** Profile feature ids whose DataRefs this panel reads; they drive the subscription. */
  features: readonly string[];
  supports: Readonly<Record<DeviceClass, readonly Orientation[]>>;
}

/** Every device class in both orientations. */
export const EVERYWHERE: PanelDescriptor['supports'] = { phone: ORIENTATIONS, tablet: ORIENTATIONS };
```

`src/domain/panels/device-layout.ts`:

```ts
import type { DeviceClass, Orientation, PanelDescriptor } from '@/domain/panels/panel';

/**
 * Android's `sw600dp` convention. It also puts every iPad in the tablet class and every current
 * phone in the phone class, whichever way up it is held.
 */
export const TABLET_MIN_SHORT_SIDE_DP = 600;

export interface DeviceLayout {
  deviceClass: DeviceClass;
  orientation: Orientation;
}

/** On the web the same rule applies to the browser window, so a narrow window acts as a phone. */
export function deviceLayout(width: number, height: number): DeviceLayout {
  return {
    deviceClass: Math.min(width, height) >= TABLET_MIN_SHORT_SIDE_DP ? 'tablet' : 'phone',
    orientation: width > height ? 'landscape' : 'portrait',
  };
}

export type PanelFit = 'fits' | 'rotate' | 'unsupported';

/** R1: the shell never shows a panel on a combination the panel did not declare. */
export function panelFit(
  descriptor: Pick<PanelDescriptor, 'supports'>,
  layout: DeviceLayout,
): PanelFit {
  const orientations = descriptor.supports[layout.deviceClass];
  if (orientations.length === 0) {
    return 'unsupported';
  }
  return orientations.includes(layout.orientation) ? 'fits' : 'rotate';
}
```

`src/domain/panels/panel-link.ts`:

```ts
import type { ConnectionState } from '@/domain/connection/connection-state';
import { ageMs, formatAge } from '@/domain/health/freshness';
import type { SimulatorActivity } from '@/domain/health/simulator-activity';

export interface PanelLinkInput {
  state: ConnectionState;
  activity: SimulatorActivity;
  lastHeartbeatAt: number | null;
  now: number;
}

export interface PanelLinkStatus {
  /** Readouts show the simulator's present state; otherwise they are marked not live. */
  valuesCurrent: boolean;
  /** Every control that writes or activates may act. */
  controlsEnabled: boolean;
  /** The one explanation a panel shows at its top (R7), or null when there is nothing to say. */
  notice: string | null;
}

const LIVE: PanelLinkStatus = { valuesCurrent: true, controlsEnabled: true, notice: null };

function notLive(notice: string): PanelLinkStatus {
  return { valuesCurrent: false, controlsEnabled: false, notice };
}

/**
 * R7 as one table. Paused counts as current on purpose: a paused simulator is exactly when pilots
 * set up radios and the autopilot, its values are real (frozen) state, and writes still work.
 */
export function panelLinkStatus(input: PanelLinkInput): PanelLinkStatus {
  const age = ageMs(input.lastHeartbeatAt, input.now);
  switch (input.state) {
    case 'connected':
      return connectedStatus(input.activity, age);
    case 'reconnecting':
      return notLive(
        age === null ? 'Reconnecting.' : `Reconnecting. Showing values from ${formatAge(age)}.`,
      );
    case 'disconnected':
    case 'error':
    case 'connecting':
    case 'pairing':
      return notLive('Not connected. Showing the last known values.');
  }
}

function connectedStatus(activity: SimulatorActivity, age: number | null): PanelLinkStatus {
  switch (activity) {
    case 'running':
    case 'paused':
      return LIVE;
    case 'noFlight':
      return notLive('No flight loaded in X-Plane.');
    case 'stalled':
    case 'pausedOrStalled':
      return notLive(
        age === null
          ? 'X-Plane stopped sending data.'
          : `X-Plane stopped sending data. Last update ${formatAge(age)}.`,
      );
    case 'unknown':
      // The first half-second after a connect, before HealthMonitor's first tick, and an aircraft
      // whose heartbeat did not resolve. Neither is evidence that X-Plane stopped.
      return notLive('Waiting for the first values from X-Plane.');
  }
}
```

`src/domain/panels/control-availability.ts`:

```ts
import type { FeatureAvailability } from '@/domain/aircraft/availability';

export interface ControlAvailability {
  usable: boolean;
  /** Why the control is inert, in the pilot's words; null when it is usable. */
  reason: string | null;
}

export const NO_FEATURE_REASON = 'This control is not available on this aircraft.';

/**
 * R8. `available` and `partial` act, matching the session's `featureUsable`: `partial` exists
 * precisely for a feature missing only an optional binding. `unknown` must not borrow
 * `unavailable`'s wording — it has `missing: []`, so that copy would claim a lack it cannot name.
 */
export function controlAvailability(feature: FeatureAvailability | null): ControlAvailability {
  if (feature === null) {
    return { usable: false, reason: NO_FEATURE_REASON };
  }
  switch (feature.status) {
    case 'available':
    case 'partial':
      return { usable: true, reason: null };
    case 'unknown':
      return { usable: false, reason: `${feature.label} has not been checked yet.` };
    case 'unavailable':
      return {
        usable: false,
        reason: `${feature.label} is not available on this aircraft: ${feature.missing
          .map((miss) => miss.purpose)
          .join(', ')}.`,
      };
  }
}
```

`src/domain/panels/keep-awake-policy.ts`:

```ts
import type { ConnectionState } from '@/domain/connection/connection-state';

export interface KeepAwakeInput {
  foreground: boolean;
  linkState: ConnectionState;
  /** A panel, not Setup, is the route on screen. */
  onPanel: boolean;
}

/**
 * R5. Reconnecting holds, because a tablet sleeping through a Wi-Fi blip on short final is the
 * failure the user story names; disconnected, error and pairing release.
 */
export function shouldHoldScreenAwake(input: KeepAwakeInput): boolean {
  return (
    input.foreground &&
    input.onPanel &&
    (input.linkState === 'connected' || input.linkState === 'reconnecting')
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/domain/panels.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass. If `format:check` fails, run `npx prettier --write` on the new files.

```bash
git add src/domain/panels tests/unit/domain/panels.test.ts
git commit -m "feat(panels): add the device layout, link status and control availability rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Night presentation and touch tokens

**Files:**
- Modify: `src/theme/tokens.ts`, `src/theme/theme-preference.ts`, `src/theme/ThemeToggle.tsx`, `src/theme/primitives.tsx`, `src/app/AvionixApp.tsx` (`ThemedStatusBar`)
- Test: `tests/unit/theme/tokens.test.ts`, `tests/unit/theme/theme-preference.test.ts`, `tests/ui/theme.test.tsx`

**Interfaces:**
- Produces: `type ThemeMode = 'light' | 'dark' | 'night'`; `nightTheme: Theme`; `Theme.touch: { minTarget: number; spacing: number }` (48 and 8 in every theme); `THEME_PREFERENCES = ['system', 'auto-night', 'light', 'dark', 'night']`; `resolveThemeMode('auto-night', scheme)` → `'night'` when the scheme is dark, else `'light'`; `keyboardAppearanceFor(mode: ThemeMode): 'light' | 'dark'` exported from `src/theme/tokens.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/theme/tokens.test.ts`, change the import to
`import { darkTheme, keyboardAppearanceFor, lightTheme, nightTheme, themeForMode } from '@/theme/tokens';`
and replace the `describe('theme tokens', ...)` block with:

```ts
const ALL_THEMES = [lightTheme, darkTheme, nightTheme];

describe('theme tokens', () => {
  it('provides one theme per mode', () => {
    expect(lightTheme.mode).toBe('light');
    expect(darkTheme.mode).toBe('dark');
    expect(nightTheme.mode).toBe('night');
    expect(themeForMode('light')).toBe(lightTheme);
    expect(themeForMode('dark')).toBe(darkTheme);
    expect(themeForMode('night')).toBe(nightTheme);
  });

  it('defines the same colour keys in every mode with hex values', () => {
    const lightKeys = Object.keys(lightTheme.colors).sort();
    for (const theme of ALL_THEMES) {
      expect(Object.keys(theme.colors).sort()).toEqual(lightKeys);
      for (const value of Object.values(theme.colors)) {
        expect(value).toMatch(HEX);
      }
    }
  });

  it('uses distinct backgrounds so the toggle is visible', () => {
    const backgrounds = new Set(ALL_THEMES.map((theme) => theme.colors.background));
    expect(backgrounds.size).toBe(ALL_THEMES.length);
    expect(lightTheme.colors.text).not.toBe(darkTheme.colors.text);
  });

  it('shares spacing, radius, typography and touch scales across modes', () => {
    for (const theme of ALL_THEMES) {
      expect(theme.spacing).toEqual(lightTheme.spacing);
      expect(theme.radius).toEqual(lightTheme.radius);
      expect(theme.typography).toEqual(lightTheme.typography);
      expect(theme.touch).toEqual({ minTarget: 48, spacing: 8 });
    }
  });

  it('meets WCAG AA contrast for text pairs in every mode', () => {
    for (const theme of ALL_THEMES) {
      const { colors } = theme;
      const pairs: Array<[string, string]> = [
        [colors.text, colors.background],
        [colors.text, colors.surface],
        [colors.textMuted, colors.surface],
        [colors.onPrimary, colors.primary],
        ['#ffffff', colors.primary],
        [colors.placeholder, colors.inputBackground],
        [colors.danger, colors.surface],
        [colors.success, colors.surface],
      ];
      for (const [foreground, background] of pairs) {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the night palette dark: a black background and nothing that glows', () => {
    expect(nightTheme.colors.background).toBe('#000000');
    for (const [key, value] of Object.entries(nightTheme.colors)) {
      expect({ key, luminance: relativeLuminance(value) <= 0.3 }).toEqual({
        key,
        luminance: true,
      });
    }
  });

  it('keeps danger and success apart from each other and from text at night', () => {
    const { danger, success, text } = nightTheme.colors;
    expect(new Set([danger, success, text]).size).toBe(3);
  });

  it('gives the keyboard a dark appearance at night', () => {
    expect(keyboardAppearanceFor('light')).toBe('light');
    expect(keyboardAppearanceFor('dark')).toBe('dark');
    expect(keyboardAppearanceFor('night')).toBe('dark');
  });
});
```

In `tests/unit/theme/theme-preference.test.ts`, change the stable-order test's expectation to
`['system', 'auto-night', 'light', 'dark', 'night']` and add inside `describe('resolveThemeMode', ...)`:

```ts
  it('follows the OS scheme between light and night for auto-night', () => {
    expect(resolveThemeMode('auto-night', 'dark')).toBe('night');
    expect(resolveThemeMode('auto-night', 'light')).toBe('light');
    expect(resolveThemeMode('auto-night', null)).toBe('light');
  });

  it('uses night regardless of the OS scheme when night is chosen', () => {
    expect(resolveThemeMode('night', 'light')).toBe('night');
  });
```

Add to the persistence `describe` (read the file first and reuse its existing imports and storage
helper; `createMemorySettingsStorage` is in `@/application/settings-store`):

```ts
  it.each(['auto-night', 'night'] as const)('round-trips %s', async (preference) => {
    const storage = createMemorySettingsStorage();
    await saveThemePreference(storage, preference);
    await expect(loadThemePreference(storage)).resolves.toBe(preference);
  });

  it('still reads a preference stored before night existed', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ preference: 'dark' }));
    await expect(loadThemePreference(storage)).resolves.toBe('dark');
  });
```

In `tests/ui/theme.test.tsx`, add to `describe('ThemeToggle', ...)`:

```ts
  it('offers night and applies it', async () => {
    const storage = createMemorySettingsStorage();
    await render(
      <ThemeProvider storage={storage} systemSchemeOverride="light">
        <ThemeToggle />
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('ready'));
    await fireEvent.press(screen.getByLabelText('Theme Night'));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('night'));
    expect(screen.getByLabelText('Theme System (night)')).not.toBeChecked();
  });

  it('meets the touch rules on every chip', async () => {
    await render(
      <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
        <ThemeToggle />
      </ThemeProvider>,
    );
    for (const chip of screen.getAllByRole('radio')) {
      const style = StyleSheet.flatten(chip.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });
```

and add `import { StyleSheet } from 'react-native';` to that file's imports.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/theme tests/ui/theme.test.tsx`
Expected: FAIL (`nightTheme` is not exported; `Theme Night` not found).

- [ ] **Step 3: Implement**

`src/theme/tokens.ts` — change the mode type, add `touch` to `Theme`, add the night palette and
`keyboardAppearanceFor`, and register night in `THEMES`:

```ts
export type ThemeMode = 'light' | 'dark' | 'night';
```

In `interface Theme`, after `typography`, add:

```ts
  /** F-04 R4: the same on phone and tablet; a tablet shows more controls, never smaller ones. */
  touch: { minTarget: number; spacing: number };
```

Next to the other shared scales add `const touch = { minTarget: 48, spacing: 8 } as const;` and
add `touch,` to both `lightTheme` and `darkTheme` after `typography,`. Then add:

```ts
/**
 * For a darkened room (F-04 R6): a black background so an OLED screen is simply off, warm dim text,
 * and nothing whose relative luminance exceeds 0.30, so the panel never lights up the room or
 * spoils the pilot's view of a dim monitor. The AA contrast pairs still hold.
 */
export const nightTheme: Theme = {
  mode: 'night',
  colors: {
    background: '#000000',
    surface: '#0a0806',
    text: '#a88a60',
    textMuted: '#917752',
    border: '#3a2e20',
    primary: '#33200a',
    onPrimary: '#a88a60',
    danger: '#d0584a',
    success: '#6f9a4a',
    inputBackground: '#000000',
    placeholder: '#917752',
  },
  spacing,
  radius,
  typography,
  touch,
};

const THEMES: Record<ThemeMode, Theme> = { light: lightTheme, dark: darkTheme, night: nightTheme };

/** React Native's keyboard has two appearances; night wants the dark one. */
export function keyboardAppearanceFor(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'light' ? 'light' : 'dark';
}
```

(Replace the existing `THEMES` line rather than adding a second one.) If the contrast test reports
a pair below 4.5 or a colour above 0.30 luminance, adjust only that night colour, keeping it warm
and dim, until both hold.

`src/theme/theme-preference.ts`:

```ts
export const THEME_PREFERENCES = ['system', 'auto-night', 'light', 'dark', 'night'] as const;
```

and replace `resolveThemeMode` with:

```ts
/**
 * `system` follows the device between light and dark; `auto-night` follows it between light and
 * night, which is how F-04 R6's night presentation "can follow the device".
 */
export function resolveThemeMode(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
): ThemeMode {
  switch (preference) {
    case 'system':
      return systemScheme === 'dark' ? 'dark' : 'light';
    case 'auto-night':
      return systemScheme === 'dark' ? 'night' : 'light';
    default:
      return preference;
  }
}
```

`src/theme/ThemeToggle.tsx` — labels and touch-sized chips:

```ts
const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  'auto-night': 'System (night)',
  light: 'Light',
  dark: 'Dark',
  night: 'Night',
};

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
```

and remove `hitSlop={8}` from the `Pressable` (the chip itself is now large enough).

`src/theme/primitives.tsx` — in `ThemedTextInput`, import `keyboardAppearanceFor` from
`@/theme/tokens` and replace `keyboardAppearance={theme.mode}` with
`keyboardAppearance={keyboardAppearanceFor(theme.mode)}`.

`src/app/AvionixApp.tsx` — in `ThemedStatusBar`, replace the ternary with
`<StatusBar style={theme.mode === 'light' ? 'dark' : 'light'} />`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/theme tests/ui/theme.test.tsx tests/ui/mvp-screen.test.tsx`
Expected: PASS (the MVP screen still renders the toggle; its `Theme Dark` and `Theme System`
labels are unchanged).

- [ ] **Step 5: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

```bash
git add src/theme src/app/AvionixApp.tsx tests/unit/theme tests/ui/theme.test.tsx
git commit -m "feat(theme): add the night presentation and the touch target tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Generic operations with outcomes keyed by control

**Files:**
- Modify: `src/application/session-snapshot.ts`, `src/application/simulator-session.ts`, `src/app/services-context.tsx`, `src/hooks/useSimulatorSession.ts`, `src/features/mvp/ControlPanel.tsx`, `src/features/mvp/MvpScreen.tsx`
- Test: `tests/unit/application/simulator-session.test.ts`, `tests/integration/simulator-session.test.ts`, `tests/integration/simulator-session-pairing.test.ts`, `tests/ui/mvp-screen.test.tsx`, `tests/ui/error-text-guard.test.tsx`, `tests/ui/use-connection-settings.test.tsx`, `tests/ui/use-connector-discovery.test.tsx`, `tests/web/use-connection-settings.web.test.tsx`, `tests/web/mvp-screen.web.test.tsx`

**Interfaces:**
- Consumes: `findFeature(profile, featureId)` from `@/domain/aircraft/profile`; `DataRefValue` from `@/domain/simulator/types`.
- Produces:
  - In `session-snapshot.ts`: `type OperationRefusal = 'notConnected' | 'unavailable'`; `interface OperationOutcome { status: 'pending' | 'ok' | 'failed'; failure: FailureRef | null; refusal: OperationRefusal | null; at: number }`; `SessionSnapshot.operations: Readonly<Record<string, OperationOutcome | undefined>>` (replaces `lastOperation`; `LastOperation` is deleted).
  - On `SimulatorSession`: `write(featureId: string, name: string, value: DataRefValue): Promise<void>`; `activate(featureId: string, name: string, durationSec?: number): Promise<void>`. `writeHeading` and `activateHeadingUp` are deleted.
  - `SessionApi` = `Pick<SimulatorSession, 'store' | 'connect' | 'disconnect' | 'pair' | 'write' | 'activate' | 'recheckCompatibility'>`; `useSimulatorSession()` returns `{ snapshot, connect, disconnect, pair, write, activate, recheckCompatibility }`.

**Behaviour to implement (spec, "Operations reported against their control"):**
- `write` refuses with `'notConnected'` unless the session has an active connection in state `connected`; refuses with `'unavailable'` unless `name` is a `kind: 'dataref'`, `write: true` binding of `featureId` in the active profile, it resolved, and the feature is `available` or `partial`.
- `activate` refuses the same way, requiring a `kind: 'command'` binding of `featureId` that resolved.
- A refusal is recorded as `{ status: 'failed', failure: null, refusal }`. Otherwise the outcome goes `pending` → `ok`, or → `failed` with `failure: { code, step: 'operation' }` (fallback codes `WRITE_FAILED` / `COMMAND_FAILED`) and `refusal: null`.
- Outcomes are keyed by binding name, stamped with `at: this.now()`, reset by `connect()` (via `initialSnapshot`) and kept by `disconnect()`.
- An outcome that settles after a later `connect()` is dropped: the session keeps an `operationsEpoch` counter bumped at the top of `connect()`, and every outcome write checks it. `UNAUTHORIZED` still returns the session to pairing, but only from a current epoch.
- The 0–360 heading check leaves the session. It moves into `ControlPanel` now and into the heading panel's `ValueEntry` in Task 8.

- [ ] **Step 1: Write the new session tests**

In `tests/unit/application/simulator-session.test.ts`, replace the whole
`describe('SimulatorSession operations', ...)` block with:

```ts
describe('SimulatorSession operations', () => {
  const HEADING = GENERIC_DATAREFS.headingBug;
  const HEADING_UP = GENERIC_COMMANDS.headingUp;

  it('writes a binding of the feature and records the outcome against its name', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.write(FEATURE_HEADING_CONTROL, HEADING, 95);
    expect(clients[0]?.writes).toEqual([{ id: 3, value: 95 }]);
    expect(snapshot().operations[HEADING]).toEqual({
      status: 'ok',
      failure: null,
      refusal: null,
      at: 1234,
    });
  });

  it('is pending while the write is in flight', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    let release: () => void = () => undefined;
    clients[0]?.setDataRefValue.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const writing = session.write(FEATURE_HEADING_CONTROL, HEADING, 95);
    await flush();
    expect(snapshot().operations[HEADING]?.status).toBe('pending');
    release();
    await writing;
    expect(snapshot().operations[HEADING]?.status).toBe('ok');
  });

  it('records a failed write as a failure ref, never as text', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.setDataRefValue.mockRejectedValueOnce(
      new AvionixError({
        code: 'WRITE_FAILED',
        message: 'read only',
        simulatorErrorCode: 'dataref_is_readonly',
      }),
    );
    await session.write(FEATURE_HEADING_CONTROL, HEADING, 10);
    expect(snapshot().operations[HEADING]).toEqual({
      status: 'failed',
      failure: { code: 'WRITE_FAILED', step: 'operation' },
      refusal: null,
      at: 1234,
    });
    expect(JSON.stringify(snapshot().operations)).not.toContain('read only');
    expect(snapshot().state).toBe('connected');
  });

  it('activates a command binding of the feature', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.activate(FEATURE_HEADING_CONTROL, HEADING_UP);
    expect(clients[0]?.activations).toEqual([9]);
    expect(snapshot().operations[HEADING_UP]).toMatchObject({ status: 'ok', failure: null });
  });

  it('passes a hold duration through to the command', async () => {
    const { session, clients } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.activate(FEATURE_HEADING_CONTROL, HEADING_UP, 2);
    expect(clients[0]?.activateCommand).toHaveBeenCalledWith(9, 2);
  });

  it('records a failed command activation with a failure ref', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.activateCommand.mockRejectedValueOnce(
      new AvionixError({ code: 'COMMAND_FAILED', message: 'X-Plane answered HTTP 500' }),
    );
    await session.activate(FEATURE_HEADING_CONTROL, HEADING_UP);
    expect(snapshot().operations[HEADING_UP]).toMatchObject({
      status: 'failed',
      failure: { code: 'COMMAND_FAILED', step: 'operation' },
      refusal: null,
    });
  });

  it('refuses while not connected, without calling the client', async () => {
    const { session, clients, snapshot } = setup();
    await session.write(FEATURE_HEADING_CONTROL, HEADING, 10);
    await session.activate(FEATURE_HEADING_CONTROL, HEADING_UP);
    expect(clients[0]?.setDataRefValue).not.toHaveBeenCalled();
    expect(snapshot().operations[HEADING]).toMatchObject({
      status: 'failed',
      failure: null,
      refusal: 'notConnected',
    });
    expect(snapshot().operations[HEADING_UP]?.refusal).toBe('notConnected');
  });

  it.each([
    ['a name outside the feature', FEATURE_FLIGHT_TELEMETRY, GENERIC_DATAREFS.headingBug],
    ['a binding that is not written', FEATURE_FLIGHT_TELEMETRY, GENERIC_DATAREFS.airspeed],
    ['a name no profile declares', FEATURE_HEADING_CONTROL, 'sim/not/a/binding'],
    ['an unknown feature', 'no-such-feature', GENERIC_DATAREFS.headingBug],
  ])('refuses to write %s', async (_label, featureId, name) => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.write(featureId, name, 1);
    expect(clients[0]?.writes).toEqual([]);
    expect(snapshot().operations[name]).toMatchObject({ status: 'failed', refusal: 'unavailable' });
  });

  it('refuses to activate a DataRef as if it were a command', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.activate(FEATURE_HEADING_CONTROL, HEADING);
    expect(clients[0]?.activations).toEqual([]);
    expect(snapshot().operations[HEADING]?.refusal).toBe('unavailable');
  });

  it('keeps the outcomes across a disconnect and resets them on the next connect', async () => {
    const { session, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.write(FEATURE_HEADING_CONTROL, HEADING, 95);
    session.disconnect();
    expect(snapshot().operations[HEADING]?.status).toBe('ok');
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().operations).toEqual({});
  });

  it('a result from before the last connect is dropped', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    let fail: (error: unknown) => void = () => undefined;
    clients[0]?.setDataRefValue.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (fail = reject)),
    );
    const writing = session.write(FEATURE_HEADING_CONTROL, HEADING, 95);
    await flush();
    await session.connect('192.168.1.100', 8086);
    fail(new AvionixError({ code: 'UNAUTHORIZED', message: 'gone' }));
    await writing;
    expect(snapshot().operations[HEADING]).toBeUndefined();
    expect(snapshot().state).toBe('connected');
  });
});
```

- [ ] **Step 2: Migrate the other existing uses in the session and integration tests**

Apply this mapping everywhere in `tests/unit/application/simulator-session.test.ts`,
`tests/integration/simulator-session.test.ts` and `tests/integration/simulator-session-pairing.test.ts`
(search for `writeHeading`, `activateHeadingUp` and `lastOperation`; import
`FEATURE_HEADING_CONTROL`, `GENERIC_COMMANDS` and `GENERIC_DATAREFS` from
`@/domain/aircraft/profiles/generic` where a file does not already):

| Old | New |
|---|---|
| `session.writeHeading(N)` | `session.write(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, N)` |
| `session.activateHeadingUp()` | `session.activate(FEATURE_HEADING_CONTROL, GENERIC_COMMANDS.headingUp)` |
| `lastOperation` after a write `toMatchObject({ kind: 'write', ok: true })` | `operations[GENERIC_DATAREFS.headingBug]` `toMatchObject({ status: 'ok' })` |
| `lastOperation` after a command `toMatchObject({ kind: 'command', ok: true })` | `operations[GENERIC_COMMANDS.headingUp]` `toMatchObject({ status: 'ok' })` |
| `lastOperation` `toMatchObject({ kind: 'write', ok: false })` (UNAUTHORIZED cases) | `operations[GENERIC_DATAREFS.headingBug]` `toMatchObject({ status: 'failed', failure: { code: 'UNAUTHORIZED', step: 'operation' } })` |
| `lastOperation` `toMatchObject({ kind: 'command', ok: false })` (UNAUTHORIZED cases) | `operations[GENERIC_COMMANDS.headingUp]` `toMatchObject({ status: 'failed', failure: { code: 'UNAUTHORIZED', step: 'operation' } })` |
| `lastOperation` `toMatchObject({ ok: false, message: expect.stringContaining('not connected') })` | the target's outcome `toMatchObject({ status: 'failed', refusal: 'notConnected' })` |
| `lastOperation` `toMatchObject({ ok: false, message: 'Heading control is not available on this aircraft', failure: null })` | the target's outcome `toMatchObject({ status: 'failed', failure: null, refusal: 'unavailable' })` |

In the unit file's `'returns to pairing when a heading write is rejected'` and
`'returns to pairing when a command activation is rejected'` tests the failure code is whatever
`unauthorized()` builds; keep `code: 'UNAUTHORIZED'` in the expectation.

- [ ] **Step 3: Run the session tests to verify they fail**

Run: `npx jest tests/unit/application/simulator-session.test.ts`
Expected: FAIL with type errors or "session.write is not a function".

- [ ] **Step 4: Implement the snapshot change**

In `src/application/session-snapshot.ts`, delete `interface LastOperation` and add in its place:

```ts
/** Why an operation was not sent at all. Rendered from a fixed table of plain-language copy. */
export type OperationRefusal = 'notConnected' | 'unavailable';

/**
 * The last operation a control caused, keyed in `SessionSnapshot.operations` by the binding name
 * it targeted, so a failure is shown against that control and nowhere else (F-04 R9).
 */
export interface OperationOutcome {
  status: 'pending' | 'ok' | 'failed';
  /** An AvionixError-derived failure; rendered only through FailureNotice. */
  failure: FailureRef | null;
  /** A refusal before anything was sent. */
  refusal: OperationRefusal | null;
  at: number;
}
```

In `SessionSnapshot`, replace `lastOperation: LastOperation | null;` with
`operations: Readonly<Record<string, OperationOutcome | undefined>>;`, and in `initialSnapshot`
replace `lastOperation: null,` with `operations: {},`.

- [ ] **Step 5: Implement the session operations**

In `src/application/simulator-session.ts`:

1. Imports: remove `type LastOperation` and add `type OperationOutcome` and
   `type OperationRefusal` to the `@/application/session-snapshot` import; replace
   `import { commandBindingOf, profileBindings, writeBindingOf } from '@/domain/aircraft/profile';`
   with `import { findFeature, profileBindings } from '@/domain/aircraft/profile';`; change the
   generic-profile import to `import { GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';`;
   add `DataRefValue` to the `@/domain/simulator/types` type import.
2. Add a field next to `private roundTrips: number[] = [];`:

```ts
  /**
   * Bumped by every `connect()`. An operation settling after a later connect belongs to a session
   * the pilot has left, possibly on another simulator, so its outcome must not appear against the
   * new session's control.
   */
  private operationsEpoch = 0;
```

3. At the very top of `connect()`, before `this.teardown();`, add `this.operationsEpoch += 1;`.
4. Delete `writeHeading`, `activateHeadingUp`, `requireActive` and `recordOperation`, and add in
   their place (keep `recheckCompatibility` where it is):

```ts
  /**
   * Writes one DataRef on behalf of a panel control (F-04). `name` must be a `write: true` DataRef
   * binding of `featureId` in the active profile: a panel cannot write a name the compatibility
   * check never vouched for. The outcome is recorded against `name` (R9); nothing here or in any
   * panel displays the written value, which arrives from the simulator like any other (R10).
   */
  async write(featureId: string, name: string, value: DataRefValue): Promise<void> {
    const epoch = this.operationsEpoch;
    const active = this.connectedOrRefuse(epoch, name);
    if (active === null) {
      return;
    }
    const binding = findFeature(active.profile, featureId)?.bindings.find(
      (candidate) =>
        candidate.kind === 'dataref' && candidate.name === name && candidate.write === true,
    );
    const descriptor = binding === undefined ? undefined : active.dataRefsByName.get(name);
    if (descriptor === undefined || !this.featureUsable(featureId)) {
      this.refuse(epoch, name, 'unavailable');
      return;
    }
    this.recordOutcome(epoch, name, { status: 'pending', failure: null, refusal: null });
    try {
      await this.timed(active.generation, () =>
        active.client.setDataRefValue(descriptor.id, value),
      );
      this.recordOutcome(epoch, name, { status: 'ok', failure: null, refusal: null });
    } catch (error) {
      this.recordFailure(
        epoch,
        name,
        toAvionixError(error, { code: 'WRITE_FAILED', message: 'Write failed' }),
      );
    }
  }

  /** Presses (or, with `durationSec`, holds) a command binding of `featureId`. */
  async activate(featureId: string, name: string, durationSec = 0): Promise<void> {
    const epoch = this.operationsEpoch;
    const active = this.connectedOrRefuse(epoch, name);
    if (active === null) {
      return;
    }
    const binding = findFeature(active.profile, featureId)?.bindings.find(
      (candidate) => candidate.kind === 'command' && candidate.name === name,
    );
    const command = binding === undefined ? undefined : active.commandsByName.get(name);
    if (command === undefined || !this.featureUsable(featureId)) {
      this.refuse(epoch, name, 'unavailable');
      return;
    }
    this.recordOutcome(epoch, name, { status: 'pending', failure: null, refusal: null });
    try {
      await this.timed(active.generation, () =>
        active.client.activateCommand(command.id, durationSec),
      );
      this.recordOutcome(epoch, name, { status: 'ok', failure: null, refusal: null });
    } catch (error) {
      this.recordFailure(
        epoch,
        name,
        toAvionixError(error, { code: 'COMMAND_FAILED', message: 'Command failed' }),
      );
    }
  }
```

5. In the internals section, next to `featureUsable`, add:

```ts
  private connectedOrRefuse(epoch: number, name: string): ActiveConnection | null {
    const active = this.active;
    if (active === null || this.store.getSnapshot().state !== 'connected') {
      this.refuse(epoch, name, 'notConnected');
      return null;
    }
    return active;
  }

  private refuse(epoch: number, name: string, refusal: OperationRefusal): void {
    this.recordOutcome(epoch, name, { status: 'failed', failure: null, refusal });
  }

  /**
   * `AvionixError.message` is deliberately neither stored nor logged: it can carry URLs, and the
   * WebSocket URL carries the connector token. The code is enough for FailureNotice and the log.
   */
  private recordFailure(epoch: number, name: string, error: AvionixError): void {
    if (epoch !== this.operationsEpoch) {
      return;
    }
    this.logger.warn('operation failed', { code: error.code });
    this.recordOutcome(epoch, name, {
      status: 'failed',
      failure: { code: error.code, step: 'operation' },
      refusal: null,
    });
    // Writes and commands go over authenticated HTTP, so this is a place the connector can
    // disown us.
    this.returnToPairingIfUnauthorized(error);
  }

  private recordOutcome(
    epoch: number,
    name: string,
    outcome: Omit<OperationOutcome, 'at'>,
  ): void {
    if (epoch !== this.operationsEpoch) {
      return;
    }
    const at = this.now();
    this.store.setState((prev) => ({
      ...prev,
      operations: { ...prev.operations, [name]: { ...outcome, at } },
    }));
  }
```

If TypeScript reports `FEATURE_HEADING_CONTROL` or `AvionixError` as unused or missing, adjust
only the import lines accordingly.

- [ ] **Step 6: Run the session tests**

Run: `npx jest tests/unit/application tests/integration`
Expected: PASS.

- [ ] **Step 7: Move the UI to the new API**

`src/app/services-context.tsx`: in `SessionApi`, replace `| 'writeHeading'` and
`| 'activateHeadingUp'` with `| 'write'` and `| 'activate'`.

`src/hooks/useSimulatorSession.ts`: replace the two heading callbacks with

```ts
  const write = useCallback(
    (featureId: string, name: string, value: DataRefValue) =>
      session.write(featureId, name, value),
    [session],
  );
  const activate = useCallback(
    (featureId: string, name: string, durationSec?: number) =>
      session.activate(featureId, name, durationSec),
    [session],
  );
```

(import `type DataRefValue` from `@/domain/simulator/types`) and return `write` and `activate`
instead of `writeHeading` and `activateHeadingUp`.

`src/features/mvp/ControlPanel.tsx` is deleted in Task 9; until then it moves to the new API.
Replace its `Props`, the `canWrite` line and `LastOperationRow` so that the file reads:

```tsx
import React, { useState } from 'react';
import { Button, View } from 'react-native';

import type { OperationOutcome, SessionSnapshot } from '@/application/session-snapshot';
import type { FeatureAvailability } from '@/domain/aircraft/availability';
import { GENERIC_COMMANDS, GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';
import { FailureNotice } from '@/features/health/FailureNotice';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  enabled: boolean;
  feature: FeatureAvailability | null;
  operations: SessionSnapshot['operations'];
  onWriteHeading: (value: number) => void;
  onHeadingUp: () => void;
}

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md, marginBottom: theme.spacing.sm },
});

export function ControlPanel(props: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [heading, setHeading] = useState('90');
  const parsed = Number(heading);
  // Matches `featureUsable` in simulator-session.ts exactly: `partial` still has controls to
  // offer, since it exists precisely for a feature missing only an optional binding (R6).
  const usableStatus = props.feature?.status === 'available' || props.feature?.status === 'partial';
  const usable = props.enabled && usableStatus;
  const reason = reasonFor(props.feature, usableStatus);
  const inRange = heading.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 360;
  return (
    <Section>
      <SectionTitle>Test controls</SectionTitle>
      <BodyText>Heading bug to write (0-360)</BodyText>
      <ThemedTextInput
        accessibilityLabel="Heading to write"
        value={heading}
        onChangeText={setHeading}
        keyboardType="numeric"
      />
      {heading.trim() !== '' && !inRange ? (
        <BodyText tone="danger">Heading must be between 0 and 360</BodyText>
      ) : null}
      <View style={styles.row}>
        <Button
          title="Write heading"
          onPress={() => props.onWriteHeading(parsed)}
          disabled={!usable || !inRange}
          color={theme.colors.primary}
        />
        <Button
          title="Heading up"
          onPress={props.onHeadingUp}
          disabled={!usable}
          color={theme.colors.primary}
        />
      </View>
      {reason === null ? null : <BodyText muted>{reason}</BodyText>}
      <OutcomeRow label="Heading write" outcome={props.operations[GENERIC_DATAREFS.headingBug]} />
      <OutcomeRow label="Heading up" outcome={props.operations[GENERIC_COMMANDS.headingUp]} />
    </Section>
  );
}
```

keep `reasonFor` unchanged, and replace `LastOperationRow` with:

```tsx
/** A failure renders only through FailureNotice (F-02 R9); a refusal in fixed plain words. */
function OutcomeRow({ label, outcome }: { label: string; outcome: OperationOutcome | undefined }) {
  if (outcome === undefined || outcome.status === 'pending') {
    return null;
  }
  if (outcome.status === 'ok') {
    return <BodyText>{`${label}: OK`}</BodyText>;
  }
  if (outcome.failure !== null) {
    return (
      <View>
        <BodyText tone="danger">{`${label}: FAILED`}</BodyText>
        <FailureNotice code={outcome.failure.code} step={outcome.failure.step} />
      </View>
    );
  }
  return (
    <BodyText tone="danger">
      {outcome.refusal === 'notConnected'
        ? `${label}: not sent, Avionix is not connected to X-Plane`
        : `${label}: not sent, not available on this aircraft`}
    </BodyText>
  );
}
```

`src/features/mvp/MvpScreen.tsx`: take `write` and `activate` from `useSimulatorSession()` instead
of the heading callbacks, import `GENERIC_COMMANDS` and `GENERIC_DATAREFS` alongside
`FEATURE_HEADING_CONTROL`, and render:

```tsx
        <ControlPanel
          enabled={snapshot.state === 'connected'}
          feature={featureOf(snapshot.compatibility, FEATURE_HEADING_CONTROL)}
          operations={snapshot.operations}
          onWriteHeading={(value) =>
            void write(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, value)
          }
          onHeadingUp={() => void activate(FEATURE_HEADING_CONTROL, GENERIC_COMMANDS.headingUp)}
        />
```

- [ ] **Step 8: Migrate the UI tests**

In every fake `session` object (`tests/ui/mvp-screen.test.tsx`,
`tests/ui/use-connection-settings.test.tsx`, `tests/ui/use-connector-discovery.test.tsx`,
`tests/web/use-connection-settings.web.test.tsx`, `tests/web/mvp-screen.web.test.tsx`), replace
`writeHeading` / `activateHeadingUp` with `write: jest.fn(async () => undefined)` and
`activate: jest.fn(async () => undefined)` (plain `async () => undefined` in the web files and in
files that do not use `jest.fn` for the others).

In `tests/ui/mvp-screen.test.tsx`:

- In `'writes the heading and activates the command, showing the last operation'`, expect
  `session.write` to have been called with
  `(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, 95)` and `session.activate` with
  `(FEATURE_HEADING_CONTROL, GENERIC_COMMANDS.headingUp)`; set
  `operations: { [GENERIC_COMMANDS.headingUp]: { status: 'ok', failure: null, refusal: null, at: 1 } }`
  in the `store.setState` call and expect the text `'Heading up: OK'`. Rename the test to
  `'writes the heading and activates the command, showing each outcome'`.
- In `'disables the heading controls and says why ...'`, expect `session.activate` not to have
  been called.
- In `'renders a failed operation as a cause and an action, never the raw protocol message'`, set
  `operations: { [GENERIC_DATAREFS.headingBug]: { status: 'failed', failure: { code: 'HTTP_ERROR', step: 'operation' }, refusal: null, at: 1 } }`
  and expect `'Heading write: FAILED'` instead of `'Last operation: FAILED'`; keep the other
  expectations.
- Add:

```tsx
  it('refuses a heading outside 0 to 360 before anything is sent', async () => {
    const { services, session } = makeServices({
      state: 'connected',
      compatibility: headingControlAvailable(),
    });
    await renderScreen(services);
    await fireEvent.changeText(screen.getByLabelText('Heading to write'), '400');
    expect(screen.getByText('Heading must be between 0 and 360')).toBeTruthy();
    await fireEvent.press(screen.getByText('Write heading'));
    expect(session.write).not.toHaveBeenCalled();
  });
```

Import `GENERIC_COMMANDS` from `@/domain/aircraft/profiles/generic`.

In `tests/ui/error-text-guard.test.tsx`, replace the `LastOperation` import and
`lastOperationFor` with:

```tsx
import {
  type OperationOutcome,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
```

```tsx
function failedOutcome(code: AvionixErrorCode): OperationOutcome {
  return { status: 'failed', failure: { code, step: 'operation' }, refusal: null, at: 10_000 };
}
```

and render `ControlPanel` with
`operations={{ [GENERIC_DATAREFS.headingBug]: failedOutcome(code), [GENERIC_COMMANDS.headingUp]: failedOutcome(code) }}`
in place of `lastOperation`, importing `GENERIC_COMMANDS` and `GENERIC_DATAREFS`.

- [ ] **Step 9: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass.

```bash
git add -A src tests
git commit -m "feat(session): generic write and activate with outcomes keyed by control

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Subscriptions follow the demand, and values outlive a dropped link

**Files:**
- Create: `src/application/subscription-demand.ts`
- Modify: `src/application/simulator-session.ts`, `src/app/services-context.tsx`, `src/hooks/useSimulatorSession.ts`
- Test: `tests/unit/application/subscription-demand.test.ts`, `tests/unit/application/simulator-session.test.ts`

**Interfaces:**
- Consumes: `IDENTITY_DATAREF_NAMES` (`@/domain/aircraft/identity-datarefs`), `FEATURE_CONNECTION_HEALTH` (`@/domain/aircraft/profiles/generic`), `AircraftProfile`, `DataRefDescriptor`.
- Produces:
  - `wantedDataRefIds(profile: AircraftProfile, dataRefsById: ReadonlyMap<number, DataRefDescriptor>, demand: readonly string[] | null): Set<number>`.
  - `SimulatorSession.setDemand(featureIds: readonly string[]): void`.
  - `SessionApi` gains `'setDemand'`; `useSimulatorSession()` returns `setDemand`.

**Behaviour to implement (spec, "Subscriptions follow the visible panel" and "Last known values survive a dropped link"):**
- `demand` starts `null`, meaning every resolved DataRef (today's behaviour). `setDemand` stores a de-duplicated copy; an unchanged demand does nothing.
- Wanted ids: all resolved ids when the demand is `null`; otherwise the resolved ids of the identification names, the `connection-health` feature's DataRefs and the DataRefs of every demanded feature, all read from the given profile.
- `ActiveConnection` gains `streamById: Map<number, DataRefDescriptor>` (which updates are accepted, and as which name) and `subscriptionQueue: Promise<void>` (one subscription change at a time). `applyUpdates` looks descriptors up in `streamById`, not `dataRefsById`.
- `syncSubscriptions(active, source?)` computes the target from `source ?? active` (its `profile` and `dataRefsById`) and the demand current when it runs, then: adds the added ids to `streamById` → subscribes them (timed) → on failure removes them from `streamById` again and rethrows → records them in `subscribedIds` → replaces `streamById` with exactly the target's descriptors → prunes `telemetry` to the target's names → unsubscribes the removed ids → records that. It returns early whenever `this.active !== active`.
- Every sync runs through `withSubscriptionLock(active, run)`, a per-connection promise chain.
- The initial subscribe in `completeSessionSetup` and the aircraft re-check's delta both become a locked `syncSubscriptions` call. The re-check syncs toward the new bindings *before* installing them, keeping F-03's rule that a failed delta keeps the last good result.
- `setDemand` on a live connection queues a locked sync; its failure is logged at warn and leaves the link up.
- `disconnect()` and each reconnect attempt stop clearing `telemetry`. `connect()` still clears it.

- [ ] **Step 1: Write the failing unit test for the pure function**

Create `tests/unit/application/subscription-demand.test.ts`:

```ts
import { wantedDataRefIds } from '@/application/subscription-demand';
import { IDENTITY_DATAREFS } from '@/domain/aircraft/identity-datarefs';
import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import type { DataRefDescriptor } from '@/domain/simulator/types';

const NAMES: Array<[number, string]> = [
  [1, GENERIC_DATAREFS.heartbeat],
  [2, GENERIC_DATAREFS.airspeed],
  [3, GENERIC_DATAREFS.headingBug],
  [4, GENERIC_DATAREFS.paused],
  [5, IDENTITY_DATAREFS.icaoType],
  [6, IDENTITY_DATAREFS.description],
  [7, IDENTITY_DATAREFS.tailNumber],
  [8, 'addon/version/string'],
];

function resolved(ids: number[] = NAMES.map(([id]) => id)): Map<number, DataRefDescriptor> {
  const map = new Map<number, DataRefDescriptor>();
  for (const [id, name] of NAMES) {
    if (ids.includes(id)) {
      map.set(id, { id, name, valueType: 'float' });
    }
  }
  return map;
}

const sorted = (ids: Set<number>) => [...ids].sort((a, b) => a - b);

describe('wantedDataRefIds', () => {
  it('wants every resolved DataRef until a demand is set', () => {
    expect(sorted(wantedDataRefIds(GENERIC_PROFILE, resolved(), null))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('always keeps identification and connection health, even with nothing demanded', () => {
    expect(sorted(wantedDataRefIds(GENERIC_PROFILE, resolved(), []))).toEqual([1, 4, 5, 6, 7]);
  });

  it('adds the DataRefs of each demanded feature', () => {
    expect(
      sorted(wantedDataRefIds(GENERIC_PROFILE, resolved(), [FEATURE_FLIGHT_TELEMETRY])),
    ).toEqual([1, 2, 4, 5, 6, 7]);
    expect(
      sorted(
        wantedDataRefIds(GENERIC_PROFILE, resolved(), [
          FEATURE_FLIGHT_TELEMETRY,
          FEATURE_HEADING_CONTROL,
        ]),
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('wants only names that resolved', () => {
    expect(
      sorted(wantedDataRefIds(GENERIC_PROFILE, resolved([1, 3, 5]), [FEATURE_HEADING_CONTROL])),
    ).toEqual([1, 3, 5]);
  });

  it('ignores a demanded feature the profile does not declare', () => {
    expect(sorted(wantedDataRefIds(GENERIC_PROFILE, resolved(), ['no-such-feature']))).toEqual([
      1, 4, 5, 6, 7,
    ]);
  });
});
```

- [ ] **Step 2: Write the failing session tests**

In `tests/unit/application/simulator-session.test.ts`:

1. Give `FakeClient` a live set. Add the field `live = new Set<number>();`, and in the
   `subscribeDataRefs` mock add `for (const sub of subs) this.live.add(sub.id);` after the push;
   in `unsubscribeDataRefs` add `for (const sub of subs) this.live.delete(sub.id);` inside the
   `if (subs !== 'all')` branch and `this.live.clear();` in an `else` branch.
2. Change `'disconnect closes the socket, clears telemetry and returns to disconnected'` to
   `'disconnect closes the socket, keeps the last known values and returns to disconnected'`,
   expecting `snapshot().telemetry` to equal
   `{ [GENERIC_DATAREFS.heartbeat]: { value: 1, receivedAt: 1 } }`.
3. In `'installs nothing once the connection it was computed for has gone away'`, the comment and
   expectation `expect(snapshot().telemetry).toEqual({});` become: record
   `const telemetryBefore = snapshot().telemetry;` right after `session.disconnect();` and expect
   `expect(snapshot().telemetry).toBe(telemetryBefore);` at the end, with the comment
   `// disconnect() kept the last known values; the dead pass must not have written over them.`
4. Add a new block:

```ts
describe('SimulatorSession subscription demand', () => {
  const sortedIds = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b);

  it('subscribes every resolved DataRef until a demand is set', async () => {
    const { session, clients } = setup();
    await session.connect('192.168.1.100', 8086);
    expect(sortedIds(clients[0]?.live ?? [])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('a demand set before connecting decides the first subscription', async () => {
    const { session, clients } = setup();
    session.setDemand([FEATURE_FLIGHT_TELEMETRY]);
    await session.connect('192.168.1.100', 8086);
    expect(sortedIds(clients[0]?.live ?? [])).toEqual([1, 2, 4, 5, 6, 7]);
  });

  it('an empty demand keeps identification and connection health', async () => {
    const { session, clients } = setup();
    await session.connect('192.168.1.100', 8086);
    session.setDemand([]);
    await flush();
    expect(sortedIds(clients[0]?.live ?? [])).toEqual([1, 4, 5, 6, 7]);
    expect(sortedIds(clients[0]?.unsubscribed ?? [])).toEqual([2, 3]);
  });

  it('a switch leaves a value both panels read untouched', async () => {
    const { session, clients } = setup();
    session.setDemand([FEATURE_FLIGHT_TELEMETRY, FEATURE_HEADING_CONTROL]);
    await session.connect('192.168.1.100', 8086);
    const client = clients[0];
    if (client === undefined) {
      throw new Error('no client');
    }
    client.subscribed.length = 0;
    client.unsubscribed.length = 0;
    session.setDemand([FEATURE_HEADING_CONTROL]);
    await flush();
    expect(client.subscribed).toEqual([]);
    expect(client.unsubscribed).toEqual([2]);
    expect(client.live.has(3)).toBe(true);
  });

  it('subscribes the added ids before it unsubscribes the removed ones', async () => {
    const { session, clients } = setup();
    session.setDemand([FEATURE_FLIGHT_TELEMETRY]);
    await session.connect('192.168.1.100', 8086);
    const client = clients[0];
    if (client === undefined) {
      throw new Error('no client');
    }
    client.subscribeDataRefs.mockClear();
    client.unsubscribeDataRefs.mockClear();
    session.setDemand([FEATURE_HEADING_CONTROL]);
    await flush();
    const subscribedAt = client.subscribeDataRefs.mock.invocationCallOrder[0] ?? Infinity;
    const unsubscribedAt = client.unsubscribeDataRefs.mock.invocationCallOrder[0] ?? -Infinity;
    expect(subscribedAt).toBeLessThan(unsubscribedAt);
    expect(client.subscribeDataRefs).toHaveBeenCalledWith([{ id: 3 }]);
    expect(client.unsubscribeDataRefs).toHaveBeenCalledWith([{ id: 2 }]);
  });

  it('accepts the first update for an added id even before the subscribe call returns', async () => {
    const { session, clients, snapshot } = setup();
    session.setDemand([]);
    await session.connect('192.168.1.100', 8086);
    const client = clients[0];
    if (client === undefined) {
      throw new Error('no client');
    }
    let release: () => void = () => undefined;
    client.subscribeDataRefs.mockImplementationOnce(async (subs) => {
      // X-Plane may push the first full update before it answers the subscribe request.
      client.emitUpdates([{ id: 3, value: 270, receivedAt: 5 }]);
      await new Promise<void>((resolve) => (release = resolve));
      for (const sub of subs) {
        client.live.add(sub.id);
      }
    });
    session.setDemand([FEATURE_HEADING_CONTROL]);
    await flush();
    release();
    await flush();
    expect(snapshot().telemetry[GENERIC_DATAREFS.headingBug]).toEqual({
      value: 270,
      receivedAt: 5,
    });
  });

  it('prunes a value it stops subscribing and ignores a late update for it', async () => {
    const { session, clients, snapshot } = setup();
    session.setDemand([FEATURE_FLIGHT_TELEMETRY, FEATURE_HEADING_CONTROL]);
    await session.connect('192.168.1.100', 8086);
    clients[0]?.emitUpdates([
      { id: 2, value: 120, receivedAt: 5 },
      { id: 3, value: 270, receivedAt: 5 },
    ]);
    session.setDemand([FEATURE_HEADING_CONTROL]);
    await flush();
    expect(snapshot().telemetry[GENERIC_DATAREFS.airspeed]).toBeUndefined();
    expect(snapshot().telemetry[GENERIC_DATAREFS.headingBug]?.value).toBe(270);
    clients[0]?.emitUpdates([{ id: 2, value: 121, receivedAt: 6 }]);
    expect(snapshot().telemetry[GENERIC_DATAREFS.airspeed]).toBeUndefined();
  });

  it('a burst of demand changes ends on the last one', async () => {
    const { session, clients } = setup();
    session.setDemand([]);
    await session.connect('192.168.1.100', 8086);
    session.setDemand([FEATURE_FLIGHT_TELEMETRY]);
    session.setDemand([FEATURE_HEADING_CONTROL, FEATURE_FLIGHT_TELEMETRY]);
    session.setDemand([FEATURE_HEADING_CONTROL]);
    await flush();
    expect(sortedIds(clients[0]?.live ?? [])).toEqual([1, 3, 4, 5, 6, 7]);
  });

  it('a demand change during the initial subscribe still ends on the last demand', async () => {
    const client = new FakeClient();
    let release: () => void = () => undefined;
    client.subscribeDataRefs.mockImplementationOnce(async (subs) => {
      await new Promise<void>((resolve) => (release = resolve));
      for (const sub of subs) {
        client.subscribed.push(sub.id);
        client.live.add(sub.id);
      }
    });
    const { session, snapshot } = setup({ clients: [client] });
    session.setDemand([FEATURE_FLIGHT_TELEMETRY]);
    const connecting = session.connect('192.168.1.100', 8086);
    await flush();
    session.setDemand([FEATURE_HEADING_CONTROL]);
    release();
    await connecting;
    await flush();
    expect(snapshot().state).toBe('connected');
    expect(sortedIds(client.live)).toEqual([1, 3, 4, 5, 6, 7]);
  });

  it('a failed subscription change keeps the link up and the next change repairs it', async () => {
    const { session, clients, snapshot } = setup();
    session.setDemand([]);
    await session.connect('192.168.1.100', 8086);
    clients[0]?.subscribeDataRefs.mockRejectedValueOnce(
      new AvionixError({ code: 'SUBSCRIPTION_FAILED', message: 'nope' }),
    );
    session.setDemand([FEATURE_FLIGHT_TELEMETRY]);
    await flush();
    expect(snapshot().state).toBe('connected');
    expect(clients[0]?.live.has(2)).toBe(false);
    session.setDemand([FEATURE_FLIGHT_TELEMETRY, FEATURE_HEADING_CONTROL]);
    await flush();
    expect(sortedIds(clients[0]?.live ?? [])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('a re-check reconciles against the current demand', async () => {
    const client = new FakeClient();
    const { session } = setup({ clients: [client] });
    session.setDemand([FEATURE_HEADING_CONTROL]);
    await session.connect('192.168.1.100', 8086);
    // The next aircraft re-issues the heading bug under a new id.
    client.dataRefs = {
      ...client.dataRefs,
      [GENERIC_DATAREFS.headingBug]: { id: 30, valueType: 'float', isWritable: true },
    };
    await session.recheckCompatibility();
    expect(client.live.has(30)).toBe(true);
    expect(client.live.has(3)).toBe(false);
    expect(client.live.has(2)).toBe(false);
  });

  it('keeps the last known values across a reconnect attempt', async () => {
    const first = new FakeClient();
    const second = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [first, second] });
    await session.connect('192.168.1.100', 8086);
    first.emitUpdates([{ id: 2, value: 120, receivedAt: 5 }]);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    second.connectError = new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'down' });
    await scheduler.runNext();
    expect(snapshot().state).toBe('reconnecting');
    expect(snapshot().telemetry[GENERIC_DATAREFS.airspeed]).toEqual({
      value: 120,
      receivedAt: 5,
    });
  });

  it('clears the last known values on a fresh connect', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.emitUpdates([{ id: 2, value: 120, receivedAt: 5 }]);
    session.disconnect();
    const connecting = session.connect('192.168.1.100', 8086);
    expect(snapshot().telemetry).toEqual({});
    await connecting;
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest tests/unit/application/subscription-demand.test.ts tests/unit/application/simulator-session.test.ts`
Expected: FAIL ("Cannot find module '@/application/subscription-demand'", "setDemand is not a function").

- [ ] **Step 4: Implement `subscription-demand.ts`**

```ts
import { IDENTITY_DATAREF_NAMES } from '@/domain/aircraft/identity-datarefs';
import type { AircraftProfile } from '@/domain/aircraft/profile';
import { FEATURE_CONNECTION_HEALTH } from '@/domain/aircraft/profiles/generic';
import type { DataRefDescriptor } from '@/domain/simulator/types';

/**
 * Which resolved DataRefs the socket should carry (F-04 R12). `demand` is the visible panel's
 * feature ids, or null before any panel has said, which keeps today's behaviour of streaming
 * everything. Identification and connection health are always wanted: the first announces an
 * aircraft change (F-03), the second is how the app knows the values are live (F-02).
 */
export function wantedDataRefIds(
  profile: AircraftProfile,
  dataRefsById: ReadonlyMap<number, DataRefDescriptor>,
  demand: readonly string[] | null,
): Set<number> {
  if (demand === null) {
    return new Set(dataRefsById.keys());
  }
  const names = new Set<string>(IDENTITY_DATAREF_NAMES);
  for (const feature of profile.features) {
    if (feature.id !== FEATURE_CONNECTION_HEALTH && !demand.includes(feature.id)) {
      continue;
    }
    for (const binding of feature.bindings) {
      if (binding.kind === 'dataref') {
        names.add(binding.name);
      }
    }
  }
  const ids = new Set<number>();
  for (const [id, descriptor] of dataRefsById) {
    if (names.has(descriptor.name)) {
      ids.add(id);
    }
  }
  return ids;
}
```

- [ ] **Step 5: Implement the session changes**

In `src/application/simulator-session.ts`:

1. Import `wantedDataRefIds` from `@/application/subscription-demand`.
2. In `ActiveConnection`, after `subscribedIds: Set<number>;`, add:

```ts
  /**
   * Which ids' updates are accepted, and as which name. Separate from `dataRefsById` on purpose:
   * an id enters here before its subscribe request is sent, because X-Plane's first update after
   * a subscribe carries the value even if it never changes again and may arrive before the reply;
   * an id leaves before its unsubscribe, so a late update cannot resurrect a pruned value.
   */
  streamById: Map<number, DataRefDescriptor>;
  /** Subscription changes on this socket run one at a time, in order. */
  subscriptionQueue: Promise<void>;
```

3. Add the field `private demand: readonly string[] | null = null;` next to `private profile`,
   with the comment `/** The visible panel's feature ids; null until a panel says (stream everything). */`.
4. Add the public method after `recheckCompatibility`:

```ts
  /**
   * Which profile features the visible panel reads (F-04 R12). The socket is reconciled to carry
   * those DataRefs plus identification and connection health; values both the old and the new
   * demand use are neither dropped nor re-subscribed (R3). While there is no live connection the
   * demand is only recorded, and the next connect subscribes from it.
   */
  setDemand(featureIds: readonly string[]): void {
    const next = [...new Set(featureIds)].sort();
    if (this.demand !== null && next.join('\n') === this.demand.join('\n')) {
      return;
    }
    this.demand = next;
    const active = this.active;
    if (active === null) {
      return;
    }
    void this.withSubscriptionLock(active, () => this.syncSubscriptions(active)).catch(
      (error: unknown) => {
        // The link is still up; the next demand change or re-check tries again.
        this.logger.warn('subscription update failed', {
          code: toAvionixError(error, { code: 'SUBSCRIPTION_FAILED', message: '' }).code,
        });
      },
    );
  }
```

5. Add the two private helpers (next to `applyUpdates`):

```ts
  private withSubscriptionLock(
    active: ActiveConnection,
    run: () => Promise<void>,
  ): Promise<void> {
    const result = active.subscriptionQueue.then(run, run);
    active.subscriptionQueue = result.catch(() => undefined);
    return result;
  }

  /**
   * Reconciles the socket with the wanted set for `source` (the installed bindings by default, or
   * a re-check's new ones before they are installed) and the demand current when this runs, so a
   * queue of changes ends on the latest demand. Added ids are subscribed before removed ids are
   * dropped: a brief superset costs nothing, while the reverse could leave the socket without the
   * identification DataRefs if the subscribe then failed.
   */
  private async syncSubscriptions(
    active: ActiveConnection,
    source: Pick<ActiveConnection, 'profile' | 'dataRefsById'> = active,
  ): Promise<void> {
    if (this.active !== active) {
      return;
    }
    const target = wantedDataRefIds(source.profile, source.dataRefsById, this.demand);
    const added = [...target].filter((id) => !active.subscribedIds.has(id));
    const removed = [...active.subscribedIds].filter((id) => !target.has(id));
    if (added.length > 0) {
      for (const id of added) {
        const descriptor = source.dataRefsById.get(id);
        if (descriptor !== undefined) {
          active.streamById.set(id, descriptor);
        }
      }
      try {
        await this.timed(active.generation, () =>
          active.client.subscribeDataRefs(added.map((id) => ({ id }))),
        );
      } catch (error) {
        for (const id of added) {
          active.streamById.delete(id);
        }
        throw error;
      }
      active.subscribedIds = new Set([...active.subscribedIds, ...added]);
    }
    if (this.active !== active) {
      return;
    }
    const stream = new Map<number, DataRefDescriptor>();
    for (const id of target) {
      const descriptor = source.dataRefsById.get(id);
      if (descriptor !== undefined) {
        stream.set(id, descriptor);
      }
    }
    active.streamById = stream;
    const names = new Set([...stream.values()].map((descriptor) => descriptor.name));
    this.store.setState((prev) => {
      const kept = Object.entries(prev.telemetry).filter(([name]) => names.has(name));
      if (kept.length === Object.keys(prev.telemetry).length) {
        return prev;
      }
      // A value the socket no longer carries would otherwise be shown as current when its panel
      // returns; a dash for one update cycle is honest (spec decision 7).
      return { ...prev, telemetry: Object.fromEntries(kept) };
    });
    if (removed.length > 0) {
      await active.client.unsubscribeDataRefs(removed.map((id) => ({ id })));
      active.subscribedIds = new Set([...active.subscribedIds].filter((id) => target.has(id)));
    }
  }
```

6. In `completeSessionSetup`, add `streamById: new Map<number, DataRefDescriptor>(),` and
   `subscriptionQueue: Promise.resolve(),` to the `ActiveConnection` literal, and replace

```ts
    const ids = [...bindings.dataRefsById.keys()];
    try {
      await this.timed(generation, () => client.subscribeDataRefs(ids.map((id) => ({ id }))));
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
      active.subscribedIds = new Set(ids);
```

with

```ts
    try {
      await this.withSubscriptionLock(active, () => this.syncSubscriptions(active));
      if (!this.isCurrent(generation)) {
        return 'failed';
      }
```

   (the rest of the `try`/`catch` stays as it is).
7. In `applyUpdates`, replace `const dataRefsById = active.dataRefsById;` with
   `const streamById = active.streamById;` and both `dataRefsById.get(update.id)` lookups with
   `streamById.get(update.id)`.
8. In `runRecheck`, replace everything from `const nextIds = new Set(bindings.dataRefsById.keys());`
   down to and including the `if (removed.length > 0) { ... }` block with:

```ts
      // Toward the new bindings before they are installed: a delta that fails throws into the
      // catch below, which keeps the last good result (F-03).
      await this.withSubscriptionLock(active, () =>
        this.syncSubscriptions(active, {
          profile: bindings.profile,
          dataRefsById: bindings.dataRefsById,
        }),
      );
```

   Keep the `if (this.active !== active || !this.isCurrent(generation)) { return; }` check and the
   installation that follow. Delete the now-unused comment about `subscribedIds` being updated as
   each call returns (that bookkeeping now lives in `syncSubscriptions`).
9. In `disconnect()`, delete the line `telemetry: {},` and update the doc comment's last sentence
   to: `Telemetry is kept as well: panels show the last known values, marked not live (F-04).`
10. In `scheduleReconnect`, delete `telemetry: {},` from the state update inside the scheduled
    callback.

- [ ] **Step 6: Expose `setDemand` to the UI**

`src/app/services-context.tsx`: add `| 'setDemand'` to `SessionApi`.
`src/hooks/useSimulatorSession.ts`: add
`const setDemand = useCallback((featureIds: readonly string[]) => session.setDemand(featureIds), [session]);`
and return it. Add `setDemand: jest.fn()` (or `setDemand: () => undefined` in the web files) to
every fake session object in the test files listed in Task 3 Step 8.

- [ ] **Step 7: Run the tests**

Run: `npx jest tests/unit/application tests/integration`
Expected: PASS. If an existing F-03 re-check test asserted exact `client.subscribed` contents that
now differ only because the delta is computed by `syncSubscriptions`, read that test: its intent
(added before removed, identification ids kept on failure, nothing installed after teardown) must
still hold; adjust only a literal that encoded an implementation detail, and say so in the report.

- [ ] **Step 8: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

```bash
git add -A src tests
git commit -m "feat(session): subscribe what the visible panel reads and keep values after a drop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Persisted panel layout

**Files:**
- Create: `src/application/panel-layout.ts`, `src/hooks/usePanelLayout.ts`
- Test: `tests/unit/application/panel-layout.test.ts`, `tests/ui/use-panel-layout.test.tsx`

**Interfaces:**
- Consumes: `SettingsStorage` (`@/application/settings-store`).
- Produces:
  - `PANEL_LAYOUT_STORAGE_KEY = 'avionix.panels'`, `SETUP_ROUTE = 'setup'`, `interface PanelLayout { hidden: readonly string[]; last: string }`, `DEFAULT_PANEL_LAYOUT`.
  - `normaliseLayout(layout: PanelLayout, knownIds: readonly string[]): PanelLayout`
  - `visiblePanelIds(layout: PanelLayout, knownIds: readonly string[]): string[]`
  - `resolveRoute(last: string, availableIds: readonly string[]): string`
  - `canHidePanel(layout: PanelLayout, knownIds: readonly string[], id: string): boolean`
  - `setPanelHidden(layout: PanelLayout, knownIds: readonly string[], id: string, hidden: boolean): PanelLayout` (returns the same object when nothing changes)
  - `loadPanelLayout(storage: SettingsStorage, knownIds: readonly string[]): Promise<PanelLayout>`, `savePanelLayout(storage: SettingsStorage, layout: PanelLayout): Promise<void>`
  - `usePanelLayout(storage: SettingsStorage, knownIds: readonly string[]): { layout: PanelLayout; ready: boolean; setLast(route: string): void; setHidden(id: string, hidden: boolean): void }` — `knownIds` must be a stable reference.

- [ ] **Step 1: Write the failing tests**

`tests/unit/application/panel-layout.test.ts`:

```ts
import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_LAYOUT_STORAGE_KEY,
  SETUP_ROUTE,
  canHidePanel,
  loadPanelLayout,
  normaliseLayout,
  resolveRoute,
  savePanelLayout,
  setPanelHidden,
  visiblePanelIds,
} from '@/application/panel-layout';
import { createMemorySettingsStorage } from '@/application/settings-store';

const KNOWN = ['basic-data', 'heading'];

describe('panel layout rules', () => {
  it('opens on Setup the first time, where the pilot connects', () => {
    expect(DEFAULT_PANEL_LAYOUT).toEqual({ hidden: [], last: SETUP_ROUTE });
  });

  it('drops ids this release does not know, and duplicates', () => {
    expect(
      normaliseLayout({ hidden: ['gone', 'heading', 'heading'], last: 'gone' }, KNOWN),
    ).toEqual({ hidden: ['heading'], last: SETUP_ROUTE });
  });

  it('never leaves every panel hidden', () => {
    expect(normaliseLayout({ hidden: ['basic-data', 'heading'], last: 'setup' }, KNOWN)).toEqual({
      hidden: [],
      last: SETUP_ROUTE,
    });
  });

  it('lists visible panels in registry order', () => {
    expect(visiblePanelIds({ hidden: ['basic-data'], last: SETUP_ROUTE }, KNOWN)).toEqual([
      'heading',
    ]);
  });

  it('restores Setup or an available panel, else falls back', () => {
    expect(resolveRoute(SETUP_ROUTE, KNOWN)).toBe(SETUP_ROUTE);
    expect(resolveRoute('heading', KNOWN)).toBe('heading');
    expect(resolveRoute('heading', ['basic-data'])).toBe('basic-data');
    expect(resolveRoute('heading', [])).toBe(SETUP_ROUTE);
  });

  it('hides and shows a panel, but never the last visible one', () => {
    const shown = { hidden: [], last: SETUP_ROUTE };
    const oneHidden = setPanelHidden(shown, KNOWN, 'heading', true);
    expect(oneHidden.hidden).toEqual(['heading']);
    expect(canHidePanel(oneHidden, KNOWN, 'basic-data')).toBe(false);
    expect(setPanelHidden(oneHidden, KNOWN, 'basic-data', true)).toBe(oneHidden);
    expect(setPanelHidden(oneHidden, KNOWN, 'heading', false).hidden).toEqual([]);
    expect(setPanelHidden(shown, KNOWN, 'unknown', true)).toBe(shown);
  });
});

describe('panel layout persistence', () => {
  it('round-trips under the documented key', async () => {
    const storage = createMemorySettingsStorage();
    await savePanelLayout(storage, { hidden: ['heading'], last: 'basic-data' });
    expect(JSON.parse((await storage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? 'null')).toEqual({
      hidden: ['heading'],
      last: 'basic-data',
    });
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: ['heading'],
      last: 'basic-data',
    });
  });

  it.each([
    ['nothing stored', null],
    ['corrupt JSON', '{not json'],
    ['a wrong shape', JSON.stringify({ hidden: 'heading' })],
  ])('falls back to the default for %s', async (_label, raw) => {
    const storage = createMemorySettingsStorage();
    if (raw !== null) {
      await storage.setItem(PANEL_LAYOUT_STORAGE_KEY, raw);
    }
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('normalises what it loads, so a retired panel cannot become the route', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: ['retired'], last: 'retired' }),
    );
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('swallows storage failures on read and write', async () => {
    const broken = {
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => {
        throw new Error('disk');
      },
    };
    await expect(loadPanelLayout(broken, KNOWN)).resolves.toEqual(DEFAULT_PANEL_LAYOUT);
    await expect(savePanelLayout(broken, DEFAULT_PANEL_LAYOUT)).resolves.toBeUndefined();
  });
});
```

`tests/ui/use-panel-layout.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { PANEL_LAYOUT_STORAGE_KEY } from '@/application/panel-layout';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { usePanelLayout } from '@/hooks/usePanelLayout';

const KNOWN = ['basic-data', 'heading'];

function Probe({ storage }: { storage: SettingsStorage }) {
  const { layout, ready, setLast, setHidden } = usePanelLayout(storage, KNOWN);
  return (
    <>
      <Text testID="state">{`${ready ? 'ready' : 'loading'} ${layout.last} ${layout.hidden.join(',')}`}</Text>
      <Pressable accessibilityRole="button" onPress={() => setLast('heading')}>
        <Text>go heading</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setHidden('basic-data', true)}>
        <Text>hide basic</Text>
      </Pressable>
    </>
  );
}

describe('usePanelLayout', () => {
  it('loads the stored layout', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: ['heading'], last: 'basic-data' }),
    );
    await render(<Probe storage={storage} />);
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('ready basic-data heading'),
    );
  });

  it('saves the last route and a hidden panel', async () => {
    const storage = createMemorySettingsStorage();
    await render(<Probe storage={storage} />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready setup'));
    await fireEvent.press(screen.getByText('go heading'));
    await fireEvent.press(screen.getByText('hide basic'));
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? 'null')).toEqual({
        hidden: ['basic-data'],
        last: 'heading',
      }),
    );
  });

  it('a choice made before the stored layout loads is not overwritten', async () => {
    let release: (value: string | null) => void = () => undefined;
    const storage: SettingsStorage = {
      getItem: () => new Promise<string | null>((resolve) => (release = resolve)),
      setItem: jest.fn(async () => undefined),
    };
    await render(<Probe storage={storage} />);
    await fireEvent.press(screen.getByText('go heading'));
    release(JSON.stringify({ hidden: [], last: 'basic-data' }));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready heading'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/application/panel-layout.test.ts tests/ui/use-panel-layout.test.tsx`
Expected: FAIL ("Cannot find module '@/application/panel-layout'").

- [ ] **Step 3: Implement**

`src/application/panel-layout.ts`:

```ts
import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';

export const PANEL_LAYOUT_STORAGE_KEY = 'avionix.panels';

/** The one route that is not a panel. Reserved: no panel may use this id. */
export const SETUP_ROUTE = 'setup';

/**
 * Hidden ids rather than visible ones, so a panel added in a later release appears by default
 * instead of silently staying off (F-04 R13, spec decision 8).
 */
export interface PanelLayout {
  hidden: readonly string[];
  last: string;
}

export const DEFAULT_PANEL_LAYOUT: PanelLayout = { hidden: [], last: SETUP_ROUTE };

const storedSchema = z.object({ hidden: z.array(z.string()), last: z.string() });

export function normaliseLayout(layout: PanelLayout, knownIds: readonly string[]): PanelLayout {
  const hidden = [...new Set(layout.hidden.filter((id) => knownIds.includes(id)))];
  const last =
    layout.last === SETUP_ROUTE || knownIds.includes(layout.last) ? layout.last : SETUP_ROUTE;
  // A layout that hides everything (only reachable by editing storage) would leave a switcher
  // with Setup alone; show everything again instead.
  return { hidden: hidden.length >= knownIds.length ? [] : hidden, last };
}

export function visiblePanelIds(layout: PanelLayout, knownIds: readonly string[]): string[] {
  return knownIds.filter((id) => !layout.hidden.includes(id));
}

/** The route to show: Setup or an available panel as stored, else the first available panel. */
export function resolveRoute(last: string, availableIds: readonly string[]): string {
  if (last === SETUP_ROUTE || availableIds.includes(last)) {
    return last;
  }
  return availableIds[0] ?? SETUP_ROUTE;
}

export function canHidePanel(
  layout: PanelLayout,
  knownIds: readonly string[],
  id: string,
): boolean {
  return (
    knownIds.includes(id) &&
    !layout.hidden.includes(id) &&
    visiblePanelIds(layout, knownIds).length > 1
  );
}

export function setPanelHidden(
  layout: PanelLayout,
  knownIds: readonly string[],
  id: string,
  hidden: boolean,
): PanelLayout {
  if (hidden) {
    return canHidePanel(layout, knownIds, id)
      ? { ...layout, hidden: [...layout.hidden, id] }
      : layout;
  }
  return layout.hidden.includes(id)
    ? { ...layout, hidden: layout.hidden.filter((hiddenId) => hiddenId !== id) }
    : layout;
}

export async function loadPanelLayout(
  storage: SettingsStorage,
  knownIds: readonly string[],
): Promise<PanelLayout> {
  try {
    const raw = await storage.getItem(PANEL_LAYOUT_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_PANEL_LAYOUT;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? normaliseLayout(parsed.data, knownIds) : DEFAULT_PANEL_LAYOUT;
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

export async function savePanelLayout(
  storage: SettingsStorage,
  layout: PanelLayout,
): Promise<void> {
  try {
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: layout.hidden, last: layout.last }),
    );
  } catch {
    // Best effort, like the theme preference: a failed save must never break the UI.
  }
}
```

If `normaliseLayout({ hidden: ['gone', 'heading', 'heading'], ... })` makes the "drops ids" test
see `hidden: []` (because `KNOWN` has two ids and one is hidden, it must not), check the
`hidden.length >= knownIds.length` comparison: it only clears when *every* known id is hidden.

`src/hooks/usePanelLayout.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_PANEL_LAYOUT,
  type PanelLayout,
  loadPanelLayout,
  savePanelLayout,
  setPanelHidden,
} from '@/application/panel-layout';
import type { SettingsStorage } from '@/application/settings-store';

/**
 * The persisted panel layout (F-04 R13). `knownIds` must be a stable reference (a module-level
 * array), or the load re-runs on every render. A change made before the stored layout arrives
 * wins over it, the same rule as the theme preference.
 */
export function usePanelLayout(storage: SettingsStorage, knownIds: readonly string[]) {
  const [layout, setLayout] = useState<PanelLayout>(DEFAULT_PANEL_LAYOUT);
  const [ready, setReady] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadPanelLayout(storage, knownIds).then((stored) => {
      if (cancelled) {
        return;
      }
      if (!touched.current) {
        setLayout(stored);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, knownIds]);

  const update = useCallback(
    (change: (prev: PanelLayout) => PanelLayout) => {
      touched.current = true;
      setLayout((prev) => {
        const next = change(prev);
        if (next !== prev) {
          // Saving from the updater keeps the write in step with the state it came from; a
          // double invocation under StrictMode writes the same value twice, which is harmless.
          void savePanelLayout(storage, next);
        }
        return next;
      });
    },
    [storage],
  );

  const setLast = useCallback(
    (route: string) => update((prev) => (prev.last === route ? prev : { ...prev, last: route })),
    [update],
  );
  const setHidden = useCallback(
    (id: string, hidden: boolean) => update((prev) => setPanelHidden(prev, knownIds, id, hidden)),
    [update, knownIds],
  );

  return { layout, ready, setLast, setHidden };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/application/panel-layout.test.ts tests/ui/use-panel-layout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

```bash
git add src/application/panel-layout.ts src/hooks/usePanelLayout.ts tests/unit/application/panel-layout.test.ts tests/ui/use-panel-layout.test.tsx
git commit -m "feat(panels): persist which panels are shown and the last route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Keep the screen awake

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install expo-keep-awake`)
- Create: `src/platform/keep-awake.ts`, `src/hooks/useScreenKeepAwake.ts`, `src/hooks/useDeviceLayout.ts`
- Test: `tests/ui/keep-awake.test.tsx`

**Interfaces:**
- Consumes: `expo-keep-awake` (`activateKeepAwakeAsync(tag)`, `deactivateKeepAwake(tag)`, both returning promises); `deviceLayout` (Task 1).
- Produces: `KEEP_AWAKE_TAG = 'avionix-panel'`; `holdScreenAwake(): Promise<void>` and `releaseScreenAwake(): Promise<void>`, which never reject; `useScreenKeepAwake(hold: boolean): void`; `useDeviceLayout(): DeviceLayout`.

- [ ] **Step 1: Add the dependency**

Run: `npx expo install expo-keep-awake`
Expected: `package.json` gains `"expo-keep-awake": "~57.0.2"` (it already ships inside `expo`, so
Expo Go has it; this only makes the import explicit).

- [ ] **Step 2: Write the failing tests**

`tests/ui/keep-awake.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import React from 'react';

import { useScreenKeepAwake } from '@/hooks/useScreenKeepAwake';
import { KEEP_AWAKE_TAG, holdScreenAwake, releaseScreenAwake } from '@/platform/keep-awake';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));

const activate = activateKeepAwakeAsync as jest.MockedFunction<typeof activateKeepAwakeAsync>;
const deactivate = deactivateKeepAwake as jest.MockedFunction<typeof deactivateKeepAwake>;

function Probe({ hold }: { hold: boolean }) {
  useScreenKeepAwake(hold);
  return null;
}

beforeEach(() => {
  activate.mockClear();
  deactivate.mockClear();
});

describe('keep-awake wrapper', () => {
  it('holds and releases under the Avionix tag', async () => {
    await holdScreenAwake();
    await releaseScreenAwake();
    expect(KEEP_AWAKE_TAG).toBe('avionix-panel');
    expect(activate).toHaveBeenCalledWith('avionix-panel');
    expect(deactivate).toHaveBeenCalledWith('avionix-panel');
  });

  it('never rejects when the platform refuses, as a browser without a wake lock does', async () => {
    const refusal = Object.assign(new Error('Wake lock refused'), { name: 'NotAllowedError' });
    activate.mockRejectedValueOnce(refusal);
    deactivate.mockRejectedValueOnce(refusal);
    await expect(holdScreenAwake()).resolves.toBeUndefined();
    await expect(releaseScreenAwake()).resolves.toBeUndefined();
  });

  it('never rejects when the platform throws synchronously', async () => {
    activate.mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    await expect(holdScreenAwake()).resolves.toBeUndefined();
  });
});

describe('useScreenKeepAwake', () => {
  it('holds while asked, releases when no longer asked and on unmount', async () => {
    const { rerender, unmount } = await render(<Probe hold />);
    expect(activate).toHaveBeenCalledTimes(1);
    await rerender(<Probe hold={false} />);
    expect(deactivate).toHaveBeenCalledTimes(1);
    await rerender(<Probe hold />);
    expect(activate).toHaveBeenCalledTimes(2);
    await unmount();
    expect(deactivate).toHaveBeenCalledTimes(2);
  });

  it('does nothing while not asked', async () => {
    await render(<Probe hold={false} />);
    expect(activate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest tests/ui/keep-awake.test.tsx`
Expected: FAIL ("Cannot find module '@/hooks/useScreenKeepAwake'").

- [ ] **Step 4: Implement**

`src/platform/keep-awake.ts`:

```ts
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { createLogger } from '@/infrastructure/logging/logger';

export const KEEP_AWAKE_TAG = 'avionix-panel';

const logger = createLogger('ui');

/**
 * F-04 R5. On the web this is the Screen Wake Lock API, which a browser may refuse (no support,
 * page hidden, no user gesture yet); a refusal is a debug line, never an error on screen.
 */
export async function holdScreenAwake(): Promise<void> {
  try {
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  } catch (error) {
    logger.debug('keep-awake unavailable', { message: String(error) });
  }
}

export async function releaseScreenAwake(): Promise<void> {
  try {
    await deactivateKeepAwake(KEEP_AWAKE_TAG);
  } catch (error) {
    logger.debug('keep-awake release failed', { message: String(error) });
  }
}
```

`src/hooks/useScreenKeepAwake.ts`:

```ts
import { useEffect } from 'react';

import { holdScreenAwake, releaseScreenAwake } from '@/platform/keep-awake';

/** Holds the screen awake while `hold` is true; releasing on false and on unmount. */
export function useScreenKeepAwake(hold: boolean): void {
  useEffect(() => {
    if (!hold) {
      return;
    }
    void holdScreenAwake();
    return () => {
      void releaseScreenAwake();
    };
  }, [hold]);
}
```

`src/hooks/useDeviceLayout.ts`:

```ts
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { type DeviceLayout, deviceLayout } from '@/domain/panels/device-layout';

/** The window, classified (F-04 R1). On the web this is the browser window. */
export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => deviceLayout(width, height), [width, height]);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/ui/keep-awake.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

```bash
git add package.json package-lock.json src/platform/keep-awake.ts src/hooks/useScreenKeepAwake.ts src/hooks/useDeviceLayout.ts tests/ui/keep-awake.test.tsx
git commit -m "feat(panels): keep the screen awake through a wrapper that never throws

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Panel primitives

**Files:**
- Create: `src/features/panels/primitives/PanelContext.tsx`, `PanelFrame.tsx`, `Readout.tsx`, `ControlButton.tsx`, `ValueEntry.tsx` (all under `src/features/panels/primitives/`)
- Test: `tests/ui/panel-primitives.test.tsx`

**Interfaces:**
- Consumes: `panelLinkStatus` (Task 1), `controlAvailability` (Task 1), `featureOf` (`@/application/compatibility`), `OperationOutcome` (Task 3), `FailureNotice`, `theme.touch` (Task 2).
- Produces:
  - `interface PanelActions { write(featureId: string, name: string, value: DataRefValue): Promise<void>; activate(featureId: string, name: string, durationSec?: number): Promise<void> }`
  - `interface PanelContextValue extends PanelActions { snapshot: SessionSnapshot; link: PanelLinkStatus; now: number }`; `usePanel(): PanelContextValue` (throws outside a `PanelFrame`).
  - `PanelFrame(props: { title: string; snapshot: SessionSnapshot; now: number; actions: PanelActions; children: React.ReactNode })`
  - `Readout(props: { label: string; name: string; unit?: string })`; `formatReading(value: DataRefValue): string`.
  - `ControlButton(props: { label: string; featureId: string; target: string; onPress: () => void; confirm?: boolean; invalid?: boolean; accessibilityLabel?: string })`; `CONFIRM_WINDOW_MS = 3000`; `REFUSAL_LABEL: Record<OperationRefusal, string>`.
  - `ValueEntry(props: { label: string; featureId: string; target: string; min: number; max: number; unit?: string; onSubmit: (value: number) => void })`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/panel-primitives.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import {
  type OperationOutcome,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  FEATURE_HEADING_CONTROL,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { explainFailure } from '@/domain/health/failure-explanation';
import { ControlButton, REFUSAL_LABEL } from '@/features/panels/primitives/ControlButton';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { Readout } from '@/features/panels/primitives/Readout';
import { ValueEntry } from '@/features/panels/primitives/ValueEntry';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 100_000;
const HEADING = GENERIC_DATAREFS.headingBug;
const base = initialSnapshot(GENERIC_PROFILE, 5);

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    compatibility: {
      ...base.compatibility,
      features: base.compatibility.features.map((feature) => ({
        ...feature,
        status: 'available' as const,
      })),
    },
    ...overrides,
  };
}

const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => undefined),
};

async function renderInFrame(snapshot: SessionSnapshot, children: React.ReactNode) {
  const tree = (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelFrame title="Test panel" snapshot={snapshot} now={NOW} actions={actions}>
        {children}
      </PanelFrame>
    </ThemeProvider>
  );
  const result = await render(tree);
  return { ...result, tree };
}

function failed(outcome: Partial<OperationOutcome>): OperationOutcome {
  return { status: 'failed', failure: null, refusal: null, at: NOW, ...outcome };
}

describe('PanelFrame', () => {
  it('shows no notice while live', async () => {
    await renderInFrame(live(), null);
    expect(screen.getByText('Test panel')).toBeTruthy();
    expect(screen.queryByTestId('panel-notice')).toBeNull();
  });

  it('shows exactly one notice for the whole panel when not connected', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      { ...base, state: 'disconnected' },
      <>
        <ControlButton label="A" featureId={FEATURE_HEADING_CONTROL} target="a" onPress={onPress} />
        <ControlButton label="B" featureId={FEATURE_HEADING_CONTROL} target="b" onPress={onPress} />
      </>,
    );
    expect(screen.getAllByTestId('panel-notice')).toHaveLength(1);
    expect(screen.getByText('Not connected. Showing the last known values.')).toBeTruthy();
  });
});

describe('Readout', () => {
  it('shows the simulator value', async () => {
    await renderInFrame(
      live({ telemetry: { [HEADING]: { value: 270, receivedAt: NOW } } }),
      <Readout label="Heading bug" name={HEADING} unit="°" />,
    );
    expect(screen.getByText('270°')).toBeTruthy();
    expect(screen.queryByText('not live')).toBeNull();
  });

  it('shows a dash when there is no value yet', async () => {
    await renderInFrame(live(), <Readout label="Heading bug" name={HEADING} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('marks the last known value not live after the link drops', async () => {
    await renderInFrame(
      { ...base, state: 'disconnected', telemetry: { [HEADING]: { value: 270, receivedAt: 1 } } },
      <Readout label="Heading bug" name={HEADING} />,
    );
    expect(screen.getByText('270')).toBeTruthy();
    expect(screen.getByText('not live')).toBeTruthy();
    expect(screen.getByLabelText('Heading bug: 270, not live')).toBeTruthy();
  });

  it('says the value is not on this aircraft when its DataRef is missing', async () => {
    const snapshot = live();
    await renderInFrame(
      {
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          bindings: { [HEADING]: { name: HEADING, kind: 'dataref', status: 'missing' } },
        },
      },
      <Readout label="Heading bug" name={HEADING} />,
    );
    expect(screen.getByText('not available on this aircraft')).toBeTruthy();
  });

  it('still shows a read-only value', async () => {
    const snapshot = live({ telemetry: { [HEADING]: { value: 90, receivedAt: NOW } } });
    await renderInFrame(
      {
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          bindings: { [HEADING]: { name: HEADING, kind: 'dataref', status: 'readOnly' } },
        },
      },
      <Readout label="Heading bug" name={HEADING} />,
    );
    expect(screen.getByText('90')).toBeTruthy();
  });
});

describe('ControlButton', () => {
  it('acts when live and available', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      live(),
      <ControlButton label="Heading up" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={onPress} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the touch rules', async () => {
    await renderInFrame(
      live(),
      <ControlButton label="Up" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={jest.fn()} />,
    );
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Up' }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });

  it('does nothing when the link is not live', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      { ...base, state: 'reconnecting' },
      <ControlButton label="Heading up" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={onPress} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Heading up' })).toBeDisabled();
  });

  it('is unavailable with the reason when the aircraft lacks the feature', async () => {
    const onPress = jest.fn();
    const snapshot = live();
    await renderInFrame(
      {
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          features: snapshot.compatibility.features.map((feature) =>
            feature.id === FEATURE_HEADING_CONTROL
              ? {
                  ...feature,
                  status: 'unavailable' as const,
                  missing: [
                    { name: HEADING, kind: 'dataref' as const, purpose: 'Heading bug', status: 'missing' as const },
                  ],
                }
              : feature,
          ),
        },
      },
      <ControlButton label="Heading up" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={onPress} />,
    );
    expect(
      screen.getByText('Heading control is not available on this aircraft: Heading bug.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('says an unchecked feature has not been checked yet', async () => {
    await renderInFrame(
      { ...base, state: 'disconnected' },
      <ControlButton label="Heading up" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={jest.fn()} />,
    );
    expect(screen.getByText('Heading control has not been checked yet.')).toBeTruthy();
  });

  it('is disabled while its own operation is pending', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      live({ operations: { t: { status: 'pending', failure: null, refusal: null, at: NOW } } }),
      <ControlButton label="Heading up" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={onPress} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports its own failure as a cause and an action, and nobody else’s', async () => {
    const { cause } = explainFailure('WRITE_FAILED', 'operation');
    await renderInFrame(
      live({
        operations: { mine: failed({ failure: { code: 'WRITE_FAILED', step: 'operation' } }) },
      }),
      <>
        <ControlButton label="Mine" featureId={FEATURE_HEADING_CONTROL} target="mine" onPress={jest.fn()} />
        <ControlButton label="Other" featureId={FEATURE_HEADING_CONTROL} target="other" onPress={jest.fn()} />
      </>,
    );
    expect(screen.getAllByText(cause)).toHaveLength(1);
  });

  it('reports a refusal in plain words', async () => {
    await renderInFrame(
      live({ operations: { t: failed({ refusal: 'notConnected' }) } }),
      <ControlButton label="Heading up" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={jest.fn()} />,
    );
    expect(screen.getByText(REFUSAL_LABEL.notConnected)).toBeTruthy();
  });

  describe('confirmation', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('arms on the first press, acts on the second', async () => {
      const onPress = jest.fn();
      await renderInFrame(
        live(),
        <ControlButton label="Disconnect" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={onPress} confirm />,
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      expect(onPress).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByRole('button', { name: 'Tap again: Disconnect' }));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    });

    it('disarms after three seconds', async () => {
      const onPress = jest.fn();
      await renderInFrame(
        live(),
        <ControlButton label="Disconnect" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={onPress} confirm />,
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('stays armed across a re-render, as on rotation', async () => {
      const onPress = jest.fn();
      const button = (
        <ControlButton label="Disconnect" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={onPress} confirm />
      );
      const { rerender, tree } = await renderInFrame(live(), button);
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      await rerender(tree);
      expect(screen.getByRole('button', { name: 'Tap again: Disconnect' })).toBeTruthy();
    });

    it('disarms when it becomes disabled', async () => {
      const onPress = jest.fn();
      const make = (snapshot: SessionSnapshot) => (
        <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
          <PanelFrame title="Test panel" snapshot={snapshot} now={NOW} actions={actions}>
            <ControlButton label="Disconnect" featureId={FEATURE_HEADING_CONTROL} target="t" onPress={onPress} confirm />
          </PanelFrame>
        </ThemeProvider>
      );
      const { rerender } = await render(make(live()));
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      await rerender(make({ ...base, state: 'reconnecting' }));
      await rerender(make(live()));
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    });
  });
});

describe('ValueEntry', () => {
  function entry(onSubmit: (value: number) => void) {
    return (
      <ValueEntry
        label="New heading"
        featureId={FEATURE_HEADING_CONTROL}
        target={HEADING}
        min={0}
        max={360}
        onSubmit={onSubmit}
      />
    );
  }

  it('submits a number in range', async () => {
    const onSubmit = jest.fn();
    await renderInFrame(live(), entry(onSubmit));
    await fireEvent.changeText(screen.getByLabelText('New heading'), '95');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(onSubmit).toHaveBeenCalledWith(95);
  });

  it('refuses a number out of range, in the pilot’s words', async () => {
    const onSubmit = jest.fn();
    await renderInFrame(live(), entry(onSubmit));
    await fireEvent.changeText(screen.getByLabelText('New heading'), '400');
    expect(screen.getByText('Enter a number from 0 to 360.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the draft after a failed write so the pilot can retry', async () => {
    const onSubmit = jest.fn();
    const { rerender } = await renderInFrame(live(), entry(onSubmit));
    await fireEvent.changeText(screen.getByLabelText('New heading'), '95');
    await rerender(
      <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
        <PanelFrame
          title="Test panel"
          snapshot={live({
            operations: {
              [HEADING]: failed({ failure: { code: 'WRITE_FAILED', step: 'operation' } }),
            },
          })}
          now={NOW}
          actions={actions}
        >
          {entry(onSubmit)}
        </PanelFrame>
      </ThemeProvider>,
    );
    expect(screen.getByDisplayValue('95')).toBeTruthy();
  });
});
```

Prettier will reflow the long JSX lines; run `npx prettier --write tests/ui/panel-primitives.test.tsx`
after writing it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/ui/panel-primitives.test.tsx`
Expected: FAIL ("Cannot find module '@/features/panels/primitives/ControlButton'").

- [ ] **Step 3: Implement the primitives**

`src/features/panels/primitives/PanelContext.tsx`:

```tsx
import { createContext, useContext } from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { PanelLinkStatus } from '@/domain/panels/panel-link';
import type { DataRefValue } from '@/domain/simulator/types';

export interface PanelActions {
  write: (featureId: string, name: string, value: DataRefValue) => Promise<void>;
  activate: (featureId: string, name: string, durationSec?: number) => Promise<void>;
}

/** What every primitive inside a panel reads, computed once per render by PanelFrame. */
export interface PanelContextValue extends PanelActions {
  snapshot: SessionSnapshot;
  link: PanelLinkStatus;
  now: number;
}

export const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanel(): PanelContextValue {
  const value = useContext(PanelContext);
  if (value === null) {
    throw new Error('usePanel must be used inside PanelFrame');
  }
  return value;
}
```

`src/features/panels/primitives/PanelFrame.tsx`:

```tsx
import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { panelLinkStatus } from '@/domain/panels/panel-link';
import {
  type PanelActions,
  PanelContext,
  type PanelContextValue,
} from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  scroll: { flex: 1 },
  content: { padding: theme.spacing.lg, gap: theme.touch.spacing },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
  },
  notice: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});

/**
 * The chrome every panel sits in. It computes the link status once and publishes it with the
 * snapshot and the actions, so every Readout and ControlButton agrees, and it renders R7's single
 * explanation at the top — never one per control.
 */
export function PanelFrame({
  title,
  snapshot,
  now,
  actions,
  children,
}: {
  title: string;
  snapshot: SessionSnapshot;
  now: number;
  actions: PanelActions;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
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
  return (
    <PanelContext.Provider value={value}>
      <ScrollView
        testID="panel-frame"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {notice === null ? null : (
          <View testID="panel-notice" style={styles.notice}>
            <BodyText>{notice}</BodyText>
          </View>
        )}
        {children}
      </ScrollView>
    </PanelContext.Provider>
  );
}
```

`src/features/panels/primitives/Readout.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import type { DataRefValue } from '@/domain/simulator/types';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

export function formatReading(value: DataRefValue): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`;
  }
  return value;
}

const makeStyles = (theme: Theme) => ({
  row: {
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
});

/**
 * One value, only ever from the simulator (R10). Not current → muted and "not live" (R7); a
 * DataRef the aircraft lacks → said in words rather than a dash that reads as "not yet" (F-03).
 */
export function Readout({ label, name, unit = '' }: { label: string; name: string; unit?: string }) {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  if (snapshot.compatibility.bindings[name]?.status === 'missing') {
    return (
      <View style={styles.row} accessible accessibilityLabel={`${label}: not available on this aircraft`}>
        <BodyText>{label}</BodyText>
        <BodyText muted>not available on this aircraft</BodyText>
      </View>
    );
  }
  const sample = snapshot.telemetry[name];
  const text = sample === undefined ? '—' : `${formatReading(sample.value)}${unit}`;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${text}${link.valuesCurrent ? '' : ', not live'}`}
    >
      <BodyText>{label}</BodyText>
      <Text style={[styles.value, link.valuesCurrent ? null : styles.stale]}>{text}</Text>
      {link.valuesCurrent ? null : <BodyText muted>not live</BodyText>}
    </View>
  );
}
```

`src/features/panels/primitives/ControlButton.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import type { OperationOutcome, OperationRefusal } from '@/application/session-snapshot';
import { controlAvailability } from '@/domain/panels/control-availability';
import { FailureNotice } from '@/features/health/FailureNotice';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** A disruptive control's second press must land within this window (spec decision 10). */
export const CONFIRM_WINDOW_MS = 3000;

export const REFUSAL_LABEL: Record<OperationRefusal, string> = {
  notConnected: 'Not sent: Avionix is not connected to X-Plane.',
  unavailable: 'Not sent: this control is not available on this aircraft.',
};

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs, marginVertical: theme.touch.spacing / 2 },
  button: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  disabled: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  armed: { borderColor: theme.colors.danger },
  label: {
    color: theme.colors.onPrimary,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  labelDisabled: { color: theme.colors.textMuted },
});

interface Props {
  label: string;
  /** The profile feature this control acts for; its availability gates the control (R8). */
  featureId: string;
  /** The binding name it writes or activates; its outcome is reported here (R9). */
  target: string;
  onPress: () => void;
  /** Two presses within CONFIRM_WINDOW_MS for disruptive controls. */
  confirm?: boolean;
  /** The panel's own input is not valid yet (e.g. an empty entry). */
  invalid?: boolean;
  accessibilityLabel?: string;
}

/** The only way a panel renders a pressable control: it applies every framework rule at once. */
export function ControlButton(props: Props) {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const availability = controlAvailability(featureOf(snapshot.compatibility, props.featureId));
  const outcome = snapshot.operations[props.target];
  const pending = outcome?.status === 'pending';
  const enabled =
    link.controlsEnabled && availability.usable && !pending && props.invalid !== true;

  const [armed, setArmed] = useState(false);
  if (armed && !enabled) {
    // Adjusting state while rendering is React's documented way to reset on a prop change; a
    // control that goes inert must not come back armed.
    setArmed(false);
  }
  useEffect(() => {
    if (!armed) {
      return;
    }
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const shown = armed ? `Tap again: ${props.label}` : props.label;
  const accessibleName = armed ? shown : (props.accessibilityLabel ?? props.label);
  const onPress = () => {
    if (props.confirm === true && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    props.onPress();
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleName}
        accessibilityState={{ disabled: !enabled, busy: pending }}
        disabled={!enabled}
        onPress={onPress}
        style={[styles.button, enabled ? null : styles.disabled, armed ? styles.armed : null]}
      >
        <Text style={[styles.label, enabled ? null : styles.labelDisabled]}>{shown}</Text>
      </Pressable>
      {availability.reason === null ? null : <BodyText muted>{availability.reason}</BodyText>}
      <Outcome outcome={outcome} />
    </View>
  );
}

/** Failures reach the screen only through FailureNotice (R11); refusals in fixed words. */
function Outcome({ outcome }: { outcome: OperationOutcome | undefined }) {
  if (outcome === undefined || outcome.status !== 'failed') {
    return null;
  }
  if (outcome.failure !== null) {
    return <FailureNotice code={outcome.failure.code} step={outcome.failure.step} />;
  }
  return outcome.refusal === null ? null : (
    <BodyText tone="danger">{REFUSAL_LABEL[outcome.refusal]}</BodyText>
  );
}
```

`src/features/panels/primitives/ValueEntry.tsx`:

```tsx
import React, { useState } from 'react';
import { View } from 'react-native';

import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { BodyText, ThemedTextInput } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: theme.touch.spacing },
  input: {
    flex: 1,
    minHeight: theme.touch.minTarget,
    fontSize: theme.typography.titleSize,
    marginBottom: 0,
  },
});

interface Props {
  label: string;
  featureId: string;
  target: string;
  min: number;
  max: number;
  unit?: string;
  onSubmit: (value: number) => void;
}

/**
 * A number the pilot types and sends with Set. Validation is in the pilot's words and happens
 * here, before anything is sent; the draft survives a failed write so it can be retried, and the
 * value shown elsewhere stays the simulator's (R10).
 */
export function ValueEntry(props: Props) {
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState('');
  const parsed = Number(draft);
  const filled = draft.trim() !== '';
  const valid = filled && Number.isFinite(parsed) && parsed >= props.min && parsed <= props.max;
  return (
    <View>
      <BodyText>{props.unit === undefined ? props.label : `${props.label} (${props.unit})`}</BodyText>
      <View style={styles.row}>
        <ThemedTextInput
          accessibilityLabel={props.label}
          value={draft}
          onChangeText={setDraft}
          keyboardType="numeric"
          style={styles.input}
        />
        <ControlButton
          label="Set"
          accessibilityLabel={`Set ${props.label}`}
          featureId={props.featureId}
          target={props.target}
          invalid={!valid}
          onPress={() => props.onSubmit(parsed)}
        />
      </View>
      {filled && !valid ? (
        <BodyText tone="danger">{`Enter a number from ${props.min} to ${props.max}.`}</BodyText>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/ui/panel-primitives.test.tsx`
Expected: PASS. If `toBeDisabled()` does not see the Pressable as disabled, check that
`accessibilityState.disabled` is set (it is what the matcher reads).

- [ ] **Step 5: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

```bash
git add src/features/panels/primitives tests/ui/panel-primitives.test.tsx
git commit -m "feat(panels): add the frame, readout, control button and value entry primitives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The two interim panels and their registry

**Files:**
- Create: `src/features/panels/basic-data/BasicDataPanel.tsx`, `src/features/panels/heading/HeadingPanel.tsx`, `src/features/panels/registry.ts`
- Modify: `tests/ui/error-text-guard.test.tsx`
- Test: `tests/ui/panels.test.tsx`

**Interfaces:**
- Consumes: Task 7 primitives; `GENERIC_DATAREFS`, `GENERIC_COMMANDS`, `FEATURE_FLIGHT_TELEMETRY`, `FEATURE_HEADING_CONTROL`, `GENERIC_PROFILE`; `EVERYWHERE`; `SETUP_ROUTE` (Task 5).
- Produces:
  - `BASIC_DATA_PANEL: PanelDescriptor` (`id: 'basic-data'`, `title: 'Basic data'`, features `[FEATURE_FLIGHT_TELEMETRY, FEATURE_HEADING_CONTROL]`, `EVERYWHERE`) and `BasicDataPanel()`.
  - `HEADING_PANEL: PanelDescriptor` (`id: 'heading'`, `title: 'Heading'`, features `[FEATURE_HEADING_CONTROL]`, `EVERYWHERE`) and `HeadingPanel()`.
  - `interface RegisteredPanel { descriptor: PanelDescriptor; Component: React.ComponentType }`; `PANELS: readonly RegisteredPanel[]` (basic-data, then heading); `PANEL_IDS: readonly string[]`; `findPanel(panels: readonly RegisteredPanel[], id: string): RegisteredPanel | null`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/panels.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { SETUP_ROUTE } from '@/application/panel-layout';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { BasicDataPanel } from '@/features/panels/basic-data/BasicDataPanel';
import { HeadingPanel } from '@/features/panels/heading/HeadingPanel';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { PANELS, PANEL_IDS, findPanel } from '@/features/panels/registry';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 100_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    compatibility: {
      ...base.compatibility,
      features: base.compatibility.features.map((feature) => ({
        ...feature,
        status: 'available' as const,
      })),
    },
    ...overrides,
  };
}

function makeActions(): PanelActions & { write: jest.Mock; activate: jest.Mock } {
  return { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };
}

async function renderPanel(
  Component: React.ComponentType,
  snapshot: SessionSnapshot,
  actions: PanelActions = makeActions(),
) {
  return render(
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelFrame title="Panel" snapshot={snapshot} now={NOW} actions={actions}>
        <Component />
      </PanelFrame>
    </ThemeProvider>,
  );
}

describe('panel registry', () => {
  it('lists each panel once, in switcher order, never under the reserved Setup id', () => {
    expect(PANEL_IDS).toEqual(['basic-data', 'heading']);
    expect(new Set(PANEL_IDS).size).toBe(PANEL_IDS.length);
    expect(PANEL_IDS).not.toContain(SETUP_ROUTE);
  });

  it('declares only features the generic profile has', () => {
    const known = new Set(GENERIC_PROFILE.features.map((feature) => feature.id));
    for (const { descriptor } of PANELS) {
      for (const feature of descriptor.features) {
        expect(known.has(feature)).toBe(true);
      }
    }
  });

  it('finds a panel by id', () => {
    expect(findPanel(PANELS, 'heading')?.descriptor.title).toBe('Heading');
    expect(findPanel(PANELS, 'nope')).toBeNull();
  });
});

describe('Basic data panel', () => {
  it('shows airspeed, heading bug and sim time from the simulator', async () => {
    await renderPanel(
      BasicDataPanel,
      live({
        telemetry: {
          [GENERIC_DATAREFS.airspeed]: { value: 124.3, receivedAt: NOW },
          [GENERIC_DATAREFS.headingBug]: { value: 270, receivedAt: NOW },
          [GENERIC_DATAREFS.heartbeat]: { value: 812, receivedAt: NOW },
        },
      }),
    );
    expect(screen.getByLabelText('Indicated airspeed: 124.3 kt')).toBeTruthy();
    expect(screen.getByLabelText('Heading bug: 270°')).toBeTruthy();
    expect(screen.getByLabelText('Sim running time: 812 s')).toBeTruthy();
  });

  it('says airspeed is not on this aircraft when its DataRef is missing', async () => {
    const snapshot = live();
    await renderPanel(BasicDataPanel, {
      ...snapshot,
      compatibility: {
        ...snapshot.compatibility,
        bindings: {
          [GENERIC_DATAREFS.airspeed]: {
            name: GENERIC_DATAREFS.airspeed,
            kind: 'dataref',
            status: 'missing',
          },
        },
      },
    });
    expect(screen.getByLabelText('Indicated airspeed: not available on this aircraft')).toBeTruthy();
  });
});

describe('Heading panel', () => {
  it('writes the heading bug through the heading feature', async () => {
    const actions = makeActions();
    await renderPanel(HeadingPanel, live(), actions);
    await fireEvent.changeText(screen.getByLabelText('New heading'), '95');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(actions.write).toHaveBeenCalledWith(
      FEATURE_HEADING_CONTROL,
      GENERIC_DATAREFS.headingBug,
      95,
    );
  });

  it('refuses a heading outside 0 to 360 before anything is sent', async () => {
    const actions = makeActions();
    await renderPanel(HeadingPanel, live(), actions);
    await fireEvent.changeText(screen.getByLabelText('New heading'), '400');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(actions.write).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a number from 0 to 360.')).toBeTruthy();
  });

  it('activates heading up', async () => {
    const actions = makeActions();
    await renderPanel(HeadingPanel, live(), actions);
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(actions.activate).toHaveBeenCalledWith(
      FEATURE_HEADING_CONTROL,
      GENERIC_COMMANDS.headingUp,
    );
  });

  it('shows the simulator’s heading, never the one it just wrote', async () => {
    const actions = makeActions();
    await renderPanel(
      HeadingPanel,
      live({
        telemetry: { [GENERIC_DATAREFS.headingBug]: { value: 90, receivedAt: NOW } },
        operations: {
          [GENERIC_DATAREFS.headingBug]: { status: 'ok', failure: null, refusal: null, at: NOW },
        },
      }),
      actions,
    );
    await fireEvent.changeText(screen.getByLabelText('New heading'), '95');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(screen.getByLabelText('Heading bug: 90°')).toBeTruthy();
    expect(screen.queryByLabelText('Heading bug: 95°')).toBeNull();
  });

  it('says heading control has not been checked yet before the first connect', async () => {
    await renderPanel(HeadingPanel, base);
    expect(screen.getAllByText('Heading control has not been checked yet.').length).toBeGreaterThan(0);
  });
});
```

In `tests/ui/error-text-guard.test.tsx`, import `PANELS` from `@/features/panels/registry` and
`PanelFrame` from `@/features/panels/primitives/PanelFrame`, add the helper

```tsx
/** Every binding name a panel's features declare, each with a failed outcome for `code`. */
function failedOperationsFor(code: AvionixErrorCode): SessionSnapshot['operations'] {
  const operations: Record<string, OperationOutcome> = {};
  for (const feature of GENERIC_PROFILE.features) {
    for (const binding of feature.bindings) {
      operations[binding.name] = failedOutcome(code);
    }
  }
  return operations;
}
```

and render, inside the existing `ThemeProvider` after `CompatibilityScreen`:

```tsx
        {PANELS.map(({ descriptor, Component }) => (
          <PanelFrame
            key={descriptor.id}
            title={descriptor.title}
            snapshot={{ ...snapshotFor(code), operations: failedOperationsFor(code) }}
            now={10_000}
            actions={{ write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) }}
          >
            <Component />
          </PanelFrame>
        ))}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/ui/panels.test.tsx tests/ui/error-text-guard.test.tsx`
Expected: FAIL ("Cannot find module '@/features/panels/registry'").

- [ ] **Step 3: Implement**

`src/features/panels/basic-data/BasicDataPanel.tsx`:

```tsx
import React from 'react';

import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_DATAREFS,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { Readout } from '@/features/panels/primitives/Readout';

/** Interim: the MVP's telemetry, until F-11's flight data strip replaces it. Id retired then. */
export const BASIC_DATA_PANEL: PanelDescriptor = {
  id: 'basic-data',
  title: 'Basic data',
  features: [FEATURE_FLIGHT_TELEMETRY, FEATURE_HEADING_CONTROL],
  supports: EVERYWHERE,
};

export function BasicDataPanel() {
  return (
    <>
      <Readout label="Indicated airspeed" name={GENERIC_DATAREFS.airspeed} unit=" kt" />
      <Readout label="Heading bug" name={GENERIC_DATAREFS.headingBug} unit="°" />
      <Readout label="Sim running time" name={GENERIC_DATAREFS.heartbeat} unit=" s" />
    </>
  );
}
```

`src/features/panels/heading/HeadingPanel.tsx`:

```tsx
import React from 'react';

import {
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { Readout } from '@/features/panels/primitives/Readout';
import { ValueEntry } from '@/features/panels/primitives/ValueEntry';

/** Interim: the MVP's test controls, until F-20's autopilot panel absorbs them. Id retired then. */
export const HEADING_PANEL: PanelDescriptor = {
  id: 'heading',
  title: 'Heading',
  features: [FEATURE_HEADING_CONTROL],
  supports: EVERYWHERE,
};

export function HeadingPanel() {
  const { write, activate } = usePanel();
  return (
    <>
      <Readout label="Heading bug" name={GENERIC_DATAREFS.headingBug} unit="°" />
      <ValueEntry
        label="New heading"
        unit="degrees"
        featureId={FEATURE_HEADING_CONTROL}
        target={GENERIC_DATAREFS.headingBug}
        min={0}
        max={360}
        onSubmit={(value) =>
          void write(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, value)
        }
      />
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target={GENERIC_COMMANDS.headingUp}
        onPress={() => void activate(FEATURE_HEADING_CONTROL, GENERIC_COMMANDS.headingUp)}
      />
    </>
  );
}
```

`src/features/panels/registry.ts`:

```ts
import type React from 'react';

import type { PanelDescriptor } from '@/domain/panels/panel';
import { BASIC_DATA_PANEL, BasicDataPanel } from '@/features/panels/basic-data/BasicDataPanel';
import { HEADING_PANEL, HeadingPanel } from '@/features/panels/heading/HeadingPanel';

export interface RegisteredPanel {
  descriptor: PanelDescriptor;
  Component: React.ComponentType;
}

/** Switcher order. A panel's id is persisted, so it is never reused for a different panel. */
export const PANELS: readonly RegisteredPanel[] = [
  { descriptor: BASIC_DATA_PANEL, Component: BasicDataPanel },
  { descriptor: HEADING_PANEL, Component: HeadingPanel },
];

/** Stable by construction: `usePanelLayout` depends on this reference not changing. */
export const PANEL_IDS: readonly string[] = PANELS.map((panel) => panel.descriptor.id);

export function findPanel(panels: readonly RegisteredPanel[], id: string): RegisteredPanel | null {
  return panels.find((panel) => panel.descriptor.id === id) ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/ui/panels.test.tsx tests/ui/error-text-guard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

```bash
git add src/features/panels tests/ui/panels.test.tsx tests/ui/error-text-guard.test.tsx
git commit -m "feat(panels): add the basic data and heading panels and their registry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: The app shell replaces the MVP screen

**Files:**
- Create: `src/features/shell/AppShell.tsx`, `src/features/shell/PanelSwitcher.tsx`, `src/features/shell/SetupScreen.tsx`, `src/features/shell/PanelChooser.tsx`
- Modify: `src/app/AvionixApp.tsx`, `src/features/health/LinkStatusBar.tsx`, `tests/ui/error-text-guard.test.tsx`
- Delete: `src/features/mvp/MvpScreen.tsx`, `src/features/mvp/TelemetryPanel.tsx`, `src/features/mvp/ControlPanel.tsx`
- Move: `tests/ui/mvp-screen.test.tsx` → `tests/ui/setup-screen.test.tsx`; `tests/web/mvp-screen.web.test.tsx` → `tests/web/app-shell.web.test.tsx`
- Test: `tests/ui/app-shell.test.tsx`, `tests/ui/setup-screen.test.tsx`, `tests/web/app-shell.web.test.tsx`

**Interfaces:**
- Consumes: everything above — `useSimulatorSession` (`write`, `activate`, `setDemand`), `usePanelLayout`, `useDeviceLayout`, `useScreenKeepAwake`, `useAppForeground`, `shouldHoldScreenAwake`, `panelFit`, `resolveRoute`, `canHidePanel`, `SETUP_ROUTE`, `PANELS`, `findPanel`, `PanelFrame`.
- Produces:
  - `AppShell(props: { panels?: readonly RegisteredPanel[] })` — `testID="app-shell"`; `panels` defaults to `PANELS` and exists so tests can supply panels with other `supports`.
  - `PanelSwitcher(props: { items: readonly { id: string; title: string }[]; route: string; orientation: Orientation; onSelect(id: string): void })` — one `accessibilityRole="tab"` item per entry, `testID="switch-<id>"`, the caller appends Setup.
  - `SetupScreen(props: { snapshot: SessionSnapshot; now: number; showDiagnostics: boolean; panels: readonly RegisteredPanel[]; panelIds: readonly string[]; layout: PanelLayout; deviceLayout: DeviceLayout; onSetHidden(id: string, hidden: boolean): void })` — `testID="setup-screen"`; the shell owns the diagnostics toggle.
  - `PanelChooser(props: { panels; panelIds; layout; deviceLayout; onSetHidden })`.

**Behaviour to implement (spec, "App shell and routes"):**
- Route = `resolveRoute(layout.last, shownIds)`, where `shownIds` are the panels that are not hidden and whose `panelFit` is not `'unsupported'`. Pressing a switcher item calls `setLast(id)`.
- Nothing below the status bar renders until the layout has loaded (`ready`), so a restored route never flashes Setup first.
- The status bar: on Setup it toggles diagnostics (today's behaviour); on a panel it opens diagnostics and goes to Setup.
- `setDemand` is called once the layout is ready, and whenever the demanded features change: the active panel's features when it fits, `[]` on Setup or when the panel needs a rotation.
- Keep awake: `useScreenKeepAwake(shouldHoldScreenAwake({ foreground, linkState: snapshot.state, onPanel: route !== SETUP_ROUTE }))`.
- Layout: a body `View` whose direction is `row` in landscape and `column` in portrait; the switcher element is rendered before the content in landscape and after it in portrait, and the content is a child with `key="content"` so React keeps it mounted across rotation (R2). The active panel sits in a child keyed by its id; in the `'rotate'` fit it stays mounted with `display: 'none'` beside a notice.

- [ ] **Step 1: Write the shell tests**

`tests/ui/app-shell.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { ConnectorDiscovery } from '@/application/connector-discovery';
import { PANEL_LAYOUT_STORAGE_KEY } from '@/application/panel-layout';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import type { DeviceLayout } from '@/domain/panels/device-layout';
import { EVERYWHERE } from '@/domain/panels/panel';
import { PANELS, type RegisteredPanel } from '@/features/panels/registry';
import { AppShell } from '@/features/shell/AppShell';
import { silentLogger } from '@/infrastructure/logging/logger';
import { holdScreenAwake, releaseScreenAwake } from '@/platform/keep-awake';
import { ThemeProvider } from '@/theme/theme-context';

import { createFakeServiceBrowser } from '../support/fake-service-browser';

let mockLayout: DeviceLayout = { deviceClass: 'phone', orientation: 'portrait' };
jest.mock('@/hooks/useDeviceLayout', () => ({ useDeviceLayout: () => mockLayout }));
jest.mock('@/platform/keep-awake', () => ({
  KEEP_AWAKE_TAG: 'avionix-panel',
  holdScreenAwake: jest.fn(async () => undefined),
  releaseScreenAwake: jest.fn(async () => undefined),
}));

const NOW = Date.now();
const base = initialSnapshot(GENERIC_PROFILE, 5);

function liveSnapshot(): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    compatibility: {
      ...base.compatibility,
      features: base.compatibility.features.map((feature) => ({
        ...feature,
        status: 'available' as const,
      })),
    },
  };
}

function makeServices(snapshot: Partial<SessionSnapshot> = {}, storage?: SettingsStorage) {
  const store = new Store<SessionSnapshot>({ ...base, ...snapshot });
  const session = {
    store,
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    pair: jest.fn(async () => undefined),
    write: jest.fn(async () => undefined),
    activate: jest.fn(async () => undefined),
    setDemand: jest.fn(),
    recheckCompatibility: jest.fn(async () => undefined),
  };
  const services: AppServices = {
    session,
    discovery: new ConnectorDiscovery({ browser: createFakeServiceBrowser(), logger: silentLogger }),
    settingsStorage: storage ?? createMemorySettingsStorage(),
    healthMonitor: { start: jest.fn(), stop: jest.fn(), refresh: jest.fn() },
  };
  return { services, session, store };
}

function tree(services: AppServices, panels?: readonly RegisteredPanel[]) {
  return (
    <ServicesProvider services={services}>
      <ThemeProvider storage={services.settingsStorage} systemSchemeOverride="light">
        <AppShell panels={panels} />
      </ThemeProvider>
    </ServicesProvider>
  );
}

async function seeded(last: string, hidden: string[] = []): Promise<SettingsStorage> {
  const storage = createMemorySettingsStorage();
  await storage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ hidden, last }));
  return storage;
}

beforeEach(() => {
  mockLayout = { deviceClass: 'phone', orientation: 'portrait' };
  (holdScreenAwake as jest.Mock).mockClear();
  (releaseScreenAwake as jest.Mock).mockClear();
});

describe('AppShell', () => {
  it('opens on Setup the first time, with every panel one touch away', async () => {
    const { services } = makeServices();
    await render(tree(services));
    expect(await screen.findByTestId('setup-screen')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Basic data' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Heading' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Setup' })).toBeSelected();
  });

  it('switches to a panel and remembers it', async () => {
    const storage = createMemorySettingsStorage();
    const { services } = makeServices({}, storage);
    await render(tree(services));
    await fireEvent.press(await screen.findByRole('tab', { name: 'Heading' }));
    expect(screen.getByTestId('panel-heading')).toBeTruthy();
    expect(screen.queryByTestId('setup-screen')).toBeNull();
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? 'null')).toEqual({
        hidden: [],
        last: 'heading',
      }),
    );
  });

  it('restores the last panel on launch', async () => {
    const { services } = makeServices({}, await seeded('basic-data'));
    await render(tree(services));
    expect(await screen.findByTestId('panel-basic-data')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Basic data' })).toBeSelected();
  });

  it('asks the session for exactly what the visible panel reads', async () => {
    const { services, session } = makeServices();
    await render(tree(services));
    await waitFor(() => expect(session.setDemand).toHaveBeenLastCalledWith([]));
    await fireEvent.press(screen.getByRole('tab', { name: 'Basic data' }));
    expect(session.setDemand).toHaveBeenLastCalledWith([
      FEATURE_FLIGHT_TELEMETRY,
      FEATURE_HEADING_CONTROL,
    ]);
    await fireEvent.press(screen.getByRole('tab', { name: 'Heading' }));
    expect(session.setDemand).toHaveBeenLastCalledWith([FEATURE_HEADING_CONTROL]);
  });

  it('opens Setup with diagnostics from the status bar on a panel', async () => {
    const { services } = makeServices({}, await seeded('heading'));
    await render(tree(services));
    await screen.findByTestId('panel-heading');
    await fireEvent.press(screen.getByTestId('link-status-bar'));
    expect(screen.getByTestId('setup-screen')).toBeTruthy();
    expect(screen.getByText('Diagnostics')).toBeTruthy();
  });

  it('removes a hidden panel from the switcher, and keeps at least one', async () => {
    const { services } = makeServices();
    await render(tree(services));
    await fireEvent.press(
      await screen.findByRole('switch', { name: 'Show Basic data in the switcher' }),
    );
    expect(screen.queryByRole('tab', { name: 'Basic data' })).toBeNull();
    const lastOne = screen.getByRole('switch', { name: 'Show Heading in the switcher' });
    expect(lastOne).toBeDisabled();
    expect(screen.getByText('At least one panel stays in the switcher.')).toBeTruthy();
  });

  it('rotation keeps a half-typed entry', async () => {
    const { services } = makeServices(liveSnapshot(), await seeded('heading'));
    const { rerender } = await render(tree(services));
    await fireEvent.changeText(await screen.findByLabelText('New heading'), '12');
    mockLayout = { deviceClass: 'phone', orientation: 'landscape' };
    await rerender(tree(services));
    expect(screen.getByDisplayValue('12')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Heading' })).toBeSelected();
  });

  it('leaves out a panel the device class does not support, and says so in Setup', async () => {
    const tabletOnly: RegisteredPanel = {
      descriptor: {
        id: 'wide',
        title: 'Wide',
        features: [],
        supports: { phone: [], tablet: ['landscape'] },
      },
      Component: () => null,
    };
    const panels = [...PANELS, tabletOnly];
    const { services } = makeServices();
    await render(tree(services, panels));
    await screen.findByTestId('setup-screen');
    expect(screen.queryByRole('tab', { name: 'Wide' })).toBeNull();
    expect(screen.getByText('Tablet only')).toBeTruthy();
  });

  it('asks for a rotation instead of showing a panel in an orientation it does not declare', async () => {
    const landscapeOnly: RegisteredPanel = {
      descriptor: {
        id: 'wide',
        title: 'Wide',
        features: [FEATURE_HEADING_CONTROL],
        supports: { phone: ['landscape'], tablet: EVERYWHERE.tablet },
      },
      Component: () => null,
    };
    const { services, session } = makeServices({}, await seeded('wide'));
    await render(tree(services, [...PANELS, landscapeOnly]));
    expect(
      await screen.findByText('Rotate the device to landscape to use this panel.'),
    ).toBeTruthy();
    expect(session.setDemand).toHaveBeenLastCalledWith([]);
  });

  it('holds the screen awake on a panel while connected, and lets go on Setup', async () => {
    const { services } = makeServices(liveSnapshot(), await seeded('heading'));
    await render(tree(services));
    await screen.findByTestId('panel-heading');
    expect(holdScreenAwake).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('tab', { name: 'Setup' }));
    expect(releaseScreenAwake).toHaveBeenCalled();
  });

  it('lets go of the screen when the link ends', async () => {
    const { services, store } = makeServices(liveSnapshot(), await seeded('heading'));
    await render(tree(services));
    await screen.findByTestId('panel-heading');
    await act(async () => {
      store.setState((prev) => ({ ...prev, state: 'disconnected' }));
    });
    expect(releaseScreenAwake).toHaveBeenCalled();
  });

  it('gives every switcher item and the status bar a full-size touch target', async () => {
    const { services } = makeServices();
    await render(tree(services));
    await screen.findByTestId('setup-screen');
    const targets = [...screen.getAllByRole('tab'), screen.getByTestId('link-status-bar')];
    for (const target of targets) {
      const style = StyleSheet.flatten(target.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });
});
```

- [ ] **Step 2: Move and trim the MVP screen tests**

`git mv tests/ui/mvp-screen.test.tsx tests/ui/setup-screen.test.tsx`, then in it:

1. Replace the `MvpScreen` import with `import { AppShell } from '@/features/shell/AppShell';`
   and render `<AppShell />` in `renderScreen`; after `render(...)` add
   `await screen.findByTestId('setup-screen');` and return the render result.
2. Add below the imports:

```tsx
jest.mock('@/platform/keep-awake', () => ({
  KEEP_AWAKE_TAG: 'avionix-panel',
  holdScreenAwake: jest.fn(async () => undefined),
  releaseScreenAwake: jest.fn(async () => undefined),
}));
```

3. Rename `describe('MvpScreen', ...)` to `describe('SetupScreen', ...)` and
   `describe('MvpScreen pairing mode', ...)` to `describe('SetupScreen pairing mode', ...)`.
4. Delete these tests, whose subjects are now covered by `tests/ui/panels.test.tsx` and
   `tests/ui/panel-primitives.test.tsx`: `'writes the heading and activates the command, showing each outcome'`,
   `'disables the heading controls and says why when the aircraft cannot support them'`,
   `'says a telemetry value is not on this aircraft rather than showing a dash'`,
   `'still shows a telemetry value when its binding is read-only'`,
   `'says heading control has not been checked yet, never a claim it cannot back up'`,
   `'renders a failed operation as a cause and an action, never the raw protocol message'`,
   `'refuses a heading outside 0 to 360 before anything is sent'`. Delete `headingControlAvailable`
   if nothing uses it any more.
5. In `'renders connected status, versions, diagnostics and telemetry from the snapshot'`, rename
   it to `'renders connected status, versions and diagnostics from the snapshot'` and delete the
   `telemetry` fixture and the `'124.3'` / `'270'` expectations.
6. Remove imports that became unused.

`git mv tests/web/mvp-screen.web.test.tsx tests/web/app-shell.web.test.tsx`, then in it: import
`AppShell` in place of `MvpScreen` and render `<AppShell />`; rename the `describe` to
`'AppShell on react-native-web'`; in the first test replace the `mvp-screen` testID check with
`expect(container.querySelector('[data-testid="setup-screen"]')).not.toBeNull();`; add the same
`jest.mock('@/platform/keep-awake', ...)` block as above; and add:

```tsx
  it('switches to a panel as DOM', async () => {
    const s = services();
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <AppShell />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const tab = container.querySelector('[data-testid="switch-heading"]');
    expect(tab).not.toBeNull();
    await act(async () => {
      (tab as HTMLElement).click();
    });
    expect(container.querySelector('[data-testid="panel-heading"]')).not.toBeNull();
    expect(container.textContent ?? '').toContain('Heading up');
  });
```

Each web test's `setTimeout(resolve, 0)` wait is what lets the layout load; keep it before every
assertion.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest tests/ui/app-shell.test.tsx tests/ui/setup-screen.test.tsx`
Expected: FAIL ("Cannot find module '@/features/shell/AppShell'").

- [ ] **Step 4: Implement the switcher and the chooser**

`src/features/shell/PanelSwitcher.tsx`:

```tsx
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Orientation } from '@/domain/panels/panel';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  bottom: { borderTopWidth: 1, borderColor: theme.colors.border },
  rail: { borderRightWidth: 1, borderColor: theme.colors.border, maxWidth: 160 },
  bar: { backgroundColor: theme.colors.surface },
  items: { padding: theme.touch.spacing / 2, gap: theme.touch.spacing },
  item: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  selected: { backgroundColor: theme.colors.primary },
  label: { color: theme.colors.text, fontSize: theme.typography.bodySize },
  labelSelected: { color: theme.colors.onPrimary, fontWeight: 'bold' as const },
});

/**
 * One touch to any panel (the user story): a bottom bar in portrait, a side rail in landscape,
 * scrolling if the pilot keeps more panels than fit.
 */
export function PanelSwitcher({
  items,
  route,
  orientation,
  onSelect,
}: {
  items: readonly { id: string; title: string }[];
  route: string;
  orientation: Orientation;
  onSelect: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const portrait = orientation === 'portrait';
  return (
    <View accessibilityRole="tablist" style={[styles.bar, portrait ? styles.bottom : styles.rail]}>
      <ScrollView
        horizontal={portrait}
        contentContainerStyle={styles.items}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => {
          const selected = item.id === route;
          return (
            <Pressable
              key={item.id}
              testID={`switch-${item.id}`}
              accessibilityRole="tab"
              accessibilityLabel={item.title}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item.id)}
              style={[styles.item, selected ? styles.selected : null]}
            >
              <Text style={[styles.label, selected ? styles.labelSelected : null]}>
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
```

`src/features/shell/PanelChooser.tsx`:

```tsx
import React from 'react';
import { Pressable, View } from 'react-native';

import { type PanelLayout, canHidePanel } from '@/application/panel-layout';
import { type DeviceLayout, panelFit } from '@/domain/panels/device-layout';
import type { RegisteredPanel } from '@/features/panels/registry';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  item: { marginBottom: theme.touch.spacing },
});

/** Which panels the switcher offers (F-04 scope: the pilot chooses which panels are present). */
export function PanelChooser({
  panels,
  panelIds,
  layout,
  deviceLayout,
  onSetHidden,
}: {
  panels: readonly RegisteredPanel[];
  panelIds: readonly string[];
  layout: PanelLayout;
  deviceLayout: DeviceLayout;
  onSetHidden: (id: string, hidden: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Section>
      <SectionTitle>Panels</SectionTitle>
      {panels.map(({ descriptor }) => {
        const hidden = layout.hidden.includes(descriptor.id);
        const lockedOn = !hidden && !canHidePanel(layout, panelIds, descriptor.id);
        const unsupported = panelFit(descriptor, deviceLayout) === 'unsupported';
        return (
          <View key={descriptor.id} style={styles.item}>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={`Show ${descriptor.title} in the switcher`}
              accessibilityState={{ checked: !hidden, disabled: lockedOn }}
              disabled={lockedOn}
              onPress={() => onSetHidden(descriptor.id, !hidden)}
              style={styles.row}
            >
              <BodyText>{descriptor.title}</BodyText>
              <BodyText muted>{hidden ? 'Hidden' : 'Shown'}</BodyText>
            </Pressable>
            {unsupported ? (
              <BodyText muted>
                {deviceLayout.deviceClass === 'phone' ? 'Tablet only' : 'Phone only'}
              </BodyText>
            ) : null}
            {lockedOn ? (
              <BodyText muted>At least one panel stays in the switcher.</BodyText>
            ) : null}
          </View>
        );
      })}
    </Section>
  );
}
```

- [ ] **Step 5: Implement the Setup screen**

`src/features/shell/SetupScreen.tsx` — today's `MvpScreen` body without the status bar, the
telemetry and the controls, plus Display and Panels:

```tsx
import React, { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import type { PanelLayout } from '@/application/panel-layout';
import type { SessionSnapshot } from '@/application/session-snapshot';
import type { DiscoveredConnector } from '@/domain/discovery/discovered-connector';
import type { DeviceLayout } from '@/domain/panels/device-layout';
import { AircraftSummary } from '@/features/aircraft/AircraftSummary';
import { CompatibilityScreen } from '@/features/aircraft/CompatibilityScreen';
import { ConnectionForm } from '@/features/connection/ConnectionForm';
import { DiscoveredConnectors } from '@/features/connection/DiscoveredConnectors';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import type { RegisteredPanel } from '@/features/panels/registry';
import { PanelChooser } from '@/features/shell/PanelChooser';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { isDiscoveryState, useConnectorDiscovery } from '@/hooks/useConnectorDiscovery';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { Section, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  screen: { flex: 1 },
  container: { padding: theme.spacing.lg, paddingTop: theme.spacing.md },
  heading: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    marginBottom: theme.spacing.md,
  },
});

export function SetupScreen(props: {
  snapshot: SessionSnapshot;
  now: number;
  showDiagnostics: boolean;
  panels: readonly RegisteredPanel[];
  panelIds: readonly string[];
  layout: PanelLayout;
  deviceLayout: DeviceLayout;
  onSetHidden: (id: string, hidden: boolean) => void;
}) {
  const { snapshot, now } = props;
  const { connect, disconnect, pair, recheckCompatibility } = useSimulatorSession();
  const settings = useConnectionSettings();
  const discovery = useConnectorDiscovery(snapshot.state);
  const styles = useThemedStyles(makeStyles);
  const [showCompatibility, setShowCompatibility] = useState(false);

  const onToggleCompatibility = useCallback(() => setShowCompatibility((open) => !open), []);
  const onRecheck = useCallback(() => void recheckCompatibility(), [recheckCompatibility]);
  const onConnect = useCallback(() => {
    void settings.persist();
    void connect(settings.host, settings.port);
  }, [connect, settings]);
  const onPair = useCallback(
    (code: string) =>
      pair(code).catch(() => {
        // pair() only rejects with INTERNAL (wrong state or a concurrent call), which the
        // disabled button already prevents; user-visible failures arrive via snapshot.error.
      }),
    [pair],
  );
  const onSelectConnector = useCallback(
    (connector: DiscoveredConnector) => {
      void settings.setConnection(connector.host, connector.port);
      void connect(connector.host, String(connector.port));
    },
    [connect, settings],
  );

  return (
    <ScrollView
      testID="setup-screen"
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Avionix</Text>
      <ConnectionForm
        host={settings.host}
        port={settings.port}
        state={snapshot.state}
        connectorName={snapshot.connector?.name ?? null}
        onHostChange={settings.setHost}
        onPortChange={settings.setPort}
        onConnect={onConnect}
        onDisconnect={disconnect}
        onPair={onPair}
      />
      <DiscoveredConnectors
        snapshot={discovery}
        enabled={isDiscoveryState(snapshot.state)}
        onSelect={onSelectConnector}
      />
      {props.showDiagnostics ? (
        <DiagnosticsScreen
          snapshot={snapshot}
          now={now}
          onRetry={onConnect}
          onDisconnect={disconnect}
        />
      ) : null}
      <AircraftSummary snapshot={snapshot} now={now} onOpenCompatibility={onToggleCompatibility} />
      {showCompatibility ? (
        <CompatibilityScreen snapshot={snapshot} now={now} onRecheck={onRecheck} />
      ) : null}
      <Section>
        <SectionTitle>Display</SectionTitle>
        <ThemeToggle />
      </Section>
      <PanelChooser
        panels={props.panels}
        panelIds={props.panelIds}
        layout={props.layout}
        deviceLayout={props.deviceLayout}
        onSetHidden={props.onSetHidden}
      />
    </ScrollView>
  );
}
```

- [ ] **Step 6: Implement the shell**

`src/features/shell/AppShell.tsx`:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useServices } from '@/app/services-context';
import { SETUP_ROUTE, resolveRoute } from '@/application/panel-layout';
import { panelFit } from '@/domain/panels/device-layout';
import { shouldHoldScreenAwake } from '@/domain/panels/keep-awake-policy';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { PANELS, type RegisteredPanel, findPanel } from '@/features/panels/registry';
import { PanelSwitcher } from '@/features/shell/PanelSwitcher';
import { SetupScreen } from '@/features/shell/SetupScreen';
import { useAppForeground } from '@/hooks/useAppForeground';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { usePanelLayout } from '@/hooks/usePanelLayout';
import { useScreenKeepAwake } from '@/hooks/useScreenKeepAwake';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background },
  statusBarWrap: { paddingHorizontal: theme.spacing.lg, paddingTop: 56 },
  body: { flex: 1 },
  row: { flexDirection: 'row' as const },
  column: { flexDirection: 'column' as const },
  content: { flex: 1 },
  fill: { flex: 1 },
  hidden: { display: 'none' as const },
  notice: { padding: theme.spacing.lg },
});

/**
 * The app's root under the providers (F-04). The link status bar never scrolls away; below it,
 * the active panel or Setup, and the switcher. Rotation only moves the switcher: the content is
 * a keyed child, so the panel, its state and a half-typed entry survive (R2).
 */
export function AppShell({ panels = PANELS }: { panels?: readonly RegisteredPanel[] }) {
  const { snapshot, write, activate, setDemand } = useSimulatorSession();
  const { settingsStorage } = useServices();
  const deviceLayout = useDeviceLayout();
  const panelIds = useMemo(() => panels.map((panel) => panel.descriptor.id), [panels]);
  const { layout, ready, setLast, setHidden } = usePanelLayout(settingsStorage, panelIds);
  const foreground = useAppForeground();
  const styles = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const shown = panels.filter(
    (panel) =>
      !layout.hidden.includes(panel.descriptor.id) &&
      panelFit(panel.descriptor, deviceLayout) !== 'unsupported',
  );
  const route = resolveRoute(
    layout.last,
    shown.map((panel) => panel.descriptor.id),
  );
  const active = route === SETUP_ROUTE ? null : findPanel(panels, route);
  const fit = active === null ? null : panelFit(active.descriptor, deviceLayout);
  // A string key, so the effect below fires on a change of features, not of array identity.
  const demandKey = active !== null && fit === 'fits' ? active.descriptor.features.join('\n') : '';

  useEffect(() => {
    if (!ready) {
      return;
    }
    setDemand(demandKey === '' ? [] : demandKey.split('\n'));
  }, [ready, demandKey, setDemand]);

  useScreenKeepAwake(
    shouldHoldScreenAwake({ foreground, linkState: snapshot.state, onPanel: active !== null }),
  );

  const onStatusBarPress = useCallback(() => {
    if (route === SETUP_ROUTE) {
      setShowDiagnostics((open) => !open);
      return;
    }
    setShowDiagnostics(true);
    setLast(SETUP_ROUTE);
  }, [route, setLast]);

  const actions = useMemo(() => ({ write, activate }), [write, activate]);
  const landscape = deviceLayout.orientation === 'landscape';
  const switcher = (
    <PanelSwitcher
      key="switcher"
      items={[
        ...shown.map((panel) => ({ id: panel.descriptor.id, title: panel.descriptor.title })),
        { id: SETUP_ROUTE, title: 'Setup' },
      ]}
      route={route}
      orientation={deviceLayout.orientation}
      onSelect={setLast}
    />
  );

  return (
    <View testID="app-shell" style={styles.root}>
      <View style={styles.statusBarWrap}>
        <LinkStatusBar snapshot={snapshot} now={now} onOpenDiagnostics={onStatusBarPress} />
      </View>
      {ready ? (
        <View style={[styles.body, landscape ? styles.row : styles.column]}>
          {landscape ? switcher : null}
          <View key="content" style={styles.content}>
            {active === null ? (
              <SetupScreen
                snapshot={snapshot}
                now={now}
                showDiagnostics={showDiagnostics}
                panels={panels}
                panelIds={panelIds}
                layout={layout}
                deviceLayout={deviceLayout}
                onSetHidden={setHidden}
              />
            ) : (
              <>
                {fit === 'rotate' ? (
                  <View style={styles.notice}>
                    <BodyText>
                      {`Rotate the device to ${landscape ? 'portrait' : 'landscape'} to use this panel.`}
                    </BodyText>
                  </View>
                ) : null}
                <View
                  key={active.descriptor.id}
                  testID={`panel-${active.descriptor.id}`}
                  style={fit === 'fits' ? styles.fill : styles.hidden}
                >
                  <PanelFrame
                    title={active.descriptor.title}
                    snapshot={snapshot}
                    now={now}
                    actions={actions}
                  >
                    <active.Component />
                  </PanelFrame>
                </View>
              </>
            )}
          </View>
          {landscape ? null : switcher}
        </View>
      ) : null}
    </View>
  );
}
```

`src/app/AvionixApp.tsx`: import `AppShell` from `@/features/shell/AppShell` in place of
`MvpScreen` and render `<AppShell />`.

`src/features/health/LinkStatusBar.tsx`: add `minWidth: 48,` after `minHeight: 48,` in the `bar`
style, change that line's comment to
`// F-04 R4: every pressable target is at least 48 dp in both directions.`, and replace the
component's doc comment with
`/** Always on screen, pinned above whatever panel or Setup is in front (AppShell). */`.

Delete `src/features/mvp/MvpScreen.tsx`, `src/features/mvp/TelemetryPanel.tsx` and
`src/features/mvp/ControlPanel.tsx`. In `tests/ui/error-text-guard.test.tsx`, delete the
`ControlPanel` import and element (the panels rendered through `PanelFrame` replace it) and any
import that becomes unused.

- [ ] **Step 7: Run the tests**

Run: `npx jest tests/ui tests/web`
Expected: PASS. If `toBeSelected()` does not match a tab, check `accessibilityState.selected`.
If a web assertion runs before the layout has loaded, add one more
`await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });`.

- [ ] **Step 8: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Also run `grep -rn "features/mvp\|MvpScreen" src tests docs/architecture.md README.md` — only
documentation hits may remain (Task 11 updates them).

```bash
git add -A src tests
git commit -m "feat(shell): replace the MVP screen with panels, a switcher and Setup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Framework guards and the end-to-end checks

**Files:**
- Modify: `tests/mock-xplane/mock-xplane-server.ts`
- Create: `tests/ui/touch-target-guard.test.tsx`, `tests/integration/panel-framework.test.ts`

**Interfaces:**
- Consumes: `AppShell` (Task 9), `PANEL_IDS` (Task 8), `SimulatorSession.write`/`setDemand` (Tasks 3–4).
- Produces (test support only): `MockXPlaneServer.rejectWritesWith: string | null` (default `null`); `MockXPlaneServer.subscribedDataRefNames(): string[]` (sorted union over every open socket).

- [ ] **Step 1: Extend the mock X-Plane server**

In `tests/mock-xplane/mock-xplane-server.ts`, add next to `pauseReplies`:

```ts
  /** When set, every DataRef write is refused with this X-Plane error code (HTTP 400). */
  rejectWritesWith: string | null = null;
```

In the `PATCH` branch of the `/datarefs/{id}/value` handler, before `this.writeValue(...)`, add:

```ts
        if (this.rejectWritesWith !== null) {
          this.fail(400, this.rejectWritesWith, 'The dataref cannot be written');
        }
```

and add the public method after `getDataRefByName`:

```ts
  /** Every DataRef name some socket is subscribed to right now, sorted. */
  subscribedDataRefNames(): string[] {
    const names = new Set<string>();
    for (const subs of this.subscriptions.values()) {
      for (const id of subs.keys()) {
        const dataRef = this.dataRefs.get(id);
        if (dataRef !== undefined) {
          names.add(dataRef.name);
        }
      }
    }
    return [...names].sort();
  }
```

- [ ] **Step 2: Write the integration tests**

`tests/integration/panel-framework.test.ts` (copy `createSession` and `until` verbatim from
`tests/integration/aircraft-compatibility.test.ts`, with their imports):

```ts
import { featureStatus } from '@/application/compatibility';
import { IDENTITY_DATAREF_NAMES } from '@/domain/aircraft/identity-datarefs';
import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
} from '@/domain/aircraft/profiles/generic';

// createSession() and until() as in aircraft-compatibility.test.ts

const ALWAYS = [...IDENTITY_DATAREF_NAMES, GENERIC_DATAREFS.heartbeat, GENERIC_DATAREFS.paused];
const sorted = (names: string[]) => [...names].sort();

describe('the panel framework against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('moves the subscription with the visible panel, by the delta only', async () => {
    const session = createSession();
    session.setDemand([FEATURE_FLIGHT_TELEMETRY, FEATURE_HEADING_CONTROL]);
    await session.connect(server.host, server.port);
    expect(server.subscribedDataRefNames()).toEqual(
      sorted([...ALWAYS, GENERIC_DATAREFS.airspeed, GENERIC_DATAREFS.headingBug]),
    );
    await until(() => session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed] !== undefined);

    session.setDemand([FEATURE_HEADING_CONTROL]);
    await until(
      () => !server.subscribedDataRefNames().includes(GENERIC_DATAREFS.airspeed),
    );
    expect(server.subscribedDataRefNames()).toEqual(
      sorted([...ALWAYS, GENERIC_DATAREFS.headingBug]),
    );
    expect(session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed]).toBeUndefined();
    expect(session.store.getSnapshot().telemetry[GENERIC_DATAREFS.headingBug]).toBeDefined();

    session.setDemand([FEATURE_FLIGHT_TELEMETRY]);
    // The first update after a subscribe carries the value, so it returns within one cycle.
    await until(() => session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed] !== undefined);
    session.disconnect();
  });

  it('reports a rejected write against its control and keeps the simulator’s value', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const heading = () => session.store.getSnapshot().telemetry[GENERIC_DATAREFS.headingBug]?.value;
    await until(() => heading() !== undefined);
    const before = heading();
    server.rejectWritesWith = 'dataref_is_readonly';

    await session.write(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, 123);

    const outcome = session.store.getSnapshot().operations[GENERIC_DATAREFS.headingBug];
    expect(outcome).toMatchObject({ status: 'failed', refusal: null });
    expect(outcome?.failure?.step).toBe('operation');
    expect(heading()).toBe(before);
    expect(session.store.getSnapshot().state).toBe('connected');
    session.disconnect();
  });

  it('makes only the control whose name is missing unavailable', async () => {
    server.removeDataRef(GENERIC_DATAREFS.headingBug);
    const session = createSession();
    await session.connect(server.host, server.port);
    const snapshot = () => session.store.getSnapshot();
    expect(featureStatus(snapshot().compatibility, FEATURE_HEADING_CONTROL)).toBe('unavailable');
    expect(featureStatus(snapshot().compatibility, FEATURE_FLIGHT_TELEMETRY)).toBe('available');

    await session.write(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, 90);
    await session.activate(FEATURE_HEADING_CONTROL, GENERIC_COMMANDS.headingUp);
    expect(snapshot().operations[GENERIC_DATAREFS.headingBug]?.refusal).toBe('unavailable');
    expect(snapshot().operations[GENERIC_COMMANDS.headingUp]?.refusal).toBe('unavailable');
    expect(server.writes).toEqual([]);
    await until(() => snapshot().telemetry[GENERIC_DATAREFS.airspeed] !== undefined);
    session.disconnect();
  });

  it('keeps the last known values, marked by the link state, after the link drops', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    await until(() => session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed] !== undefined);
    session.disconnect();
    expect(session.store.getSnapshot().state).toBe('disconnected');
    expect(session.store.getSnapshot().telemetry[GENERIC_DATAREFS.airspeed]).toBeDefined();
  });
});
```

(`server.writes` stays empty because the write is refused before any request; the heading-up
refusal holds because `heading-control` is unavailable as a whole once a required name is gone.)

- [ ] **Step 3: Write the touch-target guard**

`tests/ui/touch-target-guard.test.tsx` — reuse the `makeServices`, `tree`, `seeded` and
`liveSnapshot` helpers and the two `jest.mock` blocks from `tests/ui/app-shell.test.tsx` verbatim,
then:

```tsx
import { SETUP_ROUTE } from '@/application/panel-layout';
import { PANEL_IDS } from '@/features/panels/registry';

const LAYOUTS: DeviceLayout[] = [
  { deviceClass: 'phone', orientation: 'portrait' },
  { deviceClass: 'phone', orientation: 'landscape' },
  { deviceClass: 'tablet', orientation: 'portrait' },
  { deviceClass: 'tablet', orientation: 'landscape' },
];

/**
 * Setup's form buttons (Connect, Pair, Retry, Share) are platform Buttons outside F-04's rule
 * (spec, Touch rules), so on Setup only the framework's own roles are checked.
 */
const PANEL_ROLES = ['button', 'switch', 'radio', 'tab'] as const;
const SETUP_ROLES = ['switch', 'radio', 'tab'] as const;

describe.each(LAYOUTS)('touch targets on a $deviceClass in $orientation', (layout) => {
  it.each([...PANEL_IDS, SETUP_ROUTE])('every control on %s is at least 48 dp', async (route) => {
    mockLayout = layout;
    const { services } = makeServices(liveSnapshot(), await seeded(route));
    await render(tree(services));
    await screen.findByTestId(route === SETUP_ROUTE ? 'setup-screen' : `panel-${route}`);
    const roles = route === SETUP_ROUTE ? SETUP_ROLES : PANEL_ROLES;
    const targets = roles.flatMap((role) => screen.queryAllByRole(role));
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
    expect(screen.getByTestId('link-status-bar')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx jest tests/integration/panel-framework.test.ts tests/ui/touch-target-guard.test.tsx`
Expected: PASS. A guard failure names the control by its accessibility label; fix the
component's style (use `theme.touch.minTarget`), never the guard.

- [ ] **Step 5: Run the gate and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`

```bash
git add tests/mock-xplane/mock-xplane-server.ts tests/integration/panel-framework.test.ts tests/ui/touch-target-guard.test.tsx
git commit -m "test(panels): guard touch targets and check the framework against the mock X-Plane

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Documentation and device checks

**Files:**
- Modify: `docs/architecture.md`, `README.md`, `docs/testing/xplane-smoke-test.md`

- [ ] **Step 1: Architecture**

In `docs/architecture.md`:

1. Add "panel rules (device layout, panel fit, link status, control availability, keep-awake
   policy)" to the Domain row of the Layers table, "`panel-layout`, `subscription-demand`" to the
   Application row, and "the keep-awake wrapper" to the Platform row.
2. In the data-flow block, replace the first line with
   `SetupScreen (in AppShell) → useSimulatorSession().connect(host, port)` and replace steps 9
   and 10 with:

```
      9. dataref_subscribe_values                  (WebSocket; identification, health and the
                                                     visible panel's features — setDemand)
     10. dataref_update_values → DataRefUpdate[] → snapshot.telemetry
```

3. Add a section after "Aircraft compatibility":

```markdown
## Panels

`AppShell` is the root under the providers: the link status bar pinned at the top, the active
panel or Setup below it, and a switcher (a bottom bar in portrait, a side rail in landscape).
Routes are one persisted value (`avionix.panels`: hidden panel ids and the last route), not a
navigation library, and rotation only moves the switcher, so a panel and a half-typed entry
survive it.

A panel is a `PanelDescriptor` (`src/domain/panels/panel.ts`: id, title, the profile features
it reads, and which device classes and orientations it supports) paired with a component in
`src/features/panels/registry.ts`. A tablet is a window whose shortest side is at least 600 dp.
A panel is never shown on a combination it did not declare: it is left out, or it asks for a
rotation.

Every panel is built from four primitives that carry the framework's rules:

- `PanelFrame` computes `panelLinkStatus` once and shows its single notice when values are not
  live; paused counts as live, because pilots set up the aircraft while paused.
- `Readout` shows a value from `telemetry` only, muted and marked "not live" when it is not
  current, and says so when the aircraft lacks the DataRef.
- `ControlButton` is disabled when the link is not live, when its feature is not usable
  (`controlAvailability`, with the reason under it) or while its own operation is pending, is at
  least 48 dp in both directions, supports a two-press confirmation, and shows only its own
  outcome from `snapshot.operations`.
- `ValueEntry` validates a number in the pilot's words before `ControlButton` sends it.

Controls act through `SimulatorSession.write(featureId, name, value)` and
`activate(featureId, name)`, which refuse any name that is not a binding of that feature in the
active profile. Outcomes are keyed by binding name, reset by `connect()`, and never carry error
text: a failure is a `{ code, step }` pair rendered by `FailureNotice`.

The shell calls `setDemand` with the visible panel's features. The session keeps identification,
connection health and those features' DataRefs subscribed, reconciling the socket as a delta
(added before removed, one change at a time). A value it stops carrying is pruned, and comes back
in the first update after it is subscribed again. Last known values survive a dropped link, so a
panel still shows them, marked not live.

While a panel is on screen and the link is connected or reconnecting, the screen is held awake
through `expo-keep-awake` (a wake lock on the web, best effort). Night is a third palette: black
background, nothing brighter than a relative luminance of 0.30.
```

4. In the Theming section, change "`lightTheme` and `darkTheme` share one shape" to
   "`lightTheme`, `darkTheme` and `nightTheme` share one shape", and the preference list to
   "(`system`, `auto-night`, `light`, `dark`, `night`; key `avionix.theme`, validated with zod,
   default `system`)". Replace "The toggle (`ThemeToggle.tsx`) sits under the Avionix heading" with
   "The toggle (`ThemeToggle.tsx`) sits in Setup's Display section", and "The theme preference is
   the second persisted setting after host and port; nothing else is stored." with "Host and port,
   the theme preference and the panel layout are the persisted settings."

- [ ] **Step 2: README**

Read `README.md` and update every sentence that describes the single MVP screen, the test
controls or where the theme toggle sits, so that it describes the switcher, the two interim
panels (Basic data, Heading), Setup, night presentation and keep-awake. Keep the file's existing
tone and length; do not add a new top-level section unless the file has no place for a
"Using the app" paragraph.

- [ ] **Step 3: Device checks**

In `docs/testing/xplane-smoke-test.md`, read the last numbered row (42 after F-03) and append,
in the same table format and numbering on from it:

| # | Check | Expected |
|---|---|---|
| 43 | First launch on a phone | Opens on Setup; the switcher at the bottom shows Basic data, Heading and Setup |
| 44 | Connect, open Heading, lock the device for 2 minutes without touching it … then open it | Screen never slept while Heading was open and connected |
| 45 | On Heading, background the app for 1 minute, return | Screen slept normally while backgrounded; Heading is still the panel shown |
| 46 | Type `12` in New heading, rotate the phone to landscape | The switcher moves to the left side; `12` is still in the field |
| 47 | Tap Setup, force-quit, reopen; then open Heading, force-quit, reopen | Reopens on Setup, then on Heading |
| 48 | Stop X-Plane's sim (pause off, quit to menu) with Basic data open | One notice at the top; every value muted and marked not live; Set and Heading up disabled |
| 49 | In Setup → Display, choose Night in a dark room | Black background, dim warm text, nothing bright white; Connect button still readable |
| 50 | Set the device to dark mode, choose System (night) | Night colours; switch the device to light mode → light colours |
| 51 | On a tablet, both orientations, every panel | Controls are comfortably pressable; the switcher is a side rail in landscape |
| 52 | Hide Basic data in Setup → Panels | It leaves the switcher; Heading's switch cannot be turned off |

Rows 44 and 45 verify the keep-awake hold, the one behaviour no automated test can observe.

- [ ] **Step 4: Check and commit**

Run: `npm run format:check`

```bash
git add docs/architecture.md README.md docs/testing/xplane-smoke-test.md
git commit -m "docs: describe the panel framework and its device checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Requirement coverage

| Req | Task(s) |
|---|---|
| R1 declared combinations only | 1 (`panelFit`), 9 (switcher filter, rotate notice, tests) |
| R2 rotation preserves state | 9 (keyed content; "rotation keeps a half-typed entry"), 7 (armed across re-render) |
| R3 fast switch, shared values untouched | 4 ("a switch leaves a value both panels read untouched"), 9 (synchronous route) |
| R4 touch rules | 2 (tokens, chips), 7 (`ControlButton`), 9 (switcher, status bar), 10 (guard) |
| R5 keep awake | 1 (policy), 6 (wrapper, hook), 9 (shell wiring), 11 (device rows 44–45) |
| R6 night presentation | 2 |
| R7 not live / disconnected | 1 (`panelLinkStatus`), 4 (telemetry retention), 7 (`PanelFrame`, `Readout`) |
| R8 unavailable control | 1 (`controlAvailability`), 7, 10 |
| R9 failure against the control | 3 (`operations`), 7 (`ControlButton` outcome), 10 |
| R10 no optimistic display | 8 ("shows the simulator’s heading"), 10 |
| R11 no raw errors | 3, 8 (error-text guard over panels) |
| R12 hidden panels unsubscribed | 4, 9 (`setDemand`), 10 |
| R13 persisted selection and last panel | 5, 9 |
