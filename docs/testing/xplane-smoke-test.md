# Real X-Plane smoke test

Manual procedure against a real X-Plane 12 installation. Run it before calling a milestone done.
Record results at the bottom.

## Setup

1. X-Plane 12.1.4 or newer is running **with a flight loaded** (any Laminar aircraft, a Cessna 172
   is fine, on the ground, engine running or not). At the main menu X-Plane exposes zero DataRefs
   and Avionix reports `SIMULATOR_NOT_READY`; that is expected until a flight is loaded.
2. Settings → Network: "Disable Incoming Traffic" is **not** selected. Note the computer's LAN IP.
3. X-Plane 12.4.3 only accepts connections from the same machine (see `docs/xplane.md`), so run a
   relay on the X-Plane PC. For the Avionix bridge (port 8080), start it with `npm run bridge`
   (or `node scripts/avionix-bridge.js`). Note the six-digit pairing code it prints.
   Alternatively use `xplane-proxy` on port 8087 (see `docs/web.md`). From another computer, verify
   the relay is reachable: for the bridge, open `http://<ip>:<relay port>/avionix/info` and check the
   JSON's `xplane.reachable` field; for xplane-proxy, open `http://<ip>:<relay port>/api/capabilities`
   (check for JSON with `api.versions`). If you get 403 from xplane-proxy, fix step 2 (X-Plane network
   settings). For the bridge, if `xplane.reachable` is false, X-Plane is down or misconfigured; check
   with `curl -s http://127.0.0.1:8086/api/capabilities` on the X-Plane PC. If nothing answers, fix
   the relay, firewall or network.
4. Two physical devices on the same Wi-Fi: one running the Avionix development build (needed for
   discovery, `docs/development.md`) and one with Expo Go; `npm start` (or
   `npx expo start --dev-client`) running on the dev machine.

## Procedure

| # | Step | Expected | Pass? |
|---|---|---|---|
| 1 | Open Avionix on device A, enter the IP and port 8080, press Connect, enter a wrong six-digit code, press Pair | Status stays `pairing`; "Wrong code, check the connector window."; the field is cleared | |
| 2 | Enter the code printed by the connector and press Pair | Status `connected`; Connector row shows PAIRED; telemetry updates | |
| 3 | Stop the connector, delete `~/.avionix/connector-tokens.json`, start it again, wait for the app to retry | The app returns to `pairing` with "The connector no longer accepts this device, pair again."; the new code connects. If the connector is down long enough for the reconnect schedule (about 30 s) to run out first, the app lands in `error` instead — press Connect and it reaches `pairing` from there | |
| 4 | Watch "Sim running time" | Increases about once per second (10 Hz updates) | |
| 5 | Pause the sim (P key) | Running time stops; unpause → it continues | |
| 6 | Enter heading 123 and press "Write heading" | Last operation OK; "Heading bug" shows 123; the HSI/heading bug in X-Plane moves to 123 | |
| 7 | Press "Heading up" | Last operation OK; heading bug shows 124 | |
| 8 | Enter 400 and press "Write heading" | Last operation FAILED with a range message; connection stays `connected` | |
| 9 | Take off or use the map to place the aircraft in flight | "Indicated airspeed" changes live | |
| 10 | Device B: connect the same way (enter the same connector host and port 8080, enter the code) | Both devices show `connected` and live values; both show Connector row PAIRED | |
| 11 | Device A: press "Heading up" | Device B's heading bug value increments; device B stays `connected` | |
| 12 | On the X-Plane computer, select "Disable Incoming Traffic" | Both devices go to `reconnecting`, attempts count up, then `error` with `INCOMING_TRAFFIC_DISABLED` after 5 attempts | |
| 13 | Re-enable incoming traffic, press Connect on both | Both reconnect and stream again | |
| 14 | Turn the phone's Wi-Fi off for 10 s, then on | Device goes to `reconnecting`, then `connected` again on its own | |
| 15 | Press Disconnect | Status `disconnected`, telemetry cleared, no reconnect attempts | |
| 16 | Restart X-Plane, press Connect (re-enter the code if prompted) | Connects; DataRef ids were re-resolved (no stale-id errors) | |
| 17 | Kill and relaunch Avionix, press Connect | Host and port fields are prefilled; if the token is still valid, status goes straight to `connected` without asking for a code | |
| 18 | Direct X-Plane: enter port 8086 (no connector) and press Connect | Status `connected` without a code prompt; Connector row shows DIRECT | |
| 19 | Development build, disconnected, connector running with mDNS on: open Avionix | iOS asks for local-network permission on the first scan; allow it. Within a few seconds "Connectors on this network" lists the connector with `<ip>:8080` and "Needs pairing" | |
| 20 | Tap the connector row | Host and port fill in; status goes to `pairing` (or `connected` when this device is already paired); the section disappears while busy | |
| 21 | Disconnect, then stop the connector with the app in the foreground | The row disappears within about 10 s; "Looking for connectors…" shows | |
| 22 | Start the connector with `--no-mdns` | Nothing is listed; typing the IP still connects | |
| 23 | Background the app, restart the connector without `--no-mdns`, foreground the app | The list is empty for a moment, then shows the connector again | |
| 24 | Expo Go device, disconnected | The section shows "Connector discovery needs the Avionix development build." and no rows | |
| 25 | iOS only: Settings → Avionix → Local Network off, reopen the app | No rows and no error; turning the toggle back on and reopening the app lists the connector again | |
| 26 | Android, if "Discovery failed" ever appears: background the app, then foreground it | The section shows "Looking for connectors…" and lists the connector again | |
| 27 | Connect, then pause X-Plane | The status bar says "X-Plane is paused", not "Not live" alone | |
| 28 | Connect while X-Plane sits at the main menu | Link stays connected, status bar says "No flight loaded in X-Plane"; starting a flight brings values in within ~5 s without reconnecting | |
| 29 | Pull Wi-Fi mid-flight | Status bar shows "Reconnecting, attempt N of 5"; restoring Wi-Fi returns live values | |
| 30 | Disable "Accept incoming connections" in X-Plane, then connect | Diagnostics names the setting and how to enable it | |
| 31 | Open diagnostics and share | The shared text has no token, no pairing code, no URL and no raw error | |
| 32 | Park on the ramp with engines off for two minutes | Values stay marked live throughout | |
| 33 | While connected mid-flight, return to the main menu in X-Plane (do not reload a flight) | Expected, not a bug: `flightLoaded`/"No flight loaded" is only set by the connect-time resolution path, so a mid-session return to the menu is not detected as that case. The heartbeat simply stops advancing, so the status bar reports "X-Plane is paused or not running" instead of a distinct "No flight loaded" message. Loading a flight again brings values back without reconnecting | |
| 34 | Load the default Cessna 172 and connect | The Aircraft panel names it ("Cessna 172 SP (C172) · N172SP"), the profile reads "Generic X-Plane aircraft 1.0.0 · generic fallback", and the verdict is "All features available" | |
| 35 | Connect with a default airliner instead | Identified the same way; all features available | |
| 36 | While connected, load a different aircraft in X-Plane | The Aircraft panel should name the new one within a few seconds, with the status bar never leaving "Connected". Whether real X-Plane streams the `data`-typed identification DataRefs over a subscription is unconfirmed, which is why "Check again" exists: if the panel still names the old aircraft after ~10 s, open "Compatibility details" and press "Check again" — it must then name the new one. Record which of the two happened; that answer is what this row is for | |
| 37 | Open "Compatibility details" while connected and press "Check again" | Every feature is listed with a status; the check completes and the link stays connected | |
| 38 | Disconnect, then open "Compatibility details" | It says "Last checked … Not current." and "Check again" is disabled | |
| 39 | Connect while X-Plane sits at the main menu, then open the Aircraft panel | "Not checked yet"; "Compatibility details" says Avionix is waiting for a flight to be loaded and "Check again" is disabled, which is deliberate — there is nothing to check yet. Starting a flight fills it in without reconnecting, and the button becomes usable | |
| 40 | Share the diagnostics summary with an aircraft loaded | The Aircraft block names the aircraft, the profile and every feature's status, with no URL, token or raw error | |
| 41 | If X-Plane is older than 12.4.3, or an add-on aircraft lacks the Laminar heading-bug DataRef | Older sim: the compatibility view notes write capability is not reported and the control stays usable. Missing name: the heading buttons are disabled and name what is missing | |
| 42 | Turn on VoiceOver (iOS) or TalkBack (Android), then swipe to the Aircraft panel | The whole row is announced as one button, ending with "Open compatibility details", and activating it opens the compatibility view | |

## Failure hints

- `INVALID_HOST` / `INVALID_PORT`: the input is malformed; enter only an IP or hostname.
- `NETWORK_ERROR` / `TIMEOUT` on HTTP: wrong IP, firewall, different network, X-Plane not running.
- `INCOMING_TRAFFIC_DISABLED`: X-Plane network settings.
- `UNSUPPORTED_API`: X-Plane older than 12.1.4.
- `WEBSOCKET_ERROR` with HTTP YES: a proxy or firewall blocks WebSocket upgrades.
- `SIMULATOR_NOT_READY`: X-Plane reports zero DataRefs; load a flight and press Connect again.
- `DATAREF_NOT_FOUND`: a plugin removed a standard DataRef, or the name changed; check `docs/xplane.md`.
- Nothing is ever listed on Android: some routers block multicast between clients (AP isolation);
  the same setting blocks the connection itself, so check that a typed IP works first.
- Nothing is listed on iOS but a typed IP works: check Settings → Avionix → Local Network.
- Android: "Discovery failed: …" after a few seconds is usually a transient NSD resolve failure;
  background and foreground the app (or press Connect and Disconnect) to rescan.
- A development build on iOS lists nothing and never prompts for local-network permission: before
  suspecting the permission, suspect the new architecture's interop layer, since
  `react-native-zeroconf` is a legacy bridge module running under it (`newArchEnabled` is true in
  `app.json`).

## Results

| Date | X-Plane version | Devices | Result | Notes |
|---|---|---|---|---|
| | | | | |
