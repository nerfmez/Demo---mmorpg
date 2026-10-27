import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../src/core/data-node.js';
import { createWorld } from '../../src/core/world.js';
import { pondRim, pondReach, pondEdgeDistance } from '../../src/core/ponds.js';

const data = loadData();

test('a pond without a wobble is its circle', () => {
  const pond = [3, -4, 6];
  for (let a = -Math.PI; a < Math.PI; a += .3) assert.equal(pondRim(pond, a), 6);
  assert.equal(pondReach(pond), 6);
  assert.ok(Math.abs(pondEdgeDistance(pond, 3 + 5, -4) + 1) < 1e-9);
});

test('a wobbled pond has a natural rim round its mean radius, the same on every load', () => {
  const pond = [-48, 92.8, 9.5, .26], rims = [];
  for (let i = 0; i < 360; i++) rims.push(pondRim(pond, i / 360 * 2 * Math.PI - Math.PI));
  const min = Math.min(...rims), max = Math.max(...rims), mean = rims.reduce((s, r) => s + r, 0) / rims.length;
  assert.ok(max - min > 9.5 * .2, 'the outline is not a circle');
  assert.ok(min >= 9.5 * (1 - .26) - 1e-9 && max <= pondReach(pond) + 1e-9, 'within its reach');
  assert.ok(Math.abs(mean - 9.5) < .05, 'keeps its size');
  assert.deepEqual(rims, Array.from({ length: 360 }, (_, i) => pondRim([...pond], i / 360 * 2 * Math.PI - Math.PI)));
});

test('terrain, collision and water agree on every wobbled pond rim', () => {
  for (const map of Object.values(data.maps)) {
    const world = createWorld(map);
    for (const pond of (map.ponds || []).filter((p) => p[3])) {
      const [px, pz] = pond;
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * 2 * Math.PI, dx = Math.cos(a), dz = Math.sin(a), rim = pondRim(pond, Math.atan2(dz, dx));
        const inside = [px + dx * (rim - .4), pz + dz * (rim - .4)], outside = [px + dx * (rim + 1.2), pz + dz * (rim + 1.2)];
        assert.ok(world.isWater(...inside) && !world.isFree(...inside, .1), `${map.id} pond water inside its rim`);
        assert.ok(world.terrainY(...inside) < map.waterLevel, `${map.id} pond bed under the water inside its rim`);
        assert.ok(!world.isWater(...outside), `${map.id} dry past its rim`);
        // the bank rises out of the water (one Frontier pond's bank runs into an older dry dip below the
        // water line; the water mesh ends at the rim's waterline there, render/ground.js)
        assert.ok(world.terrainY(...outside) > world.terrainY(...inside), `${map.id} bank rises past its rim`);
      }
    }
  }
});
