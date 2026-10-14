// Skill FX test bench: the real combat rules (src/core) with a staff caster, chosen mods and a
// few training dummies on an isolated flat floor. Nothing is saved; nothing here changes rules.
import { Game } from '../core/game.js';
import { createCharacter, equip } from '../core/character.js';
import { tickFrontier } from '../core/frontier-content.js';
import { modFits, modDef } from '../core/skills.js';
import { installFusion } from './fusion.js';

export const BENCH_SKILLS = ['slash', 'firebolt', 'chain_spark', 'frost_nova', 'flame_stream'];
// The weapon each bench skill is shown with (its own requirement, else the natural one).
export const BENCH_WEAPON = { slash: 'sword', firebolt: 'staff', chain_spark: 'staff', frost_nova: 'staff', flame_stream: 'staff' };

// Dummy layouts per skill (caster at the origin facing +X). Each shows what mods change:
// extra chain hops, the nova edge (Concentrated shrinks it), the cone edge and range.
export const LAYOUTS = {
  // two in the swing, one just outside its arc, and a line behind for a linked bolt to fly on into
  slash: [[2.0, 0.4], [1.8, -0.9], [1.4, 2.0], [5.0, 0.6], [8.2, -0.3], [11.0, 1.0]],
  firebolt: [[5.0, 0.0], [8.5, 1.2], [7.0, -2.2], [11.5, 0.2]],
  chain_spark: [[3.6, 0.3], [6.2, -1.7], [8.6, 0.8], [6.3, 2.7], [10.6, -1.4], [11.6, 2.2]],
  frost_nova: [[2.0, 0.6], [-1.2, 2.2], [0.4, -3.2], [-3.0, -1.6], [3.7, 1.9], [5.4, -1.0]],
  flame_stream: [[2.0, 0.2], [3.3, -1.0], [4.4, 1.0], [3.0, 2.6], [6.2, 0]],
};

// Mods this skill can actually use on the bench. Triggers that need a guard skill are left out.
export function benchMods(data, skill, selected = []) {
  const def = data.skills.combat[skill];
  return Object.keys(data.mods.mods).filter((key) => {
    const mod = modDef(data, key);
    if (mod.effect?.trigger && mod.effect.trigger !== 'on_movement') return false;
    return modFits(def, mod, selected.map((s) => modDef(data, s.id))).ok;
  });
}

export function createBench(data, skill, mods = [], { seed = 71, fusion = null, fusionRules = null } = {}) {
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
    g.updatePlayer(dt);
    g.updateProjectiles(dt);
    g.updateAreas(dt);
    for (const m of g.monsters) g.tickStatuses(m, dt);
    g.player.mp = g.player.maxMp; // cooldowns run for real; MP never blocks a test
    g.player.movement.charges = Math.max(g.player.movement.charges, 1);
  };
  g.aimAt = (angle) => { g.input.aimFromPointer = true; g.input.aimAngle = angle; g.input.aimPoint = { x: Math.sin(angle) * 5, z: Math.cos(angle) * 5 }; };
  g.resetDummies = () => {
    for (const m of g.monsters) Object.assign(m, { x: m.homeX, z: m.homeZ, hp: m.maxHp, statuses: {}, dead: false });
    g.player.cooldowns.fill(0);
    g.areas = g.areas.filter((a) => a.owner !== 'player');
  };
  if (fusion) g.fusion = installFusion(g, fusionRules, 0, 1);
  g.aimAt(Math.PI / 2);
  return g;
}
