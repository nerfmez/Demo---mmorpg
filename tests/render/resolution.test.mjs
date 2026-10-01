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

test('recovers on a 60 Hz display, whose frames never beat 16.7 ms', () => {
  const g = new ResolutionGovernor();
  run(g, 33.4, 6);
  assert.ok(g.scale < 1);
  run(g, 16.7, 40);
  assert.equal(g.scale, 1);
});
test('a 120 Hz display at 60 fps is not "fast", and a failed step up waits longer next time', () => {
  const g = new ResolutionGovernor();
  for (let i = 0; i < 20; i++) g.update(8.3); // learns the 120 Hz interval
  run(g, 33, 6);
  const low = g.scale;
  run(g, 16.7, 10); // half the display rate: still not recovering
  assert.equal(g.scale, low);
  const h = new ResolutionGovernor();
  run(h, 33, 4);
  const wait = h.wait;
  run(h, 16.7, h.wait + 2); // steps up...
  run(h, 33, 3); // ...and the slowdown returns
  assert.ok(h.wait > wait);
});
