# 737 pedestal

| Field | Value |
|---|---|
| ID | `F-54` |
| Stage | `5` |
| Category | Aircraft-specific |
| Status | Proposed |
| Depends on | `F-21`, `F-22`, `F-23`, `F-50` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 2 of 13 researched companion products offer 737 pedestal controls (Air Manager, through community Zibo packs; Flight Deck ONE, for radios and transponder) |

## Summary

Avionix puts the Zibo and LevelUp 737 pedestal on a phone or tablet: both radio tuning panels with
active and standby frequencies and the transfer control, the transponder, the audio control panel,
the fire panel, rudder trim, and the stabiliser trim position as a readout. It is used from the
clearance delivery call through to the after-landing flow, and it gives the pedestal the same
treatment F-21 to F-23 give the default aircraft.

## Why now

Radios, transponder and audio panels are generic features of Stages 1 and 2; this is the
737-specific version of the same panels. It lands in Stage 5 because the research finds fewer
dedicated pedestal tools than for the CDU, MCP or overhead: radios get bundled into general
remote-panel apps rather than justify their own product [1]. It depends on F-21 to F-23 for
behaviour and on F-50 for compatibility, so it is mostly a mapping exercise on proven ground.

## User stories

- As a 737 pilot, I want to tune and swap both radios from my tablet so that I can take a frequency
  change without losing the outside view.
- As a pilot on an IFR clearance, I want the transponder code and mode where I can set them quickly.
- As a pilot, I want the fire panel to be unmistakably a fire panel, so that I never pull a handle
  by accident on a touchscreen.

## Scope

### In scope

- Both radio tuning panels: active and standby frequencies for COM and NAV as the aircraft exposes
  them, the transfer control, and the panel's own mode selection where one exists.
- Transponder: code entry, mode selection, and the identify action.
- Audio control panel: transmitter selection and receiver selection or volume, as exposed.
- Fire panel: the state of the fire handles and the extinguisher and test controls, with the
  controls behind an explicit confirmation.
- Rudder trim as a control, and stabiliser trim position as a readout only.
- Per-control degradation and the add-on version readout defined by F-50.

### Out of scope (this feature)

- Actuating the stabiliser trim: it is a flight control, not a panel selector, so it is a readout.
- Throttle quadrant controls: thrust levers, flaps, speedbrake, reversers, parking brake.
- Failure injection and fire scenarios. The failures array index mapping is undocumented by
  Laminar, so Avionix does not drive it from this panel [2]; the instructor station is F-25.
- The default aircraft radios, transponder and audio panel (F-21, F-22, F-23).

## Functional requirements

R1. While connected to a recognised 737, every shown control reflects the aircraft's current value
or position, and every readout shows the aircraft's own value.

R2. Frequency entry is validated against the range and spacing the aircraft accepts, and a value
the aircraft refuses is reported as refused rather than silently kept.

R3. Setting a standby frequency never changes the active frequency; the transfer control is the
only thing that does.

R4. The transponder shows the mode the aircraft reports, and the identify action is momentary.

R5. Fire handles and extinguisher controls require a deliberate confirmation before anything is
sent, and their state is always read back from the aircraft.

R6. The stabiliser trim readout is visibly not a control, and no gesture on it writes anything.

R7. A control whose name cannot be resolved on the loaded aircraft is marked unavailable with a
plain-language reason and the rest of the pedestal keeps working. When the aircraft is not a
recognised 737, the panel is not offered and the app names the aircraft it detected.

R8. On disconnection every value is marked stale within one second and no control accepts input; on
reconnection all names are resolved again before the panel becomes live, because ids are
session-scoped [3].

R9. A rejected write or command produces a short message naming the control and the fact that the
aircraft refused it. No raw protocol error, endpoint or payload is shown; tokens are never logged.

## X-Plane Web API mapping

Reads and writes at the ~10 Hz subscription rate, which suits frequencies, codes and switch
positions [3]. The generic rows below are the fallback where the aircraft mirrors Laminar's own
datarefs; the Zibo rows are unidentified because no source consulted names them.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Transponder code (generic) | `sim/cockpit2/radios/actuators/transponder_code` | int | R/W | community docs via `research/xplane-web-api.md` section B, unverified (as in `F-22`) |
| Transponder mode (generic) | `sim/cockpit/radios/transponder_mode` | int enum, unverified | R/W | community docs via `research/xplane-web-api.md` section B, unverified (as in `F-22`) |
| ATC-assigned squawk (generic) | `sim/atc/transponder_assigned` | int, added 12.4.4; name reported via search summary, unverified | R | [4] |
| Zibo radio tuning panels: active and standby COM/NAV, transfer, panel mode | not identified; verify in `B738_Datarefs.txt` / `B738_Commands.txt` | — | R/W | [5] |
| Zibo transponder panel | not identified; verify in DataRefs.txt | — | R/W | [5] |
| Zibo audio control panel: transmitter and receiver selection | not identified; verify in DataRefs.txt | — | R/W | [5] |
| Zibo fire panel: handles, extinguisher, test | not identified; verify in DataRefs.txt | — | R/W | [5] |
| Zibo rudder trim | not identified; verify in DataRefs.txt | — | R/W | [5] |
| Zibo stabiliser trim position | not identified; verify in DataRefs.txt | — | R | [5] |

Whether Zibo mirrors the generic transponder datarefs or publishes its own is unverified, and the
generic names themselves come from community documentation rather than Laminar's list [3].

## Aircraft compatibility

Default aircraft are served by F-21, F-22 and F-23 through the generic radio and transponder
datarefs. This feature is Zibo and LevelUp only, pinned per add-on version by F-50's machinery.
Where Zibo mirrors a generic dataref, the generic mapping is used and recorded as such, so the
pedestal degrades to the generic behaviour rather than disappearing.

## Competitor evidence

- Pedestal controls appear in Air Manager Zibo packs and general remote-panel apps rather than in
  dedicated pedestal products —
  https://forums.x-plane.org/files/file/92297-air-manager-instruments-for-the-zibo-738/
- Flight Deck ONE advertises radio and transponder control alongside MCP and EFIS for Zibo —
  https://apps.apple.com/mx/app/flight-deck-one/id6742143273
- The comparable MSFS product ships a dedicated audio control panel among its 840 controls, so an
  audio panel is an expected part of the set —
  https://flightpanels.io/en-us/products/pmdg-737-streamdeck-profiles-for-microsoft-flight-simulator
- Hardware radio modules for Zibo needed replugging on every simulator start and froze mid-flight,
  which is the reliability bar a software panel has to beat —
  https://forums.x-plane.org/forums/topic/343245-zibo-mod-gf-mcp-pro
- A free browser tool already serves stock Airbus radio and audio panels over the native Web API —
  https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/
- Keypad frequency entry on a second device is a praised pattern in this category —
  https://www.x-plained.com/utility-review-green-arc-studios-webfmc/

## Acceptance criteria

- [ ] On the mock server every control reads, writes, marks itself stale and degrades individually
      when its name is removed.
- [ ] On a real simulator with the pinned add-on version, a standby frequency set on the device
      appears in the aircraft and only the transfer control moves it to active.
- [ ] The transponder code, mode and identify work, and the mode shown is the aircraft's own.
- [ ] No gesture on the stabiliser trim readout writes anything to the aircraft.
- [ ] A fire handle cannot be actuated without a confirmation.
- [ ] No log or message contains a token, protocol code or URL.

## Risks and open questions

1. No Zibo pedestal dataref or command name is attested in the research; the whole mapping comes
   from the aircraft's own files and needs verification on a running simulator.
2. The generic transponder names are community-sourced and unconfirmed against Laminar's list [3],
   and `sim/atc/transponder_assigned` is reported only through a search summary [4].
3. Whether Zibo exposes the audio control panel at all is unknown; if it does not, that section is
   dropped rather than faked.
4. Frequency spacing (25 kHz against 8.33 kHz) behaviour in the aircraft is unverified and affects
   R2 directly.
5. Whether the fire panel is safe to drive from a touch device at all is a product question; the
   alternative is a read-only fire panel. Whether stabiliser trim position is published as a usable
   number or only as an animation value is likewise unverified.

## References

1. https://forums.x-plane.org/files/file/92297-air-manager-instruments-for-the-zibo-738/
2. https://forums.x-plane.org/forums/topic/349281-internal-behavior-of-simoperationfailuresrel_engfai0-which-engine-parameters-do
3. https://developer.x-plane.com/article/x-plane-web-api/
4. https://www.x-plane.com/kb/x-plane-12-4-4-release-notes/
5. https://www.cockpitbuilders.com/index.php?topic=7469.0

Research: `docs/roadmap/research/boeing-737-ecosystem.md`, `xplane-web-api.md`,
`remote-control-apps.md`.
