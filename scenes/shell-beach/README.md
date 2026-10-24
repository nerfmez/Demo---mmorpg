# Singing Conch Coast — preliminary owner approval

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

`prepare.py` derives the portable terrain and cliff builders from the retained ruins source, then supplies this bay's terraces, left stair, sand palette and shoreline. `conch.js` authors expanding whorls, the reference-traced folded aperture and the inner chamber. `path.js` supplies one curved ribbon for terrain, collision and plant clearance; `paving.js` follows its local tangent and forms rock banks. `scene.js` authors smaller scallops, sea stacks and game foliage. `assemble.py` reuses the approved opening beach's renderer, paint shader, palms, foliage, hero GLB and water directly from `scenes/beach/src.html`.

## Water contract

The owner explicitly requested the opening beach's water system. Its colors, clarity, animated caustics, sparkles, shoreline wash and foam equations are reused. Only the shoreline function, sea mesh coverage and obstacle array size change for the bay. The ground descends under the water. Do not replace this system with a separate water style.

## Space and route revision

The world scale is now 3.12 (previously 2.4), with camera distance 93.6. Width and depth each increase 30%; total terrain bounds increase from 144 × 129.6 to 187.2 × 168.48 world units. This is an increase in physical space; hero scale and speed remain unchanged. The left and right terrace edges also retreat from the central sand. The water equations remain those of the opening beach.

## Review state

**ผ่านเบื้องต้น — accepted by the owner on 23 October 2026.** Preserve [published version 6](https://frontier-ruins-review-oct23.ballboy-lnw.chatgpt.site/shell-beach/?v=6) as the baseline for further work: reference-led conch, continuous curved path, 30% wider/deeper space and the opening beach water. See [REVIEW.md](REVIEW.md) for the exact artifact and remaining verification limits. Game integration or merge was not requested. Tap the 3D sand to walk; the wipe slider compares against the concept.
