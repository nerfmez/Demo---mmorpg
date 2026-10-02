import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, derive, allocateJobNode, jobNodeState, gearStats, migrateCharacter } from '../../src/core/character.js';
import { computeSkill, modFits, socketMod, equipSkill, movementSkill } from '../../src/core/skills.js';
import { ELEMENT_TAGS, DAMAGE_TAGS, effectiveSkillTags } from '../../src/core/skill-tags.js';

const slotOf = (ch, id) => ch.slots.findIndex((s) => s.skill === id);

const give = (ch, id) => {
  const inst = { uid: ch.nextUid++, id, level: 1 };
  ch.mods.push(inst);
  return inst.uid;
};

test('basic attack is just a skill: it can be removed', () => {
  const ch = createCharacter(data);
  assert.ok(equipSkill(ch, data, 0, null).ok);
  assert.equal(computeSkill(ch, data, derive(ch, data), 0), null);
});

test('mods fit by tags only', () => {
  const sk = data.skills.combat;
  const md = data.mods.mods;
  assert.ok(modFits(sk.firebolt, md.split).ok);
  assert.ok(!modFits(sk.slash, md.split).ok);
  assert.ok(modFits(sk.slash, md.wide_arc).ok);
  assert.ok(modFits(sk.stone_burst, md.echo).ok);
  assert.ok(!modFits(sk.ward, md.echo).ok, 'echo excludes Guard');
  assert.ok(modFits(sk.ward, md.spiked_ward).ok);
  assert.ok(!modFits(sk.healing_spring, md.burning_ground).ok, 'burning ground needs Damage');
  assert.ok(modFits(sk.firebolt, md.cast_on_dodge).ok);
  assert.ok(!modFits(sk.slash, md.cast_on_dodge).ok);
});

test('mods change behaviour, not just damage', () => {
  const ch = createCharacter(data);
  ch.stats.DEX = 10;
  const d = derive(ch, data);
  const fb = slotOf(ch, 'firebolt');
  const plain = computeSkill(ch, data, d, fb);
  assert.equal(plain.projectiles, 1);
  assert.ok(socketMod(ch, data, fb, give(ch, 'split')).ok);
  assert.ok(socketMod(ch, data, fb, give(ch, 'pierce')).ok);
  const modded = computeSkill(ch, data, d, fb);
  assert.equal(modded.projectiles, 3);
  assert.equal(modded.pierce, 2);
  assert.ok(modded.damage < plain.damage, 'split trades per-hit damage for more projectiles');
  assert.equal(socketMod(ch, data, fb, give(ch, 'bounce')).reason, 'full');
});

test('mod whose stat requirement is not met is socketed but inactive', () => {
  const ch = createCharacter(data);
  ch.stats.DEX = 1;
  const fb = slotOf(ch, 'firebolt');
  socketMod(ch, data, fb, give(ch, 'split'));
  const s = computeSkill(ch, data, derive(ch, data), fb);
  assert.equal(s.projectiles, 1);
  assert.equal(s.mods[0].active, false);
});

test('frost shift converts the element and adds a chill', () => {
  const ch = createCharacter(data);
  const fb = slotOf(ch, 'firebolt');
  socketMod(ch, data, fb, give(ch, 'frost_shift'));
  const s = computeSkill(ch, data, derive(ch, data), fb);
  assert.equal(s.element, 'cold');
  assert.ok(s.chill.slow > 0);
});

test('equipping a skill that is in another slot swaps them', () => {
  const ch = createCharacter(data);
  const fb = slotOf(ch, 'firebolt');
  const r = equipSkill(ch, data, 0, 'firebolt');
  assert.ok(r.ok);
  assert.equal(ch.slots[0].skill, 'firebolt');
  assert.equal(ch.slots[fb].skill, 'slash');
});

test('new skill kinds compute their extra parameters', () => {
  const ch = createCharacter(data);
  ch.stats.INT = 10;
  ch.stats.STR = 10;
  for (const id of Object.keys(data.skills.combat)) ch.skills[id] = 1;
  const d = derive(ch, data);
  const at = (id) => {
    equipSkill(ch, data, 3, id);
    return computeSkill(ch, data, d, 3);
  };
  assert.equal(at('chain_spark').chain, 3);
  assert.ok(at('frost_nova').chill.slow > 0.5);
  assert.ok(at('venom_mire').slow > 0);
  const hex = at('hex');
  assert.ok(hex.takenMult > 1 && hex.dealtMult < 1);
  assert.ok(at('war_cry').damageBuff > 0);
  const wolf = at('spirit_wolf');
  assert.equal(wolf.summon.count, 1);
  assert.ok(socketMod(ch, data, 3, give(ch, 'pack_leader')).ok);
  assert.equal(computeSkill(ch, data, d, 3).summon.count, 2);
});

function elementalFixture(id = 'firebolt', mods = [], source = data) {
  const ch = createCharacter(source);
  for (const stat in ch.stats) ch.stats[stat] = 20;
  ch.skills[id] = 1; ch.slots[0] = { skill: id, mods: [] };
  for (const mod of mods) ch.slots[0].mods.push(give(ch, mod));
  const derived = derive(ch, source);
  Object.assign(derived, { meleeDamagePct: 0, projectileDamagePct: 0, areaDamagePct: 0, spellDamagePct: 0, summonDamagePct: 0 });
  return { ch, derived, skill: () => computeSkill(ch, source, derived, 0) };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('element tags cover current damage types and keep Earth spells distinct from attacks', () => {
  for (const def of Object.values(data.skills.combat)) {
    if (DAMAGE_TAGS[def.element]) assert.ok(def.tags.includes(DAMAGE_TAGS[def.element]), def.name);
    assert.deepEqual([...effectiveSkillTags(def)], def.tags);
  }
  const stone = data.skills.combat.stone_burst;
  assert.ok(stone.tags.includes('Earth') && stone.tags.includes('Physical'));
  assert.ok(stone.tags.includes('Spell') && !stone.tags.includes('Attack'));
  assert.ok(data.skills.movement.leap.tags.includes('Physical'));
});

test('conversion replaces the element and uses one additive type/element bonus pool', () => {
  const plain = elementalFixture(), converted = elementalFixture('firebolt', ['frost_shift']);
  const base = plain.skill().damage;
  for (const f of [plain, converted]) Object.assign(f.derived, { spellDamagePct: 10, fireDamagePct: 20, coldDamagePct: 30 });
  near(plain.skill().damage, base * 1.3);
  const ice = converted.skill(); near(ice.damage, base * 1.4);
  assert.equal(ice.element, 'cold'); assert.ok(ice.tags.has('Cold')); assert.ok(!ice.tags.has('Fire'));
  const stone = elementalFixture('stone_burst'), before = stone.skill().damage;
  Object.assign(stone.derived, { physicalDamagePct: 20, earthDamagePct: 30 });
  near(stone.skill().damage, before * 1.5);
  const shiftedStone = elementalFixture('stone_burst', ['frost_shift']);
  Object.assign(shiftedStone.derived, { physicalDamagePct: 20, earthDamagePct: 30, coldDamagePct: 10 });
  const result = shiftedStone.skill(); near(result.damage, before * 1.1);
  assert.ok(!result.tags.has('Earth') && !result.tags.has('Physical'));
});

test('element-gated mods use active conversion without borrowing shape tags or enabling the converter itself', () => {
  const source = structuredClone(data);
  const cold = { tags: ['Projectile'], requiresAll: ['Cold', 'Damage'], requires: {}, effect: { extraProjectiles: [1], spread: 10 } };
  source.mods.mods.cold_probe = cold;
  assert.ok(!modFits(source.skills.combat.firebolt, cold).ok);
  assert.ok(modFits(source.skills.combat.firebolt, cold, [source.mods.mods.frost_shift]).ok);
  assert.ok(!modFits(source.skills.combat.firebolt, { ...cold, requiresAll: ['Cold', 'Area'] }, [source.mods.mods.frost_shift]).ok);
  const f = elementalFixture('firebolt', ['frost_shift', 'cold_probe'], source);
  assert.equal(f.skill().projectiles, 2);
  f.ch.slots[0].mods.reverse(); assert.equal(f.skill().projectiles, 2, 'socket order does not change eligibility');
  source.mods.mods.frost_shift.requires = { INT: 99 };
  const inactive = f.skill(); assert.equal(inactive.element, 'fire'); assert.equal(inactive.projectiles, 1);
  assert.ok(!inactive.mods.find(m => m.id === 'cold_probe').active);
  assert.equal(f.ch.slots[0].mods.length, 2, 'inactive mods remain owned and socketed');
  const self = { ...source.mods.mods.frost_shift, requiresAll: ['Cold'], requires: {} };
  assert.ok(!modFits(source.skills.combat.firebolt, self, [self]).ok);
  assert.ok(!effectiveSkillTags(source.skills.combat.firebolt, [self]).has('Cold'));
});

test('Fire ground scales its own element once, independently of a converted direct hit', async () => {
  const f = elementalFixture('firebolt', ['frost_shift', 'burning_ground']);
  const base = f.skill();
  Object.assign(f.derived, { fireDamagePct: 20, coldDamagePct: 30 });
  const mixed = f.skill(); near(mixed.damage, base.damage * 1.3); near(mixed.ground.damage, base.ground.damage * 1.2);
  assert.equal(mixed.ground.element, 'fire'); assert.ok(mixed.ground.tags.has('Fire')); assert.ok(!mixed.tags.has('Fire'));
  const { Game } = await import('../../src/core/game.js');
  const game = new Game(data, { seed: 8 });
  game.spawnGround(mixed, game.player.x, game.player.z, .5);
  const area = game.areas.at(-1); assert.equal(area.element, 'fire'); near(area.damage, mixed.ground.damage * .25);
  const fire = elementalFixture('firebolt', ['burning_ground']), old = fire.skill();
  fire.derived.fireDamagePct = 20;
  near(fire.skill().damage, old.damage * 1.2); near(fire.skill().ground.damage, old.ground.damage * 1.2);
});

test('element options and connected tree branches feed the same bonuses and preserve current saves', () => {
  const ch = createCharacter(data); ch.jobPoints = 20; ch.jobLevel = 40;
  for (const id of ['f_hp','f_mp','f_mag']) assert.ok(allocateJobNode(ch,data,id).done,id);
  assert.ok(allocateJobNode(ch, data, 'element_fire_1').done);
  assert.ok(jobNodeState(ch, data, 'element_fire_2').can, 'minor successor follows its link inside the opened area');
  for (const id of ['element_cold_1', 'element_lightning_1']) assert.ok(allocateJobNode(ch, data, id).done);
  assert.ok(allocateJobNode(ch, data, 'element_fire_2').done);
  assert.equal(jobNodeState(ch, data, 'element_poison_2').reason, 'not_linked');
  assert.equal(jobNodeState(ch, data, 'element_fire_3').reason, 'tier_points');
  const item = ch.gear[0]; item.options = [{ id: 'fire_pct', value: 5 }, { id: 'cold_pct', value: 3 }];
  near(gearStats(item, data).fireDamagePct, 5); near(derive(ch, data).fireDamagePct, 13);
  assert.equal(derive(ch, data).coldDamagePct, 7);
  const before = JSON.stringify(ch); migrateCharacter(ch, data); assert.equal(JSON.stringify(ch), before);
  for (const tag of ELEMENT_TAGS.filter(t => t !== 'Arcane')) {
    const option = data.items.gearOptions[tag.toLowerCase() + '_pct']; assert.ok(option.tags.includes(tag));
    assert.ok(Object.values(data.recipes.recipes).some(r => r.optionPool?.includes(tag.toLowerCase() + '_pct')));
  }
});

test('physical bonuses affect physical summons and landing hits without buffing healing', () => {
  const wolf = elementalFixture('spirit_wolf'), before = wolf.skill().summon.damage;
  wolf.derived.physicalDamagePct = 20; near(wolf.skill().summon.damage, before * 1.2);
  const healer = elementalFixture('healing_spring'), heal = healer.skill().heal;
  for (const tag of ELEMENT_TAGS) healer.derived[tag.toLowerCase() + 'DamagePct'] = 100;
  assert.equal(healer.skill().heal, heal);
  const leap = elementalFixture(); leap.ch.movement = 'leap';
  const a = movementSkill(leap.ch, data, leap.derived).landing.damage;
  Object.assign(leap.derived, { physicalDamagePct: 20, areaDamagePct: 10 });
  near(movementSkill(leap.ch, data, leap.derived).landing.damage, a * 1.3);
});
