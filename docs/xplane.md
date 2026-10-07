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

Verified against `DataRefs.txt` / `Commands.txt`, 2026-10-06.
