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
- **Stone pangolin** (2026-11-04): the tail lash became a blunt burst star with chips (claw marks stay on the
  rake). The roll ball looked bare (14 plates): it now wears the body's armour, rows of round domed plates with
  dark skin between them, moss, and the tail curled round it as a ridge. Fixed: the body stayed invisible after
  a roll.
