# Moving map with ownship

| Field | Value |
|---|---|
| ID | `F-13` |
| Stage | `3` |
| Category | Monitoring |
| Status | Proposed |
| Depends on | `F-11` |
| Competitor prevalence | Matrix count 3 of 12 representative products (`research/competitors.md`). Wider set: 12 of 28 products researched show a moving map (ForeFlight, Garmin Pilot, SkyDemon, Navigraph Charts, Little Navmap, FltPlan Go, AviTab, X-Plane Control Pad, SimControlX, FS-FlightControl, XPlaneMonitor, Flight Deck ONE) |

## Summary

A map page places the ownship symbol at the simulated latitude and longitude, points it along the
current track, and keeps it centred as the flight progresses. The pilot can switch between
heading-up and north-up, change the range, and read the values driving the symbol. This is the page
a second device suits best: it wants a whole screen and is glanced at rather than operated.

## Why now

Stage 3 is where Avionix stops mirroring instruments and starts answering "where am I". A moving map
is the most common feature in the competitor set, so its absence is conspicuous. It follows F-11,
because both read the same position and track values and must never disagree. F-31 draws its route
here and F-40 draws its targets here.

## User stories

- As a VFR pilot, I want position and track on a map on my tablet so that I can keep the simulator
  window on the outside view.
- As an IFR pilot, I want range rings and a north-up option so that I can judge distances against a
  chart I am holding, and I want the map to work with no internet on the device.
- As a pilot whose link has dropped, I want the symbol visibly stale rather than silently frozen so
  that I never fly a position that stopped updating a minute ago.

## Scope

### In scope
- An ownship symbol at the simulated latitude and longitude, rotated to the current track.
- Heading-up and north-up, selectable and remembered; a selectable range with rings labelled in
  nautical miles; manual pan and a recentre control.
- A readout of latitude, longitude, altitude, ground speed and track matching F-11, with a position
  age indicator and a stale mark.
- A base map layer, and defined behaviour when it cannot be loaded.

### Out of scope (this feature)
- Route, waypoints and legs: F-31. Airports, navaids, airways, airspace and procedures: F-34.
  Traffic: F-40. Weather overlays and radar: F-41. Recording and exporting the flown track: F-14.
- Terrain and obstacle layers, and any terrain warning.
- Any control of the aircraft from the map: direct-to, repositioning, slew.

## Functional requirements

R1. While connected with a flight loaded, the map places the ownship symbol at the simulated latitude
and longitude and rotates it to the current ground track.

R2. Position and track update at the rate the simulator delivers, up to the Web API ceiling of about
10 Hz. The map does not claim or imply a higher rate.

R3. The pilot can switch between heading-up and north-up. In heading-up the map rotates and the
symbol stays upright; in north-up the map is fixed and the symbol rotates. The choice persists.

R4. The pilot can select a display range from a fixed set; range rings are drawn at regular fractions
of it and labelled in nautical miles.

R5. A readout shows latitude, longitude, altitude, ground speed and track using the same values and
units as F-11, plus the age of the last position update. The map and the strip never show different
values for the same quantity, and the symbol is marked stale past a defined threshold.

R6. On disconnect, the map keeps the last known position, marks it stale, and states that the
connection is lost. It does not blank the page and does not extrapolate the position forward. With no
flight loaded and no DataRefs exposed, it says so and shows no symbol.

R7. If a position DataRef cannot be resolved on the loaded aircraft, the map names the unavailable
value in plain language and disables only what depends on it. These DataRefs are simulator-wide, so
this should be rare, but the behaviour is required.

R8. If the base map layer needs internet access and it is unavailable, the map still draws the symbol,
the rings and the readout over an empty background and says the base map could not be loaded. Losing
the base map never blocks the position display.

R9. Manual panning suspends automatic centring; the recentre control restores it, as does a defined
period without interaction.

R10. Raw protocol errors, DataRef ids, HTTP status codes and WebSocket error codes never appear on
this page; they go to the diagnostics view (F-02).

R11. Pairing tokens are never logged and never shown on screen.

R12. The map writes no DataRef and activates no command.

## X-Plane Web API mapping

Names verified against Laminar's DataRef list at developer.x-plane.com/datarefs. All read over one
`dataref_subscribe_values` subscription at about 10 Hz. The Web API exposes no navdata: there is no
endpoint for airports, navaids, airways or procedures, so this feature can place the aircraft but
cannot label anything around it.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Latitude | `sim/flightmodel/position/latitude` | double, degrees | Read | datarefs |
| Longitude | `sim/flightmodel/position/longitude` | double, degrees | Read | datarefs |
| Elevation | `sim/flightmodel/position/elevation` | double, metres MSL | Read | datarefs |
| Magnetic heading | `sim/flightmodel/position/mag_psi` | float, degrees mag | Read | datarefs |
| True heading | `sim/flightmodel/position/true_psi` | float, degrees true | Read | datarefs |
| Magnetic variation | `sim/flightmodel/position/magnetic_variation` | float, degrees | Read | datarefs |
| Ground track | `sim/cockpit2/gauges/indicators/ground_track_mag_pilot` | float, degrees mag | Read | datarefs |
| Ground speed | `sim/cockpit2/gauges/indicators/ground_speed_kt` | float, knots | Read | datarefs |

Notes. `sim/flightmodel/position/magpsi`, without the underscore, is marked replaced with the
description "DO NOT USE THIS"; the correct name is `mag_psi`. Latitude, longitude and elevation are
doubles and must not be narrowed to single precision; elevation is metres.

## Aircraft compatibility

Position, track and heading come from simulator-level DataRefs rather than the aircraft model, so
this behaves identically on the Laminar defaults, the Zibo 737 and any add-on. No aircraft-specific
handling is expected; F-03 only labels the readout and picks a default range on first use.

## Competitor evidence

- A moving map is table stakes: every EFB researched shows ownship on a map, as do the instructor
  stations — https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/
- Little Navmap is the reference moving map for X-Plane, called "free and excellent" on X-Plane's own
  forum — https://forums.x-plane.org/files/file/41694-little-navmap/
- A thin map is worse than none: users say of AviTab that "their map section isn't close to what is on
  LittleNavMap" —
  https://forums.x-plane.org/files/file/44825-avitab-vr-compatible-tablet-with-pdf-viewer-moving-maps-and-more/
- Silent staleness is the failure mode to avoid: ForeFlight users reported they could "land and be on
  the ground for sometimes up to 5 minutes before Foreflight shows the approach and landing" —
  https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight
- The fix that earns credit is a visible link readout, like ForeFlight's "Accuracy (X-Plane) 1m" —
  https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator
- Requiring the internet for a local flight is a complaint, not a feature: Navigraph's Simlink relays
  position through Navigraph's cloud and needs internet even for a single-PC setup —
  https://forum.navigraph.com/t/simlink-xplane-12/14318

## Acceptance criteria

- [ ] On a scripted track the symbol follows the path and the readout matches; both orientations
      behave as specified, the choice survives a restart, and every range draws labelled rings.
- [ ] Stopping the mock server marks the position stale within the threshold and shows the
      connection-lost message; the main menu shows "no flight loaded"; no raw protocol text appears.
- [ ] Offline from the internet but on the sim LAN, the symbol, rings and readout still work and the
      base-map message is shown.
- [ ] On a real simulator, a circuit at a known airfield puts the symbol over the runway on touchdown
      and the track matches within one degree; logs hold no token and no DataRef id.

## Risks and open questions

- Base map source. Online tiles need internet on the device, which conflicts with the common isolated
  sim LAN and with the Navigraph complaint above. Open question: does Avionix ship an offline
  fallback, such as a coarse built-in world outline or a tile region downloaded in advance, and at
  what fidelity? Answer before implementation; tile licensing and cost are open with it.
- The Web API provides no navdata, so everything beyond ownship depends on F-34 and an external
  source. Avionix must not imply chart-grade content here.
- Update rate. At 10 Hz the symbol steps rather than glides unless the client interpolates. Open
  question: does the map interpolate, and does the age indicator still report the true age of the
  last real update?
- Track versus heading. Which drives symbol rotation and which drives map rotation in heading-up
  needs settling against the sim, as do great-circle distance and bearing conventions for the range
  rings at high latitude. Re-check every name against the in-sim `Resources/plugins/DataRefs.txt`
  before shipping.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. https://developer.x-plane.com/datarefs/
3. https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/
4. https://forums.x-plane.org/files/file/41694-little-navmap/
5. https://forums.x-plane.org/files/file/44825-avitab-vr-compatible-tablet-with-pdf-viewer-moving-maps-and-more/
6. https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight
7. https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator
8. https://forum.navigraph.com/t/simlink-xplane-12/14318
9. `docs/xplane.md`; `docs/roadmap/research/` — `xplane-web-api.md`, `efb-moving-map.md`
