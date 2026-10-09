# Current-main presence integration

Normal merge: `13c81712bcd00826b4c337ce1bb5afe1f55216f6`, parents
`06c2cf63fd085abb984b2d8450b50f26010f20b0` and main
`093a4a59d66f54b42258a2c07f2114821d2a5958`. Draft PR #115 remains the same task.

Resolved only the two merge conflicts: kept both Supplies/session/F exposure and
presence initialization in `src/main.js`; kept main's entire new Godot-port appendix
and the presence appendix. Core/data/saves, landmarks, inventory, bounded UI,
coastal terrain and asynchronous rendering/streaming are identical to main.
The subsequent presence CSS adjustment clears main's new compact HUD position;
it moves only the experimental drawer. The explicit `.env.presence` build profile
contains the public Render endpoint; normal builds remain without an endpoint.

## Focused evidence checkpoint

- 6/6 real-WebSocket network tests pass. Added registered-map parity and Moonroot
  join/movement/map isolation/bounds rejection coverage. The adapter case was then
  extended to streamed Moonroot handover and rechecked alone: 1/1 passes.
- 21/21 affected startup-drawing/scheduling/readiness tests pass.
- Production build passes, retaining the existing large-chunk warning.
- Vite configuration check passes: explicit presence mode loads the actual WSS URL;
  production mode has no configured endpoint.
- Historical exact-head [CI 37737906296](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37737906296)
  is completed/success at `06c2cf63fd085abb984b2d8450b50f26010f20b0`. Reuse prior
  network/two-client/resource/save evidence where unaffected; do not treat it as
  CI evidence for this merge. No broad suites or new CI polling were performed.

The integrated two-client Azure run reached desktop readiness but timed out on
touch-world construction. One retry reduced world rendering to 0.5 scale from
startup. It also timed out at 180 seconds: time 0, staticReady false, importedState
`building`, 321722 queue steps, no page errors. The failure predates the drawer
position adjustment. [Failure log](reviews/presence-integration/azure-startup-failure.txt)
and [failure screenshot](reviews/presence-integration/azure-startup-failure.png) are
retained; this is not a passing capture or a hardware-iPad performance result.
The focused Moonroot two-client case and final visual review are pending at this
checkpoint. No readiness claim is made from the failed Azure run.

## Parent-owned hosted verification

Service: `srv-db4bh7rtqb8s73eo7neg`, Free/Singapore, manual deployment.
Build `npm ci --omit=dev`; start `node server/index.mjs`; Node 22; `/healthz`;
listen `0.0.0.0:$PORT`. Endpoint:
`wss://frontier-presence-prototype.onrender.com/presence`.
Health: `https://frontier-presence-prototype.onrender.com/healthz`.
The owner confirmed no payment card. No resources or credentials created here.

The parent has now explicitly added the test origin. Exact current setting:
`ALLOWED_ORIGINS=https://nerfmez.github.io,http://127.0.0.1:4173`.
The configuration change redeployed old `06c2cf`, so hosted Moonroot verification
must wait for a parent-confirmed manual deployment of the pushed integrated head.
An old-head health response is not readiness. The harness's hosted mode is prepared
but has not run; it never reconfigures/restarts Render. No frontend deployment or
PR merge is authorized. See the [deployment guide](MULTIPLAYER-PRESENCE.md).

Direct reads/searches sufficed, no Jev request. Inspected current AGENTS, visual
workflow and Render web-service guidance; main conflict sites/session/frame loop;
Supplies/input/panel actions; browser/node map registry and Moonroot data;
server/client/remote renderer and previous evidence; focused test harnesses, Vite
configuration, CI integration and Godot appendix. Unresolved: hosted matching-head
readiness, final hosted two-client evidence, physical iPad and continuous visual
motion review.

## Focused responsive follow-up

The later tablet drawer/player-frame overlap is fixed by the presence-only CSS
change. [Focused review and screenshots](PRESENCE-RESPONSIVE-REVIEW.md) record
1024×768 and 760×430 bounds, real keyboard/joystick input, Supplies actions and
reachable Close controls using the production-style UI harness with rendering
and external networking omitted. This does not resolve touch-world startup
timeouts or the restricted hosted-browser verification.
