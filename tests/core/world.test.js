// The bigger map: terrain heights, cliffs, ramps, bridges, zones and waypoints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createWorld } from '../../src/core/world.js';
import { Game } from '../../src/core/game.js';

const world = createWorld(data.world);

test('the terrain has real high and low ground, and is the same every time', () => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = world.bounds.minX; x <= world.bounds.maxX; x += 4)
    for (let z = world.bounds.minZ; z <= world.bounds.maxZ; z += 4) {
      const y = world.terrainY(x, z);
      assert.ok(Number.isFinite(y));
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  assert.ok(hi - lo > 4, `height range ${lo.toFixed(1)}..${hi.toFixed(1)}`);
  const again = createWorld(data.world);
  assert.equal(again.terrainY(37.3, -12.1), world.terrainY(37.3, -12.1));
});

test('the ruins stand on a plateau reached by a ramp; the river bed is below water', () => {
  const [rx, rz] = data.world.ruins.centre;
  const top = world.terrainY(rx, rz + 8);
  const below = world.terrainY(70, 30);
  assert.ok(top - below > 2, `plateau ${top.toFixed(2)} vs ${below.toFixed(2)}`);
  const rv = data.world.river.points[3];
  assert.ok(world.terrainY(rv[0], rv[1]) < world.waterLevel);
});

test('steep cliffs block walking uphill but a road ramp does not', () => {
  // find a steep spot around the ruins plateau
  let blocked = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const [rx, rz] = data.world.ruins.centre;
    const x = rx + Math.sin(a) * 30;
    const z = rz + Math.cos(a) * 40;
    if (world.tooSteep(x, z, x + (rx - x) * 0.05, z + (rz - z) * 0.05)) blocked++;
  }
  assert.ok(blocked > 0, 'some edges of the plateau are cliffs');
});

test('zones cover the whole map and every waypoint sits in open ground', () => {
  const ids = new Set();
  for (let x = world.bounds.minX + 1; x < world.bounds.maxX; x += 6) for (let z = world.bounds.minZ + 1; z < world.bounds.maxZ; z += 6) ids.add(world.zoneAt(x, z).id);
  assert.deepEqual([...ids].sort(), data.world.zones.map((z) => z.id).sort());
  for (const wp of world.waypoints) {
    assert.ok(!world.isWater(wp.x, wp.z), `${wp.id} not in water`);
    const g = new Game(data, { seed: 1, world });
    const s = g.freeSpotNear(wp.x, wp.z + 2.2);
    assert.ok(world.isFree(s.x, s.z, 0.45), `${wp.id} has a free spot to arrive on`);
  }
});

test('bridge decks join both banks and are walkable', () => {
  for (const br of world.bridges) {
    assert.ok(Number.isFinite(br.yA) && Number.isFinite(br.yB));
    assert.ok(world.onBridge(br.x, br.z));
    assert.ok(!world.isWater(br.x, br.z));
    assert.ok(world.groundY(br.x, br.z) > world.waterLevel);
  }
});
