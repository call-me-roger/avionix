# Charts and navdata integration

| Field | Value |
|---|---|
| ID | `F-34` |
| Stage | `5` |
| Category | Navigation |
| Status | Proposed |
| Depends on | `F-13`, `F-31` |
| Competitor prevalence | Matrix count 4 of 12 representative products (`research/competitors.md`). Wider set: 7 of 8 EFB/moving-map products researched offer charts or navdata (ForeFlight, Garmin Pilot, SkyDemon, Navigraph Charts, Little Navmap, FltPlan Go, AviTab) |

## Summary

The pilot gets airports, navaids, airways and procedures on the Avionix map, and can open an
approach plate or airport diagram on the device with the aircraft's own position shown on it. It
turns the moving map of F-13 from a dot on a blank background into something usable for briefing
and arrival planning, on a tablet, before descent.

## Why now

Stage 5, deliberately last of the navigation features. It is table stakes for an EFB — nearly
every product researched has it — but none of it comes from the simulator's Web API, so it is the
one navigation feature whose data, licensing and cost sit entirely outside the architecture that
makes the rest of Avionix cheap to build. It depends on F-13 for the map and F-31 for the route to
draw on it, and it should not be started until both are stable.

## User stories

- As a pilot planning a descent, I want the arrival airport, its runways and the surrounding
  navaids on the map so that the map is worth looking at.
- As a pilot, I want an approach chart on the tablet with my own position on it so that I can
  brief and fly the approach from one device.
- As a pilot, I want to see which data cycle I am looking at so that I know when it disagrees with
  the simulator.

## Scope

**The X-Plane Web API exposes no navdata.** There is no airport, navaid, airway, procedure or
chart query; this data lives in the simulator's own data files and, optionally, in a commercial
navdata subscription. Nothing in this feature can be met by reading a dataref. Every candidate
source is a product and licensing decision, not an API call, and each is listed under open
questions.

### In scope
- Airports, runways and navaids on the map, searchable by identifier.
- Airways and terminal procedures as map geometry where the chosen data source provides them.
- Opening an airport diagram or approach chart on the device, with ownship position on the chart
  where the source supports georeferencing.
- Showing which data source and cycle is in use, and whether it matches the simulator's own data.
- Working offline for data already on the device.

### Out of scope (this feature)
- Route planning and editing (F-31 is read-only; F-33 covers import and export).
- Terrain, obstacle and airspace warnings of any kind.
- Any claim of real-world navigational validity. This is a simulator companion.
- Aircraft-specific ND and EFIS rendering (F-52).

## Functional requirements

R1. The pilot can find an airport or navaid by identifier and see it on the map with the ownship
position from F-13.

R2. The data source and cycle in use are visible from the map, not buried in settings, and the app
says when the cycle is older than the simulator's own.

R3. When the simulator's data and the chosen chart source disagree about a procedure or a
frequency, the app shows both rather than silently preferring one.

R4. Chart and navdata features degrade independently: with no chart source configured the map
still shows whatever navdata is available, and with neither, F-13 still works unchanged.

R5. Anything that requires a paid subscription is identified as such before the pilot taps it, and
the app never presents a paywall as an error.

R6. With the simulator disconnected, charts and navdata remain usable as a static reference; only
the ownship overlay is disabled, with the reason shown.

R7. Data already downloaded is usable with no internet connection.

R8. A failed fetch or update produces a plain message naming the source and the action to take;
raw protocol errors, status codes and provider error payloads never reach the UI, and no
credential or pairing token is ever logged.

R9. Nothing about the pilot's route or position reaches a third party except what the chosen chart
provider needs to serve a chart, and that is stated before it happens.

## X-Plane Web API mapping

This feature reads nothing new from the simulator over the Web API. Its only simulator inputs are
the position and plan values already specified by F-13 and F-31.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Airport, navaid, airway, procedure query | no endpoint or dataref exists in the Web API | — | — | [1], [2] |
| Chart or plate retrieval | no endpoint exists in the Web API | — | — | [1] |
| Simulator's own navdata files | `apt.dat`, `earth_nav.dat` in the X-Plane installation; files on the simulator PC, not an API surface | data files | read (candidate only) | [2] |
| Ownship position for the overlay | as specified in F-13 | — | R | [3] |
| Active route geometry | as specified in F-31; leg list not identified, verify in `DataRefs.txt` | — | R | [4] |

## Aircraft compatibility

Charts and navdata are aircraft-independent: nothing here is read from the aircraft. The only
aircraft-dependent part is the route overlay, which inherits F-31's limits — it is available for
aircraft flying the default FMS and unavailable for add-on FMSs, where the map shows airports and
charts but no route.

## Competitor evidence

- Navdata currency is what users actually pay for: one pilot notes the default sim data misplaces
  ILS localizers "in almost all airports in China", which an updated cycle fixes.
  https://forums.flightsimulator.com/t/navigraph-vs-free/379287
- The same discussion carries the opposite view — "keeping up to date is mostly a major headache
  and adds minimal to the sim" — and points at free substitutes such as Chartfox and VFRMap.
  https://forums.flightsimulator.com/t/navigraph-vs-free/379287
- Splitting navdata, charts, map and FMS injection across separate installs produces the "Lost in
  Navigraph" complaint — one workflow should not need four tools.
  https://forums.x-plane.org/forums/topic/304396-lost-in-navigraph/
- Garmin Pilot's most-praised sim feature is seeing "where you are on the procedure map" live,
  which is the georeferenced-chart behaviour R1 and R6 aim at.
  https://ipadpilotnews.com/2016/02/garmin-pilot-adds-flight-profile-view-x-plane-support/
- AviTab's moving map is judged inferior to Little Navmap's by users, showing that a weak map with
  charts bolted on does not satisfy this audience.
  https://forums.x-plane.org/files/file/44825-avitab-vr-compatible-tablet-with-pdf-viewer-moving-maps-and-more/

## Acceptance criteria

- [ ] An airport searched by identifier appears on the map with the ownship position from F-13.
- [ ] The data source and cycle are visible from the map, and a deliberately stale cycle produces
      the mismatch notice.
- [ ] With no chart source configured, the map still renders and F-13 behaves exactly as before.
- [ ] With the simulator disconnected, charts stay usable and only the ownship overlay is
      disabled, with a stated reason.
- [ ] A failed data update names the source and the action; no provider error text, status code or
      credential appears in the UI or in logs.

## Risks and open questions

1. **Where does the data come from?** Candidates, none chosen: (a) the Avionix Connector reads the
   simulator's own `apt.dat` and `earth_nav.dat` and serves what it finds to the device, keeping
   app and simulator in sync by construction; (b) a commercial navdata and chart subscription the
   pilot already holds; (c) free chart sources with limited coverage; (d) no charts at all, navdata
   only. Each has different licensing, coverage and cost.
2. Approach (a) requires the Connector to read files on the simulator PC, which it does not do
   today — the same question F-33 raises. What does that mean for packaging, permissions and the
   pairing model?
3. Redistribution and licensing of chart imagery is a legal question, not an engineering one, and
   must be answered before any implementation begins.
4. Subscription cost is a live tension in this market (see the evidence above). Whether Avionix
   charges for anything navdata-dependent, or only integrates a subscription the pilot already
   pays for, is an open product decision.
5. Procedure geometry in `apt.dat`/`earth_nav.dat` may not be complete or convenient enough to
   draw procedures from; this needs verification against a real installation before promising it.
6. Chart georeferencing is not available for every plate from every source, so ownship-on-chart
   may be partial and must be presented as such.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. https://developer.x-plane.com/docs/web-apis/
3. docs/roadmap/features/F-13-moving-map.md
4. docs/roadmap/features/F-31-flight-plan-progress.md
5. docs/roadmap/research/efb-moving-map.md, docs/roadmap/research/xplane-web-api.md
