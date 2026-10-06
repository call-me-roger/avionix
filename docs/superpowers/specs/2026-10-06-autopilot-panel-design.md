# Autopilot panel — design

Feature: `F-20` (roadmap Stage 1, sub-project 7, the last of Stage 1). Spec date: 2026-10-06.
Source: [F-20](../../roadmap/features/F-20-autopilot-panel.md).
Builds on: F-03 (profiles, per-feature availability), F-04 (panel framework, `ControlButton`,
operations, retired panel ids), F-21/F-22 ([spec](2026-09-30-radios-transponder-design.md): the
keypad, the staged entry, the read-back check).

## Goal

An **Autopilot** panel for any aircraft flown by X-Plane's built-in autopilot: engage and
disconnect the autopilot, the flight director and the autothrottle; the six common modes (HDG,
NAV, APR, ALT, VS, FLC), each shown as off, armed or engaged; and the four selectors (heading,
altitude, vertical speed, airspeed in knots or Mach), each set with steppers or typed on the
keypad. Every state shown is X-Plane's; every change is checked against what X-Plane reports
afterwards. It replaces the MVP's interim **Heading** panel.

Requirement ids R1–R10 are the roadmap's.

## Why this now, and what customers say

- It is the control most remote-panel products ship (6 of 15 researched), and Laminar's own Control
  Pad has none.
- **Typing values is what reviewers praise**: "now can type the numbers. So much easier! I also use
  the A/P view quite a bit" (XpRemotePanel). Knobs on a phone are the complaint the whole category
  shares (X-Plane Mobile: "you need to zoom in on specific areas of the cockpit" to turn autopilot
  knobs; Flight Sim Remote Panel's stack "impossible to use on an 8 inch screen").
- **Accidental touches are the fear**: "when I swipe it accidentally takes a touch to a setting,
  which can lead to a pretty wild ride" (XpRemotePanel). Avionix has no swipe or drag-to-set on
  this panel; steppers move by small amounts, and large changes go through the keypad and Set.
- **Missing autothrottle is a named gap**: "Needs auto throttle controls added, other than that,
  it's great!" (RemoteFlight AUTOPILOT, also "needs a Arm button").
- **Oversized controls** are the opposite complaint: "huge buttons utilizing half the screen"
  (RemoteFlight AUTOPILOT). Controls here are the framework's 48 dp minimum, keys 56 dp.
- Laminar's guidance for third-party autopilot panels: "We strongly recommend all 2.0 plugins use
  the command system for maximum compatibility", and never write `autopilot_state` bits blindly.
  Avionix engages every mode by command and never writes `autopilot_state`.

## Scope

**In.** Profile 1.4.0 with twelve new features (below). The Autopilot panel: a mode annunciator,
the engage row (AP, FD, A/T ARM, A/T), the mode buttons, the four selector rows with steppers and
keypad entry. Domain modules for the selectors (format, step, limits), the selector entry and the
modes (states, annunciation, autothrottle). The read-back check gains a predicate and a "pending
value" query; the keypad moves to the panel primitives and gains an optional sign key. The
**Heading** panel is retired (`heading` → `autopilot`). Mock X-Plane serves every new name and
simulates every new command.

**Out** (owner in brackets): the 737 MCP (F-50) and Airbus FCU (F-57); course/OBS and CDI source
(F-30); VNAV, FMS, flight-plan editing (no navdata in the Web API); copilot-side selectors and
flight director; bank-angle limit, yaw damper, TO/GA, GPSS, back course, heading sync, CWS;
add-on autopilots under their own namespaces (Stage 4 profiles); user remapping (F-06).

## Verified names

All checked against Laminar's `DataRefs.txt` and `Commands.txt` (XPlane2Blender copies, X-Plane 12).
The roadmap's open items "not identified" are now identified.

| Purpose | Name | Type, units | Writable |
|---|---|---|---|
| Autopilot engaged (servos) | `sim/cockpit2/autopilot/servos_on` | int, boolean | n |
| Engage / disconnect | `sim/autopilot/servos_on`, `sim/autopilot/servos_off_any` | command | — |
| Flight director bars | `sim/cockpit2/autopilot/flight_director_command_bars_pilot` | int, boolean | read here |
| FD on / off | `sim/autopilot/fdir_command_bars_on`, `sim/autopilot/fdir_command_bars_off` | command | — |
| Autothrottle state | `sim/cockpit2/autopilot/autothrottle_enabled` | int enum: −1 hard off, 0 armed, 1 speed, 2 N1, 3 retard | read here |
| A/T engage / off (stay armed) | `sim/autopilot/autothrottle_on`, `sim/autopilot/autothrottle_off` | command | — |
| A/T arm / disarm | `sim/autopilot/autothrottle_arm`, `sim/autopilot/autothrottle_hard_off` | command | — |
| Heading selector | `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot` | float, degrees magnetic | y |
| Altitude selector | `sim/cockpit2/autopilot/altitude_dial_ft` | float, feet | y |
| Vertical speed selector | `sim/cockpit2/autopilot/vvi_dial_fpm` | float, ft/min | y |
| Airspeed selector | `sim/cockpit2/autopilot/airspeed_dial_kts_mach` | float, knots or Mach | y |
| Airspeed is Mach | `sim/cockpit2/autopilot/airspeed_is_mach` | int, boolean | read here |
| Knots/Mach toggle | `sim/autopilot/knots_mach_toggle` | command | — |
| HDG mode | `sim/cockpit2/autopilot/heading_status`; `sim/autopilot/heading` | 0 off, 2 captured; command | n |
| NAV mode | `sim/cockpit2/autopilot/nav_status`; `sim/autopilot/NAV` | 0/1 armed/2 captured; command | n |
| APR mode | `sim/cockpit2/autopilot/approach_status`; `sim/autopilot/approach` | 0/1/2; command | n |
| Glideslope | `sim/cockpit2/autopilot/glideslope_status` | 0/1/2 | n |
| ALT mode | `sim/cockpit2/autopilot/altitude_hold_status`; `sim/autopilot/altitude_hold` | 0/1/2; command | n |
| VS mode | `sim/cockpit2/autopilot/vvi_status`; `sim/autopilot/vertical_speed` | 0/2; command | n |
| FLC mode | `sim/cockpit2/autopilot/speed_status`; `sim/autopilot/level_change` | 0/2; command | n |
| Roll / pitch hold | `sim/cockpit2/autopilot/roll_status`, `pitch_status` | 0/2 | n |
| Plugin override | `sim/operation/override/override_autopilot` | int, boolean | never written |

The mode `*_status` DataRefs are documented as `0=off, 1=armed, 2=captured`; they replace the
roadmap's `autopilot_state` bit field, which needs bit arithmetic and which Laminar warns about
writing. The deprecated `sim/cockpit/autopilot/*_mode` names are not used.

**Idempotent where X-Plane offers it.** Engage/disconnect, FD on/off and A/T arm/disarm/engage/off
are separate commands, so a press can never flip a state the panel showed stale. The mode buttons
and the knots/Mach button use X-Plane's own toggle commands, as the aircraft's buttons do.

## Profile features (1.4.0)

One feature per control, so a name an aircraft lacks costs only that control (R6), as F-21 did.

| Feature id | Label | Required | Optional |
|---|---|---|---|
| `autopilot-engage` | Autopilot | `servos_on` (read), engage and disconnect commands | override, roll status, pitch status |
| `flight-director` | Flight director | bars (read), on and off commands | — |
| `autothrottle` | Autothrottle | `autothrottle_enabled` (read), the four A/T commands | — |
| `heading-control` (existing) | Heading control | heading bug (`write`), `heading_up` (unchanged) | — |
| `altitude-select` | Altitude selector | `altitude_dial_ft` (`write`) | — |
| `vertical-speed-select` | Vertical speed selector | `vvi_dial_fpm` (`write`) | — |
| `airspeed-select` | Airspeed selector | `airspeed_dial_kts_mach` (`write`), `airspeed_is_mach` (read) | knots/Mach command |
| `ap-mode-hdg` | HDG mode | `heading_status`, `sim/autopilot/heading` | — |
| `ap-mode-nav` | NAV mode | `nav_status`, `sim/autopilot/NAV` | — |
| `ap-mode-apr` | APR mode | `approach_status`, `sim/autopilot/approach` | `glideslope_status` |
| `ap-mode-alt` | ALT mode | `altitude_hold_status`, `sim/autopilot/altitude_hold` | — |
| `ap-mode-vs` | VS mode | `vvi_status`, `sim/autopilot/vertical_speed` | — |
| `ap-mode-flc` | FLC mode | `speed_status`, `sim/autopilot/level_change` | — |

`heading-control` keeps its id, label and bindings: the diagnostics screen probes its
`heading_up` command, and the heading selector row uses its heading-bug binding.

## Selectors (R3)

| Selector | Shown as | Steppers | Limits | Typed |
|---|---|---|---|---|
| Heading | `270°` (three digits, `360°` for 0) | −10 −1 +1 +10 | wraps 0–359 | 1–3 digits, 0–360 |
| Altitude | `5,000 ft` | −1000 −100 +100 +1000 | 0–50,000 | 1–5 digits |
| Vertical speed | `+1,500 fpm`, `0 fpm`, `−800 fpm` | −500 −100 +100 +500 | −9,900 to +9,900 | 1–4 digits and a ± key |
| Airspeed, knots | `250 kt` | −10 −1 +1 +10 | 40–500 | 2–3 digits |
| Airspeed, Mach | `M .78` | −.05 −.01 +.01 +.05 | .10–.99 | 2 digits after the point |

- **Steppers** each send one write (R3: one write per pilot action). The new value is computed
  from the value the panel last sent, while X-Plane has not yet shown it, else from X-Plane's
  value — so three quick taps of +100 land 300 ft higher, not 100.
- Heading adds to the rounded value and wraps. Altitude and vertical speed first move to the
  100-ft grid in the direction of travel, then step (4,550 +100 → 4,600, −100 → 4,500), as real
  altitude preselectors do. Airspeed adds to the rounded knot or hundredth of Mach.
- A stepper that would pass a limit is disabled (heading wraps instead). With no value from
  X-Plane, every stepper is disabled: there is nothing to step from.
- **Typed entry** opens from the selector's value button (`Enter altitude`), in the radios' dashed
  `New` box, on the same 56 dp keypad (moved to the panel primitives). The heading is sent modulo
  360 (typing 360 sends 0, which reads `360°`). Vertical speed has a `±` key that flips the sign.
  Mach is typed as its two hundredths digits after an implied `.`.
- **No snapping.** An out-of-range draft keeps Set disabled and says why, once more digits can no
  longer bring it into range (the draft is at full length, or already above the maximum):
  `Heading runs from 0 to 360.`, `Altitude runs from 0 to 50,000 ft.`,
  `Vertical speed runs from −9,900 to +9,900 fpm.`, `Airspeed runs from 40 to 500 kt.`,
  `Mach runs from .10 to .99.` Any whole number within the limits is accepted (no 100-ft rule
  on typed altitudes: a pilot does not type 4,550 by accident, and a rule would flash mid-typing).
- The draft follows the radios' rules: one entry open at a time, dropped when controls disable or
  the aircraft changes, closed when X-Plane accepts the write, kept for retry if the write fails.
  An airspeed draft is also dropped when X-Plane switches the selector between knots and Mach.

## Modes (R2, R5)

- Each mode button shows its state from X-Plane's status DataRef only (R5): engaged `● HDG`,
  armed `○ NAV`, off `HDG` — distinguishable by shape, not colour, and in the accessibility label
  (`HDG mode, engaged`). Status 2 or higher is engaged, 1 is armed, anything else is off.
- A press activates X-Plane's command for that mode; the button is disabled until X-Plane answers
  (the framework's pending rule), so a double tap cannot toggle twice.
- **The annunciator** (top of the panel, one accessible line) reads like a flight-mode annunciator:
  the engaged lateral mode (APR, NAV, HDG, ROL in that precedence), the engaged vertical mode (GS,
  ALT, FLC, VS, PIT), then `Armed` and the armed modes (NAV, APR, ALT, GS), and the autothrottle
  mode word when active (`SPD`, `N1`, `RETARD`). Nothing engaged reads `No modes engaged`.

## Engage row

- **AP**: `● AP` while `servos_on` is 1. A press sends disconnect when engaged, engage otherwise.
  One tap either way: a disconnect must never wait for a confirmation.
- **FD**: `● FD` while the pilot's bars are on; a press sends bars off or on.
- **A/T ARM**: `● A/T ARM` while `autothrottle_enabled` ≥ 0; a press sends hard off (disarm) or arm.
- **A/T**: `● A/T` while `autothrottle_enabled` ≥ 1; a press sends A/T off (stays armed) or on.
- The knots/Mach button sits in the airspeed row: `Use Mach` / `Use knots`, the toggle command.

## Read-back (R4)

Every press is watched for 3 s from X-Plane's acceptance, with F-21's `useReadBack`, and the
display never shows anything but X-Plane's value, so there is nothing to revert. Sentences:

- Selector: `X-Plane did not take altitude 5,000 ft. The selector still shows 4,000 ft.` (second
  sentence omitted with no value). Heading, vertical speed, airspeed and Mach likewise.
- Mode: `X-Plane did not engage NAV.` (pressed from off; NAV and APR add
  ` Check the navigation source.`) or `X-Plane did not turn NAV off.` Adopted = the status
  differs from the one shown at the press.
- AP: `X-Plane did not engage the autopilot. Check that it has power.` /
  `X-Plane did not disconnect the autopilot. Disconnect it in X-Plane.`
- FD: `X-Plane did not turn the flight director on.` / `… off.`
- A/T: `X-Plane did not engage the autothrottle. This aircraft may not have one.` / `X-Plane did
  not disengage the autothrottle.` / `X-Plane did not arm the autothrottle. This aircraft may not
  have one.` / `X-Plane did not disarm the autothrottle.`
- Knots/Mach: `X-Plane did not switch the airspeed selector to Mach.` / `… to knots.`

`readBackVerdict` gains an optional `matches` predicate that decides adoption instead of
`readsAs(current, expected)` (needed for Mach, where half a unit is the whole range, for the
heading's 360/0 wrap, and for "status changed"). `useReadBack` gains `pendingExpected(key)`: the
expected value of a watch still waiting, which is the stepper base.

## Plugin override (R10)

When `override_autopilot` reads 1, a notice under the annunciator says
`Another program is flying X-Plane's autopilot. These controls are off until it hands control
back.` and every control on the panel is disabled. Avionix never writes the override. A missing
override binding means no override is known: the panel works.

## The panel

Id `autopilot`, title `Autopilot`, features: the twelve above plus `heading-control`. Third in the
switcher (Instruments, Radios, Autopilot, Flight data). `RETIRED_PANEL_IDS` gains
`heading → autopilot`; `HeadingPanel` is deleted.

```
HDG   ALT   Armed NAV · GS            ← annunciator
(● AP) (● FD) (● A/T ARM) (A/T)
(● HDG) (○ NAV) (APR)
(● ALT) (VS) (FLC)
Heading      [270°]                    ← value button opens the keypad
  (−10) (−1) (+1) (+10)
Altitude     [5,000 ft]
  (−1000) (−100) (+100) (+1000)
Vertical speed [+1,500 fpm]
  (−500) (−100) (+100) (+500)
Airspeed     [250 kt]   (Use Mach)
  (−10) (−1) (+1) (+10)
```

- **Layout.** Narrow (content width < 720 dp): annunciator, engage row, modes, selectors; the
  keypad opens under the selector being edited. Wide (≥ 720 dp, the constant moves to
  `src/domain/panels/device-layout.ts`, shared with Radios): annunciator, engage and modes left,
  selectors (and the keypad under its row) right.
- **States.** Not live → values muted and `not live`; no flight → `—`, modes shown off, steppers
  disabled; a feature unavailable → its reason once under its control or row.
- **Accessibility.** Selector rows are one label (`Altitude selector: 5,000 ft`); steppers are
  labelled in words (`Altitude plus 100 feet`); mode buttons carry their state.
- Content keyed by aircraft identity, as Radios: an aircraft change drops drafts and sentences.

## Errors and copy (R9)

Only fixed sentences and `FailureNotice`. No DataRef id, name, URL, status, token or host appears
on screen or in logs. Nothing new is logged.

## File plan

- `src/domain/autopilot/selectors.ts`: kinds, limits, formatting, stepping.
- `src/domain/autopilot/selector-entry.ts`: draft reducer, sign, parse, explain rule.
- `src/domain/autopilot/modes.ts`: mode state, annunciation, autothrottle words.
- `src/domain/panels/read-back.ts`: `matches`. `src/domain/panels/device-layout.ts`:
  `TWO_COLUMN_MIN_WIDTH`.
- `src/features/panels/primitives/useReadBack.ts`: `matches`, `pendingExpected`.
- `src/features/panels/primitives/Keypad.tsx` (moved from radios, takes digits and an optional
  sign key).
- `src/domain/aircraft/profiles/generic.ts`: 1.4.0, names, twelve features.
- `src/features/panels/autopilot/`: `autopilot.ts` (descriptor, selector specs, mode specs),
  `AutopilotPanel.tsx`, `Annunciator.tsx`, `EngageRow.tsx`, `ModeButtons.tsx`,
  `SelectorRow.tsx`, `SelectorPad.tsx`, `useSelectorEntry.ts`.
- `src/features/panels/registry.ts`, `src/application/panel-layout.ts`; delete
  `src/features/panels/heading/`.
- `tests/mock-xplane/mock-xplane-server.ts`: names and command behaviour; an override setter.
- Docs: `docs/xplane.md`, `docs/architecture.md`, `README.md`, smoke-test rows, F-20 status.

## Testing

- **Domain**: format each selector (heading 0 → `360°`, `005°`; altitude grouping; VS sign and
  zero; Mach `M .78`); stepping (wrap 355 +10 → 5, grid 4,550 ±100, clamps at limits disabled,
  Mach rounding 0.785 +.01); entry (max digits per kind, ± only for VS, Mach two digits, ranges,
  explain rule at full length and above max, 360 sends 0); mode state 0/1/2/3/undefined;
  annunciation precedence and armed lists; A/T words −1…4.
- **Read-back**: `matches` overrides `readsAs`; `pendingExpected` while waiting, null after.
- **UI**: annunciator line from statuses; AP press sends engage when off and disconnect when
  engaged; FD/A/T idempotent commands; mode button shows ●/○ and sends its command; read-back
  sentences for a mode that does not change and for an AP that does not disconnect; steppers send
  current+step, and twice quickly send +200 total; disabled at a limit and with no value; typed
  altitude writes, out-of-range explains; VS ± key; Mach entry writes 0.78; knots/Mach button;
  override disables everything with the notice; a missing feature disables only its control;
  disconnect drops the draft; `heading` → `autopilot` migration; Heading panel gone.
- **Guards**: error-text and touch-target guards cover the Autopilot panel.
- **Integration** (mock): engage AP and HDG, set altitude by write, VS by stepper, toggle
  knots/Mach; an ignored write produces no adoption; a removed command leaves the rest usable.

## Requirement coverage

| Req | Where |
|---|---|
| R1 | every value from the subscription; read-back from telemetry |
| R2 | `modes.ts` states; ●/○/plain and accessibility words |
| R3 | one write per stepper press or Set; display only X-Plane's value |
| R4 | `useReadBack` sentences (the display has nothing to revert) |
| R5 | mode and engage state only from status DataRefs |
| R6 | one feature per control; `ControlButton` reasons |
| R7 | link status: muted values, `not live`, controls inert, drafts dropped |
| R8 | the session re-probes on every connect (F-03) |
| R9 | fixed copy with next steps where one exists, `FailureNotice`, guards |
| R10 | override read, never written; notice and all controls disabled |

## Decisions and rationale

1. **Status DataRefs, not the `autopilot_state` bit field**: documented 0/1/2 per mode, read-only.
2. **Commands for every engagement** (Laminar's recommendation); idempotent pairs where they exist.
3. **Steppers plus typed entry, no knobs or drag**: typing is praised; drag and swipe cause the
   "wild ride" complaint.
4. **Each stepper press is one write** (roadmap open question: write on every increment).
5. **Pilot side only** (roadmap open question): the copilot selectors and FD are not shown.
6. **Steppers build on the pending value** so quick taps add up.
7. **Altitude and VS steppers move to the 100-ft grid first**, like a real preselector; typed
   values are any whole number in range.
8. **AP disconnect is one tap**, never confirmed.
9. **A/T engage, off, arm and disarm are four idempotent commands**, answering the named gap.
10. **The Heading panel is retired into Autopilot**; `heading-control` keeps its id for
    diagnostics and existing users.
11. **Autopilot third in the switcher**, after Radios: pilots who installed for radios keep their
    order.
12. **A read-only refusal during a session does not disable the control for the session** (R6's
    second sentence): as in F-21, the profile probe already disables a read-only binding at
    connect, and the read-back sentence covers the rest.
13. **The override notice disables every control**, including disconnect: a plugin that owns the
    autopilot ignores Avionix's commands anyway.

## Deliberately not done

Copilot side; heading/altitude sync; bank limit; yaw damper; TO/GA; GPSS; back course; VNAV; CWS;
course/OBS; aircraft-specific steps (`alt_step_ft`); hold-to-repeat steppers; drag gestures.

## Open questions (device checks)

- That `autothrottle_on` engages from the disarmed state, or needs `autothrottle_arm` first.
- That `servos_on` engages on a default GA aircraft with the avionics on (KAP 140, GFC 700).
- That the FD bars DataRef follows the commands on aircraft without a separate FD switch.
- That a default aircraft without autothrottle leaves `autothrottle_enabled` unchanged (the
  read-back hint relies on it).
