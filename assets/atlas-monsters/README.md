# Atlas monster portraits

18 close-up face/leading-part portraits for the Atlas monster/drop list. All
live spawns and bosses on Azure Coast and Greenhollow Frontier are covered.

The three source sheets were generated in six-creature batches with the built-in
image_gen tool. Existing Meshy concepts establish identity; approved
`reed_viper_concept_v3.png` supplies the reed hood. Existing item artwork supplies
the anime cel shading target. The final hawk sheet removes unintended cyan
crystals so its silhouette is feathered, as in the approved concept.

`manifest.json` records source revision, source/image hashes, 1-based row/column
to monster IDs, reference paths and actual alpha bounds. Run
`python3 scripts/split-monster-sheets.py` from the repository root to reproduce
256px RGBA runtime PNGs and the labelled 50px contact preview. Requires Pillow,
numpy and scipy. Alpha components preserve features crossing nominal cell cuts;
detached sentinel stones belong to its reserved cell. Only near-zero detached
background specks are discarded; original contour alpha is retained.

Runtime paths are `public/assets/icons/monster/<id>.png`. Only `atlasMonsterArt`
opts into the central `MONSTER_PORTRAITS` registry; other monster-art consumers
retain their original SVG. The existing 50px list footprint and drop pictures
remain unchanged. Source sheets are editing/review assets, not shipped sheets.
