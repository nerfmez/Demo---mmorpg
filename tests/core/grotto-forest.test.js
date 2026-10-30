// Pearlshell Grotto and forest content (owner, 2026-10-30, docs/STATS-TH.md section 7): seven monsters with one
// fixed level range each, their materials and the gear made from them. They wait for placement (models in
// PR #170); until then they count as sources at their fixed levels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../../src/core/world.js';
import { data } from './helpers.js';
import { encounterCraftAudit } from '../../src/core/encounter-audit.js';
import { bossOnlyMaterials } from '../../src/core/balance.js';
import { rasterIconUrl } from '../../src/ui/raster-icons.js';

const M = data.monsters.monsters, G = data.items.gearBases, R = data.recipes.recipes;
const MONSTERS = { leaf_fox: [12, 14, 'foxleaf_tail'], leaf_tanuki: [14, 16, 'tanuki_fur'], stone_pangolin: [16, 19, 'pangolin_plate'],
  pearl_fish: [22, 24, 'pearl_scale'], pearl_slug: [24, 26, 'sea_slime'], eye_clam: [26, 28, 'clam_shell'] };
const GEAR = ['leafbear_coat', 'leafbear_hood', 'leafbear_gloves', 'leafbear_boots', 'snailshell_plate', 'snailshell_helm', 'snailshell_gloves', 'snailshell_greaves',
  'pearlscale_armor', 'pearlscale_crest', 'pearlscale_gloves', 'pearlscale_boots', 'leaf_axe', 'snailshell_mace', 'snailshell_shield', 'foxleaf_charm', 'golden_pearl_pendant'];

test('each new monster has its fixed levels and drops its own material; all wait for placement', () => {
  for (const [id, [lo, hi, part]] of Object.entries(MONSTERS)) {
    assert.deepEqual(M[id].levels, [lo, hi], id);
    assert.ok(M[id].drops.some((d) => d.item === part && d.chance >= 0.5), `${id} drops ${part}`);
    assert.equal(M[id].awaiting, 'placement');
    // every attack that hits has a visible wind-up (a sporecap-style hop is a move away, not a hit)
    for (const a of Object.values(M[id].attacks)) if (a.damageMult !== undefined || a.dps) assert.ok(a.windup >= 0.4, `${id}: every attack has a visible wind-up`);
  }
  // the boss: the shell shard drops every time, the golden pearl rarely (owner)
  const king = M.pearl_snail_king, drop = (item) => king.drops.find((d) => d.item === item);
  assert.ok(king.boss && king.levels[0] === 30);
  assert.equal(drop('snail_shell_shard').chance, 1);
  assert.ok(drop('golden_pearl').chance <= 0.25);
  assert.ok(bossOnlyMaterials(data).has('golden_pearl') && bossOnlyMaterials(data).has('snail_shell_shard'));
});

test('every new material and piece has its supplied icon, and every material is used', () => {
  const mats = ['pearl_scale', 'sea_slime', 'clam_shell', 'snail_shell_shard', 'golden_pearl', 'pangolin_plate', 'foxleaf_tail', 'tanuki_fur'];
  for (const id of mats) {
    assert.ok(data.items.materials[id], id);
    assert.equal(rasterIconUrl('material', id), `/assets/icons/material/${id}.png`);
    assert.ok(Object.values(R).some((r) => r.cost[id]), `${id} is used`);
  }
  for (const id of GEAR) {
    assert.ok(G[id] && R[id], id);
    assert.equal(rasterIconUrl('gear', id), `/assets/icons/gear/${id}.png`);
  }
});

test('the boss\'s set starts at its level; the grotto and forest gear can be made from its monsters inside its range', () => {
  for (const id of ['snailshell_plate', 'snailshell_mace', 'snailshell_shield']) assert.equal(G[id].itemLevel, M.pearl_snail_king.levels[0]);
  const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, wd]) => [id, createWorld(wd)]));
  const audit = encounterCraftAudit(data, worlds), boss = bossOnlyMaterials(data);
  for (const id of GEAR) {
    for (const m of audit.recipes.find((r) => r.id === id).materials) if (!boss.has(m.material)) assert.ok(m.firstMonsterLevel <= G[id].maxItemLevel, `${id}: ${m.material} first at Lv${m.firstMonsterLevel}`);
    for (const [item, n] of Object.entries(R[id].cost)) if (boss.has(item)) assert.ok(n <= 2, `${id}: ${item} is a small key`);
  }
  // the audit lists them as sources awaiting placement, never as missing
  assert.deepEqual(audit.summary.missingMaterials, []);
  assert.deepEqual(audit.summary.awaitingPlacement.sort(), [...Object.keys(MONSTERS), 'pearl_snail_king'].sort());
});
