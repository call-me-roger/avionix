# 737 EFIS control panel

| Field | Value |
|---|---|
| ID | `F-52` |
| Stage | `4` |
| Category | Aircraft-specific |
| Status | Proposed |
| Depends on | `F-50` |
| Competitor prevalence | Matrix count 2 of 12 representative products (`research/competitors.md`). Wider set: 2 of 13 researched companion products offer a 737 EFIS control panel (Air Manager, via community Zibo instrument packs; Flight Deck ONE) |

## Summary

Avionix puts the captain and first officer EFIS control panels of the Zibo and LevelUp 737 on a
phone or tablet: the minimums selector and its reset, the barometric setting with its units and
STD, the two VOR/ADF pointer selectors, the navigation display mode and range selectors, the map
switches and the flight path vector and metres options. It is used continuously, from setting
QNH before taxi to switching the display to approach mode on the way down.

## Why now

EFIS selectors are what a pilot touches most often after the MCP, and the research finds they are
almost never built alone: they ride along with the MCP as a bundled add-on [1]. Hence the F-50
dependency and the same stage. This feature reuses the MCP's compatibility machinery unchanged, so
the marginal cost is the control mapping, not new product behaviour.

## User stories

- As a 737 pilot, I want the barometric setting and minimums on my tablet so that I can set them
  from the approach briefing without moving the simulator view.
- As a pilot in cruise, I want to change the navigation display range and turn the waypoint and
  airport symbols on and off without leaving the outside view.
- As a pilot flying an approach, I want to switch display mode and VOR/ADF pointers with one tap.

## Scope

### In scope

- Minimums: the RADIO/BARO source selection, the minimums value, and the reset control.
- Barometric setting: the value, the IN/HPA units selection, and STD.
- Both VOR/ADF pointer selectors (left and right pointer sources).
- Navigation display mode selector (APP, VOR, MAP, PLN) and range selector.
- Map switches: WXR, STA, WPT, ARPT, DATA, POS, TERR, each with its current on or off state.
- FPV (flight path vector) and MTRS (metres) selections.
- Captain and first officer panels where the aircraft exposes both, with the controlled side shown.
- Per-control degradation and an add-on version readout, as defined by F-50.

### Out of scope (this feature)

- Drawing the navigation display itself, its map symbols or its terrain shading (F-13, F-30).
- Weather radar returns. The WXR switch changes the aircraft's own radar; Avionix cannot show what
  the radar sees, because reflectivity exists only as a plugin-side texture that the Web API cannot
  read [2]. This panel is a set of switches, not a radar picture. Weather awareness is F-41.
- Traffic shown on the display (F-40) and the MCP itself (F-50).

## Functional requirements

R1. While connected to a recognised 737, each selector and switch shows the aircraft's current
position or state, not the last value the app sent.

R2. Operating a control writes to the aircraft or activates its command, and the displayed state
then follows the aircraft's reported state.

R3. The barometric readout shows the units the aircraft is currently set to and changes precision
with them; selecting STD is reflected as the aircraft reports it, not assumed.

R4. Minimums show the selected source with the value, so a BARO minimum is never mistakable for a
radio minimum.

R5. The panel makes clear which side (captain or first officer) it is driving, and switching sides
never writes to the other side.

R6. The WXR switch is labelled so it is plain that Avionix is arming the aircraft's radar, not
displaying returns.

R7. When a name cannot be resolved on the loaded aircraft, that control is marked unavailable with
a plain-language reason and the rest of the panel keeps working. When the aircraft is not a
recognised 737, the panel is not offered and the app names the aircraft it detected.

R8. On disconnection every control is marked stale within one second and accepts no input; on
reconnection all names are resolved again before the panel becomes live, because ids are
session-scoped [3].

R9. A rejected write or command produces a short message naming the control and the fact that the
aircraft refused it. No raw protocol error, endpoint or payload is shown; tokens are never logged.

## X-Plane Web API mapping

Reads and writes at the ~10 Hz subscription rate, ample for detented selectors and two-position
switches [3]. No Zibo EFIS dataref name appears in any source consulted, so the rows below say so
rather than guess a plausible path under `laminar/B738/EFIS/...`.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Minimums source, value and reset | not identified; verify in `B738_Datarefs.txt` / `B738_Commands.txt` | — | R/W | [4] |
| Barometric value, IN/HPA units, STD | not identified; verify in DataRefs.txt | — | R/W | [4] |
| VOR/ADF selectors, left and right | not identified; verify in DataRefs.txt | — | R/W | [4] |
| Mode selector (APP, VOR, MAP, PLN) and range selector | not identified; verify in DataRefs.txt | — | R/W | [4] |
| Map switches WXR, STA, WPT, ARPT, DATA, POS, TERR | not identified; verify in DataRefs.txt | — | R/W | [4] |
| FPV and MTRS | not identified; verify in DataRefs.txt | — | R/W | [4] |
| Radar mode and tilt (generic) | `sim/cockpit2/EFIS/EFIS_weather_mode`, `EFIS_weather_tilt`, as mapped in `F-41` | int enum / float | R/W | Laminar [2] |
| Zibo switch naming pattern (evidence only) | `laminar/B738/toggle_switch/irs_left` | number (unverified, community) | R/W | [5] |

The last row is not an EFIS control. It is included because it is the one attested example of how
Zibo names a two-position switch, and it is the pattern the verification pass should expect.

## Aircraft compatibility

The default Laminar 737-800 and other default aircraft expose generic EFIS-adjacent datarefs; a
generic EFIS-style control set for them belongs to F-24 and F-30, not here. This feature is Zibo
and LevelUp only, pinned per add-on version exactly as F-50 pins it. Nothing here transfers to the
Airbus EFIS, which is part of F-57.

## Competitor evidence

- EFIS control panels are consistently bundled with MCP purchases rather than requested on their
  own, which is why this feature follows F-50 —
  https://forums.x-plane.org/files/file/48768-z_2d_xp-mcp-autopilot-mode-control-panel-for-zibomod/
- Air Manager hosts Zibo-coded instrument packs, including EFIS instruments, that users assemble
  per flight phase — https://siminnovations.com/shop/zibo-mod-737-800-overhead-panel/
- Flight Deck ONE lists real-time MCP and EFIS control among its modules for 70+ aircraft including
  Zibo — https://apps.apple.com/mx/app/flight-deck-one/id6742143273
- Hardware EFIS units for Zibo break on add-on updates in the same way MCP units do, and users had
  to re-import command and dataref files by hand to recover —
  https://www.pollypotsoftware.org.uk/vanillaforums/discussion/655/zibos-boeing-b738-800-mcp-pro-efis-2xgf166-lgt-ii-requires-git-1-8-2-0-for-x-plane
- A free browser tool already offers stock A330 EFIS over the native Web API, showing the approach
  works without a plugin —
  https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/

## Acceptance criteria

- [ ] On the mock server every control reads, writes, marks itself stale and degrades individually
      when its name is removed, without breaking the panel.
- [ ] On a real simulator with the pinned add-on version, each selector and switch moves the
      corresponding control in the aircraft, and each reads back the aircraft's own state.
- [ ] Changing the barometric units changes the displayed units and precision; STD is shown only
      when the aircraft reports it.
- [ ] Switching between captain and first officer panels writes only to the selected side.
- [ ] No log or message contains a token, protocol code or URL.

## Risks and open questions

1. No Zibo EFIS dataref or command name is attested anywhere in the research. The whole mapping
   comes from the aircraft's own files and must be confirmed on a running simulator before this
   feature is estimated.
2. Whether both sides are separately addressable, or only the captain's, is unknown.
3. Detented selectors (mode, range, VOR/ADF) need position enumerations that no source provides,
   and it is unknown whether they are set by value or stepped by command.
4. The generic radar control names are taken from `F-41`; they must be confirmed against
   DataRefs.txt before use, and they may not be the ones Zibo drives.
5. Users may expect the WXR switch to produce a radar picture; the Web API cannot supply one [2],
   so R6's labelling is a product requirement, not a detail. Zibo point releases rename controls,
   so this panel also inherits F-50's version-pinning risk in full.

## References

1. https://forums.x-plane.org/files/file/48768-z_2d_xp-mcp-autopilot-mode-control-panel-for-zibomod/
2. https://developer.x-plane.com/article/weather-radar-for-x-plane-12-3-1/
3. https://developer.x-plane.com/article/x-plane-web-api/
4. https://www.cockpitbuilders.com/index.php?topic=7469.0
5. https://forums.x-plane.org/forums/topic/346056-feature-request-takeoff-req-lsk3-cg-should-update-laminarb738tabcg_pos-dataref

Research: `docs/roadmap/research/boeing-737-ecosystem.md`, `xplane-web-api.md`, `panel-builders.md`.
