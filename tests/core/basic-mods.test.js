// Mod scope (owner, 2026-10-27): Signature skills take no hit-multiplying mod, and the basic mods
// (damage by type, a skill's own speed, longer buffs) each change the skill with a trade-off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLearnedCharacter as createCharacter, data } from './helpers.js';
import { derive } from '../../src/core/character.js';
import { computeSkill, modFits } from '../../src/core/skills.js';
import { Game } from '../../src/core/game-simulation.js';

const S = data.skills.combat, M = data.mods.mods;
const MULTIPLY = ['extraProjectiles', 'repeats', 'echoDelay', 'trigger', 'returnMult', 'forkMult'];

/** The skill `id` in slot 0 with the given mods at `level`, every stat high enough. */
function withMods(id, mods, level = 1, ch = createCharacter(data)) {
  ch.stats = { STR: 99, DEX: 99, INT: 99, AGI: 99, VIT: 99 };
  ch.skills[id] = 1;
  ch.mods = mods.map((m, i) => ({ uid: 900 + i, id: m, level }));
  ch.slots[0] = { skill: id, mods: ch.mods.map((m) => m.uid) };
  return computeSkill(ch, data, derive(ch, data), 0);
}

test('Signature: damage skills with a long base cooldown, and no mod multiplies their hits', () => {
  for (const [id, s] of Object.entries(S)) {
    const big = s.tags.includes('Damage') && s.cooldown >= data.mods.signatureCooldown;
    assert.equal(s.tags.includes('Signature'), big, `${id}: Signature iff a damage skill with cooldown >= ${data.mods.signatureCooldown}`);
  }
  for (const [mid, m] of Object.entries(M)) {
    if (!MULTIPLY.some((k) => m.effect[k] !== undefined)) continue;
    assert.ok(m.not?.includes('Signature'), `${mid} multiplies hits, so it lists Signature under not`);
    for (const [id, s] of Object.entries(S)) if (s.tags.includes('Signature')) assert.equal(modFits(s, m).ok, false, `${mid} on ${id}`);
  }
  assert.ok(modFits(S.meteor, M.focused_spell).ok && modFits(S.sky_shatter, M.heavy_blow).ok, 'basic damage mods still fit a Signature skill');
});

test('damage by type: each fits its type only and pays for the damage', () => {
  assert.ok(modFits(S.slash, M.heavy_blow).ok && !modFits(S.firebolt, M.heavy_blow).ok && !modFits(S.war_cry, M.heavy_blow).ok);
  assert.ok(modFits(S.hunter_shot, M.vicious_shot).ok && !modFits(S.slash, M.vicious_shot).ok);
  assert.ok(modFits(S.firebolt, M.focused_spell).ok && !modFits(S.slash, M.focused_spell).ok && !modFits(S.healing_spring, M.focused_spell).ok);
  const slash = withMods('slash', []), heavy = withMods('slash', ['heavy_blow']);
  assert.ok(Math.abs(heavy.damage / slash.damage - M.heavy_blow.effect.damageMult[0]) < 1e-9);
  assert.ok(heavy.castTime > slash.castTime && heavy.cost > slash.cost, 'a heavier, slower and dearer swing');
  const shot = withMods('hunter_shot', []), vicious = withMods('hunter_shot', ['vicious_shot']);
  assert.ok(vicious.damage > shot.damage && Math.abs(vicious.speed / shot.speed - 0.8) < 1e-9);
  const bolt = withMods('firebolt', ['focused_spell']);
  assert.equal(bolt.noCrit, true);
  const g = new Game(data, { seed: 3 });
  assert.equal(g.hitOpts(bolt, { crit: true }).crit, false, 'Controlled Power never crits');
  assert.equal(g.hitOpts(withMods('firebolt', []), { crit: true }).crit, true);
});

test('Elemental Focus: Fire, Cold or Lightning hits grow and lose their status; it never joins Status Burst', () => {
  assert.ok(!modFits(S.slash, M.elemental_focus).ok, 'a physical skill has no element to focus');
  assert.ok(modFits(S.slash, M.elemental_focus, [M.fire_shift]).ok, 'an element shift gives it one');
  assert.ok(!modFits(S.blizzard, M.elemental_focus).ok, 'damage over time keeps its status');
  assert.equal(modFits(S.firebolt, M.elemental_focus, [M.status_burst]).reason, 'family');
  const fire = withMods('firebolt', []), focused = withMods('firebolt', ['elemental_focus']);
  assert.ok(fire.burnChance > 0 && focused.burnChance === 0 && focused.damage > fire.damage);
  assert.ok(withMods('frost_nova', []).chill && withMods('frost_nova', ['elemental_focus']).chill === null);
  const shifted = withMods('slash', ['fire_shift', 'elemental_focus']);
  assert.equal(shifted.element, 'fire');
  assert.equal(shifted.burnChance, 0, 'the status goes whatever the socket order');
});

test('Quicken: the skill\'s own speed joins the character\'s under the same cap', () => {
  const plain = withMods('meteor', []), quick = withMods('meteor', ['quicken'], 2);
  assert.ok(quick.cooldown < plain.cooldown && quick.castTime < plain.castTime && quick.cost > plain.cost);
  // at the speed cap the mod adds nothing: the top speed stays the same
  const atCap = (mods) => {
    const ch = createCharacter(data);
    withMods('slash', mods, 3, ch);
    return computeSkill(ch, data, { ...derive(ch, data), hastePct: data.progression.character.caps.hastePct }, 0);
  };
  assert.ok(Math.abs(atCap(['quicken']).cooldown - atCap([]).cooldown) < 1e-9);
  assert.ok(modFits(S.slash, M.quicken).ok && modFits(S.meteor, M.quicken).ok && modFits(S.war_cry, M.quicken).ok);
  assert.ok(!modFits(data.skills.movement.dash, M.quicken).ok, 'movement skills have their own mods');
});

test('Prolong: buffs, curses, barriers and walls last longer; fields keep Lingering', () => {
  for (const id of ['war_cry', 'hex', 'ward', 'crystal_wall']) {
    assert.ok(modFits(S[id], M.prolong).ok, id);
    const a = withMods(id, []), b = withMods(id, ['prolong']);
    assert.ok(Math.abs(b.duration / a.duration - M.prolong.effect.effectDurationMult[0]) < 1e-9, id);
  }
  for (const id of ['blizzard', 'healing_spring', 'slash']) assert.ok(!modFits(S[id], M.prolong).ok, id);
});

test('the lightning line\'s chain mods: lightning chains only, and every level adds', () => {
  const fireChain = { tags: ['Spell', 'Chain', 'Fire', 'Damage'] };
  for (const id of ['conductive', 'fork_chain', 'stun_arc']) {
    assert.ok(modFits(S.chain_spark, M[id]).ok, id);
    assert.ok(!modFits(fireChain, M[id]).ok, `${id}: a fire chain is not the lightning line`);
    const lv = Object.entries(M[id].effect).filter(([, v]) => Array.isArray(v));
    assert.ok(lv.length && lv.every(([, v]) => v.length === data.progression.modUpgrade.maxLevel && v[2] !== v[0]), `${id} steps with its level`);
  }
  const stun = (L) => withMods('chain_spark', ['stun_arc'], L).modEffects.chainStun;
  assert.ok(stun(3) > stun(2) && stun(2) > stun(1));
});
