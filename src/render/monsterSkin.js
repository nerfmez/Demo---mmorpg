// Imported monster models (data/models.json → monsters), skinned onto the procedural monster
// rigs in monsters.js. The rig's bones and animator stay exactly as they are (gait, wind-ups,
// hit reactions); the model replaces the procedural parts. Meshy only rigs humanoids, so the
// skin weights are computed here: each vertex follows the bones whose "segments" (a line
// through the body part, in the model's aligned rest space) are nearest, falling off with
// distance (sharper falloff = more rigid parts, e.g. a beetle's shell and legs). A bone can list
// several segments (a flat part such as a mushroom cap is a cross of two).
import * as THREE from 'three';
import { toonRamp } from './toon.js';
import { hullMaterial } from './patch.js';

const v = new THREE.Vector3();
const ab = new THREE.Vector3();

function segDist(p, a, b) {
  ab.subVectors(b, a);
  const t = Math.max(0, Math.min(1, v.subVectors(p, a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
  return v.copy(a).addScaledVector(ab, t).distanceTo(p);
}

/**
 * Align the model (yaw, scale, offset: metres in the rig's rest space, root at the ground) and
 * compute its skin weights against cfg.segments. Returns a template shared by every rig.
 */
export function prepareMonsterModel(gltf, cfg) {
  let mesh = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (o.isMesh && !mesh) mesh = o;
  });
  if (!mesh) throw new Error('monster model: no mesh');
  const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.rotateX(cfg.pitch || 0); // e.g. a bird modelled upright, laid flat to fly
  g.rotateY(cfg.yaw || 0);
  g.scale(cfg.scale || 1, cfg.scale || 1, cfg.scale || 1);
  g.computeBoundingBox();
  // feet on the ground, then the configured offset
  g.translate(0, -g.boundingBox.min.y, 0);
  if (cfg.offset) g.translate(...cfg.offset);

  const names = Object.keys(cfg.segments);
  const segs = names.map((n) => {
    const list = Array.isArray(cfg.segments[n][0][0]) ? cfg.segments[n] : [cfg.segments[n]];
    return list.map((sg) => sg.map((p) => new THREE.Vector3(...p)));
  });
  const sharp = cfg.sharpness ?? 4;
  const minW = cfg.minWeight ?? 0;
  const pos = g.attributes.position;
  const si = new Uint16Array(pos.count * 4);
  const sw = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3();
  const w = new Float32Array(names.length);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    for (let j = 0; j < names.length; j++) {
      let d = Infinity;
      for (const [a, b] of segs[j]) d = Math.min(d, segDist(p, a, b));
      w[j] = 1 / Math.pow(d + 0.02, sharp);
    }
    // keep the four strongest; minWeight drops faint pulls from far parts, which would leave
    // spikes behind when a limb swings a long way (a golem's arms over its head)
    const order = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 4);
    const total = order.reduce((s, j) => s + w[j], 0);
    while (order.length > 1 && w[order[order.length - 1]] / total < minW) order.pop();
    const sum = order.reduce((s, j) => s + w[j], 0);
    order.forEach((j, k) => {
      si[i * 4 + k] = j;
      sw[i * 4 + k] = w[j] / sum;
    });
  }
  // `rigid`: a model built of separate hard pieces (the warden golem's stones and shield) moves each
  // piece whole with the bone nearest it, so stones never stretch, shear or follow another limb
  if (cfg.rigid) g.setAttribute('pieceC', new THREE.BufferAttribute(rigidPieces(g, si, sw, names, segs, sharp, cfg.dropPiece), 4));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.userData.shared = true;
  const map = mesh.material.map || null;
  if (map) map.userData.shared = true;
  return { geometry: g, map, bones: names, cfg };
}

/**
 * Give every connected piece of the mesh (joined by shared corners, across UV seams) the bone whose
 * segments lie nearest its middle, so a stone near another limb (a leg stone beside the fist) never
 * follows it. A piece whose middle sits between two joined bones (the lava knot of an elbow or knee)
 * is shared by those two only, with smooth weights, so it stays attached to both.
 */
function rigidPieces(g, si, sw, names, segs, sharp, drop = null) {
  const pos = g.attributes.position, n = pos.count, parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (seen.has(key)) join(i, seen.get(key)); else seen.set(key, i);
  }
  const ix = g.index ? g.index.array : null;
  if (ix) for (let t = 0; t < ix.length; t += 3) { join(ix[t], ix[t + 1]); join(ix[t], ix[t + 2]); }
  else for (let t = 0; t < n; t += 3) { join(t, t + 1); join(t, t + 2); }
  const mid = new Map(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let m = mid.get(r);
    if (!m) mid.set(r, (m = [new THREE.Vector3(), 0]));
    m[0].add(p.fromBufferAttribute(pos, i)); m[1]++;
  }
  const dist = (q, j) => Math.min(...segs[j].map(([a, b]) => segDist(q, a, b)));
  const joined = new Set();
  for (const s of ['L', 'R']) for (const [a, b] of [[`leg${s}`, `knee${s}`], [`arm${s}`, `elbow${s}`], ['hips', `leg${s}`], ['torso', `arm${s}`]]) joined.add(a + '|' + b).add(b + '|' + a);
  for (const [a, b] of [['torso', 'head'], ['hips', 'torso']]) joined.add(a + '|' + b).add(b + '|' + a);
  const pick = new Map();
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const centre = new Map();
  for (const [r, [sum, count]] of mid) {
    const c = sum.divideScalar(count).clone();
    centre.set(r, c);
    const order = names.map((_, j) => j).sort((x, y) => dist(c, x) - dist(c, y));
    const [b1, b2] = order, d1 = dist(c, b1), d2 = dist(c, b2);
    pick.set(r, joined.has(names[b1] + '|' + names[b2]) && d2 < d1 * 1.3 ? [b1, b2] : [b1]);
  }
  for (let i = 0; i < n; i++) {
    const bs = pick.get(find(i));
    si.fill(0, i * 4, i * 4 + 4); sw.fill(0, i * 4, i * 4 + 4);
    if (bs.length === 1) { si[i * 4] = bs[0]; sw[i * 4] = 1; continue; }
    p.fromBufferAttribute(pos, i);
    const w1 = 1 / Math.pow(dist(p, bs[0]) + 0.02, sharp), w2 = 1 / Math.pow(dist(p, bs[1]) + 0.02, sharp);
    si[i * 4] = bs[0]; sw[i * 4] = w1 / (w1 + w2);
    si[i * 4 + 1] = bs[1]; sw[i * 4 + 1] = w2 / (w1 + w2);
  }
  // per vertex: its piece's middle and when it moves in a transformation (0 the feet .. 1 the head);
  // the pieces near `drop` (the shield) add 2, so the shader can set them down on their own
  const dropSeg = drop && drop.segment.map((q) => new THREE.Vector3(...q));
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = centre.get(find(i));
    out[i * 4] = c.x; out[i * 4 + 1] = c.y; out[i * 4 + 2] = c.z;
    out[i * 4 + 3] = (c.y - minY) / (maxY - minY) + (dropSeg && segDist(c, dropSeg[0], dropSeg[1]) < drop.radius ? 2 : 0);
  }
  return out;
}

/**
 * A second, rigid form of a monster (data/models.json monsters.<type>.ball: the warden curled into
 * a boulder): scaled by cfg.scale and centred on the origin, so it can spin about its middle.
 */
export function prepareMonsterForm(gltf, cfg) {
  let mesh = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (o.isMesh && !mesh) mesh = o;
  });
  if (!mesh) throw new Error('monster form: no mesh');
  const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.scale(cfg.scale || 1, cfg.scale || 1, cfg.scale || 1);
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  g.userData.shared = true;
  const map = mesh.material.map || null;
  if (map) map.userData.shared = true;
  return { geometry: g, map, radius: (g.boundingBox.max.y - g.boundingBox.min.y) / 2 };
}

// glow: how far the colour ignores the lighting (1 = unlit, for spirits that give off light)
// Transformation of a `rigid` model (the warden golem <-> its boulder), on the GPU after skinning:
// uAssemble 1 is the golem; going down to 0 each stone, the head first, tumbles along an arc into its
// place in a ball of stones at uBall (centre, radius), shrunk to uPack of its size (0 hides them inside
// the boulder model). With uDropMode the shield pieces (pieceC.w >= 2) stay where uDrop put them
// (set down on the ground) and fly back to the arm as uShieldBack goes from 0 to 1.
const ASSEMBLE = `
{
  bool dropPiece = pieceC.w > 1.5;
  float st = dropPiece ? pieceC.w - 2.0 : pieceC.w;
  vec3 local = position - pieceC.xyz;
  float seed = st * 37.0 + pieceC.x * 11.0 + pieceC.z * 5.0;
  vec3 axis = normalize(vec3(sin(seed * 12.9), cos(seed * 7.3), sin(seed * 3.1) + 0.2));
  if (dropPiece && uDropMode > 0.5) {
    float t = uShieldBack, e = t * t * (3.0 - 2.0 * t);
    vec3 dropped = (uDrop * vec4(position, 1.0)).xyz;
    transformed = mix(dropped, transformed, e) + vec3(0.0, sin(3.14159 * t) * uBall.w * 1.4, 0.0);
  } else if (uAssemble < 0.999) {
    float t = clamp((uAssemble - st * 0.55) / 0.45, 0.0, 1.0), e = t * t * (3.0 - 2.0 * t);
    vec3 dir = normalize(pieceC.xyz - vec3(0.0, uBall.w * 1.7, 0.0) + vec3(0.0, 0.0, 1e-3));
    float ang = (1.0 - e) * 2.6, c = cos(ang), s = sin(ang);
    vec3 turned = local * c + cross(axis, local) * s + axis * dot(axis, local) * (1.0 - c);
    vec3 packed = uBall.xyz + dir * uBall.w * 0.7 * uPack + turned * 0.5 * uPack;
    transformed = mix(packed, transformed, e) + vec3(0.0, sin(3.14159 * t) * uBall.w * 0.5, 0.0);
  }
}`;

function modelMaterial(map, flash, rim, glow, assemble = null) {
  const m = new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() });
  m.userData.rig = true;
  m.onBeforeCompile = (shader) => {
    if (assemble) {
      Object.assign(shader.uniforms, assemble);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 pieceC;\nuniform float uAssemble, uPack, uDropMode, uShieldBack;\nuniform vec4 uBall;\nuniform mat4 uDrop;')
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + ASSEMBLE);
    }
    shader.uniforms.uFlash = flash;
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uGlow = { value: glow };
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uFlash; uniform float uRim; uniform float uGlow;').replace(
      '#include <opaque_fragment>',
      `{
  vec3 vdir = normalize(vViewPosition);
  float rimK = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), 3.0) * uRim;
  outgoingLight = mix(outgoingLight, diffuseColor.rgb * 1.15, uGlow);
  outgoingLight += vec3(1.0, 0.97, 0.9) * rimK * 0.5;
  outgoingLight = mix(outgoingLight, vec3(1.0), clamp(uFlash.x, 0.0, 1.0));
  outgoingLight += vec3(1.0, 0.45, 0.15) * uFlash.y + vec3(0.5, 0.8, 1.0) * uFlash.z;
}
#include <opaque_fragment>`
    );
  };
  m.customProgramCacheKey = () => (assemble ? 'monster-toon-assemble' : 'monster-toon');
  return m;
}

/**
 * Swap a freshly built procedural monster rig (root at the origin, unscaled) for the model:
 * move the listed bones onto the model's joints, drop the procedural parts, and skin the model
 * to the rig's bones.
 */
export function attachMonsterModel(rig, T) {
  const cfg = T.cfg;
  for (const [name, p] of Object.entries(cfg.bones || {})) {
    const b = rig.bones[name];
    if (!b) continue;
    b.position.fromArray(p);
    b.userData.rest?.pos.copy(b.position);
  }
  // procedural parts on the "keep" bones stay (e.g. a wisp's orbiting motes)
  const kept = new Set((cfg.keep || []).map((n) => rig.bones[n]));
  const old = [];
  const isKept = (o) => o && (kept.has(o) || isKept(o.parent));
  rig.root.traverse((o) => o.isMesh && !isKept(o.parent) && old.push(o));
  for (const o of old) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  rig.root.updateMatrixWorld(true);
  const bones = T.bones.map((n) => rig.bones[n]);
  const skeleton = new THREE.Skeleton(bones, bones.map((b) => b.matrixWorld.clone().invert()));
  // rest space -> bone space, so effects can find a limb's tip on the posed rig (monster-trails.js)
  rig.restInverse = Object.fromEntries(T.bones.map((n, i) => [n, skeleton.boneInverses[i]]));
  // per rig: how far it is assembled, for its animator (rigid models only)
  rig.assemble = cfg.rigid ? { uAssemble: { value: 1 }, uPack: { value: 1 }, uDropMode: { value: 0 }, uShieldBack: { value: 1 }, uBall: { value: new THREE.Vector4(0, 1, 0, 1) }, uDrop: { value: new THREE.Matrix4() } } : null;
  const mat = modelMaterial(T.map, rig.material.userData.flash, cfg.rim ?? 0.3, cfg.glow ?? 0, rig.assemble);
  // a model of open shells (Meshy's stones are hollow at their backs): their insides are drawn in
  // their own texture, not the dark outline behind them, when a limb swings round
  if (cfg.rigid) mat.side = THREE.DoubleSide;
  const mats = [mat];
  if (cfg.outline !== false) {
    const hull = hullMaterial(cfg.outline || '#2a2230', cfg.outlineWidth ?? 0.02);
    hull.userData.rig = true;
    // behind a thin open piece (a shield seen from its back) the hull would draw over it: pushed back
    if (cfg.rigid) Object.assign(hull, { polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 });
    mats.push(hull);
  }
  rig.modelMeshes = [];
  for (const m of mats) {
    const mesh = new THREE.SkinnedMesh(T.geometry, m);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
    mesh.castShadow = m === mat;
    mesh.receiveShadow = m === mat; // never light the outline hull
    rig.root.add(mesh);
    rig.modelMeshes.push(mesh);
  }
  // the second form (hidden until the animator swaps to it), with the same toon look and outline
  if (T.ball) {
    const form = new THREE.Group();
    form.name = 'ball';
    form.visible = false;
    // `ball.glow`: it lights itself a little, so its far side does not go dark as it spins
    const bmat = modelMaterial(T.ball.map, rig.material.userData.flash, cfg.rim ?? 0.3, cfg.ball.glow ?? cfg.glow ?? 0);
    const bm = [bmat];
    if (cfg.outline !== false) {
      const hull = hullMaterial(cfg.outline || '#2a2230', cfg.outlineWidth ?? 0.02);
      hull.userData.rig = true;
      bm.push(hull);
    }
    for (const m of bm) {
      const mesh = new THREE.Mesh(T.ball.geometry, m);
      mesh.castShadow = m === bmat;
      mesh.receiveShadow = m === bmat;
      form.add(mesh);
    }
    form.userData.radius = T.ball.radius;
    rig.root.add(form);
    rig.ballForm = form;
  }
  // the stealth fade (view.js) also fades the model's own materials
  rig.modelMaterial = mat;
  rig.modelHull = mats[1] || null;
  rig.model = true;
  rig.modelCfg = cfg; // animators read per-model tuning (e.g. the viper's wave)
  return rig;
}
