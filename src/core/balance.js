// Balance model: a reference hero of each starting kit at every level, wearing the expected
// gear tier for that level, fighting the average normal monster of the same level. It gives
// time-to-kill, time-to-die (standing still, no dodging) and minutes per level, so the
// numbers in data/ can be checked against data.progression.balance.targets by a test.
// Pure: it never touches a live game. Reproduce with `node scripts/balance-report.mjs`.
import { createCharacter, derive, expToNext } from './character.js';
import { computeSkill } from './skills.js';

/** The expected gear item level at character level `level`: the highest tier reached. */
export function gearTierAt(data, level) {
  const tiers = data.progression.balance.gearTiers;
  return tiers.filter((t) => t <= level).pop() || tiers[0];
}

/** Skill rank the reference hero has at `level` (every rank gate it meets). */
export function skillRankAt(data, level) {
  const steps = data.progression.skillUpgrade.steps;
  return 1 + steps.filter((s) => s.requiresLevel <= level).length;
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
export function referenceHero(data, kit, level) {
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

export function balanceAt(data, kit, level) {
  const b = data.progression.balance;
  const { ch, d, itemLevel } = referenceHero(data, kit, level);
  const m = referenceMonster(data, level);
  const s = computeSkill(ch, data, d, 0);
  // A kill takes `casts` hits. uptime is the share of a fight spent casting (approach, aiming
  // and dodging take the rest). MP regenerates over the fight and the walk to the next one.
  const crit = 1 + d.critChance * (d.critMult - 1);
  const perCast = (s.damage || 0) * crit * Math.max(1, s.projectiles || 1) * (1 - m.defense / (m.defense + 60));
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
