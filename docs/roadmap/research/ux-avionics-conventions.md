# Avionix UX research: real-world avionics human factors and visual conventions

Scope: color philosophy, typography, real hardware layout, six-pack/PFD conventions, what
instructors/pilots expect from a training-grade app, and accessibility — followed by a gap
analysis against `src/theme/tokens.ts` and `docs/xplane.md` as they stand today (2026-10-06).

---

## 1. Colour philosophy

### FAA AC 25-11B (Electronic Flight Displays, transport category)
AC 25-11B's Table 5-1 is the master color table cited across the industry. Core rules:
- **Red** — warnings, flight-envelope/system limits that require immediate awareness.
- **Amber/Yellow** — cautions, non-normal sources, abnormal ranges.
- **Green** — normal operation, engaged/active modes, flight-guidance information.
- The standard says red/amber must be *protected*: they should not be reused for anything
  that isn't a warning/caution, anywhere in the flight deck, so the pilot's trained reflex
  ("red = act now") never gets contradicted. AC 25-11B frames this as the "common application"
  of a green→amber→red progression denoting increasing threat/urgency.
- Colour consistency across all displays is "highly desirable"; inconsistent use is treated as
  a certification risk, not a style question.
- Source: [AC 25-11B PDF](https://www.faa.gov/documentlibrary/media/advisory_circular/ac_25-11b.pdf)

### FAA AC 23.1311-1C (Electronic flight instrument systems, Part 23 / GA)
This is the directly relevant document for Avionix (light GA, not transport category). Its
color table is more specific and matches the six-pack/PFD painting convention almost exactly:

| Element | Color |
|---|---|
| Warnings | Red |
| Flight envelope & system limits | Red |
| Cautions, abnormal source | Amber/Yellow |
| Earth | Tan/Brown |
| Sky | Cyan/Blue |
| Scales and associated figures | White |
| Engaged modes, flight guidance | Green |
| ILS deviation pointer | Magenta |
| Flight director bar | Magenta or green |

General principle stated in the AC: green = normal operation, yellow = takeoff/precautionary
range, red = outside safe operating limits; "the use of red and yellow for other than warnings
and cautions is discouraged." Consistency *within* an app and *across* all its screens is
explicitly called out — i.e. don't let the radios panel and the PFD disagree about what amber
means.
Source: [AC 23.1311-1C PDF](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_23_1311-1C.pdf)

### Garmin color grammar (G1000/G3000/G5/GFC 500) — the GA vernacular Avionix should speak
Garmin's convention, confirmed by its own pilot's guides and widely cross-referenced:
- **Green** = active/engaged (autopilot mode currently flying the airplane; "NAV" captured).
- **White** = armed (a mode waiting to capture, e.g. ALT armed before capture, or an un-activated
  flight-plan leg).
- **Magenta** = the active flight-plan leg / GPS course line / FMS target bugs (e.g. active VNAV
  or Vapp airspeed bug) — "the route line changes from white to magenta when the flight plan
  becomes active."
- **Cyan** = the item currently being *tuned but not yet active* — the standby frequency box in
  a cyan outline, the knob-selected field. This is Garmin's "about to be true" color, distinct
  from magenta's "this is live guidance."
- **Amber/Yellow** = caution ranges (yellow arc on tapes, terrain caution).
- **Red** = failure flags (red X over invalid data), warnings, terrain alert, exceedance bars.
- Blue/brown = sky/earth on the attitude ball, matching the AC.
Sources: [Pilots of America thread on G1000 AFCS colors](https://www.pilotsofamerica.com/community/threads/color-of-afcs-modes-g1000.40574/), [Garmin G1000 PFD field-by-field guide](https://rotatepilot.com/guides/garmin-g1000-guide), [Garmin G1000 Reference Manual, "Color Code" section](https://www.manualslib.com/manual/1392149/Garmin-G1000.html?page=55)

**Boeing vs. Garmin divergence to be aware of**: on Boeing flight decks the FMA's armed row is
**white**, same as Garmin, but Boeing's *selected* autothrust/FMS targets and the ILS deviation
pointer are historically **magenta**, while Airbus uses **blue** for most armed annunciations and
reserves magenta for vertical/altitude-constraint information. Avionix is modeling a *generic*
AFCS panel against X-Plane datarefs (not a specific OEM aircraft), so the brief's instruction to
follow the **Garmin grammar as the default** (green=active, white=armed, cyan=being-tuned,
magenta=FMS/selected-target) is the safer, more teachable choice for GA-trained pilots and CFIs,
with Boeing/Airbus noted only as "don't be surprised if an airline pilot expects magenta
differently."

### Flight Mode Annunciator (FMA) conventions — Boeing & Airbus
- **Boeing 737**: FMA is laid out in two rows × three columns (autothrottle | roll | pitch).
  Selected/engaged modes = **green**; armed modes = **white**; CWS (control wheel steering) =
  **yellow**. When a mode *changes*, Boeing draws a **green rectangle ("box") around the new
  annunciation for about 10 seconds** — the classic "boxed new mode" cue that lets a pilot who
  glances back at the panel instantly see what just changed, without needing to have been
  watching continuously.
  Source: [Flaps2Approach — B737NG FMA](https://www.flaps2approach.com/journal/2014/9/18/b737-800-ng-flight-mode-annunciator-fma.html)
- **Airbus A320**: FMA has 5 columns (autothrust | vertical | lateral | approach capability |
  AFS status), 3 rows (engaged / armed / messages). Engaged = **green**, armed = **blue** (not
  Garmin's white), altitude-constraint info = **magenta**, caution text = **amber**, degraded
  flight-control-law messages = **red**, approach-capability/status text = **white**.
  Source: [FlyByWire docs — A32NX FMA](https://docs.flybywiresim.com/pilots-corner/a32nx/a32nx-briefing/pfd/fma/), [AirbusDriver EFIS reference PDF](http://www.airbusdriver.net/EFIS3.pdf)
- **Avionix implication**: the autopilot panel (F-20, PR #15) already has mode state as
  off/armed/captured (0/1/2) per the `docs/xplane.md` dataref table. The boxed-for-10-seconds
  convention is the single highest-value, cheap-to-add realism cue missing today — it's exactly
  the kind of detail a CFI would notice is absent and a detail that costs very little to add
  (a timed highlight state keyed off a mode's status transition).

### Autopilot disconnect
Universal convention across Garmin/Boeing/Airbus/Bendix-King: **automatic (unplanned) autopilot
disconnect is a flashing red "AP" annunciation plus an aural tone**, and the flashing continues
until acknowledged (pressing the AP disconnect button again, or an ENT/ack key depending on
platform) — it is deliberately *not* a quiet, self-clearing state, because an unexpected
disconnect is safety-critical. A pilot-commanded disconnect is a brief, non-flashing
annunciation or none at all. Avionix's autopilot panel should distinguish "I turned AP off" from
"AP kicked itself off" the same way: only the latter flashes red and needs an acknowledgement
tap.
Source: [search synthesis of Garmin G3X Pilot's Guide AFCS section + annunciator-panel convention](https://en.wikipedia.org/wiki/Annunciator_panel)

---

## 2. Typography

- **No real cockpit uses a generic UI sans like Helvetica/Inter off the shelf.** Garmin's own
  displays use a proprietary condensed sans with strong tabular (fixed-width) digits; the public
  face of this is documented mostly indirectly (Garmin doesn't publish the cockpit font name),
  but community teardown of Garmin's consumer/aviation style guide shows a bold, geometric,
  high-x-height sans intentionally built for small sizes at a glance.
  [Garmin style guide, typography](https://creative.garmin.com/styleguide/typography/)
- **B612 — the one directly relevant, freely usable real cockpit font.** Airbus, together with
  ENAC/Université de Toulouse III and Intactile DESIGN, ran a multi-year human-factors research
  program (2010–2012+) specifically to define an "Aeronautical Font" for cockpit screens,
  optimizing for legibility under vibration, poor lighting, high cognitive load, and oblique
  viewing angles ("light traps" baked into the letterforms to resist blur at a distance). The
  result, **B612** (and **B612 Mono** for tabular digits), was released under the SIL Open Font
  License and is on Google Fonts today — it is literally free to drop into a React Native app
  and is a defensible, cite-able choice ("this is the font Airbus cockpits use") rather than a
  generic system font.
  Sources: [Google Fonts – B612](https://fonts.google.com/specimen/B612), [Hacker News thread confirming Airbus/PolarSys provenance](https://news.ycombinator.com/item?id=18946601), [GIGAZINE write-up of the B612 research program](https://gigazine.net/gsc_news/en/20190121-b612-font-family/)
- **Tabular/monospaced digits are mandatory**, not a nice-to-have, anywhere a value changes in
  place (altitude, airspeed, frequencies, squawk code, heading bug). Proportional digits cause
  perceptible "jitter" as digit widths change, which is disorienting on an instrument meant to be
  read in a half-second glance. Dynon's HDX glass panel is a good anchor data point: it uses
  **Bitstream Vera Sans Mono Bold, modified to remove the dot from the zero** (to avoid
  confusing 0 with 8 at a glance) — exactly the kind of small, deliberate legibility fix Avionix
  should budget for if it keeps a geometric mono/tabular face.
  [Dynon forum: HDX display font](https://forum.flydynon.com/threads/which-font-does-the-hdx-use-for-display-data.15782/)
- **Digit rolling drums**: altitude and airspeed tapes in real PFDs don't just print a static
  number — the last 1–2 digits are rendered as a continuously rolling drum/odometer that
  interpolates between values as the tape scrolls, so the ones-digit is visibly "mid-roll" at a
  non-integer altitude. This is a recognizable, high-signal detail of real glass (vs. a cheap
  imitation that snaps the number). Source: [NASA technical report on moving-tape PFD formats](https://ntrs.nasa.gov/api/citations/19870018232/downloads/19870018232.pdf), [AOPA — How a PFD works](https://www.aopa.org/news-and-media/all-news/2020/august/flight-training-magazine/ol-how-it-works-pfd)
- **7-segment vs. LCD on radios**: legacy King KX-155 used a **vacuum-fluorescent 7/9-segment**
  display (hence its well-known failure mode — VFDs die and there's a whole refurb industry
  around it); Garmin's GNC 255/GTR 225 replaced that with a crisper **dot-matrix LCD**, still
  segment-style for the numerals but with proper annunciator text labels. For a software radio
  panel, the realistic choice is a **DSEG-style seven-segment numeral face** (DSEG is a free,
  OFL-licensed font family built specifically to imitate LCD/LED segment displays) for the
  frequency readouts, paired with a small plain sans for mode labels (COM1/NAV1, "XPDR", etc.) —
  mixing a segment font for numerals with a normal UI font for chrome is exactly how the real
  boxes look.
  Sources: [AVweb — KX-155/165 VFD obsolescence and refurb program](https://avweb.com/news/bendixking-kx155-165-radio-obsolete-display-creates-refurb-program/), [DSEG font project](https://github.com/keshikan/DSEG)
- **Legibility sizing**: AC 25-11B/23.1311-1C don't mandate a specific point size (that's an
  SAE/ARINC ergonomics question), but the standing human-factors guidance for primary flight
  values is to size them for reliable reading at normal cockpit viewing distance (~30 inches) in
  direct sun and at night, which is why real PFD numerals are proportionally much larger relative
  to their container than typical app UI text — e.g. the airspeed/altitude readout box is sized
  to be the single most dominant numeral on the whole display, bigger than any label or button
  text around it.

---

## 3. Real panel hardware look

### Garmin GFC 500 / GMC 507 (the realistic GA autopilot to emulate)
(Note: the brief says "GMC 707" — Garmin's actual panel-mount GFC 500 controller is the
**GMC 507**; there is no GMC 707. Documenting the real part number here so the research stays
accurate.)
- Layout convention: **lateral modes on the left, status/engage in the middle, vertical modes on
  the right** — HDG and NAV keys on the left side of the controller, AP/FD engage + LVL in the
  middle, IAS/ALT/VS controls and the big twist knobs (heading, altitude) on the right.
- Each mode key **illuminates (lights up) when its mode is active** — a physical "light bar"
  annunciation baked into the button itself, not a separate indicator. This is the literal
  real-world version of the "boxed new mode for 10s then settles to a steady lit state" idea: the
  button *stays lit* for as long as the mode is engaged, independent of the FMA boxing animation.
- Separate concentric knobs for heading and altitude (twist to set, push to sync in some
  configs); a horizontal thumbwheel for pitch/VS/IAS fine adjustment.
  Source: [GFC 500 Pilot's Guide PDF](https://static.garmin.com/pumac/190-02291-01_06.pdf), search-synthesized GMC 507 control description.

### Bendix/King KAP 140 / KFC 225 — the previous-generation GA autopilot
- KAP 140 buttons: **HDG, NAV, APR, ALT**, plus ARM, BARO, and UP/DN for vertical mode
  adjustment; comes in single-axis (lateral only), two-axis (lateral+vertical), and
  two-axis-with-altitude-preselect configurations — i.e. the feature set actually *scales down*
  by installed configuration, a pattern Avionix already mirrors by making each AP mode an
  independent optional feature per `docs/xplane.md` (`ap-mode-hdg`, `ap-mode-nav`, etc.).
- The KFC 225's flight control computer (not the panel itself) handles mode logic and
  annunciation; mode state is reflected both in panel LEDs and in dedicated AFCS annunciator
  text on the PFD.
  Source: [KAP 140 Pilot's Guide](https://longislandaviators.com/wp-content/uploads/2018/08/KAP-140-AUTOPILOT.pdf)

### Boeing 737 MCP — left-to-right order
Confirmed against Chris Brady's b737.org.uk (a well-known, detailed 737 systems reference): the
glareshield MCP evolved from three independent panels (autopilot center, FD each side on the
-100/-200) into the now-familiar single strip. By the NG, the order left to right is: **speed
(IAS/MACH) window → heading window → altitude window**, with **vertical speed** as a smaller
adjoining window/wheel near the altitude section (not a fully separate leftmost/rightmost
position) — course windows sit outboard near each EFIS control panel, not in the MCP center
strip. The brief's shorthand "IAS/MACH, HDG, ALT, V/S" is directionally correct for the mental
model (speed leftmost, altitude-family rightmost) even if V/S is physically a small adjunct
rather than a fourth full window.
Source: [b737.org.uk — Automatics/MCP history](http://www.b737.org.uk/glareshield.htm)

### Radio active/standby "flip-flop" layout
Confirmed from Garmin's own GTR 225 panel description: **active frequency reads on the left,
standby frequency on the right**, with a dedicated **flip-flop (⇄) key between/below them** that
swaps the two; the standby field is the one responsive to the tuning knob, usually set apart with
a highlighted/boxed outline (this is the real-world ancestor of Garmin's cyan "tuning box"
convention called out in §1). Older King-style radios sometimes stack active-above-standby
instead of side-by-side, but the GTR 225/GNC 255 (the radios actually named in the brief) use the
left/right split.
Source: [GTR 225/225A/225B Pilot's Guide](https://static.garmin.com/pumac/190-01182-00_d.pdf)

### Garmin GTX 345 transponder
Confirmed mode set: **SBY (standby, no replies), ON (replies, no altitude), ALT (replies with
altitude — the one used in the air and, per current Garmin guidance, also on the ground since
automatic air/ground sensing has replaced a separate pilot-selectable GND mode on current
units), IDENT (special identify squawk on ATC request)**. Avionix's modeling (`transponder-mode`,
`transponder-ident` as independent optional features) matches this; note for the compatibility
docs that a literal "GND" mode button is now a legacy concept on the newest Garmin boxes (older
installed base, e.g. GTX 330, still has it) — worth a footnote rather than a hard requirement.
Source: [GTX 335/345 Pilot's Guide](https://static.garmin.com/pumac/190-01499-00_g.pdf)

---

## 4. Six-pack and PFD standard details

- **Airspeed arcs** (bottom to top): **white arc** = flap operating range, Vs0 (bottom) to Vfe
  (top); **green arc** = normal operating range, Vs1 to Vno; **yellow arc** = caution/smooth-air-
  only range, Vno to Vne; **red radial line** = Vne, never exceed. Twins add a **red radial at
  Vmc** and a **blue radial at Vyse** (best single-engine rate of climb). This maps directly onto
  Avionix's existing `arcWhite/arcGreen/arcYellow/arcRed` token names in `tokens.ts` — naming is
  already correctly aligned with the standard.
  Source: [Aviatize — Airspeed Indicator arcs](https://www.aviatize.com/glossary/airspeed-indicator)
- **V-speed bugs** on a glass tape: typically **white** for most reference bugs (V1/VR, Vref
  variants), with an **orange/amber "command" bug** for the currently-flown target (V2 on
  takeoff, Vapp on approach), and a **magenta bug** for an FMS-computed target speed when an FMS
  mode is active. For GA/Avionix's generic panel, the practical set is simpler: a magenta "bug"
  for the AP-selected airspeed target (already matches §1's magenta-for-FMS/selected-target
  rule) plus static white reference marks for Vx/Vy if the aircraft profile provides them.
  Source: [AeroSavvy — The Classic Boeing Airspeed Indicator](https://aerosavvy.com/airspeed-indicator/)
- **Altimeter**: the **Kollsman window** is the small barometric-setting sub-display (inHg or
  hPa); turning its knob changes indicated altitude by 1,000 ft per 1 inHg — Avionix's
  `altimeter-setting` feature (writable `barometer_setting_in_hg_pilot`, STD = 29.92) is exactly
  this control. A **trend vector** (a magenta/cyan line extending up or down from the current
  value, usually a 6-second lookahead) is standard on both the altitude and airspeed tapes on any
  real glass PFD and is a conspicuously-missing cue on a tape display that doesn't have one.
- **Standard rate turn**: **3°/sec**, i.e. a 2-minute 360° turn; the turn-rate indicator/HSI has
  tick marks at the standard-rate deflection (commonly ±20° or ±25° bank-equivalent depending on
  instrument, which is consistent with `docs/xplane.md`'s noted-as-unverified
  `STANDARD_RATE_DEFLECTION_DEG` assumption of 20°).
- **Slip/inclinometer ("the ball")**: rendered as a **yellow/black ball in a curved glass tube**
  (mechanical) or a stylized **yellow trapezoid between two white reference lines** on glass —
  centered = coordinated flight, displaced = slip or skid. Avionix should keep this a distinct
  yellow element, not reuse the amber caution color semantically (it's a flight-state indicator,
  not a warning).
- **PFD attitude colors**: **sky = blue, earth = brown/tan**, separated by a white horizon line;
  **pitch ladder** in 5°-increment lines (labeled every 10°) that stay parallel to the horizon.
  This matches `dayInstrument.sky`/`ground`/`horizon` in `tokens.ts` closely already (see gap
  analysis below for the one mismatch).
  Source: [AeroCorner — Attitude Indicator](https://aerocorner.com/blog/attitude-indicator-cockpit/), [FlyByWire A32NX PFD attitude doc](https://docs.flybywiresim.com/pilots-corner/a32nx/a32nx-briefing/pfd/artificial-horizon/)

---

## 5. What CFIs and professional pilots actually say about sim/training-device realism

Direct access to live Reddit threads (r/flying, r/flightsim) was blocked at the network level in
this research session (reddit.com returns an anti-bot block to automated fetches), so the
following leans on PPRuNe, Pilots of America, AOPA, and Flight Safety Foundation — all explicitly
in-scope secondary sources with quoted material and live URLs. Where a claim is paraphrase-level
from a search snippet rather than a verbatim quote, it's marked as such.

- **"The simulator won't behave exactly like the airplane. That's not the point."** — AOPA's
  *Flight Training* magazine on instrument-training simulators; the author argues exact physical
  fidelity matters less than correct instrument cross-check habits, but *also* flags concrete,
  specific realism failures that *do* matter: **"GPS interfaces are frequently problematic, with
  poor button simulation,"** outdated software vs. real avionics after updates, and unconvincing
  simulated ATC. These are precisely the kind of "wrong abbreviation / wrong button behavior"
  failures the brief is worried about.
  [AOPA — "Don't fly, simulate"](https://www.aopa.org/news-and-media/all-news/2022/august/flight-training-magazine/instrument-tips-simulator)
- CFI confidence in training devices is inconsistent and sometimes **not evidence-based** —
  AOPA's piece notes many instructors hold "a low level of confidence" in simulation training
  that isn't well supported by the research, suggesting skepticism is partly cultural/habitual.
  That cuts both ways for Avionix: a skeptical CFI will scrutinize *surface* fidelity (the first
  thing they can judge at a glance) even harder when they're predisposed to doubt the tool.
- **Pilots of America forum, "Training Value From Sims?"**: one pilot dismisses desktop sims —
  **"Desktop sims such as these have very little real world application... As far as actual
  flying skills being obtained from one is nil."** — while another pushes back: **"When I needed
  to bone up on crosswind landings, I used my sim... for practicing and firming up learned skills
  taught by a CFI, it beats the hell out of chair flying."**
  [Pilots of America — Training Value From Sims?](https://www.pilotsofamerica.com/community/threads/training-value-from-sims.99904/)
- **PPRuNe consensus** (tech-log and professional-training subforums): simulators are seen as
  "fantastic for instrument work" and procedures, but can **create bad habits for visual flying**
  (over-reliance on instrument scan carried into the real airplane) and are criticized when
  landing/handling feel "overly stable" compared to the real aircraft — i.e. realism gaps in
  *feel*, not just looks, are what experienced pilots flag.
  [PPRuNe — "Is there anything to be gained by using a flight simulator?"](https://www.pprune.org/archive/index.php/t-402449.html)
- **PPRuNe on iPad/tablet avionics trainers specifically** (closest analog to Avionix's own
  category): the stated goal of this class of app is **"to build repetition and muscle-memory
  using the actual controls of the installed hardware,"** with the caveat that **"no iPad sim is
  going to be hyper realistic"** — i.e. professional pilots judge these apps by button-for-button
  procedural fidelity (does pressing this do what the real box does, in the right order, with the
  right labels), not by graphical polish.
  [PPRuNe — iPads for training](https://www.pprune.org/professional-pilot-training-includes-ground-studies/668773-ipads-training.html)
- **Flight Safety Foundation, "The Limits of Realism"** (academic synthesis, cited by
  professional training orgs): **"state-of-the-art realism offers no particular advantage in
  preparing pilots for ambiguous, time-pressured situations,"** and flags "if the pilots like it,
  it is good" as a *flawed* assumption — enjoyment/polish isn't the same as training validity.
  Relevant caution for Avionix: don't over-invest in cosmetic realism at the expense of correct
  *behavior* (right dataref semantics, right mode logic) — both matter, but behavior is what
  actually transfers.
  [Flight Safety Foundation — The Limits of Realism](https://flightsafety.org/asw-article/the-limits-of-realism/)
- **FAA AATD/BATD standard (AC 61-136B)** sets the bar precisely the way the brief implies:
  devices must **"model controls, instruments, and switches as closely as practicable to at
  least one aircraft in the represented family,"** reproducing "the appearance, arrangement,
  operation, and function of realistically placed... controls," with AATDs required to exceed
  BATD fidelity further. This is a useful internal mantra for Avionix even though it isn't
  seeking FAA ATD credit: *arrangement and function first, pixel-perfect skin second.*
  [AC 61-136B PDF](https://www.faa.gov/documentlibrary/media/advisory_circular/ac_61-136b.pdf)

**Synthesis for the product owner**: the credible signal across every source is that experienced
pilots and CFIs forgive stylized graphics far more readily than they forgive (a) wrong color
semantics, (b) wrong units/labels/abbreviations, or (c) buttons/modes that don't behave the way
the real box does. Avionix's existing dataref-accurate plumbing (per `docs/xplane.md`) is already
doing the hard part; the visual layer's job is to not undercut that credibility with cheap-looking
or non-standard color/typography choices.

---

## 6. Accessibility: colour plus shape, dark cockpit, dimming

- **Redundant coding is an FAA human-factors requirement, not a nice-to-have**: "colors in
  electronic flight displays must be employed only as a redundant cue and be semantically
  standardized" — meaning color differences (e.g. green vs. white mode text) must be backed by a
  second channel (text label, shape, position, boxing) so a color-vision-deficient pilot isn't
  locked out of status information. Red/green confusion is explicitly called out as a real
  operational risk given how much of aviation (lights, charts, instruments) leans on exactly
  those two hues.
  Source: [FAA human factors color guidance, DOT HFCC](https://hfcc.dot.gov/publications/docs/GeneralGuidance/zz_FAA_GeneralGuidanceDoc_Chapter_03_Section_07.pdf), [AOPA — color-blindness and medical certification](https://pilot-protection-services.aopa.org/news/2025/january/01/sorry-i-do-not)
- Practical translation for Avionix: the boxed-mode-change cue (§1) already is this kind of
  redundant coding done right (shape/position, not just color). The same logic should extend to
  anything currently color-only, e.g. a "failed/invalid data" red-X flag (already shape-coded,
  good) vs. any caution state that's purely an amber text color with no icon/label change.
- **Dark cockpit philosophy**: real flight decks default to "quiet, dark" — a screen or
  annunciator stays unlit/black until a condition needs the pilot's attention, rather than
  constantly glowing with "all normal" indications. This is the opposite of a dashboard-style app
  that lights up every tile all the time; Avionix's own night theme (all-black background) is
  philosophically aligned, but the *light/dark day themes* don't yet apply "stay dark unless it
  matters" to non-instrument chrome (see gap analysis).
- **Display dimming**: AC guidance expects displays to be **dimmable down to levels compatible
  with dark-adapted vision**, ideally via automatic luminance adjustment tied to ambient light,
  because full dark-adaptation (rod vision) takes ~30 minutes and a single bright flash can erase
  it. Avionix already ships a dedicated `night` theme mode (not just a dimmed dark mode) with
  every color capped at relative luminance ≤0.30 — this is the correct real-world pattern
  (discrete day/night modes, not just a slider), matching how most glass panels implement a
  distinct "NIGHT" display mode rather than continuous dimming alone.
  Source: [search synthesis of FAA display-dimming guidance + AC 25-11B](https://www.faa.gov/documentlibrary/media/advisory_circular/ac_25-11b.pdf)

---

## 7. Gaps vs. current Avionix palette/typography

Read: `/Users/code/Documents/git/avionix/src/theme/tokens.ts`, `/Users/code/Documents/git/avionix/docs/xplane.md`.

What's already right (keep it):
- `arcWhite/arcGreen/arcYellow/arcRed` naming and the day-vs-night instrument split with a
  ≤0.30-luminance night palette is exactly the real convention (discrete night mode, not a
  dimmer slider).
- `flag`/`flagText` as a distinct red-X failure-flag concept (shape + color, not color alone)
  already satisfies the redundant-coding requirement from §6.
- `sky`/`ground`/`horizon` exist as named tokens, so re-tuning their values (below) is a
  one-line change, not a redesign.

Concrete gaps and recommended changes:

1. **No semantic "armed / active / selected-target" color tokens exist anywhere in
   `ThemeColors`/`InstrumentColors`.** Today there's only `primary`, `success`, `danger` — a
   generic app palette, not an avionics one. For the autopilot panel (F-20, already merged) and
   any future radio/PFD bug work, add dedicated tokens, e.g.:
   - `modeActive` (green, ~`#2fbf4a`/matches existing `arcGreen`) — engaged AP modes.
   - `modeArmed` (white/light gray, ~`#e8eaed`) — armed AP modes.
   - `selectedTarget` / `fmsMagenta` (magenta, ~`#e040c0`–`#ff33cc` range) — AP-selected
     airspeed/altitude bugs, active flight-plan-style guidance.
   - `tuningCyan` (cyan, ~`#39c7e8`) — standby-frequency "about to be set" boxes on the radio
     panel (F-21/F-22), matching the Garmin "cyan tuning box" convention.
   Without these, any future radio/autopilot UI work risks reinventing ad hoc colors per screen,
   which is the "inconsistent use of color" failure mode AC 23.1311-1C explicitly warns against.

2. **`primary: '#1f6feb'` (a generic "GitHub blue") is reused for ordinary app chrome
   (buttons, links) in both light and dark themes.** That's fine for app chrome, but it must
   never bleed into instrument/avionics surfaces — confirm (not verified in this pass) that no
   PFD/radio/AP component borrows `colors.primary` for something a pilot would read as "armed" or
   "selected." Recommend a lint/convention: instrument-facing components only ever pull colors
   from `theme.instrument` or the new semantic tokens above, never from `theme.colors`.

3. **`danger`/`success` are reused for two different jobs** (generic app-level error/success
   *and*, implicitly, anything safety-related) under one name. AC 25-11B/23.1311-1C protect red
   and amber specifically for warnings/cautions; a generic `danger` token risks getting used for
   a non-safety-critical validation error (e.g. "invalid frequency entered") in exactly the same
   red as a real warning color, which trains the pilot to *not* trust red. Recommend: keep
   `danger`/`success` for plain app-level UI (form validation, connection errors) but make sure
   avionics displays only use `instrument.arcRed`/a new `instrument.caution` (amber) pair, never
   `colors.danger`, so the two red tones (or at least the two *meanings*) stay separable even if
   rendered as the same hex.

4. **No amber/caution token in `InstrumentColors` distinct from `arcYellow`.** `arcYellow` is
   correctly the airspeed-arc color, but AC 23.1311-1C's "cautions, abnormal source" amber is a
   broader concept (e.g. a transponder in a questionable mode, a stale-but-not-failed value)
   that shouldn't be forced to reuse the airspeed-tape-specific yellow. Add `instrument.caution`
   (amber, distinct variable even if the hex matches `arcYellow` initially) so the two concepts
   can diverge later without a rename.

5. **Day instrument `sky`/`ground` are a reasonable approximation but slightly off the
   standard hue family.** AC 23.1311-1C calls the earth "tan/brown" and the sky "cyan/blue."
   Current `sky: '#2f7fd1'` is a fairly saturated mid-blue (fine) and `ground: '#8a5a2b'` is a
   warm brown (fine) — these are *acceptable*, no change required, but note the night-mode
   equivalents (`sky: '#1d3a5c'`, `ground: '#3e2a17'`) desaturate correctly toward the
   amber-monochrome night palette, which is the right move and doesn't need touching.

6. **No boxed-mode-change affordance exists in the type system at all.** `InstrumentColors`/
   `ThemeColors` have no token or timing constant for "new mode highlight for ~10s" (§1's single
   highest-value missing realism cue). This isn't just a color gap — it needs a small bit of
   state (a timestamp per mode, cleared after 10s) plus a highlight color token, e.g.
   `modeChangeHighlight` (a bright green outline/background distinct from steady-state
   `modeActive`). Worth scoping as a small follow-up to the already-merged F-20 autopilot work
   rather than retrofitting it mid-stream.

7. **Typography tokens are purely size-based (`headingSize/titleSize/bodySize`), with no
   mention of a monospace/tabular face anywhere in `tokens.ts` or referenced fonts in the repo
   search done for this task.** For any live-updating numeric readout (airspeed, altitude,
   heading, frequencies, squawk), the app should declare a dedicated numeric font family token
   (e.g. `typography.numeric = 'B612 Mono'` with a system-monospace fallback) distinct from
   `typography.bodySize`'s implied UI font. Recommend:
   - Use **B612** (proportional, for instrument labels/annunciator text) and **B612 Mono** (for
     tabular numerals: airspeed/altitude/heading/frequency/squawk) — both free, OFL-licensed,
     and literally the Airbus-commissioned cockpit-legibility research font, which is a strong,
     citable choice for the product owner's "credible to professional pilots" bar.
   - For radio-frequency and squawk-code displays specifically, consider a **DSEG-style
     seven-segment face** layered under/alongside B612 Mono to evoke the KX-155/GTR-225 LCD look
     the brief explicitly asks about — this is a purely cosmetic skin choice (not a legibility
     requirement) and should be optional/themeable rather than forced everywhere.
   - No rolling-drum digit animation exists today (reasonable to defer — it's an animation/
     interaction detail, not a token), but flag it as the realism cue most likely to be noticed
     by an experienced glass-cockpit pilot comparing Avionix's altitude/airspeed tapes to a real
     G1000/G3000 (already-merged F-10 instruments, PR #13).

8. **No explicit "armed mode button stays lit" / light-bar state exists for the autopilot
   panel component** (separate from the FMA-style box-for-10s cue in #6) — real GFC 500/GMC 507
   buttons stay illuminated for as long as a mode is active, not just briefly on change. Confirm
   the already-merged F-20 autopilot panel (PR #15) renders a persistent "lit" state for each
   active mode button, not just a transient highlight; if it only has the latter, that's a gap
   worth a quick follow-up ticket.

---

## Source list (all URLs used above)

- [AC 25-11B — Electronic Flight Displays](https://www.faa.gov/documentlibrary/media/advisory_circular/ac_25-11b.pdf)
- [AC 23.1311-1C — Electronic Flight Instrument Systems](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_23_1311-1C.pdf)
- [AC 61-136B — Aviation Training Devices](https://www.faa.gov/documentlibrary/media/advisory_circular/ac_61-136b.pdf)
- [DOT/FAA Human Factors color guidance, Ch. 3 §7](https://hfcc.dot.gov/publications/docs/GeneralGuidance/zz_FAA_GeneralGuidanceDoc_Chapter_03_Section_07.pdf)
- [Pilots of America — "Color of AFCS modes -- G1000"](https://www.pilotsofamerica.com/community/threads/color-of-afcs-modes-g1000.40574/)
- [Garmin G1000 Reference Manual — Color Code section](https://www.manualslib.com/manual/1392149/Garmin-G1000.html?page=55)
- [rotatepilot.com — Garmin G1000 Complete Guide](https://rotatepilot.com/guides/garmin-g1000-guide)
- [Flaps2Approach — B737NG FMA](https://www.flaps2approach.com/journal/2014/9/18/b737-800-ng-flight-mode-annunciator-fma.html)
- [FlyByWire Simulations docs — A32NX FMA](https://docs.flybywiresim.com/pilots-corner/a32nx/a32nx-briefing/pfd/fma/)
- [AirbusDriver.net — EFIS3 FMA reference PDF](http://www.airbusdriver.net/EFIS3.pdf)
- [Wikipedia — Annunciator panel (AP disconnect convention)](https://en.wikipedia.org/wiki/Annunciator_panel)
- [Garmin creative style guide — typography](https://creative.garmin.com/styleguide/typography/)
- [Google Fonts — B612](https://fonts.google.com/specimen/B612)
- [Hacker News — B612 cockpit font provenance](https://news.ycombinator.com/item?id=18946601)
- [GIGAZINE — B612 font family research write-up](https://gigazine.net/gsc_news/en/20190121-b612-font-family/)
- [Dynon forum — HDX display font (Bitstream Vera Sans Mono Bold, modified zero)](https://forum.flydynon.com/threads/which-font-does-the-hdx-use-for-display-data.15782/)
- [DSEG — 7-segment/14-segment open font](https://github.com/keshikan/DSEG)
- [AVweb — KX-155/165 VFD display obsolescence](https://avweb.com/news/bendixking-kx155-165-radio-obsolete-display-creates-refurb-program/)
- [NASA — Primary Flight Display via Moving-Tape Formats](https://ntrs.nasa.gov/api/citations/19870018232/downloads/19870018232.pdf)
- [AOPA — How it works: the PFD](https://www.aopa.org/news-and-media/all-news/2020/august/flight-training-magazine/ol-how-it-works-pfd)
- [GFC 500 Pilot's Guide](https://static.garmin.com/pumac/190-02291-01_06.pdf)
- [KAP 140 Pilot's Guide](https://longislandaviators.com/wp-content/uploads/2018/08/KAP-140-AUTOPILOT.pdf)
- [b737.org.uk — Automatics/MCP history](http://www.b737.org.uk/glareshield.htm)
- [GTR 225/225A/225B Pilot's Guide](https://static.garmin.com/pumac/190-01182-00_d.pdf)
- [GTX 335/345 Pilot's Guide](https://static.garmin.com/pumac/190-01499-00_g.pdf)
- [Aviatize — Airspeed Indicator arcs/V-speeds](https://www.aviatize.com/glossary/airspeed-indicator)
- [AeroSavvy — The Classic Boeing Airspeed Indicator (speed bugs)](https://aerosavvy.com/airspeed-indicator/)
- [AeroCorner — Attitude Indicator](https://aerocorner.com/blog/attitude-indicator-cockpit/)
- [FlyByWire docs — A32NX artificial horizon](https://docs.flybywiresim.com/pilots-corner/a32nx/a32nx-briefing/pfd/artificial-horizon/)
- [AOPA — "Don't fly, simulate"](https://www.aopa.org/news-and-media/all-news/2022/august/flight-training-magazine/instrument-tips-simulator)
- [AOPA — "Simulation semantics"](https://www.aopa.org/training-and-safety/flight-schools/flight-school-business/newsletter/2015/february/20/simulation-semantics)
- [Pilots of America — "Training Value From Sims?"](https://www.pilotsofamerica.com/community/threads/training-value-from-sims.99904/)
- [PPRuNe — "Is there anything to be gained by using a flight simulator?"](https://www.pprune.org/archive/index.php/t-402449.html)
- [PPRuNe — "iPads for training"](https://www.pprune.org/professional-pilot-training-includes-ground-studies/668773-ipads-training.html)
- [Flight Safety Foundation — "The Limits of Realism"](https://flightsafety.org/asw-article/the-limits-of-realism/)
- [AOPA Pilot Protection Services — color blindness and medical certification](https://pilot-protection-services.aopa.org/news/2025/january/01/sorry-i-do-not)
