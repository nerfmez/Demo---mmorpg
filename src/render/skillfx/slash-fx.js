// Slash (bench look, v4): one clean crescent of light around the caster over the real range and arc.
// Shape: the outer edge is the reach, the inner edge bows in so the crescent is thick in the middle
// and pointed at both ends. It is energy, not paint: a white-hot outer edge that falls off to
// transparent toward the caster, a soft additive glow around it, thin speed lines sliding along
// the arc, a bright leading edge with the trail behind it already fading, sparks thrown off the
// leading edge and a short flash of light. Motion: a fast reveal that passes the middle of the
// arc at the contact time, then it thins from its inner edge and fades.
// Strikes in quick succession (spamming, Multistrike repeats) cycle through different tilts and
// sides so consecutive slashes read as different cuts.
import * as THREE from 'three';
import { Ribbon, place, fxGround, addLight } from './fx-common.js';

let sparkW = 0;
const sparkWidth = (x) => sparkW * x;
const SWEEP = 0.075, HOLD = 0.03, FADE = 0.17, CUTS = 6, CHAIN = 1.2;
const PALETTE = { hot: [1, 1, 1], body: [0.5, 0.78, 1.0], glow: [0.25, 0.5, 1.0], spark: [0.85, 0.95, 1.0] };
const FUSE = { fire: [1.0, 0.5, 0.15], arcane: [0.75, 0.5, 1.0], lightning: [0.5, 0.85, 1.0], cold: [0.6, 0.9, 1.0] };
// consecutive strikes: tilt (roll around the facing axis, signed by the swing side), height, reach
const PATTERN = [
  { tilt: 0.38, y: 0.05, reach: 1.0 },
  { tilt: 0.3, y: 0.15, reach: 0.96 },
  { tilt: 0.08, y: -0.05, reach: 1.04 },
  { tilt: 0.55, y: 0.1, reach: 0.98 },
  { tilt: 0.2, y: 0.2, reach: 0.95 },
];

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// shared shape: s along the cut (0 start .. 1 end), v across (0 caster .. 1 reach)
const SHAPE = `
  uniform float uHead; uniform float uFade; uniform float uDir; uniform float uThick; uniform float uSeed;
  uniform vec3 uHot; uniform vec3 uBody; uniform vec3 uGlow; uniform vec3 uRim; uniform float uRimK;
  float hash(float x){ return fract(sin(x * 91.7 + uSeed) * 43758.5453); }
  float widthAt(float s){ return uThick * pow(sin(3.14159265 * clamp(s, 0.0, 1.0)), 0.8) * (1.0 - uFade); }`;
const CORE_FS = `varying vec2 vUv; ${SHAPE}
  void main(){
    float s = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
    float trail = uHead - s;                         // 0 at the leading edge, grows behind it
    if (trail < 0.0) discard;
    float w = widthAt(s) * (1.0 + 0.3 * exp(-trail * 14.0) * (1.0 - uFade));
    float inner = 1.0 - w;
    float v = vUv.y;
    if (v < inner) discard;
    float b = (v - inner) / max(w, 1e-3);            // 0 inner edge .. 1 outer edge
    float life = exp(-trail * 2.6);                  // the trail behind the edge is already fading
    // body falls off toward the caster; the outer edge is white-hot
    float a = smoothstep(0.0, 0.65, b);
    vec3 c = mix(uBody, uHot, smoothstep(0.42, 0.8, b));
    // speed lines: thin lines along the arc, broken into dashes that slide with the cut
    float lane = floor(b * 9.0);
    float line = smoothstep(0.42, 0.5, abs(fract(b * 9.0) - 0.5)) * step(0.35, b);
    float dash = step(0.45, fract(s * (3.0 + 4.0 * hash(lane)) - uHead * 2.0 + hash(lane + 7.0)));
    c = mix(c, uHot, line * dash * 0.8);
    a = max(a, line * dash * 0.55);
    // a thin edge line in the payload's colour when a spell is linked
    c = mix(c, uRim, uRimK * smoothstep(0.9, 0.97, b));
    // leading edge flash
    c = mix(c, uHot, exp(-trail * 30.0));
    a *= mix(0.6, 1.0, life) * (1.0 - uFade * uFade);
    // soft inner edge, crisp outer edge
    a *= smoothstep(0.0, 0.12, b) * (1.0 - smoothstep(0.985, 1.0, b));
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a); }`;
const GLOW_FS = `varying vec2 vUv; ${SHAPE}
  void main(){
    float s = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
    float trail = uHead - s;
    if (trail < -0.04) discard;
    float w = widthAt(s) * 1.5 + 0.08;
    float v = vUv.y;
    float b = (v - (1.0 - w)) / max(w, 1e-3);
    if (b < 0.0) discard;
    // a soft band peaking just inside the reach, with a little bloom past it
    float g = smoothstep(0.0, 0.75, b) * (1.0 - smoothstep(0.86, 1.0, b));
    g *= exp(-max(trail, 0.0) * 2.2) * (1.0 - uFade) * (trail < 0.0 ? 1.0 + trail * 25.0 : 1.0);
    vec3 c = mix(uGlow, uRim, uRimK * 0.6);
    gl_FragColor = vec4(c * g * 0.45, 1.0); }`;

function arcGeometry(arcRad, r0, r1, segs = 72, rings = 8) {
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
  constructor(scene, camera) {
    this.scene = scene;
    this._m = new THREE.Matrix4(); this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    this.geos = new Map();
    this.cuts = Array.from({ length: CUTS }, () => {
      const uniforms = { uHead: { value: 0 }, uFade: { value: 0 }, uDir: { value: 1 }, uThick: { value: 0.55 }, uSeed: { value: 0 },
        uHot: { value: new THREE.Vector3(...PALETTE.hot) }, uBody: { value: new THREE.Vector3(...PALETTE.body) }, uGlow: { value: new THREE.Vector3(...PALETTE.glow) },
        uRim: { value: new THREE.Vector3(1, 0.5, 0.15) }, uRimK: { value: 0 } };
      const core = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: CORE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      const glow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      core.renderOrder = 6; glow.renderOrder = 5;
      for (const m of [core, glow]) { m.frustumCulled = false; m.visible = false; }
      const g = new THREE.Group(), tilt = new THREE.Group();
      tilt.add(glow, core); g.add(tilt); scene.add(g);
      return { g, tilt, core, glow, uniforms, live: false, t: 0, reach: 1, arc: 1, dir: 1, lastHead: 0, hold: HOLD, drift: new THREE.Vector3() };
    });
    this.sparks = new Ribbon(scene, camera, 1200, `varying vec2 vUv; varying float vA; varying vec3 vT;
      void main(){ float d=abs(vUv.y); if(d>0.9) discard; gl_FragColor=vec4(d<0.45 ? vec3(1.0) : vT, vA); }`, THREE.NormalBlending);
    this.sparks.mesh.renderOrder = 7;
    this.sparkList = [];
    this.light = addLight(scene, new THREE.PointLight('#cfe8ff', 0, 3, 2));
    this.pending = []; this.t = 0; this.lastAt = -9; this.index = 0; this.seed = 1;
    this._p = new THREE.Vector3(); this._q = new THREE.Vector3(); this._a = new THREE.Vector3();
    this._seg = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  geometry(arcDeg, range, inner = 0.25) {
    const key = `${arcDeg}|${range.toFixed(2)}|${inner}`;
    if (!this.geos.has(key)) this.geos.set(key, arcGeometry((arcDeg * Math.PI) / 180, range * inner, range));
    return this.geos.get(key);
  }
  // a strike whose contact lands `contactIn` seconds from now. where(): caster {x, z, angle} at reveal
  // time; dir: +1 when the blade sweeps toward increasing facing angle (the first swing pose), -1 back
  swing(contactIn, o) {
    this.pending.push({ at: this.t + Math.max(0, contactIn - SWEEP * 0.5), ...o });
  }
  start(p) {
    const k = this.t - this.lastAt < CHAIN ? (this.index + 1) % PATTERN.length : 0;
    this.index = k; this.lastAt = this.t;
    const pat = PATTERN[k], at = p.where(), dir = p.dir || 1;
    const c = this.cuts.find((q) => !q.live) || this.cuts.reduce((a, b) => (a.t > b.t ? a : b));
    const arcDeg = p.faceArc ?? p.arc; // a camera-facing cut may take a flatter arc than the skill's hit arc
    c.reach = p.range * (p.reach ?? pat.reach); c.arc = (arcDeg * Math.PI) / 180; c.dir = dir; c.lastHead = 0; c.hold = p.hold ?? HOLD;
    c.core.geometry = c.glow.geometry = this.geometry(arcDeg, c.reach, p.inner);
    c.tilt.rotation.set(0, 0, 0);
    c.drift.set(0, 0, 0);
    if (p.face !== undefined) this.standFront(c, p, at);
    else {
      place(c.g, at.x, 1.0 + (p.y ?? pat.y), at.z);
      c.g.rotation.set(0, at.angle, 0);
      c.tilt.rotateZ(p.tilt ?? pat.tilt * dir); // the cut's plane rolls around the facing direction
      c.tilt.rotateX(-0.06);
    }
    const u = c.uniforms;
    u.uDir.value = dir; u.uHead.value = 0; u.uFade.value = 0; u.uSeed.value = (this.seed = (this.seed * 7.31) % 97);
    const pal = p.palette || PALETTE; // a skill may bring its own colours (Sunder Cut: amber steel)
    u.uHot.value.set(...pal.hot); u.uBody.value.set(...pal.body); u.uGlow.value.set(...pal.glow);
    u.uRimK.value = p.fusedElement ? 1 : 0;
    if (p.fusedElement) u.uRim.value.set(...(FUSE[p.fusedElement] || FUSE.fire));
    // a cut drawn over the bodies it crosses (Cross Cut: its X would be cut in half by the monster in front)
    c.core.material.depthTest = c.glow.material.depthTest = !p.overlay;
    c.live = true; c.t = 0; c.core.visible = c.glow.visible = true;
  }
  // A cut set in front of the caster, leaning back (Cross Cut: the owner wants the X as the hero cuts it,
  // two cuts crossing in the air ahead; upright it is edge-on to the high game camera whenever the hero
  // faces across the screen, flat it reads only from above). The plane leans back by `lean` radians from
  // upright, so the camera above sees it whatever the facing; the crescent's band crosses a point `ahead`
  // metres in front, bulging toward `face` radians from the plane's up (positive to the caster's right),
  // and the cut drifts forward at `drift` m/s.
  standFront(c, p, at) {
    const fx = Math.sin(at.angle), fz = Math.cos(at.angle), cl = Math.cos(p.lean || 0), sl = Math.sin(p.lean || 0);
    const normal = this._y.set(-fx * cl, sl, -fz * cl); // back toward the caster, tipped up
    const rx = Math.cos(at.angle), rz = -Math.sin(at.angle), cf = Math.cos(p.face), sf = Math.sin(p.face);
    // the plane's up (up tipped forward) turned toward the caster's right by `face`
    const bulge = this._z.set(fx * sl * cf + rx * sf, cl * cf, fz * sl * cf + rz * sf);
    this._m.makeBasis(this._x.crossVectors(normal, bulge), normal, bulge);
    c.g.quaternion.setFromRotationMatrix(this._m);
    const d = p.ahead ?? c.reach;
    place(c.g, at.x + fx * d, 1.0 + (p.y ?? 0), at.z + fz * d);
    c.g.position.addScaledVector(bulge, -c.reach * (1 + (p.inner ?? 0.25)) / 2); // the arc's centre below the point, so its band crosses it
    c.drift.set(fx, 0, fz).multiplyScalar(p.drift || 0);
  }
  // world point on the reach edge at fraction s of the cut
  edgePoint(c, s, out) {
    const a = -c.arc / 2 + (c.dir > 0 ? s : 1 - s) * c.arc;
    out.set(Math.sin(a) * c.reach, 0, Math.cos(a) * c.reach);
    c.tilt.updateMatrixWorld(true);
    return c.tilt.localToWorld(out);
  }
  update(dt) {
    this.t += dt;
    for (let i = 0; i < this.pending.length; i++) if (this.t >= this.pending[i].at) { this.start(this.pending[i]); this.pending.splice(i--, 1); }
    let light = 0;
    for (const c of this.cuts) {
      if (!c.live) continue;
      c.t += dt;
      if (c.drift.x || c.drift.z) c.g.position.addScaledVector(c.drift, dt);
      const r = Math.min(1, c.t / SWEEP), head = 1 - (1 - r) * (1 - r);
      c.uniforms.uHead.value = head;
      c.uniforms.uFade.value = Math.max(0, (c.t - SWEEP - c.hold) / FADE);
      // sparks thrown off the leading edge while it travels
      if (head > c.lastHead + 0.02) {
        const n = Math.ceil((head - c.lastHead) * 10);
        for (let i = 0; i < n && this.sparkList.length < 160; i++) {
          const s = c.lastHead + (head - c.lastHead) * Math.random();
          this.edgePoint(c, s, this._p); this.edgePoint(c, Math.min(1, s + 0.03), this._q);
          const v = this._q.sub(this._p).normalize().multiplyScalar(6 + Math.random() * 6);
          v.x += (Math.random() - 0.5) * 2; v.y += Math.random() * 2; v.z += (Math.random() - 0.5) * 2;
          this._p.y -= fxGround.y(this._p.x, this._p.z); // sparks are kept above the ground, like every ribbon point
          this.sparkList.push({ p: this._p.clone(), v: v.clone(), age: 0, life: 0.12 + Math.random() * 0.14, w: 0.02 + Math.random() * 0.018 });
        }
        if (r < 1) { this.edgePoint(c, head, this.light.position); light = Math.max(light, 1.5); }
        c.lastHead = head;
      }
      if (c.t > SWEEP + c.hold + FADE) { c.live = false; c.core.visible = c.glow.visible = false; }
    }
    this.light.intensity = Math.max(light, this.light.intensity - dt * 40);
    for (const s of this.sparkList) { s.age += dt; s.v.multiplyScalar(1 - 6 * dt); s.v.y -= 4 * dt; s.p.addScaledVector(s.v, dt); }
    let live = 0;
    for (const s of this.sparkList) if (s.age < s.life) this.sparkList[live++] = s;
    this.sparkList.length = live;
    this.sparks.begin();
    const seg = this._seg;
    for (const s of this.sparkList) {
      const u = s.age / s.life;
      this._a.copy(s.p).addScaledVector(s.v, -0.03);
      seg[0].copy(this._a); seg[1].copy(s.p).lerp(this._a, 0.5); seg[2].copy(s.p);
      sparkW = s.w * (1 - u * 0.5);
      this.sparks.strip(seg, sparkWidth, 1 - u * u, PALETTE.spark);
    }
    this.sparks.end();
  }
  clear() { this.pending = []; this.sparkList = []; this.light.intensity = 0; for (const c of this.cuts) { c.live = false; c.core.visible = c.glow.visible = false; } }
}
