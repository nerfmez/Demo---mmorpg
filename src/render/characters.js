// The hero (from docs/reference/hero-character-sheet.png) and town NPCs.
// Normal proportions (about 6.5 heads), dark navy messy hair, red scarf with a trailing
// tail, cream tunic, brown straps and belt, left shoulder guard, bracers, dark trousers,
// tall cuffed brown boots. Built from simple shapes with cel shading and soft outlines.
import * as THREE from 'three';
import { toonRamp, outlineMaterial } from './toon.js';
import { Ribbon } from './ribbon.js';

const HERO = {
  skin: '#f6d2b5',
  hair: '#262a44',
  hairHi: '#3a3f63',
  shirt: '#f1e3cc',
  leather: '#7a4b2c',
  leatherDark: '#5b371f',
  metal: '#b9bcc4',
  scarf: '#cf3a30',
  pants: '#34343f',
  boots: '#8a5634',
  eye: '#2b2e44',
};

export class Palette {
  constructor(colors, outline = 0.02) {
    this.colors = colors;
    this.mats = new Map();
    this.outlineW = outline;
    this.all = [];
  }
  mat(name, opts = {}) {
    const key = name + (opts.double ? '|d' : '');
    if (this.mats.has(key)) return this.mats.get(key);
    const m = new THREE.MeshToonMaterial({
      color: new THREE.Color(this.colors[name] || name),
      gradientMap: toonRamp(),
      side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0),
      emissiveIntensity: opts.emissiveIntensity ?? 1,
    });
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseIntensity = m.emissiveIntensity;
    this.mats.set(key, m);
    this.all.push(m);
    return m;
  }
  outline(name) {
    const c = new THREE.Color(this.colors[name] || name);
    const hsl = {};
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * 0.9), hsl.l * 0.32);
    return outlineMaterial(`#${c.getHexString()}`, this.outlineW);
  }
  /** Hit flash (white) or wind-up tell (warm tint): tint every material for a moment. */
  flash(k, r = 1, g = 1, b = 1) {
    for (const m of this.all) {
      if (k > 0) {
        m.emissive.setRGB(k * r, k * g, k * b);
        m.emissiveIntensity = 1;
      } else {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseIntensity;
      }
    }
  }
}

/** Add a mesh (+ outline hull) to a parent. */
export function part(parent, geo, pal, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = null, outline = true, double = false, shadow = true, emissive = null, emissiveIntensity } = {}) {
  const mesh = new THREE.Mesh(geo, pal.mat(color, { double, emissive, emissiveIntensity }));
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = shadow;
  parent.add(mesh);
  if (outline) {
    const hull = new THREE.Mesh(geo, pal.outline(color));
    mesh.add(hull);
  }
  return mesh;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const cyl = (rt, rb, h, seg = 10) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(0, -h / 2, 0); // hangs down from its pivot
  return g;
};

/** Humanoid rig shared by the hero and NPCs. */
export function buildHumanoid(colors, opts = {}) {
  const pal = new Palette(colors, opts.outline ?? 0.018);
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const hips = pivot(body, 0, 0.93, 0);
  const rig = { root, body, hips, pal };

  // legs
  for (const side of [1, -1]) {
    const leg = pivot(hips, side * 0.1, 0, 0);
    part(leg, cyl(0.085, 0.07, 0.46), pal, 'pants', { pos: [0, 0, 0] });
    const knee = pivot(leg, 0, -0.45, 0);
    part(knee, cyl(0.068, 0.058, 0.3), pal, 'pants');
    // tall boot with folded cuff
    part(knee, cyl(0.078, 0.07, 0.3), pal, 'boots', { pos: [0, -0.14, 0] });
    part(knee, cyl(0.1, 0.09, 0.1), pal, opts.bootCuff || 'boots', { pos: [0, -0.06, 0] });
    const foot = new THREE.BoxGeometry(0.12, 0.08, 0.24);
    part(knee, foot, pal, 'boots', { pos: [0, -0.43, 0.05] });
    rig[side > 0 ? 'legL' : 'legR'] = leg;
    rig[side > 0 ? 'kneeL' : 'kneeR'] = knee;
  }

  // torso
  const torso = pivot(hips, 0, 0, 0);
  rig.torso = torso;
  const chestGeo = new THREE.CylinderGeometry(0.19, 0.155, 0.48, 12);
  chestGeo.translate(0, 0.24, 0);
  chestGeo.scale(1, 1, 0.72);
  part(torso, chestGeo, pal, 'shirt');
  // tunic hem flaring over the hips
  const hemGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.26, 12, 1, true);
  hemGeo.translate(0, -0.1, 0);
  hemGeo.scale(1, 1, 0.8);
  part(torso, hemGeo, pal, 'shirt', { double: true });
  if (!opts.noBelt) {
    const belt = new THREE.CylinderGeometry(0.168, 0.168, 0.07, 12);
    belt.scale(1, 1, 0.78);
    part(torso, belt, pal, 'leather', { pos: [0, 0.03, 0] });
    part(torso, new THREE.BoxGeometry(0.06, 0.05, 0.02), pal, 'metal', { pos: [0, 0.03, 0.135] });
    part(torso, new THREE.BoxGeometry(0.08, 0.1, 0.05), pal, 'leather', { pos: [-0.14, -0.03, 0.07], rot: [0, 0.5, 0] });
  }
  if (opts.straps) {
    // cross-body straps
    const strap = new THREE.BoxGeometry(0.035, 0.55, 0.012);
    part(torso, strap, pal, 'leatherDark', { pos: [0, 0.27, 0.117], rot: [0, 0, 0.62], outline: false });
    part(torso, strap, pal, 'leatherDark', { pos: [0, 0.27, -0.117], rot: [0, 0, -0.62], outline: false });
    part(torso, new THREE.BoxGeometry(0.035, 0.3, 0.012), pal, 'leatherDark', { pos: [0.09, 0.33, 0.12], rot: [0, 0, 0], outline: false });
  }
  // neck + head
  part(torso, cyl(0.05, 0.055, 0.1), pal, 'skin', { pos: [0, 0.56, 0] });
  const head = pivot(torso, 0, 0.6, 0);
  rig.head = head;
  const headGeo = new THREE.SphereGeometry(0.125, 16, 12);
  headGeo.scale(0.95, 1.08, 1.0);
  headGeo.translate(0, 0.12, 0.005);
  part(head, headGeo, pal, 'skin');
  // eyes (big anime eyes, facing +Z)
  for (const side of [1, -1]) {
    const eye = new THREE.CircleGeometry(0.024, 10);
    eye.scale(0.8, 1.25, 1);
    part(head, eye, pal, 'eye', { pos: [side * 0.045, 0.12, 0.122], rot: [0, side * 0.2, 0], outline: false, shadow: false });
    const hi = new THREE.CircleGeometry(0.008, 6);
    part(head, hi, pal, '#ffffff', { pos: [side * 0.045 + 0.006, 0.132, 0.1235], rot: [0, side * 0.2, 0], outline: false, shadow: false });
  }
  if (opts.hair) opts.hair(head, pal);

  // arms
  for (const side of [1, -1]) {
    const sh = pivot(torso, side * 0.215, 0.44, 0);
    part(sh, new THREE.SphereGeometry(0.07, 10, 8), pal, 'shirt', { pos: [0, -0.02, 0] });
    part(sh, cyl(0.062, 0.055, 0.27), pal, 'shirt');
    const el = pivot(sh, 0, -0.27, 0);
    // rolled sleeve
    part(el, cyl(0.062, 0.06, 0.05), pal, 'shirt', { pos: [0, 0.03, 0] });
    part(el, cyl(0.048, 0.042, 0.24), pal, 'skin');
    // bracer + fingerless glove
    part(el, cyl(0.058, 0.052, 0.13), pal, 'leather', { pos: [0, -0.09, 0] });
    const hand = pivot(el, 0, -0.25, 0);
    part(hand, new THREE.SphereGeometry(0.048, 8, 6), pal, 'leatherDark', { pos: [0, -0.02, 0] });
    rig[side > 0 ? 'armL' : 'armR'] = sh;
    rig[side > 0 ? 'elbowL' : 'elbowR'] = el;
    rig[side > 0 ? 'handL' : 'handR'] = hand;
  }
  return rig;
}

function heroHair(head, pal) {
  // messy dark navy hair: a cap plus spiky locks
  const cap = new THREE.SphereGeometry(0.138, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  cap.scale(1.0, 1.05, 1.05);
  cap.translate(0, 0.14, -0.012);
  part(head, cap, pal, 'hair');
  const lock = (x, y, z, rx, rz, len = 0.13, r = 0.045) => {
    const g = new THREE.ConeGeometry(r, len, 5);
    g.translate(0, -len / 2, 0);
    part(head, g, pal, 'hair', { pos: [x, y, z], rot: [rx, 0, rz] });
  };
  // fringe falling over the forehead
  lock(0.0, 0.25, 0.1, 0.45, 0.1, 0.12);
  lock(0.055, 0.25, 0.095, 0.4, -0.35, 0.13);
  lock(-0.055, 0.25, 0.095, 0.45, 0.45, 0.13);
  lock(0.1, 0.22, 0.06, 0.2, -0.75, 0.15);
  lock(-0.1, 0.22, 0.06, 0.2, 0.75, 0.15);
  // sides and back, flicking outward
  lock(0.13, 0.16, -0.02, 0.1, -0.35, 0.17);
  lock(-0.13, 0.16, -0.02, 0.1, 0.35, 0.17);
  lock(0.08, 0.17, -0.11, -0.5, -0.3, 0.17);
  lock(-0.08, 0.17, -0.11, -0.5, 0.3, 0.17);
  lock(0.0, 0.2, -0.13, -0.7, 0, 0.18);
  // ahoge-ish top spikes
  const spike = (x, z, rx, rz) => {
    const g = new THREE.ConeGeometry(0.04, 0.12, 5);
    g.translate(0, 0.06, 0);
    part(head, g, pal, 'hair', { pos: [x, 0.26, z], rot: [rx, 0, rz] });
  };
  spike(0.02, -0.02, -0.4, -0.3);
  spike(-0.05, -0.05, -0.7, 0.4);
  spike(0.07, -0.06, -0.8, -0.6);
}

export function buildHero() {
  const rig = buildHumanoid(HERO, { straps: true, hair: heroHair });
  const { pal, torso, handR } = rig;
  // left shoulder guard (brown leather with metal rim)
  const guard = new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  guard.scale(1.15, 0.8, 1.1);
  part(rig.armL, guard, pal, 'leather', { pos: [0.02, 0.01, 0], rot: [0, 0, -0.35] });
  const rim = new THREE.TorusGeometry(0.105, 0.012, 5, 16);
  rim.rotateX(Math.PI / 2);
  rim.scale(1.1, 1, 1.05);
  part(rig.armL, rim, pal, 'metal', { pos: [0.02, -0.005, 0], rot: [0, 0, -0.35], outline: false });
  // scarf wrap around the neck
  const wrap = new THREE.TorusGeometry(0.1, 0.05, 8, 16);
  wrap.rotateX(Math.PI / 2);
  wrap.scale(1.05, 1.2, 0.95);
  part(torso, wrap, pal, 'scarf', { pos: [0, 0.54, -0.005] });
  const knot = new THREE.SphereGeometry(0.06, 8, 6);
  part(torso, knot, pal, 'scarf', { pos: [0.06, 0.5, -0.08] });
  rig.scarfAnchor = pivot(torso, 0.06, 0.5, -0.1);
  rig.scarf = new Ribbon({ segments: 9, length: 0.95, width: 0.15, material: pal.mat('scarf', { double: true }) });
  // thigh holster pouch
  part(rig.legR, new THREE.BoxGeometry(0.06, 0.14, 0.08), pal, 'leather', { pos: [-0.08, -0.16, 0.02] });
  // sword in right hand
  const sword = new THREE.Group();
  sword.position.set(0, -0.04, 0.0);
  handR.add(sword);
  const blade = new THREE.BoxGeometry(0.035, 0.012, 0.78);
  blade.translate(0, 0, 0.47);
  part(sword, blade, pal, 'metal', { outline: true });
  const tip = new THREE.ConeGeometry(0.018, 0.08, 4);
  tip.rotateX(Math.PI / 2);
  tip.translate(0, 0, 0.9);
  part(sword, tip, pal, 'metal');
  part(sword, new THREE.BoxGeometry(0.16, 0.03, 0.035), pal, 'leatherDark', { pos: [0, 0, 0.07] });
  part(sword, new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6).rotateX(Math.PI / 2), pal, 'leather', { pos: [0, 0, 0] });
  rig.sword = sword;
  rig.kind = 'hero';
  return rig;
}

export function buildNpc(colors, hairColor, extra = {}) {
  const rig = buildHumanoid(
    { ...HERO, ...colors },
    {
      straps: extra.straps,
      hair: (head, pal) => {
        pal.colors.hair = hairColor;
        const cap = new THREE.SphereGeometry(0.138, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
        cap.translate(0, 0.14, -0.01);
        part(head, cap, pal, 'hair');
        if (extra.longHair) {
          const back = new THREE.CylinderGeometry(0.13, 0.1, 0.4, 10, 1, true, Math.PI * 0.5, Math.PI);
          back.translate(0, -0.05, -0.02);
          part(head, back, pal, 'hair', { double: true });
        }
        if (extra.beard) part(head, new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), pal, extra.beard, { pos: [0, 0.07, 0.05] });
      },
    }
  );
  if (extra.apron) part(rig.torso, new THREE.BoxGeometry(0.3, 0.55, 0.02), rig.pal, extra.apron, { pos: [0, 0.12, 0.14] });
  rig.kind = 'npc';
  return rig;
}

// ---------- animation ----------

const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

/**
 * Procedural animation. state: {moving, speed, action, actionT, actionDur, dashKind, dead, deadT, hurtT}
 */
export function animateHumanoid(rig, s, dt, time) {
  const r = rig;
  const run = s.moving ? 1 : 0;
  r.runW = damp(r.runW || 0, run, 10, dt);
  r.phase = (r.phase || 0) + dt * (s.speed || 6) * 1.55;
  const ph = r.phase;
  const w = r.runW;
  // defaults
  let legL = Math.sin(ph) * 0.75 * w;
  let legR = -Math.sin(ph) * 0.75 * w;
  let kneeL = Math.max(0, -Math.cos(ph)) * 0.9 * w + 0.05;
  let kneeR = Math.max(0, Math.cos(ph)) * 0.9 * w + 0.05;
  let armLx = -Math.sin(ph) * 0.6 * w;
  let armRx = Math.sin(ph) * 0.6 * w;
  let armLz = 0.12 + 0.05 * (1 - w);
  let armRz = -0.12 - 0.05 * (1 - w);
  let elbowL = -0.25 - 0.35 * w;
  let elbowR = -0.25 - 0.35 * w;
  let armRy = 0;
  let torsoX = 0.12 * w;
  let torsoY = 0;
  let bodyY = Math.abs(Math.sin(ph)) * 0.06 * w + Math.sin(time * 2.2) * 0.006 * (1 - w);
  let bodyRotX = 0;
  let headX = -0.05 * w;
  const sword = r.sword;
  let swordRot = -0.4;

  const a = s.action;
  const t = s.actionDur > 0 ? Math.min(1, s.actionT / s.actionDur) : 1;
  if (a === 'slash') {
    // wind back, then sweep across the body (right to left), then settle
    const k = t < 0.45 ? t / 0.45 : 1;
    const sweep = t < 0.45 ? 0 : Math.min(1, (t - 0.45) / 0.3);
    armRx = -1.2 * k + 1.1 * sweep - 0.3;
    armRz = -0.9 * k + 0.4 * sweep;
    armRy = 0.9 * k - 2.2 * sweep;
    elbowR = -0.6 * k + 0.4 * sweep;
    torsoY = -0.55 * k + 1.05 * sweep;
    swordRot = -0.2 + 0.5 * sweep;
    legL = 0.35;
    legR = -0.25;
    kneeL = 0.3;
    kneeR = 0.2;
  } else if (a === 'cast') {
    const k = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5);
    armLx = -1.45 * k;
    armLz = 0.05;
    elbowL = -0.1;
    armRx = -0.2;
    torsoY = 0.3 * k;
  } else if (a === 'ward') {
    const k = Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.5);
    armLx = -1.0 * k;
    armRx = -1.0 * k;
    armLz = 0.5 * k;
    armRz = -0.5 * k;
    elbowL = elbowR = -1.2 * k;
  } else if (a === 'dash') {
    torsoX = 0.55;
    armLx = 0.9;
    armRx = 0.9;
    legL = 0.7;
    legR = -0.6;
    kneeL = 0.8;
  } else if (a === 'roll') {
    bodyRotX = t * Math.PI * 2;
    torsoX = 0.9;
    legL = legR = 1.2;
    kneeL = kneeR = 1.9;
    armLx = armRx = -0.6;
    bodyY = -0.42 * Math.sin(Math.min(1, t * 1.2) * Math.PI);
  } else if (a === 'blink') {
    torsoX = 0.3;
  }
  if (s.hurtT > 0) {
    torsoX -= 0.35 * (s.hurtT / 0.25);
    headX -= 0.2 * (s.hurtT / 0.25);
  }

  r.legL.rotation.x = damp(r.legL.rotation.x, legL, 18, dt);
  r.legR.rotation.x = damp(r.legR.rotation.x, legR, 18, dt);
  r.kneeL.rotation.x = damp(r.kneeL.rotation.x, kneeL, 18, dt);
  r.kneeR.rotation.x = damp(r.kneeR.rotation.x, kneeR, 18, dt);
  const armK = a === 'slash' ? 40 : 16;
  r.armL.rotation.x = damp(r.armL.rotation.x, armLx, 16, dt);
  r.armR.rotation.x = damp(r.armR.rotation.x, armRx, armK, dt);
  r.armL.rotation.z = damp(r.armL.rotation.z, armLz, 16, dt);
  r.armR.rotation.z = damp(r.armR.rotation.z, armRz, armK, dt);
  r.armR.rotation.y = damp(r.armR.rotation.y, armRy, armK, dt);
  r.elbowL.rotation.x = damp(r.elbowL.rotation.x, elbowL, 16, dt);
  r.elbowR.rotation.x = damp(r.elbowR.rotation.x, elbowR, armK, dt);
  r.torso.rotation.x = damp(r.torso.rotation.x, torsoX, 12, dt);
  r.torso.rotation.y = damp(r.torso.rotation.y, torsoY, a === 'slash' ? 30 : 12, dt);
  r.head.rotation.x = damp(r.head.rotation.x, headX, 10, dt);
  r.body.position.y = bodyY;
  // roll spins around the hips, tucked low
  r.hips.rotation.x = a === 'roll' ? bodyRotX : damp(r.hips.rotation.x % (Math.PI * 2), 0, 20, dt);
  if (sword) sword.rotation.x = damp(sword.rotation.x, swordRot + Math.PI / 2 - 0.2, 20, dt);

  if (s.dead) {
    const k = Math.min(1, s.deadT / 0.6);
    r.root.rotation.x = -k * Math.PI * 0.48;
    r.root.position.y = 0.1 * k;
  } else {
    r.root.rotation.x = 0;
  }
}

/** Update the scarf ribbon in world space. */
export function updateScarf(rig, dt, speed) {
  if (!rig.scarf) return;
  rig.root.updateMatrixWorld(true);
  const anchor = new THREE.Vector3();
  rig.scarfAnchor.getWorldPosition(anchor);
  const q = new THREE.Quaternion();
  rig.root.getWorldQuaternion(q);
  const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  rig.scarf.update(dt, anchor, back, side, Math.min(2, speed * 0.2));
}
