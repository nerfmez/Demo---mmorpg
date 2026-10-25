// The outfit base (docs/OUTFIT-BASE.md) on the chibi hero: the same garments the HairSample hero
// wears, built from the chibi body itself. A top shell (torso and arms), trousers (the legs), a
// skirt from the waist, boot shafts with the feet, and glove shells (with the fists' morph targets)
// are body regions pushed out along the normals, so they move and close with the body; garments.js
// cuts and paints them from the resolved outfit. Its cuts are in metres of the HairSample body, so
// the chibi's shaders read their bind position and landmarks times SCALE.
// An armour or boots item with its own modelled outfit (data/models.json `chibiOutfit`, made by
// scripts/fit-chibi-outfit.py) wears that model instead of the shells it replaces, and hides the
// body faces the model covers so the skin cannot poke through it.
import * as THREE from 'three';
import { garmentFrame, garmentUniforms, pieceUniforms, garmentMaterial, garmentHull } from './garments.js';
import { regionShell, skirt } from './base-garments.js';
import { toonCopy } from './vrm-body.js';
import { chibiOutline, paintedLight } from './chibi-body.js';

const BONES = { arm: 'LeftArm', elbow: 'LeftForeArm', hand: 'LeftHand', foot: 'LeftFoot', toe: 'LeftToeBase', neck: 'neck', chest: 'Spine', hips: 'Hips', leg: 'LeftUpLeg', knee: 'LeftLeg' };
/** HairSample metres per chibi metre (hips to ankle 0.89 m against 0.53 m). */
export const SCALE = 1.7;
const TOP_OFF = 0.008; // the top shell's offset from the body (m)
const HULL = 0.006; // garment outline width (m)

/** Garment pieces for the chibi body template T (shared by every rig, cached on T), less `skip`. */
function pieces(T, outfit, skip = new Set()) {
  if (!T.garment) {
    let body = null;
    T.scene.traverse((o) => { if (o.isSkinnedMesh && !body) body = o; });
    T.garment = { body, bones: { hips: 'Hips', legL: 'LeftUpLeg', legR: 'RightUpLeg' }, size: 1 / SCALE, fitDown: true, margin: TOP_OFF + HULL + 0.003 }; // outside the top and its outline
    // its bones are in the armature's centimetres, its mesh in metres
    const raw = garmentFrame(body, BONES, 1);
    const cm = raw.hips > 5 ? 0.01 : 1;
    T.garmentFrame0 = garmentFrame(body, BONES, 1, cm); // chibi metres, for cutting the shells
    T.garmentFrameS = garmentFrame(body, BONES, SCALE, cm); // for the shaders
  }
  const F = T.garmentFrame0, len = (l) => F.ankle + l * (F.knee - F.ankle);
  const out = [];
  if (!skip.has('top')) out.push(['top', regionShell(T, 'chibi-top', (x, y) => (Math.abs(x) > F.shoulder + 0.02 ? Math.abs(x) < F.wrist - 0.012 && y > F.chest - 0.12 : y > F.hips - 0.1 && y < F.neck + 0.008), TOP_OFF)]);
  if (!skip.has('pants')) out.push(['pants', regionShell(T, 'chibi-pants', (x, y) => y < F.hips + 0.03 && y > F.ankle - 0.012, 0.005)]);
  if (!skip.has('boots')) out.push(['boots', regionShell(T, `chibi-boots:${outfit.boots.len}`, (x, y) => y < len(outfit.boots.len), 0.011), pieceUniforms(outfit.boots)]);
  if (outfit.skirt && !skip.has('skirt')) out.push(['skirt', skirt(T, F, { length: outfit.skirt.length / SCALE, flare: outfit.skirt.flare / SCALE, opening: outfit.skirt.opening || 0 })]);
  if (outfit.gloves) {
    const g = outfit.gloves.len, from = F.wrist - g * (F.wrist - F.elbow) - 0.01;
    out.push(['gloves', regionShell(T, `chibi-gloves:${g}`, (x, y) => Math.abs(x) > from && y > F.chest - 0.15, 0.004), pieceUniforms(outfit.gloves)]);
  }
  return out;
}

/**
 * A modelled outfit piece (data/models.json characters with `chibiOutfit`: "armor" or "boots"): one
 * skinned mesh on the chibi's armature, with the body triangles it covers (node extras `hideBody`).
 */
export function prepareChibiOutfit(gltf, m) {
  gltf.scene.updateMatrixWorld(true);
  if (m.chibiOutfit === 'helm') return prepareChibiHelm(gltf, m);
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error(m.file + ': no skinned mesh');
  const geometry = mesh.geometry;
  geometry.setAttribute('outlineScale', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1), 1));
  geometry.userData.shared = true;
  if (mesh.material.map) mesh.material.map.userData.shared = true;
  return { piece: m.chibiOutfit, geometry, bind: bindSpace(mesh), bones: mesh.skeleton.bones.map((b) => b.name), map: mesh.material.map,
    hide: JSON.parse(mesh.userData.hideBody || '[]'), outline: m.outline ?? 0.008, fitted: null };
}

/**
 * A modelled helm (`chibiOutfit` "helm"): a plain mesh of the headwear with the hair the sheet draws
 * under it, in the frame the hero's hair model is fitted in (attachChibiHair places it the same way);
 * `withHair`: only a band worn over the hair, drawn on top of the hero's own hair.
 */
function prepareChibiHelm(gltf, m) {
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error(m.file + ': no mesh');
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.userData.shared = true;
  if (mesh.material.map) mesh.material.map.userData.shared = true;
  return { piece: 'helm', geometry, withHair: !!m.withHair, material: { map: mesh.material.map, color: new THREE.Color(1, 1, 1), side: THREE.DoubleSide } };
}

/** A skinned mesh's bind map from its geometry to world space (read through its Hips bone, which no rest pose turns). */
function bindSpace(mesh) {
  const hips = mesh.skeleton.bones.findIndex((b) => b.name === 'Hips');
  const bone = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.bones[hips].matrixWorld, mesh.skeleton.boneInverses[hips]);
  return mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse).multiply(bone).multiply(mesh.bindMatrix);
}

/** The outfit geometry in the body's own bind space, its bones the body skeleton's (cached on the outfit). */
function fitOutfit(O, body) {
  if (O.fitted) return O.fitted;
  const g = O.geometry.clone();
  g.applyMatrix4(bindSpace(body).invert().multiply(O.bind));
  const names = body.skeleton.bones.map((b) => b.name), si = g.attributes.skinIndex;
  const to = O.bones.map((n) => Math.max(0, names.indexOf(n)));
  for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) si.setComponent(i, k, to[si.getComponent(i, k)]);
  g.userData.shared = true;
  O.fitted = g;
  return g;
}

/** The body geometry less the triangles the worn outfit models cover (cached on T per outfit). */
function coveredBody(T, src, models) {
  const key = models.map((O) => O.piece + ':' + O.hide.length).join('|');
  T.covered ??= new Map();
  if (!T.covered.has(key)) {
    const hide = new Set(models.flatMap((O) => O.hide)), ix = src.index.array, keep = [];
    for (let t = 0; t < ix.length / 3; t++) if (!hide.has(t)) keep.push(ix[3 * t], ix[3 * t + 1], ix[3 * t + 2]);
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
    g.morphAttributes = src.morphAttributes;
    g.morphTargetsRelative = src.morphTargetsRelative;
    g.setIndex(keep);
    g.boundingSphere = src.boundingSphere;
    g.userData.shared = true;
    T.covered.set(key, g);
  }
  return T.covered.get(key);
}

/**
 * Dress a rig's chibi body (attachChibiBody) in a resolved outfit (core/outfit-look.js).
 * `models` holds the loaded outfit models of the worn armour and boots ({armor, boots}, either null).
 */
export function attachChibiGarments(rig, T, outfit, models = {}) {
  let mesh = null;
  rig.skin.body.traverse((o) => { if (o.isSkinnedMesh && !mesh && !o.userData.garment) mesh = o; });
  if (!mesh || !outfit) return;
  const worn = [models.armor, models.boots].filter(Boolean);
  if (worn.length) {
    const src = mesh.geometry, body = coveredBody(T, src, worn);
    rig.skin.body.traverse((o) => { if (o.isSkinnedMesh && o.geometry === src) o.geometry = body; });
    for (const O of worn) {
      const geometry = fitOutfit(O, mesh);
      const make = (material) => {
        const m = new THREE.SkinnedMesh(geometry, material);
        m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
        m.bind(mesh.skeleton, mesh.bindMatrix);
        m.frustumCulled = false;
        m.userData.garment = O.piece;
        return m;
      };
      const part = make(paintedLight(toonCopy({ map: O.map, side: THREE.DoubleSide }, rig.material.userData.flash, 0.3, false), T.paintedLight));
      part.name = 'Outfit-' + O.piece;
      part.castShadow = true;
      part.receiveShadow = true; // like the body it covers
      const hull = make(chibiOutline(O.map, O.outline, 0.32));
      hull.name = part.name + '-outline';
      mesh.parent.add(part, hull);
    }
  }
  const skip = new Set([...(models.armor ? ['top', 'pants', 'skirt'] : []), ...(models.boots ? ['boots'] : [])]);
  const flash = rig.material.userData.flash, top = garmentUniforms(outfit), FS = T.garmentFrameS || (pieces(T, outfit, new Set(['top', 'pants', 'boots', 'skirt'])), T.garmentFrameS);
  // with a skirt, the top ends just inside the skirt's waist, so the two read as one garment
  if (outfit.skirt) top.uCutA.value.z = Math.min(top.uCutA.value.z, 0.03);
  if (outfit.skirt && !(outfit.skirt.opening > 0)) top.uCutC.value.w = outfit.skirt.length * 0.6; // a closed skirt hides the trousers' top
  for (const [kind, geometry, uniforms = top] of pieces(T, outfit, skip)) {
    const make = (material) => {
      const m = new THREE.SkinnedMesh(geometry, material);
      m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
      m.bind(mesh.skeleton, mesh.bindMatrix);
      m.frustumCulled = false;
      m.userData.garment = kind;
      if (geometry.morphAttributes.position) { m.updateMorphTargets(); m.morphTargetInfluences = mesh.morphTargetInfluences; } // gloves close with the fists
      return m;
    };
    const part = make(garmentMaterial(kind, FS, uniforms, flash));
    part.name = 'Garment-' + kind;
    part.castShadow = part.receiveShadow = true; // like the body: the outfit takes the world's shadows
    const hull = make(garmentHull(kind, FS, uniforms, kind === 'gloves' ? 0.003 : HULL));
    hull.name = part.name + '-outline';
    mesh.parent.add(part, hull);
  }
  rig.outfit = outfit;
}
