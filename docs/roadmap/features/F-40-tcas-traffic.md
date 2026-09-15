# TCAS traffic display

| Field | Value |
|---|---|
| ID | `F-40` |
| Stage | `3` |
| Category | Surveillance |
| Status | Proposed |
| Depends on | `F-13` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 4 of 8 map and instructor products researched show other traffic (Little Navmap, XMapsy, SimControlX, FS-FlightControl) |

## Summary

The pilot sees the other aircraft the simulator knows about — AI traffic, multiplayer and
plugin-injected traffic — around the ownship, with relative bearing, distance and relative
altitude, and a climb or descent indication. It is a traffic picture on a phone or tablet, used in
the terminal area and in the cruise, alongside the moving map of F-13.

## Why now

Stage 3 is situational awareness, and traffic is the cheapest large gain once the map exists:
X-Plane publishes the whole traffic picture as ordinary arrays, so no per-aircraft mapping is
needed. It is also thin on the ground in this market — only the desktop and instructor-station
tools researched show traffic at all, and none of the mobile EFBs studied shows *simulator*
traffic. It depends on F-13 for the ownship and the map.

## User stories

- As a pilot in a busy terminal area, I want nearby traffic with its relative altitude on a tablet
  so that I know what is around me without switching views in the simulator.
- As a pilot, I want the display to say clearly when there is no traffic so that I do not mistake
  an empty picture for a broken connection.

## Scope

### In scope
- A list and a relative-position picture of the other aircraft the simulator reports.
- Relative bearing, relative distance and relative altitude for each target, and whether it is
  climbing or descending.
- Target identity where published: flight identifier, ICAO type and transponder code.
- The number of targets currently reported, and an explicit "no traffic" state.
- A range selection so the picture stays readable on a phone.

### Out of scope (this feature)
- Injecting or creating traffic. Avionix reads the traffic datarefs; it never overrides them.
- Any resolution guidance or advice to the pilot. Avionix is not an anti-collision system.
- Real-world ADS-B or online-network traffic from outside the simulator.
- The 737 ND traffic overlay and other aircraft-specific displays (F-52).

## Functional requirements

R1. While connected, the display shows every target the simulator reports up to the documented
array size, refreshed from the subscription stream, no value older than 2 s.

R2. Each target shows relative bearing in degrees, relative distance converted to nautical miles
from the metres the simulator reports, and relative altitude converted to feet, with the sign
made explicit as above or below.

R3. Vertical trend is shown from the target's vertical speed, as climbing, descending or level,
with a stated threshold.

R4. Targets beyond the selected range are excluded from the picture but counted, so the pilot
knows traffic exists outside the view.

R5. The reported target count and the number of targets actually drawn agree, or the difference is
explained on screen.

R6. Identity fields are decoded from their byte arrays to text; an empty or undecodable value
shows as blank, never as raw base64.

R7. When the simulator reports no targets, the display says so explicitly rather than showing an
empty picture that could be mistaken for a failure.

R8. On connection loss the last picture stays visible, is marked stale within 2 s, and is visibly
not current. Traffic is never shown as live when it is not.

R9. When the traffic datarefs are unavailable on the connected simulator, the feature says so in
plain language and offers nothing else; it does not fabricate or interpolate targets.

R10. Error text is plain language: raw protocol errors, dataref ids and status codes never reach
the UI, and pairing tokens are never logged.

R11. The feature subscribes only to the 64-element arrays the current view needs.

## X-Plane Web API mapping

Every value is an ordinary dataref, including the arrays, and the Web API supports array and byte
datarefs over both REST and the WebSocket subscription. The documented ~10 Hz rate is more than a
traffic picture needs. One caveat is inherited from the research: these datarefs exist chiefly so
that plugins can *inject* traffic, and their readability over the Web API is **not independently
confirmed** — it must be verified against a running simulator before implementation
(docs/roadmap/research/xplane-web-api.md).

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Number of active targets | `sim/cockpit2/tcas/indicators/tcas_num_acf` | int | R | [1] |
| Relative bearing | `sim/cockpit2/tcas/indicators/relative_bearing_degs` | float[64], degrees | R | [1] |
| Relative distance | `sim/cockpit2/tcas/indicators/relative_distance_mtrs` | float[64], metres | R | [1] |
| Relative altitude | `sim/cockpit2/tcas/indicators/relative_altitude_mtrs` | float[64], metres, positive above | R | [1] |
| Vertical trend | `sim/cockpit2/tcas/targets/position/vertical_speed` | float[64], feet per minute | R | [1] |
| Target identity | `sim/cockpit2/tcas/targets/modeS_id` | int[64], 24-bit id | R | [1] |
| Flight identifier | `sim/cockpit2/tcas/targets/flight_id` | byte[512], 7 characters per target | R | [1] |
| Aircraft type | `sim/cockpit2/tcas/targets/icao_type` | byte[512] | R | [1] |
| Transponder code and mode | `sim/cockpit2/tcas/targets/modeC_code`, `ssr_mode` | int[64] | R | [1] |
| Alert state (see open questions) | `sim/cockpit2/tcas/indicators/tcas_alert`, `tcas_message`, `tcas_active_advisory`, `tcas_sensitivity` | int | R | [2] |
| Per-target threat level | `sim/cockpit2/tcas/targets/threat` | int[64] | R | [2] |
| Advisory vertical-speed bands | `sim/cockpit2/tcas/indicators/tcas_vs_bands` | float[6] | R | [2] |
| Traffic override (never written) | `sim/operation/override/override_TCAS` | int | R | [1] |

## Aircraft compatibility

The `sim/cockpit2/tcas` family is Laminar's and is not aircraft-specific, so the traffic picture
should work with any aircraft, including add-ons, without a per-aircraft mapping — this is the
rare surveillance feature that does not depend on F-03. What *is* aircraft-dependent is whether
the aircraft is equipped with TCAS at all in its own model, which affects the advisory datarefs
rather than the target arrays. Add-ons that override TCAS to inject their own traffic write to
these same datarefs, so the picture should follow them; this is unverified.

## Competitor evidence

- Little Navmap shows AI and multiplayer traffic on its map, and is the reference moving map for
  X-Plane users. https://github.com/albar965/littlenavmap
- XMapsy's differentiator is that it transmits AI traffic in addition to ownship position to EFB
  apps, i.e. traffic is a feature people add a bridge tool to get. https://xmapsy.com/
- FS-FlightControl bundles a TCAS gauge overview with its map, showing traffic is expected
  alongside a moving map rather than as a separate product.
  https://www.fs-flightcontrol.com/en/
- SimControlX offers AI traffic display on an iPad instructor station, which is the nearest mobile
  precedent found. https://apps.apple.com/us/app/simcontrolx/id1380341055

## Acceptance criteria

- [ ] Against the mock server, targets render with correct bearing, distance in nautical miles and
      relative altitude in feet, and the drawn count matches the reported count.
- [ ] Identity fields decode to text; a blank entry renders blank, never as base64.
- [ ] With zero targets, the explicit "no traffic" state appears.
- [ ] Dropping the socket marks the picture stale within 2 s.
- [ ] With the TCAS datarefs absent, the feature states that traffic is unavailable and shows
      nothing else.
- [ ] On a real simulator with AI traffic enabled, targets appear in plausible positions relative
      to the ownship and disappear when the traffic is removed.
- [ ] No raw protocol text appears in the UI; logs contain no token.

## Risks and open questions

1. Readability of the TCAS datarefs over the Web API is not independently confirmed. This must be
   settled with a live query before any UI work starts.
2. **TA/RA annunciation is an open question.** X-Plane generates traffic and resolution advisories
   only from 12.4.1, while Avionix supports 12.1.4 and newer, so the advisory datarefs may be
   absent or meaningless on supported versions. Whether Avionix annunciates advisories at all, and
   how it behaves on older simulators, is undecided.
3. Showing an advisory on a phone that the pilot may not be looking at raises a product question:
   does a companion app annunciate safety-adjacent information, or only display traffic?
4. Array indexing is undocumented for Avionix's purposes: whether index 0 is the ownship, and how
   gaps in the array are marked, must be checked on the sim.
5. Subscribing to several 64-element float arrays at the stream rate has a bandwidth cost on a
   phone that has not been measured.
6. Whether targets are drawn on the F-13 map or in a dedicated picture, and how ranges are chosen,
   is a layout question for F-04.

## References

1. https://developer.x-plane.com/article/overriding-tcas-and-providing-traffic-information/
2. https://developer.x-plane.com/article/tcas-resolution-advisories-and-plugin-traffic/
3. https://developer.x-plane.com/article/x-plane-web-api/
4. docs/roadmap/research/xplane-web-api.md, docs/roadmap/research/efb-moving-map.md,
   docs/roadmap/research/remote-control-apps.md
