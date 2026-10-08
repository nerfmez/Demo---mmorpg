// Shared monster locomotion (render only). The gait cycle is locked to the measured ground speed,
// so a planted foot travels backwards exactly as fast as the body moves forwards (no sliding
// "conveyor" legs); stance and swing have their own timing (a foot is planted longer than it is
// in the air and lifts through its swing), and the body drops a little when legs are spread so
// the feet stay on the ground. Tuning lives in data/monster-motion.json (passed in, so this
// file also runs in Node tests).
import { damp, clamp01 } from './rig.js';

const TAU = Math.PI * 2;
const cache = new WeakMap();

/** Merged motion tuning for a monster type (defaults + its own entry). */
export function motionConfig(motion, type) {
  let byType = cache.get(motion);
  if (!byType) cache.set(motion, (byType = new Map()));
  let c = byType.get(type);
  if (!c) byType.set(type, (c = { ...motion.defaults, ...(motion.monsters[type] || {}) }));
  return c;
}

/**
 * Advance r.phase by the ground speed. s.speed (m/s) and s.vFwd come from the view; poses that
 * do not measure speed (the Skill Lab, allies) fall back to the old moving flag.
 * Sets r.speed (smoothed), r.walkW (0 standing .. 1 walking), r.runK (0 walk .. 1 run gait),
 * r.accel (forward m/s^2, for leaning), r.dir (+1 forwards, -1 backing away); returns r.walkW.
 */
export function advanceGait(r, s, dt, c) {
  const measured = s.speed !== undefined;
  const v = measured ? s.speed : s.moving ? c.runFrom * (s.speedFactor >= 1 ? 1.4 : 0.6) : 0;
  const before = r.speed || 0;
  r.speed = damp(before, v, 10, dt);
  r.accel = damp(r.accel || 0, dt > 0 ? (r.speed - before) / dt : 0, 6, dt);
  r.walkW = damp(r.walkW || 0, clamp01(v / 0.6), 9, dt);
  r.runK = damp(r.runK || 0, clamp01((r.speed - c.runFrom) / Math.max(0.1, c.runFull - c.runFrom)), 4, dt);
  if (measured && s.vFwd !== undefined) r.dir = s.vFwd < -0.35 * v ? -1 : 1;
  else r.dir = 1;
  const duty = c.duty + (c.runDuty - c.duty) * r.runK;
  const swing = c.swing + (c.runSwing - c.swing) * r.runK;
  const L = c.legLength * (r.baseScale || 1);
  // stance sweeps 2*swing radians in duty of a cycle: foot speed = L * 2 swing * rate / (TAU duty)
  const rate = (r.speed * TAU * duty) / (2 * L * swing);
  r.phase = (r.phase || 0) + dt * Math.min(rate, c.maxRate) * r.dir;
  r.duty = duty;
  r.swingA = swing;
  return r.walkW;
}

/**
 * One leg at cycle offset off (0..1): out.angle in -1 (foot forward) .. +1 (foot back), linear
 * while planted and eased through the swing; out.lift 0..1 peaks mid-swing.
 */
export function legCycle(phase, off, duty, out) {
  let u = (phase / TAU + off) % 1;
  if (u < 0) u += 1;
  if (u < duty) {
    out.angle = -1 + (2 * u) / duty;
    out.lift = 0;
    out.planted = true;
  } else {
    const k = (u - duty) / (1 - duty);
    out.angle = 1 - 2 * k * k * (3 - 2 * k);
    out.lift = Math.sin(Math.PI * k);
    out.planted = false;
  }
  return out;
}

/** Gait leg offsets blended from walk to run, written into out. */
export function gaitOffsets(c, runK, out) {
  for (let i = 0; i < c.walk.length; i++) {
    let d = c.run[i] - c.walk[i];
    d -= Math.round(d); // the short way round the cycle
    out[i] = c.walk[i] + d * runK;
  }
  return out;
}

/** Smooth value noise for idle fidgets (looks around, shifts weight); -1..1. */
export function wander(t, seed) {
  return Math.sin(t * 0.37 + seed) * 0.6 + Math.sin(t * 0.83 + seed * 2.1) * 0.3 + Math.sin(t * 1.9 + seed * 3.7) * 0.1;
}

/** Idle breathing swell (0 centred). */
export function breath(time, seed, c) {
  return Math.sin(time * c.breathRate + seed) * c.breath;
}

const _leg = { angle: 0, lift: 0, planted: true };
const _offs = [0, 0, 0, 0, 0, 0];

/**
 * Pose legs that swing fore/aft about X (quadrupeds, bipeds, mantis). A planted leg sweeps back,
 * a lifted one bends its lower joint (bones named `${leg}k`; legs without one shorten a little)
 * and swings forward. Returns how far the body should sink (rig units) so planted feet stay on
 * the ground while the legs are spread.
 */
export function poseLegs(r, c, legs, kneeOf = (n) => `${n}k`) {
  const b = r.bones, w = r.walkW, A = r.swingA * w;
  gaitOffsets(c, r.runK, _offs);
  let drop = 0, planted = 0;
  for (let i = 0; i < legs.length; i++) {
    legCycle(r.phase, _offs[i % c.walk.length], r.duty, _leg);
    const a = _leg.angle * A;
    b[legs[i]].rotation.x = a;
    const knee = b[kneeOf(legs[i])];
    if (knee) knee.rotation.x = (_leg.lift * c.knee * (1 + 0.4 * r.runK) + (_leg.planted ? 0.06 : 0)) * w;
    else b[legs[i]].scale.y = 1 - 0.16 * _leg.lift * w;
    if (_leg.planted) {
      drop += 1 - Math.cos(a);
      planted++;
    }
  }
  return planted ? (drop / planted) * c.legLength : 0;
}

/** Pose splayed arthropod legs (beetle, crabs) that step by turning about Y and lift about Z. */
export function poseSplayedLegs(r, c, legs, sides, liftAxis = 'x') {
  const b = r.bones, w = r.walkW, A = r.swingA * w;
  for (let i = 0; i < legs.length; i++) {
    // alternating tripods: legs 0,3,4 then 1,2,5
    const off = (i % 2 === 0) === (Math.floor(i / 2) % 2 === 0) ? 0 : 0.5;
    legCycle(r.phase, off + Math.floor(i / 2) * 0.08, r.duty, _leg);
    const leg = b[legs[i]];
    leg.rotation.y = _leg.angle * A * sides[i];
    leg.rotation[liftAxis] = (liftAxis === 'z' ? sides[i] : -1) * _leg.lift * 0.35 * w;
  }
}
