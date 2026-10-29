// Glowing grotto water and waterfalls. One shader program each; colours, opacity and speed are
// uniforms, so every pool and fall shares its program (AGENTS.md: numbers in uniforms).
import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { floorRings, area } from './floors.js';

const WATER_VERT = `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// Clear shallow water: the floor shows through; a fine net of caustic light drifts over it (a few
// warped-sine iterations, the usual cheap caustic), with small glints that come and go. The body
// colour moves gently between the lit and the deep tone.
const WATER_FRAG = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime, uOpacity, uBands, uCaustic;
uniform vec3 uColor, uDeep, uFoam;
varying vec3 vWorld;
float caustic(vec2 q, float t) {
  vec2 p = mod(q * 6.2831, 6.2831) - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 q = vWorld.xz * uBands * 0.16;
  float net = caustic(q, uTime * 0.35);
  // glints: a sparse grid of cells, each flashing on its own beat
  vec2 cell = floor(vWorld.xz * 2.2);
  float h = hash2(cell);
  vec2 f = fract(vWorld.xz * 2.2) - 0.5;
  float glint = smoothstep(0.08, 0.0, length(f)) * step(0.93, h) * pow(max(0.0, sin(uTime * (1.5 + h * 2.0) + h * 40.0)), 6.0);
  float sway = 0.5 + 0.5 * sin(vWorld.x * 0.21 + uTime * 0.3) * sin(vWorld.z * 0.17 - uTime * 0.25);
  vec3 col = mix(uDeep, uColor, 0.45 + 0.35 * sway);
  float light = net * uCaustic + glint;
  col += uFoam * light;
  gl_FragColor = vec4(col, clamp(uOpacity + light * 0.5, 0.0, 1.0));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const FALL_VERT = `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// Falling streaks: columns of different speeds and widths scroll down, brighter at the lip, fading out at the bottom and sides.
const FALL_FRAG = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime, uSpeed, uLength;
uniform vec3 uColor, uFoam;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float cols = 14.0;
  float c = floor(vUv.x * cols);
  float fx = fract(vUv.x * cols);
  float speed = uSpeed * (0.75 + hash(c) * 0.6);
  float y = vUv.y * uLength * 0.35 + uTime * speed + hash(c + 3.1) * 10.0;
  float streak = smoothstep(0.0, 0.25, fract(y)) * smoothstep(1.0, 0.55, fract(y));
  float lane = smoothstep(0.0, 0.25, fx) * smoothstep(1.0, 0.7, fx);
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float lip = smoothstep(0.82, 1.0, vUv.y);
  float bottom = smoothstep(0.0, 0.22, vUv.y);
  vec3 col = mix(uColor, uFoam, streak * lane * 0.75 + lip * 0.6);
  float a = (0.38 + streak * lane * 0.5 + lip * 0.35) * edge * bottom;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const waterMaterial = (u) => new THREE.ShaderMaterial({
  vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uOpacity: { value: u.opacity }, uBands: { value: u.bands }, uCaustic: { value: u.caustic },
    uColor: { value: new THREE.Color(u.color) }, uDeep: { value: new THREE.Color(u.deep) }, uFoam: { value: new THREE.Color(u.foam) },
  }]),
});

const WATER = {
  shallow: { color: '#5ee6dc', deep: '#1c8fa4', foam: '#eafffb', opacity: 0.2, bands: 1.0, caustic: 0.55 },
  deep: { color: '#2fc4d8', deep: '#0b5378', foam: '#d6fbff', opacity: 0.7, bands: 0.8, caustic: 0.4 },
  sea: { color: '#3fb8cf', deep: '#1a6f9a', foam: '#ffffff', opacity: 0.84, bands: 0.9, caustic: 0.22 },
};

/** Water surfaces over every floor with a waterY, plus the waterfalls. Returns {root, update(t), dispose()}. */
export function buildWater(map, { sea = false } = {}) {
  const root = new THREE.Group();
  root.name = 'grotto-water';
  const mats = [];
  for (const f of map.floors) {
    if (f.waterY == null) continue;
    const style = sea && f.kind === 'deep' ? WATER.sea : WATER[f.kind] || WATER.deep;
    const rings = floorRings(f, 1.2);
    const shape = new THREE.Shape(rings[0].pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const r of rings.slice(1)) shape.holes.push(new THREE.Path(r.pts.map(([x, z]) => new THREE.Vector2(x, -z))));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2); // shape (x, -z) in the XY plane → (x, 0, z)
    const m = waterMaterial(style);
    mats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = f.waterY;
    mesh.renderOrder = 2;
    mesh.name = `water-${f.id}`;
    root.add(mesh);
  }
  const fallMat = [];
  const glow = glowTexture();
  for (const w of map.def.waterfalls || []) {
    const h = w.top - w.bottom;
    const m = new THREE.ShaderMaterial({
      vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uSpeed: { value: 1.6 }, uLength: { value: h },
        uColor: { value: new THREE.Color('#5fdcf0') }, uFoam: { value: new THREE.Color('#f2ffff') },
      }]),
    });
    fallMat.push(m);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(w.w, h, 1, 1), m);
    const dx = Math.sin(w.facing), dz = Math.cos(w.facing);
    fall.position.set(w.at[0] + dx * 0.25, w.bottom + h / 2, w.at[1] + dz * 0.25);
    fall.rotation.y = w.facing;
    fall.renderOrder = 3;
    root.add(fall);
    // a pale splash where it lands (skipped when it falls into the void)
    if (w.bottom > -6) {
      const splash = new THREE.Mesh(new THREE.PlaneGeometry(w.w * 1.8, w.w * 1.4), new THREE.MeshBasicMaterial({ map: glow, color: '#bff8ff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      splash.rotation.x = -Math.PI / 2;
      splash.position.set(w.at[0] + dx * 0.9, w.bottom + 0.04, w.at[1] + dz * 0.9);
      splash.renderOrder = 4;
      splash.userData.splash = true;
      root.add(splash);
    }
  }
  return {
    root,
    update(t) {
      for (const m of mats) m.uniforms.uTime.value = t;
      for (const m of fallMat) m.uniforms.uTime.value = t;
      for (const c of root.children) if (c.userData.splash) c.material.opacity = 0.45 + Math.sin(t * 6 + c.position.x) * 0.1;
    },
  };
}
