# Autopilot panel

| Field | Value |
|---|---|
| ID | `F-20` |
| Stage | `1` |
| Category | Control |
| Status | Done |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 4 of 12 representative products (`research/competitors.md`). Wider set: 6 of 15 products researched offer it (XpRemotePanel, XP Remote – Voice Commands, Flight Deck ONE, Air Manager, Simionic G1000 PFD, Remote X-Plane Avionics) |

## Summary

A generic X-Plane autopilot panel on the phone or tablet: autopilot and flight director engagement,
the heading, altitude, vertical speed and airspeed selectors, the lateral and vertical modes (HDG,
NAV, APR, ALT, V/S, FLC), autothrottle arm, and a live readout of which modes are armed and which
are engaged. It works with any aircraft driven by X-Plane's built-in autopilot.

## Why now

Stage 1. With the radio stack, the autopilot panel is the control every general cockpit-remote
product ships, and the reason most users install one at all. It depends only on F-04 and F-03, and
it proves Avionix can write to the simulator safely rather than only read. The 737 Mode Control Panel (F-50)
builds on it later.

## User stories

- As a simmer, I want to set heading and altitude from my phone so that I do not have to hunt for a
  small knob with the mouse while hand-flying.
- As a simmer flying an add-on with its own autopilot, I want to be told plainly that the generic
  panel does not cover it rather than have a control do nothing.

## Scope

### In scope
- Display autopilot engagement, flight director mode, autothrottle arm state, the armed or engaged
  state of each lateral and vertical mode, and the four selectors including the knots/Mach choice.
- Change each selector and confirm the change by reading the value back from the simulator.
- Engage and disengage autopilot, flight director, autothrottle arm and each mode.
- Show a plain-language reason when a control is unavailable on the loaded aircraft.

### Out of scope (this feature)
- The 737 Mode Control Panel (F-50) and the Airbus FCU (F-57).
- HSI, CDI and course display (F-30); this panel shows autopilot state only.
- VNAV path building and flight-plan editing: the Web API exposes no navdata or flight-plan endpoint
  (`docs/roadmap/research/xplane-web-api.md`, risk 5).
- User remapping of these controls (F-06).

## Functional requirements

R1. Every displayed value comes from the subscription stream, and a change made in the simulator
appears within two subscription intervals, about 200 ms at the documented 10 Hz.

R2. Each mode shows one of three distinguishable states, off, armed or engaged, without relying on
colour alone.

R3. A selector change sends one write per pilot action, and the display always shows the last value
the simulator reported, never the value the pilot entered.

R4. If the simulator does not adopt a written value within a bounded time, the display reverts to
the simulator's value and the pilot is told the change did not take.

R5. Mode engagement uses the simulator's own command or writable state; the panel never infers
engagement from having sent a request.

R6. If a name cannot be resolved for the loaded aircraft, only that control is unavailable, with a
short explanation naming the aircraft; the rest of the panel keeps working. A write refused as
read-only makes that control unavailable for the session with the same kind of message.

R7. While disconnected, all values are marked stale with the time of the last update and all
controls are inert. Nothing is queued or replayed on reconnect.

R8. On reconnect all names are resolved again before any value is shown, because ids are valid for
one simulator session only.

R9. Errors appear as plain sentences with a next step. Protocol codes, dataref ids, host addresses
and pairing tokens never appear in the UI and are never logged.

R10. The panel never writes the autopilot override dataref. If an override is active, the pilot is
told another program is controlling the autopilot and the controls are disabled.

## X-Plane Web API mapping

Reads use the WebSocket subscription at the documented ~10 Hz, ample for state that changes at human
speed. Writes use dataref writes and command activation.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Autopilot engaged | `sim/cockpit2/autopilot/servos_on` | int, boolean | Read | [7] |
| Autopilot engage / disconnect | `sim/autopilot/servos_on`, `sim/autopilot/servos_off_any` | commands | Write | [7] |
| Flight director bars | `sim/cockpit2/autopilot/flight_director_command_bars_pilot` | int, boolean | Read | [7] |
| Flight director on / off | `sim/autopilot/fdir_command_bars_on`, `sim/autopilot/fdir_command_bars_off` | commands | Write | [7] |
| Autothrottle state | `sim/cockpit2/autopilot/autothrottle_enabled` | int: −1 hard off, 0 armed, 1 speed, 2 N1, 3 retard | Read | [7] |
| Autothrottle engage / off (stays armed) | `sim/autopilot/autothrottle_on`, `sim/autopilot/autothrottle_off` | commands | Write | [7] |
| Autothrottle arm / disarm | `sim/autopilot/autothrottle_arm`, `sim/autopilot/autothrottle_hard_off` | commands | Write | [7] |
| Heading selector | `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot` | float, degrees magnetic | Read/Write | [1], [4] |
| Heading-control compatibility probe (a required binding only; the panel's heading steppers and typed entry write the selector dataref above directly, never this command) | `sim/autopilot/heading_up` | command | Write | [4] |
| Altitude selector | `sim/cockpit2/autopilot/altitude_dial_ft` | float, feet | Read/Write | [7] |
| Vertical speed selector | `sim/cockpit2/autopilot/vvi_dial_fpm` | float, ft/min | Read/Write | [7] |
| Airspeed selector, knots/Mach flag | `sim/cockpit2/autopilot/airspeed_dial_kts_mach`, `sim/cockpit2/autopilot/airspeed_is_mach` | float, knots or Mach; int, boolean (read only) | Read/Write | [7] |
| Knots/Mach toggle | `sim/autopilot/knots_mach_toggle` | command | Write | [7] |
| HDG mode | `sim/cockpit2/autopilot/heading_status`; `sim/autopilot/heading` | int: 0 off, 2 captured; command | Read/Write | [7] |
| NAV mode | `sim/cockpit2/autopilot/nav_status`; `sim/autopilot/NAV` | int: 0 off, 1 armed, 2 captured; command | Read/Write | [7] |
| APR mode | `sim/cockpit2/autopilot/approach_status`; `sim/autopilot/approach` | int: 0 off, 1 armed, 2 captured; command | Read/Write | [7] |
| Glideslope status | `sim/cockpit2/autopilot/glideslope_status` | int: 0 off, 1 armed, 2 captured | Read | [7] |
| ALT mode | `sim/cockpit2/autopilot/altitude_hold_status`; `sim/autopilot/altitude_hold` | int: 0 off, 1 armed, 2 captured; command | Read/Write | [7] |
| VS mode | `sim/cockpit2/autopilot/vvi_status`; `sim/autopilot/vertical_speed` | int: 0 off, 2 captured; command | Read/Write | [7] |
| FLC mode | `sim/cockpit2/autopilot/speed_status`; `sim/autopilot/level_change` | int: 0 off, 2 captured; command | Read/Write | [7] |
| Roll / pitch hold status | `sim/cockpit2/autopilot/roll_status`, `sim/cockpit2/autopilot/pitch_status` | int: 0 off, 2 captured | Read | [7] |
| Plugin autopilot override | `sim/operation/override/override_autopilot` | int, boolean | Read only | [1] |

The `mode_hnav`, `airspeed_mode`, `heading_mode`, `altitude_mode` and `altitude_gls` datarefs under
`sim/cockpit/autopilot/` are documented as deprecated and must not be used [1].

## Aircraft compatibility

Default aircraft using the Laminar autopilot need no per-aircraft handling. Add-ons with their own
autopilot logic (Zibo 737, ToLiss, Hot Start) mirror `sim/cockpit2/autopilot/...` only in part and
otherwise use their own namespace, for example `laminar/B738/autopilot/...`, which is
community-sourced and changes between Zibo releases (`docs/roadmap/research/xplane-web-api.md`,
section C). F-03 selects the panel; where an add-on matches partially, only the controls whose names
resolve are offered.

## Competitor evidence

- The broadest product surveyed leads with "real-time MCP/EFIS/autopilot/radio/transponder
  control" — https://flightdeckone.app/
- XpRemotePanel ships a KFC-200-style autopilot panel and is reviewed as solving "the core problems
  really well and at a good price" — https://apps.apple.com/us/app/xpremotepanel/id1576583318
- Laminar's own Control Pad has no cockpit-panel or autopilot UI, leaving this gap open —
  https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
- The complaint to avoid is desktop-sized controls on a phone: a competitor's stack is "still
  impossible to use on an 8 inch screen" —
  https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc

## Acceptance criteria

- [ ] Every selector and annunciation renders only from subscription values.
- [ ] A mocked read-only refusal disables just that control with a plain-language message and no
      protocol code; a mocked missing altitude selector leaves the rest of the panel working.
- [ ] On a real sim, moving the heading bug in X-Plane updates the panel within 200 ms, and setting
      it from the panel moves the bug on the HSI.
- [ ] Engaging HDG shows "engaged" only after `heading_status` reads 2.
- [ ] Disconnecting marks values stale, disables controls, and a control pressed while disconnected
      produces no write after reconnect; logs contain no token, id or host address.

## Risks and open questions

- The altitude, vertical speed and airspeed selector names, and the per-mode engage commands, were
  not found in any Laminar article in this research. Read them from the in-sim `DataRefs.txt` and
  `Commands.txt` and confirm with a live query before implementation. **Resolved:** the design
  spec's Verified names table confirmed every name against `DataRefs.txt` and `Commands.txt`; see
  the mapping table above.
- Open questions: write on every increment or only when adjustment stops; pilot side only or pilot
  and copilot flight director separately; direct value entry as well as increments. **Resolved:**
  one write per pilot action; pilot side only, with copilot selectors and flight director left out
  of scope; both steppers and typed entry were built.
- `autopilot_state` bits may differ on add-ons that drive the dataref; verify per aircraft.
  **Resolved:** the panel never reads or writes `autopilot_state`; it uses the per-mode `*_status`
  DataRefs instead, so this risk does not apply.
- The rate is "currently 10 Hz" (`docs/roadmap/research/xplane-web-api.md`, risk 1); do not promise
  smoother. Ids are session-scoped and must never be persisted (risk 4).

## References

1. https://developer.x-plane.com/article/accessing-the-x-plane-autopilot-from-datarefs/
2. https://developer.x-plane.com/article/flight-director-and-autothrottle-datarefs/
3. https://developer.x-plane.com/article/x-plane-web-api/
4. `docs/xplane.md`
5. `docs/roadmap/research/xplane-web-api.md`, `remote-control-apps.md`, `panel-builders.md`
6. https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc
7. Design spec: docs/superpowers/specs/2026-10-06-autopilot-panel-design.md
