// Skinned hero body (data/models.json → characters.hero_base, a Meshy auto-rigged mesh).
// The procedural driver bones in hero.js stay the animation source: HumanoidAnimator poses
// them exactly as before, and syncSkin() copies each driver bone's root-space rotation onto
// the matching skin bone every frame (a world-space retarget). The driver bones are placed
// on the skin's joints, so hair, helms and weapons attached to them still line up.
// Clothes are painted by zone (skin, tunic, pants, boots, leather), cut in the fragment shader
// from the bind-pose position and coloured by uniforms, so one shared geometry serves every look.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonRamp } from './toon.js';
import { facePatch, faceTexture, faceMaterial, FACE_CELLS } from './face.js';

// skin bone -> driver bone. Meshy's spine runs Hips > Spine02 > Spine01 > Spine (top).
export const MAP = {
  Hips: 'hips', Spine02: 'torso', Spine: 'chest', Head: 'head',
  LeftUpLeg: 'legL', LeftLeg: 'kneeL', LeftFoot: 'footL',
  RightUpLeg: 'legR', RightLeg: 'kneeR', RightFoot: 'footR',
  LeftArm: 'armL', LeftForeArm: 'elbowL', LeftHand: 'handL',
  RightArm: 'armR', RightForeArm: 'elbowR', RightHand: 'handR',
};
// driver hierarchy in parent-first order: [bone, parent]
export const DRIVER = [
  ['body', null], ['hips', 'body'], ['torso', 'hips'], ['chest', 'torso'], ['head', 'chest'],
  ['legL', 'hips'], ['kneeL', 'legL'], ['footL', 'kneeL'], ['legR', 'hips'], ['kneeR', 'legR'], ['footR', 'kneeR'],
  ['armL', 'chest'], ['elbowL', 'armL'], ['handL', 'elbowL'], ['armR', 'chest'], ['elbowR', 'armR'], ['handR', 'elbowR'],
];

const v = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qz = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

/** Pose the loaded model once (arms down), paint its zones and measure the joints. */
export function prepareHeroBase(gltf, cfg) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  let mesh = null;
  const bones = {};
  scene.traverse((o) => {
    if (o.isSkinnedMesh && !mesh) mesh = o;
    if (o.isBone) bones[o.name] = o;
  });
  if (!mesh || !bones.Hips) throw new Error('hero base: no skinned mesh or Hips bone');
  const at = (n) => bones[n].getWorldPosition(new THREE.Vector3());

  // clothes zones are cut in the fragment shader from the bind (T-pose) position, in metres,
  // so their edges are clean lines instead of following triangles
  const hips = at('Hips'), knee = at('LeftLeg'), neck = at('neck');
  const f = (x) => x.toFixed(4);
  const zoneGLSL = `
varying vec3 vBind;
int clothZone(vec3 p) {
  float x = abs(p.x), y = p.y;
  if (x > ${f(Math.abs(at('LeftArm').x) * 0.95)} && y > ${f(hips.y + 0.2)}) {
    // arm: sleeve rolled above the elbow, leather bracer and fingerless glove
    float elbow = ${f(Math.abs(at('LeftForeArm').x))}, wrist = ${f(Math.abs(at('LeftHand').x))};
    if (x < elbow - 0.05) return 1;
    if (x > elbow + (wrist - elbow) * 0.5) return 4;
    return 0;
  }
  if (y < ${f(knee.y - 0.05)}) return 3;
  if (y < ${f(hips.y - 0.2)} + 0.012 * sin(p.x * 55.0 + p.z * 31.0)) return 2; // tunic hem
  if (y > ${f(hips.y - 0.01)} && y < ${f(hips.y + 0.05)}) return 4; // belt
  float neckY = ${f(neck.y - 0.02)};
  if (y < neckY && !(p.z > 0.03 && x < (y - neckY + 0.09) * 0.45)) return 5; // body (vest), V neck
  return 0;
}
`;
  mesh.geometry.userData.shared = true;
  const faceGeo = cfg.face ? facePatch(mesh.geometry, cfg.face) : null;

  // rest pose: arms hanging like the driver rig's (its rest is arms down, all rotations zero)
  const drop = cfg.armDrop ?? 1.35;
  const turnWorld = (bone, axis, angle) => {
    // rotate about a world axis under a rotated parent: local' = P^-1 R P local
    const p = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const r = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(p.clone().invert().multiply(r).multiply(p));
    bone.updateMatrixWorld(true);
  };
  turnWorld(bones.LeftArm, new THREE.Vector3(0, 0, 1), -drop);
  turnWorld(bones.RightArm, new THREE.Vector3(0, 0, 1), drop);
  scene.updateMatrixWorld(true);

  const J = {};
  for (const n of Object.keys(MAP)) J[n] = at(n);
  J.neck = at('neck');
  // rest world position of every driver bone (outfit parts are placed from these)
  const world = { neck: J.neck.toArray() };
  for (const [skin, drv] of Object.entries(MAP)) world[drv] = J[skin].toArray();
  const d = (a, b) => J[a].clone().sub(J[b]).toArray();
  const joints = {
    hips: J.Hips.toArray(), torso: d('Spine02', 'Hips'), chest: d('Spine', 'Spine02'), head: d('Head', 'Spine'),
    legL: d('LeftUpLeg', 'Hips'), kneeL: d('LeftLeg', 'LeftUpLeg'), footL: d('LeftFoot', 'LeftLeg'),
    legR: d('RightUpLeg', 'Hips'), kneeR: d('RightLeg', 'RightUpLeg'), footR: d('RightFoot', 'RightLeg'),
    armL: d('LeftArm', 'Spine'), elbowL: d('LeftForeArm', 'LeftArm'), handL: d('LeftHand', 'LeftForeArm'),
    armR: d('RightArm', 'Spine'), elbowR: d('RightForeArm', 'RightArm'), handR: d('RightHand', 'RightForeArm'),
  };
  // procedural head parts (hair, eyes, helms) were authored for a head centred 0.12 above
  // the head bone; fit them to this head
  // (per-axis: this head is narrower and deeper than the procedural one)
  const hs = Array.isArray(cfg.headScale) ? cfg.headScale : [cfg.headScale ?? 1, cfg.headScale ?? 1, cfg.headScale ?? 1];
  const hc = new THREE.Vector3(...(cfg.headCentre || [0, J.Head.y + 0.12, 0]));
  const headFit = { pos: hc.sub(J.Head).sub(new THREE.Vector3(0, 0.12 * hs[1], 0.005 * hs[2])).toArray(), scale: hs };
  // neck parts (scarf) were authored with the head bone 0.36 above the chest bone
  const ns = cfg.neckScale ?? 1;
  const neckFit = { pos: J.Head.clone().sub(J.Spine).sub(new THREE.Vector3(0, 0.36 * ns + (cfg.neckDrop ?? 0), 0)).toArray(), scale: ns };
  // the left shoulder guard, authored for the old thicker arm
  const armFit = { pos: cfg.shoulderPad?.pos || [0, 0, 0], scale: cfg.shoulderPad?.scale ?? 1 };
  return { scene, joints, world, headFit, neckFit, armFit, zoneGLSL, faceGeo, face: cfg.face, hipsParentInv: bones.Hips.parent.matrixWorld.clone().invert() };
}

function zoneUniform(colors) {
  // 0 skin, 1 sleeves, 2 pants, 3 boots, 4 leather, 5 body (the tunic, or an armour's vest)
  return { value: [colors.skin, colors.tunic, colors.pants, colors.boots, colors.leather, colors.vest || colors.tunic].map((c) => new THREE.Color(c)) };
}

function skinMaterial(zones, flash, rim, zoneGLSL) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp() });
  m.userData.rig = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uZone = zones;
    shader.uniforms.uFlash = flash;
    shader.uniforms.uRim = { value: rim };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uZone[6]; uniform vec3 uFlash; uniform float uRim;' + zoneGLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= uZone[clothZone(vBind)];')
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 vdir = normalize(vViewPosition);
  float rimK = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), 3.0) * uRim;
  outgoingLight += vec3(1.0, 0.97, 0.9) * rimK * 0.6;
  outgoingLight = mix(outgoingLight, vec3(1.0), clamp(uFlash.x, 0.0, 1.0));
  outgoingLight += vec3(1.0, 0.45, 0.15) * uFlash.y + vec3(0.5, 0.8, 1.0) * uFlash.z;
}
#include <opaque_fragment>`
      );
  };
  m.customProgramCacheKey = () => 'skin-toon';
  return m;
}

function skinHull(zones, width, darkness, zoneGLSL) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  m.userData.rig = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uZone = zones;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvBind = position;\ntransformed += normalize(normal) * ${width.toFixed(4)};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uZone[6];' + zoneGLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = uZone[clothZone(vBind)] * ${darkness.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => 'skin-hull';
  return m;
}

/** Add a skinned body to a built driver rig and give the rig syncSkin(). */
export function attachSkinnedBody(rig, T, colors, look, { outline = 0.012, darkness = 0.32, rim = 0.3 } = {}) {
  const body = SkeletonUtils.clone(T.scene);
  const zones = zoneUniform(colors);
  let mesh = null;
  body.traverse((o) => {
    if (o.isSkinnedMesh && !mesh) mesh = o;
  });
  mesh.material = skinMaterial(zones, rig.material.userData.flash, rim, T.zoneGLSL);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const hull = new THREE.SkinnedMesh(mesh.geometry, skinHull(zones, outline, darkness, T.zoneGLSL));
  hull.bind(mesh.skeleton, mesh.bindMatrix);
  hull.frustumCulled = false;
  mesh.parent.add(hull);
  if (T.faceGeo) {
    const cell = { value: new THREE.Vector2(...FACE_CELLS.open) };
    const face = new THREE.SkinnedMesh(T.faceGeo, faceMaterial(faceTexture(look, T.face), cell));
    face.bind(mesh.skeleton, mesh.bindMatrix);
    face.frustumCulled = false;
    face.renderOrder = 1;
    mesh.parent.add(face);
    let current = 'open';
    rig.setFace = (expr) => {
      if (expr === current || !FACE_CELLS[expr]) return;
      current = expr;
      cell.value.set(...FACE_CELLS[expr]);
    };
  }
  rig.root.add(body);
  body.updateMatrixWorld(true);

  // skin bones in parent-first order with their rest data (the clone carries the arms-down pose)
  const list = [];
  const index = new Map();
  body.traverse((o) => {
    if (!o.isBone) return;
    const e = { bone: o, driver: MAP[o.name] || null, parent: index.has(o.parent) ? index.get(o.parent) : -1 };
    e.restLocal = o.quaternion.clone();
    e.world = new THREE.Quaternion();
    // driver rest rotations are identity, so the offset is the skin bone's rest root-space rotation
    e.offset = o.getWorldQuaternion(new THREE.Quaternion());
    e.parentQ = e.parent < 0 ? o.parent.getWorldQuaternion(new THREE.Quaternion()) : null;
    // shoulders are not driven: they shrug when their arm rises above the horizontal
    if (o.name === 'LeftShoulder' || o.name === 'RightShoulder') {
      e.shrug = o.name === 'LeftShoulder' ? 'armL' : 'armR';
      e.side = o.name === 'LeftShoulder' ? 1 : -1;
    }
    index.set(o, list.length);
    list.push(e);
  });
  const hipsBone = list.find((e) => e.bone.name === 'Hips').bone;
  const dq = {};
  for (const [n] of DRIVER) dq[n] = new THREE.Quaternion();
  const b = rig.bones;

  rig.skin = { body, mesh, zones };
  rig.syncSkin = () => {
    for (const [n, p] of DRIVER) {
      if (p) dq[n].copy(dq[p]).multiply(b[n].quaternion);
      else dq[n].copy(b[n].quaternion);
    }
    for (const e of list) {
      const pw = e.parent < 0 ? e.parentQ : list[e.parent].world;
      if (e.driver) e.world.copy(dq[e.driver]).multiply(e.offset);
      else {
        e.world.copy(pw).multiply(e.restLocal);
        if (e.shrug) {
          v.set(0, -1, 0).applyQuaternion(dq[e.shrug]);
          const lift = Math.min(0.35, Math.max(0, (Math.acos(Math.max(-1, Math.min(1, -v.y))) - 1.2) * 0.35));
          if (lift > 0) e.world.premultiply(qz.setFromAxisAngle(Z, e.side * lift));
        }
      }
      e.bone.quaternion.copy(qa.copy(pw).invert().multiply(e.world));
    }
    v.copy(b.hips.position).applyQuaternion(b.body.quaternion).add(b.body.position).applyMatrix4(T.hipsParentInv);
    hipsBone.position.copy(v);
  };
  rig.syncSkin();
  return rig;
}

const DRIVER_NAMES = new Set(DRIVER.map(([n]) => n));

/**
 * Move a driver bone's procedural parts (not its child driver bones) into a fitted group
 * (position + uniform scale).
 */
export function fitParts(bone, fit, { skip = [] } = {}) {
  const g = new THREE.Group();
  g.position.fromArray(fit.pos);
  if (Array.isArray(fit.scale)) g.scale.fromArray(fit.scale);
  else g.scale.setScalar(fit.scale);
  for (const c of [...bone.children]) if (!DRIVER_NAMES.has(c.name) && !skip.includes(c.name)) g.add(c);
  bone.add(g);
  return g;
}
