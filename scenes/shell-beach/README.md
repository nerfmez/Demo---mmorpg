# Singing Conch Coast — standalone draft

Retains the finished ruins scene and starts the next owner-requested area: a giant hollow conch on a broad sandy bay. This scene stays outside the game. The approved beach and forest sources remain unchanged.

The reference `concept.png` is the repository's `docs/reference/landscapes-40deg-20261022/azure-coast/singing-conch-coast.png` at concept-branch commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`.

## Build

From the repository root, with Python and Pillow available:

```sh
python3 scenes/shell-beach/prepare.py
python3 scenes/shell-beach/assemble.py
```

This writes `index.html` and `generated.mjs` (both ignored). The default uses the approved beach's Three 0.170 CDN import map. For the self-contained public review, pass an existing offline preview's embedded import map:

```sh
python3 scenes/shell-beach/assemble.py --modules-from /absolute/path/to/offline-review.html
```

`prepare.py` derives the portable terrain and cliff builders from the retained ruins source, then supplies this bay's terraces, left stair, sand palette and shoreline. `scene.js` authors the shell, smaller scallops, sea stacks and game foliage. `assemble.py` reuses the approved opening beach's renderer, paint shader, palms, foliage, hero GLB and water directly from `scenes/beach/src.html`.

## Water contract

The owner explicitly requested the opening beach's water system. Its colors, clarity, animated caustics, sparkles, shoreline wash and foam equations are reused. Only the shoreline function, sea mesh coverage and obstacle array size change for the bay. The ground descends under the water. Do not replace this system with a separate water style.

## Review state

See [REVIEW.md](REVIEW.md). This is an owner-review draft, not approved for game integration or merge. Tap the 3D sand to walk; the wipe slider compares against the concept.
