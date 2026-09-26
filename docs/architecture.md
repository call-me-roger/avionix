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
