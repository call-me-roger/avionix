# Web target and the Avionix bridge

Avionix runs in a browser through `react-native-web`. The recommended deployment is on the
computer that runs X-Plane, because X-Plane's web server only accepts connections from the same
machine and answers CORS preflight requests with 403. The Avionix bridge solves both: it serves the
exported web app and relays `/api/*` (HTTP and WebSocket) to X-Plane from the same origin.

## Build and serve

```bash
npm run build:web             # exports to dist/web
npm run bridge                # node scripts/avionix-bridge.js, listens on 0.0.0.0:8080
```

Then open `http://<x-plane-pc-ip>:8080` from any device on the LAN. The connection form is
prefilled with the page's own host and port; press Connect.

Flags: `--port 8080`, `--host 0.0.0.0` (bind address; use the PC's LAN IP to restrict),
`--xplane 127.0.0.1:8086` (X-Plane or another relay), `--static dist/web`, `--help`.

Native apps can use the bridge too: enter the PC's IP and the bridge port instead of 8086.

## Development

`npm run web` starts the Metro dev server for the browser. Because that page is served from a
different origin than X-Plane, connect through the bridge (start it with `--static dist/web` or any
directory; only `/api` matters for development) and enter its host and port in the form.

## Constraints

- Plain `http` only: a page served over `https` cannot open `http://` or `ws://` connections.
- The bridge exposes X-Plane's unauthenticated API to everyone on the network it binds to. Use it
  on trusted networks only and stop it when not needed.
- No PWA, no offline support, no HTTPS termination.
