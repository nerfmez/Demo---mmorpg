# Local review — online-first visual prototype, PR #115

Status: local implementation complete for parent/owner review within the limits
below. No remote publication, hosted verification or release readiness is claimed.

Subsequent main #132 integration is recorded separately in
[the focused culling integration review](../online-main132/README.md). This record
retains the original checkpoint evidence and limits.

## Source and preservation

Base checkpoint `30cdc39cb10d2cfbaa18abe51297d2c134929066`; integrated main
`7beaf36a9e238f15d226ce457ccef271f498c233`, normally merged at `d72af8f…`.
The final local commit contains this review. `focused-results.json` records exact
runtime file and artifact SHA-256 hashes, so the source/artifact identity does not
depend on embedding the final commit's own hash inside itself.

Core/data, accepted hero/outfits, grass, resident-world/View, main HUD/Input/Panels
and save implementation match integrated main. Presence responsive CSS matches
the accepted branch checkpoint. The only main integration additions are the
presence adapter, online gate input/pause guards and cosmetic event forwarding;
Supplies session/F references and startup preparation remain intact.

Direct repository reads and diff tracing resolved the contracts; no Jev request
was needed. Inspected AGENTS.md, visual workflow, unified-world/open-world-game,
protocol/client/server, main startup/session, gate/player/offline entries, remote
actors/effects, model/animator ownership, relevant tests and port documentation.

## Focused evidence

- Network: 11/11 cases passed, including three origin conversions, canonical seam
  metadata, same membership/identity across all regions, exterior-notch rejection,
  room/native-map isolation, server identity, message/payload/origin/asset validation,
  rate limits, appearance/action deduplication and reconnect. The subsequently
  added version-mismatch/deadline case passed 1/1; unaffected results were reused.
- Core: 16/16 save/startup cases passed. The added actual-main-frame online gate
  case passed 1/1, establishing gameplay freeze and held-input reset with Supplies
  still attached. Save poses remain native-region v13 even with a different origin.
- Builds: explicit player mode with localhost endpoint and explicit offline mode
  passed. Offline emitted the existing large-chunk advisory; no new splitting or
  broad performance work was attempted. Public `.env.player` endpoint is separately
  documented; no browser in this task used it.
- Production entry: actual compiled index showed Connecting and Failed/Retry with
  an explicit offline link, fetched neither the game nor renderer chunk and never
  created `__frontier`. The first assertion confused the tiny entry named `main`
  with the actual game module; it was corrected to identify the game module itself.
- Production-style flat fixture: actual UI/input/transport, OpenWorldGame, current
  humanoid/weapon assets and remote effects. Matching melee/fire/frost poses,
  appearance replacement, duplicate suppression, cancellation, disconnect/reconnect,
  leave and owned-resource cleanup passed. After effect warmup, all three samples
  were 35 geometries / 39 textures / 0 active effects, with no growth.
- Isolated lifecycle/seam run: 8/8 assertions passed using two real browser contexts
  with initial origins Moonroot `[25,-178.5]` and Azure `[0,0]`. Keyboard crossed
  Moonroot → Azure and Azure → Frontier; CDP touch joystick crossed Azure → Moonroot.
  Both receivers agreed on global positions, without UUID or rig replacement.
  Actual room controls isolated/rejoined peers; Supplies/Close remained reachable;
  existing offline slot bytes stayed unchanged. BFCache **handler** events stopped
  and resumed the socket with one fixture world; native browser BFCache restoration
  itself was not exercised.

The extended combined run passed visual/resource/layout/reconnect/BFCache assertions
then timed out at a five-second keyboard seam wait. An isolated attempt also timed
out with delivered keyboard input and an unblocked gate; a subsequent isolated run
passed all seam/lifecycle assertions without product code changes. This fixture
timing variance is disclosed, not diagnosed as a product lag fix. The initial seam
run also passed before adding the lifecycle extension. No full-world retry loop,
full suite, long stress test or CI polling was run.

Relevant commands are in `MULTIPLAYER-PRESENCE.md`. Targeted follow-ups:

```sh
ONLINE_SEAMS_ONLY=1 npm run test:online
node --test --test-name-pattern='version mismatch' tests/network/presence.test.mjs
node --test --test-name-pattern='online gate freezes' tests/core/startup-drawing.test.js
```

## Bounds and actual visual inspection

Criteria: existing anime proportions/outfits, known weapon in the hand, readable
matching cast/swing cues, cyan remote marker, clear admission states, drawer clear
of the player HUD and Supplies, reachable Join/Retry/Close at tablet and landscape.

| Viewport | Drawer x/y/w/h | HUD right edge | Clearance | Join/Retry height |
| --- | --- | --- | --- | --- |
| 1024×768 | 328 / 64 / 300 / 243 | 308 | 20 px | 44 px |
| 760×430 | 244 / 132 / 300 / 228 | 234 | 10 px | 44 px |

Landscape Supplies: ammo `(254,64,196,54.69)`, auto-potions `(566,214,178,44)`;
drawer bottom 360 stays above viewport bottom 430. Panel Close `(687,19,44,44)`
was hit and remains entirely in view. Room text did not propagate the F key.
Main's exposed `F.supplies` attachment is preserved independently of that input check.

Inspected the actual delivered PNGs individually (hashes in `focused-results.json`):

- `production-connecting.png`, `production-failed.png`: actual compiled player entry
  at 1024×768. Clear state, Retry and explicit offline link; no world behind it.
- `remote-ranger-sword.png`, `remote-slash-hit.png`: current ranger clothing/hood,
  imported sword and slash pose/cut at approximately 0.205 seconds.
- `remote-firebolt.png`, `remote-frost.png`: current spore outfit/staff and fire/ice cues.
- `remote-fire-start.png`, `remote-fire-hit.png`, `remote-fire-release.png`: side view
  at 0.05 / 0.25 / 0.40 seconds, advanced with 1/60-second animation steps.
- `online-controls-tablet.png`, `online-controls-landscape.png`,
  `reconnecting-landscape.png`, `supplies-close-landscape.png`: actual bounded UI,
  readable gate and reachable panel Close. Opening the drawer intentionally covers
  part of the review scene while pausing input.
- `seam-two-client-moonroot.png`: remote bow actor stays rendered across the region
  boundary with the two clients using different fixed origins.

No major visible defect was observed in these sampled views. Characters preserve
the accepted proportions/clothing; current weapon grip and the cyan marker read
clearly. Cut/fire/frost cues remain recognizable. These are **sampled frames**, not
normal-speed playback inspection. A flat scene cannot establish terrain seating,
full-world occlusion, pose blending across every skill or real device performance.

## Remaining limits and handoff

Restricted Render hostname was not contacted. The prior browser denial
`ERR_BLOCKED_BY_CLIENT` still blocks hosted verification in this execution path;
no proxy, alternate hostname/network/executor or origin weakening was used.
Matching protocol-3 manual server deployment and owner two-session review are parent
steps after local approval. Origin already authorized for a future local hosted
preview: `http://127.0.0.1:4173`, alongside `https://nerfmez.github.io`.

Prior touch full-world construction timeouts remain separate from this focused UI
result. Parent-provided main runs `38016483627` and `38018113797` are reused only for
main's own source. Run `38018680916` has parent-reported unrelated guide-count/icons/
UX/capture failures; those are neither fixed nor re-polled here. Old run 37737906296
and older two-client checks are historical evidence only, not exact-head v3 CI.

Real iPad Safari frame rate, hosted latency/free-service wake, full-world two-player
rendering and continuous animation feel still need owner review. Persistent/shared
authority remains intentionally outside this experimental milestone. See
`PR-SUMMARY.md` for the prepared description; remote PR #115 was not mutated.
