// Flame Stream "dragon breath": soft blobs are summed into a density buffer and ONE composite
// pass thresholds the sum, so the torrent reads as a single outlined mass that widens into the
// real cone and dissolves at its tail. Dummies (layer 1) are depth-tested so they stand inside
// the fire with a readable rim. Driven by channelStart / channelPulse / channelEnd.
import * as THREE from 'three';
import { Ribbon, mulberry32, clamp01, NOISE, addLight, place, placeV, fxConfig, conformPlane } from './fx-common.js';

export const OCCLUDER_LAYER = 1;
const POOL = 260;
const PALETTES = {
  fire: { line: [0.45, 0.06, 0.05], red: [0.85, 0.19, 0.08], org: [1.0, 0.48, 0.11], yel: [1.0, 0.78, 0.24], wht: [1.0, 0.97, 0.82], smoke: [0.4, 0.32, 0.34], smokeLine: [0.22, 0.15, 0.17], glow: [1.0, 0.55, 0.2], rim: [1.0, 0.9, 0.66], ember: [1.0, 0.55, 0.15], heat: [0.96, 0.42, 0.1], heat2: [1.0, 0.78, 0.35], burnt: [0.22, 0.16, 0.13], light: '#ffae5a' },
  cold: { line: [0.08, 0.2, 0.45], red: [0.22, 0.46, 0.82], org: [0.42, 0.72, 0.97], yel: [0.72, 0.92, 1.0], wht: [0.97, 1.0, 1.0], smoke: [0.72, 0.82, 0.9], smokeLine: [0.4, 0.52, 0.64], glow: [0.5, 0.8, 1.0], rim: [0.9, 0.98, 1.0], ember: [0.75, 0.92, 1.0], heat: [0.55, 0.82, 1.0], heat2: [0.85, 0.96, 1.0], burnt: [0.78, 0.9, 0.97], light: '#bfe6ff' },
};
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let emberW = 0;
const emberWidth = (x) => emberW * x;

export class FlameFx {
  constructor(scene, camera, renderer) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    const gl = renderer.getContext();
    this.floatOK = renderer.capabilities.isWebGL2 && !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.k = this.floatOK ? 1 : 0.2; // 8-bit fallback stores scaled density
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: this.floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false });
    this.occRT = new THREE.WebGLRenderTarget(4, 4);
    this.occRT.depthTexture = new THREE.DepthTexture(4, 4);
    this.fxScene = new THREE.Scene();
    const shared = { tOccDepth: { value: this.occRT.depthTexture }, uNear: { value: camera.near }, uFar: { value: camera.far }, uK: { value: this.k } };
    this.shared = shared;
    const blobFS = `#include <packing>
      varying vec2 vUv; varying float vViewZ; uniform float uK;
      uniform float uAge; uniform float uSeed; uniform float uBoil; uniform float uHeat; uniform float uAmt; ${NOISE}
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float fall = pow(1.0 - r, 1.3);
        float n = fbm(vUv*1.8 + uSeed + vec2(uBoil*0.9, -uBoil*0.6));
        float d = fall * (0.15 + 2.2*n*n) * uAmt;
        float heat = uHeat * pow(1.0 - uAge, 0.9);
        float smoke = smoothstep(0.6, 1.0, uAge);
        gl_FragColor = vec4(d, d*heat, d*smoke, d*vViewZ*0.05) * uK; }`;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.quad = quad;
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const u = { uAge: { value: 0 }, uSeed: { value: 0 }, uBoil: { value: 0 }, uHeat: { value: 1 }, uAmt: { value: 0.5 }, uK: shared.uK };
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: `varying vec2 vUv; varying float vViewZ; void main(){ vUv=uv*2.0-1.0; vec4 mv = modelViewMatrix*vec4(position,1.0); vViewZ = -mv.z; gl_Position=projectionMatrix*mv;} `,
        fragmentShader: blobFS, transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      }));
      m.visible = false; m.frustumCulled = false; this.fxScene.add(m); this.pool.push({ m, u });
    }
    const P = PALETTES.fire;
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tOccDepth: shared.tOccDepth, uNear: shared.uNear, uFar: shared.uFar, uK: shared.uK, tMask: { value: this.occRT.texture }, tD: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(800, 500) }, uTexel: { value: new THREE.Vector2(1 / 400, 1 / 250) }, uFlow: { value: new THREE.Vector2(1, 0) }, uT: { value: 0 }, uMouth: { value: new THREE.Vector2(0.2, 0.7) },
        uLine: { value: v3(P.line) }, uRed: { value: v3(P.red) }, uOrg: { value: v3(P.org) }, uYel: { value: v3(P.yel) }, uWht: { value: v3(P.wht) }, uSmoke: { value: v3(P.smoke) }, uSmokeLine: { value: v3(P.smokeLine) }, uGlow: { value: v3(P.glow) }, uRim: { value: v3(P.rim) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy*2.0, 0.0, 1.0); }`,
      fragmentShader: `#include <packing>
        uniform sampler2D tOccDepth; uniform float uNear; uniform float uFar; uniform float uK;
        varying vec2 vUv; uniform sampler2D tMask; uniform sampler2D tD; uniform vec2 uRes; uniform vec2 uTexel; uniform vec2 uFlow; uniform float uT; uniform vec2 uMouth;
        uniform vec3 uLine; uniform vec3 uRed; uniform vec3 uOrg; uniform vec3 uYel; uniform vec3 uWht; uniform vec3 uSmoke; uniform vec3 uSmokeLine; uniform vec3 uGlow; uniform vec3 uRim; ${NOISE}
        void main(){
          vec2 px0 = vUv * uRes / 45.0;
          vec2 pf = vec2(dot(px0, uFlow), dot(px0, vec2(-uFlow.y, uFlow.x)));
          vec2 perp = vec2(-uFlow.y, uFlow.x) / uRes * 45.0;
          float w1 = fbm(vec2(pf.x*0.9 - uT*4.0, pf.y*0.6)) - 0.5;
          float w2 = fbm(vec2(pf.x*2.2 - uT*6.5, pf.y*1.8 + 4.0)) - 0.5;
          vec2 warp = perp*(w1*0.9 + w2*0.4) + uFlow/uRes*45.0*(w2*0.5);
          warp += vec2(0.0, 1.0)/uRes*45.0 * max(w1, 0.0) * 0.8;
          float md = length((vUv - uMouth) * uRes) / uRes.x;
          float turb = smoothstep(0.06, 0.32, md);
          vec4 s = texture2D(tD, vUv + warp*1.6*turb) / uK;
          float d = s.r;
          float heat = s.g / max(d, 1e-3);
          float smoke = s.b / max(d, 1e-3);
          float od = texture2D(tOccDepth, vUv).x;
          if (od < 1.0 && d > 0.02) {
            float occZ = -perspectiveDepthToViewZ(od, uNear, uFar);
            float fireZ = s.a * 20.0 / d;
            d *= smoothstep(-0.1, 0.2, occZ - fireZ);
          }
          float cool = 1.0 - smoothstep(0.28, 0.7, heat);
          float er = fbm(vUv*uRes/38.0 + vec2(-uT*2.2, uT*1.4));
          float thr = 0.3 + cool*(0.08 + 1.1*er*er);
          if (d < thr) {
            float wisp = smoothstep(thr*0.45, thr*0.8, d) * cool * smoothstep(0.45, 0.7, fbm(vUv*uRes/22.0 + vec2(-uT*1.5, uT*2.5)));
            float glowA = smoothstep(0.08, 0.3, d) * 0.22 * (1.0 - cool);
            if (wisp > 0.02) { gl_FragColor = vec4(uSmoke*1.05, wisp*0.55); return; }
            if (glowA < 0.01) discard; gl_FragColor = vec4(uGlow, glowA); return; }
          vec2 px = vUv * uRes / 60.0;
          vec2 along = vec2(dot(px, uFlow), dot(px, vec2(-uFlow.y, uFlow.x)));
          float st = fbm(vec2(along.x*0.6 - uT*9.0, along.y*3.5));
          float dd = clamp((d - thr)/0.9, 0.0, 1.0);
          float level = heat*0.55 + dd*0.55 + (st - 0.5)*0.18;
          float sw = fbm(vec2(along.x*0.35 - uT*5.0, along.y*0.9 + 2.0));
          level -= smoothstep(0.55, 0.7, sw) * 0.3 * dd;
          vec3 c = uRed;
          c = mix(c, uOrg, smoothstep(0.30, 0.34, level));
          c = mix(c, uYel, smoothstep(0.52, 0.56, level));
          c = mix(c, uWht, smoothstep(0.74, 0.78, level) * step(0.62, heat));
          c = mix(c, uSmoke, smoothstep(0.62, 0.8, smoke) * (1.0 - smoothstep(0.6, 1.4, d)));
          float edge = 1.0 - smoothstep(thr, thr + 0.06, d);
          c = mix(c, mix(uLine, uSmokeLine, smoothstep(0.62, 0.8, smoke)), edge);
          float m = texture2D(tMask, vUv).r;
          float mn = min(min(texture2D(tMask, vUv + vec2(1.5,0.0)*uTexel).r, texture2D(tMask, vUv - vec2(1.5,0.0)*uTexel).r),
                         min(texture2D(tMask, vUv + vec2(0.0,1.5)*uTexel).r, texture2D(tMask, vUv - vec2(0.0,1.5)*uTexel).r));
          float mx = max(max(texture2D(tMask, vUv + vec2(1.5,0.0)*uTexel).r, texture2D(tMask, vUv - vec2(1.5,0.0)*uTexel).r),
                         max(texture2D(tMask, vUv + vec2(0.0,1.5)*uTexel).r, texture2D(tMask, vUv - vec2(0.0,1.5)*uTexel).r));
          float rim = step(0.5, mx) * (1.0 - step(0.5, mn)) * step(0.5, m + mx);
          if (rim > 0.5) { gl_FragColor = vec4(uRim, 0.9); return; }
          gl_FragColor = vec4(c, 1.0 - 0.35 * m); }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.comp = new THREE.Mesh(quad, this.compMat);
    this.comp.frustumCulled = false; this.comp.renderOrder = 10; this.comp.visible = false; scene.add(this.comp);

    // ground: patchy heat shimmer inside the cone, scorch left behind
    this.heatMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 }, uT: { value: 0 }, uLen: { value: 0 }, uScorch: { value: 0 }, uO: { value: new THREE.Vector2() }, uF: { value: new THREE.Vector2(1, 0) }, uHalf: { value: 0.48 },
        uHeat: { value: v3(P.heat) }, uHeat2: { value: v3(P.heat2) }, uBurnt: { value: v3(P.burnt) } },
      vertexShader: `varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xz; gl_Position=projectionMatrix*viewMatrix*w;} `,
      fragmentShader: `varying vec2 vW; uniform float uI; uniform float uT; uniform float uLen; uniform float uScorch; uniform vec2 uO; uniform vec2 uF; uniform float uHalf;
        uniform vec3 uHeat; uniform vec3 uHeat2; uniform vec3 uBurnt; ${NOISE}
        void main(){
          vec2 w = vW - uO;
          vec2 p = vec2(dot(w, uF), dot(w, vec2(uF.y, -uF.x)));
          float d = length(p); float ang = abs(atan(p.y, p.x));
          float n = fbm(p*1.3 + vec2(-uT*2.5, 0.0));
          float hw = uHalf*(0.6 + 0.6*n);
          float cone = (1.0 - smoothstep(hw*0.6, hw, ang)) * smoothstep(uLen + 0.2, uLen - 0.8, d) * smoothstep(0.5, 1.2, d);
          float f = fbm(p*2.2 - vec2(uT*3.5, 0.0));
          float glow = cone * uI * smoothstep(0.5, 0.62, f);
          float burnt = smoothstep(0.55, 0.6, fbm(p*1.9 + 4.0)) * (1.0 - smoothstep(uHalf*0.52, uHalf*0.88, ang)) * smoothstep(uLen*0.96, uLen*0.72, d) * smoothstep(0.8, 1.4, d) * uScorch;
          vec3 c = mix(uHeat, uHeat2, smoothstep(0.66, 0.74, f));
          if (glow < 0.02 && burnt < 0.02) discard;
          gl_FragColor = glow > 0.02 ? vec4(c, glow*0.7) : vec4(uBurnt, burnt*0.4); }`,
      transparent: true, depthWrite: false,
    });
    this.heat = new THREE.Mesh(new THREE.PlaneGeometry(16, 16, 24, 24), this.heatMat);
    this.heat.rotation.x = -Math.PI / 2; this.heat.renderOrder = 0; this.heat.visible = false; scene.add(this.heat);

    const emberFrag = `varying vec2 vUv; varying float vA; varying vec3 vT;
      void main(){ float d=abs(vUv.y); if(d>0.9) discard; vec3 c = d<0.45 ? mix(vT, vec3(1.0,0.97,0.85), 0.75) : vT; gl_FragColor=vec4(c, vA); }`;
    this.embers = new Ribbon(scene, camera, 3000, emberFrag, THREE.NormalBlending);
    this.embers.mesh.renderOrder = 11;
    this.occWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.fireLight = addLight(scene, new THREE.PointLight('#ffae5a', 0, 8, 1.6));
    this.tipLight = addLight(scene, new THREE.PointLight('#ffb766', 0, 3, 2));
    this.parts = []; this.sparks = []; this.rnd = mulberry32(9); this.t = 0;
    // flame blobs and embers come from fixed pools (no allocation per particle)
    this.partFree = Array.from({ length: POOL + 40 }, () => ({ p: new THREE.Vector3(), from: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1, s0: 0, s1: 0, seed: 0, heat: 1, amt: 0, kind: 0, drive: 0 }));
    this.sparkFree = Array.from({ length: 320 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1, w: 0 }));
    this.partAlive = (q) => q.age < q.life || (this.partFree.push(q), false);
    this.sparkAlive = (q) => q.age < q.life || (this.sparkFree.push(q), false);
    this.seg = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.state = null; // {phase: 'wind'|'on'|'off', t, total, range, arc, element}
    this.tip = new THREE.Vector3(); this.origin = new THREE.Vector3(); this.fwd = new THREE.Vector3(1, 0, 0); this.side = new THREE.Vector3(0, 0, 1);
    this.size = new THREE.Vector2();
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._o = new THREE.Object3D(); this._prevColor = new THREE.Color();
    this.setPalette('fire');
  }
  setPalette(element) {
    const key = element === 'cold' ? 'cold' : 'fire';
    if (this.paletteKey === key) return;
    this.paletteKey = key;
    const P = PALETTES[key], u = this.compMat.uniforms;
    for (const [k, n] of [['line', 'uLine'], ['red', 'uRed'], ['org', 'uOrg'], ['yel', 'uYel'], ['wht', 'uWht'], ['smoke', 'uSmoke'], ['smokeLine', 'uSmokeLine'], ['glow', 'uGlow'], ['rim', 'uRim']]) u[n].value.set(...P[k]);
    const h = this.heatMat.uniforms; h.uHeat.value.set(...P.heat); h.uHeat2.value.set(...P.heat2); h.uBurnt.value.set(...P.burnt);
    this.fireLight.color.set(P.light); this.tipLight.color.set(P.light);
    this.emberTint = P.ember;
  }
  resize(w, h, cssW, cssH) {
    const k = Math.min(1, 1400 / Math.max(cssW, cssH));
    const sw = Math.max(1, Math.round(cssW * k)), sh = Math.max(1, Math.round(cssH * k));
    this.rt.setSize(sw, sh); this.occRT.setSize(sw, sh);
    this.compMat.uniforms.uRes.value.set(cssW, cssH); this.size.set(cssW, cssH);
    this.compMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
  }
  begin(skill, element) {
    this.setPalette(element);
    this.state = { phase: 'wind', t: 0, total: Math.max(0.05, skill.castTime || 0.2), range: skill.range || 5, arc: ((skill.arc || 55) * Math.PI) / 180, onT: 0, offT: 0, scorch: 0 };
    this.nextEmit = 0; this.lastEmber = 0;
  }
  pulse(e) {
    if (!this.state) this.begin({ range: e.range, arc: e.arc, castTime: 0.05 }, e.element);
    this.setPalette(e.element);
    if (this.state.phase === 'wind') { this.state.phase = 'on'; this.state.onT = 0; }
    this.state.range = e.range; this.state.arc = (e.arc * Math.PI) / 180;
  }
  end() { if (this.state && this.state.phase !== 'off') { this.state.phase = 'off'; this.state.offT = 0; } }
  lick(center) {
    const r = this.rnd;
    for (let i = 0; i < 2; i++) {
      const q = this.part(); if (!q) break;
      q.p.copy(center).add(this._a.set((r() - 0.5) * 0.4, 0.3, (r() - 0.5) * 0.4)); q.v.set(0, 1.8, 0);
      Object.assign(q, { age: 0, life: 0.4, s0: 0.4, s1: 0.9, seed: r() * 50, heat: 0.8, amt: 0.6, kind: 1 });
    }
    this.ember(center, 1);
  }
  ember(p, spread) {
    const r = this.rnd;
    const sp = this.sparkFree.pop(); if (!sp) return;
    sp.p.copy(p); sp.v.set((r() - 0.3) * 2.5 * spread, 1.5 + r() * 2.5, (r() - 0.5) * 2.5 * spread); sp.age = 0; sp.life = 0.5 + r() * 0.6; sp.w = 0.025 + r() * 0.02;
    this.sparks.push(sp);
  }
  part() { const q = this.partFree.pop(); if (q) this.parts.push(q); return q;
  }
  inCone(x, z) {
    const s = this.state; if (!s) return false;
    const dx = x - this.origin.x, dz = z - this.origin.z, d = Math.hypot(dx, dz);
    const a = Math.atan2(dx * this.side.x + dz * this.side.z, dx * this.fwd.x + dz * this.fwd.z);
    return d <= s.range && Math.abs(a) <= s.arc / 2;
  }
  // tip: staff head (world). origin/facing: the caster (facing a points along (sin a, cos a)).
  update(dt, tip, ox, oz, facing) {
    this.t += dt;
    this.tip.copy(tip); this.origin.set(ox, 0, oz);
    this.fwd.set(Math.sin(facing), 0, Math.cos(facing)); this.side.set(Math.cos(facing), 0, -Math.sin(facing));
    const s = this.state, r = this.rnd;
    let on = false, power = 0;
    if (s) {
      s.t += dt;
      if (s.phase === 'wind') {
        if (s.t - this.lastEmber > 0.025) { this.lastEmber = s.t; this.ember(tip, 0.3); }
        if (s.t > s.total + 0.6) this.end(); // the cast never started channelling
      } else if (s.phase === 'on') {
        s.onT += dt; on = true; power = clamp01(s.onT / 0.15);
        s.scorch = Math.min(1, s.scorch + dt / 0.6 * (s.onT > 0.3 ? 1 : 0));
      } else {
        s.offT += dt; s.scorch = Math.max(0, s.scorch - (s.offT > 0.4 ? dt / 0.6 : 0));
        if (s.offT > 1.4 && !this.parts.length && !this.sparks.length) this.state = null;
      }
    }
    if (on) {
      const surge = 0.92 + 0.18 * Math.max(0, Math.sin(this.t * Math.PI * 2 * 7));
      if (this.nextEmit === 0 || this.nextEmit < this.t - 0.1) this.nextEmit = this.t;
      while (this.t >= this.nextEmit) { const q = this.emitBlob((0.75 + 0.25 * power) * (0.9 + 0.2 * surge), surge, s), late = this.t - this.nextEmit; if (q) { q.p.addScaledVector(q.v, late); q.age = late; } this.nextEmit += (0.005 + r() * 0.005) / surge; }
      if (r() < dt * 60) {
        const sd = r() < 0.5 ? -1 : 1, f = 3 + r() * 3, sdv = sd * (3 + r() * 3), q = this.part();
        if (q) { q.p.copy(tip); q.v.set(this.fwd.x * f + this.side.x * sdv, (r() - 0.3) * 3, this.fwd.z * f + this.side.z * sdv); Object.assign(q, { age: 0, life: 0.07 + r() * 0.04, s0: 0.35, s1: 0.75, seed: r() * 50, heat: 1, amt: 0.5, kind: 3 }); }
      }
      if (this.t - this.lastEmber > 0.02) { this.lastEmber = this.t; const d = s.range * (0.6 + r() * 0.44), a = (r() - 0.5) * s.arc * 0.8; this._a.set(ox + (this.fwd.x * Math.cos(a) + this.side.x * Math.sin(a)) * d, 0.3 + r() * 0.6, oz + (this.fwd.z * Math.cos(a) + this.side.z * Math.sin(a)) * d); this.ember(this._a, 1.3); }
    } else this.nextEmit = 0;

    const half = s ? s.arc / 2 : 0.48;
    for (const q of this.parts) {
      q.age += dt;
      if (q.kind === 0) {
        q.v.multiplyScalar(1 - (q.age < q.drive ? 0.4 : 3.2) * dt);
        if (q.p.distanceTo(tip) > s?.range * 0.76) q.v.y += 5 * dt;
        if (q.p.y < 0.45 && q.v.y < 0) { const sd = Math.sin(q.seed * 7.1) > 0 ? 1 : -1, k = sd * (1.5 + (q.seed % 1) * 3.0); q.v.y = Math.abs(q.v.y) * 0.15; q.v.x += this.side.x * k; q.v.z += this.side.z * k; }
        const slow = 1 - clamp01(Math.hypot(q.v.x, q.v.z) / 5);
        q.v.y += 3.8 * slow * dt;
        const dx = q.p.x - ox, dz = q.p.z - oz;
        const ang = Math.atan2(dx * this.side.x + dz * this.side.z, dx * this.fwd.x + dz * this.fwd.z);
        if (Math.abs(ang) > half) { const k = -Math.sign(ang) * 14 * dt; q.v.x += this.side.x * k; q.v.z += this.side.z * k; }
      }
      q.p.addScaledVector(q.v, dt);
    }
    compact(this.parts, this.partAlive);
    for (const sp of this.sparks) { sp.age += dt; sp.v.y -= 2.0 * dt; sp.v.multiplyScalar(1 - 1.2 * dt); sp.p.addScaledVector(sp.v, dt); }
    compact(this.sparks, this.sparkAlive);

    // blobs -> pool
    const boil = this.t * 2.2, range = s?.range || 5;
    let i = 0;
    for (const q of this.parts) {
      if (i >= POOL) break;
      const P = this.pool[i++], u = q.age / q.life;
      const dist = q.kind === 0 ? q.p.distanceTo(q.from) : 0;
      const sc = q.kind === 0 ? (q.s0 + dist * 0.62) * (1 - (0.25 * Math.max(0, u - 0.6)) / 0.4) : q.s0 + (q.s1 - q.s0) * (1 - Math.pow(1 - u, 2.0));
      P.m.visible = true; placeV(P.m, q.p); P.m.quaternion.copy(this.camera.quaternion); P.m.scale.setScalar(sc);
      const far = q.kind === 0 ? THREE.MathUtils.smoothstep(dist, range * 0.66, range * 1.12) : 0;
      P.u.uAge.value = Math.max(u, far * 0.75); P.u.uSeed.value = q.seed; P.u.uBoil.value = boil; P.u.uHeat.value = q.heat * (1 - far * 0.8);
      const driven = q.kind === 0 && q.age < q.drive + 0.03;
      P.u.uAmt.value = q.amt * Math.pow(1 - u, 1.4) * 1.5 * (1 - 0.6 * far) * (driven ? 2.6 : 1 + 1.2 * Math.max(0, 1 - u / 0.25));
      if (driven) P.m.scale.set(sc, sc * 0.8, 1);
    }
    for (; i < POOL; i++) this.pool[i].m.visible = false;
    this.comp.visible = this.parts.length > 0;
    this.compMat.uniforms.uT.value = this.t;

    this.embers.begin();
    for (const sp of this.sparks) {
      const u = sp.age / sp.life;
      this._a.copy(sp.p).addScaledVector(sp.v, -0.04);
      this.seg[0].copy(this._a); this.seg[1].copy(sp.p).lerp(this._a, 0.5); this.seg[2].copy(sp.p);
      emberW = sp.w * (1 - u * 0.5);
      this.embers.strip(this.seg, emberWidth, 1 - u * u, this.emberTint);
    }
    this.embers.end();

    // ground + lights
    const h = this.heatMat.uniforms;
    const reach = s ? (s.phase === 'on' ? Math.min(s.range, s.onT * 12) : s.phase === 'off' ? Math.max(0, s.range - s.offT * 8) : 0) : 0;
    h.uLen.value = reach; h.uT.value = this.t; h.uScorch.value = s ? s.scorch : 0;
    h.uI.value = s ? (s.phase === 'on' ? clamp01(s.onT / 0.2) : s.phase === 'off' ? Math.max(0, 1 - s.offT / 0.4) : 0) : 0;
    h.uO.value.set(ox, oz); h.uF.value.set(this.fwd.x, this.fwd.z); h.uHalf.value = half * 1.0;
    place(this.heat, ox, 0.02, oz); this.heat.visible = !!s;
    if (s) conformPlane(this.heat, 0.03);
    const fl = 0.8 + 0.2 * Math.sin(this.t * 37) * Math.sin(this.t * 23 + 1);
    place(this.fireLight, ox + this.fwd.x * 3, 1.0, oz + this.fwd.z * 3);
    this.fireLight.intensity = s ? (s.phase === 'on' ? 7 * fl * clamp01(s.onT / 0.1) : s.phase === 'off' ? Math.max(0, 7 * (1 - s.offT / 0.4)) : 0) : 0;
    placeV(this.tipLight, tip);
    this.tipLight.intensity = s ? (s.phase === 'wind' ? 3 * clamp01(s.t / s.total) : s.phase === 'on' ? 5 * fl : 0) : 0;
    return on;
  }
  emitBlob(power, surge, s) {
    const r = this.rnd;
    const a = (r() < 0.5 ? -1 : 1) * Math.pow(r(), 0.85) * s.arc * 0.5;
    const sp = (17 + r() * 8) * (s.range / 5);
    const ca = Math.cos(a), sa = Math.sin(a), dy = -0.3 + (r() - 0.5) * 0.08;
    const q = this.part(); if (!q) return null;
    q.v.set(this.fwd.x * ca + this.side.x * sa, dy, this.fwd.z * ca + this.side.z * sa).multiplyScalar(sp);
    q.p.copy(this.tip); q.from.copy(this.tip);
    Object.assign(q, { age: 0, life: 0.5 + r() * 0.18, s0: 0.3 + r() * 0.06, s1: (2.2 + r() * 1.1) * power, seed: r() * 50, heat: 1.0, amt: (0.2 + r() * 0.14) * surge, kind: 0, drive: 0.06 + r() * 0.04 });
    return q;
  }
  // offscreen passes; call right before the main render
  prerender() {
    if (!this.comp.visible) return;
    const renderer = this.renderer, camera = this.camera, scene = this.scene;
    // screen-space flow direction and mouth for the composite (the tip is kept above the ground)
    placeV(this._o, this.tip); this._a.copy(this._o.position).project(camera);
    this._b.copy(this._o.position).addScaledVector(this.fwd, 1).project(camera);
    this.compMat.uniforms.uFlow.value.set((this._b.x - this._a.x) * this.size.x, (this._b.y - this._a.y) * this.size.y).normalize();
    this.compMat.uniforms.uMouth.value.set(this._a.x * 0.5 + 0.5, this._a.y * 0.5 + 0.5);
    const prevTarget = renderer.getRenderTarget(), prevMask = camera.layers.mask, bg = scene.background;
    const prevColor = renderer.getClearColor(this._prevColor), prevAlpha = renderer.getClearAlpha();
    camera.layers.set(OCCLUDER_LAYER);
    scene.background = null; scene.overrideMaterial = this.occWhite;
    renderer.setRenderTarget(this.occRT); renderer.setClearColor(0x000000, 0); renderer.clear();
    if (fxConfig.occluders) renderer.render(scene, camera); // the game skips the pass: nothing occludes the flame there
    scene.overrideMaterial = null; scene.background = bg; camera.layers.mask = prevMask;
    renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(this.fxScene, camera);
    renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevAlpha);
  }
  clear() { for (const q of this.parts) this.partFree.push(q); for (const q of this.sparks) this.sparkFree.push(q); this.parts.length = 0; this.sparks.length = 0; this.state = null;
    this.comp.visible = false; this.heat.visible = false; this.fireLight.intensity = this.tipLight.intensity = 0; for (const P of this.pool) P.m.visible = false; this.embers.begin(); this.embers.end(); }
  get busy() { return !!this.state || this.parts.length > 0; }
}
