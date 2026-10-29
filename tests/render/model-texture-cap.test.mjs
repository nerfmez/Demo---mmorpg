import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { renderConfig } from '../../src/render/settings.js';

test('model maps above the cap are drawn down once; smaller maps are untouched', async (t) => {
  const drawn = [];
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: (img, x, y, w, h) => drawn.push([img, w, h]) }) }) };
  t.after(() => { delete globalThis.document; });
  const { capModelTextures } = await import('../../src/render/models.js');
  const max = renderConfig.modelTextureMax;
  const image = (width, height) => ({ width, height, closed: false, close() { this.closed = true; } });
  const big = new THREE.Texture(image(2048, 1024)), small = new THREE.Texture(image(512, 512));
  const shared = new THREE.Texture(); shared.source = big.source;
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshToonMaterial({ map: big })));
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), [new THREE.MeshBasicMaterial({ map: shared, alphaMap: small })]));
  const version = big.source.version, original = big.source.data;
  capModelTextures({ scene });
  assert.equal(max, 1024);
  assert.deepEqual([big.source.data.width, big.source.data.height], [1024, 512]);
  assert.equal(shared.source.data, big.source.data, 'a shared source is drawn down once');
  assert.equal(drawn.length, 1);
  assert.ok(original.closed && big.source.version > version);
  assert.equal(small.source.data.width, 512);
  assert.equal(small.source.data.closed, false);
});
