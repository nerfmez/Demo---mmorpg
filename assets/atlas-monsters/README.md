# Atlas monster portraits

18 heads/leading parts cover all live spawns and bosses in both current maps.
The runtime set uses the approved fresh journal watercolor direction. Normal
thornback_wolf is brown; Greyfang remains charcoal grey. The reed-viper identity
uses the approved concept_v3 reed hood. See ../atlas-journal/README.md for source
provenance, pixel review, deterministic extraction and validation.

manifest.json points to the current shared batches in ../atlas-journal. Run
python3 scripts/split-atlas-journal.py to reproduce256px RGBA icons and labelled
50px previews. Original cel sheets, preview and cel-manifest.json are retained
here as historical sources and do not supply the current runtime portraits.

Runtime: public/assets/icons/monster/<id>.png. Only atlasMonsterArt opts into
MONSTER_PORTRAITS. Shared art('monster',id) keeps authored SVGs for world boss
pins and other consumers. Existing50px list footprint and drop pictures remain.
