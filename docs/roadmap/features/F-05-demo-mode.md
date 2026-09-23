# Demo mode

| Field | Value |
|---|---|
| ID | `F-05` |
| Stage | `2` |
| Category | Platform |
| Status | Proposed |
| Depends on | `F-04` |
| Competitor prevalence | Matrix count 2 of 12 representative products (`research/competitors.md`). Wider set: 0 of 13 remote-control and panel products researched ship a simulated aircraft state for use without a simulator; Air Manager and Flight Deck ONE use a limited free tier as the stand-in, and WebFMC has no demo beyond its free 737-only tier |

## Summary

Avionix can run its panels against a built-in simulated aircraft with no simulator connected. The
readouts move, the controls respond, and a persistent marker says this is a demonstration. It
exists so a buyer can see what the app does before installing anything, so screenshots and store
video can be produced from the real app, and so a panel can be shown on a stand or a train.

## Why now

Stage 2, once there are enough panels for a demo to be worth showing. The research contains a
specific, repeated failure this addresses: an AirFMC reviewer wrote "You have to have a separate
flight simulator (FMC?) for this app to work. Completely worthless without a simulator game", and
the same review text is cited in two independent reports as the canonical example of a companion
app collecting one-star confusion reviews. The recommendation drawn from it is to make the
"you need X-Plane running" dependency obvious up front. A demo mode does that better than a
disclaimer: it shows what the app is for and where the data comes from at the same time.

## User stories

- As someone who just installed Avionix away from my simulator, I want to see the panels working
  so that I understand what the app does before I set anything up.
- As a prospective buyer reading the store page, I want the screenshots to show the real app.
- As a simmer, I want certainty that I am never looking at fake numbers while I think I am
  connected.

## Scope

### In scope
- A simulated aircraft state covering the values the shipped panels read, changing over time in a
  way that is plausible for a short flight segment.
- Controls that behave: a write moves the simulated value, a command has its simulated effect, and
  the panel reflects it exactly as it would when connected.
- Entering demo mode deliberately from the disconnected state, and leaving it deliberately.
- A marker visible on every panel, at all times, saying the data is simulated.
- An offer of demo mode at first run, framed so that it also states that normal use needs X-Plane
  running on the same network.
- A single fixed generic aircraft, so compatibility reporting (`F-03`) has something consistent to
  describe, and a short loop of flight phases so the demo moves rather than sits still.

### Out of scope (this feature)
- Any flight model or systems simulation of real fidelity; the values are for demonstration only.
- Recording and replaying a real flight, which belongs with the flight recorder (`F-14`).
- Demo content for aircraft-specific panels beyond whatever the generic profile covers.
- Teaching or training claims of any kind.

## Functional requirements

R1. Demo mode is entered only by explicit user action from the disconnected state, and is left by
explicit user action or by starting a connection.
R2. Demo mode and a live session are mutually exclusive; entering demo mode while connected is not
possible, and a connection attempt ends demo mode first.
R3. While in demo mode, no request is sent to any connector or simulator; the app opens no socket
and resolves no name.
R4. Every panel shows a persistent marker that the data is simulated, which cannot be dismissed
and is not confused with the stale-data marker from `F-02`.
R5. Values visibly change over time without user input, so that the demo is not mistaken for a
frozen screen.
R6. A control that writes moves the corresponding simulated value and the panel reflects the new
value through the same path it would use when connected.
R7. A control that is unavailable on the demo aircraft is shown unavailable with a reason, exactly
as `F-03` would report it when connected.
R8. Leaving demo mode discards all simulated state; nothing simulated is ever written to a
simulator, exported or included in a diagnostics summary.
R9. The first-run offer states plainly that Avionix is a companion to X-Plane 12 running on the
same network, and demo mode is offered as a way to look around, not as a substitute.
R10. Demo mode is available on every target, including the web build, and does not require a
connector.
R11. Diagnostics (`F-02`) shows demo mode by name rather than reporting a connection state.
R12. No panel in demo mode displays raw protocol text; no token or pairing code exists to leak,
since no connection is made.

## X-Plane Web API mapping

Demo mode uses no part of the Web API. It stands in for the data the API would deliver, at the
same shape and the same rate the panels expect, so that a panel needs no special case.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| All values while in demo mode | none; values are generated on the device | matches what each panel expects | — | — |
| Rate the simulated values change at | matches the API's ~10 Hz delta stream | — | — | docs/xplane.md |

## Aircraft compatibility

Demo mode presents one generic aircraft using the generic profile from `F-03`, so every panel
built on Laminar default names can be demonstrated. Aircraft-specific panels are either excluded
from the demo or shown as unavailable for the demo aircraft, with the usual reason; they are never
faked under an add-on's name.

## Competitor evidence

- An AirFMC reviewer complained "You have to have a separate flight simulator (FMC?) for this app
  to work. Completely worthless without a simulator game" —
  https://apps.apple.com/us/app/airfmc/id773310905
- The same review is cited as an onboarding and positioning lesson: a companion app that does not
  make its dependency obvious collects one-star confusion reviews —
  docs/roadmap/research/boeing-737-ecosystem.md
- Air Manager's offline or demo state is reported only as a limited free mode, with the current
  in-app-purchase state unclear — https://apps.apple.com/us/app/air-manager/id1052587916
- Flight Deck ONE and WebFMC both use a restricted free tier in place of a demo rather than
  simulating anything — docs/roadmap/research/fmc-cdu-apps.md

## Acceptance criteria

- [ ] Enter demo mode with no simulator and no connector present and confirm every shipped panel
      renders and animates.
- [ ] Confirm the simulated marker is visible on every panel and cannot be dismissed.
- [ ] Watch network traffic while in demo mode and confirm none leaves the device.
- [ ] Operate a writing control and confirm the simulated value and the panel both change.
- [ ] Start a connection from demo mode and confirm demo state is discarded and the marker gone.
- [ ] Confirm the first-run offer names the X-Plane 12 requirement.
- [ ] Confirm demo mode works in the web build with no connector.

## Risks and open questions

- How faithful should the simulated values be? Too crude looks broken; too convincing risks a user
  believing they are connected, which R4 must prevent.
- Should demo mode be reachable after first run from an obvious place, or only from the
  disconnected state? Making it prominent risks accidental entry mid-setup.
- Which flight segment shows the app best, and should the loop be a fixed script or randomised?
- Should aircraft-specific panels get a demo at all, given they would have to imitate a
  third-party add-on's data?
- Will demo content need updating every time a panel adds a value, and how is that kept from
  drifting out of date?

## References

1. docs/xplane.md
2. docs/roadmap/research/boeing-737-ecosystem.md, fmc-cdu-apps.md, panel-builders.md,
   remote-control-apps.md
3. https://apps.apple.com/us/app/airfmc/id773310905
4. https://apps.apple.com/us/app/air-manager/id1052587916
5. https://apps.apple.com/us/app/flight-deck-one/id6742143273
