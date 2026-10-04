// Character progression: Character Level -> Stat Points, Job Level -> Job Points (Job Tree),
// equipment (two hands + armour slots, items.slots), arrows, appearance, and derived combat stats. The character object is plain
// JSON so it can be saved and ported as-is (Godot: a Dictionary or a Resource).
import { enterMap } from './maps.js';

import { equipmentItemLevel, normalizeItemMetadata } from './item-metadata.js';

export const STATS = ['STR', 'AGI', 'VIT', 'INT', 'DEX'];
export const CHARACTER_VERSION = 6;

export function emptyProgress(data) {
  const starter = data?.world.id ? data.world : null;
  return { waypoints: starter ? starter.waypoints.filter(w => w.unlocked).map(w => w.id) : ['town'], zones: starter ? ['landing'] : ['settlement'], kills: {}, collected: {}, quests: {}, crafted: 0, socketed: 0, deaths: 0, playTime: 0, bossKills: {}, maps: {} };
}

/**
 * @param {object} data game data
 * @param {{kit?:string, name?:string, appearance?:object}} opts
 */
export function createCharacter(data, opts = {}) {
  const p = data.progression;
  const st = p.start;
  const kit = st.kits?.[opts.kit || st.defaultKit] || null;
  const ch = {
    version: CHARACTER_VERSION,
    name: opts.name || 'Wanderer',
    appearance: opts.appearance ? { ...opts.appearance } : null,
    kit: opts.kit || st.defaultKit || 'sword',
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
    skills: { ...st.skills },
    movementSkills: [...st.movementSkills],
    movement: kit ? kit.movement : st.movement,
    mods: [],
    arrows: { use: Object.keys(data.items.arrows?.start || {})[0] || null, stock: { ...(data.items.arrows?.start || {}) } },
    slots: (kit ? kit.slots : st.slots).map((s) => ({ skill: s, mods: [] })),
    nextUid: 1,
    bossKills: 0,
    progress: emptyProgress(data),
    worldId: data.world.id || 'frontier',
    worldLayoutRevision: data.world.layoutRevision || null,
    pos: null,
  };
  const startGear = kit ? [kit.weapon, ...st.gear.filter((g) => data.items.gearBases[g]?.slot !== 'weapon')] : st.gear;
  for (const baseId of startGear) {
    const base = data.items.gearBases[baseId];
    if (!base) continue;
    const options = base.optionPool.slice(0, data.items.grades.optionCount.C).map(id => ({ id, value: data.items.gearOptions[id].min }));
    const item = { uid: ch.nextUid++, base: baseId, itemLevel: equipmentItemLevel(data, {base:baseId}), grade: 'C', upgrade: 0, options };
    ch.gear.push(item);
    ch.equipped[base.slot] = item.uid;
  }
  return ch;
}

/** Bring older saves up to date. Rebalance migration is one-time and preserves ownership. */
export function migrateCharacter(ch, data) {
  if (!ch || typeof ch !== 'object') return null;
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
  if (!ch.kit) ch.kit = 'sword';
  ch.skills = ch.skills || { ...data.progression.start.skills };
  if (!ch.skills.hunter_shot) ch.skills.hunter_shot = 1;
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
    ch.progress.gearMigration = 'เกรดอุปกรณ์ใหม่ C/B/A/S มี 2/3/4/5 ออฟชั่น เติมช่องที่ขาดแล้ว · ตีบวกได้ตามวัตถุดิบ สวมใส่ตามสเตตัส';
  }
  if (ch.treeRevision !== data.jobtree.revision) {
    const spent = new Set((ch.jobNodes || []).filter(id => id !== data.jobtree.origin)).size;
    ch.jobPoints = (ch.jobPoints || 0) + spent;
    ch.jobNodes = [data.jobtree.origin];
    ch.treeRevision = data.jobtree.revision;
    ch.progress.balanceMigration = 'ปรับสมดุลใหม่: คืนแต้มต้นไม้ทั้งหมดฟรี เลือกเส้นทางและอาชีพใหม่ได้ อุปกรณ์ สกิล ม็อด และวัตถุดิบยังอยู่ครบ';
  }
  for (const s of slots) if (ch.equipped[s] && !ch.gear.some((g) => g.uid === ch.equipped[s])) ch.equipped[s] = null;
  const moved = enforceEquipment(ch, data);
  if (moved.length) ch.progress.equipmentNotice = 'รีเควสสเตตัสเพิ่ม: เก็บอุปกรณ์ที่สวมไม่ได้ไว้ในกระเป๋า ' + moved.map(it => data.items.gearBases[gearItem(ch,it.uid).base].nameTh).join(', ');
  if ((ch.version || 1) < 6 || !ch.arrows) {
    // v6: two hands, gloves and arrows. Existing archers keep shooting: everyone starts with a stock.
    ch.arrows = { use: Object.keys(data.items.arrows?.start || {})[0] || null, stock: { ...(data.items.arrows?.start || {}) } };
  }
  ch.arrows.stock = Object.fromEntries(Object.entries(ch.arrows.stock || {}).filter(([id, n]) => data.items.arrows?.types[id] && n > 0));
  ch.movementSkills = (ch.movementSkills || ['dash']).filter((m) => data.skills.movement[m]);
  if (!ch.movementSkills.includes(ch.movement)) ch.movement = ch.movementSkills[0] || 'dash';
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

/** Shortest connected route for inspection. Section gates still require total investment;
 * this helper never invents unrelated filler purchases or mutates the character. */
export function jobPath(ch, data, target) {
  const nodes = data.jobtree.nodes;
  if (!nodes[target]) return [];
  if (ch.jobNodes.includes(target)) return [target];
  if (nodes[target].requires) {
    const ordered = [], seen = new Set();
    const visit = id => {
      if (seen.has(id) || ch.jobNodes.includes(id) || !nodes[id]) return;
      seen.add(id);
      for (const parent of nodes[id].requires || []) visit(parent);
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

/** Actual item power controls wear requirements; character level never does. */
export function gearPower(stats, data) {
  const weights = data.items.requirements.weights;
  return Object.entries(stats).reduce((sum,[stat,value]) => sum + Math.abs(value) * (weights[stat] || 0), 0);
}

export function gearRequirements(item, data) {
  const base = data.items.gearBases[item.base], rules = data.items.requirements;
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
  const requires = wearRequirements(ch,data,item,slot,equipped), state = meetsRequires(ch,requires);
  return { ...state, reason:state.ok ? null : 'requires', requires };
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

/** Keep an upgraded or respec-invalidated item in the bag, never delete it. */
export function enforceEquipment(ch, data) {
  const moved = [];
  const drop = (slot) => {
    const item = gearItem(ch, ch.equipped[slot]);
    moved.push({ slot, uid:item.uid, requires:wearRequirements(ch,data,item,slot) });
    ch.equipped[slot] = null;
  };
  const off = gearItem(ch, ch.equipped.offhand);
  if (off && (off.uid === ch.equipped.weapon || handBlocker(ch, data, off, 'offhand'))) drop('offhand');
  // The left hand goes first: a pair can fail only because of its partner.
  for (const slot of ['offhand', ...data.items.slots.filter((s) => s !== 'offhand')]) {
    const item = gearItem(ch,ch.equipped[slot]);
    if (item && !gearEquipState(ch,data,item,slot).ok) drop(slot);
  }
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
    if (item && gearEquipState(ch,data,item,slot).ok) out.bases[slot] = item.base;
  }
  const w = gearItem(ch, ch.equipped.weapon);
  if (w && gearEquipState(ch,data,w,'weapon').ok) out.weapon = data.items.gearBases[w.base].weaponType || 'sword';
  const o = out.bases.offhand && data.items.gearBases[out.bases.offhand];
  // Left hand: a shield, a second light weapon, or the arrows in use with a bow.
  if (o) out.offhand = o.slot === 'offhand' ? o.offhandType || 'shield' : o.weaponType;
  else if (out.weapon && data.items.weaponTypes[out.weapon]?.ammo && arrowInUse(ch, data)) out.offhand = 'quiver';
  if (out.bases.gloves) out.gloves = data.items.gearBases[out.bases.gloves].look || 'hide';
  const a = gearItem(ch, ch.equipped.armor);
  if (a && gearEquipState(ch,data,a,'armor').ok) out.armor = data.items.gearBases[a.base].look || 'tunic';
  const h = gearItem(ch, ch.equipped.helm);
  if (h && gearEquipState(ch,data,h,'helm').ok) out.helm = data.items.gearBases[h.base].look || null;
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
  d.critMult = pc.critMult;
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
