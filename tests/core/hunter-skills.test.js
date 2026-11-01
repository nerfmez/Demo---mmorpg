// Hunter skills (owner, 2026-11-01; the companion bow, docs/SKILL-TREE-WHEEL-DRAFT-TH.md section 6): a hunting
// hound that stays until it dies and bites from our attack, a command that sends it pouncing, a prey mark that
// draws it and may give one more part, and a pack that joins for a while. Rules: core/frontier-content.js
// (commandCompanion, companionOf, sicTarget, the exposure's prey), core/game-simulation.js (spawnAllies,
// updateAllies, useSkill's check, killMonster's prey drop), core/skills.js (summon power and permanence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { craft } from '../../src/core/crafting.js';

const C = data.skills.combat, HUNTER = ['call_companion', 'call_hawk', 'call_bear', 'sic_em', 'mark_prey', 'pack_hunt'];

const fixture = (ids) => {
  const ch = createCharacter(data, { kit: 'bow' });
  ch.stats = { STR: 60, DEX: 60, INT: 5, AGI: 60, VIT: 60, LUK: 5 };
  for (const id of ids) ch.skills[id] = 1;
  ch.slots = ch.slots.map((_, i) => ({ skill: ids[i] || null, mods: [] }));
  const g = new Game(data, { seed: 13, character: ch });
  g.player.x = 0; g.player.z = 0; g.player.facing = Math.PI / 2;
  g.derived.weaponType = 'bow';
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  const m0 = g.monsters[0];
  const mk = (mid, x, z, extra = {}) => ({ ...m0, id: mid, x, z, hp: 1e6, maxHp: 1e6, defense: 50, boss: false, dead: false, state: 'idle', stateT: 0, aggro: true, statuses: {}, buffs: {}, cd: {}, r: 0.5, minion: false, ...extra });
  g.monsters = [];
  g.world = { surfaceY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, safe: () => false };
  g.isSafe = () => false; g.derived.critChance = 0; g.player.mp = g.player.maxMp; g.drainEvents();
  return { g, mk };
};
const slotOf = (g, id) => g.skills.findIndex((s) => s?.id === id);
const run = (g, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 0.05) { g.time += 0.05; g.updateAllies(0.05); g.updateAreas(0.05); g.updateProjectiles?.(0.05); } };

test('the four are the hunter\'s bow skills, learned at the workbench from real drops, waiting for pictures', () => {
  const drops = new Set(Object.values(data.monsters.monsters).flatMap((m) => m.drops.map((d) => d.item)));
  for (const id of HUNTER) {
    const def = C[id];
    assert.ok(def.job === 'hunter' && def.requiresWeapon.includes('bow') && def.iconPending && def.nameTh, id);
    const r = data.recipes.recipes['learn_' + id];
    assert.ok(r?.result === id && Object.keys(r.cost).every((k) => k === 'gold' || drops.has(k)), `${id}: learned from real drops`);
    const ch = createCharacter(data); ch.gold = r.cost.gold; ch.materials = Object.fromEntries(Object.entries(r.cost).filter(([k]) => k !== 'gold'));
    assert.ok(craft(ch, data, 'learn_' + id).ok, id);
    assert.ok(fixture([id]).g.skills[0].requirementsMet, `${id}: castable with a bow`);
  }
});

test('the companion stays until it dies, bites from our attack (not magic), and a new call replaces it at full health', () => {
  const { g } = fixture(['call_companion']);
  const s = g.skills[0];
  assert.equal(s.summon.life, Infinity, 'it does not run out');
  const ch2 = createCharacter(data, { kit: 'bow' }); Object.assign(ch2, { stats: { ...g.ch.stats } }); ch2.skills.call_companion = 1; ch2.slots = g.ch.slots;
  const strong = computeSkill(ch2, data, { ...g.derived, attack: g.derived.attack * 2 }, 0), magic = computeSkill(ch2, data, { ...g.derived, magic: g.derived.magic * 3 }, 0);
  assert.ok(strong.summon.damage > s.summon.damage * 1.2, 'more attack, harder bites');
  assert.ok(Math.abs(magic.summon.damage - s.summon.damage) < 1e-6, 'magic does not matter');
  g.executeSkill(s, { angle: 0, x: 0, z: 0 });
  const a = g.allies.find((q) => q.type === 'hunt_hound');
  run(g, 60);
  assert.ok(g.allies.includes(a), 'still here a minute later');
  a.hp = 10; g.executeSkill(s, { angle: 0, x: 0, z: 0 });
  const b = g.allies.filter((q) => q.type === 'hunt_hound' && q.life > 0);
  assert.equal(b.length, 1); assert.equal(b[0].hp, b[0].maxHp, 'a fresh one');
});

test('Sic \'Em fails without a companion or a target; with them it sends the companion to bite hard and stun once', () => {
  const { g, mk } = fixture(['sic_em', 'call_companion']);
  const sic = slotOf(g, 'sic_em');
  g.monsters = [mk('m', 6, 0)];
  assert.equal(g.castSlot(sic), false);
  assert.ok(g.drainEvents().some((e) => e.type === 'fail' && e.reason === 'companion'), 'no companion yet');
  g.executeSkill(g.skills[slotOf(g, 'call_companion')], { angle: 0, x: 0, z: 0 });
  const a = g.allies.find((q) => q.type === 'hunt_hound');
  g.monsters = [mk('far', 40, 0)]; g.player.cooldowns[sic] = 0; g.player.mp = g.player.maxMp;
  assert.equal(g.castSlot(sic), false, 'no target in reach');
  const m = mk('m', 6, 0, { defense: 0 }); g.monsters = [m]; g.player.targetId = 'm'; g.drainEvents();
  g.executeSkill(g.skills[sic], { angle: Math.PI / 2, x: 6, z: 0 });
  assert.equal(a.sic?.targetId, 'm', 'sent at it');
  let pounce = null, hp0 = m.hp;
  for (let i = 0; i < 80 && !pounce; i++) { g.time += 0.05; g.updateAllies(0.05); pounce = g.drainEvents().find((e) => e.type === 'companionPounce'); }
  assert.ok(pounce, 'it pounces');
  const bite = hp0 - m.hp;
  assert.ok(Math.abs(bite - a.damage * C.sic_em.sic.mult) < 1, 'its bite times mult');
  assert.equal(m.state, 'stunned'); assert.ok(Math.abs(m.stateDur - C.sic_em.sic.stun.duration) < 1e-9);
  assert.equal(a.sic, null, 'once');
});

test('Mark Prey lowers armour, draws the companion to the marked one first, and a marked death may drop one more part', () => {
  const { g, mk } = fixture(['mark_prey', 'call_companion']);
  g.executeSkill(g.skills[slotOf(g, 'call_companion')], { angle: 0, x: 0, z: 0 });
  const a = g.allies.find((q) => q.type === 'hunt_hound');
  const near = mk('near', 2, 1), prey = mk('prey', 8, -2);
  g.monsters = [near, prey];
  g.hitMonster(prey, 10, g.hitOpts(g.skills[slotOf(g, 'mark_prey')], {}));
  assert.ok(prey.statuses.exposure.fraction === C.mark_prey.exposure.fraction && prey.statuses.exposure.prey === C.mark_prey.exposure.prey, 'marked');
  g.time += 0.05; g.updateAllies(0.05);
  assert.equal(a.targetId, 'prey', 'the companion goes for the prey over the nearer one');
  // a marked death drops one more part about prey of the time
  let extra = 0; const N = 400;
  for (let i = 0; i < N; i++) {
    const m = mk('k' + i, 3, 3, { type: prey.type }); m.statuses.exposure = { fraction: 0.2, t: 5, prey: C.mark_prey.exposure.prey };
    g.monsters = [m]; g.drainEvents(); g.killMonster(m);
    if (g.drainEvents().some((e) => e.type === 'preyDrop')) extra++;
  }
  assert.ok(Math.abs(extra / N - C.mark_prey.exposure.prey) < 0.08, `about its chance (${extra / N})`);
  const plain = mk('plain', 3, 3, { type: prey.type }); g.monsters = [plain]; g.drainEvents(); g.killMonster(plain);
  assert.ok(!g.drainEvents().some((e) => e.type === 'preyDrop'), 'an unmarked one never');
});

test('Pack Hunt brings three hounds for a while and makes our companion bite harder for that while', () => {
  const { g } = fixture(['pack_hunt', 'call_companion']);
  g.executeSkill(g.skills[slotOf(g, 'call_companion')], { angle: 0, x: 0, z: 0 });
  const a = g.allies.find((q) => q.type === 'hunt_hound');
  g.executeSkill(g.skills[slotOf(g, 'pack_hunt')], { angle: 0, x: 0, z: 0 });
  assert.equal(g.allies.filter((q) => q.type === 'pack_hound').length, C.pack_hunt.summon.count);
  assert.equal(a.buffs.pack?.damage, C.pack_hunt.packBuff.damage, 'the companion is roused');
  run(g, C.pack_hunt.summon.life + 0.5);
  assert.equal(g.allies.filter((q) => q.type === 'pack_hound').length, 0, 'the pack is gone after its life');
  assert.ok(!a.buffs.pack && g.allies.includes(a), 'the companion stays, its rousing worn off');
});

test('three companions, one at a time: calling another kind sends the old one away; each has its own part', () => {
  const { g } = fixture(['call_companion', 'call_hawk', 'call_bear']);
  const call = (id) => g.executeSkill(g.skills[slotOf(g, id)], { angle: 0, x: 0, z: 0 });
  call('call_companion'); call('call_hawk'); g.updateAllies(0.05);
  assert.deepEqual(g.allies.filter((a) => a.companion && a.life > 0).map((a) => a.type), ['hunt_hawk'], 'the hound went when the hawk came');
  call('call_bear'); g.updateAllies(0.05);
  const bear = g.allies.find((a) => a.type === 'hunt_bear'), hawk = C.call_hawk.summon, B = C.call_bear.summon, H = C.call_companion.summon;
  assert.ok(bear && !g.allies.some((a) => a.type === 'hunt_hawk' && a.life > 0), 'one at a time');
  assert.ok(B.hp.base > H.hp.base && B.speed < H.speed, 'the bear is the tough, slow one');
  assert.ok(hawk.range > H.range * 2 && hawk.hp.base < H.hp.base && hawk.speed > H.speed, 'the hawk strikes from afar, fast and frail');
});

test('Sic \'Em is each companion\'s own: the hawk\'s dive bleeds and cuts a wind-up, the bear\'s roar turns the monsters round it onto the bear', () => {
  for (const [call, check] of [
    ['call_hawk', (m, ms, a) => { assert.ok(m.statuses.bleed?.t > 0, 'the dive bleeds'); assert.equal(m.state, 'stunned', 'a short stun cuts its wind-up'); }],
    ['call_bear', (m, ms, a) => { for (const q of ms) assert.equal(q.forcedTargetId, a.id, 'turned onto the bear'); }],
  ]) {
    const { g, mk } = fixture(['sic_em', call]);
    g.executeSkill(g.skills[slotOf(g, call)], { angle: 0, x: 0, z: 0 });
    const a = g.allies.find((q) => q.companion);
    const m = mk('m', 4, 0, { defense: 0 }), others = [mk('o1', 5, 1.5), mk('o2', 5, -1.5)];
    g.monsters = [m, ...others]; g.player.targetId = 'm'; g.drainEvents();
    g.executeSkill(g.skills[slotOf(g, 'sic_em')], { angle: Math.PI / 2, x: 4, z: 0 });
    let pounce = null;
    for (let i = 0; i < 120 && !pounce; i++) { g.time += 0.05; g.updateAllies(0.05); pounce = g.drainEvents().find((e) => e.type === 'companionPounce'); }
    assert.ok(pounce, `${call}: it pounces`);
    check(m, call === 'call_bear' ? [m, ...others] : [], a);
  }
});
