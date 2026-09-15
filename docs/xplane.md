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
