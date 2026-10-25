// Actions retargeted from reference clips (data/action-clips.json, registered by src/render/actions.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CLIPS = JSON.parse(readFileSync(new URL('../../data/action-clips.json', import.meta.url)));
const CHANNELS = new Set(['hips', 'torso', 'chest', 'head', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'weapon', 'drop', 'grip', 'aim', 'spin', 'ikL', 'ikR', 'ikw', 'staffAim', 'gripSlide']);
const vec = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

test('clip actions run from 0 to 1 with the contact inside, a sweep and real channels', () => {
  const clips = Object.entries(CLIPS).filter(([k]) => k !== '_doc');
  assert.ok(clips.length > 0);
  for (const [name, c] of clips) {
    assert.ok(typeof c._from === 'string', `${name} records its source`);
    assert.ok(c.hit > 0 && c.hit <= 1, `${name}.hit`); // 1: a pose held until released (a charge)
    assert.ok(c.sweep === 1 || c.sweep === -1, `${name}.sweep`);
    const t = c.keys.map((k) => k[0]);
    assert.equal(t[0], 0, `${name} starts at 0`);
    assert.equal(t.at(-1), 1, `${name} ends at 1`);
    assert.ok(t.every((x, i) => i === 0 || x > t[i - 1]), `${name} key times rise`);
    assert.ok(t.some((x) => Math.abs(x - c.hit) < 1e-6), `${name} has a key on its contact`);
    for (const [, pose] of c.keys)
      for (const [ch, v] of Object.entries(pose)) {
        assert.ok(CHANNELS.has(ch) && vec(v), `${name}.${ch}`);
        if (ch === 'drop') assert.ok(Math.abs(v[0]) < 0.3, `${name} drop`);
      }
  }
});
