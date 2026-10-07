# Engine monitoring — competitor and customer research (F-12)

Compiled 2026-10-07. Forum and Reddit pages returned HTTP 403 to the research tooling, so pilot
sentiment for simulator products is thin; real-aircraft engine monitors are well documented and
are the stronger evidence. Gaps are marked.

## 1. Real-aircraft engine displays

**Garmin G1000 EIS** — an always-visible strip beside the map (tach, manifold pressure, fuel flow,
oil pressure and temperature, CHT, EGT, fuel quantity, volts, amps), with a SYSTEM page for fuel
calculations and electrical detail. Turboprop variants swap RPM and manifold pressure for torque,
propeller speed, gas-generator speed (Ng) and ITT. **Lean Assist** marks each engine's peak EGT as
the mixture is leaned and shows the difference from peak.
([krepelka G1000 guide](https://krepelka.com/fsweb/learningcenter/navigation/usingtheg1000.htm);
[Garmin Baron G58 reference](https://static.garmin.com/pumac/G1000:BeechcraftBaron58_G58_CockpitReferenceGuide_0857.08_.pdf);
[aviation.stackexchange on ΔPEAK](https://aviation.stackexchange.com/questions/90070/on-the-g1000-lean-assist-page-what-does-a-positive-delta-egt-mean))

**Garmin G3X Touch** — the same strip-plus-page split. A pilot: "The G3X Touch engine info layout
is very good and not cluttered or crowded."
([vansairforce](https://vansairforce.net/threads/question-about-g3x-touch-and-or-stand-alone-engine-monitor.224413/))

**JPI EDM-830/930** — per-cylinder bars, LeanFind, and a fuel computer with fuel used, remaining,
flow and endurance. Pilots: "the 730 is MUCH easier to read than the 700. At a glance you can see
everything you need to know and you're not waiting for the scan."
([JPI EDM-930](https://www.jpinstruments.com/shop/edm-930-primary/);
[backcountrypilot](https://backcountrypilot.org/forum/jpi-engine-monitors-18236?start=20))

**Electronics International CGR-30 / MVP-50** — tach and fuel flow as large analog arcs, bars
below; fuel fields include used, time to empty and reserve. Praise: "Tons of capability in a single
hole." Complaints: "I miss being able to glance at a needle out of the corner of my eye," and a
digital tach that "updates a couple of times per second… that seems slow to me."
([airteam](https://service.airteam.eu/en/electronics-international-cgr-30-series);
[Pilots of America](https://www.pilotsofamerica.com/community/threads/i-e-cgr-30p-engine-monitor-pireps-please.69821/);
[cessna170 forum](https://forum.cessna170.org/forums/viewtopic.php?t=14163))

**Avidyne Vantage** — "Analog-style Engine Cluster w/digital readout… Lean Assist… Fuel
Management, and Electrical System Monitors."
([Avidyne](https://www.avidyne.com/shop/vantage/vantage-flight-display-systems-solutions/))

**Clutter is a layout problem, not a count problem.** In the same thread one pilot calls a monitor
"too busy", another calls an equally dense one "clean and uncluttered… in spite of the large amount
of data displayed."
([backcountrypilot](https://backcountrypilot.org/forum/jpi-engine-monitors-18236?start=20))

## 2. What pilots watch, by phase

- **Run-up:** EGT rise per magneto is a better ignition check than RPM drop.
  ([AOPA](https://www.aopa.org/news-and-media/all-news/2018/march/26/mag-check);
  [Savvy Aviation](https://www.savvyaviation.com/the-mag-check/))
- **Cruise leaning:** find peak EGT, then set a number of degrees rich or lean of it.
  ([Savvy Aviation](https://www.savvyaviation.com/interpreting-your-engine-monitor/);
  [Diamond Aviators](https://www.diamondaviators.net/forum/leaning-the-engine-using-g1000-t4457.html))
- **Turbine start:** ITT is the critical value, read with N2/Ng: a hot start is ITT climbing past
  its peak, a hung start is N2 stalling below idle.
  ([AOPA](https://www.aopa.org/news-and-media/all-news/2018/december/pilot/turbine-technique-good-start))

## 3. Simulator products

- A second screen for instruments is a named use: XHSI markets running "on a second monitor, or on
  a completely separate networked computer", and hobbyists put Air Manager on a spare tablet.
  ([XHSI](http://xhsi.sourceforge.net/);
  [waltercedric](https://www.waltercedric.com/posts/hobbies/flight-simulator/))
- Most companion apps fold engine values into a six-pack or panel overview rather than a dedicated
  engine page: FS-FlightControl ("six pack gauges, PFD and TCAS"), XpRemotePanel (PFD, autopilot,
  CDU). No dedicated engine-monitor app for X-Plane was found in the App Store.
  ([FS-FlightControl](https://fs-flightcontrol.com/);
  [XpRemotePanel](https://apps.apple.com/us/app/xpremotepanel/id1576583318))
- **Not verified this round:** simulator users' views on colour bands, fuel and temperature units,
  and stale values. The forums that hold them were unreachable.

## 4. X-Plane facts that change the design

Read from Laminar's live DataRef database (developer.x-plane.com `datarefs.json`, 12.4.x).

- `sim/cockpit2/engine/indicators/EGT_deg_cel`, `CHT_deg_cel`, `ITT_deg_cel` (float[16], 12.0.8+)
  are current; the `_deg_C` names are marked replaced. CHT is "ALWAYS CELCIUS"; EGT and ITT vary
  by aircraft.
- `sim/aircraft/engine/acf_EGT_is_C`, `acf_ITT_is_C`, `acf_oilT_is_C` say whether those values are
  in Celsius, so the unit is read, not guessed.
- `sim/aircraft/limits/{green,yellow,red}_{lo,hi}_<x>` give each aircraft's own gauge markings for
  MP, TRQ (ft-lb), N1, N2, EPR, ITT, EGT, CHT, oilT, oilP, FF, fuelP, plus battery and generator
  amps and volts. None exist for engine or propeller RPM; `acf_RSC_redline_eng` and
  `acf_RSC_redline_prp` (rad/s) give the redlines.
- Fuel: `sim/flightmodel/weight/m_fuel` float[9] kg sums to `m_fuel_total` (the F-11 total);
  `sim/aircraft/overflow/acf_tank_rat` float[9] (0 means the slot is unused);
  `sim/aircraft/weight/acf_m_fuel_tot` (lb, "appears to be") is the total capacity.
- Electrical: `sim/aircraft/electrical/num_buses` and `num_batteries` give the counts.
