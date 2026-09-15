# Avionix Connector protocol

The Avionix Connector is the bridge (`npm run bridge`) running on the X-Plane PC. Besides serving
the web app and relaying the X-Plane Web API, it exposes a small protocol that lets Avionix devices
find it and pair with it.

## Discovery

The connector advertises `_avionix._tcp` over mDNS with TXT records `v=1` and `pairing=1|0`.
Disable with `--no-mdns`; name the instance with `--name "Sim PC"` (default `Avionix Connector (<hostname>)`).

## Endpoints

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /avionix/info` | none | `{ name, version, pairingRequired, xplane: { host, port, reachable } }`; `405 method_not_allowed` for non-GET methods |
| `POST /avionix/pair` body `{ "code": "123456" }` | none | `200 { token }`; `401 pairing_invalid_code`; `429 pairing_rate_limited` (five wrong attempts per minute per client); `400 invalid_body`; `413 payload_too_large`; `405 method_not_allowed` for non-POST methods |
| `GET /avionix` | none | human-readable status page (never shows the code) |
| `/api/*` | bearer token | relayed to X-Plane; `401 unauthorized` without a valid token |
| `ws://…/api/vN?token=<token>` | token query | relayed WebSocket; the `token` parameter is removed before forwarding |

Send the token as `Authorization: Bearer <token>` on HTTP requests. Browsers cannot set headers on
WebSockets, so the upgrade carries `?token=`.

## Pairing

On start the connector prints a six-digit code (rotates each run; `--code 123456` fixes it for
tests). A device sends it once to `/avionix/pair` and stores the returned token. Tokens are saved
in `~/.avionix/connector-tokens.json` (`--data-dir` overrides) so paired devices survive restarts.
Delete that file to revoke every device. `--open` disables pairing entirely (trusted networks only).

The Avionix app's pairing screen is pending (next PR). Until then, start the bridge with `--open`
for the app to reach X-Plane.

## Flags

`--port 8080`, `--host 0.0.0.0`, `--xplane 127.0.0.1:8086`, `--static dist/web`, `--open`,
`--code 123456`, `--name "Sim PC"`, `--no-mdns`, `--data-dir ~/.avionix`, `--help`.
