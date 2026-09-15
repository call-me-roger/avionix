# Competitor map

This file consolidates six competitor research reports produced on 2026-09-15 for the Avionix
roadmap: panel and instrument builders (`panel-builders.md`), FMC/CDU remotes (`fmc-cdu-apps.md`),
generic remote-control, radio and deck-controller tools (`remote-control-apps.md`), EFB and
moving-map apps (`efb-moving-map.md`), the Boeing 737 home-cockpit and companion ecosystem
(`boeing-737-ecosystem.md`), and the technical landscape of the official X-Plane 12 Web API
(`xplane-web-api.md`). Between them they cover tablet and phone companion apps, browser-served
panels, desktop instructor stations, hardware deck controllers, and the MSFS analogues that set user
expectations. The same access limitations apply to all six: `forums.x-plane.org` topic and file
pages, `siminnovations.com` shop and forum pages, `avsim.com`, `wiki.prosim-ar.com`, several Google
Play listings and `forums.skydemon.aero` returned HTTP 403, 404 or TLS errors to direct fetching, so
a sizeable share of the evidence comes from search-engine snippets rather than full page reads.
Those cases are marked snippet-only in the underlying reports and carry lower confidence. Every
product, price, quote and URL below is carried over from one of the six reports.

## 1. Product table

| Product | Category | Platforms | Price model | Sims | Connects via | Aircraft focus | Activity | Report |
|---|---|---|---|---|---|---|---|---|
| Air Manager | Panel builder | iPad, Android, desktop | $22.99 app + desktop licence | XP, MSFS, P3D, FSX | Vendor plugin, LAN | Generic, community Zibo packs | Active (5.0, 2025) | panel-builders |
| Simionic G1000 PFD/MFD | Glass replica | iPad, Mac | $9.99 per app | XP, FSX, P3D, MSFS | G1000Bridge plugin | Default GA (C172/182, Baron) | Active (2026) | panel-builders |
| AirFMC | CDU remote | iPad, Mac, visionOS | $19.99 one-time | XP 9-11, MSFS | Vendor plugin, TCP | 19+ types, Zibo, ToLiss | Stale since 2023 | fmc-cdu, 737 |
| Flight Deck ONE/FMS/AR | Remote cockpit + EFB | iPad, iPhone | Free tier, IAP to $1,299, sub | XP 11/12 | No plugin, UDP, auto-discovery | 70+ types, 120 modules | Very active | panel-builders, remote-control |
| WebFMC Pro | CDU remote | Any browser | Free tier; $19.99/$29.99 | XP 11/12 | Own plugin HTTP server | 30+ types, Zibo free | Active (v2.7.0) | fmc-cdu |
| Remote X-Plane Avionics | Browser avionics | Any browser | Free | XP 12.1.4+ | Official Web API, no plugin | Stock A330, stock 737 CDU | New, initial | panel-builders, 737 |
| XPlaneCDU | CDU remote | Android | Free, open source | XP 11 | ExtPanel v2, TCP 51000 | Zibo 737, SSG 747 | Delisted 2025 | fmc-cdu, 737 |
| X-Plane 12 Control Pad | Instructor station | iPad, iPhone | Free, first party | XP 12 | LAN, no plugin | Sim-level, any | Active (2025) | remote-control |
| Flight Sim Remote Panel 2 | Instruments + radios | Android | Free, donation | XP 11/12, Win host | Custom plugin, manual IP | Generic GA only | Long-lived, dated | remote-control |
| XP Remote (PlanetCoops) | Voice control | Android | Free + Pro | XP 11/12 | Forked ExtPlane | Zibo, ToLiss, FF, SSG | Active | remote-control |
| XpRemotePanel | Panel + CDU | iPhone, iPad, Mac | Free + $6.99 pack | XP | Network interface; CDU needs plugin | Generic + Zibo CDU | Active (2025) | remote-control |
| RemoteFlight COCKPIT/RADIO HD | Gauge + radio mirror | iOS | Paid, unpublished | XP 9-12, FSX, P3D, MSFS | Local server | Generic six-pack | Long-running | remote-control, 737 |
| SimControlX | Instructor station | iPad | $19.99 | XP, P3D, ELITE | Custom server | Any | Active, tiny base | remote-control |
| FS-FlightControl | Instructor station | Win + Android/iOS | Paid, 14-day trial | XP 10-12, MSFS, P3D | UDP, no plugin | Any | Active | remote-control |
| Touch Portal + XP plugins | Deck controller | Tablet + host PC | Free plugins, Pro app | XP 12 | Community plugin polling | User-built, Zibo packs | Community | remote-control |
| Stream Deck XP plugins | Deck controller | Stream Deck | Mostly free | XP 11/12 | UDP + FlyWithLua, or plugin | C172, Zibo, A320, G1000 | Several active | remote-control |
| ForeFlight | EFB / map | iOS only | Sub ~$100-300+/yr | XP, MSFS, P3D | Native UDP 49002 | Real-world GA | Active | efb-moving-map |
| Garmin Pilot | EFB / map | iOS, Android | Subscription | XP, MSFS | Native UDP, IP entry | Real-world GA | Active since 2016 | efb-moving-map |
| SkyDemon | EFB / map | iOS, Android, Win | Subscription | XP, FSX/P3D | UDP 49002 | European VFR/IFR | Active, thin sim side | efb-moving-map |
| Navigraph Charts + Simlink | Charts / navdata | iOS, Android, Win, web | Sub ~EUR 10/mo | XP, MSFS | Simlink plugin, cloud relay | Chart and navdata layer | Active | efb-moving-map, 737 |
| Little Navmap | Desktop map | Win/Mac/Linux + web view | Free, open source | XP 11/12, MSFS, P3D | Little Xpconnect plugin | Any | Active | efb-moving-map |
| FltPlan Go | EFB / map | iOS, Android | Free | XP 10+ | UDP, ship-position toggle | Real-world GA | Low priority since 2014 | efb-moving-map |
| AviTab | In-sim tablet | Inside XP, incl. VR | Free, open source | XP 11.20+/12 | In-sim plugin, no network | Any | Active | efb-moving-map, fmc-cdu |
| ProSim737 | 737 systems suite | Windows cockpit | Payware | FSX/P3D/MSFS; not XP | Proprietary | Boeing 737 | XP support abandoned | 737 |
| Project Magenta | 737 avionics suite | Separate Win PC | Payware, legacy | XP 12 via XUIPC, FSX/P3D | FSUIPC offsets | Boeing MCP/CDU/PFD/ND | Low, legacy | 737 |
| GoFlight GF-MCP Pro + EFIS | Hardware MCP | USB + Windows | ~$519 | XP via GoFlight tool | GIT bridge, hand-edited files | Zibo 737 | Fragile per release | 737 |
| FlyByWire flyPadOS 3 | In-sim EFB (MSFS) | Inside MSFS only | Free | MSFS | In-sim panel, no 2nd device | A32NX, A380X | Active | 737 |
| PMDG 737 Stream Deck profiles | Deck profiles (MSFS) | Stream Deck | GBP 25 | MSFS | Stream Deck plugin | PMDG 737, 840 controls | Active (Gen 2) | 737 |

## 2. Feature prevalence matrix

Columns: AM = Air Manager, SG = Simionic G1000, RF = RemoteFlight, FSRP = Flight Sim Remote Panel,
XRP = XpRemotePanel, WF = WebFMC, AF = AirFMC, FD1 = Flight Deck ONE, CP = X-Plane 12 Control Pad,
TP/SD = Touch Portal and Stream Deck plugins, FF/GP = ForeFlight and Garmin Pilot, LNM = Little
Navmap. Y = offered, P = partial, - = not offered, ? = not determinable from the reports.

|Feature|AM|SG|RF|FSRP|XRP|WF|AF|FD1|CP|TP/SD|FF/GP|LNM|Count|
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|F-02 Connection health and diagnostics|?|?|?|?|?|?|?|?|-|?|Y|?|1|
|F-03 Aircraft identification and compatibility layer|P|P|-|-|P|Y|P|Y|-|Y|-|-|3|
|F-04 Panel framework and layouts|Y|-|Y|Y|Y|-|-|Y|-|Y|-|-|6|
|F-05 Demo mode|P|?|?|-|?|-|-|P|-|?|Y|Y|2|
|F-06 Custom controls and profiles|Y|-|-|-|?|-|-|P|P|Y|-|-|2|
|F-07 Multi-device layouts and roles|Y|Y|?|?|?|Y|Y|?|?|?|-|P|4|
|F-10 Primary flight instruments|Y|Y|Y|Y|Y|-|-|Y|-|P|P|-|6|
|F-11 Flight data strip|P|P|P|P|P|-|-|Y|P|P|Y|Y|3|
|F-12 Engine and systems monitoring|P|?|-|-|-|-|-|P|-|Y|-|-|1|
|F-13 Moving map with ownship|P|P|-|-|-|-|-|P|Y|-|Y|Y|3|
|F-14 Flight recorder, logbook and replay export|-|-|-|-|-|-|-|Y|P|-|P|Y|2|
|F-20 Autopilot panel|Y|Y|?|-|Y|-|-|Y|-|P|-|-|4|
|F-21 COM and NAV radios|Y|?|Y|Y|Y|-|-|Y|-|Y|-|-|6|
|F-22 Transponder|P|?|-|-|-|-|-|Y|-|?|-|-|1|
|F-23 Audio panel|?|-|-|Y|-|-|-|?|-|?|-|-|1|
|F-24 Aircraft systems controls|Y|-|-|-|-|-|-|P|-|Y|-|-|2|
|F-25 Simulator control and instructor station|-|-|-|-|-|-|-|-|Y|P|-|-|1|
|F-26 Voice commands|-|-|-|-|-|-|-|-|-|-|-|-|0|
|F-30 HSI, CDI and navigation indicators|P|Y|Y|P|Y|-|-|P|-|-|-|-|3|
|F-31 Flight plan progress view|-|Y|-|-|P|Y|P|Y|-|-|Y|Y|5|
|F-32 CDU remote for the default X-Plane FMS|-|-|-|-|P|?|Y|Y|-|-|-|-|2|
|F-33 Flight plan import and export|-|-|-|-|-|-|-|P|-|-|P|Y|1|
|F-34 Charts and navdata integration|-|Y|-|-|-|-|-|Y|-|-|Y|Y|4|
|F-40 TCAS traffic display|-|-|-|-|-|-|-|-|-|-|P|Y|1|
|F-41 Weather radar and weather awareness|-|-|-|-|-|-|P|-|P|-|Y|Y|2|
|F-50 737 Mode Control Panel|Y|-|-|-|-|-|-|Y|-|P|-|-|2|
|F-51 737 CDU|?|-|-|-|Y|Y|Y|Y|-|?|-|-|4|
|F-52 737 EFIS control panel|Y|-|-|-|-|-|-|Y|-|?|-|-|2|
|F-53 737 overhead panel|Y|-|-|-|-|-|-|?|-|?|-|-|1|
|F-54 737 pedestal|Y|-|-|-|-|-|-|P|-|?|-|-|1|
|F-55 Checklists and flows|-|-|-|-|-|-|-|-|-|-|-|-|0|
|F-56 Performance and weight and balance|-|-|-|-|-|P|P|-|Y|-|P|-|1|
|F-57 Airbus (ToLiss) FCU and MCDU|?|-|-|-|P|Y|Y|Y|-|P|-|-|3|

Ordered by count, most common first: F-04 Panel framework and layouts (6), F-10 Primary flight
instruments (6), F-21 COM and NAV radios (6), F-31 Flight plan progress view (5), F-07 Multi-device
layouts and roles (4), F-20 Autopilot panel (4), F-34 Charts and navdata integration (4), F-51 737
CDU (4); then F-03, F-11, F-13, F-30 and F-57 (3 each); then F-05, F-06, F-14, F-24, F-32, F-41,
F-50 and F-52 (2 each); then F-02, F-12, F-22, F-23, F-25, F-33, F-40, F-53, F-54 and F-56 (1 each);
and last F-26 Voice commands and F-55 Checklists and flows (0 in this sample). Three cautions. The
low counts for F-25 and F-40 reflect the twelve chosen columns, not the market: SimControlX and
FS-FlightControl both do instructor-station work and traffic overlays. F-26 is offered by XP Remote
and F-55 by FlyByWire's flyPadOS 3, neither of which is a column here. And F-02 scores 1 because a
visible link-health readout is rare, not because these connections are reliable.

## 3. What users praise

1. Bigger, more readable instruments on a second screen than on the main monitor.
   https://apps.apple.com/us/app/air-manager/id1052587916?see-all=reviews&platform=ipad
2. Zero-install browser clients that work on any device, including very old tablets.
   https://www.x-plained.com/utility-review-green-arc-studios-webfmc/, https://fsnews.eu/review-webfmc-pro/
3. Diff-only text protocols that keep latency and bandwidth low ("effective communication protocol").
   https://www.x-plained.com/utility-review-green-arc-studios-webfmc/
4. Setup close to plug and play because the simulator itself carries the integration.
   https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/
5. A visible link-accuracy readout confirming the feed is live ("Accuracy (X-Plane) 1m").
   https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator
6. Keypad frequency entry, described as better than mouse-clicking knobs in the sim.
   https://apps.apple.com/us/app/xpremotepanel/id1576583318
7. Failure injection and environment control, loved by instructors and self-teachers.
   https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565,
   https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/,
   https://apps.apple.com/us/app/simcontrolx/id1380341055
8. Broad aircraft coverage, treated as the main differentiator over single-aircraft tools.
   https://greenarcstudios.com/, https://apps.apple.com/us/app/airfmc/id773310905
9. Per-instrument modularity: import only the panels you want, arranged by flight phase.
   https://siminnovations.com/shop/zibo-mod-737-800-overhead-panel/
10. Automatic logbook and track recording with export, no separate tool needed.
    https://github.com/albar965/littlenavmap

## 4. What users complain about

1. Network setup is the hard part: "the hard part is setting up and sending the data to the device
   and its browser". https://www.x-plained.com/utility-review-green-arc-studios-webfmc/,
   https://forum.navigraph.com/t/simlink-xplane-12/14318
   Avionix implication: discovery and pairing must stay zero-entry with a plain-language failure path.
2. Silent stale or lagging data, up to five minutes of position lag before the user notices.
   https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight,
   https://forums.x-plane.org/forums/topic/307366-xplane-12-and-foreflight-looses-connection-after-10-secs/
   Avionix implication: never render a stale value as live; show link age (F-02).
3. Breakage after simulator or add-on point releases, often silent.
   https://www.planetcoops.com/apps/xp-remote,
   https://www.pollypotsoftware.org.uk/vanillaforums/discussion/655/zibos-boeing-b738-800-mcp-pro-efis-2xgf166-lgt-ii-requires-git-1-8-2-0-for-x-plane
   Avionix implication: version the dataref mapping layer and name a missing dataref in the UI.
4. Lag from streaming rendered images instead of drawing from datarefs: one to thirty seconds.
   https://siminnovations.com/forums/viewtopic.php?p=64256,
   https://forums.x-plane.org/forums/topic/323697-air-manager-g1000-laggy/
   Avionix implication: render every instrument natively from values, never as an image stream.
5. Desktop-sized controls on phone screens: "still impossible to use on an 8 inch screen".
   https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc
   Avionix implication: size touch targets phone-first, not as a scaled-down tablet layout.
6. Android treated as second class: crashes on modern Android, or no Android build at all.
   https://play.google.com/store/apps/details?id=com.siminnovations.airmanager&hl=en_US,
   https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
   Avionix implication: Android is a release-blocking platform, not a port.
7. Extra plugin installs, sometimes a second third-party plugin stacked on the first.
   https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787, https://github.com/waynepiekarski/XPlaneCDU
   Avionix implication: the Web-API-only, connector-relayed model is the selling point; keep it.
8. Ordinary consumer network setups breaking the link with no diagnostic, notably VPNs.
   https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/,
   https://www.x-plained.com/utility-review-haversine-airfmc/
   Avionix implication: diagnostics must name a likely cause without exposing raw protocol errors.
9. Positioning confusion: "Completely worthless without a simulator game".
   https://apps.apple.com/us/app/airfmc/id773310905
   Avionix implication: make the simulator dependency obvious before install; F-05 demo mode helps.
10. One workflow split across several apps, devices or purchases.
    https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787,
    https://forums.x-plane.org/forums/topic/304396-lost-in-navigraph/
    Avionix implication: one app, many panels; a second device is an option, never a requirement.
11. Abandonment and staleness, visible to buyers through store metadata.
    https://apps.apple.com/us/app/airfmc/id773310905, https://github.com/waynepiekarski/XPlaneCDU
    Avionix implication: publish a compatibility statement per X-Plane point release.
12. Pricing: per-aircraft tiers and add-on licences send users hunting for cheaper options.
    https://apps.apple.com/mx/app/flight-deck-one/id6742143273,
    https://forums.flightsimulator.com/t/cheaper-free-alternative-to-air-manager-4/484784
    Avionix implication: avoid per-aircraft gating for core panels.

## 5. Gaps no competitor fills well

- **Two-way flight-plan sync.** Mobile EFBs cannot push a plan into the X-Plane FMS; a 34-post thread
  exists just for the workaround, and only desktop-only Little Navmap does bidirectional FMS-format
  interchange. https://forums.x-plane.org/forums/topic/283018-getting-a-foreflight-flightplan-in-to-xplane/,
  https://github.com/albar965/littlenavmap. Honest limit: the Web API exposes no flight-plan upload
  endpoint, so Avionix can mirror and export but not inject.
  https://developer.x-plane.com/article/flight-initialization-api/
- **Logbook and flight recording on mobile.** Only Little Navmap (desktop) and XMapsy (a bridge) do it
  natively; ForeFlight users need third-party 42fdr to replay their own tracks, and Flight Deck ONE's
  claim is too new to carry review evidence.
  https://forums.x-plane.org/forums/topic/347175-how-to-replay-foreflight-logs-in-x-plane-12-using-42fdr,
  https://github.com/albar965/littlenavmap, https://apps.apple.com/mx/app/flight-deck-one/id6742143273
- **First-class Android.** Simionic, AirFMC and Flight Deck ONE are iOS-only; Air Manager's Android
  build has the worst-reported stability; XPlaneCDU was delisted from Google Play in February 2025.
  https://play.google.com/store/apps/details?id=com.siminnovations.airmanager&hl=en_US,
  https://github.com/waynepiekarski/XPlaneCDU
- **Web-API-native with no plugin.** Only the free, hobbyist-grade Remote X-Plane Avionics runs on
  X-Plane 12's official Web API with no plugin; everything else uses a vendor plugin, ExtPlane,
  FlyWithLua, FSUIPC or raw UDP.
  https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/,
  https://developer.x-plane.com/article/x-plane-web-api/
- **A serious 737 companion on X-Plane.** ProSim-AR's own FAQ states X-Plane is not supported, leaving
  X-Plane 737 builders with Air Manager panel packs, fragile GoFlight hardware bridges and legacy
  Project Magenta. https://wiki.prosim-ar.com/index.php/Frequently_Asked_Questions,
  https://forums.x-plane.org/forums/topic/62524-prosim-737/,
  https://www.pollypotsoftware.org.uk/vanillaforums/discussion/655/zibos-boeing-b738-800-mcp-pro-efis-2xgf166-lgt-ii-requires-git-1-8-2-0-for-x-plane

## 6. Pricing landscape

Four bands appear across the six reports. **Free or donation-ware** dominates the community and
first-party tiers: Flight Sim Remote Panel (free, no ads, optional donation,
https://baltazarstudios.com/flight-sim-remote-panel/), XPlaneCDU and Little Navmap (free, open
source, https://github.com/waynepiekarski/XPlaneCDU, https://github.com/albar965/littlenavmap),
Remote X-Plane Avionics and AviTab, and Laminar's own X-Plane 12 Control Pad
(https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565). **One-time purchases of roughly
$10 to $30** are the commercial norm: Simionic G1000 at $9.99 per app
(https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787), AirFMC at $19.99
(https://apps.apple.com/us/app/airfmc/id773310905), Air Manager's tablet app at $22.99 plus a
separate desktop licence (https://apps.apple.com/us/app/air-manager/id1052587916), WebFMC Pro at
$19.99 for XP11 and $29.99 for XP12 (https://greenarcstudios.com/), SimControlX at $19.99
(https://apps.apple.com/us/app/simcontrolx/id1380341055), XpRemotePanel free with a $6.99 Navigation
Pack (https://apps.apple.com/us/app/xpremotepanel/id1576583318), and PMDG 737 Stream Deck profiles at
GBP 25 (https://flightpanels.io/en-us/products/pmdg-737-streamdeck-profiles-for-microsoft-flight-simulator).
**Subscriptions** come from the real-world EFB and navdata side rather than from sim tools:
ForeFlight at roughly $100 to $300 or more per year
(https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator),
Garmin Pilot and SkyDemon on similar real-world pricing, and Navigraph's Unlimited tier at around
EUR 10 per month, whose value for sim-only flying users openly debate
(https://forums.flightsimulator.com/t/navigraph-vs-free/379287). **Per-aircraft in-app purchases**
are the outlier: Flight Deck ONE lists IAPs from $0 up to $1,299, with aircraft packs at $149 to $299
plus a Premium tier (https://apps.apple.com/mx/app/flight-deck-one/id6742143273,
https://flightdeckone.app/). For context, the hardware alternative Avionix displaces runs around $519
for a GoFlight MCP Pro set, and cross-sim users already search for a "cheaper/free alternative to air
manager 4", so price sensitivity in this hobby is documented rather than assumed
(https://forums.flightsimulator.com/t/cheaper-free-alternative-to-air-manager-4/484784).
