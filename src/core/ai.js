// Monster behaviours. Each monster has a readable pattern with a visible wind-up, so the
// player can learn it and use positioning (a charge that hits a rock stuns, a dive or a
// boulder marks the ground first). Monsters fight the player or the player's summons.
// States: idle, chase, windup, act, recover, retreat, emerge, stunned, shell, return, circle.

import { DEG, angleDiff, angleTo, clamp, dist, dirFromAngle } from './math.js';

export function updateMonster(game, m, dt) {
  const def = m.def;
  const slowMult = (m.statuses.chill ? 1 - m.statuses.chill.slow : 1) * (m.buffs.howl ? 1 + m.buffs.howl.speed : 1);
  const enraged = def.enrageAt && m.hp / m.maxHp <= def.enrageAt;
  if (enraged && !m.enraged) {
    m.enraged = true;
    game.emit({ type: 'enrage', id: m.id, x: m.x, z: m.z });
  }
  const tempo = m.enraged ? 1.25 : 1;
  for (const k in m.cd) m.cd[k] = Math.max(0, m.cd[k] - dt * tempo);
  m.stateT += dt;
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
        setState(m, 'recover', def.retreat.pause);
      }
      return;
    case 'emerge':
    case 'stunned':
      if (m.stateT >= m.stateDur) setState(m, m.aggro ? 'chase' : 'idle');
      return;
    case 'shell':
      if (m.stateT >= m.stateDur) {
        m.shell = false;
        const emerge = def.attacks.shell.emerge;
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
  const p = game.player;
  const units = [];
  if (!p.dead && !game.isSafe(p.x, p.z)) units.push(p);
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
  if (!m.aggro) cur = p.dead || game.isSafe(p.x, p.z) ? best : p;
  m.targetUnit = cur;
  return cur;
}

export function setAggro(game, m, unit = null, force = false) {
  if (m.dead) return;
  if (!m.aggro) {
    game.emit({ type: 'aggro', id: m.id });
    if (m.def.attacks.howl && m.cd.howl <= 0.01 && m.state !== 'windup') m.wantsHowl = true;
  }
  m.aggro = true;
  if (unit && (force || !m.targetUnit)) m.targetUnit = unit;
  if (m.state === 'idle' || m.state === 'return') setState(m, 'chase');
}

export function onMonsterHit(game, m, by = null) {
  setAggro(game, m, by || game.player, !!by);
  if (m.def.behavior === 'stalker') { m.revealT = 2; m.stealth = false; }
  const sh = m.def.attacks.shell;
  if (!sh || m.state === 'shell' || m.state === 'act') return;
  m.recentHits.push(game.time);
  m.recentHits = m.recentHits.filter((t) => game.time - t <= sh.window);
  if (m.recentHits.length >= sh.hitsToTrigger && m.cd.shell <= 0) {
    m.recentHits = [];
    enterShell(game, m);
  }
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
  m.state = state;
  m.stateT = 0;
  m.stateDur = dur;
  if (state !== 'windup' && state !== 'act') m.windup = null;
  if (state === 'return' || state === 'idle') {
    m.melee = null;
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
function walkTo(game, m, x, z, speed, dt) {
  const d = dist(m.x, m.z, x, z);
  if (d < 0.3) {
    m.moving = false;
    return true;
  }
  const a = angleTo(m.x, m.z, x, z);
  turnToward(m, a, dt, 8);
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
  const angle = t ? angleTo(m.x, m.z, t.x, t.z) : m.facing;
  m.windup = { name, total: atk.windup * tempo, angle, ...extra };
  m.stealth = false; // every wind-up is shown in full
  m.facing = angle;
  m.moving = false;
  game.emit({ type: 'windup', id: m.id, name, total: m.windup.total, angle, x: m.x, z: m.z, radius: atk.radius, range: atk.range || atk.maxRange });
}

function windup(game, m, dt, t, gap) {
  const w = m.windup;
  const atk = m.def.attacks[w.name];
  // an attack may borrow the mechanics of another (data: attacks.<name>.kind), keeping its own name and look
  const kind = atk.kind || w.name;
  // track the target during the first part of the wind-up, then lock (dodgeable)
  if (t && m.stateT < w.total * 0.55 && !['slam', 'pound', 'dive', 'throw', 'puff', 'howl', 'venom', 'pounce', 'stomp', 'shards', 'quake', 'erupt'].includes(kind)) {
    w.angle = angleTo(m.x, m.z, t.x, t.z);
    m.facing = w.angle;
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
        if (inArc && g <= atk.range + 0.4) game.damageUnit(u, dmg, m, atk.knock ? { knock: { angle: angleTo(m.x, m.z, u.x, u.z), force: atk.knock } } : undefined);
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'charge': {
      m.charge = { t: 0, dur: atk.duration, speed: atk.speed, angle: w.angle, hit: new Set(), dmg, left: 0 };
      m.cd[w.name] = atk.cooldown;
      setState(m, 'act');
      m.windup = { ...w };
      game.emit({ type: 'charge', id: m.id, angle: w.angle });
      return;
    }
    case 'spit':
    case 'salt_spit':
    case 'orb': {
      const a = w.name === 'salt_spit' ? w.angle : t ? angleTo(m.x, m.z, t.x, t.z) : w.angle;
      const dir = dirFromAngle(a);
      game.spawnProjectile({
        owner: 'monster',
        sourceId: m.id,
        kind: w.name,
        x: m.x + dir.x * (m.r + 0.2),
        z: m.z + dir.z * (m.r + 0.2),
        y: m.def.hover ? m.def.hover + 0.1 : 0.7,
        angle: a,
        speed: atk.speed,
        radius: atk.projectileRadius ?? 0.35,
        range: w.name === 'salt_spit' ? atk.range : atk.range + 3,
        element: w.name === 'salt_spit' ? 'salt' : w.name === 'spit' ? 'poison' : 'arcane',
        damage: dmg,
        poison: atk.poisonDps ? { dps: atk.poisonDps * (1 + (m.level - 1) * 0.15), duration: atk.poisonDuration } : null,
      });
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'slam': {
      game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'slam', x: m.x, z: m.z, radius: atk.radius, delay: 0, duration: 0.3, damage: dmg });
      if (m.enraged) game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'shockwave', x: m.x, z: m.z, radius: atk.radius, maxRadius: atk.shockwaveMax, growth: atk.shockwaveSpeed, duration: (atk.shockwaveMax - atk.radius) / atk.shockwaveSpeed, damage: dmg * 0.6 });
      m.cd.slam = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'stomp':
    case 'shards':
      // a ring around the monster, marked on the ground for the whole wind-up
      game.spawnArea({ owner: 'monster', sourceId: m.id, kind: w.name, x: m.x, z: m.z, radius: atk.radius, delay: 0, duration: 0.3, damage: dmg });
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
        if (along >= 0 && along <= atk.range + u.r && side <= half + u.r) game.damageUnit(u, dmg, m);
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
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
      game.spawnArea({ owner: 'monster', sourceId: m.id, kind: atk.areaKind || 'spore_cloud', x: m.x, z: m.z, radius: atk.radius, delay: 0, duration: atk.duration, tick: 0.5, damage: atk.dps * 0.5 * (1 + (m.level - 1) * 0.14) });
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
    case 'pounce':
    case 'dive': {
      m.charge = { t: 0, dur: 0.35, fromX: m.x, fromZ: m.z, toX: w.tx, toZ: w.tz, dive: true, hit: new Set(), dmg: 0 };
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
          if (gap <= atk.range && inArc) game.damageUnit(u, strike.damage, m, h.knock ? { knock: { angle: angleTo(m.x, m.z, u.x, u.z), force: h.knock } } : undefined);
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
        if (gap <= atk.range && inArc) game.damageUnit(u, strike.damage, m);
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
  const c = m.charge;
  if (!c) return setState(m, 'chase');
  c.t += dt;
  if (c.dive) {
    const k = Math.min(1, c.t / c.dur);
    m.x = c.fromX + (c.toX - c.fromX) * k;
    m.z = c.fromZ + (c.toZ - c.fromZ) * k;
    if (k >= 1) {
      const name = m.windup?.name && m.def.attacks[m.windup.name] ? m.windup.name : 'dive', atk = m.def.attacks[name];
      m.charge = null;
      m.cd[name] = atk.cooldown;
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
        game.damageUnit(u, c.dmg, m, { knock: { angle: c.angle, force: 4 } });
      }
    }
  }
  const moved = dist(before.x, before.z, m.x, m.z);
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

function coastalSlime(game, m, dt, args) {
  const spit = m.def.attacks.salt_spit;
  if (args.gap >= spit.minRange && args.gap <= spit.range && m.cd.salt_spit <= 0) return startWindup(game, m, 'salt_spit', args.t);
  return coastalMelee(game, m, dt, args);
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
function strafe(game, m, dt, t, d, near, far, speed) {
  const toT = angleTo(m.x, m.z, t.x, t.z);
  let moveA;
  if (d < near) moveA = toT + Math.PI;
  else if (d > far) moveA = toT;
  else moveA = toT + (m.id % 2 ? 1 : -1) * Math.PI * 0.5;
  const s = speed * (d >= near && d <= far ? 0.4 : 1);
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
    game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'pound', x, z, radius: a.pound.radius, delay: m.windup.total, duration: 0.3, damage: m.damage * a.pound.damageMult });
    return;
  }
  if (m.cd.throw <= 0 && gap >= a.throw.minRange && gap <= a.throw.range) {
    // aim where the target stands now: walk out of the marked circle
    startWindup(game, m, 'throw', t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'rock', x: t.x, z: t.z, radius: a.throw.radius, delay: m.windup.total + a.throw.flight, duration: 0.3, damage: m.damage * a.throw.damageMult });
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
    game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'dive', x: t.x, z: t.z, radius: a.dive.radius, delay: m.windup.total + 0.35, duration: 0.3, damage: m.damage * a.dive.damageMult });
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
      game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'quake', x: m.x + d.x * r, z: m.z + d.z * r, radius: q.width / 2 + seg * 0.25, delay: m.windup.total + i * q.stepDelay, duration: 0.3, damage: m.damage * q.damageMult });
    }
    return;
  }
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
    game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'venom_pool', x: t.x, z: t.z, radius: a.venom.radius, delay: m.windup.total + a.venom.flight, duration: a.venom.duration, tick: a.venom.tick, damage: a.venom.dps * a.venom.tick * lvl });
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
    game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'pounce', x: t.x, z: t.z, radius: a.pounce.radius, delay: m.windup.total + 0.35, duration: 0.3, damage: m.damage * a.pounce.damageMult });
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

/** Fern-ear Hare: bounds around the target, leaps onto a marked spot, kicks up close and springs back. */
function hare(game, m, dt, { t, gap, dToT, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.kick.range && m.cd.kick <= 0) return startWindup(game, m, 'kick', t);
  if (m.cd.hop <= 0 && gap >= a.hop.minRange && gap <= a.hop.range) {
    startWindup(game, m, 'hop', t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'pounce', x: t.x, z: t.z, radius: a.hop.radius, delay: m.windup.total + 0.35, duration: 0.3, damage: m.damage * a.hop.damageMult });
    return;
  }
  const [near, far] = m.def.circle;
  if (m.cd.kick > 0.6 && m.cd.hop > 0.8) return strafe(game, m, dt, t, dToT, near, far, m.def.speed * slowMult);
  walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
}

/** Mirrorwing Moth: hovers at range, flashes a mirror glint along a line, sheds stinging scale dust up close. */
function moth(game, m, dt, { t, gap, dToT, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.scale_dust.range && m.cd.scale_dust <= 0) return startWindup(game, m, 'scale_dust', t);
  if (m.cd.glint <= 0 && dToT <= a.glint.maxRange) return startWindup(game, m, 'glint', t);
  const [near, far] = m.def.keepDistance;
  strafe(game, m, dt, t, dToT, near, far, m.def.speed * slowMult);
}

/** Rootdigger Mole: claws up close; from range it digs under and bursts out of a marked spot. */
function mole(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (gap <= a.swipe.range && m.cd.swipe <= 0) return startWindup(game, m, 'swipe', t);
  if (m.cd.erupt <= 0 && gap >= a.erupt.minRange && gap <= a.erupt.range && !game.isSafe(t.x, t.z)) {
    startWindup(game, m, 'erupt', t, { tx: t.x, tz: t.z });
    game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'erupt', x: t.x, z: t.z, radius: a.erupt.radius, delay: m.windup.total, duration: 0.3, damage: m.damage * a.erupt.damageMult });
    return;
  }
  if (gap > a.swipe.range * 0.8) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 4);
  }
}

const BEHAVIORS = { hare, moth, mole, mantis, viper, ram, stalker, sentinel, charger, coastal_melee: coastalMelee, coastal_slime: coastalSlime, coastal_skirmisher: coastalMelee, shell_spitter: shellSpitter, kiter, pack_wolf: packWolf, greyfang, spore, golem, hawk, warden_boss: wardenBoss };
