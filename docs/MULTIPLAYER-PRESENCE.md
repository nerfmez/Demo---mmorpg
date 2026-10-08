# Experimental presence and movement prototype

This milestone adds opt-in, anonymous player presence to the existing local game.
It is **not a secure production MMO authority**. Combat, monsters, quests, loot,
items, and saves still run independently in each browser. No accounts, credentials,
server saves, trading, chat, or combat synchronization are introduced.

Players open **ผู้เล่นออนไลน์ · ทดลอง**, choose the same lowercase room code
(default `lobby`), press **Join**, then close the drawer to move. The blue ground
ring identifies another connected player. Each remote actor uses the existing
humanoid and join-time hair/colour appearance; equipment, skills, death poses and
later cosmetic changes are not replicated. Each map is a separate presence space,
even at the streamed world seam. Room codes are public group selectors, not passwords.
Only join once the opening has finished. Join never blocks startup or local saving.

**Solo** leaves immediately. Failure removes remote actors and retries with
exponential backoff and jitter (up to roughly 30 seconds). Hidden tabs suspend
presence; returning rejoins with a new temporary identity. The tab remembers its room in sessionStorage (separate from character saves), so
a travel reload rejoins. A room/map change replaces
the old membership. A restart loses all server memory; browsers rejoin automatically.
Fresh test characters remain never-saved; ordinary slots keep the existing format.

## Local verification

Node 22 or newer, from the repository root:

```sh
npm ci
ALLOWED_ORIGINS=http://localhost:5173 npm run start:presence
# In a second terminal:
VITE_PRESENCE_URL=ws://localhost:3001/presence npm run dev
```

Open two browser contexts at `http://localhost:5173`, start/continue characters,
and join the same room. Do not mix localhost and 127.0.0.1 origins.

```sh
npm run test:network
npm test
VITE_PRESENCE_URL=ws://127.0.0.1:3001/presence npm run build
CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:presence
```

The focused browser test starts its own preview (4173) and server (3001), uses two
independent browser contexts, drives keyboard and CDP touch input, restarts the real
server, exercises rooms/maps and captures `tests/browser/out/presence/`.
`CHROMIUM_EXECUTABLE` may point to another installed Chromium binary.
Core and existing Chromium/WebKit smoke/UX gates still apply before merge.

## Parent-owned Render setup (no resources created by this change)

Use `render.yaml` as the minimal configuration. Choose the approved workspace,
**Web Service**, Node, **Free**, **Singapore**, one instance, repository root as
root directory, and manual deploy only (`autoDeployTrigger: off`). Select the
reviewed branch/commit explicitly; do not deploy `main` until integration approval.

| Setting | Exact value |
| --- | --- |
| Build command | `npm ci --omit=dev` |
| Start command | `node server/index.mjs` |
| Health check path | `/healthz` |
| Node version env | `NODE_VERSION=22` |
| Allowed production frontend origin | `ALLOWED_ORIGINS=https://nerfmez.github.io` |
| Listen | `0.0.0.0:$PORT` (Render supplies PORT; local default 3001) |
| WebSocket URL | `wss://<actual-service-host>.onrender.com/presence` |
| Health URL | `https://<actual-service-host>.onrender.com/healthz` |

Health returns HTTP 200 JSON `{"ok":true,"prototype":"presence-v1"}` without player
information. No health polling/keepalive service is provisioned. No database, disk,
secret, paid instance, scaling service, or cloud account is required by this code.

For a separate test frontend, build this branch with
`VITE_PRESENCE_URL=wss://<actual-service-host>.onrender.com/presence npm run build`
and host **that `dist/`** at a separately approved static test origin. Add that exact
origin to `ALLOWED_ORIGINS` as a comma-separated entry. Alternatively run the local
frontend against Render and allow `http://localhost:5173` explicitly during testing.
The endpoint is public build configuration, not a credential. HTTPS pages require
WSS. Paths, wildcards, trailing slashes, missing Origin and `null` are not allowed in
the origin list. GitHub Pages' origin is `https://nerfmez.github.io`, without its repo
path. CORS is not WebSocket authorization; upgrade Origin is checked directly.

There is deliberately no endpoint URL query parameter, save-field setting or active
production endpoint in this PR. Without the build variable the UI reports Solo and
Join is disabled. Existing Pages deployment workflows are unchanged. The parent
must supply the actual service URL and test frontend origin after service creation.

Render documentation checked 2026-10-08:
[Free services](https://render.com/docs/free),
[WebSockets](https://render.com/docs/websocket),
[Blueprint fields](https://render.com/docs/blueprint-spec).
Free instances can sleep after 15 minutes without inbound traffic; cold starts can
take about a minute and instances may restart. Quotas are workspace-wide; the free
instance allowance is 750 hours/month. Bandwidth/build quotas also apply. If a payment
method is present, confirm the workspace spending controls with the parent before
hosting; `plan: free` alone does not cap all workspace overages. No guarantee of
continuous availability is implied. Cold-start reconnect has local restart evidence;
actual Render sleep/wake and network latency need hosted verification.

## Protocol and limits

- `/presence`, JSON text only, 1 KiB inbound payload limit, no compression.
- `join`: exactly `type`, known `map`, 1–24 lowercase alphanumeric/hyphen `room`,
  `pose` and `look`. Pose contains only finite, map-bounded `x/z`, normalized
  `facing` and boolean `moving`. Look contains a known hair style and six-digit
  hex colours for the five supported colour fields.
- `move`: exactly `type`, `pose`; valid only after joining. No client identity,
  names, arbitrary nested objects, save data, equipment IDs, URLs or HTML accepted.
- Server generates UUIDs per connection. Outbound welcome/join/leave/move records
  contain only the validated public shape. Client never applies them to game rules.
- 20 messages/sec token refill, burst 30; join changes at most twice/sec. Moves
  broadcast in 10Hz batches. 32 total connections, 8 players per room/map,
  64 KiB outbound buffering limit, heartbeat/timeout, unjoined-connection expiry.
- A full room closes with 1013; the client keeps solo play and retries. Other invalid
  messages close with 1008; oversized frames close with 1009.

Bounds are validation, **not movement authority**: a modified client can teleport
within them, spoof cosmetics, guess rooms and forge an Origin outside a browser.
No authentication, anti-cheat or per-IP abuse protection is claimed. Global caps
bound routine prototype load but an attacker can exhaust them. Server-simulated
movement, authenticated sessions, version negotiation, interest management and
operator-level abuse protection belong to a future milestone.

Remote rendering owns and disposes humanoid, ring, skeleton and scarf resources.
It interpolates within a map and snaps long teleports. Terrain height is evaluated
locally. Remote players never become combat targets, colliders or save entities.
Godot should implement this as a separate cosmetic network adapter and actor layer.
