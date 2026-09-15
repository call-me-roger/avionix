# Architecture

## Layers

| Layer | Directory | Depends on | Contains |
|---|---|---|---|
| Domain | `src/domain` | nothing | `AvionixError`, connection config validation, URL derivation, the connection state table, API version negotiation, simulator types, the `SimulatorClient` port |
| Infrastructure | `src/infrastructure` | domain | zod schemas and mappers for X-Plane payloads, `HttpTransport`, `WebSocketTransport` + `RequestManager`, `XPlaneClient`, `ConnectorClient`, name resolution caches, logging, AsyncStorage adapter |
| Application | `src/application` | domain, infrastructure | `SimulatorSession` (connect flow, diagnostics, telemetry, reconnect), `PairingTokenStore`, `Store`, snapshot types, settings |
| UI | `src/app`, `src/hooks`, `src/features` | application | composition root, React context, hooks, plain React Native components |

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
TextInput → MvpScreen → useSimulatorSession().connect(host, port)
  → SimulatorSession.connect
      1. validate host/port                       (domain)
      2. GET /avionix/info                        (ConnectorClient)
         → no connector: continue (connector: direct); pairing needed: state = pairing until pair(code);
           connector ready: continue (connector: paired)
      3. GET /api/capabilities                    (HttpTransport)
      4. negotiateApiVersion                      (domain)
      5. XPlaneClient.connectWebSocket            (WebSocketTransport)
      6. state = connected
      7. resolve MVP DataRefs + command by name   (ResolutionCache → REST)
      8. dataref_subscribe_values                 (WebSocket)
      9. dataref_update_values → DataRefUpdate[] → snapshot.telemetry
  → Store notifies → useSyncExternalStore re-renders the screen
```

Every step updates `snapshot.diagnostics`, so a failure is visible at the exact step.

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

`pairing` is reached in two cases: when the target is an Avionix Connector that requires a code and
the app holds no token for it (reached from `connecting` or `reconnecting`), and when a connector
rejects the token the app does hold after connection is established (the `UNAUTHORIZED` path from
`connected`; this happens when an authenticated write or command fails). In the second case, the
session clears the stored token and cancels the reconnect scheduler. Both cases leave the session
waiting for `SimulatorSession.pair(code)` or `disconnect()`.

The `connected → error` edge exists because the session reports `connected` as soon as the socket
opens (spec step 9); DataRef resolution and subscription happen afterwards and can still fail.

Reconnect uses exponential backoff (1 s, 2 s, 4 s, 8 s, 16 s, ±20 % jitter, 5 attempts) and reruns
the whole connect flow, including capabilities and name resolution, because X-Plane may have
restarted and DataRef ids are session-specific.

## Error model

Everything that crosses into the application layer is an `AvionixError` with a stable `code`
(`NETWORK_ERROR`, `TIMEOUT`, `INCOMING_TRAFFIC_DISABLED`, `UNSUPPORTED_API`, `DATAREF_NOT_FOUND`,
...), a `retryable` flag, and the original X-Plane `error_code` in `simulatorErrorCode` when
available. Raw exceptions never reach the UI.

## Multi-device

Each device runs its own `SimulatorSession` and its own WebSocket to X-Plane. There is no Avionix
server. The X-Plane Web API keeps per-connection subscription and command bookkeeping, so devices
do not interfere with each other. Devices pair with the Avionix Connector individually: each holds
its own bearer token, stored per host and port by `PairingTokenStore` in the same `SettingsStorage`
port as the connection settings. Device roles are still not implemented.

## Theming

`src/theme` owns appearance. A `Theme` (`tokens.ts`) holds `mode`, `colors`, `spacing`, `radius`
and `typography`; `lightTheme` and `darkTheme` share one shape, so adding a palette later means
adding one more `Theme` object. `themeForMode` dispatches through a `Record<ThemeMode, Theme>`, so
an unhandled mode is a compile error, and the preference literals live in one `as const` tuple that
feeds both the type and the zod schema. `ThemeProvider` (`theme-context.tsx`) resolves the effective
mode from the persisted preference (`system`, `light`, `dark`; key `avionix.theme`, validated with
zod, default `system`) and the OS colour scheme, and exposes `useTheme()`, `useThemePreference()`
and `useThemedStyles(factory)`. Components never hold colour literals; they use the primitives in
`primitives.tsx` (`Section`, `SectionTitle`, `BodyText`, `ThemedTextInput`) or build styles from
the theme. The toggle (`ThemeToggle.tsx`) sits under the Avionix heading. The theme preference is
the second persisted setting after host and port; nothing else is stored.

## Web and the bridge

The application is platform-neutral: Expo builds it for iOS, Android and web, and `react-native-web`
translates the React Native API surface to the web. `src/platform/default-connection.ts` is the only
web-specific code; it prefills the connection form with the current page's host and port.

The Avionix bridge (`scripts/avionix-bridge.js`) is infrastructure outside the app: a Node.js HTTP
and WebSocket server that serves the exported web app and relays all `/api/*` requests from the
browser to X-Plane. It preserves request paths and headers, answers OPTIONS itself with 204, adds
CORS headers to every response, and returns 502 `bridge_upstream_unreachable` (JSON) when X-Plane is
down. The bridge solves the same-origin and CORS problems that arise when a web client on another
machine tries to reach X-Plane's web server (which listens on localhost only and rejects CORS
preflight with 403). This was the "local bridge" infrastructure anticipated in the MVP design.
