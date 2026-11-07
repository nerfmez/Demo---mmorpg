// The earthburrow leviathan's body (owner, 2026-11-07: the owner's Meshy root viper and Earthburrow Leviathan sheet).
// Like the reed viper (viper-anim.js) a snake's body follows its head: every part passes through the points the head
// passed through, so its S-curves stand still on the ground while it flows along them. This one also goes up and
// down: the head's path is recorded in three dimensions, so when it dives its body pours into the hole after it, when
// it bursts out its body rises out of the same hole, and when it leaps it arcs through the air and dives in again,
// the body following the arc. Its height comes from the rules (m.headY: under the ground, in its leap). On top: it
// holds its head and neck reared like a cobra when it faces its prey, rears higher and draws back before its head
// smash, then slams the front of its body down; it rears tall and shakes as it roars. The bones are a straight chain
// directly under the root (data/models.json earthburrow_leviathan), each set alone. Cosmetic only; no allocation per
// frame.
import * as THREE from 'three';
import { RigBuilder, damp, clamp01 } from './rig.js';

export const LEVIATHAN_SEGS = 16;
const Y0 = 0.111, STEP = 0.1153, MAX = 260, LEAD = 1.0, BODY = 0.27; // (BODY: its girth in rig units)
const _d = new THREE.Vector3(), _a = new THREE.Vector3();
const ease = (x) => x * x * (3 - 2 * x);

/** The procedural stand-in (shown only if its model is missing): the same straight chain, a tapered tube. */
export function buildLeviathan() {
  const C = { body: '#8a5a34', belly: '#e2cfa4', eye: '#ffc23a' };
  const rb = new RigBuilder({ outline: 0.012, darkness: 0.3 });
  rb.bone('head', 'root', [0, Y0, 0]);
  rb.add('head', new THREE.SphereGeometry(0.1, 10, 8).scale(1.1, 0.7, 1.7), C.body, { pos: [0, 0.01, 0.08] });
  for (const s of [1, -1]) rb.add('head', new THREE.SphereGeometry(0.018, 6, 5), C.eye, { pos: [s * 0.06, 0.05, 0.1], glow: true });
  for (let i = 0; i < LEVIATHAN_SEGS; i++) {
    const r0 = 0.1 * (1 - (i / LEVIATHAN_SEGS) * 0.8) + 0.012;
    rb.bone(`seg${i}`, 'root', [0, Y0, -i * STEP]);
    rb.add(`seg${i}`, new THREE.CylinderGeometry(r0, r0 * 0.9, STEP + 0.03, 8).rotateX(Math.PI / 2).scale(1, 0.8, 1), i % 3 ? C.body : C.belly, { pos: [0, 0, -STEP / 2] });
  }
  const rig = rb.build();
  rig.height = 0.6;
  rig.faceMove = true; // it goes where its head points (monster-views.js)
  return rig;
}

function setup(r) {
  const b = r.bones, D = new Float32Array(LEVIATHAN_SEGS + 1), zh = b.head.userData.rest.pos.z;
  for (let i = 0; i < LEVIATHAN_SEGS; i++) D[i] = zh - b[`seg${i}`].userData.rest.pos.z;
  D[LEVIATHAN_SEGS] = D[LEVIATHAN_SEGS - 1] + STEP;
  return {
    D, zh, y0: b.seg0.userData.rest.pos.y, tx: new Float32Array(MAX), ty: new Float32Array(MAX), tz: new Float32Array(MAX), n: 0, head: 0,
    px: 0, pz: 0, ph: 0, moveW: 0, init: false, pts: Array.from({ length: LEVIATHAN_SEGS + 1 }, () => new THREE.Vector3()),
    E: { rear: 0, back: 0, slam: 0, roar: 0, look: 0 },
  };
}
function push(B, x, y, z) { B.head = (B.head + 1) % MAX; B.tx[B.head] = x; B.ty[B.head] = y; B.tz[B.head] = z; B.n = Math.min(MAX, B.n + 1); }
// the point `dist` back along the trail (3D) from the head at (hx, hy, hz), into out
function trailAt(B, hx, hy, hz, dist, out) {
  let x = hx, y = hy, z = hz, left = dist, dx = 0, dy = 0, dz = -1;
  for (let k = 0; k < B.n; k++) {
    const i = (B.head - k + MAX) % MAX, nx = B.tx[i], ny = B.ty[i], nz = B.tz[i], L = Math.hypot(nx - x, ny - y, nz - z);
    if (L > 1e-6) { dx = (nx - x) / L; dy = (ny - y) / L; dz = (nz - z) / L; }
    if (L >= left) { out.set(x + dx * left, y + dy * left, z + dz * left); return out; }
    left -= L; x = nx; y = ny; z = nz;
  }
  return out.set(x + dx * left, y + dy * left, z + dz * left); // past the trail's end: on the way it was going
}

export function animLeviathan(r, s, dt, time) {
  const b = r.bones, B = r.snake || (r.snake = setup(r)), sc = r.root.scale.x || 1;
  const ry = r.root.rotation.y, rx = r.root.position.x, rz = r.root.position.z, fx = Math.sin(ry), fz = Math.cos(ry), sx = fz, sz = -fx;
  const L = B.D[LEVIATHAN_SEGS] * sc, spacing = L / 80;
  const md = B.init ? Math.hypot(rx - B.px, rz - B.pz) : Infinity;
  B.px = rx; B.pz = rz;
  const moving = md < L * 0.5 && md > 1e-4;
  B.moveW = damp(B.moveW, moving && dt > 0 ? clamp01(md / dt / 2) : 0, 4, dt);
  if (moving) B.ph += (md / (0.65 * L)) * Math.PI * 2;
  // the head: its swing as it slithers (none under the ground or in the air), its height from the rules
  // its height from the rules, eased: coming up out of the ground it bursts up past the surface and settles (owner's
  // rule for objects: nothing pops); going down it follows at once
  const target = s.headY || 0;
  if (target > -0.5 && (B.hy ?? 0) < -1) B.riseT = 0;
  B.riseT = (B.riseT ?? 9) + dt;
  B.hy = target < (B.hy ?? 0) ? target : damp(B.hy ?? 0, target, 9, dt);
  const headY = B.hy + (B.riseT < 0.6 ? Math.sin(Math.PI * Math.min(1, B.riseT / 0.6)) * 2.2 : 0), ground = Math.abs(target) < 0.05 && B.riseT >= 0.6;
  const amp = (ground ? 0.1 : 0) * L * B.moveW;
  // (the head leads the root by LEAD m, so turning on the spot swings the head round and the body follows it)
  // under the ground it keeps digging on, forward and down, so its whole body pours into the hole after it even
  // when it stays put (tremor sense, after its leap)
  B.dig = target < -1 ? Math.min(L * 1.3, (B.dig || 0) + dt * L * 1.2) : 0;
  const hx = rx + fx * (B.zh * sc + LEAD + B.dig * 0.35) + sx * amp * Math.sin(B.ph), hz = rz + fz * (B.zh * sc + LEAD + B.dig * 0.35) + sz * amp * Math.sin(B.ph), hy = B.y0 * sc + headY - B.dig * 0.9;
  if (!B.init || md >= L * 0.5) {
    // laid out straight behind the head, at the head's height (under the ground it stays under)
    B.n = 0; for (let k = 50; k >= 1; k--) push(B, hx - fx * k * L / 44, hy, hz - fz * k * L / 44);
    B.init = true;
  }
  const last = B.head;
  if (Math.hypot(hx - B.tx[last], hy - B.ty[last], hz - B.tz[last]) >= spacing) push(B, hx, hy, hz);
  // each joint on the trail, in the root's space (rig units)
  const c = Math.cos(ry), sn = Math.sin(ry), P = B.pts;
  for (let i = 0; i <= LEVIATHAN_SEGS; i++) {
    trailAt(B, hx, hy, hz, B.D[i] * sc, _a);
    const dx = _a.x - rx, dz = _a.z - rz;
    P[i].set((dx * c - dz * sn) / sc, _a.y / sc, (dx * sn + dz * c) / sc);
  }
  // (owner, round 3: "parts of it lie over each other, and it twists and warps") the body is eased round its bends,
  // so a sharp turn of the head never folds it into a kink, and where it would cross itself the part further back
  // rises over the part in front, as a snake's does, instead of passing through it
  for (let it = 0; it < 2; it++) for (let i = 2; i < LEVIATHAN_SEGS; i++) {
    const p = P[i], a0 = P[i - 1], a1 = P[i + 1];
    p.x += ((a0.x + a1.x) / 2 - p.x) * 0.3; p.y += ((a0.y + a1.y) / 2 - p.y) * 0.3; p.z += ((a0.z + a1.z) / 2 - p.z) * 0.3;
  }
  for (let i = 0; i <= LEVIATHAN_SEGS - 3; i++) for (let j = i + 3; j <= LEVIATHAN_SEGS; j++) {
    const a0 = P[i], a1 = P[j], dx = a1.x - a0.x, dz = a1.z - a0.z, d = Math.hypot(dx, dz);
    if (d >= BODY || Math.abs(a1.y - a0.y) > BODY) continue;
    const k = 1 - d / BODY, nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0, push = (BODY - d) * 0.35;
    a1.x += nx * push; a1.z += nz * push; a0.x -= nx * push; a0.z -= nz * push;
    a1.y = Math.max(a1.y, a0.y + BODY * 0.8 * k);
  }
  // the poses (eased): rear (the cobra stance facing its prey; higher before the smash and as it roars), back (drawn
  // back before the smash), slam (the front thrown down onto the ground and held a moment), roar (its shake)
  const E = B.E, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0, onGround = ground && !s.burrow;
  let rear = s.aggro && onGround && !s.ring ? 0.55 : 0, back = 0, slam = 0, roar = 0;
  if (s.windup === 'head_smash') { rear = 0.55 + 0.6 * ease(clamp01(k / 0.7)); back = ease(clamp01(k / 0.7)); }
  else if (s.state === 'recover' && s.lastAttack === 'head_smash' && s.actT < 0.7) { const t = s.actT; slam = t < 0.07 ? t / 0.07 : t < 0.35 ? 1 : 1 - ease(clamp01((t - 0.35) / 0.35)); rear = 0; }
  else if (s.windup === 'burrow_hunt' || s.windup === 'tremor_sense' || s.windup === 'arc_leap') { rear = 0.55 + 0.4 * ease(clamp01(k / 0.5)) - 1.6 * ease(clamp01((k - 0.5) / 0.5)); }
  else if (s.windup === 'coil_ring') { rear = 0.2; }
  if (s.roar) { rear = 1.25; roar = 1; }
  const snap = slam > 0 ? 60 : 8;
  E.rear = damp(E.rear, rear, snap, dt); E.back = damp(E.back, back, 10, dt); E.slam = damp(E.slam, slam, snap, dt); E.roar = damp(E.roar, roar, 6, dt);
  // the front of the body in the head's frame: raised in an S (neck curved back over the body), thrown forward and down
  if (onGround || s.windup) {
    _d.subVectors(P[0], P[3]).setY(0);
    if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
    _d.normalize();
    const hxl = _d.x, hzl = _d.z, shake = E.roar * 0.012 * Math.sin(time * 45);
    for (let i = 0; i < 7; i++) {
      const w = PROFILE[i];
      const up = E.rear * 0.62 * w - E.slam * 0.04 * w;
      const along = -E.rear * 0.22 * SBACK[i] - E.back * 0.18 * SBACK[i] + E.slam * 0.32 * OUT[i];
      P[i].x += hxl * along + hzl * shake; P[i].z += hzl * along - hxl * shake; P[i].y = Math.max(-5, P[i].y + Math.max(-0.08, up));
    }
  }
  // the bones: each at its point, turned along the body toward the head with its back kept up (no roll: the shortest
  // turn from its rest let each joint roll its own way, wringing the skin between them)
  for (let i = 0; i < LEVIATHAN_SEGS; i++) {
    const bone = b[`seg${i}`];
    bone.position.copy(P[i]);
    _d.subVectors(P[i], P[i + 1]); if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
    orient(bone.quaternion, _d.normalize(), B);
  }
  // the head: at the neck, along the neck; on the ground turned toward its prey and kept nearly level (reared, it
  // looks down at its prey); diving, rising or leaping it follows its path
  _d.subVectors(P[0], P[1]).normalize();
  const yawN = Math.atan2(_d.x, _d.z), aim = (s.aggro || s.windup) && onGround ? 1 : 0;
  E.look = damp(E.look, aim, 6, dt);
  const off = Math.atan2(Math.sin((s.lookYaw || 0) - yawN), Math.cos((s.lookYaw || 0) - yawN)), yaw = yawN + off * 0.5 * E.look;
  const slope = Math.asin(Math.max(-1, Math.min(1, _d.y)));
  const pitch = onGround ? slope * 0.25 - 0.35 * E.rear * 0.5 - 0.5 * E.slam : slope;
  _a.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  b.head.position.copy(P[0]);
  orient(b.head.quaternion, _a.normalize(), B);
}
// a bone's turn: its +z along `dir`, its +x level (across the body), its +y up from its back; straight up or down,
// the last side kept
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _mb = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
function orient(q, dir, B) {
  _x.crossVectors(UP, dir);
  if (_x.lengthSq() < 1e-4) _x.copy(B.side || _x.set(1, 0, 0)); else _x.normalize();
  (B.side ||= new THREE.Vector3()).copy(_x);
  _y.crossVectors(dir, _x);
  q.setFromRotationMatrix(_mb.makeBasis(_x, _y, dir));
}
// how much of each pose each of the first joints takes (the head end most), how far each is drawn back in the S, and
// how far each goes out in the slam
const PROFILE = [1, 0.92, 0.75, 0.52, 0.3, 0.13, 0.03];
const SBACK = [1, 0.8, 0.5, 0.25, 0.08, 0, 0];
const OUT = [1, 0.85, 0.62, 0.4, 0.2, 0.07, 0];
