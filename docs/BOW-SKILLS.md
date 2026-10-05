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
