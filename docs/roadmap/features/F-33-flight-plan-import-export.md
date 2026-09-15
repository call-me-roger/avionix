# Flight plan import and export

| Field | Value |
|---|---|
| ID | `F-33` |
| Stage | `5` |
| Category | Navigation |
| Status | Proposed |
| Depends on | `F-31` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 1 of 8 EFB/moving-map products researched does true FMS-format interchange (Little Navmap, desktop only); Navigraph Charts and Flight Deck ONE generate plans via SimBrief but hand the sim-loading step to a separate tool |

## Summary

The pilot brings a route planned elsewhere — a SimBrief OFP, an X-Plane `.fms` file, a Little
Navmap export — into Avionix, reviews it on the device, and gets it into the simulator's FMS
without retyping it waypoint by waypoint. The same view can hand the current route back out as a
file. It is used before engine start, and after a re-route in the cruise.

## Why now

Stage 5, because it is the hardest thing in this roadmap to do honestly and the least certain to
be possible. It is also the clearest market gap: pilots run 34-post threads about getting a
ForeFlight plan into X-Plane's FMS and end up on third-party bridges
(https://forums.x-plane.org/forums/topic/283018-getting-a-foreflight-flightplan-in-to-xplane/),
and the only tool that does it well is a desktop application
(https://github.com/albar965/littlenavmap). It must not be attempted before F-31's read-only
picture is solid.

## User stories

- As a pilot who planned a flight in SimBrief or Little Navmap, I want that route in Avionix so
  that I do not retype it waypoint by waypoint.
- As a pilot, I want to know before I try whether Avionix can put the route into this simulator
  and this aircraft, rather than finding out halfway through.
- As a pilot, I want to compare the imported route against what the FMS is actually flying so that
  I can trust the box rather than the app.

## Scope

**The X-Plane Web API has no flight-plan endpoint.** There is no upload, no route resource and no
navdata query; the Flight Initialization API configures the *starting* conditions of a flight, not
an en-route route. Nothing in the API writes a plan into the FMS. Avionix cannot promise "send
your plan to the sim" on the strength of the API alone, and must not ship as if it could. Every
candidate route into the simulator is listed under open questions, not as a design.

### In scope
- Reading a route from a file the pilot supplies or a planning service they are signed in to, and
  showing it on the device: waypoints in order, with altitudes and airways the source carries.
- Comparing that route against the plan the simulator is flying (F-31) and showing the difference.
- Handing the route back out as a file the pilot can save or share.
- Saying, before the pilot tries, what Avionix can and cannot do with the route here.

### Out of scope (this feature)
- Route planning of any kind: Avionix computes no routes, fuel or performance.
- Navdata validation: the API exposes no navdata, so Avionix cannot check a waypoint exists
  (F-34 covers where navdata could come from at all).
- Editing the plan inside the FMS beyond whatever loading approach is chosen.
- Add-on FMSs (F-51, F-57), whose route entry is their own.

## Functional requirements

R1. The pilot can bring in a route from a file in X-Plane's `.fms` format and from at least one
planning service, and see the parsed waypoints in order before anything is sent anywhere.

R2. A file that cannot be parsed produces a plain message naming what was wrong with it, and no
partial route is shown as if it were complete.

R3. Avionix states, on the same screen and before the pilot acts, whether loading into the
simulator is available for the current connection and aircraft, and why not when it is not.

R4. Where loading is not available, the imported route is still usable as a reference view beside
the simulator's own plan, and the pilot can still export it.

R5. Any loading attempt reports a definite result: loaded, partially loaded with the point at
which it stopped, or not loaded with a reason. Silence is not acceptable.

R6. After a load, the view reconciles against what the simulator now reports (F-31) and shows any
difference, so the pilot verifies the FMS rather than trusting the app.

R7. Export produces a file in a documented interchange format the pilot's existing tools open.

R8. On connection loss, import, review and export keep working entirely on the device; only
loading into the simulator is disabled, with the reason shown.

R9. When a command or dataref a chosen loading approach needs is missing on the loaded aircraft,
loading is disabled with a plain reason and the rest of the feature keeps working.

R10. Error text is plain language: raw protocol errors, dataref or command ids and status codes
never reach the UI. Planning-service credentials and pairing tokens are never logged, and nothing
about a route leaves the device except to the simulator's own machine.

## X-Plane Web API mapping

There is nothing to map for the load itself: no dataref or endpoint accepts a route. The feature
relies on the read side specified in F-31, plus, if a key-entry approach is chosen, the
default-FMS key commands specified in F-32.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Upload a flight plan | no endpoint exists in the Web API | — | — | [1], [2] |
| Verify what the FMS now holds | as in F-31; leg list not identified, verify in `DataRefs.txt` | — | R | [3] |
| Key a route through the CDU (candidate only) | `sim/FMS/key_A..Z`, `key_0..9`, `ls_1l..ls_6r`, `exec` (unverified) | command | Activate | [4] |
| Confirm the aircraft flies the default FMS | `sim/cockpit2/radios/indicators/fms_cdu1_text_line0..15` | byte/string | R | [5] |

## Aircraft compatibility

Only aircraft flying the default X-Plane FMS are candidates for in-simulator loading, because only
they expose a documented key-command set and a readable screen to verify against. For add-on FMSs
this feature is import, review and export only, and must say so. F-03 decides which case applies.

## Competitor evidence

- Pilots repeatedly fail to get an EFB-built plan into X-Plane's FMS and fall back on third-party
  bridges; the thread is 34 posts long and ends in workarounds.
  https://forums.x-plane.org/forums/topic/283018-getting-a-foreflight-flightplan-in-to-xplane/
- Little Navmap's broad export support — including X-Plane's own FMS format — is called
  best-in-class precisely because it is the one tool that gets a planned route into the sim.
  https://github.com/albar965/littlenavmap
- Navigraph users are frustrated that navdata, charts, moving map and FMS injection are split
  across separate installs; the "Lost in Navigraph" thread is the result.
  https://forums.x-plane.org/forums/topic/304396-lost-in-navigraph/

## Acceptance criteria

- [ ] A valid `.fms` file imports and lists its waypoints in order; a corrupt one produces a named
      error and no partial route.
- [ ] With the simulator disconnected, import, review and export all work and the loading control
      is disabled with a stated reason.
- [ ] After a successful load on a real simulator the reconciliation view shows no difference;
      after a partial load it shows exactly where the two diverge.
- [ ] Exported files open in Little Navmap without manual repair.
- [ ] No raw protocol text appears in the UI; no credential or token appears in logs.

## Risks and open questions

1. **How does a route reach the simulator at all?** Candidates, none chosen: (a) the Avionix
   Connector writes an `.fms` file into X-Plane's FMS plans output folder on the simulator PC and
   the pilot loads it from the CDU; (b) Avionix keys the route through the default-FMS CDU
   commands of F-32; (c) the feature ships as import, review and export only. Each has different
   reliability, permissions and support costs.
2. Approach (a) puts file-system access into the Connector, which today only relays the Web API.
   Is that acceptable, and what does it mean for security, packaging and the pairing model?
3. Approach (b) is slow, order-dependent, hard to verify and depends on unverified command names;
   long routes may defeat it through page scrolling.
4. The exact `.fms` format version X-Plane 12 expects, and the name and location of its plans
   folder, are unverified and must be confirmed on a real installation.
5. Which planning services to support, and how the pilot authenticates to them, is open, with its
   own privacy implications.
6. Without navdata (F-34), Avionix cannot tell a valid waypoint from a typo before loading; the
   simulator rejects it and the pilot blames Avionix.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. https://developer.x-plane.com/article/flight-initialization-api/
3. docs/roadmap/features/F-31-flight-plan-progress.md
4. http://www.dmax3d.com/resources/commands.php (community mirror of Laminar's `Commands.txt`;
   command names taken from it are marked unverified)
5. https://developer.x-plane.com/article/datarefs-for-the-cdu-screen/
6. docs/roadmap/research/efb-moving-map.md, docs/roadmap/research/xplane-web-api.md
