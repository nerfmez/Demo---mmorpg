// The bigger map: terrain heights, cliffs, ramps, bridges, zones and waypoints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyData as data } from './helpers.js';
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
  const below = world.terrainY(90, 40);
  assert.ok(top - below > 2, `plateau ${top.toFixed(2)} vs ${below.toFixed(2)}`);
  const rv = data.world.river.points[3];
  assert.ok(world.terrainY(rv[0], rv[1]) < world.waterLevel);
});

test('steep cliffs block walking uphill but a road ramp does not', () => {
  // find a steep spot around the ruins plateau
  let blocked = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const pl = data.world.terrain.plateaus.find((q) => q.id === 'ruins');
    const [rx, rz] = [pl.x, pl.z];
    const x = rx + Math.sin(a) * pl.rx;
    const z = rz + Math.cos(a) * pl.rz;
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

test('the sea lies south of a sandy beach; the coast is walkable up to the water', () => {
  for (const x of [-150, -40, 60, 150]) {
    const sz = world.shoreZ(x);
    assert.ok(world.isWater(x, sz + 4), 'sea past the shore');
    assert.ok(!world.isWater(x, sz - 6), 'beach before it');
    assert.ok(world.terrainY(x, sz - 6) > world.waterLevel);
    assert.ok(world.terrainY(x, sz + 20) < world.waterLevel - 1, 'the sea gets deep');
  }
  const wp = world.waypoints.find((w) => w.id === 'coast');
  assert.equal(world.zoneAt(wp.x, wp.z).id, 'coast');
});

test('the map is open: trees and rocks leave most of the ground free', () => {
  let free = 0;
  let total = 0;
  for (let x = world.bounds.minX + 10; x < world.bounds.maxX - 10; x += 5)
    for (let z = world.bounds.minZ + 10; z < world.bounds.maxZ - 10; z += 5) {
      if (world.isWater(x, z)) continue;
      total++;
      if (world.isFree(x, z, 1)) free++;
    }
  assert.ok(free / total > 0.85, `free ground ${((free / total) * 100).toFixed(0)}%`);
});

test('the shallow stream can be crossed both ways away from either bridge', () => {
  for (const z of [-110, -51, 45, 96, 128]) {
    const ps=data.world.river.points;
    const i=ps.findIndex((p,j)=>j>0 && z>=ps[j-1][1] && z<=p[1]);
    const a=ps[i-1],b=ps[i],cx=a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]);
    assert.ok(!world.onBridge(cx,z));
    assert.ok(world.isWater(cx,z),'still reads as a stream');
    assert.ok(world.isFree(cx,z,.45),'shallow water allows walking');
    assert.ok(world.waterLevel-world.terrainY(cx,z)<=.23,'ankle-deep bed');
    for(const direction of [-1,1]){
      let p={x:cx-direction*7,z};
      for(let step=0;step<56;step++)p=world.move(p.x,p.z,.45,direction*.25,0);
      assert.ok(direction*(p.x-cx)>6.8,`crossing at z=${z}, direction=${direction}`);
    }
  }
  assert.ok(!world.isFree(-40,world.shoreZ(-40)+5,.45),'deep sea remains blocked');
  assert.ok(!world.isFree(76.8,48,.45),'pond remains blocked');
});

test('the sandy beach has shells instead of meadow plants and the map has no pines', () => {
  for(const kind of ['grass','flowers','bushes','ferns','mushrooms','reeds']){
    assert.ok(world.decor[kind].every(p=>!world.isBeach(p.x,p.z,2.5)),`${kind} stays inland`);
  }
  assert.ok(world.decor.shells.length>30);
  assert.deepEqual(new Set(world.decor.shells.map(s=>s.kind)),new Set(['fan','spiral']));
  for(const shell of world.decor.shells){
    assert.ok(world.isBeach(shell.x,shell.z,2.5));
    assert.ok(!world.isWater(shell.x,shell.z));
  }
  assert.ok([...world.circles,...world.decor.edgeTrees].every(t=>t.type!=='pine'));
});

test('land monsters still spawn on dry ground when the stream is walkable', () => {
  for (const seed of [1,9]) {
    const game=new Game(data,{seed,world});
    for(const spawn of game.spawnPoints.filter(s=>!s.boss)) {
      assert.ok(!world.isWater(spawn.x,spawn.z,.45),`${spawn.monster} spawned in water, seed ${seed}`);
    }
  }
});
