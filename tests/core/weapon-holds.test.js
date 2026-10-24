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

test('idle stances exist, use real pose channels and stay within a standing range', () => {
  const bones = new Set(['legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'torso', 'chest', 'head', 'hips']);
  assert.ok(HOLDS.stances.relaxed, 'the default stance');
  // the shared carries and the chibi's own (data/models.json) name stances that exist
  const chibi = data.models.characters.hero_chibi.holds;
  for (const [id, h] of [...Object.entries(HOLDS.holds), ...Object.entries(chibi).filter(([id]) => id !== '_doc')])
    for (const k of ['one', 'two', 'dual']) if (h[k]?.stance) assert.ok(HOLDS.stances[h[k].stance], `${id}.${k} stance ${h[k].stance}`);
  // a stance retargeted from a reference clip (_from names it) bends the knees further and drops lower
  for (const [name, st] of Object.entries(HOLDS.stances)) {
    const ref = typeof st._from === 'string';
    for (const [k, v] of Object.entries(st)) {
      if (k === '_from') continue;
      if (k === 'drop' || k === 'shift') { assert.ok(Math.abs(v) < (ref ? 0.2 : 0.1), `${name}.${k}`); continue; }
      const lim = ref ? (/^(elbow|knee)/.test(k) ? 2.6 : 1.6) : 0.8; // a hinge can fold further (an archer's drawing elbow)
      assert.ok(bones.has(k) && vec(v) && v.every((x) => Math.abs(x) < lim), `${name}.${k}`);
    }
  }
});

test('the chibi keeps a one-hand carry beside a dual one, and a dual carry places the left weapon', () => {
  const chibi = data.models.characters.hero_chibi.holds;
  for (const [id, h] of Object.entries(chibi)) {
    if (id === '_doc') continue;
    assert.ok(data.items.weaponTypes[id], `chibi hold for unknown weapon ${id}`);
    assert.ok(h.one || h.two, `${id} still needs its one- or two-hand carry`);
    if (!h.dual) continue;
    assert.equal(data.items.weaponTypes[id].hands, 'light', `${id}: only light weapons dual-wield`);
    assert.ok(vec(h.dual.hand) && vec(h.dual.dir) && vec(h.dual.left?.hand) && vec(h.dual.left?.dir), `${id}.dual needs both hands`);
    assert.ok(h.dual.left.hand[0] > 0 && h.dual.hand[0] < 0, `${id}.dual: the left weapon on the left (+x), the right on the right`);
  }
  for (const [name, p] of Object.entries(HOLDS.presets).filter(([k]) => k !== '_doc'))
    assert.ok(vec(p.hand) && vec(p.dir) && HOLDS.stances[p.stance], `preset ${name}`);
});
