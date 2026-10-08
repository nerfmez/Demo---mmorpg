import { createLearnedCharacter as createCharacter } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { derive } from '../../src/core/character.js';
import { computeSkill, modFits, socketMod, equipSkill } from '../../src/core/skills.js';

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

test('an element-changing mod lets elemental damage apply to the skill', () => {
  const ch = createCharacter(data);
  for (const s of Object.keys(ch.stats)) ch.stats[s] = 60;
  const i = slotOf(ch, 'slash');
  const plain = (extra) => computeSkill(ch, data, { ...derive(ch, data), ...extra }, i).damage;
  assert.equal(plain({ elementalDamagePct: 50 }), plain({}), 'physical Slash ignores elemental damage');
  assert.ok(socketMod(ch, data, i, give(ch, 'frost_shift')).ok);
  const base = plain({}), cold = plain({ elementalDamagePct: 50 });
  assert.equal(computeSkill(ch, data, derive(ch, data), i).element, 'cold');
  assert.ok(Math.abs(cold / base - 1.5) < 0.2, `${cold} vs ${base}`);
});
