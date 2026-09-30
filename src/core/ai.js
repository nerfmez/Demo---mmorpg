// Monster behaviours. Each monster has a readable pattern with a visible wind-up, so the
// player can learn it and use positioning (a charge that hits a rock stuns, a dive or a
// boulder marks the ground first). Monsters fight the player or the player's summons.
// States: idle, chase, windup, act, recover, stunned, shell, return, circle.

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
    case 'stunned':
      if (m.stateT >= m.stateDur) setState(m, m.aggro ? 'chase' : 'idle');
      return;
    case 'shell':
      if (m.stateT >= m.stateDur) {
        m.shell = false;
        setState(m, 'chase');
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
  const sh = m.def.attacks.shell;
  if (!sh || m.state === 'shell' || m.state === 'act') return;
  m.recentHits.push(game.time);
  m.recentHits = m.recentHits.filter((t) => game.time - t <= sh.window);
  if (m.recentHits.length >= sh.hitsToTrigger && m.cd.shell <= 0) {
    m.recentHits = [];
    m.cd.shell = sh.cooldown;
    m.shell = true;
    m.windup = null;
    setState(m, 'shell', sh.duration);
    game.emit({ type: 'shell', id: m.id });
  }
}

function setState(m, state, dur = 0) {
  m.state = state;
  m.stateT = 0;
  m.stateDur = dur;
  if (state !== 'windup' && state !== 'act') m.windup = null;
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
  m.facing = angle;
  m.moving = false;
  game.emit({ type: 'windup', id: m.id, name, total: m.windup.total, angle, x: m.x, z: m.z, radius: atk.radius, range: atk.range || atk.maxRange });
}

function windup(game, m, dt, t, gap) {
  const w = m.windup;
  const atk = m.def.attacks[w.name];
  // track the target during the first part of the wind-up, then lock (dodgeable)
  if (t && m.stateT < w.total * 0.55 && !['slam', 'pound', 'dive', 'throw', 'puff', 'howl'].includes(w.name)) {
    w.angle = angleTo(m.x, m.z, t.x, t.z);
    m.facing = w.angle;
  }
  if (m.stateT < w.total) return;
  const dmg = m.damage * (atk.damageMult || 1);
  switch (w.name) {
    case 'bite':
    case 'sweep': {
      const arc = (atk.arc || 120) * DEG;
      game.emit({ type: 'monsterSwing', id: m.id, name: w.name, angle: w.angle, range: atk.range + m.r, arc: atk.arc || 120, x: m.x, z: m.z });
      for (const u of game.units()) {
        const g = dist(m.x, m.z, u.x, u.z) - m.r - u.r;
        const inArc = Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, u.x, u.z))) <= arc / 2;
        if (inArc && g <= atk.range + 0.4) game.damageUnit(u, dmg, m);
      }
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'charge':
    case 'gore':
    case 'lunge':
    case 'triple': {
      m.charge = { t: 0, dur: atk.duration, speed: atk.speed, angle: w.angle, hit: new Set(), dmg, left: w.left ?? (atk.count ? atk.count - 1 : 0) };
      if (w.name !== 'triple' || m.charge.left === (atk.count || 1) - 1) m.cd[w.name] = atk.cooldown;
      setState(m, 'act');
      m.windup = { ...w };
      game.emit({ type: 'charge', id: m.id, angle: w.angle });
      return;
    }
    case 'spit':
    case 'orb': {
      const a = t ? angleTo(m.x, m.z, t.x, t.z) : w.angle;
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
        radius: 0.35,
        range: atk.range + 3,
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
      game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'spore_cloud', x: m.x, z: m.z, radius: atk.radius, delay: 0, duration: atk.duration, tick: 0.5, damage: atk.dps * 0.5 * (1 + (m.level - 1) * 0.14) });
      m.cd.puff = atk.cooldown;
      // hop away from the cloud
      const hop = m.def.attacks.hop;
      const away = t ? angleTo(t.x, t.z, m.x, m.z) : m.facing + Math.PI;
      m.charge = { t: 0, dur: hop.duration, speed: hop.distance / hop.duration, angle: away + game.rng.range(-0.6, 0.6), hit: new Set(), dmg: 0, hop: true };
      setState(m, 'act');
      m.windup = { ...w };
      return;
    }
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
  const c = m.charge;
  if (!c) return setState(m, 'chase');
  c.t += dt;
  if (c.dive) {
    const k = Math.min(1, c.t / c.dur);
    m.x = c.fromX + (c.toX - c.fromX) * k;
    m.z = c.fromZ + (c.toZ - c.fromZ) * k;
    if (k >= 1) {
      m.charge = null;
      m.cd.dive = m.def.attacks.dive.cooldown;
      setState(m, 'recover', m.def.attacks.dive.recover);
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
    if (c.left > 0 && t) {
      // Greyfang: lunge again right away
      startWindup(game, m, name, t, { left: c.left - 1 });
      m.windup.total = 0.35;
      return;
    }
    const atk = m.def.attacks[name];
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
  const bite = m.def.attacks.bite;
  if (gap <= bite.range && m.cd.bite <= 0) return startWindup(game, m, 'bite', t);
  if (gap > bite.range * .75) walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
  else { m.moving = false; turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 4); }
}

function coastalHopper(game, m, dt, args) {
  const leap = m.def.attacks.lunge;
  if (args.gap >= leap.minRange && args.gap <= leap.maxRange && m.cd.lunge <= 0) return startWindup(game, m, 'lunge', args.t);
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
  if (gap <= a.bite.range && m.cd.bite <= 0) return startWindup(game, m, 'bite', t);
  if (m.cd.lunge <= 0 && gap >= a.lunge.minRange && gap <= a.lunge.maxRange) return startWindup(game, m, 'lunge', t);
  const [near, far] = m.def.circle;
  if (m.cd.lunge > 1.2 && m.cd.bite > 0.3) return strafe(game, m, dt, t, dToT, near, far, m.def.speed * slowMult); // circle, wait for an opening
  walkTo(game, m, t.x, t.z, m.def.speed * slowMult, dt);
}

function greyfang(game, m, dt, { t, gap, slowMult }) {
  const a = m.def.attacks;
  if (a.howl && m.cd.howl <= 0 && m.hp < m.maxHp * 0.85) return startWindup(game, m, 'howl', t);
  if (gap <= a.bite.range && m.cd.bite <= 0) return startWindup(game, m, 'bite', t);
  if (m.cd.triple <= 0 && gap >= a.triple.minRange && gap <= a.triple.maxRange) return startWindup(game, m, 'triple', t, { left: (a.triple.count || 3) - 1 });
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
  if (m.cd.gore <= 0 && gap >= a.gore.minRange && gap <= a.gore.maxRange) return startWindup(game, m, 'gore', t);
  if (m.cd.slam <= 0 && gap <= a.slam.radius - 1) return startWindup(game, m, 'slam', t, { radius: a.slam.radius });
  if (gap > a.sweep.range * 0.7) walkTo(game, m, t.x, t.z, m.def.speed * slowMult * (m.enraged ? 1.25 : 1), dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, t.x, t.z), dt, 5);
  }
}

const BEHAVIORS = { charger, coastal_melee: coastalMelee, coastal_hopper: coastalHopper, shell_spitter: shellSpitter, kiter, pack_wolf: packWolf, greyfang, spore, golem, hawk, warden_boss: wardenBoss };
