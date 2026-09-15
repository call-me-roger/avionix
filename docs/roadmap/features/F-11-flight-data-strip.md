# Flight data strip

| Field | Value |
|---|---|
| ID | `F-11` |
| Stage | `1` |
| Category | Monitoring |
| Status | Proposed |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 3 of 12 representative products (`research/competitors.md`). Wider set: 3 of 28 products researched ship a comparable numeric flight-data readout (Flight Deck ONE "Black Box" telemetry, X-Plane Control Pad's dataref command console, Little Navmap); the EFBs show only a subset on the map instead |

## Summary

A compact strip of the numbers a pilot keeps checking but no instrument shows: ground speed, true
airspeed, ground track, wind, outside air temperature, fuel remaining, simulator zulu and local time,
and whether the simulator is paused. Where the default GPS or FMS has a destination, it also shows
distance and time to it. It sits beside any other panel, in every phase of flight.

## Why now

The primary instruments (F-10) cover what is on the panel; this covers what is not. It is cheap once
the panel framework (F-04) exists, it makes a phone useful as a second screen beside a tablet, and it
is the common value source for the moving map (F-13) and the flight recorder (F-14), which read the
same values and must never disagree with it. No mobile competitor does this well.

## User stories

- As a pilot, I want ground speed, wind and fuel remaining at a glance so that I can judge progress
  and make fuel decisions without opening the simulator window.
- As a pilot returning to the desk, I want to see immediately whether the simulator is paused so
  that I do not misread a frozen strip as a stable flight.
- As a pilot flying the default GPS, I want distance and time to the destination so that I do not
  have to read the tiny GPS screen in the 3D cockpit.

## Scope

### In scope
- Ground speed, true airspeed, magnetic ground track, wind speed and direction, outside air
  temperature, total fuel remaining, simulator zulu and local time, and paused and replay
  indicators.
- Distance and time to the destination, and the destination identifier, from the default X-Plane GPS
  or FMS where the loaded aircraft populates them.
- Unit selection for fuel, temperature and distance, and a per-value staleness mark.

### Out of scope (this feature)
- Indicated airspeed, altitude, attitude, heading and vertical speed: F-10. Per-tank fuel, fuel flow
  and engine values: F-12. The route and progress along it: F-31; the CDU screen: F-32. Weather
  beyond wind and temperature at the aircraft: F-41.
- Writing anything. The strip is read-only, including the simulator clock and the pause state.

## Functional requirements

R1. While connected with a flight loaded, every value in the strip shows the current simulated value
and updates whenever the simulator sends a new one, at up to the Web API rate of about 10 Hz.

R2. Each value is labelled with its unit. Unit choices persist across restarts and are applied
consistently with F-13 and F-14. Times are simulator times, labelled zulu and local, and marked as
simulator rather than device clock times.

R3. When the simulator is paused the strip shows a clear paused indicator, and when it is in replay
the strip says so. Values are not marked stale merely because the simulator is paused: paused and
disconnected are distinct states, shown differently.

R4. Each value shows its age and is marked stale past a defined threshold.

R5. On disconnect, the whole strip is marked disconnected and keeps its last values marked stale.
Values are never zeroed and never extrapolated.

R6. With no flight loaded and no DataRefs exposed, the strip says so and shows no values.

R7. A DataRef missing on the loaded aircraft hides or marks unavailable only the field that depends
on it, in plain language. The remaining fields keep working. A default value is never substituted.

R8. The destination fields appear only when the loaded aircraft populates the default GPS or FMS
DataRefs and a destination is set. Otherwise the strip states that no destination is available and
does not show a blank or zero distance.

R9. Raw protocol errors, DataRef ids, HTTP status codes and WebSocket error codes never appear on
this page; they go to the diagnostics view (F-02).

R10. Pairing tokens are never logged and never shown on screen.

R11. The strip writes no DataRef and activates no command.

## X-Plane Web API mapping

Names verified against Laminar's DataRef list at developer.x-plane.com/datarefs. All read through a
single `dataref_subscribe_values` subscription at about 10 Hz. `gps_nav_id` is a byte array carrying
a string, which the Web API returns base64-encoded and Avionix must decode.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Ground speed | `sim/cockpit2/gauges/indicators/ground_speed_kt` | float, knots | Read | datarefs |
| True airspeed | `sim/cockpit2/gauges/indicators/true_airspeed_kts_pilot` | float, knots | Read | datarefs |
| Ground track | `sim/cockpit2/gauges/indicators/ground_track_mag_pilot` | float, degrees mag | Read | datarefs |
| Wind speed | `sim/cockpit2/gauges/indicators/wind_speed_kts` | float, knots true | Read | datarefs |
| Wind direction | `sim/cockpit2/gauges/indicators/wind_heading_deg_mag` | float, degrees mag | Read | datarefs |
| Outside air temp | `sim/cockpit2/temperature/outside_air_temp_degc` | float, degrees C | Read | datarefs |
| Total air temp | `sim/cockpit2/gauges/indicators/TAT_pilot` | float, degrees | Read | datarefs (12.3+) |
| Fuel remaining | `sim/flightmodel/weight/m_fuel_total` | float, kg | Read | datarefs |
| Zulu time | `sim/time/zulu_time_sec` | float, seconds since midnight | Read | datarefs |
| Local time | `sim/time/local_time_sec` | float, seconds since midnight | Read | datarefs |
| Paused | `sim/time/paused` (unverified) | int, boolean | Read | community catalogue, as in `F-02` and `F-25` |
| In replay | `sim/time/is_in_replay` | int, boolean | Read | datarefs |
| Distance to destination | `sim/cockpit2/radios/indicators/gps_dme_distance_nm` (unverified) | float, nautical miles | Read | community mirror of DataRefs.txt, as in `F-31`; verify in the sim |
| Time to destination | `sim/cockpit2/radios/indicators/gps_dme_time_min` (unverified) | float, minutes | Read | community mirror of DataRefs.txt, as in `F-31`; verify in the sim |
| Destination identifier | `sim/cockpit2/radios/indicators/gps_nav_id` (unverified) | byte[150], string | Read | community mirror of DataRefs.txt, as in `F-31`; verify in the sim |

Notes. `sim/time/paused` is community-sourced and unverified against a Laminar list (see `F-02`);
until it is confirmed, the heartbeat freezing is the paused signal. It is read-only; F-25 uses the
pause command instead. `m_fuel_total` is always
kilograms, so conversion happens in the app. The `sim/flightmodel/position/` speed DataRefs are
metres per second, so the `cockpit2` names above are preferred.

## Aircraft compatibility

Speed, wind, temperature, fuel and time come from aircraft-independent `cockpit2` or simulator-level
DataRefs, populated for every default aircraft. The destination fields depend on the aircraft using
X-Plane's own GPS or FMS; the Zibo 737 and other add-ons with custom flight management systems are
not expected to populate them, and F-03 must detect this so R8 reports "no destination available"
rather than a stale figure. Total air temperature needs X-Plane 12.3 or newer; below that it is
unavailable, which R7 covers.

## Competitor evidence

- No mobile competitor ships this as a named panel. The closest is Flight Deck ONE's "Black Box"
  recorder with timestamped graphs and metrics —
  https://apps.apple.com/us/app/flight-deck-one/id6742143273
- Laminar's own iPad app exposes raw values only through a dataref command console, a developer tool
  rather than a pilot readout — https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
- Silent staleness is the failure this strip guards against: ForeFlight users reported they could
  "land and be on the ground for sometimes up to 5 minutes before Foreflight shows the approach and
  landing" — https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight
- The fix competitors are praised for is a visible link readout, like ForeFlight's "Accuracy
  (X-Plane) 1m" indicator, and EFBs carry position and AHRS data only, never fuel or simulator time —
  https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator

## Acceptance criteria

- [ ] With the mock server driving every value, each field tracks it and units persist across a
      restart.
- [ ] The paused DataRef shows the paused indicator without marking values stale; stopping the mock
      server marks them stale and shows the disconnected state instead.
- [ ] Removing the GPS DataRefs shows "no destination available" and the rest keeps working; a
      base64 `gps_nav_id` is decoded to text; the main menu shows "no flight loaded".
- [ ] On a real simulator, ground speed, track and wind agree with the simulator's own readouts, and
      fuel remaining matches the weight and balance page after conversion.
- [ ] No raw protocol text; logs contain no pairing token and no DataRef id.

## Risks and open questions

- Next waypoint versus destination. The GPS DataRefs give the active GPS destination, not
  necessarily the next flight-plan waypoint. Whether X-Plane exposes a per-leg next-waypoint distance
  for the default FMS is unconfirmed; verify in `DataRefs.txt`. Until then, label the field honestly.
- The Web API offers no navdata, so the destination identifier can only be the string the simulator
  provides. Avionix cannot expand it into a name, position or runway.
- Whether the wind direction DataRef is the direction the wind comes from or blows towards must be
  confirmed in the sim before the field is labelled.
- Fuel conversion to litres and gallons needs a density assumption, which is aircraft-dependent and
  unspecified. What the strip shows during replay is also open.
- Re-check every name against the in-sim `Resources/plugins/DataRefs.txt` before shipping.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. https://developer.x-plane.com/datarefs/
3. https://apps.apple.com/us/app/flight-deck-one/id6742143273
4. https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
5. https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator
6. https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight
7. `docs/xplane.md`; `docs/roadmap/research/` — `xplane-web-api.md`, `efb-moving-map.md`,
   `remote-control-apps.md`
