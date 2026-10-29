// Movement skills rank up with their main stat (owner, 2026-10-25; a main stat since 2026-10-29, docs/STATS-TH.md):
// data.progression.movementUpgrade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, derive, migrateCharacter } from '../../src/core/character.js';
import { movementSkill, movementRank } from '../../src/core/skills.js';
import { movementUpgradeState, upgradeMovement } from '../../src/core/crafting.js';

const mu = data.progression.movementUpgrade;
function hero(dex = 3) {
  const ch = createCharacter(data);
  ch.movementSkills = ['dash']; ch.movement = 'dash';
  ch.stats.DEX = dex; ch.gold = 1e5; ch.materials = { skill_crystal: 50 };
  return ch;
}

test('every movement skill upgrades with a main stat (dash and roll with DEX)', () => {
  for (const [id, d] of Object.entries(data.skills.movement)) assert.ok(data.progression.character.mainStats.includes(d.upgradeStat), id);
  assert.equal(data.skills.movement.dash.upgradeStat, 'DEX');
  assert.equal(mu.steps.length, mu.maxLevel - 1);
});

test('a rank needs the step\'s stat and its materials, pays them once, and stops at the cap', () => {
  const ch = hero(mu.steps[0].requiresStat - 1);
  const short = movementUpgradeState(ch, data, 'dash');
  assert.equal(short.reason, 'requires');
  assert.equal(upgradeMovement(ch, data, 'dash').ok, false);
  assert.equal(movementRank(ch, 'dash'), 1, 'nothing changes when refused');
  ch.stats.DEX = 99;
  const gold = ch.gold, crystals = ch.materials.skill_crystal;
  assert.equal(upgradeMovement(ch, data, 'dash').level, 2);
  assert.equal(ch.gold, gold - mu.steps[0].gold);
  assert.equal(ch.materials.skill_crystal, crystals - mu.steps[0].skill_crystal);
  while (upgradeMovement(ch, data, 'dash').ok);
  assert.equal(movementRank(ch, 'dash'), mu.maxLevel);
  assert.equal(movementUpgradeState(ch, data, 'dash').reason, 'max');
  assert.equal(movementUpgradeState(ch, data, 'blink').reason, 'not_learned');
});

test('each rank shortens the recharge and lengthens the move', () => {
  const ch = hero(99), d = derive(ch, data);
  const r1 = movementSkill(ch, data, d);
  upgradeMovement(ch, data, 'dash'); upgradeMovement(ch, data, 'dash');
  const r3 = movementSkill(ch, data, d);
  assert.equal(r3.rank, 3);
  assert.ok(Math.abs(r3.recharge - r1.recharge * (1 - mu.rechargePerLevel * 2)) < 1e-9);
  assert.ok(Math.abs(r3.distance - r1.distance * (1 + mu.distancePerLevel * 2)) < 1e-9);
});

test('ranks survive a save; an older save has none, and bad entries are dropped', () => {
  const ch = hero(99);
  upgradeMovement(ch, data, 'dash');
  const back = migrateCharacter(JSON.parse(JSON.stringify(ch)), data);
  assert.equal(movementRank(back, 'dash'), 2);
  const old = JSON.parse(JSON.stringify(hero())); delete old.movementRanks;
  assert.deepEqual(migrateCharacter(old, data).movementRanks, {});
  const bad = JSON.parse(JSON.stringify(hero())); bad.movementRanks = { dash: 99, nope: 3, roll: 1.5 };
  assert.deepEqual(migrateCharacter(bad, data).movementRanks, { dash: mu.maxLevel });
});
