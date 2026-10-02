// Analytical feasibility model only. This does not compile or execute a fusion in the game.
// Run: node scripts/skill-infusion-study.mjs > /tmp/skill-infusion-report.json
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadData } from '../src/core/data-node.js';
import { createCharacter, derive } from '../src/core/character.js';
import { computeSkill } from '../src/core/skills.js';

const data = loadData();
const trial = JSON.parse(readFileSync(new URL('../docs/research/skill-infusion-trial.json', import.meta.url), 'utf8'));
const round = value => Math.round(value * 100) / 100;
const rankAt = level => 1 + data.progression.skillUpgrade.steps.filter(step => step.requiresLevel <= level).length;

function fixture(level, hostId, donorId, role) {
  const primary = hostId === 'hunter_shot' ? 'DEX' : 'STR';
  const ch = createCharacter(data, { kit: role === 'mage' ? 'staff' : primary === 'DEX' ? 'bow' : 'sword' });
  const points = data.progression.character.startingStatPoints + (level - 1) * data.progression.character.statPointsPerLevel;
  const vit = Math.floor(points * trial.defenseStatPointFraction);
  const offense = points - vit;
  const main = role === 'hybrid' ? Math.floor(offense * trial.hybridPrimaryDamagePointFraction) : role === 'physical' ? offense : 0;
  ch.level = level;
  ch.stats.VIT += vit;
  ch.stats[primary] += main;
  ch.stats.INT += offense - main;
  ch.statPoints = 0;
  // Starter C/+0 equipment, no affixes or Job passives. Isolate the stat split and proposed transfer.
  for (const item of ch.gear) item.options = [];
  for (const id of [hostId, donorId]) ch.skills[id] = rankAt(level);
  ch.slots[0] = { skill: hostId, mods: [] };
  ch.slots[1] = { skill: donorId, mods: [] };
  const d = derive(ch, data);
  const host = computeSkill(ch, data, d, 0), donor = computeSkill(ch, data, d, 1);
  assert.ok(role === 'mage' ? donor.requirementsMet : role === 'physical' ? host.requirementsMet : host.requirementsMet && donor.requirementsMet,
    'Each role must meet requirements for the skills it actually uses');
  assert.equal(Object.keys(ch.stats).reduce((sum, stat) => sum + ch.stats[stat] - data.progression.character.startingStats[stat], 0), points);
  return { ch, d, host, donor, points };
}

function rates(damage, cooldown, cost, regen) {
  const castsPerSecond = 1 / cooldown;
  const sustainableCasts = Math.min(castsPerSecond, cost ? regen / cost : Infinity);
  return { burst: damage * castsPerSecond, sustained: damage * sustainableCasts };
}

const rows = [];
for (const level of trial.levels) for (const hostId of trial.hosts) for (const donorId of trial.donors) {
  const physical = fixture(level, hostId, donorId, 'physical');
  const mage = fixture(level, hostId, donorId, 'mage');
  const hybrid = fixture(level, hostId, donorId, 'hybrid');
  const { host, donor, d } = hybrid;
  // The transferred spell's total budget is per original use, across every child/target/repeat.
  // Faster hosts get a smaller budget per use; at full attack speed the magic portion stays
  // <=35% of the SAME hybrid character's normal spell first-hit DPS.
  const rateFraction = Math.min(1, host.cooldown / donor.cooldown);
  const extra = Math.min(trial.addedDamageCapFraction * host.damage,
    trial.spellDamageFraction * donor.damage * rateFraction);
  const hostPart = host.damage * trial.hostDamageFactor;
  const damage = hostPart + extra;
  const cost = host.cost + Math.ceil(trial.flatMana + trial.manaFraction * donor.cost);
  const rHybrid = rates(damage, host.cooldown, cost, d.mpRegen);
  const rPhysical = rates(physical.host.damage, physical.host.cooldown, physical.host.cost, physical.d.mpRegen);
  const rMage = rates(mage.donor.damage, mage.donor.cooldown, mage.donor.cost, mage.d.mpRegen);
  assert.ok(extra / host.cooldown <= trial.spellDamageFraction * donor.damage / donor.cooldown + 1e-9);
  assert.ok(extra <= trial.addedDamageCapFraction * host.damage + 1e-9);
  assert.ok(cost > host.cost);
  rows.push({
    level, host: hostId, donor: donorId, rank: host.level, equalStatPoints: hybrid.points,
    hybridStats: hybrid.ch.stats,
    physicalBurstDps: round(rPhysical.burst), mageFirstHitBurstDps: round(rMage.burst), hybridBurstDps: round(rHybrid.burst),
    physicalSustainedDps: round(rPhysical.sustained), mageFirstHitSustainedDps: round(rMage.sustained), hybridSustainedDps: round(rHybrid.sustained),
    hybridHostDamage: round(hostPart), convertedDamage: round(hostPart * trial.conversionFraction),
    addedMagicBudgetPerUse: round(extra), addedMagicDpsUpperBound: round(extra / host.cooldown),
    combinedManaPerUse: round(cost), manaPerSecondAtFullSpeed: round(cost / host.cooldown), hybridManaRegen: round(d.mpRegen),
    manaOnlyBurstSeconds: round(d.maxMp / Math.max(1e-9, cost / host.cooldown - d.mpRegen)),
    exceedsMageFirstHitBurst: rHybrid.burst > rMage.burst,
    exceedsPhysicalBurst: rHybrid.burst > rPhysical.burst,
  });
}

console.log(JSON.stringify({
  status: 'analytical_proposal_not_gameplay_validation', sourceCommit: trial.sourceCommit,
  assumptions: [
    'Same total allocated Stat Points and VIT share; physical invests offense in STR/DEX, mage in INT, hybrid splits 55/45.',
    'Starter equipment C/+0 without affixes; no Job passives or mods. Each role has appropriate starter weapon.',
    'Single first contact per use, stationary target, raw pre-defense damage, no critical hits, combo finishers, area coverage, chain bounces or status damage.',
    'Mana-only sustained rate in combat, excluding town regeneration, consumables and manual unbinding.',
    'First-hit comparisons do not measure full mage spell output, range, AoE/control or party value.',
    'The two budget invariants limit the transferred magic portion, not all hybrid damage against an independently built mage.',
  ],
  caseCount: rows.length,
  findings: {
    magicBudgetInvariantsPass: true,
    naiveHalfStrengthFireboltDpsRatioWhenUsedAtHunterCadence: round(0.5 * data.skills.combat.firebolt.cooldown / data.skills.combat.hunter_shot.cooldown),
    naiveHalfStrengthFrostNovaDpsRatioWhenUsedAtSlashCadence: round(0.5 * data.skills.combat.frost_nova.cooldown / data.skills.combat.slash.cooldown),
    casesExceedingMageFirstHitBurst: rows.filter(row => row.exceedsMageFirstHitBurst).length,
    casesExceedingPhysicalBurst: rows.filter(row => row.exceedsPhysicalBurst).length,
  }, rows,
}, null, 2));
