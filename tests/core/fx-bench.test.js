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
