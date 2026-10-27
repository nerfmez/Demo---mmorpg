// Content budgets (owner, 2026-10-27): every skill, mod and Job Tree node is measured, when it is
// added, with the same build profile the balance rules use (core/build-rules.js), and compared with
// the others of its class. A skill is worth what it adds to a reference hero of its weapon (as the
// main attack, or slotted beside the main attack, or as a support skill); a mod is worth what it adds
// to the skills it fits. The score weighs each axis like the budget rule (progression.balance.rules
// budgetWeights): the log of each axis' ratio, absolute for team help, each axis held within +-1.
// Things the profile cannot see (summons, knockback, a pull, a slow) score 0 and are listed as
// unmeasured rather than judged. MP is priced, not a wall (phase 1 of docs/SKILL-GROWTH-TH.md): every
// cast is measured as if MP never ran out, and the MP a build spends past its own supply is bought
// back the cheapest way first: MP potions up to what their cooldown allows (their gold, for the
// fighting share of each hour, on the income axis), then trading damage gear rolls for mana ones.
// A hard MP wall made any added cost free on a build just under its supply and ruinous on one just
// over it; the price is now smooth and rises with the shortfall. Pure: no live game.
import { buildProfile, AXES, USES } from './build-rules.js';
import { referenceMonster } from './balance.js';

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

const run = (data, ref, level, extra) => buildProfile(data, { kit: ref.kit, build: ref.build, level, gear: 'mixed', mpFree: true, ...extra });
/** MP per second to spare: supply over spending. */
const spare = (p) => p.cost.mpSupply - p.cost.mpPerSecond;
const prices = new WeakMap();

/** Scores per MP per second on a reference: { potion, cap, gear }. potion: the cheapest MP potion's
 * gold per MP at this pool, drunk for the fighting share of an hour, as a share of the income axis;
 * cap: MP per second potions can give at most (the best potion each group cooldown); gear: the best
 * damage roll's score over the MP per second the best mana roll frees (more supply, a cheaper cast
 * or MP back on hit), mid-range rolls. */
export function mpPrice(data, ref, level) {
  const memo = prices.get(data) || new Map(), key = `${ref.kit}.${ref.build.skill}.${level}`;
  prices.set(data, memo);
  if (memo.has(key)) return memo.get(key);
  const R = data.progression.balance.rules, main = data.skills.combat[ref.build.skill];
  const probe = { power: main.power, tags: new Set(main.tags || []) };
  const withRoll = (id) => {
    const o = data.items.gearOptions[id];
    const D = { ...data, jobtree: { ...data.jobtree, nodes: { ...data.jobtree.nodes, '~roll': { effects: { [o.stat]: (o.min + o.max) / 2 } } } } };
    return run(D, ref, level, { loadout: [ref.build.skill], jobNodes: ['~roll'] });
  };
  const base = run(data, ref, level, { loadout: [ref.build.skill] });
  const usable = (id) => { const st = data.items.gearOptions[id].stat; return !USES[st] || USES[st](probe); };
  const damage = Math.max(...R.gearSets.offense.filter(usable).map((id) => scoreGain(data, withRoll(id).axes, base.axes)));
  const mana = Math.max(...['mp_flat', 'mp_regen_pct', 'mana_cost_pct', 'mp_on_hit'].map((id) => spare(withRoll(id)) - spare(base)));
  const gear = mana > 0 ? damage / mana : Infinity;
  const b = data.progression.balance, pool = base.cost.maxMp, C = data.items.consumables;
  const pots = Object.values(C.types).filter((t) => t.group === 'mp'), restore = (t) => (t.restore.mp || 0) + (t.restore.mpPct || 0) / 100 * pool;
  const goldPerMp = Math.min(...pots.map((t) => t.price / restore(t)));
  const ttk = referenceMonster(data, level).hp / base.axes.single, fight = ttk / (ttk + b.secondsPerKill);
  const potion = (R.budgetWeights.income || 0) * 3600 * fight * goldPerMp / base.axes.income;
  const cap = pots.length ? Math.max(...pots.map(restore)) / (C.groupCooldown.mp || 1) : 0;
  const out = { potion: Math.min(potion, gear), cap, gear };
  memo.set(key, out);
  return out;
}

/** The score it costs to buy back a shortfall of `short` MP per second: nothing within the build's own
 * supply, potions up to their cap, gear past it. */
export function mpCost(price, short) {
  const s = Math.max(0, short);
  return price.potion * Math.min(s, price.cap) + price.gear * Math.max(0, s - price.cap);
}

/** The score of profile p over base b on a reference, MP priced: the sustain axis is left out (the
 * price stands for it) and p pays for its MP shortfall beyond b's (mpCost). */
export function pricedGain(data, ref, level, p, b) {
  const price = mpPrice(data, ref, level);
  return scoreGain(data, { ...p.axes, sustain: b.axes.sustain }, b.axes) - (mpCost(price, -spare(p)) - mpCost(price, -spare(b)));
}

/** What one skill adds: { id, cls, ref, score, gain (per axis) }. */
export function skillValue(data, id, level) {
  const def = data.skills.combat[id], ref = referenceFor(data, def), cls = skillClass(def), main = ref.build.skill;
  const base = run(data, ref, level, { loadout: [main] });
  const withIt = cls === 'main' ? run(data, ref, level, { loadout: [id] })
    : def.damage ? run(data, ref, level, { loadout: [main, id] })
      : run(data, ref, level, { loadout: [main], support: [id] });
  // a main attack replaces the reference one: its value is its gain over it (0 = as good)
  const gain = Object.fromEntries(AXES.map((k) => [k, base.axes[k] > 0 ? withIt.axes[k] / base.axes[k] - 1 : withIt.axes[k]]));
  gain.mpPerSecond = withIt.cost.mpPerSecond - base.cost.mpPerSecond;
  return { id, cls, ref: ref.kit, refMain: main, score: pricedGain(data, ref, level, withIt, base), gain };
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
    const plain = run(data, ref, level, { loadout: lo, support: sup });
    const modded = run(data, ref, level, { loadout: lo, support: sup, mods: { [slot]: [modId] } });
    rows.push({ skill: id, score: pricedGain(data, ref, level, modded, plain) });
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
