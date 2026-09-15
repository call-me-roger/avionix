# Audio panel

| Field | Value |
|---|---|
| ID | `F-23` |
| Stage | `2` |
| Category | Control |
| Status | Proposed |
| Depends on | `F-21` |
| Competitor prevalence | Matrix count 1 of 12 representative products (`research/competitors.md`). Wider set: 2 of 15 products researched offer it (Flight Sim Remote Panel, with a Bendix/King KM24 audio-control panel; Remote X-Plane Avionics, with the A330 stock ACP) |

## Summary

An audio panel on the phone or tablet that controls which radio the pilot transmits on, which
receivers are being monitored, and whether marker audio is on. It sits directly alongside the radio
stack (F-21) and answers the question the radio stack cannot: not what is tuned, but what the pilot
is actually listening to and talking on. It is used whenever a second frequency is being
monitored and on an ILS approach.

## Why now

Stage 2, immediately after the radio stack it depends on. Only two of the fifteen researched
products ship an audio panel, so it is cheap differentiation on top of work already done for F-21,
and it removes a reason for the pilot to go back to the simulator window mid-flight. It is also a
building block for the 737 pedestal (F-54).

## User stories

- As a simmer monitoring ATIS on COM2 while working a controller on COM1, I want to choose which
  radio I transmit on without switching to the simulator window.
- As a simmer flying an ILS, I want to turn marker audio on and off from the same place as the rest
  of my radio controls.

## Scope

### In scope
- Display and change the transmit selection across the available COM radios, as a single exclusive
  choice.
- Display and change receive monitoring for each COM and NAV receiver independently.
- Display and change marker audio.
- Show a plain-language reason when a selection is unavailable on the loaded aircraft.

### Out of scope (this feature)
- Tuning frequencies, which is F-21.
- Per-receiver volume (see open questions); intercom, cabin and passenger-address selections.
- Any audio actually played on the device. Avionix never carries simulator audio; it only changes
  which sources the simulated aircraft routes to the pilot.
- The 737 audio control panel with its own switch layout (F-54).

## Functional requirements

R1. Every displayed selection comes from the subscription stream. A selection changed in the
simulator appears within two subscription intervals, about 200 ms at the documented 10 Hz.

R2. Transmit selection is exclusive: selecting a radio to transmit on deselects the previous one,
and the panel shows the simulator's resulting state, not the pilot's intent.

R3. Receive monitoring is independent per receiver; any combination, including none, is valid.

R4. After any write, the panel shows the value the simulator reports. If the simulator does not
adopt the value within a bounded time, the display reverts and the pilot is told the change did not
take.

R5. If a selection's dataref cannot be resolved for the loaded aircraft, only that selection is
unavailable, with a short explanation naming the aircraft; the rest of the panel keeps working. A
write refused as read-only makes that selection unavailable for the session in the same way.

R6. If no audio-panel dataref resolves at all, the whole feature is presented as not supported by
the loaded aircraft, in one plain sentence, rather than as a panel of dead controls.

R7. While disconnected, all selections are marked stale with the time of the last update and all
controls are inert. Nothing is queued or replayed on reconnect.

R8. On reconnect all names are resolved again before any value is shown, because ids are valid for
one simulator session only.

R9. Errors appear as plain sentences with a next step. Protocol codes, dataref ids, host addresses
and pairing tokens never appear in the UI and are never logged.

## X-Plane Web API mapping

Reads use the WebSocket subscription; writes use dataref writes. Audio selections change rarely, so
10 Hz is far more than enough.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| COM transmit selection | exact name not identified; expected in the `sim/cockpit2/radios/actuators/audio_*` family (unverified) | expected int or per-radio boolean | Read/Write | — |
| COM1/COM2 receive monitoring | exact name not identified; same family (unverified) | expected boolean per receiver | Read/Write | — |
| NAV1/NAV2 receive monitoring | exact name not identified; same family (unverified) | expected boolean per receiver | Read/Write | — |
| Marker beacon audio | exact name not identified; verify in `DataRefs.txt` | expected boolean | Read/Write | — |
| ADF and DME monitoring, if offered | exact name not identified; verify in `DataRefs.txt` | expected boolean | Read/Write | — |

No audio-panel dataref name was found in any Laminar article or research report. The
`sim/cockpit2/radios/actuators/audio_*` grouping above is an expectation drawn from the naming
convention of the confirmed radio actuators, not a verified name, and is marked unverified for that
reason. Every name must be read from the in-sim `DataRefs.txt` and confirmed with a live query
before this feature is planned in detail. If they are not writable, the honest scope is display
only, or the feature is dropped.

## Aircraft compatibility

The default general-aviation aircraft model an audio panel, so the standard datarefs are expected to
resolve there once they are identified. Airliner add-ons generally implement their own audio control
panel: the Zibo 737 is expected to use its own `laminar/B738/...` namespace, which is
community-sourced and changes between releases (`docs/roadmap/research/xplane-web-api.md`, section
C), and its panel is F-54. Aircraft with no modelled audio panel fall under R6.

## Competitor evidence

- A decade-old Android product devotes one of its four panels to "a Bendix/King KM24 audio-control
  panel" next to the radio stack, so the pairing is established —
  https://baltazarstudios.com/flight-sim-remote-panel/
- The community browser tool built on the official Web API ships the A330 stock ACP alongside the
  MCDU, FCU and EFIS, which shows the audio panel is reachable through this API surface on at least
  one aircraft —
  https://forums.x-plane.org/files/file/101030-remote-x-plane-avionics-a330-mcdufcuefis-737-cdu-for-tablet-browser/
- The dedicated radio product of a long-running vendor covers COM, NAV, ADF and DME but not audio
  selection — https://www.remoteflight.net/

## Acceptance criteria

- [ ] Against the mock server, transmit selection is exclusive and reflects the simulator's reported
      state after each change.
- [ ] A mocked missing marker-audio dataref leaves the transmit and receive controls working.
- [ ] A mock in which no audio dataref resolves shows one plain sentence saying the aircraft does
      not support the audio panel, with no dead controls.
- [ ] On a real simulator, changing the transmit selection on the panel changes which radio the
      aircraft transmits on, and a change made in the simulator appears within 200 ms.
- [ ] Disconnecting marks selections stale and disables the controls; logs contain no token, id or
      host address.

## Risks and open questions

- No dataref name for this feature is verified. This is the largest single risk in this file, and
  identification in the simulator is a precondition for planning the work.
- Open question: should per-receiver volume live here or in F-21? Both features currently defer it,
  and neither has a verified dataref name for it.
- Open question: is transmit selection modelled as one enumerated dataref or as one boolean per
  radio? This changes what R2 has to enforce.
- If the default aircraft model audio selection as read-only, this feature becomes a mirror rather
  than a control, and the roadmap entry must say so rather than promise control.
- Ids are session-scoped and must never be persisted (`docs/roadmap/research/xplane-web-api.md`,
  risk 4).

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. `docs/xplane.md`
3. `docs/roadmap/research/xplane-web-api.md`
4. `docs/roadmap/research/remote-control-apps.md`
5. `docs/roadmap/research/panel-builders.md`
