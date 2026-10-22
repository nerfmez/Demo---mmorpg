// Stone ledges along the cliffs (src/render/ledges.js): found from the heightfield, placed only
// where the ground really drops, kept off towns, roads and docks, and the same every load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../src/core/data-node.js';
import { createWorld } from '../../src/core/world.js';
import { ledgeSteps, stoneVariants } from '../../src/render/ledges.js';
import art from '../../data/art.json' with { type: 'json' };

const data = loadData();
const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, m]) => [id, createWorld(m.world || m)]));
const run = (world) => { const it = ledgeSteps(world, (x, z) => world.groundY(x, z)); let r; while (!(r = it.next()).done); return r.value; };

test('ledges stand at real cliffs and stay off towns, roads, docks and bridges', () => {
  let total = 0;
  for (const [id, world] of Object.entries(worlds)) {
    const { stones, lips } = run(world);
    total += stones.length;
    for (const s of stones) {
      assert.ok(Number.isFinite(s.x + s.y + s.z + s.sx + s.sy + s.sz + s.ry), `${id}: finite stone`);
      assert.ok(s.v >= 0 && s.v < art.stones.variants, `${id}: variant index`);
      assert.ok(!world.isSafe(s.x, s.z), `${id}: stone in a safe area at ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
      assert.ok(!world.dockAt(s.x, s.z), `${id}: stone on a dock`);
      assert.ok(!world.onBridge?.(s.x, s.z), `${id}: stone on a bridge`);
    }
    // every lip is the top of a wall at least minWall high, with its foot within a few metres
    for (const l of lips) {
      const [fx, fz, fy] = l.foot;
      assert.ok(l.y - fy >= art.stones.ledge.minWall, `${id}: a lip at ${l.x.toFixed(1)},${l.z.toFixed(1)} drops ${(l.y - fy).toFixed(2)} m`);
      assert.ok(Math.hypot(fx - l.x, fz - l.z) < 10, `${id}: the foot is close below the lip`);
      assert.ok(Math.abs(world.groundY(fx, fz) - fy) < 1e-6, `${id}: the foot is on the ground`);
    }
  }
  assert.ok(total > 100, `the plateaus get ledges (${total} stones)`);
});

test('the ledges are the same every load', () => {
  for (const world of Object.values(worlds)) assert.deepEqual(run(world), run(world));
});

test('stone variants are shared, closed outlines and coloured faces', () => {
  const v = stoneVariants();
  assert.equal(v, stoneVariants(), 'built once');
  for (const { geo, hull } of [...v.blocks, ...v.boulders]) {
    assert.ok(geo.userData.shared && hull.userData.shared);
    assert.equal(geo.attributes.color.count, geo.attributes.position.count);
    assert.ok(hull.index, 'the hull shares its corners, so its outline push stays closed');
  }
});
