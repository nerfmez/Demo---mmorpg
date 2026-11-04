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
  nudge(b.chest, 0.05 * dip * dipF, 0, 0);
  nudge(b.body, -0.035 * dip * dipH, 0, 0);
  if (b.body) b.body.position.y -= 0.018 * dip * (dipF + dipH) * 0.5;
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
