// The guardian's greatshield skills, in the bench's light-and-ribbon language and the guardian's gold
// (Hold the Line). Cosmetic only: they read the rules' events and the hero's state.
//  - Line Breaker (shield_rush): the wind-up draws light in to a point in front of the shield; the charge
//    pushes a bow wave of light (three stacked chevrons) ahead of the shield, trails speed lines and leaves
//    two glowing skid lines on the ground; each monster it reaches bursts gold with sparks thrown aside; a
//    boss or a big monster that stops it sets off a clash (two spinning stars, a glint, upright and ground
//    rings, a hard shake); on arrival a dust ring settles.
//  - Shield Fortress (shield_fort): a tall curved pane of gold light over the guard's arc stands in front of
//    the hero while the shield is held (a hex weave, a crisp rim, shine sliding over it, an arc on the
//    ground), following the facing; a blocked blow ripples the pane where it struck, with a clash star, a
//    glint and sparks thrown back; when the shield drops the pane sinks away.
//  - Wall of Faith (faith_wall): a line of light runs out along the ground both ways from the centre, then
//    the wall rises from it: a pane of light whose columns stream upward, strongest at its foot, motes
//    drifting up through it; a monster shot that meets it rings out a ripple where it stopped; at its end it
//    dissolves upward.
// Pools only: no allocation per frame. Numbers that tune a shader are uniforms.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV } from './fx-common.js';

const GOLD = [1.0, 0.86, 0.4], GOLD_GLOW = [1.0, 0.58, 0.12], WHITE = [1, 1, 0.96], CREAM = [1.0, 0.95, 0.75];
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.97), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
// Shield Fortress: gold glass with a faint hex weave, a crisp rim, shine sliding over it and a ripple
// spreading from the last blow (uHit: its uv, uRip: seconds since)
const FORT_FS = `varying vec2 vUv; uniform float uT; uniform float uA; uniform float uFlash; uniform vec2 uHit; uniform float uRip; uniform vec3 uColor; uniform vec3 uRim;
  float hex(vec2 p){ p = abs(p); return max(p.x * 0.866 + p.y * 0.5, p.y); }
  void main(){
    float sx = min(vUv.x, 1.0 - vUv.x), sy = min(vUv.y, 1.0 - vUv.y);
    float rim = 1.0 - smoothstep(0.0, 0.025, min(sx * 1.2, sy));
    float lip = (1.0 - smoothstep(0.025, 0.1, min(sx * 1.2, sy))) * 0.35;
    vec2 g = vec2(vUv.x * 11.0, vUv.y * 7.0); g.x += mod(floor(g.y), 2.0) * 0.5;
    float cell = smoothstep(0.42, 0.47, hex(fract(g) - 0.5)) * 0.16;          // the hex weave's lines
    float fill = mix(0.26, 0.07, vUv.y);
    float d = vUv.x * 1.4 + vUv.y * 0.9 - mod(uT * 1.6, 3.0) + 0.5;
    float shine = smoothstep(0.08, 0.0, abs(d)) * 0.6 + smoothstep(0.03, 0.0, abs(d - 0.2)) * 0.45;
    float r = length((vUv - uHit) * vec2(2.6, 1.0)), ring = uRip < 0.45 ? smoothstep(0.05, 0.0, abs(r - uRip * 1.8)) * (1.0 - uRip / 0.45) : 0.0;
    float a = clamp(max(rim, fill + lip + shine + cell + ring), 0.0, 1.0) * uA;
    vec3 c = mix(uColor, vec3(1.0), clamp(rim * 0.8 + shine + ring + uFlash, 0.0, 1.0));
    c = mix(c, uRim, rim * 0.4);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, min(1.0, a + uFlash * 0.4)); }`;
// Wall of Faith: columns of light streaming up, strongest at the foot; it rises (uRise) and dissolves
// upward (uCut: the height below which it is gone); a ripple from the last shot (uHit, uRip)
const WALL_FS = `varying vec2 vUv; uniform float uT; uniform float uA; uniform float uCut; uniform vec2 uHit; uniform float uRip; uniform vec3 uColor;
  float n1(float x){ return fract(sin(x * 91.7) * 43758.5); }
  void main(){
    if (vUv.y < uCut) discard;
    float col = floor(vUv.x * 26.0), f = fract(vUv.x * 26.0);
    float speed = 0.6 + n1(col) * 0.9, phase = n1(col + 7.0);
    float stream = smoothstep(0.35, 0.0, abs(fract(vUv.y * 1.3 - uT * speed + phase) - 0.5) - 0.12) * smoothstep(0.5, 0.15, abs(f - 0.5));
    float foot = pow(1.0 - vUv.y, 1.6);
    float sx = min(vUv.x, 1.0 - vUv.x);
    float side = smoothstep(0.0, 0.06, sx);
    float base = 1.0 - smoothstep(0.0, 0.05, vUv.y);
    float r = length((vUv - uHit) * vec2(4.0, 1.4)), ring = uRip < 0.5 ? smoothstep(0.06, 0.0, abs(r - uRip * 2.2)) * (1.0 - uRip / 0.5) : 0.0;
    float cutEdge = uCut > 0.0 ? smoothstep(0.06, 0.0, vUv.y - uCut) : 0.0;
    float a = (foot * 0.55 + stream * 0.45 * (0.3 + foot) + base * 0.6 + ring + cutEdge) * side * uA;
    vec3 c = mix(uColor, vec3(1.0, 0.99, 0.92), clamp(stream * 0.5 + base + ring + cutEdge, 0.0, 1.0));
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, min(1.0, a)); }`;

const PILLARS = 11, FLASHES = 8, RAYS = 8, SPARKS = 56, MOTES = 28, LINES = 7, RING_PTS = 25, ARC_PTS = 17, CHEV_PTS = 9;
const FORT_R = 1.15, FORT_H = 2.0, WALL_H = 2.4;
const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.4;
const arcW = (x) => stripW * Math.min(1, Math.sin(Math.PI * x) * 4), arcGlowW = (x) => arcW(x) * 2.4;
const taperW = (x) => stripW * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), taperGlowW = (x) => taperW(x) * 2.6;
const tailW = (x) => stripW * x, tailGlowW = (x) => stripW * x * 2.4;
const glintW = (x) => stripW * Math.pow(Math.sin(Math.PI * x), 3);
const pillarW = (x) => stripW * (1.3 - x * 0.9), pillarGlowW = (x) => pillarW(x) * 2.6; // posts: wide at the foot, thin at the top

export class GreatshieldFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 6000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 6000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const soft = new THREE.CanvasTexture(c);
    this.flashes = Array.from({ length: FLASHES }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffe7a8 })); sp.visible = false; sp.renderOrder = 9; scene.add(sp);
      return { sp, t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) };
    });
    // the clash star (four sharp points, white core, gold rim)
    const sc = document.createElement('canvas'); sc.width = sc.height = 256;
    const sg = sc.getContext('2d');
    const star = (len, wide, col) => { sg.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = k % 2 ? wide : len; sg.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } sg.closePath(); sg.fillStyle = col; sg.fill(); };
    sg.shadowColor = 'rgba(255,170,40,0.9)'; sg.shadowBlur = 18; star(124, 20, 'rgba(255,196,70,1)'); sg.shadowBlur = 0; star(104, 13, 'rgba(255,240,190,1)'); star(70, 8, '#ffffff');
    const starTex = new THREE.CanvasTexture(sc);
    this.stars = [0, 1].map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, depthWrite: false, depthTest: false, transparent: true, toneMapped: false })); sp.visible = false; sp.renderOrder = 11; scene.add(sp); return sp; });
    this.starT = 9; this.starAt = new THREE.Vector3(); this.starSize = 1; this.glintSide = new THREE.Vector3();
    // Shield Fortress pane (rebuilt only when the guard's arc changes)
    this.fortMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uFlash: { value: 0 }, uHit: { value: new THREE.Vector2(0.5, 0.5) }, uRip: { value: 9 }, uColor: { value: new THREE.Color(1.0, 0.8, 0.42) }, uRim: { value: new THREE.Color(1.0, 0.62, 0.18) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: VS, fragmentShader: FORT_FS });
    this.fort = new THREE.Mesh(new THREE.BufferGeometry(), this.fortMat); this.fort.renderOrder = 6; this.fort.visible = false; scene.add(this.fort);
    this.fortArc = 0; this.fortT = 9; this.fortUp = false; this.fortDown = 9;
    // Wall of Faith pane (unit width and height, scaled to the wall)
    this.wallMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uCut: { value: 0 }, uHit: { value: new THREE.Vector2(0.5, 0.3) }, uRip: { value: 9 }, uColor: { value: new THREE.Color(1.0, 0.78, 0.36) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: VS, fragmentShader: WALL_FS });
    const plane = new THREE.PlaneGeometry(1, 1); plane.translate(0, 0.5, 0);
    this.wallMesh = new THREE.Mesh(plane, this.wallMat); this.wallMesh.renderOrder = 6; this.wallMesh.visible = false; scene.add(this.wallMesh);
    this.wall = { id: null, x: 0, z: 0, axis: 0, facing: 0, half: 3, t: 9, dur: 0, end: 9 };
    this.sparks = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 9, max: 1, w: 0, fall: 14 }));
    this.motes = Array.from({ length: MOTES }, () => ({ along: 0, h: 0, rise: 1, life: 9, max: 1, w: 0 }));
    this.lines = Array.from({ length: LINES }, () => ({ side: 0, h: 0, len: 1, phase: 0 }));
    this.rings = []; this.ringFree = Array.from({ length: 12 }, () => ({ c: new THREE.Vector3(), n: new THREE.Vector3(), r0: 0, r1: 1, life: 9, max: 1, w: 0.05, col: GOLD, glowCol: GOLD_GLOW }));
    this.ringAlive = (r) => r.life < r.max || (this.ringFree.push(r), false);
    this.rush = { on: false, wind: 9, windDur: 0.3, x: 0, z: 0, fromX: 0, fromZ: 0, angle: 0, trail: 9 };
    this.rnd = mulberry32(53); this.t = 0; this.flashI = 0; this.onShake = null;
    this.pts = Array.from({ length: RING_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.dir = new THREE.Vector3(); this.side = new THREE.Vector3(); this.u = new THREE.Vector3(); this.v = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.tmp = new THREE.Vector3();
  }

  // ---- shared pieces ----
  flash(pos, size, life, dir = null) {
    const b = this.flashes[this.flashI++ % FLASHES], r = this.rnd;
    b.t = 0; b.size = size; b.life = life; b.pos.copy(pos);
    b.rays.forEach((ray, k) => {
      if (dir && k < 3) { ray.d.set(dir.x + (r() - 0.5) * 0.7, (r() - 0.3) * 0.6, dir.z + (r() - 0.5) * 0.7).normalize(); ray.len = size * (1.1 + r() * 0.6); }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.45 + r() * 0.35); }
    });
  }
  ring(c, n, r0, r1, max, w, col = GOLD, glowCol = GOLD_GLOW) {
    const g = this.ringFree.pop(); if (!g) return;
    g.c.copy(c); g.n.copy(n); g.r0 = r0; g.r1 = r1; g.life = 0; g.max = max; g.w = w; g.col = col; g.glowCol = glowCol; this.rings.push(g);
  }
  // sparks from c along dir (x, z), spread over `spread` radians, some thrown up
  sparkBurst(c, dx, dz, n, spread, speed, fall = 14) {
    const r = this.rnd;
    let made = 0;
    for (const sp of this.sparks) {
      if (made >= n) break;
      if (sp.life < sp.max) continue;
      const a = Math.atan2(dx, dz) + (r() - 0.5) * spread, s = speed * (0.5 + r() * 0.7);
      sp.p.copy(c); sp.v.set(Math.sin(a) * s, 1 + r() * 4, Math.cos(a) * s); sp.life = 0; sp.max = 0.22 + r() * 0.3; sp.w = 0.025 + r() * 0.03; sp.fall = fall; made++;
    }
  }
  clash(at, dx, dz, size) {
    this.starT = 0; this.starAt.copy(at); this.starSize = size; this.glintSide.set(dz, 0, -dx).normalize();
    this.dir.set(dx, 0, dz).normalize();
    this.flash(at, 1.4 * size, 0.34, this.dir);
    this.ring(at, this.dir, 0.1, 1.2 * size, 0.24, 0.08, WHITE);
    this.ring(at, this.dir, 0.1, 2.0 * size, 0.4, 0.04);
  }

  // ---- Line Breaker ----
  windup(p, total) { const R = this.rush; R.wind = 0; R.windDur = Math.max(0.05, total); R.x = p.x; R.z = p.z; R.angle = p.facing; }
  rushStart(e) {
    const R = this.rush; R.on = true; R.fromX = e.x; R.fromZ = e.z; R.angle = e.angle; R.trail = 0; R.wind = 9;
    const r = this.rnd; for (const l of this.lines) { l.side = (r() - 0.5) * 1.5; l.h = 0.25 + r() * 1.5; l.len = 1.2 + r() * 1.6; l.phase = r(); }
    this.tmp.set(e.x, 0.05, e.z); this.ring(this.tmp, this.up, 0.2, 1.2, 0.3, 0.06); // the push-off
    this.onShake?.(0.05, 0.08);
  }
  rushHit(c, fromX, fromZ) {
    const dx = c.x - fromX, dz = c.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.flash(c, 1.0, 0.26, this.dir.set(dx / l, 0, dz / l));
    // thrown to its side: sparks fly out that way
    const a = this.rush.angle, sx = Math.cos(a), sz = -Math.sin(a), k = (c.x - this.rush.fromX) * sx + (c.z - this.rush.fromZ) * sz >= 0 ? 1 : -1;
    this.sparkBurst(c, sx * k + Math.sin(a) * 0.6, sz * k + Math.cos(a) * 0.6, 10, 1.2, 7);
    this.ring(c, this.dir, 0.1, 0.9, 0.2, 0.05);
    this.onShake?.(0.07, 0.1);
  }
  rushStop(x, z, angle) {
    const at = this.tmp.set(x + Math.sin(angle) * 0.9, 1.15, z + Math.cos(angle) * 0.9);
    this.clash(at, Math.sin(angle), Math.cos(angle), 1.3);
    this.sparkBurst(at, -Math.sin(angle), -Math.cos(angle), 22, 2.6, 8);
    this.ring(this.three[1].set(x, 0.05, z), this.up, 0.3, 2.6, 0.45, 0.08);
    this.onShake?.(0.26, 0.3);
  }
  rushArrive(x, z) { this.rush.on = false; this.ring(this.tmp.set(x, 0.05, z), this.up, 0.3, 1.4, 0.35, 0.05, CREAM, GOLD_GLOW); }

  // ---- Shield Fortress ----
  raise(arcDeg) {
    const arc = (arcDeg * Math.PI) / 180;
    if (this.fortArc !== arc) { // CylinderGeometry: theta 0 points along +z (the hero's facing at rotation.y)
      this.fort.geometry.dispose();
      this.fort.geometry = new THREE.CylinderGeometry(FORT_R, FORT_R, FORT_H, 32, 1, true, -arc / 2, arc);
      this.fortArc = arc;
    }
    this.fortT = 0; this.fortUp = true; this.fortDown = 9; this.fortMat.uniforms.uRip.value = 9;
  }
  lower() { if (this.fortUp) { this.fortUp = false; this.fortDown = 0; } }
  block(p, fromX, fromZ) {
    const a = Math.atan2(fromX - p.x, fromZ - p.z), off = Math.atan2(Math.sin(a - p.facing), Math.cos(a - p.facing));
    const at = this.tmp.set(p.x + Math.sin(a) * FORT_R, 1.2, p.z + Math.cos(a) * FORT_R);
    this.clash(at, Math.sin(a), Math.cos(a), 1);
    this.sparkBurst(at, Math.sin(a), Math.cos(a), 14, 1.8, 7);
    this.fortMat.uniforms.uHit.value.set(0.5 + off / Math.max(0.1, this.fortArc), 0.55); this.fortMat.uniforms.uRip.value = 0; this.fortMat.uniforms.uFlash.value = 0.6;
    this.onShake?.(0.08, 0.14);
  }

  // ---- Wall of Faith ----
  // area: the rules' light wall (x, z, angle = its axis, facing = the caster's aim, radius = half its length)
  wallBegin(area) {
    const W = this.wall; W.id = area.id; W.x = area.x; W.z = area.z; W.axis = area.angle; W.facing = area.facing; W.half = area.radius; W.t = 0; W.dur = area.duration; W.end = 9;
    this.wallMesh.visible = false; this.wallMat.uniforms.uRip.value = 9; this.wallMat.uniforms.uCut.value = 0;
    const r = this.rnd; for (const m of this.motes) { m.life = m.max = 1; m.along = (r() * 2 - 1) * W.half * 0.95; m.h = r() * WALL_H; m.rise = 0.5 + r() * 0.8; m.life = r() * 1.5; m.max = 1.5 + r(); m.w = 0.03 + r() * 0.03; }
  }
  wallBlock(id, x, z, y = 1.1) {
    const W = this.wall; if (W.id !== id && id !== undefined) return;
    const along = (x - W.x) * Math.sin(W.axis) + (z - W.z) * Math.cos(W.axis);
    this.wallMat.uniforms.uHit.value.set(0.5 + along / (2 * W.half), y / WALL_H); this.wallMat.uniforms.uRip.value = 0;
    this.flash(this.tmp.set(x, y, z), 0.8, 0.22);
    this.ring(this.tmp, this.dir.set(Math.sin(W.facing), 0, Math.cos(W.facing)), 0.05, 0.8, 0.28, 0.04, CREAM, GOLD_GLOW);
  }
  wallEnd(id) { const W = this.wall; if (W.id === id && W.end > 1) W.end = 0; }

  get fortBusy() { return this.fortUp || this.fortDown < 0.2; }

  update(dt, p) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    const three = this.three, sub = this.sub, r = this.rnd;
    // Line Breaker: the gather, then the bow wave, speed lines and skid lines while the dash runs
    const R = this.rush;
    if (R.wind < R.windDur) {
      R.wind += dt;
      const k = Math.min(1, R.wind / R.windDur), fx = p.x + Math.sin(p.facing) * 0.75, fz = p.z + Math.cos(p.facing) * 0.75;
      for (let i = 0; i < 6; i++) {
        const a = p.facing + (i / 5 - 0.5) * 2.4, d = 1.6 * (1 - k) + 0.15;
        three[0].set(fx + Math.sin(a) * (d + 0.6), 1.0 + (i % 3 - 1) * 0.35, fz + Math.cos(a) * (d + 0.6)); three[2].set(fx + Math.sin(a) * d, 1.0 + (i % 3 - 1) * 0.12, fz + Math.cos(a) * d); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.05 * k; this.glow.strip(three, tailGlowW, 0.9 * k, GOLD_GLOW); this.core.strip(three, tailW, k, GOLD);
      }
    }
    const dashing = p.dash?.kind === 'shield_rush';
    if (R.on && !dashing && R.trail < 9) R.on = false;
    if (dashing || R.trail < 0.35) {
      if (!dashing) R.trail += dt;
      const fade = dashing ? 1 : 1 - R.trail / 0.35, a = R.angle, s = Math.sin(a), c = Math.cos(a), sx = c, sz = -s;
      const hx = dashing ? p.x : R.x, hz = dashing ? p.z : R.z; if (dashing) { R.x = p.x; R.z = p.z; }
      // the bow wave: three chevrons of light bent round the shield's front
      for (let row = 0; row < 3; row++) {
        sub.length = 0;
        const reach = 0.95 + row * 0.12, h = 0.45 + row * 0.5, spread = 1.05 - row * 0.15;
        for (let i = 0; i < CHEV_PTS; i++) {
          const u = i / (CHEV_PTS - 1) - 0.5, back = Math.abs(u) * spread * 1.1;
          this.pts[i].set(hx + s * (reach - back) + sx * u * 2 * spread, h, hz + c * (reach - back) + sz * u * 2 * spread); sub.push(this.pts[i]);
        }
        stripW = 0.09 - row * 0.015; this.glow.strip(sub, arcGlowW, 0.9 * fade, GOLD_GLOW); this.core.strip(sub, arcW, fade, row === 1 ? WHITE : GOLD);
      }
      // speed lines streaming back off the body
      for (const l of this.lines) {
        const off = (this.t * 3 + l.phase) % 1;
        three[0].set(hx - s * (0.2 + off * 0.6) + sx * l.side, l.h, hz - c * (0.2 + off * 0.6) + sz * l.side);
        three[2].set(three[0].x - s * l.len, l.h, three[0].z - c * l.len); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.045; this.glow.strip(three, taperGlowW, 0.6 * fade, GOLD_GLOW); this.core.strip(three, taperW, 0.85 * fade, CREAM);
      }
      // two skid lines on the ground from the start to the shield
      for (const k of [-1, 1]) {
        three[0].set(R.fromX + sx * 0.35 * k, 0.04, R.fromZ + sz * 0.35 * k); three[2].set(hx + sx * 0.35 * k, 0.04, hz + sz * 0.35 * k); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.08; this.glow.strip(three, tailGlowW, 0.7 * fade, GOLD_GLOW); this.core.strip(three, tailW, 0.6 * fade, GOLD);
      }
    }
    // Shield Fortress: the pane while held, sinking away when lowered
    if (this.fortUp || this.fortDown < 0.2) {
      if (this.fortUp) this.fortT += dt; else this.fortDown += dt;
      const t = this.fortT, pop = Math.min(1, t / 0.12), over = pop < 1 ? pop * (1.12 - 0.12 * pop) : 1 + 0.05 * Math.exp(-(t - 0.12) * 16) * Math.cos((t - 0.12) * 36);
      const sink = this.fortUp ? 1 : 1 - this.fortDown / 0.2, k = over * sink;
      this.fort.visible = k > 0.01;
      place(this.fort, p.x, FORT_H / 2 * k + 0.04, p.z); this.fort.rotation.y = p.facing; this.fort.scale.set(1, Math.max(0.01, k), 1);
      const U = this.fortMat.uniforms;
      U.uT.value = t; U.uA.value = Math.min(1, t / 0.06) * sink * (0.9 + 0.1 * Math.sin(this.t * 6)); U.uRip.value += dt; U.uFlash.value = Math.max(0, U.uFlash.value - dt * 5);
      sub.length = 0;
      for (let i = 0; i < ARC_PTS; i++) { const a = p.facing - this.fortArc / 2 + (i / (ARC_PTS - 1)) * this.fortArc; this.pts[i].set(p.x + Math.sin(a) * FORT_R, 0.05, p.z + Math.cos(a) * FORT_R); sub.push(this.pts[i]); }
      stripW = 0.09; this.glow.strip(sub, arcGlowW, 0.9 * sink, GOLD_GLOW); this.core.strip(sub, arcW, sink, GOLD);
    } else this.fort.visible = false;
    // Wall of Faith: the ground line runs out, the wall rises, streams, then dissolves upward
    const W = this.wall;
    if (W.id !== null && W.t < 99) {
      W.t += dt; if (W.end < 9) W.end += dt;
      const sa = Math.sin(W.axis), ca = Math.cos(W.axis), run = Math.min(1, W.t / 0.25), rise = Math.max(0, Math.min(1, (W.t - 0.15) / 0.3));
      const gone = W.end < 9 ? W.end / 0.4 : 0;
      if (gone >= 1) { W.id = null; this.wallMesh.visible = false; }
      else {
        // the ground line (and its rune ticks)
        for (const k of [-1, 1]) {
          three[0].set(W.x, 0.05, W.z); three[2].set(W.x + sa * W.half * run * k, 0.05, W.z + ca * W.half * run * k); three[1].copy(three[0]).lerp(three[2], 0.5);
          stripW = 0.1 * (1 - gone); this.glow.strip(three, lineGlowW, 0.9 * (1 - gone), GOLD_GLOW); this.core.strip(three, lineW, 1 - gone, GOLD);
        }
        const fs = Math.sin(W.facing), fc = Math.cos(W.facing);
        for (let i = -5; i <= 5; i++) {
          const u = i / 5; if (Math.abs(u) > run) continue;
          three[0].set(W.x + sa * W.half * u * 0.95 - fs * 0.25, 0.05, W.z + ca * W.half * u * 0.95 - fc * 0.25); three[2].set(three[0].x + fs * 0.5, 0.05, three[0].z + fc * 0.5); three[1].copy(three[0]).lerp(three[2], 0.5);
          stripW = 0.06; this.core.strip(three, lineW, 0.8 * (1 - gone), CREAM);
        }
        // a soft glow band over its footprint
        three[0].set(W.x - sa * W.half * run, 0.05, W.z - ca * W.half * run); three[2].set(W.x + sa * W.half * run, 0.05, W.z + ca * W.half * run); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.75; this.glow.strip(three, arcW, 0.55 * (1 - gone), GOLD_GLOW);
        // the pane
        const over = rise < 1 ? rise * (1.1 - 0.1 * rise) : 1 + 0.04 * Math.exp(-(W.t - 0.45) * 14) * Math.cos((W.t - 0.45) * 30);
        // the high camera sees a wall across the aim almost edge on: posts of light, their tops joined by a
        // bright edge, give it its height from any side
        if (rise > 0) {
          const top = WALL_H * over, low = gone * top;
          sub.length = 0;
          for (let i = 0; i < PILLARS; i++) {
            const u = (i / (PILLARS - 1)) * 2 - 1, px = W.x + sa * W.half * u * 0.97, pz = W.z + ca * W.half * u * 0.97, pulse = 0.65 + 0.35 * Math.sin(this.t * 4 + i * 1.7);
            three[0].set(px, low, pz); three[2].set(px, top, pz); three[1].set(px, (low + top) * 0.45, pz);
            stripW = (i === 0 || i === PILLARS - 1 ? 0.11 : 0.07) * Math.min(1, rise * 1.5);
            this.glow.strip(three, pillarGlowW, 0.8 * pulse * (1 - gone), GOLD_GLOW); this.core.strip(three, pillarW, 0.85 * pulse * (1 - gone), CREAM);
            this.pts[i].set(px, top, pz); sub.push(this.pts[i]);
          }
          if (gone < 0.98) { stripW = 0.07; this.glow.strip(sub, lineGlowW, 0.9 * (1 - gone), GOLD_GLOW); this.core.strip(sub, lineW, 1 - gone, GOLD); }
        }
        this.wallMesh.visible = rise > 0;
        place(this.wallMesh, W.x, 0.02, W.z); this.wallMesh.rotation.y = W.facing; this.wallMesh.scale.set(W.half * 2, WALL_H * Math.max(0.01, over), 1);
        const U = this.wallMat.uniforms; U.uT.value = W.t; U.uA.value = Math.min(1, rise * 2) * (0.92 + 0.08 * Math.sin(this.t * 5)); U.uCut.value = gone; U.uRip.value += dt;
        // motes drifting up through it
        for (const m of this.motes) {
          m.life += dt; if (m.life >= m.max) { m.life = 0; m.max = 1.2 + r() * 1.2; m.along = (r() * 2 - 1) * W.half * 0.95; m.h = r() * 0.4; m.rise = 0.6 + r() * 0.8; }
          const u = m.life / m.max, h = m.h + m.rise * m.life;
          if (h > WALL_H * over || h < gone * WALL_H || rise < 0.5) continue;
          three[2].set(W.x + sa * m.along, h, W.z + ca * m.along); three[0].set(three[2].x, h - 0.32, three[2].z); three[1].copy(three[0]).lerp(three[2], 0.5);
          stripW = m.w * Math.sin(Math.PI * u); this.glow.strip(three, tailGlowW, 0.8, GOLD_GLOW); this.core.strip(three, tailW, 0.9, CREAM);
        }
      }
    }
    // flashes, rings, sparks, the clash star and glint
    for (const b of this.flashes) {
      b.t += dt;
      const k = b.t / b.life;
      b.sp.visible = k < 1;
      if (!b.sp.visible) continue;
      placeV(b.sp, b.pos); b.sp.scale.setScalar(b.size * (0.9 + 1.4 * Math.sqrt(k))); b.sp.material.opacity = 1 - k * k;
      const out = Math.min(1, k * 3.5), inner = Math.max(0, k * 1.4 - 0.3);
      for (const ray of b.rays) {
        three[0].copy(b.pos).addScaledVector(ray.d, ray.len * inner * 0.9); three[2].copy(b.pos).addScaledVector(ray.d, ray.len * out); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.08 * b.size * (1 - k * 0.6);
        this.glow.strip(three, taperGlowW, 0.8 * (1 - k), GOLD_GLOW); this.core.strip(three, taperW, 1 - k * k, GOLD);
      }
    }
    for (const g of this.rings) {
      g.life += dt;
      const u = g.life / g.max;
      if (u >= 1) continue;
      const rad = g.r0 + (g.r1 - g.r0) * (1 - (1 - u) * (1 - u));
      sub.length = 0;
      if (g.n.y > 0.9) { this.u.set(1, 0, 0); this.v.set(0, 0, 1); } else { this.u.crossVectors(g.n, this.up).normalize(); this.v.crossVectors(g.n, this.u).normalize(); }
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; this.pts[i].copy(g.c).addScaledVector(this.u, Math.cos(a) * rad).addScaledVector(this.v, Math.sin(a) * rad); sub.push(this.pts[i]); }
      stripW = g.w * (1 - u * 0.5); this.glow.strip(sub, lineGlowW, 0.8 * (1 - u), g.glowCol); this.core.strip(sub, lineW, 1 - u, g.col);
    }
    compact(this.rings, this.ringAlive);
    for (const sp of this.sparks) {
      if (sp.life >= sp.max) continue;
      sp.life += dt; sp.v.y -= sp.fall * dt; sp.v.multiplyScalar(1 - 2.5 * dt); sp.p.addScaledVector(sp.v, dt);
      const u = sp.life / sp.max;
      three[2].copy(sp.p); three[0].copy(sp.p).addScaledVector(sp.v, -0.035); three[1].copy(three[0]).lerp(three[2], 0.5);
      stripW = sp.w * (1 - u * 0.5); this.glow.strip(three, lineGlowW, 0.8 * (1 - u), GOLD_GLOW); this.core.strip(three, tailW, 1 - u * u, u < 0.3 ? WHITE : GOLD);
    }
    if (this.starT < 0.5) {
      this.starT += dt;
      const t = this.starT, pop = t < 0.04 ? t / 0.04 : Math.max(0, 1 - (t - 0.04) / 0.26);
      this.stars.forEach((st, k) => {
        st.visible = pop > 0.01; if (!st.visible) return;
        placeV(st, this.starAt); st.scale.setScalar(this.starSize * (k ? 1.2 : 2.2) * (0.4 + 0.6 * pop) * (t < 0.04 ? 1.4 - 0.4 * pop : 1));
        st.material.rotation = (k ? Math.PI / 4 : 0) + t * (k ? -2 : 1.5); st.material.opacity = Math.min(1, pop * 1.4);
      });
      if (t < 0.2) {
        const u = t / 0.2, half = 1.6 * this.starSize * (0.5 + u);
        three[0].copy(this.starAt).addScaledVector(this.glintSide, -half); three[2].copy(this.starAt).addScaledVector(this.glintSide, half); three[1].copy(this.starAt);
        stripW = 0.09 * (1 - u); this.glow.strip(three, taperGlowW, 1 - u, GOLD_GLOW); this.core.strip(three, glintW, 1 - u * u, WHITE);
      }
    } else for (const st of this.stars) st.visible = false;
    this.core.end(); this.glow.end();
  }
  clear() {
    this.rush.on = false; this.rush.wind = 9; this.rush.trail = 9;
    this.fortUp = false; this.fortDown = 9; this.fort.visible = false;
    this.wall.id = null; this.wallMesh.visible = false;
    for (const b of this.flashes) { b.t = 9; b.sp.visible = false; }
    this.starT = 9; for (const st of this.stars) st.visible = false;
    for (const sp of this.sparks) sp.life = sp.max;
    for (const g of this.rings) this.ringFree.push(g); this.rings.length = 0;
  }
}
