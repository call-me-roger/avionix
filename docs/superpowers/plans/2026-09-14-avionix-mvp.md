# Avionix MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Avionix Expo app that connects a phone to X-Plane 12 over LAN, negotiates the Web API version, streams DataRefs over WebSocket, writes a DataRef, activates a command, and recovers from connection loss, with a mock-server test suite and CI.

**Architecture:** Four layers with one-way dependencies: `domain` (pure types, state table, validation, error model) ← `infrastructure/xplane` (zod schemas, HTTP transport, WebSocket transport with request correlation, `XPlaneClient`, resolution caches) ← `application` (`SimulatorSession` orchestration, snapshot store, settings) ← `features`/`hooks` (plain React Native UI reading the store via `useSyncExternalStore`). The UI never sees a URL or a protocol message.

**Tech Stack:** Expo SDK 57 (React Native 0.86.3, React 19.2.3, TypeScript ~6.0.3), zod 4, AsyncStorage 2.2.0, Jest 29 via jest-expo (two projects: `node` and `expo`), @testing-library/react-native, `ws` (dev, mock server), ESLint flat config via eslint-config-expo, Prettier 3, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-avionix-mvp-design.md`

## Global Constraints

- Product name `Avionix`; slug `avionix`; iOS bundle id and Android package `pro.avionix.app`; EAS project id `c01122de-c8fd-4556-87e6-44ef5551a875`.
- Minimum X-Plane 12.1.4. Avionix supports Web API `v2` and `v3`; highest common version wins. Capabilities endpoint is unversioned `GET /api/capabilities`.
- Expo Go only: never run `expo prebuild`; never commit `android/` or `ios/`. The user verifies on physical devices; never launch Xcode, Android Studio, simulators or emulators.
- Package versions come from the SDK 57 template and `npx expo install`; TypeScript stays on the template's `~6.0.3` line. Do not install TypeScript 7.
- No `any`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable` without a comment stating the reason on the same line or the line above.
- No `as T` to bypass validation of external data; untrusted data is `unknown` until a zod schema accepts it.
- The UI never constructs URLs or WebSocket messages. All simulator I/O goes through `SimulatorSession` → `SimulatorClient` → transports.
- DataRef and command numeric ids are never persisted; only names are stored in code.
- REST requests always send `Accept: application/json` and `Content-Type: application/json`.
- Every error crossing into `application` or UI is an `AvionixError`.
- Path alias `@/` maps to `src/` (tsconfig `paths` and Jest `moduleNameMapper`).
- Commit after every task with the message given; end commit messages with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Before claiming a task done run: `npm run typecheck && npm run lint && npm run format:check && npm test`.

## File Map

| Path | Responsibility |
|---|---|
| `App.tsx`, `index.ts` | Expo entry; renders `AvionixApp` |
| `app.json` | Expo config, ids, LAN networking keys, EAS project id |
| `jest.config.js`, `babel.config.js`, `eslint.config.js`, `prettier.config.js`, `tsconfig.json` | Toolchain |
| `.github/workflows/ci.yml` | CI |
| `src/domain/errors/avionix-error.ts` | `AvionixErrorCode`, `AvionixError`, helpers |
| `src/domain/connection/connection-config.ts` | `XPlaneConnectionConfig`, host/port validation, `DEFAULT_PORT` |
| `src/domain/connection/endpoints.ts` | URL derivation (the only place URLs are built) |
| `src/domain/connection/connection-state.ts` | `ConnectionState`, `ConnectionEvent`, `transition` |
| `src/domain/simulator/api-version.ts` | `ApiVersion`, `negotiateApiVersion` |
| `src/domain/simulator/types.ts` | capabilities, descriptors, values, subscriptions, updates |
| `src/domain/simulator/simulator-client.ts` | `SimulatorClient` port used by the application layer |
| `src/utils/backoff.ts` | reconnect delay schedule |
| `src/infrastructure/logging/logger.ts` | `Logger`, `createLogger`, sinks |
| `src/infrastructure/xplane/schemas/rest.ts` | zod schemas for REST payloads |
| `src/infrastructure/xplane/schemas/websocket.ts` | zod schemas for WebSocket messages |
| `src/infrastructure/xplane/schemas/mappers.ts` | schema output → domain types, `parseWith` |
| `src/infrastructure/xplane/http/query-string.ts` | query encoding keeping `filter[name]` readable |
| `src/infrastructure/xplane/http/error-mapping.ts` | X-Plane `error_code` → `AvionixError` (shared by HTTP and WS) |
| `src/infrastructure/xplane/http/http-transport.ts` | `HttpTransport` |
| `src/infrastructure/xplane/websocket/request-manager.ts` | `req_id` allocation and pending map |
| `src/infrastructure/xplane/websocket/websocket-transport.ts` | `WebSocketTransport`, `WebSocketLike` |
| `src/infrastructure/xplane/capabilities.ts` | `probeCapabilities(http)` |
| `src/infrastructure/xplane/xplane-client.ts` | `XPlaneClient implements SimulatorClient` |
| `src/infrastructure/xplane/resolution-cache.ts` | `ResolutionCache<T>`, `DataRefRepository`, `CommandRepository` |
| `src/infrastructure/storage/async-storage-settings.ts` | `SettingsStorage` backed by AsyncStorage (only file importing it) |
| `src/application/store.ts` | `Store<T>` for `useSyncExternalStore` |
| `src/application/session-snapshot.ts` | `SessionSnapshot`, `StepStatus`, `initialSnapshot` |
| `src/application/mvp-bindings.ts` | MVP DataRef and command names |
| `src/application/simulator-session.ts` | `SimulatorSession` |
| `src/application/settings-store.ts` | `SettingsStorage` port, load/save |
| `src/app/composition-root.ts`, `src/app/services-context.tsx`, `src/app/AvionixApp.tsx` | wiring |
| `src/hooks/useSimulatorSession.ts`, `src/hooks/useConnectionSettings.ts` | React adapters |
| `src/features/connection/ConnectionForm.tsx`, `ConnectionStatus.tsx` | connection UI |
| `src/features/diagnostics/DiagnosticsPanel.tsx` | diagnostics UI |
| `src/features/mvp/TelemetryPanel.tsx`, `ControlPanel.tsx`, `MvpScreen.tsx` | MVP UI |
| `tests/mock-xplane/mock-xplane-server.ts` | in-process mock X-Plane (HTTP + WS) |
| `tests/fixtures/*.json` | payloads copied from the official doc |
| `tests/unit/**`, `tests/contract/**`, `tests/integration/**`, `tests/ui/**` | tests |
| `README.md`, `docs/architecture.md`, `docs/development.md`, `docs/xplane.md`, `docs/testing/xplane-smoke-test.md` | docs |

---

### Task 1: Scaffold the Expo project and toolchain

**Files:**
- Create: `App.tsx`, `index.ts`, `app.json`, `package.json`, `tsconfig.json`, `babel.config.js`, `jest.config.js`, `eslint.config.js`, `prettier.config.js`, `.prettierrc` (not used; keep config in `prettier.config.js` only), `.prettierignore`, `.gitignore`, `assets/*` (from template), `.github/workflows/ci.yml`
- Test: `tests/unit/smoke.test.ts`, `tests/ui/smoke.test.tsx`

**Interfaces:**
- Produces: npm scripts `start`, `lint`, `format`, `format:check`, `typecheck`, `test`, `build:validate`; Jest projects `node` (tests/unit, tests/contract, tests/integration) and `expo` (tests/ui); alias `@/` → `src/`.

- [ ] **Step 1: Generate the SDK 57 template into the scratchpad and copy it in**

```bash
cd /private/tmp/claude-502/-Users-code-Documents-git-avionix/d9004a45-d56d-43b1-9928-1840ac7a2c5e/scratchpad
rm -rf avionix-template
npx --yes create-expo-app@latest avionix-template --template blank-typescript --no-install
ls -la avionix-template
cd /Users/code/Documents/git/avionix
cp -R /private/tmp/claude-502/-Users-code-Documents-git-avionix/d9004a45-d56d-43b1-9928-1840ac7a2c5e/scratchpad/avionix-template/{App.tsx,index.ts,app.json,package.json,tsconfig.json,assets,.gitignore} .
cat package.json
```

Expected: `package.json` shows `expo ~57.0.x`, `react-native 0.86.x`, `typescript ~6.0.x`. If `index.ts` does not exist in the template, create it with:

```ts
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
```

and ensure `package.json` has `"main": "index.ts"`.

- [ ] **Step 2: Set package metadata and scripts**

Edit `package.json` so the top-level fields read:

```json
{
  "name": "avionix",
  "version": "0.1.0",
  "private": true,
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "lint": "expo lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "build:validate": "expo export --platform ios --platform android --output-dir dist"
  }
}
```

Keep the template's `dependencies` and `devDependencies` blocks.

- [ ] **Step 3: Install dependencies**

```bash
npm install
npx expo install zod @react-native-async-storage/async-storage expo-build-properties
npx expo install jest-expo jest @types/jest @testing-library/react-native eslint eslint-config-expo prettier eslint-config-prettier eslint-plugin-prettier -- --dev
npm install --save-dev ws @types/ws
npm ls expo react-native typescript jest jest-expo zod
```

Expected: no peer warnings that mention `react-native`; `typescript` stays `6.0.x`; `jest` is `29.x`. If `npx expo install` refuses the `-- --dev` form, use `--dev` directly.

- [ ] **Step 4: Write `app.json`**

Replace the `expo` object, keeping the template's `icon`, `splash`, `adaptiveIcon`, `favicon` paths:

```json
{
  "expo": {
    "name": "Avionix",
    "slug": "avionix",
    "version": "0.1.0",
    "orientation": "default",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "scheme": "avionix",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "bundleIdentifier": "pro.avionix.app",
      "supportsTablet": true,
      "infoPlist": {
        "NSLocalNetworkUsageDescription": "Avionix connects to X-Plane running on a computer on your local network.",
        "NSAppTransportSecurity": {
          "NSAllowsLocalNetworking": true
        }
      }
    },
    "android": {
      "package": "pro.avionix.app",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "usesCleartextTraffic": true
          }
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "c01122de-c8fd-4556-87e6-44ef5551a875"
      }
    }
  }
}
```

If the template's asset file names differ (check `ls assets`), use the template's names.

- [ ] **Step 5: Write `tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "types": ["jest"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["App.tsx", "index.ts", "src", "tests"],
  "exclude": ["node_modules", "dist", ".expo"]
}
```

- [ ] **Step 6: Write `babel.config.js`, `jest.config.js`, `eslint.config.js`, `prettier.config.js`, `.prettierignore`**

`babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

`jest.config.js`:

```js
const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/contract/**/*.test.ts',
        '<rootDir>/tests/integration/**/*.test.ts',
      ],
      transform: {
        '^.+\\.[jt]sx?$': 'babel-jest',
      },
      moduleNameMapper,
    },
    {
      displayName: 'expo',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/tests/ui/**/*.test.tsx'],
      moduleNameMapper,
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
      ],
    },
  ],
};
```

`eslint.config.js`:

```js
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'coverage/*'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/infrastructure/logging/**/*.ts', 'tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'no-console': 'off',
    },
  },
]);
```

`prettier.config.js`:

```js
/** @type {import('prettier').Config} */
module.exports = {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  semi: true,
};
```

`.prettierignore`:

```
node_modules
dist
.expo
package-lock.json
assets
```

Ensure `.gitignore` (from the template) contains `node_modules/`, `.expo/`, `dist/`, `web-build/`, `*.orig.*`, `.DS_Store`; append `dist/` and `coverage/` if missing.

- [ ] **Step 7: Write the two smoke tests**

`tests/unit/smoke.test.ts`:

```ts
describe('node test project', () => {
  it('runs TypeScript and exposes Node networking globals', () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
    expect(typeof fetch).toBe('function');
    expect(typeof WebSocket).toBe('function');
  });
});
```

`tests/ui/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

describe('expo test project', () => {
  it('renders a React Native component', () => {
    render(<Text>Avionix</Text>);
    expect(screen.getByText('Avionix')).toBeTruthy();
  });
});
```

- [ ] **Step 8: Run the whole toolchain**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

Expected: typecheck clean, lint clean (run `npm run format` first if Prettier reports the template files), both Jest projects pass (2 tests). If `expo lint` prompts to install anything, answer yes and re-run.

- [ ] **Step 9: Validate the bundle export**

```bash
npm run build:validate && ls dist
```

Expected: `dist/` contains `_expo/` bundles for ios and android. If the CLI rejects two `--platform` flags, change the script to `"expo export --platform ios --output-dir dist/ios && expo export --platform android --output-dir dist/android"`.

- [ ] **Step 10: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm test -- --ci
      - run: npm run build:validate
        env:
          CI: '1'
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Avionix Expo SDK 57 project with strict TypeScript, ESLint, Prettier, Jest and CI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Domain layer (errors, config, endpoints, state table, versions, backoff)

**Files:**
- Create: `src/domain/errors/avionix-error.ts`, `src/domain/connection/connection-config.ts`, `src/domain/connection/endpoints.ts`, `src/domain/connection/connection-state.ts`, `src/domain/simulator/api-version.ts`, `src/domain/simulator/types.ts`, `src/domain/simulator/simulator-client.ts`, `src/utils/backoff.ts`
- Test: `tests/unit/domain/avionix-error.test.ts`, `tests/unit/domain/connection-config.test.ts`, `tests/unit/domain/endpoints.test.ts`, `tests/unit/domain/connection-state.test.ts`, `tests/unit/domain/api-version.test.ts`, `tests/unit/utils/backoff.test.ts`

**Interfaces:**
- Produces (exact):
  - `AvionixErrorCode` union; `class AvionixError extends Error { code; retryable; simulatorErrorCode?; cause? }`; `isAvionixError(value: unknown): value is AvionixError`; `toAvionixError(value: unknown, fallback: { code: AvionixErrorCode; message: string }): AvionixError`
  - `interface XPlaneConnectionConfig { host: string; port: number }`; `DEFAULT_PORT = 8086`; `validateHost(input: string): string`; `validatePort(input: string | number): number`; `createConnectionConfig(host: string, port: string | number): XPlaneConnectionConfig`
  - `httpOrigin(config)`, `wsOrigin(config)`, `capabilitiesPath()`, `restPath(version, path)`, `webSocketUrl(config, version)`
  - `ConnectionState`, `ConnectionEvent`, `transition(state, event): ConnectionState`
  - `ApiVersion = 'v1' | 'v2' | 'v3'`; `AVIONIX_SUPPORTED_API_VERSIONS: readonly ApiVersion[] = ['v2', 'v3']`; `isApiVersion(value: string): value is ApiVersion`; `negotiateApiVersion(capabilities: SimulatorCapabilities, supported?: readonly ApiVersion[]): ApiVersion`
  - `SimulatorCapabilities`, `DataRefValueType`, `DataRefDescriptor`, `CommandDescriptor`, `DataRefValue`, `DataRefSubscription`, `DataRefUpdate`, `SocketCloseInfo`, `Unsubscribe`, `SimulatorClient`
  - `ReconnectPolicy`, `DEFAULT_RECONNECT_POLICY`, `computeBackoffDelayMs(attempt: number, policy: ReconnectPolicy, random?: () => number): number`

- [ ] **Step 1: Write the error model tests**

`tests/unit/domain/avionix-error.test.ts`:

```ts
import { AvionixError, isAvionixError, toAvionixError } from '@/domain/errors/avionix-error';

describe('AvionixError', () => {
  it('carries code, retryable flag, simulator code and cause', () => {
    const cause = new Error('boom');
    const error = new AvionixError({
      code: 'SIMULATOR_ERROR',
      message: 'Dataref does not exist',
      retryable: false,
      simulatorErrorCode: 'invalid_dataref_id',
      cause,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AvionixError');
    expect(error.code).toBe('SIMULATOR_ERROR');
    expect(error.retryable).toBe(false);
    expect(error.simulatorErrorCode).toBe('invalid_dataref_id');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Dataref does not exist');
  });

  it('defaults retryable to false', () => {
    expect(new AvionixError({ code: 'UNKNOWN', message: 'x' }).retryable).toBe(false);
  });

  it('isAvionixError narrows correctly', () => {
    expect(isAvionixError(new AvionixError({ code: 'TIMEOUT', message: 't' }))).toBe(true);
    expect(isAvionixError(new Error('plain'))).toBe(false);
    expect(isAvionixError('string')).toBe(false);
    expect(isAvionixError(null)).toBe(false);
  });

  it('toAvionixError returns the same instance for AvionixError input', () => {
    const original = new AvionixError({ code: 'TIMEOUT', message: 't' });
    expect(toAvionixError(original, { code: 'UNKNOWN', message: 'fallback' })).toBe(original);
  });

  it('toAvionixError wraps Error and non-Error values with the fallback code', () => {
    const wrapped = toAvionixError(new Error('inner'), { code: 'NETWORK_ERROR', message: 'net' });
    expect(wrapped.code).toBe('NETWORK_ERROR');
    expect(wrapped.message).toBe('net: inner');
    expect(wrapped.cause).toBeInstanceOf(Error);

    const wrappedString = toAvionixError('oops', { code: 'UNKNOWN', message: 'fallback' });
    expect(wrappedString.code).toBe('UNKNOWN');
    expect(wrappedString.message).toBe('fallback: oops');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/domain/avionix-error.test.ts`
Expected: FAIL, cannot find module `@/domain/errors/avionix-error`.

- [ ] **Step 3: Implement `src/domain/errors/avionix-error.ts`**

```ts
export type AvionixErrorCode =
  | 'INVALID_HOST'
  | 'INVALID_PORT'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INCOMING_TRAFFIC_DISABLED'
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
  | 'CANCELLED'
  | 'INTERNAL'
  | 'UNKNOWN';

export interface AvionixErrorInit {
  code: AvionixErrorCode;
  message: string;
  retryable?: boolean;
  simulatorErrorCode?: string;
  cause?: unknown;
}

export class AvionixError extends Error {
  readonly code: AvionixErrorCode;
  readonly retryable: boolean;
  readonly simulatorErrorCode: string | undefined;
  override readonly cause: unknown;

  constructor(init: AvionixErrorInit) {
    super(init.message);
    this.name = 'AvionixError';
    this.code = init.code;
    this.retryable = init.retryable ?? false;
    this.simulatorErrorCode = init.simulatorErrorCode;
    this.cause = init.cause;
  }
}

export function isAvionixError(value: unknown): value is AvionixError {
  return value instanceof AvionixError;
}

function describeUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function toAvionixError(
  value: unknown,
  fallback: { code: AvionixErrorCode; message: string; retryable?: boolean },
): AvionixError {
  if (isAvionixError(value)) {
    return value;
  }
  return new AvionixError({
    code: fallback.code,
    message: `${fallback.message}: ${describeUnknown(value)}`,
    retryable: fallback.retryable ?? false,
    cause: value,
  });
}
```

- [ ] **Step 4: Run the error tests and the typecheck**

Run: `npx jest tests/unit/domain/avionix-error.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests) and a clean typecheck. If `tsc` reports that `cause` "cannot have an 'override' modifier" (the configured `lib` lacks ES2022 `Error.cause`), remove the `override` keyword; if it reports the opposite, keep it. Do not add `@ts-ignore`.

- [ ] **Step 5: Write connection config and endpoint tests**

`tests/unit/domain/connection-config.test.ts`:

```ts
import {
  DEFAULT_PORT,
  createConnectionConfig,
  validateHost,
  validatePort,
} from '@/domain/connection/connection-config';
import { isAvionixError } from '@/domain/errors/avionix-error';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return isAvionixError(error) ? error.code : 'NOT_AVIONIX';
  }
}

describe('validateHost', () => {
  it('accepts IPv4 addresses and hostnames, trimming whitespace', () => {
    expect(validateHost('192.168.1.100')).toBe('192.168.1.100');
    expect(validateHost('  10.0.0.50 ')).toBe('10.0.0.50');
    expect(validateHost('sim-pc')).toBe('sim-pc');
    expect(validateHost('SimPC.local')).toBe('simpc.local');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['http://192.168.1.1', 'scheme'],
    ['192.168.1.1:8086', 'port suffix'],
    ['192.168.1.1/api', 'path'],
    ['256.1.1.1', 'octet out of range'],
    ['192.168.1', 'too few octets'],
    ['host name', 'inner whitespace'],
    ['-bad.host', 'leading hyphen'],
    ['::1', 'IPv6 not supported'],
  ])('rejects %s (%s) with INVALID_HOST', (input) => {
    expect(codeOf(() => validateHost(input))).toBe('INVALID_HOST');
  });
});

describe('validatePort', () => {
  it('accepts integers 1..65535 as number or string', () => {
    expect(validatePort(8086)).toBe(8086);
    expect(validatePort('8086')).toBe(8086);
    expect(validatePort(' 1 ')).toBe(1);
    expect(validatePort(65535)).toBe(65535);
  });

  it.each(['', 'abc', '0', '65536', '80.5', '-1', '8086abc'])(
    'rejects %s with INVALID_PORT',
    (input) => {
      expect(codeOf(() => validatePort(input))).toBe('INVALID_PORT');
    },
  );

  it('rejects non-integer and out of range numbers', () => {
    expect(codeOf(() => validatePort(1.5))).toBe('INVALID_PORT');
    expect(codeOf(() => validatePort(0))).toBe('INVALID_PORT');
    expect(codeOf(() => validatePort(Number.NaN))).toBe('INVALID_PORT');
  });
});

describe('createConnectionConfig', () => {
  it('builds a normalized config', () => {
    expect(createConnectionConfig(' 192.168.1.100 ', '8086')).toEqual({
      host: '192.168.1.100',
      port: 8086,
    });
  });

  it('exposes the X-Plane default port', () => {
    expect(DEFAULT_PORT).toBe(8086);
  });
});
```

`tests/unit/domain/endpoints.test.ts`:

```ts
import {
  capabilitiesPath,
  httpOrigin,
  restPath,
  webSocketUrl,
  wsOrigin,
} from '@/domain/connection/endpoints';

const config = { host: '192.168.1.100', port: 8086 };

describe('endpoints', () => {
  it('derives origins', () => {
    expect(httpOrigin(config)).toBe('http://192.168.1.100:8086');
    expect(wsOrigin(config)).toBe('ws://192.168.1.100:8086');
  });

  it('keeps the capabilities path unversioned', () => {
    expect(capabilitiesPath()).toBe('/api/capabilities');
  });

  it('prefixes REST paths with the negotiated version', () => {
    expect(restPath('v3', '/datarefs')).toBe('/api/v3/datarefs');
    expect(restPath('v2', '/command/12/activate')).toBe('/api/v2/command/12/activate');
    expect(restPath('v2', 'datarefs/count')).toBe('/api/v2/datarefs/count');
  });

  it('derives the versioned WebSocket URL', () => {
    expect(webSocketUrl(config, 'v3')).toBe('ws://192.168.1.100:8086/api/v3');
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx jest tests/unit/domain/connection-config.test.ts tests/unit/domain/endpoints.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 7: Implement `connection-config.ts` and `endpoints.ts`**

`src/domain/connection/connection-config.ts`:

```ts
import { AvionixError } from '@/domain/errors/avionix-error';

export interface XPlaneConnectionConfig {
  host: string;
  port: number;
}

export const DEFAULT_PORT = 8086;

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HOSTNAME_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function invalidHost(reason: string): AvionixError {
  return new AvionixError({ code: 'INVALID_HOST', message: `Invalid host: ${reason}` });
}

function invalidPort(reason: string): AvionixError {
  return new AvionixError({ code: 'INVALID_PORT', message: `Invalid port: ${reason}` });
}

function isValidIpv4(host: string): boolean {
  const match = IPV4_PATTERN.exec(host);
  if (match === null) {
    return false;
  }
  return match.slice(1).every((octet) => Number(octet) <= 255);
}

function isValidHostname(host: string): boolean {
  if (host.length > 253) {
    return false;
  }
  const labels = host.split('.');
  return labels.every((label) => HOSTNAME_LABEL_PATTERN.test(label));
}

export function validateHost(input: string): string {
  const host = input.trim().toLowerCase();
  if (host.length === 0) {
    throw invalidHost('host is empty');
  }
  if (host.includes('://')) {
    throw invalidHost('enter a host name or IP address without http:// or ws://');
  }
  if (host.includes('/')) {
    throw invalidHost('host must not contain a path');
  }
  if (host.includes(':')) {
    throw invalidHost('host must not contain a port or be an IPv6 address');
  }
  if (/\s/.test(host)) {
    throw invalidHost('host must not contain whitespace');
  }
  if (IPV4_PATTERN.test(host)) {
    if (!isValidIpv4(host)) {
      throw invalidHost('IPv4 octets must be between 0 and 255');
    }
    return host;
  }
  if (/^[\d.]+$/.test(host)) {
    throw invalidHost('IPv4 address must have four octets');
  }
  if (!isValidHostname(host)) {
    throw invalidHost('host name contains invalid characters');
  }
  return host;
}

export function validatePort(input: string | number): number {
  const text = typeof input === 'number' ? String(input) : input.trim();
  if (!/^\d+$/.test(text)) {
    throw invalidPort('port must be a whole number');
  }
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw invalidPort('port must be between 1 and 65535');
  }
  return port;
}

export function createConnectionConfig(host: string, port: string | number): XPlaneConnectionConfig {
  return { host: validateHost(host), port: validatePort(port) };
}
```

`src/domain/connection/endpoints.ts`:

```ts
import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import type { ApiVersion } from '@/domain/simulator/api-version';

export function httpOrigin(config: XPlaneConnectionConfig): string {
  return `http://${config.host}:${config.port}`;
}

export function wsOrigin(config: XPlaneConnectionConfig): string {
  return `ws://${config.host}:${config.port}`;
}

export function capabilitiesPath(): string {
  return '/api/capabilities';
}

export function restPath(version: ApiVersion, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/api/${version}${normalized}`;
}

export function webSocketUrl(config: XPlaneConnectionConfig, version: ApiVersion): string {
  return `${wsOrigin(config)}/api/${version}`;
}
```

- [ ] **Step 8: Write the API version module and simulator types (needed by endpoints)**

`src/domain/simulator/api-version.ts`:

```ts
import { AvionixError } from '@/domain/errors/avionix-error';
import type { SimulatorCapabilities } from '@/domain/simulator/types';

export type ApiVersion = 'v1' | 'v2' | 'v3';

export const API_VERSIONS: readonly ApiVersion[] = ['v1', 'v2', 'v3'];

export const AVIONIX_SUPPORTED_API_VERSIONS: readonly ApiVersion[] = ['v2', 'v3'];

export const MINIMUM_XPLANE_VERSION = '12.1.4';

export function isApiVersion(value: string): value is ApiVersion {
  return (API_VERSIONS as readonly string[]).includes(value);
}

function rank(version: ApiVersion): number {
  return API_VERSIONS.indexOf(version);
}

export function negotiateApiVersion(
  capabilities: SimulatorCapabilities,
  supported: readonly ApiVersion[] = AVIONIX_SUPPORTED_API_VERSIONS,
): ApiVersion {
  const common = capabilities.supportedApiVersions.filter((version) => supported.includes(version));
  const best = common.sort((a, b) => rank(b) - rank(a))[0];
  if (best === undefined) {
    throw new AvionixError({
      code: 'UNSUPPORTED_API',
      message:
        `X-Plane ${capabilities.simulatorVersion} offers API versions ` +
        `[${capabilities.rawApiVersions.join(', ')}] but Avionix needs one of ` +
        `[${supported.join(', ')}]. X-Plane ${MINIMUM_XPLANE_VERSION} or newer is required.`,
    });
  }
  return best;
}
```

`src/domain/simulator/types.ts`:

```ts
import type { ApiVersion } from '@/domain/simulator/api-version';

export interface SimulatorCapabilities {
  simulatorVersion: string;
  supportedApiVersions: ApiVersion[];
  rawApiVersions: string[];
}

export type DataRefValueType = 'float' | 'double' | 'int' | 'int_array' | 'float_array' | 'data';

export const DATAREF_VALUE_TYPES: readonly DataRefValueType[] = [
  'float',
  'double',
  'int',
  'int_array',
  'float_array',
  'data',
];

export interface DataRefDescriptor {
  id: number;
  name: string;
  valueType: DataRefValueType;
}

export interface CommandDescriptor {
  id: number;
  name: string;
  description: string;
}

/** Scalar, array, or base64 string (value_type "data"). */
export type DataRefValue = number | number[] | string;

export interface DataRefSubscription {
  id: number;
  index?: number | number[];
}

export interface DataRefUpdate {
  id: number;
  value: DataRefValue;
  receivedAt: number;
}
```

`src/domain/simulator/simulator-client.ts`:

```ts
import type {
  CommandDescriptor,
  DataRefDescriptor,
  DataRefSubscription,
  DataRefUpdate,
  DataRefValue,
} from '@/domain/simulator/types';

export interface SocketCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
  initiatedByClient: boolean;
}

export type Unsubscribe = () => void;

/**
 * Simulator-facing port consumed by the application layer.
 * The X-Plane Web API implementation lives in infrastructure/xplane.
 */
export interface SimulatorClient {
  findDataRef(name: string): Promise<DataRefDescriptor | null>;
  findCommand(name: string): Promise<CommandDescriptor | null>;
  getDataRefValue(id: number, index?: number): Promise<DataRefValue>;
  setDataRefValue(id: number, value: DataRefValue, index?: number): Promise<void>;
  activateCommand(id: number, durationSeconds?: number): Promise<void>;
  connectWebSocket(): Promise<void>;
  subscribeDataRefs(subscriptions: DataRefSubscription[]): Promise<void>;
  unsubscribeDataRefs(subscriptions: DataRefSubscription[] | 'all'): Promise<void>;
  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void): Unsubscribe;
  onSocketClosed(listener: (info: SocketCloseInfo) => void): Unsubscribe;
  disconnectWebSocket(): void;
}
```

- [ ] **Step 9: Run config, endpoint tests**

Run: `npx jest tests/unit/domain/connection-config.test.ts tests/unit/domain/endpoints.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the API version tests**

`tests/unit/domain/api-version.test.ts`:

```ts
import { isAvionixError } from '@/domain/errors/avionix-error';
import { isApiVersion, negotiateApiVersion } from '@/domain/simulator/api-version';
import type { SimulatorCapabilities } from '@/domain/simulator/types';

function caps(versions: string[]): SimulatorCapabilities {
  return {
    simulatorVersion: '12.4.0',
    rawApiVersions: versions,
    supportedApiVersions: versions.filter(isApiVersion),
  };
}

describe('negotiateApiVersion', () => {
  it('picks v3 when the sim offers v1..v3', () => {
    expect(negotiateApiVersion(caps(['v1', 'v2', 'v3']))).toBe('v3');
  });

  it('picks v2 when v3 is absent', () => {
    expect(negotiateApiVersion(caps(['v1', 'v2']))).toBe('v2');
  });

  it('ignores unknown future versions', () => {
    expect(negotiateApiVersion(caps(['v2', 'v3', 'v9']))).toBe('v3');
  });

  it('respects a custom supported list', () => {
    expect(negotiateApiVersion(caps(['v1', 'v2', 'v3']), ['v2'])).toBe('v2');
  });

  it('throws UNSUPPORTED_API when only v1 is available', () => {
    try {
      negotiateApiVersion(caps(['v1']));
      throw new Error('expected throw');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('UNSUPPORTED_API');
      expect(isAvionixError(error) && error.message).toContain('12.1.4');
    }
  });
});

describe('isApiVersion', () => {
  it('recognizes v1, v2, v3 only', () => {
    expect(isApiVersion('v1')).toBe(true);
    expect(isApiVersion('v3')).toBe(true);
    expect(isApiVersion('v4')).toBe(false);
    expect(isApiVersion('')).toBe(false);
  });
});
```

Run: `npx jest tests/unit/domain/api-version.test.ts`
Expected: PASS (implementation already exists from Step 8).

- [ ] **Step 11: Write the connection state tests**

`tests/unit/domain/connection-state.test.ts`:

```ts
import {
  CONNECTION_STATES,
  type ConnectionEvent,
  type ConnectionState,
  transition,
} from '@/domain/connection/connection-state';
import { isAvionixError } from '@/domain/errors/avionix-error';

const legal: Array<[ConnectionState, ConnectionEvent, ConnectionState]> = [
  ['disconnected', 'connect', 'connecting'],
  ['connecting', 'connected', 'connected'],
  ['connecting', 'failed', 'error'],
  ['connecting', 'disconnect', 'disconnected'],
  ['connected', 'socketLost', 'reconnecting'],
  ['connected', 'failed', 'error'],
  ['connected', 'disconnect', 'disconnected'],
  ['reconnecting', 'connected', 'connected'],
  ['reconnecting', 'retryExhausted', 'error'],
  ['reconnecting', 'disconnect', 'disconnected'],
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
];

describe('transition', () => {
  it.each(legal)('%s --%s--> %s', (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it('rejects every transition not in the table with INTERNAL', () => {
    for (const state of CONNECTION_STATES) {
      for (const event of events) {
        const isLegal = legal.some(([from, ev]) => from === state && ev === event);
        if (isLegal) {
          continue;
        }
        try {
          transition(state, event);
          throw new Error(`expected ${state} + ${event} to throw`);
        } catch (error) {
          expect(isAvionixError(error) && error.code).toBe('INTERNAL');
        }
      }
    }
  });
});
```

- [ ] **Step 12: Implement `src/domain/connection/connection-state.ts`**

```ts
import { AvionixError } from '@/domain/errors/avionix-error';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export const CONNECTION_STATES: readonly ConnectionState[] = [
  'disconnected',
  'connecting',
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
  | 'retryExhausted';

const TABLE: Readonly<Record<ConnectionState, Partial<Record<ConnectionEvent, ConnectionState>>>> = {
  disconnected: { connect: 'connecting' },
  connecting: { connected: 'connected', failed: 'error', disconnect: 'disconnected' },
  connected: { socketLost: 'reconnecting', failed: 'error', disconnect: 'disconnected' },
  reconnecting: { connected: 'connected', retryExhausted: 'error', disconnect: 'disconnected' },
  error: { connect: 'connecting', disconnect: 'disconnected' },
};

export function transition(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  const next = TABLE[state][event];
  if (next === undefined) {
    throw new AvionixError({
      code: 'INTERNAL',
      message: `Illegal connection transition: ${state} + ${event}`,
    });
  }
  return next;
}
```

Run: `npx jest tests/unit/domain/connection-state.test.ts`
Expected: PASS.

- [ ] **Step 13: Write the backoff tests**

`tests/unit/utils/backoff.test.ts`:

```ts
import { DEFAULT_RECONNECT_POLICY, computeBackoffDelayMs } from '@/utils/backoff';

const noJitter = () => 0.5;

describe('computeBackoffDelayMs', () => {
  it('doubles from the base delay: 1s, 2s, 4s, 8s, 16s', () => {
    const delays = [1, 2, 3, 4, 5].map((attempt) =>
      computeBackoffDelayMs(attempt, DEFAULT_RECONNECT_POLICY, noJitter),
    );
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('caps at maxDelayMs', () => {
    expect(computeBackoffDelayMs(10, DEFAULT_RECONNECT_POLICY, noJitter)).toBe(16000);
  });

  it('applies jitter within ±jitterRatio', () => {
    expect(computeBackoffDelayMs(1, DEFAULT_RECONNECT_POLICY, () => 0)).toBe(800);
    expect(computeBackoffDelayMs(1, DEFAULT_RECONNECT_POLICY, () => 1)).toBe(1200);
  });

  it('never returns less than zero and treats attempt < 1 as 1', () => {
    expect(computeBackoffDelayMs(0, DEFAULT_RECONNECT_POLICY, noJitter)).toBe(1000);
  });

  it('exposes the policy limits from the spec', () => {
    expect(DEFAULT_RECONNECT_POLICY.maxAttempts).toBe(5);
    expect(DEFAULT_RECONNECT_POLICY.baseDelayMs).toBe(1000);
    expect(DEFAULT_RECONNECT_POLICY.maxDelayMs).toBe(16000);
    expect(DEFAULT_RECONNECT_POLICY.jitterRatio).toBe(0.2);
  });
});
```

- [ ] **Step 14: Implement `src/utils/backoff.ts`**

```ts
export interface ReconnectPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
  jitterRatio: number;
}

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  factor: 2,
  maxDelayMs: 16000,
  jitterRatio: 0.2,
};

/**
 * Exponential backoff with symmetric jitter. `attempt` is 1-based.
 * `random` returns a number in [0, 1); injectable for deterministic tests.
 */
export function computeBackoffDelayMs(
  attempt: number,
  policy: ReconnectPolicy,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(1, Math.floor(attempt)) - 1;
  const raw = Math.min(policy.maxDelayMs, policy.baseDelayMs * policy.factor ** exponent);
  const jitter = (random() * 2 - 1) * policy.jitterRatio;
  return Math.max(0, Math.round(raw * (1 + jitter)));
}
```

Run: `npx jest tests/unit`
Expected: all domain tests PASS.

- [ ] **Step 15: Full verification and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(domain): add error model, connection config, endpoints, state table, API versions and backoff

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Structured logging

**Files:**
- Create: `src/infrastructure/logging/logger.ts`
- Test: `tests/unit/infrastructure/logger.test.ts`

**Interfaces:**
- Produces: `type LogLevel = 'debug' | 'info' | 'warn' | 'error'`; `type LogCategory = 'connection' | 'http' | 'websocket' | 'dataref' | 'command' | 'session' | 'ui'`; `interface Logger { debug(msg, data?); info(msg, data?); warn(msg, data?); error(msg, data?) }`; `interface LogSink { write(entry: LogEntry): void }`; `createLogger(category: LogCategory, options?: { sink?: LogSink; minLevel?: LogLevel }): Logger`; `consoleSink: LogSink`; `silentLogger: Logger`; `createMemorySink(): LogSink & { entries: LogEntry[] }`.

- [ ] **Step 1: Write the test**

`tests/unit/infrastructure/logger.test.ts`:

```ts
import { createLogger, createMemorySink, silentLogger } from '@/infrastructure/logging/logger';

describe('createLogger', () => {
  it('writes entries at or above minLevel with category and data', () => {
    const sink = createMemorySink();
    const logger = createLogger('http', { sink, minLevel: 'info' });
    logger.debug('hidden');
    logger.info('request', { path: '/api/capabilities' });
    logger.warn('slow');
    logger.error('failed', { status: 500 });

    expect(sink.entries.map((entry) => entry.level)).toEqual(['info', 'warn', 'error']);
    expect(sink.entries[0]).toMatchObject({
      category: 'http',
      message: 'request',
      data: { path: '/api/capabilities' },
    });
    expect(typeof sink.entries[0]?.timestamp).toBe('number');
  });

  it('defaults minLevel to debug in tests', () => {
    const sink = createMemorySink();
    createLogger('session', { sink }).debug('visible');
    expect(sink.entries).toHaveLength(1);
  });

  it('silentLogger never throws and never writes', () => {
    expect(() => silentLogger.error('ignored')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/infrastructure/logger.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/infrastructure/logging/logger.ts`**

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'connection'
  | 'http'
  | 'websocket'
  | 'dataref'
  | 'command'
  | 'session'
  | 'ui';

export interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

declare const __DEV__: boolean | undefined;

function defaultMinLevel(): LogLevel {
  const isDev = typeof __DEV__ === 'undefined' ? true : __DEV__;
  return isDev ? 'debug' : 'warn';
}

export const consoleSink: LogSink = {
  write(entry) {
    const line = `[avionix:${entry.category}] ${entry.message}`;
    const args: unknown[] = entry.data === undefined ? [line] : [line, entry.data];
    switch (entry.level) {
      case 'debug':
        console.debug(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
    }
  },
};

export function createMemorySink(): LogSink & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    write(entry) {
      entries.push(entry);
    },
  };
}

export function createLogger(
  category: LogCategory,
  options: { sink?: LogSink; minLevel?: LogLevel } = {},
): Logger {
  const sink = options.sink ?? consoleSink;
  const minLevel = options.minLevel ?? defaultMinLevel();
  const emit = (level: LogLevel, message: string, data?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
      return;
    }
    const entry: LogEntry = { level, category, message, timestamp: Date.now() };
    if (data !== undefined) {
      entry.data = data;
    }
    sink.write(entry);
  };
  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  };
}

const noop = (): void => undefined;

export const silentLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop };
```

- [ ] **Step 4: Run, verify, commit**

```bash
npx jest tests/unit/infrastructure/logger.test.ts
npm run typecheck && npm run lint && npm run format:check
git add -A
git commit -m "feat(logging): add category logger with sinks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: zod schemas, mappers and contract tests

**Files:**
- Create: `src/infrastructure/xplane/schemas/rest.ts`, `src/infrastructure/xplane/schemas/websocket.ts`, `src/infrastructure/xplane/schemas/mappers.ts`
- Create fixtures: `tests/fixtures/capabilities.json`, `tests/fixtures/dataref.json`, `tests/fixtures/dataref-list.json`, `tests/fixtures/command.json`, `tests/fixtures/error.json`, `tests/fixtures/ws-result-ok.json`, `tests/fixtures/ws-result-error.json`, `tests/fixtures/ws-dataref-update.json`, `tests/fixtures/ws-command-update.json`
- Test: `tests/contract/rest-schemas.test.ts`, `tests/contract/websocket-schemas.test.ts`

**Interfaces:**
- Produces:
  - `rest.ts`: `capabilitiesResponseSchema`, `dataRefSchema`, `commandSchema`, `dataRefListResponseSchema`, `commandListResponseSchema`, `dataRefValueSchema`, `dataRefValueResponseSchema`, `countResponseSchema`, `errorPayloadSchema`, and inferred types `RawCapabilities`, `RawDataRef`, `RawCommand`, `RawErrorPayload`
  - `websocket.ts`: `incomingEnvelopeSchema` (`{ type: string }`), `resultMessageSchema`, `dataRefUpdateMessageSchema`, `commandUpdateMessageSchema`, types `ResultMessage`, `DataRefUpdateMessage`, `CommandUpdateMessage`, `OutgoingMessage`
  - `mappers.ts`: `parseWith<T>(schema: ZodType<T>, data: unknown, context: string): T` (throws `INVALID_RESPONSE`), `toSimulatorCapabilities(raw)`, `toDataRefDescriptor(raw)`, `toCommandDescriptor(raw)`, `toDataRefUpdates(data: Record<string, DataRefValue>, receivedAt: number): DataRefUpdate[]`

- [ ] **Step 1: Write the fixtures (verbatim from the official doc)**

`tests/fixtures/capabilities.json`:

```json
{
  "api": {
    "versions": ["v1", "v2", "v3"]
  },
  "x-plane": {
    "version": "12.4.0"
  }
}
```

`tests/fixtures/dataref.json`:

```json
{
  "id": 9952311,
  "name": "sim/cockpit2/gauges/actuators/radio_altimeter_bug_ft_pilot",
  "value_type": "float"
}
```

`tests/fixtures/dataref-list.json`:

```json
{
  "data": [
    {
      "id": 9952311,
      "name": "sim/cockpit2/gauges/actuators/radio_altimeter_bug_ft_pilot",
      "value_type": "float"
    },
    { "id": 1253033683792, "name": "sim/flightmodel/weight/m_fuel", "value_type": "float_array" }
  ]
}
```

`tests/fixtures/command.json`:

```json
{
  "id": 2991,
  "name": "sim/developer/toggle_autopilot_constants",
  "description": "Toggle the autopilot constants window."
}
```

`tests/fixtures/error.json`:

```json
{
  "error_code": "index_out_of_range",
  "error_message": "Index is out of range"
}
```

`tests/fixtures/ws-result-ok.json`:

```json
{ "req_id": 123, "type": "result", "success": true }
```

`tests/fixtures/ws-result-error.json`:

```json
{
  "req_id": 123,
  "type": "result",
  "success": false,
  "error_code": "index_out_of_range",
  "error_message": "Index is out of range"
}
```

`tests/fixtures/ws-dataref-update.json` (note the doc's key with a trailing space is preserved on purpose):

```json
{
  "type": "dataref_update_values",
  "data": {
    "88491": 0,
    "3994": 5,
    "199 ": [0, 0, 0, 4]
  }
}
```

`tests/fixtures/ws-command-update.json`:

```json
{
  "type": "command_update_is_active",
  "data": {
    "88491": false,
    "3994": false,
    "199": true
  }
}
```

- [ ] **Step 2: Write the REST contract tests**

`tests/contract/rest-schemas.test.ts`:

```ts
import { isAvionixError } from '@/domain/errors/avionix-error';
import {
  parseWith,
  toCommandDescriptor,
  toDataRefDescriptor,
  toSimulatorCapabilities,
} from '@/infrastructure/xplane/schemas/mappers';
import {
  capabilitiesResponseSchema,
  commandSchema,
  countResponseSchema,
  dataRefListResponseSchema,
  dataRefSchema,
  dataRefValueResponseSchema,
  errorPayloadSchema,
} from '@/infrastructure/xplane/schemas/rest';
import capabilitiesFixture from '../fixtures/capabilities.json';
import commandFixture from '../fixtures/command.json';
import dataRefListFixture from '../fixtures/dataref-list.json';
import dataRefFixture from '../fixtures/dataref.json';
import errorFixture from '../fixtures/error.json';

describe('capabilities contract', () => {
  it('parses the documented payload and maps to SimulatorCapabilities', () => {
    const raw = parseWith(capabilitiesResponseSchema, capabilitiesFixture, 'capabilities');
    expect(toSimulatorCapabilities(raw)).toEqual({
      simulatorVersion: '12.4.0',
      supportedApiVersions: ['v1', 'v2', 'v3'],
      rawApiVersions: ['v1', 'v2', 'v3'],
    });
  });

  it('keeps unknown versions in rawApiVersions but not in supportedApiVersions', () => {
    const raw = parseWith(
      capabilitiesResponseSchema,
      { api: { versions: ['v2', 'v3', 'v4'] }, 'x-plane': { version: '13.0.0' } },
      'capabilities',
    );
    expect(toSimulatorCapabilities(raw)).toEqual({
      simulatorVersion: '13.0.0',
      supportedApiVersions: ['v2', 'v3'],
      rawApiVersions: ['v2', 'v3', 'v4'],
    });
  });

  it.each([
    [{ api: { versions: 'v3' }, 'x-plane': { version: '12.4.0' } }, 'versions not an array'],
    [{ api: { versions: ['v3'] } }, 'missing x-plane'],
    [{ api: { versions: ['v3'] }, 'x-plane': { version: 12 } }, 'version not a string'],
    [null, 'null'],
    ['text', 'string'],
  ])('rejects %j (%s) with INVALID_RESPONSE', (payload) => {
    try {
      parseWith(capabilitiesResponseSchema, payload, 'capabilities');
      throw new Error('expected throw');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('INVALID_RESPONSE');
      expect(isAvionixError(error) && error.message).toContain('capabilities');
    }
  });
});

describe('dataref contract', () => {
  it('parses the documented dataref and maps to DataRefDescriptor', () => {
    const raw = parseWith(dataRefSchema, dataRefFixture, 'dataref');
    expect(toDataRefDescriptor(raw)).toEqual({
      id: 9952311,
      name: 'sim/cockpit2/gauges/actuators/radio_altimeter_bug_ft_pilot',
      valueType: 'float',
    });
  });

  it('parses a list response with large ids', () => {
    const raw = parseWith(dataRefListResponseSchema, dataRefListFixture, 'datarefs');
    expect(raw.data).toHaveLength(2);
    expect(raw.data[1]?.id).toBe(1253033683792);
    expect(raw.data[1]?.value_type).toBe('float_array');
  });

  it.each([
    [{ id: '1', name: 'x', value_type: 'float' }, 'string id'],
    [{ id: 1.5, name: 'x', value_type: 'float' }, 'fractional id'],
    [{ id: 1, value_type: 'float' }, 'missing name'],
    [{ id: 1, name: 'x', value_type: 'string' }, 'unknown value_type'],
  ])('rejects %j (%s)', (payload) => {
    expect(dataRefSchema.safeParse(payload).success).toBe(false);
  });
});

describe('dataref value contract', () => {
  it.each([
    [{ data: 124.3 }, 124.3],
    [{ data: 7 }, 7],
    [{ data: [1, 2, 3] }, [1, 2, 3]],
    [{ data: 'U29tZSBkYXRh' }, 'U29tZSBkYXRh'],
  ])('accepts %j', (payload, expected) => {
    expect(parseWith(dataRefValueResponseSchema, payload, 'value').data).toEqual(expected);
  });

  it.each([[{ data: null }], [{ data: { nested: 1 } }], [{ data: [1, 'a'] }], [{}]])(
    'rejects %j',
    (payload) => {
      expect(dataRefValueResponseSchema.safeParse(payload).success).toBe(false);
    },
  );
});

describe('command contract', () => {
  it('parses the documented command', () => {
    const raw = parseWith(commandSchema, commandFixture, 'command');
    expect(toCommandDescriptor(raw)).toEqual({
      id: 2991,
      name: 'sim/developer/toggle_autopilot_constants',
      description: 'Toggle the autopilot constants window.',
    });
  });

  it('tolerates a missing description by defaulting to an empty string', () => {
    const raw = parseWith(commandSchema, { id: 1, name: 'sim/x' }, 'command');
    expect(toCommandDescriptor(raw).description).toBe('');
  });
});

describe('count and error contracts', () => {
  it('parses a count', () => {
    expect(parseWith(countResponseSchema, { data: 9554 }, 'count').data).toBe(9554);
  });

  it('parses the documented error payload', () => {
    expect(errorPayloadSchema.safeParse(errorFixture)).toMatchObject({
      success: true,
      data: { error_code: 'index_out_of_range', error_message: 'Index is out of range' },
    });
  });

  it('rejects an error payload without error_code', () => {
    expect(errorPayloadSchema.safeParse({ error_message: 'x' }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Write the WebSocket contract tests**

`tests/contract/websocket-schemas.test.ts`:

```ts
import { toDataRefUpdates } from '@/infrastructure/xplane/schemas/mappers';
import {
  commandUpdateMessageSchema,
  dataRefUpdateMessageSchema,
  incomingEnvelopeSchema,
  resultMessageSchema,
} from '@/infrastructure/xplane/schemas/websocket';
import commandUpdateFixture from '../fixtures/ws-command-update.json';
import dataRefUpdateFixture from '../fixtures/ws-dataref-update.json';
import resultErrorFixture from '../fixtures/ws-result-error.json';
import resultOkFixture from '../fixtures/ws-result-ok.json';

describe('websocket envelope', () => {
  it('extracts the type from any object with a string type', () => {
    expect(incomingEnvelopeSchema.parse({ type: 'whatever', extra: 1 })).toEqual({
      type: 'whatever',
    });
  });

  it('rejects messages without a string type', () => {
    expect(incomingEnvelopeSchema.safeParse({ req_id: 1 }).success).toBe(false);
    expect(incomingEnvelopeSchema.safeParse('text').success).toBe(false);
  });
});

describe('result messages', () => {
  it('parses success', () => {
    expect(resultMessageSchema.parse(resultOkFixture)).toEqual({
      req_id: 123,
      type: 'result',
      success: true,
    });
  });

  it('parses failure with error fields', () => {
    expect(resultMessageSchema.parse(resultErrorFixture)).toEqual({
      req_id: 123,
      type: 'result',
      success: false,
      error_code: 'index_out_of_range',
      error_message: 'Index is out of range',
    });
  });

  it('rejects a result without req_id or without success', () => {
    expect(resultMessageSchema.safeParse({ type: 'result', success: true }).success).toBe(false);
    expect(resultMessageSchema.safeParse({ type: 'result', req_id: 1 }).success).toBe(false);
  });
});

describe('dataref update messages', () => {
  it('parses the documented update and maps keys to numeric ids, trimming whitespace', () => {
    const message = dataRefUpdateMessageSchema.parse(dataRefUpdateFixture);
    const updates = toDataRefUpdates(message.data, 1000);
    expect(updates).toEqual([
      { id: 88491, value: 0, receivedAt: 1000 },
      { id: 3994, value: 5, receivedAt: 1000 },
      { id: 199, value: [0, 0, 0, 4], receivedAt: 1000 },
    ]);
  });

  it('drops keys that are not numeric', () => {
    expect(toDataRefUpdates({ abc: 1, '5': 2 }, 0)).toEqual([{ id: 5, value: 2, receivedAt: 0 }]);
  });

  it('accepts base64 string values', () => {
    expect(
      dataRefUpdateMessageSchema.safeParse({ type: 'dataref_update_values', data: { '1': 'QQ==' } })
        .success,
    ).toBe(true);
  });

  it('rejects non-value entries', () => {
    expect(
      dataRefUpdateMessageSchema.safeParse({ type: 'dataref_update_values', data: { '1': null } })
        .success,
    ).toBe(false);
    expect(dataRefUpdateMessageSchema.safeParse({ type: 'dataref_update_values' }).success).toBe(
      false,
    );
  });
});

describe('command update messages', () => {
  it('parses the documented payload', () => {
    expect(commandUpdateMessageSchema.parse(commandUpdateFixture).data).toEqual({
      '88491': false,
      '3994': false,
      '199': true,
    });
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx jest tests/contract`
Expected: FAIL, modules not found.

- [ ] **Step 5: Implement `src/infrastructure/xplane/schemas/rest.ts`**

```ts
import { z } from 'zod';

import { DATAREF_VALUE_TYPES } from '@/domain/simulator/types';

export const capabilitiesResponseSchema = z.object({
  api: z.object({ versions: z.array(z.string()) }),
  'x-plane': z.object({ version: z.string() }),
});
export type RawCapabilities = z.infer<typeof capabilitiesResponseSchema>;

const idSchema = z.number().int().nonnegative();

export const dataRefSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  value_type: z.enum(DATAREF_VALUE_TYPES),
});
export type RawDataRef = z.infer<typeof dataRefSchema>;

export const commandSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().optional(),
});
export type RawCommand = z.infer<typeof commandSchema>;

export const dataRefListResponseSchema = z.object({ data: z.array(dataRefSchema) });
export const commandListResponseSchema = z.object({ data: z.array(commandSchema) });

export const dataRefValueSchema = z.union([z.number(), z.array(z.number()), z.string()]);
export const dataRefValueResponseSchema = z.object({ data: dataRefValueSchema });

export const countResponseSchema = z.object({ data: z.number().int() });

export const errorPayloadSchema = z.object({
  error_code: z.string(),
  error_message: z.string().optional(),
});
export type RawErrorPayload = z.infer<typeof errorPayloadSchema>;
```

- [ ] **Step 6: Implement `src/infrastructure/xplane/schemas/websocket.ts`**

```ts
import { z } from 'zod';

import { dataRefValueSchema } from '@/infrastructure/xplane/schemas/rest';

export const incomingEnvelopeSchema = z.object({ type: z.string() });

export const resultMessageSchema = z.object({
  req_id: z.number().int(),
  type: z.literal('result'),
  success: z.boolean(),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
});
export type ResultMessage = z.infer<typeof resultMessageSchema>;

export const dataRefUpdateMessageSchema = z.object({
  type: z.literal('dataref_update_values'),
  data: z.record(z.string(), dataRefValueSchema),
});
export type DataRefUpdateMessage = z.infer<typeof dataRefUpdateMessageSchema>;

export const commandUpdateMessageSchema = z.object({
  type: z.literal('command_update_is_active'),
  data: z.record(z.string(), z.boolean()),
});
export type CommandUpdateMessage = z.infer<typeof commandUpdateMessageSchema>;

export type OutgoingMessageType =
  | 'dataref_subscribe_values'
  | 'dataref_unsubscribe_values'
  | 'dataref_set_values'
  | 'command_subscribe_is_active'
  | 'command_unsubscribe_is_active'
  | 'command_set_is_active';

export interface OutgoingMessage {
  req_id: number;
  type: OutgoingMessageType;
  params: Record<string, unknown>;
}
```

- [ ] **Step 7: Implement `src/infrastructure/xplane/schemas/mappers.ts`**

```ts
import type { ZodType } from 'zod';

import { AvionixError } from '@/domain/errors/avionix-error';
import { isApiVersion } from '@/domain/simulator/api-version';
import type {
  CommandDescriptor,
  DataRefDescriptor,
  DataRefUpdate,
  DataRefValue,
  SimulatorCapabilities,
} from '@/domain/simulator/types';
import type {
  RawCapabilities,
  RawCommand,
  RawDataRef,
} from '@/infrastructure/xplane/schemas/rest';

export function parseWith<T>(schema: ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
  throw new AvionixError({
    code: 'INVALID_RESPONSE',
    message: `Unexpected ${context} payload from X-Plane (${detail})`,
    cause: result.error,
  });
}

export function toSimulatorCapabilities(raw: RawCapabilities): SimulatorCapabilities {
  return {
    simulatorVersion: raw['x-plane'].version,
    supportedApiVersions: raw.api.versions.filter(isApiVersion),
    rawApiVersions: [...raw.api.versions],
  };
}

export function toDataRefDescriptor(raw: RawDataRef): DataRefDescriptor {
  return { id: raw.id, name: raw.name, valueType: raw.value_type };
}

export function toCommandDescriptor(raw: RawCommand): CommandDescriptor {
  return { id: raw.id, name: raw.name, description: raw.description ?? '' };
}

export function toDataRefUpdates(
  data: Record<string, DataRefValue>,
  receivedAt: number,
): DataRefUpdate[] {
  const updates: DataRefUpdate[] = [];
  for (const [key, value] of Object.entries(data)) {
    const trimmed = key.trim();
    if (!/^\d+$/.test(trimmed)) {
      continue;
    }
    updates.push({ id: Number(trimmed), value, receivedAt });
  }
  return updates;
}
```

- [ ] **Step 8: Run, verify, commit**

```bash
npx jest tests/contract
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(xplane): add zod schemas, domain mappers and contract tests from the official payloads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

If `z.enum(DATAREF_VALUE_TYPES)` fails to typecheck because zod 4 wants a tuple, replace it with `z.enum(['float', 'double', 'int', 'int_array', 'float_array', 'data'])` and keep `DATAREF_VALUE_TYPES` for runtime use elsewhere.

---

### Task 5: HTTP transport

**Files:**
- Create: `src/infrastructure/xplane/http/query-string.ts`, `src/infrastructure/xplane/http/error-mapping.ts`, `src/infrastructure/xplane/http/http-transport.ts`
- Test: `tests/unit/infrastructure/query-string.test.ts`, `tests/unit/infrastructure/error-mapping.test.ts`, `tests/unit/infrastructure/http-transport.test.ts`

**Interfaces:**
- Consumes: `AvionixError`, `parseWith`, `errorPayloadSchema`, `Logger`.
- Produces:
  - `type QueryParams = Record<string, string | number | ReadonlyArray<string | number> | undefined>`; `buildQueryString(query: QueryParams): string` (returns `''` or `'?a=1&filter[name]=x'`)
  - `simulatorErrorToAvionixError(input: { errorCode: string; errorMessage?: string; httpStatus?: number; cause?: unknown }): AvionixError`
  - `type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponseLike>`; `interface FetchInit { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }`; `interface FetchResponseLike { status: number; ok: boolean; text(): Promise<string> }`
  - `class HttpTransport { constructor(options: { origin: string; fetchImpl?: FetchLike; defaultTimeoutMs?: number; logger?: Logger }); request(req: HttpRequest<void>): Promise<void>; request<T>(req: HttpRequest<T> & { schema: ZodType<T> }): Promise<T> }` with `interface HttpRequest<T> { method: 'GET' | 'POST' | 'PATCH'; path: string; query?: QueryParams; body?: unknown; schema?: ZodType<T>; timeoutMs?: number }`

- [ ] **Step 1: Write the query string and error mapping tests**

`tests/unit/infrastructure/query-string.test.ts`:

```ts
import { buildQueryString } from '@/infrastructure/xplane/http/query-string';

describe('buildQueryString', () => {
  it('returns an empty string for no params', () => {
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ a: undefined })).toBe('');
  });

  it('keeps X-Plane filter brackets readable and encodes values', () => {
    expect(buildQueryString({ 'filter[name]': 'sim/cockpit2/a b' })).toBe(
      '?filter[name]=sim%2Fcockpit2%2Fa%20b',
    );
  });

  it('repeats array params', () => {
    expect(buildQueryString({ 'filter[name]': ['a', 'b'], limit: 2 })).toBe(
      '?filter[name]=a&filter[name]=b&limit=2',
    );
  });
});
```

`tests/unit/infrastructure/error-mapping.test.ts`:

```ts
import { simulatorErrorToAvionixError } from '@/infrastructure/xplane/http/error-mapping';

describe('simulatorErrorToAvionixError', () => {
  it.each([
    ['invalid_dataref_name', 'DATAREF_NOT_FOUND'],
    ['invalid_dataref_id', 'DATAREF_NOT_FOUND'],
    ['invalid_command_name', 'COMMAND_NOT_FOUND'],
    ['invalid_command_id', 'COMMAND_NOT_FOUND'],
    ['dataref_is_readonly', 'DATAREF_READONLY'],
    ['index_out_of_range', 'SIMULATOR_ERROR'],
    ['unknown_type', 'SIMULATOR_ERROR'],
    ['something_new', 'SIMULATOR_ERROR'],
  ])('maps %s to %s', (errorCode, expected) => {
    const error = simulatorErrorToAvionixError({ errorCode, errorMessage: 'msg' });
    expect(error.code).toBe(expected);
    expect(error.simulatorErrorCode).toBe(errorCode);
    expect(error.message).toBe('msg');
    expect(error.retryable).toBe(false);
  });

  it('falls back to the error code as message when the message is missing', () => {
    expect(simulatorErrorToAvionixError({ errorCode: 'invalid_body' }).message).toBe(
      'X-Plane error: invalid_body',
    );
  });
});
```

- [ ] **Step 2: Implement `query-string.ts` and `error-mapping.ts`**

`src/infrastructure/xplane/http/query-string.ts`:

```ts
export type QueryParams = Record<string, string | number | ReadonlyArray<string | number> | undefined>;

function encodeKey(key: string): string {
  // X-Plane documents keys like filter[name]; keep the brackets readable.
  return encodeURIComponent(key).replace(/%5B/gi, '[').replace(/%5D/gi, ']');
}

export function buildQueryString(query: QueryParams): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined) {
      continue;
    }
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      parts.push(`${encodeKey(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}
```

`src/infrastructure/xplane/http/error-mapping.ts`:

```ts
import { AvionixError, type AvionixErrorCode } from '@/domain/errors/avionix-error';

const CODE_MAP: Readonly<Record<string, AvionixErrorCode>> = {
  invalid_dataref_name: 'DATAREF_NOT_FOUND',
  invalid_dataref_id: 'DATAREF_NOT_FOUND',
  invalid_command_name: 'COMMAND_NOT_FOUND',
  invalid_command_id: 'COMMAND_NOT_FOUND',
  dataref_is_readonly: 'DATAREF_READONLY',
};

export function simulatorErrorToAvionixError(input: {
  errorCode: string;
  errorMessage?: string;
  httpStatus?: number;
  cause?: unknown;
}): AvionixError {
  return new AvionixError({
    code: CODE_MAP[input.errorCode] ?? 'SIMULATOR_ERROR',
    message: input.errorMessage ?? `X-Plane error: ${input.errorCode}`,
    retryable: false,
    simulatorErrorCode: input.errorCode,
    cause: input.cause ?? (input.httpStatus === undefined ? undefined : { httpStatus: input.httpStatus }),
  });
}
```

Run: `npx jest tests/unit/infrastructure/query-string.test.ts tests/unit/infrastructure/error-mapping.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the HTTP transport tests**

`tests/unit/infrastructure/http-transport.test.ts`:

```ts
import { z } from 'zod';

import { isAvionixError } from '@/domain/errors/avionix-error';
import {
  type FetchInit,
  type FetchLike,
  HttpTransport,
} from '@/infrastructure/xplane/http/http-transport';
import { silentLogger } from '@/infrastructure/logging/logger';

interface Call {
  url: string;
  init: FetchInit;
}

function fakeFetch(
  responder: (call: Call) => Promise<{ status: number; body: string }> | { status: number; body: string },
): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const { status, body } = await responder(call);
    return { status, ok: status >= 200 && status < 300, text: async () => body };
  };
  return { fetchImpl, calls };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error('expected rejection');
  } catch (error) {
    expect(isAvionixError(error) ? error.code : `not avionix: ${String(error)}`).toBe(code);
  }
}

const schema = z.object({ data: z.number() });

function transport(fetchImpl: FetchLike, defaultTimeoutMs = 5000): HttpTransport {
  return new HttpTransport({
    origin: 'http://192.168.1.100:8086',
    fetchImpl,
    defaultTimeoutMs,
    logger: silentLogger,
  });
}

describe('HttpTransport', () => {
  it('sends JSON headers, builds the URL with query and validates the response', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: '{"data": 42}' }));
    const result = await transport(fetchImpl).request({
      method: 'GET',
      path: '/api/v3/datarefs',
      query: { 'filter[name]': 'sim/x' },
      schema,
    });
    expect(result).toEqual({ data: 42 });
    expect(calls[0]?.url).toBe('http://192.168.1.100:8086/api/v3/datarefs?filter[name]=sim%2Fx');
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('serializes the body for PATCH and accepts an empty 200 response without a schema', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: '' }));
    await expect(
      transport(fetchImpl).request({ method: 'PATCH', path: '/api/v3/datarefs/1/value', body: { data: 3 } }),
    ).resolves.toBeUndefined();
    expect(calls[0]?.init.body).toBe('{"data":3}');
  });

  it('rejects with INVALID_RESPONSE when a schema is given and the body is empty', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 200, body: '' }));
    await expectCode(transport(fetchImpl).request({ method: 'GET', path: '/x', schema }), 'INVALID_RESPONSE');
  });

  it('rejects with INVALID_RESPONSE on malformed JSON', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 200, body: '{not json' }));
    await expectCode(transport(fetchImpl).request({ method: 'GET', path: '/x', schema }), 'INVALID_RESPONSE');
  });

  it('rejects with INVALID_RESPONSE when the schema does not match', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 200, body: '{"data":"str"}' }));
    await expectCode(transport(fetchImpl).request({ method: 'GET', path: '/x', schema }), 'INVALID_RESPONSE');
  });

  it('maps an X-Plane error payload to a simulator error with the X-Plane code', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 404,
      body: '{"error_code":"invalid_dataref_name","error_message":"Dataref x doesn\'t exist"}',
    }));
    try {
      await transport(fetchImpl).request({ method: 'GET', path: '/x', schema });
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('DATAREF_NOT_FOUND');
      expect(isAvionixError(error) && error.simulatorErrorCode).toBe('invalid_dataref_name');
    }
  });

  it('maps a plain 403 to INCOMING_TRAFFIC_DISABLED', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 403, body: '' }));
    await expectCode(transport(fetchImpl).request({ method: 'GET', path: '/x', schema }), 'INCOMING_TRAFFIC_DISABLED');
  });

  it('maps other non-2xx without payload to HTTP_ERROR, retryable for 5xx', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 503, body: 'Service Unavailable' }));
    try {
      await transport(fetchImpl).request({ method: 'GET', path: '/x', schema });
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('HTTP_ERROR');
      expect(isAvionixError(error) && error.retryable).toBe(true);
      expect(isAvionixError(error) && error.message).toContain('503');
    }
  });

  it('maps a 404 without payload to HTTP_ERROR (not retryable)', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 404, body: 'Not Found' }));
    try {
      await transport(fetchImpl).request({ method: 'GET', path: '/x', schema });
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('HTTP_ERROR');
      expect(isAvionixError(error) && error.retryable).toBe(false);
    }
  });

  it('maps fetch rejection to NETWORK_ERROR', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Network request failed');
    };
    await expectCode(transport(fetchImpl).request({ method: 'GET', path: '/x', schema }), 'NETWORK_ERROR');
  });

  it('aborts after the timeout and rejects with TIMEOUT', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      const pending = transport(fetchImpl, 1000).request({ method: 'GET', path: '/x', schema });
      const assertion = expectCode(pending, 'TIMEOUT');
      await jest.advanceTimersByTimeAsync(1001);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('honours a per-request timeout override', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      const pending = transport(fetchImpl, 5000).request({ method: 'GET', path: '/x', schema, timeoutMs: 100 });
      const assertion = expectCode(pending, 'TIMEOUT');
      await jest.advanceTimersByTimeAsync(101);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx jest tests/unit/infrastructure/http-transport.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 5: Implement `src/infrastructure/xplane/http/http-transport.ts`**

```ts
import type { ZodType } from 'zod';

import { AvionixError } from '@/domain/errors/avionix-error';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import { simulatorErrorToAvionixError } from '@/infrastructure/xplane/http/error-mapping';
import { type QueryParams, buildQueryString } from '@/infrastructure/xplane/http/query-string';
import { parseWith } from '@/infrastructure/xplane/schemas/mappers';
import { errorPayloadSchema } from '@/infrastructure/xplane/schemas/rest';

export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

export interface FetchResponseLike {
  status: number;
  ok: boolean;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponseLike>;

export interface HttpRequest<T> {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  query?: QueryParams;
  body?: unknown;
  schema?: ZodType<T>;
  timeoutMs?: number;
}

export interface HttpTransportOptions {
  origin: string;
  fetchImpl?: FetchLike;
  defaultTimeoutMs?: number;
  logger?: Logger;
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export class HttpTransport {
  private readonly origin: string;
  private readonly fetchImpl: FetchLike;
  private readonly defaultTimeoutMs: number;
  private readonly logger: Logger;

  constructor(options: HttpTransportOptions) {
    this.origin = options.origin;
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.logger = options.logger ?? silentLogger;
  }

  request(req: HttpRequest<void> & { schema?: undefined }): Promise<void>;
  request<T>(req: HttpRequest<T> & { schema: ZodType<T> }): Promise<T>;
  async request<T>(req: HttpRequest<T>): Promise<T | void> {
    const url = `${this.origin}${req.path}${buildQueryString(req.query ?? {})}`;
    const controller = new AbortController();
    const timeoutMs = req.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const init: FetchInit = {
      method: req.method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: controller.signal,
    };
    if (req.body !== undefined) {
      init.body = JSON.stringify(req.body);
    }
    this.logger.debug('request', { method: req.method, url });

    let response: FetchResponseLike;
    let text: string;
    try {
      response = await this.fetchImpl(url, init);
      text = await response.text();
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new AvionixError({
          code: 'TIMEOUT',
          message: `X-Plane did not answer ${req.method} ${req.path} within ${timeoutMs} ms`,
          retryable: true,
          cause: error,
        });
      }
      throw new AvionixError({
        code: 'NETWORK_ERROR',
        message: `Could not reach X-Plane at ${this.origin}`,
        retryable: true,
        cause: error,
      });
    }
    clearTimeout(timer);
    this.logger.debug('response', { status: response.status, url });

    if (!response.ok) {
      throw this.toHttpError(response.status, text, req);
    }
    if (req.schema === undefined) {
      return undefined;
    }
    if (text.trim().length === 0) {
      throw new AvionixError({
        code: 'INVALID_RESPONSE',
        message: `X-Plane returned an empty body for ${req.method} ${req.path}`,
      });
    }
    const parsed = parseJsonText(text);
    if (!parsed.ok) {
      throw new AvionixError({
        code: 'INVALID_RESPONSE',
        message: `X-Plane returned malformed JSON for ${req.method} ${req.path}`,
      });
    }
    return parseWith(req.schema, parsed.value, `${req.method} ${req.path}`);
  }

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
    if (status === 403) {
      return new AvionixError({
        code: 'INCOMING_TRAFFIC_DISABLED',
        message:
          'X-Plane refused the request (HTTP 403). In X-Plane, open Settings > Network and ' +
          'make sure "Disable Incoming Traffic" is not selected.',
      });
    }
    return new AvionixError({
      code: 'HTTP_ERROR',
      message: `X-Plane answered HTTP ${status} for ${req.method} ${req.path}`,
      retryable: status >= 500,
    });
  }
}
```

- [ ] **Step 6: Run, verify, commit**

```bash
npx jest tests/unit/infrastructure
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(xplane): add HTTP transport with timeout, error normalization and response validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Mock X-Plane server for tests

**Files:**
- Create: `tests/mock-xplane/mock-xplane-server.ts`
- Test: `tests/integration/mock-xplane-server.test.ts`

**Interfaces:**
- Consumes: `DataRefValue`, `DataRefValueType` from domain (types only).
- Produces:
  - `interface MockDataRef { id: number; name: string; valueType: DataRefValueType; value: DataRefValue; writable?: boolean }`
  - `interface MockCommand { id: number; name: string; description: string }`
  - `interface MockXPlaneOptions { apiVersions?: string[]; xplaneVersion?: string; capabilitiesMode?: 'ok' | 'not_found'; dataRefs?: MockDataRef[]; commands?: MockCommand[]; updateIntervalMs?: number }`
  - `class MockXPlaneServer { static start(options?): Promise<MockXPlaneServer>; readonly host: string; readonly port: number; incomingTrafficDisabled: boolean; pauseReplies: boolean; readonly writes: Array<{ id: number; value: DataRefValue; index?: number }>; readonly activations: Array<{ id: number; duration: number }>; readonly receivedMessages: unknown[]; get connectionCount(): number; setDataRefValue(name: string, value: DataRefValue): void; sendRawToAll(text: string): void; closeAllSockets(code?: number): void; terminateAllSockets(): void; stop(): Promise<void> }`
  - `DEFAULT_MOCK_DATAREFS`, `DEFAULT_MOCK_COMMANDS` matching the MVP names.

- [ ] **Step 1: Write the mock server**

`tests/mock-xplane/mock-xplane-server.ts`:

```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { WebSocket as WsSocket, WebSocketServer } from 'ws';

import type { DataRefValue, DataRefValueType } from '@/domain/simulator/types';

export interface MockDataRef {
  id: number;
  name: string;
  valueType: DataRefValueType;
  value: DataRefValue;
  writable?: boolean;
}

export interface MockCommand {
  id: number;
  name: string;
  description: string;
}

export interface MockXPlaneOptions {
  apiVersions?: string[];
  xplaneVersion?: string;
  capabilitiesMode?: 'ok' | 'not_found';
  dataRefs?: MockDataRef[];
  commands?: MockCommand[];
  updateIntervalMs?: number;
}

export const DEFAULT_MOCK_DATAREFS: MockDataRef[] = [
  { id: 1001, name: 'sim/time/total_running_time_sec', valueType: 'float', value: 12.5 },
  {
    id: 1002,
    name: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
    valueType: 'float',
    value: 0,
  },
  {
    id: 1003,
    name: 'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
    valueType: 'float',
    value: 270,
    writable: true,
  },
  { id: 1004, name: 'sim/flightmodel/weight/m_fuel', valueType: 'float_array', value: [10, 20, 30] },
  { id: 1005, name: 'sim/aircraft/view/acf_tailnum', valueType: 'data', value: 'TklsNzc=' },
];

export const DEFAULT_MOCK_COMMANDS: MockCommand[] = [
  { id: 2001, name: 'sim/autopilot/heading_up', description: 'Autopilot heading up.' },
  { id: 2002, name: 'sim/operation/pause_toggle', description: 'Pause the simulation.' },
];

interface JsonError {
  status: number;
  error_code: string;
  error_message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonError(value: unknown): value is JsonError {
  return (
    isRecord(value) &&
    typeof value.status === 'number' &&
    typeof value.error_code === 'string' &&
    typeof value.error_message === 'string'
  );
}

function isDataRefValue(value: unknown): value is DataRefValue {
  return (
    typeof value === 'number' ||
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'number'))
  );
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export class MockXPlaneServer {
  readonly writes: Array<{ id: number; value: DataRefValue; index?: number }> = [];
  readonly activations: Array<{ id: number; duration: number }> = [];
  readonly receivedMessages: unknown[] = [];
  incomingTrafficDisabled = false;
  /** When true, WebSocket requests are recorded but never answered (for cancellation tests). */
  pauseReplies = false;

  private readonly apiVersions: string[];
  private readonly xplaneVersion: string;
  private readonly capabilitiesMode: 'ok' | 'not_found';
  private readonly dataRefs: Map<number, MockDataRef>;
  private readonly commands: Map<number, MockCommand>;
  private readonly sockets = new Set<WsSocket>();
  private readonly subscriptions = new Map<WsSocket, Map<number, string>>();
  private readonly timer: NodeJS.Timeout;

  private constructor(
    private readonly server: http.Server,
    private readonly wss: WebSocketServer,
    options: MockXPlaneOptions,
  ) {
    this.apiVersions = options.apiVersions ?? ['v1', 'v2', 'v3'];
    this.xplaneVersion = options.xplaneVersion ?? '12.4.0';
    this.capabilitiesMode = options.capabilitiesMode ?? 'ok';
    this.dataRefs = new Map(
      (options.dataRefs ?? DEFAULT_MOCK_DATAREFS).map((d) => [d.id, { ...d }]),
    );
    this.commands = new Map((options.commands ?? DEFAULT_MOCK_COMMANDS).map((c) => [c.id, c]));
    this.timer = setInterval(() => this.pushUpdates(), options.updateIntervalMs ?? 20);
    this.timer.unref();
  }

  static start(options: MockXPlaneOptions = {}): Promise<MockXPlaneServer> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      const wss = new WebSocketServer({ noServer: true });
      const instance = new MockXPlaneServer(server, wss, options);
      server.on('request', (req, res) => {
        instance.handleHttp(req, res).catch((error: unknown) => {
          res.writeHead(500).end(String(error));
        });
      });
      server.on('upgrade', (req, socket, head) => instance.handleUpgrade(req, socket, head));
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(instance));
    });
  }

  get host(): string {
    return '127.0.0.1';
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  get connectionCount(): number {
    return this.sockets.size;
  }

  getDataRefByName(name: string): MockDataRef | undefined {
    return [...this.dataRefs.values()].find((d) => d.name === name);
  }

  setDataRefValue(name: string, value: DataRefValue): void {
    const dataRef = this.getDataRefByName(name);
    if (dataRef === undefined) {
      throw new Error(`mock dataref ${name} not defined`);
    }
    dataRef.value = value;
  }

  sendRawToAll(text: string): void {
    for (const socket of this.sockets) {
      socket.send(text);
    }
  }

  closeAllSockets(code = 1001): void {
    for (const socket of this.sockets) {
      socket.close(code, 'mock close');
    }
  }

  terminateAllSockets(): void {
    for (const socket of this.sockets) {
      socket.terminate();
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.terminateAllSockets();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // ---- HTTP -------------------------------------------------------------

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    if (this.incomingTrafficDisabled) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (url.pathname === '/api/capabilities' && method === 'GET') {
        if (this.capabilitiesMode === 'not_found') {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
          return;
        }
        this.json(res, 200, {
          api: { versions: this.apiVersions },
          'x-plane': { version: this.xplaneVersion },
        });
        return;
      }
      const versioned = /^\/api\/(v\d)(\/.*)$/.exec(url.pathname);
      if (versioned === null) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
        return;
      }
      const [, version, rest] = versioned;
      if (version === undefined || rest === undefined || !this.apiVersions.includes(version)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
        return;
      }
      await this.handleVersioned(method, rest, url, req, res);
    } catch (error) {
      if (isJsonError(error)) {
        this.json(res, error.status, {
          error_code: error.error_code,
          error_message: error.error_message,
        });
        return;
      }
      throw error;
    }
  }

  private async handleVersioned(
    method: string,
    path: string,
    url: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (path === '/datarefs' && method === 'GET') {
      const names = url.searchParams.getAll('filter[name]');
      const all = [...this.dataRefs.values()];
      const selected = names.length === 0 ? all : all.filter((d) => names.includes(d.name));
      const missing = names.find((name) => !all.some((d) => d.name === name));
      if (missing !== undefined) {
        this.fail(404, 'invalid_dataref_name', `Dataref ${missing} doesn't exist`);
      }
      this.json(res, 200, {
        data: selected.map((d) => ({ id: d.id, name: d.name, value_type: d.valueType })),
      });
      return;
    }
    if (path === '/datarefs/count' && method === 'GET') {
      this.json(res, 200, { data: this.dataRefs.size });
      return;
    }
    const valueMatch = /^\/datarefs\/(\d+)\/value$/.exec(path);
    if (valueMatch !== null) {
      const id = Number(valueMatch[1]);
      const dataRef = this.dataRefs.get(id);
      if (dataRef === undefined) {
        this.fail(404, 'invalid_dataref_id', `Dataref ${id} doesn't exist`);
      }
      const indexParam = url.searchParams.get('index');
      const index = indexParam === null ? undefined : Number(indexParam);
      if (method === 'GET') {
        this.json(res, 200, { data: this.readValue(dataRef, index) });
        return;
      }
      if (method === 'PATCH') {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          this.fail(400, 'invalid_body', 'The request body is not valid JSON');
        }
        if (!isRecord(parsed) || !isDataRefValue(parsed.data)) {
          this.fail(400, 'invalid_body', 'The request body is not valid JSON');
        }
        this.writeValue(dataRef, parsed.data, index);
        this.writes.push(index === undefined ? { id, value: parsed.data } : { id, value: parsed.data, index });
        res.writeHead(200).end();
        return;
      }
    }
    if (path === '/commands' && method === 'GET') {
      const names = url.searchParams.getAll('filter[name]');
      const all = [...this.commands.values()];
      const selected = names.length === 0 ? all : all.filter((c) => names.includes(c.name));
      const missing = names.find((name) => !all.some((c) => c.name === name));
      if (missing !== undefined) {
        this.fail(404, 'invalid_command_name', `Command ${missing} doesn't exist`);
      }
      this.json(res, 200, { data: selected });
      return;
    }
    if (path === '/commands/count' && method === 'GET') {
      this.json(res, 200, { data: this.commands.size });
      return;
    }
    const activateMatch = /^\/command\/(\d+)\/activate$/.exec(path);
    if (activateMatch !== null && method === 'POST') {
      const id = Number(activateMatch[1]);
      if (!this.commands.has(id)) {
        this.fail(404, 'invalid_command_id', `Command ${id} doesn't exist`);
      }
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        this.fail(400, 'invalid_body', 'The request body is not valid JSON');
      }
      if (!isRecord(parsed) || !('duration' in parsed)) {
        this.fail(400, 'duration_missing', 'Missing duration parameter');
      }
      const duration = parsed.duration;
      if (typeof duration !== 'number' || duration < 0 || duration > 10) {
        this.fail(400, 'duration_out_of_range', 'Duration is out of valid range.');
      }
      this.activations.push({ id, duration });
      this.applyCommand(id);
      res.writeHead(200).end();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
  }

  private readValue(dataRef: MockDataRef, index: number | undefined): DataRefValue {
    if (index === undefined) {
      return dataRef.value;
    }
    if (!Array.isArray(dataRef.value)) {
      this.fail(400, 'not_an_array', 'An index was provided but the dataref is not an array');
    }
    const item = dataRef.value[index];
    if (item === undefined) {
      this.fail(400, 'index_out_of_range', 'Dataref array index out of range');
    }
    return item;
  }

  private writeValue(dataRef: MockDataRef, value: DataRefValue, index: number | undefined): void {
    if (dataRef.writable !== true) {
      this.fail(403, 'dataref_is_readonly', 'Attempted to write to a read-only dataref');
    }
    if (index !== undefined) {
      if (!Array.isArray(dataRef.value)) {
        this.fail(400, 'not_an_array', 'An index was provided but the dataref is not an array');
      }
      if (typeof value !== 'number' || dataRef.value[index] === undefined) {
        this.fail(400, 'index_out_of_range', 'Dataref array index out of range');
      }
      dataRef.value = dataRef.value.map((item, i) => (i === index ? value : item));
      return;
    }
    if (Array.isArray(dataRef.value) !== Array.isArray(value)) {
      this.fail(400, 'incompatible_data', 'Provided data does not match the dataref shape');
    }
    dataRef.value = value;
  }

  private applyCommand(id: number): void {
    const command = this.commands.get(id);
    if (command?.name === 'sim/autopilot/heading_up') {
      const heading = this.getDataRefByName('sim/cockpit2/autopilot/heading_dial_deg_mag_pilot');
      if (heading !== undefined && typeof heading.value === 'number') {
        heading.value = (heading.value + 1) % 360;
      }
    }
  }

  private json(res: http.ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
  }

  private fail(status: number, error_code: string, error_message: string): never {
    const error: JsonError = { status, error_code, error_message };
    throw error;
  }

  // ---- WebSocket --------------------------------------------------------

  private handleUpgrade(
    req: http.IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = /^\/api\/(v\d)$/.exec(url.pathname);
    const version = match?.[1];
    if (this.incomingTrafficDisabled || version === undefined || !this.apiVersions.includes(version)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.attach(ws));
  }

  private attach(ws: WsSocket): void {
    this.sockets.add(ws);
    this.subscriptions.set(ws, new Map());
    ws.on('message', (raw) => this.handleMessage(ws, raw.toString()));
    ws.on('close', () => {
      this.sockets.delete(ws);
      this.subscriptions.delete(ws);
    });
  }

  private handleMessage(ws: WsSocket, text: string): void {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    this.receivedMessages.push(message);
    if (this.pauseReplies) {
      return;
    }
    if (!isRecord(message) || typeof message.req_id !== 'number' || typeof message.type !== 'string') {
      return;
    }
    const reqId = message.req_id;
    const params = isRecord(message.params) ? message.params : {};
    const reply = (payload: Record<string, unknown>): void => {
      ws.send(JSON.stringify({ req_id: reqId, type: 'result', ...payload }));
    };
    const subs = this.subscriptions.get(ws) ?? new Map<number, string>();

    switch (message.type) {
      case 'dataref_subscribe_values': {
        const list = Array.isArray(params.datarefs) ? params.datarefs : [];
        for (const item of list) {
          const id = isRecord(item) && typeof item.id === 'number' ? item.id : Number.NaN;
          if (!this.dataRefs.has(id)) {
            reply({ success: false, error_code: 'invalid_dataref_id', error_message: `Dataref ${id} doesn't exist` });
            return;
          }
        }
        for (const item of list) {
          if (isRecord(item) && typeof item.id === 'number') {
            subs.set(item.id, '');
          }
        }
        reply({ success: true });
        return;
      }
      case 'dataref_unsubscribe_values': {
        if (params.datarefs === 'all') {
          subs.clear();
        } else if (Array.isArray(params.datarefs)) {
          for (const item of params.datarefs) {
            if (isRecord(item) && typeof item.id === 'number') {
              subs.delete(item.id);
            }
          }
        }
        reply({ success: true });
        return;
      }
      case 'dataref_set_values': {
        const list = Array.isArray(params.datarefs) ? params.datarefs : [];
        let failures = 0;
        for (const item of list) {
          if (!isRecord(item) || typeof item.id !== 'number' || !isDataRefValue(item.value)) {
            continue;
          }
          const dataRef = this.dataRefs.get(item.id);
          if (dataRef === undefined) {
            failures += 1;
            reply({ success: false, error_code: 'invalid_dataref_id', error_message: `Dataref ${item.id} doesn't exist` });
            continue;
          }
          dataRef.value = item.value;
          this.writes.push({ id: item.id, value: item.value });
        }
        if (failures === 0) {
          reply({ success: true });
        }
        return;
      }
      case 'command_subscribe_is_active':
      case 'command_unsubscribe_is_active':
        reply({ success: true });
        return;
      case 'command_set_is_active': {
        const list = Array.isArray(params.commands) ? params.commands : [];
        for (const item of list) {
          if (isRecord(item) && typeof item.id === 'number') {
            if (!this.commands.has(item.id)) {
              reply({ success: false, error_code: 'invalid_command_id', error_message: `Command ${item.id} doesn't exist` });
              return;
            }
            if (item.is_active === true) {
              this.activations.push({ id: item.id, duration: typeof item.duration === 'number' ? item.duration : -1 });
              this.applyCommand(item.id);
            }
          }
        }
        reply({ success: true });
        return;
      }
      default:
        reply({ success: false, error_code: 'unknown_type', error_message: `Unknown type ${message.type}` });
    }
  }

  private pushUpdates(): void {
    for (const [ws, subs] of this.subscriptions) {
      if (ws.readyState !== WsSocket.OPEN) {
        continue;
      }
      const data: Record<string, DataRefValue> = {};
      for (const [id, lastSent] of subs) {
        const dataRef = this.dataRefs.get(id);
        if (dataRef === undefined) {
          continue;
        }
        const serialized = JSON.stringify(dataRef.value);
        if (serialized !== lastSent) {
          data[String(id)] = dataRef.value;
          subs.set(id, serialized);
        }
      }
      if (Object.keys(data).length > 0) {
        ws.send(JSON.stringify({ type: 'dataref_update_values', data }));
      }
    }
  }
}
```

- [ ] **Step 2: Write a self-test for the mock using Node's fetch and WebSocket**

`tests/integration/mock-xplane-server.test.ts`:

```ts
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

function waitForMessage(socket: WebSocket, predicate: (msg: unknown) => boolean): Promise<unknown> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent): void => {
      const parsed: unknown = JSON.parse(String(event.data));
      if (predicate(parsed)) {
        socket.removeEventListener('message', handler);
        resolve(parsed);
      }
    };
    socket.addEventListener('message', handler);
  });
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => resolve(socket));
    socket.addEventListener('error', () => reject(new Error('socket error')));
  });
}

describe('MockXPlaneServer', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('serves capabilities, datarefs, values and commands over REST', async () => {
    const base = `http://${server.host}:${server.port}`;
    const caps = await (await fetch(`${base}/api/capabilities`)).json();
    expect(caps).toEqual({ api: { versions: ['v1', 'v2', 'v3'] }, 'x-plane': { version: '12.4.0' } });

    const list = await (
      await fetch(`${base}/api/v3/datarefs?filter[name]=sim/time/total_running_time_sec`)
    ).json();
    expect(list).toEqual({
      data: [{ id: 1001, name: 'sim/time/total_running_time_sec', value_type: 'float' }],
    });

    const missing = await fetch(`${base}/api/v3/datarefs?filter[name]=sim/nope`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error_code: 'invalid_dataref_name' });

    const value = await (await fetch(`${base}/api/v3/datarefs/1003/value`)).json();
    expect(value).toEqual({ data: 270 });

    const patch = await fetch(`${base}/api/v3/datarefs/1003/value`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 90 }),
    });
    expect(patch.status).toBe(200);
    expect(server.writes).toEqual([{ id: 1003, value: 90 }]);

    const readonly = await fetch(`${base}/api/v3/datarefs/1001/value`, {
      method: 'PATCH',
      body: JSON.stringify({ data: 1 }),
    });
    expect(readonly.status).toBe(403);
    expect(await readonly.json()).toMatchObject({ error_code: 'dataref_is_readonly' });

    const activate = await fetch(`${base}/api/v3/command/2001/activate`, {
      method: 'POST',
      body: JSON.stringify({ duration: 0 }),
    });
    expect(activate.status).toBe(200);
    expect(server.activations).toEqual([{ id: 2001, duration: 0 }]);
    expect(server.getDataRefByName('sim/cockpit2/autopilot/heading_dial_deg_mag_pilot')?.value).toBe(91);
  });

  it('returns a plain 403 everywhere when incoming traffic is disabled', async () => {
    server.incomingTrafficDisabled = true;
    const response = await fetch(`http://${server.host}:${server.port}/api/capabilities`);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
  });

  it('streams subscribed values with delta semantics over WebSocket', async () => {
    const socket = await openSocket(`ws://${server.host}:${server.port}/api/v3`);
    const result = waitForMessage(socket, (m) => (m as { type?: string }).type === 'result');
    socket.send(
      JSON.stringify({ req_id: 1, type: 'dataref_subscribe_values', params: { datarefs: [{ id: 1001 }, { id: 1003 }] } }),
    );
    expect(await result).toEqual({ req_id: 1, type: 'result', success: true });

    const first = await waitForMessage(socket, (m) => (m as { type?: string }).type === 'dataref_update_values');
    expect(first).toEqual({ type: 'dataref_update_values', data: { '1001': 12.5, '1003': 270 } });

    server.setDataRefValue('sim/time/total_running_time_sec', 13);
    const second = await waitForMessage(socket, (m) => (m as { type?: string }).type === 'dataref_update_values');
    expect(second).toEqual({ type: 'dataref_update_values', data: { '1001': 13 } });

    const unknown = waitForMessage(socket, (m) => (m as { req_id?: number }).req_id === 2);
    socket.send(JSON.stringify({ req_id: 2, type: 'bogus', params: {} }));
    expect(await unknown).toMatchObject({ success: false, error_code: 'unknown_type' });

    socket.close();
  });
});
```

- [ ] **Step 3: Run the mock self-test**

Run: `npx jest tests/integration/mock-xplane-server.test.ts`
Expected: PASS (3 tests). If `MessageEvent` is not a global type in the node project, replace the handler parameter type with `{ data: unknown }`.

- [ ] **Step 4: Full verification and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "test: add in-process mock X-Plane HTTP and WebSocket server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: WebSocket transport with request correlation

**Files:**
- Create: `src/infrastructure/xplane/websocket/request-manager.ts`, `src/infrastructure/xplane/websocket/websocket-transport.ts`
- Test: `tests/unit/infrastructure/request-manager.test.ts`, `tests/integration/websocket-transport.test.ts`

**Interfaces:**
- Consumes: `AvionixError`, `simulatorErrorToAvionixError`, schemas from Task 4, `Logger`, `MockXPlaneServer`, `DataRefUpdate`, `SocketCloseInfo`, `Unsubscribe`.
- Produces:
  - `class RequestManager { constructor(options: { defaultTimeoutMs: number; logger: Logger }); nextRequestId(): number; register(reqId: number, timeoutMs?: number): Promise<void>; settle(result: ResultMessage): boolean; rejectAll(error: AvionixError): void; get pendingCount(): number }`
  - `interface WebSocketLike { readonly readyState: number; onopen: OpenHandler | null; onclose: CloseHandler | null; onerror: ErrorHandler | null; onmessage: MessageHandler | null; send(data: string): void; close(code?: number, reason?: string): void }`; `type WebSocketFactory = (url: string) => WebSocketLike`; `defaultWebSocketFactory`
  - `class WebSocketTransport { constructor(options: { url: string; createSocket?: WebSocketFactory; connectTimeoutMs?: number; requestTimeoutMs?: number; logger?: Logger; now?: () => number }); connect(): Promise<void>; send(type: OutgoingMessageType, params: Record<string, unknown>, timeoutMs?: number): Promise<void>; close(): void; get isOpen(): boolean; onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void): Unsubscribe; onCommandUpdate(listener: (updates: Record<string, boolean>) => void): Unsubscribe; onClose(listener: (info: SocketCloseInfo) => void): Unsubscribe }`

- [ ] **Step 1: Write the RequestManager tests**

`tests/unit/infrastructure/request-manager.test.ts`:

```ts
import { AvionixError, isAvionixError } from '@/domain/errors/avionix-error';
import { createLogger, createMemorySink } from '@/infrastructure/logging/logger';
import { RequestManager } from '@/infrastructure/xplane/websocket/request-manager';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return isAvionixError(error) ? error.code : 'not avionix';
  }
}

function manager(defaultTimeoutMs = 5000) {
  const sink = createMemorySink();
  const logger = createLogger('websocket', { sink, minLevel: 'debug' });
  return { manager: new RequestManager({ defaultTimeoutMs, logger }), sink };
}

describe('RequestManager', () => {
  it('allocates increasing, never recycled ids starting at 1', () => {
    const { manager: m } = manager();
    expect(m.nextRequestId()).toBe(1);
    expect(m.nextRequestId()).toBe(2);
    expect(m.nextRequestId()).toBe(3);
  });

  it('resolves a pending request on a successful result', async () => {
    const { manager: m } = manager();
    const id = m.nextRequestId();
    const pending = m.register(id);
    expect(m.pendingCount).toBe(1);
    expect(m.settle({ req_id: id, type: 'result', success: true })).toBe(true);
    await expect(pending).resolves.toBeUndefined();
    expect(m.pendingCount).toBe(0);
  });

  it('rejects with a mapped simulator error on failure', async () => {
    const { manager: m } = manager();
    const id = m.nextRequestId();
    const pending = m.register(id);
    m.settle({ req_id: id, type: 'result', success: false, error_code: 'invalid_dataref_id', error_message: 'nope' });
    await expect(pending).rejects.toMatchObject({ code: 'DATAREF_NOT_FOUND', simulatorErrorCode: 'invalid_dataref_id' });
  });

  it('correlates concurrent requests independently of arrival order', async () => {
    const { manager: m } = manager();
    const a = m.nextRequestId();
    const b = m.nextRequestId();
    const pa = m.register(a);
    const pb = m.register(b);
    m.settle({ req_id: b, type: 'result', success: false, error_code: 'x' });
    m.settle({ req_id: a, type: 'result', success: true });
    await expect(pa).resolves.toBeUndefined();
    await expect(codeOf(pb)).resolves.toBe('SIMULATOR_ERROR');
  });

  it('ignores duplicate or unknown results and logs them', () => {
    const { manager: m, sink } = manager();
    const id = m.nextRequestId();
    void m.register(id).catch(() => undefined);
    expect(m.settle({ req_id: id, type: 'result', success: true })).toBe(true);
    expect(m.settle({ req_id: id, type: 'result', success: false, error_code: 'late' })).toBe(false);
    expect(m.settle({ req_id: 999, type: 'result', success: true })).toBe(false);
    expect(sink.entries.some((e) => e.level === 'debug' && e.message.includes('unmatched'))).toBe(true);
  });

  it('times out pending requests', async () => {
    jest.useFakeTimers();
    try {
      const { manager: m } = manager(1000);
      const id = m.nextRequestId();
      const pending = codeOf(m.register(id));
      await jest.advanceTimersByTimeAsync(1001);
      await expect(pending).resolves.toBe('TIMEOUT');
      expect(m.pendingCount).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejectAll rejects every pending request and clears timers', async () => {
    jest.useFakeTimers();
    try {
      const { manager: m } = manager(1000);
      const p1 = codeOf(m.register(m.nextRequestId()));
      const p2 = codeOf(m.register(m.nextRequestId()));
      m.rejectAll(new AvionixError({ code: 'CANCELLED', message: 'socket closed' }));
      await expect(p1).resolves.toBe('CANCELLED');
      await expect(p2).resolves.toBe('CANCELLED');
      expect(m.pendingCount).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Implement `src/infrastructure/xplane/websocket/request-manager.ts`**

```ts
import { AvionixError } from '@/domain/errors/avionix-error';
import type { Logger } from '@/infrastructure/logging/logger';
import { simulatorErrorToAvionixError } from '@/infrastructure/xplane/http/error-mapping';
import type { ResultMessage } from '@/infrastructure/xplane/schemas/websocket';

interface PendingRequest {
  resolve: () => void;
  reject: (error: AvionixError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestManager {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly options: { defaultTimeoutMs: number; logger: Logger }) {}

  get pendingCount(): number {
    return this.pending.size;
  }

  nextRequestId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  register(reqId: number, timeoutMs: number = this.options.defaultTimeoutMs): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(
          new AvionixError({
            code: 'TIMEOUT',
            message: `X-Plane did not answer WebSocket request ${reqId} within ${timeoutMs} ms`,
            retryable: true,
          }),
        );
      }, timeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
    });
  }

  settle(result: ResultMessage): boolean {
    const entry = this.pending.get(result.req_id);
    if (entry === undefined) {
      this.options.logger.debug('unmatched result message', {
        reqId: result.req_id,
        success: result.success,
        errorCode: result.error_code,
      });
      return false;
    }
    clearTimeout(entry.timer);
    this.pending.delete(result.req_id);
    if (result.success) {
      entry.resolve();
    } else {
      entry.reject(
        simulatorErrorToAvionixError({
          errorCode: result.error_code ?? 'unknown_error',
          errorMessage: result.error_message,
        }),
      );
    }
    return true;
  }

  rejectAll(error: AvionixError): void {
    for (const [reqId, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(reqId);
      entry.reject(error);
    }
  }
}
```

Run: `npx jest tests/unit/infrastructure/request-manager.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the WebSocket transport integration tests (against the mock)**

`tests/integration/websocket-transport.test.ts`:

```ts
import { isAvionixError } from '@/domain/errors/avionix-error';
import type { DataRefUpdate } from '@/domain/simulator/types';
import type { SocketCloseInfo } from '@/domain/simulator/simulator-client';
import { createLogger, createMemorySink } from '@/infrastructure/logging/logger';
import { WebSocketTransport } from '@/infrastructure/xplane/websocket/websocket-transport';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return isAvionixError(error) ? error.code : `not avionix: ${String(error)}`;
  }
}

function waitFor<T>(register: (resolve: (value: T) => void) => () => void, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('timed out waiting'));
    }, timeoutMs);
    const unsubscribe = register((value) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    });
  });
}

describe('WebSocketTransport', () => {
  let server: MockXPlaneServer;
  const sink = createMemorySink();
  const logger = createLogger('websocket', { sink, minLevel: 'debug' });

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    sink.entries.length = 0;
  });

  afterEach(async () => {
    await server.stop();
  });

  function transport(overrides: Partial<{ url: string; requestTimeoutMs: number; connectTimeoutMs: number }> = {}) {
    return new WebSocketTransport({
      url: overrides.url ?? `ws://${server.host}:${server.port}/api/v3`,
      logger,
      requestTimeoutMs: overrides.requestTimeoutMs ?? 2000,
      connectTimeoutMs: overrides.connectTimeoutMs ?? 2000,
    });
  }

  it('connects, subscribes and receives typed updates, then closes cleanly', async () => {
    const ws = transport();
    await ws.connect();
    expect(ws.isOpen).toBe(true);

    const firstUpdate = waitFor<DataRefUpdate[]>((resolve) => ws.onDataRefUpdate(resolve));
    await ws.send('dataref_subscribe_values', { datarefs: [{ id: 1001 }] });
    const updates = await firstUpdate;
    expect(updates).toEqual([{ id: 1001, value: 12.5, receivedAt: expect.any(Number) }]);

    const closed = waitFor<SocketCloseInfo>((resolve) => ws.onClose(resolve));
    ws.close();
    expect(await closed).toMatchObject({ initiatedByClient: true });
    expect(ws.isOpen).toBe(false);
  });

  it('rejects connect when the server refuses the path', async () => {
    const ws = transport({ url: `ws://${server.host}:${server.port}/api/v9` });
    await expect(codeOf(ws.connect())).resolves.toBe('WEBSOCKET_ERROR');
  });

  it('rejects connect with TIMEOUT when nothing answers', async () => {
    const ws = transport({ url: 'ws://192.0.2.1:8086/api/v3', connectTimeoutMs: 100 });
    await expect(codeOf(ws.connect())).resolves.toBe('TIMEOUT');
  });

  it('surfaces simulator errors for a failed request', async () => {
    const ws = transport();
    await ws.connect();
    await expect(codeOf(ws.send('dataref_subscribe_values', { datarefs: [{ id: 42 }] }))).resolves.toBe('DATAREF_NOT_FOUND');
    ws.close();
  });

  it('correlates concurrent requests', async () => {
    const ws = transport();
    await ws.connect();
    const results = await Promise.all([
      codeOf(ws.send('dataref_subscribe_values', { datarefs: [{ id: 1001 }] })),
      codeOf(ws.send('bogus_type' as never, {})),
      codeOf(ws.send('dataref_unsubscribe_values', { datarefs: 'all' })),
    ]);
    expect(results).toEqual(['resolved', 'SIMULATOR_ERROR', 'resolved']);
    ws.close();
  });

  it('ignores malformed and unknown messages without crashing', async () => {
    const ws = transport();
    await ws.connect();
    server.sendRawToAll('{not json');
    server.sendRawToAll(JSON.stringify({ type: 'future_message', data: 1 }));
    server.sendRawToAll(JSON.stringify({ type: 'dataref_update_values', data: { '1': null } }));
    server.sendRawToAll(JSON.stringify({ req_id: 77, type: 'result', success: true }));
    await ws.send('dataref_unsubscribe_values', { datarefs: 'all' });
    expect(ws.isOpen).toBe(true);
    expect(sink.entries.filter((e) => e.level === 'warn').length).toBeGreaterThanOrEqual(3);
    ws.close();
  });

  it('rejects pending requests with CANCELLED when the server drops the socket', async () => {
    const ws = transport({ requestTimeoutMs: 5000 });
    await ws.connect();
    const closed = waitFor<SocketCloseInfo>((resolve) => ws.onClose(resolve));
    server.pauseReplies = true;
    const pending = codeOf(ws.send('dataref_subscribe_values', { datarefs: [{ id: 1001 }] }));
    server.terminateAllSockets();
    expect(await closed).toMatchObject({ initiatedByClient: false });
    await expect(pending).resolves.toBe('CANCELLED');
  });

  it('rejects send when not connected', async () => {
    const ws = transport();
    await expect(codeOf(ws.send('dataref_unsubscribe_values', { datarefs: 'all' }))).resolves.toBe('WEBSOCKET_ERROR');
  });

  it('close is idempotent and does not emit onClose twice', async () => {
    const ws = transport();
    await ws.connect();
    let closes = 0;
    ws.onClose(() => {
      closes += 1;
    });
    ws.close();
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closes).toBe(1);
  });
});
```

The CANCELLED test uses the mock's `pauseReplies` flag so the subscribe request is guaranteed to still be pending when the server terminates the socket.

- [ ] **Step 4: Implement `src/infrastructure/xplane/websocket/websocket-transport.ts`**

```ts
import { AvionixError } from '@/domain/errors/avionix-error';
import type { SocketCloseInfo, Unsubscribe } from '@/domain/simulator/simulator-client';
import type { DataRefUpdate } from '@/domain/simulator/types';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import { toDataRefUpdates } from '@/infrastructure/xplane/schemas/mappers';
import {
  type OutgoingMessage,
  type OutgoingMessageType,
  commandUpdateMessageSchema,
  dataRefUpdateMessageSchema,
  incomingEnvelopeSchema,
  resultMessageSchema,
} from '@/infrastructure/xplane/schemas/websocket';
import { RequestManager } from '@/infrastructure/xplane/websocket/request-manager';

// Handler types are declared through method signatures so that both React Native's
// and Node's WebSocket implementations are assignable (method parameters are
// compared bivariantly, property function types are not).
export interface SocketCloseEvent {
  code?: number;
  reason?: string;
  wasClean?: boolean;
}
export interface SocketMessageEvent {
  data: unknown;
}
type OpenHandler = { bivarianceHack(event: unknown): void }['bivarianceHack'];
type CloseHandler = { bivarianceHack(event: SocketCloseEvent): void }['bivarianceHack'];
type ErrorHandler = { bivarianceHack(event: unknown): void }['bivarianceHack'];
type MessageHandler = { bivarianceHack(event: SocketMessageEvent): void }['bivarianceHack'];

export interface WebSocketLike {
  readonly readyState: number;
  onopen: OpenHandler | null;
  onclose: CloseHandler | null;
  onerror: ErrorHandler | null;
  onmessage: MessageHandler | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export const defaultWebSocketFactory: WebSocketFactory = (url) => new WebSocket(url);

const READY_STATE_OPEN = 1;

export interface WebSocketTransportOptions {
  url: string;
  createSocket?: WebSocketFactory;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  logger?: Logger;
  now?: () => number;
}

export class WebSocketTransport {
  private socket: WebSocketLike | null = null;
  private readonly requests: RequestManager;
  private readonly logger: Logger;
  private readonly createSocket: WebSocketFactory;
  private readonly connectTimeoutMs: number;
  private readonly now: () => number;
  private closeRequested = false;
  private closeEmitted = false;
  private readonly dataRefListeners = new Set<(updates: DataRefUpdate[]) => void>();
  private readonly commandListeners = new Set<(updates: Record<string, boolean>) => void>();
  private readonly closeListeners = new Set<(info: SocketCloseInfo) => void>();

  constructor(private readonly options: WebSocketTransportOptions) {
    this.logger = options.logger ?? silentLogger;
    this.createSocket = options.createSocket ?? defaultWebSocketFactory;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.now = options.now ?? Date.now;
    this.requests = new RequestManager({
      defaultTimeoutMs: options.requestTimeoutMs ?? 5000,
      logger: this.logger,
    });
  }

  get isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === READY_STATE_OPEN;
  }

  connect(): Promise<void> {
    if (this.socket !== null) {
      return Promise.reject(
        new AvionixError({ code: 'INTERNAL', message: 'WebSocketTransport.connect called twice' }),
      );
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let socket: WebSocketLike;
      try {
        socket = this.createSocket(this.options.url);
      } catch (error) {
        reject(
          new AvionixError({
            code: 'WEBSOCKET_ERROR',
            message: `Could not open WebSocket to ${this.options.url}`,
            retryable: true,
            cause: error,
          }),
        );
        return;
      }
      this.socket = socket;
      this.closeRequested = false;
      this.closeEmitted = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.logger.warn('connect timeout', { url: this.options.url });
        socket.close();
        this.socket = null;
        reject(
          new AvionixError({
            code: 'TIMEOUT',
            message: `WebSocket to ${this.options.url} did not open within ${this.connectTimeoutMs} ms`,
            retryable: true,
          }),
        );
      }, this.connectTimeoutMs);

      socket.onopen = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.logger.info('connected', { url: this.options.url });
        resolve();
      };
      socket.onerror = (event) => {
        this.logger.warn('socket error', { url: this.options.url, event: String(event) });
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.socket = null;
          reject(
            new AvionixError({
              code: 'WEBSOCKET_ERROR',
              message: `WebSocket to ${this.options.url} failed`,
              retryable: true,
              cause: event,
            }),
          );
        }
      };
      socket.onclose = (event) => {
        clearTimeout(timer);
        const info: SocketCloseInfo = {
          code: event.code ?? 1006,
          reason: event.reason ?? '',
          wasClean: event.wasClean ?? false,
          initiatedByClient: this.closeRequested,
        };
        this.handleClosed(info);
        if (!settled) {
          settled = true;
          reject(
            new AvionixError({
              code: 'WEBSOCKET_ERROR',
              message: `WebSocket to ${this.options.url} closed before opening (code ${info.code})`,
              retryable: true,
            }),
          );
        }
      };
      socket.onmessage = (event) => this.handleMessage(event.data);
    });
  }

  send(type: OutgoingMessageType, params: Record<string, unknown>, timeoutMs?: number): Promise<void> {
    if (!this.isOpen || this.socket === null) {
      return Promise.reject(
        new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'WebSocket is not connected' }),
      );
    }
    const reqId = this.requests.nextRequestId();
    const message: OutgoingMessage = { req_id: reqId, type, params };
    const pending = this.requests.register(reqId, timeoutMs);
    try {
      this.socket.send(JSON.stringify(message));
      this.logger.debug('sent', { reqId, type });
    } catch (error) {
      this.requests.settle({ req_id: reqId, type: 'result', success: false, error_code: 'send_failed' });
      return Promise.reject(
        new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'Failed to send WebSocket message', cause: error }),
      );
    }
    return pending;
  }

  close(): void {
    const socket = this.socket;
    if (socket === null) {
      return;
    }
    this.closeRequested = true;
    this.logger.info('closing', { url: this.options.url });
    socket.close(1000, 'client disconnect');
  }

  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void): Unsubscribe {
    this.dataRefListeners.add(listener);
    return () => this.dataRefListeners.delete(listener);
  }

  onCommandUpdate(listener: (updates: Record<string, boolean>) => void): Unsubscribe {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  onClose(listener: (info: SocketCloseInfo) => void): Unsubscribe {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  private handleClosed(info: SocketCloseInfo): void {
    if (this.closeEmitted) {
      return;
    }
    this.closeEmitted = true;
    this.socket = null;
    this.logger.info('closed', { code: info.code, initiatedByClient: info.initiatedByClient });
    this.requests.rejectAll(
      new AvionixError({
        code: 'CANCELLED',
        message: `WebSocket closed (code ${info.code}) while a request was pending`,
        retryable: true,
      }),
    );
    for (const listener of this.closeListeners) {
      listener(info);
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      this.logger.warn('ignoring non-text WebSocket frame');
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      this.logger.warn('ignoring malformed WebSocket JSON', { sample: data.slice(0, 80) });
      return;
    }
    const envelope = incomingEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      this.logger.warn('ignoring WebSocket message without type');
      return;
    }
    switch (envelope.data.type) {
      case 'result': {
        const result = resultMessageSchema.safeParse(json);
        if (!result.success) {
          this.logger.warn('ignoring malformed result message');
          return;
        }
        this.requests.settle(result.data);
        return;
      }
      case 'dataref_update_values': {
        const update = dataRefUpdateMessageSchema.safeParse(json);
        if (!update.success) {
          this.logger.warn('ignoring malformed dataref_update_values message');
          return;
        }
        const updates = toDataRefUpdates(update.data.data, this.now());
        for (const listener of this.dataRefListeners) {
          listener(updates);
        }
        return;
      }
      case 'command_update_is_active': {
        const update = commandUpdateMessageSchema.safeParse(json);
        if (!update.success) {
          this.logger.warn('ignoring malformed command_update_is_active message');
          return;
        }
        for (const listener of this.commandListeners) {
          listener(update.data.data);
        }
        return;
      }
      default:
        this.logger.warn('ignoring unknown WebSocket message type', { type: envelope.data.type });
    }
  }
}
```

- [ ] **Step 5: Run, verify, commit**

```bash
npx jest tests/integration/websocket-transport.test.ts tests/unit/infrastructure/request-manager.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(xplane): add WebSocket transport with request correlation and typed events

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

If `new WebSocket(url)` is not assignable to `WebSocketLike` under the Expo tsconfig, inspect the reported property and widen that handler's event type in `SocketCloseEvent`/`SocketMessageEvent` (all fields optional) rather than casting.

---

### Task 8: Capabilities probe and XPlaneClient

**Files:**
- Create: `src/infrastructure/xplane/capabilities.ts`, `src/infrastructure/xplane/xplane-client.ts`
- Test: `tests/integration/xplane-client.test.ts`

**Interfaces:**
- Consumes: `HttpTransport`, `WebSocketTransport`, schemas, mappers, endpoints, `SimulatorClient`.
- Produces:
  - `probeCapabilities(http: HttpTransport): Promise<SimulatorCapabilities>` (404 without payload → `UNSUPPORTED_API` mentioning 12.1.4)
  - `class XPlaneClient implements SimulatorClient { constructor(options: { config: XPlaneConnectionConfig; apiVersion: ApiVersion; http: HttpTransport; createSocket?: WebSocketFactory; requestTimeoutMs?: number; connectTimeoutMs?: number; logger?: Logger }); getCapabilities(): Promise<SimulatorCapabilities>; readonly apiVersion: ApiVersion; ...SimulatorClient }`

- [ ] **Step 1: Write the client integration tests**

`tests/integration/xplane-client.test.ts`:

```ts
import { isAvionixError } from '@/domain/errors/avionix-error';
import type { DataRefUpdate } from '@/domain/simulator/types';
import { silentLogger } from '@/infrastructure/logging/logger';
import { probeCapabilities } from '@/infrastructure/xplane/capabilities';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';
import { MockXPlaneServer } from '../mock-xplane/mock-xplane-server';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return isAvionixError(error) ? error.code : `not avionix: ${String(error)}`;
  }
}

describe('probeCapabilities', () => {
  it('returns capabilities from the unversioned endpoint', async () => {
    const server = await MockXPlaneServer.start({ apiVersions: ['v1', 'v2'], xplaneVersion: '12.1.4' });
    try {
      const http = new HttpTransport({ origin: `http://${server.host}:${server.port}`, logger: silentLogger });
      await expect(probeCapabilities(http)).resolves.toEqual({
        simulatorVersion: '12.1.4',
        supportedApiVersions: ['v1', 'v2'],
        rawApiVersions: ['v1', 'v2'],
      });
    } finally {
      await server.stop();
    }
  });

  it('maps a 404 (X-Plane older than 12.1.4) to UNSUPPORTED_API', async () => {
    const server = await MockXPlaneServer.start({ capabilitiesMode: 'not_found' });
    try {
      const http = new HttpTransport({ origin: `http://${server.host}:${server.port}`, logger: silentLogger });
      try {
        await probeCapabilities(http);
        throw new Error('expected rejection');
      } catch (error) {
        expect(isAvionixError(error) && error.code).toBe('UNSUPPORTED_API');
        expect(isAvionixError(error) && error.message).toContain('12.1.4');
      }
    } finally {
      await server.stop();
    }
  });

  it('maps a plain 403 to INCOMING_TRAFFIC_DISABLED', async () => {
    const server = await MockXPlaneServer.start();
    server.incomingTrafficDisabled = true;
    try {
      const http = new HttpTransport({ origin: `http://${server.host}:${server.port}`, logger: silentLogger });
      await expect(codeOf(probeCapabilities(http))).resolves.toBe('INCOMING_TRAFFIC_DISABLED');
    } finally {
      await server.stop();
    }
  });
});

describe.each(['v2', 'v3'] as const)('XPlaneClient over %s', (apiVersion) => {
  let server: MockXPlaneServer;
  let client: XPlaneClient;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
    const config = { host: server.host, port: server.port };
    client = new XPlaneClient({
      config,
      apiVersion,
      http: new HttpTransport({ origin: `http://${server.host}:${server.port}`, logger: silentLogger }),
      logger: silentLogger,
      requestTimeoutMs: 2000,
      connectTimeoutMs: 2000,
    });
  });

  afterEach(async () => {
    client.disconnectWebSocket();
    await server.stop();
  });

  it('resolves datarefs and commands by name, returning null for unknown names', async () => {
    await expect(client.findDataRef('sim/time/total_running_time_sec')).resolves.toEqual({
      id: 1001,
      name: 'sim/time/total_running_time_sec',
      valueType: 'float',
    });
    await expect(client.findDataRef('sim/does/not/exist')).resolves.toBeNull();
    await expect(client.findCommand('sim/autopilot/heading_up')).resolves.toEqual({
      id: 2001,
      name: 'sim/autopilot/heading_up',
      description: 'Autopilot heading up.',
    });
    await expect(client.findCommand('sim/nope')).resolves.toBeNull();
  });

  it('reads scalar, array, indexed and data values', async () => {
    await expect(client.getDataRefValue(1003)).resolves.toBe(270);
    await expect(client.getDataRefValue(1004)).resolves.toEqual([10, 20, 30]);
    await expect(client.getDataRefValue(1004, 1)).resolves.toBe(20);
    await expect(client.getDataRefValue(1005)).resolves.toBe('TklsNzc=');
    await expect(codeOf(client.getDataRefValue(999999))).resolves.toBe('DATAREF_NOT_FOUND');
  });

  it('writes values and maps write failures to WRITE_FAILED with the underlying code', async () => {
    await client.setDataRefValue(1003, 180);
    expect(server.writes).toEqual([{ id: 1003, value: 180 }]);
    try {
      await client.setDataRefValue(1001, 5);
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('WRITE_FAILED');
      expect(isAvionixError(error) && error.simulatorErrorCode).toBe('dataref_is_readonly');
    }
  });

  it('activates commands with a duration and maps failures to COMMAND_FAILED', async () => {
    await client.activateCommand(2001);
    await client.activateCommand(2001, 0.5);
    expect(server.activations).toEqual([
      { id: 2001, duration: 0 },
      { id: 2001, duration: 0.5 },
    ]);
    try {
      await client.activateCommand(4242);
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('COMMAND_FAILED');
      expect(isAvionixError(error) && error.simulatorErrorCode).toBe('invalid_command_id');
    }
  });

  it('subscribes over WebSocket and emits updates, then unsubscribes and disconnects', async () => {
    await client.connectWebSocket();
    const received: DataRefUpdate[][] = [];
    client.onDataRefUpdate((updates) => received.push(updates));
    await client.subscribeDataRefs([{ id: 1001 }, { id: 1003 }]);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(received[0]).toEqual([
      { id: 1001, value: 12.5, receivedAt: expect.any(Number) },
      { id: 1003, value: 270, receivedAt: expect.any(Number) },
    ]);
    server.setDataRefValue('sim/time/total_running_time_sec', 99);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(received.at(-1)).toEqual([{ id: 1001, value: 99, receivedAt: expect.any(Number) }]);
    await client.unsubscribeDataRefs('all');
    const closed = new Promise((resolve) => client.onSocketClosed(resolve));
    client.disconnectWebSocket();
    await expect(closed).resolves.toMatchObject({ initiatedByClient: true });
  });

  it('maps subscription failures to SUBSCRIPTION_FAILED', async () => {
    await client.connectWebSocket();
    try {
      await client.subscribeDataRefs([{ id: 31337 }]);
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('SUBSCRIPTION_FAILED');
      expect(isAvionixError(error) && error.simulatorErrorCode).toBe('invalid_dataref_id');
    }
  });

  it('uses versioned paths', async () => {
    await client.findDataRef('sim/time/total_running_time_sec');
    const other = await MockXPlaneServer.start({ apiVersions: ['v1'] });
    try {
      const v1Only = new XPlaneClient({
        config: { host: other.host, port: other.port },
        apiVersion,
        http: new HttpTransport({ origin: `http://${other.host}:${other.port}`, logger: silentLogger }),
        logger: silentLogger,
      });
      await expect(codeOf(v1Only.findDataRef('sim/time/total_running_time_sec'))).resolves.toBe('HTTP_ERROR');
    } finally {
      await other.stop();
    }
  });
});
```

- [ ] **Step 2: Implement `src/infrastructure/xplane/capabilities.ts`**

```ts
import { capabilitiesPath } from '@/domain/connection/endpoints';
import { AvionixError, isAvionixError } from '@/domain/errors/avionix-error';
import { MINIMUM_XPLANE_VERSION } from '@/domain/simulator/api-version';
import type { SimulatorCapabilities } from '@/domain/simulator/types';
import type { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { toSimulatorCapabilities } from '@/infrastructure/xplane/schemas/mappers';
import { capabilitiesResponseSchema } from '@/infrastructure/xplane/schemas/rest';

export async function probeCapabilities(http: HttpTransport): Promise<SimulatorCapabilities> {
  try {
    const raw = await http.request({
      method: 'GET',
      path: capabilitiesPath(),
      schema: capabilitiesResponseSchema,
    });
    return toSimulatorCapabilities(raw);
  } catch (error) {
    if (isAvionixError(error) && error.code === 'HTTP_ERROR' && error.message.includes('HTTP 404')) {
      throw new AvionixError({
        code: 'UNSUPPORTED_API',
        message:
          `X-Plane answered 404 for ${capabilitiesPath()}. This endpoint exists from X-Plane ` +
          `${MINIMUM_XPLANE_VERSION}; please update X-Plane.`,
        cause: error,
      });
    }
    throw error;
  }
}
```

- [ ] **Step 3: Implement `src/infrastructure/xplane/xplane-client.ts`**

```ts
import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import { restPath, webSocketUrl } from '@/domain/connection/endpoints';
import { AvionixError, type AvionixErrorCode, toAvionixError } from '@/domain/errors/avionix-error';
import type { ApiVersion } from '@/domain/simulator/api-version';
import type { SimulatorClient, SocketCloseInfo, Unsubscribe } from '@/domain/simulator/simulator-client';
import type {
  CommandDescriptor,
  DataRefDescriptor,
  DataRefSubscription,
  DataRefUpdate,
  DataRefValue,
  SimulatorCapabilities,
} from '@/domain/simulator/types';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import { probeCapabilities } from '@/infrastructure/xplane/capabilities';
import type { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { toCommandDescriptor, toDataRefDescriptor } from '@/infrastructure/xplane/schemas/mappers';
import {
  commandListResponseSchema,
  dataRefListResponseSchema,
  dataRefValueResponseSchema,
} from '@/infrastructure/xplane/schemas/rest';
import {
  type WebSocketFactory,
  WebSocketTransport,
} from '@/infrastructure/xplane/websocket/websocket-transport';

export interface XPlaneClientOptions {
  config: XPlaneConnectionConfig;
  apiVersion: ApiVersion;
  http: HttpTransport;
  createSocket?: WebSocketFactory;
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
  logger?: Logger;
}

function wrap(error: unknown, code: AvionixErrorCode, message: string): AvionixError {
  const inner = toAvionixError(error, { code: 'UNKNOWN', message });
  return new AvionixError({
    code,
    message: `${message}: ${inner.message}`,
    retryable: inner.retryable,
    simulatorErrorCode: inner.simulatorErrorCode,
    cause: inner,
  });
}

export class XPlaneClient implements SimulatorClient {
  readonly apiVersion: ApiVersion;
  private readonly http: HttpTransport;
  private readonly logger: Logger;
  private socket: WebSocketTransport | null = null;
  private readonly dataRefListeners = new Set<(updates: DataRefUpdate[]) => void>();
  private readonly closeListeners = new Set<(info: SocketCloseInfo) => void>();

  constructor(private readonly options: XPlaneClientOptions) {
    this.apiVersion = options.apiVersion;
    this.http = options.http;
    this.logger = options.logger ?? silentLogger;
  }

  getCapabilities(): Promise<SimulatorCapabilities> {
    return probeCapabilities(this.http);
  }

  async findDataRef(name: string): Promise<DataRefDescriptor | null> {
    try {
      const response = await this.http.request({
        method: 'GET',
        path: restPath(this.apiVersion, '/datarefs'),
        query: { 'filter[name]': name },
        schema: dataRefListResponseSchema,
      });
      const match = response.data.find((item) => item.name === name);
      return match === undefined ? null : toDataRefDescriptor(match);
    } catch (error) {
      if (error instanceof AvionixError && error.code === 'DATAREF_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  async findCommand(name: string): Promise<CommandDescriptor | null> {
    try {
      const response = await this.http.request({
        method: 'GET',
        path: restPath(this.apiVersion, '/commands'),
        query: { 'filter[name]': name },
        schema: commandListResponseSchema,
      });
      const match = response.data.find((item) => item.name === name);
      return match === undefined ? null : toCommandDescriptor(match);
    } catch (error) {
      if (error instanceof AvionixError && error.code === 'COMMAND_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  async getDataRefValue(id: number, index?: number): Promise<DataRefValue> {
    const response = await this.http.request({
      method: 'GET',
      path: restPath(this.apiVersion, `/datarefs/${id}/value`),
      query: { index },
      schema: dataRefValueResponseSchema,
    });
    return response.data;
  }

  async setDataRefValue(id: number, value: DataRefValue, index?: number): Promise<void> {
    try {
      await this.http.request({
        method: 'PATCH',
        path: restPath(this.apiVersion, `/datarefs/${id}/value`),
        query: { index },
        body: { data: value },
      });
      this.logger.info('dataref written', { id, index });
    } catch (error) {
      throw wrap(error, 'WRITE_FAILED', `Writing dataref ${id} failed`);
    }
  }

  async activateCommand(id: number, durationSeconds = 0): Promise<void> {
    try {
      await this.http.request({
        method: 'POST',
        path: restPath(this.apiVersion, `/command/${id}/activate`),
        body: { duration: durationSeconds },
      });
      this.logger.info('command activated', { id, durationSeconds });
    } catch (error) {
      throw wrap(error, 'COMMAND_FAILED', `Activating command ${id} failed`);
    }
  }

  async connectWebSocket(): Promise<void> {
    if (this.socket !== null) {
      return;
    }
    const socket = new WebSocketTransport({
      url: webSocketUrl(this.options.config, this.apiVersion),
      createSocket: this.options.createSocket,
      connectTimeoutMs: this.options.connectTimeoutMs,
      requestTimeoutMs: this.options.requestTimeoutMs,
      logger: this.logger,
    });
    socket.onDataRefUpdate((updates) => {
      for (const listener of this.dataRefListeners) {
        listener(updates);
      }
    });
    socket.onClose((info) => {
      if (this.socket === socket) {
        this.socket = null;
      }
      for (const listener of this.closeListeners) {
        listener(info);
      }
    });
    this.socket = socket;
    try {
      await socket.connect();
    } catch (error) {
      this.socket = null;
      throw error;
    }
  }

  async subscribeDataRefs(subscriptions: DataRefSubscription[]): Promise<void> {
    try {
      await this.requireSocket().send('dataref_subscribe_values', { datarefs: subscriptions });
    } catch (error) {
      throw wrap(error, 'SUBSCRIPTION_FAILED', 'Subscribing to datarefs failed');
    }
  }

  async unsubscribeDataRefs(subscriptions: DataRefSubscription[] | 'all'): Promise<void> {
    try {
      await this.requireSocket().send('dataref_unsubscribe_values', { datarefs: subscriptions });
    } catch (error) {
      throw wrap(error, 'SUBSCRIPTION_FAILED', 'Unsubscribing from datarefs failed');
    }
  }

  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void): Unsubscribe {
    this.dataRefListeners.add(listener);
    return () => this.dataRefListeners.delete(listener);
  }

  onSocketClosed(listener: (info: SocketCloseInfo) => void): Unsubscribe {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  disconnectWebSocket(): void {
    this.socket?.close();
  }

  private requireSocket(): WebSocketTransport {
    if (this.socket === null || !this.socket.isOpen) {
      throw new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'WebSocket is not connected' });
    }
    return this.socket;
  }
}
```

- [ ] **Step 4: Run, verify, commit**

```bash
npx jest tests/integration/xplane-client.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(xplane): add capabilities probe and XPlaneClient over REST and WebSocket

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Name resolution caches (DataRef and command repositories)

**Files:**
- Create: `src/infrastructure/xplane/resolution-cache.ts`
- Test: `tests/unit/infrastructure/resolution-cache.test.ts`

**Interfaces:**
- Produces: `class ResolutionCache<T extends { id: number; name: string }> { constructor(options: { lookup: (name: string) => Promise<T | null>; notFoundCode: 'DATAREF_NOT_FOUND' | 'COMMAND_NOT_FOUND'; kind: string }); resolve(name: string): Promise<T>; resolveMany(names: readonly string[]): Promise<T[]>; peek(name: string): T | undefined; clear(): void; get size(): number }`; `createDataRefRepository(client: Pick<SimulatorClient, 'findDataRef'>): ResolutionCache<DataRefDescriptor>`; `createCommandRepository(client: Pick<SimulatorClient, 'findCommand'>): ResolutionCache<CommandDescriptor>`; type aliases `DataRefRepository`, `CommandRepository`.

- [ ] **Step 1: Write the tests**

`tests/unit/infrastructure/resolution-cache.test.ts`:

```ts
import { isAvionixError } from '@/domain/errors/avionix-error';
import type { DataRefDescriptor } from '@/domain/simulator/types';
import { ResolutionCache, createDataRefRepository } from '@/infrastructure/xplane/resolution-cache';

function makeLookup(table: Record<string, DataRefDescriptor>) {
  const calls: string[] = [];
  const lookup = jest.fn(async (name: string) => {
    calls.push(name);
    return table[name] ?? null;
  });
  return { lookup, calls };
}

const table: Record<string, DataRefDescriptor> = {
  'sim/a': { id: 1, name: 'sim/a', valueType: 'float' },
  'sim/b': { id: 2, name: 'sim/b', valueType: 'int' },
};

describe('ResolutionCache', () => {
  it('resolves on first call and serves cache hits afterwards', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    await expect(cache.resolve('sim/a')).resolves.toEqual(table['sim/a']);
    await expect(cache.resolve('sim/a')).resolves.toEqual(table['sim/a']);
    expect(calls).toEqual(['sim/a']);
    expect(cache.peek('sim/a')).toEqual(table['sim/a']);
    expect(cache.peek('sim/b')).toBeUndefined();
  });

  it('de-duplicates concurrent in-flight lookups', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    await Promise.all([cache.resolve('sim/a'), cache.resolve('sim/a'), cache.resolve('sim/a')]);
    expect(calls).toEqual(['sim/a']);
  });

  it('resolveMany resolves each unique name once and preserves order', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    const result = await cache.resolveMany(['sim/b', 'sim/a', 'sim/b']);
    expect(result.map((d) => d.id)).toEqual([2, 1, 2]);
    expect(calls.sort()).toEqual(['sim/a', 'sim/b']);
  });

  it('throws DATAREF_NOT_FOUND for unknown names and does not cache the miss', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    for (let i = 0; i < 2; i += 1) {
      try {
        await cache.resolve('sim/missing');
        throw new Error('expected rejection');
      } catch (error) {
        expect(isAvionixError(error) && error.code).toBe('DATAREF_NOT_FOUND');
        expect(isAvionixError(error) && error.message).toContain('sim/missing');
      }
    }
    expect(calls).toEqual(['sim/missing', 'sim/missing']);
  });

  it('propagates lookup failures and allows retry', async () => {
    let fail = true;
    const lookup = jest.fn(async (name: string) => {
      if (fail) {
        throw new Error('network');
      }
      return table[name] ?? null;
    });
    const cache = new ResolutionCache({ lookup, notFoundCode: 'DATAREF_NOT_FOUND', kind: 'dataref' });
    await expect(cache.resolve('sim/a')).rejects.toThrow('network');
    fail = false;
    await expect(cache.resolve('sim/a')).resolves.toEqual(table['sim/a']);
  });

  it('clear forgets everything so a new session re-resolves ids', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    await cache.resolve('sim/a');
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
    await cache.resolve('sim/a');
    expect(calls).toEqual(['sim/a', 'sim/a']);
  });
});
```

- [ ] **Step 2: Implement `src/infrastructure/xplane/resolution-cache.ts`**

```ts
import { AvionixError } from '@/domain/errors/avionix-error';
import type { SimulatorClient } from '@/domain/simulator/simulator-client';
import type { CommandDescriptor, DataRefDescriptor } from '@/domain/simulator/types';

export interface ResolutionCacheOptions<T> {
  lookup: (name: string) => Promise<T | null>;
  notFoundCode: 'DATAREF_NOT_FOUND' | 'COMMAND_NOT_FOUND';
  kind: string;
}

/**
 * Caches name → descriptor lookups for the lifetime of one simulator session.
 * Numeric ids are only valid for the current X-Plane session; call clear()
 * whenever a new connection is established.
 */
export class ResolutionCache<T extends { id: number; name: string }> {
  private readonly resolved = new Map<string, T>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(private readonly options: ResolutionCacheOptions<T>) {}

  get size(): number {
    return this.resolved.size;
  }

  peek(name: string): T | undefined {
    return this.resolved.get(name);
  }

  resolve(name: string): Promise<T> {
    const cached = this.resolved.get(name);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    const pending = this.inFlight.get(name);
    if (pending !== undefined) {
      return pending;
    }
    const lookup = this.options
      .lookup(name)
      .then((descriptor) => {
        if (descriptor === null) {
          throw new AvionixError({
            code: this.options.notFoundCode,
            message: `X-Plane has no ${this.options.kind} named "${name}"`,
          });
        }
        this.resolved.set(name, descriptor);
        return descriptor;
      })
      .finally(() => {
        this.inFlight.delete(name);
      });
    this.inFlight.set(name, lookup);
    return lookup;
  }

  resolveMany(names: readonly string[]): Promise<T[]> {
    return Promise.all(names.map((name) => this.resolve(name)));
  }

  clear(): void {
    this.resolved.clear();
    this.inFlight.clear();
  }
}

export type DataRefRepository = ResolutionCache<DataRefDescriptor>;
export type CommandRepository = ResolutionCache<CommandDescriptor>;

export function createDataRefRepository(
  client: Pick<SimulatorClient, 'findDataRef'>,
): DataRefRepository {
  return new ResolutionCache({
    lookup: (name) => client.findDataRef(name),
    notFoundCode: 'DATAREF_NOT_FOUND',
    kind: 'dataref',
  });
}

export function createCommandRepository(
  client: Pick<SimulatorClient, 'findCommand'>,
): CommandRepository {
  return new ResolutionCache({
    lookup: (name) => client.findCommand(name),
    notFoundCode: 'COMMAND_NOT_FOUND',
    kind: 'command',
  });
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
npx jest tests/unit/infrastructure/resolution-cache.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(xplane): add per-session name resolution caches for datarefs and commands

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Session store, snapshot and SimulatorSession orchestration

**Files:**
- Create: `src/application/store.ts`, `src/application/session-snapshot.ts`, `src/application/mvp-bindings.ts`, `src/application/simulator-session.ts`
- Test: `tests/unit/application/store.test.ts`, `tests/unit/application/simulator-session.test.ts` (fake client), `tests/integration/simulator-session.test.ts` (mock server)

**Interfaces:**
- Consumes: `transition`, `createConnectionConfig`, `negotiateApiVersion`, `probeCapabilities`, `HttpTransport`, `XPlaneClient`, `createDataRefRepository`, `createCommandRepository`, `computeBackoffDelayMs`, `DEFAULT_RECONNECT_POLICY`, `Logger`.
- Produces:
  - `class Store<T> { constructor(initial: T); getSnapshot: () => T; subscribe: (listener: () => void) => () => void; setState(updater: (prev: T) => T): void }`
  - `type StepStatus = 'idle' | 'pending' | 'ok' | 'failed'`; `interface SessionSnapshot {...}` (below); `initialSnapshot(): SessionSnapshot`
  - `MVP_DATAREFS = { heartbeat, airspeed, heading }`, `MVP_DATAREF_NAMES: readonly string[]`, `MVP_COMMAND_HEADING_UP`
  - `interface Scheduler { schedule(callback: () => void, delayMs: number): () => void }`; `realScheduler`
  - `interface SimulatorSessionDeps { createHttpTransport(config): HttpTransport; createClient(config, apiVersion, http): SimulatorClient; scheduler?: Scheduler; reconnectPolicy?: ReconnectPolicy; random?: () => number; logger?: Logger; now?: () => number }`
  - `class SimulatorSession { readonly store: Store<SessionSnapshot>; connect(host: string, port: string | number): Promise<void>; disconnect(): void; writeHeading(value: number): Promise<void>; activateHeadingUp(): Promise<void> }`

- [ ] **Step 1: Write the store test**

`tests/unit/application/store.test.ts`:

```ts
import { Store } from '@/application/store';

describe('Store', () => {
  it('returns the current snapshot and notifies subscribers on change', () => {
    const store = new Store({ count: 0 });
    const seen: number[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot().count));
    store.setState((prev) => ({ count: prev.count + 1 }));
    store.setState((prev) => ({ count: prev.count + 1 }));
    unsubscribe();
    store.setState((prev) => ({ count: prev.count + 1 }));
    expect(seen).toEqual([1, 2]);
    expect(store.getSnapshot()).toEqual({ count: 3 });
  });

  it('skips notification when the updater returns the same reference', () => {
    const store = new Store({ count: 0 });
    const listener = jest.fn();
    store.subscribe(listener);
    store.setState((prev) => prev);
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement `store.ts`, `session-snapshot.ts`, `mvp-bindings.ts`**

`src/application/store.ts`:

```ts
export class Store<T> {
  private state: T;
  private readonly listeners = new Set<() => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  getSnapshot = (): T => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setState(updater: (prev: T) => T): void {
    const next = updater(this.state);
    if (Object.is(next, this.state)) {
      return;
    }
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
```

`src/application/session-snapshot.ts`:

```ts
import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import type { ConnectionState } from '@/domain/connection/connection-state';
import type { AvionixError } from '@/domain/errors/avionix-error';
import type { ApiVersion } from '@/domain/simulator/api-version';
import type { DataRefValue, SimulatorCapabilities } from '@/domain/simulator/types';

export type StepStatus = 'idle' | 'pending' | 'ok' | 'failed';

export interface SessionDiagnostics {
  http: StepStatus;
  capabilities: StepStatus;
  websocket: StepStatus;
  dataRefs: Record<string, StepStatus>;
  command: StepStatus;
  subscription: StepStatus;
}

export interface TelemetrySample {
  value: DataRefValue;
  receivedAt: number;
}

export interface LastOperation {
  kind: 'write' | 'command';
  ok: boolean;
  message: string;
  at: number;
}

export interface SessionSnapshot {
  state: ConnectionState;
  config: XPlaneConnectionConfig | null;
  capabilities: SimulatorCapabilities | null;
  apiVersion: ApiVersion | null;
  diagnostics: SessionDiagnostics;
  telemetry: Record<string, TelemetrySample | undefined>;
  lastOperation: LastOperation | null;
  error: AvionixError | null;
  reconnectAttempt: number;
}

export function initialDiagnostics(dataRefNames: readonly string[]): SessionDiagnostics {
  return {
    http: 'idle',
    capabilities: 'idle',
    websocket: 'idle',
    dataRefs: Object.fromEntries(dataRefNames.map((name) => [name, 'idle' as StepStatus])),
    command: 'idle',
    subscription: 'idle',
  };
}

export function initialSnapshot(dataRefNames: readonly string[]): SessionSnapshot {
  return {
    state: 'disconnected',
    config: null,
    capabilities: null,
    apiVersion: null,
    diagnostics: initialDiagnostics(dataRefNames),
    telemetry: {},
    lastOperation: null,
    error: null,
    reconnectAttempt: 0,
  };
}
```

`src/application/mvp-bindings.ts`:

```ts
/**
 * DataRefs and command used by the connectivity MVP. Names verified against
 * Laminar Research's DataRefs.txt / Commands.txt; see docs/xplane.md.
 * Numeric ids are resolved at runtime for every session and never stored.
 */
export const MVP_DATAREFS = {
  heartbeat: 'sim/time/total_running_time_sec',
  airspeed: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
  heading: 'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
} as const;

export const MVP_DATAREF_NAMES: readonly string[] = Object.values(MVP_DATAREFS);

export const MVP_COMMAND_HEADING_UP = 'sim/autopilot/heading_up';
```

Run: `npx jest tests/unit/application/store.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the SimulatorSession unit tests with a fake client**

`tests/unit/application/simulator-session.test.ts`:

```ts
import { MVP_COMMAND_HEADING_UP, MVP_DATAREFS } from '@/application/mvp-bindings';
import { type Scheduler, SimulatorSession } from '@/application/simulator-session';
import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError } from '@/domain/errors/avionix-error';
import type { SimulatorClient, SocketCloseInfo } from '@/domain/simulator/simulator-client';
import type { DataRefUpdate, SimulatorCapabilities } from '@/domain/simulator/types';
import { silentLogger } from '@/infrastructure/logging/logger';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';

const caps: SimulatorCapabilities = {
  simulatorVersion: '12.4.0',
  supportedApiVersions: ['v1', 'v2', 'v3'],
  rawApiVersions: ['v1', 'v2', 'v3'],
};

class FakeClient implements SimulatorClient {
  updateListeners = new Set<(updates: DataRefUpdate[]) => void>();
  closeListeners = new Set<(info: SocketCloseInfo) => void>();
  subscribed: number[] = [];
  writes: Array<{ id: number; value: unknown }> = [];
  activations: number[] = [];
  connectError: AvionixError | null = null;
  subscribeError: AvionixError | null = null;
  missingDataRef: string | null = null;
  socketOpen = false;

  findDataRef = jest.fn(async (name: string) => {
    if (name === this.missingDataRef) {
      return null;
    }
    const ids: Record<string, number> = {
      [MVP_DATAREFS.heartbeat]: 1,
      [MVP_DATAREFS.airspeed]: 2,
      [MVP_DATAREFS.heading]: 3,
    };
    const id = ids[name];
    return id === undefined ? null : { id, name, valueType: 'float' as const };
  });

  findCommand = jest.fn(async (name: string) =>
    name === MVP_COMMAND_HEADING_UP ? { id: 9, name, description: 'up' } : null,
  );

  getDataRefValue = jest.fn(async () => 0);

  setDataRefValue = jest.fn(async (id: number, value: unknown) => {
    this.writes.push({ id, value });
  });

  activateCommand = jest.fn(async (id: number) => {
    this.activations.push(id);
  });

  connectWebSocket = jest.fn(async () => {
    if (this.connectError !== null) {
      throw this.connectError;
    }
    this.socketOpen = true;
  });

  subscribeDataRefs = jest.fn(async (subs: Array<{ id: number }>) => {
    if (this.subscribeError !== null) {
      throw this.subscribeError;
    }
    this.subscribed.push(...subs.map((s) => s.id));
  });

  unsubscribeDataRefs = jest.fn(async () => undefined);

  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void) {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  onSocketClosed(listener: (info: SocketCloseInfo) => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  disconnectWebSocket = jest.fn(() => {
    if (!this.socketOpen) {
      return;
    }
    this.socketOpen = false;
    this.emitClose({ code: 1000, reason: '', wasClean: true, initiatedByClient: true });
  });

  emitUpdates(updates: DataRefUpdate[]): void {
    for (const listener of this.updateListeners) {
      listener(updates);
    }
  }

  emitClose(info: SocketCloseInfo): void {
    for (const listener of this.closeListeners) {
      listener(info);
    }
  }
}

class ManualScheduler implements Scheduler {
  queue: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];
  schedule(callback: () => void, delayMs: number): () => void {
    const entry = { callback, delayMs, cancelled: false };
    this.queue.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }
  async runNext(): Promise<void> {
    const entry = this.queue.shift();
    if (entry !== undefined && !entry.cancelled) {
      entry.callback();
    }
    await flush();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

function setup(options: { capsError?: AvionixError; clients?: FakeClient[] } = {}) {
  const clients = options.clients ?? [new FakeClient()];
  let clientIndex = 0;
  const scheduler = new ManualScheduler();
  const capsError = options.capsError;
  const fetchImpl = async () => {
    if (capsError !== undefined) {
      throw capsError;
    }
    return {
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({ api: { versions: caps.rawApiVersions }, 'x-plane': { version: caps.simulatorVersion } }),
    };
  };
  const session = new SimulatorSession({
    createHttpTransport: (config: XPlaneConnectionConfig) =>
      new HttpTransport({ origin: `http://${config.host}:${config.port}`, fetchImpl, logger: silentLogger }),
    createClient: () => {
      const client = clients[Math.min(clientIndex, clients.length - 1)];
      clientIndex += 1;
      if (client === undefined) {
        throw new Error('no fake client');
      }
      return client;
    },
    scheduler,
    random: () => 0.5,
    logger: silentLogger,
    now: () => 1234,
  });
  return { session, scheduler, clients, snapshot: () => session.store.getSnapshot() };
}

describe('SimulatorSession connect flow', () => {
  it('goes disconnected → connecting → connected, resolves MVP datarefs and subscribes', async () => {
    const { session, clients, snapshot } = setup();
    const states: string[] = [];
    session.store.subscribe(() => states.push(snapshot().state));
    await session.connect('192.168.1.100', '8086');
    expect(states).toContain('connecting');
    expect(snapshot()).toMatchObject({
      state: 'connected',
      apiVersion: 'v3',
      capabilities: caps,
      config: { host: '192.168.1.100', port: 8086 },
      error: null,
      diagnostics: {
        http: 'ok',
        capabilities: 'ok',
        websocket: 'ok',
        command: 'ok',
        subscription: 'ok',
        dataRefs: { [MVP_DATAREFS.heartbeat]: 'ok', [MVP_DATAREFS.airspeed]: 'ok', [MVP_DATAREFS.heading]: 'ok' },
      },
    });
    expect(clients[0]?.subscribed.sort()).toEqual([1, 2, 3]);
  });

  it('rejects an invalid host without touching the network', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('http://bad', '8086');
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('INVALID_HOST');
    expect(clients[0]?.connectWebSocket).not.toHaveBeenCalled();
  });

  it('rejects an invalid port', async () => {
    const { session, snapshot } = setup();
    await session.connect('192.168.1.100', '99999');
    expect(snapshot().error?.code).toBe('INVALID_PORT');
  });

  it('marks http failed when capabilities cannot be fetched', async () => {
    const { session, snapshot } = setup({ capsError: new AvionixError({ code: 'NETWORK_ERROR', message: 'down' }) });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('NETWORK_ERROR');
    expect(snapshot().diagnostics.http).toBe('failed');
    expect(snapshot().diagnostics.capabilities).toBe('failed');
  });

  it('marks websocket failed when the socket cannot open', async () => {
    const client = new FakeClient();
    client.connectError = new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'refused' });
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('WEBSOCKET_ERROR');
    expect(snapshot().diagnostics.websocket).toBe('failed');
  });

  it('marks a missing dataref failed and reports DATAREF_NOT_FOUND', async () => {
    const client = new FakeClient();
    client.missingDataRef = MVP_DATAREFS.airspeed;
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('DATAREF_NOT_FOUND');
    expect(snapshot().diagnostics.dataRefs[MVP_DATAREFS.airspeed]).toBe('failed');
    expect(snapshot().diagnostics.dataRefs[MVP_DATAREFS.heartbeat]).toBe('ok');
  });

  it('marks subscription failed', async () => {
    const client = new FakeClient();
    client.subscribeError = new AvionixError({ code: 'SUBSCRIPTION_FAILED', message: 'no' });
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    expect(snapshot().diagnostics.subscription).toBe('failed');
  });

  it('updates telemetry keyed by dataref name', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.emitUpdates([
      { id: 1, value: 42.5, receivedAt: 5 },
      { id: 3, value: 270, receivedAt: 5 },
      { id: 777, value: 1, receivedAt: 5 },
    ]);
    expect(snapshot().telemetry).toEqual({
      [MVP_DATAREFS.heartbeat]: { value: 42.5, receivedAt: 5 },
      [MVP_DATAREFS.heading]: { value: 270, receivedAt: 5 },
    });
  });

  it('disconnect closes the socket, clears telemetry and returns to disconnected', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.emitUpdates([{ id: 1, value: 1, receivedAt: 1 }]);
    session.disconnect();
    expect(clients[0]?.disconnectWebSocket).toHaveBeenCalled();
    expect(snapshot().state).toBe('disconnected');
    expect(snapshot().telemetry).toEqual({});
    expect(snapshot().reconnectAttempt).toBe(0);
  });

  it('a second connect after error works', async () => {
    const client = new FakeClient();
    client.connectError = new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'refused' });
    const { session, snapshot } = setup({ clients: [client] });
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('error');
    client.connectError = null;
    await session.connect('192.168.1.100', 8086);
    expect(snapshot().state).toBe('connected');
  });
});

describe('SimulatorSession operations', () => {
  it('writes the heading and records success', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.writeHeading(95);
    expect(clients[0]?.writes).toEqual([{ id: 3, value: 95 }]);
    expect(snapshot().lastOperation).toEqual({ kind: 'write', ok: true, message: 'Wrote heading 95', at: 1234 });
  });

  it('rejects headings outside 0..360 without calling the client', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.writeHeading(400);
    expect(clients[0]?.writes).toEqual([]);
    expect(snapshot().lastOperation?.ok).toBe(false);
  });

  it('records a failed write', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.setDataRefValue.mockRejectedValueOnce(
      new AvionixError({ code: 'WRITE_FAILED', message: 'read only', simulatorErrorCode: 'dataref_is_readonly' }),
    );
    await session.writeHeading(10);
    expect(snapshot().lastOperation).toMatchObject({ kind: 'write', ok: false, message: expect.stringContaining('read only') });
    expect(snapshot().state).toBe('connected');
  });

  it('activates the heading-up command', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    await session.activateHeadingUp();
    expect(clients[0]?.activations).toEqual([9]);
    expect(snapshot().lastOperation).toMatchObject({ kind: 'command', ok: true });
  });

  it('refuses operations while not connected', async () => {
    const { session, snapshot } = setup();
    await session.writeHeading(10);
    expect(snapshot().lastOperation).toMatchObject({ ok: false, message: expect.stringContaining('not connected') });
  });
});

describe('SimulatorSession reconnect', () => {
  it('moves to reconnecting on unexpected close, backs off and reconnects', async () => {
    const first = new FakeClient();
    const second = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [first, second] });
    await session.connect('192.168.1.100', 8086);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    expect(snapshot().state).toBe('reconnecting');
    expect(snapshot().reconnectAttempt).toBe(1);
    expect(scheduler.queue[0]?.delayMs).toBe(1000);
    await scheduler.runNext();
    expect(snapshot().state).toBe('connected');
    expect(snapshot().reconnectAttempt).toBe(0);
    expect(second.subscribed.sort()).toEqual([1, 2, 3]);
  });

  it('gives up after maxAttempts with retryExhausted → error', async () => {
    const first = new FakeClient();
    const failing = new FakeClient();
    failing.connectError = new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'refused' });
    const { session, scheduler, snapshot } = setup({ clients: [first, failing] });
    await session.connect('192.168.1.100', 8086);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    const delays: number[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(snapshot().state).toBe('reconnecting');
      expect(snapshot().reconnectAttempt).toBe(attempt);
      delays.push(scheduler.queue[0]?.delayMs ?? -1);
      await scheduler.runNext();
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(snapshot().state).toBe('error');
    expect(snapshot().error?.code).toBe('WEBSOCKET_ERROR');
  });

  it('explicit disconnect during reconnecting cancels the timer', async () => {
    const first = new FakeClient();
    const { session, scheduler, snapshot } = setup({ clients: [first, new FakeClient()] });
    await session.connect('192.168.1.100', 8086);
    first.emitClose({ code: 1006, reason: '', wasClean: false, initiatedByClient: false });
    session.disconnect();
    expect(snapshot().state).toBe('disconnected');
    expect(scheduler.queue[0]?.cancelled).toBe(true);
    await scheduler.runNext();
    expect(snapshot().state).toBe('disconnected');
  });

  it('ignores a close initiated by the client', async () => {
    const { session, clients, snapshot } = setup();
    await session.connect('192.168.1.100', 8086);
    clients[0]?.emitClose({ code: 1000, reason: '', wasClean: true, initiatedByClient: true });
    expect(snapshot().state).toBe('connected');
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx jest tests/unit/application/simulator-session.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 5: Implement `src/application/simulator-session.ts`**

```ts
import { MVP_COMMAND_HEADING_UP, MVP_DATAREFS, MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import {
  type LastOperation,
  type SessionSnapshot,
  type StepStatus,
  initialDiagnostics,
  initialSnapshot,
} from '@/application/session-snapshot';
import { Store } from '@/application/store';
import { type XPlaneConnectionConfig, createConnectionConfig } from '@/domain/connection/connection-config';
import { type ConnectionState, transition } from '@/domain/connection/connection-state';
import { AvionixError, toAvionixError } from '@/domain/errors/avionix-error';
import { type ApiVersion, negotiateApiVersion } from '@/domain/simulator/api-version';
import type { SimulatorClient, SocketCloseInfo } from '@/domain/simulator/simulator-client';
import type { CommandDescriptor, DataRefDescriptor, DataRefUpdate } from '@/domain/simulator/types';
import { type Logger, silentLogger } from '@/infrastructure/logging/logger';
import { probeCapabilities } from '@/infrastructure/xplane/capabilities';
import type { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { createCommandRepository, createDataRefRepository } from '@/infrastructure/xplane/resolution-cache';
import { DEFAULT_RECONNECT_POLICY, type ReconnectPolicy, computeBackoffDelayMs } from '@/utils/backoff';

export interface Scheduler {
  schedule(callback: () => void, delayMs: number): () => void;
}

export const realScheduler: Scheduler = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

export interface SimulatorSessionDeps {
  createHttpTransport: (config: XPlaneConnectionConfig) => HttpTransport;
  createClient: (config: XPlaneConnectionConfig, apiVersion: ApiVersion, http: HttpTransport) => SimulatorClient;
  scheduler?: Scheduler;
  reconnectPolicy?: ReconnectPolicy;
  random?: () => number;
  logger?: Logger;
  now?: () => number;
}

type FlowMode = 'initial' | 'reconnect';

interface ActiveConnection {
  generation: number;
  config: XPlaneConnectionConfig;
  client: SimulatorClient;
  dataRefsById: Map<number, DataRefDescriptor>;
  dataRefsByName: Map<string, DataRefDescriptor>;
  headingUp: CommandDescriptor;
  unsubscribe: () => void;
}

export class SimulatorSession {
  readonly store: Store<SessionSnapshot>;
  private readonly scheduler: Scheduler;
  private readonly policy: ReconnectPolicy;
  private readonly random: () => number;
  private readonly logger: Logger;
  private readonly now: () => number;
  private generation = 0;
  private active: ActiveConnection | null = null;
  private cancelReconnect: (() => void) | null = null;

  constructor(private readonly deps: SimulatorSessionDeps) {
    this.store = new Store(initialSnapshot(MVP_DATAREF_NAMES));
    this.scheduler = deps.scheduler ?? realScheduler;
    this.policy = deps.reconnectPolicy ?? DEFAULT_RECONNECT_POLICY;
    this.random = deps.random ?? Math.random;
    this.logger = deps.logger ?? silentLogger;
    this.now = deps.now ?? Date.now;
  }

  async connect(host: string, port: string | number): Promise<void> {
    this.teardown();
    const generation = this.nextGeneration();
    // Any previous state first returns to disconnected, then to connecting; both edges are in the table.
    this.store.setState((prev) => ({
      ...initialSnapshot(MVP_DATAREF_NAMES),
      state: transition(this.settled(prev.state), 'connect'),
    }));
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
    await this.runConnectFlow(generation, config, 'initial');
  }

  disconnect(): void {
    this.teardown();
    this.nextGeneration();
    this.store.setState((prev) => ({
      ...prev,
      state: this.settled(prev.state),
      diagnostics: initialDiagnostics(MVP_DATAREF_NAMES),
      telemetry: {},
      reconnectAttempt: 0,
      error: null,
    }));
  }

  async writeHeading(value: number): Promise<void> {
    if (!Number.isFinite(value) || value < 0 || value > 360) {
      this.recordOperation({ kind: 'write', ok: false, message: 'Heading must be between 0 and 360' });
      return;
    }
    const active = this.requireActive('write');
    if (active === null) {
      return;
    }
    const heading = active.dataRefsByName.get(MVP_DATAREFS.heading);
    if (heading === undefined) {
      this.recordOperation({ kind: 'write', ok: false, message: 'Heading dataref is not resolved' });
      return;
    }
    try {
      await active.client.setDataRefValue(heading.id, value);
      this.recordOperation({ kind: 'write', ok: true, message: `Wrote heading ${value}` });
    } catch (error) {
      const avionixError = toAvionixError(error, { code: 'WRITE_FAILED', message: 'Write failed' });
      this.recordOperation({ kind: 'write', ok: false, message: avionixError.message });
    }
  }

  async activateHeadingUp(): Promise<void> {
    const active = this.requireActive('command');
    if (active === null) {
      return;
    }
    try {
      await active.client.activateCommand(active.headingUp.id, 0);
      this.recordOperation({ kind: 'command', ok: true, message: `Activated ${MVP_COMMAND_HEADING_UP}` });
    } catch (error) {
      const avionixError = toAvionixError(error, { code: 'COMMAND_FAILED', message: 'Command failed' });
      this.recordOperation({ kind: 'command', ok: false, message: avionixError.message });
    }
  }

  // ---- internals ----------------------------------------------------------

  private nextGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  /** Returns `disconnected`, applying the `disconnect` edge when the state is not already there. */
  private settled(state: ConnectionState): ConnectionState {
    return state === 'disconnected' ? state : transition(state, 'disconnect');
  }

  private teardown(): void {
    if (this.cancelReconnect !== null) {
      this.cancelReconnect();
      this.cancelReconnect = null;
    }
    const active = this.active;
    this.active = null;
    if (active !== null) {
      active.unsubscribe();
      active.client.disconnectWebSocket();
    }
  }

  private requireActive(kind: LastOperation['kind']): ActiveConnection | null {
    const active = this.active;
    if (active === null || this.store.getSnapshot().state !== 'connected') {
      this.recordOperation({ kind, ok: false, message: 'Avionix is not connected to X-Plane' });
      return null;
    }
    return active;
  }

  private recordOperation(operation: Omit<LastOperation, 'at'>): void {
    this.store.setState((prev) => ({ ...prev, lastOperation: { ...operation, at: this.now() } }));
  }

  private setStep(update: (diagnostics: SessionSnapshot['diagnostics']) => SessionSnapshot['diagnostics']): void {
    this.store.setState((prev) => ({ ...prev, diagnostics: update(prev.diagnostics) }));
  }

  private setDataRefStep(name: string, status: StepStatus): void {
    this.setStep((d) => ({ ...d, dataRefs: { ...d.dataRefs, [name]: status } }));
  }

  /**
   * Records a failure. In `initial` mode the state machine takes the `failed` edge
   * (connecting → error, connected → error). In `reconnect` mode the state stays
   * `reconnecting`; `runReconnectAttempt` decides whether to retry or exhaust.
   */
  private markFailure(error: AvionixError, mode: FlowMode): void {
    this.logger.warn('session failure', { code: error.code, message: error.message, mode });
    this.store.setState((prev) => ({
      ...prev,
      state: mode === 'initial' ? transition(prev.state, 'failed') : prev.state,
      error,
    }));
  }

  /**
   * Runs the full connect flow: capabilities → version → WebSocket → resolution → subscription.
   * Returns true on success. In `initial` mode the state becomes `connected` as soon as the
   * socket is open (later steps are visible in diagnostics). In `reconnect` mode the state
   * becomes `connected` only when the whole flow has succeeded.
   */
  private async runConnectFlow(
    generation: number,
    config: XPlaneConnectionConfig,
    mode: FlowMode,
  ): Promise<boolean> {
    const http = this.deps.createHttpTransport(config);

    this.setStep((d) => ({ ...d, http: 'pending', capabilities: 'pending' }));
    let apiVersion: ApiVersion;
    try {
      const capabilities = await probeCapabilities(http);
      if (!this.isCurrent(generation)) {
        return false;
      }
      apiVersion = negotiateApiVersion(capabilities);
      this.store.setState((prev) => ({
        ...prev,
        capabilities,
        apiVersion,
        diagnostics: { ...prev.diagnostics, http: 'ok', capabilities: 'ok' },
      }));
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return false;
      }
      const avionixError = toAvionixError(error, { code: 'UNKNOWN', message: 'Capabilities check failed' });
      const httpStatus: StepStatus = avionixError.code === 'UNSUPPORTED_API' ? 'ok' : 'failed';
      this.setStep((d) => ({ ...d, http: httpStatus, capabilities: 'failed' }));
      this.markFailure(avionixError, mode);
      return false;
    }

    const client = this.deps.createClient(config, apiVersion, http);
    this.setStep((d) => ({ ...d, websocket: 'pending' }));
    try {
      await client.connectWebSocket();
      if (!this.isCurrent(generation)) {
        client.disconnectWebSocket();
        return false;
      }
      this.setStep((d) => ({ ...d, websocket: 'ok' }));
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return false;
      }
      this.setStep((d) => ({ ...d, websocket: 'failed' }));
      this.markFailure(
        toAvionixError(error, { code: 'WEBSOCKET_ERROR', message: 'WebSocket connection failed' }),
        mode,
      );
      return false;
    }

    if (mode === 'initial') {
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'connected'),
        error: null,
      }));
    }

    const dataRefs = createDataRefRepository(client);
    const commands = createCommandRepository(client);
    const dataRefsById = new Map<number, DataRefDescriptor>();
    const dataRefsByName = new Map<string, DataRefDescriptor>();
    for (const name of MVP_DATAREF_NAMES) {
      this.setDataRefStep(name, 'pending');
    }
    this.setStep((d) => ({ ...d, command: 'pending' }));
    let headingUp: CommandDescriptor;
    try {
      const resolved = await Promise.all(
        MVP_DATAREF_NAMES.map(async (name) => {
          try {
            const descriptor = await dataRefs.resolve(name);
            if (this.isCurrent(generation)) {
              this.setDataRefStep(name, 'ok');
            }
            return descriptor;
          } catch (error) {
            if (this.isCurrent(generation)) {
              this.setDataRefStep(name, 'failed');
            }
            throw error;
          }
        }),
      );
      for (const descriptor of resolved) {
        dataRefsById.set(descriptor.id, descriptor);
        dataRefsByName.set(descriptor.name, descriptor);
      }
      headingUp = await commands.resolve(MVP_COMMAND_HEADING_UP);
      if (!this.isCurrent(generation)) {
        client.disconnectWebSocket();
        return false;
      }
      this.setStep((d) => ({ ...d, command: 'ok' }));
    } catch (error) {
      client.disconnectWebSocket();
      if (!this.isCurrent(generation)) {
        return false;
      }
      this.setStep((d) => ({ ...d, command: d.command === 'ok' ? 'ok' : 'failed' }));
      this.markFailure(
        toAvionixError(error, { code: 'DATAREF_NOT_FOUND', message: 'Resolution failed' }),
        mode,
      );
      return false;
    }

    const unsubscribeUpdates = client.onDataRefUpdate((updates) => {
      if (this.isCurrent(generation)) {
        this.applyUpdates(dataRefsById, updates);
      }
    });
    const unsubscribeClose = client.onSocketClosed((info) => {
      if (this.isCurrent(generation)) {
        this.handleSocketClosed(generation, info);
      }
    });
    this.active = {
      generation,
      config,
      client,
      dataRefsById,
      dataRefsByName,
      headingUp,
      unsubscribe: () => {
        unsubscribeUpdates();
        unsubscribeClose();
      },
    };

    this.setStep((d) => ({ ...d, subscription: 'pending' }));
    try {
      await client.subscribeDataRefs([...dataRefsById.keys()].map((id) => ({ id })));
      if (!this.isCurrent(generation)) {
        return false;
      }
      this.setStep((d) => ({ ...d, subscription: 'ok' }));
      this.store.setState((prev) => ({
        ...prev,
        state: mode === 'reconnect' ? transition(prev.state, 'connected') : prev.state,
        reconnectAttempt: 0,
        error: null,
      }));
      this.logger.info('session connected', { host: config.host, port: config.port, apiVersion, mode });
      return true;
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return false;
      }
      this.setStep((d) => ({ ...d, subscription: 'failed' }));
      this.teardown();
      this.markFailure(
        toAvionixError(error, { code: 'SUBSCRIPTION_FAILED', message: 'Subscription failed' }),
        mode,
      );
      return false;
    }
  }

  private applyUpdates(dataRefsById: Map<number, DataRefDescriptor>, updates: DataRefUpdate[]): void {
    this.store.setState((prev) => {
      const telemetry = { ...prev.telemetry };
      let changed = false;
      for (const update of updates) {
        const descriptor = dataRefsById.get(update.id);
        if (descriptor === undefined) {
          continue;
        }
        telemetry[descriptor.name] = { value: update.value, receivedAt: update.receivedAt };
        changed = true;
      }
      return changed ? { ...prev, telemetry } : prev;
    });
  }

  private handleSocketClosed(generation: number, info: SocketCloseInfo): void {
    if (info.initiatedByClient || this.store.getSnapshot().state !== 'connected') {
      return;
    }
    this.logger.warn('socket lost', { code: info.code, reason: info.reason });
    const active = this.active;
    this.active = null;
    active?.unsubscribe();
    this.store.setState((prev) => ({
      ...prev,
      state: transition(prev.state, 'socketLost'),
      diagnostics: { ...prev.diagnostics, websocket: 'failed', subscription: 'idle' },
    }));
    this.scheduleReconnect(generation, 1);
  }

  private scheduleReconnect(previousGeneration: number, attempt: number): void {
    const config = this.store.getSnapshot().config;
    if (config === null) {
      return;
    }
    this.store.setState((prev) => ({ ...prev, reconnectAttempt: attempt }));
    const delayMs = computeBackoffDelayMs(attempt, this.policy, this.random);
    this.logger.info('scheduling reconnect', { attempt, delayMs });
    this.cancelReconnect = this.scheduler.schedule(() => {
      this.cancelReconnect = null;
      if (!this.isCurrent(previousGeneration)) {
        return;
      }
      const generation = this.nextGeneration();
      this.store.setState((prev) => ({
        ...prev,
        diagnostics: initialDiagnostics(MVP_DATAREF_NAMES),
        telemetry: {},
      }));
      void this.runReconnectAttempt(generation, config, attempt);
    }, delayMs);
  }

  private async runReconnectAttempt(
    generation: number,
    config: XPlaneConnectionConfig,
    attempt: number,
  ): Promise<void> {
    const ok = await this.runConnectFlow(generation, config, 'reconnect');
    if (ok || !this.isCurrent(generation)) {
      return;
    }
    if (attempt >= this.policy.maxAttempts) {
      this.store.setState((prev) => ({
        ...prev,
        state: transition(prev.state, 'retryExhausted'),
        error:
          prev.error ??
          new AvionixError({ code: 'WEBSOCKET_ERROR', message: 'Reconnect attempts exhausted', retryable: true }),
      }));
      return;
    }
    this.scheduleReconnect(generation, attempt + 1);
  }
}
```

Implementation notes for the executor:
- Every state change goes through `transition()`; the table (Task 2) includes `connected --failed--> error` for failures that happen after the socket opened (resolution or subscription) in `initial` mode.
- `mode === 'reconnect'` never touches the state until the flow succeeds (`reconnecting --connected--> connected`) or `runReconnectAttempt` exhausts (`reconnecting --retryExhausted--> error`). A socket that opens and then fails mid-flow during a reconnect is closed by the flow itself, and `handleSocketClosed` ignores it because the state is not `connected`.
- The generation counter makes late async completions from an abandoned connect or reconnect harmless: every await is followed by an `isCurrent(generation)` check.

- [ ] **Step 6: Run the unit tests and iterate until green**

Run: `npx jest tests/unit/application`
Expected: PASS. If `transition` throws INTERNAL, print the offending `(state, event)` pair from the error message and check which mode the flow ran in; the table in Task 2 is the source of truth and must not be bypassed with direct state assignments.

- [ ] **Step 7: Write the integration test against the mock server**

`tests/integration/simulator-session.test.ts`:

```ts
import { MVP_DATAREFS } from '@/application/mvp-bindings';
import { SimulatorSession } from '@/application/simulator-session';
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

function createSession(): SimulatorSession {
  return new SimulatorSession({
    createHttpTransport: (config) =>
      new HttpTransport({ origin: `http://${config.host}:${config.port}`, logger: silentLogger, defaultTimeoutMs: 2000 }),
    createClient: (config, apiVersion, http) =>
      new XPlaneClient({ config, apiVersion, http, logger: silentLogger, requestTimeoutMs: 2000, connectTimeoutMs: 2000 }),
    reconnectPolicy: { maxAttempts: 3, baseDelayMs: 20, factor: 2, maxDelayMs: 100, jitterRatio: 0 },
    logger: silentLogger,
  });
}

describe('SimulatorSession against the mock X-Plane', () => {
  let server: MockXPlaneServer;

  beforeEach(async () => {
    server = await MockXPlaneServer.start({ updateIntervalMs: 10 });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('connects end to end, streams telemetry, writes and commands, then disconnects', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const snap = () => session.store.getSnapshot();
    expect(snap().state).toBe('connected');
    expect(snap().apiVersion).toBe('v3');
    expect(snap().capabilities?.simulatorVersion).toBe('12.4.0');

    await until(() => snap().telemetry[MVP_DATAREFS.heartbeat]?.value === 12.5);
    server.setDataRefValue('sim/time/total_running_time_sec', 20);
    await until(() => snap().telemetry[MVP_DATAREFS.heartbeat]?.value === 20);

    await session.writeHeading(123);
    expect(snap().lastOperation).toMatchObject({ kind: 'write', ok: true });
    await until(() => snap().telemetry[MVP_DATAREFS.heading]?.value === 123);

    await session.activateHeadingUp();
    expect(snap().lastOperation).toMatchObject({ kind: 'command', ok: true });
    await until(() => snap().telemetry[MVP_DATAREFS.heading]?.value === 124);

    session.disconnect();
    expect(snap().state).toBe('disconnected');
    await until(() => server.connectionCount === 0);
  });

  it('reports INCOMING_TRAFFIC_DISABLED when X-Plane blocks incoming traffic', async () => {
    server.incomingTrafficDisabled = true;
    const session = createSession();
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().state).toBe('error');
    expect(session.store.getSnapshot().error?.code).toBe('INCOMING_TRAFFIC_DISABLED');
  });

  it('reports UNSUPPORTED_API for a v1-only simulator', async () => {
    await server.stop();
    server = await MockXPlaneServer.start({ apiVersions: ['v1'], xplaneVersion: '12.1.1' });
    const session = createSession();
    await session.connect(server.host, server.port);
    expect(session.store.getSnapshot().error?.code).toBe('UNSUPPORTED_API');
  });

  it('reconnects after the server drops the socket', async () => {
    const session = createSession();
    await session.connect(server.host, server.port);
    const snap = () => session.store.getSnapshot();
    server.terminateAllSockets();
    await until(() => snap().state === 'reconnecting');
    await until(() => snap().state === 'connected');
    await until(() => snap().telemetry[MVP_DATAREFS.heartbeat] !== undefined);
    session.disconnect();
  });

  it('two sessions connect independently and one acting does not disturb the other', async () => {
    const a = createSession();
    const b = createSession();
    await Promise.all([a.connect(server.host, server.port), b.connect(server.host, server.port)]);
    expect(server.connectionCount).toBe(2);
    await until(() => a.store.getSnapshot().telemetry[MVP_DATAREFS.heading] !== undefined);
    await until(() => b.store.getSnapshot().telemetry[MVP_DATAREFS.heading] !== undefined);
    await a.writeHeading(45);
    await until(() => b.store.getSnapshot().telemetry[MVP_DATAREFS.heading]?.value === 45);
    expect(b.store.getSnapshot().state).toBe('connected');
    a.disconnect();
    await until(() => server.connectionCount === 1);
    expect(b.store.getSnapshot().state).toBe('connected');
    b.disconnect();
  });
});
```

- [ ] **Step 8: Run, verify, commit**

```bash
npx jest tests/integration/simulator-session.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(application): add SimulatorSession orchestration with diagnostics, telemetry and bounded reconnect

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Connection settings persistence

**Files:**
- Create: `src/application/settings-store.ts`, `src/infrastructure/storage/async-storage-settings.ts`
- Test: `tests/unit/application/settings-store.test.ts`

**Interfaces:**
- Produces: `interface SettingsStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }`; `interface ConnectionSettings { host: string; port: number }`; `DEFAULT_CONNECTION_SETTINGS = { host: '', port: 8086 }`; `loadConnectionSettings(storage): Promise<ConnectionSettings>`; `saveConnectionSettings(storage, settings): Promise<void>`; `createMemorySettingsStorage(): SettingsStorage`; `createAsyncStorageSettings(): SettingsStorage`.

- [ ] **Step 1: Write the test**

`tests/unit/application/settings-store.test.ts`:

```ts
import {
  DEFAULT_CONNECTION_SETTINGS,
  createMemorySettingsStorage,
  loadConnectionSettings,
  saveConnectionSettings,
} from '@/application/settings-store';

describe('connection settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const storage = createMemorySettingsStorage();
    await expect(loadConnectionSettings(storage)).resolves.toEqual(DEFAULT_CONNECTION_SETTINGS);
    expect(DEFAULT_CONNECTION_SETTINGS).toEqual({ host: '', port: 8086 });
  });

  it('round-trips host and port', async () => {
    const storage = createMemorySettingsStorage();
    await saveConnectionSettings(storage, { host: '192.168.1.100', port: 8090 });
    await expect(loadConnectionSettings(storage)).resolves.toEqual({ host: '192.168.1.100', port: 8090 });
  });

  it('falls back to defaults on corrupt data', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem('avionix.connection', '{bad json');
    await expect(loadConnectionSettings(storage)).resolves.toEqual(DEFAULT_CONNECTION_SETTINGS);
    await storage.setItem('avionix.connection', JSON.stringify({ host: 5, port: 'x' }));
    await expect(loadConnectionSettings(storage)).resolves.toEqual(DEFAULT_CONNECTION_SETTINGS);
  });

  it('swallows storage read failures and returns defaults', async () => {
    const storage = { getItem: async () => { throw new Error('disk'); }, setItem: async () => undefined };
    await expect(loadConnectionSettings(storage)).resolves.toEqual(DEFAULT_CONNECTION_SETTINGS);
  });
});
```

- [ ] **Step 2: Implement `src/application/settings-store.ts`**

```ts
import { z } from 'zod';

import { DEFAULT_PORT } from '@/domain/connection/connection-config';

export interface SettingsStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ConnectionSettings {
  host: string;
  port: number;
}

export const DEFAULT_CONNECTION_SETTINGS: ConnectionSettings = { host: '', port: DEFAULT_PORT };

const STORAGE_KEY = 'avionix.connection';

const settingsSchema = z.object({ host: z.string(), port: z.number().int() });

export async function loadConnectionSettings(storage: SettingsStorage): Promise<ConnectionSettings> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_CONNECTION_SETTINGS;
    }
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_CONNECTION_SETTINGS;
  } catch {
    return DEFAULT_CONNECTION_SETTINGS;
  }
}

export async function saveConnectionSettings(
  storage: SettingsStorage,
  settings: ConnectionSettings,
): Promise<void> {
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is best effort; a failed save must never break connecting.
  }
}

export function createMemorySettingsStorage(): SettingsStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
  };
}
```

`src/infrastructure/storage/async-storage-settings.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SettingsStorage } from '@/application/settings-store';

export function createAsyncStorageSettings(): SettingsStorage {
  return {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
  };
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
npx jest tests/unit/application/settings-store.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(application): persist last X-Plane host and port

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Hooks, composition root and the MVP screen

**Files:**
- Create: `src/app/composition-root.ts`, `src/app/services-context.tsx`, `src/app/AvionixApp.tsx`, `src/hooks/useSimulatorSession.ts`, `src/hooks/useConnectionSettings.ts`, `src/features/connection/ConnectionForm.tsx`, `src/features/connection/ConnectionStatus.tsx`, `src/features/diagnostics/DiagnosticsPanel.tsx`, `src/features/mvp/TelemetryPanel.tsx`, `src/features/mvp/ControlPanel.tsx`, `src/features/mvp/MvpScreen.tsx`
- Modify: `App.tsx`
- Test: `tests/ui/mvp-screen.test.tsx`, `tests/ui/use-connection-settings.test.tsx`

**Interfaces:**
- Consumes: `SimulatorSession`, `Store`, `SessionSnapshot`, `SettingsStorage`, `loadConnectionSettings`, `saveConnectionSettings`, `MVP_DATAREFS`.
- Produces:
  - `type SessionApi = Pick<SimulatorSession, 'store' | 'connect' | 'disconnect' | 'writeHeading' | 'activateHeadingUp'>`
  - `interface AppServices { session: SessionApi; settingsStorage: SettingsStorage }`; `createAppServices(): AppServices`
  - `ServicesProvider`, `useServices(): AppServices`
  - `useSimulatorSession(): { snapshot: SessionSnapshot; connect; disconnect; writeHeading; activateHeadingUp }`
  - `useConnectionSettings(): { host: string; setHost; port: string; setPort; ready: boolean; persist(): Promise<void> }`

- [ ] **Step 1: Write the UI tests**

`tests/ui/mvp-screen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { MVP_DATAREFS, MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { AvionixError } from '@/domain/errors/avionix-error';
import { MvpScreen } from '@/features/mvp/MvpScreen';

function makeServices(snapshot: Partial<SessionSnapshot> = {}) {
  const store = new Store<SessionSnapshot>({ ...initialSnapshot(MVP_DATAREF_NAMES), ...snapshot });
  const session = {
    store,
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    writeHeading: jest.fn(async () => undefined),
    activateHeadingUp: jest.fn(async () => undefined),
  };
  const services: AppServices = { session, settingsStorage: createMemorySettingsStorage() };
  return { services, session, store };
}

function renderScreen(services: AppServices) {
  return render(
    <ServicesProvider services={services}>
      <MvpScreen />
    </ServicesProvider>,
  );
}

describe('MvpScreen', () => {
  it('shows the disconnected state with the default port and connects with the entered host', async () => {
    const { services, session } = makeServices();
    renderScreen(services);
    await waitFor(() => expect(screen.getByDisplayValue('8086')).toBeTruthy());
    expect(screen.getByText('Status: disconnected')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('X-Plane host'), '192.168.1.100');
    fireEvent.press(screen.getByText('Connect'));
    await waitFor(() => expect(session.connect).toHaveBeenCalledWith('192.168.1.100', '8086'));
  });

  it('renders connected status, versions, diagnostics and telemetry from the snapshot', async () => {
    const { services } = makeServices({
      state: 'connected',
      apiVersion: 'v3',
      capabilities: { simulatorVersion: '12.4.0', supportedApiVersions: ['v1', 'v2', 'v3'], rawApiVersions: ['v1', 'v2', 'v3'] },
      config: { host: '192.168.1.100', port: 8086 },
      diagnostics: {
        http: 'ok',
        capabilities: 'ok',
        websocket: 'ok',
        command: 'ok',
        subscription: 'ok',
        dataRefs: { [MVP_DATAREFS.heartbeat]: 'ok', [MVP_DATAREFS.airspeed]: 'ok', [MVP_DATAREFS.heading]: 'ok' },
      },
      telemetry: {
        [MVP_DATAREFS.airspeed]: { value: 124.3, receivedAt: Date.now() },
        [MVP_DATAREFS.heading]: { value: 270, receivedAt: Date.now() },
      },
    });
    renderScreen(services);
    await waitFor(() => expect(screen.getByText('Status: connected')).toBeTruthy());
    expect(screen.getByText('X-Plane version: 12.4.0')).toBeTruthy();
    expect(screen.getByText('API versions: v1, v2, v3 (using v3)')).toBeTruthy();
    expect(screen.getByText('WebSocket: YES')).toBeTruthy();
    expect(screen.getByText('Subscription: YES')).toBeTruthy();
    expect(screen.getByText('124.3')).toBeTruthy();
    expect(screen.getByText('270')).toBeTruthy();
    expect(screen.getByText('Disconnect')).toBeTruthy();
  });

  it('shows the error message and the failing step', async () => {
    const { services } = makeServices({
      state: 'error',
      error: new AvionixError({ code: 'INCOMING_TRAFFIC_DISABLED', message: 'X-Plane refused the request (HTTP 403).' }),
      diagnostics: {
        http: 'ok',
        capabilities: 'failed',
        websocket: 'idle',
        command: 'idle',
        subscription: 'idle',
        dataRefs: { [MVP_DATAREFS.heartbeat]: 'idle', [MVP_DATAREFS.airspeed]: 'idle', [MVP_DATAREFS.heading]: 'idle' },
      },
    });
    renderScreen(services);
    await waitFor(() => expect(screen.getByText('Status: error')).toBeTruthy());
    expect(screen.getByText('INCOMING_TRAFFIC_DISABLED: X-Plane refused the request (HTTP 403).')).toBeTruthy();
    expect(screen.getByText('Capabilities: NO')).toBeTruthy();
  });

  it('writes the heading and activates the command, showing the last operation', async () => {
    const { services, session, store } = makeServices({ state: 'connected' });
    renderScreen(services);
    fireEvent.changeText(screen.getByLabelText('Heading to write'), '95');
    fireEvent.press(screen.getByText('Write heading'));
    await waitFor(() => expect(session.writeHeading).toHaveBeenCalledWith(95));
    fireEvent.press(screen.getByText('Heading up'));
    await waitFor(() => expect(session.activateHeadingUp).toHaveBeenCalled());
    store.setState((prev) => ({ ...prev, lastOperation: { kind: 'command', ok: true, message: 'Activated sim/autopilot/heading_up', at: 1 } }));
    await waitFor(() => expect(screen.getByText('Last operation: OK Activated sim/autopilot/heading_up')).toBeTruthy());
  });

  it('calls disconnect', async () => {
    const { services, session } = makeServices({ state: 'connected' });
    renderScreen(services);
    fireEvent.press(screen.getByText('Disconnect'));
    expect(session.disconnect).toHaveBeenCalled();
  });
});
```

`tests/ui/use-connection-settings.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { createMemorySettingsStorage, saveConnectionSettings } from '@/application/settings-store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { initialSnapshot } from '@/application/session-snapshot';
import { Store } from '@/application/store';

function wrapperFor(services: AppServices) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <ServicesProvider services={services}>{children}</ServicesProvider>;
  };
}

function services(storage = createMemorySettingsStorage()): AppServices {
  return {
    settingsStorage: storage,
    session: {
      store: new Store(initialSnapshot(MVP_DATAREF_NAMES)),
      connect: async () => undefined,
      disconnect: () => undefined,
      writeHeading: async () => undefined,
      activateHeadingUp: async () => undefined,
    },
  };
}

describe('useConnectionSettings', () => {
  it('loads persisted values and persists edits', async () => {
    const storage = createMemorySettingsStorage();
    await saveConnectionSettings(storage, { host: '10.0.0.5', port: 8090 });
    const { result } = renderHook(() => useConnectionSettings(), { wrapper: wrapperFor(services(storage)) });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.host).toBe('10.0.0.5');
    expect(result.current.port).toBe('8090');
    act(() => result.current.setHost('10.0.0.9'));
    await act(async () => {
      await result.current.persist();
    });
    expect(await storage.getItem('avionix.connection')).toBe(JSON.stringify({ host: '10.0.0.9', port: 8090 }));
  });

  it('does not persist an unparseable port', async () => {
    const storage = createMemorySettingsStorage();
    const { result } = renderHook(() => useConnectionSettings(), { wrapper: wrapperFor(services(storage)) });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setPort('abc'));
    await act(async () => {
      await result.current.persist();
    });
    expect(await storage.getItem('avionix.connection')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest --selectProjects expo`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement services context, composition root and hooks**

`src/app/services-context.tsx`:

```tsx
import React, { createContext, useContext } from 'react';

import type { SettingsStorage } from '@/application/settings-store';
import type { SimulatorSession } from '@/application/simulator-session';

export type SessionApi = Pick<
  SimulatorSession,
  'store' | 'connect' | 'disconnect' | 'writeHeading' | 'activateHeadingUp'
>;

export interface AppServices {
  session: SessionApi;
  settingsStorage: SettingsStorage;
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: React.ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error('useServices must be used inside ServicesProvider');
  }
  return services;
}
```

`src/app/composition-root.ts`:

```ts
import type { AppServices } from '@/app/services-context';
import { SimulatorSession } from '@/application/simulator-session';
import { httpOrigin } from '@/domain/connection/endpoints';
import { createLogger } from '@/infrastructure/logging/logger';
import { createAsyncStorageSettings } from '@/infrastructure/storage/async-storage-settings';
import { HttpTransport } from '@/infrastructure/xplane/http/http-transport';
import { XPlaneClient } from '@/infrastructure/xplane/xplane-client';

export function createAppServices(): AppServices {
  const session = new SimulatorSession({
    createHttpTransport: (config) =>
      new HttpTransport({
        origin: httpOrigin(config),
        logger: createLogger('http'),
      }),
    createClient: (config, apiVersion, http) =>
      new XPlaneClient({ config, apiVersion, http, logger: createLogger('websocket') }),
    logger: createLogger('session'),
  });
  return { session, settingsStorage: createAsyncStorageSettings() };
}
```

`src/hooks/useSimulatorSession.ts`:

```ts
import { useCallback, useSyncExternalStore } from 'react';

import { useServices } from '@/app/services-context';
import type { SessionSnapshot } from '@/application/session-snapshot';

export function useSimulatorSession() {
  const { session } = useServices();
  const snapshot: SessionSnapshot = useSyncExternalStore(session.store.subscribe, session.store.getSnapshot);
  const connect = useCallback((host: string, port: string) => session.connect(host, port), [session]);
  const disconnect = useCallback(() => session.disconnect(), [session]);
  const writeHeading = useCallback((value: number) => session.writeHeading(value), [session]);
  const activateHeadingUp = useCallback(() => session.activateHeadingUp(), [session]);
  return { snapshot, connect, disconnect, writeHeading, activateHeadingUp };
}
```

`src/hooks/useConnectionSettings.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

import { useServices } from '@/app/services-context';
import {
  DEFAULT_CONNECTION_SETTINGS,
  loadConnectionSettings,
  saveConnectionSettings,
} from '@/application/settings-store';

export function useConnectionSettings() {
  const { settingsStorage } = useServices();
  const [host, setHost] = useState(DEFAULT_CONNECTION_SETTINGS.host);
  const [port, setPort] = useState(String(DEFAULT_CONNECTION_SETTINGS.port));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadConnectionSettings(settingsStorage).then((settings) => {
      if (cancelled) {
        return;
      }
      setHost(settings.host);
      setPort(String(settings.port));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [settingsStorage]);

  const persist = useCallback(async () => {
    const parsedPort = Number(port.trim());
    if (!/^\d+$/.test(port.trim()) || !Number.isInteger(parsedPort)) {
      return;
    }
    await saveConnectionSettings(settingsStorage, { host: host.trim(), port: parsedPort });
  }, [host, port, settingsStorage]);

  return { host, setHost, port, setPort, ready, persist };
}
```

- [ ] **Step 4: Implement the feature components**

`src/features/connection/ConnectionForm.tsx`:

```tsx
import React from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ConnectionState } from '@/domain/connection/connection-state';

interface Props {
  host: string;
  port: string;
  state: ConnectionState;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectionForm(props: Props) {
  const busy = props.state === 'connecting' || props.state === 'reconnecting';
  const connected = props.state === 'connected' || busy;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Connection</Text>
      <Text>X-Plane host (IP or hostname on your LAN)</Text>
      <TextInput
        accessibilityLabel="X-Plane host"
        style={styles.input}
        value={props.host}
        onChangeText={props.onHostChange}
        placeholder="192.168.1.100"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!connected}
      />
      <Text>Port</Text>
      <TextInput
        accessibilityLabel="Port"
        style={styles.input}
        value={props.port}
        onChangeText={props.onPortChange}
        keyboardType="number-pad"
        editable={!connected}
      />
      <View style={styles.row}>
        <Button title="Connect" onPress={props.onConnect} disabled={connected} />
        <Button title="Disconnect" onPress={props.onDisconnect} disabled={props.state === 'disconnected'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#888', padding: 8, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
});
```

`src/features/connection/ConnectionStatus.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';

export function ConnectionStatus({ snapshot }: { snapshot: SessionSnapshot }) {
  const versions = snapshot.capabilities?.rawApiVersions.join(', ') ?? '-';
  const using = snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Status</Text>
      <Text>Status: {snapshot.state}</Text>
      {snapshot.state === 'reconnecting' ? <Text>Reconnect attempt: {snapshot.reconnectAttempt}</Text> : null}
      <Text>X-Plane version: {snapshot.capabilities?.simulatorVersion ?? '-'}</Text>
      <Text>
        API versions: {versions}
        {using}
      </Text>
      {snapshot.error !== null ? (
        <Text style={styles.error}>
          {snapshot.error.code}: {snapshot.error.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  error: { color: '#b00020', marginTop: 4 },
});
```

`src/features/diagnostics/DiagnosticsPanel.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionSnapshot, StepStatus } from '@/application/session-snapshot';

function label(status: StepStatus): string {
  switch (status) {
    case 'ok':
      return 'YES';
    case 'failed':
      return 'NO';
    case 'pending':
      return '...';
    case 'idle':
      return '-';
  }
}

export function DiagnosticsPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  const d = snapshot.diagnostics;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Diagnostics</Text>
      <Text>
        Target: {snapshot.config === null ? '-' : `${snapshot.config.host}:${snapshot.config.port}`}
      </Text>
      <Text>HTTP: {label(d.http)}</Text>
      <Text>Capabilities: {label(d.capabilities)}</Text>
      <Text>WebSocket: {label(d.websocket)}</Text>
      {Object.entries(d.dataRefs).map(([name, status]) => (
        <Text key={name}>
          DataRef {name}: {label(status)}
        </Text>
      ))}
      <Text>Command: {label(d.command)}</Text>
      <Text>Subscription: {label(d.subscription)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
});
```

`src/features/mvp/TelemetryPanel.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MVP_DATAREFS } from '@/application/mvp-bindings';
import type { SessionSnapshot, TelemetrySample } from '@/application/session-snapshot';

function formatValue(sample: TelemetrySample | undefined): string {
  if (sample === undefined) {
    return '-';
  }
  if (typeof sample.value === 'number') {
    return Number.isInteger(sample.value) ? String(sample.value) : sample.value.toFixed(1);
  }
  if (Array.isArray(sample.value)) {
    return `[${sample.value.join(', ')}]`;
  }
  return sample.value;
}

const ROWS: Array<{ label: string; name: string }> = [
  { label: 'Sim running time (s)', name: MVP_DATAREFS.heartbeat },
  { label: 'Indicated airspeed (kt)', name: MVP_DATAREFS.airspeed },
  { label: 'Heading bug (deg)', name: MVP_DATAREFS.heading },
];

export function TelemetryPanel({ snapshot, now }: { snapshot: SessionSnapshot; now: number }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Live telemetry</Text>
      {ROWS.map((row) => {
        const sample = snapshot.telemetry[row.name];
        const age = sample === undefined ? '' : ` (${Math.max(0, Math.round((now - sample.receivedAt) / 1000))}s ago)`;
        return (
          <View key={row.name} style={styles.row}>
            <Text>{row.label}</Text>
            <Text style={styles.value}>{formatValue(sample)}</Text>
            <Text style={styles.muted}>{age}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  value: { fontVariant: ['tabular-nums'], fontWeight: 'bold' },
  muted: { color: '#666' },
});
```

`src/features/mvp/ControlPanel.tsx`:

```tsx
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { LastOperation } from '@/application/session-snapshot';

interface Props {
  enabled: boolean;
  lastOperation: LastOperation | null;
  onWriteHeading: (value: number) => void;
  onHeadingUp: () => void;
}

export function ControlPanel(props: Props) {
  const [heading, setHeading] = useState('90');
  const parsed = Number(heading);
  const canWrite = props.enabled && heading.trim() !== '' && Number.isFinite(parsed);
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Test controls</Text>
      <Text>Heading bug to write (0-360)</Text>
      <TextInput
        accessibilityLabel="Heading to write"
        style={styles.input}
        value={heading}
        onChangeText={setHeading}
        keyboardType="numeric"
      />
      <View style={styles.row}>
        <Button title="Write heading" onPress={() => props.onWriteHeading(parsed)} disabled={!canWrite} />
        <Button title="Heading up" onPress={props.onHeadingUp} disabled={!props.enabled} />
      </View>
      <Text>
        Last operation:{' '}
        {props.lastOperation === null
          ? '-'
          : `${props.lastOperation.ok ? 'OK' : 'FAILED'} ${props.lastOperation.message}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#888', padding: 8, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 8 },
});
```

`src/features/mvp/MvpScreen.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { ConnectionForm } from '@/features/connection/ConnectionForm';
import { ConnectionStatus } from '@/features/connection/ConnectionStatus';
import { DiagnosticsPanel } from '@/features/diagnostics/DiagnosticsPanel';
import { ControlPanel } from '@/features/mvp/ControlPanel';
import { TelemetryPanel } from '@/features/mvp/TelemetryPanel';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';

export function MvpScreen() {
  const { snapshot, connect, disconnect, writeHeading, activateHeadingUp } = useSimulatorSession();
  const settings = useConnectionSettings();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const onConnect = useCallback(() => {
    void settings.persist();
    void connect(settings.host, settings.port);
  }, [connect, settings]);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Avionix</Text>
      <ConnectionForm
        host={settings.host}
        port={settings.port}
        state={snapshot.state}
        onHostChange={settings.setHost}
        onPortChange={settings.setPort}
        onConnect={onConnect}
        onDisconnect={disconnect}
      />
      <ConnectionStatus snapshot={snapshot} />
      <DiagnosticsPanel snapshot={snapshot} />
      <TelemetryPanel snapshot={snapshot} now={now} />
      <ControlPanel
        enabled={snapshot.state === 'connected'}
        lastOperation={snapshot.lastOperation}
        onWriteHeading={(value) => void writeHeading(value)}
        onHeadingUp={() => void activateHeadingUp()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 56 },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
});
```

`src/app/AvionixApp.tsx`:

```tsx
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';

import { createAppServices } from '@/app/composition-root';
import { ServicesProvider } from '@/app/services-context';
import { MvpScreen } from '@/features/mvp/MvpScreen';

export function AvionixApp() {
  const services = useMemo(() => createAppServices(), []);
  return (
    <ServicesProvider services={services}>
      <StatusBar style="auto" />
      <MvpScreen />
    </ServicesProvider>
  );
}
```

`App.tsx`:

```tsx
import { AvionixApp } from '@/app/AvionixApp';

export default function App() {
  return <AvionixApp />;
}
```

- [ ] **Step 5: Run the UI tests and iterate**

Run: `npx jest --selectProjects expo`
Expected: PASS. If `getByLabelText` cannot find inputs, confirm `accessibilityLabel` props are present. If `AsyncStorage` is imported during UI tests (it should not be, since tests use the memory storage and never import the composition root), add `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))` at the top of the affected test.

- [ ] **Step 6: Start the bundler once to prove the entry point resolves**

```bash
npx expo export --platform android --output-dir dist >/dev/null && echo EXPORT_OK
```

Expected: `EXPORT_OK`. This validates the `@/` alias and every import in Metro without launching a device.

- [ ] **Step 7: Full verification and commit**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:validate
git add -A
git commit -m "feat(ui): add MVP screen with connection form, diagnostics, live telemetry and test controls

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Documentation, smoke-test procedure and final verification

**Files:**
- Create: `README.md`, `docs/architecture.md`, `docs/development.md`, `docs/xplane.md`, `docs/testing/xplane-smoke-test.md`

**Interfaces:**
- Consumes: everything above. No code changes except fixes found during the final verification.

- [ ] **Step 1: Write `README.md`**

```markdown
# Avionix

Avionix is a React Native (Expo) companion app for X-Plane 12. The long-term goal is to let
phones and tablets act as distributed cockpit panels (controls, PFD, MFD, CDU, radios, ...).

This repository currently contains the **connectivity MVP**: it proves that a mobile device on
the same LAN can talk to X-Plane 12 through the built-in X-Plane Web API, stream live DataRefs
over WebSocket, write a DataRef and activate a command, and recover from connection loss.

## MVP scope

- Enter the X-Plane host and port (default 8086), connect and disconnect.
- Detect the X-Plane version and the supported Web API versions; use the highest of v2/v3.
- Resolve DataRefs and commands by name (ids are session-specific and never stored).
- Subscribe to three DataRefs over WebSocket and display live values.
- Write the autopilot heading bug and activate `sim/autopilot/heading_up`.
- Bounded automatic reconnect after an unexpected socket loss.
- A diagnostics panel that shows exactly which step failed.

Not in scope: any real avionics UI, device roles, pairing, accounts, cloud. See
`docs/superpowers/specs/2026-09-14-avionix-mvp-design.md` for the full design.

## Requirements

- X-Plane 12.1.4 or newer (Web API v2). Network settings must not be set to
  "Disable Incoming Traffic".
- Node.js 22, npm 10.
- Expo Go on a physical iPhone or Android device (same Wi-Fi as the X-Plane computer).

## Stack

Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6 (strict), zod 4, Jest 29 (jest-expo),
@testing-library/react-native, ESLint (eslint-config-expo, flat config), Prettier.

## Architecture in one picture

```
Screen → hook (useSyncExternalStore) → SimulatorSession → SimulatorClient (XPlaneClient)
      → HttpTransport / WebSocketTransport → X-Plane Web API (REST + WebSocket)
```

The UI never sees a URL or a protocol message. See `docs/architecture.md`.

## Getting started

```bash
npm install
npm start
```

Scan the QR code with Expo Go. On iOS, Expo Go for SDK 57 requires the same Expo account to be
logged in both in the CLI (`npx expo login`) and in the app. See `docs/development.md`.

## Connecting to X-Plane

1. Start X-Plane 12.1.4+ on a computer on the same Wi-Fi network as the phone.
2. Find the computer's LAN IP address (for example `192.168.1.100`).
3. In Avionix enter that IP and port 8086, then press Connect.
4. The diagnostics section shows each step: HTTP, capabilities, WebSocket, DataRef resolution,
   command resolution, subscription.

`localhost` or `127.0.0.1` never works from a physical phone. See `docs/development.md` for
emulator specifics and `docs/testing/xplane-smoke-test.md` for the manual verification procedure.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Expo dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `expo lint` (includes Prettier rules) |
| `npm run format` / `npm run format:check` | Prettier |
| `npm test` | Jest, both projects (`node`: domain/infrastructure/integration with a mock X-Plane; `expo`: UI) |
| `npm run build:validate` | `expo export` for iOS and Android bundles |

## Current limitations

- Only the three MVP DataRefs and one command are wired up.
- iOS App Transport Security for plain `http://` to an IP literal is only exercised in Expo Go;
  a development build must confirm the `NSAllowsLocalNetworking` setting in `app.json`.
- No automatic discovery of the X-Plane host; the IP must be typed.
- Base64 `data` DataRefs are displayed raw.
```

- [ ] **Step 2: Write `docs/architecture.md`**

```markdown
# Architecture

## Layers

| Layer | Directory | Depends on | Contains |
|---|---|---|---|
| Domain | `src/domain` | nothing | `AvionixError`, connection config validation, URL derivation, the connection state table, API version negotiation, simulator types, the `SimulatorClient` port |
| Infrastructure | `src/infrastructure` | domain | zod schemas and mappers for X-Plane payloads, `HttpTransport`, `WebSocketTransport` + `RequestManager`, `XPlaneClient`, name resolution caches, logging, AsyncStorage adapter |
| Application | `src/application` | domain, infrastructure | `SimulatorSession` (connect flow, diagnostics, telemetry, reconnect), `Store`, snapshot types, settings |
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
      2. GET /api/capabilities                    (HttpTransport)
      3. negotiateApiVersion                      (domain)
      4. XPlaneClient.connectWebSocket            (WebSocketTransport)
      5. state = connected
      6. resolve MVP DataRefs + command by name   (ResolutionCache → REST)
      7. dataref_subscribe_values                 (WebSocket)
      8. dataref_update_values → DataRefUpdate[] → snapshot.telemetry
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
error --disconnect--> disconnected
```

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
do not interfere with each other. Device roles and pairing are intentionally not implemented.
```

- [ ] **Step 3: Write `docs/development.md`**

```markdown
# Development

## Prerequisites

- Node.js 22 and npm 10.
- Expo Go on a physical device (recommended for the MVP; no native modules are used, so no
  development build is required).
- An Expo account: Expo Go for SDK 57 on iOS requires the same account to be logged in with
  `npx expo login` and inside the Expo Go app (Home tab → avatar). Android Expo Go does not require
  this yet. Development builds never require it.

## Running

```bash
npm install
npm start
```

Press `s` to switch to Expo Go mode if needed, then scan the QR code.

## Networking

```
Phone (Expo Go / Avionix)
  ↓ Wi-Fi
Router
  ↓ LAN
Computer running X-Plane 12 (web server on port 8086)
```

- The phone and the X-Plane computer must be on the same network, and the router must allow
  client-to-client traffic (some guest networks block it).
- Use the computer's LAN IP address. `localhost` and `127.0.0.1` refer to the phone itself.
- Windows: allow X-Plane through the firewall for private networks. macOS: allow incoming
  connections for X-Plane if the firewall prompts.
- In X-Plane, Settings → Network must not have "Disable Incoming Traffic" selected; otherwise every
  request returns HTTP 403 and Avionix shows `INCOMING_TRAFFIC_DISABLED`.
- The X-Plane web server port defaults to 8086 and can be changed with `--web_server_port=NNNN`.

| Client | Host to enter |
|---|---|
| Physical iPhone / Android | LAN IP of the X-Plane computer, e.g. `192.168.1.100` |
| Android emulator, X-Plane on the same machine | `10.0.2.2` |
| Android emulator, X-Plane on another machine | that machine's LAN IP |
| iOS simulator, X-Plane on the same Mac | `127.0.0.1` |

The user of this repository performs all device verification manually; this project does not run
Xcode, Android Studio, simulators or emulators in CI.

## App config notes

`app.json` already carries the settings a development or production build needs for LAN access:
`NSLocalNetworkUsageDescription`, `NSAppTransportSecurity.NSAllowsLocalNetworking` (iOS) and
`usesCleartextTraffic` through `expo-build-properties` (Android). They are not exercised by Expo Go.

## Quality gates

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build:validate
```

Jest runs two projects: `node` (tests/unit, tests/contract, tests/integration; uses the in-process
mock X-Plane in `tests/mock-xplane`) and `expo` (tests/ui with @testing-library/react-native).
Run one with `npx jest --selectProjects node`.

## Logging

`createLogger(category)` in `src/infrastructure/logging/logger.ts` writes to the console in
development and only warnings and errors in production builds. Categories: `connection`, `http`,
`websocket`, `dataref`, `command`, `session`, `ui`.
```

- [ ] **Step 4: Write `docs/xplane.md`**

```markdown
# X-Plane Web API notes

Source: https://developer.x-plane.com/article/x-plane-web-api/ (checked 2026-09-14). Where the
official page and observed behaviour differ, this file says so.

## Versions

| API | X-Plane | Adds |
|---|---|---|
| v1 | 12.1.1 | DataRef list/count/read/write (REST); subscribe/unsubscribe/set (WebSocket) |
| v2 | 12.1.4 | `GET /api/capabilities`; commands (REST + WebSocket) |
| v3 | 12.4.0 | Flight initialization (REST), unused by Avionix |

Avionix requires v2 or newer and prefers the highest version both sides support. Paths are
`/api/{version}/...`; the capabilities endpoint is unversioned.

## Endpoints used

| Purpose | Request |
|---|---|
| Capabilities | `GET /api/capabilities` → `{"api":{"versions":[...]},"x-plane":{"version":"12.4.0"}}` |
| Resolve DataRef | `GET /api/v3/datarefs?filter[name]=<name>` → `{"data":[{id,name,value_type}]}` |
| Resolve command | `GET /api/v3/commands?filter[name]=<name>` → `{"data":[{id,name,description}]}` |
| Read value | `GET /api/v3/datarefs/{id}/value[?index=n]` → `{"data": <number | number[] | base64>}` |
| Write value | `PATCH /api/v3/datarefs/{id}/value[?index=n]` body `{"data": ...}` → 200, empty body |
| Activate command | `POST /api/v3/command/{id}/activate` body `{"duration": 0..10}` → 200, empty body |
| Stream | `ws://host:8086/api/v3`, `dataref_subscribe_values`, updates `dataref_update_values` at 10 Hz (delta only after the first message) |

Headers on every REST call: `Accept: application/json`, `Content-Type: application/json`.

Doc discrepancy: the official page shows the value-read response as an array of DataRef
descriptors. Real responses carry the bare value in `data`; Avionix's schema accepts number,
number array and string.

## Errors

| Signal | Avionix code |
|---|---|
| Plain HTTP 403 on everything | `INCOMING_TRAFFIC_DISABLED` ("Disable Incoming Traffic" is on) |
| 404 on `/api/capabilities` without a JSON body | `UNSUPPORTED_API` (X-Plane older than 12.1.4) |
| `invalid_dataref_name`, `invalid_dataref_id` | `DATAREF_NOT_FOUND` |
| `invalid_command_name`, `invalid_command_id` | `COMMAND_NOT_FOUND` |
| `dataref_is_readonly` | `DATAREF_READONLY` (wrapped in `WRITE_FAILED` by the client) |
| any other `error_code` | `SIMULATOR_ERROR` with `simulatorErrorCode` set |

WebSocket results: `{req_id, type:"result", success, error_code?, error_message?}`. A single
`dataref_set_values` request may produce several results with the same `req_id`; Avionix settles
on the first and logs the rest. Unknown `type` values are answered with `unknown_type`.

## Ids are session-specific

DataRef and command ids are stable only for the current X-Plane session. Avionix resolves names on
every connect and reconnect and never persists ids.

## MVP DataRefs and command

Verified against Laminar Research's `DataRefs.txt` and `Commands.txt`.

| Role | Name | Type | Why |
|---|---|---|---|
| Heartbeat | `sim/time/total_running_time_sec` | float, seconds | Changes even when parked; freezes when the sim is paused |
| Flight value | `sim/cockpit2/gauges/indicators/airspeed_kts_pilot` | float, knots | Indicated airspeed |
| Writable | `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot` | float, degrees magnetic | Heading bug; harmless; visible on the HSI |
| Command | `sim/autopilot/heading_up` | command | Increments the heading bug by 1°, so the subscription shows the effect |
```

- [ ] **Step 5: Write `docs/testing/xplane-smoke-test.md`**

```markdown
# Real X-Plane smoke test

Manual procedure against a real X-Plane 12 installation. Run it before calling a milestone done.
Record results at the bottom.

## Setup

1. X-Plane 12.1.4 or newer is running with any Laminar aircraft loaded (a Cessna 172 is fine),
   on the ground, engine running or not.
2. Settings → Network: "Disable Incoming Traffic" is **not** selected. Note the computer's LAN IP.
3. From another computer or the phone's browser, open `http://<ip>:8086/api/capabilities`. Expect
   JSON with `api.versions` and `x-plane.version`. If you get 403, fix step 2. If nothing answers,
   fix the firewall or network.
4. Two physical devices with Expo Go on the same Wi-Fi; `npm start` running on the dev machine.

## Procedure

| # | Step | Expected | Pass? |
|---|---|---|---|
| 1 | Open Avionix on device A, enter the IP and port 8086, press Connect | Status `connected`; X-Plane version and API versions shown; all diagnostics YES | |
| 2 | Watch "Sim running time" | Increases about once per second (10 Hz updates) | |
| 3 | Pause the sim (P key) | Running time stops; unpause → it continues | |
| 4 | Enter heading 123 and press "Write heading" | Last operation OK; "Heading bug" shows 123; the HSI/heading bug in X-Plane moves to 123 | |
| 5 | Press "Heading up" | Last operation OK; heading bug shows 124 | |
| 6 | Enter 400 and press "Write heading" | Last operation FAILED with a range message; connection stays `connected` | |
| 7 | Take off or use the map to place the aircraft in flight | "Indicated airspeed" changes live | |
| 8 | Device B: connect the same way | Both devices show `connected` and live values | |
| 9 | Device A: press "Heading up" | Device B's heading bug value increments; device B stays `connected` | |
| 10 | On the X-Plane computer, select "Disable Incoming Traffic" | Both devices go to `reconnecting`, attempts count up, then `error` with `INCOMING_TRAFFIC_DISABLED` after 5 attempts | |
| 11 | Re-enable incoming traffic, press Connect on both | Both reconnect and stream again | |
| 12 | Turn the phone's Wi-Fi off for 10 s, then on | Device goes to `reconnecting`, then `connected` again on its own | |
| 13 | Press Disconnect | Status `disconnected`, telemetry cleared, no reconnect attempts | |
| 14 | Restart X-Plane, press Connect | Connects; DataRef ids were re-resolved (no stale-id errors) | |
| 15 | Kill and relaunch Avionix | Host and port fields are prefilled with the last values | |

## Failure hints

- `INVALID_HOST` / `INVALID_PORT`: the input is malformed; enter only an IP or hostname.
- `NETWORK_ERROR` / `TIMEOUT` on HTTP: wrong IP, firewall, different network, X-Plane not running.
- `INCOMING_TRAFFIC_DISABLED`: X-Plane network settings.
- `UNSUPPORTED_API`: X-Plane older than 12.1.4.
- `WEBSOCKET_ERROR` with HTTP YES: a proxy or firewall blocks WebSocket upgrades.
- `DATAREF_NOT_FOUND`: a plugin removed a standard DataRef, or the name changed; check `docs/xplane.md`.

## Results

| Date | X-Plane version | Devices | Result | Notes |
|---|---|---|---|---|
| | | | | |
```

- [ ] **Step 6: Final verification of the whole repository**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:validate
git status --short
```

Expected: every command exits 0; `git status` shows only the new docs. Fix anything that fails
before committing. Then walk through the spec's section 10 acceptance list and confirm each
automated item has a green test (connectivity flow, REST operations, WebSocket, cleanup,
multi-session, quality gates). The device and real-simulator items are handed to the user with
`docs/testing/xplane-smoke-test.md`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: add README, architecture, development, X-Plane notes and smoke-test procedure

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan self-review notes

- **Spec coverage:** §2 decisions → Tasks 1, 2, 8, 10; §3 protocol facts → Tasks 4, 5, 7, 8 and `docs/xplane.md`; §4 DataRefs → Task 10 bindings, mock defaults, docs; §5 toolchain → Task 1; §6.1 layout → file map; §6.2 domain → Task 2; §6.3 errors → Task 2; §6.4 HTTP → Task 5; §6.5 WebSocket → Task 7; §6.6/6.7 client and negotiation → Tasks 2, 8; §6.8 repository → Task 9; §6.9 session → Task 10; §6.10 UI → Task 12; §6.11 config/persistence/networking → Tasks 1, 11, 13; §6.12 logging → Task 3; §7 testing → Tasks 1, 4, 5, 6, 7, 8, 9, 10, 12; §8 CI → Task 1; §9 docs → Task 13; §10 acceptance → Task 13 Step 6 plus the smoke test.
- **State table deviation from the spec:** one edge was added, `connected --failed--> error`, because the spec's flow reports `connected` as soon as the socket opens (step 9) but resolution and subscription (steps 10–11) can still fail. Every other edge matches spec §6.2.
- **Naming:** the spec's `XPlaneClient` interface is split into the domain port `SimulatorClient` (application depends on it) and the infrastructure class `XPlaneClient` (implements it). `getCapabilities()` exists on the class; the session uses `probeCapabilities(http)` before a version is known.
- **Type consistency checked:** `HttpTransport.request` overloads (Task 5) match usage in Tasks 8; `WebSocketTransport.send(type, params, timeoutMs?)` matches Task 8; `SocketCloseInfo` is defined once in Task 2 and reused; `Store` API (`getSnapshot`, `subscribe`, `setState`) matches the hook in Task 12; `SessionSnapshot.diagnostics.command` is present in `initialDiagnostics` and in the UI tests; `MVP_DATAREF_NAMES` is used by `initialSnapshot` everywhere.
