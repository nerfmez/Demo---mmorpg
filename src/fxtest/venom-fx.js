// Venom Arrow (bench trial of Venom Mire as a fast bow attack), in the same language as the bench's
// Firebolt, Chain Spark and Frost Nova: light, not solid toys. A little poison glow gathers at the
// nock over the draw; the arrow is a thin hot yellow-green needle of light with a short trail and a
// fine wisp twisting round it; on impact a small ragged poison flash, a puff and a few streaks; a
// poisoned target is tinted and gives off rising motes, more of them the more stacks it carries.
// Positions come from the rules' projectiles and 'impact' events. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, BILLBOARD_VS, NOISE } from './fx-common.js';

const SHOTS = 8, POPS = 6, HIST = 5, POP_LIFE = 0.3;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(0.96,1.0,0.8), 0.75) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const HOT = [0.86, 1.0, 0.45], MID = [0.55, 0.92, 0.2], DEEP = [0.25, 0.62, 0.12];

function haloTexture(inner, mid, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, mid); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// drop finished items in place (no new array each frame)
const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
const living = (x) => x.life < x.max;
let stripW = 0, stripU = 0;
const trailGlowW = (x) => stripW * 2.6 * x, trailCoreW = (x) => stripW * x * x;
const wispW = (x) => stripW * Math.sin(Math.PI * x);
const moteGlowW = (x) => stripW * 2.4 * x, moteCoreW = (x) => stripW * x * (1 - stripU * 0.5);

export class VenomFx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const haloMat = new THREE.SpriteMaterial({ map: haloTexture('rgba(235,255,170,1)', 'rgba(140,235,60,0.5)', 'rgba(60,150,20,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const coreMat = new THREE.SpriteMaterial({ map: haloTexture('rgba(255,255,235,1)', 'rgba(215,255,140,1)', 'rgba(150,230,60,0)'), depthWrite: false, transparent: true });
    const sprite = (mat, order) => { const s = new THREE.Sprite(mat); s.visible = false; s.renderOrder = order; scene.add(s); return s; };
    // one glow + hot core per live shot, reused
    this.shots = Array.from({ length: SHOTS }, () => ({ halo: sprite(haloMat, 6), core: sprite(coreMat, 9), id: null, t: 0, hist: Array.from({ length: HIST }, () => new THREE.Vector3()), n: 0, live: false }));
    this.tip = sprite(haloMat, 6); // the gathering glow at the staff head
    const quad = new THREE.PlaneGeometry(1, 1);
    this.pops = Array.from({ length: POPS }, (_, k) => {
      const flash = new THREE.Mesh(quad, flashMaterial(4 + k * 3.3)); tintFlash(flash.material, 'poison');
      const puff = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: k * 5.9 } }, vertexShader: BILLBOARD_VS,
        fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uSeed; ${NOISE}
          void main(){ float r = length(vUv);
            float n = fbm(vUv * 2.2 + uSeed + vec2(0.0, -uT * 1.2));
            float body = n * 1.15 - r * 0.9 - uT * 0.8;
            if (body < 0.04) discard;
            vec3 c = body > 0.32 ? vec3(0.9, 1.0, 0.55) : body > 0.16 ? vec3(0.56, 0.9, 0.22) : vec3(0.26, 0.6, 0.12);
            gl_FragColor = vec4(c, 0.92); }`, transparent: true, depthWrite: false }));
      for (const m of [flash, puff]) { m.visible = false; m.frustumCulled = false; scene.add(m); }
      flash.renderOrder = 8; puff.renderOrder = 7;
      return { flash, puff, t: 9, pos: new THREE.Vector3() };
    });
    this.popI = 0; this.charge = null; this.sparks = []; this.motes = [];
    this.rnd = mulberry32(57); this.t = 0;
    this.pts = Array.from({ length: HIST }, () => new THREE.Vector3()); this.sub = []; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.dir = new THREE.Vector3(); this.side = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }
  // castStart: a green glow swells at the staff head until the shot leaves
  gather(total) { this.charge = { t: 0, total: Math.max(0.1, total) }; }
  // projectiles: the rules' live projectiles; one glowing shot follows each Venom Shot
  syncProjectiles(projectiles, kind, dt) {
    for (const s of this.shots) s.live = false;
    for (const pr of projectiles) {
      if (pr.kind !== kind) continue;
      let s = null, free = null;
      for (const x of this.shots) { if (x.id === pr.id) s = x; else if (x.id === null && !free) free = x; }
      if (!s) { if (!free) continue; s = free; s.id = pr.id; s.t = 0; s.n = 0; this.charge = null; }
      s.live = true; s.t += dt;
      const y = 1.15, flick = 1 + Math.sin(s.t * 40) * 0.08;
      s.halo.visible = s.core.visible = true;
      s.halo.position.set(pr.x, y, pr.z); s.core.position.set(pr.x, y, pr.z);
      s.halo.scale.setScalar(0.55 * flick); s.core.scale.setScalar(0.2 * flick);
      for (let i = HIST - 1; i > 0; i--) s.hist[i].copy(s.hist[i - 1]);
      s.hist[0].set(pr.x, y, pr.z); s.n = Math.min(HIST, s.n + 1);
      if (this.rnd() < dt * 12) { const r = this.rnd; this.spark(pr.x, y, pr.z, (r() - 0.5) * 1.2 - pr.vx * 0.05, 0.4 + r() * 0.8, (r() - 0.5) * 1.2 - pr.vz * 0.05, 0.25 + r() * 0.2, 0.025); }
    }
    for (const s of this.shots) if (!s.live && s.id !== null) { s.id = null; s.halo.visible = s.core.visible = false; }
  }
  spark(x, y, z, vx, vy, vz, max, w) { if (this.sparks.length < 300) this.sparks.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), life: 0, max, w }); }
  // the core 'impact' event: a ragged poison flash, a puff that eats away and falling streaks
  impact(e) {
    const p = this.pops[this.popI++ % POPS], r = this.rnd;
    p.t = 0; p.pos.set(e.x, 1.15, e.z);
    for (let i = 0; i < 8; i++) {
      const a = r() * 6.283, el = r() * 0.9, s = 2 + r() * 2.5;
      this.spark(e.x, 1.15, e.z, Math.cos(a) * Math.cos(el) * s, Math.sin(el) * s + 1, Math.sin(a) * Math.cos(el) * s, 0.35 + r() * 0.3, 0.03 + r() * 0.025);
    }
  }
  // a poisoned target gives off a rising mote now and then (called each frame per poisoned dummy)
  poisoned(x, z, dt, stacks = 1) {
    if (this.motes.length < 160 && this.rnd() < dt * 3 * stacks) {
      const r = this.rnd, a = r() * 6.283;
      this.motes.push({ p: new THREE.Vector3(x + Math.cos(a) * 0.32, 0.5 + r() * 0.9, z + Math.sin(a) * 0.32), sway: r() * 6.28, life: 0, max: 0.7 + r() * 0.5, w: 0.07 + r() * 0.03 });
    }
  }
  update(dt, tip) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    // charge glow at the staff head
    const ch = this.charge;
    if (ch) {
      ch.t += dt;
      const c = Math.min(1, ch.t / ch.total);
      this.tip.visible = true; this.tip.position.copy(tip); this.tip.scale.setScalar(0.12 + 0.35 * c * (1 + Math.sin(this.t * 30) * 0.06));
      if (this.rnd() < dt * 20) { // wisps drawn in toward the nock
        const r = this.rnd, a = r() * 6.283, el = (r() - 0.3) * 1.2, rad = 0.35;
        const px = tip.x + Math.cos(a) * Math.cos(el) * rad, py = tip.y + Math.sin(el) * rad, pz = tip.z + Math.sin(a) * Math.cos(el) * rad;
        this.spark(px, py, pz, (tip.x - px) * 5, (tip.y - py) * 5, (tip.z - pz) * 5, 0.18, 0.03);
      }
      if (ch.t > ch.total + 0.3) this.charge = null;
    } else this.tip.visible = false;
    // shots: comet trail plus two thin wisps twisting around the path
    for (const s of this.shots) {
      if (s.id === null || s.n < 3) continue;
      const pts = this.pts, sub = this.sub;
      sub.length = 0;
      for (let i = 0; i < s.n; i++) { pts[i].copy(s.hist[i]); sub.push(pts[i]); }
      stripW = 0.08; this.glow.strip(sub, trailGlowW, 0.8, MID); this.core.strip(sub, trailCoreW, 1, HOT);
      this.dir.subVectors(s.hist[0], s.hist[s.n - 1]).normalize();
      this.side.crossVectors(this.dir, this.up).normalize();
      for (let k = 0; k < 1; k++) {
        sub.length = 0;
        for (let i = 0; i < s.n; i++) {
          const ph = s.t * 30 - i * 1.4 + k * Math.PI, rad = 0.07 * (i / s.n + 0.4);
          pts[i].copy(s.hist[i]).addScaledVector(this.side, Math.cos(ph) * rad); pts[i].y += Math.sin(ph) * rad;
          sub.push(pts[i]);
        }
        stripW = 0.03; this.glow.strip(sub, wispW, 0.7, DEEP); this.core.strip(sub, wispW, 0.9, MID);
      }
    }
    // impact pops
    for (const p of this.pops) {
      p.t += dt;
      const on = p.t < POP_LIFE;
      p.flash.visible = on && p.t < 0.14; p.puff.visible = on;
      if (!on) continue;
      p.flash.position.copy(p.pos); p.flash.quaternion.copy(this.camera.quaternion); p.flash.scale.setScalar(1.1 * (0.7 + p.t * 2));
      p.flash.material.uniforms.uT.value = p.t / 0.14;
      p.puff.position.copy(p.pos); p.puff.quaternion.copy(this.camera.quaternion); p.puff.scale.setScalar(0.7 + p.t * 1.8);
      p.puff.material.uniforms.uT.value = p.t / POP_LIFE;
    }
    // sparks: short streaks that fall away
    const three = this.three;
    for (const s of this.sparks) {
      s.life += dt; s.v.y -= 9 * dt; s.v.multiplyScalar(1 - 2.5 * dt); s.p.addScaledVector(s.v, dt);
      const u = s.life / s.max;
      if (u >= 1) continue;
      three[0].copy(s.p).addScaledVector(s.v, -0.035); three[1].copy(s.p).lerp(three[0], 0.5); three[2].copy(s.p);
      stripW = s.w; stripU = u;
      this.glow.strip(three, moteGlowW, 0.7 * (1 - u), MID); this.core.strip(three, moteCoreW, 1 - u * u, HOT);
    }
    compact(this.sparks, living);
    // motes rising off poisoned targets
    for (const m of this.motes) {
      m.life += dt; m.p.y += 0.7 * dt; m.p.x += Math.sin(m.sway + m.life * 7) * 0.25 * dt;
      const u = m.life / m.max;
      if (u >= 1) continue;
      three[0].copy(m.p); three[0].y -= 0.16; three[1].copy(m.p); three[1].y -= 0.08; three[2].copy(m.p);
      stripW = m.w * Math.sin(Math.PI * u); stripU = 0;
      this.glow.strip(three, moteGlowW, 0.8, MID); this.core.strip(three, moteCoreW, 1, HOT);
    }
    compact(this.motes, living);
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const s of this.shots) { s.id = null; s.halo.visible = s.core.visible = false; }
    for (const p of this.pops) { p.t = 9; p.flash.visible = p.puff.visible = false; }
    this.tip.visible = false; this.charge = null; this.sparks.length = 0; this.motes.length = 0;
  }
  get busy() { return this.sparks.length > 0 || this.motes.length > 0 || this.shots.some((s) => s.id !== null); }
}
