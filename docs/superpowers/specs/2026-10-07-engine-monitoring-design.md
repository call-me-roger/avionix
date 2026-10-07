# F-12: Engine and systems monitoring — design

- Roadmap entry: `docs/roadmap/features/F-12-engine-systems-monitoring.md`
- Research: `docs/roadmap/research/engine-monitoring.md` (new: competitors, pilots, and the
  X-Plane facts behind sections 3 and 9)
- Depends on: F-03 (compatibility), F-04 (panel framework), F-11 (units, fuel total), R-01
  (cockpit design language), F-24 (engine count and type bindings, page pattern)
- Minimum simulator: X-Plane 12.1.4 (unchanged)

## 1. Goal

A pilot opens an **Engines** panel on a second screen and reads the engine the way a G1000 or a
JPI shows it: the gauges that engine type has, for the engines that exist, each marked with the
aircraft's own green, yellow and red bands. The panel also has fuel per tank with a totalizer, and
the electrical buses and batteries. It is read-only: it writes no DataRef and activates no command.

The roadmap's acceptance list defines success:

- with one, two and four engines of each type, the right columns and the right gauges;
- with nine tank slots of which three are used, three tanks, and a total that matches F-11;
- a missing engine DataRef marks only its gauges unavailable; a missing engine count says the
  engines could not be identified;
- a stopped server leaves every value stale, never zeroed, with no raw protocol text.

## 2. What competitors and pilots taught us

| Finding | Source | What we do |
|---|---|---|
| At a glance beats scanning: "the 730 is MUCH easier to read than the 700… you're not waiting for the scan" | JPI owners | Every gauge of every engine is on one page; nothing cycles |
| Clutter comes from layout, not from the number of values | backcountrypilot thread | One table: a row per gauge, a column per engine, with labels and units once per row |
| Pilots miss "glancing at a needle out of the corner of my eye" on all-digital monitors; G1000, CGR-30 and Avidyne draw the primary gauge as an arc | cessna170 forum, G1000, CGR-30, Avidyne | Each engine's primary gauge (RPM, torque or N1) is an arc dial with a needle; the rest are bars |
| Gauges carry the aircraft's own colour bands | G1000, G3X, EI | Bands come from X-Plane's `sim/aircraft/limits` DataRefs, so each aircraft shows its own markings |
| Turboprops swap RPM and MP for torque, prop RPM, Ng and ITT | G1000 Kodiak/TBM | Gauge sets per engine type (section 4.2) |
| Lean Assist (peak EGT, ΔPEAK) is how G1000 pilots lean | Garmin, Diamond Aviators | A LEAN key on piston engines: marks each engine's peak EGT and shows the difference |
| Fuel computers show flow, used, remaining and endurance | JPI EDM-830/930, MVP-50 | A FUEL page: per tank, total (same as F-11), flow, used, endurance |
| A tablet as a second screen for engine gauges is a named use | XHSI, Air Manager users | The panel suits a tablet propped beside the screen: two columns at 720 dp and wider |
| Companion apps fold engine values into a six-pack; no X-Plane app has a dedicated engine page | FS-FlightControl, XpRemotePanel | A dedicated page is the differentiator |
| A slow digital tach ("a couple of times per second… slow") annoys | Pilots of America | Values follow the 10 Hz subscription |

## 3. Verified X-Plane names

All of these were checked against Laminar's `DataRefs.txt` (the copy the earlier features used)
and the live DataRef database (12.4.x) for the three `_deg_cel` names, which are newer than that
copy. None is community-sourced. Arrays are zero-based; engine `n` reads index `n − 1`.

**Engine indicators** (float[16], per engine)

| Gauge | Name | Unit |
|---|---|---|
| RPM | `sim/cockpit2/engine/indicators/engine_speed_rpm` | rev/min |
| Prop RPM | `sim/cockpit2/engine/indicators/prop_speed_rpm` | rev/min |
| N1 (Ng on a turboprop) | `sim/cockpit2/engine/indicators/N1_percent` | % |
| N2 | `sim/cockpit2/engine/indicators/N2_percent` | % |
| Manifold pressure | `sim/cockpit2/engine/indicators/MPR_in_hg` | inHg |
| Torque | `sim/cockpit2/engine/indicators/torque_n_mtr` | N·m |
| EPR | `sim/cockpit2/engine/indicators/EPR_ratio` | ratio |
| EGT | `sim/cockpit2/engine/indicators/EGT_deg_cel` | °C or °F, per `acf_EGT_is_C` |
| CHT | `sim/cockpit2/engine/indicators/CHT_deg_cel` | °C always |
| ITT | `sim/cockpit2/engine/indicators/ITT_deg_cel` | °C or °F, per `acf_ITT_is_C` |
| Fuel flow | `sim/cockpit2/engine/indicators/fuel_flow_kg_sec` | kg/s |
| Oil pressure | `sim/cockpit2/engine/indicators/oil_pressure_psi` | psi |
| Oil temperature | `sim/cockpit2/engine/indicators/oil_temperature_deg_C` | °C or °F, per `acf_oilT_is_C` |

**Engine configuration** (scalars unless noted)

| Purpose | Name |
|---|---|
| Engine count, type | `sim/aircraft/engine/acf_num_engines`, `sim/aircraft/prop/acf_en_type` int[16] (already bound by F-24) |
| Temperature units | `sim/aircraft/engine/acf_EGT_is_C`, `acf_ITT_is_C`, `acf_oilT_is_C` (int, 1 = Celsius) |
| Redlines | `sim/aircraft/engine/acf_RSC_redline_eng`, `sim/aircraft/controls/acf_RSC_redline_prp` (rad/s) |

**Gauge markings** (float): `sim/aircraft/limits/{green,yellow,red}_{lo,hi}_<x>` for `<x>` in
MP, TRQ, N1, N2, EPR, ITT, EGT, CHT, oilT and oilP: 60 names. They are aircraft-wide, not per
engine. TRQ is in ft-lb; the temperature markings are in the same unit as the value they mark
(Laminar labels them degC; this is device row 4 in section 8). FF, fuel pressure, vacuum and the
electrical markings are not used.

**Fuel**

| Purpose | Name |
|---|---|
| Per tank | `sim/flightmodel/weight/m_fuel` float[9], kg (sums to the F-11 total) |
| Total | `sim/flightmodel/weight/m_fuel_total` kg (F-11's binding) |
| Slot in use | `sim/aircraft/overflow/acf_tank_rat` float[9] (0 means unused) |
| Slot count | `sim/aircraft/overflow/acf_num_tanks` int |
| Capacity | `sim/aircraft/weight/acf_m_fuel_tot` lb, the whole aircraft (× the tank ratio per tank) |
| Tank side | `sim/aircraft/overflow/acf_tank_X` float[9], lateral position (negative left) |
| Used | `sim/cockpit2/fuel/fuel_totalizer_sum_kg` kg |

**Electrical**

| Purpose | Name |
|---|---|
| Counts | `sim/aircraft/electrical/num_buses`, `sim/aircraft/electrical/num_batteries` |
| Bus | `sim/cockpit2/electrical/bus_volts`, `bus_load_amps` float[6] |
| Battery | `sim/cockpit2/electrical/battery_voltage_indicated_volts`, `battery_amps` float[8] |
| Generator | `sim/cockpit2/electrical/generator_amps` float[8] |

Total: 91 new names, all DataRefs: 13 indicators, 5 configuration, 60 markings, 6 fuel and 7
electrical. `acf_num_engines`, `acf_en_type` and `m_fuel_total` are reused from earlier features.

## 4. Requirements

### 4.1 Profile (R1, R6)

Profile 1.8.0 adds four read-only features. Every binding is optional, so a missing name costs only
the gauges it feeds:

| Feature id | Label | Bindings |
|---|---|---|
| `engine-gauges` | Engine gauges | count, type, 13 indicators, 3 unit flags, 2 redlines |
| `engine-markings` | Gauge markings | the 60 marking names |
| `fuel-quantity` | Fuel quantity | the 7 fuel names, the F-11 total included |
| `electrical-monitor` | Electrical readings | the 2 counts and 5 readings |

Availability follows F-24's rule: a gauge whose value DataRef did not resolve is **not drawn**,
and the page prints one line naming them, for example "Not available on the Cessna 172: EPR, N2."
A missing marking draws no band. A missing unit flag leaves the unit unknown (section 4.4).

### 4.2 Gauge sets (R1, R2)

Engines drawn: 1..min(count, 4). With more than 4, the page says "Engines 5 and up aren't shown."
(F-24's sentence). With the count or type DataRef missing, the ENGINES page says only "The engines
on the {aircraft} couldn't be identified." With a count of 0 (a glider), it says "The {aircraft} has
no engines." The FUEL and ELEC pages do not depend on the count.

Each engine's type (`acf_en_type[n − 1]`) chooses its gauge set. The primary gauge is a dial; the
others are table rows, in this order:

| Type (values) | Dial | Rows |
|---|---|---|
| Piston (0, 1) | RPM | MAP, FF, EGT, CHT, OIL P, OIL T |
| Turboprop (9, 10) | TRQ | ITT, PROP, NG, FF, OIL P, OIL T |
| Multi-spool jet (7) | N1 | EGT, N2, FF, OIL P, OIL T, EPR |
| Single-spool jet (5) | N1 | EGT, FF, OIL P, OIL T, EPR |
| Electric (3) | RPM | TRQ |
| Rocket (6), anything else, or missing | none | none: "Engine 2's type isn't supported." |

Electric engines have no fuel flow or oil: the roadmap's "oil and fuel flow for every type" would
show zeros there, which its own user story forbids. A turboprop's N1 is labelled NG, as the PT6
gauges it mirrors. With mixed types (rare), the rows are engine 1's, then any other engine's rows not yet listed, in its
order; and a cell
whose engine lacks that gauge is empty and spoken "not used on engine 2".

### 4.3 Values (R3)

Values follow the panel's DataRef subscription (about 10 Hz). Formats:

| Gauge | Shown as | Example |
|---|---|---|
| RPM, PROP | whole rev/min, to 10 | `2,350` |
| MAP | inHg, 1 decimal | `24.6` |
| TRQ | ft-lb (N·m × 0.737562), to 10 | `1,240` |
| N1, NG, N2 | %, 1 decimal | `87.4` |
| EPR | 2 decimals | `1.42` |
| EGT, CHT, ITT, OIL T | whole degrees in the user's temperature unit (F-11 preference) | `1,320` |
| FF | per hour in the user's fuel unit (F-11): kg/h or lb/h, 1 decimal under 100, else whole | `38.5` |
| OIL P | whole psi | `62` |
| Fuel | whole kg or lb (F-11) | `84` |
| Volts | 1 decimal | `28.1` |
| Amps | whole, signed when negative | `−4` |

Each row's label carries its unit once: `EGT °F`, `FF LB/H`, `MAP IN`, `OIL P PSI`, `TRQ FT-LB`.

Fuel is mass only, as in F-11: the Web API gives no fuel density, so gallons per hour would be a
guess.

### 4.4 Temperature units (R4)

EGT, ITT and oil temperature arrive in Celsius when their `acf_*_is_C` flag is 1, and in
Fahrenheit when it is 0. They are converted to the user's unit. CHT is always Celsius. When a flag
is missing, that gauge's unit is unknown: its values are shown as reported, labelled `°` with no
letter, spoken "unit unknown", and the page says once "The Cessna 172 doesn't say which unit its
EGT uses; shown as reported." Nothing is guessed from the value's size.

### 4.5 Gauge markings and colour

- A marking is used when its high edge is above its low edge; Plane Maker leaves unused ones at 0.
- Bands are drawn in the value's own unit (before conversion), so they need no conversion.
- Scale: from the lowest to the highest used band edge, widened 10 % at the top. Without markings:
  RPM and PROP run from 0 to 110 % of the redline, with a red line at the redline; N1, NG and N2 run
  0–110 %; every other gauge without markings shows its number with no bar.
- The pointer and the number take the colour of the band the value is in: red band → warning red;
  yellow band → caution amber; above the redline (RPM and PROP without markings) → warning red;
  otherwise the avionics legend white (G1000: white digits in the
  normal range). Spoken: "in the red band" or "in the yellow band"; nothing in green.
- This is the aircraft's own instrument face, not an alert: no sound, haptics, banner or advice
  (the roadmap's out-of-scope line on caution and warning logic).

### 4.6 Lean assist (piston only)

- A LEAN key on the ENGINES page, shown when at least one engine is a piston and EGT is available.
  Lit while on.
- While on, each piston engine's highest EGT since LEAN was turned on is its peak: a white tick on
  the EGT bar and a row `ΔPEAK` with the current EGT minus the peak in the user's unit (`−25`,
  `0`). Turning LEAN off clears the peaks.
- Peaks are kept for the session in memory (not persisted), keyed by aircraft, so a panel switch
  keeps them and a different aircraft starts fresh. They advance only while the panel is visible
  (the subscription follows the visible panel).
- LEAN is a display mode: it writes nothing.

### 4.7 Fuel page

- Tanks: slots with `acf_tank_rat > 0` (and below `acf_num_tanks` when that resolves). Without
  the ratio, every slot below `acf_num_tanks`; without both, no tank rows and one line saying so.
- Name from the side (`acf_tank_X`): below −0.5 LEFT, above 0.5 RIGHT, else CENTER; when two share
  a side they are numbered in slot order (LEFT 1, LEFT 2). Without `acf_tank_X`: TANK 1, TANK 2.
- Each tank: its quantity and, when the capacity resolves and is above 0, a bar of
  quantity ÷ (capacity × ratio).
- Totalizer: TOTAL (`m_fuel_total`, the F-11 binding, so the two always agree), FLOW (the drawn
  engines' fuel flow summed, per hour), USED (`fuel_totalizer_sum_kg`), and ENDURANCE
  (total ÷ flow as h:mm) when flow is above 1 kg/h; otherwise ENDURANCE shows `—`.

### 4.8 Electrical page

Rows BUS 1..min(num_buses, 6) with volts and load amps; BATT 1..min(num_batteries, 8) with volts and
amps; GEN 1..(drawn engines) with amps. Without a count, that group shows its first entry only.
No bands: X-Plane has no bus markings, and battery markings are left for a later feature.
Buses are labelled by index; X-Plane documents no index-to-bus map.

### 4.9 Stale, disconnected, no flight (R5, R7)

- Freshness is the link's, as in F-11: the panel frame's notice ("Showing values from 12 s ago")
  and muted values. X-Plane's subscription sends a value only when it changes, so a per-value
  receipt time would call a steady oil pressure stale.
- Disconnected or stale: last values stay, muted, never zeroed.
- No flight loaded: the frame's notice, and the panel draws no values.
- Every sentence is plain language: no codes, ids, hosts, tokens or DataRef names.

### 4.10 Layout

- **Phone (< 720 dp)**: three page keys, **ENGINES**, **FUEL** and **ELEC**. The page is
  remembered per device (`avionix.engines`); ENGINES on first use.
- **Wide (≥ 720 dp)**: no page keys; ENGINES across the top, FUEL and ELEC side by side below.
- ENGINES: a row of dials (one per engine, sized to share the width, at most 180 dp), then the
  table: a label column, then one cell per engine with the number over a 6 dp bar.
- Every key meets 48 dp; values use B612 Mono; the R-01 night palette applies.

### 4.11 Panel

- Descriptor id `engines`, title "Engines", the four features, `supports: EVERYWHERE`.
- Registered sixth: Instruments, Radios, Autopilot, Navigation, Systems, **Engines**, CDU, Flight
  data.
- `PanelIcon` gains an `engines` glyph: a dial with a needle.

## 5. Accessibility

Each dial and cell is one accessible element: "Engine 1 RPM 2,350", "Engine 2 EGT 1,320 degrees
Fahrenheit, in the yellow band", "Left tank 84 kilograms", "Endurance 3 hours 12 minutes".

## 6. Mock X-Plane

The mock gains the 91 names with a toy engine: values follow the F-24 toy aircraft (RPM, flow and
temperatures rise while the engine runs and fall when it stops), the C172's markings, two used tanks
of nine, one bus and one battery. Tests set values and remove names with the existing methods.

## 7. Testing

- Unit: gauge sets per type and mixed types, formats and unit conversion (including unknown units),
  bands, scale and colour, lean peaks, tank selection and names, endurance, electrical rows,
  sentences, and the profile (names match section 3).
- UI: dials and table for 1, 2 and 4 engines of each type; missing names; unknown units; LEAN on,
  peak and off; the pages and their persistence; the wide layout; no-flight and stale; spoken
  labels.
- Guards: the touch-target sweep, the error-text guard with Engines' own telemetry, and a new
  read-only guard: pressing every key on the panel calls no write, activation or hold.
- Integration against the mock: a running engine's values arrive and move; a removed engine name
  marks only its gauges; a removed count shows the identification sentence; stopping the server
  leaves values muted, not zeroed.
- Device rows (section 8).

## 8. Device rows

1. C172 run-up: RPM, MAP, FF, EGT, CHT and oil match the G1000.
2. A default turboprop start: TRQ, ITT, NG and PROP match its gauges; ITT peaks then falls.
3. A default airliner start: N1, EGT, N2 and FF match its display.
4. The C172's EGT and CHT bands sit where the G1000 draws them (confirms marking units).
5. The temperature unit flags: EGT on the C172 matches the cockpit in °F and in °C.
6. Fuel: the C172's two tanks are named LEFT and RIGHT, full tanks read about 100 %, and the total
   equals the flight-data strip.
7. Endurance roughly matches the G1000's fuel calculation.
8. Lean assist: lean the C172 through peak; the peak tick and ΔPEAK behave as on the G1000.
9. Electrical: bus volts and battery amps match the G1000's electrical page, with the battery
   switch on and off.
10. Connect time against rows 124 and 143 (91 more names).
11. Phone: the three pages; tablet: the wide layout with a twin.

## 9. Decisions

1. **Bands from the aircraft, not from a table we write**: every aircraft brings its own; a
   hand-written table would be wrong for most.
2. **The `_deg_cel` names and the unit flags**: current names, and the unit is read rather than
   inferred from the value (R4's warning).
3. **One dial per engine, bars for the rest**: pilots miss the needle on all-digital monitors.
4. **Electric and rocket engines** deviate from the roadmap's "oil and flow for every type".
5. **Lean assist added beyond the roadmap**: the G1000's leaning tool and the C172 user story.
   It reports a difference, not advice.
6. **Fuel totalizer added beyond the roadmap**: flow, used and endurance, as every fuel computer
   shows; range is left to F-13/F-56, which have the route.
7. **Per-tank from `m_fuel`, not the indicated `fuel_quantity`**: it sums to F-11's total, as the
   roadmap's acceptance asks.
8. **Freshness from the link** (as F-11) rather than per value.
9. **No electrical markings**, buses by index.
10. **Engines sixth, after Systems**: start the engine on one, watch it on the next.
11. **Torque in ft-lb**: the PT6 convention and the markings' unit.

## 10. Out of scope

- Controls of any kind (F-24, F-53); failures (F-25); hydraulics, pressurisation, APU.
- Per-cylinder EGT and CHT (`EGT_CYL_deg_cel` is a 16 × 12 array with no cylinder count in the
  default set); GPH; range; alerts or advice; engines 5 to 8.
- Detecting add-ons that leave electrical DataRefs static.
