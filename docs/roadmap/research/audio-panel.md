# Audio panel research (F-23)

Collected 2026-10-07 for the F-23 spec (`docs/superpowers/specs/2026-10-07-audio-panel-design.md`), which records which implications were taken and why.

Note on method: live web search engines (Google/Bing/DuckDuckGo) and Reddit were
blocked by bot-detection for the whole session, so this leans on (a) Pilots of
America forum pages and AVweb's own site search, fetched directly, (b)
manufacturer sites (PS Engineering, RealSimGear), and (c) GitHub code search
over real X-Plane plugins/cockpit-building projects, which gave precise,
live-tested dataref/command names and behavior notes. Every claim has a URL.

## 1. Real audio panels pilots use

**Garmin GMA 340** (the long-time GA standard, now replaced by GMA 345/35).
Confirmed layout from a from-scratch X-Plane control-mapping project that
targets exactly the GMA 340's control set (one hardware button per function):
`monitor_audio_mkr`, `transmit_audio_com1`, `transmit_audio_com2`,
`monitor_audio_nav1`, `monitor_audio_nav2`, `monitor_audio_dme`,
`monitor_audio_adf` — separate **MIC1/MIC2** transmit-select keys and separate
**COM1/COM2/NAV1/NAV2/ADF/DME/MKR** monitor keys, each an independent lit
pushbutton.
(https://github.com/fouldsy/piper-pa-28-flight-sim/blob/43ea41f2681e339a563d868291ec12fce94eae3c/archived/gma_340/logic.lua)
A real KMA-28 (Bendix/King, same class as the GMA 340) replica project's pinout
confirms the physical layout from the unit itself: separate marker-beacon
lamps **O/M/I** (`LED_O`/`LED_M`/`LED_I`), a push-volume knob, **HI SENS**
(`HI_SW`), an isolation switch (`ISO_SW`), a **CREW** switch, per-source
"listen"/"press" pins for **COM1/COM2/NAV1/NAV2/MKR/ICS(intercom)/ADF/AUX/DME/
SPR(speaker)**, dedicated **split-com** pins both directions (`COM1/2` and
`COM2/1`), **TEL**, **Transmit**, **Swap** — and, notably, a dedicated **COM3**
pin, i.e. some real KMA-28 installs do wire a third COM radio in (X-Plane's
stock system does not support this, see §4).
(https://github.com/CaptainBobSim/The-Cessna-172-Project-V3/blob/631f46df520ce66f235f36167ffbc2dc4da913e5/Section%202%20-%20Component%20Library%20and%20Structure/2-6%20Avionics%2C%20Radios%2C%20Annunciators/AUDIO_KMA%2028/README.md)

**PS Engineering PMA8000 / PMA450 series** (the main GMA-340 "drop-in
replacement" competitor). PS Engineering's own site lists the lineup: PMA8000B
(general aviation), PMA8000E (business aviation), PMA450B, PMA450C (new,
cost-reduced), PMA450EX (integrated with Dynon SkyView HDX), plus legacy
PAR200B, PMA4000, PMA6000B, PMA7000.
(https://www.ps-engineering.com)
AVweb's review of the PMA450C: priced $300 under the PMA450B at $2,595, "a
drop-in replacement for aging Garmin GMA 340 panels," dual-Bluetooth, six-place
intercom with three isolation modes, built-in comm-audio recording, OLED display;
it's a cut-down PMA450B — the IntelliAudio spatial-audio feature "doesn't
increase the volume of the spatially-placed radios—it only changes where in the
headset they are heard," and the PMA450C fixes it at 10/2 o'clock instead of the
PMA450B's nine programmable positions. Garmin's own GMA 340-replacement options
are priced at $1,696 (PMA8000G) up through the GMA 345 at $2,145.
(https://avweb.com/features/pma450c-audio-panel-inflation-fighter/)

**Lit-annunciator convention / "COM auto-monitor."** A PoA thread comparing the
Garmin GMA 350/35 against the PS Engineering PMA 450 makes the UX difference
explicit: on the Garmin, "the screen makes it super easy to navigate the
options," but switching isolation modes needs **two** button presses, whereas
the PMA 450 **cycles through modes with one button**; the PMA 450's intercom
volume is shared across stations ("If one person talks loudly and another
talks quietly" there's no per-seat balance, unlike Garmin's individual
controls).
(https://www.pilotsofamerica.com/community/threads/garmin-gma-350-35-vs-ps-engineering-pma-450.140026/)
X-Plane's command set mirrors the real GMA-340-style convention directly:
selecting a COM's **transmit** key (`sim/audio_panel/transmit_audio_com1`) is a
*separate, modern* command from the old-style **manual** transmit command
(`...transmit_audio_com1_man` — documented inline as "old panel, doesn't
change listener"), i.e. exactly the real GMA 340/345 "auto-monitor" behavior:
pressing a MIC key selects both transmit *and* listen, while older/simpler
panels keep the two independent.
(https://github.com/Rororo098/Xplane-Dataref-Bridge/blob/c5fc53383587ac5d0f25c8757ea02777ee5b07ad/XP12%20dataref%20list%20and%20commands/Commands.txt)

## 2. What pilots like and hate about audio panels

- **Marker beacon is widely seen as obsolete/annoying, not useful.** From a PoA
  thread about ordering a PMA 450B with vs. without the marker-beacon option:
  one pilot says he's "never needed one"; another "not heard it for years"
  since the FAA removed most marker beacons after GPS approaches became
  standard; a third calls the tone "more distracting than helpful," and one
  jokes it just "startles passengers." Consensus and the OP's final call: skip
  the marker-beacon option — the saved cost is "an hour and a half of avgas."
  (https://www.pilotsofamerica.com/community/threads/pma-450b-with-or-without-marker-beacon.153802/)
- **Support and software quality matter as much as features.** In the GMA
  350/35 vs PMA 450 thread, PS Engineering's support is repeatedly praised —
  "Mark Scheuer picks up the phone on the 2nd ring," "far and away better than
  Garmin" — while Garmin is liked for "individual [volume] controls" per seat
  and "auto connects to my iPad" Bluetooth.
  (https://www.pilotsofamerica.com/community/threads/garmin-gma-350-35-vs-ps-engineering-pma-450.140026/)
- **"Can't hear ATC" is a known, specific audio-panel-state bug class in
  flight sim.** Third-party ATC-voice tools for X-Plane (SayIntentions.AI)
  hook exactly the monitor/transmit datarefs from §4 (`audio_selection_com1`,
  `audio_selection_com2`, `audio_com_selection`, `audio_volume_com1/2`) to
  drive their own RX/TX indicators — i.e. "I can't hear ATC" and "my COM2
  monitor is off" are the same bug from the sim's point of view.
  (https://github.com/davidbodnar/sayintentions-xplane-radios/blob/4df98f6866ab543b8e40ffe45edfa9d02ea4edee/README.md)
- **ATC-bridge plugin authors (VATSIM/IVAO-style) explicitly flag the
  auto-monitor coupling as a gotcha they work around**, see §4 — real pilots'
  #1 complaint ("which radio am I on") shows up almost identically in sim
  tooling as "stuck transmitting on the wrong radio."

## 3. Flight-sim companion apps / hardware with an audio panel

- **RealSimGear** sells its audio-panel control as part of bundled hardware
  rather than standalone today; its "Cessna Home Package" product page
  advertises "Replica G1000 panels, **audio panel** & autopilot integration."
  (https://realsimgear.com/products/cessna-home-package)
  A community X-Plane plugin for RealSimGear's physical panels maps hardware
  buttons straight onto stock commands: `BTN_MIC1` →
  `sim/audio_panel/transmit_audio_com1`, `BTN_MIC2` → `...transmit_audio_com2`,
  `BTN_COM1`/`BTN_COM2` → `monitor_audio_com1/2`, `BTN_NAV1/NAV2/ADF/DME/MKR` →
  the matching monitor commands — RealSimGear's G1000-style hardware is wired
  to X-Plane's generic, non-aircraft-specific commands.
  (https://github.com/hamarituc/realsimgear/blob/45dec6fc721cb52e1662f2936ff956c0a0c6dd1c/realsimgear.lua)
- **Airbus ACP companion-panel projects exist and are well documented.** A
  browser-based remote-panel app for the X-Plane default A330 and ToLiss
  Airbus ships a dedicated ACP (Audio Control Panel) profile alongside its RMP
  (radio) profile — see §4 for detail; a close real-world match for the
  "Remote X-Plane Avionics (A330 ACP)" category named in the brief.
  (https://github.com/larsten42/xplane-a333-panels/blob/60b55b21edc4b2934fd5d70424aa85544abfc08d/config/profiles/rmp-acp-a333.json)
- **X-Plane default aircraft with an audio panel:** stock GA aircraft (Cessna
  172 classic/G1000, Baron 58, King Air 350, Cirrus SR22) all run through the
  same generic `sim/audio_panel/*` commands — confirmed by the PA-28/G1000
  plugin above issuing these against "G1000" instruments with no
  aircraft-specific audio dataref.
  (https://github.com/fouldsy/piper-pa-28-flight-sim/blob/43ea41f2681e339a563d868291ec12fce94eae3c/g1000/instruments/audio/logic.lua)
  The default Boeing 737 instead uses Laminar's own `laminar/B738/*` namespace
  (confirmed via a real hardware-cockpit project built against the default
  737, driving a 3-station ACP — Captain/FO/Jump Seat — with its own
  mic-enable/PTT wiring per station, not the generic GA panel).
  (https://github.com/retostockli/xpcockpit/blob/d56334b292e2a92deaaf37a9fa7abf1404544206/xpteensy/src/b737_audio.c)
- PS Engineering's own announcements (new PAR200B with "soft keys" and OLED,
  replacing a plain LCD) show the real-hardware trend toward software-driven,
  menu-based audio panels rather than a fixed 16-button layout.
  (https://avweb.com/aviation-news/ps-engineering-updates-com-radio-audio-panel/)

## 4. X-Plane specifics: datarefs, commands, gotchas

**Commands (confirmed from the current XP12 command list):**
```
sim/audio_panel/transmit_audio_com1          Transmit: COM1 (also sets listener — "new panel" behavior)
sim/audio_panel/transmit_audio_com2          Transmit: COM2 (also sets listener)
sim/audio_panel/transmit_audio_com1_man      Transmit: COM1 — "old panel, doesn't change listener"
sim/audio_panel/transmit_audio_com2_man      Transmit: COM2 — "old panel, doesn't change listener"
sim/audio_panel/monitor_audio_com_auto       Monitor: COM auto (same as transmit) toggle
sim/audio_panel/monitor_audio_com1/_on/_off  Monitor: COM1 toggle / on / off
sim/audio_panel/monitor_audio_com2/_on/_off  Monitor: COM2 toggle / on / off
sim/audio_panel/monitor_audio_nav1/nav2      Monitor: NAV1/NAV2 (+ _on/_off each)
sim/audio_panel/monitor_audio_adf1/adf2      Monitor: ADF1/ADF2 (+ _on/_off)
sim/audio_panel/monitor_audio_dme            Monitor: DME (+ _on/_off)
sim/audio_panel/monitor_audio_mkr            Monitor: marker beacon (+ _on/_off)
sim/audio_panel/use_pilot_audio / use_copilot_audio   Switch which seat's audio panel you hear
sim/audio_panel_copilot/*                    Full mirrored set for the right seat
```
(https://github.com/Rororo098/Xplane-Dataref-Bridge/blob/c5fc53383587ac5d0f25c8757ea02777ee5b07ad/XP12%20dataref%20list%20and%20commands/Commands.txt)

**Datarefs** (from a real FSUIPC-compatibility plugin that reads/writes these
directly, bit-packed exactly as classic FSUIPC's "radio audio switches, bit
0=COM1..6=Marker" offset):
```
sim/cockpit2/radios/actuators/audio_selection_com1   (bool, "listening on COM1")
sim/cockpit2/radios/actuators/audio_selection_com2
sim/cockpit2/radios/actuators/audio_selection_nav1
sim/cockpit2/radios/actuators/audio_selection_nav2
sim/cockpit2/radios/actuators/audio_selection_adf1
sim/cockpit2/radios/actuators/audio_dme_enabled
sim/cockpit2/radios/actuators/audio_marker_enabled
```
(https://github.com/1090MHz/OpenXPUIPC/blob/27e958e4bddd4ddf322adefbebfda60b05888049/OpenXPUIPC/src/fsuipc_offsets/Radios.h)

**The transmit-selector enum and its auto-monitor side effect (values 6/7).**
A plugin author integrating a real King Air-style transmit knob documents it
precisely:
> "Note the `audio_com_selection` dataref will also set which radio is selected
> for receiving i.e. **6** will transmit and receive on COM1 and mute COM2,
> **7** will do the opposite. We want to continue to receive from both radios,
> however." — and the fix was to use `audio_com_selection_man` instead so the
> transmit knob doesn't silently kill the other radio's monitor.
(https://github.com/JDeeth/mu2tweak/blob/fd3ffe123f0df75f64a04edd58b42515f0b060b5/src/transmit_selector.rs)
A VATSIM/IVAO network bridge (`xswiftbus`) independently confirms the same
split — it tracks `audio_com_selection` (comment: `// 6==COM1, 7==COM2`)
separately from `audio_selection_com1`/`audio_selection_com2` (independent
listen flags) and `audio_volume_com1/2`.
(https://github.com/swift-project/pilotclient/blob/58820c73cf065aace89355693753d223c4d03850/src/xswiftbus/service.h)
A Stream Deck plugin for X-Plane 12 drives both layers through the Web API and
confirms they're independently readable/writable at runtime (`rx1`/`rx2` from
`audio_selection_com1/2`, `tx1`/`tx2` derived as `tx == 6` / `tx == 7` from
`audio_com_selection`).
(https://github.com/pablovuela/XplaneCom/blob/68f23fce3db572ab2c7c3de720f91c5de11efa3f/xplane_com_monitor.py)

**ATC audio does follow the monitor state.** SayIntentions.AI's X-Plane
integration note explicitly lists `audio_selection_com1/2` and
`audio_com_selection` as the datarefs it reads to decide which COM channel's
volume/RX indicator to drive — i.e. from outside the sim, "hearing ATC" is
gated by the same audio-panel monitor flags a human pilot would set.
(https://github.com/davidbodnar/sayintentions-xplane-radios/blob/4df98f6866ab543b8e40ffe45edfa9d02ea4edee/README.md)

**No COM3 in the stock audio-panel system.** The XP12 command list has no
`com3` entry anywhere under `sim/audio_panel/*` (checked directly — only
COM1/COM2 throughout, plus the mirrored `_copilot` set).
(https://github.com/Rororo098/Xplane-Dataref-Bridge/blob/c5fc53383587ac5d0f25c8757ea02777ee5b07ad/XP12%20dataref%20list%20and%20commands/Commands.txt)
This is confirmed independently by a live-tested Airbus RMP/ACP integration: on
the ToLiss Airbus, `VHF3Press` "never moved anything (plausibly correct: VHF3
is a datalink/ACARS channel, no voice transmission to select)," and on the
stock A330 ACP profile VHF3 has "no equivalent generic volume dataref
confirmed." (A real aircraft with 3 installed COM radios, e.g. some KMA-28
installs per §1, is outside what the stock sim or these addons model.)
(https://github.com/larsten42/xplane-a333-panels/blob/60b55b21edc4b2934fd5d70424aa85544abfc08d/docs/toliss-a340/VERIFYING-RMP-ACP.md)

**Behavior on aircraft without a "real" audio panel / without a listen-toggle
UI for every channel:** the same live-verification doc for the Airbus ACP
notes several channels are read-only lamps with *no* toggle command at all on
some aircraft (HF1/HF2/INT/CAB/LS/MKR/VOR1/VOR2/ADF1/ADF2 on the ToLiss), i.e.
a companion app can show a lit monitor state it cannot actually change for
those channels — a real constraint to design around, not just a theoretical
one. It also documents that the ACP's reception-volume datarefs
(`laminar/A333/audio/capt/volume_pos_0/1`) are read-only in practice today: the
X-Plane 12.4.3 Web API rejects fractional writes to them ("`incompatible_data`
... sent an array to write to a non-array dataref") even though whole-number
writes succeed and a known-good float dataref (barometer) writes fine — a
sim-side Web API bug, not an app bug.
(https://github.com/larsten42/xplane-a333-panels/blob/60b55b21edc4b2934fd5d70424aa85544abfc08d/config/profiles/rmp-acp-a333.json)
The same doc also found the "listen" lamp state for 16 channels lives in one
shared array dataref (`laminar/A333/audio/capt/listen_status`, one bool per
index) toggled by per-index commands (`listen_press00`, `listen_press01`, ...),
and that the MIC/transmit-select lamp state similarly lives in one 16-element
array (`AirbusFBW/ACP1Lights_Raw` on ToLiss) whose index order had to be
discovered empirically (e.g. "PA is at index 9, not 15") — a reminder that
these array-shaped datarefs don't map 1:1 onto a channel list by convention.
(https://github.com/larsten42/xplane-a333-panels/blob/60b55b21edc4b2934fd5d70424aa85544abfc08d/docs/toliss-a340/VERIFYING-RMP-ACP.md)

## Implications for Avionix

1. **Separate "transmit" from "monitor" as two concepts**, but make selecting
   transmit on a COM also turn its monitor on by default (the
   `transmit_audio_com1` "auto-monitor" behavior) — matches the real GMA
   340/345 convention and X-Plane's own modern command, and is the single
   biggest source of real-pilot/sim-user confusion when it doesn't happen
   (§2, §4).
2. **Offer a "manual"/non-coupled mode as an explicit opt-in, not the
   default** (labelled "Independent transmit/monitor", not raw `_man` command
   names) — covers users who want COM1 transmit without losing COM2 monitor,
   the exact problem `mu2tweak`'s author solved by switching commands (§4).
3. **Give transmit and monitor visually distinct lit states** (e.g. filled MIC
   icon vs. outlined speaker icon) rather than one lit color — a lit MIC key
   implying both roles at once should be visible, not inferred (§1).
4. **Drop marker beacon from the default/first-screen layout** — real pilots
   overwhelmingly call it obsolete/annoying and often omit the hardware
   entirely (§2). A small O/M/I lamp row plus MUTE is enough.
5. **Support COM1/COM2 only** at the core model layer, matching X-Plane's
   `sim/audio_panel/*` ceiling — no COM3 row for default aircraft; treat a
   third VHF on study-level add-ons (ACARS-only on most Airbus) as an
   aircraft-specific extension, not baseline (§4).
6. **Model monitor state as per-channel booleans (NAV1/NAV2/ADF/DME/MKR) plus
   one COM-auto flag**, mirroring the real dataref shape
   (`audio_selection_*` + `audio_com_selection`) rather than a single enum —
   matches how third-party tools already read this state (§4).
7. **Don't assume array-shaped ACP datarefs map index-to-channel by
   convention** — the ToLiss integration found a surprising index (PA at 9,
   not 15) only through live testing; verify per-aircraft, don't hardcode (§4).
8. **Show, but don't block interaction on, channels with no toggle command**
   on some aircraft (e.g. VOR/ADF/LS lamps that are read-only on ToLiss) — a
   lit-but-unpressable lamp is expected, not a bug (§4).
9. **Give split-COM a dedicated, clearly-labeled control**, not a buried menu
   item — a named real-unit feature pilots specifically ask about (KMA-28
   wires it as two dedicated pins per direction, §1) and easy to get backwards.
10. **Prefer a single-button cycle for intercom/isolation mode** (PMA-style)
    over Garmin's two-press pattern if screen space is tight — PoA pilots
    flagged the two-press flow as the weaker of the two real designs (§1/§2).
11. **Don't reuse the generic GA model for a future 737 panel** — the default
    737 ACP is multi-station (Captain/FO/Jump Seat) with per-station hand-mic/
    headset/mask selection on `laminar/B738/*`, a different shape than the GA
    panel (§3).
12. **Build a "no audio panel modeled" fallback**: several default GA aircraft
    and most light add-ons rely purely on generic commands with no
    aircraft-specific wiring (§3) — degrade gracefully (hide channels whose
    datarefs don't resolve) instead of assuming every monitor exists.
