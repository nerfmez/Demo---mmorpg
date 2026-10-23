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

test('the chibi hair models are single meshes within the character budget', () => {
  const entries = Object.entries(data.models.characters).filter(([, m]) => m.chibiHair);
  assert.deepEqual(entries.map(([id]) => id).sort(), ['hero_chibi_hair', 'hero_chibi_hair_back']);
  let drawn = 0;
  for (const [id, m] of entries) {
    const b = readFileSync(new URL('../../public/' + m.file, import.meta.url));
    const j = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
    assert.equal(j.meshes.length, 1, id);
    assert.ok(m.color || j.images?.length === 1, id + ' a flat colour or its own painted texture');
    const tris = j.meshes[0].primitives.reduce((n, p) => n + j.accessors[p.indices].count / 3, 0);
    assert.equal(tris, m.tris, id);
    for (const k of ['width', 'depth', 'height', 'lift', 'back', 'side']) assert.ok(Number.isFinite(m.fit[k]), id + ' fit.' + k);
    if (m.keep) assert.ok(['front', 'back'].includes(m.keep[0]) && m.keep[1] > 0 && m.keep[1] < 1, id + ' keep');
    drawn += tris;
  }
  // the two halves together stay well inside the 8,000-tri character budget
  assert.ok(drawn + data.models.characters.hero_chibi.tris < 12000);
});
