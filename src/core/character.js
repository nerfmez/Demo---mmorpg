// Character progression: Character Level -> Stat Points, Job Level -> Job Points (Job Tree),
// gear, and derived combat stats. The character object is plain JSON so it can be saved
// and ported as-is (Godot: a Dictionary or a Resource with the same fields).

export const STATS = ['STR', 'AGI', 'VIT', 'INT', 'DEX'];

export function createCharacter(data) {
  const p = data.progression;
  const ch = {
    version: 1,
    level: 1,
    exp: 0,
    statPoints: p.character.startingStatPoints,
    stats: { ...p.character.startingStats },
    jobLevel: 1,
    jobExp: 0,
    jobPoints: 0,
    jobNodes: [data.jobtree.origin],
    gold: p.start.gold,
    materials: {},
    gear: [],
    equipped: { weapon: null, armor: null },
    skills: { ...p.start.skills },
    movementSkills: [...p.start.movementSkills],
    movement: p.start.movement,
    mods: [],
    slots: p.start.slots.map((s) => ({ skill: s, mods: [] })),
    nextUid: 1,
    bossKills: 0,
  };
  for (const baseId of p.start.gear) {
    const item = { uid: ch.nextUid++, base: baseId, grade: 'B', upgrade: 0, options: [] };
    ch.gear.push(item);
    ch.equipped[data.items.gearBases[baseId].slot] = item.uid;
  }
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
  return { can: true, done: true };
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

export function gearStats(item, data) {
  const base = data.items.gearBases[item.base];
  const g = data.items.grades;
  const mult = g.statMult[item.grade] * (1 + item.upgrade * data.items.upgrade.statPerLevel);
  const out = {};
  for (const k in base.stats) out[k] = Math.round(base.stats[k] * mult);
  for (const o of item.options) {
    const stat = data.items.gearOptions[o.id].stat;
    out[stat] = (out[stat] || 0) + o.value;
  }
  return out;
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
  };
  const add = (k, v) => {
    d[k] = (d[k] || 0) + v;
  };
  for (const s of STATS) {
    const per = pc.perStat[s] || {};
    for (const k in per) add(k, per[k] * ch.stats[s]);
  }
  for (const slot of ['weapon', 'armor']) {
    const item = gearItem(ch, ch.equipped[slot]);
    if (!item) continue;
    const gs = gearStats(item, data);
    for (const k in gs) add(k, gs[k]);
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
