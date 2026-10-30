// The outfit base (docs/OUTFIT-BASE.md) on the chibi hero: the same garments the HairSample hero
// wears, built from the chibi body itself. A top shell (torso and arms), trousers (the legs), a
// skirt from the waist, boot shafts with the feet, and glove shells (with the fists' morph targets)
// are body regions pushed out along the normals, so they move and close with the body; garments.js
// cuts and paints them from the resolved outfit. Its cuts are in metres of the HairSample body, so
// the chibi's shaders read their bind position and landmarks times SCALE.
// An armour, boots or gloves item with its own modelled outfit (data/models.json `chibiOutfit`, made by
// scripts/fit-chibi-outfit.py) wears that model instead of the shells it replaces. The body faces
// a model or a glove or boot shell covers are tucked under it (coveredBody), so no skin pokes through.
import * as THREE from 'three';
import { garmentFrame, garmentUniforms, pieceUniforms, garmentMaterial, garmentHull } from './garments.js';
import { regionShell, skirt } from './base-garments.js';
import { toonCopy } from './vrm-body.js';
import { chibiOutline, paintedLight, darkInside, closeGloves } from './chibi-body.js';

const BONES = { arm: 'LeftArm', elbow: 'LeftForeArm', hand: 'LeftHand', foot: 'LeftFoot', toe: 'LeftToeBase', neck: 'neck', chest: 'Spine', hips: 'Hips', leg: 'LeftUpLeg', knee: 'LeftLeg' };
/** HairSample metres per chibi metre (hips to ankle 0.89 m against 0.53 m). */
export const SCALE = 1.7;
const TOP_OFF = 0.008; // the top shell's offset from the body (m)
const HULL = 0.006; // garment outline width (m)

/**
 * The body regions the glove and boot shells cover (bind space, chibi metres). A shell keeps every
 * triangle that reaches into its region and its shader cuts it clean at the region's line (`edge`:
 * how far that line is past the item's length, in the length's units), so its top is a straight
 * edge, not the body's triangles; the body wholly inside is tucked under it.
 */
const SHELLS = {
  gloves: (F, len) => {
    const from = F.wrist - len * (F.wrist - F.elbow) - 0.01;
    return { keep: (x, y) => Math.abs(x) > from && y > F.chest - 0.15, edge: 0.01 / (F.wrist - F.elbow), off: 0.004, len };
  },
  boots: (F, len) => {
    const top = F.ankle + len * (F.knee - F.ankle);
    return { keep: (x, y) => y < top, edge: 0, off: 0.011, len };
  },
};

/** The template's garment frames (cached on T). */
function frames(T) {
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
  return T.garmentFrame0;
}

/** The glove and boot shells worn (`skip` names the pieces a model replaces): [kind, region]. */
function shells(T, outfit, skip = new Set()) {
  const F = frames(T);
  return ['boots', 'gloves'].filter((k) => outfit[k] && !skip.has(k)).map((k) => [k, SHELLS[k](F, outfit[k].len)]);
}

/** Garment pieces for the chibi body template T (shared by every rig, cached on T), less `skip`. */
function pieces(T, outfit, skip = new Set()) {
  const F = frames(T);
  const out = [];
  if (!skip.has('top')) out.push(['top', regionShell(T, 'chibi-top', (x, y) => (Math.abs(x) > F.shoulder + 0.02 ? Math.abs(x) < F.wrist - 0.012 && y > F.chest - 0.12 : y > F.hips - 0.1 && y < F.neck + 0.008), TOP_OFF)]);
  if (!skip.has('pants')) out.push(['pants', regionShell(T, 'chibi-pants', (x, y) => y < F.hips + 0.03 && y > F.ankle - 0.012, 0.005)]);
  if (outfit.skirt && !skip.has('skirt')) out.push(['skirt', skirt(T, F, { length: outfit.skirt.length / SCALE, flare: outfit.skirt.flare / SCALE, opening: outfit.skirt.opening || 0 })]);
  for (const [kind, S] of shells(T, outfit, skip)) {
    const uniforms = pieceUniforms(outfit[kind]);
    uniforms.uCutD.value.y = S.edge; uniforms.uCutD.value.w = 1; // cut clean at the region's line
    out.push([kind, regionShell(T, `chibi-${kind}:${outfit[kind].len}`, S.keep, S.off, true), uniforms]);
  }
  return out;
}

/**
 * A modelled outfit piece (data/models.json characters with `chibiOutfit`: "armor", "boots" or
 * "gloves"): one skinned mesh on the chibi's armature, with the body triangles it covers (node extras
 * `hideBody`; they are tucked under it, coveredBody). Gloves close with the fists (closeGloves).
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
    hide: JSON.parse(mesh.userData.hideBody || '[]'), outline: m.outline ?? 0.008, localInside: !!m.localInside, neckline: m.neckline || null,
    tunicCloth: m.tunicCloth || null, fitted: null };
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

/**
 * The outfit geometry in the body's own bind space, its bones the body skeleton's (cached on the
 * outfit); a glove's with the fists' morph targets (`fists`: the template's, closeGloves).
 */
function fitOutfit(O, body, fists = null) {
  if (O.fitted) return O.fitted;
  const g = O.geometry.clone();
  g.applyMatrix4(bindSpace(body).invert().multiply(O.bind));
  const names = body.skeleton.bones.map((b) => b.name), si = g.attributes.skinIndex;
  const to = O.bones.map((n) => Math.max(0, names.indexOf(n)));
  for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) si.setComponent(i, k, to[si.getComponent(i, k)]);
  if (O.piece === 'gloves' && fists) closeGloves(g, fists);
  g.userData.shared = true;
  O.fitted = g;
  return g;
}

/**
 * A modelled outfit's neckline cut clean (data: the outfit's `neckline`, in the body's bind space,
 * chibi metres): the generated collar is a crumpled tangle that no repaint makes neat, so the cloth
 * is cut away per pixel by a plain shape instead, a V in front (from `tip` at height, centred on `x`,
 * widening by `slope` per metre up, in front of depth `z`) and the round of the neck above `cut`
 * within `ring` of the neck's axis (the cut rising steeply past it), edged with a `trim` band in
 * `color` (no ink line: a discarded edge has no antialiasing, and a dark line on it shows the steps). `neckEdge` is a point's distance into the kept cloth (m;
 * below 0 cut away), the same in GLSL and here (for the body under the opening, coveredBody).
 */
function neckEdge(n, x, y, z) {
  const r = Math.hypot(x, z - n.z), top = n.cut + 2 * Math.max(0, r - n.ring) - y;
  const v = z > n.z ? (Math.abs(x - n.x) - n.slope * (y - n.tip)) / Math.hypot(1, n.slope) : 1;
  return Math.min(top, v);
}
const NECK_EDGE = (n) => `
float neckEdge( vec3 p ) {
  float r = length( vec2( p.x, p.z - ${n.z.toFixed(4)} ) );
  float top = ${n.cut.toFixed(4)} + 2.0 * max( 0.0, r - ${n.ring.toFixed(4)} ) - p.y;
  float v = p.z > ${n.z.toFixed(4)} ? ( abs( p.x - ${n.x.toFixed(4)} ) - ${n.slope.toFixed(4)} * ( p.y - ${n.tip.toFixed(4)} ) ) / ${Math.hypot(1, n.slope).toFixed(4)} : 1.0;
  return min( top, v );
}`;
function necklineCut(material, n, trim) {
  const prev = material.onBeforeCompile, key = material.customProgramCacheKey;
  const color = trim ? new THREE.Color(n.color) : null;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNeck;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNeck = position;');
    let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vNeck;${NECK_EDGE(n)}`);
    frag = frag.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat neck = neckEdge( vNeck );\nif ( neck < 0.0 ) discard;');
    if (trim) frag = frag.replace('#include <map_fragment>', `#include <map_fragment>
if ( neck < ${n.trim.toFixed(4)} ) diffuseColor.rgb = vec3( ${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)} );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\nif ( neck < ${n.trim.toFixed(4)} ) totalEmissiveRadiance = emissive * diffuseColor.rgb;`);
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => (key ? key.call(material) : '') + `-neck${trim ? 1 : 0}`;
  return material;
}

/**
 * A modelled outfit's cloth in the look's chosen colour (data: the outfit's `tunicCloth`, used while the
 * worn armour's main colour is the look's tunic, data/outfits.json "$tunic"): its texels of the cloth
 * (bright, `lum` linear luminance, and pale, under `sat` saturation; each a smoothstep [from, to]) are
 * multiplied by the chosen colour over the colour the cloth is painted (`ref`), so its painted shading
 * and folds stay. The trim, leather and skin keep their paint.
 */
function tunicCloth(material, cloth, color) {
  const prev = material.onBeforeCompile, key = material.customProgramCacheKey;
  const tint = new THREE.Color(color), ref = new THREE.Color(cloth.ref);
  const u = { uClothTint: { value: new THREE.Vector3(tint.r / ref.r, tint.g / ref.g, tint.b / ref.b) },
    uClothMask: { value: new THREE.Vector4(cloth.lum[0], cloth.lum[1], cloth.sat[0], cloth.sat[1]) } };
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uClothTint; uniform vec4 uClothMask;
vec3 clothTint( vec3 c ) {
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), hi = max( c.r, max( c.g, c.b ) );
  float s = ( hi - min( c.r, min( c.g, c.b ) ) ) / max( hi, 1e-4 );
  return mix( vec3( 1.0 ), uClothTint, smoothstep( uClothMask.x, uClothMask.y, l ) * ( 1.0 - smoothstep( uClothMask.z, uClothMask.w, s ) ) );
}`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
vec4 sampledDiffuseColor = texture2D( map, vMapUv );
sampledDiffuseColor.rgb *= clothTint( sampledDiffuseColor.rgb );
diffuseColor *= sampledDiffuseColor;
#endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_MAP
totalEmissiveRadiance *= clothTint( texture2D( map, vMapUv ).rgb );
#endif`);
  };
  material.customProgramCacheKey = () => (key ? key.call(material) : '') + '-tunic-cloth';
  return material;
}

const CUFF_SHADE = 0.06; // m inside a sleeve's opening where the arm under it takes its full tucked shade

/**
 * The ends of an outfit's sleeves along the T-pose arms ([right, left] |x| in the body's bind space),
 * or null where it has none past the shoulder (cached on the fitted geometry).
 */
function sleeveEnds(T, g) {
  if (!g.userData.sleeves) {
    const F = frames(T), pos = g.attributes.position;
    let r = 0, l = 0;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); if (x < 0) r = Math.max(r, -x); else l = Math.max(l, x); }
    const reach = F.shoulder + 0.02;
    g.userData.sleeves = [r > reach ? r : 0, l > reach ? l : 0];
  }
  return g.userData.sleeves;
}

/**
 * The body under the worn outfit models and the glove and boot shells: the triangles they cover are
 * kept but tucked inside the cloth (every vertex all of whose triangles are covered moves
 * `underCloth.inset` metres in along its normal) and shaded as the inside of the cloth (`tucked`), so
 * the skin cannot poke through and a gap shows shade, never the background through a hole in the body
 * (cached on T per outfit). A shell covers the triangles wholly inside its region.
 */
function coveredBody(T, src, models, worn, cuffs = null) {
  let key = [...models.map((O) => O.piece + ':' + O.hide.length + (O.neckline ? ':neck' : '')), ...worn.map(([k, S]) => k + ':' + S.len)].join('|');
  T.covered ??= new Map();
  if (cuffs) key += '|cuffs:' + cuffs.map((x) => x.toFixed(3)).join(',');
  if (!T.covered.has(key)) {
    const hide = new Set(models.flatMap((O) => O.hide)), ix = src.index.array, necks = models.map((O) => O.neckline).filter(Boolean);
    const pos = src.attributes.position, nrm = src.attributes.normal;
    // a vertex is tucked when every triangle round it (across UV seams: by position) is covered
    const at = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const open = new Set(), touched = new Set(), deep = new Set();
    for (const [, S] of worn) {
      const inside = (i) => S.keep(pos.getX(i), pos.getY(i));
      for (let i = 0; i < pos.count; i++) if (inside(i)) deep.add(at(i));
      for (let t = 0; t < ix.length / 3; t++) if (inside(ix[3 * t]) && inside(ix[3 * t + 1]) && inside(ix[3 * t + 2])) hide.add(t);
    }
    for (let t = 0; t < ix.length / 3; t++) {
      for (let k = 0; k < 3; k++) (hide.has(t) ? touched : open).add(at(ix[3 * t + k]));
    }
    if (!src.boundingBox) src.computeBoundingBox();
    const local = (src.boundingBox.max.y - src.boundingBox.min.y) / 1.2; // the 1.2 m body in its own units
    const inset = (T.underCloth?.inset ?? 0.015) * local, moved = pos.array.slice(), tucked = new Float32Array(pos.count), F0 = frames(T);
    for (let i = 0; i < pos.count; i++) {
      const p = at(i);
      if (!touched.has(p) && !deep.has(p)) continue;
      // shaded as the inside of the cloth, its edge half way; a shell's cut line falls inside its edge
      // triangles, so the skin inside its region is pushed back in full (no skin there pokes through)
      tucked[i] = open.has(p) && !deep.has(p) ? 0.5 : 1;
      // seen through a neckline cut clean (necklineCut): plain skin, under its trim too
      if (necks.some((n) => neckEdge(n, pos.getX(i) / local, pos.getY(i) / local, pos.getZ(i) / local) < n.trim)) tucked[i] = 0;
      // the arm just inside a sleeve's opening is seen through it: skin in the sleeve's shadow, its
      // full shade only CUFF_SHADE in (the tucked shade's brown at the cuff reads as a stain)
      const ax = Math.abs(pos.getX(i)), end = cuffs && cuffs[pos.getX(i) < 0 ? 0 : 1];
      if (end && ax > F0.shoulder * local && ax <= end && !deep.has(p)) tucked[i] = Math.min(tucked[i], THREE.MathUtils.clamp((end - ax) / (CUFF_SHADE * local), 0.25, 1));
      if (open.has(p)) continue;
      moved[3 * i] -= nrm.getX(i) * inset; moved[3 * i + 1] -= nrm.getY(i) * inset; moved[3 * i + 2] -= nrm.getZ(i) * inset;
    }
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
    g.setAttribute('position', new THREE.BufferAttribute(moved, 3));
    g.setAttribute('tucked', new THREE.BufferAttribute(tucked, 1));
    g.morphAttributes = src.morphAttributes;
    g.morphTargetsRelative = src.morphTargetsRelative;
    g.setIndex(src.index);
    g.boundingSphere = src.boundingSphere;
    g.userData.shared = true;
    T.covered.set(key, g);
  }
  return T.covered.get(key);
}

/**
 * Dress a rig's chibi body (attachChibiBody) in a resolved outfit (core/outfit-look.js).
 * `models` holds the loaded outfit models of the worn armour, boots and gloves ({armor, boots, gloves}, any null).
 */
export function attachChibiGarments(rig, T, outfit, models = {}) {
  let mesh = null;
  rig.skin.body.traverse((o) => { if (o.isSkinnedMesh && !mesh && !o.userData.garment) mesh = o; });
  if (!mesh || !outfit) return;
  const worn = [models.armor, models.boots, models.gloves].filter(Boolean);
  const skip = new Set([...(models.armor ? ['top', 'pants', 'skirt'] : []), ...(models.boots ? ['boots'] : []), ...(models.gloves ? ['gloves'] : [])]);
  const shellsWorn = shells(T, outfit, skip);
  if (worn.length || shellsWorn.length) {
    const src = mesh.geometry, body = coveredBody(T, src, worn, shellsWorn, models.armor ? sleeveEnds(T, fitOutfit(models.armor, mesh)) : null);
    rig.skin.body.traverse((o) => { if (o.isSkinnedMesh && o.geometry === src) o.geometry = body; });
  }
  for (const O of worn) {
    const geometry = fitOutfit(O, mesh, T.fists);
    const make = (material) => {
      const m = new THREE.SkinnedMesh(geometry, material);
      m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
      m.bind(mesh.skeleton, mesh.bindMatrix);
      m.frustumCulled = false;
      m.userData.garment = O.piece;
      if (geometry.morphAttributes.position) { m.updateMorphTargets(); m.morphTargetInfluences = mesh.morphTargetInfluences; } // gloves close with the fists
      return m;
    };
    const part = make(darkInside(paintedLight(toonCopy({ map: O.map, side: THREE.DoubleSide }, rig.material.userData.flash, 0.3, false), T.paintedLight), T.underCloth?.inside, O.localInside));
    if (O.neckline) necklineCut(part.material, O.neckline, true);
    if (O.tunicCloth && O.piece === 'armor' && outfit.tunic) tunicCloth(part.material, O.tunicCloth, outfit.palette.main);
    part.name = 'Outfit-' + O.piece;
    part.castShadow = true;
    part.receiveShadow = true; // like the body it covers
    const hull = make(chibiOutline(O.map, O.outline, 0.32));
    if (O.neckline) necklineCut(hull.material, O.neckline, false);
    hull.name = part.name + '-outline';
    mesh.parent.add(part, hull);
  }
  const flash = rig.material.userData.flash, top = garmentUniforms(outfit), FS = (frames(T), T.garmentFrameS);
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
