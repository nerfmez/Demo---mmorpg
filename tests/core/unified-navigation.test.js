import test from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createWorld } from '../../src/core/world.js';
import { questNavigation } from '../../src/core/quest-navigation.js';
import { Scene } from 'three';
import { QuestRoute } from '../../src/render/quest-route.js';
import { Hud } from '../../src/ui/hud.js';
import { atlasView } from '../../src/ui/atlas.js';

const A = 'azure-harbor-v1', F = 'frontier-wilds-v1';
const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, map]) => [id, createWorld(map)]));
function fixedGame(initial = A) {
  const g = new Game({ ...data, world: data.maps[initial] }, { world: worlds[initial], seed: 11 });
  g.worlds = worlds;
  g.coordinateOrigin = [...data.maps[initial].atlas.offset];
  g.worldPoint = (x, z) => [x + g.coordinateOrigin[0], z + g.coordinateOrigin[1]];
  g.scenePoint = (id, x, z) => [x + data.maps[id].atlas.offset[0] - g.coordinateOrigin[0], z + data.maps[id].atlas.offset[1] - g.coordinateOrigin[1]];
  g.localPoint = (id, x, z) => [x + g.coordinateOrigin[0] - data.maps[id].atlas.offset[0], z + g.coordinateOrigin[1] - data.maps[id].atlas.offset[1]];
  g.ch.progress.quests.f_road = { status: 'active', progress: 0, objectives: { 'origin-road': 1 } };
  g.ch.progress.questJournal.trackedId = 'f_road';
  return g;
}

test('unified quest destinations stay in fixed scene coordinates across a regional change', () => {
  const g = fixedGame(), nativeMaps = JSON.stringify(data.maps);
  const [x, z] = g.scenePoint(F, 20, -20);
  [g.player.x, g.player.z] = [x, z];
  const before = questNavigation(g, 'f_road');
  assert.ok(before.remote);
  assert.deepEqual([before.x, before.z], g.scenePoint(F, before.goal.x, before.goal.z));
  g.data.world = data.maps[F];
  g.regionWorld = worlds[F];
  const after = questNavigation(g, 'f_road');
  assert.equal(after.remote, false);
  assert.deepEqual([after.x, after.z], [before.x, before.z]);
  assert.deepEqual(after.goal, before.goal);
  assert.equal(after.distance, before.distance);
  assert.equal(JSON.stringify(data.maps), nativeMaps);
});

test('a session started on a nonzero atlas origin calculates goal distance once', () => {
  const g = fixedGame(F), nav = questNavigation(g, 'f_road');
  const [px, pz] = g.worldPoint(g.player.x, g.player.z);
  assert.deepEqual([nav.x, nav.z], [nav.goal.x, nav.goal.z]);
  assert.equal(nav.distance, Math.hypot(nav.goal.worldX - px, nav.goal.worldZ - pz));
});

test('a regional change reuses the same unified ground route and cached collision search', () => {
  const g = fixedGame(), scene = new Scene();
  // Composite collision accepts scene coordinates, including the remote goal.
  g.world = { bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, data: data.world,
    isFree: () => true, groundY: () => 0, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz }) };
  const route = new QuestRoute(g, scene, { tracker: { setAttribute() {} }, toast() {} });
  route.toggle();
  for (let i = 0; route.work && i < 20000; i++) route.update(1 / 60);
  assert.ok(route.mesh);
  const mesh = route.mesh, cache = route.cache, builds = route.builds;
  g.data.world = data.maps[F];
  g.world.data = data.maps[F];
  g.regionWorld = worlds[F];
  route.update(1);
  assert.equal(route.mesh, mesh);
  assert.equal(route.cache, cache);
  assert.equal(route.builds, builds);
  route.dispose();
  assert.equal(scene.children.length, 0);
});

test('minimap center and atlas actor pins use scene coordinates after changing region', () => {
  const ctx = () => new Proxy({
    translations: [], translate(x, z) { this.translations.push([x, z]); },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => { const context = ctx(); return { getContext: () => context, toDataURL: () => 'map-image' }; } };
  try {
    const map = (id, offset) => ({ id, atlas: { offset: [offset, 0] }, nameTh: id,
      bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
      zones: [{ id: 'settlement', nameTh: id, name: id, safe: true, rects: [[-4, 4, -4, 4]] }],
      waypoints: [{ id: 'town', nameTh: id, pos: [2, 2], x: 2, z: 2 }],
      town: { centre: [0, 0], plazaRadius: 1, workbench: [2, 2], trainer: [3, 2] }, spawns: [], bosses: [] });
    const maps = { [A]: map(A, 0), [F]: map(F, 8) };
    const ruleWorld = m => ({ data: m, bounds: m.bounds, zones: m.zones, waypoints: m.waypoints,
      circles: [], boxes: [], bridges: [], roads: [], terrainY: () => 0, roadDist: () => Infinity,
      isWater: () => false, zoneAt: () => m.zones[0], zoneById: () => m.zones[0] });
    const g = fixedGame();
    g.data = { ...g.data, world: maps[F], maps, encounters: null, quests: {
      main: ['probe'], side: [], quests: { probe: { type: 'craft', count: 1, objectives: [{ id: 'primary', type: 'craft', count: 1, world: F }] } } } };
    g.worlds = Object.fromEntries(Object.entries(maps).map(([id, m]) => [id, ruleWorld(m)]));
    g.world = g.worlds[F];
    g.ch.progress.quests.probe = { status: 'active', progress: 0, objectives: {} };
    g.ch.progress.questJournal.trackedId = 'probe';
    g.player = { x: 10, z: 2, facing: 0 };
    g.monsters = []; g.allies = [];
    g.worldPoint = (x, z) => [x, z];
    g.scenePoint = (id, x, z) => [x + maps[id].atlas.offset[0], z];
    const miniContext = ctx();
    Hud.prototype.drawMinimap.call({ game: g, mini: { width: 300, getContext: () => miniContext } });
    assert.deepEqual(miniContext.translations[1], [-42, -18], 'painted map remains centered on the fixed actor');
    const html = atlasView({ game: g, sel: {} });
    assert.match(html, /class="youmark" style="left:87\.5%;top:75%;/);
    assert.match(html, /class="questmark" style="left:87\.5%;top:75%"/);
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});
