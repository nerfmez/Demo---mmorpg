// Skill bars (owner, 2026-10-27/28; docs/SKILL-GROWTH-TH.md). A skill of a growth type has that type's
// bars; points earned by using the skill (proficiency) go into them, and each bar gains on one thing
// and pays on others through one shared exchange table (data.progression.skillGrowth). Gains add up,
// costs multiply, so a bar pushed to its end costs more per point than it gives. The grade caps how far
// one bar goes. Pure rules: no DOM, no randomness.

const G = (data) => data.progression.skillGrowth;
const BAR_KEYS = ['power', 'rate', 'size', 'range', 'duration', 'count'];

/** The growth type of a skill definition (null: no bars yet). */
export function growthType(data, def) {
  return def?.growth && G(data)?.types[def.growth] ? def.growth : null;
}

/** The bar ids a skill has, in their display order. */
export function barsOf(data, def) {
  const t = growthType(data, def);
  return t ? [...G(data).types[t].bars] : [];
}

const emptyBars = () => Object.fromEntries(BAR_KEYS.map((k) => [k, 0]));

/** The stored growth of one skill, normalised (never null for a skill with bars). */
export function growthOf(ch, data, id) {
  const def = data.skills.combat[id];
  if (!growthType(data, def)) return null;
  const g = ch.skillGrowth?.[id] || {};
  const grades = Object.keys(G(data).grades);
  return {
    grade: grades.includes(g.grade) ? g.grade : grades[0],
    bars: { ...emptyBars(), ...(g.bars || {}) },
    earned: Math.max(0, Math.min(limitOf(data, grades.includes(g.grade) ? g.grade : grades[0]), g.earned | 0)),
    prof: Math.max(0, +g.prof || 0),
  };
}

/** The points a skill can hold at a grade (the grade caps the whole skill, not only each bar). */
export const limitOf = (data, grade) => G(data).gradeTotals?.[grade] ?? G(data).totalPoints;

const spentOf = (bars) => BAR_KEYS.reduce((a, k) => a + (bars[k] || 0), 0);

/** What the bars do to a skill: { damage, cooldown, mana, size, range, duration, haste, projectiles,
 * spread, perProjectile } as multipliers/additions. bars: points per bar. */
export function barEffects(data, def, bars) {
  const g = G(data), has = new Set(barsOf(data, def)), out = { damage: 1, cooldown: 1, mana: 1, size: 1, range: 1, duration: 1, haste: 0, projectiles: 0, spread: 0, perProjectile: 1 };
  const add = { damage: 0, size: 0, range: 0, duration: 0 };
  for (const k of has) {
    const n = bars[k] || 0, b = g.bars[k];
    if (!n) continue;
    for (const [stat, v] of Object.entries(b.gain)) {
      if (stat === 'haste') out.haste += v * n;
      else if (stat in add && (stat !== 'size' || has.has('size'))) add[stat] += v * n; // power grows the size only where the skill has one
    }
    if (k === 'count') {
      out.projectiles = Math.floor(n / b.gain.countEvery);
      const total = 1 + out.projectiles;
      out.spread = b.gain.countSpread * (total - 1);
      out.perProjectile = total ** -b.gain.countDamageExp;
    }
    for (const [stat, f] of Object.entries(b.cost)) {
      // a cost on something the skill has no bar for is paid in MP instead, at part of its strength
      const own = stat === 'cooldown' || stat === 'mana' || stat === 'damage' || has.has(stat);
      if (own) out[stat] *= f ** n;
      else out.mana *= (1 + Math.abs(1 - f) * g.missingCostToMana) ** n;
    }
  }
  for (const k in add) out[k] *= 1 + add[k];
  return out;
}

/** Apply a skill's bars to its compiled parameters s (core/skills.js computeSkill). Returns the skill
 * haste the rate bar adds (it joins the character's speed under the central cap). */
export function applyBars(data, s, def, growth) {
  if (!growth) return 0;
  const e = barEffects(data, def, growth.bars);
  s.damageMult *= e.damage * e.perProjectile;
  s.costMult *= e.mana;
  s.growthCooldown = e.cooldown;
  if (e.size !== 1) {
    if (s.radius) s.radius *= e.size;
    if (s.arc && ['melee_arc', 'channel_cone'].includes(s.kind)) { s.arc *= e.size; s.range *= e.size; }
    if (s.kind === 'projectile') s.projectileRadius *= e.size;
  }
  if (e.range !== 1) { s.range *= e.range; if (s.speed) s.speed *= e.range; }
  if (e.duration !== 1 && s.duration) s.duration *= e.duration;
  if (e.projectiles) { s.projectiles += e.projectiles; s.spread = Math.max(s.spread, e.spread); }
  return e.haste;
}

/** The whole state shown on a skill's card: grade, cap per bar, points earned/spent/free, proficiency. */
export function growthState(ch, data, id) {
  const g = growthOf(ch, data, id);
  if (!g) return null;
  const cfg = G(data), spent = spentOf(g.bars), grades = Object.keys(cfg.grades), next = grades[grades.indexOf(g.grade) + 1] || null;
  return { ...g, bars: g.bars, barIds: barsOf(data, data.skills.combat[id]), cap: cfg.grades[g.grade], spent, free: g.earned - spent,
    total: cfg.totalPoints, limit: limitOf(data, g.grade), waiting: g.earned >= limitOf(data, g.grade) && g.earned < cfg.totalPoints, need: cfg.secondsPerPoint, nextGrade: next, nextCost: next ? gradeCost(data, id, next) : null };
}

/** Proficiency: a cast of a skill with bars, worth `pace` seconds (its own rhythm, so a slow skill
 * grows as fast as a quick one used at its pace). At its grade's total the bar fills and waits for the
 * next grade (no points are banked past it). Returns the points earned by it (0 or more). */
export function gainProficiency(ch, data, id, pace) {
  const g = growthOf(ch, data, id);
  if (!g || g.earned >= G(data).totalPoints) return 0;
  const need = G(data).secondsPerPoint, limit = limitOf(data, g.grade);
  let prof = g.prof + Math.max(0, pace), earned = g.earned, got = 0;
  while (prof >= need && earned < limit) { prof -= need; earned++; got++; }
  if (earned >= G(data).totalPoints) prof = 0;
  else if (earned >= limit) prof = Math.min(prof, need);
  store(ch, id, { ...g, prof, earned });
  return got;
}

function store(ch, id, g) {
  ch.skillGrowth ||= {};
  ch.skillGrowth[id] = { grade: g.grade, bars: Object.fromEntries(Object.entries(g.bars).filter(([, n]) => n > 0)), earned: g.earned, prof: Math.round(g.prof * 100) / 100 };
}

/** Gold to take `n` points back out of bars at the character's level. */
export function respecCost(ch, data, n) {
  const r = G(data).respec;
  return n > 0 ? n * (r.gold + r.goldPerLevel * ch.level) : 0;
}

/** Check (and with apply, make) a new allocation. Adding points is free; every point taken out of a
 * bar costs respecCost. Returns { ok, reason?, removed, gold }. */
export function allocateBars(ch, data, id, bars, apply = false) {
  const g = growthOf(ch, data, id);
  if (!g) return { ok: false, reason: 'no_bars' };
  const own = barsOf(data, data.skills.combat[id]), cap = G(data).grades[g.grade], next = emptyBars();
  for (const k of BAR_KEYS) {
    const n = bars[k] | 0;
    if (n < 0 || (n && !own.includes(k))) return { ok: false, reason: 'bar' };
    if (n > cap) return { ok: false, reason: 'cap' };
    next[k] = n;
  }
  if (spentOf(next) > g.earned) return { ok: false, reason: 'points' };
  const removed = BAR_KEYS.reduce((a, k) => a + Math.max(0, g.bars[k] - next[k]), 0), gold = respecCost(ch, data, removed);
  if (gold > ch.gold) return { ok: false, reason: 'gold', removed, gold };
  if (apply) { ch.gold -= gold; store(ch, id, { ...g, bars: next }); }
  return { ok: true, removed, gold };
}

/** The cost of raising a skill to grade `to`: gold, its own grade material and any boss part. */
export function gradeCost(data, id, to) {
  const c = G(data).gradeUpgrade[to], def = data.skills.combat[id];
  if (!c) return null;
  const out = {};
  for (const [k, v] of Object.entries(c)) out[k === 'material' ? def.gradeMaterial : k] = (out[k === 'material' ? def.gradeMaterial : k] || 0) + v;
  return out;
}

/** Raise the grade by one (at a workbench or trainer; the caller checks the place). */
export function upgradeGrade(ch, data, id, apply = false) {
  const st = growthState(ch, data, id);
  if (!st) return { ok: false, reason: 'no_bars' };
  if (!st.nextGrade) return { ok: false, reason: 'max' };
  const cost = st.nextCost, missing = [];
  for (const [k, n] of Object.entries(cost)) if ((k === 'gold' ? ch.gold : ch.materials[k] || 0) < n) missing.push(k);
  if (missing.length) return { ok: false, reason: 'materials', missing, cost };
  if (apply) {
    for (const [k, n] of Object.entries(cost)) { if (k === 'gold') ch.gold -= n; else ch.materials[k] -= n; }
    const g = growthOf(ch, data, id);
    store(ch, id, { ...g, grade: st.nextGrade });
    // a full bar that was waiting for this grade turns into its point now
    if (g.prof >= G(data).secondsPerPoint) gainProficiency(ch, data, id, 0);
  }
  return { ok: true, cost, to: st.nextGrade };
}

/** Save shape v16: keep only skills that have bars, with sane numbers. */
export function normalizeSkillGrowth(ch, data) {
  const out = {};
  for (const id of Object.keys(ch.skillGrowth || {})) {
    const g = growthOf(ch, data, id);
    if (!g) continue;
    const cap = G(data).grades[g.grade], own = barsOf(data, data.skills.combat[id]);
    for (const k of BAR_KEYS) g.bars[k] = own.includes(k) ? Math.max(0, Math.min(cap, g.bars[k] | 0)) : 0;
    // more spent than earned (a hand-edited save): take back from the last bars first
    for (let over = spentOf(g.bars) - g.earned, i = own.length - 1; over > 0 && i >= 0; i--) { const t = Math.min(over, g.bars[own[i]]); g.bars[own[i]] -= t; over -= t; }
    store(out, id, g);
  }
  ch.skillGrowth = out.skillGrowth || {};
}
