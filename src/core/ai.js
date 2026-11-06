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
  if (def.flyer) m.alt = approach(m.alt ?? def.hover, m.state === 'act' ? 0.5 : m.state === 'recover' ? 0.9 : def.hover, (m.state === 'act' ? 12 : 3) * dt);

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

function setState(m, state, dur = 0) {
  if (state !== 'stunned') m.exposed = 0; // the eye clam's cracked shell closes again
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
  const angle = t && !atk.keepFacing ? angleTo(m.x, m.z, t.x, t.z) : m.facing;
  m.windup = { name, total: atk.windup * tempo, angle, ...extra };
  m.stealth = false; // every wind-up is shown in full
  m.facing = angle + (atk.backward ? Math.PI : 0); // backward: it turns its back to its aim (the beetle's spray)
  m.moving = false;
  game.emit({ type: 'windup', id: m.id, name, total: m.windup.total, angle, x: m.x, z: m.z, radius: atk.radius, range: atk.range || atk.maxRange });
}

function windup(game, m, dt, t, gap) {
  const w = m.windup;
  const atk = m.def.attacks[w.name];
  // an attack may borrow the mechanics of another (data: attacks.<name>.kind), keeping its own name and look
  const kind = atk.kind || w.name;
  // track the target during the first part of the wind-up, then lock (dodgeable)
  if (t && !atk.keepFacing && m.stateT < w.total * 0.55 && !['slam', 'pound', 'dive', 'throw', 'puff', 'howl', 'venom', 'pounce', 'stomp', 'shards', 'quake', 'erupt', 'shard_rain', 'drum', 'doubles', 'skip', 'engulf', 'snatch', 'shell_drop', 'perch', 'fairy_ring'].includes(kind)) {
    w.angle = angleTo(m.x, m.z, t.x, t.z);
    m.facing = w.angle + (atk.backward ? Math.PI : 0);
  }
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
      // A stationary strike has its own contact time and follow-through. It never
      // uses the charge collision path, and only tests the locked frontal arc once.
      m.melee = { name: w.name, angle: w.angle, damage: dmg, hit: false };
      setState(m, 'act', atk.duration);
      return;
    case 'bite':
    case 'sweep':
    case 'shove': {
      const arc = (atk.arc || 120) * DEG;
      game.emit({ type: 'monsterSwing', id: m.id, name: w.name, angle: w.angle, range: atk.range + m.r, arc: atk.arc || 120, x: m.x, z: m.z });
      for (const u of game.units()) {
        const g = dist(m.x, m.z, u.x, u.z) - m.r - u.r;
        const inArc = Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) <= arc / 2;
        if (inArc && g <= atk.range + 0.4) game.damageUnit(u, dmg, m, { attack: w.name, knock: atk.knock ? { angle: angleTo(m.x, m.z, u.x, u.z), force: atk.knock } : undefined });
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'charge': {
      m.charge = { name: w.name, t: 0, dur: atk.duration, speed: atk.speed, angle: w.angle, hit: new Set(), dmg, left: 0 };
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
    case 'venom':
      // the pool was marked at wind-up start; the venom now flies there
      game.emit({ type: 'lob', id: m.id, kind: 'venom', fromX: m.x, fromZ: m.z, x: w.tx, z: w.tz, duration: atk.flight });
      m.cd.venom = atk.cooldown;
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
      m.swoop = { name: w.name, t: 0, path: w.path, dmg, hit: new Set() };
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
    const sw = m.swoop, atk = m.def.attacks[sw.name], [p0, p1, p2] = sw.path, k = Math.min(1, m.stateT / atk.duration), u1 = 1 - k;
    const x = u1 * u1 * p0[0] + 2 * u1 * k * p1[0] + k * k * p2[0], z = u1 * u1 * p0[1] + 2 * u1 * k * p1[1] + k * k * p2[1];
    m.facing = angleTo(m.x, m.z, x, z) || m.facing;
    m.x = x; m.z = z; m.moving = false;
    for (const u of game.units()) {
      if (sw.hit.has(u.id) || dist(m.x, m.z, u.x, u.z) > atk.reach + u.r) continue;
      sw.hit.add(u.id);
      game.damageUnit(u, sw.dmg, m, { attack: sw.name });
      // only the hero carries gold
      const take = u === game.player ? Math.min(game.ch.gold || 0, atk.steal) : 0;
      if (take > 0) { game.ch.gold -= take; m.loot = (m.loot || 0) + take; }
      game.emit({ type: 'snatch', id: m.id, x: u.x, z: u.z, gold: take });
    }
    if (k >= 1) { m.swoop = null; m.cd[sw.name] = atk.cooldown; return setState(m, 'recover', atk.recover); }
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
        game.damageUnit(u, c.dmg, m, { attack: c.name, knock: { angle: c.angle, force: 4 } });
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
    if (!c.hop && atk?.missStun && !c.hit.size) {
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

function wardenBoss(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (gap <= 1.5 && m.cd.slam <= 0) return startWindup(game, m, 'slam', t, { radius: a.slam.radius });
  if (gap <= a.sweep.range && m.cd.sweep <= 0) return startWindup(game, m, 'sweep', t);
  if (m.cd.quake <= 0 && gap >= a.quake.minRange && gap <= a.quake.maxRange) {
    const q = a.quake;
    startWindup(game, m, 'quake', t);
    // eruptions are marked along the locked line now and go off one after another
    const d = dirFromAngle(m.windup.angle), seg = q.length / q.steps;
    for (let i = 0; i < q.steps; i++) {
      const r = seg * (i + 0.5);
      game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'quake', kind: 'quake', x: m.x + d.x * r, z: m.z + d.z * r, radius: q.width / 2 + seg * 0.25, delay: m.windup.total + i * q.stepDelay, duration: 0.3, damage: m.damage * q.damageMult });
    }
    return;
  }
  // curls into a boulder and rolls along the locked lane: a rock in the way stuns it, and a roll
  // that hits nobody leaves it dizzy (missStun), so stepping aside opens a punish window
  if (a.roll && m.cd.roll <= 0 && gap >= a.roll.minRange && gap <= a.roll.maxRange) return startWindup(game, m, 'roll', t);
  if (m.cd.slam <= 0 && gap <= a.slam.radius - 1) return startWindup(game, m, 'slam', t, { radius: a.slam.radius });
  if (gap > a.sweep.range * 0.7) walkTo(game, m, t.x, t.z, m.def.speed * slowMult * (m.enraged ? 1.25 : 1), dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 5);
  }
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

function viper(game, m, dt, { t, gap, dToT, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.lash.maxRange && m.cd.lash <= 0) return startWindup(game, m, 'lash', t);
  if (m.cd.venom <= 0 && gap >= a.venom.minRange && gap <= a.venom.range) {
    // aim where the target stands now: step out of the marked pool
    startWindup(game, m, 'venom', t, { tx: t.x, tz: t.z });
    const lvl = 1 + (m.level - 1) * 0.15;
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: 'venom', kind: 'venom_pool', x: t.x, z: t.z, radius: a.venom.radius, delay: m.windup.total + a.venom.flight, duration: a.venom.duration, tick: a.venom.tick, damage: a.venom.dps * a.venom.tick * lvl });
    return;
  }
  const [near, far] = m.def.keepDistance;
  strafe(game, m, dt, t, dToT, near, far, m.def.speed * slowMult);
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
  // withdraw (the snail king): at each health share in `at` it pulls into its shell once (the shell's damageTaken),
  // a ring round it marked for the whole time, then bursts out as the ring goes off
  // split (the salt slime): brought under `at` of its health, once, a bud the size of `size` pinches off beside it
  // with `share` of its full health; a bud never splits and gives only gold (a minion)
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
    // behind: only for a target at its back (more than 100 degrees off its facing)
    if (u.behind && Math.abs(angleDiff(m.facing, angleTo(m.x, m.z, t.x, t.z))) < 1.75) continue;
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
  if (circle && soon > 0.6) return strafe(game, m, dt, t, dToT, circle[0], circle[1], def.speed * slowMult);
  if (reach === Infinity) reach = reachAll; // everything is cooling: close to its nearest reach as before
  if (gap > reach * 0.8) walkTo(game, m, t.x, t.z, def.speed * slowMult, dt, def.kit?.turn);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, def.kit?.turn ?? 6);
  }
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
    // the landing spot is where the target stands now, marked for the whole wind-up and the leap
    startWindup(game, m, name, t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: atk.areaKind || 'pounce', x: t.x, z: t.z, radius: atk.radius, delay: m.windup.total + (atk.air ?? 0.35), duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    return;
  }
  if (kind === 'slam' || kind === 'stomp' || kind === 'shards') return startWindup(game, m, name, t, { radius: atk.radius });
  if (kind === 'fairy_ring') {
    // a ring of mushrooms sprouts round where its prey stands now: the band from `inner` to `radius` m goes off as
    // they puff (`grow` s after the wind-up), the middle safe
    startWindup(game, m, name, t);
    if (!game.isSafe(t.x, t.z)) game.spawnArea({ owner: 'monster', sourceId: m.id, attack: name, kind: 'fairy_ring', x: t.x, z: t.z, radius: atk.radius, inner: atk.inner, delay: m.windup.total + atk.grow, duration: 0.3, damage: m.damage * (atk.damageMult || 1) });
    return;
  }
  if (kind === 'snatch') {
    // its swoop: a curve from where it stands through where its prey stands now, hooking away to one side
    const a = angleTo(m.x, m.z, t.x, t.z), side = m.id % 2 ? 1 : -1, px = Math.cos(a) * side, pz = -Math.sin(a) * side;
    // it ends `past` m on beyond its prey, hooked `bow` m off to one side
    const ex = t.x + Math.sin(a) * atk.past + px * atk.bow, ez = t.z + Math.cos(a) * atk.past + pz * atk.bow;
    // the control point puts the curve's middle on the prey: B(0.5) = (p0 + 2 p1 + p2) / 4
    const p1 = [2 * t.x - (m.x + ex) / 2, 2 * t.z - (m.z + ez) / 2];
    return startWindup(game, m, name, t, { path: [[m.x, m.z], p1, [ex, ez]] });
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

const BEHAVIORS = { kit, mantis, viper, ram, stalker, sentinel, charger, coastal_melee: coastalMelee, coastal_skirmisher: coastalMelee, shell_spitter: shellSpitter, kiter, pack_wolf: packWolf, greyfang, spore, golem, hawk, warden_boss: wardenBoss };
