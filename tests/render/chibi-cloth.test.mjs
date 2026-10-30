import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { clothGeometry, Cloth } from '../../src/render/chibi-cloth.js';

const CFG = JSON.parse(readFileSync(new URL('../../data/models.json', import.meta.url))).characters.hero_chibi.cloth;

/** A body like the chibi's: an armature in centimetres (scale 0.01), Hips at 0.594 m and a leg under it. */
function body() {
  const root = new THREE.Group(), arm = new THREE.Group();
  arm.scale.setScalar(0.01);
  const hips = new THREE.Bone(), leg = new THREE.Bone();
  hips.name = 'Hips'; leg.name = 'LeftUpLeg';
  hips.position.set(0, 59.4, 0); leg.position.set(6.5, -5.5, 0);
  hips.add(leg); arm.add(hips); root.add(arm);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([hips, leg]);
  // a skirt: rings of vertices round the hips from the waist down, half on the Hips (fit `skirt`) and
  // half on the leg below the pivot, wholly on the Hips above it
  const p = [], si = [], sw = [];
  for (const y of [0.62, 0.58, 0.54, 0.5, 0.46, 0.42]) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, r = 0.15 + (0.6 - y) * 0.3;
    p.push(Math.sin(a) * r, y, Math.cos(a) * r);
    si.push(0, 1, 0, 0); sw.push(...(y > CFG.pivot ? [1, 0, 0, 0] : [0.5, 0.5, 0, 0]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
  root.add(mesh); mesh.bind(skeleton);
  return { root, hips, mesh };
}

test('the skirt below the waist takes its Hips weight onto the cloth panels, the rest of the outfit keeps its weights', () => {
  const { mesh } = body();
  const cloth = clothGeometry(mesh.geometry, mesh.skeleton, mesh.bindMatrix, CFG);
  const g = cloth.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  assert.equal(cloth.base, 2);
  assert.equal(cloth.panels.length, CFG.panels);
  for (let i = 0; i < pos.count; i++) {
    let sum = 0, panel = 0, hips = 0, leg = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k), j = si.getComponent(i, k);
      sum += w;
      if (j >= cloth.base) { assert.ok(j < cloth.base + CFG.panels); panel += w; } else if (j === 0) hips += w; else leg += w;
    }
    assert.ok(Math.abs(sum - 1) < 1e-5, 'weights sum to 1');
    const y = pos.getY(i);
    if (y > CFG.pivot) assert.equal(panel, 0, 'nothing above the waist swings');
    else {
      assert.ok(Math.abs(leg - 0.5) < 1e-5, 'the legs keep their share, so the hem still follows them');
      assert.ok(Math.abs(panel + hips - 0.5) < 1e-5, 'the panels take over the Hips share');
      if (CFG.pivot - y >= CFG.ramp) assert.ok(panel > 0.49, 'fully below the blend');
    }
  }
  assert.ok(cloth.panels.every((p) => p.drop > 0.1 && p.drop < 0.2), 'each panel hangs to the skirt hem');
  assert.notEqual(g, mesh.geometry, 'the fitted outfit stays as it was (the shells and covered body read it)');
});

test('at rest the panel bones skin exactly like the Hips, so a still hero looks as before', () => {
  const { root, hips, mesh } = body();
  const cloth = new Cloth(mesh, clothGeometry(mesh.geometry, mesh.skeleton, mesh.bindMatrix, CFG), CFG);
  root.position.set(3, 1, -2); root.rotation.y = 0.7; hips.rotation.x = 0.2;
  root.updateMatrixWorld(true);
  cloth.update(1 / 60);
  root.updateMatrixWorld(true);
  const s = cloth.skeleton, want = new THREE.Matrix4().multiplyMatrices(hips.matrixWorld, s.boneInverses[0]), got = new THREE.Matrix4();
  for (let i = 2; i < s.bones.length; i++) {
    got.multiplyMatrices(s.bones[i].matrixWorld, s.boneInverses[i]);
    for (let k = 0; k < 16; k++) assert.ok(Math.abs(got.elements[k] - want.elements[k]) < 1e-5, `panel ${i - 2} matrix ${k}`);
  }
});

test('the hem trails a running hero, swings forward when they stop and settles, always inside its limits', () => {
  const { root, mesh } = body();
  const cloth = new Cloth(mesh, clothGeometry(mesh.geometry, mesh.skeleton, mesh.bindMatrix, CFG), CFG);
  const front = cloth.panels[0], back = cloth.panels[CFG.panels / 2]; // panel 0 faces +Z, the body's front
  const dt = 1 / 60, step = (vz) => { root.position.z += vz * dt; root.updateMatrixWorld(true); cloth.update(dt); };
  const within = () => cloth.panels.every((p) => p.out <= CFG.out + 1e-9 && p.out >= -CFG.in - 1e-9 && Math.abs(p.side) <= CFG.side + 1e-9);
  for (let i = 0; i < 90; i++) { step(5.5); assert.ok(within()); }
  assert.ok(back.out > 0.15, `the back trails out while running (${back.out})`);
  assert.ok(front.out <= 0, 'the front lies against the legs');
  let forward = 0;
  for (let i = 0; i < 30; i++) { step(0); forward = Math.max(forward, front.out); assert.ok(within()); }
  assert.ok(forward > 0.2, `the front swings out when the hero stops (${forward})`);
  for (let i = 0; i < 120; i++) step(0);
  assert.ok(cloth.panels.every((p) => Math.abs(p.out) < 0.02 && Math.abs(p.side) < 0.02), 'still again');
});

test('a turn sweeps the panels sideways, and a teleport does not fling the cloth', () => {
  const { root, mesh } = body();
  const cloth = new Cloth(mesh, clothGeometry(mesh.geometry, mesh.skeleton, mesh.bindMatrix, CFG), CFG);
  const dt = 1 / 60;
  cloth.update(dt);
  let side = 0;
  for (let i = 0; i < 12; i++) { root.rotation.y += Math.PI / 12; root.updateMatrixWorld(true); cloth.update(dt); side = Math.max(side, ...cloth.panels.map((p) => Math.abs(p.side))); }
  assert.ok(side > 0.1, `a half turn sweeps the hem round (${side})`);
  for (let i = 0; i < 180; i++) cloth.update(dt);
  root.position.x += 40; root.updateMatrixWorld(true); cloth.update(dt);
  assert.ok(cloth.panels.every((p) => Math.abs(p.out) < 0.02 && Math.abs(p.side) < 0.02), 'a jump starts the cloth at rest');
});
