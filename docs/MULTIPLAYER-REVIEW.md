# Presence prototype review

Base: `b31a2c7` (PR114). Implementation: `09ba408` on
`codex/multiplayer-presence`. [Draft PR115](https://github.com/nerfmez/Demo---mmorpg/pull/115).
Historical evidence captured 2026-10-08. The current-main integration is recorded
separately in [MULTIPLAYER-INTEGRATION-REVIEW.md](MULTIPLAYER-INTEGRATION-REVIEW.md).

## Scope and observable criteria

Preserve the existing cel-style humanoid, starting basic attack, quest interface,
local save version/slots, map layouts and touch HUD. Another connected character
must stand on terrain, have a clear cyan peer ring, and follow movement without
entering local combat/collision/save state. Closed room controls must clear the
player/quest HUD and leave joystick/combat controls usable. Open controls must have
readable labels and 44px Join/Solo buttons. This is an experimental cosmetic relay,
not production MMO authority.

## Technical evidence

- **412/412 core tests pass**, including opening/basic-only skills, startup, saves,
  migrations and map safety. The initial run found an absent optional adapter in
  the startup test harness; the frame call was fixed and the full suite rerun.
- **160/160 repository tooling tests pass** after adding the network CI gate.
- **5/5 Node network tests pass**, using real WebSockets: server-assigned identities,
  join/leave, movement, map/room isolation, reconnect, exact schema/size/origin checks,
  flood and room limits. The browser adapter test confirms local state is untouched.
- Existing `tests/browser/boot.mjs` passes in Chromium on desktop and iPad-sized
  touch: real title/create/opening/save/reload/Continue, with deep preservation of
  character fields. This ran with the presence server unavailable and no active
  membership. [Boot results](reviews/presence/boot-results.txt).
- Vite production build passes (existing large-chunk warning).
- Clean production-only `npm ci --omit=dev`, exact `node server/index.mjs` start,
  and `/healthz` HTTP 200 pass in an isolated temporary install. Render YAML parses
  with Free/Singapore/manual deployment, expected commands and health path.
- [Node 22 CI build/core/tooling gate](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37736722315/job/113178261162)
  passed for implementation `09ba408`. The later [exact-head CI run
  37737906296](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37737906296)
  completed successfully at `06c2cf63fd085abb984b2d8450b50f26010f20b0`. This is
  historical evidence, not a CI claim for the merged head; the PR stays draft.
- No core rules, world data, character save schema, skill or quest files changed.

## Real two-client browser run

`VITE_PRESENCE_URL=ws://127.0.0.1:3001/presence npm run build` followed by
`CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:presence` passes.
See [machine-readable results](reviews/presence/results.json).

Two independent Chromium contexts, a real local WebSocket server and built frontend:

- Desktop and touch startup, each still granting exactly one starting basic skill.
- Same room/map join, keyboard movement observed/converged on the other client.
- CDP touch joystick input, observed/converged on the desktop remote actor.
- Explicit Solo removes both remote actors; repeated joins clean up geometry.
- Three post-leave geometry counts: **79, 79, 79** (focused resource ownership probe;
  stable samples did not justify a broad long-session leak run).
- Different rooms cannot see each other.
- Real server shutdown clears ghosts while solo remains available; restart reconnects
  both clients with new temporary IDs.
- Azure and Frontier remain isolated even when both use `lobby`; page close leaves
  no actor. No browser runtime errors.

Software-GPU startup required bringing each browser window forward and parking the
other window's rendering only during startup. Captures use 0.5 world render scale
with full-size HUD/layout at 1280×800 desktop and 1024×768 touch. An early movement
failure exposed the closed drawer swallowing keyboard input; this was fixed. An
invalid touch fixture placed a player in blocked water; the final fixture uses
`Game.freeSpotNear`. These failures are not counted as passes.

## Final visual inspection

Inspected the exact PNGs below separately from test assertions. Both normal-proportion
characters and the cyan peer ring are visible on the beach; feet follow local ground.
The final collapsed drawer is above, clear of, the player and quest HUD. Active
joystick, action buttons and potions remain visible, and touch movement actually
worked. The expanded room drawer is an intentional overlay over the upper-left HUD;
close it to resume movement. No major visible defect remains in these sampled views.
The initial drawer/HUD overlap was found in screenshots and fixed before these captures.

| Artifact | Inspected view | SHA-256 |
| --- | --- | --- |
| [desktop-two-players.png](reviews/presence/desktop-two-players.png) | Desktop, peer ring and closed drawer | `d5f2e06afb68978403bfb91dd00b57f48a2fd3f52ee42786a10085a6ec104aee` |
| [ipad-two-players.png](reviews/presence/ipad-two-players.png) | Touch layout, both actors and quest HUD | `e6068b2fb98aa1d98e57ca6c28ac4c18e8605bac9f4b5003ec72517c2544886b` |
| [ipad-joystick.png](reviews/presence/ipad-joystick.png) | Actual touch drag, walking character and peer | `8c4fa62fc3594a8056ecb7d5d6e8df5964a2a0201dc9a1dd07e8a8322ac1f613` |
| [ipad-room-controls.png](reviews/presence/ipad-room-controls.png) | Expanded room drawer and Join/Solo targets | `20002d17e533d3bf5183f109ecb1efa1ed2b1bf36789cc1399674f2ab1719c4d` |

Review method: sampled screenshots and measured browser displacement/convergence,
not continuous normal-speed animation playback. Existing hero animation is reused;
Internet jitter, physical iPad performance, hosted Render cold starts and owner
visual approval remain unverified. Verdict: ready for draft prototype review within
these limits, not merged or deployed. The server is ready for parent-owned hosting.

## Retrieval and impact trace

Direct reads/searches sufficed; no Jev request or cached ranking was used. Inspected
`AGENTS.md`, visual workflow, `main.js`, `save.js`, map registry/world bounds,
`game.js`/simulation input, hero/animator/model ownership, `dispose.js`, `view.js`
map switching/terrain placement, touch input/menu/HUD anchoring CSS, startup/opening/
browser helpers, CI workflow/scope and Godot port notes. The adapter reads local
pose/appearance only; remote data has no core/save consumer. The actual service URL and focused-test origin are now documented in the deployment
guide. Origin authorization, matching-head manual deployment, hosted cold-start/latency,
frontend publication, physical-device testing and owner visual acceptance remain
parent-owned decisions.
