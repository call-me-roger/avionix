# Web target and the Avionix bridge

Avionix runs in a browser through `react-native-web`. The recommended deployment is on the
computer that runs X-Plane, because X-Plane's web server only accepts connections from the same
machine and answers CORS preflight requests with 403. The Avionix bridge solves both: it serves the
exported web app and relays `/api/*` (HTTP and WebSocket) to X-Plane from the same origin.

## Build and serve with the Avionix Connector

```bash
npm run build:web             # exports to dist/web
npm run bridge                # node scripts/avionix-bridge.js, listens on 0.0.0.0:8080
```

Then open `http://<x-plane-pc-ip>:8080` from any device on the LAN. On first use the app asks for
the pairing code printed by the connector; see `docs/connector.md`. The connection form is
prefilled with the page's own host and port; press Connect.

For the full list of flags, see `docs/connector.md`. (npm needs the `--` separator, e.g.
`npm run bridge -- --port 9000` or `npm run bridge -- --open`).
Note that the bridge binds to `0.0.0.0` by default; use `--host <LAN IP>` to restrict it.

Native apps can use the bridge too: enter the PC's IP and the bridge port instead of 8086.

## Development

`npm run web` starts the Metro dev server for the browser. Because that page is served from a
different origin than X-Plane, connect through the bridge (start it with `--static dist/web` or any
directory; only `/api` matters for development) and enter its host and port in the form.

## Constraints

- Plain `http` only: a page served over `https` cannot open `http://` or `ws://` connections, so
  the connection form is not prefilled on an `https` page.
- By default, the bridge requires pairing before `/api` is accessible; see `docs/connector.md`. If you
  run the bridge with `--open`, it exposes X-Plane's unauthenticated API to everyone on the network it
  binds to. Use `--open` only on trusted networks and stop it when not needed.
- No PWA, no offline support, no HTTPS termination.
