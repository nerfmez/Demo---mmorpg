// Clothes and armour pieces for the skinned hero body (skinned.js). The body itself paints
// the tunic, pants, boots and leather zones; these are the raised parts that give the
// silhouette: the bandolier and belt with its pouch, a thigh strap, folded boot cuffs,
// bracer bands, and each armour's own pieces. Parts are authored in rest world space (metres,
// the Meshy body's measurements) and placed on the driver bones, so they move rigidly with
// the bone they sit on and merge into the rig's per-bone meshes (one draw call per bone).
import * as THREE from 'three';

// cross-sections measured on hero_base.glb (half widths / depths around a centre, metres)
const TORSO = { chest: { y: 1.26, rx: 0.135, zf: 0.086, zb: 0.112, zc: -0.012 }, waist: { y: 1.1, rx: 0.112, zf: 0.078, zb: 0.084 }, hips: { y: 1.0, rx: 0.137, zf: 0.084, zb: 0.106 } };

const V = (a) => new THREE.Vector3(...a);

/**
 * A flat band along a closed (or open) path of points, wide along `across(i)` and thin toward
 * `out(i)`. Used for straps and belts.
 */
function band(pts, width, thick, out, closed = true) {
  const pos = [], idx = [];
  const n = pts.length;
  const T = new THREE.Vector3(), O = new THREE.Vector3(), A = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.subVectors(b, a).normalize();
    O.copy(out(pts[i])).normalize();
    A.crossVectors(T, O).normalize();
    for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      const p = pts[i].clone().addScaledVector(A, (u * width) / 2).addScaledVector(O, v * thick);
      pos.push(p.x, p.y, p.z);
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = j * 4 + k, d = j * 4 + ((k + 1) % 4);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A ring around an elliptical cross-section at height y (world), `pad` metres off the skin. */
function hoop(c, rx, zf, zb, pad, width, thick, n = 20) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const z = Math.cos(a) > 0 ? zf : zb;
    pts.push(new THREE.Vector3(c.x + Math.sin(a) * (rx + pad), c.y, c.z + Math.cos(a) * (z + pad)));
  }
  return band(pts, width, thick, (p) => new THREE.Vector3(p.x - c.x, 0, p.z - c.z));
}

/** A ring around a limb segment from a to b, at fraction f, radius r. */
function cuff(a, b, f, r, width, thick, flare = 0) {
  const axis = V(b).sub(V(a));
  const c = V(a).addScaledVector(axis, f);
  const d = axis.clone().normalize();
  const u = new THREE.Vector3(1, 0, 0).projectOnPlane(d).normalize();
  const w = new THREE.Vector3().crossVectors(d, u);
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    pts.push(c.clone().addScaledVector(u, Math.cos(t) * r).addScaledVector(w, Math.sin(t) * r));
  }
  const g = band(pts, width, thick, (p) => p.clone().sub(c));
  if (flare) {
    // widen the upper edge (a folded boot top)
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const q = new THREE.Vector3().fromBufferAttribute(p, i);
      const along = q.clone().sub(c).dot(d);
      if (along < 0) q.add(q.clone().sub(c).projectOnPlane(d).setLength(flare));
      p.setXYZ(i, q.x, q.y, q.z);
    }
    g.computeVertexNormals();
  }
  return g;
}

/**
 * Add the outfit to a RigBuilder whose driver bones sit at T.world.
 * @param {object} gear gearLook() output (armor kind, bases)
 * @returns {{vest?: string}} colour overrides for the body zones
 */
export function buildOutfit(rb, T, gear, colors) {
  const W = { ...T.world, chestWear: T.world.chest };
  // chest armour hangs on its own bone so the neck fit (scarf) does not move it
  rb.bone('chestWear', 'chest', [0, 0, 0]);
  const add = (bone, geo, color, o = {}) => {
    geo.translate(-W[bone][0], -W[bone][1], -W[bone][2]);
    rb.add(bone, geo, color, o);
  };
  const LEATHER = colors.leather, STRAP = '#5b371f', METAL = '#b9bcc4';
  const armor = gear.armor || 'tunic';

  // bandolier: over the left shoulder, across the chest to the right hip, and round the back
  {
    const S = new THREE.Vector3(0.1, 1.455, -0.012), H = new THREE.Vector3(-0.15, 0.99, -0.01);
    const c = S.clone().add(H).multiplyScalar(0.5), u = S.clone().sub(H).multiplyScalar(0.5);
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      const depth = Math.sin(t) > 0 ? 0.1 : 0.126;
      pts.push(c.clone().addScaledVector(u, Math.cos(t)).add(new THREE.Vector3(0, 0, Math.sin(t) * depth)));
    }
    add('torso', band(pts, 0.036, 0.008, (p) => new THREE.Vector3(p.x - c.x, 0, p.z - c.z).add(new THREE.Vector3(0, 0.001, 0))), STRAP);
    // buckle on the chest
    add('torso', new THREE.BoxGeometry(0.032, 0.036, 0.012).rotateZ(-0.62).translate(-0.02, 1.25, 0.1), METAL, { plain: true });
  }
  // belt with a buckle, and a pouch on the right hip
  const beltC = new THREE.Vector3(0, 1.005, -0.012);
  add('hips', hoop(beltC, TORSO.hips.rx, TORSO.hips.zf, TORSO.hips.zb, 0.006, 0.05, 0.01), LEATHER);
  add('hips', new THREE.BoxGeometry(0.05, 0.045, 0.014).translate(0, 1.005, 0.094), METAL, { plain: true });
  add('hips', new THREE.BoxGeometry(0.08, 0.1, 0.05).translate(-0.12, 0.95, 0.05).rotateY(0), LEATHER);
  add('hips', new THREE.BoxGeometry(0.084, 0.03, 0.054).translate(-0.12, 0.99, 0.05), STRAP);
  // right thigh strap and its pouch
  {
    const a = T.world.legR, b = T.world.kneeR;
    add('legR', cuff(a, b, 0.42, 0.072, 0.03, 0.008), STRAP);
    const p = V(a).lerp(V(b), 0.42).add(new THREE.Vector3(-0.07, 0, 0.0));
    add('legR', new THREE.BoxGeometry(0.03, 0.1, 0.07).translate(p.x, p.y, p.z), LEATHER);
  }
  // boots: folded cuffs below the knee, a strap over the foot
  const bootCol = colors.boots;
  const bootCuff = new THREE.Color(bootCol).multiplyScalar(1.12).getStyle();
  for (const s of ['L', 'R']) {
    const k = T.world['knee' + s], f = T.world['foot' + s];
    if (gear.bases?.boots !== 'wisp_slippers') add('knee' + s, cuff(k, f, 0.14, 0.058, 0.07, 0.012, 0.012), bootCuff);
    add('knee' + s, cuff(k, f, 0.7, 0.05, 0.02, 0.006), STRAP);
    if (gear.bases?.boots === 'crag_greaves') add('knee' + s, new THREE.BoxGeometry(0.1, 0.2, 0.03).translate(V(k).lerp(V(f), 0.45).x, V(k).lerp(V(f), 0.45).y, V(k).z + 0.05), '#b9c4b3');
  }
  // bracers: a raised band at each end
  for (const s of ['L', 'R']) {
    const e = T.world['elbow' + s], h = T.world['hand' + s];
    add('elbow' + s, cuff(e, h, 0.52, 0.042, 0.022, 0.008), STRAP);
    add('elbow' + s, cuff(e, h, 0.86, 0.036, 0.022, 0.008), STRAP);
  }

  // armour: the body zone colour plus its own pieces
  const out = {};
  if (armor === 'hide') out.vest = '#8a5a3a';
  else if (armor === 'pelt') {
    out.vest = '#7f776c';
    // fur collar
    add('chestWear', new THREE.TorusGeometry(0.105, 0.038, 7, 16).rotateX(Math.PI / 2).scale(1.15, 0.8, 0.95).translate(0, 1.425, -0.012), '#b8b0a4');
    for (let i = 0; i < 8; i++) {
      // tufts
      const a = (i / 8) * Math.PI * 2;
      add('chestWear', new THREE.ConeGeometry(0.03, 0.07, 5).rotateX(Math.PI / 2).rotateY(a).translate(Math.sin(a) * 0.13, 1.41, -0.012 + Math.cos(a) * 0.11), '#c9c1b4');
    }
  } else if (armor === 'shell') {
    out.vest = '#4f7a34';
    add('chestWear', new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(0.95, 0.95, 0.4).translate(0, 1.27, 0.075), '#5d8a3a');
  } else if (armor === 'plate') {
    out.vest = '#8f96a3';
    add('chestWear', new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(0.95, 1.05, 0.5).translate(0, 1.26, 0.07), '#9aa0ad');
    add('chestWear', new THREE.OctahedronGeometry(0.028).translate(0, 1.28, 0.155), '#8fe0ff', { glow: true });
    for (const s of ['R']) {
      // the left shoulder already wears the hero's guard
      const sx = s === 'L' ? 1 : -1;
      add('arm' + s, new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.1, 0.8, 1.05).rotateZ(-sx * 0.35).translate(T.world['arm' + s][0] + sx * 0.02, T.world['arm' + s][1] + 0.01, T.world['arm' + s][2] - 0.01), '#9aa0ad');
    }
  } else if (armor === 'mantle') {
    out.vest = '#3a5a8a';
  }
  return out;
}
