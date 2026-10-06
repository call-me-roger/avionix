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
| 2 | Enter the code printed by the connector and press Pair | Status `connected`, and the app stays on Setup. Tap the status bar: Diagnostics opens at the top of Setup with "Connector check: paired". Open Flight data from the switcher: its values update | |
| 3 | Stop the connector, delete `~/.avionix/connector-tokens.json`, start it again, wait for the app to retry | The app returns to `pairing` with "The connector no longer accepts this device, pair again."; the new code connects. If the connector is down long enough for the reconnect schedule (about 30 s) to run out first, the app lands in `error` instead — press Connect and it reaches `pairing` from there | |
| 4 | On Flight data, watch "Sim zulu" | Advances one second at a time (10 Hz updates underneath) | |
| 5 | On Flight data, pause the sim (P key) | Sim zulu stops advancing and a PAUSED badge appears; the values stay bright (a paused sim is current); unpause → it continues and the badge clears | |
| 6 | Open Heading, enter 123 in "New heading" and press Set | Nothing appears under Set; "Heading bug" shows 123; the HSI/heading bug in X-Plane moves to 123. (A failed write would show a cause and an action under the control, e.g. "The change did not reach the aircraft." / "Check the link is live, then try again.") | |
| 7 | On Heading, press "Heading up" | Nothing appears under the button; "Heading bug" shows 124 | |
| 8 | On Heading, enter 400 in "New heading" | "Enter a number from 0 to 360." appears and Set is disabled, so nothing is sent; the link stays `connected`. The same for `0x10` or `1e2` | |
| 9 | Open Flight data, then take off or use the map to place the aircraft in flight | "Ground speed" changes live | |
| 10 | Device B: connect the same way (enter the same connector host and port 8080, enter the code) | Both devices show `connected`, and live values on Flight data; on both, tapping the status bar shows "Connector check: paired" in Diagnostics | |
| 11 | Device B: open Heading. Device A: open Heading and press "Heading up" | Device B's "Heading bug" value increments; device B stays `connected` | |
| 12 | On the X-Plane computer, select "Disable Incoming Traffic" | Both devices go to `reconnecting`, attempts count up, then `error` with `INCOMING_TRAFFIC_DISABLED` after 5 attempts | |
| 13 | Re-enable incoming traffic, press Connect on both | Both reconnect and stream again | |
| 14 | Turn the phone's Wi-Fi off for 10 s, then on | Device goes to `reconnecting`, then `connected` again on its own | |
| 15 | With Flight data open, press Disconnect in Setup, then open Flight data again | Status `disconnected`, no reconnect attempts. Flight data keeps the last values, muted and marked "not live", with one notice at the top: "Not connected. Showing the last known values." | |
| 16 | Restart X-Plane, press Connect (re-enter the code if prompted) | Connects; DataRef ids were re-resolved (no stale-id errors) | |
| 17 | Kill and relaunch Avionix, press Connect | Host and port fields are prefilled; if the token is still valid, status goes straight to `connected` without asking for a code | |
| 18 | Direct X-Plane: enter port 8086 (no connector) and press Connect | Status `connected` without a code prompt; tapping the status bar shows "Connector check: not needed, talking to X-Plane directly" in Diagnostics | |
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
| 30 | Disable "Accept incoming connections" in X-Plane, then connect | Diagnostics (tap the status bar; it opens at the top of Setup) names the setting and how to enable it | |
| 31 | On a panel, tap the status bar, then share the diagnostics | Setup opens with Diagnostics at the top, above the connection form. The shared text has no token, no pairing code, no URL and no raw error | |
| 32 | Park on the ramp with engines off for two minutes | Values stay marked live throughout | |
| 33 | While connected mid-flight, return to the main menu in X-Plane (do not reload a flight) | Expected, not a bug: `flightLoaded`/"No flight loaded" is only set by the connect-time resolution path, so a mid-session return to the menu is not detected as that case. The heartbeat simply stops advancing, so the status bar reports "X-Plane is paused or not running" instead of a distinct "No flight loaded" message. Loading a flight again brings values back without reconnecting | |
| 34 | Load the default Cessna 172 and connect | Setup's Aircraft section names it ("Cessna 172 SP (C172) · N172SP"), the profile reads "Generic X-Plane aircraft 1.0.0 · generic fallback", and the verdict is "All features available" | |
| 35 | Connect with a default airliner instead | Identified the same way; all features available | |
| 36 | While connected, load a different aircraft in X-Plane | Setup's Aircraft section should name the new one within a few seconds, with the status bar never leaving "Connected". Whether real X-Plane streams the `data`-typed identification DataRefs over a subscription is unconfirmed, which is why "Check again" exists: if the section still names the old aircraft after ~10 s, open "Compatibility details" and press "Check again" — it must then name the new one. Record which of the two happened; that answer is what this row is for. Then open Heading: "Heading bug" updates for the new aircraft | |
| 37 | Open "Compatibility details" while connected and press "Check again" | Every feature is listed with a status; the check completes and the link stays connected | |
| 38 | Disconnect, then open "Compatibility details" | It says "Last checked … Not current." and "Check again" is disabled | |
| 39 | Connect while X-Plane sits at the main menu, then look at Setup's Aircraft section | "Not checked yet"; "Compatibility details" says Avionix is waiting for a flight to be loaded and "Check again" is disabled, which is deliberate — there is nothing to check yet. Starting a flight fills it in without reconnecting, and the button becomes usable | |
| 40 | Share the diagnostics summary with an aircraft loaded | The Aircraft block names the aircraft, the profile and every feature's status, with no URL, token or raw error | |
| 41 | If X-Plane is older than 12.4.3, or an add-on aircraft lacks the Laminar heading-bug DataRef | Older sim: the compatibility view notes write capability is not reported and the control stays usable. Missing name: on Heading, Set and "Heading up" are disabled, the reason under them names what is missing, and "Heading bug" reads "not available on this aircraft" | |
| 42 | Turn on VoiceOver (iOS) or TalkBack (Android), then on Setup swipe to the Aircraft section | The whole row is announced as one button, ending with "Open compatibility details", and activating it opens the compatibility view | |
| 43 | First launch on a phone | Opens on Setup; the switcher at the bottom shows Flight data, Heading and Setup | |
| 44 | Set the device's Auto-Lock (iOS) or Screen timeout (Android) to its shortest value. Connect, open Heading, and leave the device untouched for longer than that timeout (2 minutes is plenty) | The screen never dimmed or locked while Heading was open and connected. Restore the setting afterwards | |
| 45 | On Heading, background the app for 1 minute, return | Screen slept normally while backgrounded; Heading is still the panel shown | |
| 46 | Type `12` in New heading, rotate the phone to landscape | The switcher moves to the left side; `12` is still in the field | |
| 47 | Tap Setup, force-quit, reopen; then open Heading, force-quit, reopen | Reopens on Setup, then on Heading | |
| 48 | Open Heading, then quit to X-Plane's main menu (do not load a flight) | One notice at the top ("X-Plane stopped sending data.", with the time of the last update); "Heading bug" muted and marked "not live"; Set and "Heading up" disabled | |
| 49 | In Setup → Display, choose Night in a dark room | Black background, dim warm text, nothing bright white; Connect button still readable. On Heading while disconnected, Set and "Heading up" are outlines, plainly different from the filled buttons of a live link | |
| 50 | Set the device to dark mode, choose System (night) | Night colours; switch the device to light mode → light colours | |
| 51 | On a tablet, both orientations, every panel | Controls are comfortably pressable; the switcher is a side rail in landscape | |
| 52 | Hide Flight data in Setup → Panels | It leaves the switcher; Heading's switch cannot be turned off | |
| 53 | Android phone with 3-button navigation, and an iPhone with a notch or Dynamic Island: portrait, then landscape | Portrait: the switcher sits above the navigation bar or home indicator and every tab is tappable; the status bar sits below the system status bar or Dynamic Island. Landscape: the rail clears the notch and a side navigation bar, and the panel's right edge clears the other side | |
| 54 | iOS: on Heading, tap "New heading" (portrait and landscape) | The panel scrolls so the field and Set stay above the keyboard | |
| 55 | Cessna 172 in flight, open Flight data | Ground speed, TAS, track and wind match X-Plane's own readouts (Data Output or the map) | |
| 56 | Compare Fuel remaining with X-Plane's Weight & Balance page, in kg, then switch Units → Fuel to lb | Same total; the lb figure is the kg figure × 2.2046 | |
| 57 | Set a wind from 270° true at 15 kt in X-Plane's weather | Wind (from) is magnetic (`wind_heading_deg_mag`), not the true direction set in the weather UI: it reads the set direction minus the local magnetic variation (about 255° at KSEA), at 15 kt; it must not read the reciprocal (~075° magnetic or ~090° true) | |
| 58 | Load the default Cessna with a GPS Direct-To (e.g. KSEA) | GPS destination shows the identifier, a distance and a time; clear the Direct-To → "No destination set in the GPS." | |
| 59 | Load an add-on with its own FMS (e.g. Zibo 737) | "No destination available on this aircraft."; the other fields keep working | |
| 60 | Pause X-Plane, then start a replay | PAUSED badge with values bright, then REPLAY | |
| 61 | On Heading, on the smallest phone available, in portrait and landscape | The strip shows four values on one row under the status bar and stays on one row; tapping it opens Flight data. Pause X-Plane: the strip still fits on one row, with the PAUSED badge inline. Disconnect: the strip still fits on one row, muted, with "not live" shown | |
| 62 | Setup → Panels, turn the strip off | It disappears from every panel and stays off after a restart | |
| 63 | Rebuild the development build (react-native-svg is a new native module), open the app fresh and pair | It opens on Setup, as any fresh install must pair first; after pairing, Instruments is the first switcher entry and the PFD or six-pack draws, nothing blank | |
| 64 | Default C172, engine running on the ground | Six-pack by default; airspeed 0 with white/green/yellow arcs and a red line; altimeter matches X-Plane's own to the foot; heading matches; nothing on any gauge overlaps or is cut off (the Kollsman and VSI windows sit clear of the scale digits) | |
| 65 | Fly a level standard-rate turn using X-Plane's own turn coordinator | Ours puts the wing on the standard-rate mark (checks the 20° assumption); label says about "rate 1.0 standard rate" | |
| 66 | Apply rudder in level flight | The ball moves the same way as X-Plane's ball (checks the slip sign), on the six-pack and under the PFD's roll pointer | |
| 67 | Roll to 30° bank and pitch 10° up | Both presentations show the same bank and pitch as X-Plane's attitude indicator; nothing overlaps or is cut off (the slip trapezoid stays clear of the roll pointer, the heading and Mach/baro boxes stay framed) | |
| 68 | Switch to PFD, then load the default 737, then the C172 again | 737 opens on PFD; C172 comes back on the PFD you chose; restart the app: still PFD for the C172 | |
| 69 | Tap +, −, STD, and type 30.12 then Set, in inHg; switch Units → hPa and repeat with 1009 | X-Plane's altimeter follows each; our reading shows the read-back; STD shows "29.92 inHg STD" / "1013 hPa STD" | |
| 70 | On the PFD, stop X-Plane's network (or quit X-Plane) mid-flight | Every instrument keeps its last values; a red X over every instrument, NOT LIVE on the attitude (the narrower tapes and scales are too small for the words); the panel says why and how long ago | |
| 71 | Return to the main menu (no flight) | No values on any instrument; the panel says no flight is loaded | |
| 72 | 737 above FL250 and on short final | Mach appears from 0.40; radio altitude appears below 2,500 ft on both presentations | |
| 73 | C172: open Radios | COM1/COM2/NAV1/NAV2 match the aircraft's radios; transponder code and mode match | |
| 74 | Enter COM1 standby 118.005 on the keypad, Set | The aircraft's COM1 standby shows 118.005 (confirms the whole-kHz assumption for `_833`) | |
| 75 | Enter 118.020 | The panel refuses it with the nearest channels; nothing changes in X-Plane | |
| 76 | Swap COM1, then change COM1 with the mouse in X-Plane | The swap shows on both; the mouse change appears on the panel within a second | |
| 77 | NAV1 to a nearby VOR with DME | Identifier, DME distance and course appear under NAV1 | |
| 78 | Squawk 4521, then ALT, then IDENT | Code and mode change in X-Plane; "IDENT sent", then "Identing" for as long as X-Plane idents (note the duration) | |
| 79 | Enter 7700 | The panel names it "emergency" and needs a second tap | |
| 80 | X-Plane 12.4.4+: request a clearance from X-Plane ATC | "ATC assigned NNNN" appears; it shows "— not set" until the code matches; note what the DataRef reports before any assignment | |
| 81 | Disconnect the network with an entry open | The entry disappears; values are muted "not live"; reconnecting sends nothing | |
| 82 | Smallest phone, portrait and landscape; a tablet in landscape | Rows fit without clipping; the keypad keys are easy to hit; on the phone, tapping a standby value or the squawk opens the keypad right under that row, in view; on the tablet the keypad sits beside the stack | |
| 83 | C172 (GFC 700 or KAP 140), avionics on: open Autopilot | Annunciator reads "No modes engaged"; selectors match the aircraft's heading bug and altitude preselect | |
| 84 | Tap AP, then HDG | X-Plane's autopilot engages in HDG; the panel shows ● AP and ● HDG only after X-Plane does | |
| 85 | Tap AP again | The autopilot disconnects with one tap | |
| 86 | Altitude +1000 three times quickly | The preselect rises 3,000 ft, not 1,000 | |
| 87 | Turn the heading bug with the mouse in X-Plane | The panel's heading follows within a second | |
| 88 | Enter altitude 8500, Set; enter vertical speed 700 with ±, Set | Both reach X-Plane; VS shows −700 fpm | |
| 89 | Tune NAV1 to an ILS, tap APR | APR shows ○ (armed) then ● as it captures; GS arms and captures in the annunciator | |
| 90 | Tap APR with nothing tuned | "X-Plane did not engage APR. Check the navigation source." after about 3 s | |
| 91 | Airliner with autothrottle (default 737 or A330): A/T ARM off, then A/T | Note whether A/T engages from disarmed or needs ARM first | |
| 92 | C172: tap A/T | "… This aircraft may not have one." appears; note what `autothrottle_enabled` reports | |
| 93 | Airliner: Use Mach, then Mach +.01 | Selector shows M .xx and steps by .01 | |
| 94 | Smallest phone, portrait and landscape; a tablet in landscape | Steppers wrap without clipping; the keypad opens under the selector being typed | |
| 95 | Open any panel on iOS and Android and read a frequency, a squawk, a PFD number and a key legend | All cockpit numbers and legends render in B612 or B612 Mono, not the system font; nothing logs an unrecognized font | |
| 96 | Install the new development build, leave "Haptic feedback" On in Setup → Display, press a key, then make a change X-Plane refuses (for example tune COM1 standby to 118.020) | A light tick on the key press; an error buzz when the change is refused. Turn "Haptic feedback" Off and repeat: nothing | |
| 97 | On an existing development build made before this change (no `expo-haptics`), open the app and press keys | The app works normally: no crash, no error, no haptic feedback | |
| 98 | Open Radios | ACT windows read green; STBY windows show a cyan tuning frame; ⇄ swaps active and standby; ident, DME and course read in cyan | |
| 99 | Open the transponder, cycle the mode keys, then squawk 7700 | The mode light bar follows X-Plane's own mode; 7700 shows the code and "EMERG" in red | |
| 100 | Tune a VOR into NAV1, arm NAV, then engage HDG | HDG's light bar is filled (engaged); NAV's light bar is hollow (armed) until it captures, then filled; an unused mode key stays unlit | |
| 101 | Engage HDG, then switch to NAV | The lateral column boxes NAV for about 10 s after it becomes active, then the box disappears; HDG's earlier box is long gone | |
| 102 | Disconnect the autopilot from the yoke's AP disconnect button in X-Plane | The FMA's "AP" slot turns amber reverse video and flashes for 5 s, with one error buzz; tapping the FMA clears it early. Turn on iOS Reduce Motion and repeat: "AP" shows steady, not flashing | |
| 103 | Turn X-Plane's ALT knob and HDG knob, then engage FLC and VS | The cyan altitude box and bug follow the ALT knob; the heading bug and HDG box follow the HDG knob; the speed box appears with FLC; the VS bug appears with VS | |
| 104 | On the six-pack, turn the HDG knob | The orange heading bug on the directional gyro follows it | |
| 105 | Watch the status bar while live, then while reconnecting, then disconnected | A filled green dot while live; a hollow amber ring while reconnecting (pause X-Plane's network or stop the connector); a red ✕ when disconnected; the age shows only when not live | |
| 106 | Walk through Setup from a fresh pairing | The four-step row advances Find → Connect → Pair → Live as each happens; the pairing-code boxes fill in as the code is typed | |
| 107 | Switch to the Night theme in a dark room | Nothing on any new surface glows; light bars, FMA text and display windows are all dim amber, green or cyan, never full brightness | |
| 108 | On the smallest phone available, in portrait, engage VS with a steep rate (for example −1500 fpm) so the FMA shows "VS −1500FPM" | The whole string stays on one line in its column, shrinking to fit rather than wrapping or clipping | |
| 109 | Time the AP disconnect's amber flash with a stopwatch or a slow-motion screen recording, on both iOS and Android | The flash cycles at about 2 Hz (on, then off, about every 250 ms each) | |
| 110 | On a phone, open the Autopilot panel and look at the "A/T ARM" key; then open any keypad (a radio standby or a selector) | "A/T ARM" fits its key, wrapping to two lines acceptably but never clipped; the keypad's "Clear" fits its key | |
| 111 | Tune NAV1 to an ILS and fly the approach from outside the final approach fix to touchdown | The LOC needle and the GS diamond move correctly on both the HSI and the PFD; the GS flag (red "GS") shows before the glideslope is captured and clears the moment it is; O, M and I light over the outer, middle and inner markers, each with its own letter and colour | |
| 112 | Track a VOR radial on NAV1 through station passage, then fly far enough out to lose the signal | TO flips to FROM over the station; past the signal's range the red NAV flag shows on the HSI (never a centred needle), and the CDI, course pointer and TO/FROM triangle all disappear | |
| 113 | Switch the HSI source to GPS (with a GPS flight plan active) | The course pointer, CDI bar and the "GPS" source word in the corner all turn magenta (`#b8579f` at night, `#e040c0` otherwise); the NAV control unit's GPS key lights; a glidepath, if shown, reads "GP" rather than "GS" | |
| 114 | Set NAV1's OBS from X-Plane's own cockpit (mouse or a VOR/HSI pop-up), then set a course from Avionix's CRS window | The Navigation panel's CRS window follows X-Plane's change within about a second, and X-Plane's own CDI/OBS follows Avionix's change, confirming `hsi_obs_deg_mag_pilot` tracks the selected source both ways. Record whether both directions hold; if not, note which one fails (`docs/xplane.md`'s "Unsettled" note depends on this row) | |
| 115 | Fly right of a localizer course, then fly below the glideslope | Right of course draws the CDI needle (and the PFD's LOC diamond) to the right; below the glideslope draws the GS diamond up, confirming a positive `hsi_vdef_dots_pilot` means "fly up" on both the HSI and the PFD | |
| 116 | Compare Avionix's needle at full-scale deflection (well off a localizer or well off a radial) with the aircraft's own HSI or CDI, if the aircraft has one | Avionix pegs its needle at 2.5 dots at the same point the aircraft's own gauge reaches full scale; note any mismatch (the "two dots, 2.5 peg" assumption, design spec risk 2) | |
| 117 | Fly a back-course localizer approach (tune the front-course ILS, fly the reciprocal course) | Record the needle's sense (which way it deflects for a given displacement) exactly as X-Plane reports it; Avionix never inverts the sign itself | |
| 118 | Tune a VOR on NAV1, fly off its course, then press CTR | The course centres on the bearing to the station (`obs_HSI_direct`) and the needle goes to the centre of the scale; pressing CTR again with the course already centred changes nothing and is not treated as a failure | |
| 119 | Tune NAV1 and NAV2 to two different VORs in range, then fly out of range of one | BRG1 (single-line arrow) and BRG2 (double-line arrow) both point at their stations; the one out of range disappears rather than parking at its last bearing or snapping to 0° | |
| 120 | Switch to the Night theme in a dark room, with an ILS or VOR tuned | The CDI, course pointer, GS diamond, bearing pointers and every red flag stay at night luminance (dim NAV green or GPS magenta, dim red), never full brightness | |
| 121 | NAV1 tuned to a VOR with an identifier shown, then fly out of its range | `nav1_nav_id` (the HSI's ident line) clears along with the rest of the lateral display rather than continuing to show the last station's identifier once the signal is no longer valid | |
| 122 | On the Navigation panel, compare the HSI's glideslope scale against the card ring, and the marker box against the card's top edge | The GS scale (drawn at x 226, just outside the 104-radius card ring centred at 120) reads clearly clear of the card artwork, not overlapping a tick or label; the marker box's slight overlap with the card's top edge (by design, like the PFD's radio-altitude box) looks intentional, not clipped or misaligned | |
| 123 | On the PFD, tune an ILS and fly to a full-scale glideslope deflection while holding a steep bank | The GS diamond at full scale stays clear of the roll arc's 60° tick and the roll pointer; nothing overlaps or is cut off | |

Rows 44 and 45 verify the keep-awake hold, and row 53 the safe areas: behaviour no automated test
can observe.

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
