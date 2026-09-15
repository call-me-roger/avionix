# Development

## Prerequisites

- Node.js 22 and npm 10.
- Expo Go on a physical device for everything except connector discovery, which uses the native
  module `react-native-zeroconf` and therefore needs a development build (see below).
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
| Browser (web build) | the bridge's host and port (prefilled) |

`npm run web` needs the bridge for API access; start it with `--static dist/web` or any directory
(only `/api` matters for development) and enter its host and port in the form.

The user of this repository performs all device verification manually; this project does not run
Xcode, Android Studio, simulators or emulators in CI.

## App config notes

`app.json` already carries the settings a development or production build needs for LAN access and
connector discovery: `NSLocalNetworkUsageDescription`, `NSBonjourServices`,
`NSAppTransportSecurity.NSAllowsLocalNetworking` (iOS), `usesCleartextTraffic` through
`expo-build-properties`, and `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` and
`CHANGE_WIFI_MULTICAST_STATE` (Android). They are not exercised by Expo Go.

## Quality gates

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build:validate
```

Jest runs three projects: `node` (tests/unit, tests/contract, tests/integration; uses the
in-process mock X-Plane in `tests/mock-xplane`), `expo` (tests/ui with
@testing-library/react-native), and `web` (tests/web/**/*.web.test.tsx, jest-expo/web, rendering
with react-dom in jsdom; no Testing Library). Run one with `npx jest --selectProjects node`.
@testing-library/react-native is at major version 14, where `render`, `renderHook`, `fireEvent` and `act` are all
asynchronous, so UI tests `await` them.

## Logging

`createLogger(category)` in `src/infrastructure/logging/logger.ts` writes to the console in
development and only warnings and errors in production builds. Categories: `connection`, `http`,
`websocket`, `dataref`, `command`, `session`, `discovery`, `ui`.

## Development builds (EAS)

Connector discovery (`_avionix._tcp` over mDNS) is the first feature that needs a development
build: `react-native-zeroconf` is a native module that Expo Go does not contain. A development
build is also the way to verify the native LAN settings in `app.json` (iOS App Transport Security
local networking, `NSBonjourServices`, Android cleartext traffic and the Wi-Fi multicast
permission) and to test on iOS without the Expo Go login requirement.

Prerequisites: an Expo account (`npx eas-cli@latest login`) with access to the project
(`extra.eas.projectId` in `app.json`). The `eas.json` `development` profile builds a dev client
with internal distribution; Android produces an installable APK.

```bash
npm run build:dev:android   # eas build --profile development --platform android
npm run build:dev:ios       # eas build --profile development --platform ios
```

The scripts call `eas`; install or update the CLI first with `npm install -g eas-cli` (version 24
or newer, see `cli.version` in `eas.json`), or run `npx eas-cli@latest build ...` directly.

Android: when the build finishes, open the build page link, install the APK on the device, start
the dev server with `npx expo start --dev-client`, and open the project from the dev client.

iOS: internal distribution needs an Apple Developer account and each test device registered with
`npx eas-cli@latest device:create` before the first build. EAS manages the signing credentials.
Install the resulting build from the link, then start `npx expo start --dev-client`.

After the first development build, run the smoke test in `docs/testing/xplane-smoke-test.md` on
it; that run confirms the LAN networking settings that Expo Go does not exercise.
