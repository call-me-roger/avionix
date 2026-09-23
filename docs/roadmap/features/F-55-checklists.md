# Checklists and flows

| Field | Value |
|---|---|
| ID | `F-55` |
| Stage | `4` |
| Category | Aircraft-specific |
| Status | Proposed |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 0 of 12 representative products (`research/competitors.md`). Wider set: 0 of 13 researched companion products for X-Plane offer checklists; the nearest analogue is FlyByWire's flyPadOS 3 "Smart Checklists", which run inside the simulator on one screen with no second-device mode |

## Summary

Avionix shows the normal checklists and flows for the loaded aircraft on a phone or tablet, so the
device in the pilot's hand does the job a kneeboard or a printed card does: preflight, before
start, before taxi, before takeoff, after takeoff, descent, approach, landing and shutdown. The
first version is a static, tappable checklist. Reading aircraft state to tick items automatically
is a later question, answered below, not a promise here.

## Why now

Checklists are a gap, not a copy. No researched X-Plane companion app offers them, while the
best-regarded EFB in the adjacent MSFS world made interactive checklists a headline feature and its
own users then asked for the second-device mode it lacks [1], [2]. A praised feature plus a
documented absence of the delivery mechanism Avionix already has is the clearest differentiator in
the research. It needs only F-03 to know the aircraft and F-04 to present a panel.

## User stories

- As a pilot, I want the normal checklists on my tablet so that I stop alt-tabbing to a PDF.
- As a 737 pilot, I want checklists that match the aeroplane I am flying, not a generic list.
- As a pilot interrupted mid-flow, I want to see which item I stopped at when I come back.
- As a pilot, I want to write or edit a checklist so that it matches how I actually fly.

## Scope

### In scope

- Normal checklists and flows for the default X-Plane aircraft Avionix supports and for the Zibo
  and LevelUp 737.
- Manual completion: each item can be checked, unchecked, and skipped, and the list shows progress
  and the current item.
- Checklist state survives leaving and returning to the panel, and survives a disconnection.
- User-editable and user-created checklists, so a pilot can correct or replace what ships.
- Selection of the checklist set by the aircraft F-03 identifies, with a manual override, and a
  clear statement of where a shipped checklist came from.

### Out of scope (this feature)

- Non-normal and emergency checklists: safety-shaped content, handled largely inside the aircraft's
  own tablet, and not worth shipping without a verified source [3].
- Reading aircraft state to complete items automatically, in this version. See the open questions.
- Callouts, audio, or anything that speaks (F-26 covers voice separately).
- Performance calculation and weight and balance (F-56).

## Functional requirements

R1. For a recognised aircraft, the app offers the checklist set mapped to it, and the pilot can
switch to any other available set manually.

R2. Each item can be checked, unchecked and skipped, and the list always shows how many items
remain and which is current.

R3. Checklist progress persists across leaving the panel, backgrounding the app and reconnecting,
and is only reset by the pilot or by starting a new flight.

R4. A checklist runs with no simulator connection at all, because a checklist is a document. When
disconnected the panel says the simulator is not connected but stays usable.

R5. Shipped checklists state their source. A checklist the user created or edited is labelled as
theirs, and editing a shipped list never silently changes what other lists show.

R6. Where an item names a dataref for a later automatic check and that dataref is missing on the
loaded aircraft, the item remains a normal manual item; nothing is hidden and no error is shown to
the pilot beyond a note that automatic checking is unavailable.

R7. When the loaded aircraft is not recognised, a generic checklist set is offered and the app says
it is generic.

R8. Any failure to load or save checklist content is reported in plain language. No raw protocol
error, endpoint or payload is shown; tokens are never logged.

## X-Plane Web API mapping

The static version reads nothing from the simulator except the aircraft identity that F-03 already
provides. It therefore has no Web API requirement of its own and works while disconnected, which
is what R4 says. An automatic-completion version would subscribe to one dataref per checked item
at the ~10 Hz rate, which is ample for configuration state [4].

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Aircraft identity for checklist selection | supplied by F-03 | — | R | F-03 |
| Per-item state for automatic checking (default aircraft) | not identified; verify in DataRefs.txt per item | — | R | [4] |
| Per-item state for automatic checking (Zibo) | not identified; verify in `B738_Datarefs.txt`. The attested naming pattern is `laminar/B738/annunciator/parking_brake` (unverified, community) | — | R | [5] |

No checklist content is available from the Web API. The simulator does not publish the aircraft's
checklist, so every list Avionix shows is content Avionix or the user supplies.

## Aircraft compatibility

Default X-Plane aircraft get checklist sets keyed to the type F-03 reports. The Zibo and LevelUp
737 get their own set. Any aircraft Avionix does not recognise gets the generic set and is told so.
Automatic completion, if it is ever built, would be per aircraft and per add-on version, with the
same pinning F-50 uses, because the datarefs it needs are aircraft-specific.

## Competitor evidence

- FlyByWire presents interactive "Smart Checklists" tied to aircraft state as a headline feature of
  its EFB — https://flybywiresim.com/notams/flypados3/
- That EFB has no tablet or second-device mode, and FlyByWire's users filed a request for one —
  https://github.com/flybywiresim/aircraft/issues/6978
- The Zibo 737 already ships an in-simulator tablet, so the demand is largely about getting an
  existing tablet workflow onto a real external device — https://navigraph.com/blog/zibo-737
- Failure and non-normal handling is done inside Zibo's own tablet rather than by external apps,
  which is why this feature stays with normal checklists —
  https://forums.x-plane.org/forums/topic/198742-takeoff-and-landing-performance-calculator-via-zibo-tablet/
- Users adopt whole utilities just to get cockpit content onto a tablet, which is the behaviour a
  checklist panel serves — https://github.com/hawkeye-stan/msfs-popout-panel-manager
- AviTab sets the in-cockpit expectation for notes and documents on a tablet, without touching
  checklists — https://github.com/fpw/avitab

## Acceptance criteria

- [ ] A checklist can be run start to finish with no simulator running.
- [ ] Progress survives leaving the panel, backgrounding the app, and a disconnection and
      reconnection.
- [ ] Loading a recognised aircraft selects its set; loading an unrecognised one selects the
      generic set and says so.
- [ ] A user-created checklist can be created, edited, run and deleted, and a shipped list is
      labelled with its source.
- [ ] No log or message contains a token, protocol code or URL.

## Risks and open questions

1. Content licensing. Real operator and manufacturer checklists are copyrighted. What Avionix may
   ship, and whether the shipped sets must be written from scratch or sourced under a licence that
   permits redistribution, is an open legal question that gates the shipped content, not the
   feature.
2. Automatic, state-aware completion is the most-praised part of the analogue product [1] but needs
   a verified dataref per item, per aircraft, per add-on version. Whether Avionix ships it, and
   whether a wrongly ticked item is worse than no ticking at all, is unresolved.
3. If automatic completion is built, whether an item may be auto-unticked when the state reverts is
   a real safety-of-use question.
4. Whether flows (the physical scan) and checklists (the verification) are one thing or two, and
   whether sets should be sharable between users, are undecided.
5. Zibo's own tablet already offers some of this in the simulator, so the value is the second
   device, not the content; if the checklist is no better than the aircraft's own, it should not
   ship.

## References

1. https://flybywiresim.com/notams/flypados3/
2. https://github.com/flybywiresim/aircraft/issues/6978
3. https://navigraph.com/blog/zibo-737
4. https://developer.x-plane.com/article/x-plane-web-api/
5. https://forums.x-plane.org/forums/topic/346056-feature-request-takeoff-req-lsk3-cg-should-update-laminarb738tabcg_pos-dataref

Research: `docs/roadmap/research/boeing-737-ecosystem.md`, `xplane-web-api.md`, `fmc-cdu-apps.md`.
