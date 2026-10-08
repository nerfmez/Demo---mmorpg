// Mid/high monsters (levels 11-24). Each body shows the part it drops (scythe arms, reed
// scales, iron horns, the dusk mane, a rune core) and each wind-up is a pose the player can
// read from the game camera: scythes raised, a coiled neck, a pawing crouch, a low stalk, a
// spinning shard ring. Same rig/cel rules as monsters.js; no per-frame allocations.
import * as THREE from 'three';
import { advanceGait, poseLegs, wander, breath } from './monster-motion.js';
import { RigBuilder, damp, clamp01, Spring } from './rig.js';

const cylDown = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, -h / 2, 0);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 5) => new THREE.ConeGeometry(r, h, seg);
const clampAbs = (v, m) => (v > m ? m : v < -m ? -m : v);
const EARS = ['earL', 'earR'];
const ARMS = [['L', 1], ['R', -1]];
const windK = (s) => (s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0);

// ---------- thicket mantis: upright, two scythe arms ----------

function buildMantis() {
  const C = { body: '#6f9a3c', dark: '#3f5f2a', belly: '#b7c86a', thorn: '#7a4e2c', blade: '#e8dfb2', edge: '#fff6d6', eye: '#f2b33a', wing: '#86a84c', vein: '#5b7a34' };
  const rb = new RigBuilder({ outline: 0.022, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0.6, 0]);
  rb.bone('thorax', 'body', [0, 0.06, 0.2]);
  rb.bone('head', 'thorax', [0, 0.74, 0.12]);
  // abdomen: slim and segmented, two narrow leaf wings folded along it, bramble thorns
  rb.add('body', sph(0.2, 10, 8).scale(0.85, 0.7, 2.4), C.body, { pos: [0, 0.02, -0.4] });
  rb.add('body', sph(0.16, 8, 6).scale(0.8, 0.5, 2.2), C.belly, { pos: [0, -0.06, -0.38], plain: true });
  for (const s of [1, -1]) {
    rb.add('body', cone(0.11, 0.95, 4).rotateX(-Math.PI / 2).scale(1, 0.18, 1), C.wing, { pos: [s * 0.06, 0.17, -0.5], rot: [0.06, s * 0.08, 0] });
    rb.add('body', new THREE.BoxGeometry(0.012, 0.012, 0.8), C.vein, { pos: [s * 0.06, 0.2, -0.48], plain: true });
  }
  for (let i = 0; i < 3; i++) rb.add('body', cone(0.03, 0.13, 4), C.thorn, { pos: [0, 0.2, -0.05 - i * 0.24], rot: [-0.8, 0, 0], plain: true });
  // thorax: a long upright stalk, like a twig
  rb.add('thorax', new THREE.CylinderGeometry(0.065, 0.1, 0.76, 7).translate(0, 0.38, 0), C.body, { rot: [0.12, 0, 0] });
  rb.add('thorax', sph(0.11, 8, 6).scale(1, 0.8, 1.1), C.dark, { pos: [0, 0.03, 0] });
  for (let i = 0; i < 2; i++) rb.add('thorax', cone(0.025, 0.1, 4), C.thorn, { pos: [0, 0.3 + i * 0.2, -0.05], rot: [-1, 0, 0], plain: true });
  // head: a wide triangle, compound eyes at the corners, antennae
  rb.add('head', new THREE.ConeGeometry(0.15, 0.26, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1.25, 0.85, 1), C.body, { pos: [0, -0.02, 0.08] });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.07, 8, 6).scale(1, 1.15, 1), C.eye, { pos: [s * 0.16, 0.04, 0.02], glow: true });
    rb.add('head', new THREE.CylinderGeometry(0.006, 0.01, 0.46, 4).translate(0, 0.23, 0), C.dark, { pos: [s * 0.04, 0.06, 0.06], rot: [0.75, 0, -s * 0.3], plain: true });
  }
  rb.add('head', cone(0.035, 0.09, 4).rotateX(Math.PI / 2), C.dark, { pos: [0, -0.1, 0.2], plain: true });
  // raptorial arms: femur (spiked) and a curved tibia hook that folds back against it
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`arm${n}`, 'thorax', [s * 0.1, 0.62, 0.06]);
    rb.add(`arm${n}`, new THREE.CylinderGeometry(0.035, 0.05, 0.34, 6).translate(0, 0.17, 0), C.body);
    rb.bone(`blade${n}`, `arm${n}`, [0, 0.34, 0]);
    // femur: broad, flat, with a pale inner edge and thorny teeth
    rb.add(`blade${n}`, sph(0.1, 8, 6).scale(0.4, 2.6, 0.75).translate(0, -0.25, 0), C.blade);
    rb.add(`blade${n}`, new THREE.BoxGeometry(0.015, 0.42, 0.02).translate(0, -0.25, 0.07), C.edge, { plain: true });
    for (let i = 0; i < 4; i++) rb.add(`blade${n}`, cone(0.018, 0.08, 4), C.thorn, { pos: [0, -0.1 - i * 0.1, 0.08], rot: [Math.PI / 2 - 0.3, 0, 0], plain: true });
    // tibia: a hooked sickle at the end
    rb.add(`blade${n}`, cone(0.035, 0.32, 4).scale(0.5, 1, 1), C.edge, { pos: [0, -0.5, -0.06], rot: [-2.4, 0, 0] });
  }
  // four walking legs on the abdomen/thorax joint
  const legs = [];
  for (const [z, parent] of [[0.12, 'body'], [-0.24, 'body']]) for (const s of [1, -1]) {
    const n = `leg${legs.length}`;
    rb.bone(n, parent, [s * 0.1, -0.04, z]);
    rb.add(n, new THREE.CylinderGeometry(0.022, 0.018, 0.48, 5).translate(0, -0.24, 0), C.dark, { rot: [0, 0, s * 0.8] });
    rb.add(n, new THREE.CylinderGeometry(0.018, 0.01, 0.4, 5).translate(0, -0.2, 0), C.dark, { pos: [s * 0.33, -0.31, 0], rot: [0, 0, -s * 0.25] });
    legs.push(n);
  }
  const rig = rb.build();
  rig.legs = legs;
  rig.height = 1.8;
  return rig;
}

function animMantis(r, s, dt, time) {
  const b = r.bones, c = r.motion;
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  const drop = poseLegs(r, c, r.legs);
  // Arms extend +Y from the shoulder: rotation.x > 0 swings them forward/down. The blade hangs
  // back along the arm (folded) at 0 and opens forward as its rotation.x goes negative.
  let rear = Math.sin(time * 1.6 + r.seed) * 0.05, bodyY = 0.6;
  let arm = 0.95, blade = -0.25, spread = 0.1, head = 0, spin = 0; // rest: praying, scythes folded in front
  const k = windK(s);
  if (s.windup === 'scythe') {
    rear = -0.3 * k; // rears up, both scythes high and open
    arm = 0.95 - 1.15 * k;
    blade = -0.25 - 2.1 * k;
    spread = 0.1 + 0.4 * k;
    head = -0.15 * k;
  } else if (s.windup === 'whirl') {
    // both scythes spread wide to the sides, the body winds up for a full turn
    rear = 0.1 * k;
    bodyY -= 0.08 * k;
    arm = 0.6 - 0.5 * k;
    blade = -0.25 - 1.6 * k;
    spread = 0.1 + 1.0 * k;
    spin = -0.25 * k;
  } else if (s.state === 'act' && s.lastAttack === 'whirl') {
    const t = clamp01(s.actT / Math.max(0.01, s.actionTotal));
    spin = -0.25 + (Math.PI * 2 + 0.25) * t * t * (3 - 2 * t);
    rear = 0.1;
    arm = 0.1;
    blade = -1.85;
    spread = 1.1;
    bodyY -= 0.08;
  } else if (s.state === 'recover' && s.lastAttack === 'whirl') {
    spin = Math.PI * 2; // equivalent to rest; no reverse spin on recovery
  } else if (s.state === 'act' && s.lastAttack === 'scythe') {
    const c = clamp01(s.actT / Math.max(0.01, s.hitTime || 0.1));
    rear = -0.3 + 0.6 * c;
    arm = -0.2 + 1.9 * c; // the scythes come down and cross in front: an X
    blade = -2.35 + 0.8 * c;
    spread = 0.5 - 0.75 * c;
  } else if (s.state === 'act') {
    rear = 0.3;
    arm = 1.1;
    blade = -1.6;
  } else if (s.state === 'recover' && s.lastAttack === 'scythe') {
    rear = 0.3;
    arm = 1.6;
    blade = -1.2;
    spread = -0.2;
  } else if (s.state === 'stunned') {
    rear = 0.2 + Math.sin(time * 12) * 0.1;
  }
  if (s.hurt > 0) rear -= 0.25 * s.hurt;
  if (r.model) {
    // the imported model is bound with its scythes already raised and open (its display pose):
    // rest lowers and folds them a little, the wind-up lifts them higher, the strike swings down
    arm = 0.35 + (arm - 0.95) * 0.75;
    blade = 0.5 + (blade + 0.25) * 0.4;
    spread *= 0.5;
  }
  // a careful, swaying walk; the raised thorax sways like a twig in the wind and the head tilts
  // to watch (mantis curiosity), steady while the body bobs
  const P = r.pose || (r.pose = { y: 0.6, z: 0 });
  P.y = damp(P.y, bodyY, 16, dt);
  P.z = damp(P.z, clampAbs(-s.turn * 0.05, 0.2), 10, dt);
  const calm = s.windup || s.state === 'act' ? 0 : 1;
  b.thorax.rotation.x = damp(b.thorax.rotation.x, rear, 14, dt);
  b.thorax.rotation.z = (Math.sin(time * 0.9 + r.seed) * 0.05 * (1 - w) + Math.sin(ph) * c.roll * w) * calm;
  b.body.position.y = P.y - drop + c.bob * w * (0.5 + 0.5 * Math.cos(2 * ph)) + breath(time, r.seed, c) * 0.5 * (1 - w);
  b.body.rotation.z = P.z + Math.sin(ph) * c.roll * w;
  b.body.rotation.y = spin;
  b.head.rotation.x = damp(b.head.rotation.x, head, 12, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.9 + (s.aggro ? 0 : c.look * wander(time * 0.5, r.seed)) * calm, 8, dt);
  b.head.rotation.z = damp(b.head.rotation.z, Math.round(wander(time * 0.4, r.seed + 3) * 2) * 0.22 * calm, 10, dt);
  for (const [n, side] of ARMS) {
    b[`arm${n}`].rotation.x = damp(b[`arm${n}`].rotation.x, arm, 18, dt);
    b[`arm${n}`].rotation.z = damp(b[`arm${n}`].rotation.z, -side * spread, 18, dt);
    b[`blade${n}`].rotation.x = damp(b[`blade${n}`].rotation.x, blade, 18, dt);
  }
}

// ---------- reed viper: a long body that slithers in S curves ----------

const VIPER_SEGS = 9;

function buildViper() {
  const C = { body: '#5d8a46', band: '#2f4a2a', belly: '#e2cf6a', reed: '#a9b45a', eye: '#ffd23a', fang: '#f6f1df', tongue: '#d8483a' };
  const rb = new RigBuilder({ outline: 0.022, darkness: 0.3 });
  rb.bone('head', 'root', [0, 0.3, 0.55]);
  rb.bone('jaw', 'head', [0, -0.05, 0.02]);
  // head: a broad arrowhead (a viper's), brow ridges, slit eyes, fangs
  rb.add('head', new THREE.CylinderGeometry(0.0, 0.22, 0.42, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1, 0.45, 1), C.body, { pos: [0, 0.03, 0.14] });
  rb.add('head', sph(0.15, 10, 8).scale(1.15, 0.55, 1), C.body, { pos: [0, 0.02, -0.02] });
  rb.add('jaw', new THREE.CylinderGeometry(0.0, 0.17, 0.36, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1, 0.3, 1), C.belly, { pos: [0, -0.03, 0.13] });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.045, 6, 5).scale(1, 0.8, 1.1), C.eye, { pos: [s * 0.12, 0.08, 0.04], glow: true });
    rb.add('head', new THREE.BoxGeometry(0.12, 0.035, 0.13), C.band, { pos: [s * 0.11, 0.115, 0.04], rot: [0, 0, s * 0.3], plain: true });
    rb.add('head', cone(0.018, 0.09, 4), C.fang, { pos: [s * 0.06, -0.06, 0.3], rot: [Math.PI, 0, 0], plain: true });
  }
  rb.add('jaw', new THREE.BoxGeometry(0.02, 0.01, 0.2).translate(0, 0, 0.1), C.tongue, { pos: [0, 0.02, 0.28], plain: true });
  // body: tapered tubes that overlap at each joint, banded, reed spines along the back
  let parent = 'head';
  const radius = (i) => 0.15 * (1 - (i / VIPER_SEGS) * 0.8) + 0.025;
  for (let i = 0; i < VIPER_SEGS; i++) {
    const n = `seg${i}`, r0 = radius(i), r1 = radius(i + 1), len = 0.3;
    rb.bone(n, parent, [0, i === 0 ? -0.1 : 0, i === 0 ? -0.1 : -len]);
    rb.add(n, new THREE.CylinderGeometry(r0, r1, len + 0.12, 9).rotateX(Math.PI / 2).scale(1, 0.78, 1), i % 3 === 1 ? C.band : C.body, { pos: [0, 0, -len / 2] });
    rb.add(n, new THREE.CylinderGeometry(r0 * 0.75, r1 * 0.75, len + 0.1, 7).rotateX(Math.PI / 2).scale(1, 0.4, 1), C.belly, { pos: [0, -r0 * 0.42, -len / 2], plain: true });
    if (i < VIPER_SEGS - 2 && i % 2 === 0) rb.add(n, cone(0.028, 0.16 * (1 - i / VIPER_SEGS * 0.6), 4), C.reed, { pos: [0, r0 * 0.7, -len / 2], rot: [-0.5, 0, 0], plain: true });
    parent = n;
  }
  rb.add(`seg${VIPER_SEGS - 1}`, cone(0.03, 0.22, 5).rotateX(-Math.PI / 2), C.band, { pos: [0, 0, -0.4] });
  const rig = rb.build();
  rig.height = 0.9;
  return rig;
}

function animViper(r, s, dt, time) {
  const b = r.bones;
  // the S-wave travels down the body as fast as the snake moves over the ground (each curve
  // pushes against the same spot), plus a slow idle sway
  const w = advanceGait(r, s, dt, r.motion);
  const speed = s.state === 'act' ? 14 : 1.6 + (r.speed || 0) * 5.5;
  r.wavePh = (r.wavePh || 0) + dt * speed;
  const k = windK(s);
  let amp = 0.22 + 0.16 * w, lift = 0, jaw = 0.05 + Math.max(0, Math.sin(time * 1.3 + r.seed)) ** 30 * 0.25, coil = 0;
  const wave = r.modelCfg?.wave ?? 1; // a coiled model wriggles less than a long straight one (data/models.json wave)
  if (s.windup === 'lash') {
    // coil: the S tightens, the head rises and draws back
    amp = 0.22 + 0.35 * k;
    coil = k;
    lift = 0.55 * k;
    jaw = 0.5 * k;
  } else if (s.windup === 'venom') {
    lift = 0.7 * k;
    jaw = 0.9 * k;
    amp = 0.15;
  } else if (s.state === 'act') {
    amp = 0.06;
    lift = -0.15;
    jaw = 0.8;
  } else if (s.state === 'recover' && s.lastAttack === 'lash') {
    const hit = 1 - clamp01(s.actT / 0.25);
    lift = -0.25 * hit;
    jaw = 0.8 * hit;
    amp = 0.06;
  } else if (s.state === 'recover' && s.lastAttack === 'venom') {
    lift = 0.3;
    jaw = 0.2;
  }
  if (s.hurt > 0) lift -= 0.2 * s.hurt;
  r.lift = damp(r.lift || 0, lift, 12, dt);
  // the model already rears its head high on an S-shaped neck: the head tilts back from the neck
  // instead of rising (its pivot is where the neck meets the head) and the body stays put
  const rest = b.head.userData.rest?.pos;
  const model = !!r.model;
  b.head.rotation.x = damp(b.head.rotation.x, -r.lift * (model ? 0.6 : 0.8), 12, dt);
  b.head.position.y = damp(b.head.position.y, model ? rest.y : 0.3 + r.lift * 0.75, 12, dt);
  b.head.position.z = damp(b.head.position.z, (model ? rest.z : 0.55) - coil * 0.35, 12, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.6 + Math.sin(r.wavePh) * amp * 0.4, 10, dt);
  b.jaw.rotation.x = damp(b.jaw.rotation.x, jaw, 18, dt);
  for (let i = 0; i < VIPER_SEGS; i++) {
    const seg = b[`seg${i}`];
    // the wave travels down the body
    seg.rotation.y = damp(seg.rotation.y, Math.sin(r.wavePh - i * 0.85) * amp * wave * (i === 0 ? 0.5 : 1), 14, dt);
    // procedural: the neck slopes down from the raised head and the body levels out again at
    // seg2, so only the front rears up; model: seg0 undoes the head tilt for the body
    const x = model ? (i === 0 ? r.lift * 0.6 : 0) : i === 0 ? -r.lift * 0.4 : i === 2 ? r.lift * 1.2 : 0;
    seg.rotation.x = damp(seg.rotation.x, x, 12, dt);
  }
}

// ---------- ironhorn ram: heavy fleece, curled iron horns, charges ----------

function buildRam() {
  const C = { wool: '#8f8473', woolD: '#6e6457', face: '#3b322d', horn: '#5f5c5c', hornD: '#3a3838', ridge: '#d8d2c4', stone: '#a9b1b6', hoof: '#221e1b', eye: '#f0b030' };
  const rb = new RigBuilder({ outline: 0.03, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0.85, 0]);
  rb.bone('chest', 'body', [0, 0.04, 0.36]);
  rb.bone('neck', 'chest', [0, 0.12, 0.26]);
  rb.bone('head', 'neck', [0, 0.06, 0.2]);
  // fleece in lumps, a stone-crusted saddle (it rubs on crags)
  rb.add('body', sph(0.46, 12, 10).scale(0.95, 0.85, 1.3), C.wool, { pos: [0, 0, -0.12] });
  for (let i = 0; i < 4; i++) rb.add('body', sph(0.16, 7, 5).scale(1, 0.6, 1.2), C.woolD, { pos: [(i % 2 ? 0.26 : -0.26), 0.14, 0.05 - i * 0.18] });
  // crag plates grown into the fleece along the back: it rubs against the cliffs
  for (const [x, y, z, r] of [[0.1, 0.38, 0.1, 0.17], [-0.12, 0.36, -0.12, 0.15], [0.06, 0.34, -0.36, 0.13]]) rb.add('body', new THREE.DodecahedronGeometry(r, 0).scale(1.2, 0.6, 1.1), C.stone, { pos: [x, y, z] });
  rb.add('chest', sph(0.42, 12, 10).scale(1, 1.05, 0.95), C.wool);
  rb.add('chest', new THREE.DodecahedronGeometry(0.2, 0).scale(1.4, 0.6, 1), C.stone, { pos: [0, 0.36, -0.02] });
  rb.add('chest', sph(0.16, 8, 6).scale(0.8, 1.4, 0.6), C.woolD, { pos: [0, -0.2, 0.3] }); // beard
  rb.add('neck', sph(0.22, 10, 8).scale(0.95, 1, 1.1), C.woolD);
  rb.add('head', sph(0.2, 10, 8).scale(0.9, 0.95, 1.25), C.face, { pos: [0, 0, 0.06] });
  rb.add('head', sph(0.12, 8, 6).scale(1, 0.8, 1.1), C.face, { pos: [0, -0.08, 0.24] });
  rb.add('head', sph(0.15, 8, 6).scale(1.1, 0.6, 0.9), C.wool, { pos: [0, 0.14, 0.02] }); // forelock
  for (const s of [1, -1]) {
    rb.add('head', sph(0.032, 6, 5).scale(1.2, 0.7, 1), C.eye, { pos: [s * 0.13, 0.04, 0.14], glow: true });
    // a curled iron horn: a ridged spiral round the ear
    const curl = new THREE.TorusGeometry(0.17, 0.065, 6, 14, Math.PI * 1.55);
    rb.add('head', curl, C.horn, { pos: [s * 0.2, 0.08, -0.04], rot: [0, s * 1.35, 0.5] });
    rb.add('head', cone(0.05, 0.16, 5), C.ridge, { pos: [s * 0.3, 0.2, -0.02], rot: [0, 0, -s * 1.1], plain: true });
    rb.add('head', new THREE.TorusGeometry(0.17, 0.069, 3, 14, Math.PI * 1.55), C.hornD, { pos: [s * 0.205, 0.08, -0.04], rot: [0, s * 1.35, 0.5], plain: true });
    rb.add('head', cone(0.06, 0.14, 5), C.ridge, { pos: [s * 0.25, -0.12, 0.1], rot: [0.2, 0, s * 0.6], plain: true });
    rb.bone(`ear${s > 0 ? 'L' : 'R'}`, 'head', [s * 0.14, 0.02, -0.06]);
    rb.add(`ear${s > 0 ? 'L' : 'R'}`, sph(0.05, 6, 5).scale(1.6, 0.5, 0.8).translate(s * 0.06, 0, 0), C.face);
  }
  const legs = [];
  for (const [x, z, parent] of [[0.2, 0.06, 'chest'], [-0.2, 0.06, 'chest'], [0.2, -0.46, 'body'], [-0.2, -0.46, 'body']]) {
    const n = `leg${legs.length}`;
    rb.bone(n, parent, [x, -0.18, z]);
    rb.add(n, cylDown(0.09, 0.07, 0.36, 7), C.woolD);
    rb.bone(`${n}k`, n, [0, -0.35, 0]);
    rb.add(`${n}k`, cylDown(0.055, 0.05, 0.3, 6), C.face);
    rb.add(`${n}k`, new THREE.CylinderGeometry(0.06, 0.07, 0.08, 6), C.hoof, { pos: [0, -0.31, 0.01] });
    legs.push(n);
  }
  rb.bone('tail', 'body', [0, 0.18, -0.68]);
  rb.add('tail', sph(0.09, 6, 5).scale(1, 1.3, 0.8), C.wool, { pos: [0, -0.05, 0] });
  const rig = rb.build();
  rig.legs = legs;
  rig.height = 1.6;
  return rig;
}

function animRam(r, s, dt, time) {
  const b = r.bones, legs = r.legs, k = windK(s), c = r.motion;
  const w = advanceGait(r, s, dt, c);
  const moving = w > 0.3;
  const ph = r.phase, run = r.runK;
  const drop = poseLegs(r, c, legs);
  const calm = s.windup || s.state === 'act' || s.aggro ? 0 : 1 - w;
  // grazing: the head dips to the ground now and then while it stands
  const graze = Math.max(0, wander(time * 0.27, r.seed + 2)) ** 2 * 0.6 * calm;
  let front = 0, bodyX = 0, bodyY = 0.85, headX = 0.05 + graze, headY = s.lookYaw * 0.6 + c.look * wander(time * 0.4, r.seed) * calm;
  if (s.windup === 'shove') {
    // head low and swung to one side, a hoof scrapes the ground before the horn sweep
    headX = 0.5 * k;
    bodyX = 0.08 * k;
    bodyY -= 0.1 * k;
    headY = -0.45 * k;
    b[legs[0]].rotation.x = Math.sin(time * 16) * 0.55 * k;
  } else if (s.windup === 'stomp') {
    // rears on its hind legs
    bodyX = -0.85 * k;
    bodyY += 0.38 * k;
    front = -1.35 * k;
    headX = -0.35 * k;
  } else if (s.state === 'act') {
    headX = 0.55;
    bodyX = 0.12;
  } else if (s.state === 'recover' && s.lastAttack === 'shove') {
    const hit = 1 - clamp01(s.actT / 0.35);
    headX = 0.5 * hit;
    headY = 0.5 * hit;
    bodyX = 0.12 * hit;
  } else if (s.state === 'recover' && s.lastAttack === 'stomp') {
    bodyX = 0.18;
    headX = 0.3;
  } else if (s.state === 'stunned') {
    headX = 0.4 + Math.sin(time * 10) * 0.12;
    b.body.rotation.z = Math.sin(time * 7) * 0.12;
  }
  if (front) { b[legs[0]].rotation.x = front; b[legs[1]].rotation.x = front * 0.9; }
  if (s.hurt > 0) bodyX -= 0.18 * s.hurt;
  const P = r.pose || (r.pose = { x: 0, y: 0.85, z: 0, headX: 0 });
  if (s.state !== 'stunned') P.z = damp(P.z, clampAbs(-s.turn * 0.05 - (s.vSide || 0) * 0.02, 0.15), 10, dt);
  else P.z = b.body.rotation.z;
  P.x = damp(P.x, bodyX + c.lean * clampAbs(r.accel || 0, 5), 12, dt);
  P.y = damp(P.y, bodyY, 16, dt);
  P.headX = damp(P.headX, headX, 14, dt);
  const rock = c.pitch * w * ((1 - run) * Math.sin(2 * ph) + run * 2.5 * Math.sin(ph + 0.8));
  const roll = c.roll * w * Math.sin(ph) * (1 - 0.6 * run);
  b.body.rotation.x = P.x + rock;
  b.body.position.y = P.y - drop + c.bob * w * (1 + run) * (0.5 + 0.5 * Math.cos(2 * ph));
  if (s.state !== 'stunned') b.body.rotation.z = P.z + roll;
  b.chest.rotation.y = -c.sway * w * Math.sin(ph);
  const br = breath(time, r.seed, c) * (1 - 0.6 * w);
  b.body.scale.set(1 + br, 1, 1 + br * 0.4);
  b.head.rotation.x = P.headX - rock * c.headSteady;
  b.head.rotation.y = damp(b.head.rotation.y, headY, s.lastAttack === 'shove' ? 18 : 5, dt);
  r.tailSpring = r.tailSpring || new Spring(60, 8);
  b.tail.rotation.z = r.tailSpring.update(Math.sin(time * (moving ? 12 : 3)) * 0.2, dt);
  for (const e of EARS) b[e].rotation.z = damp(b[e].rotation.z, (e === 'earL' ? 1 : -1) * (s.windup ? 0.5 : 0.1 + Math.sin(time * 2 + r.seed) * 0.05), 10, dt);
}

// ---------- duskmane stalker: a long cat with a pale mane ----------

function buildStalker() {
  const C = { fur: '#55507a', dark: '#2f2b45', stripe: '#3a3554', mane: '#d6d0e0', maneD: '#a49cb8', belly: '#8c86a3', eye: '#ffe08a', nose: '#1d1a24', claw: '#f2ecdf' };
  const rb = new RigBuilder({ outline: 0.024, darkness: 0.26, rim: 0.5 });
  rb.bone('body', 'root', [0, 0.66, 0]);
  rb.bone('chest', 'body', [0, 0.03, 0.4]);
  rb.bone('neck', 'chest', [0, 0.1, 0.22]);
  rb.bone('head', 'neck', [0, 0.08, 0.16]);
  rb.bone('jaw', 'head', [0, -0.06, 0.08]);
  // long, lean body; stripes lie flat on the coat
  rb.add('body', sph(0.27, 12, 10).scale(0.78, 0.68, 1.9), C.fur, { pos: [0, 0, -0.14] });
  rb.add('body', sph(0.22, 10, 8).scale(0.78, 0.45, 1.7), C.belly, { pos: [0, -0.1, -0.12], plain: true });
  for (let i = 0; i < 4; i++) rb.add('body', sph(0.1, 7, 5).scale(2.05, 0.3, 0.42), C.stripe, { pos: [0, 0.125, 0.12 - i * 0.17], plain: true });
  rb.add('chest', sph(0.26, 12, 10).scale(0.85, 0.95, 1), C.fur);
  // the dusk mane: pale locks lying back over the neck and shoulders
  rb.add('neck', sph(0.19, 10, 8).scale(1.05, 1, 1.15), C.mane, { pos: [0, 0.02, -0.04] });
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 2.2;
    rb.add('neck', cone(0.07, 0.3, 5), i % 2 ? C.mane : C.maneD, { pos: [Math.sin(a) * 0.12, 0.1, -0.12], rot: [-1.85, 0, -a * 0.35] });
  }
  // a small cat head: short muzzle, big ears
  rb.add('head', sph(0.14, 12, 10).scale(1, 0.85, 1), C.fur);
  rb.add('head', sph(0.08, 8, 6).scale(1.2, 0.75, 1), C.belly, { pos: [0, -0.05, 0.11] });
  rb.add('head', sph(0.028, 6, 5), C.nose, { pos: [0, -0.01, 0.18], plain: true });
  rb.add('jaw', sph(0.06, 8, 6).scale(1.1, 0.5, 1.2), C.belly, { pos: [0, -0.01, 0.08] });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.032, 6, 5).scale(1.3, 0.8, 1), C.eye, { pos: [s * 0.07, 0.04, 0.11], glow: true });
    rb.add('jaw', cone(0.013, 0.06, 4), C.claw, { pos: [s * 0.03, 0.015, 0.12], rot: [Math.PI, 0, 0], plain: true });
    rb.bone(`ear${s > 0 ? 'L' : 'R'}`, 'head', [s * 0.08, 0.1, -0.02]);
    rb.add(`ear${s > 0 ? 'L' : 'R'}`, cone(0.055, 0.15, 4).translate(0, 0.07, 0), C.dark, { rot: [0, 0, -s * 0.2] });
    rb.add(`ear${s > 0 ? 'L' : 'R'}`, cone(0.012, 0.08, 3).translate(0, 0.18, 0), C.mane, { rot: [0, 0, -s * 0.2], plain: true }); // tuft
  }
  const legs = [];
  for (const [x, z, parent] of [[0.13, 0.06, 'chest'], [-0.13, 0.06, 'chest'], [0.13, -0.5, 'body'], [-0.13, -0.5, 'body']]) {
    const n = `leg${legs.length}`;
    rb.bone(n, parent, [x, -0.08, z]);
    rb.add(n, cylDown(0.065, 0.05, 0.34, 7), C.fur);
    rb.bone(`${n}k`, n, [0, -0.33, 0]);
    rb.add(`${n}k`, cylDown(0.045, 0.04, 0.27, 6), C.dark);
    rb.add(`${n}k`, sph(0.06, 6, 5).scale(1, 0.55, 1.3), C.dark, { pos: [0, -0.27, 0.03] });
    if (legs.length < 2) for (const c of [-1, 0, 1]) rb.add(`${n}k`, cone(0.011, 0.06, 3), C.claw, { pos: [c * 0.028, -0.28, 0.09], rot: [Math.PI / 2, 0, 0], plain: true });
    legs.push(n);
  }
  // a long tail that curls up at the end
  rb.bone('tail', 'body', [0, 0.08, -0.62]);
  // the shaft hangs back and down (its end at about [0, -0.4, -0.63]), the tip curls up
  rb.add('tail', new THREE.CylinderGeometry(0.022, 0.05, 0.75, 7).translate(0, -0.37, 0), C.fur, { rot: [1.0, 0, 0] });
  rb.add('tail', new THREE.CylinderGeometry(0.02, 0.026, 0.3, 6).translate(0, 0.15, 0), C.dark, { pos: [0, -0.4, -0.62], rot: [-0.35, 0, 0] });
  rb.add('tail', sph(0.05, 7, 5).scale(1, 1.4, 1), C.mane, { pos: [0, -0.13, -0.72] });
  const rig = rb.build();
  rig.legs = legs;
  rig.height = 1.3;
  return rig;
}

function animStalker(r, s, dt, time) {
  const b = r.bones, legs = r.legs, k = windK(s), cfg = r.motion;
  const leaping = s.state === 'act' && s.lastAttack === 'pounce';
  // a cat's walk: long smooth strides, shoulder blades rolling, the head gliding level
  const w = advanceGait(r, s, dt, cfg);
  const ph = r.phase, run = r.runK;
  const drop = poseLegs(r, cfg, legs);
  // a stalker walks low
  let bodyY = 0.62, bodyX = 0, headX = 0.08, jaw = 0, paw = null, tailLash = 0;
  if (s.windup === 'pounce') {
    bodyY = 0.62 - 0.24 * k; // belly to the ground, hind legs coiled
    bodyX = 0.1 * k;
    headX = 0.2 * k;
    tailLash = k;
  } else if (s.windup === 'claw') {
    bodyX = -0.25 * k;
    paw = -1.4 * k; // a forepaw raised high
    jaw = 0.4 * k;
  } else if (leaping) {
    bodyX = -0.15;
    bodyY = 0.76;
    for (const i of [0, 1]) b[legs[i]].rotation.x = -1.1;
    for (const i of [2, 3]) b[legs[i]].rotation.x = 0.9;
    jaw = 0.7;
  } else if (s.state === 'act' && s.lastAttack === 'claw') {
    const c = clamp01(s.actT / Math.max(0.01, s.hitTime || 0.1));
    paw = -1.4 + 1.9 * c;
    bodyX = -0.25 + 0.35 * c;
    jaw = 0.5;
  } else if (s.state === 'recover') {
    bodyX = 0.05;
  }
  if (paw !== null) b[legs[0]].rotation.x = paw;
  // the swipe also comes across the body (seen from above, the claws carve a crescent)
  b[legs[0]].rotation.z = s.windup === 'claw' ? 0.55 * k : s.state === 'act' && s.lastAttack === 'claw' ? 0.55 - 1.1 * clamp01(s.actT / Math.max(0.01, s.hitTime || 0.1)) : damp(b[legs[0]].rotation.z, 0, 14, dt);
  if (s.hurt > 0) bodyX -= 0.2 * s.hurt;
  const P = r.pose || (r.pose = { x: 0, y: 0.62, z: 0, headX: 0 });
  P.y = damp(P.y, bodyY, 14, dt);
  P.x = damp(P.x, bodyX + cfg.lean * clampAbs(r.accel || 0, 5), 12, dt);
  P.z = damp(P.z, clampAbs(-s.turn * 0.07 - (s.vSide || 0) * 0.03, 0.25), 10, dt);
  P.headX = damp(P.headX, headX, 14, dt);
  const rock = cfg.pitch * w * ((1 - run) * Math.sin(2 * ph) + run * 2.5 * Math.sin(ph + 0.8));
  const roll = cfg.roll * w * Math.sin(ph) * (1 - 0.6 * run);
  b.body.position.y = P.y - drop + cfg.bob * w * (1 + run) * (0.5 + 0.5 * Math.cos(2 * ph));
  b.body.rotation.x = P.x + rock;
  b.body.rotation.z = P.z + roll;
  b.chest.rotation.y = -cfg.sway * w * Math.sin(ph);
  b.chest.rotation.z = -roll * 1.4; // shoulder blades roll over each planted forepaw
  const br = breath(time, r.seed, cfg) * (1 - 0.6 * w);
  b.body.scale.set(1 + br, 1, 1 + br * 0.4);
  b.head.rotation.x = P.headX - rock * cfg.headSteady;
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.9, 7, dt);
  b.jaw.rotation.x = damp(b.jaw.rotation.x, jaw, 18, dt);
  r.tailSpring = r.tailSpring || new Spring(50, 6);
  b.tail.rotation.y = r.tailSpring.update(Math.sin(time * (2 + tailLash * 10) + r.seed) * (0.35 + tailLash * 0.4), dt);
  for (const e of EARS) b[e].rotation.x = damp(b[e].rotation.x, s.windup ? 0.5 : -0.1, 10, dt);
}

// ---------- rune sentinel: a floating carved stone with a shard ring ----------

const SHARDS = 6;

function buildSentinel() {
  const C = { stone: '#9a9a8c', stoneD: '#6e6f66', moss: '#7e9a5a', rune: '#7fe3ee', core: '#bff6ff', bronze: '#b08a52' };
  const rb = new RigBuilder({ outline: 0.032, darkness: 0.3 });
  rb.bone('body', 'root', [0, 1.45, 0]);
  rb.bone('head', 'body', [0, 0.78, 0.04]);
  rb.bone('ring', 'body', [0, 0.1, 0]);
  // carved body: an eight-sided pillar narrowing to a point below (it floats)
  rb.add('body', new THREE.CylinderGeometry(0.42, 0.34, 0.9, 8).translate(0, 0.15, 0), C.stone);
  rb.add('body', new THREE.ConeGeometry(0.34, 0.7, 8).rotateX(Math.PI).translate(0, -0.65, 0), C.stoneD);
  rb.add('body', new THREE.CylinderGeometry(0.47, 0.47, 0.1, 8).translate(0, 0.62, 0), C.bronze);
  rb.add('body', new THREE.CylinderGeometry(0.4, 0.4, 0.07, 8).translate(0, -0.3, 0), C.bronze);
  rb.add('body', sph(0.3, 8, 6).scale(1.4, 0.35, 1.2), C.moss, { pos: [0.05, 0.66, -0.1], plain: true });
  // the rune core behind a carved window, and glowing runes on the faces
  rb.add('body', new THREE.OctahedronGeometry(0.17).scale(1, 1.4, 1), C.core, { pos: [0, 0.18, 0.36], glow: true });
  for (const [x, y] of [[-0.22, 0.4], [0.22, 0.4], [-0.25, -0.05], [0.25, -0.05]]) rb.add('body', new THREE.BoxGeometry(0.05, 0.16, 0.02), C.rune, { pos: [x, y, 0.37], rot: [0, x > 0 ? 0.35 : -0.35, 0.3], glow: true });
  // head: a carved slab with one rune eye
  rb.add('head', new THREE.BoxGeometry(0.5, 0.36, 0.42), C.stone, { rot: [0, Math.PI / 4, 0] });
  rb.add('head', new THREE.ConeGeometry(0.28, 0.24, 4).translate(0, 0.28, 0), C.stoneD);
  rb.add('head', new THREE.TorusGeometry(0.075, 0.025, 5, 10), C.rune, { pos: [0, 0.02, 0.27], glow: true });
  rb.add('head', sph(0.045, 6, 5), C.core, { pos: [0, 0.02, 0.27], glow: true });
  // shard ring: floating stones with a rune each
  for (let i = 0; i < SHARDS; i++) {
    const a = (i / SHARDS) * Math.PI * 2, n = `shard${i}`;
    rb.bone(n, 'ring', [Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85]);
    rb.add(n, new THREE.OctahedronGeometry(0.16).scale(0.7, 1.5, 0.5), i % 2 ? C.stone : C.stoneD, { rot: [0, a, 0] });
    rb.add(n, new THREE.BoxGeometry(0.03, 0.12, 0.02), C.rune, { pos: [Math.sin(a) * 0.07, 0, Math.cos(a) * 0.07], rot: [0, a, 0], glow: true });
  }
  const rig = rb.build();
  rig.height = 2.4;
  return rig;
}

function animSentinel(r, s, dt, time) {
  const b = r.bones, k = windK(s);
  let spin = 0.6, radius = 1, lean = 0, rise = 0, headX = 0;
  if (s.windup === 'beam') {
    spin = 0.6 + 7 * k; // the ring winds up, the body leans back to aim
    radius = 1 - 0.35 * k;
    lean = -0.25 * k;
    headX = -0.15 * k;
  } else if (s.windup === 'shards') {
    spin = 0.6 + 3 * k;
    radius = 1 + 0.6 * k; // shards drift outward over the marked ring
    rise = 0.25 * k;
  } else if (s.state === 'recover' && s.lastAttack === 'beam') {
    lean = 0.15;
    spin = 2;
  } else if (s.state === 'recover' && s.lastAttack === 'shards') {
    radius = 1.9;
    spin = 1.2;
  } else if (s.state === 'stunned') {
    lean = Math.sin(time * 9) * 0.12;
  }
  if (s.hurt > 0) lean -= 0.12 * s.hurt;
  if (r.model) radius = Math.max(1, radius); // the model's inner shards already sit close to its body
  r.spin = (r.spin || 0) + dt * spin;
  r.radius = damp(r.radius || 1, radius, 8, dt);
  b.ring.rotation.y = r.spin;
  for (let i = 0; i < SHARDS; i++) {
    const a = (i / SHARDS) * Math.PI * 2, sh = b[`shard${i}`];
    sh.position.set(Math.sin(a) * 0.85 * r.radius, Math.sin(time * 2 + i) * 0.08 + rise, Math.cos(a) * 0.85 * r.radius);
  }
  // a floating stone: it tips into its drift and rocks back when it stops
  advanceGait(r, s, dt, r.motion);
  b.body.position.y = damp(b.body.position.y, 1.45 + Math.sin(time * 1.8 + r.seed) * 0.08 + Math.min(0.05, (r.speed || 0) * 0.03), 8, dt);
  b.body.rotation.x = damp(b.body.rotation.x, lean + Math.min(0.16, (r.speed || 0) * 0.08) + clampAbs(r.accel || 0, 3) * 0.03, 5, dt);
  b.body.rotation.z = damp(b.body.rotation.z, clampAbs(-(s.vSide || 0) * 0.06 - s.turn * 0.04, 0.15) + Math.sin(time * 1.1 + r.seed) * 0.03, 5, dt);
  b.head.rotation.x = damp(b.head.rotation.x, headX, 10, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.8, 4, dt);
}

export const MIDHIGH_BUILDERS = {
  thicket_mantis: [buildMantis, animMantis],
  reed_viper: [buildViper, animViper],
  ironhorn_ram: [buildRam, animRam],
  duskmane_stalker: [buildStalker, animStalker],
  rune_sentinel: [buildSentinel, animSentinel],
};
export const MIDHIGH_SCALE = { thicket_mantis: 1.05, reed_viper: 1.1, ironhorn_ram: 0.85, duskmane_stalker: 1.15, rune_sentinel: 0.95 };
