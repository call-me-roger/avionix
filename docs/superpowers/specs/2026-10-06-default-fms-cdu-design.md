# F-32: CDU remote for the default X-Plane FMS — design

- Roadmap entry: `docs/roadmap/features/F-32-default-fms-cdu.md`
- Research: `docs/roadmap/research/fmc-cdu-apps.md`, `docs/roadmap/research/xplane-web-api.md`,
  `docs/roadmap/research/ux-competitors.md`, `docs/roadmap/research/ux-avionics-conventions.md`
- Depends on: F-03 (compatibility), F-04 (panel framework), R-01 (cockpit design language)
- Minimum simulator: X-Plane 12.1.4 (unchanged)

## 1. Goal

A pilot opens a **CDU** panel and sees the default X-Plane FMS screen exactly as the simulator draws
it — 24 columns, the eight colours, large and small font, reverse video, underline and flashing —
with a real CDU keyboard beneath it: six line-select keys on each side, the page keys, the
alphanumeric and editing keys, and an EXEC key whose light bar comes on when a change is waiting.
It mirrors and presses keys; it never computes anything an FMS would.

Success is the acceptance list in the roadmap file: on a real simulator, typing an origin and
destination on the phone produces the same screen as the in-sim CDU, EXEC behaves identically, a
dropped link marks the screen stale within 2 s and disables the keys, and an aircraft without the
default FMS gets a plain sentence instead of a black screen.

## 2. What competitors and pilots taught us

| Finding | Source | What we do |
|---|---|---|
| WebFMC is praised for sending "only small portions that actually changed" | x-plained.com review | Rows re-render only when their text or style changes (R4) |
| Input lag and "very slow response when clicking CDU buttons" are the category's top complaints | X-Plane.org thread, XPlaneCDU Play listing | Keys are sent in order through one queue, a slow link is annunciated, and nothing is echoed that X-Plane did not draw |
| WebFMC's physical-keyboard typing "speeds up data entry enormously" | x-plained.com, fsnews.eu | On the web build, a physical keyboard types into the CDU |
| AirFMC's second CDU for a copilot station is praised | x-plained.com | CDU 1 and CDU 2 keys, remembered per device |
| AirFMC one-star reviews from users who got nothing on screen and no explanation | App Store | An aircraft whose CDU never shows anything gets a sentence naming the aircraft |
| Aircraft-accurate key layouts sell the immersion; drag knobs and cheap skins lose it | R-01 research | A Boeing-style key arrangement drawn with the R-01 hardware keys, not a generic grid |
| Pilots forgive stylised graphics, not wrong colours or keys that behave unlike the box | R-01 research (FAA AC 61-136B) | The screen's colours, fonts and attributes come straight from X-Plane's style bytes |

## 3. Verified X-Plane names

All names below were checked against Laminar's `DataRefs.txt` and `Commands.txt` (the files the
F-30 names were checked against); none are community-sourced any more.

**Screen (per unit `n` = 1 or 2, line `k` = 0..15):**

| Name | Type | Meaning |
|---|---|---|
| `sim/cockpit2/radios/indicators/fms_cdu{n}_text_line{k}` | `byte[96]`, arrives as base64 `data` | UTF-8 text of line `k`; a character may take more than one byte |
| `sim/cockpit2/radios/indicators/fms_cdu{n}_style_line{k}` | `byte[24]`, base64 `data` | One style byte per character (per glyph, not per UTF-8 byte) |
| `sim/cockpit2/radios/indicators/fms_exec_light_pilot` | `int` | EXEC light for CDU 1 |
| `sim/cockpit2/radios/indicators/fms_exec_light_copilot` | `int` | EXEC light for CDU 2 |

Style byte (Laminar, "Datarefs for the CDU screen"): bit 7 large font, bit 6 reverse video, bit 5
flashing, bit 4 underscore, bits 0–3 colour: 0 black, 1 cyan, 2 red, 3 yellow, 4 green, 5 magenta,
6 amber, 7 white. The scratchpad is the 14th line (index 13). Special glyphs Laminar names: `°`,
`☐` (U+2610), `←↑→↓` (U+2190–2193), `Δ`, `⬡` (U+2B21), `◀` (U+25C0), `▶` (U+25B6).

**Keys (prefix `sim/FMS/` for CDU 1, `sim/FMS2/` for CDU 2; 72 each):**

- Line select: `ls_1l`..`ls_6l`, `ls_1r`..`ls_6r`
- Page and function: `index`, `fpln`, `clb`, `crz`, `des`, `dir_intc`, `legs`, `dep_arr`, `hold`,
  `prog`, `exec`, `fix`, `navrad`, `prev`, `next`
- Alphanumeric: `key_A`..`key_Z`, `key_0`..`key_9`
- Editing and punctuation: `key_period`, `key_minus`, `key_slash`, `key_space`, `key_delete`,
  `key_clear`, `key_back`

The roadmap's `perf`, `menu`, `data` and `key_overfly` do not exist in `Commands.txt` and are
dropped; `clb`, `crz` and `des`, which the roadmap missed, are added. `CDU_popup` and
`CDU_popout` are deliberately not offered (they change the simulator's own windows).

## 4. Requirements

The roadmap's R1–R12 stand. This section says how each is met and adds what the research asked for.

### 4.1 Profile and subscription

- Generic profile **1.6.0** adds four features:
  - `cdu1-screen` "CDU 1 screen": the 16 text lines (required) and 16 style lines (optional).
  - `cdu1-keys` "CDU 1 keys": the 72 `sim/FMS/` commands (each optional) and
    `fms_exec_light_pilot` (optional).
  - `cdu2-screen`, `cdu2-keys`: the same for `fms_cdu2_*`, `sim/FMS2/` and
    `fms_exec_light_copilot`.
- The CDU panel declares all four features, so both units are subscribed while the panel is
  visible. The Web API streams only changes, so an idle second unit costs its first 32 values and
  little after, and switching units is instant. Nothing CDU-related is subscribed while another
  panel is visible (F-04 demand).
- Every name is probed at connect like every other binding. This adds 210 names to the 112 probed
  today; at the existing concurrency of 6 the probe stays bounded, and the connect-time cost is a
  device check (smoke row). A deferred, on-demand probe is a recorded follow-up if that row shows
  a noticeable delay.

### 4.2 Decoding (R2, R3)

- A new `decodeDataRefBytes(value)` returns the raw bytes of a `data` value **without** stopping at
  the first NUL: the existing `decodeDataRefString` truncates at NUL, which is right for
  identifiers and wrong for style bytes, where 0 is a valid style.
- A text line decodes as UTF-8 (malformed sequences become U+FFFD), trailing NULs are dropped,
  any other NUL becomes a space, and the result is split into code points, then padded with spaces
  or cut to exactly 24 cells. Raw base64 is never displayed.
- A style line decodes to 24 bytes; missing bytes, a missing style DataRef or an undecodable value
  read as style 0x87 (large white) — the default the simulator's own popup uses for plain text.
- Colour indices 8–15 render white. Colour 0 (black) without reverse video renders white — black
  glyphs on the black glass would be invisible, and the simulator's own popup draws no invisible
  text. Reverse video with colour 0 renders as plain white text.

### 4.3 Screen

- The glass shows **rows 0–13** (title, six label/data pairs, scratchpad). Rows 14 and 15, which
  Laminar's default layout leaves empty, are added below the scratchpad only once either has shown
  a non-blank character in this session, so the layout changes at most once and nothing the
  simulator draws is ever hidden.
- Every character sits in its own fixed-width cell. Fallback glyphs (`☐`, `◀`, `⬡`) and the system
  font used before B612 Mono loads keep their column.
- Large font fills the cell height; small font is 80 % of it, on the same baseline. Text uses
  B612 Mono (R-01).
- Reverse video fills the cell with the colour and draws the glyph in the glass colour. Underscore
  is a line under the cell, so adjacent underlined cells join. Flashing toggles the glyph on a
  shared 1 Hz clock (on 500 ms, off 500 ms) that runs only while a flashing cell is on screen;
  under Reduce Motion flashing cells stay steady.
- Colours come from a new `theme.cdu` palette (cyan, red, yellow, green, magenta, amber, white,
  plus `glass` and `screenEdge`). Every colour meets 4.5:1 against the glass in every theme; the
  night palette keeps every colour at relative luminance ≤ 0.30 (R-01 rule) and therefore inside
  0.175–0.30 for the colours.
- Rows are memoised on their decoded text and style (R4): a change to the scratchpad re-renders the
  scratchpad row only. A row with flashing cells re-renders on the blink clock; no other row does.
- Accessibility: each row is one text element read as its trimmed text, with `☐` spoken as "box"
  and arrows as their direction words. Row 13 is read as "Scratchpad, <text>" or "Scratchpad
  empty". Blank rows are hidden from the screen reader. Colour and attributes are not spoken.

### 4.4 Screen states

| State | When | Shows |
|---|---|---|
| Unavailable | `cdu{n}-screen` unavailable on this aircraft (a required text line missing) | "This X-Plane doesn't publish the CDU <n> screen." No keys. |
| Waiting | Connected, not every text line of the selected unit has a value yet | The glass with "Waiting for the CDU screen…" in small white text; keys disabled |
| No FMS | Every text line of the selected unit has been blank since the aircraft was identified | "<Aircraft> isn't showing anything on X-Plane's built-in CDU." and "Add-on FMSs such as Zibo's or ToLiss's aren't supported yet. If the aircraft is powered down, the CDU appears when it powers up." No keys. |
| Live | Any text has appeared since identification | The mirror and keys |
| Stale | Live, but values are not current (`link.valuesCurrent` false) | The last screen at 50 % opacity with an amber `NOT LIVE` tag on the bezel; keys disabled (R10) |

`<Aircraft>` is the identity's description, else its ICAO type, else "This aircraft". The "since
identification" memory resets when the aircraft changes, so loading a Zibo after a default 737
shows the No FMS state rather than the 737's last screen. A screen that goes blank after being live
(the aircraft powered down mid-flight) stays Live: a real CDU goes dark and its keys stay.

### 4.5 Keys

- **Layout (Boeing-style, adapted to X-Plane's command set):**
  - Six line-select keys down each side of the glass. LSK `k` spans rows `2k−1` and `2k` (its
    label and data line), so it is centred on the pair it selects and stays 48 dp tall: the row
    height floors at 24 dp.
  - Function keys, three rows: `INDEX FPLN CLB CRZ DES` / `DIR INTC LEGS DEP ARR HOLD PROG EXEC` /
    `NAV RAD FIX PREV PAGE NEXT PAGE BACK`.
  - Alpha block, 5 columns: `A–Y` in five rows, then `Z SP DEL / CLR`.
  - Numeric block, 3 columns: `1 2 3 / 4 5 6 / 7 8 9 / . 0 +/−`. The `+/−` key sends `key_minus`.
  - `BACK` (`key_back`) is labelled after its command; what the default FMS does with it is a
    device check.
- **EXEC light:** a new filled-white `lit` light-bar state on EXEC while `fms_exec_light_*` reads
  non-zero, dimmed when stale. Spoken "EXEC, light on" / "EXEC".
- **One press, one command, in order (R5).** Keys go through a per-panel queue that activates one
  command at a time and waits for X-Plane's answer before sending the next, so `KLAX` typed quickly
  can never arrive as `KLXA`. A press is never coalesced and a held key never repeats.
- **Queue limits.** At most 24 keys (one scratchpad line) wait at once; a press beyond that is
  refused with "Too many keys waiting. Let the screen catch up." When a key fails, the keys queued
  behind it are dropped (sending them would enter a different string) and one message says so
  (R11): "X-Plane didn't take the K key. The 3 keys after it weren't sent." Losing the link or
  switching unit empties the queue.
- **No local echo.** The screen shows only what X-Plane draws; a pressed key gives the R-01 pressed
  state and haptic tick, never a predicted character (resolves roadmap open question 3).
- **Slow link (R6).** A key whose activation takes longer than 500 ms to be answered lights an
  amber `SLOW` annunciator on the bezel for 5 s after the last slow answer, spoken "Link slow".
- **Missing commands (R9).** A key whose command is missing is disabled (dimmed legend, R-01
  disabled key) and spoken "<key>, not available on this aircraft". If any are missing, one line
  under the keys says "<N> keys aren't available on this aircraft." The rest keep working.
- **Messages** appear in one message line inside the CDU bezel, replace each other, and clear after
  8 s or on the next successful key. They never contain a URL, status code, exception text,
  DataRef or command name, or protocol payload (R12). Keys use `ControlButton`'s `quiet` mode, so
  no per-key notices appear.

### 4.6 CDU 1 / CDU 2 (R7)

- Two keys in the bezel header, `CDU 1` and `CDU 2`, with the R-01 light bar on the selected one.
- The choice is a per-device preference, `avionix.cdu` (`{ unit: 1 | 2 }`, zod-validated,
  best-effort load and save, default 1), following the haptics preference pattern.
- A unit whose screen feature is unavailable has its key disabled with the reason spoken; if the
  remembered unit is unavailable, CDU 1 is shown without overwriting the saved choice.

### 4.7 Layout

- **Narrow (< 720 dp wide):** the bezel with the glass and LSKs is pinned at the top; the keys
  scroll beneath it, so the scratchpad stays in view while typing. Function keys come first, then
  the numeric and alpha blocks side by side when the width allows 8 keys plus gaps, otherwise the
  alpha block above the numeric block.
- **Wide (≥ 720 dp, tablets and landscape phones):** glass and LSKs on the left, keys on the right;
  each column scrolls if it does not fit.
- The glass's cell width is the space between the LSK columns divided by 24; the font size follows
  the cell width, and the row height is the larger of 24 dp and the font's line height.
- Every key meets the 48 dp touch target (the existing touch-target guard sweeps the new panel).

### 4.8 Physical keyboard (web)

On the web build, while the CDU panel is visible and no text field has focus, a physical keyboard
types into the selected CDU through the same queue: letters, digits, `.`, `-` (`+/−`), `/`,
Space (SP), Delete (DEL), Backspace (BACK), Escape (CLR), Page Up / Page Down (PREV / NEXT PAGE).
Keys with Ctrl, Alt or Meta held are ignored. Enter is not mapped: EXEC commits a route change and
stays a deliberate tap. On iOS and Android this is a no-op module (no hardware-key API without a
native module); the native follow-up is recorded.

### 4.9 Panel

- Descriptor id `cdu`, title "CDU", features the four above, `supports: EVERYWHERE`.
- Registered fifth: Instruments, Radios, Autopilot, Navigation, **CDU**, Flight data.
- `PanelIcon` gains a `cdu` glyph: a screen above three rows of keys.

## 5. Mock X-Plane

The mock server gains the 66 CDU DataRefs and 144 commands, plus a toy FMS for the integration
test: letter, digit and punctuation keys append to the scratchpad (line 13), `key_clear` clears it,
`key_delete` writes `DELETE`, `ls_1l` moves the scratchpad to line 2 and lights the EXEC light,
`exec` turns the light off, and the title line reads `TOY FMS`. Its style bytes use cyan for the
scratchpad, large white for data and small for labels, so the test sees real style decoding.

## 6. Testing

- Unit: text and style decoding (UTF-8 multi-byte, NULs, padding, truncation, invalid base64, style
  bits, colours 0 and 8–15), the key catalogue (72 keys per unit, names match section 3), the
  queue (order, cap, drop-after-failure, link loss, unit switch, slow-link timing), the web key
  mapping.
- UI: every screen state; colours, reverse, underline, small font and flashing (with Reduce
  Motion); rows 14–15 appearing; row memoisation (changing line 13 re-renders only that row); keys
  disabled when stale or missing; the EXEC light; CDU 1/2 switching and persistence; the message
  line; accessibility labels.
- Integration against the mock: type `KLAX`, press LSK 1L, see `KLAX` on line 2 and EXEC lit,
  press EXEC, see it go out.
- Guards: night luminance and 4.5:1 for the `cdu` palette; the touch-target sweep; the panel
  registry order.
- Device rows in `docs/testing/xplane-smoke-test.md` cover what the documentation leaves open: the
  connect-time cost of the probe, a real screen against the in-sim popup (colours, small font,
  `☐` prompts), `BACK`, `+/−`, rows 14–15, CDU 2 on a default airliner, the EXEC light, latency
  while typing fast, and an add-on aircraft showing the No FMS state.

## 7. Out of scope

- Any FMS logic, flight-plan files (F-33), navdata (F-34), route view (F-31).
- Zibo, ToLiss and every add-on FMS (F-51, F-57).
- Brightness, the `CDU_popup`/`CDU_popout` commands, MSG/FAIL/OFST annunciators (no DataRefs).
- Native hardware-keyboard capture on iOS and Android.
- Showing both units side by side.

## 8. Decisions

1. Both units are subscribed while the panel is visible: instant switching for a few extra values.
2. Probe at connect, measured on a device; a deferred probe is the follow-up if it is slow.
3. A serial key queue rather than parallel activations: order is correctness for an FMS.
4. No local echo: the mirror never shows what X-Plane did not draw.
5. Black and unknown colours render white; style bytes that cannot be read default to large white.
6. Rows 14–15 appear only once used; the default layout is 14 rows.
7. Enter is not mapped to EXEC on a physical keyboard.
8. The key set is X-Plane's, not the roadmap's: PERF, MENU and OVFY have no command.
