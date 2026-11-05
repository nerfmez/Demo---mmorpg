// The Pearlshell Grotto's attacks (docs/MONSTER-ATTACKS.md), cosmetic only, drawn from core state and events. Each
// shows the ground it hurts while it hurts (owner, 2026-11-05):
// - Pearl fish gulp (core act m.suck): a cone of water streaming into its mouth over the ground it pulls from, drops
//   flying in along it, the ring before its mouth where the jaws shut lit brighter as the snap nears; a jaw of water
//   shuts there on the snap.
// - Pearl fish tail wave (core shockwave, look wave): a curling crest of water rolling out across its cone, foam
//   along its lip, spray thrown ahead and foam left behind; it breaks over whoever it reaches.
// - Pearl slug stingers (core projectiles, homing): small violet jellies of light, pulsing, tendrils trailing, a ring
//   on the ground under each the size of its touch.
// - Pearl slug acid skin (core acidSkin, acidSquirt): its skin froths yellow-green, a ring round it at the reach it
//   answers blows from; each answer a squirt of acid arcing onto the striker and splashing there.
// - Pearl slug surge and the snail king's slime (core areas mucus, pearl_slime): one ribbon along each trail, not a
//   row of puddles. The slug's is dark and toxic, bubbling, fuming; the king's a wide glaze of mother-of-pearl, its
//   colours sliding, glints on it and sticky strands at the feet of whoever wades in it.
// - Eye clam gaze (wind-up, core gaze): a fan of hypnotic light grows from its eye over the cone; an eye opens over
//   the hero while they face it (their cue to turn away); the flash whites the cone out, and who it held stands in a
//   turning ring of light.
// - Eye clam nacre (core nacre, nacreHit): a pearly coat round the shell, dimming as it is worn down, flakes and
//   cracks of light at each blow; broken it bursts into shards and the bare eye glows; held, it sinks back in.
// - Snail king grind (core act m.grind): its lane glows on the ground and a bar of rasping light runs up and down it
//   with the head, throwing nacre chips; each pass flashes the lane and scores what it caught.
// - Snail king eggs (core areas pearl_egg): pearls thrown from its shell that land and pulse, a warning filling out
//   to their burst; a small bright ring on each is where to step to break it.
// - Snail king spiral (core areas pearl_burst under withdraw): each marked pearl bursts up as a column of light.
// Pooled; no allocation per frame.
import * as THREE from 'three';
import { lightSprite, glowTexture, bubbleTexture } from './light-kit.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const DEG = Math.PI / 180;
const WATER = 0x7fd8ff, FOAM = 0xf2fdff, ACID = 0xc8ff5a, STING = 0x9a5cff, NACRE = [0xfff2f8, 0xffd8ec, 0xd8f4ff];
const GAZE = 0xffd27a, PEARL = 0xffe6c0;
const JAW_WATER = { core: [0.93, 0.99, 1.0], glow: [0.3, 0.72, 1.0] }; // a stroke's display colours (companion-fx)

/** A canvas texture made once, shared. */
const TEX = new Map();
function canvasTex(key, w, h, draw, wrap = false) {
  let t = TEX.get(key);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c); t.userData.shared = true;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  TEX.set(key, t);
  return t;
}
/** Streaks along v (the radius), soft at the cone's sides (u): water flowing, or rays of light. */
const streakTex = (key, n, len) => canvasTex(key, 64, 256, (g, w, h) => {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, l = h * len * (0.5 + r()), lw = 1 + r() * 2.5;
    const gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, y, lw, l); g.fillRect(x, y - h, lw, l); // wraps along v
  }
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)'); side.addColorStop(0.15, 'rgba(0,0,0,1)'); side.addColorStop(0.85, 'rgba(0,0,0,1)'); side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side; g.fillRect(0, 0, w, h);
}, true);
/** A plain fill, soft at the sides (u) and brightest toward v = 1. */
const bandTex = () => canvasTex('grotto-band', 64, 128, (g, w, h) => {
  const along = g.createLinearGradient(0, h, 0, 0);
  along.addColorStop(0, 'rgba(255,255,255,0.35)'); along.addColorStop(0.7, 'rgba(255,255,255,0.75)'); along.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = along; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const across = g.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(0.12, 'rgba(0,0,0,1)'); across.addColorStop(0.88, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = across; g.fillRect(0, 0, w, h);
});
/** A rasp: a row of hooked teeth of light (the radula), soft at its ends. */
const teethTex = () => canvasTex('grotto-teeth', 256, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.1, 'rgba(255,255,255,1)'); gr.addColorStop(0.9, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, h * 0.62);
  for (let i = 0; i < 14; i++) { const x = (i / 14) * w; g.lineTo(x + w / 28, h * 0.05); g.lineTo(x + w / 14, h * 0.62); }
  g.lineTo(w, h * 0.8); g.lineTo(0, h * 0.8); g.closePath(); g.fill();
});
/** An almond eye drawn with lines: the cue that the hero is looking at the clam. */
const eyeTex = () => canvasTex('grotto-eye', 128, 64, (g, w, h) => {
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(8, h / 2); g.quadraticCurveTo(w / 2, -h * 0.25, w - 8, h / 2); g.quadraticCurveTo(w / 2, h * 1.25, 8, h / 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.2, 0, Math.PI * 2); g.fill();
});

/** A flat sector (XZ) of unit radius, `arc` wide, about +Z; uv.x across it, uv.y out along the radius. */
function sectorGeo(arc, r0 = 0, segs = 24) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = (u - 0.5) * arc;
    pos.push(Math.sin(a) * r0, 0, Math.cos(a) * r0, Math.sin(a), 0, Math.cos(a));
    uv.push(u, 0, u, 1);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.shared = true;
  return g;
}
const basic = (color, opacity, opts = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, ...opts });
function decal(scene, geo, mat, order = 7) { const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = order; m.frustumCulled = false; scene.add(m); return m; }

// the trails (slug mucus, king slime): one strip each, its numbers in uniforms (one program for both looks)
const TRAIL_VS = `attribute float aA; varying vec2 vUv; varying float vA; varying vec3 vW;
void main(){ vUv=uv; vA=aA; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const TRAIL_FS = `uniform float uT; uniform float uLook; uniform vec3 uA; uniform vec3 uB; uniform vec3 uRim;
varying vec2 vUv; varying float vA; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
void main(){
  float across = abs(vUv.x * 2.0 - 1.0);
  float edge = 1.0 - smoothstep(0.78, 1.0, across + 0.12 * (n(vW.xz * 3.0) - 0.5));
  if (edge <= 0.01) discard;
  float rim = smoothstep(0.55, 0.85, across) * edge;
  float flow = n(vW.xz * 1.6 + vec2(uT * 0.15, -uT * 0.1)) * 0.6 + n(vW.xz * 4.0 - uT * 0.3) * 0.4;
  vec3 c;
  float a;
  if (uLook < 0.5) {
    // toxic mucus: dark wet slime, cells of poison bubbling up through it
    vec2 cell = vW.xz * 5.0; vec2 id = floor(cell); vec2 f = fract(cell) - 0.5;
    float ph = fract(h(id) + uT * (0.4 + 0.5 * h(id + 3.1)));
    float bub = (1.0 - smoothstep(0.08, 0.1 + 0.25 * ph, length(f))) * step(0.55, h(id + 7.7)) * (1.0 - ph);
    c = mix(uA, uB, flow * 0.7) + uRim * rim * 0.9 + vec3(0.75, 1.0, 0.35) * bub;
    a = (0.82 + 0.15 * rim) * edge;
  } else {
    // pearl slime: a glaze whose colours slide like nacre, bright streaks of sheen moving on it
    float hue = flow * 2.0 + vW.x * 0.35 + vW.z * 0.25 + uT * 0.12;
    vec3 iri = 0.62 + 0.3 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    float sheen = pow(max(0.0, sin((vW.x + vW.z) * 2.2 - uT * 1.4 + flow * 3.0)), 12.0);
    c = mix(uA, iri, 0.55) + vec3(1.0) * sheen * 0.6 + uRim * rim;
    a = (0.55 + 0.25 * flow + 0.2 * rim) * edge;
  }
  gl_FragColor = vec4(c, a * vA);
}`;
const TRAIL_PTS = 40;

export class GrottoFx {
  constructor(scene, host, companion, call, monster) {
    this.scene = scene; this.host = host; this.companion = companion; this.call = call; this.monster = monster;
    this.time = 0;
    this.later = []; // acid splashes waiting for their squirt to land: { t, x, z }
    // --- the fish's gulp: the cone it draws from, and the ring before its mouth where the jaws shut ---
    this.gulpCone = decal(scene, sectorGeo(70 * DEG, 0.12), basic(WATER, 0.6, { map: streakTex('grotto-flow', 70, 0.35) }));
    this.gulpFill = decal(scene, sectorGeo(70 * DEG, 0.12), basic(0x2a8cc8, 0.18, { map: bandTex() }));
    const ring = new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2); ring.userData.shared = true;
    const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2); disc.userData.shared = true;
    this.ringGeo = ring; this.discGeo = disc;
    const thin = new THREE.RingGeometry(0.965, 1, 64).rotateX(-Math.PI / 2); thin.userData.shared = true;
    this.gulpRing = decal(scene, ring, basic(0x6ad0ff, 0.8), 8);
    this.gulpDisc = decal(scene, disc, basic(0x5ac8ff, 0.2), 7);
    this.gulpOn = null; // the fish sucking
    // --- the fish's tail wave: crests rebuilt each frame (5 rows across the crest's profile x WAVE_N+1 columns) ---
    this.waves = Array.from({ length: 2 }, () => this.makeCrest());
    this.waveHit = new Set();
    // --- the slug's stingers ---
    const glow = glowTexture('poison'), bub = bubbleTexture();
    this.stingers = Array.from({ length: 6 }, () => {
      const core = lightSprite(scene, glow, true, 10), bell = lightSprite(scene, bub, true, 11), shade = decal(scene, ring, basic(STING, 0.55), 7);
      core.material.color.setHex(STING); bell.material.color.setHex(0xc9a6ff);
      return { core, bell, shade, ph: Math.random() * 6.28 };
    });
    // --- the slug's acid skin ---
    this.acid = new Map(); // id -> { t, delay, duration, reach, halo, ring, fill }
    this.acidHalos = Array.from({ length: 3 }, () => { const h = lightSprite(scene, glowTexture('poison'), true, 9); h.material.color.setHex(ACID); return h; });
    this.acidRings = Array.from({ length: 3 }, () => decal(scene, ring, basic(ACID, 0.6), 8));
    this.acidFills = Array.from({ length: 3 }, () => decal(scene, disc, basic(0x7ac83a, 0.1), 7));
    // --- trails: the slug's mucus and the king's slime ---
    this.trailMats = [0, 1].map((look) => new THREE.ShaderMaterial({
      vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uLook: { value: look }, uA: { value: new THREE.Color(look ? 0xf4ead8 : 0x1e5a58) }, uB: { value: new THREE.Color(look ? 0xffffff : 0x4a2a78) }, uRim: { value: new THREE.Color(look ? 0xfff6e6 : 0x6ae8b0) } },
    }));
    this.trails = Array.from({ length: 4 }, () => this.makeTrail());
    this.trailPts = [];
    // --- the clam's gaze ---
    this.gazeCone = decal(scene, sectorGeo(56 * DEG, 0.06), basic(GAZE, 0.5, { map: streakTex('grotto-rays', 40, 0.6) }));
    this.gazeFill = decal(scene, sectorGeo(56 * DEG, 0.06), basic(0xb07aff, 0.2, { map: bandTex() }));
    this.gazeFlash = 0; this.gazeAt = { x: 0, z: 0, a: 0, R: 1 };
    this.gazeGlow = lightSprite(scene, glowTexture('fire'), true, 10); this.gazeGlow.material.color.setHex(0xffe0a0); this.gazeGlow.visible = false;
    this.eyeMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex(), color: GAZE, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    this.eyeMark.visible = false; this.eyeMark.renderOrder = 12; scene.add(this.eyeMark);
    this.holds = Array.from({ length: 3 }, () => ({ m: decal(scene, new THREE.RingGeometry(0.7, 0.82, 40, 1, 0, Math.PI * 1.5).rotateX(-Math.PI / 2), basic(0xd8b0ff, 0.8), 9), t: 9, x: 0, z: 0 }));
    // --- the clam's nacre ---
    this.nacre = new Map(); // id -> { left, t, halo, shell }
    this.nacreShells = Array.from({ length: 3 }, () => { const s = lightSprite(scene, bub, true, 11); s.material.color.setHex(0xffeef6); return s; });
    this.nacreHalos = Array.from({ length: 3 }, () => { const h = lightSprite(scene, glowTexture('cold'), true, 9); h.material.color.setHex(0xffd8ec); return h; });
    this.bare = new Map(); // id -> t (cracked open: its eye glows)
    this.bareGlows = Array.from({ length: 3 }, () => { const h = lightSprite(scene, glowTexture('fire'), true, 10); h.material.color.setHex(0xff6a9a); return h; });
    // --- the king's grind ---
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    this.grindLane = decal(scene, lane, basic(0xff9ac0, 0.4, { map: bandTex() }));
    const bar = new THREE.PlaneGeometry(1, 0.45).rotateX(-Math.PI / 2); bar.userData.shared = true;
    this.grindBar = decal(scene, bar, basic(0xffd0e4, 0.95, { map: teethTex() }), 8);
    this.grindFlash = 0;
    // --- the king's eggs ---
    this.eggGeo = new THREE.SphereGeometry(0.26, 14, 10).scale(1, 1.25, 1); this.eggGeo.userData.shared = true;
    const eggMat = new THREE.MeshBasicMaterial({ color: PEARL, toneMapped: false }); eggMat.userData.shared = true;
    this.eggs = Array.from({ length: 6 }, () => ({
      egg: (() => { const m = new THREE.Mesh(this.eggGeo, eggMat); m.visible = false; m.renderOrder = 9; scene.add(m); return m; })(),
      glow: (() => { const h = lightSprite(scene, glowTexture('cold'), true, 10); h.material.color.setHex(0xffc8e0); return h; })(),
      fill: decal(scene, disc, basic(0xff5a7a, 0.25, { blending: THREE.NormalBlending }), 6),
      edge: decal(scene, thin, basic(0xff7a8a, 0.8, { blending: THREE.NormalBlending }), 7),
      step: decal(scene, ring, basic(0xffffff, 0.9), 8),
      id: -1,
    }));
    // --- the king's spiral pearls: columns of light ---
    this.columns = Array.from({ length: 14 }, () => { const s = lightSprite(scene, glowTexture('cold'), true, 10); s.material.color.setHex(0xffe6f2); return { s, t: 9, x: 0, z: 0 }; });
    this.colI = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  bone(id, name, out) { const b = this.host.monsterRig?.(id)?.bones?.[name]; if (!b) return null; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }

  // ---------- events ----------

  /** The fish's gulp (its snap), the king's grind passes; true when drawn here. */
  swing(e, g) {
    if (e.type === 'pearl_fish' && e.name === 'gulp') {
      const m = g.monsterById?.(e.id), r = m?.r ?? 0.6, x = e.x + Math.sin(e.angle) * (r + 0.4), z = e.z + Math.cos(e.angle) * (r + 0.4), y = this.gy(x, z) + 0.45;
      // a jaw of water slams shut: two curved strokes of water meeting, droplets bursting off
      const c = this.companion; c.axes();
      _a.set(x, y, z);
      for (const sg of [1, -1]) {
        c.stroke(_a, -0.5, 0.32 * sg, 0.5, 0.32 * sg, -0.22 * sg, 0.07, JAW_WATER, 0.28, 0.05, 0, null);
        c.stroke(_a, -0.5, 0.32 * sg, -0.62, 0.02 * sg, 0.05 * sg, 0.05, JAW_WATER, 0.24, 0.05, 0.02, null);
      }
      c.glint(x, y, z, 0.9, 0.06);
      const fx = this.fx;
      if (fx) for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283; fx.add(x, y, z, Math.sin(a) * 2.2, 1.2 + Math.random() * 1.5, Math.cos(a) * 2.2, { color: i % 3 ? WATER : FOAM, size: 0.13, sizeEnd: 0.04, life: 0.45, gravity: 9, drag: 1 }); }
      this.call.ring(x, y - 0.4, z, 1.6, new THREE.Color(0x8fdcff), 0.35);
      if (e.at) this.monster.waterCrown(e.at[0], e.at[1]);
      this.monster.onShake?.(e.at ? 0.08 : 0.03, 0.08);
      return true;
    }
    if (e.type === 'pearl_snail_king' && e.name === 'grind') {
      this.grindFlash = 1;
      if (e.at) {
        // the radula scores what it caught: rasp marks of nacre light
        this.companion.axes();
        _a.set(e.at[0], this.gy(e.at[0], e.at[1]) + 0.7, e.at[1]);
        this.companion.rake(_a, e.hit % 2 ? 1 : -1, 3, 0.45, 0.8, 0.2, new THREE.Color(0xff6aa0), new THREE.Color(0xfff2f8), 0);
        this.monster.onShake?.(0.05, 0.06);
      }
      return true;
    }
    return false;
  }

  /** A grotto monster's own events; true when drawn here. */
  event(e, g) {
    switch (e.type) {
      case 'acidSkin': {
        const r = this.host.monsterRig?.(e.id); if (r) r.acidT = e.delay + e.duration;
        this.acid.set(e.id, { t: 0, delay: e.delay, duration: e.duration, reach: e.reach });
        return true;
      }
      case 'acidSquirt': this.squirt(e, g); return true;
      case 'gaze': this.flashGaze(e, g); return true;
      case 'nacre': {
        if (e.coat) this.nacre.set(e.id, { left: 1, t: 0, hit: 0 });
        else { this.nacre.delete(e.id); if (e.broken) this.crack(e); else this.held(e); }
        return true;
      }
      case 'nacreHit': {
        const n = this.nacre.get(e.id); if (n) { n.left = e.left; n.hit = 1; }
        this.flake(e);
        return true;
      }
      case 'eggCrush': this.eggCrush(e); return true;
      case 'withdraw': return true;
    }
    return false;
  }

  /** A marked area of these monsters went off (core burst with its source); true when drawn here. */
  burst(e) {
    if (e.kind === 'pearl_egg') { this.eggBurst(e); return true; }
    if (e.kind === 'pearl_burst') { this.pearlColumn(e); return true; }
    return false;
  }

  /** A stinger touches what it drifted after (core impact): a pop of violet light, stinging sparks. */
  sting(e) {
    const y = this.gy(e.x, e.z) + 0.9, fx = this.fx;
    if (fx) for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; fx.add(e.x, y, e.z, Math.sin(a) * 2, 0.6 + Math.random(), Math.cos(a) * 2, { color: i % 2 ? STING : 0xf0e6ff, size: 0.12, sizeEnd: 0.03, life: 0.35, drag: 2 }); }
    this.companion.glint(e.x, y, e.z, 0.9, 0);
    this.call.ring(e.x, y - 0.8, e.z, 0.9, new THREE.Color(STING), 0.3);
  }

  /** The slug's acid squirts back at the striker: an arc of acid blobs, a splash where it lands. */
  squirt(e) {
    const y0 = this.gy(e.x, e.z) + 0.9, ty = this.gy(e.tx, e.tz) + 0.7, T = 0.3, G = 12, fx = this.fx;
    const vx = (e.tx - e.x) / T, vz = (e.tz - e.z) / T, vy = (ty - y0) / T + (G * T) / 2;
    if (fx) for (let i = 0; i < 22; i++) {
      const j = 0.8 + Math.random() * 0.4;
      fx.add(e.x + (Math.random() - 0.5) * 0.2, y0, e.z + (Math.random() - 0.5) * 0.2, vx * j, vy * j, vz * j, { color: i % 3 ? ACID : 0xf4ffc0, size: 0.2 + Math.random() * 0.14, sizeEnd: 0.1, life: T * 1.4, gravity: G, drag: 0 });
    }
    const q = this.later.find((l) => l.t <= 0) || (this.later.length < 8 ? (this.later[this.later.length] = { t: 0, x: 0, z: 0 }) : this.later[0]);
    Object.assign(q, { t: T, x: e.tx, z: e.tz }); // the splash as it lands
  }
  acidSplash(x, z) {
    const y = this.gy(x, z) + 0.6, fx = this.fx, dust = this.host.vfx?.dust;
    if (fx) for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; fx.add(x, y, z, Math.sin(a) * 1.8, 1 + Math.random(), Math.cos(a) * 1.8, { color: i % 2 ? ACID : 0x9ae04a, size: 0.14, sizeEnd: 0.05, life: 0.4, gravity: 8, drag: 1 }); }
    if (dust) for (let i = 0; i < 3; i++) dust.add(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, 0, 0.6, 0, { color: 0xd8f0a0, size: 0.4, sizeEnd: 0.9, life: 0.6, drag: 2, alpha: 0.5 });
    this.call.ring(x, y - 0.55, z, 1.0, new THREE.Color(0xb8f04a), 0.3);
  }

  /** The clam's gaze goes off: the cone whites out; who it held stands in a turning ring of light. */
  flashGaze(e) {
    this.gazeFlash = 1;
    Object.assign(this.gazeAt, { x: e.x, z: e.z, a: e.angle, R: e.range });
    for (const [x, z] of e.at || []) {
      const h = this.holds.find((q) => q.t >= 1.2) || this.holds[0];
      Object.assign(h, { t: 0, x, z });
      this.companion.glint(x, this.gy(x, z) + 1.3, z, 1.1, 0);
    }
    if (e.at?.length) this.monster.onShake?.(0.06, 0.08);
  }

  /** A blow on the nacre coat: flakes of nacre off it and a crack of light across the shell. */
  flake(e) {
    const r = this.host.monsterRig?.(e.id), y = this.gy(e.x, e.z) + 0.7, fx = this.fx;
    if (fx) for (let i = 0; i < 7; i++) { const a = Math.random() * 6.283; fx.add(e.x + Math.sin(a) * 0.7, y + Math.random() * 0.4, e.z + Math.cos(a) * 0.7, Math.sin(a) * 2, 1 + Math.random() * 1.5, Math.cos(a) * 2, { color: NACRE[i % 3], size: 0.12, sizeEnd: 0.03, life: 0.4, gravity: 8, drag: 1 }); }
    if (r) {
      this.companion.axes();
      const a = (Math.random() - 0.5) * 1.6;
      this.companion.clawFx.mark(e.x, y + 0.1, e.z, 0.5, 0.6, a, Math.random() < 0.5 ? 1 : -1, new THREE.Color(0xffa8d0), new THREE.Color(0xffffff), 0, 0.28);
    }
  }
  /** The coat breaks: it bursts into shards and the bare eye glows while it is stunned. */
  crack(e) {
    const y = this.gy(e.x, e.z) + 0.8, fx = this.fx;
    if (fx) for (let i = 0; i < 28; i++) { const a = Math.random() * 6.283, sp = 3 + Math.random() * 3; fx.add(e.x, y, e.z, Math.sin(a) * sp, 2 + Math.random() * 3, Math.cos(a) * sp, { color: NACRE[i % 3], size: 0.2, sizeEnd: 0.05, life: 0.6, gravity: 10, drag: 1 }); }
    for (let i = 0; i < 3; i++) this.companion.glint(e.x + (Math.random() - 0.5), y + Math.random() * 0.5, e.z + (Math.random() - 0.5), 1.2, i * 0.05);
    this.call.ring(e.x, y - 0.7, e.z, 2.6, new THREE.Color(0xffc8e0), 0.45);
    this.bare.set(e.id, 0);
    this.monster.onShake?.(0.12, 0.12);
  }
  /** The coat held: it sinks back into the shell in a glitter. */
  held(e) {
    const y = this.gy(e.x, e.z) + 0.8, fx = this.fx;
    if (fx) for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283, R = 1.3; fx.add(e.x + Math.sin(a) * R, y + Math.random() * 0.6, e.z + Math.cos(a) * R, -Math.sin(a) * 2.4, 0.3, -Math.cos(a) * 2.4, { color: i % 2 ? 0xfff2c8 : 0xffd8ec, size: 0.14, sizeEnd: 0.04, life: 0.5, drag: 0.5 }); }
  }

  /** An egg stepped on: its shell breaks with a crunch of nacre and a puff, harmlessly. */
  eggCrush(e) {
    const y = this.gy(e.x, e.z) + 0.25, fx = this.fx;
    if (fx) for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; fx.add(e.x, y, e.z, Math.sin(a) * 1.6, 1 + Math.random(), Math.cos(a) * 1.6, { color: NACRE[i % 3], size: 0.11, sizeEnd: 0.03, life: 0.4, gravity: 10, drag: 1 }); }
    this.companion.glint(e.x, y + 0.2, e.z, 0.9, 0);
    this.call.ring(e.x, y - 0.2, e.z, 1.0, new THREE.Color(0xffffff), 0.3);
  }
  /** An egg left alone bursts over its whole radius: a ring to its edge, poison puffs, nacre shards. */
  eggBurst(e) {
    const y = this.gy(e.x, e.z), fx = this.fx, dust = this.host.vfx?.dust, R = e.radius || 3;
    this.call.ring(e.x, y + 0.08, e.z, R, new THREE.Color(0xff7ab0), 0.5);
    if (fx) for (let i = 0; i < 24; i++) { const a = Math.random() * 6.283, sp = 2 + Math.random() * 4; fx.add(e.x, y + 0.4, e.z, Math.sin(a) * sp, 2.5 + Math.random() * 2, Math.cos(a) * sp, { color: i % 3 ? 0xd890ff : NACRE[i % 3], size: 0.2, sizeEnd: 0.05, life: 0.6, gravity: 9, drag: 1 }); }
    if (dust) for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283, d = R * (0.3 + 0.5 * Math.random()); dust.add(e.x + Math.sin(a) * d, y + 0.3, e.z + Math.cos(a) * d, Math.sin(a) * 0.8, 0.6, Math.cos(a) * 0.8, { color: 0xc8a0f0, size: 0.9, sizeEnd: 1.8, life: 0.9, drag: 2, alpha: 0.55 }); }
    this.companion.glint(e.x, y + 0.6, e.z, 1.6, 0);
    this.monster.onShake?.(0.12, 0.12);
  }
  /** A spiral pearl bursts: a column of pearl light out of the ground, nacre thrown up. */
  pearlColumn(e) {
    const c = this.columns[this.colI++ % this.columns.length];
    Object.assign(c, { t: 0, x: e.x, z: e.z });
    const y = this.gy(e.x, e.z), fx = this.fx;
    if (fx) for (let i = 0; i < 8; i++) { const a = Math.random() * 6.283; fx.add(e.x, y + 0.2, e.z, Math.sin(a) * 1.2, 3 + Math.random() * 2, Math.cos(a) * 1.2, { color: NACRE[i % 3], size: 0.14, sizeEnd: 0.04, life: 0.5, gravity: 9, drag: 1 }); }
    this.call.ring(e.x, y + 0.06, e.z, (e.radius || 0.85) * 1.3, new THREE.Color(0xffd8ec), 0.3);
  }

  // ---------- per frame ----------

  update(dt, g) {
    this.time += dt;
    for (const l of this.later) if (l.t > 0 && (l.t -= dt) <= 0) this.acidSplash(l.x, l.z);
    this.drawGulp(g, dt);
    this.drawWaves(g, dt);
    this.drawStingers(g, dt);
    this.drawAcid(g, dt);
    this.drawTrails(g, dt);
    this.drawGaze(g, dt);
    this.drawNacre(g, dt);
    this.drawGrind(g, dt);
    this.drawEggs(g, dt);
    for (const c of this.columns) {
      if (c.t >= 0.6) { c.s.visible = false; continue; }
      c.t += dt;
      const k = c.t / 0.6, y = this.gy(c.x, c.z);
      c.s.visible = true;
      c.s.scale.set(0.9 * (1 - 0.5 * k), 1 + 3.2 * Math.sqrt(k), 1);
      c.s.position.set(c.x, y + 0.5 + 1.6 * Math.sqrt(k), c.z);
      c.s.material.opacity = 0.95 * (1 - k * k);
    }
  }

  drawGulp(g, dt) {
    const m = g.monsters.find((q) => !q.dead && q.type === 'pearl_fish' && (q.suck || (q.state === 'windup' && q.windup?.name === 'gulp')));
    const show = [this.gulpCone, this.gulpFill, this.gulpRing, this.gulpDisc];
    if (!m) { for (const s of show) s.visible = false; return; }
    const atk = m.def.attacks.gulp, sucking = !!m.suck, k = sucking ? Math.min(1, m.stateT / atk.duration) : Math.min(1, m.stateT / (m.windup?.total || 1));
    const a = sucking ? m.suck.angle : m.windup.angle, R = atk.range + m.r, y = this.gy(m.x, m.z) + 0.05;
    for (const s of [this.gulpCone, this.gulpFill]) { s.visible = true; s.position.set(m.x, y, m.z); s.rotation.y = a; s.scale.set(R, 1, R); }
    // the water streams in toward the mouth (the streaks run along v, down toward the fish)
    this.gulpCone.material.map.offset.y = (this.gulpCone.material.map.offset.y + dt * (sucking ? 1.6 : 0.5)) % 1;
    this.gulpCone.material.opacity = sucking ? 0.55 + 0.1 * Math.sin(this.time * 20) : 0.25 * k;
    this.gulpFill.material.opacity = sucking ? 0.22 : 0.1 * k;
    // the ring where the jaws shut: brighter and quicker as the snap nears
    const mx = m.x + Math.sin(a) * m.r, mz = m.z + Math.cos(a) * m.r, B = atk.bite + 0.3;
    for (const s of [this.gulpRing, this.gulpDisc]) { s.visible = true; s.position.set(mx, this.gy(mx, mz) + 0.06, mz); s.scale.set(B, 1, B); }
    const beat = sucking ? 0.5 + 0.5 * Math.sin(this.time * (8 + 20 * k)) : 0;
    this.gulpRing.material.opacity = sucking ? 0.55 + 0.4 * beat : 0.3 * k;
    this.gulpDisc.material.opacity = sucking ? 0.12 + 0.2 * k : 0.05 * k;
    // drops drawn in from the far edge, and bubbles gathering at the mouth
    const fx = this.fx;
    if (fx && sucking) for (let i = 0; i < 3; i++) {
      const u = (Math.random() - 0.5) * 70 * DEG, d = R * (0.55 + 0.45 * Math.random()), px = m.x + Math.sin(a + u) * d, pz = m.z + Math.cos(a + u) * d, T = 0.35 + Math.random() * 0.15;
      fx.add(px, this.gy(px, pz) + 0.25 + Math.random() * 0.4, pz, (mx - px) / T, 0.2, (mz - pz) / T, { color: i % 2 ? WATER : FOAM, size: 0.12, sizeEnd: 0.05, life: T, drag: 0 });
    }
  }

  makeCrest() {
    const N = 28, rows = 5, pos = new Float32Array((N + 1) * rows * 3), col = new Float32Array((N + 1) * rows * 4), idx = [];
    for (let i = 0; i < N; i++) for (let r = 0; r < rows - 1; r++) { const a = i * rows + r, b = a + rows; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 9; this.scene.add(mesh);
    return { mesh, N, rows, id: -1 };
  }
  drawWaves(g, dt) {
    let n = 0;
    const p = g.player;
    for (const ar of g.areas) {
      if (ar.look !== 'wave' || n >= this.waves.length) continue;
      const w = this.waves[n++], live = ar.t - (ar.delay || 0);
      if (live < 0) { w.mesh.visible = false; continue; }
      const k = Math.min(1, live / ar.duration), fade = Math.min(1, (1 - k) / 0.15), H = (0.45 + 0.55 * k) * fade, R = ar.radius;
      const arc = ar.arc * DEG, pos = w.mesh.geometry.attributes.position.array, col = w.mesh.geometry.attributes.color.array;
      // the crest's profile, back to front: trough, back slope, top, curled lip, the foot in front
      const prof = [[-0.75, 0.02], [-0.32, 0.55], [0, 1], [0.22, 0.85], [0.32, 0.05]];
      const shade = [[0.1, 0.42, 0.72, 0.0], [0.22, 0.6, 0.92, 0.7], [0.75, 0.92, 1.0, 0.95], [1.0, 1.0, 1.0, 0.9], [0.4, 0.78, 1.0, 0.35]];
      for (let i = 0; i <= w.N; i++) {
        const u = i / w.N, a = ar.angle + (u - 0.5) * arc, s = Math.sin(a), c = Math.cos(a), taper = Math.pow(Math.sin(Math.PI * u), 0.6);
        const wob = 1 + 0.12 * Math.sin(u * 17 + this.time * 9);
        for (let r = 0; r < w.rows; r++) {
          const [dr, hy] = prof[r], d = Math.max(0.05, R + dr * (0.6 + 0.6 * H)), x = ar.x + s * d, z = ar.z + c * d, o = (i * w.rows + r) * 3, q = (i * w.rows + r) * 4;
          pos[o] = x; pos[o + 1] = this.gy(x, z) + hy * H * taper * wob; pos[o + 2] = z;
          col[q] = shade[r][0]; col[q + 1] = shade[r][1]; col[q + 2] = shade[r][2]; col[q + 3] = shade[r][3] * Math.min(1, taper * 3) * fade;
        }
      }
      w.mesh.geometry.attributes.position.needsUpdate = true; w.mesh.geometry.attributes.color.needsUpdate = true;
      w.mesh.visible = true;
      // spray off the lip, foam left on the ground behind
      const fx = this.fx;
      if (fx) for (let i = 0; i < 4; i++) {
        const u = Math.random() - 0.5, a = ar.angle + u * arc, d = R + 0.1, x = ar.x + Math.sin(a) * d, z = ar.z + Math.cos(a) * d, gy = this.gy(x, z), taper = Math.cos(u * Math.PI);
        fx.add(x, gy + H * taper, z, Math.sin(a) * ar.growth * 0.8, 1.5 + Math.random() * 1.5, Math.cos(a) * ar.growth * 0.8, { color: i % 2 ? FOAM : WATER, size: 0.12 + 0.08 * taper, sizeEnd: 0.04, life: 0.35, gravity: 10, drag: 1 });
        if (i < 2 && Math.random() < 0.5) { const back = 0.4 + Math.random() * 0.9; fx.add(x - Math.sin(a) * back, gy + 0.05, z - Math.cos(a) * back, (Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4, { color: 0xd8f6ff, size: 0.12 + Math.random() * 0.14, sizeEnd: 0.04, life: 0.4 + Math.random() * 0.4, drag: 3, alpha: 0.5 }); }
      }
      // it breaks over the hero as it reaches them
      const key = ar.id;
      if (!p.dead && !this.waveHit.has(key)) {
        const d = Math.hypot(p.x - ar.x, p.z - ar.z), off = Math.atan2(Math.sin(Math.atan2(p.x - ar.x, p.z - ar.z) - ar.angle), Math.cos(Math.atan2(p.x - ar.x, p.z - ar.z) - ar.angle));
        if (Math.abs(d - R) < 0.35 && Math.abs(off) <= arc / 2) { this.waveHit.add(key); this.monster.waterCrown(p.x, p.z); this.monster.onShake?.(0.08, 0.1); }
      }
    }
    for (let i = n; i < this.waves.length; i++) this.waves[i].mesh.visible = false;
    if (this.waveHit.size > 8) this.waveHit.clear();
  }

  drawStingers(g, dt) {
    let n = 0;
    for (const pr of g.projectiles) {
      if (pr.kind !== 'stingers' || n >= this.stingers.length) continue;
      const s = this.stingers[n++], gy = this.gy(pr.x, pr.z);
      s.ph += dt * 6;
      const pulse = 0.5 + 0.5 * Math.sin(s.ph), y = gy + (pr.y ?? 1) + 0.12 * Math.sin(s.ph * 0.5);
      s.core.visible = s.bell.visible = s.shade.visible = true;
      s.core.position.set(pr.x, y, pr.z); s.core.scale.setScalar(1.1 + 0.35 * pulse); s.core.material.opacity = 0.95;
      s.bell.position.set(pr.x, y + 0.08, pr.z); s.bell.scale.set(0.7 + 0.15 * pulse, 0.58 - 0.1 * pulse, 1); s.bell.material.opacity = 0.95;
      const R = pr.radius + 0.4;
      s.shade.position.set(pr.x, gy + 0.05, pr.z); s.shade.scale.set(R, 1, R); s.shade.material.opacity = 0.35 + 0.25 * pulse;
      if (Math.random() < 0.5) this.fx?.add(pr.x + (Math.random() - 0.5) * 0.2, y - 0.15, pr.z + (Math.random() - 0.5) * 0.2, -pr.vx * 0.1, -0.4, -pr.vz * 0.1, { color: Math.random() < 0.5 ? STING : 0xd8c0ff, size: 0.12, sizeEnd: 0.03, life: 0.6, drag: 1 });
    }
    for (let i = n; i < this.stingers.length; i++) { const s = this.stingers[i]; s.core.visible = s.bell.visible = s.shade.visible = false; }
  }

  drawAcid(g, dt) {
    let n = 0;
    for (const [id, a] of this.acid) {
      a.t += dt;
      const m = g.monsterById?.(id);
      if (!m || m.dead || a.t > a.delay + a.duration || n >= this.acidHalos.length) { this.acid.delete(id); continue; }
      const halo = this.acidHalos[n], ring = this.acidRings[n], fill = this.acidFills[n]; n++;
      const rising = Math.min(1, a.t / a.delay), on = a.t >= a.delay, left = a.delay + a.duration - a.t, out = Math.min(1, left / 0.3);
      const b = this.bone(id, 'body', _a) || _a.set(m.x, 0.5, m.z), beat = 0.5 + 0.5 * Math.sin(this.time * 9);
      halo.visible = true; halo.position.copy(b); halo.scale.setScalar((1.6 + 0.4 * beat) * (0.5 + 0.5 * rising)); halo.material.opacity = (0.3 + 0.35 * beat) * rising * out;
      const R = a.reach + m.r, y = this.gy(m.x, m.z) + 0.06;
      for (const s of [ring, fill]) { s.visible = true; s.position.set(m.x, y, m.z); s.scale.set(R * (on ? 1 : rising), 1, R * (on ? 1 : rising)); }
      ring.material.opacity = (on ? 0.5 + 0.3 * beat : 0.3 * rising) * out;
      fill.material.opacity = (on ? 0.1 : 0.05 * rising) * out;
      const fx = this.fx;
      if (fx && Math.random() < 0.7) { const q = Math.random() * 6.283; fx.add(b.x + Math.sin(q) * 0.45, b.y + Math.random() * 0.3, b.z + Math.cos(q) * 0.45, Math.sin(q) * 0.3, 0.7, Math.cos(q) * 0.3, { color: Math.random() < 0.5 ? ACID : 0xf4ffc0, size: 0.12, sizeEnd: 0.03, life: 0.5, drag: 1 }); }
    }
    for (let i = n; i < this.acidHalos.length; i++) this.acidHalos[i].visible = this.acidRings[i].visible = this.acidFills[i].visible = false;
  }

  makeTrail() {
    const V = TRAIL_PTS * 4, pos = new Float32Array(V * 3), uv = new Float32Array(V * 2), al = new Float32Array(V);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aA', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(TRAIL_PTS * 6), 1).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(geo, this.trailMats[0]);
    mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 6; this.scene.add(mesh);
    return { mesh };
  }
  /** One ribbon a trail: its pools in order, joined where they are close, wide as their radius, faded with their age. */
  drawTrails(g, dt) {
    for (const mt of this.trailMats) mt.uniforms.uT.value = this.time;
    const groups = this.trailGroups || (this.trailGroups = new Map());
    for (const list of groups.values()) list.length = 0;
    for (const ar of g.areas) {
      if (ar.kind !== 'mucus' && ar.kind !== 'pearl_slime') continue;
      const key = ar.sourceId * 2 + (ar.kind === 'pearl_slime' ? 1 : 0);
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(ar);
    }
    let n = 0;
    const p = g.player;
    for (const [key, list] of groups) {
      if (!list.length) { groups.delete(key); continue; }
      if (n >= this.trails.length) break;
      const tr = this.trails[n++], pearl = key % 2 === 1, mesh = tr.mesh, geo = mesh.geometry;
      mesh.material = this.trailMats[pearl ? 1 : 0];
      list.sort((a, b) => a.id - b.id);
      const pos = geo.attributes.position.array, uv = geo.attributes.uv.array, al = geo.attributes.aA.array, idx = geo.index.array;
      const pts = Math.min(list.length, TRAIL_PTS - 2), first = list.length - pts;
      let v = 0, ii = 0, along = 0;
      const gap = pearl ? 3.2 : 2.4;
      for (let i = 0; i < pts; i++) {
        const ar = list[first + i], prev = list[first + i - 1], next = list[first + i + 1];
        const live = ar.t - ar.delay, fade = Math.max(0, Math.min(1, (live + ar.delay) * 4) * Math.min(1, (ar.duration - live) / 1.2));
        // its direction: along its neighbours, the ends pushed out by a radius so it starts and ends round
        const joinP = prev && Math.hypot(ar.x - prev.x, ar.z - prev.z) < gap, joinN = next && Math.hypot(ar.x - next.x, ar.z - next.z) < gap;
        const ax = joinP ? prev.x : ar.x, az = joinP ? prev.z : ar.z, bx = joinN ? next.x : ar.x, bz = joinN ? next.z : ar.z;
        let dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
        if (L < 1e-4) { dx = 0; dz = 1; L = 1; }
        dx /= L; dz /= L;
        const w = ar.radius * (0.55 + 0.45 * Math.min(1, fade * 2)), cx = ar.x + (!joinP ? -dx * ar.radius * 0.7 : !joinN ? dx * ar.radius * 0.7 : 0), cz = ar.z + (!joinP ? -dz * ar.radius * 0.7 : !joinN ? dz * ar.radius * 0.7 : 0);
        if (prev && joinP) along += Math.hypot(ar.x - prev.x, ar.z - prev.z);
        for (const sgn of [-1, 1]) {
          const x = cx + dz * w * sgn, z = cz - dx * w * sgn;
          pos[v * 3] = x; pos[v * 3 + 1] = this.gy(x, z) + (pearl ? 0.05 : 0.045); pos[v * 3 + 2] = z;
          uv[v * 2] = sgn < 0 ? 0 : 1; uv[v * 2 + 1] = along; al[v] = fade; v++;
        }
        if (joinN) { const a = v - 2; idx[ii++] = a; idx[ii++] = a + 1; idx[ii++] = a + 2; idx[ii++] = a + 1; idx[ii++] = a + 3; idx[ii++] = a + 2; }
        else if (!joinP) {
          // a lone pool: a short strip of its own along its facing
          const a = v - 2;
          for (const sgn of [-1, 1]) { const x = ar.x + dx * ar.radius * 0.7 + dz * w * sgn, z = ar.z + dz * ar.radius * 0.7 - dx * w * sgn; pos[v * 3] = x; pos[v * 3 + 1] = this.gy(x, z) + 0.045; pos[v * 3 + 2] = z; uv[v * 2] = sgn < 0 ? 0 : 1; uv[v * 2 + 1] = along + 1; al[v] = fade; v++; }
          idx[ii++] = a; idx[ii++] = a + 1; idx[ii++] = a + 2; idx[ii++] = a + 1; idx[ii++] = a + 3; idx[ii++] = a + 2;
        }
        // its life: the slug's mucus bubbles and fumes; the king's slime glints
        if (live > 0 && fade > 0.3) {
          if (!pearl && Math.random() < dt * 5) { const q = Math.random() * 6.283, r = Math.random() * ar.radius; this.fx?.add(ar.x + Math.sin(q) * r, this.gy(ar.x, ar.z) + 0.1, ar.z + Math.cos(q) * r, 0, 0.7, 0, { color: Math.random() < 0.5 ? 0x9cf06a : 0xc8a0ff, size: 0.16, sizeEnd: 0.04, life: 0.5, drag: 1 }); }
          if (!pearl && Math.random() < dt * 1.5) { const q = Math.random() * 6.283; this.host.vfx?.dust.add(ar.x + Math.sin(q) * 0.4, this.gy(ar.x, ar.z) + 0.2, ar.z + Math.cos(q) * 0.4, 0, 0.35, 0, { color: 0x8ad86a, size: 0.5, sizeEnd: 1.1, life: 1.1, drag: 1, alpha: 0.3 }); }
          if (pearl && Math.random() < dt * 2) { const q = Math.random() * 6.283, r = Math.random() * ar.radius * 0.8; this.companion.glint(ar.x + Math.sin(q) * r, this.gy(ar.x, ar.z) + 0.08, ar.z + Math.cos(q) * r, 0.45, 0); }
        }
      }
      geo.setDrawRange(0, ii);
      for (const at of ['position', 'uv', 'aA']) geo.attributes[at].needsUpdate = true;
      geo.index.needsUpdate = true;
      mesh.visible = ii > 0;
      // sticky strands at the feet of a hero wading in the king's slime
      if (pearl && !p.dead && p.moving && Math.random() < dt * 14 && list.some((ar) => ar.t >= ar.delay && Math.hypot(p.x - ar.x, p.z - ar.z) <= ar.radius + p.r)) {
        const q = Math.random() * 6.283;
        this.fx?.add(p.x + Math.sin(q) * 0.25, this.gy(p.x, p.z) + 0.05, p.z + Math.cos(q) * 0.25, 0, 1.3, 0, { color: Math.random() < 0.5 ? 0xfff0d8 : 0xffe0f0, size: 0.1, sizeEnd: 0.05, life: 0.45, gravity: 6, drag: 0 });
      }
    }
    for (let i = n; i < this.trails.length; i++) this.trails[i].mesh.visible = false;
  }

  drawGaze(g, dt) {
    const m = g.monsters.find((q) => !q.dead && q.type === 'eye_clam' && q.state === 'windup' && q.windup?.name === 'gaze');
    const p = g.player;
    this.gazeFlash = Math.max(0, this.gazeFlash - dt / 0.35);
    let watching = false;
    if (m || this.gazeFlash > 0) {
      const atk = (m || g.monsters.find((q) => q.type === 'eye_clam'))?.def.attacks.gaze;
      const k = m ? Math.min(1, m.stateT / m.windup.total) : 1, x = m ? m.x : this.gazeAt.x, z = m ? m.z : this.gazeAt.z, a = m ? m.windup.angle : this.gazeAt.a, R = m ? atk.range + m.r : this.gazeAt.R;
      const y = this.gy(x, z) + 0.06;
      for (const s of [this.gazeCone, this.gazeFill]) { s.visible = true; s.position.set(x, y, z); s.rotation.y = a; s.scale.set(R, 1, R); }
      // the rays run out from the eye; the light throbs faster as the flash nears, white on the flash
      this.gazeCone.material.map.offset.y = (this.gazeCone.material.map.offset.y - dt * (0.3 + 1.2 * k)) % 1;
      const throb = 0.5 + 0.5 * Math.sin(this.time * (5 + 20 * k));
      this.gazeCone.material.color.setHex(this.gazeFlash > 0 ? 0xffffff : GAZE);
      this.gazeCone.material.opacity = this.gazeFlash > 0 ? 0.9 * this.gazeFlash : (0.15 + 0.35 * k) * (0.7 + 0.3 * throb);
      this.gazeFill.material.opacity = this.gazeFlash > 0 ? 0.45 * this.gazeFlash : 0.08 + 0.14 * k;
      // the eye itself burns brighter and bigger
      const eye = m && this.bone(m.id, 'eye', _a);
      this.gazeGlow.visible = !!eye || this.gazeFlash > 0;
      if (eye) { this.gazeGlow.position.copy(eye); this.gazeGlow.scale.setScalar(0.9 + 1.3 * k + 0.2 * throb); this.gazeGlow.material.opacity = 0.35 + 0.55 * k; }
      else if (this.gazeFlash > 0) { this.gazeGlow.scale.setScalar(3.2 * this.gazeFlash); this.gazeGlow.material.opacity = this.gazeFlash; }
      // the cue: an eye open over the hero while they stand in the cone facing it
      if (m && !p.dead) {
        const d = Math.hypot(p.x - m.x, p.z - m.z), toward = Math.atan2(m.x - p.x, m.z - p.z), off = Math.atan2(Math.sin(Math.atan2(p.x - m.x, p.z - m.z) - a), Math.cos(Math.atan2(p.x - m.x, p.z - m.z) - a));
        const facing = Math.abs(Math.atan2(Math.sin(toward - (p.facing ?? toward)), Math.cos(toward - (p.facing ?? toward)))) <= Math.PI / 2;
        if (d - m.r - (p.r || 0.4) <= atk.range && Math.abs(off) <= (atk.arc * DEG) / 2 && facing) {
          watching = true;
          this.eyeMark.position.set(p.x, this.gy(p.x, p.z) + 2.3, p.z);
          this.eyeMark.scale.set(0.7 + 0.15 * throb, 0.35 + 0.08 * throb, 1);
          this.eyeMark.material.opacity = 0.5 + 0.5 * k;
        }
      }
    } else { this.gazeCone.visible = this.gazeFill.visible = this.gazeGlow.visible = false; }
    this.eyeMark.visible = watching;
    for (const h of this.holds) {
      if (h.t >= 1.2) { h.m.visible = false; continue; }
      h.t += dt;
      h.m.visible = true;
      h.m.position.set(h.x, this.gy(h.x, h.z) + 0.07, h.z);
      h.m.rotation.y += dt * 5;
      h.m.material.opacity = 0.85 * Math.min(1, (1.2 - h.t) / 0.25);
    }
  }

  drawNacre(g, dt) {
    let n = 0;
    for (const [id, c] of this.nacre) {
      const m = g.monsterById?.(id);
      if (!m || m.dead || m.state !== 'shell' || n >= this.nacreShells.length) { if (!m || m.dead) this.nacre.delete(id); continue; }
      const sh = this.nacreShells[n], halo = this.nacreHalos[n]; n++;
      c.t += dt; c.hit = Math.max(0, c.hit - dt * 6);
      const b = this.bone(id, 'body', _a) || _a.set(m.x, 0.5, m.z), on = Math.min(1, c.t / 0.25), shim = 0.5 + 0.5 * Math.sin(this.time * 4);
      const S = (2.3 + 0.1 * shim) * on, colr = (this.time * 0.15) % 1;
      sh.visible = halo.visible = true;
      sh.position.copy(b); sh.position.y += 0.15; sh.scale.set(S, S * 0.8, 1);
      sh.material.color.setHSL(0.85 + 0.2 * colr, 0.5, 0.85);
      sh.material.opacity = (0.35 + 0.55 * c.left) * on + 0.4 * c.hit;
      halo.position.copy(sh.position); halo.scale.setScalar(S * 1.1); halo.material.opacity = (0.2 + 0.3 * c.left) * on * (0.8 + 0.2 * shim);
      const r = this.host.monsterRig?.(id);
      if (r?.material?.userData?.flash) r.material.userData.flash.value.set(0.12 * c.left + 0.3 * c.hit, 0.08 * c.left + 0.15 * c.hit, 0.14 * c.left + 0.25 * c.hit);
    }
    for (let i = n; i < this.nacreShells.length; i++) this.nacreShells[i].visible = this.nacreHalos[i].visible = false;
    let k = 0;
    for (const [id, t] of this.bare) {
      const m = g.monsterById?.(id);
      if (!m || m.dead || m.state !== 'stunned' || k >= this.bareGlows.length) { this.bare.delete(id); continue; }
      const h = this.bareGlows[k++], e = this.bone(id, 'eye', _a);
      this.bare.set(id, t + dt);
      if (!e) { h.visible = false; continue; }
      h.visible = true; h.position.copy(e); h.scale.setScalar(1 + 0.3 * Math.sin(this.time * 10)); h.material.opacity = 0.7;
    }
    for (let i = k; i < this.bareGlows.length; i++) this.bareGlows[i].visible = false;
  }

  drawGrind(g, dt) {
    const m = g.monsters.find((q) => !q.dead && q.type === 'pearl_snail_king' && q.grind);
    this.grindFlash = Math.max(0, this.grindFlash - dt * 5);
    if (!m) { this.grindLane.visible = this.grindBar.visible = false; return; }
    const atk = m.def.attacks.grind, a = m.grind.angle, L = atk.range + m.r, y = this.gy(m.x, m.z) + 0.06, s = Math.sin(a), c = Math.cos(a);
    const ph = (m.stateT / atk.duration) * atk.ticks * Math.PI, along = m.r * 0.6 + (L - m.r * 0.6) * Math.abs(Math.sin(ph));
    this.grindLane.visible = this.grindBar.visible = true;
    this.grindLane.position.set(m.x, y, m.z); this.grindLane.rotation.y = a; this.grindLane.scale.set(atk.width, 1, L);
    this.grindLane.material.opacity = 0.3 + 0.5 * this.grindFlash;
    const bx = m.x + s * along, bz = m.z + c * along;
    this.grindBar.position.set(bx, this.gy(bx, bz) + 0.08, bz); this.grindBar.rotation.y = a; this.grindBar.scale.set(atk.width, 1, 1);
    this.grindBar.material.opacity = 0.75 + 0.25 * this.grindFlash;
    const fx = this.fx;
    if (fx) for (let i = 0; i < 2; i++) {
      const u = (Math.random() - 0.5) * atk.width, x = bx + c * u, z = bz - s * u, q = Math.random() * 6.283;
      fx.add(x, this.gy(x, z) + 0.1, z, Math.sin(q) * 1.4, 1.6 + Math.random() * 1.5, Math.cos(q) * 1.4, { color: i ? NACRE[(Math.random() * 3) | 0] : 0xff9ac0, size: 0.1, sizeEnd: 0.03, life: 0.35, gravity: 10, drag: 1 });
    }
  }

  drawEggs(g, dt) {
    let n = 0;
    for (const ar of g.areas) {
      if (ar.kind !== 'pearl_egg' || n >= this.eggs.length) continue;
      const q = this.eggs[n++], gy = this.gy(ar.x, ar.z);
      if (q.id !== ar.id) {
        q.id = ar.id;
        const src = g.monsterById?.(ar.sourceId), from = src && (this.bone(src.id, 'pearl', _b) || _b.set(src.x, 2.2, src.z));
        q.fx = from ? from.x : ar.x; q.fy = from ? from.y : gy + 2; q.fz = from ? from.z : ar.z;
      }
      const flying = ar.t < ar.delay, k = flying ? ar.t / ar.delay : 1, fuse = flying ? 0 : Math.min(1, (ar.t - ar.delay) / ar.duration);
      // in flight: an arc from its shell; landed: on the ground, pulsing faster as its fuse burns
      const x = q.fx + (ar.x - q.fx) * k, z = q.fz + (ar.z - q.fz) * k, y = flying ? q.fy + (gy + 0.3 - q.fy) * k + Math.sin(k * Math.PI) * 2.2 : gy + 0.3;
      const beat = 0.5 + 0.5 * Math.sin(this.time * (4 + 22 * fuse * fuse));
      q.egg.visible = q.glow.visible = true;
      q.egg.position.set(x, y, z); q.egg.rotation.y += dt * 2; q.egg.scale.setScalar(1 + 0.12 * beat * fuse);
      q.glow.position.set(x, y + 0.05, z); q.glow.scale.setScalar(0.9 + 0.6 * beat * (0.3 + fuse)); q.glow.material.opacity = 0.4 + 0.5 * beat * fuse;
      q.fill.visible = q.edge.visible = q.step.visible = !flying;
      if (!flying) {
        const R = ar.radius;
        q.fill.position.set(ar.x, gy + 0.04, ar.z); q.fill.scale.set(R * Math.max(0.05, fuse), 1, R * Math.max(0.05, fuse)); q.fill.material.opacity = 0.1 + 0.12 * fuse;
        q.edge.position.set(ar.x, gy + 0.05, ar.z); q.edge.scale.set(R, 1, R); q.edge.material.opacity = 0.45 + 0.4 * fuse;
        const S = ar.egg.crush + 0.35;
        q.step.position.set(ar.x, gy + 0.06, ar.z); q.step.scale.set(S, 1, S); q.step.material.opacity = 0.55 + 0.4 * beat;
      }
    }
    for (let i = n; i < this.eggs.length; i++) { const q = this.eggs[i]; q.egg.visible = q.glow.visible = q.fill.visible = q.edge.visible = q.step.visible = false; q.id = -1; }
  }
}
