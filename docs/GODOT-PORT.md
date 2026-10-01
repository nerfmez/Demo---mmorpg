# Porting to Godot 4

The web demo is built so a Godot version can reuse its **data, rules and layout**. Only the
rendering and UI must be rebuilt in Godot. This file maps each piece.

## What carries over unchanged

| Web demo | Godot | How |
|---|---|---|
| `data/*.json` | `res://data/*.json` | Copy the files. Load with `JSON.parse_string(FileAccess.get_file_as_string(path))`. Field names stay the same. |
| `data/generated/layout.json` (`npm run export:layout`) | Map scene builder | Instance trees, rocks, pillars, houses and fences at the listed positions. Colliders are listed as circles (`x, z, r`) and oriented boxes (`x, z, hx, hz, angle`). Also zones, waypoints, bridges, harbor docks and safeRoutes. |
| `data/generated/heightmap.json` | `HeightMapShape3D` + terrain mesh | Heights on a 1 m grid. Walkability: uphill steps steeper than `terrain.maxWalkSlope` (`world.json`) are blocked, drops are allowed. |
| Axes and units | Same | Both use Y up and metres. A facing angle `a` points along `(sin a, 0, cos a)`, which is `rotation.y = a` in both engines. |
| Save data (`character` object) | `Dictionary` or `Resource` | The same JSON shape (`version: 2`, with `name`, `appearance`, `kit`, `progress`, `pos`). `migrateCharacter()` upgrades v1 and relocates characters once when `worldId` or `worldLayoutRevision` changes; levels, equipment and completed quest history are retained. Slots and export codes are in `src/save.js`. |

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
| `ai.js` | Per-monster state machine on a `CharacterBody3D` | States: `idle, chase, windup, act, recover, retreat, emerge, stunned, shell, return, circle`. Keep the wind-up tell before every attack. |
| `game.js` | Player, Projectile, Area and Drop scenes + a `World` node | See the node mapping below. |
| `world.js` | World queries / collision setup | Use `layout.json` + `heightmap.json` plus Godot collision shapes. `isWater()` is a visual/spawn mask; `blocksWater()` is the movement mask. The shallow river is walkable when `river.walkable` is true. Only deep ponds/sea block movement; bridges and docks provide walking surfaces. Dock clearance checks the actor footprint across the union of adjoining decks and dry shore; outer sea edges still block. `groundY()` interpolates from `startY` to `height` using dock-local Z after rotation. The render mesh shears in local Z so its XZ footprint matches collision exactly. Safe starting roads use distance to the `safeRoutes` polylines. |

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
| `render/trail.js`, `data/combat-fx.json` | Melee looks. A player's swing draws a ribbon between two points on the real weapon (grip + `base`/`tip` metres along the blade, per weapon type) while the strike moves, which in Godot is a trail on a `BoneAttachment3D` of the weapon; the hit area (the skill's `range` and `arc`) is a separate flat wedge that flashes on the ground. Each monster melee attack name (`slap`, `peck`, `pinch`, `bite`, `sweep`) has its own look (water splash, beak needle, closing claws, fangs, heavy band), tweakable per monster in `overrides`. |
| `ui/*` (HUD, panels, title menu, character creator) | Godot `Control` scenes. `ui/ux.css`, `ui/art.css` and `ui/workspaces.css` define desktop, tablet and phone layouts; `ui/inventory.js` presents gear comparisons and item categories. Keep a persistent modal close/return button and a separate movement slot. |

`ui/art.js` and `ui/jobart.js` contain individually authored SVG illustrations keyed by base content ID.
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
An opt-in second hero body is a VRM 1.0 file made in VRoid Studio (`?hero=vrm`,
`public/models/hero_vrm.vrm`, registered as `characters.hero_vrm`; `render/vrm-body.js`). It is
slimmed from `assets/vrm/hero_vrm.source.vrm` by `scripts/prep-vrm.mjs` (only the expression morph
targets the game uses are kept). It reuses the same driver-bone retarget (`bindSkinSync` in
`skinned.js`, VRM humanoid bones mapped to the driver bones), keeps its own face, hair and textures,
and switches expressions through the VRM `blink`/`angry`/`surprised` presets. Godot imports VRM
through its VRM addon, which gives the humanoid map and spring bones directly. Hair spring bones,
the scarf and armour pieces are not used with this body yet.
Regular monsters have Meshy models too (`data/models.json` → `monsters`, GLBs in
`public/models/monsters/`). Meshy only rigs humanoids, so `render/monsterSkin.js` skins each
model onto the procedural monster rig at load: `bones` moves rig joints onto the model,
`segments` (one line, or several, per bone in rest space) give each vertex weights by
distance (`sharpness`, `minWeight`), `pitch`/`yaw`/`scale`/`offset` align the model, and
`keep` leaves procedural parts on some bones (the wisp's motes). In Godot, rig the GLBs with
the same bone names and weights (or paint them) and keep the animation from `monsters.js`.
The salt slime model (a level-1 redesign: dome jelly with a shell, salt crust and seaweed) has one
rig bone, `body`, so every vertex follows it and the squash/stretch comes from scaling that bone.
The shore gull and hermit crab models follow the same scheme: the gull skins to `body`, `head`,
`wingL/R` and `legL/R`; the hermit crab reuses the reef crab rig (`shell`, `head`, `mandL/R`, six legs),
so its shell tuck scales those bones.
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

### Azure Coast local starter (30 September 2026)

The active `world.json` is a 320 × 240 m harbor prototype (with a large U-shaped bay),
not the complete Asterfall continent. New characters start at the safe landing beach
and unlock the town checkpoint by walking there. The town, nearby grove, fields
and lighthouse are the only authored region. `tests/fixtures/frontier/` retains the
previous map for historical regression tests.

Translate `coastal_melee`, `coastal_slime` and `coastal_skirmisher` in `ai.js`.
`primaryAttack` selects a stationary frontal slap, peck or pinch; each attack has
`arc`, `windup`, `hitTime` (after windup), `duration`, `recover` and `cooldown` in
`monsters.json`. Lock aim after 55% of windup and test range/arc once at contact,
including summons. Contact never uses the charge collision path. Drive animation
from these same times, with the body planted and the head/claw/body following through.

Salt slime uses a slow `salt_spit` projectile when outside slap range. Its aim stays
locked, it carries no poison, and terrain/collision use the existing projectile rules.
The grounded shore gull walks in, pecks, recovers and walks toward a fixed retreat
point at normal movement speed; retreat cannot damage units and times out if blocked.
Reef crab uses only a slow frontal pinch. Hermit crab also enters shell after its
configured attack count (or sustained hits), then clears `shell` and enters `emerge`.
`emergeDamageTaken` applies only during that stationary opening, before normal pursuit
resumes. Leashing clears transient combat/guard state. See `COASTAL-COMBAT.md` and
`tests/core/coastal-attacks.test.js` for the port acceptance cases.
Part drops feed the new low-cost recipes.
Procedural harbor and monster meshes are review assets; owner visual approval
remains separate from passing gameplay tests.

Save version remains 2. The optional `worldId` prevents restoring old coordinates
on a different map. On migration preserve the character build and quest history,
filter unavailable waypoints, add the landing checkpoint, and clear `pos` once.
A later save with this map ID keeps its current position and unlocked checkpoints.



## Azure Coast U-bay blockout

The map remains 320 × 240 m with `shoreZ(x)` defining the water side of the existing X/Z shoreline. `sea.edgeKinds` tags each shoreline segment as beach, quay, breakwater or shipyard. `coastSample()` gives the signed nearest distance for side-coast painting, collision radius clearance and surf; quay/slipway edges do not receive sand or beach runup. Exported terrain includes the carved bay and every settlement rectangle.

`town.buildings` accepts the legacy `[x,z,angle]` format and authored objects `{id,x,z,angle,hx,hz,height,kind,roofColor}`. For the active `town.blockout` pass, visible boxes exactly match these oriented collider dimensions; roof colors are stored per building. No interiors are present. `docks` and their local ramp endpoints export directly. Save JSON remains version 2; the optional `worldLayoutRevision` relocates old coordinates once while preserving equipment, levels and the seven-step quest records.

The owner approved this layout on 30 September 2026 and authorized one market-to-pier style slice. `town.styleSlice` selects four building IDs, authored exterior variants, awning colors, stall goods and a quay range. The owner subsequently approved continuing other districts; `town.districtStyle` selects the other 18 primary buildings for authored exteriors. Finished bases stay within the same per-building X/Z collider dimensions; roof colors remain per-building. There are no interior or new fishing rules.

Road corners and the coast are now densely sampled curves baked in `world.json`; terrain, collision, safe routes, minimap and export all use those same polylines. Shore X remains strictly increasing, and `edgeKinds` remains one tag per segment. The breakwater approach keeps its original joining points to avoid a deck/terrain height step. Cosmetic road and paving wear only changes paint weights. The low market coping follows the same shore and leaves gaps at pier approaches. Market geometry is merged per color during scene construction, with no extra frame updates. Nearest-coast lookup compares squared distances and takes one square root after finding the nearest segment.

The market style is approved for district expansion; the new district exteriors await owner image review. Merge and deploy remain unapproved. Browser screenshots cannot establish hardware iPad FPS.

### Market visual audit

`wallColor` is authored per reviewed building; the base remains inside its original X/Z collider. Door foundations are recessed into low thresholds, and fish/workshop/provisioner/inn frontages have distinct working details. No entrance or interior collision rule changes.

The market apron uses overlapping coast/plaza paint masks instead of a rectangle ending before the quay strip. Road attenuation is continuous across paving blends. Beach water still follows terrain as a thin swash film; quay, breakwater and repair-front water stays at the water level. Their foam is restrained and opacity masks the coarse submerged terrain. Market coping segments are clipped precisely against dock-local rectangles; the stone face meets the coping vertically.

`town.styleSlice.boatIndices` selects all four existing decorative boats for the open fishing-boat exterior. Floors close the visible hull, static ropes connect to the nearest pier side, and the east boat clears its pier. Boats remain non-interactive decoration. Pier planks use 0.32 m courses with instanced seams; collider dimensions and ramp interpolation are unchanged.

### Solid pier approaches and authored dock cargo

`docks[].terrainRecess` is optional and data-driven. Before sampling ramp heights, carve supporting terrain under the slab along dock-local Z, tapering from zero at the dry endpoint. Active pier ramps use 0.32 m; the repair slipway keeps 0.08 m. Ground and deck must not share a coplanar area: movement support alone does not establish a visually joined approach. Deck X/Z dimensions and walking interpolation stay unchanged.

`harbor.dockCargo` contains `{id,x,z,hx,hz,angle,height,kind}` groups. Add their authored oriented box colliders to the world; render fish crates, barrels or a net rack within those same bounds, anchored at `groundY`. The reviewed piers retain a three-metre clear central aisle. Eight stalls use the existing stall collider/content format. These are exterior working props, without fishing, boat control or interior interactions. Current checks are in `tests/core/harbor.test.js`; focused captures use `AZURE_MARKET_REVIEW=1` in `tests/browser/azure-blockout.mjs`.

### Distinct shop exterior assemblies

`marketBuilding()` dispatches the four authored `variant` values to separate exterior assemblies: open fish counters under a low hipped roof; front-gabled timber workshop with anvil, tools and forge; single-slope provision shop with striped awning and supply shelves; two-storey inn with small dormer, shallow porch and seating. Preserve their gameplay-camera readability, authored wall/roof colors and low silhouettes when porting. Recess the main wall/eaves within the original `hx/hz` plot and keep the exterior displays inside that plot. The existing oriented collider covers the complete solid exterior plot; no interior access or new service interaction is added. Static parts remain merged by color at construction time, without frame callbacks. `AZURE_SHOP_REVIEW=1` captures the four original-camera frontages without a full-map capture.

### Authored district exteriors and working yards

`town.districtStyle.buildingIds` selects cottage, front-gable, netter and timber-home variants, three warehouse variants and a repair workshop. Keep per-building `variant`, `wallColor`, `roofColor`, `hx/hz` and height; these are solid exterior plots. `town.blockout` remains a fallback/procedural-decoration suppression switch, not the selector for these finished building meshes.

`harbor.workProps` uses the same authored `{id,x,z,hx,hz,angle,height,kind}` oriented-box contract as dock cargo, with world collider type `harbor_work`. Render cargo stacks, handcarts, timber, dry hull on trestles and bench within those bounds. These props do not add interactions or save state. `town.buildings[].entryPath` is a world-X/Z polyline from the clear front threshold to an existing road; it only paints a soft worn path. `harbor.workSurfaces` holds `{x,z,rx,rz,angle}` ellipses that blend worn-earth paint around loading/repair work, with no terrain-height or collision changes.

`harbor.lighthouseStyle` controls stripe and roof colors on the existing radius-2 landmark. Low breakwater coping leaves its centre open; water-side armour stones sit outside the deck. A 0.025 m visual lift prevents land/deck coplanarity while preserving world walking support. Launch rails use the slipway's own local slope. Mooring anchor endpoints are transformed through the selected pier's local X/Z rectangle before returning to world coordinates, including rotated side piers.

`AZURE_DISTRICT_REVIEW=1` captures eight original-camera locations plus one labeled layout view and walks all 18 authored frontage connections. The current collider/path safety test is in `tests/core/harbor.test.js`. No new interior, boat-driving or fishing rule; save/quest/combat/input contracts remain unchanged. Hardware iPad performance is still unmeasured.

### Structure contours and rounded breaking foam

`art.architecture` contains `hullWidth`, `hullDarkness`, `edgeAngle`, `edgeColor`, and `edgeOpacity`. Use a same-hue silhouette hull plus depth-tested feature edges at sharp geometry joins; omit coplanar triangle diagonals and low-angle facets. Generate one line batch per structure, skip previously styled children, and preserve character/foliage shaders. The Three implementation is `render/architecture.js`; its owned edge geometry follows `disposeObject`, with shared cached contour materials. Structure transforms/colliders remain unchanged.

`sea.surf.foamScale/foamIntensity/portFoam/foamColor` tune the existing sea material; `foamDrift`, `foamLifetime` (seconds) and `causticSpeed` control deformation and decay. Recover the waterward normal from derivatives of the existing signed shore distance and world X/Z coordinates. Advect swash with its moving runup edge and incoming graphic crests with their phase; use a bounded per-wave coordinate and a new seed generation for each wave. Warped multi-scale noise opens unequal branching water channels through young foam, then erodes white remnants over a finite lifetime. Do not draw fixed Voronoi border lines or reveal the same stationary pattern with a brightness mask. Submerged light ripples also deform and fade, with low contrast and no fixed surface grid.

Keep flat port water and terrain-following beach runup as separate existing masks. Limit foam detail to the near-shore strip and antialias fine pores with derivatives. The shared GPU clock drives the material; no additional water mesh, physics, texture or CPU particle system is introduced. `AZURE_FINISH_REVIEW=1 AZURE_WAVE_ONLY=1` captures beach/quay/breakwater views; optional `AZURE_WAVE_SEQUENCE=1` samples one full cycle at 12 frames per simulated second for motion review. This sampling rate is not a hardware performance measurement. Hardware iPad FPS remains unmeasured.


### Water contact at static harbor geometry

`render/water-contact.js` intersects marked scenery meshes with the visible sea plane (`waterLevel + 0.015`), including transformed/instanced rocks and rotated dock assemblies. Ignore inverted-hull outlines and all geometry entirely above/below that plane. Split the segments into connected closed loops and union their raster fills, so a mast nested within a hull does not create an artificial water hole. This distinguishes submerged piles from raised timber decks. The breakwater now has a stone foundation down to `waterLevel - 0.8`, inside its existing X/Z footprint; walking support/collision is unchanged.

Bake one linear-filtered RGBA8 field at scene creation: signed waterline distance, outward X/Z normal and incoming-wave exposure. `sea.surf.contactTexel/contactRange/contactShelter/contactWidth/contactIntensity` tune this visual field. Its maximum dimension is 2048; distant water skips contact detail. `View` creates scenery before water so the bake uses the actual rendered hulls, quay walls, piles, armour stones and scenery rocks. The sea material owns the texture; `ownContactTexture` releases it once when that material is disposed. No per-frame geometry extraction, texture updates or CPU collision work.

Incoming crests move north from the open bay; `sea.surf.waveSpacing` and `period` define their travel speed. Beach runup is phased from the same arriving crest at the nearest coast. Port crests are finite curved anime ribbons with rounded tapered ends; incoming-wave exposure attenuates them. Beach crests retain the previously reviewed thin, intermittent treatment. Contact foam starts when a crest reaches the nearest physical waterline, spreads along that contour, then dissipates; a short outward return ripple follows the struck contour. Incidence and exposure reduce the sheltered side. The sea surface is masked inside solid cross-sections. Beach swash remains based on the existing shore/heightfield, with unequal branching water channels replacing uniform circular foam holes. This is a static stylized contact approximation, not a fluid/wave-reflection simulation, and does not respond to actors or future moving boats. Core movement, saves and services are unchanged.

`node --test tests/render/water-contact.test.mjs` checks hull taper, rotated solid masonry/piles, open water below elevated timber decks, exposure and texture ownership. `AZURE_FINISH_REVIEW=1 AZURE_WAVE_ONLY=1 AZURE_CONTACT_REVIEW=1` captures incoming/impact/spread at a working berth, stone armour and quay wall. Optional `AZURE_WAVE_SEQUENCE=1` samples a 6 s contact animation (72 frames/12 samples per simulated second); ordinary wave-only mode still reviews one beach swash cycle. Sampling does not measure device FPS.


### Graphic anime port crests (owner review correction)

The volumetric swell pass was rejected by the owner: preserve anime graphic crest marks, soften their straight rigid appearance, and retain the beach treatment from 7f895603ef1cc2064d6d1a18163767593cf68c03. Remove the GPU height/slope shading and its four swell settings. All sea meshes again use their original level/terrain-film surfaces. Beach runup, foam channels, phases, palette and thin offshore crest code are restored from that source.

`sea.surf.crestBend` sets port-crest curvature in metres, `crestWidth` the ribbon width, `crestLength` the spacing of varying-length arc groups, and `crestOpacity` their light-cream contrast. The port shader moves curved crests north; individually bowed along-crest groups produce unequal strokes, with continuously tapered rounded tips and antialiased edges. Row/group seeds change while the marks are invisible between crests. A restrained teal underside preserves the drawn anime look without volumetric gradient waves. Derive port contact timing from the same curved phase; beach contact timing stays at the reviewed old phase. No geometry, texture, ownership, water physics, collider or save change.

`node tests/browser/azure-wave-lines.mjs` captures the pier and beach in the original gameplay camera/HUD. Optional `BEFORE_ROOT=/path/to/built/revision` checks identical player/camera transforms. `BASELINE_SHA`/`REVIEW_PARENT` record comparison source identities; the report also records the live port material style/settings to guard against stale captures. `WAVE_SEQUENCE=1` captures one 7.5 s pier cycle at six samples per simulated second, plus matched beach stills to review the restored treatment. These samples do not measure PC/iPad rendering FPS.
