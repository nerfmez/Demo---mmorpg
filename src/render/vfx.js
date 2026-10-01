// Skill and combat effects. Reads game events and live projectiles/areas; never changes the game.
// Shapes follow the gameplay hit areas (arc, radius, path), so what you see is what hits.
// Everything is placed on the terrain; flat shapes are ground-hugging decals.
import * as THREE from 'three';
import { disposeObject } from './dispose.js';
import { Particles } from './particles.js';
import { toon } from './toon.js';
import { makeDecal, conform } from './decal.js';
import { BladeTrail } from './trail.js';
import FX from '../../data/combat-fx.json';

const _p0 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _base = new THREE.Vector3();
const _tip = new THREE.Vector3();

const ELEMENT = {
  physical: { core: 0xfff3c4, glow: 0xffc24a, dots: 0xffe08a },
  fire: { core: 0xfff0b0, glow: 0xff7a2a, dots: 0xffa040 },
  cold: { core: 0xeaffff, glow: 0x58c8ff, dots: 0xa8e8ff },
  earth: { core: 0xf4e3c0, glow: 0xb08a5a, dots: 0xd8c09a },
  poison: { core: 0xeaffb0, glow: 0x86d13a, dots: 0xb6ec5a },
  salt: { core: 0xf2f5df, glow: 0x75c6c8, dots: 0xcde9de },
  arcane: { core: 0xf0e8ff, glow: 0x9a7cff, dots: 0xc6b4ff },
  lightning: { core: 0xffffff, glow: 0x9fd8ff, dots: 0xe8f6ff },
  none: { core: 0xeafff4, glow: 0x6fe0b0, dots: 0xb4ffe0 },
};
export const el = (e) => ELEMENT[e] || ELEMENT.physical;
const COASTAL_CONTACTS = new Set(['slap', 'peck', 'pinch']);

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function additive(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

/** Ring sector geometry facing +Z at angle 0, with a sweep attribute 0..1 across the arc. */
function sectorGeometry(inner, outer, arcRad, segs = 28) {
  const pos = [];
  const sweep = [];
  const rad = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = -arcRad / 2 + arcRad * t;
    for (const [r, k] of [[inner, 0], [outer, 1]]) {
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      sweep.push(t);
      rad.push(k);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('sweep', new THREE.Float32BufferAttribute(sweep, 1));
  g.setAttribute('rad', new THREE.Float32BufferAttribute(rad, 1));
  g.setIndex(idx);
  return g;
}

function slashMaterial(color, reverse = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(0xffffff) }, uRev: { value: reverse ? 1 : 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute float sweep; attribute float rad; varying float vS; varying float vR;
      void main(){ vS = sweep; vR = rad; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uT; uniform vec3 uColor; uniform vec3 uCore; uniform float uRev; varying float vS; varying float vR;
      void main(){
        // the edge sweeps across the arc (right->left, or back on the return swing)
        float head = clamp(uT * 1.7, 0.0, 1.0);
        float s = mix(1.0 - vS, vS, uRev);
        if (s > head) discard;
        float tail = smoothstep(0.0, 0.55, head - s);
        float fade = 1.0 - smoothstep(0.5, 1.0, uT);
        float rim = smoothstep(0.15, 0.95, vR) * (1.0 - smoothstep(0.93, 1.0, vR));
        float edge = smoothstep(0.7, 0.98, vR);
        vec3 col = mix(uColor, uCore, edge);
        float a = rim * (1.0 - tail * 0.85) * fade;
        gl_FragColor = vec4(col * a, a);
        #include <colorspace_fragment>
      }`,
  });
}

/** Soft animated discs (ground decals). vP is the unit-disc position (local XZ). */
function discMaterial(kind) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 1 }, uColor: { value: new THREE.Color(0xffffff) }, uColor2: { value: new THREE.Color(0xffffff) }, uFill: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: kind === 'telegraph' || kind === 'mire' || kind === 'spore' ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexShader: /* glsl */ `attribute vec2 aDisc; varying vec2 vP; void main(){ vP = aDisc; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uT; uniform float uA; uniform vec3 uColor; uniform vec3 uColor2; uniform float uFill; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y); }
      void main(){
        float d = length(vP);
        if (d > 1.0) discard;
        float a = 0.0; vec3 col = uColor;
        ${
          kind === 'fire'
            ? `float f = n(vP * 3.5 + vec2(0.0, -uT * 2.5)) * 0.7 + n(vP * 7.0 - uT * 3.0) * 0.3;
               float body = smoothstep(1.0, 0.55, d + (f - 0.5) * 0.5);
               a = body * smoothstep(0.35, 0.65, f + 0.2); col = mix(uColor, uColor2, smoothstep(0.4, 0.8, f));`
            : kind === 'heal'
            ? `float r1 = fract(d * 2.2 - uT * 0.8); float ring = smoothstep(0.0, 0.08, r1) * smoothstep(0.25, 0.1, r1);
               a = (0.28 + ring * 0.5) * smoothstep(1.0, 0.85, d); col = mix(uColor, uColor2, ring);`
            : kind === 'mire' || kind === 'spore'
            ? `float f = n(vP * 4.0 + vec2(uT * 0.4, -uT * 0.3)) * 0.6 + n(vP * 9.0 - uT * 0.6) * 0.4;
               float body = smoothstep(1.0, 0.7, d + (f - 0.5) * 0.35);
               float bub = step(0.83, n(vP * 11.0 + uT * 1.5));
               a = body * (0.45 + 0.25 * f) + bub * body * 0.4; col = mix(uColor, uColor2, clamp(f + bub, 0.0, 1.0));`
            : kind === 'sigil'
            ? `float ang = atan(vP.y, vP.x);
               float rings = smoothstep(0.06, 0.0, abs(d - 0.92)) + smoothstep(0.05, 0.0, abs(d - 0.62));
               float star = smoothstep(0.05, 0.0, abs(sin(ang * 2.5 + uT * 2.0)) * d - 0.02) * step(d, 0.9);
               a = (rings + star * 0.8) ; col = mix(uColor, uColor2, rings);`
            : `float edge = smoothstep(0.9, 0.97, d) * smoothstep(1.0, 0.97, d);
               float fill = step(d, uFill) * 0.35;
               a = edge * 0.9 + fill; col = mix(uColor, uColor2, step(d, uFill));`
        }
        a *= uA;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

/** Flat disc geometry (XZ) carrying its unit-disc coordinates for the disc shaders. */
function discGeometry(segs = 40, rings = 6) {
  const pos = [];
  const disc = [];
  const idx = [];
  pos.push(0, 0, 0);
  disc.push(0, 0);
  for (let r = 1; r <= rings; r++)
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const k = r / rings;
      pos.push(Math.sin(a) * k, 0, Math.cos(a) * k);
      disc.push(Math.sin(a) * k, Math.cos(a) * k);
    }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 1; r < rings; r++)
    for (let s = 0; s < segs; s++) {
      const a = 1 + (r - 1) * segs + s;
      const b = 1 + (r - 1) * segs + ((s + 1) % segs);
      const c = a + segs;
      const d = b + segs;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDisc', new THREE.Float32BufferAttribute(disc, 2));
  g.setIndex(idx);
  return g;
}

let arrowGeo = null;
/** One shared set of arrow meshes for every arrow in flight. */
function arrowGeometry() {
  if (!arrowGeo) {
    arrowGeo = {
      shaft: new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5).rotateX(Math.PI / 2),
      tip: new THREE.ConeGeometry(0.06, 0.18, 5).rotateX(Math.PI / 2).translate(0, 0, 0.52),
      fletch: new THREE.BoxGeometry(0.14, 0.02, 0.18).translate(0, 0, -0.4),
    };
    for (const g of Object.values(arrowGeo)) g.userData.shared = true;
  }
  return arrowGeo;
}

let fireballGeo = null;
/** Shared low-poly shapes for the painted Firebolt body, trailing flame and impact petals. */
function fireballGeometry() {
  if (!fireballGeo) {
    fireballGeo = {
      orb: new THREE.IcosahedronGeometry(0.5, 1),
      tail: new THREE.ConeGeometry(0.33, 1.0, 5).rotateX(-Math.PI / 2),
      burst: new THREE.ConeGeometry(0.22, 0.9, 4).rotateX(Math.PI / 2),
    };
    for (const g of Object.values(fireballGeo)) g.userData.shared = true;
  }
  return fireballGeo;
}

function ringGeometry(inner = 0.86, outer = 1, segs = 56) {
  return new THREE.RingGeometry(inner, outer, segs, 1).rotateX(-Math.PI / 2);
}

export class Vfx {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.fx = new Particles(3200, { additive: true });
    this.dust = new Particles(900, { additive: false });
    scene.add(this.fx.points, this.dust.points);
    this.active = []; // {obj, t, dur, update(k), keep?}
    this.projectiles = new Map();
    this.areas = new Map();
    this.telegraphs = new Map();
    this.discGeo = discGeometry();
    this.ringGeo = ringGeometry();
    this.sharedGeo = new Set([this.discGeo, this.ringGeo]);
    this.glow = glowTexture();
    this.shake = 0;
    this.trail = new BladeTrail(scene);
    this.swingCfg = null;
    this.swingDelay = 0;
    this.swingLeft = 0;
  }

  gy(x, z) {
    return this.world.surfaceY(x, z);
  }

  setPointScale(h) {
    this.fx.uniforms.uScale.value = h * 0.9;
    this.dust.uniforms.uScale.value = h * 0.9;
  }

  spawn(obj, dur, update) {
    this.scene.add(obj);
    this.active.push({ obj, t: 0, dur, update });
  }

  sprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity }));
    s.scale.set(size, size, 1);
    return s;
  }

  decal(geo, material, x, z, scale = 1, rot = 0, offset = 0.06) {
    const m = makeDecal(geo, material, this.world, offset);
    m.position.set(x, 0, z);
    m.rotation.y = rot;
    m.scale.set(scale, 1, scale);
    conform(m, true);
    return m;
  }

  // ---------- one-shot effects ----------

  /** Gather Firebolt into the exact point where its projectile will appear. */
  skillCast(e, element) {
    if (e.skill !== 'firebolt') return;
    const cfg = FX.skills?.firebolt?.cast;
    if (!cfg) return;
    const c = el(element || 'fire');
    const dx = Math.sin(e.angle);
    const dz = Math.cos(e.angle);
    const x = e.x + dx * (cfg.forward ?? 0.6);
    const z = e.z + dz * (cfg.forward ?? 0.6);
    const y = this.gy(x, z) + (cfg.height ?? 1.05);
    const geo = fireballGeometry();
    const group = new THREE.Group();
    const body = new THREE.Mesh(geo.orb, additive(c.glow, 0.84));
    const core = new THREE.Mesh(geo.orb, additive(c.core, 1));
    const halo = this.sprite(c.glow, cfg.halo ?? 1.25, 0.55);
    group.add(body, core, halo);
    group.position.set(x, y, z);
    const bodySize = cfg.body ?? 0.78;
    const coreSize = cfg.core ?? 0.42;
    const haloSize = cfg.halo ?? 1.25;
    this.spawn(group, Math.max(0.12, e.total || 0.2), (t) => {
      const grow = 0.12 + (1 - Math.pow(1 - t, 2)) * 0.88;
      body.scale.setScalar(bodySize * grow);
      core.scale.setScalar(coreSize * grow);
      halo.scale.setScalar(haloSize * (0.45 + grow * 0.55));
      body.rotation.y += 0.18;
      core.rotation.x -= 0.2;
      body.material.opacity = 0.84 * (0.45 + grow * 0.55);
      halo.material.opacity = 0.55 * (1 - t * 0.25);
    });
    const sparks = cfg.sparks ?? 9;
    const radius = cfg.radius ?? 0.75;
    for (let i = 0; i < sparks; i++) {
      const a = (i / sparks) * Math.PI * 2 + Math.random() * 0.35;
      const r = radius * (0.72 + Math.random() * 0.35);
      this.fx.add(
        x + Math.sin(a) * r,
        y + (Math.random() - 0.5) * 0.35,
        z + Math.cos(a) * r,
        -Math.sin(a) * r * 3.4,
        (Math.random() - 0.25) * 0.5,
        -Math.cos(a) * r * 3.4,
        { color: i % 3 === 0 ? c.core : c.dots, size: 0.17 + Math.random() * 0.08, sizeEnd: 0.04, life: Math.max(0.16, (e.total || 0.2) * 0.9), drag: 2.2 }
      );
    }
  }

  /** Build the layered projectile once; per-frame motion only changes transforms and pooled particles. */
  decorateFirebolt(v, c, cfg = {}) {
    const geo = fireballGeometry();
    const body = new THREE.Mesh(geo.orb, additive(c.glow, 0.92));
    const core = new THREE.Mesh(geo.orb, additive(c.core, 1));
    const halo = this.sprite(c.glow, cfg.halo ?? 1.25, 0.5);
    const tails = [];
    const bodySize = cfg.body ?? 0.78;
    const coreSize = cfg.core ?? 0.42;
    body.scale.setScalar(bodySize);
    core.scale.setScalar(coreSize);
    for (let i = 0; i < 3; i++) {
      const tail = new THREE.Mesh(geo.tail, additive(i === 1 ? c.core : c.glow, i === 1 ? 0.72 : 0.58));
      const width = i === 1 ? 0.5 : 0.64;
      const length = (cfg.tail ?? 0.95) * (i === 1 ? 0.75 : 0.95);
      tail.position.set((i - 1) * 0.13, (i === 1 ? -0.02 : 0.07), -0.42 - Math.abs(i - 1) * 0.1);
      tail.scale.set(width, width, length);
      tail.userData.baseWidth = width;
      tail.userData.baseLength = length;
      tail.userData.phase = i * 1.9;
      tails.push(tail);
      v.add(tail);
    }
    v.add(body, core, halo);
    v.userData.firebolt = { body, core, halo, tails, bodySize, coreSize, haloSize: cfg.halo ?? 1.25, cfg };
  }

  fireboltImpact(e, c) {
    const cfg = FX.skills?.firebolt?.impact || {};
    const y = this.gy(e.x, e.z) + (e.y ?? 1.0);
    const dur = cfg.dur ?? 0.34;

    const flash = this.sprite(c.core, cfg.flash ?? 2.4, 1);
    flash.position.set(e.x, y, e.z);
    this.spawn(flash, Math.min(0.18, dur), (t) => {
      flash.material.opacity = 1 - t;
      const s = (cfg.flash ?? 2.4) * (0.35 + t * 0.65);
      flash.scale.setScalar(s);
    });

    const bloom = this.sprite(c.glow, cfg.bloom ?? 3.1, 0.72);
    bloom.position.set(e.x, y, e.z);
    this.spawn(bloom, dur, (t) => {
      bloom.material.opacity = 0.72 * (1 - t) * (1 - t);
      const s = (cfg.bloom ?? 3.1) * (0.42 + t * 0.58);
      bloom.scale.setScalar(s);
    });

    const petals = new THREE.Group();
    const geo = fireballGeometry();
    const count = cfg.flames ?? 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (i % 2 ? 0.08 : -0.05);
      const petal = new THREE.Mesh(geo.burst, additive(i % 3 === 0 ? c.core : c.glow, i % 3 === 0 ? 0.9 : 0.72));
      const w = 0.7 + (i % 3) * 0.08;
      const len = 0.85 + (i % 2) * 0.22;
      petal.rotation.y = a;
      petal.userData.a = a;
      petal.userData.w = w;
      petal.userData.len = len;
      petals.add(petal);
    }
    petals.position.set(e.x, y, e.z);
    this.spawn(petals, dur, (t) => {
      const expand = 1 - Math.pow(1 - t, 2);
      for (const petal of petals.children) {
        const a = petal.userData.a;
        const r = 0.06 + expand * 0.58;
        petal.position.set(Math.sin(a) * r, (0.1 + Math.sin(t * Math.PI) * 0.18), Math.cos(a) * r);
        petal.scale.set(petal.userData.w * (1 - t * 0.45), petal.userData.w * (1 - t * 0.45), petal.userData.len * (0.8 + expand * 0.5));
        petal.material.opacity = (petal.userData.w < 0.75 ? 0.9 : 0.72) * (1 - t);
      }
    });

    this.ring(e.x, e.z, cfg.ring ?? 1.35, c.glow, Math.min(0.3, dur));
    this.fx.burst(e.x, y, e.z, cfg.embers ?? 15, { color: c.dots, size: 0.24, sizeEnd: 0.05, speed: 5.2, life: 0.5, up: 1.15, gravity: 7, drag: 1.5 });
    this.dust.burst(e.x, y - 0.25, e.z, cfg.smoke ?? 5, { color: 0x8d8175, size: 0.65, sizeEnd: 1.35, speed: 2.1, life: 0.58, up: 0.8, drag: 2.8, alpha: 0.42 });
    this.shake = Math.max(this.shake, 0.08);
  }

  /**
   * A melee skill starts swinging. The blade trail only records the strike itself (the wind-up is
   * as fast as the cut, so timing, not speed alone, tells them apart): from half way to the hit
   * until just after it, or for a spin from its start to its end.
   */
  beginSwing(e, element) {
    const cfg = FX.weapons[e.weapon] || FX.weapons.none;
    const c = el(element);
    const spin = e.kind === 'melee_nova';
    this.swingCfg = cfg;
    this.swingDelay = (spin ? 0.3 : 0.5) * e.total;
    this.swingLeft = spin ? e.total * 0.7 + 0.5 : e.total * 0.5 + 0.12;
    this.trail.begin(cfg, c.glow, c.core);
  }

  /** Per frame, after the hero's pose is set: record the weapon's base and tip in world space. */
  updateTrail(dt, rig) {
    if (this.swingDelay > 0) {
      this.swingDelay -= dt;
      if (this.swingDelay <= 0) this.trail.start();
    } else if (this.swingLeft > 0) {
      this.swingLeft -= dt;
      if (this.swingLeft <= 0) this.trail.end();
    }
    const w = rig?.bones?.weapon;
    if (!w || !this.swingCfg) {
      this.trail.update(dt, _base, _tip);
      return;
    }
    w.updateWorldMatrix(true, false);
    w.getWorldPosition(_p0);
    w.getWorldDirection(_dir);
    _base.copy(_p0).addScaledVector(_dir, this.swingCfg.base);
    _tip.copy(_p0).addScaledVector(_dir, this.swingCfg.tip);
    this.trail.update(dt, _base, _tip);
  }

  /**
   * The strike lands: the ground wedge is exactly the skill's hit area (range and arc), so it shows
   * where a hit can land. The light that follows the weapon itself is the blade trail.
   */
  slash(e, weapon) {
    const cfg = FX.weapons[weapon] || FX.weapons.none;
    const c = el(e.element);
    const arc = (e.arc * Math.PI) / 180;
    // the third swing of a combo hits no further, so it is drawn stronger on the same area
    const k = e.finisher ? 1.8 : 1;
    const fill = this.decal(sectorGeometry(0, e.range, arc, 24), additive(c.glow, cfg.zone * k), e.x, e.z, 1, e.angle, 0.09);
    const edge = this.decal(sectorGeometry(Math.max(0, e.range - 0.12 * k), e.range, arc, 24), additive(c.core, 0.55), e.x, e.z, 1, e.angle, 0.1);
    this.spawn(fill, 0.24 * k, (t) => (fill.material.opacity = cfg.zone * k * (1 - t) * (1 - t)));
    this.spawn(edge, 0.24 * k, (t) => (edge.material.opacity = 0.55 * (1 - t) * (1 - t)));
    const dx = Math.sin(e.angle);
    const dz = Math.cos(e.angle);
    const y = this.gy(e.x, e.z);
    for (let i = 0; i < 6; i++) {
      const a = e.angle + ((i / 5 - 0.5) * e.arc * Math.PI) / 180;
      const r = e.range * (0.85 + Math.random() * 0.15);
      this.fx.add(e.x + Math.sin(a) * r, y + 0.2, e.z + Math.cos(a) * r, Math.sin(a) * 1.5, 0.5, Math.cos(a) * 1.5, { color: c.dots, size: 0.18, life: 0.28 });
    }
    if ((cfg.dust || e.finisher) && (e.hits || e.finisher)) {
      this.dust.burst(e.x + dx * e.range * 0.75, y + 0.15, e.z + dz * e.range * 0.75, Math.round((cfg.dust || 4) * k), { color: 0xd8c7a0, size: 0.55, sizeEnd: 1.0, speed: 2.6, life: 0.4, up: 0.2, drag: 3 });
    }
  }

  whirl(e) {
    const c = el(e.element);
    this.ring(e.x, e.z, e.radius, c.glow, 0.32);
    this.dust.burst(e.x, this.gy(e.x, e.z) + 0.2, e.z, 10, { color: 0xd8c7a0, size: 0.6, sizeEnd: 1.1, speed: e.radius * 2, life: 0.45, up: 0.2, drag: 3 });
  }

  nova(e) {
    const c = el(e.element);
    const y = this.gy(e.x, e.z);
    const m = this.decal(this.ringGeo, additive(c.glow, 0.95), e.x, e.z, 0.5);
    this.spawn(m, 0.45, (t) => {
      m.scale.set(0.5 + t * e.radius, 1, 0.5 + t * e.radius);
      conform(m);
      m.material.opacity = 0.95 * (1 - t);
    });
    // icy shards around the rim
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.fx.add(e.x + Math.sin(a) * 0.6, y + 0.4, e.z + Math.cos(a) * 0.6, Math.sin(a) * e.radius * 3, 1.2, Math.cos(a) * e.radius * 3, { color: c.dots, size: 0.32, life: 0.4, drag: 4 });
    }
    if (e.element === 'cold') {
      const group = new THREE.Group();
      const matI = toon('#d8f4ff', { emissive: '#4f9fd0', emissiveIntensity: 0.35 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
        const r = e.radius * (0.55 + Math.random() * 0.35);
        const x = e.x + Math.sin(a) * r;
        const z = e.z + Math.cos(a) * r;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9 + Math.random() * 0.5, 5), matI);
        spike.position.set(x, this.gy(x, z) + 0.3, z);
        spike.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
        group.add(spike);
      }
      this.spawn(group, 0.9, (t) => {
        const s = t < 0.15 ? t / 0.15 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        group.children.forEach((sp) => sp.scale.setScalar(Math.max(0.01, s)));
      });
    }
  }

  /** A monster's melee strike lands. Each attack has its own look (data/combat-fx.json 'monsters'). */
  monsterSwing(e) {
    const base = FX.monsters[e.name];
    if (!base) return this.genericSwing(e);
    const f = { ...base, ...(FX.overrides[`${e.type}.${e.name}`] || {}) };
    const S = f.scale ?? 1;
    const dx = Math.sin(e.angle);
    const dz = Math.cos(e.angle);
    const arc = (e.arc * Math.PI) / 180;
    const px = e.x + dx * e.range * 0.75;
    const pz = e.z + dz * e.range * 0.75;
    const gy = this.gy(px, pz);
    const y = gy + f.height;
    if (f.kind === 'splash') {
      // a slap of water: the area that was hit flashes low on the ground, a ring runs out, droplets fly
      const wedge = this.decal(sectorGeometry(e.range * 0.25, e.range, arc, 20), additive(f.color, 0.4), e.x, e.z, 1, e.angle, 0.09);
      this.spawn(wedge, f.dur, (t) => (wedge.material.opacity = 0.4 * (1 - t) * (1 - t)));
      this.ring(px, pz, e.range * 0.7 * S, f.color, f.dur);
      for (let i = 0; i < f.droplets; i++) {
        const a = e.angle + (Math.random() - 0.5) * arc;
        const sp = 2.2 + Math.random() * 3.2;
        this.fx.add(e.x + dx * e.range * 0.35, y, e.z + dz * e.range * 0.35, Math.sin(a) * sp, 1.6 + Math.random() * 2.4, Math.cos(a) * sp, { color: i % 3 ? f.color : f.core, size: 0.22 + Math.random() * 0.14, life: 0.5, gravity: 9, drag: 0.6 });
      }
    } else if (f.kind === 'thrust') {
      // a beak stab: a narrow needle from the beak to the end of its reach, feathers drift away
      const L = e.range;
      const w = f.width * S;
      for (const [k, col, width] of [[1, f.color, w], [0.45, f.core, w * 0.45]]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([-width / 2, 0, L * 0.3, width / 2, 0, L * 0.3, 0, 0, L], 3));
        g.setIndex([0, 1, 2]);
        const m = new THREE.Mesh(g, additive(col, k));
        m.position.set(e.x, this.gy(e.x, e.z) + f.height, e.z);
        m.rotation.y = e.angle;
        m.renderOrder = 6;
        this.spawn(m, f.dur, (t) => (m.material.opacity = k * (1 - t)));
      }
      const tip = this.sprite(f.core, 0.5, 0.9);
      tip.position.set(e.x + dx * L, y, e.z + dz * L);
      this.spawn(tip, f.dur, (t) => {
        tip.material.opacity = 0.9 * (1 - t);
        tip.scale.setScalar(0.4 + t * 0.5);
      });
      for (let i = 0; i < f.feathers; i++) {
        const a = e.angle + Math.PI + (Math.random() - 0.5) * 2.2;
        this.dust.add(e.x + dx * L * 0.5, y, e.z + dz * L * 0.5, Math.sin(a) * 1.2, 0.8 + Math.random() * 0.8, Math.cos(a) * 1.2, { color: 0xf4efe0, size: 0.2, life: 0.8, gravity: 1.6, drag: 1.4 });
      }
    } else if (f.kind === 'snap' || f.kind === 'fangs') {
      // two jaws close on the spot that was hit (claws, or fangs above and below)
      const fangs = f.kind === 'fangs';
      const rj = (fangs ? 0.52 : 0.58) * S;
      const th = (fangs ? 0.1 : 0.15) * S;
      const jawArc = ((fangs ? 150 : 115) * Math.PI) / 180;
      const rx = Math.cos(e.angle);
      const rz = -Math.sin(e.angle);
      const jaws = [1, -1].map((side) => {
        const m = new THREE.Mesh(sectorGeometry(rj - th, rj, jawArc, 16), slashMaterial(f.color, side < 0));
        m.rotation.y = e.angle - (side * Math.PI) / 2;
        m.renderOrder = 6;
        return { m, side };
      });
      const group = new THREE.Group();
      for (const j of jaws) group.add(j.m);
      group.position.set(px, y, pz);
      this.spawn(group, f.dur, (t) => {
        const d = (0.7 - 0.58 * Math.min(1, t / 0.45)) * S;
        for (const j of jaws) {
          j.m.position.set(rx * d * j.side, fangs ? j.side * 0.14 * S : 0, rz * d * j.side);
          j.m.material.uniforms.uT.value = t;
        }
      });
      this.fx.burst(px, y, pz, f.sparks, { color: f.color, size: 0.22, speed: 3.2, life: 0.3, up: 0.4 });
      const flash = this.sprite(f.core, 0.45, 0.7);
      flash.position.set(px, y, pz);
      this.spawn(flash, 0.14, (t) => {
        flash.material.opacity = 0.7 * (1 - t);
        flash.scale.setScalar(0.4 + t * 0.4);
      });
      if (!fangs) this.ring(px, pz, 0.55 * S, f.color, 0.2);
    } else {
      // a heavy sweep: one wide dark-red band with dust kicked along the edge of the area
      const m = new THREE.Mesh(sectorGeometry(e.range * 0.74, e.range, arc, 32), slashMaterial(f.color));
      m.position.set(e.x, this.gy(e.x, e.z) + f.height, e.z);
      m.rotation.y = e.angle;
      m.renderOrder = 6;
      this.spawn(m, f.dur, (t) => (m.material.uniforms.uT.value = t));
      for (let i = 0; i < f.dust; i++) {
        const a = e.angle + (i / Math.max(1, f.dust - 1) - 0.5) * arc;
        this.dust.add(e.x + Math.sin(a) * e.range * 0.9, this.gy(e.x, e.z) + 0.15, e.z + Math.cos(a) * e.range * 0.9, Math.sin(a) * 1.5, 0.5, Math.cos(a) * 1.5, { color: 0xb8a58a, size: 0.55, sizeEnd: 1.2, life: 0.5, drag: 3 });
      }
    }
  }

  genericSwing(e) {
    const g = sectorGeometry(e.range * 0.4, e.range, (e.arc * Math.PI) / 180);
    const m = new THREE.Mesh(g, slashMaterial(0xff8a5a));
    m.position.set(e.x, this.gy(e.x, e.z) + 0.7, e.z);
    m.rotation.y = e.angle;
    this.spawn(m, 0.3, (t) => (m.material.uniforms.uT.value = t));
  }

  impact(e) {
    const c = el(e.element);
    if (e.kind === 'firebolt') return this.fireboltImpact(e, c);
    const y = this.gy(e.x, e.z) + (e.y ?? 1.0);
    this.fx.burst(e.x, y, e.z, 10, { color: c.dots, size: 0.28, speed: 4, life: 0.35, up: 0.8 });
    const s = this.sprite(c.glow, 1.6, 0.9);
    s.position.set(e.x, y, e.z);
    this.spawn(s, 0.2, (t) => {
      s.material.opacity = 0.9 * (1 - t);
      s.scale.setScalar(1.2 + t * 1.2);
    });
  }

  hitSpark(e, height = 0.9) {
    const c = el(e.element);
    const y = this.gy(e.x, e.z);
    if (e.dot) {
      this.fx.add(e.x + (Math.random() - 0.5) * 0.6, y + 0.6, e.z + (Math.random() - 0.5) * 0.6, 0, 1.4, 0, { color: c.dots, size: 0.22, life: 0.5 });
      return;
    }
    this.fx.burst(e.x, y + height, e.z, e.crit ? 14 : 6, { color: e.crit ? 0xffffff : c.dots, size: e.crit ? 0.35 : 0.24, speed: e.crit ? 6 : 4, life: 0.3, up: 0.6 });
    if (e.shell) this.fx.burst(e.x, y + 1.0, e.z, 6, { color: 0xd8f0a0, size: 0.2, speed: 3, life: 0.25 });
  }

  burst(e) {
    if (e.kind === 'stone_burst') return this.stoneBurst(e);
    if (e.kind === 'slam' || e.kind === 'pound') return this.slam(e);
    if (e.kind === 'leap') return this.leapLand(e);
    if (e.kind === 'dive') return this.dive(e);
    if (e.kind === 'rock') return this.rockLand(e);
    const c = el(e.element);
    this.fx.burst(e.x, this.gy(e.x, e.z) + 0.3, e.z, 18, { color: c.dots, size: 0.35, speed: e.radius * 2.5, life: 0.5, up: 0.4 });
  }

  stoneBurst(e) {
    const c = el(e.element);
    const cold = e.element === 'cold';
    const n = 7;
    const group = new THREE.Group();
    const mat = toon(cold ? '#bfe9ff' : '#b89a78');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const r = i === 0 ? 0 : e.radius * (0.35 + Math.random() * 0.45);
      const h = (i === 0 ? 1.8 : 1.0 + Math.random() * 0.6) * (e.echo ? 0.8 : 1);
      const x = e.x + Math.sin(a) * r;
      const z = e.z + Math.cos(a) * r;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28 + Math.random() * 0.15, h, 5), mat);
      cone.position.set(x, 0, z);
      cone.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      cone.userData.h = h;
      cone.userData.base = this.gy(x, z);
      cone.castShadow = true;
      group.add(cone);
    }
    this.spawn(group, 0.9, (t) => {
      const up = t < 0.15 ? t / 0.15 : t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      group.children.forEach((cn) => (cn.position.y = cn.userData.base + (up - 0.5) * cn.userData.h));
    });
    const y = this.gy(e.x, e.z);
    this.dust.burst(e.x, y + 0.2, e.z, 16, { color: cold ? 0xdff4ff : 0xcbb08a, size: 0.8, sizeEnd: 1.4, speed: e.radius * 1.8, life: 0.7, up: 0.3, drag: 3 });
    this.fx.burst(e.x, y + 0.5, e.z, 10, { color: c.dots, size: 0.25, speed: 5, life: 0.4, up: 1.2 });
    this.ring(e.x, e.z, e.radius, cold ? 0xa8e8ff : 0xffe0a0, 0.35);
  }

  slam(e) {
    const y = this.gy(e.x, e.z);
    this.dust.burst(e.x, y + 0.2, e.z, 26, { color: 0xb49a78, size: 1.0, sizeEnd: 1.8, speed: e.radius * 2.2, life: 0.8, up: 0.25, drag: 3 });
    this.ring(e.x, e.z, e.radius, 0xffb070, 0.4);
    this.shake = Math.max(this.shake, e.kind === 'pound' ? 0.25 : 0.35);
  }

  leapLand(e) {
    const y = this.gy(e.x, e.z);
    this.dust.burst(e.x, y + 0.2, e.z, 18, { color: 0xd8c7a0, size: 0.9, sizeEnd: 1.5, speed: e.radius * 2.4, life: 0.6, up: 0.3, drag: 3 });
    this.fx.burst(e.x, y + 0.3, e.z, 12, { color: 0xffe08a, size: 0.26, speed: 5, life: 0.4, up: 0.8 });
    this.ring(e.x, e.z, e.radius, 0xffe0a0, 0.3);
    this.shake = Math.max(this.shake, 0.15);
  }

  dive(e) {
    const y = this.gy(e.x, e.z);
    this.dust.burst(e.x, y + 0.2, e.z, 12, { color: 0xd8d0c0, size: 0.7, sizeEnd: 1.3, speed: 4, life: 0.5, up: 0.3, drag: 3 });
    for (let i = 0; i < 10; i++) this.fx.add(e.x, y + 0.8, e.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 6, { color: 0xeaf6ff, size: 0.18, life: 0.5, drag: 2, gravity: 3 });
  }

  rockLand(e) {
    const y = this.gy(e.x, e.z);
    this.dust.burst(e.x, y + 0.2, e.z, 16, { color: 0xa89a86, size: 0.9, sizeEnd: 1.5, speed: 4, life: 0.6, up: 0.3, drag: 3 });
    for (let i = 0; i < 8; i++) this.dust.add(e.x, y + 0.5, e.z, (Math.random() - 0.5) * 7, 2 + Math.random() * 3, (Math.random() - 0.5) * 7, { color: 0x8a8278, size: 0.35, life: 0.7, drag: 0.5, gravity: 12 });
    this.shake = Math.max(this.shake, 0.12);
  }

  ring(x, z, radius, color, dur = 0.35) {
    const m = this.decal(this.ringGeo, additive(color, 0.9), x, z, radius * 0.6, 0, 0.08);
    this.spawn(m, dur, (t) => {
      const s = radius * (0.6 + t * 0.5);
      m.scale.set(s, 1, s);
      conform(m);
      m.material.opacity = 0.9 * (1 - t);
    });
  }

  chain(e) {
    const c = el(e.element || 'lightning');
    const pts = e.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const y0 = this.gy(x0, z0) + 1.1;
      const y1 = this.gy(x1, z1) + 1.0;
      const segs = 9;
      const arr = [];
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const j = k === 0 || k === segs ? 0 : 0.35;
        arr.push(new THREE.Vector3(x0 + (x1 - x0) * t + (Math.random() - 0.5) * j, y0 + (y1 - y0) * t + (Math.random() - 0.5) * j, z0 + (z1 - z0) * t + (Math.random() - 0.5) * j));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arr), 18, 0.05, 4), additive(c.core, 1));
      const halo = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arr), 18, 0.16, 5), additive(c.glow, 0.5));
      const g = new THREE.Group();
      g.add(tube, halo);
      this.spawn(g, 0.22 + i * 0.03, (t) => {
        tube.material.opacity = 1 - t;
        halo.material.opacity = 0.5 * (1 - t);
      });
      this.fx.burst(x1, y1, z1, 8, { color: c.dots, size: 0.22, speed: 4, life: 0.3, up: 0.5 });
    }
  }

  summon(e) {
    const y = this.gy(e.x, e.z);
    this.ring(e.x, e.z, 1.6, 0x8fd0ff, 0.5);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.fx.add(e.x + Math.sin(a) * 1.2, y + 0.1, e.z + Math.cos(a) * 1.2, -Math.sin(a) * 1.5, 2 + Math.random() * 2, -Math.cos(a) * 1.5, { color: 0xa8dcff, size: 0.28, life: 0.7, drag: 2 });
    }
  }

  warcry(e) {
    const y = this.gy(e.x, e.z);
    for (let k = 0; k < 3; k++) {
      const m = this.decal(this.ringGeo, additive(0xffb040, 0.8), e.x, e.z, 1, 0, 0.1);
      this.spawn(m, 0.5 + k * 0.12, (t) => {
        const s = 1 + t * e.radius;
        m.scale.set(s, 1, s);
        conform(m);
        m.material.opacity = 0.8 * (1 - t);
      });
    }
    for (let i = 0; i < 20; i++) this.fx.add(e.x + (Math.random() - 0.5), y + 1 + Math.random(), e.z + (Math.random() - 0.5), (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, { color: 0xffc860, size: 0.3, life: 0.6, drag: 2 });
    this.shake = Math.max(this.shake, 0.12);
  }

  curse(e) {
    const m = this.decal(this.discGeo, discMaterial('sigil'), e.x, e.z, e.radius, 0, 0.1);
    m.material.uniforms.uColor.value.set(0x9a5cff);
    m.material.uniforms.uColor2.value.set(0xd8b8ff);
    this.spawn(m, 1.0, (t) => {
      m.material.uniforms.uT.value = t * 3;
      m.material.uniforms.uA.value = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    });
    const y = this.gy(e.x, e.z);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * e.radius;
      this.fx.add(e.x + Math.sin(a) * r, y + 0.2, e.z + Math.cos(a) * r, 0, 1.5 + Math.random(), 0, { color: 0xb88cff, size: 0.26, life: 0.8, drag: 1 });
    }
  }

  howl(e) {
    const y = this.gy(e.x, e.z);
    for (let k = 0; k < 2; k++) {
      const m = this.decal(this.ringGeo, additive(0xd8d0ff, 0.6), e.x, e.z, 1, 0, 0.1);
      this.spawn(m, 0.7 + k * 0.2, (t) => {
        const s = 1 + t * 9;
        m.scale.set(s, 1, s);
        conform(m);
        m.material.opacity = 0.6 * (1 - t);
      });
    }
    this.fx.burst(e.x, y + 1.3, e.z, 10, { color: 0xe8e0ff, size: 0.25, speed: 2, life: 0.6, up: 1 });
  }

  lob(e) {
    // a boulder arcing from the golem to its target over e.duration
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), toon('#8f877c'));
    rock.castShadow = true;
    const y0 = this.gy(e.fromX, e.fromZ) + 2.6;
    const y1 = this.gy(e.x, e.z) + 0.3;
    this.spawn(rock, e.duration, (t) => {
      rock.position.set(e.fromX + (e.x - e.fromX) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 5, e.fromZ + (e.z - e.fromZ) * t);
      rock.rotation.x += 0.2;
      rock.rotation.z += 0.13;
    });
  }

  ward(e, parent) {
    const color = e.reflect ? 0xffb86a : 0x8fd8ff;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `varying float vF; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vec3 n = normalize(normalMatrix * normal); vF = 1.0 - abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uA; varying float vF; void main(){ float a = (pow(vF, 2.5) * 0.9 + 0.06) * uA; gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }`,
      })
    );
    m.scale.set(0.9, 1.15, 0.9);
    disposeObject(this.wardMesh);
    this.wardMesh = m;
    parent.add(m);
    m.position.y = 1.0;
    this.fx.burst(e.x, this.gy(e.x, e.z) + 1, e.z, 16, { color, size: 0.3, speed: 3, life: 0.5, up: 1 });
  }

  updateWard(barrier, t) {
    if (!this.wardMesh) return;
    const on = barrier > 0.5;
    this.wardMesh.visible = on;
    this.wardMesh.material.uniforms.uA.value = on ? 0.75 + Math.sin(t * 5) * 0.1 : 0;
    this.wardMesh.rotation.y += 0.01;
  }

  levelUp(x, z) {
    const y = this.gy(x, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 5, 24, 1, true), additive(0xffd76a, 0.6));
    m.position.set(x, y + 2.5, z);
    this.spawn(m, 1.2, (t) => {
      m.material.opacity = 0.6 * (1 - t);
      m.scale.set(1 + t * 0.4, 1, 1 + t * 0.4);
    });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add(x + Math.sin(a) * 0.9, y + Math.random() * 0.5, z + Math.cos(a) * 0.9, 0, 3 + Math.random() * 3, 0, { color: 0xffe79a, size: 0.25, life: 1.0, drag: 1 });
    }
  }

  waypointUnlock(x, z) {
    const y = this.gy(x, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 8, 20, 1, true), additive(0x8fe8ff, 0.55));
    m.position.set(x, y + 4, z);
    this.spawn(m, 1.4, (t) => {
      m.material.opacity = 0.55 * (1 - t);
      m.scale.set(1 + t, 1, 1 + t);
    });
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add(x + Math.sin(a) * 1.2, y + 0.3, z + Math.cos(a) * 1.2, 0, 3 + Math.random() * 3, 0, { color: 0xa8f0ff, size: 0.28, life: 1.1, drag: 1 });
    }
  }

  teleport(x, z) {
    const y = this.gy(x, z);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.2;
      this.fx.add(x + Math.sin(a) * r, y + Math.random() * 2, z + Math.cos(a) * r, 0, 2 + Math.random() * 2, 0, { color: 0x9fe8ff, size: 0.3, life: 0.8, drag: 1 });
    }
    this.ring(x, z, 1.8, 0x8fe8ff, 0.6);
  }

  blink(fromX, fromZ, x, z, color = 0xb4a2ff) {
    this.fx.burst(fromX, this.gy(fromX, fromZ) + 1, fromZ, 16, { color, size: 0.3, speed: 3, life: 0.4, up: 1 });
    this.fx.burst(x, this.gy(x, z) + 1, z, 16, { color, size: 0.3, speed: 3, life: 0.4, up: 1 });
  }

  dashTrail(x, y, z, kind) {
    if (kind === 'roll') this.dust.add(x, y + 0.2, z, 0, 0.3, 0, { color: 0xd8c7a0, size: 0.7, sizeEnd: 1.1, life: 0.45, drag: 2 });
    else if (kind === 'leap') this.fx.add(x, y + 0.6, z, 0, 0, 0, { color: 0xffe0a0, size: 0.45, sizeEnd: 0.1, life: 0.3 });
    else this.fx.add(x, y + 1.0, z, 0, 0, 0, { color: 0xbfe6ff, size: 0.55, sizeEnd: 0.1, life: 0.25 });
  }

  death(e, big = false) {
    const y = this.gy(e.x, e.z);
    this.dust.burst(e.x, y + 0.5, e.z, big ? 40 : 14, { color: 0xe8dcc8, size: big ? 1.2 : 0.7, sizeEnd: big ? 2 : 1.1, speed: big ? 5 : 3, life: 0.7, up: 0.5, drag: 3 });
    this.fx.burst(e.x, y + 0.8, e.z, big ? 30 : 8, { color: 0xfff0b0, size: 0.28, speed: 4, life: 0.5, up: 1 });
  }

  pickup(x, y, z, color) {
    this.fx.burst(x, y + 0.4, z, 6, { color, size: 0.2, speed: 2, life: 0.35, up: 1.5 });
  }

  heal(x, z) {
    const y = this.gy(x, z);
    for (let i = 0; i < 5; i++) this.fx.add(x + (Math.random() - 0.5) * 0.8, y + 0.4 + Math.random(), z + (Math.random() - 0.5) * 0.8, 0, 1.6, 0, { color: 0x8dffc8, size: 0.25, life: 0.7, drag: 1 });
  }

  buffAura(x, z, color, dt) {
    if (Math.random() < dt * 10) {
      const y = this.gy(x, z);
      const a = Math.random() * Math.PI * 2;
      this.fx.add(x + Math.sin(a) * 0.5, y + 0.2, z + Math.cos(a) * 0.5, 0, 1.6, 0, { color, size: 0.2, life: 0.6, drag: 1 });
    }
  }

  // ---------- persistent visuals synced to the game ----------

  syncProjectiles(game, dt, time) {
    const seen = new Set();
    for (const pr of game.projectiles) {
      seen.add(pr.id);
      let v = this.projectiles.get(pr.id);
      const element = pr.owner === 'player' ? pr.element : pr.element || (pr.kind === 'spit' ? 'poison' : 'arcane');
      const c = el(element);
      const arrow = pr.kind === 'hunter_shot';
      const firebolt = pr.owner === 'player' && pr.kind === 'firebolt';
      if (!v) {
        v = new THREE.Group();
        if (arrow) {
          const ag = arrowGeometry();
          const shaft = new THREE.Mesh(ag.shaft, toon('#8a5c3a'));
          const tip = new THREE.Mesh(ag.tip, toon('#d8dbe2'));
          const fl = new THREE.Mesh(ag.fletch, toon('#f4f0e8'));
          v.add(shaft, tip, fl);
          v.add(this.sprite(c.glow, 0.7, 0.4));
        } else if (firebolt) {
          this.decorateFirebolt(v, c, FX.skills?.firebolt?.travel || {});
        } else {
          const size = pr.owner === 'player' ? 0.9 : 0.8;
          v.add(this.sprite(c.glow, size * 1.8, 0.85));
          v.add(this.sprite(c.core, size * 0.8, 1));
        }
        this.scene.add(v);
        this.projectiles.set(pr.id, v);
      }
      const y = this.gy(pr.x, pr.z) + (pr.y ?? 1);
      v.position.set(pr.x, y, pr.z);
      const dx = pr.vx / Math.max(0.001, pr.speed);
      const dz = pr.vz / Math.max(0.001, pr.speed);
      const bx = -dx;
      const bz = -dz;
      if (arrow) {
        v.rotation.y = Math.atan2(pr.vx, pr.vz);
      } else if (firebolt) {
        v.rotation.y = Math.atan2(pr.vx, pr.vz);
        const fb = v.userData.firebolt;
        const pulse = 1 + Math.sin(time * 24 + pr.id * 0.7) * 0.07;
        fb.body.scale.setScalar(fb.bodySize * pulse);
        fb.core.scale.setScalar(fb.coreSize * (1.02 - (pulse - 1) * 0.55));
        fb.halo.scale.setScalar(fb.haloSize * (0.94 + (pulse - 1) * 1.8));
        fb.body.rotation.y += dt * 5.5;
        fb.core.rotation.x -= dt * 6.5;
        for (const tail of fb.tails) {
          const flicker = 1 + Math.sin(time * 30 + tail.userData.phase + pr.id) * 0.16;
          tail.scale.set(tail.userData.baseWidth / Math.sqrt(flicker), tail.userData.baseWidth / Math.sqrt(flicker), tail.userData.baseLength * flicker);
        }

        const cfg = fb.cfg;
        const flameRate = cfg.trailRate ?? 58;
        const flameF = dt * flameRate;
        const flameN = Math.floor(flameF) + (Math.random() < flameF - Math.floor(flameF) ? 1 : 0);
        const lx = dz;
        const lz = -dx;
        for (let k = 0; k < flameN; k++) {
          const o = 0.15 + Math.random() * 0.5;
          const side = (Math.random() - 0.5) * 0.22;
          this.fx.add(pr.x + bx * o + lx * side, y + (Math.random() - 0.5) * 0.15, pr.z + bz * o + lz * side, bx * (1.1 + Math.random() * 0.9), 0.45 + Math.random() * 0.35, bz * (1.1 + Math.random() * 0.9), {
            color: Math.random() < 0.28 ? c.core : c.glow,
            size: 0.34 + Math.random() * 0.18,
            sizeEnd: 0.05,
            life: cfg.trailLife ?? 0.22,
            drag: 4.2,
          });
        }
        const emberRate = cfg.emberRate ?? 13;
        const emberF = dt * emberRate;
        const emberN = Math.floor(emberF) + (Math.random() < emberF - Math.floor(emberF) ? 1 : 0);
        for (let k = 0; k < emberN; k++) {
          const o = 0.25 + Math.random() * 0.65;
          this.fx.add(pr.x + bx * o, y + (Math.random() - 0.5) * 0.2, pr.z + bz * o, bx * 0.7 + (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.7, bz * 0.7 + (Math.random() - 0.5) * 0.8, {
            color: c.dots,
            size: 0.12 + Math.random() * 0.09,
            sizeEnd: 0.025,
            life: cfg.emberLife ?? 0.38,
            gravity: 2.2,
            drag: 1.6,
          });
        }
      } else {
        v.children[1].scale.setScalar(0.7 + Math.sin(time * 30 + pr.id) * 0.08);
      }
      if (!firebolt) {
        for (let k = 0; k < (arrow ? 1 : 2); k++) {
          const o = Math.random() * 0.35;
          this.fx.add(pr.x + bx * o, y + (Math.random() - 0.5) * 0.12, pr.z + bz * o, bx * 1.2, 0.3, bz * 1.2, { color: c.dots, size: arrow ? 0.18 : 0.32, sizeEnd: 0.05, life: 0.28, drag: 4 });
        }
      }
    }
    for (const [id, v] of this.projectiles) {
      if (!seen.has(id)) {
        disposeObject(v, this.sharedGeo);
        this.projectiles.delete(id);
      }
    }
  }

  syncAreas(game, dt, time) {
    const seen = new Set();
    for (const a of game.areas) {
      seen.add(a.id);
      let v = this.areas.get(a.id);
      if (!v) {
        v = this.makeArea(a);
        if (!v) continue;
        this.areas.set(a.id, v);
        this.scene.add(v.obj);
      }
      v.update(a, time, dt);
    }
    for (const [id, v] of this.areas) {
      if (!seen.has(id)) {
        disposeObject(v.obj, this.sharedGeo);
        this.areas.delete(id);
      }
    }
  }

  makeArea(a) {
    const fadeInOut = (ar) => {
      const live = ar.t - ar.delay;
      return Math.max(0, Math.min(1, live * 5) * Math.min(1, (ar.duration - live) * 2));
    };
    if (a.kind === 'burning_ground') {
      const m = this.decal(this.discGeo, discMaterial('fire'), a.x, a.z, a.radius, 0, 0.07);
      m.material.uniforms.uColor.value.set(0xff5a1a);
      m.material.uniforms.uColor2.value.set(0xffd060);
      return {
        obj: m,
        update: (ar, t, dt) => {
          m.material.uniforms.uT.value = t;
          m.material.uniforms.uA.value = fadeInOut(ar);
          if (Math.random() < dt * 14) {
            const x = ar.x + (Math.random() - 0.5) * ar.radius * 1.4;
            const z = ar.z + (Math.random() - 0.5) * ar.radius * 1.4;
            this.fx.add(x, this.gy(x, z) + 0.2, z, 0, 1.8, 0, { color: 0xff9a40, size: 0.28, life: 0.6, drag: 1 });
          }
        },
      };
    }
    if (a.kind === 'venom_mire' || a.kind === 'spore_cloud') {
      const spore = a.kind === 'spore_cloud';
      const m = this.decal(this.discGeo, discMaterial(spore ? 'spore' : 'mire'), a.x, a.z, a.radius, 0, 0.07);
      m.material.uniforms.uColor.value.set(spore ? 0x9a8a4a : 0x5a8a2a);
      m.material.uniforms.uColor2.value.set(spore ? 0xd8d070 : 0xa8e04a);
      return {
        obj: m,
        update: (ar, t, dt) => {
          m.material.uniforms.uT.value = t;
          m.material.uniforms.uA.value = fadeInOut(ar) * (spore ? 0.8 : 0.9);
          if (Math.random() < dt * (spore ? 26 : 12)) {
            const ang = Math.random() * Math.PI * 2;
            const r = Math.random() * ar.radius;
            const x = ar.x + Math.sin(ang) * r;
            const z = ar.z + Math.cos(ang) * r;
            (spore ? this.dust : this.fx).add(x, this.gy(x, z) + 0.2 + Math.random() * (spore ? 1.2 : 0.2), z, (Math.random() - 0.5) * 0.4, spore ? 0.5 : 0.9, (Math.random() - 0.5) * 0.4, {
              color: spore ? 0xcfc47a : 0xa8e04a,
              size: spore ? 0.9 : 0.24,
              sizeEnd: spore ? 1.5 : 0.05,
              life: spore ? 1.2 : 0.7,
              drag: 1,
              alpha: spore ? 0.5 : 1,
            });
          }
        },
      };
    }
    if (a.kind === 'healing_spring') {
      const m = this.decal(this.discGeo, discMaterial('heal'), a.x, a.z, a.radius, 0, 0.08);
      m.material.uniforms.uColor.value.set(0x3fbf9a);
      m.material.uniforms.uColor2.value.set(0xbfffe8);
      return {
        obj: m,
        update: (ar, t, dt) => {
          const live = ar.t - ar.delay;
          m.visible = live >= 0;
          m.material.uniforms.uT.value = t;
          m.material.uniforms.uA.value = fadeInOut(ar);
          if (live >= 0 && Math.random() < dt * 22) {
            const ang = Math.random() * Math.PI * 2;
            const r = Math.random() * ar.radius;
            const x = ar.x + Math.sin(ang) * r;
            const z = ar.z + Math.cos(ang) * r;
            this.fx.add(x, this.gy(x, z) + 0.1, z, 0, 1.5 + Math.random(), 0, { color: 0x9dffd8, size: 0.26, life: 0.8, drag: 0.8 });
          }
        },
      };
    }
    if (a.kind === 'stone_burst' || a.kind === 'rock' || a.kind === 'dive' || a.kind === 'pound') {
      // ground telegraph during the delay (player skills: soft yellow; monster attacks: red)
      const hostile = a.owner === 'monster';
      const m = this.decal(this.discGeo, discMaterial('telegraph'), a.x, a.z, a.radius, 0, 0.06);
      const cold = a.element === 'cold';
      m.material.uniforms.uColor.value.set(hostile ? 0xff6a3a : cold ? 0xbfe8ff : 0xffe2a8);
      m.material.uniforms.uColor2.value.set(hostile ? 0xff9a5a : cold ? 0x8fd0ff : 0xffc870);
      return {
        obj: m,
        update: (ar) => {
          const k = Math.min(1, ar.t / Math.max(0.01, ar.delay));
          m.material.uniforms.uFill.value = k;
          m.material.uniforms.uA.value = ar.t < ar.delay ? (hostile ? 0.9 : 0.7) : 0;
        },
      };
    }
    if (a.kind === 'shockwave') {
      const m = this.decal(this.ringGeo, additive(0xffa060, 0.9), a.x, a.z, a.radius, 0, 0.1);
      return {
        obj: m,
        update: (ar) => {
          m.scale.set(ar.radius, 1, ar.radius);
          conform(m);
          m.material.opacity = 0.9 * (1 - (ar.t - ar.delay) / ar.duration);
          if (Math.random() < 0.6) {
            const ang = Math.random() * Math.PI * 2;
            const x = ar.x + Math.sin(ang) * ar.radius;
            const z = ar.z + Math.cos(ang) * ar.radius;
            this.dust.add(x, this.gy(x, z) + 0.2, z, 0, 0.4, 0, { color: 0xc2a684, size: 0.7, sizeEnd: 1.1, life: 0.4, drag: 2 });
          }
        },
      };
    }
    return null;
  }

  /** Monster wind-up tells: ground circle for slams, lane for charges and lunges. */
  syncTelegraphs(game) {
    const seen = new Set();
    for (const m of game.monsters) {
      const w = m.windup;
      if (m.dead || !w || m.state !== 'windup') continue;
      let kind = null;
      if (w.name === 'slam') kind = 'slam';
      else if (COASTAL_CONTACTS.has(w.name)) kind = 'melee';
      else if (w.name === 'gore' || w.name === 'charge' || w.name === 'lunge' || w.name === 'triple') kind = 'lane';
      if (!kind) continue;
      const key = `${m.id}:${w.name}`;
      seen.add(key);
      let v = this.telegraphs.get(key);
      if (!v) {
        if (kind === 'slam') {
          const mesh = this.decal(this.discGeo, discMaterial('telegraph'), m.x, m.z, w.radius || m.def.attacks.slam.radius, 0, 0.07);
          mesh.material.uniforms.uColor.value.set(0xff6a3a);
          mesh.material.uniforms.uColor2.value.set(0xff9a5a);
          v = { mesh, kind };
        } else if (kind === 'melee') {
          const atk = m.def.attacks[w.name];
          const geo = sectorGeometry(0, m.r + atk.range, atk.arc * Math.PI / 180);
          const mesh = makeDecal(geo, new THREE.MeshBasicMaterial({ color: 0xffbc72, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }), this.world, 0.07);
          v = { mesh, kind };
        } else {
          const atk = m.def.attacks[w.name];
          const len = (atk.speed || 12) * (atk.duration || 0.4);
          const geo = new THREE.PlaneGeometry(m.r * 1.6, len, 1, 14).rotateX(-Math.PI / 2).translate(0, 0, len / 2);
          const mesh = makeDecal(geo, new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0.25, depthWrite: false }), this.world, 0.07);
          v = { mesh, kind };
        }
        this.scene.add(v.mesh);
        this.telegraphs.set(key, v);
      }
      const k = Math.min(1, m.stateT / w.total);
      v.mesh.position.set(m.x, 0, m.z);
      if (v.kind === 'slam') {
        const r = w.radius || m.def.attacks.slam.radius;
        v.mesh.scale.set(r, 1, r);
        v.mesh.material.uniforms.uFill.value = k;
        v.mesh.material.uniforms.uA.value = 0.9;
      } else {
        v.mesh.rotation.y = w.angle;
        v.mesh.material.opacity = 0.12 + 0.25 * k;
      }
      conform(v.mesh);
    }
    for (const [key, v] of this.telegraphs) {
      if (!seen.has(key)) {
        disposeObject(v.mesh, this.sharedGeo);
        this.telegraphs.delete(key);
      }
    }
  }

  update(dt) {
    this.fx.update(dt);
    this.dust.update(dt);
    const keep = [];
    for (const a of this.active) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.update?.(k, a);
      if (a.t >= a.dur) {
        disposeObject(a.obj, this.sharedGeo);
      } else keep.push(a);
    }
    this.active = keep;
  }
}
