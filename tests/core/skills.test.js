import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, derive } from '../../src/core/character.js';
import { computeSkill, modFits, socketMod, equipSkill } from '../../src/core/skills.js';

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
  const plain = computeSkill(ch, data, d, 1);
  assert.equal(plain.projectiles, 1);
  assert.ok(socketMod(ch, data, 1, give(ch, 'split')).ok);
  assert.ok(socketMod(ch, data, 1, give(ch, 'pierce')).ok);
  const modded = computeSkill(ch, data, d, 1);
  assert.equal(modded.projectiles, 3);
  assert.equal(modded.pierce, 2);
  assert.ok(modded.damage < plain.damage, 'split trades per-hit damage for more projectiles');
  assert.equal(socketMod(ch, data, 1, give(ch, 'bounce')).reason, 'full');
});

test('mod whose stat requirement is not met is socketed but inactive', () => {
  const ch = createCharacter(data);
  ch.stats.DEX = 1;
  socketMod(ch, data, 1, give(ch, 'split'));
  const s = computeSkill(ch, data, derive(ch, data), 1);
  assert.equal(s.projectiles, 1);
  assert.equal(s.mods[0].active, false);
});

test('frost shift converts the element and adds a chill', () => {
  const ch = createCharacter(data);
  socketMod(ch, data, 1, give(ch, 'frost_shift'));
  const s = computeSkill(ch, data, derive(ch, data), 1);
  assert.equal(s.element, 'cold');
  assert.ok(s.chill.slow > 0);
});

test('equipping a skill that is in another slot swaps them', () => {
  const ch = createCharacter(data);
  const r = equipSkill(ch, data, 0, 'firebolt');
  assert.ok(r.ok);
  assert.equal(ch.slots[0].skill, 'firebolt');
  assert.equal(ch.slots[1].skill, 'slash');
});
