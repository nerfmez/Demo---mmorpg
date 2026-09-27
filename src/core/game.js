// The game simulation. Pure logic: no Three.js, no DOM. The renderer and UI read
// game state and drain game.events each frame. Godot port: this becomes the scene
// scripts (player, monster, projectile, area) plus an autoload for the character.

import { createWorld } from './world.js';
import { createRng } from './rng.js';
import { DEG, angleDiff, angleTo, dist, dirFromAngle, clamp } from './math.js';
import { createCharacter, derive, addExp } from './character.js';
import { computeSkill, movementSkill } from './skills.js';
import { rollDrops, addItem } from './crafting.js';
import { softTarget } from './targeting.js';
import { updateMonster, onMonsterHit, setAggro } from './ai.js';

const PLAYER_RADIUS = 0.45;
const PICKUP_RADIUS = 1.4;
const MAGNET_RADIUS = 3.2;
const INTERACT_RADIUS = 3.6;

export class Game {
  constructor(data, { seed = 12345, character = null } = {}) {
    this.data = data;
    this.world = createWorld(data.world);
    this.rng = createRng(seed);
    this.time = 0;
    this.events = [];
    this.nextId = 1;
    this.ch = character || createCharacter(data);
    this.monsters = [];
    this.projectiles = [];
    this.areas = [];
    this.drops = [];
    this.spawnPoints = [];
    this.input = { moveX: 0, moveZ: 0, aimAngle: 0, aimPoint: null, aimFromPointer: false };
    this.stats = { kills: 0, damageDealt: 0 };

    const [sx, sz] = data.world.playerSpawn;
    this.player = {
      id: this.nextId++,
      kind: 'player',
      team: 'player',
      x: sx,
      z: sz,
      r: PLAYER_RADIUS,
      facing: Math.PI / 2,
      hp: 1,
      mp: 1,
      barrier: 0,
      barrierT: 0,
      reflect: 0,
      statuses: {},
      cooldowns: [0, 0, 0, 0],
      triggerCd: [0, 0, 0, 0],
      movement: { charges: 0, rechargeT: 0 },
      dash: null,
      cast: null,
      queued: null,
      targetId: null,
      dead: false,
      respawnT: 0,
      moving: false,
      hurtT: 0,
    };
    this.refresh(true);
    this.player.movement.charges = this.move.charges;
    this.spawnMonsters();
  }

  // ---------- helpers ----------

  emit(e) {
    e.t = this.time;
    this.events.push(e);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  newId() {
    return this.nextId++;
  }

  zoneAt(x) {
    return this.world.zoneAt(x);
  }

  isSafe(x, z) {
    return !!this.world.zoneAt(x).safe;
  }

  monsterById(id) {
    return this.monsters.find((m) => m.id === id) || null;
  }

  get target() {
    return this.player.targetId ? this.monsterById(this.player.targetId) : null;
  }

  /** Re-derive stats after any character change (level, gear, skills, job tree). */
  refresh(full = false) {
    const p = this.player;
    const oldMax = { hp: p.maxHp || 1, mp: p.maxMp || 1 };
    this.derived = derive(this.ch, this.data);
    this.skills = this.ch.slots.map((_, i) => computeSkill(this.ch, this.data, this.derived, i));
    this.move = movementSkill(this.ch, this.data, this.derived);
    p.maxHp = this.derived.maxHp;
    p.maxMp = this.derived.maxMp;
    if (full) {
      p.hp = p.maxHp;
      p.mp = p.maxMp;
    } else {
      p.hp = Math.min(p.maxHp, Math.max(1, (p.hp / oldMax.hp) * p.maxHp));
      p.mp = Math.min(p.maxMp, (p.mp / oldMax.mp) * p.maxMp);
    }
    p.movement.charges = Math.min(p.movement.charges, this.move.charges);
    const ranges = this.skills.filter((s) => s && (s.kind === 'melee_arc' || s.kind === 'projectile')).map((s) => s.range);
    const ground = this.skills.filter((s) => s && s.kind === 'ground_area').map((s) => s.range);
    this.acquireRange = ranges.length ? Math.max(...ranges) : ground.length ? Math.max(...ground) : 0;
  }

  /** Move an entity with collision. Monsters stay out of the safe settlement. */
  moveEntity(e, dx, dz, opts = {}) {
    const res = this.world.move(e.x, e.z, e.r, dx, dz, { ignoreWater: e.def?.hover });
    let nx = res.x;
    let nz = res.z;
    if (e.kind === 'monster' && this.isSafe(nx, nz)) {
      nx = e.x;
      nz = e.z;
    }
    const wanted = Math.hypot(dx, dz);
    const got = Math.hypot(nx - e.x, nz - e.z);
    e.x = nx;
    e.z = nz;
    return { blocked: res.blocked, blockedHard: opts.stopOnBlock && res.blocked && got < wanted * 0.5 };
  }

  // ---------- spawning ----------

  spawnMonsters() {
    const w = this.data.world;
    const avoid = [{ x: w.boss.pos[0], z: w.boss.pos[1], r: 18 }];
    for (const s of w.spawns) {
      for (let i = 0; i < s.count; i++) {
        const pt = this.world.randomPointInZone(s.zone, 1, this.rng, avoid);
        const sp = { monster: s.monster, zone: s.zone, level: s.level, x: pt.x, z: pt.z, respawnAt: 0, entity: null, respawn: w.respawnSeconds };
        this.spawnPoints.push(sp);
        this.spawnAt(sp);
      }
    }
    const bossSp = { monster: w.boss.monster, zone: 'ruins', level: [w.boss.level, w.boss.level], x: w.boss.pos[0], z: w.boss.pos[1], respawnAt: 0, entity: null, respawn: w.boss.respawnSeconds, boss: true };
    this.spawnPoints.push(bossSp);
    this.spawnAt(bossSp);
  }

  spawnAt(sp) {
    const def = this.data.monsters.monsters[sp.monster];
    const sc = this.data.progression.monsterScaling;
    const level = this.rng.int(sp.level[0], sp.level[1]);
    const L = level - 1;
    const m = {
      id: this.newId(),
      kind: 'monster',
      team: 'monster',
      type: sp.monster,
      def,
      level,
      x: sp.x,
      z: sp.z,
      homeX: sp.x,
      homeZ: sp.z,
      r: def.radius,
      facing: this.rng.range(0, Math.PI * 2),
      maxHp: Math.round(def.hp * (1 + sc.hpPerLevel * L)),
      damage: def.damage * (1 + sc.damagePerLevel * L),
      defense: def.defense * (1 + sc.defensePerLevel * L),
      exp: Math.round(def.exp * (1 + sc.expPerLevel * L)),
      jobExp: Math.round(def.jobExp * (1 + sc.expPerLevel * L)),
      state: 'idle',
      stateT: 0,
      stateDur: 0,
      cd: Object.fromEntries(Object.keys(def.attacks).map((k) => [k, this.rng.range(0, 1.5)])),
      aggro: false,
      statuses: {},
      recentHits: [],
      shell: false,
      windup: null,
      charge: null,
      dead: false,
      deathT: 0,
      hurtT: 0,
      moving: false,
      spawn: sp,
      boss: !!def.boss,
      zone: sp.zone,
    };
    m.hp = m.maxHp;
    sp.entity = m;
    this.monsters.push(m);
    this.emit({ type: 'spawn', id: m.id });
    return m;
  }

  spawnProjectile(o) {
    const dir = dirFromAngle(o.angle);
    const pr = {
      id: this.newId(),
      y: 1.0,
      pierce: 0,
      chain: 0,
      chainRange: 0,
      hit: new Set(),
      travelled: 0,
      ...o,
      vx: dir.x * o.speed,
      vz: dir.z * o.speed,
    };
    this.projectiles.push(pr);
    this.emit({ type: 'projectile', id: pr.id, kind: pr.kind, owner: pr.owner });
    return pr;
  }

  spawnArea(o) {
    const a = { id: this.newId(), t: 0, delay: 0, fired: false, hit: new Set(), nextTick: 0, ...o };
    this.areas.push(a);
    this.emit({ type: 'area', id: a.id, kind: a.kind, owner: a.owner, x: a.x, z: a.z, radius: a.radius, delay: a.delay, duration: a.duration });
    return a;
  }

  // ---------- input API (called by UI) ----------

  setMove(x, z) {
    const len = Math.hypot(x, z);
    this.input.moveX = len > 1 ? x / len : x;
    this.input.moveZ = len > 1 ? z / len : z;
  }

  /** Aim at a world point (mouse) or with a direction (analog). */
  setAimPoint(x, z) {
    this.input.aimPoint = { x, z };
    this.input.aimFromPointer = true;
    this.input.aimAngle = angleTo(this.player.x, this.player.z, x, z);
  }

  setAimAngle(a) {
    this.input.aimAngle = a;
    this.input.aimPoint = null;
    this.input.aimFromPointer = false;
  }

  /** Cast the skill in a slot. point: optional explicit ground point for area skills. */
  castSlot(i, point = null) {
    const p = this.player;
    if (p.dead) return false;
    if (p.cast || p.dash) {
      p.queued = { slot: i, point, t: 0.35 };
      return false;
    }
    const s = this.skills[i];
    if (!s) return false;
    if (!s.requirementsMet) {
      this.emit({ type: 'fail', reason: 'requires', slot: i });
      return false;
    }
    if (p.cooldowns[i] > 0) return false;
    if (p.mp < s.cost) {
      this.emit({ type: 'fail', reason: 'mp', slot: i });
      return false;
    }
    const aim = this.resolveAim(s, point);
    p.mp -= s.cost;
    p.cooldowns[i] = s.cooldown;
    p.cast = { slot: i, t: 0, total: s.castTime, aim, skill: s };
    p.facing = aim.angle;
    this.emit({ type: 'castStart', slot: i, skill: s.id, kind: s.kind, angle: aim.angle, x: aim.x, z: aim.z, total: s.castTime });
    return true;
  }

  resolveAim(s, point) {
    const p = this.player;
    const t = this.target;
    let angle = this.input.aimFromPointer ? this.input.aimAngle : p.facing;
    if (s.kind === 'melee_arc' || s.kind === 'projectile') {
      if (t && dist(p.x, p.z, t.x, t.z) - t.r <= s.range + 0.5) angle = angleTo(p.x, p.z, t.x, t.z);
      return { angle, x: p.x, z: p.z };
    }
    if (s.kind === 'ground_area' || s.kind === 'heal_zone') {
      let pt = point || (this.input.aimFromPointer ? this.input.aimPoint : null);
      if (!pt) {
        if (s.kind === 'heal_zone') pt = { x: p.x, z: p.z };
        else if (t) pt = { x: t.x, z: t.z };
        else {
          const d = dirFromAngle(angle);
          pt = { x: p.x + d.x * Math.min(5, s.range), z: p.z + d.z * Math.min(5, s.range) };
        }
      }
      const d = dist(p.x, p.z, pt.x, pt.z);
      if (d > s.range) {
        const k = s.range / d;
        pt = { x: p.x + (pt.x - p.x) * k, z: p.z + (pt.z - p.z) * k };
      }
      if (d > 0.3) angle = angleTo(p.x, p.z, pt.x, pt.z);
      return { angle, x: pt.x, z: pt.z };
    }
    return { angle: p.facing, x: p.x, z: p.z };
  }

  useMovement(point = null) {
    const p = this.player;
    if (p.dead || p.dash) return false;
    if (p.movement.charges < 1) return false;
    const mv = this.move;
    p.cast = null;
    p.movement.charges -= 1;
    let angle;
    const moving = Math.hypot(this.input.moveX, this.input.moveZ) > 0.2;
    if (moving) angle = Math.atan2(this.input.moveX, this.input.moveZ);
    else angle = this.input.aimFromPointer ? this.input.aimAngle : p.facing;
    if (mv.kind === 'blink') {
      let dest = point || (this.input.aimFromPointer && !moving ? this.input.aimPoint : null);
      let d = mv.distance;
      if (dest) {
        d = Math.min(mv.distance, dist(p.x, p.z, dest.x, dest.z));
        angle = angleTo(p.x, p.z, dest.x, dest.z);
      }
      const dir = dirFromAngle(angle);
      let nx = p.x;
      let nz = p.z;
      for (let k = d; k >= 0.5; k -= 0.5) {
        const tx = p.x + dir.x * k;
        const tz = p.z + dir.z * k;
        if (this.world.isFree(tx, tz, p.r)) {
          nx = tx;
          nz = tz;
          break;
        }
      }
      this.emit({ type: 'blinkPlayer', fromX: p.x, fromZ: p.z, x: nx, z: nz });
      p.x = nx;
      p.z = nz;
      p.facing = angle;
      p.dash = { t: 0, dur: mv.duration, vx: 0, vz: 0, inv: mv.invulnerable, kind: 'blink' };
    } else {
      const dir = dirFromAngle(angle);
      const speed = mv.distance / mv.duration;
      p.facing = angle;
      p.dash = { t: 0, dur: mv.duration, vx: dir.x * speed, vz: dir.z * speed, inv: mv.invulnerable, kind: mv.id };
    }
    this.emit({ type: 'movement', kind: mv.id, angle });
    return true;
  }

  /** What the player can interact with right now. */
  nearby() {
    const p = this.player;
    const t = this.data.world.town;
    return {
      workbench: dist(p.x, p.z, t.workbench[0], t.workbench[1]) < INTERACT_RADIUS,
      trainer: dist(p.x, p.z, t.trainer[0], t.trainer[1]) < INTERACT_RADIUS,
      inTown: this.isSafe(p.x, p.z),
    };
  }

  // ---------- combat ----------

  rollCrit() {
    return this.rng.chance(this.derived.critChance);
  }

  /** Player-side damage to a monster. */
  hitMonster(m, amount, opts = {}) {
    if (m.dead) return 0;
    let dmg = amount;
    const crit = opts.crit ?? false;
    if (crit) dmg *= this.derived.critMult;
    if (!opts.dot) dmg *= 1 - m.defense / (m.defense + 60);
    if (m.shell) dmg *= m.def.attacks.shell.damageTaken;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.hurtT = 0.18;
    this.stats.damageDealt += dmg;
    this.emit({ type: 'hit', id: m.id, amount: dmg, crit, element: opts.element || 'physical', dot: !!opts.dot, shell: m.shell, x: m.x, z: m.z });
    if (!opts.dot) {
      onMonsterHit(this, m);
      if (opts.chill) m.statuses.chill = { slow: opts.chill.slow, t: opts.chill.duration };
      if (opts.burnChance && this.rng.chance(opts.burnChance)) m.statuses.burn = { dps: amount * 0.15, t: 3, acc: 0 };
      const pc = this.derived.poisonChancePct / 100;
      if (pc > 0 && this.rng.chance(pc)) m.statuses.poison = { dps: amount * 0.12, t: 4, acc: 0 };
    } else setAggro(this, m);
    if (m.hp <= 0) this.killMonster(m);
    return dmg;
  }

  killMonster(m) {
    m.dead = true;
    m.hp = 0;
    m.deathT = 0;
    m.windup = null;
    m.charge = null;
    this.stats.kills++;
    const p = this.player;
    if (p.targetId === m.id) p.targetId = null;
    this.emit({ type: 'death', id: m.id, x: m.x, z: m.z, boss: m.boss });
    const drops = rollDrops(this.data, m.type, m.zone, this.rng);
    drops.forEach((d, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2 + this.rng.range(0, 1);
      const r = this.rng.range(0.6, 1.4);
      const drop = { id: this.newId(), item: d.item, qty: d.qty, x: m.x + Math.sin(a) * r, z: m.z + Math.cos(a) * r, t: 0 };
      this.drops.push(drop);
      this.emit({ type: 'drop', id: drop.id, item: drop.item, fromX: m.x, fromZ: m.z });
    });
    const gained = addExp(this.ch, this.data, m.exp, m.jobExp);
    this.emit({ type: 'exp', exp: m.exp, jobExp: m.jobExp, x: m.x, z: m.z });
    if (gained.levels) {
      this.refresh();
      p.hp = p.maxHp;
      p.mp = p.maxMp;
      this.emit({ type: 'levelup', level: this.ch.level });
    }
    if (gained.jobLevels) this.emit({ type: 'joblevelup', level: this.ch.jobLevel });
    if (m.boss) {
      this.ch.bossKills++;
      this.emit({ type: 'bossDefeated', first: this.ch.bossKills === 1 });
    }
    m.spawn.respawnAt = this.time + m.spawn.respawn;
    m.spawn.entity = null;
  }

  /** Monster-side damage to the player. */
  damagePlayer(amount, source, opts = {}) {
    const p = this.player;
    if (p.dead) return 0;
    if (p.dash && p.dash.inv) {
      this.emit({ type: 'dodge', x: p.x, z: p.z });
      return 0;
    }
    let dmg = amount * (1 - this.derived.defense / (this.derived.defense + 60)) * (1 + this.derived.damageTakenPct / 100);
    dmg = Math.max(1, Math.round(dmg));
    let absorbed = 0;
    if (p.barrier > 0) {
      absorbed = Math.min(p.barrier, dmg);
      p.barrier -= absorbed;
      dmg -= absorbed;
      if (p.reflect > 0 && source && source.kind === 'monster' && !source.dead) {
        this.hitMonster(source, absorbed * p.reflect + 4, { element: 'physical' });
      }
    }
    p.hp -= dmg;
    p.hurtT = 0.25;
    this.emit({ type: 'playerHit', amount: dmg, absorbed, x: p.x, z: p.z });
    if (opts.poison) p.statuses.poison = { dps: opts.poison.dps, t: opts.poison.duration, acc: 0 };
    if (opts.knock && dmg > 0) {
      const d = dirFromAngle(opts.knock.angle);
      this.moveEntity(p, d.x * opts.knock.force * 0.3, d.z * opts.knock.force * 0.3);
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.respawnT = 4;
      p.cast = null;
      p.dash = null;
      p.targetId = null;
      this.emit({ type: 'playerDeath' });
    }
    return dmg;
  }

  healPlayer(amount) {
    const p = this.player;
    if (p.dead) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const got = p.hp - before;
    if (this.derived.healGrantsBarrierPct > 0) {
      const add = (amount * this.derived.healGrantsBarrierPct) / 100;
      p.barrier = Math.min(p.maxHp * 0.5, p.barrier + add);
      p.barrierT = Math.max(p.barrierT, 3);
    }
    if (got > 0.5) this.emit({ type: 'heal', amount: Math.round(got), x: p.x, z: p.z });
  }

  /** Execute a computed skill. mult scales damage (triggers, echoes). */
  executeSkill(s, aim, { mult = 1, triggered = false } = {}) {
    const p = this.player;
    const critRoll = () => this.rollCrit();
    const hitOpts = { element: s.element, chill: s.chill, burnChance: s.burnChance };
    switch (s.kind) {
      case 'melee_arc': {
        const arc = s.arc * DEG;
        let hits = 0;
        for (const m of this.monsters) {
          if (m.dead) continue;
          const d = dist(p.x, p.z, m.x, m.z) - m.r;
          if (d > s.range) continue;
          const off = Math.abs(angleDiff(aim.angle, angleTo(p.x, p.z, m.x, m.z)));
          if (off > arc / 2 && d > 0.3) continue;
          this.hitMonster(m, s.damage * mult, { ...hitOpts, crit: critRoll() });
          hits++;
        }
        if (hits && this.derived.meleeHitBarrier) {
          p.barrier = Math.min(p.maxHp * 0.5, p.barrier + this.derived.meleeHitBarrier * hits);
          p.barrierT = Math.max(p.barrierT, 3);
        }
        this.emit({ type: 'slash', x: p.x, z: p.z, angle: aim.angle, arc: s.arc, range: s.range, element: s.element, triggered });
        if (s.ground) {
          const d = dirFromAngle(aim.angle);
          this.spawnGround(s, p.x + d.x * s.range * 0.6, p.z + d.z * s.range * 0.6, mult);
        }
        return;
      }
      case 'projectile': {
        const n = s.projectiles;
        const step = n > 1 ? (s.spread * DEG) / (n - 1) : 0;
        for (let i = 0; i < n; i++) {
          const a = aim.angle + (i - (n - 1) / 2) * step;
          const d = dirFromAngle(a);
          this.spawnProjectile({
            owner: 'player',
            kind: s.id,
            skill: s,
            x: p.x + d.x * 0.6,
            z: p.z + d.z * 0.6,
            y: 1.05,
            angle: a,
            speed: s.speed,
            radius: s.projectileRadius,
            range: s.range + 2,
            damage: s.damage * mult,
            element: s.element,
            pierce: s.pierce,
            chain: s.chain,
            chainRange: s.chainRange,
            triggered,
          });
        }
        return;
      }
      case 'ground_area': {
        this.spawnArea({ owner: 'player', kind: s.id, skill: s, x: aim.x, z: aim.z, radius: s.radius, delay: s.delay, duration: 0.35, damage: s.damage * mult, element: s.element });
        if (s.echo) this.spawnArea({ owner: 'player', kind: s.id, skill: s, echo: true, x: aim.x, z: aim.z, radius: s.radius, delay: s.delay + s.echo.delay, duration: 0.35, damage: s.damage * mult * s.echo.mult, element: s.element });
        return;
      }
      case 'heal_zone': {
        this.spawnArea({ owner: 'player', kind: s.id, skill: s, x: aim.x, z: aim.z, radius: s.radius, delay: 0, duration: s.duration, tick: s.tick, heal: (s.heal * mult * s.tick) / 1, element: 'none' });
        if (s.echo) this.spawnArea({ owner: 'player', kind: s.id, skill: s, echo: true, x: aim.x, z: aim.z, radius: s.radius, delay: s.echo.delay + s.duration * 0.5, duration: s.duration, tick: s.tick, heal: s.heal * mult * s.tick * s.echo.mult, element: 'none' });
        return;
      }
      case 'self_barrier': {
        p.barrier = Math.max(p.barrier, s.barrier * mult);
        p.barrierT = s.duration;
        p.reflect = s.reflect;
        if (s.tauntRadius) {
          for (const m of this.monsters) if (!m.dead && dist(p.x, p.z, m.x, m.z) < s.tauntRadius) setAggro(this, m);
        }
        this.emit({ type: 'ward', x: p.x, z: p.z, amount: Math.round(p.barrier), reflect: s.reflect > 0, radius: s.radius });
        return;
      }
    }
  }

  spawnGround(s, x, z, mult = 1) {
    if (!s.ground) return;
    this.spawnArea({ owner: 'player', kind: 'burning_ground', x, z, radius: s.ground.radius, delay: 0, duration: s.ground.duration, tick: 0.5, damage: s.damage * mult * s.ground.dpsMult * 0.5, element: 'fire', dot: true });
  }

  // ---------- update ----------

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.updatePlayer(dt);
    for (const m of this.monsters) {
      if (m.dead) {
        m.deathT += dt;
        continue;
      }
      this.tickStatuses(m, dt);
      if (m.dead) continue;
      m.hurtT = Math.max(0, m.hurtT - dt);
      updateMonster(this, m, dt);
    }
    this.separateMonsters();
    this.monsters = this.monsters.filter((m) => !(m.dead && m.deathT > 2.5));
    this.updateProjectiles(dt);
    this.updateAreas(dt);
    this.updateDrops(dt);
    this.updateRespawns();
  }

  updatePlayer(dt) {
    const p = this.player;
    if (p.dead) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        const r = this.data.world.town.respawn;
        p.x = r[0];
        p.z = r[1];
        p.dead = false;
        p.hp = p.maxHp;
        p.mp = p.maxMp;
        p.statuses = {};
        p.barrier = 0;
        this.emit({ type: 'respawn' });
      }
      return;
    }
    p.hurtT = Math.max(0, p.hurtT - dt);
    // regen
    const inTown = this.isSafe(p.x, p.z);
    p.hp = Math.min(p.maxHp, p.hp + (this.derived.hpRegen + (inTown ? p.maxHp * 0.08 : 0)) * dt);
    p.mp = Math.min(p.maxMp, p.mp + (this.derived.mpRegen + (inTown ? p.maxMp * 0.08 : 0)) * dt);
    for (let i = 0; i < p.cooldowns.length; i++) {
      p.cooldowns[i] = Math.max(0, p.cooldowns[i] - dt);
      p.triggerCd[i] = Math.max(0, p.triggerCd[i] - dt);
    }
    if (p.barrierT > 0) {
      p.barrierT -= dt;
      if (p.barrierT <= 0) {
        p.barrier = 0;
        p.reflect = 0;
      }
    }
    // movement charges
    const mv = this.move;
    if (p.movement.charges < mv.charges) {
      p.movement.rechargeT += dt;
      if (p.movement.rechargeT >= mv.recharge) {
        p.movement.rechargeT = 0;
        p.movement.charges++;
      }
    } else p.movement.rechargeT = 0;
    // statuses
    this.tickPlayerStatuses(dt);
    if (p.dead) return;

    // dash
    if (p.dash) {
      p.dash.t += dt;
      if (p.dash.vx || p.dash.vz) this.moveEntity(p, p.dash.vx * dt, p.dash.vz * dt);
      if (p.dash.t >= p.dash.dur) {
        p.dash = null;
        this.fireTriggers('on_movement');
      }
      return;
    }

    // walking
    const mx = this.input.moveX;
    const mz = this.input.moveZ;
    const mlen = Math.hypot(mx, mz);
    const chill = p.statuses.chill ? 1 - p.statuses.chill.slow : 1;
    const speed = this.derived.moveSpeed * (p.cast ? 0.4 : 1) * chill;
    p.moving = mlen > 0.08;
    if (p.moving) {
      this.moveEntity(p, mx * speed * dt, mz * speed * dt);
      if (!p.cast) {
        const a = Math.atan2(mx, mz);
        p.facing += clamp(angleDiff(p.facing, a), -14 * dt, 14 * dt);
      }
    }

    // soft target
    const aimAngle = this.input.aimFromPointer ? this.input.aimAngle : p.moving ? Math.atan2(mx, mz) : p.facing;
    if (!this.input.aimFromPointer && !p.moving) this.input.aimAngle = p.facing;
    const prev = p.targetId;
    p.targetId = softTarget(p, this.monsters, aimAngle, this.acquireRange);
    if (prev !== p.targetId) this.emit({ type: 'target', id: p.targetId });

    // casting
    if (p.cast) {
      p.cast.t += dt;
      p.facing = p.cast.aim.angle;
      if (p.cast.t >= p.cast.total) {
        const c = p.cast;
        p.cast = null;
        this.executeSkill(c.skill, c.aim);
      }
    } else if (p.queued) {
      const q = p.queued;
      p.queued = null;
      if (q.t > 0) this.castSlot(q.slot, q.point);
    }
    if (p.queued) p.queued.t -= dt;
  }

  fireTriggers(on) {
    const p = this.player;
    this.skills.forEach((s, i) => {
      if (!s || !s.trigger || s.trigger.on !== on || p.triggerCd[i] > 0) return;
      p.triggerCd[i] = s.trigger.icd;
      let aim;
      if (s.kind === 'ground_area' || s.kind === 'heal_zone') aim = { angle: p.facing, x: p.x, z: p.z };
      else aim = this.resolveAim(s, null);
      this.emit({ type: 'trigger', slot: i, skill: s.id });
      this.executeSkill(s, aim, { mult: s.trigger.damageMult, triggered: true });
    });
  }

  tickStatuses(m, dt) {
    for (const k of ['burn', 'poison']) {
      const st = m.statuses[k];
      if (!st) continue;
      st.t -= dt;
      st.acc += st.dps * dt;
      if (st.acc >= 3 || (st.t <= 0 && st.acc >= 1)) {
        const n = Math.floor(st.acc);
        st.acc -= n;
        this.hitMonster(m, n, { dot: true, element: k === 'burn' ? 'fire' : 'poison' });
      }
      if (st.t <= 0) delete m.statuses[k];
    }
    if (m.statuses.chill) {
      m.statuses.chill.t -= dt;
      if (m.statuses.chill.t <= 0) delete m.statuses.chill;
    }
  }

  tickPlayerStatuses(dt) {
    const p = this.player;
    const st = p.statuses.poison;
    if (st) {
      st.t -= dt;
      st.acc += st.dps * dt;
      if (st.acc >= 2) {
        const n = Math.floor(st.acc);
        st.acc -= n;
        p.hp -= n;
        this.emit({ type: 'playerHit', amount: n, absorbed: 0, dot: true, x: p.x, z: p.z });
        if (p.hp <= 0) {
          p.hp = 1; // poison alone never kills
        }
      }
      if (st.t <= 0) delete p.statuses.poison;
    }
  }

  separateMonsters() {
    const ms = this.monsters;
    for (let i = 0; i < ms.length; i++) {
      const a = ms[i];
      if (a.dead) continue;
      for (let j = i + 1; j < ms.length; j++) {
        const b = ms[j];
        if (b.dead) continue;
        const d = dist(a.x, a.z, b.x, b.z);
        const min = a.r + b.r;
        if (d < min && d > 1e-3) {
          const push = (min - d) / 2;
          const ux = (b.x - a.x) / d;
          const uz = (b.z - a.z) / d;
          const wa = a.boss ? 0.1 : 1;
          const wb = b.boss ? 0.1 : 1;
          this.moveEntity(a, -ux * push * wa, -uz * push * wa);
          this.moveEntity(b, ux * push * wb, uz * push * wb);
        }
      }
      // keep monsters from standing inside the player
      const p = this.player;
      if (!p.dead) {
        const d = dist(a.x, a.z, p.x, p.z);
        const min = a.r + p.r;
        if (d < min && d > 1e-3 && !a.charge) this.moveEntity(a, ((a.x - p.x) / d) * (min - d), ((a.z - p.z) / d) * (min - d));
      }
    }
  }

  updateProjectiles(dt) {
    const keep = [];
    const p = this.player;
    for (const pr of this.projectiles) {
      const step = pr.speed * dt;
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.travelled += step;
      let dead = pr.travelled >= pr.range;
      // solid obstacles stop projectiles (not water)
      if (!dead && !this.world.isFree(pr.x, pr.z, 0.05, { ignoreWater: true })) {
        dead = true;
        this.projectileImpact(pr);
      }
      if (!dead && pr.owner === 'player') {
        for (const m of this.monsters) {
          if (m.dead || pr.hit.has(m.id)) continue;
          if (dist(pr.x, pr.z, m.x, m.z) > m.r + pr.radius) continue;
          pr.hit.add(m.id);
          const s = pr.skill;
          this.hitMonster(m, pr.damage, { element: pr.element, chill: s.chill, burnChance: s.burnChance, crit: this.rollCrit() });
          this.emit({ type: 'impact', kind: pr.kind, element: pr.element, x: pr.x, z: pr.z });
          if (s.ground) this.spawnGround(s, m.x, m.z, pr.triggered ? s.trigger?.damageMult || 1 : 1);
          if (pr.chain > 0) {
            const next = this.monsters
              .filter((o) => !o.dead && !pr.hit.has(o.id) && dist(o.x, o.z, m.x, m.z) < pr.chainRange)
              .sort((a, b) => dist(a.x, a.z, m.x, m.z) - dist(b.x, b.z, m.x, m.z))[0];
            if (next) {
              pr.chain--;
              const a = angleTo(pr.x, pr.z, next.x, next.z);
              const d = dirFromAngle(a);
              pr.vx = d.x * pr.speed;
              pr.vz = d.z * pr.speed;
              pr.angle = a;
              pr.travelled = Math.max(0, pr.range - pr.chainRange - 1);
              this.emit({ type: 'bounce', id: pr.id });
              break;
            }
          }
          if (pr.pierce > 0) {
            pr.pierce--;
            continue;
          }
          dead = true;
          break;
        }
      } else if (!dead && pr.owner === 'monster' && !p.dead) {
        if (dist(pr.x, pr.z, p.x, p.z) < p.r + pr.radius) {
          const src = this.monsterById(pr.sourceId);
          this.damagePlayer(pr.damage, src, { poison: pr.poison });
          this.emit({ type: 'impact', kind: pr.kind, element: pr.kind === 'spit' ? 'poison' : 'arcane', x: pr.x, z: pr.z });
          dead = true;
        }
      }
      if (dead) this.emit({ type: 'projectileEnd', id: pr.id });
      else keep.push(pr);
    }
    this.projectiles = keep;
  }

  projectileImpact(pr) {
    this.emit({ type: 'impact', kind: pr.kind, element: pr.element || 'arcane', x: pr.x, z: pr.z });
    if (pr.owner === 'player' && pr.skill?.ground) this.spawnGround(pr.skill, pr.x, pr.z);
  }

  updateAreas(dt) {
    const keep = [];
    const p = this.player;
    for (const a of this.areas) {
      a.t += dt;
      if (a.t < a.delay) {
        keep.push(a);
        continue;
      }
      const live = a.t - a.delay;
      if (a.kind === 'shockwave') {
        a.radius = Math.min(a.maxRadius, a.radius + a.growth * dt);
        const d = dist(a.x, a.z, p.x, p.z);
        if (!a.hit.has(p.id) && Math.abs(d - a.radius) < 0.7 && !p.dead) {
          a.hit.add(p.id);
          this.damagePlayer(a.damage, this.monsterById(a.sourceId));
        }
      } else if (a.tick) {
        // persistent: damage or heal every tick
        if (live >= a.nextTick) {
          a.nextTick += a.tick;
          if (a.heal) {
            if (dist(a.x, a.z, p.x, p.z) <= a.radius + p.r) this.healPlayer(a.heal);
          } else if (a.damage) {
            for (const m of this.monsters) if (!m.dead && dist(a.x, a.z, m.x, m.z) <= a.radius + m.r) this.hitMonster(m, a.damage, { dot: true, element: a.element });
          }
        }
      } else if (!a.fired) {
        a.fired = true;
        if (a.owner === 'player') {
          const s = a.skill;
          for (const m of this.monsters) {
            if (m.dead || dist(a.x, a.z, m.x, m.z) > a.radius + m.r) continue;
            this.hitMonster(m, a.damage, { element: a.element, chill: s?.chill, crit: this.rollCrit() });
          }
          this.emit({ type: 'burst', kind: a.kind, element: a.element, echo: !!a.echo, x: a.x, z: a.z, radius: a.radius });
          if (s?.ground) this.spawnGround(s, a.x, a.z, a.echo ? s.echo.mult : 1);
        } else if (a.owner === 'monster') {
          if (!p.dead && dist(a.x, a.z, p.x, p.z) <= a.radius + p.r) this.damagePlayer(a.damage, this.monsterById(a.sourceId));
          this.emit({ type: 'burst', kind: a.kind, element: 'earth', x: a.x, z: a.z, radius: a.radius });
        }
      }
      if (live < (a.duration || 0)) keep.push(a);
      else this.emit({ type: 'areaEnd', id: a.id });
    }
    this.areas = keep;
  }

  updateDrops(dt) {
    const p = this.player;
    const keep = [];
    for (const d of this.drops) {
      d.t += dt;
      if (!p.dead && d.t > 0.45) {
        const dd = dist(p.x, p.z, d.x, d.z);
        if (dd < MAGNET_RADIUS) {
          const k = Math.min(1, (12 * dt) / Math.max(dd, 0.01));
          d.x += (p.x - d.x) * k;
          d.z += (p.z - d.z) * k;
        }
        if (dd < PICKUP_RADIUS * 0.5) {
          addItem(this.ch, d.item, d.qty);
          this.emit({ type: 'pickup', id: d.id, item: d.item, qty: d.qty });
          continue;
        }
      }
      if (d.t > 120) {
        this.emit({ type: 'dropExpire', id: d.id });
        continue;
      }
      keep.push(d);
    }
    this.drops = keep;
  }

  updateRespawns() {
    const p = this.player;
    for (const sp of this.spawnPoints) {
      if (sp.entity || this.time < sp.respawnAt) continue;
      if (dist(p.x, p.z, sp.x, sp.z) < 14) continue; // never pop in right next to the player
      this.spawnAt(sp);
    }
  }
}
