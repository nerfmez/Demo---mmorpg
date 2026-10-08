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
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.userData.shared = true;
  const map = mesh.material.map || null;
  if (map) map.userData.shared = true;
  return { geometry: g, map, bones: names, cfg };
}

// glow: how far the colour ignores the lighting (1 = unlit, for spirits that give off light)
function modelMaterial(map, flash, rim, glow) {
  const m = new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() });
  m.userData.rig = true;
  m.onBeforeCompile = (shader) => {
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
  m.customProgramCacheKey = () => 'monster-toon';
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
  const mat = modelMaterial(T.map, rig.material.userData.flash, cfg.rim ?? 0.3, cfg.glow ?? 0);
  const mats = [mat];
  if (cfg.outline !== false) {
    const hull = hullMaterial(cfg.outline || '#2a2230', cfg.outlineWidth ?? 0.02);
    hull.userData.rig = true;
    mats.push(hull);
  }
  for (const m of mats) {
    const mesh = new THREE.SkinnedMesh(T.geometry, m);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
    mesh.castShadow = m === mat;
    mesh.receiveShadow = m === mat; // never light the outline hull
    rig.root.add(mesh);
  }
  // the stealth fade (view.js) also fades the model's own materials
  rig.modelMaterial = mat;
  rig.modelHull = mats[1] || null;
  rig.model = true;
  rig.modelCfg = cfg; // animators read per-model tuning (e.g. the viper's wave)
  return rig;
}
