# Connection health and diagnostics — design

Status: proposed, 2026-09-23. Implements roadmap feature
[F-02](../../roadmap/features/F-02-connection-health.md), the first sub-project of Stage 1.

## Goal

While any panel is on screen the pilot can tell at a glance whether what they are looking at is
live, and when something breaks the app names the likely cause and what to do about it, in plain
language, without ever showing a protocol error.

## Why this first

The competitor research ranks silent stale data as the second most repeated complaint in the
category (`docs/roadmap/research/competitors.md` §4.2): ForeFlight users reported sitting on the
ground for up to five minutes before the map caught up, with nothing on screen to say so. The
single positive example found across roughly thirty products is a visible link readout —
ForeFlight's `Accuracy (X-Plane) 1m` (§3.5). Network setup with no diagnostic is complaint §4.1
and §4.8, the latter specifically VPNs breaking the link silently. Every Stage 1 panel that
follows is only trustworthy if this exists first.

## Scope

In scope: the two state axes, value freshness, paused and not-ready detection, round-trip
responsiveness, the failure explanation table, a persistent link status bar, a diagnostics screen
with one-touch retry and disconnect, and a shareable text summary.

Out of scope: per-DataRef availability on the loaded aircraft (F-03), how each panel presents its
own degraded state (F-04), cloud reporting or crash telemetry, and any visual design beyond the
information each surface must carry.

## Architecture

### Two independent axes

`ConnectionState` stays exactly as it is and keeps its meaning: the state of the **link** —
`disconnected`, `connecting`, `pairing`, `connected`, `reconnecting`, `error`. Its transition
table and tests are not reopened.

A second axis describes what the **simulator** is doing, independent of the link:

```ts
export type SimulatorActivity =
  | 'unknown'          // not connected, or no heartbeat seen yet
  | 'running'          // heartbeat advancing
  | 'paused'           // heartbeat frozen, sim/time/paused reads 1
  | 'stalled'          // heartbeat frozen, sim/time/paused reads 0
  | 'pausedOrStalled'  // heartbeat frozen, sim/time/paused did not resolve
  | 'noFlight';        // connected, but X-Plane has no DataRefs registered
```

The axes are orthogonal in practice: a paused simulator on a healthy link, a running simulator
behind a dropped socket, and stale values during a reconnect are all real combinations. Collapsing
them into one enum would force states that are not mutually exclusive.

Derivation is a pure function, so it is a table test:

```ts
export function deriveActivity(input: {
  linkState: ConnectionState;
  heartbeatAdvancing: boolean;
  paused: 0 | 1 | null;   // null: the DataRef did not resolve
  flightLoaded: boolean;
}): SimulatorActivity;
```

Order of rules: not `connected` → `unknown`; not `flightLoaded` → `noFlight`; advancing →
`running`; `paused === 1` → `paused`; `paused === 0` → `stalled`; otherwise `pausedOrStalled`.

`sim/time/paused` is community-sourced and unverified against Laminar's `DataRefs.txt`
(F-02, X-Plane Web API mapping). The design never depends on it: when it does not resolve, the app
reports the honest combined state `pausedOrStalled` — "X-Plane is paused or not running" — rather
than guessing. Verifying the name in the simulator upgrades the message; it does not unblock the
feature.

### Freshness

Subscribed values arrive delta-only at about 10 Hz, so "no message" cannot by itself mean a broken
link: a parked aircraft with constant values produces no traffic at all. The freshness clock is
therefore keyed to the heartbeat specifically, not to any subscribed value.

`sim/time/total_running_time_sec` is already subscribed (`MVP_DATAREFS.heartbeat`) and advances
every frame the simulator runs, including parked at the gate. Its update age is the freshness
clock, and it costs no extra traffic.

```ts
export const STALE_AFTER_MS = 2000;
export function isLive(ageMs: number | null): boolean;   // ageMs !== null && ageMs <= STALE_AFTER_MS
```

2000 ms is twenty times the expected 100 ms delivery interval — tolerant of a frame-rate dip, a
garbage collection pause or a Wi-Fi hiccup, and tight enough that the five-minute silent lag in the
research is impossible. It is a named constant, not a user setting: setup friction is complaint
§4.1 and this feature must not add a knob.

`heartbeatAdvancing` means the heartbeat **value** changed within `STALE_AFTER_MS`, not merely that
a frame arrived. A paused simulator that re-sends an unchanged value must not read as live.

Because absence has to be noticed, a monitor recomputes freshness and activity on a 500 ms tick
through the injected `Scheduler`, which satisfies F-02 R1's one-second budget and keeps tests
deterministic with a fake scheduler and clock.

### Responsiveness

Measured from requests the app already makes, at the session boundary: `probeCapabilities` during
connect, then `subscribeDataRefs`, `setDataRefValue` and `activateCommand`. The session records
`now()` either side of the call and keeps the median of the last five samples together with the
time the newest was taken.

This deliberately avoids threading a callback through `RequestManager`,
`WebSocketTransport` and `XPlaneClient`. It measures a little more than pure network time — app
overhead is included — which is the honest quantity anyway, since it is what the pilot experiences
when they press a control.

It is reported as a number in milliseconds **with the age of the measurement**, because in cruise
the app makes no requests and a bare number would itself go stale. Research §3.5 is the reason for
a concrete figure rather than a coarse quality band: the one readout users praise is a number.

### Holding the link open when no flight is loaded

Today a name lookup miss becomes `SIMULATOR_NOT_READY` and fails the connect into `error`. That is
the failure mode the research describes as looking like a broken link when the simulator is merely
sitting at the main menu.

New behaviour (F-02 R5): the WebSocket is already open when resolution runs, so the link genuinely
is up. On `SIMULATOR_NOT_READY` the session keeps `ConnectionState` at `connected`, sets activity
to `noFlight`, and schedules a resolution retry every 5000 ms through the same injected
`Scheduler`. The retry is flat, not exponential, and has no attempt budget — the user is at the
menu and will start a flight when they start one. It is cancelled by `disconnect()` and superseded
by a generation bump like every other scheduled work in the session. When resolution succeeds the
flow continues into subscription and activity becomes `running`.

This is distinct from the reconnect backoff, which still governs a genuinely lost socket.

### Optional DataRef resolution

`sim/time/paused` must not be able to fail the connect, since its name is unverified. Resolution is
split into required and optional names:

```ts
export const REQUIRED_DATAREFS = { heartbeat, airspeed, heading } as const;
export const OPTIONAL_DATAREFS = { paused: 'sim/time/paused' } as const;
```

Required names behave as today — a miss rejects and is explained. Optional names record `failed` in
diagnostics, are omitted from the subscription, and leave the feature that reads them degraded
rather than absent. This is the same shape F-03 will generalise into per-aircraft profiles, so it
is built here in the narrow form rather than invented twice.

### Failure explanation

No `AvionixError.message` reaches the screen or the shareable summary. The UI renders only from a
lookup:

```ts
export type ConnectStep =
  | 'connector' | 'pairing' | 'http' | 'capabilities' | 'websocket'
  | 'resolution' | 'command' | 'subscription' | 'operation';

export interface FailureExplanation { cause: string; action: string; }

export function explainFailure(code: AvionixErrorCode, step: ConnectStep | null): FailureExplanation;
```

`ConnectStep` is a presentation concept, not a second copy of `SessionDiagnostics`: `resolution`
covers the `dataRefs` map, `operation` covers a failed write or command activation, and the rest
map one to one onto the existing diagnostics keys.

A default explanation per `AvionixErrorCode`, with step-specific overrides where the step changes
the advice. Every code in the union has an entry, enforced by an exhaustive test rather than a
fallback string. The six causes F-02 names explicitly:

| Code | Cause | Action |
|---|---|---|
| `INCOMING_TRAFFIC_DISABLED` | X-Plane is not accepting network connections. | In X-Plane open Settings → Network and tick "Accept incoming connections", then retry. |
| `UNSUPPORTED_API` | This copy of X-Plane is older than Avionix supports. | Update X-Plane to 12.1.4 or newer. |
| `SIMULATOR_NOT_READY` | X-Plane is running but no flight is loaded. | Start a flight; Avionix will pick it up on its own. |
| `NETWORK_ERROR` at `connector` | Avionix could not reach that address. | Check the PC is awake and on the same Wi-Fi, and that no VPN is active on either device. |
| `INVALID_HOST` / `INVALID_PORT` | That address is not valid. | Pick the connector from the discovered list, or check the address shown in the connector window. |
| `UNAUTHORIZED` | The connector no longer accepts this device. | Pair again with a fresh code from the connector window. |

The VPN wording is taken straight from research §4.8, where a VPN silently breaks the X-Plane
Control Pad with no diagnostic at all.

`AvionixError` itself is unchanged: it keeps `message`, `cause` and `httpStatus` for the logger,
which is where a raw cause remains recoverable.

## Session snapshot changes

`SessionSnapshot` gains one nested object rather than a scatter of fields:

```ts
export interface SessionHealth {
  activity: SimulatorActivity;
  lastHeartbeatValue: number | null;
  lastHeartbeatAt: number | null;      // wall clock of the last heartbeat *advance*
  flightLoaded: boolean;
  live: boolean;
  roundTripMs: number | null;          // median of the last five samples
  roundTripAt: number | null;
  lastConnectedAt: number | null;
  lastEndedAt: number | null;
  lastEndReason: { code: AvionixErrorCode; step: ConnectStep } | null;
  reconnectBudget: number;             // policy.maxAttempts, so "attempt 2 of 5" is renderable
  nextRetryAt: number | null;
  readinessRetryAt: number | null;
}
```

The session writes only facts — heartbeat advances, `flightLoaded`, round-trip samples, retry
timings — and the monitor derives `activity` and `live` from them. The paused reading is not a
field: the monitor takes it from `telemetry['sim/time/paused']`, which is absent exactly when the
DataRef did not resolve, so the unresolved case needs no special plumbing.

`disconnect()` currently wipes `diagnostics`; it will instead retain the last diagnostics, set
`lastEndedAt` and `lastEndReason`, and leave `lastConnectedAt` intact, so F-02 R11 — last known
state, last successful connection, and why it ended — is answerable while disconnected. `connect()`
already resets everything, so nothing leaks into a new session.

## Surfaces

The panel framework does not exist yet, so this sub-project delivers its own two surfaces and F-04
will later adopt the first into the panel chrome.

**`LinkStatusBar`** — always mounted, one compact row: link state, simulator activity, freshness
age, and a not-live marker. Tapping it opens the diagnostics screen. This is the component that
satisfies R1, and the one F-04 hoists.

**`DiagnosticsScreen`** — replaces the current `DiagnosticsPanel` and absorbs `ConnectionStatus`.
It carries: target host and port, connector name and version, X-Plane and API versions, link state
with reconnect attempt and budget, simulator activity, freshness age, round-trip figure with its
measurement age, every connect step as pass / fail / not reached, the cause and action for any
failure, any unresolved DataRef or command named alongside the feature that needs it, one-touch
retry and disconnect, and a Share button.

`ConnectionStatus.tsx` and `DiagnosticsPanel.tsx` are deleted; their coverage moves with them.

For R8 the "panel that needs it" is, until F-04 exists, the feature that declares the binding — a
static name-to-feature map beside `mvp-bindings.ts`, which F-03 replaces with profile metadata.

## Shareable summary

A pure function, so its redaction is directly testable:

```ts
export function formatDiagnosticsSummary(snapshot: SessionSnapshot, now: number): string;
```

It contains the app version and platform, X-Plane and API versions, connector name and version,
link state, simulator activity, freshness and round-trip figures, every step with its outcome, and
the cause and action for any failure. Times appear as relative ages, never as absolute timestamps.

It must never contain a bearer token, a pairing code, a URL, an HTTP status, an exception string or
any protocol payload. Host and port are included: a private LAN address is what makes a support
report actionable, and "wrong host" is one of the failures the summary exists to diagnose. This is
a deliberate reading of R9, which forbids URLs rather than addresses.

Sharing uses React Native's built-in `Share` API — no new dependency, and it works under Expo Go on
both iOS and Android, which the MVP constraint requires. React Native Web does not implement
`Share`, so the repo's existing platform-split convention applies: `src/platform/share.ts` wraps
the native API and `src/platform/share.web.ts` writes to the clipboard, mirroring how
`service-browser.ts` and `service-browser.web.ts` already work. The summary is also rendered as
selectable text on the diagnostics screen, so it is recoverable on any target whose share path
fails.

## File plan

Created:

- `src/domain/health/simulator-activity.ts` — the type and `deriveActivity`
- `src/domain/health/freshness.ts` — `STALE_AFTER_MS`, `isLive`
- `src/domain/health/failure-explanation.ts` — `ConnectStep`, `FailureExplanation`, `explainFailure`
- `src/application/health-monitor.ts` — the 500 ms recompute tick over the store
- `src/application/diagnostics-summary.ts` — `formatDiagnosticsSummary`
- `src/features/health/LinkStatusBar.tsx`
- `src/features/health/DiagnosticsScreen.tsx`
- `src/features/health/FailureNotice.tsx` — the cause and action pair, shared by both surfaces
- `src/platform/share.ts`, `src/platform/share.web.ts` — the share split described above

Modified:

- `src/application/session-snapshot.ts` — `SessionHealth`, initial values
- `src/application/simulator-session.ts` — heartbeat recording, round-trip sampling, required and
  optional resolution, the readiness retry loop, retained state on disconnect
- `src/application/mvp-bindings.ts` — required and optional split, the binding-to-feature map
- `src/app/composition-root.ts` — wire the monitor
- `src/features/mvp/MvpScreen.tsx` — mount the status bar, route to the diagnostics screen

Deleted: `src/features/connection/ConnectionStatus.tsx`,
`src/features/diagnostics/DiagnosticsPanel.tsx`.

`simulator-session.ts` is already 822 lines and this feature adds to it. The monitor and the
summary are deliberately placed outside it, and the readiness retry reuses the existing
`scheduleReconnect` shape rather than introducing a second mechanism. Extracting the session's
scheduling concerns wholesale is a real improvement but belongs to F-04, which will otherwise push
the file past the point where it can be reviewed in one sitting; this spec notes it rather than
bundling it.

## Testing

Unit, pure:

- `deriveActivity` as a table over every input combination, including both `paused` values and the
  unresolved case.
- `isLive` boundaries at and either side of `STALE_AFTER_MS`.
- `explainFailure` exhaustive over `AvionixErrorCode`, asserting every code has a non-empty cause
  and action, and that step overrides win.
- `formatDiagnosticsSummary` redaction: build a snapshot whose error carries a token-shaped string,
  a URL and an exception message, and assert none of them appear in the output.

Session, with a fake scheduler and clock:

- heartbeat stops advancing → stale within the threshold, readouts marked not live.
- heartbeat frozen with `paused` resolved to 1 → `paused`; resolved to 0 → `stalled`; unresolved →
  `pausedOrStalled`.
- `SIMULATOR_NOT_READY` → link stays `connected`, activity `noFlight`, retry scheduled, and a later
  successful resolution reaches `running` without a reconnect.
- an optional DataRef that fails to resolve does not fail the connect.
- reconnect attempt and budget are both exposed; exhaustion still reaches `error`.
- `disconnect()` retains last diagnostics, `lastConnectedAt` and the end reason.

Component, jest-expo:

- `LinkStatusBar` renders each link and activity combination.
- `DiagnosticsScreen` shows cause and action for a failed step and offers retry.
- A guard test that drives every `AvionixErrorCode` through both surfaces and asserts
  `error.message` never appears in the rendered tree — the enforcement of R9.

Manual verification on device is the user's, per the project's standing rule; the acceptance
criteria in F-02 list the simulator checks, notably pausing X-Plane, returning to the main menu,
and pulling Wi-Fi mid-flight.

## Requirement coverage

| F-02 | Covered by |
|---|---|
| R1 link state visible from any panel, within 1 s | `LinkStatusBar`, 500 ms monitor tick |
| R2 age of the most recent update | `SessionHealth.lastHeartbeatAt` |
| R3 staleness threshold marks readouts not live | `isLive`, `STALE_AFTER_MS` |
| R4 heartbeat distinguishes paused from dead | `deriveActivity` |
| R5 no flight loaded keeps the link open and retries | readiness retry loop |
| R6 retry attempt and budget, then failed with retry | `reconnectAttempt` + `reconnectBudget` |
| R7 every step with outcome, code, cause and action | `DiagnosticsScreen` + `explainFailure` |
| R8 unresolved names named with their feature | binding-to-feature map |
| R9 no raw status, URL, exception or payload | presentation mapping + guard test |
| R10 no tokens or pairing codes anywhere | redaction test over the summary |
| R11 last known state while disconnected | retained diagnostics, `lastEndReason` |

## Decisions and their rationale

1. **Two axes rather than one enum.** Paused, stale and not-ready are not link states; forcing them
   into `ConnectionState` would create combinations that are not mutually exclusive and reopen a
   tested transition table.
2. **Presentation-layer error mapping rather than sanitising messages at source.** One chokepoint to
   audit, a guard test that enforces it, and the raw cause survives in the logger where support
   needs it.
3. **Heartbeat as the freshness clock, `sim/time/paused` as a refinement.** Delta-only updates make
   any-value silence meaningless; the heartbeat advances every frame and is already subscribed. The
   unverified paused DataRef refines the message and can never break the feature.
4. **A number for responsiveness, carrying its own age.** Research §3.5: the one link readout users
   praise is a concrete figure.
5. **Host and port kept in the shareable summary.** R9 forbids URLs; a LAN address is what makes
   "wrong host" diagnosable, and it is not a secret in the sense R10 protects.
6. **No user-tunable threshold.** Setup friction is the top complaint; this feature must remove
   decisions, not add them.

## Open questions

- `sim/time/paused` is unverified against Laminar's `DataRefs.txt`. The design degrades to
  `pausedOrStalled` without it; confirming the name in the simulator is a follow-up that improves
  wording only.
- `STALE_AFTER_MS` of 2000 is reasoned from the 10 Hz delivery rate, not measured. It wants
  confirmation on a parked aircraft with engines off, where update traffic is at its sparsest.
- How much step history the diagnostics screen keeps across a session is left to the plan; the
  spec requires only the current attempt and the last ended session, which bounds retention and
  therefore the redaction surface.
