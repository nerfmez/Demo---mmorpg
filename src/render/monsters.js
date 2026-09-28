// Monster models + animation. Each silhouette shows what it drops (tusks and hide, a mossy
// shell, a glowing core, huge horns, thorny pelt and fangs, spore caps, crag stone with a
// glowing heart, feathers). Not plush toys: grounded shapes, darker outlines, readable
// wind-ups. Rigs are merged per bone (rig.js); animation adds gait cycles, anticipation,
// squash/stretch, head tracking, springy tails/ears and hit reactions.
import * as THREE from 'three';
import { RigBuilder, damp, clamp01, Spring } from './rig.js';

const cylDown = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, -h / 2, 0);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 5) => new THREE.ConeGeometry(r, h, seg);

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
  const moving = s.moving || s.state === 'act';
  const run = s.state === 'act' ? 2.2 : s.speedFactor;
  r.phase = (r.phase || 0) + dt * (moving ? 7 + run * 7 : 0);
  const ph = r.phase;
  r.runW = damp(r.runW || 0, moving ? 1 : 0, 10, dt);
  const w = r.runW;
  const legs = r.legs;
  const stride = (s.state === 'act' ? 0.85 : 0.55) * w;
  legs.forEach((n, i) => {
    const off = cfg.gallop && s.state === 'act' ? (i < 2 ? 0 : Math.PI * 0.6) : i === 0 || i === 3 ? 0 : Math.PI;
    b[n].rotation.x = Math.sin(ph + off) * stride;
    if (b[`${n}k`]) b[`${n}k`].rotation.x = Math.max(0, Math.cos(ph + off)) * 0.7 * w;
  });
  let bodyX = 0;
  let bodyY = cfg.bodyY + Math.abs(Math.sin(ph)) * 0.05 * w;
  let headX = Math.sin(time * 2 + r.seed) * 0.03 - 0.05 * w;
  let squash = 1;
  let jaw = 0;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  const wu = s.windup;
  if (wu === 'charge' || wu === 'lunge' || wu === 'triple') {
    // crouch, head low, hind legs coiled; front paw scrapes on the boar
    headX = 0.35 * k;
    bodyX = 0.12 * k;
    bodyY -= 0.12 * k;
    squash = 1 - 0.08 * k;
    if (cfg.paw) b[legs[0]].rotation.x = Math.sin(time * 18) * 0.6 * k;
    jaw = 0.25 * k;
  } else if (wu === 'bite') {
    headX = -0.3 * k;
    jaw = 0.6 * k;
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
    jaw = 0.15;
  } else if (s.state === 'stunned') {
    headX = 0.2 + Math.sin(time * 12) * 0.1;
    b.body.rotation.z = Math.sin(time * 8) * 0.15;
  }
  if (s.state !== 'stunned') b.body.rotation.z = damp(b.body.rotation.z, clampAbs(-s.turn * 0.06, 0.2), 10, dt);
  // hit reaction: knocked back a little and squashed
  if (s.hurt > 0) {
    bodyX -= 0.25 * s.hurt;
    squash *= 1 - 0.12 * s.hurt;
  }
  b.head.rotation.x = damp(b.head.rotation.x, headX, 14, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.8, 6, dt);
  b.body.rotation.x = damp(b.body.rotation.x, bodyX, 12, dt);
  b.body.position.y = damp(b.body.position.y, bodyY, 18, dt);
  b.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  if (b.jaw) b.jaw.rotation.x = damp(b.jaw.rotation.x, jaw, 18, dt);
  r.tailSpring = r.tailSpring || new Spring(70, 7);
  const tailTarget = (wu ? 0.5 : 0) + Math.sin(time * (moving ? 10 : 4) + r.seed) * (moving ? 0.25 : 0.12);
  b.tail.rotation.z = r.tailSpring.update(tailTarget, dt);
  for (const e of ['earL', 'earR']) if (b[e]) b[e].rotation.x = damp(b[e].rotation.x, wu ? -0.4 : Math.sin(time * 3 + r.seed) * 0.05 - 0.15 * w, 10, dt);
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

function animBeetle(r, s, dt, time) {
  const b = r.bones;
  r.phase = (r.phase || 0) + dt * (s.moving ? 14 : 0);
  const ph = r.phase;
  const shellK = (r.shellK = damp(r.shellK || 0, s.state === 'shell' ? 1 : 0, 12, dt));
  r.legs.forEach((n, i) => {
    const tripod = (i % 2 === 0) === (Math.floor(i / 2) % 2 === 0) ? 0 : Math.PI;
    b[n].rotation.y = s.moving ? Math.sin(ph + tripod) * 0.35 : 0;
    b[n].rotation.x = s.moving ? Math.max(0, Math.cos(ph + tripod)) * -0.25 : 0;
    b[n].scale.setScalar(1 - shellK * 0.7);
  });
  let headX = 0;
  let mand = Math.sin(time * 5 + r.seed) * 0.08;
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  if (s.windup === 'spit') {
    headX = -0.45 * k;
    mand = 0.4 * k;
  } else if (s.state === 'recover' && s.lastAttack === 'spit') headX = 0.25;
  b.body.position.y = damp(b.body.position.y, 0.45 - shellK * 0.3 + (s.moving ? Math.abs(Math.sin(ph)) * 0.02 : 0), 16, dt);
  b.shell.scale.set(1 + shellK * 0.12, 1 + shellK * 0.1 + (s.hurt || 0) * -0.08, 1 + shellK * 0.12);
  b.shell.rotation.x = s.moving ? Math.sin(ph * 0.5) * 0.03 : 0;
  b.head.scale.setScalar(1 - shellK * 0.6);
  b.head.rotation.x = damp(b.head.rotation.x, headX, 14, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.5, 6, dt);
  b.mandL.rotation.y = damp(b.mandL.rotation.y, -mand, 16, dt);
  b.mandR.rotation.y = damp(b.mandR.rotation.y, mand, 16, dt);
  b.body.rotation.z = s.moving ? Math.sin(ph * 0.5) * 0.04 : Math.sin(time * 1.5) * 0.015;
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
  b.body.position.y = 1.2 + Math.sin(time * 2.4 + r.seed) * 0.12;
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

function animSporecap(r, s, dt, time) {
  const b = r.bones;
  r.phase = (r.phase || 0) + dt * (s.moving ? 9 : 0);
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
  b.cap.scale.set(capS, capS * 0.95, capS);
  b.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  b.body.position.y = 0.35 + hop + (s.moving ? Math.abs(Math.sin(ph)) * 0.06 : 0);
  b.body.rotation.z = s.moving ? Math.sin(ph) * 0.1 : Math.sin(time * 1.3 + r.seed) * 0.03;
  b.footL.rotation.x = s.moving ? Math.sin(ph) * 0.6 : 0;
  b.footR.rotation.x = s.moving ? -Math.sin(ph) * 0.6 : 0;
  b.armL.rotation.x = s.moving ? -Math.sin(ph) * 0.5 : Math.sin(time * 1.7) * 0.1;
  b.armR.rotation.x = s.moving ? Math.sin(ph) * 0.5 : -Math.sin(time * 1.7) * 0.1;
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
  r.phase = (r.phase || 0) + dt * (s.moving ? 4.5 : 0);
  const ph = r.phase;
  const w = (r.runW = damp(r.runW || 0, s.moving ? 1 : 0, 6, dt));
  b.legL.rotation.x = Math.sin(ph) * 0.4 * w;
  b.legR.rotation.x = -Math.sin(ph) * 0.4 * w;
  let armL = [-Math.sin(ph) * 0.3 * w, 0, 0.12];
  let armR = [Math.sin(ph) * 0.3 * w, 0, -0.12];
  let torsoX = 0.1 + Math.sin(time * 1.1 + r.seed) * 0.02;
  let torsoZ = Math.sin(ph) * 0.08 * w;
  let hipsY = 1.05 + Math.abs(Math.sin(ph)) * 0.06 * w;
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
  b.armL.rotation.set(damp(b.armL.rotation.x, armL[0], 10, dt), 0, damp(b.armL.rotation.z, armL[2], 10, dt));
  b.armR.rotation.set(damp(b.armR.rotation.x, armR[0], 10, dt), 0, damp(b.armR.rotation.z, armR[2], 10, dt));
  b.torso.rotation.x = damp(b.torso.rotation.x, torsoX, 8, dt);
  b.torso.rotation.z = torsoZ;
  b.hips.position.y = damp(b.hips.position.y, hipsY, 12, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.6, 4, dt);
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
  const k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  let flap = Math.sin(time * 9 + r.seed);
  let wingOpen = 0.2 + flap * 0.55;
  let pitch = 0;
  if (s.windup === 'dive') {
    wingOpen = 0.9 - 1.3 * k; // wings fold back
    pitch = 0.5 * k;
  } else if (s.state === 'act') {
    wingOpen = -0.6;
    pitch = 0.9;
  } else if (s.state === 'recover') {
    wingOpen = 0.3 + Math.sin(time * 14) * 0.7;
    pitch = -0.3;
  }
  b.wingL.rotation.z = damp(b.wingL.rotation.z, wingOpen, 20, dt);
  b.wingR.rotation.z = damp(b.wingR.rotation.z, -wingOpen, 20, dt);
  b.wingLt.rotation.z = damp(b.wingLt.rotation.z, wingOpen * 0.5, 20, dt);
  b.wingRt.rotation.z = damp(b.wingRt.rotation.z, -wingOpen * 0.5, 20, dt);
  b.body.rotation.x = damp(b.body.rotation.x, pitch, 10, dt);
  b.body.rotation.z = damp(b.body.rotation.z, clampAbs(-s.turn * 0.12, 0.6), 6, dt);
  b.body.position.y = damp(b.body.position.y, 0.4 + (s.alt ?? 2.6) + Math.sin(time * 2 + r.seed) * 0.08, 10, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.7, 6, dt);
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

function animWarden(r, s, dt, time) {
  const b = r.bones;
  r.phase = (r.phase || 0) + dt * (s.moving ? 5.5 * (s.enraged ? 1.25 : 1) : 0);
  const ph = r.phase;
  const w = (r.runW = damp(r.runW || 0, s.moving ? 1 : 0, 8, dt));
  b.legL.rotation.x = Math.sin(ph) * 0.55 * w;
  b.legR.rotation.x = -Math.sin(ph) * 0.55 * w;
  b.kneeL.rotation.x = Math.max(0, Math.sin(ph + 1.2)) * 0.5 * w;
  b.kneeR.rotation.x = Math.max(0, Math.sin(ph + Math.PI + 1.2)) * 0.5 * w;
  let torsoX = 0.2 + Math.sin(time * 1.6) * 0.03;
  let headX = 0;
  let armX = [Math.sin(ph) * 0.4 * w, -Math.sin(ph) * 0.4 * w];
  let armZ = [0.25, -0.25];
  let torsoY = 0;
  let hipsY = 1.45 + Math.abs(Math.sin(ph)) * 0.07 * w;
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
  } else if (s.windup === 'gore') {
    headX = 0.55 * k;
    torsoX = 0.2 + 0.5 * k;
    armX = [0.5, 0.5];
    hipsY -= 0.2 * k;
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
  b.hips.position.y = damp(b.hips.position.y, hipsY, 14, dt);
  r.tailSpring = r.tailSpring || new Spring(40, 5);
  b.tail.rotation.z = r.tailSpring.update(Math.sin(time * 3) * 0.3, dt);
  const glow = s.enraged ? 1.4 + Math.sin(time * 8) * 0.4 : 0.6;
  b.rune.scale.setScalar(glow);
}

// ---------- registry ----------

const BUILDERS = {
  tusk_boar: [buildBoar, (r, s, dt, t) => animQuad(r, s, dt, t, { bodyY: 0.62, paw: true })],
  thornback_wolf: [() => buildWolf('wolf'), (r, s, dt, t) => animQuad(r, s, dt, t, { bodyY: 0.72, gallop: true })],
  greyfang: [() => buildWolf('greyfang'), (r, s, dt, t) => animQuad(r, s, dt, t, { bodyY: 0.72, gallop: true })],
  spirit_wolf: [() => buildWolf('spirit'), (r, s, dt, t) => animQuad(r, s, dt, t, { bodyY: 0.72, gallop: true })],
  moss_beetle: [buildBeetle, animBeetle],
  marsh_wisp: [buildWisp, animWisp],
  sporecap: [buildSporecap, animSporecap],
  crag_golem: [buildGolem, animGolem],
  gale_hawk: [buildHawk, animHawk],
  horned_warden: [buildWarden, animWarden],
};

export const MONSTER_SCALE = { thornback_wolf: 1.2, greyfang: 1.9, spirit_wolf: 1.1, crag_golem: 0.85, horned_warden: 1.6 };

export function buildMonster(type, level = 1, boss = false) {
  const [build, anim] = BUILDERS[type] || BUILDERS.tusk_boar;
  const rig = build();
  rig.animate = anim;
  rig.seed = Math.random() * 10;
  const base = MONSTER_SCALE[type] || 1;
  const s = boss ? base : base * (1 + Math.min(0.25, (level - 1) * 0.03));
  rig.root.scale.setScalar(s);
  rig.baseScale = s;
  return rig;
}

function clampAbs(v, m) {
  return v > m ? m : v < -m ? -m : v;
}
