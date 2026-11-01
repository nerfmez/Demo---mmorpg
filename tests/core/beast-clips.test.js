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

test('each companion has its own moves: the wolf leaps (Gallop_Jump), the bear swipes from a CC0 claw clip', () => {
  const jump = C.clips.jump;
  assert.ok(jump && jump.frames.length >= 8, 'the pounce clip');
  const lifts = jump.frames.map((f) => f.lift);
  assert.ok(Math.min(...lifts) < -0.1 && Math.max(...lifts) > 0.3, 'it crouches, then leaps');
  const sw = C.clips.swipe;
  assert.match(sw.from, /CC0/);
  assert.ok(sw.absolute && sw.hit > 0.15 && sw.hit < 0.6 && sw.duration > 0, 'a pose clip with its strike inside');
  for (const f of sw.frames) for (const p of PARTS) assert.ok(unit(f[p]), `swipe ${p}`);
  // reared: the spine near upright through the swipe, and a foreleg comes from high to low across the strike
  const at = (u) => sw.frames[Math.min(sw.frames.length - 1, Math.round(u * sw.frames.length))];
  assert.ok(sw.frames.every((f) => f.body[1] > 0.5), 'it stands to swipe');
  const paw = (f) => Math.max(f.leg0k[1], f.leg1k[1]);
  assert.ok(paw(at(sw.hit - 0.06)) > paw(at(sw.hit + 0.1)) + 0.3, 'the raised paw comes down through the strike');
});
