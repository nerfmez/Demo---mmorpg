// The hunter's four-legged companions move by the Quaternius wolf's clips (CC0), stored as directions per body
// part (data/beast-clips.json, scripts/beast-clips/extract.mjs; played by src/render/beast-clips.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const C = JSON.parse(readFileSync(new URL('../../data/beast-clips.json', import.meta.url)));
const PARTS = ['body', 'chest', 'neck', 'head', 'tail', 'leg0', 'leg0k', 'leg1', 'leg1k', 'leg2', 'leg2k', 'leg3', 'leg3k'];
const unit = (d) => Array.isArray(d) && d.length === 3 && Math.abs(Math.hypot(...d) - 1) < 0.01;

test('the companion clips: a CC0 source, a standing pose and every clip the animator plays, as unit directions per part', () => {
  assert.match(C._source, /CC0/);
  for (const p of PARTS) assert.ok(unit(C.rest[p]), 'rest ' + p);
  for (const name of ['walk', 'gallop', 'idle', 'attack', 'hit']) {
    const c = C.clips[name];
    assert.ok(c && c.duration > 0 && c.frames.length >= 8, name);
    for (const f of c.frames) {
      for (const p of PARTS) assert.ok(unit(f[p]), `${name} ${p}`);
      assert.ok(Math.abs(f.lift) < 0.5, `${name}: the hips rise or sink by less than half a leg`);
    }
  }
  // a walk moves the legs: each front leg swings both ways over the cycle
  const zs = C.clips.walk.frames.map((f) => f.leg0[2]);
  assert.ok(Math.max(...zs) - Math.min(...zs) > 0.4, 'the front leg swings');
});
