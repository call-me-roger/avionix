# Real X-Plane smoke test

Manual procedure against a real X-Plane 12 installation. Run it before calling a milestone done.
Record results at the bottom.

## Setup

1. X-Plane 12.1.4 or newer is running **with a flight loaded** (any Laminar aircraft, a Cessna 172
   is fine, on the ground, engine running or not). At the main menu X-Plane exposes zero DataRefs
   and Avionix reports `SIMULATOR_NOT_READY`; that is expected until a flight is loaded.
2. Settings → Network: "Disable Incoming Traffic" is **not** selected. Note the computer's LAN IP.
3. X-Plane 12.4.3 only accepts connections from the same machine (see `docs/xplane.md`), so run a
   relay on the X-Plane PC. For the Avionix bridge (port 8080), start it with `--open` until the
   app's pairing screen ships: `npm run bridge -- --open` (or `node scripts/avionix-bridge.js --open`).
   With `--open`, any web page open on a device on the LAN can read and write X-Plane through the
   connector, so use it only on trusted networks and stop the connector when done. Alternatively use
   `xplane-proxy` on port 8087 (see `docs/web.md`). From another computer, verify
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
| 16 | If you chose the Avionix bridge in setup step 3 (with `--open`), open `http://<pc-ip>:8080` in a tablet browser | Connects to the relay without a pairing prompt (since `--open` disables pairing); steps 2, 4 and 5 behave the same as on the phone | |

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
