# Performance and weight and balance

| Field | Value |
|---|---|
| ID | `F-56` |
| Stage | `5` |
| Category | Aircraft-specific |
| Status | Proposed |
| Depends on | `F-03`, `F-55` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 1 of 13 researched companion products offers weight and balance (Laminar's own X-Plane 12 Control Pad, as part of an instructor station); no researched companion app offers takeoff or landing performance, though the Zibo aircraft ships its own in-simulator calculator |

## Summary

Avionix shows what the aeroplane currently weighs and where its centre of gravity sits, reading
both from the simulator, and lets the pilot plan and set fuel before departure. It runs before
pushback, on a device the pilot can keep beside them while loading the aircraft, and it replaces
the trip into the simulator's own weight and balance dialog.

## Why now

This is Stage 5 work because its value depends on F-03 to know the aircraft and F-55 to give the
preflight a home on the device. The research is blunt about the novelty: Zibo already ships a
tablet with takeoff and landing performance calculators, so demand is mostly about getting an
existing workflow onto a real external device [1], [2]. That argues for doing the part the
simulator can answer, weight, balance and fuel, and treating performance as an open question.

## User stories

- As a pilot loading an aircraft, I want to see the current weight and centre of gravity on my
  tablet so that I can check I am inside limits before I start.
- As a pilot planning a flight, I want to set the fuel load from the device rather than from a
  simulator dialog.
- As a 737 pilot, I want the centre of gravity figure the aircraft itself uses, so that it matches
  what I type into the CDU.

## Scope

### In scope

- Current gross weight, payload weight and fuel weight as the simulator reports them, in the
  pilot's chosen units.
- Centre of gravity as the simulator reports it, with the aircraft's own figure where the add-on
  publishes one.
- Fuel: the quantity per tank and the total, both as a readout and as something the pilot can set
  before flight.
- A warning when a value the app can read sits outside a limit the app can verify, and silence
  where it cannot verify a limit.
- Units selection that applies consistently across every weight shown.

### Out of scope (this feature)

- Takeoff and landing performance numbers (V speeds, assumed temperature, flap setting, stopping
  distance): not derivable from the Web API, and Avionix does not invent them.
- Loading passengers and cargo by station, unless the aircraft publishes per-station datarefs.
- Fuel planning against a route. The Web API has no navdata, no route query and no flight-plan
  endpoint [3], so trip fuel cannot be computed from the simulator.
- The 737 CDU pages that consume these numbers (F-51), and flight plan features (F-31, F-33).

## Functional requirements

R1. While connected, the app shows gross weight, payload, fuel and centre of gravity from the
simulator, updated as they change, in the selected units.

R2. Setting a fuel quantity writes it to the simulator; the displayed value then follows the
simulator's own reported value.

R3. Fuel can only be set when the simulator allows it. A write the simulator refuses, for example
in flight or on a read-only dataref, is reported as refused in plain language.

R4. Where the loaded aircraft publishes its own centre of gravity figure, that figure is shown and
labelled as the aircraft's; where it does not, the simulator's figure is shown and labelled as such.

R5. A limit is only shown when Avionix has a verified source for it. No envelope, graph or "within
limits" verdict is presented on the basis of a guessed limit.

R6. When a dataref is missing on the loaded aircraft, the affected value is marked unavailable with
a plain-language reason and the rest of the panel keeps working.

R7. On disconnection every value is marked stale within one second and nothing can be set; on
reconnection all names are resolved again before the panel becomes live, because ids are
session-scoped [3].

R8. A rejected write produces a short message naming the value and the fact that the simulator
refused it. No raw protocol error, endpoint or payload is shown; tokens are never logged.

## X-Plane Web API mapping

Reads and writes at the ~10 Hz subscription rate, far more than weights need [3]. Fuel datarefs are
writable in the simulator; weight and centre of gravity names beyond the fuel family were not found
in the research and are listed as unidentified.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Fuel mass per tank | `sim/flightmodel/weight/m_fuel[#tank]`, `m_fuel1`, `m_fuel2`, `m_fuel3` | float, mass; names quoted via a community summary of the Laminar article, re-confirm in DataRefs.txt | R/W | Laminar [4], unverified spelling |
| Gross weight, payload weight, empty weight | not identified; verify in DataRefs.txt under `sim/flightmodel/weight/` | — | R/W | [4] |
| Centre of gravity (generic) | not identified; verify in DataRefs.txt | — | R | [4] |
| Centre of gravity (Zibo tablet figure) | `laminar/B738/tab/cg_pos` | number (unverified, community) | R | [5] |
| Per-station payload | not identified; verify in DataRefs.txt | — | R/W | [4] |
| Takeoff and landing performance results | not available through the Web API; the simulator publishes no performance solver | — | — | [3] |

The Zibo row matters because the aircraft's own tablet writes that dataref, so reading it is how
the app shows the same number the aircraft uses rather than a second, differing figure [5].

## Aircraft compatibility

Default X-Plane aircraft expose the generic weight and fuel families, so the readouts and fuel
setting work for them once the names are confirmed. The Zibo and LevelUp 737 additionally publish
their own centre of gravity figure, which takes precedence when present, pinned per add-on version
as in F-50. Aircraft with unusual tank layouts may expose more or fewer fuel datarefs than the app
expects, which R6 covers.

## Competitor evidence

- Laminar's own Control Pad app includes weight and balance in its instructor-station feature set,
  so a second-device weight panel is established —
  https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
- Zibo ships a built-in tablet with takeoff and landing performance calculators, which is why this
  feature does not try to compete on performance numbers —
  https://forums.x-plane.org/forums/topic/198742-takeoff-and-landing-performance-calculator-via-zibo-tablet/
- Navigraph's own writeup of Zibo describes that in-aircraft tablet as part of what the mod
  delivers — https://navigraph.com/blog/zibo-737
- FlyByWire's EFB pairs performance calculators with checklists on one device, which is the shape
  users expect, and has no second-device mode its users asked for —
  https://flybywiresim.com/notams/flypados3/
- Ground-service and loading state getting out of sync with the aircraft is a documented failure in
  that product, which is why R1 reads from the simulator rather than tracking its own numbers —
  https://docs.flybywiresim.com/aircraft/support/known-issues/known-issues-common/

## Acceptance criteria

- [ ] On the mock server every value reads, the fuel value writes, and all values mark themselves
      stale on disconnection.
- [ ] On a real simulator, setting a fuel quantity changes the aircraft's fuel and the readout
      follows the simulator.
- [ ] With a Zibo aircraft loaded, the centre of gravity shown matches the aircraft's own tablet.
- [ ] Removing one dataref name marks exactly one value unavailable, with the panel still usable.
- [ ] No limit or verdict is shown for which the app has no verified source.
- [ ] No log or message contains a token, protocol code or URL.

## Risks and open questions

1. Takeoff and landing performance is the open question. The Web API exposes no performance solver
   and no aircraft performance tables [3], so Avionix would have to ship its own data per aircraft,
   with the accuracy and liability that implies, or read results the aircraft computes if it
   publishes them. Neither path is verified.
2. The fuel dataref spellings come from a community summary of Laminar's article and must be
   re-confirmed against DataRefs.txt [4].
3. No generic gross weight or centre of gravity dataref name was found in the research; the family
   root is known, the leaves are not.
4. Whether writing fuel in flight is permitted, and whether it should be, is undecided.
5. Whether per-station loading is exposed by default aircraft or only by some add-ons is
   unverified, and centre of gravity limits are aircraft-specific data the simulator does not
   publish, which is why R5 forbids an unverified envelope.

## References

1. https://navigraph.com/blog/zibo-737
2. https://forums.x-plane.org/forums/topic/198742-takeoff-and-landing-performance-calculator-via-zibo-tablet/
3. https://developer.x-plane.com/article/x-plane-web-api/
4. https://developer.x-plane.com/article/the-x-plane-fuel-system/
5. https://forums.x-plane.org/forums/topic/346056-feature-request-takeoff-req-lsk3-cg-should-update-laminarb738tabcg_pos-dataref

Research: `docs/roadmap/research/boeing-737-ecosystem.md`, `xplane-web-api.md`,
`remote-control-apps.md`.
