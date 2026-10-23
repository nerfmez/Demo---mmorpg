// Skill FX test bench: the real combat rules (src/core) with a staff caster, chosen mods and a
// few training dummies on an isolated flat floor. Nothing is saved; nothing here changes rules.
import { Game } from '../core/game.js';
import { createCharacter, equip } from '../core/character.js';
import { tickFrontier } from '../core/frontier-content.js';
import { modFits, modDef } from '../core/skills.js';
import { installFusion } from './fusion.js';

export const BENCH_SKILLS = ['slash', 'firebolt', 'chain_spark', 'frost_nova', 'flame_stream', 'venom_mire', 'arrow_rain', 'charged_shot', 'frontline_split', 'armor_cleave', 'interrupt_slam'];
// The weapon each bench skill is shown with (its own requirement, else the natural one).
// Bench-only rule trial: these skills are one plain strike (no 1-2-3 combo, so no finisher knockback).
export const SINGLE_STRIKE = new Set(['slash']);
export const BENCH_WEAPON = { slash: 'sword', firebolt: 'staff', chain_spark: 'staff', frost_nova: 'staff', flame_stream: 'staff', venom_mire: 'bow', arrow_rain: 'bow', charged_shot: 'bow', frontline_split: 'greatblade', armor_cleave: 'axe', interrupt_slam: 'mace' };

// Bench-only rule trial (owner: "not a pool"; then "fast and thin, no pierce, stacks on the same
// target, on the bow"): Venom Mire is shown as a bow attack, Venom Arrow. Each hit adds a poison
// stack (up to maxStacks) and refreshes its duration; every stack adds dps worth stackDps x that
// hit. The game keeps its zone until this is approved and moved into data/skills.json with a core
// rule and test.
export const VENOM_ARROW = {
  nameTh: 'ธนูพิษ', name: 'Venom Arrow',
  desc: 'ยิงลูกธนูพิษเส้นบางเร็ว ไม่ทะลุ โดนเป้าเดิมพิษซ้อนได้ถึง 5 ชั้น ยิ่งซ้อนยิ่งแรง',
  tags: ['Attack', 'Projectile', 'Poison', 'Damage', 'DoT'], kind: 'projectile', power: 'attack', requiresWeapon: ['bow'],
  damage: { base: 4, scale: 0.4 }, range: 14, speed: 26, projectileRadius: 0.2,
  cooldown: 0.6, castTime: 0.2, cost: 0, element: 'poison', requires: { DEX: 6 }, upgradeStat: 'DEX',
  poison: { maxStacks: 5, duration: 4, stackDps: 0.6 },
};
// The bench's copy of the game data with its rule trials applied (the game's data is untouched).
export function benchData(data) {
  const combat = { ...data.skills.combat };
  const { radius, duration, tick, slow, ...rest } = combat.venom_mire;
  combat.venom_mire = { ...rest, ...VENOM_ARROW };
  return { ...data, skills: { ...data.skills, combat } };
}

// Dummy layouts per skill (caster at the origin facing +X). Each shows what mods change:
// extra chain hops, the nova edge (Concentrated shrinks it), the cone edge and range.
export const LAYOUTS = {
  // two in the swing, one just outside its arc, and a line behind for a linked bolt to fly on into
  slash: [[2.0, 0.4], [1.8, -0.9], [1.4, 2.0], [5.0, 0.6], [8.2, -0.3], [11.0, 1.0]],
  firebolt: [[5.0, 0.0], [8.5, 1.2], [7.0, -2.2], [11.5, 0.2]],
  chain_spark: [[3.6, 0.3], [6.2, -1.7], [8.6, 0.8], [6.3, 2.7], [10.6, -1.4], [11.6, 2.2]],
  frost_nova: [[2.0, 0.6], [-1.2, 2.2], [0.4, -3.2], [-3.0, -1.6], [3.7, 1.9], [5.4, -1.0]],
  flame_stream: [[2.0, 0.2], [3.3, -1.0], [4.4, 1.0], [3.0, 2.6], [6.2, 0]],
  // a target in line, others off to the sides and behind for Split / Pierce / Bounce
  venom_mire: [[5.0, 0.0], [8.5, -1.2], [7.2, 2.0], [11.0, 0.6], [3.8, -2.6]],
  // four in the 3 m circle at the 5 m aim point, two just outside it
  arrow_rain: [[5.0, 0.3], [4.0, -1.4], [6.2, 1.4], [5.9, -1.1], [8.6, 0.4], [3.6, 3.0]],
  // a long lane: the reach and the pushed-air rings read along it
  charged_shot: [[9.0, 0.0], [13.0, 1.6], [6.0, -2.4], [15.5, -1.2]],
  // three down the 5 m line, two just off its 1.4 m width
  frontline_split: [[1.8, 0.2], [3.2, -0.3], [4.6, 0.25], [3.0, 1.6], [2.4, -1.7]],
  // three in the 80 degree, 2.8 m cut, two outside it
  armor_cleave: [[2.0, 0.3], [1.8, -0.9], [1.7, 1.2], [1.2, 2.6], [4.2, -0.4]],
  // three in the 65 degree, 2.7 m slam, one beside it
  interrupt_slam: [[2.1, 0.2], [1.9, -0.9], [1.8, 1.0], [0.6, 2.5]],
};

// Mods this skill can actually use on the bench. Triggers that need a guard skill are left out.
export function benchMods(data, skill, selected = []) {
  const def = benchData(data).skills.combat[skill];
  return Object.keys(data.mods.mods).filter((key) => {
    const mod = modDef(data, key);
    if (mod.effect?.trigger && mod.effect.trigger !== 'on_movement') return false;
    return modFits(def, mod, selected.map((s) => modDef(data, s.id))).ok;
  });
}

export function createBench(baseData, skill, mods = [], { seed = 71, fusion = null, fusionRules = null } = {}) {
  const data = benchData(baseData);
  const ch = createCharacter(data, { kit: 'bow' });
  ch.stats = { STR: 50, AGI: 50, VIT: 50, INT: 50, DEX: 50 };
  ch.skills[skill] = 1;
  ch.mods = mods.map((m) => ({ id: m.id, uid: ch.nextUid++, level: m.level || 1, grade: 'C' }));
  if (fusion) ch.skills[fusion] = 1;
  ch.slots = ch.slots.map((_, i) => ({ skill: i === 0 ? skill : i === 1 && fusion ? fusion : null, mods: i === 0 ? ch.mods.map((m) => m.uid) : [] }));
  if (data.skills.movement.dash) { ch.movementSkills = ['dash']; ch.movement = 'dash'; }
  ch.equipped.weapon = ch.equipped.offhand = null;
  const weaponType = BENCH_WEAPON[skill] || 'staff';
  const base = Object.entries(data.items.gearBases).find(([, d]) => d.weaponType === weaponType);
  if (base) { const it = { uid: ch.nextUid++, base: base[0], grade: 'C', itemLevel: 1, upgrade: 0, options: [] }; ch.gear.push(it); equip(ch, data, it.uid); }

  const g = new Game(data, { character: ch, seed });
  Object.assign(g.player, { x: 0, z: 0, facing: Math.PI / 2, hp: g.player.maxHp * 0.6 });
  const spots = LAYOUTS[skill];
  const pool = g.monsters.filter((m) => !m.boss).slice(0, spots.length);
  pool.forEach((m, i) => {
    const [x, z] = spots[i];
    Object.assign(m, { x, z, homeX: x, homeZ: z, hp: 100000, maxHp: 100000, defense: 0, aggro: false, boss: false, dead: false, statuses: {}, facing: -Math.PI / 2, benchIndex: i });
  });
  g.monsters = pool;
  g.player.targetId = null;
  g.world = { surfaceY: () => 0, groundY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], seamAt: () => null, bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 } };
  g.isSafe = () => false;
  g.nearby = () => ({ inTown: false });
  g.drainEvents();
  g.benchStep = (dt) => {
    g.time += dt;
    const due = [];
    g.pending = g.pending.filter((q) => { q.t -= dt; if (q.t <= 0) { due.push(q.fn); return false; } return true; });
    for (const fn of due) fn();
    tickFrontier(g, dt);
    g.updateFusion?.(dt);
    g.updatePlayer(dt);
    g.updateProjectiles(dt);
    g.updateAreas(dt);
    for (const m of g.monsters) g.tickStatuses(m, dt);
    g.player.mp = g.player.maxMp; // cooldowns run for real; MP and arrows never block a test
    if (g.ch.arrows?.stock && Object.values(g.ch.arrows.stock).reduce((a, n) => a + n, 0) < 50) g.ch.arrows.stock.feather_arrow = 200;
    g.player.movement.charges = Math.max(g.player.movement.charges, 1);
  };
  g.aimAt = (angle) => { g.input.aimFromPointer = true; g.input.aimAngle = angle; g.input.aimPoint = { x: Math.sin(angle) * 5, z: Math.cos(angle) * 5 }; };
  g.resetDummies = () => {
    for (const m of g.monsters) Object.assign(m, { x: m.homeX, z: m.homeZ, hp: m.maxHp, statuses: {}, dead: false });
    g.player.cooldowns.fill(0);
    g.areas = g.areas.filter((a) => a.owner !== 'player');
  };
  if (SINGLE_STRIKE.has(skill)) {
    const cast = g.castSlot;
    g.castSlot = function (...args) { this.player.lastSwingT = -1e9; return cast.apply(this, args); }; // combo step stays 0
  }
  // Venom Arrow trial: each direct hit stacks the target's poison
  const hit = g.hitMonster;
  g.hitMonster = function (m, amount, opts = {}) {
    const out = hit.call(this, m, amount, opts);
    const pz = data.skills.combat[opts.skill]?.poison;
    if (pz && !opts.dot && !opts.byAlly && !m.dead && m.hp > 0) {
      const before = m.statuses.poison?.stacks || 0, stacks = Math.min(pz.maxStacks, before + 1);
      m.statuses.poison = { dps: stacks * pz.stackDps * amount, t: pz.duration, acc: m.statuses.poison?.acc || 0, owner: 'player', stacks };
      if (stacks > before) this.emit({ type: 'poisonStack', id: m.id, stacks, x: m.x, z: m.z }); // only when it grows
    }
    return out;
  };
  // Breakbeat Slam: the dummies take turns winding up an attack (the rules' 'windup' state) so the
  // slam has something to interrupt; an interrupted dummy is stunned for the rules' time.
  if (skill === 'interrupt_slam') {
    const WIND = 1.4, EVERY = 2.6;
    let next = 0.8, turn = 0;
    const step = g.benchStep;
    g.benchStep = function (dt) {
      step.call(this, dt);
      next -= dt;
      for (const m of this.monsters) {
        if (m.state === 'windup' && (m.benchWind -= dt) <= 0) { m.state = 'idle'; m.windup = null; this.emit({ type: 'benchWindupEnd', id: m.id }); }
        if (m.state === 'stunned') { if (!m.benchStun) { m.benchStun = true; this.emit({ type: 'benchStunned', id: m.id, duration: m.stateDur }); } if ((m.stateT += dt) >= m.stateDur) { m.state = 'idle'; m.benchStun = false; this.emit({ type: 'benchStunEnd', id: m.id }); } }
      }
      if (next <= 0) {
        next = EVERY;
        const idle = this.monsters.filter((m) => m.state !== 'windup' && m.state !== 'stunned');
        for (const m of idle.slice(turn % 2 ? 1 : 0).filter((_, i) => i % 2 === 0)) {
          m.state = 'windup'; m.windup = { name: Object.keys(m.def.attacks || {})[0] }; m.benchWind = WIND;
          this.emit({ type: 'benchWindup', id: m.id, total: WIND });
        }
        turn++;
      }
    };
  }
  if (fusion) g.fusion = installFusion(g, fusionRules, 0, 1);
  g.aimAt(Math.PI / 2);
  return g;
}
