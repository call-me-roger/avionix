# Avionix connector discovery — design

Date: 2026-09-15. Status: approved in chat, pending user review of this document.

Sub-project 3 of the Avionix Connector work. Sub-project 1 (the connector protocol on the
bridge, `docs/connector.md`) and sub-project 2 (app pairing,
`docs/superpowers/specs/2026-09-15-app-pairing-design.md`) are merged.

## Goal

The app lists the Avionix Connectors advertised on the local network and connects to one with a
single tap. Discovery runs by itself while the app is disconnected and stops when it connects
or goes to the background. Typing a host and port keeps working exactly as before. The UI never
learns how mDNS works: it sees a snapshot with a list of connectors and calls one function on a
tap.

## Decisions (approved 2026-09-15)

- Scanning is automatic while the app is in the foreground and the session is `disconnected`
  or `error`. No scan button.
- Tapping a discovered connector fills host and port, persists them, and connects. If the
  connector needs pairing, the existing code prompt appears as it does today.
- Discovery uses `react-native-zeroconf` (0.14.0, MIT) behind a `ServiceBrowser` port. Expo Go
  and the web get a null browser. Two alternatives were considered and rejected:
  `@inthepocket/react-native-service-discovery` (same shape, a tenth of the adoption,
  unconfirmed new-architecture support) and an HTTP sweep of the /24 subnet (no native module,
  but slow, noisy and blind outside the subnet; it can still be added later behind the same
  port).
- Discovery needs a development build. Expo Go keeps working for everything else and shows a
  one-line hint instead of the list.

## Connector facts the app relies on

From `scripts/avionix-bridge.js` and `scripts/avionix-connector-mdns.js`: the connector
publishes a DNS-SD service of type `_avionix._tcp` in the `local.` domain, instance name from
`--name` (default `Avionix Connector (<hostname>)`), port = the bridge port, TXT records
`v=1` and `pairing=1|0`. `--no-mdns` disables the advertisement. The bridge already answers
`GET /avionix/info` without authentication, which is how the connect flow confirms a connector
after a tap; discovery does not call it.

## Library facts the adapter relies on

`react-native-zeroconf` 0.14.0 (`dist/index.js`, verified 2026-09-15):

- Exposes a default `Zeroconf` class (a Node-style `EventEmitter`) and `ImplType`
  (`'NSD' | 'DNSSD'`, Android only). The native module is read once as
  `NativeModules.RNZeroconf`; the constructor never throws when it is missing, but `scan()`
  and `stop()` throw a `TypeError`. Presence of `NativeModules.RNZeroconf` is therefore the
  availability test.
- `scan(type, protocol, domain, implType)`: `type` is the bare service type (`'avionix'`),
  `protocol` `'tcp'`, `domain` `'local.'`. `stop(implType)` stops the current scan.
- Events: `start`, `stop`, `update`, `found` (instance name), `resolved` (service object),
  `remove` (instance name), `error` (`Error`). The `error` event is only emitted when a
  listener is attached; the adapter always attaches one.
- Resolved service object keys (iOS `RNNetServiceSerializer.m`, Android `NsdServiceImpl.java`):
  `name`, `fullName`, `host`, `port`, `addresses` (string array, IPv4 and IPv6 mixed), `txt`
  (string map).
- Ships no TypeScript declarations. The app declares the surface it uses in
  `src/types/react-native-zeroconf.d.ts` (module declaration, no `any`; every payload that
  crosses from native is still validated with zod).
- Android: the native side acquires and releases a multicast lock itself. The README requires
  `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` and `CHANGE_WIFI_MULTICAST_STATE`.
  Android emulators have no multicast; physical devices only. The Android implementation type
  is `NSD` (the platform API). The embedded mDNSResponder variant (`DNSSD`) is the alternative
  if NSD misbehaves on a device; it is a single constant in the adapter.
- iOS 14+ requires the browsed types in `NSBonjourServices` and a
  `NSLocalNetworkUsageDescription`. Both go in `app.json`; no config plugin is needed.

## Domain (`src/domain/discovery/`)

### `discovered-connector.ts`

```ts
export interface DiscoveredConnector {
  /** DNS-SD instance name, unique on the LAN; the list key. */
  name: string;
  /** IPv4 address when advertised, else the advertised hostname without its trailing dot. */
  host: string;
  port: number;
  /** From the `pairing` TXT record: `'1'` → true, `'0'` → false, anything else → null. */
  pairingRequired: boolean | null;
}
```

### `service-browser.ts`

A generic DNS-SD browsing port. Nothing in it is specific to Avionix except the constant.

```ts
export const AVIONIX_SERVICE_TYPE = 'avionix';

export interface BrowsedService {
  name: string;
  host: string;
  port: number;
  addresses: string[];
  txt: Record<string, string>;
}

export interface ServiceBrowserListener {
  resolved(service: BrowsedService): void;
  removed(name: string): void;
  error(error: AvionixError): void;
}

export type ServiceBrowserAvailability = 'available' | 'needsDevBuild' | 'unsupported';

export interface ServiceBrowser {
  readonly availability: ServiceBrowserAvailability;
  /** Starts browsing `type` (bare, e.g. `'avionix'`); the returned function stops it. */
  browse(type: string, listener: ServiceBrowserListener): () => void;
}
```

`availability` meanings: `available` (a native browser is present), `needsDevBuild` (native
platform, native module missing: Expo Go), `unsupported` (web).

### Error code

`AvionixErrorCode` gains `DISCOVERY_ERROR` (never retryable; `cause` carries the library error).

## Infrastructure (`src/infrastructure/discovery/`)

### `zeroconf-service-browser.ts`

`createZeroconfServiceBrowser(deps)` where `deps` is `{ createZeroconf: () => ZeroconfLike;
logger: Logger }`. `ZeroconfLike` is the subset the adapter uses (`scan`, `stop`, `on`,
`removeListener`, `removeDeviceListeners`), declared next to the adapter, so tests inject a
fake emitter and never load the library. `availability` is `'available'`.

`browse(type, listener)`:

1. Creates one `Zeroconf` instance per browse and attaches `resolved`, `remove` and `error`
   handlers.
2. Calls `scan(type, 'tcp', 'local.', 'NSD')`. On Android the implementation type is `'NSD'`; on
   iOS the argument is ignored by the library.
3. Every `resolved` payload is parsed with zod (`resolvedServiceSchema`: `name` non-empty
   string, `host` string, `port` integer 1–65535, `addresses` array of strings defaulting to
   `[]`, `txt` record of strings defaulting to `{}`; unknown keys ignored). A payload that fails
   is logged at `warn` and dropped. A valid payload is forwarded as `BrowsedService` unchanged.
4. `remove` forwards the name. `error` forwards `new AvionixError({ code: 'DISCOVERY_ERROR',
   message: 'Connector discovery failed', cause })`.
5. The stop function is idempotent: it calls `stop('NSD')`, removes the handlers and calls
   `removeDeviceListeners()`. Library exceptions from `scan` or `stop` are caught, logged and
   reported as `DISCOVERY_ERROR` (a missing native module can only be reached by bypassing the
   platform factory, but the adapter still must not throw).

### `null-service-browser.ts`

`createNullServiceBrowser(availability: 'needsDevBuild' | 'unsupported')`: `browse` returns a
no-op stop and never calls the listener.

## Platform (`src/platform/`)

- `service-browser.ts` (native): if `NativeModules.RNZeroconf` is non-null, the zeroconf
  browser with `createZeroconf: () => new Zeroconf()`; else the null browser tagged
  `needsDevBuild`. This is the only file that imports `react-native-zeroconf`.
- `service-browser.web.ts`: the null browser tagged `unsupported`. It never imports the
  library, so the web bundle does not carry it.

Both export `createPlatformServiceBrowser(): ServiceBrowser`. Metro picks the `.web.ts` file for
the web target; the `web` Jest project (jest-expo/web) resolves platform extensions the same
way.

## Application (`src/application/connector-discovery.ts`)

```ts
export interface DiscoverySnapshot {
  availability: ServiceBrowserAvailability;
  scanning: boolean;
  /** Sorted by name (localeCompare), one entry per instance name. */
  connectors: DiscoveredConnector[];
  error: AvionixError | null;
}

export class ConnectorDiscovery {
  readonly store: Store<DiscoverySnapshot>;
  constructor(deps: { browser: ServiceBrowser; logger: Logger });
  start(): void;
  stop(): void;
}
```

Behaviour:

- Initial snapshot: `availability` from the browser, `scanning: false`, `connectors: []`,
  `error: null`.
- `start()` when already scanning is a no-op. Otherwise it increments the generation counter,
  clears `error`, sets `scanning: true` and calls `browser.browse(AVIONIX_SERVICE_TYPE,
  listener)`. When `availability !== 'available'` it is a no-op too (the null browser would
  do nothing, but the snapshot must not claim `scanning`).
- `stop()` when not scanning is a no-op. Otherwise it increments the generation, calls the
  stop function, and sets `scanning: false, connectors: []`. Clearing is deliberate: a PC
  that went away while the app was in the background must not be shown as present.
- Every listener callback checks the generation it was created for and drops late events.
- `resolved(service)` maps to `DiscoveredConnector` and replaces or inserts by `name`:
  - `host` = first entry of `addresses` that matches the IPv4 pattern of
    `validateHost` (four dotted octets); else `service.host` with one trailing `.` removed;
    if that is empty, the service is skipped with a `warn` log. IPv6-only services are thus
    skipped when they carry no usable hostname.
  - `pairingRequired` from `txt.pairing` as defined in the domain type.
  - The `v` TXT record is not stored or checked; the `/avionix/info` probe on connect is the
    compatibility check.
- `removed(name)` deletes the entry, if present.
- `error(error)` increments the generation, calls the stop function, and sets `error` and
  `scanning: false`; the list is kept. There is no automatic retry; the next `start()`
  (foreground or state change) retries.

## UI

### `src/hooks/useConnectorDiscovery.ts`

```ts
export function useConnectorDiscovery(sessionState: ConnectionState): DiscoverySnapshot;
```

Subscribes to `discovery.store` with `useSyncExternalStore`. An effect computes
`shouldScan = appActive && (sessionState === 'disconnected' || sessionState === 'error')`, where
`appActive` follows `AppState` (`'active'` only; the initial value is
`AppState.currentState === 'active'`, and on the web `AppState` reports `active`). The effect
calls `discovery.start()` when `shouldScan` becomes true and `discovery.stop()` when it becomes
false or the hook unmounts. No state is set inside the effect (the repo's
`react-hooks/set-state-in-effect` rule): the `AppState` value is read through
`useSyncExternalStore` on `AppState.addEventListener('change', …)`.

### `src/hooks/useConnectionSettings.ts`

Gains `setConnection(host: string, port: number): Promise<void>`: sets both state values and
saves them through `saveConnectionSettings` with the given values (not the closure's state).
`persist()` stays for the Connect button.

### `src/features/connection/DiscoveredConnectors.tsx`

Props: `snapshot: DiscoverySnapshot`, `enabled: boolean` (true while the session is
`disconnected` or `error`), `onSelect(connector: DiscoveredConnector): void`.

When `enabled` is false the component renders nothing: a list only makes sense while a tap
can act on it, and it would clutter the pairing prompt and the connected screen. Otherwise,
by `snapshot.availability`:

- `unsupported`: renders nothing.
- `needsDevBuild`: a `Section` titled "Connectors on this network" with one `BodyText`:
  "Connector discovery needs the Avionix development build."
- `available`: the same section; then, in order:
  - the rows, one `Pressable` per connector (testID `discovered-<name>`, accessibilityRole
    `button`): the name in bold, `host:port` beneath, and a tag
    "Needs pairing" (`pairingRequired === true`), "Open" (`false`) or none (`null`);
  - when there are no rows and `scanning` is true: "Looking for connectors…";
  - when there are no rows and `scanning` is false and `error` is null: "No connectors found
    yet." (only in the brief window before the hook's effect starts the scan);
  - when `error` is non-null: "Discovery failed: {error.message}".

Colours and spacing come from the theme; no literals in the component.

### `src/features/mvp/MvpScreen.tsx`

Renders `DiscoveredConnectors` directly under `ConnectionForm`, with
`enabled = snapshot.state === 'disconnected' || snapshot.state === 'error'` and
`onSelect = (c) => { void settings.setConnection(c.host, c.port); void connect(c.host,
String(c.port)); }`. `connect` runs the existing flow, including the `/avionix/info` probe and
pairing.

### Composition

`AppServices` gains `discovery: ConnectorDiscovery`. `createAppServices()` builds it with
`createPlatformServiceBrowser()` and `createLogger('discovery')` (a new logger category, listed
in `docs/development.md`). Test roots inject a fake `ServiceBrowser`.

## App config (`app.json`)

- `ios.infoPlist.NSBonjourServices`: `["_avionix._tcp"]`.
- `ios.infoPlist.NSLocalNetworkUsageDescription`: "Avionix finds Avionix Connectors and
  connects to X-Plane on your local network."
- `android.permissions`: `["ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE",
  "CHANGE_WIFI_MULTICAST_STATE"]` (`INTERNET` is implied by Expo).

`react-native-zeroconf` is pinned to `0.14.0` in `dependencies`. `expo-dev-client` and the
`build:dev:*` scripts already exist; the user runs the builds.

## Error handling summary

| Situation | Behaviour |
| --- | --- |
| iOS local-network permission denied | No events, no error. Empty state stays "Looking for connectors…"; the smoke test names the Settings toggle. |
| Android NSD error | `DISCOVERY_ERROR` in the snapshot, `scanning` false, list kept, no retry loop. |
| Malformed resolved payload | Dropped with a `warn` log. |
| Service with no IPv4 and no hostname | Dropped with a `warn` log. |
| Same instance resolved twice | Row replaced in place. |
| `start()` twice, `stop()` when stopped | No-op. |
| Event after `stop()` | Dropped by the generation check. |
| Session busy, pairing or connected | The section is not rendered. |
| Native module missing (Expo Go) | Hint line, no scan, no error. |
| Web | Section not rendered. |

## Testing

- **Node unit** (`tests/unit/application/connector-discovery.test.ts`) with a fake browser
  that records `browse` calls and exposes the listener: start/stop idempotence, `scanning`
  flag, sorted list, replace on re-resolve, removal, IPv4 preference, hostname fallback and
  trailing-dot removal, skip without usable host, TXT parsing to `pairingRequired`, clear on
  stop, error path, late event after stop ignored, no-op when unavailable.
- **Node unit** (`tests/unit/infrastructure/zeroconf-service-browser.test.ts`) with a fake
  `ZeroconfLike` emitter: `scan` arguments, valid payload forwarded, invalid payload dropped and
  logged, `remove` and `error` forwarded, stop idempotent and listeners removed, exceptions
  from `scan` reported as `DISCOVERY_ERROR`. Plus one test for the null browser.
- **Expo UI** (`tests/ui/mvp-screen.test.tsx`, new cases) with a fake browser injected through
  the services: rows render from resolved services; a tap sets host and port in the form and
  calls `connect` with them; the `needsDevBuild` hint renders; the browse is stopped after the
  session reports `connected` and restarted after `disconnect`.
- **Web** (`tests/web/mvp-screen.web.test.tsx`): the section is absent.
- The default composition root works under jest-expo without mocks: the native module is
  absent there, so the platform factory yields the `needsDevBuild` null browser.
- No real mDNS test in CI: runners have no reliable multicast, and the bridge's advertisement
  is already covered by its own tests. Real discovery is a smoke-test step.

## Documentation

- `README.md`: discovery moves from "Not in scope" to the scope list; requirements note that
  discovery needs a development build; the "IP must be typed" limitation is replaced by "in
  Expo Go and on the web".
- `docs/connector.md`: the Discovery section gains the app side (what is listed, tap
  behaviour, permissions, dev build).
- `docs/architecture.md`: layer table entries, the discovery flow next to the connect flow,
  and a paragraph on why discovery is a port with a null implementation.
- `docs/development.md`: `discovery` logger category; the development-build section says
  discovery is the first feature that needs one.
- `docs/testing/xplane-smoke-test.md`: a discovery block: the iOS permission prompt (and the
  Settings toggle if denied), the connector appearing within a few seconds with the right tag,
  tap connects (and pairs when needed), the row disappearing after the connector is stopped
  with the app in the foreground, and Expo Go showing the hint.

## Out of scope

- Publishing a service from the app, QR codes, an HTTP subnet sweep, remembering connectors
  seen earlier, and showing whether a listed connector is already paired.
- Any change to the bridge or the connector protocol.
