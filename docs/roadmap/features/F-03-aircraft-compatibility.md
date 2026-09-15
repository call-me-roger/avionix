# Aircraft identification and compatibility layer

| Field | Value |
|---|---|
| ID | `F-03` |
| Stage | `1` |
| Category | Platform |
| Status | Proposed |
| Depends on | `F-01` |
| Competitor prevalence | Matrix count 3 of 12 representative products (`research/competitors.md`). Wider set: 8 of 13 remote-control and panel products researched ship per-aircraft profiles or aircraft-specific packs (Air Manager, XP Remote, XpRemotePanel, AirFMC, WebFMC, XPlaneCDU, Flight Deck ONE, Stream Deck profile packs); none documents automatic aircraft detection with a visible compatibility report, and AirFMC is explicitly criticised for having no per-aircraft auto-detection |

## Summary

When the pilot loads an aircraft, Avionix works out what it is, selects the matching set of
DataRef and command names, checks at connect time which of those names actually exist, and shows
which features are fully available, partly available or unavailable on this aircraft. Nothing in
the app silently shows a dead value or sends a control that goes nowhere.

## Why now

Stage 1, alongside the panel framework, because every panel after it needs to know which names to
use and whether they are there. The 737 research shows why: tools built on hand-kept mapping files
break on add-on point releases, GoFlight profiles stopped working when Zibo renamed the heading
dial and again at Zibo 3.29, and the community keeps threads open purely to track dataref churn.
The documented fix is a versioned mapping layer plus a clear in-app message when a mapped name is
missing, rather than hardcoded names failing silently.

## User stories

- As a simmer loading the Zibo 737, I want the app to recognise it and offer the right panels so
  that I do not pick a profile by hand.
- As a simmer who just updated an add-on, I want the app to tell me a control has moved instead of
  quietly doing nothing when I press it.

## Scope

### In scope
- Identifying the loaded aircraft at connect and whenever it changes: type code, description and
  tail number where available.
- A named, versioned profile per supported aircraft holding the names each feature needs, plus a
  generic Laminar-default profile as the fallback; selection is automatic from the identification
  result, with a manual override the user can pin for the session.
- Probing every name a selected profile declares at connect time, and deriving per-feature
  availability: available, partly available (missing items named), or unavailable.
- A compatibility view: aircraft identified, profile and version in use, and the availability of
  each feature with reasons.
- Re-running identification and probing after an aircraft change, a reconnect or a simulator
  restart, because ids are session-scoped.
- Reporting write-capability where the simulator exposes it, and recording the add-on version when
  the aircraft exposes one, so a profile can be pinned to it.

### Out of scope (this feature)
- The panels themselves and how they show a degraded state (`F-04` and each panel feature).
- User-authored bindings and profiles (`F-06`).
- Downloading or updating profiles from a network source; profiles ship with the app for now.
- Any Zibo-specific mapping content, which belongs to the Stage 4 features (`F-50`, `F-51`).

## Functional requirements

R1. On every successful connect the app identifies the loaded aircraft and stores type code,
description and tail number when those are readable.
R2. If identification fails or returns nothing, the app falls back to the generic profile and says
so in the compatibility view; it never blocks the connection.
R3. Profile selection is deterministic: a named profile whose match rule fits the identification,
otherwise the generic profile. The selection and its version are visible.
R4. The user can override the selected profile for the session; the override survives a reconnect
and is cleared when the aircraft changes.
R5. At connect the app resolves every name the selected profile declares and records the result
per name, without failing the connection when some are missing.
R6. A feature is available only if all its required names resolved, partly available if optional
names are missing, unavailable if a required name is missing. An unavailable feature is never
offered as if it worked: its controls are inert and labelled with the reason.
R7. The compatibility view names the missing DataRefs and commands per feature in plain text.
R8. When the aircraft changes during a session, the app re-identifies, re-selects, re-probes, and
updates availability without the user reconnecting.
R9. A name that resolves but is not writable marks any control bound to it as unavailable rather
than allowing a write that will be rejected.
R10. When no flight is loaded, identification is deferred and the compatibility view says the
simulator is not ready, consistent with `F-02`.
R11. When disconnected, the compatibility view shows the last known result with its timestamp and
marks it as not current.
R12. Profiles are versioned and the version is shown; a profile can declare which add-on versions
it was tested against, and a mismatch is surfaced as a warning, not an error.
R13. No raw protocol error text is shown, and nothing about pairing or tokens appears here.

## X-Plane Web API mapping

Identification and probing happen once per connect and per aircraft change, not continuously, so
the 10 Hz subscription budget is unaffected. Probing uses name lookups, which the API supports by
filter; a miss returns a not-found error rather than an empty success.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Aircraft type code | `sim/aircraft/view/acf_ICAO` (unverified) | string | Read | Community convention; not found in a Laminar-authored source in docs/roadmap/research/xplane-web-api.md — verify in `Resources/plugins/DataRefs.txt` |
| Aircraft description | `sim/aircraft/view/acf_descrip` (unverified) | string | Read | Community convention; verify in `DataRefs.txt` |
| Tail number | `sim/aircraft/view/acf_tailnum` (unverified) | string | Read | Community convention; verify in `DataRefs.txt` |
| Add-on version marker | not identified; verify in DataRefs.txt | varies by add-on | Read | Add-on specific; Zibo publishes its own list as `B738_Datarefs.txt` per docs/roadmap/research/boeing-737-ecosystem.md |
| Alternative identification | `GET /api/v3/aircraft` resource | JSON | Read | https://developer.x-plane.com/docs/web-apis/ (listed as a resource group; shape not verified) |
| Name probe | `GET /api/v3/datarefs?filter[name]=<name>` | JSON | Read | docs/xplane.md |
| Command probe | `GET /api/v3/commands?filter[name]=<name>` | JSON | Read | docs/xplane.md |
| Writability | `is_writable` on the DataRef descriptor | boolean | Read | docs/xplane.md (undocumented but observed on 12.4.3) |
| Flight loaded check | `GET /api/v3/datarefs/count` | int | Read | docs/xplane.md |

The three `acf_` names above are the intended identification source but are not confirmed against
a Laminar-authored document in the research; all three must be checked in `DataRefs.txt` or by a
live name query before implementation, and the `/aircraft` REST resource evaluated as the
alternative.

## Aircraft compatibility

This feature is the compatibility mechanism, so it must behave on anything. The generic profile
uses Laminar `sim/...` names only and is the guaranteed baseline on default aircraft; add-ons that
reuse those names inherit it. Add-ons with their own namespaces, notably the Zibo 737 under
`laminar/B738/...`, need a named profile, defined by the aircraft-specific features and explicitly
community-sourced and version-fragile.

## Competitor evidence

- GoFlight profiles for the Zibo 737 broke when a point release renamed the heading-dial dataref,
  and the GF-166 modules stopped working at Zibo 3.29 —
  https://www.pollypotsoftware.org.uk/vanillaforums/discussion/655/zibos-boeing-b738-800-mcp-pro-efis-2xgf166-lgt-ii-requires-git-1-8-2-0-for-x-plane
- Dedicated forum threads exist purely to track Zibo dataref churn and request new datarefs —
  https://forums.x-plane.org/forums/topic/316935-the-problem-of-dataref-in-zibo-737/ and
  https://forums.x-plane.org/forums/topic/184978-zibomod-datarefs-questions-and-requests-new-datarefs-availability-requested/
- XP Remote's release notes warn users to update the bridge plugin after X-Plane 12.4.1 to avoid
  crashes, the same breakage pattern one layer down —
  https://www.planetcoops.com/apps/xp-remote
- AirFMC offers several colour schemes but no automatic scheme-per-aircraft detection, which the
  review flags as avoidable friction —
  https://www.x-plained.com/utility-review-haversine-airfmc/
- Flight Deck ONE advertises 70+ supported aircraft, setting the breadth expectation, though its
  review base is too thin to confirm quality —
  https://apps.apple.com/us/app/flight-deck-one/id6742143273

## Acceptance criteria

- [ ] Mock server: identification returns a known type and the matching profile is selected, with
      profile and version shown.
- [ ] Mock server: make a required name unresolvable and confirm the owning feature reports
      unavailable, names the missing item and exposes no live control.
- [ ] Real simulator: default Cessna and one airliner both identify and resolve the generic
      profile fully; disconnect and confirm the last result is shown and marked not current.

## Risks and open questions

- The three `acf_` identification names are unverified; if they are absent or unreadable over the
  Web API, the fallback is unclear. The `/aircraft` REST resource is listed in the API overview but
  its shape was not confirmed.
- There is no event for "aircraft changed"; detecting it may mean watching an identification value
  whose update behaviour on aircraft load is unknown.
- How many names can be probed per connect before the delay shows? A full 737 panel set could
  declare hundreds.
- Where do named profiles live so they can be corrected between app releases? Left open here.

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. https://developer.x-plane.com/docs/web-apis/
3. docs/xplane.md, docs/architecture.md
4. docs/roadmap/research/xplane-web-api.md, boeing-737-ecosystem.md, panel-builders.md,
   remote-control-apps.md, fmc-cdu-apps.md
5. https://www.pollypotsoftware.org.uk/vanillaforums/discussion/655/zibos-boeing-b738-800-mcp-pro-efis-2xgf166-lgt-ii-requires-git-1-8-2-0-for-x-plane
6. https://forums.x-plane.org/forums/topic/316935-the-problem-of-dataref-in-zibo-737/
7. https://forums.x-plane.org/forums/topic/184978-zibomod-datarefs-questions-and-requests-new-datarefs-availability-requested/
8. https://www.planetcoops.com/apps/xp-remote
9. https://www.x-plained.com/utility-review-haversine-airfmc/
10. https://apps.apple.com/us/app/flight-deck-one/id6742143273
