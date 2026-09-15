# Avionix App Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Avionix app detects an Avionix Connector on connect, asks the user for the six-digit code the connector prints, stores the returned bearer token per connector, sends it on every HTTP request and WebSocket upgrade, and asks for a new code when the connector rejects it — while a direct connection to X-Plane keeps working unchanged.

**Architecture:** The connection state machine gains a `pairing` state; `SimulatorSession` owns the pairing logic. On connect the session loads any stored token, probes `GET /avionix/info` through a new `ConnectorClient`, and either continues straight into the existing X-Plane flow (no connector, or a connector that already trusts this device) or stops in `pairing` until `pair(code)` is called. Both transports take an `AuthProvider` (`() => string | null`) that reads the session's in-memory token, so `HttpTransport` adds `Authorization: Bearer <token>` and the WebSocket URL gets `?token=`. Tokens live in the existing `SettingsStorage` port behind a `PairingTokenStore`. The UI only sees a `pairing` state, a connector name and a `pair(code)` call.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, zod 4, Jest 29 via `jest-expo` with three projects (`node`, `expo`, `web`), `@testing-library/react-native` 14 (`render`/`fireEvent`/`act` are awaited), `ws` for the in-process mock X-Plane server.

**Spec:** `docs/superpowers/specs/2026-09-15-app-pairing-design.md` (sub-project 2 of the Avionix Connector work; sub-project 1, the connector protocol on the bridge, is merged and documented in `docs/connector.md`).

## Global Constraints

- Connector first, X-Plane still allowed: `DEFAULT_PORT` becomes 8080; on connect the app probes `GET /avionix/info`; a connector runs the pairing flow, anything else is treated as X-Plane itself.
- Pairing UI is an inline mode of the existing connection screen. No modal, no navigation.
- Tokens live in the existing `SettingsStorage` port (AsyncStorage on native, localStorage on web). Not `expo-secure-store`.
- Pairing logic is owned by `SimulatorSession`.
- Error bodies from the connector use X-Plane's shape `{ error_code, error_message }`: `unauthorized` (401), `pairing_invalid_code` (401), `pairing_rate_limited` / `too_many_attempts` (429), `invalid_body` (400).
- New `AvionixErrorCode` values and their `retryable` flags: `PAIRING_REQUIRED` (false), `PAIRING_FAILED` (false), `PAIRING_RATE_LIMITED` (true), `UNAUTHORIZED` (false).
- **Tokens must never appear in logs**, in error messages, or in any snapshot field the UI renders. The WebSocket transport logs and reports its URL with the query string removed.
- Every external payload (HTTP body, stored setting) is validated with zod before use.
- No `any`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable` without a stated reason, and no `as T` casts that bypass validation, in any TypeScript file.
- Prettier: `singleQuote`, `trailingComma: 'all'`, `printWidth: 100`, `semi: true`. `docs/` is listed in `.prettierignore`, so documentation is **not** formatted by Prettier — do not reformat it to satisfy `format:check`.
- Quality gate before every commit: `npm run typecheck && npm run lint && npm run format:check && npm test`. The code blocks in this plan show the intended content, not byte-exact Prettier output: if `format:check` complains about a file you just pasted into, run `npx prettier --write <file>` and re-read the diff — the Prettier config is authoritative.
- `tsconfig.json` sets `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch`: every index access into a `Record<string, T>` yields `T | undefined` and must be narrowed or defaulted.
- Device verification is the user's job: never launch Xcode, Android Studio, an iOS simulator, an Android emulator, or `expo start`.
- Every server, socket and child process opened in a test is closed in `afterEach` or `finally`; no bare sleeps in integration tests — poll with the `until` helper.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Decisions taken where the spec leaves a detail open

These hold across every task; do not re-decide them per task.

1. **`AvionixError` carries `httpStatus`.** The spec wants `ConnectorClient.getInfo()` to return `null` on "`HTTP_ERROR` with status 404", but `AvionixError` has no status today (`capabilities.ts` sniffs the message text). Task 1 adds an optional `httpStatus?: number` to `AvionixErrorInit` and `readonly httpStatus: number | undefined` to the class; `HttpTransport.toHttpError` fills it in. `ConnectorClient` then checks `error.httpStatus === 404`.
2. **Stored tokens are JSON, not bare strings.** `PairingTokenStore` writes `{"token":"<token>"}` and validates it with zod on read, so "a garbage value reads back as `null`" is actually detectable and the "zod for every external payload" rule holds. `clear()` writes `{"token":""}` (the `SettingsStorage` port has no remove) and `get()` maps an empty token to `null`.
3. **The connector probe runs in `initial` mode only.** A reconnect keeps the connector info already in the snapshot and reuses the in-memory token; a connector that has forgotten this device surfaces through the `UNAUTHORIZED` path instead of a second probe.
4. **A failed probe marks `http: 'failed'` and `capabilities: 'failed'`.** The probe is the session's first HTTP request, and the `connector` diagnostics union has no failure member. `connector` goes back to `'idle'`. This also keeps the existing "marks http failed when capabilities cannot be fetched" unit test green.
5. **Reconnect diagnostics keep the connector verdict**: when diagnostics are reset for a reconnect attempt, `connector` is set to `'paired'` if `snapshot.connector !== null`, otherwise `'direct'`.
6. **`createConnectorClient` and `tokenStore` are required `SimulatorSessionDeps`** (as written in the spec). Every existing session test fixture gains them in Task 6.
7. **The pairing code input lives in `ConnectionForm`.** The spec assigns "clear the code after a failed attempt" to `MvpScreen` but lists no `code` prop, so `ConnectionForm` owns the text in local state and clears it in an effect when `pairing` falls from `true` to `false` while `state` is still `'pairing'` (a successful pair leaves `'pairing'`).
8. **Null connector name renders as `This connector`** in the pairing prompt.
9. **Diagnostics label for the connector step:** `-` (idle), `...` (pending), `DIRECT`, `PAIRING`, `PAIRED`, matching the shouty `YES`/`NO` of the other rows; `DIRECT` and `PAIRED` use the `success` tone, the rest none.
10. **`MvpScreen.onPair` swallows a rejected `pair()`.** `pair()` only rejects with `INTERNAL` (wrong state or a concurrent call), which the disabled button already prevents; every user-visible failure arrives through `snapshot.error`.

## File Map

| Path | Responsibility |
|---|---|
| `src/domain/connection/connection-state.ts` | adds the `pairing` state and the `pairingRequired` / `pair` events |
| `src/domain/errors/avionix-error.ts` | adds four error codes and `httpStatus` |
| `src/domain/connector/connector-info.ts` | `ConnectorInfo` |
| `src/infrastructure/xplane/auth.ts` | `AuthProvider`, `noAuth`, `appendTokenQuery`, `urlWithoutQuery` |
| `src/infrastructure/xplane/http/http-transport.ts` | bearer header, bare-401 → `UNAUTHORIZED`, `httpStatus` |
| `src/infrastructure/xplane/http/error-mapping.ts` | connector `error_code` → `AvionixErrorCode`, retryable set |
| `src/infrastructure/xplane/websocket/websocket-transport.ts` | token-free URL in logs and errors |
| `src/infrastructure/xplane/xplane-client.ts` | `auth` option, `?token=` on the WebSocket URL |
| `src/infrastructure/connector/connector-client.ts` | `getInfo()`, `pair(code)` |
| `src/infrastructure/connector/schemas.ts` | zod schemas for `/avionix/info` and `/avionix/pair` |
| `src/application/pairing-token-store.ts` | per-connector token persistence |
| `src/application/session-snapshot.ts` | `connector` in the snapshot and in diagnostics |
| `src/application/simulator-session.ts` | connector step, `pairing` state, `pair()`, `UNAUTHORIZED` handling |
| `src/app/composition-root.ts`, `src/app/services-context.tsx`, `src/hooks/useSimulatorSession.ts` | wiring `pair` and the new deps |
| `src/features/connection/ConnectionForm.tsx` | inline pairing mode |
| `src/features/connection/ConnectionStatus.tsx` | plain-text error copy for the new codes |
| `src/features/diagnostics/DiagnosticsPanel.tsx` | the connector row |
| `src/features/mvp/MvpScreen.tsx` | `onPair`, in-flight flag |
| `tests/mock-xplane/mock-xplane-server.ts` | connector mode for integration tests |
| `tests/integration/simulator-session-pairing.test.ts` | the pairing flows end to end against the mock |
| `tests/integration/connector-pairing-e2e.test.ts` | the real `scripts/avionix-bridge.js` as a child process |
| `docs/connector.md`, `docs/web.md`, `README.md`, `docs/testing/xplane-smoke-test.md`, `docs/architecture.md` | documentation |

---

### Task 1: Domain — pairing state, error codes, `ConnectorInfo`

**Files:**
- Modify: `src/domain/connection/connection-state.ts:3-24`
- Modify: `src/domain/errors/avionix-error.ts:1-45`
- Create: `src/domain/connector/connector-info.ts`
- Test: `tests/unit/domain/connection-state.test.ts`, `tests/unit/domain/avionix-error.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type ConnectionState = 'disconnected' | 'connecting' | 'pairing' | 'connected' | 'reconnecting' | 'error'`
  - `type ConnectionEvent = 'connect' | 'connected' | 'failed' | 'disconnect' | 'socketLost' | 'retryExhausted' | 'pairingRequired' | 'pair'`
  - `transition(state: ConnectionState, event: ConnectionEvent): ConnectionState` (unchanged signature) with the new edges `connecting --pairingRequired--> pairing`, `reconnecting --pairingRequired--> pairing`, `pairing --pair--> connecting`, `pairing --disconnect--> disconnected`
  - `AvionixErrorCode` additionally `'PAIRING_REQUIRED' | 'PAIRING_FAILED' | 'PAIRING_RATE_LIMITED' | 'UNAUTHORIZED'`
  - `AvionixErrorInit.httpStatus?: number` and `AvionixError.httpStatus: number | undefined`
  - `interface ConnectorInfo { name: string; version: string; pairingRequired: boolean; xplane: { host: string; port: number; reachable: boolean } }` from `@/domain/connector/connector-info`

- [ ] **Step 1: Extend the state-table test**

In `tests/unit/domain/connection-state.test.ts`, add the four new rows to `legal` (after the `reconnecting` rows) and the two new events to `events`:

```ts
const legal: Array<[ConnectionState, ConnectionEvent, ConnectionState]> = [
  ['disconnected', 'connect', 'connecting'],
  ['connecting', 'connected', 'connected'],
  ['connecting', 'failed', 'error'],
  ['connecting', 'disconnect', 'disconnected'],
  ['connecting', 'pairingRequired', 'pairing'],
  ['pairing', 'pair', 'connecting'],
  ['pairing', 'disconnect', 'disconnected'],
  ['connected', 'socketLost', 'reconnecting'],
  ['connected', 'failed', 'error'],
  ['connected', 'disconnect', 'disconnected'],
  ['reconnecting', 'connected', 'connected'],
  ['reconnecting', 'retryExhausted', 'error'],
  ['reconnecting', 'disconnect', 'disconnected'],
  ['reconnecting', 'pairingRequired', 'pairing'],
  ['error', 'connect', 'connecting'],
  ['error', 'disconnect', 'disconnected'],
];

const events: ConnectionEvent[] = [
  'connect',
  'connected',
  'failed',
  'disconnect',
  'socketLost',
  'retryExhausted',
  'pairingRequired',
  'pair',
];
```

Then add one explicit case at the end of the `describe('transition', ...)` block (the spec calls it out by name):

```ts
  it('rejects pair from connected with INTERNAL', () => {
    expect(() => transition('connected', 'pair')).toThrow('Illegal connection transition');
  });

  it('lists pairing after connecting', () => {
    expect(CONNECTION_STATES).toEqual([
      'disconnected',
      'connecting',
      'pairing',
      'connected',
      'reconnecting',
      'error',
    ]);
  });
```

- [ ] **Step 2: Extend the error test**

Append to `tests/unit/domain/avionix-error.test.ts`, inside `describe('AvionixError', ...)`:

```ts
  it('carries an http status when one is given and undefined otherwise', () => {
    const withStatus = new AvionixError({ code: 'HTTP_ERROR', message: 'x', httpStatus: 404 });
    expect(withStatus.httpStatus).toBe(404);
    expect(new AvionixError({ code: 'UNKNOWN', message: 'x' }).httpStatus).toBeUndefined();
  });

  it('accepts the pairing error codes', () => {
    const codes = [
      'PAIRING_REQUIRED',
      'PAIRING_FAILED',
      'PAIRING_RATE_LIMITED',
      'UNAUTHORIZED',
    ] as const;
    for (const code of codes) {
      expect(new AvionixError({ code, message: code }).code).toBe(code);
    }
  });
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx jest --selectProjects node tests/unit/domain/connection-state.test.ts tests/unit/domain/avionix-error.test.ts`
Expected: FAIL — `connection-state` fails on `transition('connecting', 'pairingRequired')` throwing `Illegal connection transition: connecting + pairingRequired`, and `avionix-error` fails to compile/run because `httpStatus` is not a known property.

- [ ] **Step 4: Implement the state table**

Replace `src/domain/connection/connection-state.ts:3-24` with:

```ts
export type ConnectionState =
  'disconnected' | 'connecting' | 'pairing' | 'connected' | 'reconnecting' | 'error';

export const CONNECTION_STATES: readonly ConnectionState[] = [
  'disconnected',
  'connecting',
  'pairing',
  'connected',
  'reconnecting',
  'error',
];

export type ConnectionEvent =
  | 'connect'
  | 'connected'
  | 'failed'
  | 'disconnect'
  | 'socketLost'
  | 'retryExhausted'
  | 'pairingRequired'
  | 'pair';

const TABLE: Readonly<Record<ConnectionState, Partial<Record<ConnectionEvent, ConnectionState>>>> =
  {
    disconnected: { connect: 'connecting' },
    connecting: {
      connected: 'connected',
      failed: 'error',
      disconnect: 'disconnected',
      pairingRequired: 'pairing',
    },
    pairing: { pair: 'connecting', disconnect: 'disconnected' },
    connected: { socketLost: 'reconnecting', failed: 'error', disconnect: 'disconnected' },
    reconnecting: {
      connected: 'connected',
      retryExhausted: 'error',
      disconnect: 'disconnected',
      pairingRequired: 'pairing',
    },
    error: { connect: 'connecting', disconnect: 'disconnected' },
  };
```

`transition` itself is unchanged.

- [ ] **Step 5: Implement the error changes**

In `src/domain/errors/avionix-error.ts`, add the four codes to the `AvionixErrorCode` union (after `'INCOMING_TRAFFIC_DISABLED'`) and the status field:

```ts
export type AvionixErrorCode =
  | 'INVALID_HOST'
  | 'INVALID_PORT'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INCOMING_TRAFFIC_DISABLED'
  | 'PAIRING_REQUIRED'
  | 'PAIRING_FAILED'
  | 'PAIRING_RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'UNSUPPORTED_API'
  | 'INVALID_RESPONSE'
  | 'WEBSOCKET_ERROR'
  | 'DATAREF_NOT_FOUND'
  | 'COMMAND_NOT_FOUND'
  | 'DATAREF_READONLY'
  | 'SUBSCRIPTION_FAILED'
  | 'WRITE_FAILED'
  | 'COMMAND_FAILED'
  | 'SIMULATOR_ERROR'
  | 'SIMULATOR_NOT_READY'
  | 'CANCELLED'
  | 'INTERNAL'
  | 'UNKNOWN';

export interface AvionixErrorInit {
  code: AvionixErrorCode;
  message: string;
  retryable?: boolean;
  simulatorErrorCode?: string;
  /** The HTTP status that produced this error, when it came from an HTTP response. */
  httpStatus?: number;
  cause?: unknown;
}
```

In the class, next to `simulatorErrorCode`:

```ts
  readonly httpStatus: number | undefined;
```

and in the constructor, after `this.simulatorErrorCode = init.simulatorErrorCode;`:

```ts
    this.httpStatus = init.httpStatus;
```

- [ ] **Step 6: Create `src/domain/connector/connector-info.ts`**

```ts
/**
 * What `GET /avionix/info` reports about an Avionix Connector. The domain layer only
 * describes the shape; validation lives in `src/infrastructure/connector/schemas.ts`.
 */
export interface ConnectorInfo {
  name: string;
  version: string;
  pairingRequired: boolean;
  xplane: { host: string; port: number; reachable: boolean };
}
```

- [ ] **Step 7: Run the tests and verify they pass**

Run: `npx jest --selectProjects node tests/unit/domain/`
Expected: PASS, all domain unit suites green.

- [ ] **Step 8: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/domain tests/unit/domain
git commit -m "feat(domain): add the pairing state, the pairing error codes and ConnectorInfo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Transports — `AuthProvider`, bearer header, `?token=`, token-free logs, error mapping

**Files:**
- Create: `src/infrastructure/xplane/auth.ts`
- Modify: `src/infrastructure/xplane/http/http-transport.ts:34-39` (options), `:71-79` (headers), `:128-153` (`toHttpError`)
- Modify: `src/infrastructure/xplane/http/error-mapping.ts:3-26`
- Modify: `src/infrastructure/xplane/websocket/websocket-transport.ts` (logged/reported URL)
- Modify: `src/infrastructure/xplane/xplane-client.ts:33-41` (options), `:155-168` (`connectWebSocket`)
- Create: `tests/unit/infrastructure/auth.test.ts`, `tests/unit/infrastructure/xplane-client-auth.test.ts`
- Test: `tests/unit/infrastructure/http-transport.test.ts`, `tests/unit/infrastructure/error-mapping.test.ts`

**Interfaces:**
- Consumes (Task 1): `AvionixErrorCode` including `'UNAUTHORIZED' | 'PAIRING_FAILED' | 'PAIRING_RATE_LIMITED'`; `AvionixErrorInit.httpStatus?: number`.
- Produces:
  - `type AuthProvider = () => string | null` and `const noAuth: AuthProvider` from `@/infrastructure/xplane/auth`
  - `appendTokenQuery(url: string, token: string): string`
  - `urlWithoutQuery(url: string): string`
  - `HttpTransportOptions.auth?: AuthProvider`
  - `XPlaneClientOptions.auth?: AuthProvider`
  - `simulatorErrorToAvionixError` keeps its signature `(input: { errorCode: string; errorMessage?: string; httpStatus?: number; cause?: unknown }) => AvionixError` and now sets `httpStatus` on the result

- [ ] **Step 1: Write the failing test for the auth helpers**

`tests/unit/infrastructure/auth.test.ts`:

```ts
import { appendTokenQuery, noAuth, urlWithoutQuery } from '@/infrastructure/xplane/auth';

describe('appendTokenQuery', () => {
  it('appends the token with ? when the URL has no query', () => {
    expect(appendTokenQuery('ws://pc.local:8080/api/v3', 'abc')).toBe(
      'ws://pc.local:8080/api/v3?token=abc',
    );
  });

  it('appends the token with & when the URL already has a query', () => {
    expect(appendTokenQuery('ws://pc.local:8080/api/v3?a=1', 'abc')).toBe(
      'ws://pc.local:8080/api/v3?a=1&token=abc',
    );
  });

  it('URL-encodes the token', () => {
    expect(appendTokenQuery('ws://pc.local/api/v3', 'a b/c+d')).toBe(
      'ws://pc.local/api/v3?token=a%20b%2Fc%2Bd',
    );
  });
});

describe('urlWithoutQuery', () => {
  it('drops everything from the first question mark', () => {
    expect(urlWithoutQuery('ws://pc.local/api/v3?token=secret')).toBe('ws://pc.local/api/v3');
    expect(urlWithoutQuery('ws://pc.local/api/v3')).toBe('ws://pc.local/api/v3');
  });
});

describe('noAuth', () => {
  it('always returns null', () => {
    expect(noAuth()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --selectProjects node tests/unit/infrastructure/auth.test.ts`
Expected: FAIL — `Cannot find module '@/infrastructure/xplane/auth'`.

- [ ] **Step 3: Create `src/infrastructure/xplane/auth.ts`**

```ts
/**
 * Supplies the bearer token for one connection, or null when the target needs no token.
 * Read at request time (HTTP) and at connect time (WebSocket) so a token obtained after the
 * transport was constructed is picked up on the next call.
 */
export type AuthProvider = () => string | null;

export const noAuth: AuthProvider = () => null;

/**
 * Browsers cannot set headers on a WebSocket upgrade, so the connector accepts `?token=`.
 * The URL has no query today; the `&` branch keeps this correct if one is ever added.
 */
export function appendTokenQuery(url: string, token: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/** Strips the query string so a URL carrying a token can be logged or shown in an error. */
export function urlWithoutQuery(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest --selectProjects node tests/unit/infrastructure/auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing tests for the HTTP transport and the error mapping**

Append to `describe('HttpTransport', ...)` in `tests/unit/infrastructure/http-transport.test.ts`:

```ts
  it('adds an Authorization header only when the auth provider returns a token', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: '{"data": 1}' }));
    let token: string | null = null;
    const withAuth = new HttpTransport({
      origin: 'http://192.168.1.100:8080',
      fetchImpl,
      auth: () => token,
      logger: silentLogger,
    });
    await withAuth.request({ method: 'GET', path: '/x', schema });
    expect(calls[0]?.init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    token = 'tok-123';
    await withAuth.request({ method: 'GET', path: '/x', schema });
    expect(calls[1]?.init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123',
    });
  });

  it('maps a 401 without an X-Plane error body to UNAUTHORIZED', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 401, body: 'Unauthorized' }));
    await expectCode(
      transport(fetchImpl).request({ method: 'GET', path: '/x', schema }),
      'UNAUTHORIZED',
    );
  });

  it('maps a 401 carrying error_code unauthorized to UNAUTHORIZED', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 401,
      body: '{"error_code":"unauthorized","error_message":"Pair this device first."}',
    }));
    await expectCode(
      transport(fetchImpl).request({ method: 'GET', path: '/x', schema }),
      'UNAUTHORIZED',
    );
  });

  it('records the HTTP status on HTTP_ERROR so callers can branch on 404', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 404, body: 'Not Found' }));
    try {
      await transport(fetchImpl).request({ method: 'GET', path: '/avionix/info', schema });
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('HTTP_ERROR');
      expect(isAvionixError(error) && error.httpStatus).toBe(404);
    }
  });
```

Append to `tests/unit/infrastructure/error-mapping.test.ts`:

```ts
  it.each([
    ['unauthorized', 'UNAUTHORIZED', false],
    ['pairing_invalid_code', 'PAIRING_FAILED', false],
    ['pairing_rate_limited', 'PAIRING_RATE_LIMITED', true],
    ['too_many_attempts', 'PAIRING_RATE_LIMITED', true],
  ])('maps the connector code %s to %s', (errorCode, expected, retryable) => {
    const error = simulatorErrorToAvionixError({ errorCode, errorMessage: 'msg', httpStatus: 429 });
    expect(error.code).toBe(expected);
    expect(error.retryable).toBe(retryable);
    expect(error.simulatorErrorCode).toBe(errorCode);
    expect(error.httpStatus).toBe(429);
  });
```

- [ ] **Step 6: Run both to verify they fail**

Run: `npx jest --selectProjects node tests/unit/infrastructure/http-transport.test.ts tests/unit/infrastructure/error-mapping.test.ts`
Expected: FAIL — `auth` is not a known `HttpTransportOptions` property, the bare 401 maps to `HTTP_ERROR`, `httpStatus` is `undefined`, and `unauthorized` maps to `SIMULATOR_ERROR`.

- [ ] **Step 7: Implement the error mapping**

Replace `src/infrastructure/xplane/http/error-mapping.ts` with:

```ts
import { AvionixError, type AvionixErrorCode } from '@/domain/errors/avionix-error';

const CODE_MAP: Readonly<Record<string, AvionixErrorCode>> = {
  invalid_dataref_name: 'DATAREF_NOT_FOUND',
  invalid_dataref_id: 'DATAREF_NOT_FOUND',
  invalid_command_name: 'COMMAND_NOT_FOUND',
  invalid_command_id: 'COMMAND_NOT_FOUND',
  dataref_is_readonly: 'DATAREF_READONLY',
  // Avionix Connector codes (docs/connector.md).
  unauthorized: 'UNAUTHORIZED',
  pairing_invalid_code: 'PAIRING_FAILED',
  pairing_rate_limited: 'PAIRING_RATE_LIMITED',
  too_many_attempts: 'PAIRING_RATE_LIMITED',
};

/** Codes the caller may retry unchanged after waiting; everything else is terminal. */
const RETRYABLE_CODES: ReadonlySet<string> = new Set(['pairing_rate_limited', 'too_many_attempts']);

export function simulatorErrorToAvionixError(input: {
  errorCode: string;
  errorMessage?: string;
  httpStatus?: number;
  cause?: unknown;
}): AvionixError {
  return new AvionixError({
    code: CODE_MAP[input.errorCode] ?? 'SIMULATOR_ERROR',
    message: input.errorMessage ?? `X-Plane error: ${input.errorCode}`,
    retryable: RETRYABLE_CODES.has(input.errorCode),
    simulatorErrorCode: input.errorCode,
    httpStatus: input.httpStatus,
    cause:
      input.cause ??
      (input.httpStatus === undefined ? undefined : { httpStatus: input.httpStatus }),
  });
}
```

- [ ] **Step 8: Implement the HTTP transport changes**

In `src/infrastructure/xplane/http/http-transport.ts`, add the import:

```ts
import { type AuthProvider, noAuth } from '@/infrastructure/xplane/auth';
```

extend the options interface:

```ts
export interface HttpTransportOptions {
  origin: string;
  fetchImpl?: FetchLike;
  defaultTimeoutMs?: number;
  logger?: Logger;
  /** Supplies the connector bearer token, or null for a direct X-Plane connection. */
  auth?: AuthProvider;
}
```

add the field and assign it in the constructor (next to `this.logger`):

```ts
  private readonly auth: AuthProvider;
```
```ts
    this.auth = options.auth ?? noAuth;
```

build the headers in `request` (replacing the inline `headers` literal):

```ts
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const token = this.auth();
    if (token !== null) {
      // Never logged: the debug lines below carry method, url and status only.
      headers.Authorization = `Bearer ${token}`;
    }
    const init: FetchInit = {
      method: req.method,
      headers,
      signal: controller.signal,
    };
```

and replace `toHttpError` with:

```ts
  private toHttpError(status: number, text: string, req: HttpRequest<unknown>): AvionixError {
    const parsed = parseJsonText(text);
    if (parsed.ok) {
      const payload = errorPayloadSchema.safeParse(parsed.value);
      if (payload.success) {
        return simulatorErrorToAvionixError({
          errorCode: payload.data.error_code,
          errorMessage: payload.data.error_message,
          httpStatus: status,
        });
      }
    }
    if (status === 401) {
      // An Avionix Connector that does not recognise our token; X-Plane itself never
      // answers 401, so a bare 401 means the same thing as error_code "unauthorized".
      return new AvionixError({
        code: 'UNAUTHORIZED',
        message:
          'The Avionix Connector rejected this device (HTTP 401). Pair again with the code ' +
          'shown in the connector window.',
        httpStatus: status,
      });
    }
    if (status === 403) {
      return new AvionixError({
        code: 'INCOMING_TRAFFIC_DISABLED',
        message:
          'X-Plane refused the request (HTTP 403). In X-Plane, open Settings > Network and ' +
          'make sure "Disable Incoming Traffic" is not selected.',
        httpStatus: status,
      });
    }
    return new AvionixError({
      code: 'HTTP_ERROR',
      message: `X-Plane answered HTTP ${status} for ${req.method} ${req.path}`,
      retryable: status >= 500,
      httpStatus: status,
    });
  }
```

- [ ] **Step 9: Run the two suites to verify they pass**

Run: `npx jest --selectProjects node tests/unit/infrastructure/http-transport.test.ts tests/unit/infrastructure/error-mapping.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing test for the WebSocket URL and logging**

`tests/unit/infrastructure/xplane-client-auth.test.ts`:

```ts
import { createLogger, createMemorySink } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import type {
  SocketCloseEvent,
  SocketMessageEvent,
  WebSocketLike,
} from '@/infrastructure/xplane/websocket/websocket-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';

class FakeSocket implements WebSocketLike {
  readyState = 1;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: SocketCloseEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: SocketMessageEvent) => void) | null = null;
  send(): void {}
  close(): void {
    this.onclose?.({ code: 1000, reason: '', wasClean: true });
  }
}

function clientWith(auth: () => string | null) {
  const urls: string[] = [];
  const sink = createMemorySink();
  const socket = new FakeSocket();
  const client = new XPlaneClient({
    config: { host: 'pc.local', port: 8080 },
    apiVersion: 'v3',
    http: new HttpTransport({ origin: 'http://pc.local:8080' }),
    auth,
    createSocket: (url: string) => {
      urls.push(url);
      queueMicrotask(() => socket.onopen?.({}));
      return socket;
    },
    logger: createLogger('websocket', { sink, minLevel: 'debug' }),
  });
  return { client, urls, sink, socket };
}

describe('XPlaneClient WebSocket authentication', () => {
  it('builds the plain URL when no token is available', async () => {
    const { client, urls } = clientWith(() => null);
    await client.connectWebSocket();
    expect(urls).toEqual(['ws://pc.local:8080/api/v3']);
    client.disconnectWebSocket();
  });

  it('appends an URL-encoded token query read at connect time', async () => {
    let token: string | null = null;
    const { client, urls, socket } = clientWith(() => token);
    token = 'a+b/c';
    await client.connectWebSocket();
    expect(urls).toEqual(['ws://pc.local:8080/api/v3?token=a%2Bb%2Fc']);
    socket.close();
  });

  it('never writes the token into the log', async () => {
    const { client, sink, socket } = clientWith(() => 'super-secret');
    await client.connectWebSocket();
    socket.close();
    const logged = JSON.stringify(sink.entries);
    expect(logged).not.toContain('super-secret');
    expect(logged).not.toContain('token=');
    expect(logged).toContain('ws://pc.local:8080/api/v3');
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npx jest --selectProjects node tests/unit/infrastructure/xplane-client-auth.test.ts`
Expected: FAIL — `auth` is not a known `XPlaneClientOptions` property and the URL has no `?token=`.

- [ ] **Step 12: Implement the WebSocket transport and client changes**

In `src/infrastructure/xplane/websocket/websocket-transport.ts`, import the helper:

```ts
import { urlWithoutQuery } from '@/infrastructure/xplane/auth';
```

add a field next to `private readonly now` and set it in the constructor:

```ts
  /** The URL without its query string: the query carries the connector token. */
  private readonly safeUrl: string;
```
```ts
    this.safeUrl = urlWithoutQuery(options.url);
```

Then replace every remaining `this.options.url` with `this.safeUrl` **except** the one passed to `this.createSocket(this.options.url)` in `connect()`. The occurrences to change are the `connect timeout` warn, the `TIMEOUT` error message, the `connected` info, the `socket error` warn, the `WEBSOCKET_ERROR` message in `onerror`, the `closed before opening` message in `onclose`, the `Could not open WebSocket to …` message in the `createSocket` catch, and the `closing` info in `close()`.

In `src/infrastructure/xplane/xplane-client.ts`, import:

```ts
import { type AuthProvider, appendTokenQuery, noAuth } from '@/infrastructure/xplane/auth';
```

extend the options:

```ts
export interface XPlaneClientOptions {
  config: XPlaneConnectionConfig;
  apiVersion: ApiVersion;
  http: HttpTransport;
  createSocket?: WebSocketFactory;
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
  logger?: Logger;
  /** Supplies the connector bearer token for the WebSocket upgrade, read at connect time. */
  auth?: AuthProvider;
}
```

and in `connectWebSocket()`, replace the `url:` line of the `new WebSocketTransport({ ... })` call:

```ts
    const baseUrl = webSocketUrl(this.options.config, this.apiVersion);
    const token = (this.options.auth ?? noAuth)();
    const socket = new WebSocketTransport({
      url: token === null ? baseUrl : appendTokenQuery(baseUrl, token),
      createSocket: this.options.createSocket,
      connectTimeoutMs: this.options.connectTimeoutMs,
      requestTimeoutMs: this.options.requestTimeoutMs,
      logger: this.logger,
    });
```

- [ ] **Step 13: Run the transport tests and verify they pass**

Run: `npx jest --selectProjects node tests/unit/infrastructure/ tests/integration/websocket-transport.test.ts tests/integration/xplane-client.test.ts`
Expected: PASS — the new auth suites are green and the existing transport suites are unchanged (they pass no `auth`, so `noAuth` applies).

- [ ] **Step 14: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/infrastructure/xplane tests/unit/infrastructure
git commit -m "feat(transport): send the connector bearer token on HTTP and WebSocket without logging it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `ConnectorClient` and its schemas

**Files:**
- Create: `src/infrastructure/connector/schemas.ts`, `src/infrastructure/connector/connector-client.ts`
- Test: `tests/unit/infrastructure/connector-client.test.ts`

**Interfaces:**
- Consumes (Task 1): `ConnectorInfo` from `@/domain/connector/connector-info`; `AvionixError.httpStatus`.
  Consumes (Task 2): `HttpTransport` with `auth`; `'PAIRING_FAILED' | 'PAIRING_RATE_LIMITED' | 'UNAUTHORIZED'` from the error mapping.
- Produces:
  - `const connectorInfoSchema` and `const pairResponseSchema` from `@/infrastructure/connector/schemas`
  - `const CONNECTOR_INFO_PATH = '/avionix/info'`, `const CONNECTOR_PAIR_PATH = '/avionix/pair'`
  - `class ConnectorClient { constructor(options: { http: HttpTransport; logger?: Logger }); getInfo(): Promise<ConnectorInfo | null>; pair(code: string): Promise<string> }`

- [ ] **Step 1: Write the failing test**

`tests/unit/infrastructure/connector-client.test.ts`:

```ts
import { isAvionixError } from '@/domain/errors/avionix-error';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { createMemorySink, createLogger, silentLogger } from '@/infrastructure/logging/logger';
import { type FetchLike, HttpTransport } from '@/infrastructure/xplane/http/http-transport';

const INFO_BODY = JSON.stringify({
  name: 'Sim PC',
  version: '0.1.0',
  pairingRequired: true,
  xplane: { host: '127.0.0.1', port: 8086, reachable: true },
});

function clientFor(
  responder: (url: string, body: string | undefined) => { status: number; body: string },
  logger = silentLogger,
): { client: ConnectorClient; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    urls.push(url);
    const { status, body } = responder(url, init.body);
    return { status, ok: status >= 200 && status < 300, text: async () => body };
  };
  const http = new HttpTransport({ origin: 'http://pc.local:8080', fetchImpl, logger: silentLogger });
  return { client: new ConnectorClient({ http, logger }), urls };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return isAvionixError(error) ? error.code : `not avionix: ${String(error)}`;
  }
}

describe('ConnectorClient.getInfo', () => {
  it('parses a connector info payload', async () => {
    const { client, urls } = clientFor(() => ({ status: 200, body: INFO_BODY }));
    await expect(client.getInfo()).resolves.toEqual({
      name: 'Sim PC',
      version: '0.1.0',
      pairingRequired: true,
      xplane: { host: '127.0.0.1', port: 8086, reachable: true },
    });
    expect(urls).toEqual(['http://pc.local:8080/avionix/info']);
  });

  it('returns null when the target answers 404 (plain X-Plane)', async () => {
    const { client } = clientFor(() => ({ status: 404, body: 'Not Found' }));
    await expect(client.getInfo()).resolves.toBeNull();
  });

  it('returns null for an HTML body', async () => {
    const { client } = clientFor(() => ({ status: 200, body: '<!doctype html><title>x</title>' }));
    await expect(client.getInfo()).resolves.toBeNull();
  });

  it('returns null for JSON of the wrong shape', async () => {
    const { client } = clientFor(() => ({ status: 200, body: '{"api":{"versions":["v3"]}}' }));
    await expect(client.getInfo()).resolves.toBeNull();
  });

  it('propagates a network error so an unreachable host still fails the connect', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Network request failed');
    };
    const http = new HttpTransport({ origin: 'http://pc.local:8080', fetchImpl, logger: silentLogger });
    await expect(codeOf(new ConnectorClient({ http }).getInfo())).resolves.toBe('NETWORK_ERROR');
  });

  it('propagates a 403 as INCOMING_TRAFFIC_DISABLED', async () => {
    const { client } = clientFor(() => ({ status: 403, body: '' }));
    await expect(codeOf(client.getInfo())).resolves.toBe('INCOMING_TRAFFIC_DISABLED');
  });
});

describe('ConnectorClient.pair', () => {
  it('posts the code and returns the token', async () => {
    const bodies: (string | undefined)[] = [];
    const { client, urls } = clientFor((_url, body) => {
      bodies.push(body);
      return { status: 200, body: '{"token":"tok-abc"}' };
    });
    await expect(client.pair('123456')).resolves.toBe('tok-abc');
    expect(urls).toEqual(['http://pc.local:8080/avionix/pair']);
    expect(bodies).toEqual(['{"code":"123456"}']);
  });

  it('rejects an empty token with INVALID_RESPONSE', async () => {
    const { client } = clientFor(() => ({ status: 200, body: '{"token":""}' }));
    await expect(codeOf(client.pair('123456'))).resolves.toBe('INVALID_RESPONSE');
  });

  it.each([
    [401, 'pairing_invalid_code', 'PAIRING_FAILED'],
    [429, 'pairing_rate_limited', 'PAIRING_RATE_LIMITED'],
    [429, 'too_many_attempts', 'PAIRING_RATE_LIMITED'],
    [400, 'invalid_body', 'SIMULATOR_ERROR'],
  ])('maps %s %s to %s', async (status, errorCode, expected) => {
    const { client } = clientFor(() => ({
      status,
      body: JSON.stringify({ error_code: errorCode, error_message: 'nope' }),
    }));
    await expect(codeOf(client.pair('000000'))).resolves.toBe(expected);
  });

  it('never logs the token', async () => {
    const sink = createMemorySink();
    const { client } = clientFor(
      () => ({ status: 200, body: '{"token":"super-secret"}' }),
      createLogger('connection', { sink, minLevel: 'debug' }),
    );
    await client.pair('123456');
    expect(JSON.stringify(sink.entries)).not.toContain('super-secret');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --selectProjects node tests/unit/infrastructure/connector-client.test.ts`
Expected: FAIL — `Cannot find module '@/infrastructure/connector/connector-client'`.

- [ ] **Step 3: Create `src/infrastructure/connector/schemas.ts`**

```ts
import { z } from 'zod';

/** `GET /avionix/info` — see docs/connector.md. */
export const connectorInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  pairingRequired: z.boolean(),
  xplane: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    reachable: z.boolean(),
  }),
});

/** `POST /avionix/pair` success body. */
export const pairResponseSchema = z.object({ token: z.string().min(1) });
```

- [ ] **Step 4: Create `src/infrastructure/connector/connector-client.ts`**

```ts
import type { ConnectorInfo } from '@/domain/connector/connector-info';
import { isAvionixError } from '@/domain/errors/avionix-error';
import { connectorInfoSchema, pairResponseSchema } from '@/infrastructure/connector/schemas';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import type { HttpTransport } from '@/infrastructure/xplane/http/http-transport';

export const CONNECTOR_INFO_PATH = '/avionix/info';
export const CONNECTOR_PAIR_PATH = '/avionix/pair';

export interface ConnectorClientOptions {
  http: HttpTransport;
  logger?: Logger;
}

/**
 * Speaks the public part of the Avionix Connector protocol. Everything else (the relayed
 * X-Plane API) goes through `HttpTransport` and `XPlaneClient` as before.
 */
export class ConnectorClient {
  private readonly http: HttpTransport;
  private readonly logger: Logger;

  constructor(options: ConnectorClientOptions) {
    this.http = options.http;
    this.logger = options.logger ?? silentLogger;
  }

  /**
   * Returns null when the target is not an Avionix Connector: a 404 (X-Plane itself, which
   * has no /avionix route) or a body that is not connector info (an HTML page, another
   * server's JSON). Every other failure propagates so an unreachable host still fails the
   * connect with NETWORK_ERROR and a blocked one still reports INCOMING_TRAFFIC_DISABLED.
   */
  async getInfo(): Promise<ConnectorInfo | null> {
    try {
      const info = await this.http.request({
        method: 'GET',
        path: CONNECTOR_INFO_PATH,
        schema: connectorInfoSchema,
      });
      this.logger.info('connector detected', {
        name: info.name,
        version: info.version,
        pairingRequired: info.pairingRequired,
      });
      return info;
    } catch (error) {
      if (!isAvionixError(error)) {
        throw error;
      }
      if (error.code === 'INVALID_RESPONSE' || error.httpStatus === 404) {
        this.logger.debug('no Avionix Connector here, treating the target as X-Plane');
        return null;
      }
      throw error;
    }
  }

  /**
   * Exchanges the six-digit code for a bearer token. Rejects with PAIRING_FAILED,
   * PAIRING_RATE_LIMITED or another AvionixError; the token is returned, never logged.
   */
  async pair(code: string): Promise<string> {
    const response = await this.http.request({
      method: 'POST',
      path: CONNECTOR_PAIR_PATH,
      body: { code },
      schema: pairResponseSchema,
    });
    this.logger.info('paired with the connector');
    return response.token;
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx jest --selectProjects node tests/unit/infrastructure/connector-client.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/infrastructure/connector tests/unit/infrastructure/connector-client.test.ts
git commit -m "feat(connector): add ConnectorClient for /avionix/info and /avionix/pair

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `PairingTokenStore`

**Files:**
- Create: `src/application/pairing-token-store.ts`
- Test: `tests/unit/application/pairing-token-store.test.ts`

**Interfaces:**
- Consumes: `SettingsStorage` (`getItem(key): Promise<string | null>`, `setItem(key, value): Promise<void>`) and `createMemorySettingsStorage()` from `@/application/settings-store`.
- Produces:
  - `interface PairingTokenStore { get(host: string, port: number): Promise<string | null>; set(host: string, port: number, token: string): Promise<void>; clear(host: string, port: number): Promise<void> }`
  - `createPairingTokenStore(storage: SettingsStorage): PairingTokenStore`
  - `pairingTokenKey(host: string, port: number): string` → `avionix.pairing.<lowercased host>:<port>`

- [ ] **Step 1: Write the failing test**

`tests/unit/application/pairing-token-store.test.ts`:

```ts
import { createPairingTokenStore, pairingTokenKey } from '@/application/pairing-token-store';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';

describe('pairingTokenKey', () => {
  it('namespaces by host and port and lowercases the host', () => {
    expect(pairingTokenKey('PC.local', 8080)).toBe('avionix.pairing.pc.local:8080');
    expect(pairingTokenKey('pc.local', 8080)).toBe(pairingTokenKey('PC.LOCAL', 8080));
    expect(pairingTokenKey('pc.local', 8081)).not.toBe(pairingTokenKey('pc.local', 8080));
  });
});

describe('createPairingTokenStore', () => {
  it('round-trips a token per connector', async () => {
    const store = createPairingTokenStore(createMemorySettingsStorage());
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
    await store.set('pc.local', 8080, 'tok-a');
    await store.set('other.local', 8080, 'tok-b');
    await expect(store.get('pc.local', 8080)).resolves.toBe('tok-a');
    await expect(store.get('PC.LOCAL', 8080)).resolves.toBe('tok-a');
    await expect(store.get('other.local', 8080)).resolves.toBe('tok-b');
    await expect(store.get('pc.local', 8081)).resolves.toBeNull();
  });

  it('clear makes get return null again', async () => {
    const store = createPairingTokenStore(createMemorySettingsStorage());
    await store.set('pc.local', 8080, 'tok-a');
    await store.clear('pc.local', 8080);
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
  });

  it('treats a garbage or empty stored value as null', async () => {
    const storage = createMemorySettingsStorage();
    const store = createPairingTokenStore(storage);
    await storage.setItem(pairingTokenKey('pc.local', 8080), 'not json');
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
    await storage.setItem(pairingTokenKey('pc.local', 8080), '{"token":42}');
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
    await storage.setItem(pairingTokenKey('pc.local', 8080), '{"token":"   "}');
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
  });

  it('never throws when the storage fails', async () => {
    const broken: SettingsStorage = {
      getItem: async () => {
        throw new Error('storage unavailable');
      },
      setItem: async () => {
        throw new Error('storage unavailable');
      },
    };
    const store = createPairingTokenStore(broken);
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
    await expect(store.set('pc.local', 8080, 'tok')).resolves.toBeUndefined();
    await expect(store.clear('pc.local', 8080)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --selectProjects node tests/unit/application/pairing-token-store.test.ts`
Expected: FAIL — `Cannot find module '@/application/pairing-token-store'`.

- [ ] **Step 3: Create `src/application/pairing-token-store.ts`**

```ts
import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';

export interface PairingTokenStore {
  get(host: string, port: number): Promise<string | null>;
  set(host: string, port: number, token: string): Promise<void>;
  clear(host: string, port: number): Promise<void>;
}

/** One key per connector. The host is lowercased so `PC` and `pc` share a token. */
export function pairingTokenKey(host: string, port: number): string {
  return `avionix.pairing.${host.trim().toLowerCase()}:${port}`;
}

// Stored as JSON so a value written by something else reads back as "no token" instead of
// being handed to the connector as a bearer token.
const storedTokenSchema = z.object({ token: z.string() });

export function createPairingTokenStore(storage: SettingsStorage): PairingTokenStore {
  return {
    async get(host, port) {
      try {
        const raw = await storage.getItem(pairingTokenKey(host, port));
        if (raw === null) {
          return null;
        }
        const parsed = storedTokenSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          return null;
        }
        const token = parsed.data.token.trim();
        return token.length === 0 ? null : token;
      } catch {
        // Missing, unreadable or malformed: the app asks for a code again.
        return null;
      }
    },
    async set(host, port, token) {
      try {
        await storage.setItem(pairingTokenKey(host, port), JSON.stringify({ token }));
      } catch {
        // Persistence is best effort; the in-memory token still works for this run.
      }
    },
    async clear(host, port) {
      try {
        // The SettingsStorage port has no remove, so an empty token stands for "none".
        await storage.setItem(pairingTokenKey(host, port), JSON.stringify({ token: '' }));
      } catch {
        // Best effort, as above.
      }
    },
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx jest --selectProjects node tests/unit/application/pairing-token-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/application/pairing-token-store.ts tests/unit/application/pairing-token-store.test.ts
git commit -m "feat(app): persist one connector token per host and port

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Connector mode in the mock X-Plane server

**Files:**
- Modify: `tests/mock-xplane/mock-xplane-server.ts` (options, HTTP routing at `:196-236`, upgrade at `:392-410`)
- Test: `tests/integration/mock-xplane-server.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (the mock is plain Node + `ws`).
- Produces, for Tasks 6 and 8:
  - `interface MockConnectorOptions { name: string; pairingRequired: boolean; code: string; rejectAllTokens?: boolean }`
  - `MockXPlaneOptions.connector?: MockConnectorOptions`
  - `MockXPlaneServer.issuedTokens: string[]` (tokens are `mock-token-1`, `mock-token-2`, …)
  - `MockXPlaneServer.setRejectAllTokens(value: boolean): void`
  - With `connector` set, the server answers `GET /avionix/info`, `POST /avionix/pair`, and returns `401 unauthorized` for `/api/*` and refuses the WebSocket upgrade with `HTTP/1.1 401 Unauthorized` unless a valid token is presented.

- [ ] **Step 1: Write the failing test**

Append to `describe('MockXPlaneServer', ...)` in `tests/integration/mock-xplane-server.test.ts` (the file already has `server`/`afterEach` handling; these cases start their own server and stop it in a `finally` so they do not disturb the shared fixture):

```ts
  it('serves connector info, pairs with the code and guards /api and the upgrade', async () => {
    const connectorServer = await MockXPlaneServer.start({
      connector: { name: 'Sim PC', pairingRequired: true, code: '123456' },
    });
    const base = `http://${connectorServer.host}:${connectorServer.port}`;
    try {
      const info = await fetch(`${base}/avionix/info`);
      expect(info.status).toBe(200);
      expect(await info.json()).toEqual({
        name: 'Sim PC',
        version: '1.0.0-mock',
        pairingRequired: true,
        xplane: { host: connectorServer.host, port: connectorServer.port, reachable: true },
      });

      expect((await fetch(`${base}/api/capabilities`)).status).toBe(401);

      const wrong = await fetch(`${base}/avionix/pair`, {
        method: 'POST',
        body: JSON.stringify({ code: '000000' }),
      });
      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toMatchObject({ error_code: 'pairing_invalid_code' });

      const paired = await fetch(`${base}/avionix/pair`, {
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
      });
      expect(paired.status).toBe(200);
      const body: unknown = await paired.json();
      const token = isRecord(body) && typeof body.token === 'string' ? body.token : '';
      expect(token).toBe('mock-token-1');
      expect(connectorServer.issuedTokens).toEqual(['mock-token-1']);

      const allowed = await fetch(`${base}/api/capabilities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(allowed.status).toBe(200);

      connectorServer.setRejectAllTokens(true);
      const revoked = await fetch(`${base}/api/capabilities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(revoked.status).toBe(401);
      expect(await revoked.json()).toMatchObject({ error_code: 'unauthorized' });
    } finally {
      await connectorServer.stop();
    }
  });

  it('refuses a WebSocket upgrade without a token and accepts one with it', async () => {
    const connectorServer = await MockXPlaneServer.start({
      connector: { name: 'Sim PC', pairingRequired: true, code: '123456' },
    });
    const base = `http://${connectorServer.host}:${connectorServer.port}`;
    try {
      const paired = await fetch(`${base}/avionix/pair`, {
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
      });
      const body: unknown = await paired.json();
      const token = isRecord(body) && typeof body.token === 'string' ? body.token : '';

      const denied = new WebSocket(`ws://${connectorServer.host}:${connectorServer.port}/api/v3`);
      await new Promise<void>((resolve) => {
        denied.addEventListener('close', () => resolve());
        denied.addEventListener('error', () => resolve());
      });
      expect(connectorServer.connectionCount).toBe(0);

      const opened = new WebSocket(
        `ws://${connectorServer.host}:${connectorServer.port}/api/v3?token=${token}`,
      );
      await new Promise<void>((resolve, reject) => {
        opened.addEventListener('open', () => resolve());
        opened.addEventListener('error', () => reject(new Error('upgrade was refused')));
      });
      expect(connectorServer.connectionCount).toBe(1);
      opened.close();
    } finally {
      await connectorServer.stop();
    }
  });

  it('answers /avionix/info with 404 when no connector option is given', async () => {
    const plain = await MockXPlaneServer.start();
    try {
      expect((await fetch(`http://${plain.host}:${plain.port}/avionix/info`)).status).toBe(404);
    } finally {
      await plain.stop();
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --selectProjects node tests/integration/mock-xplane-server.test.ts`
Expected: FAIL — `connector` is not a known `MockXPlaneOptions` property and `/avionix/info` answers 404.

- [ ] **Step 3: Implement the connector mode**

In `tests/mock-xplane/mock-xplane-server.ts`, add the options type after `MockCommand`:

```ts
export interface MockConnectorOptions {
  name: string;
  pairingRequired: boolean;
  code: string;
  rejectAllTokens?: boolean;
}
```

add `connector?: MockConnectorOptions;` to `MockXPlaneOptions`, then in the class add the public surface next to `incomingTrafficDisabled`:

```ts
  /** Tokens handed out by `/avionix/pair`, in issue order. */
  readonly issuedTokens: string[] = [];
```

private fields next to `capabilitiesMode`:

```ts
  private readonly connector: MockConnectorOptions | undefined;
  private rejectAllTokens: boolean;
```

in the constructor, after `this.capabilitiesMode = ...`:

```ts
    this.connector = options.connector;
    this.rejectAllTokens = options.connector?.rejectAllTokens ?? false;
```

a public switch next to `setDataRefValue`:

```ts
  /** Simulates a connector that has forgotten every paired device (token file deleted). */
  setRejectAllTokens(value: boolean): void {
    this.rejectAllTokens = value;
  }
```

two private helpers before `handleHttp`:

```ts
  private bearerToken(req: http.IncomingMessage): string | null {
    const header = req.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value !== 'string') {
      return null;
    }
    const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
    return match?.[1] ?? null;
  }

  private tokenAccepted(token: string | null): boolean {
    if (this.connector === undefined || !this.connector.pairingRequired) {
      return true;
    }
    if (this.rejectAllTokens) {
      return false;
    }
    return token !== null && this.issuedTokens.includes(token);
  }
```

and the routing, in `handleHttp` immediately after the `incomingTrafficDisabled` block and before the `try {`:

```ts
    const connector = this.connector;
    if (connector !== undefined) {
      if (url.pathname === '/avionix/info') {
        if (method !== 'GET') {
          res.writeHead(405).end();
          return;
        }
        this.json(res, 200, {
          name: connector.name,
          version: '1.0.0-mock',
          pairingRequired: connector.pairingRequired,
          xplane: { host: this.host, port: this.port, reachable: true },
        });
        return;
      }
      if (url.pathname === '/avionix/pair') {
        if (method !== 'POST') {
          res.writeHead(405).end();
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(await readBody(req));
        } catch {
          this.json(res, 400, {
            error_code: 'invalid_body',
            error_message: 'Body must be JSON.',
          });
          return;
        }
        if (!isRecord(parsed) || typeof parsed.code !== 'string') {
          this.json(res, 400, {
            error_code: 'invalid_body',
            error_message: 'Body must include a code string.',
          });
          return;
        }
        if (parsed.code !== connector.code) {
          this.json(res, 401, {
            error_code: 'pairing_invalid_code',
            error_message: 'Wrong pairing code',
          });
          return;
        }
        const token = `mock-token-${this.issuedTokens.length + 1}`;
        this.issuedTokens.push(token);
        this.json(res, 200, { token });
        return;
      }
      if (url.pathname.startsWith('/api') && !this.tokenAccepted(this.bearerToken(req))) {
        this.json(res, 401, {
          error_code: 'unauthorized',
          error_message: 'Pair this device with the Avionix Connector first.',
        });
        return;
      }
    }
```

In `handleUpgrade`, right after `const url = new URL(req.url ?? '/', 'http://localhost');`:

```ts
    if (this.connector !== undefined && !this.tokenAccepted(url.searchParams.get('token'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
```

(The existing `/^\/api\/(v\d)$/` check runs on `url.pathname`, so a `?token=` query does not disturb it.)

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx jest --selectProjects node tests/integration/mock-xplane-server.test.ts`
Expected: PASS, including the three new cases.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add tests/mock-xplane/mock-xplane-server.ts tests/integration/mock-xplane-server.test.ts
git commit -m "test(mock): add a connector mode with info, pairing and token checks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Session — connector step, `pairing` state, `pair()`, `UNAUTHORIZED`, default port, wiring

**Files:**
- Modify: `src/domain/connection/connection-config.ts:8`
- Modify: `src/application/session-snapshot.ts:9-16,30-40,42-69`
- Modify: `src/application/simulator-session.ts` (deps at `:47-59`, `connect` at `:93-113`, `disconnect` at `:115-126`, `markFailure` at `:237-244`, `runConnectFlow` at `:252-429`, `scheduleReconnect` at `:503-524`)
- Modify: `src/app/composition-root.ts`, `src/app/services-context.tsx:6-9`, `src/hooks/useSimulatorSession.ts`
- Test: `tests/unit/application/simulator-session.test.ts` (fixture + new cases), `tests/integration/simulator-session.test.ts` (fixture), `tests/unit/domain/connection-config.test.ts:73`, `tests/unit/application/settings-store.test.ts:12`
- Create: `tests/integration/simulator-session-pairing.test.ts`

**Interfaces:**
- Consumes: Task 1 (`transition` with `pairingRequired`/`pair`, `ConnectorInfo`), Task 2 (`AuthProvider`), Task 3 (`ConnectorClient`), Task 4 (`PairingTokenStore`, `createPairingTokenStore`), Task 5 (mock connector mode).
- Produces:
  - `DEFAULT_PORT = 8080`
  - `type ConnectorStep = 'idle' | 'pending' | 'direct' | 'pairing' | 'paired'` and `SessionDiagnostics.connector: ConnectorStep` from `@/application/session-snapshot`
  - `SessionSnapshot.connector: ConnectorInfo | null`
  - `SimulatorSessionDeps` gains `createHttpTransport(config: XPlaneConnectionConfig, auth: AuthProvider): HttpTransport`, `createClient(config: XPlaneConnectionConfig, apiVersion: ApiVersion, http: HttpTransport, auth: AuthProvider): SimulatorClient`, `createConnectorClient(http: HttpTransport): ConnectorClient` (required), `tokenStore: PairingTokenStore` (required)
  - `SimulatorSession.pair(code: string): Promise<void>`
  - `SessionApi` gains `'pair'`; `useSimulatorSession()` returns `{ snapshot, connect, disconnect, pair, writeHeading, activateHeadingUp }` with `pair: (code: string) => Promise<void>`

- [ ] **Step 1: Update the default port and its two assertions**

`src/domain/connection/connection-config.ts:8`:

```ts
export const DEFAULT_PORT = 8080;
```

`tests/unit/domain/connection-config.test.ts:73`:

```ts
    expect(DEFAULT_PORT).toBe(8080);
```

`tests/unit/application/settings-store.test.ts:12`:

```ts
    expect(DEFAULT_CONNECTION_SETTINGS).toEqual({ host: '', port: 8080 });
```

The validation range (`1..65535`) and `platformDefaultConnection()` are unchanged; a stored `8086` still loads as `8086`.

- [ ] **Step 2: Extend the snapshot types**

In `src/application/session-snapshot.ts`, add the import and the new members:

```ts
import type { ConnectorInfo } from '@/domain/connector/connector-info';
```

```ts
export type StepStatus = 'idle' | 'pending' | 'ok' | 'failed';

/**
 * What the connector probe found. It is not a StepStatus because the outcomes are verdicts
 * ("this is plain X-Plane", "this connector trusts us") rather than pass/fail.
 */
export type ConnectorStep = 'idle' | 'pending' | 'direct' | 'pairing' | 'paired';

export interface SessionDiagnostics {
  connector: ConnectorStep;
  http: StepStatus;
  capabilities: StepStatus;
  websocket: StepStatus;
  dataRefs: Record<string, StepStatus>;
  command: StepStatus;
  subscription: StepStatus;
}
```

add `connector: ConnectorInfo | null;` to `SessionSnapshot` right after `config`, and set the defaults:

```ts
  return {
    connector: 'idle',
    http: 'idle',
    capabilities: 'idle',
    websocket: 'idle',
    dataRefs,
    command: 'idle',
    subscription: 'idle',
  };
```

```ts
  return {
    state: 'disconnected',
    config: null,
    connector: null,
    capabilities: null,
    apiVersion: null,
    diagnostics: initialDiagnostics(dataRefNames),
    telemetry: {},
    lastOperation: null,
    error: null,
    reconnectAttempt: 0,
  };
```

- [ ] **Step 3: Write the failing session unit tests**

In `tests/unit/application/simulator-session.test.ts`, extend the fixture. Add the imports:

```ts
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
```

and rewrite `setup()` so the fake fetch can answer `/avionix/info` and `/avionix/pair` per test:

```ts
interface Route {
  status: number;
  body: string;
}

function setup(
  options: {
    capsError?: AvionixError;
    clients?: FakeClient[];
    routes?: Record<string, Route | Route[]>;
  } = {},
) {
  const clients = options.clients ?? [new FakeClient()];
  let clientIndex = 0;
  const scheduler = new ManualScheduler();
  const capsError = options.capsError;
  const routes = options.routes ?? {};
  const requestedPaths: string[] = [];
  const storage = createMemorySettingsStorage();
  const tokenStore = createPairingTokenStore(storage);
  const sentTokens: (string | undefined)[] = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
    const path = url.slice(url.indexOf('/', 'http://'.length));
    requestedPaths.push(path);
    sentTokens.push(init.headers.Authorization);
    const route = routes[path];
    const next = Array.isArray(route) ? route.shift() : route;
    if (next !== undefined) {
      return {
        status: next.status,
        ok: next.status >= 200 && next.status < 300,
        text: async () => next.body,
      };
    }
    if (path === '/avionix/info') {
      // No connector: the probe must fall through to the plain X-Plane flow.
      return { status: 404, ok: false, text: async () => 'Not Found' };
    }
    if (capsError !== undefined) {
      throw capsError;
    }
    return {
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          api: { versions: caps.rawApiVersions },
          'x-plane': { version: caps.simulatorVersion },
        }),
    };
  };
  const session = new SimulatorSession({
    createHttpTransport: (config: XPlaneConnectionConfig, auth) =>
      new HttpTransport({
        origin: `http://${config.host}:${config.port}`,
        fetchImpl,
        auth,
        logger: silentLogger,
      }),
    createClient: () => {
      const client = clients[Math.min(clientIndex, clients.length - 1)];
      clientIndex += 1;
      if (client === undefined) {
        throw new Error('no fake client');
      }
      return client;
    },
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore,
    scheduler,
    random: () => 0.5,
    logger: silentLogger,
    now: () => 1234,
  });
  return {
    session,
    scheduler,
    clients,
    storage,
    tokenStore,
    requestedPaths,
    sentTokens,
    snapshot: () => session.store.getSnapshot(),
  };
}
```

Then add a new describe block at the end of the file:

```ts
const CONNECTOR_INFO = JSON.stringify({
  name: 'Sim PC',
  version: '0.1.0',
  pairingRequired: true,
  xplane: { host: '127.0.0.1', port: 8086, reachable: true },
});

const OPEN_CONNECTOR_INFO = JSON.stringify({
  name: 'Sim PC',
  version: '0.1.0',
  pairingRequired: false,
  xplane: { host: '127.0.0.1', port: 8086, reachable: true },
});

describe('SimulatorSession pairing', () => {
  it('stops in pairing when a connector needs a code and no token is stored', async () => {
    const { session, snapshot } = setup({
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error).toBeNull();
    expect(snapshot().connector).toEqual({
      name: 'Sim PC',
      version: '0.1.0',
      pairingRequired: true,
      xplane: { host: '127.0.0.1', port: 8086, reachable: true },
    });
    expect(snapshot().diagnostics.connector).toBe('pairing');
    expect(snapshot().diagnostics.capabilities).toBe('idle');
  });

  it('pair stores the token, resumes the connect flow and sends the bearer header', async () => {
    const { session, snapshot, tokenStore, sentTokens } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/avionix/pair': { status: 200, body: '{"token":"tok-xyz"}' },
      },
    });
    await session.connect('192.168.1.100', 8080);
    await session.pair('123456');
    expect(snapshot().state).toBe('connected');
    expect(snapshot().diagnostics.connector).toBe('paired');
    expect(snapshot().error).toBeNull();
    await expect(tokenStore.get('192.168.1.100', 8080)).resolves.toBe('tok-xyz');
    expect(sentTokens).toContain('Bearer tok-xyz');
  });

  it('a wrong code keeps the session in pairing and reports PAIRING_FAILED', async () => {
    const { session, snapshot } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/avionix/pair': [
          {
            status: 401,
            body: '{"error_code":"pairing_invalid_code","error_message":"Wrong pairing code"}',
          },
          { status: 200, body: '{"token":"tok-ok"}' },
        ],
      },
    });
    await session.connect('192.168.1.100', 8080);
    await session.pair('000000');
    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error?.code).toBe('PAIRING_FAILED');
    await session.pair('123456');
    expect(snapshot().state).toBe('connected');
    expect(snapshot().error).toBeNull();
  });

  it('rejects pair outside the pairing state with INTERNAL', async () => {
    const { session } = setup();
    await expect(session.pair('123456')).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('rejects a concurrent pair call with INTERNAL', async () => {
    const { session } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/avionix/pair': { status: 200, body: '{"token":"tok-xyz"}' },
      },
    });
    await session.connect('192.168.1.100', 8080);
    const first = session.pair('123456');
    await expect(session.pair('123456')).rejects.toMatchObject({ code: 'INTERNAL' });
    await first;
  });

  it('skips pairing when the stored token is reused', async () => {
    const { session, snapshot, tokenStore, requestedPaths } = setup({
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });
    await tokenStore.set('192.168.1.100', 8080, 'tok-stored');
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('connected');
    expect(snapshot().diagnostics.connector).toBe('paired');
    expect(requestedPaths).not.toContain('/avionix/pair');
  });

  it('connects straight through a connector that does not require pairing', async () => {
    const { session, snapshot } = setup({
      routes: { '/avionix/info': { status: 200, body: OPEN_CONNECTOR_INFO } },
    });
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('connected');
    expect(snapshot().diagnostics.connector).toBe('paired');
    expect(snapshot().connector?.pairingRequired).toBe(false);
  });

  it('marks the connector step direct when the target is plain X-Plane', async () => {
    const { session, snapshot } = setup();
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('connected');
    expect(snapshot().diagnostics.connector).toBe('direct');
    expect(snapshot().connector).toBeNull();
  });

  it('clears the token and returns to pairing when the connector rejects it', async () => {
    const { session, snapshot, tokenStore } = setup({
      routes: {
        '/avionix/info': { status: 200, body: CONNECTOR_INFO },
        '/api/capabilities': {
          status: 401,
          body: '{"error_code":"unauthorized","error_message":"Pair again"}',
        },
      },
    });
    await tokenStore.set('192.168.1.100', 8080, 'tok-stale');
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    expect(snapshot().error?.code).toBe('UNAUTHORIZED');
    expect(snapshot().connector?.name).toBe('Sim PC');
    await expect(tokenStore.get('192.168.1.100', 8080)).resolves.toBeNull();
  });

  it('disconnect from pairing returns to disconnected and clears the connector', async () => {
    const { session, snapshot, tokenStore } = setup({
      routes: { '/avionix/info': { status: 200, body: CONNECTOR_INFO } },
    });
    await session.connect('192.168.1.100', 8080);
    expect(snapshot().state).toBe('pairing');
    session.disconnect();
    expect(snapshot().state).toBe('disconnected');
    expect(snapshot().connector).toBeNull();
    expect(snapshot().diagnostics.connector).toBe('idle');
    // The stored token (none here) is deliberately kept across a disconnect.
    await expect(tokenStore.get('192.168.1.100', 8080)).resolves.toBeNull();
    await expect(session.pair('123456')).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx jest --selectProjects node tests/unit/application/simulator-session.test.ts`
Expected: FAIL — `createConnectorClient`/`tokenStore` are not valid deps and `session.pair` does not exist.

- [ ] **Step 5: Implement the session**

In `src/application/simulator-session.ts`, add the imports:

```ts
import type { PairingTokenStore } from '@/application/pairing-token-store';
import type { ConnectorInfo } from '@/domain/connector/connector-info';
import type { ConnectorClient } from '@/infrastructure/connector/connector-client';
import type { AuthProvider } from '@/infrastructure/xplane/auth';
```

(`ConnectorStep` is not imported: the diagnostics object already carries the type.)

Replace `SimulatorSessionDeps`:

```ts
export interface SimulatorSessionDeps {
  createHttpTransport: (config: XPlaneConnectionConfig, auth: AuthProvider) => HttpTransport;
  createClient: (
    config: XPlaneConnectionConfig,
    apiVersion: ApiVersion,
    http: HttpTransport,
    auth: AuthProvider,
  ) => SimulatorClient;
  createConnectorClient: (http: HttpTransport) => ConnectorClient;
  tokenStore: PairingTokenStore;
  scheduler?: Scheduler;
  reconnectPolicy?: ReconnectPolicy;
  random?: () => number;
  logger?: Logger;
  now?: () => number;
}
```

Add a type for the suspended flow and three fields to the class (next to `cancelReconnect`):

```ts
/** A connect flow parked in `pairing`, waiting for `pair(code)` to resume it. */
interface PendingPairing {
  generation: number;
  config: XPlaneConnectionConfig;
  http: HttpTransport;
}
```

```ts
  private token: string | null = null;
  private pendingPairing: PendingPairing | null = null;
  private pairInFlight = false;
```

Change `connect` to load the token after the config is validated:

```ts
  async connect(host: string, port: string | number): Promise<void> {
    this.teardown();
    const generation = this.nextGeneration();
    // Any previous state first returns to disconnected, then to connecting; both edges are in the table.
    this.store.setState((prev) => ({
      ...initialSnapshot(MVP_DATAREF_NAMES),
      state: transition(this.settled(prev.state), 'connect'),
    }));
    this.pendingPairing = null;
    this.token = null;
    let config: XPlaneConnectionConfig;
    try {
      config = createConnectionConfig(host, port);
    } catch (error) {
      this.markFailure(
        toAvionixError(error, { code: 'INVALID_HOST', message: 'Invalid connection settings' }),
        'initial',
      );
      return;
    }
    this.store.setState((prev) => ({ ...prev, config }));
    this.token = await this.deps.tokenStore.get(config.host, config.port);
    if (!this.isCurrent(generation)) {
      return;
    }
    await this.runConnectFlow(generation, config, 'initial');
  }
```

Add `pair` right after `disconnect`:

```ts
  /**
   * Exchanges the six-digit code for a token and resumes the connect flow that parked in
   * `pairing`. Rejects with INTERNAL when the session is not pairing or another pair call is
   * already in flight; every other failure lands in `snapshot.error` and leaves the session
   * in `pairing` so the user can try another code.
   */
  async pair(code: string): Promise<void> {
    const pending = this.pendingPairing;
    if (pending === null || this.pairInFlight || this.store.getSnapshot().state !== 'pairing') {
      throw new AvionixError({
        code: 'INTERNAL',
        message: 'pair() is only available while the session is waiting for a pairing code',
      });
    }
    this.pairInFlight = true;
    const { generation, config, http } = pending;
    try {
      const token = await this.deps.createConnectorClient(http).pair(code);
      if (!this.isCurrent(generation)) {
        return;
      }
      this.token = token;
      await this.deps.tokenStore.set(config.host, config.port, token);
      if (!this.isCurrent(generation)) {
        return;
      }
      this.pendingPairing = null;
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'pair'),
        diagnostics: { ...prev.diagnostics, connector: 'paired' },
        error: null,
      }));
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return;
      }
      const avionixError = toAvionixError(error, {
        code: 'UNKNOWN',
        message: 'Pairing failed',
      });
      this.logger.warn('pairing rejected', { code: avionixError.code });
      this.store.setState((prev) => ({ ...prev, error: avionixError }));
      return;
    } finally {
      this.pairInFlight = false;
    }
    await this.runSimulatorFlow(generation, config, http, 'initial');
  }
```

Extend `disconnect` to drop the pairing state:

```ts
  disconnect(): void {
    this.teardown();
    this.nextGeneration();
    this.pendingPairing = null;
    // The stored token is kept: only the connector revokes it.
    this.token = null;
    this.store.setState((prev) => ({
      ...prev,
      state: this.settled(prev.state),
      connector: null,
      diagnostics: initialDiagnostics(MVP_DATAREF_NAMES),
      telemetry: {},
      reconnectAttempt: 0,
      error: null,
    }));
  }
```

Route `UNAUTHORIZED` out of `markFailure` and add the handler next to it:

```ts
  private markFailure(error: AvionixError, mode: FlowMode): void {
    const state = this.store.getSnapshot().state;
    if (error.code === 'UNAUTHORIZED' && (state === 'connecting' || state === 'reconnecting')) {
      this.handleUnauthorized(error);
      return;
    }
    this.logger.warn('session failure', { code: error.code, message: error.message, mode });
    this.store.setState((prev) => ({
      ...prev,
      state: mode === 'initial' ? transition(prev.state, 'failed') : prev.state,
      error,
    }));
  }

  /**
   * The connector no longer accepts the token we hold (it was restarted with its token file
   * deleted, or the token expired). Forget it, stop retrying — a retry would fail the same
   * way — and park in `pairing` so the user can enter a fresh code. `snapshot.connector` is
   * kept so the UI can still name the connector.
   */
  private handleUnauthorized(error: AvionixError): void {
    this.logger.warn('the connector rejected this device, pairing again');
    this.teardown();
    const generation = this.nextGeneration();
    const config = this.store.getSnapshot().config;
    this.token = null;
    this.pendingPairing =
      config === null
        ? null
        : {
            generation,
            config,
            http: this.deps.createHttpTransport(config, () => this.token),
          };
    if (config !== null) {
      void this.deps.tokenStore.clear(config.host, config.port);
    }
    this.store.setState((prev) => ({
      ...prev,
      state: transition(prev.state, 'pairingRequired'),
      diagnostics: { ...prev.diagnostics, connector: 'pairing' },
      reconnectAttempt: 0,
      error,
    }));
  }
```

Split `runConnectFlow` into the connector probe and the existing simulator flow. Replace the head of the method (`src/application/simulator-session.ts:252-258`, down to and including `const http = this.deps.createHttpTransport(config);`) with:

```ts
  private async runConnectFlow(
    generation: number,
    config: XPlaneConnectionConfig,
    mode: FlowMode,
  ): Promise<boolean> {
    const http = this.deps.createHttpTransport(config, () => this.token);
    // Only the initial connect probes: a reconnect reuses the verdict already in the snapshot,
    // and a connector that has forgotten this device surfaces as UNAUTHORIZED instead.
    if (mode === 'initial' && !(await this.runConnectorProbe(generation, config, http))) {
      return false;
    }
    return this.runSimulatorFlow(generation, config, http, mode);
  }

  /**
   * Returns true when the flow may continue. Returns false when the session parked in
   * `pairing` or when the probe itself failed (an unreachable or blocked host).
   */
  private async runConnectorProbe(
    generation: number,
    config: XPlaneConnectionConfig,
    http: HttpTransport,
  ): Promise<boolean> {
    this.setStep((d) => ({ ...d, connector: 'pending' }));
    let info: ConnectorInfo | null;
    try {
      info = await this.deps.createConnectorClient(http).getInfo();
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return false;
      }
      // The probe is the session's first HTTP request, so its failure is the same news as a
      // failed capabilities call: the target could not be reached or refused us.
      this.setStep((d) => ({
        ...d,
        connector: 'idle',
        http: 'failed',
        capabilities: 'failed',
      }));
      this.markFailure(
        toAvionixError(error, { code: 'NETWORK_ERROR', message: 'Connector probe failed' }),
        'initial',
      );
      return false;
    }
    if (!this.isCurrent(generation)) {
      return false;
    }
    if (info === null) {
      // A stale token for a host that is now plain X-Plane is harmless: X-Plane ignores the header.
      this.setStep((d) => ({ ...d, connector: 'direct' }));
      return true;
    }
    const connectorInfo = info;
    this.store.setState((prev) => ({ ...prev, connector: connectorInfo }));
    if (connectorInfo.pairingRequired && this.token === null) {
      this.pendingPairing = { generation, config, http };
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'pairingRequired'),
        diagnostics: { ...prev.diagnostics, connector: 'pairing' },
        error: null,
      }));
      this.logger.info('connector requires pairing', { name: connectorInfo.name });
      return false;
    }
    this.setStep((d) => ({ ...d, connector: 'paired' }));
    return true;
  }
```

Then rename the remainder of the old `runConnectFlow` body into a new method with this signature, changing nothing inside it except the `createClient` call:

```ts
  /**
   * Capabilities → version → WebSocket → resolution → subscription. Returns true on success.
   * In `initial` mode the state becomes `connected` as soon as the socket is open (later steps
   * are visible in diagnostics). In `reconnect` mode it becomes `connected` only when the whole
   * flow has succeeded.
   */
  private async runSimulatorFlow(
    generation: number,
    config: XPlaneConnectionConfig,
    http: HttpTransport,
    mode: FlowMode,
  ): Promise<boolean> {
```

Inside it, the client is created with the auth provider:

```ts
    const client = this.deps.createClient(config, apiVersion, http, () => this.token);
```

Finally, keep the connector verdict when diagnostics are reset for a reconnect attempt, in `scheduleReconnect`:

```ts
      this.store.setState((prev) => ({
        ...prev,
        diagnostics: {
          ...initialDiagnostics(MVP_DATAREF_NAMES),
          connector: prev.connector === null ? 'direct' : 'paired',
        },
        telemetry: {},
      }));
```

- [ ] **Step 6: Update the integration fixture and run the session unit tests**

In `tests/integration/simulator-session.test.ts`, add the imports and the two new deps to `createSession()`:

```ts
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
```

```ts
function createSession(): SimulatorSession {
  return new SimulatorSession({
    createHttpTransport: (config, auth) =>
      new HttpTransport({
        origin: `http://${config.host}:${config.port}`,
        auth,
        logger: silentLogger,
        defaultTimeoutMs: 2000,
      }),
    createClient: (config, apiVersion, http, auth) =>
      new XPlaneClient({
        config,
        apiVersion,
        http,
        auth,
        logger: silentLogger,
        requestTimeoutMs: 2000,
        connectTimeoutMs: 2000,
      }),
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore: createPairingTokenStore(createMemorySettingsStorage()),
    reconnectPolicy: {
      maxAttempts: 3,
      baseDelayMs: 20,
      factor: 2,
      maxDelayMs: 100,
      jitterRatio: 0,
    },
    logger: silentLogger,
  });
}
```

Run: `npx jest --selectProjects node tests/unit/application/simulator-session.test.ts tests/integration/simulator-session.test.ts`
Expected: PASS — the ten new pairing cases and every existing case (the plain mock answers `/avionix/info` with 404, so those sessions report `connector: 'direct'`).

- [ ] **Step 7: Write the failing pairing integration test**

`tests/integration/simulator-session-pairing.test.ts`:

```ts
import { MVP_DATAREFS } from '@/application/mvp-bindings';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

async function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createSession(storage: SettingsStorage): SimulatorSession {
  return new SimulatorSession({
    createHttpTransport: (config, auth) =>
      new HttpTransport({
        origin: `http://${config.host}:${config.port}`,
        auth,
        logger: silentLogger,
        defaultTimeoutMs: 2000,
      }),
    createClient: (config, apiVersion, http, auth) =>
      new XPlaneClient({
        config,
        apiVersion,
        http,
        auth,
        logger: silentLogger,
        requestTimeoutMs: 2000,
        connectTimeoutMs: 2000,
      }),
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore: createPairingTokenStore(storage),
    reconnectPolicy: {
      maxAttempts: 3,
      baseDelayMs: 20,
      factor: 2,
      maxDelayMs: 100,
      jitterRatio: 0,
    },
    logger: silentLogger,
  });
}

describe('SimulatorSession pairing against the mock connector', () => {
  let server: MockXPlaneServer;
  let storage: SettingsStorage;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({
      updateIntervalMs: 10,
      connector: { name: 'Sim PC', pairingRequired: true, code: '123456' },
    });
    storage = createMemorySettingsStorage();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('pairs on the first connect and reconnects without pairing afterwards', async () => {
    const first = createSession(storage);
    await first.connect(server.host, server.port);
    expect(first.store.getSnapshot().state).toBe('pairing');
    expect(first.store.getSnapshot().connector?.name).toBe('Sim PC');

    await first.pair('123456');
    expect(first.store.getSnapshot().state).toBe('connected');
    expect(first.store.getSnapshot().diagnostics.connector).toBe('paired');
    expect(server.issuedTokens).toEqual(['mock-token-1']);
    await until(() => first.store.getSnapshot().telemetry[MVP_DATAREFS.heartbeat] !== undefined);
    first.disconnect();
    await until(() => server.connectionCount === 0);

    const second = createSession(storage);
    await second.connect(server.host, server.port);
    expect(second.store.getSnapshot().state).toBe('connected');
    expect(server.issuedTokens).toEqual(['mock-token-1']);
    second.disconnect();
  });

  it('keeps pairing after a wrong code and connects with the right one', async () => {
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    await session.pair('000000');
    expect(session.store.getSnapshot().state).toBe('pairing');
    expect(session.store.getSnapshot().error?.code).toBe('PAIRING_FAILED');
    await session.pair('123456');
    expect(session.store.getSnapshot().state).toBe('connected');
    expect(session.store.getSnapshot().error).toBeNull();
    session.disconnect();
  });

  it('returns to pairing and forgets the token when the connector rejects it', async () => {
    const tokenStore = createPairingTokenStore(storage);
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    await session.pair('123456');
    expect(session.store.getSnapshot().state).toBe('connected');

    server.setRejectAllTokens(true);
    server.terminateAllSockets();

    await until(() => session.store.getSnapshot().state === 'pairing', 5000);
    expect(session.store.getSnapshot().error?.code).toBe('UNAUTHORIZED');
    expect(session.store.getSnapshot().connector?.name).toBe('Sim PC');
    await expect(tokenStore.get(server.host, server.port)).resolves.toBeNull();

    const attemptsAfter = server.issuedTokens.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(session.store.getSnapshot().state).toBe('pairing');
    expect(server.connectionCount).toBe(0);
    expect(server.issuedTokens.length).toBe(attemptsAfter);
    session.disconnect();
  });

  it('disconnect from pairing returns to disconnected', async () => {
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().state).toBe('pairing');
    session.disconnect();
    expect(session.store.getSnapshot().state).toBe('disconnected');
    expect(session.store.getSnapshot().connector).toBeNull();
  });

  it('connects straight through a connector with pairing disabled', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({
      updateIntervalMs: 10,
      connector: { name: 'Open PC', pairingRequired: false, code: '123456' },
    });
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().state).toBe('connected');
    expect(session.store.getSnapshot().diagnostics.connector).toBe('paired');
    expect(session.store.getSnapshot().connector?.name).toBe('Open PC');
    session.disconnect();
  });

  it('connects to plain X-Plane with the connector step direct', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    const session = createSession(storage);
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().state).toBe('connected');
    expect(session.store.getSnapshot().diagnostics.connector).toBe('direct');
    expect(session.store.getSnapshot().connector).toBeNull();
    session.disconnect();
  });
});
```

- [ ] **Step 8: Run it**

Run: `npx jest --selectProjects node tests/integration/simulator-session-pairing.test.ts`
Expected: PASS (6 tests). If the "rejects the token" case is flaky, raise only the `until` timeout — never add a bare sleep before the assertion.

- [ ] **Step 9: Wire the composition root, context and hook**

`src/app/composition-root.ts`:

```ts
import type { AppServices } from '@/app/services-context';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { SimulatorSession } from '@/application/simulator-session';
import { httpOrigin } from '@/domain/connection/endpoints';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { createLogger } from '@/infrastructure/logging/logger';
import { createAsyncStorageSettings } from '@/infrastructure/storage/async-storage-settings';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';

export function createAppServices(): AppServices {
  const settingsStorage = createAsyncStorageSettings();
  const session = new SimulatorSession({
    createHttpTransport: (config, auth) =>
      new HttpTransport({
        origin: httpOrigin(config),
        auth,
        logger: createLogger('http'),
      }),
    createClient: (config, apiVersion, http, auth) =>
      new XPlaneClient({ config, apiVersion, http, auth, logger: createLogger('websocket') }),
    createConnectorClient: (http) =>
      new ConnectorClient({ http, logger: createLogger('connection') }),
    tokenStore: createPairingTokenStore(settingsStorage),
    logger: createLogger('session'),
  });
  return { session, settingsStorage };
}
```

`src/app/services-context.tsx:6-9`:

```ts
export type SessionApi = Pick<
  SimulatorSession,
  'store' | 'connect' | 'disconnect' | 'pair' | 'writeHeading' | 'activateHeadingUp'
>;
```

`src/hooks/useSimulatorSession.ts` — add the callback and return it:

```ts
  const pair = useCallback((code: string) => session.pair(code), [session]);
```
```ts
  return { snapshot, connect, disconnect, pair, writeHeading, activateHeadingUp };
```

- [ ] **Step 10: Run the whole suite**

Run: `npm test`
Expected: the `node` project is green. The `expo` and `web` projects **fail**: their `makeServices`/`services` fixtures do not provide `pair`, and `mvp-screen.test.tsx` still expects the default port `8086`. Task 7 fixes both — do not fix them here beyond what the gate needs.

To keep this task's commit green, apply the two mechanical fixture updates now:

- `tests/ui/mvp-screen.test.tsx`: add this entry to the `session` object in `makeServices` (typed with the `code` parameter so Task 7 can call `session.pair.mockImplementation(async (code: string) => { … })` on it), and change the two `8086` expectations on lines 42 and 46 to `'8080'`:

  ```ts
      pair: jest.fn(async (code: string) => {
        void code;
      }),
  ```

- `tests/web/mvp-screen.web.test.tsx`: add `pair: async () => undefined,` to the `session` object in `services()`.
- `tests/ui/use-connection-settings.test.tsx:81`: `expect(result.current.port).toBe('8080');`

- [ ] **Step 11: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src tests
git commit -m "feat(session): probe the connector, pair with a code and re-pair when the token is rejected

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: UI — pairing mode, error copy, connector diagnostics

**Files:**
- Modify: `src/features/connection/ConnectionForm.tsx`
- Modify: `src/features/connection/ConnectionStatus.tsx`
- Modify: `src/features/diagnostics/DiagnosticsPanel.tsx`
- Modify: `src/features/mvp/MvpScreen.tsx`
- Test: `tests/ui/mvp-screen.test.tsx`, `tests/web/mvp-screen.web.test.tsx`

**Interfaces:**
- Consumes (Task 6): `snapshot.state === 'pairing'`, `snapshot.connector: ConnectorInfo | null`, `snapshot.diagnostics.connector: ConnectorStep`, `useSimulatorSession().pair(code: string): Promise<void>`.
- Produces: `ConnectionForm` props `connectorName: string | null`, `onPair: (code: string) => void`, `pairing: boolean` in addition to the existing `host`, `port`, `state`, `onHostChange`, `onPortChange`, `onConnect`, `onDisconnect`; testID `pairing-code` on the code input.

- [ ] **Step 1: Write the failing expo tests**

In `tests/ui/mvp-screen.test.tsx`, add this describe block after the existing `describe('MvpScreen', ...)` block (`makeServices` and `renderScreen` are module-level helpers in this file, so they are in scope):

```ts
describe('MvpScreen pairing mode', () => {
  const connector = {
    name: 'Sim PC',
    version: '0.1.0',
    pairingRequired: true,
    xplane: { host: '127.0.0.1', port: 8086, reachable: true },
  };

  it('names the connector and enables Pair only for six digits', async () => {
    const { services, session } = makeServices({ state: 'pairing', connector });
    await renderScreen(services);
    await waitFor(() =>
      expect(
        screen.getByText('Sim PC needs pairing. Enter the code shown in the connector window.'),
      ).toBeTruthy(),
    );
    const input = screen.getByTestId('pairing-code');
    await fireEvent.changeText(input, '12345');
    await fireEvent.press(screen.getByText('Pair'));
    expect(session.pair).not.toHaveBeenCalled();
    await fireEvent.changeText(input, '123456');
    await fireEvent.press(screen.getByText('Pair'));
    await waitFor(() => expect(session.pair).toHaveBeenCalledWith('123456'));
  });

  it('falls back to a generic name when the connector is unknown', async () => {
    const { services } = makeServices({ state: 'pairing', connector: null });
    await renderScreen(services);
    await waitFor(() =>
      expect(
        screen.getByText(
          'This connector needs pairing. Enter the code shown in the connector window.',
        ),
      ).toBeTruthy(),
    );
  });

  it('Cancel disconnects', async () => {
    const { services, session } = makeServices({ state: 'pairing', connector });
    await renderScreen(services);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(session.disconnect).toHaveBeenCalled();
  });

  it('clears the code after a failed attempt', async () => {
    const { services, session, store } = makeServices({ state: 'pairing', connector });
    session.pair.mockImplementation(async (code: string) => {
      void code;
      store.setState((prev) => ({
        ...prev,
        error: new AvionixError({ code: 'PAIRING_FAILED', message: 'Wrong pairing code' }),
      }));
    });
    await renderScreen(services);
    await fireEvent.changeText(screen.getByTestId('pairing-code'), '000000');
    await fireEvent.press(screen.getByText('Pair'));
    await waitFor(() =>
      expect(screen.getByText('Wrong code, check the connector window.')).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByTestId('pairing-code').props.value).toBe(''));
  });

  it.each([
    ['PAIRING_FAILED', 'Wrong code, check the connector window.'],
    ['PAIRING_RATE_LIMITED', 'Too many attempts, wait a minute and try again.'],
    ['UNAUTHORIZED', 'The connector no longer accepts this device, pair again.'],
    ['PAIRING_REQUIRED', 'This connector needs pairing.'],
  ] as const)('renders plain text for %s', async (code, text) => {
    const { services } = makeServices({
      state: 'pairing',
      connector,
      error: new AvionixError({ code, message: 'raw protocol message' }),
    });
    await renderScreen(services);
    await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
    expect(screen.queryByText(`${code}: raw protocol message`)).toBeNull();
  });

  it('shows the connector diagnostics row', async () => {
    const { services } = makeServices({
      state: 'connected',
      connector,
      diagnostics: {
        connector: 'paired',
        http: 'ok',
        capabilities: 'ok',
        websocket: 'ok',
        command: 'ok',
        subscription: 'ok',
        dataRefs: {
          [MVP_DATAREFS.heartbeat]: 'ok',
          [MVP_DATAREFS.airspeed]: 'ok',
          [MVP_DATAREFS.heading]: 'ok',
        },
      },
    });
    await renderScreen(services);
    await waitFor(() => expect(screen.getByText('Connector: PAIRED')).toBeTruthy());
  });
});
```

Also add `connector: 'idle',` to the `diagnostics` objects already present in the two existing tests at `tests/ui/mvp-screen.test.tsx:59` and `:94` (the type now requires it).

- [ ] **Step 2: Write the failing web test**

Add to `tests/web/mvp-screen.web.test.tsx`, inside `describe('MvpScreen on react-native-web', ...)`:

```ts
  it('renders the pairing mode as DOM', async () => {
    const s = services();
    s.session.store.setState((prev) => ({
      ...prev,
      state: 'pairing',
      connector: {
        name: 'Sim PC',
        version: '0.1.0',
        pairingRequired: true,
        xplane: { host: '127.0.0.1', port: 8086, reachable: true },
      },
    }));
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
    const text = container.textContent ?? '';
    expect(text).toContain('Status: pairing');
    expect(text).toContain('Sim PC needs pairing.');
    expect(container.querySelector('[data-testid="pairing-code"]')).not.toBeNull();
  });
```

The `services()` helper returns a fresh `Store`, so `setState` before the render is safe.

- [ ] **Step 3: Run both to verify they fail**

Run: `npx jest --selectProjects expo tests/ui/mvp-screen.test.tsx` and `npx jest --selectProjects web tests/web/mvp-screen.web.test.tsx`
Expected: FAIL — no element with testID `pairing-code`, no `Pair` button, and the raw `PAIRING_FAILED: …` line instead of the plain text.

- [ ] **Step 4: Implement `ConnectionForm`**

Replace `src/features/connection/ConnectionForm.tsx` with:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Button, View } from 'react-native';

import type { ConnectionState } from '@/domain/connection/connection-state';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  host: string;
  port: string;
  state: ConnectionState;
  connectorName: string | null;
  pairing: boolean;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onPair: (code: string) => void;
}

const CODE_LENGTH = 6;

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md },
});

export function ConnectionForm(props: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [code, setCode] = useState('');
  const wasPairing = useRef(false);
  const isPairingState = props.state === 'pairing';
  const busy = props.state === 'connecting' || props.state === 'reconnecting' || isPairingState;
  const connected = props.state === 'connected' || busy;

  // A pair call that ends while the session is still `pairing` was rejected: start over with
  // an empty field so the user does not have to clear six digits by hand.
  useEffect(() => {
    if (wasPairing.current && !props.pairing && isPairingState) {
      setCode('');
    }
    wasPairing.current = props.pairing;
  }, [props.pairing, isPairingState]);

  return (
    <Section>
      <SectionTitle>Connection</SectionTitle>
      <BodyText>X-Plane host (IP or hostname on your LAN)</BodyText>
      <ThemedTextInput
        accessibilityLabel="X-Plane host"
        value={props.host}
        onChangeText={props.onHostChange}
        placeholder="192.168.1.100"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!connected}
      />
      <BodyText>Port</BodyText>
      <ThemedTextInput
        accessibilityLabel="Port"
        value={props.port}
        onChangeText={props.onPortChange}
        keyboardType="number-pad"
        editable={!connected}
      />
      {isPairingState ? (
        <>
          <BodyText>
            {props.connectorName ?? 'This connector'} needs pairing. Enter the code shown in the
            connector window.
          </BodyText>
          <ThemedTextInput
            testID="pairing-code"
            accessibilityLabel="Pairing code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoFocus
            editable={!props.pairing}
          />
          <View style={styles.row}>
            <Button
              title="Pair"
              onPress={() => props.onPair(code)}
              disabled={props.pairing || code.length !== CODE_LENGTH}
              color={theme.colors.primary}
            />
            <Button title="Cancel" onPress={props.onDisconnect} color={theme.colors.primary} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Button
            title="Connect"
            onPress={props.onConnect}
            disabled={connected}
            color={theme.colors.primary}
          />
          <Button
            title="Disconnect"
            onPress={props.onDisconnect}
            disabled={props.state === 'disconnected'}
            color={theme.colors.primary}
          />
        </View>
      )}
    </Section>
  );
}
```

- [ ] **Step 5: Implement `ConnectionStatus`**

Replace `src/features/connection/ConnectionStatus.tsx` with:

```tsx
import React from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { AvionixErrorCode } from '@/domain/errors/avionix-error';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';

/** Codes the user can act on get plain language; everything else keeps `code: message`. */
const PLAIN_TEXT: Partial<Record<AvionixErrorCode, string>> = {
  PAIRING_FAILED: 'Wrong code, check the connector window.',
  PAIRING_RATE_LIMITED: 'Too many attempts, wait a minute and try again.',
  UNAUTHORIZED: 'The connector no longer accepts this device, pair again.',
  PAIRING_REQUIRED: 'This connector needs pairing.',
};

export function ConnectionStatus({ snapshot }: { snapshot: SessionSnapshot }) {
  const versions = snapshot.capabilities?.rawApiVersions.join(', ') ?? '-';
  const using = snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`;
  const error = snapshot.error;
  return (
    <Section>
      <SectionTitle>Status</SectionTitle>
      <BodyText>Status: {snapshot.state}</BodyText>
      {snapshot.state === 'reconnecting' ? (
        <BodyText>Reconnect attempt: {snapshot.reconnectAttempt}</BodyText>
      ) : null}
      {snapshot.connector === null ? null : (
        <BodyText>Connector: {snapshot.connector.name}</BodyText>
      )}
      <BodyText>X-Plane version: {snapshot.capabilities?.simulatorVersion ?? '-'}</BodyText>
      <BodyText>
        API versions: {versions}
        {using}
      </BodyText>
      {error !== null ? (
        <BodyText tone="danger">
          {PLAIN_TEXT[error.code] ?? `${error.code}: ${error.message}`}
        </BodyText>
      ) : null}
    </Section>
  );
}
```

- [ ] **Step 6: Implement the diagnostics row**

In `src/features/diagnostics/DiagnosticsPanel.tsx`, add the import and two small maps, then render the row first:

```tsx
import type { ConnectorStep, SessionSnapshot, StepStatus } from '@/application/session-snapshot';
```

```tsx
const CONNECTOR_LABEL: Record<ConnectorStep, string> = {
  idle: '-',
  pending: '...',
  direct: 'DIRECT',
  pairing: 'PAIRING',
  paired: 'PAIRED',
};

function connectorTone(step: ConnectorStep): 'danger' | 'success' | undefined {
  return step === 'direct' || step === 'paired' ? 'success' : undefined;
}
```

and inside the `Section`, immediately after the `Target:` line:

```tsx
      <BodyText tone={connectorTone(d.connector)}>
        Connector: {CONNECTOR_LABEL[d.connector]}
      </BodyText>
```

- [ ] **Step 7: Implement `MvpScreen`**

In `src/features/mvp/MvpScreen.tsx`, take `pair` from the hook, track the in-flight flag, and pass the three new props:

```tsx
  const { snapshot, connect, disconnect, pair, writeHeading, activateHeadingUp } =
    useSimulatorSession();
  const settings = useConnectionSettings();
  const styles = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());
  const [pairing, setPairing] = useState(false);
```

```tsx
  const onPair = useCallback(
    (code: string) => {
      setPairing(true);
      void pair(code)
        .catch(() => {
          // pair() only rejects with INTERNAL (wrong state or a concurrent call), which the
          // disabled button already prevents; user-visible failures arrive via snapshot.error.
        })
        .finally(() => setPairing(false));
    },
    [pair],
  );
```

```tsx
      <ConnectionForm
        host={settings.host}
        port={settings.port}
        state={snapshot.state}
        connectorName={snapshot.connector?.name ?? null}
        pairing={pairing}
        onHostChange={settings.setHost}
        onPortChange={settings.setPort}
        onConnect={onConnect}
        onDisconnect={disconnect}
        onPair={onPair}
      />
```

- [ ] **Step 8: Run the UI and web tests**

Run: `npx jest --selectProjects expo tests/ui/` then `npx jest --selectProjects web tests/web/`
Expected: PASS in both projects.

- [ ] **Step 9: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features tests/ui tests/web
git commit -m "feat(ui): add the inline pairing mode, plain-text pairing errors and the connector row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end through the real `scripts/avionix-bridge.js`

**Files:**
- Create: `tests/integration/connector-pairing-e2e.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-7, plus the merged bridge CLI: `node scripts/avionix-bridge.js --port <n> --host <ip> --xplane <host>:<port> --static <dir> --code <6 digits> --data-dir <dir> --no-mdns`, which logs `listening on http://<host>:<port>, …` on stdout and enforces pairing by default.
- Produces: no new source. This is the acceptance test for the whole plan.

- [ ] **Step 1: Write the end-to-end test**

`tests/integration/connector-pairing-e2e.test.ts`:

```ts
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MVP_DATAREFS } from '@/application/mvp-bindings';
import { createPairingTokenStore } from '@/application/pairing-token-store';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { SimulatorSession } from '@/application/simulator-session';
import { ConnectorClient } from '@/infrastructure/connector/connector-client';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

const BRIDGE = path.resolve(__dirname, '../../scripts/avionix-bridge.js');
const PAIRING_CODE = '246810';

async function until(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Starts the real connector and resolves with its child process and the port it bound. */
function startConnector(options: {
  xplaneHost: string;
  xplanePort: number;
  staticDir: string;
  dataDir: string;
}): Promise<{ child: ChildProcessWithoutNullStreams; port: number }> {
  const child = spawn(
    process.execPath,
    [
      BRIDGE,
      '--port',
      '0',
      '--host',
      '127.0.0.1',
      '--xplane',
      `${options.xplaneHost}:${options.xplanePort}`,
      '--static',
      options.staticDir,
      '--code',
      PAIRING_CODE,
      '--data-dir',
      options.dataDir,
      '--no-mdns',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`connector did not report a port in time. stderr: ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      const match = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]) });
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`connector exited early with code ${String(code)}: ${stderr}`));
    });
  });
}

function stopConnector(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 2000).unref();
  });
}

function createSession(storage: SettingsStorage): SimulatorSession {
  return new SimulatorSession({
    createHttpTransport: (config, auth) =>
      new HttpTransport({
        origin: `http://${config.host}:${config.port}`,
        auth,
        logger: silentLogger,
        defaultTimeoutMs: 4000,
      }),
    createClient: (config, apiVersion, http, auth) =>
      new XPlaneClient({
        config,
        apiVersion,
        http,
        auth,
        logger: silentLogger,
        requestTimeoutMs: 4000,
        connectTimeoutMs: 4000,
      }),
    createConnectorClient: (http) => new ConnectorClient({ http, logger: silentLogger }),
    tokenStore: createPairingTokenStore(storage),
    logger: silentLogger,
  });
}

describe('pairing through the real Avionix Connector', () => {
  let xplane: MockXPlaneServer;
  let child: ChildProcessWithoutNullStreams;
  let bridgePort: number;
  let staticDir: string;
  let dataDir: string;

  beforeEach(async () => {
    xplane = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-e2e-web-'));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avionix-e2e-data-'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Avionix</title>');
    const started = await startConnector({
      xplaneHost: xplane.host,
      xplanePort: xplane.port,
      staticDir,
      dataDir,
    });
    child = started.child;
    bridgePort = started.port;
  });

  afterEach(async () => {
    await stopConnector(child);
    await xplane.stop();
    fs.rmSync(staticDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('pairs with the printed code, reads a DataRef and stores a reusable token', async () => {
    const storage = createMemorySettingsStorage();
    const session = createSession(storage);
    const snap = () => session.store.getSnapshot();

    await session.connect('127.0.0.1', bridgePort);
    expect(snap().state).toBe('pairing');
    expect(snap().connector?.pairingRequired).toBe(true);
    expect(snap().connector?.xplane.port).toBe(xplane.port);

    await session.pair('000000');
    expect(snap().state).toBe('pairing');
    expect(snap().error?.code).toBe('PAIRING_FAILED');

    await session.pair(PAIRING_CODE);
    expect(snap().state).toBe('connected');
    expect(snap().diagnostics.connector).toBe('paired');
    expect(snap().error).toBeNull();

    xplane.setDataRefValue('sim/time/total_running_time_sec', 42);
    await until(() => snap().telemetry[MVP_DATAREFS.heartbeat]?.value === 42);

    await expect(
      createPairingTokenStore(storage).get('127.0.0.1', bridgePort),
    ).resolves.toEqual(expect.any(String));
    expect(fs.existsSync(path.join(dataDir, 'connector-tokens.json'))).toBe(true);

    session.disconnect();
    await until(() => xplane.connectionCount === 0);

    // A second session on the same storage reuses the token and never pairs again.
    const second = createSession(storage);
    await second.connect('127.0.0.1', bridgePort);
    expect(second.store.getSnapshot().state).toBe('connected');
    second.disconnect();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx jest --selectProjects node tests/integration/connector-pairing-e2e.test.ts`
Expected: PASS (1 test). Run it three times in a row to check for a leaked child process or socket:

```bash
for i in 1 2 3; do npx jest --selectProjects node tests/integration/connector-pairing-e2e.test.ts 2>&1 | grep -E '^Tests:|did not exit'; done
```

Expected: `Tests: 1 passed, 1 total` each time and no "did not exit" warning.

- [ ] **Step 3: Gate and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add tests/integration/connector-pairing-e2e.test.ts
git commit -m "test(e2e): pair the app with the real Avionix Connector and read a DataRef

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/connector.md:27-37`, `docs/web.md`, `README.md`, `docs/testing/xplane-smoke-test.md`, `docs/architecture.md`

**Interfaces:**
- Consumes: the finished behaviour from Tasks 1-8. No code changes.
- Produces: nothing other tasks depend on.

`docs/` is Prettier-ignored — do not run `prettier --write` over it.

- [ ] **Step 1: `docs/connector.md`**

Replace the two-paragraph "Pairing" section (lines 27-37) with:

```markdown
## Pairing

On start the connector prints a six-digit code (rotates each run; `--code 123456` fixes it for
tests). Open Avionix, enter the connector's host and port (8080 by default) and press Connect: the
app probes `GET /avionix/info`, sees that pairing is required, and shows a code field inline on the
connection screen. Type the six digits and press Pair. The app stores the returned token per
connector (host and port) and sends it on every request afterwards, so it never asks again.

A wrong code leaves the app on the pairing screen with "Wrong code, check the connector window.";
after five wrong attempts in a minute it reports "Too many attempts, wait a minute and try again."
Press Cancel to give up and go back to disconnected.

Tokens are saved in `~/.avionix/connector-tokens.json` (`--data-dir` overrides) so paired devices
survive restarts, but valid tokens are also cached in memory while the connector runs, so deleting
the file alone does not revoke an already-running connector. To revoke every device: stop the
connector, delete that file, then start it again. The next time the app connects, the connector
rejects its token, the app forgets it and asks for a fresh code. `--open` disables pairing entirely
(trusted networks only).
```

- [ ] **Step 2: `docs/web.md` and `README.md`**

In `docs/web.md`, remove any sentence recommending `--open` as the interim way to reach X-Plane, and add after the bridge/connector paragraph:

```markdown
On first use the app asks for the six-digit pairing code the connector prints; see
`docs/connector.md`. The token is stored per connector in the browser's `localStorage` (native
apps use AsyncStorage), so the question is asked once per device.
```

In `README.md`, replace the port in the feature list (line 12) and the getting-started step (line 65):

```markdown
- Enter the connector (or X-Plane) host and port (default 8080), connect and disconnect.
```

```markdown
3. In Avionix enter that IP and port 8080, press Connect, then type the six-digit pairing code the
   connector printed. Connecting straight to X-Plane still works: use port 8086 and no code.
```

- [ ] **Step 3: `docs/testing/xplane-smoke-test.md`**

Drop the `--open` interim wording, mention the code in the setup step that starts the connector, and add three rows to the step table after the existing row 1 (renumber the following rows):

```markdown
| 2 | With the connector running, press Connect and enter a wrong six-digit code | Status stays `pairing`; "Wrong code, check the connector window."; the field is cleared | |
| 3 | Enter the code printed by the connector and press Pair | Status `connected`; Connector row shows PAIRED; telemetry updates | |
| 4 | Stop the connector, delete `~/.avionix/connector-tokens.json`, start it again, wait for the app to retry | The app returns to `pairing` with "The connector no longer accepts this device, pair again."; the new code connects | |
```

Change the existing row 1 so it targets the connector port 8080 instead of 8086, and keep a direct-to-X-Plane row (port 8086, no code) so both paths are covered.

- [ ] **Step 4: `docs/architecture.md`**

Add `pairing` to the state machine block (after the `connecting` lines):

```markdown
connecting --pairingRequired--> pairing --pair--> connecting
reconnecting --pairingRequired--> pairing   pairing --disconnect--> disconnected
```

Add a paragraph under it:

```markdown
`pairing` is reached when the target is an Avionix Connector that requires a code and the app holds
no token for it, and when a connector rejects the token the app does hold (the `UNAUTHORIZED` path,
which also clears the stored token and cancels the reconnect scheduler). It is left by
`SimulatorSession.pair(code)` or by `disconnect()`.
```

Extend the data-flow block with the probe as step 2 (renumbering the rest):

```markdown
      2. GET /avionix/info                        (ConnectorClient)
         → no connector: continue; pairing needed: state = pairing until pair(code)
```

Update the Infrastructure and Application rows of the layer table to name the new units, and replace the last sentence of "Multi-device" ("Device roles and pairing are intentionally not implemented.") with:

```markdown
Devices pair with the Avionix Connector individually: each holds its own bearer token, stored per
host and port by `PairingTokenStore` in the same `SettingsStorage` port as the connection settings.
Device roles are still not implemented.
```

- [ ] **Step 5: Gate and commit**

```bash
npm run format:check && npm test
git add docs README.md
git commit -m "docs: describe in-app pairing, the pairing state and re-pairing after revocation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan self-review notes

- **Spec coverage.** Connection state edges → T1. Error codes → T1 (+ retryable flags in T2). `ConnectorInfo` → T1. `AuthProvider` on both transports, token-free logs → T2. Error mapping incl. bare 401 → T2. `ConnectorClient` + schemas → T3. `PairingTokenStore` → T4. Mock connector option (`issuedTokens`, `setRejectAllTokens`) → T5. Session (connector step, pairing state, `pair()`, `UNAUTHORIZED`, snapshot/diagnostics, `DEFAULT_PORT` 8080, composition root, `SessionApi`, hook) → T6. UI (`ConnectionForm` pairing mode, `ConnectionStatus` copy, `MvpScreen`, diagnostics row, expo + web tests) → T7. End to end through the real bridge → T8. Docs → T9. Every unit/integration/UI test listed in the spec's Testing section appears in T1-T8; the spec's out-of-scope list (discovery, a "forget this connector" button, bridge changes, QR pairing) is untouched.
- **Placeholder scan.** Every step that changes code carries the code. The only prose-only edits are the documentation steps in T9, where the replacement text is quoted in full, and the mechanical `this.options.url` → `this.safeUrl` substitution in T2 Step 12, where each call site is enumerated.
- **Type consistency.** `AuthProvider` is declared once (T2) and consumed identically by `HttpTransportOptions.auth`, `XPlaneClientOptions.auth` and `SimulatorSessionDeps` (T6). `ConnectorInfo` (T1) is the return type of `ConnectorClient.getInfo` (T3) and of `SessionSnapshot.connector` (T6) and is read by the UI as `snapshot.connector?.name` (T7). `ConnectorStep` (T6) is used by `DiagnosticsPanel`'s `CONNECTOR_LABEL` (T7) with all five members. `pairingTokenKey`/`createPairingTokenStore` (T4) are used unchanged in T6, T7's fixtures and T8. `AvionixError.httpStatus` (T1) is set in T2 and read in T3. `pair(code: string): Promise<void>` has the same shape in `SimulatorSession` (T6), `SessionApi` (T6), `useSimulatorSession` (T6) and the UI fixtures (T7).
- **Test-fixture ripple.** Adding required `createConnectorClient`/`tokenStore` deps and the `pair` member breaks three fixtures; T6 Step 6 and Step 10 update all of them (`tests/unit/application/simulator-session.test.ts`, `tests/integration/simulator-session.test.ts`, `tests/ui/mvp-screen.test.tsx`, `tests/web/mvp-screen.web.test.tsx`), and the `DEFAULT_PORT` change updates the four assertions that hard-code `8086` as a default.
