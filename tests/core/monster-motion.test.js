// Monster locomotion (render-side, data/monster-motion.json): the gait cycle is locked to ground
// speed so a planted foot moves backwards exactly as fast as the body moves forwards (no sliding
// legs), stance and swing join without jumps, and every monster has motion tuning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';
import { motionConfig, motionStyle, advanceGait, legCycle, gaitOffsets } from '../../src/render/monster-motion.js';

const MOTION = JSON.parse(readFileSync(new URL('../../data/monster-motion.json', import.meta.url), 'utf8'));
const MONSTERS = data.monsters.monsters;
const TAU = Math.PI * 2;

test('every monster has locomotion tuning that makes sense', () => {
  for (const type of Object.keys(MONSTERS)) {
    const c = motionConfig(MOTION, type);
    assert.ok(c.legLength > 0 && c.swing > 0 && c.runSwing > 0, type);
    assert.ok(c.duty > 0.3 && c.duty < 0.8 && c.runDuty > 0.3 && c.runDuty < 0.8, `${type}: stance share`);
    assert.ok(c.runFull > c.runFrom, `${type}: walk -> run band`);
    assert.equal(c.walk.length, 4);
    assert.equal(c.run.length, 4);
  }
  for (const type of Object.keys(MOTION.monsters)) assert.ok(MONSTERS[type] || ['spirit_wolf', 'stone_guardian'].includes(type), `${type} is a real monster or a summon`);
});

test('legs plant: stance sweeps linearly, swing returns, and the cycle has no jumps', () => {
  const out = { angle: 0, lift: 0, planted: true };
  let prev = legCycle(0, 0, 0.6, out).angle;
  for (let i = 1; i <= 400; i++) {
    const a = legCycle((i / 400) * TAU, 0, 0.6, out).angle;
    assert.ok(Math.abs(a - prev) < 0.06, `continuous at ${i}`);
    assert.ok(out.planted ? out.lift === 0 : out.lift >= 0, 'only a swinging foot lifts');
    prev = a;
  }
  // offsets blend the short way round the cycle
  const offs = gaitOffsets({ walk: [0.9, 0, 0, 0], run: [0.1, 0, 0, 0] }, 0.5, [0, 0, 0, 0]);
  assert.ok(Math.abs(offs[0] - 1.0) < 1e-9);
});

test('a planted foot moves at the ground speed (no sliding legs) for every walking monster', () => {
  for (const [type, def] of Object.entries(MONSTERS)) {
    const c = motionConfig(MOTION, type);
    for (const v of [def.speed * 0.45, def.speed, def.speed * 1.3]) {
      const r = { baseScale: 1.1 };
      const s = { speed: v, vFwd: v };
      for (let i = 0; i < 300; i++) advanceGait(r, s, 1 / 60, c);
      const p0 = r.phase;
      advanceGait(r, s, 1 / 60, c);
      const dPhase = (r.phase - p0) * 60; // rad/s
      // stance: angle runs -1..1 over duty of the cycle, the leg turns 2*swing radians
      const footSpeed = (c.legLength * r.baseScale * 2 * r.swingA * dPhase) / (TAU * r.duty);
      assert.ok(Math.abs(footSpeed - v) / v < 0.04 || dPhase >= c.maxRate - 1e-6, `${type} at ${v.toFixed(2)} m/s: foot ${footSpeed.toFixed(2)}`);
      assert.ok(dPhase < c.maxRate || v > def.speed, `${type}: cadence not capped at its own speed`);
    }
  }
});

test('standing still settles the gait; backing away runs the cycle backwards', () => {
  const c = motionConfig(MOTION, 'thornback_wolf');
  const r = { baseScale: 1 };
  for (let i = 0; i < 120; i++) advanceGait(r, { speed: 0, vFwd: 0 }, 1 / 60, c);
  assert.ok(r.walkW < 0.01 && r.speed < 0.01);
  const p0 = r.phase;
  for (let i = 0; i < 60; i++) advanceGait(r, { speed: 3, vFwd: -3 }, 1 / 60, c);
  assert.ok(r.phase < p0, 'legs step backwards');
  // views that do not measure speed (Skill Lab) still walk
  const lab = { baseScale: 1 };
  for (let i = 0; i < 60; i++) advanceGait(lab, { moving: true, speedFactor: 1 }, 1 / 60, c);
  assert.ok(lab.walkW > 0.9 && lab.phase > 0);
});

test('walk styles (the monster sandbox walk choices) are named and keep the feet planted at the monster speed', () => {
  for (const [type, styles] of Object.entries(MOTION.styles)) {
    if (type === '_doc') continue;
    assert.ok(MONSTERS[type], `${type} is a real monster`);
    for (const [id, st] of Object.entries(styles)) {
      assert.ok(st.nameTh, `${type}/${id} has a Thai name for its chip`);
      const c = motionStyle(MOTION, type, id);
      assert.equal(c.walk.length, 4, `${type}/${id}`);
      assert.equal(c.run.length, 4, `${type}/${id}`);
      assert.ok(c.duty > 0.3 && c.duty < 0.8 && c.runDuty > 0.3 && c.runDuty < 0.8, `${type}/${id}: stance share`);
      const r = { baseScale: 1.1 }, v = MONSTERS[type].speed;
      for (let i = 0; i < 300; i++) advanceGait(r, { speed: v, vFwd: v }, 1 / 60, c);
      const p0 = r.phase;
      advanceGait(r, { speed: v, vFwd: v }, 1 / 60, c);
      assert.ok((r.phase - p0) * 60 < c.maxRate, `${type}/${id}: cadence not capped at its own speed`);
    }
  }
  // an unknown style is the type's own tuning
  assert.equal(motionStyle(MOTION, 'leaf_tanuki', 'nope'), motionConfig(MOTION, 'leaf_tanuki'));
});
