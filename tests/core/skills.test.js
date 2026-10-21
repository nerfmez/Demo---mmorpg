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
  assert.ok(!modFits(sk.healing_spring, md.fire_shift).ok, 'fire shift needs Damage');
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

test('mod sockets grow with skill rank', () => {
  const by = data.mods.slotsByRank;
  assert.equal(by.length, data.progression.skillUpgrade.maxLevel, 'one entry per skill rank');
  assert.ok(by.every((n, i) => n >= (by[i - 1] ?? 0)), 'never shrinks with rank');
  assert.equal(by[0], 2, 'rank 1 keeps the two sockets older saves already use');
  const ch = createCharacter(data);
  Object.assign(ch.stats, { DEX: 20, INT: 20 });
  const fb = slotOf(ch, 'firebolt');
  for (const id of ['split', 'pierce']) assert.ok(socketMod(ch, data, fb, give(ch, id)).ok);
  const third = give(ch, 'terminal_burst');
  assert.equal(socketMod(ch, data, fb, third).reason, 'full');
  ch.skills.firebolt = 3;
  assert.ok(socketMod(ch, data, fb, third).ok, 'rank 3 opens a third socket');
  assert.equal(computeSkill(ch, data, derive(ch, data), fb).mods.filter((m) => m.active).length, 3);
  ch.skills.firebolt = 5;
  assert.ok(socketMod(ch, data, fb, give(ch, 'returning_shot')).ok, 'rank 5 opens a fourth socket');
  assert.equal(socketMod(ch, data, fb, give(ch, 'status_burst')).reason, 'full');
});

test('every mod uses only the single visible-tag fit rule', () => {
  const RULE = ['needs', 'on', 'not', 'family', 'grants'];
  const LEGACY = ['requiresAll', 'requiresAny', 'excludes', 'requiresKinds', 'requiresPersistent', 'requiresElement', 'conflicts'];
  const skillTags = new Set(Object.values({ ...data.skills.combat, ...data.skills.movement }).flatMap((s) => s.tags));
  const granted = new Set(Object.values(data.mods.mods).flatMap((m) => m.grants || []));
  for (const [id, m] of Object.entries(data.mods.mods)) {
    for (const f of LEGACY) assert.equal(m[f], undefined, `${id}.${f}`);
    assert.ok(RULE.some((f) => m[f]), `${id} names at least one rule`);
    for (const t of [...(m.needs || []), ...(m.on || []), ...(m.not || [])]) assert.ok(skillTags.has(t) || granted.has(t), `${id} reads unknown tag ${t}`);
    // Every mod must fit at least one real skill on its own or with a granting companion.
    const all = { ...data.skills.combat, ...data.skills.movement };
    const fits = Object.values(all).some((s) => modFits(s, m).ok || Object.values(data.mods.mods).some((c) => c.grants && modFits(s, m, [c]).ok));
    assert.ok(fits, `${id} fits no skill`);
  }
});

test('granted tags only count from a companion that fits the bare skill', () => {
  const S = data.skills.combat, M = data.mods.mods;
  assert.ok(modFits(S.firebolt, M.status_burst).ok, 'a native Fire skill fits Status Burst on its own');
  assert.ok(!modFits(S.hunter_shot, M.status_burst).ok);
  assert.ok(modFits(S.hunter_shot, M.status_burst, [M.frost_shift]).ok, 'Frost Shift grants Cold');
  assert.ok(!modFits(S.venom_mire, M.status_burst, [M.frost_shift]).ok, 'Frost Shift cannot sit on a DoT field, so it grants nothing');
  const fit = modFits(S.slash, M.lingering);
  assert.deepEqual([fit.reason, fit.tags], ['needs', ['Persistent']]);
});
