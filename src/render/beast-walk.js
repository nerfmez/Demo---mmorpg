// A walk made for the short-legged, round forest beasts (owner, 2026-11-04: "change the walk - four legs, all new").
// The borrowed CC0 dog walk never fitted their bodies (its feet slid and dragged, its trunk read stiff then shaky),
// so their locomotion is now built here from what such animals do, with no walk clip underneath:
//   gait:  a slow walk steps one foot at a time in the lateral sequence of short-legged walkers (hind left, fore
//          left, hind right, fore right), on the ground 58% of the cycle (a longer swing reads calmer than a snatched one); hurrying, it eases into a trot, feet in
//          diagonal pairs, on the ground 45% of the time. Cadence and stride both grow with speed, and the feet
//          stay planted (plantFeet in beast-life.js: each foot moves back at exactly the body's speed while down).
//   trunk: a waddle - the body rolls over toward the legs that bear it and sinks a little at each pair of
//          footfalls (more bounce at the trot), the shoulders and hips turn a touch against each other, it leans
//          into its pace; the head stays level against the roll and nods a beat late; the tail swings a beat late.
// Everything is a smooth sinusoid of the gait cycle (no kinks), sized by `o`, faded in and out with `w`.
// Cosmetic only; state lives on the rig, no allocation per frame.
import * as THREE from 'three';
import { plantFeet } from './beast-life.js';

const WALK = { fl: 0.25, fr: 0.75, hl: 0, hr: 0.5, duty: 0.58 };
const TROT = { fl: 0.5, fr: 1.0, hl: 0, hr: 0.5, duty: 0.45 };
const TAU = Math.PI * 2;
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const nudge = (b, x, y, z) => { if (b) { _q.setFromEuler(_e.set(x, y, z)); b.quaternion.multiply(_q); } };

function spring(st, key, target, dt, k, z) {
  const x = st[key] || 0, v = st[key + 'v'] || 0, c = 2 * Math.sqrt(k) * z, h = Math.min(dt, 0.05);
  const nv = (v + k * (target - x) * h) / (1 + c * h);
  st[key + 'v'] = nv;
  return (st[key] = x + nv * h);
}

/**
 * Walk the rig. w: how much it is walking (0..1, eased). o: f0, fk (cycles a second: f0 + fk * speed), trotAt
 * (m/s), lift (step height, share of the leg), bob (m), roll (rad), lean (rad per m/s), gain (0..1: eased off
 * while an attack poses the body).
 */
export function proceduralWalk(r, s, dt, w, o) {
  const b = r.bones, st = (r.pwalk ||= { ph: 0, trot: 0, trotOn: false });
  if (!(dt > 0)) return;
  const speed = s.moving ? Math.max(0, s.smoothSpeed ?? s.speed ?? 0) : 0;
  // the gait, chosen with a margin and blended over a moment
  st.trotOn = st.trotOn ? speed > o.trotAt - 0.3 : speed > o.trotAt + 0.2;
  st.trot += ((st.trotOn ? 1 : 0) - st.trot) * Math.min(1, dt * 5);
  const t = st.trot, f = o.f0 + o.fk * speed, dir = s.backing ? -1 : 1;
  st.ph = (((st.ph + dir * f * dt) % 1) + 1) % 1;
  const ph = st.ph, g = (st.g ||= { feet: {} });
  for (const k of ['fl', 'fr', 'hl', 'hr']) g.feet[k] = WALK[k] + (TROT[k] - WALK[k]) * t;
  g.duty = WALK.duty + (TROT.duty - WALK.duty) * t;
  g.stride = speed / Math.max(0.2, f);
  const gain = o.gain ?? 1, k = w * gain;
  // the trunk: sinks at each pair of footfalls (the fore feet's in the walk, each diagonal pair's in the trot)
  const beat = g.feet.fl, bob = 0.5 + 0.5 * Math.cos(2 * TAU * (ph - beat - 0.04));
  if (b.body) b.body.position.y -= o.bob * (1 + 1.5 * t) * bob * k;
  // the waddle: rolls toward the side bearing it (left legs down early in the walk cycle), less at the trot
  const roll = o.roll * (1 - 0.6 * t) * Math.sin(TAU * (ph - 0.1)) * k;
  const twist = 0.05 * Math.sin(TAU * (ph - 0.35)) * k;
  nudge(b.body, -o.lean * speed * k, twist, roll);
  nudge(b.chest, 0, -twist * 1.4, -roll * 0.3);
  // the head stays level against the roll and nods a beat after the trunk sinks; the tail swings after the hips
  const sink = Math.sin(2 * TAU * (ph - beat - 0.04)); // the trunk's rate of sinking (+ going down)
  const nod = spring(st, 'nod', 0.06 * sink * k, dt, 80, 0.45);
  const turn = Math.max(-3, Math.min(3, s.turn || 0));
  const look = spring(st, 'look', -0.08 * turn * gain, dt, 60, 0.5);
  nudge(b.neck, nod * 0.6, look * 0.5, -roll * 0.5);
  nudge(b.head, nod * 0.5, look * 0.5, -roll * 0.4);
  const tail = spring(st, 'tail', (o.tailSwing ?? 0.3) * Math.sin(TAU * (ph - 0.35)) * k + 0.1 * turn * gain, dt, 40, 0.35);
  nudge(b.tail, 0.05 * bob * k, tail, 0);
  // the legs: planted feet, lifted steps, on this gait's own timing
  plantFeet(r, w, ph, o.lift ?? 0.3, g);
}
