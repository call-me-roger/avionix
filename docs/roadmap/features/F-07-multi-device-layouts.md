# Multi-device layouts and roles

| Field | Value |
|---|---|
| ID | `F-07` |
| Stage | `5` |
| Category | Platform |
| Status | Proposed |
| Depends on | `F-04` |
| Competitor prevalence | Matrix count 4 of 12 representative products (`research/competitors.md`). Wider set: 5 of 13 remote-control and panel products researched support several devices at once (Air Manager, Simionic G1000 PFD plus MFD, AirFMC's copilot multicast, WebFMC, Remote X-Plane Avionics); none of them gives a device a name or a role, and Simionic's split across two paid apps and two iPads is a named complaint |

## Summary

A simmer with more than one device can give each one a job: this tablet is the pilot's primary
flight display, that phone is the radio stack, the old tablet by the throttle is the overhead.
Each device is named, remembers its role, and shows the panels for it as soon as it connects. A
layout built on one device can be exported and applied to another, so a two- or three-screen setup
is arranged once rather than rebuilt per device.

## Why now

Stage 5. It is a differentiator rather than table stakes: it only pays off once there are enough
panels for the split to be worth making, and every device already connects independently today.
The research supports the demand and the shape of it. Air Manager users run panels across three
tablets, AirFMC offers a multicast mode so a second device can serve a copilot station, and
Simionic's PFD and MFD are two apps needing two iPads, which reviewers call out as friction and
the reports name as the mistake to avoid. What no researched product offers is naming a device or
giving it a role, which is exactly the part that makes a multi-device setup survive a restart.

## User stories

- As a home-cockpit builder with three tablets, I want each one to come up showing its own panels
  so that I do not rearrange them every session.
- As a simmer flying with a friend in the right seat, I want their device to show the panels they
  need, not a copy of mine.
- As a simmer, I want to tell my devices apart by name, and to copy a layout I arranged once to
  another device rather than repeat the work.

## Scope

### In scope
- A user-supplied name per device, shown in the app and used wherever devices are listed.
- A role per device: a named selection of panels and their order, which the device restores on
  launch and after a reconnect.
- Predefined roles as starting points, plus user-defined ones, and export of a role or a whole
  layout from one device for import on another.
- Devices operating independently: each holds its own session, its own pairing token and its own
  subscriptions, and one device failing changes nothing for the others.
- A visible indication of which device is playing which part.
- A lone device needs no role and is never asked to pick one before it can be used.

### Out of scope (this feature)
- Any Avionix server or cloud account; the app has neither and this feature does not add one.
- Real-time mirroring of one device's panel state onto another, or sharing one device between two
  users with separate settings.
- Multi-device demo mode (`F-05`) and per-device theming beyond what `F-04` covers.

## Functional requirements

R1. A device has a user-editable name, defaulting to something identifiable but not to anything
that identifies the user personally.
R2. A device has at most one role at a time; the role determines which panels are present and in
what order.
R3. A role is restored automatically on launch and after a reconnect, without the user choosing
again.
R4. Changing the role on one device never changes another device's role.
R5. A role that names a panel the device cannot support, for instance a tablet-only panel on a
phone, imports successfully and reports which panels were not applied (`F-04`).
R6. A role that names a panel unavailable on the loaded aircraft shows that panel as unavailable
with its reason rather than removing it silently (`F-03`).
R7. Export produces a file containing role names, panel selections and order, and nothing else: no
host, port, pairing code, token or device identifier.
R8. Import shows what the layout contains and which device it will be applied to, and requires
explicit acceptance; import never changes the connection settings.
R9. When a device is disconnected, its role and name persist and its panels behave as `F-04`
requires when disconnected.
R10. Every device connects on its own; no device depends on another being present, and the app
never blocks because a device named in a layout is absent.
R11. The app states plainly that each device pairs with the connector separately, and never
transfers a token between devices.
R12. Nothing here displays raw protocol errors, and nothing it exports or displays contains a
token or pairing code.

## X-Plane Web API mapping

This feature reads and writes nothing from the simulator. It changes which panels a device
presents, and those panels carry their own mapping. The relevant API property is that per-
connection bookkeeping is independent, so several devices can subscribe simultaneously without
interfering; each device pays the same about-10 Hz update budget on its own.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Feature's own data | none | — | — | — |
| Independent subscriptions per device | `dataref_subscribe_values` per connection | ~10 Hz, delta only | Read | docs/xplane.md, docs/architecture.md |
| Per-device authorisation | one bearer token per device per connector | — | — | docs/connector.md |

## Aircraft compatibility

Aircraft-independent. A role may include aircraft-specific panels; those are governed by `F-03`
and simply report unavailable when the loaded aircraft is not the one they are for, which lets one
layout survive a change of aircraft.

## Competitor evidence

- An Air Manager user reports running panels on three tablets with no problems, and the product
  explicitly supports panels across several tablets and PCs at once —
  https://siminnovations.com/air-manager/
- AirFMC supports a second MCDU for a copilot station over multicast, so two tablets can show the
  same or paired CDU, and reviewers praise it for two-seat home cockpits —
  https://www.x-plained.com/utility-review-haversine-airfmc/
- Simionic needs two iPads and two purchases to run the PFD and MFD together, which users call out
  directly — https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787
- The reports conclude that splitting functionality across several paid apps and devices creates
  real friction, and that one device should be able to host several panels —
  docs/roadmap/research/panel-builders.md
- Remote X-Plane Avionics supports multiple simultaneous device connections on the LAN and shows
  an operator console listing them —
  https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/

## Acceptance criteria

- [ ] Name two devices, give each a different role, restart both, and confirm each returns to its
      own role.
- [ ] Confirm changing one device's role leaves the other unchanged.
- [ ] Export a layout, import it on a second device, and confirm the review step lists the panels
      and requires acceptance.
- [ ] Inspect the exported file and confirm it contains no host, token, pairing code or device id.
- [ ] Import a tablet layout onto a phone and confirm unsupported panels are reported, not
      silently dropped.
- [ ] Run two devices against one simulator and confirm neither affects the other's values,
      including when one is disconnected mid-flight.

## Risks and open questions

- How is a layout moved between devices? A file the user passes across is the simplest honest
  answer; anything automatic implies a service or a connector-side store, which is a decision this
  spec deliberately leaves open.
- Should the connector list the devices paired with it by name, and if so, does that mean a device
  sending its name to the connector, which is new information the connector does not hold today?
- How many devices can subscribe to one X-Plane instance before the simulator or the connector
  becomes the bottleneck? Not measured; the Web API documents no device limit.
- Should roles be tied to aircraft as well as to devices, or does that multiply configuration
  beyond what anyone will maintain?
- Does anything about several devices writing the same DataRef need arbitration, or is
  last-write-wins acceptable as it is in the simulator itself?

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. docs/architecture.md (Multi-device), docs/connector.md, docs/xplane.md
3. docs/roadmap/research/panel-builders.md, fmc-cdu-apps.md, remote-control-apps.md
4. https://siminnovations.com/air-manager/
5. https://www.x-plained.com/utility-review-haversine-airfmc/
6. https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787
7. https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/
