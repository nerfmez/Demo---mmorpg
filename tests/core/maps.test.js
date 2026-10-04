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
  assert.ok(home.progress.maps[FRONTIER].zones.includes('wetland'), 'Frontier discovery kept for the next visit');
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
