import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../src/core/data-node.js';
import { createWorld } from '../../src/core/world.js';
import { Game } from '../../src/core/game.js';
import { setAggro } from '../../src/core/ai.js';
import { encounterLayout, encounterPointAllowed, zoneEncounters, encounterLevelLabel, habitatKey } from '../../src/core/encounters.js';
import { encounterCraftAudit } from '../../src/core/encounter-audit.js';
import { compareCraftRecipes, recipeEquipmentLevel, skillCraftGuide, craftDescription, recipeSearchText, craftQueryMatches } from '../../src/core/craft-order.js';

const data = loadData();
const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, wd]) => [id, createWorld(wd)]));
const original = JSON.stringify({ maps: data.maps, monsters: data.monsters, items: data.items, recipes: data.recipes, skills: data.skills, progression: data.progression });
const sorted = entries => [...entries].sort((a, b) => compareCraftRecipes(data, a, b));
const ids = entries => entries.map(([id]) => id);

for (const [mapId, world] of Object.entries(worlds)) {
  test(`${mapId}: all authored groups, counts, levels and safety constraints`, () => {
    const layout = encounterLayout(world, data), wd = world.data;
    assert.deepEqual(layout.failures, []);
    assert.equal(layout.points.length, wd.spawns.reduce((n, s) => n + s.count, 0));
    assert.deepEqual(Object.keys(data.encounters.maps[mapId].habitats).sort(), wd.spawns.map(habitatKey).sort());
    const seen = [];
    for (const point of layout.points) {
      const source = wd.spawns[point.group];
      assert.equal(point.monster, source.monster);
      assert.equal(point.zone, world.zoneAt(point.x, point.z).id);
      assert.deepEqual(point.level, source.level);
      // packmates stand closer than the spacing rule, inside the pack radius around its leader
      const mates = point.pack ? seen.filter(p => p.pack === point.pack) : [];
      assert.ok(encounterPointAllowed(world, data, source, point.x, point.z, seen.filter(p => !mates.includes(p))), JSON.stringify(point));
      if (mates.length) {
        assert.ok(Math.hypot(point.x - mates[0].x, point.z - mates[0].z) <= source.pack.radius + 1e-9, 'within the pack radius');
        for (const m of mates) assert.ok(Math.hypot(point.x - m.x, point.z - m.z) >= source.pack.spacing, 'pack spacing');
      }
      seen.push(point);
    }
    wd.spawns.forEach((s, index) => assert.equal(layout.points.filter(p => p.group === index).length, s.count, habitatKey(s)));
    assert.equal(encounterLayout(world, data), layout, 'cached immutable layout');
    const freshWorld = createWorld(wd);
    assert.deepEqual(encounterLayout(freshWorld, data), layout, 'world rebuild reproduces the same guide locations');
    assert.ok(Object.isFrozen(layout.points));
  });
  test(`${mapId}: runtime and guide share locations; bosses and respawns preserved`, () => {
    const d = { ...data, world: world.data }, g = new Game(d, { world, seed: 12345 });
    const layout = encounterLayout(world, data), normal = g.spawnPoints.filter(s => !s.boss);
    assert.equal(normal.length, layout.points.length);
    normal.forEach((s, i) => {
      const p = layout.points[i];
      assert.deepEqual([s.monster, s.zone, s.x, s.z, s.level], [p.monster, p.zone, p.x, p.z, p.level]);
      assert.equal(s.respawn, world.data.respawnSeconds);
      assert.ok(s.entity.level >= s.level[0] && s.entity.level <= s.level[1]);
    });
    const bosses = g.spawnPoints.filter(s => s.boss);
    assert.equal(bosses.length, world.data.bosses.length);
    world.data.bosses.forEach((b, i) => assert.deepEqual([bosses[i].bossId, bosses[i].monster, bosses[i].x, bosses[i].z, bosses[i].level, bosses[i].respawn],
      [b.id, b.monster, ...b.pos, [b.level, b.level], b.respawnSeconds]));
    for (const zone of world.zones) {
      const entries = zoneEncounters(world, data, zone.id), actual = g.spawnPoints.filter(p => p.zone === zone.id);
      assert.equal(entries.reduce((n, e) => n + e.count, 0), actual.length, zone.id);
      for (const e of entries) assert.equal(e.count, actual.filter(p => p.monster === e.id).length);
      if (zone.safe) assert.equal(actual.length, 0);
    }
    const snapshot = g.snapshot(), restored = new Game(d, { world, seed: 12345, character: snapshot }).snapshot();
    for (const key of ['version', 'worldId', 'worldLayoutRevision', 'gear', 'equipped', 'nextUid', 'skills', 'mods', 'movementSkills', 'progress', 'level', 'jobLevel', 'gold', 'materials'])
      assert.deepEqual(restored[key], snapshot[key], `saved ${key}`);
    assert.equal('encounterAudit' in snapshot, false, 'no encounter state enters the save');
  });
}

test('no unsafe fallback when a habitat becomes blocked', () => {
  const originalWorld = worlds['azure-harbor-v1'];
  const d = { ...data, encounters: { ...data.encounters, placement: { ...data.encounters.placement, retries: 1, attemptsPerPoint: 2 } } };
  const blocked = { ...originalWorld, isFree: () => false };
  const result = encounterLayout(blocked, d);
  assert.equal(result.points.length, 0);
  assert.equal(result.failures.reduce((n, f) => n + f.missing, 0), result.planned);
});

test('equipment sorting uses recipe metadata, then slot/type/name; no file-order dependency', () => {
  const entries = Object.entries(data.recipes.recipes).filter(([, r]) => r.type === 'gear');
  const ordered = sorted(entries), levels = ordered.map(([, r]) => recipeEquipmentLevel(data, r));
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  assert.deepEqual(ids(ordered), ids(sorted([...entries].reverse())));
  const fixture = { type: 'gear', result: entries[0][1].result, itemLevel: 31 };
  assert.equal(recipeEquipmentLevel(data, fixture), 31, 'recipe itemLevel overrides base');
  assert.ok(compareCraftRecipes(data, ['z', fixture], entries[0]) > 0);
  // A comparator must remain transitive even when an audit supplies mixed recipe kinds.
  const mixed = Object.entries(data.recipes.recipes);
  assert.deepEqual(ids(sorted(mixed)), ids(sorted([...mixed].reverse())));
});

test('search and craftable filtering preserve the canonical subsequence', () => {
  const entries = sorted(Object.entries(data.recipes.recipes).filter(([, r]) => r.type === 'gear'));
  const ready = ([, r]) => Object.keys(r.cost).every(m => ['gold', 'salt_gel', 'crab_shell'].includes(m));
  const searched = entries.filter(([id, r]) => craftQueryMatches(recipeSearchText(data, id, r), 'crab'));
  assert.ok(searched.length > 0);
  assert.deepEqual(ids(searched), ids(sorted(searched)));
  assert.deepEqual(ids(entries.filter(ready)), ids(sorted(entries.filter(ready))));
  assert.equal(craftQueryMatches('น้ำพุ ฟื้นฟู เวท', 'ฟื้นฟู เวท'), true);
  assert.equal(craftQueryMatches('น้ำพุ ฟื้นฟู เวท', 'ฟื้นฟู ธนู'), false);
});

test('mechanical skill stages include early support and expose real timing/weapon conditions', () => {
  const all = Object.entries(data.recipes.recipes).filter(([, r]) => r.type === 'skill');
  const ordered = sorted(all), stages = ordered.map(([, r]) => skillCraftGuide(data, r).stage);
  assert.deepEqual(stages, [...stages].sort((a, b) => a - b));
  assert.equal(skillCraftGuide(data, data.recipes.recipes.learn_healing_spring).stage, 0);
  assert.equal(skillCraftGuide(data, data.recipes.recipes.learn_war_cry).stage, 0);
  assert.equal(skillCraftGuide(data, data.recipes.recipes.learn_hex).stage, 1);
  assert.equal(skillCraftGuide(data, data.recipes.recipes.learn_spirit_wolf).stage, 1, 'autonomous summon is not falsely ranked as micromanagement');
  assert.equal(skillCraftGuide(data, data.recipes.recipes.learn_stone_burst).stage, 2);
  assert.equal(skillCraftGuide(data, data.recipes.recipes.learn_venom_mire).stage, 2);
  assert.match(skillCraftGuide(data, data.recipes.recipes.learn_whirl_blade).playstyle, /ดาบ/);
  assert.match(skillCraftGuide(data, data.recipes.recipes.learn_stone_burst).condition, /0\.55/);
  assert.match(craftDescription(data, data.recipes.recipes.learn_war_cry), /18%/);
  assert.equal(data.skills.combat.war_cry.damageBuff, 0.18);
});

test('all recipe materials have an actual monster source; later sources are reported, not retuned', () => {
  const audit = encounterCraftAudit(data, worlds);
  assert.equal(audit.recipes.length, Object.keys(data.recipes.recipes).length);
  assert.deepEqual(audit.summary.missingMaterials, []);
  const gale = audit.recipes.find(r => r.id === 'gale_boots');
  assert.equal(gale.equipmentLevel, 16);
  assert.equal(gale.materials.find(m => m.material === 'dusk_pelt').firstMonsterLevel, 20);
  assert.equal(gale.review, true);
  assert.equal(encounterLevelLabel(zoneEncounters(worlds['frontier-wilds-v1'], data, 'ruins')), 'Lv.21–25');
});

test('placement, listing and audit never mutate content, wear requirements or progression', () => {
  assert.equal(JSON.stringify({ maps: data.maps, monsters: data.monsters, items: data.items, recipes: data.recipes, skills: data.skills, progression: data.progression }), original);
});

test('a pack spawns together and wakes together', () => {
  const world = worlds['moonroot-grove-v1'], wd = world.data, layout = encounterLayout(world, data);
  wd.spawns.forEach((s, index) => {
    if (!s.pack) return;
    const packs = Map.groupBy(layout.points.filter(p => p.group === index), p => p.pack);
    assert.equal(packs.size, Math.ceil(s.count / s.pack.size), `${s.zone}: packs`);
    for (const members of packs.values()) assert.ok(members.length <= s.pack.size);
  });
  const g = new Game({ ...data, world: wd }, { world, seed: 7 });
  const pack = layout.points.find(p => p.pack).pack;
  const members = g.monsters.filter(m => m.spawn?.pack === pack);
  assert.ok(members.length > 2, 'the pack is spawned');
  setAggro(g, members[0], g.player);
  for (const m of members) assert.ok(m.aggro, 'every packmate in range joins in');
  assert.ok(g.monsters.filter(m => m.spawn?.pack && m.spawn.pack !== pack).every(m => !m.aggro), 'other packs stay calm');
});
