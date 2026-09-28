// Rig builder for procedural characters. Parts are authored per bone (simple shapes with a
// colour), then merged into ONE mesh per bone with vertex colours, plus one outline hull and
// one unlit "glow" mesh (eyes, cores). That keeps a whole character to a few dozen draw calls,
// which matters on iPad. One toon material per rig instance allows hit flashes and tints.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonRamp } from './toon.js';
import { patchMaterial } from './patch.js';

const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/** Toon material with vertex colours, a soft rim light and flash/tint uniforms. */
export function rigMaterial({ rim = 0.35, double = true } = {}) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp(), side: double ? THREE.DoubleSide : THREE.FrontSide });
  m.userData.flash = { value: new THREE.Vector3(0, 0, 0) };
  m.userData.rim = { value: rim };
  m.userData.opacity = { value: 1 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = m.userData.flash;
    shader.uniforms.uRim = m.userData.rim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlash; uniform float uRim;')
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
  m.customProgramCacheKey = () => 'rig-toon';
  return m;
}

export function rigHullMaterial(width, darkness = 0.3) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(darkness, darkness, darkness * 1.12), vertexColors: true, side: THREE.BackSide });
  return patchMaterial(m, { outline: width });
}

export class RigBuilder {
  constructor({ outline = 0.02, darkness = 0.3, rim = 0.35 } = {}) {
    this.root = new THREE.Group();
    this.bones = { root: this.root };
    this.parts = new Map(); // bone -> {solid:[], glow:[], plain:[]}
    this.outline = outline;
    this.darkness = darkness;
    this.rim = rim;
  }

  bone(name, parent = 'root', pos = [0, 0, 0], rot = null) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    if (rot) g.rotation.set(...rot);
    this.bones[parent].add(g);
    this.bones[name] = g;
    g.userData.rest = { pos: g.position.clone(), rot: g.rotation.clone() };
    return g;
  }

  /**
   * Add a shape to a bone. o.pos/rot/scale place it in the bone's space.
   * o.glow: unlit bright part (eyes, cores). o.plain: lit but no outline (tiny details).
   */
  add(bone, geometry, color, o = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    tmpEuler.set(...(o.rot || [0, 0, 0]));
    tmpQuat.setFromEuler(tmpEuler);
    tmpMat.compose(new THREE.Vector3(...(o.pos || [0, 0, 0])), tmpQuat, new THREE.Vector3(...(o.scale || [1, 1, 1])));
    g.applyMatrix4(tmpMat);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.parts.has(bone)) this.parts.set(bone, { solid: [], glow: [], plain: [] });
    this.parts.get(bone)[o.glow ? 'glow' : o.plain ? 'plain' : 'solid'].push(g);
    return this;
  }

  build() {
    const material = rigMaterial({ rim: this.rim });
    const hull = this.outline ? rigHullMaterial(this.outline, this.darkness) : null;
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const meshes = [];
    for (const [bone, p] of this.parts) {
      const target = this.bones[bone];
      if (p.solid.length || p.plain.length) {
        const all = [...p.solid, ...p.plain];
        const geo = mergeGeometries(all);
        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        target.add(mesh);
        meshes.push(mesh);
        if (hull && p.solid.length) {
          const h = new THREE.Mesh(p.plain.length ? mergeGeometries(p.solid) : geo, hull);
          target.add(h);
        }
      }
      if (p.glow.length) {
        const gm = new THREE.Mesh(mergeGeometries(p.glow), glowMat);
        target.add(gm);
      }
    }
    return { root: this.root, bones: this.bones, material, hull, glowMat, meshes };
  }
}

// ---------- animation helpers ----------

export const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
export const easeIn = (t) => t * t * t;

/**
 * Keyframed pose track: keys = [[t, {bone: [rx, ry, rz], ...}], ...] with t in 0..1.
 * Returns the smoothly interpolated pose at time t.
 */
export function samplePose(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (t <= t1) {
      const u = smoother(clamp01((t - t0) / (t1 - t0 || 1)));
      const out = {};
      const names = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const n of names) {
        const va = a[n] || b[n];
        const vb = b[n] || a[n];
        out[n] = [va[0] + (vb[0] - va[0]) * u, va[1] + (vb[1] - va[1]) * u, va[2] + (vb[2] - va[2]) * u];
      }
      return out;
    }
  }
  return keys[keys.length - 1][1];
}

/** A damped spring on a scalar, for secondary motion (tails, hair, ears). */
export class Spring {
  constructor(stiffness = 60, damping = 8) {
    this.x = 0;
    this.v = 0;
    this.k = stiffness;
    this.d = damping;
  }
  update(target, dt) {
    const h = Math.min(dt, 1 / 30);
    const a = (target - this.x) * this.k - this.v * this.d;
    this.v += a * h;
    this.x += this.v * h;
    return this.x;
  }
  kick(v) {
    this.v += v;
  }
}

/** Set rotations of named bones from a pose, blended with weight w over existing values. */
export function applyPose(bones, pose, w = 1) {
  for (const n in pose) {
    const b = bones[n];
    if (!b) continue;
    const r = pose[n];
    if (w >= 1) b.rotation.set(r[0], r[1], r[2]);
    else {
      b.rotation.x += (r[0] - b.rotation.x) * w;
      b.rotation.y += (r[1] - b.rotation.y) * w;
      b.rotation.z += (r[2] - b.rotation.z) * w;
    }
  }
}

/** Flash / tint helpers on a rig material. */
export function setFlash(material, white = 0, warm = 0, cool = 0) {
  material.userData.flash.value.set(white, warm, cool);
}
