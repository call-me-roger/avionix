# COM and NAV radios

| Field | Value |
|---|---|
| ID | `F-21` |
| Stage | `1` |
| Category | Control |
| Status | Proposed |
| Depends on | `F-03`, `F-04` |
| Competitor prevalence | Matrix count 6 of 12 representative products (`research/competitors.md`). Wider set: 8 of 15 products researched offer it (XpRemotePanel, Flight Sim Remote Panel, XP Remote – Voice Commands, Comsquawk XP, RemoteFlight RADIO HD, Flight Deck ONE, Air Manager, Remote X-Plane Avionics) |

## Summary

A radio stack on the phone or tablet for COM1, COM2, NAV1 and NAV2: the active and standby value of
each radio, direct numeric entry of a standby value, and a swap control. COM channels follow
X-Plane's 8.33 kHz channel numbering. It is used on the ground before taxi and at every
frequency change in the air.

## Why now

Stage 1. The radio stack is the single most common feature across the researched products and the
one whose small-screen usability is most often criticised, so doing it well is both expected and a
visible differentiator. It needs only F-04 and F-03, and it is the dependency for the
audio panel (F-23) and the HSI and CDI indicators (F-30).

## User stories

- As a simmer, I want to type a frequency on a keypad and swap it in so that I do not have to click
  a knob repeatedly in the sim window.
- As a simmer in Europe, I want to enter an 8.33 kHz channel exactly as ATC and the chart give it so
  that I am on the right channel.

## Scope

### In scope
- Display the active and standby value of COM1, COM2, NAV1 and NAV2, updated live.
- Enter a standby value digit by digit, review it before it is sent, and correct or cancel it.
- Swap active and standby for each radio.
- Display the NAV identifier, DME distance and selected course when the receiver has them.
- Reject an entry that is not a valid channel or frequency, with a message saying why, before
  anything is written, and say plainly when a radio is unavailable on the loaded aircraft.

### Out of scope (this feature)
- Transmit selection, receive monitoring and marker audio (F-23).
- ADF and DME as tunable radios (see open questions); course deviation, HSI and CDI display (F-30).
- Frequency lookup by airport or navaid: the Web API has no navdata endpoint
  (`docs/roadmap/research/xplane-web-api.md`, risk 5). Frequencies are typed, not searched.

## Functional requirements

R1. Every displayed value comes from the subscription stream. A frequency changed in the simulator
appears within two subscription intervals, about 200 ms at the documented 10 Hz.

R2. Entry is staged: nothing is written until the pilot confirms, and the staged value is visibly
distinct from the simulator's current standby value.

R3. A COM entry is validated as an X-Plane channel number before it is sent. Entries that are not
valid channel numbers, such as 118.020, are rejected with an explanation rather than silently
snapped to another value.

R4. After a write, the panel shows the value the simulator reports. If the simulator does not adopt
the value within a bounded time, the display reverts and the pilot is told the change did not take.

R5. If a radio's datarefs or its swap command cannot be resolved for the loaded aircraft, that radio
is shown as unavailable with a short explanation naming the aircraft, and the other radios keep
working. A write refused as read-only makes that radio unavailable for the session in the same way.

R6. While disconnected, all values are marked stale with the time of the last update, entry is
disabled and no staged entry is queued or replayed on reconnect.

R7. On reconnect all names are resolved again before any value is shown, because ids are valid for
one simulator session only.

R8. Errors appear as plain sentences with a next step. Protocol codes, dataref ids, host addresses
and pairing tokens never appear in the UI and are never logged.

## X-Plane Web API mapping

Reads use the WebSocket subscription; writes use dataref writes and command activation. 10 Hz is far
more than radio state needs.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| COM1 active channel | `sim/cockpit2/radios/actuators/com1_frequency_hz_833` | int, X-Plane channel number (not the physical frequency for 8.33 channels) | Read/Write | [1] |
| COM2 active channel | same family, `com2_...`; exact name not identified, verify in `DataRefs.txt` | int, channel number | Read/Write | — |
| COM1/COM2 standby channel | not identified; verify in `DataRefs.txt` | int, channel number | Read/Write | — |
| NAV1/NAV2 active and standby frequency | not identified; verify in `DataRefs.txt` | int, 10 kHz units expected | Read/Write | — |
| NAV1 selected course | `sim/cockpit2/radios/actuators/nav1_course_deg_mag_pilot` | float, degrees magnetic | Read/Write | [2] |
| NAV1 identifier | `sim/cockpit2/radios/indicators/nav1_nav_id` | string | Read | [2] |
| NAV1 DME distance | `sim/cockpit2/radios/indicators/nav1_dme_distance_nm` | float, nautical miles | Read | [2] |
| Swap active and standby, per radio | not identified; verify in `Commands.txt` | commands | Write | — |
| ADF1/ADF2 frequency | not identified; verify in `DataRefs.txt` | int, kHz expected | Read/Write | — |
| COM and NAV receiver volume | not identified; verify in `DataRefs.txt` | expected float 0..1 | Read/Write | — |

8.33 kHz behaviour, from Laminar [1]: X-Plane works in channel numbers, not physical frequencies.
For 25 kHz channels the number equals the frequency; for the 8.33 channels in between, "the channel
is just a number, that doesn't actually coincide with the frequency". Charts and ATC give channel
numbers, so the panel shows and accepts exactly what the pilot would dial. Invalid values cannot be
tuned and X-Plane snaps to "the nearest available multiple of 25 kHz", which R3 prevents.

## Aircraft compatibility

Default aircraft expose the standard `sim/cockpit2/radios/...` tree and need no per-aircraft
handling. Add-ons with custom radio panels (Zibo 737, ToLiss) may mirror only some of it and expose
the rest in their own namespace; the 737 pedestal radios are F-54. F-03 decides which radios to
offer, and radios whose names do not resolve are shown as unavailable rather than hidden silently.

## Competitor evidence

- XpRemotePanel's numeric keypad frequency entry is "called out as better than mouse-clicking knobs
  in the sim" by reviewers — https://apps.apple.com/us/app/xpremotepanel/id1576583318
- The clearest complaint in the whole survey is about a radio stack: "the radio stack is mushy and
  difficult to operate ... still impossible to use on an 8 inch screen" —
  https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc
- A vendor ships the radio stack as a separate product (RADIO HD, with COM1/2, NAV1/2, ADF1/2 and
  DME) because users want to buy just that — https://www.remoteflight.net/
- A 2025 entrant is scoped to nothing but COM frequencies and transponder codes —
  https://apps.apple.com/pt/app/comsquawk-xp/id6756874303

## Acceptance criteria

- [ ] Typing a standby value shows it as staged and writes nothing until confirmed.
- [ ] Entering 118.020 is rejected with an explanation and no write is sent.
- [ ] A valid 8.33 channel entered on the panel appears on the aircraft's radio, and a COM1 change
      made in the simulator appears on the panel within 200 ms.
- [ ] A mocked missing NAV2 leaves COM1, COM2 and NAV1 working, with a plain-language message.
- [ ] Disconnecting marks values stale, disables entry, and a staged entry is not sent on reconnect;
      logs contain no token, id or host address.

## Risks and open questions

- Only `com1_frequency_hz_833` is confirmed from a Laminar source. The COM2, standby, NAV and swap
  names must be read from the in-sim `DataRefs.txt` and `Commands.txt` before implementation.
- Open question: is ADF in scope at all, and if so as a third radio here or in F-54? Only one
  researched product lists ADF, which suggests low demand.
- Open question: should the panel expose COM and NAV receiver volume? The dataref names are not
  identified and volume overlaps with the audio panel (F-23).
- Open questions: 25 kHz-only entry for regions without 8.33; how pilot and copilot sides are
  handled when an aircraft has separate radios.
- Some add-ons accept a radio write at the dataref but ignore it in the aircraft; the read-back rule
  in R4 must catch that.

## References

1. https://developer.x-plane.com/article/8-33-khz-radios-for-users-and-authors/
2. https://developer.x-plane.com/article/autopilot-navigation-source-reference/
3. https://developer.x-plane.com/article/x-plane-web-api/
4. `docs/xplane.md`
5. `docs/roadmap/research/xplane-web-api.md`, `remote-control-apps.md`, `panel-builders.md`
6. https://appgrooves.com/android/org.baltazar.XPlaneRemotePlus/flight-sim-remote-panel/baltazar-studios-llc
