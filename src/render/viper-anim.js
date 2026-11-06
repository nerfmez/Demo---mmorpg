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
const S = 1.7, Y0 = 0.078, ZH = 0.72 * S, STEP = 0.1285 * S, ZTIP = -0.95 * S;
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
    ease: { alert: 0, coil: 0, out: 0, flat: 0, rear: 0, puff: 1, look: 0 }, tongue: 0, nextFlick: 1 + Math.random() * 2,
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
  // the kit's poses (eased): alert (head and neck a little up), coil (the S drawn back and up before a strike), out
  // (the strike flung forward), flat (lying in wait), rear (reared up high), puff (the body swollen)
  const E = B.ease, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0, ease = (x) => x * x * (3 - 2 * x);
  let alert = s.aggro ? 1 : 0, coil = 0, out = 0, flat = 0, rear = 0, puff = 1, shake = 0;
  if (s.windup === 'fang_strike') { coil = ease(clamp01(k / 0.6)); shake = k; }
  else if (s.state === 'recover' && s.struck) { const t = s.actT; out = t < 0.06 ? t / 0.06 : 1 - ease(clamp01((t - 0.12) / 0.45)); coil = 1 - out; }
  else if (s.windup === 'ambush' || s.ambush === 'wait') { flat = s.windup ? ease(k) : 1; alert = 0; }
  else if (s.ambush === 'trig') coil = ease(clamp01(s.ambushT / 0.15));
  else if (s.windup === 'hiss') { const q = ease(clamp01(k / 0.7)); rear = q; puff = 1 + 0.22 * q; shake = k; }
  else if (s.state === 'recover' && s.lastAttack === 'hiss') { const q = 1 - ease(clamp01((s.actT - 0.15) / 0.5)); rear = 0.6 * q; out = 0.35 * q; puff = 1 + 0.22 * q; }
  const fast = s.state === 'recover' && s.actT < 0.1 ? 40 : 12;
  E.alert = damp(E.alert, alert, 4, dt); E.coil = damp(E.coil, coil, fast, dt); E.out = damp(E.out, out, fast, dt);
  E.flat = damp(E.flat, flat, 8, dt); E.rear = damp(E.rear, rear, 10, dt); E.puff = damp(E.puff, puff, 8, dt);
  // the head's frame: along the body at the neck
  _d.subVectors(P[0], P[2]).setY(0).normalize();
  const hxl = _d.x, hzl = _d.z, shk = shake * 0.02 * Math.sin(time * 50);
  for (let i = 0; i < 6; i++) {
    const w = PROFILE[i];
    // up: alert raises the neck a little, coil into an S up and back, rear high; flat presses it down
    const up = (0.16 * E.alert + 0.62 * E.coil + 0.95 * E.rear) * w - 0.03 * E.flat * w;
    // along: coil draws it back over the body, the strike flings it forward
    const along = (-0.5 * E.coil * SBACK[i] - 0.25 * E.rear * SBACK[i] + 1.15 * E.out * w);
    P[i].x += hxl * along + hzl * shk; P[i].z += hzl * along - hxl * shk; P[i].y = Math.max(0.04, P[i].y + up);
  }
  // the bones: each at its point, turned along the body toward the head
  for (let i = 0; i < VIPER_SEGS; i++) {
    const bone = b[`seg${i}`];
    bone.position.copy(P[i]);
    _d.subVectors(P[i], P[i + 1]); if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
    bone.quaternion.setFromUnitVectors(Z, _d.normalize());
    bone.scale.set(i < 6 ? 1 + (E.puff - 1) * (1 - i / 6) : 1, i < 6 ? 1 + (E.puff - 1) * (1 - i / 6) : 1, 1);
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
  if (E.rear > 0.3) tg = 0.8 + 0.2 * Math.sin(time * 40);
  if (b.tongue) { b.tongue.scale.set(1, 1, Math.max(0.001, tg)); b.tongue.visible = tg > 0.02; b.tongue.rotation.y = Math.sin(time * 37) * 0.15 * tg; }
}
// how much of each pose each of the first joints takes (the head end most), and how far each is drawn back in the S
const PROFILE = [1, 0.85, 0.6, 0.35, 0.15, 0.04];
const SBACK = [1, 0.75, 0.4, 0.15, 0, 0];
