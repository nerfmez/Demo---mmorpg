// Monster behaviours. Each monster has a readable pattern with a visible wind-up,
// so the player can learn it and use positioning (e.g. a charge that hits a rock stuns).
// States: idle, chase, windup, act, recover, shell, return.

import { DEG, angleDiff, angleTo, clamp, dist, dirFromAngle } from './math.js';

export function updateMonster(game, m, dt) {
  const p = game.player;
  const def = m.def;
  const slowMult = m.statuses.chill ? 1 - m.statuses.chill.slow : 1;
  const enraged = def.enrageAt && m.hp / m.maxHp <= def.enrageAt;
  if (enraged && !m.enraged) {
    m.enraged = true;
    game.emit({ type: 'enrage', id: m.id, x: m.x, z: m.z });
  }
  const tempo = m.enraged ? 1.25 : 1;
  for (const k in m.cd) m.cd[k] = Math.max(0, m.cd[k] - dt * tempo);
  m.stateT += dt;

  const playerValid = !p.dead && !game.isSafe(p.x, p.z);
  const dToPlayer = dist(m.x, m.z, p.x, p.z);
  const gap = dToPlayer - m.r - p.r;
  const dHome = dist(m.x, m.z, m.homeX, m.homeZ);

  // aggro / leash
  if (!m.aggro && playerValid && m.state !== 'return' && dToPlayer < def.aggroRange) setAggro(game, m);
  if (m.aggro && (!playerValid || dHome > def.leashRange) && !['act', 'windup'].includes(m.state)) {
    m.aggro = false;
    setState(m, 'return');
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
      return windup(game, m, dt, gap, tempo);
    case 'act':
      return act(game, m, dt);
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
    case 'chase':
    default:
      if (!m.aggro) return setState(m, 'idle');
      return BEHAVIORS[def.behavior](game, m, dt, { gap, dToPlayer, slowMult, tempo });
  }
}

export function setAggro(game, m) {
  if (m.dead) return;
  if (!m.aggro) game.emit({ type: 'aggro', id: m.id });
  m.aggro = true;
  if (m.state === 'idle' || m.state === 'return') setState(m, 'chase');
}

export function onMonsterHit(game, m) {
  setAggro(game, m);
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
  game.moveEntity(m, Math.sin(a) * step, Math.cos(a) * step);
  m.moving = true;
  return false;
}

function turnToward(m, a, dt, rate) {
  const d = angleDiff(m.facing, a);
  m.facing += clamp(d, -rate * dt, rate * dt);
}

function startWindup(game, m, name, extra = {}) {
  const atk = m.def.attacks[name];
  const p = game.player;
  const tempo = m.enraged ? 0.85 : 1;
  setState(m, 'windup');
  m.windup = { name, total: atk.windup * tempo, angle: angleTo(m.x, m.z, p.x, p.z), ...extra };
  m.facing = m.windup.angle;
  m.moving = false;
  game.emit({ type: 'windup', id: m.id, name, total: m.windup.total, angle: m.windup.angle, x: m.x, z: m.z, radius: atk.radius, range: atk.range || atk.maxRange });
}

function windup(game, m, dt, gap) {
  const w = m.windup;
  const p = game.player;
  const atk = m.def.attacks[w.name];
  // track the player during the first part of the wind-up, then lock (dodgeable)
  if (m.stateT < w.total * 0.55 && !['slam'].includes(w.name)) {
    w.angle = angleTo(m.x, m.z, p.x, p.z);
    m.facing = w.angle;
  }
  if (m.stateT < w.total) return;
  const dmg = m.damage * atk.damageMult;
  switch (w.name) {
    case 'bite':
    case 'sweep': {
      const arc = (atk.arc || 120) * DEG;
      const inArc = Math.abs(angleDiff(w.angle, angleTo(m.x, m.z, p.x, p.z))) <= arc / 2;
      game.emit({ type: 'monsterSwing', id: m.id, name: w.name, angle: w.angle, range: atk.range + m.r, arc: atk.arc || 120, x: m.x, z: m.z });
      if (inArc && gap <= atk.range + 0.4) game.damagePlayer(dmg, m);
      m.cd[w.name] = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    case 'charge':
    case 'gore': {
      m.charge = { t: 0, dur: atk.duration, speed: atk.speed, angle: w.angle, hit: false, dmg };
      m.cd[w.name] = atk.cooldown;
      setState(m, 'act');
      m.windup = { ...w };
      game.emit({ type: 'charge', id: m.id, angle: w.angle });
      return;
    }
    case 'spit':
    case 'orb': {
      const a = angleTo(m.x, m.z, p.x, p.z);
      const dir = dirFromAngle(a);
      game.spawnProjectile({
        owner: 'monster',
        sourceId: m.id,
        kind: w.name,
        x: m.x + dir.x * (m.r + 0.2),
        z: m.z + dir.z * (m.r + 0.2),
        y: m.def.hover ? m.def.hover : 0.7,
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
      if (m.enraged) {
        game.spawnArea({ owner: 'monster', sourceId: m.id, kind: 'shockwave', x: m.x, z: m.z, radius: atk.radius, maxRadius: atk.shockwaveMax, growth: atk.shockwaveSpeed, duration: (atk.shockwaveMax - atk.radius) / atk.shockwaveSpeed, damage: dmg * 0.6 });
      }
      m.cd.slam = atk.cooldown;
      return setState(m, 'recover', atk.recover);
    }
    default:
      return setState(m, 'chase');
  }
}

function act(game, m, dt) {
  const c = m.charge;
  if (!c) return setState(m, 'chase');
  c.t += dt;
  const dir = dirFromAngle(c.angle);
  const before = { x: m.x, z: m.z };
  const res = game.moveEntity(m, dir.x * c.speed * dt, dir.z * c.speed * dt, { stopOnBlock: true });
  const p = game.player;
  if (!c.hit && dist(m.x, m.z, p.x, p.z) < m.r + p.r + 0.35) {
    c.hit = true;
    game.damagePlayer(c.dmg, m, { knock: { angle: c.angle, force: 4 } });
  }
  const moved = dist(before.x, before.z, m.x, m.z);
  if (res && res.blockedHard && moved < c.speed * dt * 0.4 && c.t > 0.08) {
    // ran into a rock, tree or pillar: stunned. Positioning matters.
    m.charge = null;
    game.emit({ type: 'stunned', id: m.id, x: m.x, z: m.z });
    return setState(m, 'stunned', m.def.boss ? 2.2 : 1.6);
  }
  if (c.t >= c.dur) {
    m.charge = null;
    const atk = m.def.attacks[m.windup?.name || 'charge'];
    setState(m, 'recover', atk ? atk.recover : 0.8);
  }
}

// ---------- behaviours ----------

function charger(game, m, dt, { gap, slowMult }) {
  const a = m.def.attacks;
  const p = game.player;
  if (gap <= a.bite.range && m.cd.bite <= 0) return startWindup(game, m, 'bite');
  if (m.cd.charge <= 0 && gap >= a.charge.minRange && gap <= a.charge.maxRange) return startWindup(game, m, 'charge');
  if (gap > a.bite.range * 0.8) walkTo(game, m, p.x, p.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, p.x, p.z), dt, 6);
  }
}

function shellSpitter(game, m, dt, { gap, slowMult }) {
  const a = m.def.attacks;
  const p = game.player;
  if (gap <= a.spit.range && m.cd.spit <= 0) return startWindup(game, m, 'spit');
  if (gap > a.spit.range * 0.75) walkTo(game, m, p.x, p.z, m.def.speed * slowMult, dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, p.x, p.z), dt, 4);
  }
}

function kiter(game, m, dt, { dToPlayer, slowMult }) {
  const a = m.def.attacks;
  const p = game.player;
  const [near, far] = m.def.keepDistance;
  if (dToPlayer < a.blink.triggerRange && m.cd.blink <= 0) {
    m.cd.blink = a.blink.cooldown;
    const away = angleTo(p.x, p.z, m.x, m.z);
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
  if (dToPlayer <= a.orb.range && m.cd.orb <= 0) return startWindup(game, m, 'orb');
  const toP = angleTo(m.x, m.z, p.x, p.z);
  let moveA = null;
  if (dToPlayer < near) moveA = toP + Math.PI;
  else if (dToPlayer > far) moveA = toP;
  else moveA = toP + (m.id % 2 ? 1 : -1) * Math.PI * 0.5; // slow strafe
  const speed = m.def.speed * slowMult * (dToPlayer >= near && dToPlayer <= far ? 0.35 : 1);
  const dir = dirFromAngle(moveA);
  game.moveEntity(m, dir.x * speed * dt, dir.z * speed * dt);
  turnToward(m, toP, dt, 6);
  m.moving = true;
}

function wardenBoss(game, m, dt, { gap, slowMult }) {
  const a = m.def.attacks;
  const p = game.player;
  if (gap <= 1.5 && m.cd.slam <= 0) return startWindup(game, m, 'slam', { radius: a.slam.radius });
  if (gap <= a.sweep.range && m.cd.sweep <= 0) return startWindup(game, m, 'sweep');
  if (m.cd.gore <= 0 && gap >= a.gore.minRange && gap <= a.gore.maxRange) return startWindup(game, m, 'gore');
  if (m.cd.slam <= 0 && gap <= a.slam.radius - 1) return startWindup(game, m, 'slam', { radius: a.slam.radius });
  if (gap > a.sweep.range * 0.7) walkTo(game, m, p.x, p.z, m.def.speed * slowMult * (m.enraged ? 1.25 : 1), dt);
  else {
    m.moving = false;
    turnToward(m, angleTo(m.x, m.z, p.x, p.z), dt, 5);
  }
}

const BEHAVIORS = { charger, shell_spitter: shellSpitter, kiter, warden_boss: wardenBoss };
