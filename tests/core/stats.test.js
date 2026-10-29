// Stats (owner, 2026-10-29, docs/STATS-TH.md): STR, DEX and INT are the colours every requirement uses;
// VIT, AGI and LUK never gate anything. Stats come from trained points, Job Tree nodes and gear options,
// and requirements grow with the level of the skill or mod, so a focused hero meets them and a hybrid
// needs gear and the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, derive, statTotals, gearEquipState, gearRequirements } from '../../src/core/character.js';
import { computeSkill, skillRequires, modRequires } from '../../src/core/skills.js';
import { feedSkill } from '../../src/core/crafting.js';

const MAIN = data.progression.character.mainStats;

test('every requirement and upgrade stat is a main stat (STR, DEX, INT)', () => {
  assert.deepEqual(MAIN, ['STR', 'DEX', 'INT']);
  const bad = [];
  const check = (where, stats) => { for (const k of stats) if (!MAIN.includes(k)) bad.push(`${where} ${k}`); };
  for (const [id, d] of Object.entries(data.skills.combat)) check(id, [...Object.keys(skillRequires(data, d, 30)), d.upgradeStat]);
  for (const [id, d] of Object.entries(data.skills.movement)) check(id, [...Object.keys(d.requires || {}), d.upgradeStat]);
  for (const [id, m] of Object.entries(data.mods.mods)) check(id, Object.keys(modRequires(data, m, 3)));
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    for (const grade of ['C', 'S']) check(id, Object.keys(gearRequirements({ uid: 1, base: id, grade, upgrade: 0, options: [] }, data)).filter((k) => k !== 'level'));
    check(id, [b.requirementStat, ...Object.keys(b.requires || {})]);
  }
  assert.deepEqual(bad, []);
});

test('gear options and Job Tree nodes add stats; derived stats use the total', () => {
  const ch = createCharacter(data, { kit: 'sword' }), base = derive(ch, data);
  const armor = ch.gear.find((g) => data.items.gearBases[g.base].slot === 'armor');
  armor.options.push({ id: 'str_flat', value: 10 });
  const geared = derive(ch, data);
  assert.equal(geared.stats.STR, ch.stats.STR + 10);
  assert.ok(Math.abs(geared.attack - base.attack - 10 * data.progression.character.perStat.STR.attack) < 1e-9, 'STR from gear raises attack');
  const D = structuredClone(data);
  D.jobtree.nodes.origin.effects = { ...(D.jobtree.nodes.origin.effects || {}), INT: 5 };
  assert.equal(statTotals(ch, D).stats.INT, ch.stats.INT + 5, 'a Job Tree node adds its stat');
});

test("an item's own stat never meets its own requirement, and two items cannot hold each other up", () => {
  const ch = createCharacter(data, { kit: 'sword' }), sword = ch.gear.find((g) => g.uid === ch.equipped.weapon);
  sword.options.push({ id: 'str_flat', value: 5 });
  const need = gearRequirements(sword, data).STR;
  ch.stats.STR = need - 1;
  assert.equal(gearEquipState(ch, data, sword).ok, false, 'its own +5 STR does not count for itself');
  assert.equal(derive(ch, data).weaponType, 'none');
  ch.stats.STR = need;
  assert.equal(derive(ch, data).stats.STR, need + 5, 'once met, its bonus counts');
  // a shield that gives STR beside the sword that gives STR: each would meet its need only with the other's
  const shield = { uid: 9901, base: 'crab_shield', grade: 'C', upgrade: 0, options: [{ id: 'str_flat', value: 5 }] };
  ch.gear.push(shield); ch.equipped.offhand = shield.uid;
  const low = Math.min(need, gearRequirements(shield, data).STR) - 1;
  assert.ok(low + 5 >= Math.max(need, gearRequirements(shield, data).STR), 'the pair would lift each other');
  ch.stats.STR = low;
  const { active } = statTotals(ch, data);
  assert.deepEqual([active.has(sword.uid), active.has(shield.uid)], [false, false], 'neither turns on');
  assert.equal(derive(ch, data).stats.STR, low);
});

test('a skill asks for more at every level; above what the stats allow it works at the highest level they meet', () => {
  const r = data.progression.skillUpgrade.require, slash = data.skills.combat.slash;
  assert.deepEqual(skillRequires(data, slash, 1), { STR: r.base });
  assert.deepEqual(skillRequires(data, slash, 21), { STR: Math.round(r.base + r.perLevel * 20) });
  // a hybrid skill shares the growth between its stats in proportion
  const hybrid = Object.entries(data.skills.combat).find(([, d]) => Object.keys(d.requires || {}).length === 2);
  if (hybrid) {
    const [, d] = hybrid, at = skillRequires(data, d, 11), total = Object.values(d.requires).reduce((a, v) => a + v, 0);
    for (const [k, v] of Object.entries(d.requires)) assert.equal(at[k], Math.round(v + r.perLevel * 10 * v / total), k);
  }
  const ch = createCharacter(data, { kit: 'sword' });
  ch.level = 30; ch.skills.slash = 20; ch.stats.STR = skillRequires(data, slash, 12).STR;
  const s = computeSkill(ch, data, derive(ch, data), 0);
  assert.deepEqual([s.requirementsMet, s.owned, s.level], [true, 20, 12], 'held at level 12, never switched off');
  ch.stats.STR = 0;
  assert.equal(computeSkill(ch, data, derive(ch, data), 0).requirementsMet, false, 'below the first level it cannot be used');
  // feeding stops where the next level's requirement is not met
  ch.stats.STR = skillRequires(data, slash, 12).STR; ch.skills.slash = 1; ch.skillExp = {}; ch.gold = 1e6; ch.materials = { skill_crystal: 999 };
  feedSkill(ch, data, 'slash', 'skill_crystal', 999);
  assert.equal(ch.skills.slash, 12);
});

test('a mod above what the stats allow works at the highest rank they meet', () => {
  const ch = createCharacter(data, { kit: 'bow' }), split = data.mods.mods.split;
  ch.mods.push({ uid: 950, id: 'split', level: 3, grade: 'C' });
  ch.slots[0] = { skill: 'hunter_shot', mods: [950] };
  ch.stats.DEX = modRequires(data, split, 2).DEX;
  const m = computeSkill(ch, data, derive(ch, data), 0).mods[0];
  assert.deepEqual([m.active, m.level], [true, 2]);
});

test('target numbers: at the planned level a focused hero meets its skill, a two-colour hero needs gear and the tree', () => {
  const pc = data.progression.character, r = data.progression.skillUpgrade.require;
  const level = 70, points = pc.startingStatPoints + pc.statPointsPerLevel * (level - 1), start = pc.startingStats.STR;
  const need = skillRequires(data, data.skills.combat.slash, level).STR;
  assert.ok(start + 0.6 * points >= need, `60% of the points (${start + 0.6 * points}) meets a Lv${level} skill (${need})`);
  assert.ok(start + 0.3 * points < need, `30% (${start + 0.3 * points}) does not: a hybrid takes stats from gear and the tree`);
  assert.ok(start + 0.3 * points + 45 >= need, 'with about 45 from gear and the tree it does');
  assert.ok(r.perLevel > 1, 'requirements reach the hundreds at the long-term cap');
});
