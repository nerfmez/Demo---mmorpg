// Outfit base (data/outfits.json): every armour and boots item resolves to its own look built
// from the shared base, the cut stays within what the base garments can show, and every part
// named in the data exists in the parts library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';
import { resolveOutfit } from '../../src/core/outfit-look.js';
import { PARTS } from '../../src/render/outfit.js';
import { PALETTE } from '../../src/render/garments.js';

const OUT = JSON.parse(readFileSync(new URL('../../data/outfits.json', import.meta.url)));
const G = data.items.gearBases;
const ids = (slot) => Object.keys(G).filter((id) => G[id].slot === slot);
const look = (armor, boots) => resolveOutfit({ bases: { armor, boots } }, OUT, { tunic: '#f1e3cc' });

test('every armour and boots item has an outfit entry built on the base', () => {
  for (const id of ids('armor')) assert.ok(OUT.armor[id], `armor ${id}`);
  for (const id of ids('boots')) assert.ok(OUT.boots[id], `boots ${id}`);
  for (const id of Object.keys(OUT.armor)) assert.equal(G[id]?.slot, 'armor', id);
  for (const id of Object.keys(OUT.boots)) assert.equal(G[id]?.slot, 'boots', id);
  for (const [id, e] of Object.entries(OUT.armor)) assert.ok(OUT.styles[e.style], `${id}: style ${e.style}`);
});

test('a resolved look has every colour and cut the garments need, inside the base', () => {
  for (const a of [undefined, ...ids('armor')]) for (const b of [undefined, ...ids('boots')]) {
    const o = look(a, b);
    for (const k of PALETTE) assert.match(o.palette[k], /^#[0-9a-f]{6}$/i, `${a}/${b} ${k}`);
    const c = o.cut;
    assert.ok(c.sleeve > 0.2 && c.sleeve <= 1.05, 'sleeve');
    assert.ok(c.hem >= 0 && c.hem <= 0.16, 'the base top ends 0.16 below the hips');
    assert.ok(c.pants > 0.3 && c.pants <= 1, 'pants');
    assert.ok(c.boot > 0.4, 'boot shaft below the hips');
    assert.ok([0, 1, 2].includes(c.pattern), 'pattern');
    for (const p of o.parts) assert.ok(PARTS[p], `${a}/${b}: part ${p}`);
  }
});

test('each armour and each boots item looks different from the others', () => {
  const sig = (o) => JSON.stringify([o.palette.main, o.palette.sleeve, o.palette.trim, o.cut, o.parts]);
  const armours = ids('armor').map((id) => sig(look(id)));
  assert.equal(new Set(armours).size, armours.length, 'no two armours share a look');
  const boots = ids('boots').map((id) => { const o = look(undefined, id); return JSON.stringify([o.palette.shoes, o.palette.sole, o.cut.boot, o.parts]); });
  assert.equal(new Set(boots).size, boots.length, 'no two boots share a look');
});

test('layers merge in order: base, style, item, boots; "$tunic" follows the chosen colour', () => {
  const plain = resolveOutfit({}, OUT, { tunic: '#123456' });
  assert.equal(plain.palette.main, '#123456');
  assert.deepEqual(plain.parts.slice(0, 5), OUT.base.parts);
  assert.ok(plain.parts.includes('bootCuffs'), 'no boots: the travel boots');
  const plate = look('crag_plate', 'crag_greaves');
  assert.ok(!plate.parts.includes('bandolier'), 'an item can drop a base part');
  assert.ok(plate.parts.includes('chestPlate') && plate.parts.includes('gem') && plate.parts.includes('shinGuards'));
  assert.equal(plate.cut.boot, OUT.boots.crag_greaves.cut.boot);
  assert.equal(look('ranger_coat').cut.tails, OUT.armor.ranger_coat.cut.tails, 'the item overrides its style');
});
