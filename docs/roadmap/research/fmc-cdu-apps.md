# Competitor research: FMC / CDU / FMS remote apps for X-Plane

Scope: apps that put an airliner FMC/CDU (or a broader avionics remote panel that includes one) on a phone, tablet, or browser, connected to X-Plane. Researched via web search and web fetch of vendor sites, X-Plane.org, App Store/Play Store listings, and independent review sites. `forums.x-plane.org` blocks direct fetching (HTTP 403 on every attempt) — content from that domain below comes only from Google's indexed search snippets, and is marked as such.

---

## 1. WebFMC / WebFMC Pro — Green Arc Studios

**Identity.** Vendor: Green Arc Studios. Site: greenarcstudios.com. Platforms: plugin runs on Windows/macOS/Linux inside X-Plane; client is any browser (Chrome on PC/Android, Safari on iOS) — no client app to install. Pricing: WebFMC (free, Zibo 737-800/-900 only) vs. WebFMC Pro XP11 $19.99 and WebFMC Pro XP12 $29.99. Sims: X-Plane 11 and 12 only. Connection: an X-Plane plugin serves the CDU over HTTP on the local network (historically port 9090); the browser client renders it — not the Web API, but architecturally the same idea (local HTTP server exposing sim state). Activity: actively maintained — Pro XP12 was at v2.7.0 as of an "8th Anniversary" update in 2026 per X-PlaneReviews news posts ([xplanereviews.com](https://xplanereviews.com/forums/topic/18992-news-webfmc-pro-xp12-updates-to-version-270-8th-anniversary/), [greenarcstudios.com](https://greenarcstudios.com/)).

**Features.**
- *Connection/setup:* drop plugin into X-Plane's plugin folder, browse to the PC's local IP from any device ([fsnews.eu](https://fsnews.eu/review-webfmc-pro/)); supports iOS "Add to Home Screen" for an app-like full-screen experience (Safari only) ([x-plained.com](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/)).
- *Navigation/FMS/CDU:* this is the whole product — remote CDU/MCDU for 30+ payware/freeware aircraft (ToLiss A-series, FlightFactor 757/767/777/A320/A350, Rotate MD-80, Zibo 737-800, IXEG 737, Hot Start CL650, and more) ([greenarcstudios.com](https://greenarcstudios.com/)); dual-CDU support with instant capt/F.O. switching.
- *Aircraft-specific rendering:* aircraft-accurate textures/keyboard layouts and a "wear and smudge" skin for immersion ([x-plained.com](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/)).
- *No* autopilot/radio/instrument/surveillance control — strictly CDU-scoped.
- *Multi-device:* any number of browsers can connect simultaneously on the LAN.
- No offline/demo beyond the free 737-only tier.

**Praise (sourced).**
1. "I did not have a single problem while using it" — reviewer reports zero bugs across testing. [fsnews.eu](https://fsnews.eu/review-webfmc-pro/)
2. Remote-device workflow called "much easier and better" than the in-sim popup CDU on the main monitor. [x-plained.com](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/)
3. "Effective communication protocol" — transmits only the CDU text that actually changed, keeping latency and bandwidth low. [x-plained.com](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/)
4. Works fine on older/low-end hardware and older iPad iOS versions. [fsnews.eu](https://fsnews.eu/review-webfmc-pro/)
5. Broad aircraft coverage (30+ types) cited as a major differentiator vs. single-aircraft tools. [greenarcstudios.com](https://greenarcstudios.com/)

**Complaints (sourced).**
1. Only Safari supports "Add to Home Screen" full-screen mode on iOS; Firefox/Opera Mini users don't get the app-like experience. [x-plained.com](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/)
2. Documentation/manual screenshots are outdated and Windows-only despite the plugin being cross-platform. [x-plained.com](https://www.x-plained.com/utility-review-green-arc-studios-webfmc/)
3. A user asked directly whether there is input lag "when using this on an iPhone/iPad," implying it's a live concern for prospective buyers, even though replies indicated it's generally acceptable. (forums.x-plane.org thread, title only visible via search index — content not directly fetchable) [forums.x-plane.org](https://forums.x-plane.org/index.php?%2Fforums%2Ftopic%2F175878-is-there-any-input-lag-when-using-this-on-an-iphoneipad%2F=)
4. Historical reports of "huge lag when triggering 777v2 key commands" through WebFMC before a FlightFactor 777v2 update addressed it — a concrete example of third-party aircraft updates breaking/perf-regressing the CDU bridge. (search-index snippet only) [forums.x-plane.org](https://forums.x-plane.org/index.php?%2Fforums%2Ftopic%2F175878-is-there-any-input-lag-when-using-this-on-an-iphoneipad%2F=)
5. Reviewer explicitly recommends trying the limited free tier before paying, implying the value proposition of Pro is not obvious until you've tested aircraft coverage against your own fleet. [fsnews.eu](https://fsnews.eu/review-webfmc-pro/)

**UX patterns to copy/avoid.**
- Copy: zero-install client (browser-only), aircraft-skinned CDU art, "send only diffs" protocol for low-latency text updates.
- Copy: separate free/paid tiers scoped by aircraft count, letting users validate the connection model for free before buying wider aircraft support.
- Avoid: relying on iOS's Safari-only home-screen PWA behavior as the "full screen" story — this creates the multi-browser inconsistency users complain about.

**Technical note.** WebFMC's plugin almost certainly reads per-aircraft CDU line/style datarefs (same family X-Plane documents for its default FMS, see §8) and re-serves them as text over HTTP/WS to the browser; it explicitly says it moves "FMC contents as text and only small portions that actually changed." This is squarely compatible with a dataref-only integration model like Avionix's Web API access — no in-sim rendering/screenshotting is needed for aircraft that expose text-line datarefs.

---

## 2. AirFMC — Haversine

**Identity.** Vendor: Haversine. URLs: [apps.apple.com/us/app/airfmc/id773310905](https://apps.apple.com/us/app/airfmc/id773310905), downloads/docs at [haversine.com/airfmc](https://haversine.com/airfmc/downloads). Platforms: iPad only (not iPhone) plus a free macOS companion, requires iPadOS 15+/macOS 12+; also lists visionOS 1.0+ support. Price: $19.99 (App Store) / €11.99 (EU store). Sims: X-Plane 9/10/11 and MSFS 2020 (PMDG 737 NG3). Connection: a small free X-Plane plugin streams FMC data over the LAN; AirFMC is explicitly a "repeater" with no flight-management logic of its own. Activity: App Store listing last updated **September 7, 2023** (v1.12.1) — no confirmed update in nearly 3 years as of this research (Sept 2026), a maintenance concern. [apps.apple.com](https://apps.apple.com/us/app/airfmc/id773310905)

**Features.**
- *Connection/setup:* requires installing Haversine's X-Plane plugin; wireless LAN required; VPN software has been reported to interfere with discovery. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
- *Navigation/FMS/CDU:* supports 19+ aircraft — x737 (EADT), UFMC, CRJ-200, FlightFactor 757/767/777, X-FMC, QPAC A320, JAR Design A320neo/A330, IXEG 737 Classic, Zibo 737, ToLiss A319/A321/A340, Rotate MD-80, Hot Start CL650, default airliners; on MSFS, PMDG 737 NG3. [apps.apple.com](https://apps.apple.com/us/app/airfmc/id773310905)
- *Multi-device:* supports a second MCDU for a copilot station via "multicast" so two tablets can show the same or paired CDU. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
- *Customization:* multiple color schemes (brown/light-grey/dark-grey) but no automatic scheme-per-aircraft detection.
- *EFB-adjacent extra:* built-in METAR download.
- No autopilot/radio/instrument/surveillance control — CDU-only, like WebFMC.

**Praise (sourced).**
1. "works perfectly...flawlessly and...fast" with compatible aircraft — App Store review text. [apps.apple.com](https://apps.apple.com/us/app/airfmc/id773310905)
2. Having a remote CDU/MCDU on a second device called "great," especially valuable for home-cockpit builders whose aircraft lack a native 2D popup. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
3. Dual-CDU/multicast support for copilot stations praised as useful for home cockpits with two seats. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
4. Broad aircraft list (19+) spanning both freeware (X-FMC, UFMC) and payware (ToLiss, FlightFactor). [apps.apple.com](https://apps.apple.com/us/app/airfmc/id773310905)
5. App Store rating of 4.2/5 across 15 ratings, indicating generally satisfied users. [apps.apple.com](https://apps.apple.com/us/app/airfmc/id773310905)

**Complaints (sourced).**
1. "completely worthless without a simulator game" — App Store reviewer complaining it isn't a standalone FMS trainer. [apps.apple.com](https://apps.apple.com/us/app/airfmc/id773310905)
2. No automatic color-scheme matching per connected aircraft — manual selection required. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
3. Limited documentation; per-aircraft operation guidance is left to the developer/community rather than the app itself. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
4. FlightFactor A320 Ultimate explicitly unsupported at review time — a concrete aircraft-compatibility gap. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
5. macOS Mojave compatibility issues causing crashes, acknowledged by the developer. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
6. VPN software on the network interfering with plugin/client discovery. [x-plained.com](https://www.x-plained.com/utility-review-haversine-airfmc/)
7. No App Store update visible since September 2023 — a maintenance/staleness risk as X-Plane 12 and add-ons keep updating (**inference**, based on the listing's last-updated date).

**UX patterns to copy/avoid.**
- Copy: dedicated copilot/second-station multicast mode.
- Avoid: leaving color/skin selection fully manual per aircraft — auto-detecting the connected type (Avionix already needs to identify the aircraft for panel selection) removes a step users flag as friction.
- Avoid: going quiet on updates — staleness is visible to buyers via store "last updated" metadata and erodes trust in compatibility with a fast-moving sim (X-Plane 12 point releases, Zibo/ToLiss updates).

**Technical note.** Same repeater model as WebFMC: an X-Plane plugin exposes/streams CDU line data, the client only renders it, with no independent FMS logic. Confirms that "read CDU text/style datarefs, render locally" is the standard, working approach across this whole product category.

---

## 3. Flight Deck ONE

**Identity.** Vendor/site: [flightdeckone.app](https://flightdeckone.app/). Platform: iPad (iPadOS 18+), ~367MB app; no companion required on other OSes reported. Price model: freemium — "Starter" free tier (core avionics + primary flight instruments), paid Expansion Packs per aircraft, and a "Premium" all-access subscription; Apple's listing separately shows in-app purchases ranging $0–$1,299 (bundle of many one-off packs, not a single price). Sims: X-Plane 11/12 (Windows/macOS/Linux hosts). Connection: **no plugin required** — the vendor states it "communicates with X-Plane's built-in network interfaces" and finds the sim automatically, "fully synchronized... via UDP" ([flightdeckone.app/one](https://flightdeckone.app/one/), search-index summary). This is broader than a classic UDP dataref stream and may include the X-Plane Web API, though the vendor page does not spell out the exact protocol. Activity: actively developed — App Store listing shows a 2025-era app ID and a companion "Flight Deck FMS" and "Flight Deck AR" app family, suggesting an active roadmap. [apps.apple.com](https://apps.apple.com/mx/app/flight-deck-one/id6742143273)

**Features (broader than pure CDU tools — this is a full remote-cockpit product with CDU as one module).**
- *Connection/setup:* zero-config, no IP entry, no plugin install claimed. [WebSearch summary of flightdeckone.app/getting-started]
- *Monitoring/instruments:* primary flight instruments included in the free tier.
- *Control:* MCP, EFIS, autopilot, radios, transponder — "real-time flight instrument control... fully synchronized with X-Plane." [apps.apple.com](https://apps.apple.com/mx/app/flight-deck-one/id6742143273)
- *Navigation/FMS/CDU:* advanced CDU/MCDU parsing described elsewhere in search results as supporting "multi-line, font-size, and color-coded CDU output," gated behind Premium/expansion packs.
- *Aircraft-specific support:* 70+ officially supported aircraft including Zibo 737, LevelUp-modded 737s, ToLiss A319/A321/A340, Felis 747 Classic, King Air C90, and Laminar defaults.
- *EFB/maps:* SimBrief integration, an EFB module, an automatic pilot logbook, a "Black Box" flight-data recorder/telemetry analyzer, "My Hangar" fleet management, and even a built-in photo/video editor for cockpit media — a much wider surface area than any other product in this category.
- *Customization:* user-buildable custom dashboards ("Decks").
- *Multi-device:* not explicitly documented on the pages fetched.
- *Offline/demo:* free Starter tier acts as the demo.

**Praise/complaints — data limitation.** Only one App Store rating was visible at fetch time (5.0/5, n=1), and no free-text user reviews were retrievable from the pages fetched, so praise/complaint claims here would be unsourced. **This is explicitly flagged as insufficient evidence** rather than invented — treat Flight Deck ONE's user-sentiment picture as unresearched pending more reviews accumulating. The one substantive complaint-shaped signal found is structural, not from a user: the in-app-purchase price ceiling of $1,299 shown on the App Store listing is unusually high for this category and is likely to draw pricing complaints once the app has a larger review base (**inference**).

**UX patterns to copy/avoid.**
- Copy: zero-config discovery of the simulator (no manual IP entry) — this is the single most-requested setup UX across the category, based on the friction this research found elsewhere (VPN interference for AirFMC, manual IP fallback for XPlaneCDU/X-CDU).
- Copy: scoping the FMC/CDU as one module inside a broader "remote cockpit" product rather than a single-purpose tool — matches Avionix's own multi-domain scope (instruments + autopilot + radios + nav + surveillance).
- Caution: a Robinhood-style pack/subscription monetization model ($0–$1,299 IAP range) risks the exact "nickel-and-dimed" backlash seen in other flight-sim add-on ecosystems (**inference** — not yet observed in sourced reviews for this app specifically).

**Technical note.** Vendor language ("built-in network interfaces," no plugin) suggests this may be one of the first competitors leaning on X-Plane 12's native Web API/UDP dataref+command surface rather than a custom plugin — directly analogous to Avionix's own integration path. If confirmed, it would be the closest architectural peer to Avionix in this category. Not independently verified beyond vendor marketing copy.

---

## 4. Android CDU remotes: XPlaneCDU and X-CDU (ExtPlane-based)

**Identity — XPlaneCDU.** Developer: Wayne Piekarski (open source, GPLv3, Kotlin). [github.com/waynepiekarski/XPlaneCDU](https://github.com/waynepiekarski/XPlaneCDU). Free. Android only. Sim: X-Plane 11. Connection: requires the third-party **ExtPanel v2** plugin (an ExtPlane-family plugin) on TCP port 51000; the app reads datarefs providing "CDU text string data." Aircraft: Zibo 737 and SSG 747 only — the README states it "should be possible to extend... to work with other aircraft, but it must provide datarefs for the CDU text strings," and explicitly calls out that the **default X-Plane 737 and most payware aircraft use non-standard datarefs that aren't currently supported.** Activity/status: **unpublished from Google Play on February 14, 2025** per search-index data, though GitHub shows one maintenance commit as recent as August 17, 2026 ("Embed monospace font since some phones override with a variable space font that breaks rendering") after a gap since October 2022 — i.e., abandoned as a distributed app, kept alive only as a source-buildable side project. Google Play history: 4.14/5 over ~300 ratings before delisting. [appbrain.com search snippet]

**Identity — X-CDU.** A near-identical fork/clone concept, developer "L-long" (Play Store id `wiki.crowd.x_cdu`), free, Android, v1.3.4 (updated 2022-09-11). Broader aircraft claim than XPlaneCDU: default X-Plane CDU, ToLiss A319/A321/A340, FlightFactor 757/767/777/A350, Rotate MD-80, SSG 747-8, Zibo 737-800, IXEG 737-300, and more — 30+ types per its Play Store description, also via ExtPlane on TCP 51000. Very low review volume found (≈1 review, 5.0/5; ≈44 installs per one aggregator), suggesting niche/low adoption despite wider claimed compatibility. [play.google.com listing via search index]

**Praise/complaints.** Direct review text was not retrievable for either app (Play Store pages returned no fetchable content and aggregator sites gave only ratings, not review text). **Explicitly noting insufficient sourced review text here** — the one qualitative signal available is the README's own admission of the non-standard-dataref limitation above, which functions as a self-reported "complaint."

**UX pattern (negative example).** Requiring a *second* third-party plugin (ExtPlane/ExtPanel, itself unofficial and lightly maintained) on top of X-Plane is a heavier, more fragile setup than WebFMC/AirFMC's single first-party plugin model — likely a contributor to these apps' low adoption and Play Store delisting relative to WebFMC/AirFMC's much larger, actively maintained user bases.

**Technical note.** Confirms the category pattern again: dataref-per-line CDU text is the mechanism, but only for aircraft whose author chose to publish CDU-text datarefs in a discoverable way. Non-standard/undocumented datarefs (most payware FMCs) require per-aircraft reverse-engineering and mapping work by the app vendor — this is the actual hard problem in this space, not the transport.

---

## 5. X-FMC / XFMC — freeware in-sim FMC (reference, not itself a remote app)

**Identity.** A long-running freeware FMC plugin for X-Plane (originally XP9/10-era) that implements LNAV/VNAV/fuel prediction/SID-STAR using Navigraph PSS/VasFMC-format nav data. [forums.x-plane.org/files/file/16221-x-fmc](https://forums.x-plane.org/files/file/16221-x-fmc/) (title/description only, via search index — page itself not fetchable). Included here because AirFMC explicitly lists X-FMC as one of its supported back-ends, and because a community thread titled "XFMC for X-Plane 12 – A Relaunch" (dated around August 2025 per search snippet) indicates the freeware project lapsed for X-Plane 12 and is being revived by the community — a concrete example of a well-known FMC tool going stale across a sim major-version bump. [forums.x-plane.org/forums/topic/335224](https://forums.x-plane.org/forums/topic/335224-xfmc-for-x-plane-12-a-relaunch/) (thread not fetchable directly; content is search-index summary only — **flagged as low-confidence**).

---

## 6. AviTab (reference: in-sim tablet, not a remote/companion app)

**Identity.** Open-source X-Plane plugin, multiple maintained forks (fpw/avitab is the active upstream). Free. X-Plane 11.20+/12, Windows/macOS/Linux. [github.com/fpw/avitab](https://github.com/fpw/avitab). Not a phone/tablet companion app — it renders a virtual tablet *inside* the 3D cockpit (2D and VR), used for moving maps, airport charts/PDFs, and notes. [flyawaysimulation.com](https://flyawaysimulation.com/ask/answers/install-use-avitab-x-plane/)

**Why it matters for Avionix.** AviTab sets the baseline expectation of "an EFB tablet in the cockpit" — moving map, charts, notes — that Avionix users may implicitly compare a real second-device companion app against, especially for the maps/EFB slice of Avionix's scope. AviTab does not touch the FMC/CDU at all, so it's a complementary rather than competing surface. Its relevance here is purely as an expectation-setter, not a CDU/FMC competitor. **This section is inference/context, not a sourced praise/complaint analysis**, since AviTab is out of category.

---

## 7. Other CDU/avionics-remote items found but with thin sourcing

- **"Remote X-Plane Avionics" (A330 MCDU/FCU/EFIS + 737 CDU for Tablet/Browser)** — an X-Plane.org Store utility claiming ToLiss Airbus MCDU/EFIS/RMP/ACP panels "live-verified against real running ToLiss Airbus hardware" on tablet/browser, i.e., a WebFMC-style competitor scoped to Airbus + 737. Found via search index only ([forums.x-plane.org/files/file/101030](https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/)); page not fetchable, no pricing or review content confirmed. **Flagged as unverified beyond its title/description.**
- **Virtual CDU 737 (Virtual Avionics)**, Android, connects to a PC-side companion app over TCP/IP, described as an "entertainment app" ([appbrain.com/app/virtual-cdu-737](https://www.appbrain.com/app/virtual-cdu-737/com.virtualavionics.vcdu)). Its own site returned HTTP 403 on fetch; sim compatibility (X-Plane specifically vs. other sims) could not be confirmed independently. **Flagged as unverified.**
- **ToLissCDUDisplay** and a forum thread titled "Remote MCDU - ToLiss" indicate community-built/freeware alternatives specifically for ToLiss Airbus CDUs exist, but neither page was fetchable; not analyzed further.

---

## Cross-cutting technical finding (most important for Avionix)

X-Plane's own SDK documents dedicated datarefs for its default FMS's CDU screen: `sim/cockpit2/radios/indicators/fms_cdu1_text_line0…15` (and a CDU2 set) carrying UTF-8 text per line, plus parallel `..._style_line0…15` datarefs encoding per-character font size, reverse-video, flashing, underline, and one of 8 colors via bit flags, for a 16-line x 24-character display. [developer.x-plane.com/article/datarefs-for-the-cdu-screen](https://developer.x-plane.com/article/datarefs-for-the-cdu-screen/)

Every remote-CDU product surveyed (WebFMC, AirFMC, XPlaneCDU, X-CDU) works the same way in principle: **read per-line text/style datarefs published by the aircraft, render them client-side, send back keypress commands.** No product renders the CDU by screenshotting the in-sim 3D popup or doing OCR — text-dataref extraction is universal. The hard part is not the transport, it is that **only the default X-Plane FMS reliably uses the documented `fms_cdu*` datarefs; every payware/freeware FMC (Zibo, ToLiss, FlightFactor, IXEG, Rotate) exposes its own non-standard, per-aircraft dataref set** (e.g., Zibo's `laminar/B738/fmc1/Line...` family) that each app vendor must individually discover and map — confirmed both by X-CDU/XPlaneCDU's own aircraft-support caveats and by the fact that every competitor here maintains its own curated, limited aircraft-compatibility list rather than working universally. This is directly actionable for Avionix: Web API dataref+command access is architecturally sufficient to match this entire category's technical approach, but aircraft coverage will be gated by per-aircraft dataref reverse-engineering effort exactly as it is for every competitor studied, not by any limitation of the Web API itself.

---

## Sources not accessible

`forums.x-plane.org` topic and file pages returned HTTP 403 on every direct WebFetch attempt in this session (both the review/discussion forum and the file/store pages); all content attributed to that domain above comes only from Google's cached search-result snippets, not from reading the live page, and confidence should be discounted accordingly. Google Play store pages for XPlaneCDU, X-CDU, and Virtual CDU 737 also failed to return usable content via WebFetch; Play Store data above comes from third-party aggregators (AppBrain, APKCombo) found via search, not Google's own page.
