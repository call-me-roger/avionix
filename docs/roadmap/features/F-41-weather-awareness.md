# Weather radar and weather awareness

| Field | Value |
|---|---|
| ID | `F-41` |
| Stage | `5` |
| Category | Surveillance |
| Status | Proposed |
| Depends on | `F-13` |
| Competitor prevalence | Matrix count 2 of 12 representative products (`research/competitors.md`). Wider set: 5 of 13 products researched surface weather (X-Plane Control Pad, SimControlX, FS-FlightControl, Little Navmap, AirFMC's METAR download); none of them shows radar returns on a mobile device |

## Summary

The pilot sees the weather the simulator is actually modelling around the aircraft — wind,
temperature, visibility, pressure and the cloud and turbulence layers — and can see and set the
aircraft's weather radar controls from the device. It is used in the cruise and on descent, on a
tablet, as an awareness and briefing aid beside the map of F-13.

## Why now

Stage 5, because the honest version of this feature is smaller than the name suggests and should
not displace features that deliver more. Weather appears in instructor products as a *control*
surface and in map products as a *briefing* surface, but nothing researched puts the simulator's
own modelled weather in front of the pilot on a second device.

## User stories

- As a pilot in the cruise, I want the wind, temperature and cloud layers the simulator is
  actually modelling so that I can plan a descent against real conditions, not a guess.
- As a pilot, I want the radar controls on the tablet, and a plain statement that no radar picture
  is available, so that I am not left wondering whether the app is broken.

## Scope

**There are no weather radar returns over the Web API.** X-Plane exposes radar reflectivity only
as an 8-bit texture read through the plugin SDK's `XPLMGetTexture` (`xplm_Tex_Radar_Pilot` /
`_Copilot`), which is not a dataref and is unreachable from REST or the WebSocket. Avionix can
mirror and operate the radar *controls* — mode, gain, tilt, sector, multiscan and the rest — but
it cannot draw a radar picture, and must never present an approximation built from regional
weather datarefs as if it were radar. Hence "weather awareness".

### In scope
- Wind direction and speed, temperature, dewpoint, pressure and visibility at the aircraft.
- Cloud and turbulence layers, with their bases, tops and coverage, as the simulator models them.
- Precipitation and icing indications where the simulator publishes them.
- The regional weather controls, shown and, where writable, settable.
- The weather radar control panel — mode, gain, tilt and auto-tilt, sector and antenna limits,
  multiscan, stabilisation, ground clutter suppression, predictive windshear — mirrored from the
  simulator and settable from the device.
- An explicit statement, on the radar screen, that no radar image is available and why.

### Out of scope (this feature)
- Any radar return, echo, reflectivity or precipitation image. Not possible over the Web API.
- Real-world weather products, METARs, TAFs and forecast charts from outside the simulator.
- Weather generation and failure injection for instructors (F-25).
- The 737 EFIS radar controls in their own panel (F-52).

## Functional requirements

R1. While connected, the panel shows wind, temperature, pressure and visibility at the aircraft,
refreshed from the subscription stream, no value older than 2 s.

R2. Cloud and turbulence layers are listed with altitudes and coverage in the order the simulator
reports them, with units shown.

R3. Aircraft-position weather values are presented as read-only, because the simulator publishes
them that way; regional values are editable only where the dataref is writable.

R4. A regional weather change written from the device is confirmed by the value returning on the
subscription; if it does not change within 2 s the control reverts and the panel says the change
was not accepted.

R5. Radar mode, gain, tilt and the other control values are mirrored from the simulator and can be
changed from the device where writable.

R6. The radar screen states, without the pilot having to ask, that the simulator exposes no radar
returns to this kind of client, in plain language and without blaming the pilot's setup.

R7. Avionix never draws a radar-like image from any other data source.

R8. On connection loss all values are marked stale within 2 s and every control is disabled until
the session reconnects.

R9. When a weather or radar dataref is missing on the connected simulator or loaded aircraft, that
one value is shown as unavailable with a short reason; the rest of the panel keeps working.

R10. Error text is plain language: raw protocol errors, dataref ids and status codes never reach
the UI, and pairing tokens are never logged.

## X-Plane Web API mapping

Weather and radar controls are ordinary datarefs, readable and — regional and radar values —
writable over REST and the WebSocket at ~10 Hz, far more than weather needs. Laminar's weather
article describes the `sim/weather/aircraft/` (read-only, at the aircraft) and
`sim/weather/region/` (mostly writable) split but does not enumerate the individual wind,
temperature, visibility and layer datarefs, so those are marked not identified below.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Weather at the aircraft (wind, temperature, visibility, layers) | `sim/weather/aircraft/...`; individual names not identified; verify in `DataRefs.txt` | — | R | [1] |
| Regional weather, altitude levels | `sim/weather/region/atmosphere_alt_levels_m` | float array, metres | R | [1] |
| Regional weather behaviour | `sim/weather/region/change_mode`, `variability_pct`, `update_immediately` | int / float | R/W | [1] |
| Regenerate weather | `sim/operation/regen_weather` | command | Activate | [1] |
| Radar mode | `sim/cockpit2/EFIS/EFIS_weather_mode`, `..._copilot` | int enum | R/W | [2] |
| Radar gain | `sim/cockpit2/EFIS/EFIS_weather_gain`, `..._copilot` | float | R/W | [2] |
| Radar tilt, auto-tilt, actual antenna angle | `sim/cockpit2/EFIS/EFIS_weather_tilt`, `EFIS_weather_auto_tilt`, `EFIS_weather_tilt_antenna` | float / int | R/W | [2] |
| Sector scan and antenna limit | `sim/cockpit2/EFIS/EFIS_weather_sector_brg`, `EFIS_weather_sector_width`, `EFIS_weather_antenna_limit`, `EFIS_weather_sweeps_per_sec` | float / int | R/W | [2] |
| Multiscan and elevation | `sim/cockpit2/EFIS/EFIS_weather_multiscan`, `EFIS_weather_alt` | int / float | R/W | [2] |
| Stabilisation, ground clutter, windshear | `sim/cockpit2/EFIS/EFIS_weather_stab`, `EFIS_weather_gcs`, `EFIS_weather_pws` | int | R/W | [2] |
| Radar returns | none; texture only via `XPLMGetTexture` (`xplm_Tex_Radar_Pilot`), plugin SDK, not reachable from the Web API | — | — | [2] |

## Aircraft compatibility

The weather datarefs are simulator-wide and aircraft-independent, so the awareness half works with
any aircraft. The radar controls under `sim/cockpit2/EFIS/` exist only for aircraft that model a
weather radar; for the rest R9 applies. Add-ons with their own radar panel may keep state in their
own datarefs, so this panel could show Laminar values that do not match the aircraft's display —
the 737 case is F-52, and F-03 decides which mapping is active.

## Competitor evidence

- The Laminar article that documents the radar controls is explicit that return strength is only
  available through `XPLMGetTexture` and not as a dataref, which is what rules out a radar image
  here. https://developer.x-plane.com/article/weather-radar-for-x-plane-12-3-1/
- Instructor products treat weather as something you *set*: Laminar's Control Pad offers full
  weather and environment control from an iPad, and SimControlX does the same with layered custom
  weather plus real METAR. https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565,
  https://apps.apple.com/us/app/simcontrolx/id1380341055
- Little Navmap surfaces airport weather and winds aloft on the map, i.e. weather as awareness
  rather than control. https://github.com/albar965/littlenavmap
- AirFMC bolts a METAR download onto a CDU app, evidence that pilots want weather where they are
  already looking. https://apps.apple.com/us/app/airfmc/id773310905

## Acceptance criteria

- [ ] Against the mock server, wind, temperature, pressure, visibility and the layer list render
      and update, and all are marked stale within 2 s of a dropped socket.
- [ ] A writable regional value round-trips; a rejected write reverts with one plain message.
- [ ] Radar controls mirror the mock values and changes are reflected back from the simulator.
- [ ] The "no radar returns" statement is visible on the radar screen without scrolling on a
      phone-sized screen.
- [ ] With the EFIS radar datarefs absent, the radar section shows as unavailable and the weather
      section keeps working.
- [ ] No raw protocol text appears in the UI; logs contain no token.

## Risks and open questions

1. The individual `sim/weather/aircraft/` names are not identified. The full set of wind,
   temperature, visibility, cloud and turbulence datarefs, and the array shapes of the layer data,
   must be read from the simulator's `DataRefs.txt`.
2. Regional weather is described as "mostly" writable; which datarefs actually accept writes needs
   testing, and R4 must handle the ones that do not.
3. Writing regional weather changes the flight for everyone connected to that simulator. Should
   this panel be able to change weather at all, or is that strictly an instructor feature (F-25)?
4. Cloud and turbulence layers are handled as arrays rather than individually named datarefs; the
   indexing convention is unverified.
5. Pilots will expect a radar picture because every airliner has one. The wording of R6 needs to
   be tested on someone who has not read the API documentation.
6. Whether wind should also appear on the F-13 map, rather than only in this panel, is a layout
   question for F-04.

## References

1. https://developer.x-plane.com/article/weather-datarefs-in-x-plane-12/
2. https://developer.x-plane.com/article/weather-radar-for-x-plane-12-3-1/
3. https://developer.x-plane.com/article/x-plane-web-api/
4. docs/roadmap/research/xplane-web-api.md, docs/roadmap/research/remote-control-apps.md,
   docs/roadmap/research/efb-moving-map.md
