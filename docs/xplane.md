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
