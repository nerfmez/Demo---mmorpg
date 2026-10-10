# PR #131 follow-up review

Source base: `0cfbb73c770a428195e44b8310fd46499689e160`. The initial PR's build/core gate (556 tests) and both engines' unified-world jobs passed before these follow-up fixes. The [initial High review](README.md) retains its original evidence and bundle identity; it does not certify the follow-up bundle.

## Fixes and their evidence

The failed [city walkthrough](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37969962012/job/113953770902) exposed a native collision-query defect. At `(56,18)`, the player's radius overlaps the fish vendor at `(55.4,17.5)`, radius `0.34`, across an 8 m grid-cell boundary. Native `isFree` and `move` now query every cell touched by the actor radius. The route solver finds a clear detour; the vendor, roads, collider dimensions and terrain are unchanged.

The [Chromium](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37969961815/job/113954839706) and [WebKit](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37969961815/job/113954839660) opening fixtures expected the old Azure gate. They now require the native Frontier waypoint `(189,-12)`, exact fixed-scene target `(-195,-105)`, a clear endpoint within the actual 3.8 m interaction reach, and collision-safe samples through both regions. The ribbon must reach Frontier; metadata alone cannot pass.

The [saved-title weapon case](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37969961815/job/113954839602) timed out before Continue. An opaque loading screen was still blurring its animated backdrop, competing with preparation/readback work. One local A/B probe produced three 5 s grass-fence timeouts with blur, while disabling it reached readiness in 34.15 s. Blur is now disabled only while loading is opaque; the final creator run asserts `none` during loading and exact `blur(12px)` afterward.

Preparation also removes avoidable work without reducing authored content:

- Ground-color blur yields fall from 872,578 to 4,326 steps across three regions (99.5% fewer yielded steps), with bit-identical float colors.
- The private warm pass submits one primitive per material group and one instance while uploading complete buffers. Ranges, groups, instance counts and renderer state restore before yielding or failing. Hull aliases warm separately; sorting stays off during shortened draws, and a private empty draw advances Three's geometry cache after buffer replacement.
- Gameplay shadow/output shader keys remain enabled during compilation. Automatic shadow updates and `needsUpdate` freeze during private submission, then restore. Actual Three.js cache-key tests cover this contract; missing required shadow maps use the safe upload fallback.
- Grass keeps its original fence plus one recovery fence over the same pixel buffer. The original queue point remains eligible, and the overall 5 s timeout stays bounded. Named startup dependencies and native construction/warm phases make pending prerequisites observable even when the runnable queue is empty.

## Final validation

| Check | Result and scope |
|---|---|
| Focused core checks | 87 distinct cases pass: 75 preceding cases plus 3 grass and 9 warm cases. The final 28 grass/warm/readiness cases were rerun and pass; this is a repeat subset, not 28 additional cases. |
| Chromium city walkthrough | Pass: 15 physical routes, 9 field captures and creator preview; zero recorded page/network errors. |
| Final fresh startup, Medium | 62,849 ms in local Chromium automation; all three regions imported, grass-ready, warmed and prepared. |
| Final creator startup, Low, before fullscreen | 34,899 ms; loading backdrop `none`, restored backdrop `blur(12px)`, creator placement clear. |
| Chromium desktop staff opening | Pass with exit 0: create/Continue, exact remote ribbon, popup/reload, reward queue and separate synthetic v10 Continue preservation. The [route report](followup/opening-report.json) ends 1.6 m from the destination, with clearance through Azure and Frontier. |
| Chromium weapon readiness, 38 models / saved reload | Pass with exit 0: all 38 exact geometry checks, viewport/action/walk/stop draws, three actual GPU completion waits and stable resource counts. Saved readiness before Continue: **30,593 ms**; reload plus Continue: **46,270 ms**. [Measurements](followup/weapon-measurements.json). |
| Build, syntax and diff checks | Pass; existing large-chunk warning remains. |
| Final CI / WebKit / iPad | CI must rerun before merge. No local WebKit or physical iPad validation was performed. |

The browser weapon run used `SKIP_CAPTURES=1`: it still executed every pose draw, all GPU fences and the saved-slot reload; weapon screenshots were omitted. Its GPU waits were 41,482 / 31,278 / 33,599 ms, with stable 1,900 geometries / 127 textures / 146 programs across all three rounds.

The [final runtime report](followup/report.json) records startup dependencies, construction phases, warm submissions, routes and errors. Its timing is software-renderer evidence, not a universal startup-speed or hardware-FPS claim. Private warm-pass counters are not presented as gameplay draw/FPS measurements.

## Exact artifacts and visual criteria

Build and capture SHA-256 identities, plus source-file hashes, are recorded in [identity.json](followup/identity.json).

City captures use 1180 × 820 touch emulation; this is not a physical iPad review.

| Final bundle | SHA-256 |
|---|---|
| `main-BgZxgAnY.js` | `84f2cb0b2b8256d3545e7053dbee4c130ad2fc033e443d1ffb94ecec875d4a30` |
| `main-D51y7kao.css` | `ae4f8273ee5b211873a17f32c7bf9835df3bfa4f8bdbf86da15e7ad7c00bc6ab` |

| Inspected final artifact | Criteria and reviewer |
|---|---|
| [03-guild.png](followup/03-guild.png) | Independent spatial reviewer: complete scenery, character feet/markers and parent placement. |
| [04-forge.png](followup/04-forge.png) | Root reviewer: complete geometry after warm-state restoration; character/NPC feet, cloth and markers align. |
| [09-original-beach.png](followup/09-original-beach.png) | Independent spatial reviewer: terrain, grass and shore remain present; no missing cells or partially drawn primitives. |
| [10-character-creation.png](followup/10-character-creation.png) | Root and independent reviewers: complete character/body preview and clear creator placement. |
| [11-remote-waypoint-route.png](followup/11-remote-waypoint-route.png) | Root reviewer, 1280 × 800 Low: visible near-player ribbon over complete sand/shore. The distant endpoint is checked technically; this still cannot show the entire route. A scripted tracking change leaves the preceding HUD quest label in this frame. |

No missing chunks, partial primitives, displaced scarves, feet or markers were found in these inspected still views. The creator's random-die icon has a missing glyph on this host, and angular dark waist patches remain visible; their baseline origin is unverified and they are recorded as nonblocking limits. Still captures do not establish motion quality or continuous frame pacing.

This follow-up makes no claim of lower total RAM, universal speed, complete world coverage or a mathematically proven 10% subjective-quality bound. No Jev request was needed: the recorded source, direct caller traces, CI logs and focused checks resolved the affected contracts.
