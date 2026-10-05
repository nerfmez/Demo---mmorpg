# Three bow skills — review draft

Source base: `7689351388703366d414f7025fcf83fce5fb4d4a` (current main at start,
includes approved weapon and merged Atlas work). Scope is only the three selected
bow skills. Hunter's Shot and all pre-existing skill numbers remain unchanged.

| Skill | Rank-1 damage before stats/mod increases | MP | Cooldown | Timing/ammo |
|---|---|---:|---:|---|
| ศรง้างหนัก / Heavy Draw | 16 + 1.8 × Attack | 8 | 3.5 s | Fixed 0.55 s draw; 1 arrow, 2 total with Split |
| ห่าฝนศร / Arrow Rain | 4 + 0.45 × Attack per wave | 14 | 5 s | 0.3 s cast, then contact at +0.35/+0.65/+0.95 s; 3 arrows total |
| ศรตรึง / Pinning Arrow | 4 + 0.45 × Attack | 9 | 5.5 s | 0.22 s cast; 1 arrow, 2 total with Split |

Heavy Draw is roughly two basic hits up front, balanced by a committed draw and
longer cooldown; it should be an opening, not replace basic sustained shooting.
Split retains its damage penalty but cannot multiply full direct damage on one
body. Rain's three waves total 12 + 1.35 × Attack only if the enemy stays in the
2.1 m circle, offering modest area utility at a higher MP/ammo cost. Pin trades
most damage for a short repositioning window. These are conservative starting
numbers, not a completed balance pass; all tuning lives in data.

Requirements: bow plus DEX 6/8/6 respectively. Workbench learning consumes
boar tusk/hide for Heavy Draw, hawk feather/tusk for Rain, and wolf fang/hide for
Pin; 30/45/30 gold. Rank upgrades use current crystal/gold costs and DEX
requirements; no character-level gate. No save shape change.

Rain permits existing area mods (including Echo and Concentrated Effect), element
conversion, leech, Knockback and optional Burning Ground. Split/Pierce/Ricochet
cannot fit because there is no trajectory. Burning Ground creates its existing
mod-authored pool; the innate skill creates none. Both new projectile skills
permit trajectory mods. Pin rejects Knockback, including incompatible socketed
mods loaded from saves. Root does not stop existing attack wind-ups/timers;
regular duration is 0.9 s (cap 1.2), boss duration 0.25 s (cap 0.35), followed by
2.5 s immunity. Hits during root or immunity cannot renew it.

## Visual criteria and reference limitations

Reuse the real production hero and bow action. Show a bow-origin release, readable
physical arrow flight/contact, three compact downward waves matching actual
contact times, and a small root cue that ends with the real status. Keep terrain,
monster wind-ups and mobile controls readable; no cracks, giant flash or innate
pool. Existing approved weapon/Atlas assets are preserved.

The required Cartoon FX Remaster gallery was attempted through web browsing and
HTTP; browsing could not open it and HTTP returned 403. No new reference clip was
viewed or copied. The existing physical study in `VFX-REFERENCE.md` (directional
short contact, separate debris decay) and existing Hunter's Shot renderer are the
baseline. This reference-research limitation remains explicit for review.

## Validation / proof

Focused core tests: `tests/core/bow-skills.test.js`. Real-game capture and touch
input: `tests/browser/bow-skills.mjs`; production hero/bow, coastal terrain and
native monster. The fixture grants skills/resources and target HP, disables new
spawns and enemy attack cooldowns for an unobscured short skill sample. Gameplay
movement, cast/resource/contact rules and rendering still run. It does not replace
survival or physical iPad testing. Captures are deterministic 12 fps, normal-time
sequences of 1/60 s simulation steps; motion review is sampled frames unless
normal-speed playback is explicitly recorded below.

Skill Lab uses its existing projectile/ground adapters, with the ground adapter
extended for the same wave timing; its dummy previews are presentation only.
No new Lab site is published by this task. A local Lab preview is not evidence of
live deployment. No merge or deployment before owner proof review and final gates.

Review record and exact final artifact hashes will be added after inspection.
Private proof delivery links belong in the task response, never in this repository.

## Delivery review record — 2026-10-05

Status: review draft, awaiting owner motion/feel review and required final-head CI.
Production renderer identity (SHA-256 of `src/render/vfx.js`):
`571e566e92c176ff85bdd2a5a8e9a9ddf7f06d5d80ccd2f03b9761a69bfabd4f`.

Exact private-delivery originals in `tests/browser/out/bow-skills-chromium/`:

| Artifact | SHA-256 |
|---|---|
| `heavy_draw.mp4` | `ad53d3e105509da408028e116ec8044bf6594d3b6c4ead43e8aa4dd8d3c16a53` |
| `arrow_rain.mp4` | `2a0f22155f119bf5d3b16a3d1184e13ff00580b8264a813a56e3184353361764` |
| `pinning_arrow.mp4` (root correction) | `7379cbd8d16ed0d3b61a800a200a5c95955f6c02ccd0c97009f2dd007f866cbf` |

Each is a 2.5 s, 12 fps sample at normal simulation time, 1180 × 820 touch/tablet
viewport. Reviewed game frames at 0, 0.42, 0.58, 0.83 and 1.58 s across the
sequences; additionally extracted and inspected encoded video frames at 0.58 s
(Heavy Draw), 0.83 s (Rain), 0.42/1.58 s (Pin root/expiry). This was frame review,
not continuous playback or physical iPad testing. Heavy/Rain clips predate the
root-only renderer correction; their relevant rendering is unchanged. The Pin
clip includes the correction. A first narrow-zoom capture was rejected because
the target overlapped the HUD; the delivered originals use normal game zoom and
a four-metre fixture spacing.

Fault found/fixed: root geometry was rotated twice and presented upright. Removed
the second rotation and moved the thin green cue inside the existing target ring;
final frames show the flat ring during root and no ring after expiry. The focused
browser check also verifies the ring plane, actual visibility and cleanup.

Within these sampled views, hero/bow and target silhouettes remain visible, Rain
uses restrained falling arrows with a true-footprint boundary and no innate pool,
and Pin's small green cue does not cover the target's pose. Arrow travel is short
at this fixture spacing; owner normal-speed review is still needed for draw
weight, flight legibility, three-wave rhythm and the subtle root colour at small
screen sizes. Existing red targeting rings, HUD and coastal water remain native
production presentation. Conservative balance values remain tunable.

Validation: original full core suite 284/284, focused cross-system suite 35/35,
and final bow safety/save suite 11/11 passed; builds passed. Heavy/Pin Lab checks
passed; Rain Lab checks exactly three contacts. The initial real-game case passed
all three contact/resource counts and touch drag aim. Local WebKit lacks system
libraries. A later headless-shell start timed out; the supported full Chromium
launch path produced the corrected Pin capture and passed root/geometry checks.
Full Chromium's missing favicon is excluded from asset-failure reporting; other
failed resource URLs remain failures. Final full Chromium browser revalidation passed for all three skills and touch
aim. After all shared meshes warmed, geometry stayed at 136 across one additional
cast of each skill; area, projectile and root visual maps returned to zero. Pin
appeared flat during its real status and expired. Results are recorded in
`tests/browser/out/bow-skills-chromium/results.json`. CI handles
full smoke/UX and WebKit. No merge or deployment has occurred.
