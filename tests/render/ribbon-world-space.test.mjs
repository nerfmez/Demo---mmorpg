import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Ribbon } from '../../src/render/ribbon.js';
import { sleepOffscreenMatrices } from '../../src/render/camera-visibility.js';

function assertAttached(ribbon, anchor) {
  const positions = ribbon.mesh.geometry.attributes.position;
  const a = new THREE.Vector3().fromBufferAttribute(positions, 0).applyMatrix4(ribbon.mesh.matrixWorld);
  const b = new THREE.Vector3().fromBufferAttribute(positions, 1).applyMatrix4(ribbon.mesh.matrixWorld);
  const middle = a.add(b).multiplyScalar(.5);
  assert.ok(middle.distanceTo(anchor) < 2e-5, `rendered scarf anchor ${middle.toArray()} matches bone ${anchor.toArray()}`);
  assert.ok(ribbon.pts[0].distanceTo(anchor) < 1e-9, 'physical integration stays world-space');
  const identity = new THREE.Matrix4();
  assert.ok(ribbon.mesh.matrixWorld.elements.every((v, i) => Math.abs(v - identity.elements[i]) < 1e-9), 'world vertices have no second owner transform');
}

test('a regional NPC scarf renders at its world bone anchor without doubling the atlas offset', () => {
  const scene = new THREE.Scene(), region = new THREE.Group(), npc = new THREE.Group(), bone = new THREE.Object3D();
  region.position.set(315, 2, -470); region.rotation.y = .3;
  npc.position.set(3, 0, 7); bone.position.set(.2, 1.65, -.08);
  scene.add(region); region.add(npc); npc.add(bone);
  const ribbon = new Ribbon(); region.add(ribbon.mesh);
  const anchor = new THREE.Vector3(), back = new THREE.Vector3(0, 0, -1), side = new THREE.Vector3(1, 0, 0);
  scene.updateMatrixWorld(true); bone.getWorldPosition(anchor);
  ribbon.update(1 / 60, anchor, back, side); scene.updateMatrixWorld(true);
  assertAttached(ribbon, anchor);
  assert.equal(ribbon.mesh.parent, region, 'regional disposal ownership remains intact');
  const inverse = ribbon.mesh.matrix.clone();
  ribbon.update(1 / 60, anchor, back, side); scene.updateMatrixWorld(true);
  assert.ok(ribbon.mesh.matrix.equals(inverse), 'fixed atlas parent retains its compensation matrix');
  ribbon.mesh.geometry.dispose(); ribbon.mesh.material.dispose();
});

test('a moved region, sleeping NPC reentry and a scene-owned hero scarf retain world attachment', () => {
  const scene = new THREE.Scene(), region = new THREE.Group(), npc = new THREE.Group(), bone = new THREE.Object3D();
  region.position.set(-240, 0, 310); npc.position.set(5, 0, 3); bone.position.y = 1.7;
  scene.add(region); region.add(npc); npc.add(bone); sleepOffscreenMatrices(npc);
  const ribbon = new Ribbon(); region.add(ribbon.mesh);
  const anchor = new THREE.Vector3(), back = new THREE.Vector3(0, 0, -1), side = new THREE.Vector3(1, 0, 0);
  scene.updateMatrixWorld(true); bone.getWorldPosition(anchor);
  ribbon.update(1 / 60, anchor, back, side); scene.updateMatrixWorld(true); assertAttached(ribbon, anchor);
  npc.visible = false; region.position.set(160, 0, -120); npc.position.x = 8;
  scene.updateMatrixWorld(true);
  npc.visible = true; ribbon.reset(); npc.updateWorldMatrix(true, false); npc.updateMatrixWorld(true); bone.getWorldPosition(anchor);
  ribbon.update(1 / 60, anchor, back, side); scene.updateMatrixWorld(true); assertAttached(ribbon, anchor);
  scene.add(ribbon.mesh);
  ribbon.update(1 / 60, anchor, back, side); scene.updateMatrixWorld(true); assertAttached(ribbon, anchor);
  assert.ok(ribbon.mesh.matrix.equals(new THREE.Matrix4()), 'hero/preview scene ownership keeps the ordinary identity matrix');
  ribbon.mesh.geometry.dispose(); ribbon.mesh.material.dispose();
});
