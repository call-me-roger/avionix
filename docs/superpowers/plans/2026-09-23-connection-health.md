# Connection Health and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While any panel is on screen the pilot can tell at a glance whether the values are live, and when something breaks the app names a likely cause and an action in plain language.

**Architecture:** Two independent state axes — the existing `ConnectionState` for the link, and a new `SimulatorActivity` for what the simulator is doing. The session records only facts (heartbeat advances, whether a flight is loaded, round-trip samples, retry timings); a `HealthMonitor` ticking every 500 ms derives `activity` and `live` from them. No `AvionixError.message` ever reaches the screen: the UI renders from an `explainFailure(code, step)` table instead.

**Tech Stack:** TypeScript strict, React 19, React Native 0.86 / Expo SDK 57, zod 4, Jest 29 with jest-expo (three projects: node, expo, web), react-native-web.

**Spec:** `docs/superpowers/specs/2026-09-23-connection-health-design.md`

**Feature:** `docs/roadmap/features/F-02-connection-health.md` (roadmap Stage 1)

## Global Constraints

- Gate before every commit: `npm run typecheck && npm run lint && npm run format:check && npm test`. All four must pass.
- TypeScript strict. No `any`, no non-null assertions, no `@ts-expect-error` without a comment naming the reason.
- Imports use the `@/` path alias, never deep relative paths.
- No new runtime dependencies. Expo Go must keep working, so no new native module.
- Never log, render or serialise a bearer token or a pairing code. This is existing project law and F-02 R10 restates it.
- `STALE_AFTER_MS = 2000`. `HEALTH_TICK_MS = 500`. `READINESS_RETRY_MS = 5000`. `ROUND_TRIP_WINDOW = 5`. Use these exact names and values.
- The minimum supported simulator is X-Plane 12.1.4; the string "12.1.4" appears in user-facing copy for `UNSUPPORTED_API`.
- Never launch a simulator, emulator, Xcode, Android Studio, `expo start` or an EAS build. Device verification belongs to the user.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Tests live under `tests/`, mirroring `src/`: `tests/unit/domain`, `tests/unit/application`, `tests/ui`, `tests/web`.

## File Structure

Created:

| File | Responsibility |
|---|---|
| `src/domain/health/simulator-activity.ts` | `SimulatorActivity`, `deriveActivity`, `ACTIVITY_LABEL` |
| `src/domain/health/freshness.ts` | `STALE_AFTER_MS`, `ageMs`, `isLive`, `formatAge` |
| `src/domain/health/failure-explanation.ts` | `ConnectStep`, `FailureExplanation`, `explainFailure` |
| `src/application/health-monitor.ts` | The 500 ms derivation tick over the session store |
| `src/application/diagnostics-summary.ts` | `formatDiagnosticsSummary`, the redacted support text |
| `src/platform/share.ts` / `share.web.ts` | `shareText`, native share sheet vs clipboard |
| `src/features/health/FailureNotice.tsx` | Renders one cause-and-action pair |
| `src/features/health/LinkStatusBar.tsx` | The always-visible link and freshness row |
| `src/features/health/DiagnosticsScreen.tsx` | Steps, causes, actions, retry, disconnect, share |

Modified: `src/application/session-snapshot.ts`, `src/application/mvp-bindings.ts`, `src/application/simulator-session.ts`, `src/app/composition-root.ts`, `src/app/services-context.tsx`, `src/app/AvionixApp.tsx`, `src/features/mvp/MvpScreen.tsx`.

Deleted: `src/features/connection/ConnectionStatus.tsx`, `src/features/diagnostics/DiagnosticsPanel.tsx`.

---

### Task 1: Simulator activity and freshness (pure domain)

**Files:**
- Create: `src/domain/health/simulator-activity.ts`
- Create: `src/domain/health/freshness.ts`
- Test: `tests/unit/domain/health.test.ts`

**Interfaces:**
- Consumes: `ConnectionState` from `@/domain/connection/connection-state`.
- Produces: `SimulatorActivity` (union of `'unknown' | 'running' | 'paused' | 'stalled' | 'pausedOrStalled' | 'noFlight'`), `deriveActivity(input: ActivityInput): SimulatorActivity`, `ACTIVITY_LABEL: Record<SimulatorActivity, string>`, `STALE_AFTER_MS: 2000`, `ageMs(lastAt: number | null, now: number): number | null`, `isLive(age: number | null): boolean`, `formatAge(age: number | null): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/health.test.ts`:

```ts
import {
  ACTIVITY_LABEL,
  type ActivityInput,
  type SimulatorActivity,
  deriveActivity,
} from '@/domain/health/simulator-activity';
import { STALE_AFTER_MS, ageMs, formatAge, isLive } from '@/domain/health/freshness';

const base: ActivityInput = {
  linkState: 'connected',
  heartbeatAdvancing: true,
  paused: null,
  flightLoaded: true,
};

describe('deriveActivity', () => {
  const cases: Array<[string, Partial<ActivityInput>, SimulatorActivity]> = [
    ['not connected wins over everything', { linkState: 'reconnecting' }, 'unknown'],
    ['disconnected is unknown', { linkState: 'disconnected' }, 'unknown'],
    ['no flight wins over a live heartbeat', { flightLoaded: false }, 'noFlight'],
    ['advancing heartbeat is running', {}, 'running'],
    ['advancing wins over paused=1', { paused: 1 }, 'running'],
    ['frozen heartbeat with paused=1 is paused', { heartbeatAdvancing: false, paused: 1 }, 'paused'],
    [
      'frozen heartbeat with paused=0 is stalled',
      { heartbeatAdvancing: false, paused: 0 },
      'stalled',
    ],
    [
      'frozen heartbeat without the paused dataref is the honest combined state',
      { heartbeatAdvancing: false, paused: null },
      'pausedOrStalled',
    ],
  ];

  it.each(cases)('%s', (_name, patch, expected) => {
    expect(deriveActivity({ ...base, ...patch })).toBe(expected);
  });

  it('labels every activity with non-empty user-facing text', () => {
    for (const [activity, label] of Object.entries(ACTIVITY_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain(activity);
    }
  });
});

describe('freshness', () => {
  it('reports no age before the first heartbeat', () => {
    expect(ageMs(null, 1000)).toBeNull();
    expect(isLive(null)).toBe(false);
    expect(formatAge(null)).toBe('no data yet');
  });

  it('never reports a negative age when the clock moves backwards', () => {
    expect(ageMs(2000, 1000)).toBe(0);
  });

  it('is live up to and including the threshold, stale after it', () => {
    expect(isLive(STALE_AFTER_MS - 1)).toBe(true);
    expect(isLive(STALE_AFTER_MS)).toBe(true);
    expect(isLive(STALE_AFTER_MS + 1)).toBe(false);
  });

  it('formats an age in the largest sensible unit', () => {
    expect(formatAge(400)).toBe('400 ms ago');
    expect(formatAge(4000)).toBe('4 s ago');
    expect(formatAge(120_000)).toBe('2 min ago');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest tests/unit/domain/health.test.ts`
Expected: FAIL — `Cannot find module '@/domain/health/simulator-activity'`.

- [ ] **Step 3: Write `simulator-activity.ts`**

```ts
import type { ConnectionState } from '@/domain/connection/connection-state';

/**
 * What the simulator is doing, independent of the state of the link. Paused, stalled and
 * not-ready are not link states: a paused simulator on a healthy socket and a running
 * simulator behind a dropped socket are both real, so they get their own axis.
 */
export type SimulatorActivity =
  | 'unknown'
  | 'running'
  | 'paused'
  | 'stalled'
  | 'pausedOrStalled'
  | 'noFlight';

export interface ActivityInput {
  linkState: ConnectionState;
  /** The heartbeat DataRef changed value within the staleness threshold. */
  heartbeatAdvancing: boolean;
  /** `sim/time/paused`, or null when that DataRef did not resolve. */
  paused: 0 | 1 | null;
  flightLoaded: boolean;
}

export function deriveActivity(input: ActivityInput): SimulatorActivity {
  if (input.linkState !== 'connected') {
    return 'unknown';
  }
  if (!input.flightLoaded) {
    return 'noFlight';
  }
  if (input.heartbeatAdvancing) {
    return 'running';
  }
  if (input.paused === 1) {
    return 'paused';
  }
  if (input.paused === 0) {
    return 'stalled';
  }
  // `sim/time/paused` is community-sourced and may not exist. Say both rather than guess.
  return 'pausedOrStalled';
}

export const ACTIVITY_LABEL: Record<SimulatorActivity, string> = {
  unknown: 'Simulator state unknown',
  running: 'X-Plane is running',
  paused: 'X-Plane is paused',
  stalled: 'X-Plane stopped sending data',
  pausedOrStalled: 'X-Plane is paused or not running',
  noFlight: 'No flight loaded in X-Plane',
};
```

- [ ] **Step 4: Write `freshness.ts`**

```ts
/**
 * Subscribed values arrive delta-only at about 10 Hz, so silence from the subscription as a
 * whole means nothing: a parked aircraft produces no traffic. Freshness is therefore keyed to
 * the heartbeat DataRef, which advances every frame the simulator runs.
 *
 * 2000 ms is twenty times the expected 100 ms delivery interval: tolerant of a frame-rate dip
 * or a Wi-Fi hiccup, tight enough that minutes of silent lag cannot pass unreported.
 */
export const STALE_AFTER_MS = 2000;

export function ageMs(lastAt: number | null, now: number): number | null {
  return lastAt === null ? null : Math.max(0, now - lastAt);
}

export function isLive(age: number | null): boolean {
  return age !== null && age <= STALE_AFTER_MS;
}

export function formatAge(age: number | null): string {
  if (age === null) {
    return 'no data yet';
  }
  if (age < 1000) {
    return `${age} ms ago`;
  }
  if (age < 60_000) {
    return `${Math.round(age / 1000)} s ago`;
  }
  return `${Math.round(age / 60_000)} min ago`;
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest tests/unit/domain/health.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/domain/health tests/unit/domain/health.test.ts
git commit -m "feat(health): derive simulator activity and value freshness

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Failure explanation table

**Files:**
- Create: `src/domain/health/failure-explanation.ts`
- Test: `tests/unit/domain/failure-explanation.test.ts`

**Interfaces:**
- Consumes: `AvionixErrorCode` from `@/domain/errors/avionix-error`.
- Produces: `ConnectStep` (union of `'connector' | 'pairing' | 'http' | 'capabilities' | 'websocket' | 'resolution' | 'command' | 'subscription' | 'operation'`), `CONNECT_STEPS: readonly ConnectStep[]`, `FailureExplanation { cause: string; action: string }`, `explainFailure(code: AvionixErrorCode, step: ConnectStep | null): FailureExplanation`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/failure-explanation.test.ts`:

```ts
import type { AvionixErrorCode } from '@/domain/errors/avionix-error';
import {
  CONNECT_STEPS,
  type ConnectStep,
  explainFailure,
} from '@/domain/health/failure-explanation';

const ALL_CODES: AvionixErrorCode[] = [
  'INVALID_HOST',
  'INVALID_PORT',
  'NETWORK_ERROR',
  'TIMEOUT',
  'HTTP_ERROR',
  'INCOMING_TRAFFIC_DISABLED',
  'PAIRING_REQUIRED',
  'PAIRING_FAILED',
  'PAIRING_RATE_LIMITED',
  'UNAUTHORIZED',
  'DISCOVERY_ERROR',
  'UNSUPPORTED_API',
  'INVALID_RESPONSE',
  'WEBSOCKET_ERROR',
  'DATAREF_NOT_FOUND',
  'COMMAND_NOT_FOUND',
  'DATAREF_READONLY',
  'SUBSCRIPTION_FAILED',
  'WRITE_FAILED',
  'COMMAND_FAILED',
  'SIMULATOR_ERROR',
  'SIMULATOR_NOT_READY',
  'CANCELLED',
  'INTERNAL',
  'UNKNOWN',
];

describe('explainFailure', () => {
  it.each(ALL_CODES)('%s has a cause and an action at every step', (code) => {
    const steps: Array<ConnectStep | null> = [null, ...CONNECT_STEPS];
    for (const step of steps) {
      const explanation = explainFailure(code, step);
      expect(explanation.cause.length).toBeGreaterThan(0);
      expect(explanation.action.length).toBeGreaterThan(0);
    }
  });

  it('never leaks protocol vocabulary into user-facing copy', () => {
    const banned = /HTTP \d|http:\/\/|ws:\/\/|websocket|dataref|json|stack|exception/i;
    for (const code of ALL_CODES) {
      for (const step of [null, ...CONNECT_STEPS] as Array<ConnectStep | null>) {
        const { cause, action } = explainFailure(code, step);
        expect(`${cause} ${action}`).not.toMatch(banned);
      }
    }
  });

  it('names the simulator setting that must be enabled', () => {
    expect(explainFailure('INCOMING_TRAFFIC_DISABLED', 'capabilities').action).toContain(
      'Accept incoming connections',
    );
  });

  it('names the minimum simulator version', () => {
    expect(explainFailure('UNSUPPORTED_API', 'capabilities').action).toContain('12.1.4');
  });

  it('blames the network, and mentions VPNs, when the connector probe cannot reach the PC', () => {
    const { cause, action } = explainFailure('NETWORK_ERROR', 'connector');
    expect(cause).toContain('could not reach');
    expect(action).toContain('VPN');
  });

  it('tells the pilot to start a flight rather than chasing a missing value', () => {
    expect(explainFailure('SIMULATOR_NOT_READY', 'resolution').cause).toContain('no flight');
  });

  it('prefers a step-specific explanation over the generic one', () => {
    expect(explainFailure('NETWORK_ERROR', 'connector')).not.toEqual(
      explainFailure('NETWORK_ERROR', null),
    );
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest tests/unit/domain/failure-explanation.test.ts`
Expected: FAIL — `Cannot find module '@/domain/health/failure-explanation'`.

- [ ] **Step 3: Write `failure-explanation.ts`**

```ts
import type { AvionixErrorCode } from '@/domain/errors/avionix-error';

/**
 * Where a failure happened, as the pilot would describe it. This is a presentation concept,
 * not a second copy of `SessionDiagnostics`: `resolution` covers the whole DataRef map and
 * `operation` covers a failed write or command activation.
 */
export type ConnectStep =
  | 'connector'
  | 'pairing'
  | 'http'
  | 'capabilities'
  | 'websocket'
  | 'resolution'
  | 'command'
  | 'subscription'
  | 'operation';

export const CONNECT_STEPS: readonly ConnectStep[] = [
  'connector',
  'pairing',
  'http',
  'capabilities',
  'websocket',
  'resolution',
  'command',
  'subscription',
  'operation',
];

export interface FailureExplanation {
  /** One line naming what went wrong, in the pilot's terms. */
  cause: string;
  /** One line naming what to do about it. */
  action: string;
}

const CHECK_NETWORK =
  'Check the PC is awake and on the same Wi-Fi, and that no VPN is active on either device.';

/**
 * Every code in the union has an entry. There is deliberately no fallback string: a new code
 * must be given real copy, and the exhaustive test is what enforces that.
 */
const BY_CODE: Record<AvionixErrorCode, FailureExplanation> = {
  INVALID_HOST: {
    cause: 'That address is not valid.',
    action: 'Pick the connector from the discovered list, or check the address in the connector window.',
  },
  INVALID_PORT: {
    cause: 'That port number is not valid.',
    action: 'Pick the connector from the discovered list, or check the port in the connector window.',
  },
  NETWORK_ERROR: { cause: 'Avionix could not reach the PC.', action: CHECK_NETWORK },
  TIMEOUT: { cause: 'The PC did not answer in time.', action: CHECK_NETWORK },
  HTTP_ERROR: {
    cause: 'X-Plane refused the request.',
    action: 'Restart X-Plane, then connect again.',
  },
  INCOMING_TRAFFIC_DISABLED: {
    cause: 'X-Plane is not accepting network connections.',
    action: 'In X-Plane open Settings, then Network, and tick "Accept incoming connections". Then retry.',
  },
  PAIRING_REQUIRED: {
    cause: 'This connector needs to be paired with this device first.',
    action: 'Enter the six-digit code shown in the connector window.',
  },
  PAIRING_FAILED: {
    cause: 'That code was not accepted.',
    action: 'Check the code in the connector window and enter it again.',
  },
  PAIRING_RATE_LIMITED: {
    cause: 'Too many pairing attempts.',
    action: 'Wait a minute, then enter the code again.',
  },
  UNAUTHORIZED: {
    cause: 'The connector no longer accepts this device.',
    action: 'Pair again with a fresh code from the connector window.',
  },
  DISCOVERY_ERROR: {
    cause: 'Avionix could not search the network for connectors.',
    action: 'Enter the address from the connector window by hand, or allow local network access for Avionix.',
  },
  UNSUPPORTED_API: {
    cause: 'This copy of X-Plane is older than Avionix supports.',
    action: 'Update X-Plane to 12.1.4 or newer, then connect again.',
  },
  INVALID_RESPONSE: {
    cause: 'X-Plane answered in a way Avionix did not understand.',
    action: 'Check that X-Plane and Avionix are both up to date, then connect again.',
  },
  WEBSOCKET_ERROR: {
    cause: 'The live data connection dropped.',
    action: CHECK_NETWORK,
  },
  DATAREF_NOT_FOUND: {
    cause: 'A value this panel needs is not available on the loaded aircraft.',
    action: 'Try a default aircraft to confirm, and report the aircraft you were flying.',
  },
  COMMAND_NOT_FOUND: {
    cause: 'A control this panel needs is not available on the loaded aircraft.',
    action: 'Try a default aircraft to confirm, and report the aircraft you were flying.',
  },
  DATAREF_READONLY: {
    cause: 'This aircraft does not allow that value to be changed.',
    action: 'Set it in the simulator instead.',
  },
  SUBSCRIPTION_FAILED: {
    cause: 'X-Plane accepted the connection but would not start sending values.',
    action: 'Restart X-Plane, then connect again.',
  },
  WRITE_FAILED: {
    cause: 'The change did not reach the aircraft.',
    action: 'Check the link is live, then try again.',
  },
  COMMAND_FAILED: {
    cause: 'The control press did not reach the aircraft.',
    action: 'Check the link is live, then try again.',
  },
  SIMULATOR_ERROR: {
    cause: 'X-Plane reported a problem with the request.',
    action: 'Restart X-Plane, then connect again.',
  },
  SIMULATOR_NOT_READY: {
    cause: 'X-Plane is running but has no flight loaded.',
    action: 'Start a flight in X-Plane. Avionix will pick it up on its own.',
  },
  CANCELLED: {
    cause: 'The request was cancelled.',
    action: 'Try again.',
  },
  INTERNAL: {
    cause: 'Avionix hit a problem of its own.',
    action: 'Share these diagnostics so the problem can be fixed.',
  },
  UNKNOWN: {
    cause: 'Something went wrong that Avionix could not identify.',
    action: 'Share these diagnostics so the problem can be fixed.',
  },
};

/** Overrides applied when the step changes the advice. */
const BY_STEP: Partial<Record<ConnectStep, Partial<Record<AvionixErrorCode, FailureExplanation>>>> =
  {
    connector: {
      NETWORK_ERROR: { cause: 'Avionix could not reach that address.', action: CHECK_NETWORK },
      TIMEOUT: { cause: 'That address did not answer in time.', action: CHECK_NETWORK },
    },
    capabilities: {
      HTTP_ERROR: {
        cause: 'X-Plane is reachable but refused to describe itself.',
        action: 'Update X-Plane to 12.1.4 or newer, then connect again.',
      },
    },
    resolution: {
      DATAREF_NOT_FOUND: {
        cause: 'A value Avionix needs is not published by the loaded aircraft.',
        action: 'Try a default aircraft to confirm, and report the aircraft you were flying.',
      },
    },
    operation: {
      TIMEOUT: {
        cause: 'The aircraft did not confirm the change in time.',
        action: 'Check the link is live, then try again.',
      },
    },
  };

export function explainFailure(
  code: AvionixErrorCode,
  step: ConnectStep | null,
): FailureExplanation {
  const override = step === null ? undefined : BY_STEP[step]?.[code];
  return override ?? BY_CODE[code];
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest tests/unit/domain/failure-explanation.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/domain/health/failure-explanation.ts tests/unit/domain/failure-explanation.test.ts
git commit -m "feat(health): map error codes and steps to a cause and an action

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `SessionHealth` in the snapshot, and required vs optional bindings

**Files:**
- Modify: `src/application/session-snapshot.ts`
- Modify: `src/application/mvp-bindings.ts`
- Test: `tests/unit/application/session-snapshot.test.ts` (create)

**Interfaces:**
- Consumes: `SimulatorActivity` from `@/domain/health/simulator-activity`, `ConnectStep` from `@/domain/health/failure-explanation`.
- Produces: `SessionHealth`, `initialHealth(reconnectBudget: number): SessionHealth`, `SessionSnapshot.health: SessionHealth`, `initialSnapshot(dataRefNames: readonly string[], reconnectBudget?: number): SessionSnapshot`, and from bindings: `OPTIONAL_DATAREFS`, `OPTIONAL_DATAREF_NAMES`, `ALL_DATAREF_NAMES`, `BINDING_FEATURE`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/application/session-snapshot.test.ts`:

```ts
import {
  ALL_DATAREF_NAMES,
  BINDING_FEATURE,
  MVP_COMMAND_HEADING_UP,
  MVP_DATAREF_NAMES,
  OPTIONAL_DATAREFS,
  OPTIONAL_DATAREF_NAMES,
} from '@/application/mvp-bindings';
import { initialHealth, initialSnapshot } from '@/application/session-snapshot';

describe('initialHealth', () => {
  it('starts with nothing known and the link budget it was given', () => {
    const health = initialHealth(5);
    expect(health).toEqual({
      activity: 'unknown',
      live: false,
      lastHeartbeatValue: null,
      lastHeartbeatAt: null,
      flightLoaded: false,
      roundTripMs: null,
      roundTripAt: null,
      lastConnectedAt: null,
      lastEndedAt: null,
      lastEndReason: null,
      reconnectBudget: 5,
      nextRetryAt: null,
      readinessRetryAt: null,
    });
  });
});

describe('initialSnapshot', () => {
  it('carries health and a diagnostics entry for every name it was given', () => {
    const snapshot = initialSnapshot(ALL_DATAREF_NAMES, 5);
    expect(snapshot.health.reconnectBudget).toBe(5);
    expect(Object.keys(snapshot.diagnostics.dataRefs).sort()).toEqual([...ALL_DATAREF_NAMES].sort());
  });
});

describe('bindings', () => {
  it('keeps the optional names out of the required set', () => {
    expect(OPTIONAL_DATAREF_NAMES).toEqual([OPTIONAL_DATAREFS.paused]);
    expect(MVP_DATAREF_NAMES).not.toContain(OPTIONAL_DATAREFS.paused);
    expect(ALL_DATAREF_NAMES).toEqual([...MVP_DATAREF_NAMES, ...OPTIONAL_DATAREF_NAMES]);
  });

  it('names the feature behind every binding, so diagnostics can say what broke', () => {
    for (const name of [...ALL_DATAREF_NAMES, MVP_COMMAND_HEADING_UP]) {
      expect(BINDING_FEATURE[name]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest tests/unit/application/session-snapshot.test.ts`
Expected: FAIL — `initialHealth` is not exported and `OPTIONAL_DATAREFS` does not exist.

- [ ] **Step 3: Rewrite `src/application/mvp-bindings.ts`**

```ts
/**
 * DataRefs and command used by the connectivity MVP. Names verified against
 * Laminar Research's DataRefs.txt / Commands.txt; see docs/xplane.md.
 * Numeric ids are resolved at runtime for every session and never stored.
 */
export const MVP_DATAREFS = {
  heartbeat: 'sim/time/total_running_time_sec',
  airspeed: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
  heading: 'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
} as const;

/**
 * Names that must not be able to fail a connect. `sim/time/paused` is community-sourced and
 * unverified against DataRefs.txt: without it the app reports "paused or not running" instead
 * of distinguishing the two, which is a worse message, not a broken feature.
 */
export const OPTIONAL_DATAREFS = {
  paused: 'sim/time/paused',
} as const;

export const MVP_DATAREF_NAMES: readonly string[] = Object.values(MVP_DATAREFS);
export const OPTIONAL_DATAREF_NAMES: readonly string[] = Object.values(OPTIONAL_DATAREFS);
export const ALL_DATAREF_NAMES: readonly string[] = [
  ...MVP_DATAREF_NAMES,
  ...OPTIONAL_DATAREF_NAMES,
];

export const MVP_COMMAND_HEADING_UP = 'sim/autopilot/heading_up';

/**
 * Which feature needs each binding, so diagnostics can name what a missing name costs
 * (F-02 R8). F-03 replaces this with per-aircraft profile metadata.
 */
export const BINDING_FEATURE: Record<string, string> = {
  [MVP_DATAREFS.heartbeat]: 'Connection health',
  [MVP_DATAREFS.airspeed]: 'Live telemetry',
  [MVP_DATAREFS.heading]: 'Heading control',
  [OPTIONAL_DATAREFS.paused]: 'Connection health',
  [MVP_COMMAND_HEADING_UP]: 'Heading control',
};
```

- [ ] **Step 4: Add `SessionHealth` to `src/application/session-snapshot.ts`**

Add the imports, the interface, `initialHealth`, and the `health` field. Keep every existing export unchanged.

```ts
import type { AvionixErrorCode } from '@/domain/errors/avionix-error';
import type { ConnectStep } from '@/domain/health/failure-explanation';
import type { SimulatorActivity } from '@/domain/health/simulator-activity';

export interface FailureRef {
  code: AvionixErrorCode;
  step: ConnectStep | null;
}

/**
 * The session writes only the facts here; `activity` and `live` are derived from them by
 * HealthMonitor. The paused reading is deliberately not a field: it is read from
 * `telemetry['sim/time/paused']`, which is absent exactly when that DataRef did not resolve.
 */
export interface SessionHealth {
  activity: SimulatorActivity;
  live: boolean;
  lastHeartbeatValue: number | null;
  /** Wall clock of the last heartbeat *advance*, not of the last frame received. */
  lastHeartbeatAt: number | null;
  flightLoaded: boolean;
  /** Median of the last ROUND_TRIP_WINDOW samples, in milliseconds. */
  roundTripMs: number | null;
  roundTripAt: number | null;
  lastConnectedAt: number | null;
  lastEndedAt: number | null;
  lastEndReason: FailureRef | null;
  reconnectBudget: number;
  nextRetryAt: number | null;
  readinessRetryAt: number | null;
}

export function initialHealth(reconnectBudget: number): SessionHealth {
  return {
    activity: 'unknown',
    live: false,
    lastHeartbeatValue: null,
    lastHeartbeatAt: null,
    flightLoaded: false,
    roundTripMs: null,
    roundTripAt: null,
    lastConnectedAt: null,
    lastEndedAt: null,
    lastEndReason: null,
    reconnectBudget,
    nextRetryAt: null,
    readinessRetryAt: null,
  };
}
```

Add `health: SessionHealth;` to `SessionSnapshot`, and give `initialSnapshot` a second parameter:

```ts
export function initialSnapshot(
  dataRefNames: readonly string[],
  reconnectBudget = 5,
): SessionSnapshot {
  return {
    state: 'disconnected',
    config: null,
    connector: null,
    capabilities: null,
    apiVersion: null,
    diagnostics: initialDiagnostics(dataRefNames),
    telemetry: {},
    lastOperation: null,
    error: null,
    reconnectAttempt: 0,
    health: initialHealth(reconnectBudget),
  };
}
```

The default of 5 matches `DEFAULT_RECONNECT_POLICY.maxAttempts` and keeps existing callers compiling; the session always passes its real policy value.

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest tests/unit/application/session-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gate and commit**

`npm test` will surface any existing test that constructs a snapshot literal; add `health: initialHealth(5)` to those fixtures rather than loosening the type.

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/application/session-snapshot.ts src/application/mvp-bindings.ts tests/unit/application/session-snapshot.test.ts
git commit -m "feat(health): add SessionHealth and split required from optional bindings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The session records health facts

**Files:**
- Modify: `src/application/simulator-session.ts`
- Test: `tests/unit/application/simulator-session.test.ts` (extend)

**Interfaces:**
- Consumes: `initialHealth` and `SessionHealth` from `@/application/session-snapshot`; `ALL_DATAREF_NAMES`, `MVP_DATAREF_NAMES`, `OPTIONAL_DATAREF_NAMES`, `MVP_DATAREFS` from `@/application/mvp-bindings`.
- Produces: a session that maintains `snapshot.health.lastHeartbeatValue`, `lastHeartbeatAt`, `flightLoaded`, `roundTripMs`, `roundTripAt`, `lastConnectedAt`, `lastEndedAt`, `lastEndReason`, `reconnectBudget`, `nextRetryAt`; and resolves `OPTIONAL_DATAREF_NAMES` without failing the connect. Exports `ROUND_TRIP_WINDOW = 5`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/application/simulator-session.test.ts`. The file already has a harness with `FakeClient` and a fake scheduler; reuse it exactly as the existing tests do.

```ts
describe('health facts', () => {
  it('records a heartbeat advance, and ignores a repeat of the same value', async () => {
    const { session, client, now } = await connectedSession();

    now.set(1000);
    emitUpdate(client, { id: 1, value: 10, receivedAt: 1000 });
    expect(session.store.getSnapshot().health.lastHeartbeatAt).toBe(1000);
    expect(session.store.getSnapshot().health.lastHeartbeatValue).toBe(10);

    now.set(3000);
    emitUpdate(client, { id: 1, value: 10, receivedAt: 3000 });
    expect(session.store.getSnapshot().health.lastHeartbeatAt).toBe(1000);

    now.set(4000);
    emitUpdate(client, { id: 1, value: 11, receivedAt: 4000 });
    expect(session.store.getSnapshot().health.lastHeartbeatAt).toBe(4000);
  });

  it('marks the flight as loaded and stamps the connection time on success', async () => {
    const { session } = await connectedSession();
    const { health } = session.store.getSnapshot();
    expect(health.flightLoaded).toBe(true);
    expect(health.lastConnectedAt).not.toBeNull();
  });

  it('measures a round trip from requests it already makes', async () => {
    const { session } = await connectedSession();
    const { health } = session.store.getSnapshot();
    expect(health.roundTripMs).not.toBeNull();
    expect(health.roundTripAt).not.toBeNull();
  });

  it('exposes the reconnect budget alongside the attempt', async () => {
    const { session } = await connectedSession();
    expect(session.store.getSnapshot().health.reconnectBudget).toBe(5);
  });

  it('resolves an optional dataref without letting it fail the connect', async () => {
    const { session, client } = await connectedSession({ missingOptional: true });
    const snapshot = session.store.getSnapshot();
    expect(snapshot.state).toBe('connected');
    expect(snapshot.diagnostics.dataRefs['sim/time/paused']).toBe('failed');
    expect(client.subscribed).not.toContain(4);
  });

  it('keeps the last known state and the end reason after disconnect', async () => {
    const { session } = await connectedSession();
    session.disconnect();
    const snapshot = session.store.getSnapshot();
    expect(snapshot.state).toBe('disconnected');
    expect(snapshot.health.lastConnectedAt).not.toBeNull();
    expect(snapshot.health.lastEndedAt).not.toBeNull();
    expect(snapshot.diagnostics.websocket).toBe('ok');
  });
});
```

Add the two helpers the tests above use, next to the existing harness. `connectedSession` builds the session with the existing fakes, drives `connect('192.168.1.10', '8086')` to completion, and returns `{ session, client, now }`; `missingOptional` sets `client.missingDataRef = 'sim/time/paused'`. `emitUpdate` calls every registered update listener:

```ts
function emitUpdate(client: FakeClient, update: DataRefUpdate): void {
  for (const listener of client.updateListeners) {
    listener([update]);
  }
}
```

Extend `FakeClient.findDataRef`'s id map with `['sim/time/paused']: 4` so the optional name resolves by default.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest tests/unit/application/simulator-session.test.ts -t "health facts"`
Expected: FAIL — `snapshot.health` is not maintained.

- [ ] **Step 3: Record the heartbeat in `applyUpdates`**

Replace the body of `applyUpdates` so it also tracks the heartbeat. Only a *changed* value counts: a paused simulator that re-sends the same number must not read as live.

```ts
private applyUpdates(
  dataRefsById: Map<number, DataRefDescriptor>,
  updates: DataRefUpdate[],
): void {
  this.store.setState((prev) => {
    const telemetry = { ...prev.telemetry };
    let health = prev.health;
    let changed = false;
    for (const update of updates) {
      const descriptor = dataRefsById.get(update.id);
      if (descriptor === undefined) {
        continue;
      }
      telemetry[descriptor.name] = { value: update.value, receivedAt: update.receivedAt };
      changed = true;
      if (
        descriptor.name === MVP_DATAREFS.heartbeat &&
        typeof update.value === 'number' &&
        update.value !== health.lastHeartbeatValue
      ) {
        health = {
          ...health,
          lastHeartbeatValue: update.value,
          lastHeartbeatAt: update.receivedAt,
        };
      }
    }
    return changed ? { ...prev, telemetry, health } : prev;
  });
}
```

- [ ] **Step 4: Add round-trip sampling**

Add the constant, the private buffer, and the recorder:

```ts
export const ROUND_TRIP_WINDOW = 5;
```

```ts
private roundTrips: number[] = [];

/** Times a request the app was going to make anyway; keeps the median of the last few. */
private async timed<T>(run: () => Promise<T>): Promise<T> {
  const startedAt = this.now();
  const result = await run();
  this.recordRoundTrip(this.now() - startedAt);
  return result;
}

private recordRoundTrip(elapsedMs: number): void {
  this.roundTrips = [...this.roundTrips, Math.max(0, elapsedMs)].slice(-ROUND_TRIP_WINDOW);
  const sorted = [...this.roundTrips].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? null;
  const at = this.now();
  this.store.setState((prev) => ({
    ...prev,
    health: { ...prev.health, roundTripMs: median, roundTripAt: at },
  }));
}
```

Wrap the three call sites that already exist: in `runSimulatorFlow` use `await this.timed(() => probeCapabilities(http))` and `await this.timed(() => client.subscribeDataRefs(...))`; in `writeHeading` and `activateHeadingUp` wrap `setDataRefValue` and `activateCommand` the same way. Do not thread a callback through `RequestManager`: measuring at this boundary includes app overhead, which is what the pilot actually experiences.

- [ ] **Step 5: Split required from optional resolution**

In `runSimulatorFlow`, resolve the optional names after the required ones, catching each individually. Optional misses record `failed` and are left out of the subscription:

```ts
const optional: DataRefDescriptor[] = [];
for (const name of OPTIONAL_DATAREF_NAMES) {
  this.setDataRefStep(name, 'pending');
  try {
    optional.push(await dataRefs.resolve(name));
    if (this.isCurrent(generation)) {
      this.setDataRefStep(name, 'ok');
    }
  } catch (error) {
    if (this.isCurrent(generation)) {
      this.setDataRefStep(name, 'failed');
    }
    this.logger.debug('optional dataref missing', { name });
  }
}
for (const descriptor of optional) {
  dataRefsById.set(descriptor.id, descriptor);
  dataRefsByName.set(descriptor.name, descriptor);
}
```

Change every `initialSnapshot(MVP_DATAREF_NAMES)` and `initialDiagnostics(MVP_DATAREF_NAMES)` call in this file to `ALL_DATAREF_NAMES` so the optional name appears in diagnostics, and pass the policy budget: `initialSnapshot(ALL_DATAREF_NAMES, this.policy.maxAttempts)`.

In the constructor, assign `this.policy` **before** constructing the store, since the store now needs it:

```ts
constructor(private readonly deps: SimulatorSessionDeps) {
  this.policy = deps.reconnectPolicy ?? DEFAULT_RECONNECT_POLICY;
  this.store = new Store(initialSnapshot(ALL_DATAREF_NAMES, this.policy.maxAttempts));
  this.scheduler = deps.scheduler ?? realScheduler;
  this.random = deps.random ?? Math.random;
  this.logger = deps.logger ?? silentLogger;
  this.now = deps.now ?? Date.now;
}
```

- [ ] **Step 6: Stamp connection, flight and end facts**

In `runSimulatorFlow`, where the subscription succeeds, also set `flightLoaded: true` and `lastConnectedAt: this.now()`:

```ts
this.store.setState((prev) => ({
  ...prev,
  state: mode === 'reconnect' ? transition(prev.state, 'connected') : prev.state,
  reconnectAttempt: 0,
  error: null,
  health: { ...prev.health, flightLoaded: true, lastConnectedAt: this.now(), readinessRetryAt: null },
}));
```

In `scheduleReconnect`, record when the next attempt is due:

```ts
this.store.setState((prev) => ({
  ...prev,
  reconnectAttempt: attempt,
  health: { ...prev.health, nextRetryAt: this.now() + delayMs },
}));
```

Rewrite `disconnect()` so it retains the last known state instead of clearing it (F-02 R11). Telemetry is still cleared — those values are genuinely gone — but diagnostics, the connector and the health facts stay:

```ts
disconnect(): void {
  this.teardown();
  this.nextGeneration();
  this.pendingPairing = null;
  this.pairInFlight = false;
  // The stored token is kept: only the connector revokes it.
  this.token = null;
  const endedAt = this.now();
  this.store.setState((prev) => ({
    ...prev,
    state: this.settled(prev.state),
    telemetry: {},
    reconnectAttempt: 0,
    health: {
      ...prev.health,
      live: false,
      activity: 'unknown',
      nextRetryAt: null,
      readinessRetryAt: null,
      lastEndedAt: endedAt,
      lastEndReason:
        prev.error === null ? prev.health.lastEndReason : { code: prev.error.code, step: null },
    },
  }));
}
```

`markFailure` records the reason too. Give it the step it failed at so the explanation can be specific:

```ts
private markFailure(error: AvionixError, mode: FlowMode, step: ConnectStep | null = null): void {
  if (this.returnToPairingIfUnauthorized(error)) {
    return;
  }
  this.logger.warn('session failure', { code: error.code, message: error.message, mode });
  const endedAt = this.now();
  this.store.setState((prev) => ({
    ...prev,
    state: mode === 'initial' ? transition(prev.state, 'failed') : prev.state,
    error,
    health: {
      ...prev.health,
      lastEndedAt: endedAt,
      lastEndReason: { code: error.code, step },
    },
  }));
}
```

Add `import type { ConnectStep } from '@/domain/health/failure-explanation';` at the top of the file. Pass the step at each existing call site: `'connector'` in `runConnectorProbe`, `'capabilities'` in the capabilities catch, `'websocket'` in the socket catch, `'resolution'` in the resolution catch, `'subscription'` in the subscription catch, and `'connector'` for the invalid-config failure in `connect()`.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx jest tests/unit/application/simulator-session.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 8: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/application/simulator-session.ts tests/unit/application/simulator-session.test.ts
git commit -m "feat(health): record heartbeat, round trips and end reasons in the session

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Hold the link open when no flight is loaded

**Files:**
- Modify: `src/application/simulator-session.ts`
- Test: `tests/unit/application/simulator-session.test.ts` (extend)

**Interfaces:**
- Consumes: everything Task 4 produced.
- Produces: `READINESS_RETRY_MS = 5000`, and a session that on `SIMULATOR_NOT_READY` stays `connected` with `health.activity` left to the monitor, `health.flightLoaded === false`, `health.readinessRetryAt` set, and the resolution retried on the same open socket.

- [ ] **Step 1: Write the failing tests**

```ts
describe('no flight loaded', () => {
  it('keeps the link open and retries instead of failing the connect', async () => {
    const { session, client, scheduler } = await connectingSession();
    client.dataRefCount = 0;
    client.missingDataRef = MVP_DATAREFS.airspeed;
    await settle();

    const held = session.store.getSnapshot();
    expect(held.state).toBe('connected');
    expect(held.health.flightLoaded).toBe(false);
    expect(held.health.readinessRetryAt).not.toBeNull();
    expect(held.error?.code).toBe('SIMULATOR_NOT_READY');
    expect(client.socketOpen).toBe(true);

    client.dataRefCount = 3;
    client.missingDataRef = null;
    scheduler.runNext();
    await settle();

    const ready = session.store.getSnapshot();
    expect(ready.state).toBe('connected');
    expect(ready.health.flightLoaded).toBe(true);
    expect(ready.health.readinessRetryAt).toBeNull();
    expect(ready.error).toBeNull();
    expect(client.connectWebSocket).toHaveBeenCalledTimes(1);
  });

  it('still fails the connect when a name is genuinely missing and a flight is loaded', async () => {
    const { session, client } = await connectingSession();
    client.dataRefCount = 3;
    client.missingDataRef = MVP_DATAREFS.airspeed;
    await settle();

    expect(session.store.getSnapshot().state).toBe('error');
    expect(session.store.getSnapshot().health.readinessRetryAt).toBeNull();
  });

  it('cancels the readiness retry on disconnect', async () => {
    const { session, client, scheduler } = await connectingSession();
    client.dataRefCount = 0;
    client.missingDataRef = MVP_DATAREFS.airspeed;
    await settle();

    session.disconnect();
    expect(scheduler.pending()).toBe(0);
    expect(session.store.getSnapshot().health.readinessRetryAt).toBeNull();
  });
});
```

`connectingSession` is `connectedSession` without awaiting success; `settle()` is the existing helper that flushes microtasks. Use the fake scheduler already in the file, adding `runNext()` and `pending()` if it does not have them.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest tests/unit/application/simulator-session.test.ts -t "no flight loaded"`
Expected: FAIL — the session reaches `error`.

- [ ] **Step 3: Extract the setup that follows a live socket**

Split `runSimulatorFlow` so everything from DataRef resolution onwards lives in its own method. This is what makes the retry possible without opening a second socket, and it shortens a file that is already long.

```ts
/**
 * Everything that happens on an already-open socket: resolve names, attach the update
 * listener, subscribe. Separate from runSimulatorFlow so it can be retried on the same
 * socket when X-Plane has no flight loaded yet.
 */
private async completeSessionSetup(
  generation: number,
  config: XPlaneConnectionConfig,
  client: SimulatorClient,
  unsubscribeClose: () => void,
  mode: FlowMode,
): Promise<boolean> { /* the body moved out of runSimulatorFlow, unchanged */ }
```

`runSimulatorFlow` ends with `return this.completeSessionSetup(generation, config, client, unsubscribeClose, mode);`.

- [ ] **Step 4: Branch on `SIMULATOR_NOT_READY` instead of failing**

In `completeSessionSetup`'s resolution catch, after `explainLookupMiss`, hold rather than fail. Note what it must **not** do: it must not call `unsubscribeClose()` or `disconnectWebSocket()`, because the link is fine.

```ts
const explained = await this.explainLookupMiss(client, resolutionError);
if (explained.code === 'SIMULATOR_NOT_READY') {
  this.holdForReadiness(generation, config, client, unsubscribeClose, mode, explained);
  return false;
}
unsubscribeClose();
client.disconnectWebSocket();
this.setStep((d) => ({ ...d, command: d.command === 'pending' ? 'failed' : d.command }));
this.markFailure(explained, mode, 'resolution');
return false;
```

Move the existing `unsubscribeClose(); client.disconnectWebSocket();` out of the top of the catch block so the readiness branch can run before them.

- [ ] **Step 5: Add the hold and its retry**

```ts
export const READINESS_RETRY_MS = 5000;
```

```ts
private cancelReadiness: (() => void) | null = null;

/**
 * X-Plane is up and the socket is open, but no flight is loaded, so no DataRef exists to
 * resolve. The link is genuinely healthy: stay connected, say what is happening, and retry
 * resolution on a flat interval until the pilot starts a flight. This is not the reconnect
 * backoff, which governs a socket that is actually gone, and it has no attempt budget.
 */
private holdForReadiness(
  generation: number,
  config: XPlaneConnectionConfig,
  client: SimulatorClient,
  unsubscribeClose: () => void,
  mode: FlowMode,
  error: AvionixError,
): void {
  const at = this.now() + READINESS_RETRY_MS;
  this.store.setState((prev) => ({
    ...prev,
    // The socket is open, so a reconnect that lands on the main menu is connected too.
    state: prev.state === 'reconnecting' ? transition(prev.state, 'connected') : prev.state,
    error,
    reconnectAttempt: 0,
    health: { ...prev.health, flightLoaded: false, readinessRetryAt: at, nextRetryAt: null },
  }));
  this.cancelReadiness = this.scheduler.schedule(() => {
    this.cancelReadiness = null;
    if (!this.isCurrent(generation)) {
      return;
    }
    void this.completeSessionSetup(generation, config, client, unsubscribeClose, mode);
  }, READINESS_RETRY_MS);
}

private cancelReadinessRetry(): void {
  if (this.cancelReadiness !== null) {
    this.cancelReadiness();
    this.cancelReadiness = null;
  }
  this.store.setState((prev) =>
    prev.health.readinessRetryAt === null
      ? prev
      : { ...prev, health: { ...prev.health, readinessRetryAt: null } },
  );
}
```

Call `this.cancelReadinessRetry()` at the top of `teardown()` and at the top of `handleSocketClosed()`. `disconnect()` and `connect()` both call `teardown()` already, so they are covered.

On the successful path in `completeSessionSetup`, `readinessRetryAt` is cleared by the `flightLoaded: true` setState from Task 4 Step 6.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx jest tests/unit/application/simulator-session.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/application/simulator-session.ts tests/unit/application/simulator-session.test.ts
git commit -m "feat(health): hold the link open and retry while X-Plane has no flight loaded

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The health monitor

**Files:**
- Create: `src/application/health-monitor.ts`
- Test: `tests/unit/application/health-monitor.test.ts`

**Interfaces:**
- Consumes: `Store<SessionSnapshot>` from `@/application/store`, `Scheduler` from `@/application/simulator-session`, `deriveActivity` from `@/domain/health/simulator-activity`, `ageMs`/`isLive` from `@/domain/health/freshness`, `OPTIONAL_DATAREFS` from `@/application/mvp-bindings`.
- Produces: `HEALTH_TICK_MS = 500`, `class HealthMonitor` with `constructor(deps: HealthMonitorDeps)`, `start(): void`, `stop(): void`, `refresh(): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/application/health-monitor.test.ts`:

```ts
import { HEALTH_TICK_MS, HealthMonitor } from '@/application/health-monitor';
import { ALL_DATAREF_NAMES, OPTIONAL_DATAREFS } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import type { Scheduler } from '@/application/simulator-session';
import { Store } from '@/application/store';

class FakeScheduler implements Scheduler {
  private queue: Array<{ callback: () => void; delayMs: number }> = [];

  schedule(callback: () => void, delayMs: number): () => void {
    const entry = { callback, delayMs };
    this.queue.push(entry);
    return () => {
      this.queue = this.queue.filter((item) => item !== entry);
    };
  }

  get pending(): number {
    return this.queue.length;
  }

  runNext(): number {
    const entry = this.queue.shift();
    if (entry === undefined) {
      throw new Error('nothing scheduled');
    }
    entry.callback();
    return entry.delayMs;
  }
}

function setup(patch: (snapshot: SessionSnapshot) => SessionSnapshot) {
  const store = new Store(patch(initialSnapshot(ALL_DATAREF_NAMES, 5)));
  const scheduler = new FakeScheduler();
  let clock = 10_000;
  const monitor = new HealthMonitor({
    store,
    scheduler,
    now: () => clock,
    tickMs: HEALTH_TICK_MS,
  });
  return { store, scheduler, monitor, setClock: (value: number) => (clock = value) };
}

const connected = (snapshot: SessionSnapshot, lastHeartbeatAt: number): SessionSnapshot => ({
  ...snapshot,
  state: 'connected',
  health: { ...snapshot.health, flightLoaded: true, lastHeartbeatAt, lastHeartbeatValue: 1 },
});

describe('HealthMonitor', () => {
  it('reports running and live while the heartbeat advances', () => {
    const { store, monitor } = setup((s) => connected(s, 9_900));
    monitor.refresh();
    expect(store.getSnapshot().health).toMatchObject({ activity: 'running', live: true });
  });

  it('goes not live once the heartbeat is older than the threshold', () => {
    const { store, monitor } = setup((s) => connected(s, 5_000));
    monitor.refresh();
    expect(store.getSnapshot().health.live).toBe(false);
  });

  it('reports paused when the paused dataref says so', () => {
    const { store, monitor } = setup((s) => ({
      ...connected(s, 5_000),
      telemetry: { [OPTIONAL_DATAREFS.paused]: { value: 1, receivedAt: 5_000 } },
    }));
    monitor.refresh();
    expect(store.getSnapshot().health.activity).toBe('paused');
  });

  it('reports stalled when the paused dataref says the sim is not paused', () => {
    const { store, monitor } = setup((s) => ({
      ...connected(s, 5_000),
      telemetry: { [OPTIONAL_DATAREFS.paused]: { value: 0, receivedAt: 5_000 } },
    }));
    monitor.refresh();
    expect(store.getSnapshot().health.activity).toBe('stalled');
  });

  it('reports the honest combined state when the paused dataref is absent', () => {
    const { store, monitor } = setup((s) => connected(s, 5_000));
    monitor.refresh();
    expect(store.getSnapshot().health.activity).toBe('pausedOrStalled');
  });

  it('reports no flight when the session says none is loaded', () => {
    const { store, monitor } = setup((s) => ({
      ...connected(s, 9_900),
      health: { ...connected(s, 9_900).health, flightLoaded: false },
    }));
    monitor.refresh();
    expect(store.getSnapshot().health.activity).toBe('noFlight');
  });

  it('does not notify subscribers when nothing derived changed', () => {
    const { store, monitor } = setup((s) => connected(s, 9_900));
    monitor.refresh();
    const listener = jest.fn();
    store.subscribe(listener);
    monitor.refresh();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reschedules itself on every tick and stops cleanly', () => {
    const { scheduler, monitor } = setup((s) => connected(s, 9_900));
    monitor.start();
    expect(scheduler.pending).toBe(1);
    expect(scheduler.runNext()).toBe(HEALTH_TICK_MS);
    expect(scheduler.pending).toBe(1);
    monitor.stop();
    expect(scheduler.pending).toBe(0);
  });

  it('is safe to start twice', () => {
    const { scheduler, monitor } = setup((s) => connected(s, 9_900));
    monitor.start();
    monitor.start();
    expect(scheduler.pending).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest tests/unit/application/health-monitor.test.ts`
Expected: FAIL — `Cannot find module '@/application/health-monitor'`.

- [ ] **Step 3: Write `health-monitor.ts`**

```ts
import { OPTIONAL_DATAREFS } from '@/application/mvp-bindings';
import type { SessionSnapshot } from '@/application/session-snapshot';
import { type Scheduler, realScheduler } from '@/application/simulator-session';
import type { Store } from '@/application/store';
import { ageMs, isLive } from '@/domain/health/freshness';
import { deriveActivity } from '@/domain/health/simulator-activity';

/**
 * Twice a second: fast enough for F-02 R1's one-second visibility budget, slow enough that a
 * tick costs nothing. The tick exists because staleness is the *absence* of updates, which no
 * event can announce.
 */
export const HEALTH_TICK_MS = 500;

export interface HealthMonitorDeps {
  store: Store<SessionSnapshot>;
  scheduler?: Scheduler;
  now?: () => number;
  tickMs?: number;
}

function readPaused(snapshot: SessionSnapshot): 0 | 1 | null {
  const sample = snapshot.telemetry[OPTIONAL_DATAREFS.paused];
  if (sample === undefined || typeof sample.value !== 'number') {
    return null;
  }
  return sample.value >= 0.5 ? 1 : 0;
}

export class HealthMonitor {
  private readonly store: Store<SessionSnapshot>;
  private readonly scheduler: Scheduler;
  private readonly now: () => number;
  private readonly tickMs: number;
  private cancel: (() => void) | null = null;
  private running = false;

  constructor(deps: HealthMonitorDeps) {
    this.store = deps.store;
    this.scheduler = deps.scheduler ?? realScheduler;
    this.now = deps.now ?? Date.now;
    this.tickMs = deps.tickMs ?? HEALTH_TICK_MS;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.refresh();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.cancel !== null) {
      this.cancel();
      this.cancel = null;
    }
  }

  /** Recomputes the derived fields once. Public so tests need no timers. */
  refresh(): void {
    const now = this.now();
    this.store.setState((prev) => {
      const heartbeatAdvancing = isLive(ageMs(prev.health.lastHeartbeatAt, now));
      const activity = deriveActivity({
        linkState: prev.state,
        heartbeatAdvancing,
        paused: readPaused(prev),
        flightLoaded: prev.health.flightLoaded,
      });
      const live = prev.state === 'connected' && heartbeatAdvancing;
      if (activity === prev.health.activity && live === prev.health.live) {
        // Store.setState ignores an identical reference, so this is a genuine no-op and
        // subscribers are not woken twice a second for nothing.
        return prev;
      }
      return { ...prev, health: { ...prev.health, activity, live } };
    });
  }

  private schedule(): void {
    this.cancel = this.scheduler.schedule(() => {
      this.cancel = null;
      if (!this.running) {
        return;
      }
      this.refresh();
      this.schedule();
    }, this.tickMs);
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest tests/unit/application/health-monitor.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/application/health-monitor.ts tests/unit/application/health-monitor.test.ts
git commit -m "feat(health): derive activity and liveness on a 500 ms tick

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The shareable diagnostics summary

**Files:**
- Create: `src/application/diagnostics-summary.ts`
- Create: `src/platform/share.ts`
- Create: `src/platform/share.web.ts`
- Test: `tests/unit/application/diagnostics-summary.test.ts`
- Test: `tests/web/share.web.test.ts`

**Interfaces:**
- Consumes: `SessionSnapshot`, `explainFailure`, `ACTIVITY_LABEL`, `formatAge`, `ageMs`, `BINDING_FEATURE`.
- Produces: `formatDiagnosticsSummary(snapshot: SessionSnapshot, now: number): string`; `shareText(text: string, title: string): Promise<void>` from both platform files.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/application/diagnostics-summary.test.ts`:

```ts
import { formatDiagnosticsSummary } from '@/application/diagnostics-summary';
import { ALL_DATAREF_NAMES } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError } from '@/domain/errors/avionix-error';

const SECRET_TOKEN = 'avx_7f3c9d2b1a8e4f60';
const PAIRING_CODE = '481920';

function snapshotWithSecrets(): SessionSnapshot {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  return {
    ...base,
    state: 'error',
    config: createConnectionConfig('192.168.1.10', '8086'),
    capabilities: { simulatorVersion: '12.4.0', supportedApiVersions: ['v2'], rawApiVersions: ['v2'] },
    apiVersion: 'v2',
    diagnostics: { ...base.diagnostics, connector: 'paired', http: 'ok', capabilities: 'failed' },
    error: new AvionixError({
      code: 'HTTP_ERROR',
      message: `GET http://192.168.1.10:8086/api/capabilities failed: HTTP 403 token=${SECRET_TOKEN} code=${PAIRING_CODE}`,
      httpStatus: 403,
      cause: new TypeError('Network request failed at XMLHttpRequest.send'),
    }),
    health: { ...base.health, lastHeartbeatAt: 9_000, lastEndReason: { code: 'HTTP_ERROR', step: 'capabilities' } },
  };
}

describe('formatDiagnosticsSummary', () => {
  it('never contains a token, a pairing code, a URL, an HTTP status or exception text', () => {
    const text = formatDiagnosticsSummary(snapshotWithSecrets(), 10_000);
    expect(text).not.toContain(SECRET_TOKEN);
    expect(text).not.toContain(PAIRING_CODE);
    expect(text).not.toContain('http://');
    expect(text).not.toContain('HTTP 403');
    expect(text).not.toContain('403');
    expect(text).not.toContain('XMLHttpRequest');
    expect(text).not.toContain('TypeError');
    expect(text).not.toContain('Network request failed');
  });

  it('carries what a support request actually needs', () => {
    const text = formatDiagnosticsSummary(snapshotWithSecrets(), 10_000);
    expect(text).toContain('Avionix diagnostics');
    expect(text).toContain('192.168.1.10:8086');
    expect(text).toContain('12.4.0');
    expect(text).toContain('HTTP_ERROR');
    expect(text).toContain('Capabilities: failed');
  });

  it('states the cause and the action for the failure', () => {
    const text = formatDiagnosticsSummary(snapshotWithSecrets(), 10_000);
    expect(text).toContain('X-Plane is reachable but refused to describe itself.');
    expect(text).toContain('12.1.4');
  });

  it('uses relative ages rather than absolute timestamps', () => {
    const text = formatDiagnosticsSummary(snapshotWithSecrets(), 10_000);
    expect(text).toContain('1 s ago');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('works on a snapshot that never connected', () => {
    const text = formatDiagnosticsSummary(initialSnapshot(ALL_DATAREF_NAMES, 5), 10_000);
    expect(text).toContain('Avionix diagnostics');
    expect(text).toContain('no data yet');
  });
});
```

Create `tests/web/share.web.test.ts`:

```ts
import { shareText } from '@/platform/share';

describe('shareText on web', () => {
  it('copies to the clipboard', async () => {
    const writeText = jest.fn(async () => undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    });
    await shareText('diagnostics', 'Avionix');
    expect(writeText).toHaveBeenCalledWith('diagnostics');
  });

  it('does not throw when no clipboard is available', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    await expect(shareText('diagnostics', 'Avionix')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest tests/unit/application/diagnostics-summary.test.ts`
Expected: FAIL — `Cannot find module '@/application/diagnostics-summary'`.

- [ ] **Step 3: Write `diagnostics-summary.ts`**

```ts
import { BINDING_FEATURE } from '@/application/mvp-bindings';
import type { SessionSnapshot, StepStatus } from '@/application/session-snapshot';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { explainFailure } from '@/domain/health/failure-explanation';
import { ACTIVITY_LABEL } from '@/domain/health/simulator-activity';

function stepLabel(status: StepStatus): string {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'in progress';
    case 'idle':
      return 'not reached';
  }
}

/**
 * The support text the pilot can share. It is built only from codes, step outcomes and the
 * explanation table — never from `AvionixError.message`, which carries URLs, HTTP statuses and
 * exception text. Times are relative so the text says nothing about when or where the user flies.
 */
export function formatDiagnosticsSummary(snapshot: SessionSnapshot, now: number): string {
  const { health, diagnostics, config, capabilities, connector, error } = snapshot;
  const lines: string[] = ['Avionix diagnostics', ''];

  lines.push(`Link: ${snapshot.state}`);
  if (snapshot.state === 'reconnecting') {
    lines.push(`Reconnect attempt: ${snapshot.reconnectAttempt} of ${health.reconnectBudget}`);
  }
  lines.push(`Simulator: ${ACTIVITY_LABEL[health.activity]}`);
  lines.push(`Values: ${health.live ? 'live' : 'not live'}`);
  lines.push(`Last update: ${formatAge(ageMs(health.lastHeartbeatAt, now))}`);
  lines.push(
    health.roundTripMs === null
      ? 'Response time: not measured yet'
      : `Response time: ${health.roundTripMs} ms, measured ${formatAge(ageMs(health.roundTripAt, now))}`,
  );
  lines.push(`Last connected: ${formatAge(ageMs(health.lastConnectedAt, now))}`);
  if (health.lastEndedAt !== null) {
    lines.push(`Link ended: ${formatAge(ageMs(health.lastEndedAt, now))}`);
  }
  lines.push('');

  lines.push(`Target: ${config === null ? 'none' : `${config.host}:${config.port}`}`);
  lines.push(`Connector: ${connector === null ? 'none (direct to X-Plane)' : connector.name}`);
  lines.push(`X-Plane: ${capabilities?.simulatorVersion ?? 'unknown'}`);
  lines.push(
    `API: ${capabilities?.rawApiVersions.join(', ') ?? 'unknown'}${
      snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`
    }`,
  );
  lines.push('');

  lines.push('Steps');
  lines.push(`  Connector: ${diagnostics.connector}`);
  lines.push(`  Reachable: ${stepLabel(diagnostics.http)}`);
  lines.push(`  Capabilities: ${stepLabel(diagnostics.capabilities)}`);
  lines.push(`  Live data channel: ${stepLabel(diagnostics.websocket)}`);
  for (const [name, status] of Object.entries(diagnostics.dataRefs)) {
    const feature = BINDING_FEATURE[name] ?? 'unknown feature';
    lines.push(`  Value ${name} (${feature}): ${stepLabel(status)}`);
  }
  lines.push(`  Control: ${stepLabel(diagnostics.command)}`);
  lines.push(`  Subscription: ${stepLabel(diagnostics.subscription)}`);

  if (error !== null) {
    const step = health.lastEndReason?.step ?? null;
    const { cause, action } = explainFailure(error.code, step);
    lines.push('', `Problem: ${error.code}`, `  ${cause}`, `  ${action}`);
  }

  return lines.join('\n');
}
```

Note `Capabilities: failed` in the test comes from `stepLabel`, and `HTTP_ERROR` from the `Problem:` line — the code is an identifier, not protocol text, and it is what makes a report actionable.

- [ ] **Step 4: Write the two platform files**

`src/platform/share.ts`:

```ts
import { Share } from 'react-native';

/** Hands the text to the OS share sheet. Errors are swallowed: sharing is never load-bearing. */
export async function shareText(text: string, title: string): Promise<void> {
  try {
    await Share.share({ message: text, title });
  } catch {
    // The user dismissed the sheet, or the platform refused. Nothing to recover.
  }
}
```

`src/platform/share.web.ts`:

```ts
/**
 * React Native Web does not implement Share, so the web target copies instead. The diagnostics
 * screen also renders the summary as selectable text, so this failing costs nothing.
 */
interface ClipboardHost {
  navigator?: { clipboard?: { writeText(text: string): Promise<void> } };
}

export async function shareText(text: string, title: string): Promise<void> {
  void title;
  const clipboard = (globalThis as ClipboardHost).navigator?.clipboard;
  if (clipboard === undefined) {
    return;
  }
  try {
    await clipboard.writeText(text);
  } catch {
    // Permission denied or an insecure origin. The selectable text is the fallback.
  }
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest tests/unit/application/diagnostics-summary.test.ts tests/web/share.web.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/application/diagnostics-summary.ts src/platform/share.ts src/platform/share.web.ts tests/unit/application/diagnostics-summary.test.ts tests/web/share.web.test.ts
git commit -m "feat(health): build a redacted shareable diagnostics summary

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The link status bar

**Files:**
- Create: `src/features/health/FailureNotice.tsx`
- Create: `src/features/health/LinkStatusBar.tsx`
- Test: `tests/ui/link-status-bar.test.tsx`

**Interfaces:**
- Consumes: `SessionSnapshot`, `ACTIVITY_LABEL`, `ageMs`, `formatAge`, `explainFailure`, and the theme primitives `BodyText`, `Section`, `SectionTitle` from `@/theme/primitives`.
- Produces: `FailureNotice({ code, step })`, `LinkStatusBar({ snapshot, now, onOpenDiagnostics })`, `LINK_LABEL: Record<ConnectionState, string>`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/link-status-bar.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ALL_DATAREF_NAMES } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { ThemeProvider } from '@/theme/theme-context';

function renderBar(patch: Partial<SessionSnapshot>, onOpen = jest.fn()) {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  const snapshot: SessionSnapshot = { ...base, ...patch };
  render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <LinkStatusBar snapshot={snapshot} now={10_000} onOpenDiagnostics={onOpen} />
    </ThemeProvider>,
  );
  return onOpen;
}

const connected = (health: Partial<SessionSnapshot['health']>): Partial<SessionSnapshot> => {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  return { state: 'connected', health: { ...base.health, ...health } };
};

describe('LinkStatusBar', () => {
  it('says the values are live when they are', () => {
    renderBar(connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }));
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('X-Plane is running')).toBeTruthy();
    expect(screen.getByText('100 ms ago')).toBeTruthy();
  });

  it('marks the readouts not live when the heartbeat has gone quiet', () => {
    renderBar(connected({ activity: 'pausedOrStalled', live: false, lastHeartbeatAt: 2_000 }));
    expect(screen.getByText('Not live')).toBeTruthy();
    expect(screen.getByText('X-Plane is paused or not running')).toBeTruthy();
  });

  it('names the paused simulator rather than blaming the link', () => {
    renderBar(connected({ activity: 'paused', live: false, lastHeartbeatAt: 2_000 }));
    expect(screen.getByText('X-Plane is paused')).toBeTruthy();
  });

  it('shows the retry attempt against its budget while reconnecting', () => {
    renderBar({ state: 'reconnecting', reconnectAttempt: 2 });
    expect(screen.getByText('Reconnecting, attempt 2 of 5')).toBeTruthy();
  });

  it('opens diagnostics when tapped', () => {
    const onOpen = renderBar(connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }));
    fireEvent.press(screen.getByTestId('link-status-bar'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('is announced as one button naming the link state', () => {
    renderBar(connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }));
    expect(screen.getByLabelText(/Connected.*X-Plane is running.*live/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest tests/ui/link-status-bar.test.tsx`
Expected: FAIL — `Cannot find module '@/features/health/LinkStatusBar'`.

- [ ] **Step 3: Write `FailureNotice.tsx`**

```tsx
import React from 'react';

import type { AvionixErrorCode } from '@/domain/errors/avionix-error';
import { type ConnectStep, explainFailure } from '@/domain/health/failure-explanation';
import { BodyText } from '@/theme/primitives';

/**
 * The only route from an error to the screen. `AvionixError.message` is deliberately not a
 * prop: it carries URLs, HTTP statuses and exception text that F-02 R9 forbids showing.
 */
export function FailureNotice({
  code,
  step = null,
}: {
  code: AvionixErrorCode;
  step?: ConnectStep | null;
}) {
  const { cause, action } = explainFailure(code, step);
  return (
    <>
      <BodyText tone="danger">{cause}</BodyText>
      <BodyText muted>{action}</BodyText>
    </>
  );
}
```

- [ ] **Step 4: Write `LinkStatusBar.tsx`**

```tsx
import React from 'react';
import { Pressable, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { ConnectionState } from '@/domain/connection/connection-state';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { ACTIVITY_LABEL } from '@/domain/health/simulator-activity';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

export const LINK_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting',
  pairing: 'Waiting for the pairing code',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Connection failed',
};

const makeStyles = (theme: Theme) => ({
  bar: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    // Comfortably above the 44 pt minimum touch target; every panel in F-04 inherits this rule.
    minHeight: 48,
    gap: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
});

/**
 * Always on screen, behind whatever panel is in front. This is the component F-04 hoists into
 * the panel chrome; until then MvpScreen mounts it at the top.
 */
export function LinkStatusBar({
  snapshot,
  now,
  onOpenDiagnostics,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onOpenDiagnostics: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { health, state } = snapshot;
  const age = formatAge(ageMs(health.lastHeartbeatAt, now));
  const liveness = health.live ? 'Live' : 'Not live';
  const activity = ACTIVITY_LABEL[health.activity];
  const retry =
    state === 'reconnecting'
      ? `Reconnecting, attempt ${snapshot.reconnectAttempt} of ${health.reconnectBudget}`
      : null;

  return (
    <Pressable
      testID="link-status-bar"
      accessibilityRole="button"
      accessibilityLabel={`${LINK_LABEL[state]}. ${activity}. Values ${liveness.toLowerCase()}, updated ${age}. Open diagnostics.`}
      onPress={onOpenDiagnostics}
      style={styles.bar}
    >
      <View style={styles.row}>
        <BodyText>{LINK_LABEL[state]}</BodyText>
        <BodyText tone={health.live ? 'success' : 'danger'}>{liveness}</BodyText>
      </View>
      <View style={styles.row}>
        <BodyText muted>{activity}</BodyText>
        <BodyText muted>{age}</BodyText>
      </View>
      {retry === null ? null : <BodyText muted>{retry}</BodyText>}
    </Pressable>
  );
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest tests/ui/link-status-bar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/health tests/ui/link-status-bar.test.tsx
git commit -m "feat(health): add the always-visible link status bar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The diagnostics screen, wired in place of the old panels

**Files:**
- Create: `src/features/health/DiagnosticsScreen.tsx`
- Modify: `src/app/services-context.tsx`, `src/app/composition-root.ts`, `src/app/AvionixApp.tsx`, `src/features/mvp/MvpScreen.tsx`
- Delete: `src/features/connection/ConnectionStatus.tsx`, `src/features/diagnostics/DiagnosticsPanel.tsx`
- Test: `tests/ui/diagnostics-screen.test.tsx` (create), `tests/ui/mvp-screen.test.tsx` (update)

**Interfaces:**
- Consumes: `formatDiagnosticsSummary`, `shareText`, `FailureNotice`, `LinkStatusBar`, `HealthMonitor`.
- Produces: `DiagnosticsScreen({ snapshot, now, onRetry, onDisconnect })`; `AppServices.healthMonitor: HealthMonitorApi` where `HealthMonitorApi = Pick<HealthMonitor, 'start' | 'stop' | 'refresh'>`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/diagnostics-screen.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ALL_DATAREF_NAMES, MVP_DATAREFS } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { createConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError } from '@/domain/errors/avionix-error';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import { ThemeProvider } from '@/theme/theme-context';

const mockShareText = jest.fn(async () => undefined);
// jest.mock is hoisted above every const, so the factory may only close over a `mock`-prefixed name.
jest.mock('@/platform/share', () => ({
  shareText: (text: string, title: string) => mockShareText(text, title),
}));

function renderScreen(patch: Partial<SessionSnapshot> = {}) {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  const snapshot: SessionSnapshot = { ...base, ...patch };
  const onRetry = jest.fn();
  const onDisconnect = jest.fn();
  render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <DiagnosticsScreen
        snapshot={snapshot}
        now={10_000}
        onRetry={onRetry}
        onDisconnect={onDisconnect}
      />
    </ThemeProvider>,
  );
  return { onRetry, onDisconnect };
}

const failedAtCapabilities = (): Partial<SessionSnapshot> => {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  return {
    state: 'error',
    config: createConnectionConfig('192.168.1.10', '8086'),
    diagnostics: { ...base.diagnostics, connector: 'paired', http: 'ok', capabilities: 'failed' },
    error: new AvionixError({
      code: 'INCOMING_TRAFFIC_DISABLED',
      message: 'GET http://192.168.1.10:8086/api/capabilities failed: HTTP 403',
      httpStatus: 403,
    }),
    health: { ...base.health, lastEndReason: { code: 'INCOMING_TRAFFIC_DISABLED', step: 'capabilities' } },
  };
};

describe('DiagnosticsScreen', () => {
  it('lists every connect step with its outcome', () => {
    renderScreen(failedAtCapabilities());
    expect(screen.getByText('Reachable: ok')).toBeTruthy();
    expect(screen.getByText('Capabilities: failed')).toBeTruthy();
    expect(screen.getByText('Live data channel: not reached')).toBeTruthy();
  });

  it('states the cause and the action, never the raw error', () => {
    renderScreen(failedAtCapabilities());
    expect(screen.getByText('X-Plane is not accepting network connections.')).toBeTruthy();
    expect(screen.queryByText(/HTTP 403/)).toBeNull();
    expect(screen.queryByText(/http:\/\//)).toBeNull();
  });

  it('names an unresolved value and the feature that needs it', () => {
    const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
    renderScreen({
      diagnostics: {
        ...base.diagnostics,
        dataRefs: { ...base.diagnostics.dataRefs, [MVP_DATAREFS.airspeed]: 'failed' },
      },
    });
    expect(screen.getByText(new RegExp(MVP_DATAREFS.airspeed))).toBeTruthy();
    expect(screen.getByText(/Live telemetry/)).toBeTruthy();
  });

  it('offers retry and disconnect', () => {
    const { onRetry, onDisconnect } = renderScreen(failedAtCapabilities());
    fireEvent.press(screen.getByText('Retry'));
    fireEvent.press(screen.getByText('Disconnect'));
    expect(onRetry).toHaveBeenCalled();
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('shares the redacted summary', () => {
    renderScreen(failedAtCapabilities());
    fireEvent.press(screen.getByText('Share diagnostics'));
    expect(mockShareText).toHaveBeenCalled();
    const [text] = mockShareText.mock.calls[0] as unknown as [string];
    expect(text).toContain('Avionix diagnostics');
    expect(text).not.toContain('HTTP 403');
  });

  it('still reports the last known state while disconnected', () => {
    const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
    renderScreen({
      state: 'disconnected',
      diagnostics: { ...base.diagnostics, websocket: 'ok' },
      health: {
        ...base.health,
        lastConnectedAt: 4_000,
        lastEndedAt: 9_000,
        lastEndReason: { code: 'WEBSOCKET_ERROR', step: 'websocket' },
      },
    });
    expect(screen.getByText('Live data channel: ok')).toBeTruthy();
    expect(screen.getByText(/Last connected: 6 s ago/)).toBeTruthy();
    expect(screen.getByText('The live data connection dropped.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest tests/ui/diagnostics-screen.test.tsx`
Expected: FAIL — `Cannot find module '@/features/health/DiagnosticsScreen'`.

- [ ] **Step 3: Write `DiagnosticsScreen.tsx`**

```tsx
import React, { useCallback } from 'react';
import { Button, View } from 'react-native';

import { formatDiagnosticsSummary } from '@/application/diagnostics-summary';
import { BINDING_FEATURE } from '@/application/mvp-bindings';
import type { SessionSnapshot, StepStatus } from '@/application/session-snapshot';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { FailureNotice } from '@/features/health/FailureNotice';
import { shareText } from '@/platform/share';
import { ACTIVITY_LABEL } from '@/domain/health/simulator-activity';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

function stepLabel(status: StepStatus): string {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'in progress';
    case 'idle':
      return 'not reached';
  }
}

function stepTone(status: StepStatus): 'danger' | 'success' | undefined {
  if (status === 'ok') {
    return 'success';
  }
  return status === 'failed' ? 'danger' : undefined;
}

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md, marginTop: theme.spacing.sm },
});

export function DiagnosticsScreen({
  snapshot,
  now,
  onRetry,
  onDisconnect,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onRetry: () => void;
  onDisconnect: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { health, diagnostics, config, capabilities, connector, error } = snapshot;

  const onShare = useCallback(() => {
    void shareText(formatDiagnosticsSummary(snapshot, now), 'Avionix diagnostics');
  }, [snapshot, now]);

  return (
    <Section>
      <SectionTitle>Diagnostics</SectionTitle>

      <BodyText>Target: {config === null ? 'none' : `${config.host}:${config.port}`}</BodyText>
      <BodyText>
        Connector: {connector === null ? 'none (direct to X-Plane)' : connector.name}
      </BodyText>
      <BodyText>X-Plane: {capabilities?.simulatorVersion ?? 'unknown'}</BodyText>
      <BodyText>
        API: {capabilities?.rawApiVersions.join(', ') ?? 'unknown'}
        {snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`}
      </BodyText>

      <BodyText>Simulator: {ACTIVITY_LABEL[health.activity]}</BodyText>
      <BodyText>Last update: {formatAge(ageMs(health.lastHeartbeatAt, now))}</BodyText>
      <BodyText>
        {health.roundTripMs === null
          ? 'Response time: not measured yet'
          : `Response time: ${health.roundTripMs} ms, measured ${formatAge(ageMs(health.roundTripAt, now))}`}
      </BodyText>
      <BodyText>Last connected: {formatAge(ageMs(health.lastConnectedAt, now))}</BodyText>
      {health.readinessRetryAt === null ? null : (
        <BodyText muted>Waiting for a flight to be loaded, retrying every 5 s.</BodyText>
      )}

      <SectionTitle>Steps</SectionTitle>
      <BodyText>Connector: {diagnostics.connector}</BodyText>
      <BodyText tone={stepTone(diagnostics.http)}>Reachable: {stepLabel(diagnostics.http)}</BodyText>
      <BodyText tone={stepTone(diagnostics.capabilities)}>
        Capabilities: {stepLabel(diagnostics.capabilities)}
      </BodyText>
      <BodyText tone={stepTone(diagnostics.websocket)}>
        Live data channel: {stepLabel(diagnostics.websocket)}
      </BodyText>
      {Object.entries(diagnostics.dataRefs).map(([name, status]) => (
        <BodyText key={name} tone={stepTone(status)}>
          {name} ({BINDING_FEATURE[name] ?? 'unknown feature'}): {stepLabel(status)}
        </BodyText>
      ))}
      <BodyText tone={stepTone(diagnostics.command)}>
        Control: {stepLabel(diagnostics.command)}
      </BodyText>
      <BodyText tone={stepTone(diagnostics.subscription)}>
        Subscription: {stepLabel(diagnostics.subscription)}
      </BodyText>

      {error === null ? null : (
        <>
          <SectionTitle>Problem</SectionTitle>
          <BodyText muted>{error.code}</BodyText>
          <FailureNotice code={error.code} step={health.lastEndReason?.step ?? null} />
        </>
      )}
      {error === null && health.lastEndReason !== null ? (
        <>
          <SectionTitle>Last problem</SectionTitle>
          <FailureNotice code={health.lastEndReason.code} step={health.lastEndReason.step} />
        </>
      ) : null}

      <View style={styles.row}>
        <Button title="Retry" onPress={onRetry} color={theme.colors.primary} />
        <Button title="Disconnect" onPress={onDisconnect} color={theme.colors.primary} />
        <Button title="Share diagnostics" onPress={onShare} color={theme.colors.primary} />
      </View>
    </Section>
  );
}
```

- [ ] **Step 4: Wire the monitor into the app**

In `src/app/services-context.tsx` add:

```ts
import type { HealthMonitor } from '@/application/health-monitor';

export type HealthMonitorApi = Pick<HealthMonitor, 'start' | 'stop' | 'refresh'>;
```

and `healthMonitor: HealthMonitorApi;` to `AppServices`.

In `src/app/composition-root.ts` construct it from the session store and return it:

```ts
const healthMonitor = new HealthMonitor({ store: session.store });
return { session, discovery, settingsStorage, healthMonitor };
```

In `src/app/AvionixApp.tsx` start it on mount and stop it on unmount, so no timer outlives the app or a test render:

```tsx
export function AvionixApp() {
  const services = useMemo(() => createAppServices(), []);
  useEffect(() => {
    services.healthMonitor.start();
    return () => services.healthMonitor.stop();
  }, [services]);
  ...
}
```

- [ ] **Step 5: Replace the old panels in `MvpScreen.tsx`**

Delete the `ConnectionStatus` and `DiagnosticsPanel` imports and their JSX. Mount `LinkStatusBar` immediately under the heading so it is always visible, and toggle `DiagnosticsScreen` from it:

```tsx
const [showDiagnostics, setShowDiagnostics] = useState(false);
const onToggleDiagnostics = useCallback(() => setShowDiagnostics((open) => !open), []);
const onRetry = useCallback(() => {
  void settings.persist();
  void connect(settings.host, settings.port);
}, [connect, settings]);
```

```tsx
<Text style={styles.heading}>Avionix</Text>
<LinkStatusBar snapshot={snapshot} now={now} onOpenDiagnostics={onToggleDiagnostics} />
<ThemeToggle />
<ConnectionForm ... />
<DiscoveredConnectors ... />
{showDiagnostics ? (
  <DiagnosticsScreen
    snapshot={snapshot}
    now={now}
    onRetry={onRetry}
    onDisconnect={disconnect}
  />
) : null}
<TelemetryPanel snapshot={snapshot} now={now} />
<ControlPanel ... />
```

`onConnect` and `onRetry` are the same action; keep one function and use it for both props.

- [ ] **Step 6: Delete the superseded components and update their tests**

```bash
git rm src/features/connection/ConnectionStatus.tsx src/features/diagnostics/DiagnosticsPanel.tsx
```

In `tests/ui/mvp-screen.test.tsx`: add `healthMonitor` to the `makeServices` fake (`{ start: jest.fn(), stop: jest.fn(), refresh: jest.fn() }`), change `initialSnapshot(MVP_DATAREF_NAMES)` to `initialSnapshot(ALL_DATAREF_NAMES, 5)`, and move any assertion that read `Status: connected` or a raw `error.code: message` string onto the new copy — `Connected` from `LINK_LABEL`, and the cause line from `explainFailure`. Any assertion about a diagnostics row must first press `link-status-bar` to open the screen. Apply the same `healthMonitor` addition to `tests/web/mvp-screen.web.test.tsx` and `tests/ui/smoke.test.tsx` if they build `AppServices`.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx jest tests/ui tests/web`
Expected: PASS.

- [ ] **Step 8: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A src tests
git commit -m "feat(health): replace the status and diagnostics panels with the health surfaces

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Guard the no-raw-error rule, and document it

**Files:**
- Test: `tests/ui/error-text-guard.test.tsx` (create)
- Modify: `docs/architecture.md`
- Modify: `docs/testing/xplane-smoke-test.md`

**Interfaces:**
- Consumes: everything above. Produces no new source module.

- [ ] **Step 1: Write the guard test**

This is the enforcement of F-02 R9 and R10: it drives every error code through both surfaces and asserts the raw message never reaches the tree.

Create `tests/ui/error-text-guard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ALL_DATAREF_NAMES } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { createConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError, type AvionixErrorCode } from '@/domain/errors/avionix-error';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { ThemeProvider } from '@/theme/theme-context';

const RAW = 'GET http://192.168.1.10:8086/api/capabilities failed: HTTP 403 token=avx_secret';

const ALL_CODES: AvionixErrorCode[] = [
  'INVALID_HOST', 'INVALID_PORT', 'NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR',
  'INCOMING_TRAFFIC_DISABLED', 'PAIRING_REQUIRED', 'PAIRING_FAILED', 'PAIRING_RATE_LIMITED',
  'UNAUTHORIZED', 'DISCOVERY_ERROR', 'UNSUPPORTED_API', 'INVALID_RESPONSE', 'WEBSOCKET_ERROR',
  'DATAREF_NOT_FOUND', 'COMMAND_NOT_FOUND', 'DATAREF_READONLY', 'SUBSCRIPTION_FAILED',
  'WRITE_FAILED', 'COMMAND_FAILED', 'SIMULATOR_ERROR', 'SIMULATOR_NOT_READY', 'CANCELLED',
  'INTERNAL', 'UNKNOWN',
];

function snapshotFor(code: AvionixErrorCode): SessionSnapshot {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  return {
    ...base,
    state: 'error',
    config: createConnectionConfig('192.168.1.10', '8086'),
    error: new AvionixError({ code, message: RAW, httpStatus: 403 }),
    health: { ...base.health, lastEndReason: { code, step: 'capabilities' } },
  };
}

describe.each(ALL_CODES)('%s never reaches the screen raw', (code) => {
  it('is rendered as a cause and an action, not as its message', () => {
    render(
      <ThemeProvider storage={createMemorySettingsStorage()}>
        <LinkStatusBar snapshot={snapshotFor(code)} now={10_000} onOpenDiagnostics={jest.fn()} />
        <DiagnosticsScreen
          snapshot={snapshotFor(code)}
          now={10_000}
          onRetry={jest.fn()}
          onDisconnect={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByText(new RegExp('http://'))).toBeNull();
    expect(screen.queryByText(/HTTP 403/)).toBeNull();
    expect(screen.queryByText(/avx_secret/)).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the guard and watch it pass**

Run: `npx jest tests/ui/error-text-guard.test.tsx`
Expected: PASS. If a code fails, the fix is in `explainFailure` or the component, never in the test.

- [ ] **Step 3: Document the rule in `docs/architecture.md`**

Add a short subsection under the existing layering notes:

```markdown
### Error presentation

`AvionixError` keeps its raw `message`, `cause` and `httpStatus` for the logger. Nothing in
`src/features` may render them. The only route from a failure to the screen is
`explainFailure(code, step)` in `src/domain/health/failure-explanation.ts`, which returns a
one-line cause and a one-line action. `tests/ui/error-text-guard.test.tsx` enforces this for
every error code, and `tests/unit/application/diagnostics-summary.test.ts` enforces it for the
shareable summary. A new error code needs an entry in the table; there is no fallback string.
```

- [ ] **Step 4: Add the health checks to the smoke test document**

Append rows to `docs/testing/xplane-smoke-test.md` covering the manual checks F-02 lists, which only the user can run:

```markdown
| 27 | Connect, then pause X-Plane | The status bar says "X-Plane is paused", not "Not live" alone |
| 28 | Connect while X-Plane sits at the main menu | Link stays connected, status bar says "No flight loaded in X-Plane"; starting a flight brings values in within ~5 s without reconnecting |
| 29 | Pull Wi-Fi mid-flight | Status bar shows "Reconnecting, attempt N of 5"; restoring Wi-Fi returns live values |
| 30 | Disable "Accept incoming connections" in X-Plane, then connect | Diagnostics names the setting and how to enable it |
| 31 | Open diagnostics and share | The shared text has no token, no pairing code, no URL and no raw error |
| 32 | Park on the ramp with engines off for two minutes | Values stay marked live throughout |
```

- [ ] **Step 5: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add tests/ui/error-text-guard.test.tsx docs/architecture.md docs/testing/xplane-smoke-test.md
git commit -m "test(health): guard against raw error text reaching any surface

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Requirement coverage

| F-02 | Task |
|---|---|
| R1 link state visible from any panel, within 1 s | 6, 8, 9 |
| R2 age of the most recent update | 4, 8 |
| R3 staleness threshold marks readouts not live | 1, 6, 8 (link-level "not live" marker only; marking each individual readout stale is F-04's half — see F-02's out-of-scope list and the spec) |
| R4 heartbeat distinguishes paused from dead | 1, 4, 6 |
| R5 no flight loaded keeps the link open and retries | 5 |
| R6 retry attempt and budget, then failed with retry | 3, 4, 8 |
| R7 every step with outcome, code, cause and action | 2, 9 |
| R8 unresolved names named with their feature | 3, 9 |
| R9 no raw status, URL, exception or payload | 2, 7, 9, 10 |
| R10 no tokens or pairing codes anywhere | 7, 10 |
| R11 last known state while disconnected | 4, 9 |

## What this plan deliberately does not do

- It does not extract the session's scheduling concerns into their own module. `completeSessionSetup` (Task 5) is the one split taken, because the readiness retry needs it. A wider refactor belongs with F-04, which will otherwise push `simulator-session.ts` past the point where a reviewer can hold it in one sitting.
- It does not thread round-trip timing through `RequestManager`; Task 4 measures at the session boundary instead.
- It does not add a user-tunable staleness threshold, a night theme, or a panel switcher. Those are F-04.
