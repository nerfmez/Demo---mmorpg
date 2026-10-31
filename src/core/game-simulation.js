// The game simulation. Pure logic: no Three.js, no DOM. The renderer and UI read
// game state and drain game.events each frame. Godot port: this becomes the scene
// scripts (player, monster, ally, projectile, area) plus an autoload for the character.

import { createWorld } from './world.js';
import { createRng } from './rng.js';
import { DEG, angleDiff, angleTo, dist, dirFromAngle, clamp } from './math.js';
import { createCharacter, migrateCharacter, derive, defenseFactor, addExp, expToNext, jobExpToNext, gearLook, arrowsPerCast, arrowTotal, arrowInUse, spendArrows } from './character.js';
import { computeSkill, movementSkill, aimsAtGround } from './skills.js';
import { gainProficiency } from './skill-growth.js';
import { rollDrops, addItem, craft, rollGearDrop } from './crafting.js';
import { perkHit, perkAfterHit, perkCast, perkMovement, perkDodge, perkInvulnerable, perkTaken, perkSteady, perkAfterTaken, perkRegen, perkShield, perkKill, perkDrops } from './stat-perks.js';
import { executeFrontier, strikeLane, adjustFrontierHit, spreadCurse, applyGuard, shareGuardDamage, breakBarrier, wallBlocked, tickFrontier, endProjectile, manaLimit, cancelChannel, startChannel, commandAllies, healUnit, chainFieldHeal, lightWallStops, coverMult, rushContact, stackPoison, chargeShock } from './frontier-content.js';
import { nearestTarget, softTarget } from './targeting.js';
import { reveal } from './rogue.js';
import { updateMonster, onMonsterHit, setAggro } from './ai.js';
import { refreshQuests, questEvent, recordQuestCompletion } from './quests.js';
import { enterMap, selectMap } from './maps.js';
import { waypointUnlocked } from './atlas.js';
import { buyConsumable, restoreAmount, consumableCount, automaticPotion } from './consumables.js';

const NO_CRIT = Object.freeze({ crit: false, noCrit: true }); // Controlled Power (a mod): this skill never crits
const PLAYER_RADIUS = 0.45;
const POTION_GROUPS = ['hp', 'mp'];
const PICKUP_RADIUS = 1.4;
const MAGNET_RADIUS = 3.2;
const INTERACT_RADIUS = 3.6;
const WAYPOINT_RADIUS = 3.8;
const AI_RADIUS = 85; // monsters farther than this from the player sleep unless in a fight

/** Sum of one field over a unit's active buffs (each buff skill keeps its own entry). */
function buffSum(buffs, key) {
  let n = 0;
  for (const k in buffs) n += buffs[k][key] || 0;
  return n;
}
/** Damage-taken multiplier from active buffs (takenMult; several multiply). */
function buffTaken(buffs) {
  let n = 1;
  for (const k in buffs) if (buffs[k].taken) n *= buffs[k].taken;
  return n;
}

export class Game {
  /**
   * @param {object} data game data
   * @param {{seed?:number, character?:object, world?:object}} opts
   */
  constructor(data, { seed = 12345, character = null, world = null } = {}) {
    this.data = data;
    this.world = world || createWorld(data.world);
    this.rng = createRng(seed);
    // LUK's lucky dodge rolls on its own stream, so adding it changes no other seeded roll
    this.luckRng = createRng((seed ^ 0x9e3779b9) >>> 0);
    this.perkRng = createRng((seed ^ 0x2545f491) >>> 0); // stat perks (core/stat-perks.js), likewise apart
    this.time = 0;
    this.events = [];
    this.nextId = 1;
    this.ch = character ? migrateCharacter(character, data) : createCharacter(data);
    this.monsters = [];
    this.allies = [];
    this.projectiles = [];
    this.areas = [];
    this.drops = [];
    this.decoys = []; // Decoy copies of the hero (core/rogue.js): cosmetic, they draw nothing
    this.spawnPoints = [];
    this.pending = [];
    this.input = { moveX: 0, moveZ: 0, aimAngle: 0, aimPoint: null, aimFromPointer: false, manualAim: false };
    this.stats = { kills: 0, damageDealt: 0 };
    this.combo = 0;
    this.checkT = 0;

    let [sx, sz] = data.world.playerSpawn;
    if (this.ch.pos) {
      // A seam crossing can land beside a tree on the far side: step to the nearest free spot.
      const spot = this.freeSpotNear(this.ch.pos[0], this.ch.pos[1], {allowSeams:true});
      if (this.world.isFree(spot.x, spot.z, PLAYER_RADIUS, {allowSeams:true})) [sx, sz] = [spot.x, spot.z];
    }
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
      shield: 0, // spell shield: taken before HP, recharges after progression.combat.spellShield.rechargeDelay
      maxShield: 0,
      shieldIdle: 0, // seconds since the hero last took damage
      reflect: 0,
      statuses: {},
      buffs: {},
      cooldowns: [0, 0, 0, 0],
      itemCooldowns: {}, // potion group -> seconds left
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
    this.cancelCharge();
    this.cancelChannel();
    const oldMax = { hp: p.maxHp || 1, mp: p.maxMp || 1, shield: p.maxShield || 0 };
    this.derived = derive(this.ch, this.data);
    this.refreshSkills();
    const oldMovementCharges = this.move?.charges || 0;
    this.move = movementSkill(this.ch, this.data, this.derived);
    p.maxHp = this.derived.maxHp;
    p.maxMp = this.derived.maxMp;
    p.maxShield = this.derived.maxShield;
    if (full) {
      p.hp = p.maxHp;
      p.mp = p.maxMp;
      p.shield = p.maxShield;
    } else {
      p.hp = Math.min(p.maxHp, Math.max(1, (p.hp / oldMax.hp) * p.maxHp));
      p.mp = Math.min(p.maxMp, (p.mp / oldMax.mp) * p.maxMp);
      // a newly gained shield starts empty and recharges; an existing one keeps its share
      p.shield = oldMax.shield > 0 ? Math.min(p.maxShield, (p.shield / oldMax.shield) * p.maxShield) : 0;
    }
    p.movement.charges = oldMovementCharges ? Math.min(p.movement.charges, this.move.charges) : this.move.charges;
    if (this.monsters) this.completeQuests(refreshQuests(this.ch, this.data));
  }

  /** Compile loadout changes without re-entering quest rewards or restoring resources. */
  refreshSkills() {
    this.skills = this.ch.slots.map((_, i) => computeSkill(this.ch, this.data, this.derived, i));
    const ranges = this.skills.filter((s) => s && ['melee_arc', 'melee_nova', 'projectile', 'chain', 'dash_line'].includes(s.kind)).map((s) => s.shadowStep ? Math.max(s.range, s.shadowStep.range) : s.range);
    const ground = this.skills.filter((s) => s && ['ground_area', 'dot_zone', 'curse_zone'].includes(s.kind)).map((s) => s.range);
    this.acquireRange = ranges.length ? Math.max(...ranges) : ground.length ? Math.max(...ground) : 6;
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
    const res = this.world.move(e.x, e.z, e.r, dx, dz, { ignoreWater: e.def?.hover, ignoreSlope: e.def?.hover, allowSeams: !!opts.allowSeams });
    let nx = res.x;
    let nz = res.z;
    if (e.kind === 'monster' && this.isSafe(nx, nz)) {
      nx = e.x;
      nz = e.z;
    }
    const wall = wallBlocked(this, e, nx, nz);
    if (wall) { nx=e.x; nz=e.z; res.blocked=true; if(e.kind==='monster'&&e.state==='chase'){e.wallTarget=wall.id;} }
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
    pr.startX=pr.x; pr.startZ=pr.z;
    pr.ground = this.world.surfaceY(pr.x, pr.z);
    this.projectiles.push(pr);
    this.emit({ type: 'projectile', id: pr.id, kind: pr.kind, owner: pr.owner });
    return pr;
  }

  spawnArea(o) {
    const a = { id: this.newId(), t: 0, delay: 0, fired: false, hit: new Set(), nextTick: 0, ...o };
    this.areas.push(a);
    this.emit({ type: 'area', id: a.id, kind: a.kind, owner: a.owner, x: a.x, z: a.z, radius: a.radius, inner: a.inner, delay: a.delay, duration: a.duration });
    return a;
  }

  spawnAllies(s, x, z, exact = false) {
    const sm = s.summon;
    const mine = this.allies.filter((a) => a.type === sm.type && !a.dead);
    while (mine.length >= sm.count) {
      const old = mine.shift();
      old.life = 0;
    }
    for (let i = 0; i < sm.count - mine.length; i++) {
      const a = (i / sm.count) * Math.PI * 2;
      let ax = exact ? x : x + Math.sin(a) * 1.2;
      let az = exact ? z : z + Math.cos(a) * 1.2;
      if (!this.world.isFree(ax, az, 0.6)) {
        ax = x;
        az = z;
      }
      const ally = {
        id: this.newId(),
        kind: 'ally',
        team: 'player',
        type: sm.type,
        static: !!sm.static,
        effects: sm.effects, skill: s.id, tauntRadius:sm.tauntRadius, tauntInterval:sm.tauntInterval, tauntDuration:sm.tauntDuration,
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
  cancelCharge() {
    if (!this.player?.charging) return;
    this.player.charging = null;
    this.emit({ type: 'chargeEnd' });
  }

  cancelChannel() { cancelChannel(this); }

  commandAllies(command, targetId = null) { return commandAllies(this, command, targetId); }

  releaseCharge(i, point = null) {
    const c = this.player.charging;
    if (!c || c.slot !== i) return false;
    const ratio = Math.min(1, c.t / c.skill.charge.duration);
    this.cancelCharge();
    return this.castSlot(i, point, ratio);
  }

  castSlot(i, point = null, chargeRatio = null) {
    const p = this.player;
    if (p.dead) return false;
    if (p.charging || p.channeling) return false;
    const requested = this.skills[i];
    if ((p.cast || p.dash) && (requested?.charge || requested?.channel || chargeRatio !== null)) return false;
    if (p.cast || p.dash) {
      p.queued = { slot: i, point, t: 0.35, manualAngle: this.input.manualAim && !this.input.aimFromPointer ? this.input.aimAngle : null };
      return false;
    }
    const s = this.skills[i];
    if (!s) return false;
    if (!s.requirementsMet) {
      this.emit({ type: 'fail', reason: s.def.requiresOffhand&&this.derived.offhand!==s.def.requiresOffhand ? 'offhand' : s.weaponOk ? 'requires' : 'weapon', slot: i, need: s.def.requiresWeapon });
      return false;
    }
    const counter = s.kind === 'counter_stance' && p.riposte?.skill.id === s.id && p.riposte.readyUntil > this.time;
    if (p.cooldowns[i] > 0 && !counter) {
      // pressed just before the cooldown ends: remember it and cast it the moment it is ready
      if (p.cooldowns[i] <= (this.data.progression.combat.inputBuffer || 0) && !s.charge && !s.channel && chargeRatio === null) {
        p.queued = { slot: i, point, t: p.cooldowns[i] + 0.05, manualAngle: this.input.manualAim && !this.input.aimFromPointer ? this.input.aimAngle : null };
      }
      return false;
    }
    if (p.mp < (counter ? 0 : s.cost)) {
      this.emit({ type: 'fail', reason: 'mp', slot: i });
      return false;
    }
    const arrows = arrowsPerCast(this.data, s);
    if (arrows && arrowTotal(this.ch) < arrows) {
      this.emit({ type: 'fail', reason: 'arrows', slot: i });
      return false;
    }
    if (s.channel) { startChannel(this,s); return true; }
    if (s.charge && chargeRatio === null) {
      p.queued = null;
      p.charging = { slot: i, t: 0, skill: s };
      this.emit({ type: 'chargeStart', slot: i, skill: s.id, weapon: this.derived.weaponType, total: s.charge.duration });
      return true;
    }
    // Backstab (s.shadowStep): the hero steps through the shadows to behind its target, then strikes.
    // It needs a target within shadowStep.range (the locked one, else on a tap the nearest); with none it
    // fails before anything is spent.
    if (s.shadowStep && !this.shadowStep(s)) {
      if (!this.input.aimFromPointer) this.input.manualAim = false; // a drag's aim lasts one press
      this.emit({ type: 'fail', reason: 'target', slot: i });
      return false;
    }
    const directional = ['melee_arc', 'projectile', 'chain', 'melee_nova', 'melee_line', 'dash_line', 'channel_cone', 'counter_stance', 'light_wall', 'steal'].includes(s.kind);
    // Quick/tap attacks ignore facing and pick the closest enemy the skill can actually reach.
    // Pointer aim and touch drag are explicit overrides.
    if (!point && directional && !this.input.manualAim && !s.shadowStep) { // a shadow step already chose its target
      const nearest = nearestTarget(p, this.monsters, s.range);
      const prevTarget = p.targetId;
      p.targetId = nearest ? nearest.id : null;
      if (prevTarget !== p.targetId) this.emit({ type: 'target', id: p.targetId });
    }
    const aim = this.resolveAim(s, point);
    const clearOneShotManualAim = this.input.manualAim && !this.input.aimFromPointer;
    if (clearOneShotManualAim) this.input.manualAim = false;
    p.mp -= counter ? 0 : s.cost;
    p.cooldowns[i] = s.cooldown;
    const perkCastId = perkCast(this, s, i, counter ? 0 : s.cost);
    // proficiency (core/skill-growth.js): a cast in a fight counts at the skill's own pace
    const fightRange = this.data.progression.skillGrowth?.combatRange || 0;
    if (!counter && this.monsters.some((m) => !m.dead && m.targetable !== false && dist(p.x, p.z, m.x, m.z) < fightRange)) {
      const got = gainProficiency(this.ch, this.data, s.id, Math.max(s.cooldown, s.castTime, 0.35));
      if (got) this.emit({ type: 'skillPoint', skill: s.id, points: got });
    }
    if (arrows) {
      const before = arrowInUse(this.ch, this.data);
      spendArrows(this.ch, this.data, arrows);
      const after = arrowInUse(this.ch, this.data);
      this.emit({ type: 'arrows', left: arrowTotal(this.ch), use: after });
      if (after !== before) this.refresh(); // the next type (or none) changes a bow's stats
    }
    // step: which arm the swing comes from; decided now and kept until it lands, so the announced
    // animation and the swing always agree
    let castTime = s.castTime;
    if (p.momentum) { if (this.time <= p.momentum.until) castTime /= 1 + p.momentum.speed; p.momentum = null; }
    const step = s.kind === 'melee_arc' ? this.comboStepAt(this.time + castTime) : 0;
    let castSkill = counter ? { ...s, counterStrike:true } : s.charge ? { ...s, damage: s.damage * (1 + (s.charge.maxDamageMult - 1) * Math.max(0, Math.min(1, chargeRatio || 0))) } : s;
    if (perkCastId) castSkill = { ...castSkill, perkCast: perkCastId }; // INT 50: this cast's own mana return
    p.cast = { slot: i, t: 0, total: castTime, aim, skill: castSkill, step };
    p.facing = aim.angle;
    this.emit({ type: 'castStart', slot: i, skill: s.id, kind: s.kind, angle: aim.angle, x: aim.x, z: aim.z, total: castTime, weapon: this.derived.weaponType, step, ...(s.charge ? { charge: Math.max(0, Math.min(1, chargeRatio || 0)) } : {}) });
    return true;
  }

  /** Backstab: move the player behind its target (else beside, else in front); false without one. */
  shadowStep(s) {
    const p = this.player, r = s.shadowStep.range;
    const locked = this.monsters.find((m) => m.id === p.targetId && !m.dead && m.targetable !== false && dist(p.x, p.z, m.x, m.z) - m.r <= r);
    // an aimed press (a drag on the button, the mouse) takes only the target it picked; a tap falls back to the nearest
    const t = locked || (this.input.manualAim ? null : nearestTarget(p, this.monsters, r));
    if (!t) return false;
    const gap = t.r + (s.shadowStep.gap ?? 0.7), f = t.facing || 0, from = angleTo(t.x, t.z, p.x, p.z);
    // behind the way it faces, then either side, then the side the hero came from
    for (const a of [f + Math.PI, f + Math.PI / 2, f - Math.PI / 2, from]) {
      const x = t.x + Math.sin(a) * gap, z = t.z + Math.cos(a) * gap;
      if (!this.world.isFree(x, z, p.r) || this.isSafe(x, z)) continue;
      this.emit({ type: 'shadowStep', skill: s.id, fromX: p.x, fromZ: p.z, x, z, id: t.id });
      p.x = x; p.z = z;
      p.facing = angleTo(x, z, t.x, t.z);
      if (p.targetId !== t.id) { p.targetId = t.id; this.emit({ type: 'target', id: t.id }); }
      return true;
    }
    return false;
  }

  resolveAim(s, point) {
    const p = this.player;
    const t = this.target;
    let angle = this.input.aimFromPointer ? this.input.aimAngle : p.facing;
    if (['melee_arc', 'projectile', 'chain', 'melee_nova', 'melee_line', 'dash_line', 'channel_cone', 'counter_stance', 'guard_hold', 'light_wall', 'steal'].includes(s.kind)) {
      if (t && dist(p.x, p.z, t.x, t.z) - t.r <= s.range + 0.5) angle = angleTo(p.x, p.z, t.x, t.z);
      return { angle, x: p.x, z: p.z };
    }
    if (aimsAtGround(s)) {
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
    if (!this.ch.movement || !this.ch.movementSkills.includes(this.ch.movement)) return false;
    if (p.dead || p.dash) return false;
    if (p.movement.charges < 1) return false;
    const mv = this.move;
    this.cancelCharge();
    this.cancelChannel();
    p.queued = null;
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
        // a short gather in place (delay, invulnerable) before the body vanishes and reappears at the spot
        const delay = mv.delay || 0;
        p.dash = { t: 0, dur: delay + mv.duration, vx: 0, vz: 0, inv: mv.invulnerable, kind: 'blink', delay, toX: nx, toZ: nz, moved: false };
        if (!delay) this.blinkPlayer(p);
      } else {
        p.dash = { t: 0, dur: mv.duration, vx: 0, vz: 0, inv: mv.invulnerable, kind: 'leap', fromX: p.x, fromZ: p.z, toX: nx, toZ: nz };
      }
    } else {
      const dir = dirFromAngle(angle);
      const speed = mv.distance / mv.duration;
      p.facing = angle;
      p.dash = { t: 0, dur: mv.duration, vx: dir.x * speed, vz: dir.z * speed, inv: mv.invulnerable, kind: mv.id };
    }
    // Momentum: the next cast soon after moving is quicker.
    if (mv.momentum) p.momentum = { until: this.time + mv.duration + mv.momentum.window, speed: mv.momentum.speed };
    perkMovement(this, mv);
    this.emit({ type: 'movement', kind: mv.id, angle });
    return true;
  }

  /** A blink's jump: the body leaves its spot for the aimed one (after the gather, dash.delay). */
  blinkPlayer(p) {
    const d = p.dash;
    this.emit({ type: 'blinkPlayer', fromX: p.x, fromZ: p.z, x: d.toX, z: d.toZ });
    p.x = d.toX;
    p.z = d.toZ;
    d.moved = true;
  }

  /** What the player can interact with right now. */
  nearby() {
    const p = this.player;
    const t = this.data.world.town;
    const workbench = dist(p.x, p.z, t.workbench[0], t.workbench[1]) < INTERACT_RADIUS;
    const trainer = dist(p.x, p.z, t.trainer[0], t.trainer[1]) < INTERACT_RADIUS;
    // Skill/mod training also accepts the real craft workshop; scenery tables are not services.
    let skillUpgrade = workbench || trainer;
    const upgradeStations = t.skillUpgradeStations;
    for (let i = 0; !skillUpgrade && i < (upgradeStations?.length || 0); i++) {
      const [x, z] = upgradeStations[i];
      skillUpgrade = dist(p.x, p.z, x, z) < INTERACT_RADIUS;
    }
    const wp = this.world.waypoints.find((w) => dist(p.x, p.z, w.x, w.z) < WAYPOINT_RADIUS && this.isWaypointUnlocked(w.id));
    const exit = this.world.exits.find((e) => dist(p.x, p.z, e.x, e.z) < e.r && this.data.maps?.[e.to]);
    return {
      exit: exit ? exit.id : null,
      workbench,
      trainer,
      skillUpgrade,
      shop: !!t.shop && dist(p.x, p.z, t.shop[0], t.shop[1]) < INTERACT_RADIUS,
      waypoint: wp ? wp.id : null,
      inTown: this.isSafe(p.x, p.z),
    };
  }

  /** Buy potions from the shopkeeper (only while standing at the shop). */
  buyItem(id, count = 1) {
    if (!this.nearby().shop) return { ok: false, reason: 'far' };
    const r = buyConsumable(this.ch, this.data, id, count);
    if (r.ok) this.emit({ type: 'bought', id, count, cost: r.cost });
    return r;
  }

  /** Drink the potion in quick slot `slot`: restores at once, then its group cools down. */
  useQuickItem(slot) {
    return this.useConsumable(this.ch.quickItems?.[slot]);
  }

  /** Manual and automatic use share stock, restore, group cooldown and death rules. */
  useConsumable(id, { automatic = false } = {}) {
    const p = this.player;
    const def = id && this.data.items.consumables.types[id];
    const fail = (reason) => {
      if (!automatic && reason !== 'empty' && reason !== 'dead') this.emit({ type: 'fail', reason: 'potion_' + reason, item: id });
      return { ok: false, reason };
    };
    if (!def) return fail('empty');
    if (p.dead) return fail('dead');
    if (consumableCount(this.ch, id) < 1) return fail('none');
    if ((p.itemCooldowns[def.group] || 0) > 0) return fail('cooldown');
    const amount = restoreAmount(this.data, id, p.maxHp, p.maxMp, this.derived.potionHealPct);
    const hp = Math.min(amount.hp, p.maxHp - p.hp), mp = Math.min(amount.mp, p.maxMp - p.mp);
    if (hp < 1 && mp < 1) return fail('full');
    p.hp += Math.max(0, hp);
    p.mp += Math.max(0, mp);
    this.ch.consumables[id]--;
    if (this.ch.consumables[id] <= 0) delete this.ch.consumables[id];
    p.itemCooldowns[def.group] = this.data.items.consumables.groupCooldown[def.group] || 0;
    this.emit({ type: 'potion', id, group: def.group, automatic, hp: Math.max(0, Math.round(hp)), mp: Math.max(0, Math.round(mp)), x: p.x, z: p.z });
    return { ok: true, hp, mp };
  }

  useAutomaticPotions() {
    const p = this.player;
    if (p.dead || this.travelled || this.autoPotionTime === this.time) return;
    this.autoPotionTime = this.time;
    for (const group of POTION_GROUPS) {
      const choice = this.ch.autoPotions[group], max = group === 'hp' ? p.maxHp : p.maxMp;
      if (!choice.enabled || !(max > 0) || p[group] >= max || p[group] * 100 > max * choice.threshold || (p.itemCooldowns[group] || 0) > 0) continue;
      const id = automaticPotion(this.ch, this.data, group);
      if (id) this.useConsumable(id, { automatic: true });
    }
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
    return this.arriveIn(exit.to, exit.arrive, exit.nameTh);
  }

  /**
   * Walk off an open seam into the neighbouring map: the same world point, expressed
   * in that map's coordinates (global = local + atlas.offset), without an inward hop.
   */
  crossSeam(seam) {
    const p = this.player;
    const here = this.data.world, there = this.data.maps?.[seam.to];
    const back = there?.atlas?.seams?.find((s) => s.to === here.id);
    if (!back) return { ok: false, reason: 'unknown' };
    if (p.dead) return { ok: false, reason: 'dead' };
    if (this.inCombat()) return { ok: false, reason: 'combat' };
    if(this.world.seamAt(p.x,p.z,p.r)?.to!==seam.to)return {ok:false,reason:'far'};
    if(this.canCrossSeam&&!this.canCrossSeam(seam.to))return {ok:false,reason:'loading'};
    const [hx,hz]=here.atlas.offset,[tx,tz]=there.atlas.offset;
    const x=p.x+hx-tx,z=p.z+hz-tz;
    const destination=this.worlds?.[seam.to];
    if(destination&&!destination.isFree(x,z,p.r,{allowSeams:true}))return {ok:false,reason:'blocked'};
    // Flush discovery on the source world before enterMap swaps its history.
    // An immediate reversal may occur before the normal 0.25 s discovery tick.
    this.checkWorld();
    // Preserve the same world point exactly. Snapshot rounding remains the save
    // format's responsibility; crossing adds no inward hop or coordinate rounding.
    return this.arriveIn(seam.to,[x,z],there.nameTh,true);
  }

  /**
   * Open world: carry on in the neighbouring map in the same session (no reload).
   * Call after a crossing (`travelled`) once the destination world is built; the
   * character already belongs to it. Monsters, shots and drops of the old map end.
   */
  enterWorld(world) {
    const p = this.player, from = this.data.world;
    if (this.travelled !== world.data.id) throw new Error('enterWorld: not travelling to ' + world.data.id);
    selectMap(this.data, world.data.id);
    this.world = world;
    this.travelled = null;
    const spot = this.freeSpotNear(this.ch.pos[0], this.ch.pos[1], {allowSeams:true});
    const [fx, fz] = from.atlas.offset, [tx, tz] = world.data.atlas.offset;
    p.x = spot.x;
    p.z = spot.z;
    p.dash = null;
    p.cast = null;
    p.targetId = null;
    for (const a of this.allies) {
      a.x += fx - tx;
      a.z += fz - tz;
    }
    this.monsters = [];
    this.projectiles = [];
    this.areas = [];
    this.drops = [];
    this.decoys = [];
    this.spawnPoints = [];
    this.zoneId = world.zoneAt(p.x, p.z).id;
    this.spawnMonsters();
    this.emit({ type: 'worldChanged', from: from.id, to: world.data.id, shift: [fx - tx, fz - tz] });
    this.completeQuests(refreshQuests(this.ch, this.data));
  }

  arriveIn(to, pos, name, seam = false) {
    enterMap(this.ch, this.data, to, pos);
    this.travelled = to; // the character now belongs to the destination map
    this.emit({ type: 'travel', to, name, seam });
    return { ok: true, character: this.ch, to };
  }

  /** Arrows are crafted anywhere, but not mid-fight. */
  craftArrows(recipeId) {
    const r = this.data.recipes.recipes[recipeId];
    if (r?.type !== 'arrow') return { ok: false, reason: 'unknown' };
    if (this.player.dead) return { ok: false, reason: 'dead' };
    if (this.inCombat()) return { ok: false, reason: 'combat' };
    const before = arrowInUse(this.ch, this.data);
    const result = craft(this.ch, this.data, recipeId, this.rng);
    if (result.ok) {
      this.emit({ type: 'arrows', left: arrowTotal(this.ch), use: arrowInUse(this.ch, this.data), crafted: result.qty });
      if (arrowInUse(this.ch, this.data) !== before) this.refresh();
    }
    return result;
  }

  /** Fast travel to a discovered waypoint. */
  teleportTo(id, mapId = this.data.world.id) {
    const p = this.player;
    if (mapId !== this.data.world.id) {
      // A stone on another map of the same world: travel there (in place when streamed).
      const map = this.data.maps?.[mapId], stone = map?.waypoints.find((w) => w.id === id);
      if (!stone) return { ok: false, reason: 'unknown' };
      if (!waypointUnlocked(this.ch, this.data, mapId, id)) return { ok: false, reason: 'locked' };
      if (p.dead) return { ok: false, reason: 'dead' };
      if (this.inCombat()) return { ok: false, reason: 'combat' };
      return this.arriveIn(mapId, [stone.pos[0], stone.pos[1] + 2.2], stone.nameTh);
    }
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

  freeSpotNear(x, z, options = {}) {
    const radius=options.allowSeams&&this.world.seamAt(x,z,PLAYER_RADIUS)?PLAYER_RADIUS:PLAYER_RADIUS+.1;
    for (let r = 0; r < 6; r += 0.5)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const tx = x + Math.sin(a) * r;
        const tz = z + Math.cos(a) * r;
        if (this.world.isFree(tx, tz, radius, options)) return { x: tx, z: tz };
      }
    return { x, z };
  }

  // ---------- quests / progress ----------

  notify(ev) {
    if (ev.type === 'craft') this.ch.progress.crafted = (this.ch.progress.crafted || 0) + 1;
    this.completeQuests(questEvent(this.ch, this.data, ev));
  }

  completeQuests(ids) {
    let learnedSkill = false;
    for (const id of ids) {
      const q = this.data.quests.quests[id];
      const r = q.reward || {};
      const received = { gold: r.gold || 0, items: { ...(r.items || {}) }, skills: [] };
      if (r.gold) this.ch.gold += r.gold;
      for (const [item, n] of Object.entries(r.items || {})) addItem(this.ch, item, n);
      for (const skill of r.skills || []) {
        // a quest-taught skill goes into the first empty slot so it is seen at once
        if (this.ch.skills[skill] || !this.data.skills.combat[skill]) continue;
        this.ch.skills[skill] = 1;
        received.skills.push(skill);
        learnedSkill = true;
        const empty = this.ch.slots.find((s) => !s.skill);
        if (empty) empty.skill = skill;
      }
      const before = { level: this.ch.level, exp: this.ch.exp, jobLevel: this.ch.jobLevel, jobExp: this.ch.jobExp };
      const gained = addExp(this.ch, this.data, r.exp || 0, r.jobExp || 0);
      received.exp = this.ch.exp - before.exp;
      for (let lv = before.level; lv < this.ch.level; lv++) received.exp += expToNext(this.data, lv);
      received.jobExp = this.ch.jobExp - before.jobExp;
      for (let lv = before.jobLevel; lv < this.ch.jobLevel; lv++) received.jobExp += jobExpToNext(this.data, lv);
      recordQuestCompletion(this.ch, this.data, id, received);
      this.emit({ type: 'questDone', id, reward: received });
      if (gained.levels) this.onLevelUp();
      if (gained.jobLevels) this.emit({ type: 'joblevelup', level: this.ch.jobLevel });
    }
    if (learnedSkill) this.refreshSkills();
  }

  onLevelUp() {
    const p = this.player;
    this.refresh();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.shield = p.maxShield;
    this.emit({ type: 'levelup', level: this.ch.level });
  }

  // ---------- combat ----------

  rollCrit() {
    return this.rng.chance(this.derived.critChance);
  }

  playerDamageMult() {
    const p = this.player;
    let rage = 0;
    // Boiling Blood: from nothing at full HP up to rage.max at rage.atHp of max HP or below
    for (const k in p.buffs) { const r = p.buffs[k].rage; if (r) rage += r.max * Math.min(1, Math.max(0, (1 - p.hp / p.maxHp) / (1 - r.atHp))); }
    return 1 + buffSum(p.buffs, 'damage') + rage;
  }

  /** Damage to a monster from the player, an ally or a damage-over-time effect. */
  hitMonster(m, amount, opts = {}) {
    if (m.dead) return 0;
    const hpBefore = Math.max(0, m.hp);
    let dmg = adjustFrontierHit(this,m,amount,opts);
    if(m.dead)return 0;
    let crit = opts.crit ?? false;
    // Stealth: the first hit out of hiding is a sure critical, and it ends the hiding (core/rogue.js)
    if (!opts.byAlly && !opts.dot && this.player.stealthT > 0) { crit = true; reveal(this, 'attack'); }
    // stat perks (core/stat-perks.js) on the hero's own skill hits
    const perk = this.derived.perks && opts.skill && !opts.dot && !opts.byAlly ? perkHit(this, m, opts, crit) : null;
    if (perk) { dmg *= perk.mult; crit = perk.crit; }
    if (crit) dmg *= this.derived.critMult * (perk ? perk.critMult : 1);
    const stagger = opts.stagger || 0;
    // Penetration ignores a share of the monster's defense.
    const def = m.defense * (1 - (m.statuses.exposure?.fraction || 0)) * (1 - (this.derived.penetrationPct || 0) / 100) * (1 - (opts.modEffects?.penetrate || 0) / 100) * (1 - (perk?.penetrate || 0)); // Piercing Line: a mod's own share
    if (!opts.dot) dmg *= defenseFactor(def, this.data);
    if (m.shell) dmg *= m.def.attacks.shell.damageTaken;
    if (m.state === 'emerge') dmg *= m.def.attacks.shell.emergeDamageTaken;
    if (m.statuses.hex) dmg *= m.statuses.hex.taken;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.hurtT = 0.18;
    // flinch: regular monsters stop for a moment (a started wind-up still goes off)
    // a plain hit flinches a monster at most once per flinchLock (a heavy hit's own stagger always does),
    // so rapid light hits cannot hold it in place
    const combat = this.data.progression.combat;
    if (!opts.dot && !m.boss && (stagger || this.time >= (m.flinchReady || 0))) {
      m.staggerT = Math.max(m.staggerT || 0, stagger || (combat?.stagger ?? 0.14));
      if (!stagger) m.flinchReady = this.time + (combat?.flinchLock || 0);
    }
    this.stats.damageDealt += dmg;
    this.emit({ type: 'hit', id: m.id, amount: dmg, crit, heavy: !!stagger, skill: opts.skill, attackKind: opts.attackKind, fromX: opts.fromX ?? this.player.x, fromZ: opts.fromZ ?? this.player.z, element: opts.element || 'physical', bleed: !!opts.bleed, dot: !!opts.dot, shell: m.shell, byAlly: !!opts.byAlly, x: m.x, z: m.z });
    if (!opts.dot) {
      onMonsterHit(this, m, opts.by);
      chargeShock(this, m, opts); // Thunder Slash's charge: a main skill's hit shocks it
      if(!opts.byAlly&&!opts.secondary)this.player.lastHitTarget=m.id;
      if (opts.chill&&!opts.consumedChill) m.statuses.chill = { slow: opts.chill.slow, t: opts.chill.duration };
      if (opts.burnChance && this.rng.chance(opts.burnChance)) m.statuses.burn = { dps: amount * 0.15, t: 3, acc: 0, owner:'player' };
      const pc = this.derived.poisonChancePct / 100;
      // a passive poison proc never replaces Venom Arrow's stacked poison
      if (pc > 0 && !opts.byAlly && !m.statuses.poison?.stacks && this.rng.chance(pc)) m.statuses.poison = { dps: amount * 0.12, t: 4, acc: 0 };
      if (opts.knock && m.hp > 0) {
        const a = angleTo(opts.fromX ?? this.player.x, opts.fromZ ?? this.player.z, m.x, m.z);
        const d = dirFromAngle(a);
        const k = opts.knock * (m.boss ? 0.2 : m.def.flyer ? 0.6 : 1);
        this.moveEntity(m, d.x * k, d.z * k);
        if (!m.boss && m.state === 'windup') m.stateT = Math.max(0, m.stateT - 0.25); // knocks the rhythm back a little
      }
      if (opts.leech && !opts.byAlly) this.healPlayer((Math.min(dmg, hpBefore) * opts.leech) / 100, true);
      // Fighting Spirit: HP (a share of the damage) and MP back on each hit, for the hero and for an ally
      const by = opts.byAlly ? opts.by : this.player, spiritLeech = by?.buffs ? buffSum(by.buffs, 'leech') : 0;
      if (spiritLeech > 0) { const back = (Math.min(dmg, hpBefore) * spiritLeech) / 100; if (opts.byAlly) by.hp = Math.min(by.maxHp, by.hp + back); else this.healPlayer(back, true); }
      if (!opts.byAlly && buffSum(this.player.buffs, 'mpHit') > 0) this.player.mp = Math.min(manaLimit(this), this.player.mp + buffSum(this.player.buffs, 'mpHit'));
      // an attack gains MP for each enemy it hits (s.mpOnHit: gear, the MP line, a mod)
      if (opts.mpOnHit && !opts.byAlly) this.player.mp = Math.min(manaLimit(this), this.player.mp + opts.mpOnHit);
      if (perk) perkAfterHit(this, m, dmg, opts, crit);
    } else setAggro(this, m, this.player);
    if (m.hp <= 0) this.killMonster(m);
    return dmg;
  }

  killMonster(m) {
    if(m.dead)return;
    spreadCurse(this,m);
    // Killed during a wind-up: the attack it was marking never comes, so its pending areas go too
    // (an attack already launched, like a boulder in flight, still lands).
    if (m.state === 'windup') {
      this.areas = this.areas.filter((a) => {
        const cancel = a.owner === 'monster' && a.sourceId === m.id && a.t < a.delay;
        if (cancel) this.emit({ type: 'areaEnd', id: a.id });
        return !cancel;
      });
    }
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
    const drops = m.minion ? rollDrops(this.data, m.type, m.zone, this.rng, {}, m.worldId).filter((d) => d.item === 'gold') : rollDrops(this.data, m.type, m.zone, this.rng, this.derived, m.worldId);
    if (this.derived.perks) {
      perkKill(this, m);
      drops.push(...perkDrops(this, m));
    }
    drops.forEach((d, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2 + this.rng.range(0, 1);
      const r = this.rng.range(0.6, 1.4);
      const drop = { id: this.newId(), item: d.item, qty: d.qty, x: m.x + Math.sin(a) * r, z: m.z + Math.cos(a) * r, t: 0, worldId: m.worldId };
      this.drops.push(drop);
      this.emit({ type: 'drop', id: drop.id, item: drop.item, fromX: m.x, fromZ: m.z });
    });
    // Gear from the monster's own parts, at its level's tier; rare except from bosses.
    const gear = m.minion ? null : rollGearDrop(this.data, m.type, m.level, m.boss, this.rng, this.derived.gearFindPct);
    if (gear) {
      const drop = { id: this.newId(), item: 'gear', gear, qty: 1, x: m.x, z: m.z, t: 0, worldId: m.worldId };
      this.drops.push(drop);
      this.emit({ type: 'drop', id: drop.id, item: 'gear', base: gear.base, grade: gear.grade, fromX: m.x, fromZ: m.z });
    }
    const gained = addExp(this.ch, this.data, m.exp, m.jobExp);
    this.emit({ type: 'exp', exp: m.exp, jobExp: m.jobExp, x: m.x, z: m.z });
    if (gained.levels) this.onLevelUp();
    if (gained.jobLevels) this.emit({ type: 'joblevelup', level: this.ch.jobLevel });
    prog.kills[m.type] = (prog.kills[m.type] || 0) + 1;
    if (m.boss) {
      const id = m.spawn.bossId || m.type;
      prog.bossKills[id] = (prog.bossKills[id] || 0) + 1;
      if (m.spawn.final) this.ch.bossKills++;
      this.emit({ type: 'bossDefeated', boss: id, world: m.worldId || this.data.world.id, name: m.def.name, final: !!m.spawn.final, first: prog.bossKills[id] === 1 });
    }
    this.notify({ type: 'kill', target: m.type, world: m.worldId });
    if (!m.minion) {
      m.spawn.respawnAt = this.time + m.spawn.respawn;
      m.spawn.entity = null;
    }
  }

  /** Damage from a monster to the player or an ally. */
  damageUnit(unit, amount, source, opts = {}) {
    if (source?.statuses?.hex) amount *= source.statuses.hex.dealt;
    amount *= coverMult(this, unit, source); // Shield Fortress, Wall of Faith
    if (unit.kind === 'ally') return this.damageAlly(unit, amount, source);
    return this.damagePlayer(amount, source, opts);
  }

  damageAlly(a, amount, source) {
    if (a.dead) return 0;
    let dmg = Math.max(1, Math.round(amount * 0.85 * buffTaken(a.buffs)));
    if(a.barrier>0){const absorbed=Math.min(a.barrier,dmg);a.barrier-=absorbed;dmg-=absorbed;if(a.barrier<=0)breakBarrier(this,a);}
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
      perkDodge(this, true);
      return 0;
    }
    if (perkInvulnerable(this)) return 0; // LUK's narrow escape
    // LUK: a lucky dodge, a monster hit that misses entirely (never damage over time)
    if (!opts.dot && this.derived.dodgeChancePct > 0 && this.luckRng.chance(this.derived.dodgeChancePct / 100)) {
      this.emit({ type: 'dodge', x: p.x, z: p.z, lucky: true });
      perkDodge(this, false);
      return 0;
    }
    const guard=applyGuard(this,amount,source,opts);
    // Shield Fortress takes the whole hit on the shield: no damage, no knockback
    if (guard.full) {
      this.emit({ type: 'playerHit', amount: 0, absorbed: 0, shielded: 0, blocked: true, x: p.x, z: p.z });
      if (p.hp > 0) this.fireTriggers('on_guard');
      return 0;
    }
    let dmg = (opts.dot?guard.amount:shareGuardDamage(this,guard.amount)) * defenseFactor(this.derived.defense, this.data) * (1 + this.derived.damageTakenPct / 100) * buffTaken(p.buffs) * perkTaken(this);
    let blocked = guard.guarded;
    // A shield blocks hits from in front only; ground hazards (no source) are never blocked.
    if (this.derived.blockChance > 0 && source && source.x !== undefined && !opts.unblockable) {
      const rules = this.data.progression.combat.block;
      const a = angleTo(p.x, p.z, source.x, source.z), off = Math.abs(Math.atan2(Math.sin(a - p.facing), Math.cos(a - p.facing)));
      if (off <= (rules.arcDeg * Math.PI) / 360 && this.rng.chance(this.derived.blockChance)) {
        blocked = true;
        dmg *= rules.taken;
      }
    }
    dmg = Math.max(1, Math.round(dmg));
    let absorbed = 0;
    if (p.barrier > 0) {
      absorbed = Math.min(p.barrier, dmg);
      p.barrier -= absorbed;
      dmg -= absorbed;
      if (p.reflect > 0 && source && source.kind === 'monster' && !source.dead) this.hitMonster(source, absorbed * p.reflect + 4, { element: 'physical' });
    }
    if(absorbed>0&&p.barrier<=0)breakBarrier(this,p);
    const shielded = this.drainShield(dmg);
    dmg -= shielded;
    p.hp -= dmg;
    if (dmg > 0) reveal(this, 'hit');
    perkAfterTaken(this, dmg); // VIT's barrier; a lethal hit may be survived
    if(blocked&&p.hp>0)this.fireTriggers('on_guard');
    p.hurtT = 0.25;
    this.emit({ type: 'playerHit', amount: dmg, absorbed, shielded, blocked, x: p.x, z: p.z });
    if (opts.poison) p.statuses.poison = { dps: opts.poison.dps, t: opts.poison.duration, acc: 0 };
    if (opts.knock && dmg > 0 && !perkSteady(this) && !Object.values(p.buffs).some((b) => b.steady)) {
      this.cancelCharge();
      this.cancelChannel();
      const d = dirFromAngle(opts.knock.angle);
      this.moveEntity(p, d.x * opts.knock.force * 0.3, d.z * opts.knock.force * 0.3);
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.respawnT = 4;
      this.cancelCharge();
      this.cancelChannel();
      p.auras={}; p.riposte=null;
      p.cast = null;
      p.dash = null;
      p.targetId = null;
      this.ch.progress.deaths = (this.ch.progress.deaths || 0) + 1;
      this.emit({ type: 'playerDeath' });
    }
    return dmg;
  }

  /** The spell shield takes what it can of `amount` (after armour and barrier) and stops recharging for a while. */
  drainShield(amount) {
    const p = this.player;
    p.shieldIdle = 0;
    if (!(p.shield > 0) || amount <= 0) return 0;
    const taken = Math.min(p.shield, amount);
    p.shield -= taken;
    if (p.shield <= 0) {
      p.shield = 0;
      this.emit({ type: 'shieldBreak', x: p.x, z: p.z });
    }
    return taken;
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
    return { skill: s.id, attackKind: s.kind, element: s.element, chill: s.chill, burnChance: s.burnChance, knock: s.knock, leech: s.leech, mpOnHit: s.mpOnHit, exposure:s.exposure, stun:s.stun, poison:s.poison, taunt:s.taunt, shock:s.shock, shockCharge:s.shockCharge, root:s.root, bleed:s.bleed, modEffects:s.modEffects, tags:s.tags, perkCast:s.perkCast, ...extra, ...(s.noCrit ? NO_CRIT : null) };
  }

  /** The combo step (0, 1: which arm side) a melee swing landing at time t would be. */
  comboStepAt(t) {
    const p = this.player;
    const window = this.data.progression.combat?.comboWindow ?? 1.1;
    return t - (p.lastSwingT ?? -9) < window ? ((p.comboStep || 0) + 1) % 2 : 0;
  }

  /** Execute a computed skill. mult scales damage (triggers, echoes, repeats). */
  executeSkill(s, aim, opts = {}) {
    this.runSkill(s, aim, opts);
  }

  runSkill(s, aim, { mult = 1, triggered = false, repeat = 0, step = null } = {}) {
    const p = this.player;
    mult *= this.playerDamageMult();
    const crit = () => this.rollCrit();
    const effects=s.modEffects || {};
    if(effects.advance && !triggered && repeat===0)this.moveEntity(p,Math.sin(aim.angle)*effects.advance,Math.cos(aim.angle)*effects.advance);
    if(executeFrontier(this,s,aim,mult,triggered))return;
    switch (s.kind) {
      case 'melee_arc': {
        const arc = s.arc * DEG;
        let hits = 0;
        // swings in a row alternate the arm (combo step, for the animation); every swing is the same
        // plain strike: no third-hit finisher bonus or knockback
        if (!triggered && repeat === 0) {
          p.comboStep = step ?? this.comboStepAt(this.time);
          p.lastSwingT = this.time;
        }
        for (const m of this.monsters) {
          if (m.dead) continue;
          const d = dist(p.x, p.z, m.x, m.z) - m.r;
          if (d > s.range) continue;
          const off = Math.abs(angleDiff(aim.angle, angleTo(p.x, p.z, m.x, m.z)));
          if (off > arc / 2 && d > 0.3) continue;
          this.hitMonster(m, s.damage * mult, this.hitOpts(s, { crit: crit() }));
          hits++;
        }
        if (hits && this.derived.meleeHitBarrier) {
          p.barrier = Math.min(p.maxHp * 0.5, p.barrier + this.derived.meleeHitBarrier * hits);
          p.barrierT = Math.max(p.barrierT, 3);
        }
        this.emit({ type: 'slash', skill: s.id, x: p.x, z: p.z, angle: aim.angle, arc: s.arc, range: s.range, element: s.element, triggered, combo: this.combo++, step: p.comboStep || 0, hits });
        if (repeat < s.repeats) this.later(s.repeatDelay, () => !p.dead && this.executeSkill(s, { ...aim, angle: p.facing }, { mult: s.repeatMult, repeat: repeat + 1 }));
        return;
      }
      case 'melee_nova': {
        for (const m of this.monsters) {
          if (m.dead || dist(p.x, p.z, m.x, m.z) - m.r > s.radius) continue;
          this.hitMonster(m, s.damage * mult, this.hitOpts(s, { crit: crit() }));
        }
        this.emit({ type: 'whirl', skill: s.id, x: p.x, z: p.z, radius: s.radius, angle: p.facing, element: s.element });
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
        // a volley (base repeats) fires again along the current facing, without a new cast or arrow
        if (repeat < s.repeats) this.later(s.repeatDelay, () => !p.dead && this.executeSkill(s, { ...aim, angle: p.facing }, { mult: s.repeatMult, repeat: repeat + 1, triggered }));
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
        const first=cur;
        let dmg = s.damage * mult;
        for (let i = 0; i <= s.chain && cur; i++) {
          points.push([cur.x, cur.z]);
          hit.add(cur.id);
          const target = cur;
          // the nearest unhit monster jumps next; Forking Arc also strikes the second nearest
          let next = null, fork = null;
          let nd = s.chainRange || 6, fd = nd;
          for (const m of this.monsters) {
            if (m.dead || hit.has(m.id)) continue;
            const d = dist(target.x, target.z, m.x, m.z);
            if (d < nd) {
              fork = next; fd = nd;
              nd = d;
              next = m;
            } else if (d < fd) { fd = d; fork = m; }
          }
          // Arresting Arc: the last monster the chain reaches is stunned
          const last = i === s.chain || !next;
          this.hitMonster(target, dmg, this.hitOpts(s, last && effects.chainStun ? { crit: crit(), stun: { duration: effects.chainStun, bossDuration: effects.chainStunBoss } } : { crit: crit() }));
          if (effects.forkMult && fork) {
            hit.add(fork.id);
            this.hitMonster(fork, dmg * effects.forkMult, this.hitOpts(s, { crit: crit() }));
            this.emit({ type: 'chain', from: true, points: [[target.x, target.z], [fork.x, fork.z]], element: s.element });
          }
          dmg *= s.chainFalloff;
          cur = next;
        }
        if(effects.chainReturn && first && !first.dead){this.hitMonster(first,s.damage*mult*effects.chainReturn,this.hitOpts(s,{crit:crit()}));points.push([first.x,first.z]);}
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
          this.emit({ type: 'nova', skill: s.id, x: p.x, z: p.z, radius: s.radius, element: s.element });
        };
        blast(1);
        if (s.echo) this.later(s.echo.delay, () => !p.dead && blast(s.echo.mult));
        return;
      }
      case 'dot_zone': {
        if(effects.followField)this.areas=this.areas.filter(a=>a.skill?.slot!==s.slot||!a.follow);
        const make = (delay, k) =>
          this.spawnArea({ owner: 'player', kind: s.id, skill: s, x: aim.x, z: aim.z, radius: s.radius, delay, duration: s.duration, tick: s.tick, damage: s.damage * mult * s.tick * k, element: s.element, slow: s.slow, dot: true, follow:!!effects.followField, dwell:new Map() });
        make(0, 1);
        if (s.echo) make(s.echo.delay, s.echo.mult);
        return;
      }
      case 'curse_zone': {
        const curse = () => {
          for (const m of this.monsters) {
            if (m.dead || dist(aim.x, aim.z, m.x, m.z) - m.r > s.radius) continue;
            m.statuses.hex = { t: Math.max(m.statuses.hex?.t||0,s.duration), taken: Math.max(m.statuses.hex?.taken||1,s.takenMult), dealt: Math.min(m.statuses.hex?.dealt||1,s.dealtMult), spread:effects.curseSpread||0 };
            setAggro(this, m, p);
          }
          this.emit({ type: 'curse', x: aim.x, z: aim.z, radius: s.radius });
        };
        curse();
        if (s.echo) this.later(s.echo.delay, curse);
        return;
      }
      case 'heal_zone': {
        if(effects.followField)this.areas=this.areas.filter(a=>a.skill?.slot!==s.slot||!a.follow);
        this.spawnArea({ owner: 'player', kind: s.id, skill: s, x: aim.x, z: aim.z, radius: s.radius, delay: 0, duration: s.duration, tick: s.tick, heal: s.heal * mult * s.tick, element: 'none', follow:!!effects.followField });
        if (s.echo) this.spawnArea({ owner: 'player', kind: s.id, skill: s, echo: true, x: aim.x, z: aim.z, radius: s.radius, delay: s.echo.delay + s.duration * 0.5, duration: s.duration, tick: s.tick, heal: s.heal * mult * s.tick * s.echo.mult, element: 'none' });
        return;
      }
      case 'self_barrier': {
        const barrier = s.barrier * (triggered ? s.trigger?.damageMult ?? 1 : 1);
        p.barrier = Math.max(p.barrier, barrier);
        p.barrierT = s.duration;
        p.reflect = s.reflect;
        p.barrierBreak=effects.barrierBreakKnock?{knock:effects.barrierBreakKnock,radius:effects.barrierBreakRadius}:null;
        for (const a of this.allies) if (!a.dead && dist(a.x, a.z, p.x, p.z) < s.radius) a.hp = Math.min(a.maxHp, a.hp + barrier * 0.5);
        if (s.tauntRadius) for (const m of this.monsters) if (!m.dead && dist(p.x, p.z, m.x, m.z) < s.tauntRadius) setAggro(this, m, p, true);
        this.emit({ type: 'ward', x: p.x, z: p.z, amount: Math.round(p.barrier), reflect: s.reflect > 0, radius: s.radius });
        return;
      }
      case 'buff': {
        // each buff skill keeps its own entry, so different buffs stack and the same one refreshes
        // rage: more damage the lower the hero's HP (Boiling Blood); leech/mpHit: HP and MP back on each hit (Fighting Spirit)
        const buff = { t: s.duration, damage: s.damageBuff, speed: s.speedBuff, taken: s.takenMult, steady: s.steady, rage: s.rage, leech: s.spirit?.leech, mpHit: s.spirit?.mp };
        p.buffs[s.id] = { ...buff };
        for (const a of this.allies) if (!a.dead && dist(a.x, a.z, p.x, p.z) < s.radius) a.buffs[s.id] = { ...buff };
        // Provoke: the monsters round the hero turn on it
        if (s.taunt?.radius) for (const m of this.monsters) if (!m.dead && dist(p.x, p.z, m.x, m.z) - m.r <= s.taunt.radius) { m.forcedTargetId = p.id; m.tauntT = Math.max(m.tauntT || 0, s.taunt.duration); setAggro(this, m, p, true); }
        this.emit({ type: 'buff', kind: s.id, x: p.x, z: p.z, radius: s.radius });
        return;
      }
      case 'summon': {
        // a summon set at the aim point (Lure Dummy) stands where it is put, within the skill's range
        if (s.summon.placeAt === 'aim') { const d = Math.min(s.range || 0, dist(p.x, p.z, aim.x, aim.z)), a = angleTo(p.x, p.z, aim.x, aim.z); this.spawnAllies(s, p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, true); return; }
        this.spawnAllies(s, p.x - Math.sin(p.facing) * 1.2, p.z - Math.cos(p.facing) * 1.2);
        return;
      }
    }
  }

  // ---------- update ----------

  update(dt, { paused = false, allowAutoPotions = true } = {}) {
    if (paused) return;
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
    if (this.travelled) return; // the character belongs to the next map: the old one stops
    tickFrontier(this,dt);
    this.updatePlayer(dt);
    if (this.travelled) return; // crossed this frame: no world checks against the old map
    const p = this.player;
    const idleRadius = this.simulationRadius ?? AI_RADIUS;
    for (const m of this.monsters) {
      if (m.dead) {
        m.deathT += dt;
        continue;
      }
      if (!m.aggro && (Math.abs(m.x - p.x) > idleRadius || Math.abs(m.z - p.z) > idleRadius)) continue; // asleep far away
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
    if (dt > 0 && allowAutoPotions) this.useAutomaticPotions();
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
        p.shield = p.maxShield;
        p.statuses = {};
        p.buffs = {};
        p.barrier = 0;
        this.emit({ type: 'respawn', x: p.x, z: p.z });
      }
      return;
    }
    p.hurtT = Math.max(0, p.hurtT - dt);
    const inTown = this.isSafe(p.x, p.z);
    p.hp = Math.min(p.maxHp, p.hp + (this.derived.hpRegen * perkRegen(this) + (inTown ? p.maxHp * 0.08 : 0)) * dt);
    p.mp = Math.min(manaLimit(this), p.mp + (this.derived.mpRegen + (inTown ? p.maxMp * 0.08 : 0)) * dt);
    const ss = this.data.progression.combat.spellShield;
    p.shieldIdle += dt;
    const flow = perkShield(this); // INT 100: sooner and faster
    if (p.shield < p.maxShield && p.shieldIdle >= ss.rechargeDelay * (flow?.delay ?? 1)) p.shield = Math.min(p.maxShield, p.shield + (p.maxShield * ss.rechargePctPerSecond / 100) * (flow?.rate ?? 1) * dt);
    for (const k in p.itemCooldowns) p.itemCooldowns[k] = Math.max(0, p.itemCooldowns[k] - dt);
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
      if (p.dash.kind === 'blink' && !p.dash.moved && p.dash.t >= p.dash.delay) this.blinkPlayer(p);
      if (p.dash.kind === 'leap') {
        const k = Math.min(1, p.dash.t / p.dash.dur);
        p.x = p.dash.fromX + (p.dash.toX - p.dash.fromX) * k;
        p.z = p.dash.fromZ + (p.dash.toZ - p.dash.fromZ) * k;
      } else if (p.dash.vx || p.dash.vz) {
        const step = Math.min(dt, p.dash.dur - (p.dash.t - dt)); // the last frame moves only what is left: a dash goes its distance exactly
        const moved = this.moveEntity(p, p.dash.vx * step, p.dash.vz * step);
        if (moved.blocked && p.dash.kind === 'shield_rush') p.dash.blocked = true;
      }
      if (p.dash.kind === 'shield_rush') {
        rushContact(this, p.dash); // Line Breaker hits what it runs into
        if (p.dash.blocked) p.dash.t = p.dash.dur; // a wall or a cliff ends the charge: no sliding along it off the lane
      }
      if (p.dash.t >= p.dash.dur) {
        const d = p.dash;
        p.dash = null;
        if (d.kind === 'leap' && this.move.landing) {
          const L = this.move.landing;
          for (const m of this.monsters) if (!m.dead && dist(p.x, p.z, m.x, m.z) - m.r <= L.radius) this.hitMonster(m, L.damage * this.playerDamageMult(), { element: 'physical', crit: this.rollCrit(), knock: 1.2, fromX: p.x, fromZ: p.z });
          this.emit({ type: 'burst', kind: 'leap', element: 'physical', x: p.x, z: p.z, radius: L.radius });
        }
        // Blink Draw: the lane the hero just crossed is cut on arrival; a skill's dash is no dodge
        if (d.kind === 'draw_cut') {
          // the anime beat: the hero arrives, a breath, then the lane falls apart (cutDelay)
          const len = dist(d.fromX, d.fromZ, p.x, p.z);
          this.emit({ type: 'dashArrive', skill: d.skill.id, x: p.x, z: p.z, angle: d.angle, delay: d.skill.cutDelay || 0 });
          if (d.skill.cutDelay) this.later(d.skill.cutDelay, () => strikeLane(this, d.skill, d.fromX, d.fromZ, d.angle, len, d.mult));
          else strikeLane(this, d.skill, d.fromX, d.fromZ, d.angle, len, d.mult);
        }
        else if (d.kind === 'shield_rush') this.emit({ type: 'dashArrive', skill: d.skill.id, x: p.x, z: p.z, angle: d.angle, delay: 0, stopped: !!d.stopped });
        else this.fireTriggers('on_movement');
      }
      return;
    }

    const mx = this.input.moveX;
    const mz = this.input.moveZ;
    const mlen = Math.hypot(mx, mz);
    const chill = p.statuses.chill ? 1 - p.statuses.chill.slow : 1;
    const haste = 1 + buffSum(p.buffs, 'speed');
    const speed = this.derived.moveSpeed * (p.charging ? p.charging.skill.charge.moveMult : p.channeling ? p.channeling.skill.channel.moveMult : p.cast ? 0.4 : 1) * chill * haste;
    p.moving = mlen > 0.08;
    if (p.moving) {
      this.moveEntity(p, mx * speed * dt, mz * speed * dt, {allowSeams:true});
      // Pressing on against an open seam walks on into the neighbouring map.
      const seam = this.world.seams.length ? this.world.seamAt(p.x, p.z, p.r) : null;
      if (seam && !this.travelled && (seam.alongX ? mz : mx) * seam.outward > 0.3 * mlen) {
        const crossed = this.crossSeam(seam);
        if (!crossed.ok && this.time - (this.seamNoticeT ?? -9) > 3) {
          this.seamNoticeT = this.time;
          this.emit({ type: 'travelRefused', reason: crossed.reason });
        }
        if (crossed.ok) return;
      }
      if (!p.cast && !p.charging && !p.channeling) {
        const a = Math.atan2(mx, mz);
        p.facing += clamp(angleDiff(p.facing, a), -14 * dt, 14 * dt);
      }
    }

    const aimAngle = this.input.aimFromPointer ? this.input.aimAngle : p.moving ? Math.atan2(mx, mz) : p.facing;
    if (!this.input.aimFromPointer && !p.moving) this.input.aimAngle = p.facing;
    const prev = p.targetId;
    p.targetId = softTarget(p, this.monsters, aimAngle, this.acquireRange, { preferNearest: !this.input.manualAim });
    if (prev !== p.targetId) this.emit({ type: 'target', id: p.targetId });

    if (p.charging) {
      const c = p.charging;
      if (!this.skills[c.slot]?.requirementsMet || this.skills[c.slot].id !== c.skill.id) this.cancelCharge();
      else {
        c.t = Math.min(c.skill.charge.duration, c.t + dt);
        p.facing = this.resolveAim(c.skill, null).angle;
      }
    }
    if (p.cast) {
      if(p.cast.skill.aimDuringCast)p.cast.aim=this.resolveAim(p.cast.skill,null);
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
      if (!s || !s.requirementsMet || !s.trigger || s.trigger.on !== on || p.triggerCd[i] > 0 || this.triggering) return;
      if(s.trigger.cost&&p.mp<s.cost)return;
      p.triggerCd[i] = s.trigger.icd;
      let aim;
      if (aimsAtGround(s)) aim = { angle: p.facing, x: p.x, z: p.z };
      else aim = this.resolveAim(s, null);
      this.emit({ type: 'trigger', slot: i, skill: s.id });
      if(s.trigger.cost)p.mp-=s.cost;
      this.triggering=true;
      try {this.executeSkill(s, aim, { mult: s.trigger.damageMult, triggered: true });} finally {this.triggering=false;}
    });
  }

  tickStatuses(m, dt) {
    for (const k of ['burn', 'poison','bleed']) {
      const st = m.statuses[k];
      if (!st) continue;
      st.t -= dt;
      st.acc += st.dps * dt;
      if (st.acc >= 3 || (st.t <= 0 && st.acc >= 1)) {
        const n = Math.floor(st.acc);
        st.acc -= n;
        this.hitMonster(m, n, { dot: true, element: k === 'burn' ? 'fire' : k === 'bleed' ? 'physical' : 'poison' });
      }
      if (st.t <= 0) delete m.statuses[k];
    }
    // shock: a twitch every interval (a short pause of everything the monster does: core/ai.js)
    const sh = m.statuses.shock;
    if (sh) {
      const S = this.data.progression.combat.shock;
      sh.next -= dt;
      if (sh.next <= 0) { sh.next += S.interval; m.twitchT = m.boss ? S.bossTwitch : S.twitch; this.emit({ type: 'twitch', id: m.id, x: m.x, z: m.z, duration: m.twitchT }); }
      sh.t -= dt;
      if (sh.t <= 0) delete m.statuses.shock;
    }
    for (const k of ['chill', 'hex', 'mire', 'charged', 'root']) {
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
        const shielded = this.drainShield(n);
        p.hp -= n - shielded;
        this.emit({ type: 'playerHit', amount: n - shielded, absorbed: 0, shielded, dot: true, x: p.x, z: p.z });
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
      // a static one (Lure Dummy) stands where it was set: it only draws monsters (tickFrontier taunts)
      if (a.static) { a.moving = false; continue; }
      // pick a target: what we are fighting, else the player's target, else something threatening the player
      if(a.command==='follow'){a.targetId=null;}
      if(a.command!=='attack'&&a.effects?.focusTarget&&p.lastHitTarget!==a.focusId){a.focusId=p.lastHitTarget;a.focusReady=this.time+a.effects.focusSwitchDelay;a.targetId=null;}
      let t = a.targetId ? this.monsterById(a.targetId) : null;
      if(a.command!=='attack'&&a.effects?.focusTarget){const focused=this.monsterById(a.focusId);t=this.time>=a.focusReady&&focused&&!focused.dead?focused:null;}
      const commandFollow=a.command==='follow'||a.command!=='attack'&&a.effects?.focusTarget&&this.time<a.focusReady;
      if(commandFollow)t=null;else if(t)a.targetId=t.id;
      if (!t || t.dead || dist(t.x, t.z, p.x, p.z) > 16) {
        t = null;
        const pt = commandFollow ? null : this.target;
        if (pt && dist(pt.x, pt.z, a.x, a.z) < 12) t = pt;
        else {
          let bd = 9;
          for (const m of this.monsters) {
            if (commandFollow || m.dead || !m.aggro) continue;
            const d = dist(m.x, m.z, a.x, a.z);
            if (d < bd && dist(m.x, m.z, p.x, p.z) < 14) {
              bd = d;
              t = m;
            }
          }
        }
        a.targetId = t ? t.id : null;
      }
      const haste = 1 + buffSum(a.buffs, 'speed');
      if (a.state === 'windup') {
        if (a.stateT >= 0.25) {
          const tt = this.monsterById(a.targetId);
          if (tt && !tt.dead && dist(a.x, a.z, tt.x, tt.z) - tt.r - a.r < a.range + 0.5) {
            const k = 1 + buffSum(a.buffs, 'damage');
            this.hitMonster(tt, a.damage * k * (a.focusId===tt.id ? 1+(a.effects?.focusTarget||0):1), { element: 'physical', by: a, byAlly: true, skill: a.skill || 'spirit_wolf', attackKind: 'summon', fromX: a.x, fromZ: a.z });
            this.emit({ type: 'allyStrike', skill: a.skill || 'spirit_wolf', x: tt.x, z: tt.z, fromX: a.x, fromZ: a.z });
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
          pr.stopOn = m; // what stopped it (Shatter Arrow breaks there, core/frontier-content.js endProjectile)
          break;
        }
      } else if (!dead && pr.owner === 'monster' && lightWallStops(this, pr)) {
        dead = true;
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
      if(dead && pr.owner==='player' && endProjectile(this,pr))dead=false;
      if (dead) this.emit({ type: 'projectileEnd', id: pr.id });
      else keep.push(pr);
    }
    this.projectiles = keep;
  }

  projectileImpact(pr) {
    this.emit({ type: 'impact', kind: pr.kind, element: pr.element || 'arcane', x: pr.x, z: pr.z, vx: pr.vx, vz: pr.vz });
  }

  updateAreas(dt) {
    const keep = [];
    for (const a of this.areas) {
      if(a.wallHp!==undefined){a.t+=dt;if(a.wallHp>0&&a.t<a.duration)keep.push(a);else this.emit({type:'areaEnd',id:a.id});continue;}
      if(a.lightWall){a.t+=dt;if(a.t<a.duration)keep.push(a);else this.emit({type:'areaEnd',id:a.id});continue;}
      if(a.follow){if(this.player.dead)continue;a.x=this.player.x;a.z=this.player.z;}
      // a set trap (core/frontier-content.js placeTraps) waits, armed after arm s, until a monster comes within
      // its trigger, then springs at once (the burst below); it is gone after its life unsprung
      if (a.trap && !a.sprung) {
        a.t += dt;
        if (a.t >= a.trap.life) { this.emit({ type: 'areaEnd', id: a.id }); continue; }
        if (!(a.t >= a.trap.arm && this.monsters.some((m) => !m.dead && dist(a.x, a.z, m.x, m.z) <= a.trap.trigger + m.r))) { keep.push(a); continue; }
        a.sprung = true; a.t = 0; a.delay = 0;
        this.emit({ type: 'trapSprung', skill: a.kind, look: a.look || a.kind, id: a.id, x: a.x, z: a.z, radius: a.radius });
      }
      // a monster's attack marked at its wind-up waits while that monster twitches from shock (ai.js pauses
      // the wind-up), so the hit still lands with the strike; one already launched (a rock in flight) does not
      if (a.owner === 'monster' && a.t < a.delay) { const src = this.monsterById(a.sourceId); if (src && src.twitchT > 0 && src.state === 'windup') { keep.push(a); continue; } }
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
            if (!p.dead && dist(a.x, a.z, p.x, p.z) <= a.radius + p.r) healUnit(this,this.player,a.heal,a.skill);
            for (const al of this.allies) if (dist(a.x, a.z, al.x, al.z) <= a.radius + al.r) healUnit(this,al,a.heal,a.skill);
            chainFieldHeal(this, a);
          } else if (a.damage) {
            if(a.dwell)for(const id of a.dwell.keys()){const q=this.monsterById(id);if(!q||q.dead||dist(a.x,a.z,q.x,q.z)>a.radius+q.r)a.dwell.delete(id);}
            for (const m of this.monsters) {
              if (m.dead || dist(a.x, a.z, m.x, m.z) > a.radius + m.r) continue;
              const fx=a.skill?.modEffects,ramp=fx?.rampSlow;
              if(ramp){const dwell=(a.dwell.get(m.id)||0)+a.tick;a.dwell.set(m.id,dwell);m.statuses.chill={slow:Math.max(m.statuses.chill?.slow||0,(a.slow||0)+(ramp-(a.slow||0))*Math.min(1,dwell/fx.rampTime)),t:.6};}
              if (a.slow) m.statuses.chill = { slow: Math.max(a.slow, m.statuses.chill?.slow || 0), t: Math.max(0.6, m.statuses.chill?.t || 0) };
              this.hitMonster(m, a.damage, { dot: true, element: a.element });
              if (a.skill?.poison && !m.dead) stackPoison(this, m, a.skill.poison, a.damage); // Miasma Arrow: each tick stacks its poison
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
          this.emit({ type: 'burst', kind: a.kind, element: a.element, echo: !!a.echo, x: a.x, z: a.z, radius: a.radius, generic: !!s?.def?.fxPending });
        } else if (a.owner === 'monster' && a.damage) {
          const src = this.monsterById(a.sourceId);
          // a ring (a.inner) leaves its middle safe
          for (const u of this.units()) {
            const d = dist(a.x, a.z, u.x, u.z);
            if (d <= a.radius + u.r && !(a.inner && d < a.inner)) this.damageUnit(u, a.damage, src);
          }
          this.emit({ type: 'burst', kind: a.kind, element: 'earth', x: a.x, z: a.z, radius: a.radius, inner: a.inner });
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
          if (d.item === 'gear') {
            const item = { uid: this.ch.nextUid++, ...d.gear };
            this.ch.gear.push(item);
            this.emit({ type: 'pickup', id: d.id, item: 'gear', base: item.base, grade: item.grade, uid: item.uid, qty: 1 });
            continue;
          }
          addItem(this.ch, d.item, d.qty);
          if (d.item !== 'gold') {
            const c = this.ch.progress.collected;
            c[d.item] = (c[d.item] || 0) + d.qty;
            this.notify({ type: 'collect', item: d.item, qty: d.qty, world: d.worldId });
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
