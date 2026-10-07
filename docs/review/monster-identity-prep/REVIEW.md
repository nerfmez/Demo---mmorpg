# Review record — six-monster identity preparation

Status: **ready for owner review within the limits below; names/art are candidates, not integrated or approved.**

Source revisions: main `0e2d9fd58b7e6e10b6226158130e642d366c301a`; latest PR106 `867147209c520c05c8f32b7b5dfb5710ec1a899d`. Concepts were initially read at `a4bb10d9374f256e38893ac2f3f9a786dfb7f6a9`; the later commit merges main's PR104 work. The latest PR diff confirms no changes to the six concept sheets, monster GLBs, gameplay/quest/recipe data or UI. The parent worktree remains untouched. This preparation lives on the separate local branch `codex/monster-identity-prep-20261007`.

## Inspected artifacts and references

All six exact PR106 concept JPEGs were opened and inspected individually on 2026-10-07, including phone screenshot UI and the supplied slime, boar, viper and wisp drop drawings. `references/approved-journal-style.png` is the unchanged approved journal study; the current ten inventory materials were inspected as `existing-materials.png`. Source paths, SHA256 hashes and ten original Library file IDs are in `mapping.json`.

Final deliverables: `candidate-icons/monster/*.png` (six 256×256 RGBA files), `candidate-icons/material/*.png` (two new and eight unchanged 512×512 RGBA files). `candidate-manifest.json` identifies the exact source sheets, alpha bounds and output hashes. Original generated images remain in `/workspace/generated_images`; copies and the initial wisp cell remain in `sheets/`.

Final pixel review: `owner-preview.png`, `monster-pixel-review.png`, `material-pixel-review.png`, `material-old-new.png` and `small-icon-review.png`. Every final individual asset was viewed in labelled cream/dark composites at large size and at exact 32/40/50px. Final corrected wisp and updated comparison/label boards were re-inspected after the last changes. These are static preview boards, not screenshots of the live game.

## Observable criteria and findings

- Identity: curling foam/salt slime; heavy rust-orange horned boar; dark masked normal wolf; broad silver-maned alpha; olive coiled viper with gold-edged reed blades; blue flame wisp with one golden core. All six match the supplied concept identities in the reviewed views.
- Style: irregular ink and watercolor pigment on monster portraits; isolated painted/cel item art consistent with existing inventory materials. No rasterized 3D preview is used for icon art.
- Separation: six independent portraits and two independent new material drawings. Transparent source-component ownership preserves detached drops/flame curls; no color-key background removal or scripted repainting. No neighboring fragments, rectangular matte, clipped horn/reed/flame tips or baked labels were observed in final icons.
- Readability: at 50px the normal wolf's darker compact neck differs from the boss's wider silver/cream mane. The new viper scale reads as a narrow gold-edged leaf rather than the former green crystal. The wisp core is visibly gold instead of a cyan spiral. At 32px thin fur/ink strokes and some flame detail soften; main silhouettes and colors remain distinguishable in the standalone boards.
- Fault fixed: the first generated wisp cell contained a second tiny golden core in a detached flame. A separate image edit removed that gold-containing flame and the final correction retains one main golden core with blue-only motes. Other five portrait crops were preserved. The initial cell is explicitly superseded in the manifest.
- Fault fixed: the review board's Thai font could not render the original separator/arrow glyphs. Those board-only labels now use supported Thai/plain punctuation. Individual assets contain no labels.

## Technical evidence and preservation

The export verifies clean outer padding and RGBA output for new icons. All eight reused materials retain their original SHA256 hashes. `mapping.json` traces six stable monster IDs, ten stable material IDs, 106 recipe consumers, shared loot sources, literal quest text, grade promotion costs and legacy gear material metadata. `proposed-labels.json` has 46 before/proposed label fields, including 16 optional dependent gear-name fields; none were applied.

No edits to `data/`, `src/`, `public/`, existing `assets/`, stats, drop odds/amounts, recipes, item values, quest counts/rewards, save format or IDs. No model changes or paid Meshy calls. No changes to PR106, PR102/103/104, Moonroot/mole/accessory/beetle proposals, existing files or sharing settings.

No game test/build/CI run: this branch contains preparation documents and review assets only, per AGENTS.md's planning/docs validation tier. JSON pointer baselines, source/output hashes, PNG decoding, ZIP integrity and the scoped Git diff were inspected.

## Remaining limits / integration work

Owner approval of new art and proposed names is pending. English monster names come from actual concept titles; Thai translations and dependent gear labels remain proposals. The reused ivory icon is a horn, so its proposed display name is Boarbull Horn while `boar_tusk` stays stable. Do not add the concept's extra tusk or salt crystal as a new drop.

GLBs were not rendered in this icon task; appearance claims are grounded in the supplied concept pixels, not new model/animation testing. Actual field-guide, boss-marker, inventory-source, quest, ground-loot and device review remain part of later integration. In particular, shared `art('monster',id)` still resolves old SVGs in main and needs a six-ID raster opt-in after approval; existing Atlas tests assert those SVGs and must be updated for the six selected identities while retaining other fallbacks. Rebuilding the old journal sheets must not overwrite approved overrides. The preservation constraints and exact affected files are in `MAPPING.md`.

No merge, deployment or physical iPad/Safari claim.
