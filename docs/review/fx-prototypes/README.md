# Skill effect prototypes (standalone)

Standalone Three.js sketches made for owner review on 2026-10-10. They are **not**
connected to the game: no `src/` code, data or Skill Lab entry uses them. Each page
has its own placeholder caster and training dummies, uses the real skill numbers from
`data/skills.json`, and renders deterministically through `window.renderAt(t)`.

| Skill | Page | Video | What it shows |
|---|---|---|---|
| Chain Spark | `chain-spark.html` | `chain-spark.mp4` | Thin angular bolts, 3 chain hops with 0.85 falloff, ragged noise contact flashes, ground-crawling arcs |
| Frost Nova | `frost-nova.html` | `frost-nova.mp4` | 4.2 m frost spread with a torn noise edge, clustered hexagonal crystals, chill tint, melt into holes |
| Flame Stream | `flame-stream.html` | `flame-stream.mp4` | Dragon-breath channel: pressurised core widening into a 55° cone, one outlined fire mass (density buffer + composite), dissolving tail, depth-aware so dummies stand inside the fire with a readable rim |

Videos: normal speed ×3, then slow motion. `three.module.js` is Three.js r169 so the
pages open without the game build.

## Open or re-render

Serve this folder with any static server and open a page; nothing animates on its own,
call `renderAt(seconds)` from the console. To render frames (needs `playwright`):

```
PAGE=flame-stream.html node docs/review/fx-prototypes/capture.mjs /tmp/flame 60 1
ffmpeg -framerate 60 -i /tmp/flame/f%04d.png -pix_fmt yuv420p flame.mp4
```

## Not done

- Not in the game or Skill Lab. Porting means rebuilding them in `src/render/` with
  numbers in `data/combat-fx.json`, per `docs/VFX-REFERENCE.md` and `docs/SKILL-LAB.md`.
- The Cartoon FX reference gallery was blocked by the container network, so no
  reference clips were studied for these sketches.
- Rendered with SwiftShader; no iPad performance measured.
