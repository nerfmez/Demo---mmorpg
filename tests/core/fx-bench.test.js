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
  assert.deepEqual(benchMods(data, 'flame_stream').sort(), ['frost_shift', 'life_leech']);
  const nova = benchMods(data, 'frost_nova');
  assert.ok(nova.includes('echo') && nova.includes('burning_ground') && nova.includes('cast_on_dodge'));
  assert.ok(!nova.includes('cast_on_guard'), 'guard triggers need a guard skill the bench does not have');
});

test('chain mods change the hops the effect draws', () => {
  const base = run('chain_spark', []).of('chain')[0];
  const bounce = run('chain_spark', [{ id: 'bounce', level: 2 }]).of('chain')[0];
  assert.equal(base.points.length, 5); // caster + first target + 3 chain hops
  assert.equal(bounce.points.length, 7);
  assert.equal(run('chain_spark', [{ id: 'frost_shift', level: 1 }]).of('chain')[0].element, 'cold');
});

test('nova mods: echo repeats, concentrated shrinks, burning ground leaves an area, dodge triggers', () => {
  assert.equal(run('frost_nova', [{ id: 'echo', level: 1 }]).of('nova').length, 2);
  assert.ok(run('frost_nova', [{ id: 'concentrated', level: 1 }]).of('nova')[0].radius < 4.2);
  assert.equal(run('frost_nova', [{ id: 'burning_ground', level: 1 }]).of('area').filter((a) => a.kind === 'burning_ground').length, 1);
  const dodge = run('frost_nova', [{ id: 'cast_on_dodge', level: 1 }], (g) => g.useMovement());
  assert.equal(dodge.of('trigger').length, 1);
  assert.equal(dodge.of('nova').length, 1);
  const knock = run('frost_nova', [{ id: 'knockback', level: 3 }]);
  assert.ok(knock.g.monsters.some((m) => Math.hypot(m.x - m.homeX, m.z - m.homeZ) > 1));
});

test('flame stream channels pulses until released and frost shift turns it cold', () => {
  const r = run('flame_stream', [{ id: 'frost_shift', level: 1 }], undefined, 1);
  assert.ok(r.of('channelPulse').length >= 3);
  assert.ok(r.of('channelPulse').every((e) => e.element === 'cold'));
  r.g.cancelChannel();
  assert.equal(r.g.drainEvents().filter((e) => e.type === 'channelEnd').length, 1);
});

// Prototype fusion (data/fusion.json): a physical carrier links one fast spell.
import { readFileSync } from 'node:fs';
import { fusionPayloads } from '../../src/fxtest/fusion.js';
const FUSION = JSON.parse(readFileSync(new URL('../../data/fusion.json', import.meta.url)));

test('fusion pairs: physical fast carriers with fast damage spells only', () => {
  assert.deepEqual(fusionPayloads(data, FUSION, 'slash').sort(), ['arcane_bolt', 'arcane_shot', 'firebolt']);
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
