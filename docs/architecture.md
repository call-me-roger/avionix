# Architecture

## Layers

| Layer | Directory | Depends on | Contains |
|---|---|---|---|
| Domain | `src/domain` | nothing | `AvionixError`, connection config validation, URL derivation, the connection state table, API version negotiation, simulator types, the `SimulatorClient` port, the `ServiceBrowser` port, `DiscoveredConnector`, aircraft profiles, identification and availability, panel rules (device layout, panel fit, link status, control availability, keep-awake policy) |
| Infrastructure | `src/infrastructure` | domain | zod schemas and mappers for X-Plane payloads, `HttpTransport`, `WebSocketTransport` + `RequestManager`, `XPlaneClient`, `ConnectorClient`, logging, AsyncStorage adapter, `ZeroconfServiceBrowser` and the null browser |
| Application | `src/application` | domain, infrastructure | `SimulatorSession` (connect flow, diagnostics, telemetry, reconnect), `PairingTokenStore`, `Store`, snapshot types, settings, `ConnectorDiscovery`, `panel-layout`, `subscription-demand` |
| UI | `src/app`, `src/hooks`, `src/features` | application | composition root, React context, hooks, plain React Native components |
| Platform | `src/platform` | infrastructure | the only platform-specific code: the web connection default, the `ServiceBrowser` factory (`service-browser.ts` for native, `service-browser.web.ts` for the web) and the keep-awake wrapper |

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
route except Setup (no demand there) and Flight data itself (it would repeat the panel). The whole
row is one pressable at least 48 dp tall that opens Flight data, or a plain (non-pressable) view when
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
