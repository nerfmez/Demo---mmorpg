// Anime effects in 3D (owner, 2026-10-26: "อนิเมะแบบ 3D"): real shapes with volume, toon-shaded, as
// in cel-shaded 3D games, never flat pictures. Fire is solid meshes (spheres, a comet, flame tongues)
// displaced by scrolling noise and shaded in flat bands: the side facing the camera hottest (pale
// yellow), then orange, a dark red band toward the silhouette and away from the sun, a thin dark red
// line on the silhouette; it cools (the yellow goes, then the orange) and dissolves through noise with
// a hard, bright burning edge. Smoke is the same meshes lit in two flat bands. Shapes re-draw on the
// 12-per-second drawing grid (uT is stepped). Opaque with discard, so they sort by depth like solids.
import * as THREE from 'three';

const NOISE3 = `
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)))*43758.5453); }
  float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p){ return n3(p)*0.55 + n3(p*2.1)*0.3 + n3(p*4.3)*0.15; }`;

// Object space: +y is the flow (up for a fireball, back along the path for a comet, out for a tongue).
const CEL_VS = `uniform float uT; uniform float uSeed; uniform float uDisp; uniform float uFreq; uniform float uScroll;
  uniform float uLobes; uniform float uLobeAmp; uniform float uTwist; uniform float uLobeFrom; uniform float uLen; uniform float uCurl;
  varying vec3 vN; varying vec3 vW; varying vec3 vO;` + NOISE3 + `
  void main(){
    vec3 p = position, n = normal;
    float y = clamp(p.y / uLen, 0.0, 1.0);
    // flame tongues: sharp ridges round the flow axis, growing along it, twisting as they go
    float ang = atan(p.z, p.x);
    float ridge = pow(max(sin(ang*uLobes + p.y*uTwist + uSeed*3.0), 0.0), 3.0) * smoothstep(uLobeFrom, 1.0, y);
    vec3 radial = normalize(vec3(p.x, 0.0, p.z) + 1e-5);
    float d = (fbm3(p*uFreq + vec3(0.0, -uT*uScroll, uSeed)) - 0.45) * uDisp;
    p += n*d + radial*ridge*uLobeAmp*max(length(p.xz), 0.35);
    p.x += uCurl * y * y * uLen;                    // a tongue's tip curls over
    vO = position;
    vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * w; }`;
const CEL_FS = `uniform vec3 uSun; uniform float uT; uniform float uSeed; uniform float uCool; uniform float uErode; uniform float uTailErode;
  uniform float uLen; uniform float uSmoke; uniform float uHot;
  uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uK1; uniform vec3 uK2; uniform vec3 uS0; uniform vec3 uS1;
  varying vec3 vN; varying vec3 vW; varying vec3 vO;` + NOISE3 + `
  void main(){
    // the shaded normal comes from the displaced surface itself, so the bands follow every lump
    vec3 Nd = normalize(cross(dFdx(vW), dFdy(vW))); if (dot(Nd, vN) < 0.0) Nd = -Nd;
    vec3 N = normalize(mix(normalize(vN), Nd, 0.6)), V = normalize(cameraPosition - vW);
    float f = dot(N, V), l = dot(N, uSun);
    // dissolve: a noise threshold rising with age, and toward the tail end
    float e = fbm3(vO*2.3 + vec3(uSeed, -uT*1.5, 0.0));
    float thr = uErode + uTailErode*smoothstep(0.25, 1.0, vO.y/uLen);
    if (e < thr) discard;
    bool burn = thr > 0.02 && e < thr + 0.045;
    vec3 c;
    if (uSmoke > 0.5) {
      c = l > 0.1 ? uS0 : uS1;
      if (f < 0.18) c = uC3*0.5 + uS1*0.5;
    } else {
      float band = f*0.85*uHot + l*0.25 - uCool*0.8;
      bool cold = uCool > 0.66;
      c = band > 0.84 ? uC0 : (band > 0.42 ? (cold ? uK1 : uC1) : (cold ? uK2 : uC2));
      if (f < 0.2) c = uC3;
      if (burn) c = uC0;
    }
    gl_FragColor = vec4(c, 1.0); }`;

// colours as written (display values, like the literals in the other effect shaders)
const raw = (h) => new THREE.Color().setStyle(h, THREE.LinearSRGBColorSpace);
const SUN = new THREE.Vector3(-4, 10, 6).normalize();
export const CEL_FIRE = { core: '#ffec96', body: '#ff801e', shade: '#c23a18', line: '#7a2018', cool: '#c2441c', coolShade: '#74241a', smoke: '#8a6c7c', smokeShade: '#5a4054' };

let base = null;
/** A cel fire (or smoke: { smoke: true }) material; each mesh gets its own (shared program). */
export function celMaterial(o = {}) {
  if (!base) {
    const C = CEL_FIRE, u = (v) => ({ value: v });
    base = new THREE.ShaderMaterial({
      uniforms: {
        uT: u(0), uSeed: u(0), uDisp: u(0.2), uFreq: u(1.6), uScroll: u(1.5), uLobes: u(0), uLobeAmp: u(0), uTwist: u(0), uLobeFrom: u(0.2), uLen: u(1), uCurl: u(0),
        uSun: u(SUN), uCool: u(0), uErode: u(0), uTailErode: u(0), uSmoke: u(0), uHot: u(1),
        uC0: u(raw(C.core)), uC1: u(raw(C.body)), uC2: u(raw(C.shade)), uC3: u(raw(C.line)), uK1: u(raw(C.cool)), uK2: u(raw(C.coolShade)), uS0: u(raw(C.smoke)), uS1: u(raw(C.smokeShade)),
      },
      vertexShader: CEL_VS, fragmentShader: CEL_FS,
    });
  }
  const m = base.clone();
  for (const k of Object.keys(o)) { const key = 'u' + k[0].toUpperCase() + k.slice(1); if (m.uniforms[key]) m.uniforms[key].value = o[k]; }
  if (o.smoke) m.uniforms.uSmoke.value = 1;
  return m;
}

const geos = {};
const shared = (g) => { g.userData.shared = true; return g; };
/** A round puff (fireball lobe, smoke), radius 1. */
export const puffGeometry = () => geos.puff || (geos.puff = shared(new THREE.IcosahedronGeometry(1, 6)));
/** A comet: a round head (radius 1) at the origin and a tail tapering to +y over len. */
export function cometGeometry(len = 4) {
  const key = 'comet' + len; if (geos[key]) return geos[key];
  const pts = [];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a), Math.sin(a))); }
  for (let i = 1; i <= 36; i++) { const y = (i / 36) * len; pts.push(new THREE.Vector2(Math.max(0.001, Math.pow(1 - y / len, 0.85) * (1 + 0.2 * Math.sin(Math.PI * Math.min(1, y / len * 2.2)))), y)); }
  return (geos[key] = shared(new THREE.LatheGeometry(pts, 40)));
}
/** A flame tongue: a round base at the origin narrowing to a point at +y = 1. */
export function tongueGeometry() {
  if (geos.tongue) return geos.tongue;
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * 0.3, 0.12 + Math.sin(a) * 0.12)); }
  for (let i = 1; i <= 24; i++) { const y = 0.12 + (i / 24) * 0.88, t = (y - 0.12) / 0.88; pts.push(new THREE.Vector2(Math.max(0.001, 0.3 * Math.pow(1 - t, 0.9) * (1 + 0.7 * t * (1 - t))), y)); }
  return (geos.tongue = shared(new THREE.LatheGeometry(pts, 20)));
}
const _q = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);
/** Turns a mesh so its object +y points along dir. */
export function alongY(mesh, dir) { mesh.quaternion.copy(_q.setFromUnitVectors(_y, dir)); }
