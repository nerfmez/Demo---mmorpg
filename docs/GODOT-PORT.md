# Porting to Godot 4

The web demo is built so a Godot version can reuse its **data, rules and layout**. Only the
rendering and UI must be rebuilt in Godot. This file maps each piece.

## What carries over unchanged

| Web demo | Godot | How |
|---|---|---|
| `data/*.json` | `res://data/*.json` | Copy the files. Load with `JSON.parse_string(FileAccess.get_file_as_string(path))`. Field names stay the same. |
| `data/generated/layout.json` (`npm run export:layout`) | Map scene builder | Instance trees, rocks, pillars, houses and fences at the listed positions. Colliders are listed as circles (`x, z, r`) and oriented boxes (`x, z, hx, hz, angle`). Also zones, waypoints and bridges. |
| `data/generated/heightmap.json` | `HeightMapShape3D` + terrain mesh | Heights on a 1 m grid. Walkability: uphill steps steeper than `terrain.maxWalkSlope` (`world.json`) are blocked, drops are allowed. |
| Axes and units | Same | Both use Y up and metres. A facing angle `a` points along `(sin a, 0, cos a)`, which is `rotation.y = a` in both engines. |
| Save data (`character` object) | `Dictionary` or `Resource` | The same JSON shape (`version: 2`, with `name`, `appearance`, `kit`, `progress`, `pos`). `migrateCharacter()` upgrades v1. Slots and export codes are in `src/save.js`. |

## What gets translated (logic, `src/core/`)

`src/core/` has no Three.js or DOM code. Translate each file into GDScript, mostly line by line.

| File | Godot equivalent | Notes |
|---|---|---|
| `math.js`, `rng.js` | `util/math.gd`, `util/rng.gd` | Keep mulberry32 so a seed gives the same rolls. Godot's `RandomNumberGenerator` would give different results. |
| `character.js` | Autoload `Character.gd` | Stats, levels, Job Tree, respec, gear stats and `derive()`. |
| `skills.js` | `SkillCompiler.gd` | `computeSkill()` returns a flat Dictionary. Keep tag-based `modFits(skill, mod, companions)` and inactive-mod reasons; see compatibility notes below. |
| `crafting.js` | `Crafting.gd` | Recipes, grade roll, upgrades, drops. |
| `quests.js` | `Quests.gd` | Journal state lives in `character.progress.quests`. Feed it the same events (kill, collect, craft). |
| `terrain.js` | Import step only | Builds the heightfield; Godot can load `heightmap.json` instead. |
| `targeting.js` | `SoftTarget.gd` | Pure rules. Automatic attack acquisition is nearest in actual skill range; explicit pointer/drag aim stays directional. Call soft acquisition every physics frame and re-evaluate nearest on quick cast. |
| `ai.js` | Per-monster state machine on a `CharacterBody3D` | States: `idle, chase, windup, act, recover, stunned, shell, return`. Keep the wind-up tell before every attack. |
| `game.js` | Player, Projectile, Area and Drop scenes + a `World` node | See the node mapping below. |
| `world.js` | World queries / collision setup | Use `layout.json` + `heightmap.json` plus Godot collision shapes. `isWater()` is a visual/spawn mask; `blocksWater()` is the movement mask. The shallow river is walkable when `river.walkable` is true. Only deep ponds/sea block movement; bridges are optional river crossings. |

### `game.js` → scenes

- `player` → `Player.tscn` (`CharacterBody3D`). `useMovement()` becomes a dash tween with an invulnerability flag. Skills run through `executeSkill()`.
- `projectiles[]` → `Projectile.tscn` (`Area3D`, moved in `_physics_process`). It carries the `pierce`, `chain` and `ground` fields from the computed skill.
- `areas[]` → `GroundArea.tscn` (`Area3D` with a delay, tick and duration). Used for stone burst, burning ground, healing spring, boss slam and shockwave.
- `drops[]` → `Loot.tscn` with magnet pickup.
- `allies[]` → `Summon.tscn` (spirit wolves): the same chase/bite loop as monsters, on the player's team. Monsters pick targets with `pickTarget()` in `ai.js`.
- `events[]` → Godot **signals** (`hit`, `death`, `drop`, `levelup`, ...). The renderer and HUD here only react to events, so the same split works as signal listeners.

## What gets rebuilt (presentation)

| Web | Godot |
|---|---|
| `render/toon.js` (3-step ramp and inverted-hull outline) | `ShaderMaterial` with a toon ramp, plus a second pass with `cull_front` and a vertex push for the outline |
| `render/ground.js` (splat map and shader) | Terrain shader, or `MeshInstance3D` with a splat texture. The procedural noise GLSL ports to Godot shading language almost directly. |
| `render/hero.js`, `render/rig.js`, `render/monsters.js` (procedural models and animation) | Replace with real rigged models (`.glb`) and `AnimationTree`. The procedural poses show what each animation should read as (wind-up, charge, shell, slam). |
| `render/vfx.js` | `GPUParticles3D` and shader meshes. Keep the rule that effect shapes match the hit areas. |
| `ui/*` (HUD, panels, title menu, character creator) | Godot `Control` scenes. `ui/ux.css`, `ui/art.css` and `ui/workspaces.css` define desktop, tablet and phone layouts; `ui/inventory.js` presents gear comparisons and item categories. Keep a persistent modal close/return button and a separate movement slot. |

`ui/art.js` and `ui/jobart.js` contain 187 individually authored SVG illustrations keyed by base content ID.
Reuse the same image for grade/enhancement variants; display the grade and +N separately.
`ui/atlas.js` selects a destination before an explicit travel action. Map symbols in
`ui/mapimage.js` use the generated world's real positions. `ui/jobview.js` opens with ten
travel-journal chapters before showing the relevant part of the 87-node passive network.
Each node in `data/jobtree.json` has `tier` and `requiresSpent`: a later tier unlocks
when enough Job Points have already been invested in lower tiers of that same chapter.
This is a stage gate, not an exact path requirement, so players can combine branches
inside a chapter. Specialization counts the four profession oaths separately and
`requiresJob` remains authoritative. Links are retained for visual relationships,
cross-chapter navigation and layout, but they no longer force the exact allocation path
when tier metadata exists. `jobPath()` is only a non-mutating suggested tier preview.
Per-category pan/zoom cameras are view state, never saved in the character; version-2
saves are preserved. Use different disc sizes for small and major nodes, but keep touch
targets at least 44 logical pixels at every supported zoom.

Rebuild separate Control scenes for combat loadout, modifiers, movement, material
upgrades and passive paths. A desktop/tablet navigation rail becomes a compact page
selector on narrow phones. Keep inspection separate from allocating points, socketing,
and spending materials. `ui/buildmeta.js` is presentation vocabulary shared by skill,
modifier, crafting and inventory details: native tags, damage element, stat requirements,
all/any/excluded tags and exact incompatibility reasons. Modifier-added tags are labeled
separately and do not silently grant native-tag eligibility. Calls to core `modFits()`
remain the authority for compatibility; do not duplicate the rules in Godot UI code.

### Ability-family scaling and modifier compatibility

Port the new derived fields along with their Node tests:

- `dotDamagePct` increases Venom Mire and Burning Ground field damage, not burn/poison
  status damage. `DoT` is not the same as `Persistent`: Healing Spring has the latter only.
- `persistentDurationPct` extends poison, healing and burning fields; not buffs, curses,
  summons or cast time. Apply ground radius/duration scaling after collecting modifiers,
  so socket order does not change the result.
- `controlDurationPct` extends chilling hits and Hex; not slow strength, knockback or
  War Cry. Do not treat every duration as control duration.
- Lingering needs a native lasting field, or an eligible Burning Ground modifier. Its
  provider must also meet stat requirements to activate the bonus. Keep a dependent
  modifier stored but inactive when the provider is removed or inactive; never delete it.
- Burning Ground, Knockback, Life Leech and Frost Shift are on-hit modifiers. They exclude
  DoT skills because the current field executor does not apply those on-hit effects.
  Preserve older invalid loadouts as inactive entries and show the reason.

The additions do not alter Character Stat Point requirements: flat HP/MP/attack/magic/
defense nodes use Job Points and do not add STR/INT. Active skill counts remain 13 combat
and four movement. No channeling executor is added. Run `tests/core/workspaces.test.js`
assertions in the port and reproduce the separate-page flows in
`tests/browser/workspaces.mjs`. See `UI-WORKSPACES.md` for reference and verification scope.

`gearLook()` includes a `bases` map of equipped item IDs (derived presentation metadata,
not saved state). `render/equipment.js` uses it for distinct weapon/boot/charm silhouettes.
Imported models are listed in `data/models.json` (GLB files in `public/models/`, currently
Meshy weapons). Each GLB is already in the weapon-bone convention (grip at the origin, blade
along +Z, metres), so in Godot attach it to a `BoneAttachment3D` on the right hand. The
procedural shape in `equipment.js` is only a fallback.
The hero body is `public/models/hero_base.glb` (Meshy, auto-rigged, 24 Mixamo-like bones),
registered as `characters.hero_base`. `render/skinned.js` keeps the procedural bones of
`hero.js` as the animation source and copies their root-space rotations onto the skin bones
each frame (bone map `MAP` there); in Godot, import the GLB with its `Skeleton3D` and
retarget the same poses (or author them as clips). Clothes are colour zones cut from the
bind-pose position (`clothZone` in the shader), coloured from the look; hair, face, scarf,
helms and weapons are still attached to the head, chest and hand bones.
Regular monsters have Meshy models too (`data/models.json` → `monsters`, GLBs in
`public/models/monsters/`). Meshy only rigs humanoids, so `render/monsterSkin.js` skins each
model onto the procedural monster rig at load: `bones` moves rig joints onto the model,
`segments` (one line, or several, per bone in rest space) give each vertex weights by
distance (`sharpness`, `minWeight`), `pitch`/`yaw`/`scale`/`offset` align the model, and
`keep` leaves procedural parts on some bones (the wisp's motes). In Godot, rig the GLBs with
the same bone names and weights (or paint them) and keep the animation from `monsters.js`.
The face is a canvas atlas of four expressions (`render/face.js`) on a patch cut from the
head mesh; in Godot use a face texture with UV offsets per expression. Hair (`render/hair.js`)
is one merged mesh per style built from lock curves; export it once per style as a mesh and
port the angel-ring band as a shader on the hair material. `data/gait.json`
holds the walk and run cycles as driver-bone Euler angles (XYZ) per frame; the cadence is
`speed / cycle` cycles per second.
Skill actions (`render/actions.js`) are keyframed poses with a `hit` time; port each as an
`Animation` with a method track (or signal) at the hit, and use `SkeletonIK3D` (or a
two-bone IK modifier) for the ikL/ikR/grip channels.
`render/dropart.js` caches one billboard texture per material, matching its inventory art.

Input gestures in `ui/input.js` are presentation behaviour: tap to cast, drag to aim,
release over the cancel zone to cancel. Pointer cancellation, lost capture, focus loss
and opening a menu clear held actions and movement; they must never cast a skill.
Keep this behaviour in the Godot touch controls. `tests/browser/ux.mjs` exercises the
menu workflows and these interrupted gestures at desktop, tablet and phone sizes.

## Checklist for the port

1. Copy `data/` and run `npm run export:layout`.
2. Port `rng`, `math`, `character`, `skills` and `crafting`. Port `tests/core/*.test.js` to GUT tests with the same assertions.
3. Build the player and monster scenes with the `ai.js` state machine.
4. Place the world from `layout.json`.
5. Rebuild the HUD and panels.
6. Replace the procedural models with authored art in the same style: anime cel-shaded, about 6.5 heads tall, 3/4 top-down camera ("change the camera, not the style").

## Anime terrain and Dreamloop

- Soft-coast revision (2026-09-28): `world.json.presentation` controls warm daylight and
  softer shadows. Pine entries have been replaced by broadleaf trees, including the map border.
- The beach uses a dedicated sand splat, separate from mud/grass. `world.isBeach()` clears
  meadow decoration on sand. `decor.shells` contains small ribbed fan and spiral shells,
  rendered as chunked instances (`nature.js`); use MultiMesh in Godot.
- `sea.surf` defines period, run-up, retreat and foam width. The sea shader moves the foam
  edge across a thin surface following the beach heightfield, then draws it back. Sea tiles
  match the terrain grid and are culled independently. Port the time uniform and shoreline
  distance attribute; there is no per-frame mesh rebuild.
- `river.depth` and `river.bankWidth` produce an ankle-deep bed with gentle banks. Keep the
  rendered water and movement masks separate when porting. Do not add a blocking river strip.
- `render/ground.js`: small grouped grass strokes, warm earth, bevelled paving, mossy cracks,
  cliff strata and shore foam. Water streaks use world coordinates, including round ponds.
- `render/nature.js` / `leafpaint.js`: branched trunks, curved grass, petals, faceted rocks,
  shared alpha-cutout leaf and needle atlases; chunked instancing is preserved. In Godot use
  alpha scissor `StandardMaterial3D`/toon materials and MultiMesh chunks. These crown cards
  are authored for the fixed ARPG camera; keep that orientation when porting.
- `render/surfaceart.js` composes bark/stone paint with existing wind and hero occlusion.
- Run `npm run test:dreamloop`, inspect the same ten locations and three surf phases, plus iPad/phone graph
  interactions. If full-page capture stalls, the test attempts the game canvas. A screenshot
  file alone is not visual approval: inspect it, correct issues and recapture.
- CI exercises Chromium and WebKit. Pages deployment also runs the WebKit Dreamloop against
  its published URL and uploads `live-dreamloop` screenshots/report.


### Travel journal presentation (review branch)
The passive graph and allocation rules are unchanged by the travel-journal revision.
Use each node's `category` and `clusterPos` for themed chapter views, and overview
`mapPos`/icon metadata for the large chapter marks. These marks are navigation only;
no completion prerequisite or category-wide purchase exists. Map the view to a
full-rect Control, not a Window; show node details on selection only. Modifier item
art uses the shared SVG faceted-gem/engraved-symbol templates in `gemart.js` and
`sigils.js`; their colours never determine compatibility. Preserve the existing
core eligibility checks and save IDs.

### Clean SEEKER combat HUD (29 September 2026)

`ui/fieldhud.css` now skins the live field HUD with navy translucent surfaces, thin silver
edges and a right-hand action cluster on mouse and touch. `ui/fieldhud.js` provides small
menu/joystick symbols plus XP/quest presentation. Combat and movement buttons reuse
the unchanged full-colour illustrations from ui/art.js; do not replace them with glyphs
or import an entire concept image. Modifier items keep the engraved gems separately.
Keep the actual portrait, HP/barrier/MP, all four combat slots, separate movement charges,
interrupted drag behavior and per-skill targeting untouched when porting. The footer
shows independent blue EXP and gold Job tracks; max-level tracks explicitly say MAX.
Short landscape/portrait relocate and compact the quest tracker rather than covering
combat controls. Details and acceptance checks are in `docs/COMBAT-HUD.md`.

### Render light/shadow pass (29 September 2026)
`data/rendering.json` is now the single lighting/preset source. `world.presentation`
and `art.anime.light` were removed; `daylight` is live and `legacy` is an explicit
comparison profile in the same file. Use shadow-receiving materials on imported
actor bodies, not hulls. Preserve painted foliage colours and apply a restrained
scene-shadow mask rather than re-lighting individual cards.
The same wind deformation must be active in both colour and shadow rendering.
WebGL uses a shared customDepthMaterial per fill material (`render/patch.js`),
with the fill's alpha texture/test and wind uniforms, but no camera-space dither.
When changing quality, update and release shadow buffers as well as DPR. WebGL
native AA is a fixed context policy (including Low), not a switch changed by
setQuality. Godot can use its own viewport AA controls with equivalent documented
behaviour. See `RENDER-LIGHT-SHADOW.md` and renderer regression tests.
