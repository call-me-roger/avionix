# Avionix product roadmap

Status: proposal, 2026-09-15. Scope: product features only. Design and implementation decisions
are deliberately left to each feature's own spec and plan when its stage starts.

Avionix turns phones and tablets into cockpit panels for X-Plane 12. The long-term scope is to
monitor **and** control the aircraft: flight instruments, autopilot, communication, navigation,
surveillance, and aircraft-specific panels, starting with the Boeing 737. This roadmap orders that
scope into stages. Early stages contain what most competitors already offer and what users say
they need first; later stages hold the differentiators.

## How the stages were chosen

Six research reports in `research/` cover about 30 products across five categories: panel
builders (Air Manager, Simionic, RemoteFlight), CDU remotes (WebFMC, AirFMC), remote-control and
instructor apps (X-Plane 12 Control Pad, Flight Deck ONE, Touch Portal and Stream Deck plugins),
EFB and moving-map apps (ForeFlight, Garmin Pilot, Navigraph, Little Navmap), and the 737
home-cockpit ecosystem (ProSim737, Air Manager Zibo packs, GoFlight hardware). A seventh document,
`research/xplane-web-api.md`, maps what the X-Plane 12 Web API can and cannot do, which bounds
every feature below. `research/competitors.md` holds the product table, the feature prevalence
matrix, and the praise and complaint themes with sources.

Three findings drive the ordering:

1. **The most common features across competitors** (prevalence matrix in
   `research/competitors.md`, twelve representative products): a multi-panel layout framework,
   primary flight instruments and COM/NAV radios are each offered by six of twelve; a flight plan
   view by five; an autopilot panel, charts and a 737 CDU by four. The generic ones form Stage 1
   and 2. The flight plan view waits for Stage 3 because the Web API only lets it mirror the
   default FMS, and charts wait for Stage 5 because they need navdata the API does not provide.
2. **The most repeated complaints** are connection friction and silent stale data, breakage after
   X-Plane or add-on updates, lag from image streaming, desktop-sized controls on phone screens,
   and features split across several apps or devices. Stage 1 therefore starts with connection
   health, aircraft compatibility detection, and a panel framework, before any gauge is drawn.
3. **Gaps no competitor fills well**: two-way flight plan sync, a logbook on mobile, a first-class
   Android app, a plugin-free Web API client, and a 737 companion on X-Plane now that ProSim737
   has left the platform. These are the later-stage differentiators.

## Hard limits from the X-Plane Web API

The roadmap only promises what the official API supports (see `research/xplane-web-api.md`):

- DataRefs can be read, written and streamed at about 10 Hz; commands can be pressed or held.
- The default X-Plane FMS exposes its CDU screen as text datarefs. Third-party aircraft (Zibo,
  ToLiss) use their own, undocumented datarefs that change between releases.
- There is no navdata, airport or procedure query, no flight plan upload endpoint, and no weather
  radar imagery. Features that need these either mirror what the sim already shows or rely on the
  Avionix Connector reading files on the X-Plane PC, which each spec lists as an open question.
- DataRef and command ids are scoped to one simulator session, so every name is resolved again on
  each connect; nothing may persist an id.
- The failures array exists but its index map is not documented.

## Stages

Every feature has its own file in `features/`. IDs are stable; stages can move.

### Stage 0 — Foundation (done)

| ID | Feature | File |
|---|---|---|
| F-01 | Connection, connector, pairing and discovery | [features/F-01-connection-foundation.md](features/F-01-connection-foundation.md) |

### Stage 1 — Essential cockpit companion

Goal: a pilot connects in seconds, sees the primary instruments, and tunes radios and the
autopilot from the device. Everything here is offered by most competitors, and the platform
features address the top complaints before they can happen.

| ID | Feature | Why now | File |
|---|---|---|---|
| F-02 | Connection health and diagnostics | Connection friction is the number-one complaint in every category | [F-02](features/F-02-connection-health.md) |
| F-03 | Aircraft identification and compatibility layer | Breakage after updates and silent failures are the number-two complaint | [F-03](features/F-03-aircraft-compatibility.md) |
| F-04 | Panel framework and layouts | Phone-sized controls and single-app multi-panel use | [F-04](features/F-04-panel-framework.md) |
| F-10 | Primary flight instruments | Offered by nearly every panel app | [F-10](features/F-10-primary-flight-instruments.md) |
| F-11 | Flight data strip | Cheap, always useful, feeds the map and logbook later | [F-11](features/F-11-flight-data-strip.md) |
| F-20 | Autopilot panel | Second most requested control after the CDU | [F-20](features/F-20-autopilot-panel.md) |
| F-21 | COM and NAV radios | Radio stacks are the most common control panel; keypad entry is praised | [F-21](features/F-21-com-nav-radios.md) |
| F-22 | Transponder | Always paired with radios in competitor apps | [F-22](features/F-22-transponder.md) |

Exit criteria: a default X-Plane aircraft can be flown from takeoff to landing with the app
providing instruments, autopilot and radios, on iOS and Android, with the connection state
always visible.

### Stage 2 — Complete generic cockpit

Goal: cover the remaining panels every general-aviation and default-airliner pilot expects, still
aircraft-agnostic.

| ID | Feature | Why now | File |
|---|---|---|---|
| F-05 | Demo mode | Avoids "worthless without a simulator" reviews; lets stores and friends try the app | [F-05](features/F-05-demo-mode.md) |
| F-12 | Engine and systems monitoring | Standard in panel builders; second screen for engine gauges is a common use | [F-12](features/F-12-engine-systems-monitoring.md) |
| F-23 | Audio panel | Completes the radio stack | [F-23](features/F-23-audio-panel.md) |
| F-24 | Aircraft systems controls | Lights, gear, flaps, trim: the button-box use case of Touch Portal and Stream Deck | [F-24](features/F-24-aircraft-systems-controls.md) |
| F-30 | HSI, CDI and navigation indicators | Needed to use the NAV radios for real | [F-30](features/F-30-hsi-cdi-indicators.md) |
| F-32 | CDU remote for the default X-Plane FMS | The most requested remote panel; the default FMS is fully supported by the API | [F-32](features/F-32-default-fms-cdu.md) |

### Stage 3 — Situational awareness and power users

| ID | Feature | Why now | File |
|---|---|---|---|
| F-13 | Moving map with ownship | The EFB category's core; needs internet tiles but no navdata | [F-13](features/F-13-moving-map.md) |
| F-31 | Flight plan progress view | Read-only progress from the default FMS | [F-31](features/F-31-flight-plan-progress.md) |
| F-40 | TCAS traffic display | Surveillance scope; TCAS datarefs are documented | [F-40](features/F-40-tcas-traffic.md) |
| F-06 | Custom controls and profiles | Power-user demand seen in Touch Portal, Stream Deck and Air Manager | [F-06](features/F-06-custom-controls.md) |
| F-25 | Simulator control and instructor station | Failure injection and environment control are loved by instructors | [F-25](features/F-25-sim-control-instructor.md) |

### Stage 4 — Boeing 737 and flight records

Goal: the first aircraft-specific package. Zibo is the community baseline every third-party tool
supports; ProSim737 no longer supports X-Plane, so nothing polished serves 737 builders there.

| ID | Feature | Why now | File |
|---|---|---|---|
| F-50 | 737 Mode Control Panel | Most requested 737 panel after the CDU | [F-50](features/F-50-737-mcp.md) |
| F-51 | 737 CDU | Most requested 737 panel; depends on Zibo exposing CDU text | [F-51](features/F-51-737-cdu.md) |
| F-52 | 737 EFIS control panel | Always bundled with the MCP | [F-52](features/F-52-737-efis-panel.md) |
| F-55 | Checklists and flows | Praised in flyPadOS 3; useful on every aircraft | [F-55](features/F-55-checklists.md) |
| F-14 | Flight recorder, logbook and replay export | Underserved on mobile; ForeFlight users need third-party tools | [F-14](features/F-14-flight-recorder-logbook.md) |

### Stage 5 — Differentiators and deep aircraft coverage

| ID | Feature | File |
|---|---|---|
| F-53 | 737 overhead panel | [F-53](features/F-53-737-overhead.md) |
| F-54 | 737 pedestal | [F-54](features/F-54-737-pedestal.md) |
| F-56 | Performance and weight and balance | [F-56](features/F-56-performance-weight-balance.md) |
| F-57 | Airbus (ToLiss) FCU and MCDU | [F-57](features/F-57-airbus-fcu-mcdu.md) |
| F-33 | Flight plan import and export | [F-33](features/F-33-flight-plan-import-export.md) |
| F-34 | Charts and navdata integration | [F-34](features/F-34-charts-navdata.md) |
| F-41 | Weather radar and weather awareness | [F-41](features/F-41-weather-awareness.md) |
| F-26 | Voice commands | [F-26](features/F-26-voice-commands.md) |
| F-07 | Multi-device layouts and roles | [F-07](features/F-07-multi-device-layouts.md) |

## Principles carried into every feature

- **Native rendering from datarefs, never streamed images.** Air Manager's worst lag reports came
  from streamed gauges.
- **Visible compatibility.** When the loaded aircraft lacks a dataref, the panel says so; nothing
  fails silently. Aircraft profiles are versioned.
- **One app, many panels, any device.** No feature is split into a separate purchase or a second
  device, and Android is a first-class target.
- **Controls confirm state.** A control reads the sim's value back; a tap never assumes success.
- **Plugin-free.** Only the Web API and the Avionix Connector; no in-sim plugin.
- **Usable without the sim.** Demo mode and clear positioning prevent "worthless" reviews.

## Out of scope for this roadmap

Accounts and cloud sync, real-world aviation use, navdata subscriptions sold by Avionix, an X-Plane
plugin, and support for X-Plane 11 or other simulators.

## Reading the prevalence figures

Each feature file states two prevalence figures: the count from the twelve-product matrix in
`research/competitors.md`, which is comparable across features, and the writer's wider count over
the products named in the relevant reports, which is not. Use the matrix count to compare
features; use the wider count to see which products to study for a feature.

## Maintaining this roadmap

Each stage starts with a brainstorming session that turns its feature files into a design spec and
a plan (`docs/superpowers/`). When a feature ships, set its Status to "Done" and link the spec.
Re-run the competitor research when a stage closes; the reports are dated.
