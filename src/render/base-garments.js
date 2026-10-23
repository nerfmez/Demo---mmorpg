// Base garments by category (docs/OUTFIT-BASE.md), built from the body itself the way VRoid-style
// garments start: a "shell" is a body region (torso and arms, hands, lower legs) pushed out along
// the normals, so it keeps the body's skin weights and moves exactly with it; a skirt is a flared
// ring hung from the waist whose weights blend from the hips into each thigh (anime skirt
// weighting), so tunic hems, coat skirts, robes and armour skirts follow the legs. Built once per
// body and size, shared by every rig.
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

// A body other than the HairSample one (the chibi) names its own mesh, skirt bones and size:
// T.garment = {body, bones: {hips, legL, legR}, size} (size: metres of this body per metre of
// the HairSample body, for the skirt's fixed margins).
const VRM_SKIRT = { hips: 'J_Bip_C_Hips', legL: 'J_Bip_L_UpperLeg', legR: 'J_Bip_R_UpperLeg' };

function bodySkin(T) {
  if (T.garment?.body) return T.garment.body;
  let body = null;
  T.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'BodySkin') body = o; });
  if (!body) throw new Error('base garments: BodySkin missing');
  return body;
}

/**
 * The body's triangles whose three corners pass `keep(x, y, z)` (bind space), pushed out `off`
 * along the normals, keeping the skin weights and any morph targets (the chibi's fists), so the
 * shell moves and closes exactly with the body.
 */
export function regionShell(T, key, keep, off) {
  return cached(T, key, () => {
    const src = bodySkin(T).geometry, P = src.attributes.position, N = src.attributes.normal;
    const SI = src.attributes.skinIndex, SW = src.attributes.skinWeight, ix = src.index.array;
    const morphs = src.morphAttributes.position || [], morphN = src.morphAttributes.normal || [];
    const map = new Map(), pos = [], nor = [], si = [], sw = [], tri = [], mp = morphs.map(() => []), mn = morphN.map(() => []);
    const inside = (i) => keep(P.getX(i), P.getY(i), P.getZ(i));
    const at = (i) => {
      if (map.has(i)) return map.get(i);
      const n = new THREE.Vector3(N.getX(i), N.getY(i), N.getZ(i)).normalize();
      pos.push(P.getX(i) + n.x * off, P.getY(i) + n.y * off, P.getZ(i) + n.z * off);
      nor.push(n.x, n.y, n.z);
      for (let k = 0; k < 4; k++) { si.push(SI.getComponent(i, k)); sw.push(SW.getComponent(i, k)); }
      morphs.forEach((m, k) => mp[k].push(m.getX(i), m.getY(i), m.getZ(i)));
      morphN.forEach((m, k) => mn[k].push(m.getX(i), m.getY(i), m.getZ(i)));
      map.set(i, pos.length / 3 - 1);
      return map.get(i);
    };
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      if (inside(a) && inside(b) && inside(c)) tri.push(at(a), at(b), at(c));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (morphs.length) {
      g.morphAttributes.position = mp.map((a, k) => Object.assign(new THREE.Float32BufferAttribute(a, 3), { name: morphs[k].name }));
      if (morphN.length) g.morphAttributes.normal = mn.map((a, k) => Object.assign(new THREE.Float32BufferAttribute(a, 3), { name: morphN[k].name }));
      g.morphTargetsRelative = src.morphTargetsRelative;
    }
    g.setIndex(tri);
    return g;
  });
}

/**
 * A body region pushed out `off` metres along the normals, keeping the body's skin weights.
 * Regions (bind space, metres):
 *  - top: torso and arms to the wrist (hands excluded)
 *  - gloves: the hands and the forearm down to `len` (0..1 of the elbow-to-wrist span above the wrist)
 *  - boots: the leg from just above the ankle up to `len` (0..1 of the ankle-to-knee span, >1 above the knee)
 * @param {object} F garmentFrame() landmarks
 */
export function bodyShell(T, F, region, off, len = 0) {
  const elbow = F.elbow ?? F.shoulder + (F.wrist - F.shoulder) * 0.47;
  const keep = {
    top: (x, y) => (x > F.shoulder + 0.03 ? x < F.wrist - 0.015 && y > F.chest - 0.2 : y > F.hips - 0.17 && y < F.neck + 0.015),
    gloves: (x, y) => x > F.wrist - len * (F.wrist - elbow) - 0.02 && y > F.chest - 0.25,
    boots: (x, y) => x < 0.3 && y > F.ankle + 0.035 && y < F.ankle + len * (F.knee - F.ankle),
  }[region];
  return regionShell(T, `${region}:${off}:${len}`, (x, y) => keep(Math.abs(x), y), off);
}

/**
 * A skirt hung from the waist: `len` metres long, flaring `flare` metres at the hem, open
 * `opening` radians either side of the front (0 = closed). Skinned to the hips and thighs.
 */
export function skirt(T, F, { length: len, flare, opening = 0 }) {
  return cached(T, `skirt:${len}:${flare}:${opening}`, () => {
    const body = bodySkin(T), src = body.geometry, P = src.attributes.position, ix = src.index.array;
    const bones = body.skeleton.bones.map((b) => b.name), B = T.garment?.bones || VRM_SKIRT, u = T.garment?.size || 1;
    const hips = bones.indexOf(B.hips), legL = bones.indexOf(B.legL), legR = bones.indexOf(B.legR);
    if (hips < 0 || legL < 0 || legR < 0) throw new Error('base garments: hips or leg bones missing');
    // the waist cross-section, measured from the body: the widest radius in each direction
    const top = F.hips - 0.02 * u, BINS = 36, r0 = new Array(BINS).fill(0.1 * u);
    let zc = 0, n = 0;
    const used = new Set(ix);
    for (const i of used) if (Math.abs(P.getY(i) - top) < 0.035 * u && Math.abs(P.getX(i)) < 0.3 * u) { zc += P.getZ(i); n++; }
    zc = n ? zc / n : 0;
    for (const i of used) {
      if (Math.abs(P.getY(i) - top) > 0.035 * u || Math.abs(P.getX(i)) > 0.3 * u) continue;
      const x = P.getX(i), z = (P.getZ(i) - zc) * F.front, a = Math.atan2(x, z);
      const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * BINS) % BINS;
      r0[b] = Math.max(r0[b], Math.hypot(x, z));
    }
    const RINGS = 12, SEG = 48, pos = [], si = [], sw = [], idx = [];
    const inGap = (a) => opening > 0 && Math.abs(a) < opening;
    // A body that names `fitDown` (the chibi, whose hips are much wider than its waist) is fitted
    // ring by ring: each ring clears the body at its own height (and every ring above it), the top
    // ring sits just outside the top garment (`margin`), so the shirt runs on into the skirt as one
    // piece instead of a separate ring standing off the waist.
    const fit = T.garment?.fitDown ? [] : null, margin = T.garment?.margin ?? 0.016 * u;
    if (fit) {
      const run = r0.slice(); // never inside the waist (a bin the thin bands miss would collapse)
      for (let r = 0; r <= RINGS; r++) {
        // each ring also clears the body a little above it (the top garment's hem bulges over it)
        const y = top - len * (r / RINGS), band = len / RINGS;
        for (const i of used) {
          if (P.getY(i) < y - band || P.getY(i) > y + Math.max(band, 0.05 * u) || Math.abs(P.getX(i)) > 0.3 * u) continue;
          const x = P.getX(i), z = (P.getZ(i) - zc) * F.front, a = Math.atan2(x, z);
          const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * BINS) % BINS;
          run[b] = Math.max(run[b], Math.hypot(x, z));
        }
        // smooth round the ring so a bin the body misses does not dent it
        fit.push(run.map((v, b) => Math.max(v, (run[(b + 1) % BINS] + run[(b + BINS - 1) % BINS]) / 2)));
      }
    }
    for (let r = 0; r <= RINGS; r++) {
      const t = r / RINGS, y = top - len * t;
      for (let s = 0; s <= SEG; s++) {
        const a = -Math.PI + (s / SEG) * Math.PI * 2;
        const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * BINS) % BINS;
        const rad = (fit ? fit[r][b] + margin : r0[b] + 0.016 * u) + flare * Math.pow(t, 1.2);
        const x = Math.sin(a) * rad, z = zc + Math.cos(a) * rad * F.front;
        pos.push(x, y, z);
        // hips at the waist, then more and more the thigh on its side (centre seams split)
        const wl = Math.min(0.85, t * 1.3), xn = Math.max(-1, Math.min(1, x / Math.max(0.05 * u, rad)));
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
