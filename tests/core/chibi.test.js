import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';

// skin bones the driver retarget reads (MAP and the shoulders in src/render/skinned.js)
const NEED = ['Hips', 'Spine02', 'Spine', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
  'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftShoulder', 'RightShoulder'];

test('the opt-in chibi hero is one textured skinned mesh the driver rig can drive', () => {
  const m = data.models.characters.hero_chibi;
  assert.ok(m?.chibi, 'hero_chibi is registered as the chibi body');
  const b = readFileSync(new URL('../../public/' + m.file, import.meta.url));
  assert.equal(b.toString('latin1', 0, 4), 'glTF');
  const j = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
  assert.equal(j.skins.length, 1);
  const names = new Set(j.skins[0].joints.map((i) => j.nodes[i].name));
  for (const n of NEED) assert.ok(names.has(n), 'skin bone ' + n);
  assert.equal(j.images.length, 1, 'one painted texture (face, suit, boots)');
  assert.ok(!j.animations, 'Meshy clips are stripped: the procedural animator drives the hero');
  const tris = j.meshes.flatMap((x) => x.primitives).reduce((n, p) => n + j.accessors[p.indices].count / 3, 0);
  assert.equal(tris, m.tris);
});

test('the chibi head reshape stays a small, bounded change', () => {
  const h = data.models.characters.hero_chibi.headShape;
  assert.ok(h, 'hero_chibi has a headShape');
  for (const k of ['wide', 'chin', 'cheek']) assert.ok(h[k] >= 0 && h[k] <= 0.3, k + ' is a modest fraction');
  assert.ok(h.eye > 0 && h.eye < 1, 'eye line inside the head');
  assert.ok(h.soft >= 0 && h.soft <= 1, 'soft blends between mesh and sphere normals');
  assert.ok(h.scale === undefined || (h.scale > 0.6 && h.scale <= 1.2), 'the head scale keeps a chibi head');
  const f = data.models.characters.hero_chibi.fit;
  assert.ok(f.crotch < f.armAxis && f.armAxis < f.neck && f.neck < 1.2 && f.tip > 0.3, 'fit landmarks in order on the 1.2 m body');
});

test('the chibi painted light only lifts its shading', () => {
  const k = data.models.characters.hero_chibi.paintedLight;
  // the Meshy textures carry their own shading: a fraction of the texture glows so the toon light
  // does not darken it twice, but it never flattens the cel ramp away
  assert.ok(k === undefined || (k >= 0 && k <= 0.6), 'paintedLight is a fraction up to 0.6');
  const t = data.models.characters.hero_chibi.tint;
  assert.ok(t === undefined || (t.length === 3 && t.every((c) => c > 0.6 && c <= 1)), 'tint only warms the skin a little');
});

test('the chibi torso flatten bands are bounded', () => {
  const bands = data.models.characters.hero_chibi.flatten || [];
  for (const b of bands) {
    assert.ok(b.y0 < b.y1 && b.y0 > 0 && b.y1 < 1.2, 'band inside the 1.2 m body');
    assert.ok(Math.abs(b.z) < 0.2 && b.z !== 0, 'depth limit in front of (z > 0) or behind (z < 0) the body');
    assert.ok(b.k > 0 && b.k <= 1, 'k is a strength 0..1');
  }
});

test('the chibi face shadow and hair highlight settings are bounded', () => {
  const f = data.models.characters.hero_chibi.faceShadow;
  assert.ok(f && f.from < f.to && f.from >= 0 && f.to <= 1, 'face mask runs forward across the head');
  assert.ok(f.curve >= 0 && f.curve < 1, 'curve bows the shadow edge a little');
  const h = data.models.characters.hero_chibi_hair.highlight;
  assert.ok(h && h.at > 0 && h.at < 1 && h.width > 0 && h.width < 0.3 && h.strength > 0 && h.strength <= 1, 'hair highlight band');
});

test('the chibi helm fit sits over the hair', () => {
  const h = data.models.characters.hero_chibi.helmFit;
  assert.ok(h && h.scale > 1 && h.scale < 1.6 && h.lift >= 0 && h.lift < 0.3, 'helms larger and a little higher than the head');
});

test('the chibi hair model is a single mesh within the character budget', () => {
  const entries = Object.entries(data.models.characters).filter(([, m]) => m.chibiHair);
  assert.deepEqual(entries.map(([id]) => id), ['hero_chibi_hair']);
  let drawn = 0;
  for (const [id, m] of entries) {
    const b = readFileSync(new URL('../../public/' + m.file, import.meta.url));
    const j = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
    assert.equal(j.meshes.length, 1, id);
    assert.ok(m.color || j.images?.length === 1, id + ' a flat colour or its own painted texture');
    const tris = j.meshes[0].primitives.reduce((n, p) => n + j.accessors[p.indices].count / 3, 0);
    assert.equal(tris, m.tris, id);
    for (const k of ['width', 'depth', 'height', 'lift', 'back', 'side']) assert.ok(Number.isFinite(m.fit[k]), id + ' fit.' + k);
    if (m.box) {
      // a fixed fit box must hold the model, so the fit cannot cut it off
      const a = j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
      for (let c = 0; c < 3; c++) assert.ok(m.box[0][c] <= a.min[c] + 1e-4 && m.box[1][c] >= a.max[c] - 1e-4, id + ' box holds the model');
    }
    if (m.keep) assert.ok(['front', 'back'].includes(m.keep[0]) && m.keep[1] > 0 && m.keep[1] < 1, id + ' keep');
    drawn += tris;
  }
  // with the body it stays well inside the 8,000-tri character budget
  assert.ok(drawn + data.models.characters.hero_chibi.tris < 12000);
});

test('modelled chibi outfits are one skinned mesh on the chibi armature for a real item', () => {
  const outfits = JSON.parse(readFileSync(new URL('../../data/outfits.json', import.meta.url), 'utf8'));
  const body = data.models.characters.hero_chibi;
  const bb = readFileSync(new URL('../../public/' + body.file, import.meta.url));
  const bj = JSON.parse(bb.toString('utf8', 20, 20 + bb.readUInt32LE(12)));
  const bones = new Set(bj.skins[0].joints.map((i) => bj.nodes[i].name));
  const entries = Object.entries(data.models.characters).filter(([, m]) => m.chibiOutfit);
  assert.ok(entries.length >= 2, 'at least the travel tunic and boots');
  for (const [id, m] of entries) {
    assert.ok(['armor', 'boots', 'helm'].includes(m.chibiOutfit), id + ' piece');
    // the game finds the model by the worn item's id (hero.js: outfit_<item>)
    const table = { armor: 'armor', boots: 'boots', helm: 'helms' }[m.chibiOutfit];
    assert.ok(outfits[table][id.replace(/^outfit_/, '')], id + ' names a ' + m.chibiOutfit + ' item');
    const b = readFileSync(new URL('../../public/' + m.file, import.meta.url));
    const j = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
    if (m.chibiOutfit === 'helm') {
      // a plain textured mesh placed on the head like the hair
      assert.ok(!j.skins && j.meshes.length === 1 && j.images.length === 1, id + ' one textured mesh');
      assert.equal(j.meshes[0].primitives.reduce((n, p) => n + j.accessors[p.indices].count / 3, 0), m.tris, id);
      assert.ok(m.withHair === undefined || typeof m.withHair === 'boolean', id + ' withHair');
      continue;
    }
    assert.equal(j.skins.length, 1, id);
    for (const i of j.skins[0].joints) assert.ok(bones.has(j.nodes[i].name), id + ' joint ' + j.nodes[i].name + ' is a chibi bone');
    const nodes = j.nodes.filter((n) => n.mesh !== undefined);
    assert.equal(nodes.length, 1, id + ' one mesh');
    assert.equal(j.images.length, 1, id + ' its own painted texture');
    const tris = j.meshes[0].primitives.reduce((n, p) => n + j.accessors[p.indices].count / 3, 0);
    assert.equal(tris, m.tris, id);
    // the body faces it covers, hidden while it is worn: real triangles of the body
    const hide = JSON.parse(nodes[0].extras.hideBody);
    assert.ok(hide.length > 100 && hide.every((t) => Number.isInteger(t) && t >= 0 && t < body.tris), id + ' hideBody');
    assert.ok(tris + body.tris < 8000, id + ' with the body inside the character budget');
  }
});
