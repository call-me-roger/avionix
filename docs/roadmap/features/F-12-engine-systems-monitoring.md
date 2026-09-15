# Engine and systems monitoring

| Field | Value |
|---|---|
| ID | `F-12` |
| Stage | `2` |
| Category | Monitoring |
| Status | Proposed |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 5 of 28 products researched cover engine or electrical values (Air Manager via community gauges, Touch Portal XP-FlightDeck, Flight Deck ONE, FS-FlightControl, SimControlX); no mobile X-Plane app ships a general engine page |

## Summary

An engine and systems page that adapts to the aircraft: RPM, N1 and N2, manifold pressure, EGT, CHT
and ITT, fuel flow, fuel quantity per tank, oil pressure and temperature, and electrical bus volts
and amps. Avionix reads the engine count and engine type from the simulator and shows only the
gauges that type has, for only the engines that exist. Used on the ground during start and run-up,
and in flight for cruise setting and for spotting a problem.

## Why now

Stage 2 completes the generic cockpit: with F-10 and F-11 in place, engine values are the remaining
half of a scan. It is the first feature that forces the aircraft compatibility layer (F-03) to do
real work, because a piston single, a turboprop twin and a four-engine jet need different gauges from
the same DataRef arrays. That adaptation is reused by F-53 and F-56.

## User stories

- As a piston pilot, I want RPM, manifold pressure, EGT, CHT and oil values so that I can lean the
  mixture and watch for a problem; as a turbine pilot I want N1, N2, ITT and fuel flow instead.
- As a pilot of a twin, I want each engine side by side so that I can compare them at a glance, and
  quantity per tank rather than only a total so that I can manage an imbalance.
- As a pilot of an add-on that does not publish these values, I want to be told that clearly rather
  than shown zeros.

## Scope

### In scope
- Detecting engine count, engine type and tank count from the simulator, and building the page from
  them.
- Per engine: RPM, propeller RPM, N1, N2, manifold pressure, torque, EPR, EGT, CHT, ITT, fuel flow,
  oil pressure, oil temperature. Per tank: fuel quantity. Electrical: bus volts and load, battery
  volts and amps.
- Unit selection consistent with F-11, a per-value staleness mark, and a clear statement of which
  gauges the loaded aircraft does not publish.

### Out of scope (this feature)
- Controlling anything: throttles, mixture, magnetos, starters, pumps, generators and bus switching
  are F-24; 737 overhead systems are F-53. Failure injection: F-25. Total fuel on the strip: F-11.
- Hydraulics, pneumatics, pressurisation, anti-ice and APU.
- Caution and warning logic, limit exceedance alerting, or any advice about what a value means.

## Functional requirements

R1. On connect and on every aircraft change, Avionix reads the engine count, per-engine type and tank
count and builds the page from them, showing only engines and tanks that exist.

R2. The gauges shown per engine follow the engine type: a carburetted or injected piston shows RPM,
manifold pressure, EGT, CHT; a turboprop shows torque, propeller RPM, ITT, N1; a jet shows N1, N2,
ITT or EGT and EPR. Oil pressure, oil temperature and fuel flow are shown for every type.

R3. Values update over the WebSocket subscription at up to the Web API rate of about 10 Hz. Fuel is
shown per tank and as a total that agrees with F-11. Units are labelled and the choice persists.

R4. EGT, ITT and oil temperature are labelled with the unit the simulator reports; Avionix does not
assume Celsius. Where the unit cannot be determined it is marked unknown rather than guessed.

R5. Each value shows its age and is marked stale past a defined threshold. On disconnect the page is
marked disconnected and keeps its last values marked stale, never zeroed. With no flight loaded and
no DataRefs exposed, the page says so and shows no values.

R6. A DataRef missing on the loaded aircraft marks only the gauges depending on it unavailable, in
plain language, and the rest keeps working; a default is never substituted. If the engine count
itself cannot be read, the page says the aircraft could not be identified and shows nothing else.

R7. Raw protocol errors, DataRef ids, HTTP status codes and WebSocket error codes never appear on
this page; they go to the diagnostics view (F-02).

R8. Pairing tokens are never logged and never shown on screen.

R9. The page writes no DataRef and activates no command.

## X-Plane Web API mapping

Names verified against Laminar's DataRef list at developer.x-plane.com/datarefs. Engine values are
arrays; Avionix subscribes to the whole array and reads indices 0 to `acf_num_engines - 1`. REST
reads may use `?index=n`. All values are read over one `dataref_subscribe_values` subscription at
about 10 Hz.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Engine count | `sim/aircraft/engine/acf_num_engines` | int, count | Read | datarefs |
| Engine type per engine | `sim/aircraft/prop/acf_en_type` | int[16], enum | Read | datarefs |
| Tank count | `sim/aircraft/overflow/acf_num_tanks` | int, count | Read | datarefs |
| Engine RPM | `sim/cockpit2/engine/indicators/engine_speed_rpm` | float[], rev/min | Read | datarefs |
| Propeller RPM | `sim/cockpit2/engine/indicators/prop_speed_rpm` | float[], rev/min | Read | datarefs |
| N1 | `sim/cockpit2/engine/indicators/N1_percent` | float[], percent | Read | datarefs |
| N2 | `sim/cockpit2/engine/indicators/N2_percent` | float[], percent | Read | datarefs |
| Manifold pressure | `sim/cockpit2/engine/indicators/MPR_in_hg` | float[], inches Hg | Read | datarefs |
| Torque | `sim/cockpit2/engine/indicators/torque_n_mtr` | float[], newton metres | Read | datarefs |
| EPR | `sim/cockpit2/engine/indicators/EPR_ratio` | float[], ratio | Read | datarefs |
| EGT | `sim/cockpit2/engine/indicators/EGT_deg_cel` | float[16], unit varies | Read | datarefs (12.0.8+) |
| CHT | `sim/cockpit2/engine/indicators/CHT_deg_cel` | float[16], Celsius | Read | datarefs (12.0.8+) |
| ITT | `sim/cockpit2/engine/indicators/ITT_deg_cel` | float[16], unit varies | Read | datarefs (12.0.8+) |
| Fuel flow | `sim/cockpit2/engine/indicators/fuel_flow_kg_sec` | float[], kg/s | Read | datarefs |
| Oil pressure | `sim/cockpit2/engine/indicators/oil_pressure_psi` | float[], psi | Read | datarefs |
| Oil temperature | `sim/cockpit2/engine/indicators/oil_temperature_deg_C` | float[], unit varies | Read | datarefs |
| Fuel per tank | `sim/cockpit2/fuel/fuel_quantity` | float[9], kg | Read | datarefs |
| Bus voltage | `sim/cockpit2/electrical/bus_volts` | float[6], volts | Read | datarefs |
| Bus load | `sim/cockpit2/electrical/bus_load_amps` | float[6], amps | Read | datarefs |

`sim/cockpit2/electrical/battery_voltage_indicated_volts` and `battery_amps` (float[8]) carry the
battery values. `acf_en_type`, from Laminar's description: 0 reciprocating carburetted, 1 reciprocating injected,
3 electric, 5 single-spool jet, 6 rocket, 7 multi-spool jet, 9 free turboprop, 10 fixed turboprop.
Laminar notes every aircraft has nine tank slots and a tank ratio of 0 means unused, so R1 must
ignore empty slots rather than show nine tanks on a Cessna. Laminar's own descriptions say the
temperature labels are wrong and units vary by aircraft except CHT, which is always Celsius; this is
why R4 exists. The older `EGT_deg_C`, `CHT_deg_C` and `ITT_deg_C` names are replaced and must not be
used.

## Aircraft compatibility

The `sim/cockpit2/engine` and `sim/cockpit2/electrical` families are Laminar's aircraft-independent
layer, populated for the default aircraft across all three engine classes, so the page adapts without
per-aircraft work on the Cessna 172, the King Air and the default airliners. Add-ons modelling their
own systems may leave parts of the electrical family static; F-03 must detect this and R8 must report
it rather than show a plausible but dead voltage. The Zibo 737's own displays use `laminar/B738/...`
names, which are community-sourced and version-fragile, and belong to F-53. The engine temperature
DataRefs need X-Plane 12.0.8 or newer.

## Competitor evidence

- Engine monitoring is thin across the market: Air Manager covers it only through community-authored
  gauges of varying quality, being a generic gauge-hosting shell —
  https://siminnovations.com/air-manager/
- Touch Portal's XP-FlightDeck plugin covers engine, lights, brakes and flaps, but as a
  user-assembled button grid rather than a gauge page — https://x-plane.to/file/1934/
- Instructor stations cover fuel and electrical only as management controls, as SimControlX does with
  fuel and battery management — https://apps.apple.com/us/app/simcontrolx/id1380341055
- Flight Deck ONE's "Black Box" records telemetry and graphs, the closest a mobile app gets, but it is
  a recorder rather than a live engine page — https://apps.apple.com/us/app/flight-deck-one/id6742143273
- Per-aircraft profiles are what users reward: XP Remote ships profiles for Zibo, ToLiss,
  FlightFactor, Hot Start and SSG rather than one generic panel —
  https://www.planetcoops.com/apps/xp-remote
- Generic hosts with inconsistent quality are the trap: Air Manager sits at 3.0/5 from 29 ratings —
  https://apps.apple.com/us/app/air-manager/id1052587916

## Acceptance criteria

- [ ] With the mock server reporting one, two and four engines of each type, the page shows exactly
      the right columns and the right gauges for each type; with nine tank slots of which three are
      used, only three tanks are shown and the total matches F-11.
- [ ] Removing one engine DataRef marks only those gauges unavailable; removing the engine count
      shows "aircraft could not be identified".
- [ ] Stopping the mock server marks every value stale with no raw protocol text; the main menu shows
      "no flight loaded".
- [ ] On a real simulator, a Cessna 172 run-up and a default airliner start match the simulator's own
      gauges; units persist across a restart; logs hold no token and no DataRef id.

## Risks and open questions

- Temperature units. Laminar states the unit of EGT, ITT and oil temperature varies by aircraft and
  the DataRef label is wrong. There is no known DataRef that reports which unit is in use. Open
  question: does Avionix show these unitless, infer the unit from the value range, or use an
  aircraft profile in F-03? Inferring from range is a guess and could mislead.
- Which gauge set belongs to which `acf_en_type` value is a product decision; the enum includes
  electric and rocket types with no obvious gauge set. Array lengths are symbolic for some DataRefs
  and 16 for others, so confirm the real length and unused-index behaviour in the sim.
- Fuel flow is kilograms per second, unreadable as displayed; conversion and precision need a
  decision, and litres or gallons need a density assumption.
- Bus and battery indices have no documented bus-to-index map, so which index is which bus is
  unknown. Verify in the sim and label buses by index until then.
- Add-ons overriding these DataRefs may leave them static; F-03 needs a reliable way to tell a dead
  DataRef from an idle engine. Re-check every name against `Resources/plugins/DataRefs.txt`.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. https://developer.x-plane.com/datarefs/
3. https://siminnovations.com/air-manager/
4. https://apps.apple.com/us/app/air-manager/id1052587916
5. https://x-plane.to/file/1934/
6. https://apps.apple.com/us/app/simcontrolx/id1380341055
7. https://apps.apple.com/us/app/flight-deck-one/id6742143273
8. https://www.planetcoops.com/apps/xp-remote
9. `docs/xplane.md`; `docs/roadmap/research/` — `xplane-web-api.md`, `panel-builders.md`,
   `remote-control-apps.md`
