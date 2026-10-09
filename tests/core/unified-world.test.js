import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createWorld } from '../../src/core/world.js';
import { createUnifiedWorld } from '../../src/core/unified-world.js';
import { OpenWorldGame } from '../../src/core/open-world-game.js';
import { rollDrops } from '../../src/core/crafting.js';
import { questState } from '../../src/core/quests.js';

const AZURE = 'azure-harbor-v1', FRONTIER = 'frontier-wilds-v1', GROVE = 'moonroot-grove-v1';
const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, map]) => [id, createWorld(map)]));
const make = (id = AZURE, character = null) => new OpenWorldGame({ ...data, world: data.maps[id] }, { worlds, world: worlds[id], character, seed: 61 });
const advance = (g, seconds) => { for (let i = 0; i < seconds * 60; i++) g.update(1 / 60); };
const fixtureWorld = (id, bounds, overrides = {}) => ({
  data: { id, bounds, atlas: { offset: [0, 0] }, terrain: { maxWalkSlope: 1 } }, bounds,
  circles: [], boxes: [], waypoints: [], exits: [], zones: [], roads: [], landmarks: [], docks: [], bridges: [], decor: {},
  blocksWater: () => false, groundY: () => 0, tooSteep: () => false,
  move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }),
  ...overrides,
});

test('actor footprints find circle and box colliders across collision gridlines', () => {
  for (const collider of [{ x: 8.5, z: 0, r: .2 }, { x: 8.5, z: 0, hx: .2, hz: .2, angle: 0 }]) {
    const source = fixtureWorld('test', { minX: -16, maxX: 32, minZ: -16, maxZ: 16 },
      collider.hx === undefined ? { circles: [collider] } : { boxes: [collider] });
    const w = createUnifiedWorld({ test: source }, 'test');
    assert.equal(w.isFree(7.9, 0, .45), false, 'centre is in cell 0 but footprint overlaps collider in cell 1');
    assert.equal(w.isFree(7.7, 0, .45), true);
    const moved = w.move(7.3, 0, .45, .6, 0);
    assert.equal(moved.blocked, true, 'unsafe native centre-cell movement must use union sliding');
    assert.ok(w.isFree(moved.x, moved.z, .45));
    assert.ok(moved.x < 7.9);
  }
});

test('water clearance checks a neighboring region before a dry actor centre crosses the join', () => {
  const dry = fixtureWorld('dry', { minX: -16, maxX: 8, minZ: -16, maxZ: 16 });
  const wet = fixtureWorld('wet', { minX: 8, maxX: 32, minZ: -16, maxZ: 16 }, { blocksWater: () => true });
  const w = createUnifiedWorld({ dry, wet }, 'dry');
  assert.equal(w.regionAt(7.9, 0).id, 'dry');
  assert.equal(w.blocksWater(7.9, 0, .45 * .3), true);
  assert.equal(w.isFree(7.9, 0, .45), false);
  assert.equal(w.isFree(7.7, 0, .45), true, 'clearance stays identical to native r*.3');
  assert.equal(w.isFree(7.9, 0, .45, { ignoreWater: true }), true);
  const moved = w.move(7.7, 0, .45, .25, 0);
  assert.equal(moved.blocked, true);
  assert.ok(w.isFree(moved.x, moved.z, .45));
});

test('one rules world dispatches heights and collisions to unchanged native regional layouts', () => {
  const unified = createUnifiedWorld(worlds, AZURE);
  assert.deepEqual(unified.seams, [], 'there are no simulation seam triggers');
  for (const [id, native] of Object.entries(worlds)) {
    for (const wp of native.waypoints) {
      const [x, z] = unified.scenePoint(id, wp.x, wp.z + 2.2);
      const local = unified.localPoint(id, x, z);
      assert.ok(Math.hypot(local[0] - wp.x, local[1] - wp.z - 2.2) < 1e-10);
      assert.equal(unified.regionAt(x, z).id, id);
      assert.ok(Math.abs(unified.groundY(x, z) - native.groundY(wp.x, wp.z + 2.2)) < 1e-10);
      assert.equal(unified.isFree(x, z, .45), native.isFree(wp.x, wp.z + 2.2, .45));
    }
  }
  assert.equal(unified.isFree(-400, 160, .45), false, 'the exterior notch is not part of the world');
  assert.equal(unified.isFree(unified.bounds.minX - 1, -100, .45), false);
});

test('coordinate-bearing query results use the same fixed objects as combined world collections', () => {
  const w = createUnifiedWorld(worlds, FRONTIER);
  for (const [id, native] of Object.entries(worlds)) {
    const wp = native.waypoints[0], [x, z] = w.scenePoint(id, wp.x, wp.z);
    const zone = w.zoneAt(x, z);
    assert.equal(zone.worldId, id);
    assert.equal(zone, w.zoneById(native.zoneAt(wp.x, wp.z).id, id));
    assert.ok(w.zones.includes(zone));
    for (const dock of native.docks) {
      const [dx, dz] = w.scenePoint(id, dock.x, dock.z), result = w.dockAt(dx, dz);
      assert.ok(w.docks.includes(result));
      assert.equal(result.worldId, id);
      const source = native.dockAt(dock.x, dock.z);
      assert.deepEqual([result.x, result.z], w.scenePoint(id, source.x, source.z));
    }
    for (const bridge of native.bridges) {
      const [bx, bz] = w.scenePoint(id, bridge.x, bridge.z), result = w.bridgeAt(bx, bz);
      assert.ok(w.bridges.includes(result));
      assert.equal(result.worldId, id);
      assert.equal(w.deckY(result, 0), native.deckY(native.bridgeAt(bridge.x, bridge.z), 0));
    }
  }
});

test('walking and combat cross all authored joins without travel gates, teleports or actor replacement', () => {
  const g = make(), world = g.world;
  const sourceMonster = g.monsters.find(m => m.worldId === AZURE);
  const destinationMonster = g.monsters.find(m => m.worldId === FRONTIER);
  const allIds = new Set(g.monsters.map(m => m.id));
  const spawns = g.spawnPoints, playerId = g.player.id;
  g.canCrossSeam = () => false; // renderer readiness cannot hold the player
  g.inCombat = () => true;
  [g.player.x, g.player.z] = [-159.7, -92];
  g.checkWorld();
  g.input.moveX = -1;
  advance(g, .3);
  assert.ok(g.player.x < -160, 'walked physically over the old border');
  assert.equal(g.data.world.id, FRONTIER);
  assert.equal(g.world, world, 'the rules world itself is stable');
  assert.equal(g.player.id, playerId);
  assert.equal(g.spawnPoints, spawns);
  assert.ok(g.monsters.includes(sourceMonster) && g.monsters.includes(destinationMonster));
  assert.deepEqual(new Set(g.monsters.map(m => m.id)), allIds);
  assert.equal(g.travelled, undefined);
  const events = g.drainEvents();
  assert.ok(events.some(e => e.type === 'worldChanged' && e.to === FRONTIER && e.seamless && e.shift.every(n => n === 0)));
  assert.ok(!events.some(e => e.type === 'travel' || e.type === 'travelRefused'));
  for (const [from, to, nativePoint, direction] of [
    [FRONTIER, GROVE, [223.7, -67.5], [1, 0]],
    [GROVE, AZURE, [-12, 58.2], [0, 1]],
  ]) {
    [g.player.x, g.player.z] = g.scenePoint(from, ...nativePoint);
    g.activateRegion(from);
    [g.input.moveX, g.input.moveZ] = direction;
    advance(g, .3);
    assert.equal(g.data.world.id, to);
    assert.equal(g.world, world);
    assert.ok(g.monsters.includes(sourceMonster));
  }
});

test('active projectiles, areas and summons retain identity on a walking region change', () => {
  const g = make();
  [g.player.x, g.player.z] = [-159.9, -92];
  const projectile = { id: 9001, x: -160, z: -92 }, area = { id: 9002, x: -160, z: -92 };
  const ally = { id: 9003, x: -159, z: -92, life: 20 }, drop = { id: 9004, x: -158, z: -92, t: 2 };
  g.projectiles.push(projectile); g.areas.push(area); g.allies.push(ally); g.drops.push(drop);
  const before = [projectile.x, projectile.z, area.x, area.z, ally.x, ally.z, drop.x, drop.z];
  g.input.moveX = -1;
  g.updatePlayer(.05);
  assert.equal(g.data.world.id, FRONTIER);
  assert.ok(g.projectiles.includes(projectile) && g.areas.includes(area) && g.allies.includes(ally) && g.drops.includes(drop));
  assert.deepEqual([projectile.x, projectile.z, area.x, area.z, ally.x, ally.z, drop.x, drop.z], before);
});

test('v13 saves remain local to their region and load at the same atlas position with a different origin', () => {
  const g = make();
  const wp = worlds[FRONTIER].waypoints.find(w => w.id === 'wetland');
  [g.player.x, g.player.z] = g.scenePoint(FRONTIER, wp.x, wp.z + 2.2);
  g.activateRegion(FRONTIER);
  g.checkWorld();
  g.ch.level = 9; g.ch.gold = 456;
  g.ch.progress.maps[AZURE].waypoints.push('forest');
  const saved = JSON.parse(JSON.stringify(g.snapshot()));
  assert.equal(saved.version, 13);
  assert.equal(saved.worldId, FRONTIER);
  assert.deepEqual(saved.pos, [Math.round(wp.x * 10) / 10, Math.round((wp.z + 2.2) * 10) / 10]);
  const restored = make(FRONTIER, saved);
  const oldWorldPoint = g.worldPoint(g.player.x, g.player.z), restoredWorldPoint = restored.worldPoint(restored.player.x, restored.player.z);
  assert.ok(Math.hypot(oldWorldPoint[0] - restoredWorldPoint[0], oldWorldPoint[1] - restoredWorldPoint[1]) < .08);
  assert.equal(restored.ch.level, 9); assert.equal(restored.ch.gold, 456);
  assert.ok(restored.ch.progress.maps[AZURE].waypoints.includes('forest'));
  assert.ok(restored.ch.progress.waypoints.includes('wetland'));
  assert.deepEqual(restored.coordinateOrigin, data.maps[FRONTIER].atlas.offset);
});

test('repeated snapshots keep region metadata synchronized without shifting or resetting resident state', () => {
  const g = make(), facade = g.world, origin = [...g.coordinateOrigin], materials = g.ch.materials;
  g.ch.progress.waypoints.push('forest');
  const wp = worlds[FRONTIER].waypoints.find(w => w.id === 'wetland');
  [g.player.x, g.player.z] = g.scenePoint(FRONTIER, wp.x, wp.z + 2.2);
  const position = [g.player.x, g.player.z], monster = g.monsters[0];
  g.drainEvents();
  for (let i = 0; i < 3; i++) {
    assert.equal(g.snapshot().worldId, FRONTIER);
    assert.equal(g.data.world, data.maps[FRONTIER]);
    assert.equal(g.regionWorld, worlds[FRONTIER]);
    assert.equal(g.world.data.id, FRONTIER);
    assert.deepEqual(g.world.data.atlas.offset, origin);
    assert.deepEqual([g.player.x, g.player.z], position);
    assert.equal(g.world, facade);
    assert.equal(g.ch.materials, materials);
    assert.ok(g.monsters.includes(monster));
  }
  assert.ok(g.ch.progress.maps[AZURE].waypoints.includes('forest'));
  assert.equal(g.drainEvents().filter(e => e.type === 'worldChanged').length, 1);
  g.player.dead = true;
  assert.equal(g.snapshot().pos, null);
  assert.equal(g.world.data.id, FRONTIER);
});

test('remote waypoint teleport stays in the same simulation and does not respawn residents', () => {
  const g = make(), world = g.world, monster = g.monsters.find(m => m.worldId === GROVE);
  g.ch.progress.maps[GROVE] = { zones: [], waypoints: ['pond'] };
  assert.equal(g.teleportTo('ring', GROVE).reason, 'locked');
  assert.equal(g.teleportTo('pond', GROVE).ok, true);
  assert.equal(g.data.world.id, GROVE);
  assert.equal(g.world, world);
  assert.ok(g.monsters.includes(monster));
  const events = g.drainEvents();
  assert.ok(events.some(e => e.type === 'teleport' && e.world === GROVE));
  assert.ok(!events.some(e => e.type === 'travel'));
});

test('monster origin scopes loot and quest credit after the player crosses a regional boundary', () => {
  const g = make();
  // The same material from differently tagged monsters must use its source map's zone table.
  const scoped = { ...g.data, maps: { ...g.data.maps, [FRONTIER]: { ...g.data.maps[FRONTIER], zoneDrops: { meadow: [{ item: 'marker-frontier', chance: 1, min: 1, max: 1 }] } } }, world: { ...g.data.world, zoneDrops: { meadow: [{ item: 'marker-azure', chance: 1, min: 1, max: 1 }] } } };
  const drops = rollDrops(scoped, 'tusk_boar', 'meadow', { chance: () => true, int: min => min }, {}, FRONTIER);
  assert.ok(drops.some(d => d.item === 'marker-frontier'));
  assert.ok(!drops.some(d => d.item === 'marker-azure'));
  // h_slimes is Azure scoped. Killing an Azure slime from the next region still counts.
  const before = questState(g.ch, 'h_slimes').objectives.primary || 0;
  const m = g.monsters.find(m => m.worldId === AZURE && m.type === 'salt_slime');
  g.activateRegion(FRONTIER);
  g.killMonster(m);
  assert.ok((questState(g.ch, 'h_slimes').objectives.primary || 0) > before);
  assert.ok(g.drops.filter(d => d.worldId === AZURE).length > 0);
  const packs = g.spawnPoints.filter(s => s.pack);
  assert.ok(packs.every(s => s.pack.startsWith(s.worldId + ':')), 'pack ids cannot overlap across regions');
});

test('retained boss kills, collected loot and respawns preserve source content and lifetime save totals', () => {
  const g = make(), boss = g.monsters.find(m => m.worldId === FRONTIER && m.spawn.final), sp = boss.spawn;
  const wp = worlds[FRONTIER].waypoints.find(w => w.id === 'wetland');
  [g.player.x, g.player.z] = g.scenePoint(FRONTIER, wp.x, wp.z + 2.2);
  g.activateRegion(FRONTIER); g.recordDiscovery();
  [g.player.x, g.player.z] = [-159.6, -92];
  g.activateRegion(AZURE);
  const archive = JSON.parse(JSON.stringify(g.ch.progress.maps[FRONTIER]));
  boss.x = -160.5; boss.z = -92; // retained pursuit across the former border
  g.drainEvents();
  g.killMonster(boss); g.killMonster(boss);
  const first = g.drainEvents().find(e => e.type === 'bossDefeated');
  assert.equal(first.world, FRONTIER);
  assert.equal(first.first, true);
  assert.equal(g.data.world.id, AZURE);
  assert.equal(g.ch.progress.bossKills[sp.bossId], 1);
  assert.equal(g.ch.progress.kills[boss.type], 1);
  assert.equal(g.ch.bossKills, 1);
  const horn = g.drops.find(d => d.worldId === FRONTIER && d.item === 'warden_horn');
  assert.ok(horn);
  const quantity = horn.qty;
  horn.x = g.player.x; horn.z = g.player.z; horn.t = 1;
  g.updateDrops(.01);
  assert.equal(g.ch.progress.collected.warden_horn, quantity);
  assert.ok(g.ch.materials.warden_horn >= quantity);
  assert.deepEqual(g.ch.progress.maps[FRONTIER], archive, 'only discovery is archived; kills/collected/bossKills are v13 lifetime totals');
  g.time = sp.respawnAt;
  g.updateRespawns();
  const respawn = sp.entity;
  assert.ok(respawn && respawn.id !== boss.id);
  assert.equal(respawn.worldId, FRONTIER);
  assert.equal(respawn.zone, sp.zone);
  assert.deepEqual([respawn.x, respawn.z, respawn.homeX, respawn.homeZ], [sp.x, sp.z, sp.x, sp.z]);
  assert.equal(g.data.world.id, AZURE, 'respawning uses the retained spawn and does not select its source map');
  g.killMonster(respawn);
  assert.equal(g.drainEvents().find(e => e.type === 'bossDefeated').first, false);
  [g.player.x, g.player.z] = g.scenePoint(FRONTIER, wp.x, wp.z + 2.2);
  const saved = JSON.parse(JSON.stringify(g.snapshot()));
  assert.equal(g.snapshot().progress.bossKills[sp.bossId], 2);
  const restored = make(FRONTIER, saved);
  assert.equal(restored.ch.progress.bossKills[sp.bossId], 2);
  assert.equal(restored.ch.progress.kills[boss.type], 2);
  assert.equal(restored.ch.progress.collected.warden_horn, quantity);
  assert.equal(restored.ch.bossKills, 2);
  assert.ok(restored.ch.progress.waypoints.includes('wetland'));
});

test('far idle actors sleep while an existing fight remains active across region boundaries', () => {
  const g = make(), p = g.player;
  const asleep = g.monsters[0], fighting = g.monsters[1];
  asleep.x = p.x + g.simulationRadius + 5; asleep.z = p.z; asleep.aggro = false;
  asleep.state = 'recover'; asleep.stateT = 1; asleep.stateDur = 5;
  asleep.statuses.chill = { t: 2, slow: .2 };
  fighting.x = p.x + g.simulationRadius + 5; fighting.z = p.z + 10; fighting.aggro = true;
  fighting.state = 'recover'; fighting.stateT = 1; fighting.stateDur = 5;
  fighting.statuses.chill = { t: 2, slow: .2 };
  g.update(.05);
  assert.equal(asleep.stateT, 1, 'no distant idle AI tick');
  assert.ok(fighting.statuses.chill.t < 2, 'an active combat state is not frozen by distance');
  assert.equal(asleep.statuses.chill.t, 2);
  assert.equal(g.monsters.find(m => m.id === asleep.id), asleep, 'sleep does not destroy residents');
});

test('a replacement session can reuse the public composite world without nesting native regions', () => {
  const g = make(FRONTIER);
  const replacement = new OpenWorldGame({ ...g.data }, { world: g.world, seed: 9 });
  assert.equal(replacement.worlds[FRONTIER], worlds[FRONTIER]);
  assert.equal(replacement.regionWorld, worlds[FRONTIER]);
  assert.deepEqual(replacement.coordinateOrigin, g.coordinateOrigin);
  assert.equal(replacement.world.docks.length, Object.values(worlds).reduce((n, w) => n + w.docks.length, 0));
  const source = worlds[AZURE].docks[0];
  assert.ok(source, 'the approved harbor layout has a real authored dock');
  const ramp = replacement.world.docks.find(d => d.id === source.id && d.worldId === AZURE);
  assert.deepEqual([ramp.x, ramp.z], replacement.scenePoint(AZURE, source.x, source.z));
});
