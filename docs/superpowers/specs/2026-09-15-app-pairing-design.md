# Avionix app pairing — design

Date: 2026-09-15. Status: approved in chat, pending user review of this document.

Sub-project 2 of the Avionix Connector work. Sub-project 1 (the connector protocol on the
bridge, `docs/connector.md`) is merged. Sub-project 3 (discovery) follows this one.

## Goal

The app obtains a bearer token from an Avionix Connector by entering the 6-digit code the
connector prints, keeps that token per connector, sends it on every request, and asks for a
new code when the connector rejects it. Connecting directly to X-Plane (no connector) keeps
working unchanged. The UI never learns the protocol: it sees a `pairing` state and calls
`pair(code)`.

## Decisions (approved 2026-09-15)

- Connector first, X-Plane still allowed. `DEFAULT_PORT` becomes 8080. On connect the app
  probes `GET /avionix/info`; a connector runs the pairing flow, anything else is treated as
  X-Plane itself.
- Pairing UI is an inline mode of the existing connection screen. No modal, no navigation.
- Tokens live in the existing `SettingsStorage` port (AsyncStorage on native, localStorage on
  web). Not `expo-secure-store`.
- Pairing logic is owned by `SimulatorSession` (approach 1 of three considered).

## Connector protocol facts the app relies on

From `docs/connector.md` and `scripts/avionix-bridge.js` (v1):

| Request | Response |
| --- | --- |
| `GET /avionix/info` | `200 { name, version, pairingRequired, xplane: { host, port, reachable } }`, no auth |
| `POST /avionix/pair` body `{ "code": "123456" }` | `200 { token }`; `401 pairing_invalid_code`; `429 pairing_rate_limited` (per client) or `429 too_many_attempts` (global); `400 invalid_body` |
| `/api/*` over HTTP | needs `Authorization: Bearer <token>` when `pairingRequired`, else `401 unauthorized` |
| `/api/*` WebSocket upgrade | needs `?token=<token>` in the URL (headers cannot be set from browsers), else the upgrade is refused with 401 |

Error bodies use X-Plane's shape `{ error_code, error_message }`. X-Plane itself answers
`/avionix/info` with a 404 (or a non-JSON body); with "Disable Incoming Traffic" on it answers
403, which the existing mapping already turns into `INCOMING_TRAFFIC_DISABLED`.

## Domain

### Connection state

`src/domain/connection/connection-state.ts` gains the state `pairing` and the events
`pairingRequired` and `pair`:

| From | Event | To |
| --- | --- | --- |
| connecting | pairingRequired | pairing |
| reconnecting | pairingRequired | pairing |
| connected | pairingRequired | pairing |
| pairing | pair | connecting |
| pairing | disconnect | disconnected |

All existing edges stay. `CONNECTION_STATES` lists `pairing` after `connecting`.

### Errors

`AvionixErrorCode` gains:

| Code | Meaning | retryable |
| --- | --- | --- |
| `PAIRING_REQUIRED` | The connector requires pairing and no token is stored for it. | false |
| `PAIRING_FAILED` | The code was rejected (`pairing_invalid_code`). | false |
| `PAIRING_RATE_LIMITED` | `pairing_rate_limited` or `too_many_attempts`. | true |
| `UNAUTHORIZED` | A token the app holds was rejected (`unauthorized`, or a bare 401). | false |

### Connector info

New file `src/domain/connector/connector-info.ts`:

```ts
export interface ConnectorInfo {
  name: string;
  version: string;
  pairingRequired: boolean;
  xplane: { host: string; port: number; reachable: boolean };
}
```

## Infrastructure

### Auth provider on the transports

`export type AuthProvider = () => string | null;` (in `src/infrastructure/xplane/auth.ts`).

- `HttpTransportOptions.auth?: AuthProvider`. When it returns a string, `request()` adds
  `Authorization: Bearer <token>`. When it returns `null` the headers are unchanged.
- `XPlaneClientOptions.auth?: AuthProvider`. The WebSocket URL is built as today and, when the
  provider returns a string, gets `?token=<encodeURIComponent(token)>` appended (the URL has no
  query today; the helper must handle a future existing query with `&`). The token is read at
  connect time, so a token stored after construction is picked up on the next
  `connectWebSocket()`.
- Tokens must never appear in logs. The WebSocket transport logs the URL today; it logs it with
  the query removed.

### Error mapping

`src/infrastructure/xplane/http/error-mapping.ts` maps connector codes:

| `error_code` | `AvionixErrorCode` |
| --- | --- |
| `unauthorized` | `UNAUTHORIZED` |
| `pairing_invalid_code` | `PAIRING_FAILED` |
| `pairing_rate_limited`, `too_many_attempts` | `PAIRING_RATE_LIMITED` (retryable) |

`HttpTransport.toHttpError` maps a 401 whose body is not the X-Plane error shape to
`UNAUTHORIZED`. The existing 403 → `INCOMING_TRAFFIC_DISABLED` rule stays.

### ConnectorClient

New file `src/infrastructure/connector/connector-client.ts`:

```ts
export class ConnectorClient {
  constructor(options: { http: HttpTransport; logger?: Logger });
  /** null when the target is not an Avionix Connector. */
  getInfo(): Promise<ConnectorInfo | null>;
  /** Resolves with the token; rejects with PAIRING_FAILED / PAIRING_RATE_LIMITED / other AvionixError. */
  pair(code: string): Promise<string>;
}
```

`getInfo()` returns `null` on `HTTP_ERROR` with status 404 and on `INVALID_RESPONSE` (a
non-JSON or wrongly shaped body). Every other error propagates, so an unreachable host still
fails the connect with `NETWORK_ERROR` and a 403 still surfaces `INCOMING_TRAFFIC_DISABLED`.
Responses are validated with zod schemas in `src/infrastructure/connector/schemas.ts`.

`pair()` sends `{ code }` and validates `{ token: string (non-empty) }`.

## Application

### PairingTokenStore

New file `src/application/pairing-token-store.ts`:

```ts
export interface PairingTokenStore {
  get(host: string, port: number): Promise<string | null>;
  set(host: string, port: number, token: string): Promise<void>;
  clear(host: string, port: number): Promise<void>;
}
export function createPairingTokenStore(storage: SettingsStorage): PairingTokenStore;
export function pairingTokenKey(host: string, port: number): string; // `avionix.pairing.${host}:${port}`
```

`clear` writes an empty string (the `SettingsStorage` port has no remove). `get` treats a
missing key, an empty string, or an unreadable value as `null` and never throws. The host is
lowercased in the key so `PC` and `pc` share a token.

### Session

`SimulatorSessionDeps` gains:

```ts
createHttpTransport(config: XPlaneConnectionConfig, auth: AuthProvider): HttpTransport;
createClient(config, apiVersion, http, auth: AuthProvider): SimulatorClient;
createConnectorClient(http: HttpTransport): ConnectorClient;
tokenStore: PairingTokenStore;
```

`SessionSnapshot` gains `connector: ConnectorInfo | null` (set when a connector answered the
probe, cleared on disconnect) and `SessionDiagnostics` gains
`connector: 'idle' | 'pending' | 'direct' | 'pairing' | 'paired'`.

The session holds the current token in memory (`this.token: string | null`); the auth provider
given to the transports reads that field. The token is loaded from the store at the start of
every connect and written to the store after a successful pair.

Connect flow (`runConnectFlow`, initial mode):

1. `transition('connect')`, load `token = await tokenStore.get(host, port)`.
2. Create the HTTP transport with the auth provider. Diagnostics `connector: 'pending'`.
3. `info = await connectorClient.getInfo()`.
   - `null`: `connector: 'direct'`, continue to step 4 with `token` left as is (a stale token
     for a host that is now plain X-Plane is harmless: X-Plane ignores the header).
   - `info.pairingRequired === false`: `connector: 'paired'`, snapshot `connector = info`,
     continue.
   - `info.pairingRequired === true` and `token === null`: snapshot `connector = info`,
     diagnostics `connector: 'pairing'`, `transition('pairingRequired')`, snapshot `error =
     null`, and return. The flow resumes from `pair()`.
   - `info.pairingRequired === true` and a token is held: `connector: 'paired'`, continue.
4. Capabilities and the rest of the existing flow, unchanged.

`pair(code)`:

- Rejects with `INTERNAL` when the state is not `pairing`.
- Calls `connectorClient.pair(code)`. On success: store the token in memory and in the store,
  `transition('pair')` (→ `connecting`), snapshot `error = null`, diagnostics
  `connector: 'paired'`, then run the connect flow from step 4 on the same generation.
- On `PAIRING_FAILED` or `PAIRING_RATE_LIMITED`: stay in `pairing`, set `snapshot.error` to
  that error. On any other error (network): stay in `pairing`, set `snapshot.error`.
- Concurrent `pair()` calls while one is in flight reject with `INTERNAL`.

`UNAUTHORIZED` handling, both modes: when any step of the connect flow or a reconnect attempt
fails with `UNAUTHORIZED`, the session clears the token (memory and store), sets
`snapshot.error` to the `UNAUTHORIZED` error, transitions with `pairingRequired` (from
`connecting`, `reconnecting` or `connected`) and stops retrying. The reconnect scheduler is
cancelled. DataRef and command resolution, heading writes and command activations all run over
authenticated HTTP after the session is already `connected`, so a connector that revokes the
token mid-session is caught there too and returns the session to `pairing` from `connected`.
The snapshot keeps `connector` so the UI can name the connector; a target that is not a known
connector fails to `error` instead, since there is no code the user could enter.

`disconnect()` from `pairing` transitions to `disconnected` and clears `connector`, the
in-flight generation, and the in-memory token (the stored token is kept).

`SessionApi` (services context) and `useSimulatorSession` expose `pair(code: string): Promise<void>`.

### Defaults

`DEFAULT_PORT` in `src/domain/connection/connection-config.ts` becomes 8080. The port
validation range and the web page-origin default are unchanged. A stored setting of 8086
stays 8086; only the default for first launch changes.

## UI

`ConnectionForm` gets a `pairing` mode when `state === 'pairing'`:

- Host and port inputs shown but not editable (as while connecting).
- A `BodyText` line: `"<connector name> needs pairing. Enter the code shown in the connector
  window."`
- A `ThemedTextInput` for the code: numeric keyboard, `maxLength` 6, autofocus, testID
  `pairing-code`.
- **Pair** button, disabled unless the code has exactly six digits or while a pair call is in
  flight. **Cancel** button calls `onDisconnect`.
- New props: `connectorName: string | null`, `onPair(code: string): void`, `pairing: boolean`
  (a pair call in flight, tracked in `MvpScreen`).

`ConnectionStatus` maps the new codes to plain text before showing the error line:

| Code | Text |
| --- | --- |
| `PAIRING_FAILED` | Wrong code, check the connector window. |
| `PAIRING_RATE_LIMITED` | Too many attempts, wait a minute and try again. |
| `UNAUTHORIZED` | The connector no longer accepts this device, pair again. |
| `PAIRING_REQUIRED` | This connector needs pairing. |

Other codes keep the existing `code: message` rendering. The diagnostics list shows the new
`connector` step with the same styling as the others.

`MvpScreen`: `onPair(code)` sets `pairing = true`, calls `session.pair(code)`, and resets the
flag in `finally`. The code input is cleared after a failed attempt.

## Testing

Unit (node project):

- `connection-state`: the four new edges succeed; `pair` from `connected` throws `INTERNAL`.
- `error-mapping`: the three connector codes; a bare 401 → `UNAUTHORIZED`.
- `pairing-token-store`: round trip, lowercased host key, `clear` then `get` → `null`,
  garbage value → `null`.
- `connector-client`: connector JSON → `ConnectorInfo`; 404 → `null`; HTML body → `null`;
  network error propagates; `pair` maps 401/429 bodies to the codes.
- `http-transport`: header present only when the provider returns a token.
- `xplane-client` / `websocket-transport`: `?token=` appended and URL-encoded; the logged URL
  has no token.

Integration (node project) against `tests/mock-xplane/mock-xplane-server.ts`, which gains a
`connector` option `{ name, pairingRequired, code, rejectAllTokens?: boolean }` that serves
`/avionix/info`, `/avionix/pair`, checks tokens on `/api` and on the upgrade, and exposes
`issuedTokens` and a `setRejectAllTokens(boolean)` switch:

- First connect reaches `pairing`; `pair('123456')` connects and stores the token.
- Second session with the same storage connects without pairing.
- Wrong code stays in `pairing` with `PAIRING_FAILED`; the correct code afterwards connects.
- Token rejected on a reconnect attempt (`setRejectAllTokens(true)` then drop the socket) →
  `pairing`, `UNAUTHORIZED` in the snapshot, stored token cleared, no further retries.
- Connector with `pairingRequired: false` connects, diagnostics `connector: 'paired'`.
- Plain mock X-Plane (no connector option) connects, diagnostics `connector: 'direct'`.
- `disconnect()` from `pairing` → `disconnected`.

End to end (node project): one test that starts the real `scripts/avionix-bridge.js` with a
fixed `--code` and `--data-dir` in a temp directory in front of the mock X-Plane server, pairs
through `SimulatorSession`, and reads a DataRef.

UI (expo project) in `tests/ui/`: pairing mode renders the connector name, Pair is disabled for
five digits and enabled for six, pressing Pair calls `session.pair` with the code, Cancel calls
`disconnect`, each error text appears for its code. One web-project test renders the pairing
mode with react-dom.

Gate: `npm run typecheck && npm run lint && npm run format:check && npm test`.

## Docs

- `docs/connector.md`: remove the "pairing screen is pending, use `--open`" paragraph;
  describe the in-app flow and that restarting the connector after deleting the token file
  makes the app ask for a code again.
- `docs/web.md`, `README.md`, `docs/testing/xplane-smoke-test.md`: drop the `--open` interim;
  smoke test gains a pairing step (wrong code, right code, restart-and-re-pair).
- `docs/architecture.md`: the `pairing` state, the `connector` step, `PairingTokenStore`,
  `ConnectorClient`.

## Out of scope

- Discovery (sub-project 3).
- A "forget this connector" button (restart the connector to revoke).
- Bridge changes: the `Origin` check on WebSocket upgrades under `--open`, exposing the attempt
  caps as flags. Tracked from the connector-protocol review.
- QR-code pairing, multiple connectors, roles.
