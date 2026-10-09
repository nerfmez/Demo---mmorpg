// Base garments by category (docs/OUTFIT-BASE.md). The cloth base is the HairSample hoodie; the
// coat, robe and armour bases are built here from the body itself, the way VRoid-style garments
// start: a top "shell" is the body's torso and arms pushed out along the normals (it keeps the
// body's skin weights, so it moves exactly with it), and a skirt is a flared ring hung from the
// waist whose weights blend from the hips into each thigh (anime skirt weighting), so coat skirts,
// robes and armour skirts follow the legs. Built once per body and size, shared by every rig.
import * as THREE from 'three';

const cache = new WeakMap();
const cached = (T, key, make) => {
  if (!cache.has(T)) cache.set(T, new Map());
  const m = cache.get(T);
  if (!m.has(key)) {
    const g = make();
    g.userData.shared = true; // owned by the body template, never by a rig
    m.set(key, g);
  }
  return m.get(key);
};

function bodySkin(T) {
  let body = null;
  T.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'BodySkin') body = o; });
  if (!body) throw new Error('base garments: BodySkin missing');
  return body;
}

/**
 * The body's torso and arms (to the wrist, hands excluded) offset `off` metres along the normals.
 * @param {object} F garmentFrame() landmarks (bind space)
 */
export function shellTop(T, F, off) {
  return cached(T, 'shell:' + off, () => {
    const src = bodySkin(T).geometry, P = src.attributes.position, N = src.attributes.normal;
    const SI = src.attributes.skinIndex, SW = src.attributes.skinWeight, ix = src.index.array;
    const keep = (i) => {
      const x = Math.abs(P.getX(i)), y = P.getY(i);
      if (x > F.shoulder + 0.03) return x < F.wrist - 0.015 && y > F.chest - 0.2; // arms, not hands
      return y > F.hips - 0.17 && y < F.neck + 0.015;
    };
    const map = new Map(), pos = [], nor = [], si = [], sw = [], tri = [];
    const at = (i) => {
      if (map.has(i)) return map.get(i);
      const n = new THREE.Vector3(N.getX(i), N.getY(i), N.getZ(i)).normalize();
      pos.push(P.getX(i) + n.x * off, P.getY(i) + n.y * off, P.getZ(i) + n.z * off);
      nor.push(n.x, n.y, n.z);
      for (let k = 0; k < 4; k++) { si.push(SI.getComponent(i, k)); sw.push(SW.getComponent(i, k)); }
      map.set(i, pos.length / 3 - 1);
      return map.get(i);
    };
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      if (keep(a) && keep(b) && keep(c)) tri.push(at(a), at(b), at(c));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(tri);
    return g;
  });
}

/**
 * A skirt hung from the waist: `len` metres long, flaring `flare` metres at the hem, open
 * `opening` radians either side of the front (0 = closed). Skinned to the hips and thighs.
 */
export function skirt(T, F, { length: len, flare, opening = 0 }) {
  return cached(T, `skirt:${len}:${flare}:${opening}`, () => {
    const body = bodySkin(T), src = body.geometry, P = src.attributes.position, ix = src.index.array;
    const bones = body.skeleton.bones.map((b) => b.name);
    const hips = bones.indexOf('J_Bip_C_Hips'), legL = bones.indexOf('J_Bip_L_UpperLeg'), legR = bones.indexOf('J_Bip_R_UpperLeg');
    if (hips < 0 || legL < 0 || legR < 0) throw new Error('base garments: hips or leg bones missing');
    // the waist cross-section, measured from the body: the widest radius in each direction
    const top = F.hips - 0.02, BINS = 36, r0 = new Array(BINS).fill(0.1);
    let zc = 0, n = 0;
    const used = new Set(ix);
    for (const i of used) if (Math.abs(P.getY(i) - top) < 0.035 && Math.abs(P.getX(i)) < 0.3) { zc += P.getZ(i); n++; }
    zc = n ? zc / n : 0;
    for (const i of used) {
      if (Math.abs(P.getY(i) - top) > 0.035 || Math.abs(P.getX(i)) > 0.3) continue;
      const x = P.getX(i), z = (P.getZ(i) - zc) * F.front, a = Math.atan2(x, z);
      const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * BINS) % BINS;
      r0[b] = Math.max(r0[b], Math.hypot(x, z));
    }
    const RINGS = 12, SEG = 48, pos = [], si = [], sw = [], idx = [];
    const inGap = (a) => opening > 0 && Math.abs(a) < opening;
    for (let r = 0; r <= RINGS; r++) {
      const t = r / RINGS, y = top - len * t;
      for (let s = 0; s <= SEG; s++) {
        const a = -Math.PI + (s / SEG) * Math.PI * 2;
        const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * BINS) % BINS;
        const rad = r0[b] + 0.016 + flare * Math.pow(t, 1.2);
        const x = Math.sin(a) * rad, z = zc + Math.cos(a) * rad * F.front;
        pos.push(x, y, z);
        // hips at the waist, then more and more the thigh on its side (centre seams split)
        const wl = Math.min(0.85, t * 1.3), xn = Math.max(-1, Math.min(1, x / Math.max(0.05, rad)));
        const left = F.leftSign * xn > 0 ? 0.5 + 0.5 * Math.abs(xn) : 0.5 - 0.5 * Math.abs(xn);
        si.push(hips, legL, legR, 0);
        sw.push(1 - wl, wl * left, wl * (1 - left), 0);
      }
    }
    for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
      const a0 = -Math.PI + (s / SEG) * Math.PI * 2, a1 = -Math.PI + ((s + 1) / SEG) * Math.PI * 2;
      if (inGap(a0) || inGap(a1)) continue;
      const i = r * (SEG + 1) + s, j = i + SEG + 1;
      idx.push(i, j, i + 1, i + 1, j, j + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}
