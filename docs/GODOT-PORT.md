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
| Save data (`character` object) | `Dictionary` or `Resource` | The same JSON shape (`version: 4`, with `name`, `appearance`, `kit`, `progress`, `pos`). `migrateCharacter()` upgrades v1 and relocates characters once when `worldId` or `worldLayoutRevision` changes; levels, equipment and completed quest history are retained. Slots and export codes are in `src/save.js`. |

## Approved V3 city overlay

`layout.json.city` carries the approved GLB files, common translation, exact source
walk surfaces, street loops, collider/entry data and native timber shore joins.
Import the eleven runtime chunks under one translated parent without changing
child transforms. Exclude source Sea/Trees and retain native water/leafy foliage.
Use the original terrain heightmap beneath/outside the city. At a city point,
select the highest containing floor after excluding its `holes`; dock support takes precedence. Adjacent
docks and dry shore jointly support actor footprints. Permit the data-authored
`city.stepHeight` only between supported city surfaces; retain native slope and
water rules elsewhere. Disable replaced procedural town/quay/lighthouse meshes.
See [approved input and integration notes](APPROVED-CITY-V3.md).

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
| `maps.js` | `Maps.gd` autoload + one scene per map | `data.maps` registers the start map (`data/world.json`) and linked maps (`data/maps/*.json`) by id. Maps meet along open seams (see "Linked Greenhollow Frontier map"); `exits[]` (`pos`, `r`, `to`, `arrive`) remain for point travel; `Game.travel()` refuses far/dead/combat and calls `enterMap()`, which stores the current map's `progress.zones`/`waypoints` under `progress.maps[id]` and restores the destination's (plus its free stones). Then `change_scene_to_file()` the destination with the saved character; the web build reloads the page. Quests with `world` count waypoint/zone targets only on that map. |
| `atlas.js` | `WorldAtlas.gd` | One world for the player: `toWorld`/`toLocal` (local + atlas.offset), discovery per map (`progress.maps`) read as one world (`worldTotals`), and stones on any map (`Game.teleportTo(id, mapId)` travels there). The minimap and world map draw every map's image at its offset (`ui/mapimage.js worldMapImage`); zone/stone selections are `mapId:id`. |
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
| `render/ground.js`, `ground-color.js`, `ground-field.js`, `ground-brush.js`, `meadow.js`, `walk-surface.js` | Terrain shader/splat attributes, shared metre-based pigments in `art.ground.palette`, continuous meadow field for both ground paint and construction-only instanced grass density. Grass roots sample the terrain triangle; mask planted blades/flowers off paving, dirt roads, mud, beach, decks and colliders, including safe town lawns. Walking slab shaders use deck-local axes on rotated/sheared ramps. Timber decks are one merged mesh of separate boards on the painted 0.32 m plank pitch (seeded per dock: ragged ends, small gaps/twist/lift, two stringers) and piles lean slightly with extra pairs on long decks (`art.architecture.pier`); collision still uses the authored dock boxes. Grass blades take the ground colour at the root and the meadow `lawnTone` above it. Road, bare-soil and paving borders are noise-wobbled in the shader (`art.ground.road*`, `pavingEdgeWobble`). Paving drops a few slabs to earth and sinks a few (`pavingMissing`, `pavingSunken`). `surfaceData()` also returns a blurred `town` mask from `art.ground.townZones` (terrain attribute `aTown`, grass `aGrassTown`, last `groundColor` argument): inside it random dirt/meadow-soil noise is off, lawns are an even mown green, lane edges wander less and paving courts end in a kerb band (`townKerb`). The lighthouse (`art.architecture.lighthouse`: height, bands, base/top/lantern radii) is a banded tapered shaft on a rough stone footing with human-scale door and windows, corbelled gallery and railing, glazed lantern and domed cap, inside its collider circle `harbor.lighthouseRadius` (world.js, default 2). Coconut palms come from their own seeded pass (`world.js`, rng 4421): dart-thrown centres at least `sea.palmGroupSpacing` m apart on beach/rock coasts in zones whose `trees` list `palm`, from `sea.palmMinBack` m behind the dry-sand line (`sea.beach`, never on open sand) to `sea.palmBelt` m behind it; each is a single palm or, with `sea.palmPairChance`, a pair at least `sea.palmGap` m apart, every trunk leaning seaward (coast-distance gradient ±0.45, splayed from the group centre). Frond cards are anime-style: one solid leaf mass per frond (narrow at the stalk, widest about three quarters out, pointed tip) cut by a few large V-notches on each edge, cel-shaded as a sunlit half and a shaded half either side of a pale midrib, with flat darker/warmer bands at the crown and tip, a soft same-hue rim and a few separation strokes; UV v=0 is the crown end and v=1 the tip (canvas top). Crowns carry eight fronds plus two young ones. The zone tree pass no longer places palms; inland picks fall back to the zone's other tree. Authored `town.trees` palms are unchanged. The terrain's beach weight eases over `art.ground.backBeach` m behind the beach into a sandy-soil band with sun-dried grass patches; meadow clumps stop at `duneGrassLimit` and thin out toward the sand. Beach sand adds round bright/dull grains and a warm dry band inland of the swash. Palms (`nature.js` `palmTrunk/palmFrond`, `art.architecture.palm`) are a curved ringed trunk with vertex-coloured rings and alpha-tested frond cards: an arching rachis with both halves folded down in a V, painted once by `palmFrondTexture()` (`leafpaint.js`, seeded canvas of tapered leaflets), plus three young upright fronds, a crown coconut cluster and 0–3 fallen coconuts per palm on dry free ground (`fallenCoconuts`). In Godot use a texture atlas with alpha scissor. The shipyard's planking hull is drawn from one half-breadth/sheer function: flat transom stern, pointed bow with a raked stem where both rails meet. Exterior builders (`market.js` `builder()`) turn timbers under 4 m slightly about their thinnest axis, seeded from the part's own numbers (`art.architecture.handmade`); roofs are tile courses with staggered, two-tone plates, tiled hip ends, hip caps and a segmented ridge (`art.architecture.roof`); district plinths are extruded ragged outlines with edge stones; fishing boats carry rubbing strakes and floor ribs. All stay inside the authored collider footprints (`tests/render/azure-footprints.test.mjs`); geometry is built once at load, no per-frame work. `tests/browser/town-art.mjs` captures the town review views. Port noise/strokes with derivative antialiasing to Godot spatial shaders; retain real shadow reception and owner disposal of surface materials. One 1024² shared mipmapped brush atlas is baked deterministically at construction, with last-owner texture disposal; no external texture asset, collision or save-format change. Performance: the ~12 low-frequency value noises of the painter (meadow cover/worn, broad tint, ochre, bare/road/paving/shore wobbles, bank, sandy soil) are baked once at load into three RGBA8 field textures at `art.ground.fieldTexels` per metre (`bakeGroundFieldData`, same formulas) and sampled with linear filtering; earth/road textures are only painted where soil, bare ground or a road shows. Grass clump colours (root ground colour and lawn tone) are evaluated once per clump by a one-off GPU points pass and read back into 8-bit per-instance attributes (`bakeGrassColours`); blades only blend them. In Godot, bake the same fields to textures and grass colours to per-instance custom data. |
| `render/hero.js`, `render/rig.js`, `render/monsters.js` (procedural models and animation) | Replace with real rigged models (`.glb`) and `AnimationTree`. The procedural poses show what each animation should read as (wind-up, charge, shell, slam). |
| `render/vfx.js` | `GPUParticles3D` and shader meshes. Keep the rule that effect shapes match the hit areas. |
| `render/firebolt.js`, `combat-fx.json.skills.firebolt` | Fire-element Firebolt uses an animated flame distance field and additive corona on shared velocity-aligned camera billboards and a fixed-capacity instanced pool of wisps and embers. Charge follows the posed weapon tip and clears on release/cancel; the cast corona is padded to avoid quad clipping. The tapered wake uses advected noise-cut curling tongues with staggered pointed ends; drift-aligned wisps do not widen it into a slab. Impact is a compact white contact flash that peels into asymmetric flame tongues and drift-aligned sparks, with no expanding ring or smoke, driven once by the existing event. Impact direction comes from the nearest last-rendered Firebolt, with no core event change; the compact contact layer draws over the struck surface. Port to `QuadMesh`/spatial shaders and bounded `GPUParticles3D`, retaining the same source/velocity and expiry contracts. Particle billboard bases must remain right-handed (right = (direction.y, -direction.x)) for front-face rendering. Embers retain a bright core and configured width/shrink over their 0.42 s lifetime so they remain legible after the 0.18 s flash. The oval visual head uses configured along/across radii (0.29/0.19 m), with an animated hot pocket inside orange/gold layers rather than a uniformly white disk; head heat/turbulence are data settings. Base projectile speed is 9 m/s, leaving room for projectile-speed modifiers; damage, range and collision radius remain unchanged. Element conversions use the existing element renderer. |
| `lab/tuning.js`, `lab/editor.js`, `lab/lab.js` | Data-generated phase controls, per-skill Lab-only overrides, safe import/export and browser storage. Vfx accepts an isolated config; preview restart clears timers and disposes owned meshes while retaining shared geometry/pools. In Godot, build one inspector from exported effect data/resources and inject a preview copy rather than changing combat rules; see `SKILL-LAB.md`. Generic projectile scale/glow/trail and impact parameters now live in `combat-fx.json.projectileDefaults`. |
| `render/monster-views.js` `syncMonsterViews` (called by `View.syncMonsters`) | Monster models only exist within `VIEW_RADIUS` (58 m) of the hero, and of those only the ones whose bounding sphere (rig height, plus a 2 m margin) touches the camera frustum are drawn and posed; skinned models have `frustumCulled` off, so this test does the culling. In Godot, `VisibleOnScreenNotifier3D` (or a `VisibilityRange`) on each monster gives the same. |
| `render/trail.js`, `data/combat-fx.json` | Melee looks. A player's swing draws a ribbon between two points on the real weapon (grip + `base`/`tip` metres along the blade, per weapon type) while the strike moves, which in Godot is a trail on a `BoneAttachment3D` of the weapon; the hit area (the skill's `range` and `arc`) is a separate flat wedge that flashes on the ground. Each monster melee attack name has a look that shows what the creature hits with, tweakable per monster in `overrides`: `slap` water splash, `peck` beak needle, `sweep`/`shove` a heavy band, and for `rend`/`rake`/`claw` (claws), `bite` (fangs/tusks), `pinch` (crab claws) and `scythe` (mantis blades) a trail that comes out of the monster's own limb (`render/monster-trails.js`): short ribbons recorded from the real tip of the bones named in `limbs` (the far end of that bone's model segment), three or four side by side for claws, only bright while the tip moves fast, and only during the strike itself (never the wind-up). The strike animations sweep across the body (a hooking bite, a raking swipe) so the trail reads from the top-down camera; where it lands there is a small contact burst. In Godot: a `BoneAttachment3D` at each limb tip driving a trail mesh, exactly like the hero's weapon trail |
| `render/monster-motion.js`, `data/monster-motion.json` | Monster locomotion feel. `view.js` measures each monster's ground speed (and its forward/sideways parts) from the simulated position; the gait cycle advances by speed so a planted foot sweeps back exactly as fast as the body moves (`rate = speed * 2π * duty / (2 * legLength * swing)`), legs have a planted stance and an eased, lifted swing, gaits blend walk → trot/gallop by speed, the body sinks while legs are spread, and bob/rock/roll/spine sway, head stabilisation, breathing, idle look-around and springy tails/ears/caps sit on top. Crabs sidle side-on while travelling. In Godot: an `AnimationTree` blend space driven by the same measured speed (or root-motion clips authored to these stride lengths) plus the same additive idle layers. |
| `ui/*` (HUD, panels, title menu, character creator) | Godot `Control` scenes. `ui/ux.css`, `ui/art.css` and `ui/workspaces.css` define desktop, tablet and phone layouts; `ui/inventory.js` presents gear comparisons and item categories. Keep a persistent modal close/return button and a separate movement slot. `ui/menu-map.js` defines the menu structure: one **main menu (hub)** opened by the HUD menu button or Esc lists five groups (adventurer, skills and mods, items and shop, journey, system), each page opens only when pressed, shows just its own group's pages in the sidebar and has a back-to-hub button (also in the bag/skills workspace). The HUD keeps only bag and skills shortcuts beside the menu button; C/J/K/I/L/M still open their page directly. Port as a hub scene with group panels and a page stack. |

`ui/art.js` and `ui/jobart.js` contain individually authored SVG illustrations keyed by base content ID.
Reuse the same image for grade/enhancement variants; display the grade and +N separately.
The approved PR106 identities for `salt_slime`, `tusk_boar`, `thornback_wolf`,
`greyfang`, `reed_viper` and `marsh_wisp` use the same transparent 256px PNGs
in the field guide, boss pins, material-source details and quest pictures through
`SHARED_MONSTER_PORTRAITS` in `ui/raster-icons.js`. Preserve their stable IDs.
`viper_scale` and `wisp_core` use the approved 512px inventory PNG replacements;
material names resolve centrally in `data/items.json` for costs, rewards and loot.
`ui/atlas.js` selects a destination before an explicit travel action. Map symbols in
`ui/mapimage.js` use the generated world's real positions. `ui/jobview.js` mounts the worn journal in `ui/skill-journal/`. Its read-only model
places current foundation nodes and actual origin neighbours on one starting spread,
ordinary paginated paths in early chapters and group drilldowns in dense chapters IV+.
All 207 current passive IDs remain reachable; no category chooser appears at entry.
Major `jobtree.sections` own `tier` and `requiresSpent`: thresholds use TOTAL allocated
Job Points (origin excluded). Each node references a section and must ALSO connect to an
owned neighbour. An unlocked section never bypasses adjacency. Keep one profession,
Job Lv5 choice and `requiresJob` restrictions. Job level extends to 40 (39 points);
each profession has sufficient connected choices in its base chapter plus specialization.
`jobPath()` previews the shortest connected route without inventing filler purchases.
Pan/zoom and book pagination are transient view state. A finite 620 ms decorative
leaf never owns actions; rapid turns cancel the previous leaf, and reduced motion
uses immediate navigation. Original paper noise uses a gesture-created AudioContext,
mute/SFX preferences under `frontier-demo.journal-paper-sfx.v1`, and explicit cleanup
on panel exit. Port these as disposable view/audio owners, not character save fields.
Nodes and purchase buttons remain separate;
touch gestures never allocate points. Minimum touch targets stay 44 logical pixels.

Character v4 retains the one-time `treeRevision` refund from v3: reset the old network
and profession, retaining stats, skills, mods, materials, gold and gear UIDs. Only v1/v2
roll values map to the new range at their original quality percentile. All pre-v4 gear
gains missing 2/3/4/5 grade slots at conservative minimum values; never reroll existing
affixes, consume RNG or repeat the fill after v4. Invalidated equipped gear stays owned
in the bag. The slot envelope remains version 2. `/lab/` uses separate storage keys;
exported main codes can be imported without overwriting main-game saves.

Equipment instances persist `itemLevel` from the exact gear recipe; starters use 1.
Legacy instances without a valid positive integer use the conservative base level.
Mod instances persist C/B/A/S `grade` from the authored mod recipe, independently
of mod `level`; missing/invalid legacy grades become C. Normalize these optional
fields on every migration without consuming RNG or changing map records. Preserve
valid existing values. Item level now gates wearable slots as described below; it
does not change item stats, prices, costs or drops. Mod grade remains presentation only. Upgrades retain both fields. UI colors only mod names by grade; coin
materials continue to encode attack/mechanic/support. See [the initial mapping](ITEM-METADATA-2026-10-04.md).

Crafted C/B/A/S gear has 2/3/4/5 unique affixes. Every base/recipe pool supports five.
Grade promotion retains existing rolls and +N, adding one unique affix. Enhancement
+1..+5 changes base stats by 4% per step. Both upgrades use materials/gold only: no
character-level or stat gate. Skill ranks 2..5 retain their separate Lv4/10/17/24 and
stat gates, 6% direct growth and 5% MP growth; mods supply behavioural growth.

`gearRequirements(item,data)` returns `{level: equipmentItemLevel(data,item)}` for
`armor`, `helm`, `gloves`, `boots`, and `charm` (41 bases: 9/8/8/8/8). Only raw
`character.level` satisfies this gate: not Job Level, allocated stats or equipment bonuses.
Catalog levels are 1/6/11/16/21; Tide Walkers is Lv1. Preserve a valid stored instance level;
legacy missing/invalid values keep the existing base-level fallback (then 1). A valid
custom level above the cap stays intact and cannot be worn; do not clamp or reroll it.
Grade, enhancement and affixes never raise a wearable's required level.

The 38 `weapon` and 5 `offhand` shield bases retain weighted base/grade/enhancement/affix
requirements from `items.requirements`, checked against raw `character.stats`. Dual-wield
requirements, skill/mod gates and all stats, costs, rolls and options are unchanged.
`gearEquipState` is authoritative for equip eligibility and active combat stats. It returns
`rows: [{stat,need,current,deficit}]`, `requires`, and Thai `missing` descriptions.
Dual-wield gates sum both light weapons' requirements for each hand. UI shows current
trained stats against the combined requirement; combat bonuses do not satisfy these gates.

`enforceEquipment` repairs structurally impossible hand combinations only. Stat/level loss,
respec, enhancement, promotion and migration retain unmet items in `character.equipped`.
`inactiveEquipment` derives status without saved flags; stat/level recovery reactivates items
immediately. `derive` excludes their stats, affixes, implicits and ammo bonuses; inactive
weapons cannot satisfy weapon-required skills. `gearLook` retains their visual identity.
UI shows red slot/tile borders, text status and current/required/deficit numbers.
`equipmentNotice` preserves the existing level-cap stat-reset explanation and appends
current inactivity. Repeat migration does not duplicate it; recovered stats remove only
the inactivity text, so the reason for the refunded build stays visible. Upgrades
and promotions return `inactive` alongside `unequipped` (structural repairs only). Initial
equip still refuses unmet gates. No save fields or version bump are added; migration keeps
ownership, rolls and slots and reports inactivity after level-cap adjustment.


### Hands, gloves, shields and arrows (save v6)

`items.slots` is `weapon` (right hand), `offhand` (left hand), armour, helm, `gloves`,
boots, charm. `weaponTypes[t].hands` is `light` (either hand), `heavy` (right only, a
shield or nothing on the left) or `two` (both hands; `ammo: true` for bows). Base power is
`handRules[hands].baseFactor` x the light reference for the item level (two 2x, heavy
1.5x; base stats only, never affixes), tested in `tests/core/gear-hands.test.js`.
`equip(ch, data, uid, slot)` takes the target hand; `handBlocker` explains a refusal and
a two-hand or heavy weapon returns an incompatible left-hand item to the bag (`freed`).
Two light weapons dual-wield with no penalty, but `wearRequirements` sums both items'
requirements for each of them. Shields add `blockChancePct` (cap 50); `damagePlayer`
lets through `combat.block.taken` of a hit from within `arcDeg` in front, never from
behind or from a sourceless hazard.

`ch.arrows = { use, stock }`. Attack+Projectile skills spend `arrowsPerCast` (perCast,
plus multiShotExtra with extra projectiles); none left refuses the cast with a
`fail`/`arrows` event and no MP spent. The type in use adds its stats with a bow and hands
over to the next stocked type. Arrow recipes (`type: "arrow"`) are crafted anywhere outside
combat through `Game.craftArrows`, up to `arrows.capacity` in all. Migration to v6 adds
the new slots and the starting stock.

Mod ranks raise their stat requirement by `modUpgrade.requiresStatPerLevel` per rank
(`modRequires`); an unmet rank stays socketed but inactive, and the upgrade is refused.

`core/power.js` folds everything into one power score: sqrt(best slotted damage skill DPS x
effective HP vs a frontal hit) x `progression.power.scale`. `powerDelta(ch, data, change)`
previews any change on a copy. Gear sells (`sellGear`) or salvages (`salvageGear`,
`salvageMany`) in town into a grade share of its recipe plus part of its +N materials;
worn and `locked` items are refused.

### Balance model, gear tiers and drops

`core/balance.js` is a pure model of a reference hero per kit at each level, against the
average monster of that level, wearing the expected gear tier (`progression.balance`).
Port it with the data so the same targets can be checked; see [BALANCE-25.md](BALANCE-25.md).
Gear bases sit on tiers (item level 1/6/11/16/21). The six targeted garment additions
(Sporeweave vest/gloves at 6, Moonleaf Slippers at 11, Wardenstalker coat/hood/gloves
at 21) use the same stat-based wear, recipe, grade, enhancement and drop rules;
there is no character-level equip gate or set bonus. Their PNGs do not imply new
3D outfit meshes; the current renderer reuses existing look templates.
 `gearDropCandidates` picks bases made from
the monster's parts at the tier for its level (falling back to the nearest lower tier).
`rollGearDrop` rolls a grade best-first (`items.gearDrops`) and options like a craft. A
`drop` of item `gear` carries `gear`; pickup gives it a new uid. `goldFindPct`,
`materialFindPct` and `gearFindPct` (capped) scale kill gold, part chances and gear chances.

Journal build lines are ordinary job nodes with a `line` id and sections `stage-4`/`stage-5`
(gates 17 and 25 spent). A node may name `requiresAny` as well as `requires`: ALL of
`requires` and at least ONE of `requiresAny` must be owned. Forks rejoin with `requiresAny`.
Bridge nodes (`bridge: [lineA, lineB]`) need either line's entry and open either line's
meeting node. `jobParents()` lists both kinds of parent for drawing. `cheapestParent()` picks
the cheapest any-parent when planning a route (on the page first). Each line page carries a
`grid` of `[column, row]` cells. Place nodes from it, and size columns and rows to the
fixed-size captions. New derived stats: `damagePct` (Damage tag),
`attackDamagePct` (Attack tag), `elementalDamagePct` (Fire/Cold/Lightning/Poison tags),
`critMultPct` (multiplies `critMult`), `castSpeedPct` (divides cast time AND cooldown),
`penetrationPct` (multiplies monster defence by `1 - pct/100` in `hitMonster`),
`movementRechargePct` and `manaCostReductionPct`. Caps and soft caps are in
`progression.json`. `balance.js` `lineEffects`, `linePath` and `longFightDps` model them.
The journal pages the stage overview (6 pages per spread, 4 on phones and short screens). A
grid page taller than the view scrolls, and "fit" stops at the readable zoom. Both are
presentation only.

Cap leech after mods and recover only actual target HP removed, never overkill damage.
`gearUpgradeState`, `skillUpgradeState`, `modUpgradeState` and `gearGradeState` are shared
by UI and rules; all previews are pure. Equipment state helpers check resources only.

`craftBatch()` allows 1..10 independent attempts, optional grade/affix/quality targets,
and stops on target or the first unpaid attempt. Bill only completed attempts and notify
quest progress once per item; preserve every result and UID. Never auto-equip or destroy
unwanted rolls. A selected recipe opens one reusable `craftview.js` workshop; selection
and comparison never craft or spend. Preserve its repeat button, goals, recent twenty
result UIDs and a return-to-workshop path after bag comparison. All results stay in the bag.

The bag/workbench/growth views share grade pips, ranges and progression requirements via
`ui/progressionview.js`. Port `tests/core/balance.test.js`, `crafting.test.js` and the mouse/
touch flows in `tests/browser/balance.mjs`. Exact tuning/research is in `BALANCE-40.md`.

Rebuild separate Control scenes for combat loadout, modifiers, movement, material
upgrades and passive paths. A desktop/tablet navigation rail becomes a compact page
selector on narrow phones. Keep inspection separate from allocating points, socketing,
and spending materials. `ui/buildmeta.js` is presentation vocabulary shared by skill,
modifier, crafting and inventory details: native tags, damage element, stat requirements,
all/any/excluded tags and exact incompatibility reasons. Modifier-added tags are labeled
separately and do not silently grant native-tag eligibility. Calls to core `modFits()`
remain the authority for compatibility; do not duplicate the rules in Godot UI code.

### Mid/high monsters (attack kinds and presentation)

Five behaviours in `core/ai.js`: `mantis`, `viper`, `ram`, `stalker`, `sentinel`. New attack kinds:

- **`scythe`, `claw`:** planted strikes on the `m.melee` path. They hit once at `hitTime`
  inside `arc`.
- **`whirl`:** a 360° planted strike on the `m.melee` path (mantis).
- **`rend`, `rake`:** planted combos on the `m.melee` path. `atk.hits` lists each contact
  (`at` time, `off` angle offset, `step` forward, optional `knock`); each hit tests the arc once.
  Wolves use `rend` (2 hits), Greyfang `rake` (3 hits). They replace the old repeated lunges.
- **`lash`:** an instant short line (like the sentinel `beam`, `kind: 'lash'` on the event).
- **`shove`:** an instant cone with `knock` (ram). `charge` (boar) is the only straight rush left,
  besides the hawk `dive` and stalker `pounce` leaps.
- **`quake`:** the warden marks `steps` `quake` areas along the locked line at wind-up start;
  each erupts `stepDelay` after the previous one.
- **`stomp`, `shards`:** a ring around the monster at the end of the wind-up.
- **`venom`:** a `venom_pool` area marked at the target for the whole wind-up plus flight, then
  ticking.
- **`pounce`:** a `pounce` area marked at the target, then a dive-style leap.
- **`beam`:** at the end of the wind-up, a line (length `range`, width `width`) from the
  monster. Emits `beam`.

The stalker sets `m.stealth` while it circles. Any wind-up or a hit (`revealT` 2 s) clears it.
The view fades its toon material (`transparent` needs a recompile, so it toggles only on
change) and its outline hull; pooled rigs are reset on release.

Rigs and animation live in `render/monsters-midhigh.js` (procedural, 700–4500 triangles).
Telegraphs reuse the ring, sector and lane decals, with a fixed-length lane for the beam.
`balance.js` adds `monsterTtk`, `monsterExpPerMin`, `bossOnlyMaterials` and `recipeFarming`.
Browser review: `tests/browser/midhigh-monsters.mjs`.

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
defense nodes use Job Points and do not add STR/INT. That earlier batch kept 13 combat and four movement; the prototype expansion below
adds the new delivery executors and retains four movement skills. Run `tests/core/workspaces.test.js`
assertions in the port and reproduce the separate-page flows in
`tests/browser/workspaces.mjs`. See `UI-WORKSPACES.md` for reference and verification scope.

The equipment/loadout UI uses two separate landscape windows with selected-object
details on demand. Port `loadout-workspace.js` selection/pagination to Control nodes;
retain the existing core equip, socket, notify and save contracts. A flying coin
is presentation only: commit state first, cancel superseded motion, and keep the
latest visible attachment. Reuse existing scene rendering for a cached full-body
equipment portrait and release temporary render targets. No character/save shape
or passive-tree rule changes accompany this presentation.

`gearLook()` includes a `bases` map of equipped item IDs (derived presentation metadata,
not saved state). `render/equipment.js` uses it for distinct weapon/boot/charm silhouettes.
Imported models are listed in `data/models.json` (GLB files in `public/models/`, currently
Meshy weapons). Older GLBs already use the weapon-bone convention (grip at the origin,
blade along +Z, metres). Approved unmodified sources with `sourceTransform` first translate
by negative `grip`, rotate with Euler XYZ radians, then uniformly scale into that convention.
Apply the same fit in Godot before attaching to a `BoneAttachment3D` on either hand;
bow limbs run along Y and the belly points +Z. Staff grips seat on the shaft midpoint.
The cached fitted geometry and textures are shared; each rig owns its toon materials.
All 38 weapon bases are registered, and only current equipped/portrait weapons load on demand.
The procedural shape in `equipment.js` remains the pending/failed-load fallback.
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
The default player now uses the approved HairSample VRM0 master derivative
(`public/models/hairsample-male.glb`, `render/hairsample.js`). Its default scene is
the complete base body; optional garment geometry lives in a separate wardrobe
scene and shares the cloned native skeleton at runtime. Existing driver motion,
equipment fields and save v4 remain unchanged. In Godot, import the two scenes
and bind the equipment meshes to that same Skeleton3D. Source identities and
conversion details are in [HAIRSAMPLE-INTEGRATION.md](HAIRSAMPLE-INTEGRATION.md).
Regular monsters have Meshy models too (`data/models.json` → `monsters`, GLBs in
`public/models/monsters/`). Meshy only rigs humanoids, so `render/monsterSkin.js` skins each
model onto the procedural monster rig at load: `bones` moves rig joints onto the model,
`segments` (one line, or several, per bone in rest space) give each vertex weights by
distance (`sharpness`, `minWeight`), `pitch`/`yaw`/`scale`/`offset` align the model, and
`keep` leaves procedural parts on some bones (the wisp's motes). In Godot, rig the GLBs with
the same bone names and weights (or paint them) and keep the animation from `monsters.js`.
The Tidal Slime is a body of water rather than a single rigid bone: `body` (base), `mid`, the
curling `crest`, a `front` lip and three base `rim` points, with soft weights (`sharpness` 3).
Springs on them (`data/monster-motion.json` → `slime`) make it travel in pulses, lag behind its
own movement, slosh when it stops and wobble when hit; in Godot use the same bones with
`SpringBoneSimulator3D` or a jiggle script.
The salt slime model (a level-1 redesign: dome jelly with a shell, salt crust and seaweed) has one
rig bone, `body`, so every vertex follows it and the squash/stretch comes from scaling that bone.
The shore gull and hermit crab models follow the same scheme: the gull skins to `body`, `head`,
`wingL/R` and `legL/R`; the hermit crab reuses the reef crab rig (`shell`, `head`, `mandL/R`, six legs),
so its shell tuck scales those bones.
The slime, wisp, boar, thornback wolf, Greyfang and viper models were replaced on 2026-10-07 (the Tidal Slime,
Lostlight Wisp, Boarbull, Maskfang Wolf, Greyfang Alpha and a coiled Reedblade Viper); `scripts/prep-monster-glb.py`
makes a monster GLB from a Meshy export (bake the rest pose, drop skin, keep the main piece, normalise, decimate,
512 px colour map) and `assets/meshy/monsters/README.md` lists the sources. The boar, wolves and Greyfang bones are
placed from the Meshy rig joints. The wisp's own floating flames replace the procedural motes (no `keep`), and
the coiled viper's `wave` in `data/models.json` scales the animator's slither (`rig.modelCfg`; in Godot, a
per-model amplitude on the body-wave track).
The five mid/high monsters (mantis, viper, ram, stalker, sentinel) have models on their
`monsters-midhigh.js` rigs. The mantis model is bound with its scythes raised, so its animator
remaps the arm/blade angles when `rig.model` is set; the viper model rears its head on an S-shaped
neck, so its bone chain follows that neck and its wind-ups tilt the head back from the neck
(`seg0` undoes the tilt for the body) instead of lifting it; the sentinel's floating shards are each weighted to the
nearest `shard0-5` bone and its pillar to a ring of `body` lines (so the stone stays rigid), and
the ring never pulls in past its rest radius. The stalker's stealth fade applies to the model
material too (`rig.modelMaterial`/`modelHull`).
The face is a canvas atlas of four expressions (`render/face.js`) on a patch cut from the
head mesh; in Godot use a face texture with UV offsets per expression. Hair (`render/hair.js`)
is one merged mesh per style built from lock curves; export it once per style as a mesh and
port the angel-ring band as a shader on the hair material. `data/gait.json`
holds the walk and run cycles as driver-bone Euler angles (XYZ) per frame; the cadence is
`speed / cycle` cycles per second.
Skill actions (`render/actions.js`) are keyframed poses with a `hit` time; port each as an
`Animation` with a method track (or signal) at the hit, and use `SkeletonIK3D` (or a
two-bone IK modifier) for the ikL/ikR/grip channels.
How the hero carries each weapon type is data (`data/weapon-holds.json`, read by
`render/hero.js`): a right-palm target and a weapon direction in body space, a `one` carry
(left hand busy) and a `two` grip whose left palm IK-targets `grip` metres along the weapon
(heavy axe/mace with nothing in the left hand, greatblade). Melee actions add a `swing`
channel `[angle, elevation, height]` with weight `sw`: the right palm follows a circle of
`swing.radius` round the body and the blade points outward along it, keyed so the cut runs
the same way and at the same time as the approved crescent (steps 1 and 3 lower right to
upper left, step 2 reversed). During a non-swing action a `castHold` staff or a two-hand
weapon keeps its carry angle while the arm gestures, and the two-hand left grip lets go.
The standing pose is a neutral base plus the carry's `stance` (`stances`: `relaxed` shifts
the weight onto the right leg, `guard` is the staggered two-hand ready stance): bone offsets,
a body `drop` and sideways `shift`, faded out by the walk/run blend. Port as an idle pose
added under the locomotion blend.
Port as a right-hand IK target with a look-at on the weapon bone, blended by these weights.
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
Use each node's `category` and `clusterPos` for paginated early spreads and later
subgraphs. Dense chapter IV+ group marks are navigation only;
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

Save character version is 3. The optional `worldId` prevents restoring old coordinates
on a different map. On migration preserve the character build and quest history,
filter unavailable waypoints, add the landing checkpoint, and clear `pos` once.
A later save with this map ID keeps its current position and unlocked checkpoints.



## Azure Coast U-bay blockout

Current layout revision is `azure-original-beach-8`, based on main `7102e4310ca79fa56a2fab8a44c8ea7bf7e91ca7`. The owner rejected the merged PR #22 layout; earlier layout approval is superseded. The correction remains a draft awaiting image review. Read map dimensions from `bounds` (currently 370 × 300 m, including the original western beach and northern hunting grounds).

`town.placement` pins the original beach map source `88e2a2bc0a8d288909b05b86d6e9d1d394362f00`, original town centre `[62,22]`, reference offset `[78.4,34.5]`, reference pixel origin `[1230,400]` and scale `.42` m/pixel. The city is translated as one assembly. Keep the western arrival spawn `[-132,80]`, original landing checkpoint, forest/glade and pond at their old world coordinates. The town services and city scenery use their relocated authored coordinates. The outside coastline graft retains the original western beach while preserving the city cape/U bay. East/south bounds extend to fit the relocated port; original west/north bounds remain. The northern headland and farm beds are outside the enlarged city. Preserve this metadata when exporting/importing; do not translate the whole world.

`shoreZ(x)` and `sea.shore/edgeKinds` remain the fallback for existing single-valued shores. Optional `sea.coastline` is an ordered coastal contour used for capes that genuinely require multiple land/water intervals at one X. Close its two distant northern endpoints for even/odd containment; that closing mainland edge is outside the playable/heightfield bounds and is not a surf segment. `seaContains()` uses the contour interior as land. `coastSample()` takes the nearest real coast segment and signs its distance with that same containment (positive inland). `sea.coastKinds` has one tag per real segment: beach, rock, quay, breakwater or shipyard. Do not infer water from a single `shoreZ` intersection on this layout.

Terrain carving, water collision/actor clearance, beach paint, surf distance/kind, water extents, quay coping and the static contact bake share this contour. The static contact texture clips its coast extents to `bounds` plus its existing 6 m side/north and 18 m south margins; distant mainland closure points must not reduce pier-pile resolution under the existing 2048 maximum dimension. Tests inspect all four submerged piles on every timber berth. Only beach segments receive sand/runup; quay, breakwater and repair frontage remain flat port water. `town.surfaces` holds `{kind:'paving',points:[[x,z],...],strength?,preserveRoad?}` polygons for the irregular market apron and shared residential courts; ground and map painting share them, with the legacy plaza-radius fallback when absent. Paving strength defaults to 1; `preserveRoad` gates court paving using the baked road mask so lanes remain readable. Authored dirt paint survives base noise. The layout exporter retains `layoutRevision`, `sea` and `town` along with docks, colliders, landmarks and spawns; the heightmap includes the carved contour and settlement plots.

`town.buildings` accepts the legacy `[x,z,angle]` format and authored objects `{id,x,z,angle,hx,hz,height,kind,roofColor}`. For the active `town.blockout` pass, visible boxes exactly match these oriented collider dimensions; roof colors are stored per building. No interiors are present. `docks` and their local ramp endpoints export directly. Save character JSON is version 3; the optional `worldLayoutRevision` relocates old coordinates once while preserving equipment, levels and the seven-step quest records.

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

Incoming crests move north from the open bay; `sea.surf.waveSpacing` and `period` define their travel speed. Beach runup is phased from the same arriving crest at the nearest coast. Port crests are finite curved anime ribbons with rounded tapered ends that bow forward in their direction of travel (centre leading, ends trailing); their stroke anti-aliasing uses the continuous phase, not the per-row distance, so the row seam never draws a straight line. Open water adds drifting cel sky-reflection patches and sparse twinkling four-point sun glints (`sea.surf.sparkleDensity/sparkleSize/sparkleScale/reflectionPatches`); incoming-wave exposure attenuates them. Beach crests retain the previously reviewed thin, intermittent treatment. Contact foam starts when a crest reaches the nearest physical waterline, spreads along that contour, then dissipates; a short outward return ripple follows the struck contour. Incidence and exposure reduce the sheltered side. The sea surface is masked inside solid cross-sections. Beach swash remains based on the existing shore/heightfield, with unequal branching water channels replacing uniform circular foam holes. This is a static stylized contact approximation, not a fluid/wave-reflection simulation, and does not respond to actors or future moving boats. Core movement, saves and services are unchanged.

`node --test tests/render/water-contact.test.mjs` checks hull taper, rotated solid masonry/piles, open water below elevated timber decks, exposure and texture ownership. `AZURE_FINISH_REVIEW=1 AZURE_WAVE_ONLY=1 AZURE_CONTACT_REVIEW=1` captures incoming/impact/spread at a working berth, stone armour and quay wall. Optional `AZURE_WAVE_SEQUENCE=1` samples a 6 s contact animation (72 frames/12 samples per simulated second); ordinary wave-only mode still reviews one beach swash cycle. Sampling does not measure device FPS.


### Graphic anime port crests (owner review correction)

The volumetric swell pass was rejected by the owner: preserve anime graphic crest marks, soften their straight rigid appearance, and retain the beach treatment from 7f895603ef1cc2064d6d1a18163767593cf68c03. Remove the GPU height/slope shading and its four swell settings. All sea meshes again use their original level/terrain-film surfaces. Beach runup, foam channels, phases, palette and thin offshore crest code are restored from that source.

`sea.surf.crestBend` sets port-crest curvature in metres, `crestWidth` the ribbon width, `crestLength` the spacing of varying-length arc groups, and `crestOpacity` their light-cream contrast. The port shader moves curved crests north; individually bowed along-crest groups produce unequal strokes, with continuously tapered rounded tips and antialiased edges. Row/group seeds change while the marks are invisible between crests. A restrained teal underside preserves the drawn anime look without volumetric gradient waves. Derive port contact timing from the same curved phase; beach contact timing stays at the reviewed old phase. No geometry, texture, ownership, water physics, collider or save change.

`node tests/browser/azure-wave-lines.mjs` captures the pier and beach in the original gameplay camera/HUD. Optional `BEFORE_ROOT=/path/to/built/revision` checks identical player/camera transforms. `BASELINE_SHA`/`REVIEW_PARENT` record comparison source identities; the report also records the live port material style/settings to guard against stale captures. `WAVE_SEQUENCE=1` captures one 7.5 s pier cycle at six samples per simulated second, plus matched beach stills to review the restored treatment. These samples do not measure PC/iPad rendering FPS.

### Physical cut and contact presentation

Core `hit` events optionally carry `skill` and `attackKind`, and `slash`/`whirl` carry `skill`; these are cosmetic profile selectors, with no damage/range/timing/save change. Use `combat-fx.meleeDefaults` or an authored `renderer: melee` profile. Prepare timing controls weapon-trail sampling, never gameplay contact time. At authored contact, render a thin tapered moving blade ribbon inside the real range/arc and a sparse directional contact fan. The second combo reverses the cut; the third increases visual width/tilt without altering gameplay reach. Whirl uses two opposite half-cuts, without an expanding blast ring. Sample actual posed weapon base/tip for the short trail, clear on cancellation, and bound/reuse contact particles. Keep brief contact shake/hit-stop in the view layer. Shared Lab controls generate from this profile and replay melee kinds without additional skill menus.

### Other physical skill presentation

`combat-fx.skills.hunter_shot` (`renderer: arrow`) defines bow draw, the wood/metal projectile, a thin tapered speed streak and one directional contact. Player projectile impact events now carry optional `vx/vz`; no speed/range/collision change. Suppress the duplicate `hit` contact for this skill. Converted arrow streak/contact colours follow the existing element; multishot, pierce and chain continue through existing projectile rules.

Stone Burst (`renderer: stone`) retains `castTime + delay` and the exact area radius. Reveal terrain-conformed radial cracks during the delay, pop faceted stones quickly at the burst, then return them below ground while bounded instanced chips follow gravity and shrink. Shared rock templates remain alive; conformed crack geometry belongs to its marker and must be freed. These meshes and debris never extend damage duration.

Spirit Wolf (`renderer: spirit`) has a small inward summoning mark and two short converging bite cuts. Core emits optional `allyStrike` only for a successful bite after the existing .25 s wind-up; `hit` carries `skill: spirit_wolf`, `attackKind: summon` and the actual ally source position. Keep these selectors cosmetic. The view snaps its existing jaw/body pose briefly during recovery. Lab reuses the same rig and a presentation adapter, without persistent combat AI. No new skills, save schema, summon lifetime, movement, damage or contact rules.

## Shop, potions and quick item slots (save v7)

`core/consumables.js` holds the rules; `data/items.json` → `consumables` (types, `groupCooldown`, `stackMax`, `quickSlots`, starter set) and `shop` (`stock`, `buyAmounts`). Each map's `town.shop` is where the player stands to buy (`Game.nearby().shop`, same radius as the workbench) and `town.shopkeeper` is the merchant NPC `[x, z, facing]`. `Game.buyItem(id, n)` spends gold atomically and fills the first empty quick slot; `Game.useQuickItem(slot)` restores `flat + pct × max` HP or MP at once, refuses a full bar (no wasted potion), and starts only that group's cooldown (`player.itemCooldowns`). Saves are `version: 7`: `ch.consumables` (`{id: count}`) and `ch.quickItems` (four ids or null); v6 saves get the starter potions once. In Godot, keep the two dictionaries on the character resource and drive the four HUD buttons (keys 5–8) from them.

Potion presentation resolves `${group}_potion_${size}` through the supplied PNG registry under `assets/icons/consumable/`; `ui/potionart.js` retains the authored SVG for definitions without a registered PNG. Shop cards, slot selection and HUD buttons share this resolver. Preserve each 512px canvas and its transparent padding when importing into Godot: the small/medium/large progression is painted into the image, so fit the complete texture rather than cropping to its alpha bounds. The five mid/high monster parts (`mantis_scythe`, `viper_scale`, `ram_horn`, `dusk_pelt`, `rune_core`) similarly resolve supplied PNGs through the material registry for inventory, recipe costs and ground loot. Item IDs, counts and save fields stay the same.

Skill and mod ranks are no longer gated by character level: only materials, gold and the stat requirement count. `skillUpgrade.steps[].balanceLevel` is only the balance model's assumption of when a hero affords each rank (`core/balance.js skillRankAt`).

## Rendering performance (static batching and dynamic resolution)

`render/static-batch.js` runs once after the scenery is built and the water contact is baked. Static meshes whose materials are the shared toon colours, their outline hulls or the shared feature-edge lines are merged per 24 m map cell: each part's colour (and outline colour) becomes a vertex colour, so one vertex-coloured toon material and one outline material draw a whole cell, and a surface and its hull share one merged geometry. Wind-patched, walk-surface, transparent, instanced, skinned and moving objects (waypoint crystals) are left alone. Emptied groups are pruned and the static subtree's matrices frozen (`matrixAutoUpdate`/`matrixWorldAutoUpdate` false). In Godot, use merged static meshes per cell or MultiMesh with vertex colours; the look is identical.

`render/resolution.js` (`ResolutionGovernor`, settings `rendering.json` → `dynamicResolution`) lowers the render scale step by step when the average frame time stays above `slowMs`, never below `minScale` or 1 device pixel per CSS pixel, and climbs back once frames run at the display's own rate (average within `vsyncSlack` of the shortest recent frame, since requestAnimationFrame never beats vsync) for `recover` seconds; a step up that is followed by a slowdown doubles that wait, up to `maxRecover`. A device that holds the target stays at scale 1. It is off under browser automation (`navigator.webdriver`) and with `?dynres=0`. In Godot, use the viewport's `scaling_3d_scale` with the same thresholds.

`tests/browser/gpu-bench.mjs` times fixed scenes through to GPU completion and the CPU submission separately (SwiftShader: relative before/after only, not iPad FPS); it fails if any shader errors are logged.

## Finite terrain joins

Finite terrain joins: the two linked maps' decorative heightfields have different
extents. Use the neighbour's actual grid footprint when deciding which native
terrain cells it can replace; water aprons retain the separate full-edge clipping
rule. In the closed-end decorative strip, construct private render height samples
that meet the adjacent playable map and finite grid cap. Preserve all playable
vertex heights and the rule/collision heightfield. Seat retained edge-tree
instances on their actual rendered owner's surface. See
`TERRAIN-SEAM-REPAIR-20261007.md` and `render/terrain-domain.js`; this is tested for
the current aligned one-metre map grids, not arbitrary irregular tessellation.

## Screen grade (post-process)

`render/post.js` (`PostFX`, settings `rendering.json` → `post`, on per preset with `quality.<name>.post`, off on `low`) draws the scene into a 4x multisampled sRGB target, makes a quarter-size bright pass for a soft glow, then one full-screen composite: glow, display-space saturation and contrast, split toning (cool `shadowTint`, warm `lightTint`; 50% grey is neutral), a haze toward the top of the screen in the zone's fog colour lifted by `hazeLift`, a warm screen-blend sun wash centred at `sunWashPos` (screen UV, top-left, the sun's side), a vignette and a 1/255 dither. Models and materials are unchanged; `?post=0` turns it off for comparisons. In Godot, use a `WorldEnvironment` (glow with the same threshold, adjustments for contrast/saturation) plus a screen-space `ColorRect` shader for the toning, haze, sun wash and vignette.

## Local city cohesion presentation

The local city review uses original native timber for all city piers, with `city-v3.docks[].shoreCut` giving the two landward cut coordinates in pier-local Z. Clip the same deck assembly to that shore segment and keep its posts waterward; never overlay separate crossbridges. Walking support across a flush edge is the union of the adjacent deck and stone: `dockAt` may select a deck touching an actor's radius even after its centre reaches the shore, then checks all sixteen boundary samples. Point-height queries still select only the surface under the centre. `boatBerths`/`propOffsets` describe render placements, not new game systems; `materialColors` (by source material name, e.g. indigo timber → wood) and `meshColors` (by part name, e.g. the ship's teal stringers) recolour imported city art and dressing at load. Imported city meshes with open edges (awnings, canvas, roof skins) render double-sided; closed solids stay front-faced. Source `Coastal weathered rock` nodes are kept only when they stand in the game sea at least 3 m clear of the city floor, so none poke through paving or sit against the quay. Paving/soil masks, black building contours and fountain flow/ripples/splash are presentation only; use baked masks, static merged buffers and shared shader time in Godot. Keep EXP/Job, saves, NPC anchors, approved building/street layout and native coastline unchanged.

## Reviewed directed journal graph

`jobtree.presentation.stages/groups` indexes the shared first page and free later gateways. New skill `requires` lists are ALL-parent directed prerequisites in `Character.gd`; legacy nodes keep adjacency and profession rules. Keep the existing tree revision and ownership IDs when adding this graph so old saves retain points, bonuses and choices. Layout, paper motion and success-only dashed ink are presentation; they never allocate points. See `REVIEWED-SKILL-TREE.md`.

`core/job-route.js` adds a read-only route plan and atomic `allocateJobRoute` transaction. In Godot, collect ALL missing named ancestors only inside the selected presentation group and stage; require outside ancestors to be owned already. Run canonical `allocateJobNode` on a scratch ownership/points dictionary, reject gates, invalid or ambiguous graphs, insufficient points and stale preview signatures, then commit ownership and points together. Notify/persist once after success. Current costs remain one point per node and saves retain version4; no rank or reward model is added. The journal previews pending nodes with solid outlines and draws finite dashed ink only for confirmed acquisitions.

Cape integration: `city.capeTransition` grades only dry exterior source-floor edges to the existing heightfield via `cityFloorHeight`; native-water causeways and interior city heights stay authored. The renderer subdivides only cape surface triangles at load and uses this same height function. A narrow data road joins the existing cape dirt path. Native cape cobble paint is removed locally and sea film stays below raised source land; native coast/heightfield data are unchanged.

Local boundary repair: `city.propertyBoundary` clips the mainland top and streets
to the source limestone-wall endpoints while retaining coastal quay contours and
the small unfenced harbor-entry apron. Use the same `city.floors` polygon for
walk support, terrain coverage, retaining faces and map clipping. Preserve fully
contained source triangles and cape triangulation; do not retessellate every
street against the entire land mesh. `previousPaving` is only a stable cosmetic
planting exclusion, so clipping the slab cannot reshuffle the existing seeded
map plants. Newly exposed lawns use their own cosmetic seed. The five documented
`treeRelocations` retain tree IDs, species, scale and full planter/canopy clearance.

`city.outsideClearings` is a local ground-art review connecting existing meadow,
forest and headland destinations, with irregular earth
regions, soft worn edges and retained vegetation holes. Bake
`outsideClearingWeight` into both terrain splats and the map; it changes no
heightfield, water, safety routes, encounter spawn or POI data.
`outsideRoadReview.replacedRoadIds` retires obsolete exterior road paint only;
retain the original simulation roads for terrain grading and placement RNG.
The painter and map use `outsideRoadDistance` for retained arrival/cape paths,
then blend the clearing regions. Preserve every recorded native tree island.
Grass rendering compacts each existing chunk to conservative camera-visible
clump spheres (including maximum wind). Keep immutable instance/colour inputs,
reuse buffers without per-frame allocations and retain the full chunk bounds.
Update visibility after camera/world transforms and before render-list attribute
uploads (the scene pre-render hook), so camera moves use current matrices/colours
in their first frame. Do not compact from an individual mesh's draw callback.
Index the same 30 blade triangles using 42 distinct position/gradient vertices
instead of 90; lighting still uses the unchanged sampled terrain normal.
Road paint is affine in its centre tone: combine bare-earth/road layer weights
first and evaluate their identical procedural spatial detail only once. Preserve
the original final colour; no paint texture, light or ground height is changed.
Evaluate the four value-noise corner hashes as a vec4 with the original
operation order and interpolation. Preserve scalar/vector float equality and
actual-game pixel equality; do not approximate noise or alter its constants.

Connected fountain water: three fixed subdivided pool disks deform in the vertex shader with matching normals and advected surface shading. Broad overflow sheets cross both stone tier lips and descend into the next pool. Nine jet/crown curves and ten lip/curtain sections merge into one geometry; 57 splash points and 19 instanced foam patches share render time. CPU buffers and matrices are fixed at load; no new gameplay or fluid solver.

Local quay/dressing review: rebuild exposed outer and bay retaining faces from the
existing first two `city.floors` polygons, including holes, at `cityFloorHeight`.
Face normals point away from supported land; render both sides and extend bottoms
below the native height/water. Split other-floor intersections, omit hidden lower
walls and make higher internal edges short risers. The narrow inset top transition
uses upward normals. Native terrain indices, foam, roads and dock support stay intact.
The original imported inland-facing cliff is suppressed at render load only.

`city.dressing` records individual placement-ready GLB identities and deterministic
world-X/Z placements with metre scale, angle and optional supported `lift/stackOn`.
Use the same solid oriented boxes from `dressing.colliders` in world collision;
stacked upper copies reuse their lower footprint. Roads, all existing entry/NPC
routes, warp, spawn, fountain and pier landings are reserved. Load each type once,
apply the existing toon contours and merge static scenery by material and 24 m
cell. Props add no service, save, progression, light or per-frame callback.

## Linked Greenhollow Frontier map

The original demo map (`data/maps/frontier-wilds.json`, id `frontier-wilds-v1`, mirrored
east-west so its safe outpost meets the border and the final boss is ~400 m away; a
town fence may stand on `walls.west`) lies west of Azure in one world: `atlas.offset` places each map (global = local + offset)
and `atlas.seams` lists the edges two maps share (edge, span in local metres, the
border-road `gate`, blend `band`, a `quiet` band where no monster spawns (the border is a calm crossing, so no monster needs simulating on both sides) and the common height `profile` written by
`scripts/atlas-seams.mjs`). Past an open seam there is no mountain wall or edge
forest; within the band the heightfield blends to the profile so both sides meet
at the same ground. Walking on against a seam (`world.seamAt`) calls
`Game.crossSeam()`, which maps the point to the neighbour's coordinates just inside
its edge. Every map's rules/collision world is built at boot; the renderer streams
the neighbouring map's scene (`render/region.js`: terrain, scenery, water, kits,
town NPCs) a few milliseconds per frame once the player is within 140 m of a seam,
places it at the atlas delta and drops it past 200 m. Imported kits (city, harbour,
town kit) load after placement and arrive frozen; give them the region's transform when
they are attached (in Godot, add them under the region's root node). If it is ready when the player
crosses, `Game.enterWorld()` carries the same session on (monsters of the new map,
discovery swapped, data.world selected) and `View.switchRegion()` makes it the scene
origin; otherwise the page reloads into the new map (also `?stream=0`). World-space
ground/water shaders subtract their region's shift (`render/region-shift.js`) to
sample their own baked fields, and procedural paint, clouds and meadow density use
world metres (`uNoiseOffset` = atlas offset) so patterns run on across the seam; the
seam profile also carries a shared ground tint and fades map-local soil patches. In
Godot: one scene per map placed at its offset, loaded with `ResourceLoader` threads
near a seam, freed when far; the same seam data applies. The coastlines meet at the same world line. It keeps
its zone ids, both bosses and the old quest chain (`f_road` → `m_warden` after `h_lighthouse`). Tree density is
thinned to Azure's level so the map costs no more to draw. Its outpost
buildings/stalls carry a `kit` node name: draw that node from the approved city
kit file (`town.kit.nodes`), reset its city placement, centre it on the data box
and keep the box as the collider; `town.kit.materialColors` uses the same palette
as the city. Saves were `version: 5` here (adds `progress.maps`); v6 adds hands, gloves and arrows (see above).

### Dedicated upgrade materials (local implementation, 2026-10-05)

`items.upgrade.cost` prices +1..+5 with `enhancement_stone` (1/2/3/4/6) and
unchanged gold. `progression.skillUpgrade.steps` uses `skill_crystal` (1/2/3/4),
and `modUpgrade.cost` uses the same crystal (2/3). Never interpret these as Grade;
existing grade-promotion costs and base crafting recipes remain unchanged.
`rollDrops` appends `items.upgradeMaterialDrops` to monster/zone drops, with the
same seeded RNG and material-find multiplier (3% stone, 2% crystal, quantity 1).
Minions still award gold only. Gear salvage creates no base stones/crystals at any grade, keeps existing recipe-part
refunds and returns floor(50% of the total enhancement stone investment), e.g. +5
uses 16 and refunds 8. Legacy +N items receive
the same current-cost refund; no historical payment ledger is introduced.
The existing sparse `character.materials` dictionary already persists both IDs;
no schema/version change or conversion of old parts is needed. Missing keys are zero.
The two RGBA PNGs are mapped in `raster-icons.js` for inventory/costs and ground loot.

### Independent skill-line display hubs

`ui/skill-journal/line-groups.js` splits each family into its existing named lines for
presentation only. Chapters 2–5 have 11/12/9/9 overview hubs; chapter 5's nine line
hubs each open their regular and mastery pages. Keep `jobtree.presentation.stages[].paths`
as the canonical purchase scopes: a display ID such as `view.physical.3` resolves to
`fam.weapon.3` for its line nodes. Resolve bridge proxies to the bridge's original
scope even when inspecting them from the other line. Do not restrict route planning
to visible nodes; previews list every charged node, including other lines. Preserve
ALL `requires`, ANY `requiresAny`, links, chapter gates, point costs and saved node IDs.
The 30 bridge nodes appear on both endpoint pages but are owned/charged only once.
Search, prerequisite navigation and chapter navigation use display groups without
rewriting game data. Captions and touch targets set a readable minimum camera zoom;
long forks/mastery pages pan vertically instead of squeezing three lines together.



### Skill and mod upgrade services (2026-10-06)

`Game.nearby().skillUpgrade` accepts the current map's workbench, trainer and
optional additional `town.skillUpgradeStations` coordinates, within the same
interaction radius. Azure's extra station is the actual `AC_Craft_Workshop_050`
entrance from the approved city entries, not a decorative work table. It does
not accept the town or safe zone as a whole. Growth cards, buttons and both
action handlers use this service predicate; blocked cards show the location
reason beside the button. Stat/material/gold requirements are unchanged.
Equipment enhancement/promotion and crafting still use the original workbench
gate. Port the service anchors and `tests/core/upgrade-services.test.js`.


### Skill/mod expansion (character v13; preserves prototype v9)

Data defines 28 combat skills (14 new prototypes), four movement skills and 34 mods
(19 new). `prototype:true` selects the authoring/Lab preview path, not an acquisition gate.
All 14/19 have normal workbench recipes using existing materials, including Moonroot.
See `FRONTIER-ACQUISITION.md` for costs and compatibility. Normal starters remain basic-only.
Character v13 adds the movement socket to v12 saves while retaining v9 sockets and UIDs;
main’s autoPotion migration/settings and equipment inactivity rules are unchanged.
Only `?fresh=1&skillSandbox=1` grants trial ownership in a character with no save slot.
Skill Lab replays old effects and uses `lab/rules-preview.js` for the new skills.

Port `core/frontier-content.js` alongside `skills.js` and the Game hooks:

- `charging` is transient. Hold advances to a capped ratio; cancel, death, movement,
  refresh or input loss discards it. Release rechecks weapon/stats, MP and arrows,
  pays once, then launches after the authored contact time. Movement slows while held.
- `channeling` pays initial MP once and per tick after wind-up. Release, knockback,
  movement, death, refresh or insufficient MP ends it and starts its cooldown.
- `counter_stance` accepts one frontal direct hit in a short window; the next press
  spends no extra MP and bypasses only its own cooldown once. Rear/DoT hits do not parry.
- `melee_line` tests forward projection and half width plus target radius; live aim
  during preparation. Positional hits, non-stacking exposure and explicitly permitted
  interruption remain independent. Boss poise expires and never overrides immunity.
- Rain pays all three arrows once and schedules three separate delayed areas. Walls
  require free placement/endpoints, have three destructible segments and finite life.
  Walkers use swept XZ rectangles; flyers pass. Chasing monsters break nearby segments
  after a visible wind-up interval; other authored attack patterns remain intact.
- Target healing chooses the most injured eligible living unit, cleanses one allowed
  status, chains to unvisited injured units, and converts a fraction to a capped,
  non-stacking barrier. Auras reserve maximum available MP and stop when unslotted,
  their requirements fail, or their providing mod is removed. Current summons have
  no MP, so Battle Aura's MP regen currently applies only to the player.
- Returning projectiles reset their per-leg hit set once, reverse toward their stored
  origin and cannot loop. Terminal bursts fire at final expiry, including after return.
  Secondary bursts never apply mod effects recursively. Bleed ticks do not crit or
  trigger. Chill/burn consumption happens once; curse spread preserves remaining time.
- Following fields stay one per slot, and sustained slow has an authored cap. Summons
  support attack/follow/guard commands; explicit attack overrides automatic focus.
  Guard sharing selects one living summon in range, so multiple summons do not multiply
  the reduction. Barrier destruction procs once. Guard triggers pay resources, check
  active gear/requirements and use their own cooldown; nested triggers are suppressed.

`movementMods: UID[]` is the only new persistent field. v8 -> v9 initializes it empty,
keeps inventory, rolls and combat sockets, removes invalid/duplicate UIDs and respects
one movement socket. A coin never occupies combat and movement simultaneously. Inactive
movement mods stay stored; trained stats reactivate them. `short_stride` halves all
four movement distances and adds one max charge without altering duration, recharge,
invulnerability or landing damage. Its maximum rank is 1. Existing slot envelope is 2.

UI uses hold/release and drag-aim on independent pointers, with menu/blur/cancel cleanup.
`render/frontier-fx.js` owns original interim line, wall, aura, healing and flame visuals;
shared geometry belongs to the view, per-effect materials/geometry are disposed on clear.
Stone Guardian reuses `crag_golem` as an interim silhouette. Numbers, compatibility
kinds, symmetric conflicts, conversion dependencies and visual tuning live in data.
Before porting, run `tests/core/frontier-content.test.js` and the focused touch capture
`tests/browser/frontier-content.mjs`. See `FRONTIER-CONTENT.md` and the review record.
### The opening and completion receipts (save v11)

`createCharacter(data, { opening: true })` wakes unarmed with empty skills and slots.
`wakeOpening` advances `wake` → `weapon`; `completeOpening(ch, data, { kit })`
equips the chosen weapon and teaches only its normal attack (`slash`, `hunter_shot`,
`arcane_bolt`). There is no skill or movement selection. Direct creation (including
`?fresh=1`) also starts with only that weapon's basic attack. Movement remains
unowned, its HUD slot empty and charge limit zero, until acquired later. Firebolt
and Ward still come from shore quests or crafting; quest skills compile immediately.
No combat/movement numbers or later recipes change.

v11 migration preserves existing skills, ranks, slots, movement ownership and
movement-mod fields. It never fills missing ownership with a legacy starter kit,
Hunter Shot or Dash. An interrupted v10 `skills` screen returns to `weapon` with
its weapon selection remembered; unapplied starter picks grant nothing. Already
completed openings keep every learned skill. The wreck and lying/standing presentation
remain owned by Azure's existing region root.

The quest journal is version 2 with `completions: []`. The core marks a quest's
`rewardClaimed` before payment and reentrant level-up callbacks, pays once, and
records an immutable receipt before callbacks: quest name/description/objectives,
actual gold/items, newly learned skills (no duplicate grants), and actual base/job
EXP credited up to the caps. `questDone` carries that received reward. A v1 paid
quest gets no invented receipt or new payment. Unpaid v1 rewards retain their guard
and may pay once; malformed/duplicate presentation receipts are discarded.

`ui/quest-completion.js` reads the first receipt in a native modal dialog. It pauses
simulation/input, queues all receipts, and only calls `dismissQuestCompletion` plus
the ordinary save callback. Dismissal cannot pay a reward. Escape and the touch
button dismiss one receipt; failed persistence restores it. Unseen receipts survive
Continue/export/import; acknowledged receipts stay dismissed. Port as a modal Control
reading the same paid queue, with a separate dismiss/save action.

The HUD tracker sits below the player frame in the left column. Its scroll budget
reserves mobile safe insets and the movement area. Tapping it (or Enter/Space on its
button) toggles a subtle dashed ground route; the journal stays available through the
main menu/L. `core/quest-route.js` uses bounded A* with the existing `World.isFree`
and sampled `World.move` checks for radius, water, obstacles and slopes. It never
falls back to drawing through a wall. Occupied interactable anchors get a nearby
walkable approach. Remote goals use `questNavigation`'s actual authored crossing,
then replan on map handover. Nonspatial tasks show their instruction without a line.
The route clears when tracking changes/completes. Cached search and ribbon work
advance cooperatively; target changes or leaving the safe cached route trigger
a bounded refresh. A static tail and short dynamic near ribbon each own their
geometry/material; hide, handover, travel or page disposal releases both with
`disposeObject`. The near endpoint follows the hero every rendered frame. Port as a navigation aid mesh with
the same clearance and goal contracts, never auto-walk.


### Cached route, supplies and automatic potions (save v12)

Quest navigation still resolves the actual active objective/gate. `searchQuestRoute`
is a cooperative pure generator with directed walking-clearance edge caches;
`findQuestRoute` retains the blocking contract. The presentation advances search
and terrain ribbon assembly in small task/frame slices, caches at most four CPU paths and
disposes both owned GPU ribbons on hide, replacement, completion and map change.
Each rendered frame projects the hero onto the safe cached polyline and redraws
only its short near section. An obstructed/off-route connection hides the line
and requests a bounded replan; it never draws a shortcut through an obstacle.
Godot should mirror the cached path plus near ribbon in its process loop.

The bow HUD reads the same `arrowInUse`/`arrowTotal` as shooting, including fallback
stock and zero arrows. Its labeled crafting action opens the existing arrow
category and relevant recipe; it grants nothing and retains `Game.craftArrows`
costs, capacity and combat restrictions.

`ch.autoPotions` stores separate `hp` and `mp` objects with `enabled`, integer
`threshold` (1–100 percent) and `potion` (matching item ID or null). New characters
and pre-v12 migration default both OFF, preserving inventory and learned skills.
V12 reload preserves intentional choices. Default thresholds live in
`items.consumables.autoUse`. Null selects the first stocked matching quick slot
from left to right; an explicit size uses that inventory item with no substitution.
`Game.useAutomaticPotions` runs at the end of an eligible positive-dt simulation
frame, at most once per group/frame, when resource percent is at/below threshold
and below full. It shares `useConsumable` with manual use, real stock, restore
amount and group cooldown. Paused/menu/receipt/fullscreen frames do not advance
simulation; dead/travel/zero-dt/prohibited frames do not consume. Empty stock
produces no failure notifications. Successful potion events save the real spend.
The existing shop page owns separate touch controls for both rules; its shopping
location restrictions remain intact. No free items or changed potion balance.

### Moonroot Grove (third linked map, levels 6-10)

`data/maps/moonroot-grove.json` (id `moonroot-grove-v1`) fills the strip north of Azure Coast and
east of the Frontier's north: global x -160..210, z -237..-120 (`atlas.offset` [25, -178.5]). Seams:
its `minX` meets the Frontier's `maxX` over Frontier local z -144..-27 (a second seam on that edge),
its `maxZ` meets Azure's `minZ` over the whole Azure width. Profiles were written with
`node scripts/atlas-seams.mjs --missing`, which fills only seams whose profile is empty and leaves the
rest of each file byte-identical. Region ownership (`render/region-ownership.js`) is per seam plane,
so the three maps partition the corner at global (-160, -120). The grove's trails reach both gates;
the Azure/Frontier sides stay open grass (no layout change there).

Layout data used here: `ruins.zone` (the zone strewn with fallen stones, default `ruins`),
`ruins.scatter` (tries, default 90), `ruins.paving: false` (a grassy ring, no paved floor);
`town.trees` for the elder tree in the ring; `town.surfaces` with a `dirt` polygon so the camp has no
cobbled plaza. Monsters: `fern_ear_hare` (behaviour `hare`), `mirrorwing_moth` (`moth`, flyer),
`rootdigger_mole` (`mole`), procedural rigs in `render/monsters-grove.js`.

Attacks may borrow another attack's mechanics with `attacks.<name>.kind` (e.g. the hare's `kick` is a
planted `claw` strike, its `hop` a marked `pounce`; the moth's `glint` is a `beam`, its `scale_dust`
a `puff` whose cloud is `areaKind: 'mirror_dust'`; the mole's `swipe` is a `sweep`). Names stay
their own for cooldowns, telegraph lookups and looks. New mechanic `erupt` (mole): an `erupt` area is
marked at the target for the whole wind-up; the mole sinks (render) and surfaces at that spot as it
bursts (`surface` event); it never digs into a safe zone. In Godot: the same state machine, a dig/emerge
`AnimationPlayer` clip and a teleport at the burst.

Art: `scripts/split-moonroot-art.py` cuts the owner's concept sheets (`assets/moonroot/*.jpg`) into
atlas portraits (`public/assets/icons/monster|region/...`, registered in `raster-icons.js` and the
atlas manifests) and item pictures (`public/assets/moonroot/...`) drawn inside the authored SVG frame
(`ui/art.js`), with every crop and hash in `assets/moonroot/manifest.json`.
