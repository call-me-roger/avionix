# Simulator control and instructor station

| Field | Value |
|---|---|
| ID | `F-25` |
| Stage | `3` |
| Category | Control |
| Status | Proposed |
| Depends on | `F-04` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 3 of 15 products researched offer it (X-Plane 12 Control Pad, SimControlX, FS-FlightControl) |

## Summary

An instructor's view of the simulator itself rather than of the aircraft: pause and resume,
simulator rate, time of day, weather presets, repositioning the aircraft, injecting failures, and
taking a screenshot. It is for the person running the session, whether that is
the pilot setting up a practice approach or an instructor beside them.

## Why now

Stage 3, after the cockpit panels. This is the one category where Laminar's own app already sets the
bar, and where the research found the clearest praise of any feature in the survey: instructors love
failure injection. It depends only on F-04 but deliberately comes after the flying
features, because an instructor station is a different job from a cockpit panel and should not
dilute the core product before that core is complete.

## User stories

- As an instructor, I want to fail an engine on takeoff without the student seeing me set it up.
- As a simmer practising approaches, I want to reposition the aircraft to a fix and set the weather
  and time of day in one place, so that I can fly the same approach repeatedly.

## Scope

### In scope
- Pause and resume, showing the simulator's actual paused state.
- Simulator rate, showing the current rate.
- Time of day, set either as a clock time or as one of the simulator's named presets.
- Weather, set from the presets the simulator's own flight configuration offers, with the current
  conditions at the aircraft for reference.
- Repositioning the aircraft to a runway, a ramp position or a latitude and longitude, on the ground
  or in the air, where the simulator version supports it.
- Failure injection and clearing, restricted to failures that can be named and confirmed.
- Taking a screenshot on the simulator machine, and a clear statement of which of the above the
  connected simulator version supports.

### Out of scope (this feature)
- Changing the loaded aircraft or the start location mid-flight: these "require starting a new
  flight" [2].
- Replay transport and flight recording (F-14); the moving map and traffic display (F-13, F-40).
- Weather radar returns, unreachable through the Web API (`docs/roadmap/research/xplane-web-api.md`,
  risk 6); weight, balance and fuel loading (F-56).

## Functional requirements

R1. Every displayed state comes from the subscription stream or from the simulator's own response to
a request. Nothing is shown as current because the app asked for it.

R2. Pause, rate and time changes are confirmed by reading the resulting state back. If the state
does not change within a bounded time, the pilot is told the simulator did not respond.

R3. Repositioning, weather, time and failure actions are confirmed by the pilot before they are
sent, because a second tap does not reverse them.

R4. Repositioning is offered only when the connected simulator reports a Web API version that
includes flight initialization, which requires X-Plane 12.4.0 or newer [2]. On older versions the
control is absent with a one-line explanation naming the required version, not an error.

R5. Failures are offered only where a failure can be named and its state read back. Any failure that
would require guessing an index into the undocumented failures array is not offered.

R6. Clearing all failures is available whenever failure injection is, as one confirmed action.

R7. If a command or dataref cannot be resolved, only that control is unavailable with a short
explanation; the rest keeps working. A write refused as read-only is treated the same way.

R8. While disconnected, all states are marked stale with the time of the last update and all
controls are inert. Nothing is queued or replayed on reconnect.

R9. On reconnect all names are resolved again before any state is shown, because ids are valid for
one simulator session only.

R10. Errors appear as plain sentences with a next step. Protocol codes, dataref ids, host addresses
and pairing tokens never appear in the UI and are never logged.

## X-Plane Web API mapping

States are read over the WebSocket subscription; simple actions use command activation; the flight
setup actions use the versioned flight resource over REST.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Paused state | `sim/time/paused` | int, 1 when paused | Read | [3], community catalogue (unverified) |
| Pause and resume | `sim/operation/pause_toggle` | command | Write | [3], community catalogue (unverified) |
| Heartbeat, to tell a paused sim from a dead link | `sim/time/total_running_time_sec` | float, seconds | Read | [4] |
| Screenshot | `sim/operation/screenshot` | command | Write | [3], community catalogue (unverified) |
| Failures array | `sim/operation/failures/failures` | int[564], one slot per modelled failure | Read/Write | [3], forum-sourced; index map undocumented |
| Regional weather controls | `sim/weather/region/change_mode`, `variability_pct`, `update_immediately`, `atmosphere_alt_levels_m` | writable weather region controls | Read/Write | [1] |
| Weather at the aircraft | `sim/weather/aircraft/*` | read-only local conditions | Read | [1] |
| Simulator rate | not identified; verify in `DataRefs.txt` | expected float multiplier | Read/Write | — |
| Reposition, time, weather, named failures | flight initialization resource, v3, X-Plane 12.4.0+: `runway_start`, `ramp_start`, `lle_ground_start`, `lle_air_start`; `use_real_weather` or a weather definition; `use_system_time`, `local_time`, `gmt_time` or `time_enum` (`day`, `sunset`, `evening`, `night`); `operation_failures` entries of `name` and `status`; `fix_everything` | JSON request body | Write | [2] |

Honest scope. The index-to-failure mapping of `sim/operation/failures/failures` "is not fully
documented by Laminar" (`docs/roadmap/research/xplane-web-api.md`, section B and risk 8), so Avionix
must not write arbitrary indexes into that array. The flight initialization resource accepts
failures by name instead [2], which is why R5 restricts failures to what can be named. Separately,
no navdata endpoint exists, so repositioning offers no airport, runway or fix search: identifiers
are typed or coordinates given (risk 5).

## Aircraft compatibility

This feature is about the simulator, not the aircraft, so it behaves the same whichever aircraft is
loaded. The exception is failures: which systems can fail depends on what the loaded aircraft
models, so the available set is determined per aircraft and any failure that cannot be confirmed on
the loaded aircraft is not offered. Repositioning depends on the simulator version, not the
aircraft.

## Competitor evidence

- Laminar's own instructor app draws the strongest praise in the whole survey for exactly this:
  "Great for instructing... fantastic to throw issues at a pilot, like a bird strike" —
  https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
- A pilot with 20,000+ hours says of SimControlX that it "does exactly what I want it to do",
  specifically for practising engine failures on takeoff —
  https://apps.apple.com/us/app/simcontrolx/id1380341055
- The complaints to avoid are a network feature that breaks silently under a VPN with no in-app
  diagnostic, and an interface reviewers called "not intuitive" —
  https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/

## Acceptance criteria

- [ ] Pause shows the simulator's own paused state, and a frozen heartbeat is distinguished from a
      lost connection.
- [ ] Against a mock reporting X-Plane 12.1.4, repositioning is absent with a one-line explanation
      naming 12.4.0, and no request is sent.
- [ ] No request writes an index into the failures array that Avionix cannot name.
- [ ] Clear-all-failures is available whenever failure injection is, and the aircraft returns to a
      serviceable state on a real simulator.
- [ ] Disconnecting marks states stale, disables controls, and leaves no token, id or host address
      in the logs.

## Risks and open questions

- The pause and screenshot command names come from a third-party catalogue, not from Laminar, and
  must be verified in the in-sim `Commands.txt` before use.
- The simulator rate dataref was not identified in this research.
- The set of valid `operation_failures` names is not enumerated in the documentation and must be
  established in the simulator; until it is, R5 keeps the failure list empty rather than guessing.
- Open questions: which weather presets to offer and whether custom weather is in scope; whether the
  screenshot can be retrieved to the device or only taken on the simulator machine.
- Ids are session-scoped and must never be persisted (`docs/roadmap/research/xplane-web-api.md`,
  risk 4).

## References

1. https://developer.x-plane.com/article/weather-datarefs-in-x-plane-12/
2. https://developer.x-plane.com/article/flight-initialization-api/
3. `docs/roadmap/research/xplane-web-api.md`, section B, citing
   https://siminnovations.com/wiki/index.php?title=Xplane_commandrefs and
   https://forums.x-plane.org/forums/topic/39013-failure-dataref/
4. `docs/xplane.md`
5. https://developer.x-plane.com/article/x-plane-web-api/
6. `docs/roadmap/research/remote-control-apps.md`
