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
4. Two physical devices with Expo Go on the same Wi-Fi; `npm start` running on the dev machine.

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

## Failure hints

- `INVALID_HOST` / `INVALID_PORT`: the input is malformed; enter only an IP or hostname.
- `NETWORK_ERROR` / `TIMEOUT` on HTTP: wrong IP, firewall, different network, X-Plane not running.
- `INCOMING_TRAFFIC_DISABLED`: X-Plane network settings.
- `UNSUPPORTED_API`: X-Plane older than 12.1.4.
- `WEBSOCKET_ERROR` with HTTP YES: a proxy or firewall blocks WebSocket upgrades.
- `SIMULATOR_NOT_READY`: X-Plane reports zero DataRefs; load a flight and press Connect again.
- `DATAREF_NOT_FOUND`: a plugin removed a standard DataRef, or the name changed; check `docs/xplane.md`.

## Results

| Date | X-Plane version | Devices | Result | Notes |
|---|---|---|---|---|
| | | | | |
