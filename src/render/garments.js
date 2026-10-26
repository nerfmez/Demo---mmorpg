// The outfit base's garments (docs/OUTFIT-BASE.md): the HairSample wardrobe's top, trousers
// and shoes are one shared set of meshes. Each look cuts and paints them in the shader from the
// bind-pose position, with a resolved outfit (core/outfit-look.js): sleeves and hems shorten by
// discarding (the complete base skin is underneath), and the palette lays out main colour,
// sleeves, piping, placket, cuffs, a yoke, sleeve stripes, a pattern, tucked-in boot shafts and
// soles. One program per garment kind; colours and cuts are per-rig uniforms.
import * as THREE from 'three';
import { toonRamp } from './toon.js';

export const PALETTE = ['main', 'sleeve', 'trim', 'accent', 'cuff', 'pattern', 'pants', 'pantsTrim', 'shoes', 'sole'];

const VRM_BONES = {
  arm: 'J_Bip_L_UpperArm', elbow: 'J_Bip_L_LowerArm', hand: 'J_Bip_L_Hand', foot: 'J_Bip_L_Foot', toe: 'J_Bip_L_ToeBase',
  neck: 'J_Bip_C_Neck', chest: 'J_Bip_C_UpperChest', hips: 'J_Bip_C_Hips', leg: 'J_Bip_L_UpperLeg', knee: 'J_Bip_L_LowerLeg',
};

/**
 * Bind-space landmarks of a wardrobe mesh, from its skeleton (metres, |x| for the sides).
 * `bones` names the skeleton's bones (VRM names by default); `scale` multiplies every landmark,
 * for a body much smaller than the one the cuts were made for (the chibi), whose shader then
 * reads its bind position times the same scale. `unit` converts the skeleton's units to the
 * mesh's (the chibi's bones are in centimetres of its armature, its mesh in metres).
 */
export function garmentFrame(mesh, bones = VRM_BONES, scale = 1, unit = 1) {
  const sk = mesh.skeleton, m = new THREE.Matrix4(), p = new THREE.Vector3();
  const at = (name) => {
    const i = sk.bones.findIndex((b) => b.name === name);
    if (i < 0) throw new Error('garments: missing bone ' + name);
    m.copy(sk.boneInverses[i]).invert();
    return p.setFromMatrixPosition(m).applyMatrix4(mesh.bindMatrixInverse).multiplyScalar(unit).clone();
  };
  const B = bones, sh = at(B.arm).multiplyScalar(scale), el = at(B.elbow).multiplyScalar(scale), wr = at(B.hand).multiplyScalar(scale);
  const foot = at(B.foot).multiplyScalar(scale), toe = at(B.toe).multiplyScalar(scale), leg = at(B.leg).multiplyScalar(scale), knee = at(B.knee).multiplyScalar(scale);
  return {
    shoulder: Math.abs(sh.x), shoulderY: sh.y, armZ: sh.z, elbow: Math.abs(el.x), wrist: Math.abs(wr.x), wristY: wr.y,
    neck: at(B.neck).y * scale, chest: at(B.chest).y * scale, hips: at(B.hips).y * scale,
    knee: knee.y, ankle: foot.y, front: Math.sign(toe.z - foot.z) || -1, leftSign: Math.sign(sh.x) || -1,
    // the leg's centre line (hip joint, knee, ankle) for the trousers' designs
    legX: Math.abs(leg.x), kneeX: Math.abs(knee.x), ankleX: Math.abs(foot.x), legZ: leg.z, kneeZ: knee.z, ankleZ: foot.z, scale,
  };
}

const KINDS = ['top', 'skirt', 'pants', 'shoes', 'boots', 'gloves'];

/**
 * One shader for every garment kind (one program pair in all, so equipping or previewing an
 * outfit compiles nothing new): each kind is its own function, uKind picks one.
 */
function glslAll(F) {
  const fns = KINDS.map((k, i) => glsl(k, F).replace('vec3 garmentColor(vec3 p) {', `vec3 garment${i}(vec3 p) {`)).join('');
  return `
uniform vec3 uPal[10]; uniform vec4 uCutA; uniform vec4 uCutB; uniform vec4 uCutC; uniform vec4 uCutD; uniform float uKind;
varying vec3 vBind;
// uCutA: sleeve, cuff, hem, trim · uCutB: panel, yoke, stripe, neck · uCutC: pants, boot, pattern
// uCutD: skirt length or boots/gloves length, skirt opening (radians either side of the front), trousers design
${fns}
vec3 garmentColor(vec3 p) {
${KINDS.map((k, i) => `  ${i ? 'else ' : ''}if (uKind < ${i}.5) return garment${i}(p);`).join('\n')}
  return garment${KINDS.length - 1}(p);
}
`;
}

function glsl(kind, F) {
  const f = (v) => v.toFixed(4);
  const head = `
vec3 garmentColor(vec3 p) {
  float x = abs(p.x), y = p.y, fr = p.z * ${f(F.front)}, trim = uCutA.w;
`;
  if (kind === 'gloves') return head + `
  float len = ${f(F.wrist - F.elbow)}, t = (x - ${f(F.elbow)}) / len, top = 1.0 - uCutD.x;
  if (t < top + 0.07) return uPal[2];
  if (uCutC.z > 2.5 && (t < 1.0 ? fract(t * 4.0) < 0.12 : fract((x - ${f(F.wrist)}) / 0.032) < 0.2)) return uPal[2];
  if (uCutC.z > 1.5 && uCutC.z < 2.5 && t < top + 0.32) return length(fract(vec2(x, y) * 45.0) - 0.5) < 0.2 ? uPal[3] : uPal[2];
  if (uCutC.z > 0.5 && uCutC.z < 1.5) {
    if (t > 1.05 && t < 1.2 && y > ${f(F.wristY)} && abs(p.z - ${f(F.armZ)}) < 0.016) return uPal[3];
    if (fract(x / 0.026) < 0.2) return uPal[2];
  }
  return uPal[0];
}
`;
  if (kind === 'boots') return head + `
  float t = (y - ${f(F.ankle)}) / ${f(F.knee - F.ankle)};
  if (y < ${f(F.ankle * 0.4)}) return uPal[9];
  if (t > uCutD.x - 0.09) return uPal[2];
  if (uCutC.z > 2.5 && fract(t * 5.0) < 0.12) return uPal[2];
  if (uCutC.z > 0.5 && uCutC.z < 1.5 && fr > 0.035 && fract(y / 0.035) < 0.3) return uPal[3];
  return uPal[0];
}
`;
  if (kind === 'skirt') return head + `
  float hemY = ${f(F.hips - 0.02)} - uCutD.x, a = atan(p.x, fr);
  if (y < hemY + trim * 1.4) return uPal[2];
  if (uCutD.y > 0.0 && abs(a) < uCutD.y + 0.1) return uPal[2];
  if (uCutB.x > 0.0 && fr > 0.0 && x < uCutB.x * 1.4) return x < uCutB.x * 1.4 - trim ? uPal[3] : uPal[2];
  if (uCutC.z > 0.5 && uCutC.z < 1.5 && (abs(y - hemY - 0.05) < 0.012 || abs(y - hemY - 0.085) < 0.006)) return uPal[5];
  if (uCutC.z > 2.5 && fract((y - hemY) / 0.07) < 0.12) return uPal[2];
  if (uCutC.z > 2.5 && abs(fract(a / 0.42) - 0.5) < 0.03) return uPal[2];
  return uPal[0];
}
`;
  if (kind === 'top') return head + `
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
  if (uCutC.z > 2.5) {
    if (fract((y - hemY) / 0.075) < 0.1 && y < ${f(F.chest + 0.02)}) return uPal[2];
  } else if (uCutC.z > 1.5) {
    vec2 c = vec2(p.x * 22.0 + floor(y * 22.0) * 0.5, y * 22.0);
    if (length(fract(c) - 0.5) < 0.17) return uPal[5];
  }
  return uPal[0];
}
`;
  if (kind === 'pants') return head + `
  float len = ${f(F.hips - F.ankle)}, t = (${f(F.hips)} - y) / len;
  if (t > uCutC.x) discard;
  // under a skirt (uCutC.w: how far down it hides the legs, the chibi), the trousers' top is
  // never seen and would push through the skirt as the thighs swing
  if (uCutC.w > 0.0 && y > ${f(F.hips)} - uCutC.w) discard;
  if (uCutC.x < 1.0 && t > uCutC.x - trim / len) return uPal[7];
  if (t > uCutC.y) return t < uCutC.y + 0.02 ? uPal[9] : uPal[8];
  // the leg's centre line at this height: hip joint to knee to ankle
  float k = clamp((${f(F.hips)} - y) / ${f(F.hips - F.knee)}, 0.0, 1.0), s = clamp((${f(F.knee)} - y) / ${f(F.knee - F.ankle)}, 0.0, 1.0);
  float cx = y > ${f(F.knee)} ? mix(${f(F.legX)}, ${f(F.kneeX)}, k) : mix(${f(F.kneeX)}, ${f(F.ankleX)}, s);
  float cz = (y > ${f(F.knee)} ? mix(${f(F.legZ)}, ${f(F.kneeZ)}, k) : mix(${f(F.kneeZ)}, ${f(F.ankleZ)}, s)) * ${f(F.front)};
  float dx = x - cx, dz = fr - cz, d = uCutD.z;
  // trousers designs, in the outfit's own trim (uPal[2]) and accent (uPal[3]) colours:
  // 1 a stripe down the outer side, 2 leg wraps criss-crossing the shins, 3 knee guards and thigh
  // plates, 4 a deep cuff and a knee patch
  if (d > 0.5 && d < 1.5 && dx > 0.0 && abs(dz) < trim * 1.6) return uPal[2];
  if (d > 1.5 && d < 2.5 && y < ${f(F.knee + 0.03 * F.scale)} && t < uCutC.x - 0.06) {
    float u = (y + dx * 0.7 + dz * 0.7) / ${f(0.05 * F.scale)}, v = (y - dx * 0.7 - dz * 0.7) / ${f(0.05 * F.scale)};
    if (fract(u) < 0.2 || fract(v) < 0.2) return uPal[2];
  }
  if (d > 2.5 && d < 3.5 && dz > 0.0) {
    float ky = abs(y - ${f(F.knee)});
    if (ky < ${f(0.05 * F.scale)}) return ky > ${f(0.038 * F.scale)} ? uPal[2] : uPal[3];
    if (y > ${f(F.knee)} && fract((y - ${f(F.knee)}) / ${f(0.07 * F.scale)}) < 0.12) return uPal[2];
  }
  if (d > 3.5 && d < 4.5) {
    if (t > uCutC.x - 0.1) return t < uCutC.x - 0.085 ? uPal[3] : uPal[2];
    if (dz > 0.0 && abs(y - ${f(F.knee)}) < ${f(0.045 * F.scale)}) return uPal[2];
  }
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
    uCutC: { value: new THREE.Vector4(c.pants, 5, c.pattern, 0) },
    uCutD: { value: new THREE.Vector4(outfit.skirt?.length || 0, outfit.skirt?.opening || 0, outfit.trousers?.pattern || 0, 0) },
  };
}

/** Uniforms for a boots or gloves piece (resolveOutfit boots/gloves): main, trim, accent, sole. */
export function pieceUniforms(piece) {
  const P = piece.palette, pal = PALETTE.map(() => new THREE.Color(P.main));
  pal[2].set(P.trim); pal[3].set(P.accent || P.trim); pal[9].set(P.sole || P.trim);
  return {
    uPal: { value: pal },
    uCutA: { value: new THREE.Vector4(1, 2, 0, 0.012) },
    uCutB: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCutC: { value: new THREE.Vector4(1, 5, piece.pattern || 0, 0) },
    uCutD: { value: new THREE.Vector4(piece.len, 0, 0, 0) },
  };
}

const bindVarying = (shader, scale = 1) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nvBind = position * ${scale.toFixed(4)};`);
};

/** A garment's toon material: the base garment painted and cut by the outfit uniforms. */
export function garmentMaterial(kind, frame, uniforms, flash, rim = 0.3) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp(), side: THREE.DoubleSide });
  m.userData.rig = true; // one per rig: freed with the rig
  const code = glslAll(frame);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uFlash: flash, uRim: { value: rim }, uKind: { value: KINDS.indexOf(kind) } });
    bindVarying(shader, frame.scale || 1);
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
  m.customProgramCacheKey = () => 'garment' + (frame.scale && frame.scale !== 1 ? '-' + frame.scale.toFixed(3) : ''); // the frame is baked into the code
  return m;
}

/** Its outline hull: same cut, the garment colour darkened (same-hue outlines). */
export function garmentHull(kind, frame, uniforms, width = 0.01, darkness = 0.32) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  m.userData.rig = true;
  const code = glslAll(frame);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uKind: { value: KINDS.indexOf(kind) }, hullWidth: { value: width }, hullDarkness: { value: darkness } });
    bindVarying(shader, frame.scale || 1);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float hullWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * hullWidth;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float hullDarkness;\n' + code)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = garmentColor(vBind) * hullDarkness;');
  };
  // one program for every width and darkness (uniforms); the bind scale is in the source
  m.customProgramCacheKey = () => 'garment-hull' + (frame.scale && frame.scale !== 1 ? '-' + frame.scale.toFixed(3) : '');
  return m;
}
