// Content budgets (owner, 2026-10-27): every skill, mod and Job Tree node is measured, when it is
// added, with the same build profile the balance rules use (core/build-rules.js), and compared with
// the others of its class. A skill is worth what it adds to a reference hero of its weapon (as the
// main attack, or slotted beside the main attack, or as a support skill); a mod is worth what it adds
// to the skills it fits. The score weighs each axis like the budget rule (progression.balance.rules
// budgetWeights): the log of each axis' ratio, absolute for team help, each axis held within +-1.
// Things the profile cannot see (summons, knockback, a pull, a slow) score 0 and are listed as
// unmeasured rather than judged. Pure: no live game.
import { buildProfile, AXES } from './build-rules.js';

const HEAVY = ['greatblade', 'axe', 'mace'];

/** The reference build a skill is judged on: the kit (or a heavy or dagger build) of its weapon. */
export function referenceFor(data, def) {
  const b = data.progression.balance.builds, need = def.requiresWeapon || [];
  if (need.includes('bow')) return { kit: 'bow', build: b.bow };
  if (need.includes('staff') || need.includes('wand') || (!need.length && def.power === 'spell')) return { kit: 'staff', build: b.staff };
  if (need.length && need.every((w) => HEAVY.includes(w))) return { kit: 'heavy', build: { skill: 'slash', weaponType: need[0], weaponFactor: 2.2, weaponSplit: { attack: 0.95, magic: 0.05 }, stats: { STR: 0.6 } } };
  if (need.length && need.every((w) => w === 'dagger')) return { kit: 'dagger', build: { skill: 'weakpoint', weaponType: 'dagger', weaponFactor: 2, weaponSplit: { attack: 0.92, magic: 0.08 }, stats: { DEX: 0.4, STR: 0.3 } } };
  return { kit: 'sword', build: { ...b.sword, weaponType: need[0] || b.sword.weaponType } };
}

/** main (a quick attack), burst (a damage skill on a cooldown), or the support kind. */
export function skillClass(def) {
  if (def.damage && def.kind !== 'counter_stance') return def.cooldown <= 1.6 ? 'main' : 'burst';
  if (def.kind === 'buff' || def.kind === 'aura') return 'buff';
  if (def.heal) return 'heal';
  if (def.barrier) return 'barrier';
  return def.kind; // summon, curse_zone, wall, counter_stance: judged by kind
}

/** The weighted value of profile p over base b: per axis the log of the ratio (a doubling counts as
 * much as a halving costs), absolute for team help, each axis held within +-1 so one axis running to
 * a cap cannot swamp the rest. */
export function scoreGain(data, p, b) {
  const w = data.progression.balance.rules.budgetWeights, clamp = (x) => Math.max(-1, Math.min(1, x));
  return AXES.reduce((a, k) => a + (w[k] || 0) * clamp(b[k] > 0 ? (p[k] > 0 ? Math.log(p[k] / b[k]) : -1) : p[k] - b[k]), 0);
}

const profile = (data, ref, level, extra) => buildProfile(data, { kit: ref.kit, build: ref.build, level, gear: 'mixed', ...extra }).axes;

/** What one skill adds: { id, cls, ref, score, gain (per axis) }. */
export function skillValue(data, id, level) {
  const def = data.skills.combat[id], ref = referenceFor(data, def), cls = skillClass(def), main = ref.build.skill;
  const base = profile(data, ref, level, { loadout: [main] });
  const withIt = cls === 'main' ? profile(data, ref, level, { loadout: [id] })
    : def.damage ? profile(data, ref, level, { loadout: [main, id] })
      : profile(data, ref, level, { loadout: [main], support: [id] });
  // a main attack replaces the reference one: its value is its gain over it (0 = as good)
  const gain = Object.fromEntries(AXES.map((k) => [k, base[k] > 0 ? withIt[k] / base[k] - 1 : withIt[k]]));
  return { id, cls, ref: ref.kit, refMain: main, score: scoreGain(data, withIt, base), gain };
}

/** What one mod adds at its top level on each skill it fits; its value is the best and the median. */
export function modValue(data, modId, level, fits) {
  const rows = [];
  for (const id of Object.keys(data.skills.combat)) {
    const def = data.skills.combat[id];
    if (!fits(def, data.mods.mods[modId])) continue;
    const ref = referenceFor(data, def), cls = skillClass(def), main = ref.build.skill;
    const lo = cls === 'main' ? [id] : def.damage ? [main, id] : [main];
    const sup = !def.damage ? [id] : [];
    const slot = cls === 'main' ? 0 : def.damage ? 1 : 1;
    const plain = profile(data, ref, level, { loadout: lo, support: sup });
    const modded = profile(data, ref, level, { loadout: lo, support: sup, mods: { [slot]: [modId] } });
    rows.push({ skill: id, score: scoreGain(data, modded, plain) });
  }
  rows.sort((a, b) => b.score - a.score);
  return { id: modId, rows, best: rows[0]?.score ?? 0, median: rows[Math.floor(rows.length / 2)]?.score ?? 0 };
}

/** Each item's score against its class median: { items: [{id, cls, score, ratio}], medians }. */
export function classBands(items) {
  const medians = {};
  for (const cls of new Set(items.map((x) => x.cls))) {
    const v = items.filter((x) => x.cls === cls && x.score !== 0).map((x) => x.score).sort((a, b) => a - b);
    medians[cls] = v.length ? v[Math.floor(v.length / 2)] : 0;
  }
  return { medians, items: items.map((x) => ({ ...x, ratio: medians[x.cls] ? x.score / medians[x.cls] : null })) };
}

/**
 * Every skill and mod against its band (progression.balance.budgets): a skill's score by class (a
 * main attack against its weapon's reference main), a mod's best score over the skills it fits.
 * Returns { skills, mods } rows with out = 'over' | 'under' | null; unmeasured items are not judged.
 */
export function budgetAudit(data, level, fits) {
  const B = data.progression.balance.budgets;
  const band = (cls) => B.skill[cls] || B.skill.support;
  const skills = Object.keys(data.skills.combat).map((id) => skillValue(data, id, level)).map((x) => {
    const [lo, hi] = band(x.cls), unmeasured = x.score === 0 && x.id !== x.refMain && x.cls !== 'main';
    return { ...x, band: [lo, hi], out: unmeasured || x.id === x.refMain ? null : x.score > hi ? 'over' : x.score < lo ? 'under' : null };
  });
  const mods = Object.keys(data.mods.mods).filter((id) => !data.mods.mods[id].retired).map((id) => modValue(data, id, level, fits)).map((m) => {
    const [lo, hi] = B.mod, unmeasured = !m.rows.length || m.rows.every((r) => r.score === 0);
    return { id: m.id, best: m.best, bestSkill: m.rows[0]?.skill, band: [lo, hi], out: unmeasured ? null : m.best > hi ? 'over' : m.best < lo ? 'under' : null };
  });
  return { skills, mods };
}
