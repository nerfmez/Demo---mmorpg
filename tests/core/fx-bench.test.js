// The FX test bench (fx-test.html) runs the real rules; mods must change what its effects receive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../src/core/data-node.js';
import { createBench, benchMods } from '../../src/fxtest/sandbox.js';

const data = loadData();
function run(skill, mods, act = (g) => g.castSlot(0, { x: 5, z: 0 }), seconds = 2) {
  const g = createBench(data, skill, mods);
  act(g);
  const events = [...g.drainEvents()];
  for (let i = 0; i < seconds * 60; i++) { g.benchStep(1 / 60); events.push(...g.drainEvents()); }
  return { g, events, of: (type) => events.filter((e) => e.type === type) };
}

test('bench offers only mods that fit and can be triggered there', () => {
  assert.deepEqual(benchMods(data, 'flame_stream').sort(), ['life_leech', 'ramp_cast']);
  const nova = benchMods(data, 'frost_nova');
  assert.ok(nova.includes('echo') && nova.includes('cast_on_dodge'));
  for (const s of ['chain_spark', 'frost_nova', 'flame_stream']) assert.ok(!benchMods(data, s).some((id) => id.endsWith('_shift')), `spells keep their element: ${s}`);
  assert.ok(!nova.includes('cast_on_guard'), 'guard triggers need a guard skill the bench does not have');
});

test('chain mods change the hops the effect draws', () => {
  const base = run('chain_spark', []).of('chain')[0];
  const bounce = run('chain_spark', [{ id: 'bounce', level: 2 }]).of('chain')[0];
  assert.equal(base.points.length, 5); // caster + first target + 3 chain hops
  assert.equal(bounce.points.length, 7);
  assert.equal(base.element, 'lightning');
});

test('nova mods: echo repeats, concentrated shrinks, dodge triggers', () => {
  assert.equal(run('frost_nova', [{ id: 'echo', level: 1 }]).of('nova').length, 2);
  assert.ok(run('frost_nova', [{ id: 'concentrated', level: 1 }]).of('nova')[0].radius < 4.2);
  assert.equal(run('frost_nova', []).of('nova')[0].element, 'cold');
  const dodge = run('frost_nova', [{ id: 'cast_on_dodge', level: 1 }], (g) => g.useMovement());
  assert.equal(dodge.of('trigger').length, 1);
  assert.equal(dodge.of('nova').length, 1);
  const knock = run('frost_nova', [{ id: 'knockback', level: 3 }]);
  assert.ok(knock.g.monsters.some((m) => Math.hypot(m.x - m.homeX, m.z - m.homeZ) > 1));
});

test('flame stream channels pulses until released', () => {
  const r = run('flame_stream', [], undefined, 1);
  assert.ok(r.of('channelPulse').length >= 3);
  assert.ok(r.of('channelPulse').every((e) => e.element === 'fire'));
  r.g.cancelChannel();
  assert.equal(r.g.drainEvents().filter((e) => e.type === 'channelEnd').length, 1);
});

// Prototype fusion (data/fusion.json): a physical carrier links one fast spell.
import { readFileSync } from 'node:fs';
import { fusionPayloads } from '../../src/fxtest/fusion.js';
const FUSION = JSON.parse(readFileSync(new URL('../../data/fusion.json', import.meta.url)));

test('fusion pairs: physical fast carriers with fast damage spells only', () => {
  assert.deepEqual(fusionPayloads(data, FUSION, 'slash').sort(), ['arcane_bolt', 'firebolt']);
  assert.deepEqual(fusionPayloads(data, FUSION, 'chain_spark'), [], 'a spell is not a carrier');
  assert.ok(!fusionPayloads(data, FUSION, 'slash').includes('frost_nova'), 'long cooldown spells are not payloads');
  assert.deepEqual(fusionPayloads(data, FUSION, 'armor_cleave'), [], 'long cooldown attacks are not carriers');
});

test('generic fusion (no recipe for the pair): longer cooldown, summed cost, payload fires on through the struck target at reduced damage', () => {
  const plain = createBench(data, 'slash', []).skills[0];
  const g = createBench(data, 'slash', [], { fusion: 'arcane_bolt', fusionRules: FUSION });
  const s = g.skills[0], bolt = g.skills[1];
  assert.equal(s.cooldown, Math.max(plain.cooldown, bolt.cooldown));
  assert.equal(s.cost, plain.cost + bolt.cost);
  g.castSlot(0, { x: 5, z: 0 });
  const events = [];
  let projectile = null;
  for (let i = 0; i < 60; i++) {
    g.benchStep(1 / 60); events.push(...g.drainEvents());
    projectile ||= g.projectiles.find((p) => p.kind === 'arcane_bolt');
  }
  const fusion = events.filter((e) => e.type === 'fusion');
  assert.equal(fusion.length, 1, 'once per cast');
  const struck = g.monsters.find((m) => m.x === fusion[0].x && m.z === fusion[0].z);
  assert.ok(projectile.hit.has(struck.id), 'the struck target is not hit twice');
  assert.ok(Math.abs(projectile.damage - bolt.damage * FUSION.payloadDamageMult * g.playerDamageMult()) < 1e-6);
  const boltHits = events.filter((e) => e.type === 'hit' && e.element === bolt.element && !e.dot);
  assert.equal(boltHits.length, 1);
  assert.notEqual(boltHits[0].id, struck.id);
});

test('a fused slash that misses does not fire its payload', () => {
  const g = createBench(data, 'slash', [], { fusion: 'arcane_bolt', fusionRules: FUSION });
  g.aimAt(-Math.PI / 2);
  g.castSlot(0, { x: -5, z: 0 });
  const events = [];
  for (let i = 0; i < 40; i++) { g.benchStep(1 / 60); events.push(...g.drainEvents()); }
  assert.equal(events.filter((e) => e.type === 'fusion').length, 0);
});

test('bench slash is one plain strike: no combo steps, no finisher knockback', () => {
  const g = createBench(data, 'slash', []);
  const slashes = [];
  for (let c = 0; c < 4; c++) {
    g.player.cooldowns.fill(0);
    g.castSlot(0, { x: 5, z: 0 });
    for (let i = 0; i < 20; i++) { g.benchStep(1 / 60); slashes.push(...g.drainEvents().filter((e) => e.type === 'slash')); }
  }
  assert.equal(slashes.length, 4);
  assert.ok(slashes.every((e) => e.step === 0 && !e.finisher));
  assert.ok(g.monsters.every((m) => Math.hypot(m.x - m.homeX, m.z - m.homeZ) < 1e-6), 'nothing was knocked back');
});

test('Multistrike: one extra strike at levels 1-2, two at level 3, each landing on its own time', () => {
  for (const [level, strikes] of [[1, 2], [2, 2], [3, 3]]) {
    const g = createBench(data, 'slash', [{ id: 'multistrike', level }]);
    g.castSlot(0, { x: 5, z: 0 });
    const slashes = [];
    for (let i = 0; i < 60; i++) { g.benchStep(1 / 60); slashes.push(...g.drainEvents().filter((e) => e.type === 'slash').map((e) => ({ ...e, t: g.time }))); }
    assert.equal(slashes.length, strikes, `level ${level}`);
    for (let k = 1; k < slashes.length; k++) assert.ok(slashes[k].t - slashes[k - 1].t >= g.skills[0].repeatDelay - 1e-6);
  }
});

test('Flame Wave Slash recipe: 1 s charge, then the slash and a piercing fire wave hitting each target once', () => {
  const g = createBench(data, 'slash', [], { fusion: 'firebolt', fusionRules: FUSION });
  const recipe = FUSION.recipes.find((r) => r.id === 'flame_wave_slash');
  assert.equal(g.skills[0].recipe.id, recipe.id);
  assert.equal(g.skills[0].cooldown, recipe.cooldown);
  assert.ok(g.castSlot(0, { x: 5, z: 0 }));
  assert.ok(!g.castSlot(0, { x: 5, z: 0 }), 'no second charge while charging');
  const events = [];
  for (let i = 0; i < Math.round(recipe.chargeTime * 60) - 3; i++) { g.benchStep(1 / 60); events.push(...g.drainEvents()); }
  assert.equal(events.filter((e) => e.type === 'hit').length, 0, 'nothing lands during the charge');
  for (let i = 0; i < 90; i++) { g.benchStep(1 / 60); events.push(...g.drainEvents()); } // well inside the cooldown
  assert.equal(events.filter((e) => e.type === 'fusionRelease').length, 1);
  assert.equal(events.filter((e) => e.type === 'slash').length, 1);
  const wave = events.filter((e) => e.type === 'hit' && e.element === 'fire' && !e.dot);
  const ids = wave.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'each target is hit by the wave once');
  const far = g.monsters.filter((m) => m.homeX > 4 && m.homeX < 0.6 + recipe.wave.range).map((m) => m.id);
  assert.ok(far.length >= 2 && far.every((id) => ids.includes(id)), 'the wave pierces on to the targets behind');
  assert.ok(g.player.cooldowns[0] > 0);
});

test('Flame Wave Slash: the carrier mods ride on the wave', () => {
  const run = (mods) => {
    const g = createBench(data, 'slash', mods, { fusion: 'firebolt', fusionRules: FUSION });
    g.castSlot(0, { x: 5, z: 0 });
    const events = [];
    for (let i = 0; i < 150; i++) { g.benchStep(1 / 60); events.push(...g.drainEvents()); }
    const waveHits = events.filter((e) => e.type === 'hit' && e.skill === 'flame_wave_slash' && !e.dot);
    return { g, events, waveHits, far: g.monsters.filter((m) => m.homeX > 4) };
  };
  const frost = run([{ id: 'frost_shift', level: 1 }]);
  assert.ok(frost.waveHits.length && frost.waveHits.every((e) => e.element === 'cold'), 'Frost Shift makes the wave cold');
  assert.ok(frost.far.some((m) => m.statuses.chill), 'and it chills');
  const multi = run([{ id: 'multistrike', level: 3 }]);
  assert.ok(multi.waveHits.length >= 3 * run([]).waveHits.length - 1, 'Multistrike level 3 sends three waves');
  const knock = run([{ id: 'knockback', level: 3 }]);
  assert.ok(knock.far.some((m) => Math.hypot(m.x - m.homeX, m.z - m.homeZ) > 0.5), 'Knockback pushes what the wave hits');
  const poison = run([{ id: 'poison_shift', level: 1 }]);
  assert.ok(poison.waveHits.length && poison.waveHits.every((e) => e.element === 'poison'), 'Poison Shift makes the wave poison');
  const wide = run([{ id: 'wide_arc', level: 3 }]);
  assert.ok(wide.waveHits.length > run([]).waveHits.length, 'Wide Arc widens the wave');
});

test('Venom Arrow trial on the bench: a fast bow attack; each hit stacks the same target\'s poison up to five; the game keeps its zone', () => {
  assert.equal(data.skills.combat.venom_mire.kind, 'dot_zone', 'the game data is untouched');
  const mods = benchMods(data, 'venom_mire');
  assert.ok(mods.includes('split') && !mods.includes('following_field') && !mods.includes('fire_shift'), 'arrow mods; no field mods; no element change');
  const g = createBench(data, 'venom_mire', []);
  assert.equal(g.derived.weaponType, 'bow');
  const target = g.monsters.find((m) => m.x === 5 && m.z === 0);
  g.monsters = [target];
  const stacks = [];
  let poison = 0, direct = 0;
  for (let i = 0; i < 6 * 60; i++) {
    if (g.player.cooldowns[0] <= 0 && !g.player.cast) g.castSlot(0, { x: 5, z: 0 });
    g.benchStep(1 / 60);
    for (const e of g.drainEvents()) {
      if (e.type === 'poisonStack') stacks.push(e.stacks);
      if (e.type === 'hit') { if (e.dot) { assert.equal(e.element, 'poison'); poison += e.amount; } else direct += e.amount; }
    }
  }
  assert.deepEqual(stacks, [1, 2, 3, 4, 5], 'stacks climb to five and stay there');
  assert.equal(target.statuses.poison.stacks, 5);
  assert.ok(poison > direct * 0.8, 'the stacked poison carries much of the damage');
  assert.equal(r0(), 0);
  function r0() { return run('venom_mire', [], undefined, 1).of('area').length; } // no pool
});

test('Arrow Rain on the bench: one area event per wave, each with its own delay, and a burst as each lands', () => {
  const r = run('arrow_rain', [], undefined, 2);
  const areas = r.of('area').filter((e) => e.kind === 'arrow_rain');
  assert.deepEqual(areas.map((e) => +e.delay.toFixed(2)), [0.45, 0.85, 1.25], 'the effect times each wave from these');
  assert.equal(r.of('burst').filter((e) => e.kind === 'arrow_rain').length, 3);
  assert.ok(benchMods(data, 'arrow_rain').includes('echo'));
});

test('Power Draw on the bench: hold to charge, release looses one arrow whose damage grows with the charge', () => {
  const shot = (hold) => {
    const g = createBench(data, 'charged_shot', []);
    g.monsters = [g.monsters.find((m) => m.x === 9)];
    assert.ok(g.castSlot(0, { x: 9, z: 0 }));
    const events = [...g.drainEvents()];
    for (let i = 0; i < Math.round(hold * 60); i++) { g.benchStep(1 / 60); events.push(...g.drainEvents()); }
    assert.ok(g.releaseCharge(0, { x: 9, z: 0 }));
    for (let i = 0; i < 90; i++) { g.benchStep(1 / 60); events.push(...g.drainEvents()); }
    assert.equal(events.filter((e) => e.type === 'chargeStart').length, 1);
    return events.filter((e) => e.type === 'hit' && !e.dot).reduce((t, e) => t + e.amount, 0);
  };
  const quick = shot(0.1), full = shot(1.5);
  assert.ok(full > quick * 2, `a full draw hits far harder (${quick} -> ${full})`);
});

test('Frontline Split on the bench: a wind-up, then one lineStrike that hits the dummies in its lane only', () => {
  const r = run('frontline_split', [], (g) => { g.aimAt(Math.PI / 2); g.castSlot(0, { x: 5, z: 0 }); }, 1.2);
  const strike = r.of('lineStrike');
  assert.equal(strike.length, 1);
  assert.equal(strike[0].range, 5); assert.equal(strike[0].width, 1.4);
  assert.ok(strike[0].t >= 0.6, 'nothing lands before the wind-up');
  const hit = new Set(r.of('hit').map((e) => e.id));
  assert.ok(hit.size >= 3 && hit.size < r.g.monsters.length, 'the lane hits some dummies, not all');
});

test('Sunder Cut on the bench: an axe cut that opens the armour of what it hits, for the rules\' 5 s', () => {
  const r = run('armor_cleave', [], (g) => { g.aimAt(Math.PI / 2); g.castSlot(0, { x: 5, z: 0 }); }, 1);
  assert.equal(r.g.derived.weaponType, 'axe');
  const hit = new Set(r.of('hit').filter((e) => !e.dot).map((e) => e.id));
  const exposed = r.g.monsters.filter((m) => m.statuses.exposure);
  assert.ok(hit.size >= 2 && exposed.length === hit.size, 'every struck dummy is exposed, the rest are not');
  assert.ok(exposed.every((m) => m.statuses.exposure.fraction === 0.18 && m.statuses.exposure.t > 3.5));
});
