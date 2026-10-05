// Balance model: a reference hero of each starting kit at every level, wearing the expected
// gear tier for that level, fighting the average normal monster of the same level. It gives
// time-to-kill, time-to-die (standing still, no dodging) and minutes per level, so the
// numbers in data/ can be checked against data.progression.balance.targets by a test.
// Pure: it never touches a live game. Reproduce with `node scripts/balance-report.mjs`.
import { createCharacter, derive, expToNext } from './character.js';
import { computeSkill } from './skills.js';
import { gearDropCandidates, gearRecipe } from './crafting.js';

/** The expected gear item level at character level `level`: the highest tier reached. */
export function gearTierAt(data, level) {
  const tiers = data.progression.balance.gearTiers;
  return tiers.filter((t) => t <= level).pop() || tiers[0];
}

/** Skill rank the reference hero has at `level` (ranks are not level-gated; balanceLevel is when it typically affords each). */
export function skillRankAt(data, level) {
  const steps = data.progression.skillUpgrade.steps;
  return 1 + steps.filter((s) => s.balanceLevel <= level).length;
}

/** The average normal (non-boss) monster at `level`. */
export function referenceMonster(data, level) {
  const list = Object.values(data.monsters.monsters).filter((m) => !m.boss);
  const avg = (f) => list.reduce((a, m) => a + f(m), 0) / list.length;
  const sc = data.progression.monsterScaling, L = level - 1, b = data.progression.balance.monster;
  return {
    hp: avg((m) => m.hp) * (1 + sc.hpPerLevel * L),
    damage: avg((m) => m.damage) * (1 + sc.damagePerLevel * L) * b.hitMult,
    defense: avg((m) => m.defense) * (1 + sc.defensePerLevel * L),
    exp: avg((m) => m.exp) * (1 + sc.expPerLevel * L),
    jobExp: avg((m) => m.jobExp) * (1 + sc.expPerLevel * L),
    hitInterval: b.hitInterval,
  };
}

/** A character of `kit` at `level`: stat points spent per the kit's build, main skill slotted. */
export function referenceHero(data, kit, level, jobNodes = null) {
  const b = data.progression.balance, build = b.builds[kit];
  const ch = createCharacter(data, { kit });
  ch.level = level;
  const points = data.progression.character.startingStatPoints + data.progression.character.statPointsPerLevel * (level - 1);
  let spent = 0;
  for (const [stat, share] of Object.entries(build.stats)) {
    const n = Math.floor(points * share);
    ch.stats[stat] += n;
    spent += n;
  }
  ch.stats.VIT += points - spent;
  ch.slots = [{ skill: build.skill, mods: [] }, ...ch.slots.slice(1).map(() => ({ skill: null, mods: [] }))];
  ch.skills[build.skill] = skillRankAt(data, level);
  if (jobNodes) ch.jobNodes = [data.jobtree.origin, ...jobNodes];
  // Expected gear stands in for items: a weapon pair/two-hand weapon and an armour set.
  ch.gear = [];
  for (const s of Object.keys(ch.equipped)) ch.equipped[s] = null;
  const d = derive(ch, data);
  const il = gearTierAt(data, level), g = b.gear, ref = data.items.handRules.reference;
  const weapon = (ref.base + ref.perItemLevel * (il - 1)) * build.weaponFactor * g.gradeMult;
  for (const [stat, share] of Object.entries(build.weaponSplit)) d[stat] += weapon * share;
  const armour = { defense: g.defense[0] + g.defense[1] * (il - 1), maxHp: g.maxHp[0] + g.maxHp[1] * (il - 1) };
  d.defense += armour.defense * g.gradeMult;
  d.maxHp += Math.round(armour.maxHp * g.gradeMult * (1 + d.maxHpPct / 100));
  d.weaponType = build.weaponType;
  return { ch, d, itemLevel: il };
}

export function balanceAt(data, kit, level, jobNodes = null) {
  const b = data.progression.balance;
  const { ch, d, itemLevel } = referenceHero(data, kit, level, jobNodes);
  const m = referenceMonster(data, level);
  const s = computeSkill(ch, data, d, 0);
  // A kill takes `casts` hits. uptime is the share of a fight spent casting (approach, aiming
  // and dodging take the rest). MP regenerates over the fight and the walk to the next one.
  const crit = 1 + d.critChance * (d.critMult - 1);
  const mdef = m.defense * (1 - (d.penetrationPct || 0) / 100);
  const perCast = (s.damage || 0) * crit * Math.max(1, s.projectiles || 1) * (1 - mdef / (mdef + 60));
  const casts = m.hp / perCast;
  const byRate = casts * Math.max(s.cooldown, s.castTime, 0.35) / b.uptime;
  const byMana = s.cost ? (casts * s.cost) / d.mpRegen - b.secondsPerKill : 0;
  const ttk = Math.max(byRate, byMana);
  const dps = m.hp / ttk;
  const taken = (m.damage / m.hitInterval) * (1 - d.defense / (d.defense + 60));
  const ttd = d.maxHp / taken;
  const perKill = ttk + b.secondsPerKill;
  const expPerMin = (60 / perKill) * m.exp;
  const minutes = level < data.progression.character.maxLevel ? expToNext(data, level) / expPerMin : 0;
  return { kit, level, itemLevel, rank: s.level, dps: Math.round(dps * 10) / 10, ttk: Math.round(ttk * 10) / 10, ttd: Math.round(ttd * 10) / 10, minutes: Math.round(minutes * 10) / 10 };
}

/** Rows for every kit and level 1..monster cap, plus hours to reach the cap per kit. */
export function balanceReport(data) {
  const cap = data.progression.balance.monsterCap, rows = [], hours = {};
  for (const kit of Object.keys(data.progression.balance.builds)) {
    let total = 0;
    for (let level = 1; level <= cap; level++) {
      const r = balanceAt(data, kit, level);
      rows.push(r);
      if (level < cap) total += r.minutes;
    }
    hours[kit] = Math.round((total / 60) * 10) / 10;
  }
  return { rows, hours };
}

/** Value of one recipe's inputs (material sell value + gold). */
function recipeValue(data, r) {
  return Object.entries(r.cost).reduce((a, [k, n]) => a + n * (k === 'gold' ? 1 : data.items.materials[k].value), 0);
}

/**
 * Gold-equivalent income per hour at `level` for `kit`, with farming bonuses `find`
 * (goldFindPct/materialFindPct/gearFindPct) and the arrows a bow spends (`arrowRecipe`).
 */
export function farmingIncome(data, kit, level, find = {}, arrowRecipe = null) {
  const b = data.progression.balance, r = balanceAt(data, kit, level), m = referenceMonster(data, level);
  const normals = Object.values(data.monsters.monsters).filter((x) => !x.boss);
  const avg = (f) => normals.reduce((a, x) => a + f(x), 0) / normals.length;
  const gold = avg((x) => x.drops.filter((d) => d.item === 'gold').reduce((a, d) => a + d.chance * (d.min + d.max) / 2, 0)) * (1 + (find.goldFindPct || 0) / 100);
  const mats = avg((x) => [...x.drops, ...data.items.upgradeMaterialDrops].filter((d) => d.item !== 'gold').reduce((a, d) => a + Math.min(1, d.chance * (1 + (find.materialFindPct || 0) / 100)) * (d.min + d.max) / 2 * data.items.materials[d.item].value, 0));
  const g = data.items.salvage.sellGold, il = gearTierAt(data, level);
  const gearRate = Object.entries(data.items.gearDrops.normal).reduce((a, [grade, c]) => a + c * (1 + (find.gearFindPct || 0) / 100) * (g.base + g.perItemLevel * il) * g.gradeMult[grade], 0);
  const killsPerHour = 3600 / (r.ttk + b.secondsPerKill);
  const gross = killsPerHour * (gold + mats + gearRate);
  // A cast per hit: arrows spent per kill = hits to kill, priced by their recipe.
  const skill = data.skills.combat[b.builds[kit].skill];
  const hits = (r.ttk * b.uptime) / Math.max(0.35, skill.cooldown, skill.castTime);
  const arrowCost = arrowRecipe ? killsPerHour * hits * (recipeValue(data, arrowRecipe) / arrowRecipe.qty) : 0;
  return { gross: Math.round(gross), arrows: Math.round(arrowCost), net: Math.round(gross - arrowCost) };
}

/** Journal nodes of one build line, in buying order, with the shared entry path before it. */
export function linePath(data, lineId) {
  const N = data.jobtree.nodes, own = Object.keys(N).filter((id) => N[id].line === lineId);
  const path = [], seen = new Set();
  const visit = (id) => { if (seen.has(id) || id === data.jobtree.origin) return; seen.add(id); for (const p of N[id].requires || []) visit(p); for (const p of N[id].requiresAny || []) if (N[p].line === lineId) visit(p); path.push(id); };
  own.forEach(visit);
  return path;
}

/** Sum of a line's effects (all its nodes), e.g. for caps and the farming model. */
export function lineEffects(data, lineId) {
  const out = {};
  for (const id of linePath(data, lineId)) if (data.jobtree.nodes[id].line === lineId) for (const [k, v] of Object.entries(data.jobtree.nodes[id].effects)) out[k] = (out[k] || 0) + v;
  return out;
}

/**
 * Damage per second over a long fight (a boss) with no walking to refill MP: casting is
 * limited by the cooldown or by MP (pool + regeneration over the fight), whichever binds.
 */
export function longFightDps(data, kit, level, jobNodes = null, seconds = 90) {
  const b = data.progression.balance;
  const { ch, d } = referenceHero(data, kit, level, jobNodes);
  const s = computeSkill(ch, data, d, 0), m = referenceMonster(data, level);
  const crit = 1 + d.critChance * (d.critMult - 1);
  const mdef = m.defense * (1 - (d.penetrationPct || 0) / 100);
  const perCast = (s.damage || 0) * crit * Math.max(1, s.projectiles || 1) * (1 - mdef / (mdef + 60));
  const byRate = b.uptime / Math.max(s.cooldown, s.castTime, 0.35);
  const byMana = s.cost ? (d.maxMp + d.mpRegen * seconds) / seconds / s.cost : Infinity;
  return { dps: Math.round(perCast * Math.min(byRate, byMana) * 10) / 10, manaLimited: byMana < byRate };
}

/** Seconds the reference hero of `kit` needs to kill one `monsterId` at `level` (casting uptime included). */
export function monsterTtk(data, kit, monsterId, level) {
  const b = data.progression.balance, sc = data.progression.monsterScaling, m = data.monsters.monsters[monsterId];
  const { ch, d } = referenceHero(data, kit, level);
  const s = computeSkill(ch, data, d, 0), L = level - 1;
  const hp = m.hp * (1 + sc.hpPerLevel * L), def = m.defense * (1 + sc.defensePerLevel * L) * (1 - (d.penetrationPct || 0) / 100);
  const perCast = (s.damage || 0) * (1 + d.critChance * (d.critMult - 1)) * Math.max(1, s.projectiles || 1) * (1 - def / (def + 60));
  return (hp / perCast) * Math.max(s.cooldown, s.castTime, 0.35) / b.uptime;
}

/** Experience per minute farming `monsterId` at `level` (kill time plus the walk to the next). */
export function monsterExpPerMin(data, kit, monsterId, level) {
  const m = data.monsters.monsters[monsterId], sc = data.progression.monsterScaling;
  const exp = m.exp * (1 + sc.expPerLevel * (level - 1));
  return (exp / (monsterTtk(data, kit, monsterId, level) + data.progression.balance.secondsPerKill)) * 60;
}

/** Materials only bosses drop (no normal monster has them). */
export function bossOnlyMaterials(data) {
  const M = Object.values(data.monsters.monsters), out = new Set();
  for (const m of M.filter((x) => x.boss)) for (const d of m.drops) if (d.item !== 'gold' && !M.some((o) => !o.boss && o.drops.some((x) => x.item === d.item))) out.add(d.item);
  return out;
}

/**
 * Farming estimate for one gear recipe at its tier: for every normal part, the minutes to farm
 * it from its quickest spawn at or below the tier band (tier .. tier + 5), counting the salvage
 * of gear that same monster drops; boss-only parts count as boss kills (one part per kill). The
 * total is an upper bound (parts are farmed one after another; in play several come at once).
 */
export function recipeFarming(data, recipe, kit = 'sword') {
  const b = data.progression.balance, boss = bossOnlyMaterials(data), M = data.monsters.monsters;
  const spawns = Object.values(data.maps || { w: data.world }).flatMap((m) => m.spawns);
  const gearRate = Object.values(data.items.gearDrops.normal).reduce((a, c) => a + c, 0);
  const share = data.items.salvage.returnByGrade.C;
  const out = { minutes: 0, bossKills: 0, parts: {} };
  for (const [item, n] of Object.entries(recipe.cost)) {
    if (item === 'gold') continue;
    if (boss.has(item)) { out.bossKills = Math.max(out.bossKills, n); out.parts[item] = { n, boss: true }; continue; }
    let best = null;
    for (const s of spawns) {
      if (s.level[0] > recipe.itemLevel + 5) continue;
      const drop = M[s.monster].drops.find((x) => x.item === item);
      if (!drop) continue;
      const level = Math.min(s.level[1], Math.max(s.level[0], recipe.itemLevel));
      // gear it drops, salvaged at C grade, returns a share of the recipe parts too (small)
      const made = gearDropCandidates(data, s.monster, level);
      const salvage = made.length ? gearRate * made.reduce((a, id) => a + Math.floor((gearRecipe(data, id)?.cost[item] || 0) * share), 0) / made.length : 0;
      const perKill = drop.chance * (drop.min + drop.max) / 2 + salvage;
      const sec = (monsterTtk(data, kit, s.monster, level) + b.secondsPerKill) / perKill;
      if (!best || sec < best.sec) best = { sec, monster: s.monster, level };
    }
    if (!best) throw new Error(`${recipe.result}: no normal source for ${item}`);
    out.parts[item] = { n, monster: best.monster, level: best.level, minutes: (n * best.sec) / 60 };
    out.minutes += (n * best.sec) / 60;
  }
  return out;
}
