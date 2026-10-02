import { test } from 'node:test';
import assert from 'node:assert/strict';
import worldData from '../../data/world.json' with { type: 'json' };
import config from '../../data/harbor-v4.json' with { type: 'json' };
import { createWorld } from '../../src/core/world.js';
import { fromBoxLocal } from '../../src/core/math.js';

const baseline = createWorld(worldData);
const preview = createWorld(worldData, { extraBoxes: config.colliders });

test('the opt-in art preview retains every baseline tree, decoration, collider and dock', () => {
  assert.deepEqual(preview.circles, baseline.circles);
  assert.deepEqual(preview.decor, baseline.decor);
  assert.deepEqual(preview.docks, baseline.docks);
  assert.deepEqual(preview.boxes.slice(0, baseline.boxes.length), baseline.boxes);
  assert.equal(preview.boxes.length, baseline.boxes.length + config.colliders.length);
  assert.equal(preview.data.id, baseline.data.id);
  for (const box of config.colliders) assert.equal(preview.isFree(box.x, box.z, .1), false, box.id);
});

test('the full harbor street width and all original road centre lines remain walkable', () => {
  for (const road of preview.roads) for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
    const length = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= length; s += .35) for (const side of road.id === 'harbor_street' ? [-1, 0, 1] : [0]) {
      const offset = side * (road.width / 2 - .45);
      const x = ax + (bx - ax) * s / length - (bz - az) * offset / length;
      const z = az + (bz - az) * s / length + (bx - ax) * offset / length;
      if (baseline.isFree(x, z, .45)) assert.ok(preview.isFree(x, z, .45), `${road.id} obstructed at ${x},${z}`);
    }
  }
});

test('the east pier keeps its joined approach, three metre cargo aisle and water boundaries', () => {
  const deck = preview.docks.find(d => d.id === 'market_east');
  const ramp = preview.docks.find(d => d.id === 'market_east_ramp');
  for (let z = -ramp.hz; z <= ramp.hz + 2 * deck.hz - .5; z += .25) {
    const p = fromBoxLocal(ramp, 0, z);
    assert.ok(preview.isFree(p.x, p.z, .45), `pier approach blocked at ${z}`);
  }
  for (let z = -deck.hz; z < deck.hz - .5; z += .25) for (const x of [-1.05, 0, 1.05]) {
    const p = fromBoxLocal(deck, x, z);
    assert.ok(preview.isFree(p.x, p.z, .45), `cargo aisle blocked at ${x},${z}`);
  }
  const p = fromBoxLocal(deck, deck.hx + .5, 0);
  assert.equal(preview.isFree(p.x, p.z, .45), false);
});
