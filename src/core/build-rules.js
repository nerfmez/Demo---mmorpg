// Build balance rules (owner, 2026-10-27). Balance is not one number: every build gets a profile, one
// number per axis (higher is better), and the rules look for builds that are overpowered, not for
// builds that stand out. Standing out in a build's own role (a damage line kills fastest, a guardian
// line lasts longest) is intended and paid for with a clear weakness elsewhere; overpowered means a
// build is at least as good as another of equal cost on every axis (it dominates it) or has no
// weakness at all. Numbers live in data.progression.balance.rules. Pure: no live game.
import { defenseFactor } from './character.js';
import { computeSkill, movementSkill } from './skills.js';
import { referenceHero, referenceMonster, skillRankAt, farmingIncome } from './balance.js';

export const AXES = ['single', 'pack', 'survival', 'sustain', 'mobility', 'team', 'income'];

// a damage option counts only when the skill can use it (a sword gains nothing from spell damage)
const USES = {
  attack: (s) => s.power !== 'spell', magic: (s) => s.power === 'spell',
  meleeDamagePct: (s) => s.tags.has('Melee'), projectileDamagePct: (s) => s.tags.has('Projectile'),
  spellDamagePct: (s) => s.tags.has('Spell'), areaDamagePct: (s) => s.tags.has('Area'), summonDamagePct: (s) => s.tags.has('Summon'),
};

/** The stats a gear set adds: each listed option rolled mid-range, spread over every slot. */
export function gearSetStats(data, setId, skillDef) {
  const r = data.progression.balance.rules, ids = r.gearSets[setId] || [];
  const tags = new Set(skillDef.tags || []), probe = { power: skillDef.power, tags };
  const usable = ids.filter((id) => { const st = data.items.gearOptions[id].stat; return !USES[st] || USES[st](probe); });
  const rolls = data.items.slots.length * r.optionsPerItem / Math.max(1, usable.length), out = {};
  for (const id of usable) { const o = data.items.gearOptions[id]; out[o.stat] = (out[o.stat] || 0) + (o.min + o.max) / 2 * rolls; }
  return out;
}

/** How many of a pack one cast reaches, from the skill's shape (area kinds by area, projectiles by pierce). */
export function packTargets(s, pack) {
  const packArea = Math.PI * pack.radius * pack.radius, byArea = (a) => Math.max(1, Math.min(pack.size, pack.size * a / packArea));
  switch (s.kind) {
    case 'melee_arc': return byArea(Math.PI * s.range * s.range * (s.arc || 90) / 360);
    case 'melee_nova': case 'nova': case 'ground_area': case 'dot_zone': return byArea(Math.PI * (s.radius || 1) ** 2);
    case 'melee_line': return byArea(s.range * (s.def?.width || 1));
    case 'channel_cone': return byArea(Math.PI * s.range * s.range * (s.arc || 60) / 360);
    case 'chain': return Math.min(pack.size, 1 + (s.chain || 0));
    case 'projectile': return Math.min(pack.size, (1 + (s.pierce || 0)) * Math.max(1, s.projectiles || 1));
    default: return 1;
  }
}

/**
 * A build's profile. spec: { kit, level, jobNodes, gear (a gear set id), support (skill ids slotted
 * after the main skill) }. Returns { axes, cost } with the axes in AXES order of meaning.
 */
export function buildProfile(data, spec) {
  const R = data.progression.balance.rules, b = data.progression.balance;
  // the gear set rides in as one extra source of stats, so it meets the same soft caps and caps
  const mainDef = data.skills.combat[b.builds[spec.kit].skill];
  const gearNode = '~gear', withGear = { ...data, jobtree: { ...data.jobtree, nodes: { ...data.jobtree.nodes, [gearNode]: { effects: gearSetStats(data, spec.gear, mainDef) } } } };
  const { ch, d } = referenceHero(withGear, spec.kit, spec.level, [...(spec.jobNodes || []), gearNode]);
  (spec.support || []).forEach((id, i) => { ch.slots[i + 1] = { skill: id, mods: [] }; ch.skills[id] = skillRankAt(data, spec.level); });
  const s = computeSkill(ch, data, d, 0), m = referenceMonster(data, spec.level), hitDps = m.damage / m.hitInterval;
  const crit = 1 + d.critChance * (d.critMult - 1), mdef = m.defense * (1 - (d.penetrationPct || 0) / 100);
  const perHit = (s.damage || 0) * crit * (1 + (s.repeats || 0) * (s.repeatMult || 0)) * defenseFactor(mdef, data);
  const rate = b.uptime / Math.max(s.cooldown, s.castTime, 0.35), sec = R.fightSeconds;
  // casts per second MP allows over the fight: pool + regeneration, each cast handing back its hits' MP
  const mana = (hits) => { const net = s.cost - hits * (d.mpOnHit || 0); return net > 0 ? (d.maxMp + d.mpRegen * sec) / sec / net : Infinity; };
  const single = perHit * Math.max(1, s.projectiles || 1) * Math.min(rate, mana(1));
  const targets = packTargets(s, R.pack), pack = perHit * targets * Math.min(rate, mana(targets));
  // sustain: seconds of full-rate casting before MP runs dry (regeneration and MP on hit counted)
  const drain = s.cost * rate - d.mpRegen - (d.mpOnHit || 0) * rate;
  const sustain = drain <= 0 ? R.survivalCap : Math.min(R.survivalCap, d.maxMp / drain);
  // survival: the reference monster's hits through armour, block and dodge, against regen and leech
  const incoming = hitDps * defenseFactor(d.defense, data) * (1 + (d.damageTakenPct || 0) / 100)
    * (1 - Math.min(1, (d.dodgeChancePct || 0) / 100)) * (1 - (d.blockChance || 0) * (1 - data.progression.combat.block.taken));
  const net = incoming - (d.hpRegen || 0) - (d.leechPct || 0) / 100 * single;
  const survival = net <= 0 ? R.survivalCap : Math.min(R.survivalCap, (d.maxHp + (d.maxShield || 0)) / net);
  const mv = movementSkill(ch, data, d);
  const mobility = d.moveSpeed + (mv.charges ? mv.distance / Math.max(0.1, mv.recharge) : 0);
  // team: what the support skills give allies (buff share x uptime; healing and barriers per second
  // measured against the monster's damage per second)
  let team = 0;
  for (let i = 1; i < ch.slots.length; i++) {
    const t = ch.slots[i].skill && computeSkill(ch, data, d, i);
    if (!t) continue;
    const up = t.duration ? Math.min(1, t.duration / t.cooldown) : 0;
    team += up * ((t.damageBuff || 0) + (t.speedBuff || 0) + (t.takenMult ? Math.abs(1 - t.takenMult) : 0));
    if (t.heal) team += t.heal * (t.kind === 'heal_zone' ? t.duration / t.tick : 1) / t.cooldown / hitDps;
    if (t.barrier) team += t.barrier / t.cooldown / hitDps;
  }
  const find = { goldFindPct: d.goldFindPct || 0, materialFindPct: d.materialFindPct || 0, gearFindPct: d.gearFindPct || 0 };
  const income = farmingIncome(data, spec.kit, spec.level, find, null, m.hp / Math.max(1e-6, single)).net;
  return {
    axes: { single, pack, survival, sustain, mobility, team, income },
    cost: { points: (spec.jobNodes || []).length, gear: spec.gear || null, mpPerSecond: s.cost * Math.min(rate, mana(1)) },
  };
}

/** a dominates b: at least (1 - tolerance) of b on every axis and better by tolerance on one. */
export function dominates(a, b, tolerance) {
  let better = false;
  for (const k of AXES) {
    if (a.axes[k] < b.axes[k] * (1 - tolerance)) return false;
    if (a.axes[k] > b.axes[k] * (1 + tolerance) + 1e-9) better = true;
  }
  return better;
}

/** The best value of every axis in a field. */
export function fieldBest(profiles) {
  const out = {};
  for (const k of AXES) out[k] = Math.max(...profiles.map((p) => p.axes[k]));
  return out;
}

/** Axes where a build sits clearly below the best of the field: its weaknesses. */
export function weaknesses(profile, best, weakness) {
  return AXES.filter((k) => profile.axes[k] < best[k] * weakness);
}

/**
 * Audit a field of builds of equal cost. Each build: { id, group, role, profile }; role is the axis it
 * is built to lead (or null for an all-round build), group joins the variants of one plan (a line
 * with different gear sets). Returns:
 * - overpowered: [winner, loser] where the winner dominates a specialist of another role (a build
 *   that, the winner aside, leads its axis), so the winner gives up nothing for that strength;
 * - traps: [winner, loser] otherwise (same role, no role, or a loser that leads nothing): the loser is
 *   simply a worse choice;
 * - noWeakness: builds within `weakness` of the field's best on every axis;
 * - roleMisses: groups whose best variant does not clearly lead its own axis (a tie leads nothing);
 *   roleGaps: same-role groups
 *   (best variants) further apart on their axis than sameRoleGap.
 */
export function auditBuilds(data, builds) {
  const R = data.progression.balance.rules, best = fieldBest(builds.map((x) => x.profile));
  const overpowered = [], traps = [], noWeakness = [], roleMisses = [], roleGaps = [];
  // a specialist is a group's best variant that, leaving the challenger aside, is clearly above every
  // build of another role on its axis (a tie, e.g. everyone at a cap, makes no specialist)
  const groups = new Map();
  for (const x of builds) { const g = x.group || x.id, cur = groups.get(g); if (x.role && (!cur || x.profile.axes[x.role] > cur.profile.axes[x.role])) groups.set(g, x); }
  const tops = [...groups.values()];
  const specialist = (x, challenger) => tops.includes(x) && builds.every((o) => o === challenger || o.role === x.role || x.profile.axes[x.role] > o.profile.axes[x.role] * (1 + R.tolerance));
  for (const a of builds) for (const b of builds) {
    if (a === b || !dominates(a.profile, b.profile, R.tolerance)) continue;
    (a.role !== b.role && specialist(b, a) ? overpowered : traps).push([a.id, b.id]);
  }
  for (const x of builds) if (!weaknesses(x.profile, best, R.weakness).length) noWeakness.push(x.id);
  // roles are judged on each group's best variant (a line with the gear set that suits it best)
  for (const role of new Set(tops.map((x) => x.role))) {
    const own = tops.filter((x) => x.role === role), others = builds.filter((x) => x.role !== role);
    const top = Math.max(...others.map((x) => x.profile.axes[role]));
    for (const x of own) if (x.profile.axes[role] <= top * (1 + R.tolerance)) roleMisses.push({ id: x.id, role, leader: others.find((o) => o.profile.axes[role] === top).id });
    const vals = own.map((x) => x.profile.axes[role]), gap = Math.max(...vals) / Math.min(...vals) - 1;
    if (own.length > 1 && gap > R.sameRoleGap) roleGaps.push({ role, ids: own.map((x) => x.id), gap });
  }
  return { best, overpowered, traps, noWeakness, roleMisses, roleGaps };
}
