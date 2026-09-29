import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';

const NEED = ['hips', 'spine', 'head', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftShoulder', 'rightShoulder'];

function glbJson(file) {
  const b = readFileSync(new URL('../../public/' + file, import.meta.url));
  assert.equal(b.toString('latin1', 0, 4), 'glTF');
  const len = b.readUInt32LE(12);
  return JSON.parse(b.toString('utf8', 20, 20 + len));
}

test('the VRM hero is a VRM 1.0 file the game can drive and may publish', () => {
  const entries = Object.entries(data.models.characters).filter(([, m]) => m.vrm);
  assert.ok(entries.length > 0, 'a VRM hero is registered');
  for (const [id, m] of entries) {
    const j = glbJson(m.file);
    const vrm = j.extensions.VRMC_vrm;
    assert.equal(vrm.specVersion, '1.0', id + ' is VRM 1.0');
    for (const bone of NEED) assert.ok(vrm.humanoid.humanBones[bone], id + ' has humanoid bone ' + bone);
    // the game ships this file to every visitor, so its own licence must allow redistribution
    assert.equal(vrm.meta.allowRedistribution, true, id + ' allows redistribution');
    // every expression bind points at a real morph target of a real mesh
    for (const [name, e] of Object.entries(vrm.expressions.preset)) {
      for (const b of e.morphTargetBinds || []) {
        const mesh = j.meshes[j.nodes[b.node].mesh];
        for (const p of mesh.primitives) assert.ok(b.index < (p.targets || []).length, `${id} expression ${name} bind ${b.index}`);
      }
    }
    // the expressions the game switches between (FACE_EXPRESSION in src/render/vrm-body.js)
    for (const name of ['blink', 'angry', 'surprised']) assert.ok(vrm.expressions.preset[name], id + ' keeps the ' + name + ' expression');
  }
});
