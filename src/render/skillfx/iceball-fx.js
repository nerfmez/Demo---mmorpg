// Ice Ball (บอลน้ำแข็ง): a basic cold spell, a main skill beside Firebolt (owner, 2026-10-31). Held to the
// owner's bar (Firebolt's nested see-through layers) with the pixelfx rules (translucent volumes lit from
// within, lines and light, many small events, fast in and slow out). Never pictures.
//   the cast: frost motes spiral in to the staff head and a cold star blooms there;
//   the ball: a faceted crystal heart of see-through ice inside a frost shell whose noise streams back
//     along the flight, a soft cold glow round it, three small shards circling it, a misty trail of light
//     behind with snow sparkles left twinkling along the path;
//   the impact (the rules' 'impact', a hit or the end of its range): the ball shatters - shards flung
//     out and falling, a ring of frost light racing out over the ground, a cold glint and a puff of mist.
// Cosmetic only; pooled, no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE, BILLBOARD_VS, addLight, fxGround, place } from './fx-common.js';
import { crystalGeo } from './frost-fx.js';
import { lightSprite, starTexture, glowTexture } from './light-kit.js';

const BALLS = 6, HIST = 10, SHARDS = 72, ORBIT = 3, SPARKLES = 48, RINGS = 4, MISTS = 6, MOTES = 8;
const ICE = [0.55, 0.85, 1.0], GLOW = [0.35, 0.7, 1.0], WHITE = [1, 1, 1];

// the crystal heart: see-through ice, lit from within (facing the camera: a pale glow; at the rim: solid
// and bright), cel-stepped light from one side
const HEART_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){ vP = position; vec4 w = modelMatrix*vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`;
const HEART_FS = `varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vec3 N = normalize(vN); float ndl = dot(N, normalize(vec3(-0.35, 0.8, 0.5)));
    float face = max(dot(N, normalize(vV)), 0.0), rim = 1.0 - face;
    vec3 c = vec3(0.12, 0.42, 0.85)*(0.8 + 0.3*step(0.1, ndl) + 0.25*step(0.6, ndl));
    c += vec3(0.55, 0.88, 1.0)*face*face*0.7;
    c = mix(c, vec3(0.95, 1.0, 1.0), smoothstep(0.55, 0.95, rim)*0.8);
    gl_FragColor = vec4(c, mix(0.6, 0.97, smoothstep(0.2, 0.8, rim))); }`;
// the frost shell: a see-through sphere whose noise streams back along the flight (object -x is back),
// lit only where the noise is high and at the rim: lines of frost light, not a fill
const SHELL_VS = `varying vec3 vO; varying vec3 vN; varying vec3 vV;
  void main(){ vO = position; vec4 w = modelMatrix*vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`;
const SHELL_FS = `varying vec3 vO; varying vec3 vN; varying vec3 vV; uniform float uTime, uSeed, uA;` + NOISE + `
  void main(){
    float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float ang = atan(vO.z, vO.y);
    vec2 q = vec2(vO.x*2.2 + uTime*3.0, ang*1.2 + uSeed);
    float n = fbm(q + vec2(0.0, fbm(q*0.7 + uTime*0.4)));
    float streak = smoothstep(0.52, 0.62, n)*(1.0 - smoothstep(0.62, 0.78, n));
    float back = smoothstep(0.6, -0.9, vO.x);                    // the streams thicken toward the back
    float a = (streak*(0.5 + 0.6*back) + smoothstep(0.55, 1.0, rim)*0.55)*uA;
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(vec3(0.55, 0.85, 1.0), vec3(1.0), streak*0.6), a); }`;
const SHARD_VS = `attribute vec3 bary; varying vec3 vB; varying vec3 vN; varying vec3 vV;
  void main(){ vB = bary; mat4 m = modelMatrix*instanceMatrix; vec4 w = m*vec4(position, 1.0);
    vN = normalize(mat3(m)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`;
const SHARD_FS = `varying vec3 vB; varying vec3 vN; varying vec3 vV;
  void main(){ vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    float ndl = dot(N, normalize(vec3(-0.35, 0.8, 0.5))), rim = 1.0 - max(dot(N, normalize(vV)), 0.0);
    vec3 c = mix(vec3(0.16, 0.45, 0.85), vec3(0.75, 0.95, 1.0), smoothstep(0.0, 0.6, ndl));
    float e = min(min(vB.x, vB.y), vB.z);
    c = mix(c, vec3(0.95, 1.0, 1.0), max((1.0 - smoothstep(0.0, 0.07, e))*0.7, smoothstep(0.55, 0.95, rim)*0.7));
    gl_FragColor = vec4(c, 0.92); }`;
// the frost ring on the ground (additive): a thin bright ring with a soft inner glow and frost ticks
const RING_FS = `varying vec2 vUv; uniform float uK, uSeed;` + NOISE + `
  void main(){ vec2 p = vUv*2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
    float R = 0.25 + 0.7*sqrt(uK), fade = 1.0 - uK;
    float ring = exp(-pow((r - R)/0.025, 2.0));
    float ticks = smoothstep(0.7, 0.9, fbm(vec2(a*4.0 + uSeed, 1.0)))*smoothstep(R, R - 0.25, r)*step(0.0, R - r);
    float glow = exp(-r*r*6.0)*0.4*(1.0 - uK);
    float k = (ring + ticks*0.6 + glow)*fade;
    if (k < 0.01) discard;
    gl_FragColor = vec4(vec3(0.5, 0.82, 1.0)*k + vec3(0.4)*ring*fade, 1.0); }`;
const MIST_FS = `varying vec2 vUv; uniform float uT; uniform float uSeed;` + NOISE + `
  void main(){ float r = length(vUv);
    float n = fbm(vUv*2.0 + uSeed + vec2(uT*0.6, -uT*0.9));
    float body = n*1.2 - r*0.95 - uT*0.8;
    if (body < 0.04) discard;
    gl_FragColor = vec4(body > 0.3 ? vec3(0.97, 1.0, 1.0) : vec3(0.74, 0.9, 0.99), body > 0.3 ? 0.7 : 0.4); }`;
const TRAIL_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d = abs(vUv.y); float a = pow(1.0 - d, 2.0)*0.55; gl_FragColor = vec4(vT*a*vA, 1.0); }`;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d = abs(vUv.y); if (d > 0.9) discard; vec3 c = d < 0.45 ? mix(vT, vec3(1.0), 0.8) : vT; gl_FragColor = vec4(c, vA); }`;

let sw = 0;
const trailW = (x) => sw * (0.15 + 0.85 * x * x), coreW = (x) => sw * 0.3 * x * x, moteW = (x) => sw * Math.sin(Math.PI * x);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class IceBallFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(61); this.t = 0;
    const heartGeo = new THREE.IcosahedronGeometry(0.26, 0), shellGeo = new THREE.SphereGeometry(0.46, 24, 16);
    const heartMat = new THREE.ShaderMaterial({ vertexShader: HEART_VS, fragmentShader: HEART_FS, transparent: true, depthWrite: false });
    this.balls = Array.from({ length: BALLS }, () => {
      const g = new THREE.Group(); g.visible = false; scene.add(g);
      const heart = new THREE.Mesh(heartGeo, heartMat); heart.renderOrder = 8; g.add(heart);
      const shell = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uSeed: { value: 0 }, uA: { value: 1 } }, vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      shell.renderOrder = 9; g.add(shell);
      const glow = lightSprite(scene, glowTexture('cold'), true, 7);
      return { id: 0, g, heart, shell, glow, pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), hist: Array.from({ length: HIST }, () => new THREE.Vector3()), n: 0, fade: 0, seen: false, spin: 0, dropT: 0 };
    });
    this.live = new Map(); this.dying = [];
    const sg = crystalGeo(113);
    this.shardMesh = new THREE.InstancedMesh(sg, new THREE.ShaderMaterial({ vertexShader: SHARD_VS, fragmentShader: SHARD_FS, transparent: true }), SHARDS);
    this.shardMesh.frustumCulled = false; this.shardMesh.renderOrder = 8; for (let i = 0; i < SHARDS; i++) this.shardMesh.setMatrixAt(i, ZERO); scene.add(this.shardMesh);
    this.shards = Array.from({ length: SHARDS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(), t: 9, life: 0.6, size: 0.08, orbit: -1 }));
    this.shardI = ORBIT * BALLS; // the first slots are the circling shards (ball i owns i*ORBIT..)
    this.trail = new Ribbon(scene, camera, 400, TRAIL_FS, THREE.AdditiveBlending);
    this.core = new Ribbon(scene, camera, 400, CORE_FS, THREE.NormalBlending);
    this.trail.mesh.renderOrder = 6; this.core.mesh.renderOrder = 7;
    this.sparkles = Array.from({ length: SPARKLES }, () => ({ s: lightSprite(scene, starTexture('cold'), false, 10), p: new THREE.Vector3(), t: 9, life: 0.6, size: 0.12 })); this.sparkI = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.rings = Array.from({ length: RINGS }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 }, uSeed: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m); return { m, t: 9 }; }); this.ringI = 0;
    this.mists = Array.from({ length: MISTS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), t: 9, size: 1 }; }); this.mistI = 0;
    this.glints = Array.from({ length: 4 }, () => ({ s: lightSprite(scene, starTexture('cold'), false, 11), p: new THREE.Vector3(), t: 9 })); this.glintI = 0;
    this.tipStar = lightSprite(scene, starTexture('cold'), false, 10);
    this.motes = Array.from({ length: MOTES }, () => ({ a: 0, r: 0, h: 0 })); this.pts = Array.from({ length: 5 }, () => new THREE.Vector3());
    this.lights = Array.from({ length: 2 }, () => ({ l: addLight(scene, new THREE.PointLight('#9fd8ff', 0, 7, 1.6)), t: 9 })); this.lightI = 0;
    this.charge = null;
  }
  /** castStart: frost motes spiral in to the staff head; the ball looses `total` s from now. */
  gather(total) { this.charge = { t: 0, total }; const r = this.rnd; for (const m of this.motes) { m.a = r() * 6.283; m.r = 0.5 + r() * 0.4; m.h = (r() - 0.5) * 0.6; } }
  /** Follows the rules' projectiles of kind ice_ball. */
  sync(projectiles) {
    for (const rec of this.live.values()) rec.seen = false;
    for (const pr of projectiles) {
      if (pr.kind !== 'ice_ball') continue;
      let rec = this.live.get(pr.id);
      if (!rec) {
        rec = this.balls.find((q) => !q.id && q.fade <= 0) || null; if (!rec) continue;
        rec.id = pr.id; rec.n = 0; rec.fade = 0; rec.spin = this.rnd() * 6; rec.dropT = 0; rec.shell.material.uniforms.uSeed.value = this.rnd() * 30; this.live.set(pr.id, rec);
        this.charge = null;
      }
      rec.seen = true; rec.pos.set(pr.x, pr.y ?? 1.05, pr.z);
      const sp = Math.hypot(pr.vx, pr.vz) || 1; rec.dir.set(pr.vx / sp, 0, pr.vz / sp);
    }
    for (const [id, rec] of this.live) if (!rec.seen) { this.live.delete(id); rec.id = 0; rec.fade = 0.18; this.dying.push(rec); }
  }
  /** The rules' 'impact' of an ice ball (a hit or the end of its range): it shatters. */
  impact(x, z, vx = 0, vz = 0) {
    const r = this.rnd, sp = Math.hypot(vx, vz) || 1, dx = vx / sp, dz = vz / sp;
    for (let i = 0; i < 12; i++) {
      const s = this.shards[this.shardI]; this.shardI = this.shardI + 1 >= SHARDS ? ORBIT * BALLS : this.shardI + 1;
      const a = r() * 6.283, v = 1.5 + r() * 3;
      s.p.set(x, 1.0 + (r() - 0.5) * 0.3, z); s.v.set(Math.cos(a) * v + dx * 2, 1.5 + r() * 3, Math.sin(a) * v + dz * 2);
      s.spin.set(r() * 14 - 7, r() * 14 - 7, r() * 14 - 7); s.rot.set(r() * 6, r() * 6, r() * 6); s.t = 0; s.life = 0.55 + r() * 0.35; s.size = 0.06 + r() * 0.07; s.orbit = -1;
    }
    const ring = this.rings[this.ringI++ % RINGS]; ring.t = 0; place(ring.m, x, 0.04, z); ring.m.scale.setScalar(2.6); ring.m.material.uniforms.uSeed.value = r() * 30; ring.m.visible = true;
    const g = this.glints[this.glintI++ % 4]; g.p.set(x, 1.05, z); g.t = 0;
    for (let i = 0; i < 2; i++) { const m = this.mists[this.mistI++ % MISTS]; m.p.set(x + (r() - 0.5) * 0.4, 0.8, z + (r() - 0.5) * 0.4); m.t = -i * 0.06; m.size = 0.9 + r() * 0.4; m.m.material.uniforms.uSeed.value = r() * 40; }
    for (let i = 0; i < 5; i++) this.sparkle(x + (r() - 0.5) * 1.2, 0.5 + r() * 0.9, z + (r() - 0.5) * 1.2, 0.5 + r() * 0.4, 0.14);
    const l = this.lights[this.lightI++ % 2]; l.t = 0; place(l.l, x, 1.2, z);
  }
  sparkle(x, y, z, life, size) { const q = this.sparkles[this.sparkI++ % SPARKLES]; q.p.set(x, y, z); q.t = 0; q.life = life; q.size = size; }

  update(dt, tip) {
    this.t += dt; const r = this.rnd, cam = this.camera.quaternion;
    this.trail.begin(); this.core.begin();
    // the cast: motes spiral in to the staff head, a cold star blooms there
    const c = this.charge;
    this.tipStar.visible = !!(c && tip);
    if (c && tip) {
      c.t += dt; const k = Math.min(1, c.t / Math.max(0.05, c.total));
      for (const m of this.motes) {
        for (let j = 0; j < 5; j++) { const kk = Math.max(0, k - j * 0.05), rr = m.r * (1 - kk), a = m.a + kk * 5; this.pts[j].set(tip.x + Math.cos(a) * rr, tip.y + m.h * (1 - kk), tip.z + Math.sin(a) * rr); }
        sw = 0.05; this.core.strip(this.pts, moteW, 0.9 * Math.min(1, k * 3), ICE);
      }
      place(this.tipStar, tip.x, tip.y, tip.z); this.tipStar.scale.setScalar(0.2 + 0.5 * k); this.tipStar.material.rotation = this.t * 3;
      if (c.t > c.total + 0.25) this.charge = null;
    }
    // the balls
    const draw = (rec, alpha) => {
      const h = rec.hist;
      if (alpha >= 1) { for (let i = HIST - 1; i > 0; i--) h[i].copy(h[i - 1]); h[0].copy(rec.pos); rec.n = Math.min(HIST, rec.n + 1); }
      const lift = fxGround.y(rec.pos.x, rec.pos.z);
      rec.g.visible = alpha > 0.01; rec.g.position.set(rec.pos.x, rec.pos.y + lift, rec.pos.z);
      _q.setFromUnitVectors(X, rec.dir); rec.g.quaternion.copy(_q); rec.g.scale.setScalar(alpha < 1 ? 1 + (1 - alpha) * 0.6 : 1);
      rec.spin += dt * 4; rec.heart.rotation.set(rec.spin, rec.spin * 0.7, 0); rec.heart.visible = alpha >= 1; // it shatters at once; the shell fades
      rec.shell.material.uniforms.uTime.value = this.t; rec.shell.material.uniforms.uA.value = alpha;
      rec.glow.visible = rec.g.visible; place(rec.glow, rec.pos.x, rec.pos.y, rec.pos.z); rec.glow.scale.setScalar(1.7); rec.glow.material.opacity = 0.75 * alpha;
      // the trail: a misty band of light with a bright thread
      if (rec.n >= 3) {
        for (let i = 0; i < rec.n; i++) this.trailPts[i] = h[rec.n - 1 - i];
        this.trailPts.length = rec.n;
        sw = 0.85; this.trail.strip(this.trailPts, trailW, 0.9 * alpha, GLOW);   // a misty band of cold light
        sw = 0.5; this.core.strip(this.trailPts, coreW, alpha, ICE);
      }
      // snow sparkles left along the path
      if (alpha >= 1 && (rec.dropT -= dt) <= 0) { rec.dropT = 0.035; this.sparkle(rec.pos.x - rec.dir.x * 0.3 + (r() - 0.5) * 0.3, rec.pos.y + (r() - 0.5) * 0.3, rec.pos.z - rec.dir.z * 0.3 + (r() - 0.5) * 0.3, 0.35 + r() * 0.3, 0.09 + r() * 0.06); }
    };
    if (!this.trailPts) this.trailPts = [];
    let bi = 0;
    for (const rec of this.balls) {
      const slot = this.balls.indexOf(rec);
      if (rec.id) { draw(rec, 1); bi++; }
      else if (rec.fade > 0) { rec.fade -= dt; draw(rec, Math.max(0, rec.fade / 0.18)); if (rec.fade <= 0) { rec.g.visible = false; rec.glow.visible = false; } }
      else { rec.g.visible = false; rec.glow.visible = false; }
      // its circling shards
      for (let j = 0; j < ORBIT; j++) {
        const i = slot * ORBIT + j;
        if (!rec.id) { this.shardMesh.setMatrixAt(i, ZERO); continue; }
        const a = this.t * 7 + (j / ORBIT) * 6.283, rr = 0.55;
        _p.set(rec.pos.x + Math.cos(a) * rr * rec.dir.z * -1, rec.pos.y + Math.sin(a) * rr + fxGround.y(rec.pos.x, rec.pos.z), rec.pos.z + Math.cos(a) * rr * rec.dir.x);
        _e.set(a, this.t * 5, 0); _q.setFromEuler(_e); _m.compose(_p, _q, _s.set(0.045, 0.14, 0.045)); this.shardMesh.setMatrixAt(i, _m);
      }
    }
    this.dying.length = 0;
    // flung shards
    for (let i = ORBIT * BALLS; i < SHARDS; i++) {
      const s = this.shards[i];
      if (s.t >= s.life) { this.shardMesh.setMatrixAt(i, ZERO); continue; }
      s.t += dt; s.v.y -= 11 * dt; s.p.addScaledVector(s.v, dt); if (s.p.y < 0.03) { s.p.y = 0.03; s.v.multiplyScalar(0.35); s.v.y = Math.abs(s.v.y) * 0.3; }
      s.rot.x += s.spin.x * dt; s.rot.y += s.spin.y * dt; s.rot.z += s.spin.z * dt; _q.setFromEuler(s.rot);
      const sz = s.size * Math.min(1, 2.5 * (1 - s.t / s.life));
      _p.set(s.p.x, s.p.y + fxGround.y(s.p.x, s.p.z), s.p.z); _m.compose(_p, _q, _s.set(sz * 0.45, sz * 2.4, sz * 0.45)); this.shardMesh.setMatrixAt(i, _m);
    }
    this.shardMesh.instanceMatrix.needsUpdate = true;
    // sparkles: pop and twinkle out
    for (const q of this.sparkles) {
      if (q.t >= q.life) { q.s.visible = false; continue; }
      q.t += dt; const u = q.t / q.life; q.s.visible = true;
      place(q.s, q.p.x, q.p.y - 0.15 * u, q.p.z); q.s.scale.setScalar(q.size * (u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8) * (0.8 + 0.2 * Math.sin(q.t * 40))); q.s.material.rotation = u * 2;
    }
    for (const g of this.glints) {
      if (g.t >= 0.3) { g.s.visible = false; continue; }
      g.t += dt; const u = g.t / 0.3; g.s.visible = true; place(g.s, g.p.x, g.p.y, g.p.z); g.s.scale.setScalar(0.9 * (u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8)); g.s.material.rotation = u;
    }
    for (const q of this.rings) { if (q.t >= 0.55) { q.m.visible = false; continue; } q.t += dt; q.m.material.uniforms.uK.value = Math.min(1, q.t / 0.55); }
    for (const q of this.mists) {
      if (q.t >= 1.1) { q.m.visible = false; continue; }
      q.t += dt; q.m.visible = q.t > 0; if (!q.m.visible) continue;
      const k = q.t / 1.1; q.m.material.uniforms.uT.value = k; place(q.m, q.p.x, q.p.y + 0.3 * k, q.p.z); q.m.quaternion.copy(cam); q.m.scale.setScalar(q.size * (1 + 0.5 * k));
    }
    for (const l of this.lights) { if (l.t >= 0.4) { l.l.intensity = 0; continue; } l.t += dt; l.l.intensity = 4 * (1 - l.t / 0.4); }
    this.trail.end(); this.core.end();
  }
  clear() {
    this.live.clear(); this.charge = null; this.tipStar.visible = false;
    for (const b of this.balls) { b.id = 0; b.fade = 0; b.g.visible = false; b.glow.visible = false; }
    for (const s of this.shards) s.t = 9; for (const q of this.sparkles) { q.t = 9; q.s.visible = false; }
    for (const q of this.rings) { q.t = 9; q.m.visible = false; } for (const q of this.mists) { q.t = 9; q.m.visible = false; } for (const g of this.glints) { g.t = 9; g.s.visible = false; }
    for (const l of this.lights) { l.t = 9; l.l.intensity = 0; }
    this.trail.begin(); this.trail.end(); this.core.begin(); this.core.end();
  }
}
