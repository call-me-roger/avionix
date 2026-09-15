# 737 overhead panel

| Field | Value |
|---|---|
| ID | `F-53` |
| Stage | `5` |
| Category | Aircraft-specific |
| Status | Proposed |
| Depends on | `F-50`, `F-24` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 1 of 13 researched companion products offers a Zibo 737 overhead (Air Manager, through the Sim Innovations overhead pack and community instrument packs) |

## Summary

Avionix puts the Zibo and LevelUp 737 overhead panel on a tablet, grouped the way the real panel
is: electrical, fuel, hydraulics, anti-ice, air conditioning and pressurization, lights, and the
IRS. Each switch shows the aircraft's own position and can be operated from the device. It is used
mostly on the ground and in the climb and descent, where the overhead is the busiest panel in the
aeroplane and the hardest to reach with a mouse.

## Why now

The overhead is the third-most-requested 737 panel after the CDU and the MCP, with a dedicated
commercial pack and standing forum requests to get it onto a separate touchscreen [1], [2]. It is
also the largest mapping job in the 737 set and the least documented, so it follows F-50 and F-52,
which prove the compatibility layer on smaller panels first. F-24 supplies the generic
systems-control behaviour this feature specialises.

## User stories

- As a 737 pilot doing the preflight, I want the overhead on a tablet so that I can run the flow
  with my finger instead of panning the cockpit view.
- As a pilot in the descent, I want the anti-ice and lights switches in one place so that a
  configuration change does not cost me the outside view.
- As a pilot, I want switches Avionix cannot verify to be absent or marked, so that I never think
  I set something I did not.

## Scope

### In scope

- Grouped panels for: electrical (battery, standby power, generators, APU, bus switching), fuel
  (pumps and cross-feed), hydraulics, anti-ice (engine, wing, window heat), air conditioning and
  pressurization (packs, bleeds, isolation, selectors), lights (exterior and cockpit), and the IRS.
- Each control shows the aircraft's own current position, including switches with more than two
  positions.
- Only controls whose dataref or command has been verified against the pinned add-on version on a
  running simulator are shown. An unverified control is not drawn as a working switch.
- The list of groups that are available on the loaded aircraft and version, with a count of
  controls that could not be verified.

### Out of scope (this feature)

- Overhead annunciators and master caution as a warning display; only switch state is in scope.
- The fire panel, which is on the pedestal and belongs to F-54.
- Failure injection and the instructor station (F-25). The failures array index mapping is not
  documented by Laminar, so no failure control is offered from this panel [3].
- Engine start logic, checklists and flows (F-55).

## Functional requirements

R1. While connected to a recognised 737, every shown control reflects the aircraft's current switch
position, including intermediate positions on multi-position switches.

R2. Operating a control writes to the aircraft or activates its command; the shown position then
follows the aircraft, never the tap.

R3. A control whose name was not verified for the loaded add-on version is not presented as an
operable switch. It is either omitted or shown as unavailable with a plain-language reason.

R4. The panel reports how many controls in each group are unavailable, so the pilot knows the
overhead they see is incomplete before they rely on it.

R5. Controls that are irreversible or consequential in flight, such as removing electrical power or
cutting a fuel pump, require a deliberate confirmation.

R6. When the loaded aircraft is not a recognised 737, the panel is not offered and the app names
the aircraft it detected.

R7. On disconnection every control is marked stale within one second and accepts no input; on
reconnection all names are resolved again before the panel becomes live, because ids are
session-scoped [4].

R8. A rejected write or command produces a short message naming the control and the fact that the
aircraft refused it. No raw protocol error, endpoint or payload is shown; tokens are never logged.

R9. Switching panel groups never writes anything to the aircraft.

## X-Plane Web API mapping

Reads and writes at the ~10 Hz subscription rate; overhead switches are discrete and slow-moving,
so the rate is not a constraint [4]. Only one Zibo overhead-class name is attested in the research;
everything else is listed as unidentified, which is precisely why R3 exists.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| IRS left switch (attested example of the switch naming pattern) | `laminar/B738/toggle_switch/irs_left` | number, switch position (unverified, community) | R/W | [5] |
| Electrical: battery, standby power, generators, APU, bus switching | not identified; verify in `B738_Datarefs.txt` / `B738_Commands.txt` | — | R/W | [6] |
| Fuel: boost pumps, cross-feed | not identified; verify in DataRefs.txt | — | R/W | [6] |
| Hydraulics: engine and electric pumps | not identified; verify in DataRefs.txt | — | R/W | [6] |
| Anti-ice: engine, wing, window heat | not identified; verify in DataRefs.txt | — | R/W | [6] |
| Air conditioning and pressurization: packs, bleeds, isolation, selectors | not identified; verify in DataRefs.txt | — | R/W | [6] |
| Lights: exterior and cockpit | not identified; verify in DataRefs.txt | — | R/W | [6] |
| IRS: remaining switches and mode selectors | not identified; verify in DataRefs.txt | — | R/W | [6] |

Zibo groups its switches under a `laminar/B738/toggle_switch/...` subtree, on the evidence of the
one attested name. Whether every overhead switch lives there, and whether multi-position switches
are set by value or stepped by command, is unverified.

## Aircraft compatibility

Default X-Plane aircraft expose generic system switches under Laminar's own namespaces; generic
systems control is F-24 and is not affected by this feature. This feature is Zibo and LevelUp only
and is pinned per add-on version, using the same machinery as F-50. Because the overhead has the
most controls, it is also the panel most likely to lose some of them to an add-on update, which is
what R3 and R4 are for.

## Competitor evidence

- Sim Innovations sells a full interactive Zibo overhead panel synced to the aircraft, shipped as
  individually importable instruments so users can assemble the panels they want per phase —
  https://siminnovations.com/shop/zibo-mod-737-800-overhead-panel/
- A community Air Manager pack of Zibo instruments exists alongside the commercial one —
  https://forums.x-plane.org/files/file/92297-air-manager-instruments-for-the-zibo-738/
- Zibo users ask specifically how to get the overhead onto a separate touchscreen —
  https://forums.x-plane.org/forums/topic/187475-737-overhead-in-the-zibo-mod/
- The touchscreen overhead workflow is demonstrated publicly, so the expectation is set —
  https://www.youtube.com/watch?v=kosf8pngq1Q
- Per-instrument modularity is the thing users praise about the existing overhead product, rather
  than one fixed layout — https://siminnovations.com/shop/zibo-mod-737-800-overhead-panel/
- The comparable MSFS product ships 840 controls across cockpit and cabin, which is the depth
  expectation for a popular 737 —
  https://flightpanels.io/en-us/products/pmdg-737-streamdeck-profiles-for-microsoft-flight-simulator

## Acceptance criteria

- [ ] On the mock server each group renders, reads, writes and marks itself stale, and an
      unverified control is never operable.
- [ ] On a real simulator with the pinned add-on version, every shown switch moves the aircraft's
      switch and reads its position back, including multi-position switches.
- [ ] Each group reports its count of unavailable controls, and the counts are correct when names
      are removed from the mapping.
- [ ] A consequential control cannot be actuated without a confirmation.
- [ ] No log or message contains a token, protocol code or URL.

## Risks and open questions

1. Only one overhead-class Zibo name is attested [5]. The entire mapping must be built from the
   aircraft's own files and verified switch by switch, which makes this the largest verification
   task in the 737 set.
2. Multi-position switches (IRS mode, pressurization) may be value-set or command-stepped, and no
   source gives their position enumerations.
3. Whether the aircraft reports switch position reliably for every overhead control, or only for
   some, is unknown; R1 cannot be met for controls that are write-only.
4. How much of the overhead is worth shipping is an open product question: all groups at once, or
   the preflight-relevant groups first.
5. Overhead annunciator and master caution datarefs are attested only as a pattern
   (`laminar/B738/annunciator/parking_brake`), and whether a warning display belongs here or in a
   monitoring feature is unresolved. The overhead also inherits F-50's version-pinning risk,
   amplified by its size.

## References

1. https://siminnovations.com/shop/zibo-mod-737-800-overhead-panel/
2. https://forums.x-plane.org/forums/topic/187475-737-overhead-in-the-zibo-mod/
3. https://forums.x-plane.org/forums/topic/349281-internal-behavior-of-simoperationfailuresrel_engfai0-which-engine-parameters-do
4. https://developer.x-plane.com/article/x-plane-web-api/
5. https://forums.x-plane.org/forums/topic/346056-feature-request-takeoff-req-lsk3-cg-should-update-laminarb738tabcg_pos-dataref
6. https://www.cockpitbuilders.com/index.php?topic=7469.0

Research: `docs/roadmap/research/boeing-737-ecosystem.md`, `xplane-web-api.md`, `panel-builders.md`.
