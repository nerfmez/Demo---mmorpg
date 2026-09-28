// Anime hair built from locks: tapered, flattened strands that follow the scalp and then fall
// with gravity, over a skull cap. One merged mesh per style (shared geometry), a per-rig toon
// material coloured from the look with a jagged "angel ring" highlight, and an outline hull.
// Head space is the procedural head bone's: skull centre (0, 0.12, 0), radius about 0.135,
// face toward +Z; skinned heads refit it (skinned.js headFit).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonRamp } from './toon.js';
import { hullMaterial } from './patch.js';

const C = new THREE.Vector3(0, 0.12, 0); // skull centre
const R = 0.138; // scalp radius the locks start on
const SEG = 7; // points per lock
const RING = 6; // cross-section vertices

const sphere = (pol, az, r) => new THREE.Vector3(Math.sin(pol) * Math.sin(az) * r, Math.cos(pol) * r, Math.sin(pol) * Math.cos(az) * r).add(C);

/**
 * A lock's centre line: from its root (polar angle from the crown, azimuth from the front)
 * it runs down over the scalp until `hang`, then falls. flare lifts it off the head toward
 * the tip; tip [x, y, z] bends the last part (a flick).
 */
function lockPath({ pol, az, len, dAz = 0, hang = 1.55, flare = 0.01, tip = [0, 0, 0], up = false }) {
  const pts = [];
  const tipV = new THREE.Vector3(...tip);
  let p = pol, a = az;
  for (let i = 0; i < SEG; i++) {
    const t = i / (SEG - 1);
    const r = R + 0.004 + flare * t * t;
    let v;
    if (up) {
      // a spike standing up from the crown (ahoge)
      v = sphere(p, a, R).add(new THREE.Vector3(Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3).normalize().multiplyScalar(len * t));
    } else if (p < hang) {
      v = sphere(p, a, r);
      p += len / (SEG - 1) / r;
      a += dAz / (SEG - 1);
    } else {
      // past `hang` the lock falls straight down, drifting a little outward
      v = pts[i - 1].clone().add(new THREE.Vector3(Math.sin(a) * flare * 0.4, -len / (SEG - 1), Math.cos(a) * flare * 0.4));
    }
    v.addScaledVector(tipV, t * t * t);
    pts.push(v);
  }
  return pts;
}

/** A flattened, tapered tube along pts: wide across the head, thin away from it. */
function lockGeometry(pts, width, thick) {
  const pos = [];
  const idx = [];
  const T = new THREE.Vector3(), out = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    T.subVectors(b, a).normalize();
    out.subVectors(pts[i], C).normalize();
    B.crossVectors(T, out).normalize();
    N.crossVectors(B, T).normalize();
    const taper = Math.pow(1 - t, 0.85) * (0.75 + 0.25 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5));
    for (let j = 0; j < RING; j++) {
      const ang = (j / RING) * Math.PI * 2;
      const v = pts[i].clone().addScaledVector(B, Math.cos(ang) * width * taper).addScaledVector(N, Math.sin(ang) * thick * taper);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < RING; j++) {
      const a = i * RING + j, b = i * RING + ((j + 1) % RING), c = a + RING, d = b + RING;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Styles: locks as data. pol/az in radians (az 0 = front, + = character's left), len in metres.
const jag = (i) => [0.012, -0.008, 0.016, -0.004, 0.01, -0.012, 0.006][i % 7];
function bangs(n, from, to, len, extra = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const az = from + ((to - from) * i) / (n - 1);
    out.push({ pol: 0.4 + jag(i + 1) * 2, az, len: len + jag(i) * 1.8, w: 0.03, th: 0.012, dAz: -az * 0.15, hang: 2, flare: 0.012, tip: [Math.sin(az) * 0.014 + jag(i) * 0.6, 0, 0.008], ...extra });
  }
  return out;
}
function ring(n, from, to, pol, len, extra = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const az = from + ((to - from) * i) / Math.max(1, n - 1);
    out.push({ pol, az, len: len + jag(i + 3), w: 0.042, th: 0.014, ...extra });
  }
  return out;
}

const STYLES = {
  // the hero sheet: shaggy, bangs to the brows, side locks to the jaw, a layered spiky back
  messy: [
    ...bangs(6, -0.75, 0.75, 0.115),
    ...ring(2, 1.35, 1.75, 0.5, 0.2, { hang: 1.5, flare: 0.02, tip: [0, 0, 0.02] }),
    ...ring(2, -1.35, -1.75, 0.5, 0.2, { hang: 1.5, flare: 0.02, tip: [0, 0, 0.02] }),
    ...ring(7, 2.1, 4.18, 0.35, 0.25, { hang: 1.95, flare: 0.05, w: 0.05 }),
    ...ring(5, 2.4, 3.88, 0.75, 0.18, { hang: 2.1, flare: 0.06, w: 0.045 }),
    { pol: 0.15, az: 2.8, len: 0.09, w: 0.022, th: 0.01, up: true, tip: [0.02, 0, -0.03] },
    { pol: 0.2, az: 3.6, len: 0.07, w: 0.02, th: 0.009, up: true, tip: [-0.02, 0, -0.02] },
  ],
  // neat side part: bangs swept to the character's left, tidy back
  swept: [
    ...bangs(6, -0.6, 0.8, 0.12, { dAz: 0.35, pol: 0.3, tip: [0.02, 0, 0.01] }),
    ...ring(2, 1.35, 1.75, 0.5, 0.17, { hang: 1.5, flare: 0.012 }),
    ...ring(2, -1.35, -1.75, 0.5, 0.15, { hang: 1.5, flare: 0.012 }),
    ...ring(7, 2.1, 4.18, 0.35, 0.22, { hang: 1.95, flare: 0.015, w: 0.05 }),
  ],
  // short crop: short fringe and a close back
  short: [
    ...bangs(5, -0.6, 0.6, 0.075, { flare: 0.006 }),
    ...ring(2, 1.4, 1.8, 0.55, 0.11, { hang: 1.6, flare: 0.006 }),
    ...ring(2, -1.4, -1.8, 0.55, 0.11, { hang: 1.6, flare: 0.006 }),
    ...ring(7, 2.1, 4.18, 0.4, 0.16, { hang: 2.1, flare: 0.012, w: 0.05 }),
  ],
  // fringe and long sides; the tail itself hangs from its own bone (spring motion)
  ponytail: [
    ...bangs(5, -0.65, 0.65, 0.11),
    ...ring(2, 1.3, 1.7, 0.5, 0.24, { hang: 1.5, flare: 0.015, w: 0.03 }),
    ...ring(2, -1.3, -1.7, 0.5, 0.24, { hang: 1.5, flare: 0.015, w: 0.03 }),
    ...ring(7, 2.1, 4.18, 0.35, 0.2, { hang: 2.3, flare: 0.004, w: 0.05 }),
  ],
};
export const HAIR_STYLES = Object.keys(STYLES);

/** Tail locks in the tail bone's space (it sits at the back of the crown and swings). */
function tailGeometry() {
  const locks = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.sin(a) * 0.018, z = Math.cos(a) * 0.018;
    const pts = [];
    for (let k = 0; k < SEG; k++) {
      const t = k / (SEG - 1);
      pts.push(new THREE.Vector3(x * (1 + t), -0.36 * t, z - 0.05 * t * t + 0.02 * Math.sin(a) * t));
    }
    locks.push(lockGeometryAround(pts, 0.03, 0.02));
  }
  locks.push(new THREE.SphereGeometry(0.035, 8, 6).toNonIndexed());
  return merge(locks);
}
// tail strands flatten around the tail's own axis rather than the skull
function lockGeometryAround(pts, w, th) {
  const saved = C.clone();
  C.set(0, 0, 0.3); // a point in front of the tail, so the strands lie flat on its back
  const g = lockGeometry(pts, w, th);
  C.copy(saved);
  return g;
}

function merge(list) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const m = mergeGeometries(flat);
  m.computeVertexNormals();
  m.userData.shared = true;
  return m;
}

function capGeometry() {
  // the skull, cut along a hairline that is high over the forehead, lower at the temples and
  // lowest at the nape: points below it are pulled up onto it
  const g = new THREE.SphereGeometry(R, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const az = Math.abs(Math.atan2(x, z)); // 0 front .. PI back
    const lim = Math.PI * (az < Math.PI / 2 ? 0.37 + 0.19 * Math.pow(az / (Math.PI / 2), 1.6) : 0.56 + 0.2 * ((az - Math.PI / 2) / (Math.PI / 2)));
    const pol = Math.acos(Math.max(-1, Math.min(1, y / R)));
    if (pol > lim) {
      const s = Math.sin(lim) / Math.max(1e-6, Math.sin(pol));
      p.setXYZ(i, x * s, R * Math.cos(lim), z * s);
    }
  }
  g.translate(C.x, C.y, C.z - 0.004);
  return [g];
}

const cache = new Map();
function styleGeometry(style) {
  if (cache.has(style)) return cache.get(style);
  const parts = capGeometry();
  for (const l of STYLES[style] || STYLES.messy) parts.push(lockGeometry(lockPath(l), l.w ?? 0.04, l.th ?? 0.013));
  const g = merge(parts);
  cache.set(style, g);
  return g;
}
let tailGeo = null;

/** Toon hair material with the angel-ring highlight; flash is the rig's hit-flash uniform. */
function hairMaterial(color, flash) {
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: toonRamp() });
  m.userData.rig = true;
  // the ring is a lighter, livelier tint of the hair colour, not grey
  const hsl = new THREE.Color(color).getHSL({});
  const ringCol = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.15), Math.min(0.82, hsl.l + 0.32));
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = flash || { value: new THREE.Vector3() };
    shader.uniforms.uRing = { value: ringCol };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlash; uniform vec3 uRing; varying vec3 vObjPos; varying vec3 vObjN;')
      .replace(
        '#include <opaque_fragment>',
        `{
  // angel ring: a jagged band around the upper skull, on surfaces that face up and out
  vec3 d = normalize(vObjPos - vec3(0.0, 0.12, 0.0));
  float az = atan(d.x, d.z);
  float lat = d.y + 0.035 * sin(az * 11.0) + 0.02 * sin(az * 5.0 + 1.3);
  float band = smoothstep(0.52, 0.6, lat) * (1.0 - smoothstep(0.7, 0.8, lat));
  band *= smoothstep(0.2, 0.6, normalize(vObjN).y + 0.35) * step(0.0, dot(normalize(vObjN), d));
  outgoingLight = mix(outgoingLight, uRing, band * 0.7);
  outgoingLight = mix(outgoingLight, vec3(1.0), clamp(uFlash.x, 0.0, 1.0));
  outgoingLight += vec3(1.0, 0.45, 0.15) * uFlash.y + vec3(0.5, 0.8, 1.0) * uFlash.z;
}
#include <opaque_fragment>`
      );
  };
  m.customProgramCacheKey = () => 'hair-toon';
  return m;
}

/**
 * Hair for a rig: adds the style's mesh (and outline) to the head bone, and the ponytail's
 * tail to rig.bones.tail when the style has one. Call after rb.build().
 */
export function attachHair(rig, style, color, { outline = 0.012 } = {}) {
  const mat = hairMaterial(color, rig.material?.userData.flash);
  const hull = hullMaterial(new THREE.Color(color).multiplyScalar(0.35), outline);
  hull.userData.rig = true;
  const add = (bone, geo) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    bone.add(mesh, new THREE.Mesh(geo, hull));
  };
  add(rig.bones.head, styleGeometry(style));
  if (style === 'ponytail' && rig.bones.tail) add(rig.bones.tail, (tailGeo ||= tailGeometry()));
}
