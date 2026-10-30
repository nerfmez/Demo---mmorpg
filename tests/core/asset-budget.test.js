// iPad budgets for content (data/rendering.json -> budgets, modelTextureMax). New models
// and plant shapes must arrive within them; the world test checks frames and maps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { animeFoliage } from '../../src/render/anime-study.js';

const root = new URL('../../', import.meta.url).pathname;
const rendering = JSON.parse(readFileSync(join(root, 'data/rendering.json'), 'utf8'));
// The HairSample hero is opt-in (?hero=classic) and its bytes are pinned by tests/core/hairsample.test.js.
const EXEMPT = new Set(['public/models/hairsample-male.glb']);

const glbs = dir => readdirSync(join(root, dir)).flatMap(name => {
  const path = join(dir, name);
  return statSync(join(root, path)).isDirectory() ? glbs(path) : name.endsWith('.glb') ? [path] : [];
});
// Width and height from a PNG or JPEG header.
function imageSize(bytes) {
  if (bytes[0] === 0x89) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  for (let i = 2; i < bytes.length;) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return [0, 0];
}

test('model files carry only maps the game draws, at the size it draws them', () => {
  const max = rendering.modelTextureMax, problems = [];
  for (const path of glbs('public').filter(p => !EXEMPT.has(p))) {
    const buf = readFileSync(join(root, path)), length = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.subarray(20, 20 + length)), bin = 20 + length + 8;
    for (const material of gltf.materials || [])
      if (material.pbrMetallicRoughness?.metallicRoughnessTexture || material.occlusionTexture) problems.push(`${path}: unused metal/roughness or occlusion map`);
    for (const image of gltf.images || []) {
      if (image.bufferView === undefined) continue;
      const view = gltf.bufferViews[image.bufferView], start = bin + (view.byteOffset || 0);
      const [w, h] = imageSize(buf.subarray(start, start + view.byteLength));
      if (Math.max(w, h) > max) problems.push(`${path}: ${w}x${h} map over ${max}`);
    }
  }
  assert.deepEqual(problems, [], 'run python3 scripts/shrink-model-textures.py on these files');
});

test('plant shapes stay inside their triangle budgets', () => {
  const budget = rendering.budgets.plantTriangles;
  for (const [kind, shrub] of [['shrub', true], ['crown', false]]) {
    const g = animeFoliage(3, shrub), triangles = (g.index ? g.index.count : g.attributes.position.count) / 3;
    assert.ok(triangles <= budget[kind], `${kind}: ${triangles} triangles over ${budget[kind]} (each is drawn thousands of times)`);
  }
});
