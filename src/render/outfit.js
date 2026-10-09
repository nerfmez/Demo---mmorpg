// The outfit base's raised parts (docs/OUTFIT-BASE.md, data/outfits.json). The base garments
// are cut and painted by garments.js (or the skinned body's zones); these parts give each look
// its own silhouette: straps, belts, collars, coat tails, capes, plates and boot pieces. A
// resolved outfit (core/outfit-look.js) lists which parts it wears and their palette. Parts are authored in rest world space (metres,
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

/** A slim panel hanging from `top` (world) down `len` metres, flared and bulged outward. */
function panel(top, len, w, out, flare = 0.3, bulge = 0.02, thick = 0.009) {
  const g = new THREE.BoxGeometry(w, len, thick, 2, 6, 1).translate(0, -len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = -p.getY(i) / len; // 0 top .. 1 bottom
    p.setX(i, p.getX(i) * (1 + flare * t));
    p.setZ(i, p.getZ(i) + bulge * Math.sin(t * Math.PI * 0.8) + t * 0.03);
  }
  g.computeVertexNormals();
  return g.rotateY(out).translate(top.x, top.y, top.z);
}

/** Where a fraction of the hips-to-ankle span falls on the knee-to-foot segment (0..1). */
const shinAt = (W, s, f) => {
  const y = W.hips[1] - f * (W.hips[1] - W['foot' + s][1]);
  return Math.min(0.95, Math.max(0.02, (W['knee' + s][1] - y) / (W['knee' + s][1] - W['foot' + s][1])));
};

const tint = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getStyle();

function pauldron({ add, T, P }, s) {
  const a = T.world['arm' + s], side = s === 'L' ? 1 : -1;
  add('arm' + s, new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.1, 0.8, 1.05).rotateZ(-side * 0.35).translate(a[0] + side * 0.02, a[1] + 0.01, a[2] - 0.01), P.metal);
  add('arm' + s, new THREE.TorusGeometry(0.08, 0.008, 4, 16).rotateX(Math.PI / 2).rotateZ(-side * 0.35).translate(a[0] + side * 0.02, a[1] - 0.005, a[2] - 0.01), P.trim, { plain: true });
}

/**
 * The parts library. Each takes {add, W, T, P, cut}: W the rest world positions of the driver
 * bones, P the palette, cut the outfit's cut. Keys are the names data/outfits.json may list.
 */
export const PARTS = {
  // bandolier: over the left shoulder, across the chest to the right hip, and round the back
  bandolier({ add, P }) {
    const S = new THREE.Vector3(0.1, 1.455, -0.012), H = new THREE.Vector3(-0.15, 0.99, -0.01);
    const c = S.clone().add(H).multiplyScalar(0.5), u = S.clone().sub(H).multiplyScalar(0.5);
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      const depth = Math.sin(t) > 0 ? 0.1 : 0.126;
      pts.push(c.clone().addScaledVector(u, Math.cos(t)).add(new THREE.Vector3(0, 0, Math.sin(t) * depth)));
    }
    add('torso', band(pts, 0.036, 0.008, (p) => new THREE.Vector3(p.x - c.x, 0, p.z - c.z).add(new THREE.Vector3(0, 0.001, 0))), P.strap);
    add('torso', new THREE.BoxGeometry(0.032, 0.036, 0.012).rotateZ(-0.62).translate(-0.02, 1.25, 0.1), P.metal, { plain: true });
  },
  belt({ add, P }) {
    const beltC = new THREE.Vector3(0, 1.005, -0.012);
    add('hips', hoop(beltC, TORSO.hips.rx, TORSO.hips.zf, TORSO.hips.zb, 0.006, 0.05, 0.01), P.leather);
    add('hips', new THREE.BoxGeometry(0.05, 0.045, 0.014).translate(0, 1.005, 0.094), P.metal, { plain: true });
  },
  hipPouch({ add, P }) {
    add('hips', new THREE.BoxGeometry(0.08, 0.1, 0.05).translate(-0.12, 0.95, 0.05), P.leather);
    add('hips', new THREE.BoxGeometry(0.084, 0.03, 0.054).translate(-0.12, 0.99, 0.05), P.strap);
  },
  thighStrap({ add, T, P }) {
    const a = T.world.legR, b = T.world.kneeR;
    add('legR', cuff(a, b, 0.42, 0.072, 0.03, 0.008), P.strap);
    const p = V(a).lerp(V(b), 0.42).add(new THREE.Vector3(-0.07, 0, 0.0));
    add('legR', new THREE.BoxGeometry(0.03, 0.1, 0.07).translate(p.x, p.y, p.z), P.leather);
  },
  bracers({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const e = W['elbow' + s], h = W['hand' + s];
      add('elbow' + s, cuff(e, h, 0.52, 0.042, 0.022, 0.008), P.strap);
      add('elbow' + s, cuff(e, h, 0.86, 0.036, 0.022, 0.008), P.strap);
    }
  },
  // folded boot tops where the painted boot shaft starts
  bootCuffs({ add, W, P, cut }) {
    for (const s of ['L', 'R']) add('knee' + s, cuff(W['knee' + s], W['foot' + s], shinAt(W, s, cut.boot), 0.058, 0.06, 0.012, 0.012), tint(P.shoes, 1.12));
  },
  bootStraps({ add, W, P }) {
    for (const s of ['L', 'R']) add('knee' + s, cuff(W['knee' + s], W['foot' + s], 0.7, 0.05, 0.02, 0.006), P.strap);
  },
  furCuffs({ add, W, P, cut }) {
    for (const s of ['L', 'R']) {
      const f = shinAt(W, s, cut.boot), c = V(W['knee' + s]).lerp(V(W['foot' + s]), f);
      add('knee' + s, new THREE.TorusGeometry(0.06, 0.026, 6, 14).rotateX(Math.PI / 2).translate(c.x, c.y, c.z), P.fur);
    }
  },
  toeClaws({ add, W, P }) {
    for (const s of ['L', 'R']) for (const x of [-0.03, 0.03]) {
      const f = W['foot' + s];
      add('foot' + s, new THREE.ConeGeometry(0.012, 0.05, 4).rotateX(Math.PI / 2).translate(f[0] + x, f[1] - 0.06, f[2] + 0.15), P.fur, { plain: true });
    }
  },
  ankleRibbons({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const k = W['knee' + s], f = W['foot' + s], c = V(k).lerp(V(f), 0.9);
      add('knee' + s, cuff(k, f, 0.9, 0.044, 0.016, 0.006), P.sole);
      const side = s === 'L' ? 1 : -1;
      add('knee' + s, new THREE.BoxGeometry(0.012, 0.09, 0.004).rotateZ(side * 0.3).translate(c.x + side * 0.05, c.y - 0.04, c.z - 0.01), P.sole);
    }
  },
  ankleWings({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const c = V(W['knee' + s]).lerp(V(W['foot' + s]), 0.85), side = s === 'L' ? 1 : -1;
      for (const [dy, l] of [[0.02, 0.09], [-0.015, 0.065]]) {
        add('knee' + s, new THREE.ConeGeometry(0.02, l, 4).scale(0.35, 1, 1).rotateZ(side * 1.9).rotateY(-side * 0.5).translate(c.x + side * (0.05 + l * 0.35), c.y + dy, c.z - 0.03), P.sole);
      }
    }
  },
  shinGuards({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const k = V(W['knee' + s]), f = V(W['foot' + s]), c = k.clone().lerp(f, 0.42);
      add('knee' + s, new THREE.BoxGeometry(0.09, 0.22, 0.026).translate(c.x, c.y, c.z + 0.055), tint(P.shoes, 1.25));
      add('knee' + s, new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(1, 1, 0.5).translate(k.x, k.y, k.z + 0.05), tint(P.shoes, 1.25));
      add('knee' + s, new THREE.OctahedronGeometry(0.018).translate(c.x, c.y + 0.07, c.z + 0.07), P.trim, { plain: true });
    }
  },
  furCollar({ add, P }) {
    add('chestWear', new THREE.TorusGeometry(0.105, 0.038, 7, 16).rotateX(Math.PI / 2).scale(1.15, 0.8, 0.95).translate(0, 1.425, -0.012), P.fur);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add('chestWear', new THREE.ConeGeometry(0.03, 0.07, 5).rotateX(Math.PI / 2).rotateY(a).translate(Math.sin(a) * 0.13, 1.41, -0.012 + Math.cos(a) * 0.11), tint(P.fur, 1.08));
    }
  },
  // a stand-up collar, open at the front, piped along its top
  highCollar({ add, W, P }) {
    const y = W.neck ? W.neck[1] : 1.45;
    add('chestWear', new THREE.CylinderGeometry(0.085, 0.095, 0.075, 16, 1, true, 0.5, Math.PI * 2 - 1.0).translate(0, y - 0.005, -0.01), P.main);
    add('chestWear', new THREE.TorusGeometry(0.086, 0.007, 4, 16, Math.PI * 2 - 1.0).rotateX(Math.PI / 2).rotateY(-Math.PI / 2 + 0.5).translate(0, y + 0.032, -0.01), P.trim);
  },
  // a short shoulder cape with a piped edge and a clasp
  capelet({ add, W, P }) {
    const y = (W.neck ? W.neck[1] : 1.45) + 0.005;
    add('chestWear', new THREE.SphereGeometry(0.2, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1.32, 0.9, 1.08).translate(0, y - 0.18, -0.012), P.main);
    add('chestWear', new THREE.TorusGeometry(0.2, 0.01, 4, 28).rotateX(Math.PI / 2).scale(1.32 * 0.975, 1, 1.08 * 0.975).translate(0, y - 0.18 + 0.2 * 0.9 * Math.cos(Math.PI * 0.42) - 0.004, -0.012), P.trim);
    add('chestWear', new THREE.OctahedronGeometry(0.022).translate(0, y - 0.03, 0.105), P.gem, { glow: true });
  },
  // one-sided cape over the left shoulder, falling down the back
  halfCape({ add, W, P }) {
    const y = (W.neck ? W.neck[1] : 1.45) + 0.005;
    add('chestWear', new THREE.SphereGeometry(0.2, 12, 8, Math.PI * 0.1, Math.PI * 0.85, 0, Math.PI * 0.46).scale(1.35, 0.95, 1.1).translate(0, y - 0.18, -0.012), P.accent);
    add('chestWear', panel(new THREE.Vector3(0.08, y - 0.12, -0.14), 0.42, 0.2, Math.PI, 0.25, -0.02), P.accent);
    add('chestWear', new THREE.BoxGeometry(0.22, 0.014, 0.012).translate(0.08, y - 0.55, -0.175), P.trim);
  },
  // the long front cloth of a mantle, hanging from the belt
  tabard({ add, W, P }) {
    const top = new THREE.Vector3(0, W.hips[1] - 0.005, 0.105);
    add('hips', panel(top, 0.4, 0.15, 0, 0.18, 0.015), P.accent);
    add('hips', new THREE.BoxGeometry(0.18, 0.016, 0.012).translate(0, W.hips[1] - 0.395, 0.135), P.trim);
    add('hips', new THREE.OctahedronGeometry(0.02).translate(0, W.hips[1] - 0.08, 0.12), P.trim, { plain: true });
  },
  sash({ add, W, P }) {
    const c = new THREE.Vector3(0, W.hips[1] + 0.06, -0.012);
    add('hips', hoop(c, TORSO.waist.rx + 0.01, TORSO.waist.zf, TORSO.waist.zb, 0.008, 0.06, 0.012), P.accent);
    add('hips', panel(new THREE.Vector3(0.11, W.hips[1] + 0.04, 0.06), 0.26, 0.05, 0.6, 0.4, 0.01), P.accent);
  },
  // coat tails: four flared panels on the thighs (they swing with the legs), split front and back
  coatTails({ add, W, P, cut }) {
    const len = cut.tails || 0.3;
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 1 : -1, leg = W['leg' + s];
      for (const [z, out, w] of [[0.1, 0, 0.14], [-0.13, Math.PI, 0.17]]) {
        const top = new THREE.Vector3(leg[0] + side * 0.035, W.hips[1] - 0.06, z);
        add('leg' + s, panel(top, len, w, out + side * 0.12, 0.35, 0.02), P.main);
        add('leg' + s, new THREE.BoxGeometry(w * 1.3, 0.016, 0.012).rotateY(out + side * 0.12).translate(top.x, top.y - len + 0.005, top.z + (z > 0 ? 1 : -1) * 0.035), P.trim);
      }
    }
  },
  chestPlate({ add, P }) {
    add('chestWear', new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(0.95, 1.05, 0.5).translate(0, 1.26, 0.07), P.metal);
    add('chestWear', new THREE.BoxGeometry(0.2, 0.014, 0.02).translate(0, 1.37, 0.13), P.trim);
  },
  shellPlate({ add, P }) {
    add('chestWear', new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(0.95, 0.95, 0.4).translate(0, 1.27, 0.075), tint(P.main, 1.15));
    for (const y of [1.22, 1.3]) add('chestWear', new THREE.BoxGeometry(0.2, 0.01, 0.012).translate(0, y, 0.125), P.trim);
  },
  gem({ add, P }) {
    add('chestWear', new THREE.OctahedronGeometry(0.028).translate(0, 1.28, 0.155), P.gem, { glow: true });
  },
  // shoulder plates with a piped rim
  pauldronL: (ctx) => pauldron(ctx, 'L'),
  pauldronR: (ctx) => pauldron(ctx, 'R'),
  tassets({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 1 : -1, leg = W['leg' + s];
      const top = new THREE.Vector3(leg[0] + side * 0.05, W.hips[1] - 0.04, 0.07);
      add('leg' + s, panel(top, 0.17, 0.11, side * 0.35, 0.2, 0.01, 0.014), P.metal);
      add('leg' + s, new THREE.BoxGeometry(0.13, 0.012, 0.016).rotateY(side * 0.35).translate(top.x + side * 0.01, top.y - 0.165, top.z + 0.03), P.trim);
    }
  },
};

/**
 * Add a resolved outfit's parts to a RigBuilder whose driver bones sit at T.world.
 * @param {object} look resolveOutfit() output
 */
export function buildOutfit(rb, T, look) {
  const W = { ...T.world, chestWear: T.world.chest };
  // chest pieces hang on their own bone so the neck fit (scarf) does not move them
  rb.bone('chestWear', 'chest', [0, 0, 0]);
  const add = (bone, geo, color, o = {}) => {
    geo.translate(-W[bone][0], -W[bone][1], -W[bone][2]);
    rb.add(bone, geo, color, o);
  };
  const ctx = { add, W, T, P: look.palette, cut: look.cut };
  for (const name of look.parts) PARTS[name]?.(ctx);
  return look;
}
