// Save slots in a stand-in localStorage: write/read, legacy migration, export/import codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter } from '../../src/core/character.js';

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
