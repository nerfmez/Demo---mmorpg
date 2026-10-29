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
// what each weapon type may ask for (owner, 2026-10-29): the first is its main-line stat, the rest its
// main-and-secondary pairs; daggers have no main-line stat, only STR/DEX or DEX/AGI (DEX is reach and crit);
// staves and wands never ask for VIT: a priest's VIT comes from a holy mace (INT/VIT) or a shield (VIT/INT)
const WEAPON_STATS = {
  sword: ['STR', 'STR+AGI'], greatblade: ['STR', 'STR+VIT', 'STR+AGI'], axe: ['STR', 'STR+VIT'], mace: ['STR', 'STR+VIT', 'INT+VIT'],
  dagger: ['STR+DEX', 'DEX+AGI'], bow: ['DEX', 'DEX+AGI', 'DEX+LUK'], staff: ['INT', 'INT+LUK'], wand: ['INT', 'INT+LUK', 'INT+DEX'],
  greatshield: ['VIT', 'VIT+STR'], shield: ['VIT', 'VIT+STR', 'VIT+INT'],
};

test('the wheel: a weapon asks for its type\'s stat (main-line) or one of its main-and-secondary pairs, a skill for one or two neighbours, a mod for one', () => {
  assert.deepEqual([...WHEEL].sort(), ['AGI', 'DEX', 'INT', 'LUK', 'STR', 'VIT']);
  // neighbours, or one of the two pairs that skip a stat (STR/DEX daggers, INT/DEX marksman casters)
  const cross = data.progression.character.crossPairs.map((p) => [...p].sort().join());
  const near = (a, b) => [1, WHEEL.length - 1].includes(Math.abs(WHEEL.indexOf(a) - WHEEL.indexOf(b))) || cross.includes([a, b].sort().join());
  const bad = [];
  for (const [id, d] of Object.entries(data.skills.combat)) {
    const k = Object.keys(skillRequires(data, d, 30));
    if (!k.length || k.length > 2 || (k.length === 2 && !near(...k)) || k[0] !== d.upgradeStat) bad.push(`skill ${id} ${k}`);
  }
  for (const [id, m] of Object.entries(data.mods.mods)) if (Object.keys(m.requires || {}).length > 1) bad.push(`mod ${id}`);
  const typeOf = (b) => b.weaponType || 'shield';
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    if (b.slot !== 'weapon' && b.slot !== 'offhand') continue;
    const allowed = WEAPON_STATS[typeOf(b)];
    if (b.starter && b.secondaryStat) bad.push(`gear ${id}: a starter weapon is main-line`);
    for (const grade of ['C', 'S']) {
      const r = gearRequirements({ uid: 1, base: id, grade, upgrade: 0, options: [] }, data), k = Object.keys(r);
      if (!allowed.includes(k.join('+'))) bad.push(`gear ${id} ${k} (allowed ${allowed})`);
      else if (k.length === 2 && !(r[k[0]] >= r[k[1]])) bad.push(`gear ${id}: the main stat asks for at least as much`);
    }
  }
  const types = Object.values(data.items.gearBases).filter((b) => b.slot === 'weapon' || b.slot === 'offhand');
  for (const t of new Set(types.map(typeOf))) if (t !== 'dagger' && !types.some((b) => typeOf(b) === t && !b.secondaryStat)) bad.push(`${t} has no main-line weapon`);
  assert.deepEqual(bad, []);
});

test('gear options and Job Tree nodes add stats; derived stats use the total', () => {
  const ch = createCharacter(data, { kit: 'sword' });
  ch.stats.AGI = 20; // the tunic asks for AGI (more with a +STR option)
  const base = derive(ch, data), armor = ch.gear.find((g) => data.items.gearBases[g.base].slot === 'armor');
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

test('finesse (a key node): melee attack comes from DEX instead of STR; nothing is added, so a STR hero gains nothing', () => {
  const D = structuredClone(data);
  D.jobtree.nodes.origin.effects = { ...(D.jobtree.nodes.origin.effects || {}), finesse: 1 };
  const per = data.progression.character.perStat;
  const hero = (d, stats) => { const ch = createCharacter(d, { kit: 'sword' }); Object.assign(ch.stats, stats); return derive(ch, d); };
  const dexHero = { STR: 3, DEX: 80 }, strHero = { STR: 80, DEX: 3 };
  const plainDex = hero(data, dexHero), keyDex = hero(D, dexHero), plainStr = hero(data, strHero), keyStr = hero(D, strHero);
  // DEX now gives STR's attack and melee damage, and drops its own attack
  assert.ok(Math.abs(keyDex.attack - (plainDex.attack + per.STR.attack * (80 - 3) - per.DEX.attack * 80)) < 1e-6, 'DEX gives STR\'s attack instead of its own');
  assert.ok(Math.abs(keyDex.meleeDamagePct - (plainDex.meleeDamagePct + per.STR.meleeDamagePct * (80 - 3))) < 1e-6);
  assert.equal(keyDex.maxHp, plainDex.maxHp, 'HP still comes from STR');
  assert.equal(keyDex.critMultPct, plainDex.critMultPct, 'DEX keeps its crit power');
  assert.ok(keyStr.attack < plainStr.attack && keyStr.meleeDamagePct < plainStr.meleeDamagePct, 'a STR hero loses by taking it');
  assert.ok(Math.abs(keyDex.attack - (plainStr.attack - per.DEX.attack * 3)) < 1e-6, 'the same points give the same attack either way (less the 3 DEX a STR hero keeps)');
});

test('weapon stats follow what the weapon asks for: main-line carries damage only, a secondary stat adds its identity at a modest size', () => {
  const ID = data.items.weaponIdentity, GUARD = ['defense', 'maxHp', 'blockChancePct'], bad = [];
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    if ((b.slot !== 'weapon' && b.slot !== 'offhand') || b.weaponType === 'greatshield') continue;
    const keys = Object.keys(b.stats), base = b.slot === 'offhand' ? GUARD : ['attack', 'magic'];
    const extra = keys.filter((k) => !base.includes(k)), want = [];
    if (b.weaponType === 'dagger' && b.requirementStat === 'DEX') want.push(ID.stats.DEX);
    if (b.secondaryStat) want.push(ID.stats[b.secondaryStat]);
    if (extra.sort().join() !== [...new Set(want)].filter((k) => !base.includes(k)).sort().join()) bad.push(`${id}: ${extra} (want ${want})`);
    const caster = ['staff', 'wand'].includes(b.weaponType) || b.requirementStat === 'INT';
    if (b.slot === 'weapon' && !((b.stats[caster ? 'magic' : 'attack'] || 0) > (b.stats[caster ? 'attack' : 'magic'] || 0))) bad.push(`${id}: deals ${caster ? 'magic' : 'attack'}`);
    if ((b.stats.hastePct || 0) > 25 || (b.stats.critChancePct || 0) > 20 || (b.stats.critMultPct || 0) > 40) bad.push(`${id}: a percentage too large`);
  }
  assert.deepEqual(bad, []);
  // the priest's mace deals magic and adds HP; an INT shield adds a spell shield
  assert.ok(data.items.gearBases.thunder_maul.stats.magic > 0 && data.items.gearBases.thunder_maul.stats.maxHp > 0);
  assert.ok(data.items.gearBases.highland_shield.stats.maxShield > 0);
});

test('armour asks for its level and its class stat: heavy VIT (or VIT/STR), light AGI (or AGI/DEX), cloth INT (or INT/LUK, never VIT); a charm its level only', () => {
  const allowed = { VIT: ['STR'], AGI: ['DEX'], INT: ['LUK'] }, bad = [];
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    if (!['armor', 'helm', 'gloves', 'boots', 'charm'].includes(b.slot)) continue;
    const r = gearRequirements({ uid: 1, base: id, grade: 'S', upgrade: 5, options: [] }, data), k = Object.keys(r);
    if (b.slot === 'charm') { if (k.join() !== 'level') bad.push(`${id}: a charm asks for its level only`); continue; }
    const want = ['level', b.requirementStat, ...(b.secondaryStat ? [b.secondaryStat] : [])];
    if (!allowed[b.requirementStat] || (b.secondaryStat && !allowed[b.requirementStat].includes(b.secondaryStat))) bad.push(`${id}: ${b.requirementStat}/${b.secondaryStat}`);
    if (k.join() !== want.join()) bad.push(`${id}: ${k}`);
    if (b.starter && b.secondaryStat) bad.push(`${id}: starter armour asks for one stat`);
  }
  assert.deepEqual(bad, []);
});

test('options roll from the item class pool: a robe never rolls bow damage, a charm rolls the widest, finds only on charms', async () => {
  const { optionClass } = await import('../../src/core/item-metadata.js');
  const P = data.items.optionPools, bad = [];
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    const c = optionClass(b), want = [...new Set([...P.classes[c], ...(P.slotExtras[`${c}.${b.slot}`] || [])])];
    if (b.optionPool.join() !== want.join()) bad.push(`${id} (${c})`);
    if (want.length < data.items.grades.optionCount.S) bad.push(`${id}: fewer options than an S grade rolls`);
    const recipe = Object.values(data.recipes.recipes).find((r) => r.result === id && r.optionPool);
    if (recipe && recipe.optionPool.join() !== want.join()) bad.push(`recipe of ${id}`);
  }
  for (const o of Object.values(P.classes).flat()) if (!data.items.gearOptions[o]) bad.push(`unknown option ${o}`);
  assert.deepEqual(bad, []);
  const robe = data.items.gearBases.sporeweave_vest.optionPool;
  assert.ok(!robe.includes('projectile_pct') && !robe.includes('vit_flat') && robe.includes('int_flat'));
  assert.ok(data.items.gearBases.fang_dagger.optionPool.includes('crit_mult_pct'));
});

test('regeneration keeps its worth: HP regenerates a share of max HP (VIT adds a little, capped), MP grows a little with level, a tank node trades potions for regeneration', async () => {
  const { restoreAmount } = await import('../../src/core/consumables.js');
  const b = data.progression.character.base, per = data.progression.character.perStat.VIT;
  const hero = (level, stats = {}, d = data) => { const ch = createCharacter(d, { kit: 'sword' }); ch.level = level; Object.assign(ch.stats, stats); ch.equipped = Object.fromEntries(Object.keys(ch.equipped).map((k) => [k, null])); return derive(ch, d); };
  for (const level of [1, 30]) {
    const d = hero(level);
    assert.ok(Math.abs(d.hpRegen - d.maxHp * (b.hpRegenPct + per.hpRegenPct * d.stats.VIT) / 100) < 1e-6, `Lv${level}: a share of max HP`);
  }
  assert.ok(hero(30).hpRegen > hero(1).hpRegen * 1.5, 'it grows with HP');
  assert.ok(hero(1, { VIT: 53 }).hpRegen > hero(1).hpRegen * 1.8, 'VIT adds to it');
  const D = structuredClone(data);
  D.jobtree.nodes.origin.effects = { ...(D.jobtree.nodes.origin.effects || {}), hpRegen: 1e6 };
  const capped = hero(1, {}, D);
  assert.equal(capped.hpRegen, capped.maxHp * b.hpRegenCapPct / 100, 'capped at a share of max HP');
  assert.ok(hero(30).mpRegen > hero(1).mpRegen, 'MP regeneration grows a little with level');
  // the tank key node: regeneration up, health potions halved
  D.jobtree.nodes.origin.effects = { ...(data.jobtree.nodes.origin.effects || {}), hpRegenPct: 1.5, potionHealPct: -50 };
  const tank = hero(30, {}, D), plain = hero(30);
  assert.ok(tank.hpRegen > plain.hpRegen * 2);
  assert.equal(restoreAmount(data, 'hp_potion_m', 5000, 500, tank.potionHealPct).hp * 2, restoreAmount(data, 'hp_potion_m', 5000, 500).hp);
});

test('armour stats follow the class: plate toughest, leather quick, cloth a spell shield and MP; percentages stay under their cap', () => {
  const A = data.items.armorIdentity, CLASS = { VIT: 'plate', AGI: 'leather', INT: 'cloth' }, bad = [], best = {};
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    if (!A.slotShare[b.slot]) continue;
    const c = CLASS[b.requirementStat], s = b.stats, il = b.itemLevel;
    if (c === 'cloth' && (s.maxHp || !s.maxShield || !s.maxMp)) bad.push(`${id}: cloth carries a spell shield and MP, not HP`);
    if (c !== 'cloth' && (!s.maxHp || s.maxShield)) bad.push(`${id}: HP, no spell shield`);
    if (c === 'leather' && !b.starter && !['moveSpeedPct', 'hastePct', 'critChancePct'].some((k) => s[k])) bad.push(`${id}: leather carries speed or crit`);
    for (const [k, cap] of Object.entries(A.caps)) if ((s[k] || 0) > (cap.base + cap.perItemLevel * (il - 1)) + 0.05 + 1e-9) bad.push(`${id}: ${k} over its cap`); // a tenth for rounding
    const key = `${b.slot}.${il}`;
    ((best[key] ||= {})[c] ||= []).push(s.defense);
  }
  assert.deepEqual(bad, []);
  const max = (l) => Math.max(...(l || [0]));
  for (const [key, by] of Object.entries(best)) {
    if (by.plate && by.leather) assert.ok(max(by.plate) > max(by.leather), `${key}: plate defends more than leather`);
    if (by.leather && by.cloth) assert.ok(max(by.leather) > max(by.cloth), `${key}: leather defends more than cloth`);
  }
});
