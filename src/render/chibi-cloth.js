// Cloth that swings: the skirt, robe or coat tails of a modelled chibi outfit (data/models.json
// characters.hero_chibi.cloth, switched on per outfit by its own `cloth`). The fitter
// (scripts/fit-chibi-outfit.py `skirt`) hangs that cloth from the Hips bone with part of its weight,
// so it only followed the hips and legs rigidly. Here the cloth below the waist (`pivot`, bind
// metres) is split into `panels` round the hips, each a bone hinged on the waist ring that takes
// over the Hips share of the cloth beneath it, and every frame each panel's hem is a point on a
// damped spring in world space (stiffness, damping against the hem's own rest motion, air `drag`, and no faster than `speed`
// against the waist): it trails when the hero runs, overshoots when they stop and sweeps round when they turn
// or spin. A panel swings out (`out` radians), barely in (`in`, toward the legs) and to the side
// (`side`). Per panel it is a few vector operations, no allocation. Godot: docs/GODOT-PORT.md.
import * as THREE from 'three';

const TAU = Math.PI * 2;

/**
 * The fitted outfit geometry with its hanging cloth weighted to the panel bones (indices from
 * `skeleton.bones.length` on), and each panel's bind frame and hem drop. Shared by every rig.
 */
export function clothGeometry(fitted, skeleton, bindMatrix, cfg) {
  const g = fitted.clone();
  const hips = skeleton.bones.findIndex((b) => b.name === 'Hips');
  const hipsBind = skeleton.boneInverses[hips].clone().invert();
  const centre = new THREE.Vector3().setFromMatrixPosition(hipsBind);
  const n = cfg.panels, base = skeleton.bones.length, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const u = new THREE.Vector3(), drop = new Float32Array(n), ring = new Float32Array(n), ringN = new Float32Array(n);
  const ids = [0, 0, 0, 0, 0, 0], ws = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    u.fromBufferAttribute(pos, i).applyMatrix4(bindMatrix);
    const s = ((Math.atan2(u.x - centre.x, u.z - centre.z) / TAU) * n + n) % n, a = Math.floor(s) % n, f = s - Math.floor(s), b = (a + 1) % n;
    const d = cfg.pivot - u.y;
    if (Math.abs(d) < 0.02) { const k = f < 0.5 ? a : b; ring[k] += Math.hypot(u.x - centre.x, u.z - centre.z); ringN[k]++; }
    let h = 0, hk = -1;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hips && sw.getComponent(i, k) > h) { h = sw.getComponent(i, k); hk = k; } // (an empty slot may name it too)
    if (d <= 0 || h <= 0) continue;
    const m = h * smooth(d / cfg.ramp);
    if (m < 1e-3) continue;
    let c = 0;
    for (let k = 0; k < 4; k++) { ids[c] = si.getComponent(i, k); ws[c++] = sw.getComponent(i, k) - (k === hk ? m : 0); }
    ids[c] = base + a; ws[c++] = m * (1 - f);
    ids[c] = base + b; ws[c++] = m * f;
    if (m * (1 - f) > 0.05) drop[a] = Math.max(drop[a], d);
    if (m * f > 0.05) drop[b] = Math.max(drop[b], d);
    // the four largest, normalised
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      let best = k;
      for (let j = k + 1; j < c; j++) if (ws[j] > ws[best]) best = j;
      [ids[k], ids[best]] = [ids[best], ids[k]]; [ws[k], ws[best]] = [ws[best], ws[k]];
      if (ws[k] < 0) ws[k] = 0;
      sum += ws[k];
    }
    for (let k = 0; k < 4; k++) { si.setComponent(i, k, ws[k] > 0 ? ids[k] : 0); sw.setComponent(i, k, ws[k] / sum); }
  }
  si.needsUpdate = sw.needsUpdate = true;
  g.userData.shared = true;
  const hipsInv = skeleton.boneInverses[hips];
  const panels = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * TAU, out = new THREE.Vector3(Math.sin(t), 0, Math.cos(t)), side = new THREE.Vector3(Math.cos(t), 0, -Math.sin(t));
    const r = ringN[k] ? ring[k] / ringN[k] : 0;
    const bind = new THREE.Matrix4().makeBasis(side, new THREE.Vector3(0, 1, 0), out).setPosition(centre.x + out.x * r, cfg.pivot, centre.z + out.z * r);
    panels.push({ local: hipsInv.clone().multiply(bind), inverse: bind.clone().invert(), drop: drop[k] });
  }
  return { geometry: g, panels, base };
}

function smooth(x) {
  const t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

const M = new THREE.Matrix4(), P = new THREE.Vector3(), R = new THREE.Vector3(), O = new THREE.Vector3(), V = new THREE.Vector3();
const AX = new THREE.Vector3(), AY = new THREE.Vector3(), AZ = new THREE.Vector3();
const QX = new THREE.Quaternion(), QZ = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

/**
 * The swinging cloth on one rig: the panel bones under its Hips bone, a skeleton of the body's
 * bones and the panels for the outfit to bind, and rig.cloth.update(dt) (HumanoidAnimator.update
 * calls it after the pose).
 */
export class Cloth {
  constructor(body, cloth, cfg) {
    this.cfg = cfg;
    this.hips = body.skeleton.bones.find((b) => b.name === 'Hips');
    this.panels = cloth.panels.map((p, i) => {
      const bone = new THREE.Bone();
      bone.name = 'Cloth' + i;
      p.local.decompose(bone.position, bone.quaternion, bone.scale);
      this.hips.add(bone);
      return { bone, rest: bone.quaternion.clone(), local: p.local, drop: p.drop, x: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), out: 0, side: 0 };
    });
    this.skeleton = new THREE.Skeleton([...body.skeleton.bones, ...this.panels.map((p) => p.bone)], [...body.skeleton.boneInverses, ...cloth.panels.map((p) => p.inverse)]);
    this.fresh = true;
  }

  /** Step the hems by dt (s) and turn the panel bones toward them. */
  update(dt) {
    if (!(dt > 0)) return;
    const c = this.cfg;
    this.hips.updateWorldMatrix(true, false);
    const steps = Math.min(4, Math.ceil(dt * 120)), h = Math.min(dt, 1 / 15) / steps;
    for (const p of this.panels) {
      if (!(p.drop > 0)) continue;
      M.multiplyMatrices(this.hips.matrixWorld, p.local);
      AX.setFromMatrixColumn(M, 0); AY.setFromMatrixColumn(M, 1); AZ.setFromMatrixColumn(M, 2);
      const len = p.drop * AY.length();
      AX.normalize(); AY.normalize(); AZ.normalize();
      R.setFromMatrixPosition(M).addScaledVector(AY, -len); // the hem at rest
      // the first frame, or a jump (a teleport, a respawn): start at rest
      if (this.fresh || R.distanceToSquared(p.r) > 1) { p.x.copy(R); p.v.set(0, 0, 0); p.r.copy(R); }
      // the hem's rest moves from p.r to R over the frame: its velocity, the spring's damping is against it
      V.subVectors(R, p.r).divideScalar(dt);
      for (let k = 0; k < steps; k++) {
        P.copy(p.r).lerp(R, k / steps).sub(p.x).multiplyScalar(c.stiffness); // pull toward rest (where it is at the substep's start)
        P.addScaledVector(p.v, -c.damping - c.drag).addScaledVector(V, c.damping); // damped against the rest's motion, dragged by the air
        p.v.addScaledVector(P, h);
        // cloth through air: the hem moves no faster than `speed` (m/s) against the waist
        P.subVectors(p.v, V); const rel = P.length();
        if (rel > c.speed) p.v.copy(V).addScaledVector(P, c.speed / rel);
        p.x.addScaledVector(p.v, h);
      }
      p.r.copy(R);
      // the hem's offset in the panel's frame, as angles out and to the side, kept inside the limits
      // (at a limit it moves on with the waist, keeping the speed it shares with it)
      O.subVectors(p.x, R);
      let out = Math.atan2(O.dot(AZ), len), side = Math.atan2(O.dot(AX), len);
      const out1 = Math.max(-c.in, Math.min(c.out, out)), side1 = Math.max(-c.side, Math.min(c.side, side));
      if (out1 !== out) { p.x.addScaledVector(AZ, len * (Math.tan(out1) - Math.tan(out))); p.v.addScaledVector(AZ, V.dot(AZ) - p.v.dot(AZ)); }
      if (side1 !== side) { p.x.addScaledVector(AX, len * (Math.tan(side1) - Math.tan(side))); p.v.addScaledVector(AX, V.dot(AX) - p.v.dot(AX)); }
      p.out = out1; p.side = side1;
      p.bone.quaternion.copy(p.rest).multiply(QX.setFromAxisAngle(X, -out1)).multiply(QZ.setFromAxisAngle(Z, side1));
    }
    this.fresh = false;
  }
}
