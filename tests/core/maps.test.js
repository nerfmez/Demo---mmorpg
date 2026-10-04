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

test('maps are registered by id and linked both ways by walkable exits', () => {
  assert.deepEqual(Object.keys(data.maps), [AZURE, FRONTIER]);
  assert.equal(data.world, data.maps[AZURE], 'the starting map is played by default');
  const view = { ...data };
  assert.equal(selectMap(view, FRONTIER), data.maps[FRONTIER]);
  assert.equal(selectMap(view, 'unknown'), data.maps[FRONTIER], 'unknown ids keep the current map');
  for (const [id, world] of Object.entries(worlds)) {
    assert.ok(world.exits.length, id + ' has an exit');
    for (const exit of world.exits) {
      const dest = worlds[exit.to];
      assert.ok(dest, exit.id + ' leads to a known map');
      assert.ok(world.isFree(exit.x, exit.z, 0.45) && world.roadDist(exit.x, exit.z) < 3, exit.id + ' stands on a walkable road');
      assert.ok(dest.isFree(exit.arrive[0], exit.arrive[1], 0.45), exit.id + ' arrival is free');
      assert.ok(dest.exits.some((back) => back.to === id), exit.id + ' has a way back');
      for (const back of dest.exits) assert.ok(Math.hypot(back.x - exit.arrive[0], back.z - exit.arrive[1]) > back.r + 1, 'arrival is clear of the return exit');
    }
  }
});

test('travel keeps the character and swaps per-map discovery; returning restores it', () => {
  const azure = new Game(on(AZURE), { world: worlds[AZURE], seed: 3 });
  const exit = worlds[AZURE].exits[0];
  azure.ch.progress.zones.push('meadow');
  azure.ch.progress.waypoints.push('forest');
  const gold = (azure.ch.gold = 321), level = azure.ch.level, gear = azure.ch.gear.length;
  assert.equal(azure.travel(exit.id).reason, 'far');
  [azure.player.x, azure.player.z] = [exit.x, exit.z];
  assert.deepEqual(azure.nearby().exit, exit.id);
  const result = azure.travel(exit.id);
  assert.ok(result.ok);
  const ch = result.character;
  assert.equal(ch.worldId, FRONTIER);
  assert.deepEqual(ch.pos, exit.arrive);
  assert.equal(azure.snapshot().pos, ch.pos, 'a travelled game no longer writes its old position');
  assert.ok(ch.progress.maps[AZURE].zones.includes('meadow') && ch.progress.maps[AZURE].waypoints.includes('forest'));
  assert.ok(!ch.progress.waypoints.includes('forest'), 'an Azure stone does not unlock the Frontier one with the same id');
  assert.ok(ch.progress.waypoints.includes('town'), 'the destination free stone is unlocked');
  assert.ok(azure.drainEvents().some((e) => e.type === 'travel' && e.to === FRONTIER));

  const frontier = new Game(on(FRONTIER), { world: worlds[FRONTIER], character: JSON.parse(JSON.stringify(ch)), seed: 4 });
  assert.deepEqual([frontier.player.x, frontier.player.z], exit.arrive, 'arrives at the authored point');
  assert.equal(frontier.ch.gold, gold);
  assert.equal(frontier.ch.level, level);
  assert.equal(frontier.ch.gear.length, gear);
  assert.ok(frontier.spawnPoints.some((s) => s.monster === 'greyfang') || frontier.monsters.some((m) => m.type === 'greyfang'), 'the old bosses are back');
  step(frontier, 1);
  assert.ok(frontier.ch.progress.zones.includes('settlement'));
  const back = worlds[FRONTIER].exits[0];
  [frontier.player.x, frontier.player.z] = [back.x, back.z];
  const home = frontier.travel(back.id).character;
  assert.equal(home.worldId, AZURE);
  assert.ok(home.progress.zones.includes('meadow') && home.progress.waypoints.includes('forest'), 'Azure discovery restored');
  assert.ok(home.progress.maps[FRONTIER].zones.includes('settlement'), 'Frontier discovery kept for the next visit');
});

test('travel is refused while dead or in combat', () => {
  const g = new Game(on(AZURE), { world: worlds[AZURE], seed: 5 });
  const exit = worlds[AZURE].exits[0];
  [g.player.x, g.player.z] = [exit.x, exit.z];
  g.inCombat = () => true;
  assert.equal(g.travel(exit.id).reason, 'combat');
  g.inCombat = () => false;
  g.player.dead = true;
  assert.equal(g.travel(exit.id).reason, 'dead');
  assert.equal(g.ch.worldId, AZURE);
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
