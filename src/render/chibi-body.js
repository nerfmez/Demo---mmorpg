// A chibi body made with Meshy (data/models.json → characters.hero_chibi) as the hero's skinned
// body. Opt-in with ?hero=chibi; the default hero is unchanged. Its skeleton has the same
// Mixamo-like names as hero_base, so it reuses the driver-bone retarget of skinned.js
// (bindSkinSync with MAP). It keeps its own painted texture (face, suit, boots); materials are
// swapped for the game's 3-step toon ramp, rim light, hit flash and outline hull (vrm-body.js).
// Meshy exports split, faceted normals, which the toon ramp turns into blotches on the round
// head, so the normals are welded and smoothed once at load.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { bindSkinSync, MAP } from './skinned.js';
import { toonCopy, hullCopy } from './vrm-body.js';

export const useChibi = typeof location !== 'undefined' && new URLSearchParams(location.search).get('hero') === 'chibi';

/**
 * Smooth normals across vertices that share a position (UV seams split them), so a low-poly
 * round surface shades round. Normals are rebuilt from the faces, then averaged per position.
 */
export function smoothNormals(geometry) {
  geometry.computeVertexNormals();
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { x: 0, y: 0, z: 0, ids: [] }));
    g.x += n.getX(i); g.y += n.getY(i); g.z += n.getZ(i);
    g.ids.push(i);
  }
  for (const g of groups.values()) {
    const l = Math.hypot(g.x, g.y, g.z) || 1;
    for (const i of g.ids) n.setXYZ(i, g.x / l, g.y / l, g.z / l);
  }
  n.needsUpdate = true;
  geometry.deleteAttribute('tangent'); // stale after the normals change; no normal map uses it
}

/** Smooth the mesh, pose the loaded model once (arms down) and measure its joints. */
export function prepareChibiBody(gltf, cfg) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  let mesh = null;
  const bones = {};
  scene.traverse((o) => {
    if (o.isSkinnedMesh && !mesh) mesh = o;
    if (o.isBone) bones[o.name] = o;
  });
  if (!mesh || !bones.Hips) throw new Error('hero_chibi: no skinned mesh or Hips bone');
  smoothNormals(mesh.geometry);
  mesh.geometry.userData.shared = true;
  if (mesh.material.map) mesh.material.map.userData.shared = true;
  const at = (n) => bones[n].getWorldPosition(new THREE.Vector3());

  // head bounds in the bind (T-pose) shape: every vertex above the head joint
  const headY = at('Head').y;
  const head = new THREE.Box3();
  const v = new THREE.Vector3();
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    if (v.y > headY) head.expandByPoint(v);
  }

  // rest pose: arms hanging like the driver rig's (its rest is arms down, all rotations zero)
  const drop = cfg.armDrop ?? 1.3;
  const Z = new THREE.Vector3(0, 0, 1);
  const turnWorld = (bone, angle) => {
    const p = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const r = new THREE.Quaternion().setFromAxisAngle(Z, angle);
    bone.quaternion.premultiply(p.clone().invert().multiply(r).multiply(p));
    bone.updateMatrixWorld(true);
  };
  turnWorld(bones.LeftArm, -drop);
  turnWorld(bones.RightArm, drop);
  scene.updateMatrixWorld(true);

  const J = {};
  for (const n of Object.keys(MAP)) J[n] = at(n);
  const world = {};
  for (const [skin, drv] of Object.entries(MAP)) world[drv] = J[skin].toArray();
  const d = (a, b) => J[a].clone().sub(J[b]).toArray();
  const joints = {
    hips: J.Hips.toArray(), torso: d('Spine02', 'Hips'), chest: d('Spine', 'Spine02'), head: d('Head', 'Spine'),
    legL: d('LeftUpLeg', 'Hips'), kneeL: d('LeftLeg', 'LeftUpLeg'), footL: d('LeftFoot', 'LeftLeg'),
    legR: d('RightUpLeg', 'Hips'), kneeR: d('RightLeg', 'RightUpLeg'), footR: d('RightFoot', 'RightLeg'),
    armL: d('LeftArm', 'Spine'), elbowL: d('LeftForeArm', 'LeftArm'), handL: d('LeftHand', 'LeftForeArm'),
    armR: d('RightArm', 'Spine'), elbowR: d('RightForeArm', 'RightArm'), handR: d('RightHand', 'RightForeArm'),
  };
  // procedural head gear (helms) was authored for a head centred 0.12 above the head bone with a
  // shell about 0.3 wide; fit it to this (much larger) head
  const hs = head.isEmpty() ? 1 : (head.max.x - head.min.x) / 0.3;
  const hc = head.isEmpty() ? J.Head.clone().add(new THREE.Vector3(0, 0.12, 0)) : head.getCenter(new THREE.Vector3());
  const headFit = { pos: hc.sub(J.Head).sub(new THREE.Vector3(0, 0.12 * hs, 0)).toArray(), scale: hs };
  const neckFit = { pos: J.Head.clone().sub(J.Spine).sub(new THREE.Vector3(0, 0.36, 0)).toArray(), scale: 1 };
  return { scene, joints, world, headFit, neckFit, chibi: true, gearScale: cfg.gearScale ?? 1, hipsParentInv: bones.Hips.parent.matrixWorld.clone().invert() };
}

/** Add the chibi body to a built driver rig and give the rig syncSkin(). */
export function attachChibiBody(rig, T, { outline = 0.012, darkness = 0.32, rim = 0.3 } = {}) {
  const body = SkeletonUtils.clone(T.scene);
  const flash = rig.material.userData.flash;
  const meshes = [];
  body.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  for (const mesh of meshes) {
    const src = mesh.material;
    mesh.material = toonCopy(src, flash, rim, false);
    mesh.material.side = THREE.FrontSide; // Meshy marks it double-sided; the body is closed
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const hull = new THREE.SkinnedMesh(mesh.geometry, hullCopy(src, outline, darkness));
    hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.frustumCulled = false;
    mesh.parent.add(hull);
  }
  rig.root.add(body);
  rig.skin = { body };
  return bindSkinSync(rig, body, T);
}
