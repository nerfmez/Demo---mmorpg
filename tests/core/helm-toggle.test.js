// The helm show/hide toggle beside the helm slot: looks only, saved with the character.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, equip, derive, gearLook, migrateCharacter, toggleHelm } from '../../src/core/character.js';

const fund = () => { const ch = createCharacter(data); for (const k in ch.stats) ch.stats[k] = 999; return ch; };
const give = (ch, base) => { const it = { uid: ch.nextUid++, base, itemLevel: data.items.gearBases[base].itemLevel, grade: 'C', upgrade: 0, options: [] }; ch.gear.push(it); return it; };

test('a hidden helm drops out of the look but still counts for stats', () => {
  const ch = fund(), helm = give(ch, 'leather_cap');
  assert.ok(equip(ch, data, helm.uid).ok);
  assert.equal(ch.hideHelm, false);
  const shown = gearLook(ch, data), stats = derive(ch, data);
  assert.equal(shown.bases.helm, 'leather_cap');
  assert.ok(shown.helm);
  assert.deepEqual(toggleHelm(ch), { ok: true, hidden: true });
  const hidden = gearLook(ch, data);
  assert.equal(hidden.helm, null);
  assert.equal(hidden.bases.helm, undefined);
  assert.equal(hidden.helmHidden, true);
  assert.deepEqual(derive(ch, data), stats, 'stats unchanged');
  assert.equal(ch.equipped.helm, helm.uid, 'still worn');
  toggleHelm(ch);
  assert.equal(gearLook(ch, data).bases.helm, 'leather_cap');
});

test('the toggle is saved, and older saves show their helm', () => {
  const ch = fund();
  toggleHelm(ch);
  const saved = JSON.parse(JSON.stringify(ch));
  migrateCharacter(saved, data);
  assert.equal(saved.hideHelm, true, 'kept through save and load');
  const old = JSON.parse(JSON.stringify(createCharacter(data)));
  delete old.hideHelm;
  migrateCharacter(old, data);
  assert.equal(old.hideHelm, false);
});
