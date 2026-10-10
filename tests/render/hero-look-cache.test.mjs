import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedHeroLook } from '../../src/render/hero-look-cache.js';

test('stable hero avoids repeated inventory-derived gear scans, while equipment and arrow refreshes apply immediately', () => {
  let scans = 0;
  const look = { hair: '#123456', eyes: '#000000' };
  const game = { ch: { appearance: look, equipped: { weapon: 1, offhand: null } }, derived: {},
    gearLook() { scans++; return { bases: { weapon: this.ch.equipped.weapon }, offhand: this.arrow ? 'quiver' : null }; } };
  const view = { heroLookKey: null };
  const update = () => { const result = cachedHeroLook(view, game, look); view.heroLookKey = result.key; return result; };
  const first = update();
  for (let i = 0; i < 1000; i++) assert.equal(update(), first);
  assert.equal(scans, 1, 'one inventory scan over 1001 unchanged render updates');
  game.ch.equipped.weapon = 2;
  assert.equal(update().gear.bases.weapon, 2);
  assert.equal(scans, 2);
  game.arrow = true; game.derived = {};
  assert.equal(update().gear.offhand, 'quiver', 'arrow-type/stat refresh invalidates appearance');
  assert.equal(scans, 3);
  look.hair = '#654321';
  assert.equal(JSON.parse(update().key)[0].hair, '#654321', 'same-object appearance edit applies this frame');
  delete look.eyes;
  assert.equal('eyes' in JSON.parse(update().key)[0], false);
  look.face = { mouth: .1 }; update();
  look.face.mouth = .4;
  assert.equal(JSON.parse(update().key)[0].face.mouth, .4, 'nested appearance extensions cannot go stale');
});

test('async model invalidation and character/session replacement revalidate the exact hero look key', () => {
  let scans = 0;
  const view = { heroLookKey: null }, look = { hair: '#123456' };
  const game = { ch: { equipped: { weapon: 1 } }, derived: {}, gearLook() { scans++; return { bases: { weapon: this.ch.equipped.weapon } }; } };
  const a = cachedHeroLook(view, game, look); view.heroLookKey = a.key;
  assert.equal(cachedHeroLook(view, game, look), a);
  view.heroLookKey = null;
  const b = cachedHeroLook(view, game, look); view.heroLookKey = b.key;
  assert.notEqual(b, a); assert.equal(scans, 2, 'model-ready invalidation is respected');
  game.ch = { equipped: { weapon: 3 } };
  const c = cachedHeroLook(view, game, look); view.heroLookKey = c.key;
  assert.equal(c.gear.bases.weapon, 3);
  const other = { ...game, derived: {} };
  assert.notEqual(cachedHeroLook(view, other, look), c, 'new game cannot borrow stale cache ownership');
});
