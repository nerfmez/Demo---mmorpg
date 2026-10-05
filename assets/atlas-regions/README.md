# Atlas location card illustrations

17 distinct journal watercolor landmark/biome vignettes cover the two current
maps. Repeated zone names are keyed by BOTH mapId and zoneId. See
../atlas-journal/README.md for source provenance, pixel review and validation.

manifest.json records the current shared batches. Run
python3 scripts/split-atlas-journal.py to reproduce256px RGBA runtime PNGs and
labelled50px previews. The earlier cel sheets, preview and cel-manifest.json
remain here as historical sources, excluded from current runtime extraction.

Runtime: public/assets/icons/region/<mapId>/<zoneId>.png. atlasRegionArt opts into
REGION_PORTRAITS only for left selection cards. Dimensions, Thai names, status,
click actions and selected-region SVG cover remain. Missing future IDs retain
authored zone SVG fallback; world terrain, navigation and markers are unchanged.
