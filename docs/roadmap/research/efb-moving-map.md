# Competitor Research: EFB / Moving Map Apps That Connect to X-Plane

Category scope: mobile/desktop Electronic Flight Bag and moving-map apps used by X-Plane simmers for live flight monitoring (position, track, instruments, flight-plan progress). Researched via web search and page fetches on 2026-09-15. Access notes: `forums.x-plane.org` topic pages (non-file) and `avsim.com` blocked WebFetch with HTTP 403 in this session — for those, findings rely on search-engine snippets/thread titles, which are marked accordingly below. All other quotes were fetched directly.

---

## 1. ForeFlight

**Identity:** ForeFlight Mobile EFB, by ForeFlight LLC (a Boeing company). iOS only (iPhone/iPad); no Android or web app. Subscription tiers (Basic/Pro/Performance/Business, roughly $100–$300+/yr as a real-world EFB; there is no sim-specific price tier — pilots use whatever tier they already pay for). Primarily built for real-world GA/business aviation; X-Plane/MSFS/P3D support is a secondary "practice with your EFB" feature, not a core product line. Actively maintained (ties into ADS-B, Boeing/Jeppesen data).

**Connection to X-Plane:** Native UDP broadcast — no plugin needed. X-Plane Settings > Network > "iPhone, iPad and External Apps" > broadcast (all copies, or to a single IP), UDP port 49002 (also 49001 documented). ForeFlight then shows "X-Plane" under More > Devices with an Enable toggle. Reported as X-Plane 12's easiest EFB integration path since it's built into the sim itself. (Source: [ForeFlight Support](https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator), [iPad Pilot News, 2024](https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/))

**Features relevant to a sim companion:**
- *Connection/setup:* zero-install UDP broadcast; same-network requirement; IP/port entry for single-device mode.
- *Live monitoring:* moving map, ownship position/track, synthetic vision using AHRS pitch/bank data, "Accuracy (X-Plane) 1m" indicator confirming the link.
- *Flight planning:* full real-world flight-plan filing/briefing tools, but plan → sim FMS sync is not native; pilots use third-party bridges (FlightStreamX, 42fdr) to push ForeFlight plans into X-Plane or pull recorded tracks back out.
- *Nav data:* full Jeppesen-backed charts, plates, procedures, terrain/obstacles — real-world-grade, reused as-is for the sim scenario.
- *Weather:* full real weather products (used for briefing, not sim weather).
- *Logbook/replay:* records real GPS logs; a third-party tool (42fdr) is used by the sim community specifically to replay ForeFlight-recorded tracks back inside X-Plane 12 (Source: [forum thread title, x-plane.org #347175](https://forums.x-plane.org/forums/topic/347175-how-to-replay-foreflight-logs-in-x-plane-12-using-42fdr)).
- *Multi-device / offline:* full offline chart caching (real-world use case); device management screen doubles as the sim-connection UI.

**What users PRAISE:**
1. "There is very little setup to make Foreflight work with X-Plane" once on the same Wi-Fi network — described as close to plug-and-play in X-Plane 12. — [ipadpilotnews.com, 2024](https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/)
2. X-Plane 12 offers "integrated EFB support" that's simpler than MSFS's plugin-dependent setup (Flight Events/FS2FF/XMapsy/MSFS Bridge all needed for MSFS by comparison). — [ipadpilotnews.com, 2024](https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/)
3. Both sims output AHRS pitch/bank, letting pilots use ForeFlight's synthetic-vision overlay while flying the sim — valued as realistic instrument practice. — [ForeFlight Support](https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator)
4. Pilots use the sim link to "practice workflows and procedures" and emergency/IFR practice using their real EFB, seen as a strong value-add for currency. — [iPad Pilot News tips article, paraphrased across the FltPlan/ForeFlight ecosystem](https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/)
5. The accuracy readout ("Accuracy (X-Plane) 1m") is called out as a nice confidence signal that the link is live and precise. — [ForeFlight Support](https://support.foreflight.com/hc/en-us/articles/204115525-How-can-ForeFlight-be-connected-to-the-X-Plane-flight-simulator)

**What users COMPLAIN about:**
1. Severe position lag: "the GPS position lags very badly between X-Plane 11 and Foreflight. It lags so bad that I can land and be on the ground for sometimes up to 5 minutes before Foreflight shows the approach and landing." No fix was found in-thread; the responder just redirected the user to ForeFlight support. — [questions.x-plane.com/20612](https://questions.x-plane.com/20612/gps-lags-with-x-plane-11-and-foreflight)
2. Connection drop after ~10 seconds on X-Plane 12: thread title "Xplane 12 and Foreflight - looses connection after 10 secs," with reports that only an "ADSB Box" appears under Devices instead of the expected ForeFlight/X-Plane entry. — [forums.x-plane.org/forums/topic/307366](https://forums.x-plane.org/forums/topic/307366-xplane-12-and-foreflight-looses-connection-after-10-secs/) (thread title/snippet only — page itself returned HTTP 403 to fetch)
3. A documented root cause for the "ADS-B instead of X-Plane" symptom: a conflicting Xavion/FlyQ or Control Pad connection to the same device breaks the ForeFlight-X-Plane link, requiring those to be removed and Location Services toggled. — [search snippet of ForeFlight support docs, via query results](https://support.foreflight.com/hc/en-us/sections/200866075-Flight-Simulators)
4. Weather/GPS not syncing at all in some X-Plane 12 setups even though "X-Plane" is listed as connected under Devices — thread "X-Plane 12 and Foreflight" (Oct 2022). — [forums.x-plane.org/forums/topic/276154](https://forums.x-plane.org/forums/topic/276154-x-plane-12-and-foreflight/) (title/snippet only, page fetch returned 403)
5. No native two-way flight-plan sync: a 34-post thread ("Getting a Foreflight Flightplan in to Xplane," Feb 2023) shows pilots struggling to get a plan built in ForeFlight into X-Plane's FMS, relying on workarounds/third-party tools rather than a built-in import. — [forums.x-plane.org/forums/topic/283018](https://forums.x-plane.org/forums/topic/283018-getting-a-foreflight-flightplan-in-to-xplane/) (title/thread-length only; page fetch returned 403)
6. iOS/app-version regressions break the link: "Foreflight stopped working with Xplane 12 IOS 17.5.1, Foreflight 16.4.4" — indicates the UDP link is fragile across ForeFlight/iOS updates. — [forums.x-plane.org/forums/topic/307121](https://forums.x-plane.org/forums/topic/307121-foreflight-stopped-working-with-xplane-12-ios-1751-foreflight-1644/) (title only)

**UX patterns worth copying/avoiding:**
- Copy: a visible "link accuracy/last update" readout so the user can self-diagnose a stale connection at a glance, rather than silently showing stale position.
- Copy: sim integration reachable from the *same* device-management screen used for real hardware — one mental model, not a separate "sim mode."
- Avoid: relying on a fragile, versionless UDP broadcast that silently drops after other network features (ADS-B receivers, other EFBs) grab the same identity/port — Avionix should design explicit reconnect/heartbeat handling given it depends on the X-Plane Web API/WebSocket instead of raw UDP.
- Avoid: shipping flight-plan import as a one-way, third-party-tool affair — this is one of the most repeated complaints in the ForeFlight+X-Plane community and a clear opportunity for Avionix to do native two-way FMS sync well.

---

## 2. Garmin Pilot

**Identity:** Garmin Pilot, by Garmin Ltd. iOS and Android. Subscription-based (real-world EFB pricing, no separate sim tier). X-Plane support added by v4.3 (dated back to ~2016) alongside terrain/obstacles; MSFS support added later (v10.4, 2021), confirming X-Plane was the incumbent sim integration. Actively maintained.

**Connection to X-Plane:** Native UDP, similar model to ForeFlight — Garmin Pilot: Settings > Flight Simulation > "Use X-Plane" toggle; X-Plane: Settings > Net Connections > iPhone/iPad > "Send AHRS data to app on ONE iPad or iPhone," entering the IP/port shown in Garmin Pilot. (Source: [ipadpilotnews.com, 2016](https://ipadpilotnews.com/2016/02/garmin-pilot-adds-flight-profile-view-x-plane-support/), [takeoffjunkie.com](https://www.takeoffjunkie.com/garmin-pilot-4-3-terrain-obstacles-and-x-plane-compatibility/))

**Features:**
- *Connection/setup:* single-device IP/port pairing, same-network requirement, similar friction profile to ForeFlight.
- *Live monitoring:* live ownship position on the moving map, AHRS attitude, airport diagrams and approach/departure procedures with "where you are on the procedure" tracking overlaid live. — [ipadpilotnews.com](https://ipadpilotnews.com/2016/02/garmin-pilot-adds-flight-profile-view-x-plane-support/)
- *Flight planning:* real-world flight planning tools reused for the sim session; no confirmed native two-way FMS sync with X-Plane in the material found.
- *Nav data:* full Garmin/Jeppesen-class database, terrain and obstacle layers (an explicit selling point of the release that added X-Plane support).
- *Multi-device/offline:* standard EFB offline chart caching; Android and iOS both supported (an advantage over ForeFlight's iOS-only reach for a broader companion-app audience).

**PRAISE:**
1. "Customers may launch X-Plane and connect Garmin Pilot to the simulator via Wi-Fi... Garmin Pilot conveniently sends AHRS and GPS information to display flight plan information within the application and the simulator." — framed by Garmin's own materials as a smooth, valuable practice tool. — [ipadpilotnews.com, 2016](https://ipadpilotnews.com/2016/02/garmin-pilot-adds-flight-profile-view-x-plane-support/)
2. Being able to "pull up airport diagrams and APP/DEP procedures, and see where you are on the procedure map" live in the sim is highlighted as a standout practice feature. — [ipadpilotnews.com, 2016](https://ipadpilotnews.com/2016/02/garmin-pilot-adds-flight-profile-view-x-plane-support/)
3. Long-standing, stable X-Plane support (since ~2016, predating its MSFS support by 5 years) is cited as evidence of a mature integration. — [takeoffjunkie.com](https://www.takeoffjunkie.com/garmin-pilot-4-3-terrain-obstacles-and-x-plane-compatibility/)
4. Cross-platform reach (Android + iOS) is repeatedly noted as differentiating Garmin Pilot from ForeFlight in sim-linking round-ups. — [ipadpilotnews tips article](https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/)
5. MSFS pilots on the forums.flightsimulator.com wishlist thread explicitly ask Garmin to bring the same quality of X-Plane integration to their sim, implying the X-Plane version is seen as the reference implementation. — [forums.flightsimulator.com/t/garmin-pilot-integration/268579](https://forums.flightsimulator.com/t/garmin-pilot-integration/268579)

**COMPLAINTS:**
1. The MSFS community wishlist thread itself ("Garmin Pilot integration") is evidence users had to wait years and petition for feature parity outside X-Plane — an indirect signal that Garmin's sim support, while good for X-Plane, was seen as slow to expand. — [forums.flightsimulator.com/t/garmin-pilot-integration/268579](https://forums.flightsimulator.com/t/garmin-pilot-integration/268579)
2. Same fundamental friction as ForeFlight: manual IP/port entry, same-Wi-Fi requirement, and single-device mode are called out generically as the common pain point across all these EFBs in the ipadpilotnews round-up. — [ipadpilotnews.com, 2024](https://ipadpilotnews.com/2024/05/tips-pilots-using-aviation-apps-with-home-flight-simulators/)
3. *(Inference, not directly sourced)*: because Garmin Pilot's sim mode is a checkbox buried under Settings > Flight Simulation, it is easy for new users to miss — this specific complaint was not found verbatim in the sources reviewed, so it is flagged as an inference from the setup-flow description rather than a sourced user quote.

*(Fewer independent complaint threads were found for Garmin Pilot than ForeFlight — its sim integration appears less discussed/less troubled in the specific X-Plane-linking context, though this could also reflect a smaller X-Plane-simmer user base for Garmin Pilot vs. ForeFlight.)*

---

## 3. SkyDemon

**Identity:** SkyDemon, by SkyDemon Ltd (UK). iOS, Android, Windows/desktop. Primarily a European VFR/IFR EFB; subscription (~£/€ per year, real-world pricing; no separate sim tier found). Sim support is a minor feature.

**Connection to X-Plane:** SkyDemon: Settings (cogwheel) > "Third Party Devices" > enable "X-Plane" toggle, then "Use X-Plane" when starting a flight. Listens on UDP port 49002 by default. X-Plane: iPhone/iPad tab > "Send AHRS data to... SkyDemon on ONE iPad or iPhone," entering SkyDemon's host IP. (Source: [forums.skydemon.aero/Topic27248](http://forums.skydemon.aero/Topic27248.aspx) — snippet only, direct fetch failed on a TLS certificate mismatch; [SkyDemon forum topic titles](http://forums.skydemon.aero/Topic19877.aspx))

**Features:** Live position/AHRS overlay on SkyDemon's VFR-style moving map; European airspace/notam overlays reused for sim flying; no confirmed two-way FMS plan sync with X-Plane.

**PRAISE:**
1. Setup is described as requiring just two steps — enabling the toggle and selecting "Use X-Plane" at flight start — presented as simple compared to legacy simulators (FSX/P3D need FSUIPC-based bridges). — [forums.skydemon.aero/Topic27248](http://forums.skydemon.aero/Topic27248.aspx)
2. Multiple community-made tutorial videos (e.g., "Using Skydemon with X Plane 11" on YouTube) exist specifically because pilots want this workflow, suggesting real demand and a workable integration once configured. — [YouTube: Using Skydemon with X Plane 11](https://www.youtube.com/watch?v=3n7VC_oCz8A)

**COMPLAINTS:**
1. The very existence of dedicated "How to connect Skydemon to X-plane 11" and "SD and FSX" support-forum threads, each with multiple replies, indicates the connection is not self-evident and generates repeat support questions. — [forums.skydemon.aero/Topic27248](http://forums.skydemon.aero/Topic27248.aspx), [forums.skydemon.aero/Topic34659](http://forums.skydemon.aero/Topic34659.aspx)
2. *(Access limitation)*: SkyDemon's own forum could not be fully fetched (TLS hostname/cert mismatch on `forums.skydemon.aero`), so only search-engine snippets were available — deeper praise/complaint detail could not be verified first-hand for this product.

*(Given the access limitation, SkyDemon coverage here is thinner and lower-confidence than the other products; flagged explicitly per the task rules.)*

---

## 4. Navigraph Charts + Simlink

**Identity:** Navigraph Charts (chart viewer, iOS/Android/Windows/web) with the Simlink plugin/service, by Navigraph AB (Sweden). Subscription: Navigraph "Unlimited" tier (~€10/mo mentioned in one forum thread) is required for full moving-map/Simlink functionality; a cheaper "Charts" tier exists with reduced features. Actively developed; deeply tied into the X-Plane 12 Zibo 737 community. (Source: [navigraph.com/blog/zibo-737](https://navigraph.com/blog/zibo-737), [forums.flightsimulator.com/t/navigraph-vs-free/379287](https://forums.flightsimulator.com/t/navigraph-vs-free/379287))

**Connection to X-Plane:** A Simlink plugin installed into X-Plane's Plugins folder streams position data to Navigraph's cloud, which the Charts app then polls — notably *not* a direct local Wi-Fi link like ForeFlight/Garmin/SkyDemon. Requires internet access even for a local single-PC setup. Installation requires a manual "scan and install" step inside Navigraph Charts' plugin manager, and the sim must show a green checkmark to confirm the plugin is registered. (Source: [forum.navigraph.com/t/simlink-xplane-12/14318](https://forum.navigraph.com/t/simlink-xplane-12/14318))

**Features:**
- *Connection/setup:* cloud-relayed rather than LAN-direct — trades local network complexity for a dependency on Navigraph's servers and an internet connection.
- *Live monitoring:* moving map showing aircraft position along SIDs/STARs/airways and even taxiways, overlaid on real charts.
- *Nav data:* the flagship feature — real-world AIRAC-cycle-current navdata, procedures and charts, tightly integrated with FMS-capable payware/freeware aircraft (e.g., Zibo 737) via its own FMS Data Manager.
- *Flight planning:* SimBrief integration (same company) for plan generation; charts-side plan display, but the underlying "plan into the FMS" step is handled by a separate tool (FMS Data Manager), not Simlink itself.
- *Weather:* not a core feature (chart/navdata-focused product).
- *Multi-device/offline:* charts can be viewed on other devices via the cloud relay; offline chart caching exists in the Charts app for regions/routes purchased.

**PRAISE:**
1. "Simlink is excellent and free as part of your Navigraph subscription" — search-engine synthesis reflecting favorable framing across multiple sources for its zero-additional-cost bundling. — [aggregated from search results on Simlink](https://forum.navigraph.com/t/simlink-and-x-plane-11/9596)
2. The cloud-relay design is called out as clever because "it does not require Wi-Fi or a direct link to another computer or tablet" — useful when the tablet and sim PC are on different networks (e.g., different rooms/VLANs). — [search synthesis of Navigraph Simlink description](https://forum.navigraph.com/t/simlink-and-x-plane-11/9596)
3. "The biggest advantage is the access to all available plates/charts" — worldwide chart coverage beats free tools like SkyVector (US-only) or SimBrief (no charts). — [forums.flightsimulator.com/t/navigraph-vs-free/379287](https://forums.flightsimulator.com/t/navigraph-vs-free/379287)
4. Navdata accuracy is prized: one user specifically noted default sim navdata mis-places ILS localizers "in almost all airports in China," which Navigraph's updated cycle fixes — a concrete case for paying for current AIRAC data. — [forums.flightsimulator.com/t/navigraph-vs-free/379287](https://forums.flightsimulator.com/t/navigraph-vs-free/379287)
5. "With Navigraph, it neatly puts all of that in 1 place for you with all the planning tools you need... in 1 handy place" — praised as a one-stop-shop compared to juggling SkyVector + SimBrief + separate navdata tools. — [forums.flightsimulator.com/t/navigraph-vs-free/379287](https://forums.flightsimulator.com/t/navigraph-vs-free/379287)

**COMPLAINTS:**
1. Setup is not just "install and go": a user on X-Plane 12 reported Simlink "doesn´t show the plane in CHARTS when I´m playing xplane-12. MFS2020 works fine," requiring a manual plugin scan-and-install step that isn't obvious. — [forum.navigraph.com/t/simlink-xplane-12/14318](https://forum.navigraph.com/t/simlink-xplane-12/14318)
2. A dedicated thread titled "Lost in Navigraph" shows a returning X-Plane 12 pilot overwhelmed by the interplay of the GNS530, Navigraph Charts, and Simlink — evidence the multi-app workflow (charts app + FMS Data Manager + Simlink + aircraft GPS) is confusing for less technical users. — [forums.x-plane.org/forums/topic/304396](https://forums.x-plane.org/forums/topic/304396-lost-in-navigraph/) (title/snippet only; direct fetch returned 403)
3. Subscription cost skepticism: "Keeping up to date is mostly a major headache and adds minimal to the sim" — a vocal minority view that the subscription isn't worth it for casual/VFR sim flying. — [forums.flightsimulator.com/t/navigraph-vs-free/379287](https://forums.flightsimulator.com/t/navigraph-vs-free/379287)
4. Free alternatives exist and are "good enough" for some: pilots cite Chartfox + VFRMap as no-cost substitutes, undercutting the case for a paid moving-map/chart subscription for sim-only users. — [forums.flightsimulator.com/t/navigraph-vs-free/379287](https://forums.flightsimulator.com/t/navigraph-vs-free/379287)
5. Related navdata pain in the same X-Plane 12 forum category ("Navigational data failed," "Nav Data not Updating (XP12)") shows recurring friction getting Navigraph-sourced navdata to load correctly into X-Plane 12's FMS, a cycle-mismatch/compatibility theme directly relevant to Avionix's own navdata plans. — [forums.x-plane.org/forums/topic/308173](https://forums.x-plane.org/forums/topic/308173-navigational-data-failed/), [forums.x-plane.org/forums/topic/305389](https://forums.x-plane.org/forums/topic/305389-nav-data-not-updating-xp12/) (titles only; both blocked on direct fetch)

**UX patterns worth copying/avoiding:**
- Copy: cloud-relay option so a tablet doesn't have to be on the same LAN/subnet as the sim PC — valuable when phones are on a guest Wi-Fi or a different VLAN.
- Avoid: splitting one workflow (navdata + charts + moving map + FMS injection) across multiple separately-installed tools (Charts app, Simlink plugin, FMS Data Manager) — this fragmentation is exactly what produced the "Lost in Navigraph" complaint.
- Avoid: gating the moving map behind the top subscription tier without making that clear before signup (a repeatedly-cited frustration in the wider EFB market, per the ipadpilotnews-style paywall complaint pattern found during Navigraph pricing search).

---

## 5. Little Navmap (desktop; the de facto reference moving map for X-Plane users)

**Identity:** Little Navmap, by Alexander Barthel (albar965), free/open-source. Windows/macOS/Linux desktop app; not mobile, but the most commonly cited "moving map for X-Plane" among simmers, so included per the brief. Supports FSX, P3D, MSFS 2020, and X-Plane 11/12. Actively maintained on GitHub. (Source: [github.com/albar965/littlenavmap](https://github.com/albar965/littlenavmap), [littlenavmap.org manual](https://www.littlenavmap.org/manuals/littlenavmap/release/latest/en/))

**Connection to X-Plane:** A companion plugin, "Little Xpconnect," installed into X-Plane's Plugins folder, streams simulator data to Little Navmap over a local connection; Little Navmap also runs its own internal web server so a phone/tablet on the same network can view a read-only version of the moving map in a browser — effectively Little Navmap's own "mobile companion" story without a native app. (Source: [albar965.github.io/littlenavmap.html](https://albar965.github.io/littlenavmap.html))

**Features:**
- *Live monitoring:* detailed VFR-style map, AI/multiplayer traffic, airport weather, winds aloft, MORA grid, compass rose, customizable traffic patterns.
- *Flight planning:* full route planner with SID/STAR/approach procedure support, drag-and-drop plan editing, and export to many formats including native X-Plane FMS format — a genuine two-way plan/FMS interchange, unlike most mobile EFBs in this category.
- *Nav data:* uses X-Plane's own navdata plus optional add-on scenery/AIRAC data; strong airport/procedure database browsing.
- *Logbook/replay:* built-in logbook that auto-records flights, including the flown track, exportable to GPX — a "just works" recording feature none of the mobile-first EFBs above match natively.
- *Multi-device:* the built-in web server is the closest thing to "multi-device," letting any browser on the LAN see the map.
- *Offline:* fully offline-capable (desktop app with local databases); only the browser-view mode needs the LAN.

**PRAISE:**
1. Users on X-Plane's own forum describe it as "free and excellent." — [search synthesis of forums.x-plane.org comments](https://forums.x-plane.org/files/file/41694-little-navmap/)
2. The built-in logbook and GPX-exportable track recording is highlighted as a stand-out feature versus needing a third-party recorder. — [github.com/albar965/littlenavmap README](https://github.com/albar965/littlenavmap)
3. Broad export format support (GFP, FPL, GPX, RTE, FLP, X-Plane FMS) is called out as best-in-class for getting a planned route into the actual sim FMS — the two-way sync other EFBs in this list lack. — [github.com/albar965/littlenavmap README](https://github.com/albar965/littlenavmap)
4. A dedicated third-party review ("Review - Alexander Barthel's Little Navmap for X-Plane By Paul Mort") exists and is positive enough that the author republishes it on the project site — a sign of strong reputation in the X-Plane community. — [albar965.github.io/news/2018/09/19/littlenavmap-flightsimcom-review.html](https://albar965.github.io/news/2018/09/19/littlenavmap-flightsimcom-review.html)

**COMPLAINTS:**
1. Plugin registration friction: a user reported "Install Little Xpconnect in X-Plane Plugins" greyed out in the Tools menu, and couldn't get X-Plane to recognize the plugin even after installing it manually into the Plugins folder — a direct parallel to the ForeFlight/Navigraph "plugin not detected" pattern. — [search synthesis of forums.x-plane.org/files/file/41694-little-navmap comments](https://forums.x-plane.org/files/file/41694-little-navmap/)
2. A dedicated "XP12 Compatibility List" thread existing at all signals recurring version-compatibility questions every time X-Plane 12 updates. — [forums.x-plane.org/forums/topic/311183-little-navmap](https://forums.x-plane.org/forums/topic/311183-little-navmap/) (title only)
3. *(Inference)*: because it's desktop-only with no native mobile app, users wanting a true tablet-in-hand experience must rely on its basic web-view server rather than a purpose-built touch UI — this is a reasonable inference from the feature description, not a sourced complaint.

**UX patterns worth copying/avoiding:**
- Copy: native, bidirectional FMS-format export/import — this is the single most differentiating feature versus the EFB apps above, and directly matches Avionix's stated goal of both monitoring and controlling FMS/GPS.
- Copy: automatic flight logbook + track recording with no separate tool needed.
- Avoid: leaving the companion device experience as an afterthought (a generic embedded web page) when the core product is desktop-first — Avionix's differentiation should be a first-class mobile app with this level of planning depth, not a browser bolt-on.

---

## 6. FltPlan Go

**Identity:** FltPlan Go, by FltPlan.com (owned by Universal Weather and Aviation). iOS/Android. Free (FltPlan's flight-planning service has long been free, monetized via other Universal Weather services). Sim support dates to X-Plane 10 (2014) and was later extended informally to MSFS via community tools. Update cadence appears slower/less actively marketed than ForeFlight or Garmin Pilot. (Source: [fltplan.com PDF, 2014](https://www.fltplan.com/fltplanhtmimages/fltplan_x-plane_04-02-2014.pdf), [FltPlan X-Plane connectivity instructions](https://flttrack.fltplan.com/TutorialPDFs/X-Plane_Instructions.pdf))

**Connection to X-Plane:** In FltPlan Go: External menu > Simulators category > select "X-Plane"; status turns green/"Connected" after a few seconds. Requires "Enable Ship Position" toggled on in FltPlan Go settings, or the aircraft won't appear on the map even when "Connected." (Source: [FltPlan X-Plane Instructions PDF](https://flttrack.fltplan.com/TutorialPDFs/X-Plane_Instructions.pdf))

**Features:** Live position/flight data on FltPlan Go's map; real-world airport info and terminal procedures reused for sim flying; free flight planning and filing tools (real-world focus); no confirmed FMS two-way sync.

**PRAISE:**
1. Explicitly pitched by the vendor and picked up in press coverage as a way for "pilots who don't fly often... to practice workflows and procedures... in real time environments" — free-of-charge, which multiple secondary sources flag as a differentiator versus paid EFBs. — [fltplan.com press PDF, 2014](https://www.fltplan.com/fltplanhtmimages/fltplan_x-plane_04-02-2014.pdf)
2. The connect flow ("select X-Plane, wait a few seconds, status turns green") is described as simple relative to legacy-sim UDP configuration. — [FltPlan X-Plane Instructions PDF](https://flttrack.fltplan.com/TutorialPDFs/X-Plane_Instructions.pdf)

**COMPLAINTS:**
1. A forum thread "FltPlan Go with X-Plane 11" on PilotEdge Forums exists specifically because the connection wasn't obvious for a newer X-Plane version at the time — again the recurring "worked on old version, unclear on new version" theme. — [forums.pilotedge.net/viewtopic.php?f=12&t=8365](https://forums.pilotedge.net/viewtopic.php?f=12&t=8365) (title only; page not independently fetched)
2. The "Enable Ship Position" setting is a separate, easy-to-miss toggle from the main Connect action — the official instructions explicitly warn "If you don't see your plane on the map, make sure you've turned on 'Enable Ship Position.'" This is a self-documented UX footgun. — [FltPlan X-Plane Instructions PDF](https://flttrack.fltplan.com/TutorialPDFs/X-Plane_Instructions.pdf)
3. *(Inference)*: FltPlan Go's sim integration content is dated (last clearly documented/publicized around 2014), suggesting it may be a lower priority for the vendor relative to ForeFlight/Garmin Pilot's more recent sim-focused marketing — inferred from the age of the sources found, not a direct complaint.

---

## 7. XMapsy

**Identity:** XMapsy, an independent connector tool (not an EFB itself) that bridges FSX/P3D/MSFS 2020/2024 and X-Plane 10/11 to third-party EFB apps (ForeFlight, Garmin Pilot, WingX Pro, SkyDemon, etc.) via simulator protocol or GDL-90/ADS-B emulation. Windows desktop utility, in continuous development since 2009; V3 released 2019+. Likely free/donationware or low-cost shareware (exact pricing not confirmed in sources reviewed). (Source: [xmapsy.com](https://xmapsy.com/), [XMapsy V3 short instructions PDF](https://xmapsy.com/downloads/XMapsyV3demoversion.pdf))

**Connection to X-Plane:** Acts as a bridge/relay rather than talking to X-Plane's Web API directly — sits between the sim's native output and the mobile EFB's expected protocol, useful when a given EFB doesn't natively support X-Plane's format or version.

**Features:** Transmits AI traffic in addition to ownship position/AHRS; automatic flight recording to GPX/KML with automatic departure/destination airport naming — a built-in "logbook" feature not common among the mobile-first apps above.

**PRAISE:**
1. Longevity and continuous development "since 2009" is cited as a trust signal in a niche compared to newer, sometimes-abandoned bridge tools. — [xmapsy.com](https://xmapsy.com/)
2. Automatic GPX/KML recording with automatic airport-based file naming is called out as a convenience feature absent from most direct EFB integrations. — [xmapsy.com](https://xmapsy.com/)
3. Broad EFB compatibility (ForeFlight, Garmin Pilot, WingX Pro, SkyDemon, and more) via one bridge tool is presented as reducing the "does my EFB support my sim" problem. — [xmapsy.com](https://xmapsy.com/)

**COMPLAINTS:** No first-hand user complaint threads were found for XMapsy specifically in this research pass (search results returned mostly vendor material). This is a coverage gap — flagged explicitly rather than inferred or invented. *(Inference, unsourced)*: as a third bridge layer (sim → XMapsy → EFB) it likely adds its own setup/configuration surface (drivers, protocol selection) on top of each EFB's own connection screen, compounding the general "networking setup" pain seen across this whole category — this is a reasonable extrapolation from its architecture, not a sourced complaint.

---

## 8. AviTab (in-sim tablet plugin, not a mobile app — included per brief)

**Identity:** AviTab, a free/open-source X-Plane plugin (not a phone app) providing an in-cockpit virtual tablet with a PDF viewer and moving map, VR-compatible. Requires X-Plane 11.20+; community reports confirm X-Plane 12 compatibility. Actively maintained by community contributors. (Source: [forums.x-plane.org/files/file/44825-avitab](https://forums.x-plane.org/files/file/44825-avitab-vr-compatible-tablet-with-pdf-viewer-moving-maps-and-more/))

**Connection to X-Plane:** Runs as a native in-sim plugin — no network/IP setup at all, since it renders directly inside the X-Plane 3D cockpit (a fundamentally different, zero-network-friction model worth noting as a contrast point).

**Features:** Online/offline moving maps, custom-map calibration (users can scan and geo-calibrate their own paper charts), Navigraph chart integration, some aircraft ship with a modeled 3D tablet for AviTab to render onto.

**PRAISE:**
1. Called "a great free plugin with a moving map integrated into xplane" and "well worth a look" in a Steam community discussion. — [aggregated from Steam community discussion, cited in search synthesis](https://forums.x-plane.org/files/file/44825-avitab-vr-compatible-tablet-with-pdf-viewer-moving-maps-and-more/)
2. Zero network setup — being fully in-sim is implicitly praised by virtue of being the simplest possible "connection" story in this whole category (no IP, no port, no Wi-Fi).
3. VR compatibility is specifically called out as a differentiator versus mobile EFB apps, which are unusable while in a VR headset. — [forums.x-plane.org/files/file/44825-avitab](https://forums.x-plane.org/files/file/44825-avitab-vr-compatible-tablet-with-pdf-viewer-moving-maps-and-more/)

**COMPLAINTS:**
1. "Their map section isn't close to what is on LittleNavMap and can't integrate that map in to Avitab" — a direct user comparison rating AviTab's moving map as inferior to Little Navmap's. — [search synthesis of Steam/forum comparison](https://forums.x-plane.org/files/file/44825-avitab-vr-compatible-tablet-with-pdf-viewer-moving-maps-and-more/)
2. A dedicated Navigraph forum thread "Moving map charts with avitab in x plane" exists because getting Navigraph charts to show correctly inside AviTab's moving map is non-trivial. — [forum.navigraph.com/t/moving-map-charts-with-avitab-in-x-plane/15331](https://forum.navigraph.com/t/moving-map-charts-with-avitab-in-x-plane/15331) (title only, not independently fetched)

**UX pattern worth noting:** AviTab proves that an in-sim, zero-network tablet is a real and well-liked alternative to a phone-based companion — but it cannot be used from a separate physical device, which is exactly the gap Avionix (a real second device) is positioned to fill better.

---

## Cross-Product Findings (summary)

1. **Connection setup is the single biggest recurring pain point across the entire category.** Every direct-UDP app (ForeFlight, Garmin Pilot, SkyDemon, FltPlan Go) requires manual same-Wi-Fi + IP/port configuration, and nearly every product has multiple support-forum threads dedicated to "it won't connect" or "it disconnects after a few seconds" (e.g., [ForeFlight 10-second drop](https://forums.x-plane.org/forums/topic/307366-xplane-12-and-foreflight-looses-connection-after-10-secs/), [Little Navmap plugin not detected](https://forums.x-plane.org/files/file/41694-little-navmap/)). Avionix's Web API/WebSocket-based approach can differentiate strongly here with a heartbeat/reconnect UX and clear on-device diagnostics.
2. **Two-way plan sync (EFB plan → sim FMS) is largely unsolved** among the mobile-first EFBs — ForeFlight users run a 34-post thread just trying to get a plan into X-Plane's FMS ([topic 283018](https://forums.x-plane.org/forums/topic/283018-getting-a-foreflight-flightplan-in-to-xplane/)), while desktop-only Little Navmap is the one product that does bidirectional FMS-format export/import well. This is a clear opening for Avionix to lead with genuine two-way FMS/GPS control, not just monitoring.
3. **Navdata/AIRAC currency and cost is a real tension for sim-only users.** Navigraph users openly debate whether a paid subscription is worth it "just for the sim" ([forums.flightsimulator.com/t/navigraph-vs-free/379287](https://forums.flightsimulator.com/t/navigraph-vs-free/379287)), citing free alternatives (Chartfox, VFRMap, SkyVector) as good enough for casual flying — Avionix should think carefully about whether/how it charges for any navdata-dependent features.
4. **Version-compatibility churn is chronic.** X-Plane 12 updates, iOS/app updates, and even specific ForeFlight point releases repeatedly break these integrations (multiple threads titled around "stopped working" or version numbers), suggesting the market has low tolerance for brittle integrations and rewards visible compatibility signaling.
5. **Logbook/track-recording is an underserved feature among mobile EFBs** — only Little Navmap (desktop) and XMapsy (bridge tool) offer it natively; ForeFlight users need a third-party tool (42fdr) just to replay their own recorded flights back into X-Plane. A built-in flight-record/replay feature in Avionix would meet a demand visible across multiple products' gaps.

---

### Access limitations disclosed
- `forums.x-plane.org` non-file topic pages (e.g., topics 276154, 283018, 304396, 307366, 330304, 347175, 311183, 305389, 308173) returned HTTP 403 to direct WebFetch in this session; findings for these are based on thread titles and search-engine result snippets, not full page reads. This is flagged inline above wherever used.
- `avsim.com` and `forums.skydemon.aero` also failed to load directly (403 / TLS certificate mismatch respectively); SkyDemon and one ForeFlight community thread rely on snippet-level data only.
- No dedicated Reddit (r/flightsim, r/Xplane) threads on this topic surfaced through search in this session despite repeated targeted queries; this may reflect indexing gaps rather than absence of discussion.
