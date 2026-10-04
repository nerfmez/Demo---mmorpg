// The game simulation. Pure logic: no Three.js, no DOM. The renderer and UI read
// game state and drain game.events each frame. Godot port: this becomes the scene
// scripts (player, monster, ally, projectile, area) plus an autoload for the character.

import { createWorld } from './world.js';
import { createRng } from './rng.js';
import { DEG, angleDiff, angleTo, dist, dirFromAngle, clamp } from './math.js';
import { createCharacter, migrateCharacter, derive, addExp, gearLook } from './character.js';
import { computeSkill, movementSkill } from './skills.js';
import { rollDrops, addItem } from './crafting.js';
import { nearestTarget, softTarget } from './targeting.js';
import { updateMonster, onMonsterHit, setAggro } from './ai.js';
import { refreshQuests, questEvent } from './quests.js';
import { enterMap } from './maps.js';

const PLAYER_RADIUS = 0.45;
const PICKUP_RADIUS = 1.4;
const MAGNET_RADIUS = 3.2;
const INTERACT_RADIUS = 3.6;
const WAYPOINT_RADIUS = 3.8;
const AI_RADIUS = 85; // monsters farther than this from the player sleep unless in a fight

export class Game {
  /**
   * @param {object} data game data
   * @param {{seed?:number, character?:object, world?:object}} opts
   */
  constructor(data, { seed = 12345, character = null, world = null } = {}) {
    this.data = data;
    this.world = world || createWorld(data.world);
    this.rng = createRng(seed);
    this.time = 0;
    this.events = [];
    this.nextId = 1;
    this.ch = character ? migrateCharacter(character, data) : createCharacter(data);
    this.monsters = [];
    this.allies = [];
    this.projectiles = [];
    this.areas = [];
    this.drops = [];
    this.spawnPoints = [];
    this.pending = [];
    this.input = { moveX: 0, moveZ: 0, aimAngle: 0, aimPoint: null, aimFromPointer: false, manualAim: false };
    this.stats = { kills: 0, damageDealt: 0 };
    this.combo = 0;
    this.checkT = 0;

    let [sx, sz] = data.world.playerSpawn;
    if (this.ch.pos && this.world.isFree(this.ch.pos[0], this.ch.pos[1], PLAYER_RADIUS)) [sx, sz] = this.ch.pos;
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
      buffs: {},
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
    this.zoneId = this.world.zoneAt(sx, sz).id;
    this.spawnMonsters();
    this.completeQuests(refreshQuests(this.ch, data));
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

  later(delay, fn) {
    this.pending.push({ t: delay, fn });
  }

  zoneAt(x, z) {
    return this.world.zoneAt(x, z);
  }

  isSafe(x, z) {
    return this.world.isSafe(x, z);
  }

  monsterById(id) {
    return this.monsters.find((m) => m.id === id) || null;
  }

  get target() {
    return this.player.targetId ? this.monsterById(this.player.targetId) : null;
  }

  gearLook() {
    return gearLook(this.ch, this.data);
  }

  isWaypointUnlocked(id) {
    return this.ch.progress.waypoints.includes(id);
  }

  /** Save-ready character with the current position. */
  snapshot() {
    if (this.travelled) return this.ch;
    const p = this.player;
    this.ch.pos = p.dead ? null : [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10];
    return this.ch;
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
    const ranges = this.skills.filter((s) => s && ['melee_arc', 'melee_nova', 'projectile', 'chain'].includes(s.kind)).map((s) => s.range);
    const ground = this.skills.filter((s) => s && ['ground_area', 'dot_zone', 'curse_zone'].includes(s.kind)).map((s) => s.range);
    this.acquireRange = ranges.length ? Math.max(...ranges) : ground.length ? Math.max(...ground) : 6;
    if (this.monsters) this.completeQuests(refreshQuests(this.ch, this.data));
  }

  /** Move an entity with collision. Monsters stay out of the safe settlement. */
  moveEntity(e, dx, dz, opts = {}) {
    if (e.def?.flyer) {
      const b = this.world.bounds;
      e.x = clamp(e.x + dx, b.minX + 1, b.maxX - 1);
      e.z = clamp(e.z + dz, b.minZ + 1, b.maxZ - 1);
      if (this.isSafe(e.x, e.z)) {
        e.x -= dx;
        e.z -= dz;
      }
      return { blocked: false, blockedHard: false };
    }
    const res = this.world.move(e.x, e.z, e.r, dx, dz, { ignoreWater: e.def?.hover, ignoreSlope: e.def?.hover });
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
    const bosses = w.bosses || [];
    const avoid = bosses.map((bs) => ({ x: bs.pos[0], z: bs.pos[1], r: bs.arena.r + 3 }));
    for (const wp of this.world.waypoints) avoid.push({ x: wp.x, z: wp.z, r: 9 });
    for (const s of w.spawns) {
      for (let i = 0; i < s.count; i++) {
        const pt = this.world.randomPointInZone(s.zone, 1, this.rng, avoid);
        if (!pt) continue;
        if (w.id) avoid.push({ x: pt.x, z: pt.z, r: 6 });
        const sp = { monster: s.monster, zone: s.zone, level: s.level, x: pt.x, z: pt.z, respawnAt: 0, entity: null, respawn: w.respawnSeconds };
        this.spawnPoints.push(sp);
        this.spawnAt(sp);
      }
    }
    for (const bs of bosses) {
      const sp = { monster: bs.monster, bossId: bs.id, zone: this.world.zoneAt(bs.pos[0], bs.pos[1]).id, level: [bs.level, bs.level], x: bs.pos[0], z: bs.pos[1], respawnAt: 0, entity: null, respawn: bs.respawnSeconds, boss: true, final: !!bs.final };
      this.spawnPoints.push(sp);
      this.spawnAt(sp);
    }
  }

  spawnAt(sp, at = null) {
    const def = this.data.monsters.monsters[sp.monster];
    const sc = this.data.progression.monsterScaling;
    const level = this.rng.int(sp.level[0], sp.level[1]);
    const L = level - 1;
    const x = at ? at.x : sp.x;
    const z = at ? at.z : sp.z;
    const m = {
      id: this.newId(),
      kind: 'monster',
      team: 'monster',
      type: sp.monster,
      def,
      level,
      x,
      z,
      homeX: x,
      homeZ: z,
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
      buffs: {},
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
      alt: def.hover || 0,
      targetUnit: null,
    };
    m.hp = m.maxHp;
    if (!at) sp.entity = m;
    this.monsters.push(m);
    this.emit({ type: 'spawn', id: m.id });
    return m;
  }

  /** A monster called in by another (Greyfang's howl). Never respawns. */
  spawnMinion(type, level, x, z) {
    const sp = { monster: type, zone: this.world.zoneAt(x, z).id, level: [level, level], x, z, respawn: 0, minion: true };
    const m = this.spawnAt(sp, { x, z });
    m.minion = true;
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
    pr.ground = this.world.surfaceY(pr.x, pr.z);
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

  spawnAllies(s, x, z) {
    const sm = s.summon;
    const mine = this.allies.filter((a) => a.type === sm.type && !a.dead);
    while (mine.length >= sm.count) {
      const old = mine.shift();
      old.life = 0;
    }
    for (let i = 0; i < sm.count - mine.length; i++) {
      const a = (i / sm.count) * Math.PI * 2;
      let ax = x + Math.sin(a) * 1.2;
      let az = z + Math.cos(a) * 1.2;
      if (!this.world.isFree(ax, az, 0.6)) {
        ax = x;
        az = z;
      }
      const ally = {
        id: this.newId(),
        kind: 'ally',
        team: 'player',
        type: sm.type,
        x: ax,
        z: az,
        r: 0.6,
        facing: this.player.facing,
        hp: sm.hp,
        maxHp: sm.hp,
        damage: sm.damage,
        speed: sm.speed,
        range: sm.range,
        attackCooldown: sm.attackCooldown,
        cd: 0,
        life: sm.life,
        state: 'follow',
        stateT: 0,
        targetId: null,
        moving: false,
        dead: false,
        buffs: {},
        statuses: {},
        slot: i,
      };
      this.allies.push(ally);
      this.emit({ type: 'summon', skill: s.id, id: ally.id, x: ax, z: az });
    }
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
    this.input.manualAim = true;
    this.input.aimAngle = angleTo(this.player.x, this.player.z, x, z);
  }

  setAimAngle(a, manual = false) {
    this.input.aimAngle = a;
    this.input.aimPoint = null;
    this.input.aimFromPointer = false;
    this.input.manualAim = manual;
  }

  /** Cast the skill in a slot. point: optional explicit ground point for area skills. */
  castSlot(i, point = null) {
    const p = this.player;
    if (p.dead) return false;
    if (p.cast || p.dash) {
      p.queued = { slot: i, point, t: 0.35, manualAngle: this.input.manualAim && !this.input.aimFromPointer ? this.input.aimAngle : null };
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
    const directional = ['melee_arc', 'projectile', 'chain', 'melee_nova'].includes(s.kind);
    // Quick/tap attacks ignore facing and pick the closest enemy the skill can actually reach.
    // Pointer aim and touch drag are explicit overrides.
    if (!point && directional && !this.input.manualAim) {
      const nearest = nearestTarget(p, this.monsters, s.range);
      const prevTarget = p.targetId;
      p.targetId = nearest ? nearest.id : null;
      if (prevTarget !== p.targetId) this.emit({ type: 'target', id: p.targetId });
    }
    const aim = this.resolveAim(s, point);
    const clearOneShotManualAim = this.input.manualAim && !this.input.aimFromPointer;
    if (clearOneShotManualAim) this.input.manualAim = false;
    p.mp -= s.cost;
    p.cooldowns[i] = s.cooldown;
    // step: which swing of the 1-2-3 combo this will be; decided now and kept until it lands,
    // so the announced animation and the swing always agree
    const step = s.kind === 'melee_arc' ? this.comboStepAt(this.time + s.castTime) : 0;
    p.cast = { slot: i, t: 0, total: s.castTime, aim, skill: s, step };
    p.facing = aim.angle;
    this.emit({ type: 'castStart', slot: i, skill: s.id, kind: s.kind, angle: aim.angle, x: aim.x, z: aim.z, total: s.castTime, weapon: this.derived.weaponType, step });
    return true;
  }

  resolveAim(s, point) {
    const p = this.player;
    const t = this.target;
    let angle = this.input.aimFromPointer ? this.input.aimAngle : p.facing;
    if (['melee_arc', 'projectile', 'chain', 'melee_nova'].includes(s.kind)) {
      if (t && dist(p.x, p.z, t.x, t.z) - t.r <= s.range + 0.5) angle = angleTo(p.x, p.z, t.x, t.z);
      return { angle, x: p.x, z: p.z };
    }
    if (['ground_area', 'heal_zone', 'dot_zone', 'curse_zone'].includes(s.kind)) {
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
    return { angle: t ? angleTo(p.x, p.z, t.x, t.z) : p.facing, x: p.x, z: p.z };
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
    if (mv.kind === 'blink' || mv.kind === 'leap') {
      const dest = point || (this.input.aimFromPointer && !moving ? this.input.aimPoint : null);
      let d = mv.distance;
      if (dest) {
        d = Math.min(mv.distance, Math.max(1.5, dist(p.x, p.z, dest.x, dest.z)));
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
      p.facing = angle;
      if (mv.kind === 'blink') {
        this.emit({ type: 'blinkPlayer', fromX: p.x, fromZ: p.z, x: nx, z: nz });
        p.x = nx;
        p.z = nz;
        p.dash = { t: 0, dur: mv.duration, vx: 0, vz: 0, inv: mv.invulnerable, kind: 'blink' };
      } else {
        p.dash = { t: 0, dur: mv.duration, vx: 0, vz: 0, inv: mv.invulnerable, kind: 'leap', fromX: p.x, fromZ: p.z, toX: nx, toZ: nz };
      }
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
    const wp = this.world.waypoints.find((w) => dist(p.x, p.z, w.x, w.z) < WAYPOINT_RADIUS && this.isWaypointUnlocked(w.id));
    const exit = this.world.exits.find((e) => dist(p.x, p.z, e.x, e.z) < e.r && this.data.maps?.[e.to]);
    return {
      exit: exit ? exit.id : null,
      workbench: dist(p.x, p.z, t.workbench[0], t.workbench[1]) < INTERACT_RADIUS,
      trainer: dist(p.x, p.z, t.trainer[0], t.trainer[1]) < INTERACT_RADIUS,
      waypoint: wp ? wp.id : null,
      inTown: this.isSafe(p.x, p.z),
    };
  }

  inCombat() {
    const p = this.player;
    return this.monsters.some((m) => !m.dead && m.aggro && dist(m.x, m.z, p.x, p.z) < 16);
  }

  /**
   * Travel through an exit to its linked map. Returns the save-ready character placed
   * at the destination; the caller rebuilds the world from data.maps[ch.worldId].
   */
  travel(id) {
    const p = this.player;
    const exit = this.world.exits.find((e) => e.id === id);
    if (!exit || !this.data.maps?.[exit.to]) return { ok: false, reason: 'unknown' };
    if (dist(p.x, p.z, exit.x, exit.z) > exit.r) return { ok: false, reason: 'far' };
    if (p.dead) return { ok: false, reason: 'dead' };
    if (this.inCombat()) return { ok: false, reason: 'combat' };
    enterMap(this.ch, this.data, exit.to, exit.arrive);
    this.travelled = exit.to; // the character now belongs to the destination map
    this.emit({ type: 'travel', to: exit.to, name: exit.nameTh });
    return { ok: true, character: this.ch, to: exit.to };
  }

  /** Fast travel to a discovered waypoint. */
  teleportTo(id) {
    const p = this.player;
    const wp = this.world.waypoints.find((w) => w.id === id);
    if (!wp) return { ok: false, reason: 'unknown' };
    if (!this.isWaypointUnlocked(id)) return { ok: false, reason: 'locked' };
    if (p.dead) return { ok: false, reason: 'dead' };
    if (this.inCombat()) return { ok: false, reason: 'combat' };
    const spot = this.freeSpotNear(wp.x, wp.z + 2.2);
    p.x = spot.x;
    p.z = spot.z;
    p.dash = null;
    p.cast = null;
    p.targetId = null;
    for (const a of this.allies) {
      a.x = p.x + Math.sin(a.slot) * 1.5;
      a.z = p.z + Math.cos(a.slot) * 1.5;
    }
    this.emit({ type: 'teleport', id, x: p.x, z: p.z });
    return { ok: true };
  }

  freeSpotNear(x, z) {
    for (let r = 0; r < 6; r += 0.5)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const tx = x + Math.sin(a) * r;
        const tz = z + Math.cos(a) * r;
        if (this.world.isFree(tx, tz, PLAYER_RADIUS + 0.1)) return { x: tx, z: tz };
      }
    return { x, z };
  }

  // ---------- quests / progress ----------

  notify(ev) {
    if (ev.type === 'craft') this.ch.progress.crafted = (this.ch.progress.crafted || 0) + 1;
    this.completeQuests(questEvent(this.ch, this.data, ev));
  }

  completeQuests(ids) {
    for (const id of ids) {
      const q = this.data.quests.quests[id];
      const r = q.reward || {};
      if (r.gold) this.ch.gold += r.gold;
      for (const [item, n] of Object.entries(r.items || {})) addItem(this.ch, item, n);
      const gained = addExp(this.ch, this.data, r.exp || 0, r.jobExp || 0);
      this.emit({ type: 'questDone', id, reward: r });
      if (gained.levels) this.onLevelUp();
      if (gained.jobLevels) this.emit({ type: 'joblevelup', level: this.ch.jobLevel });
    }
  }

  onLevelUp() {
    const p = this.player;
    this.refresh();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    this.emit({ type: 'levelup', level: this.ch.level });
  }

  // ---------- combat ----------

  rollCrit() {
    return this.rng.chance(this.derived.critChance);
  }

  playerDamageMult() {
    const b = this.player.buffs.war_cry;
    return b ? 1 + b.damage : 1;
  }

  /** Damage to a monster from the player, an ally or a damage-over-time effect. */
  hitMonster(m, amount, opts = {}) {
    if (m.dead) return 0;
    const hpBefore = Math.max(0, m.hp);
    let dmg = amount;
    const crit = opts.crit ?? false;
    if (crit) dmg *= this.derived.critMult;
    if (!opts.dot) dmg *= 1 - m.defense / (m.defense + 60);
    if (m.shell) dmg *= m.def.attacks.shell.damageTaken;
    if (m.state === 'emerge') dmg *= m.def.attacks.shell.emergeDamageTaken;
    if (m.statuses.hex) dmg *= m.statuses.hex.taken;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.hurtT = 0.18;
    // flinch: regular monsters stop for a moment (a started wind-up still goes off)
    if (!opts.dot && !m.boss) m.staggerT = Math.max(m.staggerT || 0, opts.stagger ?? this.data.progression.combat?.stagger ?? 0.14);
    this.stats.damageDealt += dmg;
    this.emit({ type: 'hit', id: m.id, amount: dmg, crit, heavy: !!opts.stagger, skill: opts.skill, attackKind: opts.attackKind, fromX: opts.fromX ?? this.player.x, fromZ: opts.fromZ ?? this.player.z, element: opts.element || 'physical', dot: !!opts.dot, shell: m.shell, byAlly: !!opts.byAlly, x: m.x, z: m.z });
    if (!opts.dot) {
      onMonsterHit(this, m, opts.by);
      if (opts.chill) m.statuses.chill = { slow: opts.chill.slow, t: opts.chill.duration };
      if (opts.burnChance && this.rng.chance(opts.burnChance)) m.statuses.burn = { dps: amount * 0.15, t: 3, acc: 0 };
      const pc = this.derived.poisonChancePct / 100;
      if (pc > 0 && !opts.byAlly && this.rng.chance(pc)) m.statuses.poison = { dps: amount * 0.12, t: 4, acc: 0 };
      if (opts.knock && m.hp > 0) {
        const a = angleTo(opts.fromX ?? this.player.x, opts.fromZ ?? this.player.z, m.x, m.z);
        const d = dirFromAngle(a);
        const k = opts.knock * (m.boss ? 0.2 : m.def.flyer ? 0.6 : 1);
        this.moveEntity(m, d.x * k, d.z * k);
        if (!m.boss && m.state === 'windup') m.stateT = Math.max(0, m.stateT - 0.25); // knocks the rhythm back a little
      }
      if (opts.leech && !opts.byAlly) this.healPlayer((Math.min(dmg, hpBefore) * opts.leech) / 100, true);
    } else setAggro(this, m, this.player);
    if (m.hp <= 0) this.killMonster(m);
    return dmg;
  }

  killMonster(m) {
    m.dead = true;
    m.hp = 0;
    m.deathT = 0;
    m.windup = null;
    m.charge = null;
    m.melee = null;
    this.stats.kills++;
    const p = this.player;
    const prog = this.ch.progress;
    if (p.targetId === m.id) p.targetId = null;
    this.emit({ type: 'death', id: m.id, x: m.x, z: m.z, boss: m.boss, monster: m.type });
    const drops = m.minion ? rollDrops(this.data, m.type, m.zone, this.rng).filter((d) => d.item === 'gold') : rollDrops(this.data, m.type, m.zone, this.rng);
    drops.forEach((d, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2 + this.rng.range(0, 1);
      const r = this.rng.range(0.6, 1.4);
      const drop = { id: this.newId(), item: d.item, qty: d.qty, x: m.x + Math.sin(a) * r, z: m.z + Math.cos(a) * r, t: 0 };
      this.drops.push(drop);
      this.emit({ type: 'drop', id: drop.id, item: drop.item, fromX: m.x, fromZ: m.z });
    });
    const gained = addExp(this.ch, this.data, m.exp, m.jobExp);
    this.emit({ type: 'exp', exp: m.exp, jobExp: m.jobExp, x: m.x, z: m.z });
    if (gained.levels) this.onLevelUp();
    if (gained.jobLevels) this.emit({ type: 'joblevelup', level: this.ch.jobLevel });
    prog.kills[m.type] = (prog.kills[m.type] || 0) + 1;
    if (m.boss) {
      const id = m.spawn.bossId || m.type;
      prog.bossKills[id] = (prog.bossKills[id] || 0) + 1;
      if (m.spawn.final) this.ch.bossKills++;
      this.emit({ type: 'bossDefeated', boss: id, name: m.def.name, final: !!m.spawn.final, first: prog.bossKills[id] === 1 });
    }
    this.notify({ type: 'kill', target: m.type });
    if (!m.minion) {
      m.spawn.respawnAt = this.time + m.spawn.respawn;
      m.spawn.entity = null;
    }
  }

  /** Damage from a monster to the player or an ally. */
  damageUnit(unit, amount, source, opts = {}) {
    if (source?.statuses?.hex) amount *= source.statuses.hex.dealt;
    if (unit.kind === 'ally') return this.damageAlly(unit, amount, source);
    return this.damagePlayer(amount, source, opts);
  }

  damageAlly(a, amount, source) {
    if (a.dead) return 0;
    const dmg = Math.max(1, Math.round(amount * 0.85));
    a.hp -= dmg;
    this.emit({ type: 'allyHit', id: a.id, amount: dmg, x: a.x, z: a.z });
    if (source && !source.dead && source.kind === 'monster') a.targetId = source.id;
    if (a.hp <= 0) a.life = 0;
    return dmg;
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
      if (p.reflect > 0 && source && source.kind === 'monster' && !source.dead) this.hitMonster(source, absorbed * p.reflect + 4, { element: 'physical' });
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
      this.ch.progress.deaths = (this.ch.progress.deaths || 0) + 1;
      this.emit({ type: 'playerDeath' });
    }
    return dmg;
  }

  healPlayer(amount, quiet = false) {
    const p = this.player;
    if (p.dead) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const got = p.hp - before;
    if (!quiet && this.derived.healGrantsBarrierPct > 0) {
      const add = (amount * this.derived.healGrantsBarrierPct) / 100;
      p.barrier = Math.min(p.maxHp * 0.5, p.barrier + add);
      p.barrierT = Math.max(p.barrierT, 3);
    }
    if (got > 0.5 && !quiet) this.emit({ type: 'heal', amount: Math.round(got), x: p.x, z: p.z });
  }

  hitOpts(s, extra = {}) {
    return { skill: s.id, attackKind: s.kind, element: s.element, chill: s.chill, burnChance: s.burnChance, knock: s.knock, leech: s.leech, ...extra };
  }

  /** The combo step (0, 1, 2 = finisher) a melee swing landing at time t would be. */
  comboStepAt(t) {
    const p = this.player;
    const window = this.data.progression.combat?.comboWindow ?? 1.1;
    return t - (p.lastSwingT ?? -9) < window ? ((p.comboStep || 0) + 1) % 3 : 0;
  }

  /** Execute a computed skill. mult scales damage (triggers, echoes, repeats). */
  executeSkill(s, aim, { mult = 1, triggered = false, repeat = 0, step = null } = {}) {
    const p = this.player;
    mult *= this.playerDamageMult();
    const crit = () => this.rollCrit();
    switch (s.kind) {
      case 'melee_arc': {
        const arc = s.arc * DEG;
        let hits = 0;
        // 1-2-3 combo: the third swing in a row is a finisher
        const cb = this.data.progression.combat || {};
        let finisher = false;
        if (!triggered && repeat === 0) {
          p.comboStep = step ?? this.comboStepAt(this.time);
          p.lastSwingT = this.time;
          finisher = p.comboStep === 2;
          if (finisher) mult *= cb.finisherMult ?? 1.5;
        }
        for (const m of this.monsters) {
          if (m.dead) continue;
          const d = dist(p.x, p.z, m.x, m.z) - m.r;
          if (d > s.range) continue;
          const off = Math.abs(angleDiff(aim.angle, angleTo(p.x, p.z, m.x, m.z)));
          if (off > arc / 2 && d > 0.3) continue;
          this.hitMonster(m, s.damage * mult, this.hitOpts(s, { crit: crit(), ...(finisher ? { knock: Math.max(s.knock || 0, cb.finisherKnock ?? 2.2), stagger: 0.35 } : {}) }));
          hits++;
        }
        if (hits && this.derived.meleeHitBarrier) {
          p.barrier = Math.min(p.maxHp * 0.5, p.barrier + this.derived.meleeHitBarrier * hits);
          p.barrierT = Math.max(p.barrierT, 3);
        }
        this.emit({ type: 'slash', skill: s.id, x: p.x, z: p.z, angle: aim.angle, arc: s.arc, range: s.range, element: s.element, triggered, combo: this.combo++, step: p.comboStep || 0, finisher, hits });
        if (s.ground) {
          const d = dirFromAngle(aim.angle);
          this.spawnGround(s, p.x + d.x * s.range * 0.6, p.z + d.z * s.range * 0.6, mult);
        }
        if (repeat < s.repeats) this.later(s.repeatDelay, () => !p.dead && this.executeSkill(s, { ...aim, angle: p.facing }, { mult: s.repeatMult, repeat: repeat + 1 }));
        return;
      }
      case 'melee_nova': {
        for (const m of this.monsters) {
          if (m.dead || dist(p.x, p.z, m.x, m.z) - m.r > s.radius) continue;
          this.hitMonster(m, s.damage * mult, this.hitOpts(s, { crit: crit() }));
        }
        this.emit({ type: 'whirl', skill: s.id, x: p.x, z: p.z, radius: s.radius, angle: p.facing, element: s.element });
        if (s.ground) this.spawnGround(s, p.x, p.z, mult);
        if (repeat < s.repeats) this.later(s.repeatDelay + 0.1, () => !p.dead && this.executeSkill(s, aim, { mult: s.repeatMult, repeat: repeat + 1 }));
        if (s.echo && !repeat && !triggered) this.later(s.echo.delay, () => !p.dead && this.executeSkill(s, aim, { mult: s.echo.mult, repeat: 99 }));
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
      case 'chain': {
        const hit = new Set();
        let cur = null;
        const t = this.target;
        if (t && !t.dead && dist(p.x, p.z, t.x, t.z) - t.r <= s.range) cur = t;
        else {
          let best = Infinity;
          for (const m of this.monsters) {
            if (m.dead) continue;
            const d = dist(p.x, p.z, m.x, m.z) - m.r;
            if (d > s.range) continue;
            const off = Math.abs(angleDiff(aim.angle, angleTo(p.x, p.z, m.x, m.z)));
            if (off > 0.6) continue;
            const score = off * 6 + d;
            if (score < best) {
              best = score;
              cur = m;
            }
          }
        }
        const points = [[p.x + Math.sin(aim.angle) * 0.5, p.z + Math.cos(aim.angle) * 0.5]];
        if (!cur) {
          const d = dirFromAngle(aim.angle);
          points.push([p.x + d.x * s.range * 0.8, p.z + d.z * s.range * 0.8]);
          this.emit({ type: 'chain', points, element: s.element });
          return;
        }
        let dmg = s.damage * mult;
        for (let i = 0; i <= s.chain && cur; i++) {
          points.push([cur.x, cur.z]);
          hit.add(cur.id);
          const target = cur;
          this.hitMonster(target, dmg, this.hitOpts(s, { crit: crit() }));
          if (s.ground) this.spawnGround(s, target.x, target.z, mult);
          dmg *= s.chainFalloff;
          let next = null;
          let nd = s.chainRange || 6;
          for (const m of this.monsters) {
            if (m.dead || hit.has(m.id)) continue;
            const d = dist(target.x, target.z, m.x, m.z);
            if (d < nd) {
              nd = d;
              next = m;
            }
          }
          cur = next;
        }
        this.emit({ type: 'chain', points, element: s.element });
        return;
      }
      case 'ground_area': {
        this.spawnArea({ owner: 'player', kind: s.id, skill: s, x: aim.x, z: aim.z, radius: s.radius, delay: s.delay, duration: 0.35, damage: s.damage * mult, element: s.element });
        if (s.echo) this.spawnArea({ owner: 'player', kind: s.id, skill: s, echo: true, x: aim.x, z: aim.z, radius: s.radius, delay: s.delay + s.echo.delay, duration: 0.35, damage: s.damage * mult * s.echo.mult, element: s.element });
        return;
      }
      case 'nova': {
        const blast = (k) => {
          for (const m of this.monsters) {
            if (m.dead || dist(p.x, p.z, m.x, m.z) - m.r > s.radius) continue;
            this.hitMonster(m, s.damage * mult * k, this.hitOpts(s, { crit: crit(), fromX: p.x, fromZ: p.z }));
          }
          this.emit({ type: 'nova', x: p.x, z: p.z, radius: s.radius, element: s.element });
          if (s.ground) this.spawnGround(s, p.x, p.z, mult * k);
        };
        blast(1);
        if (s.echo) this.later(s.echo.delay, () => !p.dead && blast(s.echo.mult));
        return;
      }
      case 'dot_zone': {
        const make = (delay, k) =>
          this.spawnArea({ owner: 'player', kind: s.id, skill: s, x: aim.x, z: aim.z, radius: s.radius, delay, duration: s.duration, tick: s.tick, damage: s.damage * mult * s.tick * k, element: s.element, slow: s.slow, dot: true });
        make(0, 1);
        if (s.echo) make(s.echo.delay, s.echo.mult);
        return;
      }
      case 'curse_zone': {
        const curse = () => {
          for (const m of this.monsters) {
            if (m.dead || dist(aim.x, aim.z, m.x, m.z) - m.r > s.radius) continue;
            m.statuses.hex = { t: s.duration, taken: s.takenMult, dealt: s.dealtMult };
            setAggro(this, m, p);
          }
          this.emit({ type: 'curse', x: aim.x, z: aim.z, radius: s.radius });
        };
        curse();
        if (s.echo) this.later(s.echo.delay, curse);
        return;
      }
      case 'heal_zone': {
        this.spawnArea({ owner: 'player', kind: s.id, skill: s, x: aim.x, z: aim.z, radius: s.radius, delay: 0, duration: s.duration, tick: s.tick, heal: s.heal * mult * s.tick, element: 'none' });
        if (s.echo) this.spawnArea({ owner: 'player', kind: s.id, skill: s, echo: true, x: aim.x, z: aim.z, radius: s.radius, delay: s.echo.delay + s.duration * 0.5, duration: s.duration, tick: s.tick, heal: s.heal * mult * s.tick * s.echo.mult, element: 'none' });
        return;
      }
      case 'self_barrier': {
        p.barrier = Math.max(p.barrier, s.barrier);
        p.barrierT = s.duration;
        p.reflect = s.reflect;
        for (const a of this.allies) if (!a.dead && dist(a.x, a.z, p.x, p.z) < s.radius) a.hp = Math.min(a.maxHp, a.hp + s.barrier * 0.5);
        if (s.tauntRadius) for (const m of this.monsters) if (!m.dead && dist(p.x, p.z, m.x, m.z) < s.tauntRadius) setAggro(this, m, p, true);
        this.emit({ type: 'ward', x: p.x, z: p.z, amount: Math.round(p.barrier), reflect: s.reflect > 0, radius: s.radius });
        return;
      }
      case 'buff': {
        const buff = { t: s.duration, damage: s.damageBuff, speed: s.speedBuff };
        p.buffs.war_cry = { ...buff };
        for (const a of this.allies) if (!a.dead && dist(a.x, a.z, p.x, p.z) < s.radius) a.buffs.war_cry = { ...buff };
        this.emit({ type: 'buff', kind: 'war_cry', x: p.x, z: p.z, radius: s.radius });
        return;
      }
      case 'summon': {
        this.spawnAllies(s, p.x - Math.sin(p.facing) * 1.2, p.z - Math.cos(p.facing) * 1.2);
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
    this.ch.progress.playTime = (this.ch.progress.playTime || 0) + dt;
    const due = [];
    this.pending = this.pending.filter((q) => {
      q.t -= dt;
      if (q.t <= 0) {
        due.push(q.fn);
        return false;
      }
      return true;
    });
    for (const fn of due) fn();
    this.updatePlayer(dt);
    const p = this.player;
    for (const m of this.monsters) {
      if (m.dead) {
        m.deathT += dt;
        continue;
      }
      if (!m.aggro && (Math.abs(m.x - p.x) > AI_RADIUS || Math.abs(m.z - p.z) > AI_RADIUS)) continue; // asleep far away
      this.tickStatuses(m, dt);
      if (m.dead) continue;
      m.hurtT = Math.max(0, m.hurtT - dt);
      updateMonster(this, m, dt);
    }
    this.separateMonsters();
    this.monsters = this.monsters.filter((m) => !(m.dead && m.deathT > 2.5));
    this.updateAllies(dt);
    this.updateProjectiles(dt);
    this.updateAreas(dt);
    this.updateDrops(dt);
    this.updateRespawns();
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.25;
      this.checkWorld();
    }
  }

  /** Waypoint activation and zone discovery. */
  checkWorld() {
    const p = this.player;
    if (p.dead) return;
    const prog = this.ch.progress;
    for (const wp of this.world.waypoints) {
      if (prog.waypoints.includes(wp.id)) continue;
      if (dist(p.x, p.z, wp.x, wp.z) < WAYPOINT_RADIUS) {
        prog.waypoints.push(wp.id);
        this.emit({ type: 'waypoint', id: wp.id, name: wp.nameTh, x: wp.x, z: wp.z });
        this.completeQuests(refreshQuests(this.ch, this.data));
      }
    }
    const zn = this.world.zoneAt(p.x, p.z);
    if (zn.id !== this.zoneId) {
      this.zoneId = zn.id;
      this.emit({ type: 'zone', id: zn.id });
    }
    if (!prog.zones.includes(zn.id)) {
      prog.zones.push(zn.id);
      this.emit({ type: 'zoneDiscovered', id: zn.id, name: zn.nameTh });
      this.completeQuests(refreshQuests(this.ch, this.data));
    }
  }

  respawnPoint() {
    const p = this.player;
    let best = null;
    let bd = Infinity;
    for (const wp of this.world.waypoints) {
      if (!this.isWaypointUnlocked(wp.id)) continue;
      const d = dist(p.x, p.z, wp.x, wp.z);
      if (d < bd) {
        bd = d;
        best = wp;
      }
    }
    if (best && best.id !== 'town') return this.freeSpotNear(best.x, best.z + 2.2);
    if (!best) return this.freeSpotNear(...this.data.world.playerSpawn);
    const r = this.data.world.town.respawn;
    return { x: r[0], z: r[1] };
  }

  updatePlayer(dt) {
    const p = this.player;
    if (p.dead) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        const r = this.respawnPoint();
        p.x = r.x;
        p.z = r.z;
        p.dead = false;
        p.hp = p.maxHp;
        p.mp = p.maxMp;
        p.statuses = {};
        p.buffs = {};
        p.barrier = 0;
        this.emit({ type: 'respawn', x: p.x, z: p.z });
      }
      return;
    }
    p.hurtT = Math.max(0, p.hurtT - dt);
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
    for (const k in p.buffs) {
      p.buffs[k].t -= dt;
      if (p.buffs[k].t <= 0) delete p.buffs[k];
    }
    const mv = this.move;
    if (p.movement.charges < mv.charges) {
      p.movement.rechargeT += dt;
      if (p.movement.rechargeT >= mv.recharge) {
        p.movement.rechargeT = 0;
        p.movement.charges++;
      }
    } else p.movement.rechargeT = 0;
    this.tickPlayerStatuses(dt);
    if (p.dead) return;

    if (p.dash) {
      p.dash.t += dt;
      if (p.dash.kind === 'leap') {
        const k = Math.min(1, p.dash.t / p.dash.dur);
        p.x = p.dash.fromX + (p.dash.toX - p.dash.fromX) * k;
        p.z = p.dash.fromZ + (p.dash.toZ - p.dash.fromZ) * k;
      } else if (p.dash.vx || p.dash.vz) this.moveEntity(p, p.dash.vx * dt, p.dash.vz * dt);
      if (p.dash.t >= p.dash.dur) {
        const d = p.dash;
        p.dash = null;
        if (d.kind === 'leap' && this.move.landing) {
          const L = this.move.landing;
          for (const m of this.monsters) if (!m.dead && dist(p.x, p.z, m.x, m.z) - m.r <= L.radius) this.hitMonster(m, L.damage * this.playerDamageMult(), { element: 'physical', crit: this.rollCrit(), knock: 1.2, fromX: p.x, fromZ: p.z });
          this.emit({ type: 'burst', kind: 'leap', element: 'physical', x: p.x, z: p.z, radius: L.radius });
        }
        this.fireTriggers('on_movement');
      }
      return;
    }

    const mx = this.input.moveX;
    const mz = this.input.moveZ;
    const mlen = Math.hypot(mx, mz);
    const chill = p.statuses.chill ? 1 - p.statuses.chill.slow : 1;
    const haste = p.buffs.war_cry ? 1 + p.buffs.war_cry.speed : 1;
    const speed = this.derived.moveSpeed * (p.cast ? 0.4 : 1) * chill * haste;
    p.moving = mlen > 0.08;
    if (p.moving) {
      this.moveEntity(p, mx * speed * dt, mz * speed * dt);
      if (!p.cast) {
        const a = Math.atan2(mx, mz);
        p.facing += clamp(angleDiff(p.facing, a), -14 * dt, 14 * dt);
      }
    }

    const aimAngle = this.input.aimFromPointer ? this.input.aimAngle : p.moving ? Math.atan2(mx, mz) : p.facing;
    if (!this.input.aimFromPointer && !p.moving) this.input.aimAngle = p.facing;
    const prev = p.targetId;
    p.targetId = softTarget(p, this.monsters, aimAngle, this.acquireRange, { preferNearest: !this.input.manualAim });
    if (prev !== p.targetId) this.emit({ type: 'target', id: p.targetId });

    if (p.cast) {
      p.cast.t += dt;
      p.facing = p.cast.aim.angle;
      if (p.cast.t >= p.cast.total) {
        const c = p.cast;
        p.cast = null;
        this.executeSkill(c.skill, c.aim, { step: c.step });
      }
    } else if (p.queued) {
      const q = p.queued;
      p.queued = null;
      if (q.t > 0) {
        if (q.manualAngle !== null) this.setAimAngle(q.manualAngle, true);
        this.castSlot(q.slot, q.point);
      }
    }
    if (p.queued) p.queued.t -= dt;
  }

  fireTriggers(on) {
    const p = this.player;
    this.skills.forEach((s, i) => {
      if (!s || !s.trigger || s.trigger.on !== on || p.triggerCd[i] > 0) return;
      p.triggerCd[i] = s.trigger.icd;
      let aim;
      if (['ground_area', 'heal_zone', 'dot_zone', 'curse_zone'].includes(s.kind)) aim = { angle: p.facing, x: p.x, z: p.z };
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
    for (const k of ['chill', 'hex', 'mire']) {
      if (!m.statuses[k]) continue;
      m.statuses[k].t -= dt;
      if (m.statuses[k].t <= 0) delete m.statuses[k];
    }
    for (const k in m.buffs) {
      m.buffs[k].t -= dt;
      if (m.buffs[k].t <= 0) delete m.buffs[k];
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
        if (p.hp <= 0) p.hp = 1; // poison alone never kills
      }
      if (st.t <= 0) delete p.statuses.poison;
    }
    if (p.statuses.chill) {
      p.statuses.chill.t -= dt;
      if (p.statuses.chill.t <= 0) delete p.statuses.chill;
    }
  }

  updateAllies(dt) {
    const p = this.player;
    const keep = [];
    for (const a of this.allies) {
      a.life -= dt;
      a.stateT += dt;
      a.cd = Math.max(0, a.cd - dt);
      for (const k in a.buffs) {
        a.buffs[k].t -= dt;
        if (a.buffs[k].t <= 0) delete a.buffs[k];
      }
      if (a.life <= 0 || p.dead) {
        this.emit({ type: 'allyGone', id: a.id, x: a.x, z: a.z });
        continue;
      }
      keep.push(a);
      // pick a target: what we are fighting, else the player's target, else something threatening the player
      let t = a.targetId ? this.monsterById(a.targetId) : null;
      if (!t || t.dead || dist(t.x, t.z, p.x, p.z) > 16) {
        t = null;
        const pt = this.target;
        if (pt && dist(pt.x, pt.z, a.x, a.z) < 12) t = pt;
        else {
          let bd = 9;
          for (const m of this.monsters) {
            if (m.dead || !m.aggro) continue;
            const d = dist(m.x, m.z, a.x, a.z);
            if (d < bd && dist(m.x, m.z, p.x, p.z) < 14) {
              bd = d;
              t = m;
            }
          }
        }
        a.targetId = t ? t.id : null;
      }
      const haste = a.buffs.war_cry ? 1 + a.buffs.war_cry.speed : 1;
      if (a.state === 'windup') {
        if (a.stateT >= 0.25) {
          const tt = this.monsterById(a.targetId);
          if (tt && !tt.dead && dist(a.x, a.z, tt.x, tt.z) - tt.r - a.r < a.range + 0.5) {
            const k = a.buffs.war_cry ? 1 + a.buffs.war_cry.damage : 1;
            this.hitMonster(tt, a.damage * k, { element: 'physical', by: a, byAlly: true, skill: 'spirit_wolf', attackKind: 'summon', fromX: a.x, fromZ: a.z });
            this.emit({ type: 'allyStrike', skill: 'spirit_wolf', x: tt.x, z: tt.z, fromX: a.x, fromZ: a.z });
          }
          a.cd = a.attackCooldown;
          a.state = 'recover';
          a.stateT = 0;
        }
        a.moving = false;
        continue;
      }
      if (a.state === 'recover' && a.stateT < 0.3) {
        a.moving = false;
        continue;
      }
      a.state = t ? 'chase' : 'follow';
      if (t) {
        const d = dist(a.x, a.z, t.x, t.z) - t.r - a.r;
        const ang = angleTo(a.x, a.z, t.x, t.z);
        a.facing = ang;
        if (d <= a.range && a.cd <= 0) {
          a.state = 'windup';
          a.stateT = 0;
          a.moving = false;
        } else if (d > a.range * 0.8) {
          const step = Math.min(d, a.speed * haste * dt);
          this.moveEntity(a, Math.sin(ang) * step, Math.cos(ang) * step);
          a.moving = true;
        } else a.moving = false;
      } else {
        // heel: a spot behind the player
        const side = a.slot % 2 ? 1 : -1;
        const hx = p.x - Math.sin(p.facing) * 2.2 + Math.cos(p.facing) * side * 1.2;
        const hz = p.z - Math.cos(p.facing) * 2.2 - Math.sin(p.facing) * side * 1.2;
        const d = dist(a.x, a.z, hx, hz);
        if (d > 25) {
          a.x = hx;
          a.z = hz;
        } else if (d > 0.8) {
          const ang = angleTo(a.x, a.z, hx, hz);
          const step = Math.min(d, a.speed * haste * (d > 5 ? 1.3 : 0.9) * dt);
          this.moveEntity(a, Math.sin(ang) * step, Math.cos(ang) * step);
          a.facing += clamp(angleDiff(a.facing, ang), -10 * dt, 10 * dt);
          a.moving = true;
        } else {
          a.moving = false;
          a.facing += clamp(angleDiff(a.facing, p.facing), -4 * dt, 4 * dt);
        }
      }
    }
    this.allies = keep;
  }

  separateMonsters() {
    const p = this.player;
    const ms = this.monsters.filter((m) => !m.dead && Math.abs(m.x - p.x) < 40 && Math.abs(m.z - p.z) < 40);
    for (let i = 0; i < ms.length; i++) {
      const a = ms[i];
      for (let j = i + 1; j < ms.length; j++) {
        const b = ms[j];
        if (a.def.flyer || b.def.flyer) continue;
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
      if (!p.dead && !a.def.flyer) {
        const d = dist(a.x, a.z, p.x, p.z);
        const min = a.r + p.r;
        if (d < min && d > 1e-3 && !a.charge) this.moveEntity(a, ((a.x - p.x) / d) * (min - d), ((a.z - p.z) / d) * (min - d));
      }
    }
  }

  /** Units (player + allies) a monster attack can hit. */
  units() {
    const out = [];
    if (!this.player.dead) out.push(this.player);
    for (const a of this.allies) if (!a.dead && a.life > 0) out.push(a);
    return out;
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const pr of this.projectiles) {
      const step = pr.speed * dt;
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.travelled += step;
      let dead = pr.travelled >= pr.range;
      // solid obstacles and cliff faces stop projectiles (not water)
      const g = this.world.surfaceY(pr.x, pr.z);
      if (!dead && (!this.world.isFree(pr.x, pr.z, 0.05, { ignoreWater: true }) || g - pr.ground > 1.3)) {
        dead = true;
        this.projectileImpact(pr);
      }
      pr.ground = g;
      if (!dead && pr.owner === 'player') {
        for (const m of this.monsters) {
          if (m.dead || pr.hit.has(m.id)) continue;
          if (dist(pr.x, pr.z, m.x, m.z) > m.r + pr.radius) continue;
          pr.hit.add(m.id);
          const s = pr.skill;
          this.hitMonster(m, pr.damage, this.hitOpts(s, { crit: this.rollCrit(), fromX: pr.x - pr.vx * 0.05, fromZ: pr.z - pr.vz * 0.05 }));
          this.emit({ type: 'impact', kind: pr.kind, element: pr.element, x: pr.x, z: pr.z, vx: pr.vx, vz: pr.vz });
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
      } else if (!dead && pr.owner === 'monster') {
        for (const u of this.units()) {
          if (dist(pr.x, pr.z, u.x, u.z) < u.r + pr.radius) {
            const src = this.monsterById(pr.sourceId);
            this.damageUnit(u, pr.damage, src, { poison: pr.poison });
            this.emit({ type: 'impact', kind: pr.kind, element: pr.element || (pr.kind === 'spit' ? 'poison' : 'arcane'), x: pr.x, z: pr.z });
            dead = true;
            break;
          }
        }
      }
      if (dead) this.emit({ type: 'projectileEnd', id: pr.id });
      else keep.push(pr);
    }
    this.projectiles = keep;
  }

  projectileImpact(pr) {
    this.emit({ type: 'impact', kind: pr.kind, element: pr.element || 'arcane', x: pr.x, z: pr.z, vx: pr.vx, vz: pr.vz });
    if (pr.owner === 'player' && pr.skill?.ground) this.spawnGround(pr.skill, pr.x, pr.z);
  }

  updateAreas(dt) {
    const keep = [];
    for (const a of this.areas) {
      a.t += dt;
      if (a.t < a.delay) {
        keep.push(a);
        continue;
      }
      const live = a.t - a.delay;
      if (a.kind === 'shockwave') {
        a.radius = Math.min(a.maxRadius, a.radius + a.growth * dt);
        for (const u of this.units()) {
          const d = dist(a.x, a.z, u.x, u.z);
          if (!a.hit.has(u.id) && Math.abs(d - a.radius) < 0.7) {
            a.hit.add(u.id);
            this.damageUnit(u, a.damage, this.monsterById(a.sourceId));
          }
        }
      } else if (a.tick) {
        if (live >= a.nextTick) {
          a.nextTick += a.tick;
          if (a.owner === 'monster') {
            for (const u of this.units()) if (dist(a.x, a.z, u.x, u.z) <= a.radius + u.r) this.damageUnit(u, a.damage, this.monsterById(a.sourceId), { dot: true });
          } else if (a.heal) {
            const p = this.player;
            if (!p.dead && dist(a.x, a.z, p.x, p.z) <= a.radius + p.r) this.healPlayer(a.heal);
            for (const al of this.allies) if (dist(a.x, a.z, al.x, al.z) <= a.radius + al.r) al.hp = Math.min(al.maxHp, al.hp + a.heal);
          } else if (a.damage) {
            for (const m of this.monsters) {
              if (m.dead || dist(a.x, a.z, m.x, m.z) > a.radius + m.r) continue;
              if (a.slow) m.statuses.chill = { slow: Math.max(a.slow, m.statuses.chill?.slow || 0), t: Math.max(0.6, m.statuses.chill?.t || 0) };
              this.hitMonster(m, a.damage, { dot: true, element: a.element });
            }
          }
        }
      } else if (!a.fired) {
        a.fired = true;
        if (a.owner === 'player') {
          const s = a.skill;
          for (const m of this.monsters) {
            if (m.dead || dist(a.x, a.z, m.x, m.z) > a.radius + m.r) continue;
            this.hitMonster(m, a.damage, s ? this.hitOpts(s, { crit: this.rollCrit(), fromX: a.x, fromZ: a.z }) : { element: a.element });
          }
          this.emit({ type: 'burst', kind: a.kind, element: a.element, echo: !!a.echo, x: a.x, z: a.z, radius: a.radius });
          if (s?.ground) this.spawnGround(s, a.x, a.z, a.echo ? s.echo.mult : 1);
        } else if (a.owner === 'monster' && a.damage) {
          const src = this.monsterById(a.sourceId);
          for (const u of this.units()) if (dist(a.x, a.z, u.x, u.z) <= a.radius + u.r) this.damageUnit(u, a.damage, src);
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
          if (d.item !== 'gold') {
            const c = this.ch.progress.collected;
            c[d.item] = (c[d.item] || 0) + d.qty;
            this.notify({ type: 'collect', item: d.item, qty: d.qty });
          }
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
      if (dist(p.x, p.z, sp.x, sp.z) < 16) continue; // never pop in right next to the player
      this.spawnAt(sp);
    }
  }
}
