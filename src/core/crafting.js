// Crafting, upgrades and drops: the Monster -> Material -> Craft/Upgrade/Trade loop.
import { gearStats, gearRequirements, gearPower, enforceEquipment, meetsRequires } from './character.js';
import { equipmentItemLevel, validModGrade } from './item-metadata.js';

export function canAfford(ch, cost) {
  for (const k in cost) {
    const have = k === 'gold' ? ch.gold : ch.materials[k] || 0;
    if (have < cost[k]) return false;
  }
  return true;
}

export function pay(ch, cost) {
  if (!canAfford(ch, cost)) return false;
  for (const k in cost) {
    if (k === 'gold') ch.gold -= cost[k];
    else ch.materials[k] -= cost[k];
  }
  return true;
}

export function addItem(ch, item, qty) {
  if (item === 'gold') ch.gold += qty;
  else ch.materials[item] = (ch.materials[item] || 0) + qty;
}

/** Why a recipe cannot be crafted right now, or null. */
export function recipeBlocker(ch, data, recipeId) {
  const r = data.recipes.recipes[recipeId];
  if (!r) return 'unknown';
  if (r.type === 'skill' && ch.skills[r.result]) return 'learned';
  if (r.type === 'movement' && ch.movementSkills.includes(r.result)) return 'learned';
  if (!canAfford(ch, r.cost)) return 'materials';
  return null;
}

export function rollGear(data, recipe, rng) {
  const g = data.items.grades;
  const grade = rng.weighted(g.weights);
  const pool = [...recipe.optionPool];
  const options = [];
  for (let i = 0; i < g.optionCount[grade] && pool.length; i++) {
    const idx = Math.floor(rng.next() * pool.length);
    const id = pool.splice(idx, 1)[0];
    const def = data.items.gearOptions[id];
    options.push({ id, value: rng.int(def.min, def.max) });
  }
  return { base: recipe.result, itemLevel: equipmentItemLevel(data, {base:recipe.result, itemLevel:recipe.itemLevel}), grade, upgrade: 0, options };
}

/** Craft a recipe. Returns {ok, kind, item?} */
export function craft(ch, data, recipeId, rng) {
  const block = recipeBlocker(ch, data, recipeId);
  if (block) return { ok: false, reason: block };
  const r = data.recipes.recipes[recipeId];
  pay(ch, r.cost);
  if (r.type === 'gear') {
    const item = { uid: ch.nextUid++, ...rollGear(data, r, rng) };
    ch.gear.push(item);
    return { ok: true, kind: 'gear', item };
  }
  if (r.type === 'skill') {
    ch.skills[r.result] = 1;
    return { ok: true, kind: 'skill', id: r.result };
  }
  if (r.type === 'movement') {
    ch.movementSkills.push(r.result);
    return { ok: true, kind: 'movement', id: r.result };
  }
  if (r.type === 'mod') {
    const item = { uid: ch.nextUid++, id: r.result, level: 1, grade: validModGrade(data, r.grade) };
    ch.mods.push(item);
    return { ok: true, kind: 'mod', item };
  }
  return { ok: false, reason: 'type' };
}

export function gearUpgradeCost(data, item) {
  const u = data.items.upgrade;
  if (item.upgrade >= u.max) return null;
  return materialCost(u.cost[item.upgrade], data.items.gearBases[item.base].upgradeMaterial);
}

function materialCost(step, material) {
  const { material: count = 0, requiresLevel, requiresStat, ...cost } = step;
  if (count) cost[material] = (cost[material] || 0) + count;
  return cost;
}

export function gearUpgradeState(ch, data, item) {
  if (!item) return { ok: false, reason: 'unknown' };
  const cost = gearUpgradeCost(data, item);
  if (!cost) return { ok: false, reason: 'max' };
  return { ok: canAfford(ch, cost), reason: canAfford(ch, cost) ? null : 'materials', cost };
}

export function gearUpgradePreview(data, item) {
  if (!gearUpgradeCost(data, item)) return null;
  const after = { ...item, upgrade:item.upgrade+1 };
  return { before: gearStats(item, data), after: gearStats(after, data), beforeRequires:gearRequirements(item,data), afterRequires:gearRequirements(after,data) };
}

export function upgradeGear(ch, data, uid) {
  const item = ch.gear.find((g) => g.uid === uid);
  if (!item) return { ok: false, reason: 'unknown' };
  const state = gearUpgradeState(ch, data, item);
  if (!state.ok) return state;
  pay(ch, state.cost);
  item.upgrade++;
  return { ok: true, item, unequipped:enforceEquipment(ch,data) };
}

export function skillUpgradeCost(data, skillId, level) {
  const su = data.progression.skillUpgrade;
  if (level >= su.maxLevel) return null;
  const def = data.skills.combat[skillId];
  if (!def || !su.steps[level - 1]) return null;
  return materialCost(su.steps[level - 1], def.upgradeMaterial);
}

export function skillUpgradeState(ch, data, skillId) {
  const level = ch.skills[skillId];
  if (!level) return { ok: false, reason: 'not_learned' };
  const cost = skillUpgradeCost(data, skillId, level);
  if (!cost) return { ok: false, reason: 'max' };
  const step = data.progression.skillUpgrade.steps[level - 1], stat = data.skills.combat[skillId].upgradeStat;
  if (ch.level < step.requiresLevel) return { ok: false, reason: 'level', need: step.requiresLevel, cost };
  const req = meetsRequires(ch, { [stat]: step.requiresStat });
  if (!req.ok) return { ok: false, reason: 'requires', missing: req.missing, cost };
  return { ok: canAfford(ch, cost), reason: canAfford(ch, cost) ? null : 'materials', cost };
}

export function upgradeSkill(ch, data, skillId) {
  const level = ch.skills[skillId];
  if (!level) return { ok: false, reason: 'not_learned' };
  const state = skillUpgradeState(ch, data, skillId);
  if (!state.ok) return state;
  pay(ch, state.cost);
  ch.skills[skillId] = level + 1;
  return { ok: true, level: level + 1 };
}

export function modUpgradeCost(data, inst) {
  const mu = data.progression.modUpgrade;
  return inst.level >= mu.maxLevel ? null : mu.cost[inst.level - 1];
}

export function modUpgradeState(ch, data, inst) {
  if (!inst) return { ok: false, reason: 'unknown' };
  const cost = modUpgradeCost(data, inst);
  if (!cost) return { ok: false, reason: 'max' };
  const need = data.progression.modUpgrade.requiresLevel[inst.level - 1];
  if (ch.level < need) return { ok: false, reason: 'level', need, cost };
  return { ok: canAfford(ch, cost), reason: canAfford(ch, cost) ? null : 'materials', cost, need };
}

export function upgradeMod(ch, data, uid) {
  const inst = ch.mods.find((m) => m.uid === uid);
  if (!inst) return { ok: false, reason: 'unknown' };
  const state = modUpgradeState(ch, data, inst);
  if (!state.ok) return state;
  pay(ch, state.cost);
  inst.level++;
  return { ok: true, level: inst.level };
}

export function gearGradeState(ch, data, item) {
  if (!item) return { ok: false, reason: 'unknown' };
  const grade = data.items.grades.order[data.items.grades.order.indexOf(item.grade) + 1];
  if (!grade) return { ok: false, reason: 'max' };
  const rules = data.items.gradeUpgrade, cost = rules.cost[grade];
  return { ok: canAfford(ch, cost), reason: canAfford(ch, cost) ? null : 'materials', grade, cost };
}

/** Promotion keeps owned rolls; show the range of possible new wear requirements. */
export function gearGradePreview(data, item) {
  const grade = data.items.grades.order[data.items.grades.order.indexOf(item.grade)+1];
  if (!grade) return null;
  const count = data.items.grades.optionCount[grade] - item.options.length;
  const pool = data.items.gearBases[item.base].optionPool.filter(id => !item.options.some(o => o.id===id));
  const candidate = upper => {
    const options = pool.map(id => ({ id, value:data.items.gearOptions[id][upper?'max':'min'] }));
    options.sort((a,b) => (upper?-1:1) * (gearPower({ [data.items.gearOptions[a.id].stat]:a.value },data)-gearPower({ [data.items.gearOptions[b.id].stat]:b.value },data)));
    return gearRequirements({ ...item, grade, options:[...item.options,...options.slice(0,Math.max(0,count))] },data);
  };
  return { beforeRequires:gearRequirements(item,data), minRequires:candidate(false), maxRequires:candidate(true) };
}

export function promoteGear(ch, data, uid, rng) {
  const item = ch.gear.find(g => g.uid === uid), state = gearGradeState(ch, data, item);
  if (!state.ok) return state;
  const count = data.items.grades.optionCount[state.grade];
  const pool = data.items.gearBases[item.base].optionPool.filter(id => !item.options.some(o => o.id === id));
  if (pool.length < count - item.options.length) return { ok: false, reason: 'pool' };
  pay(ch, state.cost);
  while (item.options.length < count) {
    const id = pool.splice(rng.int(0, pool.length - 1), 1)[0], def = data.items.gearOptions[id];
    item.options.push({ id, value: rng.int(def.min, def.max) });
  }
  item.grade = state.grade;
  return { ok: true, item, unequipped:enforceEquipment(ch,data) };
}

/** At most ten independent crafts. Keep every result; stop at target or first unpaid attempt. */
export function craftBatch(ch, data, recipeId, rng, { attempts = 1, grade = null, option = null, quality = 0 } = {}) {
  const recipe = data.recipes.recipes[recipeId], grades = data.items.grades.order;
  if (!recipe || recipe.type !== 'gear' || !Number.isInteger(attempts) || attempts < 1 || attempts > data.items.crafting.maxBatch ||
      (grade !== null && !grades.includes(grade)) || (option !== null && !recipe.optionPool.includes(option)) ||
      !Number.isFinite(quality) || quality < 0 || quality > 1)
    return { ok: false, reason: 'invalid', items: [], spent: {}, attempts: 0 };
  const items = [], spent = {};
  let reason = 'limit';
  for (let n = 0; n < attempts; n++) {
    const result = craft(ch, data, recipeId, rng);
    if (!result.ok) { reason = result.reason; break; }
    items.push(result.item);
    for (const [key, count] of Object.entries(recipe.cost)) spent[key] = (spent[key] || 0) + count;
    const gradeMatch = !grade || grades.indexOf(result.item.grade) >= grades.indexOf(grade);
    const optionMatch = !option || result.item.options.some(o => o.id === option && o.value >= data.items.gearOptions[option].min + quality * (data.items.gearOptions[option].max - data.items.gearOptions[option].min));
    if ((grade || option) && gradeMatch && optionMatch) { reason = 'target'; break; }
  }
  return { ok: items.length > 0, items, spent, reason, attempts: items.length, matched: reason === 'target' };
}

export function sellMaterial(ch, data, id, qty = 1) {
  const have = ch.materials[id] || 0;
  const n = Math.min(have, qty);
  if (n <= 0) return 0;
  ch.materials[id] -= n;
  const gold = n * data.items.materials[id].value;
  ch.gold += gold;
  return gold;
}

/** Roll drops for one kill. Returns [{item, qty}]. */
export function rollDrops(data, monsterId, zoneId, rng) {
  const m = data.monsters.monsters[monsterId];
  const table = [...m.drops, ...(data.world.zoneDrops[zoneId] || [])];
  const out = [];
  for (const d of table) {
    if (rng.chance(d.chance)) out.push({ item: d.item, qty: rng.int(d.min, d.max) });
  }
  return out;
}
