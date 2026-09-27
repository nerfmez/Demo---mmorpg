// Monster models. Each silhouette shows what it drops: the boar's big tusks and hide,
// the beetle's mossy shell, the wisp's glowing core, the warden's huge horns.
// Not plush toys: grounded shapes, darker outlines, readable wind-up poses.
import * as THREE from 'three';
import { Palette, part } from './characters.js';

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

// ---------- Tusk Boar ----------
function buildBoar() {
  const pal = new Palette({ hide: '#7b4f33', hideDark: '#56351f', belly: '#a27451', tusk: '#f3ead2', snout: '#c98f7a', eye: '#1c1410', hoof: '#3b2a20', mane: '#4a2e1c' }, 0.03);
  const root = new THREE.Group();
  const body = pivot(root, 0, 0.62, 0);
  const torso = new THREE.SphereGeometry(0.55, 14, 10);
  torso.scale(0.85, 0.72, 1.25);
  part(body, torso, pal, 'hide');
  const belly = new THREE.SphereGeometry(0.45, 12, 8);
  belly.scale(0.8, 0.5, 1.05);
  part(body, belly, pal, 'belly', { pos: [0, -0.16, 0.05], outline: false });
  // bristle mane along the back
  for (let i = 0; i < 7; i++) {
    const g = new THREE.ConeGeometry(0.07, 0.26, 4);
    part(body, g, pal, 'mane', { pos: [0, 0.38 - Math.abs(i - 2) * 0.02, 0.4 - i * 0.14], rot: [-0.5, 0, (i % 2 ? 0.2 : -0.2)] });
  }
  const head = pivot(body, 0, 0.05, 0.62);
  const hg = new THREE.SphereGeometry(0.34, 12, 10);
  hg.scale(0.85, 0.8, 1.0);
  part(head, hg, pal, 'hide', { pos: [0, 0, 0.1] });
  const snout = new THREE.CylinderGeometry(0.15, 0.19, 0.24, 10);
  snout.rotateX(Math.PI / 2);
  part(head, snout, pal, 'snout', { pos: [0, -0.06, 0.42] });
  // tusks: big and curved, the drop you want
  for (const side of [1, -1]) {
    const t = new THREE.ConeGeometry(0.05, 0.36, 6);
    t.translate(0, 0.18, 0);
    part(head, t, pal, 'tusk', { pos: [side * 0.13, -0.12, 0.4], rot: [0.5, 0, -side * 0.55] });
    part(head, new THREE.SphereGeometry(0.035, 6, 4), pal, 'eye', { pos: [side * 0.15, 0.1, 0.33], outline: false });
    const ear = new THREE.ConeGeometry(0.08, 0.18, 4);
    part(head, ear, pal, 'hideDark', { pos: [side * 0.2, 0.25, 0.02], rot: [-0.3, 0, -side * 0.5] });
  }
  const legs = [];
  for (const [x, z] of [[0.28, 0.42], [-0.28, 0.42], [0.28, -0.42], [-0.28, -0.42]]) {
    const l = pivot(body, x, -0.2, z);
    const g = new THREE.CylinderGeometry(0.09, 0.07, 0.42, 7);
    g.translate(0, -0.21, 0);
    part(l, g, pal, 'hide');
    part(l, new THREE.CylinderGeometry(0.075, 0.08, 0.08, 7), pal, 'hoof', { pos: [0, -0.42, 0] });
    legs.push(l);
  }
  const tail = new THREE.ConeGeometry(0.04, 0.25, 4);
  tail.translate(0, -0.12, 0);
  const tailP = pivot(body, 0, 0.15, -0.66);
  part(tailP, tail, pal, 'hideDark', { rot: [-0.6, 0, 0] });
  return { root, body, head, legs, tail: tailP, pal, type: 'tusk_boar', height: 1.35 };
}

function animBoar(r, s, dt, time) {
  const ph = (r.phase = (r.phase || 0) + dt * (s.moving ? s.speed * 3.2 : 0));
  const w = (r.runW = damp(r.runW || 0, s.moving ? 1 : 0, 10, dt));
  r.legs.forEach((l, i) => {
    const off = i === 0 || i === 3 ? 0 : Math.PI;
    l.rotation.x = Math.sin(ph + off) * 0.6 * w;
  });
  let headX = Math.sin(time * 2) * 0.03;
  let bodyX = 0;
  let bodyY = 0.62 + Math.abs(Math.sin(ph)) * 0.05 * w;
  if (s.windup === 'charge') {
    // head down, paw the ground
    headX = 0.35;
    bodyX = 0.12;
    r.legs[0].rotation.x = Math.sin(time * 18) * 0.6;
    bodyY -= 0.08;
  } else if (s.windup === 'bite') {
    headX = -0.25 * Math.min(1, s.windupT / s.windupTotal);
  } else if (s.state === 'act') {
    headX = 0.25;
    bodyX = 0.1;
    r.legs.forEach((l, i) => (l.rotation.x = Math.sin(time * 30 + i * 1.6) * 0.8));
  } else if (s.state === 'stunned') {
    headX = 0.2 + Math.sin(time * 12) * 0.1;
    r.body.rotation.z = Math.sin(time * 8) * 0.15;
  }
  if (s.state !== 'stunned') r.body.rotation.z = damp(r.body.rotation.z, 0, 10, dt);
  r.head.rotation.x = damp(r.head.rotation.x, headX, 14, dt);
  r.body.rotation.x = damp(r.body.rotation.x, bodyX, 10, dt);
  r.body.position.y = bodyY;
  r.tail.rotation.z = Math.sin(time * 9) * 0.4;
}

// ---------- Moss Shell Beetle ----------
function buildBeetle() {
  const pal = new Palette({ shell: '#5d8a3a', moss: '#7fb14a', body: '#3c3a2f', leg: '#2c2a22', mandible: '#d9c9a0', eye: '#e7f06a', spot: '#a6c95a' }, 0.03);
  const root = new THREE.Group();
  const body = pivot(root, 0, 0.45, 0);
  const under = new THREE.SphereGeometry(0.5, 12, 8);
  under.scale(0.95, 0.45, 1.2);
  part(body, under, pal, 'body');
  const shellP = pivot(body, 0, 0.05, 0);
  const shell = new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  shell.scale(1.0, 0.85, 1.2);
  part(shellP, shell, pal, 'shell', { double: true });
  // moss tufts and plates on the shell
  const rng = [0.3, -0.25, 0.1, -0.35, 0.4, -0.05, 0.2];
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    const g = new THREE.SphereGeometry(0.13 + (i % 3) * 0.03, 8, 6);
    g.scale(1, 0.5, 1);
    part(shellP, g, pal, i % 2 ? 'moss' : 'spot', { pos: [Math.sin(a) * 0.32, 0.42 + rng[i] * 0.1, Math.cos(a) * 0.38], outline: false });
  }
  const ridge = new THREE.BoxGeometry(0.05, 0.06, 1.2);
  part(shellP, ridge, pal, 'body', { pos: [0, 0.52, 0], outline: false });
  const head = pivot(body, 0, 0.02, 0.62);
  const hg = new THREE.SphereGeometry(0.26, 10, 8);
  hg.scale(1, 0.75, 0.9);
  part(head, hg, pal, 'body');
  for (const side of [1, -1]) {
    const m = new THREE.ConeGeometry(0.045, 0.3, 5);
    m.rotateX(Math.PI / 2);
    m.translate(0, 0, 0.15);
    part(head, m, pal, 'mandible', { pos: [side * 0.1, -0.05, 0.15], rot: [0, -side * 0.45, 0] });
    part(head, new THREE.SphereGeometry(0.05, 6, 5), pal, 'eye', { pos: [side * 0.14, 0.08, 0.14], outline: false, emissive: '#6d7a10', emissiveIntensity: 0.5 });
  }
  const legs = [];
  for (let i = 0; i < 3; i++)
    for (const side of [1, -1]) {
      const l = pivot(body, side * 0.42, -0.05, 0.35 - i * 0.35);
      const g = new THREE.CylinderGeometry(0.035, 0.03, 0.5, 5);
      g.translate(0, -0.25, 0);
      part(l, g, pal, 'leg', { rot: [0, 0, side * 0.9] });
      l.userData.side = side;
      legs.push(l);
    }
  return { root, body, head, legs, shell: shellP, pal, type: 'moss_beetle', height: 1.2 };
}

function animBeetle(r, s, dt, time) {
  const ph = (r.phase = (r.phase || 0) + dt * (s.moving ? 14 : 0));
  const shellK = (r.shellK = damp(r.shellK || 0, s.state === 'shell' ? 1 : 0, 12, dt));
  r.legs.forEach((l, i) => {
    l.rotation.y = s.moving ? Math.sin(ph + i * 1.2) * 0.35 : 0;
    l.scale.setScalar(1 - shellK * 0.7);
  });
  r.body.position.y = 0.45 - shellK * 0.3;
  r.shell.scale.set(1 + shellK * 0.12, 1 + shellK * 0.1, 1 + shellK * 0.12);
  r.head.scale.setScalar(1 - shellK * 0.6);
  let headX = 0;
  if (s.windup === 'spit') headX = -0.35 * Math.min(1, s.windupT / s.windupTotal);
  r.head.rotation.x = damp(r.head.rotation.x, headX, 14, dt);
  r.body.rotation.z = s.moving ? Math.sin(ph * 0.5) * 0.04 : Math.sin(time * 1.5) * 0.015;
}

// ---------- Marsh Wisp ----------
function buildWisp() {
  const pal = new Palette({ core: '#bdf3ff', glow: '#5fd0ff', ring: '#9fe6ff', dark: '#2b5e7a' }, 0.02);
  const root = new THREE.Group();
  const body = pivot(root, 0, 1.2, 0);
  part(body, new THREE.SphereGeometry(0.28, 14, 10), pal, 'core', { emissive: '#7fdcff', emissiveIntensity: 0.9, outline: false });
  // soft halo (camera-facing)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7fdcff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
  halo.scale.set(1.9, 1.9, 1);
  body.add(halo);
  // little hood of flame-like petals
  const petals = pivot(body, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.ConeGeometry(0.12, 0.45, 5);
    g.translate(0, 0.25, 0);
    part(petals, g, pal, 'glow', { rot: [Math.cos(i * 1.26) * 0.6, 0, Math.sin(i * 1.26) * 0.6], emissive: '#2aa7e0', emissiveIntensity: 0.6, outline: false });
  }
  const ring = new THREE.TorusGeometry(0.45, 0.025, 6, 24);
  const ringM = part(body, ring, pal, 'ring', { emissive: '#5fd0ff', emissiveIntensity: 0.7, outline: false, rot: [1.2, 0, 0] });
  // eyes
  for (const side of [1, -1]) part(body, new THREE.SphereGeometry(0.04, 6, 4), pal, 'dark', { pos: [side * 0.09, 0.04, 0.25], outline: false });
  // motes orbiting
  const motes = [];
  for (let i = 0; i < 3; i++) {
    const m = part(body, new THREE.SphereGeometry(0.06, 6, 4), pal, 'core', { emissive: '#bff4ff', emissiveIntensity: 1, outline: false, shadow: false });
    motes.push(m);
  }
  return { root, body, petals, ring: ringM, motes, halo, pal, type: 'marsh_wisp', height: 1.9 };
}

function animWisp(r, s, dt, time) {
  r.body.position.y = 1.2 + Math.sin(time * 2.4 + r.seed) * 0.12;
  r.petals.rotation.y += dt * 1.5;
  r.ring.rotation.z += dt * 2;
  r.motes.forEach((m, i) => {
    const a = time * 2.2 + (i * Math.PI * 2) / 3;
    m.position.set(Math.sin(a) * 0.55, Math.sin(a * 2) * 0.15, Math.cos(a) * 0.55);
  });
  let k = 1;
  if (s.windup === 'orb') k = 1 + Math.min(1, s.windupT / s.windupTotal) * 0.6;
  r.halo.scale.setScalar(1.9 * k);
  r.body.scale.setScalar(damp(r.body.scale.x, k > 1 ? 1.15 : 1, 10, dt));
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// ---------- Horned Warden (boss) ----------
function buildWarden() {
  const pal = new Palette({ fur: '#6a4a36', furDark: '#4a3224', horn: '#e7dcc0', hornTip: '#b9a98a', muzzle: '#9a7a62', eye: '#ffd24a', leather: '#5b3a22', metal: '#8a8d96', nose: '#3a2a22', rune: '#b89cff' }, 0.04);
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const hips = pivot(body, 0, 1.45, 0);
  const legs = [];
  for (const side of [1, -1]) {
    const l = pivot(hips, side * 0.42, 0, 0);
    const g = new THREE.CylinderGeometry(0.3, 0.22, 0.8, 9);
    g.translate(0, -0.4, 0);
    part(l, g, pal, 'fur');
    const k = pivot(l, 0, -0.78, 0);
    const g2 = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8);
    g2.translate(0, -0.31, 0);
    part(k, g2, pal, 'furDark', { rot: [0.25, 0, 0] });
    part(k, new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8), pal, 'nose', { pos: [0, -0.6, 0.14] });
    l.userData.knee = k;
    legs.push(l);
  }
  const torso = pivot(hips, 0, 0, 0);
  const chest = new THREE.SphereGeometry(0.85, 16, 12);
  chest.scale(1.15, 1.0, 0.85);
  chest.translate(0, 0.85, 0.1);
  part(torso, chest, pal, 'fur');
  const belly = new THREE.SphereGeometry(0.6, 12, 10);
  belly.scale(1, 0.9, 0.8);
  part(torso, belly, pal, 'muzzle', { pos: [0, 0.45, 0.28], outline: false });
  // harness
  const strap = new THREE.TorusGeometry(0.88, 0.06, 6, 24);
  part(torso, strap, pal, 'leather', { pos: [0, 0.9, 0.1], rot: [0.2, 0, 0.7], scale: [1.1, 1, 0.85] });
  part(torso, new THREE.TorusGeometry(0.72, 0.08, 6, 20), pal, 'leather', { pos: [0, 0.1, 0.02], rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.85, 1] });
  part(torso, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10).rotateX(Math.PI / 2), pal, 'metal', { pos: [0, 0.12, 0.62] });
  // shaggy mane
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2;
    const g = new THREE.ConeGeometry(0.2, 0.55, 5);
    part(torso, g, pal, 'furDark', { pos: [Math.sin(a) * 0.6, 1.55, Math.cos(a) * 0.25 - 0.15], rot: [-0.9, 0, -Math.sin(a) * 0.5] });
  }
  const head = pivot(torso, 0, 1.55, 0.55);
  const hg = new THREE.SphereGeometry(0.45, 14, 10);
  hg.scale(0.9, 0.85, 1.05);
  part(head, hg, pal, 'fur', { pos: [0, 0, 0.1] });
  const muzzle = new THREE.SphereGeometry(0.3, 12, 8);
  muzzle.scale(1.05, 0.8, 0.9);
  part(head, muzzle, pal, 'muzzle', { pos: [0, -0.15, 0.45] });
  for (const side of [1, -1]) {
    part(head, new THREE.SphereGeometry(0.06, 6, 5), pal, 'nose', { pos: [side * 0.1, -0.1, 0.72], outline: false });
    part(head, new THREE.SphereGeometry(0.07, 8, 6), pal, 'eye', { pos: [side * 0.2, 0.12, 0.44], outline: false, emissive: '#ffb020', emissiveIntensity: 1 });
    // huge curved horns: several tapered segments sweeping out and forward
    let px = side * 0.35;
    let py = 0.25;
    let pz = 0.05;
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      const rr = 0.13 * (1 - i / segs) + 0.03;
      const g = new THREE.CylinderGeometry(rr * 0.8, rr, 0.32, 8);
      const a = i / (segs - 1);
      const dir = new THREE.Vector3(side * (1 - a * 0.9), 0.35 + a * 0.9, 0.1 + a * 0.6).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const m = part(head, g, pal, i < segs - 1 ? 'horn' : 'hornTip', { pos: [px + dir.x * 0.14, py + dir.y * 0.14, pz + dir.z * 0.14] });
      m.quaternion.copy(q);
      px += dir.x * 0.28;
      py += dir.y * 0.28;
      pz += dir.z * 0.28;
    }
    const ear = new THREE.ConeGeometry(0.1, 0.3, 5);
    part(head, ear, pal, 'furDark', { pos: [side * 0.42, 0.05, -0.05], rot: [0, 0, -side * 1.3] });
    part(head, new THREE.TorusGeometry(0.06, 0.018, 5, 10), pal, 'metal', { pos: [side * 0.58, -0.05, -0.03], rot: [0, Math.PI / 2, 0], outline: false });
  }
  const arms = [];
  for (const side of [1, -1]) {
    const sh = pivot(torso, side * 0.95, 1.2, 0.1);
    part(sh, new THREE.SphereGeometry(0.36, 10, 8), pal, 'fur');
    const g = new THREE.CylinderGeometry(0.26, 0.22, 0.8, 9);
    g.translate(0, -0.4, 0);
    part(sh, g, pal, 'fur');
    const el = pivot(sh, 0, -0.78, 0);
    const g2 = new THREE.CylinderGeometry(0.24, 0.2, 0.75, 9);
    g2.translate(0, -0.37, 0);
    part(el, g2, pal, 'furDark');
    part(el, new THREE.CylinderGeometry(0.27, 0.27, 0.25, 9), pal, 'leather', { pos: [0, -0.3, 0] });
    const fist = new THREE.SphereGeometry(0.26, 10, 8);
    part(el, fist, pal, 'muzzle', { pos: [0, -0.8, 0] });
    sh.userData.elbow = el;
    sh.userData.side = side;
    arms.push(sh);
  }
  // rune plate on the chest (enrage glow)
  const rune = part(torso, new THREE.CircleGeometry(0.2, 6), pal, 'rune', { pos: [0, 1.0, 0.82], outline: false, emissive: '#8f6cff', emissiveIntensity: 0.3 });
  const tail = pivot(hips, 0, 0.1, -0.55);
  const tg = new THREE.CylinderGeometry(0.06, 0.03, 0.9, 5);
  tg.translate(0, -0.45, 0);
  part(tail, tg, pal, 'furDark', { rot: [-0.5, 0, 0] });
  return { root, body, hips, torso, head, legs, arms, tail, rune, pal, type: 'horned_warden', height: 3.7 };
}

function animWarden(r, s, dt, time) {
  const ph = (r.phase = (r.phase || 0) + dt * (s.moving ? s.speed * 1.6 : 0));
  const w = (r.runW = damp(r.runW || 0, s.moving ? 1 : 0, 8, dt));
  r.legs.forEach((l, i) => {
    l.rotation.x = Math.sin(ph + i * Math.PI) * 0.55 * w;
    l.userData.knee.rotation.x = Math.max(0, Math.sin(ph + i * Math.PI + 1.2)) * 0.5 * w;
  });
  let torsoX = 0.2 + Math.sin(time * 1.6) * 0.03;
  let headX = 0;
  let armX = [Math.sin(ph) * 0.4 * w, -Math.sin(ph) * 0.4 * w];
  let armZ = [0.25, -0.25];
  let torsoY = 0;
  let hipsY = 1.45 + Math.abs(Math.sin(ph)) * 0.06 * w;
  const k = s.windupTotal ? Math.min(1, s.windupT / s.windupTotal) : 0;
  if (s.windup === 'slam') {
    // both fists up over the head, then down
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
    r.legs.forEach((l, i) => (l.rotation.x = Math.sin(time * 18 + i * Math.PI) * 0.8));
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
  r.torso.rotation.x = damp(r.torso.rotation.x, torsoX, 10, dt);
  r.torso.rotation.y = damp(r.torso.rotation.y, torsoY, s.state === 'recover' ? 22 : 10, dt);
  r.head.rotation.x = damp(r.head.rotation.x, headX, 10, dt);
  r.arms.forEach((a, i) => {
    a.rotation.x = damp(a.rotation.x, armX[i], s.state === 'recover' ? 25 : 10, dt);
    a.rotation.z = damp(a.rotation.z, armZ[i], 10, dt);
    a.userData.elbow.rotation.x = damp(a.userData.elbow.rotation.x, s.windup === 'slam' ? -0.4 : -0.35, 10, dt);
  });
  r.hips.position.y = damp(r.hips.position.y, hipsY, 14, dt);
  r.tail.rotation.z = Math.sin(time * 3) * 0.3;
  const glow = s.enraged ? 1.4 + Math.sin(time * 8) * 0.4 : 0.3;
  r.rune.material.emissiveIntensity = glow;
  r.rune.material.userData.baseIntensity = glow;
}

const BUILDERS = { tusk_boar: [buildBoar, animBoar], moss_beetle: [buildBeetle, animBeetle], marsh_wisp: [buildWisp, animWisp], horned_warden: [buildWarden, animWarden] };

export function buildMonster(type, level) {
  const [build, anim] = BUILDERS[type];
  const rig = build();
  rig.animate = anim;
  rig.seed = Math.random() * 10;
  // gentle size variation by level so higher-level ones read as tougher
  const s = type === 'horned_warden' ? 1 : 1 + Math.min(0.25, (level - 1) * 0.035);
  rig.root.scale.setScalar(s);
  rig.baseScale = s;
  return rig;
}
