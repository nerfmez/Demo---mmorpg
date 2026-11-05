# Monster attacks: the standard (owner, 2026-11-03)

The owner asked for every monster's attacks, animations and effects to reach the same standard as the player
skills, starting with the monsters that have no attack of their own yet. This page is that standard. The
skill standards still apply: [anime action](../.claude/skills/anime-action/SKILL.md) for poses and timing,
[skill effects](../.claude/skills/skill-vfx/SKILL.md) and [VFX-REFERENCE](VFX-REFERENCE.md) for effects.

## What research says (2026-11-03)

Web search only: the Cartoon FX gallery (`www.jeanmoreno.com`) and most game wikis were blocked by the
session's network, so these come from search summaries of the cited pages.

- **Wind-up grows with danger.** Light 0.4-0.6 s, moderate 0.8-1.2 s, lethal 1.5-2.5 s
  ([Salt & Steel boss design](https://salt-and-steel.pages.dev/docs/15/boss-design)); players asked Path of
  Exile 2 for 0.2-0.4 s more on a slam plus a marked circle
  ([PoE forum](https://webcdn.pathofexile.com/forum/view-thread/3768387)).
- **Cue order: pose, then glow, then ground.** Monster Hunter and Hades read attacks from the body's
  wind-up pose; a ground marker is for slow or dangerous attacks only
  ([MH wiki](https://monsterhunterwiki.org/wiki/Template:MonsterDataAttacks/doc),
  [PC Gamer on Hades](https://www.pcgamer.com/hades-guide-tips-and-tricks)). A pause before a strike must be
  a visible held pose, or players call it unfair (Elden Ring's delayed swings,
  [Automaton](https://automaton-media.com/en/news/20220316-10577/)).
- **One warm warning colour, a plain fill that grows to the hit** (FFXIV's orange markers, WildStar's fills;
  Lost Ark adds a blue body glow for counterable attacks). Frontier already does this at the true radius.
- **Phases change patterns, not just numbers**: a boss adds a new pattern or adds at HP thresholds.
- **Real animals give the best wind-ups**: an archerfish jet swelling at its head, a mudskipper's C-bend
  before a hop, a nudibranch's stinging cerata, a giant clam snapping shut and squirting, a cone snail's
  latched harpoon (held, then near-instant), a pangolin rolling and lashing its tail, a fox freezing to
  listen before its mousing leap, the tanuki's leaf trick and belly drum.

## Rules

1. **Each monster has its own kit**: two or three attacks for a normal monster (a poke, a gap closer or area
   denial, a punish), four plus phase changes for a boss. No borrowed kit, and no copy of another placed
   monster's pattern. Kits are data (`data/monsters.json`, `behavior: "kit"`, each attack's `use`).
2. **Every attack reads in three layers**: the body's wind-up pose (always), a charge glow on the body part
   that attacks (the fish's cheeks, the clam's eye, the tanuki's leaf), and a plain ground warning at the
   true area for slow or dangerous attacks. Normal monsters 0.4-1.1 s of wind-up, bosses 0.65-1.5 s,
   lethal boss moves up to 2 s.
3. **Animation follows the anime beat** (anticipation, held pose, a very short strike on the hit, overshoot,
   pose hold, recovery). Start from a CC0 reference clip where one exists (Quaternius Ultimate Animated
   Animals: Fox, Wolf, Husky, ShibaInu...; Universal Animation Library); slugs, clams and snails have none,
   so they move procedurally, from real animal motion.
4. **Strike effects are shapes of light, not limb trails.** The owner turned down the monster limb-trail
   ribbons (VFX-REFERENCE, companions round 3); the approved language is the companions' claw marks and
   bite jaw of see-through light (`skillfx/claw-fx.js`, `bite-fx.js`) in each monster's own colour.
   **Each monster gets its own contact look** (owner, 2026-11-04: "why do they have the same effects"):
   claw marks only for real claws (pangolin rake, mole swipe), a jaw only for bites; a blunt blow is a burst
   star with chips (pangolin tail), a slap of water a crown splash (pearl fish), the clam's blast bubbles
   (`skillfx/bubble-fx.js`), the king's frill a slime splat, the tanuki's drum gold taiko rings and impact
   lines, its doubles transformation smoke, its boomerang its own green head-leaf. Never reuse another
   monster's leaves or marks for a different kind of blow.
5. **Effect layers**: charge cue, ground warning, travel (head stretched along the motion, a stop at the
   contact), impact (compressed core, then the full shape within one or two drawings), residue (puddles,
   leaves, slime) lower in contrast so it never hides the next wind-up. Light on iPad: pooled, few draw calls.
6. **Safety tests for every attack kind** (`tests/core`): no damage before the hit time, no double hit, misses
   outside range or arc, state cleanup.

## Process, one monster at a time

1. Kit in data plus any new attack kind in `src/core/ai.js`, with its tests.
2. Model on the game rig (`scripts/prep-monster-glb.py`, `data/models.json` bones and segments), animated
   from a reference clip or real motion.
3. Effects per layer, built live (never pasted pictures).
4. Review in the game with the monster sandbox (`?fresh=1&monsterLab=<type>`): the attack looped on an
   unharmed hero, slow motion and frame steps. **The owner reviews every round live on the iPad** at
   `<site>/lab/monsters.html` (owner, 2026-11-04: "ไม่ต้องอัดคลิปแล้ว", replacing the earlier rule of a video
   first). Check your own frames before handing it over. `VIDEO=1 node tests/browser/monster-lab.mjs <type>` records
   each attack stepped at 30 fps from the game camera and writes `<type>.mp4` (normal speed, then half speed);
   a frame sheet may go with it. The capture draws on bare ground (`&bare=1`: the map's scenery, grass and
   townsfolk hidden) so it is quick without a graphics card (`BARE=0` keeps the scenery); name only the
   attacks that changed (`... monster-lab.mjs <type> <attack> ...`). With the video, give the owner the live
   page (owner, 2026-11-04: "ทำแยกให้ไปกดดูเว็บ"): `monsters.html` lists every monster (the overhauled ones
   first) and opens the sandbox on the one tapped; an effects branch publishes it at `<site>/lab/monsters.html`.
   It opens on the bare arena (`&arena=1`, owner 2026-11-04: "no need to load the map, just the monster and
   the character"): the View builds no map scene, only a flat floor with distance rings, and the rules worlds are
   flattened to open ground (`flattenWorld`), so only the hero, the monster and the effects load (about 3x faster
   to open); a tick on the page opens the real map instead.
5. Record the round below and keep `docs/GODOT-PORT.md` accurate.

## Kits (proposed)

| Monster | Attacks |
|---|---|
| Leaf fox (Lv12-14) | Snap Bite (jaw of light); Leaf Gust (5 m cone of leaf blades, bleed); Mousing Pounce (freezes to listen, a high leap onto a marked spot; pins on a hit, nose stuck on a miss) |
| Leaf tanuki (Lv14-16) | Ponpoko Drum (three timed rings); Leaf Boomerang (hits going out and coming back); Leaf Doubles (illusions, once) |
| Stone pangolin (Lv16-19) | Claw Rake (two hits); Tail Lash (hits behind it); Rebound Roll (rolls along a lane and back, then dizzy) |
| Pearl fish (Lv22-24) | Pearl Jet (aimed chilling shot); Skipping Flop (three marked hops); Tail Slap (knockback) |
| Pearl slug (Lv24-26) | Cerata Volley (three darts in a fan); Mucus Surge (slide leaving a poison trail); Cerata Shed (sting patches when hit hard) |
| Eye clam (Lv26-28) | Pearl Snipe (tracked aim line, then locks); Valve Jet (knockback cone); shell guard that reopens into Valve Jet |
| Pearl Snail King (boss Lv30) | Frill Crush; Proboscis Harpoon (latched, then a stab that pulls in); slime trail; withdraws into its shell at 60% and 30%; Pearl Beam Sweep below 60% |
| Rootdigger mole (Lv14-16) | ตะปบขุด Dig Scoop (rears with both claws raised and held, one snap down and across, claw marks and a fan of earth); สาดดิน Dirt Spray (churns the ground, then flings five clods in a fan); มุดดินโผล่ราก Burrow Burst (sinks, a mound runs underground to the marked spot, bursts up there and roots what it hits) |

## Rounds

- **Leaf fox** (2026-11-03): snap, gust, pounce sent as a video; owner: next monster.
- **Leaf tanuki** (2026-11-04): the owner asked why the effects looked the same (shared leaves and claw marks).
  Its own looks: gold taiko rings with impact lines off the belly (fewer, fainter dust puffs after the first
  video), transformation smoke for its doubles, its green head-leaf as the boomerang. Owner: OK. Then "the walk
  is not good" (tanuki and pangolin): the dog clip's walk pattered five or six steps a second with the body
  rigid. Tanuki: a bouncing trot (the gallop at a short stride, under three steps a second) with a waddle, a
  bob, a head nod and the tail swinging behind. Pangolin: the walk only at a long stride, the back arched and
  the nose low, the head swinging as it sniffs, the body rocking, knuckle-walking front claws, the tail held up.
- **Walks, round 2** (2026-11-04, owner: "the walk and its rhythm are very bad"): circling its prey the rules keep
  a monster facing the prey, so the forward walk slid sideways; and the pangolin's long stride outran its feet.
  Now a beast with `rig.faceMove` (fox, tanuki, pangolin) turns its body along its path while circling and only
  its head watches the prey (`state.lookYaw`); backing away, its walk runs backwards (`animBeast` `reverse`). Feet
  stay planted: the clip's own stride (the tanuki bounds only when it hurries in, `gallopStride`). The pangolin
  walks slowly (data speed 1.6, from 3.2: it closes in by rolling) in a heavy posture; the overlays follow the
  clip's beat (belly bounce, tail sway, head swing) instead of a rocking of their own.
- **Walks, round 3** (2026-11-04, owner: "still not right, it is like a robot"): the trunk was one rigid block
  and the head and tail moved exactly with it. `render/beast-life.js` adds, on the clip's own footfalls, the
  shoulders and hips swinging against each other, each end dipping as its feet land, and damped springs that make
  the head nod and the tail swing a beat late and overshoot (overlapping action) - the fixes animators name for a
  quadruped walk that reads as a machine (spine counter-rotation, hip bob, secondary motion that lags).
- **Walks, round 4** (2026-11-04, owner: "no different, and now it all walks in jerks"): near the edge of its
  circling band, with the hero moving, the rules flicked a monster between closing in, circling and backing off
  every frame; the view then flicked its body turn, its gait (walk/gallop) and its walk direction with it.
  Fixed in both places: `strafe` keeps its choice until it is 0.4 m past an edge (tested: 85 changes in 5 s
  before, at most 2 after), and the view drives the body turn, gait and backwards walk from a velocity eased
  over a fifth of a second, turns the body at most 70 degrees off the facing, and eases between gaits.
- **Walks, round 5** (2026-11-04, owner: "it still stutters - did you really check?"): I had checked numbers at a
  fixed step, not what is drawn. Now measured on the real game loop under a controlled clock, every drawn frame:
  the monster on screen, the camera, each bone. Causes found: the sandbox warped the monster beside the hero (and
  snapped the camera) every round, a 30 px jump on screen every few seconds; attack offsets snapped back in one
  frame (a foreleg 75 degrees); the head-watch and follow-through cut off as an attack began. Fixed: the sandbox
  lets the monster walk (or circle out) to its next attack and the camera glides; attack offsets and the body's
  turn follow critically damped springs; the head-watch and follow-through fade with the attack pose. After:
  walking, the largest frame-to-frame change on screen is under 3 px with no jumps.
- **Walks, round 6** (2026-11-04, owner: "not lag - the walk itself jerks when a monster walks"): measured each
  bone per drawn frame while walking. With the life layer switched off the trunk moved smoothly (0.06 rad/s of
  change per frame); with it, 2.4 - forty times rougher. Its spine swing and dips were sized for a slow walk and
  ran at full size at four steps a second (hurrying in, backing off) and over the gallop's different footfalls, so
  the trunk shook; a clipped-cosine dip kinked at every half step. Now the dips are a smooth raised cosine, the
  head's nod follows their exact rate, and the whole layer fades with the square of the pace above two steps a
  second and out in a gallop (after: 0.06, the same as without it). Also: backing off is slow (0.55 of its speed),
  the walk turns backwards on the rules' intent at once, and walk or gallop is chosen with a margin and crossfaded
  instead of hovering half in each.
- **Walks, round 7** (2026-11-04, owner: "it inches along - the legs don't lift right"): measured the feet. With
  the dog clip on these short legs the front feet slid forward with the body while "planted" (0.7 m/s at a body
  speed of 0.96) and the hind feet raked back faster than it, under the ground; and a units bug (the walk phase
  passed in radians where a share of the cycle was expected) had run the spine swing six times too fast since
  round 3. Now the legs are solved, not played: `plantFeet` (beast-life.js) keeps each foot on the ground for 60%
  of the cycle, moving back exactly as fast as the body moves forward, then lifts it in an arc (35% of the leg)
  and sets it down a stride ahead; a two-bone solve with a sideways lean turns hip and knee to reach it, over the
  clip's legs. The hips sink a little while walking so the planted feet stay in reach. The body faces its path
  fully while circling. No more trunk folding (shoulder/hip pitch dips) or belly squash. After (tanuki circling):
  feet lift 13-16 cm, planted feet slide 0.2-0.35 m/s (from 0.7-1.65), trunk smooth.
- **Walks, round 8** (2026-11-04, owner: "change the walk - four legs, all new"): the tanuki and pangolin no
  longer play the borrowed dog walk at all (`animBeast` `procedural`); `render/beast-walk.js` builds their walk:
  a lateral-sequence walk (hind left, fore left, hind right, fore right; feet down 58% of the cycle) easing into a
  diagonal trot when the tanuki hurries; cadence and stride grow with speed; planted feet and lifted steps
  (`plantFeet`, now with a swing that leaves and lands at ground speed, a soft reach short of a straight leg, and a
  deeper hip sink); a waddle (roll toward the bearing legs, a sink at each pair of footfalls, a slight twist and
  lean), the head level against the roll and nodding late, the tail swinging late. The head's turn toward its prey
  is eased (it snapped across when the prey passed behind). The fox keeps its clip walk.
- **Walks, round 9** (2026-11-04, owner: "worse, the body twists all over - why do the old ones walk fine?"):
  the separate systems of rounds 4-8 (clip plus life layer, then `beast-walk.js` with solved legs) are dropped for
  the forest beasts. The tanuki and pangolin now walk on the same gait as the old four-legged monsters (boar,
  wolves): `advanceGait`/`poseLegs` from `monster-motion.js`, every bone back to its rest each frame, the trunk's
  rock, bob, roll and sway and the steady head from it, tuned per type in `data/monster-motion.json`
  (`leaf_tanuki`, `stone_pangolin`). Their attack poses (drum rear, claw rake, tail lash, curl and roll) sit on top
  as before. The fox is back on its approved clip walk.
- **Walks, round 10** (2026-11-04, owner: "only the fox passes; the other two are no different"): seen from the game
  camera next to the boar, the tanuki's and pangolin's legs are short and hidden under a round body, so every leg
  system so far changed little that shows: the body slid along with paw tips peeking out. A walk has to read through
  the body. The monster sandbox now has a walk mode (เดิน / วิ่ง: no attacks, the monster crosses in front of the
  hero and back, side on, at its strolling or chasing pace) and walk choices per type (`styles` in
  `data/monster-motion.json`) for the owner to pick from live: tanuki - the old monsters' walk, a bouncing trot
  (เหยาะเด้ง: diagonal pairs, the body hopping 14 cm off each pair with a squash on landing) and a waddle
  (เดินต้วมเตี้ยม: a 0.3 rad roll with the head kept level); pangolin - the old monsters' walk, a heavy rocking walk
  (เดินหนักโยก: roll, the head swinging low, claws lifted high) and walking on its hind legs like a ground pangolin
  (เดินสองขาหลัง: forepaws tucked, tail down; it drops to all fours to attack). The game keeps the first until the
  owner picks.
- **Walks, round 11** (2026-11-04, owner: the tanuki's bouncing trot, "but bounce lighter"; the pangolin passed none
  and "rolls instead of walking"): the tanuki walks in the bouncing trot in the game, the hop down from 14 to 8 cm
  (the sandbox keeps a lighter and the earlier one to compare). The pangolin no longer walks: whenever it travels it
  is curled into its ball, rolling along the ground (the ball turns exactly as far as it rolls, about the axis
  across its measured path, so it never skids, sideways too while circling), and it uncurls once it has stopped a
  moment, to attack. Curling and opening take about a third of a second, the ball growing out of the tucked body
  while the body shrinks into it, so it never pops. Rolling, it moves at 2.4 m/s (was 1.6, a walking pace).
- **Walks, round 12** (2026-11-05, owner: the tanuki "still bounces hard, and its belly caves in as it walks"): the
  hop is down to 3.5 cm (from 8), the landing squash is gone (it flattened the whole body each step), and the legs
  swing less (0.6 rad, knee 1.2, from 0.8 and 1.6): the wide swing pulled the belly in where the legs join it. The
  sandbox compares it with an even lighter bounce and none.
- **Walks, round 13** (2026-11-05, owner: "even with no bounce it still bounces, and the belly caves in and twists"):
  the bounce left with no hop was the gait's own sink as the legs spread (5 cm each step on these short legs):
  `dropK` 0 now keeps the tanuki's body level (measured: no change in height over the cycle without the hop). The
  belly's sides were weighted to the legs (its skin followed the nearest segment, and the body's ran only along the
  spine): the body and chest now carry bars across the belly in `data/models.json`, so only the legs move with the
  legs. The game walks it with no bounce; the sandbox offers a 1.5 cm and a 3.5 cm bounce.
- **Rootdigger mole, round 1** (2026-11-05, owner: "now redo the mole"): the first old monster on its own kit
  (`behavior: "kit"`, the old `mole` behaviour removed). Dig Scoop keeps its sweep: an anticipation rearing back
  with both claws raised (to 0.6 of the wind-up), held and trembling, a 0.07 s snap down and across on the hit,
  carried low and held, then home; its claws glow amber as it rears; the contact is amber claw marks of light
  (`rootdigger_mole.swipe` in `data/combat-fx.json`) and a fan of earth across the arc. Dirt Spray (new, kind
  `volley`: five clods fanned 50 degrees, 2.5-7 m): hunched, nose down, claws churning faster and faster with earth
  kicked up under them, then both claws fling forward; the clods are solid earth lobbed in a low arc and break into
  a puff where they end. Burrow Burst keeps its rules (now through the kit: `beginAttack` marks the spot, never in a
  safe town): it sinks while a mound of loose earth runs underground to the mark, then bursts up there. Kits now
  close only to the range of an attack that is ready or nearly (one second), so the mole stops at spray range while
  its scoop cools instead of always walking up to claw range.
- **Rootdigger mole, round 2** (2026-11-05, owner: "why is the mole's colour off; the effects are not good yet; the
  walk is not good"): the colour was the old whole-body warm flicker every monster wore while winding up, which
  turned the purple mole brown; kit monsters no longer wear it (their wind-up shows on the attacking part). The walk
  is new: hind-leg bones (`legL`/`legR` in `data/models.json`, weighted to the hind feet) and a paddling gait locked
  to its ground speed: each front paw reaches forward and in, then sweeps out and back (the stroke reads sideways
  from the high camera), the hind feet step with the opposite front paw, the body rolls and twists toward the pulling
  paw. Effects: Burrow Burst sends roots stabbing up round the mark and sinking back, and a hump of earth now runs
  underground to the mark; the spray's clods are solid, faceted chunks of earth tumbling as they fly; the scoop
  leaves three furrows raked into the ground that fade.
  Owner again: "the colour is still off, surely a bug". Besides the wind-up flicker, its Meshy texture is a dark,
  saturated plum against the concept's grey-violet: `data/models.json` `grade` now lifts and desaturates only the
  purple fur once on load (`monsterSkin.js` `gradeMap`), cream stripe and ivory claws untouched.
- **Rootdigger mole, round 3** (2026-11-05, owner: "the effects are very bad, the animation is still bad and
  unnatural, and in the burrow the earth moves before it has finished digging in"): the effects are rebuilt from the
  ground kit approved for Earth Heave (`skillfx/mole-fx.js`): noise-cut dust puffs, lumpy toon-lit clods and slabs of
  soil, and a freshly dug pit decal, replacing the dots of colour, flat cones and mound. Burrow Burst: a pit where it
  goes under; it is fully under by a third of the wind-up (it sank slowly before), and only then the ground heaves
  along its path (slabs pushed up either side and settling, dust); the mark bursts into a dug pit with a ring of
  slabs pried up outward, clods thrown high and dust. Dirt Spray: dust and clods kicked up under its claws while it
  digs; its shots are tumbling clods trailing dust that break into a puff and crumbs. Dig Scoop: a fan of dug soil
  where the claws scooped, clods and dust flung across it (the amber claw marks stay). The poses are real mole
  digging, not raised arms: sideways strokes with the paws turned out (breaststroke); the scoop hunkers down with the
  paws drawn in under the chest, then sweeps them forward and out in one snap with a lunge; the spray digs with
  quickening alternating strokes and flings both paws up and forward; the burrow digs in fast and bursts up with the
  paws flung out to the sides. The old particle burst and dig dust (`vfx.erupt`, `digDust`) no longer draw for it.
- **Rootdigger mole, round 4** (2026-11-05, owner: "walking it must part the earth with its hands, with an effect of
  earth being dug, and make the mole bigger"): the walk is a breaststroke through the soil, locked to its ground
  speed (a stroke every 0.75 m): both paws reach forward and close in under the nose, then sweep wide out to the
  sides and back while the body surges forward, the hind feet shuffling under it; at the height of each sweep
  MoleFx `walkDig` throws a puff of dust and clods off each paw, outward and back, and now and then leaves a shallow
  scrape. Drawn 1.3x (was 0.95), its rules radius 1.1 m (was 0.85).
- **Stone pangolin** (2026-11-04): the tail lash became a blunt burst star with chips (claw marks stay on the
  rake). The roll ball looked bare (14 plates): it now wears the body's armour, rows of round domed plates with
  dark skin between them, moss, and the tail curled round it as a ridge. Fixed: the body stayed invisible after
  a roll.
