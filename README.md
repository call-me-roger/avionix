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
- Light / dark theme with a system / light / dark toggle; the choice is persisted.

Not in scope: any real avionics UI, device roles, accounts, cloud. The bridge-side pairing protocol
is implemented; the in-app pairing screen and discovery land in a follow-up. See
`docs/superpowers/specs/2026-09-14-avionix-mvp-design.md` for the full design.

## Requirements

- X-Plane 12.1.4 or newer (Web API v2). Network settings must not be set to
  "Disable Incoming Traffic".
- Node.js 22, npm 10.
- Expo Go on a physical iPhone or Android device (same Wi-Fi as the X-Plane computer).

## Stack

Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6 (strict), zod 4, Jest 29 (jest-expo),
@testing-library/react-native, react-native-web, ESLint (eslint-config-expo, flat config), Prettier.

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

Run the Avionix Connector on the X-Plane PC. The in-app pairing screen ships in the next PR, so for
now start the bridge with `--open`: `npm run bridge -- --open`. See `docs/connector.md`.

## Connecting to X-Plane

1. Start X-Plane 12.1.4+ on a computer on the same Wi-Fi network as the phone.
2. Find the computer's LAN IP address (for example `192.168.1.100`).
3. In Avionix enter that IP and port 8086, then press Connect.
4. The diagnostics section shows each step: HTTP, capabilities, WebSocket, DataRef resolution,
   command resolution, subscription.

`localhost` or `127.0.0.1` never works from a physical phone. See `docs/development.md` for
emulator specifics and `docs/testing/xplane-smoke-test.md` for the manual verification procedure.

## Commands

| Command                                   | Purpose                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm start`                               | Expo dev server                                                                                 |
| `npm run web`                             | Metro dev server for the browser (`expo start --web`)                                           |
| `npm run build:web`                       | Export web app to `dist/web` (`expo export --platform web --output-dir dist/web`)               |
| `npm run bridge`                          | Avionix bridge: serves the web app and relays to X-Plane (`node scripts/avionix-bridge.js`)     |
| `npm run typecheck`                       | `tsc --noEmit`                                                                                  |
| `npm run lint`                            | ESLint via `expo lint` (includes Prettier rules)                                                |
| `npm run format` / `npm run format:check` | Prettier                                                                                        |
| `npm test`                                | Jest, both projects (`node`: domain/infrastructure/integration with a mock X-Plane; `expo`: UI) |
| `npm run build:validate`                  | `expo export` for iOS and Android bundles                                                       |

## Current limitations

- X-Plane 12.4.3 accepts Web API connections only from the same machine; see the notes in `docs/xplane.md`.
  For browsers, use the Avionix bridge; native apps can use a relay like `xplane-proxy`. See `docs/web.md`.
- At the main menu X-Plane exposes no DataRefs; Avionix reports `SIMULATOR_NOT_READY` until a
  flight is loaded.

- Only the three MVP DataRefs and one command are wired up.
- iOS App Transport Security for plain `http://` to an IP literal is only exercised in Expo Go;
  a development build must confirm the `NSAllowsLocalNetworking` setting in `app.json`.
- No automatic discovery of the X-Plane host; the IP must be typed.
- Base64 `data` DataRefs are displayed raw.
- `npm run build:validate` prints an informational "Using src/app as the root directory for Expo
  Router" line; this is a cosmetic log from the Expo CLI noticing the `src/app` folder name,
  expo-router is not installed, and `index.ts` / `App.tsx` remain the actual entry point.
