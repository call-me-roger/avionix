# Panel framework and layouts

| Field | Value |
|---|---|
| ID | `F-04` |
| Stage | `1` |
| Category | Platform |
| Status | Proposed |
| Depends on | `F-01` |
| Competitor prevalence | Matrix count 6 of 12 representative products (`research/competitors.md`). Wider set: 6 of 13 remote-control and panel products researched let the user switch between several panels or pages on one device (Air Manager, Flight Sim Remote Panel, RemoteFlight COCKPIT HD, XpRemotePanel, Flight Deck ONE, Touch Portal); small-screen usability is a named complaint against Flight Sim Remote Panel and Air Manager |

## Summary

Avionix presents its avionics as a set of panels the pilot chooses between and moves quickly
among, on a phone in the hand or a tablet beside the monitor, in either orientation. The framework
owns the rules every panel obeys: how panels are selected, how they behave when the link is stale
or the aircraft lacks a control, how large a control must be to press in flight, and that the
screen stays awake while a panel is open.

## Why now

Stage 1, because every panel feature from the primary flight instruments onwards plugs into it,
and because the two most common usability complaints in the research are structural: desktop-sized
controls shipped unchanged to phone screens ("impossible to use on an 8 inch screen"), and one
workflow split across several apps or devices, as with Simionic's two paid iPad apps. Settling the
rules once, here, stops each later panel re-inventing them badly.

## User stories

- As a simmer with one tablet, I want several panels in one app so that I do not need a second
  device or a second purchase.
- As a pilot in the cruise, I want the panel I need one or two touches away, not down a menu.
- As a simmer on a phone, I want controls big enough to press without staring at the screen.
- As a simmer flying at night, I want the panel not to light up the room, and the screen to stay
  awake while a panel is open so that my tablet does not sleep on short final.

## Scope

### In scope
- Panels as the unit of function: one panel presents one coherent set of readouts and controls,
  contributed by a later feature; the user chooses which panels are present, moves between them
  quickly, and returns to the last one used when the app is reopened.
- Two device classes, phone and tablet, and both orientations: every panel is usable in all four
  combinations or declares which it supports.
- Minimum touch target sizing and spacing rules every panel must satisfy, with controls carrying a
  write or command at least as large as readouts.
- A night presentation for a darkened room, selectable and also automatic from the device, on top
  of the existing light and dark theme.
- Keeping the screen awake while a panel is open, released when backgrounded or disconnected.
- A uniform way to show that a value is not live (`F-02`), that a control is unavailable on this
  aircraft (`F-03`), and a uniform confirmation rule for disruptive controls.
- When disconnected: panels stay reachable, show last known values marked not live, and disable
  every control.

### Out of scope (this feature)
- The content of any panel: instruments, autopilot, radios and the rest are separate features.
- User-authored controls and per-aircraft user profiles (`F-06`); assigning panel sets to several
  devices (`F-07`).
- Any visual design, iconography or layout geometry, which is a design decision, not a
  requirement.

## Functional requirements

R1. A panel declares which device classes and orientations it supports; the framework never shows
a panel on a combination it has not declared.
R2. Rotating the device preserves the panel, its state and any in-progress entry.
R3. Switching panels completes within a small fixed budget and does not drop or re-subscribe
values both panels use.
R4. Every interactive control meets the minimum touch target and spacing rules on both device
classes; a panel that cannot meet them on a phone declares itself tablet-only instead of shrinking.
R5. While any panel is in the foreground, the device screen does not sleep; the hold is released
when the app is backgrounded, when the session disconnects, and when the app is closed.
R6. Night presentation is selectable by the user and can follow the device; the choice persists
across restarts.
R7. When the link is stale or disconnected, every readout on every panel is marked not live and
every control that writes or activates is disabled, with one explanation visible per panel.
R8. When `F-03` reports a control's DataRef or command as missing on the loaded aircraft, that
control is shown as unavailable with the reason, and pressing it does nothing; the rest of the
panel keeps working.
R9. A failed write or command is reported in plain language against the control that caused it,
and leaves that control at its last known simulator state.
R10. Controls never optimistically display a value they wrote; the displayed value comes from the
simulator.
R11. No panel displays raw protocol errors, URLs or status codes, and no panel logs a token.
R12. Panels that are not visible do not hold subscriptions they do not need, and a panel returning
to the foreground reflects simulator state within one update cycle of the link being live.
R13. The panel selection and the last panel used persist per device across restarts.

## X-Plane Web API mapping

The framework reads and writes nothing of its own; it manages subscriptions on behalf of panels
and inherits the API's limits. Updates arrive at about 10 Hz and only for values that changed, so
panels must be specified against that rate rather than a frame-rate-smooth one.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Framework's own data | none | — | — | — |
| Subscription transport for panels | `dataref_subscribe_values` / `dataref_update_values` | JSON, ~10 Hz, delta only | Read | docs/xplane.md |
| Writes on behalf of panels | `PATCH /api/v3/datarefs/{id}/value` | per DataRef | Write | docs/xplane.md |
| Command activation on behalf of panels | `POST /api/v3/command/{id}/activate` | duration 0..10 s | Write | docs/xplane.md |
| Availability input | per-name resolution result | — | Read | `F-03` |

## Aircraft compatibility

The framework itself is aircraft-independent. It consumes the compatibility result from `F-03` and
is responsible for making a missing control visibly unavailable rather than inert and unexplained.
Aircraft-specific panels appear and disappear through the same mechanism as any other panel.

## Competitor evidence

- A Flight Sim Remote Panel user reports the radio stack is "mushy and difficult to operate ...
  still impossible to use on an 8 inch screen" —
  https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc
- Desktop-sized controls ported unchanged to phone screens is a recurring complaint pattern across
  nearly every legacy app in the category — docs/roadmap/research/remote-control-apps.md
- Simionic sells the PFD and MFD as two apps needing two iPads, which users call out as friction;
  the recommendation is that one device host multiple panel pages —
  https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787
- Air Manager's per-instrument modularity is praised because users assemble only the panels they
  want per flight phase rather than one fixed layout —
  https://siminnovations.com/shop/zibo-mod-737-800-overhead-panel/
- Users praise putting up bigger, more readable instruments than the monitor shows —
  https://apps.apple.com/us/app/air-manager/id1052587916

## Acceptance criteria

- [ ] Every shipped panel is exercised on a phone and a tablet, in portrait and landscape, and
      either passes the touch target rules or declares the combination unsupported.
- [ ] Mock server: mark the link stale and confirm every panel marks readouts not live and
      disables writing controls.
- [ ] Mock server: mark one control's name missing and confirm only that control becomes
      unavailable, with a reason.
- [ ] Mock server: reject a write and confirm the control reports it and reverts to simulator
      state.
- [ ] Device check: the screen does not sleep with a panel open; backgrounding releases the hold.
- [ ] Rotate the device mid-entry, confirm nothing is lost; reopen the app, confirm the last panel
      is restored.

## Risks and open questions

- What exact minimum touch target and spacing values should the rules use, and do they differ
  between phone and tablet? This must be settled before the first panel is built.
- Should night presentation be a third theme or a modifier on the existing dark theme?
- How should the framework behave on the web target, where keep-awake is not guaranteed and
  orientation is a window size?
- How many panels can subscribe at once before the device or the 10 Hz budget is the limit?
- Does any panel need faster than 10 Hz, and is client-side interpolation honest if so?

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. docs/xplane.md, docs/architecture.md
3. docs/roadmap/research/remote-control-apps.md, panel-builders.md, boeing-737-ecosystem.md
4. https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc
5. https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787
6. https://apps.apple.com/us/app/air-manager/id1052587916
7. https://siminnovations.com/shop/zibo-mod-737-800-overhead-panel/
