// Anime (sakuga) effect pieces (owner, 2026-10-26: "ทำแบบอนิเมะ"). The rules come from hand-drawn
// effects animation: designed shapes with hard edges and flat fills (a white core, one saturated band,
// a darker hue-shifted shadow band), shapes redrawn on a 12-drawings-per-second grid instead of
// moving smoothly, solid cel smoke that dies by holes opening inside it, sharp asymmetric spikes for
// flashes, and few big shapes with many small accents. No soft additive haze. See docs/VFX-REFERENCE.md.
import * as THREE from 'three';

export const DRAWINGS = 12;
/** The drawing index for an effect clock: shapes change only when this changes. */
export const drawingOf = (t) => Math.floor(t * DRAWINGS);

const HASH = `
  float hh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vq(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
  float tri(float x){ return 1.0 - abs(fract(x + 0.5) - 0.5) * 2.0; }`;
// colours as written (display values, like the literals in the other effect shaders), no sRGB->linear
const raw = (h) => new THREE.Color().setStyle(h, THREE.LinearSRGBColorSpace);
const UV_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

// fire palette for drawn shapes (flash, warning): core, body, edge, shadow
export const ANIME_FIRE = {
  fire: ['#fffbe6', '#ffd23f', '#ff7a1a', '#b5301b'],
};

// Cel fire, built live (owner, 2026-10-26: make the effect, never paste pictures). The shape language
// is studied from hand-drawn anime fire: a mass of round lobes with big curling flame tongues rising
// off it; a pale yellow core in front with its own tongue edges and an orange crescent; an orange body
// with a dark red crescent on the side away from the light and a thin dark line; dark plum cel smoke.
// Every flame is one camera-facing quad (all of them in one instanced mesh, refilled each frame like a
// Ribbon): a teardrop SDF (a scalloped round body, a tongue that narrows to a curled tip, an optional
// side tongue), banded flat, redrawn when its seed changes (once per drawing).
export const FLAME = { BODY: 0, CORE: 1, SMOKE: 2 };
const FLAME_VS = `attribute vec4 iPos; attribute vec4 iShape; attribute vec4 iLook; varying vec2 vUv; varying vec4 vShape; varying vec4 vLook; varying vec2 vLight;
  // iPos: xyz, roll; iShape: seed, tip, curl, side; iLook: kind, cool, hole, alpha. size in instance scale
  attribute vec2 iSize;
  void main(){ vUv = position.xy*2.0; vShape = iShape; vLook = iLook;
    vLight = vec2(cos(-iPos.w)*0.55 - sin(-iPos.w)*0.83, sin(-iPos.w)*0.55 + cos(-iPos.w)*0.83) * 0.12; // away from the screen's up-left light, in the quad's frame
    vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
    float c = cos(iPos.w), s = sin(iPos.w); vec2 o = position.xy * iSize;
    mv.xy += vec2(c*o.x - s*o.y, s*o.x + c*o.y);
    gl_Position = projectionMatrix * mv; }`;
const FLAME_FS = `varying vec2 vUv; varying vec4 vShape; varying vec4 vLook; varying vec2 vLight;
  uniform vec3 uCore; uniform vec3 uCoreShade; uniform vec3 uBody; uniform vec3 uBodyShade; uniform vec3 uLine;
  uniform vec3 uCool; uniform vec3 uCoolShade; uniform vec3 uSmoke; uniform vec3 uSmokeShade;` + HASH + `
  float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0 - h); }
  float tongueD(vec2 q, float H, float w0, float curl){
    if (q.y <= 0.0) return length(vec2(q.x, q.y*1.6)) - w0;
    float y = q.y / H; if (y >= 1.0) return length(q - vec2(curl*0.3*H, H));
    float x = q.x - curl*0.3*H*y*y;
    return abs(x) - w0*pow(1.0 - y, 1.15)*(1.0 + 0.25*sin(3.1416*y)); }
  float shape(vec2 p, float seed, float tip, float curl, float side, float kind){
    vec2 c = vec2(0.0, -0.32); vec2 q = p - c;
    float n = 5.0 + floor(hh(vec2(seed, 1.0))*3.0), an = atan(q.y, q.x);
    float r = 0.56 * (0.9 + 0.1*abs(sin(an*n*0.5 + hh(vec2(seed, 2.0))*6.0)));
    if (kind > 1.5 || tip <= 0.0) r = 0.62 * (0.82 + 0.18*abs(sin(an*n*0.5 + hh(vec2(seed, 2.0))*6.0)));   // cloud lobes
    float d = length(q) - r;
    if (tip > 0.0) {
      d = smin(d, tongueD(q, tip, 0.42, curl), 0.12);
      if (abs(side) > 0.0) {
        float a = -side*0.75; vec2 q2 = mat2(cos(a), -sin(a), sin(a), cos(a)) * (q - vec2(side*0.2, 0.05));
        d = smin(d, tongueD(q2, tip*0.55, 0.24, -side*0.6), 0.1);
      }
    }
    return d; }
  void main(){
    float seed = vShape.x, tip = vShape.y, curl = vShape.z, side = vShape.w, kind = vLook.x;
    float d = shape(vUv, seed, tip, curl, side, kind);
    float aa = fwidth(d) * 1.2, a = 1.0 - smoothstep(-aa, 0.0, d);
    if (a <= 0.0) discard;
    if (vLook.z > 0.0 && vq(vUv*2.4 + seed*7.0) < vLook.z) discard;
    // the side away from the light (light up-left): sample the shape shifted toward the light
    bool shade = shape(vUv + vLight, seed, tip, curl, side, kind) > 0.0;
    vec3 c;
    if (kind > 1.5) c = shade ? uSmokeShade : uSmoke;
    else if (kind > 0.5) c = shade ? uCoreShade : uCore;
    else { float cool = vLook.y; c = shade ? (cool > 0.5 ? uCoolShade : uBodyShade) : (cool > 0.5 ? uCool : uBody); }
    if (kind < 0.5 || kind > 1.5) if (d > -0.04) c = uLine;
    gl_FragColor = vec4(c, a * vLook.w); }`;
export const FIRE_LOOK = {
  fire: { core: '#ffeb94', coreShade: '#ffa03a', body: '#ff7d1c', bodyShade: '#bc3418', line: '#6a1c16', cool: '#b23c1c', coolShade: '#6e2218', smoke: '#86687a', smokeShade: '#5c4258' },
};
export class AnimeFire {
  constructor(scene, max, el = 'fire') {
    const L = FIRE_LOOK[el] || FIRE_LOOK.fire, col = (h) => ({ value: raw(h) });
    const geo = new THREE.InstancedBufferGeometry(); geo.copy(new THREE.PlaneGeometry(1, 1));
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 4); this.shp = new Float32Array(max * 4); this.look = new Float32Array(max * 4); this.size = new Float32Array(max * 2);
    for (const [k, arr, w] of [['iPos', this.pos, 4], ['iShape', this.shp, 4], ['iLook', this.look, 4], ['iSize', this.size, 2]]) geo.setAttribute(k, new THREE.InstancedBufferAttribute(arr, w).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0; this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uCore: col(L.core), uCoreShade: col(L.coreShade), uBody: col(L.body), uBodyShade: col(L.bodyShade), uLine: col(L.line), uCool: col(L.cool), uCoolShade: col(L.coolShade), uSmoke: col(L.smoke), uSmokeShade: col(L.smokeShade) },
      vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 9; scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  /** One flame quad. p: world centre (ground lift applied by the caller); w, h: metres; roll: screen
   *  radians (0 = the tongue points up the screen); shape: seed, tip (0 = no tongue, ~0.8-1.3), curl,
   *  side (-1, 0, 1); kind FLAME.*; cool 0..1; hole 0..1; alpha. Callers add back to front. */
  add(p, w, h, roll, seed, tip, curl, side, kind, cool = 0, hole = 0, alpha = 1) {
    if (this.n >= this.max) return;
    const i = this.n++, j = i * 4, P = this.pos, S = this.shp, K = this.look;
    P[j] = p.x; P[j + 1] = p.y; P[j + 2] = p.z; P[j + 3] = roll;
    S[j] = seed; S[j + 1] = tip; S[j + 2] = curl; S[j + 3] = side;
    K[j] = kind; K[j + 1] = cool; K[j + 2] = hole; K[j + 3] = alpha;
    this.size[i * 2] = w; this.size[i * 2 + 1] = h;
  }
  end() {
    const A = this.geo.attributes; A.iPos.needsUpdate = true; A.iShape.needsUpdate = true; A.iLook.needsUpdate = true; A.iSize.needsUpdate = true;
    this.geo.instanceCount = this.n;
  }
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
    uniforms: { uSeed: { value: 0 }, uA: { value: 1 }, uC0: { value: raw(f[0]) }, uC1: { value: raw(f[0]) }, uC2: { value: raw(f[1]) } },
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
      uEdge: { value: raw(f[0]) }, uHot: { value: raw(f[2]) }, uFill: { value: raw(f[1]) } },
    vertexShader: UV_VS, fragmentShader: WARN_FS, transparent: true, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.visible = false; scene.add(m); return m;
}
/** A quad mesh for the spike material (place with placeV, then faceCamera). */
export function billboard(scene, material, order = 9) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material); m.visible = false; m.renderOrder = order; scene.add(m); return m;
}
