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
// is studied from hand-drawn anime fire: one mass with one outline (never a pile of separate stickers);
// flame tips all round the rim, hooked and leaning up, bigger at the top, round cloud bumps at the
// bottom; a pale yellow core that is a smaller flame mass of its own with orange strokes between its
// tongues; an orange body with a dark red crescent on the side away from the light and a thin dark
// line; plum cel smoke. A fire is one camera-facing quad (all in one instanced mesh, refilled each
// frame like a Ribbon) whose shader builds the rims in polar coordinates: r < R + tips(theta), theta
// bent with the radius so the tips hook. The tips re-draw every drawing.
export const FLAME = { FIRE: 0, SMOKE: 2 };
const FLAME_VS = `attribute vec4 iPos; attribute vec4 iShape; attribute vec4 iLook; attribute vec2 iSize;
  varying vec2 vUv; varying vec4 vShape; varying vec4 vLook; varying vec2 vLight;
  // iPos: xyz, roll; iShape: seed, drawing, up (taller top tips: a comet), -; iLook: kind, cool, hole, alpha
  void main(){ vUv = position.xy*2.0; vShape = iShape; vLook = iLook;
    float c = cos(-iPos.w), s = sin(-iPos.w);
    vLight = vec2(c*0.6 - s*0.8, s*0.6 + c*0.8);   // the screen's up-left light, in the quad's frame
    vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
    vec2 o = position.xy * iSize; float cr = cos(iPos.w), sr = sin(iPos.w);
    mv.xy += vec2(cr*o.x - sr*o.y, sr*o.x + cr*o.y);
    gl_Position = projectionMatrix * mv; }`;
const FLAME_FS = `varying vec2 vUv; varying vec4 vShape; varying vec4 vLook; varying vec2 vLight;
  uniform vec3 uCore; uniform vec3 uBody; uniform vec3 uShade; uniform vec3 uLine;
  uniform vec3 uCool; uniform vec3 uCoolShade; uniform vec3 uSmoke; uniform vec3 uSmokeShade;` + HASH + `
  float h1(float i, float s){ return fract(sin(i*127.1 + s*311.7)*43758.5453); }
  // a flame rim: tips of height H (hooked: a fast rise, a long concave fall) round a circle of radius
  // R; cloud bumps instead of tips toward the bottom. th is measured from up, clockwise.
  float ring(vec2 q, float R, float n, float H, float bend, float seed, float draw, float up, float cloud){
    float r = length(q), th = atan(q.x, q.y);
    float rr = max(r - R*0.8, 0.0);
    float t = (th + bend*rr/R*sign(th)*clamp(abs(sin(th))*2.0, 0.0, 1.0))/6.2832*n + seed;
    float i = floor(t), s = t - i;
    float hh = 0.55 + 0.9*mix(h1(i, seed), h1(i, seed + draw), 0.45);
    float prof = pow(s, 0.8)*pow(1.0 - s, 2.0)/0.1874;   // peak 1
    float tip = H*hh*prof*(1.0 + up*max(cos(th), 0.0));
    float lob = R*0.12*abs(sin(th*n*0.5 + seed));
    float cw = pow(max(-cos(th), 0.0), 1.5)*0.5;
    return r - (R + tip*(1.0 - cw) + lob*cw); }
  float body(vec2 p, float seed, float draw, float up, float hole){
    vec2 q = p - vec2(0.0, -0.06);
    float d = min(ring(q, 0.5, 16.0, 0.16, 0.5, seed, draw, up, 0.5),
                  ring(vec2(q.x*0.985 + q.y*0.17, q.y*0.985 - q.x*0.17), 0.48, 25.0, 0.1, 0.55, seed + 3.0, draw, up*0.8, 0.5));
    if (hole > 0.0) { // break-up: the middle burns out and the rim splits into chunks
      float th = atan(q.x, q.y), r = length(q);
      d = max(d, hole*0.62 - r + (vq(q*5.0 + seed)*0.12));
      d = max(d, hole*0.3 - abs(fract(th/6.2832*5.0 + seed*0.37) - 0.5)*r*2.4);
    }
    return d; }
  float lobes(vec2 p, float seed){ // cel smoke: a cluster of round bumps
    float an = atan(p.y, p.x), n = 6.0 + floor(h1(1.0, seed)*3.0);
    return length(p) - 0.62*(0.82 + 0.18*abs(sin(an*n*0.5 + h1(2.0, seed)*6.0))); }
  void main(){
    float seed = vShape.x, draw = vShape.y, up = vShape.z, kind = vLook.x, cool = vLook.y, hole = vLook.z;
    vec2 p = vUv; vec3 c;
    float d;
    if (kind > 1.5) {
      d = lobes(p, seed);
      if (hole > 0.0 && vq(p*2.4 + seed*7.0) < hole) discard;
      bool sh = lobes(p - vLight*0.16, seed) > 0.0;
      c = sh ? uSmokeShade : uSmoke;
      if (d > -0.035) c = uLine;
    } else {
      d = body(p, seed, draw, up, hole);
      bool sh = body(p - vLight*0.15, seed, draw, up, hole) > 0.0;
      // the core: its own flame mass, up-left of the middle, orange strokes between its tongues
      vec2 qc = p - vec2(-0.04, 0.02);
      float dc = ring(qc, 0.31, 13.0, 0.15, 0.6, seed + 7.0, draw, up*0.8, 0.0);
      float rc = length(qc), tc = atan(qc.x, qc.y);
      float t = (tc + 0.9*rc*sign(tc))/6.2832*13.0 + seed + 7.5, st = fract(t);
      bool stroke = abs(st - 0.5) < 0.06*(rc/0.35)*(1.0 - rc/0.42) && rc > 0.1 && rc < 0.4 && h1(floor(t), seed) > 0.35;
      bool core = dc < 0.0 && !stroke && !sh && cool < 0.34;
      c = sh ? (cool > 0.67 ? uCoolShade : uShade) : (cool > 0.67 ? uCool : uBody);
      if (core) c = uCore;
      if (d > -0.014) c = uLine;
    }
    float aa = fwidth(d)*1.2, a = 1.0 - smoothstep(-aa, 0.0, d);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(c, a*vLook.w); }`;
export const FIRE_LOOK = {
  fire: { core: '#ffec96', body: '#ff801e', shade: '#bc3418', line: '#6c1e16', cool: '#c2441c', coolShade: '#74241a', smoke: '#86687a', smokeShade: '#5c4258' },
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
      uniforms: { uCore: col(L.core), uBody: col(L.body), uShade: col(L.shade), uLine: col(L.line), uCool: col(L.cool), uCoolShade: col(L.coolShade), uSmoke: col(L.smoke), uSmokeShade: col(L.smokeShade) },
      vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 9; scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  /** One fire (or smoke) quad. p: world centre (ground lift applied by the caller); w, h: metres;
   *  roll: screen radians (0 = its top up the screen); seed: its shape; draw: the drawing index (tips
   *  re-draw when it changes); up: taller top tips (a comet: 2-3); kind FLAME.*; cool 0..1 (orange ->
   *  red, the core goes); hole 0..1 (burns out from the middle and splits); alpha. Add back to front. */
  add(p, w, h, roll, seed, draw, up, kind, cool = 0, hole = 0, alpha = 1) {
    if (this.n >= this.max) return;
    const i = this.n++, j = i * 4, P = this.pos, S = this.shp, K = this.look;
    P[j] = p.x; P[j + 1] = p.y; P[j + 2] = p.z; P[j + 3] = roll;
    S[j] = seed; S[j + 1] = draw; S[j + 2] = up; S[j + 3] = 0;
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
