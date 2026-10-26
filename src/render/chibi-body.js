// A chibi body made with Meshy (data/models.json → characters.hero_chibi), the hero's skinned
// body (?hero=classic keeps the earlier HairSample hero). Its skeleton has the same
// Mixamo-like names as hero_base, so it reuses the driver-bone retarget of skinned.js
// (bindSkinSync with MAP). It keeps its own painted texture (face, suit, boots); materials are
// swapped for the game's 3-step toon ramp, rim light, hit flash and outline hull (vrm-body.js).
// Meshy exports split, faceted normals, which the toon ramp turns into blotches on the round
// head, so the normals are welded and smoothed once at load.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { bindSkinSync, MAP } from './skinned.js';
import { toonCopy } from './vrm-body.js';

// The chibi is the game's hero (the owner's sheet). ?hero=classic keeps the earlier HairSample body
// and ?hero=vrm the VRM one, for comparison.
export const heroParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hero') : null;
export const useChibi = typeof location !== 'undefined' && heroParam !== 'classic' && heroParam !== 'vrm';

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
 * eyes shorter (`chin`) and fuller at the cheeks (`cheek`), and the whole head scaled about its
 * base on the neck (`scale`). Works in the model's world bind
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
  const k = shape.scale ?? 1, joint = new THREE.Vector3(c.x, box.min.y, c.z); // the head's base, on the neck
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
    // `scale`: the whole head smaller (or larger) about its base, so it stays on the neck
    if (k !== 1) v.sub(joint).multiplyScalar(1 + (k - 1) * w[i]).add(joint);
    v.applyMatrix4(toMesh);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  if (k !== 1) c.sub(joint).multiplyScalar(k).add(joint);
  return { centre: c.applyMatrix4(toMesh), w };
}

/**
 * Face coordinates for the drawn face shadow (`faceShadow`): a `face` attribute per vertex with
 * the head's across (-1 right .. 1 left of the model, its +X), up (0 chin .. 1 crown) and a mask
 * that is 1 on the front of the head (from `from` to `to` of the way forward) and 0 elsewhere.
 */
function addFaceCoords(mesh, w, { from, to }) {
  const geo = mesh.geometry, pos = geo.attributes.position, toWorld = mesh.matrixWorld;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) if (w[i] > 0.5) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(toWorld));
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const face = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    if (!w[i]) continue;
    v.fromBufferAttribute(pos, i).applyMatrix4(toWorld);
    const fwd = (v.z - c.z) / (size.z / 2);
    face[i * 3] = (v.x - c.x) / (size.x / 2);
    face[i * 3 + 1] = (v.y - box.min.y) / size.y;
    face[i * 3 + 2] = w[i] * THREE.MathUtils.smoothstep(fwd, from, to);
  }
  geo.setAttribute('face', new THREE.BufferAttribute(face, 3));
}

/**
 * The drawn face shadow, the anime-game trick (a face shadow map): on the face the toon ramp does not
 * read the mesh normal (the nose and cheeks would cut bands across it) but where the light stands
 * around the head. Light from the front lights the whole face; as it swings to one side a single
 * soft-edged shadow sweeps in from the far cheek, bowed around the nose (`curve`). The head's axes
 * reach the shader each frame from the head bone (in view space, like the light).
 */
function faceShadowMaterial(m, headBone, bindQuat, { curve }) {
  const u = { uHeadR: { value: new THREE.Vector3(1, 0, 0) }, uHeadF: { value: new THREE.Vector3(0, 0, 1) }, uFaceCurve: { value: curve } };
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 face; varying vec3 vFace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = face;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <gradientmap_pars_fragment>', `
uniform vec3 uHeadR; uniform vec3 uHeadF; uniform float uFaceCurve; varying vec3 vFace;
#ifdef USE_GRADIENTMAP
uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float dotNL = dot( normal, lightDirection );
  if ( vFace.z > 0.001 ) {
    float lx = dot( lightDirection, uHeadR ), lz = dot( lightDirection, uHeadF );
    // how far round the head the light has swung (0 in front, PI behind); light from straight
    // above or below counts as in front
    float th = atan( abs( lx ), lz ) * smoothstep( 0.05, 0.35, length( vec2( lx, lz ) ) );
    float across = lx >= 0.0 ? vFace.x : -vFace.x;
    float y = vFace.y - 0.45;
    float edge = -1.15 * cos( th ) + uFaceCurve * ( 1.0 - 4.0 * y * y ) * sin( th );
    float d = across - edge;
    float fw = fwidth( d ) + 0.02;
    float faceNL = mix( -0.5, 0.75, smoothstep( -fw, fw, d ) );
    dotNL = mix( dotNL, faceNL, vFace.z );
  }
  vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
  #ifdef USE_GRADIENTMAP
    return vec3( texture2D( gradientMap, coord ).r );
  #else
    return vec3( coord.x > 0.7 ? 1.0 : 0.7 );
  #endif
}`);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => key() + '-chibi-face';
  const q = new THREE.Quaternion(), inv = bindQuat.clone().invert(), view = new THREE.Matrix4();
  return (camera) => {
    headBone.getWorldQuaternion(q).multiply(inv);
    view.copy(camera.matrixWorldInverse);
    u.uHeadR.value.set(1, 0, 0).applyQuaternion(q).transformDirection(view);
    u.uHeadF.value.set(0, 0, 1).applyQuaternion(q).transformDirection(view);
  };
}

/**
 * A drawn face (the look's face, protocol.js FACES) laid over the painted one, by the face coordinates
 * of the face shadow (addFaceCoords): its picture spans `width` either side of the head's middle (in
 * those coordinates' half widths) and from `v0` of the way down from the head's `top` to its `chin`
 * (heights in them) to the chin. On the front of the face the painted features (texels far from the
 * `skin` colour) give way to that skin first, then the drawn face goes on top. The same goes for the
 * painted-light glow. `texture` may still be loading (null): the painted face shows until it arrives.
 */
function faceDecalMaterial(m, texture, { width, top, chin, v0, skin }) {
  const base = m.onBeforeCompile;
  const u = { uFaceTex: { value: texture }, uFaceFrame: { value: new THREE.Vector4(width, top, chin, v0) }, uFaceSkin: { value: new THREE.Color().setRGB(skin[0] / 255, skin[1] / 255, skin[2] / 255, THREE.SRGBColorSpace) } };
  m.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uFaceTex; uniform vec4 uFaceFrame; uniform vec3 uFaceSkin;`)
      .replace('void main() {', `vec3 faceDecal( vec3 base ) {
  if ( vFace.z < 0.05 ) return base;
  float u = vFace.x / ( 2.0 * uFaceFrame.x ) + 0.5, t = ( uFaceFrame.y - vFace.y ) / ( uFaceFrame.y - uFaceFrame.z );
  float v = ( t - uFaceFrame.w ) / ( 1.0 - uFaceFrame.w );
  float k = smoothstep( 0.2, 0.6, vFace.z ) * smoothstep( 0.0, 0.04, u ) * smoothstep( 1.0, 0.96, u ) * smoothstep( -0.06, 0.0, v ) * step( v, 1.05 );
  vec3 c = mix( base, uFaceSkin, k * smoothstep( 0.05, 0.2, distance( base, uFaceSkin ) ) );
  vec4 d = texture2D( uFaceTex, vec2( u, 1.0 - clamp( v, 0.0, 1.0 ) ) );
  return mix( c, d.rgb, d.a * k * step( 0.0, v ) * step( v, 1.0 ) );
}
void main() {`)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = faceDecal( diffuseColor.rgb );')
      .replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
  totalEmissiveRadiance *= faceDecal( texture2D( emissiveMap, vEmissiveMapUv ).rgb );
#endif`);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => key() + '-chibi-face-decal';
}

/**
 * The hair's highlight band (`highlight`), the anime "angel ring": a jagged lighter band at height
 * `at` (0 bottom .. 1 top of the hair model) and `width` thick, on the side of the hair facing the
 * camera, brightening it by `strength`.
 */
function hairHighlightMaterial(m, box, { at, width, strength }) {
  const base = m.onBeforeCompile;
  const u = { uHlBox: { value: new THREE.Vector4(box.min.y, box.max.y, (box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2) }, uHl: { value: new THREE.Vector3(at, width, strength) } };
  m.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHairPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHairPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uHlBox; uniform vec3 uHl; varying vec3 vHairPos;')
      .replace('#include <opaque_fragment>', `{
  float t = ( vHairPos.y - uHlBox.x ) / ( uHlBox.y - uHlBox.x );
  float a = atan( vHairPos.x - uHlBox.z, vHairPos.z - uHlBox.w );
  float jag = 0.03 * sin( a * 13.0 ) + 0.015 * sin( a * 29.0 + 1.3 );
  float band = 1.0 - smoothstep( uHl.y * 0.45, uHl.y, abs( t - uHl.x - jag ) );
  float facing = smoothstep( 0.25, 0.6, dot( normalize( normal ), normalize( vViewPosition ) ) );
  outgoingLight = mix( outgoingLight, outgoingLight * 1.25 + 0.12, band * facing * uHl.z );
}
#include <opaque_fragment>`);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => key() + '-chibi-hair-hl';
}

/**
 * The hair in the look's colour (`color`, any hex): the painted texture is a light grey hair, so its
 * brightness over that grey's (`HAIR_GREY`) scales the colour: shade and strand lines darken it and
 * the painted highlights lift it toward white. Applied to the texel of both the lit colour and the
 * painted-light glow (and the outline hull's).
 */
const HAIR_GREY = 0.8;
const HAIR_TINT = `
vec3 hairTint( vec3 t ) {
  float k = dot( t, vec3( 0.299, 0.587, 0.114 ) ) / ${HAIR_GREY.toFixed(2)};
  return k <= 1.0 ? uHairColor * k : mix( uHairColor, vec3( 1.0 ), clamp( ( k - 1.0 ) * 2.5, 0.0, 1.0 ) );
}`;
function hairColorMaterial(m, color) {
  const base = m.onBeforeCompile, u = { value: new THREE.Color(color) };
  m.userData.hairColor = u; // the creation menu's colour wheel sets it live while dragging
  m.onBeforeCompile = (shader, renderer) => {
    base?.call(m, shader, renderer);
    shader.uniforms.uHairColor = u;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uHairColor;${HAIR_TINT}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = hairTint( diffuseColor.rgb );')
      .replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
  totalEmissiveRadiance *= hairTint( texture2D( emissiveMap, vEmissiveMapUv ).rgb );
#endif`);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => (key ? key.call(m) : '') + '-chibi-hair-color';
  return m;
}

/**
 * Flatten bulges of the bind torso (`flatten`: a list of bands from `y0` to `y1`, each moving the
 * surface beyond depth `z` back toward it by up to `k`, most at the band's middle; `z` above 0 is
 * the front, below 0 the back). The Meshy body has a bust and round hips, but the sheet's chibi is a
 * boy with a straight torso. Arm vertices are left alone.
 */
function flattenBody(mesh, bands) {
  const pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const arm = new Set(mesh.skeleton.bones.map((b, i) => (/Shoulder|Arm|Hand/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  // the bind skin (the armature's 0.01 scale and the bone inverses) maps mesh space to metres by one
  // affine map: measure it from four vertices, so the bands can be given in metres
  const at = (i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  const ids = [0, 1, 2, 3].map((n) => Math.floor((n * pos.count) / 4));
  const l0 = new THREE.Vector3().fromBufferAttribute(pos, ids[0]), w0 = at(ids[0]);
  const dl = ids.slice(1).map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).sub(l0));
  const dw = ids.slice(1).map((i) => at(i).sub(w0));
  const L = new THREE.Matrix3().set(dl[0].x, dl[1].x, dl[2].x, dl[0].y, dl[1].y, dl[2].y, dl[0].z, dl[1].z, dl[2].z);
  const Wm = new THREE.Matrix3().set(dw[0].x, dw[1].x, dw[2].x, dw[0].y, dw[1].y, dw[2].y, dw[0].z, dw[1].z, dw[2].z);
  const toMesh = L.multiply(Wm.invert()), v = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let w = 1;
    for (let c = 0; c < 4; c++) if (arm.has(si.getComponent(i, c))) w -= sw.getComponent(i, c);
    if (w <= 0) continue;
    v.copy(at(i));
    const z0 = v.z;
    let moved = false;
    for (const { y0, y1, z, k } of bands) {
      if (v.y <= y0 || v.y >= y1 || (z > 0 ? v.z <= z : v.z >= z)) continue;
      v.z = z + (v.z - z) * (1 - k * w * Math.sin((Math.PI * (v.y - y0)) / (y1 - y0)));
      moved = true;
    }
    if (!moved) continue;
    d.set(0, 0, v.z - z0).applyMatrix3(toMesh);
    pos.setXYZ(i, pos.getX(i) + d.x, pos.getY(i) + d.y, pos.getZ(i) + d.z);
  }
  pos.needsUpdate = true;
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
  if (cfg.flatten) flattenBody(mesh, cfg.flatten);
  const fists = cfg.fist ? { RightHand: curlFist(mesh, bones.RightHand, cfg.fist), LeftHand: curlFist(mesh, bones.LeftHand, cfg.fist) } : {};
  smoothNormals(mesh.geometry);
  // 1 where a worn outfit tucks the body under its cloth (chibi-garments.js coveredBody), else 0
  mesh.geometry.setAttribute('tucked', new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count), 1));
  if (fists.RightHand && fists.LeftHand) addFistMorphs(mesh.geometry, [fists.RightHand, fists.LeftHand]);
  if (head0) softHeadNormals(mesh.geometry, head0, cfg.headShape.soft);
  if (head0 && cfg.faceShadow) addFaceCoords(mesh, head0.w, cfg.faceShadow);
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
  const headVerts = [], wp = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    v.toArray(wp, i * 3);
    if (v.y > headY) { head.expandByPoint(v); headVerts.push(i); }
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
  // helms and hoods go over the hair, which stands well out from this head: the same fit, larger
  // about the head's centre and lifted (`helmFit` in data: scale, lift in head heights)
  const hf = cfg.helmFit || { scale: 1.3, lift: 0.1 }, hh = head.isEmpty() ? 0.3 : head.max.y - head.min.y;
  const helmFit = { pos: headFit.pos.map((v, i) => (i === 1 ? v + 0.12 * hs * (1 - hf.scale) + hf.lift * hh : v)), scale: hs * hf.scale };
  // the head's bind bounds in the head bone's space, for fitting a separate hair model
  const toHead = bones.Head.matrixWorld.clone().invert();
  const headBox = head.isEmpty() ? null : head.clone().applyMatrix4(toHead);
  // and the head's vertices with the map from that space to the mesh's, so a hair can be fitted over it (fitHairToHead)
  // the bind skin maps mesh space to the world by one affine map (see flattenBody): fitted by least
  // squares over every head vertex (four alone are too close to one plane to fix it within a millimetre)
  const N = [0, 1, 2, 3].map(() => new Float64Array(7)); // [N | R0 R1 R2], solved in doubles
  for (const i of headVerts) {
    const m = [pos.array[i * 3], pos.array[i * 3 + 1], pos.array[i * 3 + 2], 1];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) N[r][c] += m[r] * m[c];
      for (let e = 0; e < 3; e++) N[r][4 + e] += m[r] * wp[i * 3 + e];
    }
  }
  for (let c = 0; c < 4; c++) { // Gauss-Jordan with partial pivoting
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(N[r][c]) > Math.abs(N[p][c])) p = r;
    [N[c], N[p]] = [N[p], N[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = N[r][c] / N[c][c]; for (let k = c; k < 7; k++) N[r][k] -= f * N[c][k]; }
  }
  const row = (e) => [0, 1, 2, 3].map((c) => N[c][4 + e] / N[c][c]);
  const affine = new THREE.Matrix4().set(...row(0), ...row(1), ...row(2), 0, 0, 0, 1);
  const toMesh = affine.invert().multiply(bones.Head.matrixWorld);
  // the ears (`ears`: their reach out from the head's middle and their height band, in head widths and
  // heights) and the face (`face`: in front of `front` of the head's depth, below `top` of its height and
  // within `side` head widths of its middle)
  const ears = [], face = [], e = cfg.ears, f = cfg.face, hs3 = head.getSize(new THREE.Vector3()), hc3 = head.getCenter(new THREE.Vector3());
  // and the jaw's underside and nape just under the head joint (skin mostly on the head bone), which a turned
  // head lifts beside the locks hanging past it
  const hb = mesh.skeleton.bones.indexOf(bones.Head), onHead = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hb) w += sw.getComponent(i, k); return w; };
  const fitVerts = headVerts.concat([...Array(pos.count).keys()].filter((i) => wp[i * 3 + 1] <= headY && wp[i * 3 + 1] > headY - 0.2 * hs3.y && onHead(i) >= 0.5));
  for (const i of fitVerts) {
    v.fromArray(wp, i * 3);
    const y = (v.y - head.min.y) / hs3.y, z = (v.z - head.min.z) / hs3.z;
    if (e && Math.abs(v.x - hc3.x) / hs3.x >= e.out && y >= e.y[0] && y <= e.y[1]) ears.push(i);
    else if (f && z >= f.front && y <= f.top && Math.abs(v.x - hc3.x) / hs3.x <= f.side) face.push(i);
  }
  const headTuck = { verts: Uint32Array.from(fitVerts), ears: Uint32Array.from(ears), face: Uint32Array.from(face), toMesh, bone: hb };
  // the head bone's bind rotation, so the face shadow can follow the head's turn each frame
  const faceShadow = head0 && cfg.faceShadow ? { ...cfg.faceShadow, bind: bones.Head.getWorldQuaternion(new THREE.Quaternion()) } : null;
  return { scene, joints, world, headFit, helmFit, neckFit, headBox, headTuck, faceShadow, faceDecal: cfg.faceDecal || null, chibi: true, grip, thumb, leftFistWith: cfg.fist?.leftFistWith || [], paintedLight: cfg.paintedLight ?? 0, tint: cfg.tint || null, underCloth: cfg.underCloth || null, gearScale: cfg.gearScale ?? 1, holds: cfg.holds || null, gripMiddle: cfg.gripMiddle || [],
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
  // `box`: fixed bounds to fit by, so trimming a few triangles off the model does not move the hair
  const box = cfg.box ? new THREE.Box3().setFromArray(cfg.box.flat()) : geometry.boundingBox.clone();
  // `keep: [side, at]`: only the front or back part of this hair, split across its depth at `at`
  // (0 back, 1 front), so two hair models can be joined (one's fringe with the other's back)
  if (cfg.keep) geometry = keepPart(geometry, box, cfg.keep);
  // `fit.tilt`: degrees the hair leans back (its top toward the back), about the middle of its box
  if (cfg.fit?.tilt) {
    const c = box.getCenter(new THREE.Vector3());
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(-cfg.fit.tilt))).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)));
  }
  smoothNormals(geometry);
  geometry.userData.shared = true;
  if (mesh.material.map) mesh.material.map.userData.shared = true;
  // `color`: one flat colour instead of the generated texture (the hair is painted one tone)
  const material = cfg.color ? { color: new THREE.Color(cfg.color), map: null, side: THREE.DoubleSide } : mesh.material;
  // `underHelm`: under a helm the hair above `above` of its height and behind `front` of its depth
  // is not drawn, so it cannot poke through the helm; the fringe in a hood's opening stays
  const u = cfg.underHelm;
  const underHelm = u ? cutAbove(geometry, box.min.y + u.above * (box.max.y - box.min.y), box.min.z + u.front * (box.max.z - box.min.z)) : null;
  return { geometry, underHelm, material, box, fit: cfg.fit || {}, highlight: cfg.highlight || null };
}

/** The triangles of a geometry less those whose centre lies above height y and behind depth z (a shared copy). */
function cutAbove(geometry, y, z) {
  const g = geometry.clone(), P = g.attributes.position, keep = [];
  const ix = g.index ? g.index.array : Array.from({ length: P.count }, (_, i) => i);
  const sum = (get, t) => get.call(P, ix[t]) + get.call(P, ix[t + 1]) + get.call(P, ix[t + 2]);
  for (let t = 0; t < ix.length; t += 3) if (sum(P.getY, t) < 3 * y || sum(P.getZ, t) > 3 * z) keep.push(ix[t], ix[t + 1], ix[t + 2]);
  g.setIndex(keep);
  g.userData.shared = true;
  return g;
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

/** The hair's (or, `uniform`, a modelled helm's) place on the head bone: position and per-axis scale. */
function hairFrame(T, H, uniform) {
  const hb = T.headBox, b = H.box, f = H.fit;
  const hw = hb.max.x - hb.min.x, hd = hb.max.z - hb.min.z, hh = hb.max.y - hb.min.y;
  // per axis: the chibi head is rounder than the head the hair was made on
  const sx = (hw * (f.width ?? 1.15)) / (b.max.x - b.min.x), sz = (hd * (f.depth ?? 1.15)) / (b.max.z - b.min.z);
  const sy = ((sx + sz) / 2) * (f.height ?? 1);
  const position = new THREE.Vector3((hb.min.x + hb.max.x) / 2 + hw * (f.side ?? 0) - sx * (b.min.x + b.max.x) / 2,
    hb.max.y + hh * (f.lift ?? 0) - sy * b.max.y,
    (hb.min.z + hb.max.z) / 2 - hd * (f.back ?? 0) - sz * (b.min.z + b.max.z) / 2);
  const scale = new THREE.Vector3(sx, sy, sz);
  if (uniform) {
    // a helm is not squashed to the head like the hair: one scale, about the hair box's middle
    const s = (sx + sy + sz) / 3, c = b.getCenter(new THREE.Vector3());
    position.add(new THREE.Vector3(sx * c.x, sy * c.y, sz * c.z)).sub(c.multiplyScalar(s));
    scale.setScalar(s);
  }
  return { position, scale };
}

/**
 * The hair kept inside a modelled helm: each hair point the helm's surface lies in front of, seen
 * from the head's middle, is pulled back to just inside it, so no hair pokes through and none is
 * cut away. Computed once per helm and hair (cached on the helm model).
 */
function hairInsideHelm(T, H, model) {
  const cache = (model.inside ||= new WeakMap());
  if (cache.has(H)) return cache.get(H);
  const hf = hairFrame(T, H, false), mf = hairFrame(T, H, true), hb = T.headBox;
  const helm = new THREE.Mesh(model.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  helm.position.copy(mf.position); helm.scale.copy(mf.scale); helm.updateMatrixWorld(true);
  const centre = hb.getCenter(new THREE.Vector3());
  const margin = 0.04 * (hb.max.x - hb.min.x);
  const geometry = H.geometry.clone(), pos = geometry.attributes.position;
  const ray = new THREE.Raycaster(), v = new THREE.Vector3(), dir = new THREE.Vector3(), hits = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).multiply(hf.scale).add(hf.position);
    const dist = dir.subVectors(v, centre).length();
    if (dist < 1e-6) continue;
    dir.divideScalar(dist);
    ray.set(centre, dir); ray.far = dist + margin;
    hits.length = 0;
    helm.raycast(ray, hits);
    if (!hits.length) continue; // through the helm's opening (the fringe over the face)
    const near = Math.min(...hits.map((h) => h.distance));
    if (dist <= near - margin) continue;
    v.copy(centre).addScaledVector(dir, Math.max(near - margin, 0)).sub(hf.position).divide(hf.scale);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.userData.shared = true; // kept with the helm model
  helm.material.dispose();
  cache.set(H, geometry);
  return geometry;
}

/**
 * A hair fitted to the chibi head, so the head never shows through it, whatever the hair's shape
 * (`fit.tuck`: the margin, in head widths). Seen from the head's middle:
 * - the face (data: hero_chibi.face) is never moved: a lock that passes inside it moves out over it;
 * - the rest of the head (and the ears, unless the hair shows them: `fit.ears`) moves in under the
 *   hair wherever the hair covers it: to the nearest hair along its own ray, and lower still where
 *   hair passes inside one of its triangles (a lock narrower than the head's triangles misses every
 *   corner's ray), so the whole triangle goes under that hair. Skin only partly on the head bone (the
 *   nape, led partly by the neck) moves against the hair as the head turns: it goes in up to three
 *   times as far. The face side of a lock the head moves under stays covered by that lock.
 * Returns the hair's geometry and the body's; cached per body and hair geometry.
 */
const FITTED = new WeakMap(), EDGE = 1e-3;
function fitHairToHead(T, src, H, geometry) {
  const k = T.headTuck;
  if (!k || !src.index) return { hair: geometry, body: src };
  let byHair = FITTED.get(src);
  if (!byHair) FITTED.set(src, (byHair = new WeakMap()));
  if (byHair.has(geometry)) return byHair.get(geometry);
  const hb = T.headBox, hw = hb.max.x - hb.min.x, c = hb.getCenter(new THREE.Vector3());
  const margin = (H.fit.tuck ?? 0.02) * hw, reach = 0.25 * hw;
  const rmax = Math.max(hw, hb.max.y - hb.min.y, hb.max.z - hb.min.z) * 0.75 + reach;
  const { position, scale } = hairFrame(T, H, false), a = new THREE.Vector3(), b = new THREE.Vector3();
  const toMesh = k.toMesh, toHead = toMesh.clone().invert(), sp = src.attributes.position, moved = sp.array.slice();
  // the head's vertices from its middle, and its triangles as flat corner lists
  const P = new Map(), face = new Set(k.face), ears = new Set(k.ears), keep = new Set([...k.face, ...(H.fit.ears ? k.ears : [])]);
  for (const i of k.verts) {
    const q = a.fromBufferAttribute(sp, i).applyMatrix4(toHead).sub(c);
    P.set(i, q.toArray());
  }
  const ix = src.index.array, faceTris = [], restTris = [];
  for (let t = 0; t < ix.length; t += 3) {
    const tri = [ix[t], ix[t + 1], ix[t + 2]];
    if (tri.every((i) => P.has(i))) (tri.some((i) => face.has(i)) ? faceTris : restTris).push(...tri);
  }
  const flat = (tris) => Float32Array.from(tris.flatMap((i) => P.get(i)));
  // the distance along a ray from the head's middle to each triangle it meets (Moller-Trumbore), as
  // calls of hit(triangle number, distance)
  const cast = (TR, dx, dy, dz, hit, edge = EDGE) => {
    for (let t = 0; t < TR.length; t += 9) {
      const ax = TR[t], ay = TR[t + 1], az = TR[t + 2];
      const e1x = TR[t + 3] - ax, e1y = TR[t + 4] - ay, e1z = TR[t + 5] - az, e2x = TR[t + 6] - ax, e2y = TR[t + 7] - ay, e2z = TR[t + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, u = -(ax * px + ay * py + az * pz) * inv;
      if (u < -edge || u > 1 + edge) continue;
      const qx = az * e1y - ay * e1z, qy = ax * e1z - az * e1x, qz = ay * e1x - ax * e1y, w = (dx * qx + dy * qy + dz * qz) * inv;
      if (w < -edge || u + w > 1 + edge) continue; // a ray along a shared edge meets both triangles
      const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (dist > 0) hit(t / 9, dist, u >= 0 && w >= 0 && u + w <= 1);
    }
  };
  // 1. the hair out over the face: the push each hair point inside the face needs, gathered by
  // direction, spread (largest wins) and smoothed so a lock bends out as a whole, then applied to
  // every hair point along each direction (the layers keep their order, no single point spikes out)
  const hairGeo = geometry.clone(), hp = hairGeo.attributes.position, FT = flat(faceTris);
  const NA = 96, NP = 48, bin = (x, y, z) => [((Math.atan2(x, z) / Math.PI + 1) / 2) * NA, (Math.acos(THREE.MathUtils.clamp(y, -1, 1)) / Math.PI) * NP];
  let D = new Float32Array(NA * NP);
  for (let h = 0; h < hp.count; h++) {
    const q = a.fromBufferAttribute(hp, h).multiply(scale).add(position).sub(c), r = q.length();
    if (r < 1e-6 || r > rmax) continue;
    let out = 0;
    cast(FT, q.x / r, q.y / r, q.z / r, (_, dist) => { if (dist + reach > r) out = Math.max(out, dist + margin - r); });
    if (out <= 0) continue;
    const [u, w] = bin(q.x / r, q.y / r, q.z / r), cell = Math.min(NP - 1, Math.floor(w)) * NA + (Math.floor(u) % NA);
    D[cell] = Math.max(D[cell], out);
  }
  const pass = (n, max) => {
    const F = new Float32Array(D.length);
    for (let p = 0; p < NP; p++) for (let u = 0; u < NA; u++) {
      let best = 0, sum = 0, cnt = 0;
      for (let dp = -n; dp <= n; dp++) for (let du = -n; du <= n; du++) {
        if (p + dp < 0 || p + dp >= NP) continue;
        const x = D[(p + dp) * NA + ((u + du + NA) % NA)];
        best = Math.max(best, x); sum += x; cnt++;
      }
      F[p * NA + u] = max ? best : sum / cnt;
    }
    D = F;
  };
  pass(3, true); pass(1, false); pass(1, false);
  const at = (u, p) => D[THREE.MathUtils.clamp(p, 0, NP - 1) * NA + ((u % NA) + NA) % NA];
  for (let h = 0; h < hp.count; h++) {
    const q = a.fromBufferAttribute(hp, h).multiply(scale).add(position).sub(c), r = q.length();
    if (r < 1e-6) continue;
    const [u, w] = bin(q.x / r, q.y / r, q.z / r), u0 = Math.floor(u - 0.5), p0 = Math.floor(w - 0.5), fu = u - 0.5 - u0, fp = w - 0.5 - p0;
    const push = (at(u0, p0) * (1 - fu) + at(u0 + 1, p0) * fu) * (1 - fp) + (at(u0, p0 + 1) * (1 - fu) + at(u0 + 1, p0 + 1) * fu) * fp;
    if (push > 0) { q.multiplyScalar((r + push) / r).add(c).sub(position).divide(scale); hp.setXYZ(h, q.x, q.y, q.z); }
  }
  hp.needsUpdate = true;
  smoothNormals(hairGeo);
  hairGeo.userData.shared = true; // cached with the body
  // 2. the rest of the head in under that hair
  const hix = hairGeo.index ? hairGeo.index.array : null, HTR = [];
  for (let t = 0; t < (hix ? hix.length : hp.count); t += 3) {
    const tri = [0, 1, 2].map((n) => a.fromBufferAttribute(hp, hix ? hix[t + n] : t + n).multiply(scale).add(position).sub(c).toArray());
    if (tri.some((q) => Math.hypot(...q) < rmax)) HTR.push(...tri.flat());
  }
  const HT = Float32Array.from(HTR), target = new Map();
  const si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
  const room = (i) => { let w = 0; for (let n = 0; n < 4; n++) if (si.getComponent(i, n) === k.bone) w += sw.getComponent(i, n); return margin * (1 + 2 * (1 - Math.min(1, w))); };
  const lower = (i, to) => { if (!keep.has(i)) target.set(i, Math.min(target.get(i) ?? Infinity, to)); };
  for (const [i, q] of P) {
    if (keep.has(i)) continue;
    const r = Math.hypot(...q);
    if (r < 1e-6) continue;
    let near = Infinity;
    cast(HT, q[0] / r, q[1] / r, q[2] / r, (_, dist) => { near = Math.min(near, dist); });
    if (near <= r + reach && near - room(i) < r) lower(i, near - room(i));
    // an ear the hair covers folds in flat under it: its flap is a fold the rays above cannot see
    if (ears.has(i) && near <= r + reach) lower(i, Math.min(near - room(i), 0.8 * r));
  }
  const apply = () => {
    let n = 0;
    for (const [i, to] of target) {
      const q = P.get(i), r = Math.hypot(...q);
      if (to >= r - 1e-6) continue;
      P.set(i, b.fromArray(q).multiplyScalar(Math.max(to, 0.2 * r) / r).toArray());
      b.add(c).applyMatrix4(toMesh).toArray(moved, i * 3);
      n++;
    }
    target.clear();
    return n;
  };
  apply();
  // each hair point a head triangle still lies over takes that triangle in under it (a lock narrower
  // than the head's triangles misses every corner's ray), and the triangles beside it where they lie
  // well over it; again on the moved head, as moving one triangle tilts its neighbours
  for (let round = 0; round < 4; round++) {
    const RT = flat(restTris);
    for (let h = 0; h < hp.count; h++) {
      const q = a.fromBufferAttribute(hp, h).multiply(scale).add(position).sub(c), r = q.length();
      if (r < 1e-6 || r > rmax) continue;
      cast(RT, q.x / r, q.y / r, q.z / r, (t, dist, exact) => {
        if (dist + reach < r || r - 3 * margin >= dist) return; // this hair is well outside the head here
        if (!exact && dist < (round ? r : r + margin)) return;
        if (dist < r && round) return; // already under it
        for (let n = 0; n < 3; n++) { const i = restTris[3 * t + n]; lower(i, r - room(i)); }
      }, round ? 0.05 : 0.25);
    }
    if (!apply()) break;
  }
  // last, the check the game's hair test makes: a hair point behind the head triangle nearest it,
  // with an odd number of head surfaces beyond it (inside the head; where the head folds, as round
  // the ears, no ray from the middle meets that triangle) takes that triangle in under it
  for (let round = 0; round < 4; round++) {
    const RT = flat(restTris), AT = flat([...restTris, ...faceTris]), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3(), o = new THREE.Vector3();
    for (let h = 0; h < hp.count; h++) {
      const q = a.fromBufferAttribute(hp, h).multiply(scale).add(position).sub(c), r = q.length();
      if (r < 1e-6 || r > rmax) continue;
      let best = Infinity, bt = -1;
      for (let t = 0; t < RT.length; t += 9) {
        const d = (q.x - (RT[t] + RT[t + 3] + RT[t + 6]) / 3) ** 2 + (q.y - (RT[t + 1] + RT[t + 4] + RT[t + 7]) / 3) ** 2 + (q.z - (RT[t + 2] + RT[t + 5] + RT[t + 8]) / 3) ** 2;
        if (d < best) { best = d; bt = t; }
      }
      if (bt < 0 || best > reach * reach) continue;
      e1.set(RT[bt + 3] - RT[bt], RT[bt + 4] - RT[bt + 1], RT[bt + 5] - RT[bt + 2]);
      e2.set(RT[bt + 6] - RT[bt], RT[bt + 7] - RT[bt + 1], RT[bt + 8] - RT[bt + 2]);
      const depth = -nrm.crossVectors(e1, e2).normalize().dot(o.set(q.x - RT[bt], q.y - RT[bt + 1], q.z - RT[bt + 2]));
      if (depth <= 0) continue;
      let beyond = 0;
      cast(AT, q.x / r, q.y / r, q.z / r, (_, dist) => { if (dist > r) beyond++; }, 0);
      if (beyond % 2 === 0) continue;
      for (let n = 0; n < 3; n++) { const i = restTris[bt / 3 + n], rv = Math.hypot(...P.get(i)); lower(i, rv - 2 * (depth + room(i))); }
    }
    if (!apply()) break;
  }
  const body = new THREE.BufferGeometry();
  for (const [n, attr] of Object.entries(src.attributes)) body.setAttribute(n, attr);
  body.setAttribute('position', new THREE.BufferAttribute(moved, 3));
  body.morphAttributes = src.morphAttributes;
  body.morphTargetsRelative = src.morphTargetsRelative;
  body.setIndex(src.index);
  body.boundingSphere = src.boundingSphere;
  body.userData.shared = true; // cached with the body
  const fitted = { hair: hairGeo, body };
  byHair.set(geometry, fitted);
  return fitted;
}

/**
 * Put the hair on the chibi head bone: scaled so its width and depth are `fit.width` and
 * `fit.depth` × the head's (height: their mean × `fit.height`), centred on the head across and
 * front-to-back (moved back by `fit.back` × head depth, and toward +X by `fit.side` × head width)
 * and its top `fit.lift` × head height above the head's. Toon material with a plain outline hull.
 * Under a code-built `helm`, the hair drawn is its under-helm cut (`underHelm`), if it has one. A
 * modelled helm (`model`, headwear only) is drawn over the whole hair, kept inside it
 * (hairInsideHelm), or over the hair as it is when it is a band worn on top of it (`withHair`).
 */
export function attachChibiHair(rig, T, H, { outline = 0.012, darkness = 0.32, rim = 0.3, helm = false, model = null, geometry: own = null, color = null } = {}) {
  const headBone = rig.skin?.body.getObjectByName('Head');
  if (!headBone || !T.headBox) return;
  if (model) attachChibiHair(rig, T, H, { outline, darkness, rim, color, geometry: model.withHair ? null : hairInsideHelm(T, H, model) });
  const { position, scale } = hairFrame(T, H, model && !model.withHair);
  const g = new THREE.Group();
  g.position.copy(position); g.scale.copy(scale);
  const s = (scale.x + scale.y + scale.z) / 3;
  const flash = rig.material.userData.flash;
  let geometry = model ? model.geometry : own || (helm && H.underHelm ? H.underHelm : H.geometry);
  const src = model ? model.material : H.material;
  if (!model && H.fit.tuck != null) { // the hair fitted to the head: the body (and its outline hull) tucked under it
    let body = null;
    rig.skin.body.traverse((o) => { if (o.isSkinnedMesh && !body && !o.userData.garment) body = o; });
    const from = body?.geometry, fitted = from && fitHairToHead(T, from, H, geometry);
    if (fitted) {
      geometry = fitted.hair;
      if (fitted.body !== from) rig.skin.body.traverse((o) => { if (o.isSkinnedMesh && o.geometry === from) o.geometry = fitted.body; });
    }
  }
  const hair = new THREE.Mesh(geometry, paintedLight(toonCopy(src, flash, rim, false), T.paintedLight));
  if (model) darkInside(hair.material, T.underCloth?.inside); // a helm's inside reads as shade
  hair.material.side = THREE.DoubleSide; // a shell: its inside shows under the fringe
  if (H.highlight && !model) hairHighlightMaterial(hair.material, H.box, H.highlight);
  hair.castShadow = true;
  const hull = new THREE.Mesh(geometry, hairHull(src, outline / s, darkness));
  if (color && !model && src.map) { hairColorMaterial(hair.material, color); hairColorMaterial(hull.material, color); }
  hair.name = 'Hair'; hull.name = 'Hair-outline';
  g.add(hair, hull);
  headBone.add(g);
  (rig.skin.hair ||= []).push(g);
}

/**
 * Light a chibi material as its painted texture (`paintedLight`, data: characters.hero_chibi): the
 * Meshy textures carry their own shading, so the texture also glows at that fraction and the toon
 * light on top only shapes it, instead of darkening it a second time.
 */
export function paintedLight(material, k) {
  if (k && material.map) {
    material.emissive.setScalar(k);
    material.emissiveMap = material.map;
  }
  return material;
}

/**
 * Draw a garment's inside (its back faces) in its texture's mean colour (the smallest mip) at `k` of
 * its light: a hollow pad or an open collar then reads as shaded cloth of the garment's own colour,
 * not as the pale fur or lining the generated texture paints there.
 */
export function darkInside(material, k) {
  if (!k) return material;
  const prev = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_MAP
if (!gl_FrontFacing) {
  vec3 mean = texture2D(map, vMapUv, 16.0).rgb;
  diffuseColor.rgb = diffuse * mean;
  totalEmissiveRadiance = emissive * mean;
}
#endif`)
      .replace('#include <opaque_fragment>', `outgoingLight *= gl_FrontFacing ? 1.0 : ${k.toFixed(3)};\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => (key ? key.call(material) : '') + `-inside${k}`;
  return material;
}

/**
 * The body where it is tucked under cloth (its `tucked` attribute): drawn at `k` of its light and
 * pushed `depth` metres further from the camera along its view ray (the same place on screen), so the
 * cloth over it always wins the depth test and nothing pokes through, while an opening in a garment
 * shows that shade, never the background. `k` 1 leaves the colour (the outline hull).
 */
function tuckedShade(material, k, depth) {
  const prev = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tucked;\nvarying float vTucked;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTucked = tucked;')
      .replace('#include <project_vertex>', `#include <project_vertex>
if (tucked > 0.0) { mvPosition.xyz *= 1.0 + tucked * ${depth.toFixed(4)} / max(length(mvPosition.xyz), 1e-3); gl_Position = projectionMatrix * mvPosition; }`);
    if (k < 1) shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTucked;')
      .replace('#include <opaque_fragment>', `outgoingLight *= mix(1.0, ${k.toFixed(3)}, clamp(vTucked, 0.0, 1.0));\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => (key ? key.call(material) : '') + `-tucked${k}-${depth}`;
  return material;
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

/** The body's outline for another skinned piece on the chibi (its texture darkened). */
export function chibiOutline(map, width, darkness) {
  return outlineHull({ map }, width, darkness);
}

/**
 * Add the chibi body to a built driver rig and give the rig syncSkin(). `weapon`/`offhand` are the
 * held kinds (a bow's grip runs along its limbs, +Y; other weapons along +Z, the blade or shaft).
 */
export function attachChibiBody(rig, T, { outline = 0.012, darkness = 0.32, rim = 0.3, weapon = null, offhand = null, face = null } = {}) {
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
    mesh.material = paintedLight(toonCopy(src, flash, rim, false), T.paintedLight);
    // `tint`: the base's pale painted skin warmed toward the sheet's peach under the cool scene light
    if (T.tint) { mesh.material.color.setRGB(...T.tint); mesh.material.emissive.multiply(mesh.material.color); }
    tuckedShade(mesh.material, T.underCloth?.under ?? 0.3, T.underCloth?.depth ?? 0.05);
    mesh.material.side = THREE.FrontSide; // Meshy marks it double-sided; the body is closed
    if (T.faceShadow) {
      const follow = faceShadowMaterial(mesh.material, body.getObjectByName('Head'), T.faceShadow.bind, T.faceShadow);
      mesh.onBeforeRender = (renderer, scene, camera) => follow(camera);
      if (face && T.faceDecal) faceDecalMaterial(mesh.material, face, T.faceDecal);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.updateMorphTargets();
    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.splice(0, 2, ...closed);
    const hull = new THREE.SkinnedMesh(mesh.geometry, tuckedShade(outlineHull(src, outline, darkness), 1, T.underCloth?.depth ?? 0.05));
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
