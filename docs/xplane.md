# X-Plane Web API notes

Source: https://developer.x-plane.com/article/x-plane-web-api/ (checked 2026-09-14). Where the
official page and observed behaviour differ, this file says so.

## Versions

| API | X-Plane | Adds |
|---|---|---|
| v1 | 12.1.1 | DataRef list/count/read/write (REST); subscribe/unsubscribe/set (WebSocket) |
| v2 | 12.1.4 | `GET /api/capabilities`; commands (REST + WebSocket) |
| v3 | 12.4.0 | Flight initialization (REST), unused by Avionix |

Avionix requires v2 or newer and prefers the highest version both sides support. Paths are
`/api/{version}/...`; the capabilities endpoint is unversioned.

## Endpoints used

| Purpose | Request |
|---|---|
| Capabilities | `GET /api/capabilities` → `{"api":{"versions":[...]},"x-plane":{"version":"12.4.0"}}` |
| Resolve DataRef | `GET /api/v3/datarefs?filter[name]=<name>` → `{"data":[{id,name,value_type}]}` |
| Resolve command | `GET /api/v3/commands?filter[name]=<name>` → `{"data":[{id,name,description}]}` |
| Read value | `GET /api/v3/datarefs/{id}/value[?index=n]` → `{"data": <number | number[] | base64>}` |
| Write value | `PATCH /api/v3/datarefs/{id}/value[?index=n]` body `{"data": ...}` → 200, empty body |
| Activate command | `POST /api/v3/command/{id}/activate` body `{"duration": 0..10}` → 200, empty body |
| Stream | `ws://host:8086/api/v3`, `dataref_subscribe_values`, updates `dataref_update_values` at 10 Hz (delta only after the first message) |

Headers on every REST call: `Accept: application/json`, `Content-Type: application/json`.

Doc discrepancy: the official page shows the value-read response as an array of DataRef
descriptors. Real responses carry the bare value in `data`; Avionix's schema accepts number,
number array and string.

## Errors

| Signal | Avionix code |
|---|---|
| Plain HTTP 403 on everything | `INCOMING_TRAFFIC_DISABLED` ("Disable Incoming Traffic" is on) |
| Name lookup miss while `datarefs/count` is 0 | `SIMULATOR_NOT_READY` (no flight loaded) |
| 404 on `/api/capabilities` without a JSON body | `UNSUPPORTED_API` (X-Plane older than 12.1.4) |
| `invalid_dataref_name`, `invalid_dataref_id` | `DATAREF_NOT_FOUND` |
| `invalid_command_name`, `invalid_command_id` | `COMMAND_NOT_FOUND` |
| `dataref_is_readonly` | `DATAREF_READONLY` (wrapped in `WRITE_FAILED` by the client) |
| any other `error_code` | `SIMULATOR_ERROR` with `simulatorErrorCode` set |

WebSocket results: `{req_id, type:"result", success, error_code?, error_message?}`. A single
`dataref_set_values` request may produce several results with the same `req_id`; Avionix settles
on the first and logs the rest. Unknown `type` values are answered with `unknown_type`.

## Observed on X-Plane 12.4.3 (2026-09-14)

- The web server listens on `127.0.0.1` only: port 8086 is unreachable from another machine, while
  a relay on the X-Plane PC (`xplane-proxy`, port 8087 by default) forwards HTTP and WebSocket
  traffic and works with Avionix unchanged. Laminar lists "LAN access and authorization" as a
  roadmap item.
- At the main menu `GET /api/v3/datarefs/count` returns `{"data":0}` and every name filter answers
  404 `invalid_dataref_name`; with a flight loaded the count was 7554 and all MVP names resolved.
  Avionix maps a lookup miss with a zero count to `SIMULATOR_NOT_READY`.
- DataRef descriptors carry an undocumented `is_writable` boolean; the schema accepts it and maps
  it to `DataRefDescriptor.isWritable` when present.
- Percent-encoded slashes in `filter[name]` (`%2F`) are decoded; both encodings resolve.
- Responses include `Access-Control-Allow-Origin: *`, but a CORS preflight (`OPTIONS`) is answered
  with HTTP 403, so a browser page on another origin cannot complete non-simple requests (JSON
  `Content-Type`, `PATCH`, `POST`). A same-origin relay is required for a web client.

## Ids are session-specific

DataRef and command ids are stable only for the current X-Plane session. Avionix resolves names on
every connect and reconnect and never persists ids.

## MVP DataRefs and command

Verified against Laminar Research's `DataRefs.txt` and `Commands.txt`.

| Role | Name | Type | Why |
|---|---|---|---|
| Heartbeat | `sim/time/total_running_time_sec` | float, seconds | Changes even when parked; freezes when the sim is paused |
| Flight value | `sim/cockpit2/gauges/indicators/airspeed_kts_pilot` | float, knots | Indicated airspeed |
| Writable | `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot` | float, degrees magnetic | Heading bug; harmless; visible on the HSI |
| Command | `sim/autopilot/heading_up` | command | Increments the heading bug by 1°, so the subscription shows the effect |

## Aircraft identification

| Role | Name | Type | Source |
|---|---|---|---|
| ICAO type code | `sim/aircraft/view/acf_ICAO` | data (base64 text) | Community convention, not confirmed in a Laminar-authored document |
| Description | `sim/aircraft/view/acf_descrip` | data (base64 text) | Community convention |
| Tail number | `sim/aircraft/view/acf_tailnum` | data (base64 text) | Community convention |

All three are optional: Avionix records a miss, falls back to the generic profile, and says so in
the compatibility view. A `data` value is base64, padded with NUL to the DataRef's declared length;
`decodeDataRefString` decodes it and cuts at the first NUL, driven by the descriptor's
`value_type` rather than by the shape of the value.

The `/api/v3/aircraft` REST resource is listed in Laminar's API index but its payload shape was
never confirmed, so Avionix does not use it.

## Flight data (F-11)

Two profile features, `flight-data` and `gps-destination` (`GENERIC_PROFILE` 1.1.0). Every binding
is optional, so a name that does not resolve costs only its own field, never the rest of the strip
or panel.

| Name | Type | Units | Source |
|---|---|---|---|
| `sim/cockpit2/gauges/indicators/ground_speed_kt` | float | knots | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/true_airspeed_kts_pilot` | float | knots | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/ground_track_mag_pilot` | float | degrees magnetic | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/wind_speed_kts` | float | knots | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/wind_heading_deg_mag` | float | degrees magnetic, direction wind is **from** | Verified against `DataRefs.txt`; the "from" convention is community-sourced and unverified, pending the device check |
| `sim/cockpit2/temperature/outside_air_temp_degc` | float | °C | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/TAT_pilot` | float | °C | Verified against `DataRefs.txt`; present from X-Plane 12.3 onward, so it is missing on older installs |
| `sim/flightmodel/weight/m_fuel_total` | float | kg, always (mass unit only; the Web API gives no fuel density to convert to volume) | Verified against `DataRefs.txt` |
| `sim/time/zulu_time_sec` | float | seconds since midnight zulu | Verified against `DataRefs.txt` |
| `sim/time/local_time_sec` | float | seconds since midnight local | Verified against `DataRefs.txt` |
| `sim/time/is_in_replay` | int | 0 or 1 | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/gps_dme_distance_nm` | float | nautical miles | Community-sourced and unverified |
| `sim/cockpit2/radios/indicators/gps_dme_time_min` | float | minutes | Community-sourced and unverified |
| `sim/cockpit2/radios/indicators/gps_nav_id` | data (base64, NUL-padded) | identifier text | Community-sourced and unverified; decoded with `decodeDataRefString(value, 'data')`, the same decoder identification uses |

Wind is shown as "Wind (from)", the meteorological convention X-Plane's own instruments use. The
DataRef itself is magnetic (`wind_heading_deg_mag`) while X-Plane's weather UI sets a true
direction, so the device check (smoke test row 57) confirms a wind set to 270° true reads the
magnetic equivalent (about 255° at KSEA), not the reciprocal.

The pause flag, `sim/time/paused` (float, 0 or 1), is community-sourced and unverified like the
three GPS names above, which is why `connection-health`'s binding to it is optional. If it does not
resolve, activity becomes `pausedOrStalled` and no PAUSED badge shows: the badge only ever comes
from `activity === 'paused'`, never from a guess.

## Instruments (F-10)

`flight-instruments` (`GENERIC_PROFILE` 1.2.0 added these two features; all bindings optional) and
`altimeter-setting` (one
required, writable binding). A missing `flight-instruments` name costs only its own instrument
(R9); a read-only or missing `altimeter-setting` binding disables only the altimeter controls (R5).

| Name | Type | Units | Source |
|---|---|---|---|
| `sim/cockpit2/gauges/indicators/airspeed_kts_pilot` | float | knots | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/mach_pilot` | float | Mach | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/altitude_ft_pilot` | float | feet | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/vvi_fpm_pilot` | float | ft/min | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/heading_AHARS_deg_mag_pilot` | float | degrees magnetic | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot` | float | degrees up | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/roll_AHARS_deg_pilot` | float | degrees right | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/turn_rate_roll_deg_pilot` | float | degrees deflection | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/slip_deg` | float | degrees of ball deflection from centred | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot` | float | feet | Verified against `DataRefs.txt` |
| `sim/aircraft/prop/acf_en_type` | int[16] | engine-type enum (0 recip carb, 1 recip injected, 3 electric, 5 single-spool jet, 6 rocket, 7 multi-spool jet, 9 free turboprop, 10 fixed turboprop) | Verified against `DataRefs.txt` |
| `sim/aircraft/view/acf_Vso` | float | knots (kias) | Verified against `DataRefs.txt` |
| `sim/aircraft/view/acf_Vs` | float | unit not stated; treated as knots indicated like its siblings | Verified against `DataRefs.txt` |
| `sim/aircraft/view/acf_Vfe` | float | knots (kias) | Verified against `DataRefs.txt` |
| `sim/aircraft/view/acf_Vno` | float | knots (kias) | Verified against `DataRefs.txt` |
| `sim/aircraft/view/acf_Vne` | float | knots (kias) | Verified against `DataRefs.txt` |
| `sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot` | float | inches Hg | Verified against `DataRefs.txt` |

The barometer is the panel's only write (R4, R12); STD writes `29.92` to it rather than to a
separate flag. `sim/cockpit2/gauges/actuators/barometer_setting_is_std_pilot`, the name the roadmap
named, is **not** in `DataRefs.txt` and is not used. The standard-rate turn deflection (assumed 20°,
`STANDARD_RATE_DEFLECTION_DEG`) and the sign of `slip_deg` (assumed positive = ball right) are
unverified pending the device rows in `docs/testing/xplane-smoke-test.md`.

The Instruments panel descriptor also declares the autopilot features documented under Autopilot
(F-20) below: the selectors, the six mode features, and AP, flight director and autothrottle. This
lets the PFD draw the selected-altitude, heading, speed and vertical-speed bugs and the flight-mode
annunciator (FMA) while Instruments is the panel shown, using the same DataRefs the Autopilot panel
already subscribes to; nothing new is added to the profile. A missing one leaves its cue off the
PFD rather than making the panel unavailable, the same rule every other optional binding follows.

## Radios and transponder (F-21, F-22)

Seven features in `GENERIC_PROFILE` 1.3.0: `com1`, `com2`, `nav1`, `nav2`, `transponder-code`,
`transponder-mode` and `transponder-ident`. Each radio feature is independent, with its active
frequency (required, read-only), its standby frequency (required, written when you tune one) and
its swap command (required); NAV1 and NAV2 add four optional indicators each (station identifier,
DME signal, DME distance, selected course), so a miss there costs only that indicator. The
transponder is three features — code, mode and IDENT — so a missing or read-only name disables only
that one control, never the other two.

| Name | Type | Units | Writable | Source |
|---|---|---|---|---|
| `sim/cockpit2/radios/actuators/com1_frequency_hz_833` | int | documented as hz; Avionix reads whole kHz (assumption, device row 74) | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/com1_standby_frequency_hz_833` | int | documented as hz; Avionix reads whole kHz | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/com2_frequency_hz_833` | int | documented as hz; Avionix reads whole kHz | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/com2_standby_frequency_hz_833` | int | documented as hz; Avionix reads whole kHz | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/nav1_frequency_hz` | int | 10 kHz units (110.30 = 11030) | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/nav1_standby_frequency_hz` | int | 10 kHz units (110.30 = 11030) | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/nav2_frequency_hz` | int | 10 kHz units (110.30 = 11030) | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/nav2_standby_frequency_hz` | int | 10 kHz units (110.30 = 11030) | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/nav1_course_deg_mag_pilot` | float | degrees magnetic | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/nav2_course_deg_mag_pilot` | float | degrees magnetic | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav1_nav_id` | data (base64, NUL-padded) | identifier text | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav2_nav_id` | data (base64, NUL-padded) | identifier text | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav1_has_dme` | int | 0 or 1 | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav2_has_dme` | int | 0 or 1 | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav1_dme_distance_nm` | float | nautical miles | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav2_dme_distance_nm` | float | nautical miles | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/transponder_code` | int | squawk code | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/transponder_mode` | int | mode enum | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/transponder_id` | int | 0 or 1, identing | no | Verified against `DataRefs.txt` |
| `sim/atc/transponder_assigned` | int (assumed, like `transponder_code`) | squawk code assigned by X-Plane ATC | no | Named in the [X-Plane 12.4.4 release notes](https://www.x-plane.com/kb/x-plane-12-4-4-release-notes/); present only from 12.4.4 onward, which is why its binding is optional |
| `sim/radios/com1_standy_flip` | command | — | — | Verified against `Commands.txt` |
| `sim/radios/com2_standy_flip` | command | — | — | Verified against `Commands.txt` |
| `sim/radios/nav1_standy_flip` | command | — | — | Verified against `Commands.txt` |
| `sim/radios/nav2_standy_flip` | command | — | — | Verified against `Commands.txt` |
| `sim/transponder/transponder_ident` | command | — | — | Verified against `Commands.txt` |

Laminar's own command names misspell "standby" as `standy`; Avionix keeps that spelling verbatim
rather than correct it, since the simulator only recognizes the name as written.

The `_833` COM DataRefs are documented in `DataRefs.txt` only as "hz, supports 8.3 khz spacing",
with no stated unit for the integer value. Avionix assumes they are whole kHz (so 121.500 MHz reads
and writes as `121500`). This differs from the legacy (non-`_833`) COM DataRefs, which
`DataRefs.txt` documents as `10hertz` — the same 10 kHz units as the NAV DataRefs above, not whole
kHz; the device check in `docs/testing/xplane-smoke-test.md` confirms the `_833` assumption against
a real X-Plane install before the Radios panel ships.

## Autopilot (F-20)

Twelve features in `GENERIC_PROFILE` 1.4.0: `autopilot-engage`, `flight-director`, `autothrottle`,
`altitude-select`, `vertical-speed-select`, `airspeed-select`, and the six mode features
`ap-mode-hdg`, `ap-mode-nav`, `ap-mode-apr`, `ap-mode-alt`, `ap-mode-vs` and `ap-mode-flc`. Each is
one feature per control, so a name an aircraft lacks costs only that control.

Engagement and disconnection use separate commands, as Laminar recommends, rather than a single
toggle; mode state is read from each mode's own `*_status` DataRef (`0` off, `1` armed, `2`
captured), never from the bit-field `sim/cockpit/autopilot/autopilot_state`, which Avionix does not
use. `sim/operation/override/override_autopilot` reports whether another program (for example a
flight-management add-on) is flying the autopilot; Avionix reads it to show that state but never
writes it, since doing so would fight whatever is already in control.

| Name | Type | Units | Writable | Source |
|---|---|---|---|---|
| `sim/cockpit2/autopilot/servos_on` | int | 0 or 1, engaged | no | Verified against `DataRefs.txt` |
| `sim/operation/override/override_autopilot` | int | 0 or 1 | no (read only, by design) | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/roll_status` | int | mode enum | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/pitch_status` | int | mode enum | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/flight_director_command_bars_pilot` | int | 0 or 1 | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/autothrottle_enabled` | int | -1 disarmed, 0 armed, 1 engaged, 2 N1, 3 retard | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/altitude_dial_ft` | float | feet | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/vvi_dial_fpm` | float | ft/min | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/airspeed_dial_kts_mach` | float | knots or Mach, per `airspeed_is_mach` | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/airspeed_is_mach` | int | 0 knots, 1 Mach | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/heading_status` | int | 0 off, 2 captured | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/nav_status` | int | 0 off, 1 armed, 2 captured | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/approach_status` | int | 0 off, 1 armed, 2 captured | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/glideslope_status` | int | mode enum | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/altitude_hold_status` | int | 0 off, 2 captured | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/vvi_status` | int | 0 off, 2 captured | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/autopilot/speed_status` | int | 0 off, 2 captured | no | Verified against `DataRefs.txt` |
| `sim/autopilot/servos_on` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/servos_off_any` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/fdir_command_bars_on` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/fdir_command_bars_off` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/autothrottle_on` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/autothrottle_off` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/autothrottle_arm` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/autothrottle_hard_off` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/knots_mach_toggle` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/heading` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/NAV` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/approach` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/altitude_hold` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/vertical_speed` | command | — | — | Verified against `Commands.txt` |
| `sim/autopilot/level_change` | command | — | — | Verified against `Commands.txt` |

## Navigation (F-30)

Five features in `GENERIC_PROFILE` 1.5.0: `nav-deviation`, `nav-glideslope`, `nav-source`,
`nav-course` and `nav-aids`. The deviation and glideslope needles are each one feature with every
binding required, because a half-drawn needle is worse than a hidden one; the source and course are
their own features, so a miss disables only the NAV unit's write, never the needles; `nav-aids`
bundles everything advisory (bearings, signal flags, DME and markers) with no binding required, so
a miss drops only that one cue. The HSI itself stands on the heading alone (`FEATURE_FLIGHT_INSTRUMENTS`):
a missing deviation or glideslope binding marks only its own part unavailable rather than hiding the
whole face.

| Name | Type | Units | Writable | Source |
|---|---|---|---|---|
| `sim/cockpit2/radios/actuators/HSI_source_select_pilot` | int | enum: 0 NAV1, 1 NAV2, 2 GPS1, 3 GPS2 | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/actuators/hsi_obs_deg_mag_pilot` | float | degrees magnetic | yes | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_hdef_dots_pilot` | float | dots | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_vdef_dots_pilot` | float | dots | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_flag_from_to_pilot` | int | enum: 0 flag, 1 to, 2 from | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_display_horizontal_pilot` | int | 0 or 1 | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_display_vertical_pilot` | int | 0 or 1 | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_flag_glideslope_pilot` | int | 0 or 1; shows when a GS is expected but not received | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_has_dme_pilot` | int | 0 or 1 | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_dme_distance_nm_pilot` | float | nautical miles | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_dme_speed_kts_pilot` | float | knots | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/hsi_dme_time_min_pilot` | float | minutes | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav1_bearing_deg_mag`, `nav2_bearing_deg_mag` | float | degrees magnetic | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav1_display_horizontal`, `nav2_display_horizontal` | int | 0 or 1 | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/outer_marker_lit`, `middle_marker_lit`, `inner_marker_lit` | int | 0 or 1 (flashes as X-Plane flashes it) | no | Verified against `DataRefs.txt` |
| `sim/cockpit2/radios/indicators/nav1_nav_id`, `nav2_nav_id` | data (base64, NUL-padded) | identifier text | no | Already verified above (F-21, F-22); reused here for the HSI's navaid identifier |
| `sim/radios/obs_HSI_direct` | command | — | — | Verified against `Commands.txt`; sets the course to the bearing to the station (CTR) |

The navaid identifier shown is the identifier of the active source: NAV1 or NAV2 from the existing
radio profile names, and nothing for GPS (R9).

**Unsettled: whether the HSI course follows the selected source.** `DataRefs.txt` does not say that
`hsi_obs_deg_mag_pilot` follows the source; every other `hsi_*` name reads "the pilot's
HSI-selected navaid", and the `sim/radios/obs_HSI_up` / `down` / `direct` commands treat the HSI
OBS as one control, so Avionix reads and writes the HSI course through this one name rather than
switching between `nav1_obs_deg_mag_pilot` and `nav2_obs_deg_mag_pilot` by source. The smoke test's
device row confirms that selecting NAV1 or NAV2 in X-Plane shows and moves that radio's own course
in the CRS window, and that writing CRS from Avionix moves X-Plane's CDI; until that row is run,
this remains an assumption. If it does not hold, the fallback is a one-function change to write the
per-source name instead.

**Course stepping.** `Commands.txt` also defines `sim/radios/obs_HSI_up` and `obs_HSI_down`, but
Avionix's course steppers (−10, −1, +1, +10) write `hsi_obs_deg_mag_pilot` directly, the same write
the keypad uses, rather than activating those commands; only `obs_HSI_direct` is used, as CTR.

## CDU (F-32)

Every name below was verified against Laminar's `DataRefs.txt` and `Commands.txt`, the same files
the F-30 names were checked against; none are community-sourced any more.

**Screen and EXEC light (per unit `n` = 1 or 2, line `k` = 0..15):**

| Name | Type | Meaning |
|---|---|---|
| `sim/cockpit2/radios/indicators/fms_cdu{n}_text_line{k}` | `byte[96]`, base64 `data` | UTF-8 text of line `k`; a character may take more than one byte |
| `sim/cockpit2/radios/indicators/fms_cdu{n}_style_line{k}` | `byte[24]`, base64 `data` | One style byte per glyph, not per UTF-8 byte |
| `sim/cockpit2/radios/indicators/fms_exec_light_pilot` | int | EXEC light, CDU 1 |
| `sim/cockpit2/radios/indicators/fms_exec_light_copilot` | int | EXEC light, CDU 2 |

Style byte (Laminar, "Datarefs for the CDU screen"): bit 7 large font, bit 6 reverse video, bit 5
flashing, bit 4 underscore, bits 0–3 colour (0 black, 1 cyan, 2 red, 3 yellow, 4 green, 5 magenta,
6 amber, 7 white). The scratchpad is line 13. Laminar names these special glyphs: `°`, `☐`
(U+2610), `←↑→↓` (U+2190–2193), `Δ`, `⬡` (U+2B21), `◀` (U+25C0), `▶` (U+25B6).

**Keys (prefix `sim/FMS/` for CDU 1, `sim/FMS2/` for CDU 2; 70 per unit, 140 total):**

| Group | Names |
|---|---|
| Line select | `ls_1l`..`ls_6l`, `ls_1r`..`ls_6r` |
| Page and function | `index`, `fpln`, `clb`, `crz`, `des`, `dir_intc`, `legs`, `dep_arr`, `hold`, `prog`, `exec`, `fix`, `navrad`, `prev`, `next` |
| Alphanumeric | `key_A`..`key_Z`, `key_0`..`key_9` |
| Editing and punctuation | `key_period`, `key_minus`, `key_slash`, `key_space`, `key_delete`, `key_clear`, `key_back` |

The roadmap's original key list named `perf`, `menu`, `data` and `key_overfly`: none exist in
`Commands.txt`, and they are dropped; `clb`, `crz`, `des` and `key_back` (labelled `BACK`), which
the roadmap missed, are added. `CDU_popup` and `CDU_popout` are deliberately not offered — they
change the simulator's own windows, not the pilot's screen.

**Decoding.** `decodeDataRefBytes` returns a `data` value's raw bytes without stopping at the first
NUL (unlike `decodeDataRefString` above, which is right for identifiers and wrong here, where 0 is
a valid style byte). A text line decodes as UTF-8 (a malformed sequence becomes U+FFFD), trailing
NULs are dropped, any other NUL becomes a space, and the result is split into glyphs (code points),
padded with spaces or cut to exactly 24 cells. A style line decodes to 24 bytes; a missing byte, a
missing style DataRef, or a value that cannot be decoded reads as `0x87` (large white) — the same
default the simulator's own popup draws plain text with. Colour indices 8–15 render white; colour 0
(black) without reverse video also renders white, since a black glyph on the black glass would be
invisible and the simulator's own popup never draws invisible text; reverse video with colour 0
draws as plain white text.

## Systems controls (F-24)

Every name below was verified against Laminar's `DataRefs.txt` and `Commands.txt`, the same files
the F-30 and F-32 names were checked against; none are community-sourced. Engine number `n` is
1..4; DataRef arrays are zero-based, so engine `n` is index `n − 1`.

**Lights**

| Control | State (int 0/1 unless noted) | On / off commands |
|---|---|---|
| Beacon | `sim/cockpit2/switches/beacon_on` | `sim/lights/beacon_lights_on` / `_off` |
| Nav | `sim/cockpit2/switches/navigation_lights_on` | `sim/lights/nav_lights_on` / `_off` |
| Strobe | `sim/cockpit2/switches/strobe_lights_on` | `sim/lights/strobe_lights_on` / `_off` |
| Taxi | `sim/cockpit2/switches/taxi_light_on` | `sim/lights/taxi_lights_on` / `_off` |
| Landing | `sim/cockpit2/switches/landing_lights_on` | `sim/lights/landing_lights_on` / `_off` |
| Panel (flood) | `sim/cockpit2/switches/panel_brightness_ratio` float[4], index 0 | `sim/instruments/panel_bright_down` / `_up` |
| Instruments | `sim/cockpit2/switches/instrument_brightness_ratio` float[32], index 0 | `sim/instruments/instrument_bright_down` / `_up` |

**Gear, flaps, brakes**

| Purpose | Name | Type |
|---|---|---|
| Gear handle | `sim/cockpit2/controls/gear_handle_down` | int, 0 up, 1 down |
| Gear position | `sim/flightmodel2/gear/deploy_ratio` | float[10], 0 up, 1 down; entries 0–2 drive the lamps |
| Retractable gear | `sim/aircraft/gear/acf_gear_retract` | int, 0 fixed |
| Gear commands | `sim/flight_controls/landing_gear_up`, `sim/flight_controls/landing_gear_down` | commands |
| Flap handle | `sim/cockpit2/controls/flap_handle_request_ratio` | float 0..1 |
| Flap position | `sim/cockpit2/controls/flap_system_deploy_ratio` | float 0..1 |
| Flap detents | `sim/aircraft/controls/acf_flap_detents` | int |
| Flap commands | `sim/flight_controls/flaps_up`, `sim/flight_controls/flaps_down` | one notch each |
| Parking brake | `sim/cockpit2/controls/parking_brake_ratio` | float 0..1, writable |

**Trim**

| Axis | Position (float −1..1, normalised to the trim range) | Hold commands | Set commands |
|---|---|---|---|
| Pitch | `sim/flightmodel/controls/elv_trim` (−1 nose down, 1 nose up) | `sim/flight_controls/pitch_trim_down` / `_up` | `sim/flight_controls/pitch_trim_takeoff` |
| Roll | `sim/flightmodel/controls/ail_trim` (−1 left) | `sim/flight_controls/aileron_trim_left` / `_right` | `sim/flight_controls/aileron_trim_center` |
| Yaw | `sim/flightmodel/controls/rud_trim` (−1 left) | `sim/flight_controls/rudder_trim_left` / `_right` | `sim/flight_controls/rudder_trim_center` |
| Takeoff mark | `sim/aircraft/controls/acf_takeoff_trim` | float −1..1, same scale as `elv_trim` | — |

**Anti-ice** (state int 0/1; commands `sim/ice/<x>_on` / `_off`)

| Control | State | Command stem |
|---|---|---|
| Pitot heat | `sim/cockpit2/ice/ice_pitot_heat_on_pilot` | `pitot_heat0` |
| Window heat | `sim/cockpit2/ice/ice_window_heat_on` | `window_heat` |
| Prop heat | `sim/cockpit2/ice/ice_prop_heat_on` | `prop_heat` |
| Engine inlet | `sim/cockpit2/ice/ice_inlet_heat_on` | `inlet_heat` |
| Wing heat | `sim/cockpit2/ice/ice_surfce_heat_on` (Laminar's spelling) | `wing_heat` |
| Wing boots | `sim/cockpit2/ice/ice_surface_boot_on` | `wing_boot` |

**Electrical, fuel, engines**

| Purpose | State | Commands |
|---|---|---|
| Battery | `sim/cockpit2/electrical/battery_on` int[8], index 0 | `sim/electrical/battery_1_on` / `_off` |
| Avionics master | `sim/cockpit2/switches/avionics_power_on` | `sim/systems/avionics_on` / `_off` |
| Generator n | `sim/cockpit2/electrical/generator_on` int[8] | `sim/electrical/generator_n_on` / `_off` |
| Fuel selector | `sim/cockpit2/fuel/fuel_tank_selector` int (0 none, 1 left, 2 centre, 3 right, 4 all) | `sim/fuel/fuel_selector_none` / `_lft` / `_all` / `_rgt` |
| Selector present | `sim/aircraft/overflow/acf_has_fuel_any`, `acf_has_fuel_all` | int 0/1 |
| Fuel pump n | `sim/cockpit2/engine/actuators/fuel_pump_on` int[16] | `sim/fuel/fuel_pump_n_on` / `_off` |
| Magnetos n | `sim/cockpit2/engine/actuators/ignition_key` int[16] (0 off, 1 left, 2 right, 3 both, 4 starting) | `sim/magnetos/magnetos_off_n` / `_right_n` / `_left_n` / `_both_n` |
| Starter n | `sim/cockpit2/engine/actuators/starter_hit` int[16] (read-only) | `sim/starters/engage_starter_n` (held) |
| Engine running | `sim/flightmodel/engine/ENGN_running` int[16] | — |
| Engine count, type | `sim/aircraft/engine/acf_num_engines` int; `sim/aircraft/prop/acf_en_type` int[16] (0, 1 piston) | — (`acf_en_type` is already bound by the instruments, F-10) |

Total: 118 new names (35 DataRefs, 83 commands), probed at connect like every other binding (row
143 of the smoke test).

**Holds.** Trim (six keys) and the starters are held rather than pressed. The WebSocket message is
`command_set_is_active` (API v2): `{"commands": [{"id", "is_active", "duration"?}]}`. On press,
`{is_active: true, duration: 0.5}`; every 200 ms while held, the same message renews it; on
release, `{is_active: false}`. The lease is X-Plane's own: it ends the hold itself 0.5 s after the
last renewal, so a phone that goes silent (Wi-Fi lost without the socket closing) stops the command
within half a second even though neither the connector nor X-Plane notices the phone is gone.
X-Plane also clears every hold of a socket that closes, and a renewal never resumes a hold across a
reconnect (it carries the connection generation it was pressed on). Avionix bounds a single hold
itself at 10 s for trim and 30 s for the starter.

Verified against `DataRefs.txt` / `Commands.txt`, 2026-10-06.

## Engines (F-12)

Every name below was verified against Laminar's `DataRefs.txt`, the same copy the earlier sections
were checked against; the three `_deg_cel` temperature names (X-Plane 12.0.8 and newer) were checked
against Laminar's live DataRef database instead, because that `DataRefs.txt` copy predates them.
None are community-sourced. Engine number `n` is 1..16; DataRef arrays are zero-based, so engine `n`
is index `n − 1`.

**Engine indicators** (float[16] unless noted; engine 1 at index 0)

| Gauge | DataRef | Unit | Unit flag |
|---|---|---|---|
| RPM | `sim/cockpit2/engine/indicators/engine_speed_rpm` | rev/min | — |
| PROP | `sim/cockpit2/engine/indicators/prop_speed_rpm` | rev/min | — |
| N1 | `sim/cockpit2/engine/indicators/N1_percent` | percent | — |
| N2 | `sim/cockpit2/engine/indicators/N2_percent` | percent | — |
| MAP | `sim/cockpit2/engine/indicators/MPR_in_hg` | inches Hg | — |
| TRQ | `sim/cockpit2/engine/indicators/torque_n_mtr` | N·m (shown in ft-lb) | — |
| EPR | `sim/cockpit2/engine/indicators/EPR_ratio` | ratio | — |
| EGT | `sim/cockpit2/engine/indicators/EGT_deg_cel` | °C or °F | `acf_EGT_is_C` |
| CHT | `sim/cockpit2/engine/indicators/CHT_deg_cel` | °C always | — |
| ITT | `sim/cockpit2/engine/indicators/ITT_deg_cel` | °C or °F | `acf_ITT_is_C` |
| FF | `sim/cockpit2/engine/indicators/fuel_flow_kg_sec` | kg/s (shown kg/h or lb/h) | — |
| Oil P | `sim/cockpit2/engine/indicators/oil_pressure_psi` | psi | — |
| Oil T | `sim/cockpit2/engine/indicators/oil_temperature_deg_C` | °C or °F | `acf_oilT_is_C` |

A flag reads 1 for Celsius, 0 for Fahrenheit. CHT has no flag: Laminar's own notes say it is always
Celsius, unlike the other three.

**Engine configuration**

| Purpose | DataRef | Type |
|---|---|---|
| Engine count | `sim/aircraft/engine/acf_num_engines` | int |
| Engine type per engine | `sim/aircraft/prop/acf_en_type` | int[16] |
| EGT unit flag | `sim/aircraft/engine/acf_EGT_is_C` | int, 1 Celsius |
| ITT unit flag | `sim/aircraft/engine/acf_ITT_is_C` | int, 1 Celsius |
| Oil temperature unit flag | `sim/aircraft/engine/acf_oilT_is_C` | int, 1 Celsius |
| Engine redline | `sim/aircraft/engine/acf_RSC_redline_eng` | float, rad/s (shown rev/min) |
| Propeller redline | `sim/aircraft/controls/acf_RSC_redline_prp` | float, rad/s (shown rev/min) |

**Markings.** `sim/aircraft/limits/{green,yellow,red}_{lo,hi}_<x>`, float, one pair of edges per
colour for each of ten instruments (`MP`, `TRQ`, `N1`, `N2`, `EPR`, `ITT`, `EGT`, `CHT`, `oilT`,
`oilP`): 60 names. A band counts only when its high edge is above its low edge; Plane Maker leaves
an unused band at 0/0. TRQ's markings are in ft-lb, the same unit the TRQ gauge is shown in, not the
underlying DataRef's N·m. The temperature markings (EGT, CHT, ITT, oilT) are read in whatever unit
the aircraft's limits happen to use; which unit that is is pending the device row (165).

**Fuel**

| Purpose | DataRef | Type |
|---|---|---|
| Fuel per tank | `sim/flightmodel/weight/m_fuel` | float[9], kg |
| Fuel total | `sim/flightmodel/weight/m_fuel_total` | float, kg |
| Tank ratio | `sim/aircraft/overflow/acf_tank_rat` | float[9], share of capacity, 0 unused |
| Tank count | `sim/aircraft/overflow/acf_num_tanks` | int |
| Tank capacity | `sim/aircraft/weight/acf_m_fuel_tot` | float, lb ("appears to be", Laminar) |
| Tank lateral position | `sim/aircraft/overflow/acf_tank_X` | float[9], negative left |
| Fuel used | `sim/cockpit2/fuel/fuel_totalizer_sum_kg` | float, kg |

`m_fuel` sums to F-11's `m_fuel_total`; `acf_m_fuel_tot` is lb, the whole aircraft, not per tank —
Avionix multiplies it by a tank's ratio to get that tank's own capacity. Its unit rests on Laminar's
"appears to be"; other `acf_m_*` weights read as kg in practice. A tank holding more than 5 % over
its computed capacity therefore draws no bar rather than a full one: were the capacity kg, full and
half tanks would show no bar, never tanks stuck at 100 %.

**Electrical**

| Purpose | DataRef | Type |
|---|---|---|
| Bus count | `sim/aircraft/electrical/num_buses` | int |
| Battery count | `sim/aircraft/electrical/num_batteries` | int |
| Bus volts | `sim/cockpit2/electrical/bus_volts` | float[6] |
| Bus load | `sim/cockpit2/electrical/bus_load_amps` | float[6] |
| Battery volts | `sim/cockpit2/electrical/battery_voltage_indicated_volts` | float[8] |
| Battery amps | `sim/cockpit2/electrical/battery_amps` | float[8], negative while discharging |
| Generator amps | `sim/cockpit2/electrical/generator_amps` | float[8], one per engine |

Total: 91 new names, probed at connect like every other binding (row 171 of the smoke test).

Unsettled until the device rows: the marking units for temperatures (165), the unit flags (166),
the tank side threshold and the tank capacity unit, lb or kg (167).

## Audio panel (F-23)

Verified against `DataRefs.txt`, `Commands.txt` and the live 12.4.3 database. Every DataRef is
`int`, writable, current since X-Plane 9–11.35.

| Purpose | DataRef | Type |
|---|---|---|
| Transmit selection | `sim/cockpit2/radios/actuators/audio_com_selection` | int, 6 COM1, 7 COM2, anything else none |
| COM auto-listen | `sim/cockpit2/radios/actuators/audio_selection_com_auto` | int, 0 or 1: the transmit COM is heard |
| Listen COM1 | `sim/cockpit2/radios/actuators/audio_selection_com1` | int, 0 or 1 |
| Listen COM2 | `sim/cockpit2/radios/actuators/audio_selection_com2` | int, 0 or 1 |
| Listen NAV1 | `sim/cockpit2/radios/actuators/audio_selection_nav1` | int, 0 or 1 |
| Listen NAV2 | `sim/cockpit2/radios/actuators/audio_selection_nav2` | int, 0 or 1 |
| Listen ADF | `sim/cockpit2/radios/actuators/audio_selection_adf1` | int, 0 or 1 |
| Listen DME | `sim/cockpit2/radios/actuators/audio_dme_enabled` | int, 0 or 1 (the dedicated DME receiver) |
| Marker audio | `sim/cockpit2/radios/actuators/audio_marker_enabled` | int, 0 or 1 |
| Marker lamps | `sim/cockpit2/radios/indicators/{outer,middle,inner}_marker_lit` | int, 0 or 1 (already read by Navigation, F-30) |

| Command | Effect |
|---|---|
| `sim/audio_panel/transmit_audio_com1` | Transmit on COM1 |
| `sim/audio_panel/transmit_audio_com2` | Transmit on COM2 |
| `sim/audio_panel/monitor_audio_com1_on` / `_off` | Listen to COM1 on / off |
| `sim/audio_panel/monitor_audio_com2_on` / `_off` | Listen to COM2 on / off |
| `sim/audio_panel/monitor_audio_nav1_on` / `_off` | Listen to NAV1 on / off |
| `sim/audio_panel/monitor_audio_nav2_on` / `_off` | Listen to NAV2 on / off |
| `sim/audio_panel/monitor_audio_adf1_on` / `_off` | Listen to the ADF on / off |
| `sim/audio_panel/monitor_audio_dme_on` / `_off` | Listen to the DME on / off |
| `sim/audio_panel/monitor_audio_mkr_on` / `_off` | Marker audio on / off |

A MIC command does two things at once: it selects that COM for transmit, and it also selects that
COM's listener and mutes the other COM — documented by a plugin author, not by Laminar, and
verified on device in row 175 of the smoke test. Not used: the `_man` transmit commands (an "old
panel" behaviour the aircraft's own panel does not have), the toggle commands (the panel always
sends the explicit on/off command, as F-24 does), `audio_nav_selection` (a legacy single selector),
ADF2/NAV3/NAV4/DME1/DME2, the copilot set, and the `audio_volume_*` floats (volume is out of
scope).

Total: 9 new DataRefs, 16 new commands, probed at connect like every other binding.
