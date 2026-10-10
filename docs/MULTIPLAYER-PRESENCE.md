# Experimental online visual prototype — protocol 3

The explicit player build connects before importing or constructing the game world.
Its first screen shows Connecting, Failed and Retry. After admission the existing
loading/title/character flow runs. Once a room has been joined, a lost connection
pauses local gameplay behind Reconnecting until the server acknowledges rejoining.
Failure never silently enters Solo. The first admission/join deadline is 75 seconds;
initial failures remain Failed, while an established connection retries with
exponential backoff/jitter up to roughly 30 seconds. BFCache return reconnects without
constructing another world. Nothing queues attacks while disconnected.

This is **experimental visual coordination, not secure production MMO authority**.
Remote players have a cyan ground ring, interpolate movement and show current known
outfit/weapon assets and bounded attack/skill cues. Shared damage, monsters, loot,
trading, accounts, server character saves and combat authority are outside this milestone.
Room codes are public group selectors, never passwords. Remote actors cannot become
combat targets, colliders, allies or save entities. Local v13 saves are unchanged.

## Player and developer/offline entries

```sh
npm ci
npm run build:player
# Explicit developer/offline build, retaining tools and existing local saves:
npm run build:offline
```

`build:player` loads `.env.player`, whose public endpoint is
`wss://frontier-presence-prototype.onrender.com/presence`. `index.html` is the online
player entry. Its explicit `./offline.html` link is labelled Developer / Offline;
that entry retains the original tools, optional experimental Join/Solo drawer and
compatible local saves even if the relay is unavailable. It creates no online gate.
`?fresh=1` and skill sandbox tools apply only to the offline entry. No endpoint can
be supplied through a URL query or a save field. HTTPS frontends require WSS.

Default `npm run build` stays the existing offline/CI mode. The existing Pages workflow
is unchanged: the parent must explicitly select `build:player` for a future player
release. No frontend is published by this work. Legacy `--mode presence` remains an
opt-in developer mode, not the online player entry. Both explicit builds include
`offline.html` and the existing Skill Lab.

## One unified world, separate rooms

Player sessions use map/space `frontier-atlas-v1`. Azure Coast, Greenhollow Frontier
and Moonroot Grove are regions within that space, not separate multiplayer rooms.
The wire pose is `{x,z,facing,moving,region}` in **global atlas coordinates**. Each
client adds its fixed initial `coordinateOrigin` when sending and subtracts that
same origin when rendering. Crossing a seam changes only validated `region` metadata;
it does not replace membership, identity, interpolation or the remote rig.

The shared protocol derives region rectangles from current `data/world.json` and
`data/maps/*.json` plus their atlas offsets. Half-open boundary ownership matches
`createUnifiedWorld.regionAt`; the exterior atlas notch and incorrect region claims
are rejected. Native region IDs with four-field native poses remain available as
isolated developer/protocol fixture spaces; current player sessions always use the
unified atlas. Same room code plus same space is required for visibility. Different
rooms are isolated, including visual action and appearance messages.

## Bounded protocol and cosmetic replay

- Protocol 3 server admission: `hello {type,protocol,id}`. A mismatched version fails
  immediately; a matching connection is required before dynamic game import.
- `/presence`, JSON text only, exact fields; inbound maximum 1 KiB, no compression.
- `join`: `type,map,room,pose,look,gear`. Room: 1–24 lowercase letters/digits/hyphens.
  Poses require finite union/map-bounded coordinates, normalized facing and boolean
  moving. Look has a known hair style and five six-digit hex colours.
- Gear contains exactly `weapon,offhand,armor,helm,gloves,boots`: null or known,
  slot-compatible `items.gearBases` IDs. No URLs, HTML, inventory, stats or save data.
  Weapon models and clothing use existing local asset registries.
- `move {type,pose}` and `appearance {type,look,gear}` are valid only after joining.
- `action {type,action}`: action has exactly `seq,skill,phase,angle,duration,step`.
  Skill is a known combat ID; phase is cast/charge/channel/cancel with charge/channel
  compatibility checks. Sequence 1–2147483647, angle ±π, duration 0–3 seconds,
  combo step 0–2. Server identity is appended by the server, never accepted from clients.
- 20 messages/sec, burst 30; actions 6/sec, burst 8; appearance 2/sec, burst 2;
  joins at least 500 ms apart. Moves relay in 10 Hz batches. Client sends at 10 Hz
  and limits appearance updates to at least 600 ms apart. Client and renderer also
  bound action rate; monotonically increasing sequences suppress duplicates.
- 32 total connections, 8 players per room/space, 64 KiB server outbound buffer cap,
  client send buffer cap 4 KiB. Ping/pulse every 15 seconds; stale sockets expire.
  Capacity/policy/payload failures stay Failed (1013/1008/1009), with explicit Retry.
- Authored humanoid actions play with the current weapon. Cast cues release at the
  bounded hit time; charge/channel are brief previews. Melee, fire, frost, stone,
  lightning and physical arrows reuse existing assets. Other skills show their
  known icon and cast pose, not persistent ground zones or summons. Cosmetic effects
  have at most 24 live instances, bounded dimensions/travel and lifetime ≤1.5 seconds.
- Visibility is limited to 58 scene metres; longer moves snap. Locally evaluated
  terrain height is cosmetic. Leave, cancel, disconnect, room change and disposal
  remove owned rigs/scarves, geometry/material/skeleton buffers and icon textures.
  Reconnect clears peers, deduplication state and sequence; appearance is resent.

Bounds are validation, not authority: a modified client can teleport within them,
spoof allowed cosmetics, guess rooms and forge Origin outside a browser. No
anti-cheat/authentication/per-IP protection claim is made. Global caps bound routine
prototype load but can be exhausted. Future server authority requires a separate design.

## Focused localhost verification

Use Node 22 or newer. Never run the full-world legacy two-client harness merely to
repeat this milestone's focused proof.

```sh
npm run test:network
node --test tests/core/save.test.js tests/core/startup-drawing.test.js tests/core/startup-readiness.test.js
CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:online
# If only seams/input/lifecycle are affected, reuse existing actor proof:
ONLINE_SEAMS_ONLY=1 CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:online
# Static camera/shadow integration only, without the resident world:
ONLINE_CULLING=1 ONLINE_SEAMS_ONLY=1 CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:online
VITE_PRESENCE_URL=ws://127.0.0.1:3001/presence npm run build:player
CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/player-entry.mjs
npm run build:offline
```

Run browser commands sequentially: they own `http://127.0.0.1:4173`.
`test:online` starts its own localhost relay at an ephemeral port and real HTTP
fixture. It uses actual UI/input, OpenWorldGame, transport, remote actors and known
assets in a tiny flat scene. It checks admission/failure/retry, appearance/events,
cancel/deduplication, resource stabilization, reconnect/leave/BFCache handlers,
two browser clients with different fixed origins, keyboard/touch Moonroot and
Frontier seam crossings, shared positions, room isolation, Supplies/Close and
existing offline save preservation. It omits the resident map renderer, monsters
and local hero rendering; this is not full-world readiness or hardware FPS proof.
The production entry check deliberately refuses admission and confirms that the
actual built game/renderer chunk is never fetched and no world is constructed.
It refuses to run if the restricted Render hostname occurs in the build.

For manual local player/offline comparison:

```sh
ALLOWED_ORIGINS=http://127.0.0.1:5173 PORT=3001 npm run start:presence
VITE_PRESENCE_URL=ws://127.0.0.1:3001/presence npm run dev:player -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/` in two independent browser profiles. Continue/create
characters, finish the opening, choose the same room, close the drawer and move.
Visit `http://127.0.0.1:5173/offline.html` for offline tools/saves. Stop the relay:
player entry must show Failed/Reconnecting while the offline entry remains playable.
Do not mix localhost and 127.0.0.1 origins. See the local review for evidence and limits.

## Parent-owned Render deployment reference

No service, account, credential, paid resource, database or disk is created here.
Parent-created service: `srv-db4bh7rtqb8s73eo7neg`, Free Node web service, Singapore,
one instance, repository root, manual deployment, auto-deploy off. The owner reported
no payment card. `render.yaml` is a configuration reference, not an executed deployment.

| Setting | Value |
| --- | --- |
| Build | `npm ci --omit=dev` |
| Start | `node server/index.mjs` |
| Node environment | `NODE_VERSION=22` |
| Listen | `0.0.0.0:$PORT`; local default 3001 |
| Health path | `/healthz` |
| Health result | HTTP 200 `{"ok":true,"prototype":"presence-v3","protocol":3}` |
| WebSocket | `wss://frontier-presence-prototype.onrender.com/presence` |
| Health URL | `https://frontier-presence-prototype.onrender.com/healthz` |
| Existing authorized origins | `https://nerfmez.github.io,http://127.0.0.1:4173` |
| Production-only origin | `https://nerfmez.github.io` |
| Player frontend command | `npm ci && npm run build:player` |
| Offline frontend command | `npm ci && npm run build:offline` |

Upgrade Origin must be an exact HTTP(S) origin: no paths, wildcard, null, credentials
or trailing slash. GitHub Pages origin omits the repository path. CORS does not
replace this upgrade allowlist. Health proves liveness/version only, not readiness.
This protocol change needs matching client/server revisions; do not test v3 against
the parent's older v1/v2 deployment. Old CI exact-head run 37737906296 established
only its old source, not this milestone. No CI is polled here.

## Hosted verification handoff — blocked in this execution environment

The browser previously denied the Render hostname with `ERR_BLOCKED_BY_CLIENT`.
Do not contact it from this task, proxy it, change network, use another hostname or
executor to bypass that denial. No hosted readiness is claimed. The parent/owner
must review the local commit before any publication or manual Render deployment.

After the parent deploys matching reviewed protocol-3 source, the owner can open
the approved player frontend in two independent browser sessions. Confirm:

1. Connecting is visible before the world; failed server access keeps Failed/Retry.
2. Same-room players see current outfit/weapon, movement and bounded attack cues.
3. Cross Azure ↔ Frontier and Azure ↔ Moonroot with players on opposing sides;
   neither disappears at the seam or doubles its atlas offset.
4. Disconnect/reconnect: gameplay pauses, cues/actors clear, then current appearance
   returns after acknowledgement. No stale attack is replayed.
5. Different room codes isolate players/actions; Join/Retry and Supplies/Close stay
   reachable at 1024×768 and small landscape. Offline link keeps local saves/tools.
6. Record actual iPad Safari feel/FPS and cold-start latency. The flat SwiftShader
   fixture and inspected stills cannot establish these.

For an approved local preview of that future hosted test, use `npm run build:player`
and serve `dist` at exactly `http://127.0.0.1:4173` (`npm run preview -- --host 127.0.0.1
--port 4173`). That exact origin is already authorized by the parent. Do not execute
hosted steps in this restricted task. Free-plan sleep/restart/latency remains an
owner-hosted check; there is no keepalive or uptime guarantee.
