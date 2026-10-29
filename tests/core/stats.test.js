// Stats (owner, 2026-10-29, docs/STATS-TH.md): the six stats sit on a wheel (STR AGI DEX LUK INT VIT, VIT
// next to STR). A weapon asks for one stat, a skill for one or two neighbours on the wheel, a mod for one,
// and each stat named must be met on its own. Stats come from trained points, Job Tree nodes and gear
// options, and requirements grow with the level of the skill or mod, so a hero who stays on one side of the
// wheel meets them and one who mixes sides needs gear and the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, derive, statTotals, gearEquipState, gearRequirements } from '../../src/core/character.js';
import { computeSkill, skillRequires, modRequires } from '../../src/core/skills.js';
import { feedSkill } from '../../src/core/crafting.js';

const WHEEL = data.progression.character.statWheel;
const WEAPON_STAT = { sword: 'STR', greatblade: 'STR', axe: 'STR', mace: 'STR', dagger: 'AGI', bow: 'DEX', staff: 'INT', wand: 'INT', greatshield: 'VIT' };

test('the wheel: weapons ask for one stat by type, skills for one or two neighbours, mods for one', () => {
  assert.deepEqual([...WHEEL].sort(), ['AGI', 'DEX', 'INT', 'LUK', 'STR', 'VIT']);
  const near = (a, b) => [1, WHEEL.length - 1].includes(Math.abs(WHEEL.indexOf(a) - WHEEL.indexOf(b)));
  const bad = [];
  for (const [id, d] of Object.entries(data.skills.combat)) {
    const k = Object.keys(skillRequires(data, d, 30));
    if (!k.length || k.length > 2 || (k.length === 2 && !near(...k)) || k[0] !== d.upgradeStat) bad.push(`skill ${id} ${k}`);
  }
  for (const [id, m] of Object.entries(data.mods.mods)) if (Object.keys(m.requires || {}).length > 1) bad.push(`mod ${id}`);
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    if (b.slot !== 'weapon' && b.slot !== 'offhand') continue;
    const want = b.slot === 'offhand' ? 'VIT' : WEAPON_STAT[b.weaponType];
    for (const grade of ['C', 'S']) {
      const k = Object.keys(gearRequirements({ uid: 1, base: id, grade, upgrade: 0, options: [] }, data));
      if (k.length !== 1 || k[0] !== want) bad.push(`gear ${id} ${k} (want ${want})`);
    }
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
  // a sword that gives VIT and a shield that gives STR: each would meet its need only with the other's bonus
  sword.options = [{ id: 'vit_flat', value: 5 }];
  const shield = { uid: 9901, base: 'crab_shield', grade: 'C', upgrade: 0, options: [{ id: 'str_flat', value: 5 }] };
  ch.gear.push(shield); ch.equipped.offhand = shield.uid;
  ch.stats.STR = gearRequirements(sword, data).STR - 1; ch.stats.VIT = gearRequirements(shield, data).VIT - 1;
  const { active } = statTotals(ch, data);
  assert.deepEqual([active.has(sword.uid), active.has(shield.uid)], [false, false], 'neither turns on');
  ch.stats.STR += 1;
  assert.deepEqual([...['sword', 'shield'].map((_, i) => statTotals(ch, data).active.has([sword, shield][i].uid))], [true, true], 'met on its own, the sword lifts the shield');
});

test('a skill asks for more at every level; above what the stats allow it works at the highest level they meet', () => {
  const r = data.progression.skillUpgrade.require, slash = data.skills.combat.slash;
  assert.deepEqual(skillRequires(data, slash, 1), slash.requires);
  const total = slash.requires.STR + slash.requires.AGI;
  assert.deepEqual(skillRequires(data, slash, 21), Object.fromEntries(Object.entries(slash.requires).map(([k, v]) => [k, Math.round(v + r.perLevel * 20 * v / total)])));
  // a hybrid skill shares the growth between its stats in proportion
  const hybrid = Object.entries(data.skills.combat).find(([, d]) => Object.keys(d.requires || {}).length === 2);
  if (hybrid) {
    const [, d] = hybrid, at = skillRequires(data, d, 11), total = Object.values(d.requires).reduce((a, v) => a + v, 0);
    for (const [k, v] of Object.entries(d.requires)) assert.equal(at[k], Math.round(v + r.perLevel * 10 * v / total), k);
  }
  const ch = createCharacter(data, { kit: 'sword' }), meet = (L) => Object.assign(ch.stats, skillRequires(data, slash, L));
  ch.level = 30; ch.skills.slash = 20; meet(12);
  const s = computeSkill(ch, data, derive(ch, data), 0);
  assert.deepEqual([s.requirementsMet, s.owned, s.level], [true, 20, 12], 'held at level 12, never switched off');
  ch.stats.STR = 0;
  assert.equal(computeSkill(ch, data, derive(ch, data), 0).requirementsMet, false, 'below the first level it cannot be used');
  // feeding stops where the next level's requirement is not met
  meet(12); ch.skills.slash = 1; ch.skillExp = {}; ch.gold = 1e6; ch.materials = { skill_crystal: 999 };
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

test('target numbers: at Lv70 a hero on one side of the wheel meets its skill from level points; no stat stands in for another; two sides need gear and the tree', () => {
  const pc = data.progression.character, level = 70, points = pc.startingStatPoints + pc.statPointsPerLevel * (level - 1), start = 3;
  const slash = skillRequires(data, data.skills.combat.slash, level), ward = skillRequires(data, data.skills.combat.ward, level);
  const ch = createCharacter(data, { kit: 'sword' }), at = (stats) => { ch.level = level; ch.skills.slash = level; ch.stats = { ...ch.stats, ...stats }; return computeSkill(ch, data, derive(ch, data), 0).level; };
  assert.equal(at({ STR: start + Math.floor(points * 0.5), AGI: start + Math.floor(points * 0.3) }), level, 'half the points in STR and a third in AGI hold Slash at Lv70');
  assert.ok(at({ STR: start + points, AGI: start }) < 10, 'all in STR does not: AGI is asked for on its own');
  const twoSides = slash.STR + slash.AGI + ward.VIT + ward.INT - 4 * start;
  assert.ok(twoSides > points && twoSides - points < 60, `Slash and Ward at Lv70 ask ${twoSides} points of ${points}: the rest from gear and the tree`);
});

test('v18: a hero who trained stats under the old rules gets one stat respec free, once', async () => {
  const { migrateCharacter, respecCost, respecStats, CHARACTER_VERSION } = await import('../../src/core/character.js');
  const old = createCharacter(data, { kit: 'sword' });
  old.version = 17; delete old.freeStatRespec; old.stats.STR += 20; old.gold = 0;
  const m = migrateCharacter(old, data);
  assert.deepEqual([m.version, m.freeStatRespec, respecCost(m, data).stats], [CHARACTER_VERSION, true, 0]);
  const once = JSON.stringify(m); migrateCharacter(m, data); assert.equal(JSON.stringify(m), once, 'idempotent');
  assert.ok(respecStats(m, data), 'free with no gold');
  assert.deepEqual([m.freeStatRespec, m.stats.STR, m.gold], [false, data.progression.character.startingStats.STR, 0]);
  assert.ok(respecCost(m, data).stats > 0, 'the next one costs gold again');
  assert.equal(migrateCharacter(m, data).freeStatRespec, false, 'a later load does not grant it again');
  const untrained = createCharacter(data, { kit: 'bow' }); untrained.version = 17;
  assert.equal(migrateCharacter(untrained, data).freeStatRespec, false, 'nothing trained, nothing to refund');
  assert.equal(createCharacter(data).freeStatRespec, false);
});
