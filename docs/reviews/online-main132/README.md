# Local main #132 / online integration review

Online checkpoint: `1414d4fcfefdbd56c4060e582b0c48a71a581131`.
Verified latest main: `10b8f73072bf17c824c6e527baa25dcf10e101a1`.
Normal merge: `7ef965faf2beaf010989c6b632e80a71c2a883fc`, parents exactly those two
commits. No conflicts occurred. GODOT-PORT auto-merged and retains both main's static
culling/exterior-tree contracts and the online protocol-3 appendix.

No product follow-up edit was needed. Main's environment, region, spatial-region and
terrain-domain sources match main exactly; all online protocol/gate/actor/effect/main
integration and responsive CSS sources match the online checkpoint. Core/data,
accepted landmarks/outfits/grass, HUD/input, asynchronous residency and save sources
are preserved. Additional edits are limited to the focused fixture and handoff docs.

## Integration evidence

Read current AGENTS.md and directly traced the relevant rendering and presence
contracts; no unresolved source discovery needed Jev. Reused the visual-quality
workflow. Remote rig roots, scarves and effects are added to `view.scene`, outside
`region.root`; only the latter is flattened into static resident cells.

Both `npm run build:player` and `npm run build:offline` pass. Player build uses the
public configured endpoint, but no browser opens that build in this task. Offline
has the existing large-chunk advisory. No broad suites, full-world startup loops,
long leak runs, CI polling or Pages monitoring were run.

One focused command passed **9/9 assertions**, errors/external HTTP requests both 0:

```sh
ONLINE_CULLING=1 ONLINE_SEAMS_ONLY=1 npm run test:online
```

Two real browser contexts use the existing flat scene, real OpenWorldGame,
keyboard/CDP-touch input, localhost WebSocket relay and production remote actors.
The optional fixture adds two static drawables prepared with main's real
`prepareSpatialRegion`/`updateSpatialRegion`, plus a directional shadow. Camera
movement with shadows disabled detaches both static objects; returning and enabling
shadows restores both (**2 → 0 → 2**). The static drawables receive main's own box
frustum override, including transformed-root bounds used during seam placement.

A real keyboard attack from the second browser creates the remote bow animation
and bounded hunter-shot cue. Remote rig/scarf and the live arrow remain attached
directly to the scene, never captured in the static records or given their overrides.
The subsequent Moonroot touch and Frontier keyboard crossings retain IDs/rigs and
agree on global positions between starting origins `[25,-178.5]` and `[0,0]`.
Room isolation/rejoin, lifecycle handlers, Supplies/Close and unchanged offline
slot bytes also pass. Close remains `(687,19,44,44)` at 760×430.

The parent reported PR #132's 26 exact-head CI checks passing. They are reused for
main's unchanged rendering paths; this is not an exact-head CI claim for the local
integration branch. Prior protocol/save/gate/resource and responsive-layout results
at the online checkpoint are reused where unchanged. The parent's Pages run
`38040604064` was neither polled nor taken over. The previously documented fixture
timing variance and separate full-world touch limits remain disclosed.

## Actual visual inspection

Acceptance criteria: current known bow/outfit and cyan marker remain visible;
camera/shadow culling does not capture the peer or its cosmetic effect; native
keyboard/touch seam motion does not replace the actor; accepted bounded UI remains.

Inspected these exact 760×430 PNGs, with SHA-256 identities and runtime source hashes
in [results.json](results.json):

- [Idle peer](static-culling-peer-idle.png): imported bow/quiver, normal proportions,
  cyan ring and actor shadow visible alongside the static fixture.
- [Peer shot](static-culling-peer-shot.png): authored bow release pose, ring and
  actor/bow shadow remain visible after static detach/restore. This is an early
  release frame; live arrow scene ownership is separately asserted. It does not
  establish arrow-flight readability or continuous motion quality.
- [Moonroot seam](seam-two-client-moonroot.png): peer remains rendered on the other
  side of the region boundary, using the receiver's fixed origin.

No new major visible defect was observed in these sampled views. These are stills,
not normal-speed playback. No resident terrain/foliage is constructed by this fixture;
use main's preserved camp/shore/fountain/join evidence for the exterior-tree/camera
change. It cannot establish whole-world clipping, actual iPad FPS or hosted latency.

## Exact parent-owned preview settings

The local integration commit is not published. Publication needs explicit owner
approval; parent owns all manual hosting steps. Existing service
`srv-db4bh7rtqb8s73eo7neg`: **Free**, Node, **Singapore**, one instance, root directory
repository root, auto-deploy off. No service, resource or credential is created.

| Setting | Exact value |
| --- | --- |
| Server build | `npm ci --omit=dev` |
| Server start | `node server/index.mjs` |
| Node env | `NODE_VERSION=22` |
| Listen | `0.0.0.0:$PORT` |
| Health | `/healthz`, HTTP 200 `{"ok":true,"prototype":"presence-v3","protocol":3}` |
| Player build | `npm ci && npm run build:player` |
| Developer/offline build | `npm ci && npm run build:offline` |
| Endpoint | `wss://frontier-presence-prototype.onrender.com/presence` |
| Authorized preview origins | `https://nerfmez.github.io,http://127.0.0.1:4173` |
| Local frontend preview | `npm run preview -- --host 127.0.0.1 --port 4173` |

Endpoint/origin allowlist and protocol remain unchanged. Use matching reviewed v3
client/server heads for a future preview. Health proves liveness/version only.
Default Pages build remains offline unless parent explicitly selects player mode.

The Render hostname remains restricted by the earlier `ERR_BLOCKED_BY_CLIENT` denial.
This task did not contact it, proxy it or change hostname/network/executor. Do not
execute hosted preview from this restricted browser path. Hosted/device verification
and publication remain parent/owner steps; no push, remote PR mutation, PR merge or
deployment occurred.
