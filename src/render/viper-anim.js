// The reed viper's body (owner, 2026-11-06: the owner's straight Meshy snake, "make the snake's animation realistic").
// A snake moves by lateral undulation: its head swings from side to side as it goes and every part of its body
// passes through the same points the head passed through, so the S-curves stand still on the ground while the snake
// flows along them (no part slides sideways). So the body here follows the head's trail: the head's path is
// recorded (its side-to-side wave set by the distance travelled, wavelength and swing a share of its length), and
// each bone sits on that path at its own distance behind the head, turned along it. Standing still it keeps the
// curves it stopped in; turning on the spot, the head swings round and the body follows it round.
// On top: an alert snake holds its head and neck a little raised and looks at its prey, its forked tongue flicks out
// now and then, and its kit's poses lift and push the front of the body (the head and the first few joints) in the
// head's frame. The bones are a straight chain directly under the root (data/models.json reed_viper), so each one is
// set alone: position and turn. Cosmetic only; no allocation per frame.
import * as THREE from 'three';
import { RigBuilder, damp, clamp01 } from './rig.js';

export const VIPER_SEGS = 13;
// (rig units: the model scaled 1.7 and moved back 1.12 so the root is at its neck - the monster is where its head is)
const S = 1.7, OFFZ = -1.12, Y0 = 0.078, ZH = 0.72 * S + OFFZ, STEP = 0.1285 * S;
const MAX = 220; // trail points kept
const Z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _a = new THREE.Vector3();

/** The procedural stand-in (shown only if its model is missing): the same straight chain, a tapered tube. */
export function buildViper() {
  const C = { body: '#5d8a46', belly: '#e2cf6a', tongue: '#d8483a', eye: '#ffd23a' };
  const rb = new RigBuilder({ outline: 0.02, darkness: 0.3 });
  rb.bone('head', 'root', [0, Y0, ZH]);
  rb.add('head', new THREE.SphereGeometry(0.1, 10, 8).scale(1, 0.6, 1.8), C.body, { pos: [0, 0.02, 0.18] });
  for (const s of [1, -1]) rb.add('head', new THREE.SphereGeometry(0.025, 6, 5), C.eye, { pos: [s * 0.06, 0.06, 0.22], glow: true });
  rb.bone('tongue', 'head', [0, -0.0085, 0.4]);
  // the forked tongue: two thin prongs from one stem (kept over the model: data/models.json keep)
  rb.add('tongue', new THREE.BoxGeometry(0.012, 0.006, 0.12).translate(0, 0, 0.06), C.tongue, { plain: true });
  for (const s of [1, -1]) rb.add('tongue', new THREE.BoxGeometry(0.008, 0.005, 0.06).translate(0, 0, 0.03), C.tongue, { pos: [s * 0.008, 0, 0.115], rot: [0, s * 0.45, 0], plain: true });
  for (let i = 0; i < VIPER_SEGS; i++) {
    const z = ZH - i * STEP, r0 = 0.085 * (1 - (i / VIPER_SEGS) * 0.85) + 0.01;
    rb.bone(`seg${i}`, 'root', [0, Y0, z]);
    rb.add(`seg${i}`, new THREE.CylinderGeometry(r0, r0 * 0.9, STEP + 0.04, 8).rotateX(Math.PI / 2).scale(1, 0.8, 1), i % 3 ? C.body : C.belly, { pos: [0, 0, -STEP / 2] });
  }
  const rig = rb.build();
  rig.height = 0.5;
  rig.faceMove = true; // it goes where its head points: circling, its body turns along its path (monster-views.js)
  return rig;
}

function setup(r) {
  const b = r.bones, D = new Float32Array(VIPER_SEGS + 1);
  const zh = b.head.userData.rest.pos.z;
  for (let i = 0; i < VIPER_SEGS; i++) D[i] = zh - b[`seg${i}`].userData.rest.pos.z;
  D[VIPER_SEGS] = zh - (b[`seg${VIPER_SEGS - 1}`].userData.rest.pos.z - (D[VIPER_SEGS - 1] - D[VIPER_SEGS - 2]));
  return {
    D, zh, y0: b.seg0.userData.rest.pos.y, tx: new Float32Array(MAX), tz: new Float32Array(MAX), n: 0, head: 0,
    px: 0, pz: 0, ph: 0, moveW: 0, init: false, pts: Array.from({ length: VIPER_SEGS + 1 }, () => new THREE.Vector3()),
    ease: { alert: 0, coil: 0, out: 0, gather: 0, wrap: 0, lash: 0, look: 0 }, wrapA: 0, tongue: 0, nextFlick: 1 + Math.random() * 2,
  };
}

// the point `dist` m back along the trail from the head at (hx, hz), into out (x, z)
function trailAt(B, hx, hz, dist, out) {
  let x = hx, z = hz, left = dist, dx = 0, dz = -1;
  for (let k = 0; k < B.n; k++) {
    const i = (B.head - k + MAX) % MAX, nx = B.tx[i], nz = B.tz[i], L = Math.hypot(nx - x, nz - z);
    if (L > 1e-6) { dx = (nx - x) / L; dz = (nz - z) / L; }
    if (L >= left) { out.x = x + dx * left; out.z = z + dz * left; return out; }
    left -= L; x = nx; z = nz;
  }
  out.x = x + dx * left; out.z = z + dz * left; // past the trail's end: straight on the way it was going
  return out;
}
function push(B, x, z) { B.head = (B.head + 1) % MAX; B.tx[B.head] = x; B.tz[B.head] = z; B.n = Math.min(MAX, B.n + 1); }

export function animViper(r, s, dt, time) {
  const b = r.bones, B = r.snake || (r.snake = setup(r)), sc = r.root.scale.x || 1;
  const ry = r.root.rotation.y, rx = r.root.position.x, rz = r.root.position.z, fx = Math.sin(ry), fz = Math.cos(ry), sx = fz, sz = -fx;
  const L = B.D[VIPER_SEGS] * sc, spacing = L / 60;
  // how far it moved (a jump of half its length or more is a teleport: the trail starts again)
  const md = B.init ? Math.hypot(rx - B.px, rz - B.pz) : Infinity;
  B.px = rx; B.pz = rz;
  const moving = md < L * 0.5 && md > 1e-4;
  B.moveW = damp(B.moveW, moving && dt > 0 ? clamp01(md / dt / 1.2) : 0, 4, dt);
  if (moving) B.ph += (md / (0.7 * L)) * Math.PI * 2;
  const amp = 0.12 * L * B.moveW, hx = rx + fx * B.zh * sc + sx * amp * Math.sin(B.ph), hz = rz + fz * B.zh * sc + sz * amp * Math.sin(B.ph);
  if (!B.init || md >= L * 0.5) {
    // laid out straight behind the head
    B.n = 0; for (let k = 40; k >= 1; k--) push(B, hx - fx * k * L / 36, hz - fz * k * L / 36);
    B.init = true;
  }
  const last = B.head;
  if (Math.hypot(hx - B.tx[last], hz - B.tz[last]) >= spacing) push(B, hx, hz);
  // each joint on the trail, in the root's space (rig units)
  const c = Math.cos(ry), sn = Math.sin(ry), P = B.pts;
  for (let i = 0; i <= VIPER_SEGS; i++) {
    trailAt(B, hx, hz, B.D[i] * sc, _a);
    const dx = _a.x - rx, dz = _a.z - rz;
    P[i].set((dx * c - dz * sn) / sc, B.y0, (dx * sn + dz * c) / sc);
  }
  // the kit's poses (eased):
  //   alert: head and neck a little raised; coil: the neck folded back into a level S, head up a little (before a
  //   strike, and between strikes); out: the S flung straight forward, the head low (the strike: out in 0.05 s, snapped
  //   back by 0.2 s, as a viper's is); gather: low and coiled for the rush; wrap: wound round its prey; lash: the tail
  //   drawn aside, then whipped round behind it
  const E = B.ease, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0, ease = (x) => x * x * (3 - 2 * x);
  let alert = s.aggro ? 1 : 0, coil = 0, out = 0, gather = 0, wrap = 0, lash = 0, shake = 0;
  const st = s.strikeT ?? Infinity;
  if (st < 0.25) { out = st < 0.05 ? st / 0.05 : st < 0.1 ? 1 : 1 - ease(clamp01((st - 0.1) / 0.15)); coil = s.fangAim ? 1 - out : 0; }
  else if (s.windup === 'fang_strike') { coil = ease(clamp01(k / 0.6)); shake = 0.6 * k; }
  else if (s.fangAim) { coil = 1; shake = 0.4; }
  else if (s.windup === 'constrict') { gather = ease(clamp01(k / 0.7)); shake = k; alert = 0; }
  else if (s.coil === 'dash') { alert = 0; }
  else if (s.coil === 'hold') wrap = 1;
  else if (s.windup === 'tail_lash') lash = -ease(clamp01(k / 0.8));
  else if (s.state === 'recover' && s.lastAttack === 'tail_lash' && s.actT < 0.6) { const t = s.actT; lash = t < 0.12 ? -1 + 3.2 * ease(t / 0.12) : 2.2 * (1 - ease(clamp01((t - 0.12) / 0.45))); }
  const snap = st < 0.25 ? 70 : 14;
  E.alert = damp(E.alert, alert, 4, dt); E.coil = damp(E.coil, coil, snap, dt); E.out = damp(E.out, out, snap, dt);
  E.gather = damp(E.gather, gather, 10, dt); E.wrap = damp(E.wrap || 0, wrap, wrap ? 14 : 5, dt);
  E.lash = s.windup === 'tail_lash' || (s.state === 'recover' && s.lastAttack === 'tail_lash') ? lash : damp(E.lash || 0, 0, 10, dt);
  // the head's frame: along the body at the neck
  _d.subVectors(P[0], P[2]).setY(0);
  if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
  _d.normalize();
  const hxl = _d.x, hzl = _d.z, shk = shake * 0.02 * Math.sin(time * 50);
  for (let i = 0; i < 6; i++) {
    const w = PROFILE[i];
    const up = (0.16 * E.alert + 0.3 * E.coil) * w + (0.06 * E.out - 0.04 * E.gather) * w;
    const along = -0.55 * E.coil * SBACK[i] + 0.8 * E.out * OUT[i] - 0.3 * E.gather * SBACK[i];
    const side = (0.24 * E.coil + 0.3 * E.gather) * SSIDE[i] + shk;
    P[i].x += hxl * along + hzl * side; P[i].z += hzl * along - hxl * side; P[i].y = Math.max(0.04, P[i].y + up);
  }
  // the tail whip: the back half swung round its middle, more toward the tip, the tip lifted
  if (Math.abs(E.lash) > 1e-3) {
    const px = P[5].x, pz = P[5].z;
    for (let i = 6; i <= VIPER_SEGS; i++) {
      const f = (i - 5) / (VIPER_SEGS - 5), a = E.lash * (0.45 + 0.55 * f), ca = Math.cos(a), sa = Math.sin(a), dx = P[i].x - px, dz = P[i].z - pz;
      P[i].x = px + dx * ca + dz * sa; P[i].z = pz - dx * sa + dz * ca; P[i].y += 0.12 * f * Math.min(1, Math.abs(E.lash));
    }
  }
  // wound round its prey (the root is on it): the front ten joints on a rising coil, two turns, the head on top
  // looking down at it; the coils tighten on each squeeze
  if (E.wrap > 1e-3) {
    const R = (0.5 / sc) * (1 - 0.1 * Math.max(0, Math.sin(time * Math.PI * 4))), w = E.wrap;
    for (let i = 0; i <= 9; i++) {
      const a = B.wrapA - i * ((Math.PI * 2) / 5), y = 0.12 + (9 - i) * 0.075, r = i === 0 ? R * 0.6 : R;
      P[i].x += (Math.sin(a) * r - P[i].x) * w; P[i].z += (Math.cos(a) * r - P[i].z) * w; P[i].y += (y - P[i].y) * w;
    }
  } else B.wrapA = Math.atan2(P[3].x, P[3].z); // it winds on from the side it came in
  // the bones: each at its point, turned along the body toward the head
  for (let i = 0; i < VIPER_SEGS; i++) {
    const bone = b[`seg${i}`];
    bone.position.copy(P[i]);
    _d.subVectors(P[i], P[i + 1]); if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
    bone.quaternion.setFromUnitVectors(Z, _d.normalize());
  }
  // the head: at the neck, along the neck, turned toward its prey and kept level (it aims its strike)
  _d.subVectors(P[0], P[1]).normalize();
  const aim = s.aggro || s.windup ? 1 : 0, yawN = Math.atan2(_d.x, _d.z);
  E.look = damp(E.look, aim, 6, dt);
  const off = Math.atan2(Math.sin((s.lookYaw || 0) - yawN), Math.cos((s.lookYaw || 0) - yawN)), yaw = yawN + off * 0.6 * E.look;
  const pitch = Math.asin(Math.max(-1, Math.min(1, _d.y))) * 0.35; // the neck's slope, mostly levelled out
  _a.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  b.head.position.copy(P[0]);
  b.head.quaternion.setFromUnitVectors(Z, _a);
  b.head.scale.setScalar(1);
  // the tongue: flicked out now and then (two quick flicks), out while it hisses
  B.nextFlick -= dt;
  if (B.nextFlick <= 0) { B.tongue = 0.001; B.nextFlick = 1.4 + Math.random() * 2.2; }
  let tg = 0;
  if (B.tongue > 0) { B.tongue += dt; const t = B.tongue / 0.42; tg = t < 1 ? Math.abs(Math.sin(t * Math.PI * 2)) : 0; if (t >= 1) B.tongue = 0; }
  if (E.wrap > 0.5 || E.gather > 0.5) tg = 0.8 + 0.2 * Math.sin(time * 40);
  if (b.tongue) { b.tongue.scale.set(1, 1, Math.max(0.001, tg)); b.tongue.visible = tg > 0.02; b.tongue.rotation.y = Math.sin(time * 37) * 0.15 * tg; }
}
// how much of each pose each of the first joints takes (the head end most), and how far each is drawn back in the S
const PROFILE = [1, 0.85, 0.6, 0.35, 0.15, 0.04];
const SBACK = [1, 0.75, 0.4, 0.15, 0, 0];
// the S seen from above (sideways, by joint) and how far each joint goes out on the strike
const SSIDE = [0, 0.7, 0.2, -0.6, -0.3, 0];
const OUT = [1, 0.8, 0.55, 0.32, 0.14, 0.03];
