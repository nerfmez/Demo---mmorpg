// The outfit base's garments (docs/OUTFIT-BASE.md): the HairSample wardrobe's top, trousers
// and shoes are one shared set of meshes. Each look cuts and paints them in the shader from the
// bind-pose position, with a resolved outfit (core/outfit-look.js): sleeves and hems shorten by
// discarding (the complete base skin is underneath), and the palette lays out main colour,
// sleeves, piping, placket, cuffs, a yoke, sleeve stripes, a pattern, tucked-in boot shafts and
// soles. One program per garment kind; colours and cuts are per-rig uniforms.
import * as THREE from 'three';
import { toonRamp } from './toon.js';

export const PALETTE = ['main', 'sleeve', 'trim', 'accent', 'cuff', 'pattern', 'pants', 'pantsTrim', 'shoes', 'sole'];

/** Bind-space landmarks of a wardrobe mesh, from its skeleton (metres, |x| for the sides). */
export function garmentFrame(mesh) {
  const sk = mesh.skeleton, m = new THREE.Matrix4(), p = new THREE.Vector3();
  const at = (name) => {
    const i = sk.bones.findIndex((b) => b.name === name);
    if (i < 0) throw new Error('garments: missing bone ' + name);
    m.copy(sk.boneInverses[i]).invert();
    return p.setFromMatrixPosition(m).applyMatrix4(mesh.bindMatrixInverse).clone();
  };
  const sh = at('J_Bip_L_UpperArm'), wr = at('J_Bip_L_Hand'), foot = at('J_Bip_L_Foot'), toe = at('J_Bip_L_ToeBase');
  return {
    shoulder: Math.abs(sh.x), shoulderY: sh.y, armZ: sh.z, wrist: Math.abs(wr.x), wristY: wr.y,
    neck: at('J_Bip_C_Neck').y, chest: at('J_Bip_C_UpperChest').y, hips: at('J_Bip_C_Hips').y,
    knee: at('J_Bip_L_LowerLeg').y, ankle: foot.y, front: Math.sign(toe.z - foot.z) || -1,
  };
}

function glsl(kind, F) {
  const f = (v) => v.toFixed(4);
  const head = `
uniform vec3 uPal[10]; uniform vec4 uCutA; uniform vec4 uCutB; uniform vec4 uCutC;
varying vec3 vBind;
// uCutA: sleeve, cuff, hem, trim · uCutB: panel, yoke, stripe, neck · uCutC: pants, boot, pattern
vec3 garmentColor(vec3 p) {
  float x = abs(p.x), y = p.y, fr = p.z * ${f(F.front)}, trim = uCutA.w;
`;
  if (kind === 'hoodie') return head + `
  if (x > ${f(F.shoulder + 0.03)} && y > ${f(F.chest - 0.12)}) {
    float len = ${f(F.wrist - F.shoulder)}, t = (x - ${f(F.shoulder)}) / len;
    if (t > uCutA.x) discard;
    if (uCutA.x < 1.0 && t > uCutA.x - trim / len) return uPal[2];
    if (t > uCutA.y) return t < uCutA.y + trim / len ? uPal[2] : uPal[4];
    float armY = mix(${f(F.shoulderY)}, ${f(F.wristY)}, t);
    if (uCutB.z > 0.0 && y > armY && abs(p.z - ${f(F.armZ)}) < uCutB.z) return uPal[3];
    return uPal[1];
  }
  float hemY = ${f(F.hips)} - uCutA.z;
  if (y < hemY) discard;
  if (y < hemY + trim) return uPal[2];
  if (uCutB.w > 0.0 && fr > 0.02) {
    float v = (y - ${f(F.neck)} + uCutB.w) * 0.55;
    if (x < v) discard;
    if (x < v + trim) return uPal[2];
  }
  if (uCutB.x > 0.0 && fr > 0.0 && x < uCutB.x) return uPal[3];
  if (uCutB.x > 0.0 && fr > 0.0 && x < uCutB.x + trim * 0.6) return uPal[2];
  if (uCutB.y > 0.0 && y > ${f(F.neck)} - uCutB.y) return y < ${f(F.neck)} - uCutB.y + trim * 0.7 ? uPal[2] : uPal[1];
  if (uCutC.z > 0.5 && uCutC.z < 1.5 && (abs(y - hemY - 0.05) < 0.012 || abs(y - hemY - 0.085) < 0.006)) return uPal[5];
  if (uCutC.z > 1.5) {
    vec2 c = vec2(p.x * 22.0 + floor(y * 22.0) * 0.5, y * 22.0);
    if (length(fract(c) - 0.5) < 0.17) return uPal[5];
  }
  return uPal[0];
}
`;
  if (kind === 'pants') return head + `
  float len = ${f(F.hips - F.ankle)}, t = (${f(F.hips)} - y) / len;
  if (t > uCutC.x) discard;
  if (uCutC.x < 1.0 && t > uCutC.x - trim / len) return uPal[7];
  if (t > uCutC.y) return t < uCutC.y + 0.02 ? uPal[9] : uPal[8];
  return uPal[6];
}
`;
  return head + `
  return y < ${f(F.ankle * 0.2)} ? uPal[9] : uPal[8];
}
`;
}

/** Per-rig uniforms for a resolved outfit. */
export function garmentUniforms(outfit) {
  const c = outfit.cut, P = outfit.palette;
  return {
    uPal: { value: PALETTE.map((k) => new THREE.Color(P[k] || '#ff00ff')) },
    uCutA: { value: new THREE.Vector4(c.sleeve, c.cuff, c.hem, c.trim) },
    uCutB: { value: new THREE.Vector4(c.panel, c.yoke, c.stripe, c.neck) },
    uCutC: { value: new THREE.Vector4(c.pants, c.boot, c.pattern, 0) },
  };
}

const bindVarying = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
};

/** A garment's toon material: the base garment painted and cut by the outfit uniforms. */
export function garmentMaterial(kind, frame, uniforms, flash, rim = 0.3) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp(), side: THREE.DoubleSide });
  m.userData.rig = true; // one per rig: freed with the rig
  const code = glsl(kind, frame);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uFlash: flash, uRim: { value: rim } });
    bindVarying(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlash; uniform float uRim;' + code)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= garmentColor(vBind);')
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
  m.customProgramCacheKey = () => 'garment-' + kind;
  return m;
}

/** Its outline hull: same cut, the garment colour darkened (same-hue outlines). */
export function garmentHull(kind, frame, uniforms, width = 0.01, darkness = 0.32) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  m.userData.rig = true;
  const code = glsl(kind, frame);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    bindVarying(shader);
    shader.vertexShader = shader.vertexShader.replace('vBind = position;', `vBind = position;\ntransformed += normalize(normal) * ${width.toFixed(4)};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + code)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = garmentColor(vBind) * ${darkness.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => 'garment-hull-' + kind;
  return m;
}
