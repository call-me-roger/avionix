# Competitor Research: Tablet/Phone Instrument-Panel & Cockpit-Panel Builders for X-Plane

Research date: 2026-09-15. Sources are cited inline; unsourced statements are marked **[inference]**.

---

## 1. Air Manager (Sim Innovations)

**Identity.** Vendor: Sim Innovations B.V. (Netherlands). Product pages: [siminnovations.com/air-manager](https://siminnovations.com/air-manager/), App Store [id1052587916](https://apps.apple.com/us/app/air-manager/id1052587916), Google Play [com.siminnovations.airmanager](https://play.google.com/store/apps/details?id=com.siminnovations.airmanager). Platforms: iPad, Android tablet/phone, plus a required Windows/Mac/Linux **desktop companion app** (Air Manager Desktop, sold separately as Standard/Home or Professional tier — exact current prices could not be fetched, the shop pages at siminnovations.com/shop/ returned HTTP 403 to automated fetch). The iPad app itself is a paid, one-time **$22.99** purchase with no in-app purchases listed ([App Store](https://apps.apple.com/us/app/air-manager/id1052587916)). Sims supported: X-Plane, MSFS 2020/2024, Prepar3D, FSX ([siminnovations.com](https://siminnovations.com/air-manager/), [Google Play](https://play.google.com/store/apps/details?id=com.siminnovations.airmanager&hl=en_US)). Connection: a Sim Innovations plugin runs inside X-Plane/the sim and streams to the tablet app over the local network (no details found on whether it uses X-Plane's UDP dataref protocol or a proprietary socket — **[inference: legacy UDP-based, pre-dates the XP12 Web API]**). Activity: actively maintained — version 5.0.0 shipped August 5, 2025 adding MSFS 2024 support ([App Store](https://apps.apple.com/us/app/air-manager/id1052587916)); a 5.2 beta was in testing as of the XP 12.4 lag issue thread below.

**Features (grouped).**
- *Connection & setup UX*: auto-discovers the sim on the local network; separate desktop "designer" app plus tablet "runtime" app ([siminnovations.com](https://siminnovations.com/air-manager/)).
- *Monitoring/instruments*: library of 1,000–1,500+ free community/official instruments (gauges, glass displays) ([Google Play](https://play.google.com/store/apps/details?id=com.siminnovations.airmanager&hl=en_US)).
- *Control*: touch-interactive switches, knobs, buttons; can set radio frequencies, altimeter settings, manage autopilot from the panel ([search result summary citing siminnovations.com](https://siminnovations.com/air-manager/)).
- *Radios/comms*: simulated radio-stack panels usable as a secondary com stack alongside a main visual on a monitor ([search summary](https://siminnovations.com/air-manager/)).
- *Navigation/surveillance*: depends entirely on which of the 1,000+ community instruments are installed (e.g., G1000-style bezels, GNS530) — not a built-in FMS/TCAS, it's a generic gauge-hosting shell.
- *Aircraft-specific support*: generic — instruments are dataref-driven and work with whatever aircraft exposes matching datarefs (default aircraft, Zibo via community panels, etc.) — quality varies by community-authored panel.
- *Maps/EFB*: not a core feature; some third-party instruments exist.
- *Customization/community content*: this is the product's core differentiator — a full drag-and-drop panel designer plus a large marketplace/community-panel ecosystem (paid and free panels).
- *Hardware integration*: can drive Raspberry Pi displays and GPIO via the companion **Air Player** app (below).
- *Multi-device/multi-screen*: explicitly supports running panels across multiple tablets/PCs simultaneously ("three tablets with no problems" — [search summary](https://siminnovations.com/air-manager/)).
- *Offline/demo mode*: a free/demo mode with limited instruments exists per historical user reports; current in-app-purchase state unclear.

**Praise (sourced):**
1. "By far the best" tablet app for X-Plane, running on three tablets with no problems; praised pre-built panels and editing simplicity — [Sim Innovations / search-indexed user comment](https://siminnovations.com/air-manager/).
2. Lets a user "put up bigger versions of the instruments that I can easily see without having to switch to the instrument view" — [App Store reviews](https://apps.apple.com/us/app/air-manager/id1052587916?see-all=reviews&platform=ipad).
3. Creates "a close to identical instrument panel on my old iPad that is far more readable than my HD monitor" for a Beechcraft Bonanza F33A — [App Store reviews](https://apps.apple.com/us/app/air-manager/id1052587916?see-all=reviews&platform=ipad).
4. HeliSimmer's review is titled "Panels made easy," reflecting a generally favorable framing of the design workflow — [HeliSimmer.com review](https://www.helisimmer.com/reviews/panels-made-easy-air-manager) (page could not be fetched directly for full quotes; title/framing taken from search index).
5. One forum poster called the product "very affordable" relative to building physical hardware panels — [forums.x-plane.org, various Air Manager threads](https://forums.x-plane.org/forums/topic/94283-sim-innovations-air-manager/).

**Complaints (sourced):**
1. **Post-update progressive lag**: after X-Plane 12.4.0, users reported delay between X-Plane and Air Manager growing from ~1s to ~10s to a full 30s over a flight; especially bad for *streamed images* (dataref-driven gauges were unaffected) — [Sim Innovations forum thread](https://siminnovations.com/forums/viewtopic.php?p=64256) (pages [2](https://siminnovations.com/forums/viewtopic.php?p=64268), [3](https://siminnovations.com/forums/viewtopic.php?p=64274), [4](https://siminnovations.com/forums/viewtopic.php?p=64296)).
2. **G1000 laggy** specifically — [X-Plane.org forum: "Air Manager G1000 Laggy"](https://forums.x-plane.org/forums/topic/323697-air-manager-g1000-laggy/).
3. **GNS 530 ghosting/smearing** when streaming the panel image — same lag-thread discussion — [Sim Innovations forum](https://siminnovations.com/forums/viewtopic.php?p=64256).
4. **Android compatibility regressions**: "on their newer Samsung phone running a current Android version... the Air Manager UI is impossible to use, and crashes often," despite working fine on older Android 7 devices — [Google Play reviews, summarized via search](https://play.google.com/store/apps/details?id=com.siminnovations.airmanager&hl=en_US).
5. **iPad rendering bugs**: "flashing dials"/shrinking gauges — instruments "initially appear full-sized but suddenly shrink to show only a portion" — and the app "does not render correctly on iPad Pro" — [App Store reviews](https://apps.apple.com/us/app/air-manager/id1052587916?see-all=reviews&platform=ipad).
6. **MSFS parity gap**: "nothing of the A320 worked with MSFS2020" per one review, despite MSFS being marketed as supported — [App Store reviews](https://apps.apple.com/us/app/air-manager/id1052587916?see-all=reviews&platform=ipad).
7. **Confusing installation/documentation** cited as a recurring pain point — [App Store reviews](https://apps.apple.com/us/app/air-manager/id1052587916?see-all=reviews&platform=ipad).
8. Current App Store rating is only **3.0/5 (29 ratings)** and Google Play ~**3.67/5 (30 reviews)** — both mediocre for a paid, long-established product — [App Store](https://apps.apple.com/us/app/air-manager/id1052587916), [AppBrain summary](https://www.appbrain.com/app/air-manager/com.siminnovations.airmanager).

**UX patterns to copy/avoid:**
- Copy: separating "design/author" workflow from "run/fly" workflow, and letting the same panel run identically across many devices — flexible for both single-tablet and multi-screen home cockpits.
- Copy: a large free instrument/community library dramatically increases perceived value beyond the base app.
- Avoid: relying on **streamed/rendered images** for some gauges instead of native dataref-driven rendering — this was the direct cause of the worst-reported lag complaints. Avionix should render instruments natively from datarefs/WebSocket state, never as a video/image stream.
- Avoid: shipping OS-version support that silently degrades (Android crashes, iPad Pro layout bugs) — regression testing across OS/device matrix matters more to this user base than feature count, given how much review sentiment is about crashes/rendering rather than missing features.

---

## 2. Air Player (Sim Innovations)

**Identity.** Same vendor as Air Manager. Product page: [siminnovations.com/air-player](https://siminnovations.com/air-player/). Not a tablet app itself — it's a **desktop/Raspberry-Pi runtime** (Windows, macOS, Debian Linux) that plays back Air Manager-authored panels on secondary machines. Priced separately as "Air Player 5 Desktop" / "Desktop Professional" (price not retrievable — shop page blocked automated fetch).

**Role/features.** Lets a multi-PC or Raspberry-Pi home cockpit run Air Manager panels on additional screens/instrument PCs, including driving Raspberry Pi GPIO for physical switches — i.e., it's the "scale out to more physical panels" companion, not a mobile app in its own right ([siminnovations.com/air-player](https://siminnovations.com/air-player/)).

**Relevance to Avionix:** low direct overlap (Avionix targets phone/tablet, not Raspberry Pi/GPIO), but it shows Sim Innovations' business model: charge per seat/device for a panel-hosting runtime. **[inference]** this per-device pricing is a plausible source of the "cheaper alternative" complaints noted in Air Manager threads below.

---

## 3. Simionic G1000 (PFD) / G1000 (MFD) — SIMiONIC

**Identity.** Vendor: SIMiONIC ([simionic.net](https://www.simionic.net/)). Two separate iPad apps: [G1000 PFD](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787) and [G1000 MFD](https://apps.apple.com/us/app/simionic-g1000-mfd/id827464105), plus a training-only NXi variant ([G1000 NXi](https://apps.apple.com/us/app/simionic-g1000-nxi/id6475266981)). Platforms: iPad and Mac only (no Android). Price: **$9.99 per app** (PFD and MFD are sold separately; two iPads are needed to run both at once) ([App Store](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787)). Sims supported: X-Plane, FSX, Prepar3D, MSFS2020, Infinite Flight. Connection: a free desktop **"G1000Bridge(X)"** plugin downloaded separately from simionic.net relays sim data to the iPad app over the network ([search-indexed App Store fetch](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787)). Activity: actively maintained — v7.6.1 was released roughly a week before this research (Sept 2026), improving LPV CDI sensitivity and approach naming ([App Store](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787)). Rating: **3.5/5 (135 ratings)**.

Note: contrary to the assumption in the brief, we found **no evidence of a dedicated Simionic G5 or GTN tablet app** — the "G5" product in this space is a hardware bezel from **RealSimGear** ([realsimgear.com/pages/realsimgear-g5](https://realsimgear.com/pages/realsimgear-g5)), not a Simionic tablet app, and no Simionic GTN iPad product surfaced in search. Simionic's tablet line is G1000 PFD/MFD only, plus physical G1000 bezels referenced in an X-Plane.org VR-cockpit thread ([forums.x-plane.org](https://forums.x-plane.org/forums/topic/307758-physical-g1000-bezels-by-simionic-or-real-sim-for-vr-flying-%E2%80%93-does-it-even-make-sense/)).

**Features.** Faithful G1000 PFD simulation: navigation, flight planning, flight director modes, autopilot, global nav database; "nearly every button" functions like the real unit ([search-indexed App Store summary](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787)). Aircraft-specific support: Cessna 182T/172S/172R/206H, Beechcraft Baron G58 — i.e. it targets default GA aircraft, not airliners or Zibo/ToLiss.

**Praise:**
1. At $10, "incredible value" for pilots seeking certification practice or currency — [search summary of App Store reviews](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787?see-all=reviews&platform=ipad).
2. "Good bridge programs for both X-Plane and FSX" that users appreciate — [same source].
3. "Most useful functionalities have been implemented" including nav, flight plan, flight director, autopilot — [same source].
4. Works well paired with the companion MFD app for a two-iPad glass panel — [same source].
5. Regularly updated with real navigation-database and approach-logic fixes years after release (v7.6.1, Sept 2026) — [App Store](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787).

**Complaints:**
1. Altimeter setting is **inches-only**, no hectopascals option, "even though settings exist for this feature in the app" — [App Store reviews summary](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787?see-all=reviews&platform=ipad).
2. Cannot modify the vertical flight profile, cannot rotate the FMS outer knob to select altitude fields, cannot arm VNAV — real functional gaps vs. the physical G1000 — [same source].
3. Requires installing and running a **separate bridge plugin** on the sim PC — added setup friction — [same source].
4. Needs **two iPads** to run PFD+MFD together, since the PFD app sends data to the MFD app rather than one app hosting both — [same source].
5. Mediocre 3.5/5 rating despite being a mature, long-running product, suggesting the functional gaps above are persistent pain points rather than one-off complaints — [App Store](https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787).

**UX patterns:** Copy — a tightly-scoped, single-avionics-suite app (do one glass panel very well) can succeed at a low price point. Avoid — splitting PFD/MFD into two paid apps that each need their own device is a real point of friction worth not repeating in Avionix's own PFD/MFD/EFIS split (Avionix should let one device host multiple panel pages, or clearly document why a second device helps).

---

## 4. AirFMC

**Identity.** Independent iOS developer product. [App Store id773310905](https://apps.apple.com/us/app/airfmc/id773310905). Price: **$19.99**, one-time. Platforms: iPhone, iPad, Mac, Apple Vision, Apple TV, Apple Watch (no Android). Connection: TCP/IP to a required X-Plane plugin. Sims: X-Plane and MSFS2020 (PMDG 737 only on the MSFS side). Activity: last App Store update v1.12.1, **September 2023** — over two years without an update as of this research, which is notable given how often X-Plane/aircraft-mod updates break third-party CDU integrations elsewhere (see WebFMC/Air Manager complaints above). Rating: 4.2/5 (15 ratings — small sample).

**Features.** Pure CDU/FMC remote — "a CDU for X-Plane at the tip of your fingers," frees the main display for the outside view. Aircraft-specific support is broad for a single-purpose app: x737 (738), UFMC, CRJ-200, 777/757/767, A319/A320/A321/A330/A340/A350, MD-80, 737 Classic/Zibo/Ultimate variants, CL650, and default airliners.

**Praise:** "Works perfectly," "very fast" response with no lag — [App Store reviews summary](https://apps.apple.com/us/app/airfmc/id773310905).

**Complaints:** A reviewer flagged that it's "not a stand-alone app" and requires the simulator/plugin to be running — a discoverability/expectation problem for buyers who don't realize a plugin install is mandatory — [App Store reviews summary](https://apps.apple.com/us/app/airfmc/id773310905). **[inference]** the ~2-year update gap plus the broad aircraft-compatibility matrix is a plausible risk area (aircraft-mod updates commonly change CDU datarefs/commands), though no specific "broke after an update" complaint was found in the available snippets.

---

## 5. Flight Deck ONE / Flight Deck FMS / Flight Deck AR

**Identity.** Independent developer (Michele Longhi). [flightdeckone.app](https://flightdeckone.app/), App Store apps: [Flight Deck ONE](https://apps.apple.com/us/app/flight-deck-one/id6742143273), [Flight Deck FMS](https://apps.apple.com/us/app/flight-deck-fms/id6753941713). Platforms: iPhone/iPad. Connection: **UDP** to X-Plane (not the Web API). Very recently launched/active — a "Delta 5" update in 2026 added multi-provider chart support and an "AI Debrief" feature, indicating fast iteration.

**Features.** Positioned as a full EFB + remote cockpit + logbook suite, split across three apps:
- *Flight Deck ONE*: MCP, EFIS, radios, autopilot, transponder control; real pilot logbook auto-populated per flight, exportable in standard formats; a "Black Box" flight-data recorder with timestamped graphs/metrics; claims **70+ officially supported aircraft** including Zibo 737, ToLiss A319/A321/A340, and Laminar defaults.
- *Flight Deck FMS*: remote CDU with scratchpad and Garmin GCU-style keypad support; multi-line, font-size and color-coded CDU rendering "perfect for aircraft like the Zibo 737."
- *Flight Deck AR*: head-tracking using device sensors only, no external hardware.
- Maps/EFB: charts with "persistent pinned charts" and multi-provider chart sourcing (2026 update).

Sources: [flightdeckone.app](https://flightdeckone.app/), [App Store — Flight Deck ONE](https://apps.apple.com/us/app/flight-deck-one/id6742143273), [App Store — Flight Deck FMS](https://apps.apple.com/us/app/flight-deck-fms/id6753941713).

**Praise/Complaints:** **Not independently verifiable** — the App Store listing states there are not yet enough ratings/reviews to display an aggregate score or review text ([search summary of App Store](https://apps.apple.com/au/app/flight-deck-one/id6742143273)). This product is too new for community sentiment; treat feature claims as vendor marketing until corroborated. The changelog does reference "connectivity & stability enhancements" and "CDU display fixes" in recent updates, which is a soft signal that connectivity/CDU rendering bugs have existed — [search-indexed App Store changelog](https://apps.apple.com/au/app/flight-deck-one/id6742143273).

**UX pattern worth noting:** bundling logbook + flight-data-recorder + AR head tracking + panel control into one companion-app family is a broader "EFB and cockpit companion in one" pitch, closer to Avionix's own ambition than Air Manager/Simionic's narrower instrument-replica focus. Worth watching as it matures and accumulates reviews.

---

## 6. WebFMC / WebFMC Pro (Green Arc Studios)

**Identity.** X-Plane **plugin** (runs on the sim PC) that serves the aircraft's CDU/FMC as a web page, viewable from any browser on a tablet/phone/second monitor — architecturally the closest existing product to Avionix's own browser/Web-API approach, though WebFMC pre-dates and does not use the official XP12 Web API (it's a custom embedded web server). Sold on the X-Plane.org store; a free version exists limited to Zibo 737-800/700/900 Ultimate; Pro unlocks more aircraft. Exact current price not confirmed (promotional pricing/discounts were the only figures found). Actively updated for X-Plane 12 as of the 2.7.0 "8th Anniversary" release. Sources: [x-plained.com review](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/), [xplanereviews.com update threads](https://xplanereviews.com/forums/topic/18992-news-webfmc-pro-xp12-updates-to-version-270-8th-anniversary/), [forums.x-plane.org file page](https://forums.x-plane.org/files/file/43314-webfmc/).

**Praise:**
1. Multiplatform: works with X-Plane on Windows/Mac/Linux and any remote device (Android or iOS) via a browser, no native app install needed — [x-plained.com review](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/).
2. Flexible display: view the CDU on tablet, phone, or the sim monitor itself — [same source].
3. Backward compatible with old hardware: "works fine with older iPad iOS versions, such as an older Apple iPad Gen 3 model with iOS 9.5.3" — [same source].
4. Genuinely useful for real workflow: "a very beneficial tool... in programming in route and performance data and following the set aircraft route in flight and in mirroring the aircraft's built-in FMS" — [same source].

**Complaints:**
1. Free-tier aircraft support is narrow — only Zibo 737-800/700 Ultimate/900 Ultimate — pushing users to the paid Pro tier for anything else — [x-plained.com review](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/).
2. "The hard part is setting up and sending the data to the device and its browser" — network/setup friction is called out explicitly as the weak point — [x-plained.com review](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/).

**UX pattern:** validates the "browser, no app install" approach for CDU-class panels, but confirms that **network setup/discovery is the perennial pain point** across this entire product category (also seen in Air Manager, Simionic bridge plugin, AirFMC). Avionix's connector-discovery work (mDNS, already in progress per project history) directly targets this widely-reported weakness.

---

## 7. Remote X-Plane Avionics (community, free)

**Identity.** Free, community-built (X-Plane.org forum file, hosted on GitHub) browser tool: A330 stock MCDU/EFIS/FCU/RMP/ACP plus Boeing 737-800 stock CDU, for tablet/phone/laptop/second monitor. Requires **X-Plane 12.1.4+ with the official Web API and "Allow incoming connections" enabled — no plugin to install.** This is architecturally identical in spirit to Avionix (Web API, browser client, local network, no cloud). Runs entirely on the local network; supports multiple simultaneous device connections and includes an "Operator Console" showing connection status/network addresses. 737-800 CDU support is explicitly labeled "initial." Source: [forums.x-plane.org file listing](https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/).

No praise/complaint quotes could be independently sourced (forum page returned 403 to direct fetch; only the file-listing description was retrievable via search index). **Significance for Avionix:** this is a proof that the exact approach Avionix is taking (official Web API, no plugin, browser-servable, local-network-only) is already being explored by the community for default aircraft — it is early/hobbyist-grade (default aircraft only, "initial" CDU support) rather than a polished commercial product, leaving room for Avionix to be the mature, cross-aircraft, native-app version of this idea.

---

## 8. XPlaneCDU (Android, free/open-source)

**Identity.** Free, open-source Android app by an individual developer (Wayne Piekarski). [GitHub](https://github.com/waynepiekarski/XPlaneCDU), [Google Play](https://play.google.com/store/apps/details?id=net.waynepiekarski.xplanecdu&hl=en&gl=US). Remote control for the CDU only (no FMS logic of its own) — mirrors the existing CDU state from the sim. Originally X-Plane 11-era, supports Zibo 737 and SSG 747. **Activity: appears low/unmaintained** relative to commercial competitors — **[inference from lack of recent update mentions in search results]**.

**Significance:** shows there is unmet Android demand in this space — nearly every polished commercial competitor found (Simionic, AirFMC, Flight Deck ONE) is iOS-only or iOS-first, leaving Android users dependent on hobbyist/open-source tools or Air Manager (which itself has the worst-reported Android stability).

---

## 9. MSFS-only analogues (brief, for user-expectation context)

Air Manager itself already spans MSFS 2020/2024, so it is the dominant cross-sim analogue rather than a separate product. Community discussion on the MSFS forums shows the same market dynamics as X-Plane: a 2024-era thread titled "[Cheaper/free alternative to air manager 4](https://forums.flightsimulator.com/t/cheaper-free-alternative-to-air-manager-4/484784)" indicates **price sensitivity is a cross-sim complaint**, not X-Plane-specific, and a "[Touchscreen software for instruments/pop-out panels and switches](https://forums.flightsimulator.com/t/touchscreen-software-for-instruments-pop-out-panels-and-switches/765715)" thread shows MSFS users actively hunting for the same tablet-panel category Avionix targets. An older/legacy tool, **GA Panel (Peixsoft)**, was mentioned as a prior alternative but appears effectively superseded. No MSFS-only product with meaningfully different UX from Air Manager surfaced in this research; MSFS users' expectations for this category are therefore set by the same Air Manager strengths/weaknesses documented above.

---

## Cross-Product Findings (for the Avionix team)

1. **Setup/connection friction is the single most consistent complaint category** across every product that requires a companion plugin/bridge (Air Manager, Simionic's G1000Bridge, AirFMC, WebFMC) — even WebFMC's own reviewer calls network setup "the hard part." Avionix's mDNS-based discovery work (PR #7) is targeting exactly the right problem.
2. **Lag/latency after sim updates is a recurring, credibility-damaging failure mode** — Air Manager's XP 12.4.0 regression (1s → 30s delay over a flight) was specifically traced to *streamed/rendered image* gauges, not dataref-driven ones. Avionix should keep all instrument rendering native (SVG/canvas driven by dataref/WebSocket values), never image-streamed, and should regression-test against sim point releases.
3. **Android is the underserved, worse-supported platform everywhere** — Air Manager's own users report Android-specific crashes/UI breakage on modern OS versions, and there is no equivalent to Simionic/AirFMC/Flight Deck ONE (all iOS-only or iOS-first) for Android. A genuinely first-class Android build is a real differentiation opportunity for Avionix.
4. **Aircraft-compatibility scope vs. depth is the core product tradeoff** in this category: Air Manager/WebFMC are generic hosts (any aircraft, if someone built the panel/mapping) with inconsistent quality; Simionic and AirFMC are narrow-and-deep (few aircraft, well-polished); Flight Deck ONE is attempting broad-and-deep (70+ aircraft) but is too new to have proven review evidence yet. Avionix should be explicit about where on this spectrum it sits for Zibo 737 and other target types.
5. **Splitting functionality across multiple paid apps/devices creates real friction** — Simionic requires two iPads and two purchases for PFD+MFD; this is called out directly by users. Avionix's single-app, multi-panel design already avoids this specific mistake, and should keep doing so as it adds surveillance/nav/radio panels.

**Access limitations encountered:** forums.x-plane.org and siminnovations.com pages consistently returned HTTP 403 to direct WebFetch (Cloudflare/bot protection), so several sources are cited via search-engine-indexed snippets rather than full-page fetches; quotes from those pages are reproduced as closely as the snippet text allowed and are marked accordingly above. Exact current pricing for Air Manager Desktop (Standard/Professional tiers) and Air Player Desktop could not be confirmed for the same reason.
