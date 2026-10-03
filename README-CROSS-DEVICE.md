# GhostGrid — merged cross-device build

This package merges the feature-rich GhostGrid emergency-command dashboard with the Chrono Rescue cross-device presence build into one set of files.

## Included

- Full GhostGrid emergency dashboard with role-based views (Survivor / Admin).
- **Self-serve local accounts** (create account / sign in) for both roles, with salted, iterated SHA-256 password hashes kept in the browser's `localStorage`. The original demo logins still work.
- SOS hold-to-activate flow, cancellation, location simulation, relay visualization and delivery-state UI.
- Hackathon scenario / disaster simulation controls and the reset button.
- Node topology, coverage, health, survivor map, navigation/compass, incident analysis and the message-relay simulator.
- Local GhostGrid AI assistant and telemetry-driven UI from the original build.
- **Cross-device live presence** through the same-origin Node.js server and Server-Sent Events: every signed-in device appears as a live node on the NODE MAP, survivor map, roster, navigation targets and message simulator, and its SOS state propagates to the other devices (alerts, counts, packet animation).
- Header badge showing sync state: `SET SERVER`, `SYNC IDLE`, `LIVE · n DEVICES` or `SYNC OFFLINE`. Click it to enter the server address.
- Polling fallback: if the live stream is blocked or buffered (some proxies, antivirus or mobile browsers), the client polls the server every 3 s so devices still see each other.
- Offline-first PWA shell through `ghostgrid-sw.js`.

## Run

Requirements: Node.js 18+.

```bash
node server.js
```

The server prints a `localhost` URL and the LAN URLs for other devices (default port `8787`; override with `PORT=…`, restrict with `HOST=127.0.0.1`).

For another phone/tablet on the same Wi-Fi/LAN open the printed `http://<your-computer-lan-ip>:8787/` URL. Use the server URL on every device.

If you must open a copy of `index.html` another way (for example `file://`), click the sync badge and enter the server address printed by `node server.js` (e.g. `http://192.168.1.20:8787`). That setting is remembered per browser; clear it to go back to the page's own server.

## Accounts

- **Sign in**: survivor = a local account, or any name + access code `survivor1`; admin = one of the three fixed operator accounts (credentials are issued separately and are not listed in the app or this file).
- **Create account** is for survivors only (name + password of 6+ characters, entered twice). Admin accounts are fixed: they cannot be created or changed in the UI, and their IDs are reserved. Both the IDs and passcodes are stored in `index.html` only as salted, iterated hashes.
- Accounts live only in the browser that created them (per device and per browser profile). Passwords are never sent to the server. This is prototype-grade authentication, not a security boundary — the demo codes are visible in the UI.

## What is shared

The server keeps only short-lived, in-memory presence:

- node label (operators are prefixed `OP·`), role
- online presence / last-seen
- battery and signal telemetry (real battery level where the browser exposes it, otherwise simulated; signal is simulated)
- SOS state
- simulated node position (each tab/window gets a stable slot on the map)

A device disappears after about 15 seconds without a heartbeat, immediately on sign-out, or when the tab closes. Each browser tab or window is its own device, so two tabs on one computer make a handy two-device test.

## Server behavior

- Static hosting is limited to `index.html`, `ghostgrid-sw.js`, `ghostgrid-manifest.json`, this README and optional `icon-*.png` files; `server.js` itself is not served.
- CORS is enabled by default so pages opened from `file://` or another host can join with a server address. Start with `CORS=0 node server.js` for same-origin only. POSTs must be `application/json`.
- Each device registers with a random token; another client cannot overwrite or unregister its node. Labels are stripped of HTML-significant characters before being broadcast.
- Limits: 200 nodes, 500 live listeners, 100 KB request bodies.

## Static hosting (Vercel etc.) — no backend needed

Static hosts can't run `server.js`, so the page detects that (`/api/state` is missing) and switches to a **serverless peer-to-peer mode** built into `index.html`:

- Devices on the same deployed URL join the same room. The first device to claim the room's PeerJS id becomes the **relay hub**; the others connect to it over WebRTC. The hub keeps the same presence + shared scene a server would and pushes it to everyone.
- If the hub closes its tab, another device takes over automatically and re-seeds the scene from its own copy (other devices may blink for ~5 s while heartbeats re-register).
- The badge shows `LIVE · n DEVICES`; the tooltip says "Serverless peer-to-peer mesh".
- Needs internet once per session: it loads `peerjs` from unpkg and uses the free public PeerJS broker only for the handshake. Strict networks (client isolation, symmetric NAT) can still block direct links; use `node server.js` on a LAN there. To pin a room name manually, set `localStorage['ghostgrid.room.v1']` on each device.
- `node server.js` still works and is preferred automatically when present.

## Shared scene (what is identical on every device)

Failed/recovered nodes, the SOS node, the manually logged roster, **Reset Simulation** and the mesh/admin activity events are one shared scene (`ggApplyOp` in `index.html`, mirrored in `server.js`). Status counts come from the roster and the dead-zone grid is a pure function of the clock; the old per-device random failures and battery drift were removed.

- Roster add/status/delete is accepted only from devices registered as admin; fail/recover/reset from any registered device (the Admin role is still client-side, prototype-grade).
- Each device lists itself as `YOU` and others as remote nodes, so every roster has the same people from its own point of view.

## Troubleshooting: devices don't see each other

1. Every device must use the same server (`node server.js` running on one machine); check the badge says `LIVE`.
2. Use the LAN address, not `localhost`, on other devices, and allow Node.js through the computer's firewall (port 8787).
3. Phones must be on the same Wi-Fi, and guest/"client isolation" networks often block device-to-device traffic.
4. Different server addresses = different meshes, even if both pages look the same.

## Offline behavior

The service worker precaches the application shell and uses a network-first strategy with cached fallback. If the network is unavailable, the app and local simulation keep working. It deliberately bypasses `/events` and `/api/*` so live presence is never cached.

Cross-device sync itself needs the Node.js server to be reachable; while it is not, the badge shows `SYNC OFFLINE` and the app continues as a local simulation.

## Browser requirements

- **Cross-device presence and accounts work over plain `http://` on a LAN.**
- Service-worker/offline install and the compass sensor permission need a *secure context*: `localhost` or HTTPS. Opening the LAN IP over `http://` still syncs, but won't register the offline shell. To get both on phones, put the server behind HTTPS (for example a local TLS reverse proxy or a tunnel).
- Web fonts load from Google Fonts when online; offline, the UI falls back to system fonts.
- To make the PWA installable, add `icon-192.png`, `icon-512.png` and `icon-512-maskable.png` next to `index.html` and list them under `icons` in `ghostgrid-manifest.json` (the service worker already precaches them if present).

## Prototype scope

This is still a software prototype of the Chrono Rescue / GhostGrid mesh. The server demonstrates shared network state across devices; it is not a replacement for physical Bluetooth, Wi-Fi Direct, LoRa, cellular, satellite, or other radio mesh hardware, and the topology/links between devices are computed for display, not measured.

## Files

- `index.html` — dashboard, account UI, simulations, PWA registration and the cross-device client.
- `api/` — Vercel serverless equivalent of the server plus the shared scene logic (`_scene.js`, `_lib.js`).
- `server.js` — same-origin static host plus in-memory presence API and SSE stream.
- `ghostgrid-sw.js` — offline application-shell service worker.
- `ghostgrid-manifest.json` — PWA metadata.
- `README-CROSS-DEVICE.md` — setup and cross-device notes.
