# Avionix MVP Design: X-Plane 12 Connectivity Foundation

Date: 2026-09-14
Status: Draft for review
Scope: First milestone. Prove that one or more mobile devices can connect to X-Plane 12 over a LAN and exchange live DataRef data and commands through the built-in X-Plane Web API.

This document refines the original project brief with verified evidence. Where the brief and the evidence disagree, this document wins and the disagreement is called out explicitly.

---

## 1. Goal

Build a production-quality Expo / React Native foundation that answers one question:

> Can Avionix reliably connect one or more mobile devices to X-Plane 12 over a local network and exchange live simulator data and control commands?

The MVP delivers a deliberately plain single screen that connects, negotiates the API version, resolves DataRefs by name, streams live values over WebSocket, writes one DataRef, activates one command, and recovers from connection loss. No avionics UI.

## 2. Decisions taken (with rationale)

| Decision | Choice | Rationale |
|---|---|---|
| Minimum X-Plane version | 12.1.4 (Web API v2) | Capabilities and commands only exist from v2. The MVP requires commands. Older sims receive a clear `UNSUPPORTED_API` error. |
| Supported API versions | v2 and v3, highest wins | v3 adds only the flight-initialization API, which the MVP does not use. Both share identical DataRef and command shapes. |
| Native build | Expo Go only, no `android/` or `ios/` committed | The MVP needs no native modules. Config for a later development build lives in `app.json`. The development Mac has no Xcode. |
| Runtime validation | zod v4 | About ten payload schemas plus every WebSocket message. One dependency with precise error paths. |
| Bundle identifiers | `pro.avionix.app` (Android application id and iOS bundle id) | Provided by the project owner. |
| State management | Framework-free session store consumed via `useSyncExternalStore` | Keeps the simulator layer free of React and avoids a state library. |
| Test runner | Jest 29 via `jest-expo`, two projects (`node`, `expo`) | Transport and integration tests run in plain Node with real sockets. Hook and screen tests run in the React Native preset. |
| Package manager | npm | Present locally, matches the Expo template. |
| Command activation | REST `POST /command/{id}/activate` | The official doc designates this endpoint for fire-and-forget activation. WebSocket command messages are modelled in schemas and the mock server but not used by the MVP UI. |
| Reconnect policy | Bounded exponential backoff, max 5 attempts, full session reset per attempt | Prevents reconnect loops. A reset re-runs capabilities and DataRef resolution because X-Plane may have restarted and IDs are session-specific. |

## 3. Verified X-Plane Web API facts

Source: https://developer.x-plane.com/article/x-plane-web-api/ (last updated 2026-01-29). Cross-checked against the community Go client `github.com/janeprather/xpweb` for the value-read shape.

### 3.1 Versions

| API | X-Plane | Adds |
|---|---|---|
| v1 | 12.1.1 | DataRef list, count, read, write (REST); DataRef subscribe / unsubscribe / set (WebSocket) |
| v2 | 12.1.4 | `GET /api/capabilities`; command list, count, activate (REST); command subscribe / unsubscribe / set-active (WebSocket) |
| v3 | 12.4.0 | Flight start and update (REST). Not used by Avionix. |

### 3.2 Endpoints

Base: `http://{host}:{port}` and `ws://{host}:{port}`. Default port 8086. The port can be changed with the `--web_server_port=` launch flag. REST and WebSocket share the port.

| Operation | Method and path | Notes |
|---|---|---|
| Capabilities | `GET /api/capabilities` | Unversioned. Returns `{"api":{"versions":["v1","v2","v3"]},"x-plane":{"version":"12.4.0"}}`. 404 on 12.1.1 to 12.1.3. |
| List DataRefs | `GET /api/{v}/datarefs?filter[name]={name}` | Exact match. `filter[name]` is repeatable (OR). Optional `start`, `limit`, `fields`. Returns `{"data":[<dataref>]}`. 404 `invalid_dataref_name` if a name does not exist. |
| DataRef count | `GET /api/{v}/datarefs/count` | `{"data": 9554}` |
| Read value | `GET /api/{v}/datarefs/{id}/value?index=` | Returns `{"data": <value>}` where value is a number, an array of numbers, or a base64 string. The official doc's example for this endpoint is a copy-paste error and shows an array of descriptors; the community client and PATCH symmetry confirm the real shape. |
| Write value | `PATCH /api/{v}/datarefs/{id}/value?index=` | Body `{"data": <value>}`. Success is HTTP 200 with an empty body. |
| List commands | `GET /api/{v}/commands?filter[name]={name}` | Same filter semantics. Returns `{"data":[<command>]}`. 404 `invalid_command_name`. |
| Activate command | `POST /api/{v}/command/{id}/activate` | Path segment is singular `command`. Body `{"duration": 0..10}` in seconds, required. 0 means press and release. Success is HTTP 200 with an empty body. Do not send overlapping activations. |

Required request headers: `Accept: application/json` and `Content-Type: application/json`.

### 3.3 Schemas

DataRef: `{ "id": number, "name": string, "value_type": "float" | "double" | "int" | "int_array" | "float_array" | "data" }`. There is no writable flag. `data` values are base64 strings.

Command: `{ "id": number, "name": string, "description": string }`.

IDs are stable for the lifetime of an X-Plane session, including across aircraft loads, and are not guaranteed across restarts.

### 3.4 Errors

REST error payload: `{ "error_code": string, "error_message": string }` with the matching HTTP status.

| HTTP | error_code | Meaning |
|---|---|---|
| 403 | (none, plain 403 on every endpoint) | "Disable Incoming Traffic" is selected in X-Plane network settings |
| 403 | `dataref_is_readonly` | Write to a read-only DataRef |
| 404 | `invalid_dataref_name`, `invalid_command_name` | Name lookup miss |
| 404 | `invalid_dataref_id`, `invalid_command_id` | Stale or wrong id |
| 400 | `index_out_of_range`, `not_an_array`, `incompatible_data`, `invalid_body`, `duration_out_of_range`, `duration_missing`, `start_out_of_range`, `limit_out_of_range`, `invalid_field` | Bad request |

### 3.5 WebSocket protocol

Endpoint: `ws://{host}:{port}/api/{v}`. Messages are JSON text.

Request: `{ "req_id": number, "type": string, "params": object }`. `req_id` must be unique and non-recyclable within the connection.

Result: `{ "req_id": number, "type": "result", "success": boolean, "error_code"?: string, "error_message"?: string }`. Unknown `type` yields `unknown_type`. A single `dataref_set_values` request may yield several result messages with the same `req_id`, one per failed item.

| type | params | Version |
|---|---|---|
| `dataref_subscribe_values` | `{ "datarefs": [{ "id", "index"?: number \| number[] }] }` | v1 |
| `dataref_unsubscribe_values` | same, or `{ "datarefs": "all" }` | v1 |
| `dataref_set_values` | `{ "datarefs": [{ "id", "value", "index"? }] }` | v1 |
| `command_subscribe_is_active` | `{ "commands": [{ "id" }] }` | v2 |
| `command_unsubscribe_is_active` | same, or `{ "commands": "all" }` | v2 |
| `command_set_is_active` | `{ "commands": [{ "id", "is_active", "duration"? }] }` | v2 |

Server push (no `req_id`):

- `{ "type": "dataref_update_values", "data": { "<id>": value } }` at 10 Hz. The first message after subscribing contains all subscribed values; later messages contain only changed values. Index subscriptions return a dense array in index order.
- `{ "type": "command_update_is_active", "data": { "<id>": boolean } }` on change.

Command hold durations are tracked per connection and released when the socket closes.

## 4. Verified MVP DataRefs and command

Verified against Laminar Research's published `DataRefs.txt` and `Commands.txt` (X-Plane 12 copies in the `X-Plane/XPlane2Blender` repository). Must be re-confirmed at runtime through name resolution; the app never assumes a name exists.

| Role | Name | Type | Why |
|---|---|---|---|
| Heartbeat telemetry | `sim/time/total_running_time_sec` | float, seconds | Changes continuously even when parked, so streaming is provable without flying. Freezes when paused, which is itself useful diagnostic information. |
| Flight telemetry | `sim/cockpit2/gauges/indicators/airspeed_kts_pilot` | float, knots | Indicated airspeed, the brief's example. |
| Writable target | `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot` | float, degrees magnetic, writable | Autopilot heading bug. Harmless. Visible on the HSI or heading indicator of Laminar aircraft. |
| Command | `sim/autopilot/heading_up` | command | Increments the same heading bug by one degree. Universal, harmless, and observable through the heading subscription. |

The app subscribes to all three DataRefs. Writing the heading, then activating the command, produces a visible echo in the subscription, which proves the full round trip: REST write, REST command, WebSocket stream.

## 5. Toolchain

Checked against the npm registry and Expo documentation on 2026-09-14.

| Package | Version | Note |
|---|---|---|
| expo | ~57.0.22 | SDK 57, released 2026-06-30 |
| react-native | 0.86.3 | As pinned by the SDK 57 template |
| react | 19.2.3 | |
| typescript | ~6.0.3 | As pinned by the template. TypeScript 7.x is not adopted by Expo yet and is not used. |
| jest-expo | ~57.0.5 | Jest 29 preset |
| jest | ~29.7 | Must match the preset |
| @testing-library/react-native | latest 14.x | Hook and screen tests |
| eslint, eslint-config-expo | ~57.0.2 flat config | `npx expo lint` |
| prettier, eslint-config-prettier | 3.9.x | Formatting enforced through ESLint |
| zod | ^4.6 | Runtime validation |
| @react-native-async-storage/async-storage | 2.2.0 | Bundled with SDK 57, used for last host and port |
| ws | ^8.21 | Dev only, mock X-Plane WebSocket server |
| expo-build-properties | ~57.0.17 | Config plugin for Android cleartext traffic in future builds |

Local environment: Node 22.22.3 (global `fetch`, `WebSocket`, `atob` available), npm 10.9, Android SDK present, no Xcode. Expo project id `c01122de-c8fd-4556-87e6-44ef5551a875` goes in `expo.extra.eas.projectId`.

Expo Go on the App Store supports SDK 57 but requires the same Expo account to be logged in on the CLI (`npx expo login`) and in the app. Android Expo Go does not yet require this. Development builds do not require it. This is documented in `docs/development.md`.

## 6. Architecture

Rule: **Avionix UI must not know how X-Plane's protocol works.** No component or hook constructs URLs or WebSocket messages.

```
Screen (React)
  ↓ props / hooks
Hook (useSimulatorSession)          subscribes via useSyncExternalStore
  ↓
SimulatorSession (application)      state machine, orchestration, reconnect
  ↓
XPlaneClient (infrastructure)        typed operations, version-aware paths
  ↓                    ↓
HttpTransport      WebSocketTransport (request manager, message parsing)
  ↓                    ↓
fetch               WebSocket (React Native globals, Node globals in tests)
  ↓
X-Plane 12 Web API
```

### 6.1 Directory layout

```
avionix/
├── App.tsx                       entry, renders src/app/AvionixApp
├── app.json                      name, slug, ids, LAN networking config, EAS project id
├── src/
│   ├── app/                      AvionixApp.tsx, composition root (wires services)
│   ├── domain/
│   │   ├── connection/           ConnectionState, transitions, XPlaneConnectionConfig, endpoints
│   │   ├── simulator/            SimulatorCapabilities, DataRefDescriptor, CommandDescriptor, values, ports
│   │   └── errors/               AvionixError, error codes, factory helpers
│   ├── infrastructure/
│   │   ├── logging/              Logger interface, console logger, category tags
│   │   └── xplane/
│   │       ├── http/             HttpTransport (fetch based), request/response handling
│   │       ├── websocket/        WebSocketTransport, RequestManager, message router
│   │       ├── schemas/          zod schemas for every REST and WebSocket payload, mappers to domain
│   │       ├── xplane-client.ts  XPlaneClient implementation
│   │       ├── api-version.ts    version negotiation
│   │       └── dataref-repository.ts
│   ├── application/
│   │   ├── simulator-session.ts  connect / disconnect / reconnect orchestration, subscriptions
│   │   ├── session-store.ts      snapshot store consumed by React
│   │   └── settings-store.ts     last host and port persistence (AsyncStorage behind an interface)
│   ├── features/
│   │   ├── connection/           ConnectionForm, ConnectionStatus
│   │   ├── diagnostics/          DiagnosticsPanel
│   │   └── mvp/                  TelemetryPanel, ControlPanel, MvpScreen
│   ├── hooks/                    useSimulatorSession, useSettings
│   └── utils/                    small pure helpers (host and port validation, backoff)
├── tests/
│   ├── unit/                     mirrors src/ for domain, infrastructure, application
│   ├── integration/              XPlaneClient and SimulatorSession against the mock server
│   ├── contract/                 payload fixtures → schema → domain
│   ├── fixtures/                 JSON payloads copied from the official documentation
│   └── mock-xplane/              in-process mock HTTP and WebSocket server (Node)
├── docs/
│   ├── architecture.md
│   ├── development.md
│   ├── xplane.md
│   └── testing/xplane-smoke-test.md
├── .github/workflows/ci.yml
├── eslint.config.js, prettier.config.js, tsconfig.json, jest.config.js
└── README.md
```

Differences from the brief's sketch: `services/` is named `application/`, `screens/` and `components/` fold into `features/`, `state/` is `application/session-store.ts`, `types/` lives in `domain/`. No `android/` or `ios/` directories.

### 6.2 Domain layer (`src/domain`)

Simulator-independent types. No imports from infrastructure or React.

```ts
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface XPlaneConnectionConfig { host: string; port: number }

interface SimulatorCapabilities {
  simulatorVersion: string;        // raw "12.4.0"
  supportedApiVersions: ApiVersion[];   // parsed, unknown strings dropped but kept in rawApiVersions
  rawApiVersions: string[];
}
type ApiVersion = 'v1' | 'v2' | 'v3';

type DataRefValueType = 'float' | 'double' | 'int' | 'int_array' | 'float_array' | 'data';
interface DataRefDescriptor { id: number; name: string; valueType: DataRefValueType }
interface CommandDescriptor { id: number; name: string; description: string }

type DataRefValue = number | number[] | string;   // string only for value_type 'data' (base64)
interface DataRefSubscription { id: number; index?: number | number[] }
interface DataRefUpdate { id: number; value: DataRefValue; receivedAt: number }
```

Connection state transitions are defined as a pure function `transition(state, event)` with an explicit table. Illegal transitions throw an `AvionixError` with code `INTERNAL`, so tests can enumerate every legal edge.

| From | Event | To |
|---|---|---|
| disconnected | connect | connecting |
| connecting | connected | connected |
| connecting | failed | error |
| connecting | disconnect | disconnected |
| connected | socketLost | reconnecting |
| connected | disconnect | disconnected |
| reconnecting | connected | connected |
| reconnecting | retryExhausted | error |
| reconnecting | disconnect | disconnected |
| error | connect | connecting |
| error | disconnect | disconnected |

### 6.3 Error model (`src/domain/errors`)

```ts
type AvionixErrorCode =
  | 'INVALID_HOST' | 'INVALID_PORT'
  | 'NETWORK_ERROR' | 'TIMEOUT' | 'HTTP_ERROR'
  | 'INCOMING_TRAFFIC_DISABLED'       // plain 403 from X-Plane
  | 'UNSUPPORTED_API'                 // capabilities 404, or no version overlap
  | 'INVALID_RESPONSE'                // schema validation failed
  | 'WEBSOCKET_ERROR'
  | 'DATAREF_NOT_FOUND' | 'COMMAND_NOT_FOUND'
  | 'DATAREF_READONLY'
  | 'SUBSCRIPTION_FAILED' | 'WRITE_FAILED' | 'COMMAND_FAILED'
  | 'SIMULATOR_ERROR'                 // any other X-Plane error_code
  | 'CANCELLED'                       // pending request rejected by disconnect
  | 'INTERNAL' | 'UNKNOWN';

class AvionixError extends Error {
  readonly code: AvionixErrorCode;
  readonly retryable: boolean;
  readonly simulatorErrorCode?: string;   // X-Plane error_code when present
  readonly cause?: unknown;
}
```

Everything that crosses the application boundary is an `AvionixError`. Raw exceptions are wrapped, never rethrown to the UI.

### 6.4 HTTP transport (`infrastructure/xplane/http`)

- Constructor takes a base URL and options (timeout, default 5 s, fetch implementation injectable for tests).
- `request<T>(method, path, { query?, body?, schema })`: builds the URL, sets both JSON headers, applies an `AbortController` timeout, reads the body as text, parses JSON only when non-empty, maps status and payload:
  - 2xx with empty body → `undefined` (schema optional)
  - 2xx with body → validated by the given zod schema, else `INVALID_RESPONSE`
  - 403 with no `error_code` → `INCOMING_TRAFFIC_DISABLED`
  - non-2xx with a valid error payload → `SIMULATOR_ERROR` carrying `simulatorErrorCode`, or a more specific code when the caller maps it (`DATAREF_NOT_FOUND`, `DATAREF_READONLY`)
  - non-2xx without error payload → `HTTP_ERROR`
  - fetch rejection → `NETWORK_ERROR`; abort → `TIMEOUT`
- No retries. Retrying is the session's decision.

### 6.5 WebSocket transport (`infrastructure/xplane/websocket`)

- `connect(url, { timeout })` resolves on `open`, rejects with `WEBSOCKET_ERROR` or `TIMEOUT`.
- `RequestManager`: monotonically increasing `req_id` starting at 1 per socket lifetime, a `Map<number, Pending>` with per-request timeout (default 5 s). First `result` for a `req_id` settles the promise; later results for the same id are logged at debug level and dropped. Close rejects every pending request with `CANCELLED`.
- Incoming message pipeline: `JSON.parse` in try/catch → `IncomingMessageSchema` (discriminated union on `type`) → route to result handler, DataRef update handler, or command update handler. Malformed JSON and schema failures are logged and ignored. Unknown types are logged and ignored.
- Events: `onOpen`, `onClose(code, reason, wasClean)`, `onError`, `onDataRefUpdate(updates: DataRefUpdate[])`, `onCommandUpdate`.
- `send(type, params)` returns `Promise<void>` settled by the correlated result. `close()` is idempotent.
- The transport owns no reconnect logic.

### 6.6 XPlaneClient (`infrastructure/xplane/xplane-client.ts`)

```ts
interface XPlaneClient {
  getCapabilities(): Promise<SimulatorCapabilities>;          // unversioned path
  findDataRef(name: string): Promise<DataRefDescriptor | null>;
  findCommand(name: string): Promise<CommandDescriptor | null>;
  getDataRefValue(id: number, index?: number): Promise<DataRefValue>;
  setDataRefValue(id: number, value: DataRefValue, index?: number): Promise<void>;
  activateCommand(id: number, durationSeconds?: number): Promise<void>;   // REST, default 0
  connectWebSocket(): Promise<void>;
  subscribeDataRefs(subs: DataRefSubscription[]): Promise<void>;
  unsubscribeDataRefs(subs: DataRefSubscription[] | 'all'): Promise<void>;
  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void): Unsubscribe;
  onSocketClosed(listener: (info: SocketCloseInfo) => void): Unsubscribe;
  disconnectWebSocket(): void;
}
```

Constructed with a config, a negotiated `ApiVersion`, and the two transports. All versioned paths are built in one place (`domain/connection/endpoints.ts`).

### 6.7 Version negotiation (`api-version.ts`)

`negotiateApiVersion(capabilities, supportedByAvionix = ['v2', 'v3'])` returns the highest common version or throws `UNSUPPORTED_API` with a message naming the simulator version and the minimum required (12.1.4).

### 6.8 DataRef repository

Per-session cache keyed by name. `resolve(name)` performs one lookup per name and caches descriptors. Misses throw `DATAREF_NOT_FOUND`. `resolveMany(names)` resolves in parallel with de-duplication of in-flight lookups. `clear()` is called on every connect and reconnect attempt. IDs are never persisted.

### 6.9 SimulatorSession (`application/simulator-session.ts`)

Orchestrates the connect flow from the brief, step by step, publishing a snapshot after every step:

1. validate host and port (`INVALID_HOST`, `INVALID_PORT`)
2. `connecting`
3. capabilities → negotiate version
4. WebSocket connect
5. `connected`
6. resolve MVP DataRefs and command
7. subscribe telemetry DataRefs
8. stream

Snapshot shape (what the UI renders):

```ts
interface SessionSnapshot {
  state: ConnectionState;
  config: XPlaneConnectionConfig | null;
  capabilities: SimulatorCapabilities | null;
  apiVersion: ApiVersion | null;
  diagnostics: {
    http: StepStatus; capabilities: StepStatus; websocket: StepStatus;
    dataRefs: Record<string, StepStatus>; subscription: StepStatus;
  };
  telemetry: Record<string, { value: DataRefValue; receivedAt: number } | undefined>;
  lastOperation: { kind: 'write' | 'command'; ok: boolean; message: string; at: number } | null;
  error: AvionixError | null;
  reconnectAttempt: number;
}
type StepStatus = 'idle' | 'pending' | 'ok' | 'failed';
```

Public operations: `connect(config)`, `disconnect()`, `writeHeading(value)`, `activateHeadingUp()`. Every operation has a timeout and records `lastOperation`. `disconnect()` cancels reconnect timers, unsubscribes, closes the socket, and clears the repository.

Reconnect: on an unexpected socket close while `connected`, move to `reconnecting`, then attempt the full connect flow with delays 1 s, 2 s, 4 s, 8 s, 16 s (max 5 attempts, jitter ±20 %). Success returns to `connected`. Exhaustion moves to `error` with `WEBSOCKET_ERROR`. An explicit disconnect during reconnect wins. Backoff is a pure, tested function.

### 6.10 UI (`features/`)

One screen, deliberately plain, using core React Native components only:

- Connection form: host, port (default 8086), Connect, Disconnect. Prefilled from persisted settings.
- Status: state, X-Plane version, supported API versions, negotiated version, current error.
- Diagnostics: step list with YES / NO / pending per step, mirroring the brief's diagnostic layout.
- Telemetry: the three subscribed values with a "last update" age.
- Control: heading input with Write button, Heading Up button, last operation result.

No navigation library. No styling beyond spacing.

### 6.11 Configuration, persistence, networking

- `XPlaneConnectionConfig` is the only source of host and port. `endpoints.ts` derives `http://host:port/api/capabilities`, `http://host:port/api/{v}/...`, `ws://host:port/api/{v}`.
- Host validation accepts IPv4 literals and hostnames; rejects empty, whitespace, schemes, and paths. Port must be an integer from 1 to 65535.
- Settings store persists only `lastHost` and `lastPort` in AsyncStorage behind a `SettingsStorage` interface so tests use an in-memory fake.
- `app.json` includes: `ios.infoPlist.NSLocalNetworkUsageDescription`, `ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking: true`, and the `expo-build-properties` plugin with `android.usesCleartextTraffic: true`. These affect only future development or production builds; Expo Go already permits LAN traffic. Their correctness for IP-literal connections must be confirmed with a real development build and is listed as a known limitation until then.
- `docs/development.md` documents the LAN topology (phone → Wi-Fi → router → X-Plane PC), that localhost never works from a physical device, Android emulator host mapping (`10.0.2.2` reaches the emulator host only), and the X-Plane "Disable Incoming Traffic" setting.

### 6.12 Logging

`Logger` interface with `debug`, `info`, `warn`, `error`, created per category (`connection`, `http`, `websocket`, `dataref`, `command`, `session`). Console implementation in development, a no-op implementation available. Logs never include full DataRef dumps by default.

## 7. Testing

Jest 29 with two projects:

- `node` project: `testEnvironment: node`, Babel via `babel-preset-expo`, covers `tests/unit` (domain, infrastructure, application) and `tests/integration` and `tests/contract`. Uses Node's global `fetch` and `WebSocket` against the in-process mock server. Fake timers for timeouts and backoff.
- `expo` project: `preset: jest-expo`, covers hook and screen tests with `@testing-library/react-native`, using a fake `SimulatorSession`.

### 7.1 Mock X-Plane server (`tests/mock-xplane`)

Node `http` server plus `ws` WebSocket server on an ephemeral port, programmable per test:

- Capabilities with configurable versions and X-Plane version, or 404 (pre-12.1.4), or plain 403 (incoming traffic disabled).
- DataRef and command registries with names, ids, types, and values; name filter semantics; read-only DataRefs.
- Value read and write with index handling and X-Plane error codes.
- Command activate with duration validation.
- WebSocket: `req_id` correlation, subscribe / unsubscribe / set, periodic `dataref_update_values` with delta semantics, multiple results for one `req_id`, malformed and unknown message injection, forced close.

### 7.2 Coverage map

| Layer | Tests |
|---|---|
| Domain | state transitions (all legal edges and rejections), host and port validation, endpoint derivation, backoff schedule, version negotiation |
| Contract | fixtures from the doc for capabilities, DataRef, command, value read (number, array, base64), REST error, every WebSocket message type; strict rejection of malformed fixtures |
| HTTP transport | success, empty body success, HTTP error, malformed JSON, X-Plane error payload, plain 403, timeout, network failure, header presence |
| WebSocket transport | connect, connect timeout, disconnect, correlation, concurrent requests, duplicate results, malformed message, unknown type, request timeout, socket failure, pending rejection on close, subscribe lifecycle, update routing |
| DataRef repository | first resolution, cache hit, in-flight de-duplication, resolveMany, clear, not found |
| XPlaneClient | every method against the mock server for v2 and v3 paths |
| SimulatorSession | full connect flow, every failure step surfaces the right code and diagnostics, disconnect cleanup, reconnect success, reconnect exhaustion, explicit disconnect during reconnect, write and command results |
| Hooks and screen | snapshot rendering of each state, form validation messages, buttons call the session |

### 7.3 Real X-Plane smoke test

`docs/testing/xplane-smoke-test.md` with the ten steps from the brief, including the two-device test, the heading write and command echo, and a connection-loss drill (toggle "Disable Incoming Traffic" or Wi-Fi). Results are recorded manually; the MVP is not done until this passes on a real X-Plane 12.1.4+ installation with two physical devices.

## 8. CI

GitHub Actions on push and pull request: `npm ci`, `npx expo lint`, `npx prettier --check .`, `npx tsc --noEmit`, `npm test` (both Jest projects), and `npx expo export --platform android,ios` as a bundle build validation. No emulators. No X-Plane.

## 9. Documentation

`README.md` (what, scope, stack, architecture summary, setup, run, connect, limitations, test commands), `docs/architecture.md` (layers and why the simulator is isolated), `docs/development.md` (Expo Go login requirement, LAN setup per device type, X-Plane settings), `docs/xplane.md` (the verified protocol facts from section 3 and the chosen DataRefs from section 4), `docs/testing/xplane-smoke-test.md`.

## 10. Acceptance criteria

The brief's section 36 list applies unchanged, with these clarifications:

- "App detects supported API versions" means the raw list is displayed and the negotiated version is shown.
- "App can retrieve/resolve a command" is satisfied by name lookup of `sim/autopilot/heading_up`.
- "Socket disconnect is detected" includes the automatic transition to `reconnecting` and, after exhaustion, `error`.
- Two-device and real-simulator criteria are verified manually via the smoke test and recorded in the README.

## 11. Non-goals

Unchanged from the brief's section 37. Additionally out of scope: API v1 support, the v3 flight API, WebSocket-held commands in the UI, base64 `data` DataRef decoding in the UI (schema accepts it, UI displays the raw string), and any native module.

## 12. Known risks

- The doc's value-read example is wrong; the schema accepts number, number array, and string, and the smoke test confirms the real shape on first contact.
- iOS ATS behaviour for `http://` to IP literals in a development build is untested until a build exists. Expo Go is unaffected.
- X-Plane version strings may carry suffixes (betas). The version is stored raw and only displayed; nothing parses it for logic.
- Laminar's `DataRefs.txt` copy used for verification is from 2023. All four names are long-standing and are resolved at runtime anyway.
