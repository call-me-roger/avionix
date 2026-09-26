# Panel framework and layouts — design

Feature: `F-04` (roadmap Stage 1, sub-project 3). Spec date: 2026-09-26.
Source: [docs/roadmap/features/F-04-panel-framework.md](../../roadmap/features/F-04-panel-framework.md).
Builds on: F-02 (connection health, [spec](2026-09-23-connection-health-design.md)) and F-03
(aircraft compatibility, [spec](2026-09-23-aircraft-compatibility-design.md)).

## Goal

Avionix stops being one long scrolling screen and becomes a set of **panels** the pilot moves
between with one touch, on a phone or a tablet, in either orientation. The framework owns the
rules every later panel obeys, so F-10, F-11, F-20, F-21 and F-22 contribute content only:

- which panels exist, which the pilot keeps, and which one opens on launch;
- how a panel says its values are not live, and that a control is unavailable on this aircraft;
- how large a control must be, and how a disruptive control is confirmed;
- how a failed write is reported against the control that caused it;
- which values are subscribed, so a hidden panel costs nothing;
- that the screen stays awake while a panel is open, and that a night presentation exists.

## Why this now

- Complaint #5 in `research/competitors.md`: desktop-sized controls shipped unchanged to phones,
  "still impossible to use on an 8 inch screen". The implication recorded there is to size touch
  targets phone-first, not as a scaled-down tablet layout.
- Complaint #10: one workflow split across several apps or devices (Simionic's PFD and MFD are two
  paid apps needing two iPads). The implication: one app, many panels.
- Praise #9: per-instrument modularity, assembling only the panels you want (Air Manager). Flight
  Sim Remote Panel's "simple three-panel layout switching" is praised for basic scanning.
- Complaint #2: silent stale data. F-02 made the link state visible in one bar; F-04 carries that
  to every readout and control, so a panel can never look live when it is not.

Every panel from F-10 onwards plugs into this. Settling the rules once stops each one inventing
its own touch sizes, stale marking and error copy.

## Scope

**In.** The panel model and registry. An app shell with a pinned link status bar, a one-touch
panel switcher and a Setup screen. Device class and orientation, and panels declaring which
combinations they support. Persisted panel selection and last route. Uniform not-live marking and
control disabling. Uniform unavailable-control reasons from F-03. A uniform confirmation for
disruptive controls. Per-control operation outcomes. Demand-driven subscriptions. Keeping the
screen awake. A night presentation. Minimum touch target and spacing rules with a guard test. Two
interim panels built from today's MVP content, which prove the framework and are replaced by F-11
and F-10.

**Out.** Panel content beyond the two interim panels. User-authored controls and profiles (F-06).
Assigning panel sets to several devices, and showing two panels side by side on a tablet (F-07).
Reordering panels. Screen brightness control. Orientation locking. Interpolating values above the
API's ~10 Hz. See "Deliberately not done".

## Architecture

### Panels

A panel is described twice, once per layer, so the domain stays free of React:

```ts
// src/domain/panels/panel.ts
export type DeviceClass = 'phone' | 'tablet';
export type Orientation = 'portrait' | 'landscape';

export interface PanelDescriptor {
  id: string;                       // stable, persisted: 'basic-data', 'heading'
  title: string;                    // switcher label and panel heading
  /** Profile feature ids whose DataRefs this panel reads (drives subscriptions). */
  features: readonly string[];
  supports: Readonly<Record<DeviceClass, readonly Orientation[]>>;
}
```

`src/features/panels/registry.ts` pairs each descriptor with its component in one ordered array,
`PANELS`. Order in that array is switcher order. A panel id is never reused for a different panel,
because it is persisted.

`deviceLayout(width, height)` in `src/domain/panels/device-layout.ts` classifies the window: the
shortest side ≥ 600 dp is a tablet (Android's `sw600dp` convention, which also puts every iPad in
the tablet class and every current phone in the phone class); width > height is landscape. On the
web the same rule applies to the browser window, so a narrow desktop window behaves as a phone.

`panelFit(descriptor, layout)` returns `'fits' | 'rotate' | 'unsupported'`: `rotate` when the
device class is supported in the other orientation only, `unsupported` when the device class is
not supported at all. The shell never renders a panel on a combination it did not declare (R1):
an `unsupported` panel is left out of the switcher and marked "tablet only" (or "phone only") in
Setup; a `rotate` panel stays in the switcher and, while it is active, shows a notice asking the
pilot to rotate, with the panel itself kept mounted but hidden so rotating back loses nothing.

### The two interim panels

Built from `TelemetryPanel` and `ControlPanel`, which are deleted along with `MvpScreen`:

| Id | Title | Features | Content |
|---|---|---|---|
| `basic-data` | Basic data | `flight-telemetry`, `heading-control` | Airspeed, heading bug and sim time readouts |
| `heading` | Heading | `heading-control` | Heading bug readout, a heading entry with Set, and Heading up |

Both support every combination. Both read the heading bug, which is what the "no re-subscribe of a
shared value on switch" requirement (R3) is tested against. F-11 replaces `basic-data` and F-20
absorbs `heading`; their ids are then retired, never reused.

### App shell and routes

`AppShell` replaces `MvpScreen` as the root under the providers. A route is a panel id or the
reserved `'setup'`.

- **Link status bar**, pinned above the content in every route (the F-02 bar, unchanged, except
  that pressing it opens Setup with diagnostics expanded).
- **Content.** The active panel inside a `PanelFrame`, or the Setup screen.
- **Switcher.** One button per visible, fitting panel, then Setup, which cannot be hidden. A bottom
  bar in portrait and a side rail in landscape, on both device classes. Every item meets the touch
  rules. The bar scrolls if the pilot keeps more panels than fit.

The shell keeps the content in a keyed child of a single container whose direction changes with
orientation, so rotating moves the switcher without remounting the panel. That is what makes R2
hold: panel state and any half-typed entry survive rotation. Switching panels unmounts the old
panel; a draft in a panel you leave is not kept (see "Deliberately not done").

Setup is today's MVP screen minus the telemetry and controls: connection form, discovered
connectors, aircraft summary and compatibility, diagnostics, plus two new sections, **Display**
(the theme choice) and **Panels** (one switch per panel to keep it in the switcher).

### Layout persistence (R13)

`src/application/panel-layout.ts` stores `{ hidden: string[], last: string }` under
`avionix.panels`, validated with zod, in the same `SettingsStorage` port as the other settings.
Storing *hidden* rather than *visible* ids means a panel added in a later release appears by
default instead of silently staying off. Loading drops unknown ids. The route restored on launch
is `last` if it is `'setup'` or a visible panel; otherwise the first visible panel; otherwise
Setup. First launch has nothing stored, so it opens on Setup, where the pilot connects. The pilot
cannot hide the last visible panel; its switch is disabled with the reason.

Saves are best-effort and never block the UI, the same contract as the theme preference.

### What a panel shows when the link is not live (R7)

`panelLinkStatus({ state, activity, lastHeartbeatAt, now })` in `src/domain/panels/panel-link.ts`
returns `{ valuesCurrent, controlsEnabled, notice }`:

| Link / activity | Values current | Controls | Notice (one per panel) |
|---|---|---|---|
| connected, running | yes | enabled | none |
| connected, paused | yes | enabled | none (the status bar already says paused) |
| connected, noFlight | no | disabled | "No flight loaded in X-Plane." |
| connected, stalled / pausedOrStalled | no | disabled | "X-Plane stopped sending data. Last update {age}." |
| connected, unknown | no | disabled | "Waiting for the first values from X-Plane." |
| reconnecting | no | disabled | "Reconnecting. Showing values from {age}." |
| disconnected / error / connecting / pairing | no | disabled | "Not connected. Showing the last known values." |

Paused counts as current on purpose: a paused simulator is exactly when pilots set up radios and
the autopilot, the values are the simulator's real (frozen) state, and writes still work.

A readout whose values are not current is drawn muted with "not live" in its accessibility label;
every control is disabled. The notice renders once, at the top of the panel, never per control.

**Last known values survive a dropped link.** Today `disconnect()` and each reconnect attempt
clear `telemetry`. F-04's scope requires panels to keep showing the last known values, marked not
live, so the session stops clearing telemetry on disconnect and on reconnect attempts. It still
clears on `connect()` (a new host may be a different simulator entirely) and still prunes names
the new aircraft does not have (F-03). This reverses one line of the F-02 spec on purpose: F-02
cleared values because nothing marked them stale; F-04 is what marks them.

### Controls the aircraft cannot support (R8)

`controlAvailability(feature)` in `src/domain/panels/control-availability.ts` returns
`{ usable, reason }`, generalising `ControlPanel.reasonFor`: `available` and `partial` are usable
(matching the session's `featureUsable`); `unknown` reads "{label} has not been checked yet.";
`unavailable` reads "{label} is not available on this aircraft: {purposes}." A control that is not
usable is drawn disabled with the reason under it and pressing it does nothing. The rest of the
panel keeps working, because availability is per feature and each control names its feature.

### Panel primitives (`src/features/panels/primitives/`)

- `PanelFrame` — title, the one notice, and a scroll container. Provides a `PanelContext` holding
  the `panelLinkStatus` result and `now`, so primitives never recompute it.
- `Readout` — label, value, unit. Muted with "not live" when values are not current; "—" when
  there is no sample; "not available on this aircraft" when its DataRef is `missing` (the F-03
  rule already in `TelemetryPanel`).
- `ControlButton` — the only way a panel renders a pressable control. Takes the feature it acts
  for and the binding name it targets, disables itself from `PanelContext` and
  `controlAvailability`, shows the reason, shows the target's failed outcome through
  `FailureNotice`, and enforces the touch rules. Optional `confirm` turns on the confirmation rule.
- `ValueEntry` — a numeric text field with a Set button (a `ControlButton`), validation in the
  pilot's words, used by the heading panel and by the radio and autopilot panels later.

### Touch rules (R4)

In `src/theme/tokens.ts`, shared by both device classes: `touch.minTarget = 48` and
`touch.spacing = 8` (dp).

48 is Material's minimum and above Apple's 44 pt. The research's complaint is about controls too
small to hit without looking; a pilot's eyes are on the monitor, so both platforms get the larger
of the two guidelines, and a tablet does not shrink controls because it has room — it shows more.
A control that writes or commands is at least as large as a readout row, which `ControlButton`
guarantees because readout rows are shorter than 48.

`ControlButton`, `ValueEntry`'s field, the switcher items, the link status bar and the Setup
switches all apply these values. A guard test renders the shell with every registered panel as the
route, on a phone and a tablet in both orientations, and fails if any node with `accessibilityRole`
`button`, `switch`, `radio` or `tab` has a flattened minimum height or width under 48. Setup's
existing form buttons (Connect, Pair, Retry, Share) are platform `Button`s and outside the guard:
they are not panel controls, and restyling them is not F-04's work. A panel that cannot meet the rules on a phone declares
itself tablet-only instead of shrinking.

The Setup chips in `ThemeToggle` rise to the same size.

### Confirmation for disruptive controls

`ControlButton` with `confirm` needs two presses within 3 s: the first arms it, relabelled
"Tap again: {label}", and the second acts. It disarms after 3 s or when it becomes disabled.
Two presses rather than a modal because a modal steals focus from a pilot flying with the other
hand and has no sensible web equivalent. No F-04 control is disruptive; the rule exists now so the
autopilot disconnect (F-20) and emergency squawks (F-22) do not each invent one.

### Operations reported against their control (R9, R10)

The session's two special-purpose operations become generic:

```ts
write(featureId: string, name: string, value: DataRefValue): Promise<void>;
activate(featureId: string, name: string, durationSec?: number): Promise<void>;
```

Each checks that `name` is a binding of `featureId` in the active profile (a `write: true` binding
for `write`), that it resolved, that the feature is usable and that the link is connected.
`writeHeading`, `activateHeadingUp` and the 0–360 range check leave the session; the range check
moves into the heading panel's `ValueEntry`, which is where plain-language validation belongs.

`snapshot.lastOperation` is replaced by `snapshot.operations`, keyed by binding name:

```ts
export interface OperationOutcome {
  status: 'pending' | 'ok' | 'failed';
  /** An AvionixError-derived failure; rendered only through FailureNotice. */
  failure: FailureRef | null;
  /** A refusal before anything was sent. */
  refusal: 'notConnected' | 'unavailable' | null;
  at: number;
}
```

`ControlButton` reads the outcome for its own target, so a failure is shown against the control
that caused it and nowhere else. A pending outcome disables the control until it settles, which
stops double sends. A refusal renders from a fixed table of plain-language copy. Nothing
optimistic is displayed: a control's value comes from `telemetry` only, so after a failed write the
readout still shows what the simulator reports (R10). A successful write shows no confirmation of
its own; the readout changing is the confirmation.

`UNAUTHORIZED` from a write or command still returns the session to pairing, as today.

### Subscriptions follow the visible panel (R3, R12)

The session gains `setDemand(featureIds: readonly string[])`. The shell calls it with the active
panel's features whenever the route or the fitting panel changes, and with `[]` on Setup. Until
the first call the demand is `null`, meaning every resolved DataRef, which is today's behaviour and
what a consumer without panels (the tests, a headless client) still gets.

The DataRef names the session keeps subscribed are:

- the three identification DataRefs (they announce an aircraft change, F-03);
- the `connection-health` feature's DataRefs (the heartbeat and pause flag, F-02);
- the DataRefs of every demanded feature, read from the **active profile**, so a named profile
  with different names needs no change here.

The subscribed ids are the resolved ids of those names. On every change of demand or of bindings
(connect, reconnect, aircraft re-check), the session reconciles the socket against that set with
the delta order F-03's re-check already uses: subscribe the added ids first, then unsubscribe the
removed ones, recording each step as it lands. Reconciliations run one at a time per connection,
queued; each reads the demand current when it starts, so a burst of switches ends in exactly the
last panel's set and the earlier queued runs find nothing left to change.

Which updates the session accepts is a separate map, `streamById`, not the installed bindings:
an added id enters it *before* its subscribe request is sent, because X-Plane's first update after
a subscribe carries the value even if it never changes again, and the order of that update and the
subscribe reply is not documented. Dropping it would leave a static value blank until it moved. A
removed id leaves the map before its unsubscribe is sent, so a late update cannot resurrect a
pruned value. A failed subscribe takes its ids back out.

Values a switch keeps are not touched, so they neither blank nor re-subscribe (R3). The switch
itself renders synchronously from the store and waits for nothing on the network. A value
unsubscribed on a live connection is pruned from `telemetry`, so a panel shown again never
presents an old number as fresh; X-Plane sends every subscribed value in the first update after a
subscribe, so the value returns within one update cycle (R12). While disconnected, `setDemand`
only records the demand, and the next connect subscribes from it.

The F-03 re-check's `subscribedIds` bookkeeping moves into this routine; the re-check installs the
new bindings and then reconciles.

### Keeping the screen awake (R5)

`shouldHoldScreenAwake({ foreground, linkState, onPanel })` is true exactly when the app is in the
foreground, a panel (not Setup) is the route, and the link is `connected` or `reconnecting`.
Reconnecting holds because a tablet sleeping during a Wi-Fi blip on short final is the failure the
user story names. Disconnected, error and pairing release it.

`useScreenKeepAwake` applies that through `src/platform/keep-awake.ts`, a thin wrapper over
`expo-keep-awake` (`activateKeepAwakeAsync` / `deactivateKeepAwake` with the tag
`avionix-panel`). `expo-keep-awake` ships in Expo Go, so this needs no development build. On the
web it uses the Screen Wake Lock API where the browser has one; a refusal is caught and logged at
debug level, never shown. Unmounting releases the hold.

### Night presentation (R6)

Night is a **third palette**, not a modifier on dark: `ThemeMode` becomes
`'light' | 'dark' | 'night'`, and `themeForMode`'s `Record<ThemeMode, Theme>` makes the addition a
compile-checked one, which is what the theme architecture anticipated.

The palette's contract, enforced by a unit test rather than by taste:

- the background is black (`#000000`), so an OLED screen is dark rather than dark grey;
- no colour in the palette has a relative luminance above 0.30, so nothing glows white;
- body text and muted text keep at least 4.5:1 and 3:1 contrast against the background and the
  surface, so dim does not become unreadable;
- `danger` and `success` stay distinguishable from each other and from text.

Warm, dim text on black is what cockpit night lighting and EFB night modes converge on; it keeps
a darkened room dark and does not ruin the pilot's view of a dim monitor.

The preference gains two values: `system | auto-night | light | dark | night`, labelled System,
System (night), Light, Dark, Night (System keeps its existing label and accessibility name). `system` follows the device between light and dark as today;
`auto-night` follows the device between light and **night**, which is the "can follow the device"
half of R6. Stored under the existing `avionix.theme` key; the schema accepts every old value, so
no migration. `ThemedStatusBar` uses light content for dark and night; `ThemedTextInput` maps
night's keyboard appearance to `dark`.

### Errors never reach a panel raw (R11)

Nothing new is allowed to render `AvionixError.message`: panel failures go through
`ControlButton` → `FailureNotice(code, step)`. The error-text guard test gains a case that renders
every registered panel with every error code as an operation failure, so a future panel that
renders raw text fails the build.

## Session snapshot changes

- `lastOperation: LastOperation | null` → `operations: Readonly<Record<string, OperationOutcome>>`
  (empty at start; reset by `connect()`; kept across a dropped link so the pilot can still read why
  a control failed).
- `telemetry` is no longer cleared by `disconnect()` or a reconnect attempt.

`SessionApi` swaps `writeHeading` and `activateHeadingUp` for `write`, `activate` and `setDemand`.

## File plan

| Area | Files |
|---|---|
| Domain | `src/domain/panels/panel.ts`, `device-layout.ts`, `panel-link.ts`, `control-availability.ts`, `keep-awake-policy.ts` |
| Application | `src/application/panel-layout.ts` (store + load/save); `simulator-session.ts` (generic operations, demand, reconcile, telemetry retention); `session-snapshot.ts` (`operations`) |
| Platform | `src/platform/keep-awake.ts` |
| Theme | `tokens.ts` (night palette, `touch`), `theme-preference.ts` (two new values), `ThemeToggle.tsx`, `primitives.tsx` |
| Hooks | `usePanelLayout.ts`, `useDeviceLayout.ts`, `useScreenKeepAwake.ts`; `useSimulatorSession.ts` |
| Shell | `src/features/shell/AppShell.tsx`, `PanelSwitcher.tsx`, `SetupScreen.tsx`, `PanelChooser.tsx` |
| Panels | `src/features/panels/registry.ts`, `primitives/{PanelFrame,Readout,ControlButton,ValueEntry}.tsx`, `basic-data/BasicDataPanel.tsx`, `heading/HeadingPanel.tsx` |
| Deleted | `src/features/mvp/` (`MvpScreen`, `TelemetryPanel`, `ControlPanel`) |
| Docs | `docs/architecture.md` (panels section, data flow), `README.md`, `docs/testing/xplane-smoke-test.md` (device rows) |

## Testing

- **Unit (node):** `deviceLayout` boundaries (599/600, square); `panelFit`; every row of the
  `panelLinkStatus` table; `controlAvailability` for all four statuses; `shouldHoldScreenAwake`
  truth table; layout load/save (unknown ids dropped, corrupt JSON → defaults, last-panel
  fallback); night palette contract; theme preference round-trip for all five values.
- **Session (node):** generic `write`/`activate` — success, `AvionixError` failure keyed to the
  target, refusals for not connected, unknown name, name outside the feature, non-writable binding
  and unusable feature, `UNAUTHORIZED` → pairing, pending while in flight. `setDemand` — the wanted
  set, a switch that keeps a shared id sends no unsubscribe or subscribe for it, added-before-
  removed order, a burst of demand changes coalescing to the last, pruning on unsubscribe, demand
  set while disconnected applied on connect, a re-check reconciling against the current demand.
  Telemetry retained on disconnect and across reconnect attempts, cleared on `connect()`.
- **Integration (mock X-Plane):** switching panels changes the server's subscription set by the
  delta only; a rejected write reports against its control and the readout keeps the server value;
  a missing binding disables only its control.
- **UI (expo project):** shell restores the last route; switcher omits unsupported panels and
  shows the rotate notice; rotating mid-entry keeps the heading draft; the one-notice-per-panel
  rule for each link row; a disabled control shows its reason; confirmation arms, fires and
  disarms; the touch-target guard over every panel and the shell in four combinations; the error
  text guard over every panel.
- **Web project:** the shell renders and switches panels under react-native-web.
- **Device (user):** new smoke-test rows for keep-awake, rotation, night presentation, both device
  classes, and the last-panel restore.

## Requirement coverage

| Req | Where |
|---|---|
| R1 declared combinations only | `panelFit`, shell switcher filter, rotate notice |
| R2 rotation preserves state | keyed content in a direction-switching container; UI test |
| R3 fast switch, shared values untouched | synchronous render; `setDemand` delta |
| R4 touch rules | `touch` tokens, `ControlButton`, guard test |
| R5 keep awake | `shouldHoldScreenAwake`, `useScreenKeepAwake`, `platform/keep-awake` |
| R6 night presentation | night palette, `auto-night` preference |
| R7 not live / disconnected | `panelLinkStatus`, `PanelFrame`, `Readout`, telemetry retention |
| R8 unavailable control | `controlAvailability`, `ControlButton` |
| R9 failure against the control | `operations` keyed by target, `ControlButton` |
| R10 no optimistic display | values from `telemetry` only; integration test |
| R11 no raw errors | `FailureNotice` route; error-text guard over panels |
| R12 hidden panels unsubscribed | `setDemand`, pruning, first-update-carries-all |
| R13 persisted selection and last panel | `panel-layout.ts` |

## Decisions and rationale

1. **No navigation library.** Routes are one state value in the shell. React Navigation would add
   native dependencies, a second source of truth for the route, and remount semantics that fight
   R2, to get transitions and a back stack the panel model does not have.
2. **48 dp minimum on both device classes, 8 dp spacing.** The larger of the platform guidelines,
   because the complaint is controls too small to hit without looking.
3. **Night is a third palette.** A modifier on dark would still carry dark's bright text and
   primary; night's constraints (black background, luminance cap) are a different palette.
4. **Paused counts as live for panels.** Pilots set up the aircraft while paused.
5. **Last known values are kept after the link drops.** Required by F-04's scope; safe now that
   every readout is marked not live.
6. **Subscriptions follow the visible panel only.** The simplest rule that satisfies R12 and bounds
   the load at one panel's worth, whatever the number of panels the pilot keeps. It also answers
   the feature's open question about how many panels can subscribe at once: one.
7. **Pruning an unsubscribed value.** "—" for one update cycle is honest; an old number shown as
   current for the same cycle is not.
8. **Hidden ids persisted, not visible ones.** New panels appear by default.
9. **Switcher: bottom bar in portrait, side rail in landscape.** One touch to any panel, which is
   the user story; landscape keeps vertical space for content.
10. **Two-press confirmation, 3 s.** No modal while flying, works the same on the web.
11. **Keep awake while reconnecting.** The link usually returns within the backoff budget.
12. **Web behaves like a device of its window's size.** No orientation lock and a best-effort wake
    lock, which answers the feature's web question.
13. **No interpolation above 10 Hz.** Nothing in Stage 1 needs it, and interpolated values are a
    guess drawn as a reading.

## Deliberately not done

- **Panel drafts across a switch.** Keeping every visited panel mounted would re-render hidden
  panels at 10 Hz. Rotation is covered; a draft abandoned by switching away is gone.
- **Reordering panels.** Catalog order serves two panels; reordering arrives with F-06/F-07, where
  layouts become the user's own.
- **Two panels side by side on a tablet.** That is F-07's multi-device layout work.
- **Brightness control and orientation lock.** Neither is in F-04's requirements.
- **A disruptive control in F-04 itself.** The confirmation rule ships tested, used first by F-20.
- **Profile-driven binding roles.** Panels still name generic DataRefs, as F-03 recorded; roles
  arrive with the first named profile.

## Open questions

None blocking. The feature file's five are answered by decisions 2, 3, 12, 6 and 13.
