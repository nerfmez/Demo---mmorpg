// Greyfang's body (docs/MONSTER-ATTACKS.md): the Quaternius wolf's own CC0 clips (beast-clips.js: walk, gallop,
// the gallop jump, the bite, the flinch), so the big wolf runs, turns and leaps like a wolf, never guessed angles.
// Its kit's beats on top of them, each with an anticipation the player reads, a held pose, a fast strike and a
// settle (.claude/skills/anime-action):
//   hamstring: a coiled crouch (the jump clip's crouch) held, then flat-out galloping passes, jaws open at leg
//     height and snapping shut past the hero; between passes a skid on its haunches, leaning into the turn;
//   moon orbit: the crouch, then a banked gallop round its prey; it plants (the crouch, trembling), then flies
//     along its cut (the jump clip's leap, stretched out, jaws wide) and lands;
//   rally and the phase roar: standing tall with the muzzle thrown to the sky (the clips' howl), the roar shaking;
//   moon leap: a deep, shaking crouch, then the leap's take-off carried up out of sight; it comes down nose first,
//     forepaws reaching, and lands in a crouch before it rises;
//   phantom rush: pressed low, trembling while its shadows gather; it bolts down the last lane in a gallop and skids.
// Cosmetic only: it reads the view's state (monster-views.js) and never changes rules. No allocation per frame.
import * as THREE from 'three';
import { animBeast } from './beast-clips.js';
import { clamp01 } from './rig.js';

const smooth = (x) => x * x * (3 - 2 * x);
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const nudge = (b, x, y, z) => { if (b) { _q.setFromEuler(_e.set(x, y, z)); b.quaternion.multiply(_q); } };
/** How high (m, world) the moon leap carries it: up past the top of the game camera's view. */
export const LEAP_HEIGHT = 15;
// an offset eased toward its value (critically damped): quick into a pose, gentler back out
function sm(r, key, v, dt, wIn = 30, wOut = 14) {
  const e = (r.eased ||= {}), x = e[key] ?? v, vel = e[key + 'v'] || 0, w = Math.abs(v) < Math.abs(x) ? wOut : wIn;
  const step = Math.min(dt, 0.05), nv = (vel + w * w * (v - x) * step) / (1 + 2 * w * step);
  e[key + 'v'] = nv;
  return (e[key] = x + nv * step);
}

/** The moon leap's height above the ground (m) at its phase and time; 0 on the ground. */
export function leapHeight(a, phase, t) {
  if (!a || !phase) return 0;
  if (phase === 'rise') { const q = clamp01(t / a.rise); return LEAP_HEIGHT * (1 - (1 - q) * (1 - q)); }
  // it comes down over the last 0.35 s of the lock and the fall
  const down = 0.35 + a.fall, left = phase === 'lock' ? a.lock - t + a.fall : phase === 'fall' ? a.fall - t : down + 1;
  if (left >= down) return LEAP_HEIGHT;
  const q = clamp01(left / down);
  return LEAP_HEIGHT * q * q;
}

export function animGreyfang(r, s, dt, time) {
  const P = r.pose || (r.pose = { clip: 'attack', u: 0, w: 0, leap: 0 });
  const A = s.attacks || {}, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0, wu = s.windup, last = s.lastAttack;
  const act = s.state === 'act', rec = s.state === 'recover';
  let pose = null, roll = 0, pitch = 0, head = 0, jaw = -1, lift = 0, tremble = 0, hide = false;
  s.standT = 0;
  const crouch = (q, depth = 0.22) => ({ clip: 'jump', u: depth * smooth(clamp01(q)), w: 1 });
  const dashing = (speed) => { s.moving = true; s.speed = s.smoothSpeed = Math.max(s.speed || 0, speed); };
  if (s.roar) {
    // the phase roar: up tall, muzzle to the sky, the whole body shaking with it
    const T = s.actionTotal || 1.6;
    s.standTotal = T; s.standT = Math.max(0, T - s.actT);
    const on = clamp01(s.actT / 0.25) * clamp01((T - s.actT) / 0.3);
    pitch = -0.22 * on; tremble = on;
  } else if (wu === 'rally') {
    s.standTotal = s.windupTotal; s.standT = Math.max(0, s.windupTotal - s.windupT);
  } else if (wu === 'hamstring') {
    // coiled, head down at the knees it wants, held still at the end of the wind-up
    pose = crouch(k / 0.6); head = 0.3 * smooth(clamp01(k / 0.6));
  } else if (act && last === 'hamstring') {
    if (s.skid > 0) {
      // skidding round on its haunches, forelegs braced, leaning into the turn
      pose = { clip: 'jump', u: 0.9, w: 1 }; pitch = -0.2; roll = 0.38 * (s.side || 1); head = -0.1;
    } else {
      // the pass: flat out, low and stretched, jaws open at leg height, snapping shut past the hero
      dashing(14);
      const q = s.swoopK || 0;
      pitch = 0.1; head = 0.35; roll = -0.18 * (s.side || 1);
      jaw = q < 0.5 ? 0.9 : 0.9 * (1 - clamp01((q - 0.5) / 0.06));
    }
  } else if (rec && last === 'hamstring') {
    const q = clamp01(s.actT / 0.4);
    pose = { clip: 'jump', u: 0.9 + 0.09 * q, w: 1 - q };
  } else if (wu === 'moon_orbit') {
    pose = crouch(k / 0.6); head = 0.25 * smooth(clamp01(k / 0.6));
  } else if (act && last === 'moon_orbit') {
    const a = A.moon_orbit;
    if (s.lapPhase === 'run') {
      dashing(a?.lapSpeed || 14);
      roll = 0.32 * (s.lapDir || 1); head = 0.15;
    } else if (s.lapPhase === 'aim') {
      // planted, trembling, eyes on its prey: the held pose before the cut
      pose = crouch(s.lapT / 0.15, 0.25); head = 0.15; tremble = 0.5;
    } else {
      // the cut: the leap stretched along its lane, jaws wide, snapping shut as it passes through
      const q = clamp01(s.lapT / (a?.dashTime || 0.4));
      pose = { clip: 'jump', u: 0.32 + 0.5 * q, w: 1, leap: 0.35 * Math.sin(Math.PI * q) };
      pitch = 0.08; jaw = q < 0.45 ? 1 : 1 - clamp01((q - 0.45) / 0.08);
    }
  } else if (rec && last === 'moon_orbit') {
    const q = clamp01(s.actT / 0.45);
    pose = { clip: 'jump', u: 0.86 + 0.13 * q, w: 1 - q * q }; pitch = -0.12 * (1 - q);
  } else if (wu === 'moon_leap') {
    // the deep crouch, shaking harder as it gathers, held low
    pose = crouch(k / 0.8, 0.27); head = -0.15 * k; tremble = k;
  } else if (act && last === 'moon_leap') {
    const a = A.moon_leap, h = leapHeight(a, s.leap, s.leapT || 0);
    lift = h;
    if (s.leap === 'rise') pose = { clip: 'jump', u: 0.3 + 0.3 * clamp01((s.leapT || 0) / (a?.rise || 0.45)), w: 1 };
    else if (h >= LEAP_HEIGHT - 0.01) hide = true; // up out of sight
    else { pose = { clip: 'jump', u: 0.74, w: 1 }; pitch = 0.55; head = 0.2; jaw = 0.8; } // coming down nose first
  } else if (rec && last === 'moon_leap') {
    // landed: crouched low on its forepaws, head down, then up again
    const q = clamp01(s.actT / ((s.actionTotal || 1) * 0.8));
    pose = { clip: 'jump', u: 0.9 + 0.09 * q, w: 1 - smooth(q) }; head = 0.35 * (1 - q); pitch = 0.12 * (1 - q);
  } else if (wu === 'phantom_rush') {
    // pressed low, head down and snarling, trembling while its shadows gather
    pose = crouch(k / 0.5, 0.24); head = 0.3 * smooth(clamp01(k / 0.5)); jaw = 0.5 * k; tremble = 0.4 + 0.6 * k;
  } else if (act && last === 'phantom_rush') {
    if (s.rushDash) { dashing(A.phantom_rush?.speed || 18); pitch = 0.12; head = 0.3; jaw = 0.85; }
    else { pose = crouch(1, 0.24); head = 0.3; jaw = 0.5; tremble = 1; }
  } else if (rec && last === 'phantom_rush') {
    const q = clamp01(s.actT / 0.5);
    pose = { clip: 'jump', u: 0.9, w: 1 - smooth(q) }; pitch = -0.2 * (1 - q); roll = 0.3 * (1 - q);
  }
  if (pose) Object.assign(P, { leap: 0 }, pose);
  s.pose = pose ? P : null;
  animBeast(r, s, dt, time, { stride: 1.9, gallopFrom: 3, gallopFull: 5.2 });
  const b = r.bones;
  roll = sm(r, 'roll', roll, dt, 12, 8); pitch = sm(r, 'pitch', pitch, dt); head = sm(r, 'head', head, dt); tremble = sm(r, 'tremble', tremble, dt);
  const shake = tremble * 0.035 * Math.sin(time * 47);
  if (roll || pitch || shake) nudge(b.body, pitch, 0, roll + shake);
  if (head) nudge(b.head, head, 0, 0);
  if (jaw >= 0 && b.jaw) b.jaw.rotation.x = 0.5 * jaw;
  if (lift) r.root.position.y += lift;
  if (hide) r.root.visible = false;
}
