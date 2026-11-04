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
   unharmed hero, slow motion and frame steps. **Every round goes to the owner as a video first** (owner,
   2026-11-03: "ต้องส่ง video มาให้ดูก่อนทุกครั้ง"): `VIDEO=1 node tests/browser/monster-lab.mjs <type>` records
   each attack stepped at 30 fps from the game camera and writes `<type>.mp4` (normal speed, then half speed);
   a frame sheet may go with it.
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

(none yet)
