// Slash (bench look, v2): a crescent drawn from the sword's real path. While a swing window is open
// the blade's hilt and tip are sampled every frame; the swept surface between them is smoothed
// into one ribbon: sharp bright leading edge, a white core along the tip path, a pale body that
// thins toward the hilt and toward the tail, then a quick fade. No cut marks on targets.
// Every strike (including Multistrike repeats) opens its own window, so each one reads as a swing.
import * as THREE from 'three';

const TRAILS = 6, MAX = 48, SUB = 4, FADE = 0.16;
const STEEL = { core: '#ffffff', body: '#cfe3f2', line: '#6f93b8' };
const FUSE = { fire: '#ff7a2a', arcane: '#b98cff', lightning: '#7fd8ff', cold: '#9fe0ff' };

const VS = `attribute vec2 aSeg; varying vec2 vUv; void main(){ vUv = aSeg; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FS = `varying vec2 vUv; uniform float uFade; uniform vec3 uCore; uniform vec3 uBody; uniform vec3 uLine; uniform vec3 uRim; uniform float uRimK;
  void main(){
    float along = vUv.x;            // 0 oldest sample .. 1 newest (the blade now)
    float v = vUv.y;                // 0 hilt .. 1 tip
    float age = 1.0 - along;
    // the tail is eaten from behind as the trail fades
    if (age > 1.0 - uFade * 1.1) discard;
    // crescent: full width just behind the blade, thinning to a point at the tail
    float width = mix(0.78, 0.0, pow(age, 0.75));
    float inner = 1.0 - width;
    if (v < inner) discard;
    float b = (v - inner) / max(width, 1e-3);   // 0 inner edge .. 1 tip edge
    vec3 c = uBody;
    float a = mix(0.35, 0.9, smoothstep(0.0, 0.35, b));
    c = mix(c, uCore, step(0.62, b));
    c = mix(c, mix(uLine, uRim, uRimK), step(0.93, b));
    a *= 1.0 - uFade;
    gl_FragColor = vec4(c, a); }`;

function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  return out.set(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
}

export class SlashFx {
  constructor(scene) {
    this.scene = scene;
    const verts = MAX * SUB * 2;
    this.trails = Array.from({ length: TRAILS }, () => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(verts * 3), seg = new Float32Array(verts * 2), idx = [];
      for (let i = 0; i < MAX * SUB - 1; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSeg', new THREE.BufferAttribute(seg, 2));
      geo.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uFade: { value: 0 }, uCore: { value: new THREE.Color(STEEL.core) }, uBody: { value: new THREE.Color(STEEL.body) }, uLine: { value: new THREE.Color(STEEL.line) }, uRim: { value: new THREE.Color('#ff7a2a') }, uRimK: { value: 0 } },
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false; scene.add(mesh);
      return { mesh, geo, mat, tips: [], bases: [], state: 'idle', open: 0, fade: 0 };
    });
    this.pending = []; this.t = 0;
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
  }
  // open a swing window `delay` seconds from now that records the blade for `dur` seconds
  swing(delay, dur, fusedElement = null) { this.pending.push({ at: this.t + Math.max(0, delay), dur, fusedElement }); }
  start(p) {
    const tr = this.trails.find((k) => k.state === 'idle') || this.trails.reduce((a, b) => (a.fade > b.fade ? a : b));
    tr.state = 'record'; tr.open = p.dur; tr.fade = 0; tr.tips.length = 0; tr.bases.length = 0;
    tr.mat.uniforms.uRimK.value = p.fusedElement ? 1 : 0;
    if (p.fusedElement) tr.mat.uniforms.uRim.value.set(FUSE[p.fusedElement] || '#ff7a2a');
  }
  // base/tip: the blade's hilt-side and tip points in world space this frame
  update(dt, base, tip) {
    this.t += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.t >= this.pending[i].at) { this.start(this.pending[i]); this.pending.splice(i, 1); }
    for (const tr of this.trails) {
      if (tr.state === 'idle') continue;
      if (tr.state === 'record') {
        if (tr.tips.length < MAX) { tr.tips.push(tip.clone()); tr.bases.push(base.clone()); }
        tr.open -= dt;
        if (tr.open <= 0) tr.state = 'fade';
      } else {
        tr.fade += dt / FADE;
        if (tr.fade >= 1) { tr.state = 'idle'; tr.mesh.visible = false; continue; }
      }
      tr.mat.uniforms.uFade.value = Math.min(1, tr.fade);
      this.build(tr);
    }
  }
  build(tr) {
    const n = tr.tips.length;
    if (n < 2) { tr.mesh.visible = false; return; }
    const pos = tr.geo.attributes.position.array, seg = tr.geo.attributes.aSeg.array;
    const total = (n - 1) * SUB + 1;
    let v = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < (i === n - 2 ? SUB + 1 : SUB); s++) {
        const t = s / SUB, along = (i * SUB + s) / (total - 1);
        const P = (arr, k) => arr[Math.min(n - 1, Math.max(0, k))];
        catmull(P(tr.bases, i - 1), P(tr.bases, i), P(tr.bases, i + 1), P(tr.bases, i + 2), t, this._a);
        catmull(P(tr.tips, i - 1), P(tr.tips, i), P(tr.tips, i + 1), P(tr.tips, i + 2), t, this._b);
        pos.set([this._a.x, this._a.y, this._a.z, this._b.x, this._b.y, this._b.z], v * 6);
        seg.set([along, 0, along, 1], v * 4);
        v++;
      }
    }
    tr.geo.attributes.position.needsUpdate = true; tr.geo.attributes.aSeg.needsUpdate = true;
    tr.geo.setDrawRange(0, (v - 1) * 6);
    tr.mesh.visible = true;
  }
  clear() { this.pending = []; for (const tr of this.trails) { tr.state = 'idle'; tr.mesh.visible = false; } }
}
