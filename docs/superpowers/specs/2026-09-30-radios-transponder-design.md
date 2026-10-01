# COM/NAV radios and transponder — design

Features: `F-21` and `F-22` (roadmap Stage 1, sub-project 6, built together because every
competitor ships them as one stack). Spec date: 2026-09-30.
Sources: [F-21](../../roadmap/features/F-21-com-nav-radios.md),
[F-22](../../roadmap/features/F-22-transponder.md).
Builds on: F-03 (profiles, per-feature availability), F-04 (panel framework, `ControlButton`,
operations), F-11 (units module), F-10 ([spec](2026-09-30-flight-instruments-design.md)).

## Goal

A **Radios** panel with COM1, COM2, NAV1 and NAV2 (active, standby, swap) and the transponder
(code, mode, IDENT, and the code X-Plane's ATC assigned). Values are typed on a large on-screen
keypad, held as a **staged entry** until the pilot sends them, validated before anything is
written, and confirmed against what X-Plane reports afterwards.

Requirement ids below are prefixed: `C` for F-21 (C1–C8) and `T` for F-22 (T1–T10).

## Why this now

- The radio stack is the most common control panel in the category (F-21: 8 of 15 products), and
  the single clearest complaint in the whole survey is about one: "the radio stack is mushy and
  difficult to operate ... still impossible to use on an 8 inch screen" (Flight Sim Remote Panel).
- The most praised radio pattern is keypad entry, "better than mouse-clicking knobs in the sim"
  (XpRemotePanel).
- The transponder is the gap: 2 of 15 products expose it; a 2025 entrant (Comsquawk XP) exists for
  nothing but COM frequencies and squawk codes; RemoteFlight's dedicated radio app has no
  transponder.
- Avionix answers each: a full-width keypad with 56 dp keys instead of knobs; 8.33 kHz channels
  validated with a reason and the nearest valid channels; a read-back check that tells the pilot
  when an aircraft ignored a write (the roadmap's own risk: add-ons that accept a write and
  ignore it); and a transponder with the ATC-assigned code one tap away.

## Scope

**In.** Profile 1.3.0 with eight features (below). The Radios panel: four radio rows, a shared
keypad entry, the transponder section. Domain modules for channels, frequencies, squawk codes,
transponder modes, the digit entry and the adoption verdict. `ControlButton` gains `selected`. Mock
X-Plane serves every new name and both kinds of command, and can ignore writes to named DataRefs.

**Out** (owner in brackets): transmit and receive selection, receiver volume, marker audio (F-23);
ADF and DME as tunable radios (F-23/F-30 — one researched product lists ADF); setting the OBS and
showing course deviation (F-30); frequency lookup by navaid (no navdata in the Web API); the 737
pedestal radios and transponder (F-54); TCAS modes as selectable positions (F-40); a hardware
keyboard path for the keypad; one-tap VFR code.

## Verified names

Checked against Laminar's `DataRefs.txt` and `Commands.txt` (the copies in Laminar's XPlane2Blender
repository) except where noted.

| Purpose | Name | Type, units | Writable |
|---|---|---|---|
| COM1/COM2 active | `sim/cockpit2/radios/actuators/com{1,2}_frequency_hz_833` | int, channel number | y |
| COM1/COM2 standby | `sim/cockpit2/radios/actuators/com{1,2}_standby_frequency_hz_833` | int, channel number | y |
| NAV1/NAV2 active | `sim/cockpit2/radios/actuators/nav{1,2}_frequency_hz` | int, 10 kHz | y |
| NAV1/NAV2 standby | `sim/cockpit2/radios/actuators/nav{1,2}_standby_frequency_hz` | int, 10 kHz | y |
| NAV selected course | `sim/cockpit2/radios/actuators/nav{1,2}_course_deg_mag_pilot` | float, degrees magnetic | read here |
| NAV identifier | `sim/cockpit2/radios/indicators/nav{1,2}_nav_id` | byte[150], string | n |
| NAV DME present | `sim/cockpit2/radios/indicators/nav{1,2}_has_dme` | int, boolean | n |
| NAV DME distance | `sim/cockpit2/radios/indicators/nav{1,2}_dme_distance_nm` | float, nm | n |
| Swap, per radio | `sim/radios/{com,nav}{1,2}_standy_flip` (Laminar's spelling) | command | — |
| Squawk code | `sim/cockpit2/radios/actuators/transponder_code` | int, 0000–7777 | y |
| Mode | `sim/cockpit2/radios/actuators/transponder_mode` | int enum: 0 off, 1 stby, 2 on, 3 alt, 4 test, 5 GND, 6 TA only, 7 TA/RA | y |
| Identing now | `sim/cockpit2/radios/indicators/transponder_id` | int, boolean | n |
| IDENT | `sim/transponder/transponder_ident` | command | — |
| ATC-assigned code | `sim/atc/transponder_assigned` | int (assumed, as `transponder_code`) | n |

`sim/atc/transponder_assigned` is named in Laminar's 12.4.4 release notes, not in the (older) file
copy; its type is assumed. The roadmap's `sim/cockpit/radios/transponder_mode` is the older
namespace; the `cockpit2` names are used.

**Channel units (assumption, device check).** The `_833` DataRefs are documented only as "hz,
supports 8.3 khz spacing". Avionix treats them as **whole kHz**: 121.500 is `121500`, channel
118.005 is `118005`. The factor lives in one constant (`COM_UNITS_PER_MHZ = 1000`). NAV values are
10 kHz units as documented: 110.30 is `11030`.

## Profile features (1.3.0)

Per-radio features, so a missing radio costs only that radio (C5, T6).

| Feature | Label | Required | Optional |
|---|---|---|---|
| `com1`, `com2` | COM1, COM2 | active (read), standby (`write: true`), flip command | — |
| `nav1`, `nav2` | NAV1, NAV2 | active (read), standby (`write: true`), flip command | identifier, DME present, DME distance, selected course |
| `transponder-code` | Transponder code | code (`write: true`) | ATC-assigned code |
| `transponder-mode` | Transponder mode | mode (`write: true`) | — |
| `transponder-ident` | Transponder IDENT | IDENT command | identing indicator |

Seven features, not eight: the ATC-assigned code is an optional binding of `transponder-code`, so
on X-Plane older than 12.4.4 that feature is "partly available" on the compatibility screen and the
comparison is simply absent (T7) — never an error, never an eighth line of "not available".

A read-only standby, code or mode resolution is a miss of a `write: true` binding, so the feature is
unavailable and its controls say why (C5, T6) — the existing F-03 rule.

## Channels and frequencies (C3)

**COM.** Band 118.000–136.990. Within every 100 kHz the valid channel endings are
`00 05 10 15 25 30 35 40 50 55 60 65 75 80 85 90` (25 kHz channels end in 00/25/50/75; the others
are 8.33 channels). `20 45 70 95` and anything not a multiple of 5 are not channels. 136.990 is the
last channel.

**NAV.** 108.00–117.95 in 0.05 MHz steps.

**Entry** is digits only; the decimal point is implied after the third digit and shown by the entry
display (`121.5__`). COM takes 3–6 digits, NAV 3–5; a shorter entry is padded with zeros
(`1215` → 121.500). With fewer than 3 digits Set is disabled and nothing is said yet.

**Rejection** happens before anything is written, in the pilot's words, with no snapping:

- `118.020 is not a COM channel. Nearest: 118.015 or 118.025.`
- `COM channels run from 118.000 to 136.990.`
- `NAV frequencies run from 108.00 to 117.95 in 0.05 steps.` (also for 110.32)

## Squawk codes (T3)

The transponder keypad shows only the keys 0–7, like a real control head; 8 and 9 cannot be
entered. Four digits are required; with fewer, Set is disabled and the display says
`Enter four digits.` once at least one digit is typed. The code is shown with leading zeros
(`0400`). The integer value is the code's digits read as decimal (`7000` → `7000`), as
`transponder_code` documents "0000-7777".

**Emergency codes.** 7500, 7600 and 7700 show their meaning in the entry display (`7700 —
emergency`, `7600 — radio failure`, `7500 — unlawful interference`) and their Set needs a second
tap (`ControlButton confirm`). VATSIM and IVAO clients read this DataRef, so a mistyped 7500 is
seen by real controllers.

## Transponder mode (T1, Mode S open question)

Four positions are selectable: OFF, STBY, ON, ALT (values 0–3), written to `transponder_mode`. The
current position is marked `selected`. A reported 4–7 is shown by name (TEST, GND, TA ONLY, TA/RA)
with no position selected; the pilot can still choose one of the four. TCAS modes belong to F-40.

## The staged entry (C2, T2, C6, T8)

- Each radio row's standby value, and the transponder code, is a button: `Enter COM1 standby`. It
  opens the keypad for that target. One target at a time; choosing another clears the draft.
- The draft is shown **only** in the entry display, under the target's name ("COM1 standby"), in an
  outlined box with the word `New`. The radio row keeps showing X-Plane's value, so the staged value
  can never be mistaken for the simulator's.
- Keys: digits, `⌫` (delete one), `Clear`. `Set` sends; `Cancel` closes the entry. Keys are 56 dp
  tall, in a 3-column grid that spans the content width (capped at 420 dp).
- **Set** is a `ControlButton` on the target's write binding: disabled while the link is down, the
  feature is unavailable, a write to that target is pending, or the draft is incomplete or invalid.
- After a successful send the entry closes. A failed send keeps the draft for a retry, with the
  failure under Set (`FailureNotice`).
- **The draft is dropped**, not kept, when controls become disabled (link down, no flight,
  stalled) and when the aircraft changes. Nothing is queued; nothing is sent on reconnect.

## Read-back (C4, T4)

After a write or a swap that X-Plane accepted, the panel watches the target's value for
**3 seconds** (30 samples at 10 Hz). The display never changes on its own: it always shows X-Plane's
value, so there is nothing to revert.

- The expected value appears → nothing to say.
- It does not, and the link stayed current → one sentence under the radio or the transponder:
  - `X-Plane did not take 118.005. COM1 standby is still 121.500.` For an 8.33-only channel add
    `This aircraft's radio may tune 25 kHz channels only.`
  - `X-Plane did not swap COM1.` (expected: the active value becomes the standby value read before
    the swap)
  - `X-Plane did not take squawk 4521.` / `X-Plane did not change the transponder to ALT.`
- The link dropped during the watch → no verdict; the panel notice already explains.
- The sentence clears on the next send to that radio or transponder, or when the aircraft changes.

`readBackVerdict` is a pure function of the latest value, the expected value, the target's
operation outcome and the panel clock: the 3 s count from the moment X-Plane accepted the write
(`OperationOutcome.at`), and a pending, failed or refused operation gives no verdict (its own
failure is already shown). `useReadBack` evaluates watches on every render (the panel clock ticks
each second, so a verdict lands 3–4 s after acceptance) and settles each one once, so a value the
pilot later changes in the simulator never produces a late sentence. The panel's content is keyed
by aircraft identity, so an aircraft change resets the drafts and the read-back sentences.

## IDENT (T5)

`IDENT` is a `ControlButton` activating the command. After X-Plane accepts it the transponder line
says `IDENT sent` for 5 seconds. Separately, `Identing` shows exactly while
`transponder_id` reports 1; without that binding, only `IDENT sent` is shown. The panel never shows
`Identing` from its own clock.

## ATC-assigned code (T7)

When `transponder_assigned` resolves and reports a valid non-zero code: `ATC assigned 4521`. If it
differs from the dialled code, the line is in the danger tone (the theme has no warning tone) and adds `— not set`, plus a
`Squawk 4521` button that writes it (the same read-back applies). Equal → `ATC assigned 4521 ✓`.
Unresolved, zero or not a valid code → the line is absent. No error, ever.

## The panel

Id `radios`, title `Radios`, features: all seven above. Second in the switcher (Instruments,
Radios, Flight data, Heading). The flight data strip shows on it like on any other panel.

```
COM1   121.500   ⇄   [118.005]        ← standby is the entry button
COM2   …
NAV1   110.30 IBOS 12.4 nm CRS 247°   ⇄   [113.90]
NAV2   …
Transponder  [7000]  ALT  Identing
  (OFF) (STBY) (ON) (●ALT)   (IDENT)
  ATC assigned 4521 — not set   (Squawk 4521)
┌ COM1 standby ───────────────┐
│ New  118.00_                │
│ 1 2 3 / 4 5 6 / 7 8 9 / ⌫ 0 Clear │
│ (Cancel)          (Set)     │
└─────────────────────────────┘
```

- **Layout.** Portrait: rows, then the transponder, then the entry (when open). Content width
  ≥ 720 dp (tablets, landscape phones): two columns, stack left, entry right.
- **Row.** Name, active (large, tabular), swap `⇄` (`Swap COM1 active and standby`), standby
  button. NAV adds, when present: identifier, DME distance (only while `has_dme` is 1, in the
  shared distance unit), `CRS 247°`. Missing values say so in words; the whole radio unavailable
  shows the feature reason once, under the row.
- **States.** As every panel: not live → muted values and `not live`, the panel notice at the top;
  no flight → `—`; a missing optional value is omitted (identifier, DME, course).
- **Accessibility.** Each row is one label: `COM1: active 121.500, standby 118.005` (+ `, not live`).
  Keys are buttons labelled with the digit, `Delete`, `Clear`. The entry display is a live region
  label: `COM1 standby, new value 118.00`.

## Errors and copy (C8, T10)

Only fixed sentences and `FailureNotice`. No DataRef id, name, URL, status, token or host appears
on screen or in logs. Nothing new is logged.

## File plan

- `src/domain/radios/`: `channels.ts` (COM/NAV validation, formatting, nearest channels, units),
  `squawk.ts`, `transponder-mode.ts`, `entry.ts` (draft reducer and parse per target kind).
- `src/domain/panels/read-back.ts` (the verdict) and `src/features/panels/primitives/useReadBack.ts`:
  generic, because the autopilot (F-20) will check its writes the same way.
- `src/domain/aircraft/profiles/generic.ts`: 1.3.0, names, seven features.
- `src/features/panels/primitives/ControlButton.tsx`: `selected`, and `OperationNotice` exported so
  a row can print a quiet control's outcome once (the swap's failure under its row).
- `src/features/panels/radios/`: `RadiosPanel.tsx`, `RadioRow.tsx`, `TransponderSection.tsx`,
  `EntryPad.tsx`, `Keypad.tsx`, `useRadioEntry.ts`, `radios.ts` (target + draft + drop rules).
- `src/features/panels/registry.ts`: Radios second.
- `tests/mock-xplane/mock-xplane-server.ts`: new DataRefs and commands; flip swaps, IDENT sets
  `transponder_id`; `ignoreWrites` option.
- Docs: `docs/xplane.md`, `docs/architecture.md`, `README.md`, smoke-test rows, F-21/F-22 status.

## Testing

- **Domain**: every COM ending 00–95 in one block, band ends (117.995, 118.000, 136.990, 137.000),
  nearest-channel suggestions at the band edges, padding (`121`, `1215`, `121500`), NAV steps and
  ends, squawk digits/emergency codes/leading zeros, mode names 0–7 and unknown values, the entry
  reducer (max length per kind, delete, clear, keys 8/9 refused for squawk), adoption verdict
  (adopted, pending, not adopted, link lost, number equality for floats/ints).
- **UI**: rows show values from a snapshot; a missing NAV2 leaves the other three working with
  NAV2's reason; staged entry writes nothing until Set and shows `New`; 118.020 shows the
  reason and Set stays disabled; Set writes 118005; disconnect drops the draft and disables Set;
  swap activates the right command; the read-back sentence after 3 s when the value does not
  change, none when it does, none when the link dropped; emergency code needs two taps; mode
  buttons write 0–3 and mark the reported one; IDENT sent/Identing; assigned code absent, equal,
  different (+ Squawk button writes it); render with `includeHiddenElements` where needed.
- **Guards**: error-text and touch-target guards cover the Radios panel.
- **Integration** (mock): a COM1 standby write and a swap reach the mock and come back; a squawk
  and mode write; IDENT sets the indicator; `ignoreWrites` produces the read-back sentence; one
  radio's names removed leaves the others usable; no assigned-code DataRef → no comparison.

## Requirement coverage

| Req | Where |
|---|---|
| C1, T1 | subscription only; rows and transponder read telemetry |
| C2, T2 | `useRadioEntry`, `EntryPad`: draft only in the entry display, Set writes |
| C3 | `channels.ts`; reasons and nearest channels |
| T3 | `squawk.ts`; 0–7 keypad; four digits |
| C4, T4 | `read-back.ts`, `useReadBack` |
| T5 | IDENT sent (5 s) and Identing from `transponder_id` |
| C5, T6 | per-radio and per-transponder-control features; `ControlButton` reasons |
| T7 | assigned code optional, absent silently |
| C6, T8 | link status; draft dropped when controls disable |
| C7, T9 | the session re-probes on every connect (F-03) |
| C8, T10 | fixed copy, `FailureNotice`, error-text guard, no new logging |

## Decisions and rationale

1. **One panel for radios and transponder**, as every competitor ships them and as a pilot uses
   them (talking to ATC).
2. **On-screen keypad, not the system keyboard.** Large keys are the praised pattern; the OS
   keyboard differs per platform, covers half a phone screen and offers keys a frequency cannot use.
3. **Digits only, implied decimal, zero padding.** Matches how frequencies are read ("one two one
   five" = 121.500) and removes a key.
4. **Reject with nearest channels, never snap** (roadmap C3); X-Plane's own snapping would tune a
   different channel silently.
5. **Write the standby, then swap**, as in the cockpit. No direct-to-active.
6. **The draft is dropped when controls disable**, so a stale intent cannot be sent after a
   reconnect by a single tap.
7. **Read-back for 3 s** catches add-ons that accept a write and ignore it.
8. **Per-radio features**, so a missing NAV2 costs NAV2 only.
9. **Four mode positions**; TCAS modes are F-40.
10. **Emergency codes confirmed by a second tap**, because network clients publish the code.
11. **0–7 keypad for squawk**; impossible digits are never offered.
12. **The assigned code is an optional binding of the code feature**, so older X-Plane shows a
    partial feature, not a missing one.
13. **8.33 channels always accepted**; a 25 kHz-only aircraft is caught by the read-back with a hint,
    instead of a regional setting nobody would find.
14. **DME in the shared distance unit**, as F-11 requires of every later distance.
15. **Radios second in the switcher**: it is the panel pilots touch most after the instruments.

## Deliberately not done

ADF, receiver volume and audio selection; OBS setting; a 25 kHz-only mode; a VFR-code button;
direct-to-active entry; hardware keyboard entry; copilot-side course; ATC-assigned code as an
alert or sound.

## Open questions (device checks)

- `_833` units: whole kHz assumed (121.500 → 121500).
- `transponder_assigned` type and value when ATC has not assigned a code (assumed 0).
- Whether default aircraft accept standby, code and mode writes (Laminar marks them writable; the
  read-back sentence makes a refusal visible).
- `transponder_id` duration after one IDENT command (real transponders ident for about 18 s).
