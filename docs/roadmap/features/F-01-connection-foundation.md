# Connection, connector, pairing and discovery

| Field | Value |
|---|---|
| ID | `F-01` |
| Stage | `0` |
| Category | Platform |
| Status | Done |
| Depends on | none |
| Competitor prevalence | Of the 13 remote-control and panel products researched, all but Flight Deck ONE (which claims plugin-free auto-discovery over UDP) need a companion plugin/bridge or a hand-typed host address; only Remote X-Plane Avionics uses the official Web API with no plugin |

## Summary

A pilot on a phone, tablet or browser can reach a running X-Plane 12 on the same network, see live
simulator values and send a value and a command back. This is the platform every other feature
sits on: find the simulator, pair with it, negotiate the API, keep the stream alive, and say
clearly what failed when it fails.

## Why now

Stage 0. Setup and connection friction is the most-cited complaint in all three competitor
reports, so the first thing to prove is that the link works, recovers and explains itself.

## User stories

- As a simmer, I want the app to find my simulator PC by itself so that I need no IP address.
- As a simmer, I want one short code to authorise my device so that the link is not open to
  everyone on the network.
- As a simmer, I want automatic reconnection so that a panel does not go dead mid-flight.

## Scope

### In scope
- Enter host and port (default 8080), connect, disconnect; the choice is remembered.
- Find Avionix Connectors on the local network and connect with one tap (development build only).
- Detect the X-Plane version and negotiate the highest shared Web API version (v2 or v3).
- Resolve DataRefs and commands by name on every connect; ids are never stored.
- Subscribe to values over WebSocket, write a value, activate a command.
- Bounded automatic reconnect after an unexpected socket loss, and a diagnostics panel naming the
  step that failed.
- Pairing with a six-digit code and one bearer token per connector, stored per host and port.
- The web target reaches X-Plane through the connector, which also serves the exported web app.

### Out of scope (this feature)
- Link-quality and staleness reporting (`F-02`), aircraft compatibility (`F-03`), any avionics
  panel, device role or layout (`F-04`, `F-07`).

## Functional requirements

R1. Connecting runs a fixed sequence and records each step: connector probe, capabilities, version
negotiation, WebSocket open, name resolution, subscription.
R2. If the connector requires pairing and the device holds no token, the app asks for the code and
stores the returned token for that host and port; a rejected token clears it and asks again.
R3. A wrong code keeps the pairing prompt with a plain message; repeated wrong codes report a rate
limit, not an HTTP status.
R4. After an unexpected socket loss the app retries with backoff a bounded number of times, then
reports an error state the user can retry from. Every attempt re-resolves names, as ids are
session-scoped.
R5. A name that does not resolve is reported as not found, naming the DataRef or command.
R6. At the X-Plane main menu, with no flight loaded, the app reports that the simulator is not
ready rather than a lookup failure.
R7. Raw protocol errors, URLs and HTTP status codes never reach the UI; each failure maps to a
stable app-level error code with a readable message.
R8. Pairing codes and tokens are never written to logs or diagnostics output.
R9. Discovered connectors list name, address and whether pairing is needed; the list clears when
the app connects or goes to the background.
R10. Where discovery is unavailable (Expo Go, web), the app says so and keeps the typed host.

## X-Plane Web API mapping

Updates arrive at about 10 Hz, changed values only; every later feature inherits that ceiling.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Heartbeat | `sim/time/total_running_time_sec` | float, seconds | Read | docs/xplane.md (Laminar DataRefs.txt) |
| Live value | `sim/cockpit2/gauges/indicators/airspeed_kts_pilot` | float, knots | Read | docs/xplane.md |
| Write proof | `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot` | float, degrees magnetic | Write | docs/xplane.md |
| Command proof | `sim/autopilot/heading_up` | command | Activate | docs/xplane.md |

## Aircraft compatibility

All four names are Laminar defaults and resolve on any aircraft once a flight is loaded. No
add-on-specific handling exists yet; see `F-03`.

## Competitor evidence

- Setup friction, including manual plugin installs and a VPN silently blocking the link, is the
  most common pain point — https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
- WebFMC's reviewer calls getting the data to the device "the hard part" —
  https://www.x-plained.com/utility-review-green-arc-studios-webfmc/
- Remote X-Plane Avionics runs on the official Web API with no plugin and shows an operator
  console with connection status —
  https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/

## Acceptance criteria

- [ ] Mock server: each step is visible, and each induced failure names its step and error code.
- [ ] Real simulator: connect, read live values, write the heading bug, activate the command.
- [ ] Pull the network: the app reconnects within the retry budget.
- [ ] Pair, restart the app, confirm no second code is asked for; logs hold no code or token.

## Risks and open questions

- X-Plane's server binds to localhost and is unauthenticated, so the connector is required for
  every non-local device; Laminar's planned LAN access will need reconciling.
- Discovery needs a native module, so Expo Go and the web cannot offer it.
- iOS gives no signal when local-network permission is denied, so denial looks like an empty list.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. docs/xplane.md, docs/connector.md, docs/architecture.md, README.md
3. docs/superpowers/specs/2026-09-14-avionix-mvp-design.md
4. docs/superpowers/specs/2026-09-15-app-pairing-design.md
5. docs/superpowers/specs/2026-09-15-connector-discovery-design.md
6. docs/roadmap/research/panel-builders.md, remote-control-apps.md, xplane-web-api.md
7. https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
8. https://www.x-plained.com/utility-review-green-arc-studios-webfmc/
