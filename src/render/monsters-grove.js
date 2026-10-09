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
  if (s.windup === 'glint') {
    // the wings spread flat and still: the mirror catches the light
    flap = 2;
    amp = 0.15 * (1 - k);
    open = 0.15 - 0.35 * k;
    lean = -0.2 * k;
  } else if (s.windup === 'scale_dust') {
    // fast shallow beats shake dust loose
    flap = 22;
    amp = 0.3 + 0.2 * k;
    bob *= 0.3;
  } else if (s.state === 'recover' && s.lastAttack === 'glint') {
    open = -0.1;
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
  for (const s of [1, -1]) rb.add('body', sph(0.14, 8, 6).scale(1, 0.6, 1.3), C.hand, { pos: [s * 0.4, -0.46, -0.42] });
  const rig = rb.build();
  rig.height = 1.25;
  return rig;
}

function animMole(r, s, dt, time) {
  const b = r.bones, k = windK(s);
  r.phase = (r.phase || 0) + dt * (s.moving ? 8 + s.speedFactor * 3 : 0);
  const w = (r.runW = damp(r.runW || 0, s.moving ? 1 : 0, 10, dt));
  let sink = 0, armL = Math.sin(r.phase) * 0.6 * w, armR = -Math.sin(r.phase) * 0.6 * w, headX = Math.sin(time * 1.4 + r.seed) * 0.04, bodyZ = Math.sin(r.phase) * 0.06 * w;
  if (s.windup === 'erupt') {
    // digs in: claws churn, the body sinks below the ground
    sink = k;
    armL = Math.sin(time * 22) * 0.9;
    armR = -Math.sin(time * 22) * 0.9;
    headX = 0.4;
  } else if (s.windup === 'swipe') {
    // raises the right claw high, braced on the left
    armR = -2 * k;
    armL = 0.3 * k;
    bodyZ = -0.15 * k;
    headX = -0.15 * k;
  } else if (s.state === 'recover' && s.lastAttack === 'swipe') {
    armR = 0.9;
    bodyZ = 0.12;
  } else if (s.state === 'recover' && s.lastAttack === 'erupt') {
    // bursts out of the ground: claws flung up
    armL = armR = -1.6;
    headX = -0.4;
  } else if (s.state === 'stunned') {
    headX = 0.3 + Math.sin(time * 10) * 0.1;
  }
  // sinking is quick on the way down and quicker on the way up (the burst)
  r.sink = damp(r.sink || 0, sink, sink ? 3.5 : 14, dt);
  b.body.position.y = 0.52 - r.sink * 1.3;
  b.body.rotation.z = damp(b.body.rotation.z, bodyZ, 10, dt);
  b.body.rotation.x = damp(b.body.rotation.x, (s.hurt || 0) * -0.15 + r.sink * 0.3, 10, dt);
  b.head.rotation.x = damp(b.head.rotation.x, headX, 10, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.6, 5, dt);
  b.armL.rotation.x = damp(b.armL.rotation.x, armL, 14, dt);
  b.armR.rotation.x = damp(b.armR.rotation.x, armR, 14, dt);
  b.tail.rotation.y = Math.sin(time * 3 + r.seed) * 0.2;
}

export const GROVE_BUILDERS = {
  fern_ear_hare: [buildHare, animHare],
  mirrorwing_moth: [buildMoth, animMoth],
  rootdigger_mole: [buildMole, animMole],
};
export const GROVE_SCALE = { fern_ear_hare: 0.7, mirrorwing_moth: 1, rootdigger_mole: 0.95 };
