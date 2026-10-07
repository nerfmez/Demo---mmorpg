// Crafting, upgrades and drops: the Monster -> Material -> Craft/Upgrade/Trade loop.
import { gearStats, gearRequirements, gearPower, enforceEquipment, inactiveEquipment, meetsRequires, arrowTotal, wornSlot } from './character.js';
import { equipmentItemLevel, validModGrade } from './item-metadata.js';
import { modRequires } from './skills.js';

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
  if (r.type === 'arrow' && arrowTotal(ch) >= data.items.arrows.capacity) return 'full';
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
  if (r.type === 'arrow') {
    // The quiver holds `capacity` arrows in all; a full craft past it is trimmed, never lost silently.
    const qty = Math.min(r.qty, data.items.arrows.capacity - arrowTotal(ch));
    ch.arrows.stock[r.result] = (ch.arrows.stock[r.result] || 0) + qty;
    if (!data.items.arrows.types[ch.arrows.use]) ch.arrows.use = r.result;
    return { ok: true, kind: 'arrow', id: r.result, qty };
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
  return { ...u.cost[item.upgrade] };
}

function materialCost(step) {
  const { balanceLevel, requiresStat, ...cost } = step;
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
  return { ok: true, item, unequipped:enforceEquipment(ch,data), inactive:inactiveEquipment(ch,data) };
}

export function skillUpgradeCost(data, skillId, level) {
  const su = data.progression.skillUpgrade;
  if (level >= su.maxLevel) return null;
  const def = data.skills.combat[skillId];
  if (!def || !su.steps[level - 1]) return null;
  return materialCost(su.steps[level - 1]);
}

export function skillUpgradeState(ch, data, skillId) {
  const level = ch.skills[skillId];
  if (!level) return { ok: false, reason: 'not_learned' };
  const cost = skillUpgradeCost(data, skillId, level);
  if (!cost) return { ok: false, reason: 'max' };
  const step = data.progression.skillUpgrade.steps[level - 1], stat = data.skills.combat[skillId].upgradeStat;
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
  // The next rank must be wearable: its stat requirement rises (modRequires).
  const req = meetsRequires(ch, modRequires(data, data.mods.mods[inst.id], inst.level + 1));
  if (!req.ok) return { ok: false, reason: 'requires', missing: req.missing, cost };
  return { ok: canAfford(ch, cost), reason: canAfford(ch, cost) ? null : 'materials', cost };
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
  return { ok: true, item, unequipped:enforceEquipment(ch,data), inactive:inactiveEquipment(ch,data) };
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

/** Roll drops for one kill. Returns [{item, qty}]. find: derived goldFindPct/materialFindPct. */
export function rollDrops(data, monsterId, zoneId, rng, find = {}) {
  const m = data.monsters.monsters[monsterId];
  const table = [...m.drops, ...(data.world.zoneDrops[zoneId] || []), ...data.items.upgradeMaterialDrops];
  const out = [];
  for (const d of table) {
    const gold = d.item === 'gold';
    const chance = gold ? d.chance : Math.min(1, d.chance * (1 + (find.materialFindPct || 0) / 100));
    if (!rng.chance(chance)) continue;
    const qty = rng.int(d.min, d.max);
    out.push({ item: d.item, qty: gold ? Math.round(qty * (1 + (find.goldFindPct || 0) / 100)) : qty });
  }
  return out;
}

// ---------- Selling and salvaging gear (town only; the UI and Game gate that) ----------

/** Why an item may not be sold or salvaged, or null. */
export function gearDisposalBlocker(ch, data, item) {
  if (!item) return 'unknown';
  if (wornSlot(ch, data, item)) return 'equipped';
  if (item.locked) return 'locked';
  return null;
}

export function gearRecipe(data, baseId) {
  return Object.values(data.recipes.recipes).find((r) => r.type === 'gear' && r.result === baseId) || null;
}

export function gearSellValue(data, item) {
  const g = data.items.salvage.sellGold, lv = item.itemLevel || data.items.gearBases[item.base].itemLevel || 1;
  return Math.max(1, Math.round((g.base + g.perItemLevel * lv) * (g.gradeMult[item.grade] || 1) * (1 + g.perUpgrade * (item.upgrade || 0))));
}

/** Materials a salvage returns: a grade share of the recipe, plus a share of the +N steps. */
export function salvageReturn(data, item) {
  const rules = data.items.salvage, out = {}, recipe = gearRecipe(data, item.base);
  const share = rules.returnByGrade[item.grade] || rules.returnByGrade.C;
  const main = data.items.gearBases[item.base].upgradeMaterial;
  for (const [k, n] of Object.entries(recipe?.cost || {})) if (k !== 'gold' && Math.floor(n * share) > 0) out[k] = Math.floor(n * share);
  if (main && !out[main]) out[main] = 1;
  // No base upgrade-material faucet: only recover part of the invested +N cost.
  // Legacy gear has no payment ledger, so it keeps the same current-cost valuation.
  const invested = {};
  for (let i = 0; i < (item.upgrade || 0); i++) {
    for (const [k, n] of Object.entries(data.items.upgrade.cost[i])) {
      if (k !== 'gold') invested[k] = (invested[k] || 0) + n;
    }
  }
  for (const [k, n] of Object.entries(invested)) {
    const back = Math.floor(n * rules.upgradeReturn);
    if (back > 0) out[k] = (out[k] || 0) + back;
  }
  return out;
}

function removeGear(ch, item) {
  ch.gear = ch.gear.filter((g) => g.uid !== item.uid);
}

export function sellGear(ch, data, uid) {
  const item = ch.gear.find((g) => g.uid === uid), block = gearDisposalBlocker(ch, data, item);
  if (block) return { ok: false, reason: block };
  const gold = gearSellValue(data, item);
  removeGear(ch, item);
  ch.gold += gold;
  return { ok: true, gold };
}

export function salvageGear(ch, data, uid) {
  const item = ch.gear.find((g) => g.uid === uid), block = gearDisposalBlocker(ch, data, item);
  if (block) return { ok: false, reason: block };
  const back = salvageReturn(data, item);
  removeGear(ch, item);
  for (const [k, n] of Object.entries(back)) addItem(ch, k, n);
  return { ok: true, materials: back };
}

/** Salvage every unlocked, unworn item of `grades` (e.g. ['C']). Returns the total returned. */
export function salvageMany(ch, data, grades) {
  const total = {};
  let count = 0;
  for (const item of [...ch.gear]) {
    if (!grades.includes(item.grade) || gearDisposalBlocker(ch, data, item)) continue;
    const r = salvageGear(ch, data, item.uid);
    count++;
    for (const [k, n] of Object.entries(r.materials)) total[k] = (total[k] || 0) + n;
  }
  return { ok: count > 0, count, materials: total };
}

export function toggleGearLock(ch, uid) {
  const item = ch.gear.find((g) => g.uid === uid);
  if (!item) return { ok: false, reason: 'unknown' };
  item.locked = !item.locked;
  return { ok: true, locked: item.locked };
}

// ---------- Gear drops ----------

/** Bases a monster can drop at `level`: made from its parts, at the tier for that level. */
export function gearDropCandidates(data, monsterId, level) {
  const parts = new Set(data.monsters.monsters[monsterId].drops.map((d) => d.item).filter((i) => i !== 'gold'));
  const made = new Set(Object.values(data.recipes.recipes).filter((r) => r.type === 'gear' && Object.keys(r.cost).some((k) => parts.has(k))).map((r) => r.result));
  const tiers = data.progression.balance.gearTiers.filter((t) => t <= level);
  for (const tier of tiers.reverse()) {
    const list = [...made].filter((id) => !data.items.gearBases[id].starter && data.items.gearBases[id].itemLevel === tier);
    if (list.length) return list;
  }
  return [];
}

/** One kill's gear drop (or null). Rolls a grade, then a base and options like a craft. */
export function rollGearDrop(data, monsterId, level, boss, rng, gearFindPct = 0) {
  const rules = data.items.gearDrops, list = gearDropCandidates(data, monsterId, level);
  if (!list.length) return null;
  let grade = null;
  if (boss) grade = rng.weighted(rules.boss.weights);
  else {
    let r = rng.next();
    for (const g of ['S', 'A', 'B', 'C']) {
      const chance = rules.normal[g] * (1 + gearFindPct / 100);
      if (r < chance) { grade = g; break; }
      r -= chance;
    }
  }
  if (!grade) return null;
  const base = list[Math.floor(rng.next() * list.length)], def = data.items.gearBases[base];
  const pool = [...def.optionPool], options = [];
  for (let i = 0; i < data.items.grades.optionCount[grade] && pool.length; i++) {
    const id = pool.splice(Math.floor(rng.next() * pool.length), 1)[0], o = data.items.gearOptions[id];
    options.push({ id, value: rng.int(o.min, o.max) });
  }
  return { base, itemLevel: def.itemLevel, grade, upgrade: 0, options };
}
