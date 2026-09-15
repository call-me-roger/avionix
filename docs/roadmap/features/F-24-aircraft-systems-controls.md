# Aircraft systems controls

| Field | Value |
|---|---|
| ID | `F-24` |
| Stage | `2` |
| Category | Control |
| Status | Proposed |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 2 of 12 representative products (`research/competitors.md`). Wider set: 2 of 15 products researched offer it (Air Manager, as a generic switch and knob host; Flight Deck ONE, in its cockpit dashboard), plus the deck-controller tier (Touch Portal XP-FlightDeck, Stream Deck plugins) where users build the grid themselves |

## Summary

The switches and levers a pilot touches outside the avionics stack, on the phone or tablet: exterior
and interior lights, landing gear, flaps, pitch, roll and yaw trim, parking brake, pitot heat, fuel
pumps, and magnetos and starter. Every control shows the simulator's current state and uses the
default X-Plane commands, so it works on any aircraft that uses them. It is used from start to
shutdown.

## Why now

Stage 2. Once F-04 and F-03 exist, these are the controls that let a pilot run a whole flight from
the tablet instead of reaching back to the simulator for the gear and the flaps. They are also the
foundation for the 737 overhead panel (F-53) and state-aware checklists (F-55). Only one researched
app covers them generically; everywhere else the user builds them from primitives.

## User stories

- As a simmer, I want to raise the gear and set the flaps from my tablet so that the whole departure
  can be flown without touching the simulator window.
- As a simmer, I want trim to move for as long as I hold the control and stop as soon as I let go,
  including if my phone loses Wi-Fi mid-hold.

## Scope

### In scope
- Exterior lights (landing, taxi, navigation, beacon, strobe) and interior lights, each with state.
- Landing gear, with the reported gear position; flaps, with the reported setting and detent.
- Pitch, roll and yaw trim as hold-type controls, with the reported trim position.
- Parking brake, pitot heat and the other anti-ice switches, each with its state.
- Fuel pumps and tank selection, magnetos and starter, each with its state.
- A plain-language reason whenever a control is unavailable on the loaded aircraft.

### Out of scope (this feature)
- Engine and systems gauges and limits (F-12); failure injection (F-25).
- The 737 overhead panel (F-53) and pedestal (F-54); checklists that read these states (F-55).
- User-defined controls for anything not in the list above (F-06).

## Functional requirements

R1. Safety rule. No control is offered unless a readable state exists for it: a command whose effect
cannot be read back is never exposed, because the pilot could not tell whether it worked. This
applies per control, not per panel.

R2. Every displayed state comes from the subscription stream, and a change made in the simulator
appears within two subscription intervals, about 200 ms at the documented 10 Hz.

R3. A momentary control sends one command activation and is confirmed by the state changing. If the
state does not change within a bounded time, the pilot is told the aircraft did not respond.

R4. A hold-type control such as trim is active only while held, is released explicitly on let go,
and is bounded so that it cannot remain active indefinitely.

R5. If the connection is lost while a hold-type control is active, the control is treated as
released. The panel says so, and it does not resume the hold on reconnect.

R6. The gear, magneto and starter controls require a deliberate action that cannot be triggered by a
single accidental touch.

R7. If a command or state dataref cannot be resolved for the loaded aircraft, only that control is
unavailable, with a short explanation naming the aircraft; the rest keeps working. A write refused
as read-only makes that control unavailable for the session in the same way.

R8. While disconnected, all states are marked stale with the time of the last update and all
controls are inert. Nothing is queued or replayed on reconnect.

R9. On reconnect all names are resolved again before any state is shown, because ids are valid for
one simulator session only.

R10. Errors appear as plain sentences with a next step. Protocol codes, dataref ids, host addresses
and pairing tokens never appear in the UI and are never logged.

## X-Plane Web API mapping

States are read over the WebSocket subscription. Momentary controls use command activation; hold
controls use the WebSocket command activity message, which is the only mechanism with the right
semantics.

Command duration semantics, from the Web API documentation [1] as summarised in
`docs/roadmap/research/xplane-web-api.md`, section A: over REST, `POST /command/{id}/activate`
accepts a duration of up to 10 seconds. Over the WebSocket, `command_set_is_active` takes a duration
where 0 means press and release, and omitting it holds the command until explicitly deactivated, up
to 24 hours. WebSocket durations are cleared per connection when the connection drops, which is what
makes R5 safe: a dropped connection cannot leave trim running.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Exterior and interior lights | not identified; verify in `DataRefs.txt` and `Commands.txt` | expected boolean per light plus toggle commands | Read/Write | — |
| Landing gear position and lever | not identified; verify in both files | expected float 0..1 per gear plus up/down commands | Read/Write | — |
| Flap handle and actual flap position | not identified; verify in both files | expected float 0..1 plus up/down commands | Read/Write | — |
| Pitch, roll and yaw trim | not identified; verify in both files | expected float -1..1 plus hold-type up/down commands | Read/Write | — |
| Parking brake, pitot heat, anti-ice | not identified; verify in `DataRefs.txt` | expected float 0..1 and boolean per switch | Read/Write | — |
| Fuel pumps, tank selection, magnetos, starter | not identified; verify in both files | expected boolean and int enum per engine plus a starter command | Read/Write | — |

No name in this table was found in a Laminar-authored source. The community command catalogue the
research cites is a third-party mirror whose names "should be re-verified against the in-sim
`DataRefs.txt`/`Commands.txt` before shipping" (`docs/roadmap/research/xplane-web-api.md`, section
B). Identifying every name in the simulator is a precondition for planning this feature; under the
safety rule, any control whose state name is missing is simply not built.

## Aircraft compatibility

Default aircraft using X-Plane's standard systems respond to the default commands and expose the
matching state datarefs, so no per-aircraft handling is needed. Add-ons with custom systems logic
often accept the default commands for some controls and ignore them for others, which is the case R3
exists to catch. The Zibo 737 overhead is F-53; F-03 decides which controls to offer.

## Competitor evidence

- The Touch Portal X-Plane 12 plugin covers "engine, lights, brakes and flaps plus sim-level
  functions", which is the closest existing coverage of this feature and requires the user to build
  the grid — https://github.com/coussini/XPlaneTouchPortalPlugin
- Air Manager offers "touch-interactive switches, knobs, buttons" but only through panels the user
  or the community authors — https://siminnovations.com/air-manager/
- The failure to avoid is a control that silently stops working after a sim update; one vendor warns
  "X-Plane 12.4.1+ crash? Please update to the latest ExtPlane plugin" —
  https://www.planetcoops.com/apps/xp-remote

## Acceptance criteria

- [ ] A mock in which a control's state dataref is missing does not show that control at all (R1),
      while the rest of the panel works.
- [ ] Gear up changes the reported gear position on a real simulator; a mock that accepts the
      command but never changes the state produces a plain "the aircraft did not respond".
- [ ] Holding trim moves the trim position continuously and stops within one subscription interval
      of release.
- [ ] Dropping the connection during a trim hold leaves the trim stationary in the simulator, and
      the panel reports the hold as released.
- [ ] Disconnecting marks states stale, disables controls, and leaves no token, id or host address
      in the logs.

## Risks and open questions

- Every name in the mapping table is unidentified. This feature cannot be planned in detail until
  the default aircraft names are read from the simulator.
- Open questions: which lights and anti-ice switches belong in the default set; flaps as detents or
  as a continuous control; whether trim offers a centre control.
- R4 depends on the WebSocket hold semantics reaching every client platform through the connector,
  the web build included. A client limited to REST can hold for only 10 seconds [1], which would
  force trim behaviour to be reconsidered.
- Ids are session-scoped and must never be persisted (`docs/roadmap/research/xplane-web-api.md`,
  risk 4).

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. `docs/xplane.md`
3. `docs/roadmap/research/xplane-web-api.md`
4. `docs/roadmap/research/remote-control-apps.md`
5. `docs/roadmap/research/panel-builders.md`
