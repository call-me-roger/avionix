# F-23 Audio panel — design

Status: approved for planning (2026-10-07, autonomous session: decisions driven by competitor
research and pilot sentiment, recorded below as rulings).

Roadmap entry: `docs/roadmap/features/F-23-audio-panel.md`. Research:
`docs/roadmap/research/audio-panel.md` (new, written with this spec).

## 1. Goal

Answer the question the radio stack cannot: not what is tuned, but what the pilot is talking on and
listening to. A GA audio panel (Garmin GMA 340 / Bendix/King KMA 28 class) on the Radios panel:
transmit selection, receiver monitoring and marker audio, with the marker beacon lamps, driven by
X-Plane's own audio-panel commands and read back from its DataRefs.

## 2. What the research says

- **The GA audio panel is a fixed key set.** GMA 340 / KMA 28: MIC keys per COM (exclusive), then
  independent monitor keys COM1, COM2, NAV1, NAV2, ADF, DME, MKR, with O/M/I marker lamps on the
  unit. RealSimGear's G1000 hardware maps exactly these keys onto X-Plane's generic
  `sim/audio_panel/*` commands, and so does a GMA 340 control-mapping project.
- **"Which radio am I on?" and "why can't I hear ATC/ATIS?" are the complaints.** In X-Plane they
  are the same state: selecting a COM to transmit (6 = COM1, 7 = COM2) also selects it for listening
  and mutes the other COM, which a plugin author documents and works around. ATC tools
  (SayIntentions, xswiftbus) read the same flags to decide what the pilot hears.
- **Transmit and monitor should look different.** One lit colour for both roles hides which key
  means "talking".
- **The marker beacon is widely seen as obsolete** (PoA: "never needed one", "more distracting than
  helpful"). It stays, small, because ILS training still uses it and the roadmap names it, but it
  gets no extra controls (no HI SENS, no MUTE).
- **X-Plane models COM1/COM2 only.** No COM3, split COM, intercom, isolation or PA exist in the
  generic audio panel; airliners (default 737, ToLiss, A330) run their own ACP namespaces.
- **Competitors:** 2 of 15 researched products ship an audio panel (a KM24 clone on Flight Sim
  Remote Panel, an A330 ACP on a browser tool). None shows the transmitting radio on the radio
  stack itself, which the G1000 does (transmit COM drawn in green).

## 3. X-Plane names (verified)

All verified against Laminar's `DataRefs.txt` and `Commands.txt` and the live 12.4.3 DataRef
database; every DataRef is `int`, writable, current since X-Plane 9–11.35.

| Purpose | Name | Values |
|---|---|---|
| Transmit selection | `sim/cockpit2/radios/actuators/audio_com_selection` | 6 = COM1, 7 = COM2 (anything else: none) |
| COM auto-listen | `sim/cockpit2/radios/actuators/audio_selection_com_auto` | boolean: the transmit COM is heard |
| Listen COM1/COM2 | `.../audio_selection_com1`, `.../audio_selection_com2` | boolean |
| Listen NAV1/NAV2 | `.../audio_selection_nav1`, `.../audio_selection_nav2` | boolean |
| Listen ADF | `.../audio_selection_adf1` | boolean |
| Listen DME | `.../audio_dme_enabled` | boolean (the dedicated DME receiver) |
| Marker audio | `.../audio_marker_enabled` | boolean |
| Marker lamps | `sim/cockpit2/radios/indicators/{outer,middle,inner}_marker_lit` | boolean (already in `nav-aids`) |

| Command | Effect |
|---|---|
| `sim/audio_panel/transmit_audio_com1`, `..._com2` | Transmit on that COM (and X-Plane selects its listener) |
| `sim/audio_panel/monitor_audio_{com1,com2,nav1,nav2,adf1,dme,mkr}_on` / `_off` | Explicit on / off |

Not used: the `_man` transmit commands (an "old panel" behaviour the aircraft's own panel does not
have), the toggles (the panel always sends the explicit command for the other state, as F-24
does), `audio_nav_selection` (a legacy single selector), ADF2/NAV3/NAV4/DME1/DME2, the copilot
set, and the `audio_volume_*` floats (volume is out of scope).

## 4. Design

### 4.1 Placement

An **AUDIO** unit at the top of the Radios panel, above COM1, as the audio panel sits on top of a
GA radio stack. Not a new switcher panel: the pilot needs to see "COM2 tuned to ATIS" and "COM2 is
heard" together, and the switcher already has eight panels. The Radios descriptor gains the audio
features, so they are subscribed while Radios is visible. On a tablet (≥ 720 dp) the unit heads the
left column; the keypad column is unchanged.

### 4.2 Keys

Two rows of hardware keys (`ControlButton`, `compact`), wrapping on narrow phones:

- **MIC row:** `COM1 MIC`, `COM2 MIC`. Exclusive. The key whose COM X-Plane reports as the transmit
  selection has a **green** (`engaged`) light bar.
- **Monitor row:** `COM1`, `COM2`, `NAV1`, `NAV2`, `ADF`, `DME`, `MKR`. Independent; any
  combination, including none. A heard receiver has a **white** (`lit`) light bar — a different
  colour from MIC, so talking and listening never look alike.
- **Marker lamps** O (cyan-blue), M (amber), I (white) on the unit's label row, lit while X-Plane
  reports the lamp lit, hidden from accessibility (the unit's summary speaks them).

Presses send the explicit command (`_on` when off, `_off` when on; the MIC command for the other
COM) and are read back on the state DataRef with the shared `useReadBack` (3 s, settles once). A
key is inert while its own read-back waits. A failed read-back prints one danger sentence under the
unit: "The Cessna 172 didn't turn COM2 listening on." / "The Cessna 172 didn't switch the
microphone to COM2."

### 4.3 COM auto-listen

When `audio_selection_com_auto` is 1 and a COM is the transmit selection, that COM is heard whatever
its own listen flag says. Its monitor key is drawn lit and **inert**, spoken "COM1, heard while
transmitting", as on a GMA 340 where the MIC radio cannot be deselected. Otherwise the key shows
its own flag. A missing auto flag counts as 0.

### 4.4 Lines under the unit

In this order, each only when it applies:

1. **Not heard:** when the transmit COM is not heard (no auto-listen and its flag is 0): "You
   transmit on COM1 but aren't listening to it." A statement of state, muted, no alert — it names
   the exact cause of "I can't hear ATC".
2. **Missing keys:** "Not available on the Cessna 172: DME, MKR." Lists keys whose state or command
   is **definitively** missing or read-only on this aircraft.
3. Read-back failures (danger).

### 4.5 Availability (F-12's three answers)

A name has three answers: resolved (`ok`), definitively absent (`missing` or `readOnly`), or not
checked yet (no binding result). Only the second produces a sentence.

- A key is drawn when its state DataRef resolved; it is enabled when its commands resolved too.
- While any audio state name is unchecked and none is drawn, the unit shows its label only — no
  sentence, no dead keys.
- When every audio state name is definitively missing: the unit holds one sentence, "The audio
  panel isn't available on the Cessna 172." (R6), and no keys.
- The MIC row is drawn when the transmit selection resolved; each MIC key is enabled when its
  command resolved.

### 4.6 COM rows show the transmitting radio

The COM1/COM2 rows' label row gains a green **MIC** lamp (`labelAccessory`) on the radio X-Plane
reports as the transmit selection, the G1000's "transmit COM in green" in this panel's language.
It is text (`MIC`), not colour alone, and is part of the row's spoken summary
("COM1, transmitting: active …").

### 4.7 Stale, disconnected, no flight

As the rest of Radios: values stay with dimmed light bars when not current, keys are inert through
`ControlButton`'s own link handling, nothing is queued. With no flight loaded the unit draws
nothing beyond its label (the frame explains). Lamps are hidden when not current.

### 4.8 Copy (R9)

Plain sentences only; the aircraft is named when known ("this aircraft" otherwise). No DataRef,
command, id, code, host or token appears in UI text or logs.

## 5. Systems follow-up folded in

F-12 found that Systems (F-24) prints "Not available on …" and "… isn't available on …" for a
moment after every connect, while names are still unchecked. The audio unit needs the same three-
answer helpers, so this feature adds them to `src/features/panels/systems/availability.ts`
(`bindingMissing`) and applies the rule to every Systems missing line and unit sentence: list only
definitive misses; a unit with nothing drawn and nothing definitively missing renders no sentence.

## 6. Profile

`generic` 1.9.0, three new features, every binding optional, nothing written (commands only):

- `audio-transmit` "Microphone selection": transmit selection, COM auto-listen, the two transmit
  commands.
- `audio-monitor` "Audio monitoring": the six listen flags and their twelve on/off commands.
- `audio-marker` "Marker audio": the marker flag, its on/off commands, and the three marker lamps
  (deliberately reused from `nav-aids`).

## 7. Mock X-Plane

DataRefs from id 1400 (transmit 6, auto-listen 1, COM1 listen 1, the rest 0), commands from id 2300.
Behaviour as X-Plane: a MIC command sets the selection and, as X-Plane does, sets that COM's flag to
1 and the other COM's to 0; `_on`/`_off` set their flag.

## 8. Testing

- Unit: catalogue names and profile shape (version 1.9.0, optional, read-only, reuse list); the
  pure audio model (transmit COM, heard with and without auto-listen, unknown selections, not-heard
  line, missing lists with unchecked names).
- UI: keys and light bars, exclusive MIC, independent monitors, auto-listen inert key, read-back
  failure sentence, unchecked vs missing, all-missing sentence, stale dimming, COM row MIC lamp,
  narrow phone wrap, touch targets, error-text guard; Systems shows no availability sentence while
  names are unchecked.
- Integration against the mock: transmit exclusivity read back from the simulator; a missing marker
  DataRef leaves the rest working; nothing resolving gives the one sentence.

Device rows 173–181 in `docs/testing/xplane-smoke-test.md`, the key ones being: what
`audio_com_selection` does to the other COM's flag in the C172 (§4.3), whether the C172's own panel
follows the app, and whether X-Plane's ATC voice follows the monitor keys.

## 9. Out of scope

Volume, COM3, split COM, intercom/isolation/PA, marker HI SENS and MUTE, ADF2, the copilot panel,
airliner ACPs (F-54), any audio played on the device.

## 10. Rulings

1. Audio is a unit on Radios, not a ninth panel — the pilot needs tuned and heard together; cost: a
   longer Radios page on phones.
2. MIC keys send the standard transmit command, so the app does what the aircraft's own panel does
   (and the other COM may go silent, shown honestly); no "independent" mode — cost: a pilot who
   wants both COMs presses the other COM's monitor key once.
3. MIC green, monitor white — cost: none.
4. No HI SENS / MUTE / ADF2 — pilots call the marker obsolete and ADF2 is rare in GA — cost: those
   controls stay in the sim.
5. Auto-listen key lit and inert — cost: none on aircraft without auto-listen.
6. The "not heard" line is a state sentence, not an alert — cost: one muted line.
7. Systems' false-sentence follow-up fixed here — cost: Systems files touched.
8. DME listen reads `audio_dme_enabled` (the dedicated receiver that `monitor_audio_dme` predates
   NAV DME selection for) — cost if wrong: DME read-back fails, settled on device (row 178).
