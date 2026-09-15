# CDU remote for the default X-Plane FMS

| Field | Value |
|---|---|
| ID | `F-32` |
| Stage | `2` |
| Category | Navigation |
| Status | Proposed |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 2 of 12 representative products (`research/competitors.md`). Wider set: 7 of 13 remote-panel and CDU products researched offer a remote CDU (WebFMC Pro, AirFMC, Flight Deck ONE / Flight Deck FMS, XPlaneCDU, X-CDU, XpRemotePanel, Remote X-Plane Avionics) |

## Summary

The pilot gets the default X-Plane FMS control display unit on a phone or tablet: the 16-line
screen exactly as the simulator draws it, with the same colours, fonts, reverse video, underline
and flashing, plus a working keyboard — line-select keys, alphanumerics, page keys and EXEC. Used
on the ground for programming and in the cruise for amendments, so the box can be worked on a
second device instead of on a popup covering the outside view.

## Why now

Stage 2, and the most-wanted panel in this market: 737 users rank "CDU/FMC remote control" above
every other panel (docs/roadmap/research/boeing-737-ecosystem.md), and it is the feature the Web
API supports cleanly for the default FMS, because Laminar publishes the screen as ordinary text
and style datarefs. F-31 and F-51 both build on the mirror and key-input model proved here.

## User stories

- As a pilot, I want the CDU screen on a tablet so that the simulator window stays free for the
  outside view, and I want to type a route and press EXEC there rather than with the mouse.
- As a pilot flying with a copilot device, I want CDU1 and CDU2 available separately so that two
  devices can work on different pages.
- As a pilot in an aircraft with no default FMS, I want the app to tell me that plainly rather
  than showing an empty black screen.

## Scope

### In scope
- A faithful mirror of the default FMS screen: 16 lines of 24 characters with per-character
  colour, font size, reverse video, underline and flashing as encoded by the simulator.
- Selectable CDU1 or CDU2.
- Key input: line-select keys (left and right, rows 1-6), letters, digits, punctuation and editing
  keys, page keys, and EXEC.
- Diff-only screen updates, and a visible indication when the screen is stale or unavailable.

### Out of scope (this feature)
- Any FMS logic of Avionix's own: it mirrors the screen and presses keys, nothing more.
- Loading a route from a file or a planning service (F-33) and any navdata lookup (F-34) — the Web
  API offers neither.
- A route/progress view derived from the plan (F-31).
- The Zibo 737 CDU and every other add-on FMS with non-standard datarefs (F-51, F-57).

## Functional requirements

R1. While connected with an aircraft that publishes the default CDU, the panel shows all 16 lines
of the selected CDU, refreshed from the subscription stream, with no line more than 1 s behind the
simulator.

R2. Per-character styling is decoded and rendered: font size, reverse video, underline, flashing
and the eight colours. Unknown bit combinations render as plain white rather than failing.

R3. Text lines arrive as byte data; the panel decodes them and never displays raw base64.

R4. Only lines whose text or style changed since the previous update are re-rendered.

R5. A key press activates its command exactly once. Presses are not coalesced, and a held key
does not repeat.

R6. Key-to-screen latency is budgeted: the resulting screen change appears within 500 ms on a
healthy LAN, and a slow-link indication appears when it does not.

R7. The pilot can switch between CDU1 and CDU2, a copilot-station pattern AirFMC already offers
(https://www.x-plained.com/utility-review-haversine-airfmc/).

R8. When the loaded aircraft does not publish the default CDU datarefs, the panel says so in
plain language, names the aircraft, and offers no keyboard, instead of a blank screen.

R9. A key command missing on the loaded aircraft disables and labels that key; the rest keep
working.

R10. On connection loss the last screen stays visible, is marked stale within 2 s, and the
keyboard is disabled until the session reconnects.

R11. A rejected key press produces one plain, non-blocking message; the screen never shows a
success that did not happen.

R12. Error text is plain language: raw protocol errors, dataref or command ids and status codes
never reach the UI, and pairing tokens are never logged.

## X-Plane Web API mapping

Screen text and style are ordinary datarefs, so they can be subscribed over the WebSocket at the
documented ~10 Hz; key input is ordinary command activation. Nothing here needs an endpoint the
Web API lacks. The command names below come from a community mirror of `Commands.txt` and are
marked unverified; they must be confirmed against the `Commands.txt` shipped with the simulator or
by a live command query before implementation.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| CDU1 screen text | `sim/cockpit2/radios/indicators/fms_cdu1_text_line0` .. `_line15` | byte/string, 24 chars per line | R | [1] |
| CDU1 character style | `sim/cockpit2/radios/indicators/fms_cdu1_style_line0` .. `_line15` | byte array; bit 7 large, 6 reverse, 5 flash, 4 underscore, bits 0-3 colour | R | [1] |
| CDU2 screen text and style | `sim/cockpit2/radios/indicators/fms_cdu2_text_line0..15`, `fms_cdu2_style_line0..15` | as above | R | [1] |
| Line-select keys | `sim/FMS/ls_1l` .. `ls_6l`, `ls_1r` .. `ls_6r` (unverified) | command | Activate | [2] |
| Alphanumeric keys | `sim/FMS/key_A` .. `key_Z`, `key_0` .. `key_9` (unverified) | command | Activate | [2] |
| Editing and punctuation | `sim/FMS/key_period`, `key_minus`, `key_slash`, `key_space`, `key_clear`, `key_delete`, `key_back`, `key_overfly` (unverified) | command | Activate | [2] |
| Page keys | `sim/FMS/fpln`, `legs`, `dep_arr`, `hold`, `prog`, `perf`, `index`, `menu`, `navrad`, `dir_intc`, `fix`, `data`, `next`, `prev` (unverified) | command | Activate | [2] |
| Execute | `sim/FMS/exec` (unverified) | command | Activate | [2] |
| Second CDU keys | `sim/FMS2/...` equivalents (unverified) | command | Activate | [2] |

## Aircraft compatibility

The `fms_cdu*` datarefs are Laminar's, available since X-Plane 11.35b5, and are published by
aircraft using the default FMS. Aircraft with their own FMS do not use them: the XPlaneCDU project
states that "the default X-Plane 737 does not support this, and every other payware aircraft uses
non-standard datarefs" (https://github.com/waynepiekarski/XPlaneCDU). F-03 decides whether this
panel is offered for the loaded aircraft; Zibo is F-51 and ToLiss F-57, each with its own
community-sourced mapping and breakage risk. Avionix will not screenshot or OCR the in-sim popup.

## Competitor evidence

- WebFMC is praised for an "effective communication protocol" that transmits only the CDU text
  that actually changed, keeping latency and bandwidth low — the diff-only requirement above.
  https://www.x-plained.com/utility-review-green-arc-studios-webfmc/
- Input lag is a live buyer concern: a forum thread asks directly whether there is input lag "when
  using this on an iPhone/iPad", and there are reports of "huge lag when triggering 777v2 key
  commands" before an aircraft update fixed it.
  https://forums.x-plane.org/index.php?%2Fforums%2Ftopic%2F175878-is-there-any-input-lag-when-using-this-on-an-iphoneipad%2F=
- XPlaneCDU users reported "very slow response when clicking CDU buttons and occasional issues
  with responsiveness". https://play.google.com/store/apps/details?id=net.waynepiekarski.xplanecdu
- AirFMC collects one-star reviews from users who did not realise a simulator is required —
  "completely worthless without a simulator game" — which argues for R8's explicit message.
  https://apps.apple.com/us/app/airfmc/id773310905

## Acceptance criteria

- [ ] Against the mock server, all 16 lines render with correct colours, font sizes, reverse
      video, underline and flashing; only changed lines are re-rendered.
- [ ] A key press activates exactly one command; a rejected command shows one plain message.
- [ ] With the CDU datarefs absent from the mock, the panel shows the "no default FMS" message and
      no keyboard.
- [ ] Dropping the socket marks the screen stale within 2 s and disables the keyboard.
- [ ] On a real simulator, entering an origin and destination on the tablet produces the same
      screen as the in-sim CDU, and EXEC behaves identically.
- [ ] No raw protocol text appears in the UI; logs contain no token.

## Risks and open questions

1. Every `sim/FMS/...` command name above is community-sourced and unverified; the full key set,
   and the exact `sim/FMS2/...` naming, must be confirmed against `Commands.txt`.
2. Whether key commands go over REST or the WebSocket, and with what duration value, has latency
   consequences (R6) that must be measured.
3. The ~10 Hz rate bounds how fast the mirror follows a fast typist; whether a short-lived local
   echo of the pressed key helps or misleads is an open product question.
4. Byte/string datarefs arrive base64-encoded; line length, padding and trailing-null handling
   need checking against a live screen.
5. Whether CDU2 exists and is populated on default aircraft, and whether both CDUs can be
   subscribed at once without noticeable cost, is unverified.

## References

1. https://developer.x-plane.com/article/datarefs-for-the-cdu-screen/
2. http://www.dmax3d.com/resources/commands.php (community mirror of Laminar's `Commands.txt`;
   every command name taken from it is marked unverified)
3. https://developer.x-plane.com/article/x-plane-web-api/
4. https://github.com/waynepiekarski/XPlaneCDU
5. docs/roadmap/research/fmc-cdu-apps.md, docs/roadmap/research/xplane-web-api.md
