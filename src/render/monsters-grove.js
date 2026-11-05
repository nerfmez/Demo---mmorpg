// Moonroot Grove monsters (levels 6-10), built from the owner's concept sheets
// (assets/moonroot/*_concept.jpg). Each body shows the part it drops - leaf ears, glass wings,
// ivory digging claws - and each wind-up is a pose readable from the game camera: a hare that
// rears on its hind legs or crouches to leap, a moth that spreads its mirror wings still, a mole
// that raises a claw or sinks into the ground. Same rig/cel rules as monsters.js; no per-frame
// allocations.
import * as THREE from 'three';
import { RigBuilder, damp, clamp01 } from './rig.js';

const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const windK = (s) => (s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0);

// ---------- fern-ear hare: cream fur, moss-green back, two big fern-leaf ears ----------

function leaf(rb, bone, len, width, colors, o = {}) {
  // a fern leaf: a cream blade with a green inner leaf and two side lobes
  const [cream, green] = colors;
  rb.add(bone, sph(0.5, 10, 8).scale(width, len, 0.16).translate(0, len * 0.5, 0), cream, o);
  rb.add(bone, sph(0.5, 10, 8).scale(width * 0.62, len * 0.78, 0.1).translate(0, len * 0.52, 0.035), green, { ...o, plain: true });
  for (const [s, y] of [[1, 0.42], [-1, 0.42], [1, 0.66], [-1, 0.66]]) {
    rb.add(bone, sph(0.5, 8, 6).scale(width * 0.5, len * 0.28, 0.1).translate(s * width * 0.42, len * y, 0.01), green, { ...o, plain: true, rot: [0, 0, -s * 0.5] });
  }
}

function buildHare() {
  const C = { fur: '#efe5d2', shade: '#d9cbb2', moss: '#6f8f58', mossDark: '#58744a', eye: '#f0a93a', nose: '#e7a0a2', tooth: '#fffaf0', paw: '#8a7a6a' };
  const rb = new RigBuilder({ outline: 0.02, darkness: 0.34 });
  rb.bone('body', 'root', [0, 0.44, 0]);
  rb.bone('head', 'body', [0, 0.2, 0.34]);
  // body: a round haunch behind a slimmer chest; the green back runs from neck to tail
  rb.add('body', sph(0.36, 14, 10).scale(0.9, 0.82, 1.25), C.fur, { pos: [0, 0, -0.05] });
  rb.add('body', sph(0.33, 12, 8).scale(0.86, 0.5, 1.15), C.moss, { pos: [0, 0.14, -0.06] });
  rb.add('body', sph(0.24, 10, 8).scale(1, 1, 1), C.fur, { pos: [0, 0.03, 0.24] });
  // tail: a small fern tuft
  rb.bone('tail', 'body', [0, 0.12, -0.48]);
  leaf(rb, 'tail', 0.3, 0.2, [C.fur, C.moss], { rot: [-2.1, 0, 0] });
  // head: round, a leafy ruff on the cheeks, buck teeth, amber eyes
  rb.add('head', sph(0.2, 12, 10).scale(1, 0.92, 1.05), C.fur);
  rb.add('head', sph(0.11, 8, 6).scale(1.2, 0.8, 1), C.fur, { pos: [0, -0.06, 0.15] });
  rb.add('head', sph(0.03, 6, 4), C.nose, { pos: [0, -0.02, 0.24], plain: true });
  rb.add('head', new THREE.BoxGeometry(0.06, 0.05, 0.02), C.tooth, { pos: [0, -0.12, 0.2], plain: true });
  rb.add('head', sph(0.12, 8, 6).scale(0.8, 0.35, 0.8), C.moss, { pos: [0, 0.17, 0.02], plain: true });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.045, 8, 6).scale(1, 1.15, 0.7), C.eye, { pos: [s * 0.1, 0.03, 0.15], glow: true });
    rb.add('head', sph(0.02, 6, 4), '#2a2018', { pos: [s * 0.105, 0.03, 0.18], plain: true });
    for (let i = 0; i < 3; i++) rb.add('head', sph(0.5, 6, 4).scale(0.07, 0.13, 0.04), C.moss, { pos: [s * (0.17 + i * 0.02), -0.06 - i * 0.02, 0.06], rot: [0, 0, s * (1.2 + i * 0.3)], plain: true });
  }
  // ears: two tall fern leaves, the part the hare drops
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`ear${n}`, 'head', [s * 0.08, 0.14, -0.02], [-0.25, 0, -s * 0.22]);
    leaf(rb, `ear${n}`, 0.62, 0.24, [C.fur, C.moss]);
  }
  // legs: slim forelegs, big hind thighs
  const legs = [];
  for (const [z, y, s, big] of [[0.26, -0.08, 1, 0], [0.26, -0.08, -1, 0], [-0.24, -0.02, 1, 1], [-0.24, -0.02, -1, 1]]) {
    const n = `leg${legs.length}`;
    rb.bone(n, 'body', [s * 0.15, y, z]);
    if (big) rb.add(n, sph(0.16, 10, 8).scale(0.7, 1, 1.2), C.fur, { pos: [0, -0.06, 0] });
    rb.add(n, new THREE.CylinderGeometry(0.045, 0.038, 0.32, 6).translate(0, -0.16, 0), C.fur, { pos: [0, big ? -0.08 : 0, 0] });
    rb.add(n, sph(0.06, 8, 6).scale(1, 0.55, big ? 1.8 : 1.3), C.shade, { pos: [0, big ? -0.4 : -0.32, 0.04] });
    legs.push(n);
  }
  const rig = rb.build();
  rig.legs = legs;
  rig.height = 1.15;
  return rig;
}

function animHare(r, s, dt, time) {
  const b = r.bones, k = windK(s);
  // a bounding gait: the whole body arcs on each hop
  r.phase = (r.phase || 0) + dt * (s.moving ? 9 + s.speedFactor * 4 : 0);
  const w = (r.runW = damp(r.runW || 0, s.moving ? 1 : 0, 10, dt)), hop = Math.abs(Math.sin(r.phase));
  let bodyY = 0.44 + hop * 0.22 * w, bodyX = -Math.cos(r.phase) * 0.18 * w, headX = 0, ears = Math.sin(time * 2.2 + r.seed) * 0.06, squash = 1;
  let fore = Math.sin(r.phase) * 0.7 * w, hind = -Math.sin(r.phase) * 0.9 * w;
  if (s.windup === 'hop') {
    // crouch low, ears laid back, hind legs coiled
    bodyY = 0.44 - 0.16 * k;
    squash = 1 - 0.15 * k;
    ears = -0.9 * k;
    hind = 0.6 * k;
    headX = 0.2 * k;
  } else if (s.windup === 'kick') {
    // rears up, forepaws lifted, ready to strike out
    bodyX = -0.55 * k;
    bodyY = 0.44 + 0.12 * k;
    fore = -1.2 * k;
    ears = 0.3 * k;
    headX = 0.3 * k;
  } else if (s.state === 'act' && s.lastAttack === 'kick') {
    const c = clamp01(s.actT / Math.max(0.01, s.hitTime || 0.1));
    bodyX = -0.55 + 0.9 * c;
    fore = -1.2 + 2.2 * c;
    hind = -0.5 * c;
  } else if (s.state === 'act') {
    // mid-leap: stretched out
    bodyX = -0.2;
    fore = -1;
    hind = 1.1;
    ears = -0.7;
  } else if (s.state === 'stunned') {
    headX = 0.4 + Math.sin(time * 9) * 0.1;
  }
  if (s.hurt > 0) bodyX -= 0.2 * s.hurt;
  b.body.position.y = damp(b.body.position.y, bodyY, 14, dt);
  b.body.rotation.x = damp(b.body.rotation.x, bodyX, 12, dt);
  b.body.scale.y = damp(b.body.scale.y, squash, 12, dt);
  b.head.rotation.x = damp(b.head.rotation.x, headX, 12, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.7, 5, dt);
  b.earL.rotation.x = damp(b.earL.rotation.x, -0.25 + ears - 0.25 * w, 9, dt);
  b.earR.rotation.x = damp(b.earR.rotation.x, -0.25 + ears - 0.25 * w + Math.sin(time * 3.1) * 0.04, 9, dt);
  b.tail.rotation.y = Math.sin(time * 4 + r.seed) * 0.25;
  r.legs.forEach((n, i) => { b[n].rotation.x = damp(b[n].rotation.x, i < 2 ? fore : hind, 16, dt); });
}

// ---------- mirrorwing moth: a navy fuzzy body, cream ruff, four glass wings ----------

function wingShape(len, width, tip) {
  // a rounded wing: wide at the tip, narrow at the root (local +X outward, +Y forward)
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.3, width * 0.9, len * 0.85, width * (0.6 + tip), len, width * 0.15 + tip * width);
  s.bezierCurveTo(len * 1.02, -width * 0.25, len * 0.6, -width * 0.55, 0, -width * 0.12);
  return new THREE.ShapeGeometry(s, 8);
}

function buildMoth() {
  const C = { body: '#2d3266', dark: '#1f2348', ruff: '#efe6d2', glass: '#bfe9f5', glint: '#e9fbff', frame: '#2b2f62', eye: '#f2b33a' };
  const rb = new RigBuilder({ outline: 0.018, darkness: 0.36, rim: 0.5 });
  rb.bone('body', 'root', [0, 1.6, 0]);
  rb.bone('head', 'body', [0, 0.06, 0.26]);
  // body: a round fuzzy abdomen under a cream ruff
  rb.add('body', sph(0.24, 12, 10).scale(0.95, 0.95, 1.25), C.body, { pos: [0, -0.06, -0.12] });
  rb.add('body', sph(0.2, 12, 8).scale(1.15, 0.7, 0.9), C.ruff, { pos: [0, 0.04, 0.12] });
  for (let i = 0; i < 3; i++) rb.add('body', new THREE.TorusGeometry(0.2 - i * 0.03, 0.012, 4, 14).rotateX(Math.PI / 2), C.dark, { pos: [0, -0.06, -0.18 - i * 0.12], plain: true });
  // six thin legs hanging under the body
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) rb.add('body', new THREE.CylinderGeometry(0.012, 0.008, 0.32, 4).translate(0, -0.16, 0), C.dark, { pos: [s * 0.08, -0.16, 0.08 - i * 0.12], rot: [0.3, 0, s * 0.35], plain: true });
  // head: a dark mask, big amber eyes, two long feathered antennae
  rb.add('head', sph(0.13, 10, 8).scale(1.1, 1, 0.95), C.body);
  for (const s of [1, -1]) {
    rb.add('head', sph(0.06, 8, 6).scale(1, 1.2, 0.7), C.eye, { pos: [s * 0.07, 0.02, 0.09], glow: true });
    rb.add('head', new THREE.CylinderGeometry(0.008, 0.012, 0.55, 4).translate(0, 0.27, 0), C.frame, { pos: [s * 0.05, 0.08, 0.04], rot: [0.5, 0, -s * 0.35], plain: true });
    rb.add('head', sph(0.5, 6, 4).scale(0.05, 0.13, 0.02), C.frame, { pos: [s * 0.27, 0.5, 0.28], rot: [0.5, 0, -s * 0.35], plain: true });
  }
  // wings: a dark frame behind each pale glass pane, upper and lower pair (the part it drops)
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`wing${n}`, 'body', [s * 0.12, 0.1, 0.02]);
    for (const [len, width, tip, y, back] of [[0.95, 0.42, 0.35, 0.12, 0], [0.62, 0.28, 0.1, -0.16, 1]]) {
      const frame = wingShape(len + 0.06, width + 0.06, tip).scale(s, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -y);
      const pane = wingShape(len - 0.04, width - 0.06, tip).scale(s, 1, 1).rotateX(-Math.PI / 2).translate(s * 0.03, 0.006, -y);
      rb.add(`wing${n}`, frame, C.frame, { plain: true, rot: [0, 0, back ? -s * 0.15 : 0] });
      rb.add(`wing${n}`, pane, back ? '#d9f1f2' : C.glass, { plain: true, rot: [0, 0, back ? -s * 0.15 : 0] });
      rb.add(`wing${n}`, new THREE.PlaneGeometry(0.05, width * 0.9).rotateX(-Math.PI / 2).rotateY(-s * 0.6).translate(s * len * 0.55, 0.012, -y), C.glint, { glow: true });
    }
  }
  const rig = rb.build();
  rig.height = 2.1;
  return rig;
}

function animMoth(r, s, dt, time) {
  const b = r.bones, k = windK(s);
  let flap = 9, amp = 0.55, open = 0.15, bob = Math.sin(time * 2.6 + r.seed) * 0.12, lean = s.moving ? 0.15 : 0;
  if (s.windup === 'shard_rain') {
    // rises, wings raised high and held still while the glass shards gather overhead
    flap = 2;
    amp = 0.12 * (1 - k);
    open = 0.15 + 0.45 * k;
    lean = -0.25 * k;
    bob += 0.35 * k;
  } else if (s.windup === 'mirror_ring') {
    // wings opened flat and wide, beating faster and faster as the moonlight ring gathers
    flap = 6 + 20 * k;
    amp = 0.2 + 0.15 * k;
    open = 0.15 - 0.4 * k;
    bob *= 0.3;
  } else if (s.state === 'recover' && s.lastAttack === 'shard_rain') {
    // wings swept down: the shards are thrown
    open = -0.35;
    flap = 4;
  }
  r.phase = (r.phase || 0) + dt * flap;
  const beat = Math.sin(r.phase) * amp + open;
  b.wingL.rotation.z = damp(b.wingL.rotation.z, beat, 18, dt);
  b.wingR.rotation.z = damp(b.wingR.rotation.z, -beat, 18, dt);
  b.body.position.y = damp(b.body.position.y, 1.6 + bob - (s.hurt || 0) * 0.15, 8, dt);
  b.body.rotation.x = damp(b.body.rotation.x, lean, 6, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.8, 5, dt);
}

// ---------- rootdigger mole: a heavy purple-grey hump, cream stripe, ivory digging claws ----------

function buildMole() {
  const C = { fur: '#76678a', dark: '#544866', cream: '#ede2c8', hand: '#7b5a3f', claw: '#f2e9d4', nose: '#e59aa0', eye: '#e7922c' };
  const rb = new RigBuilder({ outline: 0.024, darkness: 0.32 });
  rb.bone('body', 'root', [0, 0.52, 0]);
  rb.bone('head', 'body', [0, 0.12, 0.6]);
  // body: a broad hump with a cream chest; a pale blaze runs from the snout over the crown
  rb.add('body', sph(0.56, 16, 12).scale(1.05, 0.88, 1.2), C.fur, { pos: [0, 0.02, -0.08] });
  rb.add('body', sph(0.38, 12, 10).scale(1.05, 0.9, 0.8), C.cream, { pos: [0, -0.16, 0.3] });
  for (let i = 0; i < 6; i++) rb.add('body', cone(0.07, 0.2, 4), C.dark, { pos: [Math.sin(i * 2.1) * 0.45, 0.22 + Math.cos(i * 1.7) * 0.18, -0.3 - (i % 3) * 0.16], rot: [-1.2, i, 0.4], plain: true });
  rb.bone('tail', 'body', [0, 0, -0.7]);
  rb.add('tail', cone(0.07, 0.36, 5).rotateX(-Math.PI / 2), C.dark);
  // head: pushed out in front of the hump so the camera sees it - a long pink-nosed snout,
  // the cream blaze from nose to crown, small round ears, narrow amber eyes
  rb.add('head', sph(0.3, 12, 10).scale(1, 0.85, 1.05), C.fur);
  rb.add('head', cone(0.17, 0.46, 10).rotateX(Math.PI / 2).scale(1, 0.72, 1), C.fur, { pos: [0, -0.06, 0.34] });
  rb.add('head', sph(0.1, 10, 8).scale(0.75, 0.32, 3.4), C.cream, { pos: [0, 0.14, 0.12], rot: [0.28, 0, 0] });
  rb.add('head', sph(0.12, 10, 8).scale(1.1, 0.8, 0.9), C.cream, { pos: [0, -0.16, 0.18] });
  rb.add('head', sph(0.065, 8, 6), C.nose, { pos: [0, -0.07, 0.57], plain: true });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.034, 6, 4).scale(1.4, 0.6, 0.6), C.eye, { pos: [s * 0.13, 0.08, 0.24], glow: true });
    rb.add('head', sph(0.06, 6, 4).scale(1, 0.85, 0.5), C.nose, { pos: [s * 0.22, 0.2, 0], plain: true });
  }
  // fore-arms: brown hands with three long ivory claws each (the part it drops)
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`arm${n}`, 'body', [s * 0.5, -0.14, 0.42]);
    rb.add(`arm${n}`, new THREE.CylinderGeometry(0.12, 0.14, 0.32, 8).translate(0, -0.16, 0), C.fur, { rot: [0.5, 0, 0] });
    rb.bone(`hand${n}`, `arm${n}`, [0, -0.28, 0.16]);
    rb.add(`hand${n}`, sph(0.17, 10, 8).scale(1.1, 0.55, 1), C.hand);
    for (let i = 0; i < 3; i++) rb.add(`hand${n}`, cone(0.055, 0.46, 6).rotateX(Math.PI / 2 + 0.5), C.claw, { pos: [(i - 1) * 0.11, -0.08, 0.28] });
  }
  // hind legs (their own bones, so the feet step; data/models.json legL/legR)
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`leg${n}`, 'body', [s * 0.42, -0.27, -0.24]);
    rb.add(`leg${n}`, sph(0.14, 8, 6).scale(1, 0.6, 1.3), C.hand, { pos: [0, -0.19, -0.05] });
  }
  const rig = rb.build();
  rig.height = 1.25;
  return rig;
}

// Its kit (docs/MONSTER-ATTACKS.md), each move on the anime beat - anticipation, a held pose, a very short strike,
// overshoot, a held finish, recovery:
//   ตะปบขุด (swipe): it rears back with both digging claws raised high and held, then scoops them down and across
//     in one snap on the hit, carrying through low before it settles;
//   สาดดิน (spray): hunched, nose down, its claws churn the ground faster and faster, then both fling forward
//     together as the clods fly;
//   มุดดินโผล่ราก (erupt): it digs in, claws churning, and sinks out of sight; it bursts up at the marked spot with
//     its claws flung high.
const ease = (x) => x * x * (3 - 2 * x);
function animMole(r, s, dt, time) {
  const b = r.bones, k = windK(s);
  // Walking (owner, 2026-11-05: "it must part the earth with its hands as it walks"): a breaststroke through the soil.
  // Locked to its ground speed (one stroke every 0.75 m): both front paws reach forward together, close in under the
  // nose (u 0..0.4), then part the earth, sweeping wide out to the sides and back (0.4..0.85) while the body surges
  // forward with the push, and recover in (to 1); the hind feet shuffle alternately under it. MonsterFx throws the
  // parted earth off each paw at the height of the sweep (skillfx/mole-fx.js walkDig).
  const sp = s.smoothSpeed ?? s.speed ?? (s.moving ? 1.5 : 0);
  const w = (r.runW = damp(r.runW || 0, clamp01(sp / 0.5), 8, dt));
  r.phase = (r.phase || 0) + dt * Math.min(12, (sp * Math.PI * 2) / 0.75) * (s.backing ? -1 : 1);
  const u = (((r.phase / (Math.PI * 2)) % 1) + 1) % 1, sn = Math.sin(r.phase);
  const reach = u < 0.4 ? ease(u / 0.4) : 1 - ease(Math.min(1, (u - 0.4) / 0.45));  // 1 = paws forward and in
  const part = u < 0.4 ? 0 : u < 0.85 ? ease((u - 0.4) / 0.45) : 1 - ease((u - 0.85) / 0.15); // 1 = swept wide
  const push = u > 0.4 && u < 0.85 ? Math.sin(((u - 0.4) / 0.45) * Math.PI) : 0;
  let sink = 0, armL = (-0.55 * reach + 0.35 * part) * w, armR = armL, headX = Math.sin(time * 1.4 + r.seed) * 0.04 + 0.04 * push * w;
  let armLz = (0.05 + 0.3 * part) * w, armRz = -armLz;
  let legL = 0.4 * sn * w, legR = -0.4 * sn * w;
  let armLy = (-0.25 * reach + 0.85 * part) * w, armRy = -armLy;
  let bodyZ = 0.04 * sn * w, bodyX = (0.06 + 0.06 * push) * w, twist = 0, lift = 0.03 * push * w, fast = false;
  const headY = 0;
  const after = s.state === 'recover' ? s.actT || 0 : -1;
  if (s.windup || after >= 0) { armLz = armRz = armLy = armRy = 0; legL = legR = 0; }
  // Real mole digging, not raised arms (owner, 2026-11-05: "unnatural"): a mole's front paws are turned outward and
  // dig with sideways strokes, like breaststroke; the strike is that stroke done hard.
  if (s.windup === 'erupt') {
    // digs in with fast alternating strokes, nose down, and is fully under by a third of the wind-up (only then
    // does the ground start to heave toward the mark)
    r.churn = (r.churn || 0) + dt * 24;
    sink = clamp01(k / 0.32);
    armLy = 0.15 + 0.45 * Math.max(0, Math.sin(r.churn)); armRy = -(0.15 + 0.45 * Math.max(0, -Math.sin(r.churn)));
    armL = 0.35 * Math.sin(r.churn); armR = -0.35 * Math.sin(r.churn);
    headX = 0.45; bodyX = 0.3; fast = true;
  } else if (s.windup === 'swipe') {
    // anticipation (to 0.55 of the wind-up): it hunkers down, nose low, and draws both paws in under its chest,
    // turned to scoop; held, quivering, until the strike
    const a = ease(Math.min(1, k / 0.55)), held = k > 0.55 ? Math.sin(time * 34) * 0.03 : 0;
    armL = 0.35 * a; armR = 0.35 * a; armLy = -0.35 * a + held; armRy = 0.35 * a - held;
    bodyX = 0.16 * a; lift = -0.05 * a; headX = 0.22 * a; bodyZ = 0;
  } else if (after >= 0 && s.lastAttack === 'swipe') {
    // the strike: both paws sweep forward and out to the sides in one snap (0.07 s), the body lunging with them;
    // carried a touch past, held to 0.3 s, then home
    const snap = ease(Math.min(1, after / 0.07)), back = ease(Math.min(1, Math.max(0, after - 0.3) / 0.35));
    const o = 1 + 0.12 * Math.sin(Math.min(1, after / 0.16) * Math.PI);
    armL = (0.35 - 0.95 * snap) * (1 - back); armR = armL;
    armLy = (-0.35 + 1.05 * snap * o) * (1 - back); armRy = -armLy;
    bodyX = (0.16 - 0.24 * snap) * (1 - back); headX = (0.22 - 0.3 * snap) * (1 - back); lift = (-0.05 + 0.07 * snap) * (1 - back);
    fast = after < 0.12;
  } else if (s.windup === 'spray') {
    // nose down, digging hard with alternating sideways strokes, faster and faster
    const a = ease(Math.min(1, k / 0.2)), rate = 14 + 14 * k;
    r.churn = (r.churn || 0) + dt * rate;
    armLy = (0.1 + 0.5 * Math.max(0, Math.sin(r.churn))) * a; armRy = -(0.1 + 0.5 * Math.max(0, -Math.sin(r.churn))) * a;
    armL = 0.3 * Math.sin(r.churn) * a; armR = -0.3 * Math.sin(r.churn) * a;
    bodyX = 0.22 * a; headX = 0.4 * a; sink = 0.04 * a; bodyZ = 0.05 * Math.sin(r.churn) * a; fast = true;
  } else if (after >= 0 && s.lastAttack === 'spray') {
    // the fling: both paws scoop up and forward together, the head coming up; held a beat, then settles
    const snap = ease(Math.min(1, after / 0.06)), back = ease(Math.min(1, Math.max(0, after - 0.22) / 0.3));
    armL = armR = (0.3 - 1.0 * snap) * (1 - back); armLy = 0.25 * snap * (1 - back); armRy = -armLy;
    bodyX = (0.22 - 0.3 * snap) * (1 - back); headX = (0.4 - 0.55 * snap) * (1 - back); lift = 0.04 * snap * (1 - back);
    fast = after < 0.1;
  } else if (after >= 0 && s.lastAttack === 'erupt') {
    // bursts up out of the pit, paws flung out to the sides, then shakes the earth off
    const t = Math.min(1, after / 0.12), back = ease(Math.min(1, Math.max(0, after - 0.35) / 0.35));
    armL = armR = -0.7 * t * (1 - back); armLy = 0.6 * t * (1 - back); armRy = -armLy;
    headX = -0.3 * t * (1 - back); bodyZ = Math.sin(after * 30) * 0.08 * back * (1 - back) * 4; fast = true;
  } else if (s.state === 'stunned') {
    headX = 0.3 + Math.sin(time * 10) * 0.1;
  }
  // sinking is quick on the way down and quicker on the way up (the burst)
  r.sink = damp(r.sink || 0, sink, s.windup === 'erupt' ? 12 : sink ? 3.5 : 14, dt);
  const f = fast ? 40 : 12; // strikes follow their keys almost at once; idle and walking ease
  r.lift = damp(r.lift || 0, lift, f, dt);
  b.body.position.y = 0.52 - r.sink * 1.3 + r.lift;
  b.body.rotation.z = damp(b.body.rotation.z, bodyZ, f, dt);
  b.body.rotation.x = damp(b.body.rotation.x, bodyX + (s.hurt || 0) * -0.15 + r.sink * 0.3, f, dt);
  b.body.rotation.y = damp(b.body.rotation.y, twist, f, dt);
  b.head.rotation.x = damp(b.head.rotation.x, headX, f, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.6 + headY, 5, dt);
  b.armL.rotation.x = damp(b.armL.rotation.x, armL, fast ? 40 : 14, dt);
  b.armR.rotation.x = damp(b.armR.rotation.x, armR, fast ? 40 : 14, dt);
  b.armL.rotation.z = damp(b.armL.rotation.z, armLz, 14, dt);
  b.armR.rotation.z = damp(b.armR.rotation.z, armRz, 14, dt);
  b.armL.rotation.y = damp(b.armL.rotation.y, armLy, 14, dt);
  b.armR.rotation.y = damp(b.armR.rotation.y, armRy, 14, dt);
  if (b.legL) { b.legL.rotation.x = damp(b.legL.rotation.x, legL, 16, dt); b.legR.rotation.x = damp(b.legR.rotation.x, legR, 16, dt); }
  b.tail.rotation.y = Math.sin(time * 3 + r.seed) * 0.2;
}

export const GROVE_BUILDERS = {
  fern_ear_hare: [buildHare, animHare],
  mirrorwing_moth: [buildMoth, animMoth],
  rootdigger_mole: [buildMole, animMole],
};
export const GROVE_SCALE = { fern_ear_hare: 0.7, mirrorwing_moth: 1, rootdigger_mole: 1.3 }; // the mole bigger (owner, 2026-11-05)
