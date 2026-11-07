// Monster behaviours. Each monster has a readable pattern with a visible wind-up, so the
// player can learn it and use positioning (a charge that hits a rock stuns, a dive or a
// boulder marks the ground first). Monsters fight the player or the player's summons.
// States: idle, chase, windup, act, recover, retreat, emerge, stunned, shell, return, circle.

import { DEG, angleDiff, angleTo, clamp, dist, dirFromAngle } from './math.js';
import { monsterHit } from './defense.js';

// a monster projectile's look follows its attack's element (data/monsters.json); a physical one keeps the
// old looks (spit poison-green, an orb arcane-violet)
const projectileLook = (m, name) => {
  const e = monsterHit(m, name).element;
  return e !== 'physical' ? e : name === 'spit' ? 'poison' : 'arcane';
};

export function updateMonster(game, m, dt) {
  const def = m.def;
  // a rooted monster (Net Trap) walks nowhere but still strikes what is in reach
  const slowMult = (m.statuses.root ? 0 : 1) * (m.statuses.chill ? 1 - m.statuses.chill.slow : 1) * (m.buffs.howl ? 1 + m.buffs.howl.speed : 1);
  const enraged = def.enrageAt && m.hp / m.maxHp <= def.enrageAt;
  if (enraged && !m.enraged) {
    m.enraged = true;
    game.emit({ type: 'enrage', id: m.id, x: m.x, z: m.z });
  }
  // shock's twitch (core/game-simulation.js tickStatuses): everything pauses for a moment, then carries on
  if (m.twitchT > 0) { m.twitchT -= dt; m.moving = false; return; }
  const tempo = m.enraged ? 1.25 : 1;
  for (const k in m.cd) m.cd[k] = Math.max(0, m.cd[k] - dt * tempo);
  // an illusion (doubles) moves like its maker but never attacks, and pops when its time is up
  if (m.illusion) {
    for (const k in m.cd) m.cd[k] = 99;
    m.illusion.t -= dt;
    if (m.illusion.t <= 0) return game.killMonster(m);
  }
  // a sporecap's sprout (ai.js sprouts): rooted, it puffs a small cloud now and then and wilts at the end of its life
  if (m.sprout) return sproutStep(game, m, dt);
  m.stateT += dt;
  m.tauntT=Math.max(0,(m.tauntT||0)-dt);
  if (def.kit?.trail && m.state !== 'shell') dropTrail(game, m); // slime wherever it crawls
  // m.altTo: an attack's own height (the gale hawk climbs into its hover); its act sets m.alt itself (stoop)
  if (def.flyer) m.alt = approach(m.alt ?? def.hover, m.altTo ?? (m.state === 'act' ? 0.5 : m.state === 'recover' ? 0.9 : def.hover), (m.altTo ? 4 : m.state === 'act' ? 12 : 3) * dt);

  const t = pickTarget(game, m);
  const dHome = dist(m.x, m.z, m.homeX, m.homeZ);
  const valid = !!t;
  const dToT = t ? dist(m.x, m.z, t.x, t.z) : Infinity;
  const gap = t ? dToT - m.r - t.r : Infinity;

  if (!m.aggro && valid && m.state !== 'return' && dToT < def.aggroRange) setAggro(game, m, t);
  if (m.aggro && (!valid || dHome > def.leashRange) && !['act', 'windup'].includes(m.state)) {
    m.aggro = false;
    m.targetUnit = null;
    setState(m, 'return');
  }

  if (m.staggerT > 0) {
    m.staggerT -= dt;
    if (m.state !== 'windup' && m.state !== 'act' && m.state !== 'return') return; // flinching
  }

  // a hermit crab out of its shell goes back to that shell, wherever it is and whatever it was doing (its time up,
  // or the fight given up), and climbs in before anything else
  if (m.naked && m.naked.phase !== 'climb' && (m.state === 'chase' || m.state === 'idle' || m.state === 'return')) {
    if (m.naked.phase === 'loose' && (game.time >= m.naked.until || !m.aggro)) m.naked.phase = 'home';
    if (m.naked.phase === 'home') return nakedHome(game, m, dt, slowMult);
  }

  switch (m.state) {
    case 'idle':
      return idle(game, m, dt, slowMult);
    case 'return': {
      const done = walkTo(game, m, m.homeX, m.homeZ, def.speed * 1.4, dt);
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
      if (done || m.stateT > 8) setState(m, 'idle');
      return;
    }
    case 'windup':
      return windup(game, m, dt, t, gap);
    case 'act':
      return act(game, m, dt, t);
    case 'recover':
      if (m.stateT >= m.stateDur) {
        if (m.retreatPending && m.aggro && t) {
          m.retreatPending = false;
          const retreat = def.retreat;
          const away = dirFromAngle(angleTo(t.x, t.z, m.x, m.z));
          m.retreatTo = { x: m.x + away.x * retreat.distance, z: m.z + away.z * retreat.distance };
          setState(m, 'retreat', retreat.duration);
        } else setState(m, m.aggro ? 'chase' : 'idle');
      }
      return;
    case 'retreat':
      if (m.stateT >= m.stateDur || walkTo(game, m, m.retreatTo.x, m.retreatTo.z, def.speed * slowMult, dt)) {
        m.retreatTo = null;
        m.moving = false;
        setState(m, 'recover', def.retreat?.pause ?? 0.3);
      }
      return;
    case 'feign':
      // the beetle playing dead on its back; then it clicks and springs onto the spot marked as it flipped
      if (m.stateT >= m.stateDur) {
        const f = m.feign, atk = def.attacks.click;
        m.feign = null;
        m.charge = { t: 0, dur: atk.air, fromX: m.x, fromZ: m.z, toX: f.tx, toZ: f.tz, dive: true, hit: new Set(), dmg: 0 };
        game.emit({ type: 'click', id: m.id, x: m.x, z: m.z, tx: f.tx, tz: f.tz });
        setState(m, 'act');
        m.windup = { name: 'click', total: 0, angle: angleTo(m.x, m.z, f.tx, f.tz), tx: f.tx, tz: f.tz };
      }
      return;
    case 'emerge':
    case 'stunned':
      if (m.stateT >= m.stateDur) setState(m, m.aggro ? 'chase' : 'idle');
      return;
    case 'shell':
      if (m.stateT >= m.stateDur) {
        m.shell = false;
        if (m.nacre) {
          // the nacre coat held (the eye clam): what is left of it goes into its body, then it opens again
          const back = Math.min(m.nacre.hp, m.maxHp - m.hp);
          m.hp += back;
          game.emit({ type: 'nacre', id: m.id, x: m.x, z: m.z, held: true, healed: back });
          m.nacre = null;
          return setState(m, 'chase');
        }
        const sh = def.attacks.shell || {}, emerge = sh.emerge, counter = sh.counter && def.attacks[sh.counter];
        // a counter: it reopens straight into that attack, punishing who waited in front
        if (counter && t && gap <= (counter.use?.max ?? counter.range)) { m.cd[sh.counter] = 0; return beginAttack(game, m, sh.counter, t); }
        setState(m, emerge ? 'emerge' : 'chase', emerge || 0);
      }
      return;
    default:
      if (!m.aggro || !t) return setState(m, 'idle');
      return BEHAVIORS[def.behavior](game, m, dt, { t, gap, dToT, slowMult, tempo });
  }
}

/** Who this monster fights: the player, or a summon that is closer and bothering it. */
function pickTarget(game, m) {
  const p = game.player, hiddenHero = (p.stealthT || 0) > 0; // Stealth (core/rogue.js): out of sight
  if(m.tauntT>0){const forced=game.units().find(u=>u.id===m.forcedTargetId);if(forced&&!game.isSafe(forced.x,forced.z)&&!(forced===p&&hiddenHero)){m.targetUnit=forced;return forced;}}
  const units = [];
  if (!p.dead && !game.isSafe(p.x, p.z) && !hiddenHero) units.push(p);
  for (const a of game.allies) if (!a.dead && a.life > 0) units.push(a);
  if (!units.length) return null;
  let cur = m.targetUnit && units.includes(m.targetUnit) ? m.targetUnit : null;
  let best = null;
  let bd = Infinity;
  for (const u of units) {
    const d = dist(m.x, m.z, u.x, u.z);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  if (!cur) cur = best;
  else if (best !== cur && bd < dist(m.x, m.z, cur.x, cur.z) - 2.5) cur = best;
  if (!m.aggro) cur = p.dead || game.isSafe(p.x, p.z) || hiddenHero ? best : p;
  m.targetUnit = cur;
  return cur;
}

export function setAggro(game, m, unit = null, force = false) {
  if (m.dead) return;
  const fresh = !m.aggro;
  if (fresh) {
    game.emit({ type: 'aggro', id: m.id });
    if (m.def.attacks.howl && m.cd.howl <= 0.01 && m.state !== 'windup') m.wantsHowl = true;
  }
  m.aggro = true;
  if (unit && (force || !m.targetUnit)) m.targetUnit = unit;
  // a dormant boulder first stands up (its stones stack into the golem): no attack while it wakes
  if (fresh && m.def.dormant && m.state === 'idle') setState(m, 'emerge', m.def.dormant.wake);
  else if (m.state === 'idle' || m.state === 'return') setState(m, 'chase');
  // a pack animal brings its packmates in range with it (def.packAssist metres)
  const assist = m.def.packAssist, pack = m.spawn?.pack;
  if (fresh && assist && pack) {
    for (const o of game.monsters) {
      if (o !== m && !o.dead && !o.aggro && o.spawn?.pack === pack && dist(m.x, m.z, o.x, o.z) <= assist) setAggro(game, o, unit || m.targetUnit);
    }
  }
}

export function onMonsterHit(game, m, by = null) {
  setAggro(game, m, by || game.player, !!by);
  if (m.def.behavior === 'stalker') { m.revealT = 2; m.stealth = false; }
  // shed (the pearl slug): hit hard, it drops stinging patches round itself and slips away
  const shed = m.def.attacks.shed;
  if (shed && m.state !== 'windup' && m.state !== 'act' && !m.dead) {
    m.recentHits.push(game.time);
    m.recentHits = m.recentHits.filter((t) => game.time - t <= shed.window);
    if (m.recentHits.length >= shed.hitsToTrigger && m.cd.shed <= 0) { m.recentHits = []; shedPatches(game, m); }
    return;
  }
  if (m.def.attacks.acid) return canUse(m, 'acid') ? acidHit(game, m, by || game.player) : undefined;
  const click = m.def.attacks.click;
  if (click) {
    // hit hard, the beetle flips on its back and plays dead; the spot it will spring onto is marked at once
    if (!canUse(m, 'click') || m.state === 'feign' || m.state === 'act' || m.state === 'windup' || m.dead) return;
    m.recentHits.push(game.time);
    m.recentHits = m.recentHits.filter((t) => game.time - t <= click.window);
    if (m.recentHits.length >= click.hitsToTrigger && m.cd.click <= 0) { m.recentHits = []; feignDead(game, m, by || game.player); }
    return;
  }
  const nacre = m.def.attacks.nacre;
  if (nacre) {
    if (!canUse(m, 'nacre')) return;
    if (m.state === 'shell' || m.state === 'act' || m.dead) return;
    m.recentHits.push(game.time);
    m.recentHits = m.recentHits.filter((t) => game.time - t <= nacre.window);
    if (m.recentHits.length >= nacre.hitsToTrigger && m.cd.nacre <= 0) { m.recentHits = []; coatNacre(game, m); }
    return;
  }
  const sh = m.def.attacks.shell;
  if (!sh || m.state === 'shell' || m.state === 'act') return;
  m.recentHits.push(game.time);
  m.recentHits = m.recentHits.filter((t) => game.time - t <= sh.window);
  if (m.recentHits.length >= sh.hitsToTrigger && m.cd.shell <= 0) {
    m.recentHits = [];
    enterShell(game, m);
  }
}

function shedPatches(game, m) {
  const sh = m.def.attacks.shed, lvl = 1 + (m.level - 1) * 0.15;
  m.cd.shed = sh.cooldown;
  for (let i = 0; i < sh.patches; i++) {
    const a = m.facing + (i / sh.patches) * Math.PI * 2, x = m.x + Math.sin(a) * sh.spread, z = m.z + Math.cos(a) * sh.spread;
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'shed', kind: 'sting_patch', x, z, radius: sh.radius, delay: sh.windup, duration: sh.duration, // marked `windup` s before they sting
       tick: sh.tick, damage: sh.dps * sh.tick * lvl });
  }
  game.emit({ type: 'shed', id: m.id, x: m.x, z: m.z });
  // then it slips away from what hit it
  const t = m.targetUnit || game.player, away = dirFromAngle(angleTo(t.x, t.z, m.x, m.z));
  m.melee = null; m.charge = null;
  m.retreatTo = { x: m.x + away.x * sh.slip, z: m.z + away.z * sh.slip };
  setState(m, 'retreat', sh.slipTime);
}

/**
 * acid (the pearl slug): hit `hitsToTrigger` times within `window` s, its skin froths with acid after `windup` s and
 * stays so for `duration` s; while it does, each hit from a unit within `reach` m squirts acid back at that unit (at
 * most every `every` s). Out of reach, or holding off, is safe.
 */
function acidHit(game, m, by) {
  const ac = m.def.attacks.acid;
  if (m.dead) return;
  if (game.time >= (m.acidFrom ?? Infinity) && game.time <= m.acidUntil) {
    if (!by || by.dead || game.time < (m.acidNext || 0) || dist(m.x, m.z, by.x, by.z) - m.r - (by.r || 0) > ac.reach) return;
    m.acidNext = game.time + ac.every;
    game.emit({ type: 'acidSquirt', id: m.id, x: m.x, z: m.z, tx: by.x, tz: by.z });
    game.damageUnit(by, m.damage * (ac.damageMult || 1), m, { attack: 'acid' });
    return;
  }
  if (m.state === 'windup' || m.state === 'act') return;
  m.recentHits.push(game.time);
  m.recentHits = m.recentHits.filter((t) => game.time - t <= ac.window);
  if (m.recentHits.length < ac.hitsToTrigger || m.cd.acid > 0) return;
  m.recentHits = [];
  m.cd.acid = ac.cooldown;
  m.acidFrom = game.time + ac.windup;
  m.acidUntil = m.acidFrom + ac.duration;
  game.emit({ type: 'acidSkin', id: m.id, x: m.x, z: m.z, delay: ac.windup, duration: ac.duration, reach: ac.reach });
}

/**
 * nacre (the eye clam): hit `hitsToTrigger` times within `window` s, it clamps shut and coats itself with nacre worth
 * `shield` of its health for `duration` s (core hitMonster: the coat takes the damage). Broken through, it cracks open
 * stunned for `crackStun` s, taking `exposedTaken` times damage; if the coat holds, what is left of it heals it.
 */
function feignDead(game, m, t) {
  const atk = m.def.attacks.click;
  m.cd.click = atk.cooldown;
  m.moving = false; m.melee = null; m.charge = null;
  m.feign = { tx: t.x, tz: t.z };
  setState(m, 'feign', atk.feign);
  game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'click', kind: 'click', x: t.x, z: t.z, radius: atk.radius, delay: atk.feign + atk.air, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
  game.emit({ type: 'feign', id: m.id, x: m.x, z: m.z, duration: atk.feign });
}

function coatNacre(game, m) {
  const nc = m.def.attacks.nacre;
  m.cd.nacre = nc.cooldown;
  m.moving = false;
  m.melee = null;
  m.nacre = { hp: m.maxHp * nc.shield, max: m.maxHp * nc.shield };
  setState(m, 'shell', nc.duration);
  game.emit({ type: 'nacre', id: m.id, x: m.x, z: m.z, coat: m.nacre.max, duration: nc.duration });
}

/** The eye clam's nacre takes `dmg`; returns what gets through (the rest of a blow that breaks it does not). */
export function nacreAbsorb(game, m, dmg) {
  const nc = m.def.attacks.nacre, n = m.nacre;
  n.hp -= dmg;
  if (n.hp > 0) return 0;
  m.nacre = null;
  m.shell = false;
  game.emit({ type: 'nacre', id: m.id, x: m.x, z: m.z, broken: true });
  setState(m, 'stunned', nc.crackStun);
  m.exposed = nc.exposedTaken;
  return 0;
}

function enterShell(game, m) {
  const sh = m.def.attacks.shell;
  m.cd.shell = sh.cooldown;
  m.shell = true;
  m.moving = false;
  m.melee = null;
  m.guardAttacks = 0;
  setState(m, 'shell', sh.duration);
  game.emit({ type: 'shell', id: m.id });
}

/** Distance from (x, z) to the segment (ax, az)-(bx, bz). */
export function segDist(x, z, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz, k = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
  return Math.hypot(x - ax - vx * k, z - az - vz * k);
}

function setState(m, state, dur = 0) {
  if (state !== 'stunned') m.exposed = 0; // the eye clam's cracked shell closes again
  m.roaring = false; // the phase roar is its own recover (kit)
  // out of the act, nothing is left up in the air (Greyfang's moon leap) or mid-rush
  if (state !== 'act') { if (m.leap) { m.leap = null; m.targetable = true; } m.rush = null; m.fangs = null; m.stoop = null; m.storm = null; if (m.stalk) { m.stalk = null; m.stealth = false; m.targetable = true; } m.sprint = null; m.orbit = null; m.volley = null; m.search = null; if (state !== 'windup') m.altTo = null; if (m.coil?.unit?.statuses?.root) delete m.coil.unit.statuses.root; m.coil = null; }
  m.state = state;
  m.stateT = 0;
  m.stateDur = dur;
  if (state !== 'windup' && state !== 'act') m.windup = null;
  if (state === 'return' || state === 'idle') {
    m.sweep = null;
    m.melee = null;
    m.suck = null;
    m.grind = null;
    m.hold = null;
    m.swoop = null;
    m.drop = null;
    m.rampage = null;
    m.stampede = null;
    m.perch = null;
    m.bombard = null;
    m.lap = null;
    m.drag = null;
    m.retreatPending = false;
    m.retreatTo = null;
    m.shell = false;
    m.guardAttacks = 0;
  }
}

function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

function idle(game, m, dt, slowMult) {
  // a dormant monster (def.dormant: the warden lying as a boulder) does not wander
  if (m.def.dormant) {
    m.moving = false;
    return;
  }
  if (m.wanderT === undefined || m.wanderT <= 0) {
    m.wanderT = game.rng.range(2.5, 6);
    if (game.rng.chance(0.6)) {
      const a = game.rng.range(0, Math.PI * 2);
      const r = game.rng.range(1, 5);
      m.wanderTo = { x: m.homeX + Math.sin(a) * r, z: m.homeZ + Math.cos(a) * r };
    } else m.wanderTo = null;
  }
  m.wanderT -= dt;
  if (m.wanderTo && !walkTo(game, m, m.wanderTo.x, m.wanderTo.z, m.def.speed * 0.45 * slowMult, dt)) return;
  m.wanderTo = null;
  m.moving = false;
}

/** Walk toward a point. Returns true when arrived. */
function walkTo(game, m, x, z, speed, dt, turn = 8) {
  const d = dist(m.x, m.z, x, z);
  // rooted (Net Trap): no walking of any kind, home included, until it wears off
  if (m.statuses?.root && d >= 0.3) { m.moving = false; return false; }
  if (d < 0.3) {
    m.moving = false;
    return true;
  }
  const a = angleTo(m.x, m.z, x, z);
  turnToward(m, a, dt, turn);
  const step = Math.min(d, speed * dt);
  const before = { x: m.x, z: m.z };
  game.moveEntity(m, Math.sin(a) * step, Math.cos(a) * step);
  // stuck on a cliff or a tree: try sliding around it
  if (dist(before.x, before.z, m.x, m.z) < step * 0.25) {
    const side = m.id % 2 ? 1 : -1;
    game.moveEntity(m, Math.sin(a + side * 1.2) * step, Math.cos(a + side * 1.2) * step);
  }
  m.moving = true;
  return false;
}

function turnToward(m, a, dt, rate) {
  const d = angleDiff(m.facing, a);
  m.facing += clamp(d, -rate * dt, rate * dt);
}

function startWindup(game, m, name, t, extra = {}) {
  const atk = m.def.attacks[name];
  const tempo = m.enraged ? 0.85 : 1;
  setState(m, 'windup');
  // keepFacing: an attack made without turning (the pangolin's tail lash at what is behind it)
  // rear: an attack aimed out behind it without turning (the hermit crab's anemones)
  const angle = (t && !atk.keepFacing ? angleTo(m.x, m.z, t.x, t.z) : m.facing) + (atk.rear ? Math.PI : 0);
  m.windup = { name, total: atk.windup * tempo, angle, ...extra };
  m.stealth = false; // every wind-up is shown in full
  if (!atk.rear) m.facing = angle + (atk.backward ? Math.PI : 0); // backward: it turns its back to its aim (the beetle's spray)
  m.moving = false;
  game.emit({ type: 'windup', id: m.id, name, total: m.windup.total, angle, x: m.x, z: m.z, radius: atk.radius, range: atk.range || atk.maxRange });
}

function windup(game, m, dt, t, gap) {
  const w = m.windup;
  const atk = m.def.attacks[w.name];
  // an attack may borrow the mechanics of another (data: attacks.<name>.kind), keeping its own name and look
  const kind = atk.kind || w.name;
  // track the target during the first part of the wind-up, then lock (dodgeable)
  if (t && !atk.keepFacing && m.stateT < w.total * 0.55 && !['slam', 'pound', 'dive', 'throw', 'puff', 'howl', 'venom', 'pounce', 'stomp', 'shards', 'quake', 'erupt', 'shard_rain', 'drum', 'doubles', 'skip', 'engulf', 'snatch', 'shell_drop', 'perch', 'fairy_ring', 'pincer', 'shell_shed', 'startle', 'rally', 'moon_leap', 'phantom_rush', 'marsh_gas', 'bog_lure', 'stoop', 'thunder_wings', 'storm_feathers', 'hook', 'dusk_stalk', 'hammer_fists', 'boulder_hurl', 'rock_orbit', 'rune_seal', 'shield_wall', 'lava_fissure', 'core_eruption'].includes(kind)) {
    w.angle = angleTo(m.x, m.z, t.x, t.z);
    m.facing = w.angle + (atk.backward ? Math.PI : 0);
  }
  // the gale hawk's stoop: the spot follows its prey until `lock` of the wind-up, then holds (dodgeable); meanwhile it
  // draws off to `standoff` m from the spot at `backSpeed` m/s, climbing, so its stoop is a long one
  if (kind === 'stoop' && t) {
    if (m.stateT < w.total * (atk.lock ?? 0.6)) { w.tx = t.x; w.tz = t.z; }
    const d = dist(m.x, m.z, w.tx, w.tz), a = angleTo(w.tx, w.tz, m.x, m.z);
    if (d < atk.standoff) { const step = Math.min(atk.standoff - d, atk.backSpeed * dt); game.moveEntity(m, Math.sin(a) * step, Math.cos(a) * step); }
    w.angle = angleTo(m.x, m.z, w.tx, w.tz); m.facing = w.angle;
  }
  // the horned warden behind its shield (shield_wall): it turns to keep its shield on its prey, but only at `guardTurn`
  // rad/s, so a prey circling fast gets round to its back
  if (kind === 'shield_wall' && t) { turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, atk.guardTurn); w.angle = m.facing; }
  // `backoff` (m): it backs away from its prey through the first 60% of the wind-up, facing it (the ironhorn ram's
  // run-up before its charge)
  if (atk.backoff && m.stateT < w.total * 0.6) {
    const d = dirFromAngle(w.angle), step = (atk.backoff / (w.total * 0.6)) * dt;
    game.moveEntity(m, -d.x * step, -d.z * step);
    m.backing = true;
  } else m.backing = false;
  if (m.stateT < w.total) return;
  const dmg = m.damage * (atk.damageMult || 1);
  switch (kind) {
    case 'slap':
    case 'peck':
    case 'pinch':
    case 'scythe':
    case 'claw':
    case 'whirl':
    case 'rend':
    case 'rake':
    case 'claw_guard': // the hermit crab's: its claw held up as a shield through the wind-up (game hitMonster)
      // A stationary strike has its own contact time and follow-through. It never
      // uses the charge collision path, and only tests the locked frontal arc once.
      m.melee = { name: w.name, angle: w.angle, damage: dmg, hit: false };
      setState(m, 'act', atk.duration);
      return;
    case 'bite':
    case 'sweep':
    case 'shove': {
      const arc = (atk.arc || 120) * DEG;
      // `lunge` (m): it drops forward onto the blow (the ironhorn ram's rearing clash), then strikes from there
      if (atk.lunge) { const d = dirFromAngle(w.angle); game.moveEntity(m, d.x * atk.lunge, d.z * atk.lunge); }
      game.emit({ type: 'monsterSwing', id: m.id, name: w.name, angle: w.angle, range: atk.range + m.r, arc: atk.arc || 120, x: m.x, z: m.z });
      for (const u of game.units()) {
        const g = dist(m.x, m.z, u.x, u.z) - m.r - u.r;
        const inArc = Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) <= arc / 2;
        if (inArc && g <= atk.range + 0.4) game.damageUnit(u, dmg, m, { attack: w.name, knock: atk.knock ? { angle: angleTo(m.x, m.z, u.x, u.z), force: atk.knock } : undefined });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'shield_wall': {
      // the warden's guard ends in a bash of its shield across `arc` degrees, `range` m: harder by `perBlock` for each
      // blow its shield turned (up to `maxBlocks`, game hitMonster), and flinging what it strikes `knock` m
      const n = Math.min(atk.maxBlocks, m.blocked || 0), arc = atk.arc * DEG, hard = dmg * (1 + atk.perBlock * n);
      game.emit({ type: 'shieldBash', id: m.id, x: m.x, z: m.z, angle: w.angle, arc: atk.arc, range: atk.range + m.r, blocked: n });
      for (const u of game.units()) {
        if (dist(m.x, m.z, u.x, u.z) - m.r - u.r > atk.range || Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) > arc / 2) continue;
        game.damageUnit(u, hard, m, { attack: w.name, knock: { angle: angleTo(m.x, m.z, u.x, u.z), force: atk.knock } });
      }
      m.blocked = 0;
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'lava_fissure': {
      // its fist is in the ground: the cracks marked at wind-up start (beginAttack) split open on their own
      game.emit({ type: 'fissureFist', id: m.id, x: m.x, z: m.z, angle: w.angle });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'core_eruption': {
      // its core bursts: every unit within `radius` m is struck unless it stands in the shadow of a slab (behind it, seen
      // from the warden, within half the slab's `slabWidth` widening a little with distance, at most `shadow` m back)
      const covered = (u) => w.slabs.some((sl) => {
        const a = angleTo(m.x, m.z, sl.x, sl.z), d = dirFromAngle(a), dx = u.x - sl.x, dz = u.z - sl.z;
        const along = dx * d.x + dz * d.z, side = Math.abs(dx * d.z - dz * d.x);
        return along > 0.3 && along <= atk.shadow && side <= atk.slabWidth / 2 + along * 0.12 - u.r * 0.5;
      });
      game.emit({ type: 'coreBlast', id: m.id, x: m.x, z: m.z, radius: atk.radius, slabs: w.slabs });
      for (const u of game.units()) {
        if (dist(m.x, m.z, u.x, u.z) > atk.radius + u.r || covered(u)) continue;
        game.damageUnit(u, dmg, m, { attack: w.name, knock: { angle: angleTo(m.x, m.z, u.x, u.z), force: 3 } });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'hook': {
      // the ironhorn ram hooks its horns to the side its prey stood on (w.side, fixed at wind-up start, its facing kept):
      // units within `range` m in the `arc` degrees centred `off` degrees round that side are struck and flung `knock`
      // out that way
      const c = w.angle, arc = (atk.arc || 140) * DEG, out = w.face + w.side * Math.PI / 2;
      game.emit({ type: 'hornHook', id: m.id, x: m.x, z: m.z, angle: c, arc: atk.arc, range: atk.range + m.r, side: w.side });
      for (const u of game.units()) {
        if (dist(m.x, m.z, u.x, u.z) - m.r - u.r > atk.range || Math.abs(angleDiff(c, angleTo(m.x, m.z, u.x, u.z))) > arc / 2) continue;
        game.damageUnit(u, dmg, m, { attack: w.name, knock: { angle: out, force: atk.knock } });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'charge': {
      // the first carom (a ricochet) turns toward the side its prey is on as it sets off
      const side = t && angleDiff(w.angle, angleTo(m.x, m.z, t.x, t.z)) < 0 ? -1 : 1;
      m.charge = { name: w.name, t: 0, dur: atk.duration, speed: atk.speed, angle: w.angle, hit: new Set(), dmg, left: 0, leg: 0, any: false, side, struck: atk.legs ? new Map() : null };
      m.cd[w.name] = atk.cooldown;
      setState(m, 'act');
      m.windup = { ...w };
      game.emit({ type: 'charge', id: m.id, angle: w.angle });
      return;
    }
    case 'spit':
    case 'orb': {
      // a shot warned by a lane (tell "lane": the pearl fish's jet) flies along the lane it showed
      const aimed = atk.tell === 'lane';
      const a = aimed ? w.angle : t ? angleTo(m.x, m.z, t.x, t.z) : w.angle;
      const dir = dirFromAngle(a);
      game.spawnProjectile({
        owner: 'monster',
        sourceId: m.id,
        kind: w.name,
        attack: w.name,
        x: m.x + dir.x * (m.r + 0.2),
        z: m.z + dir.z * (m.r + 0.2),
        y: m.def.hover ? m.def.hover + 0.1 : 0.7,
        angle: a,
        speed: atk.speed,
        radius: atk.projectileRadius ?? 0.35,
        range: aimed ? atk.range : atk.range + 3,
        element: projectileLook(m, w.name),
        damage: dmg,
        poison: atk.poisonDps ? { dps: atk.poisonDps * (1 + (m.level - 1) * 0.15), duration: atk.poisonDuration } : null,
      });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'slam': {
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'slam', kind: 'slam', x: m.x, z: m.z, radius: atk.radius, delay: 0, duration: 0.3, damage: dmg });
      if (m.enraged) game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'slam', kind: 'shockwave', x: m.x, z: m.z, radius: atk.radius, maxRadius: atk.shockwaveMax, growth: atk.shockwaveSpeed, duration: (atk.shockwaveMax - atk.radius) / atk.shockwaveSpeed, damage: dmg * 0.6 });
      m.cd.slam = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'stomp':
    case 'shards':
      // a ring around the monster, marked on the ground for the whole wind-up
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: w.name, x: m.x, z: m.z, radius: atk.radius, delay: 0, duration: 0.3, damage: dmg });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    case 'beam':
    case 'lash': {
      // a straight line from the monster, locked during the last part of the wind-up
      // (the sentinel's beam, and the viper's fang lash, which is short and fast)
      const dir = dirFromAngle(w.angle), half = atk.width / 2;
      game.emit({ type: 'beam', kind: w.name, id: m.id, x: m.x, z: m.z, angle: w.angle, length: atk.range, width: atk.width });
      for (const u of game.units()) {
        const dx = u.x - m.x, dz = u.z - m.z, along = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x);
        // pull (the snail king's harpoon): what it strikes is dragged toward it, stopping short of its body
        const pull = atk.pull ? Math.min(atk.pull, along - m.r - u.r - 0.6) : 0;
        if (along >= 0 && along <= atk.range + u.r && side <= half + u.r) game.damageUnit(u, dmg, m, { attack: w.name, knock: pull > 0 ? { angle: angleTo(u.x, u.z, m.x, m.z), force: pull } : undefined });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'beam_sweep': {
      // a beam that sweeps `arc` degrees across the target over `sweepTime` s (the snail king's pearl): each unit is
      // hit once, when the beam crosses it; behind the monster, or ahead of the beam's end, is safe
      const side = m.id % 2 ? 1 : -1, half = (atk.arc * DEG) / 2;
      m.sweep = { name: w.name, t: 0, dur: atk.sweepTime, from: w.angle - side * half, to: w.angle + side * half, hit: new Set(), dmg };
      game.emit({ type: 'beamSweep', id: m.id, x: m.x, z: m.z, from: m.sweep.from, to: m.sweep.to, duration: atk.sweepTime, length: atk.range, width: atk.width });
      setState(m, 'act');
      return;
    }
    case 'erupt': {
      // the mole dug toward the marked spot during the wind-up; it surfaces there as the ground bursts
      // (the area was spawned at wind-up start and fires by itself)
      const spot = game.freeSpotNear ? game.freeSpotNear(w.tx, w.tz) : { x: w.tx, z: w.tz };
      if (!game.isSafe(spot.x, spot.z)) {
        game.emit({ type: 'surface', id: m.id, fromX: m.x, fromZ: m.z, x: spot.x, z: spot.z });
        m.x = spot.x;
        m.z = spot.z;
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'volley': {
      // `count` darts fanned `spread` degrees about the locked aim, each its own projectile
      for (let i = 0; i < atk.count; i++) {
        const a = w.angle + ((i / Math.max(1, atk.count - 1)) - 0.5) * atk.spread * DEG, dir = dirFromAngle(a);
        game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: w.name, attack: w.name, x: m.x + dir.x * (m.r + 0.2), z: m.z + dir.z * (m.r + 0.2), y: 0.8, angle: a, speed: atk.speed, radius: atk.projectileRadius ?? 0.3, range: atk.range, element: m.def.element || 'physical', damage: dmg });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'trail': {
      // a slide along the locked lane at `speed` for `duration` s, hitting what it runs into, and leaving a
      // lingering pool every `every` m (the pearl slug's mucus)
      m.charge = { name: w.name, t: 0, dur: atk.duration, speed: atk.speed, angle: w.angle, hit: new Set(), dmg, trail: { left: 0, every: atk.every } };
      m.cd[w.name] = atk.cooldown;
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
    case 'drum': {
      // the leaf tanuki's belly drum: `beats` rings run out from it, `beat` s apart, to `radius`; the last is
      // wider and knocks back. Each ring hits a unit once, as it passes (a step through it, or out of reach, is safe)
      for (let i = 0; i < atk.beats; i++) {
        const last = i === atk.beats - 1, max = atk.radius * (last ? atk.lastScale || 1 : 1);
        game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: 'shockwave', look: 'drum', beat: i, x: m.x, z: m.z, radius: 0.6, maxRadius: max, growth: atk.waveSpeed, delay: i * atk.beat, duration: (max - 0.6) / atk.waveSpeed, damage: dmg, knock: last ? atk.knock : 0 });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', (atk.beats - 1) * atk.beat + atk.recover);
    }
    case 'boomerang': {
      // the leaf from its head, thrown along the locked line: out to `range`, then back to it
      const dir = dirFromAngle(w.angle);
      game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: w.name, attack: w.name, boomerang: true, x: m.x + dir.x * (m.r + 0.2), z: m.z + dir.z * (m.r + 0.2), y: 0.9, angle: w.angle, speed: atk.speed, radius: atk.projectileRadius ?? 0.45, range: atk.range, element: m.def.element || 'physical', damage: dmg });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'doubles': {
      // a puff of leaves and `count` copies of itself stand beside it: they move with it but never attack,
      // pop at a touch (1 HP) and fade after `life` s; once a fight (`use.once`)
      for (let i = 0; i < atk.count; i++) {
        const a = w.angle + (i % 2 ? 1.6 : -1.6) * (1 + Math.floor(i / 2) * 0.5);
        let x = m.x + Math.sin(a) * 2.2, z = m.z + Math.cos(a) * 2.2;
        if (!game.world.isFree(x, z, m.r)) { x = m.x; z = m.z; }
        const c = game.spawnMinion(m.type, m.level, x, z);
        Object.assign(c, { illusion: { t: atk.life, of: m.id }, hp: 1, maxHp: 1, homeX: x, homeZ: z, facing: m.facing });
        setAggro(game, c, t || game.player);
      }
      m.used = { ...(m.used || {}), [w.name]: true };
      game.emit({ type: 'doubles', id: m.id, x: m.x, z: m.z, count: atk.count });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'shard_rain':
      // the moth's falling glass shards were marked at wind-up start and go off by themselves
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    case 'quake':
      // the eruptions were marked along the line at wind-up start and go off one after another
      m.cd.quake = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    case 'pound':
      // the telegraphed area was spawned at wind-up start and fires by itself
      m.cd.pound = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    case 'throw': {
      // the landing circle was marked at wind-up start; now the boulder flies
      game.emit({ type: 'lob', id: m.id, fromX: m.x, fromZ: m.z, x: w.tx, z: w.tz, duration: atk.flight });
      m.cd.throw = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'puff': {
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: atk.areaKind || 'spore_cloud', x: m.x, z: m.z, radius: atk.radius, delay: 0, duration: atk.duration, tick: 0.5, damage: atk.dps * 0.5 * (1 + (m.level - 1) * 0.14) });
      m.cd[w.name] = atk.cooldown;
      // hop away from the cloud (a sporecap); a flyer simply drifts on
      const hop = m.def.attacks.hop;
      if (!hop || hop.kind) return setState(m, 'recover', atk.recover || 0.4);
      const away = t ? angleTo(t.x, t.z, m.x, m.z) : m.facing + Math.PI;
      m.charge = { t: 0, dur: hop.duration, speed: hop.distance / hop.duration, angle: away + game.rng.range(-0.6, 0.6), hit: new Set(), dmg: 0, hop: true };
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
    case 'skip': {
      // the hops run one after another: `air` s in the air each, `pause` s on the ground between
      m.charge = { skip: true, hops: w.hops || [], i: 0, t: 0, fromX: m.x, fromZ: m.z, hit: new Set(), dmg: 0 };
      m.cd[w.name] = atk.cooldown;
      setState(m, 'act');
      m.windup = { ...w };
      if (!m.charge.hops.length) { m.charge = null; return setState(m, 'recover', atk.recover); }
      return;
    }
    case 'scuttle': {
      // a crab's sweep: facing its prey it scuttles `sway` m to one side and back across to the other and home (two
      // passes, `duration` s), claws out; whatever is in front of it within `range` m as it passes is clipped, once a
      // pass. Stepping aside does not escape it; stepping back out of reach does.
      m.charge = { scuttle: true, t: 0, dur: atk.duration, ox: m.x, oz: m.z, angle: w.angle, half: atk.sway, reach: atk.range, hits: [new Set(), new Set()], dmg };
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
    case 'bubble_mines': {
      // bubbles blown out to hang in the air: `count` of them `spread` m apart across the aim, as far as the prey is
      // (2 m to `range`); each drifts there over `drift` s, then waits `life` s and bursts on the first thing that
      // touches it (core area `mine`), or floats off harmlessly
      const dir = dirFromAngle(w.angle), px = dir.z, pz = -dir.x;
      const D = Math.max(2, Math.min(atk.range, t ? dist(m.x, m.z, t.x, t.z) : atk.range));
      for (let i = 0; i < atk.count; i++) {
        const lat = (i - (atk.count - 1) / 2) * atk.spread, fwd = D - Math.abs(lat) * 0.25;
        const x = m.x + dir.x * fwd + px * lat, z = m.z + dir.z * fwd + pz * lat;
        if (game.isSafe(x, z)) continue;
        game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: 'bubble_mine', mine: true, x, z, radius: atk.radius, delay: atk.drift, duration: atk.life, damage: dmg });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'mirror_decoy': {
      // the moth leaves a mirror image of itself where it hung, a bomb going off after `fuse` s, and flies back
      // to the spot marked at wind-up start (beginAttack) over `air` s
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: 'mirror_bomb', x: m.x, z: m.z, radius: atk.radius, delay: atk.fuse, duration: 0.3, damage: dmg });
      m.charge = { t: 0, dur: atk.air, fromX: m.x, fromZ: m.z, toX: w.tx, toZ: w.tz, dive: true, hit: new Set(), dmg: 0 };
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
    case 'suction': {
      // the pearl fish's gulp: for `duration` s what stands in its cone is drawn toward its mouth (act: m.suck), then
      // its jaws snap shut on what is within `bite` m of the mouth
      m.suck = { name: w.name, angle: w.angle, dmg };
      return setState(m, 'act', atk.duration);
    }
    case 'wave': {
      // the pearl fish slaps the ground with its tail: a crest of water rolls out along its facing at `speed` m/s to
      // `range` m, `arc` degrees wide (so it widens as it goes), striking each unit once as it passes (a shockwave
      // with an arc); behind it and beside the cone is safe
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: 'shockwave', look: 'wave', angle: w.angle, arc: atk.arc, x: m.x, z: m.z, radius: m.r, maxRadius: m.r + atk.range, growth: atk.speed, duration: atk.range / atk.speed, damage: dmg, knock: atk.knock || 0 });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'drifters': {
      // stingers lifted off the pearl slug's plumes, `count` fanned `spread` degrees: each drifts after the prey at
      // `speed` m/s, turning at most `turn` rad/s (core projectile `homing`), and stings the first thing it touches,
      // or fades after `range` m
      const prey = t || game.player;
      for (let i = 0; i < atk.count; i++) {
        const a = w.angle + ((i / Math.max(1, atk.count - 1)) - 0.5) * atk.spread * DEG, dir = dirFromAngle(a);
        game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: w.name, attack: w.name, x: m.x + dir.x * (m.r + 0.2), z: m.z + dir.z * (m.r + 0.2), y: 1.0, angle: a, speed: atk.speed, radius: atk.projectileRadius ?? 0.35, range: atk.range, element: m.def.element || 'physical', damage: dmg, homing: { unit: prey, turn: atk.turn } });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'gaze': {
      // the eye clam's stare: what stands in its cone (`range`, `arc`) and faces it (within 90 degrees) is struck and
      // held fast (the attack's inflict); a back turned to it is safe
      const arc = (atk.arc || 60) * DEG, at = [];
      for (const u of game.units()) {
        const toward = angleTo(u.x, u.z, m.x, m.z);
        if (dist(m.x, m.z, u.x, u.z) - m.r - u.r > atk.range || Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) > arc / 2) continue;
        if (Math.abs(angleDiff(u.facing ?? toward, toward)) > Math.PI / 2) continue; // it looked away
        at.push([u.x, u.z]);
        game.damageUnit(u, dmg, m, { attack: w.name });
      }
      game.emit({ type: 'gaze', id: m.id, x: m.x, z: m.z, angle: w.angle, range: atk.range + m.r, arc: atk.arc, at });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'grind': {
      // the snail king's radula: it rasps along the lane before it (`range` x `width`) for `duration` s, striking what
      // is in the lane at each of its `ticks` passes (act: m.grind)
      m.grind = { name: w.name, angle: w.angle, dmg, done: 0 };
      return setState(m, 'act', atk.duration);
    }
    case 'eggs': {
      // the snail king's pearl eggs: `count` flung `spread` m round its prey (evenly, a little seeded), landing after
      // `flight` s; each bursts over `radius` m `fuse` s later, unless a unit steps on it (within `crush` m) first and
      // breaks it harmlessly (core area `egg`)
      const prey = t || game.player;
      for (let i = 0; i < atk.count; i++) {
        const ang = w.angle + Math.PI + (i / atk.count) * Math.PI * 2 + game.rng.range(-0.3, 0.3), d = atk.spread * (0.85 + 0.3 * game.rng.next());
        const x = prey.x + Math.sin(ang) * d, z = prey.z + Math.cos(ang) * d;
        if (!game.world.isFree(x, z, 0.3) || game.isSafe(x, z)) continue;
        game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: 'pearl_egg', egg: { crush: atk.crush }, x, z, radius: atk.radius, delay: atk.flight, duration: atk.fuse, damage: dmg });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'engulf': {
      // the salt slime hops onto the spot marked at wind-up start (beginAttack) over `air` s; landing on a unit, it
      // wraps over it and holds it (act: m.hold); on nothing, it splats flat (`missStun`)
      m.charge = { t: 0, dur: atk.air, fromX: m.x, fromZ: m.z, toX: w.tx, toZ: w.tz, dive: true, engulf: true, hit: new Set(), dmg };
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
    case 'brine': {
      // the salt slime spits brine at where its prey stands: it lands after `flight` s and spreads into a puddle that
      // sets into salt `set` s later, catching whatever still stands in it (the attack's inflict holds it fast)
      const tx = t ? t.x : m.x + Math.sin(w.angle) * atk.range, tz = t ? t.z : m.z + Math.cos(w.angle) * atk.range;
      if (!game.isSafe(tx, tz)) game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: 'brine', flight: atk.flight, x: tx, z: tz, radius: atk.radius, delay: atk.flight + atk.set, duration: 0.3, damage: dmg });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'rampage': {
      // the boar charges in `legs` legs: each at `speed` m/s for `run` s along its aim, hitting each unit once a leg;
      // between legs it skids to a stop over `skid` s, turning to its prey through the first part of the skid, then
      // locked (act: m.rampage); a rock or wall in its way stops it stunned
      m.rampage = { name: w.name, leg: 0, phase: 'run', t: 0, angle: w.angle, dmg, hit: new Set() };
      m.facing = w.angle;
      return setState(m, 'act');
    }
    case 'stampede': {
      // the boar squeals and `count` piglets burst out beside it, `gap` s apart, each down its own lane (`spacing` m
      // apart across the aim) at `speed` m/s for `range` m, trampling each unit once (core projectile `trample`)
      m.stampede = { name: w.name, i: 0, t: 0, angle: w.angle, dmg };
      return setState(m, 'act');
    }
    case 'circle_lunge': {
      // the wolf runs a lap round its prey (`sweep` degrees at `lapSpeed` m/s, its distance kept between `near` and
      // `far` m), stops and crouches for `aim` s (its lunge's lane shown, locking through the first 60%), then lunges
      // `dash` m along it in `dashTime` s, biting the first unit it reaches (act: m.lap)
      const prey = t || game.player, R = Math.max(atk.near, Math.min(atk.far, dist(m.x, m.z, prey.x, prey.z)));
      // `sweepRange` [min, max] degrees (Greyfang): how far round it runs is drawn each time (seeded), so where it cuts in
      // is not known until it plants; `through`: the lunge runs on through its prey and beyond, catching every unit on
      // the way once (`knock` m/s throws them)
      const sweep = atk.sweepRange ? game.rng.range(atk.sweepRange[0], atk.sweepRange[1]) : atk.sweep;
      m.lap = { name: w.name, phase: 'run', t: 0, a: angleTo(prey.x, prey.z, m.x, m.z), dir: m.id % 2 ? 1 : -1, R, run: 0, sweep, angle: 0, hit: false, hits: new Set(), dmg };
      return setState(m, 'act');
    }
    case 'pincer': {
      // two shadow wolves run in from either side of the spot marked at wind-up start (beginAttack), crossing it:
      // projectiles that trample each unit once (`speed`, `range`)
      for (const [x, z, a] of w.lanes) game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: 'shadow_wolf', attack: w.name, trample: true, x, z, y: 0, angle: a, speed: atk.speed, radius: atk.projectileRadius ?? 0.5, range: atk.range, element: 'physical', damage: dmg });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'rally': {
      // Greyfang's rally howl: its pack answers at the spots marked round its prey at wind-up start (beginAttack),
      // wolves of `pack` (minions, `packOf` it) set on the prey: they close round it from every side
      for (const [x, z] of w.spots) {
        const wolf = game.spawnMinion(atk.pack, Math.max(1, m.level - 1), x, z);
        wolf.packOf = m.id; wolf.facing = t ? angleTo(x, z, t.x, t.z) : 0;
        setAggro(game, wolf, t || game.player);
      }
      game.emit({ type: 'rally', id: m.id, x: m.x, z: m.z, spots: w.spots });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'wisp_orb': {
      // the marsh wisp's lost lights: `count` flames flung at its prey, each weaving `amp` m either side of the line
      // (one swing per `wavelength` m), each its own way (core projectiles wisp_orb)
      for (let i = 0; i < atk.count; i++) game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: 'wisp_orb', attack: w.name, x: m.x, z: m.z, y: 1.1, angle: w.angle, speed: atk.speed, radius: atk.projectileRadius, range: atk.range, element: 'fire', damage: dmg, weave: { amp: atk.amp, length: atk.wavelength, phase: i * Math.PI } });
      game.emit({ type: 'wispOrbs', id: m.id, x: m.x, z: m.z, angle: w.angle });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'marsh_gas': {
      // the gas marked at wind-up start (beginAttack) bubbles up and catches fire spot after spot
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'bog_lure': {
      // its lights draw its prey toward the bog marked at wind-up start: the hero is lured for `pull` s (less tenacity)
      // at `pullSpeed` m/s (game updatePlayer); within `reach` m of the bog
      for (const u of game.units()) {
        if (u !== game.player || u.dead || dist(u.x, u.z, w.tx, w.tz) > atk.reach) continue;
        const d = atk.pull * (1 - Math.max(0, game.derived?.tenacityPct || 0) / 100);
        if (d > 0) { u.statuses.lure = { t: d, x: w.tx, z: w.tz, speed: atk.pullSpeed }; game.emit({ type: 'lure', id: m.id, x: w.tx, z: w.tz, duration: d }); }
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'stoop': {
      // the gale hawk folds its wings and stoops from where it hung, down a curve to its locked spot and `past` m on
      // (the strike stretch, from `before` m short of the spot: units within `width`/2 of the path it covers there are
      // raked once), then pulls up `climb` m further, all over `air` s (act: m.stoop)
      const a = angleTo(m.x, m.z, w.tx, w.tz), d0 = dist(m.x, m.z, w.tx, w.tz);
      let past = atk.past, climb = atk.climb;
      const at = (q) => [w.tx + Math.sin(a) * q, w.tz + Math.cos(a) * q];
      while (past + climb > 0 && game.isSafe(...at(past + climb))) { if (climb > 0) climb = Math.max(0, climb - 0.5); else past -= 0.5; }
      past = Math.max(0, past);
      m.stoop = { name: w.name, t: 0, fromX: m.x, fromZ: m.z, angle: a, low: Math.max(0, d0 - atk.before), high: d0 + past, len: d0 + past + climb, dmg, hit: new Set(), s: 0 };
      game.emit({ type: 'stoop', id: m.id, x: m.x, z: m.z, angle: a, len: m.stoop.len, low: m.stoop.low, air: atk.air });
      return setState(m, 'act');
    }
    case 'hammer_fists':
    case 'boulder_hurl': {
      // what it marked at wind-up start (beginAttack) goes off on its own: the slam and its aftershock, or the boulder
      game.emit({ type: kind === 'hammer_fists' ? 'golemSlam' : 'golemHurl', id: m.id, x: m.x, z: m.z, angle: w.angle, tx: w.tx, tz: w.tz, flight: atk.flight });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'shard_volley': {
      // the rune sentinel flings the shards of its ring at its prey one after another, `every` s apart, each aimed at
      // where its prey stands as it goes (projectiles rune_shard) (act: m.volley)
      m.volley = { name: w.name, t: 0, n: 0, dmg };
      return setState(m, 'act');
    }
    case 'rune_seal': {
      // the seal marked at wind-up start (beginAttack) closes on its own
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'searchlight': {
      // its eye casts a cone of light `range` m long, `arc` degrees wide, following its prey at `turn` rad/s for
      // `duration` s; a unit held in the light for `build` s is spotted and struck by a rune bolt (event searchStrike),
      // then must be spotted afresh; out of the light its being-spotted fades at half the rate (act: m.search)
      m.search = { name: w.name, t: 0, angle: w.angle, spot: new Map(), dmg };
      game.emit({ type: 'searchOn', id: m.id, x: m.x, z: m.z, angle: w.angle });
      return setState(m, 'act');
    }
    case 'rock_orbit': {
      // the rubble it raised swings round it `ring` m out for `spin` s at `turnSpeed` rad/s, striking what it passes
      // (each rock each unit once), then each is flung straight out from where it is (projectiles rock_shard) (act:
      // m.orbit)
      const rocks = [];
      for (let i = 0; i < atk.rocks; i++) rocks.push({ a: m.facing + (i / atk.rocks) * Math.PI * 2, hit: new Set() });
      m.orbit = { name: w.name, t: 0, rocks, dmg };
      game.emit({ type: 'orbitStart', id: m.id, x: m.x, z: m.z, rocks: atk.rocks, ring: atk.ring });
      return setState(m, 'act');
    }
    case 'dusk_stalk': {
      // the duskmane stalker melts into the dusk (unseen, out of reach): it creeps round to its prey's back over `creep`
      // s at `creepSpeed` m/s, `ring` m out, leaving only paw prints (event pawPrint every `print` m); then it shows
      // itself (duskReveal), its lunge's lane through its prey locks for `aim` s, and it lunges `lunge` m at `speed`
      // m/s, raking each unit in its way once (act: m.stalk)
      m.stalk = { name: w.name, phase: 'creep', t: 0, dmg, walked: 0, hit: new Set(), angle: 0, left: 0 };
      m.stealth = true; m.targetable = false;
      game.emit({ type: 'duskVanish', id: m.id, x: m.x, z: m.z });
      return setState(m, 'act');
    }
    case 'sprint_chase': {
      // the stalker sprints at its prey at `speed` m/s for up to `duration` s, turning toward it at only `turn` rad/s,
      // and bowls over the first unit it reaches; a late step aside and it overruns, skidding (act: m.sprint)
      m.sprint = { name: w.name, t: 0, angle: w.angle, dmg };
      game.emit({ type: 'sprintGo', id: m.id, x: m.x, z: m.z, angle: w.angle });
      return setState(m, 'act');
    }
    case 'thunder_wings': {
      // up in the air the gale hawk beats its wings into a thunderstorm: every `every` s a downstroke calls a bolt onto
      // where its prey stands then, marked and striking `delay` s later (areas storm_bolt), `strikes` in all (act: m.storm)
      m.storm = { name: w.name, t: 0, n: 0, dmg };
      game.emit({ type: 'thunderWings', id: m.id, x: m.x, z: m.z, strikes: atk.strikes, every: atk.every });
      return setState(m, 'act');
    }
    case 'storm_feathers': {
      // the feathers it shook loose (beginAttack) settle on their marks; the fence between them crackles (core area
      // fence)
      game.emit({ type: 'stormFeathers', id: m.id, x: m.x, z: m.z, pts: w.pts });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'fang_strike': {
      // the reed viper's strike: from its S-coil the neck shoots out along the lane locked late in the wind-up and
      // snaps back (viperStrike); `strikes` in all, the next re-aimed through the first 60% of `gap` s (act: m.fangs)
      viperStrike(game, m, w.name, w.angle, atk.range, dmg);
      if ((atk.strikes || 1) < 2) { m.cd[w.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
      m.fangs = { name: w.name, n: 1, t: 0, angle: w.angle, dmg };
      return setState(m, 'act');
    }
    case 'constrict': {
      // the reed viper rushes down the locked lane (`speed` m/s, up to `range` m) and wraps round the first unit it
      // reaches: held fast for up to `hold` s, squeezed every `tick` s (`squeezeMult` x its damage); a dodge tears free,
      // and so does hurting it by `breakShare` of its health (act: m.coil)
      m.coil = { name: w.name, phase: 'dash', t: 0, angle: w.angle, left: atk.range, dmg, unit: null, hp: 0, x: 0, z: 0, next: 0 };
      game.emit({ type: 'coilDash', id: m.id, x: m.x, z: m.z, angle: w.angle });
      return setState(m, 'act');
    }
    case 'tail_lash': {
      // the leaf-blade tail whipped round behind it: units within `range` m of its body, in the `arc` degrees about its
      // back, are cut once (event tailLash)
      const back = m.facing + Math.PI, R = atk.range + m.r;
      game.emit({ type: 'tailLash', id: m.id, x: m.x, z: m.z, angle: back, arc: atk.arc, range: R });
      for (const u of game.units()) {
        if (dist(m.x, m.z, u.x, u.z) - u.r > R || Math.abs(angleDiff(back, angleTo(m.x, m.z, u.x, u.z))) > (atk.arc * DEG) / 2) continue;
        game.damageUnit(u, dmg, m, { attack: w.name });
        game.emit({ type: 'tailCut', id: m.id, x: u.x, z: u.z });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'moon_leap': {
      // Greyfang springs high out of reach (untargetable, `targetable` false): rising over `rise` s, then its shadow
      // runs after its prey at `trackSpeed` m/s for `track` s; the spot locks (event moonLock, the circle marked) and
      // `lock` s later it falls on it over `fall` s: everything within `radius` m is hit and thrown `knock` (act: m.leap)
      m.leap = { name: w.name, phase: 'rise', t: 0, dmg };
      m.targetable = false;
      game.emit({ type: 'moonLeap', id: m.id, x: m.x, z: m.z });
      return setState(m, 'act');
    }
    case 'phantom_rush': {
      // the lanes marked at wind-up start (beginAttack) run `gap` s apart: moon-shadow wolves first (projectiles that
      // trample each unit once), Greyfang itself last, each on through its prey's spot `past` m (act: m.rush)
      m.rush = { name: w.name, t: 0, i: 0, lanes: w.lanes, tx: w.tx, tz: w.tz, dmg, dash: null, hit: new Set() };
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
    case 'peer_strike': {
      // the mantis's forelegs shoot out along the lane it locked (`range` x `width`), its body never moving: the
      // first unit along it is caught (event mantisStrike)
      const dir = dirFromAngle(w.angle), half = atk.width / 2;
      let best = null, bestAlong = Infinity;
      for (const u of game.units()) {
        const dx = u.x - m.x, dz = u.z - m.z, along = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x);
        if (along >= 0 && along <= atk.range + m.r + u.r && side <= half + u.r && along < bestAlong) { best = u; bestAlong = along; }
      }
      const reach = best ? Math.max(0, bestAlong - best.r) : atk.range + m.r;
      game.emit({ type: 'mantisStrike', id: m.id, x: m.x, z: m.z, angle: w.angle, reach, hit: !!best });
      if (best) game.damageUnit(best, dmg, m, { attack: w.name });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'startle': {
      // the mantis's startle display: what stands in the cone before it (`range`, `arc`) is frozen in fright (the
      // attack's inflict, a root) and it strikes at once with its `follow` attack
      const arc = (atk.arc || 140) * DEG;
      game.emit({ type: 'startle', id: m.id, x: m.x, z: m.z, angle: w.angle, range: atk.range + m.r, arc: atk.arc });
      for (const u of game.units()) {
        const g = dist(m.x, m.z, u.x, u.z) - m.r - u.r;
        if (g <= atk.range && Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) <= arc / 2) game.damageUnit(u, dmg, m, { attack: w.name });
      }
      m.cd[w.name] = atk.cooldown;
      if (atk.follow && m.cd[atk.follow] !== undefined) m.cd[atk.follow] = 0;
      return setState(m, 'recover', atk.recover);
    }
    case 'anemone': {
      // the hermit crab's anemones lash out behind it (its aim is its back, `range` m, `arc` degrees) without it turning
      const arc = (atk.arc || 140) * DEG;
      game.emit({ type: 'monsterSwing', id: m.id, name: w.name, angle: w.angle, range: atk.range + m.r, arc: atk.arc, x: m.x, z: m.z });
      for (const u of game.units()) {
        const g = dist(m.x, m.z, u.x, u.z) - m.r - u.r;
        if (g <= atk.range && Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) <= arc / 2) game.damageUnit(u, dmg, m, { attack: w.name });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'shell_shed': {
      // the hermit crab bursts out of its shell (the coral burst round it is the area marked at wind-up start): the
      // shell stays where it stood; bare (m.naked) it runs `nakedSpeed` times as fast and takes `nakedTaken` times the
      // damage, for `loose` s, then hurries back and climbs in (kit, act)
      m.naked = { name: w.name, x: m.x, z: m.z, facing: m.facing, until: game.time + atk.loose, phase: 'loose' };
      game.emit({ type: 'shellShed', id: m.id, x: m.x, z: m.z, facing: m.facing });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'drag': {
      // the wolf bites what is right in front of it (`range` m, `arc` degrees) and backs away `back` m over `dragTime` s
      // dragging it by the jaws (act: m.drag); a dodge (the hero's movement skill) tears free
      const arc = (atk.arc || 70) * DEG;
      const prey = game.units().find((u) => dist(m.x, m.z, u.x, u.z) - m.r - u.r <= atk.range && Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) <= arc / 2);
      game.emit({ type: 'monsterSwing', id: m.id, name: w.name, angle: w.angle, range: atk.range + m.r, arc: atk.arc, x: m.x, z: m.z });
      if (!prey) { m.cd[w.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
      const dealt = game.damageUnit(prey, dmg, m, { attack: w.name });
      if (!dealt && prey === game.player) { m.cd[w.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
      m.drag = { name: w.name, unit: prey, angle: w.angle };
      game.emit({ type: 'dragStart', id: m.id, x: prey.x, z: prey.z });
      return setState(m, 'act', atk.dragTime);
    }
    case 'bombard': {
      // the beetle's rear spray: `pulses` bursts `gap` s apart down a lane `range` x `width` behind it (its aim),
      // sweeping `sweep` degrees across from the first to the last; each burst can hit a unit once (act: m.bombard)
      m.bombard = { name: w.name, i: 0, angle: w.angle, dmg };
      return setState(m, 'act', (atk.pulses - 1) * atk.gap + 0.05);
    }
    case 'mossball': {
      // the beetle kicks a ball of moss along its aim: it rolls at `speed` m/s, growing from `radius` to `grow` m wide
      // over `range` m, flattening what it rolls over once, and bursts into a slowing moss patch where it stops
      const d = dirFromAngle(w.angle);
      game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: 'mossball', attack: w.name, trample: true, x: m.x + d.x * (m.r + atk.radius), z: m.z + d.z * (m.r + atk.radius), y: 0, angle: w.angle, speed: atk.speed, radius: atk.radius, grow: { from: atk.radius, to: atk.grow }, range: atk.range, element: m.def.element || 'physical', damage: dmg, patch: { ...atk.patch, attack: w.name } });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'fairy_ring': {
      // the ring was marked round its prey at wind-up start (beginAttack); it sprouts and goes off by itself
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'sprouts': {
      // the sporecap sows `count` sprouts of itself in front of it, `spread` m out: stationary minions (`size`, `share`
      // of its health) that puff a small spore cloud every `every` s and wilt after `life` s (core m.sprout)
      for (let i = 0; i < atk.count; i++) {
        const a = w.angle + (i - (atk.count - 1) / 2) * 1.1, x = m.x + Math.sin(a) * atk.spread, z = m.z + Math.cos(a) * atk.spread;
        if (!game.world.isFree(x, z, 0.3) || game.isSafe(x, z)) continue;
        const b = game.spawnMinion(m.type, m.level, x, z), hp = Math.max(1, Math.round(m.maxHp * atk.share));
        Object.assign(b, { sprout: { t: 0, next: atk.every * (0.5 + 0.25 * i), every: atk.every, life: atk.life, cloud: atk.cloud, of: m.id, dmg: m.damage }, size: atk.size, hp, maxHp: hp, homeX: x, homeZ: z, facing: a });
        setAggro(game, b, t || game.player);
        game.emit({ type: 'sprout', id: b.id, from: m.id, x, z });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'sleep_cloud': {
      // the sporecap breathes out a cloud of sleepy spores that drifts along its aim at `drift` m/s for `duration` s;
      // a unit that stays in it builds drowsiness and falls asleep after `build` s in it (core area `sleep`)
      const d = dirFromAngle(w.angle);
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: w.name, kind: 'sleep_cloud', x: m.x + d.x * (m.r + atk.radius * 0.6), z: m.z + d.z * (m.r + atk.radius * 0.6), radius: atk.radius, delay: 0, duration: atk.duration, drift: { vx: d.x * atk.drift, vz: d.z * atk.drift }, sleep: { build: atk.build, duration: atk.sleep, drowse: new Map() }, damage: 0 });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'perch': {
      // the shore gull hops onto its prey's head (where it stands as the hop starts, `hop` s); landing on a unit it
      // rides it (act: m.perch), pecking `ticks` times over `ride` s; a dodge (the hero's movement skill) shakes it off
      // dazed for `shakeStun` s; landing on nothing, it just lands
      const tx = t ? t.x : m.x, tz = t ? t.z : m.z;
      m.charge = { t: 0, dur: atk.hop, fromX: m.x, fromZ: m.z, toX: tx, toZ: tz, dive: true, perch: true, hit: new Set(), dmg };
      setState(m, 'act');
      m.windup = { ...w, tx, tz };
      return;
    }
    case 'toss': {
      // the tusk boar scoops what is before it (`range` m, `arc` degrees) on its tusks and flings it over its back to
      // land `throw` m behind it after `air` s (core player `tossed`); an ally is knocked behind it the same way
      const arc = (atk.arc || 70) * DEG, back = dirFromAngle(w.angle + Math.PI);
      game.emit({ type: 'monsterSwing', id: m.id, name: w.name, angle: w.angle, range: atk.range + m.r, arc: atk.arc, x: m.x, z: m.z });
      for (const u of game.units()) {
        if (dist(m.x, m.z, u.x, u.z) - m.r - u.r > atk.range || Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) > arc / 2) continue;
        const dealt = game.damageUnit(u, dmg, m, { attack: w.name });
        if (!dealt && u === game.player) continue; // dodged or blocked: not thrown
        const toX = m.x + back.x * (m.r + atk.throw), toZ = m.z + back.z * (m.r + atk.throw);
        if (u === game.player && !u.dead) {
          u.cast = null;
          u.tossed = { fromX: u.x, fromZ: u.z, toX, toZ, t: 0, dur: atk.air };
          game.emit({ type: 'toss', id: m.id, x: u.x, z: u.z, toX, toZ, air: atk.air });
        } else if (!u.dead) { u.x = toX; u.z = toZ; }
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'snatch': {
      // the shore gull swoops along a curve past its prey (the path fixed at wind-up start, beginAttack) over
      // `duration` s, clipping what it passes; the prey it clips loses up to `steal` gold, carried off in its beak
      // (core m.loot, dropped again when it dies)
      // `passes` (`enragedPasses` once enraged): Greyfang skids round on the far side for `skid` s and passes
      // back the other way, the new curve (through where its prey stands then) marked through the skid
      m.swoop = { name: w.name, t: 0, path: w.path, dmg, hit: new Set(), pass: 1, passes: (m.enraged && atk.enragedPasses) || atk.passes || 1, skid: 0, side: w.side ?? 1 };
      setState(m, 'act', atk.duration);
      m.windup = { ...w };
      return;
    }
    case 'shell_drop': {
      // the gull flies up (`air` s, the clam falling onto the spot marked at wind-up start), then glides down to it
      // over `glide` s and eats there for `feast` s, open to blows (`exposedTaken`)
      m.drop = { name: w.name, t: 0, tx: w.tx, tz: w.tz };
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
    case 'pounce':
    case 'dive': {
      // the leap's air time (atk.air) lands it as its marked circle goes off (beginAttack spawns it then)
      // `landShort` (m): it lands that far short of the marked middle, at its prey's front rather than on top of it
      const back = atk.landShort || 0, len = Math.hypot(w.tx - m.x, w.tz - m.z) || 1, k = Math.max(0, len - back) / len;
      m.charge = { t: 0, dur: atk.air ?? 0.35, fromX: m.x, fromZ: m.z, toX: m.x + (w.tx - m.x) * k, toZ: m.z + (w.tz - m.z) * k, dive: true, hit: new Set(), dmg: 0 };
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
    case 'howl': {
      m.cd.howl = atk.cooldown;
      game.emit({ type: 'howl', id: m.id, x: m.x, z: m.z });
      if (atk.summon) {
        for (let i = 0; i < atk.summon; i++) {
          const a = m.facing + (i ? 1.8 : -1.8);
          let x = m.x + Math.sin(a) * 3;
          let z = m.z + Math.cos(a) * 3;
          if (!game.world.isFree(x, z, 0.8)) {
            x = m.x;
            z = m.z;
          }
          const w2 = game.spawnMinion('thornback_wolf', Math.max(1, m.level - 1), x, z);
          setAggro(game, w2, t || game.player);
        }
      } else {
        for (const o of game.monsters) {
          if (o.dead || o.type !== m.type || dist(o.x, o.z, m.x, m.z) > atk.radius) continue;
          o.buffs.howl = { t: atk.duration, speed: atk.speedBuff };
          setAggro(game, o, t || game.player);
        }
      }
      return setState(m, 'recover', atk.recover);
    }
    default:
      return setState(m, 'chase');
  }
}

function act(game, m, dt, t) {
  if (m.naked?.phase === 'climb') {
    // the hermit crab backs into its shell
    m.moving = false;
    if (m.stateT >= m.stateDur) { m.naked = null; game.emit({ type: 'reshell', id: m.id, x: m.x, z: m.z }); setState(m, 'recover', 0.3); }
    return;
  }
  if (m.melee) {
    const strike = m.melee;
    const atk = m.def.attacks[strike.name];
    m.moving = false;
    if (atk.hits) {
      // a combo (rend, rake): each hit has its own contact time, side and small step forward
      strike.done = strike.done || 0;
      const h = atk.hits[strike.done];
      if (h && m.stateT >= h.at) {
        strike.done++;
        const ang = strike.angle + (h.off || 0);
        game.emit({ type: 'monsterSwing', id: m.id, name: strike.name, angle: ang, range: atk.range + m.r, arc: atk.arc, x: m.x, z: m.z, hit: strike.done, hits: atk.hits.length });
        for (const u of game.units()) {
          const gap = dist(m.x, m.z, u.x, u.z) - m.r - u.r;
          const inArc = Math.abs(angleDiff(ang, angleTo(m.x, m.z, u.x, u.z))) <= atk.arc * DEG / 2;
          if (gap <= atk.range && inArc) game.damageUnit(u, strike.damage, m, { attack: strike.name, knock: h.knock ? { angle: angleTo(m.x, m.z, u.x, u.z), force: h.knock } : undefined });
        }
        if (h.step) {
          const d = dirFromAngle(strike.angle);
          game.moveEntity(m, d.x * h.step, d.z * h.step);
        }
      }
    } else if (!strike.hit && m.stateT >= atk.hitTime) {
      strike.hit = true;
      game.emit({ type: 'monsterSwing', id: m.id, name: strike.name, angle: strike.angle, range: atk.range + m.r, arc: atk.arc, x: m.x, z: m.z });
      for (const u of game.units()) {
        const gap = dist(m.x, m.z, u.x, u.z) - m.r - u.r;
        const inArc = Math.abs(angleDiff(strike.angle, angleTo(m.x, m.z, u.x, u.z))) <= atk.arc * DEG / 2;
        if (gap <= atk.range && inArc) game.damageUnit(u, strike.damage, m, { attack: strike.name });
      }
    }
    if (m.stateT >= atk.duration) {
      m.cd[strike.name] = atk.cooldown;
      m.retreatPending = !!m.def.retreat;
      if (strike.name === 'pinch') m.guardAttacks = (m.guardAttacks || 0) + 1;
      m.melee = null;
      setState(m, 'recover', atk.recover);
    }
    return;
  }
  if (m.sweep) {
    const sw = m.sweep, atk = m.def.attacks[sw.name];
    sw.t += dt;
    const k = Math.min(1, sw.t / sw.dur), ang = sw.from + (sw.to - sw.from) * k, dir = dirFromAngle(ang), half = atk.width / 2;
    m.facing = ang;
    m.moving = false;
    for (const u of game.units()) {
      if (sw.hit.has(u.id)) continue;
      const dx = u.x - m.x, dz = u.z - m.z, along = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x);
      if (along >= 0 && along <= atk.range + u.r && side <= half + u.r) { sw.hit.add(u.id); game.damageUnit(u, sw.dmg, m, { attack: sw.name }); }
    }
    if (k >= 1) { m.sweep = null; m.cd[sw.name] = atk.cooldown; setState(m, 'recover', atk.recover); }
    return;
  }
  if (m.volley) {
    const V = m.volley, atk = m.def.attacks[V.name], prey = t || game.player;
    V.t += dt; m.moving = false;
    if (prey) m.facing = angleTo(m.x, m.z, prey.x, prey.z);
    while (V.n < atk.count && V.t >= V.n * atk.every) {
      // from its place on the ring (round the side facing its prey), aimed at where its prey stands now
      const side = (V.n % 2 ? 1 : -1) * (0.3 + 0.15 * Math.floor(V.n / 2)), a = m.facing + side, sx = m.x + Math.sin(a) * 0.9, sz = m.z + Math.cos(a) * 0.9;
      const aim = prey ? angleTo(sx, sz, prey.x, prey.z) : m.facing;
      game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: 'rune_shard', attack: V.name, x: sx, z: sz, y: 1.4, angle: aim, speed: atk.speed, radius: atk.shardRadius, range: atk.range, damage: V.dmg });
      game.emit({ type: 'shardLaunch', id: m.id, x: sx, z: sz, angle: aim, n: V.n });
      V.n++;
    }
    if (V.n < atk.count || V.t < (atk.count - 1) * atk.every + 0.15) return;
    m.volley = null; m.cd[V.name] = atk.cooldown;
    return setState(m, 'recover', atk.recover);
  }
  if (m.search) {
    const S = m.search, atk = m.def.attacks[S.name], prey = t || game.player;
    S.t += dt; m.moving = false;
    if (prey) S.angle += clamp(angleDiff(S.angle, angleTo(m.x, m.z, prey.x, prey.z)), -atk.turn * dt, atk.turn * dt);
    m.facing = S.angle;
    const half = (atk.arc * DEG) / 2;
    for (const u of game.units()) {
      const d = dist(m.x, m.z, u.x, u.z), lit = d <= atk.range + u.r && d > 0.3 && Math.abs(angleDiff(S.angle, angleTo(m.x, m.z, u.x, u.z))) <= half;
      let v = Math.max(0, (S.spot.get(u.id) || 0) + (lit ? dt : -0.5 * dt));
      if (v >= atk.build) {
        v = 0;
        game.damageUnit(u, S.dmg, m, { attack: S.name });
        game.emit({ type: 'searchStrike', id: m.id, x: u.x, z: u.z });
      }
      S.spot.set(u.id, v);
      if (u === game.player) S.heroSpot = v / atk.build; // for the view: how near the hero is to being struck
    }
    if (S.t < atk.duration) return;
    m.search = null; m.cd[S.name] = atk.cooldown;
    game.emit({ type: 'searchOff', id: m.id, x: m.x, z: m.z });
    return setState(m, 'recover', atk.recover);
  }
  if (m.orbit) {
    const O = m.orbit, atk = m.def.attacks[O.name];
    O.t += dt; m.moving = false;
    for (const r of O.rocks) {
      r.a += atk.turnSpeed * dt;
      const rx = m.x + Math.sin(r.a) * atk.ring, rz = m.z + Math.cos(r.a) * atk.ring;
      for (const u of game.units()) {
        if (r.hit.has(u.id) || dist(rx, rz, u.x, u.z) > atk.rockRadius + u.r) continue;
        r.hit.add(u.id);
        if (game.damageUnit(u, O.dmg, m, { attack: O.name })) game.emit({ type: 'orbitHit', id: m.id, x: u.x, z: u.z });
      }
    }
    if (O.t < atk.spin) return;
    // flung out: each rock straight out from where it is
    for (const r of O.rocks) {
      const rx = m.x + Math.sin(r.a) * atk.ring, rz = m.z + Math.cos(r.a) * atk.ring;
      game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: 'rock_shard', attack: O.name, x: rx, z: rz, y: 1.2, angle: r.a, speed: atk.flingSpeed, radius: atk.rockRadius, range: atk.flingRange, damage: O.dmg });
    }
    game.emit({ type: 'orbitFling', id: m.id, x: m.x, z: m.z, angles: O.rocks.map((r) => r.a), ring: atk.ring });
    m.orbit = null; m.cd[O.name] = atk.cooldown;
    return setState(m, 'recover', atk.recover);
  }
  if (m.stalk) {
    const S = m.stalk, atk = m.def.attacks[S.name], prey = t || game.player;
    S.t += dt;
    if (S.phase === 'creep') {
      // round to its prey's back, low and unseen: toward the point `ring` m behind it, prints left as it goes
      const back = prey ? prey.facing + Math.PI : m.facing, gx = prey.x + Math.sin(back) * atk.ring, gz = prey.z + Math.cos(back) * atk.ring;
      const d = dist(m.x, m.z, gx, gz);
      if (d > 0.2) {
        // swing wide round its prey rather than through it: aim along the ring when the straight way passes too close
        let a = angleTo(m.x, m.z, gx, gz);
        const pr = dist(m.x, m.z, prey.x, prey.z);
        if (pr < atk.ring * 1.2) { const around = angleTo(prey.x, prey.z, m.x, m.z), side = angleDiff(around, back) >= 0 ? 1 : -1; a = around + side * Math.PI / 2; }
        const step = Math.min(d, atk.creepSpeed * dt);
        game.moveEntity(m, Math.sin(a) * step, Math.cos(a) * step);
        m.facing = a; m.moving = true;
        S.walked += step;
        if (S.walked >= atk.print) { S.walked = 0; S.foot = !S.foot; game.emit({ type: 'pawPrint', id: m.id, x: m.x, z: m.z, angle: a, foot: S.foot }); }
      } else m.moving = false;
      if (S.t < atk.creep) return;
      // it shows itself, its lane through its prey locked for `aim` s
      S.phase = 'aim'; S.t = 0; m.moving = false;
      S.angle = angleTo(m.x, m.z, prey.x, prey.z); m.facing = S.angle;
      S.left = atk.lunge;
      m.stealth = false; m.targetable = true;
      game.emit({ type: 'duskReveal', id: m.id, x: m.x, z: m.z, angle: S.angle, len: atk.lunge, width: atk.width, aim: atk.aim });
      return;
    }
    if (S.phase === 'aim') { m.moving = false; if (S.t >= atk.aim) { S.phase = 'lunge'; S.t = 0; game.emit({ type: 'duskLunge', id: m.id, x: m.x, z: m.z, angle: S.angle }); } return; }
    // the lunge: along the lane, each unit in its way raked once
    const d = dirFromAngle(S.angle), step = Math.min(S.left, atk.speed * dt), ax = m.x, az = m.z;
    game.moveEntity(m, d.x * step, d.z * step);
    S.left -= step; m.moving = true;
    for (const u of game.units()) {
      if (S.hit.has(u.id) || segDist(u.x, u.z, ax, az, m.x, m.z) > atk.width / 2 + u.r) continue;
      S.hit.add(u.id);
      if (game.damageUnit(u, S.dmg, m, { attack: S.name, knock: { angle: S.angle, force: atk.knock || 0 } })) game.emit({ type: 'duskRake', id: m.id, x: u.x, z: u.z, angle: S.angle });
    }
    if (S.left > 0.01) return;
    m.stalk = null; m.cd[S.name] = atk.cooldown;
    return setState(m, 'recover', atk.recover);
  }
  if (m.sprint) {
    // sprinting: it bends toward its prey no faster than `turn` rad/s; the first unit it reaches is bowled over
    const S = m.sprint, atk = m.def.attacks[S.name], prey = t || game.player;
    S.t += dt;
    if (prey) S.angle += clamp(angleDiff(S.angle, angleTo(m.x, m.z, prey.x, prey.z)), -atk.turn * dt, atk.turn * dt);
    const d = dirFromAngle(S.angle);
    game.moveEntity(m, d.x * atk.speed * dt, d.z * atk.speed * dt);
    m.facing = S.angle; m.moving = true;
    for (const u of game.units()) {
      if (dist(m.x, m.z, u.x, u.z) > m.r + u.r + 0.3) continue;
      const dealt = game.damageUnit(u, S.dmg, m, { attack: S.name, knock: { angle: S.angle, force: atk.knock } });
      if (!dealt && u === game.player) continue; // dodged through it
      m.sprint = null; m.cd[S.name] = atk.cooldown;
      game.emit({ type: 'sprintHit', id: m.id, x: u.x, z: u.z, angle: S.angle });
      return setState(m, 'recover', atk.recover);
    }
    // gone past its prey (it is behind it and moving away) or out of time: it skids, overrun and open
    const passed = prey && Math.abs(angleDiff(S.angle, angleTo(m.x, m.z, prey.x, prey.z))) > 1.9 && S.t > 0.3;
    if (S.t < atk.duration && !passed) return;
    m.sprint = null; m.cd[S.name] = atk.cooldown;
    game.emit({ type: 'sprintSkid', id: m.id, x: m.x, z: m.z, angle: S.angle });
    return setState(m, 'recover', atk.skid);
  }
  if (m.stoop) {
    // the gale hawk's stoop: slow off the hover, fast through the dive, braking as it pulls up; its height falls steeply
    // at first and flattens into a skim over the strike stretch, then it climbs again; over the stretch its talons rake
    // what lies within width/2 of the path it covered this step
    const S = m.stoop, atk = m.def.attacks[S.name], d = dirFromAngle(S.angle);
    S.t += dt;
    const k = Math.min(1, S.t / atk.air), s0 = S.s, s1 = S.len * k * k * (3 - 2 * k);
    S.s = s1;
    m.x = S.fromX + d.x * s1; m.z = S.fromZ + d.z * s1; m.facing = S.angle; m.moving = true;
    const u = s1 / Math.max(0.01, S.low);
    m.alt = s1 < S.low ? 0.5 + (atk.hover - 0.5) * (1 - u) * (1 - u) : s1 <= S.high ? 0.5 : 0.5 + (atk.pullUp - 0.5) * Math.sin(Math.min(1, (s1 - S.high) / Math.max(0.01, S.len - S.high)) * Math.PI * 0.5);
    if (s1 >= S.low && s0 <= S.high) {
      const ax = S.fromX + d.x * Math.max(s0, S.low), az = S.fromZ + d.z * Math.max(s0, S.low), b = Math.min(s1, S.high), bx = S.fromX + d.x * b, bz = S.fromZ + d.z * b;
      for (const un of game.units()) {
        if (S.hit.has(un.id) || segDist(un.x, un.z, ax, az, bx, bz) > atk.width / 2 + un.r) continue;
        S.hit.add(un.id);
        if (game.damageUnit(un, S.dmg, m, { attack: S.name })) game.emit({ type: 'stoopHit', id: m.id, x: un.x, z: un.z, angle: S.angle });
      }
    }
    if (k < 1) return;
    m.stoop = null; m.cd[S.name] = atk.cooldown;
    return setState(m, 'recover', atk.recover);
  }
  if (m.storm) {
    // beating its wings up in the air: a bolt called down every `every` s onto where its prey stands then
    const S = m.storm, atk = m.def.attacks[S.name], prey = t || game.player;
    S.t += dt; m.moving = false;
    if (prey) m.facing = angleTo(m.x, m.z, prey.x, prey.z);
    while (S.n < atk.strikes && S.t >= S.n * atk.every) {
      S.n++;
      if (prey && !prey.dead && !game.isSafe(prey.x, prey.z)) game.spawnArea({ owner: 'monster', sourceId: m.id, attack: S.name, kind: 'storm_bolt', x: prey.x, z: prey.z, radius: atk.radius, delay: atk.delay, duration: 0.3, damage: S.dmg, element: 'lightning' });
      game.emit({ type: 'stormBeat', id: m.id, x: m.x, z: m.z, n: S.n });
    }
    if (S.t < (atk.strikes - 1) * atk.every + atk.delay) return;
    m.storm = null; m.cd[S.name] = atk.cooldown;
    return setState(m, 'recover', atk.recover);
  }
  if (m.fangs) {
    // between the viper's strikes: its neck back in the S, re-aiming, then the next strike
    const F = m.fangs, atk = m.def.attacks[F.name];
    F.t += dt;
    m.moving = false;
    if (t && F.t < atk.gap * 0.6) F.angle = angleTo(m.x, m.z, t.x, t.z);
    m.facing = F.angle;
    if (F.t < atk.gap) return;
    viperStrike(game, m, F.name, F.angle, atk.range, F.dmg);
    F.n++; F.t = 0;
    if (F.n < atk.strikes) return;
    m.fangs = null; m.cd[F.name] = atk.cooldown;
    return setState(m, 'recover', atk.recover);
  }
  if (m.coil) {
    const C = m.coil, atk = m.def.attacks[C.name];
    C.t += dt;
    if (C.phase === 'dash') {
      const d = dirFromAngle(C.angle), step = Math.min(C.left, atk.speed * dt);
      m.facing = C.angle; m.moving = true;
      game.moveEntity(m, d.x * step, d.z * step);
      C.left -= step;
      for (const u of game.units()) {
        if (dist(m.x, m.z, u.x, u.z) > m.r + u.r + 0.3) continue;
        const dealt = game.damageUnit(u, C.dmg, m, { attack: C.name });
        if (!dealt && u === game.player) continue; // dodged through it
        Object.assign(C, { phase: 'hold', t: 0, unit: u, hp: m.hp, x: u.x, z: u.z, next: atk.tick });
        m.x = u.x; m.z = u.z; m.moving = false;
        u.statuses.root = { t: Math.max(u.statuses.root?.t || 0, atk.hold) };
        game.emit({ type: 'coilGrab', id: m.id, x: u.x, z: u.z, unit: u.id, duration: atk.hold });
        return;
      }
      if (C.left <= 0.01) { m.coil = null; m.moving = false; m.cd[C.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
      return;
    }
    // held: wrapped round it, squeezing; it breaks free by a dodge (moved out of the coils) or by hurting the viper
    const u = C.unit;
    m.moving = false;
    const freed = !u || u.dead || dist(u.x, u.z, C.x, C.z) > 0.6 || C.hp - m.hp >= m.maxHp * atk.breakShare;
    if (!freed) { m.x = C.x; m.z = C.z; while (C.t >= C.next && C.next <= atk.hold) { C.next += atk.tick; game.damageUnit(u, m.damage * atk.squeezeMult, m, { attack: C.name }); } }
    if (freed || C.t >= atk.hold) {
      if (u?.statuses?.root) delete u.statuses.root;
      game.emit({ type: freed ? 'coilFree' : 'coilEnd', id: m.id, x: m.x, z: m.z });
      m.coil = null; m.cd[C.name] = atk.cooldown;
      return setState(m, 'recover', freed ? atk.recover * 1.5 : atk.recover); // torn free, it is left reeling a little longer
    }
    return;
  }
  if (m.leap) {
    const L = m.leap, atk = m.def.attacks[L.name], prey = t || game.player;
    L.t += dt;
    m.moving = false;
    if (L.phase === 'rise' || L.phase === 'track') {
      // high above, its shadow runs after its prey (never into a safe town)
      const d = prey ? dist(m.x, m.z, prey.x, prey.z) : 0;
      if (d > 0.05) {
        const a = angleTo(m.x, m.z, prey.x, prey.z), step = Math.min(d, atk.trackSpeed * dt), nx = m.x + Math.sin(a) * step, nz = m.z + Math.cos(a) * step;
        m.facing = a;
        if (!game.isSafe(nx, nz)) game.moveEntity(m, nx - m.x, nz - m.z);
      }
      if (L.phase === 'rise' && L.t >= atk.rise) { L.phase = 'track'; L.t = 0; }
      else if (L.phase === 'track' && L.t >= atk.track) {
        L.phase = 'lock'; L.t = 0;
        game.emit({ type: 'moonLock', id: m.id, x: m.x, z: m.z, radius: atk.radius, delay: atk.lock + atk.fall });
      }
      return;
    }
    if (L.phase === 'lock') { if (L.t >= atk.lock) { L.phase = 'fall'; L.t = 0; } return; }
    if (L.t < atk.fall) return;
    m.leap = null; m.targetable = true;
    game.emit({ type: 'moonCrash', id: m.id, x: m.x, z: m.z, radius: atk.radius });
    for (const u of game.units()) {
      if (dist(m.x, m.z, u.x, u.z) > atk.radius + u.r) continue;
      game.damageUnit(u, L.dmg, m, { attack: L.name, knock: atk.knock ? { angle: angleTo(m.x, m.z, u.x, u.z), force: atk.knock } : undefined });
    }
    m.cd[L.name] = atk.cooldown;
    return setState(m, 'recover', atk.recover);
  }
  if (m.rush) {
    const R = m.rush, atk = m.def.attacks[R.name], last = R.lanes.length - 1;
    R.t += dt;
    m.moving = false;
    while (R.i < last && R.t >= R.i * atk.gap) {
      const [x, z, a] = R.lanes[R.i++];
      game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: 'phantom_wolf', attack: R.name, trample: true, x, z, y: 0, angle: a, speed: atk.speed, radius: atk.width / 2, range: dist(x, z, R.tx, R.tz) + atk.past, element: 'physical', damage: R.dmg });
    }
    if (!R.dash && R.i === last && R.t >= last * atk.gap) {
      R.i++;
      const a = angleTo(m.x, m.z, R.tx, R.tz);
      R.dash = { a, left: dist(m.x, m.z, R.tx, R.tz) + atk.past };
      game.emit({ type: 'phantomGo', id: m.id, x: m.x, z: m.z, angle: a });
    }
    if (!R.dash) return;
    // Greyfang's own run down the last lane
    const d = dirFromAngle(R.dash.a), step = Math.min(R.dash.left, atk.speed * dt);
    m.facing = R.dash.a;
    game.moveEntity(m, d.x * step, d.z * step);
    R.dash.left -= step;
    for (const u of game.units()) {
      if (R.hit.has(u.id) || dist(m.x, m.z, u.x, u.z) > atk.width / 2 + m.r * 0.5 + u.r) continue;
      R.hit.add(u.id);
      game.damageUnit(u, R.dmg, m, { attack: R.name });
    }
    if (R.dash.left <= 0.01) { m.rush = null; m.cd[R.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
    return;
  }
  if (m.lap) {
    const L = m.lap, atk = m.def.attacks[L.name], prey = t || game.player;
    L.t += dt;
    if (L.phase === 'run') {
      // round the prey at a steady distance, facing along the run
      const step = (atk.lapSpeed * dt) / L.R;
      L.a += step * L.dir; L.run += step;
      const x = prey.x + Math.sin(L.a) * L.R, z = prey.z + Math.cos(L.a) * L.R;
      m.facing = angleTo(m.x, m.z, x, z) || m.facing;
      game.moveEntity(m, x - m.x, z - m.z);
      m.moving = true;
      if (L.run >= L.sweep * DEG) { L.phase = 'aim'; L.t = 0; m.moving = false; L.angle = angleTo(m.x, m.z, prey.x, prey.z); game.emit({ type: 'lapAim', id: m.id }); }
      return;
    }
    if (L.phase === 'aim') {
      m.moving = false;
      if (L.t < atk.aim * 0.6) L.angle = angleTo(m.x, m.z, prey.x, prey.z);
      m.facing = L.angle;
      if (L.t >= atk.aim) { L.phase = 'dash'; L.t = 0; game.emit({ type: 'lunge', id: m.id, angle: L.angle }); }
      return;
    }
    // the lunge
    const d = dirFromAngle(L.angle), sp = atk.dash / atk.dashTime;
    game.moveEntity(m, d.x * sp * dt, d.z * sp * dt);
    m.moving = false;
    if (atk.through) for (const u of game.units()) {
      if (L.hits.has(u.id) || dist(m.x, m.z, u.x, u.z) > m.r + u.r + 0.3) continue;
      if (!L.hits.size) game.emit({ type: 'monsterSwing', id: m.id, name: L.name, angle: L.angle, range: m.r + 0.8, arc: 90, x: m.x, z: m.z });
      L.hits.add(u.id);
      game.damageUnit(u, L.dmg, m, { attack: L.name, knock: atk.knock ? { angle: L.angle, force: atk.knock } : undefined });
    }
    else if (!L.hit) for (const u of game.units()) {
      if (dist(m.x, m.z, u.x, u.z) > m.r + u.r + 0.3) continue;
      L.hit = true;
      game.emit({ type: 'monsterSwing', id: m.id, name: L.name, angle: L.angle, range: m.r + 0.8, arc: 90, x: m.x, z: m.z });
      game.damageUnit(u, L.dmg, m, { attack: L.name });
      break;
    }
    if (L.t >= atk.dashTime) { m.lap = null; m.cd[L.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
    return;
  }
  if (m.drag) {
    const dg = m.drag, atk = m.def.attacks[dg.name], u = dg.unit;
    // a dodge tears free
    if (u === game.player && u.dash) { m.drag = null; m.cd[dg.name] = atk.cooldown; game.emit({ type: 'dragFree', id: m.id, x: u.x, z: u.z }); return setState(m, 'recover', atk.recover); }
    const back = dirFromAngle(dg.angle + Math.PI), sp = atk.back / atk.dragTime;
    game.moveEntity(m, back.x * sp * dt, back.z * sp * dt);
    m.facing = dg.angle; m.moving = true;
    if (!u.dead) { const f = dirFromAngle(dg.angle); u.x = m.x + f.x * (m.r + u.r); u.z = m.z + f.z * (m.r + u.r); }
    if (m.stateT >= atk.dragTime || u.dead) {
      // a toss of the head lets it go
      m.drag = null; m.cd[dg.name] = atk.cooldown;
      game.emit({ type: 'dragEnd', id: m.id, x: u.x, z: u.z });
      return setState(m, 'recover', atk.recover);
    }
    return;
  }
  if (m.bombard) {
    const bb = m.bombard, atk = m.def.attacks[bb.name];
    m.moving = false;
    while (bb.i < atk.pulses && m.stateT >= bb.i * atk.gap) {
      const a = bb.angle + ((bb.i / Math.max(1, atk.pulses - 1)) - 0.5) * atk.sweep * DEG, d = dirFromAngle(a), half = atk.width / 2;
      bb.i++;
      m.facing = a + Math.PI;
      game.emit({ type: 'bombard', id: m.id, x: m.x, z: m.z, angle: a, length: atk.range + m.r, width: atk.width, pulse: bb.i });
      for (const u of game.units()) {
        const dx = u.x - m.x, dz = u.z - m.z, along = dx * d.x + dz * d.z, side = Math.abs(dx * d.z - dz * d.x);
        if (along >= 0 && along <= m.r + atk.range + u.r && side <= half + u.r) game.damageUnit(u, bb.dmg, m, { attack: bb.name });
      }
    }
    if (m.stateT >= m.stateDur) { m.bombard = null; m.cd[bb.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
    return;
  }
  if (m.rampage) {
    const rp = m.rampage, atk = m.def.attacks[rp.name];
    rp.t += dt;
    if (rp.phase === 'run') {
      const d = dirFromAngle(rp.angle), before = { x: m.x, z: m.z };
      const res = game.moveEntity(m, d.x * atk.speed * dt, d.z * atk.speed * dt, { stopOnBlock: true });
      m.facing = rp.angle; m.moving = false;
      for (const u of game.units()) {
        if (rp.hit.has(u.id) || dist(m.x, m.z, u.x, u.z) >= m.r + u.r + 0.35) continue;
        rp.hit.add(u.id);
        game.damageUnit(u, rp.dmg, m, { attack: rp.name, knock: { angle: rp.angle, force: atk.knock || 3 } });
      }
      const moved = dist(before.x, before.z, m.x, m.z);
      if (res && res.blockedHard && moved < atk.speed * dt * 0.4 && rp.t > 0.08) {
        // ran into a rock, tree or wall: stunned, its rampage over
        m.rampage = null; m.cd[rp.name] = atk.cooldown;
        game.emit({ type: 'stunned', id: m.id, x: m.x, z: m.z });
        return setState(m, 'stunned', atk.crashStun ?? 1.6);
      }
      if (rp.t >= atk.run) {
        rp.leg++; rp.t = 0;
        if (rp.leg >= atk.legs) { m.rampage = null; m.cd[rp.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
        rp.phase = 'skid';
        game.emit({ type: 'skid', id: m.id, x: m.x, z: m.z, angle: rp.angle, leg: rp.leg });
      }
      return;
    }
    // skidding: it slides to a stop, swinging round to its prey, then the next leg (the hit list starts afresh)
    const k = Math.min(1, rp.t / atk.skid), d = dirFromAngle(m.facing), slide = atk.speed * 0.35 * (1 - k);
    game.moveEntity(m, d.x * slide * dt, d.z * slide * dt);
    m.moving = false;
    if (t && k < 0.6) rp.angle = angleTo(m.x, m.z, t.x, t.z);
    if (k >= 1) { rp.phase = 'run'; rp.t = 0; rp.hit.clear(); m.facing = rp.angle; game.emit({ type: 'rampageLeg', id: m.id, angle: rp.angle, leg: rp.leg }); }
    return;
  }
  if (m.stampede) {
    const st = m.stampede, atk = m.def.attacks[st.name], d = dirFromAngle(st.angle), px = d.z, pz = -d.x;
    m.moving = false;
    st.t += dt;
    while (st.i < atk.count && st.t >= st.i * atk.gap) {
      // the lanes from the outside in: one side, the other, the middle last
      const order = [-1, 1, 0, -2, 2], lane = order[st.i % order.length] * atk.spacing;
      const x = m.x + px * lane + d.x * 0.4, z = m.z + pz * lane + d.z * 0.4;
      game.spawnProjectile({ owner: 'monster', sourceId: m.id, kind: 'piglet', attack: st.name, trample: true, x, z, y: 0, angle: st.angle, speed: atk.speed, radius: atk.projectileRadius ?? 0.45, range: atk.range, element: 'physical', damage: st.dmg });
      st.i++;
    }
    if (st.i >= atk.count) { m.stampede = null; m.cd[st.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
    return;
  }
  if (m.perch) {
    const pc = m.perch, atk = m.def.attacks[pc.name], u = pc.unit;
    m.moving = false;
    if (!u.dead) { m.x = u.x; m.z = u.z; }
    // a dodge throws it off, dazed
    if (u === game.player && u.dash) {
      m.perch = null; m.cd[pc.name] = atk.cooldown;
      const off = dirFromAngle(m.facing + Math.PI);
      m.x += off.x * 1.2; m.z += off.z * 1.2;
      game.emit({ type: 'shaken', id: m.id, x: m.x, z: m.z });
      return setState(m, 'stunned', atk.shakeStun);
    }
    while (pc.n < atk.ticks && m.stateT >= ((pc.n + 0.5) / atk.ticks) * atk.ride) { pc.n++; if (!u.dead) game.damageUnit(u, pc.dmg, m, { attack: pc.name }); }
    if (m.stateT >= atk.ride || u.dead) {
      m.perch = null; m.cd[pc.name] = atk.cooldown;
      const off = dirFromAngle(m.facing + Math.PI);
      m.x += off.x * 1.0; m.z += off.z * 1.0;
      game.emit({ type: 'hopOff', id: m.id, x: m.x, z: m.z });
      return setState(m, 'recover', atk.recover);
    }
    return;
  }
  if (m.swoop) {
    const sw = m.swoop, atk = m.def.attacks[sw.name];
    if (sw.skid > 0) {
      // the skid after a pass (Greyfang): too fast to stop, it slides on the way it was going for `slide` m, slowing to
      // a stop with its claws dug in, its body swinging round toward the next curve as it goes (a drift)
      const ease = (q) => 1 - (1 - q) * (1 - q), q0 = 1 - sw.skid / atk.skid;
      sw.skid -= dt;
      const d = (ease(Math.min(1, 1 - sw.skid / atk.skid)) - ease(q0)) * (atk.slide || 0);
      if (d > 0) game.moveEntity(m, Math.sin(sw.slideA) * d, Math.cos(sw.slideA) * d);
      m.moving = false;
      if (sw.path) turnToward(m, angleTo(m.x, m.z, sw.path[1][0], sw.path[1][1]), dt, 6);
      if (sw.skid > 0) return;
      if (!sw.path) { m.swoop = null; m.cd[sw.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
      sw.path[0] = [m.x, m.z]; // from where the slide really stopped
      return;
    }
    sw.t += dt;
    const [p0, p1, p2] = sw.path, k = Math.min(1, sw.t / atk.duration), u1 = 1 - k;
    const x = u1 * u1 * p0[0] + 2 * u1 * k * p1[0] + k * k * p2[0], z = u1 * u1 * p0[1] + 2 * u1 * k * p1[1] + k * k * p2[1];
    m.facing = angleTo(m.x, m.z, x, z) || m.facing;
    m.x = x; m.z = z; m.moving = false;
    for (const u of game.units()) {
      if (sw.hit.has(u.id) || dist(m.x, m.z, u.x, u.z) > atk.reach + u.r) continue;
      sw.hit.add(u.id);
      game.damageUnit(u, sw.dmg, m, { attack: sw.name });
      // a swoop without `steal` only clips (Greyfang's hamstring, its inflict a hobble): event swoopHit
      if (!atk.steal) { game.emit({ type: 'swoopHit', id: m.id, name: sw.name, x: u.x, z: u.z }); continue; }
      // only the hero carries gold
      const take = u === game.player ? Math.min(game.ch.gold || 0, atk.steal) : 0;
      if (take > 0) { game.ch.gold -= take; m.loot = (m.loot || 0) + take; }
      game.emit({ type: 'snatch', id: m.id, x: u.x, z: u.z, gold: take });
    }
    if (k >= 1) {
      const prey = t || game.player, more = sw.pass < sw.passes && prey && !prey.dead;
      if (atk.skid) {
        // it skids (see above) after every pass; another pass is marked from where the slide will stop, through where
        // its prey stands now, to the other side
        sw.skid = atk.skid; sw.slideA = m.facing;
        if (more) {
          sw.pass++; sw.t = 0; sw.hit = new Set(); sw.side = -sw.side;
          const end = { x: m.x + Math.sin(m.facing) * (atk.slide || 0), z: m.z + Math.cos(m.facing) * (atk.slide || 0) };
          sw.path = swoopPath(end, prey, atk, sw.side);
          if (m.windup) m.windup.path = sw.path;
        } else sw.path = null;
        game.emit({ type: 'skid', id: m.id, name: sw.name, x: m.x, z: m.z, angle: m.facing, slide: atk.slide || 0, pass: sw.pass, last: !more, delay: atk.skid });
        return;
      }
      m.swoop = null; m.cd[sw.name] = atk.cooldown; return setState(m, 'recover', atk.recover);
    }
    return;
  }
  if (m.drop) {
    const d = m.drop, atk = m.def.attacks[d.name];
    m.moving = false;
    d.t += dt;
    if (d.t < atk.air) return; // up in the air, the clam falling
    if (!d.from) { d.from = [m.x, m.z]; game.emit({ type: 'glide', id: m.id, x: d.tx, z: d.tz }); }
    const k = Math.min(1, (d.t - atk.air) / atk.glide);
    m.x = d.from[0] + (d.tx - d.from[0]) * k; m.z = d.from[1] + (d.tz - d.from[1]) * k;
    if (k < 1) return;
    // down at the cracked shell: it eats, its back to the world
    m.drop = null;
    m.cd[d.name] = atk.cooldown;
    game.emit({ type: 'feast', id: m.id, x: m.x, z: m.z, duration: atk.feast });
    setState(m, 'stunned', atk.feast);
    m.exposed = atk.exposedTaken;
    return;
  }
  if (m.hold) {
    // engulfed (the salt slime): it sits over its prey, squeezing `ticks` times over `hold` s, then spits it out
    // `spit` m along its facing
    const h = m.hold, atk = m.def.attacks[h.name], u = h.unit;
    m.moving = false;
    if (!u.dead) { m.x = u.x; m.z = u.z; }
    while (h.n < atk.ticks && m.stateT >= (h.n / atk.ticks) * atk.hold) { h.n++; if (!u.dead) game.damageUnit(u, h.dmg, m, { attack: h.name }); }
    if (m.stateT >= atk.hold || u.dead) {
      const d = dirFromAngle(m.facing);
      if (!u.dead) game.moveEntity(u, d.x * atk.spit, d.z * atk.spit);
      game.emit({ type: 'spitOut', id: m.id, x: m.x, z: m.z, tx: u.x, tz: u.z });
      m.hold = null;
      m.cd[h.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    return;
  }
  if (m.suck) {
    const sk = m.suck, atk = m.def.attacks[sk.name], dir = dirFromAngle(sk.angle), mx = m.x + dir.x * m.r, mz = m.z + dir.z * m.r;
    m.moving = false;
    if (m.stateT < atk.duration) {
      // drawn in: what is in the cone is pulled toward the mouth, stopping short of it
      for (const u of game.units()) {
        const d = dist(mx, mz, u.x, u.z);
        if (d - u.r > atk.range || Math.abs(angleDiff(sk.angle, angleTo(m.x, m.z, u.x, u.z))) > (atk.arc * DEG) / 2) continue;
        const a = angleTo(u.x, u.z, mx, mz), step = Math.min(atk.pull * dt, Math.max(0, d - u.r - 0.35));
        if (step > 0) game.moveEntity(u, Math.sin(a) * step, Math.cos(a) * step);
      }
      return;
    }
    // the gulp: the jaws shut on what is at the mouth
    game.emit({ type: 'monsterSwing', id: m.id, name: sk.name, angle: sk.angle, range: atk.bite + m.r, arc: atk.arc, x: m.x, z: m.z });
    for (const u of game.units()) if (dist(mx, mz, u.x, u.z) - u.r <= atk.bite) game.damageUnit(u, sk.dmg, m, { attack: sk.name });
    m.suck = null;
    m.cd[sk.name] = atk.cooldown;
    return setState(m, 'recover', atk.recover);
  }
  if (m.grind) {
    const gr = m.grind, atk = m.def.attacks[gr.name], dir = dirFromAngle(gr.angle), half = atk.width / 2;
    m.moving = false;
    // the passes are spread evenly over the rasp, the first a beat after it starts
    while (gr.done < atk.ticks && m.stateT >= ((gr.done + 0.5) / atk.ticks) * atk.duration) {
      gr.done++;
      game.emit({ type: 'monsterSwing', id: m.id, name: gr.name, angle: gr.angle, range: atk.range + m.r, arc: 40, x: m.x, z: m.z, hit: gr.done, hits: atk.ticks });
      for (const u of game.units()) {
        const dx = u.x - m.x, dz = u.z - m.z, along = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x);
        if (along >= 0 && along <= m.r + atk.range + u.r && side <= half + u.r) game.damageUnit(u, gr.dmg, m, { attack: gr.name });
      }
    }
    if (m.stateT >= atk.duration) { m.grind = null; m.cd[gr.name] = atk.cooldown; setState(m, 'recover', atk.recover); }
    return;
  }
  const c = m.charge;
  if (!c) return setState(m, 'chase');
  c.t += dt;
  if (c.skip) {
    const atk = m.def.attacks[m.windup?.name], hop = c.hops[c.i];
    const k = Math.min(1, c.t / atk.air);
    m.x = c.fromX + (hop[0] - c.fromX) * k;
    m.z = c.fromZ + (hop[1] - c.fromZ) * k;
    m.moving = false;
    c.air = k < 1 ? k : -1; // 0..1 in the air, -1 on the ground (the renderer's flop)
    if (c.t >= atk.air + (c.i < c.hops.length - 1 ? atk.pause : 0)) {
      c.i++; c.t = 0; c.fromX = m.x; c.fromZ = m.z;
      if (c.i >= c.hops.length) { m.charge = null; return setState(m, 'recover', atk.recover); }
    }
    return;
  }
  if (c.scuttle) {
    const k = Math.min(1, c.t / c.dur), side = Math.sin(k * Math.PI * 2) * c.half;
    const dir = dirFromAngle(c.angle), px = dir.z, pz = -dir.x;
    m.x = c.ox + px * side; m.z = c.oz + pz * side;
    m.moving = false;
    const pass = k < 0.5 ? 0 : 1;
    for (const u of game.units()) {
      if (c.hits[pass].has(u.id)) continue;
      const dx = u.x - m.x, dz = u.z - m.z, along = dx * dir.x + dz * dir.z, lat = Math.abs(dx * px + dz * pz);
      if (along >= 0 && along <= c.reach + u.r && lat <= 0.7 + u.r) {
        c.hits[pass].add(u.id);
        // the claws' contact, for the renderer's marks on what was clipped
        game.emit({ type: 'monsterSwing', id: m.id, name: m.windup?.name, angle: c.angle, range: c.reach + m.r, arc: 140, x: m.x, z: m.z, hit: pass + 1 });
        game.damageUnit(u, c.dmg, m, { attack: m.windup?.name });
      }
    }
    if (k >= 1) {
      const name = m.windup.name, atk = m.def.attacks[name];
      m.charge = null;
      m.cd[name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    return;
  }
  if (c.dive) {
    const k = Math.min(1, c.t / c.dur);
    m.x = c.fromX + (c.toX - c.fromX) * k;
    m.z = c.fromZ + (c.toZ - c.fromZ) * k;
    if (k >= 1) {
      const name = m.windup?.name && m.def.attacks[m.windup.name] ? m.windup.name : 'dive', atk = m.def.attacks[name];
      if (c.perch) {
        // landed on a head: it rides there
        const prey = game.units().find((u) => dist(m.x, m.z, u.x, u.z) <= 0.9 + u.r);
        m.charge = null;
        if (prey) {
          m.perch = { name, unit: prey, n: 0, dmg: c.dmg };
          game.emit({ type: 'perch', id: m.id, x: m.x, z: m.z, ride: atk.ride });
          return setState(m, 'act', atk.ride);
        }
        m.cd[name] = atk.cooldown;
        return setState(m, 'recover', atk.recover);
      }
      if (c.engulf) {
        // landed on a unit: it wraps over it (the first squeeze at once, so the hold starts as it lands)
        const prey = game.units().find((u) => dist(m.x, m.z, u.x, u.z) <= atk.radius + u.r);
        if (prey) {
          m.charge = null;
          m.hold = { name, unit: prey, n: 1, dmg: c.dmg };
          game.emit({ type: 'engulf', id: m.id, x: m.x, z: m.z, hold: atk.hold });
          setState(m, 'act', atk.hold);
          game.damageUnit(prey, c.dmg, m, { attack: name });
          return;
        }
      }
      m.charge = null;
      m.cd[name] = atk.cooldown;
      // landed past its prey (atk.past): it turns round to face it
      if (atk.past) { const prey = m.targetUnit || game.player; m.facing = angleTo(m.x, m.z, prey.x, prey.z); game.emit({ type: 'wingLand', id: m.id, x: m.x, z: m.z, facing: m.facing }); }
      // a leap that lands on nobody (its circle's radius, as the area tests it) leaves it stuck: the punish window
      const mx = m.windup?.tx ?? c.toX, mz = m.windup?.tz ?? c.toZ; // the marked circle's middle
      if (atk.missStun && !game.units().some((u) => dist(mx, mz, u.x, u.z) <= (atk.radius || 1) + u.r)) {
        game.emit({ type: 'stunned', id: m.id, x: m.x, z: m.z, miss: name });
        return setState(m, 'stunned', atk.missStun);
      }
      setState(m, 'recover', atk.recover);
    }
    return;
  }
  const dir = dirFromAngle(c.angle);
  const before = { x: m.x, z: m.z };
  const res = game.moveEntity(m, dir.x * c.speed * dt, dir.z * c.speed * dt, { stopOnBlock: !c.hop });
  if (!c.hop) {
    for (const u of game.units()) {
      if (c.hit.has(u.id)) continue;
      if (dist(m.x, m.z, u.x, u.z) < m.r + u.r + 0.35) {
        c.hit.add(u.id);
        // a ricochet's next leg spares what its last leg struck for a moment (the carom right beside it)
        if (c.struck && game.time - (c.struck.get(u.id) ?? -9) < 0.6) continue;
        c.struck?.set(u.id, game.time); c.any = true;
        const ca = m.def.attacks[c.name];
        const dealt = game.damageUnit(u, c.dmg, m, { attack: c.name, knock: { angle: c.angle, force: ca?.knock ?? 4 } });
        // `stopOnHit`: it pulls up on what it struck (the ironhorn ram's clash: horns on its prey, the charge spent)
        if (ca?.stopOnHit && (dealt || u !== game.player)) {
          m.charge = null;
          game.emit({ type: 'clash', id: m.id, x: m.x, z: m.z, angle: c.angle, tx: u.x, tz: u.z });
          return setState(m, 'recover', ca.recover);
        }
      }
    }
  }
  const moved = dist(before.x, before.z, m.x, m.z);
  if (c.trail) {
    c.trail.left -= moved;
    if (c.trail.left <= 0) {
      c.trail.left = c.trail.every;
      const p = m.def.attacks[c.name].pool, lvl = 1 + (m.level - 1) * 0.15;
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: c.name, kind: p.kind || 'mucus', x: m.x, z: m.z, radius: p.radius, delay: 0.2, duration: p.duration, tick: p.tick, damage: p.dps * p.tick * lvl });
    }
  }
  const ratk = m.def.attacks[m.windup?.name];
  if (!c.hop && ratk?.legs && c.leg < ratk.legs - 1 && ((res && res.blockedHard && moved < c.speed * dt * 0.4 && c.t > 0.08) || c.t >= c.dur)) {
    // a ricochet (the horned warden's boulder): at the end of each leg, or off whatever it struck, it caroms off `turn`
    // degrees, to one side then the other (the first toward its prey), a zigzag of `legs` legs, each able to hit a unit
    c.leg++; c.angle += c.side * (c.leg % 2 ? 1 : -1) * ratk.turn * DEG; c.t = 0; m.facing = c.angle;
    c.hit.clear();
    game.emit({ type: 'ricochet', id: m.id, x: m.x, z: m.z, angle: c.angle, leg: c.leg, length: c.speed * c.dur });
    return;
  }
  if (!c.hop && ratk?.rebound && !c.back && ((res && res.blockedHard && moved < c.speed * dt * 0.4 && c.t > 0.08) || c.t >= c.dur)) {
    // a rebound roll (the pangolin): at the end of its lane, or off whatever it struck, it bounces back along
    // the same lane, able to hit each unit once more on the way
    Object.assign(c, { back: true, angle: c.angle + Math.PI, t: 0, dur: ratk.rebound, speed: c.speed * (ratk.reboundSpeed ?? 0.8) });
    c.hit.clear();
    game.emit({ type: 'rebound', id: m.id, x: m.x, z: m.z, angle: c.angle });
    return;
  }
  if (!c.hop && c.back && ratk?.dizzy && (c.t >= c.dur || (res && res.blockedHard && moved < c.speed * dt * 0.4))) {
    // after the rebound it uncurls dizzy: the punish window
    m.charge = null;
    m.cd[m.windup.name] = ratk.cooldown;
    game.emit({ type: 'stunned', id: m.id, x: m.x, z: m.z, dizzy: true });
    return setState(m, 'stunned', ratk.dizzy);
  }
  if (!c.hop && res && res.blockedHard && moved < c.speed * dt * 0.4 && c.t > 0.08) {
    // ran into a rock, tree, pillar or cliff: stunned. Positioning matters.
    m.charge = null;
    game.emit({ type: 'stunned', id: m.id, x: m.x, z: m.z });
    return setState(m, 'stunned', m.def.boss ? 2.2 : 1.6);
  }
  if (c.t >= c.dur) {
    const name = m.windup?.name || 'charge';
    m.charge = null;
    const atk = m.def.attacks[name];
    // a heavy charge that hit nobody leaves the monster off balance: the punish window
    if (!c.hop && atk?.missStun && !(atk.legs ? c.any : c.hit.size)) {
      game.emit({ type: 'stunned', id: m.id, x: m.x, z: m.z });
      return setState(m, 'stunned', atk.missStun);
    }
    setState(m, 'recover', c.hop ? 0.3 : atk ? atk.recover : 0.8);
  }
}

// ---------- behaviours ----------

function charger(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.bite.range && m.cd.bite <= 0) return startWindup(game, m, 'bite', t);
  if (m.cd.charge <= 0 && gap >= a.charge.minRange && gap <= a.charge.maxRange) return startWindup(game, m, 'charge', t);
  if (gap > a.bite.range * 0.8) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 6);
  }
}

function coastalMelee(game, m, dt, { t, gap, slowMult }) {
  const name = m.def.primaryAttack;
  const attack = m.def.attacks[name];
  const shell = m.def.attacks.shell;
  if (shell?.afterAttacks && m.guardAttacks >= shell.afterAttacks && m.cd.shell <= 0) return enterShell(game, m);
  if (gap <= attack.range && m.cd[name] <= 0) return startWindup(game, m, name, t);
  if (gap > attack.range * .75) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else { m.moving = false; turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 4); }
}

function shellSpitter(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.spit.range && m.cd.spit <= 0) return startWindup(game, m, 'spit', t);
  if (gap > a.spit.range * 0.75) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 4);
  }
}

function kiter(game, m, dt, { t, dToT, slowMult }) {
  const a = m.def.attacks;
  const [near, far] = m.def.keepDistance;
  if (dToT < a.blink.triggerRange && m.cd.blink <= 0) {
    m.cd.blink = a.blink.cooldown;
    const away = angleTo(t.x, t.z, m.x, m.z);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
      const dir = dirFromAngle(away + off);
      const nx = m.x + dir.x * a.blink.distance;
      const nz = m.z + dir.z * a.blink.distance;
      if (game.world.isFree(nx, nz, m.r) && !game.isSafe(nx, nz)) {
        game.emit({ type: 'blink', id: m.id, fromX: m.x, fromZ: m.z, x: nx, z: nz });
        m.x = nx;
        m.z = nz;
        break;
      }
    }
    return;
  }
  if (dToT <= a.orb.range && m.cd.orb <= 0) return startWindup(game, m, 'orb', t);
  strafe(game, m, dt, t, dToT, near, far, m.def.speed * slowMult);
}

/** Keep between near and far from the target, drifting sideways. */
// how far past the circling band's edge it must stray before it changes what it does there
const STRAFE_HYSTERESIS = 0.4;
function strafe(game, m, dt, t, d, near, far, speed) {
  const toT = angleTo(m.x, m.z, t.x, t.z);
  // close in, circle or back off - kept until it is well past the band's edge, so a prey moving about near an
  // edge does not flick it between the three every frame (its walk read as a stutter, owner 2026-11-04)
  const prev = m.strafeMode, h = STRAFE_HYSTERESIS;
  let mode;
  if (prev === 'close' && d > far - h) mode = 'close';
  else if (prev === 'back' && d < near + h) mode = 'back';
  else if (d > far + (prev === 'circle' ? h : 0)) mode = 'close';
  else if (d < near - (prev === 'circle' ? h : 0)) mode = 'back';
  else mode = 'circle';
  m.strafeMode = mode;
  let moveA;
  if (mode === 'back') moveA = toT + Math.PI;
  else if (mode === 'close') moveA = toT;
  else moveA = toT + (m.id % 2 ? 1 : -1) * Math.PI * 0.5;
  // backing off is a few slow steps back, not a full-speed retreat (a beast walking backwards that fast read as a
  // stutter); closing in is at full speed
  const s = speed * (mode === 'circle' ? 0.4 : mode === 'back' ? 0.55 : 1);
  const dir = dirFromAngle(moveA);
  game.moveEntity(m, dir.x * s * dt, dir.z * s * dt);
  turnToward(m, m.def.flyer ? moveA : toT, dt, 6);
  m.moving = true;
}

function packWolf(game, m, dt, { t, gap, dToT, slowMult }) {
  const a = m.def.attacks;
  if (m.wantsHowl && a.howl && m.cd.howl <= 0) {
    m.wantsHowl = false;
    return startWindup(game, m, 'howl', t);
  }
  if (a.rend && gap <= a.rend.range && m.cd.rend <= 0) return startWindup(game, m, 'rend', t);
  if (gap <= a.bite.range && m.cd.bite <= 0) return startWindup(game, m, 'bite', t);
  const [near, far] = m.def.circle;
  if (a.rend && m.cd.rend > 1.2 && m.cd.bite > 0.3) return strafe(game, m, dt, t, dToT, near, far, m.def.speed * slowMult); // circle, wait for an opening
  walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
}

function greyfang(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (a.howl && m.cd.howl <= 0 && m.hp < m.maxHp * 0.85) return startWindup(game, m, 'howl', t);
  // below half health it leaps at the player: a crouch, then it lands on the marked spot
  const leap = a.leap;
  if (leap && m.cd.leap <= 0 && m.hp <= m.maxHp * leap.hpBelow && gap >= leap.minRange && gap <= leap.range) {
    startWindup(game, m, 'leap', t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'leap', kind: 'pounce', x: t.x, z: t.z, radius: leap.radius, delay: m.windup.total + 0.35, duration: 0.3, damage: m.damage * leap.damageMult });
    return;
  }
  if (gap <= a.bite.range && m.cd.bite <= 0) return startWindup(game, m, 'bite', t);
  if (m.cd.rake <= 0 && gap <= a.rake.range) return startWindup(game, m, 'rake', t);
  if (gap > a.bite.range * 0.7) walkTo(game, m, t.x, t.z, m.def.speed * slowMult * (m.enraged ? 1.2 : 1), dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 6);
  }
}

function spore(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.puff.range && m.cd.puff <= 0) return startWindup(game, m, 'puff', t);
  if (gap > a.puff.range * 0.6) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 4);
  }
}

function golem(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.pound.range && m.cd.pound <= 0) {
    startWindup(game, m, 'pound', t);
    // the ground shows where the fists land for the whole wind-up
    const d = dirFromAngle(m.facing);
    const x = m.x + d.x * 1.6;
    const z = m.z + d.z * 1.6;
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'pound', kind: 'pound', x, z, radius: a.pound.radius, delay: m.windup.total, duration: 0.3, damage: m.damage * a.pound.damageMult });
    return;
  }
  if (m.cd.throw <= 0 && gap >= a.throw.minRange && gap <= a.throw.range) {
    // aim where the target stands now: walk out of the marked circle
    startWindup(game, m, 'throw', t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'throw', kind: 'rock', x: t.x, z: t.z, radius: a.throw.radius, delay: m.windup.total + a.throw.flight, duration: 0.3, damage: m.damage * a.throw.damageMult });
    return;
  }
  if (gap > a.pound.range * 0.7) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 2.5);
  }
}

function hawk(game, m, dt, { t, dToT, slowMult }) {
  const a = m.def.attacks;
  if (m.cd.dive <= 0 && dToT <= a.dive.range && m.alt > m.def.hover * 0.8) {
    startWindup(game, m, 'dive', t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'dive', kind: 'dive', x: t.x, z: t.z, radius: a.dive.radius, delay: m.windup.total + 0.35, duration: 0.3, damage: m.damage * a.dive.damageMult });
    return;
  }
  const [near, far] = m.def.circle;
  strafe(game, m, dt, t, dToT, near, far, m.def.speed * slowMult);
}

function mantis(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.scythe.range && m.cd.scythe <= 0) return startWindup(game, m, 'scythe', t);
  if (m.cd.whirl <= 0 && gap <= a.whirl.range) return startWindup(game, m, 'whirl', t);
  if (gap > a.scythe.range * 0.8) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 6);
  }
}

function ram(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.stomp.range && m.cd.stomp <= 0) return startWindup(game, m, 'stomp', t, { radius: a.stomp.radius });
  if (m.cd.shove <= 0 && gap <= a.shove.range) return startWindup(game, m, 'shove', t);
  if (gap > a.stomp.range * 0.8) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 3);
  }
}

function stalker(game, m, dt, { t, gap, dToT, slowMult }) {
  const a = m.def.attacks;
  m.revealT = Math.max(0, (m.revealT || 0) - dt);
  if (gap <= a.claw.range && m.cd.claw <= 0) return startWindup(game, m, 'claw', t);
  if (m.cd.pounce <= 0 && gap >= a.pounce.minRange && gap <= a.pounce.range) {
    startWindup(game, m, 'pounce', t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'pounce', kind: 'pounce', x: t.x, z: t.z, radius: a.pounce.radius, delay: m.windup.total + 0.35, duration: 0.3, damage: m.damage * a.pounce.damageMult });
    return;
  }
  // between attacks it circles half-seen, out of reach
  m.stealth = m.revealT <= 0;
  const [near, far] = m.def.circle;
  strafe(game, m, dt, t, dToT, near, far, m.def.speed * slowMult);
}

function sentinel(game, m, dt, { t, gap, dToT, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.shards.range && m.cd.shards <= 0) return startWindup(game, m, 'shards', t, { radius: a.shards.radius });
  if (m.cd.beam <= 0 && dToT <= a.beam.range) return startWindup(game, m, 'beam', t);
  if (dToT > a.beam.range * 0.8) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 2);
  }
}

/**
 * A monster's own kit (behavior "kit"; owner, 2026-11-03: every monster its own attacks, docs/MONSTER-ATTACKS.md).
 * Each attack with `use` says when it is taken: `use.min`/`use.max` (the gap to the target, metres; max defaults
 * to the attack's range) and `use.hpBelow` (a share of its health). The first ready one in the data's order is
 * taken, so the order is the priority. Between attacks it walks in, or circles at `kit.circle` [near, far] while
 * everything is cooling down.
 */
function kit(game, m, dt, { t, gap, dToT, slowMult }) {
  const def = m.def, names = kitOrder(def);
  // the hermit crab out of its shell (shell_shed) fights fast while loose (its way home: updateMonster nakedHome)
  const nk = m.naked, nakedAtk = nk && def.attacks[nk.name];
  const speed = def.speed * slowMult * (nk ? nakedAtk.nakedSpeed : 1);
  // withdraw (the snail king): at each health share in `at` it pulls into its shell once (the shell's damageTaken),
  // a ring round it marked for the whole time, then bursts out as the ring goes off
  // split (the salt slime): brought under `at` of its health, once, a bud the size of `size` pinches off beside it
  // with `share` of its full health; a bud never splits and gives only gold (a minion)
  // kit.blink (the marsh wisp): come within `triggerRange` m of it and it scatters and gathers again `distance` m
  // away (every `cooldown` s; event blink), as a marsh light does when it is approached
  const bl = def.kit?.blink;
  if (bl && t && dToT < bl.triggerRange && game.time >= (m.blinkAt || 0)) {
    const away = angleTo(t.x, t.z, m.x, m.z);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
      const nx = m.x + Math.sin(away + off) * bl.distance, nz = m.z + Math.cos(away + off) * bl.distance;
      if (!game.world.isFree(nx, nz, m.r) || game.isSafe(nx, nz)) continue;
      m.blinkAt = game.time + bl.cooldown; m.blinkedAt = game.time;
      game.emit({ type: 'blink', id: m.id, fromX: m.x, fromZ: m.z, x: nx, z: nz });
      m.x = nx; m.z = nz; m.moving = false;
      return;
    }
  }
  // the phase roar (kit.phaseRoar s, Greyfang): brought to its enrage share, it stops once to roar before the second
  // phase's attacks come (event phaseRoar)
  const roar = def.kit?.phaseRoar;
  if (roar && m.enraged && !m.roared) {
    m.roared = true; m.moving = false;
    game.emit({ type: 'phaseRoar', id: m.id, x: m.x, z: m.z, duration: roar });
    setState(m, 'recover', roar);
    m.roaring = true;
    return;
  }
  const sp = def.attacks.split;
  if (sp && canUse(m, 'split') && !m.bud && !m.split && m.hp <= m.maxHp * sp.at) { splitOff(game, m, t); return; }
  const wd = def.kit?.withdraw;
  if (wd) for (let i = 0; i < wd.at.length; i++) {
    if (m.hp > m.maxHp * wd.at[i] || m.withdrew?.[i]) continue;
    (m.withdrew ||= [])[i] = true;
    m.shell = true; m.moving = false;
    setState(m, 'shell', wd.duration);
    // while it is in its shell, the shell's spiral throws pearls out along `arms` spiral arms (`rings` each, `step` m
    // apart from `start` m, turning `twist` rad a ring), wave after wave (`waves`: s after it withdraws), each wave
    // turning the other way; each pearl is marked, then bursts `gap` s after the ring inside it
    const sp = wd.spiral;
    sp.waves.forEach((at, w) => {
      const turn = w % 2 ? -1 : 1, base = m.facing + w * (Math.PI / sp.arms);
      for (let arm = 0; arm < sp.arms; arm++) for (let k = 0; k < sp.rings; k++) {
        const a = base + (arm / sp.arms) * Math.PI * 2 + turn * k * sp.twist, d = sp.start + k * sp.step;
        const x = m.x + Math.sin(a) * d, z = m.z + Math.cos(a) * d;
        if (game.isSafe(x, z)) continue;
        game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'withdraw', kind: 'pearl_burst', wave: w, x, z, radius: sp.radius, delay: at + k * sp.gap, duration: 0.3, damage: m.damage * (wd.damageMult || 1) });
      }
    });
    game.emit({ type: 'withdraw', id: m.id, x: m.x, z: m.z, duration: wd.duration });
    return;
  }
  let reach = Infinity, reachAll = Infinity, soon = Infinity;
  for (const name of names) {
    if (!canUse(m, name)) continue;
    const atk = def.attacks[name], u = atk.use, max = u.max ?? atk.range;
    if ((u.hpBelow && m.hp > m.maxHp * u.hpBelow) || (u.once && m.used?.[name])) continue;
    if (nk && atk.needsShell) continue; // its anemones and its shell went with the shell
    if ((atk.kind || name) === 'rally' && packAlive(game, m) >= atk.cap) continue; // its pack is already round its prey
    // behind: only for a target at its back (more than 100 degrees off its facing)
    if (u.behind && Math.abs(angleDiff(m.facing, angleTo(m.x, m.z, t.x, t.z))) < 1.75) continue;
    // side: only for a target at its flank (35 to 145 degrees off its facing)
    if (u.side) { const off = Math.abs(angleDiff(m.facing, angleTo(m.x, m.z, t.x, t.z))); if (off < 0.6 || off > 2.53) continue; }
    // a burrow (erupt) never comes up in a safe town
    if ((atk.kind || name) === 'erupt' && game.isSafe(t.x, t.z)) continue;
    // it closes only as far as an attack that is ready, or nearly, needs (a mole with its scoop cooling stops at
    // dirt-spray range instead of walking up to claw range)
    if (m.cd[name] < 1) reach = Math.min(reach, max);
    reachAll = Math.min(reachAll, max);
    soon = Math.min(soon, m.cd[name]);
    if (m.cd[name] > 0 || gap < (u.min ?? 0) || gap > max) continue;
    return beginAttack(game, m, name, t);
  }
  const circle = def.kit?.circle;
  if (circle && soon > 0.6) return strafe(game, m, dt, t, dToT, circle[0], circle[1], speed);
  if (reach === Infinity) reach = reachAll; // everything is cooling: close to its nearest reach as before
  if (gap > reach * 0.8) walkTo(game, m, t.x, t.z, speed, dt, nk ? 10 : def.kit?.turn);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, def.kit?.turn ?? 6);
  }
}

/** How many of a monster's pack (wolves its rally called) still stand. */
function packAlive(game, m) {
  let n = 0;
  for (const o of game.monsters) if (o.packOf === m.id && !o.dead) n++;
  return n;
}

function nakedHome(game, m, dt, slowMult) {
  const nk = m.naked, atk = m.def.attacks[nk.name];
  if (!walkTo(game, m, nk.x, nk.z, m.def.speed * atk.nakedSpeed * slowMult, dt, 10)) return;
  nk.phase = 'climb'; m.facing = nk.facing; m.moving = false;
  game.emit({ type: 'shellClimb', id: m.id, x: nk.x, z: nk.z });
  setState(m, 'act', atk.climb);
}

function sproutStep(game, m, dt) {
  const sp = m.sprout;
  m.moving = false; m.stateT += dt;
  sp.t += dt; sp.next -= dt;
  if (sp.t >= sp.life) { m.illusion = { t: 0, of: sp.of }; game.emit({ type: 'wilt', id: m.id, x: m.x, z: m.z }); return game.killMonster(m); }
  if (sp.next <= 0) {
    sp.next = sp.every;
    const c = sp.cloud;
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'sprouts', kind: 'spore_cloud', x: m.x, z: m.z, radius: c.radius, delay: c.delay, duration: c.duration, tick: 0.5, damage: c.dps * 0.5 * (1 + (m.level - 1) * 0.14) });
    game.emit({ type: 'sproutPuff', id: m.id, x: m.x, z: m.z, delay: c.delay });
  }
}

function splitOff(game, m, t) {
  const sp = m.def.attacks.split;
  m.split = true;
  const a = (t ? angleTo(t.x, t.z, m.x, m.z) : m.facing + Math.PI) + (m.id % 2 ? 0.9 : -0.9); // off its back, to one side
  let x = m.x + Math.sin(a) * (m.r + 0.9), z = m.z + Math.cos(a) * (m.r + 0.9);
  if (!game.world.isFree(x, z, m.r * sp.size) || game.isSafe(x, z)) { x = m.x; z = m.z; }
  const b = game.spawnMinion(m.type, m.level, x, z);
  const hp = Math.max(1, Math.round(m.maxHp * sp.share));
  Object.assign(b, { bud: true, size: sp.size, r: m.r * sp.size, hp, maxHp: hp, homeX: x, homeZ: z, facing: a });
  for (const k in b.cd) b.cd[k] = Math.max(b.cd[k], 1.5); // it gathers itself before it fights
  setAggro(game, b, t || game.player);
  game.emit({ type: 'split', id: m.id, bud: b.id, x: m.x, z: m.z, tx: x, tz: z });
  setState(m, 'recover', sp.recover);
}

/** kit.trail (the snail king's slime): a lingering pool every `every` m it crawls. */
function dropTrail(game, m) {
  const tr = m.def.kit?.trail;
  if (!tr) return;
  if (m.trailFrom === undefined) { m.trailFrom = { x: m.x, z: m.z }; return; }
  if (dist(m.x, m.z, m.trailFrom.x, m.trailFrom.z) < tr.every) return;
  m.trailFrom = { x: m.x, z: m.z };
  const p = tr.pool, lvl = 1 + (m.level - 1) * 0.15;
  game.spawnArea({ owner: 'monster', sourceId: m.id, attack: tr.attack, kind: p.kind || 'mucus', x: m.x, z: m.z, radius: p.radius, delay: 0.3, duration: p.duration, tick: p.tick, damage: p.dps * p.tick * lvl });
}

/**
 * The monster sandbox (ui/monster-lab.js): set off an attack that answers what is done to the monster (one without
 * `use`: hit hard, or brought low), as if that had just happened. False for one it cannot set off.
 */
export function labTrigger(game, m, name) {
  const atk = m.def.attacks;
  if (name === 'acid') { m.cd.acid = 0; m.recentHits = []; for (let i = 0; i < atk.acid.hitsToTrigger; i++) acidHit(game, m, null); return true; }
  if (name === 'nacre') { coatNacre(game, m); return true; }
  if (name === 'click') { feignDead(game, m, game.player); return true; }
  if (name === 'split') { m.split = false; m.hp = Math.min(m.hp, m.maxHp * atk.split.at * 0.95); return true; } // kit() splits on its next step
  if (name === 'shed') { shedPatches(game, m); return true; }
  // the withdraw comes with the health share it is kept for (kit() withdraws on its next step)
  if (name === 'shell' && m.def.kit?.withdraw) { m.withdrew = []; m.hp = Math.min(m.hp, m.maxHp * (m.def.kit.withdraw.at[0] - 0.01)); return true; }
  if (name === 'shell') { enterShell(game, m); return true; }
  return false;
}

/**
 * Whether this monster may use an attack: a kit monster with a `normal` attack uses only that one unless it is an
 * elite (data monsters.elite) or a boss (owner, 2026-11-06: "normal ones have one move each").
 */
export const canUse = (m, name) => m.elite || m.boss || !m.def.normal || m.def.normal === name;

const KIT_ORDER = new WeakMap();
const kitOrder = (def) => {
  let o = KIT_ORDER.get(def);
  if (!o) KIT_ORDER.set(def, (o = Object.keys(def.attacks).filter((n) => def.attacks[n].use)));
  return o;
};

/** Start an attack by its mechanics (attacks.<name>.kind, else its name): what is marked on the ground goes down now. */
export function beginAttack(game, m, name, t) {
  const atk = m.def.attacks[name], kind = atk.kind || name;
  if (kind === 'pounce' || kind === 'dive') {
    // the landing spot is where the target stands now, marked for the whole wind-up and the leap; `past` (m): it
    // flies over its prey and lands that far beyond, behind it (the mantis), turning round as it lands
    let x = t.x, z = t.z;
    if (atk.past) { const a = angleTo(m.x, m.z, t.x, t.z); x += Math.sin(a) * atk.past; z += Math.cos(a) * atk.past; if (game.isSafe(x, z)) { x = t.x; z = t.z; } }
    startWindup(game, m, name, t, { tx: x, tz: z, overX: t.x, overZ: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: atk.areaKind || 'pounce', x, z, radius: atk.radius, delay: m.windup.total + (atk.air ?? 0.35), duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    return;
  }
  if (kind === 'slam' || kind === 'stomp' || kind === 'shards') return startWindup(game, m, name, t, { radius: atk.radius });
  if (kind === 'hammer_fists') {
    // both fists come down `reach` m before it: a slam over `radius` m as the wind-up ends, then the aftershock runs
    // out through the band from `radius` to `ring` m `after` s later; both marked now
    startWindup(game, m, name, t);
    const d = dirFromAngle(m.windup.angle), x = m.x + d.x * atk.reach, z = m.z + d.z * atk.reach;
    Object.assign(m.windup, { tx: x, tz: z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'golem_slam', x, z, radius: atk.radius, delay: m.windup.total, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'golem_aftershock', x, z, radius: atk.ring, inner: atk.radius, delay: m.windup.total + atk.after, duration: 0.3, damage: m.damage * (atk.afterMult || 0.6) });
    return;
  }
  if (kind === 'boulder_hurl') {
    // it wrenches a boulder out of the ground and hurls it onto where its prey stands now (marked, landing `flight` s
    // after the wind-up); landing, it shatters into `shards` fragments skidding out along lanes set now (seeded, marked)
    startWindup(game, m, name, t, { tx: t.x, tz: t.z });
    const a0 = angleTo(m.x, m.z, t.x, t.z) + game.rng.range(-0.3, 0.3), angles = [];
    for (let i = 0; i < atk.shards; i++) angles.push(a0 + (i / atk.shards) * Math.PI * 2);
    m.windup.angles = angles;
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'boulder', x: t.x, z: t.z, radius: atk.radius, delay: m.windup.total + atk.flight, duration: 0.3, damage: m.damage * (atk.damageMult || 1),
      shards: { angles, speed: atk.shardSpeed, range: atk.shardRange, radius: atk.shardRadius, damage: m.damage * (atk.shardMult || 0.5) } });
    return;
  }
  if (kind === 'rune_seal') {
    // a circle of runes inscribed round where its prey stands now: `glyphs` runes light one after another round it
    // until the seal closes as the wind-up ends `seal` s later; whoever is still inside is struck and held (its inflict)
    startWindup(game, m, name, t, { tx: t.x, tz: t.z });
    if (!game.isSafe(t.x, t.z)) game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'rune_seal', x: t.x, z: t.z, radius: atk.radius, delay: m.windup.total, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    return;
  }
  if (kind === 'shield_wall') {
    // the warden plants its shield before it and crouches behind it (blows to its front turned, game hitMonster)
    startWindup(game, m, name, t);
    m.blocked = 0;
    return;
  }
  if (kind === 'charge' && atk.legs) {
    // the warden's ricochet: its first carom turns toward the side its prey is on
    startWindup(game, m, name, t);
    return;
  }
  if (kind === 'lava_fissure') {
    // its fist goes into the ground and `lines` cracks run out from it across its prey (`spread` degrees apart, each
    // `length` m with kinks of up to `kink` m, seeded), marked now; `open` s after the wind-up the whole length of each
    // splits at once into a curtain of lava (a fissure eruption), then stays a burning lane: core area fence, its
    // first pulse at full damage, the rest at `laterMult`
    startWindup(game, m, name, t);
    const lines = [];
    for (let i = 0; i < atk.lines; i++) {
      const a = m.windup.angle + (i - (atk.lines - 1) / 2) * atk.spread * DEG, d = dirFromAngle(a), px = d.z, pz = -d.x, pts = [];
      for (let k = 0; k <= 4; k++) {
        const r = m.r + 0.4 + (k / 4) * atk.length, off = k === 0 ? 0 : game.rng.range(-atk.kink, atk.kink);
        pts.push([m.x + d.x * r + px * off, m.z + d.z * r + pz * off]);
      }
      lines.push(pts);
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'lava_fissure', x: pts[2][0], z: pts[2][1], radius: atk.length / 2, delay: m.windup.total + atk.open, duration: atk.every * (atk.pulses - 1) + 0.05, damage: m.damage * (atk.damageMult || 1),
        fence: { pts, width: atk.width, every: atk.every, pulses: atk.pulses, n: 0, later: atk.laterMult } });
    }
    m.windup.lines = lines;
    return;
  }
  if (kind === 'core_eruption') {
    // it kneels and its core opens; `slabs` stone slabs heave up `slabRing` m round its prey (seeded, never on the side
    // toward the warden, so reaching cover means moving), and its core bursts as the wind-up ends (windup())
    startWindup(game, m, name, t, { tx: t.x, tz: t.z });
    const toward = angleTo(t.x, t.z, m.x, m.z), slabs = [];
    for (let i = 0; i < atk.slabs; i++) {
      const a = toward + Math.PI + (i - (atk.slabs - 1) / 2) * ((2 * Math.PI - 2.2) / atk.slabs) + game.rng.range(-0.25, 0.25);
      slabs.push({ x: t.x + Math.sin(a) * atk.slabRing, z: t.z + Math.cos(a) * atk.slabRing });
    }
    m.windup.slabs = slabs;
    game.emit({ type: 'slabsRise', id: m.id, x: m.x, z: m.z, slabs, width: atk.slabWidth, total: m.windup.total, radius: atk.radius });
    return;
  }
  if (kind === 'rock_orbit') {
    // the rubble round it lifts through the wind-up, its ring marked
    startWindup(game, m, name, t);
    return;
  }
  if (kind === 'hook') {
    // it keeps its facing and cocks its horns toward the flank its prey is on
    const side = angleDiff(m.facing, angleTo(m.x, m.z, t.x, t.z)) >= 0 ? 1 : -1, f = m.facing;
    startWindup(game, m, name, t, { side, face: f });
    m.windup.angle = f + side * (atk.off || 70) * DEG; m.facing = f; // (w.angle: the middle of the hooked cone, its warning)
    return;
  }
  if (kind === 'stoop' || kind === 'thunder_wings') {
    // the gale hawk climbs: into a wind-hover (`hover` m), its eyes on its prey's spot (followed until `lock`,
    // windup()), or up into the air to beat up a storm
    startWindup(game, m, name, t, { tx: t.x, tz: t.z });
    m.altTo = atk.hover;
    return;
  }
  if (kind === 'storm_feathers') {
    // the gale hawk shakes storm-charged feathers loose over its prey: `count` marks in a zigzag across the line from
    // it to its prey, through where its prey stands, `span` m long (`zig` m either side, seeded); they settle as the
    // wind-up ends and the lightning fence between neighbours crackles after `charge` s, `pulses` times `every` s
    // apart, hurting units within `width`/2 of a strand once a pulse (core area fence)
    startWindup(game, m, name, t);
    m.altTo = atk.hover;
    const a = angleTo(m.x, m.z, t.x, t.z), d = dirFromAngle(a), px = d.z, pz = -d.x, pts = [];
    for (let i = 0; i < atk.count; i++) {
      const u = (i / (atk.count - 1) - 0.5) * atk.span, zig = (i % 2 ? 1 : -1) * atk.zig + game.rng.range(-0.25, 0.25);
      pts.push([t.x + px * u + d.x * zig, t.z + pz * u + d.z * zig]);
    }
    m.windup.pts = pts;
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'storm_fence', x: t.x, z: t.z, radius: atk.span / 2, delay: m.windup.total + atk.charge, duration: atk.every * (atk.pulses - 1) + 0.05, damage: m.damage * (atk.damageMult || 1), fence: { pts, width: atk.width, every: atk.every, pulses: atk.pulses, n: 0 } });
    return;
  }
  if (kind === 'marsh_gas') {
    // marsh gas welling up along a line from it to its prey and `past` m on: a spot every `spacing` m (wobbling a
    // little either side, seeded), each marked by its bubbles and catching fire `step` s after the one before
    startWindup(game, m, name, t);
    const a = angleTo(m.x, m.z, t.x, t.z), d = dirFromAngle(a), total = Math.min(atk.count * atk.spacing, dist(m.x, m.z, t.x, t.z) + atk.past), spots = [], once = new Set(); // (each unit caught by the run once)
    for (let s = 1.5, i = 0; s <= total + 1e-6 && i < atk.count; s += atk.spacing, i++) {
      const side = (i % 2 ? 1 : -1) * game.rng.range(0.1, 0.45), x = m.x + d.x * s + d.z * side, z = m.z + d.z * s - d.x * side;
      if (game.isSafe(x, z)) continue;
      spots.push([x, z]);
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'marsh_gas', x, z, radius: atk.radius, delay: m.windup.total + i * atk.step, duration: 0.3, damage: m.damage * (atk.damageMult || 1), once });
    }
    m.windup.spots = spots;
    return;
  }
  if (kind === 'bog_lure') {
    // the bog it lures toward: `poolDist` m from its prey toward the wisp (pulled in where blocked or safe), marked
    // now, a pool of burning marsh water from the end of the wind-up for `linger` s
    const a = angleTo(t.x, t.z, m.x, m.z);
    let tx = t.x, tz = t.z;
    for (const f of [1, 0.75, 0.5, 0.25]) {
      const x = t.x + Math.sin(a) * atk.poolDist * f, z = t.z + Math.cos(a) * atk.poolDist * f;
      if (game.world.isFree(x, z, 0.5) && !game.isSafe(x, z)) { tx = x; tz = z; break; }
    }
    startWindup(game, m, name, t, { tx, tz });
    if (!game.isSafe(tx, tz)) game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'bog_pool', x: tx, z: tz, radius: atk.radius, delay: m.windup.total, duration: atk.linger, tick: atk.tick, damage: m.damage * atk.poolMult * atk.tick });
    return;
  }
  if (kind === 'phantom_rush') {
    // three runs through where its prey stands now: two moon-shadow wolves from `ring` m out, a third of the circle
    // either side of Greyfang, and Greyfang itself from where it stands, last; every lane marked for the whole wind-up
    startWindup(game, m, name, t);
    const a0 = angleTo(t.x, t.z, m.x, m.z), lanes = [];
    for (const off of [(2 * Math.PI) / 3, (-2 * Math.PI) / 3]) {
      const x = t.x + Math.sin(a0 + off) * atk.ring, z = t.z + Math.cos(a0 + off) * atk.ring;
      lanes.push([x, z, angleTo(x, z, t.x, t.z)]);
    }
    lanes.push([m.x, m.z, angleTo(m.x, m.z, t.x, t.z)]);
    Object.assign(m.windup, { lanes, tx: t.x, tz: t.z });
    game.emit({ type: 'phantomMarks', id: m.id, lanes, tx: t.x, tz: t.z, past: atk.past, width: atk.width, gap: atk.gap, delay: m.windup.total });
    return;
  }
  if (kind === 'rally') {
    // the spots its pack will come in at: on a ring `ring` m round its prey, evenly round it (as many as the pack has
    // room for, under `cap` alive), marked for the whole howl
    const n = Math.min((m.enraged ? atk.enragedSummon : atk.summon) || 2, atk.cap - packAlive(game, m)), spots = [];
    const a0 = angleTo(t.x, t.z, m.x, m.z) + Math.PI / n;
    for (let i = 0; i < n; i++) {
      for (const shrink of [1, 0.75, 0.5]) {
        const a = a0 + (i / n) * Math.PI * 2, x = t.x + Math.sin(a) * atk.ring * shrink, z = t.z + Math.cos(a) * atk.ring * shrink;
        if (game.world.isFree(x, z, 0.6) && !game.isSafe(x, z)) { spots.push([x, z]); break; }
      }
    }
    startWindup(game, m, name, t, { spots });
    game.emit({ type: 'rallyMarks', id: m.id, spots, delay: m.windup.total });
    return;
  }
  if (kind === 'shell_shed') {
    // the coral shell bursts round where it stands, marked for the whole wind-up
    startWindup(game, m, name, t, { radius: atk.radius });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'coral_burst', x: m.x, z: m.z, radius: atk.radius, delay: m.windup.total, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    return;
  }
  if (kind === 'pincer') {
    // two lanes crossing at where its prey stands now, from either side across the wolf's line to it, `lane` m out
    startWindup(game, m, name, t);
    const a = angleTo(m.x, m.z, t.x, t.z), lanes = [];
    for (const s of [1, -1]) {
      const off = a + s * (Math.PI / 2 - atk.cross * DEG), x = t.x + Math.sin(off) * atk.lane, z = t.z + Math.cos(off) * atk.lane;
      lanes.push([x, z, angleTo(x, z, t.x, t.z)]);
    }
    m.windup.lanes = lanes; m.windup.tx = t.x; m.windup.tz = t.z;
    return;
  }
  if (kind === 'fairy_ring') {
    // a ring of mushrooms sprouts round where its prey stands now: the band from `inner` to `radius` m goes off as
    // they puff (`grow` s after the wind-up), the middle safe
    startWindup(game, m, name, t);
    if (!game.isSafe(t.x, t.z)) game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'fairy_ring', x: t.x, z: t.z, radius: atk.radius, inner: atk.inner, delay: m.windup.total + atk.grow, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    return;
  }
  if (kind === 'snatch') {
    const side = m.id % 2 ? 1 : -1;
    return startWindup(game, m, name, t, { path: swoopPath(m, t, atk, side), side });
  }
  if (kind === 'shell_drop') {
    // the clam falls where its prey stands now, marked for the wind-up and the climb
    startWindup(game, m, name, t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'shell_drop', x: t.x, z: t.z, radius: atk.radius, delay: m.windup.total + atk.air, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    return;
  }
  if (kind === 'engulf') {
    // the spot it will land on: where its prey stands now, marked for the wind-up and the hop (the mark itself does
    // no harm; the landing does)
    startWindup(game, m, name, t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'engulf', x: t.x, z: t.z, radius: atk.radius, delay: m.windup.total + atk.air, duration: 0.1, damage: 0 });
    return;
  }
  if (kind === 'erupt') {
    // the mole digs toward where the target stands now: the spot is marked for the whole dig and bursts as it surfaces
    startWindup(game, m, name, t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'erupt', x: t.x, z: t.z, radius: atk.radius, delay: m.windup.total, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    return;
  }
  if (kind === 'mirror_decoy') {
    // where it will fly back to: `distance` m straight away from the target (a little to either side if that is not
    // open ground, or half as far); a flyer passes over what blocks the walkers
    const away = angleTo(t.x, t.z, m.x, m.z);
    let tx = m.x, tz = m.z;
    search: for (const d of [atk.distance, atk.distance * 0.5]) for (const off of [0, 0.5, -0.5, 1, -1]) {
      const x = m.x + Math.sin(away + off) * d, z = m.z + Math.cos(away + off) * d;
      if ((m.def.flyer || game.world.isFree(x, z, m.r)) && !game.isSafe(x, z)) { tx = x; tz = z; break search; }
    }
    return startWindup(game, m, name, t, { tx, tz });
  }
  if (kind === 'shard_rain') {
    // glass shards rained on `count` marks round the target, one after another (`step` s apart): the first on the
    // target, the rest scattered `spread` m round it (seeded), never in a safe town
    startWindup(game, m, name, t);
    for (let i = 0; i < atk.count; i++) {
      const ang = i * 2.4 + game.rng.range(-0.4, 0.4), d = i ? atk.spread * (0.6 + 0.4 * game.rng.next()) : 0;
      const x = t.x + Math.sin(ang) * d, z = t.z + Math.cos(ang) * d;
      if (game.isSafe(x, z)) continue;
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'glass_shard', x, z, radius: atk.radius, delay: m.windup.total + i * atk.step, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    }
    return;
  }
  if (kind === 'skip') {
    // a run of hops along the line to the target (the pearl fish's flop): every landing is marked now and
    // hurts as it lands; the run stops short where the ground is blocked
    startWindup(game, m, name, t);
    const d = dirFromAngle(m.windup.angle), hops = [];
    for (let i = 1; i <= atk.hops; i++) {
      const x = m.x + d.x * atk.hop * i, z = m.z + d.z * atk.hop * i;
      if (!game.world.isFree(x, z, m.r * 0.6) || game.isSafe(x, z)) break;
      hops.push([x, z]);
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: atk.areaKind || 'pounce', x, z, radius: atk.radius, delay: m.windup.total + i * atk.air + (i - 1) * atk.pause, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    }
    m.windup.hops = hops;
    return;
  }
  startWindup(game, m, name, t);
}

/**
 * The reed viper's strike along `angle`: it shoots forward up to `lunge` m (stopping at what it bites), its fangs
 * catching the first unit in the lane `range` x `width` (event viperStrike {x0, z0} where it struck from).
 */
function viperStrike(game, m, name, angle, range, dmg) {
  const atk = m.def.attacks[name], dir = dirFromAngle(angle), half = atk.width / 2;
  let best = null, bestAlong = Infinity;
  for (const u of game.units()) {
    const dx = u.x - m.x, dz = u.z - m.z, along = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x);
    if (along >= 0 && along <= range + u.r && side <= half + u.r && along < bestAlong) { best = u; bestAlong = along; }
  }
  const x0 = m.x, z0 = m.z, go = best ? Math.max(0, Math.min(atk.lunge, bestAlong - m.r - best.r)) : atk.lunge;
  m.facing = angle;
  if (go > 0) game.moveEntity(m, dir.x * go, dir.z * go);
  m.strikeFrom = [x0, z0]; m.strikeAt = game.time; // (the view slides the body over the move)
  game.emit({ type: 'viperStrike', id: m.id, name, x0, z0, x: m.x, z: m.z, angle, length: range, width: atk.width, at: best ? [best.x, best.z] : null });
  if (best) game.damageUnit(best, dmg, m, { attack: name });
}

/**
 * A swoop's curve: from where it stands through where its prey stands now, hooking away to `side` (1 or -1): it ends
 * `past` m on beyond its prey, hooked `bow` m off to that side. The control point puts the curve's middle on the prey.
 */
function swoopPath(m, t, atk, side) { // (m: anything with x, z: where it starts)
  const a = angleTo(m.x, m.z, t.x, t.z), px = Math.cos(a) * side, pz = -Math.sin(a) * side;
  const ex = t.x + Math.sin(a) * atk.past + px * atk.bow, ez = t.z + Math.cos(a) * atk.past + pz * atk.bow;
  // B(0.5) = (p0 + 2 p1 + p2) / 4 = the prey
  const p1 = [2 * t.x - (m.x + ex) / 2, 2 * t.z - (m.z + ez) / 2];
  return [[m.x, m.z], p1, [ex, ez]];
}

const BEHAVIORS = { kit, mantis, ram, stalker, sentinel, charger, coastal_melee: coastalMelee, coastal_skirmisher: coastalMelee, shell_spitter: shellSpitter, kiter, pack_wolf: packWolf, greyfang, spore, golem, hawk };
