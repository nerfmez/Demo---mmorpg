// Measured Riposte, in the bench's light-and-ribbon language. The guard (the rules' 'guardStance',
// 0.8 s) raises a curved pane of light in front of the hero over the guard's arc, following its
// facing: crisp cel rims, a glassy fill strongest at its foot, diagonal shine streaks sliding over it, popping up with
// a little overshoot and flickering out; a matching arc glows on the ground at its foot. An incoming strike shows as a red lunge streak; a strike the guard catches (the rules'
// 'playerHit' with blocked) sets off an anime clash: a big four-point star of light where blade meets
// blow (a second one turned 45 degrees behind it), a long thin glint across the contact, focus lines
// bursting out around it, a spray of hot metal sparks thrown back at the attacker, two upright shock
// rings and a ring on the ground, the guard wall breaking into shards and a hard camera shake. Then, for the rules' ready
// window, a gold ring pulses at the hero's feet and the blade glows gold: press again to counter. A
// strike that gets through flashes red on the hero. The counter itself is a gold crescent (slash-fx
// palette) with hard bursts on what it hits. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV } from './fx-common.js';

export const RIPOSTE_PALETTE = { hot: [1, 0.98, 0.9], body: [1.0, 0.82, 0.38], glow: [1.0, 0.6, 0.15] };
const EDGE = [0.8, 0.92, 1.0], GLOW = [0.35, 0.6, 1.0], GOLD = [1.0, 0.86, 0.4], GOLD_GLOW = [1.0, 0.58, 0.12], RED = [1.0, 0.3, 0.2], RED_GLOW = [0.9, 0.1, 0.05];
const BURSTS = 6, RAYS = 10, ARC_PTS = 15, RING_PTS = 25, SPARKS = 48, FOCUS = 14;
const WHITE = [1, 1, 0.96];
const PANE_R = 0.95, PANE_H = 1.75;
const PANE_FS = `varying vec2 vUv; uniform float uT; uniform float uA; uniform float uFlash;
  void main(){
    float sx = min(vUv.x, 1.0 - vUv.x), sy = min(vUv.y, 1.0 - vUv.y);
    float rim = 1.0 - smoothstep(0.0, 0.03, min(sx * 1.4, sy));            // crisp cel rim
    float lip = (1.0 - smoothstep(0.03, 0.12, min(sx * 1.4, sy))) * 0.35;  // soft inner edge
    float fill = mix(0.32, 0.06, vUv.y);                                     // glassy, stronger at the foot
    // two diagonal shine streaks sliding across the pane (anime glass)
    float d = vUv.x * 1.6 + vUv.y * 0.9 - mod(uT * 2.2, 3.2) + 0.6;
    float shine = smoothstep(0.09, 0.0, abs(d)) * 0.75 + smoothstep(0.035, 0.0, abs(d - 0.22)) * 0.55;
    float a = clamp(max(rim, fill + lip + shine), 0.0, 1.0) * uA;
    vec3 c = mix(vec3(0.5, 0.76, 1.0), vec3(1.0), clamp(rim * 0.9 + shine + uFlash, 0.0, 1.0));
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, min(1.0, a + uFlash * 0.5)); }`;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.97), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.4;
const arcW = (x) => stripW * Math.min(1, Math.sin(Math.PI * x) * 4), arcGlowW = (x) => arcW(x) * 2.4;
const taperW = (x) => stripW * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), taperGlowW = (x) => taperW(x) * 2.6;
const glintW = (x) => stripW * Math.pow(Math.sin(Math.PI * x), 3), sparkW = (x) => stripW * x;
const shardW = (x) => stripW * (x < 0.35 ? x / 0.35 : (1 - x) / 0.65);

export class RiposteFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 5000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 5000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    this.bursts = Array.from({ length: BURSTS }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; sp.renderOrder = 9; scene.add(sp);
      return { sp, t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), edge: EDGE, glow: GLOW, rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) };
    });
    // the clash star: a sharp four-point star with long thin spikes, white core, gold rim
    const sc = document.createElement('canvas'); sc.width = sc.height = 256;
    const sg = sc.getContext('2d');
    const star = (len, wide, col) => { sg.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = k % 2 ? wide : len; sg.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } sg.closePath(); sg.fillStyle = col; sg.fill(); };
    sg.shadowColor = 'rgba(255,170,40,0.9)'; sg.shadowBlur = 18;
    star(124, 20, 'rgba(255,196,70,1)'); sg.shadowBlur = 0; star(104, 13, 'rgba(255,240,190,1)'); star(70, 8, '#ffffff');
    const glow = sg.createRadialGradient(128, 128, 0, 128, 128, 40); glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = glow; sg.fillRect(0, 0, 256, 256);
    const starTex = new THREE.CanvasTexture(sc);
    this.stars = [0, 1].map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, depthWrite: false, depthTest: false, transparent: true, toneMapped: false })); sp.visible = false; sp.renderOrder = 11; scene.add(sp); return sp; });
    // the guard pane: a curved strip over the guard's arc (rebuilt when the arc changes)
    this.paneMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uFlash: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: PANE_FS });
    this.pane = new THREE.Mesh(new THREE.BufferGeometry(), this.paneMat); this.pane.renderOrder = 6; this.pane.visible = false; this.paneArc = 0; this.paneFlash = 0; scene.add(this.pane);
    this.clashT = 9; this.clash = new THREE.Vector3(); this.clashDir = new THREE.Vector3(); this.side = new THREE.Vector3();
    this.sparkPool = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 9, max: 1, w: 0 }));
    this.focus = Array.from({ length: FOCUS }, () => ({ d: new THREE.Vector3(), len: 1, w: 0 }));
    this.burstI = 0; this.guardT = 0; this.guardDur = 0; this.guardArc = 1.9; this.readyT = 0; this.readyDur = 0;
    this.lunges = []; this.rings = []; this.shards = []; this.rnd = mulberry32(37); this.t = 0;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; this.two = [new THREE.Vector3(), new THREE.Vector3()];
    this.pts = Array.from({ length: RING_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.u = new THREE.Vector3(); this.v = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.lungeAlive = (l) => l.t < 0.2; this.ringAlive = (r) => r.life < r.max; this.shardAlive = (s) => s.life < s.max;
    this.onShake = null;
  }
  burst(pos, dir, size, life, edge, glow) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd;
    b.t = 0; b.size = size; b.life = life; b.pos.copy(pos); b.edge = edge; b.glow = glow;
    b.sp.material.color.setRGB(0.5 + edge[0] * 0.5, 0.5 + edge[1] * 0.5, 0.5 + edge[2] * 0.5);
    b.rays.forEach((ray, k) => {
      if (k < 4) { ray.d.set(dir.x + (r() - 0.5) * 0.6, (r() - 0.3) * 0.6, dir.z + (r() - 0.5) * 0.6).normalize(); ray.len = size * (1.2 + r() * 0.6); }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.45 + r() * 0.35); }
    });
  }
  ring(c, normal, r0, r1, max, w, col, glowCol) { if (this.rings.length < 12) this.rings.push({ c: c.clone(), n: normal.clone(), r0, r1, life: 0, max, w, col, glowCol }); }
  // the rules' guardStance: duration, and the guard's arc in degrees
  guard(duration, arcDeg) {
    this.guardT = 0; this.guardDur = duration; this.guardArc = (arcDeg * Math.PI) / 180; this.readyT = this.readyDur = 0; this.paneFlash = 0;
    if (this.paneArc !== this.guardArc) { // CylinderGeometry: theta 0 points along +z (the hero's facing at rotation.y)
      this.pane.geometry.dispose();
      this.pane.geometry = new THREE.CylinderGeometry(PANE_R, PANE_R, PANE_H, 28, 1, true, -this.guardArc / 2, this.guardArc);
      this.paneArc = this.guardArc;
    }
  }
  // a strike coming in (bench): a red lunge streak from the attacker to the hero
  lunge(from, to) { this.lunges.push({ from: from.clone(), to: to.clone(), t: 0 }); }
  // the rules' playerHit: blocked opens the counter window (readyDuration)
  struck(hero, from, blocked, readyDuration) {
    this.dir.set(from.x - hero.x, 0, from.z - hero.z).normalize();
    const at = this.three[0].set(hero.x + this.dir.x * 0.75, 1.25, hero.z + this.dir.z * 0.75);
    if (blocked) {
      const r = this.rnd;
      this.clashT = 0; this.clash.copy(at); this.clashDir.copy(this.dir); this.side.set(this.dir.z, 0, -this.dir.x);
      this.burst(at, this.dir, 1.6, 0.34, GOLD, GOLD_GLOW);
      this.ring(at, this.dir, 0.1, 1.3, 0.22, 0.08, WHITE, GOLD_GLOW);
      this.ring(at, this.dir, 0.1, 2.1, 0.4, 0.04, GOLD, GOLD_GLOW);
      this.ring(this.three[1].set(hero.x, 0.05, hero.z), this.up, 0.3, 2.4, 0.4, 0.07, GOLD, GOLD_GLOW);
      // hot metal sparks, thrown back at the attacker and out to the sides
      for (const sp of this.sparkPool) {
        const back = r() < 0.7, a = (r() - 0.5) * (back ? 1.6 : 3.4), speed = 5 + r() * 7;
        const dx = this.dir.x * Math.cos(a) + this.side.x * Math.sin(a), dz = this.dir.z * Math.cos(a) + this.side.z * Math.sin(a);
        sp.p.copy(at); sp.v.set(dx * speed * (back ? 1 : 0.6), (r() - 0.2) * 5, dz * speed * (back ? 1 : 0.6));
        sp.life = 0; sp.max = 0.25 + r() * 0.3; sp.w = 0.025 + r() * 0.03;
      }
      // anime focus lines bursting out around the contact
      for (const f of this.focus) { const a = r() * 6.283; f.d.set(0, Math.cos(a), 0).addScaledVector(this.side, Math.sin(a)); f.len = 0.6 + r() * 0.9; f.w = 0.03 + r() * 0.04; }
      for (let i = 0; i < 14; i++) { // the guard wall breaks into shards
        const r = this.rnd, a = Math.atan2(this.dir.x, this.dir.z) + (r() - 0.5) * this.guardArc, h = 0.3 + r() * 1.5;
        this.shards.push({ p: new THREE.Vector3(hero.x + Math.sin(a) * PANE_R, h, hero.z + Math.cos(a) * PANE_R), v: new THREE.Vector3(Math.sin(a) * (1 + r() * 2), 1 + r() * 2, Math.cos(a) * (1 + r() * 2)), spin: r() * 6.28, rate: (r() - 0.5) * 18, len: 0.08 + r() * 0.08, life: 0, max: 0.4 + r() * 0.2 });
      }
      this.guardT = Math.max(this.guardT, this.guardDur - 0.12); this.paneFlash = 1; this.readyT = 0; this.readyDur = readyDuration; // the pane flashes white and breaks
      this.onShake?.(0.1, 0.22);
    } else this.burst(this.three[1].set(hero.x, 1.1, hero.z), this.dir, 0.9, 0.22, RED, RED_GLOW);
  }
  counter(hit) { this.readyT = this.readyDur; if (hit) this.onShake?.(0.06, 0.14); }
  hit(center, fromX, fromZ) {
    const dx = center.x - fromX, dz = center.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.dir.set(dx / l, 0, dz / l);
    this.burst(center, this.dir, 1.05, 0.28, GOLD, GOLD_GLOW);
  }
  // hero: {x, z, facing}; blade: [base, tip] world points of the sword
  update(dt, hero, bladeBase, bladeTip) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    const three = this.three, two = this.two;
    // guard: the pane of light in front (pops up with an overshoot, flickers out) and its arc on the ground
    if (this.guardT < this.guardDur) {
      this.guardT += dt;
      const t = this.guardT, end = this.guardDur - t, pop = Math.min(1, t / 0.1), over = pop < 1 ? pop * (1.15 - 0.15 * pop) : 1 + 0.06 * Math.exp(-(t - 0.1) * 18) * Math.cos((t - 0.1) * 40);
      const flick = end < 0.15 ? (Math.sin(t * 90) > -0.3 ? end / 0.15 : 0.2) : 1;
      this.pane.visible = true;
      place(this.pane, hero.x, PANE_H / 2 * over + 0.05, hero.z); this.pane.rotation.y = hero.facing; this.pane.scale.set(1, over, 1);
      this.paneMat.uniforms.uT.value = t; this.paneMat.uniforms.uA.value = flick * Math.min(1, t / 0.05); this.paneMat.uniforms.uFlash.value = this.paneFlash;
      this.paneFlash = Math.max(0, this.paneFlash - dt * 8);
      const sub = this.sub; sub.length = 0;
      for (let i = 0; i < ARC_PTS; i++) { const a = hero.facing - this.guardArc / 2 + (i / (ARC_PTS - 1)) * this.guardArc; this.pts[i].set(hero.x + Math.sin(a) * PANE_R, 0.05, hero.z + Math.cos(a) * PANE_R); sub.push(this.pts[i]); }
      stripW = 0.07; this.glow.strip(sub, arcGlowW, 0.9 * flick, GLOW); this.core.strip(sub, arcW, flick, EDGE);
    } else this.pane.visible = false;
    // counter window: a gold ring pulsing at the feet and a gold blade
    if (this.readyT < this.readyDur) {
      this.readyT += dt;
      const fade = Math.min(1, (this.readyDur - this.readyT) / 0.2), pulse = 0.8 + 0.2 * Math.sin(this.t * 14), sub = this.sub; sub.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; this.pts[i].set(hero.x + Math.sin(a) * 0.7, 0.05, hero.z + Math.cos(a) * 0.7); sub.push(this.pts[i]); }
      stripW = 0.06 * pulse; this.glow.strip(sub, lineGlowW, 0.8 * fade, GOLD_GLOW); this.core.strip(sub, lineW, fade, GOLD);
      two[0].copy(bladeBase); two[1].copy(bladeTip);
      stripW = 0.07 * pulse; this.glow.strip(two, lineGlowW, 0.9 * fade, GOLD_GLOW); this.core.strip(two, lineW, 0.8 * fade, GOLD);
    }
    for (const l of this.lunges) {
      l.t += dt;
      const u = l.t / 0.2, head = Math.min(1, l.t / 0.08);
      three[0].copy(l.from).lerp(l.to, Math.max(0, head - 0.5)); three[2].copy(l.from).lerp(l.to, head); three[1].copy(three[0]).lerp(three[2], 0.5);
      stripW = 0.12 * (1 - u);
      this.glow.strip(three, taperGlowW, 0.9 * (1 - u), RED_GLOW); this.core.strip(three, taperW, 1 - u, RED);
    }
    compact(this.lunges, this.lungeAlive);
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      b.sp.visible = k < 1;
      if (!b.sp.visible) continue;
      placeV(b.sp, b.pos); b.sp.scale.setScalar(b.size * (0.9 + 1.4 * Math.sqrt(k))); b.sp.material.opacity = 1 - k * k;
      const out = Math.min(1, k * 3.5), inner = Math.max(0, k * 1.4 - 0.3);
      for (const ray of b.rays) {
        three[0].copy(b.pos).addScaledVector(ray.d, ray.len * inner * 0.9); three[2].copy(b.pos).addScaledVector(ray.d, ray.len * out); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.08 * b.size * (1 - k * 0.6);
        this.glow.strip(three, taperGlowW, 0.8 * (1 - k), b.glow); this.core.strip(three, taperW, 1 - k * k, b.edge);
      }
    }
    for (const g of this.rings) {
      g.life += dt;
      const u = g.life / g.max;
      if (u >= 1) continue;
      const rad = g.r0 + (g.r1 - g.r0) * (1 - (1 - u) * (1 - u)), sub = this.sub; sub.length = 0;
      if (g.n.y > 0.9) { this.u.set(1, 0, 0); this.v.set(0, 0, 1); } // flat on the ground
      else { this.u.crossVectors(g.n, this.up).normalize(); this.v.crossVectors(g.n, this.u).normalize(); }
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; this.pts[i].copy(g.c).addScaledVector(this.u, Math.cos(a) * rad).addScaledVector(this.v, Math.sin(a) * rad); sub.push(this.pts[i]); }
      stripW = g.w * (1 - u * 0.5);
      this.glow.strip(sub, lineGlowW, 0.8 * (1 - u), g.glowCol); this.core.strip(sub, lineW, 1 - u, g.col);
    }
    compact(this.rings, this.ringAlive);
    for (const s of this.shards) {
      s.life += dt; s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt); s.spin += s.rate * dt;
      const u = s.life / s.max;
      if (u >= 1) continue;
      const cx = Math.cos(s.spin) * s.len, cy = Math.sin(s.spin) * s.len;
      three[0].set(s.p.x - cx, s.p.y - cy, s.p.z); three[2].set(s.p.x + cx, s.p.y + cy, s.p.z); three[1].copy(three[0]).lerp(three[2], 0.35);
      stripW = 0.08 * (1 - u * 0.5);
      this.glow.strip(three, shardW, 0.5 * (1 - u), GLOW); this.core.strip(three, shardW, 1 - u * u, EDGE);
    }
    compact(this.shards, this.shardAlive);
    // the clash: star, glint, focus lines, sparks
    if (this.clashT < 0.6) {
      this.clashT += dt;
      const t = this.clashT, c = this.clash;
      const pop = t < 0.04 ? t / 0.04 : Math.max(0, 1 - (t - 0.04) / 0.26);
      this.stars.forEach((st, k) => {
        st.visible = pop > 0.01;
        if (!st.visible) return;
        placeV(st, c); st.scale.setScalar((k ? 1.3 : 2.4) * (0.4 + 0.6 * pop) * (t < 0.04 ? 1.4 - 0.4 * pop : 1));
        st.material.rotation = (k ? Math.PI / 4 : 0) + t * (k ? -2 : 1.5); st.material.opacity = Math.min(1, pop * 1.4);
      });
      if (t < 0.2) { // a long thin glint across the contact
        const u = t / 0.2, half = 1.8 * (0.5 + u);
        three[0].copy(c).addScaledVector(this.side, -half); three[2].copy(c).addScaledVector(this.side, half); three[1].copy(c);
        stripW = 0.09 * (1 - u); this.glow.strip(three, taperGlowW, 1 - u, GOLD_GLOW); this.core.strip(three, glintW, 1 - u * u, WHITE);
        three[0].copy(c); three[0].y -= half * 0.45; three[2].copy(c); three[2].y += half * 0.45; three[1].copy(c);
        stripW = 0.05 * (1 - u); this.core.strip(three, glintW, 1 - u, WHITE);
      }
      if (t < 0.16) { // focus lines
        const u = t / 0.16;
        for (const f of this.focus) {
          three[0].copy(c).addScaledVector(f.d, 0.5 + u * 0.9); three[2].copy(c).addScaledVector(f.d, 0.5 + u * 0.9 + f.len * (1 - u * 0.5)); three[1].copy(three[0]).lerp(three[2], 0.3);
          stripW = f.w * (1 - u); this.core.strip(three, shardW, 1 - u, WHITE);
        }
      }
    } else for (const st of this.stars) st.visible = false;
    for (const sp of this.sparkPool) {
      if (sp.life >= sp.max) continue;
      sp.life += dt; sp.v.y -= 14 * dt; sp.v.multiplyScalar(1 - 2.5 * dt); sp.p.addScaledVector(sp.v, dt);
      const u = sp.life / sp.max;
      three[2].copy(sp.p); three[0].copy(sp.p).addScaledVector(sp.v, -0.035); three[1].copy(three[0]).lerp(three[2], 0.5);
      stripW = sp.w * (1 - u * 0.5);
      this.glow.strip(three, lineGlowW, 0.8 * (1 - u), GOLD_GLOW); this.core.strip(three, sparkW, 1 - u * u, u < 0.3 ? WHITE : GOLD);
    }
    this.core.end(); this.glow.end();
  }
  get ready() { return this.readyT < this.readyDur; }
  clear() {
    this.guardT = this.guardDur = 0; this.readyT = this.readyDur = 0; this.pane.visible = false;
    for (const b of this.bursts) { b.t = 9; b.sp.visible = false; }
    this.clashT = 9; for (const st of this.stars) st.visible = false; for (const sp of this.sparkPool) sp.life = sp.max;
    this.lunges.length = 0; this.rings.length = 0; this.shards.length = 0;
  }
}
