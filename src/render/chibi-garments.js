// The outfit base (docs/OUTFIT-BASE.md) on the chibi hero: the same garments the HairSample hero
// wears, built from the chibi body itself. A top shell (torso and arms), trousers (the legs), a
// skirt from the waist, boot shafts with the feet, and glove shells (with the fists' morph targets)
// are body regions pushed out along the normals, so they move and close with the body; garments.js
// cuts and paints them from the resolved outfit. Its cuts are in metres of the HairSample body, so
// the chibi's shaders read their bind position and landmarks times SCALE.
import * as THREE from 'three';
import { garmentFrame, garmentUniforms, pieceUniforms, garmentMaterial, garmentHull } from './garments.js';
import { regionShell, skirt } from './base-garments.js';

const BONES = { arm: 'LeftArm', elbow: 'LeftForeArm', hand: 'LeftHand', foot: 'LeftFoot', toe: 'LeftToeBase', neck: 'neck', chest: 'Spine', hips: 'Hips', leg: 'LeftUpLeg', knee: 'LeftLeg' };
/** HairSample metres per chibi metre (hips to ankle 0.89 m against 0.53 m). */
export const SCALE = 1.7;
const TOP_OFF = 0.008; // the top shell's offset from the body (m)
const HULL = 0.006; // garment outline width (m)

/** Garment pieces for the chibi body template T (shared by every rig, cached on T). */
function pieces(T, outfit) {
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
  const out = [
    ['top', regionShell(T, 'chibi-top', (x, y) => (Math.abs(x) > F.shoulder + 0.02 ? Math.abs(x) < F.wrist - 0.012 && y > F.chest - 0.12 : y > F.hips - 0.1 && y < F.neck + 0.008), TOP_OFF)],
    ['pants', regionShell(T, 'chibi-pants', (x, y) => y < F.hips + 0.03 && y > F.ankle - 0.012, 0.005)],
    ['boots', regionShell(T, `chibi-boots:${outfit.boots.len}`, (x, y) => y < len(outfit.boots.len), 0.011), pieceUniforms(outfit.boots)],
  ];
  if (outfit.skirt) out.push(['skirt', skirt(T, F, { length: outfit.skirt.length / SCALE, flare: outfit.skirt.flare / SCALE, opening: outfit.skirt.opening || 0 })]);
  if (outfit.gloves) {
    const g = outfit.gloves.len, from = F.wrist - g * (F.wrist - F.elbow) - 0.01;
    out.push(['gloves', regionShell(T, `chibi-gloves:${g}`, (x, y) => Math.abs(x) > from && y > F.chest - 0.15, 0.004), pieceUniforms(outfit.gloves)]);
  }
  return out;
}

/** Dress a rig's chibi body (attachChibiBody) in a resolved outfit (core/outfit-look.js). */
export function attachChibiGarments(rig, T, outfit) {
  let mesh = null;
  rig.skin.body.traverse((o) => { if (o.isSkinnedMesh && !mesh && !o.userData.garment) mesh = o; });
  if (!mesh || !outfit) return;
  const flash = rig.material.userData.flash, top = garmentUniforms(outfit), FS = T.garmentFrameS || (pieces(T, outfit), T.garmentFrameS);
  // with a skirt, the top ends just inside the skirt's waist, so the two read as one garment
  if (outfit.skirt) top.uCutA.value.z = Math.min(top.uCutA.value.z, 0.03);
  if (outfit.skirt && !(outfit.skirt.opening > 0)) top.uCutC.value.w = outfit.skirt.length * 0.6; // a closed skirt hides the trousers' top
  for (const [kind, geometry, uniforms = top] of pieces(T, outfit)) {
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
    part.castShadow = true;
    const hull = make(garmentHull(kind, FS, uniforms, kind === 'gloves' ? 0.003 : HULL));
    hull.name = part.name + '-outline';
    mesh.parent.add(part, hull);
  }
  rig.outfit = outfit;
}
