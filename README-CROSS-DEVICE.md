# GhostGrid — merged cross-device build

This package merges the feature-rich GhostGrid emergency-command dashboard with the Chrono Rescue cross-device presence build.

## Included

- Full GhostGrid emergency dashboard and role-based views.
- Self-serve local user/admin accounts with browser-local password hashes.
- SOS hold-to-activate flow, cancellation, location simulation, relay visualization, and delivery-state UI.
- Hackathon emergency scenario / disaster simulation controls.
- Node topology, coverage, health, survivor map, navigation, incident analysis, and message-relay simulator.
- Local GhostGrid AI assistant and telemetry-driven UI features from the original build.
- Cross-device live NODE MAP presence using the same-origin Node.js server and Server-Sent Events.
- Cross-device telemetry: node name/role, presence, battery, RSSI, SOS state, and simulated position.
- Offline-first PWA shell through `ghostgrid-sw.js`.
- Correct manifest start URL: `./index.html`.

## Run

Requirements: Node.js 18+.

```bash
node server.js
```

Then open the printed URL on the first device.

For another phone/tablet on the same Wi-Fi/LAN, open:

```text
http://YOUR-COMPUTER-LAN-IP:8787/
```

Use the server URL on every device. Do not open separate `file://` copies if you want cross-device presence.

## What is shared

The server keeps only short-lived in-memory node presence:

- account/device node name
- role
- online presence / last-seen
- battery and signal telemetry
- SOS state
- simulated node position

Presence is removed after about 15 seconds without a heartbeat.

Passwords are not sent to the server. Account credentials remain in each browser's local storage.

## Offline behavior

The service worker precaches the application shell and uses a network-first strategy with cached fallback. If the network is unavailable, previously cached application resources can continue to load.

Cross-device synchronization itself requires the Node.js server to be reachable; the offline UI and local simulation do not.

## Prototype scope

This is still a software prototype of the Chrono Rescue / GhostGrid mesh. The server demonstrates shared network state across devices; it is not a replacement for physical Bluetooth, Wi-Fi Direct, LoRa, cellular, satellite, or other radio mesh hardware.

## Files

- `index.html` — merged dashboard, authentication UI, simulations, PWA registration, and cross-device client.
- `server.js` — same-origin static host plus in-memory presence API and SSE stream.
- `ghostgrid-sw.js` — offline application-shell service worker.
- `ghostgrid-manifest.json` — PWA metadata.
- `README-CROSS-DEVICE.md` — setup and cross-device notes.
