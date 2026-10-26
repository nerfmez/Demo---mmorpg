// Shared pieces for the skill effects (cosmetic only), used by the game and the FX test bench.
// The effects are written on a flat floor: every height they handle (a point, a sprite, a ribbon)
// is metres above the ground under it, and fxGround.y lifts it onto the real ground when drawn.
// The bench keeps the flat floor; the game points fxGround.y at the world's ground height.
import * as THREE from 'three';

export const fxGround = { y: (x, z) => 0, flat: true };
// Point lights make every lit material in a scene heavier: the bench uses them for the glow on the
// floor, the game (many lit materials, iPad) turns them off before creating the effects.
// occluders: Flame Stream renders the scene's OCCLUDER_LAYER objects to hide its fire behind them
// (the bench's dummies); the game skips that extra scene pass.
export const fxConfig = { lights: true, occluders: true };
export function addLight(scene, light) { if (fxConfig.lights) scene.add(light); return light; }
// Puts an object at a ground-relative point (x, height above ground, z).
export function place(obj, x, y, z) { obj.position.set(x, y + fxGround.y(x, z), z); return obj; }
export function placeV(obj, v) { return place(obj, v.x, v.y, v.z); }
// Bends a flat plane mesh lying on the ground (its own geometry, segmented, local Z pointing up or
// down in the world) so every vertex sits offset metres above the real ground under it. Call after
// placing it; a no-op on the bench's flat floor.
const _o = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
export function conformPlane(mesh, offset = 0.03) {
  if (fxGround.flat) return;
  mesh.updateMatrixWorld(true);
  const m = mesh.matrixWorld, pos = mesh.geometry.attributes.position;
  _o.set(0, 0, 0).applyMatrix4(m); _u.set(0, 0, 1).applyMatrix4(m).sub(_o); // world step of one local z unit
  if (Math.abs(_u.y) < 1e-6) return;
  for (let i = 0; i < pos.count; i++) {
    _w.set(pos.getX(i), pos.getY(i), 0).applyMatrix4(m);
    pos.setZ(i, (fxGround.y(_w.x, _w.z) + offset - _w.y) / _u.y);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}
// Ground height lookups for fxGround.y: bilinear over a 0.5 m lattice whose corners are cached in a
// fixed table (no allocation), so per-point ribbon lifts stay cheap on slopes.
export function cachedGround(groundY, size = 1024) {
  const CELL = 0.5, kx = new Int32Array(size).fill(0x7fffffff), kz = new Int32Array(size), val = new Float32Array(size);
  const corner = (ix, iz) => {
    const h = (((ix * 73856093) ^ (iz * 19349663)) >>> 0) % size;
    if (kx[h] !== ix || kz[h] !== iz) { kx[h] = ix; kz[h] = iz; val[h] = groundY(ix * CELL, iz * CELL); }
    return val[h];
  };
  return (x, z) => {
    const fx = x / CELL, fz = z / CELL, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, w = fz - iz;
    const a = corner(ix, iz), b = corner(ix + 1, iz), c = corner(ix, iz + 1), d = corner(ix + 1, iz + 1);
    return (a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w;
  };
}

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const NOISE = `
  float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ return vn(p)*0.5 + vn(p*2.1)*0.28 + vn(p*4.3)*0.14 + vn(p*8.7)*0.08; }`;

// Camera-facing strips rebuilt every frame into one fixed buffer.
const _side = new THREE.Vector3(), _tan = new THREE.Vector3(), _view = new THREE.Vector3();
export class Ribbon {
  constructor(scene, camera, max, frag, blending) {
    this.camera = camera; this.max = max;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 6); this.uv = new Float32Array(max * 4);
    this.a = new Float32Array(max * 2); this.col = new Float32Array(max * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.col, 3));
    this.index = new Uint32Array(max * 6);
    geo.setIndex(new THREE.BufferAttribute(this.index, 1));
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: `attribute float alpha; attribute vec3 tint; varying vec2 vUv; varying float vA; varying vec3 vT;
        void main(){ vUv=uv; vA=alpha; vT=tint; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: frag, transparent: true, depthWrite: false, blending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blending === THREE.AdditiveBlending ? 2 : 3;
    scene.add(this.mesh);
  }
  begin() { this.v = 0; this.i = 0; }
  strip(pts, widthFn, alpha, tint) {
    const n = pts.length; if (n < 2 || this.v + n * 2 > this.max * 2) return;
    const cam = this.camera.position, start = this.v;
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      _tan.subVectors(pts[Math.min(k + 1, n - 1)], pts[Math.max(k - 1, 0)]).normalize();
      const lift = fxGround.y(p.x, p.z);
      _view.set(cam.x - p.x, cam.y - p.y - lift, cam.z - p.z).normalize();
      _side.crossVectors(_tan, _view).normalize();
      const t = k / (n - 1), w = widthFn(t, k) * 0.5;
      for (let s = 0; s < 2; s++) {
        const sg = s ? 1 : -1, vi = this.v++;
        this.pos[vi * 3] = p.x + _side.x * w * sg; this.pos[vi * 3 + 1] = p.y + lift + _side.y * w * sg; this.pos[vi * 3 + 2] = p.z + _side.z * w * sg;
        this.uv[vi * 2] = t; this.uv[vi * 2 + 1] = sg;
        this.a[vi] = alpha; this.col[vi * 3] = tint[0]; this.col[vi * 3 + 1] = tint[1]; this.col[vi * 3 + 2] = tint[2];
      }
      if (k < n - 1) { const b = start + k * 2; this.index.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], this.i); this.i += 6; }
    }
  }
  end() {
    // Upload only the strips written this frame, and nothing while the ribbon stays empty:
    // re-sending the whole fixed buffer every frame cost seconds on software GL.
    if (this.i || this.drawn) {
      for (const [k, size] of [['position', 3], ['uv', 2], ['alpha', 1], ['tint', 3]]) {
        const a = this.geo.attributes[k]; a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, this.v) * size); a.needsUpdate = true;
      }
      const index = this.geo.index; index.clearUpdateRanges(); index.addUpdateRange(0, Math.max(1, this.i)); index.needsUpdate = true;
    }
    this.drawn = this.i;
    this.geo.setDrawRange(0, this.i);
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mesh.material.dispose(); }
}

// Ragged noise flash: torn lobes, holes eat in as it dies. Colour by element.
export const FLASH_FS = `varying vec2 vUv; uniform float uT; uniform float uSeed; uniform vec3 uIn; uniform vec3 uMid; uniform vec3 uOut;
  float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ return vn(p)*0.55 + vn(p*2.3)*0.3 + vn(p*5.1)*0.15; }
  void main(){
    float r=length(vUv); float th=atan(vUv.y,vUv.x);
    vec2 q = vec2(cos(th), sin(th))*2.2 + uSeed;
    float n = fbm(q + vec2(uT*3.0, 0.0));
    float edge = 0.18 + 1.25*pow(n, 2.2);
    float eat = fbm(vUv*4.0 + uSeed*3.0);
    if (r > edge || eat < uT*0.9 - 0.15 + r*0.4) discard;
    float k = r/edge;
    vec3 c = k < 0.5 ? uIn : (k < 0.85 ? uMid : uOut);
    gl_FragColor = vec4(c, 1.0); }`;
export const BILLBOARD_VS = `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
export function flashMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSeed: { value: seed }, uIn: { value: new THREE.Color(1, 1, 1) }, uMid: { value: new THREE.Color(0.55, 0.88, 1) }, uOut: { value: new THREE.Color(0.25, 0.5, 1) } },
    vertexShader: BILLBOARD_VS, fragmentShader: FLASH_FS, transparent: true, depthWrite: false, depthTest: false,
  });
}

// Element looks: [inner, mid, outer] flash colours and stroke/glow tints.
export const ELEMENT_LOOK = {
  lightning: { flash: ['#ffffff', '#8ce0ff', '#4080ff'], edge: [0.45, 0.82, 1.0], glow: [0.3, 0.6, 1.0], spark: [1.0, 0.95, 0.65] },
  cold: { flash: ['#ffffff', '#c4ecff', '#6fb4e6'], edge: [0.72, 0.93, 1.0], glow: [0.35, 0.7, 0.95], spark: [0.9, 0.98, 1.0] },
  fire: { flash: ['#fff6d0', '#ffb040', '#d8401a'], edge: [1.0, 0.55, 0.15], glow: [1.0, 0.4, 0.1], spark: [1.0, 0.85, 0.4] },
  poison: { flash: ['#f6ffd8', '#b4ee52', '#4f9a1e'], edge: [0.7, 0.95, 0.3], glow: [0.4, 0.85, 0.15], spark: [0.9, 1.0, 0.6] },
  physical: { flash: ['#ffffff', '#f0e2c0', '#a08860'], edge: [0.95, 0.88, 0.7], glow: [0.6, 0.5, 0.35], spark: [1, 1, 0.9] },
};
export const lookOf = (el) => ELEMENT_LOOK[el] || ELEMENT_LOOK.physical;
export function tintFlash(mat, el) {
  const f = lookOf(el).flash;
  mat.uniforms.uIn.value.set(f[0]); mat.uniforms.uMid.value.set(f[1]); mat.uniforms.uOut.value.set(f[2]);
}
