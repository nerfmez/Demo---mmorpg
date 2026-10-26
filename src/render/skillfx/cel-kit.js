// Cel-style building blocks for the higher-tier skill effects (owner, 2026-10-26: the approved set's
// style, not its shapes). Everything is solid: flat colour bands, a same-hue dark edge, a near-white
// hot core, no soft additive glow. Energy shapes band by how squarely they face the camera (core in
// the middle, edge at the silhouette) and can be eaten away by noise as they die; strips band across
// their width; solid props (rock, ice, cloud puffs) use the game's toon ramp with an outline hull.
import * as THREE from 'three';
import { NOISE } from './fx-common.js';
import { toon, outlineMaterial } from '../toon.js';

// palettes: [core, hot, body, edge]
export const BANDS = {
  fire: ['#fff6cf', '#ffc23d', '#ff6a1f', '#a8240f'],
  lightning: ['#ffffff', '#c9f4ff', '#45b8ff', '#1d4fa8'],
  cold: ['#ffffff', '#dff6ff', '#8fd3f4', '#3f7fb8'],
  arcane: ['#fbf4ff', '#dcc1ff', '#9a6cf0', '#4b2a8f'],
  poison: ['#f7ffdc', '#c6f064', '#6fbf2a', '#2f6416'],
  physical: ['#ffffff', '#f4e6c4', '#c9a36a', '#6b4c2a'],
};
export const bandsOf = (el) => BANDS[el] || BANDS.physical;

const ENERGY_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vObj;
  void main(){ vObj=position; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const ENERGY_FS = `varying vec3 vN; varying vec3 vV; varying vec3 vObj; uniform vec3 uC0,uC1,uC2,uC3; uniform float uErode,uSeed,uT,uHot;` + NOISE + `
  void main(){ float f=abs(dot(normalize(vN),normalize(vV)));
    float n=fbm(vObj.xy*2.2+vObj.z*1.3+uSeed+vec2(0.0,-uT*2.0));
    if(n<uErode) discard;
    float h=f*0.85+n*0.3+uHot; vec3 c = h>0.95?uC0:(h>0.72?uC1:(h>0.42?uC2:uC3));
    if(n<uErode+0.05) c=uC3; // a dark rim where it is being eaten
    gl_FragColor=vec4(c,1.0); }`;
/** A solid banded energy material (one per live shape: it owns its uniforms). */
export function energyMaterial(el, side = THREE.FrontSide) {
  const b = bandsOf(el);
  return new THREE.ShaderMaterial({ vertexShader: ENERGY_VS, fragmentShader: ENERGY_FS, side,
    uniforms: { uC0: { value: new THREE.Color(b[0]) }, uC1: { value: new THREE.Color(b[1]) }, uC2: { value: new THREE.Color(b[2]) }, uC3: { value: new THREE.Color(b[3]) }, uErode: { value: -1 }, uSeed: { value: Math.random() * 9 }, uT: { value: 0 }, uHot: { value: 0 } } });
}
export function setBands(mat, el) { const b = bandsOf(el); mat.uniforms.uC0.value.set(b[0]); mat.uniforms.uC1.value.set(b[1]); mat.uniforms.uC2.value.set(b[2]); mat.uniforms.uC3.value.set(b[3]); }

// strips (Ribbon): hard bands across the width; the tint is the body colour, edges go dark
export const BAND_STRIP_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.98||vA<0.02) discard;
    vec3 c = d<0.28 ? vec3(1.0) : (d<0.62 ? mix(vT,vec3(1.0),0.35) : (d<0.82 ? vT : vT*0.45));
    gl_FragColor=vec4(c, step(0.5, vA)); }`;

// flat ground pieces (rings, sigils, stars, craters) share one plane shader family: vP in -1..1
export const FLAT_VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
export function flatMesh(fs, uniforms, order = 1, segs = 16) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, segs, segs), new THREE.ShaderMaterial({ uniforms, vertexShader: FLAT_VS, fragmentShader: fs, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = order; m.visible = false; return m;
}
export const colorUniforms = (el) => { const b = bandsOf(el); return { uC0: { value: new THREE.Color(b[0]) }, uC1: { value: new THREE.Color(b[1]) }, uC2: { value: new THREE.Color(b[2]) }, uC3: { value: new THREE.Color(b[3]) } }; };

// a camera-facing spiky star (impact flash frames), banded from the centre out
export const STAR_FS = `varying vec2 vP; uniform vec3 uC0,uC1,uC2,uC3; uniform float uK; uniform float uPts; uniform float uSeed;
  void main(){ float r=length(vP), a=atan(vP.y,vP.x);
    float spike = 0.45 + 0.55*pow(abs(cos(a*uPts*0.5+uSeed)), 6.0) * (0.7+0.3*sin(a*3.0+uSeed*2.0));
    float R = spike*(0.35+0.65*uK);
    if(r>R) discard; float k=r/R;
    vec3 c = k<0.35?uC0:(k<0.6?uC1:(k<0.85?uC2:uC3));
    gl_FragColor=vec4(c, 1.0-smoothstep(0.75,1.0,uK)); }`;

/** A chunky low-poly rock (jittered icosahedron), shared per seed. */
const rockCache = new Map();
export function rockGeometry(seed = 1, detail = 0) {
  const key = seed + '|' + detail; if (rockCache.has(key)) return rockCache.get(key);
  const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed(); const p = g.attributes.position; let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
    if (!seen.has(k)) seen.set(k, 0.78 + rnd() * 0.4);
    const f = seen.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.85, p.getZ(i) * f);
  }
  g.computeVertexNormals(); g.userData.shared = true; rockCache.set(key, g); return g;
}
/** A toon mesh with its outline hull (materials are the shared toon cache). */
export function celProp(geometry, color, outline, width = 0.035) {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geometry, toon(color)));
  grp.add(new THREE.Mesh(geometry, outlineMaterial(outline, width)));
  return grp;
}
/** A tall blade-like ice shard (triangular prism to a point), base at y=0, tip at y=1. */
let shardGeo = null;
export function shardGeometry() {
  if (shardGeo) return shardGeo;
  const s = 0.32, pts = [[0, 0, s], [s * 0.87, 0, -s * 0.5], [-s * 0.87, 0, -s * 0.5]], tip = [0.08, 1, 0], mid = (a) => [a[0] * 0.7, 0.55, a[2] * 0.7];
  const pos = [];
  for (let i = 0; i < 3; i++) { const a = pts[i], b = pts[(i + 1) % 3], ma = mid(a), mb = mid(b); pos.push(...a, ...b, ...mb, ...a, ...mb, ...ma, ...ma, ...mb, ...tip); }
  shardGeo = new THREE.BufferGeometry(); shardGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); shardGeo.computeVertexNormals(); shardGeo.userData.shared = true;
  return shardGeo;
}
let puffGeo = null;
export function puffGeometry() { if (!puffGeo) { puffGeo = new THREE.IcosahedronGeometry(1, 1); puffGeo.userData.shared = true; } return puffGeo; }
