# Connection health and diagnostics

| Field | Value |
|---|---|
| ID | `F-02` |
| Stage | `1` |
| Category | Platform |
| Status | Proposed |
| Depends on | `F-01` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 1 of 13 remote-control and panel products researched ships a visible connection-status view (Remote X-Plane Avionics' operator console); the rest expose no link health, and silent stale data is a named complaint against ForeFlight, Air Manager and the X-Plane Control Pad |

## Summary

While a panel is on screen the pilot can tell at a glance whether what they are looking at is
live. Avionix shows link state, how fresh the values are, and whether the simulator is paused or
between flights, and when something breaks it says which step failed in plain language. This runs
on every device, in every flight phase, behind whatever panel is in front.

## Why now

Stage 1, immediately after the connection itself. Connection friction is the biggest recurring
pain point in the category, and its worst form is not a visible failure but a panel showing a
frozen number: ForeFlight users reported landing and sitting on the ground for minutes before the
map caught up, and Air Manager users watched delay grow from one second to thirty over a flight.
Every feature after this one is only trustworthy if the pilot can see that the link is.

## User stories

- As a pilot flying an approach, I want to know instantly that my readouts are stale so that I do
  not act on a frozen number.
- As a simmer whose connection dropped, I want to see that the app is retrying and how many
  attempts are left so that I do not restart everything for nothing.
- As a simmer who cannot connect at all, I want to be told which step failed and what to try so
  that I do not have to read a forum thread.

## Scope

### In scope
- A link state the pilot can always reach: connected, reconnecting, paired but simulator not
  ready, disconnected, failed.
- Value freshness: the age of the most recent update from the simulator, and a staleness threshold
  past which readouts are marked as not live.
- Round-trip responsiveness of the link, measured from a request the app already makes.
- Distinguishing "the simulator is paused" and "no flight is loaded" from "the link is broken".
- A diagnostics view listing the connect steps with their outcome, the app-level error code, and
  the connector and X-Plane versions in use.
- One-touch retry and disconnect from the diagnostics view.
- A shareable text summary of the diagnostics for support requests, with no secrets in it, and
  guidance per failure cause: traffic disabled, simulator too old, no flight loaded, wrong host,
  connector unreachable, token rejected.

### Out of scope (this feature)
- Per-DataRef availability on the loaded aircraft; that is the compatibility report in `F-03`.
- How individual panels render their own stale state; the rule lives here, the presentation with
  the panel framework (`F-04`).
- Any cloud reporting or crash telemetry.

## Functional requirements

R1. The current link state is visible from any panel without leaving it, and updates within one
second of a state change.
R2. The app records the time of the most recent simulator update and exposes its age.
R3. When no subscribed value has changed for longer than the staleness threshold, and the
simulator is not known to be paused, the link is marked stale and every readout sourced from it is
marked not live.
R4. The heartbeat DataRef is used to tell a paused or unattended simulator from a dead link: when
it stops advancing but the socket is open, the app reports paused rather than stale.
R5. When the simulator has no flight loaded, the app reports that state by name and keeps the link
open, retrying resolution rather than failing.
R6. During reconnection the app shows that it is retrying, the attempt number and the retry
budget; when the budget is exhausted it moves to a failed state offering retry.
R7. The diagnostics view lists every connect step with pass, fail or not reached, and for a
failure shows the app-level error code, a one-line cause and a suggested action.
R8. When a DataRef or command required by an active panel cannot be resolved, the diagnostics view
names it and the panel it belongs to.
R9. No raw HTTP status, URL, exception text or protocol payload is displayed anywhere, including
the shareable summary.
R10. Pairing codes and bearer tokens never appear in the diagnostics view, the shareable summary
or any log.
R11. When disconnected, the diagnostics view still shows the last known state, the time of the
last successful connection and the reason it ended.

## X-Plane Web API mapping

Subscribed values arrive at about 10 Hz and only when they change, so "no message" is normal and
cannot by itself mean a broken link. The heartbeat below is the discriminator: it advances
whenever the simulator is running, including parked at the gate.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Link alive and simulator running | `sim/time/total_running_time_sec` | float, seconds | Read | docs/xplane.md (Laminar DataRefs.txt) |
| Paused state (cross-check) | `sim/time/paused` | int, 0/1 (unverified) | Read | docs/roadmap/research/xplane-web-api.md, community catalogue https://siminnovations.com/wiki/index.php?title=Xplane_commandrefs |
| Simulator and API versions | `GET /api/capabilities` | JSON | Read | docs/xplane.md |
| Flight loaded check | `GET /api/v3/datarefs/count` | int | Read | docs/xplane.md |
| Connector identity and reachability | `GET /avionix/info` | JSON | Read | docs/connector.md |

`sim/time/paused` is community-sourced and must be confirmed against `DataRefs.txt` before use;
until then the heartbeat freezing is the primary paused signal.

## Aircraft compatibility

Everything here reads Laminar datarefs and connector endpoints, so it behaves identically on
default aircraft and on every add-on. Aircraft changes do not affect it beyond triggering the
re-resolution reported in `F-03`.

## Competitor evidence

- ForeFlight users report position lag so severe they can be "on the ground for sometimes up to 5
  minutes" before the map updates, with no in-app indication —
  https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight
- X-Plane and ForeFlight connections dropping after ten seconds generated a dedicated support
  thread —
  https://forums.x-plane.org/forums/topic/307366-xplane-12-and-foreflight-looses-connection-after-10-secs/
- After X-Plane 12.4.0, Air Manager users saw delay grow from about one second to thirty over a
  flight — https://siminnovations.com/forums/viewtopic.php?p=64256
- The X-Plane Control Pad fails to connect while a VPN is active, with no diagnostic message —
  https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
- Remote X-Plane Avionics ships an operator console showing connection status and network
  addresses, the one positive example found —
  https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/
- Reviewers of EFB integrations recommend a visible link-accuracy and last-update readout so users
  can self-diagnose a stale connection — docs/roadmap/research/efb-moving-map.md

## Acceptance criteria

- [ ] Mock server: stop sending updates and confirm the link is marked stale within the threshold
      and readouts are marked not live.
- [ ] Mock server: freeze the heartbeat with the socket open and confirm the app reports paused,
      not stale.
- [ ] Mock server: force a failure at each connect step and confirm the diagnostics view names the
      step, the error code and an action.
- [ ] Real simulator: pause X-Plane, confirm paused is reported; return to the main menu, confirm
      the not-ready state is reported and the link stays open.
- [ ] Pull the Wi-Fi mid-flight: retry progress is visible and recovery restores live readouts.
- [ ] The shareable summary contains no token, no pairing code, no URL and no raw error text.

## Risks and open questions

- What staleness threshold is right? Updates are delta-only at about 10 Hz, so a genuinely
  constant value produces no traffic; the threshold must be validated on a parked aircraft.
- Is a paused simulator reliably detectable from the heartbeat alone, or is `sim/time/paused`
  needed? Verify both in the sim.
- Should responsiveness be shown as a number or as a coarse quality band? A number invites
  comparison; a band may be more honest given the 10 Hz ceiling.
- How much history should the diagnostics view keep across a session, and does keeping it risk
  retaining anything sensitive?

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. docs/xplane.md, docs/connector.md, docs/architecture.md
3. docs/roadmap/research/xplane-web-api.md, efb-moving-map.md, panel-builders.md,
   remote-control-apps.md
4. https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight
5. https://forums.x-plane.org/forums/topic/307366-xplane-12-and-foreflight-looses-connection-after-10-secs/
6. https://siminnovations.com/forums/viewtopic.php?p=64256
7. https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
8. https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/
9. https://siminnovations.com/wiki/index.php?title=Xplane_commandrefs
