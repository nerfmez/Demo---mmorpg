# Atlas location card illustrations

17 distinct biome/landmark vignettes, one for each region in the two current maps.
Names repeated between maps are keyed by both map ID and zone ID.

Generated with built-in image_gen in coherent six/six/five-location sheets using
the existing Atlas, current map catalog, existing authored region art and harbor
references. These are small field-guide illustrations, not geographic maps.
They do not alter terrain, structures or navigation.

`manifest.json` records source revision, source/output hashes, 1-based row/column
to map/zone IDs and alpha bounds. Run `python3 scripts/split-region-sheets.py`
from the repository root to reproduce the 256px RGBA runtime PNGs and labelled
60px contact preview. Requires Pillow, numpy and scipy. Alpha-component extraction
preserves vignette edges beyond grid lines and prevents adjacent-tile fragments.

Runtime paths are `public/assets/icons/region/<mapId>/<zoneId>.png`.
`atlasRegionArt` opts into the central `REGION_PORTRAITS` registry only on the
left region selection cards. Existing card dimensions, names, status, click
actions and the selected-region cover are preserved. Missing future assets
fall back to authored zone SVGs.
