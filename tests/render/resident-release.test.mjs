import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { releaseResidentArraysOnUpload } from '../../src/render/resident-geometry.js';

const box = () => new THREE.BoxGeometry(1, 1, 1);
const upload = geometry => { for (const a of [...Object.values(geometry.attributes), geometry.index].filter(Boolean)) a.onUploadCallback(); };

test('static resident arrays are dropped only by their own upload; live and shared parts keep theirs', () => {
  const root = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const still = new THREE.Mesh(box(), material), shared = new THREE.Mesh(box(), material);
  shared.geometry.userData.shared = true;
  const grass = new THREE.Mesh(box(), material);grass.userData.grassCulling = true;
  const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)));
  const stone = new THREE.Group(), stoneMesh = new THREE.Mesh(box(), material);stone.add(stoneMesh);
  const dynamic = new THREE.Mesh(box(), material);dynamic.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  root.add(still, shared, grass, motes, stone, dynamic);
  const region = { root, waypointStones: new Map([['landing', stone]]) };
  const stats = releaseResidentArraysOnUpload(region);
  assert.ok(stats.geometries >= 2 && stats.bytes > 0);
  assert.ok(still.geometry.boundingBox && still.geometry.boundingSphere, 'bounds are kept before the data goes');
  assert.ok(still.geometry.attributes.position.array, 'nothing is dropped before the upload');
  for (const mesh of [still, shared, grass, motes, stoneMesh, dynamic]) upload(mesh.geometry);
  assert.equal(still.geometry.attributes.position.array, null);
  assert.equal(still.geometry.index.array, null);
  assert.equal(still.geometry.attributes.position.count, 24, 'counts survive for draw ranges');
  assert.ok(dynamic.geometry.attributes.normal.array === null && dynamic.geometry.attributes.position.array, 'a dynamic attribute stays');
  for (const kept of [shared, grass, motes, stoneMesh]) assert.ok(kept.geometry.attributes.position.array, 'kept: ' + (kept.name || kept.type));
});
