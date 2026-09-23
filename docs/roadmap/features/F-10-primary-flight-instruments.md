# Primary flight instruments

| Field | Value |
|---|---|
| ID | `F-10` |
| Stage | `1` |
| Category | Monitoring |
| Status | Proposed |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 6 of 12 representative products (`research/competitors.md`). Wider set: 7 of 12 panel and remote-panel products researched (Air Manager, Simionic G1000 PFD, XpRemotePanel, Flight Sim Remote Panel, RemoteFlight COCKPIT HD, Flight Deck ONE, FS-FlightControl) |

## Summary

Avionix shows the six primary flight instruments on a phone or tablet: airspeed, attitude, altitude,
vertical speed, heading, and turn and slip. Both a classic six-pack and a tape-and-ball primary
flight display presentation of the same values are required; the pilot picks one. The page is
read-only except for the altimeter setting, and stays in view for the whole flight.

## Why now

This is the first thing anyone expects from a cockpit companion and the most common feature in the
category. It proves the panel framework (F-04) against the fastest-changing values in the simulator,
and needs F-03 to pick the default presentation and detect missing values. F-30 and F-52 build on it.

## User stories

- As a pilot flying from an outside view, I want airspeed, attitude and altitude on a second screen
  so that I can fly on instruments without giving up the scenery.
- As a GA pilot I want a six-pack, and as an airliner pilot a PFD, so that the presentation matches
  the aircraft I am flying.
- As a pilot whose link drops, I want the instruments to look obviously dead so that I never fly a
  frozen attitude indicator.

## Scope

### In scope
- Indicated airspeed, pitch and roll, indicated altitude, vertical speed, magnetic heading, turn
  rate and slip.
- Two presentations of the same values, six-pack and PFD, both required; the choice persists.
- Setting the barometric reference in inches of mercury or hectopascals, and a standard-pressure
  control.
- Mach and radio altitude where the loaded aircraft exposes them, and a per-value staleness mark.

### Out of scope (this feature)
- Course deviation and bearing pointers: F-30. Flight director bars and autopilot bugs: F-20. Ground
  speed, true airspeed, wind, temperature: F-11. Engine instruments: F-12. Aircraft-specific PFD and
  EFIS layouts: F-52. Failure injection: F-25.
- Synthetic vision, terrain or traffic on the attitude display.

## Functional requirements

R1. While connected with a flight loaded, each instrument shows the current simulated value and
updates whenever the simulator sends a new one.

R2. Updates arrive over the WebSocket subscription at up to about 10 Hz, the documented Web API
ceiling. Avionix neither claims a higher rate nor polls REST to fake one. Instruments are rendered
on the device from those values; no part of the display is an image streamed from the simulator.

R3. The pilot can switch between six-pack and PFD. Both show the same values from the same DataRefs.
The choice persists across restarts and is remembered per aircraft profile (F-03).

R4. Setting the altimeter writes to the simulator; the page then shows the value read back, not the
value typed. A standard-pressure control sets 29.92 inHg / 1013 hPa in one action.

R5. If that DataRef is not writable on the loaded aircraft, the control is disabled with a
plain-language explanation and the reading stays read-only. Nothing else is affected.

R6. Each value shows its age and is marked stale past a defined threshold. A stale attitude
indicator is unmistakably marked, never merely frozen.

R7. On disconnect, every instrument is marked disconnected and keeps its last value marked stale.
Values are never zeroed and never animated from stale data.

R8. With no flight loaded and no DataRefs exposed, the page says so and shows no values.

R9. A DataRef missing on the loaded aircraft marks only that instrument unavailable, in plain
language; the other five keep working. A default is never substituted for a missing value.

R10. Raw protocol errors, DataRef ids, HTTP status codes and WebSocket error codes never appear on
this page; they go to the diagnostics view (F-02).

R11. Pairing tokens are never logged and never shown on screen.

R12. Apart from the altimeter setting, the page writes no DataRef and activates no command.

## X-Plane Web API mapping

Names verified against Laminar's DataRef list at developer.x-plane.com/datarefs. Read through one
`dataref_subscribe_values` subscription at about 10 Hz, changed values only. The altimeter is written
with `dataref_set_values` or `PATCH /api/v3/datarefs/{id}/value`. Ids are session-scoped and are
resolved by name on every connect.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Indicated airspeed | `sim/cockpit2/gauges/indicators/airspeed_kts_pilot` | float, knots | Read | docs/xplane.md |
| Mach number | `sim/cockpit2/gauges/indicators/mach_pilot` | float, Mach | Read | datarefs list |
| Indicated altitude | `sim/cockpit2/gauges/indicators/altitude_ft_pilot` | float, feet | Read | datarefs list |
| Vertical speed | `sim/cockpit2/gauges/indicators/vvi_fpm_pilot` | float, ft/min | Read | datarefs list |
| Magnetic heading | `sim/cockpit2/gauges/indicators/heading_AHARS_deg_mag_pilot` | float, deg mag | Read | datarefs list |
| Pitch | `sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot` | float, degrees up | Read | datarefs list |
| Roll | `sim/cockpit2/gauges/indicators/roll_AHARS_deg_pilot` | float, degrees right | Read | datarefs list |
| Turn rate | `sim/cockpit2/gauges/indicators/turn_rate_roll_deg_pilot` | float, deflection | Read | datarefs list |
| Slip and skid | `sim/cockpit2/gauges/indicators/slip_deg` | float, deflection | Read | datarefs list |
| Radio altitude | `sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot` | float, feet | Read | datarefs list |
| Altimeter setting | `sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot` | float, inHg | Read/Write | datarefs list |
| Standard pressure | `sim/cockpit2/gauges/actuators/barometer_setting_is_std_pilot` | int, boolean | Read/Write | datarefs list |
| Speed markings (Vso, Vfe, Vno, Vne) | not identified; verify in DataRefs.txt | — | Read | — |

Every indicator has a `_copilot` sibling; Avionix uses the pilot side. Laminar marks most of these
writable, but writes are honoured only when the matching `sim/operation/override/override_*` is set,
so Avionix treats them as read-only.

## Aircraft compatibility

`sim/cockpit2/gauges/indicators/...` is Laminar's aircraft-independent instrument layer, populated
for the default aircraft, so this works out of the box on the Cessna 172, the Baron and the default
airliners. Add-ons driving their own instruments may or may not populate it; F-03 must detect which
values resolve and mark the rest unavailable rather than show zeros. The Zibo 737's own PFD and EFIS
options are F-52.

## Competitor evidence

- The long-running free Android incumbent is built on exactly these six gauges: IAS, ADI, altimeter,
  turn coordinator, heading indicator, VSI — https://baltazarstudios.com/flight-sim-remote-panel/
- XpRemotePanel's PFD covers attitude, speed and altimeter and is credited with solving "the core
  problems really well and at a good price" — https://apps.apple.com/us/app/xpremotepanel/id1576583318
- Users buy legibility: an Air Manager reviewer wanted "bigger versions of the instruments that I can
  easily see" — https://apps.apple.com/us/app/air-manager/id1052587916
- The worst failure in this category is lag from streamed images: after X-Plane 12.4.0, Air Manager
  delay grew from about 1 s to 30 s over a flight, affecting streamed image gauges while
  dataref-driven gauges were unaffected — https://siminnovations.com/forums/viewtopic.php?p=64256
- Small gaps become persistent complaints: Simionic's altimeter is inches-only, with no hectopascals
  option — https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787

## Acceptance criteria

- [ ] Driven through full range on the mock server, every instrument tracks in both presentations,
      and the presentation choice survives a restart.
- [ ] Setting the altimeter changes the simulated altitude and the page shows the value read back;
      with that DataRef read-only, the control is disabled with a readable explanation.
- [ ] Removing one DataRef marks exactly that instrument unavailable; the other five keep updating.
- [ ] Stopping the mock server marks all six stale, with no raw protocol text on the page, and the
      main menu (no flight loaded) is reported as such.
- [ ] On a real simulator, a rolling turn at constant altitude shows the expected bank, turn rate and
      ball deflection, and the altimeter agrees with the simulator's own gauge.
- [ ] Logs contain no pairing token and no DataRef id.

## Risks and open questions

- The 10 Hz ceiling. The Web API research warns this "may feel coarse for smoothly animated PFD
  needles/tapes". Open question: does Avionix smooth between updates, and if so how does a smoothed
  needle avoid disguising a dead link? Decide before implementation.
- Which presentation is the default for a given aircraft, and whether F-03 can determine that
  reliably from the aircraft type.
- Speed markings. Whether X-Plane exposes Vso, Vfe, Vno and Vne per aircraft is unconfirmed; without
  them the airspeed display carries no coloured arcs. Verify in `DataRefs.txt`.
- Add-ons that override the instrument layer may leave these DataRefs static. F-03 needs to tell
  "not moving because the aircraft is not moving" from "not driven by this aircraft". Re-check every
  name against the in-sim `Resources/plugins/DataRefs.txt` before shipping.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. https://developer.x-plane.com/datarefs/
3. https://baltazarstudios.com/flight-sim-remote-panel/
4. https://apps.apple.com/us/app/xpremotepanel/id1576583318
5. https://apps.apple.com/us/app/air-manager/id1052587916
6. https://play.google.com/store/apps/details?id=com.siminnovations.airmanager
7. https://siminnovations.com/forums/viewtopic.php?p=64256
8. https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787
9. `docs/xplane.md`; `docs/roadmap/research/` — `xplane-web-api.md`, `panel-builders.md`,
   `remote-control-apps.md`
