// Warp and level-up (owner, 31 October 2026: "ปรับปรุงเอฟเฟค วาปกับเลเวลอัป"), built with the bench's light
// language and Blessing of Light's column (skillfx/bless-fx.js) rather than the old flat cylinders.
//  - warp (the rules' 'teleport', the hero has just arrived): the waypoint's own cyan light. A rune circle
//    like the pillar's lights on the ground under the hero and turns; a column of light drops onto the
//    hero, streaks flowing down it, and narrows into the body; two ribbons of light spiral down round the
//    hero; a glint flares at the chest as it lands; motes rise; a ring runs out over the ground.
//  - level up ('levelup', gold; 'joblevelup', violet): a golden rune circle blooms under the hero; two
//    ribbons spiral UP round the hero and a column rises with streaks flowing up; at the top of the climb
//    a glint bursts over the head, stars pop round the hero and drift down, two rings run out and
//    sparks fall. It follows the hero, who may keep walking.
// One column mesh, one ground disc, one ribbon pair (core + glow) and a pool of star sprites shared by
// both: about a dozen draws while it plays, nothing after.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE, place, conformPlane } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, circlePoints, drawSparks, spark, starTexture, flareTexture, lightSprite } from './light-kit.js';

const STARS = 16, RING = 49, HELIX = 40, SPARKS = 48;
const COLUMN_VS = `varying vec2 vUv; varying float vFres;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal); vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv; }`;
// Blessing's column, two-way: uDir 1 drops from the top with streaks flowing down, -1 rises from the
// ground with streaks flowing up; colours in uniforms (one program for every look)
const COLUMN_FS = `varying vec2 vUv; varying float vFres; uniform float uT, uA, uReveal, uDir; uniform vec3 uHot, uTint;
  ${NOISE}
  void main(){
    float y = vUv.y, ang = vUv.x * 6.2832;
    float n = fbm(vec2(cos(ang), sin(ang)) * 1.8 + (y * 2.2 + uDir * uT * 3.2) * vec2(0.8, 0.6));
    // the travelling front is torn by the same noise and fades in: no straight cut across the column
    float edge = (uDir > 0.0 ? y - (1.0 - uReveal) : uReveal - y) + (n - 0.5) * 0.14 * (1.0 - step(0.999, uReveal));
    if (edge < 0.0) discard;
    float streak = smoothstep(0.42, 0.78, n);
    float fadeY = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.55, 1.0, y) * 0.85) * smoothstep(0.0, 0.06, edge + 0.01);
    float rim = pow(vFres, 1.6), lead = smoothstep(0.06, 0.0, edge) * (1.0 - step(0.999, uReveal)) * 0.5;
    float a = ((0.12 + 0.6 * rim) * (0.55 + 0.45 * streak) + 0.35 * streak + lead) * fadeY;
    vec3 c = mix(uTint, uHot, clamp(0.1 + streak * 0.45 + lead, 0.0, 1.0));
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uA); }`;
// the rune circle (as on the warp pillar): rings, ticks and a spiral, white on black as an alpha map
let runeTex = null;
function runeTexture() {
  if (runeTex) return runeTex;
  const cv = document.createElement('canvas');cv.width = cv.height = 512;
  const c = cv.getContext('2d');c.fillStyle = '#000';c.fillRect(0, 0, 512, 512);c.translate(256, 256);c.strokeStyle = '#fff';c.lineCap = 'round';
  c.lineWidth = 8;c.beginPath();c.arc(0, 0, 236, 0, Math.PI * 2);c.stroke();
  c.lineWidth = 4;c.beginPath();c.arc(0, 0, 206, 0, Math.PI * 2);c.stroke();
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2;c.beginPath();c.moveTo(Math.cos(a) * 210, Math.sin(a) * 210);c.lineTo(Math.cos(a) * (k % 2 ? 222 : 232), Math.sin(a) * (k % 2 ? 222 : 232));c.stroke(); }
  c.lineWidth = 5;c.beginPath();for (let a = 0; a <= Math.PI * 6; a += 0.04) { const r = 10 + a * 9;a ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(r, 0); }c.stroke();
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2;c.save();c.rotate(a);c.strokeRect(150, -14, 28, 28);c.restore(); }
  runeTex = new THREE.CanvasTexture(cv);runeTex.userData.shared = true;return runeTex;
}
const DISC_FS = `varying vec2 vUv; uniform sampler2D uMap; uniform vec3 uTint, uHot; uniform float uA;
  void main(){ float m = texture2D(uMap, vUv).r; float d = length(vUv - 0.5) * 2.0;
    float glow = (1.0 - smoothstep(0.0, 1.0, d)) * 0.16;
    gl_FragColor = vec4(mix(uTint, uHot, m * 0.3), min(1.0, m * 0.9 + glow) * uA); }`;
const out2 = (k) => 1 - (1 - k) * (1 - k);
// a helix strip tapers at both ends
const helixW = (x) => lineW() * Math.sin(Math.PI * Math.min(1, x * 1.05)), helixGlowW = (x) => lineGlowW() * Math.sin(Math.PI * Math.min(1, x * 1.05));
// edge/glow: the ribbon strips' core and halo (the waypoint pillar's cyan; gold; violet for the job)
const LOOKS = {
  warp: { light: { edge: [0.55, 0.93, 1.0], glow: [0.12, 0.68, 1.0] }, hot: [0.85, 1.0, 1.0], tint: [0.2, 0.74, 1.0], star: 'cold', dir: 1 },
  level: { light: { edge: [1.0, 0.88, 0.5], glow: [1.0, 0.62, 0.15] }, hot: [1.0, 0.97, 0.82], tint: [1.0, 0.68, 0.2], star: 'holy', dir: -1 },
  job: { light: { edge: [0.82, 0.7, 1.0], glow: [0.52, 0.28, 1.0] }, hot: [0.93, 0.88, 1.0], tint: [0.58, 0.38, 1.0], star: 'arcane', dir: -1 },
};
const WARP_T = 1.5, LEVEL_T = 2.2;

export class AscendFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(57);
    this.core = new Ribbon(scene, camera, 1400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1400, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9;this.glow.mesh.renderOrder = 8;
    const geo = new THREE.CylinderGeometry(0.85, 0.65, 7, 28, 1, true).translate(0, 3.5, 0);geo.userData.shared = true;
    this.column = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uReveal: { value: 0 }, uDir: { value: 1 }, uHot: { value: new THREE.Color() }, uTint: { value: new THREE.Color() } },
      vertexShader: COLUMN_VS, fragmentShader: COLUMN_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.column.visible = false;this.column.renderOrder = 7;scene.add(this.column);
    const disc = new THREE.PlaneGeometry(1, 1, 8, 8);
    this.disc = new THREE.Mesh(disc, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: runeTexture() }, uA: { value: 0 }, uHot: { value: new THREE.Color() }, uTint: { value: new THREE.Color() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: DISC_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, // normal blending: keeps its colour on bright sand
    }));
    this.disc.rotation.x = -Math.PI / 2;this.disc.visible = false;this.disc.renderOrder = 6;scene.add(this.disc);
    this.starTex = { cold: starTexture('cold'), holy: starTexture('holy'), arcane: starTexture('arcane') };
    this.flareTex = { cold: flareTexture('cold'), holy: flareTexture('holy'), arcane: flareTexture('arcane') };
    this.stars = Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, this.starTex.holy, false, 12), p: new THREE.Vector3(), vy: 0, t: 9, life: 1, size: 0.3, spin: 0 }));
    this.starI = 0;
    this.flare = lightSprite(scene, this.flareTex.holy, true, 11);
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.helix = Array.from({ length: HELIX }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.p = new THREE.Vector3();this.v = new THREE.Vector3();
    this.sparks = [];this.free = [];
    this.kind = 'warp';this.look = LOOKS.warp;this.x = 0;this.z = 0;this.t = 9;this.time = 0;this.burst = false;
  }
  start(kind, x, z) {
    this.kind = kind;this.look = LOOKS[kind];this.x = x;this.z = z;this.t = 0;this.burst = false;
    const L = this.look, cu = this.column.material.uniforms, du = this.disc.material.uniforms;
    cu.uHot.value.setRGB(...L.hot);cu.uTint.value.setRGB(...L.tint);cu.uDir.value = L.dir;
    du.uHot.value.setRGB(...L.hot);du.uTint.value.setRGB(...L.tint);
    for (const s of this.stars) s.sp.material.map = this.starTex[L.star];
    this.flare.material.map = this.flareTex[L.star];
  }
  /** The hero has arrived at a waypoint. */
  warp(x, z) {
    this.start('warp', x, z);
    const r = this.rnd;
    // motes rise from the ground round the hero as the light lands
    for (let i = 0; i < 18; i++) {
      const a = r() * 6.283, d = 0.4 + r() * 1.2;
      this.p.set(x + Math.sin(a) * d, 0.1, z + Math.cos(a) * d);this.v.set(Math.sin(a) * 0.3, 1.6 + r() * 1.6, Math.cos(a) * 0.3);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.7 + r() * 0.5, 0.045, this.look.light);
    }
  }
  /** Character level (gold) or job level (violet). */
  levelUp(x, z, job = false) { this.start(job ? 'job' : 'level', x, z); }
  follow(x, z) { if (this.kind !== 'warp') { this.x = x;this.z = z; } }
  star(x, y, z, size, life, delay = 0, vy = -0.5) {
    const s = this.stars[this.starI++ % STARS];
    s.p.set(x, y, z);s.vy = vy;s.t = -delay;s.life = life;s.size = size;s.spin = (this.rnd() - 0.5) * 3;
  }
  // a helix of light round the hero from height y0 to y1, drawn up to fraction `to` of its length
  spiral(phase, turns, r0, r1, y0, y1, to, width, alpha) {
    const n = HELIX, L = this.look.light;
    for (let i = 0; i < n; i++) {
      const k = (i / (n - 1)) * to, a = phase + k * turns * Math.PI * 2, r = r0 + (r1 - r0) * k;
      this.helix[i].set(this.x + Math.cos(a) * r, y0 + (y1 - y0) * k, this.z + Math.sin(a) * r);
    }
    W.v = width;this.glow.strip(this.helix, helixGlowW, alpha * 0.55, L.glow);this.core.strip(this.helix, helixW, alpha, L.edge);
  }
  update(dt) {
    this.time += dt;
    this.core.begin();this.glow.begin();
    const T = this.kind === 'warp' ? WARP_T : LEVEL_T;
    if (this.t < T) {
      this.t += dt;
      if (this.kind === 'warp') this.updateWarp(this.t);else this.updateLevel(this.t);
    } else { this.column.visible = false;this.disc.visible = false;this.flare.visible = false; }
    // stars: pop with an overshoot, twinkle, drift, shrink away (Blessing's)
    for (const s of this.stars) {
      if (s.t >= s.life) { s.sp.visible = false;continue; }
      s.t += dt;if (s.t < 0) { s.sp.visible = false;continue; }
      const k = s.t / s.life, grow = Math.min(1, k * 6), size = s.size * (grow < 1 ? grow * 1.3 : 1.3 - 0.3 * Math.min(1, (k - 1 / 6) * 4)) * (1 - k * k) * (0.85 + 0.15 * Math.sin(s.t * 22));
      s.p.y += s.vy * dt;
      s.sp.visible = true;place(s.sp, s.p.x, s.p.y, s.p.z);s.sp.scale.setScalar(size);s.sp.material.rotation = s.spin * s.t;s.sp.material.opacity = 1;
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, this.kind === 'warp' ? 0 : 5);
    this.core.end();this.glow.end();
  }
  // the ground circle: blooms from `size0` to `size1`, turns, fades over its life
  drawDisc(t, life, size0, size1, peak) {
    const k = t / life;this.disc.visible = k >= 0 && k < 1;if (!this.disc.visible) return;
    const s = size0 + (size1 - size0) * out2(Math.min(1, k * 2.2));
    place(this.disc, this.x, 0, this.z);this.disc.scale.set(s, s, 1);this.disc.rotation.z = this.time * 0.6;conformPlane(this.disc, 0.05);
    this.disc.material.uniforms.uA.value = peak * Math.min(1, k * 8) * (1 - Math.pow(Math.max(0, (k - 0.55) / 0.45), 1.5));
  }
  drawColumn(t, reveal, hold, end, width) {
    const u = this.column.material.uniforms;this.column.visible = t < end;if (!this.column.visible) return;
    const sink = Math.max(0, (t - hold) / (end - hold));
    u.uReveal.value = Math.min(1, t / reveal);u.uT.value = this.time;u.uA.value = 1 - sink * sink;
    place(this.column, this.x, 0, this.z);this.column.scale.set(width * (1 - 0.75 * sink), 1, width * (1 - 0.75 * sink));
  }
  drawRing(t, life, r0, r1, y, w, alpha) {
    const k = t / life;if (k < 0 || k >= 1) return;const L = this.look.light;
    circlePoints(this.ring, this.x, this.z, r0 + (r1 - r0) * out2(k), y);
    W.v = w * (1 - 0.5 * k);this.glow.strip(this.ring, lineGlowW, 0.4 * alpha * (1 - k), L.glow);this.core.strip(this.ring, lineW, alpha * (1 - k * k), L.edge);
  }
  drawFlare(t, at, life, y, size) {
    const k = (t - at) / life;this.flare.visible = k > 0 && k < 1;if (!this.flare.visible) return;
    place(this.flare, this.x, y, this.z);this.flare.scale.setScalar(size * (0.5 + 0.5 * out2(Math.min(1, k * 4))) * (1 - 0.4 * k));this.flare.material.opacity = 1 - k * k;
  }
  updateWarp(t) {
    this.drawDisc(t, 1.35, 1.6, 4.2, 0.9);
    this.drawColumn(t, 0.16, 0.42, 0.9, 0.8);
    // two ribbons spiral down onto the hero, drawn in from the top, then drain into the ground
    const draw = Math.min(1, t / 0.32), fade = 1 - Math.max(0, (t - 0.35) / 0.4);
    if (fade > 0) for (let i = 0; i < 2; i++) this.spiral(i * Math.PI + this.time * 4, 1.6, 1.05, 0.35, 3.4 - 3.1 * Math.max(0, (t - 0.32) / 0.43), 0.15, draw, 0.12, fade);
    this.drawFlare(t, 0.14, 0.45, 1.1, 3.2);
    this.drawRing(t - 0.16, 0.6, 0.6, 3.2, 0.06, 0.14, 0.9);
    if (!this.burst && t > 0.18) {
      this.burst = true;const r = this.rnd;
      for (let i = 0; i < 6; i++) { const a = r() * 6.283, d = 0.5 + r() * 0.8;this.star(this.x + Math.sin(a) * d, 0.7 + r() * 1.6, this.z + Math.cos(a) * d, 0.32 + r() * 0.2, 0.6 + r() * 0.3, r() * 0.25, 0.4); }
    }
  }
  updateLevel(t) {
    this.drawDisc(t, 2.0, 1.2, 4.6, 1);
    // two ribbons climb round the hero to the top, then let go and fade there
    const climb = Math.min(1, t / 0.7), fade = 1 - Math.max(0, (t - 0.8) / 0.5);
    if (fade > 0) for (let i = 0; i < 2; i++) this.spiral(i * Math.PI - this.time * 3.2, 2.1, 0.95, 0.55, 0.1, 0.1 + 4.4 * climb, 1, 0.14, fade);
    this.drawColumn(t, 0.55, 1.0, 1.5, 0.75);
    this.drawFlare(t, 0.62, 0.55, 2.7, 4.2);
    this.drawRing(t - 0.62, 0.7, 0.6, 3.6, 0.06, 0.16, 1);
    this.drawRing(t - 0.78, 0.7, 0.6, 2.6, 0.06, 0.1, 0.6);
    if (!this.burst && t > 0.62) {
      this.burst = true;const r = this.rnd, L = this.look.light;
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + r() * 0.4, d = 0.7 + r() * 0.9;this.star(this.x + Math.sin(a) * d, 1.4 + r() * 2.0, this.z + Math.cos(a) * d, 0.4 + r() * 0.35, 0.8 + r() * 0.6, r() * 0.3, -0.5 - r() * 0.4); }
      // sparks thrown out from the top, falling
      for (let i = 0; i < 26; i++) {
        const a = r() * 6.283, s = 1.4 + r() * 2.2;this.p.set(this.x, 2.7, this.z);this.v.set(Math.sin(a) * s, 2.5 + r() * 2.5, Math.cos(a) * s);
        spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.6 + r() * 0.5, 0.05, L);
      }
    }
  }
  clear() {
    this.t = 9;this.column.visible = false;this.disc.visible = false;this.flare.visible = false;
    for (const s of this.stars) { s.t = s.life = 9;s.sp.visible = false; }
    for (const q of this.sparks) this.free.push(q);this.sparks.length = 0;
    this.core.begin();this.glow.begin();this.core.end();this.glow.end();
  }
  get busy() { return this.t < (this.kind === 'warp' ? WARP_T : LEVEL_T) || this.sparks.length > 0 || this.stars.some((s) => s.t < s.life); }
}
