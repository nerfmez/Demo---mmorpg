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
| `render/ground.js`, `ground-color.js`, `ground-field.js`, `ground-brush.js`, `meadow.js`, `walk-surface.js` | Terrain shader/splat attributes, shared metre-based pigments in `art.ground.palette`, continuous meadow field for both ground paint and construction-only instanced grass density. Grass roots sample the terrain triangle; mask planted blades/flowers off paving, dirt roads, mud, beach, decks and colliders, including safe town lawns. Walking slab shaders use deck-local axes on rotated/sheared ramps. Timber decks are one merged mesh of separate boards on the painted 0.32 m plank pitch (seeded per dock: ragged ends, small gaps/twist/lift, two stringers) and piles lean slightly with extra pairs on long decks (`art.architecture.pier`); collision still uses the authored dock boxes. Grass blades take the ground colour at the root and the meadow `lawnTone` above it. Road, bare-soil and paving borders are noise-wobbled in the shader (`art.ground.road*`, `pavingEdgeWobble`). Paving drops a few slabs to earth and sinks a few (`pavingMissing`, `pavingSunken`). Exterior builders (`market.js` `builder()`) turn timbers under 4 m slightly about their thinnest axis, seeded from the part's own numbers (`art.architecture.handmade`); roofs are tile courses with staggered, two-tone plates, tiled hip ends, hip caps and a segmented ridge (`art.architecture.roof`); district plinths are extruded ragged outlines with edge stones; fishing boats carry rubbing strakes and floor ribs. All stay inside the authored collider footprints (`tests/render/azure-footprints.test.mjs`); geometry is built once at load, no per-frame work. `tests/browser/town-art.mjs` captures the town review views. Port noise/strokes with derivative antialiasing to Godot spatial shaders; retain real shadow reception and owner disposal of surface materials. One 1024² shared mipmapped brush atlas is baked deterministically at construction, with last-owner texture disposal; no external texture asset, collision or save-format change. |
| `render/hero.js`, `render/rig.js`, `render/monsters.js` (procedural models and animation) | Replace with real rigged models (`.glb`) and `AnimationTree`. The procedural poses show what each animation should read as (wind-up, charge, shell, slam). |
| `render/vfx.js` | `GPUParticles3D` and shader meshes. Keep the rule that effect shapes match the hit areas. |
| `render/view.js` `syncMonsters` | Monster models only exist within `VIEW_RADIUS` (58 m) of the hero, and of those only the ones whose bounding sphere (rig height, plus a 2 m margin) touches the camera frustum are drawn and posed; skinned models have `frustumCulled` off, so this test does the culling. In Godot, `VisibleOnScreenNotifier3D` (or a `VisibilityRange`) on each monster gives the same. |
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

The active `world.json` is a 320 × 300 m local harbor prototype with a compact,
asymmetric U-bay. Its current reference-layout correction awaits owner review.
New characters start at the safe landing beach
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

Current layout revision is `azure-original-beach-8`, based on main `7102e4310ca79fa56a2fab8a44c8ea7bf7e91ca7`. The owner rejected the merged PR #22 layout; earlier layout approval is superseded. The correction remains a draft awaiting image review. Read map dimensions from `bounds` (currently 370 × 300 m, including the original western beach and northern hunting grounds).

`town.placement` pins the original beach map source `88e2a2bc0a8d288909b05b86d6e9d1d394362f00`, original town centre `[62,22]`, reference offset `[78.4,34.5]`, reference pixel origin `[1230,400]` and scale `.42` m/pixel. The city is translated as one assembly. Keep the western arrival spawn `[-132,80]`, original landing checkpoint, forest/glade and pond at their old world coordinates. The town services and city scenery use their relocated authored coordinates. The outside coastline graft retains the original western beach while preserving the city cape/U bay. East/south bounds extend to fit the relocated port; original west/north bounds remain. The northern headland and farm beds are outside the enlarged city. Preserve this metadata when exporting/importing; do not translate the whole world.

`shoreZ(x)` and `sea.shore/edgeKinds` remain the fallback for existing single-valued shores. Optional `sea.coastline` is an ordered coastal contour used for capes that genuinely require multiple land/water intervals at one X. Close its two distant northern endpoints for even/odd containment; that closing mainland edge is outside the playable/heightfield bounds and is not a surf segment. `seaContains()` uses the contour interior as land. `coastSample()` takes the nearest real coast segment and signs its distance with that same containment (positive inland). `sea.coastKinds` has one tag per real segment: beach, rock, quay, breakwater or shipyard. Do not infer water from a single `shoreZ` intersection on this layout.

Terrain carving, water collision/actor clearance, beach paint, surf distance/kind, water extents, quay coping and the static contact bake share this contour. The static contact texture clips its coast extents to `bounds` plus its existing 6 m side/north and 18 m south margins; distant mainland closure points must not reduce pier-pile resolution under the existing 2048 maximum dimension. Tests inspect all four submerged piles on every timber berth. Only beach segments receive sand/runup; quay, breakwater and repair frontage remain flat port water. `town.surfaces` holds `{kind:'paving',points:[[x,z],...],strength?,preserveRoad?}` polygons for the irregular market apron and shared residential courts; ground and map painting share them, with the legacy plaza-radius fallback when absent. Paving strength defaults to 1; `preserveRoad` gates court paving using the baked road mask so lanes remain readable. Authored dirt paint survives base noise. The layout exporter retains `layoutRevision`, `sea` and `town` along with docks, colliders, landmarks and spawns; the heightmap includes the carved contour and settlement plots.

`town.buildings` accepts the legacy `[x,z,angle]` format and authored objects `{id,x,z,angle,hx,hz,height,kind,roofColor}`. For the active `town.blockout` pass, visible boxes exactly match these oriented collider dimensions; roof colors are stored per building. No interiors are present. `docks` and their local ramp endpoints export directly. Save JSON remains version 2; the optional `worldLayoutRevision` relocates old coordinates once while preserving equipment, levels and the seven-step quest records.

The revised town has 67 exterior plots: 48 homes, six shops, ten warehouses and three repair/storage buildings. `town.styleSlice` and `town.districtStyle` select reused exterior assemblies; select IDs from data, not fixed counts. Per-building dimensions/colors/rotation remain authoritative. Cottage window and planter offsets adapt to smaller footprints, while doors retain human scale. Depot roofs follow the long plot axis; their window frames are clamped to the available width. The inn's porch, window spacing and planters adapt to its narrower plot. All bases/displays fit their individual oriented X/Z colliders. No interiors or new fishing rules are introduced. `netter_shop` and `sail_shop` distinguish the two small port shops from the provisioner. `harbor.workProps.kind=rope_store` adds a static net/coil/buoy rack inside its own plot. `town.trees` authors `{id,x,z,r,species,scale,rot}` birch/palm instances using the existing circle collision and tree renderer. `town.rocks` authors `{id,x,z,r,scale,rot}` shoreline boulders using the existing instanced boulder renderer and circle collision. Preserve IDs, radii and scales in the layout export; these static instances introduce no new per-frame resource owner.

`town.stalls` accepts legacy `[x,z,angle]` tuples or authored `{id,x,z,hx,hz,height,angle,row,stock,awningColor,openCounter}` objects. Respect each awning color and fish/produce/cloth/rope stock; the shortened rear awning exposes the counter. Authored stalls contain their own storage and do not receive the old loose side crates. `town.market.rows` groups stall IDs; `town.market.aisle` records the clear walking centerline/width. The revised residential loop goes around these rows.

`harbor.workProps` adds static `bench`, `planter`, `wash_line` and `market_board` exterior assemblies. A `repair_hull` with `stage:planking` uses its individual `hx/hz/height` for the large unfinished ship, open frames, partial strakes, stern platform, trestles and scaffold. Keep the visible work within the same oriented collision footprint. The public ramp remains independent and walkable.

`town.residents` authors `{id,x,z,r,angle,look,outfit,activity?,tool?}` fixed residents. Export their `citizen` circle colliders and place the existing procedural NPC rig at `groundY`; they have no new service/quest/save records. `sort`/`work` add small upper-body gestures after idle animation; a `mallet` is a cosmetic child of the right hand. `town.life` controls draw distance and gesture period. Cache animation state, cull updates beyond the draw distance, and release models/tools with the existing NPC root. No new AI patrol or GPU resource owner is introduced.

Road/coast corners are rounded curves baked in `world.json`; terrain, collision, safe routes, minimap and export use those same polylines. The fallback shore X stays strictly increasing, while the optional coastal contour can double back. Dock ramps sample/interpolate along local Z after rotation, with recessed supporting terrain preventing hidden or coplanar approaches. Adjacent timber ramps/decks overlap by 2.5 cm across their local seam to keep continuous walking clearance despite floating-point rounding. Procedural props must also reject expanded dock footprints, even where deck support makes `isWater()` false, so random trunks cannot obstruct the relocated approaches. Low coping follows only quay/shipyard/breakwater coast kinds and clips openings against all joining dock rectangles, including the slipway and breakwater. Cosmetic road/paving wear changes paint weights only. Geometry is merged per color at construction time; nearest-coast lookup compares squared distances before one square root.

Run `AZURE_LAYOUT_REVIEW=1 node tests/browser/azure-blockout.mjs` for current review: safe arrival/first quest, town checkpoint, market-to-pier route, all 67 entry paths, three market-aisle lanes, shipwright gesture/visibility, thirteen original-camera landscape location shots including the original arrival beach, one full-ship portrait view, the local map, registered city capture and an actual-renderer overview of the full beach-map placement. The overhead camera/fog changes are capture-only; its 1012×1224 frame registers the supplied plan rectangle [1009,115,1515,727] with X=(px-1230)*.42+78.4 and Z=(py-400)*.42+34.5, using the authored `town.placement` offset. Keep both breakwater legs and the water inlet behind them when importing the contour. Older style/wave review notes below describe the reused assemblies and previous layout; current geometry must be reviewed again. Merge/deploy are unapproved and hardware iPad FPS remains unmeasured.

The `headland` checkpoint/spawn zone now lies northeast of town; the southwest lighthouse cape is safe settlement. Checkpoint labels, the zone pictogram and `h_lighthouse`/`h_hermits` directions describe the northern headland. Preserve these existing internal IDs, targets, counts and rewards so saved quest progress remains valid.

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

`AZURE_LAYOUT_REVIEW=1` is the current data-driven location review and walks every authored frontage connection. The current collider/path safety test is in `tests/core/harbor.test.js`. `AZURE_DISTRICT_REVIEW=1` retains historical staging for the earlier district-art review. No new interior, boat-driving or fishing rule; save/quest/combat/input contracts remain unchanged. Hardware iPad performance is still unmeasured.

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
