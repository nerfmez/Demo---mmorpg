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

## Mechanic variety (owner, 2026-11-05)

"Your patterns are starting to repeat: a dash and a ranged shot on almost every monster." and earlier "monster skills
must be creative". The kits so far lean on the same few families. Count before designing a new kit:

| Family | Used by |
|---|---|
| Dash / leap at the prey (charge, pounce, skip, roll) | fox, pangolin, fish, hare, boar (three legs, re-aimed) |
| Shot / spray / volley | mole, clam (valve), slug (homing stingers) |
| Beam or lane | moth, snail king (beam, grind) |
| Ring round itself | (moth's moonlight ring, replaced: its pattern was not its own) |
| Pull / suction | pearl fish gulp |
| A wave that travels | pearl fish tail wave (a crest across a cone) |
| Counter or guard | pearl slug acid skin (blows answered), eye clam nacre (break the coat) |
| Facing check | eye clam gaze (turn your back) |
| Things to break or avoid on the ground | crab bubble mines, snail king eggs (step on to break), slime trails, salt slime brine (sets into salt) |
| Grab / hold | salt slime engulf |
| Stealing | shore gull snatch |
| An opening it gives itself | shore gull feast after its shell drop |
| Splitting | salt slime bud |
| Summoned turrets | sporecap sprouts |
| A build-up to leave in time | sporecap sleep cloud |
| A ring with a safe middle | sporecap fairy ring |
| An attack made facing away | moss beetle bombardier spray |
| A fake-out | moss beetle play dead |
| Moved by force | wolf drag, boar toss, fish gulp |
| Crossing lanes | wolf shadow pincer |
| Lanes with gaps to read | tusk boar piglet stampede |

Then (owner, 2026-11-05): "It is not that they are not allowed, but the pattern must be creative, not the same
pattern with a different effect." So a dash or a shot is fine; a dash that is another straight charge at the prey, or a
shot that is another fan of darts flying straight, is not. What has to differ is the pattern: the path's shape (an
arc, a zigzag, a bounce, a return), its timing (a delay, a rhythm, a hold), what it leaves behind or does after (it
hovers, it sticks, it splits, it comes back), what the player must do about it (step back, not sideways; wait; go
round; break it).

And (owner, 2026-11-05): the same holds for a ring round itself - allowed, if its pattern is its own; and a kit does
not have to hold one of each (a strike, a dash, a shot, a ring) as a template. A monster may have any of them or none;
how many attacks and which follow from the creature.

Rules for every new kit:
- Every attack's pattern is its own: not a pattern another monster already has with a new look on it.
- At least one mechanic no other monster has, read from the creature itself (its body, habit, what it drops).
- No fixed template: the kit's size and families follow the creature, not the last monster's kit.
- Families not used yet, to draw from: a grab or engulf (held, struggle free); a counter or guard stance (hitting
  its front is punished, go round or wait); an ambush (hidden, a tell when it is near); splitting or calling help;
  changing the ground (a slow or slippery patch, a wall, a pit); a tether or link between two points; pulling or
  pushing the player; a weak point that opens for a moment; stealing or copying; a rhythm the player must read.

## Elites and normal monsters (owner, 2026-11-06)

"Make three skills. I'll add an elite or starred system, special beyond the normal ones; normal ones have only one
move, every one." Every kit monster has three attacks (a reaction such as a split or a coat counts). `normal` in its
data names the one a normal monster uses; an elite (`data/monsters.json` `elite`: about one in eight, never a boss or
a minion, rolled from its id so no seeded outcome shifts) uses the whole kit and is bigger (x1.22 drawn), tougher
(x3 health, x1.3 damage) and richer (x3 exp, drops rolled twice), with a gold star and name on its bar, its bar shown
whenever it is near. `core/ai.js canUse` gates every attack and reaction. The sandbox shows the elite, with a toggle
for the normal one.

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
| Pearl fish (Lv22-24) | ดูดกลืน Gulp (a fish's suction feeding: a cone of water streams into its mouth, drawing the hero in, then the jaws snap on what reached them; walk out of the cone or against the pull); ฟาดหางคลื่นน้ำ Tail Wave (curls, tail raised, slams it down: a crest of water rolls out across a 50 degree cone, widening, hitting once as it passes, knocking back); ดีดตัวกระโดด Skipping Flop (three marked hops) |
| Pearl slug (Lv24-26) | ไถลเมือกพิษ Mucus Surge (slide leaving a ribbon of poison mucus); เข็มพิษลอย Drifting Stingers (the stinging cells a nudibranch keeps from the jellyfish it eats: three drift off its plumes and follow the hero slowly, slower than a running hero); ผิวกรด Acid Skin (hit three times in two seconds: its skin froths, and for three seconds every blow from within 3.5 m is answered by a squirt of acid; hold off or hit from afar) |
| Eye clam (Lv26-28) | ตาสะกด Gaze (the eye opens wide and a cone of hypnotic light grows; whoever faces it when it flashes is struck and held fast; turn your back to it); พ่นน้ำหุบเปลือก Valve Jet (knockback cone); เคลือบมุก Nacre Coat (hit hard, it clamps shut coated in nacre worth 12% of its health: break it within 3.5 s and it cracks open stunned with its eye bare, taking 1.5x; or the rest of the coat heals it) |
| Pearl Snail King (boss Lv30) | ลิ้นตะไบ Radula Grind (rears, then rasps up and down the lane before it, four passes); วางไข่มุก Pearl Eggs (three eggs flung round the hero; step on one to break it, the rest burst over 3.2 m after 5 s, so break them or get out); ทางเมือก slime glaze wherever it crawls (slows); เกลียวมุก Pearl Spiral (at 60% and 30% it withdraws, hits barely hurt, and its turning shell throws pearls out along three spiral arms, two waves turning opposite ways); ลำแสงมุก Pearl Beam Sweep below 60% |
| Rootdigger mole (Lv14-16) | ตะปบขุด Dig Scoop (rears with both claws raised and held, one snap down and across, claw marks and a fan of earth); สาดดิน Dirt Spray (churns the ground, then flings five clods in a fan); มุดดินโผล่ราก Burrow Burst (sinks, a mound runs underground to the marked spot, bursts up there and roots what it hits) |
| Fern-ear hare | ต่อยรัว Box (rears up on its haunches, paws raised in a guard, a one-two of jabs with a burst star of light on each); กระทืบเตือนภัย Warning Thump (up on its haunches, trembling, ears up, a hop up, then slams down: a shock ring to the true edge, earth and fern leaves thrown out); กระโดดทับ Leap (crouch, rump wiggle, springs onto the marked spot, lands in earth and leaves) |
| Mirrorwing moth | แสงสะท้อนปีก Wing Glare (turns its glass wings on the prey like a mirror, glints flare on the panes, then a beam of moonlight along the lane); ห่าเกล็ดกระจก Glass Rain (wings raised and held while a glass shard forms over each marked circle, then they drop one after another and shatter in stars of cold light); ร่างเงากระจก Mirror Decoy (too close: its wings flare as a glass image of it splits off, it flies back, and the image flickers faster and faster like a fuse and bursts) |
| Hermit crab (Lv10-12) | ก้ามโล่หนีบ Claw Guard (normal; walks in with its big claw raised as a shield, a gold arc on the ground over the guarded front: blows from in front glance off with a clank of gold, from the side or back they land; then one snap, light pincers on what it catches); ดอกไม้ทะเลต่อยหลัง Anemone Sting (the anemones on its shell swell and glow while a cone is marked behind it; pink tentacles lash out over it, poisoning: it answers whoever went round its guard, without turning); สลัดกระดอง Shell Shed (hunkers, the shell shaking and shedding coral chips inside a marked ring; coral shards burst out to the ring's edge and it leaves the shell, its anemones with it: bare and soft, it runs fast and takes much more damage, then hurries back and climbs in) |
| Thicket mantis (Lv17-21) | ส่ายเล็งฉกขา Peer Strike (normal; it sways side to side to judge the gap, head held on the hero, while a long narrow lane lights and locks; its forelegs shoot out in an instant, throwing two crescent sword waves that cross in an X down the lane, an X cut on what they catch, its body never moving: step out of the lane); กางปีกขู่ Startle Display (close in, it rears up and fans its hind wings with two great eyespots, hissing, a cone marked before it: caught in it, the hero freezes in fright and its strike follows at once); ร่อนข้ามตะครุบหลัง Wing Leap (it buzzes its wings and flies over the hero, the landing marked beyond them; it lands with an X of two slashes and turns round: step toward where it took off) |
| Greyfang (mini-boss Lv22, two phases) | ตะครุบตัดขา Hamstring Passes (its curved path past the hero marked; it darts past at leg height, skids round on the far side, the next curve marked through the skid, and passes back: two passes, three in its second phase; the hero limps, ขาเจ็บ); วนล่าพุ่งตัด Moon Orbit (it gallops round the hero, banked, leaving moon-blue afterimages, for a distance drawn each time; it plants with its eyes flashing and its lane lit, then cuts straight through and on); หอนเรียกฝูงล้อม Rally Howl (light pillars mark spots round the hero; its pack comes in there, never more than three); at half health it stops to roar once (the second phase: silver wisps rise off it from then on); then กระโจนจันทร์ถล่ม Moon Leap (it springs up out of sight and can't be hit; its shadow follows the hero; the spot locks with a warning circle filling to the landing; it crashes down nose first: shock rings, a crater, the hero thrown); ฝูงเงาจันทร์ Phantom Rush (two moon-shadow copies of it crouch round the hero; three lanes cross at the hero, each filling to its own run; the shadows run them in turn, it runs the last) |
| Reed viper (Lv22) | ฉกพิษ Strike (normal; its neck folds back into a level S, the lane lit and locking; the neck shoots out and snaps back in a blink, twice, the second re-aimed with its lane lit again: two fang punctures of light and a spurt of venom where it bites, always poisoning); พันรัด Constrict (lowered and gathered, a long lane lit; it rushes down it and winds twice round whoever it reaches, head on top, the coils tightening with a green ring on each squeeze: held fast, a dodge or hurting it tears free); สะบัดหางใบมีด Tail Lash (taken on someone behind it: the leaf-blade tail drawn aside, a wide cone marked round its back, then whipped round with a crescent of gold-green light: bleeding) |
| Duskmane stalker (Lv31-34) | ตะปบอุ้งเล็บคู่ Twin Swat (normal; up on its haunches a little with a forepaw cocked, a cone filling; one paw then the other slaps down and across: claw slashes of dusk light, bleeding); ย่องเงาสนธยา Dusk Stalk (it melts into the dusk in a violet mist, unseen and out of reach, and creeps round to the hero's back: only its glowing paw prints show where it goes; it shows itself with its eyes glinting, frozen, rump wiggling, its lane through the hero filling, then springs low along it: step out of the lane); ไล่ล่าเลี้ยวคม Sprint Chase (crouched, rump wiggling, its first stretch marked; then it sprints after the hero, the ground it is about to cross lit ahead of it, bending after them but turning slowly: a late step aside makes it overrun and skid, open) |
| Ironhorn ram (Lv29-32) | ยืนผงาดโขกเขา Rearing Clash (normal; it rears up on its hind legs, horns back, held, while a cone before it fills; it drops forward onto the blow, horns leading: a crescent of steel light and iron sparks, the hero knocked back); ถอยตั้งหลักพุ่งชน Run-up Charge (it backs off facing the hero, head low and shaking, paws the ground while a long lane is lit; then charges head down: on what it strikes it pulls up in a clash of sparks, the hero flung far; step out of the lane and it runs on and is left reeling); สะบัดเขาเกี่ยว Horn Hook (taken on its flank, it cocks its head low to that side without turning while a cone round that flank fills, then hooks its horns round and up: the hero flung out sideways) |
| Gale hawk (Lv28-31) | ดิ่งฟ้าผ่า Lightning Stoop (normal; it draws off and climbs into a wind-hover, wings beating fast and shallow, head held still on them, while a strike stretch from short of their spot to past it is marked, following them, then locking; it tucks its wings and stoops in a long curve, steep at first and skimming over the stretch, talons thrown forward, then beats back up past the hero: forks of lightning run over the ground where it rakes; step aside after the lock); ปีกพายุฟ้าคะนอง Thunder Wings (it climbs and beats big full strokes, static crackling over its wings; every downstroke calls a bolt onto where the hero stands then, the spot marked, the bolt coming down out of the sky 0.8 s later, five in a row: keep moving); ขนพายุ Storm Feathers (high, wings spread and shivering, it shakes charged feathers loose: five marks in a zigzag across its line through the hero; they drift down and stand glowing, the strands between them marked and flickering while the charge builds, then they crack with lightning three times: step off the strands) |
| Marsh wisp (Lv25-28) | ลูกไฟหลงทาง Lost Lights (normal; it draws back and swells, then flings two orange flames that weave either side of their line to the hero, braiding round each other, trailing light: burn); แก๊สบึงลุกไหม้ Marsh Gas (it sinks low and pulses; spots marked from it along the line to the hero and past, bubbles rising from each; they catch fire one after another as jets of gold flame out of dark puddles, a run that catches each unit once); แสงล่อลงบึง Bog Lure (it rises and sways, beckoning; a bog is ringed between the hero and it, its fill growing; then the bog wells up and the hero is drawn toward it by threads of light whatever is pressed - walk against it or dodge out - into burning, clinging marsh water); come close and it scatters and gathers again further off |
| Masked wolf (Lv9-11) | วิ่งวนล่าเหยื่อ Circling Lunge (normal; runs a lap round the hero, its path glowing round them, then crouches with its lunge's lane lit, locking, and lunges: three fang marks on a hit; a late step aside dodges it); หอนเงาประกบ Shadow Pincer (howls, rings off its head, two lanes crossing where the hero stands; two see-through shadow wolves run in from either side and cross there); ขย้ำลากถอย Drag Bite (bites what is right before it and backs away 3 m dragging it by the jaws, heels furrowing the dust; a dodge tears free) |
| Moss beetle (Lv9-11) | ฉีดกรดก้น Bombardier Spray (normal; it turns its back on the hero, which looks like an opening, abdomen up and quivering, then three bursts of acid down the lane behind it, sweeping a little, each lighting the lane it hits); กลิ้งก้อนมอส Moss Ball (shoves a ball of moss with its head, then kicks it rolling down its lane, growing as it rolls, flattening what it rolls over, and it bursts into a slowing moss patch where it stops); แกล้งตายดีดตัว Play Dead (hit three times in two seconds it flips on its back, legs twitching; the spot under the hero is marked at once, and after 1.4 s it clicks and springs onto it) |
| Sporecap (Lv5-9) | วงเห็ดนางฟ้า Fairy Ring (normal; stamps, arms up: little mushrooms sprout round the hero and puff together: the band between the ring's edges hurts, the middle is safe); เพาะเห็ดลูก Sow Sprouts (bows its cap and shakes out spores: two little sprouts of itself stand and puff small clouds every 3 s until broken or wilted after 14 s); สปอร์ง่วง Sleepy Spores (breathes in, then out a pink cloud that drifts slowly ahead; Zs rise over a hero getting drowsy in it, and after 1.4 s in it they fall asleep, a bubble at the nose) |
| Tusk boar (Lv3-7) | ขวิดเสย Tusk Toss (head right down, tusks under its prey, then a fling over its back: the hero sails over and lands behind it, dazed a moment; a dodge or a block is not thrown); วิ่งอาละวาด Rampage (backs off for a run; paws the ground, snorting; charges in three legs, skidding to a stop between them and swinging round to its prey, the next lane warned through the skid; a rock in the way stops it stunned); ลูกหมูแตกตื่น Piglet Stampede (rears and squeals; three piglets burst out beside it and run down three warned lanes, the outer ones first, the middle last; the gaps between lanes are safe) |
| Shore gull (Lv2-4) | เกาะหัวจิก Head Perch (hops onto the hero's head and rides there pecking, four pecks; a dodge shakes it off, dazed); ฉกเหรียญ Snatch (crouches, eyes on the hero's purse; swoops low along a curve through the hero and on past, hooking away; clipped, the hero loses a few gold, carried off as a coin in its beak and dropped again when it dies); ทิ้งหอย Shell Drop (beats up into the air with a clam in its feet, drops it on the marked spot, then glides down and eats at the cracked shell for 2 s, open to blows at 1.5x) |
| Salt slime (Lv1-3) | กลืนห่อ Engulf (flattens wide, quivering, bubbles welling round it; hops onto the marked spot and wraps over whoever is there, swollen and see-through with them inside, squeezing three times, then spits them out; a miss splats it flat); แอ่งเกลือ Brine Pool (spits a glob of brine where the hero stands: a puddle spreads to its true size and salt crystals grow in from the edge as it sets, holding fast who is still in it; a crust is left that crumbles); แตกตัว Split (under half health, once, a small bud of itself pinches off) |
| Reef crab (Lv1-3) | หนีบ Pinch (claws raised and opened, a snap: two marks of light crossing shut on the prey); ส่ายก้ามกวาด Claw Sweep (crouches with claws thrown wide, swaying; then scuttles side to side twice in front of its prey, claws snapping: a step aside is caught, a step back is safe); ฟองทุ่นระเบิด Bubble Mines (foam wells at its mouth; three bubbles drift out and hang in the air over pale rings for 3.5 s, bursting on whatever walks into them) |

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
- **Fern-ear hare, round 1** (2026-11-05, owner: "OK, do the next one"): on its own kit (`behavior: "kit"`, the old
  `hare` behaviour and its claw `kick` removed). Box (new, kind `rake`, two hits): it rears straight up about its
  hind hips (the body turns about them, so the hind feet stay planted), forepaws raised in a guard that bobs, leans
  back to load, then each paw snaps out at its hit with the body lunging and twisting into it; a hare has no claws,
  so the contact is a punch: a burst star of light with chips (`box` in `data/combat-fx.json`, `blunt`). Warning
  Thump (new, kind `stomp`, 2.2 m round it): up on its haunches with ears straight up, trembling (the hold), a hop up
  off the hind feet, the whole body slammed down on the wind-up's last beat; a shock ring runs out to the true edge,
  earth puffs, clods and fern leaves of light are thrown out and a shallow dent is left. Leap keeps its marked
  landing: a deep crouch, rump wiggle while it aims, earth kicked back as it springs, stretched long in the air, a
  squash on landing with earth and leaves. A keyed bound locked to its ground speed replaced its run, but the owner
  preferred the old one ("the old run was better"): the old bounding run is back, the new attacks stay.
- **Mirrorwing moth, round 1** (2026-11-05, owner: "next one"): on its own kit (`behavior: "kit"`, the old `moth`
  behaviour removed; `shard_rain` and `mirror_ring` are kit kinds marked in `beginAttack`). New Wing Glare (kind
  `beam`, lane tell, 9 m, chills). From the game camera its glass wings were seen edge on (the model's wings stand in
  the forward plane), dark lumps with the eye colour on their edges: they are tilted back toward flat (order ZYX: tilt
  about X, beat about the body's long axis) so the panes face the camera, and each attack has its own wing pose. It
  lost the warm wind-up flicker that turned it brown (kit monsters do not wear it). Effects in `skillfx/moth-fx.js`.
- **Mirrorwing moth, round 2** (2026-11-05, owner: "attacks around itself are repeated too much; there are many
  ways to show who it is - fly back and leave light behind that damages after a while; monster skills must be
  creative", then: "make it a mirror image of itself that explodes, like a time bomb"): the Moonlight Ring is gone.
  Mirror Decoy (kind `mirror_decoy`, prey within 3.2 m): wings flare and the body pulls back (0.55 s), then it flies
  4.5 m straight away from the prey in 0.5 s and leaves a glass image of itself where it hung: a pooled moth rig lit
  pale cold blue, nearly opaque, with a halo pulsing faster and faster over its 1.6 s fuse, swelling on the last beat;
  its circle (2.6 m, marked on the ground) bursts in a big star of cold light with glass flying out, and chills.
  Design note for later kits: avoid another ring round the monster; read the creature for a mechanic of its own.
- **Reef crab, round 1** (2026-11-05, owner: "next one"): the first of the older monsters on its own kit (Lv1-3, the
  first monster on Azure Coast; `primaryAttack` stays for the coastal tests). It moves like a crab: Sidestep is a
  `charge` it makes side-on (the body turned 83 degrees from its path), its lane marked; Bubble Spit is a slow `volley`
  (4.5 m/s) of see-through bubbles. The pinch's limb trail became two crossing marks of light (`scissor` look).
- **Reef crab, round 2** (2026-11-05, owner: dashes and shots are fine but each pattern must be its own): its
  sideways charge and straight bubble volley repeated other monsters' patterns with a new look. Claw Sweep (kind
  `scuttle`): facing its prey it scuttles `sway` m to one side, across to the other and home in `duration` s, clipping
  what is in front within `range` once a pass; its lane tell is the box it sweeps. Bubble Mines (kind `bubble_mines`):
  areas with `mine` that burst on the first unit touching them, else end unsprung (a new area rule in
  `updateAreas`).
- **Reef crab, round 3** (2026-11-05, owner: "the claw sweep shows no effect on the attack, it looks odd"): the sweep
  only had sand. Now its open claws warm with light in the wind-up; while it sweeps both claw tips carve a continuous
  orange streak of light through the air, flashing at each snap; a pass that clips the prey sends a `monsterSwing`
  (look `sidestep`: two crossing marks of light on it).
- **Reef crab, round 4** (2026-11-05, owner: "effects on the claws do not help; the area that does damage has no
  effect, as if the attack happened in the air, unseen"): the claw streaks are gone. While it sweeps, the strip that is
  really hit (its reach ahead, the claws' width across) is a band of orange light on the ground in front of it, moving
  with it and leaving fading copies along the ground it has swept; sand is thrown off its far edge. Rule for every
  attack: the effect must show the area that does the damage, while it does it, not only the body that makes it.
- **Pearl grotto, round 2** (2026-11-05, owner: of the 14 grotto attacks the flop, the surge (its effect redone),
  the valve jet, the pearl beam and the king's slime (its effect redone, and not like the surge) stay; the other nine
  are new). Fish: the slap and jet became the gulp (suction, core `suction`) and the tail wave (a shockwave with an
  arc, core `shockwave` + `arc`). Slug: the dart volley became drifting stingers (homing shots, core projectile
  `homing`), the shed became the acid skin (core `acidHit`: blows answered). Clam: the snipe became the gaze (core
  `gaze`: only who faces it), the shell guard became the nacre coat (core `nacre`: a coat to break, else it heals).
  King: the crush became the radula grind (core `grind`: passes along a lane), the harpoon became the pearl eggs
  (core area `egg`: stepped on, broken; else a burst), the withdraw's ring became a pearl spiral (two waves of marked
  pearls along turning spiral arms). The trails are ribbons now (one strip along each trail, `grotto-fx.js`): the
  slug's dark, toxic and bubbling; the king's a mother-of-pearl glaze with sliding colours and glints. The reactive
  moves (acid, nacre, the withdraw) and the slime never showed in the sandbox (they wait for hits or a health
  share): the sandbox now sets them off itself (`labTrigger`), and shows the slime by crawling past the hero.
- **Masked wolf, round 1** (2026-11-06, owner: "go on"): its bite, rend combo and speed howl became a lap round the hero
  then a lunge (the strike comes from wherever the lap ends), a howl calling two shadow wolves across a crossing
  point (a pincer: lanes that cross rather than run side by side), and a drag (the hero hauled away by the jaws; a
  dodge tears free).
- **Greyfang, round 1** (2026-11-06, owner: "go on"): researched first (a pack closes round its prey from every
  side, goes for the legs of big prey, and howls to rally). Its bite, rake, summon howl and half-health leap became a
  hamstring dash that leaves the hero limping (a new status, ขาเจ็บ), a rally that brings its pack in round the hero
  (marked spots), and a takedown that pins.
- **Greyfang, round 2** (owner: "the hamstring and takedown repeat each other, the effects are poor; a boss needs five
  skills, for a second phase after half health"): the takedown is gone; it has a crescent rake (claws) beside the
  hamstring and rally, and from half health a pack command (its wolves lunge at once along their lanes) and a dread
  howl that terrifies (a new status, หวาดกลัว). Effects in the bar skills' ribbon language: silver claw streaks
  along the dash, moonlight crescents for the claws, gold barks and eye flashes, dark violet rings of sound.
- **Greyfang, round 3** (owner: "the effects aren't boss-worthy, the animation isn't good; apart from the pack, its
  skills should show a big, fast wolf - this doesn't wow, it's predictable"): proposed first and approved. The crescent
  rake, pack command, dread howl and the fear status are gone. Its body now moves by the CC0 Quaternius wolf clips
  (greyfang-anim.js: gallop, the gallop jump, crouches held before each move, skids, banking). Its kit: hamstring passes
  (two, three enraged), a moon orbit with an unpredictable cut-in, the rally, a phase roar at half health, a moon
  leap out of reach, and a phantom rush (two shadow copies and itself down three crossing lanes). Speed is what the
  effects sell: moon-blue afterimages (copies of its model), wind streaks, claw marks of light, a crater.
- **Greyfang, round 3b** (owner: "the landing looks slow and light; the walk is odd (the run is fine); the charge-up
  pose is odd"): the fall gathers speed all the way down (it slowed near the ground) and lands in a deep, squashed
  crouch with a bigger shake; the wind-up crouch is a real predator crouch (the attack clip's bent legs, spine and
  head lowered) instead of the gallop jump's mid-air tuck; it walks with the old gait again and gallops on the clips.
- **Greyfang, round 3c** (owner: "the hamstring's animation is still weak, especially the dash; I want it to dash, fail
  to brake and slide along the ground a little, claws gripping"): after every pass it skids on the way it was going
  (`slide` m over `skid` s, slowing to a stop) while its body swings round toward the next curve (a drift), sat back on
  its haunches with its forelegs braced out ahead (a pose of its own); dark furrows from its claws follow the slide,
  dirt and grit spray off its forepaws; over the last quarter it gathers into the crouch and springs off again.
- **Reed viper, round 1** (2026-11-06, owner: "next"): researched first (an ambush hunter that lies coiled and still,
  lures prey with its tail tip, folds its neck into an S and strikes very fast; disturbed, it swells and hisses). Its
  fang lash and venom lob became an S-strike that lunges along a lane, a reed ambush (a ring that strikes whoever enters
  it, the tail tip a lure) and a puff-and-hiss cone that leaves venom mist.
- **Reed viper, round 2** (owner, with a new straight Meshy model: "change every skill, make the snake's animation
  realistic"; then "only the strike is OK, but it looks odd, and the bite effect is a fanged mammal's; I don't like
  the other skills" - the owner picked constrict and a tail-blade lash, the strike must poison, normal vipers only
  strike): the body follows the head's trail (lateral undulation), a forked tongue flicks, the root sits at the neck
  (so its reach is measured from its head). The strike is a double strike from a level S-coil with fang punctures
  and venom instead of a jaw; the ambush and hiss are gone.
- **Marsh wisp, round 1** (2026-11-06, owner: "next"): researched first (a will-o'-the-wisp: marsh gas welling up and
  catching fire over a bog; in folklore it leads travellers astray into the water and scatters when approached). Its
  straight orb became weaving lost lights, plus a marsh-gas run that ignites spot by spot and a bog lure that draws the
  hero into a pool (a new hero status, ถูกล่อ); its blink stays as a passive (kit.blink).
- **Marsh wisp, round 2** (owner: "the marsh gas and bog lure effects aren't pretty; make the light it gives out orange
  like its core, and its body a little see-through like energy"): its halo, lost lights, lure threads and the lights over
  the bog are the crystal's orange; its body shimmers see-through. The gas fire is Firebolt's flame in gold (the blue
  outside a gold heart mixed to a muddy green), lower jets out of dark teal-rimmed puddles with bubbles welling up. The
  bog is drawn as dark glossy water (ripples drifting in, a teal rim, the orange lights mirrored in it) instead of the
  mire's fuzzy fill.
- **Marsh wisp, round 3** (owner: "I really don't like the bog, it looks odd; make the pattern on its body move in
  waves rising up, looping; the body is a bit too see-through"): the bog is now murky marsh water (olive-dark, a ragged
  shore fading into the ground, drifting scum, a dull sheen, rings spreading where bubbles break, low mist) instead of a
  dark disc with a bright rim and rings; its body's pattern rides waves rising up it with bands of light climbing,
  looping (models.json `flow`); it is less see-through. Then (owner: "why does the bog have to be dark?", chose
  glowing teal-green): the water glows teal-green with a soft pulse from its middle, glowing scum near the shore.
- **Gale hawk, round 1** (2026-11-06, owner: "next"): researched first (a hawk hangs in a wind-hover with its head
  held dead still over its prey, folds its wings and stoops, throwing its talons forward at the last instant; raptors
  take prey in their feet and carry it off; a storm hawk's feathers charged like a thunderhead's). Its single dive
  became a hover-and-stoop with a raked strike stretch (normal), a seize that carries the hero off and drops them (a
  new player state, `carried`) and a fence of storm feathers that crackles in pulses.
- **Ironhorn ram, round 1** (2026-11-06, owner: "next"): researched first (bighorn rams rear on their hind legs and
  drop into a horn clash heard across a valley, back off for a run-up and charge head down, hook sideways with the curl
  of their horns). Its stomp and shove became a rearing clash (normal), a run-up charge that pulls up on what it
  strikes (or is left reeling on a miss) and a horn hook at its flank.
- **Duskmane stalker, round 1** (2026-11-07, owner: "next"): researched first (a big cat stalks low and freezes before
  an explosive rush, melts into the dusk so prey sees only its tracks, swats with its forepaws, and sprints in on a
  line it cannot bend as sharply as dodging prey). Its claw, pounce and half-seen circling became a twin swat (normal),
  a dusk stalk round to the hero's back shown only by paw prints, and a sprint chase with a limited turn.
- **Ironhorn ram, round 2** (owner: "the effects are a bit plain"): its horns heat to a glow through every wind-up and
  glint just before the blow; strikes spray white-hot spark streaks that fall, run shock waves of steel light over the
  ground out to the true reach (fan-shaped for the clash and the hook, round for the charge's clash), sink a pit
  (fan-shaped under the clash) and fling rocks; its charge pushes a bow wave of air ahead of its horns and churns a
  plume of dust, clods and sparks behind it.
- **Gale hawk, round 2** (owner: "the swoop is short and unnatural; change the lift move to flying up and beating its
  wings into a thunderstorm (lightning)"): the stoop starts from a hover it draws off to (8 m out), eases off the
  hover, dives in a curve that is steep at first and flattens into a skim over the strike stretch, then pulls up 4 m
  on with hard beats (1.15 s in all, was a 0.55 s straight line). The seize and its carry are gone: Thunder Wings
  instead, five bolts out of the sky, each called onto where the hero stood on a downstroke.
- **Thicket mantis, round 1** (2026-11-06, owner: "next"): researched first (sit-and-wait hunter that sways to judge
  distance and shoots its spined forelegs; rears up and flashes eyespot wings, hissing, when threatened; can fly). Its
  scythe, whirl and hit-and-back-off became a swaying long-reach strike, a startle display that freezes the hero for its
  strike, and a flight that lands behind the hero.
- **Thicket mantis, round 2** (owner: "too few effects, the animation is unclear, the wings aren't pretty"): its poses
  are set in the model's own angles (the model is bound with its forelegs reaching: the old offsets left the strike
  looking like its rest): it rests with its forelegs folded tight (praying), sways wide, holds cocked high, then they
  snap out, open, with the body lunging in, hold a beat and fold back; the display throws them up and wide; the
  leap reaches in flight and slashes an X on landing. Its wings are painted (a rose-to-gold fanned hindwing with
  radiating veins, a scalloped edge and a ringed eyespot under a narrow leafy forewing) and unfold in steps. More
  beats: glints on its blades through the sway and in its eyes as the lane locks, glowing streaks with a rush of
  wind down the lane, a burst star and torn leaves on a hit; a gust of leaves as the wings snap open, pulsing
  eyespots, flares and a shock ring at the freeze, dizzy sparks round the frozen hero; dust whirling under the
  crouch, a gust ring at take-off, beating wings shedding leaves, a glowing X with sparks on landing.
- **Thicket mantis, round 3** (owner: "the peer strike shouldn't be a laser; twin crossed sword waves?"): its strike
  throws a pair of sword waves off its two scythes, crescents of green-gold light (the Spell Wave's ribbons) leaning
  opposite ways on screen so they cross in an X, flying down the lane, and an X cut on what they hit.
- **Hermit crab, round 1** (2026-11-06, owner: "go on"): its pinch and shell guard became a claw held as a shield
  (the front is guarded only through the wind-up: go round it), anemones that sting what goes round it (so circling
  to its back has its own answer), and the shell left behind (a window it opens itself: soft and fast until it gets
  home). The model has no soft body under its shell (its body bone carries the shell's lower half). Shrinking that
  bone away left stretched shards and a blob ("it isn't a crab at all"); a reef crab's body in its place was the
  wrong animal ("research the hermit crab first"). Out of its shell a hermit crab is a small hard front (cephalothorax),
  stalked eyes, two pairs of antennae, unequal claws, walking legs, and a soft, pale abdomen coiled to the right to
  fit a snail shell, with hooks at the tip that grip it. So the bare crab is its own model with the shell's triangles
  left out, a small orange front shield, two thin antennae and that coiled abdomen. Then (owner: "its legs come
  off; going back it must get into the shell where it was"): the leg roots, skinned half to the body, are kept, the
  shell's rim scraps dropped, and giving up the fight no longer snaps it back into a shell: it always walks back to
  the one it left (the sandbox waits for that too). Then (owner: "its legs float off the body"): the hard thorax
  reaches back to the walking legs' roots, the abdomen starts behind it, and (owner: "four legs a side, as with its shell") every leg stays as it is with the shell
  on, the hard body reaching back to the rearmost legs' roots.
- **Moss beetle, round 1** (2026-11-06, owner: "next"): its spit and shell guard became a bombardier beetle's rear spray
  (an attack made with its back turned: what looks like an opening is the danger), a dung beetle's moss ball (a
  rolling, growing shot that leaves a slowing patch) and a click beetle's play dead (a fake-out reaction whose leap is
  marked the moment it flips).
- **Sporecap, round 1** (2026-11-06, owner: "go on"): its puff-and-hop became a fairy ring (a ring with a safe middle:
  stay put or get out), stationary sprouts (a turret summon: break them or move) and a drifting sleep cloud (a slow
  build-up: leave before it puts you to sleep). All three families are new.
- **Elites, three attacks each** (2026-11-06, owner: "is there a reason the last two have only two skills?" then
  "make three; normal ones get one move"): the gull got a head perch (a rider shaken off by a dodge, a new family)
  and the boar a tusk toss (the hero thrown over its back, the first attack that moves the hero through the air:
  core player `tossed`). The elite system above.
- **Tusk boar, round 1** (2026-11-06, owner: "next"): its bite and single charge became a three-leg rampage (a charge
  that skids and re-aims, so each leg is a new sidestep) and a piglet stampede (a timed lane pattern with gaps to
  read). The old rule that a charge into a rock stuns stays.
- **Shore gull, round 1** (2026-11-06, owner: "next"): off the old peck-and-walk-away onto its own kit, from what a
  gull does: steals (a snatch along a curved swoop; the stolen gold comes back when it dies) and drops shellfish to
  crack them, then eats (a punish window it opens itself). Stealing and a self-made opening are new families.
- **Salt slime, round 1** (2026-11-05, owner: "the animations in the dungeon monsters are very good; next"): off the
  old coastal slap-and-spit onto its own kit, from what it is (seawater with salt on its back): a grab (engulf, held
  inside it), a change of the ground (a brine puddle that sets into salt) and splitting (a bud at half health), three
  families no monster had. The sandbox sets the split off itself.
- **Monster Lab as its own page** (2026-11-05, owner: "why not a separate test site like the skill tests, why the
  whole game"): the Pages route rebuilt and redeployed the whole 340 MB site for each round (~20 minutes). The
  sandbox is now also a standalone artifact like the Skill FX bench: `scripts/monster-lab-artifact.mjs` packs the
  list page, the game page in arena mode and only what the arena loads (about 40 MB; `.glb`/`.bin` as base64 text
  that the page's fetch decodes), published in seconds.
- **Stone pangolin** (2026-11-04): the tail lash became a blunt burst star with chips (claw marks stay on the
  rake). The roll ball looked bare (14 plates): it now wears the body's armour, rows of round domed plates with
  dark skin between them, moss, and the tail curled round it as a ridge. Fixed: the body stayed invisible after
  a roll.
