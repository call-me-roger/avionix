# Transponder

| Field | Value |
|---|---|
| ID | `F-22` |
| Stage | `1` |
| Category | Control |
| Status | Proposed |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 2 of 15 products researched offer it (Comsquawk XP, Flight Deck ONE) |

## Summary

A transponder panel on the phone or tablet: the four-digit squawk code, the mode selector (OFF,
STBY, ON, ALT), and an IDENT control. Where the simulator provides it, the panel also shows the code
X-Plane's ATC has assigned, so the pilot can compare it with what is dialled in. It is used before
departure and whenever ATC reassigns a code.

## Why now

Stage 1. The transponder is part of the same job as the radios: it is what a pilot touches when
talking to ATC, and it is badly served today. Only two of the fifteen researched products expose it
at all, so covering it alongside F-21 closes a gap the market has left open, and it costs little
once the radio stack exists.

## User stories

- As a simmer, I want to set a squawk code on a keypad so that I can respond to a controller without
  leaving the outside view in the simulator.
- As a simmer using X-Plane's ATC, I want to see the code ATC assigned next to the code I have
  dialled so that I can tell at a glance whether they match.

## Scope

### In scope
- Display the current transponder code and mode, updated live.
- Enter a new four-digit code, review it before it is sent, and correct or cancel it.
- Select OFF, STBY, ON or ALT.
- Trigger IDENT and show that it was triggered.
- Display the ATC-assigned code when the simulator exposes it and show clearly when it differs from
  the dialled code, and say plainly when the transponder is unavailable on the loaded aircraft.

### Out of scope (this feature)
- TCAS traffic display and resolution advisories (F-40); the 737 transponder panel (F-54).
- Mode S extended modes beyond the four positions above; see the open questions.
- Any ATC communication or clearance handling; Avionix does not talk to X-Plane's ATC.

## Functional requirements

R1. Every displayed value comes from the subscription stream. A code or mode changed in the
simulator appears within two subscription intervals, about 200 ms at the documented 10 Hz.

R2. Code entry is staged: nothing is written until the pilot confirms, and the staged code is
visibly distinct from the code the simulator currently reports.

R3. Only four octal digits, 0 through 7, are accepted. An entry containing 8 or 9, or fewer than
four digits, is rejected with an explanation and nothing is written.

R4. After a write, the panel shows the value the simulator reports. If the simulator does not adopt
the value within a bounded time, the display reverts and the pilot is told the change did not take.

R5. IDENT is momentary. The panel shows that IDENT was sent; it does not claim the transponder is
identing for longer than the simulator reports.

R6. If the code dataref, the mode dataref or the IDENT command cannot be resolved for the loaded
aircraft, only that control is unavailable, with a short explanation naming the aircraft. A write
refused as read-only makes that control unavailable for the session in the same way.

R7. If the ATC-assigned code is not available, because the simulator is older than the version that
added it or the aircraft does not carry it, the comparison is simply absent. Its absence is never
presented as an error.

R8. While disconnected, all values are marked stale with the time of the last update, entry and mode
selection are disabled, and no staged code is queued or replayed on reconnect.

R9. On reconnect all names are resolved again before any value is shown, because ids are valid for
one simulator session only.

R10. Errors appear as plain sentences with a next step. Protocol codes, dataref ids, host addresses
and pairing tokens never appear in the UI and are never logged.

## X-Plane Web API mapping

Reads use the WebSocket subscription; writes use dataref writes and command activation. Transponder
state changes rarely, so 10 Hz is more than enough.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Squawk code | `sim/cockpit2/radios/actuators/transponder_code` (unverified) | int, four octal digits | Read/Write | [1], community-sourced via MobiFlight and SPAD.neXt docs |
| Mode selector | `sim/cockpit/radios/transponder_mode` (unverified) | int enum: 0 off, 1 standby, 2 on/Mode A, 3 alt/Mode C, 4 test, 5 GND Mode S, 6 TA-only, 7 TA/RA | Read/Write | [1], community-sourced, not confirmed against Laminar's list |
| ATC-assigned code | `sim/atc/transponder_assigned` (unverified) | int, four octal digits | Read | [1], [2] as reported in the 12.4.4 release notes; added in X-Plane 12.4.4 |
| IDENT | not identified; verify in `Commands.txt` | command | Write | — |

Every name in this table is community-sourced or reported through a search summary rather than read
from a Laminar-authored dataref list. All four must be confirmed against the in-sim `DataRefs.txt`
and `Commands.txt`, or a live `/datarefs` and `/commands` query, before implementation.

## Aircraft compatibility

Default aircraft are expected to use the standard transponder datarefs, subject to the verification
above. Add-ons with a custom transponder, including the Zibo 737, are likely to expose their own
names; the 737 pedestal transponder is F-54. F-03 decides which panel to offer. A transponder whose
names do not resolve is shown as unavailable with a reason, never hidden silently. The ATC-assigned
code requires X-Plane 12.4.4 or newer and is treated as an optional extra everywhere else, since
Avionix supports 12.1.4 as its minimum.

## Competitor evidence

- A 2025 iOS entrant exists purely as "a sidecar app for iOS and iPadOS for controlling your plane's
  COM radio frequencies and transponder functions" —
  https://apps.apple.com/pt/app/comsquawk-xp/id6756874303
- The broadest product surveyed lists transponder control in the same breath as MCP, EFIS, autopilot
  and radio control — https://flightdeckone.app/
- The dedicated radio product of a long-running vendor covers COM1/2, NAV1/2, ADF1/2 and DME but no
  transponder, which is where the market gap is — https://www.remoteflight.net/
- Laminar's own Control Pad has no radio-tuning or transponder UI at all —
  https://apps.apple.com/us/app/x-plane-12-control-pad/id6701986565

## Acceptance criteria

- [ ] Typing a code shows it as staged and writes nothing until confirmed.
- [ ] Entering 7800 is rejected with an explanation and no write is sent; 7000 is accepted.
- [ ] A code set on the panel appears on the aircraft's transponder in the simulator, and a code
      changed in the simulator appears on the panel within 200 ms.
- [ ] Selecting ALT is reflected by the mode dataref, and the panel shows the simulator's value.
- [ ] Against a mock server reporting X-Plane 12.1.4, the assigned-code comparison is absent and no
      error is shown.
- [ ] Disconnecting marks values stale, disables entry, and a staged code is not sent on reconnect;
      logs contain no token, id or host address.

## Risks and open questions

- No transponder dataref name in this spec comes from a Laminar-authored source. Verification in the
  simulator is a precondition for implementation, not a follow-up.
- `sim/atc/transponder_assigned` is reported from the 12.4.4 release notes via a search summary; the
  exact path must be confirmed in-sim before it is relied on
  (`docs/roadmap/research/xplane-web-api.md`, section B).
- Open question: should the mode selector expose the Mode S positions (GND, TA-only, TA/RA) that the
  community enum lists, or only OFF, STBY, ON and ALT?
- Open question: should the panel offer one-tap entry of the standard emergency codes, and if so,
  should it require a confirmation step?
- Ids are session-scoped and must never be persisted (`docs/roadmap/research/xplane-web-api.md`,
  risk 4).

## References

1. `docs/roadmap/research/xplane-web-api.md`, section B
2. https://www.x-plane.com/kb/x-plane-12-4-4-release-notes/
3. https://developer.x-plane.com/article/x-plane-web-api/
4. `docs/xplane.md`
5. `docs/roadmap/research/remote-control-apps.md`
