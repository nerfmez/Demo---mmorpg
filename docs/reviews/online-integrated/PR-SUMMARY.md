# Prepared title

Add experimental online-first unified-world presence and cosmetic actions

# Prepared PR #115 description

Players in the explicit player build now receive server admission before the game
world is imported or constructed. Connecting, Failed/Retry and Reconnecting are
visible; reconnect pauses gameplay until the original room is acknowledged. A
separate Developer / Offline entry preserves tools and compatible local saves.

Same-room players share `frontier-atlas-v1`: global atlas coordinates and validated
Azure/Frontier/Moonroot region metadata let players with different starting origins
see the same positions and remain visible across seams. Remote clothing and weapons
resolve allowlisted local IDs, while bounded/deduplicated/rate-limited action events
play existing animations and short cosmetic effects. Disconnect, cancel, leave and
room changes clear owned resources and stale events.

This is an experimental visual prototype. Monsters, damage, loot, trading, accounts
and server save authority remain outside scope. Main `7beaf36a…` is preserved by a
normal merge, including accepted UI/outfits/grass/resident startup and native v13 saves.

Latest main `10b8f730…` (PR #132) was subsequently normally merged without conflicts.
Its static camera/shadow box culling and cross-region exterior-tree fix remain
unchanged. A focused two-browser integration fixture verifies static detach/restore
while remote rigs, scarves and bounded visual cues remain dynamic scene objects;
keyboard/touch seams, room controls and saves pass. Player/offline builds pass.
New inspected stills and exact source hashes are in `docs/reviews/online-main132/`.

Validation: 11 focused network cases plus the added admission case; 16 affected
save/startup cases plus the actual-main-frame gate case; player/offline builds;
actual compiled entry failure with no game/renderer import; real localhost relay,
actor/appearance/action captures and stable 35 geometry / 39 texture samples;
isolated two-browser keyboard/touch Moonroot/Frontier seam, shared-position, room,
lifecycle, Supplies/Close and save-preservation assertions. Relevant unaffected
results were reused; no broad suites or CI polling were repeated.

Inspected PNGs and source/artifact hashes: `docs/reviews/online-integrated/`.
The extended fixture had a keyboard seam timeout; the isolated final check passed,
and timing variance remains disclosed. Flat scene/sample-frame proof omits the
resident map renderer/local hero/monsters and does not establish normal-speed feel
or actual iPad FPS. Hosted Render access remains blocked in this executor. The owner
must verify the matching protocol-3 deployment and two-session hosted result.

Deployment reference: existing parent-owned Free Node service in Singapore;
`npm ci --omit=dev`, `node server/index.mjs`, `/healthz`, `NODE_VERSION=22`, automatic
deployment off. Health is `presence-v3`, protocol 3. Approved exact origins are
`https://nerfmez.github.io,http://127.0.0.1:4173`. Player frontend: `npm ci && npm run
build:player`; offline: `npm ci && npm run build:offline`. Default Pages workflow
remains unchanged. Full commands/limits are in `docs/MULTIPLAYER-PRESENCE.md`.

Prepared locally only: no remote PR update, push, merge, frontend deployment or
restricted-host contact. Parent owns approval, publication and manual hosting steps.
