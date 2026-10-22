// Save slots in a stand-in localStorage: write/read, legacy migration, export/import codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, migrateCharacter } from '../../src/core/character.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const save = await import('../../src/save.js');

test('slots save, list, continue and delete', () => {
  store.clear();
  assert.equal(save.firstEmptySlot(), 1);
  const ch = createCharacter(data, { name: 'Mina', kit: 'staff' });
  assert.ok(save.writeSlot(2, ch));
  assert.equal(save.lastSlot(), 2);
  const list = save.listSlots();
  assert.equal(list.length, save.SLOT_COUNT);
  assert.equal(list[1].name, 'Mina');
  assert.equal(list[1].kit, 'staff');
  assert.equal(save.loadSlot(2).character.name, 'Mina');
  save.deleteSlot(2);
  assert.equal(save.loadSlot(2), null);
  assert.equal(save.lastSlot(), null);
});

test('the first demo save moves into slot 1 once', () => {
  store.clear();
  const ch = createCharacter(data);
  ch.level = 5;
  store.set('frontier-demo.save.v1', JSON.stringify({ savedAt: 1, character: ch }));
  assert.ok(save.migrateLegacy());
  assert.equal(save.loadSlot(1).character.level, 5);
  assert.equal(store.has('frontier-demo.save.v1'), false);
  assert.equal(save.migrateLegacy(), false);
});

test('export codes round-trip (Thai names included) and bad codes are refused', () => {
  store.clear();
  save.writeSlot(1, createCharacter(data, { name: 'อากิ' }));
  const code = save.exportCode(1);
  assert.ok(save.importCode(code, 3));
  assert.equal(save.loadSlot(3).character.name, 'อากิ');
  assert.equal(save.importCode('not a code', 2), false);
  assert.equal(save.loadSlot(2), null);
});


test('published previews isolate all writes, deletes and legacy migration from main saves',async()=>{
 store.clear();const main=createCharacter(data,{name:'Main'});save.writeSlot(1,main);const before=store.get('frontier.slot.1');
 globalThis.location={pathname:'/Demo---mmorpg/lab/'};
 const preview=await import('../../src/save.js?balance-preview-test');delete globalThis.location;
 assert.ok(preview.IS_PREVIEW);assert.equal(preview.loadSlot(1),null);
 assert.ok(preview.importCode(save.exportCode(1),1));const copy=preview.loadSlot(1).character;copy.name='Preview';preview.writeSlot(1,copy);
 assert.equal(save.loadSlot(1).character.name,'Main');assert.equal(preview.loadSlot(1).character.name,'Preview');
 preview.deleteSlot(1);assert.equal(store.get('frontier.slot.1'),before);assert.equal(preview.migrateLegacy(),false);
});

test('merged skills and mods keep ownership, rank, coin identity and loadout', () => {
  const ch = createCharacter(data, { kit: 'staff' });
  ch.skills = { ...ch.skills, arcane_shot: 3, arcane_bolt: 1, firebolt: 1 };
  ch.mods = [
    { uid: 501, id: 'ash_detonation', level: 2, grade: 'C' },
    { uid: 502, id: 'shatter', level: 3, grade: 'B' },
    { uid: 503, id: 'split', level: 1, grade: 'C' },
  ];
  ch.slots = [
    { skill: 'arcane_shot', mods: [503] },
    { skill: 'firebolt', mods: [501, 502] },
    { skill: null, mods: [] },
    { skill: null, mods: [] },
  ];
  const out = migrateCharacter(JSON.parse(JSON.stringify(ch)), data);
  assert.equal(out.skills.arcane_shot, undefined);
  assert.equal(out.skills.arcane_bolt, 3, 'the higher rank survives');
  assert.deepEqual(out.slots[0], { skill: 'arcane_bolt', mods: [503] }, 'slot and its coins move to the successor');
  assert.deepEqual(out.mods.map(m => [m.uid, m.id, m.level, m.grade]), [[501, 'status_burst', 2, 'C'], [502, 'status_burst', 3, 'B'], [503, 'split', 1, 'C']]);
  assert.deepEqual(out.slots[1].mods, [501], 'one slot never holds the same mod twice; the second coin returns to the bag');
  assert.deepEqual(migrateCharacter(JSON.parse(JSON.stringify(out)), data), out, 'idempotent');

  const both = createCharacter(data, { kit: 'staff' });
  both.skills = { ...both.skills, arcane_shot: 1, arcane_bolt: 2 };
  both.mods = [{ uid: 601, id: 'split', level: 1, grade: 'C' }];
  both.slots = [{ skill: 'arcane_bolt', mods: [] }, { skill: 'arcane_shot', mods: [601] }, { skill: null, mods: [] }, { skill: null, mods: [] }];
  const merged = migrateCharacter(both, data);
  assert.equal(merged.skills.arcane_bolt, 2);
  assert.deepEqual(merged.slots[1], { skill: null, mods: [] }, 'a duplicate slot empties and its coin stays owned');
  assert.ok(merged.mods.some(m => m.uid === 601));
});

test('retired Burning Ground becomes Fire Shift without two element shifts sharing a slot', () => {
  const ch = createCharacter(data, { kit: 'sword' });
  ch.skills = { ...ch.skills, slash: 2, firebolt: 1 };
  ch.mods = [
    { uid: 701, id: 'burning_ground', level: 3, grade: 'B' },
    { uid: 702, id: 'frost_shift', level: 1, grade: 'C' },
    { uid: 703, id: 'burning_ground', level: 1, grade: 'C' },
  ];
  ch.slots = [{ skill: 'slash', mods: [701, 702] }, { skill: 'firebolt', mods: [703] }, { skill: null, mods: [] }, { skill: null, mods: [] }];
  const out = migrateCharacter(JSON.parse(JSON.stringify(ch)), data);
  assert.deepEqual(out.mods.map(m => [m.uid, m.id, m.level, m.grade]), [[701, 'fire_shift', 3, 'B'], [702, 'frost_shift', 1, 'C'], [703, 'fire_shift', 1, 'C']]);
  assert.deepEqual(out.slots[0].mods, [702], 'the coin already in the slot keeps its place; the renamed one returns to the bag');
  assert.deepEqual(out.slots[1].mods, [703]);
  assert.deepEqual(migrateCharacter(JSON.parse(JSON.stringify(out)), data), out, 'idempotent');
});
