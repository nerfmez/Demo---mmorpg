# VFX reference library and research workflow

เว็บนี้เป็น **คลังอ้างอิงสำหรับค้นและศึกษา VFX ตามสกิลที่กำลังทำจริง** และเป็นแนวทางด้านสไตล์ของเกม ไม่ใช่แค่ mood board และไม่ใช่ asset ที่จะนำมาใส่เกมตรง ๆ

**Primary reference library:** [Cartoon FX Remaster gallery](https://www.jeanmoreno.com/unity/cartoonfxremaster_gallery/?fxpp=8&page=1) (Jean Moreno, Unity Asset Store).

The packs are paid Unity assets. Never copy, extract or reproduce their textures, meshes, prefabs or a complete effect one-to-one. Study the visual language and motion, then rebuild an original effect in our renderer (`src/render/vfx.js`, `particles.js`, `trail.js`, `ribbon.js`) with tunable numbers in `data/combat-fx.json`.

## Required workflow for new or reworked skill VFX

Before implementing a new combat effect, or substantially redesigning an existing one:

1. **Search the gallery for the actual skill need.** Use the skill's element plus function, not only the element: for example lightning/electric + strike, impact, explosion, projectile, barrier, surface, aura, trail or status.
2. **Inspect several relevant effects when available (normally 2–5).** Do not pick one clip and imitate it. Compare what each reference does well.
3. **Break the motion into phases:** anticipation/charge, main attack motion, hit/impact, secondary sparks/debris/trail, and lingering/status/ground effect when the gameplay needs them.
4. **Study transferable principles:** silhouette and shape progression, timing, acceleration/easing, layer order, scale change, spacing, colour hierarchy, impact readability and how long each phase remains visible.
5. **Design an original Frontier version.** Combine only the useful principles, change shapes/timing/colour/layering for our skill mechanics, camera and anime cel-shaded world, and keep the visual footprint aligned with the real gameplay hit area.
6. **Validate in the actual game camera.** Iterate in the [Skill Lab](SKILL-LAB.md) (same camera angle, loads in seconds) and share its link with the owner; then check readability against monsters, terrain and other combat effects, especially on iPad. Reduce layers/noise before sacrificing gameplay clarity or performance.

If the gallery has no useful match, broader web/video reference research may be used, but the same rule applies: study motion and visual principles, never clone a complete effect or copy protected assets.

## Example: developing a lightning skill

For a lightning skill, do not stop at "make it electric." Search the gallery for several roles that could make up the final effect, such as:

- lightning strike / bolt for the main attack motion
- electric impact / explosion for the hit frame
- sparks for secondary hit accents
- electric surface for a lingering ground zone
- electrified/status effects for a short shock state
- barrier/aura effects for anticipation or charge-up when appropriate

A single skill may borrow the **timing idea** from one reference, the **impact shape language** from another and the **secondary spark behaviour** from a third, then be rebuilt as one coherent original effect for Frontier.

## What to learn from the gallery

- Chunky, readable shapes: bold flash cores, star/spark bursts, rings and short thick slash arcs instead of fine noise.
- Short, punchy timing: fast pop-in, decisive main motion, readable impact, then eased fade-out.
- Strong per-element colour identity while preserving a clear brightness hierarchy between core, body and secondary particles.
- Clear layer separation: main shape first, supporting particles second, optional lingering/status layer last.
- Categories that map well to our needs: hits and slashes, sword trails per element, elemental projectiles and explosions, auras and shields, pickups, status expressions, water splashes/ripples, dust, leaves and weather.

## How to adapt it to Frontier

- Keep our anime cel look (see `AGENTS.md`). Effects must not hide monster wind-ups or turn combat into a screen-clearing race.
- Effect shapes and timing must communicate the real gameplay hit area and hit timing.
- Fit iPad performance: pooled/reused particles, no per-frame allocations, and `disposeObject()` for anything removed.
- Mods such as split, pierce, chain, ground, echo, element and trigger should alter the effect in ways that remain readable without requiring a completely unrelated visual language for every combination.
- For substantial VFX work, note the gallery effect names/categories studied and the principles taken from them in the PR or handoff. This is research provenance, not permission to copy the assets.
