// Weapon carry data (data/weapon-holds.json, read by src/render/hero.js): every weapon type has a
// carry, and a heavy weapon has both its one-hand carry (shield in the left) and its two-hand grip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';

const HOLDS = JSON.parse(readFileSync(new URL('../../data/weapon-holds.json', import.meta.url)));
const types = Object.entries(data.items.weaponTypes).filter(([id]) => id !== '_doc');
const vec = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

test('every weapon type has a carry with a palm position and a weapon direction', () => {
  for (const [id] of types) {
    const h = HOLDS.holds[id];
    assert.ok(h && (h.one || h.two), `${id} has no hold`);
    for (const k of ['one', 'two']) if (h[k]) {
      assert.ok(vec(h[k].hand) && vec(h[k].dir), `${id}.${k} needs hand and dir`);
      assert.ok(Math.hypot(...h[k].dir) > 0.5, `${id}.${k} dir is degenerate`);
    }
  }
  for (const id of Object.keys(HOLDS.holds)) assert.ok(data.items.weaponTypes[id], `hold for unknown weapon ${id}`);
});

test('heavy weapons are held in two hands unless the left hand is busy', () => {
  for (const [id, t] of types) {
    const h = HOLDS.holds[id];
    if (t.hands === 'heavy') assert.ok(h.one && h.two, `${id} needs one- and two-hand carries`);
    if (h.two) assert.ok(Number.isFinite(h.two.grip), `${id}.two needs a left-hand grip`);
  }
  assert.ok(HOLDS.holds.greatblade.two, 'the greatblade is a two-hand grip');
  assert.ok(HOLDS.swing.radius > 0.2 && HOLDS.swing.radius < 0.8);
});

test('idle stances exist, use real pose channels and stay small', () => {
  const bones = new Set(['legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'torso', 'chest', 'head', 'hips']);
  assert.ok(HOLDS.stances.relaxed, 'the default stance');
  for (const [id, h] of Object.entries(HOLDS.holds))
    for (const k of ['one', 'two']) if (h[k]?.stance) assert.ok(HOLDS.stances[h[k].stance], `${id}.${k} stance ${h[k].stance}`);
  for (const [name, st] of Object.entries(HOLDS.stances))
    for (const [k, v] of Object.entries(st)) {
      if (k === 'drop' || k === 'shift') { assert.ok(Math.abs(v) < 0.1, `${name}.${k}`); continue; }
      assert.ok(bones.has(k) && vec(v) && v.every((x) => Math.abs(x) < 0.8), `${name}.${k}`);
    }
});
