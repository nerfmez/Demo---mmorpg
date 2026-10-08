import test from 'node:test';
import assert from 'node:assert/strict';
import {Particles} from '../../src/render/particles.js';

test('pooled particles upload only the live prefix after spawn, expiry and repeated updates', () => {
  const p = new Particles(2500);
  p.update(1/60);
  for (const a of p.uploadAttributes) assert.equal(a.version, 0, 'empty pools upload nothing');
  p.add(1, 2, 3, 0, 0, 0, {life:.01, color:0xff0000});
  p.add(4, 5, 6, 0, 0, 0, {life:1, color:0x00ff00});
  p.update(.02);
  assert.equal(p.count, 1);
  assert.deepEqual([...p.pos.slice(0,3)], [4,5,6]);
  assert.deepEqual([...p.col.slice(0,3)], [0,1,0], 'swap removal preserves colour');
  p.add(7, 8, 9, 0, 0, 0, {life:1});
  p.update(.01); // both updates happen before any renderer consumes the ranges
  for (const a of p.uploadAttributes) assert.deepEqual(a.updateRanges, [{start:0,count:2*a.itemSize}]);
  assert.equal(p.points.geometry.drawRange.count, 2);
  const versions=p.uploadAttributes.map(a=>a.version);
  p.update(2);
  assert.equal(p.points.geometry.drawRange.count, 0);
  assert.deepEqual(p.uploadAttributes.map(a=>a.version), versions);
  p.points.geometry.dispose(); p.points.material.dispose();
});
