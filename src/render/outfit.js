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

/** Where a boot of `len` (0..1 ankle to knee, >1 above it) ends, as a fraction from knee to foot. */
const bootTop = (len) => Math.min(0.92, Math.max(0.02, 1 - len));
/** Where a glove of `len` (0..1 of the forearm above the wrist) ends, from elbow to hand. */
const gloveTop = (len) => Math.min(0.95, Math.max(0.05, 1 - len));

const tint = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getStyle();

function pauldron({ add, T, P }, s) {
  const a = T.world['arm' + s], side = s === 'L' ? 1 : -1;
  add('arm' + s, new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.1, 0.8, 1.05).rotateZ(-side * 0.35).translate(a[0] + side * 0.02, a[1] + 0.01, a[2] - 0.01), P.metal);
  add('arm' + s, new THREE.TorusGeometry(0.08, 0.008, 4, 16).rotateX(Math.PI / 2).rotateZ(-side * 0.35).translate(a[0] + side * 0.02, a[1] - 0.005, a[2] - 0.01), P.trim, { plain: true });
}

/** A blade-shaped feather pointing down from `top`, turned to face `a` around the body. */
const feather = (top, a, l, w, tilt) => new THREE.ConeGeometry(w, l, 4).scale(1, 1, 0.22).rotateX(Math.PI).translate(0, -l / 2, 0)
  .rotateX(-tilt).rotateY(a).translate(top.x, top.y, top.z);

/**
 * The parts library. Each takes {add, W, T, P, cut, len}: W the rest world positions of the driver
 * bones, P the palette of the piece it belongs to (armour; or boots / gloves: main, trim, accent,
 * sole), cut the armour's cut, len the boots' or gloves' length. Keys are the names
 * data/outfits.json may list.
 */
export const PARTS = {
  // ---- armour ----
  belt({ add, P }) {
    const beltC = new THREE.Vector3(0, 1.005, -0.012);
    add('hips', hoop(beltC, TORSO.hips.rx + 0.012, TORSO.hips.zf + 0.01, TORSO.hips.zb + 0.01, 0.006, 0.045, 0.01), P.leather);
    add('hips', new THREE.BoxGeometry(0.05, 0.045, 0.014).translate(0, 1.005, 0.11), P.metal, { plain: true });
  },
  furCollar({ add, P }) {
    add('chestWear', new THREE.TorusGeometry(0.105, 0.042, 7, 16).rotateX(Math.PI / 2).scale(1.2, 0.8, 1.0).translate(0, 1.425, -0.012), P.fur);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add('chestWear', new THREE.ConeGeometry(0.03, 0.07, 5).rotateX(Math.PI / 2).rotateY(a).translate(Math.sin(a) * 0.14, 1.41, -0.012 + Math.cos(a) * 0.12), tint(P.fur, 1.06));
    }
  },
  // a cloak of layered, striped feathers over the shoulders and back, a blue feather at the front
  featherMantle({ add, W, P }) {
    const y = (W.neck ? W.neck[1] : 1.45) - 0.02;
    for (let k = 0; k < 3; k++) {
      const n = 14 + k * 3, r = 0.17 + k * 0.03, yy = y - k * 0.08;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k * 0.2, front = Math.cos(a);
        if (front > 0.35) continue; // the front stays open
        const top = new THREE.Vector3(Math.sin(a) * r * 1.2, yy, -0.012 + Math.cos(a) * r);
        const back = front < -0.3, l = 0.15 + k * 0.04 + (back ? 0.16 : 0);
        add('chestWear', feather(top, a, l, 0.05, 0.12 + k * 0.05), (i + k) % 2 ? P.trim : P.accent);
      }
    }
    add('chestWear', feather(new THREE.Vector3(-0.09, y - 0.02, 0.12), 0.3, 0.2, 0.025, -0.15), P.gem, { glow: true });
  },
  chestPlate({ add, P }) {
    add('chestWear', new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(0.98, 1.05, 0.5).translate(0, 1.26, 0.075), P.metal);
    add('chestWear', new THREE.BoxGeometry(0.2, 0.014, 0.02).translate(0, 1.37, 0.13), P.trim);
  },
  shellPlate({ add, P }) {
    add('chestWear', new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(0.95, 0.95, 0.42).translate(0, 1.27, 0.08), tint(P.main, 1.12));
    for (const y of [1.2, 1.26, 1.32]) add('chestWear', new THREE.BoxGeometry(0.22, 0.01, 0.012).translate(0, y, 0.13), P.trim);
  },
  gem({ add, P }) {
    add('chestWear', new THREE.OctahedronGeometry(0.03).translate(0, 1.27, 0.16), P.gem, { glow: true });
  },
  pauldronL: (ctx) => pauldron(ctx, 'L'),
  pauldronR: (ctx) => pauldron(ctx, 'R'),
  tassets({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 1 : -1, leg = W['leg' + s];
      const top = new THREE.Vector3(leg[0] + side * 0.05, W.hips[1] - 0.04, 0.08);
      add('leg' + s, panel(top, 0.17, 0.11, side * 0.35, 0.2, 0.01, 0.014), P.metal);
      add('leg' + s, new THREE.BoxGeometry(0.13, 0.012, 0.016).rotateY(side * 0.35).translate(top.x + side * 0.01, top.y - 0.165, top.z + 0.03), P.trim);
    }
  },
  // ---- boots (P: main, trim, accent, sole) ----
  bootCuffs({ add, W, P, len }) {
    for (const s of ['L', 'R']) add('knee' + s, cuff(W['knee' + s], W['foot' + s], bootTop(len), 0.066, 0.07, 0.012, 0.016), P.trim);
  },
  bootStraps({ add, W, P }) {
    for (const s of ['L', 'R']) for (const f of [0.55, 0.78]) add('knee' + s, cuff(W['knee' + s], W['foot' + s], f, 0.058, 0.02, 0.008), P.accent);
  },
  furCuffs({ add, W, P, len }) {
    for (const s of ['L', 'R']) {
      const c = V(W['knee' + s]).lerp(V(W['foot' + s]), bootTop(len));
      add('knee' + s, new THREE.TorusGeometry(0.066, 0.03, 6, 14).rotateX(Math.PI / 2).translate(c.x, c.y, c.z), P.trim);
    }
  },
  furAnkles({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const c = V(W['knee' + s]).lerp(V(W['foot' + s]), 0.86);
      add('knee' + s, new THREE.TorusGeometry(0.058, 0.022, 6, 14).rotateX(Math.PI / 2).translate(c.x, c.y, c.z), P.trim);
    }
  },
  shinGuards({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const k = V(W['knee' + s]), f = V(W['foot' + s]), c = k.clone().lerp(f, 0.42);
      add('knee' + s, new THREE.BoxGeometry(0.1, 0.24, 0.03).translate(c.x, c.y, c.z + 0.065), tint(P.main, 1.12));
      add('knee' + s, new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(1, 1, 0.55).translate(k.x, k.y, k.z + 0.055), tint(P.main, 1.12));
      add('knee' + s, new THREE.BoxGeometry(0.1, 0.012, 0.034).translate(c.x, c.y + 0.06, c.z + 0.07), P.trim);
    }
  },
  // the fin flaps of the tide boots, standing out at both sides of each shaft
  finFlaps({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const c = V(W['knee' + s]).lerp(V(W['foot' + s]), 0.4);
      for (const side of [1, -1]) {
        add('knee' + s, new THREE.ConeGeometry(0.035, 0.16, 3).scale(1, 1, 0.25).rotateZ(side * 0.35).translate(c.x + side * 0.07, c.y + 0.02, c.z), P.main);
        add('knee' + s, new THREE.ConeGeometry(0.02, 0.1, 3).scale(1, 1, 0.25).rotateZ(side * 0.4).translate(c.x + side * 0.07, c.y - 0.08, c.z), P.trim);
      }
    }
  },
  ankleWings({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const c = V(W['knee' + s]).lerp(V(W['foot' + s]), 0.62), side = s === 'L' ? 1 : -1;
      for (const [dy, l, col] of [[0.03, 0.13, P.accent], [-0.01, 0.1, P.trim], [-0.045, 0.08, P.accent]]) {
        add('knee' + s, new THREE.ConeGeometry(0.022, l, 4).scale(0.35, 1, 1).rotateZ(side * 1.95).rotateY(-side * 0.45).translate(c.x + side * (0.06 + l * 0.35), c.y + dy, c.z - 0.03), col);
      }
    }
  },
  leafTips({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const f = W['foot' + s];
      add('foot' + s, new THREE.ConeGeometry(0.03, 0.11, 4).scale(1, 1, 0.2).rotateX(Math.PI / 2 - 0.5).translate(f[0], f[1] - 0.03, f[2] + 0.1), P.accent);
    }
  },
  // ---- gloves (P: main, trim, accent) ----
  gloveStraps({ add, W, P, len }) {
    for (const s of ['L', 'R']) add('elbow' + s, cuff(W['elbow' + s], W['hand' + s], Math.min(0.95, gloveTop(len) + 0.12), 0.043, 0.018, 0.007), P.trim);
  },
  gloveFur({ add, W, P, len }) {
    for (const s of ['L', 'R']) {
      const c = V(W['elbow' + s]).lerp(V(W['hand' + s]), gloveTop(len));
      add('elbow' + s, new THREE.TorusGeometry(0.05, 0.024, 6, 14).rotateX(Math.PI / 2).translate(c.x, c.y, c.z), P.trim);
    }
  },
  claws({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const e = V(W['elbow' + s]), h = V(W['hand' + s]), d = h.clone().sub(e).normalize(), side = s === 'L' ? 1 : -1;
      for (const z of [-0.02, 0.005, 0.03]) {
        const p = h.clone().addScaledVector(d, 0.1).add(new THREE.Vector3(side * 0.012, 0, z));
        add('hand' + s, new THREE.ConeGeometry(0.008, 0.035, 4).rotateX(Math.PI).translate(p.x, p.y, p.z), '#efe6d2', { plain: true });
      }
    }
  },
  studs({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const e = V(W['elbow' + s]), h = V(W['hand' + s]), d = h.clone().sub(e).normalize(), side = s === 'L' ? 1 : -1;
      for (const [k, z] of [[0.04, -0.012], [0.04, 0.012], [0.06, 0]]) {
        const p = h.clone().addScaledVector(d, k).add(new THREE.Vector3(side * 0.03, 0, z));
        add('hand' + s, new THREE.OctahedronGeometry(0.008).translate(p.x, p.y, p.z), P.accent, { plain: true });
      }
    }
  },
  gloveGem({ add, W, P }) {
    for (const s of ['L', 'R']) {
      const e = V(W['elbow' + s]), h = V(W['hand' + s]), side = s === 'L' ? 1 : -1;
      const p = e.clone().lerp(h, 0.85).add(new THREE.Vector3(side * 0.045, 0, 0));
      add('elbow' + s, new THREE.OctahedronGeometry(0.018).translate(p.x, p.y, p.z), P.accent, { glow: true });
    }
  },
};

/**
 * Add a resolved outfit's parts (armour, boots and gloves pieces) to a RigBuilder whose driver bones sit at T.world.
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
  const wear = (parts, P, len = 0) => { for (const name of parts) PARTS[name]?.({ add, W, T, P, cut: look.cut, len }); };
  wear(look.parts, look.palette);
  if (look.boots) wear(look.boots.parts, look.boots.palette, look.boots.len);
  if (look.gloves) wear(look.gloves.parts, look.gloves.palette, look.gloves.len);
  return look;
}
