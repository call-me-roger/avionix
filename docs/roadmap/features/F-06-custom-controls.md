# Custom controls and profiles

| Field | Value |
|---|---|
| ID | `F-06` |
| Stage | `3` |
| Category | Platform |
| Status | Proposed |
| Depends on | `F-04`, `F-03` |
| Competitor prevalence | Matrix count 2 of 12 representative products (`research/competitors.md`). Wider set: 5 of 13 remote-control and panel products researched let the user bind their own controls (Air Manager's designer, Touch Portal's XP-FlightDeck and XPlaneTouchPortalPlugin, xp_streamdeck, Flight Deck ONE's dashboard builder, the X-Plane Control Pad's raw dataref console); all but Flight Deck ONE require authoring on a desktop or a hardware deck |

## Summary

A pilot can build their own panel: buttons that activate a command or write a value, and readouts
that show a DataRef, each labelled by them and bound to a name they choose. A set is saved as a
profile, can be tied to an aircraft so it appears automatically, and can be exported and shared.
It covers the switches and readings Avionix's own panels do not, on any aircraft.

## Why now

Stage 3, after the generic cockpit exists, because custom controls fill the gaps the shipped
panels leave rather than substitute for them. The deck-controller category exists because users
build their own grids from datarefs, commands and icons: the PMDG 737 Stream Deck profile grew to
840 controls across 33 pages, coverage no hand-built panel set will match. The reports single out
this "user builds their own button grid from primitives" model as what dedicated consumer apps do
not offer.

## User stories

- As a simmer flying an add-on with no Avionix panel, I want to bind the six switches I actually
  use so that I can stop reaching for the mouse.
- As a simmer, I want a readout of one number I care about that no shipped panel displays.
- As a simmer with several aircraft, I want my buttons to change with the aircraft automatically.
- As a simmer with a good set, I want to share it with someone flying the same add-on, and I want
  a mistyped name caught when I make it, not silently in flight.

## Scope

### In scope
- Creating a control the user names and binds to one DataRef or one command.
- Control kinds for the common cases: activate a command, write a fixed value, step a value within
  a range, toggle between two values, and a read-only readout with a unit and decimals.
- Validating the bound name against the connected simulator on create and edit, reporting whether
  it resolves and whether a DataRef is writable.
- Grouping controls into a named profile the user selects.
- Binding a profile to an aircraft, so the profile is offered automatically when `F-03` identifies
  that aircraft, with the user able to override.
- Exporting a profile to a shareable file and importing one, with a review step showing what it
  binds to before acceptance.
- Editing, duplicating, reordering and deleting controls and profiles, and reporting per-control
  availability on the loaded aircraft exactly as shipped panels do.

### Out of scope (this feature)
- Any downloading of community profiles from a service; sharing is by file.
- Scripting, conditions, sequences or macros across several controls.
- Custom graphics, gauges or artwork; voice control (`F-26`); binding anything other than a
  DataRef or a command, since the Web API exposes nothing else.

## Functional requirements

R1. A control binds to exactly one DataRef or command name, entered or chosen by the user, and
carries a user-supplied label.
R2. On creation or edit, and while connected, the app resolves the bound name and reports
resolved, not found, or not writable for a control that would write.
R3. A control bound to a name that does not resolve on the loaded aircraft is shown unavailable
with its reason and does nothing when pressed.
R4. A control bound to a read-only DataRef cannot be saved as a writing control; it can be saved
as a readout.
R5. A stepping control has a minimum, a maximum and a step; values outside the range are refused
before any write is sent.
R6. A write or activation that the simulator rejects is reported against that control in plain
language, and the control reverts to the simulator's value.
R7. When disconnected, custom controls remain visible with their last known values marked not
live, and every writing control is disabled.
R8. A profile records which aircraft it is bound to, if any, and the app offers it when that
aircraft is identified; the user can select another profile at any time.
R9. Import shows every control in the profile with its bound name and kind, and requires explicit
acceptance; import never activates a command or writes a value as part of the process.
R10. An imported profile whose names do not resolve on the current aircraft imports successfully
and reports the unresolved controls rather than being rejected.
R11. Export contains only user-authored content: labels, names, kinds and ranges. It never
contains connection details, pairing codes, tokens or session ids.
R12. Custom controls obey the panel framework rules for touch target size, stale data, night use
and disruptive-control confirmation (`F-04`).
R13. The app never shows the user a raw protocol error when a name fails to resolve; it names the
control and the bound name.

## X-Plane Web API mapping

Names are user-supplied, so nothing here can be verified in advance; the API's own name lookup is
the validation. Ids are session-scoped, so every bound name is re-resolved on each connect,
exactly as the shipped panels' names are.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Validate and resolve a bound DataRef | `GET /api/v3/datarefs?filter[name]=<name>` | JSON | Read | docs/xplane.md |
| Validate and resolve a bound command | `GET /api/v3/commands?filter[name]=<name>` | JSON | Read | docs/xplane.md |
| Writability of a bound DataRef | `is_writable` on the descriptor | boolean | Read | docs/xplane.md (undocumented but observed) |
| Live value for a readout | `dataref_subscribe_values` | ~10 Hz, delta only | Read | docs/xplane.md |
| Write a value | `PATCH /api/v3/datarefs/{id}/value` | per DataRef | Write | docs/xplane.md |
| Activate a command | `POST /api/v3/command/{id}/activate` | duration 0..10 s | Write | docs/xplane.md |
| Bound names themselves | user-supplied; not identified in advance | varies | — | User input; unverified by definition |

## Aircraft compatibility

Works on any aircraft, because the user supplies the names. Default aircraft use Laminar `sim/...`
names; add-ons expose their own, such as the Zibo 737's `laminar/B738/...` namespace, whose list
ships inside the aircraft folder as `B738_Datarefs.txt` and changes between releases. A profile is
only as durable as the add-on version it was written against, which R2 and R3 make visible.

## Competitor evidence

- Touch Portal's X-Plane plugins give users a bidirectional button grid over datarefs and
  commands, and the reports call this user-built-grid model the direct analogue of any custom
  mapping feature Avionix adds —
  https://github.com/coussini/XPlaneTouchPortalPlugin
- The PMDG 737 Stream Deck profile reached 840 individual controls across 33 pages, showing the
  coverage power users expect once an add-on is popular —
  https://flightpanels.io/en-us/products/pmdg-737-streamdeck-profiles-for-microsoft-flight-simulator
- xp_streamdeck turns any key into a toggle, command fire, dataref write or live readout, which is
  the same primitive set — https://github.com/rwellinger/xp_streamdeck
- Air Manager's drag-and-drop designer plus a large community library is described as the
  product's core differentiator — https://siminnovations.com/air-manager/
- Hand-authored mapping files that must be copied into place and break silently on every add-on
  point release are named as the biggest source of documented pain in the category —
  https://www.pollypotsoftware.org.uk/vanillaforums/discussion/655/zibos-boeing-b738-800-mcp-pro-efis-2xgf166-lgt-ii-requires-git-1-8-2-0-for-x-plane

## Acceptance criteria

- [ ] Create a button bound to a known command, press it, and confirm the simulator responds.
- [ ] Create a readout bound to a known DataRef and confirm it tracks the simulator.
- [ ] Bind a mistyped name and confirm the editor reports it as not found before saving.
- [ ] Bind a read-only DataRef to a writing control and confirm it is refused.
- [ ] Export a profile, import it on a second device, and confirm the review step lists every
      binding and that acceptance is required.
- [ ] Inspect an exported file and confirm it contains no host, token or pairing code.
- [ ] Load an aircraft lacking a bound name and confirm only that control reports unavailable;
      disconnect and confirm custom controls show stale values and refuse writes.

## Risks and open questions

- Which control kinds are the minimum worth shipping? Command, write, step, toggle and readout is
  a guess to check against what users actually bind on decks.
- Can the user browse the simulator's names rather than typing them? The API can list and
  paginate, but the list is large, and this is a usability question to settle before build.
- Should a profile be able to pin an add-on version, given profiles will break on add-on updates?
- How should array-valued and byte-valued DataRefs be handled, if at all? The API exposes them,
  but they are not obviously bindable to a single control.
- Command activation over REST is capped at ten seconds, so a held control needs a different
  mechanism; the WebSocket path supports longer holds and needs verification.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. docs/xplane.md, docs/architecture.md
3. docs/roadmap/research/remote-control-apps.md, panel-builders.md, boeing-737-ecosystem.md,
   xplane-web-api.md
4. https://github.com/coussini/XPlaneTouchPortalPlugin
5. https://flightpanels.io/en-us/products/pmdg-737-streamdeck-profiles-for-microsoft-flight-simulator
6. https://github.com/rwellinger/xp_streamdeck
7. https://siminnovations.com/air-manager/
8. https://www.pollypotsoftware.org.uk/vanillaforums/discussion/655/zibos-boeing-b738-800-mcp-pro-efis-2xgf166-lgt-ii-requires-git-1-8-2-0-for-x-plane
