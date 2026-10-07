import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {disposeObject} from '../../src/render/dispose.js';
import {toon, toonRamp, outlineMaterial} from '../../src/render/toon.js';
import {attachWindShadow, patchMaterial} from '../../src/render/patch.js';
import {importJob} from '../../src/render/import-job.js';

const countDisposes = resource => {
  let count = 0;
  resource.addEventListener('dispose', () => count++);
  return () => count;
};

test('region cleanup releases unique toon fill and its wind depth once, retaining cached resources', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const fill = patchMaterial(new THREE.MeshToonMaterial({gradientMap: toonRamp()}), {wind: .1});
  const cached = toon('#ccaa44'), hull = outlineMaterial(), ramp = toonRamp();
  const meshes = [new THREE.Mesh(geometry, fill), new THREE.Mesh(geometry, fill)];
  for (const mesh of meshes) { mesh.castShadow = true; attachWindShadow(mesh); root.add(mesh); }
  assert.equal(meshes[0].customDepthMaterial, meshes[1].customDepthMaterial);
  const depth = meshes[0].customDepthMaterial;
  root.add(new THREE.Mesh(geometry, [cached, hull]));
  const counts = [geometry, fill, depth, cached, hull, ramp].map(countDisposes);
  disposeObject(root);
  assert.deepEqual(counts.map(count => count()), [1, 1, 1, 0, 0, 0]);
  assert.equal(toon('#ccaa44'), cached, 'cached fill remains reusable in the next region');
});

test('explicitly unique toon and rig materials are released, shared monster buffers/textures survive', () => {
  const geometry = new THREE.BoxGeometry(); geometry.userData.shared = true;
  const texture = new THREE.Texture(); texture.userData.shared = true;
  const unique = toon('#ccaa44', {unique: true}); unique.map = texture;
  const rig = new THREE.MeshToonMaterial({map: texture}); rig.userData.rig = true;
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, [unique, rig]));
  const counts = [unique, rig, geometry, texture].map(countDisposes);
  disposeObject(root);
  assert.deepEqual(counts.map(count => count()), [1, 1, 0, 0]);
});

test('import ownership transfers unique toon materials and keeps the cached fill borrowed', () => {
  const job = importJob(), root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const fill = new THREE.MeshToonMaterial(), cached = toon('#ccaa44');
  root.add(new THREE.Mesh(geometry, [fill, cached]));
  const counts = [geometry, fill, cached].map(countDisposes);
  const dispose = job.commit(root);
  assert.deepEqual(counts.map(count => count()), [0, 0, 0]);
  const handled = dispose();
  disposeObject(root, handled); dispose();
  assert.deepEqual(counts.map(count => count()), [1, 1, 0]);
  assert.ok(handled.has(fill)); assert.ok(!handled.has(cached));
});
