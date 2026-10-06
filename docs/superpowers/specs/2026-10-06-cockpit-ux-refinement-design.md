# R-01: Cockpit look and feel refinement

| Field | Value |
|---|---|
| ID | `R-01` (refinement of Stage 1 before Stage 2) |
| Status | Design approved under the session's standing autonomy (no approval gate) |
| Covers | F-02, F-04, F-10, F-11, F-20, F-21, F-22 and the Setup screen |
| Research | `docs/roadmap/research/ux-competitors.md`, `ux-avionics-conventions.md`, `ux-mobile.md` |

## Why

Stage 1 works, but it looks like a web form. Every control is a blue filled button and every value
is in the system font. The autopilot's mode display is one sentence, and the PFD shows none of the
autopilot's targets. The product owner wants the app to feel modern and reliable, easy to
understand, and credible to experts and professional pilots who may train with it. The avionics
should look like a real aircraft, not a cheap imitation.

The research agrees on what earns that credibility, and what loses it:

- **Pilots forgive stylised graphics, but not wrong colour meanings, wrong labels or buttons that
  behave unlike the real box.** FAA AC 61-136B puts "appearance, arrangement, operation and
  function" of controls first, and the skin second (`ux-avionics-conventions.md` §5).
- **Colour has a fixed meaning in a cockpit:** green is active or engaged, white is armed, cyan
  is the selected or being-tuned value, amber is caution and red is a warning. Colour must never
  be the only cue (AC 25-11B, AC 23.1311-1C, the Garmin G1000 and GFC 500 guides; §1 and §6).
- **The cheap, high-signal realism cues are these:**
  - a flight-mode annunciator (FMA) with columns, and a box around a newly engaged mode for
    10 seconds;
  - mode keys whose annunciator light stays lit while the mode is engaged (GFC 500 / GMC 507);
  - the selected altitude, heading and speed shown as cyan bugs on the PFD;
  - an annunciation when the autopilot disconnects (§1, §3, §7).
- **Typography:** B612 and B612 Mono are the open-licence (OFL) fonts that came out of Airbus's
  cockpit-legibility research. Every value that changes in place needs tabular digits (§2).
- **Radios read active on the left and standby on the right, with a flip-flop key between them.
  Standby is the field being tuned** (Garmin GTR 225 / GNC 255, §3).
- **Keypad and steppers beat knobs on touch.** Reviewers praise typed entry, and Garmin's own
  trainer uses tap arrows. Drag-to-rotate knobs draw the most complaints in the category
  (`ux-competitors.md` §4 #1). Avionix keeps its keypad and steppers and never adds a rotary
  gesture.
- **No competitor gives haptic feedback on radio, autopilot or transponder controls.** It is a
  low-cost gap to close (`ux-competitors.md` §4 #13, `ux-mobile.md` #4).
- **The connection status must stay persistent and glanceable, never a toast. "Connected" must be
  told apart from "data flowing"**, and reconnecting must never look like either (`ux-mobile.md`
  #2, #5; `ux-competitors.md` §4 #2–#4).
- **Pressed states matter:** every key must visibly react when touched. Avionix's Pressable keys
  have no pressed style today.

## Goals

1. Avionics surfaces (radios, transponder, autopilot, instruments) look like avionics hardware: dark
   bezels, glass display windows, cockpit fonts and cockpit colour meanings, in every theme.
2. App chrome (Setup, status bar, switcher) looks like a modern native app: system font, clear
   hierarchy, real buttons instead of React Native's bare `Button`.
3. Every press gives immediate feedback (a pressed style and haptics), while every displayed state
   still comes only from X-Plane, so nothing becomes optimistic.
4. Nothing that works today regresses: read-back, availability, link-loss behaviour, accessibility
   labels, 48 dp targets, the night palette's luminance cap and the error-text guard.

## Non-goals (deferred, with the reason)

- **Flight director command bars on the PFD.** `flight_director_pitch_deg` and
  `flight_director_roll_deg` are documented only as "deflection". DataRefs.txt does not settle
  whether that is an absolute attitude or relative to the current attitude. A wrong cue is exactly
  what costs credibility with pilots, so the bars wait for a device probe.
- **Rolling-drum digits and trend vectors on the tapes.** Both are worth having, but they are
  animation work with their own risk. They are listed as follow-ups.
- **A VFR-code key, a DSEG seven-segment skin, sound clicks and automatic day/night switching** are
  listed as follow-ups.
- **Any knob or drag gesture** (rejected by the research), and any change to behaviour, DataRefs or
  read-back rules beyond what this spec names.

## Design

### 1. Design language: tokens and fonts

**Fonts.** Add `@expo-google-fonts/b612` and `@expo-google-fonts/b612-mono`. They are JavaScript
plus `.ttf` assets, loaded with `expo-font`, which `expo` already ships, so they need no new native
build.

- `src/theme/fonts.ts` exports `AVIONICS_FONTS`, the map passed to `useFonts`, and the family names:
  - `B612_400Regular` and `B612_700Bold`;
  - `B612Mono_400Regular` and `B612Mono_700Bold`.
- `AvionixApp` loads them without blocking the first render. `ThemeProvider` takes a `fontsLoaded`
  prop:
  - Until the fonts load, every avionics family token is `undefined`, so React Native uses the
    system font and never logs "unrecognized font".
  - After loading, the tokens name the B612 families.
  - A font that fails to load leaves the system font in place.

**Typography tokens** (`Theme.typography` gains these; the existing sizes stay):

- `fonts: { avionics?: string; avionicsBold?: string; mono?: string; monoBold?: string }`.
- `displaySize: 28` is the size of a primary value in a display window (frequency, squawk,
  selector).
- `legendSize: 15` is the size of key legends.
- `captionSize: 12` is the size of the engraved unit labels ("COM1", "XPDR").

A helper, `numeric(theme, bold?)`, returns `{ fontFamily, fontVariant: ['tabular-nums'] }`. Every
live number in the app uses it: status-bar age, strip values, readouts, display windows, PFD boxes.

**Avionics palette.** `Theme` gains `avionics: AvionicsColors`. Light and dark share one set,
because a real panel is dark in daylight, as the existing `dayInstrument` already is. Night has its
own set.

| Token | Day (light + dark) | Night | Meaning |
|---|---|---|---|
| `bezel` | `#1d2126` | `#0c0a08` | Unit body |
| `bezelEdge` | `#3a4048` | `#2a2117` | Unit outline and hairline highlight |
| `glass` | `#05080b` | `#000000` | Display window background |
| `glassEdge` | `#2b3138` | `#2a2117` | Display window inset border |
| `keyFace` | `#2c3138` | `#14100b` | Key cap |
| `keyFacePressed` | `#181b20` | `#060504` | Key cap while pressed |
| `legend` | `#e8eaed` | `#a88a60` | Key legend, unit labels, plain values |
| `legendDim` | `#8b949e` | `#917752` | Disabled legend, secondary text in windows |
| `engaged` | `#36d35a` | `#4f9a3a` | Engaged mode, lit light bar, active frequency |
| `armed` | `#e8eaed` | `#a88a60` | Armed mode (outlined light bar, FMA armed row) |
| `selected` | `#2fd0f0` | `#3f8f9a` | Selected targets and standby being tuned (cyan) |
| `caution` | `#ffb300` | `#b07a1e` | AP-disconnect annunciation, confirm-armed key |
| `warning` | `#ff4a3d` | `#d0584a` | Emergency squawk annunciation |
| `lightOff` | `#3a4048` | `#241c13` | An unlit light bar |

`InstrumentColors` gains two tokens:

- `selected` (day `#2fd0f0`, night `#3f8f9a`) for PFD target bugs and boxes.
- `bug` (day `#ff8a1f`, night `#a0601e`) for the orange heading bug of a mechanical directional
  gyro.

**Guards** (extend `tests/unit/theme/tokens.test.ts`):

- Every night `avionics` value, and every night `instrument` value including the new ones, has
  relative luminance of 0.30 or less.
- Each pair below meets a contrast ratio of 4.5:1 or more in every theme:
  - `legend`, `engaged`, `armed`, `selected`, `caution` and `warning` on `glass`;
  - `legend` on `keyFace`;
  - `instrument.selected` on `instrument.tape`.
- `legendDim` on `keyFace` reaches 3:1 or more.
- `legend`, `legendDim`, `warning` and `engaged` on `bezel` reach 4.5:1, because notices are printed
  inside units.
- `engaged`, `selected`, `caution` and `warning` are four distinct values in every theme.
- The existing rule that every mode shares one typography object holds. `fonts` is part of
  typography and changes only with `fontsLoaded`, never with the mode.

### 2. Hardware primitives (`src/features/panels/primitives/`)

**`AvionicsUnit`** is a bezel. It has the `bezel` background, a 1 dp `bezelEdge` border, radius 12
and padding 12. An optional `label` is engraved at the top left: `captionSize`, the avionics bold
font, `legendDim`, letter-spacing 1, and capital letters as given (for example "COM1", "XPDR",
"AUTOPILOT"). It replaces the bordered rows and sections that radios, transponder and autopilot
use today.

**Text on a bezel.** `AvionicsUnit` provides an on-bezel context. Inside it, `BodyText` uses
avionics colours: plain is `legend`, muted is `legendDim`, danger is `warning` and success is
`engaged`. Notices, availability reasons, read-back sentences and `FailureNotice` therefore stay
readable inside a dark unit in the light theme too, with no per-call-site styling.

**`DisplayWindow`** is the glass window that shows one value.

- Its props are `text`, `role` (`'active' | 'standby' | 'selected' | 'plain'`), `size`
  (`'large' | 'small'`), an optional `caption` ("ACT", "STBY", "HDG"), `stale` and `tuning`.
- Text is set with `numeric(theme, true)` at `displaySize` for large and `titleSize` for small.
- Colour by role: active uses `engaged`, standby uses `legend`, selected uses `selected` and plain
  uses `legend`.
- `tuning` draws a 2 dp `selected` (cyan) frame, the Garmin tuning box.
- `stale` draws the text in `legendDim`. The existing "not live" words stay beside it, so colour is
  never the only cue.
- The caption is set in `captionSize` and `legendDim`, above the value.

**`ControlButton`** is restyled as a hardware key. Its contract and every behaviour stay as they
are: availability, the pending state, confirm, quiet, notices and the accessibility state.

- **Face.** The key face uses `keyFace` with a 1 dp `bezelEdge` border and radius 6. The legend is
  set in `legend`, the avionics bold font, at `legendSize`, in capitals as given.
- **Pressed.** While pressed, the face uses `keyFacePressed` and is translated down by 1 dp.
- **Disabled.** The legend uses `legendDim` and the face is transparent with a `bezelEdge`
  outline, so it is still told apart by shape.
- **Light bar.** A new prop, `annunciation?: 'engaged' | 'armed' | 'off'`, draws a bar 3 dp tall
  across the top of the face, inset by 8 dp:
  - engaged: a solid `engaged` fill;
  - armed: an outline 1.5 dp wide in `armed`, hollow;
  - off: a solid `lightOff` fill;
  - no `annunciation` prop: no bar.

  The bar's shape (filled, hollow or unlit) is the non-colour cue, so the old "● " and "○ " label
  prefixes are removed.
- **`selected`** (the transponder positions) maps to `annunciation="engaged"` or `"off"`.
- **Confirm.** While armed for a second press, the border is 2 dp `caution` and the legend reads
  `Tap again: <label>` as today.
- **Haptics.** A press fires `haptics.press()` (section 3) before `onPress`.
- **No app-chrome variant.** Every `ControlButton` is on an avionics surface, including the
  altimeter-setting buttons, so it always takes the key style. App chrome uses `ActionButton`.
- **Children.** A new optional `children` prop replaces the text legend when given; sections 5
  and 6 use it to make a display window pressable. The accessible name still comes from
  `accessibilityLabel ?? label`.

**`Keypad`** keys get the same key face, pressed style and haptic `press()`. Height stays at
`KEY_HEIGHT` 56. Digits are set with `numeric(theme, true)` at `displaySize`; the word and symbol
keys (Clear, ⌫, ±) with `avionicsText(theme, true)` at `legendSize`, so "Clear" fits a phone key.

**`ActionButton`** (`src/theme/ActionButton.tsx`) is the app-chrome button.

- Variants: `primary` is filled with `colors.primary`, `secondary` is an outline in `colors.border`
  with `colors.text`, and `destructive` is an outline in `colors.danger`.
- Every variant has a 48 dp minimum and radius 10, with a pressed opacity of 0.75.
- It has an optional `busy` state that shows an ActivityIndicator and sets
  `accessibilityState.busy`.
- It replaces every React Native `Button` in ConnectionForm, DiagnosticsScreen, CompatibilityScreen
  and AircraftSummary. Accessibility labels and titles stay word for word, so existing tests that
  find buttons by label keep working.

### 3. Haptics

- Add `expo-haptics` (~57.0.3). It is a native module, so the pilot needs a new development build
  to feel it. This is the only native addition.
- `src/platform/haptics.ts` loads the module inside a try/catch through `require`, so an existing
  build without it, the web or Jest gets a silent no-op. It never throws and never logs.
- `src/platform/haptics.web.ts` is a no-op.
- The interface is `haptics.press()`, a light impact, and `haptics.failure()`, an error
  notification.
- A preference, `hapticsEnabled` (default on), lives in a small `HapticsProvider` beside
  `ThemeProvider`. It is persisted through `SettingsStorage` under `avionix.haptics`, following
  `theme-preference.ts`.
- Setup → Display gets a "Haptic feedback" On/Off `RadioChips`.
- Events:
  - every enabled `ControlButton` and `Keypad` press fires `press()`;
  - a read-back that fails fires `failure()` once, at the moment its sentence first appears;
  - an AP-disconnect annunciation fires `failure()` once when it begins.

  Nothing fires on success, because the light and the value already say so, and constant buzzing
  is noise.

### 4. App chrome

**Link status bar: one compact line.** It stays always visible and pressable, and still opens
diagnostics.

- **Left: a status lamp, 12 dp, whose shape and colour both carry the state:**

  | Lamp | Shape | Colour | State |
  |---|---|---|---|
  | Live | filled circle | `success` | Connected and data flowing |
  | Not live | hollow ring | `caution` (`colors.caution`, new: day `#9a6700`, dark `#d29922`, night `#a07a2a`) | Connected but stale, or connecting, pairing or reconnecting |
  | Not connected | ✕ | `danger` | Disconnected or failed |

- **Then one text line:** `Connected · Live`, `Connected · No flight loaded`,
  `Reconnecting · attempt 2 of 5`, `Not connected`, `Waiting for the pairing code`.
- **Right:** the age, in `numeric()` and muted, shown only when the bar is not live (for example
  "updated 4 s ago"). A live bar needs no age, which is the dark-cockpit principle: quiet while
  normal. Before the first heartbeat there is no age to give, so none is shown.
- **Accessibility:** the label keeps today's full sentence.
- **Sizing:** minimum height 48 dp, a single row and no outer border card: a hairline bottom
  border on the `surface` background. This frees about 40 dp on a phone for the panel.

`colors.caution` joins `ThemeColors` and must reach 4.5:1 against `surface` and `background` in
light and dark. At night it is capped at luminance 0.30, and it must also reach 4.5:1 there.

**Panel switcher: icon and label.**

- Each tab gets a 22 dp SVG icon, drawn in `src/features/shell/PanelIcon.tsx` with
  `react-native-svg`:
  - Instruments: an attitude ball (a circle split by a horizon);
  - Radios: a radio wave arc;
  - Autopilot: the letters "AP" in a rounded box;
  - Flight data: three horizontal bars;
  - Setup: a gear.

  An unknown panel id gets a plain dot.
- The label goes under the icon in portrait and beside it in the landscape rail.
- **Selected tab:** a 3 dp `accent` indicator bar on the edge facing the content, with the icon
  and label in `accent` and the label bold. The full blue fill is gone. `colors.accent` is the
  text-and-indicator form of the app hue (4.5:1 on surface and background in every mode);
  `colors.primary` stays a fill colour only, since night's is about 1.3:1 as text.
- Targets stay at 48 dp or more, and roles and labels are unchanged.

**Setup screen.**

- **Order:** heading "Avionix", then the Connection card, discovered connectors, Aircraft, Display
  (theme and haptics), Units and Panels. Diagnostics stays first while it is opened from the
  status bar.
- **Connection card, at the top:**
  - A row of four steps shows where the pilot is: **Find → Connect → Pair → Live**.
  - Each step shows a small state glyph: ✓ done, ● current or ○ to come. Labels are text, so the
    state is never colour alone. The current step's glyph and label are in `accent`.
  - The steps come from a pure `connectionSteps(state, live, hasHost)` in
    `src/domain/connection/connection-steps.ts`, a total function over `ConnectionState`.
  - Its accessible label reads, for example, "Step 3 of 4, Pair: waiting for the pairing code".
- **Buttons:** Connect, Disconnect, Pair and Cancel become `ActionButton`s: Connect and Pair are
  primary, Disconnect is destructive and Cancel is secondary.
- **The pairing code is six visual digit boxes over the existing `TextInput`.**
  - The `TextInput` keeps `testID="pairing-code"` and its accessibility label. It is made
    full-size and transparent, so a tap anywhere on the boxes focuses it.
  - The boxes use `numeric(theme, true)` at `displaySize`, and the current box has an `accent`
    border.
- Host and port fields keep their labels and behaviour, under the subtitle "Or enter the address
  of the X-Plane PC".

### 5. Radios (F-21) and transponder (F-22)

**Radio units.** Each radio becomes an `AvionicsUnit` labelled with the radio's label ("COM1").

```
┌ COM1 ─────────────────────────────────────────────┐
│ ┌ACT──────────┐   ┌────┐   ┌STBY─────────────┐    │
│ │  118.275    │   │ ⇄  │   │╔═ 121.500 ═╗    │    │  standby: cyan tuning frame,
│ └─────────────┘   └────┘   └─────────────────┘    │  tap = keypad (unchanged)
│ IKSO · 12.4 NM · CRS 270°                         │
└───────────────────────────────────────────────────┘
```

- **Active:** a `DisplayWindow` with role `active` (green) and caption "ACT", not pressable.
- **Swap:** the swap key, legend `⇄`, between the two windows, as today.
- **Standby:** the standby `ControlButton`, whose content is a `DisplayWindow` with role `standby`,
  caption "STBY" and `tuning`, so a tap opens the keypad as today.
  - `ControlButton` gains a `children` render path: when children are given, they replace the
    text legend.
- **Details** (ident, DME, course): `selected` (cyan) text at `titleSize` in the mono font.
- **Narrow layout:** below 360 dp of content width, the windows stack with the swap key between
  them, still in one unit.
- **Unchanged:** the read-back message, availability reason, `OperationNotice` and the "not live"
  words.

**Transponder unit.** It is an `AvionicsUnit` labelled "XPDR".

- **Code:** a large `DisplayWindow` for the code. It is pressable through `ControlButton` children,
  which opens the keypad as today.
- **Mode:** the mode word sits in the window caption.
- **"IDENT":** an `engaged` (green) annunciation inside the window while X-Plane reports identing.
  The panel's own "IDENT sent" claim keeps its existing wording, as plain legend text.
- **Mode keys** for the four positions show the light bar `engaged` on the selected position and
  `off` on the others.
- **IDENT key.**
- **Emergency codes** (7500, 7600, 7700, via `isEmergencySquawk`): the code is drawn in `warning`
  with the word "EMERG" in the caption, so it is never colour alone.

### 6. Autopilot (F-20)

**FMA strip.** `src/features/panels/autopilot/Fma.tsx` replaces the one-line `Annunciator` on the
panel, and `PfdView` reuses it.

- **Layout:** one glass strip in four columns, modelled on the G1000's AFCS status bar:

```
┌──────────┬──────────────┬──────────┬──────────────┐
│ A/T SPD  │ HDG          │  AP  FD  │ VS 500FPM    │   row 1: engaged (green)
│          │ NAV          │          │ ALT  GS      │   row 2: armed (white)
└──────────┴──────────────┴──────────┴──────────────┘
```

- **The model is a pure domain function**, `fmaColumns(statuses, autothrottle, ap, fd,
  references)`, in `src/domain/autopilot/fma.ts`. It returns
  `{ autothrottle: string | null, lateral: { active, armed[] }, vertical: { active, armed[] },
  ap: boolean, fd: boolean }`.
  - **Lateral and vertical:** it reuses the precedence lists in `modes.ts`. The `LATERAL`,
    `VERTICAL` and `ARMABLE` tables move to exports.
  - **Vertical active text** carries its reference where X-Plane has one: `VS 500FPM` from
    `vvi_dial_fpm`, rounded to 100 and signed for descent as `VS -500FPM`. FLC reads
    `FLC 120KT`, or `FLC M.78` in Mach. Other modes are the bare word.
  - **Autothrottle:** `A/T ` plus `autothrottleWord`, or `A/T` in white on row 2 when armed only.
  - **AP and FD:** shown in green when on; absent when off.
- **Box on a new mode.**
  - `useFmaBoxes(columns, now)` keeps the last active value per column (`autothrottle`, `lateral`,
    `vertical`, `ap`) and when it changed.
  - A column whose active value changed to non-null within `FMA_BOX_MS` (10,000 ms) draws a 1.5 dp
    `engaged` box around that value.
  - The pure part, `nextBoxState(prev, columns, now)`, lives in `fma.ts`.
  - On first render nothing is boxed: values that were already engaged are not "new".
  - A reconnect resets the state, so no box appears for values seen again after a link loss.
- **AP disconnect annunciation.**
  - When `ap` goes from true to false while the link is current, the AP slot shows "AP" in
    `caution` (amber) for `AP_DISCONNECT_MS` (5,000 ms). The slot flashes at 2 Hz through an
    `Animated` opacity loop, or holds steady when the OS reduced-motion setting is on, read
    through `AccessibilityInfo.isReduceMotionEnabled` and its change event.
  - Tapping the FMA acknowledges and clears it early.
  - It fires `haptics.failure()` once.
  - A transition seen because the link dropped and came back, with no current values in between,
    does not count.
  - This follows the Garmin normal-disconnect behaviour. X-Plane does not tell Avionix whether a
    disconnect was abnormal, so Avionix never claims one was.
- **Accessibility:** the FMA's label stays `Autopilot modes: <annunciationText(...)>`, with
  ", autopilot disconnected" appended while that annunciation shows. Existing tests that read the
  label keep passing.
- **Missing data:** no mode data, or no flight, shows "—" columns in `legendDim`. "not live" sits
  beside the strip when it is stale, as today.

**Controller unit.** An `AvionicsUnit` labelled "AUTOPILOT".

- **Keys:** `ControlButton` keys with light bars, each from X-Plane's state as today:
  - AP, FD and A/T are `engaged` when on and `off` otherwise;
  - A/T ARM is `engaged` when armed;
  - each mode key is `engaged`, `armed` or `off`.
- **Phone layout** (content narrower than 720 dp), in rows of equal-width keys:
  1. AP, FD, A/T ARM, A/T
  2. HDG, NAV, APR
  3. ALT, VS, FLC
- **Wide layout** (720 dp and up), following the GMC 507: lateral keys on the left (HDG, NAV, APR),
  the engage keys in the centre (AP, FD, A/T ARM, A/T), and vertical keys on the right (ALT, VS,
  FLC), in one row of three groups.

**Selector windows.** Each selector becomes a row inside a second `AvionicsUnit` labelled
"SELECTORS".

- **Value:** a `DisplayWindow` with role `selected` (cyan), the caption being the selector's label
  (HDG, ALT, VS, IAS or MACH). It is pressable through `ControlButton` children and opens the
  keypad as today.
- **Steppers:** the four steppers are keys in one group, `−10 −1 +1 +10` (labels from `stepLabel`
  as today).
- **Unit:** "Use Mach" / "Use knots" becomes a key with the legend `IAS⇄M` and an unchanged
  accessibility label.
- **Unchanged:** all behaviour, including read-back, pending bases, blocked states and override.

### 7. Instruments (F-10)

**PFD gains the autopilot's targets.** The instruments panel descriptor adds the autopilot features
to its `features`: the selectors, modes, AP, FD and A/T. Demand then subscribes to them while the
PFD is shown. A missing feature just leaves its cue out; it never makes the panel unavailable.

- **FMA:** the same `Fma` strip, across the full PFD width above the tapes, shown when any
  autopilot feature is available.
- **Selected altitude:**
  - a cyan box at the top of the altitude tape with the selected altitude (`altitude_dial_ft`),
    rounded to whole feet and grouped like the tape;
  - a cyan bug on the tape at that altitude, parked half-visible at the tape's edge when off the
    scale;
  - always shown while the binding resolves (the G1000 always shows it).
- **Selected heading:**
  - a cyan bug on the heading tape, parked at the edge when beyond ±30°;
  - a cyan box `HDG 270°` in the empty 60-unit slot left of the turn-rate scale (the G1000's HDG
    box sits low left);
  - always shown while the binding resolves.
- **Selected airspeed:** a cyan box at the top of the speed tape (`120` or `M.78`) and a cyan bug
  on the tape when in knots. Both show only while FLC or the autothrottle is engaged. Otherwise
  they are hidden as clutter, as the G1000 does.
- **Selected vertical speed:** a cyan bug on the VSI scale, shown only while VS mode is engaged.
- **Accessibility:** the targets are spoken through the existing instrument labels. For example,
  the altitude adds ", selected 8,000 feet" and the heading adds ", heading bug 270".
- **Not live:** every target fades with `NOT_LIVE_OPACITY` exactly like the PFD boxes.

The geometry helpers (bug position and parking) are pure functions in
`src/domain/instruments/bugs.ts`, unit-tested at the edges: exactly on the edge, just beyond it,
the 360/0 wrap for heading and negative VS.

**Six-pack.** The directional gyro gains an orange heading bug at the selected heading, from the
same binding. The other gauges are unchanged.

### 8. Flight data and readouts (F-11)

- The strip and the Flight data panel set every value with `numeric()`.
- Labels are `captionSize`, in capitals and muted, like a data block on a real flight display.
- `Readout` values use `numeric(theme, true)`.
- Nothing else changes.

## Requirements

- U1. Every displayed state still comes only from X-Plane. No key shows engaged, armed or selected
  because it was pressed.
- U2. Colour is never the only cue:
  - light bars differ by shape;
  - the status lamp differs by shape;
  - stale values keep "not live";
  - the emergency squawk says "EMERG";
  - the AP disconnect says "AP";
  - setup steps carry glyphs and words.
- U3. Every pressable target stays 48 dp or more. The touch-target guard passes unchanged, and its
  layouts cover the new FMA (pressable to acknowledge) and the selector windows.
- U4. Every night colour keeps relative luminance of 0.30 or less, and every listed text pair
  reaches 4.5:1 (section 1 guards).
- U5. The app renders correctly before the fonts load, if they never load, and with no haptics
  module. Each of these is a test.
- U6. No URL, HTTP status, exception text, DataRef id or name, or token appears on any new surface.
  The error-text guard keeps passing.
- U7. Accessibility labels of existing controls stay word for word, except where this spec
  replaces a visual glyph prefix. The visible "● " and "○ " prefixes go, and the spoken state was
  already in the label.
- U8. Reduced motion stops the AP-disconnect flash; the annunciation stays visible and steady.

## Testing

- **Unit:**
  - `fma.ts`: columns, references, precedence, armed lists, the box state machine (first render,
    change, expiry at exactly 10 s, reconnect reset) and AP disconnect detection.
  - `bugs.ts`: parking at the edges, the heading wrap, negative VS.
  - `connection-steps.ts`: every `ConnectionState`.
  - The theme guards in section 1.
  - The haptics adapter with and without the native module.
- **UI:**
  - the light-bar states, read from the key's `testID` children, for each mode state;
  - the FMA box appears on a new mode and expires;
  - the disconnect annunciation shows, is acknowledged and is steady under reduced motion;
  - the PFD bugs and boxes appear only under their conditions;
  - the radio windows' roles;
  - the transponder emergency treatment;
  - the status lamp states;
  - the Setup steps;
  - the pairing boxes;
  - haptics fire on press and on read-back failure, and not when disabled.
- **Existing suites** keep passing after mechanical updates: text without the "● " and "○ "
  prefixes, and native `Button` replaced by `ActionButton`, with labels unchanged.
- **Smoke-test rows** for the device: fonts render on iOS and Android; haptics on press and on a
  refused change after the new development build; the FMA box and disconnect on a real autopilot;
  PFD bugs moving with the knobs in X-Plane; status-bar states; the six-pack DG bug.

## Risks

- **A new development build is needed for haptics.** Until it lands, everything else works and
  haptics are silent, because the adapter is guarded.
- **Font names on Android must match the asset family exactly.** `@expo-google-fonts` exports the
  names used here. A device smoke row checks both platforms.
- **The FMA's vertical reference uses the dial values.** An add-on that drives its own targets may
  show a different reference. This is acceptable: the reference is X-Plane's own selector, the
  same value the panel shows.
- **Restyling touches many UI tests.** Each change is mechanical, and the plan lists them per task.
