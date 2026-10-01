import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResolutionGovernor } from '../../src/render/resolution.js';
const run = (g, ms, seconds) => { let changed = null; for (let t = 0; t < seconds * 1000; t += ms) { const s = g.update(ms); if (s !== null) changed = s; } return changed; };

test('a device that holds 60 fps keeps full resolution', () => {
  const g = new ResolutionGovernor();
  run(g, 16.7, 20);
  assert.equal(g.scale, 1);
});
test('slow frames lower the scale step by step, never below the floor', () => {
  const g = new ResolutionGovernor({ minScale: 0.67 });
  run(g, 33, 3);
  assert.ok(g.scale < 1 && g.scale >= 0.67);
  run(g, 33, 30);
  assert.equal(g.scale, 0.67);
});
test('fast frames recover full sharpness, and hitches are ignored', () => {
  const g = new ResolutionGovernor();
  run(g, 33, 6);
  const low = g.scale;
  run(g, 12, 30);
  assert.ok(low < 1);
  assert.equal(g.scale, 1);
  const h = new ResolutionGovernor();
  for (let i = 0; i < 50; i++) h.update(500);
  assert.equal(h.scale, 1);
});
