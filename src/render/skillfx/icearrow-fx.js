// Shatter Arrow (the spell archer's cold skill, 2026-10-31, round 2). Its own look, apart from the mage's
// frost (Frost Nova's round ground frost and crystal clusters, Blizzard's storm): it is made of an arrow.
// A crystal arrow of ice (a long six-sided needle in Frost Nova's cel ice shading) flies with a frost trail
// that sheds glints; when a monster stops it, it cracks - a white flash, a puff of cold mist, short crack
// streaks bursting forward and a spray of ice chips - and bursts into the rules' fan of shards, bigger ice
// needles that fly on with bright streaks. Every shard that strikes a monster stays stuck in it, pointing
// back along its flight, for as long as the chill lasts, then melts. Owner, round 1: the frost fan and rows
// of spikes on the ground looked odd (a diagram, not ice); nothing is drawn on the ground now but the chips.
// Cosmetic only: the arrow and shards are the rules' projectiles (kind frost_shatter_arrow, shard: true).
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, place, fxGround, NOISE, BILLBOARD_VS } from './fx-common.js';

const NEEDLES = 16, MISTS = 3, FLASHES = 4, CHIPS = 90, HIST = 7, STUCK = 24, CRACKS = 9;
const KIND = 'frost_shatter_arrow';
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0), 0.75) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// Frost Nova's cel ice, for instanced needles (edges lit through the barycentric attribute)
const ICE_VS = `attribute vec3 bary; varying vec3 vB; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){ vB = bary; vP = position;
    mat4 m = modelMatrix*instanceMatrix; vec4 w = m*vec4(position, 1.0);
    vN = normalize(mat3(m)*normal); vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix*viewMatrix*w; }`;
const ICE_FS = `varying vec3 vB; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    float ndl = dot(N, normalize(vec3(-0.35, 0.8, 0.5)));
    vec3 deep = vec3(0.16,0.40,0.70), mid = vec3(0.42,0.75,0.95), lite = vec3(0.84,0.96,1.0);
    vec3 c = mix(deep, mid, smoothstep(-0.2, 0.3, ndl));
    c = mix(c, lite, smoothstep(0.35, 0.8, ndl));
    c = mix(c, vec3(1.0), smoothstep(0.3, 0.5, vP.x) * 0.5);                 // the point runs white
    float e = min(min(vB.x, vB.y), vB.z);
    c = mix(c, vec3(0.93,0.99,1.0), (1.0 - smoothstep(0.0, 0.08, e)) * 0.55);  // bright facet edges
    float rim = 1.0 - max(dot(N, normalize(vV)), 0.0);
    c = mix(c, vec3(0.9,0.98,1.0), smoothstep(0.5, 0.95, rim) * 0.6);
    gl_FragColor = vec4(c, 0.92); }`;
// a puff of cold mist at the crack (a billboard: fbm cut by its own fading)
const MIST_FS = `varying vec2 vUv; uniform float uT; uniform float uSeed;` + NOISE + `
  void main(){ float r = length(vUv);
    float n = fbm(vUv*2.0 + uSeed + vec2(uT*0.6, -uT*0.9));
    float body = n*1.2 - r*0.95 - uT*0.8;
    if (body < 0.04) discard;
    vec3 c = body > 0.3 ? vec3(0.97, 1.0, 1.0) : vec3(0.74, 0.9, 0.99);
    gl_FragColor = vec4(c, body > 0.3 ? 0.85 : 0.5); }`;

/** A long six-sided needle of ice along +x (from -0.5 to 0.5, widest a little behind the point), with a
 *  barycentric attribute for its bright facet edges. */
function needleGeometry() {
  const n = 6, R = 0.07, waist = 0.18, pos = [], bar = [];
  const ring = (x, r, rot) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 6.283 + rot; return [x, Math.cos(a) * r, Math.sin(a) * r]; });
  const back = [-0.5, 0, 0], front = [0.5, 0, 0], mid = ring(waist, R, 0), tail = ring(-0.3, R * 0.55, 0.5);
  const tri = (a, b, c) => { pos.push(...a, ...b, ...c); bar.push(1, 0, 0, 0, 1, 0, 0, 0, 1); };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(front, mid[i], mid[j]); tri(mid[i], tail[i], mid[j]); tri(mid[j], tail[i], tail[j]); tri(tail[i], back, tail[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('bary', new THREE.Float32BufferAttribute(bar, 3));
  g.computeVertexNormals();
  return g;
}

let sw = 0, swu = 0;
const trailGlowW = (x) => sw * (0.4 + 2.2 * x * x), trailCoreW = (x) => sw * (0.15 + 0.85 * x * x);
const glintW = (x) => sw * Math.sin(Math.PI * x), glintGlowW = () => sw * 2.2;
const X = new THREE.Vector3(1, 0, 0);
const ICE_EDGE = [0.72, 0.93, 1.0], ICE_GLOW = [0.35, 0.7, 0.95], WHITE = [0.95, 1.0, 1.0];

export class IceArrowFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 1600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1600, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.needles = new THREE.InstancedMesh(needleGeometry(), new THREE.ShaderMaterial({ vertexShader: ICE_VS, fragmentShader: ICE_FS, transparent: true }), NEEDLES);
    this.needles.frustumCulled = false; this.needles.renderOrder = 6; this.needles.count = 0; scene.add(this.needles);
    // shards stuck in what they struck (the same ice needles)
    this.stuck = new THREE.InstancedMesh(this.needles.geometry, this.needles.material, STUCK);
    this.stuck.frustumCulled = false; this.stuck.renderOrder = 6; this.stuck.count = 0; scene.add(this.stuck);
    this.stuckList = Array.from({ length: STUCK }, () => ({ t: 9, life: 3, id: 0, ox: 0, oy: 0, oz: 0, s: 1, q: new THREE.Quaternion() })); this.stuckI = 0;
    this.locate = null; // set by the director: id -> {x, y, z} of a monster's centre, or null
    this.cracks = Array.from({ length: CRACKS }, () => ({ t: 9, a: new THREE.Vector3(), d: new THREE.Vector3(), len: 1 }));
    const chipGeo = new THREE.TetrahedronGeometry(0.07);
    this.chips = new THREE.InstancedMesh(chipGeo, new THREE.MeshToonMaterial({ color: '#d8f3ff', emissive: '#25506f' }), CHIPS);
    this.chips.frustumCulled = false; this.chips.count = 0; scene.add(this.chips);
    this.chipList = Array.from({ length: CHIPS }, () => ({ t: 9, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: 0, s: 1 })); this.chipI = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.flashes = Array.from({ length: FLASHES }, (_, k) => {
      const m = new THREE.Mesh(quad, flashMaterial(11 + k * 2.9)); tintFlash(m.material, 'cold');
      m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m);
      return { m, t: 9, size: 1 };
    });
    this.flashI = 0;
    this.mists = Array.from({ length: MISTS }, (_, k) => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: k * 5.1 } }, vertexShader: BILLBOARD_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 8; m.frustumCulled = false; scene.add(m);
      return { m, t: 9 };
    });
    this.mistI = 0;
    // flying needles by projectile id: a short position history for the trail
    this.live = new Map(); this.pool = Array.from({ length: NEEDLES + 4 }, () => ({ id: 0, shard: false, hist: Array.from({ length: HIST }, () => new THREE.Vector3()), n: 0, dir: new THREE.Vector3(), pos: new THREE.Vector3(), seen: false, fade: 0, glintAt: 0 }));
    this.dying = [];
    this.glints = []; this.glintFree = Array.from({ length: 64 }, () => ({ p: new THREE.Vector3(), t: 0, life: 1, s: 0.1 })); this.trail = [];
    this.rnd = mulberry32(73); this.t = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s3 = new THREE.Vector3(); this.p = new THREE.Vector3();
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  flash(x, y, z, size) { const f = this.flashes[this.flashI++ % FLASHES]; f.t = 0; f.size = size; place(f.m, x, y, z); }
  chipBurst(x, y, z, n, dx, dz, speed = 3) {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const c = this.chipList[this.chipI++ % CHIPS], a = r() * 6.283;
      c.t = 0; c.life = 0.35 + r() * 0.3; c.s = 0.6 + r() * 0.8; c.spin = (r() - 0.5) * 20;
      c.p.set(x, y, z); c.v.set(Math.cos(a) * speed * r() + dx * speed, 1.2 + r() * 2.4, Math.sin(a) * speed * r() + dz * speed);
    }
  }
  // the rules' 'shatter': the arrow cracks at (x, z) and its shards fan out along `angle` over `arc` degrees
  shatter(e) {
    const dx = Math.sin(e.angle), dz = Math.cos(e.angle), r = this.rnd;
    this.flash(e.x, 1.05, e.z, 2.4);
    this.chipBurst(e.x, 1.05, e.z, 20, dx, dz, 4);
    const m = this.mists[this.mistI++ % MISTS]; m.t = 0; m.m.visible = true; place(m.m, e.x + dx * 0.3, 1.0, e.z + dz * 0.3);
    // crack streaks: short white lines bursting out forward from the crack, a little wider than the fan
    const half = ((e.arc || 70) * Math.PI) / 360 * 1.4;
    for (const c of this.cracks) {
      const a = e.angle + (r() * 2 - 1) * half, up = (r() - 0.3) * 0.6;
      c.t = 0; c.len = 0.6 + r() * 0.7; c.a.set(e.x, 1.05, e.z); c.d.set(Math.sin(a), up, Math.cos(a)).normalize();
    }
    for (let i = 0; i < 10; i++) this.glint(e.x + dx * r(), 0.9 + r() * 0.5, e.z + dz * r(), 0.6);
  }
  // a struck target (id, its centre c, struck from dx, dz): ice chips off it, a cold glint, and the needle
  // stays stuck in it, pointing back the way it came, for `life` s (the chill)
  hit(id, c, dx, dz, life) {
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, r = this.rnd;
    this.chipBurst(c.x, c.y, c.z, 7, ux, uz, 2.2);
    this.glint(c.x, c.y + 0.2, c.z, 0.7);
    const s = this.stuckList[this.stuckI++ % STUCK];
    s.t = 0; s.life = life; s.id = id; s.s = 1.1 + r() * 0.3;
    // embedded a little way into the near side, at a slightly random height and slant
    s.ox = -ux * 0.28 + (r() - 0.5) * 0.15; s.oy = (r() - 0.4) * 0.35; s.oz = -uz * 0.28 + (r() - 0.5) * 0.15;
    this.p.set(ux, -0.25 - r() * 0.2, uz).normalize();
    s.q.setFromUnitVectors(X, this.p);
  }
  glint(x, y, z, life) {
    const g = this.glintFree.pop(); if (!g) return;
    const r = this.rnd;
    g.p.set(x + (r() - 0.5) * 0.3, y, z + (r() - 0.5) * 0.3); g.t = 0; g.life = life * (0.6 + r() * 0.6); g.s = 0.08 + r() * 0.06;
    this.glints.push(g);
  }
  // each frame: the rules' projectiles of this skill (arrow and shards)
  sync(projectiles) {
    for (const rec of this.live.values()) rec.seen = false;
    for (const pr of projectiles) {
      if (pr.kind !== KIND) continue;
      let rec = this.live.get(pr.id);
      if (!rec) {
        rec = this.pool.find((q) => !q.id) || null; if (!rec) continue;
        rec.id = pr.id; rec.shard = !!pr.shard; rec.n = 0; rec.fade = 0; rec.glintAt = 0; this.live.set(pr.id, rec);
      }
      rec.seen = true;
      rec.pos.set(pr.x, pr.y ?? 1.05, pr.z);
      const sp = Math.hypot(pr.vx, pr.vz) || 1; rec.dir.set(pr.vx / sp, 0, pr.vz / sp);
    }
    for (const [id, rec] of this.live) if (!rec.seen) { this.live.delete(id); rec.fade = 0.0001; this.dying.push(rec); }
  }
  update(dt) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    const two = this.two, three = this.three;
    let k = 0;
    const draw = (rec, alpha) => {
      // keep a short history for the trail
      const h = rec.hist;
      if (alpha >= 1) { for (let i = HIST - 1; i > 0; i--) h[i].copy(h[i - 1]); h[0].copy(rec.pos); rec.n = Math.min(HIST, rec.n + 1); }
      const len = rec.shard ? 0.85 : 1.45, thick = rec.shard ? 1.7 : 2.0;
      if (alpha >= 1 && k < NEEDLES) {
        this.q.setFromUnitVectors(X, rec.dir); this.s3.set(len, thick, thick);
        this.p.copy(rec.pos); this.p.y += fxGround.y(this.p.x, this.p.z);
        this.m4.compose(this.p, this.q, this.s3); this.needles.setMatrixAt(k++, this.m4);
      }
      if (rec.n >= 2) {
        const pts = this.trail; pts.length = rec.n;
        for (let i = 0; i < rec.n; i++) pts[i] = h[rec.n - 1 - i];
        sw = rec.shard ? 0.12 : 0.12; this.glow.strip(pts, trailGlowW, (rec.shard ? 0.9 : 0.7) * alpha, ICE_GLOW);
        sw = rec.shard ? 0.04 : 0.04; this.core.strip(pts, trailCoreW, 0.95 * alpha, ICE_EDGE);
      }
      // glints shed along the way
      rec.glintAt -= dt;
      if (alpha >= 1 && rec.glintAt <= 0) { rec.glintAt = rec.shard ? 0.06 : 0.035; this.glint(rec.pos.x - rec.dir.x * 0.4, rec.pos.y, rec.pos.z - rec.dir.z * 0.4, 0.35); }
    };
    for (const rec of this.live.values()) draw(rec, 1);
    // a needle that ended: its trail thins away (a shard flying out its range breaks into a puff of chips)
    let w = 0;
    for (const rec of this.dying) {
      if (rec.fade === 0.0001 && rec.shard) this.chipBurst(rec.pos.x, rec.pos.y, rec.pos.z, 3, rec.dir.x, rec.dir.z, 1.2);
      rec.fade += dt;
      const a = 1 - rec.fade / 0.18;
      if (a <= 0) { rec.id = 0; continue; }
      draw(rec, a); this.dying[w++] = rec;
    }
    this.dying.length = w;
    this.needles.count = k; this.needles.instanceMatrix.needsUpdate = true;
    // glints: four-point twinkles drifting down
    let gw = 0;
    for (const g of this.glints) {
      g.t += dt; const u = g.t / g.life; if (u >= 1) { this.glintFree.push(g); continue; }
      g.p.y -= dt * 0.3;
      const s = g.s * Math.sin(Math.PI * u);
      two[0].set(g.p.x - s, g.p.y, g.p.z); two[1].set(g.p.x + s, g.p.y, g.p.z);
      sw = s * 0.45; this.core.strip(two, glintW, 1, WHITE);
      two[0].set(g.p.x, g.p.y - s, g.p.z); two[1].set(g.p.x, g.p.y + s, g.p.z);
      this.core.strip(two, glintW, 1, WHITE);
      this.glints[gw++] = g;
    }
    this.glints.length = gw;
    // chips: fall, tumble, shrink away
    let c = 0;
    for (const ch of this.chipList) {
      if (ch.t >= ch.life) continue;
      ch.t += dt; ch.v.y -= 14 * dt; ch.p.addScaledVector(ch.v, dt);
      if (ch.p.y < 0.04) { ch.p.y = 0.04; ch.v.multiplyScalar(0.4); ch.v.y = Math.abs(ch.v.y) * 0.3; }
      const k2 = 1 - ch.t / ch.life;
      this.q.setFromAxisAngle(X, ch.t * ch.spin); this.s3.setScalar(ch.s * k2);
      this.p.copy(ch.p); this.p.y += fxGround.y(ch.p.x, ch.p.z);
      this.m4.compose(this.p, this.q, this.s3); this.chips.setMatrixAt(c++, this.m4);
    }
    this.chips.count = c; this.chips.instanceMatrix.needsUpdate = true;
    // stuck shards: follow their monster, melt (shrink) over their last 0.4 s, gone if it is
    let st = 0;
    for (const s of this.stuckList) {
      if (s.t >= s.life) continue;
      s.t += dt;
      const c = this.locate?.(s.id);
      if (!c) { s.t = s.life; continue; }
      const k3 = s.s * Math.min(1, s.t / 0.05) * Math.min(1, (s.life - s.t) / 0.4);
      if (k3 <= 0) continue;
      this.s3.set(0.75 * k3, 1.8 * k3, 1.8 * k3);
      this.p.set(c.x + s.ox, c.y + s.oy + fxGround.y(c.x, c.z), c.z + s.oz);
      this.m4.compose(this.p, s.q, this.s3); this.stuck.setMatrixAt(st++, this.m4);
    }
    this.stuck.count = st; this.stuck.instanceMatrix.needsUpdate = true;
    // crack streaks: shoot out and thin away in 0.18 s
    for (const c of this.cracks) {
      if (c.t >= 0.18) continue;
      c.t += dt; const u = Math.min(1, c.t / 0.18);
      two[0].copy(c.a).addScaledVector(c.d, c.len * (0.15 + 0.55 * u)); two[1].copy(c.a).addScaledVector(c.d, c.len * (0.35 + 0.65 * u));
      sw = 0.05 * (1 - u); this.glow.strip(two, glintGlowW, 0.8, ICE_GLOW); this.core.strip(two, glintW, 1, WHITE);
    }
    for (const m of this.mists) {
      if (!m.m.visible) continue;
      m.t += dt; const u = m.t / 0.55;
      if (u >= 1) { m.m.visible = false; continue; }
      m.m.quaternion.copy(this.camera.quaternion); m.m.scale.setScalar(1.0 + u * 1.2); m.m.material.uniforms.uT.value = u;
    }
    for (const f of this.flashes) {
      f.t += dt; const u = f.t / 0.22;
      f.m.visible = u < 1; if (!f.m.visible) continue;
      f.m.quaternion.copy(this.camera.quaternion); f.m.scale.setScalar(f.size * (0.6 + u * 0.7)); f.m.material.uniforms.uT.value = u;
    }
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const rec of this.pool) rec.id = 0;
    this.live.clear(); this.dying.length = 0; for (const g of this.glints) this.glintFree.push(g); this.glints.length = 0;
    for (const ch of this.chipList) ch.t = 9;
    for (const s of this.stuckList) s.t = 9; this.stuck.count = 0; for (const c of this.cracks) c.t = 9;
    this.needles.count = 0; this.chips.count = 0;
    for (const f of this.flashes) { f.t = 9; f.m.visible = false; }
    for (const m of this.mists) m.m.visible = false;
  }
  get busy() { return this.live.size > 0 || this.dying.length > 0 || this.stuckList.some((s) => s.t < s.life); }
}
