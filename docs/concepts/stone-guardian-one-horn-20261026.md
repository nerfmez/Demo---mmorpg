# Stone Guardian — ผู้พิทักษ์ศิลาผา (one-horn boss concept)

Status: **visual concept / review only**, 2026-10-26. This is **not** a replacement game implementation, and the generated concept-art images from the chat are **not committed here yet**. Do not represent this note as integrated artwork.

## Purpose and existing game correspondence
- Intended visual successor to the current `horned_warden` boss (ผู้พิทักษ์เขาเหล็ก) in `data/monsters.json`, rather than another bull/ram boss.
- Link its stone surface and construction to the level-21 `crag_plate` armor, `crag_tower_shield` / proposed `crag_greatshield`, and approved `horned_helm` (หมวกเขาผู้พิทักษ์).
- The game already has `warden_horn`, `ancient_core`, and `ruin_shard` drops for `horned_warden`; the stone gear also uses `crag_stone`. Preserve all existing item IDs, game data and drop probabilities unless separately approved.
- Equipment source-art PR #152 includes the proposed `crag_greatshield` and records that Guardian Horn Helmet was approved: [equipment artwork README](https://github.com/nerfmez/Demo---mmorpg/blob/codex/equipment-art-20261025/assets-source/equipment/20261025/README.md).

## Visual identity — mandatory

**Core idea: the boss is the material that the player crafts into the guardian armor and greatshield.** It must have *exactly one* striking horn, arising above the **right side of the boss's head**, like an original oversized natural mineral horn that explains the player helmet's smaller horn. The opposite side is a broken, flat scar/base, **not a second horn**. Avoid bull's-head anatomy.

### Form A: dormant / before aggro
- One enormous asymmetrical gray-slate boulder resting in a ruined clearing, not a recognizable standing biped.
- Its silhouette is compact, almost a small shrine or boulder pile; weathered strata, minimal moss, one ancient beveled stone motif; the single curved horn is partly buried/hidden among upper-right rocks.
- Dormant does not patrol or attack. Tiny amber seams glow only just before waking. This is a visual/encounter proposal; implementation is deferred.

### Transition: awakening
1. Core seams glow amber deep inside the boulder.
2. Surface slabs separate *into specific body parts*: central chest, two uneven shoulders, immense articulated fists, stout rock legs.
3. The unique one-sided horn rotates up onto the newly exposed helmet-shaped head. It remains the SAME physical horn throughout the transformation.
4. Loose stones rise briefly and reconnect; dust falls. Finish in a readable, threatening guardian silhouette.

### Form B: awakened boss
- Massive protective humanoid stone construct, broad angular shoulders, tapered stone waist, sturdy legs, large rough chiseled fists. No fur, flesh, bull snout or ordinary medieval armor.
- The chest should resemble the same angular gray stone plates a player can later craft as `crag_plate`. Slate gray `#8f8a84`, dark gaps `#4a4642`, sparse warm amber `#ff8a2a` only at core and fissures.
- Its left arm carries a greatshield-like fused stone growth, echoing `crag_greatshield` without becoming a detachable human shield. The front could carry a broken giant shield crest.
- The head is small and mostly stone helmet, face a dark slit with twin faint amber eyes; no jaw/teeth and **one asymmetrical curved horn**.
- Clearly readable at the game's roughly 40-degree ARPG camera angle, with broad stylized planes and clean anime outlines. Prefer cel-shaded indie-game art to photorealism or miniature battlefield detail.
- Optional ancient metal rings or minimal rune trims, never enough to read as a fully forged metal golem. Moss/cloth only small accents.

## Visual links to craftable equipment
- `horned_helm`: horn silhouette and dark stone-metal helmet crown originate from the boss head. The single horn is the memorable feature.
- `crag_plate`: plated chest and shoulder layout should obviously come from fallen torso slabs.
- `crag_greatshield`: the huge layered shield plate/left forearm recalls the greatshield. Distinct from existing one-handed `crag_tower_shield`.
- `crag_gauntlets` / `crag_greaves`: braced knuckles, segmented shins and cracked stone boot forms.
- `warden_horn`, `crag_stone`, `ancient_core`, `ruin_shard`: establish material origin without changing drop rules.

## Combat language (concept only)
- `sweep`: heavy asymmetric stone forearm swings across the ground.
- `slam`: gathers weight overhead, plants its arm and creates a low shock wave / debris burst.
- `quake`: sends visible rectangular fissure segments forward; underground stone pillars erupt in readable sequence.
- For a later stage, amber cracks become slightly brighter when enraged. Keep telegraphs distinct and visible from the actual game camera.

## Acceptance criteria for final asset
- Show dormant + assembled silhouette side by side at identical scale reference.
- **One horn only**, consistent side and shape between idle boulder, awakening and complete boss.
- Consistent with source equipment, without accidentally redesigning the helmet/shield/armor.
- Clear front, side, rear, plus 40-degree top-down in-game view.
- Can be built from modest-geometry 3D chunks with clean seams for transformation animations.
- Distinguish boss from `crag_golem` ordinary enemies and `ironhorn_ram` by its immense guardian-like body, stone forearm shield, single horn and core.
- Asset images and working files to be added only after artwork review; no runtime/model edits in this PR.

## Reference assets and source
- [Guardian horn helmet icon](https://github.com/nerfmez/Demo---mmorpg/blob/main/public/assets/icons/gear/horned_helm.png)
- [Crag plate icon](https://github.com/nerfmez/Demo---mmorpg/blob/main/public/assets/icons/gear/crag_plate.png)
- [Crag tower shield icon](https://github.com/nerfmez/Demo---mmorpg/blob/main/public/assets/icons/gear/crag_tower_shield.png)
- [Greatshield concept from PR #152](https://github.com/nerfmez/Demo---mmorpg/blob/codex/equipment-art-20261025/assets-source/equipment/20261025/icons/crag_greatshield.png)
- [Existing horned warden concept](https://github.com/nerfmez/Demo---mmorpg/blob/main/assets/meshy/monsters/horned_warden_concept.png)
