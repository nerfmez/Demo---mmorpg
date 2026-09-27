// Crafting, upgrades and drops: the Monster -> Material -> Craft/Upgrade/Trade loop.

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
  return { base: recipe.result, grade, upgrade: 0, options };
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
    const item = { uid: ch.nextUid++, id: r.result, level: 1 };
    ch.mods.push(item);
    return { ok: true, kind: 'mod', item };
  }
  return { ok: false, reason: 'type' };
}

export function gearUpgradeCost(data, item) {
  const u = data.items.upgrade;
  return item.upgrade >= u.max ? null : u.cost[item.upgrade];
}

export function upgradeGear(ch, data, uid) {
  const item = ch.gear.find((g) => g.uid === uid);
  if (!item) return { ok: false, reason: 'unknown' };
  const cost = gearUpgradeCost(data, item);
  if (!cost) return { ok: false, reason: 'max' };
  if (!pay(ch, cost)) return { ok: false, reason: 'materials' };
  item.upgrade++;
  return { ok: true, item };
}

export function skillUpgradeCost(data, skillId, level) {
  const su = data.progression.skillUpgrade;
  if (level >= su.maxLevel) return null;
  const def = data.skills.combat[skillId];
  return { [def.upgradeMaterial]: level + 1, gold: su.goldPerLevel * level };
}

export function upgradeSkill(ch, data, skillId) {
  const level = ch.skills[skillId];
  if (!level) return { ok: false, reason: 'not_learned' };
  const cost = skillUpgradeCost(data, skillId, level);
  if (!cost) return { ok: false, reason: 'max' };
  if (!pay(ch, cost)) return { ok: false, reason: 'materials' };
  ch.skills[skillId] = level + 1;
  return { ok: true, level: level + 1 };
}

export function modUpgradeCost(data, inst) {
  const mu = data.progression.modUpgrade;
  return inst.level >= mu.maxLevel ? null : mu.cost[inst.level - 1];
}

export function upgradeMod(ch, data, uid) {
  const inst = ch.mods.find((m) => m.uid === uid);
  if (!inst) return { ok: false, reason: 'unknown' };
  const cost = modUpgradeCost(data, inst);
  if (!cost) return { ok: false, reason: 'max' };
  if (!pay(ch, cost)) return { ok: false, reason: 'materials' };
  inst.level++;
  return { ok: true, level: inst.level };
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
