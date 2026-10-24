// A reference clip pose (Quaternius Universal Animation Library or KayKit Adventurers, both CC0) -> driver channel values
// for the hero rig (src/render/hero.js). Runs in the browser through the dev server (see run.mjs).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const N = (s) => THREE.PropertyBinding.sanitizeNodeName(s);
const cache = new Map();
export async function load(url) {
  if (!cache.has(url)) cache.set(url, await new GLTFLoader().loadAsync(url));
  return cache.get(url);
}

// Reference rigs: which bone stands for each driver joint. hand = the wrist; knuckle, index and pinky
// give the fist when there are fingers (else the weapon prop gives the blade).
export const PROFILES = {
  // Quaternius Universal Animation Library mannequin (~1.8 m, UE-style names)
  ual: {
    hips: 'pelvis', s1: 'spine_01', s3: 'spine_03', neck: 'neck_01', head: 'Head', rest: 'A_TPose',
    armL: 'upperarm_l', elbowL: 'lowerarm_l', handL: 'hand_l', knuckleL: 'middle_01_l', indexL: 'index_01_l', pinkyL: 'pinky_01_l',
    armR: 'upperarm_r', elbowR: 'lowerarm_r', handR: 'hand_r', knuckleR: 'middle_01_r', indexR: 'index_01_r', pinkyR: 'pinky_01_r',
    legL: 'thigh_l', kneeL: 'calf_l', footL: 'foot_l', toeL: 'ball_l',
    legR: 'thigh_r', kneeR: 'calf_r', footR: 'foot_r', toeR: 'ball_r',
  },
  // KayKit Adventurers (chibi proportions; weapons are props on handslot.l/r)
  kaykit: {
    hips: 'hips', s1: 'spine', s3: 'chest', neck: 'head', head: 'head', rest: 'T-Pose',
    armL: 'upperarm.l', elbowL: 'lowerarm.l', handL: 'wrist.l', knuckleL: 'hand.l',
    armR: 'upperarm.r', elbowR: 'lowerarm.r', handR: 'wrist.r', knuckleR: 'hand.r',
    legL: 'upperleg.l', kneeL: 'lowerleg.l', footL: 'foot.l', toeL: 'toes.l',
    legR: 'upperleg.r', kneeR: 'lowerleg.r', footR: 'foot.r', toeR: 'toes.r',
  },
};

/** A weapon prop's long axis (toward its far end from the grip) and its flat's normal, in world space. */
function propAxes(obj) {
  obj.updateWorldMatrix(true, true);
  const inv = obj.matrixWorld.clone().invert(), box = new THREE.Box3(), b = new THREE.Box3();
  obj.traverse((o) => { if (o.geometry) { o.geometry.computeBoundingBox(); box.union(b.copy(o.geometry.boundingBox).applyMatrix4(inv.clone().multiply(o.matrixWorld))); } });
  const size = box.getSize(new THREE.Vector3()).toArray(), c = box.getCenter(new THREE.Vector3()).toArray();
  const order = [0, 1, 2].sort((x, y) => size[y] - size[x]);
  const axis = (i, sign = 1) => new THREE.Vector3().setComponent(i, sign).transformDirection(obj.matrixWorld);
  return { dir: axis(order[0], Math.sign(c[order[0]]) || 1), up: axis(order[2]) };
}

/** Reference joint positions and bone rotations (body space: faces +Z, left = +X) at clip time t. */
export function sample(g, clip, t, profile = PROFILES.ual, prop = null) {
  const mixer = new THREE.AnimationMixer(g.scene);
  const c = THREE.AnimationClip.findByName(g.animations, clip);
  if (!c) throw new Error('no clip ' + clip);
  mixer.clipAction(c).play();
  mixer.setTime(t);
  g.scene.updateMatrixWorld(true);
  const O = (n) => g.scene.getObjectByName(N(n));
  const j = {};
  for (const [k, n] of Object.entries(profile)) if (k !== 'rest' && O(n)) j[k] = O(n).getWorldPosition(new THREE.Vector3());
  j.headQ = O(profile.head).getWorldQuaternion(new THREE.Quaternion());
  if (prop && O(prop)) j.weapon = propAxes(O(prop));
  mixer.stopAllAction();
  mixer.uncacheRoot(g.scene);
  return j;
}

const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
/** Rotation basis with its Y along -dir... built from a primary direction and a pole (perpendicular hint). */
function basis(dir, pole) {
  Y.copy(dir).normalize();
  Z.copy(pole).addScaledVector(Y, -pole.dot(Y));
  if (Z.lengthSq() < 1e-8) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
  Z.normalize();
  X.crossVectors(Y, Z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
/** World rotation taking (restDir, restPole) onto (dir, pole). */
function aim(restDir, restPole, dir, pole) {
  return basis(dir, pole).multiply(basis(restDir, restPole).invert());
}
const sub = (a, b) => new THREE.Vector3().subVectors(a, b);
const perp = (v, axis) => v.clone().addScaledVector(axis.clone().normalize(), -v.dot(axis.clone().normalize()));

/**
 * Driver channels (Euler XYZ, local, rest = identity) that put the hero's segments along the
 * reference's. The driver skeleton hangs its limbs along -Y, spine along +Y, faces +Z, left = +X;
 * elbows bend toward +Z (local), knees toward -Z.
 */
export function retarget(j, { restHeadQ } = {}) {
  const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), FWD = new THREE.Vector3(0, 0, 1), BACK = new THREE.Vector3(0, 0, -1), LEFT = new THREE.Vector3(1, 0, 0);
  const world = {}, local = {};
  const set = (name, parent, W, opts = {}) => {
    const P = parent ? world[parent] : new THREE.Quaternion();
    const L = P.clone().invert().multiply(W);
    const e = new THREE.Euler().setFromQuaternion(L, 'XYZ');
    if (opts.noX) e.x = 0;
    local[name] = [e.x, e.y, e.z];
    world[name] = P.clone().multiply(new THREE.Quaternion().setFromEuler(e));
  };
  const hipsLat = sub(j.legL, j.legR), chestLat = sub(j.armL, j.armR), midLat = hipsLat.clone().add(chestLat);
  // the animator overwrites hips x (its roll spin), so the pelvis keeps only yaw and roll
  set('hips', null, aim(UP, LEFT, sub(j.s1, j.hips), hipsLat), { noX: true });
  set('torso', 'hips', aim(UP, LEFT, sub(j.s3, j.s1), midLat));
  set('chest', 'torso', aim(UP, LEFT, sub(j.neck, j.s3), chestLat));
  if (restHeadQ) set('head', 'chest', j.headQ.clone().multiply(restHeadQ.clone().invert()));
  for (const s of ['L', 'R']) {
    const up = sub(j['elbow' + s], j['arm' + s]), lo = sub(j['hand' + s], j['elbow' + s]);
    set('arm' + s, 'chest', aim(DOWN, FWD, up, perp(lo, up).lengthSq() > 1e-6 ? perp(lo, up) : FWD));
    const armW = world['arm' + s];
    // the elbow hinges on the upper arm's x axis: keep that axis, point the forearm
    set('elbow' + s, 'arm' + s, aim(DOWN, FWD, lo, new THREE.Vector3().crossVectors(lo, LEFT.clone().applyQuaternion(armW))));
    const th = sub(j['knee' + s], j['leg' + s]), sh = sub(j['foot' + s], j['knee' + s]);
    set('leg' + s, 'hips', aim(DOWN, BACK, th, perp(sh, th).lengthSq() > 1e-6 ? perp(sh, th) : BACK));
    const legW = world['leg' + s];
    set('knee' + s, 'leg' + s, aim(DOWN, BACK, sh, new THREE.Vector3().crossVectors(LEFT.clone().applyQuaternion(legW), sh)));
    // the foot: toes along the reference's, sole kept level side to side
    set('foot' + s, 'knee' + s, aim(FWD, UP, sub(j['toe' + s], j['foot' + s]), UP));
  }
  return { local, world };
}

/** Forward kinematics on the hero's driver joint offsets (bone local positions) for a set of local channels. */
export function fk(offsets, parents, local) {
  const W = {}, P = {};
  for (const n of Object.keys(offsets)) {
    const p = parents[n];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(local[n] || [0, 0, 0]), 'XYZ'));
    if (!p) { W[n] = q; P[n] = new THREE.Vector3(...offsets[n]); continue; }
    W[n] = W[p].clone().multiply(q);
    P[n] = new THREE.Vector3(...offsets[n]).applyQuaternion(W[p]).add(P[p]);
  }
  return { W, P };
}
