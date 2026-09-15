# Competitor research: generic remote-control / radio-stack / autopilot-panel / button-box apps for X-Plane

Scope: phone/tablet remote-control, radio-panel, autopilot-panel apps, plus deck-style hardware controllers (Stream Deck, Loupedeck, Touch Portal) for X-Plane. Researched via web search and web-fetch of app store listings, vendor sites, GitHub repos, and forums.x-plane.org search snippets (direct fetches of forums.x-plane.org threads returned HTTP 403 — Cloudflare-blocked; content below from those threads comes only from search-result snippets, marked as such).

---

## 1. X-Plane Control Pad / "X-Plane 12 Control Pad" (Laminar Research, official)

**Identity:** Free, first-party app by Laminar Research. URL: https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565. iOS/iPadOS only (no Android). Connects over local Wi-Fi/LAN (same-network discovery, no plugin required — this is Laminar's own Instructor/Operator Station, distinct from the old consumer "X-Plane Remote"). Actively maintained (v1.05, July 2025 per App Store). The original pre-XP12 "X-Plane Control Pad" app is a separate, older listing with the same lineage; Laminar's official X-Plane Remote for iPad was discontinued and "replaced by EFIS App" per x-plane.com (https://www.x-plane.com/mobile/iphone/remote/).

**Features:** Instructor/operator-station style, not a cockpit-panel replacement: aircraft/airport/position selection, weight & balance, full weather/environment control, ~1,000 injectable system failures, a moving map (plan/profile views, saved speed/altitude preferences), a command console for raw datarefs, situation save/load, pause/quit/shutdown-host controls. No radio-tuning UI, no per-instrument cockpit panel, no custom user-defined button mapping.

**Praise (sourced):**
- "Great for instructing... fantastic to throw issues at a pilot, like a bird strike" — App Store review, via https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
- "I teach my friends how to fly with this" — App Store review, same URL.
- Reviewer Angelique van Campen: the app lets you "control many parameters within X-Plane" with near-instantaneous effect — https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
- Same review: "This FAIL button and all its sub options is great since it helps you understanding the aircraft much more" — https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
- Map feature praised for real-time positioning and multiple visualization options — same review.

**Complaints (sourced):**
- "After connecting to the sim all it will let me do is pause, quit xplane, shut down my computer" — App Store review, https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565 (functionality appeared broken/limited for this user).
- Overall rating only 3.6/5 from 23 ratings — interface criticized as "not intuitive" — same URL.
- **VPN incompatibility**: connection to the desktop fails outright while a VPN (ExpressVPN) is active, forcing users to disable VPN — https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
- No Android version at all — same review.
- No in-app manual/help beyond basic instructions; confusing "Shut Down Computer" labeling required contacting the developer to understand — same review.
- Performance degrades on older iPads and with complex add-on aircraft (slow load times) — same review.
- Some users hit version-compatibility dead ends: the original (pre-XP12) app directs users to a replacement app for XP12 that some couldn't find on the store — search snippet from forums.x-plane.org / App Store metadata (https://forums.x-plane.org/forums/topic/275846-x-plane-control-pad-app-for-xp12-beta/).

**UX patterns to copy/avoid:** Copy — instant environment/failure injection is genuinely loved by instructors; a live map with saved view-preferences is a nice touch. Avoid — shipping a network feature that silently breaks under common consumer setups (VPN) with no in-app diagnostic message; leaving a big capability/UX gap between iOS and Android.

---

## 2. Flight Sim Remote Panel / Flight Sim Remote Panel 2 (Baltazar Studios)

**Identity:** Free Android app (no ads, optional donation), by Baltazar Studios. URLs: https://play.google.com/store/apps/details?id=org.baltazar.XPlaneRemotePlus2, product page https://baltazarstudios.com/flight-sim-remote-panel/. Supports X-Plane 11/12 desktop (Win/Mac partial — "no macOS plugin currently"). Connects via a custom X-Plane plugin (an ExtPlane-style wrapper) installed on the desktop; devices join over LAN with manual IP entry. Long-lived: originally built in 2012 and still distributed, "hundreds of sim enthusiasts have used these plugins... for over a decade" (vendor site). Rated 4.40/5 from 75 Google Play ratings (via search-result snippet of https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc).

**Features:** Three customizable instrument panels (choose from 6 basic GA gauges: IAS, ADI, altimeter, turn coordinator, heading indicator, VSI) plus a fourth panel showing a Bendix/King KM24 audio-control panel and dual KX155 NAV/COMM radio stack. No autopilot control, no custom dataref mapping, no aircraft-specific panels — generic GA instruments only.

**Praise:**
- Free with no ads and no IAP, generous for what it does — vendor site https://baltazarstudios.com/flight-sim-remote-panel/.
- "The gauges are ok, the connection is simple" — Google Play review via search snippet of https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc.
- Long track record: a decade of continuous use referenced by the developer and community — vendor site.
- One reviewer gave 3 stars specifically "because it's free," i.e., valued despite flaws — same appgrooves snippet.
- Simple three-panel layout switching is appreciated for basic instrument scanning — vendor site description.

**Complaints:**
- "the radio stack is mushy and difficult to operate ... still impossible to use on an 8 inch screen" — Google Play review via appgrooves.com snippet (search result).
- Radio-stack graphics described as blurry with frequency knobs hard to manipulate on phone-size screens — same source.
- "It does show its age" (app dates to 2012, dated UI) — developer's own description, baltazarstudios.com.
- Heading-indicator drift reported (~30° off) by some users — baltazarstudios.com support notes.
- Requires an older Microsoft Visual C++ 2015 redistributable on the host — setup friction — baltazarstudios.com.
- No macOS host-plugin support, limiting the audience to Windows hosts — baltazarstudios.com.

**UX patterns:** Copy — dead-simple, free, single-purpose scope keeps it usable for over a decade. Avoid — UI elements sized for desktop mouse control ported unchanged to small phone screens (a recurring complaint pattern across nearly every legacy app in this category).

---

## 3. XP Remote – Voice Commands (PlanetCoops)

**Identity:** Android app, free with a paid "Pro" tier (exact price not published on the pages fetched). URL: https://www.planetcoops.com/apps/xp-remote, Play listing: https://play.google.com/store/apps/details?id=com.planetcoops.android.xplaneremote. Requires X-Plane 11/12 64-bit plus a customized ExtPlane plugin (planetcoops fork) on the host; the FlightFactor A320 Ultimate profile additionally needs the FFA320Connector plugin. Actively maintained — vendor changelog references X-Plane 12.4.1+ compatibility fixes.

**Features:** Voice control (200+ built-in commands) of autopilot/autothrottle modes, radio frequency tuning, and aircraft-specific system control; broadcasts aircraft GPS position to other Android map apps. Ships with dedicated command profiles for Zibo 737, EADT x737, FlightFactor 757/767, ToLiss Airbus family, FlightFactor A320 Ultimate, Hot Start TBM 900, and SSG 747-8, plus a generic profile — this is the most aircraft-type-aware app found in this category outside of the deck-controller ecosystem.

**Praise:**
- Broadest per-aircraft voice-command profile library found in this category (Zibo, ToLiss, FlightFactor, Hot Start, SSG) — https://www.planetcoops.com/apps/xp-remote.
- Voice hands-free operation is a distinctive feature no other app in this survey offers.

**Complaints:**
- Depends on a forked/custom ExtPlane build that must track X-Plane point releases; vendor's own release notes warn "X-Plane 12.4.1+ crash? Please update to the latest ExtPlane plugin" — https://www.planetcoops.com/apps/xp-remote, confirming breakage after sim updates is a known recurring issue.
- "This device does not support speech recognition" error reported by some Android users at launch — search-result snippet referencing Play Store reviews.
- Setup requires manually installing a non-stock plugin into Resources/plugins — a barrier compared to a zero-plugin Web API approach.

**UX patterns:** Copy — aircraft-specific profiles instead of one-size-fits-all generic panel. Avoid — coupling the app tightly to a third-party plugin fork that lags behind X-Plane point releases, a direct cause of user-visible breakage.

---

## 4. XpRemotePanel (iOS/iPadOS/macOS/visionOS)

**Identity:** Free with IAP (Navigation Pack $6.99). URL: https://apps.apple.com/us/app/xpremotepanel/id1576583318. 3.7/5 from 7 ratings. Actively maintained (v3.2.1, Jan 2025). Uses X-Plane's standard network data interface for gauges; the FMS/CDU feature requires an added X-Plane plugin.

**Features:** PFD (attitude/speed/altimeter/autopilot), directional gyro with heading bug, COM stack with numeric keypad frequency entry, KFC-200-style autopilot panel, FMS/CDU for B737/A330-style boxes including Zibo Mod support; optional NAV pack adds NAV stack, CDI, HSI, G1000 keypad.

**Praise:**
- "solves the core problems really well and at a good price" — App Store review, https://apps.apple.com/us/app/xpremotepanel/id1576583318.
- Keypad frequency entry called out as better than mouse-clicking knobs in the sim — same source.
- "makes sim flying much more comfortable" as a budget alternative to real hardware panels — same source.
- Cross-platform reach (iPhone, iPad, Mac via Catalyst/M1, visionOS) is unusually broad for this niche.
- Zibo-mod CDU support specifically called out as valuable by reviewers.

**Complaints:**
- Low review volume (7 ratings) limits confidence in broad satisfaction; no visible detailed complaint text was retrievable beyond store metadata.
- CDU functionality gated behind an extra plugin install, adding setup friction beyond the base app.

*(Note: complaint sourcing for this app is thinner than others — could not retrieve full review text beyond the App Store summary blurb.)*

---

## 5. Comsquawk XP (new, 2025)

**Identity:** iOS/iPadOS "sidecar" app, URL: https://apps.apple.com/pt/app/comsquawk-xp/id6756874303 (page returned 404 on fetch — likely region-locked or since delisted/renamed; identity confirmed only via search snippet). Purpose-built as a narrow radio/transponder companion: COM frequency control and transponder (squawk) code entry, nothing else. Represents the "single-purpose radio sidecar" pattern rather than a full panel replacement.

**Note:** Could not access the live listing directly (404); details are limited to the search-result description: "a sidecar app for iOS and iPadOS for controlling your plane's COM radio frequencies and transponder functions." No praise/complaint quotes could be sourced for this one — flagged explicitly as unverified beyond the search snippet.

---

## 6. RemoteFlight COCKPIT HD / RADIO HD (RemoteFlight.net)

**Identity:** iOS apps, vendor site https://www.remoteflight.net/, App Store: https://apps.apple.com/us/app/remoteflight-cockpit-hd/id541400383 and https://apps.apple.com/ca/app/remoteflight-radio-hd/id511250097. Supports X-Plane (Windows/macOS) and other sims. Long-running product line (IDs suggest a 2012-era app, still listed).

**Features:** COCKPIT HD is a full touch-enabled cockpit panel replacement letting the desktop show full-screen scenery while gauges live on the iPad; multiple VFR/IFR layouts. RADIO HD provides COM1/2, NAV1/2, ADF1/2, and DME panels with "beautifully rendered & animated" gauges and multiple switchable layouts.

**Praise/complaints:** Vendor site provided no pricing, review counts, or user quotes, and the App Store pages were not fetchable with review text in this pass — flagged explicitly: no sourced praise/complaint quotes available for this product beyond the vendor's own marketing copy, which should not be treated as user sentiment.

**UX pattern:** Splitting "radio stack" into its own dedicated app (RADIO HD) separate from the full cockpit panel (COCKPIT HD) is a packaging pattern worth noting — lets users buy only what they need.

---

## 7. Flight Deck ONE / Flight Deck FMS / Flight Deck AR (2024–2026, actively developed)

**Identity:** iPad/iPhone apps, vendor site https://flightdeckone.app/, App Store: https://apps.apple.com/us/app/flight-deck-one/id6742143273 and https://apps.apple.com/us/app/flight-deck-fms/id6753941713. Free base app with IAP: "Premium" $129–$1,299 (per-aircraft or bundle tiers), aircraft packs $149–$299, GA packages $149–$179 — among the most expensive apps found in this category. Requires iPadOS 18+, X-Plane 11/12 on Win/Mac/Linux, same-LAN connection, **no plugin required** — connects over UDP (per App Store metadata) rather than the Web API, though this is the newest, most actively developed product surveyed (releases dated as recently as July 2026 on the vendor site, e.g. "Flight Deck FMS Foxtrot 1," "Flight Deck ONE Delta 5").

**Features (by far the broadest feature set found in this category):** Real-time MCP/EFIS/autopilot/radio/transponder control; 70+ officially supported aircraft with 120 "avionics modules" (Zibo 737, ToLiss A319/A321/A340, Laminar defaults, etc.); custom cockpit dashboard builder; automatic pilot logbook with real-world export formats; "Black Box" flight-data recorder with graphs/telemetry and an AI-generated flight debrief; "My Hangar" fleet manager; EFB with SimBrief integration; ATC clearance scratchpad; ground-services control (pushback, GPU, chocks); media gallery; a companion FMS/CDU app and an AR head-tracking companion app requiring no extra hardware.

**Praise:**
- Only 1 rating visible (5.0/5) at time of research — too small a sample to generalize, but notable that the aggregate feature scope (logbook + EFB + black-box analytics + AR head tracking) is unmatched by any other product surveyed — App Store, https://apps.apple.com/mx/app/flight-deck-one/id6742143273.
- Breadth of aircraft support (70+, 120 avionics modules) is the largest of any app in this survey — same source and vendor site https://flightdeckone.app/.
- No plugin install requirement, lowering the setup bar relative to ExtPlane-based competitors — App Store metadata.

**Complaints:** Review volume is too low (1 rating) to source real user complaints; none found in forum or Reddit searches (forums.x-plane.org search turned up nothing under this name, and no Reddit threads were found). This is flagged explicitly as an information gap — the product is new enough that community sentiment has not yet formed publicly, or exists in currently-inaccessible App Store review text.

**Business-model risk (inference, not sourced):** the tiered per-aircraft IAP pricing up to $1,299 is a business model outlier in this space — most competitors are free or under $20 — and is worth watching for backlash once review volume grows.

**UX patterns:** Copy — bundling logbook/EFB/analytics turns a "remote panel" into a daily-use companion app (this is close to Avionix's own ambition); no-plugin LAN pairing lowers setup friction. Avoid (if unverified) — aggressive per-aircraft/tier IAP pricing could alienate a hobby audience used to free ExtPlane-era tools.

---

## 8. SimControlX (instructor station, iPad)

**Identity:** $19.99, iPad, URL: https://apps.apple.com/us/app/simcontrolx/id1380341055. Supports Prepar3D, X-Plane, and ELITE XTS. Connects to a custom server component over Wi-Fi. 3.5/5 from 4 ratings.

**Features:** Worldwide moving map with flight-path tracing, instant repositioning, layered custom weather + real METAR, AI traffic display, dedicated failure injection page, fuel/battery management. Explicitly marketed as NOT for real-world aviation use.

**Praise:**
- A pilot reporting 20,000+ flight hours: the app "does exactly what I want it to do," specifically for practicing engine failures on takeoff — App Store review, https://apps.apple.com/us/app/simcontrolx/id1380341055.

**Complaints:**
- A user reported server crashes and initially inadequate support responsiveness (developer later asked for details by email) — App Store review, same URL.

**UX pattern:** Small, cross-sim (not X-Plane-exclusive) IOS-style tools using a similar formula to Laminar's own Control Pad — this sub-niche (instructor stations) is distinct from cockpit-panel remotes and worth keeping conceptually separate from Avionix's control/monitor scope.

---

## 9. FS-FlightControl (cross-sim instructor station, Win/Android/iOS)

**Identity:** Vendor site https://www.fs-flightcontrol.com/en/. Supports FS2024/FS2020/Prepar3D/FSX/X-Plane 10-12/Dovetail FSW. For X-Plane, "no plug-in installation is required — connection is done directly via UDP." 14-day free trial; paid license (price not disclosed on the fetched page). Cross-platform apps on Windows plus Android/iOS companions.

**Features:** Aircraft repositioning, real-time moving map with VATSIM/IVAO/PilotEdge overlay, flight-planning integration (JeeHell, AST, Project Magenta, FSLabs, Aerosoft, Wilco), weather control incl. Active Sky integration, pushback, fuel/load management, view/slew control, random-failure injection, PFD/TCAS gauge overview, statistics with Google Earth export, and motion/control-loading device monitoring.

**Praise/complaints:** No user review text was retrievable from the vendor homepage; this is the most feature-dense instructor-station tool found but sourcing on user sentiment is a gap — flagged explicitly.

**UX pattern:** Zero-plugin UDP connection to X-Plane (no ExtPlane/FlyWithLua dependency) is the same architectural choice Flight Deck ONE and Avionix's Web-API approach both favor — a trend away from plugin-based bridges toward native/network-native connections.

---

## 10. Touch Portal + X-Plane plugins

**Identity:** Touch Portal (Windows/Mac companion running on a tablet) with two notable X-Plane 12 plugins: "XP-FlightDeck" (https://forums.x-plane.org/forums/topic/336773-control-your-cockpit-and-sim-system-on-your-tablet-x-plane-12-touch-portal-plugin/, also listed at https://x-plane.to/file/1934/) and Coussini's open-source "XPlaneTouchPortalPlugin" (https://github.com/coussini/XPlaneTouchPortalPlugin). Both are free/community plugins layered on the commercial Touch Portal app (Touch Portal itself has a free tier and a paid Pro tier for advanced features/plugins).

**Features:** Bidirectional interactive interfaces between Touch Portal and X-Plane 12 — periodic dataref polling (switch states, control positions, instrument readings) and two-way event triggering (switches, flight controls, radio frequencies) via user-built button grids with icon packs; XP-FlightDeck specifically covers engine, lights, brakes, and flaps plus sim-level functions like camera views and map display.

**Praise/complaints:** Direct fetch of the forums.x-plane.org threads returned HTTP 403 (Cloudflare-blocked), so only the thread titles/descriptions from search results could be used; no verbatim user quotes could be sourced for this pass — flagged explicitly as a sourcing gap.

**UX pattern:** The "user builds their own button grid from primitives (datarefs + commands + icons)" model is exactly the kind of power-user customization that dedicated consumer apps (Control Pad, Flight Sim Remote Panel) don't offer — worth understanding since it's the direct analog to any custom-mapping feature Avionix might add.

---

## 11. Elgato Stream Deck plugins for X-Plane

Several independent, mostly free/open-source options were found, no single dominant one:
- **xplane-streamdeck** (wortelus), https://github.com/wortelus/xplane-streamdeck — Python-based, connects via UDP (pyxpudpserver) plus FlyWithLua Lua handler scripts on the host; ships 500+ custom icons and pre-built layouts for Cessna 172SP, Zibo 737-800 (15/32-key), JARDesign A320, generic G430/530 and G1000. 28 stars, 127 commits, 1 open issue. Known issues (from README/issues): USB-hub instability causing transport errors, occasional dataref-state freezing requiring app restart, and a hard FlyWithLua dependency.
- **xp_streamdeck** (rwellinger), https://github.com/rwellinger/xp_streamdeck — native macOS/Windows plugin for X-Plane 12.1.x+, turns any key into a toggle/commandref-fire/dataref-write/live-readout display.
- **PilotsDeck** — open-source, multi-sim (X-Plane, MSFS, Prepar3D), https://forums.x-plane.org/files/file/83196-pilotsdeck-another-streamdeck-plugin/ (fetch blocked, 403; details from search snippet only).
- **iConCity's official Elgato Marketplace profile "X-Plane 12"**, https://marketplace.elgato.com/product/x-plane-12-7d83314a-eb31-463a-9d75-58630a8c1f20 — a paid/marketplace-listed profile (v1, released Sept 2025) for Stream Deck MK2/XL with custom icons; no price, rating, or review text was retrievable from the page.

**UX pattern:** This whole sub-category treats the aircraft-specific icon/label pack as the differentiator (Zibo 737 gets by far the most community love/support across every tool surveyed — Cessna 172, Zibo 737, and ToLiss Airbus are the three aircraft that recur in every single third-party tool's supported list). Any generic Avionix aircraft-panel feature should assume Zibo 737 compatibility is the de facto community expectation.

---

## 12. Loupedeck (via Cockpitdecks / XMidiCtrl — no official Loupedeck X-Plane support)

**Identity:** Loupedeck has no first-party X-Plane integration or profile (unlike its official MSFS profile). Community bridges: **Cockpitdecks** (https://github.com/devleaks/cockpitdecks) — supports Stream Deck, Loupedeck, Behringer X-Touch Mini and web decks against X-Plane 12.1+, requiring X-Plane 12.1.4+ for its latest release; and **XMidiCtrl** (https://github.com/mauer/xmidictrl), an X-Plane plugin that lets MIDI controllers (including Loupedeck Live in MIDI mode) drive the sim.

**Complaint pattern (inference from lack of official support):** Loupedeck owners must assemble a multi-part community stack (XMidiCtrl plugin + Loupedeck's MIDI mode, or Cockpitdecks) rather than getting a turnkey profile the way MSFS users do — an explicit gap versus Stream Deck, which has several dedicated X-Plane-specific plugins.

---

## 13. XPlaneCDU (Android) and XPlaneMonitor (Android)

**Identity:** Both by developer Wayne Piekarski. XPlaneCDU (https://github.com/waynepiekarski/XPlaneCDU, Play: https://play.google.com/store/apps/details?id=net.waynepiekarski.xplanecdu) is a narrow CDU-only remote for X-Plane 11, explicitly scoped to the Zibo 737 (and SSG 747 per other listings) — "does not provide an FMS, but simply a way to control the existing CDU." XPlaneMonitor (https://play.google.com/store/apps/details?id=net.waynepiekarski.xplanemonitor) adds a moving map and monitoring view. Both are free, open-source, single-developer side projects; direct Play Store fetches were blocked by content truncation in this pass, so review text could not be sourced — flagged as a gap.

**UX pattern:** Extremely narrow single-feature apps (CDU-only, map-only) rather than all-in-one panels — a "do one thing" philosophy that shows up repeatedly in the free/open-source tier of this market, contrasted with the "everything bundled" approach of Flight Deck ONE at the paid end.

---

## Cross-product summary (5 key findings)

1. **The market is fragmented into narrow single-purpose tools** (radio-only, CDU-only, map-only, autopilot-only) built mostly by solo/hobbyist developers on ExtPlane, FlyWithLua, or raw UDP — almost none of the pre-2024 tools use the new X-Plane 12 Web API; Flight Deck ONE and FS-FlightControl are the closest to "modern," and both still describe their link as UDP-based, not the documented Web API/WebSocket.
2. **Breakage after X-Plane point releases is a recurring, named complaint** — XP Remote's own release notes explicitly warn that X-Plane 12.4.1+ requires an ExtPlane plugin update to avoid crashes, and several apps (Control Pad's XP12 transition, XpRemotePanel's plugin dependency) show visible seams between X-Plane major-version generations.
3. **Setup/connection friction is the single most common pain point across every product with retrievable reviews** — VPN blocking the Control Pad, manual plugin installs (ExtPlane/FlyWithLua) required by nearly every Android/desktop-bridge tool, and small-screen usability failures (radio knobs "impossible to use on an 8 inch screen") recur independently across unrelated vendors.
4. **Zibo 737 is the de facto aircraft-compatibility baseline** the whole ecosystem builds around (XP Remote, XpRemotePanel, XPlaneCDU, xplane-streamdeck, Flight Deck ONE all name it explicitly); ToLiss Airbus and Cessna 172 are the next tier. Any Avionix aircraft-specific panel should treat Zibo 737 support as table stakes for credibility with this community.
5. **The category is bifurcating by business model**: legacy tools are free/donation-ware with dated, small-screen-unfriendly UI (Flight Sim Remote Panel, XP Remote, XpRemotePanel), while the newest entrant (Flight Deck ONE, 2024-2026) is pursuing a much more expensive per-aircraft/tier IAP model ($129–$1,299) bundled with EFB/logbook/analytics features well beyond "remote panel" — but has too little public review data yet to know if that pricing is accepted by the community.

## Sourcing gaps (explicit)
- Direct fetches of forums.x-plane.org threads and appgrooves.com returned HTTP 403 / DNS errors; content attributed to those URLs above comes only from search-engine snippets, not full page fetches — noted inline wherever used.
- Comsquawk XP's App Store page returned 404 on fetch; details are search-snippet-only.
- RemoteFlight (COCKPIT HD/RADIO HD), FS-FlightControl, PilotsDeck, XPlaneCDU, and XPlaneMonitor had no retrievable user review text in this research pass — flagged in each section rather than inventing quotes.
- No Reddit threads (r/Xplane, r/flightsim, r/HomeCockpit) specifically discussing any of these apps could be located via search in this session; this is noted as an inference-free gap rather than a claim that no such discussion exists.
