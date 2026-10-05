// Data integrity: every reference in data/*.json points at something that exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';

const matIds = new Set(Object.keys(data.items.materials));

test('monster drops reference real materials', () => {
  for (const [id, m] of Object.entries(data.monsters.monsters))
    for (const d of m.drops) assert.ok(d.item === 'gold' || matIds.has(d.item), `${id} drops unknown ${d.item}`);
  for (const [zone, drops] of Object.entries(data.world.zoneDrops)) if (zone !== '_doc') for (const d of drops) assert.ok(matIds.has(d.item), `zone ${zone} drops ${d.item}`);
});

test('recipes reference real results, materials and options', () => {
  for (const [id, r] of Object.entries(data.recipes.recipes)) {
    for (const k of Object.keys(r.cost)) assert.ok(k === 'gold' || matIds.has(k), `${id} costs unknown ${k}`);
    if (r.type === 'gear') {
      assert.ok(data.items.gearBases[r.result], `${id} result`);
      for (const o of r.optionPool) assert.ok(data.items.gearOptions[o], `${id} option ${o}`);
    }
    if (r.type === 'skill') assert.ok(data.skills.combat[r.result], `${id} skill`);
    if (r.type === 'movement') assert.ok(data.skills.movement[r.result], `${id} movement`);
    if (r.type === 'mod') assert.ok(data.mods.mods[r.result], `${id} mod`);
  }
});

test('every material is used by something (drops are never NPC junk only)', () => {
  const used = new Set();
  for (const r of Object.values(data.recipes.recipes)) for (const k of Object.keys(r.cost)) used.add(k);
  for (const s of data.progression.skillUpgrade.steps) for (const k of Object.keys(s)) used.add(k);
  for (const c of Object.values(data.items.gradeUpgrade.cost)) for (const k of Object.keys(c)) used.add(k);
  for (const c of data.progression.modUpgrade.cost) for (const k of Object.keys(c)) used.add(k);
  for (const c of data.items.upgrade.cost) for (const k of Object.keys(c)) used.add(k);
  for (const id of matIds) assert.ok(used.has(id), `${id} has no use`);
});

test('job tree links are symmetric and reachable from the origin', () => {
  const nodes = data.jobtree.nodes;
  for (const [id, n] of Object.entries(nodes)) for (const l of n.links) assert.ok(nodes[l].links.includes(id), `${id} <-> ${l}`);
  const seen = new Set([data.jobtree.origin]);
  const queue = [data.jobtree.origin];
  while (queue.length) for (const l of nodes[queue.shift()].links) if (!seen.has(l)) seen.add(l) && queue.push(l);
  assert.equal(seen.size, Object.keys(nodes).length);
});

test('start loadout is valid', () => {
  const st = data.progression.start;
  for (const s of st.slots) if (s) assert.ok(st.skills[s], `slot skill ${s} is learned`);
  assert.ok(st.movementSkills.includes(st.movement));
  assert.equal(st.slots.length, data.progression.slotCount);
});

test('every material has a sell value', () => {
  for (const [id, m] of Object.entries(data.items.materials)) assert.ok(Number.isFinite(m.value) && m.value > 0, id);
});
