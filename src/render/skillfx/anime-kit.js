// Anime (sakuga) effect pieces (owner, 2026-10-26: "ทำแบบอนิเมะ"). The rules come from hand-drawn
// effects animation (drawn flipbooks where we have them): designed shapes with hard edges and flat fills (a white core, one saturated band,
// a darker hue-shifted shadow band), shapes redrawn on a 12-drawings-per-second grid instead of
// moving smoothly, solid cel smoke that dies by holes opening inside it, sharp asymmetric spikes for
// flashes, and few big shapes with many small accents. No soft additive haze. See docs/VFX-REFERENCE.md.
import * as THREE from 'three';
import fireSheetURL from '../../../assets/vfx/anime-sheets/anime_fire_3x2.png';
import smokeSheetURL from '../../../assets/vfx/anime-sheets/anime_smoke_3x2.png';

export const DRAWINGS = 12;
/** The drawing index for an effect clock: shapes change only when this changes. */
export const drawingOf = (t) => Math.floor(t * DRAWINGS);

const HASH = `
  float hh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vq(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
  float tri(float x){ return 1.0 - abs(fract(x + 0.5) - 0.5) * 2.0; }`;
const UV_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

// fire palette for drawn shapes (flash, warning): core, body, edge, shadow
export const ANIME_FIRE = {
  fire: ['#fffbe6', '#ffd23f', '#ff7a1a', '#b5301b'],
};

// Drawn flipbook sheets (assets/vfx/anime-sheets, a trial with the owner's reference images): a
// camera-facing quad shows one cell; frames step on the drawing grid, never blend.
export const SHEETS = {
  fire: { url: fireSheetURL, cols: 3, rows: 2, frames: 5 },   // birth, grow, peak, break-up, embers
  smoke: { url: smokeSheetURL, cols: 3, rows: 2, frames: 6 },
};
const sheetTex = new Map();
function sheetTexture(name) {
  if (sheetTex.has(name)) return sheetTex.get(name);
  const t = new THREE.TextureLoader().load(SHEETS[name].url);
  t.colorSpace = THREE.NoColorSpace; t.userData.shared = true; sheetTex.set(name, t); return t;
}
const SHEET_FS = `varying vec2 vUv; uniform sampler2D uMap; uniform vec2 uGrid; uniform float uFrame; uniform float uFlip; uniform float uA;
  void main(){
    vec2 q = vec2(uFlip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    float col = mod(uFrame, uGrid.x), row = floor(uFrame / uGrid.x);
    vec4 c = texture2D(uMap, vec2((col + q.x) / uGrid.x, 1.0 - (row + 1.0 - q.y) / uGrid.y));
    if (c.a < 0.04) discard;
    gl_FragColor = vec4(c.rgb, c.a * uA); }`;
export function sheetMaterial(name) {
  const sh = SHEETS[name];
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: sheetTexture(name) }, uGrid: { value: new THREE.Vector2(sh.cols, sh.rows) }, uFrame: { value: 0 }, uFlip: { value: 0 }, uA: { value: 1 } },
    vertexShader: UV_VS, fragmentShader: SHEET_FS, transparent: true, depthWrite: false,
  });
}
/** The frame of a sheet played once over dur seconds on the drawing grid; ease < 1 reaches the peak
 *  early (an explosion grows in a few drawings, then decays slowly). */
export function sheetFrame(age, dur, first, last, ease = 1) {
  const u = Math.min(0.999, Math.max(0, (drawingOf(age) / DRAWINGS) / dur));
  return first + Math.floor(Math.pow(u, ease) * (last - first + 1));
}
const _q2 = new THREE.Quaternion(), _zz = new THREE.Vector3(0, 0, 1);
/** Faces a quad to the camera, turned by roll radians about the view axis. */
export function faceCamera(mesh, camera, roll = 0) {
  mesh.quaternion.copy(camera.quaternion);
  if (roll) mesh.quaternion.multiply(_q2.setFromAxisAngle(_zz, roll));
}
const _vd = new THREE.Vector3();
/** Screen angle (radians, about the view axis) of a world direction. */
export function screenAngle(camera, dir) {
  _vd.copy(dir).transformDirection(camera.matrixWorldInverse);
  return Math.atan2(_vd.y, _vd.x);
}

// A spiky flash: 4-5 concave points of unequal length, one dominant, a white core, a coloured band.
// Redraw it (new uSeed) every drawing; never just spin it.
const SPIKE_FS = `varying vec2 vUv; uniform float uSeed; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform float uA;` + HASH + `
  void main(){
    vec2 p = vUv*2.0-1.0; float r = length(p), an = atan(p.y, p.x)/6.2832 + 0.5;
    float n = 4.0 + floor(hh(vec2(uSeed, 9.0))*2.0);
    float g = an*n + hh(vec2(uSeed, 4.0)), id = floor(g);
    float len = 0.45 + 0.4*hh(vec2(id + uSeed, 5.0)); if (mod(id, n) < 0.5) len = 0.95;
    float edge = 0.16 + len*pow(tri(g), 2.6);
    float d = edge - r, a = smoothstep(0.0, fwidth(d)*1.2, d);
    if (a <= 0.0) discard;
    float k = r/edge;
    vec3 c = r < 0.13 ? uC0 : (k < 0.55 ? uC1 : uC2);
    gl_FragColor = vec4(c, a*uA); }`;
export function spikeMaterial(el = 'fire') {
  const f = ANIME_FIRE[el] || ANIME_FIRE.fire;
  return new THREE.ShaderMaterial({
    uniforms: { uSeed: { value: 0 }, uA: { value: 1 }, uC0: { value: new THREE.Color(f[0]) }, uC1: { value: new THREE.Color(f[0]) }, uC2: { value: new THREE.Color(f[1]) } },
    vertexShader: UV_VS, fragmentShader: SPIKE_FS, transparent: true, depthWrite: false,
  });
}

// The area warning on the ground: a crisp two-tone edge at the true radius, a low fill, and an inner
// fill growing from the centre to the edge over the warning so the player can read when it lands.
const WARN_FS = `varying vec2 vUv; uniform float uR; uniform float uK; uniform float uOpen; uniform float uA;
  uniform vec3 uEdge; uniform vec3 uHot; uniform vec3 uFill;
  void main(){
    float r = length(vUv*2.0-1.0) * 1.06 * uR;            // metres from the centre
    float R = uR * (0.92 + 0.08*uOpen);
    if (r > R + 0.02) discard;
    float lw = 0.09, aa = fwidth(r)*1.2;
    float inEdge = smoothstep(R - lw - aa, R - lw, r);
    float g = uK * R;
    vec3 c = uFill; float a = 0.1;
    // the growing fill: hot diagonal hatching, so the ground (and anything standing on it) stays readable
    vec2 w = (vUv*2.0-1.0) * 1.06 * uR;
    float hatch = step(0.55, fract((w.x + w.y) * 2.2));
    if (r < g) { c = uHot; a = 0.12 + 0.5 * hatch; }
    if (r < g && r > g - 0.08) { c = uEdge; a = 0.9; }
    if (inEdge > 0.0) { c = mix(c, r > R - lw*0.5 ? uEdge : uHot, inEdge); a = mix(a, 0.95, inEdge); }
    a *= 1.0 - smoothstep(R, R + 0.02, r);
    gl_FragColor = vec4(c, a * uA * uOpen); }`;
export function warnDisc(scene, el = 'fire') {
  const f = ANIME_FIRE[el] || ANIME_FIRE.fire;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 16), new THREE.ShaderMaterial({
    uniforms: { uR: { value: 3 }, uK: { value: 0 }, uOpen: { value: 0 }, uA: { value: 1 },
      uEdge: { value: new THREE.Color(f[0]) }, uHot: { value: new THREE.Color(f[2]) }, uFill: { value: new THREE.Color(f[1]) } },
    vertexShader: UV_VS, fragmentShader: WARN_FS, transparent: true, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.visible = false; scene.add(m); return m;
}
/** A quad mesh for the sheet and spike materials (place with placeV, then faceCamera). */
export function billboard(scene, material, order = 9) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material); m.visible = false; m.renderOrder = order; scene.add(m); return m;
}
