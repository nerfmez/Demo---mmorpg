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
import { flameMesh, FlameParticles } from './firebolt.js';
import { cutRibbon, ContactShards } from './melee.js';
import { arrowStreak, groundCracks, rockGeometry, RockChips } from './physical.js';

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

function ringGeometry(inner = 0.86, outer = 1, segs = 56) {
  return new THREE.RingGeometry(inner, outer, segs, 1).rotateX(-Math.PI / 2);
}

export class Vfx {
  constructor(scene, world, { config = FX } = {}) {
    this.config = config;
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
    this.contacts = new ContactShards(scene);
    this.chips = new RockChips(scene);
    this.flames = new FlameParticles(scene, this.config.skills.firebolt);
    this.castFlame = null;
    this.seenProjectiles = new Set();
  }

  // Lab injects an isolated data copy; the game keeps its authored defaults.
  genericLook(kind) {
    const cfg = this.config.skills?.[kind];
    return cfg?.renderer === 'sprite' || cfg?.renderer === 'arrow' ? cfg : this.config.projectileDefaults;
  }

  meleeLook(skill) {
    const profile = this.config.skills?.[skill];
    return profile?.renderer === 'melee' ? profile : this.config.meleeDefaults;
  }

  meleePalette(skill, element) {
    const cfg = this.meleeLook(skill);
    if (!element || element === 'physical') return cfg;
    const c = el(element);
    return { ...cfg, colors: { rim: c.glow, body: c.glow, core: c.core, sparks: c.dots } };
  }

  contactLook(skill, element) {
    const profile = this.config.skills?.[skill];
    const cfg = profile?.impact?.flashSize !== undefined ? profile : this.config.meleeDefaults;
    if (!element || element === 'physical') return cfg;
    const c = el(element);
    return { ...cfg, colors: { ...cfg.colors, core: c.core, sparks: c.dots } };
  }

  refreshFlames() {
    this.flames.setConfig(this.config.skills.firebolt);
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

  beginCast(e, element) {
    this.endCast();
    if (e.skill === 'hunter_shot') {
      const cfg = this.config.skills.hunter_shot, f = cfg.cast, mesh = arrowStreak(cfg);
      mesh.material.uniforms.uLength.value = f.length; mesh.material.uniforms.uWidth.value = f.width;
      mesh.material.uniforms.uOpacity.value = f.opacity; mesh.visible = false; this.scene.add(mesh);
      this.castArrow = { mesh, t: 0, dur: e.total, weapon: e.weapon }; return;
    }
    if (e.skill !== 'firebolt' || element !== 'fire') return;
    const mesh = flameMesh(this.config.skills.firebolt, 1);
    mesh.material.uniforms.uWidth.value = this.config.skills.firebolt.cast.size;
    mesh.material.uniforms.uGlowRadius.value = this.config.skills.firebolt.cast.glowRadius;
    // Hidden until updateCast supplies an actual source rig (event x/z is the target).
    mesh.visible = false;
    this.scene.add(mesh);
    this.castFlame = { mesh, t: 0, dur: e.total, weapon: e.weapon };
  }

  endCast() {
    if (this.castArrow) { disposeObject(this.castArrow.mesh); this.castArrow = null; }
    if (!this.castFlame) return;
    disposeObject(this.castFlame.mesh);
    this.castFlame = null;
  }

  updateCast(dt, rig, cancelled = false) {
    const a = this.castArrow;
    if (a) {
      a.t += dt;
      if (cancelled || !rig || a.t >= a.dur) this.endCast();
      else {
        const w = rig.bones?.weapon;
        if (w && a.weapon !== 'none') { w.updateWorldMatrix(true, false); w.getWorldPosition(_p0); w.getWorldDirection(_dir); }
        else { rig.root.getWorldPosition(_p0); _p0.y += 1.2; _dir.set(Math.sin(rig.root.rotation.y), 0, Math.cos(rig.root.rotation.y)); }
        a.mesh.position.copy(_p0); a.mesh.rotation.y = Math.atan2(_dir.x, _dir.z); a.mesh.visible = true;
        const f = this.config.skills.hunter_shot.cast, u = a.mesh.material.uniforms, k = a.t / a.dur;
        u.uLength.value = f.length * (.2 + .8 * k); u.uOpacity.value = f.opacity * k; u.uT.value = a.t;
      }
    }
    const c = this.castFlame;
    if (!c) return;
    c.t += dt;
    if (cancelled || !rig || c.t >= c.dur) { this.endCast(); return; }
    const w = rig.bones?.weapon;
    if (w && c.weapon !== 'none') {
      w.updateWorldMatrix(true, false);
      w.getWorldPosition(_p0); w.getWorldDirection(_dir);
      _p0.addScaledVector(_dir, this.config.weapons[c.weapon]?.tip ?? 0.25);
    } else {
      rig.root.getWorldPosition(_p0);
      _p0.y += 1.2;
      _p0.x += Math.sin(rig.root.rotation.y) * 0.45;
      _p0.z += Math.cos(rig.root.rotation.y) * 0.45;
    }
    c.mesh.position.copy(_p0); c.mesh.visible = true;
    const u = c.mesh.material.uniforms, k = c.t / c.dur;
    u.uTime.value = c.t; u.uScale.value = 0.25 + 0.75 * k * k;
  }

  fireImpact(e) {
    const cfg = this.config.skills.firebolt, f = cfg.impact;
    const y = this.gy(e.x, e.z) + (e.y ?? 1.0);
    const flash = flameMesh(cfg, 2);
    flash.position.set(e.x, y, e.z);
    flash.material.uniforms.uWidth.value = f.size;
    flash.material.uniforms.uGlowRadius.value = f.glowRadius;
    flash.material.uniforms.uSeed.value = Math.random() * 17;
    if (Number.isFinite(e.vx) && Number.isFinite(e.vz)) flash.material.uniforms.uVelocity.value.set(e.vx, 0, e.vz);
    // Reuse the nearest last-rendered Firebolt direction; core events stay unchanged.
    let nearest = Infinity;
    for (const v of this.projectiles.values()) {
      const u = v.children[0]?.material?.uniforms;
      if (!u?.uVelocity) continue;
      const dx = v.position.x - e.x, dz = v.position.z - e.z;
      const distance = dx * dx + dz * dz;
      if (distance < nearest) {
        nearest = distance;
        flash.material.uniforms.uVelocity.value.copy(u.uVelocity.value);
      }
    }
    const direction = flash.material.uniforms.uVelocity.value;
    const speed = Math.hypot(direction.x, direction.z) || 1;
    const forwardX = direction.x / speed, forwardZ = direction.z / speed;
    this.spawn(flash, f.flashLife, (k) => {
      const u = flash.material.uniforms;
      u.uTime.value = k * f.flashLife;
      u.uProgress.value = k;
      u.uScale.value = 1;
      u.uAlpha.value = 1 - k;
    });
    for (let i = 0; i < f.wisps + f.embers; i++) {
      const wisp = i < f.wisps, a = i * 2.39996;
      const r = wisp ? f.wispSpeed : f.emberSpeed;
      const lateral = Math.sin(a) * r * 0.7;
      const forward = (0.2 + Math.cos(a) * 0.55) * r;
      this.flames.emit(e.x, y, e.z,
        forwardX * forward - forwardZ * lateral, 0.3 + (1 + Math.sin(a * 1.7)) * r * 0.25,
        forwardZ * forward + forwardX * lateral,
        wisp ? f.wispSize : f.emberSize, wisp ? f.wispLife : f.emberLife,
        wisp ? 0 : 1, i * 0.618 % 1);
    }
    this.shake = Math.max(this.shake, f.shake);
  }

  /**
   * A melee skill starts swinging. The blade trail only records the strike itself (the wind-up is
   * as fast as the cut, so timing, not speed alone, tells them apart): from half way to the hit
   * until just after it, or for a spin from its start to its end.
   */
  beginSwing(e, element) {
    const cfg = this.config.weapons[e.weapon] || this.config.weapons.none;
    const look = this.meleePalette(e.skill, element);
    const spin = e.kind === 'melee_nova';
    this.swingCfg = cfg;
    this.swingDelay = (spin ? look.cast.trailStart * .65 : look.cast.trailStart) * e.total;
    this.swingLeft = spin ? e.total * .7 + .5 : e.total - this.swingDelay + look.cast.trailEnd;
    this.trail.begin({ ...cfg, trailLife: look.swing.trailLife, trailOpacity: look.swing.trailOpacity, trailCoreWidth: look.swing.trailCoreWidth }, look.colors.body, look.colors.core);
    if (this.swingDelay <= 0) this.trail.start();
  }

  endSwing(clear = false) {
    this.swingDelay = this.swingLeft = 0; this.swingCfg = null;
    if (clear) this.trail.clear(); else this.trail.end();
  }

  /** Per frame, after the hero's pose is set: record the weapon's base and tip in world space. */
  updateTrail(dt, rig, cancelled = false) {
    if (cancelled) this.endSwing();
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
    const cfg = this.meleePalette(e.skill || 'slash', e.element), f = cfg.swing;
    const arc = (e.arc * Math.PI) / 180;
    const cut = cutRibbon(cfg, e.range, arc, e.step === 1, e.finisher);
    cut.position.set(e.x, this.gy(e.x, e.z) + f.height, e.z); cut.rotation.y = e.angle;
    this.spawn(cut, f.life, (t) => (cut.material.uniforms.uT.value = t));
    if (f.zoneOpacity > 0) {
      const fill = this.decal(sectorGeometry(0, e.range, arc, 24), additive(cfg.colors.body, f.zoneOpacity), e.x, e.z, 1, e.angle, .06);
      this.spawn(fill, f.life, (t) => (fill.material.opacity = f.zoneOpacity * (1-t)*(1-t)));
    }
  }

  whirl(e) {
    const cfg = this.meleePalette(e.skill || 'whirl_blade', e.element);
    // Two travelling half cuts rather than an expanding explosion/ring.
    for (let i=0;i<2;i++) {
      const m=cutRibbon(cfg,e.radius,(cfg.swing.arc ?? 205)*Math.PI/180,i===1);
      m.position.set(e.x,this.gy(e.x,e.z)+cfg.swing.height,e.z);
      m.rotation.y=e.angle+i*Math.PI;
      this.spawn(m,cfg.swing.life,(t)=>{m.material.uniforms.uT.value=t;m.rotation.y=e.angle+i*Math.PI+t*(cfg.swing.turn ?? 1.65);});
    }
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
    const base = this.config.monsters[e.name];
    if (!base) return this.genericSwing(e);
    const f = { ...base, ...(this.config.overrides[`${e.type}.${e.name}`] || {}) };
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
    if (e.kind === 'firebolt' && e.element === 'fire') return this.fireImpact(e);
    if (e.kind === 'hunter_shot') {
      const cfg = this.contactLook(e.kind, e.element);
      this.contacts.burst({ ...e, fromX: e.x - (e.vx ?? 1), fromZ: e.z - (e.vz ?? 0) }, cfg, this.gy(e.x, e.z) + (e.y ?? 1));
      this.shake = Math.max(this.shake, cfg.impact.shake);
      return;
    }
    const c = el(e.element);
    const y = this.gy(e.x, e.z) + (e.y ?? 1.0);
    const f = this.genericLook(e.kind).impact;
    this.fx.burst(e.x, y, e.z, f.particles, { color: c.dots, size: f.particleSize, speed: f.particleSpeed, life: f.particleLife, up: f.up });
    const s = this.sprite(c.glow, f.size, f.opacity);
    s.position.set(e.x, y, e.z);
    this.spawn(s, f.life, (t) => {
      s.material.opacity = f.opacity * (1 - t);
      s.scale.setScalar(f.size * (f.growth + t * f.growth));
    });
  }

  hitSpark(e, height = 0.9) {
    const c = el(e.element);
    const y = this.gy(e.x, e.z);
    if (e.dot) {
      this.fx.add(e.x + (Math.random() - 0.5) * 0.6, y + 0.6, e.z + (Math.random() - 0.5) * 0.6, 0, 1.4, 0, { color: c.dots, size: 0.22, life: 0.5 });
      return;
    }
    // The arrow's impact event draws its contact once, including obstacle hits.
    if (e.skill === 'hunter_shot') {
      if (e.shell) this.fx.burst(e.x, y + 1, e.z, 4, { color: 0xd8f0a0, size: .16, speed: 2, life: .2 });
      return;
    }
    if (e.element === 'physical' || e.attackKind === 'melee_arc' || e.attackKind === 'melee_nova') {
      this.contacts.burst(e, this.contactLook(e.skill, e.element), y + height);
      if (e.shell) this.fx.burst(e.x, y + 1, e.z, 4, { color: 0xd8f0a0, size: .16, speed: 2, life: .2 });
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
    const cfg = this.config.skills.stone_burst, f = cfg.burst;
    const cold = e.element === 'cold', group = new THREE.Group();
    const mat = toon(cold ? '#bfe9ff' : cfg.colors.rock);
    for (let i = 0; i < f.rocks; i++) {
      const a = i * 2.39996, r = i === 0 ? 0 : e.radius * f.spread * (.55 + .4 * Math.random());
      const h = f.height * (i === 0 ? 1.1 : .55 + Math.random() * .4) * (e.echo ? .8 : 1);
      const x = e.x + Math.sin(a) * r, z = e.z + Math.cos(a) * r;
      const stone = new THREE.Mesh(rockGeometry(), mat);
      stone.scale.set(f.rockWidth * (1 + Math.random() * .4), h * .5, f.rockWidth * .85);
      stone.rotation.set(Math.cos(a) * .18, a, -Math.sin(a) * .18);
      stone.position.set(x, 0, z); stone.userData.height = h; stone.userData.base = this.gy(x, z);
      stone.castShadow = true; group.add(stone);
    }
    this.spawn(group, f.life, t => {
      const elapsed = t * f.life;
      let up = 1 - Math.pow(1 - Math.min(1, elapsed / f.rise), 3);
      if (elapsed > f.hold) { const k = Math.max(0, (f.life - elapsed) / Math.max(.01, f.life - f.hold)); up *= k * k * (3 - 2 * k); }
      for (const stone of group.children) stone.position.y = stone.userData.base + (up - .5) * stone.userData.height;
    });
    const crack = groundCracks(cfg, e.radius, this.world, e.x, e.z);
    this.spawn(crack, .45, t => { crack.material.uniforms.uProgress.value = 1; crack.material.uniforms.uOpacity.value = cfg.cast.opacity * (1 - t); });
    this.chips.burst(e, cold ? { ...cfg, colors: { ...cfg.colors, debris: '#dff4ff' } } : cfg, this.gy(e.x, e.z));
    this.dust.burst(e.x, this.gy(e.x, e.z) + .15, e.z, f.dust, { color: cold ? '#e6f6ff' : cfg.colors.debris, size: f.dustSize, sizeEnd: f.dustSize * 1.4, speed: 1.6, life: f.dustLife, up: .3, drag: 5 });
    this.shake = Math.max(this.shake, cfg.impact.shake);
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
    const cfg = this.config.skills.spirit_wolf, f = cfg.cast;
    const look = { colors: cfg.colors, swing: { ...f, tilt: 0, finisherWidth: 1 } };
    for (let i = 0; i < 2; i++) {
      const arc = cutRibbon(look, f.radius, Math.PI * 1.15, i === 1);
      arc.position.set(e.x, this.gy(e.x, e.z) + .06, e.z); arc.rotation.y = i * Math.PI;
      this.spawn(arc, f.life, t => { arc.material.uniforms.uT.value = t; arc.scale.setScalar(1 - t * .5); });
    }
    const options = { color: cfg.colors.body, size: f.particleSize, sizeEnd: .015, life: f.particleLife, drag: 2 };
    for (let i = 0; i < f.particles; i++) {
      const a = i / Math.max(1, f.particles) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      this.fx.add(e.x + dx * f.radius, this.gy(e.x, e.z) + .08, e.z + dz * f.radius, -dx, 1.8, -dz, options);
    }
  }

  bite(e) {
    const cfg = this.config.skills.spirit_wolf, f = cfg.attack;
    const look = { colors: cfg.colors, swing: f };
    const angle = Math.atan2(e.x - e.fromX, e.z - e.fromZ);
    for (let i = 0; i < 2; i++) {
      const cut = cutRibbon(look, f.radius, f.arc * Math.PI / 180, i === 1);
      cut.position.set(e.x, this.gy(e.x, e.z) + f.height, e.z); cut.rotation.y = angle + i * Math.PI;
      this.spawn(cut, f.life, t => { cut.material.uniforms.uT.value = t; cut.scale.setScalar(1 - t * .55); });
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
    const seen = this.seenProjectiles;
    seen.clear();
    for (const pr of game.projectiles) {
      seen.add(pr.id);
      let v = this.projectiles.get(pr.id);
      const element = pr.owner === 'player' ? pr.element : pr.element || (pr.kind === 'spit' ? 'poison' : 'arcane');
      const c = el(element);
      const arrow = pr.kind === 'hunter_shot';
      const fire = pr.kind === 'firebolt' && element === 'fire';
      const look = this.genericLook(pr.kind).projectile;
      if (!v) {
        v = new THREE.Group();
        if (fire) {
          const m = flameMesh(this.config.skills.firebolt);
          m.material.uniforms.uSeed.value = pr.id * 0.73;
          v.add(m);
          v.userData.trail = 0;
        } else if (arrow) {
          const ag = arrowGeometry();
          const cfg = this.config.skills.hunter_shot;
          const shaft = new THREE.Mesh(ag.shaft, toon(cfg.colors.shaft));
          const tip = new THREE.Mesh(ag.tip, toon(cfg.colors.tip));
          const fl = new THREE.Mesh(ag.fletch, toon(cfg.colors.fletch));
          v.add(shaft, tip, fl);
          v.add(arrowStreak(element === 'physical' ? cfg : { ...cfg, colors: { ...cfg.colors, trail: c.glow, core: c.core } }));
        } else {
          const size = pr.owner === 'player' ? 0.9 : 0.8;
          v.add(this.sprite(c.glow, size * 1.8 * look.glowScale, 0.85 * look.glowOpacity));
          v.add(this.sprite(c.core, size * 0.8, 1));
        }
        this.scene.add(v);
        this.projectiles.set(pr.id, v);
      }
      const y = this.gy(pr.x, pr.z) + (pr.y ?? 1);
      v.position.set(pr.x, y, pr.z);
      if (fire) {
        const u = v.children[0].material.uniforms, cfg = this.config.skills.firebolt.projectile;
        u.uTime.value = time;
        u.uVelocity.value.set(pr.vx, 0, pr.vz);
        v.userData.trail += dt * cfg.trailRate;
        const speed = Math.hypot(pr.vx, pr.vz) || 1;
        const bx = -pr.vx / speed, bz = -pr.vz / speed;
        while (v.userData.trail >= 1) {
          v.userData.trail--;
          const off = cfg.trailOffset[0] + Math.random() * (cfg.trailOffset[1] - cfg.trailOffset[0]);
          this.flames.emit(pr.x + bx * off, y + (Math.random() - 0.5) * cfg.trailSpread,
            pr.z + bz * off, bx * cfg.trailDrift, 0.15, bz * cfg.trailDrift,
            cfg.trailSize, cfg.trailLife, 0, Math.random());
        }
        continue;
      }
      v.scale.setScalar(look.scale);
      if (arrow) {
        v.rotation.y = Math.atan2(pr.vx, pr.vz);
        v.children[3].material.uniforms.uT.value = time;
        continue;
      }
      else v.children[1].scale.setScalar(0.7 + Math.sin(time * 30 + pr.id) * 0.08);
      const back = { x: -pr.vx / pr.speed, z: -pr.vz / pr.speed };
      for (let k = 0; k < (arrow ? 1 : 2); k++) {
        const o = Math.random() * 0.35;
        this.fx.add(pr.x + back.x * o, y + (Math.random() - 0.5) * 0.12, pr.z + back.z * o, back.x * look.trailSpeed, 0.3, back.z * look.trailSpeed, { color: c.dots, size: (arrow ? 0.18 : 0.32) * look.trailScale, sizeEnd: 0.05 * look.trailScale, life: look.trailLife, drag: 4 });
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
    if (a.kind === 'stone_burst') {
      const cfg = this.config.skills.stone_burst, group = new THREE.Group();
      const crack = groundCracks(cfg, a.radius, this.world, a.x, a.z);
      const boundary = this.decal(this.ringGeo, new THREE.MeshBasicMaterial({ color: cfg.colors.debris, transparent: true, depthWrite: false, opacity: cfg.cast.boundaryOpacity, side: THREE.DoubleSide }), a.x, a.z, a.radius, 0, .025);
      group.add(crack, boundary);
      return { obj: group, update: ar => {
        group.visible = ar.t < ar.delay;
        const k = Math.min(1, ar.t / Math.max(.01, ar.delay));
        crack.material.uniforms.uProgress.value = k;
        boundary.material.opacity = cfg.cast.boundaryOpacity * (.7 + .3 * k);
      } };
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
    this.flames.update(dt);
    this.fx.update(dt);
    this.dust.update(dt);
    this.contacts.update(dt);
    this.chips.update(dt);
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
