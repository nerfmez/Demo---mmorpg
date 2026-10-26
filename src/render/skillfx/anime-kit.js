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
const UV_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

// fire palettes: core, body, edge, shadow (flat bands, hot to cool)
export const ANIME_FIRE = {
  fire: ['#fffbe6', '#ffd23f', '#ff7a1a', '#b5301b'],
};
export const ANIME_SMOKE = { fire: ['#9a7a76', '#5e4247'] };

// A comet: a round head with flame tongues swept back into a tapering tail. Local x runs along the
// motion (head at 0, tail to -uLen), y across; uRock leaves the middle of the head to a rock drawn in
// front. Tongues and band edges are redrawn from uSeed (one value per drawing).
const COMET_FS = `varying vec2 vUv; uniform float uLen; uniform float uR; uniform float uRock; uniform float uW; uniform float uSeed;
  uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uA;` + HASH + `
  void main(){
    float x = mix(-uLen, uR*1.2, vUv.x), y = (vUv.y*2.0-1.0)*uW, ay = abs(y);
    float side = y > 0.0 ? 1.0 : 0.0;
    float t = clamp(-x/uLen, 0.0, 1.0);
    // tail: widens a little behind the head, then tapers; swept-back tongues on each side
    float body = uR * (1.0 + 0.3*sin(3.1416*min(t*2.2, 1.0))) * pow(1.0 - t, 0.9);
    float g = t*4.5 + hh(vec2(uSeed, side))*0.9;
    float s = fract(g), id = floor(g);
    float tongue = pow(s, 1.8) * smoothstep(1.0, 0.8, s) * uR * (0.35 + 0.9*t) * (0.5 + 0.9*hh(vec2(id + uSeed*1.7, side + 3.0)));
    float hwTail = x < 0.0 ? body*0.82 + tongue : 0.0;
    float hwHead = sqrt(max(0.0, uR*uR - x*x));
    float hw = max(hwTail, hwHead);
    float d = hw - ay;
    float aa = fwidth(d) * 1.2;
    float a = smoothstep(0.0, aa, d);
    if (a <= 0.0) discard;
    // heat: hottest hugging the rock at the front, cooling outward and down the tail
    float r = length(vec2(x, y));
    float ring = clamp((r - uRock) / max(0.01, uR - uRock), 0.0, 1.0);
    float headHeat = (1.0 - ring) * 0.95 + 0.3 * clamp(x / max(r, 0.001), 0.0, 1.0);
    float k = ay / max(body*0.82 + tongue*0.35, 0.001);   // bands follow the body, tongues stay orange-red
    float tailHeat = (1.0 - min(k, 1.0)) * (0.95 - 0.8*t);
    float heat = mix(tailHeat, headHeat, smoothstep(-uR, 0.0, x));
    heat += (vq(vec2(x*0.9, y*1.1) + uSeed*3.1) - 0.5) * 0.18;
    vec3 c = heat > 0.66 ? uC0 : (heat > 0.44 ? uC1 : (heat > 0.2 ? uC2 : uC3));
    gl_FragColor = vec4(c, a * uA); }`;
export function cometMaterial(el = 'fire') {
  const p = ANIME_FIRE[el] || ANIME_FIRE.fire;
  return new THREE.ShaderMaterial({
    uniforms: { uLen: { value: 4 }, uR: { value: 1 }, uRock: { value: 0.6 }, uW: { value: 1.5 }, uSeed: { value: 0 }, uA: { value: 1 },
      uC0: { value: new THREE.Color(p[0]) }, uC1: { value: new THREE.Color(p[1]) }, uC2: { value: new THREE.Color(p[2]) }, uC3: { value: new THREE.Color(p[3]) } },
    vertexShader: UV_VS, fragmentShader: COMET_FS, transparent: true, depthWrite: false,
  });
}
const _vd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);
/** Lays a comet quad (PlaneGeometry 1x1) facing the camera, its head at world point `head`, moving
 *  along `dir` (the tail streams the other way); the tail shortens with foreshortening, the head stays round. */
export function layComet(mesh, camera, head, dir, R, len, halfW) {
  _vd.copy(dir).transformDirection(camera.matrixWorldInverse);
  const proj = Math.max(0.2, Math.hypot(_vd.x, _vd.y)), ang = Math.atan2(_vd.y, _vd.x);
  const L = len * proj, u = mesh.material.uniforms;
  u.uLen.value = L; u.uR.value = R; u.uW.value = halfW;
  _right.setFromMatrixColumn(camera.matrixWorld, 0); _up.setFromMatrixColumn(camera.matrixWorld, 1);
  const off = (R * 1.2 - L) / 2, c = Math.cos(ang), s = Math.sin(ang);
  mesh.position.copy(head).addScaledVector(_right, c * off).addScaledVector(_up, s * off);
  mesh.quaternion.copy(camera.quaternion).multiply(_q.setFromAxisAngle(_z, ang));
  mesh.scale.set(R * 1.2 + L, halfW * 2, 1);
}

// A cel puff: a lobed blob lit in two flat bands from the top left, or (uFire 1) banded like fire by
// radius, cooling into smoke as uCool rises; holes open inside as uHole rises. Billboard quad.
const PUFF_FS = `varying vec2 vUv; uniform float uSeed; uniform float uHole; uniform float uCool; uniform float uFire;
  uniform vec3 uF0; uniform vec3 uF1; uniform vec3 uF2; uniform vec3 uLit; uniform vec3 uShade; uniform float uA;` + HASH + `
  void main(){
    vec2 p = vUv*2.0-1.0; float r = length(p), an = atan(p.y, p.x);
    float n = 5.0 + floor(hh(vec2(uSeed, 1.0))*3.0);
    float lobes = abs(sin(an*n*0.5 + hh(vec2(uSeed, 2.0))*6.0));   // round scallops, cusps between
    float edge = 0.62 + 0.22*lobes + (vq(vec2(cos(an), sin(an))*1.6 + uSeed*4.0) - 0.5)*0.16;
    float d = edge - r, aa = fwidth(d)*1.2, a = smoothstep(0.0, aa, d);
    if (a <= 0.0) discard;
    if (uHole > 0.0 && vq(p*2.6 + uSeed*7.0) < uHole + (r/edge)*0.25*uHole) discard;
    vec3 N = vec3(p/edge, 0.0); N.z = sqrt(max(0.0, 1.0 - dot(N.xy, N.xy)));
    float lit = dot(N, normalize(vec3(-0.45, 0.65, 0.6)));
    vec3 smoke = lit > 0.25 ? uLit : uShade;
    float k = r/edge;
    vec3 fire = k < 0.42 ? uF0 : (k < 0.74 ? uF1 : uF2);
    // fire cools from the outside in: the smoke band eats toward the middle as uCool rises
    vec3 c = (uFire > 0.5 && k < 1.0 - uCool*1.4) ? fire : smoke;
    gl_FragColor = vec4(c, a*uA); }`;
export function puffMaterial(el = 'fire') {
  const f = ANIME_FIRE[el] || ANIME_FIRE.fire, s = ANIME_SMOKE[el] || ANIME_SMOKE.fire;
  return new THREE.ShaderMaterial({
    uniforms: { uSeed: { value: 0 }, uHole: { value: 0 }, uCool: { value: 0 }, uFire: { value: 0 }, uA: { value: 1 },
      uF0: { value: new THREE.Color(f[1]) }, uF1: { value: new THREE.Color(f[2]) }, uF2: { value: new THREE.Color(f[3]) },
      uLit: { value: new THREE.Color(s[0]) }, uShade: { value: new THREE.Color(s[1]) } },
    vertexShader: UV_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false,
  });
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
/** A camera-facing quad mesh for the puff and spike materials (place with placeV, face the camera). */
export function billboard(scene, material, order = 9) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material); m.visible = false; m.renderOrder = order; scene.add(m); return m;
}
