// Character progression: Character Level -> Stat Points, Job Level -> Job Points (Job Tree),
// equipment (two hands + armour slots, items.slots), arrows, appearance, and derived combat stats. The character object is plain
// JSON so it can be saved and ported as-is (Godot: a Dictionary or a Resource).
import { enterMap } from './maps.js';
import { migrateQuestJournal } from './quests.js';

import { equipmentItemLevel, normalizeItemMetadata } from './item-metadata.js';
import { startingConsumables, normalizeConsumables, normalizeAutoPotions } from './consumables.js';

export const STATS = ['STR', 'AGI', 'VIT', 'INT', 'DEX'];
export const CHARACTER_VERSION = 12;

export function emptyProgress(data) {
  const starter = data?.world.id ? data.world : null;
  return { waypoints: starter ? starter.waypoints.filter(w => w.unlocked).map(w => w.id) : ['town'], zones: starter ? ['landing'] : ['settlement'], kills: {}, collected: {}, quests: {}, questJournal: { version: 2, trackedId: null, completions: [] }, crafted: 0, socketed: 0, deaths: 0, playTime: 0, bossKills: {}, maps: {} };
}

/**
 * @param {object} data game data
 * @param {{kit?:string, name?:string, appearance?:object}} opts
 */
export function createCharacter(data, opts = {}) {
  const p = data.progression;
  const st = p.start;
  const opening = !!opts.opening;
  const kitId = st.kits?.[opts.kit] ? opts.kit : st.defaultKit;
  const kit = opening ? null : st.kits[kitId];
  const ch = {
    version: CHARACTER_VERSION,
    name: opts.name || 'Wanderer',
    appearance: opts.appearance ? { ...opts.appearance } : null,
    kit: opening ? null : kitId,
    opening: { stage: opening ? 'wake' : 'done' },
    level: 1,
    exp: 0,
    statPoints: p.character.startingStatPoints,
    stats: { ...p.character.startingStats },
    jobLevel: 1,
    jobExp: 0,
    jobPoints: 0,
    jobNodes: [data.jobtree.origin],
    treeRevision: data.jobtree.revision,
    gold: st.gold,
    materials: {},
    gear: [],
    equipped: Object.fromEntries((data.items.slots || ['weapon', 'armor']).map((s) => [s, null])),
    skills: opening ? {} : { [kit.basic]: 1 },
    movementSkills: [],
    movement: null,
    mods: [],
    arrows: { use: Object.keys(data.items.arrows?.start || {})[0] || null, stock: { ...(data.items.arrows?.start || {}) } },
    ...startingConsumables(data),
    slots: Array.from({ length: p.slotCount }, (_, i) => ({ skill: !opening && i === 0 ? kit.basic : null, mods: [] })),
    nextUid: 1,
    bossKills: 0,
    progress: emptyProgress(data),
    worldId: data.world.id || 'frontier',
    worldLayoutRevision: data.world.layoutRevision || null,
    pos: null,
  };
  // an opening character wakes with clothes only; the weapon comes with the kit it picks
  const startGear = opening ? st.gear.filter((g) => data.items.gearBases[g]?.slot !== 'weapon') : kit ? [kit.weapon, ...st.gear.filter((g) => data.items.gearBases[g]?.slot !== 'weapon')] : st.gear;
  for (const baseId of startGear) {
    const base = data.items.gearBases[baseId];
    if (!base) continue;
    const options = base.optionPool.slice(0, data.items.grades.optionCount.C).map(id => ({ id, value: data.items.gearOptions[id].min }));
    const item = { uid: ch.nextUid++, base: baseId, itemLevel: equipmentItemLevel(data, {base:baseId}), grade: 'C', upgrade: 0, options };
    ch.gear.push(item);
    ch.equipped[base.slot] = item.uid;
  }
  normalizeAutoPotions(ch, data);
  return ch;
}

/** Advance the saved opening only when the character is still unconscious. */
export function wakeOpening(ch) {
  if (ch.opening?.stage !== 'wake') return { ok: false, reason: 'stage' };
  ch.opening.stage = 'weapon';
  return { ok: true };
}

/**
 * The end of the opening: only the chosen weapon and its normal attack.
 * Firebolt and Ward are not part of it (quests / workbench).
 * @returns {{ok:boolean, reason?:string}}
 */
export function completeOpening(ch, data, { kit: kitId }) {
  const o = data.progression.start.opening, kit = data.progression.start.kits[kitId];
  if (ch.opening?.stage === 'done') return { ok: false, reason: 'done' };
  if (!kit || !o.weapons.includes(kitId)) return { ok: false, reason: 'kit' };
  const base = data.items.gearBases[kit.weapon];
  const options = base.optionPool.slice(0, data.items.grades.optionCount.C).map((id) => ({ id, value: data.items.gearOptions[id].min }));
  const item = { uid: ch.nextUid++, base: kit.weapon, itemLevel: equipmentItemLevel(data, { base: kit.weapon }), grade: 'C', upgrade: 0, options };
  ch.gear.push(item);
  ch.equipped[base.slot] = item.uid;
  ch.kit = kitId;
  ch.skills[kit.basic] ||= 1;
  if (!ch.slots.some(s => s.skill === kit.basic)) {
    const empty = ch.slots.find(s => !s.skill);
    if (empty) empty.skill = kit.basic;
  }
  ch.opening = { stage: 'done' };
  return { ok: true };
}

/** Bring older saves up to date. Rebalance migration is one-time and preserves ownership. */
export function migrateCharacter(ch, data) {
  if (!ch || typeof ch !== 'object') return null;
  const hadQuestJournal = !!ch.progress?.questJournal;
  const slots = data.items.slots || ['weapon', 'armor'];
  ch.equipped = ch.equipped || {};
  for (const s of slots) if (!(s in ch.equipped)) ch.equipped[s] = null;
  ch.progress = { ...emptyProgress(data), ...(ch.progress || {}) };
  if (data.world.id && ch.worldId !== data.world.id && data.maps?.[ch.worldId]) {
    // A linked map's character loaded on another map: swap discovery, keep everything else.
    enterMap(ch, data, data.world.id);
  } else if (data.world.id && ch.worldId !== data.world.id) {
    // Old coordinates can be free here but still refer to another map. Move once;
    // retain inventory, levels, job choices and the historical quest records.
    ch.pos = null;
    ch.progress.waypoints = [...new Set([...ch.progress.waypoints.filter(id => data.world.waypoints.some(w => w.id === id)), ...data.world.waypoints.filter(w => w.unlocked).map(w => w.id)])];
    ch.progress.zones = ['landing'];
  }
  ch.worldId = data.world.id || 'frontier';
  if (data.world.layoutRevision && ch.worldLayoutRevision !== data.world.layoutRevision) {
    // Coordinates alone become stale when the same town is rebuilt. Keep all
    // levels, equipment, unlocked stones and quest records; relocate only once.
    ch.pos = null;
  }
  ch.worldLayoutRevision = data.world.layoutRevision || null;
  for (const k of ['kills', 'collected', 'quests', 'bossKills', 'maps']) ch.progress[k] = ch.progress[k] || {};
  if (!ch.name) ch.name = 'Wanderer';
  if (!('appearance' in ch)) ch.appearance = null;
  const legacyOpening = !ch.opening;
  if (legacyOpening) ch.opening = { stage: 'done' }; // v10: includes the independent movement-mod v9 saves
  const pending = ch.opening.stage !== 'done';
  if (!ch.kit && !pending) ch.kit = 'sword';
  ch.skills ||= {};
  // v11 removes uncommitted starter picks, never already learned skills.
  if (ch.opening.stage === 'skills') ch.opening = { stage: 'weapon', kit: ch.opening.kit || null };
  // drop references to things that no longer exist
  ch.slots = (ch.slots || []).map((s) => ({ skill: s.skill && data.skills.combat[s.skill] ? s.skill : null, mods: (s.mods || []).filter((u) => (ch.mods || []).some((m) => m.uid === u && data.mods.mods[m.id])) }));
  while (ch.slots.length < data.progression.slotCount) ch.slots.push({ skill: null, mods: [] });
  ch.mods = (ch.mods || []).filter((m) => data.mods.mods[m.id]);
  ch.gear = (ch.gear || []).filter((g) => data.items.gearBases[g.base]);
  normalizeItemMetadata(ch, data);
  if ((ch.version || 1) < 3) {
    for (const item of ch.gear) {
      item.options = item.options || [];
      for (const option of item.options) {
        const old = data.items.legacyOptionRanges?.[option.id], def = data.items.gearOptions[option.id];
        if (!old || !def) continue;
        const quality = old.max === old.min ? 1 : Math.max(0, Math.min(1, (option.value - old.min) / (old.max - old.min)));
        option.value = Math.round(def.min + quality * (def.max - def.min));
      }
      if (data.items.gearBases[item.base].starter && !item.options?.length) item.grade = 'C';
    }
  }
  if ((ch.version || 1) < 4) {
    for (const item of ch.gear) {
      item.options = item.options || [];
      // New grades gain their missing slots once, at conservative minimum rolls.
      // Existing rolls, grade, enhancement and ownership remain intact.
      const base = data.items.gearBases[item.base], count = data.items.grades.optionCount[item.grade];
      for (const id of base.optionPool || []) {
        if (item.options.length >= count) break;
        if (!item.options.some(o => o.id === id)) item.options.push({ id, value: data.items.gearOptions[id].min });
      }
    }
    ch.progress.gearMigration = 'เกรดอุปกรณ์ใหม่ C/B/A/S มี 2/3/4/5 ออฟชั่น เติมช่องที่ขาดแล้ว · ตีบวกได้ตามวัตถุดิบ';
  }
  if (ch.treeRevision !== data.jobtree.revision) {
    const spent = new Set((ch.jobNodes || []).filter(id => id !== data.jobtree.origin)).size;
    ch.jobPoints = (ch.jobPoints || 0) + spent;
    ch.jobNodes = [data.jobtree.origin];
    ch.treeRevision = data.jobtree.revision;
    ch.progress.balanceMigration = 'ปรับสมดุลใหม่: คืนแต้มต้นไม้ทั้งหมดฟรี เลือกเส้นทางและอาชีพใหม่ได้ อุปกรณ์ สกิล ม็อด และวัตถุดิบยังอยู่ครบ';
  }
  for (const s of slots) if (ch.equipped[s] && !ch.gear.some((g) => g.uid === ch.equipped[s])) ch.equipped[s] = null;
  if ((ch.version || 1) < 6 || !ch.arrows) {
    // v6: two hands, gloves and arrows. Existing archers keep shooting: everyone starts with a stock.
    ch.arrows = { use: Object.keys(data.items.arrows?.start || {})[0] || null, stock: { ...(data.items.arrows?.start || {}) } };
  }
  if ((ch.version || 1) < 7 || !ch.consumables || !ch.quickItems) {
    // v7: potions and quick item slots. Existing heroes receive the starter potions once.
    const start = startingConsumables(data);
    ch.consumables = { ...start.consumables, ...(ch.consumables || {}) };
    ch.quickItems = ch.quickItems || start.quickItems;
  }
  normalizeConsumables(ch, data);
  normalizeAutoPotions(ch, data, { reset: (ch.version || 1) < 12 });
  ch.arrows.stock = Object.fromEntries(Object.entries(ch.arrows.stock || {}).filter(([id, n]) => data.items.arrows?.types[id] && n > 0));
  // The character cap fell from 40 to 30: bring higher saves down to the cap and take back the
  // stat points of the removed levels (from unspent points first, else by a free stat reset).
  const cap = data.progression.character.maxLevel;
  if (ch.level > cap) {
    const excess = (ch.level - cap) * data.progression.character.statPointsPerLevel;
    if (ch.statPoints < excess) {
      const start = data.progression.character.startingStats;
      for (const s of STATS) { ch.statPoints += ch.stats[s] - start[s]; ch.stats[s] = start[s]; }
      ch.progress.equipmentNotice = 'เลเวลตันลดเหลือ Lv' + cap + ': คืนแต้มสเตตัสให้จัดใหม่ฟรี';
    }
    ch.statPoints -= excess;
    ch.level = cap;
    ch.exp = 0;
  }
  // Repair impossible hand combinations; unmet wear gates stay slotted and inactive.
  enforceEquipment(ch, data);
  const notice = equipmentNotice(ch, data);
  if (notice) ch.progress.equipmentNotice = notice;
  else delete ch.progress.equipmentNotice;
  ch.movementSkills = (ch.movementSkills || []).filter((m) => data.skills.movement[m]);
  if (!ch.movementSkills.includes(ch.movement)) ch.movement = ch.movementSkills[0] || null;
  migrateQuestJournal(ch, data, { legacy: (ch.version || 1) < 8 || !hadQuestJournal });
  ch.version = CHARACTER_VERSION;
  return ch;
}

export function expToNext(data, level) {
  const c = data.progression.character.expCurve;
  return Math.round(c.base * Math.pow(level, c.exponent));
}

export function jobExpToNext(data, level) {
  const c = data.progression.job.expCurve;
  return Math.round(c.base * Math.pow(level, c.exponent));
}

/** Adds base and job exp. Returns {levels, jobLevels} gained. */
export function addExp(ch, data, exp, jobExp) {
  const p = data.progression;
  let levels = 0;
  let jobLevels = 0;
  if (ch.level < p.character.maxLevel) {
    ch.exp += exp;
    while (ch.level < p.character.maxLevel && ch.exp >= expToNext(data, ch.level)) {
      ch.exp -= expToNext(data, ch.level);
      ch.level++;
      ch.statPoints += p.character.statPointsPerLevel;
      levels++;
    }
    if (ch.level >= p.character.maxLevel) ch.exp = 0;
  }
  if (ch.jobLevel < p.job.maxLevel) {
    ch.jobExp += jobExp;
    while (ch.jobLevel < p.job.maxLevel && ch.jobExp >= jobExpToNext(data, ch.jobLevel)) {
      ch.jobExp -= jobExpToNext(data, ch.jobLevel);
      ch.jobLevel++;
      ch.jobPoints += p.job.pointsPerLevel;
      jobLevels++;
    }
    if (ch.jobLevel >= p.job.maxLevel) ch.jobExp = 0;
  }
  return { levels, jobLevels };
}

export function allocateStat(ch, stat, n = 1) {
  if (!STATS.includes(stat) || ch.statPoints < n) return false;
  ch.stats[stat] += n;
  ch.statPoints -= n;
  return true;
}

export function meetsRequires(ch, requires = {}) {
  const missing = [];
  for (const k in requires) if ((ch.stats[k] || 0) < requires[k]) missing.push(`${k} ${requires[k]}`);
  return { ok: missing.length === 0, missing };
}

// ---------- Job Tree ----------

export function jobTierProgress(ch, data, nodeId) {
  const tree = data.jobtree, node = tree.nodes[nodeId];
  const section = tree.sections?.[node?.section];
  const scope = Object.keys(tree.nodes).filter(id => id !== tree.origin);
  const spent = new Set(ch.jobNodes.filter(id => scope.includes(id))).size;
  return { tier: section?.tier || 0, requires: section?.requiresSpent || 0, spent, scope, section: node?.section };
}

export function jobNodeState(ch, data, nodeId) {
  const tree = data.jobtree;
  const node = tree.nodes[nodeId];
  if (!node) return { can: false, reason: 'unknown' };
  if (ch.jobNodes.includes(nodeId)) return { can: false, taken: true, reason: 'taken' };

  if (node.requiresJob && currentJob(ch, data)?.branch !== node.requiresJob)
    return { can: false, reason: 'requires_job', need: node.requiresJob };

  if (node.type === 'job') {
    if (ch.jobLevel < data.progression.job.jobChoiceLevel)
      return { can: false, reason: 'job_level', need: data.progression.job.jobChoiceLevel };
    const other = ch.jobNodes.find((n) => tree.nodes[n]?.type === 'job');
    if (other) return { can: false, reason: 'one_job', other };
  }

  const tier = jobTierProgress(ch, data, nodeId);
  if (tier.tier && tier.spent < tier.requires)
    return { can: false, reason: 'tier_points', tier: tier.tier, have: tier.spent, need: tier.requires };

  // Directed reviewed skills require ALL named parents. Legacy adjacency rules
  // remain intact for existing content and retained saves.
  if (node.requires) {
    const missing = node.requires.filter(id => !ch.jobNodes.includes(id));
    if (missing.length) return { can: false, reason: 'prerequisite', missing };
  }
  // Where paths meet (a fork rejoining, a bridge between lines) ANY ONE named parent is enough.
  if (node.requiresAny?.length && !node.requiresAny.some(id => ch.jobNodes.includes(id)))
    return { can: false, reason: 'prerequisite', missing: [...node.requiresAny], any: true };
  // Section unlock and network adjacency are independent requirements.
  if (!node.links.some((l) => ch.jobNodes.includes(l)))
    return { can: false, reason: 'not_linked' };

  if (ch.jobPoints < 1) return { can: false, reason: 'no_points' };
  return { can: true, tier: tier.tier, have: tier.spent, need: tier.requires };
}

export function allocateJobNode(ch, data, nodeId) {
  const st = jobNodeState(ch, data, nodeId);
  if (!st.can) return st;
  ch.jobNodes.push(nodeId);
  ch.jobPoints -= 1;
  return { can: true, done: true, job: data.jobtree.nodes[nodeId].type === 'job' };
}

/** Every parent a directed node names: ALL of `requires` and the ANY-ONE `requiresAny`. */
export function jobParents(node) {
  return [...(node?.requires || []), ...(node?.requiresAny || [])];
}

/** Unowned points needed to own `id` along directed parents (cheapest any-parent each time). */
export function jobRouteCost(ch, data, id, allowed = null, memo = new Map()) {
  const nodes = data.jobtree.nodes;
  if (ch.jobNodes.includes(id)) return 0;
  if (!nodes[id] || (allowed && !allowed(id))) return Infinity;
  if (memo.has(id)) return memo.get(id);
  memo.set(id, Infinity); // guards a malformed cycle
  const n = nodes[id];
  let cost = 1 + (n.requires || []).reduce((a, p) => a + jobRouteCost(ch, data, p, allowed, memo), 0);
  if (n.requiresAny?.length) cost += Math.min(...n.requiresAny.map(p => jobRouteCost(ch, data, p, allowed, memo)));
  memo.set(id, cost);
  return cost;
}

/** The any-parent to route through, or null when one is owned or none is needed. */
export function cheapestParent(ch, data, id, allowed = null) {
  const any = data.jobtree.nodes[id]?.requiresAny;
  if (!any?.length || any.some(p => ch.jobNodes.includes(p))) return null;
  let best = null, cost = Infinity;
  for (const p of any) { const c = jobRouteCost(ch, data, p, allowed); if (c < cost) { best = p; cost = c; } }
  return best ?? (allowed ? null : any[0]);
}

/** Shortest connected route for inspection. Section gates still require total investment;
 * this helper never invents unrelated filler purchases or mutates the character. */
export function jobPath(ch, data, target) {
  const nodes = data.jobtree.nodes;
  if (!nodes[target]) return [];
  if (ch.jobNodes.includes(target)) return [target];
  if (nodes[target].requires || nodes[target].requiresAny) {
    const ordered = [], seen = new Set();
    const visit = id => {
      if (seen.has(id) || ch.jobNodes.includes(id) || !nodes[id]) return;
      seen.add(id);
      for (const parent of nodes[id].requires || []) visit(parent);
      const any = cheapestParent(ch, data, id);
      if (any) visit(any);
      ordered.push(id);
    };
    visit(target);
    return ordered;
  }
  const job = currentJob(ch, data)?.branch;
  const allowed = id => !nodes[id].requiresJob || nodes[id].requiresJob === job;
  const queue = ch.jobNodes.filter(id => nodes[id]).map(id => [id]);
  const seen = new Set(ch.jobNodes);
  while (queue.length) {
    const path = queue.shift();
    for (const next of nodes[path.at(-1)].links) {
      if (seen.has(next) || !allowed(next)) continue;
      if (nodes[next].type === 'job' && (job || ch.jobLevel < data.progression.job.jobChoiceLevel)) continue;
      seen.add(next);
      const route = [...path, next];
      if (next === target) return route.filter(id => !ch.jobNodes.includes(id));
      queue.push(route);
    }
  }
  return [];
}

export function currentJob(ch, data) {
  const id = ch.jobNodes.find((n) => data.jobtree.nodes[n]?.type === 'job');
  return id ? data.jobtree.nodes[id] : null;
}

export function respecCost(ch, data) {
  const r = data.progression.respec;
  return { stats: r.statsGoldPerLevel * ch.level, job: r.jobGoldPerLevel * ch.jobLevel };
}

export function respecStats(ch, data) {
  const cost = respecCost(ch, data).stats;
  if (ch.gold < cost) return false;
  const start = data.progression.character.startingStats;
  let spent = 0;
  for (const s of STATS) spent += ch.stats[s] - start[s];
  ch.stats = { ...start };
  ch.statPoints += spent;
  ch.gold -= cost;
  enforceEquipment(ch, data);
  return true;
}

export function respecJob(ch, data) {
  const cost = respecCost(ch, data).job;
  if (ch.gold < cost) return false;
  ch.jobPoints += ch.jobNodes.length - 1;
  ch.jobNodes = [data.jobtree.origin];
  ch.gold -= cost;
  return true;
}

// ---------- Gear ----------

export function gearItem(ch, uid) {
  return ch.gear.find((g) => g.uid === uid) || null;
}

/** Stats of one item: base stats x grade x upgrade, plus rolled options. */
export function gearStats(item, data) {
  const base = data.items.gearBases[item.base];
  const g = data.items.grades;
  const mult = g.statMult[item.grade] * (1 + item.upgrade * data.items.upgrade.statPerLevel);
  const out = {};
  for (const k in base.stats) out[k] = Math.round(base.stats[k] * mult * 10) / 10;
  for (const o of item.options) {
    const stat = data.items.gearOptions[o.id].stat;
    out[stat] = (out[stat] || 0) + o.value;
  }
  return out;
}

/** The weapon type's built-in bonus (not scaled by grade). */
export function weaponImplicit(item, data) {
  const base = data.items.gearBases[item.base];
  if (base.slot !== 'weapon' || !base.weaponType) return {};
  return data.items.weaponTypes?.[base.weaponType]?.implicit || {};
}

/** 'light' | 'heavy' | 'two' for weapons, 'off' for shields, null for armour. */
export function handsOf(data, item) {
  const base = item && data.items.gearBases[item.base];
  if (!base) return null;
  if (base.slot === 'offhand') return 'off';
  return base.slot === 'weapon' ? data.items.weaponTypes[base.weaponType]?.hands || 'light' : null;
}

/** Weighted power still controls weapon/shield requirements and item valuation. */
export function gearPower(stats, data) {
  const weights = data.items.requirements.weights;
  return Object.entries(stats).reduce((sum,[stat,value]) => sum + Math.abs(value) * (weights[stat] || 0), 0);
}

export function gearRequirements(item, data) {
  const base = data.items.gearBases[item.base], rules = data.items.requirements;
  if (['armor', 'helm', 'gloves', 'boots', 'charm'].includes(base.slot))
    return { level: equipmentItemLevel(data, item) };
  const baseline = gearPower(gearStats({ ...item, grade:'C', upgrade:0, options:[] },data),data);
  const extra = Math.ceil(Math.max(0,gearPower(gearStats(item,data),data) - baseline - rules.affixAllowance) * rules.extraPowerFactor - 1e-9);
  const initial = Object.keys(base.requires || {}).length ? base.requires : { [base.requirementStat]: base.starter ? rules.minimumStat : Math.max(rules.minimumStat,Math.ceil(baseline * rules.basePowerFactor)) };
  return Object.fromEntries(Object.entries(initial).map(([stat,value]) => [stat,value + extra]));
}

const OTHER_HAND = { weapon: 'offhand', offhand: 'weapon' };

/** Which slot an item occupies in `equipped`, or null. */
export function wornSlot(ch, data, item, equipped = ch.equipped) {
  return item ? data.items.slots.find((s) => equipped[s] === item.uid) || null : null;
}

/**
 * Wear requirements in context: two light weapons held together each need the sum of
 * both requirements (dual wielding costs twice the stats, by the normal power rule).
 */
export function wearRequirements(ch, data, item, slot = null, equipped = ch.equipped) {
  const own = gearRequirements(item, data);
  const at = slot || wornSlot(ch, data, item, equipped) || data.items.gearBases[item.base].slot;
  const other = OTHER_HAND[at] && gearItem(ch, equipped[OTHER_HAND[at]]);
  if (!other || other.uid === item.uid || handsOf(data, item) !== 'light' || handsOf(data, other) !== 'light') return own;
  const sum = { ...own };
  for (const [k, v] of Object.entries(gearRequirements(other, data))) sum[k] = (sum[k] || 0) + v;
  return sum;
}

export function gearEquipState(ch, data, item, slot = null, equipped = ch.equipped) {
  if (!item) return { ok:false, reason:'unknown', requires:{}, missing:[] };
  const requires = wearRequirements(ch,data,item,slot,equipped);
  const rows = Object.entries(requires).map(([stat, need]) => {
    const current = stat === 'level' ? ch.level : (ch.stats[stat] || 0);
    return { stat, need, current, deficit: Math.max(0, need - current) };
  });
  const missing = rows.filter(r => r.deficit > 0).map(r =>
    r.stat === 'level' ? `Lv. มี ${r.current} / ต้องใช้ ${r.need} · ขาด ${r.deficit} เลเวล`
      : `${r.stat} มี ${r.current} / ต้องใช้ ${r.need} · ขาด ${r.deficit}`);
  const ok = missing.length === 0;
  return { ok, reason: ok ? null : requires.level !== undefined ? 'level' : 'requires', requires, rows, missing,
    ...(requires.level !== undefined ? { need: requires.level, current: ch.level } : {}) };
}

/** Why `item` cannot go into `slot` next to what the other hand holds, or null. */
export function handBlocker(ch, data, item, slot, equipped = ch.equipped) {
  const hands = handsOf(data, item), base = data.items.gearBases[item.base];
  if (slot !== 'weapon' && slot !== 'offhand') return base.slot === slot ? null : 'slot';
  if (slot === 'weapon') return base.slot === 'weapon' ? null : 'slot';
  if (hands !== 'light' && hands !== 'off') return 'slot';
  const main = handsOf(data, gearItem(ch, equipped.weapon));
  if (main === 'two') return 'two_hand';
  if (hands === 'light' && main !== 'light') return 'needs_light';
  return null;
}

/** Current inactive slots are derived, never stored: stat recovery reactivates them. */
export function inactiveEquipment(ch, data) {
  return data.items.slots.flatMap(slot => {
    const item = gearItem(ch, ch.equipped[slot]);
    if (!item) return [];
    const state = gearEquipState(ch, data, item, slot);
    return state.ok ? [] : [{ slot, uid: item.uid, ...state }];
  });
}

/** Preserve the existing cap-reset explanation, while recomputing wear status live. */
export function equipmentNotice(ch, data) {
  const saved = ch.progress?.equipmentNotice || '';
  const reset = saved.startsWith('เลเวลตันลดเหลือ Lv') ? saved.split(' · อุปกรณ์ยังอยู่ในช่อง')[0] : '';
  const inactive = inactiveEquipment(ch, data);
  const wear = inactive.length ? 'อุปกรณ์ยังอยู่ในช่อง · สถานะไม่ได้ใช้: ' + inactive.map(it =>
    data.items.gearBases[gearItem(ch,it.uid).base].nameTh + ' · ' + it.missing.join(', ')).join(' / ') : '';
  return [reset, wear].filter(Boolean).join(' · ');
}

/** Repair structurally impossible hands only. Unmet wear gates do not unequip. */
export function enforceEquipment(ch, data) {
  const moved = [];
  const drop = (slot) => {
    const item = gearItem(ch, ch.equipped[slot]);
    moved.push({ slot, uid:item.uid, requires:wearRequirements(ch,data,item,slot) });
    ch.equipped[slot] = null;
  };
  const off = gearItem(ch, ch.equipped.offhand);
  if (off && (off.uid === ch.equipped.weapon || handBlocker(ch, data, off, 'offhand'))) drop('offhand');
  return moved;
}

/** Equip into `slot` (default: the item's own slot; light weapons may go to 'offhand'). */
export function equip(ch, data, uid, slot = null) {
  const item = gearItem(ch, uid);
  if (!item) return { ok: false };
  const base = data.items.gearBases[item.base];
  slot = slot || base.slot;
  const block = handBlocker(ch, data, item, slot);
  if (block) return { ok: false, reason: block };
  const next = { ...ch.equipped };
  for (const s of data.items.slots) if (next[s] === uid) next[s] = null;
  next[slot] = uid;
  const freed = [];
  // A two-hand weapon frees the left hand; a heavy one cannot be paired with a light weapon.
  const off = gearItem(ch, next.offhand);
  if (slot === 'weapon' && off && handBlocker(ch, data, off, 'offhand', next)) {
    freed.push(off.uid);
    next.offhand = null;
  }
  if (!next.weapon) return { ok: false, reason: 'weapon' }; // always hold something
  const req = gearEquipState(ch, data, item, slot, next);
  if (!req.ok) return req;
  const partner = gearItem(ch, next[OTHER_HAND[slot]]);
  if (partner && !gearEquipState(ch, data, partner, OTHER_HAND[slot], next).ok)
    return { ...gearEquipState(ch, data, partner, OTHER_HAND[slot], next), reason: 'requires_pair' };
  ch.equipped = next;
  return { ok: true, freed };
}

export function unequip(ch, data, slot) {
  if (slot === 'weapon') return { ok: false, reason: 'weapon' }; // always hold something
  ch.equipped[slot] = null;
  return { ok: true };
}

// ---------- Arrows ----------

/** The arrow type that will be shot next: the chosen one, else any type still stocked. */
export function arrowInUse(ch, data) {
  const stock = ch.arrows?.stock || {}, types = data.items.arrows?.types || {};
  if (types[ch.arrows?.use] && stock[ch.arrows.use] > 0) return ch.arrows.use;
  return Object.keys(types).find((id) => stock[id] > 0) || null;
}

export function arrowTotal(ch) {
  return Object.values(ch.arrows?.stock || {}).reduce((a, n) => a + n, 0);
}

/** Arrows one cast of skill `s` (computed) needs; 0 for anything but Attack+Projectile. */
export function arrowsPerCast(data, s) {
  const rules = data.items.arrows;
  if (!rules || !s?.tags?.has?.('Attack') || !s.tags.has('Projectile')) return 0;
  return rules.perCast + (s.projectiles > 1 ? rules.multiShotExtra : 0);
}

/** Take `n` arrows, from the type in use first. Returns false (and takes none) if short. */
export function spendArrows(ch, data, n) {
  if (arrowTotal(ch) < n) return false;
  const stock = ch.arrows.stock;
  while (n > 0) {
    const id = arrowInUse(ch, data), take = Math.min(n, stock[id]);
    stock[id] -= take;
    n -= take;
    if (!stock[id]) delete stock[id];
  }
  return true;
}

export function chooseArrows(ch, data, id) {
  if (!data.items.arrows?.types[id]) return { ok: false, reason: 'unknown' };
  ch.arrows.use = id;
  return { ok: true };
}

/** What the renderer needs to dress the hero. */
export function gearLook(ch, data) {
  const out = { weapon: null, offhand: null, armor: 'tunic', helm: null, gloves: null, bases: {} };
  for (const slot of data.items.slots) {
    const item = gearItem(ch, ch.equipped[slot]);
    if (item) out.bases[slot] = item.base;
  }
  const w = gearItem(ch, ch.equipped.weapon);
  if (w) out.weapon = data.items.gearBases[w.base].weaponType || 'sword';
  else out.unarmed = true;
  const o = out.bases.offhand && data.items.gearBases[out.bases.offhand];
  // Left hand: a shield, a second light weapon, or the arrows in use with a bow.
  if (o) out.offhand = o.slot === 'offhand' ? o.offhandType || 'shield' : o.weaponType;
  else if (out.weapon && data.items.weaponTypes[out.weapon]?.ammo && arrowInUse(ch, data)) out.offhand = 'quiver';
  if (out.bases.gloves) out.gloves = data.items.gearBases[out.bases.gloves].look || 'hide';
  const a = gearItem(ch, ch.equipped.armor);
  if (a) out.armor = data.items.gearBases[a.base].look || 'tunic';
  const h = gearItem(ch, ch.equipped.helm);
  if (h) out.helm = data.items.gearBases[h.base].look || null;
  return out;
}

// ---------- Derived stats ----------

/** Everything combat needs, folded from stats, gear and job nodes. */
export function derive(ch, data) {
  const pc = data.progression.character;
  const d = {
    attack: pc.base.attack || 0,
    magic: pc.base.magic || 0,
    defense: 0,
    maxHp: 0,
    maxMp: 0,
    meleeDamagePct: 0,
    projectileDamagePct: 0,
    areaDamagePct: 0,
    dotDamagePct: 0,
    persistentDurationPct: 0,
    controlDurationPct: 0,
    spellDamagePct: 0,
    summonDamagePct: 0,
    maxHpPct: 0,
    maxMpPct: 0,
    barrierPct: 0,
    healPct: 0,
    moveSpeedPct: 0,
    cooldownPct: 0,
    critChancePct: pc.baseCritChancePct,
    damageTakenPct: 0,
    hpRegen: pc.base.hpRegen,
    mpRegenPct: 0,
    projectileSpeedPct: 0,
    areaRadiusPct: 0,
    echoDamagePct: 0,
    extraMovementCharges: 0,
    meleeHitBarrier: 0,
    healGrantsBarrierPct: 0,
    meleeArcAdd: 0,
    poisonChancePct: 0,
    leechPct: 0,
    blockChancePct: 0,
    goldFindPct: 0,
    materialFindPct: 0,
    gearFindPct: 0,
    critMultPct: 0,
    damagePct: 0,
    attackDamagePct: 0,
    castSpeedPct: 0,
    elementalDamagePct: 0,
    penetrationPct: 0,
    movementRechargePct: 0,
    manaCostReductionPct: 0,
  };
  const add = (k, v) => {
    d[k] = (d[k] || 0) + v;
  };
  for (const s of STATS) {
    const per = pc.perStat[s] || {};
    for (const k in per) add(k, per[k] * ch.stats[s]);
  }
  for (const slot of data.items.slots || ['weapon', 'armor']) {
    const item = gearItem(ch, ch.equipped[slot]);
    if (!item || !gearEquipState(ch,data,item,slot).ok) continue;
    const gs = gearStats(item, data);
    for (const k in gs) add(k, gs[k]);
    const imp = weaponImplicit(item, data);
    for (const k in imp) add(k, imp[k]);
  }
  // A bow's left hand holds the arrows in use: their stats count while any are left.
  const main = gearItem(ch, ch.equipped.weapon);
  const bow = main && gearEquipState(ch,data,main,'weapon').ok && data.items.weaponTypes[data.items.gearBases[main.base].weaponType]?.ammo;
  const arrow = bow ? arrowInUse(ch, data) : null;
  if (arrow) for (const [k, v] of Object.entries(data.items.arrows.types[arrow].stats)) add(k, v);
  for (const n of ch.jobNodes) {
    const eff = data.jobtree.nodes[n]?.effects || {};
    for (const k in eff) add(k, eff[k]);
  }
  const base = pc.base;
  const soft = pc.softCaps;
  for (const stat of soft?.stats || []) if (d[stat] > soft.threshold)
    d[stat] = soft.threshold + (d[stat] - soft.threshold) * soft.overflowFactor;
  for (const [stat, limit] of Object.entries(pc.caps || {}))
    d[stat] = limit < 0 ? Math.max(d[stat], limit) : Math.min(d[stat], limit);
  d.maxHp = Math.round((base.hp + base.hpPerLevel * (ch.level - 1) + base.hpPerVit * ch.stats.VIT + d.maxHp) * (1 + d.maxHpPct / 100));
  d.maxMp = Math.round((base.mp + base.mpPerLevel * (ch.level - 1) + base.mpPerInt * ch.stats.INT + d.maxMp) * (1 + d.maxMpPct / 100));
  d.mpRegen = base.mpRegen * (1 + d.mpRegenPct / 100) + ch.stats.INT * base.mpRegenPerInt;
  d.moveSpeed = base.moveSpeed * (1 + d.moveSpeedPct / 100);
  d.critChance = d.critChancePct / 100;
  d.critMult = pc.critMult * (1 + d.critMultPct / 100);
  d.attack = Math.round(d.attack * 10) / 10;
  d.magic = Math.round(d.magic * 10) / 10;
  d.defense = Math.round(d.defense);
  d.weaponType = main && gearEquipState(ch,data,main,'weapon').ok ? data.items.gearBases[main.base].weaponType : 'none';
  const off = gearItem(ch, ch.equipped.offhand), offOk = off && gearEquipState(ch,data,off,'offhand').ok;
  d.offhand = offOk ? (handsOf(data, off) === 'off' ? 'shield' : 'weapon') : arrow ? 'arrows' : 'none';
  d.dualWield = d.offhand === 'weapon';
  d.blockChance = d.offhand === 'shield' ? d.blockChancePct / 100 : 0;
  return d;
}
