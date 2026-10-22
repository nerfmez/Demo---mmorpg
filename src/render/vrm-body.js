// A VRM 1.0 character (data/models.json → characters.hero_vrm, made in VRoid Studio) as the hero's
// skinned body. Opt-in with ?hero=vrm. It reuses the driver-bone retarget of skinned.js
// (bindSkinSync): HumanoidAnimator poses the procedural driver bones and the VRM's humanoid bones
// copy their root-space rotations. The VRM keeps its own face, hair and textures; only the
// materials are swapped for the game's 3-step toon ramp, rim light, hit flash and outline hull.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonRamp } from './toon.js';
import { bindSkinSync } from './skinned.js';

export const useVrm = typeof location !== 'undefined' && new URLSearchParams(location.search).get('hero') === 'vrm';

// VRM humanoid bone -> driver bone. upperChest carries the arms, so it is the driver "chest".
const HUMANOID_TO_DRIVER = {
  hips: 'hips', spine: 'torso', upperChest: 'chest', head: 'head',
  leftUpperLeg: 'legL', leftLowerLeg: 'kneeL', leftFoot: 'footL',
  rightUpperLeg: 'legR', rightLowerLeg: 'kneeR', rightFoot: 'footR',
  leftUpperArm: 'armL', leftLowerArm: 'elbowL', leftHand: 'handL',
  rightUpperArm: 'armR', rightLowerArm: 'elbowR', rightHand: 'handR',
};

// game face state -> VRM expression preset and strength
const FACE_EXPRESSION = { open: null, blink: ['blink', 1], attack: ['angry', 0.7], hurt: ['surprised', 0.9] };

/** Pose the loaded VRM once (arms down), and measure its joints for the driver rig. */
export function prepareVrmBody(gltf, cfg) {
  const scene = gltf.scene;
  const vrm = cfg.hairsample ? gltf.parser.json.asset.extras?.hairsample : gltf.parser.json.extensions?.VRMC_vrm;
  if (!vrm) throw new Error('hero_vrm: not a VRM 1.0 file');
  // VRM0 master faces -Z; game-facing +Z. Only the new asset needs this basis.
  if (cfg.hairsample) scene.rotation.y = Math.PI;
  const byNode = new Map();
  for (const [obj, a] of gltf.parser.associations) if (a && a.nodes !== undefined && obj.isObject3D) byNode.set(a.nodes, obj);
  // GLTFLoader reduces associations per scene. The wardrobe-only scene does not
  // retain the body's node associations; native bone/face names remain stable.
  const nodeObject = node => byNode.get(node) || (cfg.hairsample ? scene.getObjectByName(gltf.parser.json.nodes[node].name) : null);
  const H = {};
  for (const [name, { node }] of Object.entries(vrm.humanoid.humanBones)) H[name] = nodeObject(node);
  for (const need of Object.keys(HUMANOID_TO_DRIVER)) if (need !== 'upperChest' && !H[need]) throw new Error(`hero_vrm: missing humanoid bone ${need}`);
  H.upperChest = H.upperChest || H.chest || H.spine;
  scene.updateMatrixWorld(true);

  const map = {};
  for (const [h, d] of Object.entries(HUMANOID_TO_DRIVER)) map[H[h].name] = d;

  // rest pose: arms hanging like the driver rig's (its rest is arms down, all rotations zero)
  const drop = cfg.armDrop ?? 1.3;
  const turnWorld = (bone, axis, angle) => {
    const p = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const r = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(p.clone().invert().multiply(r).multiply(p));
    bone.updateMatrixWorld(true);
  };
  const Z = new THREE.Vector3(0, 0, 1);
  turnWorld(H.leftUpperArm, Z, -drop);
  turnWorld(H.rightUpperArm, Z, drop);
  scene.updateMatrixWorld(true);

  const at = (n) => H[n].getWorldPosition(new THREE.Vector3());
  const J = {};
  for (const n of Object.keys(HUMANOID_TO_DRIVER)) J[n] = at(n);
  const d = (a, b) => J[a].clone().sub(J[b]).toArray();
  const joints = {
    hips: J.hips.toArray(), torso: d('spine', 'hips'), chest: d('upperChest', 'spine'), head: d('head', 'upperChest'),
    legL: d('leftUpperLeg', 'hips'), kneeL: d('leftLowerLeg', 'leftUpperLeg'), footL: d('leftFoot', 'leftLowerLeg'),
    legR: d('rightUpperLeg', 'hips'), kneeR: d('rightLowerLeg', 'rightUpperLeg'), footR: d('rightFoot', 'rightLowerLeg'),
    armL: d('leftUpperArm', 'upperChest'), elbowL: d('leftLowerArm', 'leftUpperArm'), handL: d('leftHand', 'leftLowerArm'),
    armR: d('rightUpperArm', 'upperChest'), elbowR: d('rightLowerArm', 'rightUpperArm'), handR: d('rightHand', 'rightLowerArm'),
  };

  // procedural head gear (helms) was authored for a head centred 0.12 above the head bone with a
  // shell about 0.3 wide; fit it to this head from the hair mesh's bounds
  let hairBox = null;
  scene.traverse((o) => {
    if (o.isSkinnedMesh && /HAIR/.test(o.material.name)) {
      o.geometry.computeBoundingBox();
      hairBox = (hairBox || new THREE.Box3()).union(o.geometry.boundingBox);
    }
  });
  const hs = hairBox ? (hairBox.max.x - hairBox.min.x) / 0.3 : 1;
  const hc = hairBox ? hairBox.getCenter(new THREE.Vector3()) : J.head.clone().add(new THREE.Vector3(0, 0.12, 0));
  const headFit = { pos: hc.sub(J.head).sub(new THREE.Vector3(0, 0.12 * hs, 0)).toArray(), scale: hs };

  // expression presets -> morph target binds, by node name so a clone can find its own meshes
  const expressions = {};
  for (const [name, e] of Object.entries(vrm.expressions?.preset || {})) {
    const binds = (e.morphTargetBinds || []).map((b) => ({ node: nodeObject(b.node)?.name, index: b.index, weight: b.weight })).filter((b) => b.node);
    if (binds.length) expressions[name] = binds;
  }

  for (const sourceScene of cfg.hairsample ? gltf.scenes : [scene]) sourceScene.traverse((o) => {
    if (o.geometry) o.geometry.userData.shared = true;
    if (o.material?.map) o.material.map.userData.shared = true;
  });
  const world = {};
  for (const [name, driver] of Object.entries(HUMANOID_TO_DRIVER)) world[driver] = J[name].toArray();
  const neckFit = {pos:J.head.clone().sub(J.upperChest).sub(new THREE.Vector3(0,.36,0)).toArray(),scale:1};
  return { scene, wardrobe:cfg.hairsample ? gltf.scenes.find(s=>s.name==='RuntimeWardrobe') : null, joints, world, headFit, neckFit, map, shoulders: { [H.leftShoulder?.name]: ['armL', 1], [H.rightShoulder?.name]: ['armR', -1] }, hipsName: H.hips.name, expressions, hipsParentInv: H.hips.parent.matrixWorld.clone().invert() };
}

/**
 * A toon copy of a VRM material: keeps its texture, alpha mode and sidedness; adds rim and flash.
 * `flat` turns the shading normal toward the camera (faces are painted for near-flat lighting;
 * raw directional shading cuts the nose and cheeks into hard bands).
 */
export function toonCopy(src, flash, rim, flat) {
  const m = new THREE.MeshToonMaterial({
    map: src.map,
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    gradientMap: toonRamp(),
    side: src.side,
    transparent: src.transparent,
    alphaTest: src.alphaTest,
    depthWrite: src.depthWrite,
  });
  m.userData.rig = true; // one per rig: freed with the rig (the shared texture is kept)
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = flash;
    shader.uniforms.uRim = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlash; uniform float uRim;')
      .replace('#include <normal_fragment_maps>', flat ? '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, vec3(0.0, 0.0, 1.0), 0.75));' : '#include <normal_fragment_maps>')
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
  m.customProgramCacheKey = () => (flat ? 'vrm-toon-flat' : 'vrm-toon');
  return m;
}

/** The outline: the same texture darkened, pushed out along the normals, back faces only. */
function hullCopy(src, width, darkness) {
  const m = new THREE.MeshBasicMaterial({ map: src.map, color: new THREE.Color(darkness, darkness, darkness * 1.12), side: THREE.BackSide, alphaTest: src.alphaTest });
  m.userData.rig = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `vrm-hull-${width}`;
  return m;
}

/** Add the VRM body to a built driver rig and give the rig syncSkin() and setFace(). */
export function attachVrmBody(rig, T, { outline = 0.012, darkness = 0.32, rim = 0.3 } = {}) {
  const body = SkeletonUtils.clone(T.scene);
  const flash = rig.material.userData.flash;
  const meshes = [];
  body.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  for (const mesh of meshes) {
    const src = mesh.material;
    mesh.material = toonCopy(src, flash, rim, /Face|_EYE\b/.test(src.name));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    // blended parts (brows, eye lines, irises) draw after the skin under them
    if (src.transparent) mesh.renderOrder = 2;
    if (/_(SKIN|HAIR|CLOTH)\b/.test(src.name)) {
      const hull = new THREE.SkinnedMesh(mesh.geometry, hullCopy(src, /Face/.test(src.name) ? outline * 0.5 : outline, darkness)); // a thinner line on the small face
      hull.bind(mesh.skeleton, mesh.bindMatrix);
      hull.frustumCulled = false;
      hull.morphTargetInfluences = mesh.morphTargetInfluences; // the outline follows expressions
      hull.morphTargetDictionary = mesh.morphTargetDictionary;
      mesh.parent.add(hull);
    }
  }
  rig.root.add(body);
  rig.skin = { body };

  // expressions: morph target binds on the face meshes
  const targets = {};
  for (const [name, binds] of Object.entries(T.expressions)) {
    targets[name] = binds.map((b) => {
      const infl = [];
      body.getObjectByName(b.node)?.traverse((o) => {
        if (o.morphTargetInfluences) infl.push(o.morphTargetInfluences);
      });
      return { infl, index: b.index, weight: b.weight };
    });
  }
  let current = 'open';
  const apply = (state, on) => {
    const e = FACE_EXPRESSION[state];
    if (!e || !targets[e[0]]) return;
    for (const b of targets[e[0]]) for (const infl of b.infl) infl[b.index] = on ? b.weight * e[1] : 0;
  };
  rig.setFace = (expr) => {
    if (expr === current || !(expr in FACE_EXPRESSION)) return;
    apply(current, false);
    current = expr;
    apply(current, true);
  };
  return bindSkinSync(rig, body, T);
}
