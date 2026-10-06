# UX research: state of the art for Avionix's shipped features

Scope note: this report extends, and does not repeat, the product-level findings already
in `docs/roadmap/research/competitors.md`, `remote-control-apps.md` and `panel-builders.md`
(product tables, pricing, feature-prevalence matrix, and the top-level praise/complaint
lists already captured there). This report drills into the *specific visual and interaction
design* of the features Avionix ships today: pairing/discovery, connection status, panel
navigation, primary flight instruments, flight data strip, COM/NAV radios, transponder, and
the generic autopilot panel. Sources are WebSearch/WebFetch results gathered 2026-10-06.
Several forums (forums.x-plane.org, AVSIM, siminnovations.com, Reddit) blocked direct fetch
(HTTP 403 or no indexable content); those facts are marked **search-snippet only** or
**unverified** below rather than presented as confirmed quotes. Reddit threads specifically
were not retrievable in this pass (WebFetch blocked, WebSearch found no on-topic indexed
results for r/flightsim or r/Xplane) — flagged as a sourcing gap, not as "no such discussion
exists."

---

## 1. Per feature area: what the best products do

### 1.1 Connection / pairing / discovery

The field splits into four distinct pairing architectures, in order of how little the user
has to do:

- **Manual IP entry** (worst UX, oldest pattern): Garmin Pilot → X-Plane requires reading an
  IP+port off one screen and typing it into another (X-Plane Settings → Net Connections →
  iPhone/iPad tab). https://ipadpilotnews.com/2016/02/garmin-pilot-adds-flight-profile-view-x-plane-support/
- **Broadcast/toggle, no address needed**: ForeFlight → X-Plane is two checkboxes — X-Plane's
  "Broadcast to all mapping apps on the network" plus ForeFlight's own "Enabled" switch under
  More → Devices → X-Plane. No IP typed in the happy path (UDP broadcast on port 49002).
  https://support.foreflight.com/hc/en-us/articles/204115525
- **LAN auto-discovery with a device picker**: X-Plane 12 Control Pad lists every X-Plane
  instance it sees on the LAN as a tappable row labeled by IP address; the "connected" state
  is communicated implicitly — placeholder zero values on the dashboard flip to live telemetry,
  with no separate success badge. https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
- **Multicast beacon + three-state status badge** (the most complete pattern found): Flight
  Deck ONE scans via an X-Plane multicast UDP beacon with zero plugin install, and shows a
  persistent toolbar badge with three explicit states and a plain-language sentence each:
  **Amber "Searching"** — "The app is scanning the network. Start X-Plane if it isn't running
  yet."; **Green "Connected"** — "X-Plane is running and reachable. All controls are live.";
  **Red "Disconnected"** — "X-Plane is not found. Check that both devices are on the same
  network." A manual IP/port fallback exists under Settings → Connection for firewalled/guest
  Wi-Fi/VPN cases. Documented foreground-resume behavior: "On iOS, bringing the app to
  foreground resumes the UDP session." https://flightdeckone.app/getting-started/,
  https://flightdeckone.app/support/connection/
- **QR-code pairing** (the closest thing to a "pairing code" pattern in this niche, and the
  one most explicitly marketed as effortless): Remote X-Plane Avionics runs an "Operator
  Console" in a browser on the PC that shows connection status, reachable network addresses,
  *and* a QR code per available panel; scanning it and tapping Connect is the entire mobile
  flow (https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-mcdufcuefisrmpacp-for-tablet-browser/,
  search-snippet only, direct fetch 403). The MSFS-world "Flight Simulator Companion" (FS
  Companion) sells pairing-simplicity as its headline feature — "Just scan a QR code from your
  computer, and boom — you're cleared for takeoff," and "Connecting your iPhone to the
  simulator is easier than your pre-flight snack prep" — and a review confirms it lands: "It's
  very simple to connect. I loved it." https://apps.apple.com/us/app/flight-simulator-companion/id6449391199.
  FlyCharts uses the same QR pattern via a "FlyCharts Bridge" PC component.
  https://play.google.com/store/apps/details?id=com.appeed.flycharts
- **Named root causes, not generic "check your network"**: Air Manager's own wiki names the
  exact failure mode — Windows network profile set to "Public" instead of "Private" silently
  blocks discovery. https://siminnovations.com/wiki/index.php/Connection_problems. Little
  Navmap separates **socket-connected** from **data-flowing**: its status reads "Connected"
  vs. "Connected. Waiting for update." until the first telemetry frame arrives — a
  distinction none of the simpler apps (Control Pad, Garmin Pilot, ForeFlight) make.
  https://www.littlenavmap.org/manuals/littlenavmap/release/latest/en/STATUSBAR.html,
  https://www.littlenavmap.org/manuals/littlenavmap/release/latest/en/CONNECT.html
- **Benchmark against consumer LAN pairing**: no forum thread was found explicitly comparing
  flight-sim pairing to Chromecast/AirPlay/Sonos, but technically the better tools (Flight
  Deck ONE, SimFly Linker) already converge on the same multicast/mDNS-style discovery those
  consumer ecosystems use — the gap is specifically in status-UI polish (no app found shows
  latency-in-ms or a "last seen" timestamp), not the discovery transport.
- **Background/foreground fragility is a repeated, independently-reported failure mode**: FS
  Companion — "you have to keep your phone on for it to work or else it disconnects" (developer
  confirmed backgrounding closes the UDP session; persistence promised as a future fix).
  SimFly Pad — reported disconnect "after clicking the home button and waiting 3-4 seconds"
  (developer-acknowledged per search synthesis of a PMDG forum thread that itself 403'd on
  direct fetch — unverified verbatim, credible). https://docs.simflypad.com/v1/troubleshooting/cockpit-control-issues

### 1.2 Connection status

- Flight Deck ONE's three-color toolbar badge + one-line explanation (above) is the single
  most complete pattern found industry-wide for this category.
- ForeFlight repurposes a real-GPS-style precision readout, "Accuracy (X-Plane) 1m," as an
  implicit live-link signal rather than a dedicated badge.
  https://support.foreflight.com/hc/en-us/articles/204115525
- SimFly Pad duplicates status near wherever the user's attention currently is instead of one
  global badge: a green "SimFly Linker Connected" text banner top-right on the Camera page,
  a separate green dot top-left on the Cockpit page. https://docs.simflypad.com/v1/getting-started/download_setup
- MobiFlight Connector (desktop) uses three always-visible, color-coded status indicators in
  its main window status bar — Connected Devices / Sim Status / Aircraft Profile Status, each
  yellow-when-absent / green-when-present — so the user never opens a settings screen to check
  link state. https://github.com/MobiFlight/MobiFlight-Connector/wiki/Mobiflight-Connector-Main-Window
- No product surveyed shows latency in milliseconds or a numeric "data age" / "last seen"
  timestamp — a confirmed gap across the whole category, and a concrete opportunity to
  differentiate Avionix's existing F-02 health strip beyond color-only states.

### 1.3 Panel navigation / switching

- **Tab bar, not free-swipe, is the safer pattern.** ForeFlight's bottom tab bar is "always
  depicted at the bottom of the screen" and is "the main way to access features," with
  per-device-customizable tab order (not synced across devices). X-Plane 12 Control Pad uses
  a 9-item bottom tab bar (CRAFT/START/WGT/WXR/FAIL/MAP/CMD/SITS/SET) with further nested
  sub-tabs inside several sections — cited here as a cautionary example of **over-nesting** a
  tab taxonomy, not a pattern to copy wholesale.
- **Free-swipe across a touch cockpit surface collides with in-panel touch targets** — a
  finding repeated independently in two unrelated products. XpRemotePanel reviewer
  PaplooTheLearned: "when I swipe it accidentally takes a touch to a setting, which can lead
  to a pretty wild ride sometimes" (the developer's fix was an opt-out "disable swipe" toggle
  in settings, not a redesign). https://apps.apple.com/us/app/xpremotepanel/id1576583318. Air
  Manager deliberately reserves swipe for a dedicated edge-zone gesture — "drag a single
  finger from the left side of the iPad inwards, starting on the far edge of the iPad screen"
  opens its panel-switching menu — rather than a free-canvas swipe, precisely to avoid this
  collision (siminnovations iPad manual, via search synthesis).
- Air Manager also separates "Viewing mode" (full-screen instruments) from "Edit mode"
  (add/move/scale), a design/run split worth noting even though Avionix doesn't need a
  user-facing panel designer.
- Flight Deck ONE organizes functionality into "Decks" (cockpit, EFB charts, logbook, map,
  SimBrief plans) framed as "a single connected ecosystem of apps," with a "Control Center"
  quick-access panel opened by tapping a time badge in the toolbar — exact switch mechanism
  (tab/swipe/menu) could not be confirmed from public pages (**unverified**).

### 1.4 Primary flight instruments (knobs, bezels, typography)

- **Real avionics vendors do NOT use continuous drag-to-rotate on touch, and do NOT use
  7-segment fonts.** Garmin's own official G1000 PC Trainer displays **directional arrow
  overlays** around each knob graphic — click an arrow for one discrete detent of rotation;
  no drag gesture at all. Keyboard fallback maps dedicated arrow keys to the two concentric
  FMS knob rings, space bar = knob push.
  https://static.garmincdn.com/pumac/G1000:Non-AirframeSpecific_TrainerUsersGuide.pdf. This is
  the single most authoritative data point available: the vendor that owns the real hardware
  chose discrete tap-arrows over simulated continuous rotation for its own software trainer.
- Dynon Skyview HDX, a real certified-adjacent EFIS, uses "Bitstream Vera Sans Mono Bold... a
  monospaced open source truetype font, modified to remove the dot from the middle of the
  zero" (official manufacturer answer) — a humanist monospace, not 7-segment, tuned
  specifically to disambiguate 0/O and (per a disputed follow-up post) 1/I.
  https://forum.flydynon.com/threads/which-font-does-the-hdx-use-for-display-data.15782/.
  Airbus commissioned "Airbus B612," a free/open humanist sans "developed... specifically to
  improve cockpit readability of avionics screens in a degraded environment" (bright sunlight,
  vibration, small size) — a second confirmed real-world example of custom avionics
  typography that is not 7-segment-LED styled (search-snippet sourced, **moderate
  confidence**).
- **Simionic's touch-drag knob emulation is the clearest negative case study found.** Multiple
  App Store reviews, directly fetched: "the knobs are extremely frustrating to turn"; "Trying
  to choose whether you're on the inner or outer knob is a real pain"; "really hard to turn
  the knobs since they are not real knobs"; "Setting the heading bug and course can be
  difficult with the built in interface (+/-) are small" (Rockkrawlin4x4, 09/17/2015).
  https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787?see-all=reviews&platform=ipad.
  General mobile-UI knob literature explains why: circular/arc drag requires the touch point
  to stay accurately on an arc around a fixed center, which is unreliable with a thumb on a
  small rendered dial; recommended fix is to let the virtual knob track the finger's
  touch-down point and enlarge the effective hit area well beyond the visible graphic.
  https://dev.to/ben_wu_3ff99644999594b3e8/virtual-knobs-making-human-machine-interaction-more-intuitive-and-efficient-247j
- **Baro unit toggle buried in a softkey submenu is a confirmed, developer-acknowledged
  discoverability failure**, not a missing feature: reviewer Selena Heskett, 05/15/2023 —
  "The app only supports altimeter settings in IN and not in hPA is annoying." Developer
  reply, 05/25/2023 — "Altimeter setting can be set in either inHg or HPA. Please press the
  soft key 'PFD'->'ALT UNIT'." Same URL as above. A lower-confidence, unverified report also
  claims the toggle sometimes doesn't take effect once set.
- **Hardware-feel benchmark quotes** (for understanding what touch can never fully replicate,
  useful context when deciding where to invest polish): RealSimGear GNS530 review — "Having
  the physical unit is incomparable to scrolling knobs with the mouse"; "the unit is durable,
  and the knob clicks are positive and firm, with good feedback"; but also "the rotary knobs
  have a very hard plastic feel and wobble slightly when you give pressure sideways" and "the
  buttons are a bit on the mushy and soft side." https://thresholdx.net/rev530/. Honeycomb
  Bravo — "Once you've got it in your hands, you'll easily notice the firm feedback against
  your hand as you glide the controls"; "each of the switches makes a satisfying
  clicking-sound when thrown"; but "Honeycomb equipment provides almost no adjustability when
  it comes to the physical feedback of their products." https://nerdtechy.com/honeycomb-bravo-throttle-quadrant-review,
  https://happytechfam.online/honeycomb-aeronautical-bravo-flight-simulator-throttle-quadrant-review-a-long-term-users-perspective/
- Screen-size sensitivity for six-pack/gauge readability is explicitly developer-acknowledged
  in Flight Sim Remote Panel: the six-pack display is "difficult [to read] on a phone but...
  manageable on a tablet" (developer comment, search-snippet sourced).
  https://baltazarstudios.com/flight-sim-remote-panel/

### 1.5 COM/NAV radios

- **Real-world terminology is "flip-flop" or "frequency transfer," not "swap."** The Garmin
  GTN Xi pattern — the closest real-world touchscreen analog — lets the pilot "swap your
  active and standby frequencies with a single screen touch," i.e. **tapping the standby
  frequency readout itself performs the flip-flop**, rather than a separate icon button;
  press-and-hold loads the emergency frequency (121.50).
  https://static.garmin.com/pumac/190-02327-03_g.pdf. No X-Plane app screenshot or review
  described a specific swap-icon shape — treat a dedicated double-arrow icon as a reasonable
  but unverified default if Avionix doesn't adopt tap-the-standby-number.
- **Typed keypad entry beats drag-to-tune on touchscreens — confirmed by a direct negative
  comparison.** XpRemotePanel reviewer PaplooTheLearned: "I was tired of entering frequencies
  by clicking a mouse, and now can type the numbers. So much easier!"
  https://apps.apple.com/us/app/xpremotepanel/id1576583318. Conversely, RemoteFlight RADIO
  HD — which uses rotary-knob-style touch dials instead of a keypad — drew: "The touch
  controls are very unpredictable and touchy... Trying to spin the frequency knobs to turn
  can be a nightmare" (Dmwierz, 10/06/2015). https://apps.apple.com/us/app/remoteflight-radio-hd/id511250097
- **Phone-sized screens are explicitly too small for radio tuning, per the developer himself.**
  Flight Sim Remote Panel user "Bert (FR)": "the difficulty to set the radio frequencies with
  a little screen (7″ smartphone)." Developer (gdevic) reply: "Yup, I have the same difficulty
  on my phone, but on a tablet it seems to be manageable," adding "Radios were such a hack: I
  never intended to have them... They are not perfect." https://baltazarstudios.com/flight-sim-remote-panel/
- **Staged-entry (type → explicit Set) prevents a half-typed frequency/squawk from being
  live mid-entry** — XpRemotePanel's description: "Values are typed on a large on-screen
  keypad and held as a staged entry until the pilot presses Set."
  https://apps.apple.com/us/app/xpremotepanel/id1576583318
- **Known rounding bug to avoid**: "Frequencies ending with .775 like 118.775 will be rounded
  up to 118.800 due to BCD16 encoding issues" in some MSFS tools — a concrete 8.33 kHz-spacing
  edge case (x.705/x.715/x.775 endings) Avionix's own validation should be tested against.
  https://forums.flightsimulator.com/t/axis-and-ohs-stream-deck-com-frequency-775/548537
  General numeric-input guidance: defer validation to focus-out/Enter rather than per-
  keystroke rejection, and keep auto-inserted formatting characters (decimal points)
  transparent to cursor/backspace flow. https://luhr.co/blog/2025/07/01/a-deep-dive-on-the-ux-of-number-inputs/
- **Omitting a control users expect defeats the app's purpose, in the user's own words.**
  RemoteFlight RADIO HD reviewer "Ulooky," 01/10/2017: "there isn't a button for ident and
  there is no way to turn com1 and com2 on and off. What's the point in using an iPad if you
  still have to change your cockpit view and use your mouse for these two things."
  https://apps.apple.com/us/app/remoteflight-radio-hd/id511250097
- **Touch-precision complaint specific to concentric radio knobs** (forums.x-plane.org, Air
  Manager thread, search-snippet only, 403 on direct fetch — treat as high-confidence
  paraphrase, not exact quote): "For double and triple concentric knobs like those used for
  tuning a nav/com radio, the touch screen has proven difficult to use, as the click areas for
  the lower knobs are too small and require way too much concentration compared to flying an
  actual airplane."
- **Haptics/sound on radio controls: a confirmed gap, not a pattern.** No app surveyed
  (XpRemotePanel, RemoteFlight, Flight Sim Remote Panel, Comsquawk XP, Air Manager) mentions
  UI-level haptic tick or click/beep sound on frequency swap or keypad press in any
  retrievable review or docs — this is an open differentiation opportunity rather than
  established best practice to copy.

### 1.6 Transponder

- **Octal-only entry is universal and non-negotiable**: "Transponder keypads typically feature
  only the keys 0–7, so 8 and 9 can't be typed. This is because squawk codes use octal
  (base-8) numbering." Real hardware (Stratus) enforces this physically.
  https://pilotinstitute.com/transponder-codes-made-easy/. The 8/9 keys should not even
  render as live keys on a squawk keypad, not merely reject the tap.
- **A one-tap VFR-code preset is standard real-world affordance**: "Some transponders have a
  VFR button that automatically enters the squawk code 1200"; Stratus markets its "convenient
  VFR button minimizes pilot keystrokes." Worth a one-tap 1200/2000 (region-appropriate)
  shortcut alongside the keypad.
- **IDENT is a timed pulse with a specific real-world visual, not a toggle.** Garmin G3X
  Touch: "When you touch IDENT on the G3X Touch transponder page, a green bar illuminates
  momentarily" — the real-world touchscreen standard is a **green highlight that lights
  briefly and auto-clears**, confirming IDENT should never be a persistent on/off state.
  Accidental activation is a documented real-world problem independent of touchscreens:
  "nearly simultaneous IDENT transmissions can happen due to various reasons, such as pilots
  accidentally pressing the IDENT button" (jetcareers.com). A documented mitigation pattern
  from general touch-UI guidance is a brief press-and-hold threshold before the action fires,
  given IDENT's mis-trigger history. https://growthshuttle.com/design-patterns-prevent-accidental-taps/
- **Mode selection on real touchscreen-native transponder units (Garmin GNX 375) uses a row of
  tappable soft keys, not a simulated rotary knob or a segmented control** — "Function Keys
  allow you to touch them to access the features or pages described on the key," despite the
  unit also having a physical knob for other functions. This supports a segmented-control /
  button-row approach over a drag-to-rotate knob for OFF/STBY/ON/ALT/GND.
  https://static.garmin.com/pumac/190-02488-01_b.pdf
- **State-sync trust failures are a real, named complaint class**: RemoteFlight AUTOPILOT
  app reviews (search-summary paraphrase, **unverified exact wording**) — "The autopilot
  status isn't always in sync with X-Plane, and sometimes the light says it's enabled when it
  isn't on the simulator" — the same failure mode applies directly to a transponder mode
  indicator or AP/FD annunciator: an indicator that can lie is worse than no indicator.

### 1.7 Autopilot panel (MCP/FCU patterns, mode annunciator, selectors)

- **No competitor combines rotary-drag + stepper + keypad on one control — Avionix's stepper
  +keypad hybrid is not duplicated anywhere in the researched market.** The field splits
  cleanly: hardware MCPs use real rotary encoders (GoFlight GF-MCP Pro, SimWorld MCP, both
  with mouse-drag emulation on the legacy Project Magenta); pure-touch/software panels
  abandon rotary entirely for either **keypad-only** (AirTrack "The MCP": "Tapping in each of
  the numbers brings up a dial-pad style keyboard allowing the corresponding value to be
  changed and set instantly," applied uniformly to altitude/speed/heading/VS/course,
  https://haversine.com/airtrack/mcp) or **stepper-only** (XpRemotePanel's KFC-200-style
  panel: "push and hold up/down buttons" with no keypad and no drag).
- **Non-aviation precedent validates the stepper+keypad hybrid directly.** Nielsen Norman
  Group: "A text-field stepper is a UI component that enables quick entry of a number using a
  text field along with stepper buttons on the sides for adjustment... Users can choose to
  either directly enter the precise value or use the stepper to adjust the default value, if
  it's close to the desired value" — with NN/g's own caveat that too many redundant input
  modes "adds its own overhead," so the trigger for each (tap readout = keypad, tap arrow =
  nudge) must stay unambiguous. https://www.nngroup.com/articles/input-steppers/. Apple's own
  iOS 15+ time-wheel picker ships the same duality: "Tapping the wheel brings up the hidden
  number pad for inputting digits, if that's what you prefer."
  https://www.idownloadblog.com/2021/06/09/apple-ios-15-wheel-time-picker/. A GitHub product
  spec for an unrelated nutrition app documents the pattern almost verbatim as engineering
  requirements: "Tap the value to open the numeric keypad... with the current value selected
  so typing replaces it" plus "Press and hold +/- auto-repeats and speeds up (e.g. ~8/s, then
  ×10 steps after ~1s held)" — the press-and-hold acceleration tier is worth checking against
  Avionix's current stepper behavior. https://github.com/MichaelMorami/Workout-and-Nutrition-App/issues/87
- **Touch-precision complaint on rotary-drag generalizes beyond radios to MCP knobs too**:
  the same forums.x-plane.org Air Manager thread (search-snippet, 403 on direct fetch) that
  flagged concentric radio knobs also reinforces avoiding drag-rotary gestures on touchscreens
  generally.
- **Mode annunciator (FMA) conventions differ by manufacturer — pick one explicitly.** Boeing:
  "Selected modes that are operational are always coloured green," "armed modes are coloured
  white," and on a mode change "a mode change highlight symbol (green-coloured rectangle) is
  displayed around the changed mode annunciation... for 10 seconds" (with the article noting
  some real avionics only flash for 2 seconds, so duration is a tunable, not a hard spec).
  https://www.flaps2approach.com/journal/2014/9/18/b737-800-ng-flight-mode-annunciator-fma.html.
  Airbus differs: green = engaged, **blue** = armed (not white), white reserved for approach
  capability/autothrust status, amber = caution, magenta = altitude constraints (search-
  synthesis, **moderate confidence** but consistent across independent sources). Since
  Avionix's panel is explicitly "generic," the Boeing scheme (fewer color states: green/white/
  amber) is the simpler one to implement and is the convention the existing roadmap language
  ("white=armed, amber=caution") already matches.
- **Real hardware illuminates the switch cap itself (LED/backlit legend fill), not an external
  glow/ring.** SimWorld MCP: "Push to engage annunciators are backlit in green (when
  depressed)... a number of holes that, when the annunciator is pressed, enables
  green-coloured light to be transmitted through the checkerboard."
  https://www.flaps2approach.com/journal/2017/5/15/mcp-and-efis-by-simworld-review.html. No
  source found a "green ring/halo" motif on real hardware — that convention, common in
  software skeuomorphism, is not more "authentic" than a simple fill and Avionix should not
  assume it is.
- **FCU push/pull (Airbus-style) has no good touchscreen-native solution anywhere in the
  researched market.** Real semantics: "pushing usually means automatic control (Managed
  Mode) and pulling will use the manually selected value (Selected Mode)." Mouse-based
  emulations split a single click target into an upper "push" hotspot and lower "pull"
  hotspot (MSFS FlyByWire A32NX) or require a precise hover position above/below the knob
  (X-Plane legacy cockpit mode) — both assume cursor precision a touchscreen doesn't have. The
  one touch-native idea surfaced came from a MIDI-controller mapping, not a phone app: short
  tap = push (managed), long-press = pull (selected), borrowed from a Behringer X-Touch Mini
  binding (search-snippet, **unverified**) — flagged as the most plausible pattern *if*
  Avionix ever ships an Airbus-style FCU variant, not as a solved, demonstrated pattern.
- **VS selector**: real Boeing hardware uses a physical rate wheel/thumbwheel, not steppers;
  simpler GA and some software emulations use +/- buttons instead (both search-snippet
  sourced, **moderate confidence**). No evidence was found of users explicitly confusing
  VS-mode vs. FLC/speed-mode entry in a touch-app context — flagged as a gap in available
  evidence, not a confirmed non-issue.

### 1.8 Flight data strip

- **ForeFlight's persistent bottom data bar on the map view** is the closest real-world analog
  to Avionix's flight data strip: default fields are ground speed, distance to next waypoint,
  course to next waypoint "and other basic details," with additional optional fields users can
  add such as "Descent to Dest" (required V/S to reach destination elevation) and "Distance to
  Dest" — i.e. a curated, user-configurable field set rather than a fixed one.
  https://ipadpilotnews.com/2020/08/how-to-customize-foreflights-instrument-panel-on-the-map/.
  Notably ForeFlight does not trust the device's own barometer for its altitude figure —
  "Baro Altitude" only populates when paired with an external ADS-B receiver that has a baro
  sensor (e.g. Sentry). https://ipadpilotnews.com/2024/08/understanding-pressure-altitude-and-gps-altitude-in-aviation-apps-pilot/
- **A persistent data strip must survive orientation changes — a documented real regression.**
  In an MSFS Sim Update 5 beta, rotating the in-sim EFB from vertical to horizontal caused the
  flight-planner's altitude and speed fields to disappear entirely ("Speed and Altitude fields
  are removed when going into horizontal orientation"), a regression from the prior update
  where they persisted in both orientations; later fixed.
  https://forums.flightsimulator.com/t/su5-beta-efb-windows-mode-forcely-change-tablet-orientation-from-vertical-to-horizontal-when-expend-efb-window/757896
- No direct complaint was found calling any flight-data strip specifically "too cluttered" —
  ForeFlight manages density via zoom-tied decluttering and per-layer hide toggles rather than
  limiting the data bar's field count; treat "clutter" as a weakly-evidenced risk here, not a
  confirmed complaint pattern.

### 1.9 Orientation, layout, night mode (cross-cutting)

- **Portrait lock is an accepted, real-shipped choice even for a cockpit-control app** — not
  something Avionix should assume is automatically wrong. X-Plane 12 Control Pad is locked to
  portrait on iPad: "Note that iPad app only works with the iPad in a vertical position"
  (x-plained.com review) — yet it still earns usable, if mixed, reviews.
- **But pilots explicitly say landscape matters for chart/content-heavy screens.** An MSFS
  forum user requested a landscape toggle for the EFB: "I am wondering why the EFB is in
  Portrait format. Please add a way to rotate it... Most aircraft/airlines have it that way.
  It is way easier to read Charts" — and a landscape setting already existed, just wasn't
  obvious. https://forums.flightsimulator.com/t/efb-in-landscape-format-rotate-the-tablet/675475
- **Night mode in real EFBs is "invert colors on charts," shipped as default-on for years, not
  a cosmetic dark theme.** Garmin Pilot: "Pilots can now invert the colors on Garmin FliteCharts
  or Jeppesen terminal approach procedures for enhanced readability at night... Selecting night
  mode will apply when viewing a chart on the map page, in the charts binder, in split-screen
  view on the synthetic page or while viewing the airport page," and notably "Garmin Pilot has
  taken the opposite approach" to most software by shipping **dark as the long-standing
  default**, only adding a light theme later. https://ipadpilotnews.com/2020/05/latest-garmin-pilot-update-adds-night-mode-document-sync/,
  https://ipadpilotnews.com/2023/07/garmin-pilot-adds-new-color-themes-and-and-etd-calculator/.
  No dedicated red/night-vision-preserving theme (as opposed to generic inverted/dark) was
  found in any product surveyed, including X-Plane companion apps — a confirmed gap despite
  real pilots' well-known preference for red cockpit lighting.
- **MobiFlight** (MSFS/X-Plane hardware-bridge desktop tool, no mobile companion) is cited
  here only for its status-indicator pattern (1.2 above); its own config UI is a
  spreadsheet-style tab/list layout, and MobiFlight's own docs admit the learning curve:
  "the choices can be overwhelming at first, so we recommend getting started with a simple
  parking brake switch and indicator LED." https://docs.mobiflight.com/getting-started/. No
  product literally named "Sim Pilot Panel" or "AirPlane Panel" was found to exist — marked
  **not found**. FSHud (fshud.com) turned out to be an ATC/voice-recognition add-on, not a
  panel switcher, but is notable for advertising "QR-based control on mobile devices and a
  companion app" as a lightweight pairing pattern. https://www.fshud.com/

---

## 2. Verbatim customer praise (what brings value)

1. "I was tired of entering frequencies by clicking a mouse, and now can type the numbers. So
   much easier!" — PaplooTheLearned, XpRemotePanel, App Store.
   https://apps.apple.com/us/app/xpremotepanel/id1576583318
2. "It is a pain to be clicking on the tiny controls with the mouse. Especially the radio
   dials." — khaledallen, XpRemotePanel, App Store. Same URL.
3. "I needed to have some panels on my iPhone to help me with basic navigation on X-Plane 12.
   This app did it." — giraldomauricio, 5★, 10/21/2024, XpRemotePanel, App Store. Same URL.
4. "Swap your active and standby frequencies with a single screen touch." — Garmin GTN Xi
   Pilot's Guide. https://static.garmin.com/pumac/190-02327-03_g.pdf
5. "Having the physical unit is incomparable to scrolling knobs with the mouse." — ThresholdX
   review of RealSimGear GNS530. https://thresholdx.net/rev530/
6. "This wonderful app makes the flight sim immersion experience that much more realistic and
   useful, compared to using my mouse on my computer to interact with the instruments in the
   plane." — Bear_gang1401, HomeSim, App Store. https://apps.apple.com/us/app/homesim/id6560107193
7. "I love to give my friend an engine fire or other problems when he's flying!" — Mina_proo,
   X-Plane 12 Control Pad, App Store. https://apps.apple.com/fi/app/x-plane-12-control-pad/id6701986565
8. "It's very simple to connect. I loved it." — App Store review, Flight Simulator Companion
   (FS Companion). https://apps.apple.com/us/app/flight-simulator-companion/id6449391199
9. "As long as they are all logged into the same WIFI network, they will see each other." —
   x-plained.com reviewer describing X-Plane 12 Control Pad's discovery.
   https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
10. "Garmin Pilot offers a fairly comprehensive night mode feature to dim the screen during
    flights after sunset, and the vivid colors used on Garmin's Map page are particularly
    bright at night, making this feature very helpful." — ipadpilotnews.com review.
    https://ipadpilotnews.com/2020/05/latest-garmin-pilot-update-adds-night-mode-document-sync/
11. "Having the physical unit is incomparable to scrolling knobs with the mouse" and "the unit
    is durable, and the knob clicks are positive and firm, with good feedback" — ThresholdX
    GNS530 review (hardware-feel benchmark). https://thresholdx.net/rev530/
12. "Once you've got it in your hands, you'll easily notice the firm feedback against your
    hand as you glide the controls" / "it works like someone ripped it out of an aircraft." —
    Nerdtechy Honeycomb Bravo review. https://nerdtechy.com/honeycomb-bravo-throttle-quadrant-review

## 3. Verbatim customer complaints (what to avoid)

1. "when I swipe it accidentally takes a touch to a setting, which can lead to a pretty wild
   ride sometimes" — PaplooTheLearned, XpRemotePanel, App Store (developer's fix: an opt-out
   "disable swipe" toggle). https://apps.apple.com/us/app/xpremotepanel/id1576583318
2. "The touch controls are very unpredictable and touchy... Trying to spin the frequency
   knobs to turn can be a nightmare." — Dmwierz, 10/06/2015, RemoteFlight RADIO HD, App Store.
   https://apps.apple.com/us/app/remoteflight-radio-hd/id511250097
3. "there isn't a button for ident and there is no way to turn com1 and com2 on and off.
   What's the point in using an iPad if you still have to change your cockpit view and use
   your mouse for these two things." — Ulooky, 01/10/2017, RemoteFlight RADIO HD, App Store.
   Same URL.
4. "the difficulty to set the radio frequencies with a little screen (7″ smartphone)" /
   developer reply "Yup, I have the same difficulty on my phone, but on a tablet it seems to
   be manageable" / "Radios were such a hack... They are not perfect." — Flight Sim Remote
   Panel, user "Bert (FR)" and developer gdevic. https://baltazarstudios.com/flight-sim-remote-panel/
5. "The app only supports altimeter settings in IN and not in hPA is annoying." — Selena
   Heskett, 05/15/2023, Simionic G1000 PFD, App Store (dev reply confirmed the toggle exists
   but is buried in a softkey submenu: "PFD"->"ALT UNIT").
   https://apps.apple.com/us/app/simionic-g1000-pfd/id501990787?see-all=reviews&platform=ipad
6. "the knobs are extremely frustrating to turn"; "Trying to choose whether you're on the
   inner or outer knob is a real pain"; "really hard to turn the knobs since they are not real
   knobs." — Simionic G1000 PFD/MFD, App Store reviews. Same URL (and
   https://apps.apple.com/us/app/simionic-g1000-mfd/id827464105).
7. "Setting the heading bug and course can be difficult with the built in interface (+/-) are
   small." — Rockkrawlin4x4, 09/17/2015, Simionic G1000 PFD, App Store. Same URL as #5.
8. "after connecting to the sim all it will let me do is pause, quit xplane, shut down my
   computer, or adjust the app preferences" — App Store review, X-Plane 12 Control Pad.
   https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565
9. "you have to keep your phone on for it to work or else it disconnects" — App Store review,
   Flight Simulator Companion (developer confirmed backgrounding kills the connection).
   https://apps.apple.com/us/app/flight-simulator-companion/id6449391199
10. "waiting for the status info from core plugin" — literal failure-state UI text, SimFly
    Linker/Pad, with no color or icon accompanying it. https://docs.simflypad.com/v1/troubleshooting/cockpit-control-issues
11. "The rotary knobs have a very hard plastic feel and wobble slightly when you give pressure
    sideways" and "the buttons are a bit on the mushy and soft side" — ThresholdX review of
    RealSimGear GNS530 (even premium hardware draws tactile criticism).
    https://thresholdx.net/rev530/
12. "Honeycomb equipment provides almost no adjustability when it comes to the physical
    feedback of their products." — Nerdtechy Honeycomb Bravo review.
    https://nerdtechy.com/honeycomb-bravo-throttle-quadrant-review
13. "Air Manager for iPad: A Frustrating Experience" — BobbyC, 05/04/2024, reporting
    "flashing dials" where instruments shrink unexpectedly, calling the app "unusable."
    https://apps.apple.com/us/app/air-manager/id1052587916
14. "I am wondering why the EFB is in Portrait format. Please add a way to rotate it... Most
    aircraft/airlines have it that way. It is way easier to read Charts." — gabster1501, MSFS
    forum. https://forums.flightsimulator.com/t/efb-in-landscape-format-rotate-the-tablet/675475
15. "Note that iPad app only works with the iPad in a vertical position." — x-plained.com
    review of X-Plane 12 Control Pad (cited as a limitation, not praise, despite the app's
    otherwise mixed reception). https://www.x-plained.com/utility-review-laminar-x-plane-control-pad/
16. "The autopilot status isn't always in sync with X-Plane, and sometimes the light says it's
    enabled when it isn't on the simulator." — RemoteFlight AUTOPILOT, App Store reviews
    (search-synthesis paraphrase, **unverified exact wording**, but directionally solid).
    https://apps.apple.com/app/id452544816

---

## 4. Top 15 actionable UX recommendations for Avionix, ranked by value

1. **Keep typed keypad entry as the primary path for every numeric control (frequency,
   squawk, altitude, heading, speed, VS) and never ship a drag-to-rotate knob gesture.**
   This is the single most consistently evidenced finding in the whole research pass: real
   pilots praise keypads over knobs on touch (PaplooTheLearned, XpRemotePanel), real
   avionics vendors use discrete tap-arrows rather than drag rotation even in their own
   official trainers (Garmin G1000 PC Trainer), and every app that tried drag-knob emulation
   drew sharp, repeated complaints (Simionic, RemoteFlight RADIO HD). Avionix's existing
   stepper+keypad pattern is already correctly positioned on the right side of this finding —
   protect it, don't add a rotary gesture later for "realism."

2. **Add a three-state connection badge with a one-line plain-English explanation per state**
   (searching/connected/disconnected, color-coded, persistent, not buried in a settings
   screen), modeled on Flight Deck ONE's pattern — the most complete version of this UX found
   anywhere in the category, and directly addresses the "setup is the hard part" complaint
   already logged in the existing competitor research.

3. **Distinguish "link established" from "data flowing" in the connection-health UI**, the way
   Little Navmap does ("Connected" vs. "Connected. Waiting for update."). None of the simpler
   competitors (Control Pad, Garmin Pilot, ForeFlight) make this distinction, and it directly
   targets the "silent stale data" complaint already flagged as a top pain point in
   `competitors.md` — a stale-but-"connected" state is worse than an honest "waiting" state.

4. **Show numeric link quality — latency in ms and/or a "data age" timestamp — not just a
   color dot.** Confirmed as a total gap across every competitor researched (Flight Deck ONE,
   ForeFlight, SimFly Pad, Little Navmap, MobiFlight all stop at color/text states). This is
   a genuine, low-risk differentiator rather than a parity feature, and it directly answers
   the "never render a stale value as live" implication already in the internal research.

5. **Never use a free-canvas swipe gesture to switch between panels; reserve swipe for an
   edge zone, or use a tab bar only.** Two independent products hit the same failure for the
   same reason: XpRemotePanel's free-swipe accidentally triggers in-panel controls ("a pretty
   wild ride sometimes"), while Air Manager avoids it entirely by requiring the swipe to start
   from the literal screen edge. If Avionix's panel switcher uses swipe-between-panels at all,
   gate it to an edge zone or a dedicated handle, never the full canvas.

6. **Make the baro inHg/hPa toggle a visible, one-tap control on the instrument itself, not a
   buried settings/softkey path.** Simionic's own developer confirmed in a review reply that
   the feature exists but only via "soft key 'PFD'->'ALT UNIT'" — users rate this as a missing
   feature because they can't find it. This is a cheap, concrete fix with a documented
   failure case to point to.

7. **Keep the AP/FD/A-T and mode-annunciator color scheme to the simpler Boeing convention
   (green = engaged, white = armed, amber = caution, with a brief flash on mode change) rather
   than mixing in Airbus's blue-for-armed** — since the panel is explicitly generic, pick one
   real-world standard rather than an invented hybrid, and Boeing's 3-color scheme is both
   simpler to implement and matches the roadmap's existing color language.

8. **Fill the switch/button itself on engage (a solid color fill or backlit-legend look), not
   an external glow/ring.** No source found a ring/halo motif in real hardware; SimWorld's
   backlit-perforated-legend pattern and generic MCP descriptions both point to the legend/
   cap itself lighting up. A glowing ring is an invented software convention, not "more
   authentic" — worth a design review if Avionix currently uses a halo.

9. **Make engaged/active/armed indicators provably truthful against live sim state, and treat
   any desync as a priority bug class, not a cosmetic one.** RemoteFlight AUTOPILOT's
   "sometimes the light says it's enabled when it isn't on the simulator" is exactly the kind
   of trust-breaking failure a remote-control app cannot afford; this generalizes to the
   transponder mode indicator and radio on/off state too.

10. **Render squawk-entry keypads with only digits 0–7 present (not 8/9 greyed out, simply
    absent), add a one-tap VFR-code preset (1200/2000), and make IDENT a momentary,
    auto-reverting green highlight — never a persistent toggle.** All three are directly
    sourced from real-world transponder UX (Stratus VFR button, Garmin G3X Touch's "green bar
    illuminates momentarily" on IDENT) and prevent two documented real failure modes:
    accidental invalid-code entry and accidental/ambiguous IDENT activation.

11. **Use a tap-the-standby-frequency-to-swap interaction (or at minimum a large, obviously-
    placed swap control between the two readouts) rather than a small icon button**, following
    the Garmin GTN Xi pattern ("swap your active and standby frequencies with a single screen
    touch") — this is the real-world standard the whole X-Plane radio-app ecosystem is
    implicitly emulating.

12. **Guard against invalid/edge-case frequency rounding** (the documented 118.775→118.800
    BCD16-style rounding bug from the MSFS ecosystem) by testing Avionix's own frequency
    parsing against all 8.33 kHz channel-spacing endings (x.005/x.010/.../x.995, especially
    the .x05/.x10/.x15 forms) before shipping any new radio-entry code.

13. **Add discrete UI-level haptic feedback (tick on stepper/keypad press, a distinct pulse on
    swap and on IDENT) and consider a subtle click/beep.** Confirmed as a total gap — no
    competitor app studied implements UI-level haptics or sound on these controls (only
    full-motion immersion hardware like ButtKicker does haptics, for a different purpose) —
    this is a genuine, low-cost, evidence-backed differentiation opportunity rather than a
    "best practice to copy."

14. **Ensure the flight data strip's field set survives orientation changes and is not hard-
    coded to only populate from a single data source assumption** — directly motivated by the
    documented MSFS SU5 beta regression where altitude/speed fields vanished on rotation, and
    by ForeFlight's own caution (not trusting a device's bare barometer for displayed
    altitude without a validated external source).

15. **If/when a night mode ships, implement it as real chart/instrument color inversion (red-
    friendly night palette), not merely a generic dark theme, and consider making it the
    default rather than an opt-in** — following Garmin Pilot's explicit design precedent
    ("Garmin Pilot has taken the opposite approach" and shipped dark-by-default for a decade)
    and the fact that no competitor app yet offers a true red/night-vision-preserving theme,
    despite pilots' well-documented preference for one — a clear, currently-unclaimed
    differentiator.

---

## Sourcing gaps (explicit)

- Reddit (r/flightsim, r/Xplane) content could not be retrieved in this pass: WebFetch is
  blocked for reddit.com in this environment, and WebSearch queries targeting Reddit returned
  no on-topic indexed results for any of the sub-topics researched. This is a confirmed
  sourcing gap, not evidence that no such discussion exists.
- forums.x-plane.org and AVSIM consistently returned HTTP 403 to direct WebFetch; facts
  attributed to those sources above are search-engine-snippet syntheses and are explicitly
  marked "search-snippet only" or "unverified" rather than presented as directly-confirmed
  quotes.
- Several App Store review quotes were extracted via a search tool that pre-summarizes page
  content rather than returning raw HTML; those are flagged inline as lower-confidence where
  the exact wording could not be independently re-verified by direct fetch.
- No named products called "Sim Pilot Panel" or "AirPlane Panel" could be found to exist in
  any store or search index.
