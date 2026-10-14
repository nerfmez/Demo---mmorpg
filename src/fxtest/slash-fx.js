// Slash (bench look, v3): one clean crescent around the caster over the real range and arc.
// Shape: the outer edge is the reach, the inner edge bows in so the crescent is thick in the
// middle and pointed at both ends. Motion: a fast reveal from one end to the other that passes
// the middle at the contact time, then the crescent thins from its inner edge and fades.
// Three flat cel tones (white core along the outer edge, pale body, thin same-hue line), no noise.
// Strikes in quick succession (spamming, Multistrike repeats) cycle through different tilts and
// sides so consecutive slashes read as different cuts.
import * as THREE from 'three';

const SWEEP = 0.075, HOLD = 0.04, FADE = 0.16, CUTS = 6, CHAIN = 1.2;
const COLORS = { core: '#ffffff', body: '#d4e8f6', line: '#7d9fc2' };
const FUSE = { fire: '#ff7a2a', arcane: '#b98cff', lightning: '#7fd8ff', cold: '#9fe0ff' };
// consecutive strikes: tilt (roll around the facing axis, signed by the swing side), height, reach
const PATTERN = [
  { tilt: 0.38, y: 0.05, reach: 1.0 },
  { tilt: 0.3, y: 0.15, reach: 0.96 },
  { tilt: 0.08, y: -0.05, reach: 1.04 },
  { tilt: 0.55, y: 0.1, reach: 0.98 },
  { tilt: 0.2, y: 0.2, reach: 0.95 },
];

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FS = `varying vec2 vUv; uniform float uHead; uniform float uFade; uniform float uDir; uniform float uThick;
  uniform vec3 uCore; uniform vec3 uBody; uniform vec3 uLine; uniform vec3 uRim; uniform float uRimK;
  void main(){
    float s = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;     // 0 where the cut starts, 1 where it ends
    if (s > uHead) discard;
    float v = vUv.y;                                 // 0 near the caster .. 1 at the reach
    // crescent: thick in the middle, pointed ends; the fade eats it from the inner edge
    float w = uThick * pow(sin(3.14159265 * s), 0.85) * (1.0 - uFade);
    // the freshest part, just behind the leading edge, is a little fuller
    w *= 1.0 + 0.25 * smoothstep(0.25, 0.0, uHead - s) * (1.0 - uFade);
    float inner = 1.0 - w;
    float aa = fwidth(v) * 1.2;
    float body = smoothstep(inner - aa, inner + aa, v);
    if (body < 0.01) discard;
    float b = (v - inner) / max(w, 1e-3);            // 0 inner edge .. 1 outer edge
    vec3 c = uBody;
    c = mix(c, uCore, smoothstep(0.52 - aa / max(w, 1e-3), 0.52 + aa / max(w, 1e-3), b));
    float lineW = 0.09 / max(w / uThick, 0.25);
    c = mix(c, mix(uLine, uRim, uRimK), smoothstep(1.0 - lineW - 0.02, 1.0 - lineW, b));
    float a = mix(0.72, 1.0, smoothstep(0.3, 0.55, b)) * body * (1.0 - uFade * uFade);
    gl_FragColor = vec4(c, a); }`;

function arcGeometry(arcRad, r0, r1, segs = 72, rings = 6) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = -arcRad / 2 + u * arcRad;
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, r = r0 + (r1 - r0) * v;
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); uv.push(u, v);
    }
  }
  const row = rings + 1;
  for (let i = 0; i < segs; i++) for (let j = 0; j < rings; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class SlashFx {
  constructor(scene) {
    this.scene = scene;
    this.geos = new Map();
    this.cuts = Array.from({ length: CUTS }, () => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uHead: { value: 0 }, uFade: { value: 0 }, uDir: { value: 1 }, uThick: { value: 0.5 }, uCore: { value: new THREE.Color(COLORS.core) }, uBody: { value: new THREE.Color(COLORS.body) }, uLine: { value: new THREE.Color(COLORS.line) }, uRim: { value: new THREE.Color('#ff7a2a') }, uRimK: { value: 0 } },
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
      const g = new THREE.Group(); g.add(mesh); scene.add(g);
      return { g, mesh, mat, live: false, t: 0 };
    });
    this.pending = []; this.t = 0; this.lastAt = -9; this.index = 0;
  }
  geometry(arcDeg, range) {
    const key = `${arcDeg}|${range.toFixed(2)}`;
    if (!this.geos.has(key)) this.geos.set(key, arcGeometry((arcDeg * Math.PI) / 180, range * 0.25, range));
    return this.geos.get(key);
  }
  // a strike whose contact lands `contactIn` seconds from now. where(): caster {x, z, angle} at reveal
  // time; dir: +1 when the blade sweeps toward increasing facing angle (the first swing pose), -1 back
  swing(contactIn, o) {
    // the reveal passes the middle of the arc at contact
    this.pending.push({ at: this.t + Math.max(0, contactIn - SWEEP * 0.5), ...o });
  }
  start(p) {
    const k = this.t - this.lastAt < CHAIN ? (this.index + 1) % PATTERN.length : 0;
    this.index = k; this.lastAt = this.t;
    const pat = PATTERN[k], at = p.where(), dir = p.dir || 1;
    const c = this.cuts.find((q) => !q.live) || this.cuts.reduce((a, b) => (a.t > b.t ? a : b));
    const reach = p.range * pat.reach;
    c.mesh.geometry = this.geometry(p.arc, reach);
    c.g.position.set(at.x, 1.0 + pat.y, at.z);
    c.g.rotation.set(0, at.angle, 0);
    c.mesh.rotation.set(0, 0, 0);
    c.mesh.rotateZ(pat.tilt * dir); // the cut's plane rolls around the facing direction
    c.mesh.rotateX(-0.06);
    const u = c.mat.uniforms;
    u.uDir.value = dir; u.uThick.value = 0.5; u.uHead.value = 0; u.uFade.value = 0;
    u.uRimK.value = p.fusedElement ? 1 : 0;
    if (p.fusedElement) u.uRim.value.set(FUSE[p.fusedElement] || '#ff7a2a');
    c.live = true; c.t = 0; c.mesh.visible = true;
  }
  update(dt) {
    this.t += dt;
    for (let i = 0; i < this.pending.length; i++) if (this.t >= this.pending[i].at) { this.start(this.pending[i]); this.pending.splice(i--, 1); }
    for (const c of this.cuts) {
      if (!c.live) continue;
      c.t += dt;
      const r = Math.min(1, c.t / SWEEP);
      c.mat.uniforms.uHead.value = 1 - (1 - r) * (1 - r); // fast in, eased at the end
      c.mat.uniforms.uFade.value = Math.max(0, (c.t - SWEEP - HOLD) / FADE);
      if (c.t > SWEEP + HOLD + FADE) { c.live = false; c.mesh.visible = false; }
    }
  }
  clear() { this.pending = []; for (const c of this.cuts) { c.live = false; c.mesh.visible = false; } }
}
