// Outfits by category (data/outfits.json): every armour, boots, gloves and helm item has its own
// look built on its category base, the cuts stay within what the base garments can show, and
// every part or headwear kind named in the data exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';
import { resolveOutfit } from '../../src/core/outfit-look.js';
import { PARTS } from '../../src/render/outfit.js';
import { PALETTE } from '../../src/render/garments.js';
import { HELM_KINDS } from '../../src/render/headwear.js';

const OUT = JSON.parse(readFileSync(new URL('../../data/outfits.json', import.meta.url)));
const G = data.items.gearBases;
const ids = (slot) => Object.keys(G).filter((id) => G[id].slot === slot);
const look = (bases) => resolveOutfit({ bases }, OUT, { tunic: '#f1e3cc' });
const HEX = /^#[0-9a-f]{6}$/i;
const TABLE = { armor: 'armor', boots: 'boots', gloves: 'gloves', helm: 'helms' };

test('every armour, boots, gloves and helm item has an outfit entry; accessories have none', () => {
  for (const [slot, table] of Object.entries(TABLE)) {
    for (const id of ids(slot)) assert.ok(OUT[table][id], `${slot} ${id}`);
    for (const id of Object.keys(OUT[table])) assert.equal(G[id]?.slot, slot, id);
  }
  for (const id of ids('charm')) for (const table of Object.values(TABLE)) assert.ok(!OUT[table][id], `${id} is not drawn`);
  for (const [id, e] of Object.entries(OUT.armor)) assert.ok(OUT.styles[e.style] && OUT.bases[OUT.styles[e.style].base], `${id}: style and base`);
  for (const [id, e] of Object.entries(OUT.helms)) assert.ok(HELM_KINDS.includes(e.kind), `${id}: headwear ${e.kind}`);
});

test('a resolved look has every colour, cut and part it needs, inside the base', () => {
  for (const armor of ids('armor')) for (const boots of [undefined, ...ids('boots')]) {
    const o = look({ armor, boots });
    for (const k of PALETTE) assert.match(o.palette[k], HEX, `${armor}/${boots} ${k}`);
    const c = o.cut;
    assert.ok(c.sleeve >= 0 && c.sleeve <= 1.05, 'sleeve');
    assert.ok(c.hem >= 0 && c.hem <= 0.16, 'hem');
    assert.ok([0, 1, 2, 3].includes(c.pattern), 'pattern');
    assert.ok(!o.skirt || (o.skirt.length > 0.1 && o.skirt.length < 0.9), `${armor}: skirt within the leg`);
    for (const p of [...o.parts, ...o.boots.parts]) assert.ok(PARTS[p], `${armor}/${boots}: part ${p}`);
    assert.ok(o.boots.len > 0 && o.boots.len < 1.3, 'boot height');
  }
  for (const gloves of ids('gloves')) {
    const g = look({ gloves }).gloves;
    for (const k of ['main', 'trim', 'accent']) assert.match(g.palette[k], HEX, `${gloves} ${k}`);
    assert.ok(g.len > 0.2 && g.len <= 0.7, `${gloves}: glove length`);
    for (const p of g.parts) assert.ok(PARTS[p], `${gloves}: part ${p}`);
  }
  for (const helm of ids('helm')) for (const v of Object.values(look({ helm }).helm.palette)) assert.match(v, HEX, helm);
});

test('the base is chosen by category, not one shared hoodie', () => {
  const base = (armor) => look({ armor }).base.name;
  assert.equal(base('travel_tunic'), 'cloth');
  assert.equal(base('hide_vest'), 'vest');
  assert.equal(base('ranger_coat'), 'coat');
  assert.equal(base('crag_plate'), 'armor');
  assert.equal(base('shell_guard'), 'armor');
  assert.equal(look({ armor: 'hide_vest' }).cut.sleeve, 0, 'a vest is sleeveless');
  assert.ok(look({ armor: 'ranger_coat' }).skirt.opening > 0, 'a coat opens at the front');
  assert.equal(look({ armor: 'travel_tunic' }).skirt.opening, 0, 'a tunic hem is closed');
  assert.ok(look({ armor: 'crag_plate' }).base.offset > look({ armor: 'travel_tunic' }).base.offset, 'armour stands off the body more than cloth');
});

test('no two items of a slot look alike', () => {
  const sigs = {
    armor: ids('armor').map((id) => { const o = look({ armor: id }); return JSON.stringify([o.base.name, o.skirt, o.palette.main, o.palette.trim, o.cut, o.parts]); }),
    boots: ids('boots').map((id) => JSON.stringify(look({ boots: id }).boots)),
    gloves: ids('gloves').map((id) => JSON.stringify({ ...look({ gloves: id }).gloves, id: 0 })),
    helm: ids('helm').map((id) => JSON.stringify({ ...look({ helm: id }).helm, id: 0 })),
  };
  for (const [slot, list] of Object.entries(sigs)) assert.equal(new Set(list).size, list.length, slot);
});

test('layers merge in order; "$tunic" follows the chosen colour; shoes follow the boots', () => {
  const plain = resolveOutfit({}, OUT, { tunic: '#123456' });
  assert.equal(plain.boots.id, 'travel_boots', 'no boots: the travel boots');
  assert.equal(plain.gloves, null);
  assert.equal(plain.helm, null);
  const o = look({ armor: 'crag_plate', boots: 'gale_boots' });
  assert.ok(o.parts.includes('chestPlate') && o.parts.includes('belt'));
  assert.equal(o.palette.shoes, OUT.boots.gale_boots.palette.main);
  assert.equal(look({ armor: 'wardenstalker_coat' }).skirt.length, OUT.armor.wardenstalker_coat.skirt.length, 'the item overrides its base skirt');
});
