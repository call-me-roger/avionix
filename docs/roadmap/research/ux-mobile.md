# UX Research: Modern, Reliable Mobile UX for a Cockpit Remote App (Avionix)

Research compiled for Avionix — a phone/tablet cockpit remote for X-Plane 12 (pairing/discovery, connection status, panel switcher, instruments, radios, transponder, autopilot). Goal: modern but reliable, instantly understandable, trustworthy to professional pilots.

---

## 1. ForeFlight & Garmin Pilot: connection status, onboarding, glanceability, dark mode, layout, navigation, confirmation

### Device connection status
- ForeFlight surfaces external device state (e.g. Stratus ADS-B receiver) in a dedicated **Devices** page reached from the "More" tab, not scattered across screens. A connected device shows a green check mark; tapping it opens a **Status page** with battery life, connection quality, weather age, firmware, and tower count — i.e., one tap from "connected" to "why/how connected." [ForeFlight: How is a Stratus receiver connected?](https://support.foreflight.com/hc/en-us/articles/203830055-How-do-I-connect-to-my-Stratus-), [Stratus Status page](https://stratusbyappareo.com/knowledge-base/stratus-ads-b-receiver/general/how-do-i-get-to-the-stratus-status-page-in-foreflight-mobile/)
- Even secondary/benign conditions get a visible but non-alarming banner: an orange "No Internet Connection" message appears under the Stratus network name as a normal (not error) state during Smart Wi-Fi operation — showing that ForeFlight distinguishes "informational" from "actionable" banners by color/tone. [iPad Pilot News: Understanding Stratus settings](https://ipadpilotnews.com/2019/05/understanding-stratus-settings-3/)
- Real-world failure mode pilots report: Stratus/ForeFlight connection drops mid-flight with GPS marker lag, and reconnection isn't always automatic — pilots had to power-cycle the receiver, and one persistent fix was an iOS "Local Network" permission toggle for ForeFlight that most users wouldn't discover on their own. This is a cautionary tale for permission-related failures that look like app bugs. [PilotsOfAmerica: ForeFlight/Stratus losing connection](https://www.pilotsofamerica.com/community/threads/foreflight-stratus-losing-connection-gps-position-marker-lag.119905/)

### Onboarding / first-run
- No single "wow" onboarding flow was found documented for ForeFlight/Garmin Pilot first-run; their design investment instead goes into **progressive disclosure within settings** (Devices, Status pages) rather than a guided wizard — consistent with professional/EFB tools where users expect to configure deliberately rather than be walked through a consumer-style tutorial.

### Glanceable status & dark/night mode
- ForeFlight ships a **day/night theme system**: manual Day/Dark theme toggle, an aeronautical map Dark Map Theme, chart color inversion, and an **Auto Day/Night** mode that transitions based on local sunrise/sunset — explicitly framed as preserving night vision, not just aesthetic dark mode. The dark theme keeps "highlight colors and prominent white text" visible against darkened backgrounds, i.e., it is a workflow-driven dark mode, not just inverted colors. [ForeFlight: Day/Night Auto Transition](https://foreflight.com/support/video-library/watch/?v=daynight-auto-transition&list=whats-new), [How can ForeFlight be set up for night ops?](https://support.foreflight.com/hc/en-us/articles/204460425-How-can-ForeFlight-Mobile-be-set-up-for-night-operations)

### Landscape/portrait & iPad split layouts
- ForeFlight's tab bar is **adaptive to available space**: iPhones get up to 5 tabs, iPads up to 10; as space shrinks (rotation to portrait, or iPad Split View), right-most tabs collapse into a "More" menu, and a special "Dynamic" tab remembers the last tab opened from More for quick re-access. Users can manually reorder tabs via "Edit Tab Order." [ForeFlight: More Menu & Tab Bar Changes](https://foreflight.com/enhancements/more-menu-tab-bar-changes)
- This is evidence for **bottom tab bar over sidebar** for this class of app, with an explicit, user-controllable "progressive collapse" model rather than hiding features silently.

### Navigation model
- Bottom tab bar (not sidebar) is ForeFlight's primary pattern on both iPhone and iPad, reinforcing that pilots expect a consistent, thumb-reachable, horizontally-arranged set of primary destinations rather than a desktop-style sidebar — even on larger iPad screens.

### Confirmation for critical actions (Apple HIG / Material 3)
- **Apple HIG**: Use a confirmation alert only for destructive or non-undoable actions. Always include a "Cancel" button as the safe path, and don't make Cancel the default/highlighted button. Note the nuance: when a person *deliberately* chooses a destructive action (not an accidental trigger), the confirm button doesn't need the red "destructive" style — because the friction of re-flagging it as dangerous isn't worth it once intent is already clear. Destructive buttons should have placement/padding that resists accidental taps. [Apple HIG via uxcel/alerts reference](https://github.com/sankalpaacharya/apple-human-interface-skills/blob/main/references/components/alerts.md)
- **Material 3**: Use a confirmation dialog only when the action is irreversible or significant — not for trivially reversible actions. Confirming action goes on the right/primary position, dismissive action to its left; the confirming button can be disabled until a real choice is made, while the dismiss button is never disabled. Dialog titles should echo the action being confirmed in plain language. [Material Design: Confirmation & acknowledgement](https://m2.material.io/design/communication/confirmation-acknowledgement.html), [Material Design: Dialogs](https://m2.material.io/components/dialogs)
- **Implication for Avionix**: autopilot disengage, transponder mode changes to EMERGENCY/IDENT, or any action that changes aircraft state irreversibly in the sim should use a clearly-labeled confirm (e.g. "Disengage Autopilot?") with the primary action on the right and Cancel as a true no-op — not a generic "Are you sure?".

---

## 2. What pilots praise/complain about (ForeFlight / Garmin Pilot)

Praise:
- "You truly can't go wrong with ForeFlight as an Electronic Flight Bag! The system and interface are very easy to use and navigate." — App Store/G2 review quoted via aggregator. [checkthat.ai: ForeFlight details](https://checkthat.ai/brands/foreflight)
- ForeFlight holds ~4.5/5 on G2 and ~4.4/5 on the App Store; praised specifically for real-time weather/hazard alerts, avionics integration, and interface accessibility "for both experienced pilots and beginners." [G2: ForeFlight reviews](https://www.g2.com/products/foreflight/reviews)

Complaints:
- Subscription pricing is the dominant complaint, but UX-relevant complaints include: **poor/slow human support** ("The chat is AI that has no clue... could take days or weeks to get an answer"), and connectivity reliability with paired hardware (Stratus disconnects, requiring manual power-cycling). [checkthat.ai](https://checkthat.ai/brands/foreflight), [PilotsOfAmerica thread](https://www.pilotsofamerica.com/community/threads/foreflight-stratus-losing-connection-gps-position-marker-lag.119905/)
- By contrast, **SkyDemon** is repeatedly praised by pilots specifically for being "much cleaner and less overwhelming compared to alternatives like ForeFlight," designed so pilots "only need to glance at it every so often" — explicitly fighting "data overload," which is a core design philosophy worth adopting for Avionix's instrument/radio panels. [iPad Pilot News: SkyDemon review](https://ipadpilotnews.com/2026/03/skydemon-offers-simple-vfr-only-app-experience-is-it-enough-for-us-pilots/)
- Direct ForeFlight-vs-Garmin-Pilot Reddit/r/flying threads could not be fetched (Reddit blocked WebFetch; targeted searches returned app-store aggregator content and forums instead, not raw Reddit threads) — treat the "praise/complaints" findings above as sourced from G2/App Store/forum aggregation rather than live Reddit quotes.

---

## 3. Modern mobile UX patterns for real-time control apps

### Haptics
- iOS exposes three generator classes: `UIImpactFeedbackGenerator` (light/medium/heavy — for button presses, drag-drop, snapping), `UINotificationFeedbackGenerator` (success/warning/error — ideal for command-acknowledged / command-failed), and `UISelectionFeedbackGenerator` (subtle tick for picker/selection changes, e.g. dragging a heading bug or altitude selector). Pre-"priming" the generator (calling `.prepare()`) reduces trigger latency, important when haptic needs to feel synced to a dial/knob interaction. [Hacking with Swift: UIFeedbackGenerator](https://www.hackingwithswift.com/example-code/uikit/how-to-generate-haptic-feedback-with-uifeedbackgenerator), [Reintech: Taptic Engine](https://reintech.io/blog/implementing-haptic-feedback-taptic-engine-ios-apps)
- Android equivalent: `VibratorManager` + `VibrationEffect.createPredefined()`/`createWaveform()` (API 26+).
- Studies cited: haptic feedback can increase task accuracy up to 20% and reduce *perceived* response time — directly relevant to turbulence/glove scenarios where visual confirmation alone is unreliable. [BairesDev: Why you need haptic feedback](https://www.bairesdev.com/blog/your-app-needs-haptic-feedback/)

### Optimistic vs confirmed state
- Standard optimistic-UI pattern: a `sendStatus` state machine (`PENDING` → `SENDING` → `SUCCESS`/`FAILED`), with the button disabled and a "sending" indicator visible while in flight, success feedback on confirmation, and explicit error feedback on failure. [DEV: React useOptimistic patterns](https://dev.to/stacknotice/react-useoptimistic-optimistic-ui-patterns-that-actually-work-2026-5460)
- **Critical caveat for IoT/sim-remote control specifically**: naive optimistic UI (showing the action as "done" immediately) is dishonest when the underlying channel (UDP/network to X-Plane) has latency or can silently fail. The recommended alternative is a **"ghost state"** — show the action as *pending* (not yet complete) until the remote system actually confirms, then transition to the confirmed/"done" visual. This directly matches Avionix's past fixes (e.g. "disable a mode or unit toggle while its own watch waits," "key the airspeed read-back watch by unit" from PR history) — formalize this as the standard interaction pattern across all panels: **every write to the sim shows a pending state until a read-back confirms it, never an instant flip.** [antovoda: Optimistic UI / Positive UI](https://antovoda.medium.com/optimistic-ui-positive-ui-966b92b67e1d)

### Toast vs inline errors
- NN/g and UX literature agree: toasts are for transient, non-blocking confirmations (3 words or fewer) — not for errors that block the task or need to persist. If the user needs to act or understand *why* something failed (e.g. "autopilot command rejected — no connection"), it must be an inline, persistent message or a dialog, not a toast that can disappear before being read. [Smart Interface Design Patterns: Error Messages UX](https://smart-interface-design-patterns.com/articles/error-messages-ux/), [NN/g: Indicators, Validations, Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)
- **Implication**: connection-lost/command-failed states in Avionix should live in the persistent status bar / inline on the affected control, not as a toast that vanishes mid-turbulence.

### Keep-awake
- `expo-keep-awake` provides `useKeepAwake()` (hook, awake while component mounted) and imperative `activateKeepAwake()`/`deactivateKeepAwake()`; can be scoped per-screen via `useFocusEffect` so only active panel screens hold the wake lock (battery tradeoff explicitly noted). [Expo docs: KeepAwake](https://docs.expo.dev/versions/v54.0.0/sdk/keep-awake.md)

### Dynamic Type / large text
- React Native has **known gaps** supporting iOS Dynamic Type fully (doesn't bridge `UIFont.preferredFont(forTextStyle:)` / `adjustsFontForContentSizeCategory` automatically) — this is an open React Native issue, not solved out of the box. [GitHub: react-native#51915](https://github.com/facebook/react-native/issues/51915)
- Baseline recommendation: at minimum, respect the system text-scale setting and verify layouts don't break under it; don't disable scaling globally just to avoid overflow bugs. [createwithswift: Supporting Dynamic Type](https://www.createwithswift.com/supporting-dynamic-type-and-larger-text-in-your-app-to-enhance-accessibility/)
- No aviation-specific guidance found on tabular figures; general best practice (industry-standard, not sourced to a specific article here) is to use tabular/monospaced numeral fonts for any live-changing numeric readout (altitude, heading, frequency) so digits don't jitter horizontally as values change — worth validating against `expo-font` + a font with `tnum` OpenType features.

### Reduced motion / high contrast
- React Native's `AccessibilityInfo.isReduceMotionEnabled()` surfaces the OS setting (iOS: Settings → Accessibility → Motion → Reduce Motion; Android: "Remove animations"). Guidance: don't strip *all* animation — keep simple fades, remove scale/transform-heavy transitions. [addjam: React Native accessibility guide](https://addjam.com/blog/2024-08-27/react-native-accessibility-guide/)
- High contrast is typically implemented as a **second token set** toggled independently from light/dark theme — not derived automatically from dark mode. [GitHub kuutti-app #12: UI foundation](https://github.com/kuutti-fi/kuutti-app/issues/12)

### Touch target sizing in turbulence / with gloves
- Research-backed sizing guidance directly applicable to cockpit remote apps:
  - Non-safety-critical EFB-style touch targets: **~15mm** is sufficient.
  - Safety-critical / fixed-display targets: **~20mm** recommended.
  - DoD guidance for gloved/vehicle-vibration use: **10–25mm**, with standard combat gloves reducing effective precision to ~20–25mm.
  - Device placement and vibration meaningfully hurt targeting accuracy, but **increasing target size eliminates most of the negative effect** — i.e., size compensates for turbulence better than any other single variable.
  - Physical/visual "guides" or anchor techniques (e.g. "Braced Touch," using a second finger as a stabilizing anchor) further improve accuracy in vibration, but are a UI pattern beyond standard button sizing. [Nottingham repository: Target size guidelines for flight deck displays](https://nottingham-repository.worktribe.com/OutputFile/757850), [ResearchGate: Turbulent Touch](https://www.researchgate.net/publication/316705912_Turbulent_Touch_Touchscreen_Input_for_Cockpit_Flight_Displays), [Braced Touch](https://link.springer.com/chapter/10.1007/978-3-030-26601-1_4)
- **Implication for Avionix**: any control that changes aircraft state (autopilot mode buttons, transponder mode, radio frequency swap) should target **at minimum ~15mm (≈44-48pt at typical mobile DPI, consistent with Apple's 44pt / Material's 48dp minimums) and ideally closer to 20mm** for primary flight-critical controls, not just platform-minimum tap targets.

### Thumb reach / bottom navigation
- NN/g testing found ~96% tap accuracy in the bottom-screen thumb zone vs. ~61% in the top corners. On large modern phones (6.7"+), far corners are effectively "impossible zone." Bottom navigation (vs. top hamburger/sidebar) is the thumb-friendly default. [Parachute Design: Thumb Zone Guide](https://parachutedesign.ca/blog/thumb-zone-ux/), [Alphonso Labs: Sticky Header vs Bottom Nav](https://www.alphonsolabs.com/sticky-header-bottom-navigation-mobile/)
- This reinforces ForeFlight's own choice of bottom tab bar over sidebar even on iPad.

---

## 4. Onboarding for device pairing (Sonos, Philips Hue, Elgato Stream Deck, OBS remote)

- **Sonos**: one-touch sync setup — app auto-detects hardware on the local network, walks through Wi-Fi handoff, minimal required decisions. Design relies on a clean black-and-white UI with few steps and clear sequential instructions; reviewers specifically call out "the onboarding/set up process was easy to follow." [DesignRush: Sonos app](https://www.designrush.com/best-designs/apps/sonos-app-stands-out-for-its-easy-navigation-clean-interface), [Engadget: Sonos setup](https://www.engadget.com/2259348/how-to-set-up-sonos-speakers-using-app/)
- **Philips Hue**: a clearly staged flow — **Discover → Pair → Configure**. Auto-discovery is primary; a **QR code** on the hardware is the fallback/accelerant for instant pairing without waiting on network discovery; a manual "Add manually" / "Search again" escape hatch exists when auto-discovery fails; a physical button press on the hardware is the "proof of physical possession" security/intent gate. A persistent **progress tracker** shows the user where they are in multi-step onboarding. [LumaSync docs: Hue pairing](https://lumasync.app/docs/hue/pairing/), [dumbswitches: Hue pairing mode](https://www.dumbswitches.com/philips-hue-pairing-mode/)
- **Elgato Stream Deck Mobile / OBS remote**: automatic discovery that "just works" even on difficult networks (university Wi-Fi cited specifically), with a **manual pairing fallback** when auto-discovery fails. Known weakness reported by users: intermittent disconnects/reloads on some networks — a reminder that **reconnection UX matters as much as first-pairing UX**. [Elgato Stream Deck Mobile App Store listing](https://apps.apple.com/us/app/elgato-stream-deck-mobile/id1440014184), [OBS forum: Stream Deck wireless](https://obsproject.com/forum/threads/elgato-stream-deck-wireless.141434/)

**Cross-product pattern for effortless pairing** (synthesized from all four):
1. Auto-discovery is the default path; manual/QR fallback always exists and is easy to find, not buried.
2. A **visible progress indicator** reduces anxiety during multi-step pairing ("where am I in this process").
3. A **physical/explicit confirmation gesture** on the host side (press a button, see your PIN/IP match) builds trust that the correct device is being paired — relevant for Avionix's X-Plane connector, where showing the sim-side IP/plugin confirmation (not just "connected ✓") builds the same trust.
4. **Reconnection** after a dropped link needs to be as polished as first pairing — this is where Stream Deck's user complaints concentrate, and where ForeFlight/Stratus complaints concentrate too. Treat "reconnect UX" as a first-class design problem, not an edge case.

---

## 5. Expo SDK options

| Module | Purpose | Native module / new dev build required? |
|---|---|---|
| `expo-haptics` | iOS Taptic Engine / Android Vibrator wrapper (impact, notification, selection feedback) | **Yes** — native module, not available in Expo Go for custom dev clients beyond what's prebuilt; requires a dev build if not already included. Not supported on web. [LogRocket: Haptic feedback RN](https://blog.logrocket.com/customizing-haptic-feedback-react-native-apps/) |
| `expo-font` (+ custom font with tabular/`tnum` figures) | Load custom fonts; pair with a monospaced-numeral font for jitter-free live readouts | No native module beyond standard Expo font loading; safe in managed workflow. |
| `expo-screen-orientation` | Lock/control device orientation (e.g. lock to landscape for instrument panels) | **Yes** — has a config plugin; properties that affect native behavior require a new build; a known GitHub issue shows it can throw "Cannot find native module" if not properly prebuilt. [GitHub issue #26334](https://github.com/expo/expo/issues/26334), [Expo docs: ScreenOrientation](https://docs.expo.dev/versions/latest/sdk/screen-orientation/) |
| `expo-navigation-bar` | Control Android's native nav bar (color, visibility) — e.g. hide for immersive instrument view | **Android-only, native module** — requires dev build (not in Expo Go). [Expo docs: NavigationBar](https://docs.expo.dev/versions/latest/sdk/navigation-bar/) |
| `expo-system-ui` | Root view background color, status bar, global appearance/tint, system nav bar baseline | Lighter-weight native module; generally safe but still a native module — confirm with a dev build before relying on it for the "no white flash on dark-mode launch" look. [GitHub RFC #14286](https://github.com/expo/expo/discussions/14286) |
| `expo-keep-awake` | Prevent screen sleep while a flight panel is open | Native module but simple/stable; widely used, hook-based (`useKeepAwake()`), can be scoped per-screen via navigation focus. [Expo docs: KeepAwake](https://docs.expo.dev/versions/v54.0.0/sdk/keep-awake.md) |

**Takeaway**: all five beyond `expo-font` require native modules — i.e., if Avionix is currently running in Expo Go, adopting haptics, orientation lock, Android nav-bar control, or system-ui theming means moving to (or confirming it's already on) a **custom dev build / EAS build**, not Expo Go. This should be sequenced as an early infrastructure decision, not discovered mid-feature.

---

## Top 12 recommendations for Avionix (ranked, with evidence)

1. **Every command sent to X-Plane shows a "pending" state until read-back confirms it — never an instant optimistic flip.** This matches the IoT "ghost state" pattern (antovoda) and is consistent with Avionix's own recent fixes (disabling a toggle while its watch waits, keying read-back by unit). Apply this as a *standing rule* for all panels (autopilot, radios, transponder), not case-by-case. [Optimistic UI / Positive UI](https://antovoda.medium.com/optimistic-ui-positive-ui-966b92b67e1d)

2. **Make reconnection UX, not just first-pairing UX, a first-class design target.** Every reviewed precedent (ForeFlight/Stratus, Stream Deck Mobile) shows users' worst complaints cluster around *silent* or *unclear* disconnects during use, not initial setup. Design an explicit "reconnecting…" state distinct from "disconnected" and "connected," and never let a dropped connection look identical to "still working." [PilotsOfAmerica thread](https://www.pilotsofamerica.com/community/threads/foreflight-stratus-losing-connection-gps-position-marker-lag.119905/), [OBS forum: Stream Deck wireless](https://obsproject.com/forum/threads/elgato-stream-deck-wireless.141434/)

3. **Size flight-critical touch targets at ~15–20mm, not just platform minimums.** Research shows target size is the single biggest compensator for turbulence/vibration-degraded accuracy, more effective than other mitigations. Apply the larger end of that range (~20mm) to autopilot mode buttons, transponder mode changes, and radio frequency swap — the actions most likely to be touched in rough air. [Nottingham: Target size guidelines](https://nottingham-repository.worktribe.com/OutputFile/757850)

4. **Use haptics (impact for commands, notification-success/error for confirm/fail) on every control that writes to the sim**, primed in advance to avoid latency, so pilots get tactile confirmation when visual attention is on the panel or outside. [Hacking with Swift: UIFeedbackGenerator](https://www.hackingwithswift.com/example-code/uikit/how-to-generate-haptic-feedback-with-uifeedbackgenerator)

5. **Keep a persistent, glanceable connection-status element (not a toast) always visible**, modeled on ForeFlight's Devices/Status pattern: a compact always-on indicator, one tap away from a detail view (link quality, last-seen, IP/host). Errors that block a command must be inline/persistent, never a vanishing toast. [NN/g: Indicators, Validations, Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)

6. **Adopt discovery-first pairing with a manual/QR fallback and a visible multi-step progress indicator**, following the Hue/Sonos/Stream Deck pattern: auto-discover the X-Plane plugin on the LAN, fall back to manual IP entry, and show a simple stepper ("Searching → Found → Connecting → Paired") so the user always knows where they are. [LumaSync: Hue pairing](https://lumasync.app/docs/hue/pairing/), [Engadget: Sonos setup](https://www.engadget.com/2259348/how-to-set-up-sonos-speakers-using-app/)

7. **Require explicit confirmation only for irreversible/safety-relevant actions** (e.g., autopilot disengage, transponder EMERGENCY/7700, IDENT during non-standard contexts), following Apple HIG + Material 3: plain-language dialog title that echoes the action, primary action clearly labeled (not a generic "Are you sure?"), Cancel always present and never the emphasized default. Don't add confirmation friction to routine, reversible toggles. [Apple HIG alerts](https://github.com/sankalpaacharya/apple-human-interface-skills/blob/main/references/components/alerts.md), [Material Design: Confirmation](https://m2.material.io/design/communication/confirmation-acknowledgement.html)

8. **Favor SkyDemon's "glance, don't stare" philosophy over ForeFlight's density** for Avionix's instrument/radio panels — SkyDemon is explicitly praised for being less overwhelming and reducing workload to "glance and correct," which matches Avionix's cockpit-remote use case (quick checks, not sustained study) better than a data-dense EFB screen. [iPad Pilot News: SkyDemon review](https://ipadpilotnews.com/2026/03/skydemon-offers-simple-vfr-only-app-experience-is-it-enough-for-us-pilots/)

9. **Keep bottom tab-bar navigation (not a sidebar), with graceful collapse under rotation/split-view**, mirroring ForeFlight's adaptive tab bar (collapsing to "More" + a "Dynamic" last-used tab) and backed by NN/g's 96%-vs-61% thumb-zone accuracy data. This applies across phone and tablet, portrait and landscape. [ForeFlight: Tab Bar Changes](https://foreflight.com/enhancements/more-menu-tab-bar-changes), [Parachute Design: Thumb Zone](https://parachutedesign.ca/blog/thumb-zone-ux/)

10. **Ship a true night mode, not just "dark theme"**: an explicit auto day/night transition tied to local time (or manual override), preserving high-contrast digits/labels against a darkened background rather than simply inverting colors — directly modeled on ForeFlight's night-vision-preserving dark theme. [ForeFlight: Day/Night Auto Transition](https://foreflight.com/support/video-library/watch/?v=daynight-auto-transition&list=whats-new)

11. **Use tabular/monospaced numerals for every live-changing readout** (altitude, heading, frequencies, squawk code) so digits don't visually jitter as values change — pair with `expo-font` loading a font with `tnum` support; also verify Dynamic Type scaling doesn't break instrument layouts, since React Native does not auto-bridge iOS Dynamic Type and this must be explicitly tested. [GitHub react-native#51915](https://github.com/facebook/react-native/issues/51915)

12. **Treat `expo-haptics`, `expo-screen-orientation`, `expo-navigation-bar`, and `expo-system-ui` as native-module dependencies requiring a dev build**, and sequence that infrastructure decision early rather than discovering it mid-feature; `expo-font` and `expo-keep-awake` are safer/lighter additions that can land first. [Expo docs: ScreenOrientation](https://docs.expo.dev/versions/latest/sdk/screen-orientation/), [Expo docs: NavigationBar](https://docs.expo.dev/versions/latest/sdk/navigation-bar/)
