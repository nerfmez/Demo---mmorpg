# VFX style reference

ภาพอ้างอิงเอฟเฟกต์ของเจ้าของเกม ใช้เป็นแนวทางเมื่อทำหรือปรับเอฟเฟกต์ ไม่ใช่ของที่จะนำมาใส่ในเกมตรงๆ

**Reference:** [Cartoon FX Remaster gallery](https://www.jeanmoreno.com/unity/cartoonfxremaster_gallery/?fxpp=8&page=1) (Jean Moreno, Unity Asset Store).

Use it when you add or restyle effects. It is a style target only: the packs are paid Unity assets, so never copy their textures, meshes or prefabs. Rebuild the look in our own renderer (`src/render/vfx.js`, `particles.js`, `trail.js`, `ribbon.js`) with tunable numbers in `data/combat-fx.json`.

## What to take from it

- Chunky, readable shapes: bold flash cores, star/spark bursts, rings, short thick slash arcs. No fine noise.
- Short, punchy timing: fast pop-in, short hold, eased fade-out.
- Strong per-element colour identity. Match it to our `ELEMENT` palette in `src/render/vfx.js`.
- Categories in the gallery that map to our needs: hits and slashes, sword trails per element, elemental projectiles and explosions, auras and shields, pickups, status expressions (stun stars, angry/happy marks), water splashes and ripples, dust, leaves and weather.

## How to adapt it to Frontier

- Keep our anime cel look (see `AGENTS.md`). The effects must not hide monster wind-ups or turn combat into a screen-clearing race. Effect shapes still follow gameplay hit areas.
- Fit iPad performance: pooled/reused particles, no per-frame allocations, `disposeObject()` for anything removed.
- Change the shape, colour and timing to suit our skills and mods (split, pierce, chain, ground, echo, element, trigger). Don't copy a gallery effect one to one.

## Progress

- Foundation and pilot (Firebolt): shape atlas (`src/render/fx-shapes.js`), two-tone cel particles, per-skill looks in `data/combat-fx.json` `skills`, shared cone geometry for spikes/stones. Focused capture: `node tests/browser/skill-fx.mjs firebolt`.
- Next: the other skills in groups of 3–4, element-specific impacts, visible mods, a reduced-effects setting.
