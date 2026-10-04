import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createWorld } from '../../src/core/world.js';
import { Game } from '../../src/core/game.js';
import { CHARACTER_VERSION, createCharacter, migrateCharacter } from '../../src/core/character.js';
import { characterMap, enterMap, selectMap } from '../../src/core/maps.js';
import { questState, refreshQuests } from '../../src/core/quests.js';

const AZURE = 'azure-harbor-v1', FRONTIER = 'frontier-wilds-v1';
// Each map is played with its own data view; the shared registry is never mutated.
const on = (id) => ({ ...data, world: data.maps[id] });
const worlds = Object.fromEntries(Object.keys(data.maps).map((id) => [id, createWorld(data.maps[id])]));
const step = (g, seconds) => { for (let i = 0; i < seconds * 60; i++) g.update(1 / 60); };

const global = (id, x, z) => [x + data.maps[id].atlas.offset[0], z + data.maps[id].atlas.offset[1]];

test('maps are registered by id and meet along open seams that agree in world space', () => {
  assert.deepEqual(Object.keys(data.maps), [AZURE, FRONTIER]);
  assert.equal(data.world, data.maps[AZURE], 'the starting map is played by default');
  const view = { ...data };
  assert.equal(selectMap(view, FRONTIER), data.maps[FRONTIER]);
  assert.equal(selectMap(view, 'unknown'), data.maps[FRONTIER], 'unknown ids keep the current map');
  for (const [id, world] of Object.entries(worlds)) {
    assert.ok(world.seams.length, id + ' has a seam');
    for (const seam of world.seams) {
      const there = worlds[seam.to], back = there.seams.find((s) => s.to === id);
      assert.ok(back, id + ' seam has a matching seam on ' + seam.to);
      const at = (w, s, along) => (s.alongX ? [along, w.bounds[s.edge]] : [w.bounds[s.edge], along]);
      // The shared edges are the same world line over the same span.
      const [a0, a1] = [at(world, seam, seam.span[0]), at(world, seam, seam.span[1])].map(([x, z]) => global(id, x, z));
      const [b0, b1] = [at(there, back, back.span[0]), at(there, back, back.span[1])].map(([x, z]) => global(seam.to, x, z));
      assert.deepEqual(a0, b0);
      assert.deepEqual(a1, b1);
      // Both maps stand on the same ground along the seam (no step, no mountain wall).
      for (let along = seam.span[0]; along <= seam.span[1]; along += 7) {
        const [x, z] = at(world, seam, along), [gx, gz] = global(id, x, z);
        const [ox, oz] = data.maps[seam.to].atlas.offset;
        assert.ok(Math.abs(world.terrainY(x, z) - there.terrainY(gx - ox, gz - oz)) < 0.08, `${id} seam step at ${along}`);
        const [px, pz] = seam.alongX ? [x, z + seam.outward * 12] : [x + seam.outward * 12, z];
        assert.ok(world.terrainY(px, pz) < world.terrainY(x, z) + 1.5, `${id} no wall past the seam at ${along}`);
      }
      // The border road is walkable on both sides and its gates are one world point.
      assert.deepEqual(global(id, ...seam.gate), global(seam.to, ...back.gate));
      const [gx, gz] = seam.gate, step = seam.alongX ? [0, -seam.outward * 2] : [-seam.outward * 2, 0];
      assert.ok(world.isFree(gx + step[0], gz + step[1], 0.45) && world.roadDist(gx + step[0], gz + step[1]) < 1, id + ' border road');
    }
  }
});

test('walking off a seam continues at the same world point on the neighbouring map, and back', () => {
  const azure = new Game(on(AZURE), { world: worlds[AZURE], seed: 3 });
  const seam = worlds[AZURE].seams[0];
  azure.ch.progress.zones.push('meadow');
  azure.ch.progress.waypoints.push('forest');
  const gold = (azure.ch.gold = 321), level = azure.ch.level, gear = azure.ch.gear.length;
  [azure.player.x, azure.player.z] = [seam.gate[0] + 2, seam.gate[1]];
  azure.input.moveX = -1; // west, into the seam
  for (let i = 0; i < 120 && !azure.travelled; i++) azure.update(1 / 60);
  assert.equal(azure.travelled, FRONTIER, 'pressing on across the seam crosses');
  const ch = azure.ch;
  const [wx, wz] = global(FRONTIER, ...ch.pos);
  assert.ok(Math.abs(wz - global(AZURE, azure.player.x, azure.player.z)[1]) < 0.2, 'same point along the seam');
  assert.ok(Math.abs(wx - global(AZURE, worlds[AZURE].bounds.minX, 0)[0]) < 1.5, 'just across the border');
  assert.equal(azure.snapshot().pos, ch.pos, 'a travelled game no longer writes its old position');
  assert.ok(ch.progress.maps[AZURE].zones.includes('meadow') && ch.progress.maps[AZURE].waypoints.includes('forest'));
  assert.ok(!ch.progress.waypoints.includes('forest'), 'an Azure stone does not unlock the Frontier one with the same id');
  assert.ok(ch.progress.waypoints.includes('town'), 'the destination free stone is unlocked');
  assert.ok(azure.drainEvents().some((e) => e.type === 'travel' && e.to === FRONTIER));

  const frontier = new Game(on(FRONTIER), { world: worlds[FRONTIER], character: JSON.parse(JSON.stringify(ch)), seed: 4 });
  assert.ok(Math.hypot(frontier.player.x - ch.pos[0], frontier.player.z - ch.pos[1]) < 1, 'arrives where it crossed');
  assert.equal(frontier.ch.gold, gold);
  assert.equal(frontier.ch.level, level);
  assert.equal(frontier.ch.gear.length, gear);
  assert.ok(frontier.spawnPoints.some((s) => s.monster === 'greyfang') || frontier.monsters.some((m) => m.type === 'greyfang'), 'the old bosses are back');
  frontier.input.moveX = 1; // east, back into Azure
  for (let i = 0; i < 120 && !frontier.travelled; i++) frontier.update(1 / 60);
  const home = frontier.ch;
  assert.equal(home.worldId, AZURE);
  assert.ok(home.progress.zones.includes('meadow') && home.progress.waypoints.includes('forest'), 'Azure discovery restored');
  assert.ok(home.progress.maps[FRONTIER].zones.includes(worlds[FRONTIER].zoneAt(...ch.pos).id), 'Frontier discovery kept for the next visit');
  assert.equal(worlds[FRONTIER].zoneAt(...ch.pos).id, 'settlement', 'the border road arrives at the outpost');
});

test('the crossing frame runs no world checks against the old map', () => {
  // Regression: a world check due in the same frame as the crossing read Azure quests
  // against the Frontier's discovery (its free "town" stone) and paid Azure's h_arrival.
  const g = new Game(on(AZURE), { world: worlds[AZURE], seed: 6 });
  const seam = worlds[AZURE].seams[0], gold = g.ch.gold;
  assert.equal(questState(g.ch, 'h_arrival').status, 'active');
  [g.player.x, g.player.z] = [seam.gate[0] + 0.05, seam.gate[1]];
  g.input.moveX = -1;
  for (let i = 0; i < 60 && !g.travelled; i++) {
    g.checkT = 0; // a world check is due every frame
    g.update(1 / 60);
  }
  assert.equal(g.travelled, FRONTIER);
  for (let i = 0; i < 30; i++) g.update(1 / 60); // frames before the reload or hand-over
  assert.equal(questState(g.ch, 'h_arrival').status, 'active', 'Azure quest untouched');
  assert.equal(g.ch.gold, gold);
  assert.ok(g.ch.progress.zones.every((z) => worlds[FRONTIER].zones.some((q) => q.id === z)), 'no Azure zone in Frontier discovery');
});

test('a seam does not cross while dead or in combat, and says why once', () => {
  const g = new Game(on(AZURE), { world: worlds[AZURE], seed: 5 });
  const seam = worlds[AZURE].seams[0];
  [g.player.x, g.player.z] = [seam.gate[0] + 1, seam.gate[1]];
  g.inCombat = () => true;
  g.input.moveX = -1;
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  assert.equal(g.ch.worldId, AZURE);
  assert.equal(g.drainEvents().filter((e) => e.type === 'travelRefused' && e.reason === 'combat').length, 1);
  assert.ok(g.player.x >= worlds[AZURE].bounds.minX, 'held at the edge');
  assert.equal(g.crossSeam(seam).reason, 'combat');
  g.inCombat = () => false;
  g.player.dead = true;
  assert.equal(g.crossSeam(seam).reason, 'dead');
});

test('map-scoped quests count only on their own map', () => {
  const ch = createCharacter(data);
  for (const id of data.quests.main.slice(0, data.quests.main.indexOf('f_road'))) questState(ch, id).status = 'done';
  // Azure has a "town" and a "forest" stone too; they must not finish Frontier steps.
  ch.progress.waypoints.push('town', 'forest');
  refreshQuests(ch, data);
  assert.equal(questState(ch, 'f_road').status, 'active');
  enterMap(ch, data, FRONTIER);
  refreshQuests(ch, on(FRONTIER));
  assert.equal(questState(ch, 'f_road').status, 'done', 'arriving unlocks the Frontier gate stone');
  assert.equal(questState(ch, 'm_forest').status, 'active');
});

test('v4 saves gain per-map discovery; a Frontier save loaded on Azure is moved, not reset', () => {
  const old = createCharacter(data);
  old.version = 4;
  delete old.progress.maps;
  old.level = 7;
  const moved = migrateCharacter(JSON.parse(JSON.stringify(old)), data);
  assert.equal(moved.version, CHARACTER_VERSION);
  assert.deepEqual(moved.progress.maps, {});
  assert.equal(moved.level, 7);

  const there = enterMap(createCharacter(data), data, FRONTIER, [-212, 1]);
  there.progress.zones.push('wolf_den');
  assert.equal(characterMap(data, there), FRONTIER, 'boot picks the saved map');
  const here = migrateCharacter(JSON.parse(JSON.stringify(there)), data);
  assert.equal(here.worldId, AZURE);
  assert.equal(here.pos, null);
  assert.ok(here.progress.maps[FRONTIER].zones.includes('wolf_den'));
  // The pre-Azure single map had no id and is not a linked map: it still relocates once.
  const legacy = { ...createCharacter(data), worldId: 'frontier', pos: [5, 5] };
  assert.equal(characterMap(data, legacy), AZURE);
  assert.equal(migrateCharacter(legacy, data).pos, null);
});

test('open world: the same session carries on in the neighbouring map without a reload', () => {
  const shared = { ...data, world: data.maps[AZURE] }; // one data view, swapped in place
  const g = new Game(shared, { world: worlds[AZURE], seed: 6 });
  const seam = worlds[AZURE].seams[0];
  [g.player.x, g.player.z] = [seam.gate[0] + 1.5, seam.gate[1]];
  const before = g.player.id, oldMonsters = g.monsters.length;
  g.input.moveX = -1;
  for (let i = 0; i < 120 && !g.travelled; i++) g.update(1 / 60);
  assert.equal(g.travelled, FRONTIER);
  assert.throws(() => g.enterWorld(worlds[AZURE]), /not travelling/);
  g.enterWorld(worlds[FRONTIER]);
  assert.equal(g.travelled, null);
  assert.equal(shared.world, data.maps[FRONTIER], 'the data view now plays the Frontier');
  assert.equal(g.world, worlds[FRONTIER]);
  assert.equal(g.player.id, before, 'same player, same session');
  assert.ok(worlds[FRONTIER].isFree(g.player.x, g.player.z, 0.45));
  assert.ok(g.monsters.length > 0 && g.monsters.length !== oldMonsters, 'Frontier monsters replace Azure ones');
  assert.ok(g.spawnPoints.some((s) => s.monster === 'greyfang'));
  const changed = g.drainEvents().find((e) => e.type === 'worldChanged');
  assert.deepEqual(changed.shift, [384, 93], 'old local -> new local shift for the renderer');
  // Keep playing: walk back east across the same seam.
  g.input.moveX = 1;
  for (let i = 0; i < 240 && !g.travelled; i++) g.update(1 / 60);
  assert.equal(g.travelled, AZURE);
  g.enterWorld(worlds[AZURE]);
  assert.equal(shared.world, data.maps[AZURE]);
  assert.ok(Math.abs(g.player.z - seam.gate[1]) < 2);
});

test('the mirrored Frontier stays walkable: every road, bridge, stone and boss arena', () => {
  const world = worlds[FRONTIER], b = world.bounds;
  for (const road of world.roads) {
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i], distance = Math.hypot(bx - ax, bz - az);
      let x = ax, z = az, started = false;
      for (let t = 0; t <= distance; t += 0.3) {
        const nx = ax + ((bx - ax) * t) / distance, nz = az + ((bz - az) * t) / distance;
        // Ends past the map edge or the seam belong to the outside / the neighbour.
        if (nx < b.minX + 1 || nx > b.maxX - 1 || nz < b.minZ + 1 || nz > b.maxZ - 1 || world.seamAt(nx, nz, 0.45)) { x = nx; z = nz; started = false; continue; }
        assert.ok(world.isFree(nx, nz, 0.45), `${road.id} blocked at ${nx.toFixed(1)},${nz.toFixed(1)}`);
        if (started) {
          assert.ok(!world.tooSteep(x, z, nx, nz), `${road.id} cliff at ${nx.toFixed(1)},${nz.toFixed(1)}`);
          const moved = world.move(x, z, 0.45, nx - x, nz - z);
          assert.ok(Math.hypot(moved.x - nx, moved.z - nz) < 0.05, `${road.id} movement interrupted at ${nx.toFixed(1)},${nz.toFixed(1)}`);
        }
        x = nx; z = nz; started = true;
      }
    }
  }
  for (const br of world.bridges) for (const side of [-1, 1]) {
    const c = Math.cos(br.angle), s = Math.sin(br.angle), end = br.hx + 1.5;
    assert.ok(!world.isWater(br.x + side * end * c, br.z - side * end * s), `${br.id} reaches a bank`);
  }
  for (const wp of world.waypoints) assert.ok(world.isFree(wp.x, wp.z + 2.2, 0.45), wp.id + ' arrival');
  for (const boss of data.maps[FRONTIER].bosses) assert.ok(world.isFree(...boss.pos, 1), boss.id + ' arena');
  // The outpost now meets Azure: the safe town is at the border, the final boss far west.
  const warden = data.maps[FRONTIER].bosses.find((x) => x.final), seam = data.maps[FRONTIER].atlas.seams[0];
  assert.ok(seam.gate[0] - warden.pos[0] > 350, 'the final boss is far from the border');
  assert.ok(world.isSafe(seam.gate[0] - 6, seam.gate[1]), 'crossing lands in the safe outpost');
});

test('one world: discovery counts and waypoint travel span every map', async () => {
  const { worldTotals, discovery, toWorld, toLocal, worldBounds } = await import('../../src/core/atlas.js');
  const g = new Game(on(AZURE), { world: worlds[AZURE], seed: 8 });
  g.ch.progress.maps[FRONTIER] = { zones: ['settlement', 'wolf_den'], waypoints: ['town', 'wetland'] };
  const t = worldTotals(g.ch, on(AZURE));
  const allZones = Object.values(data.maps).reduce((n, m) => n + m.zones.length, 0);
  assert.equal(t.zones[1], allZones, 'zones of every map count');
  assert.ok(t.zones[0] >= 2 + g.ch.progress.zones.length - 1);
  assert.deepEqual(discovery(g.ch, on(AZURE))[FRONTIER].waypoints, ['town', 'wetland']);
  assert.deepEqual(toLocal(data, FRONTIER, ...toWorld(data, FRONTIER, 10, 20)), [10, 20]);
  const [x0, x1] = worldBounds(data);
  assert.ok(x0 <= data.maps[FRONTIER].bounds.minX + data.maps[FRONTIER].atlas.offset[0] && x1 >= data.maps[AZURE].bounds.maxX);
  // A Frontier stone from Azure: locked ones refuse; an unlocked one travels.
  assert.equal(g.teleportTo('ruins', FRONTIER).reason, 'locked');
  const r = g.teleportTo('wetland', FRONTIER);
  assert.ok(r.ok);
  const stone = data.maps[FRONTIER].waypoints.find((w) => w.id === 'wetland');
  assert.deepEqual(g.ch.pos, [stone.pos[0], stone.pos[1] + 2.2]);
  assert.equal(g.ch.worldId, FRONTIER);
  assert.ok(g.drainEvents().some((e) => e.type === 'travel' && e.to === FRONTIER && !e.seam));
});

test('the border is a calm crossing: no monster spawns within the quiet band of a seam', () => {
  for (const id of Object.keys(data.maps)) {
    const g = new Game(on(id), { world: worlds[id], seed: 11 });
    const seam = worlds[id].seams[0], b = worlds[id].bounds;
    assert.ok(seam.quiet >= 40);
    for (const sp of g.spawnPoints) {
      const inside = (sp.x - b[seam.edge]) * -seam.outward;
      if (sp.z < seam.span[0] - seam.quiet || sp.z > seam.span[1] + seam.quiet) continue; // that stretch of edge is a wall, not the border
      assert.ok(inside >= seam.quiet, `${id} ${sp.monster} spawns ${inside.toFixed(1)} m from the border`);
    }
  }
});
