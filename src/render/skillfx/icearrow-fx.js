// Shatter Arrow (the spell archer's cold skill, 2026-10-31). Its own look, apart from the mage's frost
// (Frost Nova's round scalloped ground frost and crystal clusters, Blizzard's storm): it is made of an
// arrow. A crystal arrow of ice (a long six-sided needle in Frost Nova's cel ice shading) flies with a
// thin frost trail that sheds glints; when a monster stops it, it cracks with a white flash and bursts
// forward into the rules' fan of shards - small ice needles that fly on, each with its own streak - over a
// fan of frost that races along the ground behind them (frost lines along the shard paths, only in the
// fan's true arc and reach) and then melts. A struck target sprays ice chips. Cosmetic only: the arrow and
// shards are the rules' projectiles (kind frost_shatter_arrow, shard: true), the burst its 'shatter' event.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, placeV, place, conformPlane, fxGround } from './fx-common.js';

const NEEDLES = 16, FANS = 2, FLASHES = 4, CHIPS = 90, HIST = 7, SPIKES = 48, SPIKE_STEP = 0.55;
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
// the frost fan on the ground behind the shards: plane centred on the burst, +x along the shot; uArc half
// its angle, uFront how far the frost has run (of the reach), uMelt 0..1, uSeed; cel tones, frost lines
// along the shard paths (uLines of them), a bright rim at the front
const FAN_FS = `varying vec2 vP; uniform float uArc; uniform float uFront; uniform float uMelt; uniform float uLines; uniform float uSeed;
  void main(){
    float r = length(vP), a = atan(vP.y, vP.x);
    if (r > uFront || abs(a) > uArc + 0.1 || r < 0.02) discard;
    float k = (uLines - 1.0)*0.5, gap = uArc/max(k, 0.5);
    float line = abs(fract(a/gap + k + 0.5) - 0.5)*gap*r;     // distance across to the nearest shard path
    float w = (0.012 + 0.014*(1.0 - r))*(1.0 - 0.7*uMelt);                  // a frost streak, tapering out
    float frost = 1.0 - smoothstep(w*0.5, w, line);
    float halo = (1.0 - smoothstep(w, w*5.0, line))*0.25;
    float far = 1.0 - smoothstep(uFront - 0.08, uFront, r);
    float fade = (1.0 - uMelt)*(1.0 - smoothstep(0.7, 1.0, r));
    float al = (frost*0.95 + halo)*far*fade + 0.06*(1.0 - uMelt)*(1.0 - r)*step(abs(a), uArc);
    if (uFront < 1.0 && uFront - r < 0.04) al = max(al, 0.5*step(abs(a), uArc));   // the running front
    if (al < 0.01) discard;
    vec3 c = mix(vec3(0.62, 0.86, 0.98), vec3(0.96, 1.0, 1.0), frost);
    gl_FragColor = vec4(c, min(1.0, al)); }`;

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
    // frost spikes the shards leave on the ground under their paths (the same ice needles, standing)
    this.spikes = new THREE.InstancedMesh(this.needles.geometry, this.needles.material, SPIKES);
    this.spikes.frustumCulled = false; this.spikes.renderOrder = 5; this.spikes.count = 0; scene.add(this.spikes);
    this.spikeList = Array.from({ length: SPIKES }, () => ({ t: 9, x: 0, z: 0, s: 1, lean: new THREE.Quaternion() })); this.spikeI = 0;
    this.up = new THREE.Vector3(0, 1, 0); this.axis = new THREE.Vector3();
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
    const fanVS = `varying vec2 vP; void main(){ vP = (uv*2.0 - 1.0); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
    this.fans = Array.from({ length: FANS }, (_, k) => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uArc: { value: 0.6 }, uFront: { value: 0 }, uMelt: { value: 0 }, uLines: { value: 5 }, uSeed: { value: k * 3.7 } },
        vertexShader: fanVS, fragmentShader: FAN_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 8, 8), mat); m.visible = false; m.renderOrder = 1; scene.add(m);
      return { m, mat, t: 9, reach: 5 };
    });
    this.fanI = 0;
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
  shatter(e, reach) {
    const dx = Math.sin(e.angle), dz = Math.cos(e.angle);
    this.flash(e.x, 1.0, e.z, 1.6);
    this.chipBurst(e.x, 1.0, e.z, 14, dx, dz, 3.5);
    const f = this.fans[this.fanI++ % FANS];
    f.t = 0; f.reach = reach;
    f.mat.uniforms.uArc.value = (e.arc * Math.PI) / 360; f.mat.uniforms.uLines.value = e.count || 5; f.mat.uniforms.uSeed.value = this.rnd() * 10;
    f.m.visible = true; f.m.scale.set(reach * 2, reach * 2, 1);
    place(f.m, e.x, 0.04, e.z); f.m.rotation.set(-Math.PI / 2, 0, e.angle - Math.PI / 2); conformPlane(f.m);
    for (let i = 0; i < 8; i++) this.glint(e.x, 0.9 + this.rnd() * 0.4, e.z, 0.5);
  }
  // a struck target: ice chips off it, a cold glint
  hit(c, dx, dz) {
    const l = Math.hypot(dx, dz) || 1;
    this.chipBurst(c.x, c.y, c.z, 6, dx / l, dz / l, 2.2);
    this.glint(c.x, c.y + 0.2, c.z, 0.7);
  }
  spike(x, z, dir) {
    const s = this.spikeList[this.spikeI++ % SPIKES], r = this.rnd;
    s.t = 0; s.x = x + (r() - 0.5) * 0.2; s.z = z + (r() - 0.5) * 0.2; s.s = 0.55 + r() * 0.45;
    // stand up (+x of the needle to world up), then lean back against the flight a little
    this.axis.set(dir.z, 0, -dir.x).normalize();
    s.lean.setFromUnitVectors(X, this.up).premultiply(this.q.setFromAxisAngle(this.axis, -0.35 - r() * 0.3));
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
      const len = rec.shard ? 0.62 : 1.45, thick = rec.shard ? 1.3 : 2.0;
      if (alpha >= 1 && k < NEEDLES) {
        this.q.setFromUnitVectors(X, rec.dir); this.s3.set(len, thick, thick);
        this.p.copy(rec.pos); this.p.y += fxGround.y(this.p.x, this.p.z);
        this.m4.compose(this.p, this.q, this.s3); this.needles.setMatrixAt(k++, this.m4);
      }
      if (rec.n >= 2) {
        const pts = this.trail; pts.length = rec.n;
        for (let i = 0; i < rec.n; i++) pts[i] = h[rec.n - 1 - i];
        sw = rec.shard ? 0.07 : 0.12; this.glow.strip(pts, trailGlowW, 0.7 * alpha, ICE_GLOW);
        sw = rec.shard ? 0.025 : 0.04; this.core.strip(pts, trailCoreW, 0.9 * alpha, ICE_EDGE);
      }
      // a shard leaves frost spikes behind it, a little apart, leaning back along its path
      if (rec.shard && alpha >= 1) {
        if (rec.n === 1) { rec.sx = rec.pos.x; rec.sz = rec.pos.z; }
        if (Math.hypot(rec.pos.x - rec.sx, rec.pos.z - rec.sz) >= SPIKE_STEP) { rec.sx = rec.pos.x; rec.sz = rec.pos.z; this.spike(rec.pos.x, rec.pos.z, rec.dir); }
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
    // spikes: shoot up, hold, sink and shrink away
    let sp = 0;
    for (const s of this.spikeList) {
      if (s.t >= 1.5) continue;
      s.t += dt;
      const grow = Math.min(1, s.t / 0.08), out = Math.max(0, (s.t - 1.0) / 0.5), k3 = s.s * grow * (1 - out);
      if (k3 <= 0) continue;
      this.s3.set(0.62 * k3, 1.3 * k3, 1.3 * k3);
      this.p.set(s.x, 0.62 * k3 * 0.35 + fxGround.y(s.x, s.z), s.z);
      this.m4.compose(this.p, s.lean, this.s3); this.spikes.setMatrixAt(sp++, this.m4);
    }
    this.spikes.count = sp; this.spikes.instanceMatrix.needsUpdate = true;
    for (const f of this.flashes) {
      f.t += dt; const u = f.t / 0.22;
      f.m.visible = u < 1; if (!f.m.visible) continue;
      f.m.quaternion.copy(this.camera.quaternion); f.m.scale.setScalar(f.size * (0.6 + u * 0.7)); f.m.material.uniforms.uT.value = u;
    }
    // the frost fan: runs out with the shards (0.25 s), holds, melts back
    for (const f of this.fans) {
      if (!f.m.visible) continue;
      f.t += dt; const U = f.mat.uniforms;
      U.uFront.value = Math.min(1, f.t / 0.25);
      U.uMelt.value = Math.max(0, Math.min(1, (f.t - 1.0) / 0.8));
      if (f.t > 1.8) f.m.visible = false;
    }
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const rec of this.pool) rec.id = 0;
    this.live.clear(); this.dying.length = 0; for (const g of this.glints) this.glintFree.push(g); this.glints.length = 0;
    for (const ch of this.chipList) ch.t = 9;
    for (const s of this.spikeList) s.t = 9; this.spikes.count = 0;
    this.needles.count = 0; this.chips.count = 0;
    for (const f of this.flashes) { f.t = 9; f.m.visible = false; }
    for (const f of this.fans) f.m.visible = false;
  }
  get busy() { return this.live.size > 0 || this.dying.length > 0 || this.fans.some((f) => f.m.visible); }
}
