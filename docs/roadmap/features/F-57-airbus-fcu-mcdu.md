# Airbus (ToLiss) FCU and MCDU

| Field | Value |
|---|---|
| ID | `F-57` |
| Stage | `5` |
| Category | Aircraft-specific |
| Status | Proposed |
| Depends on | `F-50`, `F-51` |
| Competitor prevalence | Matrix count 3 of 12 representative products (`research/competitors.md`). Wider set: 5 of 13 researched companion products offer a ToLiss MCDU (WebFMC Pro, AirFMC, X-CDU, Flight Deck FMS, Remote X-Plane Avionics); 2 of those also offer an Airbus FCU (Remote X-Plane Avionics, Flight Deck ONE) |

## Summary

Avionix puts the ToLiss Airbus Flight Control Unit and MCDU on a phone or tablet: the speed,
heading, altitude and vertical speed windows with their push and pull selections, the EFIS
selectors beside them, and the MCDU screen with its keyboard. It serves the same flight phases as
the 737 equivalents, for the other half of the airliner fleet X-Plane users fly.

## Why now

Strictly Stage 5, and strictly after the 737. The Airbus is the second most-supported type in this
category and every broad competitor lists ToLiss aircraft [1], [2]. But no ToLiss dataref or command
name appears anywhere in the research, so this feature starts from zero evidence where F-50 and
F-51 start from partial evidence. Doing it second means the compatibility layer, the per-control
degradation and the CDU mirror are already proved, and this becomes a mapping exercise rather than
a second research project. It depends on F-50 for panel behaviour and F-51 for CDU behaviour.

## User stories

- As a ToLiss pilot, I want the FCU on my tablet so that I can set speed, heading and altitude
  without moving the simulator view.
- As a ToLiss pilot, I want push and pull to be distinct actions, because managed and selected
  modes are the whole point of the panel.
- As a user of both fleets, I want the Airbus panels to behave like the 737 ones so that I do not
  learn the app twice.

## Scope

### In scope

- A verification task, done first on a pinned ToLiss version, recording which FCU, EFIS and MCDU
  datarefs and commands exist and whether they are readable and writable. Its result is recorded
  here before anything else is committed, exactly as in F-51.
- FCU: speed or Mach, heading or track, altitude and vertical speed or flight path angle, each with
  its window value, and the push and pull actions kept distinct.
- The EFIS selectors beside the FCU: barometric setting with units and STD, display mode and range,
  and the navigation display option switches the aircraft exposes.
- The autopilot, autothrust and flight director engagement state as the aircraft reports it.
- MCDU: the screen mirror and full key set on the same terms as F-51, including the second MCDU
  where exposed, and a note of which ToLiss aircraft and version the mapping was tested against.

### Out of scope (this feature)

- Any flight-management logic of Avionix's own. The Web API offers no navdata, no procedure lookup
  and no flight-plan upload [3], so the MCDU is a mirror and a keyboard, nothing more.
- ECAM, PFD and navigation display rendering (F-10, F-30, F-13); the Airbus overhead and pedestal.
- Aircraft from other developers, including other Airbus add-ons.

## Functional requirements

R1. Before implementation, the verification run records every FCU, EFIS and MCDU name found for the
pinned ToLiss version. Any part with no usable names is dropped rather than shipped degraded.

R2. While connected to a recognised ToLiss aircraft, every window and selector shows the aircraft's
own value or position, and every engagement indication shows the aircraft's own state.

R3. Push and pull are separate actions in the app and produce the aircraft's separate behaviours;
neither is inferred from the other.

R4. Where a window can be in a managed state with no selected value, the app shows that state and
does not display a stale number as if it were selected.

R5. The MCDU mirror and keyboard behave as F-51 specifies: the screen is shown as the aircraft
renders it and each key sends one press per tap, in order.

R6. A control whose name cannot be resolved is marked unavailable in plain language and the rest of
the panel keeps working. When the loaded aircraft is not a recognised ToLiss type, the feature is
not offered and the app names the aircraft it detected.

R7. On disconnection every value is marked stale within one second and no control accepts input; on
reconnection all names are resolved again before the panel becomes live, because ids are
session-scoped [3].

R8. A rejected write or command produces a short message naming the control and the fact that the
aircraft refused it. No raw protocol error, endpoint or payload is shown; tokens are never logged.

## X-Plane Web API mapping

Reads, writes and command activations at the ~10 Hz subscription rate, which suits FCU windows and
CDU text [3]. No ToLiss name was found in any source consulted, so every row below says so; ToLiss
publishes its own non-standard set, like every payware FMS [4].

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| FCU speed/Mach, heading/track, altitude, vertical speed/FPA windows | not identified; verify in DataRefs.txt against a running ToLiss aircraft | — | R/W | [3] |
| FCU push and pull actions per window | not identified; verify in Commands.txt | — | W | [3] |
| Barometric setting, units, STD; display mode and range; ND options | not identified; verify in DataRefs.txt | — | R/W | [3] |
| Autopilot, autothrust and flight director engagement state | not identified; verify in DataRefs.txt | — | R | [3] |
| MCDU screen lines and style | not identified; ToLiss does not use Laminar's `fms_cdu*` family | — | R | [4] |
| MCDU keys | not identified; verify in Commands.txt | — | W | [3] |

Laminar's documented `sim/cockpit2/radios/indicators/fms_cdu1_text_line0..15` and its style lines
cover the default FMS only and do not apply here [5]; they are named so the mapping pass knows what
to rule out first.

## Aircraft compatibility

This feature covers ToLiss aircraft only, pinned per aircraft and per version with the machinery
F-50 established. Default X-Plane aircraft are covered by F-20, F-21 and F-32; the 737 by F-50 to
F-54. Other Airbus add-ons are out of scope, because each would need its own verification pass and
the research gives no reason to expect a shared dataref surface.

## Competitor evidence

- WebFMC Pro's ToLiss support is part of the 30+ aircraft coverage cited as its main
  differentiator over single-aircraft tools — https://greenarcstudios.com/
- AirFMC lists ToLiss A319, A321 and A340 among 19+ types, Flight Deck ONE among 70+ —
  https://apps.apple.com/us/app/airfmc/id773310905
- A free browser tool runs a stock A330 MCDU, FCU and EFIS over X-Plane's native Web API with no
  plugin, which is the closest architectural precedent for this feature —
  https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/
- Every payware FMS publishes its own non-standard dataref set, so each aircraft costs a separate
  reverse-engineering pass — https://github.com/waynepiekarski/XPlaneCDU
- Broad aircraft lists age badly: the leading iOS CDU app has not been updated since September
  2023 while the aircraft it supports kept changing —
  https://apps.apple.com/us/app/airfmc/id773310905

## Acceptance criteria

- [ ] The verification run is recorded here, naming every name found or stating that a part has
      none, before any implementation is merged.
- [ ] On the mock server every control reads, writes, marks itself stale and degrades individually.
- [ ] On a real simulator, push and pull produce the aircraft's two distinct behaviours on every
      window that has both, and a managed window is shown as managed, never as a stale value.
- [ ] Typing on the MCDU produces the same screen as the in-simulator MCDU, key for key.
- [ ] No log or message contains a token, protocol code or URL.

## Risks and open questions

1. No ToLiss name is attested anywhere in the research. The entire mapping is a verification task,
   and the size of that task is itself unknown.
2. Whether ToLiss publishes MCDU screen text as datarefs at all is unconfirmed, exactly as for the
   737 in F-51. If it does not, the MCDU half of this feature does not exist under the Web-API-only
   constraint.
3. Push and pull may be single commands, paired commands, or dataref values; this changes the panel
   behaviour and is unverified.
4. ToLiss ships several aircraft and updates them independently, so pinning costs are per type.
5. Whether managed and selected states are readable rather than only inferable is unknown; R4
   cannot be met if they are not.
6. This is a crowded field. Whether Avionix enters it at all, or stays deep on the 737, is a
   product decision this file does not make.

## References

1. https://greenarcstudios.com/
2. https://apps.apple.com/us/app/airfmc/id773310905
3. https://developer.x-plane.com/article/x-plane-web-api/
4. https://github.com/waynepiekarski/XPlaneCDU
5. https://developer.x-plane.com/article/datarefs-for-the-cdu-screen/

Research: `docs/roadmap/research/fmc-cdu-apps.md`, `panel-builders.md`, `xplane-web-api.md`.
