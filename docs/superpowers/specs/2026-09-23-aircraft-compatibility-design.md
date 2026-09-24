# Aircraft identification and compatibility — design

Feature: `F-03` (roadmap Stage 1, sub-project 2). Spec date: 2026-09-23.
Source: [docs/roadmap/features/F-03-aircraft-compatibility.md](../../roadmap/features/F-03-aircraft-compatibility.md).
Builds on: F-01 (connection foundation), F-02 (connection health, spec
[2026-09-23-connection-health-design.md](2026-09-23-connection-health-design.md)).

## Goal

Avionix works out which aircraft is loaded, picks the matching set of DataRef and command names,
checks at connect time which of those names actually exist, and shows per feature whether it is
available, partly available or unavailable — naming what is missing. No control in the app is
offered for a name that is not there, and no value is drawn from a name that did not resolve.

## Why this now

Stage 1's second sub-project, before any gauge is drawn, because every panel after it needs to
know which names to use and whether they are present.

- Complaint #3 in `research/competitors.md` is breakage after simulator or add-on point releases,
  **often silent**: GoFlight profiles for the Zibo 737 died when a point release renamed the
  heading dial, and again at Zibo 3.29. The documented fix is a versioned mapping layer plus a
  clear in-app message when a mapped name is missing.
- Complaint #11 is staleness visible to buyers; the answer is a compatibility statement the user
  can see and share per X-Plane release.
- Praise #8 is broad aircraft coverage, treated as the main differentiator; AirFMC is criticised
  for having no per-aircraft auto-detection at all. Automatic identification with a visible
  compatibility report is a thing no researched competitor documents.

The dependent features (F-04, F-10, F-11, F-20, F-21, F-22) each add their bindings to a profile;
if the profile mechanism arrives after them, every one of them hardcodes names and is rewritten.

## Scope

**In.** Identifying the loaded aircraft at connect and whenever it changes. A versioned profile
per aircraft, with a generic Laminar-default profile as the fallback and deterministic automatic
selection. Probing every name a profile declares, recording per-name outcomes including
write-capability. Deriving per-feature availability and rendering it. Re-identifying and
re-probing after an aircraft change, a reconnect or a simulator restart, plus a manual re-check.
Recording an add-on version where the aircraft publishes one, and warning when it is outside what
the profile was written for.

**Out.** The panels themselves and how each one renders a degraded state (F-04 and each panel
feature). User-authored bindings and profiles (F-06). Downloading profiles from a network source.
Zibo or any other add-on mapping content (Stage 4, F-50/F-51). Manual profile override — see
"Deliberately not done".

## Architecture

### Four phases per connect

Resolution in `SimulatorSession.completeSessionSetup` is replaced by an ordered pipeline:

1. **Readiness gate.** `getDataRefCount()`. Zero means no flight is loaded: hold for readiness
   exactly as F-02 already does, and issue no probes at all. This replaces `explainLookupMiss`,
   which inferred the same fact after a failed lookup. One request answers it before any name is
   tried, and the request is wrapped in `timed()` so it doubles as a round-trip sample.
2. **Identify.** Resolve and read the three identification DataRefs. Every one is optional: a miss
   is recorded, never fatal.
3. **Select.** Deterministic profile selection from the identification result.
4. **Probe.** Resolve every binding the selected profile declares, with bounded concurrency, and
   record per-binding `ok` / `missing` / `readOnly`. Derive per-feature availability from that.

A binding miss never fails a connect. This is a deliberate change from F-01/F-02, where a missing
MVP DataRef failed the whole flow at the `resolution` step. Under R5 and R6 the link is healthy
and it is the *feature* that is degraded; failing the connection would hide every feature that
does work. The connect still fails on transport errors, capabilities, the WebSocket and the
subscription, all unchanged.

Between phase 1 and phase 4 the flight can be unloaded again. If every binding misses, the count
is read a second time; zero means the flight went away mid-probe and the session holds for
readiness. A non-zero count with everything missing is a compatibility result, not a failure: the
profile does not fit this aircraft, and the view says so per feature.

### Identity is read once, then derived from the stream

The three identification names are `data`-typed DataRefs carrying base64 text:

| Field | DataRef |
|---|---|
| ICAO type code | `sim/aircraft/view/acf_ICAO` |
| Description | `sim/aircraft/view/acf_descrip` |
| Tail number | `sim/aircraft/view/acf_tailnum` |

All three are community convention, not confirmed against a Laminar-authored document. They are
treated exactly as F-02 treats `sim/time/paused`: optional, and their absence degrades the message
rather than breaking a feature. If all three miss, identification is `unavailable`, the generic
profile is selected as the fallback, and the compatibility view says X-Plane did not report the
aircraft (R2).

They are also **subscribed** along with the feature DataRefs. Updates are delta-only, so three
static strings cost one message at subscribe time and nothing afterwards — and a change in any of
them is the aircraft-changed event the Web API does not otherwise provide (R8). Identification
after the first connect therefore needs no HTTP at all: the values are already in `telemetry`.

A `data` value is decoded by `decodeDataRefString`, which base64-decodes to bytes, decodes those
as UTF-8, and cuts the string at the first NUL (X-Plane pads its string DataRefs). Decoding is
driven by the descriptor's `valueType`, never guessed from the shape of the string.

### Profiles are the single binding registry

`src/application/mvp-bindings.ts` is deleted. Its contents become the generic profile, which is
the one place a name appears:

```ts
export interface BindingSpec {
  kind: 'dataref' | 'command';
  name: string;
  /** false: the feature still works without it, with less. */
  required: boolean;
  /** The feature writes to it, so a read-only resolution is a miss (R9). */
  write?: boolean;
  /** What it does, in the pilot's words, for the missing-item list (R7). */
  purpose: string;
}

export interface FeatureSpec {
  id: string;
  label: string;
  bindings: readonly BindingSpec[];
}

export type MatchRule = { kind: 'generic' } | { kind: 'icao'; codes: readonly string[] };

export interface AircraftProfile {
  id: string;
  name: string;
  version: string;
  match: MatchRule;
  /** DataRef carrying the add-on's own version string, when it publishes one (R12). */
  addOnVersionDataRef?: string;
  /** Add-on versions this profile was written against (R12). */
  testedWith?: readonly string[];
  features: readonly FeatureSpec[];
}
```

The generic profile (`avionix.generic`, version `1.0.0`, `match: { kind: 'generic' }`) declares the
three features the app has today:

| Feature id | Label | Bindings |
|---|---|---|
| `connection-health` | Connection health | `sim/time/total_running_time_sec` (required), `sim/time/paused` (optional) |
| `flight-telemetry` | Live telemetry | `sim/cockpit2/gauges/indicators/airspeed_kts_pilot` (required) |
| `heading-control` | Heading control | `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot` (required, write), `sim/autopilot/heading_up` command (required) |

Feature ids are strings with exported constants. A surface asks
`featureStatus(compatibility, FEATURE_HEADING_CONTROL)`, which answers `unknown` when the selected
profile does not declare that feature at all — so a future named profile that omits a feature
degrades the surface instead of crashing it.

Connection health binds to `sim/time/*`, which is simulator-global: no aircraft, however exotic,
can rename it. That is why F-02's `HealthMonitor` may keep importing those two names directly
instead of going through a per-profile lookup.

### Availability

```ts
export type BindingStatus = 'ok' | 'missing' | 'readOnly';
export type FeatureStatus = 'available' | 'partial' | 'unavailable' | 'unknown';
```

Per feature, in order: any **required** binding `missing` or `readOnly` → `unavailable`; otherwise
any **optional** binding missing → `partial`; otherwise `available`. A feature with no recorded
results at all → `unknown`. `readOnly` counts only for a binding declared `write: true` (R9).

`FEATURE_STATUS_LABEL` is the single source of the words shown: `available` → "available",
`partial` → "partly available", `unavailable` → "not available on this aircraft", `unknown` →
"not checked yet".

### Write capability

`DataRefDescriptor.isWritable` is undocumented and absent before X-Plane 12.4.3. Three cases:

- `false` on a binding declared `write: true` → `readOnly`; the owning feature is unavailable and
  the control is inert, so the app never sends a write X-Plane will reject (R9).
- `true` → `ok`.
- absent → `ok`, and `compatibility.writabilityReported` is false. The compatibility view then says
  this X-Plane version does not report write capability, so a control may still be refused.

Refusing to offer a control because an older simulator declines to answer the question would break
working setups to prevent a failure the app already handles — the opposite trade.

### Aircraft change, reconnect and manual re-check

An identification value arriving over the stream that differs from the identity on record marks
the aircraft as changed. The session then re-runs identify → select → probe on the **same open
connection**, debounced by 250 ms so a burst of three updates causes one re-check, and guarded by
the session generation like every other async flow in the file. The link state never leaves
`connected` (R8).

Subscriptions are then reconciled as a delta: ids that appeared are subscribed, ids that vanished
are unsubscribed. Re-subscribing everything would blank the telemetry for a frame; the client port
supports both directions, so the delta costs nothing.

A reconnect re-runs the whole pipeline, because DataRef ids are session-scoped and the aircraft may
have changed while the link was down.

`recheckCompatibility()` is the same pipeline on demand, behind a "Check again" button. It is the
recovery path after an add-on update mid-session — the exact scenario complaint #3 describes — and
a no-op unless the session is connected.

### Add-on version and the profile warning (R12)

A profile may name a DataRef carrying the add-on's own version string. When it does, the value is
read during identification and stored as `identity.addOnVersion`. `versionWarning(profile,
identity)` returns a sentence when the profile declares `testedWith` versions, an add-on version
was read, and it is not among them — otherwise `null`. The generic profile declares neither, so
the generic case is `null` by construction. It is a warning, never an error: the profile stays
selected and every binding that resolves still works.

## Session snapshot changes

```ts
export interface CompatibilitySnapshot {
  identity: AircraftIdentity;          // all fields null until identified
  identified: boolean;                 // false → the fallback reason shown in the view (R2)
  profileId: string;
  profileName: string;
  profileVersion: string;
  selection: 'matched' | 'fallback';   // why this profile (R3)
  testedWith: readonly string[];
  versionWarning: string | null;       // R12
  features: readonly FeatureAvailability[];
  bindings: Record<string, BindingResult | undefined>;  // by name, identification included
  writabilityReported: boolean;
  checkedAt: number | null;            // wall clock of the last completed probe (R11)
}
```

added to `SessionSnapshot` as `compatibility`. `checkedAt` is a fact; "not current" is derived in
presentation from `state !== 'connected'`, following F-02's facts-versus-derivation split rather
than storing a flag that can go stale.

`diagnostics.dataRefs` stays, and is now populated from the probe results, so F-02's diagnostics
screen and shareable summary keep working on any profile. The `BINDING_FEATURE` constant is
replaced by `bindingFeatureLabels(profile)`, which derives the same map from profile metadata —
which is what the comment in `mvp-bindings.ts` said F-03 would do.

`deriveActivity` gains one input: whether the heartbeat binding resolved. Connected with no
heartbeat binding yields `unknown` rather than `pausedOrStalled`, which would state something the
app cannot know.

## Surfaces

**Aircraft summary** (`AircraftSummary`), a row on the main screen above the telemetry panel:
identity in one line, profile name and version in the second, and the availability verdict —
"All features available", "2 features partly available", "1 feature not available on this
aircraft". Tapping it opens the compatibility view. When disconnected it shows the age of
`checkedAt` and says the result is not current (R11).

**Compatibility view** (`CompatibilityScreen`), toggled like the diagnostics screen:

- *Aircraft*: type code, description, tail number, add-on version — or "X-Plane did not report
  which aircraft is loaded" when identification found nothing (R2).
- *Profile*: name, version, why it was selected, what it was tested with, and the version warning
  when there is one (R3, R12).
- *Features*: one row per feature, its status label, and beneath it every missing binding as
  `<purpose> — <name> — not present on this aircraft` or `— read-only on this aircraft` (R7).
- The write-capability note when `writabilityReported` is false.
- "Check again", enabled only while connected (R8).

**Control gating.** `ControlPanel` enables its buttons only when `heading-control` is `available`;
otherwise they are disabled and a line names why, from the missing-binding list. `TelemetryPanel`
shows "not available on this aircraft" in place of a value whose binding did not resolve, instead
of a dash that looks like missing data (R6).

**Shareable summary.** `formatDiagnosticsSummary` gains an Aircraft block: identity, profile and
version, and every feature with its status and missing names. This is the compatibility statement
complaint #11 asks for, in text the pilot can paste into a forum thread.

Nothing here renders `AvionixError.message`, a URL, an HTTP status or a pairing code. DataRef and
command names are not error text: naming them is the documented fix for complaint #3, and F-02's
diagnostics screen already prints them.

## File plan

| Path | Responsibility |
|---|---|
| `src/domain/simulator/dataref-string.ts` | base64 + UTF-8 + NUL-trim decode of a `data` value |
| `src/domain/aircraft/aircraft-identity.ts` | `AircraftIdentity`, `UNIDENTIFIED`, `identityLabel`, `sameAircraft` |
| `src/domain/aircraft/identity-datarefs.ts` | the three identification names |
| `src/domain/aircraft/profile.ts` | `BindingSpec`, `FeatureSpec`, `MatchRule`, `AircraftProfile`, `profileBindings` |
| `src/domain/aircraft/profile-selection.ts` | `ProfileCatalog`, `selectProfile` |
| `src/domain/aircraft/availability.ts` | `BindingStatus`, `BindingResult`, `FeatureStatus`, `MissingBinding`, `FeatureAvailability`, `deriveFeatureAvailability`, labels |
| `src/domain/aircraft/version-check.ts` | `versionWarning` |
| `src/domain/aircraft/profiles/generic.ts` | the generic profile, its names and feature id constants |
| `src/domain/aircraft/profiles/catalog.ts` | the bundled catalog |
| `src/application/compatibility.ts` | `CompatibilitySnapshot`, `initialCompatibility`, `featureStatus`, `bindingFeatureLabels` |
| `src/application/aircraft-probe.ts` | `identifyAircraft`, `probeBindings` (bounded concurrency) |
| `src/application/simulator-session.ts` | the pipeline, change detection, `recheckCompatibility`, subscription delta |
| `src/application/session-snapshot.ts` | `compatibility` on the snapshot |
| `src/application/health-monitor.ts` | heartbeat-availability input to `deriveActivity` |
| `src/application/diagnostics-summary.ts` | the Aircraft block; `bindingFeatureLabels` in place of `BINDING_FEATURE` |
| `src/features/aircraft/AircraftSummary.tsx` | the main-screen row |
| `src/features/aircraft/CompatibilityScreen.tsx` | the full view |
| `src/features/mvp/ControlPanel.tsx`, `TelemetryPanel.tsx` | availability gating |
| `src/application/mvp-bindings.ts` | **deleted** |

## Testing

- **Unit (domain):** decoding, including padded and empty values and a non-`data` type; identity
  helpers; selection over a fixture catalog (matched, fallback, unidentified, two matching
  profiles resolve deterministically); availability for every combination of required/optional and
  missing/readOnly; the version warning's four branches; a guard test that every generic-profile
  binding name is unique and every `purpose` is non-empty.
- **Unit (application):** `probeBindings` against a fake client — a miss is recorded not thrown, a
  read-only descriptor with `write: true` becomes `readOnly`, an absent `isWritable` becomes `ok`,
  and concurrency never exceeds the cap.
- **Integration (mock X-Plane):** identify → select → probe on connect; a missing required DataRef
  leaves the link connected with that feature unavailable; a read-only heading DataRef makes
  heading control unavailable; changing the tail number over the stream re-identifies and
  re-probes with no reconnect and no state change; count 0 issues no probes and holds for
  readiness; disconnect retains the compatibility result.
- **UI:** the summary's identified / unidentified / not-current states; the compatibility view's
  missing-binding lines; `ControlPanel` disabled with a reason; `tests/ui/error-text-guard.test.tsx`
  extended to the two new screens.
- The mock server gains `is_writable` on descriptors (real X-Plane 12.4.3 sends it), the two extra
  identification DataRefs, and the ability to add and remove a DataRef at runtime.

## Requirement coverage

| Req | Where |
|---|---|
| R1 identify on every connect | Phase 2 of the pipeline; `compatibility.identity` |
| R2 fallback, never blocks | All identification bindings optional; `identified: false`, `selection: 'fallback'` |
| R3 deterministic selection, visible | `selectProfile`; profile name, version and reason in the view |
| R4 session override | **Deferred** — see "Deliberately not done" |
| R5 resolve every declared name, no failed connect | Phase 4; a miss is a recorded result |
| R6 available / partial / unavailable, inert controls | `deriveFeatureAvailability`; `ControlPanel` and `TelemetryPanel` gating |
| R7 missing names in plain text | `MissingBinding.purpose` + name, in the view and the summary |
| R8 re-identify on aircraft change, no reconnect | Stream-driven change detection + `recheckCompatibility` |
| R9 non-writable marks the control unavailable | `readOnly` status for `write: true` bindings |
| R10 no flight loaded | Phase 1 readiness gate, F-02's hold unchanged |
| R11 last known result when disconnected | `checkedAt` retained; "not current" derived in the view |
| R12 versioned profiles, mismatch is a warning | `version`, `testedWith`, `versionWarning` |
| R13 no raw protocol text, nothing about tokens | No new route from `AvionixError` to a screen; guard test extended |

## Decisions and rationale

1. **Identification through DataRefs, not `GET /api/v3/aircraft`.** The REST resource is listed in
   Laminar's API index but its payload shape was never confirmed in the research. DataRefs go
   through transport, schema and error mapping this codebase already has, and a miss is an ordinary
   `null` rather than an unverified schema failing at runtime. The resource stays an open question.
2. **A missing binding degrades a feature, never the connection.** R5 and R6 say so, and it is the
   difference between "the app told me the autopilot panel needs a name this aircraft lacks" and
   "the app would not connect".
3. **Readiness is gated before probing, not inferred after it.** One count request instead of N
   failing lookups at the main menu, and `explainLookupMiss`'s inference disappears with it.
4. **The aircraft-changed event is the identification subscription.** The Web API publishes no such
   event; delta-only streaming of three static strings turns one into a free side effect, with a
   manual "Check again" as the guaranteed path when a simulator does not stream `data` values.
5. **Absent `isWritable` means writable.** Only an explicit `false` disables a control. The
   alternative breaks every setup on X-Plane older than 12.4.3 to avoid a rejected write that the
   error path already handles.
6. **`mvp-bindings.ts` is deleted rather than kept alongside profiles.** Two registries of the same
   names would drift, and the file's own comment named F-03 as its replacement.
7. **Connection health keeps its two names directly.** `sim/time/total_running_time_sec` and
   `sim/time/paused` are simulator-global; a per-profile indirection for names no aircraft can
   change would be machinery with no case to serve.

## Deliberately not done

- **Manual profile override (R4).** Only one profile ships, so a picker would offer one row and
  the override would be unreachable code. Automatic detection is the differentiator the research
  points at — AirFMC is criticised precisely for making the user choose. The override lands with
  the second profile, in Stage 4 (F-50). Until then a wrong selection is impossible: the fallback
  is the only outcome.
- **Marking individual readouts stale per feature.** F-04's half of the same requirement.
- **Profile downloads or updates out of band.** Profiles ship with the app; this is stated in the
  feature's own scope.
- **Add-on-specific mapping content.** Stage 4 owns Zibo; this spec ships the mechanism and one
  generic profile.

## Open questions

- The three `acf_` names remain unverified against a Laminar-authored document. The design assumes
  nothing from them: the smoke test's first new row is precisely whether they resolve on a real
  simulator, and the answer changes copy, not architecture.
- Whether X-Plane streams `data`-typed DataRefs over a subscription is confirmed only against the
  mock server and the API documentation. If a real simulator does not, automatic aircraft-change
  detection degrades to the manual re-check, which is why that button exists.
- How many bindings can be probed before the delay is visible. Six concurrent lookups over a LAN
  should keep a 60-name profile well under a second, but the number that matters is the one a real
  737 profile reaches in Stage 4.
