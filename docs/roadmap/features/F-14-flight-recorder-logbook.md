# Flight recorder, logbook and replay export

| Field | Value |
|---|---|
| ID | `F-14` |
| Stage | `4` |
| Category | Monitoring |
| Status | Proposed |
| Depends on | `F-11`, `F-13` |
| Competitor prevalence | Matrix count 2 of 12 representative products (`research/competitors.md`). Wider set: 3 of 28 products researched record flights natively (Little Navmap, XMapsy, Flight Deck ONE); ForeFlight users need the third-party 42fdr tool to replay their own tracks |

## Summary

While connected, Avionix records the flight in the background: position, altitude, speeds, heading
and simulator time, sampled at a modest rate. Each flight becomes a logbook entry with a departure
and an arrival point, block and flight time, distance and aircraft type, exportable as GPX or KML and
shareable from the device. Recording needs no action during flight.

## Why now

Automatic recording is the clearest gap the research found in mobile companions: only a desktop tool
and a bridge utility do it natively. It is cheap here, because F-11 and F-13 already read every value
a track needs, so F-14 adds storage, a lifecycle and export rather than new simulator access.

## User stories

- As a pilot, I want flights recorded without pressing anything so that the logbook is a side effect
  of flying rather than homework.
- As a pilot, I want to export a flight as GPX or KML so that I can review the track without a
  third-party recorder.
- As a pilot whose link dropped, I want the flight closed and marked so that no entry claims a longer
  flight than I flew.

## Scope

### In scope
- Background recording, while connected with a flight loaded, of position, altitude, ground speed,
  true airspeed, ground track, heading and simulator zulu time, at a fixed modest rate.
- A lifecycle: a flight starts at takeoff or when recording begins, and ends at landing, at
  disconnect, or when the pilot ends it.
- One entry per flight: start and end coordinates and simulator times, block and flight time,
  distance, aircraft type, and how the flight ended.
- A list of past flights with a detail view, deletion, a visible retention and storage policy, and
  export of one flight as GPX and as KML handed to the device's sharing mechanism.

### Out of scope (this feature)
- Naming departure and arrival airports: no navdata over the Web API, so nearest-known-airport naming
  waits for F-34.
- Replay inside Avionix and writing a recording back into X-Plane's replay: open questions below.
- Engine and systems traces (F-12), route data (F-31), traffic (F-40), real-world logbook formats,
  and any write to the simulator: recording is read-only.

## Functional requirements

R1. While connected with a flight loaded, Avionix records a sample of every value in the mapping
below at a fixed rate, configurable between roughly 1 Hz and 0.1 Hz, never claiming a rate higher
than the Web API delivers.

R2. Recording needs no recorder page open, continues while other panels are in use, and is shown as
active somewhere persistent.

R3. A flight ends at landing, when the pilot ends it, or when the connection is lost. An entry closed
by disconnect is marked as ended by disconnect, and its end time and position are those of the last
real sample, never extrapolated.

R4. While the simulator is paused or in replay, no samples are recorded and elapsed times do not
advance. Resuming continues the same flight rather than starting a new one.

R5. Each entry shows start and end coordinates and simulator times, block and flight time, track
distance, and the aircraft type F-03 reports. Values Avionix cannot determine are shown as
unavailable in plain language; a default or a zero is never substituted.

R6. Distance and times derive only from recorded samples. Where samples are missing, the entry says
the track has a gap rather than interpolating across it.

R7. The pilot can export any closed flight as GPX or KML and pass the file to the device's sharing
mechanism. Export succeeds with no connection to the simulator.

R8. Storage is bounded: the pilot sees the space used, sets a retention limit by count or age, and
deletes flights. At the limit Avionix prunes the oldest and says so, never silently discarding the
flight being recorded.

R9. If a DataRef is unavailable on the loaded aircraft, recording continues with that column absent
and the entry names what was missing; if takeoff and landing cannot be detected, recording still
works and the flight is closed manually or by disconnect. With no flight loaded and no DataRefs
exposed, no recording starts and the logbook says so.

R10. Raw protocol errors, DataRef ids, HTTP status codes and WebSocket error codes never appear on
this page; they go to the diagnostics view (F-02).

R11. Pairing tokens are never logged, never shown, and never written into a recording or an export.
The recorder writes no DataRef and activates no command.

## X-Plane Web API mapping

Position, speed and time names are reused verbatim from F-11 and F-13 so that the logbook, the strip
and the map can never disagree. All are read over one `dataref_subscribe_values` subscription and
sampled down to the recording rate. Aircraft identification names come from F-03 and are unverified.

| Purpose | DataRef / command | Type, units | Read/Write | Source |
|---|---|---|---|---|
| Latitude | `sim/flightmodel/position/latitude` | double, degrees | Read | datarefs |
| Longitude | `sim/flightmodel/position/longitude` | double, degrees | Read | datarefs |
| Altitude | `sim/flightmodel/position/elevation` | double, metres MSL | Read | datarefs |
| Ground speed | `sim/cockpit2/gauges/indicators/ground_speed_kt` | float, knots | Read | datarefs |
| True airspeed | `sim/cockpit2/gauges/indicators/true_airspeed_kts_pilot` | float, knots | Read | datarefs |
| Ground track | `sim/cockpit2/gauges/indicators/ground_track_mag_pilot` | float, degrees mag | Read | datarefs |
| Magnetic heading | `sim/flightmodel/position/mag_psi` | float, degrees mag | Read | datarefs |
| Simulator zulu time | `sim/time/zulu_time_sec` | float, seconds since midnight | Read | datarefs |
| Paused | `sim/time/paused` (unverified) | int, boolean | Read | community catalogue, as in `F-11` |
| In replay | `sim/time/is_in_replay` | int, boolean | Read | datarefs |
| Weight on wheels | `sim/flightmodel/failures/onground_any` (unverified) | int, boolean | Read | Community convention; verify in `DataRefs.txt` |
| Aircraft type code | `sim/aircraft/view/acf_ICAO` (unverified) | string | Read | F-03; verify in `DataRefs.txt` |
| Aircraft description | `sim/aircraft/view/acf_descrip` (unverified) | string | Read | F-03; verify in `DataRefs.txt` |

Notes. Latitude, longitude and elevation are doubles and must not be narrowed; elevation is metres.
`sim/time/paused` is community-sourced and unverified against a Laminar list (see `F-11`); until it is
confirmed, a frozen simulator clock is the paused signal. DataRef ids are session-scoped, so names are
resolved at each connection and ids never enter a recording.

## Aircraft compatibility

Position, speed, heading and time are simulator-level and behave identically on the Laminar defaults,
the Zibo 737 and any add-on, so recording needs no per-aircraft handling. The aircraft type is
whatever F-03 reports, which may be missing or generic on some add-ons (R5). Weight on wheels is the
one part that may need an aircraft-specific fallback (R9).

## Competitor evidence

- Track recording is underserved in mobile EFBs: only Little Navmap on the desktop and the XMapsy
  bridge offer it natively, and Little Navmap's auto-recording logbook with GPX export is called out
  as a stand-out feature versus a third-party recorder — https://github.com/albar965/littlenavmap
- XMapsy records automatically to GPX and KML with automatic departure and destination airport
  naming, a convenience absent from most direct EFB integrations — https://xmapsy.com/
- Flight Deck ONE bundles an auto-populated pilot logbook with exports plus a "Black Box" recorder
  with timestamped graphs and metrics — https://apps.apple.com/us/app/flight-deck-one/id6742143273
- ForeFlight records GPS logs but cannot replay them in the sim; the community uses the third-party
  42fdr tool for that —
  https://forums.x-plane.org/forums/topic/347175-how-to-replay-foreflight-logs-in-x-plane-12-using-42fdr

## Acceptance criteria

- [ ] On a scripted track the flight records with no pilot action and the entry's distance and times
      match the scripted values.
- [ ] Pausing the mock server stops samples and freezes elapsed times; resuming continues the same
      flight rather than opening a second entry, and stopping it closes the entry, marks it ended by
      disconnect, and takes the end time and position from the last real sample.
- [ ] Exported GPX and KML open in an external tool, match the map (F-13) and readouts (F-11), and
      export works with the connection down.
- [ ] Removing the weight-on-wheels DataRef leaves recording working and the entry names what was
      missing; with no flight loaded the logbook says so.
- [ ] The retention limit prunes the oldest and reports it; no raw protocol text, and no pairing
      token or DataRef id in logs or exports.

## Risks and open questions

- Takeoff and landing detection. The weight-on-wheels name is unverified, and the alternative, a
  ground-speed and altitude threshold, misfires on rejected takeoffs and touch-and-goes. Open
  question: which signal drives the lifecycle, at what thresholds, and does a touch-and-go end a
  flight? Verify the name in `Resources/plugins/DataRefs.txt` first.
- Replay inside Avionix. Whether the app plays a recording back on its own map, with what controls,
  and whether it earns the scope, is open. Writing one back into X-Plane's own replay is separate and
  is not assumed possible over the Web API.
- Airport identification. With no navdata, departure and arrival stay coordinates until F-34 exists;
  Avionix must not imply logbook-grade airport naming before then.
- Sample rate and storage budget interact: a long-haul flight at 1 Hz is a large file on a phone.
  Settle the rate, the cap, the retention default and whether recordings are compressed first.
- Block versus flight time needs a definition that survives having no airport and no reliable parking
  brake signal, and if two devices are paired to one simulator, whether both record is open (F-07).

## References

1. https://developer.x-plane.com/article/x-plane-web-api/
2. https://developer.x-plane.com/datarefs/
3. https://github.com/albar965/littlenavmap
4. https://xmapsy.com/
5. https://apps.apple.com/us/app/flight-deck-one/id6742143273
6. https://forums.x-plane.org/forums/topic/347175-how-to-replay-foreflight-logs-in-x-plane-12-using-42fdr
7. `docs/xplane.md`; `docs/roadmap/research/` — `xplane-web-api.md`, `efb-moving-map.md`,
   `panel-builders.md`, `remote-control-apps.md`
