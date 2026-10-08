// Every zone of every map has a landmark of its own (data: landmarks) and its own ground cover.
// Landmarks stand in their zone on dry ground, off roads, without blocking waypoints, town
// services or monster habitats; the scatter is cleared out of them, never shifted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createWorld, zoneDecor } from '../../src/core/world.js';
import { encounterLayout } from '../../src/core/encounters.js';

const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, wd]) => [id, createWorld(wd)]));
const BUILTIN = { wreck: (wd) => wd.wreck.at, lighthouse: (wd) => wd.harbor.lighthouse, wolf_den: (wd) => wd.den.centre, ruin_ring: (wd) => wd.ruins.centre };

test('each zone has a landmark of its own kind, with a name in both languages', () => {
  const kinds = new Set(), ids = new Set();
  for (const [id, wd] of Object.entries(data.maps)) {
    for (const zone of wd.zones) assert.ok(wd.landmarks.some((l) => l.zone === zone.id), `${id}/${zone.id} has a landmark`);
    for (const l of wd.landmarks) {
      assert.ok(!kinds.has(l.kind), `${l.kind} is used once in the whole world`);
      assert.ok(!ids.has(l.id), l.id);
      kinds.add(l.kind); ids.add(l.id);
      assert.ok(l.name && l.nameTh, l.id);
      assert.equal(worlds[id].zoneAt(...l.at).id, l.zone, `${l.id} stands in its zone`);
      if (l.builtin) assert.deepEqual(l.at, BUILTIN[l.kind](wd), `${l.id} names an existing set piece`);
    }
  }
  assert.equal(kinds.size, Object.values(data.maps).reduce((n, wd) => n + wd.zones.length, 0));
});

test('landmarks stand on dry land beside the road, never on it or on a service spot', () => {
  for (const [id, w] of Object.entries(worlds)) {
    const wd = data.maps[id], t = wd.town;
    const keep = [...wd.waypoints.map((p) => p.pos), wd.playerSpawn, t.respawn, t.workbench, t.trainer, ...(t.shop ? [t.shop] : [])];
    for (const l of w.landmarks.filter((q) => !q.builtin)) {
      assert.ok(l.parts.length, l.id);
      assert.ok(w.roadDist(l.x, l.z) < 20, `${l.id} can be seen from a road`);
      for (const p of l.parts) {
        assert.ok(!w.isWater(p.x, p.z, p.r), `${l.id}: dry`);
        assert.ok(w.roadDist(p.x, p.z) > p.r + 1, `${l.id}: off the road`);
        assert.ok(!w.onBridge(p.x, p.z, p.r + 1), `${l.id}: off bridges`);
        for (const [x, z] of keep) assert.ok(Math.hypot(x - p.x, z - p.z) > p.r + 1.5, `${l.id} leaves (${x},${z}) clear`);
        assert.ok(!w.isFree(p.x, p.z, 0.2), `${l.id}: solid`);
      }
      // the scatter is lifted out of its clearing: no tree or rock grows through it
      for (const c of w.circles) if (c.type !== 'landmark' && ['tree', 'birch', 'willow', 'palm', 'rock', 'boulder', 'crystal', 'stump'].includes(c.type)) {
        assert.ok(Math.hypot(c.x - l.x, c.z - l.z) >= l.clear, `${l.id}: ${c.type} inside its clearing`);
      }
    }
    const bare = createWorld({ ...wd, landmarks: [] });
    for (const [x, z] of keep) for (let a = 0; a < 6.28; a += 0.7) {
      const px = x + Math.sin(a) * 1.6, pz = z + Math.cos(a) * 1.6;
      if (bare.isFree(px, pz, 0.45)) assert.ok(w.isFree(px, pz, 0.45), `${id} (${x},${z}) still reachable`);
    }
  }
});

test('the landmarks do not change the rest of the layout or crowd out monsters', () => {
  for (const [id, wd] of Object.entries(data.maps)) {
    const bare = createWorld({ ...wd, landmarks: [] }), w = worlds[id];
    const keyed = (list) => new Set(list.filter((c) => c.type !== 'landmark').map((c) => `${c.type}@${c.x.toFixed(3)},${c.z.toFixed(3)}`));
    const before = keyed(bare.circles), after = keyed(w.circles);
    for (const k of after) assert.ok(before.has(k), `${id}: ${k} was not moved`);
    assert.ok(before.size - after.size < 60, `${id}: only the clearings were lifted (${before.size - after.size})`);
    const layout = encounterLayout(w, data);
    if (layout) assert.deepEqual(layout.failures, [], `${id}: every monster still finds a spot`);
  }
});

test('zones in a map differ in their ground cover', () => {
  for (const [id, wd] of Object.entries(data.maps)) {
    const seen = new Map();
    for (const zone of wd.zones.filter((z) => !z.safe)) {
      const d = zoneDecor(zone);
      for (const c of d.flowers) assert.ok(Number.isInteger(c) && c >= 0 && c < 8, `${id}/${zone.id} flower ${c}`);
      const sig = JSON.stringify([[...new Set(d.flowers)].sort(), d.ferns, d.mushrooms, d.berries]);
      assert.ok(!seen.has(sig), `${id}: ${zone.id} looks like ${seen.get(sig)}`);
      seen.set(sig, zone.id);
    }
  }
});

test('the windmill sails keep turning after static batching freezes the scenery', async () => {
  const { buildLandmark } = await import('../../src/render/landmarks.js');
  const mill = buildLandmark('windmill');
  const sails = mill.getObjectByName('landmark-spinner'), mesh = sails.children.find((o) => o.children.length)?.children[0];
  mill.updateMatrixWorld(true);
  mill.traverse((o) => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; }); // as batchStaticSteps does
  const before = mesh.matrixWorld.clone();
  const now = performance.now;
  try {
    performance.now = () => 2000;
    mesh.onBeforeRender();
    assert.ok(!mesh.matrixWorld.equals(before), 'the drawn sail moved');
  } finally { performance.now = now; }
});
