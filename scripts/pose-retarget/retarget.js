// A reference clip pose (Quaternius Universal Animation Library mannequin, CC0) -> driver channel values
// for the hero rig (src/render/hero.js). Runs in the browser through the dev server (see run.mjs).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const N = (s) => THREE.PropertyBinding.sanitizeNodeName(s);
const cache = new Map();
export async function load(url) {
  if (!cache.has(url)) cache.set(url, await new GLTFLoader().loadAsync(url));
  return cache.get(url);
}

/** Reference joint positions and bone rotations (body space: faces +Z, left = +X) at clip time t. */
export function sample(g, clip, t) {
  const mixer = new THREE.AnimationMixer(g.scene);
  const c = THREE.AnimationClip.findByName(g.animations, clip);
  if (!c) throw new Error('no clip ' + clip);
  mixer.clipAction(c).play();
  mixer.setTime(t);
  g.scene.updateMatrixWorld(true);
  const P = (n) => g.scene.getObjectByName(N(n)).getWorldPosition(new THREE.Vector3());
  const Q = (n) => g.scene.getObjectByName(N(n)).getWorldQuaternion(new THREE.Quaternion());
  const j = {};
  for (const [k, n] of Object.entries({
    hips: 'pelvis', s1: 'spine_01', s2: 'spine_02', s3: 'spine_03', neck: 'neck_01', head: 'Head',
    armL: 'upperarm_l', elbowL: 'lowerarm_l', handL: 'hand_l', knuckleL: 'middle_01_l', indexL: 'index_01_l', pinkyL: 'pinky_01_l',
    armR: 'upperarm_r', elbowR: 'lowerarm_r', handR: 'hand_r', knuckleR: 'middle_01_r', indexR: 'index_01_r', pinkyR: 'pinky_01_r',
    legL: 'thigh_l', kneeL: 'calf_l', footL: 'foot_l', toeL: 'ball_l',
    legR: 'thigh_r', kneeR: 'calf_r', footR: 'foot_r', toeR: 'ball_r',
  })) j[k] = P(n);
  j.headQ = Q('Head');
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
