# Porting to Godot 4

The web demo is built so a Godot version can reuse its **data, rules and layout**. Only the
rendering and UI must be rebuilt in Godot. This file maps each piece.

## What carries over unchanged

The browser now runs `core/open-world-game.js` over `core/unified-world.js`:
one fixed coordinate system rooted at the starting region's `atlas.offset`, one
persistent actor population, and collision against the union of the authored
regions. Native `createWorld` layouts remain immutable sources for terrain,
colliders and content. `scenePoint`, `localPoint` and `worldPoint` convert only
at content/save/UI boundaries. Walking, dashing, summons and projectiles cross
the old regional edges without a scene change, readiness gate, combat refusal,
actor replacement or camera-coordinate shift. Regional discovery and quest
addresses remain scoped; `worldChanged` changes metadata with `shift: [0, 0]`.
Save v13 remains region-local (`worldId`, `pos`) so existing slots keep their
inventory, discovery and location without a new save migration. Monster and
loot origin tags select the correct regional drop table and quest credit even
after crossing. Idle AI uses `progression.openWorldSimulation.idleRadius`;
aggro actors continue their real fight beyond that envelope.
Collision candidates cover every grid cell touched by the actor radius, and
water clearance checks every regional rectangle touched by the native movement
footprint. Zone, bridge and dock query results use fixed world coordinates;
native source objects remain available through `regionWorld`/`worlds`.
Only zone/waypoint discovery is archived per region. Save v13 `kills`,
`collected` and `bossKills` remain global lifetime totals; individually scoped
quest objectives receive the monster/drop's source region instead.

In Godot, mirror this as one persistent world node and spatially culled content
chunks. Do not use `change_scene_to_file()` or clear combat state on an authored
regional boundary. The old linked-map contracts below remain the native content
and legacy `Game` reference; `OpenWorldGame` is the live browser simulation.

| Web demo | Godot | How |
|---|---|---|
| `data/*.json` | `res://data/*.json` | Copy the files. Load with `JSON.parse_string(FileAccess.get_file_as_string(path))`. Field names stay the same. |
| `data/generated/layout.json` (`npm run export:layout`) | Map scene builder | Instance trees, rocks, pillars, houses and fences at the listed positions. Colliders are listed as circles (`x, z, r`) and oriented boxes (`x, z, hx, hz, angle`). Also zones, waypoints, bridges, harbor docks and safeRoutes. |
| `data/generated/heightmap.json` | `HeightMapShape3D` + terrain mesh | Heights on a 1 m grid. Walkability: uphill steps steeper than `terrain.maxWalkSlope` (`world.json`) are blocked, drops are allowed. |
| Axes and units | Same | Both use Y up and metres. A facing angle `a` points along `(sin a, 0, cos a)`, which is `rotation.y = a` in both engines. |
| Save data (`character` object) | `Dictionary` or `Resource` | The same JSON shape (`version: 18`, with `name`, `appearance` (its `hairStyle` and `face` from `network/protocol.js` `HAIR_STYLES` and `FACES`, its `hair` any hex colour; v15 gives an older look the painted `face: "default"`; v16 adds `skillGrowth`, skill id → `{ grade, bars, earned, prof }`, empty for an older hero; v17 adds `skillExp`, skill id → EXP fed toward the next level, and turns each old skill rank 1-5 into the level 1/4/10/17/24, kept even above the character's level; v18 adds `freeStatRespec`, true once for a hero who had trained stats when requirements moved to the stat wheel, making one `respecStats` free), `kit`, `progress`, region-local `worldId`/`pos`). `migrateCharacter()` upgrades older versions and relocates characters once when `worldId` or `worldLayoutRevision` changes; levels, equipment and completed quest history are retained. Slots and export codes are in `src/save.js`. |

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
| `character.js` | Autoload `Character.gd` | Stats, levels, Job Tree, respec, gear stats and `derive()`. Raw numbers (HP, MP, attack, magic, defense, damage, heals, barriers, costs, potions) were multiplied by 10 on 2026-10-25 with percentages unchanged; armour is `defenseFactor()` = 1 - defense / (defense + `progression.combat.defenseConstant`, 600); save v14 moves older gear's flat option rolls (still below today's minimum) to the new scale. Six stats (`STATS`): STR, AGI, VIT, INT, DEX, LUK; `progression.character.perStat` gives each its derived stats (STR attack, a third of VIT's HP and a little melee damage; DEX crit damage `critMultPct`, LUK crit chance `critChancePct`, a lucky dodge `dodgeChancePct` (capped; a monster hit misses entirely, never damage over time, rolled on `Game.luckRng`, its own seeded stream) and a small gear/material find); crit chance has no cap: past 100% each point adds `critOverflowToMultPct` (0.5) to crit damage, outside its soft cap and cap (`critOverflowPct`); a save without LUK takes the starting value. Spell shield (`maxShield`, INT `perStat` 8 per point plus gear options `shield_flat`/`shield_pct`, `maxShieldPct` soft-capped) is a pool over HP: `Game.damagePlayer` takes a hit through armour, block and a skill barrier, then `drainShield()` (poison ticks too), then HP; it never heals, and `updatePlayer` refills `progression.combat.spellShield.rechargePctPerSecond` of the maximum each second once `shieldIdle` reaches `rechargeDelay` (3 s) without damage. Full on spawn, respawn and level up; a newly gained shield starts empty. Events: `playerHit.shielded`, `shieldBreak`. `power.js effectiveHp` and `balance.js` count HP + shield. `movementRanks` holds movement skill ranks above 1 (upgrades with the skill's main `upgradeStat`: `crafting.js upgradeMovement`, `progression.movementUpgrade`; `skills.js movementSkill` shortens the recharge and lengthens the move per rank; the recharge also divides by 1 + speed/100). Speed (`hastePct`, 2026-10-27): one stat for cast time and every cooldown, soft-capped like damage % and capped at 200; base cooldowns, recharges and per-cast damage/heal/barrier/MP cost were multiplied by 1.6 so the fastest tempo at the cap matches the old one. Sources: AGI 0.6 per point, gear (old cooldown values x3, the `cdr_pct` option 6-15), the Job Tree (old cast speed x1, old cooldown x4/3; the speed line x2 so a pure speed line gains about what the damage line does, `balance-model.test`). Buff, barrier and zone durations stay at most 0.9 of their fastest cooldown at the cap (`speed.test`). |
| `skills.js` | `SkillCompiler.gd` | `computeSkill()` returns a flat Dictionary. Keep tag-based `modFits(skill, mod, companions)` and inactive-mod reasons; see compatibility notes below. A skill may repeat on its own (`repeats`/`repeatMult`/`repeatDelay` in data: Cross Cut, Blade Storm, Rapid Volley; a projectile repeat fires along the current facing without a new cast or arrow), and a repeat mod adds to it. Buff skills keep one entry per skill in `buffs[skillId]` (`damage`, `speed`, `taken` = `takenMult` scaled by level, floor 0.5, a price above 1 (Berserk's) kept as is, `steady` = no knockback, `rage` = Boiling Blood's bonus damage that grows as the hero's HP falls (`playerDamageMult`: rage.max x the HP lost over 1 - rage.atHp, capped), `leech`/`mpHit` = Fighting Spirit's HP (% of each hit's damage) and MP back per hit, for the hero and, HP only, an ally that hits; a buff with `taunt` (Provoke) turns every monster within taunt.radius on the hero for taunt.duration, like a taunting hit): different buffs stack, the same one refreshes; `Game` sums damage/speed and multiplies `taken` for the hero (`damagePlayer`) and allies (`damageAlly`). Job skills carry a `job` id (for the planned job lock, docs/SKILL-TREE-WHEEL-DRAFT-TH.md) and `iconPending: true` until their picture is supplied (`ui/pending-art.js` draws a labelled stand-in; docs/SKILL-ICONS-PENDING-TH.md). |
| `crafting.js` | `Crafting.gd` | Recipes, grade roll, upgrades, drops. |
| `quests.js` | `Quests.gd` | Journal state lives in `character.progress.quests`. Feed it the same events (kill, collect, craft). |
| `terrain.js` | Import step only | Builds the heightfield; Godot can load `heightmap.json` instead. |
| `targeting.js` | `SoftTarget.gd` | Pure rules. Automatic attack acquisition is nearest in actual skill range; explicit pointer/drag aim stays directional. Call soft acquisition every physics frame and re-evaluate nearest on quick cast. |
| `ai.js` | Per-monster state machine on a `CharacterBody3D` | States: `idle, chase, windup, act, recover, retreat, emerge, stunned, shell, return, circle`. Keep the wind-up tell before every attack. A hidden hero (`player.stealthT > 0`) is not a target: chasers lose it and leash home, idle ones never notice it, a taunt on it lapses. |
| `rogue.js` | `Rogue.gd` | The blade job's trickery (2026-10-30). Stealth (kind `stealth`): `hide(g, t)` sets `player.stealthT`; `Game.hitMonster` makes the hero's first non-DoT hit out of hiding a sure critical and `reveal`s it, a blow taken (`damagePlayer`, damage > 0) reveals it, `tickRogue` runs it out (events `stealth` on/off with `why`). Decoy (kind `decoy`): a `{id, x, z, facing, t}` in `game.decoys` (cosmetic, never a unit or a target) plus `hide(g, s.stealth)`; events `decoy`/`decoyEnd`. Steal (kind `steal`): the nearest monster within range and `steal.arc` in front takes a light hit; once per monster (`m.stolen`; minions give nothing) gold `(steal.gold + steal.goldPerLevel x level) x 0.8..1.2` and, at `itemChance` (`bossItemChance`), one of its own non-gold drop items, both dropped at the hero's feet as ordinary pickups (`drop` events from the monster); `stealResult` says what. In the view the hidden hero's body is hidden and SkillFx draws a see-through copy re-posed each frame (`render/hero-copy.js`, SkeletonUtils clone with `cloakMaterial`: a Lambert material whose fragment is replaced by a near-clear body, a bright fresnel rim and light bands running over it like heat haze), nothing round it (owner: no shield-like shell, and not a flat purple body); a Decoy is a copy of the rig with its own materials held in the pose it was left; Steal is a violet swipe and gold motes. The hero plays the clip actions `rgStealth`, `rgSteal` and `rgDecoy` (`data/action-clips.json`). |
| `game.js` | Player, Projectile, Area and Drop scenes + a `World` node | See the node mapping below. |
| `maps.js`, `open-world-game.js`, `unified-world.js` | `Maps.gd` metadata registry + persistent world | `data.maps` registers content regions by id. `enterMap()` stores regional discovery under `progress.maps[id]` and restores the destination's (plus its free stones). `OpenWorldGame.activateRegion()` changes this metadata while one fixed world and every resident actor remain alive. Point exits and waypoint teleportation reposition within that world. Quests and loot retain their source `worldId`; no regional crossing changes scenes. The web build has a development load (`?load=dev`, CI browser tests) that prepares only the start map's scene; the game itself prepares every map before play, and a port should do the same (a development shortcut is optional). |
| `atlas.js` | `WorldAtlas.gd` | One world for the player: `toWorld`/`toLocal` (local + atlas.offset), discovery per map (`progress.maps`) read as one world (`worldTotals`), and stones on any map (`Game.teleportTo(id, mapId)` travels there). The minimap and world map draw every map's image at its offset (`ui/mapimage.js worldMapImage`); zone/stone selections are `mapId:id`. |
| `world.js` | World queries / collision setup | Use `layout.json` + `heightmap.json` plus Godot collision shapes. `isWater()` is a visual/spawn mask; `blocksWater()` is the movement mask. The shallow river is walkable when `river.walkable` is true. Only deep ponds/sea block movement; bridges and docks provide walking surfaces. Dock clearance checks the actor footprint across the union of adjoining decks and dry shore; outer sea edges still block. `groundY()` interpolates from `startY` to `height` using dock-local Z after rotation. The render mesh shears in local Z so its XZ footprint matches collision exactly. Safe starting roads use distance to the `safeRoutes` polylines. |

### `game.js` → scenes

- `player` → `Player.tscn` (`CharacterBody3D`). `useMovement()` becomes a dash tween with an invulnerability flag. Skills run through `executeSkill()`.
- `projectiles[]` → `Projectile.tscn` (`Area3D`, moved in `_physics_process`). It carries the `pierce`, `chain` and `ground` fields from the computed skill.
- `areas[]` → `GroundArea.tscn` (`Area3D` with a delay, tick and duration). Used for stone burst, healing spring, boss slam and shockwave. No mod leaves a field on the ground (Burning Ground was retired as `fire_shift`).
- `drops[]` → `Loot.tscn` with magnet pickup.
- `allies[]` → `Summon.tscn` (spirit wolves): the same chase/bite loop as monsters, on the player's team. Monsters pick targets with `pickTarget()` in `ai.js`.
- `events[]` → Godot **signals** (`hit`, `death`, `drop`, `levelup`, ...). The renderer and HUD here only react to events, so the same split works as signal listeners.

## What gets rebuilt (presentation)

High-quality performance keeps the authored graphics settings. Grass uses a
conservative whole-chunk wind envelope before the existing clump tests, retaining
all visible instances and baked colours. Pooled particles upload only their live
prefix (no uploads when empty), including all spawn/swap changes before a draw.
Camera and cloth use reusable scratch vectors with unchanged animation math.
Godot equivalents: conservative MultiMesh chunk rejection, live-prefix buffer
updates and reusable simulation state; do not substitute reduced visual density.

The web HUD portrait is asynchronous: prepare shaders then queue a GPU pixel
readback, restore the borrowed render target **before** awaiting, retain owned
resources until completion and discard stale gear/model results. Only one request
is in flight per session. Port to a SubViewport/readback without blocking the main
frame, keeping cleanup on failure and the same 128 px image/row orientation.

The grass colour bake (`bakeGrassSteps`) also reads back asynchronously while a
region streams in. A slow fence is renewed once after 250 ms (or half the configured
bound), over the same submitted pixel buffer; successful colour output is unchanged.
If it has not settled after `readbackTimeoutMs` (default 5000), that bake frees its
GPU owners without a synchronous read. The region completes with valid terrain
and scenery, hiding unfinished grass. A nearby neighbour gets one fresh build
attempt after a 1000 ms backoff, retaining the completed scene during replacement.
Persistent failure leaves that scene visible with `grassReady: false`; leaving
the retained area resets the retry limit. Successful builds retain all grass.

Streamed construction uses the existing six-ms task slices. Completed terrain is
shader-prepared and shown through a clone borrowing its owner's buffers, while
the owner remains map-local for grass baking. The preview cannot enable crossing:
`neighbourReady()` still requires the completed region's `staticReady`. Eviction
detaches the preview immediately and frees the owner after its bounded GPU wait.
In Godot, preserve the same budget, readiness, bounded readback and ownership rules.

| Web | Godot |
|---|---|
| `render/toon.js` (3-step ramp and inverted-hull outline) | `ShaderMaterial` with a toon ramp, plus a second pass with `cull_front` and a vertex push for the outline |
| `render/ground.js`, `ground-color.js`, `ground-field.js`, `ground-brush.js`, `meadow.js`, `walk-surface.js` | Terrain shader/splat attributes, shared metre-based pigments in `art.ground.palette`, continuous meadow field for both ground paint and construction-only instanced grass density. Grass roots sample the terrain triangle; mask planted blades/flowers off paving, dirt roads, mud, beach, decks and colliders, including safe town lawns. Walking slab shaders use deck-local axes on rotated/sheared ramps. Timber decks are one merged mesh of separate boards on the painted 0.32 m plank pitch (seeded per dock: ragged ends, small gaps/twist/lift, two stringers) and piles lean slightly with extra pairs on long decks (`art.architecture.pier`); collision still uses the authored dock boxes. Grass blades take the ground colour at the root and the meadow `lawnTone` above it. Road, bare-soil and paving borders are noise-wobbled in the shader (`art.ground.road*`, `pavingEdgeWobble`). Paving drops a few slabs to earth and sinks a few (`pavingMissing`, `pavingSunken`). `surfaceData()` also returns a blurred `town` mask from `art.ground.townZones` (terrain attribute `aTown`, grass `aGrassTown`, last `groundColor` argument): inside it random dirt/meadow-soil noise is off, lawns are an even mown green, lane edges wander less and paving courts end in a kerb band (`townKerb`). The lighthouse (`art.architecture.lighthouse`: height, bands, base/top/lantern radii) is a banded tapered shaft on a rough stone footing with human-scale door and windows, corbelled gallery and railing, glazed lantern and domed cap, inside its collider circle `harbor.lighthouseRadius` (world.js, default 2). Coconut palms come from their own seeded pass (`world.js`, rng 4421): dart-thrown centres at least `sea.palmGroupSpacing` m apart on beach/rock coasts in zones whose `trees` list `palm`, from `sea.palmMinBack` m behind the dry-sand line (`sea.beach`, never on open sand) to `sea.palmBelt` m behind it; each is a single palm or, with `sea.palmPairChance`, a pair at least `sea.palmGap` m apart, every trunk leaning seaward (coast-distance gradient ±0.45, splayed from the group centre). Frond cards are anime-style: one solid leaf mass per frond (narrow at the stalk, widest about three quarters out, pointed tip) cut by a few large V-notches on each edge, cel-shaded as a sunlit half and a shaded half either side of a pale midrib, with flat darker/warmer bands at the crown and tip, a soft same-hue rim and a few separation strokes; UV v=0 is the crown end and v=1 the tip (canvas top). Crowns carry eight fronds plus two young ones. The zone tree pass no longer places palms; inland picks fall back to the zone's other tree. Authored `town.trees` palms are unchanged. The terrain's beach weight eases over `art.ground.backBeach` m behind the beach into a sandy-soil band with sun-dried grass patches; meadow clumps stop at `duneGrassLimit` and thin out toward the sand. Beach sand adds round bright/dull grains and a warm dry band inland of the swash. Palms (`nature.js` `palmTrunk/palmFrond`, `art.architecture.palm`) are a curved ringed trunk with vertex-coloured rings and alpha-tested frond cards: an arching rachis with both halves folded down in a V, painted once by `palmFrondTexture()` (`leafpaint.js`, seeded canvas of tapered leaflets), plus three young upright fronds, a crown coconut cluster and 0–3 fallen coconuts per palm on dry free ground (`fallenCoconuts`). In Godot use a texture atlas with alpha scissor. The shipyard's planking hull is drawn from one half-breadth/sheer function: flat transom stern, pointed bow with a raked stem where both rails meet. Exterior builders (`market.js` `builder()`) turn timbers under 4 m slightly about their thinnest axis, seeded from the part's own numbers (`art.architecture.handmade`); roofs are tile courses with staggered, two-tone plates, tiled hip ends, hip caps and a segmented ridge (`art.architecture.roof`); district plinths are extruded ragged outlines with edge stones; fishing boats carry rubbing strakes and floor ribs. All stay inside the authored collider footprints (`tests/render/azure-footprints.test.mjs`); geometry is built once at load, no per-frame work. `tests/browser/town-art.mjs` captures the town review views. Port noise/strokes with derivative antialiasing to Godot spatial shaders; retain real shadow reception and owner disposal of surface materials. One 1024² shared mipmapped brush atlas is baked deterministically at construction, with last-owner texture disposal; no external texture asset, collision or save-format change. Performance: the ~12 low-frequency value noises of the painter (meadow cover/worn, broad tint, ochre, bare/road/paving/shore wobbles, bank, sandy soil) are baked once at load into three RGBA8 field textures at `art.ground.fieldTexels` per metre (`bakeGroundFieldData`, same formulas) and sampled with linear filtering; earth/road textures are only painted where soil, bare ground or a road shows. Grass clump colours (root ground colour and lawn tone) are evaluated once per clump by a one-off GPU points pass and read back into 8-bit per-instance attributes (`bakeGrassColours`); blades only blend them. In Godot, bake the same fields to textures and grass colours to per-instance custom data. |
| `render/hero.js`, `render/rig.js`, `render/monsters.js` (procedural models and animation) | Replace with real rigged models (`.glb`) and `AnimationTree`. The procedural poses show what each animation should read as (wind-up, charge, shell, slam). |
| `render/vfx.js` | `GPUParticles3D` and shader meshes. Keep the rule that effect shapes match the hit areas. |
| `render/skill-fx.js`, `render/skillfx/*.js` | The light-and-ribbon skill effects (first built on the FX test bench) for Slash, Firebolt (charge/impact extras; the ball stays `vfx.js`), Chain Spark, Frost Nova, Flame Stream, Venom Arrow, Arrow Rain, Power Draw, Frontline Split, Sunder Cut, Breakbeat Slam, Flank Thrust, Shield Bash and Measured Riposte, plus the job-tier Meteor (`meteor-fx.js`), Thunderstorm (`thunder-fx.js`) and Blizzard (`blizzard-fx.js`), with shared pieces in `light-kit.js` (core/glow strips, radial glow and four-point star sprites, ground circles, spark streaks) and `meteor-flame.js` (Meteor's fire in Firebolt's technique: transparent double-sided shells, a comet round the rock and an explosion dome, whose fragment shader reuses `fireball-v5.js`'s exported `V5_FIELD` noise, warp and heat ramp, the flow carried in the noise offset and a rising cut-off for burning away: in Godot, a spatial shader on lathe/sphere meshes) with `FireExtras` (embers, flash, puff; `burst` and a size on `impact`) and `anime-kit.js` (the ground warning disc with a growing plain fill). Thunderstorm draws with Chain Spark's exported `zig`, `CRACKLE_FS` and `BOLT_GLOW_FS` from a ball of lightning (a fresnel/noise sphere shader) that drifts after the monsters inside the circle (the director passes `game.monsters` to its update and the struck monsters' positions on each wave). Earth Heave (`sky_shatter`, `shatter-fx.js`) uses `ground-kit.js` (a lumpy rock and a chamfered ground-slab geometry, the toon crater decal shared with Meteor; `craterFan` turns Earth Heave's into a fan-shaped pit of freshly dug soil (`uBurn` 0: lighter browns, no scorch or soot) over the true arc and reach, its point at the hero's feet: the height field's distance becomes a near-sharp p-norm of the radial and angular distances): ground slabs heaved up and tilted row by row over the hit arc, billboard dust puffs, a ragged flash and ray ribbons; the hero pries the ground up with the clip action `skyPry` (data/action-clips.json), its follow-through played over 0.6 s (skill-fx.js `POST`). Earth Rend (`rend-fx.js`) is a fissure decal along the lane (a shader: a jagged crack with forks, hot then cooling, inside a scorched band), `ground-kit.js` slab pillars that burst up and shatter into pooled rock pieces, dust puffs and a shake through `onShake`, all on the strike; the director skips Frontline Split's strike for it, and the hero plays the clip action `rendLeap`. Cross Cut is two violet slash crescents (`CROSS_PALETTE` in skill-fx.js) around the hero like any cut, bulging forward with their sharp outer edge leading, rolled 45° either way about the facing (`tilt`) so they cross as an upright X, a thin band (`inner` 0.58 of the reach, part of the arc geometry's key) over 90° (`arcDeg`), flying on forward at `drift` m/s and drawn over the bodies they cross (`overlay` turns the depth test off); the first is held (`hold`) until the second has swept across it; the hero plays the two-cut clip action `crossCut` (its first cut on the hit key, the backhand on the repeat time). Blade Storm (`storm-fx.js`, a dagger main skill: two quick spins 0.15 s apart within 1.8 m): each 'whirl' event starts a violet slash crescent round the whole circle (340°, the second higher), plus a few wind streak ribbons whipping round the hero and, on the last spin, a small burst of sparks and a light; the hero plays `bladeStorm` (Whirl Blade's `whirlSpin` run two quick turns, over the cast plus 0.45 s: skill-fx.js `POST`). Backstab (`shadow-fx.js`): on the rules' `shadowStep` event (fromX/fromZ to x/z, the target id) shadow is drawn as ink (a dark body with a violet rim, normal blending), with nothing on the ground: ink wisps flung off the body at both ends curl outward and thin away, a thick ink streak with a bright violet thread runs a quadratic curve swung out to the side away from the target (never through its body), a tall violet slit flashes where the hero appears, shards spray and gather, and `Vfx.shadowEchoes` leaves three dark pose echoes (the leaving pose, then two along the curve, facing along it); the stab reuses Flank Thrust's `ThrustFx` with `violet` (spear and a hard burst without the gold diamond), and the hero plays `flankStab`. Iron Body (`iron-fx.js`, a self buff; the View skips its War Cry pulse when SkillFx drew the `buff`): steel speed lines rush in through the cast; on `buff` a shell of hexagon plates (an open cylinder, its fragment shader a hex grid drawn with normal blending so it stays steel-coloured on any ground, brighter at the silhouette, revealed upward with a bright front) holds round the body and then shrinks into it, with a steel glint, a waist-high ring of light and sparks; while `player.buffs.iron_body` lasts a sheen ring slides up the body every 1.2 s and the effect follows the hero." Party buff shouts (`buff-fx.js`, `LOOKS` per skill; Rally, Frenzy Roar, Stand Firm, Hold the Line): embers spiral up through the cast; on `buff` a ring and its echo race out at waist height to the buff's true radius, shout lines burst out round the hero, spirit streaks shoot up with a star glint, and camera-facing up-chevrons (built from the camera's right/up vectors) rise over every body the buff reached (the hero and allies in range); while a body holds the buff, ember streaks drift up off it (negative gravity sparks). Frenzy Roar (`roar`, `trail: 'back'`) is sound instead: through the cast sparks are drawn in to the mouth; on `buff` five smooth rings pulse out one after another at head height to the true radius, five arcs ")))" burst ahead of the mouth along the facing, the camera rumbles, and the lasting streaks stream back from each body's facing. Stand Firm (`symbol: 'shield'`, `trail: 'orbit'`, a cold-tinted glint): the shout as Rally's in blue, a camera-facing heater-shield outline that pops up over each body the buff reached and holds, and lasting streaks that circle each body. Since 2026-10-30 each buff's own signature (`skillfx/aura-fx.js` AuraFx, `AURA_SHOUTS` replace the BuffFx shout for Rally, War Cry, Frenzy Roar, Boiling Blood and Berserk; `AURA_LINGER` replace the lasting streaks for all of them): pooled lathe/cylinder/sphere shells round each buffed body with one `V5_FIELD` shader (`uMode` 0 fire rising, 1 wind carried round the axis, 2 a fresnel skin with a shimmer and a hit ripple), a rune-ring decal under Hold the Line, ribbon tethers from each monster with `tauntT` to the hero (Provoke), ribbon motes from a struck monster to the hitter with Fighting Spirit (the director's `hit`), Rally's flame along the hero's blade (`bladePoints`), Boiling Blood's steam scaled by the hero's rage fraction, Berserk's red eye sprites at the head bone; in Godot, spatial shaders on the same meshes. Batch 2: Provoke (`roar`, `reach` 8: the rings go to the taunt's radius though the buff is the hero's own; `vein`: an anime anger mark, four bowed strokes facing the camera, pops and throbs over each monster it turned, which the director passes as the shout's bodies), Boiling Blood (crimson, up-chevrons), Fighting Spirit (green-gold, up-chevrons, orbiting streaks), Berserk (a roar to 3.5 m in crimson-violet, up-chevrons, streaks streaming back). Hold the Line (`wall`, `double`) is Stand Firm's in guardian gold, with the emblem drawn twice and a shield wall: eight camera-facing shields snapping up one after another on a 1.7 m ring round the hero, held, then fading. Blessing of Light has its own `bless-fx.js` (BlessFx; the hero plays Frost Nova's `nova` cast): motes drift down onto the hero through the cast; on `buff` a column of light drops onto it (an open cylinder whose shader carries fbm noise down the column as flowing streaks, bright at the rim and see-through in the middle, revealed from the top with a soft front, drawn with normal blending so it stays white-gold on grass), narrows and fades; crisp four-point star sprites (`starTexture('holy')`, normal blending) pop, twinkle and drift down round it, a glint flares where it lands, a soft golden ring goes out to the radius, and a halo lights over each body holding the blessing with a pop, then stays softly breathing for the whole buff while a star twinkles beside it now and then. Rapid Volley (`volley-fx.js`; its arrows are the game's arrow meshes: `vfx.js` `BOW_SHOTS` lists the bow skills drawn as real arrows and nocked through the cast; the hero plays the clip action `volleyKneel`, down on one knee for the five looses, over the cast plus 0.88 s: skill-fx.js `POST`): each new `rapid_volley` projectile bursts a ring of air standing across the shot just ahead of the bow and throws speed lines forward; in flight a cone of split air rides the arrow's head (a pooled paraboloid shell, `LatheGeometry`, whose shader carries spiral bands of noise back along it, bright at the rim, drawn with normal blending so it stays white-cyan), two helices of wind wind round the arrow's path from a short position history, widest at the head, with a thin streak down the middle; each `hit` bursts a gust (rays, the longest along the shot, and a ring across the shot). Killing Arrow (`kill-fx.js`; the hero plays `killShot`, a braced crouch with the deepest draw held through the 0.55 s aim and the hard release, over the cast plus 0.6 s): castStart starts the aim (a sight line from the bow along `e.angle` to the locked target or the full reach, sparks drawn in to a growing tip glint, a spinning ring round the tip, a sigil standing across the shot 1.1 m ahead (a solid inner ring, six dashes turning one way, an outer ring with eight ticks turning the other) growing in, and a reticle ring with four ticks closing onto the target when one is locked in reach); the arrow's first frame looses it (the sigil flies apart, two rings standing across the shot, recoil streaks thrown back, a glint, a camera kick); in flight a thick streak follows it wound with two crimson helices and shedding sparks, and the line it cut hangs behind it, thinning out after it is gone; its `hit` bursts long rays along the shot, two rings across it, sparks and a hard shake, and a beam pierces out the far side with a ring of air further on. Holy Bell (`bell-fx.js`; the `nova` event carries the casting `skill`): through the cast a see-through bell of light (a `LatheGeometry` bell profile, its shader carrying noise up it as light bands, gold bands at the lip, waist and shoulder, bright at the rim, drawn with normal blending so it stays white-gold) with a glow sprite inside comes down over the priest with a small bounce; on its `nova` it flashes and swells with a wobble, a dome of sound (a half-sphere shell, only its rim lit) and three rings race out to the true radius, rays shoot up from the crown, holy stars burst outward, the camera shakes and a smaller echo follows 0.32 s later; each `hit` rings its target (a ring round it and a star); then the bell lifts and fades (the stunned monsters get MaceFx's stun stars from `stunned`). Shell shaders that wrap round a lathe or cylinder (the bell, Blessing's column, Rapid Volley's cone) take their noise round a circle (cos/sin of the angle), so there is no seam where the mesh closes. Chain of Light (`lightchain-fx.js`, in `OWN_PROJECTILES`: the generic orb is not drawn): motes gather at the staff tip through the cast; in flight a chain of light links (small rings of light along the line, each turned a quarter from the last) runs from the staff tip to the projectile with a sheen running down it, the head a star sprite with a turning cross of rays in a spinning ring; its `hit` flashes, rings and bursts stars on the target, pulls the chain taut and dissolves it from the hand outward, and while the target keeps its `chill` status winds three loops of chain links round it that tighten and turn, shoots four chains out from it to rings of light hanging in the air round it, and turns a seal (a ring and a star sprite) over its head (looked up by id each frame), falling away when it ends or dies; a miss draws the chain back to the hand. Spell Wave (`wave-fx.js`, in `OWN_PROJECTILES`; the hero plays the downward chop `splitChop`): the cast stands the bench's slash crescent on its edge (`tilt` 1.5) in `wavePalette(element)` (arcane, or the element an element mod gives; each wave keeps its projectile's element colours); its projectile is drawn as a tall crescent of light standing upright and bulging forward (its arc in the vertical plane along the shot), one fading afterimage behind, speed lines off its top and bottom tips and a few rune sparks (a main skill cast every 0.8 s: kept light, up to 4 waves tracked by projectile id at once), the line it cut hanging in the air behind it, thinning and flying apart when it ends; each `hit` slashes an upright stroke down the target with sparks. Blizzard (`blizzard-fx.js`) is a cel frost decal with swept drifts, an open-cylinder wind wall whose shader reuses `V5_FIELD` noise carried round the circle (see-through facing the camera), and orbiting streak ribbons. Meteor places its sky fire with `skyAbove` (fx-common: a sky point near the top of the screen, found by casting a ray from the camera to a height). Skills marked `fxPending` in data have no effect of their own yet: `vfx.js` gives them an element-tinted warning disc, impact ring and zone field (`burst.generic`). `SkillFx.event(e)` reads core events and returns whether it drew them, so the View skips the old look for those skills only; `update(dt)` follows projectiles, statuses (poison stacks, exposure, stun, taunt) and the posed weapon. Effects keep heights above the ground and `fxGround.y` lifts every ribbon point, sprite and mesh onto the terrain (a cached bilinear lookup). Ribbons are camera-facing strips rebuilt each frame into one fixed buffer per effect (in Godot an `ImmediateMesh` or a `MultiMesh` of quads); particles come from fixed pools/free lists. The game turns off the effects' point lights and Flame Stream's occluder pass (`fxConfig`). Hand-made hero actions (`thrust`, `shieldBash`, `guardBlock`) live in `render/actions.js`; the clip actions (`splitChop` for Frontline Split, `bowShot`, `bowSkyShot`, `bowDrawHold`/`bowLooseShot` for Power Draw, `boltCast` for a non-staff Arcane Bolt/Firebolt, `staffCast` for the staff's, `sunderChop`/`sunderChop1H`) are data in `data/action-clips.json`. Dash, roll, blink and leap sample `moveDash`/`moveRoll`/`moveBlink`/`moveLeap` at the move's progress (hero.js `MOVE_CLIPS`), eased in from and out to the interrupted pose; the roll takes only the limbs and keeps its whole-body turn over, its curled body set on the ground each frame (the lowest of a head ball, knees, feet, hands; `rollOnGround`). An action's `air` channel lifts the body off the ground (Breakbeat Slam's jump). The roll's knees are pulled to the chest through the turn (`ROLL_TUCK`). Blink has a `delay` (skills.json movement.blink, 0.14 s: a crouch then a spring up as the body vanishes, moveBlink): `useMovement` starts the dash in place (invulnerable) and `blinkPlayer` jumps once `dash.t` reaches it, emitting `blinkPlayer`; the view hides the body only after the jump (`dash.moved`). `Vfx.syncMovement` draws a loose dust cloud along a roll; `skillfx/move-fx.js` (MoveFx, through SkillFx) draws the blink (a tightening ground ring and spiral wisps through the gather on `movement`, then on `blinkPlayer` a slit pinching shut, a flash-step streak, a slit opening, a ring and settling motes) and the leap (one tapered ribbon behind the body, then on its landing `burst` a flash, two shock rings to the radius, ground cracks, a dust skirt and chips); the view's old blink planes and leap star/rocks are only a fallback without SkillFx. Flank Thrust, Shield Bash, Breakbeat Slam, Whirl Blade, War Cry and Measured Riposte's guard are clips too (`flankStab`, `shieldShove`, `breakbeatSlam`, `whirlSpin` with a `spin` channel: the body's turn about the vertical, `warCryRoar`, `riposteGuard`). The owner's approved spell actions are the base of the alike skills (actions.js BY_SKILL/BY_KIND): Firebolt's push (`boltCast`, `staffCast` with a staff) for Hex, Stone Burst, Crystal Wall and Arcane Bolt; `staffCastHeld` (the push reaching full reach at 0.9 of the hit, so a channel's freeze holds it) for Flame Stream; Chain Spark's `zap` for the summons; Frost Nova's `nova` for Ward, Healing Spring, Cleanse and Battle Aura. With a second weapon in the left hand (dual), the basic attack alternates hands: odd steps play `leftHanded(name)` (actions.js), the action mirrored left to right (rotations [x, -y, -z], L/R channels swapped, the weapon channel moved to the left weapon with a half turn about the blade so its edge leads, a swing arc's angle and lead mirrored and solved for the left hand by `solveOffSwing`), eased in from the carry and back. A clip with `ends: 'carry'` (`staffCast`, `boltCast`) treats its first and last keys as the hero's carry: its weight eases in (smoother) over the first segment toward the second key and out over the last from the second-to-last, instead of the 0.06 s/0.1 s linear fades, so a cast neither snaps out of the carry nor stops short at the end (in Godot, a blend weight on the same curve). A clip's cut leads with the weapon's +X side; a model whose cutting edge is its -X side (`models.json` `edge: -1`) is turned half a turn about the blade while a clip plays (hero.js), as its carry is. A clip's `gripSlide` slides the weapon through the skinned fist toward its head (`rig.gripSlide`, chibi-body.js): in Godot, offset the weapon attachment along its own axis. The bow clips set `aim` (the bow stood upright facing the target: an orientation constraint on the bow socket in Godot); `bowSkyShot` instead keys a weapon turn that pitches the bow up; a held charge (`bowDrawHold`) has hit 1, and the loose continues from it without a fade-in. |
| `render/firebolt.js`, `combat-fx.json.skills.firebolt` | Fire-element Firebolt uses an animated flame distance field and additive corona on shared velocity-aligned camera billboards and a fixed-capacity instanced pool of wisps and embers. Charge follows the posed weapon tip (`Vfx.castSocket`: the staff head, else the weapon's configured tip; the bench's gather wisps and halo converge on the same point and clear on the release frame) and clears on release/cancel; the bolt leaves from the socket on the release frame itself, its sideways/vertical offset to the rules' muzzle handed over within `launchDistance` and its offset along the flight over four times that offset, eased out, so the ball leaves the charge at half speed and speeds up to its own without ever moving backwards; the cast corona is padded to avoid quad clipping. The tapered wake uses advected noise-cut curling tongues with staggered pointed ends; drift-aligned wisps do not widen it into a slab. Impact is a compact white contact flash that peels into asymmetric flame tongues and drift-aligned sparks, with no expanding ring or smoke, driven once by the existing event. Impact direction comes from the nearest last-rendered Firebolt, with no core event change; the compact contact layer draws over the struck surface. Port to `QuadMesh`/spatial shaders and bounded `GPUParticles3D`, retaining the same source/velocity and expiry contracts. Particle billboard bases must remain right-handed (right = (direction.y, -direction.x)) for front-face rendering. Embers retain a bright core and configured width/shrink over their 0.42 s lifetime so they remain legible after the 0.18 s flash. The oval visual head uses configured along/across radii (0.29/0.19 m), with an animated hot pocket inside orange/gold layers rather than a uniformly white disk; head heat/turbulence are data settings. Base projectile speed is 9 m/s, leaving room for projectile-speed modifiers; damage, range and collision radius remain unchanged. Element conversions use the existing element renderer. |
| `lab/tuning.js`, `lab/editor.js`, `lab/lab.js` | Data-generated phase controls, per-skill Lab-only overrides, safe import/export and browser storage. Vfx accepts an isolated config; preview restart clears timers and disposes owned meshes while retaining shared geometry/pools. In Godot, build one inspector from exported effect data/resources and inject a preview copy rather than changing combat rules; see `SKILL-LAB.md`. Generic projectile scale/glow/trail and impact parameters now live in `combat-fx.json.projectileDefaults`. |
| `render/game-camera.js` | The game camera: 40° above the horizon (the owner's camera, 2026-10-27; it was about 55°), 23.3 m from the hero before zoom, fov 36. The game view, Skill Lab, FX bench and the effects that face the camera (`faceGameCamera`) all read it; `?pitch=` previews another angle. In Godot, a `Camera3D` on a `SpringArm3D` (or a fixed offset) at the same pitch and distance. |
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
character-level or stat gate. Skill levels (below) grow 1% damage and 2% MP per level; mods
supply behavioural growth.

Skill level (owner, 2026-10-27/29, `docs/SKILL-GROWTH-TH.md` phase 2b; `crafting.js`): a combat
skill levels from 1 to `skillLevelCap` = the character's level (within `skillUpgrade.maxLevel`, 70).
At a workbench or trainer `feedSkill(ch, data, id, crystal, count)` feeds crystals of one size
(`skillUpgrade.crystals`: small 1, medium 5, large 25 EXP) into `ch.skillExp[id]`, paying
`goldPerExp` gold per EXP. Level L needs `skillExpNeed` = round(`expPerLevel`[0] + [1] x L) EXP, and
the stats must meet level L + 1's requirement (`skillRequires`, below) to pass to it. Only crystals the reachable levels can use go in (`skillUpgradeState`
`room`); EXP past the last reachable level from a big crystal stays banked and becomes levels when
the character or the stat catches up (`pending`; feeding then settles it free). Mod sockets follow
`mods.slotLevels` (1/4/10/17/24). Small and medium crystals drop from every monster
(`items.upgradeMaterialDrops`), the large one from bosses.

Stats (owner, 2026-10-29, `docs/STATS-TH.md`): the six stats sit on a wheel
(`progression.character.statWheel`: STR AGI DEX LUK INT VIT). A weapon asks for its type's stat (sword,
greatblade, axe, mace STR; bow DEX; staff, wand INT; shields VIT); one with a `secondaryStat`
(its type's pairs, `tests/core/stats.test.js` `WEAPON_STATS`: daggers only STR/DEX or DEX/AGI with no main-line dagger; staves INT/LUK, wands INT/LUK or INT/DEX; `progression.character.crossPairs` lists the two pairs that skip a stat on the wheel (STR/DEX, INT/DEX), allowed for weapons and skills like neighbours; an INT/DEX wand rolls from `optionPools.classes.wand_dex` (`optionClass`); maces STR/VIT or INT/VIT; shields VIT/STR or VIT/INT) hands it `items.requirements.secondaryShare` (0.4) of the requirement
(`gearRequirements`). Regeneration (`derive`): HP per second = flat `hpRegen` (gear, nodes) + max HP x (`base.hpRegenPct` + `hpRegenPct` from VIT's `perStat` and nodes) / 100, capped at `base.hpRegenCapPct` of max HP; MP per second = `mpRegenOf` ((`base.mpRegen` + `mpRegenPerLevel` x (level - 1)) x (1 + `mpRegenPct`/100) + INT x `mpRegenPerInt`). A node's `potionHealPct` scales health potions (`consumables.js restoreAmount`). Armour base stats follow `items.armorIdentity` (written by `scripts/armor-identity.mjs`): core defense/HP (cloth: spell shield and MP) as multiples of the slot's share of `progression.balance.gear` at the item level, percentages at a share of their per-level cap, flavour paid for out of the core. Gear option pools come from `items.optionPools` (`item-metadata.js optionClass`: weapon type, priest mace, shield, plate/leather/cloth armour by the stat it asks for, charm; plus `slotExtras`), written into each base's and recipe's `optionPool` by `scripts/option-pools.mjs`; find options and every stat option roll on charms. Armour pieces (armor, helm, gloves, boots) ask for their level and, the same way, their class stat
(heavy VIT or VIT/STR, light AGI or AGI/DEX, cloth INT or INT/LUK, never VIT); a charm asks for its level
only; the requirement follows the item's class, not the stats it gives. Weapon and shield base stats follow the same stats (`items.weaponIdentity`, written once by
`scripts/gear-identity.mjs`): main-line weapons carry damage only, main-and-secondary ones trade `damageCut` of
their tier damage for the secondary stat's identity stat at a value that grows slowly with item level. A skill for one stat or
two neighbours on the wheel (its `upgradeStat` first), a mod for one; each stat named is met on its own
(`tests/core/stats.test.js`). `character.js statTotals(ch, data,
equipped, skipUid)` adds trained points, Job Tree node `effects` named after a stat and the stat options
of worn gear (`gearOptions` `str_flat` ... `luk_flat`, `growth: "attribute"` in `optionLevelGrowth`); gear
turns on from below (an item is active once the rest already meet its requirement), so an item's own
bonus never meets its own requirement and two items cannot hold each other up. `derive()` uses the
totals (`d.stats`) for `perStat`, HP per VIT and MP per INT, and counts only active gear;
`meetsRequires(ch, requires, data)` checks the totals (`meetsStats` checks a given stats object).
`skills.js skillRequires(data, def, level)` = the skill's `requires` (or `skillUpgrade.require.base` of
its `upgradeStat`) + `require.perLevel` (1.7) per level above 1, shared by its stats in proportion;
`modRequires` adds `modUpgrade.requiresStatPerLevel` (25) per mod level. `levelInUse` holds a skill or
mod above what the stats allow at the highest level they meet (`computeSkill` `s.level`, `s.owned`); it
is switched off only below its first level. A Job Tree node effect `finesse` (0..1) makes STR's `attack` and `meleeDamagePct` rows count DEX instead of STR and drops DEX's own `attack` row by the same share (`derive`), so melee attack can come from DEX with nothing added. In Godot keep `Character.stat_totals()` and call it
wherever requirements are checked.

Levels and gear ranges (owner, 2026-10-29, `docs/STATS-TH.md` section 6): the character goes to
`character.maxLevel` 70; today's monsters cover 1-40 (`balance.monsterCap`), bosses may sit above. Each monster
kind has one fixed range (`monsters.json` `levels`); a map spawn stays inside it unless it carries
`temporary: true` (a placeholder until a new monster fills that zone). A gear base covers an item-level range
(`itemLevel`..`maxItemLevel`, written by `scripts/gear-levels.mjs` from `items.gearLevels`: lines in group A start
at 1/10/20/30/40, group B at 1/5/15/25/35, every line ends at 54 and from `alignedFrom` 55 all lines get new bases
together; `knownGaps` lists the lines still missing a base). Each piece has its own item level inside that range:
`crafting.js pieceLevel(data, base, level)` clamps a level into it; a drop takes the monster's level
(`rollGearDrop`), a craft the crafter's (`rollGear(data, recipe, rng, ch.level)`); `gearDropCandidates` offers the
bases (made from the monster's parts) whose range holds its level, else the newest below. `character.js
gearLevelScale` grows a piece's power stats (attack, magic, defense, maxHp, maxMp, maxShield) from its base's first
level along `handRules.reference` (weapons, shields) or `balance.gear` (armour, charms), so the stat requirement
follows; percentages stay the base's own. Per-item-level growth (reference, identity, option growth, the set
curves) was divided by 1.625 when levels stretched from 1-25 to 1-40. The balance model gives the reference hero
gear at its own level (`gearTierAt` = level). The crafting page shows the level the piece will get and its range.

Monsters awaiting placement (owner, 2026-10-30): a `monsters.json` entry with `awaiting: "placement"` is fully
defined (fixed `levels`, stats, attacks borrowed from an existing `behavior`, drops) but in no map yet; the balance
model (`recipeFarming`) and the crafting audit (`encounterCraftAudit`, `summary.awaitingPlacement`) count it as a
source at its fixed levels. Remove the flag when it is placed. A weapon whose own model is not wired in yet points
at an existing one with `models.json` `placeholderOf`.

Stat thresholds (owner, 2026-10-29): `progression.statPerks` lists, per stat, four perks at 50/100/150/200
total points (`id`, `at`, `nameTh`, `descTh` and the perk's own numbers). `derive()` sets `d.perks` to the
unlocked ones (`stat-perks.js activePerks`, null when none) and adds AGI 150's movement charge after the caps.
`src/core/stat-perks.js` holds the rules as hooks the simulation calls. Every perk works for every skill
and weapon (owner: a stat is used by several styles, so no perk helps only one). No perk staggers (owner).
`computeSkill` widens Melee skills by STR 50's `widthPct` (arc, and a `melee_nova`'s radius) and adds DEX 100's
`rangePct`. `perkHit` runs before crit in `hitMonster` for the hero's own skill hits: STR 150 on a monster's first
hit (`perkStruck`, set on the monster; a respawn is a new monster), STR 200 below `hpPct`, DEX 150's bonus on hits
to `player.targetId` (starts again on a new target), and it returns DEX's `penetrate`, applied to defense.
`perkAfterHit` runs after it (DEX crit marks `perkMarks` on the monster, INT's MP return once per cast: `perkCast` returns a cast id that `castSlot` puts on the cast skill as `perkCast` and `hitOpts` passes on, so overlapping casts each refund on their own first hit; an unused return expires after `window` seconds), `perkKill`
in `killMonster` (STR 100 heals `healPct` of max HP, not for a summoned minion), `perkCast(g, s, slot, paid)` in `castSlot`
(INT's pending return and every 5th paid cast refunded, LUK's cooldown reset), `perkMovement` in
`useMovement`, `perkDodge` on a dodge, `perkInvulnerable`/`perkTaken`/`perkSteady`/`perkAfterTaken` in
`damagePlayer` (VIT's barrier and the two lethal-hit saves), `perkRegen` and `perkShield` in
`updatePlayer`, `perkDrops` in `killMonster`. Timers and counters live on `player.perk`; rolls use
`game.perkRng`, a stream of their own. Events: `{type:'perk', id, x, z}` (the HUD floats the name). In
Godot keep one `StatPerks` script with the same hooks. Tested in `tests/core/stat-perks.test.js`.

MP economy (owner, 2026-10-26, after Path of Exile and Undecember): every combat skill has a
`cost` (an aura reserves MP instead); the quick main attacks are cheap, physical ones cheaper than
the spell. `computeSkill` sets `costScale` = (1 + `skillUpgrade.manaPerLevel` x (level - 1)) x
(1 - `manaCostReductionPct`/100) x the product of every active mod's `effect.costMult` (every
combat mod has one, 1.15-1.4; Mana Siphon 1; movement mods none), then `cost = def.cost x
costScale` and a channel's `manaPerSecond x costScale`. A level raises the cost faster than the damage
(2% against 1%), and cast speed spends it faster, so damage and speed without MP investment end
MP-bound (`balance.js longFightDps` takes `mods` and `gear` and counts MP gained on hit). MP on
hit (`mpOnHit`, derived stat): `s.mpOnHit` is the derived value plus Mana Siphon's, for Attack
skills only; `hitMonster` adds it to MP (up to `manaLimit`) for each enemy a direct hit lands on
(not damage over time, not allies). Sources: gear option `mp_on_hit` on attack weapons, gloves and
charms (`growth: "percent"` overrides the flat item-level growth in `crafting.js optionRange`), the
MP journal line's notables (+2 each) and the Mana Siphon mod. Spell gear rolls `mp_regen_pct` and
`mana_cost_pct` instead. Tested in `tests/core/mana-economy.test.js`.

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
A greatshield (`weaponTypes.greatshield`: `hands: two`, `shield: true`; crab, beetle and crag
greatshields at item levels 1, 6 and 21) is a right-hand weapon held in both hands that also
counts as the shield in hand: `derive` sets `offhand: 'shield'`, so its `blockChancePct` blocks
and Shield Bash (`requiresOffhand: shield`) works with it; the basic attack (`slash`) accepts it.

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
`core/build-rules.js` (2026-10-27) judges builds, not one number: `buildProfile` gives a build
(kit, Job Tree nodes, a gear set from `progression.balance.rules.gearSets`, support skills) one value
per axis (single, pack, survival, sustain, mobility, team, income); `auditBuilds` lists overpowered
pairs (a build dominating another role's specialist), poor choices, builds with no weakness, roles
that do not lead their axis and same-role gaps (`tests/core/build-rules.test.js`). Pure; port it with
`balance.js` so new Job Tree content is checked the same way.
`core/skill-growth.js` holds skill bars (docs/SKILL-GROWTH-TH.md): a skill's `growth` type (data
`progression.skillGrowth.types`) gives it 2-3 bars; casting it with an enemy within `combatRange` adds
its pace (the longer of cooldown, cast time, 0.35 s) to proficiency, and each `secondsPerPoint` earns a
point up to `totalPoints`. The grade (C..S, raised with gold, `gradeMaterial` and a boss part) caps a
bar. `barEffects` turns points into multipliers from one exchange table (gains add, costs multiply; a
cost on a stat the skill has no bar for is paid in MP); `computeSkill` applies them (`applyBars`), the
rate bar's speed joining the haste cap like Quicken. Taking points out costs `respec` gold. The UI
(`ui/skill-bars.js`) patches its gauges in place so they animate. Monsters flinch from a plain hit at
most once per `combat.flinchLock`.
`core/content-budget.js` measures each skill (what it adds to a reference hero of its weapon) and
each mod (its best gain on a skill it fits) with the same profile, against class bands in
`progression.balance.budgets`; items outside their band are listed in `budgets.known` with a reason
until decided (`tests/core/content-budget.test.js`, report: `node scripts/content-budget.mjs`). MP is
priced, not a wall: profiles run with `mpFree` and a build pays for its MP shortfall past its own
supply with MP potions in tiers (one potion per group cooldown, each bigger potion's added MP at its
added gold, on the income axis), then with gear rolls (`mpPrice`, `mpCost`). MP potions are an
emergency aid (30 s cooldown, small restores) and every main attack must last on regeneration alone
at the reference pace. A held channel is measured as one cast per tick (its drain per second). The
profile counts a rotation, our buffs, heals and leech, summons, burn/poison, stuns, knockback, slows,
curses and taunts with the assumptions in `progression.balance.rules.control`.
Gear bases sit on tiers (item level 1/6/11/16/21). The six targeted garment additions
(Sporeweave vest/gloves at 6, Moonleaf Slippers at 11, Wardenstalker coat/hood/gloves
at 21) use the same stat-based wear, recipe, grade, enhancement and drop rules;
there is no character-level equip gate or set bonus. Their PNGs do not imply new
3D outfit meshes; the current renderer reuses existing look templates.
 `gearDropCandidates` picks bases made from
the monster's parts at the tier for its level (falling back to the nearest lower tier).
`rollGearDrop` rolls a grade best-first (`items.gearDrops`) and options like a craft. Every option value (craft, promotion, drop) rolls through `crafting.js optionRange(data, id, grade, itemLevel)`: the option's min..max grows with the item level (`items.grades.optionLevelGrowth`: flat values 0.146 per level like weapon base stats, percentages 0.025), then the grade takes its band of that range (`items.grades.optionRoll`, C 0-0.55 up to S 0.7-1; no grade passes the top); the item card and the recipe list show that range. Charms can roll gear and gold find, boots material find (`gear_find`, `gold_find`, `material_find`). A
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
`critMultPct` (multiplies `critMult`), `hastePct` (speed: divides cast time AND cooldown by 1 + speed/100; it replaced `castSpeedPct` and `cooldownPct` on 2026-10-27, old cooldown gear rolls x3 in `migrateCharacter`),
`penetrationPct` (multiplies monster defence by `1 - pct/100` in `hitMonster`),
`movementRechargePct`, `manaCostReductionPct` and `mpOnHit` (MP per enemy an attack hits). Caps and soft caps are in
`progression.json`. `balance.js` `lineEffects`, `linePath` and `longFightDps` model them.
Input buffer: a skill pressed while its cooldown has at most `progression.combat.inputBuffer`
seconds left is stored in `player.queued` and cast the moment the cooldown ends (latest press
wins; not charged or channelled skills), the same queue a press during a cast uses.
The journal pages the stage overview (6 pages per spread, 4 on phones and short screens). A
grid page taller than the view scrolls, and "fit" stops at the readable zoom. Both are
presentation only.

Cap leech after mods and recover only actual target HP removed, never overkill damage.
`gearUpgradeState`, `skillUpgradeState`, `modUpgradeState` and `gearGradeState` are shared
by UI and rules; all previews are pure. Equipment state helpers check resources only.

`craftBatch()` allows 1..10 independent attempts, optional grade/affix/quality targets,
and stops on target or the first unpaid attempt. Bill only completed attempts and notify
quest progress once per item; preserve every result and UID. Never auto-equip or destroy
unwanted rolls. Crafting, enhancement (+N) and grade promotion share one full-screen
workshop (`ui/workshop-view.js`, `workshop-model.js`, `workshop-controller.js`; docs/WORKSHOP.md):
`craft` opens its recipe library, `forge` the owned equipment, and the bag links into it by UID.
Selection and comparison never craft or spend. Each confirmed command runs synchronously through
the core rules and saves at once; only then a one-strike hammer animation (850 ms, 240 ms with
reduced motion) plays over the item, and it can pay, roll or change nothing. Preserve its repeat
button, goals, recent result UIDs and the return path after bag comparison. All results stay in
the bag. In Godot, the strike is a `Tween`/`AnimationPlayer` on a UI scene, after the command.

The bag/workbench/growth views share grade pips, ranges and progression requirements via
`ui/progressionview.js`. Port `tests/core/balance.test.js`, `crafting.test.js` and the mouse/
touch flows in `tests/browser/balance.mjs`. Exact tuning/research is in `BALANCE-40.md`.

Rebuild separate Control scenes for combat loadout, modifiers, movement, material
upgrades and passive paths. A desktop/tablet navigation rail becomes a compact page
selector on narrow phones. Keep inspection separate from allocating points, socketing,
and spending materials. `ui/buildmeta.js` is presentation vocabulary shared by skill,
modifier, crafting and inventory details: native tags (`TAG_GROUPS`: every tag in one of six
groups, power, delivery, shape, element, effect and mechanic, with its Thai name;
`tests/core/skill-tags.test.js` holds skills and mods to it), damage element, stat requirements,
needs/on/not tags, mod family and exact incompatibility reasons. Modifier-added tags are
labeled separately; only a fitting companion's `grants` add fit eligibility. Calls to core
`modFits()` remain the authority for compatibility; do not duplicate the rules in Godot UI code.

**One mod fit rule.** `modFits(skill, mod, companions)` reads only visible tags: the skill's
`tags` plus the `grants` of each companion mod that fits the bare skill must contain ALL of
`needs`, ANY of `on` (when listed) and NONE of `not`; two mods with the same `family`
(`element`, `trigger`, `trajectory`, `displace`, `status`, `spread`) never share a skill. Shape tags (`Arc`,
`Nova`, `Ground`, `Zone`, `Barrier`) name the delivery the player sees, so no hidden `kind`
filter is needed. Failures return `{reason: 'needs'|'on'|'not'|'family', tags|family}`.
Mod sockets come from `mods.json` `slotsByRank`, each entry from its `slotLevels` skill level on
(`modSlotsFor`); changing a slot's skill already clears its mods, so a lower-level skill never inherits extras.
**Dash cut (`dash_line`, Blink Draw `draw_cut`, owner 2026-10-27).** After its cast time the hero
dashes `range` m along the aim in `dashTime` s (`player.dash` kind `draw_cut`, `inv: false`; walls and
cliffs stop it through `moveEntity`; the last frame of any dash moves only what is left, so a dash goes
its distance exactly). On arrival the rules emit `dashArrive`; after `cutDelay` s (Game.later) `strikeLane` (frontier-content.js,
shared with `melee_line`) cuts the lane from the start to where the hero stopped, `width` wide, every monster once, and emits
`lineStrike` with the travelled length; a skill's dash fires no `on_movement` triggers. The build
profile counts its distance as mobility.

**Greatshield skills (owner 2026-10-27, levels 1/10/30 since 2026-10-30; `job: guardian`, `requiresWeapon: greatshield`).**
*Line Breaker* (`shield_rush`) is a `dash_line` with `rush`: the dash is kind `shield_rush` and every frame
`rushContact` (frontier-content.js) hits each monster the shield has reached in the lane (start to just ahead of the
hero, `width` wide) once and moves it `rush.knockSide` m out to its own side; a boss or a monster with radius at least
`rush.bigRadius` is hit with a `rush.stun` s stun, the hero is put back to where the shield meets it and the dash ends
(`rushStop`, then `dashArrive` with `stopped`). Its damage adds `damage.defenseScale` x the hero's defense
(`computeSkill`). *Shield Fortress* (`shield_fort`, kind `guard_hold`) is a held channel with no pulses: it pays `cost`
once, walks at `channel.moveMult`, faces the player's own aim (pointer or a drag on the button; else the locked
target) and drops after `channel.maxDuration` s or on release (the cooldown
starts then). Past its `castTime` a monster hit from inside the front `guard.arc` (melee or a shot; never damage over
time) is taken at `guard.taken` (0: no damage, no knockback, `fortBlock`) and a monster that struck from close is moved
`guard.push` m back; an ally behind the hero (behind its facing) within `guard.coverRange` m takes `guard.coverTaken`.
A knockback from outside the arc still breaks it. *Wall of Faith* (`faith_wall`, kind `light_wall`) spawns a player area
with `lightWall`, `lightWall.offset` m ahead across the aim (`radius` is half its length): monsters walk through it but
are chilled by `lightWall.slow` while in its band (`tickLightWalls`), monster projectiles that reach the band end there
(`lightWallBlock`), and a hit on the hero or an ally standing on the caster's side within `lightWall.depth` m from an
attacker on the far side is taken at `lightWall.taken` (`coverMult`, applied in `damageUnit`; the best cover counts).
Their effects are `render/skillfx/greatshield-fx.js` (driven by skill-fx.js from `castStart`, `dashStrike`, `hit`,
`rushStop`, `dashArrive`, `channelStart/End`, `fortBlock`, `area`, `lightWallBlock`, `areaEnd`). They are made like
Firebolt: gold light cut out of Firebolt's warped noise (`V5_FIELD`) on nested see-through shells, one shader program
(`uMode` 0 a comet shell round the shield for the charge, 1 a rising curtain: a 140° cylinder strip for the fortress, a row of
one tapered slab along the wall, drawn solid with `uSolid`, its frame from a per-vertex distance to the outline `aEdge`); contacts use the ragged `flashMaterial` flash,
bouncing sparks, rising embers, dust puffs (a ring of them where a boss stops the charge), a point light and a light pool
decal under the wall. In Godot: the same noise in a spatial shader on those meshes, GPUParticles for the
rest. The hero plays `gsRush`, `gsFortress` and `gsWall` (`data/action-clips.json`, the owner's picks: Quaternius
Shield_Dash, Push_Loop and Sword_GroundPound on the body, the arms kept on the shield by the carry and `reach`).

**Signature and basic mods (owner, 2026-10-27).** A damage skill whose base cooldown is at least
`mods.json signatureCooldown` (12 s) carries the `Signature` tag, and every mod that multiplies a
cast's hits (`extraProjectiles`, `repeats`, `echoDelay`, `trigger`, `returnMult`) lists `Signature`
under `not` (`tests/core/basic-mods.test.js`). Basic mods use these effect keys in `computeSkill`:
`castTimeMult` (cast time, after speed), `projectileSpeedMult`, `noCrit` (`Game.hitOpts` forces
`crit: false`), `noStatus` (no burn chance, no chill; applied after every mod, so socket order does
not matter), `hasteAdd` (the skill's cooldown and cast time use `min(caps.hastePct, hastePct +
hasteAdd)`, so the top speed is unchanged) and `effectDurationMult` (duration of `buff`,
`curse_zone`, `self_barrier` and `wall` skills; fields use Lingering's `durationMult`).
Specialist mods for channels, lanes and chains, fitted by type tag (`Channel`, `Line`; the chain
mods belong to the lightning line and need `Lightning`), never by one skill: `spreadMult` (a cone's arc, else a beam's width, else a circle's radius), `rangeMult`,
`widthMult`, `chainFalloffSet` and `chainRangeMult` reshape the skill in `compileFrontier`; Release Burst (`releaseMult`, `releaseMin`,
`releaseCap`, `releaseRadius`) bursts ahead in `cancelChannel` when a stream held at least
`releaseMin` s ends (core `burst` kind `release_burst`); Far End (`tipShare`, `tipMult`)
acts per monster in the `melee_line` strike and Piercing Line (`penetrate`) ignores that share of
the defense in `Game.hitMonster`; control mods are their own group: Stagger (`quake_line`: `hitStun`,
`hitStunBoss`, the longer stun wins) and Lasting Control (`controlMult`: stuns, chills, curse and wall
durations; on `Control` or `Curse`) are fitted by control, not by shape; Forking Arc
(`forkMult`) also strikes the second-nearest unhit monster at each hop (a `chain` event with
`from: true`) and Arresting Arc (`chainStun`, `chainStunBoss`) stuns the chain's last target.
Wide Spread and Far Reach share the `spread` family.

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
  besides the hawk `dive` and stalker `pounce` leaps, and the warden's `roll`.
- **`roll`:** the warden (now a stone golem) curls into a boulder and rolls along the locked lane: an
  attack with `kind: 'charge'`, so it shares the charge path (one hit per unit, a rock in the way
  stuns it) plus `missStun` when it hits nobody. It is chosen at `minRange`..`maxRange`, after the
  quake. In the renderer the warden's model carries a second form (`data/models.json` monsters
  `horned_warden.ball`, `prepareMonsterForm`): a rigid boulder shown at the end of the curl and while
  it rolls, spinning at speed / radius, with the skinned golem hidden. In Godot keep both meshes under
  the monster and toggle them the same way. The golem is skinned `rigid`: each separate stone (and
  the shield) follows the bone whose segments lie nearest its middle, so a stone never follows another
  limb (a piece midway along two joined bones, an elbow or knee knot, is shared by those two only); its hollow stones draw both sides and its outline
  hull is pushed back in depth so it never covers a thin piece seen from behind. While it rolls (`act`) the boulder stretches 10%
  along its path and `src/render/roll-fx.js` draws its afterimages (copies of the ball, flat-shaded,
  fading behind it), speed lines (a shader scrolling crossed strips back from the silhouette) and a
  ground dust streak, all in the rig's space; tuning in `data/combat-fx.json` `roll`.
- **`dormant`** (`{wake}`, the warden): out of combat the monster lies still (no wandering); on aggro
  from idle it enters `emerge` for `wake` seconds (no attacks) before it chases. The renderer shows
  the warden's boulder while dormant; during `emerge` the boulder breaks into the golem's own stones,
  which fly up into place feet first, each tumbling along an arc; back home it folds into the boulder
  again. Before a `roll` (1.5 s wind-up) it braces: the shield swings round in front with its foot
  planted on the ground and the body crouched behind it (monsters.js `BRACE`), then it folds into the
  ball; the ball spins `ROLL_SPIN` (2.2) times its rolling rate, so it reads as fast and heavy. All of it is done per stone
  in the vertex shader after skinning (monsterSkin.js `ASSEMBLE`: each vertex carries its stone's
  middle and when it moves, `pieceC`), driven by monsters.js `wardenForm`.
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

- `dotDamagePct` increases damage-field (`dot_zone`) damage, not burn/poison
  status damage. `DoT` is not the same as `Persistent`: Healing Spring has the latter only.
- `persistentDurationPct` extends poison and healing fields; not buffs, curses,
  summons or cast time. Apply ground radius/duration scaling after collecting modifiers,
  so socket order does not change the result.
- `controlDurationPct` extends chilling hits and Hex; not slow strength, knockback or
  War Cry. Do not treat every duration as control duration.
- Lingering needs `Persistent`: a native lasting field (Healing Spring; `dot_zone` stays
  supported for data, though no live skill uses it since Venom Mire became Venom Arrow).
  Binding Field (`retired`) needs a damage field, so it has no recipe; saved copies still load.
- Widened mods keep one executor each: Spreading Hex passes Hex and Armor Cleave exposure on death (`spreadCurse`), Mending Chain on Healing Spring heals injured units outside the field every tick (`chainFieldHeal`), and Spiked/Breaking Ward on a riposte stance taunt on stance, reflect the blocked part and push nearby monsters on a successful guard (`applyGuard`). Its
  provider must also meet stat requirements to activate the bonus. Keep a dependent
  modifier stored but inactive when the provider is removed or inactive; never delete it.
- Poison Shift converts part of a hit into the target's poison (total unchanged). Wide Field and Concentrated Effect share the `radius` family. Building Power ramps a channel's pulses with hold time and makes a charged shot's full charge stronger but slower. Momentum (movement socket) shortens the next cast within its window, once (`player.momentum`).
- Fire Shift, Knockback, Life Leech and Frost Shift are on-hit modifiers. Fire/Frost Shift share the `element` family; a shift replaces the skill's own status (fire burns, cold chills, never both). They exclude
  DoT skills because the current field executor does not apply those on-hit effects.
  The three Shift mods (Fire, Frost, Poison) also exclude `Spell` and the element tags that carry
  their own effect (Fire, Cold, Lightning, Poison, Earth): spells keep their own element, and only
  attacks with no element, or plain Arcane (no special effect; e.g. Spell Wave), can change theirs.
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
Every model loaded through `render/models.js` (hero, outfits, hair, weapons, monsters) has
maps larger than `rendering.modelTextureMax` (1024) drawn down once on load: a 2048² map
costs 22 MB of GPU memory and four of them helped push the iPad into a lost WebGL context.
In Godot, set the import size limit on those textures to the same value.
The weapon, outfit, hair and chibi hero GLBs themselves are stored at that size by
`scripts/shrink-model-textures.py` (unused metal/roughness and occlusion maps removed,
geometry byte-identical), so a weapon downloads about 1 MB instead of 7-11 MB.
`docs/WEAPON-MODEL-PROVENANCE.json` keeps each weapon's original `sourceSha256`/`sourceBytes`.
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
The hero's chibi body (the default; `?hero=classic` keeps the HairSample hero; `public/models/hero_chibi.glb`, registered as
`characters.hero_chibi`; `render/chibi-body.js`) is a Meshy smart-topology mesh with its own
painted texture and the same Mixamo-like bone names as `hero_base`, so it uses the same driver
retarget (`bindSkinSync` with `MAP`). Its split Meshy normals are welded and smoothed at load,
and weapon/off-hand bones and chest gear (the quiver) are scaled by `gearScale` for the 1.2 m body,
and the animator's character-space hand targets (action IK, carries, the staff cast) are moved
onto it by `bodyMap` (`rig.ikMap`: heights keep their offset from the hips, offsets scaled 0.45);
`holds` replaces shared carries for this body (sword forward and down, staff low and upright,
heavy weapons two-handed at the belly with the head forward); a hold's `up: [1, 0, 0]` turns the
blade's flat (weapon +Y) to the side so the edge stands upright with the cutting side down (a
weapon model's `edge: -1` marks a blade or axe head that cuts on its -X side, which flips it), and a weapon in `gripMiddle` (the
staff) is held at the middle of its length. On a two-handed haft the left hand also turns its thumb
along the haft, and the animator reaches the left arm so its fist hole (not its wrist) lands on the
haft after the right fist is seated (`rig.support`). Each hand has finger bones (a thumb and four
fingers of three bones each, `Left|RightHand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}`, added by
`scripts/rig-chibi-hands.py` from the hand's own shape, the hand's skin weight shared out along each
finger). Their poses (`hands.poses`: open, relaxed, fist, grip, and `rest` built from open and fist: the fingers drawn together and curled a little more toward the pinky) come from Quaternius UAL1 clips
(`scripts/hand-poses.py`) as each bone's direction in the hand's frame (F out to the middle knuckle,
A across toward the thumb, P = F x A; a pose taken from the other hand turns P over); `handPoseQuats`
turns each bone the least way onto its direction. A hand holding something takes `hands.holding`
(the left also for the weapons in `hands.leftGripWith`), opened (`gripShare`: a share of each turn)
until the circle its long fingers curl round is `hands.gripRadius` (the weapons' handles at the gear
scale), and its hole (`gripHole`) is where the handle goes; an empty hand takes `hands.empty` (`rest`). The
pose is set on the finger bones before `bindSkinSync`, which keeps undriven bones at that rotation.
In Godot set the same bone rotations. The fingers' normals are rounded about their bones at load (`roundFingers`: `hands.roundFingers` of the way from each finger vertex's normal to the way out from its bone's line), so a bent finger's few facets do not cut the toon ramp into sharp wedges. The outline is thinner on the hands. The torso's bust and round hips are flattened once at load (`flatten` bands, in metres of the
bind pose). The head is reshaped once at load toward the sheet's rounder head
(`headShape`: wider, shorter below the eye line, fuller cheeks, the whole head scaled by `scale`
about its base on the neck) and its normals are bent toward the
head centre (`soft`) so the toon ramp shades the face as one round form; the painted eyes were
enlarged in the texture by `scripts/chibi-eyes.py`. On the face the toon ramp follows where the light stands around the
head instead of the mesh normal (`faceShadow`: a per-vertex face mask and coordinates, the head
bone's axes passed in each frame), so one shadow edge sweeps across the face as the light turns,
as in anime games' face shadow maps; the hair is flat (see the hair styles below). In Godot do both in the toon shader with the same inputs. The Meshy textures of the body, hair and outfits carry their own painted shading, so each also glows at `paintedLight` × its texture (emission = albedo texture) and the toon light only shapes it instead of darkening it twice. The chibi wears the same outfit base as the HairSample hero
(`render/chibi-garments.js`): top, trousers, skirt, boots (with the feet) and glove shells cut from
its own body (`regionShell`, the skin weights kept so gloves close with the fingers), painted by
`garments.js` reading its bind position and landmarks times `SCALE` (1.7, the HairSample body's
size), its bones converted from the armature's centimetres. Helms use `helmFit`, larger and higher
than `headFit`, to sit over the hair. In Godot build the same shells from the chibi mesh. The body
mesh is closed: `scripts/decimate-chibi.py` welds the glTF's split UV seams before decimating, or every
seam opens into a crack that shows the background and that the shells copy.
An armour, boots or gloves item with a modelled outfit (`characters.outfit_<item id>`, `chibiOutfit`
"armor", "boots" or "gloves"; `scripts/fit-chibi-outfit.py` fits a Meshy-generated dressed chibi onto this body)
wears that model instead of the shells it replaces (armour: top, trousers, skirt; boots: boots; gloves: gloves): one
textured skinned mesh on the same armature, its vertices moved into the body's bind space and its
joints remapped to the body skeleton by name (`prepareChibiOutfit`, `fitOutfit`), with the body's
toon material and outline. A gloves model is skinned to the finger bones (its weights taken from
the body's nearest point), so it closes with the hand inside it. The body triangles a gloves model covers are left
out of the body's index while it is worn (not tucked: the chibi's mitten hand showed between the
glove's separate fingers). In Godot draw the body with those triangles removed. An armour model with `cloth`
(`characters.hero_chibi.cloth` its defaults) swings below the waist (`render/chibi-cloth.js`): every
vertex under `pivot` (bind height) hands its Hips weight, blended in over `ramp`, to the two nearest of
`panels` bones by its angle round the hips (the four largest weights kept); each panel bone is a child
of Hips on the waist ring, its bind frame x along the ring, y up, z outward, so at rest it skins
exactly like the Hips. Every frame each panel's hem (its lowest weighted point below the pivot) is a
point in world space on a spring toward its rest place (`stiffness`, `damping` against the rest place's
own velocity, `drag` against the world, its speed against the rest place capped at `speed`, a teleport
over 1 m resets it); its offset becomes the panel bone's turn out about x (`out`, inward at most `in`)
and to the side about z (`side`), the clamped offset carrying the waist's speed. In Godot add the panel
bones to the Skeleton3D and set their poses after the animation, or use a SpringBoneSimulator3D with one
joint per panel and the same limits. Its node extras `hideBody` list the body triangles it covers; while it is
worn those body vertices are tucked `underCloth.inset` inside the cloth along their normals (`coveredBody`;
a vertex is tucked only when every triangle round it is covered) and drawn at `underCloth.under` of its
light (a `tucked` vertex attribute) and pushed `underCloth.depth` further from the camera along its view
ray in the vertex shader (body and outline hull), so the cloth always wins the depth test, the skin
cannot poke through and a gap shows shade, never the background. The arm inside a sleeve takes that
shade gradually over its last 6 cm to the sleeve's end (`sleeveEnds`, `CUFF_SHADE`), so the arm seen
through the opening is skin in shadow, not a brown stain. In Godot do the same in the body's
spatial shader (VERTEX in view space, scaled along itself). The glove shells (and boot shells
where no model replaces them) tuck the body the same way: the body triangles wholly inside a shell's
region are covered and every body vertex inside it is pushed back in full (the shell's edge falls
inside the body's edge triangles), and the shell keeps every triangle reaching into the region (`regionShell` `any`)
while its shader discards past the region's line (`uCutD.w`, margin `uCutD.y`), so its edge is
straight, not the body's triangles. Garments and modelled helms draw their back faces in their texture's mean colour (its smallest
mip; with the outfit's `localInside`, each point's own colour, where its texture is
shared by several cloths, as the Travel set's) at `underCloth.inside` of their light, so a hollow pad or open collar reads as shaded cloth.
An outfit's `neckline` (the Travel Tunic's) cuts its crumpled generated collar away per pixel by a
plain shape in the body's bind space (`necklineCut`, `neckEdge`: a V in front and the round of the
neck), edges it with a teal `trim` band, and leaves the body under the opening untucked (plain skin);
in Godot pass the bind position to the fragment shader and discard the same way (cloth and outline). The models load
when first worn (like weapons) and the hero is redressed when one arrives. A modelled helm
(`chibiOutfit` "helm") is a plain mesh of the headwear only, placed on the head bone exactly as the
default hair (`hero_chibi_hair`, the frame every helm is made in) is, whatever the chosen hair style, and drawn over the hero's whole hair, each hair point the helm's surface lies in front of (seen from the head's middle) pulled back just inside it, so no hair pokes through and none is cut away; one marked `withHair` (the feather circlet) is a band drawn
over the whole hair, taking the hair's own per-axis scale. In Godot attach
the mesh to the body's `Skeleton3D` and draw the body with those triangles removed (or a mask). Each frame the skin hand turns until its thumb runs along the weapon's grip axis (+Z, or +Y
for a bow) and the socket moves to the fist's hole. In Godot,
import the GLB with its `Skeleton3D`, recompute smooth normals on import, apply the same torso
flatten, head reshape and normal bend, scale the hand
attachments, pose the same finger bones and apply the same hand turn
and seat after the retarget.
Its hair (`characters.hero_chibi_hair`, cut from the Travel Tunic's dressed chibi by
`scripts/fit-chibi-hair.py`, its own painted texture) is parented to the head bone and fitted per
axis to the head's bind bounds (`fit`, from the hair's fixed `box`); under a helm other than a
circlet or a cowl (`headwear.js` `HAIR_WHOLE`: the moonleaf cowl is a collar round the neck) the
hair above and behind `underHelm` is not drawn, so it cannot poke through. In Godot
attach it to the head bone with the same scale and offset and the same under-helm cut.
The look's other hair styles (`network/protocol.js` `HAIR_STYLES`) each have their own model
(`characters.hero_chibi_hair_<style>`, `chibiHairStyle`, `public/models/hair/`), loaded when first
chosen (`render/models.js` `chibiHair`). Each is fitted to the chibi head once per body and hair
(`chibi-body.js` `fitHairToHead`, with `fit.tuck`, and `fit.tilt` leaning it back): seen from the
head's middle, a lock inside the face (`hero_chibi.face`) moves out over it, and the rest of the head
(the ears under a hair that covers them, `hero_chibi.ears`, and the skin just under the head joint)
moves in under the hair, so the head never shows through any hair. The head's vertices at one place
(split along its texture seams) move as one, so no seam opens. The head is drawn on both sides (its
steps inward under the hair would otherwise open holes at the hairline); its shadow keeps the back
faces. The head under the hair is drawn in the hair's shade (0.3 of the hair colour,
`hairShadeMaterial`), decided per pixel: the hair's triangles near the head are drawn once into a
192 x 96 map of the directions they cover from the head's middle (red: closed over gaps up to 6
cells, so a gap between locks reads as hair in shadow, never as scalp; green: the hair's own
directions, for the forehead, whose skin shows between the fringe's locks; both with every uncovered patch the hair
encloses filled (any under a tenth of the face-and-neck patch: a fringe's gaps run into the face and
stay), then taken in 5 cells from the hair's edge, so the head just under the edge shows skin, as a
hairline does; blue: how far out the nearest hair lies, so near the hair's edge a pixel is shaded only
with hair within 0.1 head widths over it and the head seen from below under a side lock standing off
it is skin, while 10 cells inside the edge it is shaded however far a full style's hair stands), and each pixel of the head looks its
own direction up in it, so the shade ends where the hair does, not along the head's large triangles.
The body's `underHair` vertex attribute picks the map (1 red, 0.5 green, 0 none): a part of the head
may be shaded only if it was taken in under the hair or the hair lies within 0.1 head widths over
it, and never the neck just under the head joint (`headTuck.neck`), seen between the locks hanging
past it, nor an ear left out and the skin within 0.15 head widths of it. Both ears fold away when the hair
covers at least half of either (a style shows both ears or neither), and then each of their points
goes to the nearest head point that is not ear (by direction, just inside it), so the ear closes to
nothing: sunk in it left a pit, pressed flat its crumpled triangles turned their backs to the light,
both drawing a black ear. A style that covers neither ear keeps both. In Godot, run the same
fit once when the look is chosen and keep the moved hair and body meshes, that attribute (e.g. in a
vertex colour channel), the direction map (a texture) and the mesh-to-head-middle transform. The hair is tinted to the
look's `hair` colour (any hex, picked on a colour wheel, `ui/color-wheel.js`) and drawn flat, as the
owner's sheet draws it (`hairColorMaterial`): no soft light, gloss or rim, only one hard cel shadow
tone (0.7 of the colour) where the sun does not reach it. Of the painted texture only its strand lines
darken the colour: each texel's brightness over a coarser mip's (its surroundings), so the generated
paint's broad shading and blotchy light are dropped. The hair casts no shadow (the sun's shadow map laid its locks over the face in dark blotches); the head under it casts the hero's shadow on the ground. The look's
`face` (`FACES`) draws one of the owner's faces (`public/models/faces/<id>.png`) over the painted one
(`faceDecalMaterial`, by the face-shadow coordinates and `hero_chibi.faceDecal`); in Godot draw it as a
decal pass or a second texture in the head's shader. The look's `eyes` recolours the irises
(`eyeColorMaterial`, `hero_chibi.eyeColor`): its first swatch (`own`) keeps the painted colours; any
other recolours a drawn face's iris by its mask (`public/models/faces/iris/<id>.png`, made by
`scripts/face-iris-mask.py`) and the painted face's where its paint is bluer than red on the face's
front, keeping the iris's painted shading (its brightness over `ref` scales the chosen colour). The
look's `tunic` colours the starting shirt (`travel_tunic`, palette "$tunic"): on the modelled outfit
its bright, pale cloth texels (`outfit_travel_tunic.tunicCloth`) are multiplied by the chosen colour
over `ref` (`chibi-garments.js tunicCloth`), so the trim, leather and painted folds stay. Character creation shows the hero alone in a
plain studio scene (`view.js` `createStudio`), straight from the front, zooming to the face while hair,
face or eye colour is chosen (`createFocus`) and shifted clear of the menu panel (`createInset`). There it stands in its own stance (`HumanoidAnimator.stance` = `creation` in `data/weapon-holds.json`, the owner's pick of a reference idle), not the unarmed fighter's. It is the shipped hero, by the owner's choice; NPCs keep normal proportions. The worn helm can be hidden (`ch.hideHelm`, toggled beside the helm slot; looks only, `gearLook` drops it).
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
`Animation` with a method track (or signal) at the hit (`data/action-clips.json` holds actions
retargeted from CC0 clips as plain key lists, with the blade's `sweep` for the slash effect;
in Godot the source clip itself can be retargeted onto the hero's `Skeleton3D`), and use `SkeletonIK3D` (or a
two-bone IK modifier) for the ikL/ikR/grip channels.
How the hero carries each weapon type is data (`data/weapon-holds.json`, read by
`render/hero.js`): a right-palm target and a weapon direction in body space, a `one` carry
(left hand busy) and a `two` grip whose left palm IK-targets `grip` metres along the weapon
(heavy axe/mace with nothing in the left hand, greatblade). Melee actions add a `swing`
channel `[angle, elevation, height]` with weight `sw`: the right palm follows a circle of
`swing.radius` round the body and the blade points outward along it, keyed so the cut runs
the same way and at the same time as the approved crescent (steps 1 and 3 lower right to
upper left, step 2 reversed). During a non-swing action a `castHold` staff or a two-hand
weapon keeps its carry angle while the arm gestures, and the two-hand left grip lets go
(not a carry with `keepGrip`: the greatshield keeps both hands on its bars). An action's `reach`
channel `[x, y, z]` (body-space metres) moves the carried weapon's palm while the carry keeps its
facing: the greatshield's shove (`greatshieldShove`) pushes the shield out that way. A greatshield's
weapon frame puts the right bar at the grip, the left bar `grip` along +Z and the face toward +Y;
both fists turn their thumbs along the upright bars (+X).
The standing pose is a neutral base plus the carry's `stance` (`stances`: `relaxed` shifts
the weight onto the right leg, `guard` is the staggered two-hand ready stance): bone offsets,
a body `drop` and sideways `shift`, faded out by the walk/run blend. Port as an idle pose
added under the locomotion blend. A stance with `_from` (`sword_ready`, `two_hand_ready`: the chibi's
sword and two-hand carries) was retargeted from a CC0 reference clip (`docs/POSE-RETARGET.md`); in Godot the same
clip can drive the pose through a retargeted `Skeleton3D` instead.
A `dual` carry (a light weapon in each hand) adds `left`: the left palm target and the left
weapon's direction and flat, solved like the right (`solveOffhand`: left-arm IK plus a look-at on
the off-hand socket) whenever no action drives the left hand.
A carry's `run` (the chibi's sword trailing low behind, heavy weapons dragged in the right hand
with the left grip released, the dagger's crouched run lean) is blended in by the move weight:
in Godot, a second carry pose and lean added under the run blend space. A run carry with `arms`
sets the carrying arm's channels itself (no hand IK, the wrist straight), `socket`/`roll` turn the
weapon attachment in the fist (Euler x/z), and `reverse` turns the skinned fist's thumb toward the
pommel (the seating in `chibi-body.js` turns the thumb's target half a turn about the hand's x).
Port as a right-hand IK target with a look-at on the weapon bone, blended by these weights.
`render/dropart.js` caches one billboard texture per material, matching its inventory art.

Input gestures in `ui/input.js` are presentation behaviour: tap to cast, drag to aim,
release over the cancel zone to cancel. Pointer cancellation, lost capture, focus loss
and opening a menu clear held actions and movement; they must never cast a skill.
Keep this behaviour in the Godot touch controls. `tests/browser/ux.mjs` exercises the
menu workflows and these interrupted gestures at desktop, tablet and phone sizes.

## Dungeon maps (Pearlshell Grotto, entered from the Singing Conch)

The way in is a map landmark with `dungeon: {id, r}` (`giant_conch` in `frontier-wilds.json`): within `r`
`OpenWorldGame.nearby().dungeon` names it and `enterDungeon(id)` (near, alive, not in combat) emits
`enterDungeon`. The web build then saves the slot, keeps the trip (slot or unsaved character, look and gear)
in sessionStorage `frontier.dungeon` (`save.js` `stashDungeon`/`peekDungeon`/`leaveDungeon`) and opens
`dungeon.html`; the grotto's `to: "game"` link hands the trip back as a map trip (`frontier.travel`) and the
game reloads the character where it was saved, beside the conch. In Godot change scene to the dungeon with
the same character and back, restoring the saved position.


`src/core/dungeon.js` reads `data/dungeons/*.json`: flat floors at fixed heights (a polygon with
holes traced from the concept by `scripts/grotto-trace.py`, circle, ellipse, smoothed path, stairs
ramp), the last floor containing a point is the ground. Polygon tests bucket edges in 1 m bands. A step is walkable
when both points are on walkable floors within `maxStep` (0.45 m), so ledges are walls and stairs
join levels; props block with circles from `propTypes`. In Godot: build each floor as a
`CollisionPolygon3D`/`StaticBody3D` slab with its side walls, stairs as ramps, props as
`CylinderShape3D`; or port `surfaceAt`/`move` directly for a CharacterBody3D that ignores physics.
Links are `Area3D` doors (a secret one is disabled until `inspectAt` finds it; the grotto has none since the beach preview was dropped). Stair joints: each end gets an apron overlapping the flight 0.3 m, bridged over a void to same-level stone and cut out of the water below it, and no rim pillar stands on a flight's line. The renderer's
pieces map to a `MeshInstance3D` per floor material, `MultiMeshInstance3D` for the rim boulders,
a water shader with the same uniforms, and `OmniLight3D`s. Rooms with `style: "cave"` are dressed by
`public/models/grotto/grotto-cave.glb`, a render-only model that `scripts/blender/grotto-cave.py` builds
in world metres from the floor outlines: per floor `cavefloor_<id>`, `cavewall_<id>` and `caverock_<id>`, with
ambient occlusion baked into vertex colours. Floors with `walls` (every room but the entrance) also get `cavewall_<id>`/`caverock_<id>`, only along the edges that meet the void, coarser and lower (rock islands at most 2.4 m); their drops keep the generated ledges. Import it as it is (`MeshInstance3D`s with a cel material
that multiplies vertex colour); collision still comes from the floors, never from this mesh. In every room the
`coral` props and the corals at the foot of the walls are the painted corals of `public/models/grotto/glow-corals.glb`
(`scripts/blender/grotto-corals.py`): per coral `coral_<name>_body`, cel-lit with half its own vertex colour added as
emission, and `coral_<name>_glow`, unshaded vertex colour (tinted #d0d0d0), each standing on its own origin; place them
with `MultiMeshInstance3D`s. They grow in clumps (`clump()` in props.js: one coral of the asked colour, 2-4 smaller mixed ones at
0.3-0.65 of its size around its foot, along the wall at the rim, clumps never overlapping), and each clump lights the floor with a flat
additive pool (`coralPools`), as do crystals, the coral tree, the sealed arch and the pearl altar, instead of a camera-facing halo. A map colour picks the coral (`GLOW_BY_COLOR` in `src/render/grotto/props.js`).
The other props are `public/models/grotto/grotto-props.glb` (`scripts/blender/grotto-props.py`): per prop `prop_<name>_<kind>`
meshes standing on their own origin, where kind is how to draw it: `flat` (cel, flat shading) and `smooth` (cel, smooth),
`shine`/`shinesm` (the same plus half of the vertex colour as emission), `glow` (unshaded vertex colour, both sides). Map
types to props as `buildProps` does (pillar, pillarBroken → pillar_broken, fallenPillar → pillar_fallen, arch → arch / arch_shell in turn,
sealedArch → arch_sealed, crystal → crystal_s/m/l by scale, coralTree → coral_tree, bigPearl → pearl_altar, chest → chest / chest_open
in turn, candles, barrel, crate, post); collision stays the `propTypes` circles. Each `waterfalls` entry has `kind`: `ledge` (pours over the edge at
`at` toward `facing`, curving out about 0.25 + 0.55·sqrt(fallen m / 3)) or `wall` (runs down the cave wall from `top`); both widen
to 1.15× at the foot. Stairs are cut out of the floors they cross; the floors in the data are already cut to each flight's sides and squared at its ends (no overlap); draw ~0.15 m steps (at least 0.4 m deep) the game's way: each step a course of cut grey stones about 0.9 m across, square to the flight, its joints offset by half a stone on every other step, its front edge standing proud as a riser, and a 0.45 m cheek stone at each side; no edging stones beside a flight; the collider stays the ramp. A `rubble` prop
(no collider) marks where the stone over the water broke away along the paving joints (the traced floors already have the
stepped bite); its `stones` ([x, z, w, d], metres) are the pavers that fell: draw each as a 0.22 m slab, its top textured
from where it lay (uv = position / `PAVING_TILE` (6 m), as the floor), slid out along `rot`, tipped down toward the water (some leaning on the
edge, half out of the water), plus a few chips; leave the edging stones out within 1.4·scale + 0.7 m of it. The paving layout
is `flagstoneCourses()` (`scripts/grotto-paving.mjs` prints it in metres). Edging stones elsewhere age by
a hash of their index (13% missing, 17% tipped outward, the rest leaning a little); stone floors get worn-paving decals,
about one per 45 m², off the props and inside the edge. Floors, walls, rocks and steps use the game's
painted stone (`src/render/grotto/game-paint.js`, the accepted scenes' `paint()`): three tones from the sun
direction and the shadow map (shade/mid/lit tints in `look.paint`), the surface's vertex colour pulled into the
game's grey stone (`sat`, `tint`, per-kind `gain`) and fading to `floor` below -2 m; rocks carry a back-face
outline in `ink`. The cave is dark: the painted light is scaled by `dim`, the point lights add `lamp` x their
attenuated light (a soft wrap), each surface kind may have its own `tints` (the cave rock is dark), and the glow
pools on the floor use `look.glowPool` [opacity, size]. In Godot this is one `ShaderMaterial` with those uniforms
(point lights through `LIGHT` in the light() function).
The boss stage is `inside.arena` (written by `grotto-trace.py`): the throne room and its dais are one open stage of
stone (2.0, the dais an exact 13 m circle, a 96-corner polygon) and wading water (floor 1.6), one step apart; `floors` lists them, `floor` is the dais, middle `at`, `r`, `clear` (radius kept free of
blocking props), `boss` spot and `bossFacing` (toward the `entry` stair), and the `throne` (the pearl altar behind the boss).
The `bossSnail` prop (the boss's model, solid) is placed on that spot facing `bossFacing`; spawn the boss there and keep its fight inside `clear`. See `docs/SHELL-GROTTO.md`.

The grotto's monsters are `public/models/grotto/grotto-monsters.glb` (`scripts/blender/grotto-monsters.py`, Meshy shapes with Meshy 6 textures):
`mon_<monster>_<part>` for fish (body, tail, finl, finr), slug (body, cerata, pearls), clam (shell, eye, pearls) and the boss, out of its shell
(boss: body, eyel, eyer, pearl) and hidden in it (bossshell: shell, pearl), each on its own origin facing +Z with its monster's texture. Draw them
cel-shaded over the texture with a little self-light (0.2, pearls 0.45, boss 0.06, its pearl 0.3) and hang the moving parts from pivots as
`monsters.js` does. `pearlFish` props lie stranded on their left side in the shallows, flopping (`strandedFish`: a hop every 1.7 s, the tail
slapping, a small turn per flop); `pearlSlug`/`eyeClam` idle. The `bossSnail` sleeps in its shell until a prop with `talk: {r, labelTh, lineTh,
wakes}` is used: `dungeon.talkAt(x, z, woken)` offers the throne's pearl within `r` until what it wakes is in `woken`; then the shell trembles
1.1 s and the king pushes out (0.8 s) and stays out (`sleepingBoss`). In Godot keep `woken` with the dungeon run and swap the two scenes the same way.

Monsters with `propTypes.<type>.walk` wander about their homes (`src/core/dungeon-monsters.js`, seeded): rest `rest` s, pick a
spot within `wander` m (or inside the arena for `arena: true`) where their body (the largest of their collision circles) fits
(`standY` with that radius), turn toward it at `turn` rad/s (a turn over 0.6 rad is made on the spot), then go. Gaits: `crawl`
at `speed` m/s; `hop` moves only while airborne, `length` m per hop of `air` s, one hop every `every` s (`air` 0..1 is exposed
for the animation). `stay` keeps them on one floor kind. They never step into another prop's circle or onto the hero, and
their own circles (`propBlockers` keeps `src` and the unturned `local` offset) move and turn with them, so the hero collides
with the moving monster. A sleeping walker (`asleep`) does not move until `wake(type)`, then rests `wakeRest` s. The renderer
reads x, z, y, facing, moving, air, gaitT and travelled: the fish flops along (one arch per hop, alternating sides), the slug's
body ripples with distance, the clam crouches, leaps, tips forward and squashes on landing, the boss surges with distance.

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
- Sea water (27 October 2026) is the arrival beach scene's water (`scenes/beach` `buildSea`), lifted
  whole and worked in the scene's units (0.8 m): `dz` = shore distance / 0.8, `wet` = distance
  inside the moving edge / 0.8, depth = clamp(dz * .36, 0, 2.7). Colours pale green #93dfbf,
  turquoise #45d0c4, cyan #2cbfd0, blue #1b97c3 (settling deeper 30-90 m out); the light web
  (rounded Voronoi cells, one cell size 1.45, since depth-scaled coordinates shear into streaks at
  map coordinates; thinner past 25-70 m out); twinkling sparkles; fine messy foam (a ragged holed
  rim at the moving edge, tangled threads seaward, and rings round every water contact: rocks,
  piles, hulls, walls); cloud shade; the scene's sea grade (saturation 1.2, contrast 1.16 on sqrt
  colour). The edge's run-up and the harbour's curved crests stay the map's own.
- `river.depth` and `river.bankWidth` produce an ankle-deep bed with gentle banks. Keep the
  rendered water and movement masks separate when porting. Do not add a blocking river strip.
- `render/ground.js`: small grouped grass strokes, warm earth, bevelled paving, mossy cracks,
  cliff strata and shore foam.
- Fresh water (`render/ground.js` `waterMaterial`, 27 October 2026), streams and ponds, in the
  sea's cel style: soft depth bands on a per-vertex `tone` (a pond's depth, a stream's channel),
  bed mottling in the shallows, sky patches on a turned warped domain, on ponds only, the arrival beach
  scene's light web (rounded Voronoi cells, nearest/second-nearest ratio, pale-green gaps that fade in
  patches; one cell size, since scaling world coordinates by a depth-varying factor shears the
  cells), sparse twinkling glints,
  and a broken foam lace of constant width at the waterline (`shore`: metres to the waterline per
  vertex, from the bank's real zero crossing across a stream row, or the pond bank's 0.55 m/m
  rise), which laps by a few centimetres. Streams carry `along`/`across` flow metres (`flow` 1)
  and draw thin meandering current lines whose tapered dashes travel downstream; ponds (`flow` 0) draw slow drip rings. Ponds are polar meshes about
  0.6 m apart out to their rim plus 1.6 m of bank. Pond outlines: a pond is `[x, z, r]` or
  `[x, z, r, wobble]` (`core/ponds.js`): wobble bends the rim with four fixed harmonics seeded by
  the centre (mean radius r), and terrain carving, `inPond`/collision, the apron fade, the mud
  paint and the water mesh all read that rim. Pond water ends at the carved bank's waterline
  (0.64 m past the rim) even over lower ground. A scene that exports `pond` (Mirror Pond) is drawn
  to its 72 radii instead of its collision circles. In Godot use one shader with the same
  attributes as custom vertex data and `TIME`; there is no per-frame mesh work.
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
Keep the actual portrait, spell shield (white, shown only when `maxShield` > 0)/HP/barrier/MP, all four combat slots, separate movement charges,
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
When changing quality, update and release shadow buffers as well as DPR.
Graphics settings (owner, 29 October 2026; `rendering.json` -> `graphics`,
`src/ui/graphics-settings.js`): presets low/medium/high (low 0.85 and medium 1.25
drawn pixels per screen point, high 2) or `custom`, where resolution, shadow size,
the screen grade and dynamic resolution are each chosen from listed values.
Anti-aliasing is a separate setting for every preset (off, x2, x4): the WebGL
canvas is never multisampled; the scene target's samples are the setting, and with
the grade off the target is only resolved and copied. In Godot, map this to the
viewport's `scaling_3d_scale` and `msaa_3d` (disabled/2x/4x). See `RENDER-LIGHT-SHADOW.md` and renderer regression tests.

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

`shoreZ(x)` and `sea.shore/edgeKinds` remain the fallback for existing single-valued shores. Optional `sea.coastline` is an ordered coastal contour used for capes that genuinely require multiple land/water intervals at one X. Close its two distant northern endpoints for even/odd containment; that closing mainland edge is outside the playable/heightfield bounds and is not a surf segment. `seaContains()` uses the contour interior as land. `coastSample()` takes the nearest real coast segment and signs its distance with that same containment (positive inland). `sea.coastKinds` has one tag per real segment: beach, rock, quay, breakwater or shipyard. On long contours (more than 64 points) both queries use a cached index (runs of 16 segments with bounding boxes for the nearest segment, z bands for containment); a port may do the same, but the answers must equal the brute-force loops, including the lowest-index tie rule for the segment kind. Do not infer water from a single `shoreZ` intersection on this layout.

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

Core `hit` events optionally carry `skill` and `attackKind`, and `slash`/`whirl` carry `skill`; these are cosmetic profile selectors, with no damage/range/timing/save change. Use `combat-fx.meleeDefaults` or an authored `renderer: melee` profile. Prepare timing controls weapon-trail sampling, never gameplay contact time. At authored contact, render a thin tapered moving blade ribbon inside the real range/arc and a sparse directional contact fan. The second swing of a pair reverses the cut. Whirl uses two opposite half-cuts, without an expanding blast ring. Sample actual posed weapon base/tip for the short trail, clear on cancellation, and bound/reuse contact particles. Keep brief contact shake/hit-stop in the view layer. Shared Lab controls generate from this profile and replay melee kinds without additional skill menus.

### Other physical skill presentation

`combat-fx.skills.hunter_shot` (`renderer: arrow`) defines bow draw, the wood/metal projectile, a thin tapered speed streak and one directional contact. Player projectile impact events now carry optional `vx/vz`; no speed/range/collision change. Suppress the duplicate `hit` contact for this skill. Converted arrow streak/contact colours follow the existing element; multishot, pierce and chain continue through existing projectile rules.

Stone Burst (`renderer: stone`) retains `castTime + delay` and the exact area radius. Reveal terrain-conformed radial cracks during the delay, pop faceted stones quickly at the burst, then return them below ground while bounded instanced chips follow gravity and shrink. Shared rock templates remain alive; conformed crack geometry belongs to its marker and must be freed. These meshes and debris never extend damage duration.

Spirit Wolf (`renderer: spirit`) has a small inward summoning mark and two short converging bite cuts. Core emits optional `allyStrike` only for a successful bite after the existing .25 s wind-up; `hit` carries `skill: spirit_wolf`, `attackKind: summon` and the actual ally source position. Keep these selectors cosmetic. The view snaps its existing jaw/body pose briefly during recovery. Lab reuses the same rig and a presentation adapter, without persistent combat AI. No new skills, save schema, summon lifetime, movement, damage or contact rules.

## Shop, potions and quick item slots (save v7)

`core/consumables.js` holds the rules; `data/items.json` → `consumables` (types, `groupCooldown`, `stackMax`, `quickSlots`, starter set) and `shop` (`stock`, `buyAmounts`). Each map's `town.shop` is where the player stands to buy (`Game.nearby().shop`, same radius as the workbench) and `town.shopkeeper` is the merchant NPC `[x, z, facing]`. `Game.buyItem(id, n)` spends gold atomically and fills the first empty quick slot; `Game.useQuickItem(slot)` restores `flat + pct × max` HP or MP at once, refuses a full bar (no wasted potion), and starts only that group's cooldown (`player.itemCooldowns`). Saves are `version: 7`: `ch.consumables` (`{id: count}`) and `ch.quickItems` (four ids or null); v6 saves get the starter potions once. In Godot, keep the two dictionaries on the character resource and drive the four HUD buttons (keys 5–8) from them.

Potion presentation resolves `${group}_potion_${size}` through the supplied PNG registry under `assets/icons/consumable/`; `ui/potionart.js` retains the authored SVG for definitions without a registered PNG. Shop cards, slot selection and HUD buttons share this resolver. Preserve each 512px canvas and its transparent padding when importing into Godot: the small/medium/large progression is painted into the image, so fit the complete texture rather than cropping to its alpha bounds. The five mid/high monster parts (`mantis_scythe`, `viper_scale`, `ram_horn`, `dusk_pelt`, `rune_core`) similarly resolve supplied PNGs through the material registry for inventory, recipe costs and ground loot. Item IDs, counts and save fields stay the same.

Mod ranks are not gated by character level: only materials, gold and the stat requirement count. A skill's level is capped by the character's level (skill level above); the balance model assumes a skill at the character's level (`core/balance.js skillRankAt`).

## Rendering performance (static batching and dynamic resolution)

`render/static-batch.js` runs once after the scenery is built and the water contact is baked. Static meshes whose materials are the shared toon colours, their outline hulls or the shared feature-edge lines are merged per 24 m map cell: each part's colour (and outline colour) becomes a vertex colour, so one vertex-coloured toon material and one outline material draw a whole cell, and a surface and its hull share one merged geometry. Wind-patched, walk-surface, transparent, instanced, skinned and moving objects (waypoint crystals) are left alone. Emptied groups are pruned and the static subtree's matrices frozen (`matrixAutoUpdate`/`matrixWorldAutoUpdate` false). In Godot, use merged static meshes per cell or MultiMesh with vertex colours; the look is identical.

`render/resolution.js` (`ResolutionGovernor`, settings `rendering.json` → `dynamicResolution`) lowers the render scale step by step when the average frame time stays above `slowMs`, never below `minScale` or 1 device pixel per CSS pixel, and climbs back once frames run at the display's own rate (average within `vsyncSlack` of the shortest recent frame, since requestAnimationFrame never beats vsync) for `recover` seconds; a step up that is followed by a slowdown doubles that wait, up to `maxRecover`. A device that holds the target stays at scale 1. It is off under browser automation (`navigator.webdriver`) and with `?dynres=0`. In Godot, use the viewport's `scaling_3d_scale` with the same thresholds.

`tests/browser/gpu-bench.mjs` times fixed scenes through to GPU completion and the CPU submission separately (SwiftShader: relative before/after only, not iPad FPS); it fails if any shader errors are logged.

Resident static chunks also use each drawable's conservative world-space box for
camera and shadow culling, rather than a loose enclosing sphere. Include shader
wind, water and outline displacement in the AABB, update it when the region root
moves, and preserve authored dynamic/culling branches. In Godot, use the equivalent
conservative `custom_aabb` on the static geometry; do not shorten the bounds to a
grass batch's current visible instance count. Medium keeps its existing shadow
size, filtering and screen grade.

Once a static resident buffer reaches the GPU, its CPU copy is dropped
(`releaseResidentArraysOnUpload`, `render/resident-geometry.js`): holding both for
every map ran the iPad out of memory. Bounds are computed first. Grass, shared
templates, skinned/morphing, dynamic-usage, interleaved, points/lines, waypoint
stones, NPCs and animated parts keep their arrays. Because a restored WebGL
context could not re-upload them, a lost context saves and reloads the page
straight back into the game (at most once every three minutes). Godot keeps
imported mesh data on the GPU only by default, so no equivalent step is needed.

## Finite terrain joins

Finite terrain joins: the two linked maps' decorative heightfields have different
extents. Use the neighbour's actual grid footprint when deciding which native
terrain cells it can replace; water aprons retain the separate full-edge clipping
rule. In the closed-end decorative strip, construct private render height samples
that meet the adjacent playable map and finite grid cap. Preserve all playable
vertex heights and the rule/collision heightfield. Seat retained edge-tree
instances on their actual rendered owner's surface. Exterior backdrop trees must
not stand inside an adjacent region's full playable rectangle, including corners
outside a seam's span, nor in that region's sea (within 2 m of its coastline); omit only those render instances, preserving native trees
and collider/layout data. See
`TERRAIN-SEAM-REPAIR-20261007.md` and `render/terrain-domain.js`; this is tested for
the current aligned one-metre map grids, not arbitrary irregular tessellation.

## Screen grade (post-process)

`render/post.js` (`PostFX`, settings `rendering.json` → `post`, on per preset with `quality.<name>.post`, off on `low`) draws the scene into a multisampled sRGB target (samples = the anti-aliasing setting), makes a quarter-size bright pass for a soft glow, then one full-screen composite: glow, display-space saturation and contrast, split toning (cool `shadowTint`, warm `lightTint`; 50% grey is neutral), a haze toward the top of the screen in the zone's fog colour lifted by `hazeLift`, a warm screen-blend sun wash centred at `sunWashPos` (screen UV, top-left, the sun's side), a vignette and a 1/255 dither. Models and materials are unchanged; `?post=0` turns it off for comparisons. In Godot, use a `WorldEnvironment` (glow with the same threshold, adjustments for contrast/saturation) plus a screen-space `ColorRect` shader for the toning, haze, sun wash and vignette.

## Local city cohesion presentation

The local city review uses original native timber for all city piers, with `city-v3.docks[].shoreCut` giving the two landward cut coordinates in pier-local Z. Clip the same deck assembly to that shore segment and keep its posts waterward; never overlay separate crossbridges. Walking support across a flush edge is the union of the adjacent deck and stone: `dockAt` may select a deck touching an actor's radius even after its centre reaches the shore, then checks all sixteen boundary samples. Point-height queries still select only the surface under the centre. `boatBerths`/`propOffsets` describe render placements, not new game systems; `materialColors` (by source material name, e.g. indigo timber → wood) and `meshColors` (by part name, e.g. the ship's teal stringers) recolour imported city art and dressing at load. Imported city meshes with open edges (awnings, canvas, roof skins) render double-sided; closed solids stay front-faced. Source `Coastal weathered rock` nodes are kept only when they stand in the game sea at least 3 m clear of the city floor, so none poke through paving or sit against the quay. Paving/soil masks, black building contours and fountain flow/ripples/splash are presentation only; use baked masks, static merged buffers and shared shader time in Godot. Keep EXP/Job, saves, NPC anchors, approved building/street layout and native coastline unchanged.

## Reviewed directed journal graph

`jobtree.presentation.stages/groups` indexes the shared first page and free later gateways. New skill `requires` lists are ALL-parent directed prerequisites in `Character.gd`; legacy nodes keep adjacency and profession rules. Keep ownership IDs; revision 3 uses the preservation/refund rules below. Layout, paper motion and success-only dashed ink are presentation; they never allocate points. See `REVIEWED-SKILL-TREE.md`.

`core/job-route.js` adds a read-only route plan and atomic `allocateJobRoute` transaction. In Godot, collect ALL missing named ancestors only inside the selected presentation group and stage; reject outside ancestors even when owned. Run canonical `allocateJobNode` on a scratch ownership/points dictionary, reject gates, invalid or ambiguous graphs, insufficient points and stale preview signatures, then commit ownership and points together. Notify/persist once after success. Current costs remain one point per node and saves retain version 12; no rank or reward model is added. The journal previews pending nodes with solid outlines and draws finite dashed ink only for confirmed acquisitions.

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
Outside the town zones (`1 - town` mask) a road blends into the meadow: its earth weight is `smoothstep(.10, .95, edge)` instead of the town's `smoothstep(.40, .54, edge)`, scaled down by noise-broken grass (`.18 + .62 * (1 - smoothstep(.25, 1.05, edge + noise))`), and the darker under-overhang line is 85% weaker (owner, 26 October 2026: no hard road lines in the country).
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
unchanged gold. Skill levels take `skill_crystal`, `skill_crystal_m` and `skill_crystal_l` as EXP
(see Skill level), and `modUpgrade.cost` uses the small crystal (2/3). Never interpret these as Grade;
existing grade-promotion costs and base crafting recipes remain unchanged.
`rollDrops` appends `items.upgradeMaterialDrops` to monster/zone drops, with the
same seeded RNG and material-find multiplier (3% stone, 6% small and 1.5% medium skill crystal, quantity 1; bosses drop one large crystal).
Minions still award gold only. Gear salvage creates no base stones/crystals at any grade, keeps existing recipe-part
refunds and returns floor(50% of the total enhancement stone investment), e.g. +5
uses 16 and refunds 8. Legacy +N items receive
the same current-cost refund; no historical payment ledger is introduced.
The existing sparse `character.materials` dictionary already persists both IDs;
no schema/version change or conversion of old parts is needed. Missing keys are zero.
The two RGBA PNGs are mapped in `raster-icons.js` for inventory/costs and ground loot.

### Independent skill groups (tree revision 3)

Chapters are navigation only (`presentation.stages[].gate = 0`), not group tiers.
Every visible page group is its own canonical purchase scope, including each
`view.*.<chapter>` and `view.*.mastery` page. `allocationGroup` owns eligibility;
`localInvestment` counts distinct paid IDs only in that group. Roots need no
other group, prior chapter, profession or global investment. `requires` is ALL,
`requiresAny` is ANY; all active edges and auto-purchases must remain local.
Directed roots bypass legacy adjacency. Reject malformed external parents even
if they are owned. Simulate an entire route before committing points/ownership.

Keep character version 12 and stable node IDs. Tree revision 3 preserves known
non-retired allocations, including legacy IDs and allocations missing a newly
rewired internal parent; it refunds each retired bridge or missing ID once and
then stamps the revision. No whole-tree reset. Gear, skills, quests and other
character fields use their existing migrations. The 30 historical bridges remain
in data marked `retired` for traceable refunds, never offered or purchased.

There are 378 active nodes across 51 page groups (origin included), plus 206
legacy compatibility nodes. Nine line hubs on chapter 5 provide regular/mastery
page navigation, with no shared unlock requirement. Mastery now has two local
specializations rather than alternating required bonuses. UI edges, locks,
search, route preview and prose read this same graph; no external bridge proxies.
Keep the journal theme and readable minimum zoom/panning. See
[the complete audit](SKILL-TREE-INDEPENDENCE.md).

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
Retired content ids are renamed on load from data maps (`skills.renamed`, `mods.renamed`; `renameRetiredContent()`): the higher skill rank and each coin's uid/level/grade survive, a duplicate skill slot empties and a duplicate mod id in one slot returns its later coin to the bag. This needs no version bump.
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
  during preparation. Positional hits (`positionalMult` from the side or behind,
  `frontMult` from the front: Flank Thrust is the dagger's quick main stab) and
  non-stacking exposure remain independent.
- `shadowStep` (Backstab, a dagger `melee_arc`): on the press `castSlot` picks the locked
  target in `shadowStep.range` (else the nearest), and moves the hero `gap` past its radius
  behind the way it faces (else to either side, else toward the hero's side), on a free, unsafe
  spot; it faces the target, locks it and emits `shadowStep` (fromX/fromZ, x/z, id). With no
  target or no spot the press fails (`fail`, reason `target`) and spends no MP or cooldown.
  An aimed press (`input.manualAim`: a drag on the button, the mouse) takes only the locked
  target, never the nearest; the touch drag (ui/input.js `dragAim`) picks the monster it points
  at within `shadowStep.range` (`aim.lock`, drawn with the target ring) and locks it on release.
  While the skill is equipped its step range counts toward `acquireRange` (auto-lock).
  Its `positionalMult` 1.5 rewards the stab from behind.
- `stun` (Breakbeat Slam): every direct hit puts the monster in `stunned` for
  `stun.duration` (`bossDuration` on a boss), cancels a started wind-up and its telegraphed
  areas, and emits `stunned` with `duration`.
- `poison` (Venom Arrow, a bow projectile): every direct hit adds one stack up to
  `maxStacks` and refreshes `duration`; the poison deals `stacks × stackDps × hit` per second.
  `poisonStack` is emitted only when the count grows. The stacking is `stackPoison(g, m, poison, amount)`;
  a `dot_zone` whose skill has `poison` (Miasma Arrow) calls it on every tick with the tick's damage.
- Elemental job skills (2026-10-31, `tests/core/elemental-skills.test.js`; plain skills, one element
  each, for the spell archer `spellarcher` and the spellblade): Flame Arrow Rain (`ground_area` with
  `waves`, `burnChance`), Miasma Arrow (`dot_zone` + `poison`), Flame Slash (a wide `melee_arc`),
  Ice Spikes (`melee_line` + `chill`), and three new fields:
  - `shatter` {count, arc, range, mult, speed} on a projectile (Shatter Arrow): when a monster stops the
    arrow (`pr.stopOn`, set in `updateProjectiles`), `endProjectile` fans `count` shard projectiles
    (`shard: true`, same kind, `damage × mult`, their `hit` set copied so the struck monster is never hit
    again) over `arc` degrees along the arrow, then emits `shatter`. Shards never shatter; a miss never
    breaks; a returning or endlessly piercing shot never stops, so it never breaks.
  - `afterShock` {delay, mult, stun} on a `melee_line` (Thunder Lance): `strikeLane` again after `delay`
    on the same lane (fixed where it was cast) at `mult`, every hit stunning `stun` s (bosses 0);
    `lineStrike` carries `after: true` for the second.
  - `discharge` {delay, ahead, radius, mult} on a `melee_arc` (Thunder Slash): `delay` s after the swing a
    `secondaryBurst` (kind `discharge`) of `radius` centred `ahead` m along the aim, at `mult`.
  The build profile counts them (`build-rules.js` castDamage and the per-cast burst).
- Melee arc swings in a row alternate `step` 0/1 within `comboWindow` (animation side only).
  Every swing is the same strike: there is no third-hit finisher, bonus or knockback.
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
invulnerability or landing damage. Its maximum rank is 1. Combat mod sockets follow `slotsByRank`; the movement socket stays 1.

UI uses hold/release and drag-aim on independent pointers, with menu/blur/cancel cleanup.
`render/frontier-fx.js` owns original interim wall, aura and healing visuals (line, guard, rain and flame are now `render/skill-fx.js`);
shared geometry belongs to the view, per-effect materials/geometry are disposed on clear.
Stone Guardian reuses `crag_golem` as an interim silhouette. Numbers, fit tags,
families, granted tags and visual tuning live in data.
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
`town` anchors (workbench, trainer, well, shop) on Moonstone Camp's clearing, with no trees or
surfaces of their own (the scene draws the clearing). Monsters: `fern_ear_hare` (behaviour `hare`), `mirrorwing_moth` (`moth`, flyer),
`rootdigger_mole` (`mole`), procedural rigs in `render/monsters-grove.js`. Each rig now wears a
Meshy model (`data/models.json` → `monsters`, skinned to the same bones by `render/monsterSkin.js`;
the procedural parts remain the fallback until the model loads). The moth's model keeps the concept's
raised wings, which the rig flaps about the body axis; its extra tail from Meshy was cut off.

Accepted scenes (26-27 October 2026): the five approved Moonroot scenes (`scenes/root-warren`,
`moonstone-camp`, `mirror-pond`, `fern-rise`, `stone-ring`) stand where the region concept
(`assets/moonroot/moonroot_grove_concept.jpg`, 370 x 117 m like the map) puts them, staggered rather
than in a row (`region: moonroot-grove-v1`, s 0.42): Moonstone Camp (-108, -8) up on the west, Root
Warren (-150, 36) below it by the Frontier gate (its moles, Lv 9-10, border the Frontier forest),
Mirror Pond (7, 8) in the middle, Fern Rise (66, -26) in the north woods and the Stone Ring (138, 2)
on the east. Winding paths (final connectors, each also a road `moon-path/...` so it is painted,
kept clear of trees and drawn on the map) join every scene exit, the Frontier gate road and the
three Azure seam trails. Zones follow the same woods (`root_warren` west, `fern_rise` north-east,
`mirror_pond` between) and their encounter habitats (`data/encounters.json`) moved with them. Map
look: `look.foliage` gives the map its own leaf and shrub [shadow, mid, light] colours (Moonroot's
teal) for its trees and its scenes' crowns (`animeFoliage(seed, shrub, palette)`; each leaf card is a
raised arch of `art.anime.cardSegments`² quads, 2 since 29 October 2026: a shrub is 416 triangles, a crown 864); a zone's `soil`
biases the open soil patches (Moonroot's woods have none); `acceptedScenes.bankShade` {strength,
tone} gives a scene's steep grass banks a darker two-step cel tone in the terrain shader (vertex
`aBank * (1 - normal.y)`), so the camp's terrace reads from above. `look.ground` [light, dark]
stands in for the game's anime ground pair (Moonroot: the concept's pale olive and shaded teal).
Natural borders (all maps): ground colour takes its zone at a point displaced by two octaves of
noise (`core/ground-regions.js` `paintZoneAt`, up to about 22 m; terrain tint, grass and the map
image; gameplay keeps `zoneAt`), and an open seam's shared tint reaches a wandering depth
(`seamBandAt`: up to 0.35-2.6 times its band, about 9-37 m for a 24 m band, world-space noise, so both maps see one border shape),
carried six bands past the span's ends. A seam with `edgeTreeDensity` thins the map's trees (and
its scenes' surround trees) toward that density over the same wandering depth, by a fixed hash
after the seeded passes, so nothing else moves.
Moonroot's woods (27 October 2026): zone `treeScale` [min, max] spreads tree sizes (same seeded
draw) and `giants` (share, by a fixed hash) x `giantScale` makes old giants where there is room
(clear of props and at least 2 + scale m from a road). `look.roots` stands every tree on buttress roots grown from its
trunk (`render/moonroot-flora.js` `rootFlareGeometry`, three shapes by place: Mirror Pond's approved
`rootTree` path, leaving the bark at 0.22-0.4 m as thick as the trunk there, curving down within a
short flare and running on half buried, some forked; instanced) and draws `decor.groundRoots`
(surface roots from tree feet, `zone.groundRoots` per tree, stopping at roads, water, scenes and safe
ground, half buried and arching up out of the ground once or twice: `arch` [centre, height]) as one
merged mesh on the ground. `look.undergrowth` {seed} plants each zone's own plants
(`zone.plants` {curl, glow}: clumps of 3-6 per 100 m2; own seed after every other pass): pale moon-curls and teal
glow bulbs (unlit), instanced. A town's `well` is optional, `noticeBoard: false` and
`lanterns: false` leave out the generic notice board and street lanterns (Moonstone Camp lights and
furnishes itself). `look.trunk` {light, mid, shadow, line, moss} recolours every trunk and root in the map
(`animeTrunk(bark)`, the flares and ground roots, moss on up-facing faces; the scenes' trees through
`foliage.bark` and their own roots through `FOL.trunk`): Moonroot's pale grey-taupe bark.
`look.rocks` {colors, moss, line} draws the map's scattered rocks as weathered boulders (a lumpy
subdivided sphere, flat bed, squared top, flat-shaded) with a wavy moss cap on top
(`mossyStone`). In Godot: MultiMesh per flare shape and plant kind, one mesh for ground roots. The scenes' layout is the
region's; `moonroot-grove.json.acceptedScenes` enables them with the same apron, grass-bank, foliage
(tree scale 1: their roots are drawn for those trunks) and surround settings as the other maps. The scenes replace the native camp (`camp` key removed: Moonstone Camp draws its
own tents and fire), the elder tree and the ring's pillars (cleared like any native prop inside a
scene). Per-scene exports: a scene whose factory has a waypoint names its id (`waypoint: 'camp'`;
the camp's warp pillar is the beach's rebuilding waypoint at 1.8 scale, rebuilt once the waypoint is
discovered); Mirror Pond exports `pond` (centre, water y and 72 shore radii) and `crossing` (its
stepping-stone line). The pond is blocked by circles in `ponds`, and its stones are a dock of kind
`stepstone`: walkable over the water at the stones' tops, never drawn by the harbour or the map image
(the scene draws the stones). A port uses its normal dock support for it.

Packs: a spawn entry may carry `pack: {size, radius, spacing}` (the hare: packs of 6 or 4, small
and weak). `encounterLayout()` places each pack's leader under the normal rules, then its mates
within `radius` of the leader at their own `spacing` (other monsters still keep `placement.spacing`
clear); points and spawn points carry a `pack` id (`group:index`). A monster whose def has
`packAssist` (metres) pulls every calm packmate within that range into the fight the moment it
aggroes (`setAggro()` in `core/ai.js`). Packmates respawn at their own points.

Attacks may borrow another attack's mechanics with `attacks.<name>.kind` (e.g. the hare's `kick` is a
planted `claw` strike, its `hop` a marked `pounce`; the mole's `swipe` is a `sweep`; Greyfang's
`leap` is a `pounce`). Names stay their own for cooldowns, telegraph lookups and looks. An attack's
`hpBelow` (Greyfang's `leap`: 0.5) means it is only used at or under that share of health.

The moth has two mechanics of its own (no other monster uses them): `shard_rain` marks `count`
`glass_shard` circles at wind-up start, the first on the player and the rest scattered within
`spread` (seeded `game.rng`, never in a safe zone), landing `step` seconds apart after the wind-up;
`mirror_ring` marks a ring around the moth (`radius`, with a safe middle of radius `inner`) that
goes off at the end of the wind-up. A monster area with `inner` hits only units outside it (core
`updateAreas`); the render draws the band red and the safe middle with a pale rim. New mechanic `erupt` (mole): an `erupt` area is
marked at the target for the whole wind-up; the mole sinks (render) and surfaces at that spot as it
bursts (`surface` event); it never digs into a safe zone. In Godot: the same state machine, a dig/emerge
`AnimationPlayer` clip and a teleport at the burst.

Art: `scripts/split-moonroot-art.py` cuts the owner's concept sheets (`assets/moonroot/*.jpg`) into
atlas portraits (`public/assets/icons/monster|region/...`, registered in `raster-icons.js` and the
atlas manifests) and item pictures (`public/assets/moonroot/...`) drawn inside the authored SVG frame
(`ui/art.js`), with every crop and hash in `assets/moonroot/manifest.json`.

### Zone landmarks and ground cover

Every zone of every map has one landmark of its own (`landmarks` in each map's data; kinds are
unique across the world). An entry has `id`, `kind`, `zone`, `at` [x, z], `rot` (local +Z faces it,
the same facing rule as everything else), `name`/`nameTh`, and either `builtin: true` (an existing
set piece drawn elsewhere: wreck, lighthouse, wolf den, ruin ring; named for the map only) or
`colliders` (local `[x, z, r]` circles) plus `clear` (radius). `core/world.js` places them after all
random scatter: scattered trees/rocks/stumps/logs and small decoration within `clear` are removed
(nothing else moves, so the seeded layout is unchanged), then the collider circles are added with
`type: 'landmark'`. `world.landmarks` lists them with world-space `parts`. The 18 non-builtin
models are editable Blender sources in `assets/blender/landmarks/`, exported to
`public/models/landmarks/*.glb` by `scripts/build-landmarks.py`. `render/landmark-assets.js`
loads only the active region's kinds, applies the native three-step toon ramp and
same-hue outlines, then cooperatively batches static meshes by material. Region import
jobs own and release raw and merged buffers on cancellation or disposal. The windmill's
named `landmark-spinner` sails turn in `onBeforeRender` because batching freezes matrices;
moving meshes are excluded from static merging. Placement, ground support and collider
data are unchanged. In Godot: import one GLB scene per kind at `at`/`rot`, static bodies
from `parts`, and the windmill sails on an `AnimationPlayer`.

Ground cover per zone comes from `zoneDecor(zone)` (exported by `core/world.js`): flower colours
(indices into `art.ground.flowerColors`), ferns, mushrooms and berry bushes. A zone's own `decor`
overrides the defaults kept from the first maps; zones of a map differ in their cover (tested).
`ruins.altar: false` drops the generic altar from a ruin ring (the grove's ring has the crescent
altar landmark instead).

### Outfits by category (armour, boots, gloves, helms)

Worn looks are data: `data/outfits.json` holds `bases` by category (cloth, vest, coat, armor),
`styles` (each names its base), and one entry per armour, boots, gloves and helm item.
`resolveOutfit(gearLook, outfits, appearance)` in `src/core/outfit-look.js` (pure, tested)
returns the top (style, base, skirt, palette, cut, parts) plus `boots`, `gloves` and `helm`
pieces.

`src/render/base-garments.js` builds every garment from the HairSample body:
- tops, gloves and boot shafts are body regions offset along the normals, keeping the body's
  skin weights;
- skirts are flared rings from the waist, weighted from the hips into the thighs;
- the HairSample trousers and shoes stay as base legwear.

`src/render/garments.js` cuts (discard) and paints them from the bind-pose position, with a
same-cut outline hull. Raised pieces are `PARTS` in `src/render/outfit.js`; helms are kinds in
`src/render/headwear.js`. Accessories are not drawn.

In Godot:
- bake each base garment once as a skinned mesh;
- use a ShaderMaterial per garment kind with the same uniforms (`uPal[10]`, `uCutA..D`)
  reading a bind-position varying;
- make a scene per part or helm on a `BoneAttachment3D`.

See `docs/OUTFIT-BASE.md`.

## Experimental online visual presence (protocol 3)

The explicit player entry (`src/player.js`) must receive protocol-3 admission before
dynamically loading the world. Preserve Connecting/Failed/Retry/Reconnecting and an
explicit developer/offline entry with compatible local v13 saves. After joining,
pause player gameplay until reconnect has received room acknowledgement.

`src/network/presence.js` and `server/presence.mjs` relay anonymous cosmetic state.
The shared player space is `frontier-atlas-v1`; Azure, Frontier and Moonroot are region
metadata within the same room. Pose x/z are global atlas coordinates, not native
region coordinates. Add the session's fixed coordinateOrigin on send and subtract
it on receipt. Validate region ownership against authored atlas rectangles with
the same half-open boundary policy as unified-world. Crossing a seam preserves
identity, membership, interpolation and rigs. Native map spaces remain isolated
developer fixtures, not the player path. Saves remain map-local and unchanged.

Port RemotePlayers as a non-colliding cosmetic actor layer, with allowlisted outfit/
weapon IDs resolved through existing assets. Bounded skill/phase/angle/duration/step
events play authored weapon actions and short visual cues only; never feed them to
Game, damage, projectiles, monsters or loot rules. Retain exact-field validation,
action/appearance/message limits, sequence deduplication, reconnect reset and
explicit owned-resource disposal on cancel/leave/disconnect. Remote effects are
capped at 24 with short lifetime; remote visibility is limited to 58 scene metres.
Protocol 5 (2026-10-30, the blade job's Stealth and Decoy, meant for player against player): a pose may carry
`hidden` (a hidden player is drawn nowhere; its pose still moves) and `decoy` (`null` or `{x, z, facing}` within
40 m of the pose: the remote layer stands a second copy of that player there, the same look and gear and ring);
both keys are optional on the wire. Stealth and Decoy casts spawn no remote cue (it would give the hidden or the
real player away).
See `MULTIPLAYER-PRESENCE.md` for protocol, commands and parent-owned free hosting.
Authentication, shared combat and authoritative saves remain future milestones.

## Accepted concept scenes (integration trial, 24 October 2026)

`data/accepted-scenes.json` lists the thirteen accepted scenes (`data/accepted-scenes/<id>.json`: source-scene transforms, bounds, sampled heights and path distances, plain circle/OBB solids and source road guides). Each scene lies in one map's local metres: `region` names the map (Azure Coast when unset; the Conch Coast, `shell-beach`, lies on the Greenhollow Frontier coast west of the arrival beach), and `acceptedScenes(data)` returns the scenes of the map whose `acceptedScenes.enabled` is set. `data/world.json.acceptedScenes` (and `data/maps/frontier-wilds.json` and `moonroot-grove.json` `acceptedScenes` for theirs, with its own roads, connectors, apron, foliage and shore) enables them and declares graded connector height profiles. `core/accepted-scenes.js` applies them to the same heightfield consumed by collision, spawning and native terrain. `export:layout` now includes the accepted-scene settings and the final roads; its heightmap already includes the replacement terrain and aprons.

Scene lift and edges. `acceptedScenes.lift[scene]` raises a whole scene (its sampled surface, meshes, plants, animated parts and the scene ends of its connectors) by that many metres; `acceptedTarget` adds it. Where a scene meets the map, `apron.scene[scene].continue` replaces the ramp with the scene's own ground past its bounds: `data/accepted-scenes/<id>.json` may carry `outer` (the factory's height function sampled on a 1 m grid in a ring round the bounds), softened by two 7 m box passes and faded into the map over `continue` metres, so the scene's uplands and banks run on instead of ending at the bound (its rock faces still end at the bound). `inland` lets the apron reach low dry ground. A raised scene next to a map seam lists the same `rises` (span, height, ease in each map's local coordinates) on both maps' seams; `seamRise` adds them to the generated profile, so the hill continues across the border. The forest's factory builds rock columns on every terrace edge with a real drop, not only those in its authored frame (a second pass with its own seed). Its game patch also adds three rises ringing the cherry's hollow (world-metre outlines, `ring: true` terraces) and moves the arching tree over trail-1's north pass; frame-placed trees are lifted onto the rises, not moved. `acceptedScenes.grassBanks` lists scenes whose steep ground is painted as grass (the ground shader reads it as level through the `aBank` vertex attribute); their rock faces are their own meshes. A connector marked `final` carries heights taken from the finished ground, so `apronConnectors` leaves it as authored. A port applies the same lift, outer ground and seam rises to its heightmap.

The native procedural mesh factories under `render/accepted-scenes/` are generated from the unchanged approved `scenes/` sources by `scripts/prepare-accepted-scenes.py`. The generator swaps the scenes' outline signed-distance loop (`polyAt`) for a per-outline grid of candidate edges with identical results (`tests/render/accepted-polyat.test.mjs`); it only shortens loading, and a port that bakes the geometry does not need it. A Godot renderer can port their geometry or bake/import it; plain layout data never instantiates a web page. The arrival pillar keeps `landing` as its saved waypoint ID and its fallen/assembled poses are cosmetic. No character save migration is introduced. The windmill rotor and rebuilding pillar remain separate dynamic subtrees; fixed meshes can use the existing resident-cell batching/culling equivalent. Inside a scene (by its feathered weight) the ground painter drops the town's outside-clearing paint and road paint borrowed from a neighbouring map; only the scene's trails and the world's connector roads paint there, and the map image does the same. Conch Coast's conch is not procedural: it is the imported model `public/models/accepted-scenes/singing-conch.glb` (one mesh, one colour map), loaded before the factory runs and placed by `scenes/shell-beach/conch.js`; a port imports the GLB and applies the same transform. Its colliders are plain circles in the scene data and do not need the model.

Surroundings (`acceptedScenes.apron`, `acceptedScenes.surround`, 25 October 2026). The heightfield build runs, after the dock recess: `acceptedApronOffsets` (an outer apron on the listed scene sides: native ground in a ring of `clamp(k*rise, min, max)` metres eases up or down to the scene edge, kept dry and off pond banks), then `apronConnectors` (each connector's outer end lifted by the apron there; the result is `heightfield.acceptedConnectors`), then `applyAcceptedHeights` and `smoothAcceptedAprons`, then seams. A second copy without the apron gives `heightfield.propSlopeAt`; native prop placement (`blockedForProp`) tests that slope, so the seeded native layout is identical with or without the apron. Render moves scene meshes by the same edits: `core/accepted-shift.js` `acceptedGroundEdit(data, scene, x, z, connectors)` returns the height change at a point (connectors, seams, shore) and `acceptedEditReach` is a cheap pre-test. Geometry marked `userData.rigidParts` (stone walls and steps) moves per part, rigidly, instead of per vertex. Instanced ground cover (geometry under 1.6 m, origin on the ground) is dropped where the game's sea covers a coastal scene's old shore. Ground paint: `ground-regions.js` `sceneSurround` (a wobbly ring outside each scene), `sceneKeep` (visible roads, connector extensions and waypoints) and `sceneClearingFade` take the outside-clearing earth and soil patches back to grass in that ring, while roads and waypoints keep their earth; the map image uses the same fade. The grass keeps the map's zone colours inside the scenes too. `world.js` `plantSceneSurrounds` then plants a ring per scene with its own seed after every native pass: trees as collision circles of type `scene-tree` (drawn as the map's normal tree, and on the map) and shrub clumps in `decor.sceneShrubs` (drawn as the normal low shrub), clear of roads, connectors, waypoints, water, beaches, paving and steep ground; `plant.scene[id]` overrides the tree and shrub settings for one scene (the Hill Windmill's dense framing wood). The sea shader's sky-reflection patches use a turned, two-axis-warped noise domain so they do not line up with the world grid.

Edge cliffs (`acceptedScenes.edgeCliffs`, `core/edge-cliffs.js`). A plateau `top` m high inside a closed outline whose points mark cliff edges (a face `lean` m deep), ramp edges (a slope `ramp` m wide) or open edges (full height up to the edge, where the plateau meets ground as high, such as a scene's own headland; no face is drawn). It is applied after the scenes and seams as a floor under the ground (`edgeCliffAt`); `acceptedGroundEdit` mirrors it, scene props, rigid stones, triangles and colliders inside it are left out, and `render/edge-cliffs.js` draws the cliff edges as rock columns in the accepted scenes' column style (cosmetic randomness), in the Conch Coast cliff's material. The arrival beach's left end is one (`west-headland`): it runs from the Conch Coast's east headland (an open edge) over the Frontier seam to a cliff face over the beach and a sea cliff, and is rock on its north side too. On the Frontier coast a second outline, `conch-ring`, closes the Conch Coast's west and north backs; its one ramp edge is the only way onto the whole rise (tested by a walk). `edgeCliffColliders(data, groundY)` returns solid circles (type `edge-cliff`) along every face taller than 1.8 m, centred half way into its `lean` band, so the face cannot be climbed at a shallow angle (the game limits only uphill slope); `world.js` adds them after the scene colliders. An outline that crosses a seam is listed by both maps in their own local metres (the same outline in world metres, so both give one height at the seam); each map draws only the faces inside its bounds (one sample over, so the halves meet). A rock course never sinks into the bank behind it: where the drawn ground mesh (the heightfield's own triangles, split along the (i+1, j)–(i, j+1) diagonal) would cover a course corner or its middle, the course moves outwards in 0.1 m steps, and the courses below move out as far, so the face never overhangs; the foot stays sunk 0.3 m. Faces under 1.8 m (ground in front almost as high) are not drawn; that stretch is a grass bank. `raise` [x, z, radius, top] lifts the plateau's top near a higher wall (full within half the radius) so a face meets it level. Scene meshes inside a plateau are cut per triangle; small connected pieces (under 8 m) that reach inside go whole. The rock faces take a scene cliff material of their map (the Conch Coast's where it is present). Inside the accepted scenes of a map, `acceptedScenes.beach` {width, fade} sets the sand band width (`render/terrain-domain.js` `sceneBeach`; the map image uses the same), easing back to the map's `sea.beach` over `fade` metres outside their bounds: the Conch Coast keeps the 11 m band it was approved with on the Frontier coast's 20 m. A scene's `outer` ground may be exported with `outerFill` (inspect spec): a closing (max then min filter over that many metres) so narrow gullies close instead of running on past the bounds (the Conch Coast no longer exports `outer`: its rock ring replaces it). Rigid scene parts within reach of a `repair` connector rest on the lowest actual ground under their footprint, since a repair lowers the ground past the edit model. Beach paint: `art.ground.beachTop` [from, to] fades the sand weight on ground raised that high above the sea (a headland or terrace top is grass), and `sea.surf.filmTop` keeps the swash film under ground higher than that above the water.

Scene foliage (`acceptedScenes.foliage`). In the game the scenes' trees, shrubs and grass are the map's own. The generator routes each factory's `animeFoliage`, `animeTrunk` and `meadowGrass` to the game's (`render/anime-study.js`, `render/nature.js`), and tags the geometry with `userData.gameFoliage` (`crown`, `shrub`, `trunk`, `grass`). It also gives crowns the game's proportions (2.5 × 1.7 × 2.25, centred 3.5 up). Tree sizes are fitted per scene: ordinary trees are the authored size times `treeScale[scene]`, which brings each scene's typical tree near the map's and keeps its own variation. Each tree in `bigTrees` (world position and world size, divided by the scene's `s` for the factory) stays big; these are the forest's cherry and the focal trees by the well, the gazebo and the mill. The bake (`render/accepted-scenes.js`) then gives tagged meshes the game's materials: `animeFoliageMaterial`, `animeTrunkMaterial` with the game's ink hull, crowns tinted `crownTint`, and grass sent through `attachGrassSurfaceSteps` into the map's grass colour bake. The cherry also keeps its authored blossom crown. Instanced scene plants (all but grass) are split into `chunk`-metre square pieces, as the map's own plants are, so a camera or the sun's shadow box draws only the pieces it reaches. A port draws scene trees with its normal tree and shrub scenes, and scene grass with its ground-coloured grass. Scene colliders are unchanged.
