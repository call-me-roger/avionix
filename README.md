# Avionix

Avionix is a React Native (Expo) companion app for X-Plane 12. The long-term goal is to let
phones and tablets act as distributed cockpit panels (controls, PFD, MFD, CDU, radios, ...).

This repository currently contains the **connectivity MVP**: it proves that a mobile device on
the same LAN can talk to X-Plane 12 through the built-in X-Plane Web API, stream live DataRefs
over WebSocket, write a DataRef and activate a command, and recover from connection loss.

## MVP scope

- Enter the connector (or X-Plane) host and port (default 8080), connect and disconnect.
- Find Avionix Connectors on the local network (mDNS) and connect to one with a tap. Needs a
  development build; Expo Go and the web keep the typed host and port.
- Detect the X-Plane version and the supported Web API versions; use the highest of v2/v3.
- Resolve DataRefs and commands by name (ids are session-specific and never stored).
- Panels reachable from a switcher (a bottom bar in portrait, a side rail in landscape) alongside
  Setup: Instruments (below), Radios (COM1, COM2, NAV1 and NAV2 with keypad standby entry and swap,
  the transponder's squawk code, mode and IDENT, and an AUDIO unit with exclusive MIC transmit
  selection, independent COM/NAV/ADF/DME/marker monitoring and the O/M/I marker lamps), Autopilot
  (AP, FD and autothrottle engagement; HDG, NAV, APR, ALT, VS and FLC shown off, armed or engaged;
  heading, altitude, vertical speed and airspeed in knots or Mach set with steppers or the keypad,
  each change checked against what X-Plane reports), Navigation (a Garmin-style HSI standing on the
  heading alone, with course, lateral and glideslope deviation in dots, TO/FROM, bearing pointers,
  DME and marker beacons; a NAV control unit to pick the source, set the course by keypad or
  stepper, and centre it with CTR, all in NAV green or GPS magenta, never colour alone), Systems
  (battery, avionics master and generators; the fuel selector and pumps; magnetos and starter;
  exterior and interior lights; flaps, trim, landing gear and parking brake; pitot heat and the
  anti-ice switches — every control reads X-Plane's own state and sends explicit on/off commands,
  never a toggle; trim and the starters are held rather than pressed, with a lease X-Plane itself
  lets lapse if the phone goes silent; four pages on a phone, two scrolling columns on a tablet),
  Engines (each engine's dial and gauges for its type with the aircraft's own colour bands, lean
  assist, fuel per tank with flow, used and endurance, buses and batteries; read-only), CDU (a
  faithful mirror of the default FMS's 16-line screen, line select keys down each side, a
  Boeing-style keyboard, CDU 1 and CDU 2, a physical keyboard on the web build) and Flight data
  (ground speed, true airspeed, track, wind, OAT/TAT, fuel remaining, sim zulu and local time,
  paused/replay, the GPS destination) round out the switcher. A compact strip with ground speed,
  wind, fuel and sim zulu docks under the status bar on every panel but Setup, Flight data and the
  CDU (which already fill the screen with their own numbers), and opens Flight data when tapped; a
  Setup toggle turns it off. The WebSocket subscribes only the visible panel's DataRefs (plus the
  strip's, while shown), identification and connection health, and follows a panel switch within
  one update cycle.
- A **cockpit look and feel**: dark bezels, glass display windows, the B612 and B612 Mono fonts
  (Airbus's own cockpit-legibility research, open licence) for every live number, and cockpit colour
  meanings throughout (green engaged, white armed, cyan selected, amber caution, red warning).
  Every key press gives a haptic tick, and a refused change gives an error buzz, through a Setup →
  Display "Haptic feedback" toggle; haptics need a new development build (the only new native
  module this adds), and the app runs silently without one.
- A **flight-mode annunciator (FMA)** on the Autopilot panel and across the top of the PFD: four
  columns (autothrottle, lateral, AP/FD, vertical) in the G1000's own layout, a box around a mode
  for 10 s after it engages, and an amber, flashing "AP" for 5 s when the autopilot disconnects
  (steady under iOS Reduce Motion), acknowledged with a tap.
- An **Instruments** panel: airspeed, attitude, altitude, vertical speed, heading, and turn and slip,
  drawn on the device from the simulator's own values (no streamed images), in a PFD or a six-pack
  presentation the pilot picks; the choice persists and is remembered per aircraft. The altimeter
  setting is read and written in inches of mercury or hectopascals, with one-tap STD; a stale link
  marks every instrument with a red X and never zeroes or animates a value. The PFD also shows the
  autopilot's targets: cyan boxes and bugs for the selected altitude, heading and speed, and a cyan
  bug for the selected vertical speed and on the six-pack's directional gyro. The altitude and
  heading targets are always shown; the speed only while FLC or the autothrottle is engaged, and the
  vertical speed only while VS is engaged. The PFD also overlays the Navigation panel's lateral and
  glideslope deviation scales and a marker beacon box over the attitude display, so a missing pitch
  or roll never removes them; they show only while the matching signal is valid.
- A **Units** section in Setup lets the pilot choose fuel (kg/lb), temperature (°C/°F), distance
  (nm/km) and altimeter pressure (inHg/hPa); the choice is shared by every panel and persisted.
  Speeds stay in knots.
- Identify the loaded aircraft and name it, its profile and its add-on version in an Aircraft
  panel in Setup; a new aircraft is picked up without reconnecting.
- A compatibility view behind that panel: every feature with its status, and every binding the
  aircraft does not have named with the DataRef or command it needed, plus a "Check again" button.
- Bounded automatic reconnect after an unexpected socket loss.
- A diagnostics panel that shows exactly which step failed.
- Light, dark and night themes, with a system / auto-night / light / dark / night toggle in
  Setup's Display section; the choice is persisted. While a panel is open and the link is
  connected or reconnecting, the screen is held awake.

Not in scope: any real avionics UI, device roles, accounts, cloud. See
`docs/superpowers/specs/2026-09-14-avionix-mvp-design.md` for the full design. The staged product
roadmap and the competitor research behind it live in `docs/roadmap/ROADMAP.md`.

## Requirements

- X-Plane 12.1.4 or newer (Web API v2). Network settings must not be set to
  "Disable Incoming Traffic".
- Node.js 22, npm 10.
- Expo Go on a physical iPhone or Android device (same Wi-Fi as the X-Plane computer), or an
  Avionix development build (`docs/development.md`) for connector discovery.

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

Run the Avionix Connector on the X-Plane PC with `npm run bridge`. It prints a six-digit pairing
code on start. See `docs/connector.md`.

## Connecting to X-Plane

1. Start X-Plane 12.1.4+ on a computer on the same Wi-Fi network as the phone.
2. Find the computer's LAN IP address (for example `192.168.1.100`).
3. Avionix opens on Setup; enter that IP and port 8080, press Connect, then type the six-digit
   pairing code the connector printed. Connecting straight to X-Plane still works: use port 8086
   and no code.
4. Tap the status bar to reveal Setup's diagnostics section, which shows each step: HTTP,
   capabilities, WebSocket, DataRef resolution, command resolution, subscription.

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

- Only the generic profile's DataRefs and its one command are wired up; no add-on profile ships yet.
- iOS App Transport Security for plain `http://` to an IP literal is only exercised in Expo Go;
  a development build must confirm the `NSAllowsLocalNetworking` setting in `app.json`.
- Connector discovery needs the development build (`react-native-zeroconf` is a native module);
  in Expo Go and on the web the host must be typed.
- Haptics need the development build (`expo-haptics` is a native module); Expo Go, the web and an
  existing build without it run with haptics silent, never an error.
- Base64 `data` DataRefs are decoded to text (this is how the aircraft is identified).
- `npm run build:validate` prints an informational "Using src/app as the root directory for Expo
  Router" line; this is a cosmetic log from the Expo CLI noticing the `src/app` folder name,
  expo-router is not installed, and `index.ts` / `App.tsx` remain the actual entry point.
