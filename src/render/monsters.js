// Monster models + animation. Each silhouette shows what it drops (tusks and hide, a mossy
// shell, a glowing core, huge horns, thorny pelt and fangs, spore caps, crag stone with a
// glowing heart, feathers). Not plush toys: grounded shapes, darker outlines, readable
// wind-ups. Rigs are merged per bone (rig.js); animation adds gait cycles, anticipation,
// squash/stretch, head tracking, springy tails/ears and hit reactions.
import * as THREE from 'three';
import { RigBuilder, damp, clamp01, Spring } from './rig.js';
import { monsterModel } from './models.js';
import { attachMonsterModel } from './monsterSkin.js';
import { MIDHIGH_BUILDERS, MIDHIGH_SCALE } from './monsters-midhigh.js';
import MOTION from '../../data/monster-motion.json';
import { motionConfig, advanceGait, poseLegs, poseSplayedLegs, legCycle, wander, breath } from './monster-motion.js';

const cylDown = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, -h / 2, 0);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 5) => new THREE.ConeGeometry(r, h, seg);
const CRAB_CLAWS = [[1, 'mandL'], [-1, 'mandR']];

// ---------- quadrupeds (boar, wolves) ----------

function buildBoar() {
  const C = { hide: '#7b4f33', dark: '#56351f', belly: '#a27451', tusk: '#f3ead2', snout: '#c98f7a', eye: '#1c1410', hoof: '#3b2a20', mane: '#4a2e1c' };
  const rb = new RigBuilder({ outline: 0.03, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0.62, 0]);
  rb.bone('head', 'body', [0, 0.05, 0.62]);
  rb.add('body', sph(0.55, 14, 10).scale(0.85, 0.72, 1.25), C.hide);
  rb.add('body', sph(0.45, 12, 8).scale(0.8, 0.5, 1.05), C.belly, { pos: [0, -0.16, 0.05], plain: true });
  for (let i = 0; i < 7; i++) rb.add('body', cone(0.07, 0.26, 4), C.mane, { pos: [0, 0.38 - Math.abs(i - 2) * 0.02, 0.4 - i * 0.14], rot: [-0.5, 0, i % 2 ? 0.2 : -0.2] });
  rb.add('head', sph(0.34, 12, 10).scale(0.85, 0.8, 1.0), C.hide, { pos: [0, 0, 0.1] });
  rb.add('head', new THREE.CylinderGeometry(0.15, 0.19, 0.24, 10).rotateX(Math.PI / 2), C.snout, { pos: [0, -0.06, 0.42] });
  rb.add('head', new THREE.CircleGeometry(0.1, 10), '#8a5a4a', { pos: [0, -0.06, 0.545], plain: true });
  for (const s of [1, -1]) {
    rb.add('head', cone(0.05, 0.36, 6).translate(0, 0.18, 0), C.tusk, { pos: [s * 0.13, -0.12, 0.4], rot: [0.5, 0, -s * 0.55] });
    rb.add('head', sph(0.035, 6, 4), C.eye, { pos: [s * 0.15, 0.1, 0.33], plain: true });
    rb.add('head', sph(0.012, 4, 3), '#ffffff', { pos: [s * 0.155, 0.115, 0.36], glow: true });
    rb.bone(`ear${s > 0 ? 'L' : 'R'}`, 'head', [s * 0.2, 0.22, 0.02]);
    rb.add(`ear${s > 0 ? 'L' : 'R'}`, cone(0.08, 0.18, 4).translate(0, 0.06, 0), C.dark, { rot: [-0.3, 0, -s * 0.5] });
  }
  const legs = [];
  for (const [x, z] of [[0.28, 0.42], [-0.28, 0.42], [0.28, -0.42], [-0.28, -0.42]]) {
    const n = `leg${legs.length}`;
    rb.bone(n, 'body', [x, -0.2, z]);
    rb.add(n, cylDown(0.09, 0.07, 0.42, 7), C.hide);
    rb.add(n, new THREE.CylinderGeometry(0.075, 0.08, 0.08, 7), C.hoof, { pos: [0, -0.42, 0] });
    legs.push(n);
  }
  rb.bone('tail', 'body', [0, 0.15, -0.66]);
  rb.add('tail', cone(0.04, 0.25, 4).translate(0, -0.12, 0), C.dark, { rot: [-0.6, 0, 0] });
  const rig = rb.build();
  rig.legs = legs;
  rig.height = 1.35;
  return rig;
}

function buildWolf(kind = 'wolf') {
  const alpha = kind === 'greyfang';
  const spirit = kind === 'spirit';
  const C = spirit
    ? { fur: '#8fc8ff', dark: '#5a8ad8', light: '#d8f0ff', thorn: '#bfe6ff', eye: '#ffffff', nose: '#3a5a9a', fang: '#ffffff' }
    : alpha
    ? { fur: '#5f6168', dark: '#3a3b42', light: '#b9b6ae', thorn: '#d8d0c0', eye: '#ffcf40', nose: '#1e1e22', fang: '#f4efe0' }
    : { fur: '#8a7f70', dark: '#5e554a', light: '#cfc4b0', thorn: '#6b8a3a', eye: '#e8c040', nose: '#2a2420', fang: '#f4efe0' };
  const rb = new RigBuilder({ outline: 0.028, darkness: spirit ? 0.45 : 0.28, rim: spirit ? 0.8 : 0.35 });
  rb.bone('body', 'root', [0, 0.72, 0]);
  rb.bone('chest', 'body', [0, 0.02, 0.32]);
  rb.bone('neck', 'chest', [0, 0.12, 0.22]);
  rb.bone('head', 'neck', [0, 0.1, 0.16]);
  rb.bone('jaw', 'head', [0, -0.08, 0.1]);
  rb.add('body', sph(0.36, 12, 10).scale(0.85, 0.8, 1.35), C.fur, { pos: [0, 0, -0.12] });
  rb.add('body', sph(0.3, 10, 8).scale(0.8, 0.6, 1.2), C.light, { pos: [0, -0.12, -0.05], plain: true });
  rb.add('chest', sph(0.36, 12, 10).scale(0.95, 1.0, 0.9), C.fur);
  rb.add('chest', sph(0.3, 10, 8).scale(1.0, 0.9, 0.7), C.light, { pos: [0, -0.08, 0.16] }); // ruff (the pelt)
  // thorny back: the "thornback" look
  for (let i = 0; i < 6; i++) rb.add('body', cone(0.05 + (alpha ? 0.02 : 0), alpha ? 0.3 : 0.22, 4), C.thorn, { pos: [(i % 2 ? 0.06 : -0.06), 0.27 - Math.abs(i - 2) * 0.015, 0.25 - i * 0.14], rot: [-0.6, 0, i % 2 ? -0.3 : 0.3] });
  rb.add('neck', sph(0.2, 10, 8).scale(0.9, 1, 1.1), C.fur);
  rb.add('head', sph(0.2, 12, 10).scale(0.95, 0.85, 1.05), C.fur, { pos: [0, 0.02, 0] });
  rb.add('head', new THREE.CylinderGeometry(0.08, 0.12, 0.26, 8).rotateX(Math.PI / 2), C.fur, { pos: [0, -0.04, 0.2] });
  rb.add('head', sph(0.04, 6, 5), C.nose, { pos: [0, -0.01, 0.34], plain: true });
  rb.add('jaw', new THREE.CylinderGeometry(0.06, 0.09, 0.2, 8).rotateX(Math.PI / 2), C.light, { pos: [0, -0.02, 0.14] });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.032, 6, 5), C.eye, { pos: [s * 0.1, 0.07, 0.14], glow: true });
    rb.add('jaw', cone(0.018, 0.07, 4), C.fang, { pos: [s * 0.045, 0.03, 0.2], rot: [Math.PI, 0, 0], plain: true });
    rb.bone(`ear${s > 0 ? 'L' : 'R'}`, 'head', [s * 0.1, 0.16, -0.03]);
    rb.add(`ear${s > 0 ? 'L' : 'R'}`, cone(0.055, 0.17, 4).translate(0, 0.08, 0), C.dark, { rot: [-0.2, 0, -s * 0.25] });
  }
  const legs = [];
  for (const [x, z, parent] of [[0.17, 0.05, 'chest'], [-0.17, 0.05, 'chest'], [0.17, -0.42, 'body'], [-0.17, -0.42, 'body']]) {
    const n = `leg${legs.length}`;
    rb.bone(n, parent, [x, -0.1, z]);
    rb.add(n, cylDown(0.07, 0.055, 0.34, 7), C.fur);
    rb.bone(`${n}k`, n, [0, -0.33, 0]);
    rb.add(`${n}k`, cylDown(0.05, 0.04, 0.3, 6), C.dark);
    rb.add(`${n}k`, sph(0.05, 6, 5).scale(1, 0.6, 1.5), C.dark, { pos: [0, -0.3, 0.03] });
    legs.push(n);
  }
  rb.bone('tail', 'body', [0, 0.12, -0.55]);
  rb.add('tail', new THREE.CylinderGeometry(0.03, 0.09, 0.55, 7).translate(0, -0.26, 0), C.fur, { rot: [-0.9, 0, 0] });
  if (alpha) {
    rb.add('neck', sph(0.26, 10, 8).scale(1.1, 1, 1.2), C.light, { pos: [0, 0.02, -0.04] });
    rb.add('head', new THREE.BoxGeometry(0.03, 0.12, 0.02), '#d8483a', { pos: [0.1, 0.1, 0.1], rot: [0, 0, 0.5], plain: true }); // scar
  }
  const rig = rb.build();
  rig.legs = legs;
  rig.height = alpha ? 1.4 : 1.2;
  if (spirit) rig.material.userData.flash.value.set(0, 0, 0.35);
  return rig;
}

function animQuad(r, s, dt, time, cfg) {
  const b = r.bones;
  const c = r.motion;
  const legs = r.legs;
  // legs: a cycle locked to ground speed (walk -> trot/gallop), see monster-motion.js
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  const run = r.runK;
  const drop = poseLegs(r, c, legs);
  const P = r.pose || (r.pose = { bodyX: 0, bodyY: cfg.bodyY, bodyZ: 0, headX: 0, jaw: 0 });
  let bodyX = 0;
  let bodyY = cfg.bodyY;
  let headX = Math.sin(time * 2 + r.seed) * 0.03 - 0.05 * w;
  let squash = 1;
  let jaw = 0;
  let bodyZ = clampAbs(-s.turn * 0.06 - (s.vSide || 0) * 0.025, 0.2);
  let zK = 10;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  const wu = s.windup;
  for (let i = 0; i < 2; i++) b[legs[i]].rotation.z = damp(b[legs[i]].rotation.z, 0, 18, dt);
  let lunge = 0;
  let hook = 0;
  if (wu === 'rend' || wu === 'rake') {
    // rears back on the hind legs, head up, then claws down from alternating sides
    headX = -0.35 * k;
    bodyX = -0.28 * k;
    bodyY += 0.14 * k;
    jaw = 0.4 * k;
    lunge = -0.12 * k;
    b[legs[0]].rotation.x = -1.25 * k;
    b[`${legs[0]}k`].rotation.x = 0.75 * k;
  } else if (s.state === 'act' && (s.lastAttack === 'rend' || s.lastAttack === 'rake')) {
    // The imported PR106 wolves use the same front-leg joints. Alternate paws
    // at the data's contact times: a high lift, a fast raking downstroke across
    // the body (its claws leave the trail) and a return, the body surging in.
    const hits = s.attack?.hits || [];
    bodyX = -0.16;
    bodyY += 0.1;
    jaw = 0.4;
    lunge = 0.12;
    for (let i = 0; i < hits.length; i++) {
      const t = s.actT - hits[i].at, leg = legs[i % 2];
      if (t < -0.15 || t > 0.18) continue;
      const stroke = clamp01((t + 0.12) / 0.12);
      const release = 1 - clamp01(t / 0.18);
      b[leg].rotation.x = (-1.3 + 1.75 * stroke * stroke) * release;
      b[leg].rotation.z = (i % 2 ? -1 : 1) * (0.55 - 1.0 * stroke) * release;
      b[`${leg}k`].rotation.x = 0.75 * (1 - stroke) * release;
    }
  } else if (wu === 'charge') {
    // crouch, head low, hind legs coiled; front paw scrapes on the boar
    headX = 0.35 * k;
    bodyX = 0.12 * k;
    bodyY -= 0.12 * k;
    squash = 1 - 0.08 * k;
    if (cfg.paw) b[legs[0]].rotation.x = Math.sin(time * 18) * 0.6 * k;
    jaw = 0.25 * k;
  } else if (wu === 'bite') {
    // draws the head back and cocks it to one side with the jaw wide, weight on the hind legs,
    // then lunges and snaps across (a hooking bite, so the fangs carve a crescent)
    if (k < 0.1) r.biteSide = -(r.biteSide || 1);
    hook = 0.5 * k * (r.biteSide || 1);
    headX = -0.65 * k;
    bodyX = -0.14 * k;
    bodyY += 0.03 * k;
    jaw = 0.8 * k;
    lunge = -0.16 * k;
  } else if (wu === 'howl') {
    headX = -0.9 * k;
    jaw = 0.7 * k;
    bodyX = -0.2 * k;
  } else if (s.state === 'act') {
    headX = 0.2;
    bodyX = 0.1;
    squash = 1.06;
    jaw = 0.4;
  } else if (s.state === 'recover' && s.lastAttack === 'bite') {
    // the snap: the body surges in, the head thrusts down and forward and the jaw slams
    // shut (its fangs leave the trail), then it eases back
    const t = clamp01((s.actT || 0) / 0.45);
    headX = 0.55 * (1 - t);
    bodyX = 0.16 * (1 - t);
    bodyY -= 0.06 * (1 - t);
    lunge = 0.36 * (1 - t) * (1 - t);
    hook = -0.4 * (1 - t) * (r.biteSide || 1);
    jaw = t < 0.12 ? 0.5 : 0; // the jaw stays open through the thrust and slams shut at its end
  } else if (s.state === 'stunned') {
    headX = 0.2 + Math.sin(time * 12) * 0.1;
    bodyZ = Math.sin(time * 8) * 0.15;
    zK = 30;
  }
  // idle life: breathing, looking around, a sniff at the ground (the boar roots about)
  const calm = wu || s.state === 'act' || s.state === 'stunned' ? 0 : 1 - w;
  const idle = s.aggro ? 0 : calm;
  const sniff = Math.max(0, wander(time * 0.31, r.seed + 4)) ** 2 * (cfg.paw ? 0.55 : 0.3) * idle;
  headX += sniff;
  // hit reaction: knocked back a little and squashed
  if (s.hurt > 0) {
    bodyX -= 0.25 * s.hurt;
    squash *= 1 - 0.12 * s.hurt;
  }
  // a lunge/charge leans in, braking sits back
  bodyX += c.lean * clampAbs(r.accel || 0, 5);
  P.headX = damp(P.headX, headX, s.state === 'recover' && s.lastAttack === 'bite' ? 16 : 14, dt);
  P.bodyX = damp(P.bodyX, bodyX, 12, dt);
  P.bodyY = damp(P.bodyY, bodyY, 18, dt);
  P.bodyZ = damp(P.bodyZ, bodyZ, zK, dt);
  P.jaw = damp(P.jaw, jaw, jaw < P.jaw ? 40 : 18, dt);
  P.lunge = damp(P.lunge || 0, lunge, lunge > (P.lunge || 0) ? 20 : 10, dt);
  // per-step body motion on top: two bounces per stride, a fore-aft rock (a big one when
  // galloping), weight shifting from side to side and the spine flexing; the head stays level
  const rock = c.pitch * w * ((1 - run) * Math.sin(2 * ph) + run * 2.5 * Math.sin(ph + 0.8));
  const bob = c.bob * w * (1 + run) * (0.5 + 0.5 * Math.cos(2 * ph));
  const roll = c.roll * w * Math.sin(ph) * (1 - 0.6 * run);
  b.body.rotation.x = P.bodyX + rock;
  b.body.position.y = P.bodyY + bob - drop;
  b.body.position.z = b.body.userData.rest.pos.z + P.lunge;
  b.body.rotation.z = P.bodyZ + roll;
  if (b.chest) {
    b.chest.rotation.y = -c.sway * w * Math.sin(ph);
    b.chest.rotation.z = -roll * 0.6;
  }
  b.head.rotation.x = P.headX - rock * c.headSteady;
  const look = s.lookYaw ? 0 : c.look * wander(time * 0.45, r.seed) * idle;
  P.headY = damp(P.headY || 0, s.lookYaw * 0.8 + look + clampAbs(s.turn * 0.12, 0.3), 6, dt);
  P.hook = damp(P.hook || 0, hook, 18, dt);
  b.head.rotation.y = P.headY + P.hook;
  if (b.neck) b.neck.rotation.y = P.hook * 0.6;
  const br = breath(time, r.seed, c) * (1 - 0.6 * w);
  b.body.scale.set((1 + br) / Math.sqrt(squash), squash, (1 + br * 0.4) / Math.sqrt(squash));
  if (b.jaw) b.jaw.rotation.x = P.jaw;
  // tail: a springy wag that streams out when running and swings out of turns
  r.tailSpring = r.tailSpring || new Spring(70, 7);
  r.tailLift = r.tailLift || new Spring(60, 6);
  const tailTarget = (wu ? 0.5 : 0) + Math.sin(time * (w > 0.5 ? 9 : 3.5) + r.seed) * (0.12 + 0.12 * w) + clampAbs(s.turn * 0.25, 0.4);
  b.tail.rotation.z = r.tailSpring.update(tailTarget, dt);
  b.tail.rotation.x = r.tailLift.update(-0.35 * run + bob * 4 - (wu ? 0.2 : 0), dt);
  // ears flop with each bounce, pin back on a wind-up, and flick now and then
  r.earSpring = r.earSpring || new Spring(90, 6);
  const flop = r.earSpring.update(-bob * 6, dt);
  const flick = Math.max(0, Math.sin(time * 0.9 + r.seed * 3)) ** 24 * 0.5;
  P.ear = damp(P.ear || 0, wu ? -0.4 : -0.15 * w + Math.sin(time * 3 + r.seed) * 0.05, 10, dt);
  for (const e of ['earL', 'earR']) {
    if (!b[e]) continue;
    b[e].rotation.x = P.ear + flop * 0.1;
    b[e].rotation.z = (e === 'earL' ? 1 : -1) * flick * (e === 'earL' ? 1 : 0.3);
  }
}

// ---------- beetle ----------

function buildBeetle() {
  const C = { shell: '#5d8a3a', moss: '#7fb14a', body: '#3c3a2f', leg: '#2c2a22', mandible: '#d9c9a0', eye: '#e7f06a', spot: '#a6c95a' };
  const rb = new RigBuilder({ outline: 0.03, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0.45, 0]);
  rb.bone('shell', 'body', [0, 0.05, 0]);
  rb.bone('head', 'body', [0, 0.02, 0.62]);
  rb.add('body', sph(0.5, 12, 8).scale(0.95, 0.45, 1.2), C.body);
  rb.add('shell', new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.0, 0.85, 1.2), C.shell);
  const off = [0.3, -0.25, 0.1, -0.35, 0.4, -0.05, 0.2];
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    rb.add('shell', sph(0.13 + (i % 3) * 0.03, 8, 6).scale(1, 0.5, 1), i % 2 ? C.moss : C.spot, { pos: [Math.sin(a) * 0.32, 0.42 + off[i] * 0.1, Math.cos(a) * 0.38], plain: true });
  }
  rb.add('shell', new THREE.BoxGeometry(0.05, 0.06, 1.2), C.body, { pos: [0, 0.52, 0], plain: true });
  rb.add('head', sph(0.26, 10, 8).scale(1, 0.75, 0.9), C.body);
  for (const s of [1, -1]) {
    rb.bone(`mand${s > 0 ? 'L' : 'R'}`, 'head', [s * 0.1, -0.05, 0.15]);
    rb.add(`mand${s > 0 ? 'L' : 'R'}`, cone(0.045, 0.3, 5).rotateX(Math.PI / 2).translate(0, 0, 0.15), C.mandible, { rot: [0, -s * 0.45, 0] });
    rb.add('head', sph(0.05, 6, 5), C.eye, { pos: [s * 0.14, 0.08, 0.14], glow: true });
  }
  const legs = [];
  for (let i = 0; i < 3; i++)
    for (const s of [1, -1]) {
      const n = `leg${legs.length}`;
      rb.bone(n, 'body', [s * 0.42, -0.05, 0.35 - i * 0.35]);
      rb.add(n, new THREE.CylinderGeometry(0.035, 0.03, 0.5, 5).translate(0, -0.25, 0), C.leg, { rot: [0, 0, s * 0.9] });
      legs.push(n);
    }
  const rig = rb.build();
  rig.legs = legs;
  rig.height = 1.2;
  return rig;
}

// Coastal crabs share a shell/claw rig; claws open, reach and close for a pinch.
function buildCrab(hermit = false) {
  const C = { shell: '#d8643a', light: '#f09a5a', belly: '#f3d2a8', leg: '#b8482a', claw: '#e2703e', tip: '#3a2a22', eye: '#1c1410', barn: '#e8e0cc' };
  const rb = new RigBuilder({ outline: 0.03, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0.32, 0]);
  rb.bone('shell', 'body', [0, 0.02, 0]);
  rb.bone('head', 'body', [0, 0.0, 0.42]);
  rb.add('body', sph(0.5, 12, 8).scale(1.25, 0.4, 0.95), C.belly);
  rb.add('shell', new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.3, 0.62, 1.0), C.shell);
  if (hermit) {
    rb.add('shell', sph(.65, 14, 10).scale(.85, 1.1, 1.15), '#b99b70', { pos: [0, .38, -.18] });
    for (let i = 0; i < 3; i++) rb.add('shell', new THREE.TorusGeometry(.36 - i * .1, .055, 6, 16), '#ead9b5', { pos: [0, .65, .39 + i * .035] });
    rb.add('shell', cone(.2, .55, 7), '#e0c79c', { pos: [0, 1.04, -.28], rot: [-.4, 0, 0] });
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.3;
    rb.add('shell', sph(0.07 + (i % 2) * 0.03, 7, 5).scale(1, 0.55, 1), i % 3 ? C.light : C.shell, { pos: [Math.sin(a) * 0.45, 0.3, Math.cos(a) * 0.3], plain: true });
  }
  for (const s2 of [1, -1]) {
    rb.add('head', new THREE.CylinderGeometry(0.025, 0.03, 0.22, 5).translate(0, 0.11, 0), C.leg, { pos: [s2 * 0.12, 0.2, 0.02] });
    rb.add('head', sph(0.055, 7, 5), C.eye, { pos: [s2 * 0.12, 0.34, 0.03] });
    rb.add('head', sph(0.018, 4, 3), '#ffffff', { pos: [s2 * 0.125, 0.355, 0.075], glow: true });
    // claws on the "mandible" bones so the spit wind-up raises them
    const n = `mand${s2 > 0 ? 'L' : 'R'}`;
    rb.bone(n, 'head', [s2 * 0.45, -0.02, 0.05]);
    rb.add(n, new THREE.CylinderGeometry(0.06, 0.07, 0.35, 6).rotateX(Math.PI / 2).translate(0, 0, 0.16), C.leg, { rot: [0, -s2 * 0.5, 0] });
    rb.add(n, sph(0.24, 10, 8).scale(0.85, 0.65, 1.2), C.claw, { pos: [-s2 * 0.15, 0.04, 0.42] });
    rb.add(n, cone(0.07, 0.3, 5).rotateX(Math.PI / 2), C.tip, { pos: [-s2 * 0.17, 0.08, 0.62] });
    rb.add(n, cone(0.05, 0.22, 5).rotateX(Math.PI / 2), C.tip, { pos: [-s2 * 0.12, -0.04, 0.58] });
  }
  const legs = [];
  for (let i = 0; i < 3; i++)
    for (const s2 of [1, -1]) {
      const n = `leg${legs.length}`;
      rb.bone(n, 'body', [s2 * 0.55, -0.02, 0.22 - i * 0.24]);
      rb.add(n, new THREE.CylinderGeometry(0.045, 0.03, 0.6, 5).translate(0, -0.3, 0), C.leg, { rot: [0, 0, s2 * 1.35] });
      rb.add(n, new THREE.CylinderGeometry(0.03, 0.015, 0.3, 5).translate(0, -0.15, 0), C.leg, { pos: [s2 * 0.58, -0.13, 0], rot: [0, 0, s2 * 0.3] });
      legs.push(n);
    }
  const rig = rb.build();
  rig.legs = legs;
  rig.height = 1.0;
  rig.bodyY = 0.32;
  rig.hermit = hermit;
  if (hermit) rig.height = 1.8;
  return rig;
}

const SIDES6 = [1, -1, 1, -1, 1, -1];

function animBeetle(r, s, dt, time) {
  const b = r.bones;
  const c = r.motion;
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  const shellK = (r.shellK = damp(r.shellK || 0, s.state === 'shell' ? 1 : 0, 12, dt));
  // alternating tripods, speed-locked; legs pull in under the shell when it shuts
  poseSplayedLegs(r, c, r.legs, SIDES6);
  for (const n of r.legs) b[n].scale.setScalar(1 - shellK * 0.7);
  let headX = 0;
  let mand = Math.sin(time * 5 + r.seed) * 0.08;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  if (s.windup === 'spit' || s.windup === 'bite') {
    headX = -0.45 * k;
    mand = 0.4 * k;
  } else if (s.state === 'recover' && s.lastAttack === 'spit') headX = 0.25;
  const P = r.pose || (r.pose = { y: r.bodyY ?? 0.45 });
  P.y = damp(P.y, (r.bodyY ?? 0.45) - shellK * 0.3, 16, dt);
  // each tripod plants with a small bounce; the shell rocks a little behind the body
  const bob = c.bob * w * (0.5 + 0.5 * Math.cos(2 * ph));
  b.body.position.y = P.y + bob;
  const br = breath(time, r.seed, c) * (1 - w);
  b.shell.scale.set(1 + shellK * 0.12 + br, 1 + shellK * 0.1 + (s.hurt || 0) * -0.08 + br, 1 + shellK * 0.12);
  r.shellSpring = r.shellSpring || new Spring(80, 7);
  b.shell.rotation.x = r.shellSpring.update(Math.sin(2 * ph) * 0.03 * w - clampAbs(r.accel || 0, 4) * 0.02, dt);
  b.head.scale.setScalar(1 - shellK * 0.6);
  b.head.rotation.x = damp(b.head.rotation.x, headX, 14, dt);
  const look = s.lookYaw ? 0 : c.look * wander(time * 0.6, r.seed) * (1 - w) * (s.aggro ? 0 : 1);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.5 + look, 6, dt);
  b.mandL.rotation.y = damp(b.mandL.rotation.y, -mand, 16, dt);
  b.mandR.rotation.y = damp(b.mandR.rotation.y, mand, 16, dt);
  b.mandL.rotation.x = damp(b.mandL.rotation.x, s.windup === 'bite' ? -.65 * k : 0, 14, dt);
  b.mandR.rotation.x = damp(b.mandR.rotation.x, s.windup === 'bite' ? -.65 * k : 0, 14, dt);
  b.body.rotation.z = c.roll * w * Math.sin(ph) + Math.sin(time * 1.5 + r.seed) * 0.015 * (1 - w) + clampAbs(-s.turn * 0.04, 0.12);
}

// -1 is the fully drawn-back pose; +1 is contact. Timing comes from the same
// attack definition as the simulation, so the strike does not look like a dash.
function coastalStrike(s, name) {
  if (s.windup === name) return -clamp01(s.windupT / s.windupTotal);
  if (s.state !== 'act' || s.lastAttack !== name) return 0;
  if (s.actT <= s.hitTime) return -1 + 2 * clamp01(s.actT / s.hitTime);
  return 1 - clamp01((s.actT - s.hitTime) / (s.actionTotal - s.hitTime));
}

function animCrab(r, s, dt, time) {
  const b = r.bones;
  const c = r.motion;
  const stroke = coastalStrike(s, 'pinch');
  const ready = Math.max(0, -stroke), hit = Math.max(0, stroke);
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  const tucked = r.shellK = damp(r.shellK || 0, s.state === 'shell' ? 1 : 0, 12, dt);
  poseSplayedLegs(r, c, r.legs, SIDES6, 'z');
  for (const n of r.legs) b[n].scale.setScalar(1 - tucked * .8);
  // a crab scuttles sideways: the body turns side-on while it travels and squares up to strike
  const busy = s.windup || s.state === 'act' || s.state === 'shell' || s.state === 'stunned';
  r.sidleSide = r.sidleSide || (r.seed % 2 < 1 ? 1 : -1);
  if (w < 0.05 && !busy) r.sidleSide = (s.vSide || 0) > 0.3 ? -1 : (s.vSide || 0) < -0.3 ? 1 : r.sidleSide;
  r.sidle = damp(r.sidle || 0, busy ? 0 : r.sidleSide * c.sidle * w, 6, dt);
  b.body.rotation.y = r.sidle;
  const P = r.pose || (r.pose = { y: .32 });
  P.y = damp(P.y, .32 - tucked * .08 - ready * .05, 16, dt);
  b.body.position.y = P.y + c.bob * w * (0.5 + 0.5 * Math.cos(2 * ph));
  const br = breath(time, r.seed, c) * (1 - w);
  b.shell.scale.set(1 + br, 1 - (s.hurt || 0) * .035 + br, 1);
  b.head.scale.setScalar(1 - tucked * .88);
  // eye stalks twitch and look around
  const look = s.lookYaw ? 0 : c.look * wander(time * 0.8, r.seed) * (s.aggro ? 0 : 1);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * .35 + look * .5, 8, dt);
  b.head.rotation.z = Math.max(0, Math.sin(time * 1.1 + r.seed * 2)) ** 18 * 0.12;
  // claws held up, bobbing with the steps, with an idle click now and then
  const click = busy ? 0 : Math.max(0, Math.sin(time * 1.4 + r.seed)) ** 16;
  P.clawX = damp(P.clawX || 0, -.85 * ready + .25 * hit, 20, dt);
  P.clawY = damp(P.clawY || 0, -.55 * ready + .35 * hit, 20, dt);
  for (const [side, name] of CRAB_CLAWS) {
    const claw = b[name];
    claw.rotation.x = P.clawX + Math.sin(2 * ph + side) * 0.06 * w;
    claw.rotation.y = side * (P.clawY + 0.18 * click);
    claw.position.z = claw.userData.rest.pos.z + .32 * hit;
    claw.scale.setScalar(1 - tucked * .85);
  }
  b.body.rotation.z = c.roll * w * Math.sin(ph) + Math.sin(time * 1.5) * .008;
  b.body.rotation.x = damp(b.body.rotation.x, -0.08 * ready + 0.1 * hit, 18, dt);
}

// ---------- wisp ----------

function buildWisp() {
  const rb = new RigBuilder({ outline: 0, rim: 0.6 });
  rb.bone('body', 'root', [0, 1.2, 0]);
  rb.bone('petals', 'body');
  rb.bone('ring', 'body', [0, 0, 0], [1.2, 0, 0]);
  rb.add('body', sph(0.28, 14, 10), '#bdf3ff', { glow: true });
  for (let i = 0; i < 5; i++) rb.add('petals', cone(0.12, 0.45, 5).translate(0, 0.25, 0), '#5fd0ff', { rot: [Math.cos(i * 1.26) * 0.6, 0, Math.sin(i * 1.26) * 0.6] });
  rb.add('ring', new THREE.TorusGeometry(0.45, 0.025, 6, 24), '#9fe6ff', { glow: true });
  for (const s of [1, -1]) rb.add('body', sph(0.04, 6, 4), '#2b5e7a', { pos: [s * 0.09, 0.04, 0.25], plain: true });
  const motes = [];
  for (let i = 0; i < 3; i++) {
    rb.bone(`mote${i}`, 'body');
    rb.add(`mote${i}`, sph(0.06, 6, 4), '#dff8ff', { glow: true });
    motes.push(`mote${i}`);
  }
  const rig = rb.build();
  rig.motes = motes;
  rig.height = 1.9;
  rig.halo = true;
  return rig;
}

function animWisp(r, s, dt, time) {
  const b = r.bones;
  // drifts like a lantern on the wind: tips into its travel, sways and bobs
  advanceGait(r, s, dt, r.motion);
  b.body.position.y = 1.2 + Math.sin(time * 2.4 + r.seed) * 0.12;
  b.body.rotation.x = damp(b.body.rotation.x, Math.min(0.3, (r.speed || 0) * 0.08) + Math.sin(time * 1.3 + r.seed) * 0.05, 4, dt);
  b.body.rotation.z = damp(b.body.rotation.z, clampAbs(-(s.vSide || 0) * 0.08, 0.25) + Math.sin(time * 0.9 + r.seed) * 0.06, 4, dt);
  b.petals.rotation.y += dt * (s.windup ? 5 : 1.5);
  b.ring.rotation.z += dt * 2;
  r.motes.forEach((m, i) => {
    const a = time * (s.windup ? 5 : 2.2) + (i * Math.PI * 2) / 3;
    const rr = s.windup ? 0.35 : 0.55;
    b[m].position.set(Math.sin(a) * rr, Math.sin(a * 2) * 0.15, Math.cos(a) * rr);
  });
  let k = 1;
  if (s.windup === 'orb') k = 1 + clamp01(s.windupT / s.windupTotal) * 0.4;
  const sc = damp(b.body.scale.x, k * (1 - (s.hurt || 0) * 0.2), 10, dt);
  b.body.scale.setScalar(sc);
  r.glowScale = 1.9 * k;
}

// ---------- sporecap ----------

function buildSporecap() {
  const C = { cap: '#b8503a', spot: '#f0e0c8', stem: '#e8dcc0', gill: '#c9a888', eye: '#2a1e18', mouth: '#5a3024', feet: '#d8c8a8' };
  const rb = new RigBuilder({ outline: 0.028, darkness: 0.32 });
  rb.bone('body', 'root', [0, 0.35, 0]);
  rb.bone('cap', 'body', [0, 0.55, 0]);
  rb.add('body', new THREE.CylinderGeometry(0.26, 0.32, 0.6, 12).translate(0, 0.25, 0), C.stem);
  rb.add('body', new THREE.TorusGeometry(0.25, 0.05, 6, 14).rotateX(Math.PI / 2), C.gill, { pos: [0, 0.4, 0], plain: true });
  for (const s of [1, -1]) {
    rb.add('body', sph(0.05, 8, 6).scale(1, 1.3, 0.5), C.eye, { pos: [s * 0.1, 0.32, 0.27], plain: true });
    rb.add('body', sph(0.015, 4, 3), '#ffffff', { pos: [s * 0.1 + 0.015, 0.35, 0.3], glow: true });
    rb.bone(`foot${s > 0 ? 'L' : 'R'}`, 'body', [s * 0.15, -0.05, 0]);
    rb.add(`foot${s > 0 ? 'L' : 'R'}`, sph(0.13, 8, 6).scale(1, 0.6, 1.3), C.feet, { pos: [0, -0.22, 0.05] });
    rb.bone(`arm${s > 0 ? 'L' : 'R'}`, 'body', [s * 0.27, 0.3, 0]);
    rb.add(`arm${s > 0 ? 'L' : 'R'}`, new THREE.CylinderGeometry(0.05, 0.04, 0.25, 6).translate(0, -0.12, 0), C.stem, { rot: [0, 0, s * 0.5] });
  }
  rb.add('body', new THREE.TorusGeometry(0.06, 0.018, 5, 10, Math.PI).rotateZ(Math.PI), C.mouth, { pos: [0, 0.2, 0.28], plain: true });
  rb.add('cap', new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.75, 1), C.cap);
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8 + 0.3;
    const rr = 0.25 + (i % 3) * 0.1;
    rb.add('cap', sph(0.07 + (i % 2) * 0.03, 6, 5).scale(1, 0.4, 1), C.spot, { pos: [Math.sin(a) * rr, 0.42 - rr * 0.3, Math.cos(a) * rr], plain: true });
  }
  const rig = rb.build();
  rig.height = 1.4;
  return rig;
}

const _foot = { angle: 0, lift: 0, planted: true };

function animSporecap(r, s, dt, time) {
  const b = r.bones;
  const c = r.motion;
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  let capS = 1 + Math.sin(time * 2 + r.seed) * 0.02;
  let sq = 1;
  let hop = 0;
  if (s.windup === 'puff') {
    capS = 1 + 0.35 * k + Math.sin(time * 30) * 0.03 * k;
    sq = 1 - 0.18 * k;
  } else if (s.state === 'act') {
    // hop: stretch in the air
    const t = clamp01(s.actT / 0.5);
    hop = Math.sin(t * Math.PI) * 0.9;
    sq = 1 + Math.sin(t * Math.PI) * 0.15;
  } else if (s.state === 'recover' && s.lastAttack === 'puff') capS = 0.92;
  if (s.hurt > 0) sq *= 1 - 0.15 * s.hurt;
  // waddle: rocks from foot to foot, squashes as each foot lands and springs up between steps
  const land = (0.5 + 0.5 * Math.cos(2 * ph)) * w;
  sq *= 1 - 0.07 * land + 0.04 * w + breath(time, r.seed, c) * (1 - w);
  for (const [n, off] of [['footL', 0], ['footR', 0.5]]) {
    legCycle(ph, off, r.duty, _foot);
    b[n].rotation.x = _foot.angle * r.swingA * w;
    b[n].position.y = b[n].userData.rest.pos.y + _foot.lift * 0.06 * w;
  }
  // the heavy cap lags behind: it nods on each step, tips back when setting off and wobbles when hit
  r.capX = r.capX || new Spring(70, 6);
  r.capZ = r.capZ || new Spring(70, 6);
  if ((s.hurt || 0) > (r.lastHurt || 0) + 0.5) r.capX.kick(-3);
  r.lastHurt = s.hurt || 0;
  b.cap.rotation.x = r.capX.update(-clampAbs(r.accel || 0, 4) * 0.04 + land * 0.05, dt);
  b.cap.rotation.z = r.capZ.update(-Math.sin(ph) * c.roll * 0.6 * w, dt);
  b.cap.scale.set(capS, capS * 0.95, capS);
  b.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  b.body.position.y = 0.35 + hop + c.bob * w * (0.5 - 0.5 * Math.cos(2 * ph));
  b.body.rotation.z = Math.sin(ph) * c.roll * w + Math.sin(time * 1.3 + r.seed) * 0.03 * (1 - w);
  b.body.rotation.x = damp(b.body.rotation.x, clampAbs(r.accel || 0, 4) * 0.03 + 0.06 * w, 8, dt);
  b.armL.rotation.x = -Math.sin(ph) * 0.5 * w + Math.sin(time * 1.7) * 0.1 * (1 - w);
  b.armR.rotation.x = Math.sin(ph) * 0.5 * w - Math.sin(time * 1.7) * 0.1 * (1 - w);
  b.armL.rotation.z = 0.15 * w + Math.sin(ph) * 0.12 * w;
  b.armR.rotation.z = -0.15 * w + Math.sin(ph) * 0.12 * w;
}

// ---------- crag golem ----------

function buildGolem() {
  const C = { rock: '#8f877c', rockD: '#6f685f', moss: '#6f9a44', crystal: '#8fe0ff', core: '#ffb86a' };
  const rb = new RigBuilder({ outline: 0.035, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0, 0]);
  rb.bone('hips', 'body', [0, 1.05, 0]);
  rb.bone('torso', 'hips', [0, 0.05, 0]);
  rb.bone('head', 'torso', [0, 1.25, 0.25]);
  rb.add('hips', sph(0.5, 8, 6).scale(1.1, 0.7, 0.9), C.rockD);
  rb.add('torso', new THREE.DodecahedronGeometry(0.85, 0).scale(1.2, 1, 0.95).translate(0, 0.65, 0), C.rock);
  rb.add('torso', sph(0.5, 8, 6).scale(1.5, 0.45, 1.1), C.moss, { pos: [0, 1.2, -0.15] });
  rb.add('torso', new THREE.OctahedronGeometry(0.17), C.core, { pos: [0, 0.65, 0.78], glow: true }); // golem heart
  for (let i = 0; i < 5; i++) rb.add('torso', new THREE.OctahedronGeometry(0.2).scale(0.6, 1.8, 0.6), C.crystal, { pos: [-0.5 + i * 0.25, 1.35 + (i % 2) * 0.12, -0.35], rot: [-0.4, 0, (i - 2) * 0.25] });
  rb.add('head', new THREE.DodecahedronGeometry(0.34, 0).scale(1.1, 0.85, 1), C.rock);
  for (const s of [1, -1]) rb.add('head', sph(0.05, 6, 5), C.core, { pos: [s * 0.13, 0.03, 0.28], glow: true });
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`arm${n}`, 'torso', [s * 1.05, 1.05, 0.05]);
    rb.add(`arm${n}`, new THREE.DodecahedronGeometry(0.38, 0), C.rockD);
    rb.add(`arm${n}`, cylDown(0.3, 0.26, 0.75, 7), C.rock, { pos: [0, -0.2, 0] });
    rb.bone(`fist${n}`, `arm${n}`, [0, -1.05, 0]);
    rb.add(`fist${n}`, new THREE.DodecahedronGeometry(0.42, 0), C.rock);
    rb.bone(`leg${n}`, 'hips', [s * 0.45, -0.1, 0]);
    rb.add(`leg${n}`, cylDown(0.3, 0.34, 0.9, 7), C.rockD);
    rb.add(`leg${n}`, new THREE.BoxGeometry(0.6, 0.2, 0.75), C.rock, { pos: [0, -0.9, 0.1] });
  }
  const rig = rb.build();
  rig.height = 3.1;
  return rig;
}

function animGolem(r, s, dt, time) {
  const b = r.bones;
  const c = r.motion;
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  // heavy biped: each footfall lands hard (the hips drop sharply), the torso rolls over the planted
  // leg and twists against the stride, the arms swing behind with weight
  const drop = poseLegs(r, c, ['legL', 'legR']);
  const thud = (0.5 + 0.5 * Math.cos(2 * ph)) ** 3 * w;
  let armL = [-Math.sin(ph) * 0.35 * w, 0, 0.12 + 0.06 * thud];
  let armR = [Math.sin(ph) * 0.35 * w, 0, -0.12 - 0.06 * thud];
  let torsoX = 0.1 + Math.sin(time * 1.1 + r.seed) * 0.02 + 0.06 * w;
  let hipsY = 1.05 - drop - c.bob * thud;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  if (s.windup === 'throw') {
    armL = [-2.8 * k, 0, 0.3];
    armR = [-2.8 * k, 0, -0.3];
    torsoX = 0.1 - 0.3 * k;
  } else if (s.windup === 'pound') {
    armL = [-2.4 * k, 0, 0.5 * k];
    armR = [-2.4 * k, 0, -0.5 * k];
    torsoX = 0.1 - 0.25 * k;
    hipsY += 0.1 * k;
  } else if (s.state === 'recover' && (s.lastAttack === 'pound' || s.lastAttack === 'throw')) {
    armL = [-0.6, 0, 0.3];
    armR = [-0.6, 0, -0.3];
    torsoX = s.lastAttack === 'pound' ? 0.55 : 0.3;
    hipsY -= s.lastAttack === 'pound' ? 0.2 : 0;
  }
  if (s.hurt > 0) torsoX -= 0.15 * s.hurt;
  b.armL.rotation.set(damp(b.armL.rotation.x, armL[0], 7, dt), 0, damp(b.armL.rotation.z, armL[2], 10, dt));
  b.armR.rotation.set(damp(b.armR.rotation.x, armR[0], 7, dt), 0, damp(b.armR.rotation.z, armR[2], 10, dt));
  const P = r.pose || (r.pose = { torsoX: 0.1, hipsY: 1.05 });
  P.torsoX = damp(P.torsoX, torsoX, 8, dt);
  P.hipsY = damp(P.hipsY, hipsY + drop + c.bob * thud, 12, dt);
  b.torso.rotation.x = P.torsoX + thud * 0.04;
  b.torso.rotation.z = Math.sin(ph) * c.roll * w;
  b.torso.rotation.y = -Math.sin(ph) * c.sway * w;
  const br = breath(time, r.seed, c) * (1 - w);
  b.torso.scale.set(1 + br, 1 + br * 0.5, 1 + br);
  b.hips.position.y = P.hipsY - drop - c.bob * thud;
  b.hips.rotation.z = -Math.sin(ph) * c.roll * 0.5 * w;
  const look = s.lookYaw ? 0 : c.look * wander(time * 0.3, r.seed) * (s.aggro ? 0 : 1) * (1 - w);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.6 + look + Math.sin(ph) * c.sway * w, 4, dt);
}

// ---------- gale hawk ----------

function buildHawk() {
  const C = { body: '#8a6a4a', belly: '#e8dcc4', wing: '#6f5438', tip: '#3a2a1e', beak: '#e0b040', eye: '#1e1410', storm: '#9fd8ff' };
  const rb = new RigBuilder({ outline: 0.025, darkness: 0.3 });
  rb.bone('body', 'root', [0, 2.6, 0]);
  rb.bone('head', 'body', [0, 0.12, 0.38]);
  rb.add('body', sph(0.3, 12, 10).scale(0.8, 0.75, 1.5), C.body);
  rb.add('body', sph(0.24, 10, 8).scale(0.8, 0.7, 1.3), C.belly, { pos: [0, -0.08, 0.05], plain: true });
  rb.add('body', cone(0.22, 0.5, 6).rotateX(-Math.PI / 2).scale(1.4, 0.35, 1), C.wing, { pos: [0, 0, -0.55] }); // tail fan
  rb.add('head', sph(0.17, 10, 8), C.body);
  rb.add('head', cone(0.06, 0.18, 5).rotateX(Math.PI / 2), C.beak, { pos: [0, -0.03, 0.2] });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.03, 6, 5), C.eye, { pos: [s * 0.1, 0.04, 0.1], plain: true });
    rb.add('head', sph(0.01, 4, 3), '#ffffff', { pos: [s * 0.105, 0.05, 0.125], glow: true });
    const n = s > 0 ? 'wingL' : 'wingR';
    rb.bone(n, 'body', [s * 0.2, 0.08, 0.05]);
    rb.add(n, new THREE.BoxGeometry(0.7, 0.04, 0.42).translate(s * 0.35, 0, 0), C.wing);
    rb.bone(`${n}t`, n, [s * 0.68, 0, 0]);
    rb.add(`${n}t`, new THREE.BoxGeometry(0.6, 0.03, 0.36).translate(s * 0.3, 0, -0.05), C.tip);
    rb.add(`${n}t`, new THREE.BoxGeometry(0.2, 0.02, 0.2).translate(s * 0.4, 0.02, 0.1), C.storm, { plain: true });
  }
  for (const s of [1, -1]) rb.add('body', cylDown(0.025, 0.02, 0.22, 5), C.beak, { pos: [s * 0.1, -0.2, 0.05], plain: true });
  const rig = rb.build();
  rig.height = 3.1;
  rig.flyer = true;
  return rig;
}

function animHawk(r, s, dt, time) {
  const b = r.bones;
  const c = r.motion;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  // flaps in bouts and glides between them; the wing tips trail the arm of the wing, so each beat
  // rolls out along the wing instead of the whole wing hinging like a board
  const effort = clamp01(0.55 + wander(time * 0.5, r.seed) * 0.9 + (s.speed || 0) * 0.04);
  r.flapAmt = damp(r.flapAmt || 1, effort > c.glide ? 1 : 0.15, 3, dt);
  r.flapPh = (r.flapPh || 0) + dt * c.flap * (0.6 + 0.4 * r.flapAmt);
  const f = r.flapPh;
  let wingOpen = 0.12 + Math.sin(f) * 0.6 * r.flapAmt;
  let tip = Math.sin(f - 0.9) * 0.45 * r.flapAmt + 0.1 * (1 - r.flapAmt);
  let pitch = clampAbs(r.accel || 0, 3) * 0.04;
  let lift = -Math.cos(f) * 0.07 * r.flapAmt;
  let kk = 30;
  if (s.windup === 'dive') {
    wingOpen = 0.9 - 1.3 * k; // wings fold back
    tip = wingOpen * 0.5;
    pitch = 0.5 * k;
    kk = 20;
  } else if (s.state === 'act') {
    wingOpen = -0.6;
    tip = -0.3;
    pitch = 0.9;
    kk = 20;
  } else if (s.state === 'recover') {
    wingOpen = 0.3 + Math.sin(time * 14) * 0.7;
    tip = Math.sin(time * 14 - 0.9) * 0.4;
    pitch = -0.3;
    kk = 20;
  }
  advanceGait(r, s, dt, c);
  b.wingL.rotation.z = damp(b.wingL.rotation.z, wingOpen, kk, dt);
  b.wingR.rotation.z = damp(b.wingR.rotation.z, -wingOpen, kk, dt);
  b.wingLt.rotation.z = damp(b.wingLt.rotation.z, tip, kk, dt);
  b.wingRt.rotation.z = damp(b.wingRt.rotation.z, -tip, kk, dt);
  b.body.rotation.x = damp(b.body.rotation.x, pitch, 10, dt);
  b.body.rotation.z = damp(b.body.rotation.z, clampAbs(-s.turn * 0.12, 0.6), 6, dt);
  b.body.position.y = damp(b.body.position.y, 0.4 + (s.alt ?? 2.6) + Math.sin(time * 2 + r.seed) * 0.08 + lift, 10, dt);
  // the head holds still against the bob, then darts to look
  b.head.rotation.x = -b.body.rotation.x * 0.6;
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.7 + Math.round(wander(time * 0.7, r.seed) * 3) * 0.12 * (s.aggro ? 0 : 1), 12, dt);
}

// ---------- horned warden (boss) ----------

function buildWarden() {
  const C = { fur: '#6a4a36', furDark: '#4a3224', horn: '#e7dcc0', hornTip: '#b9a98a', muzzle: '#9a7a62', eye: '#ffd24a', leather: '#5b3a22', metal: '#8a8d96', nose: '#3a2a22', rune: '#b89cff' };
  const rb = new RigBuilder({ outline: 0.04, darkness: 0.28 });
  rb.bone('body', 'root');
  rb.bone('hips', 'body', [0, 1.45, 0]);
  rb.bone('torso', 'hips');
  rb.bone('head', 'torso', [0, 1.55, 0.55]);
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`leg${n}`, 'hips', [s * 0.42, 0, 0]);
    rb.add(`leg${n}`, cylDown(0.3, 0.22, 0.8, 9), C.fur);
    rb.bone(`knee${n}`, `leg${n}`, [0, -0.78, 0]);
    rb.add(`knee${n}`, cylDown(0.2, 0.17, 0.62, 8), C.furDark, { rot: [0.25, 0, 0] });
    rb.add(`knee${n}`, new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8), C.nose, { pos: [0, -0.6, 0.14] });
  }
  rb.add('torso', sph(0.85, 16, 12).scale(1.15, 1.0, 0.85).translate(0, 0.85, 0.1), C.fur);
  rb.add('torso', sph(0.6, 12, 10).scale(1, 0.9, 0.8), C.muzzle, { pos: [0, 0.45, 0.28], plain: true });
  rb.add('torso', new THREE.TorusGeometry(0.88, 0.06, 6, 24).scale(1.1, 1, 0.85), C.leather, { pos: [0, 0.9, 0.1], rot: [0.2, 0, 0.7] });
  rb.add('torso', new THREE.TorusGeometry(0.72, 0.08, 6, 20).rotateX(Math.PI / 2).scale(1.05, 0.85, 1), C.leather, { pos: [0, 0.1, 0.02] });
  rb.add('torso', new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10).rotateX(Math.PI / 2), C.metal, { pos: [0, 0.12, 0.62] });
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2;
    rb.add('torso', cone(0.2, 0.55, 5), C.furDark, { pos: [Math.sin(a) * 0.6, 1.55, Math.cos(a) * 0.25 - 0.15], rot: [-0.9, 0, -Math.sin(a) * 0.5] });
  }
  rb.bone('rune', 'torso', [0, 1.0, 0.82]);
  rb.add('rune', new THREE.CircleGeometry(0.2, 6), C.rune, { glow: true });
  rb.add('head', sph(0.45, 14, 10).scale(0.9, 0.85, 1.05), C.fur, { pos: [0, 0, 0.1] });
  rb.add('head', sph(0.3, 12, 8).scale(1.05, 0.8, 0.9), C.muzzle, { pos: [0, -0.15, 0.45] });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.06, 6, 5), C.nose, { pos: [s * 0.1, -0.1, 0.72], plain: true });
    rb.add('head', sph(0.07, 8, 6), C.eye, { pos: [s * 0.2, 0.12, 0.44], glow: true });
    let px = s * 0.35;
    let py = 0.25;
    let pz = 0.05;
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      const rr = 0.13 * (1 - i / segs) + 0.03;
      const a = i / (segs - 1);
      const dir = new THREE.Vector3(s * (1 - a * 0.9), 0.35 + a * 0.9, 0.1 + a * 0.6).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const e = new THREE.Euler().setFromQuaternion(q);
      rb.add('head', new THREE.CylinderGeometry(rr * 0.8, rr, 0.32, 8), i < segs - 1 ? C.horn : C.hornTip, { pos: [px + dir.x * 0.14, py + dir.y * 0.14, pz + dir.z * 0.14], rot: [e.x, e.y, e.z] });
      px += dir.x * 0.28;
      py += dir.y * 0.28;
      pz += dir.z * 0.28;
    }
    rb.add('head', cone(0.1, 0.3, 5), C.furDark, { pos: [s * 0.42, 0.05, -0.05], rot: [0, 0, -s * 1.3] });
    rb.add('head', new THREE.TorusGeometry(0.06, 0.018, 5, 10), C.metal, { pos: [s * 0.58, -0.05, -0.03], rot: [0, Math.PI / 2, 0], plain: true });
  }
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`arm${n}`, 'torso', [s * 0.95, 1.2, 0.1]);
    rb.add(`arm${n}`, sph(0.36, 10, 8), C.fur);
    rb.add(`arm${n}`, cylDown(0.26, 0.22, 0.8, 9), C.fur);
    rb.bone(`elbow${n}`, `arm${n}`, [0, -0.78, 0]);
    rb.add(`elbow${n}`, cylDown(0.24, 0.2, 0.75, 9), C.furDark);
    rb.add(`elbow${n}`, new THREE.CylinderGeometry(0.27, 0.27, 0.25, 9), C.leather, { pos: [0, -0.3, 0] });
    rb.add(`elbow${n}`, sph(0.26, 10, 8), C.muzzle, { pos: [0, -0.8, 0] });
  }
  rb.bone('tail', 'hips', [0, 0.1, -0.55]);
  rb.add('tail', new THREE.CylinderGeometry(0.06, 0.03, 0.9, 5).translate(0, -0.45, 0), C.furDark, { rot: [-0.5, 0, 0] });
  const rig = rb.build();
  rig.height = 3.7;
  return rig;
}

const WARDEN_KNEE = (n) => n.replace('leg', 'knee');

function animWarden(r, s, dt, time) {
  const b = r.bones;
  const c = r.motion;
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  // a heavy upright stride: knees bend through the swing, the hips drop on each footfall and
  // roll over the planted leg, the shoulders counter-twist and the arms swing against the legs
  const drop = poseLegs(r, c, ['legL', 'legR'], WARDEN_KNEE);
  const thud = (0.5 + 0.5 * Math.cos(2 * ph)) ** 2 * w;
  let torsoX = 0.2 + Math.sin(time * 1.6) * 0.03 + 0.05 * w;
  let headX = 0;
  let armX = [Math.sin(ph) * 0.4 * w, -Math.sin(ph) * 0.4 * w];
  let armZ = [0.25, -0.25];
  let torsoY = -Math.sin(ph) * c.sway * w;
  let hipsY = 1.45 - drop - c.bob * thud;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  if (s.windup === 'slam') {
    armX = [-2.6 * k, -2.6 * k];
    armZ = [0.1, -0.1];
    torsoX = 0.2 - 0.35 * k;
    hipsY += 0.15 * k;
  } else if (s.windup === 'sweep') {
    armX = [-0.6, -1.2 * k];
    armZ = [0.3, -1.3 * k];
    torsoY = 0.8 * k;
  } else if (s.windup === 'quake') {
    // one fist raised high, the other braced; the ground splits ahead
    armX = [-2.9 * k, 0.3];
    armZ = [0.2, -0.1];
    torsoX = -0.35 * k;
    hipsY += 0.2 * k;
    headX = -0.2 * k;
  } else if (s.state === 'recover' && s.lastAttack === 'quake') {
    // Quake enters recovery when the fist lands; hold the planted fist while
    // the four marked eruptions travel out, then straighten up.
    const hold = 1 - clamp01((s.actT - 0.4) / 0.6);
    armX = [-0.95 * hold, 0.3 * hold];
    torsoX = 0.55 * hold;
    hipsY -= 0.2 * hold;
    headX = 0.2 * hold;
  } else if (s.state === 'act') {
    headX = 0.55;
    torsoX = 0.7;
    armX = [0.8, 0.8];
    b.legL.rotation.x = Math.sin(time * 18) * 0.8;
    b.legR.rotation.x = -Math.sin(time * 18) * 0.8;
  } else if (s.state === 'recover' && s.lastAttack === 'slam') {
    armX = [-0.9, -0.9];
    torsoX = 0.75;
    hipsY -= 0.25;
  } else if (s.state === 'recover' && s.lastAttack === 'sweep') {
    torsoY = -0.7;
    armZ = [0.3, 0.2];
    armX = [-0.6, -1.2];
  } else if (s.state === 'stunned') {
    headX = Math.sin(time * 10) * 0.2;
    torsoX = 0.5;
  }
  if (s.hurt > 0) torsoX -= 0.12 * s.hurt;
  b.torso.rotation.x = damp(b.torso.rotation.x, torsoX, 10, dt);
  b.torso.rotation.y = damp(b.torso.rotation.y, torsoY, s.state === 'recover' ? 22 : 10, dt);
  b.head.rotation.x = damp(b.head.rotation.x, headX, 10, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.5, 5, dt);
  ['armL', 'armR'].forEach((n, i) => {
    b[n].rotation.x = damp(b[n].rotation.x, armX[i], s.state === 'recover' ? 25 : 10, dt);
    b[n].rotation.z = damp(b[n].rotation.z, armZ[i], 10, dt);
  });
  b.elbowL.rotation.x = damp(b.elbowL.rotation.x, s.windup === 'slam' ? -0.4 : -0.35, 10, dt);
  b.elbowR.rotation.x = damp(b.elbowR.rotation.x, s.windup === 'slam' ? -0.4 : -0.35, 10, dt);
  r.hipsY = damp(r.hipsY ?? 1.45, hipsY + drop + c.bob * thud, 14, dt);
  b.hips.position.y = r.hipsY - drop - c.bob * thud;
  b.hips.rotation.z = Math.sin(ph) * c.roll * w;
  b.torso.rotation.z = -Math.sin(ph) * c.roll * 0.6 * w;
  const br = breath(time, r.seed, c) * (1 - w);
  b.torso.scale.set(1 + br, 1 + br * 0.5, 1 + br);
  r.tailSpring = r.tailSpring || new Spring(40, 5);
  b.tail.rotation.z = r.tailSpring.update(Math.sin(time * 3) * 0.3 + Math.sin(ph) * 0.3 * w + clampAbs(s.turn * 0.3, 0.5), dt);
  const glow = s.enraged ? 1.4 + Math.sin(time * 8) * 0.4 : 0.6;
  b.rune.scale.setScalar(glow);
}

// ---------- registry ----------

// The Tidal Slime is a body of water: a base on the ground, a middle mass, the curling crest
// on top, a front lip (its face) and three rim points round the base. Springs on those bones
// make it slosh, lag behind its own movement and wobble when hit (data/monster-motion.json slime).
const SLIME_RIMS = [['rimL', 1, 0], ['rimR', -1, 0], ['rimB', 0, -1]];

function buildSaltSlime() {
  const rb = new RigBuilder({ outline: .022, darkness: .3 });
  rb.bone('body', 'root', [0, 0, 0]);
  rb.bone('mid', 'body', [0, .32, 0]);
  rb.bone('crest', 'mid', [-.25, .42, -.05]);
  rb.bone('front', 'body', [0, .2, .3]);
  rb.bone('rimL', 'body', [.45, .08, 0]);
  rb.bone('rimR', 'body', [-.5, .08, 0]);
  rb.bone('rimB', 'body', [0, .08, -.33]);
  rb.add('mid', sph(.65, 16, 12).scale(1, .66, 1), '#56aeb4', { pos: [0, .03, 0] });
  rb.add('mid', sph(.47, 12, 8).scale(1, .6, 1), '#8dd4ca', { pos: [0, .11, .13], plain: true });
  for (const x of [-.2, .2]) rb.add('front', sph(.045, 8, 5).scale(.8, 1.5, .6), '#233e48', { pos: [x, .27, .25], plain: true });
  // Salt crystals give this creature a coastal silhouette and show its material.
  for (const [x, y, z] of [[-.26, .4, -.18], [0, .46, -.23], [.24, .37, -.16]]) rb.add('mid', new THREE.OctahedronGeometry(.14), '#e3f1dc', { pos: [x, y, z], rot: [0, .3, .2] });
  const rig = rb.build(); rig.height = 1.15; return rig;
}

function animSaltSlime(r, s, dt, time) {
  const b = r.bones;
  const c = r.motion;
  const J = MOTION.slime;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  const stroke = coastalStrike(s, 'slap');
  const ready = Math.max(0, -stroke), hit = Math.max(0, stroke);
  const spit = s.windup === 'salt_spit' ? k : 0;
  const spat = s.state === 'recover' && s.lastAttack === 'salt_spit' ? 1 - clamp01((s.actT || 0) / 0.4) : 0;
  // it travels in pulses, locked to its ground speed: gather (low and wide), then surge (tall,
  // reaching forward); the crest lags behind and sloshes over when it stops
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  const surge = 0.5 + 0.5 * Math.sin(ph);
  if (!r.jx) {
    r.jx = new Spring(J.stiffness, J.damping);
    r.jz = new Spring(J.stiffness, J.damping);
    r.jy = new Spring(J.stiffness * 1.4, J.damping);
    r.jy.x = 1;
  }
  if ((s.hurt || 0) > (r.lastHurt || 0) + 0.5) {
    r.jy.kick(-J.hitKick);
    r.jx.kick(J.hitKick * 0.8);
  }
  r.lastHurt = s.hurt || 0;
  const slosh = J.slosh * (Math.sin(time * 1.7 + r.seed) + 0.5 * Math.sin(time * 2.9 + r.seed * 2)) * (1 - 0.5 * w);
  const sq = 1 - .25 * ready - .2 * hit + .15 * spit - .1 * spat + J.hop * w * (surge - 0.55) + Math.sin(time * 3 + r.seed) * .025;
  const sy = r.jy.update(sq, dt);
  const lagX = r.jx.update(-J.drag * (r.speed || 0) - J.inertia * clampAbs(r.accel || 0, 6) + slosh - .45 * ready + .9 * hit - .3 * spit + .2 * spat, dt);
  const lagZ = r.jz.update(J.drag * 0.8 * (s.vSide || 0) - clampAbs(s.turn * 0.15, 0.3) + slosh * 0.6 * Math.cos(time * 1.3 + r.seed), dt);
  const body = b.body;
  const flat = 1 / Math.sqrt(Math.max(0.4, sy));
  body.scale.set(flat, sy, flat * (1 + .12 * hit + .06 * w * surge));
  body.position.z = .12 * hit;
  b.mid.rotation.x = lagX * 0.55;
  b.mid.rotation.z = -lagZ * 0.55;
  const swell = 1 + .14 * spit + .05 * w * surge;
  b.mid.scale.set(swell, 1 + .08 * spit, swell);
  // the crest curls: back on a wind-up, whipping over the front on the slap
  b.crest.rotation.x = lagX;
  b.crest.rotation.z = -lagZ;
  b.front.position.z = b.front.userData.rest.pos.z + .06 * w * surge + .22 * hit - .05 * ready;
  b.front.position.y = b.front.userData.rest.pos.y - .04 * ready;
  // ripples run round the base; the back edge drags while it moves
  for (let i = 0; i < SLIME_RIMS.length; i++) {
    const [n, ox, oz] = SLIME_RIMS[i];
    const rim = b[n], rest = rim.userData.rest.pos;
    const wave = Math.sin(time * 4.2 - i * 2.1 + r.seed) * J.ripple + (surge - 0.5) * 0.08 * w;
    rim.position.set(rest.x + ox * wave, rest.y + Math.abs(wave) * 0.4, rest.z + oz * wave - (oz < 0 ? 0.06 * w * (1 - surge) : 0));
  }
}

function buildShoreGull() {
  const rb = new RigBuilder({ outline: .025, darkness: .3 });
  rb.bone('body', 'root', [0, .65, 0]);
  rb.add('body', sph(.38, 12, 10).scale(.8, 1, 1.2), '#e2dfcb');
  rb.bone('head', 'body', [0,.38,.26]);
  rb.add('head', sph(.23, 12, 8), '#f0ead8');
  rb.add('head', cone(.08,.32,5).rotateX(Math.PI/2), '#d5a34b', {pos:[0,-.03,.29]});
  for (const [side, suffix] of [[1,'L'],[-1,'R']]) {
    rb.add('head', sph(.035,6,4), '#283d49', {pos:[side*.17,.04,.12],plain:true});
    rb.bone('wing'+suffix,'body',[side*.29,.12,-.05]);
    rb.add('wing'+suffix,sph(.3,10,8).scale(.3,1,1.4),'#687f8a',{pos:[side*.03,-.08,-.08]});
    rb.bone('leg'+suffix,'body',[side*.14,-.22,.03]);
    rb.add('leg'+suffix,cylDown(.035,.025,.4,5),'#bb8a45');
    rb.add('leg'+suffix,new THREE.BoxGeometry(.16,.055,.24),'#bb8a45',{pos:[0,-.4,.06]});
  }
  rb.add('body',cone(.19,.45,4).rotateX(-Math.PI/2),'#566e79',{pos:[0,-.05,-.53]});
  const rig = rb.build(); rig.height=1.4; return rig;
}

function animShoreGull(r, s, dt, time) {
  const b = r.bones;
  const c = r.motion;
  const w = advanceGait(r, s, dt, c);
  const ph = r.phase;
  const stroke = coastalStrike(s, 'peck'), ready = Math.max(0, -stroke), hit = Math.max(0, stroke);
  // a waddle: rocks over each foot, and the head thrusts forward and holds still while the body
  // catches up (the bird-walk head bob)
  for (const [n, off] of [['legL', 0], ['legR', 0.5]]) {
    legCycle(ph, off, r.duty, _foot);
    b[n].rotation.x = _foot.angle * r.swingA * w;
    b[n].position.y = b[n].userData.rest.pos.y + _foot.lift * 0.05 * w;
  }
  for (const [side, n] of [[1, 'L'], [-1, 'R']]) {
    const ruffle = Math.max(0, Math.sin(time * 0.8 + r.seed * 2)) ** 20 * 0.35;
    b['wing' + n].rotation.z = damp(b['wing' + n].rotation.z, side * (s.state === 'retreat' ? .25 + Math.sin(time * 14) * .15 : .05 + .25 * ready + ruffle + 0.06 * w), 12, dt);
  }
  const P = r.pose || (r.pose = { x: 0, headX: 0 });
  P.x = damp(P.x, -.15 * ready + .3 * hit + clampAbs(r.accel || 0, 4) * 0.03, 20, dt);
  P.headX = damp(P.headX, -.55 * ready + 1.1 * hit, 24, dt);
  b.body.rotation.x = P.x + 0.08 * w;
  b.body.rotation.z = Math.sin(ph) * c.roll * w;
  b.body.position.y = .65 + Math.sin(time * 2 + r.seed) * .02 * (1 - w) + c.bob * w * (0.5 + 0.5 * Math.cos(2 * ph));
  const thrust = ((2 * ph) / (Math.PI * 2)) % 1;
  b.head.position.z = b.head.userData.rest.pos.z + (thrust < 0.35 ? thrust / 0.35 : 1 - (thrust - 0.35) / 0.65) * 0.08 * w - 0.03 * w;
  b.head.rotation.x = P.headX - b.body.rotation.x;
  const look = s.aggro ? 0 : Math.round(wander(time * 0.9, r.seed) * 3) * 0.18 * (1 - w);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * .6 + look, 16, dt);
}

const BUILDERS = {
  tusk_boar: [buildBoar, (r, s, dt, t) => animQuad(r, s, dt, t, { bodyY: 0.62, paw: true })],
  thornback_wolf: [() => buildWolf('wolf'), (r, s, dt, t) => animQuad(r, s, dt, t, { bodyY: 0.72, gallop: true })],
  greyfang: [() => buildWolf('greyfang'), (r, s, dt, t) => animQuad(r, s, dt, t, { bodyY: 0.72, gallop: true })],
  spirit_wolf: [() => buildWolf('spirit'), (r, s, dt, t) => animQuad(r, s, dt, t, { bodyY: 0.72, gallop: true })],
  moss_beetle: [buildBeetle, animBeetle],
  reef_crab: [buildCrab, animCrab],
  salt_slime: [buildSaltSlime, animSaltSlime],
  shore_gull: [buildShoreGull, animShoreGull],
  hermit_crab: [() => buildCrab(true), animCrab],
  marsh_wisp: [buildWisp, animWisp],
  sporecap: [buildSporecap, animSporecap],
  crag_golem: [buildGolem, animGolem],
  gale_hawk: [buildHawk, animHawk],
  horned_warden: [buildWarden, animWarden],
  ...MIDHIGH_BUILDERS,
};

export const MONSTER_SCALE = { thornback_wolf: 1.2, greyfang: 1.9, spirit_wolf: 1.1, crag_golem: 0.85, horned_warden: 1.6, ...MIDHIGH_SCALE };

export function buildMonster(type, level = 1, boss = false) {
  const [build, anim] = BUILDERS[type] || BUILDERS.tusk_boar;
  const rig = build();
  // an imported model, once loaded, replaces the procedural parts on the same bones
  const model = monsterModel(type === 'spirit_wolf' ? 'thornback_wolf' : type);
  if (model) { attachMonsterModel(rig, model); rig.modelSource = type === 'spirit_wolf' ? 'thornback_wolf' : type; if(type === 'spirit_wolf') rig.material.userData.flash.value.z = .08; }
  rig.animate = anim;
  rig.motion = motionConfig(MOTION, type);
  rig.seed = Math.random() * 10;
  const s = monsterScale(type, level, boss);
  rig.root.scale.setScalar(s);
  rig.baseScale = s;
  rig.type = type;
  rig.boss = boss;
  return rig;
}

/** Model scale for a monster (higher levels are a little bigger; bosses fixed). */
export function monsterScale(type, level = 1, boss = false) {
  // an imported model may be drawn at its own size (rootScale in data/models.json)
  const base = (MONSTER_SCALE[type] || 1) * (monsterModel(type === 'spirit_wolf' ? 'thornback_wolf' : type)?.cfg.rootScale ?? 1);
  return boss ? base : base * (1 + Math.min(0.25, (level - 1) * 0.03));
}

function clampAbs(v, m) {
  return v > m ? m : v < -m ? -m : v;
}
