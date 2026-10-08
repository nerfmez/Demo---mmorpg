# Presence prototype review

Base: `b31a2c7` (PR114). Branch: `codex/multiplayer-presence`.

## Scope and reference

Preserve the existing cel-style hero, starting basic attack, quest interface,
local save version/slots, map layouts and touch HUD. Another connected character
must stand on terrain, be distinguished by a cyan ring, and follow movement without
entering local combat/collision/save state. Room controls must leave joystick and
combat buttons usable. This is a draft experimental relay, not production authority.

## Technical evidence

- Five Node network tests pass: actual WebSockets for join/leave, map/room separation,
  movement, reconnect, identity rejection, payload schema/size validation, origin
  filtering, rates and room capacity. Client adapter preserves local state.
- 160 repository tooling tests pass after adding the network gate to CI.
- Initial core run: 411/412 passed; startup harness lacked the optional presence
  adapter. Optional frame update fixed it. Focused startup/opening/save rerun: 16/16.
  Full final rerun status will be recorded below.
- Vite production build passes (existing large-chunk warning).
- A clean production-only `npm ci --omit=dev` install in a temporary directory,
  followed by the exact `node server/index.mjs` command, returns 200 from `/healthz`.
- No core rule, data, save schema, skill or quest files changed.

## Runtime/visual evidence status

Two independent real Chromium contexts joined the same map and received each
other's presence. The first movement run was invalidated by a temporary diagnostic
pause used while investigating slow second-window startup. The repeat uses explicit
window focus and pauses rendering of the other window only during startup on the
software GPU. Browser movement, reconnect, geometry stabilization and final screenshot
review are still in progress; do not treat this draft as visually accepted yet.

Existing Chromium/WebKit CI boot, smoke and affected UX remain required before merge.
No physical iPad, hosted Render latency/cold start, continuous animation playback,
or production deployment is claimed.

## Retrieval and impact trace

Direct reads/searches sufficed; no Jev request/cache used. Inspected `AGENTS.md`,
visual workflow, `main.js`, `save.js` startup contracts, map registry/world bounds,
`game.js`/simulation input, hero/animator/model ownership, `dispose.js`, `view.js`
map switching and terrain placement, touch input/menu, startup/opening/browser
helpers, CI workflow/scope, and Godot port notes. Added adapter only reads local
pose/appearance; no unresolved remote-to-core/save consumer exists. Hosting origin,
actual service URL, production frontend configuration, and owner visual acceptance
remain parent-owned decisions.
