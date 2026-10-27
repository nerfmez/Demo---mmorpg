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

/** Total damage of one cast before armour and crit (waves, ticks, repeats and a full charge counted). */
export function castDamage(s) {
  let dmg = s.damage || 0;
  if (s.kind === 'dot_zone') dmg *= s.duration / (s.tick || 0.5);
  if (s.def?.waves) dmg *= s.def.waves;
  if (s.repeats) dmg *= 1 + s.repeats * (s.repeatMult || 0);
  if (s.charge) dmg *= s.charge.maxDamageMult || 1;
  return dmg * Math.max(1, s.projectiles || 1);
}

/** Hits of one cast on a pack: the shape's reach, a chain's falloff along its jumps. */
function packHits(s, pack) {
  if (s.kind !== 'chain') return packTargets(s, pack);
  let sum = 0;
  for (let k = 0; k < Math.min(pack.size, 1 + (s.chain || 0)); k++) sum += (s.chainFalloff || 1) ** k;
  return sum;
}

/**
 * A build's profile. spec: { kit, level, jobNodes, gear (a gear set id), loadout (skill ids: the
 * first is the main attack, the rest are cast whenever ready), support (skills that only help),
 * build (a reference build for a kit not in progression.balance.builds) }. Node effects may carry
 * scenario stats the character sheet ignores: singleDamagePct (bosses and single targets),
 * packDamagePct, perTargetDamagePct (per enemy one cast hits, up to perTargetCap), selfTakenPct,
 * teamBuffPct (buffs and heals we give), teamTakenPct (allies near us take less), teamDamagePct
 * (allies deal more to our targets).
 */
export function buildProfile(data, spec) {
  const R = data.progression.balance.rules, b = data.progression.balance;
  const build = spec.build || b.builds[spec.kit];
  const loadout = spec.loadout || [build.skill], support = spec.support || [];
  // the gear set rides in as one extra source of stats, so it meets the same soft caps and caps
  const gearNode = '~gear', mainDef = data.skills.combat[loadout[0]];
  const D = { ...data, jobtree: { ...data.jobtree, nodes: { ...data.jobtree.nodes, [gearNode]: { effects: gearSetStats(data, spec.gear, mainDef) } } },
    progression: { ...data.progression, balance: { ...b, builds: { ...b.builds, [spec.kit]: { ...build, skill: loadout[0] } } } } };
  const { ch, d } = referenceHero(D, spec.kit, spec.level, [...(spec.jobNodes || []), gearNode]);
  [...loadout.slice(1), ...support].forEach((id, i) => { ch.slots[i + 1] = { skill: id, mods: [] }; ch.skills[id] = skillRankAt(data, spec.level); });
  const skills = ch.slots.map((sl, i) => sl.skill && computeSkill(ch, data, d, i)).filter(Boolean);
  const attacks = skills.slice(0, loadout.length), helpers = skills.slice(loadout.length);
  const m = referenceMonster(data, spec.level), hitDps = m.damage / m.hitInterval, sec = R.fightSeconds;
  const crit = 1 + d.critChance * (d.critMult - 1), armour = defenseFactor(m.defense * (1 - (d.penetrationPct || 0) / 100), data);
  const pct = (k) => (d[k] || 0) / 100;
  // rotation: cooldown skills whenever ready, each holding the hero for its cast and a short recovery;
  // the main attack fills the rest of the fighting time; MP cuts the main attack first
  const lock = (s) => s.castTime + (s.charge ? s.charge.duration : 0) + R.recover;
  const busy = attacks.slice(1).reduce((a, s) => a + lock(s) / s.cooldown, 0);
  const main = attacks[0], interval = Math.max(main.cooldown, main.castTime, 0.35);
  const rates = attacks.map((s, i) => i === 0 ? Math.max(0, b.uptime - busy) / interval : b.uptime / s.cooldown);
  const hitsPerSecond = (hitsOf) => attacks.reduce((a, s, i) => a + rates[i] * hitsOf(s), 0);
  const supply = (d.maxMp + d.mpRegen * sec) / sec;
  // support skills cast on cooldown unless their MP alone outruns the supply, then as often as it allows
  const helperCost = helpers.reduce((a, s) => a + s.cost / s.cooldown, 0), helperShare = helperCost > supply ? supply / helperCost : 1;
  const spend = (hitsOf) => attacks.reduce((a, s, i) => a + rates[i] * s.cost, 0) + helperCost * helperShare - (d.mpOnHit || 0) * hitsPerSecond(hitsOf);
  const fit = (hitsOf) => { // scale the main attack down until the MP lasts the fight
    const over = spend(hitsOf) - supply;
    if (over <= 0) return rates;
    const r = [...rates], cut = Math.min(r[0], over / Math.max(1e-6, main.cost - (d.mpOnHit || 0) * hitsOf(main)));
    r[0] -= cut;
    const left = over - cut * (main.cost - (d.mpOnHit || 0) * hitsOf(main));
    if (left > 1e-9) { const rest = attacks.slice(1).reduce((a, s, i) => a + r[i + 1] * s.cost, 0); for (let i = 1; i < r.length; i++) r[i] *= Math.max(0, 1 - left / Math.max(1e-6, rest)); }
    return r;
  };
  // debuffs a build lays on its targets: exposure and curses raise the damage everyone deals
  const amp = 1 + [...attacks, ...helpers].reduce((a, s) => a + (s.def.exposure ? s.def.exposure.fraction * Math.min(1, s.def.exposure.duration / s.cooldown) : 0)
    + (s.kind === 'curse_zone' && s.takenMult ? (s.takenMult - 1) * Math.min(1, s.duration / s.cooldown) : 0), 0);
  const dealt = (hitsOf, scen) => {
    const r = fit(hitsOf);
    return attacks.reduce((a, s, i) => {
      const hits = hitsOf(s), perTarget = scen === 'pack' ? Math.min(pct('perTargetDamagePct') * hits, pct('perTargetCap') || Infinity) : 0;
      return a + r[i] * castDamage(s) * hits * (1 + pct(scen === 'pack' ? 'packDamagePct' : 'singleDamagePct') + perTarget);
    }, 0) * crit * armour * amp;
  };
  const single = dealt(() => 1, 'single'), pack = dealt((s) => packHits(s, R.pack), 'pack');
  const sustain = (() => { const drain = spend(() => 1) - d.mpRegen; return drain <= 0 ? R.survivalCap : Math.min(R.survivalCap, d.maxMp / drain); })();
  // survival: the pack's hits through armour, block, dodge and our own guarding buffs, against
  // regeneration, leech and our own barriers
  let guard = 1 - pct('selfTakenPct'), shield = 0;
  const share = (s) => helpers.includes(s) ? helperShare : 1;
  for (const s of [...attacks, ...helpers]) {
    const up = s.duration ? Math.min(1, s.duration / s.cooldown) * share(s) : 0;
    if (s.kind === 'buff' && s.takenMult) guard *= 1 - (1 - s.takenMult) * up;
    if (s.barrier) shield += s.barrier / s.cooldown * share(s);
  }
  // standing in a pack (pack.size monsters), not one: one monster's hits hardly test a tank
  const incoming = hitDps * R.pack.size * defenseFactor(d.defense, data) * (1 + pct('damageTakenPct')) * guard
    * (1 - Math.min(1, pct('dodgeChancePct'))) * (1 - (d.blockChance || 0) * (1 - data.progression.combat.block.taken));
  const net = incoming - (d.hpRegen || 0) - pct('leechPct') * single - shield;
  const survival = net <= 0 ? R.survivalCap : Math.min(R.survivalCap, (d.maxHp + (d.maxShield || 0)) / net);
  const mv = movementSkill(ch, data, d);
  const mobility = d.moveSpeed + (mv.charges ? mv.distance / Math.max(0.1, mv.recharge) : 0);
  // team: what the build gives allies (buff share x uptime; healing and barriers per second measured
  // against the pack's damage per second; an aura that cuts allies' damage taken)
  let team = pct('teamTakenPct') + pct('teamDamagePct') + (amp - 1); // our debuffs raise everyone's damage
  const packDps = hitDps * R.pack.size;
  for (const t of [...attacks, ...helpers]) {
    const up = t.duration ? Math.min(1, t.duration / t.cooldown) * share(t) : 0, power = 1 + pct('teamBuffPct');
    if (t.kind === 'buff' && t.def.radius) team += up * power * ((t.damageBuff || 0) + (t.speedBuff || 0) + (t.takenMult ? 1 - t.takenMult : 0));
    if (t.heal) team += share(t) * power * t.heal * (t.kind === 'heal_zone' ? t.duration / t.tick : 1) / t.cooldown / packDps;
    if (t.barrier && t.def.radius) team += share(t) * power * t.barrier / t.cooldown / packDps;
  }
  const find = { goldFindPct: d.goldFindPct || 0, materialFindPct: d.materialFindPct || 0, gearFindPct: d.gearFindPct || 0 };
  const income = farmingIncome(D, spec.kit, spec.level, find, null, m.hp / Math.max(1e-6, single)).net;
  return {
    axes: { single, pack, survival, sustain, mobility, team, income },
    cost: { points: (spec.jobNodes || []).length, gear: spec.gear || null, mpPerSecond: spend(() => 1) },
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
 * - overBudget / underBudget: plans whose weighted profile is far above or below the median plan
 *   (too much, or too little, for the same points);
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
  // too much for the price: a plan whose weighted profile (each axis as a share of the field's best)
  // sits above the field's median plan by more than budgetBand
  const score = (x) => AXES.reduce((a, k) => a + (R.budgetWeights[k] || 0) * (best[k] > 0 ? x.profile.axes[k] / best[k] : 0), 0);
  const scores = tops.map((x) => ({ id: x.id, score: score(x) })), mid = [...scores].sort((p, q) => p.score - q.score)[Math.floor(scores.length / 2)]?.score || 0;
  const overBudget = scores.filter((x) => x.score > mid * (1 + R.budgetBand)).map((x) => ({ ...x, ratio: x.score / mid }));
  const underBudget = scores.filter((x) => x.score < mid * (1 - R.budgetBand)).map((x) => ({ ...x, ratio: x.score / mid }));
  return { best, overpowered, traps, noWeakness, roleMisses, roleGaps, scores, overBudget, underBudget };
}
