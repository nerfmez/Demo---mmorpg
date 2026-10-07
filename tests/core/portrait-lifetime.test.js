// Execute the production portrait method with real Three.js resources and a
// borrowed-renderer double. Faults are controlled, not a device-bug reproduction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {disposeObject} from '../../src/render/dispose.js';

const source = readFileSync(process.env.PORTRAIT_SOURCE || new URL('../../src/render/view.js', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('  portrait('), source.lastIndexOf('\n}')).trim();

function harness(fault) {
  const freed = {target: 0, geometry: 0, material: 0, scarf: 0};
  const previous = new THREE.WebGLRenderTarget(64, 64);
  const primary = new TypeError(`controlled ${fault} failure`);
  let image, createdTarget;
  const dependencies = {...THREE, WebGLRenderTarget: class extends THREE.WebGLRenderTarget {
    constructor(...args) {
      super(...args); createdTarget = this;
      this.addEventListener('dispose', () => freed.target++);
    }
  }};
  const buildHumanoid = () => {
    if (fault === 'build') throw primary;
    const geometry = new THREE.BoxGeometry(), material = new THREE.MeshToonMaterial();
    material.userData.rig = true;
    geometry.addEventListener('dispose', () => freed.geometry++);
    material.addEventListener('dispose', () => freed.material++);
    const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, material));
    const scarf = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    scarf.geometry.addEventListener('dispose', () => freed.scarf++);
    return {root, scarf: {mesh: scarf}};
  };
  const renderer = {
    target: previous, face: 2, mip: 1,
    getRenderTarget() { return this.target; },
    getActiveCubeFace() { return this.face; },
    getActiveMipmapLevel() { return this.mip; },
    setRenderTarget(target, face = 0, mip = 0) { this.target = target; this.face = face; this.mip = mip; },
    render() { if (fault === 'render') throw primary; },
    readRenderTargetPixels(target, x, y, width, height, pixels) {
      if (fault === 'readback') throw primary;
      for (let i = 0; i < pixels.length; i++) pixels[i] = i;
    }
  };
  const canvas = {
    getContext() { return {
      createImageData(width, height) { return {data: new Uint8ClampedArray(width * height * 4)}; },
      putImageData(data) { image = data.data; }
    }; },
    toDataURL() { if (fault === 'encode') throw primary; return 'data:image/png;stub'; }
  };
  const portrait = Function('THREE', 'buildHumanoid', 'disposeObject', 'document', `return function ${method};`)(dependencies, buildHumanoid, disposeObject, {createElement: () => canvas});
  const run = () => portrait.call({renderer}, {}, {}, 2);
  const assertRestored = () => {
    assert.equal(renderer.target, previous, 'return the borrowed renderer to its caller');
    assert.equal(renderer.face, 2); assert.equal(renderer.mip, 1);
    assert.equal(freed.target, 1, 'dispose the temporary render target exactly once');
    assert.deepEqual([freed.geometry, freed.material, freed.scarf], fault === 'build' ? [0, 0, 0] : [1, 1, 1]);
    assert.equal(createdTarget.width, 2); assert.equal(createdTarget.height, 2);
    assert.equal(createdTarget.texture.colorSpace, THREE.SRGBColorSpace);
    previous.dispose();
  };
  return {run, assertRestored, primary, image: () => image};
}

for (const fault of ['build', 'render', 'readback', 'encode']) {
  test(`portrait restores its borrowed target and frees owned resources after ${fault} failure`, () => {
    const h = harness(fault);
    assert.throws(h.run, error => error === h.primary, 'keep the original failure visible to the caller');
    h.assertRestored();
  });
}

test('successful portrait preserves pixel row flipping and target ownership', () => {
  const h = harness();
  assert.equal(h.run(), 'data:image/png;stub');
  assert.deepEqual(Array.from(h.image()), [8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7]);
  h.assertRestored();
});
