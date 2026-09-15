# Avionix Connector Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Avionix app lists the Avionix Connectors advertised over mDNS on the local network while it is disconnected, and connects to one with a single tap; Expo Go and the web keep working without the native module.

**Architecture:** A generic DNS-SD `ServiceBrowser` port in the domain has two implementations: a `react-native-zeroconf` adapter (every native payload validated with zod) and a null browser tagged with why it does nothing (`needsDevBuild` in Expo Go, `unsupported` on the web). A platform factory picks one at composition time. `ConnectorDiscovery` in the application layer owns a `Store<DiscoverySnapshot>`, maps resolved services to `DiscoveredConnector` rows, and exposes idempotent `start()` / `stop()` guarded by a generation counter. A hook starts discovery while the app is in the foreground and the session is `disconnected` or `error`, and a `DiscoveredConnectors` section under the connection form renders the rows; a tap sets and persists host and port and calls the existing `connect`.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, zod 4, `react-native-zeroconf` 0.14.0 (pinned), Jest 29 via `jest-expo` with three projects (`node`, `expo`, `web`), `@testing-library/react-native` 14 (`render`/`renderHook`/`fireEvent`/`act` are awaited).

**Spec:** `docs/superpowers/specs/2026-09-15-connector-discovery-design.md` (sub-project 3 of the Avionix Connector work; sub-projects 1 and 2 are merged: `docs/connector.md`, `docs/superpowers/specs/2026-09-15-app-pairing-design.md`).

## Global Constraints

- Scanning is automatic while the app is in the foreground and the session is `disconnected` or `error`. No scan button.
- Tapping a discovered connector fills host and port, persists them, and connects. Pairing, if needed, flows through the existing prompt unchanged.
- Discovery uses `react-native-zeroconf` pinned to `0.14.0` behind the `ServiceBrowser` port. `src/platform/service-browser.ts` is the **only** file that imports `react-native-zeroconf`; `src/platform/service-browser.web.ts` never imports it.
- The connector advertises type `_avionix._tcp` in `local.`; the app scans with `scan('avionix', 'tcp', 'local.', 'NSD')` (the fourth argument is Android-only and ignored on iOS by the library).
- Resolved payload keys from the native side: `name`, `fullName`, `host`, `port`, `addresses`, `txt`. Every resolved payload is validated with zod before use; failures are logged at `warn` and dropped.
- `DiscoveredConnector.host` is the first IPv4 address in `addresses`, else `host` without one trailing `.`; a service with neither is dropped with a `warn` log. `pairingRequired` is `true` for TXT `pairing=1`, `false` for `pairing=0`, else `null`. The `v` TXT record is not stored.
- New `AvionixErrorCode`: `DISCOVERY_ERROR` (not retryable). New `LogCategory`: `discovery`.
- UI copy, verbatim: section title "Connectors on this network"; hint "Connector discovery needs the Avionix development build."; empty states "Looking for connectors…" (scanning) and "No connectors found yet." (not scanning, no error); tags "Needs pairing" / "Open"; error line "Discovery failed: {message}".
- The section renders nothing while the session is anything other than `disconnected` or `error`, and nothing on the web (`unsupported`).
- `app.json`: `ios.infoPlist.NSBonjourServices` = `["_avionix._tcp"]`; `ios.infoPlist.NSLocalNetworkUsageDescription` = "Avionix finds Avionix Connectors and connects to X-Plane on your local network."; `android.permissions` = `["ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE", "CHANGE_WIFI_MULTICAST_STATE"]`.
- No `any`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable` without a stated reason, and no `as T` casts that bypass validation, in any TypeScript file. (`as const` on literals is fine.)
- No state updates inside `useEffect` (`react-hooks/set-state-in-effect` is an error in this repo). Read external state through `useSyncExternalStore`.
- Prettier: `singleQuote`, `trailingComma: 'all'`, `printWidth: 100`, `semi: true`. `docs/` is in `.prettierignore`: documentation is **not** formatted by Prettier — do not reformat it to satisfy `format:check`.
- Quality gate before every commit: `npm run typecheck && npm run lint && npm run format:check && npm test`. The code blocks in this plan show the intended content, not byte-exact Prettier output: if `format:check` complains about a file you just pasted into, run `npx prettier --write <file>` and re-read the diff — the Prettier config is authoritative.
- `tsconfig.json` sets `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch`: every index access into a `Record<string, T>` yields `T | undefined` and must be narrowed or defaulted.
- Jest tip: `npx jest --selectProjects node <file>` does **not** filter to the file in this repo; run a single file with `npx jest <path>` (all projects) or `npx jest <path> -t '<name>'`.
- Device verification is the user's job: never launch Xcode, Android Studio, an iOS simulator, an Android emulator, `expo start`, or an EAS build.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Decisions taken where the spec leaves a detail open

These hold across every task; do not re-decide them per task.

1. **"Foreground" means `AppState.currentState !== 'background'`.** iOS reports `inactive` during app switching and the control centre; treating it as background would clear and restart the list on every swipe. Android reports `unknown` briefly at launch. Under jest-expo `AppState.currentState` is a `jest.fn` (the preset's mock), which this rule also counts as foreground, so UI tests run discovery without mocking `AppState`.
2. **The mapping from `BrowsedService` to `DiscoveredConnector` is a pure domain function** `discoveredConnectorFrom(service)` in `src/domain/discovery/discovered-connector.ts`, returning `null` when no usable host exists. `ConnectorDiscovery` calls it and logs the `null` case. `isValidIpv4` in `src/domain/connection/connection-config.ts` becomes exported so the IPv4 test is not duplicated.
3. **`txt` and `addresses` use zod `.catch()` defaults**, not `.default()`: a TXT record with a non-string value or a malformed address list must not hide the connector. `name` and `port` failures do drop the payload.
4. **A synchronous listener error during `browse()`** (the adapter's `scan()` threw) is handled: `ConnectorDiscovery.start()` compares the generation after `browse()` returns and, if the error handler already bumped it, calls the returned stop function immediately instead of keeping it.
5. **The shared fake browser lives in `tests/support/fake-service-browser.ts`** and is used by the node, expo and web tests. It records browse calls, exposes the active listener, and can fail synchronously on `browse()`.
6. **`AppServices.discovery` is `Pick<ConnectorDiscovery, 'store' | 'start' | 'stop'>`** (named `DiscoveryApi`), mirroring `SessionApi`. Test fixtures build a real `ConnectorDiscovery` over the fake browser; it is pure TypeScript.
7. **The platform factory takes the logger**: `createPlatformServiceBrowser(logger: Logger)`. The web variant logs one `debug` line so its parameter is used and the two signatures match.
8. **The hook starts discovery from an effect whose cleanup stops it**: `useEffect(() => { if (!shouldScan) return; discovery.start(); return () => discovery.stop(); }, [discovery, shouldScan])`. No state is set in the effect.

---

## File map

| File | Responsibility | Task |
| --- | --- | --- |
| `src/domain/discovery/discovered-connector.ts` | `DiscoveredConnector` type, `discoveredConnectorFrom()` | 1 |
| `src/domain/discovery/service-browser.ts` | `ServiceBrowser` port, `BrowsedService`, listener, availability, `AVIONIX_SERVICE_TYPE` | 1 |
| `src/domain/connection/connection-config.ts` | export `isValidIpv4` | 1 |
| `src/domain/errors/avionix-error.ts` | `DISCOVERY_ERROR` | 1 |
| `src/infrastructure/logging/logger.ts` | `discovery` category | 1 |
| `src/infrastructure/discovery/null-service-browser.ts` | no-op browser with an availability tag | 1 |
| `src/types/react-native-zeroconf.d.ts` | ambient module declaration | 2 |
| `src/infrastructure/discovery/zeroconf-service-browser.ts` | adapter over `react-native-zeroconf`, zod validation | 2 |
| `tests/support/fake-service-browser.ts` | shared fake browser | 3 |
| `src/application/connector-discovery.ts` | `ConnectorDiscovery`, `DiscoverySnapshot` | 3 |
| `src/platform/service-browser.ts`, `.web.ts` | platform factories | 4 |
| `src/app/services-context.tsx`, `src/app/composition-root.ts` | `discovery` service | 4 |
| `app.json`, `package.json` | permissions, Bonjour types, dependency | 4 |
| `src/hooks/useAppForeground.ts`, `src/hooks/useConnectorDiscovery.ts`, `src/hooks/useConnectionSettings.ts` | lifecycle hook, `setConnection` | 5 |
| `src/features/connection/DiscoveredConnectors.tsx`, `src/features/mvp/MvpScreen.tsx` | list section and wiring | 6 |
| `README.md`, `docs/connector.md`, `docs/architecture.md`, `docs/development.md`, `docs/testing/xplane-smoke-test.md` | documentation | 7 |

---

### Task 1: Domain types, error code, logger category, null browser

**Files:**
- Create: `src/domain/discovery/discovered-connector.ts`
- Create: `src/domain/discovery/service-browser.ts`
- Create: `src/infrastructure/discovery/null-service-browser.ts`
- Modify: `src/domain/connection/connection-config.ts` (export `isValidIpv4`)
- Modify: `src/domain/errors/avionix-error.ts` (add `'DISCOVERY_ERROR'` to `AvionixErrorCode`)
- Modify: `src/infrastructure/logging/logger.ts` (add `'discovery'` to `LogCategory`)
- Test: `tests/unit/domain/discovered-connector.test.ts`
- Test: `tests/unit/infrastructure/null-service-browser.test.ts`

**Interfaces:**
- Consumes: `AvionixError` (`src/domain/errors/avionix-error.ts`), `isValidIpv4` (private today in `connection-config.ts`).
- Produces (later tasks rely on these exact names):
  - `DiscoveredConnector { name: string; host: string; port: number; pairingRequired: boolean | null }`
  - `discoveredConnectorFrom(service: BrowsedService): DiscoveredConnector | null`
  - `AVIONIX_SERVICE_TYPE = 'avionix'`
  - `BrowsedService { name: string; host: string; port: number; addresses: string[]; txt: Record<string, string> }`
  - `ServiceBrowserListener { resolved(service: BrowsedService): void; removed(name: string): void; error(error: AvionixError): void }`
  - `ServiceBrowserAvailability = 'available' | 'needsDevBuild' | 'unsupported'`
  - `ServiceBrowser { readonly availability: ServiceBrowserAvailability; browse(type: string, listener: ServiceBrowserListener): () => void }`
  - `createNullServiceBrowser(availability: 'needsDevBuild' | 'unsupported'): ServiceBrowser`
  - `AvionixErrorCode` includes `'DISCOVERY_ERROR'`; `LogCategory` includes `'discovery'`.

- [ ] **Step 1: Write the failing domain test**

Create `tests/unit/domain/discovered-connector.test.ts`:

```ts
import type { BrowsedService } from '@/domain/discovery/service-browser';
import { discoveredConnectorFrom } from '@/domain/discovery/discovered-connector';

function service(overrides: Partial<BrowsedService> = {}): BrowsedService {
  return {
    name: 'Avionix Connector (sim-pc)',
    host: 'sim-pc.local.',
    port: 8080,
    addresses: ['fe80::1', '192.168.1.20'],
    txt: { v: '1', pairing: '1' },
    ...overrides,
  };
}

describe('discoveredConnectorFrom', () => {
  it('prefers the first IPv4 address and reads the pairing flag', () => {
    expect(discoveredConnectorFrom(service())).toEqual({
      name: 'Avionix Connector (sim-pc)',
      host: '192.168.1.20',
      port: 8080,
      pairingRequired: true,
    });
  });

  it('takes the first IPv4 address when several are advertised', () => {
    expect(
      discoveredConnectorFrom(service({ addresses: ['10.0.0.5', '192.168.1.20'] }))?.host,
    ).toBe('10.0.0.5');
  });

  it('falls back to the hostname without its trailing dot', () => {
    expect(discoveredConnectorFrom(service({ addresses: ['fe80::1'] }))?.host).toBe(
      'sim-pc.local',
    );
    expect(discoveredConnectorFrom(service({ addresses: [], host: 'sim-pc.local' }))?.host).toBe(
      'sim-pc.local',
    );
  });

  it('returns null when neither an IPv4 address nor a hostname is usable', () => {
    expect(discoveredConnectorFrom(service({ addresses: [], host: '' }))).toBeNull();
    expect(discoveredConnectorFrom(service({ addresses: ['fe80::1'], host: '.' }))).toBeNull();
  });

  it('ignores addresses that only look like IPv4', () => {
    expect(discoveredConnectorFrom(service({ addresses: ['999.1.1.1', '1.2.3'] }))?.host).toBe(
      'sim-pc.local',
    );
  });

  it('maps pairing=0 to false and anything else to null', () => {
    expect(discoveredConnectorFrom(service({ txt: { pairing: '0' } }))?.pairingRequired).toBe(
      false,
    );
    expect(discoveredConnectorFrom(service({ txt: {} }))?.pairingRequired).toBeNull();
    expect(
      discoveredConnectorFrom(service({ txt: { pairing: 'yes' } }))?.pairingRequired,
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing null-browser test**

Create `tests/unit/infrastructure/null-service-browser.test.ts`:

```ts
import { createNullServiceBrowser } from '@/infrastructure/discovery/null-service-browser';

describe('createNullServiceBrowser', () => {
  it('carries the availability it was given and never calls the listener', () => {
    const browser = createNullServiceBrowser('needsDevBuild');
    expect(browser.availability).toBe('needsDevBuild');
    expect(createNullServiceBrowser('unsupported').availability).toBe('unsupported');
    const listener = { resolved: jest.fn(), removed: jest.fn(), error: jest.fn() };
    const stop = browser.browse('avionix', listener);
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
    expect(listener.resolved).not.toHaveBeenCalled();
    expect(listener.removed).not.toHaveBeenCalled();
    expect(listener.error).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx jest tests/unit/domain/discovered-connector.test.ts tests/unit/infrastructure/null-service-browser.test.ts`
Expected: FAIL with "Cannot find module '@/domain/discovery/…'" (and the null browser module).

- [ ] **Step 4: Export `isValidIpv4` and add the error code and logger category**

In `src/domain/connection/connection-config.ts` change the private function to an export (body unchanged):

```ts
export function isValidIpv4(host: string): boolean {
```

In `src/domain/errors/avionix-error.ts`, add to the `AvionixErrorCode` union, right after `'UNAUTHORIZED'`:

```ts
  | 'DISCOVERY_ERROR'
```

In `src/infrastructure/logging/logger.ts`:

```ts
export type LogCategory =
  | 'connection'
  | 'http'
  | 'websocket'
  | 'dataref'
  | 'command'
  | 'session'
  | 'discovery'
  | 'ui';
```

- [ ] **Step 5: Create the port**

Create `src/domain/discovery/service-browser.ts`:

```ts
import type { AvionixError } from '@/domain/errors/avionix-error';

/** Bare DNS-SD service type of the Avionix Connector (`_avionix._tcp` on the wire). */
export const AVIONIX_SERVICE_TYPE = 'avionix';

/** A resolved DNS-SD service as the platform browser reports it. */
export interface BrowsedService {
  /** Instance name, unique on the LAN. */
  name: string;
  /** Advertised hostname, usually with a trailing dot (`sim-pc.local.`); may be empty. */
  host: string;
  port: number;
  /** IPv4 and IPv6 literals, in the order the platform reported them. */
  addresses: string[];
  txt: Record<string, string>;
}

export interface ServiceBrowserListener {
  resolved(service: BrowsedService): void;
  removed(name: string): void;
  error(error: AvionixError): void;
}

/**
 * `available`: a native browser is present. `needsDevBuild`: native platform but the native
 * module is missing (Expo Go). `unsupported`: the platform has no mDNS browsing at all (web).
 */
export type ServiceBrowserAvailability = 'available' | 'needsDevBuild' | 'unsupported';

/** Generic DNS-SD browsing. Nothing here knows about Avionix except the constant above. */
export interface ServiceBrowser {
  readonly availability: ServiceBrowserAvailability;
  /** Starts browsing the bare `type` (e.g. `'avionix'`); the returned function stops it. */
  browse(type: string, listener: ServiceBrowserListener): () => void;
}
```

- [ ] **Step 6: Create the domain type and mapping**

Create `src/domain/discovery/discovered-connector.ts`:

```ts
import { isValidIpv4 } from '@/domain/connection/connection-config';
import type { BrowsedService } from '@/domain/discovery/service-browser';

export interface DiscoveredConnector {
  /** DNS-SD instance name, unique on the LAN; the list key. */
  name: string;
  /** IPv4 address when advertised, else the advertised hostname without its trailing dot. */
  host: string;
  port: number;
  /** From the `pairing` TXT record: `'1'` → true, `'0'` → false, anything else → null. */
  pairingRequired: boolean | null;
}

function pairingFlag(txt: Record<string, string>): boolean | null {
  const value = txt.pairing;
  if (value === '1') {
    return true;
  }
  if (value === '0') {
    return false;
  }
  return null;
}

function usableHost(service: BrowsedService): string | null {
  const ipv4 = service.addresses.find((address) => isValidIpv4(address));
  if (ipv4 !== undefined) {
    return ipv4;
  }
  const hostname = service.host.endsWith('.') ? service.host.slice(0, -1) : service.host;
  return hostname.length > 0 ? hostname : null;
}

/** Null when the service advertises neither an IPv4 address nor a hostname. */
export function discoveredConnectorFrom(service: BrowsedService): DiscoveredConnector | null {
  const host = usableHost(service);
  if (host === null) {
    return null;
  }
  return {
    name: service.name,
    host,
    port: service.port,
    pairingRequired: pairingFlag(service.txt),
  };
}
```

- [ ] **Step 7: Create the null browser**

Create `src/infrastructure/discovery/null-service-browser.ts`:

```ts
import type { ServiceBrowser, ServiceBrowserAvailability } from '@/domain/discovery/service-browser';

/** A browser that finds nothing, tagged with the reason so the UI can explain itself. */
export function createNullServiceBrowser(
  availability: Exclude<ServiceBrowserAvailability, 'available'>,
): ServiceBrowser {
  return {
    availability,
    browse: () => () => undefined,
  };
}
```

- [ ] **Step 8: Run the tests and the gate**

Run: `npx jest tests/unit/domain/discovered-connector.test.ts tests/unit/infrastructure/null-service-browser.test.ts`
Expected: PASS (7 tests).

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all green. If `format:check` flags a new file, `npx prettier --write` it.

- [ ] **Step 9: Commit**

```bash
git add src/domain/discovery src/infrastructure/discovery/null-service-browser.ts src/domain/connection/connection-config.ts src/domain/errors/avionix-error.ts src/infrastructure/logging/logger.ts tests/unit/domain/discovered-connector.test.ts tests/unit/infrastructure/null-service-browser.test.ts
git commit -m "feat(discovery): add the service browser port, the discovered connector type and the null browser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The react-native-zeroconf adapter

**Files:**
- Create: `src/types/react-native-zeroconf.d.ts`
- Create: `src/infrastructure/discovery/zeroconf-service-browser.ts`
- Test: `tests/unit/infrastructure/zeroconf-service-browser.test.ts`

**Interfaces:**
- Consumes: `ServiceBrowser`, `ServiceBrowserListener`, `BrowsedService` (Task 1), `AvionixError`, `Logger`.
- Produces:
  - `ZeroconfLike { scan(type, protocol, domain, implType): void; stop(implType): void; on(event, handler): unknown; removeListener(event, handler): unknown; removeDeviceListeners(): void }` with `ZeroconfEventName = 'resolved' | 'remove' | 'error'` and `ZeroconfEventHandler = (payload: unknown) => void`.
  - `createZeroconfServiceBrowser(deps: { createZeroconf: () => ZeroconfLike; logger: Logger }): ServiceBrowser`
  - `resolvedServiceSchema` (zod), `ANDROID_IMPL_TYPE = 'NSD'`.
  - The ambient module `react-native-zeroconf` with a default `Zeroconf` class whose methods are assignable to `ZeroconfLike`.

The library is **not** installed in this task and **not** imported by the adapter: the adapter only depends on `ZeroconfLike`, and the ambient declaration is consumed by Task 4. Node tests inject a fake emitter.

- [ ] **Step 1: Write the failing adapter test**

Create `tests/unit/infrastructure/zeroconf-service-browser.test.ts`:

```ts
import { createMemorySink, createLogger, silentLogger } from '@/infrastructure/logging/logger';
import {
  type ZeroconfEventHandler,
  type ZeroconfEventName,
  type ZeroconfLike,
  createZeroconfServiceBrowser,
} from '@/infrastructure/discovery/zeroconf-service-browser';

class FakeZeroconf implements ZeroconfLike {
  scanCalls: unknown[][] = [];
  stopCalls: unknown[][] = [];
  deviceListenersRemoved = 0;
  private readonly handlers = new Map<ZeroconfEventName, Set<ZeroconfEventHandler>>();
  scanError: Error | null = null;
  stopError: Error | null = null;

  scan(type: string, protocol: string, domain: string, implType: 'NSD' | 'DNSSD'): void {
    this.scanCalls.push([type, protocol, domain, implType]);
    if (this.scanError !== null) {
      throw this.scanError;
    }
  }

  stop(implType: 'NSD' | 'DNSSD'): void {
    this.stopCalls.push([implType]);
    if (this.stopError !== null) {
      throw this.stopError;
    }
  }

  on(event: ZeroconfEventName, handler: ZeroconfEventHandler): this {
    const set = this.handlers.get(event) ?? new Set<ZeroconfEventHandler>();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  removeListener(event: ZeroconfEventName, handler: ZeroconfEventHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  removeDeviceListeners(): void {
    this.deviceListenersRemoved += 1;
  }

  listenerCount(event: ZeroconfEventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  emit(event: ZeroconfEventName, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}

function setup(logger = silentLogger) {
  const zeroconf = new FakeZeroconf();
  const browser = createZeroconfServiceBrowser({ createZeroconf: () => zeroconf, logger });
  const listener = { resolved: jest.fn(), removed: jest.fn(), error: jest.fn() };
  return { zeroconf, browser, listener };
}

const payload = {
  name: 'Avionix Connector (sim-pc)',
  fullName: 'Avionix Connector (sim-pc)._avionix._tcp.local.',
  host: 'sim-pc.local.',
  port: 8080,
  addresses: ['192.168.1.20'],
  txt: { v: '1', pairing: '1' },
};

describe('createZeroconfServiceBrowser', () => {
  it('is available and scans the bare type over tcp in local. with NSD', () => {
    const { zeroconf, browser, listener } = setup();
    expect(browser.availability).toBe('available');
    browser.browse('avionix', listener);
    expect(zeroconf.scanCalls).toEqual([['avionix', 'tcp', 'local.', 'NSD']]);
  });

  it('forwards a valid resolved payload as a BrowsedService without the extra keys', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    zeroconf.emit('resolved', payload);
    expect(listener.resolved).toHaveBeenCalledWith({
      name: payload.name,
      host: 'sim-pc.local.',
      port: 8080,
      addresses: ['192.168.1.20'],
      txt: { v: '1', pairing: '1' },
    });
  });

  it('defaults missing addresses, host and txt and tolerates a non-string txt value', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    zeroconf.emit('resolved', { name: 'a', port: 8080, txt: { pairing: 1 } });
    expect(listener.resolved).toHaveBeenCalledWith({
      name: 'a',
      host: '',
      port: 8080,
      addresses: [],
      txt: {},
    });
  });

  it('drops a malformed payload with a warning', () => {
    const sink = createMemorySink();
    const { zeroconf, browser, listener } = setup(createLogger('discovery', { sink }));
    browser.browse('avionix', listener);
    zeroconf.emit('resolved', { name: '', port: 8080 });
    zeroconf.emit('resolved', { name: 'a', port: 0 });
    zeroconf.emit('resolved', 'nonsense');
    zeroconf.emit('resolved', null);
    expect(listener.resolved).not.toHaveBeenCalled();
    expect(sink.entries.filter((entry) => entry.level === 'warn')).toHaveLength(4);
  });

  it('forwards removals by name and ignores non-string removals', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    zeroconf.emit('remove', 'Avionix Connector (sim-pc)');
    zeroconf.emit('remove', { name: 'x' });
    zeroconf.emit('remove', '');
    expect(listener.removed).toHaveBeenCalledTimes(1);
    expect(listener.removed).toHaveBeenCalledWith('Avionix Connector (sim-pc)');
  });

  it('wraps library errors as DISCOVERY_ERROR with the cause attached', () => {
    const { zeroconf, browser, listener } = setup();
    browser.browse('avionix', listener);
    const cause = new Error('NSD failed');
    zeroconf.emit('error', cause);
    expect(listener.error).toHaveBeenCalledTimes(1);
    const error = listener.error.mock.calls[0]?.[0];
    expect(error?.code).toBe('DISCOVERY_ERROR');
    expect(error?.retryable).toBe(false);
    expect(error?.cause).toBe(cause);
    expect(error?.message).toBe('Connector discovery failed');
  });

  it('stop is idempotent, stops the scan once and removes every listener', () => {
    const { zeroconf, browser, listener } = setup();
    const stop = browser.browse('avionix', listener);
    stop();
    stop();
    expect(zeroconf.stopCalls).toEqual([['NSD']]);
    expect(zeroconf.deviceListenersRemoved).toBe(1);
    expect(zeroconf.listenerCount('resolved')).toBe(0);
    expect(zeroconf.listenerCount('remove')).toBe(0);
    expect(zeroconf.listenerCount('error')).toBe(0);
    zeroconf.emit('resolved', payload);
    expect(listener.resolved).not.toHaveBeenCalled();
  });

  it('reports a throwing scan as DISCOVERY_ERROR and leaves nothing attached', () => {
    const { zeroconf, browser, listener } = setup();
    zeroconf.scanError = new Error('RNZeroconf.scan is not a function');
    const stop = browser.browse('avionix', listener);
    expect(listener.error).toHaveBeenCalledTimes(1);
    expect(listener.error.mock.calls[0]?.[0]?.code).toBe('DISCOVERY_ERROR');
    expect(zeroconf.listenerCount('resolved')).toBe(0);
    expect(() => stop()).not.toThrow();
    expect(zeroconf.stopCalls).toHaveLength(1);
  });

  it('swallows a throwing stop and still detaches', () => {
    const sink = createMemorySink();
    const { zeroconf, browser, listener } = setup(createLogger('discovery', { sink }));
    zeroconf.stopError = new Error('boom');
    const stop = browser.browse('avionix', listener);
    expect(() => stop()).not.toThrow();
    expect(zeroconf.deviceListenersRemoved).toBe(1);
    expect(sink.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('reports a factory that throws as DISCOVERY_ERROR', () => {
    const listener = { resolved: jest.fn(), removed: jest.fn(), error: jest.fn() };
    const browser = createZeroconfServiceBrowser({
      createZeroconf: () => {
        throw new Error('no native module');
      },
      logger: silentLogger,
    });
    const stop = browser.browse('avionix', listener);
    expect(listener.error.mock.calls[0]?.[0]?.code).toBe('DISCOVERY_ERROR');
    expect(() => stop()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/unit/infrastructure/zeroconf-service-browser.test.ts`
Expected: FAIL with "Cannot find module '@/infrastructure/discovery/zeroconf-service-browser'".

- [ ] **Step 3: Declare the library's surface**

Create `src/types/react-native-zeroconf.d.ts` (the package ships no types; this is the only description of it the app has, and every payload it delivers is still validated with zod):

```ts
declare module 'react-native-zeroconf' {
  export type ZeroconfImplType = 'NSD' | 'DNSSD';

  export const ImplType: { readonly NSD: 'NSD'; readonly DNSSD: 'DNSSD' };

  export type ZeroconfEvent =
    | 'start'
    | 'stop'
    | 'update'
    | 'found'
    | 'resolved'
    | 'remove'
    | 'error'
    | 'published'
    | 'unpublished';

  /**
   * Subset of react-native-zeroconf 0.14.0 (`dist/index.js`) used by Avionix. Event payloads
   * are `unknown` on purpose: they cross from native code and must be validated.
   */
  export default class Zeroconf {
    constructor();
    scan(type?: string, protocol?: string, domain?: string, implType?: ZeroconfImplType): void;
    stop(implType?: ZeroconfImplType): void;
    on(event: ZeroconfEvent, listener: (payload: unknown) => void): this;
    removeListener(event: ZeroconfEvent, listener: (payload: unknown) => void): this;
    removeAllListeners(event?: ZeroconfEvent): this;
    removeDeviceListeners(): void;
    getServices(): Record<string, unknown>;
  }
}
```

- [ ] **Step 4: Write the adapter**

Create `src/infrastructure/discovery/zeroconf-service-browser.ts`:

```ts
import { z } from 'zod';

import type {
  BrowsedService,
  ServiceBrowser,
  ServiceBrowserListener,
} from '@/domain/discovery/service-browser';
import { AvionixError } from '@/domain/errors/avionix-error';
import type { Logger } from '@/infrastructure/logging/logger';

export type ZeroconfEventName = 'resolved' | 'remove' | 'error';
export type ZeroconfEventHandler = (payload: unknown) => void;
export type ZeroconfImplType = 'NSD' | 'DNSSD';

/** The subset of react-native-zeroconf's `Zeroconf` class this adapter uses. */
export interface ZeroconfLike {
  scan(type: string, protocol: string, domain: string, implType: ZeroconfImplType): void;
  stop(implType: ZeroconfImplType): void;
  on(event: ZeroconfEventName, handler: ZeroconfEventHandler): unknown;
  removeListener(event: ZeroconfEventName, handler: ZeroconfEventHandler): unknown;
  removeDeviceListeners(): void;
}

/**
 * Android only (the library ignores it on iOS). `NSD` is the platform API; `DNSSD` is the
 * library's embedded mDNSResponder, the alternative if NSD misbehaves on a device.
 */
export const ANDROID_IMPL_TYPE: ZeroconfImplType = 'NSD';

/**
 * Shape of a `resolved` event payload from the native side (`name`, `fullName`, `host`, `port`,
 * `addresses`, `txt`). `addresses` and `txt` fall back to empty on any problem so that a
 * strange TXT record cannot hide a connector; `name` and `port` problems drop the payload.
 */
export const resolvedServiceSchema = z.object({
  name: z.string().min(1),
  host: z.string().catch(''),
  port: z.number().int().min(1).max(65535),
  addresses: z.array(z.string()).catch([]),
  txt: z.record(z.string(), z.string()).catch({}),
});

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function discoveryError(cause: unknown): AvionixError {
  return new AvionixError({ code: 'DISCOVERY_ERROR', message: 'Connector discovery failed', cause });
}

export function createZeroconfServiceBrowser(deps: {
  createZeroconf: () => ZeroconfLike;
  logger: Logger;
}): ServiceBrowser {
  return {
    availability: 'available',
    browse(type: string, listener: ServiceBrowserListener): () => void {
      let stopped = false;
      let zeroconf: ZeroconfLike;
      try {
        zeroconf = deps.createZeroconf();
      } catch (cause) {
        deps.logger.warn('zeroconf unavailable', { reason: reason(cause) });
        listener.error(discoveryError(cause));
        return () => undefined;
      }

      const onResolved: ZeroconfEventHandler = (payload) => {
        if (stopped) {
          return;
        }
        const parsed = resolvedServiceSchema.safeParse(payload);
        if (!parsed.success) {
          deps.logger.warn('dropped a malformed resolved service', {
            issues: parsed.error.issues.map((issue) => issue.path.join('.')),
          });
          return;
        }
        const service: BrowsedService = {
          name: parsed.data.name,
          host: parsed.data.host,
          port: parsed.data.port,
          addresses: parsed.data.addresses,
          txt: parsed.data.txt,
        };
        listener.resolved(service);
      };
      const onRemove: ZeroconfEventHandler = (payload) => {
        if (stopped) {
          return;
        }
        if (typeof payload === 'string' && payload.length > 0) {
          listener.removed(payload);
        }
      };
      const onError: ZeroconfEventHandler = (payload) => {
        if (stopped) {
          return;
        }
        deps.logger.warn('zeroconf reported an error', { reason: reason(payload) });
        listener.error(discoveryError(payload));
      };

      const stop = (): void => {
        if (stopped) {
          return;
        }
        stopped = true;
        try {
          zeroconf.stop(ANDROID_IMPL_TYPE);
        } catch (cause) {
          deps.logger.warn('zeroconf stop failed', { reason: reason(cause) });
        }
        zeroconf.removeListener('resolved', onResolved);
        zeroconf.removeListener('remove', onRemove);
        zeroconf.removeListener('error', onError);
        zeroconf.removeDeviceListeners();
      };

      zeroconf.on('resolved', onResolved);
      zeroconf.on('remove', onRemove);
      zeroconf.on('error', onError);
      try {
        zeroconf.scan(type, 'tcp', 'local.', ANDROID_IMPL_TYPE);
      } catch (cause) {
        deps.logger.warn('zeroconf scan failed', { reason: reason(cause) });
        stop();
        listener.error(discoveryError(cause));
      }
      return stop;
    },
  };
}
```

- [ ] **Step 5: Run the test and the gate**

Run: `npx jest tests/unit/infrastructure/zeroconf-service-browser.test.ts`
Expected: PASS (10 tests).

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: green. Typecheck must accept the ambient declaration even though the package is not installed yet (a `declare module` needs no package).

- [ ] **Step 6: Commit**

```bash
git add src/types/react-native-zeroconf.d.ts src/infrastructure/discovery/zeroconf-service-browser.ts tests/unit/infrastructure/zeroconf-service-browser.test.ts
git commit -m "feat(discovery): add the react-native-zeroconf service browser adapter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `ConnectorDiscovery` and the shared fake browser

**Files:**
- Create: `tests/support/fake-service-browser.ts`
- Create: `src/application/connector-discovery.ts`
- Test: `tests/unit/application/connector-discovery.test.ts`

**Interfaces:**
- Consumes: `ServiceBrowser`, `ServiceBrowserListener`, `BrowsedService`, `AVIONIX_SERVICE_TYPE` (Task 1), `discoveredConnectorFrom`, `DiscoveredConnector` (Task 1), `Store` (`src/application/store.ts`), `Logger`.
- Produces:
  - `DiscoverySnapshot { availability: ServiceBrowserAvailability; scanning: boolean; connectors: DiscoveredConnector[]; error: AvionixError | null }`
  - `class ConnectorDiscovery { readonly store: Store<DiscoverySnapshot>; constructor(deps: { browser: ServiceBrowser; logger: Logger }); start(): void; stop(): void }`
  - `createFakeServiceBrowser(availability?: ServiceBrowserAvailability, options?: { failOnBrowse?: AvionixError }): FakeServiceBrowser` where `FakeServiceBrowser extends ServiceBrowser { browseCalls: { type: string; listener: ServiceBrowserListener }[]; stopCalls: number; readonly active: ServiceBrowserListener | null; listener(): ServiceBrowserListener }` (`listener()` throws when no browse is active).

- [ ] **Step 1: Create the shared fake browser**

Create `tests/support/fake-service-browser.ts`:

```ts
import type {
  ServiceBrowser,
  ServiceBrowserAvailability,
  ServiceBrowserListener,
} from '@/domain/discovery/service-browser';
import type { AvionixError } from '@/domain/errors/avionix-error';

export interface FakeServiceBrowser extends ServiceBrowser {
  browseCalls: { type: string; listener: ServiceBrowserListener }[];
  stopCalls: number;
  /** The listener of the most recent browse that has not been stopped, or null. */
  readonly active: ServiceBrowserListener | null;
  /** Like `active`, but throws when nothing is browsing, so tests read as plain calls. */
  listener(): ServiceBrowserListener;
}

/**
 * Records `browse` and stop calls and hands the test the listener, so a test drives resolved,
 * removed and error events itself. `failOnBrowse` reports the error synchronously inside
 * `browse`, as the zeroconf adapter does when `scan()` throws.
 */
export function createFakeServiceBrowser(
  availability: ServiceBrowserAvailability = 'available',
  options: { failOnBrowse?: AvionixError } = {},
): FakeServiceBrowser {
  let active: ServiceBrowserListener | null = null;
  const fake: FakeServiceBrowser = {
    availability,
    browseCalls: [],
    stopCalls: 0,
    get active() {
      return active;
    },
    listener() {
      if (active === null) {
        throw new Error('no browse is active');
      }
      return active;
    },
    browse(type, listener) {
      fake.browseCalls.push({ type, listener });
      active = listener;
      if (options.failOnBrowse !== undefined) {
        listener.error(options.failOnBrowse);
      }
      return () => {
        fake.stopCalls += 1;
        if (active === listener) {
          active = null;
        }
      };
    },
  };
  return fake;
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/application/connector-discovery.test.ts`:

```ts
import { ConnectorDiscovery } from '@/application/connector-discovery';
import type { BrowsedService } from '@/domain/discovery/service-browser';
import { AvionixError } from '@/domain/errors/avionix-error';
import { createMemorySink, createLogger, silentLogger } from '@/infrastructure/logging/logger';
import { createFakeServiceBrowser } from '../../support/fake-service-browser';

function service(name: string, overrides: Partial<BrowsedService> = {}): BrowsedService {
  return {
    name,
    host: `${name}.local.`,
    port: 8080,
    addresses: ['192.168.1.20'],
    txt: { v: '1', pairing: '1' },
    ...overrides,
  };
}

function setup(browser = createFakeServiceBrowser(), logger = silentLogger) {
  const discovery = new ConnectorDiscovery({ browser, logger });
  return { browser, discovery };
}

describe('ConnectorDiscovery', () => {
  it('starts idle with the browser availability', () => {
    const { discovery } = setup(createFakeServiceBrowser('needsDevBuild'));
    expect(discovery.store.getSnapshot()).toEqual({
      availability: 'needsDevBuild',
      scanning: false,
      connectors: [],
      error: null,
    });
  });

  it('start browses the avionix type once and sets scanning', () => {
    const { browser, discovery } = setup();
    discovery.start();
    discovery.start();
    expect(browser.browseCalls).toHaveLength(1);
    expect(browser.browseCalls[0]?.type).toBe('avionix');
    expect(discovery.store.getSnapshot().scanning).toBe(true);
  });

  it('does nothing when the browser is not available', () => {
    const { browser, discovery } = setup(createFakeServiceBrowser('unsupported'));
    discovery.start();
    expect(browser.browseCalls).toHaveLength(0);
    expect(discovery.store.getSnapshot().scanning).toBe(false);
    discovery.stop();
    expect(browser.stopCalls).toBe(0);
  });

  it('lists resolved services sorted by name and replaces a re-resolved one', () => {
    const { browser, discovery } = setup();
    discovery.start();
    browser.listener().resolved(service('Zulu'));
    browser.listener().resolved(service('alpha', { addresses: ['10.0.0.2'] }));
    browser.listener().resolved(service('Zulu', { port: 9090, txt: { pairing: '0' } }));
    expect(discovery.store.getSnapshot().connectors).toEqual([
      { name: 'alpha', host: '10.0.0.2', port: 8080, pairingRequired: true },
      { name: 'Zulu', host: '192.168.1.20', port: 9090, pairingRequired: false },
    ]);
  });

  it('removes a connector by name and ignores unknown names', () => {
    const { browser, discovery } = setup();
    discovery.start();
    browser.listener().resolved(service('alpha'));
    const before = discovery.store.getSnapshot();
    browser.listener().removed('nobody');
    expect(discovery.store.getSnapshot()).toBe(before);
    browser.listener().removed('alpha');
    expect(discovery.store.getSnapshot().connectors).toEqual([]);
  });

  it('skips a service without a usable host and logs it', () => {
    const sink = createMemorySink();
    const { browser, discovery } = setup(
      createFakeServiceBrowser(),
      createLogger('discovery', { sink }),
    );
    discovery.start();
    browser.listener().resolved(service('ghost', { addresses: ['fe80::1'], host: '' }));
    expect(discovery.store.getSnapshot().connectors).toEqual([]);
    expect(sink.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('stop stops the browse, clears the list and ignores late events', () => {
    const { browser, discovery } = setup();
    discovery.start();
    const listener = browser.listener();
    listener.resolved(service('alpha'));
    discovery.stop();
    discovery.stop();
    expect(browser.stopCalls).toBe(1);
    expect(discovery.store.getSnapshot()).toMatchObject({ scanning: false, connectors: [] });
    listener.resolved(service('late'));
    listener.error(new AvionixError({ code: 'DISCOVERY_ERROR', message: 'late' }));
    expect(discovery.store.getSnapshot()).toMatchObject({ connectors: [], error: null });
  });

  it('records an error, stops scanning, keeps the list and clears the error on restart', () => {
    const { browser, discovery } = setup();
    discovery.start();
    browser.listener().resolved(service('alpha'));
    const error = new AvionixError({ code: 'DISCOVERY_ERROR', message: 'NSD failed' });
    browser.listener().error(error);
    expect(browser.stopCalls).toBe(1);
    expect(discovery.store.getSnapshot()).toMatchObject({
      scanning: false,
      error,
      connectors: [{ name: 'alpha' }],
    });
    discovery.start();
    expect(browser.browseCalls).toHaveLength(2);
    expect(discovery.store.getSnapshot()).toMatchObject({ scanning: true, error: null });
  });

  it('handles an error reported synchronously inside browse', () => {
    const error = new AvionixError({ code: 'DISCOVERY_ERROR', message: 'scan threw' });
    const { browser, discovery } = setup(createFakeServiceBrowser('available', { failOnBrowse: error }));
    discovery.start();
    expect(discovery.store.getSnapshot()).toMatchObject({ scanning: false, error });
    expect(browser.stopCalls).toBe(1);
    discovery.start();
    expect(browser.browseCalls).toHaveLength(2);
  });

  it('a restart after stop uses a fresh browse', () => {
    const { browser, discovery } = setup();
    discovery.start();
    discovery.stop();
    discovery.start();
    expect(browser.browseCalls).toHaveLength(2);
    browser.listener().resolved(service('alpha'));
    expect(discovery.store.getSnapshot().connectors).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest tests/unit/application/connector-discovery.test.ts`
Expected: FAIL with "Cannot find module '@/application/connector-discovery'".

- [ ] **Step 4: Write `ConnectorDiscovery`**

Create `src/application/connector-discovery.ts`:

```ts
import { Store } from '@/application/store';
import {
  type DiscoveredConnector,
  discoveredConnectorFrom,
} from '@/domain/discovery/discovered-connector';
import {
  AVIONIX_SERVICE_TYPE,
  type BrowsedService,
  type ServiceBrowser,
  type ServiceBrowserAvailability,
  type ServiceBrowserListener,
} from '@/domain/discovery/service-browser';
import type { AvionixError } from '@/domain/errors/avionix-error';
import type { Logger } from '@/infrastructure/logging/logger';

export interface DiscoverySnapshot {
  availability: ServiceBrowserAvailability;
  scanning: boolean;
  /** Sorted by name, one entry per DNS-SD instance name. */
  connectors: DiscoveredConnector[];
  error: AvionixError | null;
}

function byName(a: DiscoveredConnector, b: DiscoveredConnector): number {
  return a.name.localeCompare(b.name);
}

/**
 * Owns the list of Avionix Connectors seen on the network. `start()` and `stop()` are
 * idempotent; every browser callback checks the generation it was created for, so an event
 * that arrives after `stop()` (or after an error ended the browse) is dropped.
 */
export class ConnectorDiscovery {
  readonly store: Store<DiscoverySnapshot>;
  private generation = 0;
  private stopBrowse: (() => void) | null = null;

  constructor(private readonly deps: { browser: ServiceBrowser; logger: Logger }) {
    this.store = new Store<DiscoverySnapshot>({
      availability: deps.browser.availability,
      scanning: false,
      connectors: [],
      error: null,
    });
  }

  start(): void {
    if (this.stopBrowse !== null || this.deps.browser.availability !== 'available') {
      return;
    }
    const generation = ++this.generation;
    this.store.setState((prev) => ({ ...prev, scanning: true, error: null }));
    const listener: ServiceBrowserListener = {
      resolved: (service) => {
        if (generation === this.generation) {
          this.upsert(service);
        }
      },
      removed: (name) => {
        if (generation === this.generation) {
          this.remove(name);
        }
      },
      error: (error) => {
        if (generation !== this.generation) {
          return;
        }
        this.generation += 1;
        this.releaseBrowse();
        this.store.setState((prev) => ({ ...prev, scanning: false, error }));
      },
    };
    const stop = this.deps.browser.browse(AVIONIX_SERVICE_TYPE, listener);
    if (generation === this.generation) {
      this.stopBrowse = stop;
    } else {
      // The browser reported an error synchronously inside browse(); the error handler already
      // moved the generation on, so this browse is over before it was recorded.
      stop();
    }
  }

  stop(): void {
    if (this.stopBrowse === null) {
      return;
    }
    this.generation += 1;
    this.releaseBrowse();
    // Cleared on purpose: a PC that went away while the app was in the background must not be
    // shown as present when the app comes back.
    this.store.setState((prev) => ({ ...prev, scanning: false, connectors: [] }));
  }

  private releaseBrowse(): void {
    const stop = this.stopBrowse;
    this.stopBrowse = null;
    if (stop !== null) {
      stop();
    }
  }

  private upsert(service: BrowsedService): void {
    const connector = discoveredConnectorFrom(service);
    if (connector === null) {
      this.deps.logger.warn('discovered service has no usable host', { name: service.name });
      return;
    }
    this.store.setState((prev) => ({
      ...prev,
      connectors: [...prev.connectors.filter((c) => c.name !== connector.name), connector].sort(
        byName,
      ),
    }));
  }

  private remove(name: string): void {
    this.store.setState((prev) =>
      prev.connectors.some((c) => c.name === name)
        ? { ...prev, connectors: prev.connectors.filter((c) => c.name !== name) }
        : prev,
    );
  }
}
```

Note the synchronous-error case: `error` runs while `this.stopBrowse` is still `null` (the previous browse was released), so `releaseBrowse()` is a no-op there and the `else` branch after `browse()` stops the browse instead; `stopCalls` ends at exactly 1, as the test asserts.

- [ ] **Step 5: Run the test and the gate**

Run: `npx jest tests/unit/application/connector-discovery.test.ts`
Expected: PASS (10 tests).

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/application/connector-discovery.ts tests/support/fake-service-browser.ts tests/unit/application/connector-discovery.test.ts
git commit -m "feat(discovery): add ConnectorDiscovery over the service browser port

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Dependency, platform factories, app config and composition

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Modify: `app.json`
- Create: `src/platform/service-browser.ts`
- Create: `src/platform/service-browser.web.ts`
- Modify: `src/app/services-context.tsx`
- Modify: `src/app/composition-root.ts`
- Modify: `tests/ui/mvp-screen.test.tsx`, `tests/ui/use-connection-settings.test.tsx`, `tests/web/mvp-screen.web.test.tsx`, `tests/web/use-connection-settings.web.test.tsx` (fixtures gain `discovery`)
- Test: `tests/ui/platform-service-browser.test.tsx`
- Test: `tests/web/platform-service-browser.web.test.tsx`

**Interfaces:**
- Consumes: `createZeroconfServiceBrowser` (Task 2), `createNullServiceBrowser` (Task 1), `ConnectorDiscovery` (Task 3), `createFakeServiceBrowser` (Task 3), the ambient `react-native-zeroconf` module (Task 2).
- Produces:
  - `createPlatformServiceBrowser(logger: Logger): ServiceBrowser` from `@/platform/service-browser` (Metro and jest-expo/web pick the `.web.ts` file on the web).
  - `DiscoveryApi = Pick<ConnectorDiscovery, 'store' | 'start' | 'stop'>`; `AppServices.discovery: DiscoveryApi`.

- [ ] **Step 1: Install the library, pinned**

Run: `npm install --save-exact react-native-zeroconf@0.14.0`
Expected: `package.json` gains `"react-native-zeroconf": "0.14.0"` under `dependencies`; the lock file updates. Verify with `npm ls react-native-zeroconf`.

- [ ] **Step 2: Update `app.json`**

Change the `ios.infoPlist` block and add `android.permissions`:

```json
    "ios": {
      "bundleIdentifier": "pro.avionix.app",
      "supportsTablet": true,
      "infoPlist": {
        "NSLocalNetworkUsageDescription": "Avionix finds Avionix Connectors and connects to X-Plane on your local network.",
        "NSBonjourServices": ["_avionix._tcp"],
        "NSAppTransportSecurity": {
          "NSAllowsLocalNetworking": true
        }
      }
    },
    "android": {
      "package": "pro.avionix.app",
      "permissions": ["ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE", "CHANGE_WIFI_MULTICAST_STATE"],
      "adaptiveIcon": {
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundColor": "#ffffff"
      }
    },
```

`app.json` is formatted by Prettier (it is not under `docs/`), so run `npx prettier --write app.json` afterwards.

- [ ] **Step 3: Write the failing platform tests**

Create `tests/ui/platform-service-browser.test.tsx` (the `expo` Jest project runs `tests/ui/**/*.test.tsx`; no JSX is needed):

```tsx
import { NativeModules } from 'react-native';

import { silentLogger } from '@/infrastructure/logging/logger';
import { createPlatformServiceBrowser } from '@/platform/service-browser';

describe('createPlatformServiceBrowser (native)', () => {
  afterEach(() => {
    delete NativeModules.RNZeroconf;
  });

  it('falls back to the needsDevBuild null browser when the native module is missing', () => {
    expect(createPlatformServiceBrowser(silentLogger).availability).toBe('needsDevBuild');
  });

  it('uses the zeroconf browser when the native module is present', () => {
    NativeModules.RNZeroconf = { scan: () => undefined, stop: () => undefined };
    expect(createPlatformServiceBrowser(silentLogger).availability).toBe('available');
  });
});
```

Create `tests/web/platform-service-browser.web.test.tsx`:

```tsx
import { silentLogger } from '@/infrastructure/logging/logger';
import { createPlatformServiceBrowser } from '@/platform/service-browser';

describe('createPlatformServiceBrowser (web)', () => {
  it('is the unsupported null browser', () => {
    const browser = createPlatformServiceBrowser(silentLogger);
    expect(browser.availability).toBe('unsupported');
    const stop = browser.browse('avionix', {
      resolved: () => undefined,
      removed: () => undefined,
      error: () => undefined,
    });
    expect(() => stop()).not.toThrow();
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx jest tests/ui/platform-service-browser.test.tsx tests/web/platform-service-browser.web.test.tsx`
Expected: FAIL with "Cannot find module '@/platform/service-browser'".

- [ ] **Step 5: Create the platform factories**

Create `src/platform/service-browser.ts`:

```ts
import { NativeModules } from 'react-native';
import Zeroconf from 'react-native-zeroconf';

import type { ServiceBrowser } from '@/domain/discovery/service-browser';
import { createNullServiceBrowser } from '@/infrastructure/discovery/null-service-browser';
import { createZeroconfServiceBrowser } from '@/infrastructure/discovery/zeroconf-service-browser';
import type { Logger } from '@/infrastructure/logging/logger';

/**
 * Native platforms. react-native-zeroconf reads `NativeModules.RNZeroconf` and only fails when
 * `scan()` is called, so its presence is checked here instead: Expo Go has no native module and
 * gets the null browser tagged `needsDevBuild`. This is the only file that imports the library.
 */
export function createPlatformServiceBrowser(logger: Logger): ServiceBrowser {
  const nativeModules: Record<string, unknown> = NativeModules;
  if (nativeModules.RNZeroconf === undefined || nativeModules.RNZeroconf === null) {
    logger.info('RNZeroconf native module missing; discovery needs a development build');
    return createNullServiceBrowser('needsDevBuild');
  }
  return createZeroconfServiceBrowser({ createZeroconf: () => new Zeroconf(), logger });
}
```

Create `src/platform/service-browser.web.ts`:

```ts
import type { ServiceBrowser } from '@/domain/discovery/service-browser';
import { createNullServiceBrowser } from '@/infrastructure/discovery/null-service-browser';
import type { Logger } from '@/infrastructure/logging/logger';

/** Browsers cannot browse mDNS. This file must never import react-native-zeroconf. */
export function createPlatformServiceBrowser(logger: Logger): ServiceBrowser {
  logger.debug('connector discovery is unsupported on the web');
  return createNullServiceBrowser('unsupported');
}
```

`NativeModules` is typed as an index signature of `any`; assigning it to `Record<string, unknown>` narrows without a cast. If ESLint's `dot-notation` or `no-unnecessary-condition` complains about the `undefined || null` check, use `== null` with a comment naming the rule; do not add `eslint-disable`.

- [ ] **Step 6: Add the discovery service to the context and the composition root**

In `src/app/services-context.tsx`:

```tsx
import React, { createContext, useContext } from 'react';

import type { ConnectorDiscovery } from '@/application/connector-discovery';
import type { SettingsStorage } from '@/application/settings-store';
import type { SimulatorSession } from '@/application/simulator-session';

export type SessionApi = Pick<
  SimulatorSession,
  'store' | 'connect' | 'disconnect' | 'pair' | 'writeHeading' | 'activateHeadingUp'
>;

export type DiscoveryApi = Pick<ConnectorDiscovery, 'store' | 'start' | 'stop'>;

export interface AppServices {
  session: SessionApi;
  discovery: DiscoveryApi;
  settingsStorage: SettingsStorage;
}
```

(The rest of the file is unchanged.)

In `src/app/composition-root.ts`, add the imports and the service:

```ts
import { ConnectorDiscovery } from '@/application/connector-discovery';
import { createPlatformServiceBrowser } from '@/platform/service-browser';
```

```ts
  const discoveryLogger = createLogger('discovery');
  const discovery = new ConnectorDiscovery({
    browser: createPlatformServiceBrowser(discoveryLogger),
    logger: discoveryLogger,
  });
  return { session, discovery, settingsStorage };
```

- [ ] **Step 7: Update the four test fixtures**

Each fixture that builds an `AppServices` gains a `discovery` built from the fake browser. Apply the same shape in all four files.

`tests/ui/mvp-screen.test.tsx` — add imports and extend `makeServices`:

```tsx
import { ConnectorDiscovery } from '@/application/connector-discovery';
import { silentLogger } from '@/infrastructure/logging/logger';
import { type FakeServiceBrowser, createFakeServiceBrowser } from '../support/fake-service-browser';
```

```tsx
function makeServices(
  snapshot: Partial<SessionSnapshot> = {},
  browser: FakeServiceBrowser = createFakeServiceBrowser(),
) {
  const store = new Store<SessionSnapshot>({ ...initialSnapshot(MVP_DATAREF_NAMES), ...snapshot });
  const session = {
    store,
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    pair: jest.fn(async (code: string) => {
      void code;
    }),
    writeHeading: jest.fn(async () => undefined),
    activateHeadingUp: jest.fn(async () => undefined),
  };
  const discovery = new ConnectorDiscovery({ browser, logger: silentLogger });
  const services: AppServices = { session, discovery, settingsStorage: createMemorySettingsStorage() };
  return { services, session, store, browser };
}
```

`tests/ui/use-connection-settings.test.tsx`, `tests/web/mvp-screen.web.test.tsx` and `tests/web/use-connection-settings.web.test.tsx` — in their `services()` helpers add:

```ts
    discovery: new ConnectorDiscovery({ browser: createFakeServiceBrowser(), logger: silentLogger }),
```

with the matching imports (`ConnectorDiscovery`, `silentLogger`, `createFakeServiceBrowser` from `'../support/fake-service-browser'`). For the two web files use `createFakeServiceBrowser('unsupported')` so they model the web.

- [ ] **Step 8: Run the tests and the gate**

Run: `npx jest tests/ui/platform-service-browser.test.tsx tests/web/platform-service-browser.web.test.tsx`
Expected: PASS (3 tests). If the native test fails at import with an error from `react-native-zeroconf/dist/index.js`, report it in your concerns: the file is CommonJS and depends only on `react-native` and `events`, both present under jest-expo.

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: green; the UI and web suites still pass with the extended fixtures.

Run: `npm run build:validate`
Expected: succeeds for ios, android and web. The web bundle must not contain the library: `grep -c RNZeroconf dist/web/_expo/static/js/web/*.js` prints `0` (if the file layout differs, grep the whole `dist/web` tree). Do not commit `dist/`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json app.json src/platform/service-browser.ts src/platform/service-browser.web.ts src/app/services-context.tsx src/app/composition-root.ts tests/ui/platform-service-browser.test.tsx tests/web/platform-service-browser.web.test.tsx tests/ui/mvp-screen.test.tsx tests/ui/use-connection-settings.test.tsx tests/web/mvp-screen.web.test.tsx tests/web/use-connection-settings.web.test.tsx
git commit -m "feat(discovery): wire react-native-zeroconf behind platform factories and add discovery to the app services

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Hooks: foreground tracking, discovery lifecycle, `setConnection`

**Files:**
- Create: `src/hooks/useAppForeground.ts`
- Create: `src/hooks/useConnectorDiscovery.ts`
- Modify: `src/hooks/useConnectionSettings.ts`
- Test: `tests/ui/use-connector-discovery.test.tsx`
- Modify: `tests/ui/use-connection-settings.test.tsx` (one new case)

**Interfaces:**
- Consumes: `useServices()` with `discovery: DiscoveryApi` (Task 4), `DiscoverySnapshot` (Task 3), `ConnectionState`, `saveConnectionSettings`.
- Produces:
  - `useAppForeground(): boolean`
  - `isDiscoveryState(state: ConnectionState): boolean` (true for `disconnected` and `error`)
  - `useConnectorDiscovery(sessionState: ConnectionState): DiscoverySnapshot`
  - `useConnectionSettings()` additionally returns `setConnection(host: string, port: number): Promise<void>`.

- [ ] **Step 1: Write the failing discovery hook test**

Create `tests/ui/use-connector-discovery.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ConnectorDiscovery } from '@/application/connector-discovery';
import { MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import type { ConnectionState } from '@/domain/connection/connection-state';
import { useConnectorDiscovery } from '@/hooks/useConnectorDiscovery';
import { silentLogger } from '@/infrastructure/logging/logger';
import { createFakeServiceBrowser } from '../support/fake-service-browser';

function setup() {
  const browser = createFakeServiceBrowser();
  const services: AppServices = {
    settingsStorage: createMemorySettingsStorage(),
    discovery: new ConnectorDiscovery({ browser, logger: silentLogger }),
    session: {
      store: new Store(initialSnapshot(MVP_DATAREF_NAMES)),
      connect: async () => undefined,
      disconnect: () => undefined,
      pair: async () => undefined,
      writeHeading: async () => undefined,
      activateHeadingUp: async () => undefined,
    },
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  return { browser, wrapper };
}

describe('useConnectorDiscovery', () => {
  const originalCurrentState = AppState.currentState;

  afterEach(() => {
    Object.defineProperty(AppState, 'currentState', {
      value: originalCurrentState,
      configurable: true,
      writable: true,
    });
    jest.mocked(AppState.addEventListener).mockClear();
  });

  it('starts while disconnected, stops once connected and restarts after disconnect', async () => {
    const { browser, wrapper } = setup();
    const { result, rerender } = await renderHook(
      (state: ConnectionState) => useConnectorDiscovery(state),
      { wrapper, initialProps: 'disconnected' },
    );
    expect(browser.browseCalls).toHaveLength(1);
    expect(result.current.scanning).toBe(true);
    await act(async () => {
      browser.listener().resolved({
        name: 'Sim PC',
        host: 'sim-pc.local.',
        port: 8080,
        addresses: ['192.168.1.20'],
        txt: { pairing: '1' },
      });
    });
    expect(result.current.connectors).toHaveLength(1);
    await rerender('connecting');
    expect(browser.stopCalls).toBe(1);
    expect(result.current).toMatchObject({ scanning: false, connectors: [] });
    await rerender('connected');
    expect(browser.browseCalls).toHaveLength(1);
    await rerender('error');
    expect(browser.browseCalls).toHaveLength(2);
    await rerender('disconnected');
    expect(browser.browseCalls).toHaveLength(2);
  });

  it('stops when the app goes to the background and resumes in the foreground', async () => {
    const { browser, wrapper } = setup();
    await renderHook((state: ConnectionState) => useConnectorDiscovery(state), {
      wrapper,
      initialProps: 'disconnected',
    });
    expect(browser.browseCalls).toHaveLength(1);
    const subscribe = jest.mocked(AppState.addEventListener);
    const handlers = subscribe.mock.calls
      .filter(([type]) => type === 'change')
      .map(([, handler]) => handler as (status: AppStateStatus) => void);
    expect(handlers.length).toBeGreaterThan(0);
    const notify = (status: AppStateStatus) => {
      Object.defineProperty(AppState, 'currentState', {
        value: status,
        configurable: true,
        writable: true,
      });
      for (const handler of handlers) {
        handler(status);
      }
    };
    await act(async () => notify('background'));
    expect(browser.stopCalls).toBe(1);
    await act(async () => notify('active'));
    expect(browser.browseCalls).toHaveLength(2);
  });

  it('stops on unmount', async () => {
    const { browser, wrapper } = setup();
    const { unmount } = await renderHook(
      (state: ConnectionState) => useConnectorDiscovery(state),
      { wrapper, initialProps: 'disconnected' },
    );
    unmount();
    expect(browser.stopCalls).toBe(1);
  });
});
```

The `as (status: AppStateStatus) => void` is a narrowing of the mock's recorded argument, not a bypass of validation; if the mock's call type already yields the handler type, drop the cast.

- [ ] **Step 2: Add the failing `setConnection` case**

Append to `describe('useConnectionSettings', …)` in `tests/ui/use-connection-settings.test.tsx`:

```tsx
  it('setConnection updates the form values and persists exactly those values', async () => {
    const storage = createMemorySettingsStorage();
    const { result } = await renderHook(() => useConnectionSettings(), {
      wrapper: wrapperFor(services(storage)),
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.setConnection('192.168.1.20', 8080);
    });
    expect(result.current.host).toBe('192.168.1.20');
    expect(result.current.port).toBe('8080');
    expect(await storage.getItem('avionix.connection')).toBe(
      JSON.stringify({ host: '192.168.1.20', port: 8080 }),
    );
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx jest tests/ui/use-connector-discovery.test.tsx tests/ui/use-connection-settings.test.tsx`
Expected: FAIL: "Cannot find module '@/hooks/useConnectorDiscovery'" and "result.current.setConnection is not a function".

- [ ] **Step 4: Write `useAppForeground`**

Create `src/hooks/useAppForeground.ts`:

```ts
import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function subscribe(onChange: () => void): () => void {
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}

/**
 * Only `background` counts as not in the foreground. iOS reports `inactive` during app
 * switching and the control centre, and Android reports `unknown` briefly at launch; both keep
 * discovery running rather than clearing and restarting the list.
 */
export function isForeground(status: AppStateStatus): boolean {
  return status !== 'background';
}

export function useAppForeground(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isForeground(AppState.currentState),
    () => true,
  );
}
```

- [ ] **Step 5: Write `useConnectorDiscovery`**

Create `src/hooks/useConnectorDiscovery.ts`:

```ts
import { useEffect, useSyncExternalStore } from 'react';

import type { DiscoverySnapshot } from '@/application/connector-discovery';
import { useServices } from '@/app/services-context';
import type { ConnectionState } from '@/domain/connection/connection-state';
import { useAppForeground } from '@/hooks/useAppForeground';

/** Discovery runs, and its list is shown, only while a tap on a row could act. */
export function isDiscoveryState(state: ConnectionState): boolean {
  return state === 'disconnected' || state === 'error';
}

export function useConnectorDiscovery(sessionState: ConnectionState): DiscoverySnapshot {
  const { discovery } = useServices();
  const snapshot = useSyncExternalStore(discovery.store.subscribe, discovery.store.getSnapshot);
  const foreground = useAppForeground();
  const shouldScan = foreground && isDiscoveryState(sessionState);

  useEffect(() => {
    if (!shouldScan) {
      return;
    }
    discovery.start();
    return () => discovery.stop();
  }, [discovery, shouldScan]);

  return snapshot;
}
```

- [ ] **Step 6: Add `setConnection` to `useConnectionSettings`**

In `src/hooks/useConnectionSettings.ts`, after `persist`:

```ts
  const setConnection = useCallback(
    async (nextHost: string, nextPort: number) => {
      setHost(nextHost);
      setPort(String(nextPort));
      // Saves the given values, not the closure's state, which still holds the previous form.
      await saveConnectionSettings(settingsStorage, { host: nextHost, port: nextPort });
    },
    [settingsStorage],
  );

  return { host, setHost, port, setPort, ready, persist, setConnection };
```

- [ ] **Step 7: Run the tests and the gate**

Run: `npx jest tests/ui/use-connector-discovery.test.tsx tests/ui/use-connection-settings.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: green. `react-hooks/set-state-in-effect` must not fire: the effect only calls `discovery.start()` / `stop()`.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useAppForeground.ts src/hooks/useConnectorDiscovery.ts src/hooks/useConnectionSettings.ts tests/ui/use-connector-discovery.test.tsx tests/ui/use-connection-settings.test.tsx
git commit -m "feat(discovery): run discovery while disconnected and in the foreground

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The `DiscoveredConnectors` section and screen wiring

**Files:**
- Create: `src/features/connection/DiscoveredConnectors.tsx`
- Modify: `src/features/mvp/MvpScreen.tsx`
- Modify: `tests/ui/mvp-screen.test.tsx` (new cases)
- Modify: `tests/web/mvp-screen.web.test.tsx` (one new case)

**Interfaces:**
- Consumes: `DiscoverySnapshot` (Task 3), `DiscoveredConnector` (Task 1), `useConnectorDiscovery`, `isDiscoveryState`, `setConnection` (Task 5), the fixtures from Task 4 (`makeServices(snapshot, browser)` returns `browser`).
- Produces: `DiscoveredConnectors({ snapshot, enabled, onSelect })`.

- [ ] **Step 1: Write the failing UI tests**

Append to `describe('MvpScreen', …)` in `tests/ui/mvp-screen.test.tsx`:

```tsx
  describe('discovered connectors', () => {
    const simPc = {
      name: 'Sim PC',
      host: 'sim-pc.local.',
      port: 8080,
      addresses: ['fe80::1', '192.168.1.20'],
      txt: { v: '1', pairing: '1' },
    };

    it('lists resolved connectors and connects with the tapped one', async () => {
      const { services, session, browser } = makeServices();
      await renderScreen(services);
      await waitFor(() => expect(browser.browseCalls).toHaveLength(1));
      expect(screen.getByText('Connectors on this network')).toBeTruthy();
      expect(screen.getByText('Looking for connectors…')).toBeTruthy();
      await act(async () => {
        browser.listener().resolved(simPc);
        browser.listener().resolved({ ...simPc, name: 'Open PC', txt: { pairing: '0' } });
      });
      expect(screen.getByText('Sim PC')).toBeTruthy();
      expect(screen.getAllByText('192.168.1.20:8080')).toHaveLength(2);
      expect(screen.getByText('Needs pairing')).toBeTruthy();
      expect(screen.getByText('Open')).toBeTruthy();
      expect(screen.queryByText('Looking for connectors…')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Connect to Sim PC'));
      await waitFor(() => expect(session.connect).toHaveBeenCalledWith('192.168.1.20', '8080'));
      expect(screen.getByDisplayValue('192.168.1.20')).toBeTruthy();
      await waitFor(async () =>
        expect(await services.settingsStorage.getItem('avionix.connection')).toBe(
          JSON.stringify({ host: '192.168.1.20', port: 8080 }),
        ),
      );
    });

    it('hides the section while connected and shows it again after disconnect', async () => {
      const { services, store, browser } = makeServices({ state: 'connected' });
      await renderScreen(services);
      await waitFor(() => expect(screen.getByText('Status: connected')).toBeTruthy());
      expect(screen.queryByText('Connectors on this network')).toBeNull();
      expect(browser.browseCalls).toHaveLength(0);
      await act(async () => {
        store.setState((prev) => ({ ...prev, state: 'disconnected' }));
      });
      await waitFor(() => expect(browser.browseCalls).toHaveLength(1));
      expect(screen.getByText('Connectors on this network')).toBeTruthy();
    });

    it('explains that Expo Go needs the development build', async () => {
      const { services, browser } = makeServices({}, createFakeServiceBrowser('needsDevBuild'));
      await renderScreen(services);
      await waitFor(() =>
        expect(
          screen.getByText('Connector discovery needs the Avionix development build.'),
        ).toBeTruthy(),
      );
      expect(browser.browseCalls).toHaveLength(0);
    });

    it('shows a discovery error beneath the list', async () => {
      const browser = createFakeServiceBrowser('available', {
        failOnBrowse: new AvionixError({ code: 'DISCOVERY_ERROR', message: 'NSD failed' }),
      });
      const { services } = makeServices({}, browser);
      await renderScreen(services);
      await waitFor(() => expect(screen.getByText('Discovery failed: NSD failed')).toBeTruthy());
      expect(screen.queryByText('Looking for connectors…')).toBeNull();
      expect(screen.queryByText('No connectors found yet.')).toBeNull();
    });
  });
```

The `waitFor` with an async callback is supported by Testing Library 14; if it proves flaky, replace it with `await act(async () => {})` followed by a plain `expect`.

Append to `tests/web/mvp-screen.web.test.tsx` (inside the existing `describe`):

```tsx
  it('does not render the discovery section on the web', async () => {
    const s = services();
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <MvpScreen />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent ?? '').not.toContain('Connectors on this network');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/ui/mvp-screen.test.tsx -t 'discovered connectors'`
Expected: FAIL: "Unable to find an element with text: Connectors on this network" (the web case passes vacuously for now; that is expected).

- [ ] **Step 3: Create the component**

Create `src/features/connection/DiscoveredConnectors.tsx`:

```tsx
import React from 'react';
import { Pressable, Text } from 'react-native';

import type { DiscoverySnapshot } from '@/application/connector-discovery';
import type { DiscoveredConnector } from '@/domain/discovery/discovered-connector';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  snapshot: DiscoverySnapshot;
  /** True while the session is `disconnected` or `error`: the only states where a tap can act. */
  enabled: boolean;
  onSelect: (connector: DiscoveredConnector) => void;
}

const makeStyles = (theme: Theme) => ({
  row: {
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowPressed: { opacity: 0.6 },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.bodySize,
    fontWeight: 'bold' as const,
  },
});

function tagFor(connector: DiscoveredConnector): string | null {
  if (connector.pairingRequired === null) {
    return null;
  }
  return connector.pairingRequired ? 'Needs pairing' : 'Open';
}

export function DiscoveredConnectors({ snapshot, enabled, onSelect }: Props) {
  const styles = useThemedStyles(makeStyles);
  if (!enabled || snapshot.availability === 'unsupported') {
    return null;
  }
  const empty = snapshot.connectors.length === 0;
  return (
    <Section testID="discovered-connectors">
      <SectionTitle>Connectors on this network</SectionTitle>
      {snapshot.availability === 'needsDevBuild' ? (
        <BodyText muted>Connector discovery needs the Avionix development build.</BodyText>
      ) : (
        <>
          {snapshot.connectors.map((connector) => {
            const tag = tagFor(connector);
            return (
              <Pressable
                key={connector.name}
                testID={`discovered-${connector.name}`}
                accessibilityRole="button"
                accessibilityLabel={`Connect to ${connector.name}`}
                onPress={() => onSelect(connector)}
                style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
              >
                <Text style={styles.name}>{connector.name}</Text>
                <BodyText muted>{`${connector.host}:${connector.port}`}</BodyText>
                {tag === null ? null : <BodyText muted>{tag}</BodyText>}
              </Pressable>
            );
          })}
          {empty && snapshot.scanning ? <BodyText muted>Looking for connectors…</BodyText> : null}
          {empty && !snapshot.scanning && snapshot.error === null ? (
            <BodyText muted>No connectors found yet.</BodyText>
          ) : null}
          {snapshot.error === null ? null : (
            <BodyText tone="danger">{`Discovery failed: ${snapshot.error.message}`}</BodyText>
          )}
        </>
      )}
    </Section>
  );
}
```

- [ ] **Step 4: Wire the screen**

In `src/features/mvp/MvpScreen.tsx`:

Add imports:

```tsx
import type { DiscoveredConnector } from '@/domain/discovery/discovered-connector';
import { DiscoveredConnectors } from '@/features/connection/DiscoveredConnectors';
import { isDiscoveryState, useConnectorDiscovery } from '@/hooks/useConnectorDiscovery';
```

After `const settings = useConnectionSettings();`:

```tsx
  const discovery = useConnectorDiscovery(snapshot.state);
```

After `onPair`:

```tsx
  const onSelectConnector = useCallback(
    (connector: DiscoveredConnector) => {
      void settings.setConnection(connector.host, connector.port);
      void connect(connector.host, String(connector.port));
    },
    [connect, settings],
  );
```

Directly after `<ConnectionForm … />`:

```tsx
      <DiscoveredConnectors
        snapshot={discovery}
        enabled={isDiscoveryState(snapshot.state)}
        onSelect={onSelectConnector}
      />
```

- [ ] **Step 5: Run the tests and the gate**

Run: `npx jest tests/ui/mvp-screen.test.tsx tests/web/mvp-screen.web.test.tsx`
Expected: PASS, including the four new UI cases and the web case.

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/features/connection/DiscoveredConnectors.tsx src/features/mvp/MvpScreen.tsx tests/ui/mvp-screen.test.tsx tests/web/mvp-screen.web.test.tsx
git commit -m "feat(discovery): list connectors on the connection screen and connect on tap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/connector.md`
- Modify: `docs/architecture.md`
- Modify: `docs/development.md`
- Modify: `docs/testing/xplane-smoke-test.md`

`docs/` is Prettier-ignored; `README.md` is not, so run `npx prettier --check README.md` after editing it. Keep every claim consistent with the code as built in Tasks 1–6; read the files you cite before editing.

- [ ] **Step 1: README**

In "MVP scope", add a bullet after the first one:

```markdown
- Find Avionix Connectors on the local network (mDNS) and connect to one with a tap. Needs a
  development build; Expo Go and the web keep the typed host and port.
```

Change the "Not in scope" line to:

```markdown
Not in scope: any real avionics UI, device roles, accounts, cloud. See
```

In "Requirements", change the Expo Go bullet to:

```markdown
- Expo Go on a physical iPhone or Android device (same Wi-Fi as the X-Plane computer), or an
  Avionix development build (`docs/development.md`) for connector discovery.
```

In the limitations list, replace `- No automatic discovery of the X-Plane host; the IP must be typed.` with:

```markdown
- Connector discovery needs the development build (`react-native-zeroconf` is a native module);
  in Expo Go and on the web the host must be typed.
```

- [ ] **Step 2: `docs/connector.md`**

Extend the `## Discovery` section (keep its first two lines) with:

```markdown
The app browses `_avionix._tcp` while it is in the foreground and not connected, and lists every
connector it resolves under the connection form: the instance name, `host:port` (the first IPv4
address the connector advertises, else its hostname) and "Needs pairing" or "Open" from the
`pairing` TXT record. Tapping a row fills the form, saves it and connects; a connector that needs
pairing then shows the usual code prompt. The list clears when the app connects or goes to the
background, and fills again within a few seconds when it returns.

Discovery needs a development build: `react-native-zeroconf` is a native module, so Expo Go shows
"Connector discovery needs the Avionix development build." and the web never shows the section.
`app.json` declares `NSBonjourServices` (`_avionix._tcp`) and the local-network usage text for iOS,
and the `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` and `CHANGE_WIFI_MULTICAST_STATE` permissions
for Android. On iOS the first scan triggers the local-network permission prompt; if it was denied,
the list stays empty with no error (iOS gives apps no signal), and Settings → Avionix → Local
Network turns it back on. Android emulators have no multicast; use a physical device.
```

- [ ] **Step 3: `docs/architecture.md`**

Layer table: add to the Domain row's "Contains" cell `, the \`ServiceBrowser\` port and \`DiscoveredConnector\``; to the Infrastructure row `, \`ZeroconfServiceBrowser\` and the null browser`; to the Application row `, \`ConnectorDiscovery\``. Add a row after UI:

```markdown
| Platform | `src/platform` | infrastructure | the only platform-specific code: the web connection default and the `ServiceBrowser` factory (`service-browser.ts` for native, `service-browser.web.ts` for the web) |
```

After the "Data flow" code block and its sentence, add:

```markdown
## Connector discovery

```
MvpScreen → useConnectorDiscovery(sessionState)
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
```

- [ ] **Step 4: `docs/development.md`**

Prerequisites: change the Expo Go bullet to:

```markdown
- Expo Go on a physical device for everything except connector discovery, which uses the native
  module `react-native-zeroconf` and therefore needs a development build (see below).
```

Logging: add `discovery` to the categories list (`…, \`session\`, \`discovery\`, \`ui\`.`).

Development builds: replace the first paragraph with:

```markdown
Connector discovery (`_avionix._tcp` over mDNS) is the first feature that needs a development
build: `react-native-zeroconf` is a native module that Expo Go does not contain. A development
build is also the way to verify the native LAN settings in `app.json` (iOS App Transport Security
local networking, `NSBonjourServices`, Android cleartext traffic and the Wi-Fi multicast
permission) and to test on iOS without the Expo Go login requirement.
```

- [ ] **Step 5: Smoke test**

In `## Setup`, change step 4 to:

```markdown
4. Two physical devices on the same Wi-Fi: one running the Avionix development build (needed for
   discovery, `docs/development.md`) and one with Expo Go; `npm start` (or
   `npx expo start --dev-client`) running on the dev machine.
```

Append rows to the procedure table (continue the numbering from the last existing row; replace `N` accordingly):

```markdown
| N | Development build, disconnected, connector running with mDNS on: open Avionix | iOS asks for local-network permission on the first scan; allow it. Within a few seconds "Connectors on this network" lists the connector with `<ip>:8080` and "Needs pairing" | |
| N+1 | Tap the connector row | Host and port fill in; status goes to `pairing` (or `connected` when this device is already paired); the section disappears while busy | |
| N+2 | Disconnect, then stop the connector with the app in the foreground | The row disappears within about 10 s; "Looking for connectors…" shows | |
| N+3 | Start the connector with `--no-mdns` | Nothing is listed; typing the IP still connects | |
| N+4 | Background the app, restart the connector without `--no-mdns`, foreground the app | The list is empty for a moment, then shows the connector again | |
| N+5 | Expo Go device, disconnected | The section shows "Connector discovery needs the Avionix development build." and no rows | |
| N+6 | iOS only: Settings → Avionix → Local Network off, reopen the app | No rows and no error; turning the toggle back on and reopening the app lists the connector again | |
```

In `## Failure hints`, add:

```markdown
- Nothing is ever listed on Android: some routers block multicast between clients (AP isolation);
  the same setting blocks the connection itself, so check that a typed IP works first.
- Nothing is listed on iOS but a typed IP works: check Settings → Avionix → Local Network.
```

- [ ] **Step 6: Verify and commit**

Run: `npx prettier --check README.md && npm run lint && npm test`
Expected: green (`docs/` is ignored by Prettier; README is checked).

```bash
git add README.md docs/connector.md docs/architecture.md docs/development.md docs/testing/xplane-smoke-test.md
git commit -m "docs(discovery): document connector discovery, the development build and the smoke test steps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Decisions → Tasks 4–6 (auto scan, tap connects, library, dev build). Connector facts → Task 3 (`AVIONIX_SERVICE_TYPE`) and Task 2 (`scan` arguments). Library facts → Task 2 (declaration, adapter, NSD constant), Task 4 (availability check, permissions, `NSBonjourServices`). Domain → Task 1. Infrastructure → Tasks 1–2. Platform → Task 4. Application → Task 3 (including the synchronous-error case, Decision 4). UI hook, `setConnection`, component and screen → Tasks 5–6 (copy verbatim, hidden when not enabled or unsupported). App config → Task 4. Error-handling table → Tasks 2, 3, 6 and the smoke test. Testing section → every suite named in the spec exists (node: connector-discovery, zeroconf-service-browser, null browser, plus the domain mapping; expo: mvp-screen cases, hook test, platform test; web: mvp-screen case, platform test). Documentation → Task 7. Out of scope → nothing added.

**Placeholder scan.** No TBD/TODO; every code step has full content; the smoke-test rows use `N` only for numbering continuation, with an explicit instruction.

**Type consistency.** `ServiceBrowserListener` methods `resolved/removed/error` used identically in Tasks 1, 2, 3 and the fake. `createFakeServiceBrowser(availability, { failOnBrowse })` and `listener()` used the same way in Tasks 3–6. `DiscoveryApi` (Task 4) exposes `store/start/stop`, which Task 5 uses. `setConnection(host: string, port: number)` in Tasks 5 and 6. `isDiscoveryState` exported from `useConnectorDiscovery.ts` and imported in Task 6. `makeServices(snapshot, browser)` returns `browser` (Task 4) and Task 6 destructures it.
