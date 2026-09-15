# Flight plan progress view

| Field | Value |
|---|---|
| ID | `F-31` |
| Stage | `3` |
| Category | Navigation |
| Status | Proposed |
| Depends on | `F-32`, `F-13` |
| Competitor prevalence | Matrix count 5 of 12 representative products (`research/competitors.md`). Wider set: 6 of 8 EFB/moving-map products researched show plan progress (ForeFlight, Garmin Pilot, SkyDemon, Navigraph Charts, Little Navmap, FltPlan Go) |

## Summary

The pilot gets a read-only view of the flight plan the simulator's own FMS is already flying: the
sequence of legs, which waypoint is active, and distance and time to it. It sits beside the moving
map (F-13) so the pilot can see where the aircraft is going without reading it off the CDU page by
page. It is used in cruise and on arrival, on a tablet or a phone.

## Why now

Stage 3 is situational awareness. F-13 puts the aircraft on a map and F-32 puts the CDU on the
device; neither answers "what is the plan, and how far to the next fix" at a glance. Plan sync is
the biggest unmet need in this market, but the Web API cannot write a plan, so Avionix earns
credibility by doing the readable half honestly first. F-33 and F-34 build on this view.

## User stories

- As a pilot in the cruise, I want the next waypoint and the distance and time to it on a tablet
  so that I do not page through the CDU to answer one question.
- As a pilot, I want the whole plan listed in order beside the map so that I can brief the arrival
  without leaving the app.
- As a pilot, I want to be told plainly that the plan is read-only so that I am not hunting for an
  edit button that cannot exist.

## Scope

This feature is a **view only**. Two Web API limits shape it and must be stated in the product,
not buried: there is no flight-plan upload or edit endpoint (the Flight Initialization API
configures the *starting* flight, not an en-route route), and there is no navdata query of any
kind. What the view shows must come from datarefs the default FMS publishes, or from the CDU
screen text F-32 already mirrors.

### In scope
- The legs of the active plan in order, as far as the simulator exposes them, with the active leg
  marked and the distance and estimated time to the active waypoint.
- Distance and estimated time to destination, and the FMS vertical target, where published.
- A clear statement, on the same screen, of what the simulator does not expose.

### Out of scope (this feature)
- Creating, editing, reordering or deleting any leg. The API has no endpoint for it.
- Importing a plan from a file or a planning service, and loading one into the sim (F-33).
- Airport, navaid, procedure or chart lookup (F-34).
- Map rendering itself (F-13) and any add-on FMS (F-51, F-57).

## Functional requirements

R1. While connected with a default-FMS aircraft, the view shows the active waypoint and the
distance and time to it, refreshed from the subscription stream, no value older than 2 s.

R2. Legs are listed in flown order with the active leg marked. Where the simulator exposes no leg
list, the view derives what it can from the mirrored CDU legs page and says that it is doing so.

R3. Every field the simulator does not publish for the loaded aircraft is shown as unavailable
with a short reason, not as a blank or a zero.

R4. The view states plainly, once and without jargon, that the plan is read-only because the
simulator's Web API offers no way to change it, and points the pilot at the CDU (F-32) for edits.

R5. When the active waypoint changes, the view updates within 2 s and the change is visible
without scrolling. Distances are in nautical miles and times in minutes, units shown.

R6. On connection loss the last plan stays visible, is marked stale within 2 s, and no value is
presented as current.

R7. When no plan is loaded in the simulator, the view says so rather than showing an empty list.

R8. Error text is plain language: raw protocol errors, dataref ids and status codes never reach
the UI, and pairing tokens are never logged.

R9. The view holds no plan of its own between sessions; it reflects what the simulator reports.

## X-Plane Web API mapping

Everything here is a dataref read over the documented subscription at ~10 Hz, far more than a plan
view needs. There is no plan resource, route endpoint or navdata query in the Web API. The leg
list has no identified dataref: it must be found in the simulator's own `DataRefs.txt` or
reconstructed from the CDU legs page F-32 mirrors. Names marked (unverified) come from a community
mirror of `DataRefs.txt`.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Leg list (identifier, sequence) | not identified; verify in `DataRefs.txt` | — | R | — |
| Active waypoint identity | `sim/cockpit/gps/destination_index`, `destination_type` (unverified) | int | R | [2] |
| Distance to the GPS destination, used as the active-waypoint proxy (see risk 3; same name as in `F-11`) | `sim/cockpit2/radios/indicators/gps_dme_distance_nm` (unverified) | float, nautical miles | R | [2] |
| Time to the GPS destination, same proxy | `sim/cockpit2/radios/indicators/gps_dme_time_min` (unverified) | float, minutes | R | [2] |
| Bearing to active waypoint | `sim/cockpit2/radios/indicators/gps_bearing_deg_mag` (unverified) | float, degrees magnetic | R | [2] |
| Cross-track deviation | `sim/cockpit2/radios/indicators/gps_hdef_dots_pilot` (unverified) | float, dots | R | [2] |
| FMS vertical target altitude | `sim/cockpit2/radios/indicators/fms_fpta_pilot`, `fms_fpta_copilot` | float, feet; -1000 when no baro VNAV | R | [1] |
| Waypoint sequencing override | `sim/operation/override/override_fms_advance` (unverified) | int boolean | R | [2] |
| CDU legs page text (fallback) | `sim/cockpit2/radios/indicators/fms_cdu1_text_line0..15` | byte/string | R | [3] |
| Distance / time to destination | not identified; verify in `DataRefs.txt` | — | R | — |

## Aircraft compatibility

This view is meaningful only for aircraft flying the default X-Plane FMS or GPS, the set F-32
covers. Aircraft with their own FMS publish non-standard datarefs, so the fields will be
unavailable and R3 applies; the 737 and Airbus cases are F-51 and F-57. F-03 decides whether the
view is offered, and it must never show a default-FMS value while an add-on FMS is flying.

## Competitor evidence

- Getting a plan from an EFB into X-Plane's FMS is an unsolved, repeatedly-discussed problem: a
  34-post thread exists about exactly this, with pilots falling back on third-party tools.
  https://forums.x-plane.org/forums/topic/283018-getting-a-foreflight-flightplan-in-to-xplane/
- Garmin Pilot's standout praised feature is seeing "where you are on the procedure map" live
  during the sim session — progress against the plan, not the plan itself.
  https://ipadpilotnews.com/2016/02/garmin-pilot-adds-flight-profile-view-x-plane-support/
- Navigraph Charts shows the aircraft's position along SIDs, STARs and airways, and its navdata
  currency is what users pay for. https://navigraph.com/blog/zibo-737
- ForeFlight users complain about silent staleness: position lagging so far behind that the app
  showed the approach minutes after landing — hence R6's explicit stale marking.
  https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight

## Acceptance criteria

- [ ] Against the mock server, the active waypoint, distance and time render and update, and the
      whole view is marked stale within 2 s of a dropped socket.
- [ ] With the plan datarefs absent, every affected field shows its unavailable reason and the
      view still opens.
- [ ] With no plan loaded, the view says so instead of showing an empty list.
- [ ] On a real simulator with a default-FMS aircraft, the active waypoint shown matches the CDU
      legs page, and distance counts down consistently with the sim.
- [ ] No raw protocol text appears in the UI; logs contain no token.

## Risks and open questions

1. No leg-list dataref was identified in this pass. Whether the default FMS publishes one at all
   must be settled against the simulator's `DataRefs.txt`; if it does not, the entire leg list
   depends on parsing the CDU legs page, which is fragile and paginated.
2. Parsing CDU text to build a structured list is a correctness risk: page layout, scrolling and
   abbreviations are not a documented data contract. Is a text-faithful list acceptable instead?
3. The `gps_dme_*` values describe the tuned GPS destination, not necessarily the FMS's active
   leg; whether they agree in all modes needs checking on the sim.
4. Distance and estimated time to *destination* have no identified source; they may have to be
   omitted rather than computed by Avionix from position and groundspeed.
5. Should this view be a separate screen or a layer on the F-13 map? A layout question for F-04.

## References

1. https://developer.x-plane.com/article/changes-to-radio-navigation/
2. https://raw.githubusercontent.com/Marginal/XPlane2Blender/master/DataRefs.txt (community mirror
   of Laminar's `DataRefs.txt`; names taken from it are marked unverified)
3. https://developer.x-plane.com/article/datarefs-for-the-cdu-screen/
4. https://developer.x-plane.com/article/x-plane-web-api/
5. https://developer.x-plane.com/article/flight-initialization-api/
6. docs/roadmap/research/xplane-web-api.md, docs/roadmap/research/efb-moving-map.md
