// Skill FX test bench: the real combat rules (src/core) with a staff caster, chosen mods and a
// few training dummies on an isolated flat floor. Nothing is saved; nothing here changes rules.
import { Game } from '../core/game.js';
import { createCharacter, equip } from '../core/character.js';
import { tickFrontier } from '../core/frontier-content.js';
import { modFits, modDef } from '../core/skills.js';
import { installFusion } from './fusion.js';

export const BENCH_SKILLS = ['slash', 'hunter_shot', 'firebolt', 'chain_spark', 'frost_nova', 'flame_stream', 'venom_bolt', 'arrow_rain', 'charged_shot', 'frontline_split', 'armor_cleave', 'interrupt_slam', 'weakpoint', 'shield_bash', 'riposte',
  // job skills, batch 1 (2026-10-26): the game's general effects until each gets its own
  'sky_shatter', 'earth_rend', 'iron_body', 'cross_cut', 'blade_storm', 'backstab', 'rally', 'frenzy_roar', 'stand_firm', 'team_stand', 'blessing', 'rapid_volley', 'killing_arrow', 'meteor', 'blizzard', 'thunderstorm', 'holy_bell', 'light_chain', 'spell_wave'];
// The weapon each bench skill is shown with (its own requirement, else the natural one).
export const BENCH_WEAPON = { slash: 'sword', hunter_shot: 'bow', firebolt: 'staff', chain_spark: 'staff', frost_nova: 'staff', flame_stream: 'staff', venom_mire: 'bow', venom_bolt: 'wand', arrow_rain: 'bow', charged_shot: 'bow', frontline_split: 'greatblade', armor_cleave: 'axe', interrupt_slam: 'mace', weakpoint: 'dagger', shield_bash: 'sword', riposte: 'sword', sky_shatter: 'greatblade', earth_rend: 'greatblade', iron_body: 'greatblade', cross_cut: 'dagger', blade_storm: 'dagger', backstab: 'dagger', rally: 'sword', frenzy_roar: 'sword', stand_firm: 'sword', team_stand: 'sword', blessing: 'staff', rapid_volley: 'bow', killing_arrow: 'bow', meteor: 'staff', blizzard: 'staff', thunderstorm: 'staff', holy_bell: 'staff', light_chain: 'staff', spell_wave: 'sword' };

// Dummy layouts per skill (caster at the origin facing +X). Each shows what mods change:
// extra chain hops, the nova edge (Concentrated shrinks it), the cone edge and range.
// the game and close cameras frame this area for each skill (centre cx, cz; width w, depth d)
export const VIEW = { slash: { cx: 4.4, cz: 0.6, w: 13.5, d: 6 }, hunter_shot: { cx: 6.0, cz: 0.6, w: 16, d: 7.5 }, firebolt: { cx: 5.6, cz: 0, w: 14, d: 6 }, chain_spark: { cx: 5.6, cz: 0.4, w: 16, d: 7 }, frost_nova: { cx: 0.8, cz: 0, w: 12.5, d: 9 }, flame_stream: { cx: 2.8, cz: 0.6, w: 8, d: 5.5 }, venom_mire: { cx: 5.4, cz: 0, w: 14, d: 6.5 }, venom_bolt: { cx: 5.4, cz: 0, w: 14, d: 6.5 }, arrow_rain: { cx: 4.2, cz: 0.6, w: 13, d: 8 }, charged_shot: { cx: 7.5, cz: 0, w: 18, d: 7 }, frontline_split: { cx: 2.4, cz: 0, w: 9, d: 6 }, armor_cleave: { cx: 1.6, cz: 0.4, w: 7.5, d: 5.5 }, interrupt_slam: { cx: 1.4, cz: 0.6, w: 7, d: 5.5 }, weakpoint: { cx: 1.8, cz: 0, w: 7, d: 6.5 }, shield_bash: { cx: 2.0, cz: 0.3, w: 7.5, d: 6 }, riposte: { cx: 1.4, cz: 0.4, w: 7, d: 6 }, sky_shatter: { cx: 1.8, cz: 0.4, w: 8, d: 6 }, earth_rend: { cx: 3.6, cz: 0, w: 11, d: 6 }, iron_body: { cx: 1.2, cz: 0, w: 8, d: 6 }, cross_cut: { cx: 1.4, cz: 0.2, w: 7, d: 5.5 }, blade_storm: { cx: 0.6, cz: 0, w: 9, d: 7.5 }, backstab: { cx: 3.0, cz: 0, w: 10, d: 6.5 }, rally: { cx: 0, cz: 0, w: 18, d: 13 }, frenzy_roar: { cx: 0, cz: 0, w: 18, d: 13 }, stand_firm: { cx: 0, cz: 0, w: 18, d: 13 }, team_stand: { cx: 1.2, cz: 0, w: 11, d: 8 }, blessing: { cx: 1.2, cz: 0, w: 11, d: 8 }, rapid_volley: { cx: 6.5, cz: 0.4, w: 16, d: 7 }, killing_arrow: { cx: 8.5, cz: 0, w: 20, d: 7 }, meteor: { cx: 5.2, cz: 0.4, w: 14, d: 9 }, blizzard: { cx: 5.2, cz: 0.4, w: 14, d: 9 }, thunderstorm: { cx: 5.2, cz: 0.4, w: 14, d: 9 }, holy_bell: { cx: 0.8, cz: 0, w: 12.5, d: 9.5 }, light_chain: { cx: 5.6, cz: 0, w: 14, d: 6 }, spell_wave: { cx: 5.0, cz: 0, w: 13, d: 6.5 } };
export const LAYOUTS = {
  // two in the swing, one just outside its arc, and a line behind for a linked bolt to fly on into
  slash: [[2.0, 0.4], [1.8, -0.9], [1.4, 2.0], [5.0, 0.6], [8.2, -0.3], [11.0, 1.0]],
  firebolt: [[5.0, 0.0], [8.5, 1.2], [7.0, -2.2], [11.5, 0.2]],
  chain_spark: [[3.6, 0.3], [6.2, -1.7], [8.6, 0.8], [6.3, 2.7], [10.6, -1.4], [11.6, 2.2]],
  frost_nova: [[2.0, 0.6], [-1.2, 2.2], [0.4, -3.2], [-3.0, -1.6], [3.7, 1.9], [5.4, -1.0]],
  flame_stream: [[2.0, 0.2], [3.3, -1.0], [4.4, 1.0], [3.0, 2.6], [6.2, 0]],
  // a target in line, others off to the sides and behind for Split / Pierce / Bounce
  venom_mire: [[5.0, 0.0], [8.5, -1.2], [7.2, 2.0], [11.0, 0.6], [3.8, -2.6]],
  venom_bolt: [[5.0, 0.0], [8.5, -1.2], [7.2, 2.0], [11.0, 0.6], [3.8, -2.6]],
  // four in the 3 m circle at the 5 m aim point, two just outside it
  arrow_rain: [[5.0, 0.3], [4.0, -1.4], [6.2, 1.4], [5.9, -1.1], [8.6, 0.4], [3.6, 3.0]],
  // a long lane: the reach and the pushed-air rings read along it
  charged_shot: [[9.0, 0.0], [13.0, 1.6], [6.0, -2.4], [15.5, -1.2]],
  // one in the line of fire and a loose group round it, so a linked chain has somewhere to leap
  hunter_shot: [[7.0, 0.0], [9.2, 2.0], [9.6, -1.8], [11.8, 0.4], [6.5, 3.6]],
  // three down the 5 m line, two just off its 1.4 m width
  frontline_split: [[1.8, 0.2], [3.2, -0.3], [4.6, 0.25], [3.0, 1.6], [2.4, -1.7]],
  // three in the 80 degree, 2.8 m cut, two outside it
  armor_cleave: [[2.0, 0.3], [1.8, -0.9], [1.7, 1.2], [1.2, 2.6], [4.2, -0.4]],
  // three in the 65 degree, 2.7 m slam, one beside it
  interrupt_slam: [[2.1, 0.2], [1.9, -0.9], [1.8, 1.0], [0.6, 2.5]],
  // two in the narrow thrust: one facing the hero, one with its back turned; two more off to the sides
  weakpoint: [[1.9, -0.25], [2.15, 0.3], [3.4, 2.4], [3.4, -2.4]],
  // three in the 90 degree, 2.2 m bash (knocked back), one behind them
  shield_bash: [[1.7, 0.2], [1.5, -0.9], [1.4, 1.0], [4.2, 0.2]],
  // the first one attacks the hero in turns (to be blocked); the counter's 100 degree arc takes the rest
  riposte: [[1.6, 0.1], [1.8, -0.8], [1.7, 0.9], [3.6, 1.6]],
  // job skills, batch 1: a group in reach of each, one or two just outside
  sky_shatter: [[2.0, 0.3], [1.8, -1.2], [1.6, 1.4], [4.6, 0.2]],
  earth_rend: [[2.0, 0.2], [4.2, -0.4], [6.6, 0.5], [4.0, 2.2], [9.6, 0]],
  iron_body: [[2.2, 0.3], [2.0, -1.2], [3.6, 1.4]],
  cross_cut: [[1.7, 0.2], [1.6, -0.8], [3.4, 1.8]],
  blade_storm: [[2.0, 0.6], [-1.4, 1.8], [0.4, -2.4], [-2.0, -1.2], [4.2, 1.2]],
  // the target 5 m off facing the hero (Backstab steps behind it), one beside it, one out of reach
  backstab: [[5.0, 0.0], [5.4, 1.4], [11.5, 0.5]],
  rally: [[2.6, 0.3], [2.4, -1.4], [3.8, 1.6]],
  frenzy_roar: [[2.6, 0.3], [2.4, -1.4], [3.8, 1.6]],
  stand_firm: [[2.6, 0.3], [2.4, -1.4], [3.8, 1.6]],
  team_stand: [[2.6, 0.3], [2.4, -1.4], [3.8, 1.6]],
  blessing: [[2.6, 0.3], [2.4, -1.4], [3.8, 1.6]],
  rapid_volley: [[7.0, 0.0], [9.2, 1.6], [10.6, -1.4], [6.0, 3.0]],
  killing_arrow: [[9.0, 0.0], [13.0, 1.6], [6.0, -2.4], [16.0, -1.0]],
  meteor: [[5.0, 0.3], [4.0, -1.6], [6.3, 1.6], [5.9, -1.2], [9.2, 0.4], [3.2, 3.2]],
  blizzard: [[5.0, 0.3], [4.0, -1.6], [6.3, 1.6], [5.9, -1.2], [9.2, 0.4], [3.2, 3.2]],
  thunderstorm: [[5.0, 0.3], [4.0, -1.4], [6.2, 1.4], [5.9, -1.1], [8.8, 0.4], [3.6, 3.0]],
  holy_bell: [[2.0, 0.6], [-1.6, 2.4], [0.4, -3.4], [-3.0, -1.6], [3.8, 1.9], [6.2, -1.0]],
  light_chain: [[5.0, 0.0], [8.5, 1.2], [7.0, -2.2], [11.5, 0.2]],
  spell_wave: [[4.0, 0.0], [6.5, 0.6], [8.6, -0.5], [5.0, 2.6], [11.5, 0.2]],
};
// Facings per layout (default: every dummy faces the hero). Flank Thrust needs some backs turned.
export const FACINGS = {
  weakpoint: [-Math.PI / 2, Math.PI / 2, 0, Math.PI],
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

export function createBench(data, skill, mods = [], { seed = 71, fusion = null, fusionRules = null, movement = 'dash' } = {}) {
  const ch = createCharacter(data, { kit: 'bow' });
  ch.stats = { STR: 50, AGI: 50, VIT: 50, INT: 50, DEX: 50, LUK: 50 };
  ch.skills[skill] = 1;
  ch.mods = mods.map((m) => ({ id: m.id, uid: ch.nextUid++, level: m.level || 1, grade: 'C' }));
  if (fusion) ch.skills[fusion] = 1;
  ch.slots = ch.slots.map((_, i) => ({ skill: i === 0 ? skill : i === 1 && fusion ? fusion : null, mods: i === 0 ? ch.mods.map((m) => m.uid) : [] }));
  const mv = data.skills.movement[movement] ? movement : 'dash'; // the dodge button's move (the bench's หลบ picker)
  if (data.skills.movement[mv]) { ch.movementSkills = [mv]; ch.movement = mv; }
  ch.equipped.weapon = ch.equipped.offhand = null;
  const weaponType = BENCH_WEAPON[skill] || 'staff';
  const base = Object.entries(data.items.gearBases).find(([, d]) => d.weaponType === weaponType);
  if (base) { const it = { uid: ch.nextUid++, base: base[0], grade: 'C', itemLevel: 1, upgrade: 0, options: [] }; ch.gear.push(it); equip(ch, data, it.uid); }
  const off = data.skills.combat[skill]?.requiresOffhand; // e.g. Shield Bash needs a shield
  const offBase = off && Object.entries(data.items.gearBases).find(([, d]) => d.offhandType === off);
  if (offBase) { const it = { uid: ch.nextUid++, base: offBase[0], grade: 'C', itemLevel: 1, upgrade: 0, options: [] }; ch.gear.push(it); equip(ch, data, it.uid); }

  const g = new Game(data, { character: ch, seed });
  Object.assign(g.player, { x: 0, z: 0, facing: Math.PI / 2, hp: g.player.maxHp * 0.6 });
  const spots = LAYOUTS[skill];
  const pool = g.monsters.filter((m) => !m.boss).slice(0, spots.length);
  pool.forEach((m, i) => {
    const [x, z] = spots[i];
    Object.assign(m, { x, z, homeX: x, homeZ: z, hp: 100000, maxHp: 100000, defense: 0, aggro: false, boss: false, dead: false, statuses: {}, facing: FACINGS[skill]?.[i] ?? -Math.PI / 2, benchIndex: i });
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
  g.aimAt = (angle) => { const p = g.player; g.input.aimFromPointer = true; g.input.aimAngle = angle; g.input.aimPoint = { x: p.x + Math.sin(angle) * 5, z: p.z + Math.cos(angle) * 5 }; };
  g.resetDummies = () => {
    for (const m of g.monsters) Object.assign(m, { x: m.homeX, z: m.homeZ, hp: m.maxHp, statuses: {}, dead: false });
    g.player.cooldowns.fill(0);
    g.areas = g.areas.filter((a) => a.owner !== 'player');
  };
  // Breakbeat Slam stuns through the rules (state 'stunned'); bench dummies run no AI of their own,
  // so the bench lets them recover after the time
  if (data.skills.combat[skill]?.stun) {
    const step = g.benchStep;
    g.benchStep = function (dt) {
      step.call(this, dt);
      for (const m of this.monsters) if (m.state === 'stunned' && (m.stateT += dt) >= m.stateDur) { m.state = 'idle'; this.emit({ type: 'benchStunEnd', id: m.id }); }
    };
  }
  // Measured Riposte: something to block. The first dummy winds up (1 s, the rules' windup state)
  // and then strikes the hero through the rules' damagePlayer, so a guard can catch it.
  if (data.skills.combat[skill]?.kind === 'counter_stance') {
    const WIND = 1.0, EVERY = 3.2, HIT = 30;
    let next = 1.2;
    const attacker = g.monsters[0];
    const step = g.benchStep;
    g.benchStep = function (dt) {
      step.call(this, dt);
      const m = attacker;
      if (m.state === 'windup' && (m.benchWind -= dt) <= 0) {
        m.state = 'idle'; m.windup = null;
        this.emit({ type: 'benchWindupEnd', id: m.id });
        this.emit({ type: 'benchAttack', id: m.id, x: m.x, z: m.z });
        this.damagePlayer(HIT, m);
        this.player.hp = Math.max(this.player.hp, this.player.maxHp * 0.3); // the bench hero never falls
      }
      if ((next -= dt) <= 0 && m.state !== 'windup' && m.state !== 'stunned') {
        next = EVERY; m.state = 'windup'; m.windup = { name: Object.keys(m.def.attacks || {})[0] }; m.benchWind = WIND;
        this.emit({ type: 'benchWindup', id: m.id, total: WIND });
      }
    };
  }
  if (fusion) g.fusion = installFusion(g, fusionRules, 0, 1);
  g.aimAt(Math.PI / 2);
  return g;
}
