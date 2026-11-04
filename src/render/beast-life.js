// Life on top of a beast's clip walk (owner, 2026-11-04: "it walks like a robot"). The CC0 clips move the legs,
// but on these short, round bodies the trunk stayed one rigid block and the head and tail moved exactly with it.
// A walking animal's shoulders and hips swing against each other with each step, each dips as its feet land, and
// what hangs off the body - the head, the tail - follows a beat late and overshoots (overlapping action). This
// adds those three things, timed to the clip's own footfalls so they keep its rhythm:
//   spine:  the shoulders yaw toward the front foot reaching forward, the hips toward the hind one (against
//           each other), and each end dips on its two footfalls;
//   follow: damped springs (underdamped, so they overshoot a little) drive the head's nod from the trunk's
//           bounce and its turn from the body's turning, and the tail's swing from the hips' sway and the turn.
// Cosmetic only; no allocation per frame (the spring state lives on the rig).
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const nudge = (b, x, y, z) => { if (b) { _q.setFromEuler(_e.set(x, y, z)); b.quaternion.multiply(_q); } };
const TAU = Math.PI * 2;
// the walk clip's footfalls (where each foot is front-most), as a share of its cycle: front right, front left,
// hind right, hind left (measured from data/beast-clips-shiba.json and -fox.json, the same Quaternius timing)
const FOOT = { fr: 0, fl: 0.55, hr: 0.9, hl: 0.35 };
// each leg's bones and its footfall
const LEGS = [
  { up: 'leg0', low: 'leg0k', foot: 'fr' }, { up: 'leg1', low: 'leg1k', foot: 'fl' },
  { up: 'leg2', low: 'leg2k', foot: 'hr' }, { up: 'leg3', low: 'leg3k', foot: 'hl' },
];
// the share of a walk cycle a foot is on the ground
const DUTY = 0.6;
const _t = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0), _z = new THREE.Vector3(0, 0, 1);

/** Each leg's rest measures, from the rig's rest positions: hip in the root's space, segment lengths and angles. */
function legRig(r) {
  if (r.legRig) return r.legRig;
  const b = r.bones, rest = (n) => b[n]?.userData.rest?.pos || b[n]?.position;
  const out = [];
  for (const L of LEGS) {
    const up = b[L.up], low = b[L.low];
    if (!up || !low) return (r.legRig = []);
    // the hip in root space at rest: the leg's position through its parents (positions only: rest has no turns)
    const hip = new THREE.Vector3();
    for (let o = up; o && o !== r.root; o = o.parent) hip.add(o.userData.rest?.pos || o.position);
    const k = rest(L.low); // the knee from the hip
    const L1 = Math.hypot(k.y, k.z), L2 = Math.max(0.05, (hip.y + k.y) * 0.97); // the lower leg reaches the ground
    const a0 = Math.atan2(k.z, -k.y); // the upper leg's rest angle from straight down, toward +z
    // which way the knee bends: the sign that puts the solved upper leg back at its rest angle for a foot right
    // under the knee
    const vz = k.z, vy = k.y - L2, d = Math.hypot(vz, vy), phi = Math.atan2(vz, -vy);
    const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const bend = Math.abs(phi + A - a0) < Math.abs(phi - A - a0) ? 1 : -1;
    out.push({ ...L, hip, L1, L2, a0, bend });
  }
  return (r.legRig = out);
}

/**
 * Planted feet (owner, 2026-11-04: "the legs don't lift at all, it inches along"; measured: the dog clip's front
 * feet slid forward with the body and its hind feet raked back faster than it, under the ground, on these short
 * legs). Each foot follows the walk cycle in the root's space: on the ground for DUTY of the cycle, moving back
 * under the body exactly as fast as the body goes forward (the cycle is one stride, so it does not slide), then
 * lifted in an arc (height: liftHeight of the leg) and set down a stride ahead. A two-bone solve in the leg's
 * own plane turns the hip and knee to reach it; the result is blended over the clip's legs by w.
 */
export function plantFeet(r, w, ph, liftHeight) {
  if (w < 0.01 || !r.beast) return;
  const C = r.beast.stride || 0.6, legs = legRig(r);
  // A walking beast sinks a little at the hips: standing, these short legs are almost straight, so a foot planted
  // half a stroke ahead or behind is out of reach and gets dragged (measured: the front feet slid 0.7 m/s). The
  // drop is what the shortest-reaching leg needs to cover half a stroke, eased in with w.
  let drop = 0;
  for (const L of legs) {
    const R = (L.L1 + L.L2) * 0.98, half = (C * DUTY) / 2 * 1.05;
    if (R > half) drop = Math.max(drop, L.hip.y - Math.sqrt(R * R - half * half));
  }
  if (r.bones.body) r.bones.body.position.y -= Math.max(0, drop) * w;
  r.root.updateWorldMatrix(true, false);
  for (const L of legs) {
    const up = r.bones[L.up], low = r.bones[L.low], parent = up.parent;
    const u = (((ph - FOOT[L.foot]) % 1) + 1) % 1;
    let z, y;
    if (u < DUTY) { z = C * DUTY * (0.5 - u / DUTY); y = 0; }
    else { const s = (u - DUTY) / (1 - DUTY), e = s * s * (3 - 2 * s); z = C * DUTY * (e - 0.5); y = Math.sin(Math.PI * s) * liftHeight * (L.L1 + L.L2); }
    // the target in the leg's parent's space, relative to the hip
    _t.set(L.hip.x, y, L.hip.z + z);
    parent.updateWorldMatrix(true, false); // it and its parents were just posed
    r.root.localToWorld(_t);
    parent.worldToLocal(_t).sub(up.position);
    // the hip first leans the leg's plane out or in to the foot (the spine's swing turns the hips under it; left
    // out, the planted feet slid sideways), then the hip and knee bend in that plane
    const lean = Math.atan2(_t.x, -_t.y), vz = _t.z, vy = -Math.hypot(_t.x, _t.y);
    const d = Math.max(Math.abs(L.L1 - L.L2) + 1e-3, Math.min(L.L1 + L.L2 - 1e-3, Math.hypot(vz, vy)));
    const phi = Math.atan2(vz, -vy), A = Math.acos(Math.max(-1, Math.min(1, (L.L1 * L.L1 + d * d - L.L2 * L.L2) / (2 * L.L1 * d))));
    const upper = phi + L.bend * A;
    // the knee, and the lower leg's angle from it to the foot
    const kz = Math.sin(upper) * L.L1, ky = -Math.cos(upper) * L.L1;
    const lower = Math.atan2(vz * (d / Math.max(1e-6, Math.hypot(vz, vy))) - kz, -(vy * (d / Math.max(1e-6, Math.hypot(vz, vy))) - ky));
    // a turn of t about x points straight down to the angle -t (toward -z), so: hip = a0 - upper; knee follows
    const t1 = L.a0 - upper;
    _qa.setFromAxisAngle(_z, lean).multiply(_qb.setFromAxisAngle(_x, t1)); up.quaternion.slerp(_qa, w);
    _qb.setFromAxisAngle(_x, -lower - t1); low.quaternion.slerp(_qb, w);
  }
}

/** One damped spring toward `target` (stiffness k, damping ratio z); returns its value. */
function spring(st, key, target, dt, k = 90, z = 0.45) {
  const x = st[key] || 0, v = st[key + 'v'] || 0, c = 2 * Math.sqrt(k) * z;
  const nv = v + (k * (target - x) - c * v) * dt;
  st[key + 'v'] = nv;
  return (st[key] = x + nv * dt);
}

/**
 * Add the spine swing, the footfall dips and the follow-through of the head and tail. w: how much it is walking
 * (0..1), ph: the walk cycle (0..1), s: the animation state (s.turn: the body's turning rate). o: strengths -
 * spine, dip, head, tail (1 = the defaults, which suit a fox-sized beast).
 */
export function beastLife(r, s, dt, w, ph, o = {}) {
  const b = r.bones, st = (r.life ||= {});
  if (!(dt > 0)) return;
  // the cadence (cycles a second, eased) and how much of this belongs at it. The swing and dips are a walk's, at a
  // walking pace: measured per drawn frame (2026-11-04), at the same size they shook the trunk when it hurried
  // or backed off at four steps a second, and they do not fit a gallop's footfalls at all - so they fade with the
  // square of the pace above about two steps a second, and out entirely in a gallop
  const rate = st.prevPh === undefined ? 0 : ((ph - st.prevPh + 1.5) % 1) - 0.5; st.prevPh = ph;
  st.cyc = (st.cyc ?? 0) + (Math.abs(rate) / dt - (st.cyc ?? 0)) * Math.min(1, dt * 4);
  const pace = Math.min(1, (1.9 / Math.max(st.cyc, 0.1)) ** 2) * (1 - (r.beast?.gw ?? 0));
  const spine = (o.spine ?? 1) * w * pace, dip = (o.dip ?? 1) * w * pace;
  const at = (f) => TAU * (ph - f);
  // shoulders and hips turn against each other: the side whose foot reaches forward leads
  const sh = Math.cos(at(FOOT.fr)), hp = Math.cos(at(FOOT.hr));
  nudge(b.body, 0, -0.07 * spine * hp, 0.035 * spine * hp);
  nudge(b.chest, 0, -0.11 * spine * sh + 0.07 * spine * hp, -0.045 * spine * sh);
  // each end dips just after its feet land (twice a cycle each), the hips' dip under the shoulders' by a beat. A
  // raised cosine, smooth all the way round: the first version clipped a cosine at zero, and that kink at every
  // half step made the trunk, head and tail twitch on each footfall (owner, 2026-11-04: "the walk itself stutters")
  const dipF = 0.5 + 0.5 * Math.cos(2 * at(FOOT.fr + 0.06)), dipH = 0.5 + 0.5 * Math.cos(2 * at(FOOT.hr + 0.06));
  // (only a small sink of the whole trunk: pitching the shoulders and the hips in turn folded and unfolded the
  // body like an inchworm, owner 2026-11-04 "it inches along")
  if (b.body) b.body.position.y -= 0.012 * dip * (dipF + dipH) * 0.5;
  // Steps: the feet are planted (see plantFeet).
  if (o.plant !== false) plantFeet(r, w * (1 - (r.beast?.gw ?? 0)), ph, o.liftHeight ?? 0.35);
  // follow-through: what the trunk does, the head and tail do a beat later and a little past it
  const turn = Math.max(-3, Math.min(3, s.turn || 0));
  // the trunk going down (+) or up (-), worked out from the dips' own phase (smooth), not differenced frame to
  // frame (which carried every uneven frame time into the head); d/dt of dip * (dipF + dipH) / 2
  const bv = -dip / (o.dip ?? 1) * 0.5 * st.cyc * TAU * (Math.sin(2 * at(FOOT.fr + 0.06)) + Math.sin(2 * at(FOOT.hr + 0.06))) * Math.sign(rate || 1);
  const nod = spring(st, 'nod', 0.05 * bv * (o.head ?? 1), dt, 70, 0.4);
  const look = spring(st, 'look', -0.08 * turn * (o.head ?? 1), dt, 60, 0.5);
  // (o.gain: eased to 0 while an attack poses the body, so the follow-through fades in and out with it)
  const g = o.gain ?? 1;
  nudge(b.neck, clamp(nod * 0.6) * g, clamp(look * 0.5) * g, 0);
  nudge(b.head, clamp(nod * 0.5) * g, clamp(look * 0.5) * g, 0);
  const tailSway = spring(st, 'tail', (0.22 * hp * w * pace + 0.12 * turn) * (o.tail ?? 1), dt, 45, 0.35);
  const tailLift = spring(st, 'tailUp', -0.06 * bv * (o.tail ?? 1), dt, 55, 0.4);
  nudge(b.tail, clamp(tailLift) * g, clamp(tailSway) * g, 0);
}
const clamp = (x) => Math.max(-0.6, Math.min(0.6, x));
