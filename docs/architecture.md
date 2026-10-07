# Architecture

## Layers

| Layer | Directory | Depends on | Contains |
|---|---|---|---|
| Domain | `src/domain` | nothing | `AvionixError`, connection config validation, URL derivation, the connection state table, API version negotiation, simulator types, the `SimulatorClient` port, the `ServiceBrowser` port, `DiscoveredConnector`, aircraft profiles, identification and availability, panel rules (device layout, panel fit, link status, control availability, keep-awake policy) |
| Infrastructure | `src/infrastructure` | domain | zod schemas and mappers for X-Plane payloads, `HttpTransport`, `WebSocketTransport` + `RequestManager`, `XPlaneClient`, `ConnectorClient`, logging, AsyncStorage adapter, `ZeroconfServiceBrowser` and the null browser |
| Application | `src/application` | domain, infrastructure | `SimulatorSession` (connect flow, diagnostics, telemetry, reconnect), `PairingTokenStore`, `Store`, snapshot types, settings, `ConnectorDiscovery`, `panel-layout`, `subscription-demand` |
| UI | `src/app`, `src/hooks`, `src/features` | application | composition root, React context, hooks, plain React Native components |
| Platform | `src/platform` | infrastructure | the only platform-specific code: the web connection default, the `ServiceBrowser` factory (`service-browser.ts` for native, `service-browser.web.ts` for the web), the keep-awake wrapper, the haptics adapter (`haptics.ts` for native, `haptics.web.ts` for the web) and the CDU's physical-keyboard adapter (`hardware-keys.ts` for native, a no-op; `hardware-keys.web.ts` for the web, a `keydown` listener) |

Dependencies point downwards only. `src/domain` and `src/application` never import React or
React Native; `tests/unit` and `tests/integration` run them in plain Node.

## Why the simulator is isolated behind an abstraction

The application layer talks to `SimulatorClient`, a small interface in `src/domain/simulator`.
`XPlaneClient` is the only implementation today and speaks the X-Plane Web API. Keeping the
protocol behind that port means:

- the connect flow, diagnostics, reconnect policy and UI are testable with a fake client;
- a future X-Plane plugin transport, another simulator, or a local bridge can be added without
  touching the session or the screens;
- protocol details (paths, `req_id` correlation, zod schemas) live in one place and are covered by
  contract tests built from the official documentation payloads.

## Data flow

```
SetupScreen (in AppShell) → useSimulatorSession().connect(host, port)
  → SimulatorSession.connect
      1. validate host/port                       (domain)
      2. GET /avionix/info                        (ConnectorClient)
         → no connector: continue (connector: direct); pairing needed: state = pairing until pair(code);
           connector ready: continue (connector: paired)
      3. GET /api/capabilities                    (HttpTransport)
      4. negotiateApiVersion                      (domain)
      5. XPlaneClient.connectWebSocket            (WebSocketTransport)
      6. state = connected
      7. GET /api/v3/datarefs/count                (readiness gate; 0 → hold, no probing)
      8. identify the aircraft, select a profile, probe every name it declares
      9. dataref_subscribe_values                  (WebSocket; identification, health and the
                                                     visible panel's features — setDemand)
     10. dataref_update_values → DataRefUpdate[] → snapshot.telemetry
  → Store notifies → useSyncExternalStore re-renders the screen
```

Every step updates `snapshot.diagnostics`, so a failure is visible at the exact step.

## Connector discovery

```
SetupScreen → useConnectorDiscovery(sessionState)
  → foreground && (disconnected | error) ? discovery.start() : discovery.stop()
  → ConnectorDiscovery.browse('avionix')            (ServiceBrowser port)
      resolved(service) → discoveredConnectorFrom   (domain: IPv4 first, else hostname; TXT pairing)
      removed(name)     → drop the row
      error             → snapshot.error, scanning = false, list kept
  → Store<DiscoverySnapshot> → DiscoveredConnectors rows
  tap → settings.setConnection(host, port) + session.connect(host, port)
```

`ServiceBrowser` is a port with two implementations. `ZeroconfServiceBrowser` wraps
`react-native-zeroconf` and validates every resolved payload with zod; the null browser carries an
availability tag (`needsDevBuild` in Expo Go, where the native module is absent; `unsupported` on
the web) so the screen can explain itself. `src/platform/service-browser.ts` chooses at composition
time by checking `NativeModules.RNZeroconf`; the `.web.ts` twin never imports the library, so the
web bundle does not carry it. `ConnectorDiscovery` keys rows by DNS-SD instance name (removal events
carry only the name), sorts them, clears the list on `stop()` (a PC that went away while the app was
in the background must not look present), and guards every callback with a generation counter.
Discovery never calls `/avionix/info`: the existing probe on connect remains the compatibility check.

## Connection state machine

`src/domain/connection/connection-state.ts` holds the only legal transitions:

```
disconnected --connect--> connecting --connected--> connected
connecting --failed--> error          connecting --disconnect--> disconnected
connected --socketLost--> reconnecting --connected--> connected
reconnecting --retryExhausted--> error   reconnecting --disconnect--> disconnected
connected --disconnect--> disconnected   error --connect--> connecting
connected --failed--> error
error --disconnect--> disconnected
connecting --pairingRequired--> pairing --pair--> connecting
reconnecting --pairingRequired--> pairing   connected --pairingRequired--> pairing
pairing --disconnect--> disconnected
```

`pairing` is reached in two cases. First, the connector probe (initial connect only, so from
`connecting`) finds an Avionix Connector that requires a code while the app holds no token for it.
Second, a connector rejects a token the app does hold (`UNAUTHORIZED`): this can happen from
`connecting` (capabilities refused during the first connect), from `reconnecting` (refused during a
reconnect attempt; the probe is not repeated there), or from `connected` (an authenticated write or
command fails). In the second case the session clears the stored token and cancels the reconnect
scheduler. Both cases leave the session waiting for `SimulatorSession.pair(code)` or `disconnect()`.

The `connected → error` edge exists because the session reports `connected` as soon as the socket
opens (spec step 9); DataRef resolution and subscription happen afterwards and can still fail.

Reconnect uses exponential backoff (1 s, 2 s, 4 s, 8 s, 16 s, ±20 % jitter, 5 attempts) and reruns
the whole connect flow, including capabilities and name resolution, because X-Plane may have
restarted and DataRef ids are session-specific.

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

A flight can be unloaded while the probe is still running, and X-Plane tears its DataRef table
down and rebuilds it when that happens, so a pass that lands mid-rebuild can come back with
nothing resolved even though the profile fits the aircraft. The session tells that apart from a
genuine mismatch by re-checking `datarefs/count`, but only when **no DataRef resolved**: a resolved
command is not evidence either way, because a command survives a flight unload in X-Plane's command
table, so counting one would make the mid-probe-unload case unreachable. A zero re-count parks the
connection in the same readiness hold as the initial gate; a non-zero re-count means the aircraft
genuinely does not have the profile's names, and the probe's results stand.

A name that does not resolve costs its **feature**, never the connection: `deriveFeatureAvailability`
turns the per-name results into `available` / `partial` / `unavailable`, and a surface whose feature
is not `available` renders inert with the reason. The connect still fails on transport, capabilities,
WebSocket and subscription errors.

The identification DataRefs are subscribed like any other value, so a new aircraft arrives as an
ordinary update; the session debounces that for 250 ms and re-runs phases 2 to 4 on the open
connection, reconciling the subscription as a delta. The same no-DataRef-resolved check guards this
ongoing pass: one that lands mid-rebuild keeps the last good result rather than unsubscribing every
id and reporting an unidentified aircraft with nothing left to prove otherwise.
`recheckCompatibility()` is the same pass on demand, behind the "Check again" button.

`isWritable` is reported only by X-Plane 12.4.3 and newer. An explicit `false` on a binding the app
writes to makes the feature unavailable; an absent flag is treated as writable, and the view says
write capability was not reported.

## Panels

`AppShell` is the root under the providers: the link status bar pinned at the top, the active
panel or Setup below it, and a switcher (a bottom bar in portrait, a side rail in landscape).
Routes are one persisted value (`avionix.panels`: hidden panel ids and the last route), not a
navigation library, and rotation only moves the switcher, so a panel and a half-typed entry
survive it. Android draws edge to edge, and iPhones have a notch or Dynamic Island and a home
indicator, so the shell reads `useSafeAreaInsets()` (`SafeAreaProvider` wraps the app): the status
bar clears the top, the portrait bar the bottom, the landscape rail the left edge and the panel
the right. Tapping the status bar opens Setup with the diagnostics at its top, above the
connection form.

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
  outcome from `snapshot.operations`. Enabled is a filled button, disabled an outline, so the two
  differ in shape and not only in shade (the night palette has little shade to spare).
- `ValueEntry` accepts a plain decimal only (a minus sign only where the range allows one) and
  validates it in the pilot's words before `ControlButton` sends it.

Controls act through `SimulatorSession.write(featureId, name, value)` and
`activate(featureId, name)`, which refuse any name that is not a binding of that feature in the
active profile. Outcomes are keyed by binding name, reset by `connect()`, and never carry error
text: a failure is a `{ code, step }` pair rendered by `FailureNotice`.

**Held commands (F-24 §4.3).** Trim and the starters are held rather than pressed.
`PanelActions.hold(featureId, name, phase)` (`phase: 'press' | 'renew' | 'release'`) sits beside
`write` and `activate`; `PanelScopeActions` makes it optional (`Partial`), so a scope that never
holds a command — the flight data strip — can leave it out and get `REFUSE_HOLD` instead.
`SimulatorSession.holdCommand` resolves the binding and records a store outcome only on `press`,
the way `activate` does, remembering the command id and the connection's generation; a `renew` or
`release` resends that same id with no fresh lookup, and either is refused once the generation has
moved on, so a hold never resumes after a reconnect (R5). Neither a renewal nor a release records a
success in the store — only `press` and a failure do — because a held key renews five times a
second and must not churn the panel at that rate. A pure `HoldLease` (`src/domain/panels/hold-lease.ts`,
an injected clock and timers, like the CDU key queue) owns the mechanics: a 0.5 s lease renewed
every 200 ms, a configurable cap (10 s trim, 30 s starter), a 250 ms minimum so a tap — and a screen
reader's single `onPress` — still nudges, and a best-effort release sent on every end, including
cancellation. `useHoldControl` (`src/features/panels/primitives/useHoldControl.ts`) builds one lease
per `(featureId, command)` while the app is foregrounded and the link's controls are enabled,
replacing it (and ending any hold in flight) whenever either changes, and turns the lease's end into
one of this panel's sentences: capped, no response (held at least a second and the driven value
never moved), backgrounded, or link lost. `ControlButton` gained a `hold` prop (`onStart`, `onEnd`,
an optional armed legend) instead of a second primitive, so every existing rule — availability, the
48 dp target, the confirm arm, haptics, notices — stays in the one control: press-in starts the hold
and press-out ends it; a screen reader's single `onPress` nudges once (start then end); with
`confirm`, a first tap arms the key and only an armed key can be held (the starter's "Hold to
start").

The shell calls `setDemand` with the visible panel's features. The session keeps identification,
connection health and those features' DataRefs subscribed, reconciling the socket as a delta
(added before removed, one change at a time; a re-check installs its new bindings under the same
lock, and a failed change is retried by the next `setDemand`, even with the same demand). A value
it stops carrying is pruned, and comes back
in the first update after it is subscribed again. Last known values survive a dropped link, so a
panel still shows them, marked not live.

While a panel is on screen and the link is connected or reconnecting, the screen is held awake
through `expo-keep-awake` (a wake lock on the web, best effort; holds and releases run one after
another, so a release never races a wake-lock request still in flight). Night is a third palette: black
background, nothing brighter than a relative luminance of 0.30.

## Flight data

`flight-data` and `gps-destination` (`src/domain/aircraft/profiles/generic.ts`, profile version
1.1.0) are two more profile features, read by the Flight data panel and the docked strip that
replace the interim Basic data panel. Every binding in both is `required: false`: several names
(the three GPS ones, and the pause flag `connection-health` already binds) are community-sourced
rather than confirmed against Laminar's `DataRefs.txt`, so a wrong or absent name degrades only its
own field instead of the whole feature (see `docs/xplane.md`).

**Freshness is the link's, not the value's.** X-Plane's WebSocket streams only values that changed
(delta-only after the first update), so a steady fuel reading or a constant OAT arrives once and
never again — its `receivedAt` says when it last changed, not whether it is still true. Marking each
value stale by its own timestamp would call a perfectly current reading "stale" after a couple of
quiet seconds. Instead every value's freshness is F-02's heartbeat freshness, the same
`panelLinkStatus` every other panel already uses: current while the link is live, muted and marked
"not live" together the moment the heartbeat falls behind.

**The badge.** `simulatorBadge(state, activity, inReplay)` (`src/domain/flight-data/sim-state.ts`)
returns `'paused' | 'replay' | null`: replay wins over paused (a replay is usually paused too, and
"replay" is the word that explains the numbers), and only a connected link can show either — a
remembered replay flag surviving a dropped link would be stale news, not a badge. Pause status comes
from `connection-health`'s own `activity === 'paused'`, never a second read of the pause flag, so the
strip's badge and the status bar can never disagree.

**Units.** `src/domain/units/units.ts` is the one conversion and formatting module for fuel (kg/lb),
temperature (°C/°F) and distance (nm/km); speeds and directions stay in knots and degrees, which is
what every pilot-facing instrument uses. `src/application/unit-preferences.ts` persists the choice
under `avionix.units` (zod-validated, defaults kg/°C/nm, a corrupt or unknown field falls back on its
own, the same best-effort contract as the theme preference). `UnitsProvider` mounts inside `AppShell`
and exposes `useUnits()`; Setup's **Units** section, after Display, offers each unit as a row of
radio chips. The Flight data panel, the strip, and later the moving map (F-13) and flight recorder
(F-14) all read the same preference through the same functions, so no two screens can disagree about
a number.

**The docked strip.** `FlightDataStrip` renders one row of four values — ground speed, wind, fuel,
sim zulu — plus the badge, mounted by `AppShell` between the status bar and the body on every panel
route except Setup (no demand there), Flight data itself (it would repeat the panel) and the CDU
(`STRIPLESS_PANELS`; the CDU's own glass already fills the screen with numbers, and the strip would
crowd the scratchpad on a phone). The whole row is one pressable at least 48 dp tall that opens
Flight data, or a plain (non-pressable) view when
Flight data is hidden from the switcher. Its visibility is a setting, `strip: boolean` in
`avionix.panels` (default `true`), toggled from Setup → Panels ("Show the flight data strip on every
panel"). The shell's `setDemand` call is the union of the active panel's own features and, only while
the strip is visible, `flight-data`: the strip costs its DataRefs solely when it is actually shown,
the same demand discipline every other panel follows.

**Retiring Basic data.** The interim Basic data panel is gone; Flight data takes its place, first in
the registry. `normaliseLayout` (`src/application/panel-layout.ts`) carries a small
`RETIRED_PANEL_IDS` map (`{ 'basic-data': 'flight-data' }`): a stored `last` entry for a retired id
is rewritten to its successor before unknown ids are dropped, so a pilot who last had Basic data
open reopens on Flight data instead of being thrown back to Setup. The mapping only applies to
`last`, and only when the id is not itself still a known one, so a panel is never redirected out
from under itself while it is still registered. A retired id in `hidden` is not rewritten — it is
simply dropped, like any other unknown id, so a hidden Basic data never carries over as a hidden
Flight data; the new panel appears by default.

## Instruments

`src/domain/instruments/` holds every instrument calculation as pure, tested functions with no
React and no simulator types: `geometry.ts` (dial angles, hands, tape windows and ticks, the
attitude transform, turn and slip offsets), `speed-markings.ts` (V-speed validation to arcs and
bands, or none), `baro.ts` (pressure conversion, formatting, STD, range and step), `presentation.ts`
(the six-pack/PFD choice, the aircraft key, the engine-type default) and `labels.ts` (the one
accessible label builder both presentations share).

`useInstrumentValues` (`src/features/panels/instruments/`) reads the snapshot once per render and
reduces it to primitives — numbers, booleans, short strings — so every instrument is a
`React.memo` component whose props never carry the snapshot itself: a change to the altitude alone
re-renders only the altimeter or altitude tape, never the other five.

`InstrumentFace` is the one frame every instrument renders through, in four states: unavailable (a
DataRef it needs is missing), no value (`value === null`), live, and not live (last pointers and
digits kept at 40% opacity under a red X). A face under 100 dp wide or 48 dp tall is compact — the
PFD's narrow tapes and scales — and drops the "NOT LIVE" flag and shortens the unavailable note to
"N/A", since neither fits; the red X alone then carries the stale state, and accessible labels are
unchanged.

The presentation choice persists under **`avionix.instruments`**, loaded and saved by
`InstrumentPreferencesProvider`, which mounts in `AppShell` beside `UnitsProvider`. The altimeter
setting reads and writes a new `pressure` unit (`inHg` | `hPa`) in the same shared units module as
fuel, temperature and distance (F-11), so every screen that shows a pressure agrees. `ControlButton`
gained a `quiet` prop: a control that shares its target with siblings already showing the
availability reason and the outcome (the altimeter's −, + and STD buttons, and its typed entry) sets
it so the same sentence is not repeated under every button.

**No smoothing** is a project-wide rule, not only an instruments one: every value is drawn exactly
as received, never interpolated between samples or extrapolated past the last one, so a needle can
never keep moving on a dead link (R2, R7).

**Autopilot targets on the PFD.** The Instruments panel descriptor now also declares the
autopilot's selectors, its six mode features and AP, flight director and autothrottle, so the shell's
demand subscribes to them while Instruments is on screen; a feature an aircraft lacks just leaves
its cue off the PFD; the panel never becomes unavailable for want of an autopilot.
`src/domain/instruments/bugs.ts` is the pure geometry behind the cyan target bugs: `tapeBug` parks
an off-scale altitude or speed bug half under the selected-value box at the top of its tape and
half off the tape's bottom edge below, rather than fully inside where it would read as on-scale;
`headingDelta` is the signed short way around the compass, so the heading bug wraps correctly
through 360/0. `PfdView` renders the same `Fma` strip, in its `compact` form, above the tapes
whenever any autopilot feature is available, and `pfdWidth` takes `FMA_HEIGHT` out of its height
share so the whole PFD shrinks to keep the FMA inside the panel's height budget instead of crowding
out the altimeter controls.

## Radios and transponder

`src/features/panels/radios/` is the Radios panel (F-21, F-22): COM1, COM2, NAV1 and NAV2, each a
`RadioSpec` (`radios.ts`) naming its active, standby and swap bindings, with NAV1 and NAV2 adding an
optional identifier, DME and course; and the transponder's squawk code, mode and IDENT
(`TransponderSection`). Seven profile features back them — `com1`, `com2`, `nav1`, `nav2`,
`transponder-code`, `transponder-mode`, `transponder-ident` — so a name missing or read-only on one
radio or one transponder control disables only that control, the rest keep working, by the same
probe described under Aircraft compatibility. `src/domain/radios/` holds every calculation as pure
functions with no React and no simulator types: `channels.ts` (the COM `_833` channel table and the
NAV 10 kHz grid, validation, formatting and the 8.33 kHz assumption, unverified pending the device
check, row 74), `squawk.ts` (octal validation, formatting and the three named
emergency codes), `transponder-mode.ts` (the four positions the panel offers against Laminar's
eight-value enum) and `entry.ts` (the keypad's digit-by-digit draft, shared by COM, NAV and squawk
entry). NAV DME is shown to one decimal at every range, in the shared distance unit — a DME arc is
flown by tenths, unlike `formatDistance`'s whole-number rounding, which is tuned for the GPS
distance-to-go.

**Staged entry.** A typed value lives only in the entry pad's draft (`useRadioEntry`), never written
until Set; the draft is dropped, not carried, the instant controls disable (a dropped link, a
disconnect), so a reconnect can never replay a stale intent with one tap. `RadiosPanel` keys its
content on the aircraft's identity (ICAO type, description, tail number), so a changed aircraft
drops every draft and read-back sentence instead of carrying them onto radios they were never meant
for.

**Read-back.** `src/domain/panels/read-back.ts` holds `readBackVerdict`, the pure decision behind
every write this panel makes: did X-Plane adopt the value, not merely accept the write (some add-ons
accept a write and ignore it). The window (`READ_BACK_MS`, 3 s) counts from `OperationOutcome.at`,
the moment X-Plane accepted the write, not from the pilot's press, so a slow request never eats into
it. `useReadBack` (`src/features/panels/primitives/`, shared with the autopilot panel to come,
F-20) turns that into one watch per target key, evaluated during render on the panel's 1 s clock
rather than a timer of its own, so a sentence can appear 3–4 s after acceptance; each watch settles
exactly once, so a value the pilot later changes by hand in the simulator can never produce a late
"did not take" sentence.

The panel switches to two columns, the keypad beside the radio stack, once its measured content
width reaches `TWO_COLUMN_MIN_WIDTH` (720 dp); narrower, the keypad sits below the stack, so a phone
in portrait or landscape is never asked to fit a readable frequency and a thumb-sized keypad side by
side.

## Autopilot

`src/features/panels/autopilot/` is the Autopilot panel (F-20): `AutopilotPanel` lays out
`Annunciator`, `EngageRow` and `ModeButtons` in one column and the four selectors (`SelectorRow`,
one per selector, each opening `SelectorPad` when it is being typed) in a second once the panel's
measured width reaches `TWO_COLUMN_MIN_WIDTH`, narrower stacking everything in one column.
`autopilot.ts` holds the panel's two lookup tables: `SELECTORS`, four `SelectorSpec`s (heading,
altitude, vertical speed, airspeed) each naming its DataRef and feature, and `MODES`, six
`ModeSpec`s (HDG, NAV, APR, ALT, VS, FLC) each naming its `*_status` DataRef, its toggle command,
and whether its "did not engage" sentence should mention the navigation source (NAV and APR).
Twelve profile features were added for the panel — `autopilot-engage`, `flight-director`,
`autothrottle`, `altitude-select`, `vertical-speed-select`, `airspeed-select`, and the six
`ap-mode-*` features (profile version 1.4.0) — plus `heading-control`, reused from the retired
Heading panel, so a name missing or read-only on one control disables only that control, by the
same probe described under Aircraft compatibility.

`src/domain/autopilot/` holds every calculation as pure functions with no React and no simulator
types: `selectors.ts` (formatting, stepping, limits and the read-back predicate for each of the
five `SelectorKind`s — heading, altitude, vertical speed, knots and Mach, the airspeed selector
being knots or Mach depending on X-Plane's own flag), `selector-entry.ts` (the keypad's
digit-by-digit draft, validation and range messages, the same shape as the radios' entry but its
own limits and no snapping), and `modes.ts` (`modeState`, reading X-Plane's `*_status` convention —
0 off, 1 armed, 2 captured — into `off | armed | engaged`, and `annunciationText`, which reduces
all nine status DataRefs plus `autothrottle_enabled` to one line read like a flight-mode
annunciator, e.g. "HDG · ALT · Armed NAV, GS · A/T SPD", or "No modes engaged").

**State comes only from the simulator.** Every annunciation and selector value is read from
`*_status` DataRefs (`heading_status`, `nav_status`, `approach_status`, `glideslope_status`,
`altitude_hold_status`, `vvi_status`, `speed_status`, plus `roll_status` and `pitch_status`) and
from `servos_on` (autopilot engaged), `flight_director_command_bars_pilot` (flight director) and
`autothrottle_enabled` (autothrottle armed and engaged); the panel never infers a state from having
sent a request (R5).

**Engagement.** AP, FD and autothrottle each have an idempotent command pair in X-Plane —
`servos_on`/`servos_off_any`, `fdir_command_bars_on`/`_off`, `autothrottle_on`/`_off`,
`autothrottle_arm`/`_hard_off` — so `EngageRow` always sends the command for the state it wants,
never a toggle, and a stale display can never flip the wrong way. The six modes have no such pair
in X-Plane; `ModeButtons` activates the one toggle command each one has (`sim/autopilot/heading`,
`NAV`, `approach`, `altitude_hold`, `vertical_speed`, `level_change`) and reads the result back
from its own `*_status` DataRef rather than assuming the press took.

**Read-back.** Every write and every mode press is watched the way the radios are
(`src/domain/panels/read-back.ts`, `useReadBack`, `READ_BACK_MS` 3 s): did X-Plane adopt the value,
not merely accept the write. The autopilot panel is the first and, so far, only caller of two
additions `useReadBack` gained for it: a watch's own `matches` predicate, used where "half a unit
is the whole range" (Mach, read back within 0.005) or a wrapped value (a heading of 0 read back as
359.9) makes a plain equality check wrong, and `pendingExpected(key)`, the value a still-waiting
watch expects. A selector's steppers compute their next step from `pendingExpected` when a watch is
pending, falling back to X-Plane's own value otherwise, so three quick "+1000" presses on altitude
add 3,000 ft instead of each one landing back on the value X-Plane has not yet caught up to.

**The override.** `sim/operation/override/override_autopilot` is read, never written (R10): while
it reads 1, `AutopilotContent` shows `OVERRIDE_NOTICE` and marks every control invalid, so a plugin
flying the autopilot is never fought by the panel.

**Shared primitives.** `Keypad` (`src/features/panels/primitives/Keypad.tsx`) is the digit grid
`SelectorPad` and the radios' entry pad both render — digits, delete, zero, clear and an optional
sign key — pulled out of the radios panel so a second typed-entry surface does not duplicate it.
`TWO_COLUMN_MIN_WIDTH` (`src/domain/panels/device-layout.ts`, 720 dp) is the same breakpoint both
panels switch their layout on.

**Retiring Heading.** The interim Heading panel is gone; Autopilot takes its place in the
switcher, after Radios. `RETIRED_PANEL_IDS` (`src/application/panel-layout.ts`) now also carries
`{ heading: 'autopilot' }`: a stored `last` entry for the retired `heading` id is rewritten to
`autopilot` before unknown ids are dropped, the same rule that retired Basic data into Flight data,
so a pilot who last had Heading open reopens on Autopilot instead of Setup.

**The FMA.** `src/domain/autopilot/fma.ts` is a pure domain module, with no React and no simulator
types, that both the Autopilot panel and the PFD render through one shared component,
`src/features/panels/autopilot/Fma.tsx`. `fmaColumns(input)` reduces the same `*_status` DataRefs
`modes.ts` already reads (plus `autothrottle_enabled`, `servos_on` and
`flight_director_command_bars_pilot`) into the four-column shape `Fma` draws — autothrottle,
lateral, AP/FD and vertical, each engaged over armed — reusing the `LATERAL`, `VERTICAL` and
`ARMABLE` precedence tables `modes.ts` exports. The vertical column's reference text comes from the
same selector dials the panel already shows: `VS 500FPM` from `vvi_dial_fpm` rounded to 100 and
signed for a descent, or `FLC 120KT` / `FLC M.78` from the airspeed dial. A column shows "—" only
when there is no mode data at all; otherwise an empty cell is blank, as on a real G1000.

Two more pure functions are the FMA's state machines, each driven by a `useFma.ts` hook that keeps
state across renders: `nextBoxState(prev, columns, now)` boxes a column for `FMA_BOX_MS` (10 s)
the moment its active value changes to a new, non-null one, never on first render and never for a
changed reference alone (a new VS target is not a new mode), and a reconnect clears it so nothing
boxes for a value merely seen again after a link loss. `nextDisconnect(prev, ap, valuesCurrent,
now)` detects an AP engaged-to-disengaged transition only while values were current throughout — a
transition seen only because the link dropped and came back does not count — and
`disconnectShowing` keeps it true for `AP_DISCONNECT_MS` (5 s). While it shows, the FMA's AP slot
renders in reverse video (amber fill, dark text), flashing at 2 Hz through an `Animated` loop, or
steady when `useReducedMotion` (`src/hooks/`, reading `AccessibilityInfo.isReduceMotionEnabled`
and its change event) says motion is reduced. `haptics.failure()` fires once when the annunciation
begins (guarded per disconnect, so a haptics-preference change mid-flash does not buzz again); a
tap on the FMA only acknowledges it early. `Fma`'s `compact` prop is the PFD's: smaller text and no
"not live" line of its own; `PfdView` instead wraps it at `NOT_LIVE_OPACITY` while values are not
current, the same fade it gives its Mach, altimeter-setting and radio-altitude boxes.

## Navigation

`src/domain/navigation/` holds the HSI and CDI calculations as pure, tested functions with no React
and no simulator types: `hsi.ts` (`deviationDots` and the 2.5-dot peg, `lateralValid` (R3),
`glideslopeState` (R4, `'valid' | 'flagged' | 'none'`), `toFromWord`, the three `NAV_SOURCES` and
`sourceLabel`/`sourceKind` including GPS2 and unknown values, `bearingPointer` (R7), `dmeText` /
`dmeWords` / `dmeTimeText` (R8), and `markerLit`, inner over middle over outer when two are lit) and
`hsi-geometry.ts` (`cardAngle`, the card-relative angle of a course or bearing, built on the
autopilot's `headingDelta` so both wrap the same way through 360/0, and `deviationOffset`). Course
entry and stepping reuse the autopilot's `heading` selector kind unchanged (`formatSelector`,
`stepSelector`, `parseSelectorEntry`, `selectorMatches`); no new format or step code exists for it.

`src/features/panels/navigation/nav-presentation.ts` is the one place that turns a source or marker
into a colour or word for both faces, so the HSI and the PFD's cues never name or colour the same
needle differently: `needleColour` (Garmin's convention — NAV green via `theme.instrument.navNeedle`,
GPS magenta via `gpsNeedle`; a source Avionix does not recognise claims neither colour),
`lateralName` ("NAV1 course", never bare "course" for a known source), `verticalName` (a GPS path is
a glidepath flagged GP, a radio one a glideslope flagged GS), `deviationWords` (R2: the dots are
spoken, "1.2 dots right" or "full scale left") and `markerColour`/`MARKER_LETTER`.

**The HSI** (`Hsi.tsx`, an `InstrumentFace` with a 240×240 viewBox) stands on the heading alone: a
missing lateral or glideslope binding marks only its own part unavailable rather than hiding the
whole face (`useNavValues`, which applies every validity rule once so no face can ever draw a needle
X-Plane has flagged). A missing deviation binding shows a red `NAV N/A` flag in place of the CDI; a
missing glideslope binding draws no scale but a red `GS N/A` flag (`GP N/A` for a GPS source) where
the scale would be, and reads "glideslope not available on this aircraft" (the PFD shows nothing for
it); a received course with no course value shows a red `CRS` flag in the course's corner and reads
"course not available", so the undrawn CDI is never silently dropped; a missing or unrecognised
source shows `SRC ?` rather than a blank corner. The DME's groundspeed (`110 KT`, "groundspeed 110
knots") is shown under the distance, with the time beside it, and only while the distance is. The navaid identifier
(NAV1's or NAV2's own `*_nav_id`, nothing for GPS) is shown only while the lateral signal is valid,
so a stale identifier can never read as a station being received. The rotating card, course pointer,
CDI bar, TO/FROM triangle, glideslope scale (at `GS_X = 226`, just outside the card ring at radius
104 from its centre 120), bearing pointers and marker box (`hsi-marker-box`, slightly overlapping
the card's top edge by design, like the radio-altitude box on the PFD) are all drawn only from what
`useNavValues` returns; X-Plane's deflection sign is drawn as given, never inverted.

**The NAV control unit** (`NavControls.tsx`) is an `AvionicsUnit` below the HSI: three source keys
(NAV1, NAV2, GPS) that write `HSI_source_select_pilot` with read-back, a caption `SRC GPS2` with no
key lit when X-Plane reports source 3 (`SRC ?` for a value it does not name), a `DisplayWindow`
course window (role `selected`, caption `CRS`) whose course is spoken by its own summary ("Course
270°", plus ", not live" when the link is stale, as the autopilot's `SelectorRow` does) and that opens `CoursePad.tsx`'s keypad through `useCourseEntry` (modelled on the autopilot's
`useSelectorEntry`, but with no `target`/`kind` to track since the course is always the `heading`
selector kind), four steppers (−10, −1, +1, +10) that write `hsi_obs_deg_mag_pilot` directly rather
than activating `sim/radios/obs_HSI_up`/`down` (`docs/xplane.md`), and CTR, which activates
`sim/radios/obs_HSI_direct` and is disabled while the lateral signal is invalid, since there is no
station to centre on; on an aircraft without `obs_HSI_direct` the key stays, disabled, with the
reason under it. Read-back for both the source and the course uses the same `useReadBack`,
`READ_BACK_MS` (3 s) window the radios and autopilot panels use, not a window of its own.

**The Navigation panel** (`NavigationPanel.tsx`) is fourth in the switcher, after Autopilot and
before Flight data (`src/features/panels/registry.ts`). Its descriptor demands the five navigation
features plus `FEATURE_NAV1`/`FEATURE_NAV2` (for the navaid identifier, bound under the radio
features, not any of the five new ones) and `FEATURE_FLIGHT_INSTRUMENTS`/`FEATURE_HEADING_CONTROL`
(for the heading and heading bug the HSI's card and bug need). Like Radios and Autopilot, it is
keyed on the aircraft's identity, so a changed aircraft drops a half-typed course and any read-back
sentence. Narrower than `TWO_COLUMN_MIN_WIDTH` the HSI sits above the NAV unit, capped by height the
same way `pfdWidth` caps the PFD (0.6 of the window height in portrait); wider, the HSI sits left and
the NAV unit right.

**On the PFD** (`NavCues.tsx`), the lateral and glideslope scales and the marker box are drawn as an
overlay over the attitude display, in its own coordinate space, from the same `useNavValues` the HSI
reads — never as the attitude's children — so a missing pitch or roll never removes them and a
missing nav feature never affects the attitude. Lateral is shown only while valid, with a small
source word (NAV1, NAV2 or GPS, in the needle colour) beside the scale so colour is never the only
cue; the glideslope diamond is shown only when `glideslopeState` is `valid`, a red `GS`/`GP` flag
(by source) shows instead when flagged, and nothing shows when there is no glideslope expected at
all. `PfdView`'s accessible attitude label is extended through `describeNavCues`, which speaks each
cue only while it is drawn, in the same vocabulary as the HSI ("NAV1 course 1.2 dots right",
"glideslope 0.5 dots down", "outer marker").

Five more profile features back all of this (`GENERIC_PROFILE` 1.5.0): `nav-deviation` and
`nav-glideslope` are each one feature with every binding required, because a half-drawn needle is
worse than a hidden one; `nav-source` and `nav-course` are their own features, so a miss disables
only the NAV unit's write, never the needles (course direct-to is an optional binding within
`nav-course`: CTR is simply disabled without it); `nav-aids` bundles everything advisory — bearing
pointers, their signal flags, DME and the three marker lights — with no binding required, so a miss
drops only that one cue.

## CDU

`src/features/panels/cdu/` is the CDU panel (F-32): a faithful mirror of the default X-Plane FMS's
16-line screen, with a Boeing-style keyboard beneath it. `src/domain/cdu/` holds every calculation
as pure functions with no React and no simulator types: `keys.ts` (the key catalogue, 70 keys per
unit in the Boeing-style layout, and the DataRef/command name builders), `screen.ts`
(`decodeTextLine`, `decodeStyleLine` and `decodeStyleByte`, decoding each glyph's colour, size,
reverse video, underline and flash from its style byte), `key-queue.ts` (`CduKeyQueue`) and
`hardware-keys.ts` (`hardwareKeyToCdu`, the physical-keyboard mapping below). Four more profile
features back it (`GENERIC_PROFILE` 1.6.0): `cdu{1,2}-screen` (16 text lines required, 16 style
lines optional) and `cdu{1,2}-keys` (the EXEC light and all 70 key commands, every one optional),
so a name an aircraft lacks costs only that line or key (see `docs/xplane.md`). `CduPanel` declares
all four, so both units stream while the panel is visible — the Web API sends only changes, so an
idle second unit costs little — and nothing CDU-related is subscribed while another panel is shown.
`PanelDescriptor` gained `fillsFrame`: most panels are scrolled by `PanelFrame`, but the CDU pins
its own bezel and scrolls only its keys (see Layout below), so its descriptor sets `fillsFrame` and
lays out its own scrolling. The flight data strip (F-11) is hidden while the CDU panel is shown, the
same way it already hides itself on the Flight data panel, since both already spend a glass's worth
of numbers.

**Screen states.** `useCduScreen(unit)` reduces the unit's 16 text and 16 style lines to one of five
states: *unavailable* (the screen feature itself is unavailable on this aircraft — no keys);
*waiting* (connected, but not every line has arrived yet — the glass is drawn with "Waiting for the
CDU screen…" and the keys disabled); *noFms* (every line has been blank since the aircraft was
identified — a sentence names the aircraft and offers no keyboard, never a blank glass); *live* (any
text has appeared since identification — the mirror and keys); and *stale*, layered on live when
`link.valuesCurrent` is false (the last screen at 50% opacity, an amber `NOT LIVE` tag on the bezel,
every key disabled, C5). Rows 14–15, which the default layout leaves empty, are added below the
scratchpad only once either has shown a non-blank character in the session, kept per unit (switching
CDU 1 → CDU 2 → CDU 1 never resets unit 1's own "seen" and rows-14–15 memory); only a new aircraft
identity resets both units'. The memory lives in a `CduScreenMemoryStore`
(`src/features/panels/cdu/cdu-screen-memory.ts`) that `CduPreferenceProvider` holds at shell level,
so it also survives leaving the panel: a screen that went blank after being live is still Live when
the pilot comes back to the CDU. Outside a provider the hook keeps its own.

**The key queue (why serial).** A real FMS takes keys one at a time, in order: typing `KLAX`
quickly must never arrive as `KLXA`, which sending every press as soon as it is tapped could do over
a network link with varying latency. `CduKeyQueue` (`src/domain/cdu/key-queue.ts`) holds up to 24
waiting keys (one scratchpad line) and activates them one at a time, waiting for X-Plane's answer
before sending the next (C2). A press beyond the limit is refused with one message; when a key
fails, every key still queued behind it is dropped — sending them would type a different string
than the pilot meant — and one message says so, naming the key and how many were dropped. Each
accepted press is numbered, so a message clears early only on the answer to a key pressed after it
appeared: the keys still draining from before "Too many keys waiting" never wipe it unread. Losing the
link or switching CDU unit clears the queue outright. `useCduKeys(unit)` (the hook `CduPanel` reads)
owns one queue per `(unit, link.controlsEnabled)` pair, rebuilding it — and so dropping whatever
waited — whenever either changes; `press()` is a no-op while no queue exists (controls disabled,
C5), so every caller (the on-screen keys and the web's physical keyboard) gets C5 for free rather
than needing to re-check it themselves. A key whose answer takes longer than 500 ms lights an amber
`SLOW` tag on the bezel for 5 s after the last slow answer. There is no local echo: the glass only
ever shows what X-Plane actually drew, never a predicted character, so a key's own pressed state and
haptic tick are the only immediate feedback.

**`ActivationResult`.** `SimulatorSession.activate` resolves to `'ok' | 'failed' | 'refused'`
(`src/domain/panels/activation.ts`) instead of only throwing or resolving to `void`, so the queue
learns a key's outcome without reading back through the store — the one caller (besides the CDU)
that needs to sequence its own presses in order.

**Keys.** `CduKeyButton` (`src/features/panels/cdu/CduKeyboard.tsx`) is quiet (the one message line
speaks for every key, never a per-key notice) and `repeatable` (a press still in flight never
disables the key, so `LL` sends two presses through the queue); `isKeyMissing` disables and labels a
key whose command is missing on the aircraft (R9), and `ControlButton` gained both props for it. The
line-select keys span the two glass rows they select, centred on them; `cduGeometry` derives the row
height, and so the font size, from the glass's measured width divided by 24 columns. Narrow
(window width below `TWO_COLUMN_MIN_WIDTH`, 720 dp — this is the one panel the *window*, not the
measured content width, decides it by, since a landscape phone's switcher rail and insets would
otherwise shrink the measured width below the glass's natural size), the bezel is pinned above the
scrolling keys while the frame leaves room for at least two 48 dp key rows under it; below that — a
short phone, a large system font — the bezel and keys scroll together instead, so the scratchpad is
never pushed out of view and the keys are never left unreachable. Wide, the bezel and the keys are
two independently scrolling columns. CDU 1 and CDU 2 are two keys in the bezel's label row, beside
the `SLOW` and `NOT LIVE` tags; the chosen unit is a per-device preference (`avionix.cdu`,
best-effort load and save, default 1) kept per unit across an aircraft that does not publish one of
the two screens, so the saved choice is never overwritten by a fallback.

**Physical keyboard (web, spec §4.8).** `src/platform/hardware-keys.ts` is a no-op on native (iOS
and Android expose no hardware-key API without a native module); `hardware-keys.web.ts` adds one
`keydown` listener on `window`, in the capture phase, skipped while an `<input>`, `<textarea>`,
`<select>` or anything `contenteditable` has focus. `hardwareKeyToCdu` (`src/domain/cdu/hardware-keys.ts`) maps the event to
a key id — letters and digits uppercase to `key_<letter>`, `.`/`-`/`/`/space/Delete/Backspace/Escape
to their named keys, Page Up/Down to `prev`/`next` — and returns null for anything else, including
every key held with Ctrl, Alt or Meta (left to the browser) and Enter (deliberately unmapped: EXEC
commits a route change and stays a tap, never a keyboard reflex). `CduPanel` subscribes once for its
whole mounted life; the handler reads `press` (which carries the unit), the missing key ids and the
gate through refs, so the one subscription never races a render. The gate is open only while the
screen is live (`screen.state === 'live'`, which also rules out waiting, No FMS and unavailable) with
controls enabled (`link.controlsEnabled`). A key it cannot act on (missing command, or the gate
closed) is left unconsumed and propagates untouched, so the browser's own binding for it (Page Down
scrolling the page) still runs. A consumed key gets `preventDefault` and `stopPropagation`: being in
the capture phase, the listener stops it before react-native-web's own key handling, so Space on a
focused on-screen key presses SP alone, never that key too. A held key's auto-repeat
(`event.repeat`) is consumed but never pressed: one press, one activation (C2).

## Systems

`src/features/panels/systems/` is the Systems panel (F-24): one control per switch, selector and
axis, enough to run a flight from battery to shutdown. `src/domain/systems/controls.ts` is the
single catalogue — every DataRef and command name, verified against Laminar's files
(`docs/xplane.md`) — that both the profile and the panel read, so a name lives in one place.
`readouts.ts` turns raw telemetry into the labels the units show (gear lamps, flap detent text,
trim percentage, the engine columns' running and starter state) as pure functions with no React;
`messages.ts` holds the sentences (not-adopted read-backs, a hold ended by its cap or by nothing
moving, a missing section) in the pilot's words, with no DataRef or command name in any of them
(R10).

Ten more profile features back it (`GENERIC_PROFILE` 1.7.0): `lights-exterior`, `lights-interior`,
`gear`, `flaps`, `trim`, `parking-brake`, `anti-ice`, `electrical`, `fuel` and `engine-start`, every
binding optional, so a name an aircraft lacks costs only the control it backs — the CDU keys' rule,
carried down to individual switches and selector positions here. `electrical` (battery, avionics
master, generators) goes beyond the roadmap's original list: the panel is meant to run a whole
flight, and every switch panel simmers buy starts with the master switch; flap-handle writes stayed
out of scope (commands only, so add-ons that hook them keep working). `sections.tsx` groups the ten
features into the four sections the layout shows (ENGINE, LIGHTS, FLIGHT, ICE); `availability.ts`
derives, per section, which of its controls draw and the one line naming what a missing binding left
out ("Not available on the Cessna 172: STROBE, TAXI."), reusing the CDU keys' per-control
resolution rather than hiding a whole section for one miss.

**Momentary controls** — switches, dimmers, the fuel selector, magnetos, gear, flaps, the parking
brake's two writes, takeoff trim and the centre commands — are `ControlButton`s exactly as every
other panel's: an explicit on/off (or positional) command chosen from the state X-Plane reports,
never a toggle, and a `useReadBack` watch once X-Plane accepts one, so a switch that did not move
says so in one sentence naming the aircraft and the state it still reports. Gear, magnetos, the fuel
selector's OFF and battery OFF take `confirm` (a second tap within the window): a stray touch here
either stops an engine or the electrics in flight. **Held controls** — the six trim keys and up to
four starters — use `useHoldControl` and `ControlButton.hold` (see Panels above); a starter is also
armed by a first tap (`confirm`) before it can be held, so cranking never starts by accident.

**Layout** (spec §4.7). A phone (window narrower than `WIDE_MIN_WIDTH`, the same 720 dp breakpoint
the CDU and Navigation use) shows one of four pages behind a row of page keys — ENGINE, LIGHTS,
FLIGHT, ICE — the last one remembered per device (`avionix.systems`, best-effort load and save,
FLIGHT on first use); a window at or past that breakpoint shows two independently scrolling columns
instead (ENGINE and LIGHTS; FLIGHT and ICE), with no page keys, so nothing is ever hidden on a
tablet. `SystemsPanel` owns one `useReadBack` for the whole panel and passes it to whichever
sections are mounted, so a read-back failure survives a page change, and a held control's lease is
released (its unit unmounts) the moment the page changes under it. Registered fifth in the switcher
(`src/features/panels/registry.ts`): Instruments, Radios, Autopilot, Navigation, **Systems**, CDU,
Flight data — every aircraft has these controls, only airliners have the CDU.

## Error model

Everything that crosses into the application layer is an `AvionixError` with a stable `code`
(`NETWORK_ERROR`, `TIMEOUT`, `INCOMING_TRAFFIC_DISABLED`, `UNSUPPORTED_API`, `DATAREF_NOT_FOUND`,
...), a `retryable` flag, and the original X-Plane `error_code` in `simulatorErrorCode` when
available. Raw exceptions never reach the UI.

### Error presentation

`AvionixError` keeps its raw `message`, `cause` and `httpStatus` for the logger. Nothing in
`src/features` may render them. The only route from a failure to the screen is
`explainFailure(code, step)` in `src/domain/health/failure-explanation.ts`, which returns a
one-line cause and a one-line action. `tests/ui/error-text-guard.test.tsx` enforces this for
every error code, and `tests/unit/application/diagnostics-summary.test.ts` enforces it for the
shareable summary. A new error code needs an entry in the table; there is no fallback string.

## Multi-device

Each device runs its own `SimulatorSession` and its own WebSocket to X-Plane. There is no Avionix
server. The X-Plane Web API keeps per-connection subscription and command bookkeeping, so devices
do not interfere with each other. Devices pair with the Avionix Connector individually: each holds
its own bearer token, stored per host and port by `PairingTokenStore` in the same `SettingsStorage`
port as the connection settings. Device roles are still not implemented.

## Theming

`src/theme` owns appearance. A `Theme` (`tokens.ts`) holds `mode`, `colors`, `spacing`, `radius`
and `typography`; `lightTheme`, `darkTheme` and `nightTheme` share one shape, so adding a palette
later means adding one more `Theme` object. `themeForMode` dispatches through a
`Record<ThemeMode, Theme>`, so an unhandled mode is a compile error, and the preference literals
live in one `as const` tuple that feeds both the type and the zod schema. `ThemeProvider`
(`theme-context.tsx`) resolves the effective mode from the persisted preference (`system`,
`auto-night`, `light`, `dark`, `night`; key `avionix.theme`, validated with zod, default `system`)
and the OS colour scheme, and exposes `useTheme()`, `useThemePreference()` and
`useThemedStyles(factory)`. Components never hold colour literals; they use the primitives in
`primitives.tsx` (`Section`, `SectionTitle`, `BodyText`, `ThemedTextInput`) or build styles from
the theme. The toggle (`ThemeToggle.tsx`) sits in Setup's Display section. Host and port, the
theme preference and the panel layout are the persisted settings.

**Cockpit look.** `Theme` also carries `avionics: AvionicsColors`, the hardware palette with fixed
cockpit meanings (green engaged, white armed, cyan selected, amber caution, red warning, shared by
day and dark, with its own dimmer set for night), and `typography.fonts`, the B612 and B612 Mono
family names. `AvionixApp` loads the fonts through `expo-font` without blocking the first render;
until they load, and if a font ever fails to, the family tokens are `undefined`, so React Native
falls back to the system font instead of logging a missing one. The family-name strings live in
`src/theme/font-families.ts`, which imports no package, so `typography.ts` can name them without
pulling in `@expo-google-fonts` (and through it `expo-font`) ahead of `platform/fonts.ts`'s guarded
`require`. `numeric(theme, bold?)` is the one
helper every live number in the app sets for tabular digits. The hardware primitives in
`src/features/panels/primitives/` — `AvionicsUnit` (the bezel), `DisplayWindow` (the glass value
window), `LightBar` and `ControlButton`'s key face — read these tokens instead of holding colour
literals, the same rule app chrome follows. A `DisplayWindow` also dims itself when the
`ControlButton` it sits inside (if any) is disabled, so a pressable value never stays
full-brightness once its key cannot be pressed; dimmed wins over the warning tone, so a stale 7700
dims too while its "EMERG" caption stays. A `LightBar` inside a key dims its lit fill or armed
outline to `legendDim` while values are not current, keyed to the link and not to the key's
enabled state, so a pending or override-disabled key still shows X-Plane's current mode. A pad
drawn on a bezel (`useOnBezel()`) takes avionics colours for its own title, Cancel and dashed
border; off a bezel it keeps app colours, with `colors.accent` (not the fill colour `primary`)
for text and thin indicators.

**Haptics.** `src/platform/haptics.ts` loads `expo-haptics` through a guarded `require`, so an
existing build without the native module, the web (`haptics.web.ts`) and Jest all get a silent
no-op; it never throws and never logs. `HapticsProvider` (`src/features/haptics/`) persists an
on/off preference under `avionix.haptics`, the same `SettingsStorage` pattern as the theme
preference, and exposes `haptics.press()` and `haptics.failure()` to every `ControlButton` and
`Keypad` press, a failed read-back and an AP-disconnect annunciation.

## Web and the bridge

The application is platform-neutral: Expo builds it for iOS, Android and web, and `react-native-web`
translates the React Native API surface to the web. `src/platform/default-connection.ts` prefills the
connection form with the current page's host and port on the web; the `ServiceBrowser` factory is
`src/platform`'s other platform split (see Connector discovery above).

The Avionix bridge (`scripts/avionix-bridge.js`) is infrastructure outside the app: a Node.js HTTP
and WebSocket server that serves the exported web app and relays all `/api/*` requests from the
browser to X-Plane. It preserves request paths and headers, answers OPTIONS itself with 204, adds
CORS headers to every response, and returns 502 `bridge_upstream_unreachable` (JSON) when X-Plane is
down. The bridge solves the same-origin and CORS problems that arise when a web client on another
machine tries to reach X-Plane's web server (which listens on localhost only and rejects CORS
preflight with 403). This was the "local bridge" infrastructure anticipated in the MVP design.
