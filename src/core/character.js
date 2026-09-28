// Character progression: Character Level -> Stat Points, Job Level -> Job Points (Job Tree),
// equipment (5 slots), appearance, and derived combat stats. The character object is plain
// JSON so it can be saved and ported as-is (Godot: a Dictionary or a Resource).

export const STATS = ['STR', 'AGI', 'VIT', 'INT', 'DEX'];
export const CHARACTER_VERSION = 2;

export function emptyProgress() {
  return { waypoints: ['town'], zones: ['settlement'], kills: {}, collected: {}, quests: {}, crafted: 0, socketed: 0, deaths: 0, playTime: 0, bossKills: {} };
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
    gold: st.gold,
    materials: {},
    gear: [],
    equipped: Object.fromEntries((data.items.slots || ['weapon', 'armor']).map((s) => [s, null])),
    skills: { ...st.skills },
    movementSkills: [...st.movementSkills],
    movement: kit ? kit.movement : st.movement,
    mods: [],
    slots: (kit ? kit.slots : st.slots).map((s) => ({ skill: s, mods: [] })),
    nextUid: 1,
    bossKills: 0,
    progress: emptyProgress(),
    pos: null,
  };
  const startGear = kit ? [kit.weapon, ...st.gear.filter((g) => data.items.gearBases[g]?.slot !== 'weapon')] : st.gear;
  for (const baseId of startGear) {
    const base = data.items.gearBases[baseId];
    if (!base) continue;
    const item = { uid: ch.nextUid++, base: baseId, grade: 'B', upgrade: 0, options: [] };
    ch.gear.push(item);
    ch.equipped[base.slot] = item.uid;
  }
  return ch;
}

/** Bring an older save up to date (v1 -> v2). Never throws on missing fields. */
export function migrateCharacter(ch, data) {
  if (!ch || typeof ch !== 'object') return null;
  const slots = data.items.slots || ['weapon', 'armor'];
  ch.equipped = ch.equipped || {};
  for (const s of slots) if (!(s in ch.equipped)) ch.equipped[s] = null;
  ch.progress = { ...emptyProgress(), ...(ch.progress || {}) };
  for (const k of ['kills', 'collected', 'quests', 'bossKills']) ch.progress[k] = ch.progress[k] || {};
  if (!ch.name) ch.name = 'Wanderer';
  if (!('appearance' in ch)) ch.appearance = null;
  if (!ch.kit) ch.kit = 'sword';
  if (!ch.skills.hunter_shot) ch.skills.hunter_shot = 1;
  // drop references to things that no longer exist
  ch.slots = (ch.slots || []).map((s) => ({ skill: s.skill && data.skills.combat[s.skill] ? s.skill : null, mods: (s.mods || []).filter((u) => (ch.mods || []).some((m) => m.uid === u && data.mods.mods[m.id])) }));
  while (ch.slots.length < data.progression.slotCount) ch.slots.push({ skill: null, mods: [] });
  ch.mods = (ch.mods || []).filter((m) => data.mods.mods[m.id]);
  ch.gear = (ch.gear || []).filter((g) => data.items.gearBases[g.base]);
  for (const s of slots) if (ch.equipped[s] && !ch.gear.some((g) => g.uid === ch.equipped[s])) ch.equipped[s] = null;
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

export function jobNodeState(ch, data, nodeId) {
  const tree = data.jobtree;
  const node = tree.nodes[nodeId];
  if (!node) return { can: false, reason: 'unknown' };
  if (ch.jobNodes.includes(nodeId)) return { can: false, taken: true, reason: 'taken' };
  const linked = node.links.some((l) => ch.jobNodes.includes(l));
  if (!linked) return { can: false, reason: 'not_linked' };
  if (node.requiresJob && currentJob(ch, data)?.branch !== node.requiresJob) return { can: false, reason: 'requires_job', need: node.requiresJob };
  if (ch.jobPoints < 1) return { can: false, reason: 'no_points' };
  if (node.type === 'job') {
    if (ch.jobLevel < data.progression.job.jobChoiceLevel) return { can: false, reason: 'job_level', need: data.progression.job.jobChoiceLevel };
    const other = ch.jobNodes.find((n) => tree.nodes[n].type === 'job');
    if (other) return { can: false, reason: 'one_job', other };
  }
  return { can: true };
}

export function allocateJobNode(ch, data, nodeId) {
  const st = jobNodeState(ch, data, nodeId);
  if (!st.can) return st;
  ch.jobNodes.push(nodeId);
  ch.jobPoints -= 1;
  return { can: true, done: true, job: data.jobtree.nodes[nodeId].type === 'job' };
}

/** Shortest permitted preview route from the learned network; never spends points. */
export function jobPath(ch, data, target) {
  const { nodes } = data.jobtree;
  if (!nodes[target]) return [];
  const job = currentJob(ch, data)?.branch;
  const queue = ch.jobNodes.filter(id => nodes[id]).map(id => [id]);
  const seen = new Set(ch.jobNodes);
  while (queue.length) {
    const path = queue.shift(), last = path.at(-1);
    if (last === target) return path;
    for (const id of nodes[last].links) {
      if (seen.has(id)) continue;
      const n = nodes[id];
      const routeJob = job || path.map(k => nodes[k]).find(n => n.type === 'job')?.branch;
      if (n.type === 'job' && ((routeJob && routeJob !== n.branch) || ch.jobLevel < data.progression.job.jobChoiceLevel)) continue;
      if (n.requiresJob && n.requiresJob !== routeJob) continue;
      seen.add(id);
      queue.push([...path, id]);
    }
  }
  return [];
}

export function currentJob(ch, data) {
  const id = ch.jobNodes.find((n) => data.jobtree.nodes[n].type === 'job');
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
  for (const k in out) if (Math.abs(out[k]) >= 3) out[k] = Math.round(out[k]);
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

export function equip(ch, data, uid) {
  const item = gearItem(ch, uid);
  if (!item) return { ok: false };
  const base = data.items.gearBases[item.base];
  const req = meetsRequires(ch, base.requires);
  if (!req.ok) return { ok: false, missing: req.missing };
  ch.equipped[base.slot] = uid;
  return { ok: true };
}

export function unequip(ch, data, slot) {
  if (slot === 'weapon') return { ok: false, reason: 'weapon' }; // always hold something
  ch.equipped[slot] = null;
  return { ok: true };
}

/** What the renderer needs to dress the hero. */
export function gearLook(ch, data) {
  const out = { weapon: null, armor: 'tunic', helm: null, bases: {} };
  for (const slot of data.items.slots) {
    const item = gearItem(ch, ch.equipped[slot]);
    if (item) out.bases[slot] = item.base;
  }
  const w = gearItem(ch, ch.equipped.weapon);
  if (w) out.weapon = data.items.gearBases[w.base].weaponType || 'sword';
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
    attack: 0,
    magic: 0,
    defense: 0,
    maxHp: 0,
    maxMp: 0,
    meleeDamagePct: 0,
    projectileDamagePct: 0,
    areaDamagePct: 0,
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
    if (!item) continue;
    const gs = gearStats(item, data);
    for (const k in gs) add(k, gs[k]);
    const imp = weaponImplicit(item, data);
    for (const k in imp) add(k, imp[k]);
  }
  for (const n of ch.jobNodes) {
    const eff = data.jobtree.nodes[n].effects;
    for (const k in eff) add(k, eff[k]);
  }
  const base = pc.base;
  d.maxHp = Math.round((base.hp + base.hpPerLevel * (ch.level - 1) + base.hpPerVit * ch.stats.VIT + d.maxHp) * (1 + d.maxHpPct / 100));
  d.maxMp = Math.round((base.mp + base.mpPerLevel * (ch.level - 1) + base.mpPerInt * ch.stats.INT + d.maxMp) * (1 + d.maxMpPct / 100));
  d.mpRegen = base.mpRegen * (1 + d.mpRegenPct / 100) + ch.stats.INT * 0.08;
  d.moveSpeed = base.moveSpeed * (1 + d.moveSpeedPct / 100);
  d.cooldownPct = Math.min(d.cooldownPct, 40);
  d.critChance = Math.min(d.critChancePct, 60) / 100;
  d.critMult = pc.critMult;
  d.attack = Math.round(d.attack);
  d.magic = Math.round(d.magic);
  d.defense = Math.round(d.defense);
  const w = gearItem(ch, ch.equipped.weapon);
  d.weaponType = w ? data.items.gearBases[w.base].weaponType : 'none';
  return d;
}
