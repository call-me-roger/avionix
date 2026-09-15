# HSI, CDI and navigation indicators

| Field | Value |
|---|---|
| ID | `F-30` |
| Stage | `2` |
| Category | Navigation |
| Status | Proposed |
| Depends on | `F-21`, `F-10` |
| Competitor prevalence | Matrix count 3 of 12 representative products (`research/competitors.md`). Wider set: 5 of 8 panel/remote products researched offer it (XpRemotePanel Navigation Pack, Simionic G1000 PFD, Air Manager community instruments, RemoteFlight COCKPIT HD / RADIO HD, Flight Deck ONE) |

## Summary

The pilot gets the lateral and vertical guidance picture on a phone or tablet: selected course,
course deviation in dots, the TO/FROM flag, glideslope deviation and its flag, bearing pointers to
the tuned navaids, DME distance, and which source (NAV1, NAV2 or GPS/FMS) the display follows. The
course/OBS can be set from the device. Used in cruise for tracking a radial and, above all, on
arrival and approach.

## Why now

Stage 2 completes the generic cockpit. F-21 gives the pilot the NAV frequencies; a tuned frequency
with no deviation display is half a feature, and researched products that sell a navigation tier
sell exactly this pairing — XpRemotePanel's paid Navigation Pack is literally "NAV stack, CDI,
HSI" (https://apps.apple.com/us/app/xpremotepanel/id1576583318). It is also the last generic
instrument group before the aircraft-specific work of Stages 4 and 5, and it gives F-13 and F-31
their first real navigation state.

## User stories

- As a pilot flying an ILS, I want deviation, glideslope and TO/FROM beside me so that I can fly
  the approach without leaning into the simulator window.
- As a pilot tracking a VOR radial, I want to set the course/OBS by touch rather than dragging a
  small knob with the mouse.
- As a pilot switching between GPS and NAV guidance, I want the panel to say which source drives
  the needle so that I am never guessing what it means.

## Scope

### In scope
- Selected course and OBS, shown and settable, pilot side; copilot side shown where published.
- Lateral and vertical (glideslope) deviation in dots, with their validity flags.
- TO/FROM indication with its three states: flag, TO, FROM.
- Bearing pointers for NAV1, NAV2, ADF1, ADF2 and the GPS/FMS destination.
- DME distance, groundspeed and time, and whether a DME signal is present at all.
- The received navaid identifier, and marker beacon indications.
- The active HSI source as a read-out and, where writable, as a control.

### Out of scope (this feature)
- Map and route drawing (F-13, F-31); charts, airports and procedures (F-34).
- Autopilot mode coupling and arming (F-20); the 737 EFIS panel (F-52).
- Aircraft-specific HSIs that do not publish the standard datarefs (F-50..F-57).

## Functional requirements

R1. While connected with a flight loaded, the panel shows course, lateral and vertical deviation,
TO/FROM, DME distance and active source from the subscription stream, no value older than 1 s.

R2. Deviation is presented in dots, and the panel states the unit so that a full-scale reading is
unambiguous.

R3. When TO/FROM reads the "flag" state, or the horizontal-signal flag is false, deviation is
shown as invalid rather than as a centred needle.

R4. Glideslope deviation is shown only while the glideslope flag indicates a usable signal;
otherwise the glideslope is shown as unavailable.

R5. The pilot can set the course/OBS to a whole degree in 0-359. The write is confirmed by the
value returning on the subscription; if nothing changes within 2 s the control reverts to the
simulator value and the panel says the change was not accepted.

R6. The pilot can change the HSI source where that dataref is writable; where it is not, the
source is read-only and the control is disabled with a stated reason.

R7. A bearing pointer is shown only for a source reporting a valid signal; a source without signal
is parked or hidden, never drawn at 0 degrees.

R8. DME distance, speed and time are shown only while the matching "has DME" flag is true.

R9. The navaid identifier is decoded to text; an empty or undecodable value is shown blank, never
as raw base64.

R10. On connection loss every value is marked stale within 2 s, last values stay visible and
dimmed, and all controls are disabled until the session reconnects.

R11. When a dataref or command is missing on the loaded aircraft, that one indicator is shown as
unavailable with a short note naming the missing function; the rest of the panel keeps working.

R12. Error text is plain language: raw protocol errors, dataref ids and status codes never reach
the UI, and pairing tokens are never logged.

R13. A write rejected as read-only produces one non-blocking message and reverts the control.

## X-Plane Web API mapping

All values are ordinary datarefs, so REST reads, subscription and writes apply; the documented
~10 Hz rate is adequate because needles move slowly. Names marked (unverified) come from a
community mirror of `DataRefs.txt`, not a Laminar page, and must be confirmed against the
`DataRefs.txt` shipped with the simulator.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| HSI source select | `sim/cockpit2/radios/actuators/HSI_source_select_pilot`, `..._copilot` | int enum: 0 NAV1, 1 NAV2, 2 GPS | R/W | [1] |
| Selected course | `sim/cockpit2/radios/actuators/nav1_course_deg_mag_pilot`, `nav2_...` (unverified) | float, degrees magnetic | R/W | [2] |
| OBS setting | `sim/cockpit2/radios/actuators/hsi_obs_deg_mag_pilot`, `nav1_obs_deg_mag_pilot` (unverified) | float, degrees magnetic | R/W | [2] |
| Lateral / vertical deviation | `sim/cockpit2/radios/indicators/hsi_hdef_dots_pilot`, `hsi_vdef_dots_pilot` (unverified) | float, dots | R | [2] |
| TO/FROM | `sim/cockpit2/radios/indicators/hsi_flag_from_to_pilot` (unverified) | int enum: 0 flag, 1 to, 2 from | R | [2] |
| Signal validity | `sim/cockpit2/radios/indicators/nav1_display_horizontal`, `nav1_flag_glideslope` (unverified) | int boolean | R | [2] |
| Bearing pointers | `sim/cockpit2/radios/indicators/nav1_bearing_deg_mag`, `adf1_`, `gps_`, `hsi_bearing_deg_mag_pilot` (unverified) | float, degrees magnetic | R | [2] |
| DME present / distance / time | `sim/cockpit2/radios/indicators/hsi_has_dme_pilot`, `hsi_dme_distance_nm_pilot`, `nav1_dme_time_min` (unverified) | int boolean; float nm, minutes | R | [2] |
| Navaid identifier | `sim/cockpit2/radios/indicators/navN_nav_id`, `navN_dme_id` | string | R | [3] |
| Marker beacons | `sim/cockpit2/radios/indicators/over_outer_marker`, `over_middle_marker`, `over_inner_marker` (unverified) | int boolean | R | [2] |
| Course step commands | not identified; verify in `Commands.txt` | command | Activate | — |

## Aircraft compatibility

Default aircraft with a conventional HSI or CDI publish the `sim/cockpit2/radios` family and should
need no per-aircraft mapping — the same surface F-21 uses. Glass aircraft may publish the
indicators but drive the source selector from their own EFIS logic, leaving it read-only. Zibo and
similar add-ons route HSI state through the community-documented `laminar/B738/...` subtree, which
changes between point releases; the 737 treatment is F-52, and F-03 selects the active mapping.

## Competitor evidence

- XpRemotePanel sells CDI and HSI behind a paid Navigation Pack alongside the NAV stack, treating
  deviation as the natural companion to radio tuning.
  https://apps.apple.com/us/app/xpremotepanel/id1576583318
- Simionic's G1000 PFD still shipped navigation fixes years after release (v7.6.1 improved "LPV
  CDI sensitivity and approach naming") and is marked down for functional gaps, not looks.
  https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787
- Air Manager's worst regression hit *streamed image* gauges while dataref-driven gauges were
  unaffected, so a needle computed from dataref values is the safer construction.
  https://siminnovations.com/forums/viewtopic.php?p=64256
- Legacy remote panels are criticised for desktop-sized controls — a radio stack "still impossible
  to use on an 8 inch screen" — so a course selector must be usable with a thumb.
  https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc

## Acceptance criteria

- [ ] Against the mock server, every indicator renders from subscription updates and all are
      marked stale within 2 s of a dropped socket.
- [ ] Setting a course writes the dataref and the display follows the simulator value once the
      update arrives; a rejected write reverts with one plain message.
- [ ] Removing each dataref from the mock in turn leaves the rest of the panel working.
- [ ] On a real simulator, an ILS shows sensible lateral and vertical deviation, the glideslope
      flag clears on capture, and TO/FROM flips at station passage.
- [ ] No raw protocol text appears in the UI; logs contain no token.

## Risks and open questions

1. The `hsi_*` and `nav*_*` names above come from a community mirror and are unconfirmed for
   X-Plane 12; each must be resolved against a live dataref query before it is relied on.
2. Are the course/OBS datarefs writable in X-Plane 12, or must a course-step command be used? No
   such command was identified in this pass.
3. Sign and full-scale conventions for the dots datarefs need checking on the sim so the needle
   deflects correctly on a localizer back course.
4. Should the panel default to the pilot or copilot side, and should both be offered on one
   device? A product question for F-04 and F-07.

## References

1. https://developer.x-plane.com/article/navgps-source-selectors-cdis-hsis-and-the-new-gps-navigator/
2. https://raw.githubusercontent.com/Marginal/XPlane2Blender/master/DataRefs.txt (community mirror
   of Laminar's `DataRefs.txt`; names taken from it are marked unverified)
3. https://developer.x-plane.com/article/changes-to-radio-navigation/
4. https://developer.x-plane.com/article/x-plane-web-api/
5. docs/roadmap/research/remote-control-apps.md, docs/roadmap/research/panel-builders.md
