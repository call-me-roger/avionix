# Voice commands

| Field | Value |
|---|---|
| ID | `F-26` |
| Stage | `5` |
| Category | Control |
| Status | Proposed |
| Depends on | `F-06` |
| Competitor prevalence | Matrix count 0 of 12 representative products (`research/competitors.md`). Wider set: 1 of 15 products researched offers it (XP Remote – Voice Commands) |

## Summary

An optional way to trigger controls Avionix already exposes by speaking instead of touching: setting
the heading, altitude or a radio frequency, changing an autopilot mode, raising the gear, and so on.
It adds no capability; it is a second way to reach the controls that F-20 through F-25 and F-06
already provide, for the moments when both hands are busy.

## Why now

Stage 5, and optional even there. Exactly one product in the survey offers voice control, and its
vendor describes it as the distinctive feature of the app, so this is a genuine differentiator
rather than a gap. But it is worth nothing until the controls it speaks to exist and can be
remapped, which is why it sits behind F-06 and after every control feature.

## User stories

- As a simmer hand-flying an approach, I want to say a new heading and have the bug move so that I
  do not take a hand off the yoke.
- As a simmer, I want to hear back what the app understood before it changes anything, so that a
  misheard phrase does not fly the aircraft somewhere I did not intend.

## Scope

### In scope
- Speaking a command that maps onto a control Avionix already exposes.
- Showing what was recognised, and what will be done, before anything is sent to the simulator.
- An explicit way to start and stop listening, so the app is never listening unannounced.
- Reporting clearly when the device cannot do speech recognition, and when a spoken command refers
  to something the loaded aircraft does not have.

### Out of scope (this feature)
- Any control that does not already exist in another feature. Voice never becomes the only way to
  reach something.
- Speaking to X-Plane's own ATC, or any radio communication.
- Reading values back aloud, and free-form phrasing beyond a defined command vocabulary.
- Any cloud service chosen or required by this specification; whether recognition runs on the device
  is an open question, below.

## Functional requirements

R1. Listening is explicit. The app listens only after the pilot starts it and stops when the pilot
stops it or after a bounded idle period. The listening state is always visible.

R2. A recognised command is shown as text, together with the control it maps to and the value it
would set, before it is sent.

R3. A command that changes the aircraft is sent only after the pilot accepts it, unless the pilot
has turned that confirmation off deliberately.

R4. A phrase that is not recognised, or that is ambiguous, changes nothing and is reported as not
understood. The app never picks the closest match silently.

R5. Every command sent by voice goes through the same path, the same validation and the same
read-back as the equivalent touch control. A voice command cannot bypass a rule that a touch control
obeys, including the rule that no control fires without a state read-back (F-24, R1).

R6. If the control a spoken command refers to is unavailable on the loaded aircraft, because its
dataref or command does not resolve, the app says so in the same plain language the touch control
would use, naming the aircraft.

R7. While disconnected, voice input is disabled and says why. Nothing spoken while disconnected is
queued or replayed on reconnect.

R8. On reconnect, names are resolved again before any spoken command can be sent, because ids are
valid for one simulator session only.

R9. If the device or platform cannot do speech recognition, the feature is presented as unavailable
on this device, in one plain sentence, wherever it would otherwise appear. It is never offered and
then found to fail.

R10. Errors appear as plain sentences with a next step. Protocol codes, dataref ids, host addresses
and pairing tokens never appear in the UI and are never logged.

R11. Captured audio and recognised text are not written to logs or persisted beyond the interaction
they belong to.

## X-Plane Web API mapping

This feature reads and writes nothing of its own. Every spoken command resolves to a dataref write
or a command activation that another feature already defines, and it uses that feature's names,
units, validation and read-back.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Any control reachable by voice | none of its own; the mapping of F-20, F-21, F-22, F-24, F-25 or a user mapping from F-06 | as defined by that feature | Read/Write | those feature files |

The update rate, the session-scoped ids and the absence of a navdata endpoint all apply exactly as
they do to the underlying feature (`docs/roadmap/research/xplane-web-api.md`, risks 1, 4 and 5). In
particular, a spoken frequency cannot be looked up by airport name, because no such endpoint exists;
it can only be a value the pilot states.

## Aircraft compatibility

Voice inherits the compatibility of whatever it speaks to. A phrase that maps to a control the
loaded aircraft does not expose behaves exactly as the touch control would: it is reported as
unavailable, naming the aircraft, and nothing is sent. Aircraft-specific vocabulary, for example
Boeing-flavoured phrasing for the 737 panels, is a question for the aircraft-specific features
rather than for this one.

## Competitor evidence

- XP Remote is built around "voice control (200+ built-in commands) of autopilot/autothrottle modes,
  radio frequency tuning, and aircraft-specific system control", and voice is described as a feature
  "no other app in this survey offers" — https://www.planetcoops.com/apps/xp-remote
- The failure to avoid is on the device side, not the sim side: some Android users of that product
  hit "This device does not support speech recognition" at launch, which is what R9 exists to
  prevent — https://play.google.com/store/apps/details?id=com.planetcoops.android.xplaneremote
- The broader pattern in the research is that Android is treated as second class across this whole
  category, so a voice feature that works only on iOS would repeat the category's worst habit —
  `docs/roadmap/research/competitors.md`, complaint 6 (Android treated as second class)

## Acceptance criteria

- [ ] The app listens only while listening has been started, the state is visible throughout, and a
      recognised command is shown with its target control and value before anything is sent.
- [ ] An unrecognised or ambiguous phrase changes nothing and says it was not understood.
- [ ] A spoken command for a control missing on the loaded aircraft gives the same message as the
      touch control and sends nothing.
- [ ] On a device without speech recognition, the feature reports itself unavailable and is never
      offered as usable.
- [ ] While disconnected, voice input is disabled, and a phrase spoken while disconnected is not
      sent on reconnect.
- [ ] Logs contain no audio, no recognised text, no token, no dataref id and no host address.

## Risks and open questions

- Open question: must recognition run entirely on the device? On-device recognition avoids sending
  audio anywhere and keeps the product's local-network-only character, but platform support and
  accuracy vary. This is the decision that determines whether the feature is viable at all.
- Open question: what is the command vocabulary, and is it fixed, user-editable, or per aircraft?
- Open question: should confirmation before sending be the default, and may the pilot turn it off?
- Open questions: should the app speak anything back, or only show text; does voice work while the
  app is in the background, and what does that mean for the indicator required by R1?
- Recognition accuracy in a room with simulator audio and engine noise is unproven and should be
  tested before the feature is committed to.
- This feature is optional. If the open questions above cannot be answered well, not shipping it is
  an acceptable outcome; the survey shows the category survives without it.

## References

1. https://www.planetcoops.com/apps/xp-remote
2. https://play.google.com/store/apps/details?id=com.planetcoops.android.xplaneremote
3. `docs/roadmap/research/remote-control-apps.md`
4. `docs/roadmap/research/competitors.md`, `docs/roadmap/research/panel-builders.md`
5. `docs/roadmap/research/xplane-web-api.md`
6. https://developer.x-plane.com/article/x-plane-web-api/
