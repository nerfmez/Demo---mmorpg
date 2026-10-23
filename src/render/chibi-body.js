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
import { toonCopy } from './vrm-body.js';

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

/**
 * The closed shape of an open hand (the Meshy hand has no finger bones), in the bind (T-pose)
 * shape. Every vertex led by the hand bone past the knuckles (`knuckle` of the hand's length) is
 * bent toward the palm around an axis across the fingers, `radius` × the hand's thickness beyond
 * the fingers' palm side, by its distance past the knuckles (the tips reach at most `wrap`
 * half-turns). The thumb (vertices from `thumbFrom` to `thumbTo` of the way out to its side, short
 * of `thumbReach` of the hand's length) then turns up to `thumbTurn` degrees about the hand's
 * length, folding under the palm over the curled fingers. Returns the hand's vertex ids, their
 * closed positions (mesh space) and the fist's hole in world space, where a handle goes.
 */
export function curlFist(mesh, hand, { knuckle = 0.55, radius = 0.25, wrap = 1.25, thumbTurn = 100, thumbFrom = 0.35, thumbTo = 0.6, thumbReach = 0.75 } = {}) {
  const geo = mesh.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const index = mesh.skeleton.bones.indexOf(hand);
  // bind position -> world: the hand bone's skinning matrix, which every bone shares at bind
  hand.updateWorldMatrix(true, false);
  const toWorld = new THREE.Matrix4().copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse)
    .multiply(new THREE.Matrix4().multiplyMatrices(hand.matrixWorld, mesh.skeleton.boneInverses[index])).multiply(mesh.bindMatrix);
  const toLocal = toWorld.clone().invert();
  const ids = [], pts = [], v = new THREE.Vector3(), origin = hand.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < pos.count; i++) {
    let lead = 0;
    for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, lead)) lead = k;
    if (si.getComponent(i, lead) !== index) continue;
    ids.push(i);
    pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(toWorld).sub(origin).clone());
  }
  if (!ids.length) return null;
  // axes: fingers out along the arm, palm down (the bind pose is palms down), across = fingers × palm;
  // the model faces +Z, so the thumb is on the +Z side of `across`
  const F = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).normalize();
  const P = new THREE.Vector3(0, -1, 0).addScaledVector(F, F.y).normalize();
  const A = new THREE.Vector3().crossVectors(F, P);
  const side = Math.sign(A.z) || 1;
  let tMin = Infinity, tMax = -Infinity, hMin = Infinity, hMax = -Infinity, aMax = 0;
  for (const p of pts) {
    const t = p.dot(F), h = p.dot(P);
    tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
    aMax = Math.max(aMax, p.dot(A) * side);
  }
  // the bend radius grows if needed so the fingertips end inside the turn (not through the palm)
  const t0 = tMin + (tMax - tMin) * knuckle, r = Math.max((hMax - hMin) * radius, (tMax - t0) / (wrap * Math.PI));
  let palmSide = -Infinity, aSum = 0, aN = 0;
  for (const p of pts) if (p.dot(F) > t0) { palmSide = Math.max(palmSide, p.dot(P)); aSum += p.dot(A); aN++; }
  const centre = new THREE.Vector3().addScaledVector(F, t0).addScaledVector(P, palmSide + r).addScaledVector(A, aN ? aSum / aN : 0);
  const thumbEnd = tMin + (tMax - tMin) * thumbReach, fade = (tMax - tMin) * 0.15;
  const pivot = new THREE.Vector3().addScaledVector(A, side * aMax * thumbFrom).addScaledVector(P, (hMin + hMax) / 2);
  const q = new THREE.Quaternion(), rel = new THREE.Vector3(), at = new THREE.Vector3();
  const shape = new Float32Array(ids.length * 3);
  pts.forEach((p, k) => {
    const t = p.dot(F), s = t - t0;
    rel.copy(p);
    if (s > 0) {
      // the point at the knuckle line with this height and width, turned about the centre
      q.setFromAxisAngle(A, s / r);
      rel.addScaledVector(F, -s).sub(centre).applyQuaternion(q).add(centre);
    } else {
      const w = THREE.MathUtils.clamp(((p.dot(A) * side) / aMax - thumbFrom) / (thumbTo - thumbFrom), 0, 1)
        * THREE.MathUtils.clamp(1 - (t - thumbEnd) / fade, 0, 1);
      if (w > 0) {
        at.copy(pivot).addScaledVector(F, t);
        q.setFromAxisAngle(F, -side * THREE.MathUtils.degToRad(thumbTurn) * w);
        rel.sub(at).applyQuaternion(q).add(at);
      }
    }
    rel.add(origin).applyMatrix4(toLocal).toArray(shape, k * 3);
  });
  return { ids, shape, centre: centre.add(origin) };
}

/**
 * Add each hand's fist as a morph target (positions and smoothed normals, relative) so a hand can
 * close only while it holds something; and an `outlineScale` attribute that thins the outline
 * on the hands, whose small folded shapes a full-width hull turns into black jags.
 */
function addFistMorphs(geo, fists) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const outline = new Float32Array(pos.count).fill(1);
  const open = pos.array.slice(), openN = nrm.array.slice();
  for (const f of fists) for (let k = 0; k < f.ids.length; k++) {
    pos.setXYZ(f.ids[k], f.shape[k * 3], f.shape[k * 3 + 1], f.shape[k * 3 + 2]);
    outline[f.ids[k]] = HAND_OUTLINE;
  }
  smoothNormals(geo);
  const closedN = geo.attributes.normal.array;
  const targets = fists.map((f, n) => {
    const dp = new Float32Array(pos.count * 3), dn = new Float32Array(pos.count * 3);
    for (const i of f.ids) for (let c = 0; c < 3; c++) {
      dp[i * 3 + c] = pos.array[i * 3 + c] - open[i * 3 + c];
      dn[i * 3 + c] = closedN[i * 3 + c] - openN[i * 3 + c];
    }
    const a = new THREE.BufferAttribute(dp, 3), b = new THREE.BufferAttribute(dn, 3);
    a.name = b.name = FIST_NAMES[n];
    return [a, b];
  });
  pos.array.set(open);
  pos.needsUpdate = true;
  geo.setAttribute('normal', new THREE.BufferAttribute(openN, 3));
  geo.morphAttributes.position = targets.map(([a]) => a);
  geo.morphAttributes.normal = targets.map(([, b]) => b);
  geo.morphTargetsRelative = true;
  geo.setAttribute('outlineScale', new THREE.BufferAttribute(outline, 1));
  geo.computeBoundingSphere();
}

/**
 * Reshape the bind head toward the sheet's rounder chibi head: wider (`wide`), the face below the
 * eyes shorter (`chin`) and fuller at the cheeks (`cheek`). Works in the model's world bind
 * space (faces +Z), on vertices by their Head skin weight so the neck blends. Returns the head
 * centre in mesh space for softHeadNormals.
 */
function reshapeHead(mesh, shape) {
  const pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const hb = mesh.skeleton.bones.findIndex((b) => b.name === 'Head');
  const toWorld = mesh.matrixWorld, toMesh = toWorld.clone().invert();
  const w = new Float32Array(pos.count), box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hb) w[i] += sw.getComponent(i, k);
    if (w[i] > 0.5) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(toWorld));
  }
  const c = box.getCenter(new THREE.Vector3());
  const eyeY = box.min.y + (box.max.y - box.min.y) * shape.eye;
  for (let i = 0; i < pos.count; i++) {
    if (!w[i]) continue;
    v.fromBufferAttribute(pos, i).applyMatrix4(toWorld);
    let sx = 1 + shape.wide * w[i];
    if (v.y < eyeY) {
      const t = Math.min(1, (eyeY - v.y) / (eyeY - box.min.y));
      v.y = eyeY - (eyeY - v.y) * (1 - shape.chin * w[i]);
      sx *= 1 + shape.cheek * w[i] * Math.sin(Math.PI * t);
    }
    v.x = c.x + (v.x - c.x) * sx;
    v.applyMatrix4(toMesh);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  return { centre: c.applyMatrix4(toMesh), w };
}

/**
 * Bend the head's normals toward the head's centre (`soft` 0..1), the usual anime-face trick: the
 * toon ramp then shades the face as one round form, without bands across the nose and cheeks.
 */
function softHeadNormals(geo, { centre, w }, soft) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, n = new THREE.Vector3(), r = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (!w[i]) continue;
    r.fromBufferAttribute(pos, i).sub(centre).normalize();
    n.fromBufferAttribute(nrm, i).lerp(r, soft * w[i]).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  nrm.needsUpdate = true;
}

const FIST_NAMES = ['fistR', 'fistL'];
const HAND_OUTLINE = 0.35;

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
  const head0 = cfg.headShape ? reshapeHead(mesh, cfg.headShape) : null;
  const fists = cfg.fist ? { RightHand: curlFist(mesh, bones.RightHand, cfg.fist), LeftHand: curlFist(mesh, bones.LeftHand, cfg.fist) } : {};
  smoothNormals(mesh.geometry);
  if (fists.RightHand && fists.LeftHand) addFistMorphs(mesh.geometry, [fists.RightHand, fists.LeftHand]);
  if (head0) softHeadNormals(mesh.geometry, head0, cfg.headShape.soft);
  mesh.geometry.userData.shared = true;
  if (mesh.material.map) mesh.material.map.userData.shared = true;
  const at = (n) => bones[n].getWorldPosition(new THREE.Vector3());

  // in the bind (T-pose) shape: head bounds (every vertex above the head joint) and each palm's
  // centre (vertices led by a hand bone, in that bone's space) for the weapon grip
  const headY = at('Head').y;
  const head = new THREE.Box3();
  const v = new THREE.Vector3();
  const geo = mesh.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const palm = { RightHand: [new THREE.Vector3(), 0], LeftHand: [new THREE.Vector3(), 0] };
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    if (v.y > headY) head.expandByPoint(v);
    let lead = 0;
    for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, lead)) lead = k;
    const p = palm[mesh.skeleton.bones[si.getComponent(i, lead)].name];
    if (p) { p[0].add(bones[mesh.skeleton.bones[si.getComponent(i, lead)].name].worldToLocal(v)); p[1]++; }
  }
  // each hand's thumb direction in its own space: the model faces +Z, so in the bind pose both
  // thumbs point +Z (palms down, fingers out along the arms)
  const grip = {}, thumb = {};
  for (const [n, [sum, count]] of Object.entries(palm)) {
    grip[n] = fists[n] ? bones[n].worldToLocal(fists[n].centre) : count ? sum.divideScalar(count) : new THREE.Vector3();
    thumb[n] = new THREE.Vector3(0, 0, 1).applyQuaternion(bones[n].getWorldQuaternion(new THREE.Quaternion()).invert());
  }

  // rest pose: arms hanging like the driver rig's (its rest is arms down, all rotations zero)
  const drop = cfg.armDrop ?? 1.3;
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
  // the head's bind bounds in the head bone's space, for fitting a separate hair model
  const headBox = head.isEmpty() ? null : head.clone().applyMatrix4(bones.Head.matrixWorld.clone().invert());
  return { scene, joints, world, headFit, neckFit, headBox, chibi: true, grip, thumb, leftFistWith: cfg.fist?.leftFistWith || [], gearScale: cfg.gearScale ?? 1, holds: cfg.holds || null, gripMiddle: cfg.gripMiddle || [],
    bodyMap: cfg.bodyMap ? { from: cfg.bodyMap.hips, to: J.Hips.y, scale: cfg.bodyMap.scale } : null, hipsParentInv: bones.Hips.parent.matrixWorld.clone().invert() };
}

/**
 * The outline: the texture darkened, back faces only, pushed out along the skinned (and morphed)
 * normal after skinning, scaled per vertex by `outlineScale` (thin on the hands).
 */
function outlineHull(src, width, darkness) {
  const m = new THREE.MeshBasicMaterial({ map: src.map, color: new THREE.Color(darkness, darkness, darkness * 1.12), side: THREE.BackSide });
  m.userData.rig = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float outlineScale;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\ntransformed += normalize(objectNormal) * ${width.toFixed(4)} * outlineScale;`);
  };
  m.customProgramCacheKey = () => `chibi-hull-${width}`;
  return m;
}

/** A separate hair model for the chibi body (data/models.json characters, chibiHair). */
export function prepareChibiHair(gltf, cfg) {
  let mesh = null;
  gltf.scene.traverse((o) => {
    if (o.isMesh && !mesh) mesh = o;
  });
  if (!mesh) throw new Error('chibi hair: no mesh');
  gltf.scene.updateMatrixWorld(true);
  let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox.clone();
  // `keep: [side, at]`: only the front or back part of this hair, split across its depth at `at`
  // (0 back, 1 front), so two hair models can be joined (one's fringe with the other's back)
  if (cfg.keep) geometry = keepPart(geometry, box, cfg.keep);
  smoothNormals(geometry);
  geometry.userData.shared = true;
  if (mesh.material.map) mesh.material.map.userData.shared = true;
  // `color`: one flat colour instead of the generated texture (the hair is painted one tone)
  const material = cfg.color ? { color: new THREE.Color(cfg.color), map: null, side: THREE.DoubleSide } : mesh.material;
  return { geometry, material, box, fit: cfg.fit || {} };
}

function keepPart(geometry, box, [side, at]) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = src.attributes.position, keep = [];
  const z0 = box.min.z, dz = box.max.z - box.min.z || 1;
  for (let t = 0; t < p.count; t += 3) {
    const z = ((p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3 - z0) / dz;
    if (side === 'front' ? z >= at : z <= at) for (let k = 0; k < 3; k++) keep.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return g;
}

/**
 * Put the hair on the chibi head bone: scaled so its width and depth are `fit.width` and
 * `fit.depth` × the head's (height: their mean × `fit.height`), centred on the head across and
 * front-to-back (moved back by `fit.back` × head depth, and toward +X by `fit.side` × head width)
 * and its top `fit.lift` × head height above the head's. Toon material with a plain outline hull.
 */
export function attachChibiHair(rig, T, H, { outline = 0.012, darkness = 0.32, rim = 0.3 } = {}) {
  const headBone = rig.skin?.body.getObjectByName('Head');
  if (!headBone || !T.headBox) return;
  const hb = T.headBox, b = H.box, f = H.fit;
  const hw = hb.max.x - hb.min.x, hd = hb.max.z - hb.min.z, hh = hb.max.y - hb.min.y;
  // per axis: the chibi head is rounder than the head the hair was made on
  const sx = (hw * (f.width ?? 1.15)) / (b.max.x - b.min.x), sz = (hd * (f.depth ?? 1.15)) / (b.max.z - b.min.z);
  const sy = ((sx + sz) / 2) * (f.height ?? 1);
  const g = new THREE.Group();
  g.scale.set(sx, sy, sz);
  g.position.set((hb.min.x + hb.max.x) / 2 + hw * (f.side ?? 0) - sx * (b.min.x + b.max.x) / 2,
    hb.max.y + hh * (f.lift ?? 0) - sy * b.max.y,
    (hb.min.z + hb.max.z) / 2 - hd * (f.back ?? 0) - sz * (b.min.z + b.max.z) / 2);
  const s = (sx + sy + sz) / 3;
  const flash = rig.material.userData.flash;
  const hair = new THREE.Mesh(H.geometry, toonCopy(H.material, flash, rim, false));
  hair.material.side = THREE.DoubleSide; // a shell: its inside shows under the fringe
  hair.castShadow = true;
  const hull = new THREE.Mesh(H.geometry, hairHull(H.material, outline / s, darkness));
  g.add(hair, hull);
  headBone.add(g);
  (rig.skin.hair ||= []).push(g);
}

function hairHull(src, width, darkness) {
  const color = src.map ? new THREE.Color(darkness, darkness, darkness * 1.12) : src.color.clone().multiplyScalar(darkness);
  const m = new THREE.MeshBasicMaterial({ map: src.map, color, side: THREE.BackSide });
  m.userData.rig = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `chibi-hair-hull-${width.toFixed(4)}`;
  return m;
}

/**
 * Add the chibi body to a built driver rig and give the rig syncSkin(). `weapon`/`offhand` are the
 * held kinds (a bow's grip runs along its limbs, +Y; other weapons along +Z, the blade or shaft).
 */
export function attachChibiBody(rig, T, { outline = 0.012, darkness = 0.32, rim = 0.3, weapon = null, offhand = null } = {}) {
  const body = SkeletonUtils.clone(T.scene);
  const flash = rig.material.userData.flash;
  const meshes = [];
  body.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  // a hand closes into its fist only while it holds something: the right with any weapon, the
  // left with an off-hand item or a weapon it also grips (data: fist.leftFistWith)
  const closed = [weapon ? 1 : 0, offhand || T.leftFistWith.includes(weapon) ? 1 : 0];
  for (const mesh of meshes) {
    const src = mesh.material;
    mesh.material = toonCopy(src, flash, rim, false);
    mesh.material.side = THREE.FrontSide; // Meshy marks it double-sided; the body is closed
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.updateMorphTargets();
    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.splice(0, 2, ...closed);
    const hull = new THREE.SkinnedMesh(mesh.geometry, outlineHull(src, outline, darkness));
    hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.frustumCulled = false;
    hull.morphTargetInfluences = mesh.morphTargetInfluences; // the outline closes with the hand
    hull.morphTargetDictionary = mesh.morphTargetDictionary;
    mesh.parent.add(hull);
  }
  rig.root.add(body);
  rig.skin = { body };
  bindSkinSync(rig, body, T);
  // Every frame a holding hand turns (the least it can) until its thumb runs along the weapon's grip
  // axis, so the fist's fingers cross the handle, and the weapon socket moves to the fist's hole.
  // The weapon's direction stays the driver's. A shield or quiver is only seated in the fist.
  // A weapon in `gripMiddle` (a staff) is held at the middle of its length, not at its own grip
  // point: `shift` moves the fist that far along the weapon's axis.
  const axis = (kind) => (kind === 'bow' ? Y : kind && kind !== 'shield' && kind !== 'quiver' ? Z : null);
  const seats = [['RightHand', rig.bones.weapon, weapon], ['LeftHand', rig.bones.offhand, offhand]]
    .map(([n, socket, kind]) => ({ hand: body.getObjectByName(n), socket, along: axis(kind), centre: T.grip[n], thumb: T.thumb[n],
      shift: socket && T.gripMiddle.includes(kind) ? middleOf(socket) : 0 }))
    .filter((e) => e.hand && e.socket);
  rig.gripCenter = T.grip.RightHand;
  // The second hand on a two-handed haft (hero.js sets support.on and support.axis, the haft's
  // world direction): the left hand turns its thumb along the haft like a holding hand, and
  // support.offset gives its fist hole's offset from the wrist, so the animator can put the
  // fist, not the wrist, on the haft.
  const handL = body.getObjectByName('LeftHand');
  rig.support = handL ? { on: false, axis: new THREE.Vector3(0, 0, 1), offset: new THREE.Vector3() } : null;
  const sync = rig.syncSkin;
  rig.syncSkin = () => {
    sync();
    if (rig.support?.on) {
      handL.updateWorldMatrix(true, false);
      handL.getWorldQuaternion(qh);
      qh.premultiply(qt.setFromUnitVectors(seat.copy(T.thumb.LeftHand).applyQuaternion(qh), rig.support.axis));
      handL.quaternion.copy(handL.parent.getWorldQuaternion(qs).invert().multiply(qh));
      handL.updateWorldMatrix(false, false);
      handL.localToWorld(rig.support.offset.copy(T.grip.LeftHand)).sub(handL.getWorldPosition(seat));
    }
    for (const { hand, socket, along, centre, thumb, shift } of seats) {
      hand.updateWorldMatrix(true, false);
      if (along) {
        hand.getWorldQuaternion(qh);
        socket.getWorldQuaternion(qs);
        qh.premultiply(qt.setFromUnitVectors(seat.copy(thumb).applyQuaternion(qh), dir.copy(along).applyQuaternion(qs)));
        hand.quaternion.copy(hand.parent.getWorldQuaternion(qs).invert().multiply(qh));
        hand.updateWorldMatrix(false, false);
      }
      socket.parent.updateWorldMatrix(true, false);
      socket.position.copy(socket.parent.worldToLocal(hand.localToWorld(seat.copy(centre))));
      if (shift) socket.position.sub(seat.set(0, 0, shift).multiply(socket.scale).applyQuaternion(socket.quaternion));
    }
  };
  rig.syncSkin();
  return rig;
}

/** Where along its own +Z axis the middle of a socket's attached weapon lies (socket space). */
function middleOf(socket) {
  socket.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  for (const c of socket.children) box.expandByObject(c);
  return box.isEmpty() ? 0 : socket.worldToLocal(box.getCenter(new THREE.Vector3())).z;
}

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const seat = new THREE.Vector3();
const dir = new THREE.Vector3();
const qh = new THREE.Quaternion();
const qs = new THREE.Quaternion();
const qt = new THREE.Quaternion();
