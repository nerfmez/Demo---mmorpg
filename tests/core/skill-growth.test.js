// Skill bars (owner, 2026-10-27/28; docs/SKILL-GROWTH-TH.md, core/skill-growth.js): a skill's type gives
// it bars; points come from using it; every bar pays for what it gives; the grade caps a bar; taking
// points back costs gold; a save before v16 starts with empty bars.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, LearnedGame as Game, createLearnedCharacter } from './helpers.js';
import { createCharacter, migrateCharacter, derive, CHARACTER_VERSION } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { barsOf, barEffects, growthState, gainProficiency, allocateBars, respecCost, upgradeGrade, gradeCost } from '../../src/core/skill-growth.js';
import { buildProfile } from '../../src/core/build-rules.js';
import { referenceFor } from '../../src/core/content-budget.js';

const G = data.progression.skillGrowth, GROWN = ['slash', 'hunter_shot', 'firebolt'];
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('each growth skill has its type\'s bars; skills without a type have none', () => {
  assert.deepEqual(barsOf(data, data.skills.combat.slash), ['power', 'rate', 'size']);
  assert.deepEqual(barsOf(data, data.skills.combat.firebolt), ['power', 'rate', 'count']);
  assert.deepEqual(barsOf(data, data.skills.combat.meteor), []);
  for (const id of GROWN) {
    const def = data.skills.combat[id];
    assert.ok(data.items.materials[def.gradeMaterial], `${id} grade material exists`);
    for (const b of barsOf(data, def)) assert.ok(G.bars[b], `${id} bar ${b} is in the exchange table`);
  }
  for (const t of Object.values(G.types)) assert.ok(t.bars.length >= 2 && t.bars.length <= 3);
});

test('gains add up, costs multiply, and a cost on a stat the skill lacks is paid in MP', () => {
  const fire = data.skills.combat.firebolt, slash = data.skills.combat.slash, p = G.bars.power;
  const e = barEffects(data, fire, { power: 4 });
  near(e.damage, 1 + p.gain.damage * 4, 'power damage adds');
  near(e.cooldown, p.cost.cooldown ** 4, 'power cooldown multiplies');
  near(e.size, 1, 'a projectile has no size bar, so power does not grow it');
  near(barEffects(data, slash, { power: 4 }).size, 1 + p.gain.size * 4, 'a sweep grows a little with power');
  // the rate bar's size and range costs: a sweep pays size, a projectile pays both in MP
  const r = G.bars.rate, half = G.missingCostToMana;
  near(barEffects(data, slash, { rate: 3 }).size, r.cost.size ** 3, 'a sweep gets smaller');
  near(barEffects(data, fire, { rate: 3 }).mana, ((1 + (1 - r.cost.size) * half) * (1 + (1 - r.cost.range) * half)) ** 3, 'a projectile pays in MP');
  const c = barEffects(data, fire, { count: 5 });
  assert.equal(c.projectiles, Math.floor(5 / G.bars.count.gain.countEvery));
  near(c.perProjectile, (1 + c.projectiles) ** -G.bars.count.gain.countDamageExp, 'each projectile is lighter');
});

test('compiled skills carry the bars: projectiles, a fan, speed under the cap, a wider sweep', () => {
  const ch = createLearnedCharacter(data), d = derive(ch, data), fire = ch.slots.findIndex((s) => s.skill === 'firebolt'), slash = ch.slots.findIndex((s) => s.skill === 'slash');
  const plainF = computeSkill(ch, data, d, fire), plainS = computeSkill(ch, data, d, slash);
  ch.skillGrowth = { firebolt: { grade: 'S', bars: { count: 4, rate: 3 }, earned: 12, prof: 0 }, slash: { grade: 'S', bars: { size: 5 }, earned: 12, prof: 0 } };
  const f = computeSkill(ch, data, d, fire), s = computeSkill(ch, data, d, slash);
  assert.equal(f.projectiles, 3);
  assert.equal(f.spread, G.bars.count.gain.countSpread * 2);
  assert.ok(f.cooldown < plainF.cooldown, 'the rate bar speeds it');
  assert.ok(f.damage < plainF.damage && f.cost > plainF.cost, 'and it pays in damage and MP');
  assert.ok(s.arc > plainS.arc && s.range > plainS.range && s.damage < plainS.damage && s.cooldown > plainS.cooldown);
  // speed from bars shares the central haste cap
  ch.skillGrowth.firebolt.bars = { rate: 8 };
  const capped = computeSkill(ch, data, { ...d, hastePct: data.progression.character.caps.hastePct }, fire);
  near(capped.cooldown, data.skills.combat.firebolt.cooldown / (1 + data.progression.character.caps.hastePct / 100), 'no speed past the cap');
});

test('points come from casting in a fight, at the skill\'s own pace, up to the total', () => {
  const ch = createLearnedCharacter(data);
  assert.equal(gainProficiency(ch, data, 'meteor', 999), 0, 'no bars, no points');
  assert.equal(gainProficiency(ch, data, 'slash', G.secondsPerPoint - 1), 0);
  assert.equal(gainProficiency(ch, data, 'slash', 1), 1);
  assert.equal(gainProficiency(ch, data, 'slash', G.secondsPerPoint * 40), G.totalPoints - 1);
  const st = growthState(ch, data, 'slash');
  assert.equal(st.earned, G.totalPoints); assert.equal(st.prof, 0); assert.equal(st.free, G.totalPoints);
  // in the game: a cast only counts with an enemy close by, and announces a new point
  const g = new Game(data, { seed: 5 }), i = g.ch.slots.findIndex((s) => s.skill === 'slash'), p = g.player;
  g.monsters = []; g.ch.skillGrowth = {}; g.refresh();
  assert.ok(g.castSlot(i)); assert.equal(growthState(g.ch, data, 'slash').prof, 0, 'no enemy near: nothing');
  const m = { id: 99, x: p.x + 2, z: p.z, r: 0.5, hp: 1e9, maxHp: 1e9, dead: false, def: {}, aggro: false };
  g.monsters = [m]; p.cooldowns[i] = 0; p.cast = null; p.mp = p.maxMp;
  g.ch.skillGrowth = { slash: { grade: 'C', bars: {}, earned: 0, prof: G.secondsPerPoint - 0.01 } };
  g.drainEvents();
  assert.ok(g.castSlot(i));
  assert.equal(growthState(g.ch, data, 'slash').earned, 1);
  assert.ok(g.drainEvents().some((e) => e.type === 'skillPoint' && e.skill === 'slash'));
});

test('allocating: only the skill\'s bars, within the grade cap and the points earned; taking back costs gold', () => {
  const ch = createLearnedCharacter(data); ch.gold = 10000; ch.level = 10;
  ch.skillGrowth = { slash: { grade: 'C', bars: {}, earned: 5, prof: 0 } };
  assert.equal(allocateBars(ch, data, 'slash', { count: 1 }).reason, 'bar');
  assert.equal(allocateBars(ch, data, 'slash', { power: G.grades.C + 1 }).reason, 'cap');
  assert.equal(allocateBars(ch, data, 'slash', { power: 2, rate: 2, size: 2 }).reason, 'points');
  const put = allocateBars(ch, data, 'slash', { power: 2, rate: 2, size: 1 }, true);
  assert.deepEqual([put.ok, put.gold], [true, 0], 'putting points in is free');
  const back = allocateBars(ch, data, 'slash', { power: 0, rate: 2, size: 1 }, true);
  assert.equal(back.gold, respecCost(ch, data, 2)); assert.equal(ch.gold, 10000 - back.gold);
  assert.equal(growthState(ch, data, 'slash').free, 2);
  ch.gold = 0;
  assert.equal(allocateBars(ch, data, 'slash', { rate: 0, size: 1 }).reason, 'gold');
});

test('a grade costs gold, the skill\'s own material and a boss part, and lengthens every bar', () => {
  const ch = createLearnedCharacter(data);
  ch.skillGrowth = { firebolt: { grade: 'C', bars: {}, earned: 12, prof: 0 } };
  assert.equal(upgradeGrade(ch, data, 'firebolt').reason, 'materials');
  const cost = gradeCost(data, 'firebolt', 'B');
  ch.gold = cost.gold; ch.materials = { [data.skills.combat.firebolt.gradeMaterial]: cost[data.skills.combat.firebolt.gradeMaterial] };
  assert.ok(upgradeGrade(ch, data, 'firebolt', true).ok);
  const st = growthState(ch, data, 'firebolt');
  assert.deepEqual([st.grade, st.cap, ch.gold], ['B', G.grades.B, 0]);
  assert.ok(Object.keys(gradeCost(data, 'firebolt', 'A')).some((k) => data.items.materials[k] && Object.values(data.monsters.monsters).some((m) => m.boss && m.drops.some((d) => d.item === k))), 'grade A needs a boss part');
});

test('v16: an older hero starts with empty bars, keeps ranks and mods; bad bars are repaired; idempotent', () => {
  const old = createCharacter(data); old.version = 15; delete old.skillGrowth;
  const ranks = { ...old.skills };
  migrateCharacter(old, data);
  assert.equal(old.version, CHARACTER_VERSION); assert.deepEqual(old.skillGrowth, {}); assert.deepEqual(old.skills, ranks);
  const bad = createCharacter(data);
  bad.skillGrowth = { slash: { grade: 'Z', bars: { power: 9, count: 3, size: 2 }, earned: 3, prof: -4 }, meteor: { grade: 'S', bars: { power: 1 }, earned: 1 }, gone: {} };
  migrateCharacter(bad, data);
  assert.deepEqual(Object.keys(bad.skillGrowth), ['slash'], 'only skills with bars are kept');
  const s = bad.skillGrowth.slash;
  assert.equal(s.grade, 'C'); assert.equal(s.prof, 0);
  assert.ok(!s.bars.count && (s.bars.power || 0) <= G.grades.C && Object.values(s.bars).reduce((a, b) => a + b, 0) <= s.earned);
  assert.deepEqual(migrateCharacter(structuredClone(bad), data), bad, 'idempotent');
});

test('no allocation is free, and none lifts single-target damage past growthSingleCap', () => {
  const cap = data.progression.balance.rules.growthSingleCap, L = data.progression.balance.monsterCap;
  for (const id of GROWN) {
    const def = data.skills.combat[id], ref = referenceFor(data, def), [a, b, c] = barsOf(data, def);
    const run = (growth) => buildProfile(data, { kit: ref.kit, build: ref.build, level: L, gear: 'mixed', mpFree: true, loadout: [id], growth });
    const base = run(undefined);
    for (let x = 0; x <= G.grades.S; x++) for (let y = 0; y <= G.grades.S; y++) for (let z = 0; z <= G.grades.S; z++) {
      if (!(x + y + z) || x + y + z > G.totalPoints) continue;
      const p = run({ [id]: { [a]: x, [b]: y, [c]: z } }), single = p.axes.single / base.axes.single, pack = p.axes.pack / base.axes.pack, mp = p.cost.mpPerSecond / base.cost.mpPerSecond;
      const tag = `${id} ${a}${x} ${b}${y} ${c}${z}`;
      assert.ok(single <= cap, `${tag}: single ${single.toFixed(3)} over ${cap}`);
      assert.ok(!(single > 1.005 && pack > 1.005 && mp < 0.995), `${tag}: better at everything (${single.toFixed(3)}, ${pack.toFixed(3)}, MP ${mp.toFixed(3)})`);
    }
  }
});

test('a plain hit flinches a monster once per flinchLock; a heavy hit still staggers', () => {
  const g = new Game(data, { seed: 22 }), m = g.monsters.find((x) => !x.boss), lock = data.progression.combat.flinchLock;
  assert.ok(lock > data.progression.combat.stagger);
  let frozen = 0, steps = 0;
  for (let t = 0; t < 3; t += 0.1) { g.time += 0.1; g.hitMonster(m, 1); if (m.staggerT > 0) frozen++; m.staggerT = Math.max(0, m.staggerT - 0.1); steps++; }
  assert.ok(frozen / steps < 0.4, `rapid light hits hold it only part of the time (${frozen}/${steps})`);
  m.flinchReady = g.time + 10; m.staggerT = 0;
  g.hitMonster(m, 1, { stagger: 0.5 });
  assert.equal(m.staggerT, 0.5, 'a heavy hit ignores the lock');
});
