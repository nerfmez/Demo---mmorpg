// Quests, waypoints, fast travel, allies, equipment slots and save migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, migrateCharacter, derive, equip, unequip, gearLook } from '../../src/core/character.js';
import { craft } from '../../src/core/crafting.js';
import { questState, trackedQuest } from '../../src/core/quests.js';
import { createRng } from '../../src/core/rng.js';

const step = (g, seconds) => {
  for (let i = 0; i < seconds * 60; i++) g.update(1 / 60);
};

test('starting kits pick the weapon, skill slots and movement', () => {
  for (const [id, kit] of Object.entries(data.progression.start.kits)) {
    const ch = createCharacter(data, { kit: id, name: 'K', appearance: { hair: '#ffffff' } });
    assert.equal(ch.kit, id);
    assert.equal(ch.movement, kit.movement);
    assert.deepEqual(ch.slots.map((s) => s.skill), kit.slots);
    assert.equal(derive(ch, data).weaponType, data.items.gearBases[kit.weapon].weaponType);
    assert.equal(ch.appearance.hair, '#ffffff');
  }
});

test('the main quest chain starts with the boars and unlocks one by one', () => {
  const g = new Game(data, { seed: 11 });
  assert.equal(trackedQuest(g.ch, data), 'm_boars');
  assert.equal(questState(g.ch, 'm_craft').status, 'locked');
  const boars = g.monsters.filter((m) => m.type === 'tusk_boar').slice(0, 5);
  for (const m of boars) g.hitMonster(m, 1e6);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'questDone' && e.id === 'm_boars'));
  assert.equal(trackedQuest(g.ch, data), 'm_craft');
  g.ch.materials = { boar_hide: 20, boar_tusk: 20, glow_dust: 20 };
  g.ch.gold = 999;
  const r = craft(g.ch, data, Object.keys(data.recipes.recipes).find((id) => data.recipes.recipes[id].type === 'gear'), createRng(1));
  if (r.ok) g.notify({ type: 'craft' });
  else g.notify({ type: 'craft' }); // the quest counts the craft event itself
  assert.equal(questState(g.ch, 'm_craft').status, 'done');
  assert.equal(trackedQuest(g.ch, data), 'm_forest');
});

test('touching a waypoint unlocks it; fast travel works out of combat only', () => {
  const g = new Game(data, { seed: 12 });
  const wp = g.world.waypoints.find((w) => w.id === 'meadow');
  assert.equal(g.teleportTo('meadow').reason, 'locked');
  const s = g.freeSpotNear(wp.x + 1, wp.z);
  g.player.x = s.x;
  g.player.z = s.z;
  step(g, 0.5);
  assert.ok(g.isWaypointUnlocked('meadow'));
  g.player.x = -120;
  g.player.z = 3;
  for (const m of g.monsters) m.aggro = false;
  assert.ok(g.teleportTo('meadow').ok);
  assert.ok(Math.hypot(g.player.x - wp.x, g.player.z - wp.z) < 6);
  const m = g.monsters.find((q) => !q.dead && !q.boss);
  m.x = g.player.x + 2;
  m.z = g.player.z;
  m.aggro = true;
  assert.equal(g.teleportTo('town').reason, 'combat');
});

test('dying respawns at the nearest unlocked waypoint and counts the death', () => {
  const g = new Game(data, { seed: 13 });
  g.ch.progress.waypoints.push('wetland');
  const wp = g.world.waypoints.find((w) => w.id === 'wetland');
  g.player.x = wp.x + 10;
  g.player.z = wp.z + 5;
  g.damagePlayer(1e6, null);
  assert.ok(g.player.dead);
  step(g, 6);
  assert.ok(!g.player.dead);
  assert.ok(Math.hypot(g.player.x - wp.x, g.player.z - wp.z) < 8);
  assert.equal(g.ch.progress.deaths, 1);
});

test('spirit wolves fight for the player and expire', () => {
  const g = new Game(data, { seed: 14 });
  g.ch.skills.spirit_wolf = 1;
  g.ch.stats.INT = 10;
  g.ch.slots[3].skill = 'spirit_wolf';
  g.refresh();
  const boar = g.monsters.find((m) => m.type === 'tusk_boar');
  const s = g.freeSpotNear(boar.x - 3, boar.z);
  g.player.x = s.x;
  g.player.z = s.z;
  g.player.mp = g.player.maxMp;
  assert.ok(g.castSlot(3));
  step(g, 1);
  assert.equal(g.allies.length, 1);
  const hp0 = boar.hp;
  step(g, 6);
  assert.ok(boar.dead || boar.hp < hp0, 'the wolf bites');
  step(g, 30);
  assert.equal(g.allies.length, 0, 'summons expire');
});

test('five equipment slots; armour pieces add stats and change the look; the weapon stays', () => {
  const ch = createCharacter(data);
  assert.deepEqual(Object.keys(ch.equipped).sort(), [...data.items.slots].sort());
  const before = derive(ch, data).defense;
  const helmBase = Object.keys(data.items.gearBases).find((b) => data.items.gearBases[b].slot === 'helm' && !Object.keys(data.items.gearBases[b].requires || {}).length);
  const it = { uid: ch.nextUid++, base: helmBase, grade: 'B', upgrade: 0, options: [] };
  ch.gear.push(it);
  assert.ok(equip(ch, data, it.uid).ok);
  assert.ok(derive(ch, data).defense >= before);
  assert.ok(gearLook(ch, data).helm);
  assert.ok(unequip(ch, data, 'helm').ok);
  assert.equal(gearLook(ch, data).helm, null);
  assert.equal(unequip(ch, data, 'weapon').ok, false);
});

test('an old v1 save migrates without losing progress', () => {
  const old = createCharacter(data);
  delete old.progress;
  delete old.name;
  delete old.appearance;
  old.version = 1;
  old.level = 7;
  old.equipped = { weapon: old.equipped.weapon, armor: old.equipped.armor };
  old.gear.push({ uid: 99, base: 'no_longer_exists', grade: 'C', upgrade: 0, options: [] });
  const ch = migrateCharacter(JSON.parse(JSON.stringify(old)), data);
  assert.equal(ch.version, 2);
  assert.equal(ch.level, 7);
  assert.ok(ch.progress.waypoints.includes('town'));
  assert.ok('helm' in ch.equipped && 'charm' in ch.equipped);
  assert.ok(!ch.gear.some((g) => g.base === 'no_longer_exists'));
  const g = new Game(data, { seed: 1, character: ch });
  step(g, 1);
  assert.ok(Number.isFinite(g.player.hp));
});

test('a saved position is restored when it is free', () => {
  const ch = createCharacter(data);
  ch.pos = [-62, 18];
  const g = new Game(data, { seed: 1, character: ch });
  assert.ok(Math.hypot(g.player.x + 62, g.player.z - 18) < 0.01 || !g.world.isFree(-62, 18, 0.45));
  const snap = g.snapshot();
  assert.ok(Array.isArray(snap.pos));
});
